# Cotality/Trestle Operational Contract

> Source of truth for all Cotality/Trestle/RESO integration on mallan.nyc.
> Every PR touching files listed in section 15 must cite this contract.

---

## 1. Ownership and source of truth

| System | Role |
|---|---|
| **Cotality/Trestle** | External MLS data provider. REBNY IDX Plus feed via OData v4 (`https://api.cotality.com/trestle`). Read-only consumption. |
| **RealPlus/RLS** | Listing-entry source for official REBNY/RLS listings. Maya enters listings into RealPlus; they appear in the Cotality feed. |
| **mallan.nyc** | Consumes Cotality data for public display, search, building reference, and media. Does NOT write back to Trestle. |
| **InHouse/local web** | Mallan-created website-only records (`SL-*` IDs). Not on RLS. Must be manually reconciled when an official `RLS*` feed record arrives. |

---

## 2. Auth and credentials

| Item | Value |
|---|---|
| Auth helper | `lib/idx/auth.ts` |
| Token flow | OAuth2 `client_credentials` grant → `{TRESTLE_API_URL}/oidc/connect/token` |
| Env vars | `IDX_CLIENT_ID` (or legacy `IDX_API_KEY`), `IDX_CLIENT_SECRET` (or `IDX_API_SECRET`) |
| Base URL | `TRESTLE_API_URL` or default `https://api.cotality.com/trestle` |
| Token cache | In-memory per serverless instance. Refreshes 5 min before expiry (`IDX_TOKEN_EXPIRY_BUFFER`, default 300s). |
| Success log | `[IDX Auth] Token acquired, ...` |
| Failure modes | Missing env vars: throws `[IDX Auth] Missing IDX_CLIENT_ID or IDX_CLIENT_SECRET`. Timeout: 8s abort. 401: triggers retry with fresh token. |

---

## 3. Cotality/Trestle resources used

### Property (`/odata/Property`)

| Consumer | File | Purpose |
|---|---|---|
| IDX sync cron | `lib/idx/sync.ts` | Incremental/full sync → `listings` table |
| Public listing search (Trestle path) | `lib/search/public-listing-trestle.ts` | Live OData search fallback |
| Public listing search (main route) | `app/api/listings/route.ts` | Merges DB + Trestle results |
| Single listing fetch | `lib/idx/fetch.ts` (`fetchSingleListing`, `fetchListingByAddress`) | Detail page fallback |
| Building/address lookup | `app/api/buildings/search/route.ts` | CRM form building reference |
| Building detail | `app/api/buildings/route.ts` | Public building page |
| Similar listings | `app/api/listings/similar/route.ts` | Detail page widget |
| Building units | `app/api/listings/building/route.ts` | Other units in building |
| Agent listings | `app/api/agents/[slug]/listings/route.ts` | Agent profile page |
| Market data | `app/api/market/route.ts` | Market snapshot widget |
| Address suggest | `app/api/listings/suggest/route.ts` | Search autocomplete |
| IDX search | `app/api/idx/search/route.ts` | CRM Trestle-direct search |

### Media (`/odata/Media`)

| Consumer | File | Purpose |
|---|---|---|
| IDX sync (batch media) | `lib/idx/sync.ts` | Fetch media per-listing during sync |
| Single listing media | `lib/idx/fetch.ts` (`fetchListingMedia`) | Detail page media fallback |
| Media sync service | `lib/media/media-sync-service.ts` | R2 upload pipeline |
| Media batch | `app/api/media/batch/route.ts` | Batch media fetch |
| Media proxy | `app/api/media/proxy/route.ts` | Proxy Trestle image URLs |

### OpenHouse (`/odata/OpenHouse`)

| Consumer | File | Purpose |
|---|---|---|
| Open house page | `app/api/open-houses/route.ts` | Public open house listings |
| Listing search (OH filter) | `app/api/listings/route.ts` | Filter by upcoming open houses |

### Member / Office

Referenced in `data/RLS-FIELD-REGISTRY.md` (**DEPRECATED / HISTORICAL SNAPSHOT 2026-03-20 — NOT field authority; verify live against Cotality**) but not actively queried in current routes. Available at `/odata/Member` and `/odata/Office`.

---

## 4. Address/building lookup contract

### RESO structured address fields (from `artifacts/metadata.xml`)

