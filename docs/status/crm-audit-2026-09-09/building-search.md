> **STATUS HEADER (added 2026-09-10) — findings preserved; the fix plan below has already been executed.** This is the dated read-only audit of 2026-09-09. Its §5 / §6 / §7 were carried out on 2026-09-09/10 — the blanket `refuse('Building search')` is gone, the Buildings panel was rebuilt to executable controls, results are grouped in Mallan code, and `tests/runtime/crm-building-search-executes.test.ts` is green (22/22, re-run 2026-09-10). What actually changed, and what was deliberately left open, is recorded in `docs/status/crm-audit-2026-09-09/repair/search-cma-nav.md`. **Do not re-execute the plan from this file — read that repair report first.** Architecture note: the surfaces audited here (`public/crm/index.html` → generated `index-built.html`, `js/search/**`, `js/render/**`) belong to the **Backend Agent Search / Listings** application, served at **`/crm/search`** — not to the Brokerage CRM (`public/crm/dashboard.html` + `js/dashboard/**`, served at `/crm`). See `CLAUDE.md` §A.0 and Master Plan §5.1. The directory name `crm-audit-` predates that correction (commit `928f31c4`, 2026-09-10) and is kept for provenance.

# BUILDING SEARCH — read-only investigation report

Nothing was edited. All facts below are from direct Read/grep of the repo plus the committed live-Cotality contract artifacts (`data/cotality-contract/**`, pulled 2026-09-08). **No live Cotality/Neon/Vercel call was made** — the Class-B provider claims below rest on the committed live pull, which is the repo's declared field authority (`CLAUDE.md` §H), not on a query I ran.

---

## 0. Executive answer to the three questions you asked

| Question | Answer | Evidence |
|---|---|---|
| Is there a separate **Building resource** on this entitlement? | **Declared in $metadata, but NOT ENTITLED — HTTP 403.** Both its navigations are provider-rejected. Cotality's building identity key on Property (`BuildingKeyNumeric`) is **SUPPRESSED — null on all 591,597 rows**. | `lib/cotality/generated/contract.ts:601`, `:3756`; `data/cotality-contract/contract.compact.json:20-25`; `docs/operations/evidence-2026-09-08/search-coverage-matrix.md:11`, `:33`, `:54`, `:784`, `:1723` |
| So what IS a Building search here? | A **Property query** narrowed by address atoms / `BuildingName` / building facts, then **grouped in Mallan code**. There is no provider-side building entity, no building key, and no lat/lng. | below, §2 |
| Is removing the refusal safe? | **NO. Absolutely not.** Removing line 324 alone would ship a Buildings tab that silently returns an ordinary *sale* listing search. Six other things must exist first. | §5 |

---

## 1. DEFECTS

### D1 — The refusal (the confirmed one), and it is not the only refusal
`public/crm/js/search/search-engine.js:324`
```js
if (criteria.searchTab === 'building') refuse('Building search');
```
Wrong because the tab, the button, the whole 422-line panel and the persisted `sessionStorage['searchTab']='building'` all exist and are reachable, so the product presents an executable-looking mode whose only possible outcome is the toast `Not executable in this Search: Building search`. (`search-engine.js:181-184` in `performSearch`, `:397-401` in `_serverSearch`.)

A second, independent refusal fires for the same tab:
`public/crm/js/search/search-engine.js:311` + `:371`
```js
['buildingName', 'Building Name'], …
_NOT_EXECUTABLE.forEach(function(p) { if (_isSet(criteria[p[0]])) refuse(p[1]); });
```
`criteria.buildingName` is only ever set when `currentSearchTab === 'building'` (`:1078-1081`). So deleting line 324 leaves the Building tab still refusing the moment the user types a building name.

### D2 — **The Building tab's panel is dead DOM. The BUILDINGS tab renders the SALE form.**
This is the biggest defect on this surface and it is not the refusal.

`public/crm/html/search-form-and-results.html:1651`
```html
<div id="searchBasicModeBuilding" class="bg-white rounded-xl shadow-sm border p-5" style="display: none;">
```
`public/crm/js/search/search-engine.js:1900-1910` (`toggleSearchTab`)
```js
// Unified basic form (data-show-on handles section visibility per tab)
var basicMode = document.getElementById('searchBasicMode');
```
`toggleSearchTab` toggles **only** `#searchBasicMode` and `#searchAdvancedMode`. It never references `#searchBasicModeBuilding`. The **only** other reference to that id in the entire JS tree is `public/crm/js/init/init-ui.js:37`, which merely converts its `<select>`s into custom dropdowns. Grep proof: `searchBasicModeBuilding` appears in `public/crm/js/**` exactly once, at `init-ui.js:37`.

