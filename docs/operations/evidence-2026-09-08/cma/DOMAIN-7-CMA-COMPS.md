# Domain 7 — CMA and comparables: closings dated by the closing, one eligibility authority (2026-09-08)

Scope: every CMA variation that selects comparables — the provider-side comps (`lib/comps/fetch-comps.ts`, used by
the CRM comps panel, the pitch packet and the seller-side tools) and the DB-side CMA engine (`lib/cma/engine.ts`,
`/api/crm/cma`). Sale and rental never conflated (comps are typed by the subject's PropertyType).

## 1. Provider facts (live)

| Fact | Value |
|---|---|
| `CloseDate` | populated on 578,417 rows, filterable; `OffMarketDate == CloseDate` on every Closed row (whole-corpus census) |
| Sale closings, last 12 months (`CloseDate ge 2025-09-08`) | **14,942** — of which only 11,311 were modified in the last 3 months: a 3-month ModificationTimestamp window dropped **24%** of the year's closings and admitted any older closing merely touched |
| Sale closings, last 6 months | 7,933 |
| `CommonInterest` | populated on 435,273 rows (ownership segmentation: StockCooperative / Condominium / Condop …) |
| `BathroomsTotalInteger` (the comps' bath filter) | populated 587,684, filterable |

## 2. What was wrong (register) and what changed

| Id | Defect | Fix |
|---|---|---|
| `comps-window-modification` | Comps were windowed by `ModificationTimestamp gt (now − months)` for every status. | `compsStatusWindowFilter`: closed comps carry `CloseDate ge <asOf − months>`; on-market statuses carry no window (they are current by definition). Closed-only sets are ordered by `CloseDate desc`. |
| `comp-eligibility-unwired` | The canonical comp-eligibility authority (CloseDate windowing, ownership segmentation) had no importer. | `applyCompEligibility` runs on every fetched comp: a closed comp outside the window or without a CloseDate is excluded; when the subject's ownership class is known, a comp of a different known class is excluded (co-op comps for a co-op); a comp with unknown ownership is kept; agent-selected off-market statuses (Expired …) stay as market observations under the same ownership rule. The subject's ownership is read by the canonical ownership interpreter (`commonInterestOf`) from the row's buckets — the comps route touches no provider name. |
| `cma-contract_closed` | The DB CMA engine filtered `Listing` by `contract_closed`, a Deal column the Listing model does not declare — a Prisma validation error at runtime hidden by a cast (the DB CMA path could not run). | `terminal_since` (stamped from OffMarketDate, which equals CloseDate on every Closed row). |
| `cma-own-provider-mapping` | CMA, comps and every report keep their own provider query and mapping and never import the Search engine. | **Not changed.** Converging comps onto the engine needs building-scope (BuildingName / street) and LivingArea criteria in the engine first; recorded as the next refactor, not done here. |

Tests: `tests/runtime/comps-close-date-window.test.ts` (clause, ordering, eligibility, the CMA column pin). The A1
vocabulary-chain guard lists `lib/comps/fetch-comps.ts` as the authority's designated consumer.

## 3. Decision for Maya

Ownership segmentation is now ON when the subject's ownership is known: a co-op subject receives co-op comps only,
a condo subject condo comps only (Condop is its own class). The CRM comp criteria have no "mix ownership" control;
say if the brokerage wants cross-class comps by default and it becomes one flag.
