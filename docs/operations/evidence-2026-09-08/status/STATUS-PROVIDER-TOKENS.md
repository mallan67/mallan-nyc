# Status = live Cotality StandardStatus tokens, one mapping per transaction, one date per status (2026-09-08, evening)

Owner ruling (Maya, verbatim essentials): correct every status consumer against live Cotality
Property.StandardStatus; use only Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold,
Incomplete, Pending, Withdrawn; keep the sale and rental Mallan workflows separate from Cotality status and never
call a workflow value MlsStatus; Sale Contract Signed → Pending + PurchaseContractDate; Sale Sold → Closed +
CloseDate; Rental Rented / Leased → Closed + CloseDate; remove PurchaseContractDate from the rental UI (Lease Signed
Date stays a clearly named Mallan internal fact); Expired → Expired + ExpirationDate (not OffMarketDate); Withdrawn →
Withdrawn + WithdrawnDate; Canceled → Canceled + CancellationDate (one L); Hold → Hold; Back on Market → Active +
BackOnMarketDate; Offer Out / Application Out / Lease Out never auto-map to Pending; Search uses StandardStatus,
never MlsStatus; CMA stores exact tokens and labels Closed → Sold (sale) / Rented (rental); market DOM ends at
CloseDate for Sold / Rented or OffMarketDate for a removal, never PurchaseContractDate. UCBA is compliance only; the
fields and the mapping come from Cotality.

This note supersedes `forms/STATUS-PER-TRANSACTION.md` (which stored Mallan words Sold / Rented / Cancelled / Draft)
and `dom/DOMAIN-DOM-TWO-CLOCKS.md` §3 (which ended the market clock at the signed contract).

## 1. What was wrong (root causes)

