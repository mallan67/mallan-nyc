-- MIGRATION 1 of 2 for broker delegated access.
-- NEON.md §4: one change per PR, ONE COLUMN PER COMMIT. This migration adds
-- `sessions.parent_session_id` and nothing else, so it has its own rollback
-- path independent of the `audit_events.actor_user_id` migration.
--
-- Nullable, per NEON.md §4 ("Add nullable column ... Never NOT NULL DEFAULT").
-- NULL is the ordinary, non-delegated session and is the overwhelming majority.
--
-- The value is the parent broker `sessions.id`. It is an ID, NEVER A TOKEN.
--
-- ON DELETE CASCADE is REQUIRED and ON DELETE SET NULL is FORBIDDEN:
-- SET NULL would clear this column when the parent broker session is deleted
-- and thereby SILENTLY CONVERT a delegated child into a genuine agent session
-- with no server-side trace that a delegation ever happened. Deleting or
-- expiring the parent must invalidate the child. NEON.md additionally forbids
-- "FK to a large existing table without ON DELETE behavior specified", so the
-- behaviour is declared explicitly either way.
--
-- CREATE INDEX is NOT CONCURRENTLY here: NEON.md forbids a non-concurrent
-- CREATE INDEX only on tables > 10K rows. `sessions` is a short-TTL table
-- pruned by cleanExpiredSessions(); the QA table measured 0 rows when this
-- migration was authored. Prisma Migrate wraps a migration file in a
-- transaction and CREATE INDEX CONCURRENTLY cannot run inside one, so before
-- the (separately authorized) Production apply, re-measure
-- `SELECT count(*) FROM sessions` and, if it exceeds 10K, create the index
-- manually with CONCURRENTLY first and then `migrate resolve --applied`.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "parent_session_id" TEXT;

-- CreateIndex
CREATE INDEX "sessions_parent_session_id_idx" ON "sessions"("parent_session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
