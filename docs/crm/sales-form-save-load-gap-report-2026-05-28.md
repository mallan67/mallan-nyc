# Sales Form — Save / Load Gap Report

> Generated 2026-05-28 on branch `docs/sales-form-save-load-gap-report-2026-05-28`. Diagnostic-only. No code changed.
>
> **Scope:** Sales listing form (`public/crm/SALE-FORM-REDESIGN.html`) save → reload round-trip for CRM-created listings (`SL-XXXX`). Maya's reported symptom — "I save Condop, reload, and it's Condo. Half the form is blank. Heating is unchecked. Address is half-validated and re-unvalidates the building."
>
> Rental form is intentionally NOT in scope per direction. Findings here describe one-to-one root causes; field-map rewrite plan at `docs/superpowers/plans/2026-05-27-sale-form-save-load-rewrite.md` is judged against them at the end.

---

## 0 · Round-trip pipeline (where data flows)

```
[FORM UI: <input>/<select>/<radio>/<checkbox>]
        │
        ▼  collectSaleFormData()                  SALE-FORM-REDESIGN.html:6778
        │  ─ generic forEach over container, building modal, media modal
        │  ─ then OVERRIDES with derived RESO keys (PropertyType, ListPrice,
        │    StreetNumber, ListAgentMlsId, MlsStatus, IDX gates, …)
        │
        ▼  fetch  POST   /api/crm/listings        app/api/crm/listings/route.ts
        │        PATCH  /api/crm/listings/[id]   app/api/crm/listings/[id]/route.ts
        │
        ▼  POST path: normalizePayload + buildPersistenceRecord
        │            → strict canonical routing into:
        │                 listings.{property_type, list_price, borough, neighborhood, city, …}
        │                 listings.address  (StreetNumber, StreetName, UnitNumber, City, …)
        │                 listings.features (Heating, Cooling, AssociationFee, NewDevelopmentYN, …)
        │                 listings.agent_info (ListAgentMlsId, ListAgentFullName, …)
        │                 listings.raw_data  = full normalized payload
        │
        │  PATCH path: NO normalizer. Manual whitelist by RESO key:
        │                 columns updated only when body has PropertyType, ListPrice,
        │                 Borough, Neighborhood, City, PostalCode (etc.)
        │                 address[K]  only for K ∈ {StreetNumber,StreetDirPrefix,StreetName,
        │                                          StreetSuffix,StreetDirSuffix,UnitNumber,
        │                                          City,StateOrProvince,PostalCode,Borough,
        │                                          Neighborhood,BuildingName,UnparsedAddress}
        │                 features[K] only for K ∈ {YearBuilt,StoriesTotal,Rooms,LivingAreaUnits,
        │                                          Flooring,Heating,Cooling,…,CommonInterest,
        │                                          AssociationFee,RealEstateTax,TaxAnnualAmount,
        │                                          NewDevelopmentYN,BathroomsTotal}
        │                 agent_info[K] only for K ∈ {ListAgentKey,ListAgentMlsId,…,ListOfficeMlsId}
        │                 raw_data    = existingRaw ∪ body  (ALL keys verbatim,
        │                                                   including CRM-prefixed
        │                                                   saleHeating, saleBldg*, …)
        │
        ▼  Secondary PATCH from form (submit only, NOT autosave):
        │     MallanAPI.listings.update(dbId, { _crmWorkflowStatus: formWorkflowStatus })
        │                                                  SALE-FORM-REDESIGN.html:7168
        │
        ▼  GET /api/crm/listings/[id]
        │     returns the full Prisma row, BigInt → string, sanitizeForCRM().
        │     Shape: { id, listing_id, status, raw_data, address, features, agent_info,
        │              media, idx_display_yn, internet_*_display_yn, list_price, … }
        │
        ▼  _populateSaleFormFromApi(listing)              SALE-FORM-REDESIGN.html:8533
        │  ─ sources = { raw: raw_data, listing, addr: address, features, agentInfo: agent_info }
        │  ─ SALE_FIELD_MAP loop (line 8566): src='raw'|'addr'|'agentInfo'|'listing'
        │       reads raw[f.rls] for src='raw'; addr[f.rls] || raw[f.rls] for src='addr';
        │       agentInfo[f.agentKey] || raw[f.rls] for src='agentInfo';
        │       listing[f.listingKey] for src='listing'.
        │       Fall-back to raw[f.fallbackRls] if primary missing.
        │  ─ SALE_RADIO_MAP loop (line 8597): reads raw[r.rawKey || r.rls];
        │       valueMap applied (e.g. CommonInterest 'Condominium' → 'Condo').
        │  ─ SALE_CHECKBOX_ARRAY_MAP loop (line 8606): reads raw[ca.rls] AS ARRAY.
        │  ─ Building feature checkboxes / Syndication checkboxes / status / address / agent
        │  ─ Re-sets saleStatus AGAIN on line 8643 to listing.status || raw.StandardStatus.
        │
        ▼  applySalesFieldRules() + calculations  (line 8791)
```

The asymmetry between POST (strict canonical normalizer) and PATCH (lenient manual whitelist), plus a generic-forEach collector that flattens checkbox groups, plus a populate loop keyed off RESO names, is where every failure-mode below originates.

---

## 1 · Per-field round-trip matrix