| # | Root cause | Where | Fix |
|---|---|---|---|
| 1 | The stored status vocabulary was Mallan's: `Draft`, `Sold`, `Rented`, `Leased`, `Cancelled` (double L) — and even provider rows were respelled (`Canceled` → `Cancelled` by the mapper's alias). Twelve-plus duplicated terminal / close sets hard-coded those words. | `lib/listings/mallan-status.ts`, `lib/idx/trestle-mapper.ts` STATUS_ALIASES, `lib/compliance/status.ts`, `lib/compliance/public-listing-filter.ts`, `lib/syndication/eligibility.ts`, `lib/compliance/dom-tracker.ts` sets, `app/api/cron/{data-retention,dom-reset,feed-reconcile}`, `lib/social-proof/cache.ts`, `app/api/portal/comparables`, `app/api/agents/[slug]/listings`, `scripts/ops-health.js`, `scripts/archive-backlog-predicate.js` | The storage vocabulary IS the eleven live members (`MALLAN_STORAGE_STATUSES`); every alias now folds the LEGACY spelling to the live token (never the other way); `normalizeStoredStatus` / `storageStatusesFor` / `TERMINAL_STATUS_FILTER_VALUES` keep every legacy row readable and matched by every DB filter until the correction plan rewrites them (`lifecycle/status-token-correction-plan.sql`, a HELD production write). A Mallan listing is born `Incomplete` (STATUS_INITIAL). |
| 2 | The two transaction mappings resolved to Mallan words and sent rental App Out / Lease Out and sale Offer Out toward in-contract states. | `lib/crm/status-mapping.ts` | Both mappings resolve to live tokens; Offer Out / Application Out → Active; Offer Accepted / Contract Out / Application Accepted / Lease Out → ActiveUnderContract (a live member; an accepted offer still on the market — an owner-confirmable choice); Contract Signed / Board Approved → Pending; Lease Signed / Board Approved (rental) → Pending; Sold / Rented / Leased → Closed; Cancelled (workflow word) → Canceled; Draft / Future → Incomplete. Each canonical status carries its facts (`statusFacts`): sale Pending → PurchaseContractDate, rental Pending → `_mallanLeaseSignedDate`, Closed → CloseDate + ClosePrice, Expired → ExpirationDate, Withdrawn → WithdrawnDate, Canceled → CancellationDate, ComingSoon → ActivationDate; Back on Market → BackOnMarketDate (`requiredFactsFor`). Labels per transaction (`canonicalLabels`: Closed → Sold / Rented, sale Pending → In Contract). `statusPresentation(row)` is the one display projection. |
| 3 | The status API accepted a bare word and wrote no date; the close required only a ClosePrice. | `app/api/crm/listings/[id]/status/route.ts` | The body carries `facts` (only `STATUS_FACT_FIELDS`); every fact the transition requires must be present afterwards (422 `STATUS_FACT_REQUIRED`, field named) and the accepted facts are persisted into raw_data with the transition; the close is `Closed` (broker-only). |
| 4 | The market clock ended at PurchaseContractDate; Pending did not accrue. | `lib/compliance/dom-tracker.ts`, `lib/compliance/rebny-ucba-rules.ts` domRules, `compliance/rules/status-rules.json`, `data/UCBA-2026-Requirements.md` note, `lib/idx/public-dto.ts` | `marketDom` ends at the CloseDate of a closed row (`closed`), the OffMarketDate of a removal (`off_market`), the day the row left the feed (`off_feed`), else the as-of day while Active / ActiveUnderContract / Pending; `DOM_ACCRUING_STATUSES` gains Pending; the contract-signed date stays a separate fact (`inContractSince`). UCBA's own table (Pending accrues, Closed stops) agrees; it is cited as compliance context only. |
| 5 | The enforcement rules forced OffMarketDate on Expired / Pending / Incomplete / Closed, keyed Canceled on the double-L spelling, and had no Expired → ExpirationDate rule. | `lib/compliance/rebny-ucba-rules.ts` conditional rules | CLOSED-001 (Closed + legacy spellings), CANCELLED-001 keyed on `Canceled` (+ legacy), WITHDRAWN-001, new EXPIRED-001 → ExpirationDate, PENDING-001 scoped to sale PropertyTypes (the rental Pending fact is `_mallanLeaseSignedDate`, enforced by the status API), OFFMARKET-001 only for Hold / Withdrawn / Canceled / Delete. `terminal_since` reads the status's own date first (Closed → CloseDate; Expired → ExpirationDate; Withdrawn → WithdrawnDate; Canceled → CancellationDate; OffMarketDate as the removal fallback). WithdrawnDate and CancellationDate join the raw_data keep-list. |
| 6 | The rental lease-signed date rode under PurchaseContractDate. | `lib/listings/mallan-form-contract.ts`, `public/crm/RENTAL-FORM-REDESIGN.html` | `_mallanLeaseSignedDate` is a declared Mallan-internal key (raw). The rental form's control is renamed `#rentalLeaseSignedDate`, labelled "Lease Signed Date (Mallan workflow)" and bound to that key; the collector emits it and the edit-load restores it. **No PurchaseContractDate binding, emission or hydration remains on either rental page.** No exact Cotality rental field exists (contract 2026-09-08: no Property field named *Signed*). |
| 7 | The status-date reads sat outside the Cotality interpretation boundary, and `CancellationDate` was retained in `raw_data` without ever being requested from the provider. | `lib/listings/terminal-since.ts`, `lib/listings/canonical-lifecycle.ts`, `lib/idx/trestle-mapper.ts` | `ContractEvents` gains `expirationDate` / `withdrawnDate` / `cancellationDate` and a new `statusDateFactsFrom(raw, features)` reads them INSIDE the boundary; `terminal-since` consumes that helper and touches no raw provider key (the boundary ratchet passes with the baseline untouched). `CancellationDate` joins the provider select beside `WithdrawnDate`. |
| 8 | `PENDING-001` keyed on `Land`, a PropertyType BOTH forms produce, so the sale-only rule fired on the rental form (`rls:validate` ERROR). | `lib/compliance/rebny-ucba-rules.ts` | The rule keys on the unambiguously sale PropertyTypes only; the per-transaction authority is the status API's `requiredFactsFor`. |

