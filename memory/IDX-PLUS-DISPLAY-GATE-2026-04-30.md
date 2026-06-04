# IDX Plus Display-Gate Incident & Recovery — 2026-04-30

> Self-contained capture of today's full session. Read before resuming PR 4 work.

## Three-layer model (clarified 2026-05-01 after RESO Desktop Client review)

This incident is specifically about the REBNY IDX Plus feed served via Cotality/Trestle. Three distinct layers must stay separate when reasoning about feed behavior:

| Layer | What it is | Role here |
|---|---|---|
| **REBNY** | MLS / RLS organization, data owner, policy layer | Owns the policy that pre-filters non-displayable rows out of the IDX Plus feed. RESO Desktop Client UOI: `T00000046` |
| **Cotality / Trestle** | API / feed platform implementing + serving the data | REBNY's data feed, served read-only via `api.cotality.com/trestle`. |
| **RESO** | The OData / field-naming model the feed exposes | Defines the Property entity type, field names, and enum values — the model the Cotality feed returns. Field truth = the live `$metadata`, not an external standard. |

**Why this matters for the bug:** the null-handling behavior below is **specific to REBNY's policy layer applied at Cotality's data-serving boundary**. It is NOT a universal property of all Trestle feeds. Other MLSes served via Cotality/Trestle could have different policy layers and different runtime behavior on the same RESO fields.

**Universal rule learned:** Runtime payload behavior must be verified per feed (REBNY+Cotality, OneKey+OneKey-platform, NY-State-MLS+their-platform, etc.) — not assumed from the RESO certification metadata alone. RESO certification tells you which fields the platform CAN expose; it does not tell you what each MLS's policy layer will populate at runtime.

## Status at session close

| Item | State |
|---|---|
| Mapper fix on `origin/main` | ✅ `0309875b` deployed Vercel-green |
| First recovery (7,545 rows) | ✅ DONE |
| §2.05 corrective (489 rows) | ✅ DONE |
| Audit-driven second recovery (49 rows) | ✅ DONE |
| Active suspicious gate-fail count | ✅ 0 (was 5,789 at peak) |
| Active public gate-pass | ✅ 100% (9,583/9,583 sale + 927/927 rental = 10,510/10,510) |
| Listing↔projection row parity | ✅ 20,075 = 20,075 / 0 missing |
| §2.05 violations | ⚠️ 1 transient (clears at next 3am UTC `data-retention` cron) |
| Public `/api/listings` total | ✅ ~10,515 (recovered) |
| Media PR 3 observation window | ✅ active; ends `2026-05-02T06:00:42-04:00` |
| PR 4 | 🔴 blocked until window clean + §2.05 = 0 |

## What happened (chronological)

1. **Read-only RESO live coverage probe** identified `InternetEntireListingDisplayYN` and `InternetAddressDisplayYN` as universally null in mallan.nyc's REBNY IDX Plus feed (via Cotality/Trestle) + not OData-filterable (HTTP 400 "Results from 'RLS' has been suppressed (provider Level)") → REBNY's policy layer pre-filters non-displayable rows out of the feed at Cotality's data-serving boundary. Behavior is REBNY-feed-specific, not universal Cotality behavior.
2. **Read-only DB-state investigation** confirmed 7,516 corrupted rows; commit `55803f87` (2026-04-23) had wrapped both fields in `affirmPermission()` which collapsed null → false on every Trestle-sourced row.
3. **Mapper fix** (commit `0309875b`) — `lib/idx/trestle-mapper.ts:662-663` reverted to `!== false` for the two pre-filtered fields. AVM/ConsumerComment kept fail-closed via `affirmPermission` (per-row opt-out). 18 writer-side gate-coercion tests added. 3 regression-guard checks added to `scripts/ci-compliance-check.js` (compliance-check 87 → 90).
4. **First recovery** — bounded transactional UPDATE flipped `internet_entire_listing_display_yn`, `internet_address_display_yn`, `idx_display_yn` from false → true on 7,545 rows in `listings` and 7,545 in `listing_search_projection` where `last_synced_from_trestle >= '2026-04-23' AND entire = false AND owner_opt_out = false AND participant_only = false`.
5. **§2.05 corrective** — first recovery's WHERE clause was over-broad: it flipped `idx_display_yn=true` on 489 terminal-status rows past 24h, creating fresh §2.05 violations. Bounded sub-update set `idx_display_yn=false` on those same 489 rows (same SQL the `data-retention` cron uses) on both surfaces.
6. **Push** of `0309875b` to `origin/main`.
7. **System weakness audit** ran the full validation matrix + 7 SQL probes + 5 public probes. Found 49 additional active corruptions where `last_synced_from_trestle >= '2026-04-30T20:59:00Z'` — i.e., the cron at 21:00 UTC ran on the OLD code 1m12s after the push, before Vercel's deploy completed.
8. **Second recovery** — bounded transactional UPDATE on those 49 rows. Both surfaces. Active gate-pass returned to 100%.