| Field | Type | Example | Purpose |
|---|---|---|---|
| `StreetNumber` | String(25) | `"333"` | Numeric street number |
| `StreetDirPrefix` | Enum `StreetDirection` | `"E"` | Directional prefix |
| `StreetName` | String(50) | `"46TH"` | Street name WITHOUT direction |
| `StreetSuffix` | Enum `StreetSuffix` | `"St"` | Street type |
| `UnitNumber` | String(25) | `"17C"` | Apartment/unit |
| `CityRegion` | String | `"Manhattan"` | Borough |
| `PostalCode` | String | `"10017"` | ZIP code |
| `UnparsedAddress` | String(255) | `"333 E 46TH St"` | Display-only concatenation |

### StreetDirection enum values

`E`, `N`, `NE`, `NW`, `S`, `SE`, `SW`, `W`

### Rules

- `StreetDirPrefix` is **separate** from `StreetName`. "East" is NOT part of the street name.
- Direction values normalize to single uppercase letters: East→E, West→W, North→N, South→S.
- `StreetName` contains the name portion only (e.g., `"46TH"`, `"PARK"`, `"BROADWAY"`).
- Use structured fields for matching. `UnparsedAddress` is for display/fallback only.
- Ordinal suffixes may or may not be present in `StreetName` (Cotality stores both `"46TH"` and `"46"`). Strip ordinals before searching.

---

## 5. Required Cotality OData address-search pattern

### Proven working pattern

Source: `lib/search/public-listing-trestle.ts:100-111`

```
startswith(StreetNumber,'333')
and StreetDirPrefix eq 'E'
and contains(tolower(StreetName),'46')
```

### Required elements

| Element | Pattern | Why |
|---|---|---|
| StreetNumber | `startswith(StreetNumber,'333')` | Handles partial input; `eq` is acceptable for exact-only |
| StreetDirPrefix | `StreetDirPrefix eq 'E'` | Enum comparison, uppercase single letter |
| StreetName | `contains(tolower(StreetName),'46')` | **Must use `tolower()`** — Cotality stores mixed case |
| Strip suffixes | Remove Street/St/Ave/Avenue/Blvd/Rd etc. before searching | Not part of `StreetName` field |
| Strip ordinals | Remove TH/ST/ND/RD from digits before searching | `46TH` → `46` for reliable matching |
| Lowercase search token | Search term must be lowercased for `tolower()` comparison | Case-insensitive matching |

### Forbidden patterns

| Pattern | Why forbidden |
|---|---|
| `contains(StreetName,'46TH')` without `tolower()` | Case-sensitive. Fails on mixed-case data. |
| `contains(StreetName,'EAST')` | "East" is in `StreetDirPrefix`, not `StreetName` |
| `StreetNumber eq '333'` for partial/typeahead | Too strict for incremental input. Use `startswith`. |
| Guessing from unparsed full address | Must parse into RESO components first |

---

## 6. Site routes that use Cotality/Trestle

### CRM-authenticated routes (require agent/broker session)

| Route | File | Auth | Purpose |
|---|---|---|---|
| `GET /api/buildings/search` | `app/api/buildings/search/route.ts` | Agent/broker | CRM form building lookup |
| `GET /api/idx/search` | `app/api/idx/search/route.ts` | Agent/broker | CRM Trestle-direct search |
| `GET /api/idx/status` | `app/api/idx/status/route.ts` | Agent/broker | IDX connection status |

### Public routes (no auth, cached)

| Route | File | Auth | Purpose |
|---|---|---|---|
| `GET /api/listings` | `app/api/listings/route.ts` | Public | Main listing search |
| `GET /api/listings/[id]` | `app/api/listings/[id]/route.ts` | Public | Detail page data |
| `GET /api/buildings` | `app/api/buildings/route.ts` | Public | Building detail page |
| `GET /api/open-houses` | `app/api/open-houses/route.ts` | Public | Open house listings |
| `GET /api/media/proxy` | `app/api/media/proxy/route.ts` | Public | Trestle image proxy |

### Cron routes (internal)

| Route | File | Purpose |
|---|---|---|
| `GET /api/cron/idx-sync` | via `lib/idx/sync.ts` | Incremental Property sync |
| `GET /api/cron/media-sync` | via `lib/media/media-sync-service.ts` | Media → R2 pipeline |

### Error behavior

- **401 from endpoint** = CRM session expired. User must log in again.
- **200 with empty results** = Query/data issue. Check OData filter, field casing, StreetDirPrefix.
- **No request in logs** = Frontend not calling endpoint. Check which input field user is typing in.
- **Trestle auth failure** = Env var missing or Cotality down. Check `[IDX Auth]` log messages.
- **Stale candidates** = Frontend must clear `saleBuildingSearchResults` on empty API response.

---

## 7. CRM form integration rules

### Building Search field (`saleBuildingSearch`)

