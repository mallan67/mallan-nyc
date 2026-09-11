> **STATUS HEADER (added 2026-09-10) — findings preserved; the fix plan below has already been executed.** This is the dated read-only audit of 2026-09-09. Its §2 FIX PLAN (F1–F11) and §3 FAILING TEST DESIGN (T1–T4) were carried out on 2026-09-09/10: `public/crm/js/core/status-presentation.js` now exists as the single browser status-presentation authority (registered as the first Core script in `public/crm/index.html`, line 90), the Refine panel renders from the per-transaction `statusChoices` contract, and `tests/runtime/crm-refine-panel-status-contract.test.ts` (15/15) and `tests/runtime/crm-status-presentation-helper.test.ts` (47/47) are green (re-run 2026-09-10). What changed and what remains is recorded in `docs/status/crm-audit-2026-09-09/repair/status-authority.md` and `.../repair/search-cma-nav.md`; F11 (`js/output/report-package.js` wired or deleted) is still open — re-confirmed 2026-09-10, the file exists and is still not registered in `index.html` — and needs Maya. **Do not re-execute the plan from this file — read those repair reports first.** Terminology note: where this audit says "the CRM" (for example §D3, "the only status control in the CRM") it means what is now the **Backend Agent Search / Listings** application — `public/crm/index.html` → generated `index-built.html`, served at **`/crm/search`**. The Brokerage CRM is `public/crm/dashboard.html` + `js/dashboard/**`, served at `/crm`. See `CLAUDE.md` §A.0 and Master Plan §5.1. The wording is left as written, for provenance.

I have the complete picture. Here is the report.

---

# 1. DEFECTS

## D1 — The Refine panel emits invented tokens; every one is refused, so Refine is 100% dead and it BRICKS the results page

**`public/crm/js/search/search-engine.js:1637-1643`** (`applyRefinedSearch`)
```js
var statuses = [];
if (document.getElementById('refineStatusActive') && ….checked) statuses.push('ACTIVE');
if (document.getElementById('refineStatusComingSoon') && ….checked) statuses.push('COMING_SOON');
if (document.getElementById('refineStatusPending') && ….checked) statuses.push('PENDING');
if (document.getElementById('refineStatusContract') && ….checked) { statuses.push('CONTRACT'); statuses.push('UNDER_CONTRACT'); }
if (document.getElementById('refineStatusClosed') && ….checked) statuses.push('CLOSED');
if (statuses.length > 0) c.statuses = statuses; else delete c.statuses;
```
Why it is wrong — end to end, each link confirmed:
- `search-engine.js:343` — `serializeSearchCriteria` tests `STATUS[s]` where `STATUS = _contractTokens('StandardStatus')` (`:311`, `:302-307`) is an **exact-token** set from the served contract: `Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn` (`lib/search/canonical/live-truth.ts:37-40`). `'ACTIVE'`, `'COMING_SOON'`, `'PENDING'`, `'CLOSED'`, `'CONTRACT'`, `'UNDER_CONTRACT'` all miss → `refuse('Status "…"')` for **all five checkboxes**.
- `search-engine.js:393-395` — `_serverSearch` sees `ser.refused.length > 0`, fires `showToast('Not executable in this Search: …')` and `return`s. **No request is ever made.** "Update Results" does nothing but toast.
- `CONTRACT` / `UNDER_CONTRACT` are not Cotality StandardStatus members at all — even server-side `resolveMember`+`norm` (`lib/search/engine/criteria.ts:143-145, 151-155`) cannot resolve them (`'undercontract'` ≠ `'activeundercontract'`), so they would be a hard `INVALID_CRITERION` too. `ACTIVE`/`PENDING`/`CLOSED`/`COMING_SOON` *would* norm-resolve server-side — the browser refuses them first.

**Escalation (this is the severe part):** `search-engine.js:1646` sets `activeSearchCriteria = c` **before** the refusal, and `:1690` calls `saveLastSearchCriteria()` **after** it.
- `search-engine.js:491` (`goToServerPage`) and `:497` (`reissueServerSearch`) both re-issue `_serverSearch(activeSearchCriteria)` → every subsequent page click, per-page change and sort change is now refused too. One Refine click bricks the whole results page until a fresh full search.
- `search-actions.js:111-119` persists the poisoned criteria to `localStorage`; `search-actions.js:147-148` (`recallLastSearch`) replays it into `_serverSearch` → **the brick survives reload**.
- `search-engine.js:1717-1723` (`clearRefinePanel`, the "Reset" button, markup `search-form-and-results.html:6617`) and `:1610-1618` (`removeRefineFilter`, the pill ✕) both end in `applyRefinedSearch()` → Reset and pill-removal are equally dead.

## D2 — `populateRefinePanel` reads the same invented tokens, so the panel always misreports the live search