## Files changed (committed in `0309875b`)

| File | Change |
|---|---|
| `lib/idx/trestle-mapper.ts` | 2 lines + 24-line policy comment (writer-side asymmetry doc) |
| `lib/compliance/__tests__/compliance-gates.test.ts` | +18 tests under `describe('mapTrestleToPrisma — writer-side gate coercion')` |
| `scripts/ci-compliance-check.js` | +3 regression guards (lock the asymmetry) |
| `.idx-validate/history.json` + `public/crm/data/validator-results.json` | Auto-regenerated artifacts |

## Mapper change (the heart of the fix)

```diff
-  const internetEntireListing = affirmPermission(raw.InternetEntireListingDisplayYN);
-  const internetAddress = affirmPermission(raw.InternetAddressDisplayYN);
+  // IDX PLUS PRE-FILTER SEMANTICS — REBNY/Cotality pre-filter non-displayable
+  // rows out of the IDX Plus feed at the provider level. Field is null on the
+  // majority of records and HTTP 400 on any OData filter. Therefore null =
+  // upstream-already-gated-in = displayable. Only an explicit `false` (rare
+  // per-row override) means "do not display."
+  //
+  // Asymmetric vs InternetAutomatedValuationDisplayYN / InternetConsumerCommentYN
+  // below — those are per-row opt-out flags carried at row level (~97% true),
+  // and remain fail-CLOSED via `affirmPermission`.
+  const internetEntireListing = raw.InternetEntireListingDisplayYN !== false;
+  const internetAddress = raw.InternetAddressDisplayYN !== false;
```

Reader gates (`lib/idx/db-to-public-dto.ts`, `lib/search/listing-access-decision.ts`) intentionally **untouched** — strict `=== true` is the correct fail-closed posture for any null that lands in the DB. Defense-in-depth preserved.

## Recovery SQL (for the historical record)

### Recovery 1 — main flip back
```sql
BEGIN;
UPDATE listings
   SET internet_entire_listing_display_yn = true,
       internet_address_display_yn        = true,
       idx_display_yn                     = true
 WHERE last_synced_from_trestle >= '2026-04-23'
   AND internet_entire_listing_display_yn = false
   AND owner_opt_out = false
   AND participant_only = false;
-- 7,545 rows
UPDATE listing_search_projection lsp
   SET internet_entire_listing_display_yn = true,
       internet_address_display_yn        = true,
       idx_display_yn                     = true
  FROM listings l
 WHERE lsp.listing_id = l.listing_id
   AND l.last_synced_from_trestle >= '2026-04-23'
   AND lsp.internet_entire_listing_display_yn = false
   AND l.owner_opt_out = false
   AND l.participant_only = false;
-- 7,545 rows
COMMIT;
```

### Corrective — restore §2.05 on terminal+>24h
```sql
BEGIN;
UPDATE listings
   SET idx_display_yn = false
 WHERE status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')
   AND status_changed_at < (NOW() - INTERVAL '24 hours')
   AND idx_display_yn = true;
-- 489 rows
UPDATE listing_search_projection lsp
   SET idx_display_yn = false
  FROM listings l
 WHERE lsp.listing_id = l.listing_id
   AND l.status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')
   AND l.status_changed_at < (NOW() - INTERVAL '24 hours')
   AND lsp.idx_display_yn = true;
-- 489 rows
COMMIT;
```

### Recovery 2 — post-push sync race (49 rows)
```sql
BEGIN;
UPDATE listings
   SET internet_entire_listing_display_yn = true,
       internet_address_display_yn        = true,
       idx_display_yn                     = true
 WHERE last_synced_from_trestle >= '2026-04-30T20:59:00Z'
   AND status = 'Active'
   AND owner_opt_out = false
   AND participant_only = false
   AND (idx_display_yn = false
        OR internet_entire_listing_display_yn = false
        OR internet_address_display_yn = false);
-- 49 rows
UPDATE listing_search_projection lsp
   SET internet_entire_listing_display_yn = true,
       internet_address_display_yn        = true,
       idx_display_yn                     = true
  FROM listings l
 WHERE lsp.listing_id = l.listing_id
   AND l.last_synced_from_trestle >= '2026-04-30T20:59:00Z'
   AND l.status = 'Active'
   AND l.owner_opt_out = false
   AND l.participant_only = false
   AND (lsp.idx_display_yn = false
        OR lsp.internet_entire_listing_display_yn = false
        OR lsp.internet_address_display_yn = false);
-- 49 rows
COMMIT;
```

## Audit findings — open architectural work

### H1 — Projection dual-write gap on non-mapper writers (medium-risk)

`lib/idx/sync.ts` correctly upserts both `listings` and `listing_search_projection` (PR 5B dual-write). Other writers do NOT:

