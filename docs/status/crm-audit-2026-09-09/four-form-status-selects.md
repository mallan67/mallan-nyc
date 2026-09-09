# 1. DEFECTS

## D1 — All four status selects are hardcoded; none consumes `/api/crm/status-options`

| File | Select | Lines |
|---|---|---|
| `public/crm/SALE-FORM-REDESIGN.html` | `#saleStatus` | 584–616 (26 real options + 5 `disabled` separators) |
| `public/crm/SALE-FORM-WITH-TOOLS.html` | `#saleStatus` | 561–593 (byte-identical option set) |
| `public/crm/RENTAL-FORM-REDESIGN.html` | `#rentalStatus` | 516–548 (25 real options) |
| `public/crm/RENTAL-FORM-WITH-TOOLS.html` | `#rentalStatus` | 523–555 (byte-identical option set) |

Full contents (sale, `SALE-FORM-REDESIGN.html:584`):

```html
<select id="saleStatus" class="field-input max-w-md" required onchange="validateStatusChange('sale'); handleSaleComingSoon(); updateSaleStatusFields()" data-mallan-ignore="true" data-mallan-field="_crmWorkflowStatus">
    <option value="Draft" selected>Draft</option>
    <option value="Future">Future</option>
    <option value="ComingSoon">Coming Soon</option>
    <option value="Active">Active</option>
    <option value="BackOnMarket">Back On Market</option>
    <option disabled>── Offer ──</option>
    <option value="OfferOut">Offer Out</option>
    <option value="OfferThruUs">Offer Thru Us</option>
    <option value="OfferAccepted">Offer Accepted</option>
    <option value="OAThruUs">Offer Accepted Thru Us</option>
    <option disabled>── Contract ──</option>
    <option value="ContractOut">Contract Out</option>
    <option value="COThruUs">Contract Out Thru Us</option>
    <option value="ContractSigned">Contract Signed</option>
    <option value="ContractSignedThruUs">Contract Signed Thru Us</option>
    <option value="BoardApproved">Board Approved</option>
    <option disabled>── Closed ──</option>
    <option value="Sold">Sold</option>
    <option value="SoldThruUs">Sold Thru Us</option>
    <option disabled>── Off Market ──</option>
    <option value="Withdrawn">Withdrawn</option>
    <option value="Cancelled">Cancelled</option>
    <option value="PermOffMarket">Perm Off Market</option>
    <option value="TempOffMarket">Temp Off Market</option>
    <option value="Expired">Expired</option>
    <option disabled>── Saved Listing State ──</option>
    <option value="Pending">In Contract</option>
    <option value="Closed" hidden>Sold</option>
    <option value="Canceled" hidden>Canceled</option>
    <option value="Hold">Hold</option>
    <option value="Incomplete">Incomplete</option>
</select>
```

Rental (`RENTAL-FORM-REDESIGN.html:516`) is the same shape: `Draft, Future, Active, BackOnMarket` · `AppOut, AppThruUs, AppAccepted, AppAcceptedThruUs` · `LeaseOut, LeaseOutThruUs, LeaseSigned, LeaseSignedThruUs, BoardApproved` · `Rented, RentedThruUs` · `Withdrawn, Cancelled, PermOffMarket, TempOffMarket, Expired` · `Pending, Closed(hidden), Canceled(hidden), Hold, Incomplete`, with an HTML comment at `:545` recording that `ComingSoon` was removed.

Every other CRM surface already builds itself from the endpoint — `public/crm/js/manage/manage-listings.js:52`, `public/crm/js/dashboard/panels.js:30` and `:9572–9573`, `public/crm/js/dashboard/panels/sales-crm/index.js:74`, `public/crm/js/dashboard/panels/rentals-crm/index.js:103`. The four forms are the only status UIs still carrying their own vocabulary. Drift is not hypothetical — it has already happened (D2–D5).

## D2 — Label divergence: `Cancelled` (two L) is displayed where the server label is `Canceled`

- `SALE-FORM-REDESIGN.html:606` · `SALE-FORM-WITH-TOOLS.html:583` · `RENTAL-FORM-REDESIGN.html:537` · `RENTAL-FORM-WITH-TOOLS.html:544` — `<option value="Cancelled">Cancelled</option>`
- Server: `lib/crm/status-mapping.ts:156` `Cancelled: 'Canceled'` (SALE_DISPLAY_LABELS), `:314` same for RENTAL_DISPLAY_LABELS.

