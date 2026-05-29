-- Row-level security for the `project` table. This is the DB-layer half of
-- the defense-in-depth pair for project tenancy; the application-layer half
-- is the membership-assertion gate in projectsService (assertMembership +
-- assertProjectInWorkspace). The runtime side that sets the GUC the policy
-- reads is withWorkspaceContext (lib/workspaces/context.ts) — every
-- project-scoped service write now opens a transaction through that helper
-- so the GUC is bound before the policy is evaluated.
--
-- Policy shape mirrors the workspace migration (20260527134009_add_workspace_rls):
--   * ENABLE + FORCE so even the table-owner role is subject to the policy
--     (FORCE does NOT defeat BYPASSRLS on a superuser — production deploys
--     should connect as the prodect_app non-bypass role, finding #5).
--   * `current_setting('app.workspace_id', true)` — the `true` is missing_ok,
--     so an unset GUC yields NULL → policy predicate evaluates to NULL → row
--     hidden. That's the safe failure mode (no context → nothing visible).
--   * FOR ALL on a single policy: unlike the workspace table (where INSERT
--     ESTABLISHES tenancy and so the workspace_id GUC isn't set yet at
--     create-time), every project write happens INSIDE an already-active
--     workspace context. The workspace_id GUC is always set, so the same
--     predicate USING + WITH CHECK covers SELECT/INSERT/UPDATE/DELETE.
--   * WITH CHECK enforces the predicate on rows being INSERTed/UPDATEd, so a
--     compromised path can't insert a project into a different workspace
--     than the active one, nor reparent an existing project across
--     workspaces.
--
-- Grants: the workspace RLS migration's ALTER DEFAULT PRIVILEGES IN SCHEMA
-- public ... TO prodect_app makes every NEW table created by the same role
-- (`prodect`) auto-inheritably grantable. The `project` table was created
-- in 20260529130226_add_projects by that same role, so SELECT/INSERT/
-- UPDATE/DELETE are already in place for prodect_app — verified empirically
-- before writing this migration. No explicit GRANT needed here.

ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project" FORCE ROW LEVEL SECURITY;

-- A project row is visible/mutable only when it belongs to the currently-
-- active workspace. The membership-OR-active disjunction the workspace
-- table needs (for the switcher bootstrap path) isn't required here:
-- callers always enter a workspace context BEFORE touching projects, so
-- the active-workspace GUC is always the right key.
CREATE POLICY "project_active_workspace" ON "project"
  FOR ALL
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
