# FRONTEND-UX-RISKS.md — Conversion-Impact Ranking

> **Maintained by:** Mallan Search Cartographer.
> Top-5 buyer/renter drop-off risks, refreshed every run.

## Severity rubric

- **CRIT** — User CANNOT find the right inventory (wrong-API call, total search failure, listing detail crash).
- **HIGH** — Inventory visible but cards/photos broken; common queries return 0; visible state contradicts URL.
- **MED** — Filter or sort UX confusing; address-detail wrong (e.g., "New York City" everywhere).
- **LOW** — Cosmetic / minor UI glitch (e.g., `unitNumber: "None"`).

## Top-5 active risks (as of 2026-05-14)

### 1. Autocomplete returns 0 for numeric and building-name queries (HIGH)

**Defect IDs:** R-425, R-AFFIRM-SUGGEST, R-CARNEGIE-FALSEPOS
**Impact:** Users typing `425`, `Carnegie`, `222`, `Hudson Yards` see empty dropdowns. They abandon the typeahead and either type the full address (often producing 0 results because of R-Q-IGNORED) or leave.
**Reproducers in production logs:**
- `/api/listings/suggest?q=425` → 0
- `/api/listings/suggest?q=Carnegie` → 0
**Recommended PR:** PR-S.1 (single-file fix, ~15 lines, see KNOWN-REGRESSIONS R-425).
**ETA to material visible improvement:** same day as PR merge.

### 2. Visible tab disagrees with URL on Header link clicks (MED-HIGH)

**Defect ID:** R-TAB-DRIFT
**Impact:** Users clicking Header dropdown links land on the right URL but the search-page UI doesn't follow. They see Buy listings while URL says Rent, or vice versa. Bookmarks and shared URLs become misleading.
**Reproducer:** open `/search?tab=buy-residential`, click Header → Rent → Residential. URL updates, tab indicator stalls on Buy.
**Recommended PR:** PR-S.2 (single useEffect, ~5 lines).
**ETA to fix:** trivial.

### 3. `/api/listings` silently ignores `q=` (MED)

**Defect ID:** R-Q-IGNORED
**Impact:** Address suggestions selected from autocomplete write `q=...` to URL. The list endpoint ignores `q=`, so the result set is unfiltered. User typed an address and sees the full default set sorted by price-desc.
**Recommended PR:** PR-S.3 (route reads `q` as fallback to `address`, OR search page writes `address` instead of `q`).

### 4. Neighborhood text returns 502 Bad Gateway (HIGH when triggered)

**Defect ID:** R-TRIBECA-502
**Impact:** Searching "Tribeca", "Soho", "Williamsburg" can return HTTP 502. Hard failure visible to user.
**Reproducer:** `curl 'https://mallan.nyc/api/listings?address=Tribeca&type=sale&limit=10'` → 502
**Recommended action:** READ-ONLY investigation first — capture exact failing OData query from production logs. Then patch `lib/search/public-listing-trestle.ts`.

### 5. ~10% of listings render as blank cards (MERGED-PENDING-VERIFY → expected HIGH→LOW)

**Defect ID:** R-DB-MEDIA-GAP
**Status:** PR #120 merged 2026-05-14T17:41Z. Awaiting production deploy verification.
**Baseline:** sales 10.5%, rentals 12.5% blank cards.
**Expected post-deploy:** ~1.5% (residue of truly-photo-less listings + 1.5s-timeout misses).

## Below the top 5 (tracked, not yet ranked CRIT/HIGH)

- **R-CITY-NYC** — every listing shows `city: "New York City"` regardless of borough. LOW cosmetic. Borough is correct on map and chip pills; only the textual display is off.
- **R-UNIT-NONE** — literal `"None"` instead of `null` for missing unit numbers. LOW.
- **R-NEIGH-NARROW** — neighborhood text doesn't widen to ZIP set. MED — Hudson Yards / Tribeca-style searches return only literal matches.

## Conversion-flow-killers (cross-cutting)

The combination of R-425 + R-AFFIRM-SUGGEST + R-Q-IGNORED is the single biggest conversion bug today:

1. User on /search types "425 park" → autocomplete shows nothing (R-425 + R-AFFIRM)
2. User hits Enter / clicks Search → no submit handler bound to /search input
3. User types address fully → still no autocomplete
4. User gives up and clicks a featured listing → fine
5. OR user clicks a card → fine
6. OR user opens the filter panel → fine

The funnel breaks specifically at "I want to find a known address." Compounds with R-CARNEGIE-FALSEPOS for users who try building names.

## Floorplan-only listings (NOT a defect, but conversion-relevant)

- ~0.5% of listings have only FloorPlan media (agent didn't upload photos).
- The resolver correctly falls back to FloorPlan as primary.
- UX risk: card looks like a photo but is a floorplan. Suggested follow-up: add a "Floor Plan" caption overlay when `isFloorPlanFallback=true`.

## What the Cartographer must do each run

1. Re-rank top-5 by severity × incidence × time-to-fix.
2. For each entry, refresh the reproducer URL response and update observed values.
3. Update the conversion-flow-killers section with the current biggest combined defect.
4. Cross-link every entry to `KNOWN-REGRESSIONS.md`.
5. Surface this file's top-3 in `memory/audits/AUDIT-YYYY-MM-DD.md` section C (Top 5 risks).

## Cross-links

- Regressions: `KNOWN-REGRESSIONS.md`
- API impact: `API-MAP.md`
- Components: `COMPONENT-MAP.md`