**`public/crm/js/search/search-engine.js:1514-1525`**
```js
var statuses = c.statuses || ['ACTIVE'];
el = document.getElementById('refineStatusActive');   if (el) el.checked = statuses.indexOf('ACTIVE') !== -1;
…
el = document.getElementById('refineStatusContract'); if (el) el.checked = statuses.indexOf('CONTRACT') !== -1 || statuses.indexOf('UNDER_CONTRACT') !== -1;
```
`activeSearchCriteria.statuses` is filled by the contract-driven main panels at `search-engine.js:877-885` with **exact Cotality tokens** (`'Active'`, `'ComingSoon'`, `'Pending'`…). `indexOf('ACTIVE')` on `['Active']` is `-1`. So opening Refine on a live Active search shows **every box unchecked** — it tells the agent the opposite of what the executor ran.

## D3 — The Refine panel is transaction-blind: it offers Coming Soon and sale-contract terminology on a rental search

**`public/crm/html/search-form-and-results.html:6715-6738`** — one hard-coded block, five labels: `Active`, `Coming Soon`, `Offer/Pending`, `Contract`, `Closed`. It renders identically for rentals even though `search-form-and-results.html:6614` (`#refineSearchType`) is flipped to "Rentals" by `search-engine.js:1495-1500`.
Violations of the standing authority (`lib/search/engine/contract.ts:77-88`, `lib/crm/status-mapping.ts:160-170, 320-328`):
- **Coming Soon is sales-only** (UCBA Art. I §16; `RENTAL_CANONICAL_STATUSES` at `status-mapping.ts:236-238` has no `ComingSoon`) — the rental Refine offers it.
- **"Contract"** is not a status; sale `Pending` must read **"In Contract"**, rental `Pending` reads **"Pending"**.
- **"Closed"** must read **"Sold"** on a sale and **"Rented"** on a rental.
- **"Offer/Pending"** — "Offer" is a Mallan *workflow* word. Workflow controls were removed from Search on 2026-09-09 (`search-engine.js:271-278`; ratchet at `js/init/init-disable-dead-controls.js:99-109`). The Refine panel is the one place a workflow word survived, and `init-disable-dead-controls.js` cannot catch it because it keys on `input[data-sub-status]`, which the Refine markup does not carry.
- The four main panels are contract-driven mounts (`data-status-mount`, `search-engine.js:280-296`). **The Refine panel is the only status control in the CRM that is not.**

## D4 — `syncRefineToMainForm` never syncs status, so Refine and the main form permanently disagree

**`public/crm/js/search/search-engine.js:1693-1707`** — syncs price/beds/baths only. The comment at `:1648` claims "so 'Full Search' stays consistent". Status is silently dropped, so the main contract panels keep showing whatever the agent picked there while Refine shows something else.

## D5 — The DTO mapper invents an uppercase presentation vocabulary that is not the Cotality status, collapses two distinct statuses, and mis-spells Canceled

**`lib/search/crm-idx-mapper.ts:180-216`**
```js
const statusMap = {
  Active: "ACTIVE", ComingSoon: "COMING_SOON",
  ActiveUnderContract: "PENDING",  "Active Under Contract": "PENDING",
  Pending: "PENDING", Closed: "CLOSED", Expired: "EXPIRED", Withdrawn: "WITHDRAWN",
  Hold: "HOLD", Incomplete: "INCOMPLETE",
  Canceled: "CANCELLED", Cancelled: "CANCELLED",
  Draft:"DRAFT", Sold:"SOLD", Rented:"RENTED", Leased:"RENTED", Delete:"DELETED",
  "Off Market":"OFF_MARKET", … };
const status = statusMap[mlsStatus] || "UNKNOWN";
```
This is the origin of every browser defect below.
- **`ActiveUnderContract → "PENDING"` (`:183-184`) is a data loss.** They are two distinct live members. A row still accepting backup offers is presented as identical to Pending in grid, gallery, detail, print, email and reports. The agent cannot tell them apart anywhere in the browser.
- **`Canceled → "CANCELLED"` (`:192`)** manufactures the two-L spelling the whole project bans. The provider token is `Canceled`.
- Every output is a **Mallan-invented uppercase word**, not the Cotality token, so no browser consumer can look up a per-transaction label from `status-mapping.ts` / the contract without a reverse map.
- The DTO carries **no transaction-aware label**: `mapTrestleToCrmListing` returns `status` + `mlsStatus` (`:278-279`) and `listingCategory` (`:327`) but no `status_label`. Compare `app/api/crm/listings` which already ships `status_presentation` from `statusPresentation()` (`lib/crm/status-mapping.ts:566-598`).

## D6 — Consequence of D5: two-L `CANCELLED` breaks the REBNY off-market photo restriction