Consequences:
1. Clicking **BUILDINGS** (`search-form-and-results.html:63`, `onclick="toggleSearchTab('building')"`) recolors the button and leaves the **sale** basic form on screen — sale price, sale beds/baths, the `basic-sale` status panel. Not one Building control is visible, ever.
2. `collectSearchCriteria` reads `document.getElementById('searchBasicMode')` (`search-engine.js:704`) — the sale panel — so no Building control could be collected even if it were visible.
3. The comment on `:703`/`:1907` says "`data-show-on` handles section visibility per tab". **`data-show-on` occurs 0 times in `search-form-and-results.html`** (`grep -c` = 0). The comment documents machinery that does not exist.

Collateral (same root cause, adjacent surface — flagging, not claiming as mine): `#searchBasicModeRental` (`:878`) is dead the same way, and `data-status-mount="basic-rental"` lives at `:894` **inside that hidden panel**, so a rent search collects statuses from a panel the user cannot see or touch.

### D3 — 27 of the Building panel's 52 `data-field` controls name fields that DO NOT EXIST on live Cotality Property
Checked every `data-field` in lines 1651–2073 against `data/cotality-contract/contract.compact.json` → `resources.Property.fields`:

| `data-field` | controls | live Property field? | example line |
|---|---|---|---|
| `BuildingRules` | 10 | **ABSENT** | `:1796`, `:1803-1810` |
| `AttendanceType` | 6 | **ABSENT** | `:1829-1834` |
| `BuildingLaundryFeatures` | 3 | **ABSENT** | `:1802`, `:1819` |
| `BuildingPetsAllowed` | 2 | **ABSENT** | `:1795`, `:1804` |
| `MaximumFinancingPercent` | 2 | **ABSENT** | `:1800`, `:1808` |
| `RentingAllowedYN` | 2 | **ABSENT** | `:1801`, `:1809` |
| `BuildingPoolFeatures` | 1 | **ABSENT** | `:1841` |
| `BuildingSecurityFeatures` | 1 | **ABSENT** | `:1843` |
| `CRM` | 1 | not a field at all | `:1794` (`Advertising (CRM)`) |

The repo already knows this: `app/api/buildings/search/route.ts:790-800` documents removing `AttendanceType`, `NewDevelopmentYN`, `SponsorUnitYN`, `RentingAllowedYN` because "none exist on the live Cotality Property entity … Their presence made Trestle reject the whole `$select` with HTTP 400." The Building search panel still ships all of them.

### D4 — Five member tokens in the Building panel are not live vocabulary members
Checked against `data/cotality-enums.live.json` → `resources.Property` (pulled 2026-09-08):

| control | field | token | verdict | line |
|---|---|---|---|---|
| Loft | `StructureType` | `Loft` | **not a member** (23 live members; no `Loft`) | `:1885` |
| Walk-Up | `StructureType` | `WalkUp` | **not a member** | `:1888` |
| Brownstone | `ArchitecturalStyle` | `Brownstone` | **not a member** (135 members) | `:1887` |
| Roof Deck | `ExteriorFeatures` | `RoofDeck` | **not a member** (152 members) | `:1878` |
| Accessible | `AccessibilityFeatures` | `WheelchairAccessible` | **not a member** (76 members) | `:1848` |

(`HighRise`, `Townhouse`, `Courtyard`, `Storage`, `FitnessCenter`, `HealthClub`, `Elevators`, all four `CommonInterest` tokens are live.) Live `StructureType` also publishes `LowRise` and `MidRise`, which the panel does not offer — it fakes Low-Rise as `StoriesTotal lte:6` (`:1886`).

### D5 — `criteria.financingMin` is silently DROPPED, not refused
`public/crm/js/search/search-engine.js:971-979`
```js
var finMinId = currentSearchTab === 'rent' ? 'rentalBuildingFinancingMin' :
               currentSearchTab === 'building' ? 'buildingFinancingMin' : 'saleBuildingFinancingMin';
…
if (!isNaN(fv) && fv > 0) criteria.financingMin = fv;
```
`financingMin` is neither serialized (`:315-373`) nor listed in `_NOT_EXECUTABLE` (`:304-313`). It is the ONLY criteria key produced by `collectSearchCriteria` that is neither executed nor refused. That is exactly the "silent widening of the universe" the module's own header comment (`:315`, `criteria.ts:15-16`) forbids. `#buildingFinancingMin` (`search-form-and-results.html:2046`) is a Building-tab control, so this is a Building-surface defect. (Related: the field it purports to filter, `MaximumFinancingPercent`, does not exist on the feed — D3.)

### D6 — The Manhattan Grid section of the Building panel can never execute on this feed
`search-form-and-results.html:1745-1750` renders `#bldg-grid-north/west/east/south`. `public/crm/js/search/manhattan-grid.js:76-79` converts those to `Latitude ge/le` + `Longitude ge/le`. But:
- `Latitude` → `filterable: false, populated: null`; `Longitude` → same (`contract.compact.json` `resources.Property.fields`).
- `docs/operations/evidence-2026-09-08/search-coverage-matrix.md:1723` lists `Latitude` and `Longitude` among the fields that are **SUPPRESSED — null on all 591,597 rows, all statuses**.

