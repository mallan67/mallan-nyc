# Inventory Reconciliation Audit — Trestle feed → mallan.nyc public — 2026-06-12

> **READ-ONLY audit.** No writes, no cleanup, no re-sync performed.
> DB: SELECT-only against canonical `ep-cold-waterfall-adno3ao2` (host-guarded, `default_transaction_read_only=on`).
> Trestle: GET-only against `api.cotality.com` (host-guarded). Public: HTTP GET `https://mallan.nyc` only.
> Probe scripts (untracked, DO NOT COMMIT): `scripts/__inventory-recon-2026-06-12-db.mjs`, `…-trestle.mjs`, `…-stale94.mjs`, `…-reconcile-history.mjs` (+ data dumps `…-local-ids.json`, `…-feed-ids.json`).
> Trigger: Maya — "there should be more than 10K listings" publicly.

## 0. Answer up front

**Public total today is 10,837 (9,840 sale + 997 rent) — it IS over 10K, and it is approximately CORRECT.**
The REBNY IDX Plus feed itself contains only **10,752** display-eligible listings (Active 10,748 + ComingSoon 4 + ActiveUnderContract 0). Nothing material is disappearing between feed and site. The site is in fact **over-displaying by a net +85** because of **94 ghost-Active listings** that are no longer in the feed at all (new defect, §6.1). The feed cannot support a public count meaningfully above ~10.7K: rentals are only 982 Active feed-wide, and the 6,429 Pendings are deliberately not searchable.

## 1. Trestle feed counts by status (`$count=true`, no paging — skip cap not in play)

Query form: `GET {base}/odata/Property?$filter=StandardStatus eq 'X'&$count=true&$top=1&$select=ListingId` (probe `__inventory-recon-2026-06-12-trestle.mjs` T1/T2, run 2026-06-12 ~18:30Z).

| StandardStatus | Feed count | sale (`PropertyType ne 'ResidentialLease'`) | rent (`eq 'ResidentialLease'`) |
|---|---|---|---|
| Active | **10,748** | 9,766 | 982 |
| ComingSoon | 4 | 4 | 0 |
| ActiveUnderContract | 0 | 0 | 0 |
| Pending | 6,429 | 6,092 | 337 |
| Closed | 572,016 | — | — |
| Expired / Withdrawn / Canceled | 0 / 0 / 0 | | |
| `UnderContract` | **not an enum member** — HTTP 400 "not a valid enumeration type constant" | | |

sale/rent split matches the sync classifier `lib/idx/fetch.ts:384-388`. No truncation: counts are server-side `@odata.count`; ID dumps (§5) used ListingId-keyset pagination (`$orderby=ListingId` + `ListingId gt 'cursor'`, `$top=1000`), never `$skip`, so the 25K skip cap was not hit. Closed IDs were NOT dumped (572K — count only, honestly noted).

## 2. Local `listings` counts (probe `…-db.mjs`, all SQL inline in the script)

**Total rows: 107,593** + `listings_archive`: 34 (all Closed) — Q10/Q3.

By status × type (Q1): Active 10,835 (9,838 sale / 997 rent) · ComingSoon 2 (sale) · Pending 5,206 (4,918 s / 288 r) · Withdrawn 2,686 · Closed 88,864. By id-prefix (Q9b): all RLS-sourced except 4 CRM-authored rows (1 Active, 3 Withdrawn).

`sync_status` breakdown (Q2):

| sync_status | n | note |
|---|---|---|
| `gated:Closed listing > 24 hours` | 87,520 | terminal retention gate — by design |
| `synced` | 19,395 | |
| `gated:Internet display disabled` | 588 | (116 of them status=Active — these are the idx-gate-suppressed rows; only 1 Active row currently fails the SQL gate columns, see Q5 — the other 115 have since re-synced or are non-allowed statuses; Q2b splits: Active 116, Closed 201, Pending 149, Withdrawn 122) |
| `gated:undefined` | 52 | cosmetic defect — gate reason string lost (§6.3) |
| `archived` | 34 | matches listings_archive |
| `pending` | 4 | |

## 3. Public/search-eligible counts — REAL gate predicate replicated in SQL

