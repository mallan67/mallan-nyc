# The four CRM forms — create → save → reload → edit → save → reload, proven in a real DOM (2026-09-08)

Maya's requirement: every editable Mallan-authored field on the sale and rental entry forms must prove
`create → save → reload → edit → save → reload`; the tools (WITH-TOOLS) pages must show the canonical saved
listing, not a private re-mapping. She needs the sale form (fixed ~90 days ago, updated for open houses) intact and
the rental form working for a listing entered on 2026-09-09.

## 1. The proof — `tests/runtime/crm-form-dom-roundtrip.test.ts` (6 tests, green)

Each page is loaded into jsdom with its own scripts running (CDN assets skipped, the page's `fetch` served from a
map). Every editable control is filled as an agent would (events fire, the page's own address parser runs, the
session identity set), the form's **own** collector builds the payload, the **real** route handlers persist it
(`POST /api/crm/listings`, `GET`, `PATCH … /[id]` against the in-memory store of `crm-listing-round-trip.test.ts`,
RLS enforcement gate included, listing created as an apartment — no lot, no building area), the form's **own** loader
hydrates a fresh page from the GET body, and the collector runs again. Every control the collector saved is compared
by key; a lost value is reported by name. The edit pass changes every control, saves through PATCH and reloads. A
third test opens the WITH-TOOLS viewer the way the CRM opens it (`?id=…`, the page's API client fetching the
listing) and compares every control it shares with the entry form against the saved facts.

