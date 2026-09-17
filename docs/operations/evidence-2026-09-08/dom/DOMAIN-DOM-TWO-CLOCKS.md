# DOM — two clocks, one rule each (owner ruling 2026-09-08)

> **Superseded (2026-09-08 evening) on the market clock's END:** the owner ruled that market DOM ends at the CloseDate of a Sold / Rented listing or at the OffMarketDate of a removal — never at PurchaseContractDate — and that Pending keeps accruing. `lib/compliance/dom-tracker.ts` now carries that rule; the contract-signed date remains a separate fact (`inContractSince`). The Coming Soon clock and the live evidence below stand. See `../status/STATUS-PROVIDER-TOKENS.md` §1.4.

Maya's ruling: DOM is two different clocks. A Coming Soon clock from the exact Cotality Coming Soon / activation facts,
never merged into market DOM; and a market DOM from the day the property is listed / on market until the contract is
signed. `PurchaseContractDate` is not to be used as "contract signed" automatically; the field or deterministic
combination must be proven per transaction type first. Two modules disagreed; only one rule may survive.

Authority for every provider fact below: the live feed, measured 2026-09-08 (`contract-event-census-2026-09-08.txt` in
this directory; whole-corpus counts in §1). Nothing is taken from a repo constant or a prior report.

## 1. What the feed delivers (whole corpus 591,599 rows; live counts)

| Fact | Count | Meaning |
|---|---|---|
| `DaysOnMarket`, `CumulativeDaysOnMarket` | `$filter` → HTTP 400 (provider-suppressed); **null on every one of 2,903 sampled rows across all statuses** | REBNY's own DOM value is not delivered. Every DOM Mallan shows is Mallan's clock. |
| Pending sales | 5,248 — `PurchaseContractDate` null on **0**; `ContractStatusChangeDate` null on 0; `PendingTimestamp` null on 30 | the contract date is on 100 % of in-contract sales |
| Pending rentals | 354 — `PurchaseContractDate` null on 8 (97.7 % populated); `PendingTimestamp` null on 0 | |
| Active rows with a `PurchaseContractDate` | 178 of 7,739 (837 Active carry a `BackOnMarketDate`) | 92 of the 178 predate a `BackOnMarketDate` — a fallen contract; 80 carry no back-on-market fact and a contract date 5–712 days old with no later status change |
| `ContingentDate` (RESO: an offer with a contingency, listing stays on market) | populated on **0** rows in any status | REBNY records no separate accepted-offer date |
| Coming Soon rows | 3 — `ActivationDate` on all; `OnMarketDate` on all (= `ListingContractDate`; 2 of 3 = the entry day); `ContractStatusChangeDate` = the `StatusChangeTimestamp` day on 3 of 3; `ActivationDate` 8–13 days later | |
| Active rows with `ActivationDate` | 7,573 of 7,739 | `ActivationDate` persists after activation |
| Closed sales / rentals without `PurchaseContractDate` | 91,414 of 203,621 / 313,137 of 374,795 | older closed rows lack it; 54,704 closed sales carry the contract date without ever having been marked Pending |

Sample relationships (500 rows per class, `contract-event-census-2026-09-08.txt`):

| Relationship | Pending sale | Pending rental | Closed sale | Closed rental |
|---|---|---|---|---|
| `PurchaseContractDate` = `ContractStatusChangeDate` | 94.4 % | 99.4 % | 1.0 % (the close moved it) | 49.9 % |
| `PurchaseContractDate` = `PendingTimestamp` day | 61.1 % (median gap 0, p75 1 day) | 51.9 % | 63.2 % | 68.1 % |
| `PurchaseContractDate` → `CloseDate` gap (days) | — | — | **median 83, p25 58, p75 120**; equal on 1.4 % | **median 0, p75 6, max 84**; equal on 51.7 % |
| `OnMarketDate` = `ActivationDate` | 74.3 % | 93.7 % | 60.9 % | 92.0 % |
| `ActivationDate` 1–14 days after `OnMarketDate` (entered as Coming Soon) | 37 of 491 | 12 of 318 | 19 of 435 | 14 of 389 |
| `OffMarketDate` = `CloseDate` | — | — | 100 % | 100 % |

