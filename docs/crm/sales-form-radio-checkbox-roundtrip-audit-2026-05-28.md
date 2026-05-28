# Sales Form — Comprehensive Radio + Checkbox Round-Trip Audit + Class C Decision Table

> Generated 2026-05-28 on branch `fix/sales-form-all-radio-checkbox-roundtrip`. **Audit + scope-S3 decision table.** No code changed yet.
>
> **Mandate (locked):** Every radio and every checkbox on the sales form must end up in one of three outcomes:
> 1. **Real field with RESO/RLS equivalent** — full save/restore + canonical mapping.
> 2. **Real Mallan-internal field with no confirmed RESO equivalent** — save/restore via CRM raw key only.
> 3. **Dead/vestigial UI** — removed or visibly disabled.
>
> **Fail-closed rule:** if a RESO mapping is uncertain, default to Mallan internal. Do not invent or force mappings.

---

## 0 · Three failure classes

| Class | Count | Bug |
|---|---|---|
| **A** | 25 radio groups | Have `name`, saved by generic collector, missing from `SALE_RADIO_MAP` + `SALE_FIELD_MAP`. Edit-load reverts to HTML-default. |
| **B** | 5 named checkbox groups | Have shared `name`, collector overwrites with last-checkbox boolean (values lost at save), no array derivation, no `SALE_CHECKBOX_ARRAY_MAP` entry. |
| **C** | 147 unnamed checkboxes in 20 sections | No `name` AND no `id`. The collector's `field.id \|\| field.name` returns `""`. Click is captured by DOM (visual checkmark) but value never reaches the data layer. **All 20 sections turned out to be real data fields — the inventory found no vestigial UI.** |

---

## 1 · Class A — Radio fixes (25 groups → SALE_RADIO_MAP entries)

Each row gets one entry:

```js
{ rls: '<name>', name: '<name>', src: 'raw' },
```