Excluded, by name and reason (the only allow-list): search boxes (`…Search`), the server-stamped `…CreateDate`,
the `…SendToAll` convenience toggle (the destination boxes themselves are compared), the open-house ENTRY row
(`saleNewOH…`, persisted through the open-house API), the media-order input, the building street address (derived
from the unit address on reload), the `rentalCityDisplay` mirror and the required-only view toggle. Checkbox groups
are compared as sets against the array the collector saves for them (in every pass, not only the viewer's);
a radio the page leaves unchecked is legitimately absent; a key the collector never emits FAILS (no fail-open
skip); the hidden address atoms the parser writes are compared (the typed "East" against the verified live
member "E"); a control a page script disables at init (the VOW opt-out, the sale form's master display flag) is
compared; null is never equal to 0; the listing is a **residential condo** so the REBNY validator and the
enforcement gate RUN on create (a commercial or in-house listing is website-only and skips them); the edit pass
unchecks every box and changes every value; the viewer floor is the number of entry-form controls the viewer
carries (293 sale / 372 rental), every one compared. An adversarial review of the proof
(`tests/runtime/crm-form-dom-roundtrip.test.ts`, 2026-09-08) produced these rules; what the proof still does not
cover is stated in its header: the Postgres boundary (in-memory store) and the pages' own save / load wiring.

## 2. What the proof found and what changed

### Rental entry form (`public/crm/RENTAL-FORM-REDESIGN.html`)

| Found | Fix |
|---|---|
| Reload restored **57 of 266** saved controls (the explicit loader named 63 targets; building modal, commission, amenities, furnished terms, townhouse, owner, distribution … never came back) | `_restoreFormKeys` — the mirror of the generic collector: every saved form key back onto its control (radios, single checkboxes, selects — a saved option is added when a dynamic list has not loaded); the canonical restores run after it |
| Checkbox GROUPS (`rentalHeating` 43 boxes, `rentalCooling` 25, `rentalBusinessType` 21, `bldgHeating` 36, `bldgCooling` 24, `rentalCommSubtype` 17, `bldgDocsAvailable`, `rentalTHDocsAvailable`) were collected as the LAST box's boolean — the selection was lost at SAVE | collected as arrays (`Heating`, `Cooling`, `BusinessType` are live multi-selects — every form value verified a live member; the rest Mallan facts); restored by `_restoreCheckboxGroup` (live features first, then raw) |
| The address went out under the legacy key `UnParsedAddress`; the RLS enforcement gate reads the payload BEFORE the normalizer's alias step, so every RLS-eligible rental was blocked on "UnparsedAddress missing" | the collector emits the live key `UnparsedAddress` |
| Furnished terms (`FurnishedListPrice / Min / MaxLeaseMonths`, REBNY FURNISHED-001), `MaxLeaseMonths`, `NewConstructionYN`, `LotSizeUnits` / `BuildingAreaUnits`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `ActivationDate` were never emitted; a phantom `FirstShowingDate` was | emitted from their controls (gates cascade to false under the master flag); the phantom removed |
| `LotSizeArea` / `BuildingAreaTotal` were emitted as **0** when blank — REBNY AREA-UNITS-003 (`LotSizeArea >= 0 → LotSizeUnits`) then blocked every apartment | blank = `null` (no lot), units emitted only with a figure (both forms) |
| Bedrooms `6+` / baths `5+` / `3+` reloaded as blank (typed column `6` is not an option); status `Incomplete` reloaded as `Draft`; the participant-only / owner-opt-out listing type reloaded as `ExclusiveRightToLease`; the display-intent checkboxes reloaded from the stored columns the display gate flips; the exclusive EXPIRY reloaded from the START date | the saved form key wins for each; the stored column / permission decision rebuilds legacy rows |
| First-showing date-time lost on reload (a date-only value into a datetime-local control) | the form key keeps the time; `ActivationDate` (Edm.Date) restores the day for legacy rows |
| `rentalTHBasementYN` toggled its detail on `'true'` while its options are `Yes` / `No`; `BasementYN` / `TaxAbatementYN` were only true for `'true'` | `Yes` recognised |
| `rentalSyndicateYN` bound to the live multi-select `SyndicateTo`; `rentalLeaseType` (NonStabilizedLease / StabilizedLease) bound to `AvailableLeaseType` (commercial lease structures) | `data-mallan-field="_mallanSyndicationIntent"` (a declared Mallan decision key, persisted) and `data-mallan-field="LeaseType"` (the declared Mallan key already emitted) |

### Sale entry form (`public/crm/SALE-FORM-REDESIGN.html`) — Maya's working form; changes are additive

| Found | Fix |
|---|---|
| `MaximumFinancingRemarks`, `BuildingPetsAllowedComments`, `MaximumFinancingPercent`, `TaxAbatementExpirationYear`, `NewDevelopmentYN` were mapped **before** the building modal was collected, so they went to the server EMPTY on every save (a required co-op field among them) | re-emitted after the modal loops |
| The Yes/No selects `saleBldgTaxAbatementYN`, `saleTHGarageYN`, `saleTHBasementYN` were typed as booleans: `TaxAbatementYN` / `BasementYN` could never be true, and the reload `setChecked` on a select did nothing | `Yes` recognised on save; a select bound to a Boolean fact restores `Yes` / `No` |
| First-showing date-time lost on reload (`ActivationDate` is Edm.Date; the map split the time away) | the form key (`rawKey`) keeps the time; `ActivationDate` restores the day; the legacy phantom key is the last fallback |
| 30 townhouse operating figures, admin comments, original rooms, `saleLivingArea`, the building-profile selects (class, fuel, subway, board approval) were saved but never restored | the same `_restoreFormKeys` pass, run FIRST — the data-driven maps keep winning where they exist (features-first tax etc. unchanged) |
| `StreetDirPrefix` "East" (what the page's parser writes for "400 East 90th Street") was refused by the live-enum boundary added 2026-09-06: **422 on every East / West address, both forms** | `MALLAN_FORM_CONTRACT.valueAliases.StreetDirPrefix` — North/South/East/West → the live N/S/E/W members (the verified mapping) |
| **Found only once the proof used an RLS-eligible listing** (a residential condo; the earlier fixture picked "Commercial", which is website-only and skips the gate): the REBNY-mandatory `YearBuilt`, `ElevatorsTotal` and `SubdivisionName` were mapped from the building modal BEFORE the modal was collected — EMPTY on every save; the rental form likewise sent `TaxLot` and `YearBuilt` (mandatory), `TaxAbatementExpirationYear`, `BuildingPetsAllowedComments`, `NewDevelopmentYN`, `NewConstructionYN` empty | re-emitted after the modal loops in both collectors (`scratchpad` census: every early modal-sourced mapping enumerated mechanically) |
| The session identity (`saleUpdatingAgentMlsId`, `rentalUpdatingAgent`, the agent contact) lives in hidden inputs in the page header — OUTSIDE the `.flex-1` container the generic collector walks — so `ListAgentMlsId` (REBNY-mandatory) was EMPTY on every save from both forms; the enforcement gate blocks on it | both collectors read the identity inputs by id after the generic loop |
| The sale form never emitted `LivingAreaUnits` (REBNY AREA-UNITS-001 requires it with any `LivingArea`); under owner opt-out / participant-only it left the subordinate gates true (UCBA Art. I §6 cascade, DG-001) | `LivingAreaUnits` emitted (square feet); the cascade forces `InternetAutomatedValuationDisplayYN` / `InternetConsumerCommentYN` false under a false master flag |
| The DG-003 gate (`lib/compliance/rls-enforcement.ts`, "a sale with Permissions = null cannot switch the master display flag off") read only the provider-named `Permission` / `Permissions` keys — which the 2026-09-06 server mapping deletes after writing the Mallan decision to `_mallanPermission` — so every owner-opt-out / participant-only SALE was blocked | the gate reads `_mallanPermission` first (`lib/compliance/__tests__/rls-enforcement-mallan-permission.test.ts`, red → green) |
| On reload the sale loader restored the display / distribution boxes (`saleDist_IDX`, `saleInternetEntireListingDisplayYN`, `saleInternetAddressDisplayYN`, the syndication targets) from the derived columns and the live `SyndicateTo` members — the agent's own choice under opt-out came back flipped | the agent's own box (form key) wins; the derived facts restore legacy rows |
| The 16 `rls:validate` errors | `saleCurrentUse` values are the live members `MedicalDental` / `Investment` / `Office` (legacy `Healthcare` / `Professional` remapped on reload) and the radio emits `CurrentUse`; the fireplace radio binds `FireplaceYN` and emits the Boolean; REBNY FIREPLACE-001 then requires the count and the features, so the form gained `saleFireplacesTotal` and `saleFireplaceFeatures` (live members); `saleSyndicateYN` → `_mallanSyndicationIntent`. `npm run rls:validate`: **0 errors** |

### The tools viewers (`SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`)

| Found (all pre-existing in HEAD) | Fix |
|---|---|
| A literal `</script>` inside a JS string (the e-mail template) ended the `<script>` element in every browser — nothing after it ran; an unterminated string `'/crm/login.html;` made the whole viewer script fail to parse. Each page had BOTH. The viewers have not executed since those lines were written | `<\/script>`; the quote closed; every inline script now parses (`node --check`) |
| The boot called `loadXListingData(id)` on DOMContentLoaded before the API answered; the loader's fail-closed path replaced the whole page with "Listing Not Available" — every open was blank | the loader runs when the listing arrives (the API `.then`), the header updates then, and the page fails closed only when the fetch fails |
| Two copies of the API → viewer projection per page (a private re-mapping) | one `viewerListingFromApi(apiData, id)` per page (`_raw` keeps the canonical listing); both API blocks call it |
| 33 + 27 hydrate targets for ids that do not exist in the page (silent no-ops); the sale copy's first-showing control was `type="date"` bound to `OnMarketDate` | removed; the control matches the entry form (`datetime-local`, `ActivationDate`). 15 UI-container ids per page remain as targets (tabs / panels, not listing facts) |
| The viewers showed only the private projection's ~60 facts | after the projection, `_restoreFormKeys` + the group restore put every saved form key onto the 338 / 417 controls each viewer shares with its entry form |

## 3. Validators after the change

`npm run rls:validate` 0 errors / 53 advisories · `npm run validate:form-rls` exit 0 · `npm run compliance-check`
95 / 0 · `npm run ucba:audit` 46 / 0 / 0 regressions · `npm run idx:validate` 0 critical · `node scripts/ci/guardrails.mjs`
PASS · `npm run crm:test` 37 / 37 · `npx tsc --noEmit` 0 · the form suites (`sale-form-*`, `rental-form-*`, `crm-*`)
green after re-basing the five that pinned the corrected lines.

## 4. Still Maya's

- The entry forms carry controls the viewers do not (67 sale / 27 rental — buyer-agent, cancellation / close facts,
  auction, address atoms, `rentalFirstShowingDate`, `rentalPetsAllowedComments` …): the viewers are a private
  surface; adding those is a design decision, not a defect of the round trip.
- `data-rls-viewer="true"` on the two viewers is pinned by the held workflow.
- The real save of tomorrow's rental against production is the only step this proof cannot run (no production
  mutation): the in-memory handler run is the same code path.
