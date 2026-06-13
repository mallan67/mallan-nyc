# Neon Storage / Cost Audit — 2026-06-12

**Maya's framing:** "This is the most important billing check" — what keeps Neon above the free/cheap tier, and what can safely reduce it later.

**Status:** READ-ONLY. SELECT/pg_catalog only, against canonical prod (`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`), via untracked probe `scripts/__neon-cost-2026-06-12.mjs` (fail-closed host guard — refused any non-cold-waterfall host — plus `SET default_transaction_read_only = on`, pattern copied from `scripts/__media-diag-2026-06-10.mjs`). No VACUUM of any kind, no deletes, no migrations, no writes, no settings changes. Probe ran 2026-06-12T21:40Z (`db_now` in Q1).

**Baseline read first:** `docs/audits/r2-neon-cost-audit-2026-06-10.md` (prior cost audit, 2026-06-10), `NEON.md` (billing model: Launch plan $19/mo since 2026-05-17; Neon bills storage GB-months + compute CU-hours; keepalive/cron compute analysis is in the 06-10 audit §2.4 and unchanged here).

**DO NOT COMMIT this file without Maya approval.**

---

## 0. TL;DR

| Metric | Value | Source |
|---|---|---|
| Total DB size | **1,189,904,384 bytes = 1,135 MB** (was 1,086 MB on 06-10 → **+49 MB in 2 days**, almost all the media-table backfill drain) | Q1 |
| #1 size holder | `listings` **894 MB** (678 MB of it TOAST = the legacy JSON columns, 663 MB measured) | Q2, Q6a |
| #2 / #3 | `listing_media` **96 MB** (doubled from 49 MB on 06-10 — the C6/RC1 drain), `listing_search_projection` **71 MB**; then `audit_events` 51 MB | Q2 |
| #1 growth driver right now | `listing_media` backfill: **+48,650 rows on 06-12 alone** (~20 MB/day) — temporary, ends when the drain catches up | Q9c |
| #1 steady-state growth driver | `listings` itself: ~176 new listings/day × ~8.3 KB avg ≈ **~45 MB/month**, written every `idx-sync` (*/10) cycle | Q9d, Q1/Q4b |
| Reclaimable post-cleanup (all Maya-gated) | **~600–650 MB** (JSON drop + terminal archive + audit compaction + unused indexes) → projected ~480–530 MB residual | §10 |
| Free-tier verdict | **Not today** (1,135 MB vs 500 MB Free cap = 2.3×). Post-cleanup lands *borderline* at the 500 MB line; staying under requires the terminal-archive cadence to keep recycling ~45 MB/mo of new-listing growth. Launch $19/mo remains the realistic floor until the cleanup ships. | §10 |

What keeps Neon above the free tier, in one sentence: **663 MB of legacy JSON (`raw_data` + `compliance` + `features` + `agent_info` + `address`) on 107,610 listings rows — 91,571 of which (85%) are not even IDX-displayable** (Q6a, Q6b).

Neon-billing note: Neon bills *storage* (logical size + history/PITR) and *compute* (CU-hours). The history/PITR component is **not visible from SQL** — only the console shows it (Launch = 7-day PITR per NEON.md §2; high write churn like the current 48K-rows/day drain temporarily inflates history GB-months too). Compute analysis is unchanged from the 06-10 audit §2.4: ~73% duty cycle from the `idx-sync */10` + `media-sync */15` + `db-keepalive */15` cron lattice ≈ ~133 CU-hr/mo at 0.25 CU — inside both Launch (300) and Free (191.9) allowances; the console compute-size check from that audit is still the open item.

---

## 1. Total database size (Q1)

```sql
SELECT pg_database_size(current_database()) ...
-- bytes = 1,189,904,384 → 1,135 MB · db = neondb · 2026-06-12T21:40:16Z
```

History: 196 MB (2026-04-28, post slim-backfill) → 961 MB (05-18) → 1,086 MB (06-10) → **1,135 MB (06-12)**. The +49 MB/2-days spike is the media drain (§9), not the steady trend (~1.6 MB/day before the drain).