The `value` is correct and must not change (see §Two-L analysis). Only the visible text is wrong. Manage Listings renders the same row as "Canceled" (`manage-listings.js` reads the server label), so the same listing reads "Cancelled" on the form and "Canceled" in the list.

## D3 — Label divergence on two sale workflow words

| Option | Form label | Server label (`lib/crm/status-mapping.ts`) |
|---|---|---|
| `OAThruUs` (`SALE-FORM-REDESIGN.html:594`, `SALE-FORM-WITH-TOOLS.html:571`) | `Offer Accepted Thru Us` | `OA Thru Us` (`:143`) |
| `COThruUs` (`SALE-FORM-REDESIGN.html:597`, `SALE-FORM-WITH-TOOLS.html:574`) | `Contract Out Thru Us` | `CO Thru Us` (`:145`) |

## D4 — Missing rental workflow words: `Leased` / `LeasedThruUs`

`RENTAL_WORKFLOW_STATUSES` includes `'Leased'` and `'LeasedThruUs'` (`lib/crm/status-mapping.ts:254–255`), mapped to `Closed` (`:281–282`) with labels `Leased` / `Leased Thru Us` (`:307–308`). Neither rental select offers them. Consequences:

- An agent cannot set them.
- `public/crm/tests/rental-form-doctor.js:120–125` `VALID_RENTAL_STATUSES` lists `'Leased', 'LeasedThruUs'` but **omits** `Rented`, `RentedThruUs`, `AppAcceptedThruUs`, `LeaseOut`, `LeaseOutThruUs`, `LeaseSigned`, `LeaseSignedThruUs`, `BoardApproved`, `Hold`, `Incomplete`, `Pending`, `Closed`, `Canceled`. So selecting `Rented` — the option the form actually presents at `RENTAL-FORM-REDESIGN.html:535` — makes the doctor **fail MF-05** at `rental-form-doctor.js:302`. Three artifacts, three vocabularies.

## D5 — No `ActiveUnderContract` option in any of the four selects

`ActiveUnderContract` is a canonical status of both transactions (`lib/crm/status-mapping.ts:80, 233`) and the resolved token for `OfferAccepted`/`OAThruUs`/`ContractOut`/`COThruUs` (sale) and `AppAccepted`/`AppAcceptedThruUs`/`LeaseOut`/`LeaseOutThruUs` (rental). When `formStatusForListing` falls back to the canonical (workflow word absent or disagreeing — `status-mapping.ts:557–560`), it returns `{ value: 'ActiveUnderContract', label: 'Active Under Contract' }` and the select has no such option. It only renders because `MallanAPI.renderListingStatus` *fabricates* a missing option at runtime (`public/crm/js/core/api-client.js:913–921`). That fallback is currently masking the drift on read; it does nothing for write.

## D6 — Parallel hardcoded maps that also drift

**a) `STATUS_TRANSITIONS`** — `SALE-FORM-REDESIGN.html:8750–8771`, duplicated verbatim in `SALE-FORM-WITH-TOOLS.html:6283–6304`. Divergences from `SALE_TRANSITIONS` (`lib/crm/status-mapping.ts:181–211`):
- `'ComingSoon': ['Active','Withdrawn','Expired']` — server has `['Active','Withdrawn']` (`:184`); `Expired` is an extra.
- `'Active'` and `'BackOnMarket'` omit `'Cancelled'`, which the server allows (`:185–186`).
- `'Cancelled': ['Draft']` — server has `Cancelled: []`, terminal (`:210`).
- `'Withdrawn'/'Expired'` are present but `'Hold'` and `'Draft'`→`Hold` paths are missing entirely (no `Hold` key at all; server has `Hold: ['Active','Draft']` at `:209`).
- The `SALE-FORM-WITH-TOOLS.html` copy is **dead code**: `validateStatusChange` is an empty stub at `:6274` and nothing else reads `STATUS_TRANSITIONS` (verified: only the definition line matches).
- Neither rental form has a transition table at all — `validateStatusChange` is `// Stub — full validation to be added` (`RENTAL-FORM-REDESIGN.html:4990–4992`, `RENTAL-FORM-WITH-TOOLS.html:5412–5414`).

