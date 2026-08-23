# Backend-Search-1 — Systematic Field / Attribution / UI / Logic Analysis

**Status:** ANALYSIS ONLY. No code, no schema change, no PR. Awaiting Maya review before any Backend-Search-1 contract work begins.
**Date:** 2026-07-09
**Scope basis:** current `main` (`d0705877`, worktree `mallan-search0-wt`) + the stranded `feat/search-canonical-contract` branch (reference only) + six read-only auditor sweeps + one strategic/competitive research pass.
**Author:** Claude, synthesizing six parallel read-only agents (surfaces · field matrix · attribution/reports · UI+params · status/saved-search · strategic gaps) + a first-party stranded-branch review.

---

## 0. Ground rules this document holds to

These are Maya's standing constraints for this lane. Every section below obeys them; call out any place a reader thinks they are violated.

1. **Cotality API is the field source of truth — always live, never a copy (AGENTS.md §7, Maya law).** Field names, enums, and populations come from the live `api.cotality.com/trestle` (`$metadata`/`$count`). The current generated authority is **`data/cotality-enums.live.json`** (regenerated live via `npm run cotality:pull`, guarded by `npm run cotality:verify`). The legacy `data/rebny-rls-property-fields.csv` and `artifacts/metadata.xml` are historical snapshots, **not** authority.
2. **No Cotality language in field-contract sections.** Cotality is the standards body; Cotality is the provider. The two are not interchangeable here.
3. **No REBNY / RLS / IDX / VOW field names introduced into field-contract sections.** Those terms appear ONLY in the compliance/syndication sub-sections where they are the actual governing rule.
4. **ACRIS is the only public-record closed-sale-history source.** Public closed sale = ACRIS, never a raw Cotality `ClosePrice`.
5. **Preserve agent/private intelligence power.** This is an agent-intelligence backend, not a public-cleanup pass. The full lifecycle and full dataset are retained for agent/internal/report audiences.
6. **Do not collapse sold and rented.** `closed_sold ≠ closed_rented`, always, everywhere.
7. **Do not suppress private agent lifecycle statuses.** Withdrawn / expired / canceled / temp-off-market remain first-class for agent audiences.

### Proof-first / classification discipline (CLAUDE.md §F, §J)

Every claim below is tagged:

- **[E]** — evidence from direct source read (Class A, code-path truth). Strong, actionable.
- **[I]** — inference about runtime behavior from the code (Class A, but a behavior claim — would ideally be confirmed with a runtime probe).
- **[needs probe]** — a **Class B** live-Cotality field-truth claim (does the field exist / is it populated / is it filterable). These are **hypotheses to verify against a live `$metadata`/`$count`/`trestle:probe`**, NOT conclusions. No live Cotality query was run in this analysis.
- **[Class-C]** — a REBNY / UCBA / FARE / DOS / Fair-Housing **policy** confirmation needed via `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before building.

**Prior probe context (2026-07-06) — historical only, not authority.** Per AGENTS.md §7 (Cotality is the sole authority — always live, never a copy, never a spot-check), Backend-Search-1 **must re-verify live before locking any enum / filterability / sortability / status / field assumption** — via `npm run cotality:pull && npm run cotality:verify` (authority = `data/cotality-enums.live.json`) or live `$metadata`/`$count` probes; do not rely on copied enum/filterability sets. For context, that earlier pass observed: `StandardStatus` 11 members with the live feed carrying **`Pending`, not `ActiveUnderContract`** (AUC live count = 0); sale = `Residential`, rental = `ResidentialLease` (no space); co-op = `StockCooperative` (no `Cooperative` member), condo = `Condominium`, `Condop` distinct; `MlsStatus` **not** `$filter`-able (HTTP 400, provider-suppressed); `Permission` has no `OwnerOptOut` member. Re-confirm each live.

**`[E]` staleness caveat (2026-07-09).** The `[E]` source-inventory and field-matrix findings in this document were captured by a read-only analysis pass against the tree as of 2026-07-09; code moves. Treat every `[E]` finding as **as-of that pass** and **re-verify it against current HEAD** (grep the cited file/lines) before acting on it in Backend-Search-1 — do not chase an `[E]` claim without confirming it still holds. Examples already corrected after re-verification: similar-listings **does** switch on `type=rent` (rentals get similars); the Open House filter **is** read (applied post-pagination, §4 D1).

---

## 1. Search surfaces inventory

Twelve+ distinct surfaces answer "search" questions, split across **three engines** with different filter vocabularies, null-semantics, and display gates.

### Engine map

| Engine | Where | Backing store | Powers |
|---|---|---|---|
| **A — Live Cotality (OData)** | `lib/search/crm-idx-filter.ts` (`buildCrmIdxODataFilter`), `lib/search/public-listing-trestle.ts` (`buildPublicListingTrestleFilter`) | `api.cotality.com/trestle` live | CRM/agent search, public Trestle fallback |
| **B — Postgres projection** | `lib/search/criteria-to-prisma.ts` (`criteriaToProjectionWhere`) over `listing_search_projection` | Neon (cold-waterfall) | saved-search execute + alert cron |
| **DB-first public** | `lib/search/public-listing-db.ts` (`buildPublicListingDbSearch`) over `listings` | Neon | primary public `/api/listings` path |

### Surface inventory [E]

| # | Surface | Route / entry | Engine | Audience | Notes |
|---|---|---|---|---|---|
| A1 | Public listings | `/api/listings` → `useListings` → `app/search/page.tsx` | DB-first → Cotality fallback → exclusives | public | default sort `list_price desc` |
| A2 | `useListings` hook | `lib/hooks/useListings.ts` | (client of A1) | public | remaps params (`baths`→`minBaths`, `zip`→`zipCodes`, joins neighborhoods) |
| A3 | Autocomplete / suggest | `/api/listings/suggest` | Cotality | public | address/neighborhood/building suggestions |
| A4 | Similar listings | `/api/listings/similar` | DB-first + Cotality | public | **switches on `type=rent`** (`isRental → listing_type:'rent'`; Trestle fallback `PropertyType eq 'ResidentialLease'`) — rentals **do** get similars (`app/api/listings/similar/route.ts:71-72`, re-verified at HEAD) [E] |
| A5 | Building listings | `/api/listings/building` | DB + shared ACRIS lib | public | closed sale history ACRIS-only via `.filter(s => s.source === 'acris')` |
| A6 | Buildings | `/api/buildings` | ACRIS + `resolveVisibility` public | public | Backend-Search-0 output; ACRIS-only public sale history, no dedup-vs-MLS |
| A7 | Market stats | `/api/market` | Cotality | public | borough via `CityRegion` (diverges from A-others using `CountyOrParish`) |
| A8 | Listing detail | `/api/listings/[id]`, `app/listing/[...slug]/page.tsx` | DB / Cotality | public | Last-Sale prefers ACRIS via `resolveVisibility` (Backend-Search-0) |
| A9 | Agent listings | agent-scoped listing views | Cotality | agent | |
| A10 | Search alerts (public create) | `/api/search-alerts` | writes projection criteria | public | **no `canEnableAlertForCriteria` gate at create** [E] — see §7 D7-2 |
| B1 | CRM IDX search | `/api/idx/search` (`buildCrmIdxODataFilter`) | Cotality | agent | all 6 display gates; richest filter vocabulary |
| B4 | Comps | `lib/comps/fetch-comps.ts` + CMA engine | Cotality / DB | agent | see §8 — two paths, one broken |
| B5/B6 | Saved-search execute | projection engine | Cotality → projection | agent/client | Engine B |
| B7 | Alert cron | `app/api/cron/search-alerts/route.ts` | projection engine | system→client | skips criteria the projection can't express |
| C1 | Portal comparables | portal/comparables | weaker closed-data mechanism | client | not routed through `resolveVisibility` |

### The twelve structural inconsistencies [E]

1. **Two engines answer the same saved search** (Cotality live vs Postgres projection) with different vocabularies → same saved search yields different results depending on path.
2. **Three display-gate implementations** (mapper write-gate, DB read filter, projection column filter) that can disagree.
3. **Opposite null-semantics on `internet_address_display_yn`** between write (fail-open `!== false`) and some read paths.
4. **Default sort disagrees** across surfaces (`list_price desc` public DB, `ModificationTimestamp desc` CRM initial, `list_price desc` public fallback).
5. **Transaction type expressed three ways** (`type`, `commercial=true`, `PropertyType` string).
6. **"Mallan exclusive" expressed ≥3 ways** (`exclusive=mallan` flag, `sort=exclusives` → `agent_id != null` weak signal, exclusives table short-circuit).
7. **Neighborhood → 3 different fields** (`postal_code` ZIP expansion, `SubdivisionName`, name `in`), and borough scrambled across `borough`/`CountyOrParish`/`CityRegion`.
8. **Bathrooms computed 4 ways** (`BathroomsFull`, `BathroomsTotalInteger`, `bathrooms_full`+half, DTO variants).
9. **Pagination/count differs** — DB path count ignores post-pagination filters (inflated); Cotality path count reflects post-filtered page.
10. **Closed-data policy inconsistent** — building routes use `resolveVisibility`; portal comparables (C1) use a weaker mechanism.
11. **Per-route rate limiters** — each route re-implements its own limiter.
12. **Projection is a partial reader** — `PROJECTION_SUPPORTED_CRITERIA_KEYS` is a strict subset; unsupported criteria silently vanish from alerts.

**Contract implication:** the canonical contract must name **one criteria vocabulary** and one visibility resolver that all three engines translate from, so a saved search means the same thing regardless of engine.

---

## 2. Canonical field matrix

~70 fields across 10 categories. Columns per field (condensed here; full grid retained in the auditor output): **Cotality field · public DTO path · DB column · projection column · CRM filter param · UI control · sortable? · filterable? · alert-capable? · attribution/compliance role · known bug**.

Because Cotality/REBNY/IDX field names are barred from this section, fields below are named by their **Cotality API** identifier.

### A. Identity / source / attribution
`ListingKey` · `ListingId` · `ListAgentFullName` · `ListOfficeName` · `ListAgentMlsId` · `SourceSystemName` · (Mallan-exclusive flag, internal). **Bug B-12:** public `mlsId` DTO is set to the internal `listing_id`, **not** the Cotality `ListingKey`/`ListingId` (`db-to-public-dto:361`) [E]. **Gap:** no typed `source` column — provenance is inferred, not stored (§3, §9).

### B. Location
`UnparsedAddress` · `StreetNumber` · `StreetName` · `UnitNumber` · `PostalCode` · `City` · `CountyOrParish` · `CityRegion` · `SubdivisionName` · `Latitude` · `Longitude` · `BuildingName`. **Bug B-3:** borough resolves 3 ways. **Bug B-4:** neighborhood resolves by ZIP on some paths, `SubdivisionName` on others. **Bug B-16:** SplitCard hardcodes `'Manhattan'` fallback. `Latitude`/`Longitude` mostly null on feed; geocoder backfills [needs probe: lat/lng population + reliability].

### C. Classification / ownership / status
`PropertyType` (`Residential`/`ResidentialLease`) · `PropertySubType` · `CommonInterest` (`Condominium`/`StockCooperative`/`Condop`/`RentalBuilding`/`None`) · `StandardStatus` · `MlsStatus` (read-only). **Bug B-11:** ownership unmapped in CRM (public maps Co-op→`StockCooperative`, CRM leaves raw). Structural sub-types (Townhouse/Loft/Multi-Family) **cannot** be pushed to Cotality `$filter` (provider 502) → post-filtered [needs probe: `PropertySubType` filterability].

### D. Pricing
`ListPrice` · `ClosePrice` (agent/ACRIS-gated) · `OriginalListPrice` · price-change history (**not retained** — §strategic gap 2). **Product gap B-15a:** no **price-per-sqft** field computed or stored anywhere.

### E. Dates / DOM
`ListingContractDate` · `ModificationTimestamp` · `CloseDate` · `OnMarketDate` · `DaysOnMarket`/`days_on_market` · `first_active_date` (schema:554, **unwired**). **Bug B-10:** DOM columns + DTO exist but are **never rendered**, not filterable, not sortable. `first_seen_at` (our ingest time) **does not exist** (§strategic gap 2).

### F. Rooms / size
`BedroomsTotal` · `BathroomsFull` · `BathroomsHalf` · `BathroomsTotalInteger` · `RoomsTotal` · `LivingArea`. **Bug B-1:** `roomsTotal` **always undefined** — DTO reads `features.Rooms`, mapper stores `RoomsTotal`. **Bug B-2:** baths filter uses **different Cotality fields per engine** (`BathroomsFull` vs `BathroomsTotalInteger`).

### G. Financial / carrying cost
`AssociationFee` (maintenance/common charge) · `TaxAnnualAmount` · assessments. **Product gap B-15b/c:** **no total monthly carrying-cost field** and **no assessment field** are modeled — even though the inputs exist. Not filterable, not sortable, not on cards anywhere (§strategic gap 6).

### H. Media
`Media` collection (keyed by **`ResourceRecordKey`, not `ResourceRecordID`** [needs probe]) · `PhotosCount` · `VirtualTourURLBranded`/`Unbranded` · floorplan presence. No media-completeness score (§strategic gap, media intelligence).

### I. Amenities
**Critical Cotality truth [E, repeated from in-repo comments — needs probe to confirm live]:** there are **no `ElevatorYN`/`DoormanYN`/`GymYN` boolean fields on the feed.** Amenities are substring matches on multi-value picklists (`BuildingFeatures`/`InteriorFeatures`); doorman ≈ `Concierge`. `NewDevelopmentYN` also absent — detected via `PublicRemarks`. **None of the ~30 amenity checkboxes are alert-capable**, and on the Cotality fallback path all amenities except `pet-friendly` **silently no-op** because those feature fields aren't in the `$select` (§4 D2).

### J. Rental / FARE / exclusive / restricted
`Furnished` · lease term · FARE Act fee fields (`MoveInCosts`/`OngoingFees`/`TenantPays` — **[Class-C]**, and note phantom `MoveInCostsAmountTotal` does NOT exist on Property) · Mallan-exclusive flags · `Permission` (`Private` = participant-only; **no `OwnerOptOut` member**). **Bug B-13:** projection gate-column name divergence (`participant_only` vs `participant_only_yn`; `owner_opt_out` not mirrored) — latent fail-open if a future reader forgets the relation clause. **Bug B-14:** schema↔DB drift (`agent_info` dropped from Prisma but column persists). **Product gap:** no rental-economics fields (net effective rent, concessions) — §8, §strategic gap 5.

### Consolidated §2 bug register (16)

| # | Bug | Severity | Class |
|---|---|---|---|
| B-1 | `roomsTotal` always undefined (field-name mismatch) | HIGH | A [E] |
| B-2 | Baths diverge by engine (`BathroomsFull` vs `BathroomsTotalInteger`) | HIGH | A [E] |
| B-3 | Borough resolves 3 ways | MED | A [E] |
| B-4 | Neighborhood resolves ZIP vs `SubdivisionName` | MED | A [E] |
| B-5 | `keyword` vs `keywords` param mismatch | MED | A [E] |
| B-6 | Open House filter **is** read (route queries `/odata/OpenHouse`, `app/api/listings/route.ts:456-480`) but applied **post-pagination** (see §4 D1) — not a dead control; the real issue is count/pagination semantics | MED | A [E, corrected at HEAD] |
| B-7 | Transit filter unwired | MED | A [E] |
| B-8 | Sort has no panel control (URL-only options) | MED | A [E] |
| B-9 | Alert silently narrows (amenities/keywords/furnished/yearBuilt/ownership/openHouse/transit/address dropped) | HIGH | A [E] |
| B-10 | DOM never rendered / not filterable / not sortable | MED | A [E] |
| B-11 | Ownership unmapped in CRM | MED | A [E] |
| B-12 | Public `mlsId` = internal id, not Cotality key | HIGH | A [E] |
| B-13 | Projection gate-column name divergence (fail-open latent) | HIGH | A [E] |
| B-14 | Schema↔DB drift (`agent_info`) | LOW | A [E] |
| B-15 | No price/sqft, no assessments, no total carrying cost (3 product gaps) | HIGH | product |
| B-16 | SplitCard hardcodes `'Manhattan'` | LOW | A [E] |

---

## 3. Attribution analysis

**What exists [E]:** attribution columns `list_agent_full_name`, `list_office_name`. Cards render "RLS · Listing Courtesy of {office}" for Cotality-sourced rows, or the Mallan-exclusive treatment for exclusives. `resolveVisibility` (Backend-Search-0) already returns `requiresAttribution: true` for `source === 'mls'` and `false` for ACRIS public-record — the contract *knows* the rule; the surfaces don't all honor it.

**Where attribution is MISSING [E]:**

- **Client alert / send emails** — `listOfficeName` is never plumbed from `app/api/cron/search-alerts/route.ts:139-145` into the outbound email. Listings sent to clients arrive **without courtesy attribution** — a §175.25 / RLS attribution exposure **[Class-C]**.
- **Portal comparables** (C1) — no attribution, not routed through `resolveVisibility`.
- **CMA comps** — comps carry no source/office label into the report artifact.

**Structural gap:** there is **no typed `source` column**. Provenance (`acris` | `mls` | `mallan_exclusive` | `internal`) is inferred per-surface rather than stored, which is exactly why attribution leaks vary by surface. The contract should make `source` a stored, first-class field and make `requiresAttribution`/`requiresSourceLabel` a rendering obligation that every audience-facing surface asserts (mirrors §9 stranded `display-gate.ts` intent).

---

## 4. UI control → backend mapping + query-param analysis

Full control-by-control table retained in auditor output. The mapping legend: **DB** = honored in `public-listing-db.ts` Prisma where · **Trestle** = honored in `public-listing-trestle.ts` OData · **Proj/Alert** = honored in projection · **PostFilt** = JS post-filter after pagination.

### Honored everywhere [E]
Price min/max, beds min/max, sqft min/max, status (allow-list {Active, ComingSoon, ActiveUnderContract}, fail-closed), neighborhood (with the ZIP-vs-name divergence noted), borough, commercial tab, `exclusive=mallan`.

### Honored only page-locally (post-pagination) — **D1 [HIGH]**
`ownershipTypes`, `yearBuilt`, `furnished`, `amenities`, `keywords` (via `applyPublicListingPostFilters`, invoked *after* `skip/take`), plus `openHouse`. Consequences: (a) `total`/count = `dbTotal` **ignores these filters → inflated count** (the UI even acknowledges this); (b) pages arrive ragged (a "50" page may render 12); (c) later-page matches reachable only by repeated Load-More. **Fix:** push into the Prisma where, or filter the full set before pagination.

### Silently dropped / dead controls [E]

| Control | Param | Defect | Sev |
|---|---|---|---|
| "Search by my current location" | `near=lat,lng` | **DEAD — never read** by hook, route, or any filter builder (D3) | MED |
| Amenities on Cotality fallback | `amenities` | **silent no-op except `pet-friendly`** (feature fields not in `$select`) (D2) | HIGH |
| CRM Building Financing % | `financingMin` | collected, never mapped to a param; `continue`-skipped in matcher — fully dead | MED |
| CRM Open House date range | `openHouseDateFrom/To` | stripped with a `console.warn`, no param emitted | MED |
| CRM transit / grid bounds | `_transitBounds`/`_gridBounds` | stripped; `gridFilter` is a dead consumer in `crm-idx-filter.ts:279` | MED |
| Multi-borough (2+) | `borough` | left unset → search **silently broadens to all NYC** | HIGH |
| Non-whitelisted `checkboxFilters` | e.g. `PoolFeatures`, `AvailableLeaseType` | dropped by OData AND never re-applied client-side (server results bypass `filterListings`) | MED |
| `sponsorUnit` | | post-fetch in-memory filter on the returned page only → totals wrong | MED |
| `bounds` (map viewport) | `bounds` | Trestle path only; DB-first primary path ignores it entirely | LOW |

### Param-name mismatches that silently drop criteria [E]
- `baths` (URL) vs `minBaths` (API) — remapped in `useListings` for search, but **NOT** for the public alert endpoint, which reads `minBaths` off a payload that carries `baths` → **baths dropped from public alerts** (D7).
- `keyword` (CRM) vs `keywords` (public) — B-5.
- `zip` remapped to `zipCodes`, then **redundantly re-applied as a client post-filter** (`page.tsx:489`).

**Contract implication:** one canonical criteria key-set with an explicit, versioned serializer; every UI control maps to exactly one canonical key; unmapped/unsupported keys must **fail loud** (warn the user their filter can't be honored) rather than silently vanish.

---

## 5. Sorting analysis

### Public sort [E]
UI offers 4: Price ↓ (default), Price ↑, Newest, Largest. Both engines apply a **single** server sort key (no secondary), then the **client re-sorts every render** — so the server order only decides which rows land on each 50-row page.

| Defect | Detail | Sev |
|---|---|---|
| **D4** | No secondary sort key on either engine → **unstable pagination** (rows sharing a `list_price` can duplicate/drop across `skip/take`). Projection engine does this right (`[{modified_at:desc},{id:asc}]`) | MED |
| **D5** | "Newest" server-sorts by `listing_contract_date`/`ListingContractDate`, but client re-sorts by `modificationTimestamp` → **visibly wrong order** + interleaving at Load-More boundaries | HIGH |
| **D6** | URL-only sorts (`beds-desc`, `neighborhood`, `new-development`) honored server-side but the client comparator has no case → collapses to `modificationTimestamp desc`. `sort=exclusives` also injects the **weak** `agent_id != null` exclusive signal | MED |

### CRM/agent sort [E]
Initial search sends **no** `sort` → Cotality defaults `ModificationTimestamp desc`; then the client sorts the loaded ≤200 rows.

| Defect | Detail | Sev |
|---|---|---|
| **D8** | Default view shows the **cheapest of the 200 most-recently-modified**, not the global cheapest (client sorts a modification-ordered page by price) | HIGH |
| **D9** | `address`/`beds`/`intSqft` sorts are **client-only over ≤200 rows** (never re-query) | MED |
| **D10** | `toggleSortOrder` (the only server re-sort path) **rebuilds params from scratch** with only type/price/minBeds/minBaths/single-neighborhood → clicking the sort arrow **silently broadens** the result set | MED |
| **D11** | "Listed Date" maps to `ModificationTimestamp` (wrong field) **and** the client sorts a US-formatted date **string** lexically ("1/2/2026" before "10/5/2025") → wrong both directions | MED |
| **D12** | Column-header sort on an unmapped field coerces `undefined→''` → all-equal no-op | LOW |

**Contract implication:** the contract must define a **canonical sort-key enum** with a **mandatory tiebreak** (`id asc`), a single authoritative sort location (server, not a client re-sort that diverges), and a rule that sort re-queries carry the **full** criteria set.

---

## 6. Status and lifecycle analysis

Guardrail: the merged Backend-Search-0 `visibility-contract.ts` is the current canonical lifecycle model. Backend-Search-1 extends it, but two live issues must be fixed here.

### The 8-bucket lifecycle (retained for agent/internal/report; restricted for public)
`active · pending · temp_off_market · withdrawn · canceled · expired · closed_sold · closed_rented`. Public sees only the active-family + ACRIS `closed_sold`; agent/internal/report see everything; sold ≠ rented always. This is correct and locked by `visibility-contract.test.ts` (26 assertions).

### D6-1 — unknown-status fail-open [COTALITYLVED — Backend-Search-0.1, PR #489 / squash `f1b26b28`]
**Historical context / lesson learned — this is now fixed on `main`.** `toLifecycleStatus` previously defaulted an unrecognized/blank Cotality StandardStatus to `'active'` — the one bucket the public branch of `resolveVisibility` allows — so an untrusted status *could* have been publicly displayed (latent only because public callers hardcoded `'closed_sold'`/ACRIS). **Current behavior:** unknown/unrecognized Cotality API `StandardStatus` → **`lifecycle_status: "unknown"` → public fail-closed** (agent / internal_report / client still see it, so private intelligence is not suppressed). Backend-Search-1 **builds on this fixed behavior** — there is nothing to "flip." The lesson to carry forward: fail-closed safety must live in the contract's default, not in caller discipline.

### Other status findings [E]
- **D6-2** — two independently-declared TERMINAL sets (`lib/compliance/status.ts:138` vs `lib/idx/trestle-mapper.ts:618`) that can drift. Contract should name **one**.
- **D6-3** — comps collapse `Leased`/`Rented` into `Closed` (loses the sold/rented distinction the contract elsewhere enforces).
- **D6-4** — Pending vs ActiveUnderContract: **resolved** by the PR-1 live pass — the feed carries `Pending` (in-contract), AUC live count 0. `toLifecycleStatus` correctly maps AUC→`active` (public-displayable), Pending→`pending` (public-blocked). Matches `lib/compliance/status.ts`.

### Coming-Soon / pre-public nuance [Class-C]
Coming-Soon is display-permitted **with a required badge**, max 14 days, **no DOM accrual**, no showings before `ActivationDate`. Participant-Only = `Permission = 'Private'` (confirmed present in `data/cotality-enums.live.json`). **Owner-Opt-Out: the live signal is UNRESOLVED — Backend-Search-1 must FAIL CLOSED on owner-opt-out until a live Cotality field/value is verified** `[needs probe][Class-C]`. Do **not** derive it from a permission enum: `data/cotality-enums.live.json` shows **no** owner-opt-out member in either `Permission` or `ListingPermission`, so `Permission='OwnerOptOut'` must never be assumed. The flat 8-bucket enum does **not** yet encode DOM-accrual or audience-scope rules — see §strategic gap 15 and the UCBA "Off-Market" label prohibition.

---

## 7. Saved-search / update-search analysis

### Findings [E]

| # | Finding | Sev |
|---|---|---|
| **D7-1** | **No `criteria_version` anywhere.** Saved criteria are an unversioned blob → any vocabulary change silently reinterprets old saved searches | HIGH |
| **D7-2** | Public `/api/search-alerts` creates `alert_enabled=true` **without** `canEnableAlertForCriteria` — an alert can be created for criteria the cron can't execute, so it silently never fires | HIGH |
| **D7** | Public Save-Search serializes only `{minPrice,maxPrice,beds,baths,neighborhood}`; then the endpoint reads `minBaths` off a `baths` payload → **baths also dropped**. Net saved criteria = type+price+beds+neighborhood | HIGH |
| **D7-3** | `SaveSearchButton` drops baths/status/maxSqft even from what it does send | MED |
| **D7-5** | `client_preferences` table is an orphan dead-end (no reader) | MED |
| **D7-6** | Alert/projection engine can't express amenity/keyword/address/DOM/furnished/yearBuilt/ownership/openHouse — `PROJECTION_SUPPORTED_CRITERIA_KEYS` is a strict subset; the cron fail-closed skips unsupported rows (correct, but those filters can **never** drive an alert) | HIGH |

### Five criteria vocabularies [E]
Public URL params · `useListings` remapped params · CRM `buildIdxSearchParams` · projection `PROJECTION_SUPPORTED_CRITERIA_KEYS` · alert-normalized fields. A saved search is serialized in one and executed in another → the drops above.

**Contract implication:** one **versioned** criteria schema (`criteria_version` stamped at save), one serializer, an explicit **capability map** (which keys are search-capable / alert-capable / report-capable), and a **fail-loud** rule when a user saves criteria that a target engine can't honor. Must-have vs nice-to-have weighting (§strategic gap 13) belongs in this schema.

---

## 8. Reports / CMA analysis

### The CMA close-price bug (P0) [E]
`lib/cma/engine.ts`:
1. **Never selects `close_price`** — the closed-comp branch uses `list_price` (`:118`). So even when closed comps are found, the CMA is built on **list** prices, not achieved prices.
2. **Spreads `SEARCH_DISPLAY_GATE`** (`idx_display_yn: true`, `:64`) into the comp query, which **excludes terminal statuses** — so the closed-comp branch returns **~zero rows**. The CMA silently falls back to **active list prices**.

Net effect: a seller CMA reflects asking prices, not sale prices — a material valuation error. `lib/comps/fetch-comps.ts` is **unaffected** (it bypasses the DB gate and queries Cotality directly) — so the two comp paths disagree.

### Rental closed-comp gap [E]
`STATUS_MAP` has no `Leased`/`Rented` → **landlord rental CMAs can't source closed rental comps at all.** Compounded by there being **no public rental sold record** (rentals need `list_rent` + optional `achieved_rent`) and **no rental-economics fields** (net effective rent, concessions, lease term, FARE fee payer) — §strategic gap 5.

### Other [E]
- `resolveVisibility` is applied only in the building routes + listing detail — **not** in CMA/reports/portal comparables, so the audience/source labeling contract doesn't reach the report artifacts.
- `/api/crm/market-report` consumes only a `neighborhoods` body param — search filter state does **not** flow into reports; reports and search are disjoint.
- Reports are not versioned/snapshotted — a CMA can't be reproduced as-sent (§strategic gap 17). The prospect `/pdf` route returns HTML, not a true PDF.

**Contract implication:** comps are the highest-stakes consumer of the contract. The contract must (a) make closed comps select `close_price` and **not** apply the display-gate (agent audience = full lifecycle), (b) model **two** comp shapes (sale vs rental) so a single sold-price assumption can't break rentals, (c) route report artifacts through `resolveVisibility` for labeling, (d) define comp confidence + snapshot/versioning.

---

## 9. Stranded-branch review (`feat/search-canonical-contract`, `lib/search/canonical/`)

Seven files, 369 lines, **not on main.** Per-file keep / change / reject. This branch is **reference only** — bring over what's correct, rewritten against the merged Backend-Search-0 contract.

| File | Verdict | Rationale |
|---|---|---|
| `live-truth.ts` | **KEEP as SHAPE reference ONLY** | Useful for the *structure* of a Cotality enum registry (which enums to model: `StandardStatus`, `PropertyType`, `CommonInterest`, `MLS_STATUS_FILTERABLE`, `DEAD_OR_INVALID_VALUES`). But its **values are a static copy and are NOT authority.** Per AGENTS.md §7 the registry must be **generated live** via `npm run cotality:pull && npm run cotality:verify` (authority = `data/cotality-enums.live.json`) / live `$metadata`. Use this file only to model the shape — never seed contract values, counts, filterability, or tests from its copied numbers. |
| `status.ts` | **CHANGE** | `StatusGroup` (active_on_market / pending_contract / closed_recent / off_market / unavailable) is a reasonable grouping, and its note ("Pending is the live in-contract status, NOT ActiveUnderContract") matches the live pass. But it introduces a **second** status vocabulary parallel to the merged `LifecycleStatus`. **Reconcile to one** — map `StatusGroup` onto the 8-bucket `LifecycleStatus`, don't ship both (avoids reintroducing D6-2). |
| `listing-class.ts` | **KEEP** | `PropertyType → sale/rental/commercial` (`Residential`/`ResidentialLease` exact, no space). Clean, correct, matches live truth. |
| `ownership.ts` | **KEEP** | `CommonInterest → condo/coop/condop/rental_building/none`. Directly fixes B-11 (CRM ownership unmapped). |
| `display-gate.ts` | **CHANGE / partial reject** | `displayGate(group, gates, audience, policy)` is the right shape, but it **carries REBNY/UCBA prose + gate columns inline**. Per the ground rules, compliance rules live in the compliance canon, not the field contract. Keep the gate-resolution **logic**, but have it **call** the merged `resolveVisibility` rather than re-encode display rules — one resolver, not two. This is where a naive port would recreate the "three display-gate implementations" problem (§1.2). |
| `comp-eligibility.ts` | **KEEP (high value)** | Windows on `CloseDate` (not `ModificationTimestamp` — correct), segments by ownership. This is the seed of the §8 CMA fix. Extend it to the two-shape sale/rental comp model. |
| `index.ts` | **KEEP** | Barrel. Trivial. |

**Net:** `live-truth.ts`, `listing-class.ts`, `ownership.ts`, `comp-eligibility.ts` come over largely intact; `status.ts` and `display-gate.ts` are reconciled to the merged Backend-Search-0 contract so we don't fork a second status/gate vocabulary.

---

## 10. Proposed Backend-Search-1 contract

**This is a proposal for review, not an implementation.** It defines the canonical contract *module* on `main`; it does NOT wire public `/api/listings`, rewrite saved searches, change alerts, or touch CRM/CMA/reports (those are downstream PRs). **No schema migration is proposed here** — every item below can live as a pure contract module + registry; anything requiring a column is flagged and deferred to a separate, approval-gated PR.

### 10.1 What the contract module defines (pure, testable, no I/O)

1. **Canonical field registry** — every field by its **Cotality** identifier, with: public-DTO path, DB column, projection column, CRM param, capability flags (`searchable`/`sortable`/`filterable`/`alertable`/`reportable`), and attribution/compliance role. **Generated live** from `data/cotality-enums.live.json` (`npm run cotality:pull && npm run cotality:verify`) / live `$metadata` — the stranded `live-truth.ts` is a **shape reference only, never a value source** (§9). Fixes the "field means different things per surface" class (B-1…B-4, B-11, B-12).
2. **Status vocabulary** — the merged 8-bucket `LifecycleStatus` **plus the `unknown` fail-closed bucket already shipped in Backend-Search-0.1 (PR #489)** as the single source; the contract inherits and preserves that fail-closed default (no re-fix needed). Consolidate to one canonical TERMINAL set (the two-set drift noted in §6).
3. **Transaction-type vocabulary** — `sale | rental | commercial` from `PropertyType` via `listing-class.ts`. Never collapse sold/rented downstream.
4. **Ownership vocabulary** — `condo | coop | condop | rental_building | none` from `CommonInterest` via `ownership.ts` (fixes B-11).
5. **Audience/source visibility** — re-export the merged `resolveVisibility`/`toLifecycleStatus` as the ONE resolver; the contract adds no second gate (fixes §1.2, §9 `display-gate.ts`).
6. **Display-gate rules** — expressed as capability + `resolveVisibility` calls, not re-encoded prose. `source` becomes a first-class typed value (`acris|mls|mallan_exclusive|internal`) the contract carries (fixes §3 attribution-by-inference).
7. **Sort keys** — a canonical enum with a **mandatory `id asc` tiebreak** and a rule that sort is authoritative server-side (fixes D4, D5, D8).
8. **Filter keys** — one canonical key-set; a UI-control→key map; **unmapped keys fail loud** (fixes the §4 silent-drop class).
9. **Reportable fields** — the subset legal to surface in a client/report artifact, routed through `resolveVisibility` (fixes §8 labeling gap).
10. **Saved-search serialization shape** — **versioned** (`criteria_version`), with a capability map declaring per-key `searchable/alertable/reportable`; saving alert-incompatible criteria fails loud (fixes D7-1, D7-2, D7-6).
11. **Provider-field mapping** — driven by the Cotality registry (§1); amenities modeled as substring-over-picklist (there are no YN booleans) with an explicit "not alertable / not filterable on fallback path" capability flag (fixes B-9, §4 D2 honesty).
12. **Attribution/source labeling requirements** — `requiresAttribution`/`requiresSourceLabel`/`requiresTransactionLabel` as obligations every audience-facing surface asserts.
13. **Comp eligibility** — `comp-eligibility.ts` windowing on `CloseDate`, **two shapes** (sale uses `close_price`; rental uses `list_rent`+optional `achieved_rent`), agent audience = no display-gate (seeds the §8 fix).
14. **Failure behavior** — fail-closed for public (unknown status/source → blocked); fail-loud for criteria the target engine can't honor; fail-open **only** for the two provider-pre-filtered fields the compliance canon explicitly requires (`InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`) — and those stay in the compliance module, referenced not duplicated.

### 10.2 Explicitly OUT of scope for the Backend-Search-1 PR
Wiring public `/api/listings`; rewriting saved searches; changing alerts; changing CRM/CMA/reports; fixing sorting/count/pagination in the routes; ANY schema migration. Those are downstream, each separately approved. Backend-Search-1 lands the **contract + tests only**, so the routes can be migrated onto it one at a time with the contract as the spec.

### 10.3 Strategic dimensions the contract should *name now* (even if built later)
From §Strategic, the P0 gaps that are painful to retrofit and should shape the contract's type surface even before implementation: a **multi-entity** notion (`listing | building | contact | buyer_need | collection | engagement_event | comp_set`), a **temporal event-history** spine (`first_seen_at`, price-change events, status-transition timestamps, self-snapshots), **dedup/canonical identity**, a **data-quality envelope** (`confidence/provenance/freshness/is_estimated`), **economics** (carrying cost + rental economics), and **fine-grained entitlement** beyond the 4-value audience enum. Naming these as reserved dimensions now avoids a v2 rewrite; **none require a migration in Backend-Search-1** — they're type/interface reservations.

---

## 11. Tests (proposed, to ship WITH the contract PR — proof-first)

Contract is pure → every branch unit-testable, no I/O. Proposed suites:

1. **Field registry** — every Cotality field resolves to exactly one canonical key; capability flags are internally consistent (nothing `alertable` that the projection can't express); public `mlsId` maps to the Cotality key not the internal id (locks B-12).
2. **Status** — the `unknown`/blank → **fail-closed** test already ships in Backend-Search-0.1 (PR #489); Backend-Search-1 retains and extends it. Plus AUC→active, Pending→pending; sold≠rented across sale/rental transaction types (extends the existing visibility-contract suite).
3. **Ownership** — `CommonInterest` → each bucket; `StockCooperative`→coop; no `Cooperative` member assumed (locks B-11 + live truth).
4. **Sort** — every canonical sort key emits a stable order with `id asc` tiebreak; no client re-sort can diverge from the declared key (locks D4/D5 semantics).
5. **Filter capability** — an unmapped/unsupported key is **rejected loudly**, never silently dropped (locks the §4 + D7 silent-drop class).
6. **Saved-search versioning** — a serialized criteria set round-trips with `criteria_version`; alert-incompatible criteria are rejected at save (locks D7-1/D7-2).
7. **Visibility** — the contract re-exports exactly one resolver; grep-guard that no surface re-encodes a second display gate (locks §1.2 / §9 `display-gate.ts` reconciliation).
8. **Comp eligibility** — closed sale comp selects `close_price` and is NOT display-gated for agent audience; rental comp uses `list_rent`/`achieved_rent`; sold and rented never collapse (locks the §8 CMA fix as a failing→green test).

Per §J.6: any generated-artifact/registry file must prove the generator ran, sources unchanged unless in scope, and `npm run test:rls` (run by hand — **not** in PR CI) passes.

---

## 12. Strategic / "what's missing" layer

The single structural finding that dominates everything: **the current framing is listing-row-centric and current-state-only.** Best-in-class systems derive their value from two things the plan doesn't yet name as dimensions — (1) a **demand/relationship entity model** (buyer-needs, contacts, collections, engagements, buildings) beside the listing, and (2) a **retained, append-only, dated event history** per listing (the feed gives "now," not history). Absorption, DOM clocks, price-cut/new-vs-modified alerts, status badges, and behavioral matching are **all** derived from those two — none computable from a listing row alone.

### Capability → contract-requirement map (P0/P1/P2)

- **C1 Agent-to-agent co-broke / listing-request (P0)** — no demand-side entity today. Needs `buyer_need` (criteria + qualification flags, **never buyer identity**, audience scope: whole-RLS / brokerage-only / named-agents, expiry) + `need_match`/response + co-broke compensation field (private, off-feed, entitlement-gated **[Class-C]**) + reverse-prospecting privacy (listing agent sees buyer *agent*, buyer PII masked).
- **C2 Curated client collections + engagement tracking (P0 schema / P1 dashboard)** — `ListingEventTracker` today is anonymous public analytics only. Needs `collection` + append-only `engagement_event` (actor/listing/collection/event/dwell/ts) + notification intelligence that **diffs prior state** (`new_match` vs `price_changed` vs `status_changed` vs `back_on_market`, not one "update") **[Class-C: portal-access + audit-retention]**.
- **C3 CMA + rental comps (P0)** — two distinct comp models (a single sold-price comp table **breaks for rentals**); rental economics (net effective rent, concessions, lease term, stabilized flag, FARE payer **[Class-C]**); adjustment grid (system-vs-agent kept distinct); confidence score + value range; snapshot/versioning.
- **C4 Off-market / expired seller-prospecting (P0)** — lifecycle as **dated events** not current-state; **ACRIS as first-class owner-intelligence keyed by BBL** (tenure, equity/distress, absentee flag); propensity score (P1); outreach gating (TCPA/DNC/SHIELD + §175.25 + Fair Housing **[Class-C]**); NYC **co-op caveat** (deeds are LLC/stock — ACRIS deed logic partially breaks) [needs probe].
- **C5 Market intelligence as first-class outputs (P0)** — event-derived time-series (needs retained `original_list_date/price`, price-change events, contract/close dates); two DOM clocks (cumulative vs Miller-Samuel from-last-list); sliceable by ownership-class × new-dev/resale; absorption / months-of-supply / list-to-sale / market-pulse; **you must snapshot the active set yourself**.
- **C6 Marketing outputs (P1)** — media manifest (hero, count, floorplan/tour flags) [needs probe: `ResourceRecordKey`]; media/completeness score as a card down-rank gate; branding block as data (§175.25 license #s); **disclosures as testable data fields not hardcoded** (IDX disclaimer, FARE flag, FH statement) — proof-first, per the repo's own FARE-disclosure history **[Class-C]**.
- **C7 Matching (P0 schema / P1 behavioral)** — **must-have vs nice-to-have separation** (`{field, operator, value, weight, required:bool}`) — the single most important structural requirement; every preference maps to a normalized indexed attribute; reverse-prospecting (query buyers by listing); behavioral refinement from events **[Class-C: TCPA/PII]**.
- **C8 NL/semantic + alert intelligence (P0 alerts / P1 semantic)** — `first_seen_at` (our ingest ≠ MLS list date) + per-field change detection; **dedup/canonical identity** (relists + cross-feed dupes spam alerts) [needs probe: `ListingKey`/relist semantics]; per-user alert dedup state; semantic layer with **hard-constraint guardrails** (vector recall but structured filters enforce must-haves) + FH scanning on query AND indexed text **[Class-C]**.
- **C9 Luxury presentation / trust (P0 data / P1 density)** — provenance label per listing; freshness (`last_updated_at` + `first_seen_at`); honest DOM **[Class-C]**; derived badges from event history; completeness gate; card density (price, **PPSF, monthly carrying cost**, building, amenities, hero, status, freshness); proof-first badges (tested rendered output, not source presence).

### Ranked gap list ("what's being missed")

**P0 — foundational, hard to retrofit:**
1. **Demand-side / relationship entity model** — biggest single gap; co-broke, collections, matching, reverse-prospecting have nowhere to live (the orphaned `client_preferences` is the only fragment).
2. **Temporal / append-only event history + self-snapshotting** — the spine for analytics, alerts, badges, behavioral matching.
3. **Dedup & canonical listing identity** across relists + ACRIS↔MLS↔exclusive.
4. **Confidence / provenance / freshness as a scored data-quality dimension.**
5. **Rental economics** (net effective rent, concessions, term, stabilized, FARE payer).
6. **Carrying-cost modeling** (maintenance/CC/taxes/assessment → total monthly) as filterable+sortable+card axis.
7. **Entitlement / fine-grained sharing** beyond 4 coarse audiences (per-user/collection/share-scope + RLS audience scoping + co-broke-comp gating).
8. **Engagement / sharing audit** as first-class append-only stream.
9. **Building & neighborhood entity resolution** (no canonical Building; the ACRIS unit-lot ≥1001 vs base-lot bug + `CountyOrParish` vs `CityRegion` split are symptoms) [needs probe].

**P1 differentiators:** market-stats as registry outputs (10) · media intelligence (11) · price-history/price-cut intelligence (12) · must-have/nice-to-have matching + reverse-prospecting (13) · buyer-demand signals (14) · exclusive/pocket lifecycle + syndication boundaries incl. the **UCBA "Off-Market" label prohibition** (15) **[Class-C]** · comp confidence & adjustment logic (16) · report templating & versioned snapshotting (17) · NYC financing/board dimension (18) · consent/DNC/TCPA-SHIELD gating (19) **[Class-C]**.

**P2 advanced:** semantic/embedding layer with hybrid retrieval + FH guardrails (20) · accessibility/SEO as data-backed testable requirements (21) · predictive propensity scoring (22).

### Top new contract dimensions to reserve now
`entity_type` · `temporal`/event-history · `data_quality` · `identity`/dedup · `entitlement` · `economics` (carrying-cost + rental) · `engagement` · `media` · `market_metric` · `preference_semantics` (must-have vs nice-to-have) · `exclusive_syndication` (Coming-Soon no-DOM, Participant-Only, Owner-Opt-Out, "Off-Market" label prohibition).

**Bottom line:** the current 11-section plan is a sound *listing-display permissioning* contract. To be the agent-intelligence backend the use cases demand, it must grow two missing halves — a **multi-entity relationship/demand model** and a **retained temporal event history** — plus data-quality, dedup-identity, entitlement, economics, engagement, media, and market-metric dimensions. The P0 gaps are the ones painful to retrofit; **reserve their type surface in Backend-Search-1 even though none require a migration in this PR.**

---

## 13. Live-verification checklist (before any build)

**Prior probe context (2026-07-06) — historical, re-verify live before build (NOT authority):** `StandardStatus` 11 members / `Pending` not AUC; `Residential`/`ResidentialLease`; `StockCooperative`/`Condominium`/`Condop`; no `OwnerOptOut` member; `MlsStatus` not filterable. Per AGENTS.md, rerun `npm run cotality:pull && npm run cotality:verify` (authority = `data/cotality-enums.live.json`) or live `$metadata`/`$count` before locking any enum / filterability / sortability / status / field assumption — do not rely on copied sets.

**Class-B (Cotality field truth — needs `trestle:probe` / live `$metadata`/`$count`):** Media key = `ResourceRecordKey`; `ListingKey`/relist-key dedup semantics; sqft availability/reliability (PPSF); which amenity/feature fields are structured vs remarks-only; `days_on_market`/`first_active_date` backfill state; `PropertySubType`/`NewConstruction`/`Garage` filterability; `CountyOrParish` vs `CityRegion` population; ACRIS unit-lot (≥1001) vs base-lot; co-op ownership in ACRIS (LLC/stock — deed logic breaks); `Latitude`/`Longitude` population.

**Class-C (policy — via `COMPLIANCE-CANONICAL-INDEX.md`):** public display of MLS `Pending` / closed `ClosePrice` (§2.05/VOW); agent-to-client report inclusion of MLS sold prices; co-broke compensation surfacing (post-NAR); FARE Act broker-fee fields; RLS 2026 Coming-Soon / Participant-Only / Owner-Opt-Out status + DOM-accrual rules; UCBA "Off-Market" label prohibition; DOM display rules; FH scanning on semantic query + indexed remarks; TCPA/DNC/SHIELD outreach gating.

---

## 14. Analysis findings / candidate work items

> **This section is NOT the canonical platform issue registry.** The shorthand labels used throughout this analysis (`B-n`, `D-n`, `D6-n`, `D7-n`, `Attr`, `CMA`) are **analysis-local cross-reference labels, not tracked issue IDs.** Per AGENTS.md, all tracked issues / debt / risks live in `docs/PLATFORM-ISSUE-REGISTRY.md` with canonical IDs. Any finding below that is promoted to tracked implementation work **must** be registered in `docs/PLATFORM-ISSUE-REGISTRY.md` (or mapped to an existing registry ID) **before** implementation. No canonical IDs are minted here.

| Finding | Section | What it is | Sev | Status / home |
|---|---|---|---|---|
| Visibility unknown-status default | §6 | unknown/unrecognized status → public fail-open | HIGH | **COTALITYLVED — Backend-Search-0.1, PR #489 (`f1b26b28`)** |
| CMA close-price valuation bug | §8 | closed comps valued on `list_price`; display gate excludes terminals | HIGH | **candidate P0** — separate reports/CMA track |
| Public DB filter-after-pagination | §4 | 6 filters post-paginated → inflated count, ragged pages | HIGH | candidate — route, spec'd by contract |
| Amenities no-op on Cotality fallback | §4 | all but pet-friendly silently dropped | HIGH | candidate — contract capability flag + route |
| Saved-search criteria loss + no versioning | §7 | criteria dropped; no `criteria_version`; alert created w/o gate | HIGH | candidate — contract |
| Sorting instability | §5 | server/client key divergence; CRM "cheapest of 200" | HIGH | candidate — contract sort enum + route |
| Field-mapping gaps | §2 | roomsTotal undefined; baths diverge; public mlsId wrong; projection gate-column divergence | HIGH | candidate — field registry |
| Attribution gaps | §3 | client alert emails ship without courtesy attribution | MED-[Class-C] | candidate — contract labeling + route |
| Product data gaps | §2 | no PPSF / assessments / total carrying cost | HIGH-product | candidate — economics dimension (§12) |
| Dead / silent controls | §4 | dead controls + multi-borough silent broadening | MED | candidate — contract fail-loud + UI |
| CRM sort defects | §5 | client-only sorts, filter loss on re-sort, lexical date sort | MED | candidate — route, spec'd by contract |
| Terminal-set drift | §6 | two TERMINAL sets can diverge | MED | candidate — one canonical set |
| Field-resolution / serialization drift | §2/§7 | assorted field + criteria drift | MED/LOW | candidate — field registry + criteria schema |

---

---

# PART II — Report / Valuation / Campaign / Intelligence Extension

> **Why this part exists.** The search backend is not a results list — it is the data + intelligence foundation for everything downstream: **bank/lender reports, investor reports, appraisal-support reports, valuation-style reports, CMA (sale) and rental CMA, market-direction tools, owner-valuation marketing, agent mass-marketing, buyer/renter match campaigns, seller/landlord prospecting, and investor-opportunity campaigns.** So the contract must support not just *retrieval* but **analysis, explanation, confidence, attribution, and report generation.** Everything below is analysis + recommendation only. **No code, no PR, no schema.** Every live field claim is `[needs probe]`; every policy boundary is `[Class-C]`.
>
> **The governing professional-risk rule for this entire part (read §J first if building):** the system produces a **broker opinion of value / CMA / market estimate** — it is **NOT an appraisal** and must never be represented as one. This shapes every report type, label, and disclaimer below.

## §15.A — Institutional / bank / appraisal-support report needs

Six report products share one comp/market engine but differ in required content, audience restriction, and disclaimer severity. **Separate them at the contract level** so a client-facing CMA can never be mislabeled to a lender as appraisal-grade.

### Common data spine (all report types draw from this)
Property facts · listing history · sale history (ACRIS public-record + agent-visible MLS-sourced) · rental history · comparable **sales** · comparable **rentals** · active competition · in-contract competition · expired/withdrawn competition · neighborhood market data · building market data · price-per-sqft analysis · list-to-sale ratio · days-on-market analysis · absorption rate · inventory trend · price-reduction trend · rent trend · carrying-cost analysis · projected sale/rent range · **confidence score** · methodology explanation · assumptions · **source attribution** · data-freshness timestamp · disclaimers · **audit trail**.

### Current availability of the spine [E unless noted]
| Spine element | Available now? | Blocker |
|---|---|---|
| Property facts | partial | field-mapping bugs B-1/B-2/B-11/B-12 |
| Sale history (public) | yes (ACRIS via Backend-Search-0) | co-op deed logic breaks [needs probe] |
| Sale history (agent MLS-sourced) | yes for agent audience | not routed into reports (§8) |
| Rental history | **no** | no achieved-rent retention (§8, §12 gap 5) |
| Comparable sales | **broken** | CMA-1 (uses list_price, gate excludes terminals) |
| Comparable rentals | **no** | STATUS_MAP no Leased/Rented (§8) |
| Active / in-contract / expired competition | agent-queryable | not assembled as a report block; expired needs event-history (§12 gap 2) |
| PPSF / list-to-sale / absorption / DOM / inventory / price-cut / rent trend | **no** | all require retained temporal history + self-snapshots (§12 gap 2); none computed |
| Carrying-cost analysis | **no** | no carrying-cost model (B-15, §12 gap 6) |
| Projected range | **no** | no forecasting layer (§15.B) |
| Confidence score | **no** | no data-quality dimension (§12 gap 4) |
| Methodology / assumptions / attribution / freshness / disclaimers / audit trail | **no** | no report contract exists |

**Finding:** of the ~24 spine elements, roughly **six** are partially available and the rest do not exist. Institutional reporting is a *green-field* on top of the contract, not an extension of current code.

### The six report products (contract must type these distinctly)
| Report | Audience | Comp basis | Confidence bar | Disclaimer severity | Key boundary |
|---|---|---|---|---|---|
| **Bank / lender** | lender | closed sales (achieved) + active competition | high, range must be conservative | **highest** | **Must state: not an appraisal; not for federally-related transaction valuation** `[Class-C]` (FIRREA/Dodd-Frank require a licensed appraisal for loan origination — a BPO/CMA cannot substitute). |
| **Investor** | investor | sales + rentals + yield inputs | medium-high | high | opinion/estimate, not investment advice; assumptions labeled |
| **Appraisal-support** | appraiser | raw comps + adjustments, minimal interpretation | data-only | high | **provides data to support an appraiser; is not itself an appraisal** `[Class-C]` |
| **Seller CMA** | seller | closed sales + active/expired competition | medium | standard broker-opinion disclaimer | broker opinion of value; commissions-negotiable notice where applicable `[Class-C]` |
| **Landlord rental CMA** | landlord | closed + active rentals; net-effective | medium | standard | FARE Act fee context `[Class-C]`; net-effective ≠ gross |
| **Buyer/renter advisory** | client | match + market context | medium | standard | not a guarantee of availability/price |

**Contract implication:** a `report_type` enum + per-type **required-block manifest** + per-type **disclaimer/label set** + per-type **audience entitlement**. The comp engine feeds all six; the *packaging, confidence bar, and legal framing* differ by type. This is the strongest argument for the `data_quality` (confidence/provenance/freshness) and `entitlement` dimensions reserved in §10.3.

## §15.B — Market predictability / forecasting layer

For each metric: **inputs needed · current data availability · method · confidence · audience-safe? · label class (estimate / projection / market opinion)**. **All forecasting output is "market opinion / estimate," never "prediction" or "guarantee."** `[Class-C]` on every client/bank/appraisal use.

| Metric | Inputs | Available now | Method (candidate) | Confidence | Safe for | Label |
|---|---|---|---|---|---|---|
| Estimated **sale** price range | closed comps (achieved), PPSF, subject facts, active competition | **no** (CMA-1 + no PPSF) | comp regression / adjusted PPSF band | med | seller/investor/**bank w/ heavy disclaimer** | estimate |
| Estimated **rental** price range | closed+active rentals, net-effective | **no** (no rental comps/economics) | comp band on net-effective | med | landlord/investor | estimate |
| Days-to-sell estimate | DOM history, absorption, price-vs-comp | **no** (no DOM/absorption retention) | survival/absorption model | low-med | seller/agent internal | estimate |
| Days-to-rent estimate | rental DOM, seasonal | **no** | same | low-med | landlord/agent | estimate |
| Price-reduction probability | price-change events, DOM, overpricing gap | **no** (no price-event history — §12 gap 2) | classifier on event history | low | **agent internal only** | market opinion |
| Overpricing risk | list vs comp band | **no** | list − estimated band | med | seller/agent | market opinion |
| Buyer / renter demand signal | engagement events, saved-search matches, view/favorite | **no** (engagement not a dimension — §12 gap 8) | demand index from events | low-med | agent internal → seller summary | market opinion |
| Building / neighborhood demand trend | absorption + inventory over time | **no** (no snapshots) | trend on self-snapshots | med | all w/ freshness label | estimate |
| Seasonal trend | multi-year history | **no** (history not retained) | seasonal decomposition | low (until history accrues) | agent internal | market opinion |
| Absorption / inventory pressure | active count ÷ trailing sales | **no** | months-of-supply | med | all | estimate |
| Comparable confidence | comp count, recency, similarity | **no** (no confidence model) | weighted similarity score | — | drives every other confidence | score |
| Investment yield estimate | rent, price, carrying, vacancy | **no** (no carrying/rental) | cap rate / cash-on-cash (§15.F) | med | investor | estimate |
| Rent-vs-buy | carrying vs rent, appreciation assumption | **no** | scenario model | low-med | buyer/investor | market opinion (assumptions labeled) |

**Finding:** **nothing in the forecasting layer is computable today** because the two P0 gaps (temporal event history + carrying/rental economics) and the confidence dimension are absent. Forecasting cannot ship before those land. **Recommendation:** the contract should *reserve* the forecasting output types and their label classes now, and the forecasting engine becomes a downstream PR that depends on the temporal-history and economics PRs. **Do not surface any forecast to bank/appraisal audiences until confidence + methodology + freshness are enforced and the appraisal boundary is legally cleared** `[Class-C]`.

## §15.C — Mass-marketing / campaign intelligence

The same criteria contract must power campaign segmentation and personalization. Per campaign: **target audience · search criteria · required fields · personalization fields · market stats to include · compliance/attribution · suppression/unsubscribe · saved-search/update behavior · output · risk level.**

| Campaign | Audience | Criteria source | Personalization | Market stats | Compliance | Risk |
|---|---|---|---|---|---|---|
| Owner valuation | property owners | ACRIS owner + building/neighborhood | value range, comps | PPSF/absorption/trend | §15.D boundary; §175.25; TCPA/DNC/CAN-SPAM `[Class-C]` | **HIGH** (valuation + outreach) |
| Expired-listing seller | expired owners | lifecycle=expired (event history) | last list, time-off-market | neighborhood trend | UCBA "Off-Market" prohibition `[Class-C]`; DNC | HIGH |
| Withdrawn/canceled seller | those owners | lifecycle=withdrawn/canceled | prior activity | trend | same | HIGH |
| Landlord rent-update | landlords | building/unit rentals | current vs market rent | rent trend, net-effective | FARE context `[Class-C]` | MED |
| Buyer listing-match | buyers | saved-search / buyer_need | match score, why-match | price-vs-comps, total monthly | Fair Housing on any copy `[Class-C]` | MED |
| Renter listing-match | renters | saved-search | match, net-effective | rent context | FARE; Fair Housing | MED |
| Investor deal | investors | yield thresholds | cap rate, yield | building/neighborhood | not investment advice | MED-HIGH |
| Building-specific | any | building id | building trend | building stats | attribution | LOW-MED |
| Neighborhood market-update | any | neighborhood | area stats | absorption/DOM/price | attribution + freshness | LOW |
| Agent-to-agent listing request | agents | buyer_need broadcast | criteria + qualification | — | co-broke comp gating `[Class-C]`; buyer PII masked | MED |
| Open-house follow-up | attendees | RSVP list | listing + similar | area context | consent/CAN-SPAM | LOW |

**Cross-cutting requirements every campaign needs and the system lacks:** a **suppression/unsubscribe + DNC/consent** dimension (§12 gap 19, `[Class-C]`), **segment + recipient** entities (§15.I), **Fair Housing scanning on generated copy output** (not just source — the repo's own FARE-disclosure history proves output-proof is required, §F), and **saved-search/update-search** semantics that survive vocabulary changes (`criteria_version`, §7). **Finding:** campaign segmentation *is* a saved-search query plus an audience + a suppression list + a personalization field-set — so the criteria contract is the right foundation, but the suppression, consent, and segment/recipient entities are missing.

## §15.D — Owner-valuation marketing (highest professional-risk campaign)

Backend support to send owners: estimated value **range** · recent comparable sales · active competition · expired/withdrawn examples · building trend · neighborhood trend · PPSF trend · time-to-sell estimate · buyer-demand signal · reason to contact Mallan · **confidence score** · source labels · disclaimers.

**Availability:** value range/PPSF/time-to-sell/demand/confidence all depend on the missing forecasting + economics + confidence layers (§15.B). ACRIS comps + building/neighborhood identity are the only pieces partly present (and the co-op ACRIS caveat applies `[needs probe]`).

**What must NOT be overstated — hard product boundary `[Class-C]`:**
- **Do not present an automated estimate as an appraisal.** Ever.
- **Distinguish, in the artifact itself:** broker opinion of value · CMA · market estimate · appraisal-support — these are four different things with different legal weight.
- **Label every assumption and every data source.** A value figure without a labeled range, methodology, freshness date, and "broker opinion, not an appraisal" disclaimer is a professional-risk exposure.
- Present value as a **range with a confidence score**, never a single guaranteed number.

**Recommendation:** owner-valuation output is the single highest-risk product in this whole plan. It should be **gated behind the confidence + methodology + disclaimer contract** and **not shipped until §J's boundary language is confirmed against the compliance canon.**

## §15.E — Buyer/renter listing campaigns with market context

Per send, define: **listing match score · why-this-matches · price comparison to similar · building/neighborhood context · total monthly cost · market direction · negotiation signal · rental concession / net-effective (if available) · urgency signal · missing-data warning · client feedback tracking.**

| Element | Available now | Depends on |
|---|---|---|
| Match score + why-match | **no** | must-have/nice-to-have matching schema (§12 gap 13) |
| Price-vs-similar | **no** | comp engine fix (CMA-1) + PPSF (B-15) |
| Building/neighborhood context | partial | building/neighborhood entity resolution (§12 gap 9) |
| **Total monthly cost** | **no** | carrying-cost model (B-15, §12 gap 6) |
| Market direction | **no** | forecasting (§15.B) |
| Negotiation signal | **no** | price-event history + DOM (§12 gap 2) |
| Net-effective rent / concession | **no** | rental economics (§12 gap 5) |
| Urgency signal | **no** | demand signal (§15.B) |
| Missing-data warning | **no** | data-quality flags (§12 gap 4) |
| Client feedback tracking | **no** (anon only) | engagement dimension (§12 gap 8) |

**Finding:** a luxury buyer/renter send is mostly **derived intelligence**, not raw fields — it stands almost entirely on the P0 gaps. The one thing shippable sooner is a **missing-data warning**, which is itself the data-quality dimension. **Compliance:** all generated match copy runs Fair Housing scanning on output `[Class-C]`.

## §15.F — Investor analysis

Fields/calcs: purchase price · rent estimate · current rent (tenant in place) · carrying costs · taxes · common charges/maintenance · assessment · vacancy assumption · **cap rate · gross yield · net yield · cash-on-cash** · appreciation assumption · downside risk · liquidity/DOM risk · comparable rental support · comparable sale support · building financial-risk flags · confidence score.

| Input/calc | Available now | Blocker |
|---|---|---|
| Purchase / list price | yes | — |
| Rent estimate / current rent | **no** | no rental economics / achieved rent (§12 gap 5) |
| Taxes / common charges / maintenance / assessment | partial fields exist, **not modeled** | carrying-cost model (B-15) |
| Vacancy / appreciation assumptions | **no** | assumption registry (labeled, §J) |
| Cap rate / gross yield / net yield / cash-on-cash | **no** | all derive from the above; none computed |
| Comparable rental / sale support | **broken/no** | CMA-1 + rental comp gap |
| Building financial-risk flags | **no** | building entity + ACRIS lien/distress (§12 C4) |
| Confidence score | **no** | data-quality dimension |

**Finding:** investor analysis is a **carrying-cost + rental-economics + comp** composition — it is fully blocked on the same P0 economics gap. Yields must be **labeled estimates with stated assumptions**, never guarantees; "not investment advice" boundary `[Class-C]`.

## §15.G — Report methodology & audit trail

Every serious report must carry: report type · prepared by · prepared for · date/time generated · subject property · data sources · comp-selection criteria · **excluded comps and why** · manual adjustments · automated calculations · assumptions · confidence score · freshness timestamp · attribution · disclaimers · **version history** · **export/share log**.

**None of this exists today.** This is the strongest driver for the `generated_reports` / `report_comps` / `report_adjustments` / `valuation_runs` / `search_audit_logs` entities in §15.I. **Contract implication:** methodology + audit trail are not decoration — for bank/appraisal-support audiences they are what makes the artifact defensible. The contract should define a **report-provenance envelope** (who/for-whom/when/sources/exclusions/adjustments/assumptions/confidence/freshness/version) that every generated report must populate. Reproducibility (a report renders identically to as-sent) requires **snapshotting** the comp set and market stats at generation time — ties directly to §12's temporal-snapshot spine.

## §15.H — Design / presentation layer for high-trust reports

Luxury/high-trust presentation is a first-class requirement, not a skin. Design contract per surface:

| Block | Requirement |
|---|---|
| Executive summary | one-glance value range + confidence + freshness; no single guaranteed number |
| Property snapshot | verified facts, hero image, key metrics (PPSF, total monthly) |
| Valuation range | range + confidence band, **"broker opinion, not appraisal"** label inline `[Class-C]` |
| Comp table | source + status + transaction label per row (sold≠rented), attribution |
| Comp map | geo (lat/lng may be null → geocode fallback [needs probe]) |
| Adjustment notes | system-derived vs agent-entered visually distinct |
| Market-trend charts | absorption/DOM/PPSF/rent trend with freshness stamp |
| Source / freshness labels | every data block carries provenance + as-of date |
| Methodology section | plain-language comp selection + assumptions |
| Disclaimer section | audience-appropriate severity (§15.A / §J) |
| Appendix | raw comps, excluded comps + reasons |
| Outputs | **true PDF export** (today the prospect `/pdf` returns HTML — a real gap), email-friendly summary, client-portal version, agent/internal version (fuller data, PII rules) |

**Finding:** the four output variants (PDF / email / portal / agent-internal) are the **audience/entitlement dimension expressed as presentation** — the same `resolveVisibility` + DTO-tier logic that governs data must govern report rendering. Design and the visibility contract are the same problem viewed from two ends. **Proof-first:** per §F, every disclosure/label must be verified in *rendered* output, not source presence.

## §15.I — Candidate future data structures (analyze + recommend only; DO NOT implement)

| Candidate table | Purpose | Driven by | Priority |
|---|---|---|---|
| `report_templates` | per-type block/label/disclaimer manifest | §15.A, §15.H | P1 |
| `generated_reports` | each report instance + provenance envelope | §15.G | P0 (for reports) |
| `report_comps` | comps selected per report (frozen snapshot) | §15.G reproducibility | P0 (for reports) |
| `report_adjustments` | manual/system adjustments per comp | §15.G, §15.H | P1 |
| `valuation_runs` | each value-estimate run + inputs + confidence | §15.B, §15.D | P1 |
| `campaign_segments` | saved criteria + audience + suppression | §15.C | P1 |
| `campaign_recipients` | per-recipient send + personalization + result | §15.C | P1 |
| `client_listing_feedback` | client reactions on shared listings | §15.E, §12 C2 | P1 |
| `property_owner_targets` | owner-valuation prospecting list (ACRIS-keyed) | §15.C/D | P1 |
| `engagement_events` | append-only view/favorite/dwell/share (agent+client, not just anon) | §12 gap 8 | **P0** |
| `saved_search_versions` | versioned criteria (fixes D7-1) | §7 | **P0** |
| `search_audit_logs` | who searched/sent what, retention | §15.G, `[Class-C]` retention | P1 |
| `source_freshness_logs` | last-sync/as-of per source | §12 gap 4 | P1 |
| `data_quality_flags` | per-field/derived confidence + is_estimated | §12 gap 4 | **P0** |

**Recommendation:** none are built in Backend-Search-1. But the **P0-marked** ones (`engagement_events`, `saved_search_versions`, `data_quality_flags`, and reports' `generated_reports`/`report_comps`) are the ones painful to retrofit — the contract should **reserve their shape as interfaces now** so downstream migration PRs slot in cleanly. Each migration is a **separate, approval-gated PR** (NEON.md discipline; schema migrations are a §C hold).

## §15.J — Compliance / professional-risk framing (READ BEFORE BUILDING ANY REPORT)

Reports to banks, investors, and appraisers carry real professional-liability exposure. Define and enforce these product boundaries `[Class-C — confirm each against docs/compliance/COMPLIANCE-CANONICAL-INDEX.md before building]`:

- **Broker opinion of value vs appraisal** — the system produces a broker opinion / CMA. It is **not** an appraisal and **must not be labeled, styled, or marketed as one.** In NY, only a licensed/certified appraiser produces an appraisal; for federally-related mortgage transactions a licensed appraisal is required and a BPO/CMA **cannot substitute** (FIRREA/Dodd-Frank).
- **CMA vs appraisal-support** — a CMA is a broker product; "appraisal-support" means we supply *data* an appraiser may use — we do not perform the appraisal.
- **Market estimate vs guaranteed valuation** — always a range with confidence; never a guarantee.
- **Projection vs prediction** — label forecasts as **market opinion / estimate**, never "prediction" or "forecast-as-fact."
- **Assumptions & limitations** — every derived figure states its assumptions (vacancy, appreciation, comp selection) and limitations.
- **Source freshness & data completeness** — every artifact carries as-of dates and a missing-data indicator.
- **Attribution** — source/office labels per §3 (`requiresAttribution`), including on emailed/exported artifacts.
- **User/audience restrictions** — bank/appraisal-support artifacts are entitlement-gated; buyer PII masked per portal DTO rules.
- **Record retention** — generated reports + audit logs retained per the compliance retention schedule.

**Hard rule:** do not use language, styling, or product naming that implies the system is a certified appraisal tool **unless that is legally supported** — which, for automated output, it is not. This boundary is a fail-closed default: when unsure whether a phrasing crosses into "appraisal," **stop and check the compliance canon** (§E fail-closed rule).

## §15.K — Updated PR sequence

Backend-Search-1 remains **contract + tests only**. Part II shows the system is larger than one contract, so the build sequence expands into separately-approved PRs, each depending on the prior. **No coding on any of these yet.**

1. **Backend-Search-1 — canonical search/field/status/visibility contract + tests** (this analysis's §10). Reserves the Part II type surface; no migration.
2. **Source-freshness / data-quality contract** (`data_quality_flags`, `source_freshness_logs`) — the confidence/provenance/freshness dimension everything downstream needs. *(schema — approval-gated)*
3. **Temporal event-history + self-snapshot** (`listing_events`, snapshots, `first_seen_at`, dedup identity) — unblocks analytics, alerts, badges, forecasting. *(schema — approval-gated)*
4. **Economics contract** (carrying-cost + rental economics + net-effective) — unblocks comps, investor, buyer total-cost. *(may need columns — approval-gated)*
5. **Comp / valuation-methodology contract** — fixes CMA-1, two-shape sale/rental comps, adjustment grid, confidence, snapshotting.
6. **Market-analytics contract** — absorption/DOM/PPSF/list-to-sale/price-cut/rent-trend as registry-defined outputs (depends on 3).
7. **Client-engagement tracking** (`engagement_events`, `client_listing_feedback`) — depends on the entitlement/entity model. *(schema — approval-gated)*
8. **Saved-search versioning + capability map** (`saved_search_versions`) — fixes D7-1/D7-2/D7-6. *(schema — approval-gated)*
9. **Report contract + methodology/audit-trail envelope** (`generated_reports`, `report_comps`, `report_adjustments`) — the six report products + provenance. *(schema — approval-gated)*
10. **Campaign-segmentation contract** (`campaign_segments`, `campaign_recipients`, suppression/consent) — depends on saved-search + entitlement. *(schema — approval-gated)*
11. **Report export/audit-trail + PDF** — true PDF, share log, retention.
12. **Forecasting engine** — price/rent estimates, days-to-sell, demand, yield — **last**, gated behind confidence + methodology + the §J appraisal boundary; not surfaced to bank/appraisal audiences until legally cleared.

Each schema PR is a §C hold requiring explicit Maya approval and NEON.md discipline. The ordering is dependency-driven: **data-quality → temporal → economics** are the three foundations; reports, campaigns, analytics, and forecasting all sit on top.

---

**End of analysis (Parts I + II). No code has been written; no PR opened; no schema touched. Every institutional/valuation/forecast/campaign capability above is analysis + recommendation only, with live field claims flagged `[needs probe]` and policy boundaries flagged `[Class-C]`. The professional-risk boundary (broker opinion of value ≠ appraisal) governs all of Part II. Awaiting Maya's review before any Backend-Search-1 contract implementation.**