**`public/crm/js/output/reports.js:674-676`**
```js
var OFF_MARKET_STATUSES = { 'CLOSED':1, 'WITHDRAWN':1, 'HOLD':1, 'CANCELED':1, 'EXPIRED':1 };
function isOffMarket(l) { return OFF_MARKET_STATUSES[(l.status||'').toUpperCase()] === 1; }
```
The mapper delivers `'CANCELLED'`; the key is `'CANCELED'`. `isOffMarket` returns **false** for every canceled listing → `getListingPhotos` (`reports.js:677-682`) returns the **full photo set** instead of the primary photo only. Same bug, three more times: **`reports.js:2513-2515`** (`offMkt` inline map), **`report-package.js:117-120`** (`_isOffMarket`). This is the REBNY RLS off-market photo rule failing open on a real status.

## D7 — Consequence of D5: two-L `CANCELLED` (and 5 other real tokens) make the browser compliance suite FAIL deterministically

**`public/crm/js/compliance/compliance-gates-and-output.js:2440`** (SRC-02) and **`:2922`** (RESO3) validate `l.status` against lists containing `'CANCELED'` but **not** `'CANCELLED'`, and containing none of `'UNKNOWN'`, `'OFF_MARKET'`, `'DRAFT'`, `'SOLD'`, `'RENTED'`, `'DELETED'` — all of which `crm-idx-mapper.ts:180-216` can emit. Search the contract's own `Canceled` choice and SRC-02 + RESO3 both report FAIL on correct data.

## D8 — The DOM clock never stops on Canceled / Expired / Hold

**`public/crm/js/render/shared-badges.js:159-165`**
```js
var CLOCK_STOPPED = ['Closed','Canceled','Cancelled','Expired','Delete','CLOSED','Sold','Rented','Leased'];
var CLOCK_PAUSED  = ['Hold','Withdrawn','WITHDRAWN'];
```
The rows the browser actually receives are `'CANCELLED'`, `'EXPIRED'`, `'DELETED'`, `'HOLD'` — none of which appear. Only `'CLOSED'` and `'WITHDRAWN'` match. So `domDisplay()` renders a **still-accruing green/red DOM count** on canceled, expired, deleted and hold listings instead of `(final)` / `(paused)`.

## D9 — `ACTIVE_UNDER_CONTRACT` map-pin branch is unreachable dead code

**`public/crm/js/render/results-map.js:119-120`**
```js
if (status === 'COMING_SOON') bg = '#d97706';
else if (status === 'ACTIVE_UNDER_CONTRACT') bg = '#7c3aed';
```
No mapper path produces `'ACTIVE_UNDER_CONTRACT'` (D5 collapses it to `'PENDING'`). The AUC pin colour can never render.

## D10 — The agent-inquiry email labels a RENTAL's Pending as "In Contract" and mis-spells Canceled, to another brokerage

**`public/crm/js/search/pagination.js:1236-1239`**
```js
var status = listing.status || 'ACTIVE';
var statusLabel = status === 'COMING_SOON' ? 'Coming Soon'
    : status === 'PENDING' ? 'In Contract'
    : status.charAt(0) + status.slice(1).toLowerCase();
```
`isSale` is computed four lines above at `:1229` and **not used here**. Results: rental Pending → "In Contract" (wrong transaction); `CLOSED` → "Closed" (should be Sold / Rented); `CANCELLED` → "Cancelled" (two L); `OFF_MARKET` → "Off_market". `|| 'ACTIVE'` also advertises an unknown-status row as live inventory in an outbound email.

## D11 — Renderers invent `ACTIVE` for a status-less row, and one of them mutates the shared record

**`public/crm/js/render/render-grid.js:41`** — `if (!listing.status) listing.status = 'ACTIVE';` **writes** the invented status onto the shared `listings` object, so it then leaks into gallery, detail, print, email and reports.
**`public/crm/js/output/report-package.js:88, 104`** — `s = (s || 'Active').toUpperCase()` in both `_statusColor` and `_statusBadge`.
**`public/crm/js/output/reports.js:2100-2101`** — `(l.status || 'ACTIVE')` and `statusColors[l.status] || statusColors['ACTIVE']` (email builder).
**`public/crm/js/output/reports.js:671, 896`** (report-package) / **`reports.js:1731`** — `(l.status||'ACTIVE')` printed into the hero badge.
`reports.js:652-657` already fixed this correctly ("A blank / unknown status is NEVER rendered as Active … Maya, 2026-09-09"). Five other sites did not get the fix.

## D12 — `reports.js` reads a `status_label` the server never sends

**`public/crm/js/output/reports.js:661`** — `var label = (listing && listing.status_label ? String(listing.status_label) : s)…`. `status_label` appears **nowhere** in `lib/search/crm-idx-mapper.ts`, `lib/search/engine/*.ts` or `app/api/idx/search/route.ts`. The one transaction-aware hook in the whole browser output layer is permanently dead; it always falls through to the raw uppercase token.