| `name` | Options | Notes |
|---|---|---|
| `commSalePayMethod` | check / wire | Mallan internal |
| `saleBoardApplication` | Yes / No | UCBA building requirement |
| `saleBoardApproval` | Yes / No | UCBA building requirement |
| `saleBoardInterview` | Yes / No | UCBA building requirement |
| `saleCertOccupancy` | Yes / No | UCBA building requirement |
| `saleCoPurchasing` | Yes / No | Building purchasing policy |
| `saleCurrentUse` | Healthcare / Investment / Professional | Commercial classification |
| `saleDirectDeal` | Yes / No | Listing-side flag |
| `saleFilmLocation` | Yes / No | UCBA building requirement |
| `saleFirstRefusal` | Yes / No | Building purchasing policy |
| `saleGuarantors` | Yes / No | Building purchasing policy |
| `saleHeatingYN` | Yes / No | (Maya's earlier flagged field) |
| `saleHistoryType` | listing / building | Listing-history toggle |
| `saleInternetAVMDisplayYN` | Yes / No | **RLS canonical = `InternetAutomatedValuationDisplayYN`** (per-row opt-out, fail-closed per REBNY compliance §7). MUST map to that canonical key. |
| `saleLandLease` | No / Yes | Townhouse land-lease flag |
| `saleLight` | Excellent / Good / Fair / Poor | (Maya's earlier flagged field) |
| `saleLiveWorkAllowed` | Yes / No | Building flag |
| `saleMeetAndGreet` | Yes / No | UCBA building requirement |
| `saleNumFloors` | Single / Duplex / Triplex / Quadruplex | Unit floor count |
| `saleOfficeRetailOwnership` | Condo / Coop / Condop / Townhouse / MixedUse / FeeSimple | Commercial ownership variant |
| `saleParentsBuying` | Yes / No | Building purchasing policy |
| `salePiedATerre` | Yes / No | Building purchasing policy |
| `saleSubletting` | Yes / No | Building flag |
| `saleTenantConfig` | SingleTenant / MultiTenant | Commercial tenant config |
| `saleUnitType2` | Residential / Commercial | Unit type classifier |

**One special case:** `saleInternetAVMDisplayYN` needs its canonical mapping wired in `collectSaleFormData` so the RESO field `InternetAutomatedValuationDisplayYN` lands in the body. Otherwise we're missing the canonical write the IDX-display gate logic depends on. (See §1.5 below.)

### 1.5 — collect-side canonical writes for the AVM gate

`collectSaleFormData` currently emits `IDXEntireListingDisplayYN`, `InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, `SyndicateYN`. Missing: `InternetAutomatedValuationDisplayYN`. This PR adds the symmetrical derived assignment from `data.saleInternetAVMDisplayYN`.

---

## 2 · Class B — Named checkbox group fixes (5)

Each gets explicit array derivation in `collectSaleFormData` (Heating/Cooling pattern from PR #268) and a `SALE_CHECKBOX_ARRAY_MAP` entry.

| `name` | Options | Storage key | Decision |
|---|---|---|---|
| `saleBldgHeating` | 37 (BuildingSteam, HotWater, ForcedAir, …) | RESO `BuildingHeating` (mirrors confirmed `saleHeating → Heating` pattern; the `saleBldg*` prefix is the building-modal variant) | RESO-canonical |
| `saleBldgCooling` | 25 (CentralAir, Ductless, WallUnits, …) | RESO `BuildingCooling` | RESO-canonical |
| `saleBldgDocsAvailable` | 8 (BuildingRules, BylawsAndAmendments, FinancialStatement, OfferingPlan, OwnerOptOutAuthorization, …) | Mallan internal `saleBldgDocsAvailable` | Internal-only (RESO `DocumentsAvailable` exists but our IDX Plus subset coverage unconfirmed; default to internal per fail-closed rule) |
| `saleTHDocsAvailable` | 8 (same options as Bldg) | Mallan internal `saleTHDocsAvailable` | Internal-only (townhouse-variant of above) |
| `saleBusinessType` | 21 (Medical, Dental, HealthServices, Fitness, Restaurant, …) | Mallan internal `saleBusinessType` | Internal-only (Mallan commercial classification, distinct from RESO `BusinessType` semantics) |

---

## 3 · Class C — Decision table for 20 unnamed-checkbox sections (147 inputs)

Per Maya's mandate: every entry below is **either persisted (Mallan internal or RESO) OR removed as dead UI.** None are left as "checkbox saves nowhere."

**Naming convention** (matches existing form code):
- HTML attribute: `name="saleX"` where X = section in camelCase
- Per-input HTML attribute: `value="Y"` where Y = label text with whitespace removed (e.g. `"City Lights"` → `"CityLights"`)
- Storage: array under raw_data key matching `name` (or canonical RESO key when one is wired in collect)

| # | Section | Inputs | Line range | Decision | Storage key (HTML `name`) | Canonical RESO/RLS key | Value shape | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | **Pricing** ("Also Available for Rent" — single checkbox) | 1 | 704 | Persist — Mallan internal | `saleAlsoAvailableForRent` | — | `boolean` | Real field — marks a sale listing as also available for rent. Single-id boolean, no array. |
| 2 | **Important Dates** ("Send to RLS" / "Send to Website") | 2 | 1042-1043 | Persist — Mallan internal | `saleSendToRls`, `saleSendToWebsite` | Overlap with `SyndicateTo` array + `IDXEntireListingDisplayYN` flag — flag for follow-up unification | `boolean` each | Two separate single-id booleans. NOT one shared group. These are distribution-intent toggles. |
| 3 | **Residential Types** (Alcove Studio / Floor Thru / Garden / Loft / Maisonette / Penthouse / Private Floor) | 7 | 1910-1916 | Persist — Mallan internal | `saleResidentialType` | — | `string[]` | Layout subtypes complementing `salePropertyType` radio. No RESO `PropertySubType` coverage for "Alcove Studio" / "Floor Thru" / "Private Floor" etc. |
| 4 | **Commercial Features** (Drive-In Access / Loading Dock / Freight Elevator / …) | 12 | 1989-2000 | Persist — Mallan internal | `saleCommercialFeatures` | — | `string[]` | Mallan commercial feature flags |
| 5 | **Private Outdoor Space** (Balcony / Deck / Garden / Greenhouse / Juliet Balcony / Patio / Private Roof Access / Roof Deck / Roof Rights / Terrace / Wrap Terrace) | 11 | 2060-2070 | Persist — Mallan internal | `salePrivateOutdoorSpace` | RESO `PatioAndPorchFeatures` candidate but enum mismatch (no "Juliet Balcony" / "Wrap Terrace" / "Private Roof Access" in RESO; mapping would be lossy) | `string[]` | Default to internal per fail-closed rule |
| 6 | **Exposure** (North / South / East / West / NE / NW / SE / SW) | 8 | 2097-2104 | Persist — Mallan internal | `saleExposure` | — | `string[]` | No RESO Exposure enum; pure Mallan internal. Note: `name="saleExposure"` was already referenced by dead code at line 8394 — this PR revives the name. |
| 7 | **Views (multi-select after the Yes/No radio)** (Bridges / City / City Lights / Downtown / Garden / Panoramic / Park / River / Sea/Ocean / Rooftops/Sky / Skyline / Streets) | 12 | 2121-2132 | Persist — Mallan internal | `saleViewList` (not `saleViews` — that name is used by the dead querySelectorAll code path at line 8399) | RESO `View` is a known multi-select enum but enum-value alignment unverified; default to internal per fail-closed rule | `string[]` | Sister to `saleHasViews` radio (Yes/No). |
| 8 | **Additional Rooms** (Den/Office / Dressing Room / Exercise Room / Family Room / Foyer / Great Room / Laundry Room / Library / Living Room / Loft Space / Media Room / Playroom / Safe Room / Sleeping Loft / Sun Room) | 15 | 2157-2171 | Persist — Mallan internal | `saleAdditionalRooms` | — | `string[]` | RESO has `Rooms` collection (sub-resource) — heavy mapping; default internal |
| 9 | **Kitchen Type** (Eat In / Galley / Open / Pass Through / Pullman / Second Kitchen / Separate / Traditional / Windowed) | 9 | 2179-2187 | Persist — Mallan internal | `saleKitchenType` | — | `string[]` | No RESO `KitchenType` enum I can confirm; internal |
| 10 | **Kitchen Features** (Center Island / Chef's / Dishwasher / Modern Kitchen / New Appliances / Pantry / Window) | 7 | 2195-2201 | Persist — Mallan internal | `saleKitchenFeatures` | — | `string[]` | Possibly RESO `InteriorFeatures` overlap; internal until verified |
| 11 | **Dining** (Dining Alcove / Dining Area / Dining in Foyer / Dining in Living Room / Dining L / Formal Dining Room) | 6 | 2209-2214 | Persist — Mallan internal | `saleDining` | — | `string[]` | Internal |
| 12 | **Bathroom Features** (Bidet(s) / Jacuzzi(s) / Marble / En Suite(s) / Sauna(s) / Stall Shower(s) / Window) | 7 | 2222-2228 | Persist — Mallan internal | `saleBathroomFeatures` | — | `string[]` | Internal |
| 13 | **Feature Details** (Exposed Brick / Original Detail / Pre-War Charm) | 3 | 2253-2255 | Persist — Mallan internal | `saleFeatureDetails` | — | `string[]` | Internal |
| 14 | **Windows** (Aluminum Frames / Bay Windows / Blinds / Display Windows / Double Pane / Drapes / Energy Star / Garden Windows / Insulated / Low Emissivity / New Windows / Noise Reduction / Oversized / Screens / Skylights / Solar Screens / Tinted / Triple Pane / Window Coverings / Wood Frames) | 20 | 2263-2282 | Persist — Mallan internal | `saleWindows` | RESO `WindowFeatures` exists, multi-select; enum-value alignment unverified — default internal per fail-closed | `string[]` | |
| 15 | **Ceilings** (Beamed Ceilings / High Ceilings) | 2 | 2290-2291 | Persist — Mallan internal | `saleCeilings` | — | `string[]` | Internal |
| 16 | **Flooring** (Concrete / Hardwood / Herringbone / Marble / Parquet) | 5 | 2299-2303 | Persist — RESO canonical | `saleFlooring` | RESO `Flooring` (confirmed in `lib/idx/db-to-public-dto.ts:428`) | `string[]` | One of the few RESO mappings I'm confident in — already wired on the read side. |
| 17 | **Storage** (Great Closet Space / Murphy Bed / Storage Loft / Storage Space / Walk In Closets) | 5 | 2311-2315 | Persist — Mallan internal | `saleStorage` | — | `string[]` | Internal |
| 18 | **Washer/Dryer** (mixed: 2 unit-level flags + 7 brand checkboxes) | 9 | 2350-2362 | **SPLIT** into 2 single-id booleans + 1 array group | (see below) | — | mixed | Two distinct concepts in one section. |
| 18a | Washer/Dryer Hookups | 1 | 2350 | Persist — Mallan internal | `saleWasherDryerHookups` (single-id boolean) | — | `boolean` | |
| 18b | Washer/Dryer in Unit | 1 | 2351 | Persist — Mallan internal | `saleWasherDryerInUnit` (single-id boolean) | — | `boolean` | |
| 18c | Washer/Dryer Brand (Bosch / Gaggenau / LG / Maytag / Miele / Whirlpool / Other) | 7 | 2356-2362 | Persist — Mallan internal | `saleWasherDryerBrand` (array) | — | `string[]` | |
| 19 | **Fresh Air System** (VRF System / Purification & Humidification System / Vented from Outside) | 3 | 2490-2492 | Persist — Mallan internal | `saleFreshAirSystem` | — | `string[]` | Internal |
| 20 | **HVAC** (4 Pipe Fan / Vertical Heat Pump / Split System) | 3 | 2500-2502 | Persist — Mallan internal | `saleHvacSystem` | — | `string[]` | Internal |

### Class C summary
- **0 sections classified as "dead UI."** Every section was confirmed by label inspection to be a real data field. Maya's vestigial-section concern was correct to raise but not confirmed by the labels.
- **1 RESO-canonical mapping confirmed (#16 Flooring).**
- **19 sections default to Mallan internal** per fail-closed rule. Future PR can migrate selected sections to RESO once mapping is verified against `data/rebny-rls-property-fields.csv` and the value enum is confirmed.
- **2 sections require special handling:**
  - **#2 (Important Dates → Send to RLS / Send to Website)** — flag for follow-up to confirm whether redundant with existing `SyndicateTo` / `IDXEntireListingDisplayYN`. Persist for now to avoid data loss.
  - **#18 (Washer/Dryer)** — split into 2 single booleans + 1 array per label-vs-brand semantic distinction.

---

## 4 · Implementation order

1. ✅ Commit this audit doc (first commit on the branch)
2. **Class A (25 radios)** — append entries to `SALE_RADIO_MAP`, add `data.InternetAutomatedValuationDisplayYN` canonical write in collect (§1.5)
3. **Class B (5 named checkbox groups)** — extend collect derivation block + append entries to `SALE_CHECKBOX_ARRAY_MAP`
4. **Class C HTML attribution (147 inputs)** — codemod script that adds `name="..." value="..."` per the table above
5. **Class C collect derivation + map entries** — 19 new array derivations in collect, 19 new `SALE_CHECKBOX_ARRAY_MAP` entries (plus the 3 single-id booleans go through SALE_FIELD_MAP)
6. **Parametrized tests** — extend `tests/runtime/sale-form-save-load-retention.test.ts` with full-coverage assertion that every radio in the audit appears in SALE_RADIO_MAP and every named checkbox group has both array collection AND map entry
7. **CRM build** — `npm run crm:build`
8. **Validation chain** — type-check, crm:test, jest retention, rls:validate, compliance-check, ucba:audit
9. **Commit incrementally + push + open PR**

---

## 5 · Compliance gate

- **REBNY UCBA §2.05 / IDX display:** Class A adds `InternetAutomatedValuationDisplayYN` canonical write — **MUST use `affirmPermission` semantics** (fail-CLOSED) on the read side. This PR only adds the FORM write path; existing read-side gate at `lib/compliance/gates.ts` stays as-is.
- **Address suppression:** unaffected.
- **No DB schema change.** All Class C internal-only fields land in `raw_data` JSON.
- **No new public-facing text** — these are CRM-form-internal additions.
- **Out of scope per Maya boundaries:** Sentinel-L, rental, media, URL builders, public attribution/sidebar, DTO consolidation, full SALE_FIELD_MAP rewrite.

---

## 6 · TL;DR

- **35 radio groups (25 broken) + 12 named checkbox groups (5 broken) + 20 unnamed-checkbox sections (147 inputs, 100% invisible at save).**
- **All 20 unnamed sections turn out to be real data fields** — no vestigial UI to remove.
- **Class C persistence: 1 RESO mapping initially confirmed (Flooring) then demoted to Mallan internal** (Codex review — see §7); the remaining 19 default to Mallan internal per fail-closed rule.
- **2 sections flagged for follow-up** (Important Dates → may overlap with existing distribution flags; Washer/Dryer → split into 3 distinct keys).
- Audit committed first; implementation in subsequent commits on the same branch.

---

## 7 · Codex review findings (added 2026-05-28, before merge)

Codex caught **two Herringbone-class bugs** post-initial-implementation. Both fixed in PR #270 before merge per Maya's direction.

### 7.1 Flooring canonical write included a non-enum value
- **Bug:** `data.Flooring = [...form values...]` included "Herringbone" — not present in the Cotality normalized registry for IDX Plus `Flooring` (`data/rebny-rls-property-lookup.csv` Flooring rows: Adobe / Bamboo / Brick / Carpet / CeramicTile / Concrete / Cork / Hardwood / Laminate / Linoleum / Marble / Parquet / etc.).
- **Fix:** demoted Flooring from RESO canonical to Mallan internal. Collector writes `data.saleFlooring` (raw_data). 5 Flooring inputs marked with the legacy validator attribute `data-rls-ignore="true"` (Layer 0 — Mallan internal).
- **Note on language:** `data-rls-ignore` is a legacy validator attribute name only; it tells the in-repo validator the field is not in scope for the Cotality/RESO normalized registry check. It does NOT control any external RLS submission behavior.

### 7.2 BuildingFeatures canonical write was systematically non-compliant
- **Bug discovered during the §7.1 enum audit:** the existing `collectSaleFormData` logic pushed **label text** (not the input's `value` attribute) into canonical `data.BuildingFeatures`. None of the 19 amenity labels ("Elevator", "Gym/Fitness Center", "Bike Room", "Cold Storage", …) match REBNY's `BuildingFeatures` enum (which uses CamelCase: `Elevators`, `FitnessCenter`, `BikeStorage`, `ColdStorage`, …). Every save with any building amenity checked emitted invalid canonical values.
- **Why this was blocking** (per Maya): building auto-fill from a selected address writes amenity checkbox state from Cotality-supplied building data (`populateBuildingFromIDX` at line ~5287). Without the canonical-write fix, every auto-filled selection would have pushed non-compliant labels into `BuildingFeatures` as soon as the agent selected a building from the dropdown — bad data would be created automatically, not just on manual checkbox interaction.
- **Fix — translation table:**
  - New `BUILDING_FEATURES_LABEL_TO_CANONICAL` map with **8 unambiguous translations** verified against the Cotality normalized registry:

    | Form label | IDX Plus canonical |
    |---|---|
    | `Elevator` | `Elevators` |
    | `Gym/Fitness Center` | `FitnessCenter` |
    | `Children's Playroom` | `CommonPlayroom` |
    | `Resident Lounge` | `CommonLounge` |
    | `Bike Room` | `BikeStorage` |
    | `Storage Available` | `Storage` |
    | `Package Room` | `PackageRoom` |
    | `Cold Storage` | `ColdStorage` |

  - **11 ambiguous / not-in-enum labels go to Mallan internal** `raw_data.saleBuildingFeaturesInternal`: Pool, Roof Deck, Courtyard/Garden, Business Center, Conference Room, Parking Garage, Valet Parking, Live-In Super, On-Site Manager, Wheelchair Access (would belong in `AccessibilityFeatures` — different RESO field), Spa (ambiguous: SpaHotTub / Sauna / SteamRoom).
  - **Collector** (`collectSaleFormData`): translates via the map. Untranslatable labels → `saleBuildingFeaturesInternal` array. **Canonical `data.BuildingFeatures` only ever contains values verified-present in the IDX Plus enum.**
  - **Restore** (`_populateSaleFormFromApi`): reads BOTH `raw.BuildingFeatures` (canonical) AND `raw.saleBuildingFeaturesInternal` (Mallan internal labels). Inverse-translates canonical values back to form labels for setChecked. Also handles legacy pre-PR-#270 data where labels were stored in the canonical field directly (label fallback in the matcher).
  - **Mis-tag cleanup:** 9 inputs were incorrectly tagged `data-rls-field="BuildingFeatures"` (Historic / LEED / Conversion building characteristics + 5 building purchasing policies + 1 mis-tagged Yes/No radio). All 9 had `data-rls-field` removed AND `data-rls-ignore="true"` added. These inputs have their own SALE_FIELD_MAP / SALE_RADIO_MAP entries from earlier in PR #270 and don't belong in the BuildingFeatures canonical array.
  - **Auto-fill rule** (per Maya): Cotality/IDX Plus normalized values may write to canonical `BuildingFeatures` only if already valid in the registry. UI / custom / Mallan labels go through the translation table. Unknown labels are internal-only.

### 7.3 Regression guard

New test file `tests/runtime/sale-form-canonical-enum-compliance.test.ts` (18 cases) cross-checks every canonical-array write in `collectSaleFormData` against the Cotality normalized registry on every CI run:

- 8 direct-write canonical fields (Heating / Cooling / BuildingHeating / BuildingCooling / PetsAllowed / BuildingPetsAllowed / AttendanceType / BuildingLaundryFeatures): all 100% enum-compliant.
- BuildingFeatures: translation map verified; every mapped canonical value present in enum; routing split (canonical+internal) verified in collect; restore reads both buckets.
- Flooring: verified demoted (no `data.Flooring` write in collect code; 5 inputs marked legacy validator attribute).

Any future PR that adds a new canonical-array write whose form values diverge from the Cotality normalized registry fails CI before the bad data ships.

---

## 8 · Implementation order (final, with Codex follow-ups)

1. ✅ Commit audit doc (first commit on the branch — `7cf537a9`)
2. ✅ Class A + B + C implementation (second commit — `b2be0607`)
3. ✅ Codex review §7.1 — AVM canonical-only restore + Flooring demotion (third commit — `aa66934c`)
4. ✅ Codex review §7.2 — BuildingFeatures translation table + mis-tag cleanup + 18 enum-compliance guard tests (this commit)
5. Validation chain → all green
6. Push + await CI re-green
7. Do not merge until BuildingFeatures is enum-safe (CI proof)

