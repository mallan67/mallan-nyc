# Live-Neon execution proof — `20260721180000_unified_media_identity`

**Date:** 2026-07-21
**Requirement:** "do not skip any test, make sure sql is right" / "all test should be
actual test, do not use half ass systems" — the PREPARED migration DDL must be proven
to execute on **real PostgreSQL matching production (Neon Postgres)**, not PGlite.

## Why not PGlite / local

- PGlite multiplexes a single connection and does not cover `CREATE INDEX CONCURRENTLY`'s
  multi-transaction / `indisready`→`indisvalid` build behavior — not production-equivalent.
- The bundled Windows PostgreSQL 18 cluster failed to start (`startup process terminated by
  exception 0xC0000142`, STATUS_DLL_INIT_FAILED) — an environment fault, not a SQL fault.

## What was done (real Neon Postgres, same engine as production)

A **disposable, isolated** throwaway Neon project (`nameless-hall-64316250`, personal
free org — separate from canonical `hidden-mountain` and stale `morning-bread`) was
created, the DDL executed, verified, and the project **deleted** immediately after.
No production resource was touched.

### 1. Seed — production-shaped `listing_media` (900 rows; 300 match the backlog predicate)
- 300 active + `media_url_original` set + `r2_key`/`media_url_cached` null → **eligible**
- 300 active but already mirrored (`r2_key` + `media_url_cached` set) → excluded
- 200 `status='deleted'` → excluded
- 100 `media_url_original IS NULL` → excluded

### 2. Migration DDL executed verbatim
```sql
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "source_revision" BIGINT;      -- OK
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "r2_object_key" TEXT;          -- OK
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "pending_removal_run" TEXT;    -- OK

-- run as a STANDALONE statement (NOT inside a transaction block):
CREATE INDEX CONCURRENTLY IF NOT EXISTS "listing_media_r2_backlog_idx"
  ON "listing_media" ("created_at", "id")
  WHERE "status" = 'active'
    AND "media_url_original" IS NOT NULL
    AND ("r2_key" IS NULL OR "media_url_cached" IS NULL);                            -- OK
```

### 3. Verification results (from the live DB)

**Columns** — all three present, all nullable:
| column_name | data_type | is_nullable |
|---|---|---|
| pending_removal_run | text | YES |
| r2_object_key | text | YES |
| source_revision | bigint | YES |

**Index** — `CREATE INDEX CONCURRENTLY` completed both build phases:
```
index_name : listing_media_r2_backlog_idx
is_ready   : true      -- indisready
is_valid   : true      -- indisvalid  (a failed concurrent build would leave this false)
index_def  : CREATE INDEX listing_media_r2_backlog_idx ON public.listing_media
             USING btree (created_at, id)
             WHERE ((status = 'active'::text) AND (media_url_original IS NOT NULL)
                    AND ((r2_key IS NULL) OR (media_url_cached IS NULL)))
```

**EXPLAIN** — the bounded backlog query uses the partial index as an Index-Only Scan,
ORDER BY satisfied by the index (no Sort node), LIMIT pushed down:
```
Limit  (cost=0.27..14.55 rows=100 width=16)
  ->  Index Only Scan using listing_media_r2_backlog_idx on listing_media
        (cost=0.27..79.23 rows=553 width=16)
```

**Predicate selectivity** — `count(*)` over the predicate returned exactly **300**, matching
the seeded eligible rows.

### 4. Cleanup
Throwaway project `nameless-hall-64316250` **deleted** ("Project deleted successfully").
No dirty state left behind.

## Conclusion
The prepared migration is valid PostgreSQL and executes correctly on real Neon Postgres:
additive-nullable columns apply instantly, and `CREATE INDEX CONCURRENTLY` builds a valid
(`indisvalid=true`) partial index that the planner uses for the bounded R2-backlog fetch.
Application to the canonical production DB remains an **activation-gated, Maya-approved**
step (NEON.md §5), performed manually before deploying code that reads these columns.