## D13 — The status compliance validator inspects an attribute nothing emits

**`compliance-gates-and-output.js:1198`** (`test3_Status`) and **`:1566`** (W2) query `[data-reso-field="MlsStatus"]`. Every renderer emits `data-reso-field="StandardStatus"` via `resoData('status', …)` (`reso-field-map.js:55`, used at `grid-column-defs.js:13`, `render-gallery.js:45`, `render-summary.js:50`). The only element still carrying `MlsStatus` is the gallery Coming Soon badge (`render-gallery.js:10`). So the status-accuracy validator checks **one badge** and is blind to every grid/summary/detail badge — it cannot catch `CANCELLED`, `UNKNOWN` or `OFF_MARKET`.
Also `grid-column-defs.js:13` declares the STATUS column's `reso: 'MlsStatus'` — a field that is not filterable on this feed and must never be named.

## D14 — There is NO shared browser-side status presentation helper (complete inventory)

`getStatusBadgeClasses` (`public/crm/js/core/reso-field-map.js:174-183`) is the only shared thing, and it is **classes only, no label, no transaction, and itself token-blind** (`case 'COMING_SOON': case 'ComingSoon'` but nothing for `CANCELLED`, `EXPIRED`, `HOLD`, `UNKNOWN`, `OFF_MARKET` → all fall to grey default).

Every label/colour decision is re-implemented locally. **Complete display-site inventory:**

| # | Site | file:line | Transaction-aware? |
|---|---|---|---|
| 1 | Grid STATUS column | `js/render/grid-column-defs.js:13` | No |
| 2 | Grid row default-invent | `js/render/render-grid.js:41` | No |
| 3 | Gallery card badge | `js/render/render-gallery.js:4-6, 45` | No |
| 4 | Gallery Coming Soon overlay | `js/render/render-gallery.js:10` | No |
| 5 | Summary card badge | `js/render/render-summary.js:6-8, 50` | No |
| 6 | Short-summary badge | `js/render/render-short-summary.js:6, 28` | No |
| 7 | Master-detail list badge | `js/render/render-master-detail.js:26` | No |
| 8 | Master-detail header badge | `js/render/render-master-detail.js:84` | No |
| 9 | Master-detail facts badge | `js/render/render-master-detail.js:153` | No |
| 10 | Map pin colour | `js/render/results-map.js:119-120` | No |
| 11 | Coming Soon badges / notice / `isComingSoon` | `js/render/shared-badges.js:30-56, 85-106` | Sales-only rule not enforced |
| 12 | DOM clock badge | `js/render/shared-badges.js:153-183` | No |
| 13 | Detail drawer status bar | `js/search/pagination.js:97, 116, 201` | `isSale` computed at `:98`, unused |
| 14 | Detail drawer facts column | `js/search/pagination.js:330` | No |
| 15 | Detail mini-cards | `js/search/pagination.js:1067, 1073` | No |
| 16 | Agent-inquiry email body | `js/search/pagination.js:1236-1239, 1259` | `isSale` at `:1229`, unused |
| 17 | Print listing sheet | `js/search/pagination.js:1633, 1699, 1703` | `isSale` at `:1631`, unused |
| 18 | Compliance listing sheet | `js/compliance/compliance-gates-and-output.js:109-115, 145` | No |
| 19 | Compliance Coming Soon gate | `js/compliance/compliance-gates-and-output.js:61` | No (sales-only not enforced) |
| 20 | Compliance Closed-24h gate | `js/compliance/compliance-gates-and-output.js:66` + `js/render/render-dispatcher.js:126` | No |
| 21 | Compliance enum validators | `compliance-gates-and-output.js:1195, 1565, 2440, 2922` | No |
| 22 | Reports `statusColor`/`statusBadge` | `js/output/reports.js:630-669` | **Partly** — reads `status_label` (`:661`), but D12: never sent |
| 23 | Reports off-market photo rule | `js/output/reports.js:674-682` | No |
| 24 | Reports card badge | `js/output/reports.js:1025-1043` | No |
| 25 | Reports email status map | `js/output/reports.js:2027-2035, 2100-2113` | No |
| 26 | Reports single-listing `sBadge` | `js/output/reports.js:2501-2506` | No |
| 27 | Reports single-listing off-market | `js/output/reports.js:2513-2515` | No |
| 28 | Reports OH hero badge | `js/output/reports.js:1731` | No |
| 29 | Report-package `_statusColor`/`_statusBadge` | `js/output/report-package.js:87-114` | No |
| 30 | Report-package off-market | `js/output/report-package.js:117-124` | No |
| 31 | Report-package hero badges | `js/output/report-package.js:671, 896` | No |
| 32 | Server DTO mapper (origin) | `lib/search/crm-idx-mapper.ts:180-216` | No |

