# CRM Search Deep Audit — 2026-03-23

## 8 Parallel Agents, Full Code + UX + Compliance Review

---

## CRITICAL BUGS (fix immediately)

| # | Bug | Impact | File:Line |
|---|-----|--------|-----------|
| **C1** | `PropertySubType` uses `cb.value` (returns "on") instead of `cb.getAttribute('data-value')` | Every Townhouse/Condo/Co-op/etc filter sends "on" to API — matches nothing | `search-engine.js:755` |
| **C2** | `closedDate` not mapped in `mapTrestleToCRM()` | Client-side Gate 6 (Closed >24h) never fires — stale closed listings may show | `route.ts` mapTrestleToCRM |
| **C3** | `contractDate` not mapped in CRM flat shape | Client-side contract date filter always returns all results | `route.ts` mapTrestleToCRM |
| **C4** | Concession values (`OwnerPays`, `FreeRent`) are NOT valid Trestle `Concessions` enum values | Concession filters match nothing; `OwnerPays` is a separate Trestle field | `SEARCH_CONTROL_MAP.json:133-137` |
| **C5** | `CrossListing` field doesn't exist on Trestle | Cross-listing filter (Listed for Rent / Also for Sale) silently does nothing | `SEARCH_CONTROL_MAP.json:169-177` |
| **C6** | `Townhouse` PropertySubType: HTML uses `SingleFamilyTownhouse,MultiFamilyTownhouse` but Trestle only has `Townhouse` | Townhouse filter never matches | `SEARCH_CONTROL_MAP.json:88,103` |
| **C7** | `Conversion` not a valid PropertySubType; Trestle has `TwilightConversion` | Conversion filter never matches | `SEARCH_CONTROL_MAP.json:96` |
| **C8** | `FUTURE`/`INCOMPLETE` status not in client statusMap | Server sends invalid StandardStatus values | `search-engine.js:282` |

## BROKEN — Functional but Unwired (need IDs or JS wiring)

### Advanced Mode (~120 fields)
| Section | Fields | Status |
|---------|--------|--------|
| Beds/Baths/Rooms/SqFt | 8 selects | No IDs — always reads basic form |
| RLS ID / Zip / Unit | 3 inputs | No IDs in advanced |
| Keyword | 1 input | No ID in advanced |
| All dates (16 inputs) | 16 date inputs | No IDs, no drp wrappers |
| Manhattan Grid | 4 selects | No IDs, no JS |
| Transit | all buttons | Decorative spans, no handlers |
| Financial Details | entire section | No IDs, no data-field |
| Building Details | year, floors, units, name | No IDs (basic form IDs only) |
| Building Amenities | 30 checkboxes | No data-field |
| Unit Features | ~20 checkboxes | No data-field |
| Townhouse Amenities | entire section | No IDs, no data-field |
| Pet Policy | entire section | No IDs, no data-field |
| Floor Preferences | inputs + checkboxes | No IDs, no data-field |
| Kitchen/Bath condition | 2 selects | Have data-field but are `<select>`, scanner only checks `<input>` |

### Basic Mode
| Field | Issue |
|-------|-------|
| `data-not` attribute | "Does Not Allow" checkboxes completely ignored — no negation logic |
| Financing min/max | Have IDs (`saleBuildingFinancingMin/Max`) but JS never reads them |
| Management Company | Have IDs (`saleManagementCompany`) but JS never reads them |
| Building Keyword | No ID in building tab |
| Building Management | No ID in building tab |
| Building Financing | No ID in building tab |
| Transit (all tabs) | All subway/LIRR/Ferry/Bus buttons decorative |
| Manhattan Grid | 6 selects, no IDs, no JS |
| Radio buttons | `clearSearchForm()` doesn't reset `input[type="radio"]` |

