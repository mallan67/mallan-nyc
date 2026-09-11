# Dashboard retirement ledger — **VOID. THE PLAN THIS TRACKS IS CANCELLED.**

> ## 🛑 DO NOT EXECUTE ANYTHING IN THIS DOCUMENT
>
> **`public/crm/dashboard.html` is the brokerage CRM. It is NOT retired, NOT a duplicate, and it is
> NEVER to be deleted.** Neither is `public/crm/js/dashboard/**`.
>
> This ledger was written on 2026-09-09 on the premise that `dashboard.html` was a duplicate CRM
> shell to be emptied and deleted. **That premise was a misclassification and was disproven on
> 2026-09-10.** A forensic census showed the two files are not two copies of one product: they are
> two different products. `dashboard.html` carries 71 registered routes, the broker and agent
> panels, and **no search engine**; `index-built.html` carries the search form, executor and
> renderer, and **no CRM panels**. The real defect was application-ownership and routing confusion —
> `/crm` had been repointed at Backend Search — corrected in `928f31c4`.
>
> Current architecture (Master Plan §5.1, mirrored in `CLAUDE.md` §A.0 and `AGENTS.md` §1.0):
>
> | Application | Files | Entry |
> |---|---|---|
> | Brokerage CRM | `public/crm/dashboard.html` + `public/crm/js/dashboard/**` | `/crm` |
> | Backend Agent Search / Listings | `public/crm/index.html` → `index-built.html` | `/crm/search` |
> | Consumer Search | `app/search/page.tsx` | `/search` `/buy` `/rent` |
>
> **What this means for every table below:** "not yet migrated" is not a backlog — those are the
> CRM's own capabilities and they stay where they are. "Deletion blockers" block nothing, because
> there is no deletion. `js/dashboard` shrinking is not progress.
>
> **Kept, not deleted**, because the record of what actually moved is still true and still useful:
> the twelve calculator modules and the four competing NY tax tables really did collapse onto one
> engine, and the duplicate **My Listings** implementation really was a duplicate — it belongs to
> Backend Search, it was deleted in `da8e3046`, and it stays deleted. The CRM's **Property Search
> control is a launcher** into Backend Search; a launcher is not a duplicate Search, and it remains.
>
> Enforced by `tests/runtime/governance-files-match-reality.test.ts`,
> `tests/runtime/crm-single-entry-point.test.ts` and `tests/runtime/crm-one-application.test.ts`.

---

*Everything below is preserved as the historical record of the 2026-09-09 convergence work. The
measurements are real. The plan they served is void — read them as "what moved and why", never as
"what still has to move".*

Measured, not remembered.

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

## The CRM's own 71 routes  *(historical heading: "Not yet migrated — 71 routes still registered in the retired shell")*

These are the brokerage CRM's capabilities. They are not a migration backlog and they are not moving.

| Route group | Routes | Migrated | Deleted | Proven |
|---|---:|---|---|---|
| `/broker/*` | 21 | no | no | no |
| `/workspace/*` | 20 | no | no | no |
| `/sales/*` | 9 | partial — Tools tab only | no | Tools tab only |
| `/ops/*` | 9 | partial — search, listings | no | partial |
| `/rentals/*` | 8 | partial — Tools tab only | no | Tools tab only |
| `/settings/*` | 3 | no | no | no |
| `/lease-tracker` | 1 | no | no | no |

## Former "deletion blockers" — none of them block anything, because there is no deletion

1. **`js/crm/client-database.js:25`** sent the operator to
   `/crm/dashboard.html#/workspace/client/<id>/overview`. The concern was real but the diagnosis was
   not: this is not the CRM "ejecting into a duplicate", it is Backend Search **launching** the CRM
   across a product boundary. The defect was addressing it by *build artifact* rather than by route.
   **Fixed in `928f31c4`** — it now navigates to `/crm#/workspace/client/<id>/overview`, and
   `crm-one-application.test.ts` fails if any runtime module addresses the CRM by filename again.
2. **`js/dashboard/router.js`** is the **CRM's own router**, and it stays. It was never a second
   router inside one page: `dashboard.html` loads it, `index.html` loads `js/core/crm-routing.js`,
   and the two applications never share a page. `crm-single-routing-authority.test.ts` pins that.
3. **`panels.js`** holds `propertySearch` — a **launcher** into Backend Search — and the broker
   console panels. All of it belongs to the CRM and stays. A launcher is not a duplicate Search.

## Guards in place — what they assert TODAY

These fail CI if the corrected architecture is undone. Updated 2026-09-10; the earlier version of
this list described assertions that encoded the disproven premise.

- `governance-files-match-reality.test.ts` — `CLAUDE.md` and `AGENTS.md` must both describe the
  three applications, must agree with the `vercel.json` rewrites, and must place themselves below
  the Master Plan in the authority order.
- `crm-single-entry-point.test.ts` — `/crm` serves the CRM, `/crm/search` serves Backend Search, the
  installed PWA opens the same application as a browser, and no public route receives the
  professional application.
- `crm-one-application.test.ts` — every page under `public/crm/` declares a role; there is no second
  hashchange owner; no runtime module addresses the CRM by build artifact.
  *(It no longer asserts that any shell "may only shrink" — that assertion was removed with the
  premise it rested on.)*
- `crm-calc-one-tax-authority.test.ts` — NY tax rates exist ONCE, in `js/calc/transaction-costs.js`,
  with **no application exempted**. The exemption for `js/dashboard/**` was removed on 2026-09-10
  and immediately exposed two live defects it had been hiding.
- `crm-build-drift.test.ts` — the built Search bundle reproduces from its sources byte for byte,
  identically on Windows and Linux.

Every one of these has been verified to FAIL when the defect it guards is reintroduced.
