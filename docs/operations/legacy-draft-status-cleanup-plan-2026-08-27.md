# Legacy `Draft` market-status cleanup — PLAN ONLY, NOT EXECUTED

**Date:** 2026-08-27
**Branch:** `fix/auth-identity-domain-and-listing-continuity`
**Status:** **PREPARED AND NOT RUN.** No production row has been read or written by this plan.
**Authorization required before any step below runs:** Maya, explicitly, per
`docs/claude-instructions/CURRENT.md` ("Do not silently mass-update Production rows")
and `CLAUDE.md` §A.7.

---

## 1. What this would clean up, and why it is OPTIONAL

`listings.status` holds the Cotality market fact (`Property.StandardStatus`). Before the
2026-08-27 schema correction it was `TEXT NOT NULL DEFAULT 'Active'`, so a Mallan-authored
listing that had never been on the market still had to store *some* market status. Mallan
wrote `Draft` — a Mallan publication word, not a StandardStatus member.

After the correction the column is nullable with no default and `NULL` means exactly one
thing: **this listing has no market status yet**. Both create paths write `NULL`.

**The rows carrying `'Draft'` are not broken.** The no-backfill invariant is enforced in
code: a stored `Draft` and a `NULL` reach the same decision at every gate.

| Gate | How both spellings land in the same place |
|---|---|
| Public DTO (`filterDisplayableDbListings`) | ALLOW-list of `Active / ComingSoon / ActiveUnderContract`. Neither is a member. |
| `computeGateColumns` → `idx_display_yn` | `has_market_status` is false for `''`; `Draft` is non-terminal but is in no display allow-list downstream. |
| Open-house eligibility | `l.status == null` returns false; `Draft` is not in `OPEN_HOUSE_ELIGIBLE_STATUSES`. |
| Agent public page buckets | ALLOW-lists on both the active and closed sides. |
| Status transition machine | `STATUS_TRANSITIONS.Draft` and `NO_MARKET_STATUS_TRANSITIONS` are the same set (`Active`, `ComingSoon`). |
| CRM roster bucket + filter | One predicate, `_hasNoMarketStatus`, matches `!l.status || l.status === 'Draft'`. |
| CRM status badge | `status \|\| 'Draft'` — both render identically. |
| Retention / archive | `Draft` is not in `TERMINAL_STATUSES`; a `NULL` row is refused outright. |

Locked by `tests/runtime/market-status-is-nullable.test.ts` and
`tests/runtime/crm-roster-status-conformance.test.ts`.

**So this cleanup buys vocabulary hygiene, not correctness.** The reason to run it is that
the column stops carrying two spellings of one state, which removes the standing risk that a
future reader handles one and forgets the other. The reason NOT to run it is that every
mass update to `listings` is a real production risk for a benefit the code already delivers.

**Recommendation: do not run it now.** Revisit only if a future change makes the dual
spelling genuinely costly.

---

## 2. Eligibility predicate

A row is eligible **only** if every clause holds:

```sql
  status = 'Draft'          -- exact case. The normalizer folds case on read; the
                            -- column is not normalized, and a differently-cased
                            -- value is a DIFFERENT finding, not a target.
  AND mls_id IS NULL        -- Mallan authored this row. A provider-sourced row is
                            -- Cotality-owned and is never eligible, full stop.
  AND idx_display_yn = false     -- it is not publicly displayed right now
  AND status_changed_at IS NULL  -- it never transitioned; `Draft` is its birth state,
                                 -- not somewhere it was moved back to
```

`mls_id IS NULL` is the load-bearing clause. It is this repo's canonical shorthand for
"Mallan authored this row" (`lib/listings/mallan-source-identity.ts`), it is what the
publication owner-guard is scoped to, and `POST /api/crm/listings` refuses a
caller-supplied `mls_id` with `422 PROVIDER_IDENTITY_NOT_ASSIGNABLE` — so it cannot be
forged through the API.

### Deliberately NOT in scope

- Any row with `mls_id IS NOT NULL` — Cotality-owned.
- `Sold` / `Rented` / `Leased` — a different legacy write with a different correct target
  (`Closed`), and one that would need per-row listing-type reasoning. Separate plan.
- `Cancelled` (two Ls) — already folded at the read boundary; a rewrite is a separate
  decision.
- Any row whose `status_changed_at IS NOT NULL` — something moved it, and the history
  matters more than the tidiness.

---

## 3. Dry run — COUNT ONLY, no write

Run against the canonical production database
(`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main`).
Read-only; safe at any hour.