Independently, the selects are inert regardless: each carries a single `<option>North</option>` with no `value` and nothing populates them (`:1745-1750`), `streetToLat('North')` → `NaN` → `null` (`manhattan-grid.js:13-20`), and the second grid column (`:1752-1758`) has **no ids at all**, so `clearManhattanGrid()` (`manhattan-grid.js:120-123`) cannot even reach it. `criteria._gridBounds` is listed in `_NOT_EXECUTABLE` but is never assigned anywhere in `collectSearchCriteria`.

### D7 — `MallanAPI.idx.search` JSDoc advertises Building params it does not forward
`public/crm/js/core/api-client.js:718`
```js
* @param {object} params - { type, minPrice, …, minYear, maxYear, minFloors, maxFloors, minUnits, maxUnits, buildingName }
```
`search()` (`:720-745`) forwards none of `minYear/maxYear/minFloors/maxFloors/minUnits/maxUnits/buildingName`. (It also drops `backOnMarket`, which `serializeSearchCriteria:346` sets and `criteria.ts:120` accepts — adjacent surface, flagging only.)

### D8 — Existing "building search" test coverage is source-grep only
`tests/runtime/buildings-search-ui-hints.test.ts:13-15` slices `SALE-FORM-REDESIGN.html` as a string and `expect(fnBody).toContain(...)`. **It never executes `fetchBuildingsFromAPI`, never mounts a DOM, never asserts a returned record.** Per your brief: *insufficient*. `tests/runtime/search-audience-wiring.test.ts` is the same shape. There is **zero** executing test for any Building-tab behaviour.

---

## 2. WHAT THE CORRECT PROVIDER AUTHORITY IS (with evidence)

**There is no Building resource available. A Mallan "Building search" is a `Property` query, grouped in Mallan code.**

**(a) The Building entity set is 403 on this entitlement.**
`data/cotality-contract/contract.compact.json:20-25`
```json
"Building": { "entityType":"Cotality.DataStandard.RESO.DD.Building",
  "access": { "state":"rejected","http":403,
    "error":"…Forbidden[403]…\"message\":\"Resource Cotality.DataStandard.RESO.DD.Building not available\"" },
  "fields": { "BuildingKey": { … } },
  "navigation": { "Media": {"expand":"PROVIDER_REJECTED","http":403},
                  "Property": {"expand":"PROVIDER_REJECTED","http":403} } }
```
Mirrored in the generated TypeScript:
- `lib/cotality/generated/contract.ts:601` — `/** Building · … · 1 fields · REJECTED on this subscription (HTTP 403 …) */`
- `lib/cotality/generated/contract.ts:3756` — `Building: { state: "rejected", http: 403 },`
- `docs/operations/evidence-2026-09-08/search-coverage-matrix.md:11` — `| Building | no | HTTP 403 | 1 | 354 | 353 | Media→Media (PROVIDER_REJECTED 403), Property→Property (PROVIDER_REJECTED 403) | **never** |`

**(b) `Property → Building` `$expand` is accepted but always empty.**
`contract.compact.json` `resources.Property.navigation.Building` = `{"expand":"SUPPORTED","http":200,"payloadPresent":false}`.
`search-coverage-matrix.md:33` — `| Building → Building | yes | 200 | HTTP 403 | 40/40/5/60 | Active 0/40 · Pending 0/40 · ComingSoon 0/5 · Closed 0/60 | 0 | — | 0 of 7,600 | 0 of 591,599 | never |`
`search-coverage-matrix.md:54` — *"**Property.BuildingKey ↔ Building.BuildingKey** — unmeasurable: BuildingKey suppressed on Property, Building navigation always empty, Building entity set 403."*

**(c) The engine's own type system already forbids it.**
`lib/search/engine/provider-client.ts:26` — `resource: 'Property' | 'Media' | 'OpenHouse';`
`lib/search/engine/universe.ts:145` — `walkProvider<ProviderKeyRow>({ resource: 'Property', … })`
`data/cotality-enums.live.json` publishes vocabularies for exactly three resources: `Property`, `Media`, `OpenHouse`.

**(d) Cotality's building identity key is undeliverable.**
`BuildingKeyNumeric` → `filterable: false, populated: null`.
`search-coverage-matrix.md:784` — `| BuildingKeyNumeric | SUPPRESSED · 0 / 0 A · not RLS | … | **DEAD PATH** |`
`search-coverage-matrix.md:1716`/`:1723` list it as null on **all 591,597 rows, all statuses**.
So the identity key must be a **normalized address**, not `BuildingKeyNumeric`. The repo already made that decision for the CRM lookup — `app/api/buildings/search/route.ts:512-520` documents `BuildingKeyNumeric` first, address second; on this feed **only the address layer can ever fire**.

**(e) The fields a Building search actually CAN execute on** (all from the same live pull, `filterable: true`):

