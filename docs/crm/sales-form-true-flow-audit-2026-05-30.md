# Sales-Form True-Flow Audit — 2026-05-30

**Source of truth: Cotality `$metadata` ONLY** (`artifacts/metadata.xml`, live OData $metadata,
745 Property fields). No RESO CSV, no RLS registry, no other source. Field names that are not
in Cotality `$metadata` are flagged below as **phantom/old** unless they are deliberate
Mallan-internal extensions stored in `raw_data` (building-level / NYC-specific data that
Cotality's unit-level Property resource does not carry).

Scope (locked): `public/crm/SALE-FORM-REDESIGN.html`, `app/api/crm/listings/route.ts`,
`app/api/crm/listings/[id]/route.ts`, `app/api/crm/listings/[id]/status/route.ts`, sales-form
tests, and helpers directly called by these. Nothing else touched.

Method: read line-by-line from code (no spot checks). Every claim cites `file:line`.

---

## §1 — True production flow (first load → save → reload)

### Stage 1 — Entry / loading
- Edit URL `/crm/sale-listing?id=<id>` opens the CRM shell which serves
  `public/crm/SALE-FORM-REDESIGN.html` **directly** (not built into `index-built.html`; source
  edits are live).
- Edit mode fetches **`GET /api/crm/listings/[id]`** (`app/api/crm/listings/[id]/route.ts:44`).
  `findListing(id)` (`:28`) resolves by **numeric `id`** (`prisma.listing.findUnique({id:BigInt})`)
  first, else by **`listing_id`** string. So `?id=308773` (numeric) and `?id=SL-0004`
  (listing_id) both resolve.
- GET returns `sanitizeForCRM({...listing})` (`:60`) — the **full** row incl. `raw_data`,
  `address`, `features`, `agent_info`, and scalar columns.
- The form calls **`_populateSaleFormFromApi(listing)`** (`SALE-FORM-REDESIGN.html:9186`) with the
  whole listing object.
- Populate lifecycle guards (`:7689`): `window._salePopulateInProgress = true` is set BEFORE
  populate and cleared AFTER; `window._saleAutoSaveReady` stays **false** until the fetch +
  populate + agent fallback all complete. Autosave is gated on
  `(_saleAutoSaveReady && !_salePopulateInProgress)` so it cannot fire mid-populate.

### Stage 2 — Populate (`_populateSaleFormFromApi`, `:9186`–~`:9520`)
- Internal setters `setVal/setChecked/setRadio` (`:9203`–`:9227`) **suppress** the bubbling
  `change` event while `_salePopulateInProgress` is true (C9 fix) — prevents cascaded
  `applySalesFieldRules`/`parseSaleAddress` handlers from clobbering not-yet-set values.
  `applySalesFieldRules()` is called **once** at the end.
- Sources object: `{ raw, listing, addr, features, agentInfo }` (`:9253`).
- Field restore is data-driven via three maps:
  - **`SALE_FIELD_MAP`** (`:8693`–`:8939`) — scalar/date/bool/number inputs; each entry
    `{ rls, form, type, src }`. `src:'raw'` reads `raw_data[rls]`; `src:'addr'` reads
    `addr[rls] || raw[rls]`; `src:'listing'` reads a column; `src:'agentInfo'` reads agent_info.
    `fallbackRls` provides a secondary key.
  - **`SALE_RADIO_MAP`** (`:9043`–`:9096`) — every radio group incl. all required radios.
    Reads `raw[rawKey||rls]`, optional `fallback`, optional `valueMap`. Boolean-safe
    (explicit undefined/null check, not truthy — PR #270 fix).
  - **`SALE_CHECKBOX_ARRAY_MAP`** (`:8942`–`:8983`) — `raw[rls]` array → checks
    `input[name=ca.name]` boxes. **Set directly, NO change event.**
- Neighborhood select gets a dedicated dynamic-option restore
  `_restoreSaleNeighborhoodSelect(raw.SubdivisionName||raw.saleBldgNeighborhood, …)` (`:9291`,
  fn `:9148`) — matches by value / compact-value / display-label, else adds the option under the
  borough optgroup. Fixes the async-options + compact-vs-label mismatch race.
- Auction (`:9440`), media previews (`:9458`).

### Stage 3 — User edit
- Required Yes/No radios `saleHeatingYN`/`saleCoolingYN` carry **ids** `saleHeatingYes/No`
  (`:2424`,`:2374`); `saleHasViews` has no id (`:2115`). All three detail groups
  (`saleHeating`/`saleCooling`/`saleViewList`) are checkbox arrays.
- `_autoSetYesWhenTypeChosen` (`:9102`) flips an UNSET YN radio to "Yes" when a detail box is
  checked; respects an explicit Yes/No. Wired on `change` in DOMContentLoaded.
- Views no longer pre-checks "No" (`:2118`, fixed 2026-05-30) so the auto-set works on a fresh
  form and an explicit No is still honored.

### Stage 4 — Collection (`collectSaleFormData`, `:6977`–`:7419`)
- Generic loop (`:6985`) over `.flex-1 input,select,textarea`: radio → `data[id||name]=value`
  **only if checked**; checkbox → `data[id||name]=checked`; else `data[id||name]=value`.
- `_deriveSaleYNFields(data)` (`:6999` call, fn `:9122`) sets `saleHeatingYN/saleCoolingYN/
  saleHasViews` **by name** (radio value if checked → explicit No respected, else "Yes" when a
  detail box is checked) and drops the id-keyed strays. Fixes the id-vs-name collect gap + the
  edit-reload checkbox-only case (Codex #280).
- Explicit RESO/Cotality-name emits (`:7157`–`:7416`): arrays `Heating`,`Cooling`,`PetsAllowed`,
  `BuildingFeatures`,`AttendanceType`,`SyndicateTo`,… and scalars `BuildingName`,`StructureType`,
  `TaxBlock`,`CrossStreet`,`AssociationName`,`Concessions`,`ListPrice`,`BedroomsTotal`, etc.
- Building modal + media modal fields collected separately (`:7134`,`:7145`).

### Stage 5 — Save / update
- **Autosave** `autoSaveDraft`→`performAutoSave` (`:7692`,`:7700`): debounced 2 s; gated on
  `_saleAutoSaveReady && !_salePopulateInProgress`; server save uses `collectSaleFormData()`
  (`:7755`) → `MallanAPI.listings.update(id, …)` (PATCH). Re-sends the full populated form, so it
  does not null building fields (gate prevents firing before populate completes).
- **Manual** `manualSaveDraft` (`:7780`): `collectSaleFormData()` + `status:'Draft'` → PATCH.
- **Submit** `submitSalesListing` (`:7416`).
- **PATCH** (`app/api/crm/listings/[id]/route.ts:75`): `merged = {...existingRaw, ...body}`;
  `raw_data = merged` (**full catch-all — every collected key round-trips here**, `:354`).
  Selective column mirroring (`:165`–`:272`): `property_type`,`property_sub_type`,`list_price`,
  `bedrooms_total`,`bathrooms_full`,`bathrooms_half`,`living_area`, `borough`←Borough|CityRegion,
  `neighborhood`←Neighborhood|SubdivisionName, `city`,`postal_code`, gate columns, auction,
  permissions. `address` bucket allowlist (`:285`); `features` bucket allowlist (`:313`) incl.
  `Heating`,`Cooling`,`YearBuilt`,`CommonInterest`,`AssociationFee`,`TaxAnnualAmount`,
  `BathroomsTotal`; `agent_info` allowlist (`:328`).
- **Status** transitions go through a separate route (`[id]/status/route.ts`) — state machine +
  DOM tracking + `computeGateColumns` recompute. Not the field-save path.

### Stage 6 — Reload
- `GET` returns the row; populate reads `raw` first for almost everything. Because PATCH stored
  `raw_data = full merged body`, any key collect emitted is present in `raw` and restorable by
  the maps. Conflict resolution: maps read `raw[rls]` with `addr`/`features`/`listing` only for
  specific `src` entries; `fallbackRls`/`fallback` cover secondary keys.

### Stage 7 — Required / sidebar validation
- `SALE_REQUIRED_FIELDS` (`:7902`–`:7948`); `fieldHasValue` (`:7874`) — radio satisfied if any
  `input[name]:checked` OR (for Heating/Cooling/Views) `orCheckboxName` box checked.
  `validateREBNYRequired` (`:8051`) collects missing labels; `updateSaleValidationSummary`
  (`:7968`) paints tab dots + section lists, gated by `_saleValidationActivated`.

---

## §2 — Field contract table (locked field groups)

Legend: RT = round-trips (collect→raw_data→restore→validator). Cot = present in Cotality `$metadata`.

| Field group | DOM id/name | type | collect key | persisted (raw_data + col/bucket) | restore (map) | validator | Cot? | status |
|---|---|---|---|---|---|---|---|---|
| Heating | name `saleHeatingYN`(id Yes/No) + name `saleHeating` | radio + checkbox[] | `saleHeatingYN` (derive) + `Heating[]` | raw + features.Heating | RADIO_MAP `saleHeatingYN` + ARRAY_MAP `Heating`→`saleHeating` | required (orCheckbox `saleHeating`) | `Heating` ✓ | **PASS** |
| Cooling | name `saleCoolingYN`(id) + `saleCooling` | radio + cb[] | `saleCoolingYN` + `Cooling[]` | raw + features.Cooling | RADIO_MAP + ARRAY_MAP `Cooling` | required (orCheckbox) | `Cooling` ✓ | **PASS** |
| Views | name `saleHasViews` + `saleViewList` | radio + cb[] | `saleHasViews` + `saleViewList[]` | raw | RADIO_MAP `saleHasViews` + ARRAY_MAP `saleViewList` | required (orCheckbox) | n/a (internal list) | **PASS** |
| Neighborhood | id `saleBldgNeighborhood` | select | `saleBldgNeighborhood` + `SubdivisionName` | raw + col `neighborhood`←SubdivisionName | `_restoreSaleNeighborhoodSelect` (dynamic add) | — | `SubdivisionName` ✓ | **PASS** |
| Borough / CityRegion | id `saleBorough` | select | `saleBorough` + `CityRegion` | raw + col `borough`←CityRegion | FIELD_MAP | — | `CityRegion` ✓ | **PASS** |
| TaxBlock | id `saleBldgTaxBlock` | input | `TaxBlock` | raw | FIELD_MAP `TaxBlock`→`saleBldgTaxBlock` (`:8753`) | — | `TaxBlock` ✓ | **PASS** |
| TaxLot | id `saleBldgTaxLot` | input | `BuildingTaxLot` | raw | FIELD_MAP `BuildingTaxLot`→`saleBldgTaxLot` (`:8754`) | — | **`TaxLot`** (not BuildingTaxLot) | **FAIL-K** |
| Association | id `saleBldgAssociationName` / `saleMaintCC` | input | `AssociationName` + `AssociationFee` | raw + features.AssociationFee | FIELD_MAP | `saleMaintCC` required (conditional) | `AssociationName`,`AssociationFee` ✓ | **PASS** |
| StructureType / CommonInterest | id `saleBldgType`/`saleStructureType`; derived CommonInterest | select | `StructureType`,`CommonInterest` | raw + features.CommonInterest | FIELD_MAP + RADIO_MAP salePropertyType | — | `StructureType`,`CommonInterest` ✓ | **PASS** |
| Building amenities | `#saleBuildingModal [data-rls-field=BuildingFeatures]` | cb | `BuildingFeatures[]` + `saleBuildingFeaturesInternal[]` | raw | inverse-label restore (`:9326`) | — | `BuildingFeatures` ✓ | **PASS** |
| YearBuilt | id `saleBldgYearBuilt` | input | `YearBuilt` | raw + features.YearBuilt | FIELD_MAP `YearBuilt` (`:8747`) | — | `YearBuilt` ✓ | **PASS** |
| YearRenovated | id `saleBldgYearRenovated` (data-rls-ignore) | input | `YearRenovated` | raw only | FIELD_MAP `YearRenovated`→`saleBldgYearRenovated` (`:8748`) | — | **none** (Mallan-internal, intended) | PASS (internal) |
| CrossStreet | id `saleBldgCrossStreet1` | input | `CrossStreet` | raw | FIELD_MAP `CrossStreet` (`:8752`) | — | `CrossStreet` ✓ | **PASS** |
| Exposure | name `saleExposure` | cb[] | `saleExposure[]` | raw | ARRAY_MAP `saleExposure` | — | `DirectionFaces`/`Exposure`? (internal list kept) | PASS (internal) |
| Board/building radios | `saleBoardApplication`/`saleBoardApproval`/`saleBoardInterview`… | radio | by name | raw | RADIO_MAP Class-A entries (`:9063`–`:9096`) | — | Mallan-internal | PASS (internal) |
| Purchasing options | `saleCoPurchasing`/`saleParentsBuying`/`saleGuarantors`/`salePiedATerre`… | radio | by name | raw | RADIO_MAP Class-A | — | Mallan-internal | PASS (internal) |
| Concessions | id `saleConcessions` | select | `Concessions` | raw | FIELD_MAP `Concessions` (`:8731`) | — | `Concessions` ✓ | **PASS** |
| Commission | id `saleExclusiveCommission` | input | `saleExclusiveCommission` | raw | FIELD_MAP `saleExclusiveCommission` (`:8840`) | required | Mallan-internal (compensation, stripped from public DTO) | **PASS** |
| First showing / activation | id `saleFirstShowingDate` | input | `FirstShowingDate` | raw | (no FIELD_MAP entry for FirstShowingDate) | — | **`ActivationDate`** (FirstShowingDate phantom) | **FAIL-C/F** |
| Possession | id `saleAvailableOccupancy` | input | `PossessionDate` | raw | FIELD_MAP (check) | — | **`Possession`** (PossessionDate phantom) | **FAIL-K** |
| Bathrooms total | derived | — | `BathroomsTotal` | features.BathroomsTotal | (display uses `bathrooms_full/half` cols) | — | **`BathroomsTotalInteger`** | **FAIL-K (low)** |
| Permissions | derived from `saleListingType` | — | `Permissions` | raw; PATCH derives owner_opt_out/participant_only | (derived, not restored) | — | **`Permission`** (singular) | **FAIL-K (low)** |
| Syndicate | `saleDist_*` | cb | `SyndicateTo[]` **+ `SyndicateYN`** | raw | ARRAY via SyndicateTo | — | `SyndicateTo` ✓; **`SyndicateYN` phantom** | **FAIL-K (drop YN)** |

All other required radios (`salePropertyType`,`saleBuildingStatus`,`saleGarageSpaces`,
`saleWasherDryerAllowed`,`fireplace`) have RADIO_MAP restore entries (`:9049`–`:9055`) → **PASS**.

---

## §3 — Failures found (proven), classified

Failure classes (per audit spec) + new class **K = field name not in Cotality `$metadata`
(phantom/old) while a real Cotality field exists**.

| # | Field | Class | Proven failure | Root cause (file:line) |
|---|---|---|---|---|
| F1 | First-showing date | **C/F + K** ✅ FIXED | Form saved `FirstShowingDate`; the Coming-Soon / activation compliance gate reads **`ActivationDate`** (`[id]/route.ts:132`, `[id]/status/route.ts:148`). The agent's first-showing date never drove activation, and `FirstShowingDate` is not in Cotality. Fixed: collect emits `ActivationDate` (prefers the Coming-Soon `saleActivationDate` input, else `saleFirstShowingDate`); FIELD_MAP restores `ActivationDate→saleFirstShowingDate` with legacy `FirstShowingDate` fallback. | was `:7330` emit `FirstShowingDate`; FIELD_MAP `:8741`. |
| F2 | Building tax lot | **K** ✅ FIXED | Stored/restored as `BuildingTaxLot`; Cotality field is **`TaxLot`**. Fixed: collect emits `TaxLot`; FIELD_MAP `TaxLot→saleBldgTaxLot` + legacy `BuildingTaxLot` fallback. | collect `:7163`, FIELD_MAP `:8754`. |
| F3 | Possession | **K** ✅ FIXED | Saved as `PossessionDate`; Cotality field is **`Possession`**. Fixed: collect emits `Possession`; FIELD_MAP `Possession→saleAvailableOccupancy` + legacy `PossessionDate` fallback. | collect `:7342`, FIELD_MAP `:8751`. |
| F4 | Bathrooms total | **K (low)** ⏸ DEFERRED | `BathroomsTotal` in `features`; Cotality is **`BathroomsTotalInteger`** — but the form computes a DECIMAL (`full + half*0.5`, e.g. 2.5) while `BathroomsTotalInteger` is a whole-number field, so a blind rename would be semantically wrong. Display already uses the `bathrooms_full/half` columns (no public impact). Needs the Integer-vs-decimal mapping decision before changing — not guessed. | collect `:7023`, PATCH featureKeys `:320`. |
| F5 | Permissions | **K (low)** ⏸ DEFERRED | Form/PATCH use `Permissions` (plural); Cotality enum is **`Permission`** (singular). This is **CRM-internal** plumbing that drives `owner_opt_out`/`participant_only` (distribution gates) via `derivePermissionBooleans` and is **never sent to Cotality** (mallan.nyc does not write to Cotality). Renaming touches the compliance-gate derivation in three places — deferred to a focused, separately-tested change to avoid risking the opt-out/participant gates. | collect `:7075`, PATCH `:265`, POST `:284`. |
| F6 | Syndicate YN | **NOT A FAILURE (reclassified)** | `SyndicateYN` is NOT a phantom: it is a Mallan-internal syndicate on/off control that drives the `saleSyndicateYN` checkbox (`:3217`), a distribution gate (`:5597`), and round-trips via restore (`:9390`). Cotality has only `SyndicateTo` (also emitted). Removing `SyndicateYN` would break the checkbox restore — left intact as a legitimate Mallan-internal control. | n/a |
| F7 | Heating/Cooling/Views canonical YN | **C/F + K** ✅ FIXED | Form emitted only the FORM keys (`saleHeatingYN`…) + `Heating`/`Cooling` arrays, but NOT the canonical Cotality booleans **`HeatingYN`/`CoolingYN`/`ViewYN`** nor the canonical **`View`** array. Server-side RLS conditional enforcement keys on those (`rebny-field-tables.ts:725-748` `appliesWhen:{HeatingYN:[true]} requireFields:['Heating']`), so the relaxed checkbox-only UI validation could publish detail arrays while the conditional rule never fired. All four are real Cotality `$metadata` fields. (Codex #280 follow-up #2.) | `_deriveSaleYNFields` (`:9122`) wrote only form keys; collect emitted no `View`. |

**Not failures (verified PASS / intended Mallan-internal):** Heating, Cooling, Views, Neighborhood,
Borough, TaxBlock, Association, StructureType/CommonInterest, building amenities, YearBuilt,
CrossStreet, Concessions, Commission, all required radios, autosave-overwrite (gated),
async neighborhood race (dynamic restore). Building-level + NYC-specific fields
(`BuildingHeating/Cooling`, `FlipTax`, `TaxAbatement*`, `SponsorUnitYN`, `RentingAllowedYN`,
`YearRenovated`, `ElevatorsTotal`, `AttendanceType`) have **no** Cotality Property equivalent and
are correctly kept Mallan-internal in `raw_data` (not masquerading as Cotality fields).

---

## §4 — Fix plan (only FAIL rows; one root cause each; coordinated to avoid breaking a side)

Each rename is applied across **collect → PATCH allowlist (if any) → SALE_FIELD_MAP restore →
any reader**, with a round-trip contract test, so no side is left broken.

- **F1 (priority):** emit `data.ActivationDate` from `saleFirstShowingDate` (keep the input id),
  add `SALE_FIELD_MAP { rls:'ActivationDate', form:'saleFirstShowingDate', type:'date', src:'raw' }`,
  drop the phantom `FirstShowingDate` emit. Verifies the activation gate now sees the agent's date.
- **F2:** emit `data.TaxLot` (from `saleBldgTaxLot`), restore via `{ rls:'TaxLot', form:'saleBldgTaxLot' }`,
  keep a `BuildingTaxLot` read-fallback for already-saved rows.
- **F3:** emit `data.Possession` (from `saleAvailableOccupancy`), restore `{ rls:'Possession', … }`,
  fallback read `PossessionDate`.
- **F4:** emit `data.BathroomsTotalInteger`; add to PATCH featureKeys; keep `BathroomsTotal` write
  removed (display already uses columns).
- **F5:** emit `data.Permission` and read it in PATCH `derivePermissionBooleans` path (accept both
  during transition).
- **F6:** stop emitting `SyndicateYN` (keep `SyndicateTo`).

Tests (executable, `tests/runtime/sale-form-save-load-retention.test.ts`): for F1–F3, prove
collect emits the Cotality key, and (F1) the activation-gate-relevant key is present; legacy
read-fallback restores old rows.

Gates: `type-check`, `crm:test`, `sentinel:l`, `compliance-check`, `ucba:audit`,
`sale-form-save-load-retention` + new contract tests.