**b) `SALE_STATUS_FACT_FIELDS`** — two *different* shapes for the same table:
- `SALE-FORM-REDESIGN.html:5973–5988` (`{field, cotality, price, priceCotality}`) — mirrors `SALE_STATUS_FACTS` (`status-mapping.ts:168–179`) + `WORKFLOW_FACTS` (`:383`) correctly, but omits `TempOffMarket`.
- `SALE-FORM-WITH-TOOLS.html:6038–6053` (bare field-id strings) — includes `TempOffMarket: 'saleOffMarketDateField'`. Same concept, two literals.

**c) Rental fact reveal is inconsistent between the two rental files, and both diverge from the server:**
- `RENTAL-FORM-REDESIGN.html:4644` reveals `rentalOffMarketDateField` for `['PermOffMarket','TempOffMarket','Expired','Withdrawn','Cancelled']`. Server facts: `Expired → ExpirationDate`, `Withdrawn → WithdrawnDate`, `Canceled → CancellationDate` (`status-mapping.ts:352–357`) — `OffMarketDate` is none of them.
- `RENTAL-FORM-WITH-TOOLS.html:5085` already corrected this to `['PermOffMarket','TempOffMarket']` only.
- `RENTAL-FORM-REDESIGN.html:4649` reveals the rented controls for `['Rented','RentedThruUs']`; `RENTAL-FORM-WITH-TOOLS.html:5087` uses `['Rented','RentedThruUs','Leased','LeasedThruUs','Closed']`.
- Neither rental form has a `rentalExpirationDate`, `rentalWithdrawnDate` or `rentalBackOnMarketDate` control at all, and the rental submit sends **no facts**: `MallanAPI.listings.updateStatus(dbId, formWorkflowStatus)` with no third argument (`RENTAL-FORM-REDESIGN.html:5987`), vs. the sale form which does pass them (`SALE-FORM-REDESIGN.html:8245`). So `Withdrawn`, `Expired`, `PermOffMarket`, `BackOnMarket` and `Rented`/`RentedThruUs` are offered in the rental select but return **422 STATUS_FACT_REQUIRED** from `app/api/crm/listings/[id]/status/route.ts:126–131` unless the fact is already in `raw_data`.

**d) Required-field / active-status lists** — `REBNY_ACTIVE_STATUSES` (`SALE-FORM-REDESIGN.html:8545`) and the `statusOnly` arrays in `SALE_REQUIRED_FIELDS` (`:8589–8608`, which correctly carry both `'Cancelled','Canceled'` at `:8592`). Rental has `RENTAL_REQUIRED_FIELDS` (`RENTAL-FORM-REDESIGN.html:5088`, `RENTAL-FORM-WITH-TOOLS.html:5501`) with no status-keyed gating.

**e) Test-side vocabularies (also hardcoded, also divergent)** — `public/crm/tests/rental-form-doctor.js:120–125`, `public/crm/tests/sale-form-doctor.js:149–152` (`RESO_STANDARD_STATUSES` contains `'Cancelled'` two-L and `'Coming Soon'` with a space — neither is a live StandardStatus member), `public/crm/tests/19-form-validators-sale.js:47`, `public/crm/tests/22-date-and-listing-validators.js:140`.

---

# 2. THE SERVER ENDPOINT — `app/api/crm/status-options/route.ts` (94 lines, read in full)

**Auth:** `requireAgentOrBroker(req)` at `:55`; `isAuthError` → returns the auth Response (401) at `:56`. Agent **or** broker; no broker-only gate.

**Input:** `?type=` → `transactionTypeOf` (`:58–59`), which accepts `sale` | `rent` | `rental` (`status-mapping.ts:41–45`). Missing/unknown → **400** with `{error: "A transaction is required: type=sale or type=rental"}` (`:61–68`). Fail-closed: never a default mapping.

**`export const dynamic = "force-dynamic"`** (`:27`) — never statically cached.

**Response shape** (`:87–93`):

```jsonc
{
  "transaction": "sale" | "rent",
  "formKey": "saleStatus" | "rentalStatus",
  "workflow": [ { "word", "label", "canonical", "canonicalLabel", "requiredFacts": [] } ],  // ordered as SALE/RENTAL_WORKFLOW_STATUSES
  "canonical": [ { "token", "label", "facts": [] } ],                                       // ordered as SALE/RENTAL_CANONICAL_STATUSES
  "factLabels": { "<Cotality field>": "<agent-facing label>" }
}
```

