# Domain 6 — the Rental workflow's own criteria, from what the feed delivers (2026-09-08)

Scope: rental search criteria (furnishing, pets, availability, deposit, fees) across the Search engine (CRM sale /
rental search, quick and expanded, saved searches and alerts) and the public paths. Sale and Rental never conflated.

## 1. Provider facts (live, Active rentals = 939)

| Field | Populated on Active rentals | Live vocabulary | Filter accepted live |
|---|---|---|---|
| `Furnished` (enum, 5 members) | 938 | observed Furnished 52 · Partially · Negotiable 11 · Unfurnished; `FurnishedOrUnfurnished` declared, 0 | `Furnished eq 'Furnished'` → 52 |
| `PetsAllowed` (Multi, 31 members) | 939 | unit-level Yes 620 · CatsOk 98 · DogsOk 81 · SizeLimit 41 · NumberLimit 20 · BreedRestrictions 18; building-level BuildingYes 752 · BuildingCatsOk 40 · BuildingDogsOk 34 · BuildingSizeLimit 20 · BuildingNumberLimit 2 · BuildingBreedRestrictions 4; negatives No 267 · BuildingNo 135 | `PetsAllowed has 'CatsOk'` → 98 |
| `AvailabilityDate` | 939 | — | `AvailabilityDate le 2026-09-30` → 874 |
| `SecurityDeposit` | 289 | — | `SecurityDeposit le 5000` → 186 |
| `MoveInCosts` / `OngoingFees` / `TenantPays` / `OwnerPays` (FARE) | 68 / — / 46 / 16 | observed members listed in the vocabulary census | (facts for display; not criteria) |
| `LeaseTerm`, `ListingTerms`, `LeaseAmount*`, `AvailableLeaseType`, `ExistingLeaseType` | **0** | declared, never delivered | — not criteria |

## 2. What was wrong (matrix register) and what changed

| Id | Defect | Fix |
|---|---|---|
| `engine-no-rental-criteria` | The engine refused every rental criterion (`furnished`, pets …) as an unsupported parameter, so the CRM rental search — which sends `furnished` — could not narrow at all. | Rental-only criteria in the engine, contract-typed from the live vocabulary: `furnished` (`true` or live members; `Furnished eq`, OR-joined), `pets` (`friendly` = the six unit-level positive members, or live members; `PetsAllowed has`, OR-joined), `availableBy` (YYYY-MM-DD; `AvailabilityDate le`), `maxDeposit` (`SecurityDeposit le`). A sale search carrying any of them is **refused by name**, never silently ignored. Published on the search contract (`members.Furnished`, `members.PetsAllowed`, `petsFriendlyMembers`, `rentalOnlyParams`) so the CRM shell carries no hand-maintained copy. Saved searches and alerts inherit the parameters (the saved-key set derives from the executed set). |
| `furnished-ungated` | The public DB and Trestle paths applied `furnished=true` to a sale search. | Both gate it on `type=rent`. |
| `sale-negative-membership` | The public Trestle path built the sale universe as `PropertyType ne 'ResidentialLease'` while the engine and the registry use `eq 'Residential'`. | Positive membership everywhere (the feed carries exactly Residential 215,520 and ResidentialLease 376,079 today, so the two agree; the positive form cannot widen if a type is added). |
| `no-fee-phantom` | `AMENITY_FIELD_MAP['no-fee']` targeted `ListingTerms` members that are not published, on a field with 0 rows — the filter could only ever return nothing. | Retired. Under the FARE Act (NYC LL 119/2024) a rental whose landlord does not pay the broker is `InternetEntireListingDisplayYN = false` and never reaches IDX display, so every rental shown is landlord-paid; "no fee" adds no criterion (the natural-language parser recognises the phrase and adds none). |
| pet-friendly phantom member | `AMENITY_FIELD_MAP['pet-friendly']` named `UnitYes`, which is not a live member (the live token is `Yes`). | The six live unit-level members — the same set as the engine's shorthand. |

Vocabulary chain: `data/cotality-enums.live.json` → `canonical/live-truth.ts` (`FURNISHED_MEMBERS`, `PETS_ALLOWED_MEMBERS`,
`PETS_FRIENDLY_MEMBERS` — policy subset) → `engine/criteria.ts` → `engine/contract.ts`, bound by set equality in
`lib/search/__tests__/rental-vocabulary-authority.test.ts`. Behaviour: `engine-rental-criteria.test.ts`; public paths:
`public-listing-trestle.test.ts`, `public-listing-db.test.ts` (pins rewritten).

## 3. Decision for Maya

`pets=friendly` means **the unit accepts a pet** (Yes / CatsOk / DogsOk / NumberLimit / SizeLimit / BreedRestrictions).
Building-level members (BuildingYes …) describe the building's rule and are not implied. Say if the brokerage reads
"pet friendly" differently; the set is one declared constant.

## 4. Held

The CRM search shell (`public/crm/js/search/search-engine.js`) still sends only `furnished`; the pets / availability /
deposit criteria are executable on the contract but have no control in the held UI yet.