**Transaction-aware: zero of 32.** Sites 13, 16, 17 have `isSale` in scope and ignore it.

`public/crm/js/output/report-package.js` is loaded by **nothing** — `buildSearchReportPackage` has no caller in the repo and the file is not in `public/crm/index.html:88-174`, so it is not inlined into `index-built.html`. Its defects are latent, not shipping. Fix or delete it, but do not count it as live exposure.

## D15 — Adjacent (out of your surface, reported for completeness)
`public/crm/js/dashboard/panels.js:426` has `Cancelled: '#6B7280'` (the sanctioned Mallan **workflow** word) but no entry for the canonical token `Canceled` → a canceled listing gets no colour on the dashboard.

**Two-L `Cancelled` that is CORRECT and must not be "fixed":** `SALE_WORKFLOW_STATUSES` / `RENTAL_WORKFLOW_STATUSES` legitimately contain the workflow word `'Cancelled'`, mapped to canonical `'Canceled'` at `lib/crm/status-mapping.ts:131` and `:288`. So `public/crm/SALE-FORM-REDESIGN.html:606, 5985, 6043, 8592`, `RENTAL-FORM-REDESIGN.html:537, 4644`, `SALE-FORM-WITH-TOOLS.html:583`, `RENTAL-FORM-WITH-TOOLS.html:544`, `js/compliance/form-validation.js:141`, `BUYER-DEAL-FORM.html:409, 1473`, `TENANT-DEAL-FORM.html:337, 1029` are all fine. **The only illegitimate two-L spellings are `lib/search/crm-idx-mapper.ts:192` and its downstream key `js/output/reports.js:644`.**

# 2. FIX PLAN

**F1 — Replace the Refine status block with the same contract-driven mount the main panels use.**
Owner: `public/crm/html/search-form-and-results.html`. Delete `6715-6738`; emit two mounts `data-status-mount="refine-sale" data-transaction="sale"` and `data-status-mount="refine-rental" data-transaction="rental"`, showing only the one matching `currentSearchTab`. `renderStatusPanels` (`search-engine.js:280-296`) already fills any `[data-status-mount]` — no renderer change needed.

**F2 — Collect and repopulate from `data-field="StandardStatus"`.**
Owner: `public/crm/js/search/search-engine.js`. Rewrite `:1637-1643` to read `refine-<transaction>`'s `[data-field="StandardStatus"]:checked` `data-value` attributes and honour `data-refine="backOnMarket"` → `c.backOnMarket = true`, mirroring `:877-885`. Rewrite `:1514-1525` to check boxes by exact token. Extract the shared collector so `collectSearchCriteria` and `applyRefinedSearch` cannot drift.

**F3 — Never poison `activeSearchCriteria` or `localStorage` on a refused serialization.**
Owner: `public/crm/js/search/search-engine.js`. Move `activeSearchCriteria = c` (`:1646`) and `saveLastSearchCriteria()` (`:1690`) **after** a successful `serializeSearchCriteria(c)`; have `applyRefinedSearch` call `window.serializeSearchCriteria(c)` itself, and on `refused.length > 0` toast and return **without** mutating state. Drop the stale second argument at `:1683` (`_serverSearch(c, [])`).

**F4 — Sync status back to the main form.**
Owner: `public/crm/js/search/search-engine.js:1693-1707`. Extend `syncRefineToMainForm` to tick/untick the matching `basic-<transaction>` / `advanced-<transaction>` mount boxes by token.

**F5 — Stop inventing a presentation vocabulary; ship the token plus a per-transaction label.**
Owner: `lib/search/crm-idx-mapper.ts`. Replace `:180-216` so `status` is the **exact live StandardStatus token** (`normalizeStandardStatus` output, `null` when unknown — never `"UNKNOWN"`, never `"ACTIVE"`), and add `status_label` computed from the row's own transaction via `SALE_STATUS_MAPPING` / `RENTAL_STATUS_MAPPING` `canonicalLabels` (`lib/crm/status-mapping.ts:160-170, 320-328`) — the same authority `statusPresentation` uses. This kills `ActiveUnderContract → PENDING`, kills `CANCELLED`, and lights up the already-written reader at `reports.js:661`. Add `status_transaction: 'sale' | 'rent'`.