## 2. The proof: which field is "contract signed"

**Sale — `PurchaseContractDate` on a row whose provider stage is in contract or closed.**
REBNY's own required input for a Pending listing is "Purchase Contract Signed Date (for Pending)"
(`data/UCBA-2026-Requirements.md`, REBNY contractual terminology); the IDX Plus field that carries it is
`PurchaseContractDate` (populated on 100 % of Pending sales, equal to the contractual status-change date on 94 %, three
months before the closing on the median). A `PurchaseContractDate` on an **Active** row is not a signed contract: the
178 live cases are fallen contracts (92 predate the back-on-market date) or stale entries, and REBNY records no
accepted-offer date at all (`ContingentDate` 0 rows) — so the date alone can mean "contract out"; the status confirms
the signing. `PendingTimestamp` is when the agent marked the row Pending (equal to the contract date on 61 %) and is
never used as the contract date. The closing (`CloseDate`) is never the contract on a sale; a closed sale that carries
no `PurchaseContractDate` (older rows) has **no** market DOM — nothing is guessed.

**Rental — `PurchaseContractDate` on a Pending / Closed row, else the Leased date (`CloseDate`) on a Closed row.**
The lease is the contract. REBNY's terminology for the close of a rental is "Sold or Leased Date (Closed Date)"; on
recent closed rentals the `PurchaseContractDate`, where present (78 %), equals the close date on 52 % and precedes it
by at most 6 days on 75 %. Whether a Pending rental's `PurchaseContractDate` is the lease signing or the application
acceptance is **UNVERIFIED** (REBNY input semantics, not observable from the feed); it is the only contract event REBNY
records for a Pending rental, and it precedes the lease/close by days, not months.

## 3. The one rule (`lib/compliance/dom-tracker.ts`)

| | Rule | Exact facts |
|---|---|---|
| Market clock start | the later of `OnMarketDate` and `ActivationDate` | Coming Soon days are not market days (UCBA Art. I §11/§16; the ruling). A back-dated First Showing Date yields the entry day. Null when neither is delivered — never `ListingContractDate`, `OriginalEntryTimestamp`, or a Mallan `created_at`. |
| Market clock end | `contractSignedDate` (§2); else the day the row left the feed (Off Market, `terminal_since`); else the as-of day while Active / Coming Soon | A Pending or Closed row with no delivered contract date has no market DOM (`unverified` says why). |
| Back on market | the stale `PurchaseContractDate` of a fallen contract does not stop the clock; the clock runs from the original on-market day | the in-contract interval is **not** subtracted (the listing was on the market and no contract is signed) — a Mallan policy choice recorded for Maya, see §5 |
| Coming Soon clock | from `ContractStatusChangeDate` (the day the status became Coming Soon; = entry day) to the as-of day; countdown to `ActivationDate`; `exceedsFourteenDays` for UCBA §16 | never merged: a Coming Soon row's market DOM is 0 until activation |
| Stored-column accrual (`computeDomTransition` / `getCurrentDom` without a lifecycle) | runs while `Active` / `ActiveUnderContract`, stops at `Pending`, 30-day reset on Withdrawn / Cancelled, reset to 0 on close (cumulative retained) | the same rule for Mallan-authored rows that carry no provider dates: the CRM maps "Offer Accepted" → `ActiveUnderContract` and "Contract Signed" → `Pending` (`lib/crm/status-mapping.ts`), so an accepted offer keeps the clock running and the signed contract stops it |
| Provider facts | `ListingLifecycle.contractEvents` — every contract-event date verbatim, separate from every clock | `OnMarketDate`, `ActivationDate`, `ListingContractDate`, `OriginalEntryTimestamp`, `ContractStatusChangeDate`, `PurchaseContractDate`, `PendingTimestamp`, `BackOnMarketDate`, `CloseDate`, `OffMarketDate` |

The second rule table, `lib/compliance/rebny-ucba-rules.ts` `domRules`, is now **derived** from the tracker
(`accruingStatuses = [...DOM_ACCRUING_STATUSES]`, `stopsAt: 'Pending'`); it declared `{Active, ActiveUnderContract,
Pending}` before. `compliance/rules/status-rules.json` mirrors the same rule (Pending `domAccrues: false`, the two
clocks named). `data/UCBA-2026-Requirements.md` keeps REBNY's own table (Pending accrues for REBNY's DaysOnMarket) with a
note that it is not Mallan's clock and is not delivered.