**Answer to "does it already carry options, labels, facts and transitions?"**

- **Options** — yes, both layers: `workflow[].word` (22 sale / 23 rental) and `canonical[].token` (10 sale / 9 rental).
- **Labels** — yes, three of them per row: `workflow[].label` (the display label), `workflow[].canonicalLabel` and `canonical[].label` (the transaction label — sale `Closed`→"Sold", `Pending`→"In Contract"; rental `Closed`→"Rented", `Pending`→"Pending").
- **Facts** — yes: `workflow[].requiredFacts` (via `requiredFactsFor`, `:77` — includes the workflow-word fact `BackOnMarket → BackOnMarketDate`), `canonical[].facts`, and `factLabels` (`:44–52`, which **omits `PurchaseContractDate` on a rental** by design at `:47`).
- **Transitions** — **NO.** `mapping.transitions` and `mapping.canonicalTransitions` exist on `TransactionStatusMapping` (`status-mapping.ts:399–401`) but the route does not project them. This is the one thing the endpoint cannot supply today.

---

# 3. FULL DIVERGENCE TABLE (form vs. server, all four files)

| # | Kind | Sale forms | Rental forms | Server truth |
|---|---|---|---|---|
| 1 | Missing workflow word | none | `Leased`, `LeasedThruUs` | `status-mapping.ts:254–255` |
| 2 | Missing canonical token | `ActiveUnderContract` | `ActiveUnderContract` | `:80`, `:233` |
| 3 | Label | `OAThruUs` = "Offer Accepted Thru Us" | — | "OA Thru Us" (`:143`) |
| 4 | Label | `COThruUs` = "Contract Out Thru Us" | — | "CO Thru Us" (`:145`) |
| 5 | Label | `Cancelled` = "Cancelled" | `Cancelled` = "Cancelled" | "Canceled" (`:156`, `:314`) |
| 6 | Extra values (canonical tokens offered as workflow choices) | `Pending`, `Closed`(hidden), `Canceled`(hidden), `Incomplete` | same | none are workflow words; they resolve only through `findCanonical` (`:470–480`) |
| 7 | Transitions | 5 divergences + dead copy (D6a) | table absent entirely | `SALE_TRANSITIONS :181`, `RENTAL_TRANSITIONS :340` |
| 8 | Facts | `TempOffMarket` present in one file, absent in the other | `Expired`/`Withdrawn`/`Cancelled` reveal the wrong control in REDESIGN; no facts sent at all | `SALE_STATUS_FACTS :168`, `RENTAL_STATUS_FACTS :348` |

No option in any of the four files carries a value that is neither a workflow word nor a canonical token — the vocabulary is a **subset plus canonical tokens**, never garbage. Note the sale select correctly has **no** rental word and vice versa; the sale-only `ComingSoon` correctly appears only on the sale selects.

---

# 4. TWO-L `Cancelled` — required vs. cosmetic

**REQUIRED (do not touch):** the option **`value="Cancelled"`**. It is the *current* canonical workflow token — a member of `SALE_WORKFLOW_STATUSES` (`status-mapping.ts:105`) and `RENTAL_WORKFLOW_STATUSES` (`:260`), and it is what gets written to `raw_data._crmWorkflowStatus` (`lib/crm/listing-form-mapping.ts:251`) and read back by `findWorkflow` (`status-mapping.ts:453–458`). Changing the value to one L would demote every such row to the canonical-label path on reload. This is *not* legacy compatibility — it is the live contract.

**Separately, legacy read-compat for the two-L spelling exists but lives only on the server**, never in the form: `LEGACY_STORAGE_ALIASES` `Cancelled: 'Canceled'` (`lib/listings/mallan-status.ts:54`) and `LEGACY_SPELLINGS` (`lib/crm/status-mapping.ts:466–467`) for rows whose `listings.status` column was written as `Cancelled`. The forms never need to reproduce it.

**COSMETIC (fix):** the option **text** "Cancelled". Server label is "Canceled" (`:156`, `:314`).

**One coupling to fix in the same PR:** `public/crm/tests/sale-form-doctor.js:497–503` matches `RESO_STANDARD_STATUSES` (which contains `'Cancelled'`, `:151`) against option **labels** by substring. Correcting the label to "Canceled" makes `"Canceled".indexOf("Cancelled") === -1` → RC-05 downgrades to a warn. `sale-form-doctor.js:151` must be corrected to `Canceled` / `ComingSoon` in the same change.