**F6 — Create the ONE browser status presentation helper.**
Owner: **new file `public/crm/js/core/status-presentation.js`**, registered in `public/crm/index.html` immediately after `js/core/api-client.js:88` (it must load before `search-engine.js:99`, all of `js/render/*`, `js/output/*` and `js/compliance/*`). API:
```js
MallanStatus.token(listing)        // exact Cotality token, or null
MallanStatus.label(listing)        // listing.status_label, else contract label for the row's transaction, else 'Status unavailable' — NEVER 'ACTIVE'
MallanStatus.classes(listing)      // Tailwind classes, keyed by token
MallanStatus.colors(listing)       // {bg,fg} for inline-style/email/print consumers
MallanStatus.isComingSoon(listing) // token === 'ComingSoon'
MallanStatus.isOffMarket(listing)  // Closed|Withdrawn|Hold|Canceled|Expired|Delete
MallanStatus.domClock(listing)     // 'accruing'|'paused'|'stopped'|'exempt'
```
It reads `window.SEARCH_CONTRACT.statusChoices[transaction]` (already loaded by `search-engine.js:253-265`) for labels; the contract must additionally expose a full label map (see F7) because `statusChoices` deliberately omits `Incomplete`/`Delete` (`contract.ts:75-76`).

**F7 — Give the contract a display-label map alongside the searchable choices.**
Owner: `lib/search/engine/contract.ts`. Add `statusLabels: { sale: Record<token,label>; rental: Record<token,label> }` straight from `mapping.canonicalLabels` (`:96-97` already imports both mappings). Search choices stay filtered; display labels cover every canonical status.

**F8 — Point all 31 live display sites at the helper.** Owner: each file in the D14 table. In particular:
- `render-grid.js:41` — **delete** the `listing.status = 'ACTIVE'` mutation; render `MallanStatus.label()`.
- `shared-badges.js:159-165` — replace both arrays with `MallanStatus.domClock()`.
- `reports.js:674`, `reports.js:2514`, `report-package.js:117` — replace all three `OFF_MARKET_STATUSES` copies with `MallanStatus.isOffMarket()`.
- `reports.js:644` — delete the `'CANCELLED'` key.
- `pagination.js:1236-1239` — use `MallanStatus.label(listing)`; drop `|| 'ACTIVE'`.
- `report-package.js:88, 104`, `reports.js:2100-2101, 2501, 671, 896, 1731` — drop every `|| 'Active'` / `|| 'ACTIVE'` fallback.
- `results-map.js:120` — key on `'ActiveUnderContract'`.
- `grid-column-defs.js:13` — change `reso: 'MlsStatus'` → `'StandardStatus'`.

**F9 — Repoint the status validators at the attribute renderers emit.**
Owner: `public/crm/js/compliance/compliance-gates-and-output.js`. `:1198` and `:1566` → `[data-reso-field="StandardStatus"]`. Replace the four hand-kept token lists (`:1195, 1565, 2440, 2922`) with `window.SEARCH_CONTRACT.members.StandardStatus`, so the validator can never lag the feed again.

**F10 — Rebuild the served artifact.** Owner: `public/crm/index-built.html`, via `npm run crm:build`. `tests/runtime/crm-build-drift.test.ts:32-40` byte-compares it; a source-only PR fails that gate and ships nothing.

**F11 — Delete or wire `public/crm/js/output/report-package.js`.** Owner: `public/crm/js/output/report-package.js` (+ `public/crm/index.html` if wired). Per the source-of-truth charter, an unreferenced parallel report builder is exactly the duplicate the charter bans.

# 3. FAILING TEST DESIGN

All four run under the existing `tests/runtime` project (`tests/runtime/jest.config.js`, wired at `jest.config.js` `projects`). Harness precedent: `tests/runtime/crm-search-status-modes.test.ts:141-172` — real partial in JSDOM, real function lifted brace-matched from the shipped `.js`, real server `searchContract()`.

### T1 — `tests/runtime/crm-refine-panel-status-contract.test.ts` (kills D1–D4)
**Drives:** the real `applyRefinedSearch`, `populateRefinePanel`, `serializeSearchCriteria` and `syncRefineToMainForm`, lifted brace-matched from `public/crm/js/search/search-engine.js` and evaluated in a JSDOM built from the real `public/crm/html/search-form-and-results.html`. Seed `window.SEARCH_CONTRACT` with the **real** `searchContract()`. Stub `window.MallanAPI = { idx: { search: jest.fn(() => new Promise(()=>{})) } }` and `window.showToast = jest.fn()`.
**Asserts on the RESULT, not on source text:**
1. Tick the Active box, set `currentSearchTab='sale'`, call `applyRefinedSearch()` → assert `window.showToast` was **not** called with a `/Not executable/` message, and `MallanAPI.idx.search` **was** called once with `params.status === 'Active'`. *(Today: `showToast('Not executable in this Search: Status "ACTIVE"')` and zero calls to `idx.search`. FAILS.)*
2. Tick the contract-panel Pending box on a sale, run `performSearch`-style `collectSearchCriteria`, then open Refine and call `populateRefinePanel()` → assert the Pending box's `.checked === true`. *(Today `false`. FAILS.)*
3. Set `activeSearchCriteria = { searchTab:'sale', statuses:['Active'], boroughs:['Queens'] }`, call `applyRefinedSearch()` with an unresolvable status forced in, then assert `activeSearchCriteria.statuses` is **unchanged** and `localStorage.getItem('lastSearchCriteria_default')` is `null`. *(Today both are poisoned. FAILS.)*
4. Immediately after a refused refine, call `window.goToServerPage(2)` → assert `MallanAPI.idx.search` was called (pagination still works). *(Today refused. FAILS.)*
5. Set `currentSearchTab='rent'`, `renderStatusPanels(searchContract())`, read the rendered refine mount → assert the rendered token/label pairs `toEqual(searchContract().statusChoices.rental)`; assert no label is `'Coming Soon'`, none is `'Sold'`, none contains `'Offer'` or `'Contract'` as a bare word, and `'Closed'`'s label is `'Rented'`. *(Today the block is static markup with `Coming Soon` + `Contract`. FAILS.)*
6. `syncRefineToMainForm(c)` after checking Pending in refine → assert `[data-status-mount="basic-sale"] input[data-value="Pending"]`.checked is `true`. *(Today unchanged. FAILS.)*

