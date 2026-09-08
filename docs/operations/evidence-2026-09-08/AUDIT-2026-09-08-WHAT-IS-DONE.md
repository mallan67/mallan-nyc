# Audit 2026-09-08 — what is actually done on the Cotality convergence (branch `search/browser-integration-2026-09-05`)

Authority: the live Cotality (Trestle) IDX Plus feed `Trestle-11371-20`, measured — not a repo constant, not a
prior report. Every "fixed" below has a test that failed before the change. Nothing was pushed; nothing in
production was mutated; no schema, env, cron or `public/crm/**` file changed.

## 1. The nine domains, in the order they were executed

| # | Domain | What the live feed proved | What was wrong in Mallan | Done (commit) | Still Maya's |
|---|---|---|---|---|---|
| 1 | Lifecycle / status | The feed delivers only Active / Pending / ComingSoon / Closed; never Withdrawn / Cancelled / Expired / Hold. Pending is the in-contract status (PurchaseContractDate on 100% of Pending sales). OffMarketDate == CloseDate on every Closed row. | 6,962 production rows labelled **Withdrawn** by the reconciler on mere absence (42 of them live Closed). In Contract hidden publicly. Closed rentals rendered "Sold". Lifecycle timestamps stripped from raw_data. Five status vocabularies. | One lifecycle authority (`lib/listings/canonical-lifecycle.ts`): In Contract public with that label, Sold / Rented by transaction type, **Delisted** for departed, every reader converged; per-ghost live lookup before any status write; dry-run correction plan. `92f13cf8` | The word "Delisted" (UCBA §5(D) rules out "Off-Market"); the DOM accrual set; open houses on In Contract listings; authorize the production correction (rent 40→Closed / 1,042→Delisted; sale 2→Closed / 5,878→Delisted). |
| 2 | One selection authority | 44 `$select` sites; four Media sites selected fewer fields than the shared classifier reads; the persisted select missed populated fields the runtime served (OwnerPays, PriceChangeTimestamp …). | Five Media select shapes, three byte-identical OpenHouse literals, an un-selected Media expand, a 24%-lossy price-change date. | `MEDIA_SELECT_FIELDS`, `OPEN_HOUSE_*`, `CANONICAL_LOCATION_SELECT_FIELDS` live with their interpreters; every site consumes them; persisted ⊇ runtime; price changes dated by PriceChangeTimestamp; ratchets. `2341308c` | `lib/idx/sync.ts` keeps three literal Media selects (IDX-sync hold). |
| 3 | Permissions / visibility | Every row carries Permission `IDX`; `Private` 0; extra tokens on 2 live Pending rows (`IDX,SyndicateOptOut`). Trestle defines IDX ("okay for IDX use") and Private ("limited distribution"), not SyndicateOptOut / OfficeInactive. | Website-only rows bypassed owner-opt-out / participants-only (ledger §13.4); the engine gate hid participants-only rows from the authenticated agent search while serving the public through the same engine (§13.3); open-house address keys for address-suppressed listings. | Mallan decisions bind on every public row; audience-aware engine gate; callers declare their audience; address key gated. `d4c7e69f` | Whether `SyndicateOptOut` / `OfficeInactive` withdraw IDX display (ask REBNY): 2 live + 4 stored Pending rows stay hidden until then. |
| 4 | Agent / office attribution | Every buyer-side scalar suppressed except the MlsIds; BuyerAgent / BuyerOffice navigations carry a payload on Closed rows only; CoListAgent2/3 and CoListOffice2 populated as scalars. | `agent_id` (stamped on third-party rows where a Mallan agent was the buyer) was read as ownership — "Exclusive listing by Mallan" + the other brokerage's agent contact card (34 rows, all Closed and hidden). Co-list 2/3 selected and discarded. | Canonical identity in the provenance classifier; neutral third-party fallback; co-list 2/3 and buyer-office ids retained. `505c638b` | Nothing renders a buyer-side name; wiring the navigations is a product decision, recorded as available. |
| 5 | Forms | — | Edit-save (PATCH) never ran the normalizer and bucketed through route-local lists: 45 contract keys (Furnished, LeaseType, FlipTax …) left only in raw_data on edit; no real round-trip test. | PATCH runs the same normalizer and persistence map as create; a handler-level POST → GET → PATCH → GET round trip. `2ce63dc2` | `public/crm/**` (held): the 20 `rls:validate` form-binding errors, 45 / 38 phantom viewer targets, the never-loaded agent dropdowns. |
| 6 | Rental workflow | On 939 Active rentals: Furnished 938, PetsAllowed 939, AvailabilityDate 939, SecurityDeposit 289; LeaseTerm / ListingTerms / LeaseAmount 0. Every filter form accepted live. | The engine refused every rental criterion (the CRM sends `furnished` and could not narrow); public paths applied furnished to sale searches; negative sale universe; 'no-fee' targeted a 0-row field; 'pet-friendly' named a non-member. | Rental-only criteria (furnished, pets, availableBy, maxDeposit) contract-typed, refused by name on a sale search, published on the contract, inherited by saved searches and alerts. `3d9aac24` | The meaning of `pets=friendly` (unit-level positives). The CRM shell still sends only `furnished`. |
| 7 | CMA / comps | 14,942 sale closings in 12 months by CloseDate; a 3-month modification window kept only 11,311 of them. | Comps windowed by ModificationTimestamp; the comp-eligibility authority unwired; the DB CMA engine filtered a column the Listing model does not declare. | CloseDate windows, eligibility authority wired (ownership segmentation when the subject's class is known), `terminal_since` for the DB engine. `fe8567fd` | Cross-class comps by default? CMA / comps still keep their own provider mapping (engine reuse needs building-scope criteria first). |
| 8 | Amenities / media / coordinates | 15 amenity values were not published members. Latitude / Longitude are **suppressed** on this feed. Tour URLs on 4.5% / 2.3% of rows. | Phantom amenity members; `has_virtual_tour` 0 in the stored projection although 3,271 rows carry a tour URL. | Every amenity value a live member or a declared text concept (ratchet). `abaea50a` | Coordinates come only from Mallan's geocoder; the projection backfill (production data step) for the tour flag. |
| 9 | CustomFields | CustomProperty payload on every row; `CustomFields` = 61 NYC/REBNY keys as a JSON string; `$expand=CustomProperty($select=CustomFields)` accepted live. | Never ingested — `custom_fields` NULL on all 26,552 production rows. | The mapper parses the payload losslessly when the row carries it. `abaea50a` | The one line in the held sync: `expandCustomProperty: true`. |

Each domain has its note under `docs/operations/evidence-2026-09-08/<domain>/` with the live counts, the census
JSON where a read-only agent census was run (selection, attribution), and the decisions.

## 2. The audit after all nine domains

| Check | Result | What it proves |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | the program type-checks against the generated live contract |
| `npm run compliance-check` | 95 pass / 0 fail | static rules (BLOCKER + STRICT) |
| `npm run ucba:audit` | 46 pass / 0 fail / 0 regressions | the UCBA checklist |
| `npm run idx:validate` | 0 critical / 6 warnings | static IDX pipeline checks |
| `node scripts/ci/guardrails.mjs` | PASS | prohibited terms, deprecated hosts |
| `npm run rls:validate` | **FAIL — 20 errors, all pre-existing form bindings in the held `public/crm` forms** (dead bindings LivingAreaSource / BusinessType / SyndicateTo / AvailableLeaseType; CurrentUse "Healthcare" / "Professional" not live; fireplace radio bound to the multi-select) | needs form edits Maya must approve (Domain 5 note lists each) |
| Cotality boundary ratchet | 486 file::field keys (baseline shrunk from 497), 0 new | no new raw provider read outside the boundary |
| Select-authority ratchet | green (literal multi-field selects only in the held sync module) | one selection authority per resource |
| Jest (runtime + lib projects: tests/runtime, lib/idx, lib/compliance, lib/search, lib/listings, lib/crm, lib/buildings, lib/open-houses, lib/retention, lib/media) | **7,827 passed · 1 failed** (452 suites pass; 6 skipped) | the 1 failure is the RLS reporter suite — the 20 held form errors above |
| Search coverage matrix (regenerated after every domain) | static-defect register: 18 items → **7 remain CONFIRMED**, all in held `public/crm/**` JavaScript or recorded as the next refactor (`cma-own-provider-mapping`, `status-vocabularies-multiplied` — the modules still exist, now derived from one lifecycle); 0 amenity phantoms; 0 behaviour defects; every business domain **PARTIAL** (none DEFECT) | what is mechanically proven vs still UNVERIFIED |

## 3. What did not change, and why

- `public/crm/**` (forms, viewers, dashboard JS), `lib/idx/sync.ts`, `.github/workflows/**`, `.claude/**`, schema,
  env, crons, production data — all held. The domain notes name the exact line each hold blocks.
- The mapper's "every Permission token must be IDX" rule — the provider documents no meaning for the extra tokens.
- Nothing pushed: **26 local commits** ahead of `origin/search/browser-integration-2026-09-05` (the 17 audit /
  authority commits from before this session plus the 9 domain commits).

## 4. Decisions Maya owns (one list)

1. "Delisted" as the word for a listing that left the feed (UCBA §5(D) rules out "Off-Market").
2. The DOM accrual set: {Active, ActiveUnderContract} (dom-tracker) vs {…, Pending} (sync / UCBA rules).
3. Open houses on In Contract listings are publicly eligible (consistent with ActiveUnderContract).
4. Whether `SyndicateOptOut` / `OfficeInactive` withdraw IDX display permission — ask rlssupport@rebny.com.
5. `pets=friendly` = the unit accepts a pet (Yes / CatsOk / DogsOk / NumberLimit / SizeLimit / BreedRestrictions).
6. Comps: cross-ownership-class comps by default, or the strict segmentation now in force.
7. Authorize the production correction plan (`lifecycle/delisted-correction-plan.sql`, dry run) and the projection backfill.
8. Release the holds that block the last lines: the CRM form bindings (20 `rls:validate` errors), `expandCustomProperty: true` in the sync, the three literal Media selects in the sync.
9. "push" — nothing has been pushed.