Logical vs history/PITR: not determinable from SQL — `pg_database_size` is logical only. Console check required (Neon → Project → Usage → "Storage" includes history).

## 2. Size by table — heap / TOAST / indexes (Q2)

| relation | total | heap | indexes | TOAST |
|---|---|---|---|---|
| `listings` | **894 MB** (937,058,304 B) | 189 MB | 27 MB | **678 MB** |
| `listing_media` | **96 MB** (100,237,312 B) | 73 MB | 22 MB | 8 kB |
| `listing_search_projection` | 71 MB | 46 MB | 25 MB | 112 kB |
| `audit_events` | 51 MB | 46 MB | 5 MB | 744 kB |
| `demand_signals` | 4.3 MB | | | |
| `geocode_cache` | 2.8 MB | | | |
| (75 more tables, all ≤ 568 kB) | ~3 MB combined | | | |

TOAST confirms the whale: `listings` TOAST (678 MB) = the JSON columns (663 MB measured at Q6a + TOAST overhead). `listing_media` has effectively **no** TOAST (8 kB) — it stores URLs/keys, not blobs — so it is 16× cheaper per photo than the old JSON ever was, but it **doubled in 2 days** (49 → 96 MB) from the drain.

## 3. Size by index + unused indexes (Q3, Q3b)

Top indexes: `listing_media_media_key_key` 7.5 MB (3.64M scans — hot), `listing_media_pkey` 5.8 MB, `listings_listing_id_key` 4.9 MB (1.54M scans), `listings_list_price_idx` 4.7 MB, `listing_search_projection_listing_id_key` 4.6 MB (607K scans).

**Unused (idx_scan = 0 since stats reset) non-PK indexes worth flagging — ~22 MB total (Q3b):**

| index | size |
|---|---|
| `listing_search_projection_bathrooms_idx` | 3.5 MB |
| `listing_search_projection_bedrooms_idx` | 3.5 MB |
| `listing_search_projection_modified_at_idx` | 2.9 MB |
| `listing_media_resource_record_key_idx` | 2.1 MB |
| `listing_media_media_modification_ts_idx` | 1.9 MB |
| `listing_media_modification_ts_idx` | 1.9 MB |
| `listing_search_projection_postal_code_idx` | 1.5 MB |
| `listings_property_type_idx` | 1.5 MB |
| `listing_search_projection_list_price_idx` | 1.4 MB |
| `listing_search_projection_listing_type_mls_status_idx` | 1.2 MB |
| `demand_signals_collected_at_idx` + `_neighborhood_signal_type_idx` | 0.6 MB |

Caveats before any drop (future, Maya-gated): (a) `idx_scan=0` reflects stats since the last reset only; (b) most `listing_search_projection` indexes are *expected* to go hot when the HELD PR 5B reader-swap ships — do **not** drop those; (c) the two `listing_media` modification-ts indexes may serve future cursor queries (RC1 keyset pagination). Real candidates after verification: `listings_property_type_idx`, the `demand_signals` pair.

## 4. Row counts (Q4a estimates, Q4b exact)

| table | exact count | notes |
|---|---|---|
| `listing_media` | **170,956** | was ~82,143 on 06-10 — drain doubled it |
| `listings` | **107,610** | 16,039 idx-displayable / 91,571 not (Q6b) |
| `listing_search_projection` | **107,607** | 1:1 with listings (3-row lag) |
| `audit_events` | **76,540** | |
| `leads` | **50** | |
| `listings_archive` | **34** | T+180 archiver has barely started (Q10a) |

No `contacts` table exists in this schema; lead-shaped data is `leads` (50) + `inquiries` (1) + `seller_leads` (2) — all negligible (Q4a/Q2).

## 5. Dead tuples / bloat (Q5)

