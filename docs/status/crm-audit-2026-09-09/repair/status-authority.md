All gates verified. Final report:

---

# THE ONE BROWSER STATUS PRESENTATION AUTHORITY — done

## Test counts (rule 2)

| Run | Result |
|---|---|
| `tests/runtime/crm-status-presentation-helper.test.ts` — written first, against unchanged code | **47 failed / 47 total** |
| Same file, after creating only the helper (proves the 13 real downstream defects, not a missing file) | **13 failed / 34 passed** |
| Same file, after the fixes | **47 passed / 47 total** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run compliance-check` | 95 passed, 0 failed (BLOCKER+STRICT) |
| `npm run rls:validate` | PASS — 0 errors, 0 unknown |
| `npm run ucba:audit` | 0 REGRESSIONS |
| `npm run idx:validate` | 0 critical |
| `npm run crm:test` | 37/37 |
| full `npx jest --ci` | 8880 passed / **11 failed** — 10 in two unowned test files (listed below), 1 = `crm-build-drift` (expected; you rebuild) |

Every assertion executes the real shipped function (the DTO mapper, the helper eval'd in JSDOM, `domDisplay` / `getStatusBadgeClasses` / `comingSoonBadge` / `transformAPIListing` lifted brace-matched from their shipped `.js`) and asserts on the returned value or rendered DOM. No source-text grep is used as evidence.

## The helper's API — `public/crm/js/core/status-presentation.js`

Global `MallanStatus` (also `window.MallanStatus`). Every accessor takes **a listing object or a bare status string**.

```js
MallanStatus.token(x)         // exact live StandardStatus token, or null. Never a default.
MallanStatus.label(x)         // transaction-aware broker label; 'Status unavailable' when unresolvable
MallanStatus.transaction(x)   // 'sale' | 'rental'
MallanStatus.classes(x)       // Tailwind badge classes, keyed by token
MallanStatus.colors(x)        // {bg, fg} for inline-style / email / print / PDF consumers
MallanStatus.pinColor(x)      // map-pin colour
MallanStatus.isComingSoon(x)  // token === 'ComingSoon'
MallanStatus.isOffMarket(x)   // Closed|Withdrawn|Hold|Canceled|Expired|Delete  (REBNY primary-photo-only rule)
MallanStatus.domClock(x)      // 'exempt' | 'paused' | 'stopped' | 'accruing'
MallanStatus.tokens()         // live token list
MallanStatus.labels(tx)       // token → label map for a transaction
MallanStatus.UNAVAILABLE      // 'Status unavailable'
MallanStatus._FALLBACK        // ratchet-test only; no renderer may read it
```

**Vocabulary source.** At runtime it reads `window.SEARCH_CONTRACT` (served by `GET /api/idx/search/contract`) — `members.StandardStatus` for tokens, `statusChoices.sale/.rental` for labels, and the served contract **overrides the offline copy entry by entry**. A hardcoded fallback was unavoidable (the CRM renders before/without the contract fetch; print sheets, saved report HTML and the offline test harness have no network) and `statusChoices` deliberately omits `Incomplete`/`Delete`, so the copy is **ratcheted**: four tests prove `_FALLBACK.tokens === searchContract().members.StandardStatus`, `_FALLBACK.labels.sale/.rental === SALE_/RENTAL_STATUS_MAPPING.canonicalLabels` exactly, `_FALLBACK.offMarket === MALLAN_TERMINAL_STATUSES + Hold`, and `clockPaused ∪ clockStopped === offMarket` (disjoint). A fifth proves the offline label and the served label are identical for every choice in both transactions.

`isComingSoon` deliberately is **not** gated on transaction: Coming Soon is sales-only at listing creation, but a showing restriction must never fail open.

## Files changed (all owned)

- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/status-presentation.js` — **new**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/crm-idx-mapper.ts`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/reso-field-map.js`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/core/data-loader.js`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/shared-badges.js`
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/index.html` — one line. **build.js does NOT glob**: it regex-matches `^<script src="(js|tests)/…"></script>$` line by line, so an explicit entry was required. Added as the **first** Core script (line 90), before `api-client.js`.
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-status-presentation-helper.test.ts` — **new**

## Defects fixed in my files

