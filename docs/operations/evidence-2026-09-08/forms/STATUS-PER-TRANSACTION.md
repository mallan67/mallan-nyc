# Status — one mapping per transaction · CMA transaction separation · the real Save / load paths (2026-09-08, evening)

> **Superseded (2026-09-08 evening) on the STORED vocabulary:** the owner ruled that every stored status is a live Cotality StandardStatus token (Closed, Canceled with one L, Incomplete …) with Sold / Rented / In Contract applied as transaction LABELS, and that each status carries its associated Cotality date. The per-transaction mapping principle below stands; the Mallan words it stored do not. See `../status/STATUS-PROVIDER-TOKENS.md`.

Owner ruling (Maya): **"rental and sale has to have each their own mapping"** — not one shared mapping with regex /
type guards. This note records what was wrong, what changed, and what each proof proves. Nothing was pushed;
no schema, env, Neon, R2, cron or workflow file changed; no production write.

## 1. Root causes

| # | Root cause | Where | Fix |
|---|---|---|---|
| 1 | One shared CRM workflow vocabulary (`CRM_WORKFLOW_STATUSES`) served both forms; the in-flight code layered a regex guard (`/^(App\|Lease\|…)/`) on top to keep rental words off sales. A guard over a shared list is not a per-transaction mapping. | `lib/crm/status-mapping.ts` | Two mappings — `SALE_STATUS_MAPPING` (`SALE_WORKFLOW_STATUSES`, `SALE_CANONICAL_STATUSES`, its own workflow→canonical map, labels, workflow transitions, canonical transitions, saved-state aliases, close = Sold) and `RENTAL_STATUS_MAPPING` (`RENTAL_WORKFLOW_STATUSES`, `RENTAL_CANONICAL_STATUSES`, …, no ComingSoon, close = Rented). Every function takes the listing type and resolves through that mapping only; the other transaction's words are unknown, not guarded. No shared list is exported. |
| 2 | The status API held its own canonical transition table with `Pending → [Sold, Rented, …]` for every listing — a sale could be "Rented". | `app/api/crm/listings/[id]/status/route.ts` | The route holds no table; `allowedCanonicalTransitions(current, listing.listing_type)` answers from the listing's mapping (sale Pending → Sold; rental Pending → Rented; rental Draft never → ComingSoon). |
| 3 | `canonicalStatusFromForm(input)` resolved with no transaction. | `lib/crm/listing-form-mapping.ts` | `canonicalStatusFromForm(input, formType)` = the listing's mapping. The write path (`applyServerFormMapping`) refuses a rental word under `saleStatus` and a sale word under `rentalStatus` (test). |
| 4 | The rental entry form's Save never submitted the selected status: the create route always stores `Draft` (`STATUS_INITIAL`) and the update route never changes the status column; only the sale form called the status API afterwards. A rental listing could not leave Draft from its own form. | `public/crm/RENTAL-FORM-REDESIGN.html` `submitRentalListing` | After create / update the page submits the selected rental workflow word to the status API exactly as the sale form does (Draft / Future / Incomplete stay where create left them). The SERVER resolves it through the rental mapping. Proven through the page's own Save button (§3). |
| 5 | CMA windowed closed comps with `raw_data: { path: ['CloseDate'], string_gte, string_lte }` — not Prisma operators (TS2353). | `lib/cma/engine.ts` | Prisma's JSON path ordered comparisons `gte` / `lt` on the ISO day (the provider's `Edm.Date` shape, `CloseDate` populated on 578,417 closed rows per the live contract); the day after as-of is the exclusive upper bound; the window is re-verified in memory by `compEligibility` on the parsed `CloseDate`. `terminal_since` is never a closing date. |
| 6 | Two script-scoped test files declared a global `Row` / `store` that another script-scoped test also declared (one tsc program → duplicate identifier). | `lib/idx/__tests__/backfill-eligibility.test.ts`, `tests/runtime/building-manifest-warm-behavior.test.ts` | A trailing `export {}` makes each a module. Nothing else changed. |
| 7 | The form projection dropped the agent's saved-state spelling (`Incomplete` reloaded as `Draft`) — surfaced by the real edit-load path. | `formStatusForListing` | A saved-state word (`Closed` / `Canceled` / `Incomplete`) is kept as the agent chose it, labelled as the form labels it, when it agrees with the stored state. |
| 8 | Two architecture ratchets were red on the in-flight tree: the CMA engine imported the canonical status package directly (A1: only `lib/comps/fetch-comps.ts` and the two Search executor files may), and three new raw Cotality reads sat outside the declared boundary (`lib/cma/engine.ts::CloseDate`, `::ClosePrice`, `lib/crm/status-mapping.ts::StandardStatus`). | `lib/cma/engine.ts`, `lib/crm/status-mapping.ts`, `lib/comps/fetch-comps.ts`, `lib/listings/canonical-lifecycle.ts` | The lifecycle boundary now carries `closePrice` (a positive `ClosePrice` on a closed row only) and `providerStatus` (the retained `StandardStatus`, verbatim; null on a Mallan-authored row); the CMA engine and the status projection read those facts, never the raw keys. The comp-eligibility authority is consumed through its designated consumer: `isEligibleComp` / `applyCompEligibility` in `fetch-comps.ts`, which now take the subject transaction (`sale` \| `rental`, default sale) so a rental CMA windows `closed_rented` closings. The baseline was NOT regenerated: 0 new raw reads. |