- Input with magnifying glass icon, above Street Address.
- Calls `searchBuildingForListing()` → `fetchBuildingsFromAPI(query)` → `GET /api/buildings/search?q=...` on every keystroke after 3 chars (300ms debounce).
- Shows candidate list in `saleBuildingSearchResults`.

### Street Address field (`saleStreetAddress`)

- Main address input field.
- Calls `saleAddressBlurLookup()` on blur (tab/click away).
- Must check local `buildingDatabase` cache first, then fall back to `fetchBuildingsFromAPI(addr)` if no local match.
- Empty API result must clear stale candidates and hide `saleBuildingSearchResults`.

### Address overwrite rules

- Non-InHouse: Cotality match auto-populates address fields directly.
- InHouse: If Cotality match differs materially from typed address, show `confirm()` dialog. Cancel keeps typed address but still populates building/property fields.
- Never silently overwrite a manually entered address with a different Cotality match for InHouse listings.

### Key distinction

| Concept | Purpose | Allowed for InHouse? |
|---|---|---|
| Cotality building/address reference lookup | Verify address, populate building data, detect property type | YES |
| IDX/RLS public distribution/syndication | Send listing data to public feed, portals, IDX consumers | NO |

These are NOT the same thing. Lookup is reference data. Distribution is feed publication.

---

## 8. InHouse/local web listing rules

### Lookup
InHouse listings may use Cotality/Trestle lookup as reference data for address verification and building field population.

### Distribution (must be OFF)

| Gate | Value |
|---|---|
| `IDXEntireListingDisplayYN` | `false` |
| `InternetEntireListingDisplayYN` | `false` |
| `InternetAddressDisplayYN` | `false` |
| `SyndicateYN` | `false` |

### Backend

- POST `app/api/crm/listings/route.ts`: InHouse → `explicitOptOut=true` → `rls_eligible=false`
- PATCH `app/api/crm/listings/[id]/route.ts`: same

### URL

Uses existing `/listing/<slug>` detail route. No separate `/exclusives` route unless separately approved.

### Reconciliation with official feed

| Phase | Action |
|---|---|
| Before feed arrives | Show manual `SL-*` listing. Pin in FeaturedConfig. URL = `/listing/<slug>-sl0042`. |
| After feed arrives | **Local `SL-*`/`RL-*` REMAINS CANONICAL.** The returned `RLS*` row is the Mallan RLS return-copy: retained internally for source/audit/reconciliation, SUPPRESSED from every public canonical surface. Do NOT withdraw the local row, do NOT pin `RLS*`, do NOT switch the public URL. RealPlus URL handling is OUTSIDE this system. See REPO-SOURCE-OF-TRUTH-CHARTER.md Section 1A. |

Manual process. No automated dedup exists. `SL-*` and `RLS*` are separate DB rows with different `listing_id` key spaces.

---

## 9. Listing sync/upsert contract