---

# 5. REMEDY ASSESSMENT

**Are these pages "standalone offline-capable"? No — that premise is false, and I verified it:**
- All four load `js/core/api-client.js` (`SALE-FORM-REDESIGN.html:105`, `RENTAL-FORM-REDESIGN.html:88`, `SALE-FORM-WITH-TOOLS.html:129`, `RENTAL-FORM-WITH-TOOLS.html:125`) and call `MallanAPI.init()` → `GET /api/auth/me` at load (`SALE-FORM-REDESIGN.html:112` and `:5024`; `RENTAL-FORM-REDESIGN.html:95` and `:5049`; `SALE-FORM-WITH-TOOLS.html:5476`; `RENTAL-FORM-WITH-TOOLS.html:5437`).
- The two WITH-TOOLS viewers **cannot render at all** without an API call: `MallanAPI.listings.get(VIEWER_LISTING_ID)` on load, with an explicit fail-closed panel on error (`SALE-FORM-WITH-TOOLS.html:4983–4993`, `RENTAL-FORM-WITH-TOOLS.html:4362–4370`).
- `RENTAL-FORM-WITH-TOOLS.html:5445` redirects to `/crm/login.html` when unauthenticated.
- **No service worker is registered by any of the four** (grep for `serviceWorker` / `sw.js` across all four + api-client returns nothing), and `public/crm/sw.js` is a push-notification stub with **no `fetch` handler** — it caches nothing.

So a load-time fetch is not merely viable; it is already the norm on every one of these pages.

**(a) Consume `/api/crm/status-options` at load — RECOMMENDED, and it is the charter-compliant answer.** It removes the vocabulary from the page instead of testing it. Same pattern already proven at `manage-listings.js:46–59`. Requirements:
- The forms are auth-gated already, so the route's `requireAgentOrBroker` adds no new failure mode.
- **Must preserve the selected value across repopulate** (an edit-mode page may already have a value set) and **must run before / feed `MallanAPI.renderListingStatus`**.
- **Must re-run the rental ComingSoon hard block AFTER repopulate** (`RENTAL-FORM-REDESIGN.html:7576–7589`, `RENTAL-FORM-WITH-TOOLS.html:8036–8051`). The rental payload contains no `ComingSoon` (`RENTAL_CANONICAL_STATUSES` has none, `:232`), so the guard is satisfied by construction, but the listener must still be attached to the rebuilt select.
- **Fail-closed on fetch failure:** keep the existing markup as the rendered fallback rather than emptying a `required` select — an empty status select would block every save.
- The optgroup separators (`── Offer ──` etc.) are presentation only; rebuild them from `canonical`/word prefixes or keep a small ordering hint in the page. This is the one genuinely page-owned thing in the block.

**(b) Equivalence ratchet test — REQUIRED REGARDLESS, and it must land first.** Even after (a), the fallback markup, the optgroups, and the parallel maps in D6 can still drift. But a ratchet **alone** is the weaker remedy: it freezes four hand-maintained lists instead of deleting them, and it cannot fix D6c (facts the rental page cannot collect).

**Verdict: do both, in this order — (b) as the failing test, then (a) as the fix, with (b) tightened to assert the fetched payload drives the DOM.** Because these pages are online-only and already fetch at load, there is no offline argument for keeping the hardcoded lists.

---

# 6. FAILING TEST DESIGN

All three tests go in `tests/runtime/` (wired into CI via `jest.config.js` → `<rootDir>/tests/runtime/jest.config.js`). `jsdom@25` is installed and is already required directly from node-environment runtime tests (`tests/runtime/manage-listings-status-presentation.test.ts:33`, `tests/runtime/crm-form-dom-roundtrip.test.ts:31`). `jest-environment-jsdom` is **not** installed — use `require('jsdom')`, not a `@jest-environment` docblock.

> **Explicitly called out:** `tests/runtime/sale-form-save-load-retention.test.ts` is a pure source-grep guard and would be **insufficient** here. None of the tests below assert on source text for the defect itself; each drives real code and asserts on a real result.

### T1 — `four-listing-forms-status-select-equivalence.test.ts` (the ratchet; fails today)

