# PR 5B decision memo — should public `/search` read `listing_search_projection`?

> **REPORT-ONLY. No code.** Decision memo for Maya. No SQL, migration, reclaim, downgrade, env, or branch work. Recommendation + risks + test plan only; implementation is a SEPARATE approved PR.
> Date: 2026-06-24 · Board #415 · Grounded in read-only source + the 2026-06-24 sprint report.

## The question
Today every PUBLIC surface (`/search`, Featured, exclusives, agent pages, detail-DB-path, open-houses) reads `prisma.listing` directly, gated by `lib/search/listing-access-decision.ts:buildSearchDisplayWhere`. The `listing_search_projection` table is fully built, indexed, and dual-written, but is read ONLY by saved-search **alerts** (`lib/search/core.ts:139 runProjectionListingSearch`). **PR 5B = swap the public reader from `listings` → `listing_search_projection`.** It has been HELD since the 2026-04-25 refactor plan.

## TL;DR recommendation
**Conditional YES — but staged, and NOT as the first move.** The projection is the correct long-term reader (it already solves the three biggest live-path problems), but a swap done before a verified backfill + filter-parity proof would risk **silently dropping displayable listings from public search** (an availability + arguably compliance incident). Recommended: **do P1 (additive indexes on `listings`) first** so live search is healthy regardless, then land PR 5B behind a backfill + parity gate. P1 is not wasted: even with PR 5B, `listings` stays the reader for CRM/edit-loaders/agent-DB-path and the detail fallback.

## What the projection already gives us (why it's the right target)
- **Promoted geography** (`borough`, `neighborhood`, `postal_code`, `city`, `state`) + a **`searchable_text` TEXT column** → eliminates the **unindexable JSON-path `address` `string_contains` scan** that `/search` does today (`public-listing-db.ts:143-170`). This is the single biggest perf win.
- **Gate composite index** `lsp_distribution_gates_idx (rls_eligible, idx_display_yn, internet_entire_listing_display_yn, participant_only_yn)` — the predicate on every public read, which the `listings` table lacks.
- **Pre-derived boolean facets** (`is_commercial`, `is_new_development`, `is_exclusive`, `is_rental`) + numeric dims (price/beds/baths/living_area/year_built/lat/long), all indexed.
- **Smaller, hotter table** (73 MB vs 1041 MB) → better cache residency, less TOAST churn.
- **Resolves the alert-vs-search divergence**: alerts already read the projection; if `/search` does too, a saved-search email and the on-site result for the same query come from one source.

## What changes (if approved — separate PR)
1. `/api/listings` DB path swaps `prisma.listing.findMany(buildPublicListingDbSearch(...))` → `runProjectionListingSearch`/`criteriaToProjectionWhere` against `listing_search_projection`, gated by `buildProjectionSearchWhere` (`listing-access-decision.ts:79`).
2. Result rows map projection → public DTO (the projection lacks the full `raw_data`/`features` blobs, so the DTO builder must read the joined `listing` for fields the projection doesn't carry, OR the projection must carry them — see risks).
3. Address search moves from JSON `string_contains` → `searchable_text` (ILIKE/GIN-trgm).
4. Dedupe (`preferCrmExclusiveOverIdxDuplicate`) + Featured ordering operate on projection rows (need the same SL-/RL- identity + address keys → `is_exclusive` + geography columns cover this).

## Risks (and the gates that retire each)
| Risk | Why | Gate before swap |
|---|---|---|
| **Silent listing loss** | Gate booleans are *"null until PR 5B"* (schema comment); readers treat null as fail-closed → any row whose projection gates are null vanishes from search | **Backfill + verify**: prove projection gate booleans populated for 100% of currently-displayable `listings` rows; row-count parity `listings(displayable) == projection(displayable)` |
| **Filter parity gap** | `getUnsupportedProjectionCriteria` (`criteria-to-prisma.ts:163`) exists → some criteria aren't projection-native; `/search` also does in-app `applyPublicListingPostFilters` (amenities/keywords/furnished/ownership) | **Parity matrix**: every `/search` param proven to map to a projection column or a retained post-filter; no filter silently dropped |
| **Dual-write lag** | dual-write is non-blocking (`listing-search-projection.ts`); a failed/late write → projection stale vs `listings` | **Freshness check**: max projection `modified_at` lag SLA + a reconcile/backfill job; alarm on drift |
| **DTO field coverage** | projection lacks `raw_data`/full `features` → some public-DTO fields (FARE fees, remarks, media) come from elsewhere | **Confirm** the DTO builder joins `listing`/`listing_media` for those, or projection carries them |
| **Stale price/status (pre-existing)** | unchanged by PR 5B (still DB-cached) | out of scope; track separately |

## Per-surface impact
- **Public `/search`** — primary target; gains the gate composite + postal_code + searchable_text. **Most affected.**
- **Homepage Featured / Mallan exclusives** — both call `/api/listings`; benefit automatically. `is_exclusive` column makes the SL-/RL- identity a fast indexed filter instead of `listing_id startsWith`. Verify Featured ordering + studio rules (Scope C rules 1–3) on projection rows.
- **Agent pages** — read `listings` by `agent_id` + Trestle; the projection has no `agent_id` → **stays on `listings`** (no change). 
- **CRM lookup / edit loaders** — authenticated, need full row + `raw_data` hydration → **stay on `listings`** (no change).
- **Listing detail `/listing/[...slug]`** — DB-first findUnique by `listing_id` + Trestle; **stays on `listings`** (projection is a search index, not a detail source).
- **Saved-search alerts** — already on the projection; PR 5B makes on-site search consistent with alert emails (net positive).

## Tests that prove search correctness (required in the PR)
1. **Row-count parity** test: `count(displayable listings)` == `count(displayable projection)` (fails if backfill incomplete).
2. **Per-filter parity** suite: for each `/search` param (type, price, beds, baths, borough, neighborhood→postal_code, sub_type, amenities, keywords, furnished, exclusive, new-dev), assert projection results == current `listings` results on a fixture set.
3. **Gate tests**: a row with `idx_display_yn=false` / `owner_opt_out` / `participant_only` / terminal status never appears (fail-closed on null gate).
4. **Exclusive ordering / studio rules** (Scope C 1–3) on projection rows.
5. **Address search**: `searchable_text` returns the same hits as the old JSON `string_contains` on a fixture.
6. **DTO PII**: projection→public DTO still omits internal/PII (Scope C rule 10).
7. **Freshness**: dual-write lag within SLA after a CRM edit + an idx-sync.
8. **[needs-probe]** live preview-URL parity on a few real queries (proof-first; source-grep insufficient for rendering).

## Recommendation (sequencing)
1. **P1 index pack on `listings` first** (additive, safe, independent) — makes live search healthy now.
2. **PR 5B backfill + parity gate** (read-only verification + a backfill PR) — prove the projection is complete & parity-correct.
3. **PR 5B reader swap** — only after (2) passes, behind the test suite above. Keep `listings` as the reader for CRM/agent/detail.
4. Address-search `searchable_text`/GIN can ride with the swap.

**No code yet** — this memo is the decision artifact. If you approve "yes, stage PR 5B," I'll start with the read-only backfill/parity verification (not the swap). If you prefer to defer PR 5B, P1 alone still materially improves live search.