Predicate per `lib/search/listing-access-decision.ts:15-20` (`SEARCH_DISPLAY_GATE`) + `lib/compliance/status.ts:187-191` (`ACTIVE_DISPLAY_VALUES`): `status IN ('Active','ActiveUnderContract','ComingSoon') AND idx_display_yn AND NOT owner_opt_out AND NOT participant_only AND internet_entire_listing_display_yn` (Q4); and the exact `/api/listings` where-shape per `lib/search/public-listing-db.ts:177-191` which ORs in `rls_eligible=false AND list_price>0 AND address IS NOT NULL` (Q4b).

| | strict gate (Q4) | /api/listings replica (Q4b) |
|---|---|---|
| sale | 9,839 | **9,840** |
| rent | 997 | **997** |
| total | 10,836 | **10,837** |

Per-gate losses among the 10,837 allowed-status rows (Q5): `fail_idx_display=1, fail_owner_opt_out=0, fail_participant_only=0, fail_entire_listing=1, fail_any_gate=1, rls_ineligible=1` — i.e. **exactly one row is gate-blocked** (a CRM-authored row, `sync_status='pending'`, Q5b) and it re-enters via the `rls_eligible=false` OR-branch. REBNY pre-filters the feed, so gate columns block almost nothing locally.

## 4. Live `/api/listings` totals (HTTP GET, 2026-06-12)

- `https://mallan.nyc/api/listings?type=sale&limit=1` → `"total": 9840`
- `https://mallan.nyc/api/listings?type=rent&limit=1` → `"total": 997`
- `https://mallan.nyc/api/listings?limit=1` → `"total": 10837`

Matches the SQL replica exactly (10,837). Note (ledger S2): `total` is the Prisma count of the where-clause and **predates the in-memory post-filters** (ownershipTypes/yearBuilt/furnished/amenities/keywords, `applyPublicListingPostFilters`) — irrelevant here since no post-filter params were passed.

## 5. THE WATERFALL — feed → public, every loss/gain bucket quantified

ID-level diff: feed keyset dumps (T3: Active 10,748, CS 4, AUC 0, Pending 6,429 ids) vs local dump of all 107,589 RLS ids (Q11), diffed in T4.

| Step | Δ | Running total | Evidence |
|---|---|---|---|
| Feed display-eligible (Active+CS+AUC) | — | **10,752** | T1 `$count` |
| Feed-Active present locally with a DIFFERENT local status (sync lag; hidden from search) | −8 | 10,744 | T4 "present but local status differs=8" |
| ComingSoon never imported (orphan-eligibility set excludes CS — §6.2) | −2 | 10,742 | T4 missing: RLS20094894, RLS20094896 |
| Feed-Active missing locally entirely | **−0** | 10,742 | T4 "Active: missing locally entirely=0" — **no Active-side import gap exists** |
| Gate-blocked (idx/owner/participant/entire-listing) | −1 | 10,741 | Q5 fail_any_gate=1 |
| + same row re-admitted via `rls_eligible=false` OR-branch + CRM-authored Active | +2 | 10,743 | Q4 vs Q4b delta + Q9b non-RLS Active=1 |
| + **GHOST-Active: local Active, absent from the ENTIRE feed** (§6.1) | **+94** | **10,837** | T4 reverse-diff + `…-stale94.mjs` (direct `ListingId eq` probes: all 94 return 0 rows) |
| **= public /api/listings total** | | **10,837** | §4 live GET |