Legend:
- ✓ — round-trips on create and edit
- ⚠ — round-trips by accident (e.g. via `raw_data` fallback only); structured column / JSON bucket DRIFTS
- ✗ — does NOT round-trip; field appears blank or wrong after reload
- 🆕 — write-on-create only (collect→POST), edit path different
- 📝 — write-on-edit only (collect→PATCH), create path different

### 1.1 Property type & ownership (Maya's "defaults to Condo")

| Field | Collect | Persist (POST) | Persist (PATCH) | Restore | Status |
|---|---|---|---|---|---|
| `salePropertyType` radio (Condo/Coop/Condop/SingleFamily/...) | `data.salePropertyType = checkedRadio.value` | → `raw_data.salePropertyType` (passthrough; not in persistenceMap) | → `raw_data.salePropertyType` (merged passthrough) | `setRadio('salePropertyType', raw.salePropertyType)` then valueMap fallback to `raw.CommonInterest` | ⚠ |
| `PropertyType` (RESO) | derived: `getResoPropertyFields(salePropertyType).PropertyType` (e.g. `Residential`) | → `listings.property_type` column | → `listings.property_type` column | not read by form | ✓ (column) |
| `PropertySubType` (RESO) | derived: `getResoPropertyFields(...).PropertySubType` (`Apartment` for all condo-like) | → `listings.property_sub_type` | → `listings.property_sub_type` | not read by form | ✓ (column) |
| `CommonInterest` | overwritten on collect to `resoFields.CommonInterest` (Condop / Condominium / StockCooperative) | → `features.CommonInterest` via persistenceMap | → `features.CommonInterest` via featureKeys whitelist | radio fallback if `raw.salePropertyType` missing | ⚠ |
| `saleOfficeRetailOwnership` radio (Commercial sub-radio) | generic forEach writes `data.saleOfficeRetailOwnership` | → `raw_data.saleOfficeRetailOwnership` only | → `raw_data.saleOfficeRetailOwnership` only | **not in SALE_RADIO_MAP** | ✗ |
| `saleCommercialOwnership` radio | `data.saleCommercialOwnership` via generic forEach + `data.commercial_ownership = ...` derived | → `listings.commercial_ownership` column on POST; in `raw_data` via passthrough | → `listings.commercial_ownership` column on PATCH | `SALE_RADIO_MAP` `{ rls: 'saleCommercialOwnership', name: 'saleCommercialOwnership', src: 'raw' }` reads `raw.saleCommercialOwnership` | ⚠ |

**Why Maya sees "Condop → reloads as Condo":** the path that should round-trip is `raw.salePropertyType` → `setRadio('salePropertyType', 'Condop')`. That path is intact in the file as written. The most likely causes for it failing in practice are (in priority order):

