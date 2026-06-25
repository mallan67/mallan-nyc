-- Archive Eligibility Clock PR-1 (#415) — add the stable terminal-age column + index.
-- ADDITIVE ONLY: nullable ADD COLUMN (metadata-only, instant — no table rewrite) + a btree
-- index. No DROP, no NOT NULL, no type change, no data write. (migration-discipline: additive,
-- no @allow-destructive needed.) This migration is NOT applied to production by this PR;
-- applying it is a separate, gated step.
--
-- @rollout (PRODUCTION, Option B — same pattern as 20260624120000_p1_search_index_pack):
--   The ADD COLUMN is instant and safe to run normally. The index, on `listings` (~110k rows),
--   must NOT be created with a plain `CREATE INDEX` on prod (NEON.md §4 — write-blocking lock on
--   >10k-row tables). On production:
--     1) ALTER TABLE "listings" ADD COLUMN "terminal_since" TIMESTAMP(3);   -- instant
--     2) CREATE INDEX CONCURRENTLY "listings_terminal_since_idx" ON "listings" ("terminal_since");
--        -- run individually via psql (NOT `prisma migrate deploy`, NOT `prisma db execute --file`;
--        --  CONCURRENTLY cannot run inside a transaction), host-guarded to cold-waterfall,
--        --  in a low-traffic window.
--     3) Verify validity: SELECT i.indisvalid, i.indisready FROM pg_index i JOIN pg_class c
--        ON c.oid = i.indexrelid WHERE c.relname = 'listings_terminal_since_idx';
--        -- require indisvalid = t AND indisready = t. If invalid → do NOT resolve; drop the
--        --  invalid index concurrently, rebuild, re-verify.
--     4) Only then (separately approved): prisma migrate resolve --applied 20260625013000_add_terminal_since
--     5) Confirm: prisma migrate status clean.
--   Production verification note: after the index is valid, EXPLAIN the (future, PR-2) archive
--   predicate to confirm it uses listings_terminal_since_idx. Rollback trigger: invalid index →
--   drop the invalid index concurrently and rebuild.
--   CI note: pr-check uses bare `prisma db push` (ignores migration files); this plain SQL is for
--   fresh/small DBs (instant) — prod uses the CONCURRENTLY runbook above.

ALTER TABLE "listings" ADD COLUMN "terminal_since" TIMESTAMP(3);

CREATE INDEX "listings_terminal_since_idx" ON "listings" ("terminal_since");