Buckets that turned out EMPTY: missing price (`list_price<=0`): **0**; empty address / no StreetName: **0** (Q7); `listing_type` anomalies: **0** — only sale/rent exist (Q8). Deliberate exclusions: **Pending 6,429** (status design; of which **1,360 are not in the DB at all** — the P1C6b backlog, was 1,361 at gate time, drain starts at 300/run now that #395 is on main); **Closed 572,016** (terminal; local keeps 88,864 recent + 34 archive). Duplicates: **79 same-unit duplicate pairs** among public rows (Q9 — same StreetNumber+StreetName+Unit+type, both shown; ~0.7% inflation, no dedupe at the API). Quality note: **8,140 of 10,836** public rows (75%) have empty `listings.media` JSON (Q7 — known media-pipeline backlog, P1 series; affects perceived inventory richness, not count).

## 6. Defects found (report-only — NO action taken)

### 6.1 NEW — 94 ghost-Active listings publicly displayed (net over-display +85)
94 local `status='Active', idx_display_yn=true` rows are absent from feed Active/CS/AUC/Pending **and** return zero rows on direct `ListingId eq` queries (`…-stale94.mjs`: `{"<absent-from-feed>": 94}`) — purged from the IDX Plus view entirely. All are public right now. Sample: RLS20030784, RLS20031072, RLS20031872, RLS20031890, RLS20032740, RLS20034483, RLS20039035, RLS20042194, RLS20042595, RLS20045182, RLS20045325, RLS20045637, RLS20049353, RLS20052013, RLS20052393 (full lists derivable from the two JSON dumps). Compliance exposure: advertising listings no longer available (UCBA/NY DOS surface).
Contributing causes (evidence in `…-reconcile-history.mjs`):
- **Today's feed-reconcile run (cron `30 3 * * *` UTC, vercel.json:11) produced ZERO audit events** — last `feed_reconcile_ghost_transition` 2026-06-11T07:30Z; normal cadence is 15–45 transitions/day (R1/R2/daily-counts query). Prime suspect: P1C6 (#394) was live with the orphan union (1,362 > ORPHAN_ABORT_CAP 500) → abort-all before the ghost loop (route order: orphan import 5a precedes ghost transition 5b at route.ts:476). P1C6b (#395, now main HEAD 9e50d9ad) removes that cap; next run should both drain orphans (300/run) and transition the ghost backlog. Needs runtime-log confirmation (Class D — not verified here).
- **5 of the 94 are RESURRECTIONS**: previously ghost-transitioned to Withdrawn with audit events (RLS20096060 06-07, RLS20081856 05-07, RLS20052393/RLS20031890/RLS20031872 05-02) and later flipped back to Active **with no audit event** — a non-audited writer (most likely idx-sync upsert from a record modified shortly before feed deletion) re-activates ghosts. This is a genuine loop-hole independent of the abort issue.
- Several ghosts show `updated_at` TODAY (after 07:30Z) with `last_synced_from_trestle` days old (R3) — rows are being touched by non-sync writers while feed-absent.

### 6.2 ComingSoon excluded from orphan catch-up
`ACTIVE_SEED_STATUSES = {Active, ActiveUnderContract, Pending}` (feed-reconcile route.ts:84-86) — ComingSoon is not in the orphan-eligibility union, so CS listings only arrive via the idx-sync incremental window. 2 of 4 feed-CS listings are missing locally (T4). Tiny today; structural gap.

### 6.3 `sync_status='gated:undefined'` (52 rows, all Closed)
Gate reason string lost somewhere in the gate-writer (`gated:${reason}` with `reason=undefined`). Cosmetic/diagnosability only.

### 6.4 Status-lag under-display (8 rows)
8 feed-Active listings carry a non-allowed local status (T4) — hidden from search until the next incremental touches them. Normal sync lag magnitude.

## 7. Verdict vs ">10K"

- **Correct expected public count given REBNY feed truth: ~10,742–10,752** (feed display-eligible 10,752, minus small sync lag). 
- **Current public count 10,837 is not low — it is ~+85 HIGH**, entirely explained by the 94 ghosts (offset by −8 lag, −2 CS). 
- The ">10K" intuition is satisfied, but barely, and the ceiling is the feed, not the pipeline: REBNY IDX Plus simply contains ~10.7K displayable listings today (rentals only 982). If the expectation was "well above 10K" (portal-scale), that inventory does not exist in this feed; Pending (6,429) and Closed (572K) are excluded by design.
- **The actionable finding is the opposite of the concern: over-display of 94 unavailable listings (§6.1) — recommend prioritizing after P1C6b's next cron run is verified, plus the un-audited resurrection writer.**

*All probes runnable by operator: `node scripts/__inventory-recon-2026-06-12-db.mjs` → `node scripts/__inventory-recon-2026-06-12-trestle.mjs` → `node scripts/__inventory-recon-2026-06-12-stale94.mjs` → `node scripts/__inventory-recon-2026-06-12-reconcile-history.mjs` (order matters: DB dump feeds the Trestle diff).*
