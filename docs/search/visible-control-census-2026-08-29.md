# Visible Search control census — 2026-08-29

Independent census of every visible Sale / Rental / Building control in the
authenticated CRM Search UI, reconciled against the canonical criteria
vocabulary. Run because workflow applicability had been **moved** from the matrix
ledger onto the registry without its values ever being **verified** — the source
of truth changed, the correctness of the data did not.

Scope: `public/crm/html/search-form-and-results.html` (source partial, inlined
into the generated `public/crm/index-built.html` by `npm run crm:build`), plus
`public/crm/js/search/**` and `public/crm/js/init/**`.

`public/crm/**` is on HOLD and **nothing in it was modified**. Everything below
is report-only except the four registry applicability corrections in §3.

---

## 1. VERIFIED DEFECT — the Rental and Building basic layouts never render

**Status: confirmed by direct source reading, not taken from the census agent.**

Four criteria containers exist in the Basic form:

| container | line | inline style |
|---|---|---|
| `#searchBasicMode` (Sale layout) | `search-form-and-results.html:91` | none |
| `#searchBasicModeRental` | `:970` | `display: none` |
| `#searchBasicModeBuilding` | `:1808` | `display: none` |
| `#searchAdvancedMode` | `:2224` | `display: none` |

`toggleSearchTab()` (`search-engine.js:2974`) sets `.style.display` on **exactly
two** elements — `searchBasicMode` and `searchAdvancedMode`
(`search-engine.js:2982-2983`, applied at `:2998-3004`). Nothing anywhere in
`public/crm/js/**` sets display on the rental or building containers: the only
references are `init-ui.js:36-37` (converts their `<select>`s to custom
dropdowns), and `saved-searches.js:420,435` (reads values out of the rental
form).

Two comments assert a mechanism that does not exist —
`search-engine.js:1341` and `:2981` say *"data-show-on handles visibility"*. The
string `data-show-on` appears in this repository **only inside those two comments
and their built copies**. It is never an attribute on any element.

Theme CSS (`liquid-theme.css:167-168`) styles the containers but sets no
`display`; inline style would win regardless.

**Consequence.** In Basic mode every tab renders the SALE layout. The Rental and
Building layouts are present in the DOM and permanently hidden.

**This is not merely cosmetic**, because the collector reads the hidden inputs:

```
search-engine.js:1361-1365   currentSearchTab === 'rent'
                             → priceMin = #rentalMinRent, priceMax = #rentalMaxRent
search-engine.js:1405-1407   currentSearchTab === 'rent'
                             → bedsMin = #rentalMinBeds, bedsMax = #rentalMaxBeds
```

On the Rentals tab in Basic mode a broker types a price and a bedroom count into
the **visible Sale controls**; those are not read. The values sent are whatever
the **permanently hidden** rental inputs hold — their defaults. The search
returns a confident result set for criteria the broker never entered, and the
page gives no indication.

Not fixed here: `public/crm/**` requires explicit authorization.

## 2. Second visibility qualifier — deliberately disabled controls

`init-disable-dead-controls.js` disables a large set of rendered controls at load
with `title="Not currently supported"` (`DEAD_SELECTORS:36-133`,
`DEAD_CONTAINERS:165-190`), covering `Furnished`, `OwnerPays`, `Concessions`,
`BuildingRules`, `RentingAllowedYN`, `MaximumFinancingPercent`,
`ListOfficeMlsId`, `RLSParticipantOnly`, `InternetEntireListingDisplayYN`, all
`data-sub-status` controls, and all comparison-prefixed values
(`lte:` / `gte:` / `gt:` / `eq:`).

The transit panels and Manhattan-grid columns are neutralised at container level,
and `js/search/manhattan-grid.js` / `js/search/transit-search.js` are **not in
the script list** of `index.html` and absent from `index-built.html` — those
controls have no engine bundled at all.

A disabled control is an honest refusal and is materially different from §1,
where a control is enabled, visible, and ignored.

## 3. APPLIED — four applicability errors, independently verified

The census flagged these; each was then confirmed by counting the controls inside
each container directly rather than trusting the agent's labels:

| container | `CommonInterest` | mgmt co. | units | floors |
|---|---|---|---|---|
| sale | 3 | 1 | 1 | 3 |
| rental | 4 | 1 | 1 | 3 |
| building | 4 | 1 | 1 | 3 |
| advanced | 5 | 1 | 3 | 2 |

Corrected in `field-registry.ts`:

| criterion | was | now |
|---|---|---|
| `ownership` | `['sale']` | `['sale','rental','building']` |
| `management_company` | `['building']` | `['sale','rental','building']` |
| `units_total` | `['building']` | `['sale','rental','building']` |
| `stories_total` | `['building']` | `['sale','rental','building']` |

Contract sizes: sale 34→37, rental 27→31, building 11→12, comparable 11
(unchanged — the Comparables surface `#comparablesSection` was **not** in this
census's scope and must not be inferred from it).

## 4. NOT APPLIED — the remaining reconciliation gaps

The census returned **267** gap rows (197 `NO_CANONICAL_IDENTITY`, 70
`MISSING_FROM_WORKFLOW`). They are recorded as **hypotheses, not findings.**

The workflow labels are demonstrably unreliable: rows tagged `[rental]` reference
`saleBuildingMinUnits`, `saleSoldDate` and `saleManagementCompany`, because all
three surfaces live in one shared file and each agent reported everything it
read. Acting on the labels without per-row verification would repeat the exact
defect this census exists to correct.

Themes worth verifying next, each requiring its own proof:

- **Status sub-states** — Back On Market, Offer/Contract/Sold groups, Future,
  Application In / Lease Out / Rented. Currently disabled; whether they are
  sub-states of `market_status` or distinct criteria is unresolved.
- **Rental commercial terms** — Concessions, LeaseType (Rent Stabilized /
  Market Rate), Guarantors Accepted, OwnerPays. CURRENT.md names fees and
  availability for Rental Search; none has a canonical identity today.
- **Building-level vs unit-level amenity questions** — `BuildingLaundryFeatures`,
  `BuildingPoolFeatures`, `BuildingSecurityFeatures`, `BuildingSmokeFreeYN`,
  "Building Allows / Does Not Allow" pairs. The building-vs-unit distinction is
  the same trap already documented for `PetsAllowed`.
- **Transit and Manhattan grid** — no engine bundled; likely boundary refusals
  rather than criteria.
- **CRM-local fields** — `CrossListing`, `Conversion`, `data-field=CRM`,
  `ListOfficeMlsId=OwnOffice`: Mallan-local facts, not Cotality criteria.
- **RLS display gates** — `InternetEntireListingDisplayYN`,
  `RLSParticipantOnly`: display-gate facts surfaced as filters; almost certainly
  `non_search_fact`, but that is a compliance-adjacent call.

## 5. Method note

Two extraction defects were found and corrected while producing this census, both
the same shape — a pattern too narrow returns a smaller, plausible answer instead
of an error:

- `registryKnows()` in `checkbox-criterion-closure-census.test.ts` matched legacy
  keys with `[A-Za-z]+`, which cannot match an underscore, so
  `['pet_policy','pets']` was invisible and a key the registry knows was reported
  UNDECIDED. Widened to `[A-Za-z_]+`.
- A first read of the checkbox families with a flat regex reported 37 families by
  counting nested VALUES as families. Re-parsed by bracket depth: 18.
