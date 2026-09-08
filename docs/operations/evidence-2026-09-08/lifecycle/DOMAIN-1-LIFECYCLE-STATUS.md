# Domain 1 — listing lifecycle / status: one vocabulary from the proven Cotality combinations (2026-09-08)

Scope: the status of a listing everywhere Mallan reads or writes it. Provider facts come from the live IDX Plus
feed (`Trestle-11371-20`), measured over the whole entitled corpus (591,599 rows, all statuses) —
`docs/operations/evidence-2026-09-08/transaction-state/` — and from the stored-vs-live check of production
(`lifecycle/stored-withdrawn-vs-live.json`). Nothing below is inferred from a field name.

## 1. What was wrong (proven, not assumed)

| # | Defect | Proof | Effect on the site |
|---|---|---|---|
| 1 | `feed-reconcile` (cron) and `scripts/reconcile-ghosts.js` wrote **`Withdrawn`** whenever a listing was merely *absent* from the Active snapshot. The feed never delivers Withdrawn / Cancelled / Expired / Hold (0 rows of 591,599). | Production: 6,962 rows stored `Withdrawn`; 6,920 are absent from the feed, **42 are live `Closed`** (40 rentals, 2 sales). | An invented provider status; Closed rentals shown as "Withdrawn"; the DOM 30-day reset rule keyed on Withdrawn was applied to rows that were never withdrawn. |
| 2 | `Pending` (the feed's in-contract status: 5,241 sale + 349 rental rows; `PurchaseContractDate` present on 100% of Pending sale rows) was **not publicly displayable** and had no public label. | `ACTIVE_DISPLAY_STATUSES` excluded Pending; `visibility-contract` mapped it to a hidden stage. | In-contract listings vanished from the public site instead of showing "In Contract". |
| 3 | A closed **rental** was rendered as a **sale** ("Sold", price history "Sold") — `PropertyType = ResidentialLease` never consulted. | `PriceHistory.tsx`, `db-to-public-dto.ts`, building unit lists. | 374,791 closed rentals in the corpus would read as sales. |
| 4 | `MajorChangeType`, `MajorChangeTimestamp`, `PurchaseContractDate`, `PendingTimestamp`, `ContractStatusChangeDate`, `StatusChangeTimestamp`, `BackOnMarket*`, `OffMarketTimestamp`, `OnMarketTimestamp`, `PriceChangeTimestamp` were **stripped** from `raw_data` by the keep-list. | Production `raw_data`: 0 rows carry `MajorChangeType` or `PurchaseContractDate`. | No "Back on Market", no contract-signed date, no in-contract flag could ever be derived. |
| 5 | Five parallel status vocabularies (`lib/compliance/status.ts`, `lib/search/visibility-contract.ts`, `lib/search/canonical/status.ts`, `lib/crm/status-mapping.ts`, `lib/search/crm-idx-mapper.ts`, CRM `manage-listings` resoMap) disagreed on Pending, Closed-by-type and the departed state. | Matrix v3 static-defect register (`status vocabularies multiplied`). | Same listing labelled differently by search, CRM, DTO and compliance. |
| 6 | `app/api/market` and `lib/buildings/public-building-data.ts` filtered on **`MlsStatus`** (free text) instead of the contract field `StandardStatus`. | Live: `StandardStatus` is the declared enum (11 members); `MlsStatus` is a string. | Market stats and building unit lists could miss or mis-count rows. |

## 2. The one vocabulary (provider combination → Mallan)

Owner terminology confirmed by Maya 2026-09-08: an in-contract listing **stays public, labelled "In Contract"**;
a listing that has **left the feed is not called "Withdrawn"**.

| Provider combination (live) | Lifecycle stage | Storage status | Public label | Public? | Notes |
|---|---|---|---|---|---|
| `StandardStatus = Active` | `active` | `Active` | Active | yes | `MajorChangeType = BackOnMarket` ⇒ "· Back on Market" (OnMarketDate is **not** reset on BackOnMarket: 68 equal / 531 later of 694) |
| `StandardStatus = ComingSoon` | `coming_soon` | `ComingSoon` | Coming Soon | yes (badge; no showings) | sales only (5 rows live) |
| `StandardStatus = Pending` or `ActiveUnderContract` | `in_contract` | `Pending` / `ActiveUnderContract` | **In Contract** | **yes** | in-contract date = `PurchaseContractDate` ?? `PendingTimestamp` day; `ContractStatusChangeDate` present on 100% of rows of every status, so it is not a contract signal |
| `StandardStatus = Closed`, `PropertyType` sale | `closed` | `Closed` (or explicit `Sold`) | **Sold** | no | `OffMarketDate == CloseDate` on every Closed row |
| `StandardStatus = Closed`, `PropertyType = *Lease` | `closed` | `Closed` (or explicit `Rented` / `Leased`) | **Rented** | no | never "Sold" |
| `Hold` | `temp_off_market` | `Hold` | Temporarily Off Market | no | not delivered today (0 rows) |
| `Withdrawn` / `Canceled` / `Expired` | `withdrawn` / `cancelled` / `expired` | `Withdrawn` / `Cancelled` / `Expired` | same words | no | **only when the provider says so** (0 rows today) or a Mallan broker action (CRM) |
| `Incomplete` | `draft` | `Draft` | Draft | no | Mallan-authored drafts |
| **absent from the current feed** (no row for the ListingId) | provider stage preserved; display stage `off_market` | **unchanged** (the last verified provider status stays in `status`; the presence fact `sync_status = off_feed` is recorded) | **Off Market** (broker-facing Mallan state, Maya 2026-09-08) | no | never a manufactured Withdrawn / Canceled / Expired / Hold and never a new canonical status; a verified provider state that arrives later replaces the presence fact. (Superseded 2026-09-08: the first pass minted a `Delisted` status — ruled out by the owner.) |

Module: `lib/listings/canonical-lifecycle.ts` (a boundary module — the only place that reads `StandardStatus`,
`PropertyType`, `MajorChangeType`, `PurchaseContractDate`, `PendingTimestamp`, `BackOnMarketDate`, `CloseDate` for
this purpose). Every consumer below derives from it.

## 3. Consumers converged (each with a test that failed first)

- **Storage vocabulary** — `lib/listings/mallan-status.ts` (no departed status: departure is the presence fact
  `sync_status = off_feed`), `lib/compliance/status.ts` (labels In Contract / Temporarily Off Market / Rented; Pending
  in the active-display set; `statusDisplayLabelFor(status, listingType)`; no provider-status label is the bare
  "Off Market"), `lib/crm/status-mapping.ts` (`resolveCanonicalStatusForListing`: Closed → Sold / Rented by
  transaction type), `lib/search/crm-idx-mapper.ts` (Off-Market spellings → the CRM token OFF_MARKET; `MlsStatus`
  only as the last legacy fallback).
- **Presence (owner ruling 2026-09-08)** — `lib/listings/canonical-lifecycle.ts`: `OFF_FEED_SYNC_STATUS = 'off_feed'`,
  `OFF_MARKET_LABEL = 'Off Market'`, `lifecycleFromStoredRow({ status, sync_status, terminal_since, … })` returns
  `providerStage` (the raw fact), `presence`, `offFeedSince` and the display `stage` (`off_market` when an on-market
  provider stage is off the feed). The raw provider fact and the Mallan display state are two fields, never one.
- **Reconciliation** — `lib/idx/reconcile-decision.ts` (`liveTruthFromRow` reads the provider row only through
  the lifecycle; `reconcileStatusDecision(dbStatus, live, dbSyncStatus)` returns `targetSyncStatus` — `off_feed` for
  an absent on-market row with the status PRESERVED, `synced` when live truth puts a row back on the feed;
  `resolveIdxDisplay` is false for off_feed), `app/api/cron/feed-reconcile/route.ts` (per-ghost live lookup by
  `ListingId in (...)`; rows already off_feed are excluded from the scan; `status_changed_at` only when the status
  changed; `terminal_since` when the row leaves the marketed set), `scripts/reconcile-ghosts.js` (same writes),
  `lib/retention/archive-terminals.ts` / `app/api/cron/data-retention/route.ts` / `scripts/archive-backlog-predicate.js`
  (archive population = terminal status OR off_feed).
- **Public read path** — `lib/idx/db-to-public-dto.ts` (label by transaction type; new `lifecycle` block: stage,
  inContractSince, backOnMarket, backOnMarketDate, closedDate), `lib/idx/public-dto.ts`,
  `lib/search/visibility-contract.ts` (`in_contract` public; `off_market` blocked publicly, visible to agents),
  `lib/search/canonical/status.ts`, `lib/idx/db-to-public-dto.ts` (`filterDisplayableDbListings` reads the presence
  fact; the DTO `status` reads "Off Market" and `lifecycle` carries `providerStage` / `presence` / `offFeedSince`),
  `app/api/crm/listings/route.ts` (the CRM list carries `lifecycle` — the broker-facing state — beside the preserved
  `status`), `app/portal/tenant/page.tsx` (a closed rental reads "Rented", not "Off Market"),
  `lib/search/listing-search-projection.ts` (`in_contract` / `back_on_market` flags),
  `lib/compliance/raw-data-keep-fields.ts` (the ten lifecycle fields kept).
- **Rendering** — `app/listing/[...slug]/page.tsx`, `app/components/PriceHistory.tsx` (In Contract dated by
  `PurchaseContractDate`; Sold vs Rented), `app/components/BuildingUnits.tsx`, `lib/buildings/public-building-data.ts`
  (`StandardStatus`; closed-sale history requires a sale `PropertyType`), `app/api/market/route.ts` (`StandardStatus`).
- **Open houses / archive / recovery** — Pending is open-house-eligible (same stage as ActiveUnderContract; ComingSoon
  still excluded), a Pending re-emit un-archives a drained row (it is live and publicly displayable), `Hold` is now
  the fail-closed fixture for "non-terminal but not displayable".

## 4. Production data correction — dry run only, NOT executed

`lifecycle/off-market-correction-plan.sql` / `.json` (generated by `scripts/lifecycle/off-market-correction-plan.mjs`
from the live check): rentals 40 → `Closed`, 1,042 → status RESTORED from `raw_data.StandardStatus` + `sync_status =
off_feed`; sales 2 → `Closed`, 5,878 → the same restore; the search projection mirrored. Production read-only count
(2026-09-08, canonical branch): of the 6,937 stored Withdrawn rows, 6,728 retain provider Active and 199 retain Pending
in raw_data, 4 retain Closed (in the live-Closed group), and 6 sale rows carry no provider row (5 `pending`, 1
`archived`) — those 6 are listed for manual review, never updated. Requires Maya's explicit authorization (production
mutation is held).