| Field | populated (of 591,607) | note |
|---|---|---|
| `BuildingName` | 221,140 | `lib/cotality/generated/contract.ts:4413` — `filterable: true, populated: 221140, rlsField: true` |
| `StreetNumber` / `StreetName` | 591,607 | the real building key |
| `StreetDirPrefix` / `StreetSuffix` | 266,957 / 580,305 | enum-typed |
| `UnparsedAddress` | 591,607 | |
| `NumberOfUnitsTotal` | 591,607 | the "Units" control |
| `StoriesTotal` | 533,803 | the "Floors" control |
| `YearBuilt` | 485,638 | the "Building Period" / age control |
| `SubdivisionName`, `CityRegion`, `PostalCode` | 591,607 | already executed |
| `BuildingFeatures` | 65,882 (Multi, `has`) | the ONLY live `Building*` amenity field |
| `LandLeaseYN`, `GarageYN`, `CoolingYN`, `NewConstructionYN` | 70k–577k | |
| `PetsAllowed` / `LaundryFeatures` / `SecurityFeatures` / `PoolFeatures` | live, but **unit-level, not building-level** | the `Building*`-prefixed variants the panel names do not exist |

Grouping mechanism, if wanted: `$apply=groupby((BuildingName))` is documented and **already used by this repo against the live feed** — `scripts/cotality/observed-vocabulary.mjs:3-4`, `:37`; provider doc quoted at `docs/operations/evidence-2026-09-08/search-coverage-matrix.md:1790` (*"`$apply=groupby()` returns unique values (max 10,000)"*). It returns **distinct values only, capped at 10,000** — it is not an aggregate join and cannot carry unit counts or prices. Real grouping must happen in `lib/search/engine/`.

Note `SEARCH_SELECT_FIELDS` **already selects** `BuildingName`, `NumberOfUnitsTotal`, `BuildingKeyNumeric` (`lib/search/engine/select.ts:25`), so the rows needed to group are already coming back today.

---

## 3. FULL BUILDING TAB UI INVENTORY (`search-form-and-results.html:1651-2073`)

**Entry point:** `#btnBuilding` (`:63`) → `toggleSearchTab('building')`. Persisted at `search-engine.js:1902`; restored at `search-actions.js:90-94` and `init-hash-routing.js:46-52`, `:300-303`.

**Container:** `#searchBasicModeBuilding` (`:1651`) — `display:none`, never shown (D2).

| Section | Control ids / fields | Could it execute? |
|---|---|---|
| Quick Search | `#buildingQuickRls`, `#buildingQuickZip`, `#buildingNeighborhoodInput`/`Dropdown`/`Tags`, `#buildingSearchAddress`, `#buildingSearchAddrResults`, `#buildingQuickUnit`, `#buildingTransitExpand` | **`buildingQuickRls`/`buildingQuickZip` never read** — `collectSearchCriteria:947-949` hard-codes `saleQuickRls`/`rentalQuickRls` only, no `building` branch. `buildingNeighborhoodTags` IS read (`_resolveActiveNeighborhoodTagsId:124`) → `SubdivisionName`, **executable**. `buildingSearchAddress` → `criteria.buildingName` → **refused**. Unit → refused. Transit buttons: 23 subway + 3 transit checkboxes, **no ids, no handlers, no criteria key** — pure decoration. |
| Manhattan Grid | `#bldg-grid-north/west/east/south` + 4 id-less duplicates | **No** — D6. `Latitude`/`Longitude` suppressed on this feed. |
| Ownership | `CommonInterest` ×4 (`RentalBuilding`, `StockCooperative`, `Condominium`, `Condop`) + `PropertySubType=Townhouse` + `LandLeaseYN` radios | **YES — all tokens live.** The single most executable block in the panel. (`LandLeaseYN` radios would need a serializer path; `PropertySubType` is collected at `:853-865`.) |
| Building Allows (10) | `CRM`, `BuildingPetsAllowed`, `BuildingRules` ×5, `MaximumFinancingPercent`, `RentingAllowedYN`, `BuildingLaundryFeatures` | **No** — every field ABSENT from live Property (D3). |
| Building Does Not Allow (9) | `BuildingPetsAllowed`, `BuildingRules` ×5 (`data-not`), `MaximumFinancingPercent`, `RentingAllowedYN`, `BuildingLaundryFeatures` | **No** — D3. Also `data-not` has no serializer path at all. |
| Attended Lobby (6) | `AttendanceType` ×6 + And/Or toggle | **No** — `AttendanceType` ABSENT; the And/Or toggle has no criteria key. |
| Features (9) | `CoolingYN`, `GarageYN` (live); `BuildingFeatures` ×3 (live tokens); `BuildingPoolFeatures`, `BuildingSecurityFeatures`, `BuildingLaundryFeatures` (ABSENT); `AccessibilityFeatures=WheelchairAccessible` (not a member) | **4 of 9 could be made executable.** |
| Building Period / Resale-NewDev | `YearBuilt lte:1946` / `gte:1947`; `NewConstructionYN` ×2; 2× `data-local-field` | `YearBuilt`+`NewConstructionYN` **live and filterable**, but the `lte:`/`gte:` prefix syntax has **no serializer** — `serializeSearchCriteria:361-367` handles only `StructureType` and refuses every other `checkboxFilters` key by name. |
| Common Outdoor / Building Style | `ExteriorFeatures=Courtyard` (live) / `RoofDeck` (**not a member**); `StructureType` HighRise/Townhouse (live), Loft/WalkUp (**not members**); `ArchitecturalStyle=Brownstone` (**not a member**); `StoriesTotal lte:6` | `StructureType` is the one field with a real serializer path (`:364-365`). Two of its four tokens are invalid. |
| Building Age/Size | `#buildingMinYear/MaxYear/MinUnits/MaxUnits/MinFloors/MaxFloors` | **Read** (`collectSearchCriteria:1026-1032`) → `yearMin/Max`, `unitsMin/Max`, `floorsMin/Max` → **all refused** at `:309-311`. Underlying fields (`YearBuilt`, `NumberOfUnitsTotal`, `StoriesTotal`) **are live + filterable** — this is the cheapest real win. |
| Building Financing | `#buildingFinancingMin` / `#buildingFinancingMax` | **Silently dropped** (D5); `Max` never read at all. |
| Keyword | `#buildingKeywordSearch` | Never read — `collectSearchCriteria:1019` reads `searchKeyword`/`adv-keyword` only. Dead. |
| Management Companies | `#buildingManagementCompany` | Never read — `:1027` reads `searchManagementCompany`/`adv-management`. Dead. |
| **Status** | — | **The Building panel has ZERO `data-status-mount`.** The four mounts are at `:106`, `:894`, `:3917`, `:3928`. On the building tab `collectSearchCriteria:868-870` computes `wantTransaction='sale'` and reads `basic-sale`. There is no owner ruling on what a building's status means. |
| **Price / Beds / Baths** | — | **Absent from the Building panel entirely.** |
| Search buttons | `quickSearch(this)` (`:1737`) → alias for `performSearch` (`search-engine.js:512-514`) | Both terminate in the refusal. |