**D5 — DTO mapper** (`lib/search/crm-idx-mapper.ts`). The 25-entry `statusMap` producing `ACTIVE/COMING_SOON/PENDING/CLOSED/CANCELLED/OFF_MARKET/UNKNOWN` is deleted. Now:
- `status` = `normalizeStoredStatus(...)` → an exact live token or **`null`**. `ActiveUnderContract` no longer collapses to `PENDING`; two-L `CANCELLED` is gone; `UNKNOWN`/`OFF_MARKET` are gone.
- `status_label` (**new**) = `SALE_/RENTAL_STATUS_MAPPING.canonicalLabels[token]` — the same authority the Search contract and the CRM forms use. A token outside the transaction's canonical set (rental `ComingSoon`, `Delete`) reads `'Status unavailable'` rather than being relabelled into the other transaction's language. This lights up the previously-dead reader at `reports.js:661` (**D12**).
- `status_transaction` (**new**) = `'sale' | 'rent'`.
- `mlsStatus` intentionally unchanged — `lib/listings/ensure-local-listing.ts:68` reads `dto.mlsStatus || dto.status` and validates it; changing it would ripple outside my surface.
- `comingSoonDate` gate moved from `status === "COMING_SOON"` to `=== "ComingSoon"`.

**D8 — DOM clock** (`shared-badges.js:159-165`). Both hand-kept arrays deleted; `domDisplay` calls `MallanStatus.domClock(listing)`. Proven end-to-end: a row built by the **real** mapper with `Canceled`/`Closed`/`Expired`/`Delete` now renders `data-dom-status="stopped"` + `(final)`, `Hold`/`Withdrawn` → `paused`, `ComingSoon` → `exempt`. Before, all of them rendered a still-accruing red 97-day count.

**D14 (partial) — `getStatusBadgeClasses`** (`reso-field-map.js:174-183`). The five-case switch (which sent `Canceled`, `Expired`, `Hold`, `ActiveUnderContract`, `Incomplete`, `Delete` to the grey unknown default) now delegates to `MallanStatus.classes`. `_isComingSoonToken` also delegates. `compliance-gates-and-output.js:1708` W7 self-check still passes (ACTIVE ≠ PENDING).

**D11 (my file) — `data-loader.js:239`.** `status: (apiListing.status || 'ACTIVE').toUpperCase()` — which both uppercased `'Active'` into the retired word *and* fabricated a live status for a status-less row — is now `MallanStatus.token(...)` plus `status_label` / `status_transaction`, matching the mapper's shape so a row from this path and a row from Search render identically.

**Two-L Cancelled:** zero of my files can now *produce* it. The only two-L strings left in my surface are the deliberate read-compat alias entries (`'Cancelled' → 'Canceled'`, `'CANCELLED' → 'Canceled'`) that *eliminate* it, plus comments. A test asserts no label the helper can produce matches `/Cancelled/`.

---

# NEEDS ANOTHER OWNER

### 1. BLOCKING — two test files pin the retired vocabulary (10 failures)
Not owned by me. Each must flip to the live token. Exact lines and new expected values:

`C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/__tests__/crm-idx-mapper.test.ts`
- `:160` `status: "PENDING"` → `"ActiveUnderContract"` (input is `MlsStatus: "ActiveUnderContract"` at `:137` — this *is* the collapse defect)
- `:231-233` the 4 off-market variants: `toBe("OFF_MARKET")` → `toBeNull()` (see item 5 below)
- `:248` `toBe("UNKNOWN")` → `toBeNull()`
- `:275` regression table `[["Active","ACTIVE"],…,["Canceled","CANCELLED"]]` → identity for all 11 live members; `"Cancelled"`/`"Coming Soon"`/`"Active Under Contract"` → `"Canceled"`/`"ComingSoon"`/`"ActiveUnderContract"`
- `:300` `toBe("COMING_SOON")` → `"ComingSoon"`
- `:337` `toBe("ACTIVE")` → `"Active"`

`C:/Users/MayaAllan/Desktop/mallan-nyc/lib/search/__tests__/crm-idx-mapper-fallbacks.test.ts`
- `:110` `expect(l.status).toBe('UNKNOWN')` → `toBeNull()`. (`:111` `mlsStatus === ''` still passes.)

### 2. HIGHEST RISK — `render-grid.js:41` now fabricates a status where there is none
`C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/render/render-grid.js:41` — `if (!listing.status) listing.status = 'ACTIVE';` **writes** onto the shared `listings` object. The mapper now correctly emits `null`, so this line fires *more often* and leaks a fabricated Active into gallery, detail, print, email and reports. **Delete the mutation; render `MallanStatus.label(listing)`.** This is the one item where my change makes the pre-existing defect more reachable until its owner lands.