## 1b. What this unit does NOT change (the next unit)

The four consumer surfaces are **not** corrected here: the four Search status modes and the executor (still
`data-field="MlsStatus"` with workflow sub-status boxes), the five CMA / comp paths, manage-listings with the portal
and dashboard displays, and the forms' remaining status-date gating (Expired still reveals Off Market Date on the
sale form; Cancelled's CancellationDate control is still nested inside the Sold price block; no BackOnMarketDate
control exists; the submits do not yet send `facts`). Four agents were dispatched for those surfaces and died on
usage credits without editing source; three of them had written their specs first, and those are parked verbatim
under `pending-surface-specs/` with a README naming what each needs. Every one of those surfaces keeps working today
because the core reads legacy spellings and every stored row still matches every filter.

## 2. Live facts this unit rests on (read `status/LIVE-STATUS-DATES-2026-09-08.md`)

The eleven StandardStatus members match the ruling exactly (`data/cotality-enums.live.json`, pulled 2026-09-08). On
delivered rows CloseDate and OffMarketDate are populated (Closed: 200 / 200 each in the live sample); ExpirationDate,
WithdrawnDate and CancellationDate are selectable field names populated on 0 of 600 sampled rows and (Expiration /
Cancellation) not filterable — they are Mallan-entered facts on Mallan exclusives, stored under the Cotality names.

## 3. Proofs

(filled in by the surface reports — core proofs so far)

| Suite | What it proves |
|---|---|
| `tests/runtime/crm-status-mapping.test.ts` | the canonical vocabulary = the live members; two mappings; every workflow word → live token + its facts, line by line against the ruling; Offer / Application / Lease Out never Pending; the rental never carries PurchaseContractDate; Expired → ExpirationDate never OffMarketDate; per-transaction labels; legacy spellings read-compatible per transaction; the status-API state machine per transaction; `statusPresentation` |
| `lib/listings/__tests__/mallan-status.test.ts` | the storage vocabulary is the live vocabulary; legacy spellings resolve, are never written, and every DB filter still covers them |
| `lib/compliance/__tests__/dom-clocks.test.ts` (44), `tests/runtime/dom-one-rule-wiring.test.ts` | the clock ends at CloseDate / OffMarketDate / the departure day / as-of, never PurchaseContractDate; Pending accrues; the rule tables and the rules JSON mirror it |
| `h1-normalize-standard-status`, `h1-secondary-writers-terminal-guard`, `c2-terminal-idx-display`, `compute-gate-columns`, `ops-health-archive-backlog`, `crm-my-listings-filter`, `provider-status-domain-census`, `listing-form-mapping`, `canonical-lifecycle`, `terminal-since-helper`, `data-retention-archive-eligibility`, `feed-reconcile-c6`, `crm-listing-round-trip` | every writer folds a legacy spelling to the live token before the §2.05 guard; the terminal set is the five live terminal members; every cron and filter keeps matching legacy rows |
| `tests/runtime/crm-form-dom-roundtrip.test.ts` (16, jsdom + the REAL POST / GET / PATCH / status handlers) | for both entry forms: the page's own Save button and `?id=` boot; the transaction's pipeline walked through the real status API (sale Contract Signed with PurchaseContractDate, rental Lease Signed with the Mallan lease-signed fact — no PurchaseContractDate anywhere on a rental); the projection shows the token `Closed` labelled Sold / Rented on the entry form AND the tools viewer, and a legacy `Sold` / `Rented` row reads identically; the close is refused by name (422 `STATUS_FACT_REQUIRED`, field `CloseDate`) when its facts are cleared, accepted with them, persists the fact into raw_data, and is terminal afterwards |
| `tests/runtime/cotality-boundary.test.ts`, `lib/idx/__tests__/sync-select-covers-runtime.test.ts` | no raw Cotality read outside the boundary (baseline untouched); every keep-list field is actually requested from the provider |
