-- Down-migration for 20260530230912_add_work_items.
--
-- Prisma's migrate workflow is forward-only and does NOT read this file —
-- `prisma migrate deploy` applies migration.sql only. This file exists to
-- document (and let us verify in CI / by hand) that the migration is fully
-- reversible, per the Subtask acceptance criteria. Run it with
-- `psql "$DATABASE_URL" -f down.sql` to roll back a manual apply.
--
-- Order matters: triggers reference the table and functions; the table
-- references the enum types. Drop dependents before dependencies. DROP
-- TABLE ... CASCADE would carry the triggers + FK constraints with it, but
-- we drop the triggers and functions explicitly first so the reversal is
-- legible and leaves no orphaned functions behind.

DROP TRIGGER IF EXISTS trg_work_item_cycle ON "work_item";
DROP TRIGGER IF EXISTS trg_work_item_depth ON "work_item";
DROP TRIGGER IF EXISTS trg_work_item_kind ON "work_item";

DROP FUNCTION IF EXISTS enforce_work_item_no_cycle();
DROP FUNCTION IF EXISTS enforce_work_item_kind_parent();
DROP FUNCTION IF EXISTS enforce_work_item_depth_limit();

DROP TABLE IF EXISTS "work_item";

DROP TYPE IF EXISTS "work_item_explanation_source";
DROP TYPE IF EXISTS "work_item_priority";
DROP TYPE IF EXISTS "work_item_kind";