### 3. Display sites to migrate (verified file:line)
| File | Lines | What to do |
|---|---|---|
| `public/crm/js/render/grid-column-defs.js` | `13` | `reso: 'MlsStatus'` → `'StandardStatus'`; the inline 3-case colour ternary and `label = l.status` → `MallanStatus.classes/label` |
| `public/crm/js/render/render-gallery.js` | `4`, `5`, `6`, `10`, `45` | `stC`/`stB` → `MallanStatus.colors`; `statusLabel` → `.label`; **`:10` is the only node in the CRM still emitting `data-reso-field="MlsStatus"`** → `resoData('status', …)` |
| `public/crm/js/render/render-summary.js` | `6`, `7`, `8`, `50` | same |
| `public/crm/js/render/render-short-summary.js` | `6`, `28` | `statusLabel` → `.label` |
| `public/crm/js/render/render-master-detail.js` | `26`, `84`, `153` | three raw `${listing.status}` badges → `.label` |
| `public/crm/js/render/results-map.js` | `95`, `119`, `120` | `'COMING_SOON'`/`'ACTIVE_UNDER_CONTRACT'` → `MallanStatus.pinColor(...)`; the AUC branch is reachable again now that the mapper stops collapsing it |
| `public/crm/js/render/render-dispatcher.js` | `126` | `l.status === 'CLOSED'` → `MallanStatus.token(l) === 'Closed'` |
| `public/crm/js/search/pagination.js` | `97`, `1067`, `1236-1239`, `1336`, `1633`, `2612` | `:1236` `\|\| 'ACTIVE'` + `isSale` computed at `:1229` and unused → `MallanStatus.label(listing)` (fixes the rental-Pending-as-"In Contract" email to another brokerage); `:2612` `!== 'ACTIVE'` → token compare |
| `public/crm/js/output/reports.js` | `633-645`, `673`, `1026`, `1731`, `2028-2034`, `2100-2101`, `2501`, `2513` | replace all three `OFF_MARKET_STATUSES`/`offMkt` copies with `MallanStatus.isOffMarket` (REBNY primary-photo-only); delete the `'CANCELLED'` key at `:644`; drop every `\|\| 'ACTIVE'`. `statusBadge` at `:661` already reads `status_label` — it now receives one. |
| `public/crm/js/output/report-package.js` | `90-98`, `108-110`, `117`, `397`, `671`, `896` | **no caller anywhere and not in `index.html`** — per the source-of-truth charter this is a duplicate report builder; delete it or wire it |
| `public/crm/js/compliance/compliance-gates-and-output.js` | `61`, `66`, `111-114`, `1195-1198`, `1565-1566`, `2440`, `2922` | `:1198`/`:1566` query `[data-reso-field="MlsStatus"]` — nothing but the gallery badge emits that, so the status validator is near-vacuous → `"StandardStatus"`. Replace the four hand-kept token lists with `window.SEARCH_CONTRACT.members.StandardStatus`. **Residual after my change: `'Delete'` is in neither list, so a Delete row would FAIL SRC-02/RESO3.** (`'CANCELLED'`, `'UNKNOWN'`, `'OFF_MARKET'`, `'DELETED'` are no longer emitted, so those D7 failures are already gone.) |
| `public/crm/js/dashboard/panels.js` | `426` | `Cancelled: '#6B7280'` has no `Canceled` key → a canceled listing has no dashboard colour |

### 4. Two-L `Cancelled` outside my surface
`C:/Users/MayaAllan/Desktop/mallan-nyc/lib/listings/canonical-lifecycle.ts:157` — `STAGE_LABEL.cancelled = 'Cancelled'`. This is a **display label**, so it is an illegitimate two-L (unlike the sanctioned workflow word in the four forms and `form-validation.js:141`, which are correct and must not be touched).

### 5. Design decision that needs Maya's routing — the Mallan "Off Market" presence state
The mapper's `"Off Market"/"Off-Market"/"OffMarket"/"off market" → "OFF_MARKET"` entries are gone: per `lib/listings/canonical-lifecycle.ts` and `lib/compliance/status.ts`, Off Market is a **presence** fact, never a status, and emitting it as `status` was itself the defect. It was also effectively unreachable — `hydrate.ts:145` puts only `listings.status` (an 11-member vocabulary) under `_mallanStatus`, and `MlsStatus` is null on every provider row. If Maya wants the presence state visible in Search, it needs `sync_status` added to `hydrate.ts`'s `select` (`~:155-165`) and `statusPresentation()` called there — **`lib/search/engine/hydrate.ts` is not mine.**

### 6. Not done by me, by instruction
`public/crm/index-built.html` is stale (`tests/runtime/crm-build-drift.test.ts` fails). Your final `npm run crm:build` picks up `js/core/status-presentation.js` via the new `index.html` entry.