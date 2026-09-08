# Domain 5 — the listing forms: create-save and edit-save through one contract; a real round trip (2026-09-08)

Scope: the sale and rental design forms (`public/crm/SALE-FORM-REDESIGN.html`, `RENTAL-FORM-REDESIGN.html`), the
sale / rental tools viewers (`SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`) and the server routes they
save through (`POST /api/crm/listings`, `GET|PATCH /api/crm/listings/[id]`). The HTML is held (`public/crm/**`);
this domain changes the server side and records what the held side needs.

## 1. What was wrong (measured)

| # | Defect | Measurement | Fix |
|---|---|---|---|
| 1 | Edit-save (PATCH) never ran `normalizePayload` — no alias renaming (`description` → PublicRemarks, `Borough` → CityRegion, `UnParsedAddress` → UnparsedAddress …), no NAR-removed-field strip, no value normalization, no legacy permission fold — while create-save (POST) did. | matrix `patch-bypasses-contract` (CONFIRMED). | PATCH runs the same normalizer (the create-time InternetEntireListingDisplayYN default is not applied to a partial edit). |
| 2 | PATCH bucketed address / features through route-local key lists. Compared mechanically with the contract's `persistenceMap`: the address list matched exactly; the features list missed **45 contract keys** (Furnished, LeaseType, MinLeaseMonths, FurnishedListPrice, FlipTax*, TaxAbatement*, TaxMonthlyAmount, NumberOfShares, FireplaceYN, SponsorUnitYN, BuildingAreaTotal, LotSize*, GarageYN …) — an edit-save left them only in `raw_data` — and carried **4 keys the create path never bucketed** (ParkingFeatures, LaundryFeatures, BuildingFeatures, RealEstateTax). | `scripts` diff of the two lists against `MALLAN_FORM_CONTRACT.persistenceMap`. | PATCH routes both buckets through `buildPersistenceRecord(normalized)`; the four keys are declared in the contract (three live multi-selects; RealEstateTax as the Mallan carrying-cost fact the viewer reads). |
| 3 | No test performed an actual create → reload → edit → reload of values; the "round-trip" tests were regex assertions over source. | matrix `no-round-trip-test`. | `tests/runtime/crm-listing-round-trip.test.ts` drives POST → GET → PATCH → GET against an in-memory store and asserts the same payload persists into the same buckets by either entry point, every value reloads under its stored name, and no alias key is ever stored. |

Tests: `tests/runtime/crm-patch-contract-parity.test.ts` (behavioural PATCH: aliases, the 45 keys, NAR strip, no
default on partial edit; contract buckets the 4 keys), `crm-listing-round-trip.test.ts`, the retention pins rewritten
to the contract mechanism (`sale-form-save-load-retention.test.ts`).

## 2. Held (public/crm/**) — what the forms and viewers need, recorded, not changed

- `npm run rls:validate` — **20 errors**, all form bindings: `LivingAreaSource`, `BusinessType`, `SyndicateTo`,
  `AvailableLeaseType` are bound to fields with **no RLS-listed member** on this feed (dead bindings → bind as
  `data-mallan-field` and declare in `lib/listings/mallan-form-contract.ts`, or drop); `CurrentUse` offers
  "Healthcare" / "Professional", which are not live members; the sale fireplace yes/no radio is bound to the
  multi-select `InteriorFeatures` instead of the Boolean `FireplaceYN`. Each error names the control and the fix.
- The tools viewers hydrate element ids that do not exist in their own HTML (sale 45 of 211 targets, rental 38 of
  245 — e.g. `saleAddress`, `saleUnit`, `saleCity`, `saleNeighborhood`, `saleSqFt`): silent no-ops.
- `rebnyAgents = { mallan: [] }` in both design forms and both viewers is never loaded from any API, so the
  co-list / buyer / tenant agent dropdowns can never offer a choice.
- Manage Listings posts status `Closed` — now accepted server-side and resolved to Sold / Rented by transaction
  type (Domain 1); the CRM still labels it in its own words.
- `compliance-gates-and-output.js` "ALLOWED" lists and `rental-field-rules` carry status words that are not the
  Mallan vocabulary.

## 3. Checks

tsc 0 (clean run without the incremental cache); 47 suites / 883 tests on the PATCH-pinning, compliance, CRM and
listings projects; full-run tally in the commit message; matrix regenerated.