## 4. Consumers converged (every one derives from the tracker)

| Site | Before | Now |
|---|---|---|
| `lib/search/crm-idx-mapper.ts` (CRM search rows) | `dom = raw.DaysOnMarket` (null on every provider row); Mallan rows' stored clock arrived under the provider key | `dom = marketDom(lifecycle).days` for provider rows; Mallan rows carry `_mallanDaysOnMarket` (`lib/search/engine/hydrate.ts`); `domClock` and `comingSoonDom` exposed |
| `app/api/market/route.ts` (public market stats) | a fifth clock: stored column, else `now − first_active_date`, else `now − created_at`; provider rows `DaysOnMarket || 0` | `marketDom` on stored rows (stored accrual only as the Mallan-authored fallback), `marketDom` on provider rows; rows without a verified clock are left out; the select is contract-typed |
| `lib/comps/fetch-comps.ts`, `lib/market-report/generator.ts` | provider `DaysOnMarket` (always null / 0) | market clock from the contract-event dates (selects extended: `lib/idx/card-fields.ts`) |
| `lib/cma/engine.ts` (DB comps) | the stored column (reset to 0 on close by the tracker) | market clock from the stored row's provider dates, stored column as the last fallback |
| `app/api/crm/sales/listings/route.ts` | `getCurrentDom(stored)` | `getCurrentDom(stored, { lifecycle })` — the provider clock wins when the row carries dates |
| `app/api/cron/feed-reconcile/route.ts` (orphan import) | `first_active_date = now` for a Pending-inclusive local set | `first_active_date = marketClockStart(row)`; the wall-clock only for an accruing status with no on-market date |
| `lib/compliance/rls-enforcement.ts` (30-day advisory) | `TemporarilyOffMarket` treated as reset-eligible | `DOM_RESET_ELIGIBLE_STATUSES` (Withdrawn / Cancelled; Hold pauses) |
| `lib/idx/db-to-public-dto.ts` (public DTO) | `daysOnMarket` = provider value (never present) | unchanged provider passthrough, documented; `lifecycle.marketDom`, `lifecycle.comingSoonDom`, `lifecycle.contractSignedDate`, `lifecycle.contractEvents` added — whether the public page renders the Mallan clock is a product decision (§5) |

Tests: `lib/compliance/__tests__/dom-clocks.test.ts` (the rule on live-shaped rows), `tests/runtime/dom-one-rule-wiring.test.ts`
(a source ratchet: no consumer keeps a private clock), the lifecycle tests (`inContractSince` is the contract-signed
date, `PendingTimestamp` exposed separately).

## 5. Still Maya's, and what is held

1. **Back on market**: the clock now runs continuously from the original on-market day (the dead contract's interval
   included). If the interval in contract should be subtracted, that is a one-line policy in `marketDom`.
2. **Public rendering**: the listing page shows no Mallan DOM today (`ListingSidePanel` reads the provider value, which
   is never present). The DTO now carries `lifecycle.marketDom`; rendering it publicly is a product decision.
3. **Pending rentals**: the semantics of REBNY's `PurchaseContractDate` on a Pending rental (lease signed vs application
   accepted) are UNVERIFIED; the rule uses the only delivered contract event and states it.
4. **Held**: `lib/idx/sync.ts` keeps a local `ACTIVE_SEED_STATUSES` that includes Pending (seeding `first_active_date`)
   and its own status-change-only DOM trigger; `public/crm/js/**` keeps a browser-side clock (`agent-functions.js`,
   `index-built.html`) and three precedence orders for `dom` / `cumulative_dom` in the dashboard — recorded, not edited.
5. The seller-portal routes and the compliance-audit route read the stored column as a snapshot (a frozen value, not a
   different rule); `lib/social-proof/cache.ts` and `lib/market-pulse/snapshot.ts` aggregate the stored column, which
   the tracker resets to 0 on close — a latent defect recorded for the next pass.
