-- CreateEnum
CREATE TYPE "work_item_kind" AS ENUM ('epic', 'story', 'task', 'bug', 'subtask');

-- CreateEnum
CREATE TYPE "work_item_priority" AS ENUM ('lowest', 'low', 'medium', 'high', 'highest');

-- CreateEnum
CREATE TYPE "work_item_explanation_source" AS ENUM ('user_authored', 'ai_draft', 'user_edited');

-- CreateTable
CREATE TABLE "work_item" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "work_item_kind" NOT NULL,
    "key" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionMd" TEXT,
    "explanationMd" TEXT,
    "explanationSource" "work_item_explanation_source" NOT NULL DEFAULT 'user_authored',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" "work_item_priority" NOT NULL DEFAULT 'medium',
    "assigneeId" TEXT,
    "reporterId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "estimateMinutes" INTEGER,
    "position" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_item_projectId_parentId_position_idx" ON "work_item"("projectId", "parentId", "position");

-- CreateIndex
CREATE INDEX "work_item_projectId_status_idx" ON "work_item"("projectId", "status");

-- CreateIndex
CREATE INDEX "work_item_projectId_assigneeId_idx" ON "work_item"("projectId", "assigneeId");

-- CreateIndex
CREATE INDEX "work_item_workspaceId_idx" ON "work_item"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_projectId_key_key" ON "work_item"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_projectId_identifier_key" ON "work_item"("projectId", "identifier");

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item" ADD CONSTRAINT "work_item_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Structural-integrity triggers (appended from prisma/sql/work_item_triggers.sql)
-- See that file for the full rationale. Kept in sync by hand; the
-- standalone file is the readable reference, this copy is what runs.
-- ============================================================