### Comparables
| Field | Issue |
|-------|-------|
| Comp toolbar buttons | Load/Save/Generate/Clear — no onclick handlers |
| Comp status checkboxes | All decorative (building + general pages) |
| Comp date ranges | Hardcoded stale text "Feb 2026", not interactive |
| General comp neighborhoods | Checkboxes exist but not collected by JS |
| General comp ownership | Checkboxes exist but not collected by JS |
| `compGeneralAddress` | JS reads it but element doesn't exist in HTML |
| `compGeneralMaxBeds` | Missing from HTML (only min exists) |
| `compGeneralMaxBaths` | Missing from HTML (only min exists) |

## PARTIAL — Works But Incomplete

| Issue | Detail |
|-------|--------|
| `PENDING` maps only to `ActiveUnderContract` | Missing `Pending` as separate StandardStatus value |
| Open house dates not sent to server | Client sends params but `buildODataFilter()` doesn't handle them |
| Open house end date not inclusive | Missing `setHours(23,59,59)` |
| DRP Clear button UX | Clears in-memory but not wrapper data-from/data-to until Apply |
| Saved search server-side criteria | Missing max_beds, max_baths, max_sqft, dates, address, building fields |
| Client Delivery Modal | Dead HTML — `openDeliveryModal()` redirects to Reports modal |
| `criteriaToPrismaWhere()` duplicated | In cron and saved-search execute — risk of drift |
| `BuildingSmokeFreeYN` maps to non-existent `SmokeFree` field | Filter silently skips |
| Master-detail Floorplans button | No click handler |
| Detail media photo cap | Limits to 4 photos but counter shows full count |
| Statistical data disclaimer | Missing for aggregate views (REBNY requirement) |

## UX / ACCESSIBILITY

| Issue | Detail |
|-------|--------|
| Calendar unusable on mobile | `min-width: 520px` overflows viewport on <520px screens |
| No responsive CSS for DRP | Never stacks to single-month on mobile |
| DRP "Today" shortcut dead | Single-option select never fires onchange |
| Zero `<label for="">` associations | Screen readers can't announce input purposes |
| No ARIA on DRP triggers | No role, aria-haspopup, aria-expanded, tabindex |
| No Enter-to-search | Must click Search button |
| No Escape-to-close | DRP popup has no keyboard close |
| DRP not keyboard-focusable | `<div>` with no tabindex |
| Calendar days not keyboard-navigable | Div cells, no arrow-key nav |
| No loading spinner for main search | Server fetch has no visual indicator |
| Calendar day cells too small for touch | 5px padding, below 44px minimum |
| Debug banner in production | Neighborhood map modal has visible debug strip |

## COSMETIC

| Issue | Detail |
|-------|--------|
| Dead Google Maps CSS | `.gm-style-iw` rules (project uses MapLibre) |
| `console.trace()` on every modal close | Performance noise |
| Photo badge position conflicts | Overlaps with price-drop badge on narrow cards |
| `ClosePrice` fetched but not mapped | Unused data |
| `ConstructionType` maps to `ConstructionMaterials` | Wrong semantic (materials vs dev type) |
| Weekend preset behavior on Sunday | Skips to next Saturday instead of current weekend |

## WHAT WORKS WELL

| Area | Status |
|------|--------|
| **Reports system** | 9 formats, 5 outputs, full REBNY compliance, commission blocking |
| **Maps** | MapLibre + OpenFreeMap, clustering, neighborhood polygons, pin popups |
| **Photo pipeline** | IntersectionObserver, batch fetch, server proxy, lazy loading |
| **Neighborhood selector** | 5 boroughs, Manhattan sub-areas, polygon highlight, map style switcher |
| **Distribution gates (server)** | All 6 enforced before mapping |
| **Address suppression** | Correct in API, rendering, email, DTO |
| **REBNY attribution** | On cards, print, email, API response |
| **Saved searches** | Save/load/delete, client linking, alert cron, email delivery |
| **Core search fields** | Price, beds, baths, rooms, sqft, status, neighborhoods, address all work in basic mode |
