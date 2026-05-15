# KNOWN-REGRESSIONS.md — Active and Closed Defects

> **Maintained by:** Mallan Search Cartographer.
> Format: dated, with reproducer + status. Closed entries kept for audit history.

## Status legend

- **OPEN** — defect observed, no fix in flight.
- **IN PROGRESS** — fix authored / PR open.
- **MERGED-PENDING-VERIFY** — fix merged, awaiting cron / production run to confirm.
- **CLOSED-VERIFIED** — fix merged + production-verified + at least one Cartographer run since.

---

## Active regressions (as of 2026-05-14)

### R-425 — Autocomplete returns 0 for numeric queries like "425"

- **Status:** OPEN
- **Found:** 2026-05-14 (PR-E.1 investigation + user-reported)
- **Surface:** `/api/listings/suggest`, `/search` SearchAutocomplete, homepage HeroSearch
- **Reproducer:** `curl 'https://mallan.nyc/api/listings/suggest?q=425'` → `{success:true, suggestions:[]}`
- **Expected:** ≥1 address suggestion starting with "425" (e.g., "425 Park Avenue South")
- **Root cause:** `app/api/listings/suggest/route.ts:146` — `/^(RLS|rls)?\d{3,}$/` regex treats "425" as a listing ID; address-search branch is skipped. Compounding: `isZip = /^\d{3,5}$/` is also true; ZIP-prefix branch runs and returns 0 because no NYC zip starts with "425".
- **Recommended PR:** PR-S.1 (tighten listing-ID regex to `^(RLS|rls)\d{4,}$|^\d{6,}$`, restrict ZIP regex to `^\d{5}$`)
- **Conversion impact:** HIGH — numeric address search is broken site-wide.

### R-AFFIRM-SUGGEST — Suggest endpoint fail-CLOSED on provider-gated field

- **Status:** OPEN
- **Found:** 2026-05-14 (cross-check against REBNY skill §2.1.1)
- **Surface:** `/api/listings/suggest` lines 165 + 279
- **Reproducer:** `curl 'https://mallan.nyc/api/listings/suggest?q=Carnegie'` → 0 suggestions even though Trestle has BuildingName matches
- **Expected:** address/building suggestions matching the query
- **Root cause:** `affirmPermission(raw.InternetAddressDisplayYN)` returns false for null values; REBNY IDX Plus returns null for the vast majority of records (provider pre-filter). The 2026-04-30 fix (commit `0309875b`, REBNY skill §2.1.1) applied this only to the trestle-mapper writer, not the suggest endpoint.
- **Recommended PR:** PR-S.1 (replace `affirmPermission` with `!== false`)
- **Conversion impact:** HIGH — building-name search is broken site-wide.

### R-TAB-DRIFT — `activeTab` state doesn't re-sync when URL `?tab=` changes

- **Status:** OPEN
- **Found:** 2026-05-14 (user-reported with screenshot)
- **Surface:** `app/search/page.tsx`
- **Reproducer:**
  1. Open `/search?tab=buy-residential`
  2. Click Header → Rent → Residential (Next.js client-side `<Link>`)
  3. Observe URL: `/search?tab=rent-residential`
  4. Observe visible tab indicator: still "Buy" (stale state)
- **Root cause:** `useState(resolveTab(typeParam))` runs only on mount (line 187). No `useEffect(() => setActiveTab(resolveTab(typeParam)), [typeParam])` to re-sync.
- **Recommended PR:** PR-S.2 (single 5-line useEffect)
- **Conversion impact:** MED-HIGH — users see inventory that doesn't match the URL they're sharing/bookmarking.

### R-Q-IGNORED — `/api/listings` does not consume `q=` param

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** `app/api/listings/route.ts` + `app/search/page.tsx` `handleAutocompleteSelect`
- **Reproducer:** `curl 'https://mallan.nyc/api/listings?type=sale&q=425&limit=20'` → returns full 9,610-listing default set (q ignored)
- **Expected:** filtered to listings matching "425"
- **Root cause:** `app/search/page.tsx:486` sets `params.set('q', suggestion.value)` for address suggestions. But `app/api/listings/route.ts` only reads `address=`. The two surfaces use different param names.
- **Recommended PR:** PR-S.3 (alias `q` → `address` in the route, OR change search page to write `address=`)
- **Conversion impact:** MED — users typing in /search input don't see filtered results.