**Summary of executability:** of ~60 interactive Building-tab controls, **5** name a live filterable field with a live token AND have a serializer path today (the 4 `CommonInterest` boxes + `PropertySubType=Townhouse`), and **all 5 are unreachable because the panel is never displayed.**

---

## 4. EVERY EXISTING BUILDING HELPER IN THE REPO

**Routes**
- `app/api/buildings/search/route.ts` (1,004 lines) — authenticated **address autocomplete for CRM listing forms**. Input is `?q=` (min 3 chars, `:504`). DB-first (`prisma.building`), supplements from Trestle `/odata/Property` when `< 5` results (`:762-836`). Has real building-identity resolution: `addressIdentityKey` (`:507`), `addressOnlyKey`, `findRegisteredBuilding`, `registerBuilding`, `promoteIdentity`, `mergeMissingExtras`. **Not a search-results producer** — no price/beds/status/sort/paging; returns `buildings[]` profiles. Callers: `SALE-FORM-REDESIGN.html:5147`, `RENTAL-FORM-REDESIGN.html:4361`. **No CRM search-tab caller.**
- `app/api/buildings/route.ts` — public building profile by `streetNumber`+`streetName`(+`postalCode`,`buildingName`); pure read via `getBuildingDataCached`.
- `app/api/listings/building/route.ts` — sibling units + closed history for one building address.
- `app/api/crm/buildings/route.ts` — list/filter `prisma.building` (`q`, `borough`, `neighborhood`, `ownership_type`, `new_construction`, `building_condition`, `limit`/`offset`). **This is the closest existing thing to a building result set.**
- `app/api/crm/buildings/[id]/route.ts` — one building, GET/PATCH.

**Libraries**
- `lib/buildings/building-address-filter.ts` — `parseBuildingAddress` + `buildBuildingAddressFilter`. **The canonical address→OData matcher.** Encodes: Trestle stores `StreetName` UPPERCASE, `contains()` is case-sensitive, `tolower()` is supported, empty-core guard.
- `lib/buildings/public-building-data.ts` (1,300+ lines) — cached building assembly + the **building manifest** shard/cursor machinery (`:463`, `:626`, `:661-672`, `:1310`).
- `lib/buildings/slug.ts` — `generateBuildingSlug` / `buildingHref` (`{name}-{number}-{street}-{zip}`).
- `lib/buildings/upsert.ts` — `upsertBuildingFromRecords`, `upsertBuildingFromSearchResult`. **Both have ZERO production callers.** Grep across all `.ts/.tsx/.mjs/.js` (excluding `node_modules`) finds them only in `lib/buildings/upsert.ts` itself, `tests/fixtures/legacy-buildings-route-c4ade4bd.ts`, and `tests/runtime/building-neon-wake-contracts.test.ts` — which *asserts* no app route calls them (`:40-46`).
- `lib/buildings/acris-building-sales.ts` — `lookupBBL`, `fetchAcrisSales`.
- `lib/cache/public-cache.ts:102`, `:154` — `BUILDING_MANIFEST_TAG`, `building-manifest-shard:{shard}`.