## 5. Validators after Domain 1

| Check | Result | What it proves / does not prove |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | the program type-checks against the generated live contract |
| Cotality boundary ratchet (`tests/runtime/cotality-boundary.test.ts`) | 497 keys, 0 new | no new raw provider read outside the boundary (the reconciler's read was moved into the lifecycle module) |
| `npm run compliance-check` | 95 pass / 0 fail | static rule set only |
| `npm run ucba:audit` | 0 regressions | checklist only |
| `npm run idx:validate` | 0 critical / 5 warnings | static IDX pipeline checks |
| `node scripts/ci/guardrails.mjs` | PASS | after excluding local `.cache/` scratch and the committed provider vocabulary snapshot (`data/cotality-contract/`) from the advertising-copy scan — provider lookup members such as `NearSchools` / `SeniorCommunityYN` are contract facts; **the public renderers must never surface them** (Fair Housing display rule, tracked for Domain 3) |
| `npm run rls:validate` | **FAIL — 20 errors, pre-existing** | all 20 are form bindings in the held `public/crm/*.html` (LivingAreaSource, BusinessType, SyndicateTo, AvailableLeaseType have no RLS-listed member; CurrentUse "Healthcare"/"Professional" are not live members; the fireplace yes/no radio is bound to the multi-select InteriorFeatures instead of FireplaceYN). None of the validator's inputs are in the Domain 1 diff. Belongs to Domain 5 (forms) and needs form edits Maya must approve. |
| Jest (runtime + lib suites: tests/runtime, lib/idx, lib/compliance, lib/search, lib/listings, lib/crm, lib/buildings, lib/open-houses, lib/retention, lib/media) | **7,719 passed · 1 failed** (438 suites pass; the one failure is the RLS reporter suite above) | pre-existing harness failures from the unpushed location commit `d4c72bf6` (building-identity eval harness, PATCH borough pin) and from local scratch (`.cache/` jest configs, `scripts/__*` probes) were repaired; the S1 pin now matches the owner ruling of 2026-09-07 (`Permission = Private` ⇒ `participant_only`) |

## 6. Decisions Maya still owns

1. ~~The word for "left the feed"~~ — **ruled 2026-09-08: Off Market**, a Mallan presence state, not a status (implemented above).
2. **DOM accrual set** — `lib/compliance/dom-tracker.ts` accrues on {Active, ActiveUnderContract}; `lib/idx/sync.ts` /
   `rebny-ucba-rules` accrue on {Active, ActiveUnderContract, Pending}. One UCBA reading must win; not changed here.
3. Open houses on **In Contract** listings are publicly eligible (consistent with ActiveUnderContract). Say if REBNY practice differs.
4. Authorize (or not) the production correction plan in §4.
5. The CRM JavaScript (`public/crm/**`, held) still carries its own status words (`manage-listings` posts `Closed`,
   now accepted server-side by transaction type; `rental-field-rules` statuses; compliance "ALLOWED" phantoms).