### T2 — `tests/runtime/search-dto-status-token-and-label.test.ts` (kills D5)
**Drives:** the real `mapTrestleToCrmListing` from `lib/search/crm-idx-mapper.ts` with provider-shaped fixtures.
**Asserts on the returned record:**
- `map({StandardStatus:'Canceled', PropertyType:'Residential'}).status` `=== 'Canceled'` *(today `'CANCELLED'`. FAILS.)*
- `map({StandardStatus:'ActiveUnderContract'}).status` `=== 'ActiveUnderContract'` and `!== map({StandardStatus:'Pending'}).status` *(today both `'PENDING'`. FAILS.)*
- `map({StandardStatus:'Closed', PropertyType:'Residential'}).status_label === SALE_STATUS_MAPPING.canonicalLabels.Closed` (`'Sold'`) and `map({StandardStatus:'Closed', PropertyType:'ResidentialLease'}).status_label === 'Rented'` *(today `status_label` is `undefined`. FAILS.)*
- `map({StandardStatus:'Pending', PropertyType:'Residential'}).status_label === 'In Contract'`; `…'ResidentialLease'…=== 'Pending'`.
- `map({}).status === null` and `.status_label === 'Status unavailable'` — never `'ACTIVE'`.
- Cross-check: every `status` the mapper can return is a member of `searchContract().members.StandardStatus` (or `null`).

### T3 — `tests/runtime/crm-status-presentation-helper.test.ts` (kills D6, D8, D10, D11, D12, D14)
**Drives:** JSDOM loading `public/crm/index.html`'s real script list (or, minimally, `js/core/status-presentation.js` + `js/core/reso-field-map.js` + `js/render/shared-badges.js` + `js/render/render-grid.js` + `js/search/pagination.js` + `js/output/reports.js`), with `window.SEARCH_CONTRACT = searchContract()` and rows produced by the **real** `mapTrestleToCrmListing`. Then it calls the real rendering functions and reads the **rendered DOM / returned string**.
**Asserts:**
- **Grid, transaction-aware label.** `renderGridView()` with a closed sale and a closed rental in `searchResultsState.filteredListings`; query `#gridResultsBody tr [data-reso-field="StandardStatus"]` → the sale row's `textContent` is `'Sold'`, the rental's is `'Rented'`. *(Today both `'CLOSED'`. FAILS.)*
- **No invented Active.** Render a row whose provider record has no `StandardStatus` → assert the badge text is `'Status unavailable'` **and** `searchResultsState.filteredListings[0].status` is still `null` (the object was not mutated by `render-grid.js:41`). *(Today `'ACTIVE'` on both counts. FAILS.)*
- **DOM clock.** `domDisplay({status:'Canceled', dom:97})` → returned string contains `data-dom-status="stopped"` and `'(final)'`. Same for `'Expired'`, `'Hold'` → `paused`. *(Today all `accruing`, red 97d. FAILS.)*
- **Off-market photos.** Call the real report builder with a canceled listing carrying 8 images → assert the produced HTML contains exactly **one** `<img` for that listing. *(Today 8. FAILS.)* Repeat through `reports.js:2513` single-listing path.
- **Agent-inquiry email.** Call the real inquiry-body builder (`pagination.js:1236`) with `{status:'Pending', listingCategory:'rental'}` → assert the body contains `'Status: Pending'` and **not** `'In Contract'`; with `{status:'Pending'}` (sale) → contains `'Status: In Contract'`; with `{status:'Canceled'}` → contains `'Canceled'` and **not** `'Cancelled'`. *(Today rental says "In Contract" and canceled says "Cancelled". FAILS.)*
- **Map pin.** `createMarkerEl(1000000, 'ActiveUnderContract').style.background` is `'#7c3aed'`. *(Today the default black. FAILS.)*
- **Single authority.** Grep-with-teeth: assert `MallanStatus` is the sole definition site by asserting the helper's `label()` output **equals** the rendered text in grid, gallery, summary, short-summary, master-detail and the print sheet for the same row — i.e. drive all six renderers and compare their DOM text to one helper call.

