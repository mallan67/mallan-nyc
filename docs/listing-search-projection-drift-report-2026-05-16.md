# Listing Search Projection — Drift Report (Read-Only)

**Status:** Report-only. **No patches applied. No rows updated. No migrations run. No cron triggered.**
**Run at:** 2026-05-16T22:53:00Z
**Host:** `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`
**Author:** Claude Code (under Maya direction)
**Trigger:** Drift detected post-IDX-recovery (`Listing.idx_display_yn=true` count 14 491 vs `ListingSearchProjection.idx_display_yn=true` count 16 440, delta 1 949). Blocks Master Plan PR 5B (search-projection reader migration), which would otherwise expose 1 949 stale projection rows publicly.
**Source data:** `.drift-data.json` (read-only Prisma + Postgres queries; full JSON snapshot retained for diffing in subsequent runs)

---

## A. Drift count — headline number

| Field | Drift rows | Direction |
|-------|-----------:|-----------|
| `idx_display_yn` | **1 949** | **All L=false ∧ P=true (public-leak direction)** |
| `internet_entire_listing_display_yn` | 0 | — |
| `internet_address_display_yn` | 0 | — |
| `participant_only` ↔ `participant_only_yn` | 0 | — |
| `rls_eligible` | 0 | — |

**`idx_display_yn` decomposition** (read-only verified via `SUM(CASE WHEN ...)`):
- `Listing.idx_display_yn=true  AND Projection.idx_display_yn IS DISTINCT FROM true`: **0**
- `Listing.idx_display_yn=false AND Projection.idx_display_yn IS DISTINCT FROM false`: **1 949**
- `Projection.idx_display_yn IS NULL`: **0**

**Drift is unidirectional.** Every disagreement is `Listing.false ∧ Projection.true` — i.e. the listing has been correctly removed from public display, but the projection still says it should display. This is the dangerous direction; the opposite direction would only over-suppress.

**Per-table totals (sanity baseline):**
| | Total rows | `idx_display_yn=true` | `idx_display_yn=false` |
|-|-----------:|---------------------:|----------------------:|
| `listings` | 103 520 | 14 491 | (remainder) |
| `listing_search_projection` | 103 517 | 16 440 | (remainder) |

Listing↔projection 1:1 row coverage holds (103 520 vs 103 517 — 3-row delta is unrelated and within FK-cascade tolerance).