| relation | live | dead | dead % | last autovacuum |
|---|---|---|---|---|
| `listings` | 107,610 | **14,144** | **11.6%** ⚠ | 2026-06-10 |
| `listing_media` | 170,955 | 9,263 | 5.1% | 2026-06-12 |
| `listing_search_projection` | 104,446 | 3,861 | 3.6% | 2026-06-11 |
| `social_proof_cache` | 275 | 105 | 27.6% ⚠ | 2026-06-10 |
| `lead_scores` | 50 | 58 | 53.7% ⚠ | 2026-06-09 |
| `leads` | 50 | 51 | 50.5% ⚠ | never |
| `seller_leads` | 2 | 40 | 95.2% ⚠ | never |
| `mfa_sessions` / `sessions` / `past_deals` | 0 | 36–39 | 100% ⚠ | mixed |
| `project_config` | 1 | 36 | 97.3% ⚠ | never |

Flags (>10% dead): `listings` is the only one that matters by bytes — 11.6% dead at ~8.3 KB/row ≈ **~25–40 MB of heap+TOAST bloat churn**, fed by the 5K updates/day from idx-sync (Q9e). Autovacuum IS keeping up (ran 06-10/06-12 on the big three); the tiny tables with 50–100% dead are kilobytes — cosmetic. `last_vacuum` (manual) = NULL everywhere — consistent with the no-manual-VACUUM discipline. Reminder: plain autovacuum reclaims space for *reuse* but never shrinks the file; only a rewrite does (§10).

## 6. listings JSON vs listing_media table (Q6a–Q6c)

**`listings` JSON columns, 107,610 rows (Q6a):**

| column | total bytes | avg/row |
|---|---|---|
| `raw_data` | **270,757,268 (258 MB)** | 2,516 B |
| `compliance` | **206,642,989 (197 MB)** | 1,920 B |
| `features` | **104,089,528 (99 MB)** | 967 B |
| `agent_info` | 40,129,822 (38 MB) | 373 B |
| `address` | 35,398,424 (34 MB) | 329 B |
| `media` (legacy) | 5,988,936 (5.7 MB) | 56 B |
| **JSON total** | **≈ 663 MB** | ≈ 6.2 KB |

So the presumed whale is confirmed: **`raw_data` is the single biggest column (258 MB), and `raw_data`+`compliance` together are 455 MB** — the legacy `media` JSON is already nearly empty (5.7 MB). Versus the table: `listing_media` total = **100,237,312 B (96 MB)** at **avg 417 B/row** over 170,956 rows (Q6c). Per-photo: JSON-era storage was ~6× heavier per listing; the table design is the right one — the JSON columns are pure dead weight once C6/5B make `listing_media` authoritative.

**Split by displayability (Q6b):** the 91,571 non-IDX-displayable listings hold raw_data 223 MB + compliance 170 MB + features 87 MB ≈ **480 MB — 76% of all JSON bytes sit on rows the public site never shows.**

## 7. Tombstoned media rows (Q7a, Q7b)

- `listing_media` status='deleted': **7,345 rows**, avg 442 B/row, **sum 3,247,084 B ≈ 3.2 MB** (Q7a — measured `pg_column_size(row)`, not estimated). Matches the "~7,210 and growing" probe expectation: 6,904 of them were tombstoned on 06-12 alone by the drain (Q7b).
- **Storage-wise tombstones are a non-issue (3 MB).** Their importance is correctness, not cost: **142 of these are known WRONG tombstones slated for resurrection — they must NOT be deleted in any future cleanup** (per the C6/RC5 ghost-fate work; see `scripts/__rc5-ghost-fate.mjs` lineage). Any future tombstone purge must exclude rows pending resurrection and must wait until `listing_media` is authoritative.

## 8. Audit / log tables (Q8a–Q8d)

`audit_events`: 51 MB total / 76,540 rows. Age distribution (Q8a):

| month | rows | row bytes |
|---|---|---|
| 2026-03 | 2,599 | 1.1 MB |
| 2026-04 | 11,746 | 3.3 MB |
| 2026-05 | 12,386 | 4.4 MB |
| 2026-06 (12 days) | **49,809** | **36 MB** |