| Item | Value |
|---|---|
| Source | Cotality/Trestle OData Property resource |
| Upsert key | `listing_id` (Trestle's `ListingId` field) |
| RLS IDs | `RLS*` format (e.g., `RLS20061539`) |
| Local IDs | `SL-*` (sale) / `RL-*` (rental) — CRM-generated |
| Address dedup | Does NOT exist. Sync only matches by `listing_id`. |
| Canonical relationship | Does NOT exist in schema. Use `raw_data._anticipatedRlsListingId` for manual cross-reference. |
| Duplicate prevention | Different key spaces prevent accidental overwrite. Visual duplicate = two rows for same address. |
| Reconciliation | **Local Mallan row stays canonical; Cotality return-copy is publicly suppressed and retained internally.** No withdrawal, no pinning of `RLS*`, no RealPlus URL step in this system. See CHARTER Section 1A. |

---

## 10. Featured Listings contract

| Item | Value |
|---|---|
| Source | `FeaturedListings.tsx` fetches from `/api/listings` + `/api/featured-config` |
| Pinning | `FeaturedConfig.pinned_ids` array. Broker-only PATCH at `/api/featured-config`. |
| InHouse pin | Add `SL-*` listing_id to `pinned_ids`. Pinned listings sort first. |
| Transition | Keep the local `SL-*`/`RL-*` in `pinned_ids` when the official feed listing arrives. The returned `RLS*` copy is publicly suppressed and must NOT be pinned in its place (CHARTER Section 1A). |
| Forbidden | No fake/static listing data. No separate `/exclusives` route. No demo data. |

---

## 11. Media/photo contract

| Item | Value |
|---|---|
| Cotality media | Fetched via `/odata/Media?$filter=ResourceRecordKey eq '...'` |
| Key discipline | Use `ResourceRecordKey` (= `ListingKey`, unique across MLOs). NOT `ResourceRecordID` (may duplicate). |
| Local storage | R2 via `lib/media/media-sync-service.ts`. URLs at `images.mallan.nyc`. |
| Proxy | `app/api/media/proxy/route.ts` for direct Trestle URLs. |
| InHouse media | Uploaded directly by Maya (not from Cotality). Stored in R2 or referenced by URL. |
| Fallback | Placeholder image when no photos available (`LISTING_PLACEHOLDER_IMAGE`). |

---

## 12. Compliance rules

### Before public display (all listings)
- Fair Housing language check (no protected-class targeting)
- NY DOS 19 NYCRR 175.25 (no misleading advertising)
- Brokerage attribution: "Mallan Real Estate Inc."
- Broker license: #10991205323
- Contact: 646-258-4460

### Before RLS/feed display (RLS-eligible only)
- REBNY RLS validation (`validateListing`)
- RLS enforcement gate (`assertRlsCompliantPayload`)
- UCBA distribution gates must be ON
- `rls_eligible = true`

### Before InHouse website-only display
- Fair Housing + NY DOS advertising rules still apply
- No RLS validation needed
- No UCBA distribution gates needed
- `rls_eligible = false`
- If rental: FARE Act disclosure required

### IDX disclaimer
- Required on pages showing third-party IDX data
- NOT required on InHouse/website-only listings

---

## 13. Error handling and production debugging

### Debug checklist

1. **Production SHA** — `gh pr view --json mergeCommit` or Vercel deployment inspector
2. **Deployment ID** — Vercel MCP `list_deployments` or inspector URL
3. **Endpoint hit?** — Check Vercel runtime logs for the path
4. **Status code** — 200 = query/data issue; 401 = session expired; 500 = server error
5. **Response body** — `{ buildings: [] }` = empty results; `{ error: "..." }` = auth/validation
6. **Auth session** — Is `session_token` cookie present? Is `/api/auth/me` returning 200?
7. **Cotality token** — Look for `[IDX Auth] Token acquired` in logs
8. **OData filter** — Add `console.log` to the route temporarily if needed
9. **First 3 results** — If data returns, check normalized addresses

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| 401 on `/api/buildings/search` | Session expired | Log out and back in |
| 200 empty results | OData filter wrong (missing `tolower`, wrong field) | Fix filter per section 5 |
| No request in logs | Frontend not calling endpoint | Check which input field is used; verify blur handler |
| Token acquisition fails | Env vars missing or Cotality down | Check `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET` in Vercel env |
| Stale candidates visible | Frontend not clearing results on empty response | `saleBuildingSearchResults.classList.add('hidden')` |
| Production not updated | Vercel deployment stale | Check deployment SHA matches expected commit |

---

## 14. Testing contract

Every PR touching Cotality/Trestle/address/listing form/search must include tests for:

- [ ] Directional address parsing (E/W/N/S detection and separation)
- [ ] Cotality OData filter shape (uses `tolower()`, `startswith()`, correct fields)
- [ ] Street Address blur fallback (calls API when cache misses)
- [ ] Stale candidate cleanup (hidden on empty results)
- [ ] InHouse lookup enabled (not suppressed)
- [ ] InHouse distribution OFF (all 4 gates false)
- [ ] `rls_eligible=false` for InHouse POST/PATCH
- [ ] No `/api/listings` reader or `ListingSearchProjection` changes unless explicitly approved

---

## 15. Change-control rule

Any PR touching these files must cite this contract in the PR body:

- `lib/idx/*`
- `lib/search/public-listing-trestle.ts`
- `app/api/buildings/search/*`
- `app/api/buildings/*`
- `public/crm/SALE-FORM-REDESIGN.html` (building lookup sections)
- `public/crm/RENTAL-FORM-REDESIGN.html` (building lookup sections)
- Cotality/Trestle sync code (`lib/idx/sync.ts`)
- Listing search/detail DTOs (`lib/idx/public-dto.ts`, `lib/idx/db-to-public-dto.ts`)
- `app/components/FeaturedListings.tsx`
- `app/api/featured-config/route.ts`

The PR body must state the change category:

| Category | Description |
|---|---|
| address lookup | Building/address search endpoint or parser |
| listing search | Public `/api/listings` or Trestle search |
| sync/upsert | IDX sync cron or listing upsert |
| media | Photo/media pipeline or proxy |
| featured listing | FeaturedConfig or homepage display |
| InHouse/local web | InHouse listing type, distribution gates, rls_eligible |
| compliance | Display gates, disclaimers, attribution |
| auth/session | Trestle OAuth or CRM session |
| debug/logging | Diagnostic logging or error handling |
