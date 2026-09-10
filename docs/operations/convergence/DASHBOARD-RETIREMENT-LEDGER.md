# Dashboard retirement ledger

Measured, not remembered. Regenerate the numbers after every tranche.

This answers one question precisely: **when is `public/crm/dashboard.html` actually ready to
delete?** It is ready when every capability below reads migrated = yes, deleted = yes, proven = yes
— and not before.

## Reconciling the two units that were being quoted

Earlier checkpoints quoted "56 capabilities" (from a route census that classified 72 routes into
56 unique / 14 dead-stub / 2 already-canonical) and "71 routes" (from `Router.register` calls in
`app.js`). Those are different units and were never comparable.

From here:

- **routes** are the unit of navigation (`app.js`, currently 71);
- **capabilities** are groups of routes that move together;
- **files and bytes deleted** is the only measure that cannot be argued with, because a deleted
  file cannot be rediscovered and revived by a future agent.

A tranche that removes an *implementation* shrinks files and bytes without changing the route count.
A tranche that removes a *panel* changes both. Both kinds count, but they must not be conflated.

## Current measurements

| metric | baseline 2026-09-09 | now (2026-09-10) | change |
|---|---:|---:|---:|
| `js/dashboard` files | 49 | **37** | −12 |
| `js/dashboard` bytes | 2,341,460 | **2,170,592** | −170,868 |
| routes in `app.js` | 71 | 71 | 0 |
| `sales-crm/index.js` lines | 1,844 | 1,726 | −118 |
| `rentals-crm/index.js` lines | 1,505 | 1,493 | −12 |

Route count is unchanged on purpose: the tranches so far removed embedded **implementations**
(twelve calculator modules), not panels. Panels — and therefore routes — start moving with the
workspace tranches.

## Migrated

| Capability | Old route / panel | Canonical home | Old files | Migrated | Deleted | Proven |
|---|---|---|---|---|---|---|
| Calculators — Sales CRM Tools tab | `SalesCRM._wsTools` | `/tools/*` + `CrmCalcUI.mountForClient` | `panels/tools/**` (9 files) | yes | **yes** | `crm-calc-*` — 6 suites, parity + mutation |
| Calculators — Rentals CRM Tools tab | `RentalsCRM._lwsTools` | `/tools/*` + `CrmCalcUI.mountForClient` | `panels/tools/**` (3 files) | yes | **yes** | `crm-calc-client-context` — landlord set + prefill |
| NY transaction-tax tables | 4 competing copies | `js/calc/transaction-costs.js` | — | yes | **yes** | `crm-calc-one-tax-authority` — both paths executed |
| Hash routing | `js/dashboard/router.js` | `js/core/crm-routing.js` | router.js | yes | no — goes with the shell | `crm-single-routing-authority` — 13 tests |
| My Listings | `/ops/listings` | `section-manage` | `panels.js` (457 lines) | yes | **yes** | `crm-my-listings-filter`, `crm-delete-listing-guard` |
| Property Search | `/ops/search` | `section-main` | `panels.js` launcher | yes | no — launcher remains | browser-driven, 5 modes |

## Not yet migrated — 71 routes still registered in the retired shell

| Route group | Routes | Migrated | Deleted | Proven |
|---|---:|---|---|---|
| `/broker/*` | 21 | no | no | no |
| `/workspace/*` | 20 | no | no | no |
| `/sales/*` | 9 | partial — Tools tab only | no | Tools tab only |
| `/ops/*` | 9 | partial — search, listings | no | partial |
| `/rentals/*` | 8 | partial — Tools tab only | no | Tools tab only |
| `/settings/*` | 3 | no | no | no |
| `/lease-tracker` | 1 | no | no | no |

## Known deletion blockers

1. **`js/crm/client-database.js:25`** sends the operator to
   `/crm/dashboard.html#/workspace/client/<id>/overview`. That file is loaded by the **canonical**
   app, so the canonical CRM currently ejects into the duplicate. Must move with the client
   workspace tranche.
2. **`js/dashboard/router.js`** is the retired shell's own router. It is not a second router inside
   the canonical app (which uses `js/core/crm-routing.js`, the single hashchange owner) and it goes
   when the shell does.
3. **`panels.js`** still holds `propertySearch` (a launcher) and the broker console panels.

## Guards already in place

These fail CI if the work is undone:

- `crm-one-application.test.ts` — one application shell; one `Router.register` table; the retired
  shell may only shrink; no route may reach a deleted form fork; no second hashchange owner.
- `crm-single-entry-point.test.ts` — `/crm` serves the canonical CRM; login lands there.
- `crm-calc-one-tax-authority.test.ts` — NY tax rates exist once; `panels/tools` stays deleted; no
  file outside `js/calc/**` may declare a calculator module.
- `crm-build-drift.test.ts` — the built shell reproduces from its sources byte for byte.

Every one of these has been verified to FAIL when the defect it guards is reintroduced.