June's spike is one action: **`idx_sync_listing_upsert_failure` = 46,010 rows / 35 MB (69% of the whole table's content bytes)**, written almost entirely on 06-01/06-02 (20 MB + 15 MB days, Q9a) — the incident-burst from the upsert-failure storm, not a steady leak. Steady-state audit volume is **~270–300 rows ≈ ~100 kB/day ≈ 3 MB/month** (Q9a, 06-03→06-12).

**What the 2-yr retention cron deletes vs misses:** `app/api/cron/data-retention/route.ts` step 2 deletes `audit_events` older than 2 years — the oldest row is 2026-03, so **the retention cron deletes nothing until 2028-03**. It does not distinguish operational noise (sync-failure spam) from compliance-relevant events (`trestle_access`, consent, display-gate flips). The 35 MB failure-burst will sit there for 2 years under current policy.

Other log-shaped tables (Q8c): `demand_signals` 4.3 MB / ~16K rows, `geocode_cache` 2.8 MB / ~12.5K rows (1-yr TTL already enforced by retention cron step 6), everything else ≤ 160 kB. `sync_errors` is 40 kB with an empty-to-tiny rowcount (Q8d errored on a wrong column name — table uses `occurred_at`, not `created_at`; at 40 kB total it is immaterial either way). `media_sync_state`/`sync_state` are 1-row state tables with 90%+ dead-tuple ratios from constant updates — bytes are trivial (≤80 kB), autovacuum handles them.

## 9. Growth per cron run / per day (Q9a–Q9e)

| stream | rows/day (last 14d) | bytes/day | driver cron |
|---|---|---|---|
| `listing_media` inserts | 06-09: 13,220 · 06-11: 40,163 · **06-12: 48,650** (≈0 on quiet days) | ~17–20 MB/day **during drain** (417 B/row) | `media-sync` */15 — **temporary backfill**, ends when the RC1 cursor catches up |
| `listings` inserts | ~150–200/day (148–311 range) | ~1.3–1.7 MB/day (~8.3 KB/row incl. JSON+indexes) | `idx-sync` */10 — **permanent**, grows every cycle |
| `listings` updates (churn → dead tuples, not net growth) | 5,164–5,318/day during drain; ~150–400/day before | bloat churn, autovacuum reclaims for reuse | `idx-sync` |
| `audit_events` | ~270–300/day steady (excl. the 46K burst on 06-01/02) | ~100 kB/day | every cron firing writes 1–3 rows |

**Which table grows EVERY cron cycle:** `listings` (new + updated rows each `idx-sync` */10 firing) and `audit_events` (each firing of idx-sync, media-sync, retention, prune, etc. logs a row). `listing_media` is currently the loudest but is a bounded catch-up.

**Projected monthly steady-state growth (post-drain):** listings ~45 MB + audit_events ~3 MB + listing_media residual (~90 rows/day era ≈ 1 MB) ≈ **~50 MB/month** — partially offset if/when the T+180 archiver starts stripping terminal-row JSON at scale (it has archived only 34 rows so far; 91,536 terminal rows still hold full JSON, Q10a/Q10b).

## 10. SAFE FUTURE REDUCTIONS (post-C6 · each Maya-gated · recommendations only — NOTHING executed)

