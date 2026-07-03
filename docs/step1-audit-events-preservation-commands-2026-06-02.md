# Step 1 — audit_events preservation commands (royal-dawn → cold-waterfall) — 2026-06-02

> **Historical record.** Step 1 was EXECUTED on 2026-06-02 via the script
> `scripts/__step1-audit-preserve.mjs` (bulk) + `scripts/__step4-incremental-sweep.mjs` (3 sweeps),
> not the raw psql below — but the psql form documents the exact, reproducible procedure.
> Result: **46,437** royal-dawn `audit_events` (created after the cutover) copied into cold-waterfall,
> verified exported==imported. See `docs/incidents/2026-06-02-cross-project-db-repoint.md`.

## Design (why exact + safe)
- **`psql \copy` TEXT format** (not CSV): symmetric export/import, unambiguous NULLs (`\N`), jsonb/newlines
  escaped → 1 row = 1 line (so `wc -l` is a valid count check).
- **File-based** (export → verify file → import): a mid-stream failure can't half-import.
- **Exclude `id`** (B's sequence assigns new ones); **id-watermark** rollback (no natural key on `audit_events`).
- Boundary literal is **plain timestamp** `'2026-06-01 06:30:00'` (B's `created_at` is *without tz*, UTC) — no drift.
- `audit_events` schema (both projects, 9 cols): `id`(serial PK), `action`,`entity_type`,`entity_id`,`user_type`
  (NOT NULL), `user_id`,`changes`(jsonb),`ip_address`(nullable), `created_at`(NOT NULL). **No FKs** → safe to copy.

## Procedure
```bash
# A_CONN = royal-dawn (morning-bread) direct/unpooled ; B_CONN = cold-waterfall (hidden-mountain) direct/unpooled
# (get from each project's Neon Console -> Connect, or Vercel prod env reveal; never paste into chat)

# S1. fingerprint BOTH ends
psql "$A_CONN" -t -c "SELECT (SELECT count(*) FROM listings), EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='trestle_mls_id');"   # expect 34, false  (royal-dawn)
psql "$B_CONN" -t -c "SELECT (SELECT count(*) FROM listings), EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='trestle_mls_id');"   # expect 105697, true (cold-waterfall)

# S2. confirm source count + S3. capture rollback watermark
psql "$A_CONN" -t -c "SELECT count(*) FROM audit_events WHERE created_at > '2026-06-01 06:30:00';"   # the N to copy
psql "$B_CONN" -t -c "SELECT max(id) FROM audit_events;"   # record as MAXID_BEFORE

# export the tail (id excluded)
psql "$A_CONN" -c "\copy (SELECT action, entity_type, entity_id, user_type, user_id, changes, ip_address, created_at FROM audit_events WHERE created_at > '2026-06-01 06:30:00' ORDER BY id) TO 'audit_tail.txt'"
wc -l audit_tail.txt   # must equal N from S2, else STOP

# import (atomic COPY into B.audit_events)
psql "$B_CONN" -c "\copy audit_events (action, entity_type, entity_id, user_type, user_id, changes, ip_address, created_at) FROM 'audit_tail.txt'"
```

## Verify
```bash
psql "$B_CONN" -t -c "SELECT count(*) FROM audit_events WHERE id > MAXID_BEFORE;"   # must equal N
psql "$B_CONN" -t -c "SELECT min(created_at), max(created_at) FROM audit_events WHERE id > MAXID_BEFORE;"
```

## Rollback (exact — removes only the imported slice)
```bash
psql "$B_CONN" -c "DELETE FROM audit_events WHERE id > MAXID_BEFORE;"
```
Plus Neon 7-day PITR on cold-waterfall as the deeper backstop.

*Recorded 2026-06-02 (post-execution).*