-- Work-item structural-integrity triggers (Story 1.4 · Subtask 1.4.2)
-- ====================================================================
-- These three BEFORE triggers are the DB-layer source of truth for the
-- work_item tree's structural rules. The service layer (1.4.4) also checks
-- these before issuing the write for a friendlier error, but the database is
-- the backstop: a direct SQL write, a buggy service path, or a future code
-- path that forgets the check still cannot corrupt the tree.
--
-- Each rejection RAISEs SQLSTATE 23514 (check_violation) with a leading
-- message MARKER (WI_ILLEGAL_PARENT_TYPE / WI_SUBTASK_NEEDS_PARENT /
-- WI_DEPTH_LIMIT_EXCEEDED / WI_PARENT_CYCLE). workItemRepository's create /
-- update methods match on 23514 + the marker and translate to the typed
-- errors in lib/workItems/errors.ts, so the service layer never inspects
-- raw Postgres error codes (the 4-layer rule).
--
-- Column identifiers are camelCase (Prisma's default column naming — there
-- is no @map on the columns), so every reference is double-quoted; an
-- unquoted NEW.parentId would fold to NEW.parentid and silently miss.
--
-- Trigger FIRING ORDER (Postgres fires per-statement BEFORE-row triggers in
-- alphabetical order by trigger name). The trigger names are deliberately
-- chosen so they sort: cycle → depth → kind. This ordering is load-bearing
-- because a single illegal write often violates more than one axis, and the
-- FIRST trigger to RAISE wins:
--   * A cyclic re-parent (moving an ancestor under its own descendant) is
--     ALSO kind-illegal — the ancestor is a "bigger" kind than the
--     descendant, so the kind matrix would reject it too. We want the more
--     fundamental "this creates a cycle" error, so cycle fires before kind.
--     (A non-cyclic but kind-illegal re-parent still surfaces the kind error,
--     because the cycle trigger passes cleanly when there's no cycle.)
--   * Inserting any child under a depth-4 subtask is BOTH a depth violation
--     (5 levels) AND a kind violation (nothing may parent to a subtask).
--     depth fires before kind so the "too deep" error wins. (cycle does not
--     fire on INSERT — see below.)
-- Tests that target the kind-parent rule in isolation construct shallow,
-- acyclic fixtures so neither depth nor cycle trips first.
--
-- NOTE for Subtask 1.4.5 (RLS): these functions SELECT sibling rows from
-- work_item by id. When FORCE ROW LEVEL SECURITY lands on this table, the
-- trigger's internal lookups will be subject to the same workspace GUC
-- policy as the invoking statement. Within a single subtree every row shares
-- one workspaceId (the service enforces same-project parenting), so the
-- active app.workspace_id GUC will match — but 1.4.5 must verify this and,
-- if needed, mark these functions SECURITY DEFINER. Logged as a forward note
-- in PRODECT_FINDINGS.md.

-- 1. Kind-parent matrix ------------------------------------------------------
--    epic.parentId    IS NULL                       (epics are always roots)
--    story.parentId   ∈ {epic, NULL}                (top-level stories allowed)
--    task.parentId    ∈ {epic, story, NULL}
--    bug.parentId     ∈ {epic, story, task, NULL}
--    subtask.parentId ∈ {story, task, bug}          (subtask MUST have a parent)
CREATE OR REPLACE FUNCTION enforce_work_item_kind_parent()
RETURNS TRIGGER AS $$
DECLARE
  item_kind   text := NEW."kind"::text;
  parent_kind text;
BEGIN
  IF NEW."parentId" IS NULL THEN
    -- A subtask is the only kind that may not be a root.
    IF item_kind = 'subtask' THEN
      RAISE EXCEPTION 'WI_SUBTASK_NEEDS_PARENT: a subtask must have a parent (story, task, or bug)'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- parentId is present from here on.
  IF item_kind = 'epic' THEN
    RAISE EXCEPTION 'WI_ILLEGAL_PARENT_TYPE: an epic must be top-level (parentId must be NULL)'
      USING ERRCODE = '23514';
  END IF;

  SELECT w."kind"::text INTO parent_kind FROM "work_item" w WHERE w."id" = NEW."parentId";

  -- Parent row missing: defer to the foreign-key constraint for a clear
  -- error rather than masking it with a parent-type rejection.
  IF parent_kind IS NULL THEN
    RETURN NEW;
  END IF;

  IF item_kind = 'story' AND parent_kind NOT IN ('epic') THEN
    RAISE EXCEPTION 'WI_ILLEGAL_PARENT_TYPE: a story may only be parented to an epic (got %)', parent_kind
      USING ERRCODE = '23514';
  ELSIF item_kind = 'task' AND parent_kind NOT IN ('epic', 'story') THEN
    RAISE EXCEPTION 'WI_ILLEGAL_PARENT_TYPE: a task may only be parented to an epic or story (got %)', parent_kind
      USING ERRCODE = '23514';
  ELSIF item_kind = 'bug' AND parent_kind NOT IN ('epic', 'story', 'task') THEN
    RAISE EXCEPTION 'WI_ILLEGAL_PARENT_TYPE: a bug may only be parented to an epic, story, or task (got %)', parent_kind
      USING ERRCODE = '23514';
  ELSIF item_kind = 'subtask' AND parent_kind NOT IN ('story', 'task', 'bug') THEN
    RAISE EXCEPTION 'WI_ILLEGAL_PARENT_TYPE: a subtask may only be parented to a story, task, or bug (got %)', parent_kind
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Depth limit -------------------------------------------------------------
--    Walks UP the parent chain (rooted at the nearest ancestor whose parentId
--    IS NULL) via a recursive CTE and rejects when the row's resulting depth
--    would exceed 4 levels. The deepest legal chain is 4: epic → story → task
--    → subtask (or epic → story → bug → subtask). The walk is bounded by the
--    legal depth, with a hard lvl guard as a belt-and-suspenders cycle stop
--    (the no-cycle trigger keeps the existing tree acyclic, so the guard is
--    never actually hit in practice).
CREATE OR REPLACE FUNCTION enforce_work_item_depth_limit()
RETURNS TRIGGER AS $$
DECLARE
  ancestor_depth int;
BEGIN
  -- A root (no parent) is depth 1 — always within the limit.
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE chain AS (
    SELECT w."id", w."parentId", 1 AS lvl
      FROM "work_item" w
      WHERE w."id" = NEW."parentId"
    UNION ALL
    SELECT w."id", w."parentId", c.lvl + 1
      FROM "work_item" w
      JOIN chain c ON w."id" = c."parentId"
      WHERE c.lvl < 100
  )
  SELECT max(lvl) INTO ancestor_depth FROM chain;

  -- Parent missing: defer to the FK constraint.
  IF ancestor_depth IS NULL THEN
    RETURN NEW;
  END IF;

  IF ancestor_depth + 1 > 4 THEN
    RAISE EXCEPTION 'WI_DEPTH_LIMIT_EXCEEDED: work item depth % exceeds the limit of 4', ancestor_depth + 1
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Cycle prevention --------------------------------------------------------
--    On UPDATE of parentId, walks UP from the new parentId; if the chain
--    reaches the row being updated, the re-parent would create a cycle and is
--    rejected. Also rejects a direct self-parent (parentId = id).
CREATE OR REPLACE FUNCTION enforce_work_item_no_cycle()
RETURNS TRIGGER AS $$
DECLARE
  creates_cycle boolean;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."parentId" = NEW."id" THEN
    RAISE EXCEPTION 'WI_PARENT_CYCLE: a work item cannot be its own parent'
      USING ERRCODE = '23514';
  END IF;

  WITH RECURSIVE chain AS (
    SELECT w."id", w."parentId", 1 AS lvl
      FROM "work_item" w
      WHERE w."id" = NEW."parentId"
    UNION ALL
    SELECT w."id", w."parentId", c.lvl + 1
      FROM "work_item" w
      JOIN chain c ON w."id" = c."parentId"
      WHERE c.lvl < 1000
  )
  SELECT EXISTS (SELECT 1 FROM chain WHERE "id" = NEW."id") INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'WI_PARENT_CYCLE: re-parenting % under % would create a cycle', NEW."id", NEW."parentId"
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers -------------------------------------------------------------------
-- Names sort cycle → depth → kind (see FIRING ORDER note above). kind + depth
-- fire on INSERT and on UPDATE of parentId/kind; cycle only matters on a
-- re-parent (a fresh INSERT cannot point at a row that points back at it), so
-- it fires on UPDATE of parentId only.
CREATE TRIGGER trg_work_item_cycle
  BEFORE UPDATE OF "parentId" ON "work_item"
  FOR EACH ROW EXECUTE FUNCTION enforce_work_item_no_cycle();

CREATE TRIGGER trg_work_item_depth
  BEFORE INSERT OR UPDATE OF "parentId", "kind" ON "work_item"
  FOR EACH ROW EXECUTE FUNCTION enforce_work_item_depth_limit();

CREATE TRIGGER trg_work_item_kind
  BEFORE INSERT OR UPDATE OF "parentId", "kind" ON "work_item"
  FOR EACH ROW EXECUTE FUNCTION enforce_work_item_kind_parent();
