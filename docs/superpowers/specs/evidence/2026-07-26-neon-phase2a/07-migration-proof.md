# DB-1 — migration proof (ephemeral-branch test only; NOT applied to prod main)

> **Authorization:** Maya, 2026-07-26 — Option 4 boundaries. Ephemeral-branch proof only.
> **NOT authorized / NOT done:** `complete_database_migration`, apply to canonical main, any prod
> write, deploy, PR, cron, env/R2 mutation, hook bypass. This migration is **authored + branch-tested
> only**. Applying to `br-crimson-frog-adr7g9gt` (prod main) requires separate authorization.
> Every Neon MCP call used explicit `projectId` + `branchId` (no defaults).

## 1. Migration identity
- **File:** `prisma/migrations/20260726120000_add_listing_media_sync_state/migration.sql`
- **sha256:** `0bd17e2929358c78b62d1c68430e70b924f406bea6fa08fc3ac1e4099be2e3b1`
- **git blob:** `c5cf33d21ef5caccdbd253e339a8c79f2d967d66`
- **Class:** one NEW empty table + its sequence/PK/unique index/pending index/FK. No `ALTER`/`UPDATE`/
  `DELETE`/`DROP` on any existing table.
- **Prisma schema:** `prisma validate` → "The schema at prisma\schema.prisma is valid 🚀" (exit 0,
  with datasource env resolved); `prisma generate` → client generated OK.

## 2. Ephemeral branch
- **Project:** `hidden-mountain-87248164` (neon-green-school, canonical prod).
- **Ephemeral branch:** `br-super-sunset-adrkwzj8` (name `phase2a-db1-ephemeral-2026-07-26`),
  parent `br-crimson-frog-adr7g9gt`, `expiresAt=2026-07-26T20:00:00Z` (auto-delete safety).
- **Deleted after proof:** yes — see §8.

## 3. Pre-migration baseline (on the branch — faithful copy of prod)
`new_table_exists=0 · listings=23,686 · listing_media_total=318,628 · listing_media_active=289,956 ·
crm_media=64 · media_sync_state=1`. (The +2 vs the 2026-07-26 prod baseline of 318,626 is natural
live-feed drift between the two reads — the branch is copy-on-write at creation time.)

## 4. Apply (on the branch, `run_sql_transaction`, 4 DDL statements)
All four executed OK (CREATE TABLE · CREATE UNIQUE INDEX listing_id · CREATE INDEX pending_next_check_at
· ADD FK → listings ON DELETE CASCADE). Result: `[[],[],[],[]]` (no errors).

## 5. Structural verification (`describe_table_schema`)
17 columns, exact types (Prisma `DateTime`→`timestamp(3) without time zone`, `String`→text,
`Int`→integer, `BigInt`→bigint):
- `id bigint NOT NULL DEFAULT nextval(...)` · `listing_id text NOT NULL`
- checkpoint: `last_seen_photos_change_ts`, `last_complete_media_set_hash`, `last_reconciled_at`,
  `last_source_modification_ts` (all nullable)
- pending: `pending_candidate_set_hash`, `pending_candidate_media_count`, `pending_missing_media_count`,
  `pending_photos_change_timestamp`, `pending_source_modification_ts`, `pending_first_observed_at`,
  `pending_last_observation_run_id` (nullable), `pending_confirmation_count integer NOT NULL DEFAULT 0`,
  `pending_next_check_at` (nullable)
- `created_at ... DEFAULT CURRENT_TIMESTAMP NOT NULL` · `updated_at ... NOT NULL`
- **Indexes:** `_pkey` (id) · `_listing_id_key` UNIQUE(listing_id) · `_pending_next_check_at_idx`(pending_next_check_at)
- **Constraints:** PK(id) · FK(listing_id)→listings(listing_id) ON UPDATE CASCADE ON DELETE CASCADE

## 6. Schema diff (`compare_database_schema` branch vs parent)
Diff shows **ONLY additions**, all for `listing_media_sync_state`: the CREATE TABLE, its sequence +
DEFAULT nextval, the PK, the UNIQUE index, the `pending_next_check_at` index, and the FK. **No change
to any existing table** — zero-downtime, additive-only.

## 7. Row-count + functional + index-usage
- **Post-migration counts (branch):** `new_table_exists=1 · new_table_rows=0 · listings=23,686
  (unchanged) · listing_media_active=289,956 (unchanged) · crm_media=64 (unchanged) ·
  media_sync_state=1 (unchanged)` → zero existing-table data changes.
- **Functional (DO-block, exception-caught):** `valid_insert=OK · unique_constraint=enforced ·
  fk_constraint=enforced` (duplicate `listing_id` → unique_violation; bogus `listing_id` →
  foreign_key_violation).
- **Index usage:** seeded ~500 rows + ANALYZE, `SET LOCAL enable_seqscan=off`, EXPLAIN of the
  pending-lane query →
  `Index Scan using listing_media_sync_state_pending_next_check_at_idx ... Filter:
  ((pending_confirmation_count > 0) AND ((pending_next_check_at IS NULL) OR (pending_next_check_at <= now())))`.
  The pending lane is served by the index.

## 8. Cleanup + rollback
- **Ephemeral branch deleted** after proof (`delete_branch` `br-super-sunset-adrkwzj8`) — see the
  branch-lifecycle record below.
- **Prod-main rollback procedure** (for the future authorized apply): the table is new + empty, so
  rollback is `DROP TABLE "listing_media_sync_state";` (drops the dependent sequence/indexes/FK), or a
  Neon `history/snapshots` restore. No existing data is touched by apply or rollback.

## 9. Verdict
DB-1 (ephemeral-branch) — **PASS**. The migration creates exactly the intended table/columns/keys/
index/FK, touches no existing table, enforces unique+FK, and the pending index is usable.
**Apply-to-prod-main remains NOT done and requires separate Maya authorization.**