| # | Action | Reclaims | Gates / cautions |
|---|---|---|---|
| R1 | **Drop legacy JSON columns on `listings`** (`media`, `features`, `address`, `agent_info`, `compliance`; slim/drop `raw_data` last) per `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md` — that plan's "~115 MB" estimate is badly stale; the measured lever is **663 MB** (Q6a) | up to ~600 MB after rewrite | Schema migration = HELD. Prerequisites: PR 5B reader-swap (HELD) + C6 makes `listing_media` authoritative + every reader of each column migrated. `DROP COLUMN` alone does NOT return disk — needs a table rewrite (R4). |
| R2 | **Let the T+180 terminal archive actually run at scale** — 91,536 terminal non-archived rows hold 223 MB raw_data + 170 MB compliance (Q10b); the existing `data-retention` cron already strips these at T+180 (cap 500/day) and T+30 media-nulling | ~390+ MB of the R1 total, no schema change needed — just time + eligibility (`status_changed_at` clock) | Already-approved cron; verify `status_changed_at` is honest for the 87,525 `gated:Closed...` rows (Q10a) before expecting throughput. NY DOS 6-yr summary kept in `listings_archive`. |
| R3 | **Compact `audit_events`**: the 46,010 `idx_sync_listing_upsert_failure` rows (35 MB, one June burst, Q8b) are operational sync noise, not consumer-facing compliance events — candidate for aggregation (1 summary row/day) or early purge | ~35 MB | Audit-retention is a §D compliance surface — READ `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` (audit retention area) first; fail-closed if the canonical file doesn't distinguish operational vs compliance events. Do NOT touch `trestle_access`/`trestle_data_access` (12-mo floor) or consent/display-gate events. |
| R4 | **One-time table rewrite of `listings` after R1/R2** to return space to disk. **NEVER `VACUUM FULL` casually on Neon — it takes an ACCESS EXCLUSIVE lock and blocks all reads/writes for the duration** (site outage while it runs); if chosen anyway it must be the 3–5 AM ET window per NEON.md §4 with Maya sign-off. Alternatives: `pg_repack` if Neon supports it, or copy-table-swap migration | realizes R1+R2's ~600 MB at the file level | DB op = HELD. Plain `VACUUM (ANALYZE)` on `listings` (11.6% dead, Q5) is the only justified routine candidate and reclaims for reuse only, not disk. |
| R5 | **Drop verified-unused indexes** (`listings_property_type_idx` 1.5 MB, `demand_signals` pair 0.9 MB; the projection/listing_media zero-scan indexes are NOT safe — reserved for PR 5B / RC1 cursor paths) | ~2–22 MB depending on verification | Schema migration = HELD; re-check `idx_scan` after 5B ships. |
| R6 | **Tombstone purge — explicitly NOT recommended now**: 7,345 deleted rows = 3.2 MB (Q7a), and **142 are wrong tombstones queued for resurrection**. Park until post-C6. | 3 MB (not worth the risk) | — |
| R7 | Obsolete sync-state/log rows: nothing material — `sync_errors` 40 kB, state tables ≤80 kB (Q8c/Q8d). No action. | ~0 | — |

**Post-cleanup size estimate:** 1,135 MB − ~600 MB (R1/R2 + R4 rewrite) − 35 MB (R3) − ~2–22 MB (R5) ≈ **~480–500 MB**, i.e. **right at the 500 MB Free-tier cap**. Verdict: Free tier becomes *technically* reachable only if (a) the full JSON drop ships, (b) the rewrite runs, and (c) the terminal-archive cadence keeps recycling the ~45–50 MB/month steady growth — otherwise the DB re-breaches Free within weeks. The realistic near-term posture is **Launch $19/mo with all baselines comfortably met** (1,135 MB vs 10 GB = 11%; compute est. ~133 CU-hr vs 300); the $19 subscription itself — not usage overage — remains the bill, exactly as the 06-10 audit concluded. The plan-downgrade decision point comes after R1–R4 land.

---

## Appendix — provenance

- Probe: `scripts/__neon-cost-2026-06-12.mjs` (untracked, DO NOT COMMIT). Host-guard line: refuses unless `DATABASE_URL` contains `ep-cold-waterfall-adno3ao2`; session set `default_transaction_read_only = on`. All queries labeled Q1–Q10c; raw output preserved in the session transcript (2026-06-12T21:40Z).
- Known probe defect: Q8d referenced `sync_errors.created_at` (actual column `occurred_at`) and errored — immaterial (table = 40 kB total per Q2).
- Code evidence: `app/api/cron/data-retention/route.ts` (2-yr audit purge, T+30 media-null, T+180 archive with 500/day cap), `vercel.json` cron table, `NEON.md` §2/§4/§8.
- Not visible from SQL (console checks, carried over from the 06-10 audit §2.6): history/PITR GB, compute-size/autoscaling config on `ep-cold-waterfall-adno3ao2`, current-cycle CU-hr meter, sibling-project (`morning-bread` ~1 GB stale copy) billing in the same org.