**Data**
- `prisma/schema.prisma:2187-2281` — `model Building` (100+ columns, indexed on `borough`/`neighborhood`/`zip`/`name`/`new_construction`); `:2284-2305` `model BuildingUnit`; `:2690-2712` `model CanonicalBuilding` (`cotality_building_key` as nullable TEXT).
- **`prisma.building` has NO writer in the running app.** Readers: `app/api/crm/buildings/route.ts:29,65,122`, `[id]/route.ts:31,69,132`, `app/sitemap.ts:175`. The only writers are the two orphaned `upsert.ts` functions. **The `buildings` table's population state must be verified against production Neon before any DB-backed building search is designed** — I did not query it (read-only mandate + `CLAUDE.md` §A.1/§B).

**Browser**
- `search-engine.js:512-696` — `searchAddressAutocomplete` + `_serverAddressSearch`. The server leg is a **deliberate no-op stub** (`:637-641`: *"The Search executor executes NO address criterion… Kept as a no-op shape"*). Its local index `buildingDatabase` (`:536`) **is never defined anywhere**, so that branch is dead; only `listingBuildingDB` and the in-memory `listings` array feed it.

---

## 5. WHETHER REMOVING THE REFUSAL IS SAFE — AND WHAT MUST EXIST FIRST

**Removing `search-engine.js:324` is NOT safe.** With line 324 deleted and nothing else changed, `serializeSearchCriteria:323` still runs `params.type = criteria.searchTab === 'rent' ? 'rental' : 'sale'` — so a Building search would be **transmitted to `/api/idx/search` as an ordinary sale listing search**, and the executor would return sale listings, rendered as listing cards, under a tab labelled BUILDINGS. That is strictly worse than today's honest refusal: it converts a visible refusal into a silent wrong answer, which is exactly the failure class `CLAUDE.md` §E and `lib/search/engine/criteria.ts:15-16` exist to prevent.

**Must exist first, in this order:**

1. **An owner ruling on what a Building result IS** — a grouped building row (address, name, unit count, price range, N units matching) or a listing row? This decides whether `SettledUniverse` gains a grouping stage or a new `BuildingUniverse` type. There is **no such spec in the repo**: `grep -rl "Building search"` over `docs/` + `memory/` returns only the Cotality reference, two audits, `docs/Backend Search/cotality.txt`, and the coverage matrix — none is a design. **Requires explicit Maya approval before any implementation** (`CLAUDE.md` §A.7 — CRM frontend `public/crm/**`).
2. **The panel must actually display** — `toggleSearchTab` must show/hide `#searchBasicModeBuilding`, and `collectSearchCriteria` must read the active panel rather than the hard-coded `#searchBasicMode`. Without this, nothing else matters (D2).
3. **A `data-status-mount="basic-building"` (or an owner ruling that a building search has no status).** Today the Building tab silently inherits the sale panel.
4. **Executor criteria + provider-query support** for `buildingName`, `yearMin/Max`, `unitsMin/Max`, `floorsMin/Max` — all four map to live filterable fields, and none exists in `criteria.ts`'s `SearchCriteria`/`EXECUTED_PARAMS` or in `buildProviderQuery`.
5. **Deletion of the 27 non-existent-field controls and the 5 invalid tokens** (D3, D4) — leaving them shipped guarantees either a refusal or an HTTP 400 on `$select`/`$filter`, and per `CLAUDE.md` §E they cannot be guessed into existence.
6. **A grouping/identity decision that does not use `BuildingKeyNumeric`** — it is SUPPRESSED (null on all 591,597 rows). The only viable key is the normalized address, for which `lib/buildings/building-address-filter.ts` and `app/api/buildings/search/route.ts:507` already hold working implementations.
7. **`npm run crm:build`** — `public/crm/index-built.html` is the served file and `tests/runtime/crm-build-drift.test.ts` byte-compares it against a fresh build.

**Least-risk interim (no new capability, no HOLD touched):** make the refusal honest and specific instead of blanket. Keep refusing, but name what is refused, so `_serverSearch` cannot fall through to a sale query. This is a one-line-shape change with a real failing test (T1 below) and no provider work.

---

## 6. FAILING TEST DESIGN

Every test below **executes** the shipped function, the real route handler, or a real DOM. Where a source-grep-only assertion is unavoidable I say so and pair it with an executing one.

### T1 — `serializeSearchCriteria` must not transmit a Building search as a sale search
**File:** `tests/runtime/crm-building-tab-executability.test.ts` (new)
**Drives:** the shipped `window.serializeSearchCriteria`, lifted verbatim from `public/crm/js/search/search-engine.js` by brace-matching and `win.eval`'d into a jsdom window — the exact harness proven at `tests/runtime/crm-search-status-modes.test.ts:145-170`. Seed `win._SEARCH_CONTRACT` from the **real** `searchContract()` (`lib/search/engine/contract.ts`).
**Asserts on the RESULT object:**
```js
const r = win.serializeSearchCriteria({ searchTab: 'building', boroughs: ['Manhattan'] });
expect(r.params.type).toBeUndefined();          // FAILS TODAY: is 'sale' (search-engine.js:323)
expect(r.refused).toContain('Building search');
```
**Fails today** on the first assertion: line 323 runs before line 324, so `params.type === 'sale'` is already set on a refused Building search. **Passes after** the serializer stops manufacturing a sale universe for a non-sale tab.

