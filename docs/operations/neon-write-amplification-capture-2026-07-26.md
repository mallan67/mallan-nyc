# Neon write-amplification — Phase-1 PRODUCTION capture (2026-07-26)

> **Evidence for existing issues OPS-010A + OPS-010** (`docs/PLATFORM-ISSUE-REGISTRY.md`) — NOT a new ID.
> Bounded, Maya-authorized production evidence window. Read-only capture; **no application
> behavior, retention, R2, Neon, cadence, env or cron was changed to gather this.** The
> diagnostic instrumentation (PR #569) is evidence-only and auto-expires.

## 1. Window facts (independently verifiable)
- **Merge SHA:** `2fecd4f366948779d912600daa71170ea0213b3a` (PR #569 → `main`, merged 2026-07-26T01:05:26Z).
- **Production deployment:** `dpl_5N2eQ2G2gSLxZLRL8Li4RkkaAdsj` — `target=production`, **READY** at 2026-07-26T01:08:02Z, owns the production aliases incl. `mallan.nyc`.
- **Diagnostic flag:** `DIAG_RAW_DATA_KEYS_UNTIL=2026-07-26T02:25:00Z` (Production). Removed from project settings post-capture; the live deploy also **auto-fails-off in-code at 02:25:00Z** (Vercel bakes env at build, so removal cleans future builds while the running deploy self-terminates at the timestamp).
- **Cycles observed:** THREE natural One Cycle runs — 01:10, 01:20, 01:30 UTC — **all on `dpl_5N2e`; NO cron manually triggered.**

## 2. Raw per-cycle LISTING counters (`idx_sync_cron` audit + runtime-log histogram)
| Cycle (UTC) | rows_updated | suppressed | raw_data_only | modts_only | price | projection updated / suppressed | histogram (names+counts) |
|---|---|---|---|---|---|---|---|
| 01:10 | 62 | 0 | 48 | 7 | 3 | 3 / 59 | `PhotosChangeTimestamp`×48 (distinct_keys=1) |
| 01:20 | 56 | 2 | 56 | 0 | 0 | 0 / 58 | `PhotosChangeTimestamp`×56 (distinct_keys=1) |
| 01:30 | 4 | 0 | 4 | 0 | 0 | 0 / 4 | `PhotosChangeTimestamp`×4 (distinct_keys=1) |

**Sampled `raw_data_only` writes: 108 total — 108/108 were `PhotosChangeTimestamp`-only (distinct_keys=1 every cycle).** Projection wrote 3 rows across all 3 cycles (search-visible), suppressing the rest.

## 3. Raw per-cycle MEDIA cause counters (`media_sync_cron` durable payload — new split)
| Cycle (UTC) | physical writes | material (updated_changed) | delivery_url_refreshed | suppressed_url_signature_rotation | suppressed_url_identity_changed | write_failures |
|---|---|---|---|---|---|---|
| 01:10 | 285 | 175 | 110 | 0 | 704 | 0 |
| 01:20 | 368 | 306 | 62 | 0 | 572 | 0 |
| 01:30 | 131 | 30 | 101 | 0 | 205 | 0 |
| **Σ** | **784** | **511** | **273** | **0** | **1,481** | **0** |

## 4. DB deltas — T0 → T1 (raw)
- **T0 = 2026-07-26T00:58:10.943Z** (pre-merge baseline) · **T1 = 2026-07-26T01:33:39.417Z** (~35 min).
- Window spans the merge + the 01:01 cycle (OLD code) + 01:10/01:20/01:30 (new code) — i.e. ~4 cycles, one pre-instrumentation.

| Metric | T0 | Δ (T0→T1) |
|---|---|---|
| WAL bytes (abs) | 20,717,459,768 | **+1,812,168 (~1.77 MB)** |
| `pg_database_size` | 560,881,664 | **+73,728 (~72 KB)** |
| listings `n_tup_upd` | 1,403,716 | **+190** |
| listing_media `n_tup_upd` | 3,408,710 | **+885** |
| listing_search_projection `n_tup_upd` | 315,021 | **+3** |
| audit_events `n_tup_ins` | 90,002 | **+20** |
| listings dead tuples | 4,089 | +137 |
| listing_media dead tuples | 54,597 | +513 |

## 5. Conclusions — SCOPED to what was actually proven (corrections applied)
1. **Listing raw_data_only churn = `PhotosChangeTimestamp`, but that is a SUBSET of listing writes.** 108/108 *sampled `raw_data_only`* writes were `PhotosChangeTimestamp`-only. The same window recorded **190 total listing updates** — so `raw_data_only` was **part**, not all, of listing write volume (the rest: material changes — price/status/etc. — and the 01:01 pre-instrument cycle). Do NOT read this as "100% of listing writes." The projection suppressed ~all of the raw_data_only writes from search (3 search-visible across 3 cycles).
2. **Media physical writes = material (511) + delivery-URL-refresh (273).** The 273 `delivery_url_refreshed` are material-unchanged rows rewritten to refresh a not-yet-mirrored URL (R2 backlog). 0 write-failures.
3. **URL rotation is `identity`-type (path-embedded), and is SUPPRESSED — but "harmless" is NOT proven.** 1,481 `suppressed_url_identity_changed` (0 signature-rotation) means the origin/pathname changed and the row was suppressed (material-unchanged + delivered). That is CONSISTENT with CDN/path signature churn, but `identity_changed` can also be a genuine replacement asset. **Not classified as harmless** — distinguishing requires anonymized pattern analysis (Phase-2), not asserted here.
4. **Storage: only short-window LOGICAL stability was observed — NOT a long-term or billed trend.** `pg_database_size` moved +72 KB over ~35 min. This shows logical size was ~stable in a brief window; it does **NOT** establish that storage isn't growing or isn't a cost driver — WAL, dead tuples, and Neon **history/synthetic (billed)** storage can behave differently and were not trended here.
5. **Neon monitoring screenshots (gate #1):** the **Database-size** panel is ~flat ~585 MB over the shown range (consistent with §4's short-window logical stability). **CORRECTION:** the `~115` line on "Postgres connections count" is the **max-capacity** reference line, NOT active connections — active/idle/total sit near the bottom; the screenshots do **not** show connections reaching 115. The application-level Prisma pool-limit errors (pool=5) seen in runtime logs are a **separate, real** signal, tracked independently.

## 6. Phase-2 — HELD (no change made or authorized here)
Two proven levers, both requiring Maya's explicit go before any behavior change:
- **`PhotosChangeTimestamp`**: it is deliberately fail-closed to `raw_data_only` (see `write-suppression.ts` `RAW_DATA_PROVENANCE_CLOCK_KEYS` comment — reclassifying it needs true empty-gallery reconciliation first). Handling it would remove the dominant `raw_data_only` base-row rewrite.
- **`delivery_url_refreshed`**: draining the R2 mirror backlog removes those refresh writes.

**No suppression of `PhotosChangeTimestamp` or URL identity changes, and no retention / R2 / Neon / cadence / env / cron change, has been made.** Phase-2 remains HELD pending Maya's decision from this record.