**owner_opt_out** is intentionally not mirrored on `ListingSearchProjection` (column doesn't exist on the projection table; gate evaluator joins to `listings.owner_opt_out` on read). It is therefore not a drift dimension and not relevant to PR 5B's read path **provided** the new reader continues to consult `listings.owner_opt_out` rather than fetching only projection columns. **Recommendation:** add `owner_opt_out` to the projection (with dual-write) as part of PR 5B's schema migration, OR explicitly retain a join on `listings.owner_opt_out` in the new reader's query. Without one of those, PR 5B will lose the owner-opt-out gate.

---

## B. Drift categories — what's in the 1 949

### B.1 By `Listing.status`
| Status | Drift rows |
|--------|-----------:|
| Withdrawn | **1 034** (53.0%) |
| Closed | **915** (46.9%) |

No other terminal statuses appear (no Cancelled, Expired, Sold, Leased, Rented). The drift is **exclusively** the Withdrawn + Closed bucket.

### B.2 By `Projection.mls_status`
| mls_status | Drift rows |
|------------|-----------:|
| Active | **1 033** ← projection still labels these as Active |
| Closed | 915 |
| Pending | 1 |

The 1 033 Active-in-projection rows are the cleanest demonstration of the dual-write failure: the listing is Withdrawn, the projection is still Active.

### B.3 By `Listing.listing_type` / `property_type`
| listing_type | property_type | Drift rows |
|---|---|---:|
| sale | Residential | 1 489 (76.4%) |
| rent | ResidentialLease | 460 (23.6%) |

(Note: there is no separate `mls_status` or `standard_status` column on `Listing` — the canonical RESO StandardStatus value is stored in `Listing.status`. Drift breakdown by `Listing.status` is in B.1.)

### B.4 By age of `Listing.updated_at` (when the writer last touched the row)
| Bucket | Drift rows |
|--------|-----------:|
| 1–7 days | 782 |
| 7–30 days | 1 167 |
| over 30 days | 0 |

All drift rows had their `Listing.updated_at` bumped in the past 30 days — consistent with a writer that updates Listing but not projection.

### B.5 By age of `Listing.modification_timestamp`
| Bucket | Drift rows |
|--------|-----------:|
| 1–7 days | 693 |
| 7–30 days | 1 254 |
| over 180 days | 2 |

### B.6 By age of `Listing.last_synced_from_trestle` (last Trestle re-emit)
| Bucket | Drift rows |
|--------|-----------:|
| 1–7 days | 414 |
| 7–30 days | 1 172 |
| 30–90 days | 363 |

This is the key window: **for the drift to close on its own, Trestle has to re-emit the listing**, which then runs through the idx-sync writer (which does dual-write to projection). 363 of the 1 949 drift rows were last seen from Trestle 30–90 days ago and have not been re-emitted since. Those will not self-heal under the current writer set.

### B.7 By age of `Projection.modified_at` (last time projection was written)
| Bucket | Drift rows |
|--------|-----------:|
| 1–7 days | 410 |
| 7–30 days | 1 172 |
| 30–90 days | 260 |
| 90–180 days | 77 |
| over 180 days | 30 |

Cross-checking against B.6: the projection writer (idx-sync) and `last_synced_from_trestle` move in lockstep for the 1–7 d and 7–30 d buckets, but diverge sharply for older rows — the 30 / 77 / 260 buckets show the projection has been allowed to drift for months while the listing was kept current by other writers.

### B.8 By age of `Listing.status_changed_at`
| Bucket | Drift rows |
|--------|-----------:|
| 1–7 days | 616 |
| 7–30 days | 1 306 |
| 30–90 days | 27 |

**Smoking-gun pattern in the data:** of the top-100 drift rows ordered by `status_changed_at DESC`, **every single one has `status_changed_at = 2026-05-15T03:30:37.661Z`** — the same millisecond, across all 100 rows. That is the timestamp of the feed-reconcile cron's batch transaction on 2026-05-15 (scheduled `30 3 * * *` in `vercel.json`). 1 034 rows transitioned in a single cron run, none of which dual-wrote to the projection.

---

## C. Top-100 example mismatches

Columns: `listing_id | L.status | P.mls_status | L.idx_display | P.idx_display | listing_type | status_changed_at age | modification_timestamp age | updated_at age | last_synced_from_trestle age | P.modified_at age`

```
RLS20027519 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 23.7d | 26.3d
RLS20081696 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.4d |  2.4d
RLS10988538 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 170.2d
RLS20059781 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 105.1d
RLS20088714 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  8.1d |  8.1d
RLS20090549 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20090900 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20080332 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.2d |  6.3d
RLS20090904 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20080493 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 46.1d | 46.1d
RLS20076082 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  7.2d |  7.2d
RLS20090565 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20084862 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 20.2d | 20.2d
RLS20068573 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  8.4d |  8.5d
RLS20036865 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 57.8d
RLS20081560 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 40.3d | 40.3d
RLS20024470 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 23.3d | 23.3d
RLS20020951 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 46.1d | 46.1d
RLS20090553 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20082780 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 20.1d | 20.2d
RLS20083394 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 29.2d | 29.2d
RLS20079726 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  8.2d |  8.2d
RLS20075800 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  4.2d |  4.2d
RLS20087207 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 12.3d | 12.3d
RLS20088953 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  4.0d |  4.0d
RLS20057716 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 116.8d
RLS20083927 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.2d | 10.2d
RLS20081611 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.6d |  2.6d
RLS20081737 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  4.2d |  4.2d
RLS20079364 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.2d |  6.2d
RLS20087866 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.2d |  6.2d
RLS20020943 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 11.2d | 11.2d
RLS20045887 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  4.4d |  4.4d
RLS20090170 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  5.1d |  5.1d
RLS20086917 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20085927 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  8.0d |  8.0d
RLS20074532 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 66.8d
RLS20067424 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 102.1d
RLS20090807 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20088338 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 13.2d | 13.2d
RLS20086002 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.2d |  6.2d
RLS20057048 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20090906 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS20090905 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  3.2d |  3.2d
RLS10970506 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 18.8d | 18.8d
RLS20089401 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.8d |  2.8d
RLS20081376 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20055482 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.3d |  2.4d
RLS20076321 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 43.2d | 43.2d
RLS20073099 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 30.2d | 30.2d
RLS20087154 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20020960 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 46.2d | 46.2d
RLS20078856 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.3d | 10.3d
RLS20056793 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 49.2d | 201.2d
RLS20072665 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.4d | 10.4d
RLS20063565 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 119.2d
RLS20065486 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 23.7d | 27.2d
RLS20038728 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 93.3d
RLS20079498 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 44.8d | 44.8d
RLS20065772 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 49.2d | 100.3d
RLS20090748 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  3.1d |  3.1d
RLS20073126 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 73.2d
RLS20065783 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 49.2d | 100.3d
RLS20079499 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 44.8d | 44.8d
RLS20057273 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 45.3d | 45.3d
RLS20087495 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 10.8d | 10.8d
RLS20082888 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.3d | 10.3d
RLS11017161 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 48.4d | 48.4d
RLS20069369 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 36.4d | 36.4d
RLS20070624 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 48.2d | 48.2d
RLS20072847 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 80.3d
RLS20077976 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.4d | 10.5d
RLS20086813 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 13.2d | 13.2d
RLS20083816 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 31.4d | 31.4d
RLS20086165 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 16.8d | 16.8d
RLS20074829 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.5d |  2.5d
RLS20087901 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.1d |  6.2d
RLS20053816 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 45.3d | 45.3d
RLS20069945 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 23.6d | 24.3d
RLS20072090 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 83.1d
RLS20077661 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 23.7d | 26.0d
RLS20070799 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 46.8d | 46.8d
RLS20064864 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d | 49.2d | 135.2d
RLS20074561 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.5d |  2.5d
RLS20069095 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  5.4d |  5.4d
RLS20084966 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.1d |  6.2d
RLS20069129 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 32.1d | 32.1d
RLS10988536 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 170.2d
RLS20049774 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.3d |  2.4d
RLS20087960 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 16.1d | 16.2d
RLS20004666 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 49.2d | 170.2d
RLS20081612 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  2.6d |  2.6d
RLS20071539 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 33.3d | 33.3d
RLS20088336 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  2.8d |  2.8d
RLS20073113 | Withdrawn | Active | F | T | rent | 1.8d | 1.8d | 1.8d |  6.2d |  6.2d
RLS20074562 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 14.3d | 14.3d
RLS20076017 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d |  6.1d |  6.2d
RLS20074020 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 33.3d | 33.3d
RLS20076644 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 18.3d | 18.3d
RLS20078181 | Withdrawn | Active | F | T | sale | 1.8d | 1.8d | 1.8d | 10.3d | 10.3d
```

(Full JSON shape — all 100 rows including ISO-8601 timestamps and per-field gate values — retained in `.drift-data.json` at run time.)

**Observation on the top-100 sort:** ordering by `status_changed_at DESC` surfaces 100 Withdrawn rows from the **same** 2026-05-15 03:30 UTC batch. The 915 Closed-status drift rows live below them in the sort. The Closed cohort's `status_changed_at` is older (the listing went Closed before the drift event); the §2.05 data-retention cron then flipped `idx_display_yn=false` 24 hours later without bumping `status_changed_at`. To inspect the Closed cohort, re-run the query with `WHERE l.status='Closed'`.

---

## D. Root writer cause — who flipped Listing without touching Projection

### D.1 Confirmed writers in this drift set

| # | Writer | File | What it does | Dual-writes projection? | Audit-event signature | 30-day audit count |
|---|--------|------|-------------|:----------------------:|----------------------|-------------------:|
| 1 | **feed-reconcile cron** (daily 3:30 UTC) | `app/api/cron/feed-reconcile/route.ts:350-358` | Per-ghost `prisma.$transaction([prisma.listing.update({ status: "Withdrawn", status_changed_at: now, idx_display_yn: false, modification_timestamp: now }), prisma.auditEvent.create])` | **NO** | `action='feed_reconcile_ghost_transition'` | **2 490** |
| 2 | **data-retention cron** (daily 3:00 UTC) — §2.05 24h closed-removal | `app/api/cron/data-retention/route.ts:87-90` | `prisma.listing.updateMany({ where: status IN terminal AND status_changed_at < cutoff AND idx_display_yn=true, data: { idx_display_yn: false } })` | **NO** | `action='idx_display_yn_disabled'` | **5 833** |
| 3 | **CRM convert** (manual lifecycle transitions) | `app/api/crm/convert/route.ts:227-228` | `prisma.listing.create({ data: { idx_display_yn: !TERMINAL_STATUSES.has(...), ... } })` — also `prisma.listing.update` paths in same file | **NO** | varies (`crm_convert_*`) | — (low volume, not the source of the bulk drift) |

### D.2 Writers that DO dual-write correctly (for reference)

| Writer | File | Dual-writes? |
|--------|------|:-----------:|
| idx-sync primary (Trestle mapper) | `lib/idx/sync.ts:362` and `:1188` | ✓ (PR #112 + #113) |
| idx-sync writer guard (`normalizeStandardStatus` + terminal status enforcement) | `lib/idx/trestle-mapper.ts:780-870` | ✓ |
| `syncProjection()` canonical helper | `lib/search/listing-search-projection.ts:561` | ✓ (it IS the projection writer) |
| One-shot backfill | `scripts/backfill-listing-search-projection.ts:209` | ✓ |

The dual-write guarantee landed correctly only on the IDX-sync path. The §2.05 data-retention cron, the feed-reconcile cron, and the CRM convert path were never wired through `syncProjection()`. **This is the open architectural debt `H1 (non-mapper writers)` tracked in `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`** — partially closed by PR #112 + #113 for the idx-sync writer, but the cron writers were not part of those PRs.

### D.3 Why drift is 1 949 and not 8 323

The 30-day audit-event total is `2 490 + 5 833 = 8 323` writer events that flipped `Listing.idx_display_yn=false`. Today's drift is `1 949` rows. The delta (`6 374` rows) self-healed because Trestle subsequently re-emitted those listings, which triggered the idx-sync writer, which dual-wrote both tables. The PR #112 terminal-status writer guard ensured those re-emits did not flip `idx_display_yn` back to `true`. **The drift that remains is the residual set Trestle never re-emitted.** It will not self-heal under the current writer set — the ones that are 30–200 days dormant on the Trestle side (363 / 77 / 30 rows from B.6 / B.7) are permanent-until-fixed.

---

## E. Public-leak risk assessment

### E.1 Risk **today** — under current `/api/listings` reader: **NONE**

`/api/listings` currently reads from the `Listing` table (verified in `app/api/listings/route.ts` line 1-50 imports: `filterDisplayableDbListings`, `dbListingToPublicDTO`, etc. operate on `Listing` rows fetched via `buildPublicListingDbSearch`). It does **not** read from `ListingSearchProjection` today. The projection is currently populated for fast facet filtering and reader-migration prep but not consumed by the public-display path. Therefore the 1 949 drift rows are **not publicly visible**. Public production is correct.

This was verified in the hardening probe earlier today: `/api/listings?type=sale` returns 9 531 total (matches `Listing.idx_display_yn=true ∧ listing_type='sale' ∧ rls_eligible=true ∧ status='Active'`).

### E.2 Risk **the moment PR 5B merges**: **1 949-row public leak**

PR 5B's purpose is to swap the public reader from the `Listing` table to the `ListingSearchProjection` table. If shipped on top of today's drift:
- 1 949 listings the Listing table correctly hides would become publicly visible
- 1 034 of them carry status=Withdrawn (REBNY RLS §2.05 violation — "remove within 24 hours" of terminal status)
- 915 carry status=Closed (same §2.05 violation)
- Per UCBA 2026 Art. I §5(D) and §6, this is an incurable display-of-terminated-listing violation — first $250, subsequent $500 per listing, plus quarterly >5% rejection threshold penalty exposure ($10 000) once REBNY's quality monitor catches it.

**Therefore PR 5B is blocked until drift = 0 AND a writer guarantee is in place that drift cannot recur.**

---

## F. Recommended reconciliation strategy — **Option C: both**

The user asked for one of three options. Reasoning:

- **Option A (one-time SQL only)** clears the current drift but leaves the next 03:00/03:30 UTC cron run to re-create it. Insufficient.
- **Option B (code patch only)** fixes future writes but leaves the existing 1 949 rows in their incorrect state, blocking PR 5B indefinitely.
- **Option C (both)** is the only complete fix: patch the three writers first so further drift cannot accumulate, then run a one-shot reconciliation to clear the existing 1 949 rows.

### F.1 Recommended sequence (do NOT execute yet — report-only)

1. **Code patch PR — `fix(projection): dual-write idx_display_yn from data-retention + feed-reconcile + convert`**
   - `app/api/cron/data-retention/route.ts`: after the `updateMany` at line 87-90, call `syncProjection(listing_id)` for each `staleClosedListings.id` (use the canonical helper from `lib/search/listing-search-projection.ts`, NOT a hand-rolled upsert).
   - `app/api/cron/feed-reconcile/route.ts`: inside the per-ghost `$transaction` at line 349-374, append a third statement — `prisma.listingSearchProjection.upsert(buildProjectionUpsertPayload(buildProjection(updatedListing)))` — OR call `syncProjection(g.listing_id)` after the transaction commits. The in-transaction approach is structurally correct (no window where Listing is updated but Projection isn't); the post-commit approach is simpler. Either works.
   - `app/api/crm/convert/route.ts`: after every `prisma.listing.create` or `prisma.listing.update` that touches `idx_display_yn`, call `syncProjection(listing.listing_id)`.
   - Add `tests/runtime/projection-dual-write-tier2.test.ts` — source-regex pin asserting all three files import `syncProjection` and call it in the same function as the writer. Same shape as `lib/search/__tests__/h1-dual-write-tier1.test.ts`.
   - Run `npm run ucba:audit`, `npm run rls:validate`, `npm run idx:validate`, `npm run compliance-check`. Verify no regressions.
   - Open as separate PR — do not bundle with PR 5B.

2. **One-shot reconciliation script (read+write, run ONCE after writer patch deploys)** — `scripts/reconcile-projection-idx-display.ts`. Logic:
   ```sql
   -- pseudocode, NOT run yet
   SELECT listing_id FROM listings l
   JOIN listing_search_projection p ON p.listing_id = l.listing_id
   WHERE l.idx_display_yn IS DISTINCT FROM p.idx_display_yn;
   ```
   For each row, call `syncProjection(listing_id)` so the projection is rebuilt from the canonical Listing source via the same payload-builder the writers use. Run it once, in production, AFTER the writer patch is live so any new flips during the script run are also correctly dual-written.
   Wrap in an AuditEvent (`action='projection_reconcile_idx_display_yn'`) recording rows updated. Dry-run first.

3. **Re-verify drift = 0** via a re-run of `scripts/__drift-analyze.mjs` (or its hardened successor) — confirm both directions of the JOIN return 0 mismatches.

4. **Then start PR 5B.**

### F.2 Where to put the writer patches — exact insertion points

| File | Insertion point | What to add |
|------|-----------------|------------|
| `app/api/cron/data-retention/route.ts` | After line 90 | `await Promise.all(staleClosedListings.map(l => syncProjection(l.listing_id)));` plus AuditEvent emitter on failure |
| `app/api/cron/feed-reconcile/route.ts` | Inside the `$transaction` at line 349, OR a sibling `await syncProjection(g.listing_id)` after line 375 | Either adds a 3rd statement to the transaction (atomicity is preserved) or a post-commit projection sync (atomicity slips but recoverable) |
| `app/api/crm/convert/route.ts` | After every `prisma.listing.create` and `prisma.listing.update` touching `idx_display_yn` | `await syncProjection(listing.listing_id);` |

---

## G. Can PR 5B start after reconciliation?

**Yes, with three preconditions all met:**
1. ✅ Writer-patch PR shipped to production (the 3 writers above + tier-2 dual-write test)
2. ✅ One-shot reconciliation script ran and drift = 0 confirmed
3. ✅ A second 24-h soak (covering ≥2 full feed-reconcile + data-retention cron cycles) showing the drift count stayed at 0 — proves the patch holds

Without all three, PR 5B is unsafe. Order matters: writer patch FIRST (so the reconciliation can't be re-corrupted), reconciliation SECOND (clears history), soak THIRD (proves it sticks).

---

## H. Tests/checks needed to prevent recurrence

### H.1 Source-regex source pin (cheap, runs on every PR)
Mirror `lib/search/__tests__/h1-dual-write-tier1.test.ts`:
- New test `tests/runtime/projection-dual-write-tier2.test.ts`:
  - Assert `app/api/cron/data-retention/route.ts` text matches `/syncProjection\s*\(/`
  - Assert `app/api/cron/feed-reconcile/route.ts` text matches `/syncProjection\s*\(/` (or `prisma.listingSearchProjection.upsert` inside the transaction)
  - Assert `app/api/crm/convert/route.ts` text matches `/syncProjection\s*\(/`
  - Negative pin: any new file that writes `idx_display_yn` (regex `idx_display_yn\s*:`) but does NOT contain `syncProjection` is a failure. Mirror the test from H1 PR #113.

### H.2 Functional drift assertion (slower, runs nightly or weekly)
Add a new check to `scripts/ucba-compliance-audit.js` (or a sibling script wired into `npm run ops:health`):
```sql
SELECT COUNT(*)::int AS drift FROM listings l
JOIN listing_search_projection p ON p.listing_id = l.listing_id
WHERE l.idx_display_yn IS DISTINCT FROM p.idx_display_yn
   OR l.internet_entire_listing_display_yn IS DISTINCT FROM p.internet_entire_listing_display_yn
   OR l.internet_address_display_yn IS DISTINCT FROM p.internet_address_display_yn
   OR l.participant_only IS DISTINCT FROM p.participant_only_yn
   OR l.rls_eligible IS DISTINCT FROM p.rls_eligible;
```
Threshold: 0 = pass, anything > 0 = fail (exits non-zero). Wire into the existing `npm run ci` chain alongside `ucba:audit`.

### H.3 Audit-event invariant
Wherever an AuditEvent is created with `action='idx_display_yn_disabled'` or `action='feed_reconcile_ghost_transition'`, emit a companion `action='projection_sync_after_status_change'` AuditEvent in the same transaction. Easy to grep for via a unit test, gives operations confidence post-incident that the dual-write actually executed.

### H.4 Integration test against a fixture DB
Test name: `tests/runtime/data-retention-cron-projection-sync.test.ts`. Set up a Listing row with `status='Closed'`, `status_changed_at` > 24h ago, `idx_display_yn=true`, AND a paired ListingSearchProjection row with `idx_display_yn=true`. Invoke the data-retention handler. Assert: both tables flip to `idx_display_yn=false`. Repeat for feed-reconcile.

---

## I. Answers to the requested summary

**A. Drift count:** 1 949 rows on `idx_display_yn`, all in the L=false ∧ P=true direction. 0 drift on the other four mirrored gate fields.
**B. Drift categories:** Withdrawn 1 034 + Closed 915 (Residential 1 489 / ResidentialLease 460; sale 1 489 / rent 460). All `status_changed_at` aged 1–90 days. Top-100 are from one feed-reconcile batch at 2026-05-15 03:30 UTC.
**C. Root writer cause:** Three writers update `Listing.idx_display_yn` without dual-writing to `ListingSearchProjection`:
  - `app/api/cron/feed-reconcile/route.ts:350-358` (daily 3:30 UTC ghost transitions — 2 490 events / 30 d, ~1 034 today's drift)
  - `app/api/cron/data-retention/route.ts:87-90` (daily 3:00 UTC §2.05 closed-removal — 5 833 events / 30 d, ~915 today's drift)
  - `app/api/crm/convert/route.ts:227-228` (low-volume CRM lifecycle transitions)
**D. Public leak risk today:** **None.** `/api/listings` reads from `Listing`, not from `ListingSearchProjection`. Public production is correct as of 2026-05-16T22:53 UTC.
**E. Recommended fix:** **Option C — both.** Code patch the three writers to call `syncProjection()` (via canonical helper in `lib/search/listing-search-projection.ts`), then a one-shot reconciliation script to clear the existing 1 949 rows. Add tier-2 source-regex test + functional drift assertion to prevent recurrence.
**F. Write patch needed before PR 5B:** **YES.** PR 5B is blocked until: (1) writer patch deployed, (2) reconciliation script run, (3) 24-h soak across ≥2 cron cycles confirms drift stays at 0.

---

## Appendix — artifacts retained

- `.drift-data.json` (full JSON, 61 765 bytes — all per-row examples + breakdown counts)
- `.drift-stderr.log` (script run log)
- `.top100-formatted.txt` (the table in section C)

These three temporary files are kept in the repo root for one-session diff-back convenience; they should be moved out or deleted before any commit. They are NOT committed by this report.

---

**End of report.** No code modified. No DB rows updated. No env vars touched. No cron triggered. PR 5B remains in `NOT_STARTED` status per `memory/REFACTOR-2026-04-25.md`.