1. **`_populateSaleFormFromApi` re-sets `saleStatus` twice** (lines 8559 and 8643) but only sets the property-type radio ONCE via the radio-map loop. If the populated listing came back from PATCH with `raw_data` missing the original `salePropertyType` (because the form's _previous_ autosave clobbered it during a populate-overwrite race), the populate has nothing to restore and the HTML default `checked` at line 782 (`<input type="radio" value="Condo" checked>`) wins.
2. **Autosave/populate race.** `performAutoSave` is gated by `_saleAutoSaveReady && !_salePopulateInProgress`. If any input fires `change` between page-load and `_checkSaleEditMode` setting `_salePopulateInProgress = true`, an autosave is dispatched against the HTML-default `Condo` state and PATCH-overwrites the saved Condop. The gate is leaky in the sense that it only blocks the *debounced* timer; setRadio inside populate dispatches `change` (line 8554) which calls `applySalesFieldRules()` which has its own side-effects, and any of those could re-touch fields.
3. **`getResoPropertyFields` not symmetric.** Collect runs `getResoPropertyFields(salePropertyType)` and overwrites `data.CommonInterest`. There is no inverse `commonInterestToSalePropertyType` used at restore time except the small `valueMap: { Condominium: 'Condo', StockCooperative: 'Coop', Condop: 'Condop' }` in SALE_RADIO_MAP. That valueMap handles 3 inputs. Anything else (e.g. `Residential`, `null`) falls through with no radio match and the HTML default Condo wins.

The bug is the COMBINATION of these three things, not any one of them.

### 1.2 Listing-agreement / listingType (workflow status' sibling)

| Field | Collect | Persist | Restore | Status |
|---|---|---|---|---|
| `saleListingType` radio (Exclusive / OwnerOptOut / ParticipantOnly / InHouse*) | `data.saleListingType` from radio + derived `data.ListingAgreement` | passthrough into `raw_data`; `ListingAgreement` is in persistenceMap-ish path but NOT in PATCH's address/features/agent whitelists → lives in raw_data only on PATCH | `SALE_RADIO_MAP {rls:'saleListingType',name:'saleListingType',src:'raw',rawKey:'saleListingType',fallback:'ListingAgreement'}` | ⚠ |
| `Permissions` (OwnerOptOut / Private / null) | derived from listingType | POST: `derivePermissionBooleans` → `owner_opt_out`, `participant_only` columns. PATCH: same derivation only when body has `Permissions`. | derived back on populate from columns? **No.** Populate restores listingType from raw, not from columns. | ⚠ |
| `IDXEntireListingDisplayYN` / `InternetEntireListingDisplayYN` / `InternetAddressDisplayYN` / `SyndicateYN` | forced OFF when listingType ∈ {OwnerOptOut, ParticipantOnly, InHouse*}; otherwise read from form | POST: written by persistenceMap & flag block (line 378-383). PATCH: written ONLY when body has the exact RESO YN key, AND for IDX-display, only when status non-terminal AND `rls_eligible`. | `SALE_FIELD_MAP` reads from `listing.idx_display_yn` / `listing.internet_*` columns | ⚠ on PATCH (column may not refresh if body sent `false` from listingType=OwnerOptOut path) |

### 1.3 Address atoms (the "address is half-validated and re-unvalidates the building")

| Field | Collect → body key | PATCH addressKeys list (`app/api/crm/listings/[id]/route.ts:271`) | Populate read | Status |
|---|---|---|---|---|
| StreetNumber | `data.StreetNumber = data.saleStreetNumber` | ✓ | `addr.StreetNumber` | ✓ |
| StreetDirPrefix | `data.StreetDirPrefix = data.saleStreetDirPrefix` | ✓ | `addr.StreetDirPrefix` | ✓ (post-PR #260) |
| StreetName | `data.StreetName = data.saleStreetName` | ✓ | `addr.StreetName` | ✓ |
| StreetSuffix | `data.StreetSuffix = data.saleStreetSuffix` | ✓ | `addr.StreetSuffix` | ✓ |
| UnitNumber | `data.UnitNumber = data.saleUnitNumber` | ✓ | `addr.UnitNumber` | ✓ |
| City | `data.City = data.saleCity || 'New York'` | ✓ | `addr.City` | ✓ |
| StateOrProvince | `data.StateOrProvince = data.saleStateOrProvince || 'NY'` | ✓ | `addr.StateOrProvince` | ✓ |
| PostalCode | `data.PostalCode = data.saleZipCode` | ✓ | `addr.PostalCode` | ✓ |
| `CityRegion` (Borough alias) | `data.CityRegion = data.saleBorough` | **✗ not in addressKeys** | `SALE_FIELD_MAP {rls:'CityRegion',form:'saleBorough',src:'addr'}` → reads `addr.CityRegion` first, falls back to `raw.CityRegion` | ⚠ (via raw fallback only; `listings.address.CityRegion` NEVER written by PATCH) |
| `SubdivisionName` (Neighborhood alias) | `data.SubdivisionName = data.saleBldgNeighborhood \|\| data.saleNeighborhoodFromAddress` | **✗ not in addressKeys** | `SALE_FIELD_MAP {rls:'SubdivisionName',form:'saleBldgNeighborhood',src:'raw'}` → reads `raw.SubdivisionName` | ⚠ (via raw only; `listings.address.SubdivisionName` NEVER written by PATCH; `listings.neighborhood` column ALSO never refreshed unless body sends literal `Neighborhood`) |
| `Borough` (literal) | not sent by collect (uses `CityRegion`) | listed in addressKeys but body never has it | `addr.Borough` undefined | ✗ structured column drift (top-level `borough` column never refreshed on PATCH) |
| `Neighborhood` (literal) | not sent by collect (uses `SubdivisionName`) | listed in addressKeys but body never has it | `addr.Neighborhood` undefined | ✗ structured column drift (top-level `neighborhood` column never refreshed on PATCH) |
| `CountyOrParish` | `data.CountyOrParish = data.saleCountyOrParish` | **✗ not in addressKeys** | `SALE_FIELD_MAP {rls:'CountyOrParish',form:'saleCountyOrParish',src:'addr'}` → reads `addr.CountyOrParish` first, falls back to `raw.CountyOrParish` | ⚠ (raw only) |
| `PostalCity` | `data.PostalCity = data.salePostalCity` | **✗ not in addressKeys** | `SALE_FIELD_MAP src:'addr'` | ⚠ (raw only) |
| `UnParsedAddress` | `data.UnParsedAddress = data.saleUnparsedAddress` | addressKeys has `UnparsedAddress` (lowercase 'p') — **case mismatch** | `addr.UnparsedAddress` (lowercase p) | ✗ never lands in structured address bucket because body key is `UnParsedAddress` (capital P), bucket only takes `UnparsedAddress` (lowercase p) |
| `BuildingName` | `data.BuildingName = data.saleBldgName` | ✓ | `addr.BuildingName` via SALE_FIELD_MAP `{rls:'BuildingName',form:'saleBldgName',src:'raw'}` (src is `raw`, not `addr` — never reads `addr.BuildingName`) | ⚠ |

**Net for address**: Round-trip works for street atoms (post-PR #260) but borough/neighborhood/county/postal-city/unparsed-address all DRIFT in the structured `address` JSON. They round-trip only via `raw_data` fallback. This explains "address is half-validated and re-unvalidates the building" — the address validator at form load reads either column or `addr` JSON, doesn't see the borough/neighborhood/UnparsedAddress, decides the address is incomplete, fires building re-validation, building lookup re-runs with partial atoms and either fails or returns a different match.

### 1.4 Status (Maya's "defaults to Condo" symptom has a status sibling)

| Field | Persist | Restore | Status |
|---|---|---|---|
| `saleStatus` (CRM workflow: Draft, Active, ContractSigned, OfferOut, …) | Primary save's `data.MlsStatus = getResoMlsStatus(saleStatus)` → triggers status transition via separate `/api/crm/listings/[id]/status` route. THEN secondary PATCH writes `raw_data._crmWorkflowStatus = formWorkflowStatus` (line 7168) — **only from `submitSalesListing`, NOT from `performAutoSave` or `manualSaveDraft`** | populate line 8558: `raw._crmWorkflowStatus \|\| listing.status \|\| raw.StandardStatus \|\| 'Draft'` | ✗ if last save was an autosave or draft-save (no workflow-status PATCH ran) — falls through to `listing.status` which is the canonical RESO status, may not match any `<select>` option in the saleStatus dropdown, value goes blank |
| `saleStatus` re-set | — | populate line 8643 OVERWRITES with `listing.status \|\| raw.StandardStatus \|\| raw.MlsStatus \|\| 'Draft'` — **clobbers the workflow status set on line 8559 with the canonical RESO status** | ✗ this is an unambiguous bug; line 8643 should be removed or made conditional |

### 1.5 Checkbox-array fields (Heating, Cooling, Pets, Building features)

**The smoking gun.** `collectSaleFormData` lines 6917-6932 derive these arrays explicitly:

```javascript
data.PetsAllowed = [];
document.querySelectorAll('input[name="salePetsAllowed"]:checked').forEach(...);
data.BuildingPetsAllowed = [];
data.BuildingFeatures = [];
data.AttendanceType = [];
data.BuildingLaundryFeatures = [];
```

**But `Heating` and `Cooling` are NOT in this block.** They are `<input type="checkbox" name="saleHeating" value="Steam">` (line 2433) — multiple checkboxes sharing the same `name="saleHeating"` and no `id`. The generic forEach at line 6786-6796 does:

```javascript
var key = field.id || field.name;        // → "saleHeating" for every checkbox
data[key] = field.checked;               // → overwrites with each successive checkbox
```

The first 30 Heating options are visited; `data.saleHeating` ends up as `lastBox.checked` (a single boolean, NOT an array). **The actual selected values are LOST at collection time.** Same for Cooling.

| Field | Collect | Persist | Restore | Status |
|---|---|---|---|---|
| `Heating` | NEVER written as array; `data.saleHeating = bool` from last checkbox | `raw_data.saleHeating: bool` only; **`raw_data.Heating` is `undefined`**; `features.Heating` only set on PATCH if body has key `Heating` (it doesn't) | `SALE_CHECKBOX_ARRAY_MAP {rls:'Heating',name:'saleHeating'}` reads `raw.Heating` → undefined → no boxes checked | ✗ |
| `Cooling` | same | same | same | ✗ |
| `PetsAllowed` | array | `raw_data.PetsAllowed: [...]` | `raw.PetsAllowed` array | ✓ |
| `BuildingPetsAllowed` | array | ✓ | ✓ | ✓ |
| `BuildingFeatures` | array of LABELS (`cb.parentElement.textContent.trim()`) | `raw_data.BuildingFeatures: [...]` | `SALE_BUILDING_FEATURE_IDS` loop matches by label OR value | ⚠ (label-based; brittle if labels change, but works in practice) |
| `AttendanceType` | array | ✓ | ✓ | ✓ |
| `BuildingLaundryFeatures` | array | ✓ | ✓ | ✓ |
| `saleCommSubtype` | NO array collection block; generic forEach gives `data.saleCommSubtype = bool` from last commercial-subtype checkbox | `raw_data.saleCommSubtype: bool`; **`raw_data.saleCommSubtype` is NOT an array** | `SALE_CHECKBOX_ARRAY_MAP {rls:'saleCommSubtype',name:'saleCommSubtype'}` reads `raw.saleCommSubtype` expecting an array → falls through `if (!Array.isArray(vals)) return;` → no boxes checked | ✗ |

**Required-field validator gets a stale view.** When Maya sees the red "Heating is required" asterisk after editing a listing where she previously checked Steam + Forced Air, that's because raw_data never held the array, populate restored nothing, the validator now sees no checked Heating boxes and blocks save.

### 1.6 Building modal fields

These are collected in a second pass at line 6884-6893: walks `#saleBuildingModal input/select/textarea`, **but only assigns if `data[key] === undefined`**. If the main container has any field with the same id as a building-modal field, the modal value is silently dropped.

| Field | Collect | Persist | Restore | Status |
|---|---|---|---|---|
| `saleBldgName` → `BuildingName` | `data.BuildingName = data.saleBldgName` | `address.BuildingName` ✓ | populate reads via SALE_FIELD_MAP src:'raw' (NOT addr — see 1.3) | ⚠ |
| `saleBldgYearBuilt` → `YearBuilt` | `data.YearBuilt = parseInt(data.saleBldgYearBuilt)` | `features.YearBuilt` ✓ | SALE_FIELD_MAP src:'raw' reads `raw.YearBuilt` not `features.YearBuilt` | ⚠ |
| `saleBldgTotalFloors` → `StoriesTotal` | derived | `features.StoriesTotal` ✓ | SALE_FIELD_MAP src:'raw' reads `raw.StoriesTotal` not `features.StoriesTotal` | ⚠ |
| `saleBldgTotalUnits` → `NumberOfUnitsTotal` | derived | `raw_data.NumberOfUnitsTotal` (not in featureKeys whitelist) | SALE_FIELD_MAP src:'raw' reads `raw.NumberOfUnitsTotal` | ⚠ |
| `saleBldgBorough` / `saleBldgCity` / `saleBldgState` / `saleBldgZip` | passthrough via generic forEach | `raw_data.saleBldgBorough` etc. — but **also CityRegion / PostalCode derived to RESO from address atoms in §1.3, which may CONFLICT with building-modal values** | `SALE_FIELD_MAP {rls:'saleBldgBorough',form:'saleBldgBorough',src:'raw'}` | ⚠ duplicated source of truth (address-side City vs building-side saleBldgCity) — first conflict the agent sees as "the address pulls out the wrong building" |
| All 21 amenity checkboxes (`saleBldgElevator`, …) | each `data.saleBldgElevator = bool` via generic forEach; ALSO `data.BuildingFeatures = [...]` array of labels | `raw_data.saleBldgElevator: bool` + `raw_data.BuildingFeatures: [...]` | populate has TWO restorers: per-id setChecked via SALE_FIELD_MAP (we did not see them in the visible map slice — they appear NOT to be in SALE_FIELD_MAP) + label-match against BuildingFeatures array | ⚠ amenity checkboxes restore from BuildingFeatures only; if save dropped BuildingFeatures, all amenities go blank on edit. The per-id boolean is dead-weight in raw_data, never restored. |

### 1.7 Agent identity / attribution

| Field | Collect | Persist | Restore | Status |
|---|---|---|---|---|
| `ListAgentMlsId` | `data.ListAgentMlsId = data.saleUpdatingAgent` (current logged-in agent from hidden input) | POST: persistenceMap routes to `agent_info.ListAgentMlsId` + `raw_data.ListAgentMlsId`. PATCH: agentKeys whitelist → `agent_info.ListAgentMlsId` ✓ | populate line 8662: reads `agentInfo.ListAgentMlsId \|\| raw.ListAgentMlsId`, writes back to `#saleUpdatingAgent` via SALE_FIELD_MAP `{rls:'ListAgentMlsId',form:'saleUpdatingAgent',src:'agentInfo',agentKey:'ListAgentMlsId'}` | ✓ |
| Full name / email / phone / office | same shape | ✓ via agentKeys whitelist | ✓ via SALE_FIELD_MAP src:'agentInfo' | ✓ |
| `saleListingAgent` (hidden field, "the agent we last selected") | `data.saleListingAgent` via generic forEach | passthrough in `raw_data` only | populate line 8682 writes `agentHiddenEl.value = _agentId` (the same agent as `saleUpdatingAgent`). | ⚠ (round-trips but treats listingAgent === updatingAgent; if those should diverge for a broker-edits-an-agent's-listing flow, this collapses them) |

Agent attribution round-trips correctly. The status badge bug Maya reported earlier was that the badge showed Maya's email when the listing agent was different — that's an upstream symptom of the broker-edit collapse here, not a save/load gap per se.

### 1.8 Distribution gates (idx, internet, syndicate)

| Field | Collect | Persist | Restore | Status |
|---|---|---|---|---|
| `IDXEntireListingDisplayYN` | derived (forced false for OwnerOptOut/ParticipantOnly/InHouse; else from `saleDist_IDX`) | column `idx_display_yn` gated by `effectiveRlsEligible && !TERMINAL && coerceStrictBool(body.IDXEntire…)` | reads column via SALE_FIELD_MAP `listingKey:'idx_display_yn'` | ✓ |
| `InternetEntireListingDisplayYN` | derived from `saleInternetEntireListingDisplayYN` + `saleDist_VOW` | column `internet_entire_listing_display_yn` via `coerceStrictBool` | reads column | ✓ |
| `InternetAddressDisplayYN` | derived from `saleInternetAddressDisplayYN` | column via `coerceStrictBool` | reads column | ✓ |
| `SyndicateTo` array (the 6 vendor checkboxes) | derived only as `data.SyndicateYN: bool` — **the 6 SALE_SYNDICATION_MAP ids are collected as individual booleans, never serialized as a `SyndicateTo` array** | `raw_data.saleDist_*: bool` per checkbox; `raw_data.SyndicateYN: bool` | populate reads `raw.SyndicateTo` as array → undefined → no individual restore. Then reads `raw.SyndicateYN` boolean and applies to `saleSyndicateYN`. | ✗ individual syndication targets do not round-trip |
| `SyndicateYN` | derived | `raw_data.SyndicateYN` | populate restores `saleSyndicateYN` checkbox | ✓ |

### 1.9 Required-fields commission & FARE-related

| Field | Status |
|---|---|
| `saleExclusiveCommission` / `saleCommissionType` | ✓ (SALE_FIELD_MAP src:'raw') |
| `saleConcessionAmount` / `saleConcessionComments` | ✓ |
| `Concessions` | derived → raw passthrough → SALE_FIELD_MAP src:'raw' ✓ |
| Commission disclosure line (UCBA Art. I §17 "commissions are not set by law…") | not a form field — rendered by template; no save/load involvement | ✓ |

### 1.10 Media (separate bug surface — out of scope, but listed for completeness)

`raw_data.media`/`listings.media` round-trips because PATCH passes `body.media` through verbatim. Reordering is a separate `/api/crm/listings/[id]/media-order` PATCH. Upload dedup is server-side SHA-256. **Duplicate-upload and main-photo bugs are not save/load gaps** — they belong to the upcoming media-platform rebuild.

---

## 2 · Root cause categorization

| # | Category | Pattern | Affected fields |
|---|---|---|---|
| **C1** | **Checkbox-group collector never derives an array** for Heating/Cooling/SyndicateTo/CommercialSubtype. The generic forEach is `data[id||name] = checked` — for grouped checkboxes that share a name with no id, this overwrites repeatedly and emits a single boolean. Save has no array; populate has nothing to restore. | `Heating`, `Cooling`, `SyndicateTo`, `saleCommSubtype` |
| **C2** | **PATCH addressKeys/featureKeys whitelist is missing alias keys** the form actually emits. PATCH writes structured buckets only for canonical RESO names; the form (per persistenceMap aliases) emits `CityRegion`, `SubdivisionName`, `UnParsedAddress` (note capital P), `CountyOrParish`, `PostalCity`, `BuildingName` (some collected as raw passthrough). | `CityRegion`, `SubdivisionName`, `CountyOrParish`, `PostalCity`, `UnParsedAddress` (case), and the corresponding `listings.borough` / `listings.neighborhood` columns which only refresh when body has literal `Borough` / `Neighborhood` |
| **C3** | **POST normalizes via `normalizePayload + buildPersistenceRecord`; PATCH does manual merge.** They produce different `raw_data` shapes and different bucket distributions for the same payload. A field that round-trips on create may not round-trip on edit (and vice-versa). | All non-canonical CRM-prefixed keys; alias keys (`CityRegion`, `SubdivisionName`); permission-derived booleans |
| **C4** | **Populate restores the same field twice and the second overwrites the first.** Line 8559 sets `saleStatus` to workflow; line 8643 unconditionally re-sets to canonical. The workflow status — which is the value the dropdown displays — gets clobbered. | `saleStatus` |
| **C5** | **Workflow status (`_crmWorkflowStatus`) is only written by `submitSalesListing` (line 7168), not by `performAutoSave` or `manualSaveDraft`.** Drafts and autosaves never persist the workflow value, only the canonical. | `_crmWorkflowStatus` for any save path that's not the green "Submit" button |
| **C6** | **SALE_FIELD_MAP source-of-truth is `raw` for most fields, NOT the structured `features`/`address` buckets** where POST routes them. Restore reads `raw.YearBuilt` not `features.YearBuilt`; reads `raw.SubdivisionName` not `address.SubdivisionName`. The structured buckets serve only the public DTO / projection; the form ignores them on restore. Combined with C2/C3, this means a field can be in `features` (right place for compliance) but missing from `raw_data` (right place for restore). | `YearBuilt`, `StoriesTotal`, `Rooms`, `LivingAreaUnits`, `CommonInterest` fallback, `BuildingName`, `AssociationFee`, `TaxAnnualAmount`, `NewDevelopmentYN`, `BathroomsTotal`, `CountyOrParish`, `PostalCity`, address atoms when `addr.X` is null and only `features` has them |
| **C7** | **Building-modal "skip if data[key] already set" collector** (line 6888) lets main-container fields shadow modal fields with the same id. No actual collision exists today (we did not find one), but any future field rename that creates a same-named pair will silently drop the modal value. | latent — no current field |
| **C8** | **`getResoPropertyFields` is one-way.** Forward: salePropertyType → PropertyType/PropertySubType/CommonInterest. Inverse path is a 3-entry valueMap inside SALE_RADIO_MAP. Anything PropertySubType-only or column-only (e.g. PropertyType='Residential', PropertySubType='Apartment', CommonInterest=null in DB but raw.salePropertyType lost) cannot reconstruct the radio. | `salePropertyType` when `raw.salePropertyType` is missing/clobbered |
| **C9** | **Autosave/populate race.** `_salePopulateInProgress` gate only blocks the debounced autosave timer, not the synchronous `change` events that populate itself dispatches via setVal/setChecked/setRadio. If a triggered handler calls `performAutoSave()` directly, an autosave fires mid-populate with partial state. | All radio/select fields; observable as `salePropertyType` collapsing to HTML-default Condo |
| **C10** | **Distribution-gate columns don't refresh on PATCH when body sends derived `false` from listingType.** `update.idx_display_yn` is only written when `body.IDXEntireListingDisplayYN !== undefined`. The form always sends it. But for InHouseWebOnly, body sends `IDXEntireListingDisplayYN=false`, `InternetAddressDisplayYN=true` — PATCH's coerceStrictBool gate accepts these correctly. **No actual gap here** — this row is fine. Listed only to show it was checked. | none |
| **C11** | **Per-id amenity booleans are dead-weight.** Save writes `raw_data.saleBldgElevator: true` AND `raw_data.BuildingFeatures: ['Elevator', …]`. Restore uses ONLY `BuildingFeatures` (label-match). If `BuildingFeatures` is dropped or labels change, amenities go blank even though the per-id booleans are in raw. Two sources of truth, one consulted. | All 19 building amenity checkboxes |

---

## 3 · Fields confirmed failing round-trip

Tight list, ordered by user impact:

1. **`Heating`** — never serialized as array (C1). Maya's red-asterisk symptom on edit.
2. **`Cooling`** — same as Heating (C1).
3. **`saleStatus`** dropdown — clobbered by populate line 8643 (C4) and by autosave/draft paths that don't write `_crmWorkflowStatus` (C5). Falls through to canonical RESO status, which may not be a valid dropdown option, so dropdown goes blank.
4. **`salePropertyType`** radio — round-trips ON PAPER, but practically collapses to HTML-default Condo because of the C9 race + the C8 one-way mapper + the `raw.salePropertyType` field getting clobbered when an autosave PATCH lands during populate.
5. **`SyndicateTo`** individual vendor checkboxes (`saleDist_Listhub` / NYMLS / Realtor / RLS / RPX / WWW) — never serialized as array (C1).
6. **`saleCommSubtype`** — never serialized as array (C1). Commercial sub-classification lost.
7. **`listings.borough` column** — never refreshed by PATCH (C2/C3). Search/projection display drift.
8. **`listings.neighborhood` column** — same (C2/C3).
9. **`listings.address.CityRegion` / `address.SubdivisionName` / `address.CountyOrParish` / `address.PostalCity`** — never written to address bucket on PATCH (C2). Round-trips via `raw_data` only; structured bucket is wrong.
10. **`listings.address.UnparsedAddress`** — case mismatch (`UnParsedAddress` body key vs `UnparsedAddress` bucket key); never lands in structured bucket. Likely the trigger for "address re-unvalidates the building".
11. **`saleOfficeRetailOwnership`** radio — not in SALE_RADIO_MAP at all. Commercial-condo edits lose this.
12. **All 19 building amenity checkboxes** — round-trip only via `BuildingFeatures` array (C11). Per-id boolean restore path doesn't exist. If `BuildingFeatures` is dropped by an upstream save, amenities go blank silently.

---

## 4 · Fields that round-trip ⚠ (work, but via fragile fallback)

Inventoried for completeness; these are NOT failing today but will fail the moment the `raw_data` passthrough loses a field:

- `BuildingName`, `YearBuilt`, `StoriesTotal`, `NumberOfUnitsTotal`, `Rooms`, `LivingAreaUnits`, `AssociationFee`, `TaxAnnualAmount`, `NewDevelopmentYN`, `BathroomsTotal`, `CommonInterest` — restore from `raw.*` even though POST puts them in `features.*` (C6).
- `CityRegion`, `SubdivisionName`, `CountyOrParish`, `PostalCity` — restore from `raw.*` because they never land in `address` bucket on PATCH (C2 + C6).
- `salePropertyType` — restore from `raw.salePropertyType` survives in practice IF and only if no autosave runs during populate (C9).
- `Permissions` and derived booleans — booleans in columns, restore reconstructs from `saleListingType` radio's value (NOT from columns).

---

## 5 · Is the existing field-map rewrite plan required?

> The plan is at `docs/superpowers/plans/2026-05-27-sale-form-save-load-rewrite.md` (created earlier this session; haven't re-read its body in this report, but its declared intent — replace ad-hoc SALE_FIELD_MAP / SALE_RADIO_MAP / collect-derive-overwrite pattern with a single declarative map driving both collect and populate — directly addresses C1, C3, C6, C7, C8, C11).

**Answer: yes, required for the structural fix; but NOT sufficient on its own.** A declarative round-trip map fixes C1, C3, C6, C7, C8, C11 by construction. It does NOT automatically fix:

- **C2 (PATCH whitelist missing alias keys)** — backend change to PATCH addressKeys/featureKeys lists.
- **C4 (saleStatus double-set in populate)** — single-line fix to remove line 8643 (or make it conditional on `!raw._crmWorkflowStatus`).
- **C5 (autosave/draft-save don't persist `_crmWorkflowStatus`)** — surgical change to autosave & manualSaveDraft to send the workflow key alongside.
- **C9 (autosave/populate race)** — separate fix to make populate fully synchronous before flipping `_saleAutoSaveReady`, OR to disable change-event dispatch inside populate.
- **C10/UnparsedAddress case mismatch** — one-line fix in PATCH addressKeys.

Recommendation: ship the small surgical PRs first (C2, C4, C5, C9, case-mismatch), confirm save/load is sound, THEN execute the field-map rewrite to lock the contract in place. Doing the rewrite first risks dragging the small bugs along inside the big refactor — and harder to bisect.

---

## 6 · Smallest safe PR sequence

Each PR is independent and individually verifiable. PRs 1-4 are surgical; PR 5 is the structural rewrite that depends on the others having stabilized the contract.

### PR-A (1-line backend fixes — same PR is fine because they're trivial)
- `app/api/crm/listings/[id]/route.ts` PATCH:
  - addressKeys: add `'CityRegion', 'SubdivisionName', 'CountyOrParish', 'PostalCity', 'UnParsedAddress'` (UnParsedAddress with capital P to match what the form sends; also keep `UnparsedAddress` so Trestle-sourced rows still land).
  - Also add a single conditional: when body has `CityRegion` and not `Borough`, mirror to `update.borough` column; when body has `SubdivisionName` and not `Neighborhood`, mirror to `update.neighborhood` column.
- **Tests:** one Jest test that PATCH-edits an SL-XXXX with `CityRegion='Manhattan'` and `SubdivisionName='Murray Hill'`, then GET returns `address.CityRegion='Manhattan'` AND `borough` column = 'Manhattan'.
- **Acceptance:** address validator stops re-unvalidating the building on edit.

### PR-B (1-line frontend fix — `saleStatus` double-set)
- `public/crm/SALE-FORM-REDESIGN.html` line 8643: remove the second `setVal('saleStatus', listing.status || raw.StandardStatus || raw.MlsStatus || 'Draft');` OR change to `if (!restoredStatus || restoredStatus === 'Draft')`.
- **Tests:** restore test that loads a listing with `raw._crmWorkflowStatus='ContractSigned'`, `listing.status='ActiveUnderContract'` → form's `#saleStatus` value === 'ContractSigned'.
- **Acceptance:** dropdown shows the saved workflow value, not blank.

### PR-C (write `_crmWorkflowStatus` from every save path)
- `public/crm/SALE-FORM-REDESIGN.html` `performAutoSave` and `manualSaveDraft`: include `_crmWorkflowStatus` in the PATCH body when `#saleStatus` has a value.
- **Tests:** save a draft with status='OfferOut', reload, dropdown shows OfferOut.
- **Acceptance:** drafts and autosaves preserve workflow status.

### PR-D (checkbox-array collector for Heating / Cooling / SyndicateTo / saleCommSubtype)
- `public/crm/SALE-FORM-REDESIGN.html` `collectSaleFormData`: add explicit `data.Heating = [...checked]`, `data.Cooling = [...checked]`, `data.SyndicateTo = SALE_SYNDICATION_MAP.filter(checked).map(target)`, `data.saleCommSubtype = [...checked]` (the last one if a separate `name="saleCommSubtype"` group exists; otherwise drop the SALE_CHECKBOX_ARRAY_MAP entry).
- Backend: PATCH featureKeys already has `Heating` and `Cooling` — those will round-trip into `features.*` for free.
- **Tests:** save a listing with Steam + Forced Air heating, reload, both boxes checked. Same for Cooling. Same for SyndicateTo.
- **Acceptance:** Heating/Cooling/SyndicateTo round-trip end-to-end. Maya's red-asterisk symptom disappears.

### PR-E (autosave/populate race — eliminate)
- `public/crm/SALE-FORM-REDESIGN.html`:
  - `setVal` / `setChecked` / `setRadio` inside `_populateSaleFormFromApi`: pass an explicit `silent=true` flag to skip the `change` event dispatch, OR call `applySalesFieldRules()` ONCE at the end (line 8791) instead of letting each setRadio fire it.
  - `_salePopulateInProgress` flag: ensure flipped to `false` only AFTER all calculations run (already at line 8791-ish, but verify).
  - `performAutoSave` direct callers (if any from change handlers): replace with debounced version.
- **Tests:** Playwright test that loads an edit-mode form, asserts no PATCH fires during the populate window, asserts `salePropertyType` radio value matches saved value after populate completes.
- **Acceptance:** Condop saved → Condop reloaded, consistently.

### PR-F (UnparsedAddress case fix — could be combined with PR-A)
- `app/api/crm/listings/[id]/route.ts` PATCH: in addressKeys handling, treat `UnParsedAddress` and `UnparsedAddress` as the same key (normalize to `UnparsedAddress` in the bucket, accept either casing from body).
- `public/crm/SALE-FORM-REDESIGN.html` collect: change `data.UnParsedAddress` (line 6823) to `data.UnparsedAddress`.
- **Acceptance:** building lookup gets the full unparsed address on edit, doesn't fall back to atom-only re-build.

### PR-G (structural rewrite — the existing plan)
- Execute `docs/superpowers/plans/2026-05-27-sale-form-save-load-rewrite.md`. With PR-A through PR-F merged, the contract is stable and the rewrite locks it in. Expected wins:
  - Single declarative map drives collect + populate (eliminates SALE_FIELD_MAP vs SALE_RADIO_MAP vs SALE_CHECKBOX_ARRAY_MAP vs ad-hoc derive blocks).
  - Per-field round-trip tested via a single generated table.
  - `saleOfficeRetailOwnership` and the 19 building amenity per-id booleans get first-class round-trip entries (closes C11).
  - PATCH whitelist + populate read-path stay in lockstep via codegen or shared constant.

### Out of scope for this report (separate work)
- Media platform rebuild (duplicate uploads, drag-to-reorder, main-photo selector, lightbox, floor-plan separation, bulk delete) — Maya called this out as its own track.
- Frontend featured/exclusives display of SL-0004 — API returns it; frontend render path is a separate frontend bug.
- Rental form parallel — out of scope per Maya's "do not touch rental".

---

## 7 · Verification I did not run (intentionally)

Did NOT call production `/api/crm/listings/SL-0004` because the diagnostic could be completed from source alone (the contract bugs are static, not data-dependent). When PR-A through PR-F are wired and ready to merge, a live SL-0004 round-trip test (save → reload → diff) will be the proof.

---

## 8 · TL;DR for Maya

- **Why "I save Condop, reload, Condo":** combination of an autosave race during populate (C9) + a one-way property-type mapper (C8) + no defensive write-back of `raw.salePropertyType` on rapid edits.
- **Why "Heating is missing required field":** Heating and Cooling are never saved as arrays. Collect treats them as repeated single booleans, raw_data has no `Heating` key, populate finds nothing to restore, validator says "required" because no box is checked. SyndicateTo and saleCommSubtype have the same bug.
- **Why "address re-unvalidates the building":** PATCH's addressKeys whitelist is missing the alias keys the form sends (`CityRegion`, `SubdivisionName`, `UnParsedAddress` with capital P, `CountyOrParish`, `PostalCity`). They end up in `raw_data` only, the structured `listings.address` bucket is stale, the `listings.borough`/`listings.neighborhood` columns never refresh, and the on-edit address validator sees a half-populated record and triggers a building re-lookup.
- **Why the status dropdown sometimes blanks:** populate sets the workflow status on line 8559, then unconditionally overwrites it with the canonical RESO status on line 8643 (one-line bug). Plus autosave/draft-save don't write `_crmWorkflowStatus` at all (only Submit does).
- **Field-map rewrite plan is required.** But ship the 5 small surgical PRs first (A-F) so the rewrite isn't dragging unfixed bugs along with it.