- `app/api/cron/data-retention/route.ts:87-90` — `prisma.listing.updateMany({ data: { idx_display_yn: false } })` does not mirror to projection
- `lib/idx/sync.ts:357,598,722,1007` — 4 `updateMany` sites that may need inspection
- `app/api/cron/dom-reset/route.ts`, `listing-expiration`, `feed-reconcile`, `crm/listings/[id]/status` — multiple `prisma.listing.update*` calls

**Symptom in DB right now:** 37 rows with `idx_drift = (l_idx=false, p_idx=true)` — these are legitimate terminal-retention drifts, NOT regressions. Each row is correctly suppressed by reader-side status gate (`DISPLAYABLE_STATUSES = ['Active','ComingSoon','ActiveUnderContract']` excludes terminal regardless of `idx_display_yn`).

**Recommended remediation:** introduce a `lib/listings/repository.ts` wrapper or a Postgres trigger that ensures every gate-column write to `listings` also writes the projection. Bigger than this incident; a future bounded PR.

### H2 — Deploy/cron race (high-risk pattern, demonstrated today)

A push during a sync window will silently corrupt that one cycle's worth of rows. Today's incident produced 49 corruptions in ~1 minute. There is no read-only signal that "the cron just ran the old code" — it has to be inferred from `last_synced_from_trestle` timestamps.

**Recommended remediation:** post-deploy verification that compares the gate-fail rate before/after. If there's a spike in the 5 minutes after a deploy, alarm. Could be Vercel deploy hook → Slack/email.

### H3 — Cron observability is patchy (medium-risk)

`audit_events` shows `idx_sync: 71 / 24h` against an expected ~120 (every 12 min × 24h). Either ~40% of cron runs don't write audit events, or ~40% silently skipped. `data_retention: 0 events / 24h` (last run was at the edge of the window).

**Recommended remediation:** cron heartbeat audit_event written unconditionally on every run; alert on <80% of expected.

### M1 — `saved_searches` is empty (informational)

Zero rows. `search_alerts_cron` runs daily with no work. Either lead-capture isn't wiring saved searches yet, or the workflow hasn't rolled out. Not a regression.

### M2 — Active listings without media (informational)

148/9,538 sale (1.5%) and 53/923 rental (5.7%) gate-pass listings have empty `media: []`. Frontend renders "No Photo" placeholders. PR 3's full media-sync at scale will reduce this; PR 4's batch rewrite consumes the result.

## Recommended permanent command — `npm run ops:system-audit`

User-requested. Implementation deferred until after PR 4 to avoid bundling. Spec inside the audit report (in conversation history). Shape:

```
[ops:system-audit] <timestamp>
  Feed                : pass/warn/fail
  Mapper              : pass/warn/fail
  DB invariants       : pass/warn/fail
  Projection          : pass/warn/fail
  Search parity       : pass/warn/fail
  Media               : pass/warn/fail
  Compliance          : pass/warn/fail
  Cron                : pass/warn/fail
  Frontend probes     : pass/warn/fail
  Release status      : pass/warn/fail
  VERDICT: pass/warn/fail
```

Single TS file, ~400 lines. 10 layer modules, each returns `{status, summary, details}`. Exits 0/1/2 for pass/warn/fail. `--json` flag.

## Closeout checklist (paste at or after `2026-05-02T06:00:42-04:00`)

```
Run final Media PR 3 observation closeout only.

Hard limits:
- Do not modify code.
- Do not start PR 4.
- Do not rewrite public media URLs.
- Do not touch /api/listings.
- Do not change schema.
- Do not print secrets.
- Do not push.

Run:
- git status --short --branch
- npm run ops:health
- npm run ops:r2-health
- npm run compliance-check
- npm run idx:validate
- npm run reso:analyze
- npm run ops:media-sync -- --limit=100 --batch=25

Also verify:
- public /api/listings returns 200
- public /api/listings total remains recovered
- REBNY §2.05 violations = 0
- projection missing rows = 0
- R2 health = green
- media dry-run failed = 0
- public media URLs were not rewritten

Report:
- current timestamp
- elapsed time since 2026-04-30T06:00:42-04:00
- whether the 48-hour observation window completed cleanly
- whether PR 4 is now eligible
- any blockers
- exact next recommendation

Do not implement PR 4.
```

## Cross-references

- `lib/idx/trestle-mapper.ts:662-663` — the actual mapper fix
- `lib/compliance/__tests__/compliance-gates.test.ts` — writer-side gate coercion tests
- `scripts/ci-compliance-check.js` — IDX Plus pre-filter regression guards
- `lib/idx/db-to-public-dto.ts:158-161` — reader-side gates (untouched, strict `=== true`)
- `lib/search/listing-access-decision.ts` — reader-side gates (untouched)
- `app/api/cron/data-retention/route.ts:77-107` — terminal-listing §2.05 enforcement (only writes `listings`, not projection — H1 gap)
- `lib/idx/sync.ts:170,205-207,832,846,251-264` — Trestle sync upsert sites (correctly dual-write)
- `memory/REFACTOR-2026-04-25.md` — master plan; PR 4 still NOT_STARTED