**Drives:** the real route handler `GET` from `app/api/crm/status-options/route.ts` (auth mocked exactly as `crm-status-options-route.test.ts:12–17` does), **and** the four real pages booted in jsdom with `runScripts: 'dangerously'` via the `loadPage()` harness pattern from `crm-form-dom-roundtrip.test.ts:157–195` (`LocalOnly` ResourceLoader so `js/core/api-client.js` really loads; `window.fetch` stubbed to answer `/api/auth/me`).

**Asserts on the rendered DOM, not the file text:** read `dom.window.document.getElementById('saleStatus'|'rentalStatus').options` after `load`, drop `disabled` separators, and compare against the handler's JSON body:

1. `renderedValues ⊇ body.workflow.map(w => w.word)` — **fails today** on both rental pages (`Leased`, `LeasedThruUs`).
2. For every rendered option whose value is a `workflow[].word`, `option.textContent.trim() === workflow[].label` — **fails today** 3× on each sale page (`OAThruUs`, `COThruUs`, `Cancelled`) and 1× on each rental page (`Cancelled`).
3. For every rendered option whose value is a `canonical[].token` and not a workflow word, `option.textContent.trim() === canonical[].label` — passes today (`Pending`/`Closed`/`Canceled`/`Incomplete` happen to be right); locks them.
4. `renderedValues` contains **no** value that is neither a `word` nor a `token` — passes today; ratchets.
5. `renderedValues ⊇ body.canonical.map(c => c.token)` — **fails today** on all four (`ActiveUnderContract`).
6. Cross-transaction leakage: the sale page's rendered values contain no rental word and vice versa (`LeaseSigned`, `AppOut`, `Rented` absent from sale; `ContractSigned`, `Sold`, `ComingSoon` absent from rental) — passes today; ratchets, and pins the rental ComingSoon prohibition to a *rendered* fact rather than an HTML comment.

Assertion 2 is the exact two-L defect, asserted on `option.textContent` in a live DOM.

### T2 — `listing-forms-status-select-server-sourced.test.ts` (proves the fix, fails today)

**Drives:** the same four pages in jsdom, but with `window.fetch` routed to the **real** `GET` of `app/api/crm/status-options/route.ts`, returning a payload the test has **mutated** — one extra workflow row appended (`{word:'ProbeWord', label:'Probe Word', canonical:'Active', canonicalLabel:'Active', requiredFacts:[]}`) and one label changed (`Cancelled → 'CANCELED-PROBE'`).

**Asserts on the rendered result after load settles:**
- `document.getElementById('saleStatus').querySelector('[value="ProbeWord"]')` is non-null.
- the `[value="Cancelled"]` option's `textContent` is `'CANCELED-PROBE'`.
- the request the page made was recorded, and its URL is `/api/crm/status-options?type=sale` (resp. `type=rental`) — i.e. each page asks for **its own** transaction, never a shared list.
- rental only: after repopulate, no option with value `ComingSoon` survives, and dispatching a `change` with `value='ComingSoon'` still reverts (proves the hard block at `RENTAL-FORM-REDESIGN.html:7576` is re-armed on the rebuilt select).
- fail-closed: with `fetch` rejecting, `#saleStatus.options.length > 0` and `[value="Active"]` still exists (the select is never emptied).

**Fails today** for a clean structural reason: no page issues that request, so nothing is injected. Pure grep could not distinguish "the page fetched and applied" from "the string is in the file"; this drives it.

### T3 — `listing-forms-status-write-roundtrip.test.ts` (behavioral, fails today on rental)

**Drives:** the `crm-form-dom-roundtrip.test.ts` `liveApi` harness (`:132–150`) — the page's own `fetch` routed to the **real** `POST /api/crm/listings`, `PATCH /api/crm/listings/[id]`, `PATCH /api/crm/listings/[id]/status`, over the in-memory Prisma mock (`:37–74`), with `requireAgentOrBroker` mocked to `role: 'BROKER'`.

**Interaction:** boot `RENTAL-FORM-REDESIGN.html`, set `#rentalStatus.value = 'Leased'`, dispatch `change`, run the page's own submit path.

**Asserts on the recorded request and the resulting store row:**
- the `PATCH .../status` body is `{ status: 'Leased' }` and the response is 200,
- the stored `listings.status` is `'Closed'` and `raw_data._crmWorkflowStatus === 'Leased'`,
- `formStatusForListing(storedRow).label === 'Leased'` on reload.