### R-NEIGH-NARROW — Neighborhood text doesn't widen to ZIP set

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** `/api/listings` address branch
- **Reproducer:** `curl 'https://mallan.nyc/api/listings?type=rent&address=Hudson+Yards&limit=10'` → 1 listing (literal match only)
- **Expected:** all rentals in the Hudson Yards neighborhood (ZIPs 10001/10018/10019)
- **Root cause:** `lib/geo/neighborhood-zips.ts` provides neighborhood-name → ZIP lookup but is not wired into the public address-search branch in `lib/search/public-listing-db.ts`.
- **Conversion impact:** MED — site appears sparse next to StreetEasy.

### R-TRIBECA-502 — Neighborhood text returns 502 Bad Gateway

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** `/api/listings` Trestle fallback path
- **Reproducer:** `curl 'https://mallan.nyc/api/listings?address=Tribeca&type=sale&limit=10'` → HTTP 502
- **Expected:** 200 with Tribeca listings
- **Root cause:** unknown — needs production log inspection. Likely a malformed OData filter for short text queries.
- **Conversion impact:** HIGH (when triggered — search appears broken).

### R-CARNEGIE-FALSEPOS — Building-name search returns wildly unrelated listings

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** `/api/listings` Trestle fallback BuildingName branch
- **Reproducer:** `curl 'https://mallan.nyc/api/listings?address=Carnegie+Hall&type=sale&limit=10'` → returns listings in Bronx, Brooklyn
- **Expected:** listings near Carnegie Hall (Midtown West)
- **Root cause:** `lib/search/public-listing-trestle.ts` widens to too many fields when BuildingName is empty (most listings have empty BuildingName).
- **Conversion impact:** HIGH — destroys search-result trust.

### R-CITY-NYC — Every listing shows `city: "New York City"`

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** Public DTO
- **Root cause:** `lib/idx/db-to-public-dto.ts:272` — `addr.City || listing.borough || 'New York'` — Trestle returns `City="New York City"` for ~100% of NYC listings, overriding borough-derived display.
- **Conversion impact:** LOW (cosmetic but undermines geographic clarity for non-Manhattan listings).

### R-UNIT-NONE — `unitNumber` is literal string `"None"`

- **Status:** OPEN
- **Found:** 2026-05-14
- **Surface:** Public DTO
- **Root cause:** `addr.UnitNumber || null` — `"None"` is truthy.
- **Conversion impact:** LOW (cosmetic).

---

## Closed regressions (kept for audit history)

### R-IDX-NULL-FAIL-CLOSED — Provider-gated fields treated as fail-CLOSED

- **Status:** CLOSED-VERIFIED
- **Found:** 2026-04-30
- **Reverted by:** commit `0309875b` (revert of `55803f87`)
- **Fix:** writer treats `InternetEntireListingDisplayYN` and `InternetAddressDisplayYN` as `!== false`; AVM + ConsumerComment remain fail-closed.
- **Locked by:** `lib/compliance/__tests__/compliance-gates.test.ts`
- **Notes:** Sister defect R-AFFIRM-SUGGEST in this file is the SAME bug on the SUGGEST endpoint — never fixed.

### R-H1-DUAL-WRITE — §2.05 terminal-status ping-pong

- **Status:** CLOSED-VERIFIED
- **Found:** 2026-05-13
- **Fixed by:** PR #112 (`df67d915`) + PR #113 (`7c61fc4f`, `cd91637f`)
- **Mechanism:** `TERMINAL_STATUSES` guard in primary writer + secondary writers + `normalizeStandardStatus()` helper.

### R-DB-MEDIA-GAP — 12% of listings showed blank search cards

- **Status:** MERGED-PENDING-VERIFY
- **Fixed by:** PR #120 (`f2bb459c`) — bounded live Trestle fallback in DB-first path
- **Baseline before:** sales 10.5% empty, rentals 12.5% empty
- **Expected after deploy:** ~1.0–1.5% (the truly-photo-less residue)
- **Verification command:** `curl https://mallan.nyc/api/listings?type=X&limit=200 | jq '[.listings[] | select(.media | length == 0)] | length'`

---

## Cartographer maintenance protocol

When the bot opens this file:
1. Read the prior version via `git show origin/main:memory/site-map/KNOWN-REGRESSIONS.md`.
2. For each ACTIVE entry, re-run its reproducer.
3. If reproducer passes (fix worked), promote to CLOSED-VERIFIED.
4. If reproducer fails (still broken), keep OPEN with refreshed observation timestamp.
5. Append any NEW defects observed this run.
6. Overwrite this file with the merged state.

## Cross-links

- Conversion ranking: `FRONTEND-UX-RISKS.md`
- Components implicated: `COMPONENT-MAP.md`
- API contracts: `API-MAP.md`