### T2 — The BUILDINGS tab must display the Building panel (the D2 test)
**File:** same
**Drives:** the shipped `toggleSearchTab` in a real DOM. Load `public/crm/html/search-form-and-results.html` into jsdom, `win.eval` the brace-matched `toggleSearchTab` + `currentSearchTab` declarations, then **call `win.toggleSearchTab('building')`**.
**Asserts on rendered DOM:**
```js
win.toggleSearchTab('building');
expect(win.document.getElementById('searchBasicModeBuilding').style.display).not.toBe('none'); // FAILS: 'none'
expect(win.document.getElementById('searchBasicMode').style.display).toBe('none');             // FAILS: 'block'
win.toggleSearchTab('sale');
expect(win.document.getElementById('searchBasicModeBuilding').style.display).toBe('none');
```
**Fails today** — `toggleSearchTab` never touches that element (`search-engine.js:1900-2067`).

### T3 — Building panel controls must name only live Cotality Property fields and live members
**File:** same
**Drives:** the **live contract module**, not a hand list. Parse the Building panel with jsdom (`querySelectorAll('#searchBasicModeBuilding [data-field]')`), then for each `data-field` call `isLiveCotalityField(name)` from `lib/cotality/live-contract.ts`, and for each `data-value` call `liveEnumMembers(field, 'Property')`.
**Asserts:**
```js
expect(offendingFields).toEqual([]);   // FAILS: BuildingRules, AttendanceType, BuildingLaundryFeatures,
                                       // BuildingPetsAllowed, BuildingPoolFeatures, BuildingSecurityFeatures,
                                       // MaximumFinancingPercent, RentingAllowedYN, CRM
expect(offendingTokens).toEqual([]);   // FAILS: Loft, WalkUp, Brownstone, RoofDeck, WheelchairAccessible
```
This is DOM+contract execution, not grep: it reads the parsed DOM and calls the shipped authority function. It self-updates when the contract is regenerated.

### T4 — No criterion may be silently dropped (the D5 test)
**File:** same
**Drives:** the shipped `collectSearchCriteria` **and** `serializeSearchCriteria` back-to-back in jsdom. Set `#buildingFinancingMin.value = '80'`, `currentSearchTab='building'`, call `win.collectSearchCriteria()`, feed the result to `win.serializeSearchCriteria()`.
**Asserts on the RESULT:**
```js
const c = win.collectSearchCriteria();
expect(c.financingMin).toBe(80);
const ser = win.serializeSearchCriteria(c);
const executed = Object.keys(ser.params);
const accountedFor = new Set([...executed, ...ser.refused.flatMap(labelToKeys)]);
expect([...Object.keys(c)].filter(k => k !== 'searchTab' && !accountedFor.has(k))).toEqual([]);
// FAILS TODAY: ['financingMin']
```
Generalized invariant: *every key `collectSearchCriteria` produces is either in `params` or in `refused`*. Catches D5 and every future recurrence.

### T5 — The executor refuses a `buildingName` parameter by name at the API boundary
**File:** `lib/search/__tests__/engine-building-criteria.test.ts` (new)
**Drives:** the real `criteriaFromParams` and, after the fix, `buildProviderQuery`.
```js
const r = criteriaFromParams(new URLSearchParams('type=sale&buildingName=One57'));
expect(r.ok).toBe(false);
expect(r.refusal.unsupported).toContain('buildingName'); // PASSES today (correctly refused)
// After the fix (the RED test):
expect(r.ok).toBe(true);
expect(buildProviderQuery(r.criteria).filter).toContain("tolower(BuildingName) eq 'one57'");
```
**Fails today** on the post-fix assertions — `buildingName` is not in `EXECUTED_PARAMS` (`criteria.ts:119-125`) and `buildProviderQuery` has no `BuildingName` clause (`provider-query.ts:82-125`).

### T6 — `GET /api/idx/search` sends the Building clause to the provider and returns the rows
**File:** `tests/runtime/idx-search-building-criteria.test.ts` (new)
**Drives:** the **real route handler**, exactly the pattern proven at `tests/runtime/cma-status-tokens.test.ts:296-333`: mock `global.fetch`, mock `requireAgentOrBroker`, set `IDX_ENABLED=true`, `await GET(new NextRequest('http://test/api/idx/search?type=sale&buildingName=One57&borough=Manhattan'))`.
**Asserts on the REQUEST PARAMS and the RETURNED RECORDS:**
```js
const url = decodeURIComponent(String(fetchSpy.mock.calls[0][0]));
expect(url).toContain("$filter=");
expect(url).toContain("tolower(BuildingName) eq 'one57'");
expect(url).toContain("PropertyType eq 'Residential'");
expect(url).toContain("Permission has 'IDX'");
expect(url).not.toContain('MlsStatus');
expect(url).not.toContain('/odata/Building');   // guards against ever routing to the 403 resource
const body = await res.json();
expect(body.listings.map(l => l.buildingName)).toEqual(['One57']);
expect(body._meta.filter).toContain('BuildingName');
```
**Fails today with HTTP 400 `UNSUPPORTED_CRITERION`** (`app/api/idx/search/route.ts:42-54`) — no provider call is even made.