```sql
-- 3a. The eligible set.
SELECT count(*) AS eligible
FROM listings
WHERE status = 'Draft'
  AND mls_id IS NULL
  AND idx_display_yn = false
  AND status_changed_at IS NULL;

-- 3b. PROOF OBLIGATION: no Cotality-owned row can match. Must return 0.
SELECT count(*) AS cotality_owned_drafts
FROM listings
WHERE status = 'Draft'
  AND mls_id IS NOT NULL;

-- 3c. Rows that LOOK eligible but are excluded, and why. Reviewed by hand
--     before anything runs — a surprise here means the predicate is wrong.
SELECT
  count(*) FILTER (WHERE mls_id IS NOT NULL)            AS excluded_provider_owned,
  count(*) FILTER (WHERE idx_display_yn = true)         AS excluded_publicly_displayed,
  count(*) FILTER (WHERE status_changed_at IS NOT NULL) AS excluded_has_transitioned
FROM listings
WHERE status = 'Draft';

-- 3d. Case variants — a different finding, not a target. Expected 0.
SELECT status, count(*)
FROM listings
WHERE lower(btrim(status)) = 'draft' AND status <> 'Draft'
GROUP BY status;
```

**Gate:** 3b must be `0` and 3d must be empty. If either is not, STOP and report — the
predicate does not describe reality and nothing runs.

---

## 4. Before/after invariant

Captured immediately before and immediately after, in the same session:

```sql
-- I1. Total row count is unchanged (this is an UPDATE, never a DELETE).
SELECT count(*) FROM listings;

-- I2. No publicly displayable row is touched. Both sides must be equal.
SELECT count(*) FROM listings WHERE idx_display_yn = true;

-- I3. The "no market status" population is CONSERVED — rows move between two
--     spellings of one state, and the total may not change.
SELECT count(*) FROM listings
WHERE status IS NULL OR status = 'Draft';

-- I4. Every other status bucket is unchanged.
SELECT status, count(*) FROM listings
WHERE status IS NOT NULL AND status <> 'Draft'
GROUP BY status ORDER BY status;

-- I5. No Cotality-owned row's status changed.
SELECT status, count(*) FROM listings
WHERE mls_id IS NOT NULL GROUP BY status ORDER BY status;
```

I1, I2, I4 and I5 must be **byte-identical** before and after. I3 must be identical in
total while its `status IS NULL` share grows by exactly the 3a count.

---

## 5. The operation

Idempotent: re-running it is a no-op, because the predicate no longer matches anything it
already changed.

```sql
BEGIN;

-- Recovery set, captured INSIDE the transaction so it can never drift from what
-- is about to change. This table is the rollback path (§6); it is not temporary
-- and must not be dropped until Maya says the cleanup is settled.
CREATE TABLE IF NOT EXISTS listings_draft_status_cleanup_20260827 (
  id            bigint PRIMARY KEY,
  listing_id    text NOT NULL,
  previous_status text NOT NULL,
  captured_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO listings_draft_status_cleanup_20260827 (id, listing_id, previous_status)
SELECT id, listing_id, status
FROM listings
WHERE status = 'Draft'
  AND mls_id IS NULL
  AND idx_display_yn = false
  AND status_changed_at IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE listings
SET status = NULL
WHERE status = 'Draft'
  AND mls_id IS NULL
  AND idx_display_yn = false
  AND status_changed_at IS NULL;

-- Compare against the 3a dry-run count BEFORE committing. A mismatch means the
-- table changed under us: ROLLBACK and re-run the dry run.
COMMIT;
```

`modification_timestamp` is deliberately **not** stamped. It is the incremental-sync cursor
(`NEON.md`, `lib/idx/sync.ts`); touching it on rows Cotality does not own would still push
the cursor and cost a sync cycle for a change no provider made.

Batching is unnecessary: the predicate is narrow and the write is a single column set to
`NULL`. If 3a returns a number large enough to hold a long lock, batch by `id` ranges of
2,000 and re-check I2 between batches.

---

## 6. Rollback

Exact, row-for-row, from the recovery table:

```sql
BEGIN;
UPDATE listings l
SET status = c.previous_status
FROM listings_draft_status_cleanup_20260827 c
WHERE l.id = c.id
  AND l.status IS NULL;   -- only rows still in the state we left them in
COMMIT;
```

The `l.status IS NULL` clause is what makes the rollback safe to run late: a row someone
has since moved to a real market status is left alone rather than being dragged back to
`Draft`.

Application-side rollback is not required and would be wrong: the code handles both
spellings by design, so reverting the code is neither necessary nor sufficient.

---

## 7. Operational constraints (`NEON.md`)

- `listings` is one of the three tables under the **3–5 AM ET only** rule. This is an
  `UPDATE`, not a migration, and the same window applies for the same reason.
- Run manually from a machine holding the production `DATABASE_URL`. Not from a Vercel
  build, not from a cron, not via `prisma db push`.
- `npm run ops:health` first; confirm storage headroom and compute hours.
- Capture §4 before/after, §3 dry-run output, and the actual `UPDATE` row count into a
  dated evidence file under `docs/operations/`.

## 8. Why this has not been run

1. Maya has not authorized it. The schema authorization explicitly excludes broad backfills.
2. It is 09:xx ET — outside the 3–5 AM ET window for `listings`.
3. This worktree has no `DATABASE_URL`, so even the read-only dry run cannot be executed
   from here. The counts in §3 are queries to run, not results — no number in this document
   is a measurement.