**Fails today** at the very first step: `#rentalStatus.value = 'Leased'` is a no-op on a select with no such option, so `value` stays `'Draft'` and the status PATCH is never issued (`RENTAL-FORM-REDESIGN.html:5985` skips `Draft`). The assertion on the returned record — not on source text — is what fails.

**Companion (same file), the two-L consequence made behavioral:** set `#rentalStatus.value = 'Cancelled'`, dispatch `change`, and assert the **rendered** confirmation/badge text the agent sees (`#rentalStatusBadge`, `RENTAL-FORM-REDESIGN.html:6004`) reads `Canceled`, matching what `statusPresentation` will show in Manage Listings for the same row. Fails today wherever the page echoes its own option label.

---

# 7. FILE OWNERSHIP

**Must change (the fix):**
1. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\SALE-FORM-REDESIGN.html` — select `584–616`; `SALE_STATUS_FACT_FIELDS` `5973–5988`; `STATUS_TRANSITIONS` `8750–8771`; `REBNY_ACTIVE_STATUSES` `8545`.
2. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\RENTAL-FORM-REDESIGN.html` — select `516–548`; `updateRentalStatusFields` `4634–4650`; the fact-less `updateStatus` call `5987`; ComingSoon guard `7576–7589`.
3. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\SALE-FORM-WITH-TOOLS.html` — select `561–593`; `SALE_STATUS_FACT_FIELDS` `6038–6053`; **delete** the dead `STATUS_TRANSITIONS` `6283–6304`.
4. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\RENTAL-FORM-WITH-TOOLS.html` — select `523–555`; `updateRentalStatusFields` `5071–5090`; ComingSoon guard `8036–8051`.

**Must change (the coupled test artifacts, same PR):**
5. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\tests\sale-form-doctor.js` — `RESO_STANDARD_STATUSES` `149–152` (`Cancelled` → `Canceled`, `'Coming Soon'` → `ComingSoon`); RC-05 matcher `491–511`.
6. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\tests\rental-form-doctor.js` — `VALID_RENTAL_STATUSES` `120–125`; MF-05 `295–305`.
7. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\tests\19-form-validators-sale.js` — transition literal `47`.
8. `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\tests\22-date-and-listing-validators.js` — transition literal `140`.

**New test files:**
9. `C:\Users\MayaAllan\Desktop\mallan-nyc\tests\runtime\four-listing-forms-status-select-equivalence.test.ts`
10. `C:\Users\MayaAllan\Desktop\mallan-nyc\tests\runtime\listing-forms-status-select-server-sourced.test.ts`
11. `C:\Users\MayaAllan\Desktop\mallan-nyc\tests\runtime\listing-forms-status-write-roundtrip.test.ts`

**Read-only inputs — must NOT be edited:**
- `C:\Users\MayaAllan\Desktop\mallan-nyc\lib\crm\status-mapping.ts` (the authority; the forms move toward it, never it toward them)
- `C:\Users\MayaAllan\Desktop\mallan-nyc\app\api\crm\status-options\route.ts` (unless transitions are added — see below)
- `C:\Users\MayaAllan\Desktop\mallan-nyc\public\crm\index-built.html` (generated by `public/crm/build.js`; regenerate with `npm run crm:build`, never hand-edit — it is untouched by this surface anyway)

**Requires a separate decision (out of scope for this fix, flagged):** if the sale form's `STATUS_TRANSITIONS` is to be server-sourced rather than deleted, `app/api/crm/status-options/route.ts` must project `mapping.transitions` / `mapping.canonicalTransitions` (`lib/crm/status-mapping.ts:399–401`), which today it does not. That is an API-shape change to a compliance-adjacent route and should be a distinct PR with its own route test.

**Validation to run (per CLAUDE.md §G):** `npm run type-check`, `npm run compliance-check`, `npm run ucba:audit` (REGRESSIONS must be 0 — the rental ComingSoon prohibition is UCBA Art. I §16 / RLS 2.05(d) and is touched here), `npm run idx:validate`, `npm run crm:test` (172-smoke — the doctors above are in it), plus the three new runtime tests. Note per §J.8: these prove the static/DOM contract against the committed server mapping; **none of them proves any StandardStatus member is live on Cotality** — that remains `lib/cotality/generated/contract.ts` + a live probe.