### T7 — The engine must never address the 403 Building resource
**File:** `lib/search/__tests__/engine-building-criteria.test.ts`
**Drives:** the real `COTALITY_RESOURCE_ACCESS` from `lib/cotality/generated/contract.ts:3756` plus the `ProviderQueryOptions` type.
```js
import { COTALITY_RESOURCE_ACCESS } from '@/lib/cotality/generated/contract';
expect(COTALITY_RESOURCE_ACCESS.Building).toEqual({ state: 'rejected', http: 403 });
// and a compile-level guard: buildUrl({ resource: 'Building' as any, … }) must never appear in engine code
```
This is a **fail-closed regression guard**, not a defect test — it passes today and must keep passing. It is the tripwire that stops a future "just query the Building resource" fix.

### T8 — Build-drift
`tests/runtime/crm-build-drift.test.ts` already exists and **will fail** the moment `search-engine.js` or the partial changes without `npm run crm:build`. No new test needed; just noting it is a mandatory gate for any fix here.

**Explicitly called out as insufficient:** `tests/runtime/buildings-search-ui-hints.test.ts` (string-slice + `toContain`) and `tests/runtime/search-audience-wiring.test.ts` (regex over source). Neither would catch any defect above. They should be left alone but not counted as coverage.

---

## 7. FILE OWNERSHIP — everything a fix would touch

**Source of truth for the Building tab UI (owns D2, D3, D4, D6, and the panel inventory)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/search-form-and-results.html` — lines 63, 1651–2073

**Browser search engine (owns D1, D2, D5, and criteria collection/serialization)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/search-engine.js` — 304–313, 315–373, 512–514, 698–1135, 1228–1245, 1900–2067

**Browser API client (owns D7)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/api-client.js` — 714–745

**Manhattan grid (owns D6)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/manhattan-grid.js`

**Server executor — the only place a Building criterion may be executed**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/criteria.ts` — `SearchCriteria`, `EXECUTED_PARAMS` (119–125), `criteriaFromParams`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/provider-query.ts` — `buildProviderQuery` (82–125)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/contract.ts` — if the browser needs new vocabulary/params
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/universe.ts` — `mallanRowsFor` (67–119) must mirror any new criterion, or Mallan rows silently widen; grouping stage if the owner chooses grouped results
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/select.ts` — already carries `BuildingName`, `NumberOfUnitsTotal`, `BuildingKeyNumeric` (line 25); no change needed
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/provider-client.ts` — line 26 resource union; **must NOT gain `'Building'`**

**Route boundary**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/api/idx/search/route.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/api/idx/search/contract/route.ts` (only if the contract payload grows)

**Generated — must be rebuilt, never hand-edited**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index-built.html` — via `npm run crm:build`

**Existing building helpers to REUSE rather than reinvent (read, likely unchanged)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/buildings/building-address-filter.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/app/api/buildings/search/route.ts` (identity resolution, lines ~507–560)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/buildings/slug.ts`

**New tests**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-building-tab-executability.test.ts` (T1–T4)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/__tests__/engine-building-criteria.test.ts` (T5, T7)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/idx-search-building-criteria.test.ts` (T6)

**Would NOT be touched:** `SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`, `SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`, `lib/crm/status-mapping.ts`, `app/api/crm/status-options/route.ts`, `prisma/schema.prisma`.

---

## 8. Evidence-class labelling (`CLAUDE.md` §J.8)

- **D1, D2, D5, D6(second half), D7, D8** — Class A, static code path, proven by direct Read. Actionable.
- **D3, D4, §2, D6(first half)** — Class B, provider field truth. Proven **against the committed live pull** (`data/cotality-contract/**`, `data/cotality-enums.live.json`, `acquired_at 2026-09-08T06:26:36.364Z`, `metadata_sha a60bcbb…`), which `CLAUDE.md` §H names as *the ONLY field/enum/permission authority*. **I did not run `cotality:query`, `trestle:probe`, or `cotality:authority -- refresh` in this session.** Before any PR acts on D3/D4, re-prove with `node scripts/cotality/generate-contract-types.mjs --check` and state the result.
- **The `buildings` table population state** — Class D, unverified. I did not query Neon. Any DB-backed building-search design must prove it first.
- What the passing `crm-build-drift` / `crm-search-status-modes` tests prove: that the built file matches source and that the four *status* panels match the executor contract. They prove **nothing** about the Building tab — there is no executing Building test in the repo today.