The provider's raw `StandardStatus` / `MlsStatus` are untouched: a synced row keeps its raw provider status in
`raw_data`, the forms show it read-only ("Last Cotality Status"), and no mapping defines a provider semantic. The
only provider-shaped word a mapping accepts is the form's own hidden saved-state option `Closed`, resolved to that
transaction's Mallan close.

## 2. CMA separation, end to end

- `findComps` requires the subject transaction (`sale` | `rent`); `where.listing_type` pins it; a wrong-type row is
  dropped again after the query; the route answers 400 for any other type and 422 `INSUFFICIENT_VALUATION_COMPS`
  when no verified closed comp exists (`app/api/crm/cma/route.ts`).
- Provider comps carry `PropertyType eq '<subject PropertyType>'` and throw without one (`lib/comps/fetch-comps.ts`);
  "Under Contract" / "In Contract" use the canonical search Pending query.
- Closed valuation = verified `CloseDate` (window) + `ClosePrice > 0`; an active asking price is context only and
  never enters `estimateValue`; an unpriced or undated closing is excluded.
- Proof: `tests/runtime/comps-close-date-window.test.ts` (source ratchet on the operators + a mocked-Prisma run per
  transaction: comps `['ASKING','CLOSED']`, `adjusted_price` = `ClosePrice`, `estimateValue` = `ClosePrice`,
  `where.listing_type`, the historical clause carries `path: ['CloseDate']`, `gte` an ISO day, `lt` after today, no
  `string_gte`, no `lte`, no `idx_display_yn`).

## 3. Proofs

| Suite | What it proves | What it does not prove |
|---|---|---|
| `tests/runtime/crm-status-mapping.test.ts` (72) | Two mappings; sale rejects every rental-only word and vice versa; no regex over a shared list; per-transaction normalization, labels, workflow + canonical transitions, payloads, projection (Closed → Sold / Rented; sale Pending → "In Contract"; saved-state spellings kept; Off Market; unavailable never invented) | — |
| `lib/crm/__tests__/listing-form-mapping.test.ts` | the write path emits only Mallan keys for every word of both vocabularies under both form keys; every sale / rental word saves through its own form; the other transaction's word is refused | — |
| `tests/runtime/crm-form-dom-roundtrip.test.ts` (16, jsdom + the REAL POST / GET / PATCH / status handlers, RLS gate live) | for BOTH entry forms: the page's OWN Save button → `MallanAPI.listings.create` → 201 and edit mode; the `?id=` boot → `MallanAPI.listings.get` → the page's own loader, nothing typed is lost, the status select shows the server projection; Save in edit mode walks the transaction's own pipeline (Active, then ContractSigned / LeaseSigned) through the real PATCH + status API — stored Pending, reloaded by the transaction's label on the entry form AND the tools viewer booted the way the CRM opens it; the status API refuses the other transaction's words (400 `form_mapping`), accepts the transaction's close (Sold / Rented) and is terminal after | the Postgres boundary (in-memory store); the browser's own transition warning table |
| `lib/compliance/__tests__/dom-clocks.test.ts` (32) | the two clocks separately: Coming Soon duration day by day (0 → 7 → 15, the 14-day flag) with the market clock at zero; once Active the Coming Soon clock is gone and the market clock starts at the First Showing Date; market DOM until SOLD (stops at `PurchaseContractDate`, never the closing, never grows after), until RENTED (`PurchaseContractDate`, else the Leased date), until OFF MARKET (the day the row left the feed, sale and rental); the clocks never share a day | — |
| `tests/runtime/provider-authority-census.test.ts`, `provider-status-domain-census.test.ts` | the status route resolves through the listing's transaction; the write path never emits a provider-named status for any word of either vocabulary | — |
| `lib/listings/__tests__/canonical-lifecycle.test.ts` (+3), `lib/search/__tests__/canonical-a1-contract.test.ts`, `tests/runtime/cotality-boundary.test.ts` | the close price and provider status are boundary facts (closed rows only / verbatim / null for Mallan rows); the canonical package has exactly its three importers; no raw Cotality read exists outside the boundary beyond the committed baseline | — |

Validators after everything: `npx tsc --noEmit` 0 errors (plain mode — the mode that surfaced all three errors) ·
`rls:validate` 0 errors / 53 advisories · `validate:form-rls` PASS · `compliance-check` 95 / 0 · `ucba:audit` 46 / 0 / 0
regressions · `idx:validate` 0 critical · guardrails PASS · `crm:build` + `crm:test` 37 / 37. None of them queries
the live feed.

## 4. Residuals (recorded, not hidden)

1. The Prisma JSON `gte` / `lt` clause is typed against the generated client and exercised with a mocked Prisma; the
   generated Postgres SQL was not executed here (no database in this session). The in-memory `compEligibility`
   check is the correctness authority for the window either way.
2. The rental entry form's browser-side `validateStatusChange` is still a stub (the sale form has a sale-only
   warning table); the server's rental state machine is the authority and is proven above.
3. `manage-listings.js` / `portals.js` keep their own display status maps (the register's
   `status-vocabularies-multiplied`, unchanged in this unit).