> Explicit call-out per your instruction: a test that only greps `search-engine.js` for the string `'ACTIVE'`, or greps for `CANCELLED`, is **INSUFFICIENT** and must not be accepted as proof for any of D1–D14. Every assertion above is on an executed return value, a `MallanAPI.idx.search` call argument, or `textContent` from a rendered node.

### T4 — `tests/runtime/crm-status-validator-attribute.test.ts` (kills D7, D9, D13)
**Drives:** the real `test3_Status` / SRC-02 / RESO3 / W2 IIFEs from `public/crm/js/compliance/compliance-gates-and-output.js` in JSDOM against a rendered result set built from the real mapper.
**Asserts:**
- Render a grid containing a `Canceled` listing, run the compliance suite → `SRC-02` and `RESO3` both report `'PASS'`. *(Today both `'FAIL'` with `status="CANCELLED"`. FAILS.)*
- The status validator's element count `> 0` after rendering the grid — i.e. `document.querySelectorAll('[data-reso-field="StandardStatus"][data-reso-value]').length` equals the row count and the validator actually inspected them. *(Today `test3_Status` queries `MlsStatus`, sees ~1 element, and passes vacuously. FAILS on the count assertion.)*
- No rendered node anywhere in the results DOM carries `data-reso-field="MlsStatus"`. *(Today `render-gallery.js:10` does. FAILS.)*
- Feed a listing with a token freshly added to `searchContract().members.StandardStatus` → the validators accept it without a source edit (proves the hand-kept lists are gone).

# 4. FILE OWNERSHIP

**Refine panel (D1–D4)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/html/search-form-and-results.html` — `6614`, `6715-6738`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/search-engine.js` — `1514-1525`, `1637-1643`, `1646`, `1683`, `1690`, `1693-1707`, `1715-1723`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/search-actions.js` — `111-119`, `147-148`

**Status vocabulary — server origin (D5, D12)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/crm-idx-mapper.ts` — `180-216`, `278-279`, `327`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/contract.ts` — add `statusLabels` (`44-47`, `93-100`)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/engine/hydrate.ts` — pass listing transaction to the mapper (`143-145`)

**New shared browser helper (D14)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/status-presentation.js` — **new**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index.html` — register after line `88`

**Display sites (D6, D8–D11, D14)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/reso-field-map.js` — `174-183`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-grid.js` — `41`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/grid-column-defs.js` — `13`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-gallery.js` — `4-6`, `10`, `45`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-summary.js` — `6-8`, `50`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-short-summary.js` — `6`, `28`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-master-detail.js` — `26`, `84`, `153`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/results-map.js` — `119-120`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/shared-badges.js` — `30-32`, `159-165`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-dispatcher.js` — `126`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/search/pagination.js` — `97`, `116`, `201`, `330`, `1067`, `1073`, `1236-1239`, `1633`, `1699`, `1703`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/reports.js` — `630-682`, `1025-1043`, `1731`, `2027-2035`, `2100-2113`, `2501-2515`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/report-package.js` — `87-124`, `671`, `896` (**or delete the file — it has no caller**)

**Compliance validators (D7, D13)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/compliance/compliance-gates-and-output.js` — `61`, `66`, `109-115`, `145`, `1195-1215`, `1565-1570`, `2440`, `2922`

**Adjacent (D15, optional)**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/dashboard/panels.js` — `426`

**Generated — must be regenerated, never hand-edited**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index-built.html` — via `npm run crm:build`; gated by `tests/runtime/crm-build-drift.test.ts`

**New tests**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-refine-panel-status-contract.test.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/search-dto-status-token-and-label.test.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-status-presentation-helper.test.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-status-validator-attribute.test.ts`

**Server side already correct — consume, do not duplicate:** `lib/crm/status-mapping.ts` (`SALE_STATUS_MAPPING`/`RENTAL_STATUS_MAPPING`, `canonicalLabels` `160-170`/`320-328`, `statusPresentation` `566-598`), `lib/search/engine/contract.ts:77-100` (`statusChoices`, sale `Closed→Sold`/`Pending→In Contract`, rental `Closed→Rented`, no rental `ComingSoon`, no `Incomplete`/`Delete`), `app/api/crm/status-options/route.ts` (per-transaction `workflow` + `canonical` + `factLabels`, fail-closed 400 with no `type`), `app/api/idx/search/contract` (already fetched into `window.SEARCH_CONTRACT` at `search-engine.js:253-265`).

**Nothing was edited; this was read-only.**