# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search branch / PR #618 head:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Search checkpoint:** `37d32cf2cad562168628d159e8900ed2785c9985`

**PR #618:** draft, open, unmerged. Do not deploy to Production.

Before any mutation, fetch/pull/rebase as appropriate and verify local == remote. Read this file completely after switching to the #618 worktree/branch. This file now exists on the Search branch specifically so a fresh Claude session does not lose the durable execution rules when leaving the Listing branch.

# CROSS-LANE STATUS — READ FIRST

## A. Listing / Security / Publication

Branch: `fix/auth-identity-domain-and-listing-continuity`

Draft PR: #625

Verified code checkpoint before Search continuation: `726f4f058175030daf22c2fd68b9678d2b123722`

A is **code + CI + build ready, but NOT fully operationally closed**.

Completed materially on A:

- canonical `Listing.owner_client_id` Seller/Landlord ownership path;
- Sale + Rental owner selector implementation;
- staff identity/role boundary hardening;
- destructive reset-sync retired;
- another broker's Cotality listing cannot become Mallan-authored merely because a Mallan agent appeared on the buyer side;
- Mallan publication state separated from market status;
- Broker-only publication approval boundary;
- forged public publication state fails closed;
- `EXPORTED` requires actual delivery evidence;
- `Last Published` uses actual Mallan publication history;
- Seller/Landlord signals/requests resolve through canonical ownership;
- route-level Sale/Rental persistence/integration workflows + negative cases;
- `Listing.status` schema correction prepared so market status is nullable/no default and Mallan publication DRAFT no longer occupies the market-status domain;
- PR #625 independent GitHub CI passed at `726f4f05…`;
- Vercel Preview for PR #625 at `726f4f05…` is READY.

Still open on A:

1. Production/real DB migration application has NOT occurred;
2. `ops:health`, drift/preflight and post-apply migrate-status proof have NOT occurred with the correct DB credentials;
3. authenticated browser Sale + Rental workflow proof has NOT occurred;
4. desktop/tablet/mobile browser proof has NOT occurred;
5. Production deploy/proof is NOT authorized and has NOT occurred;
6. legacy stored `Draft` cleanup is plan-only and unexecuted.

Do not stop Search work while A waits for the controlled migration/browser opportunity. Do not call A Production-closed.

When returning to A, regenerate Prisma from A's schema before type-checking because the local worktrees share one `node_modules` junction and `prisma generate` in one worktree changes the generated types seen by the other.

# ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Mallan has one external provider/data authority: **Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / SEARCH / CMA / PORTALS / PUBLIC CONSUMERS`

Do not create, preserve, or reintroduce a separate RLS, RESO, RealPlus, Trestle, intermediary, standards, or legacy-provider architecture layer.

Legacy persisted identifiers may remain only as compatibility artifacts when changing them requires a separately controlled schema/env migration. Do not expand those names into new code or architecture.

Every provider-facing Search fact must be proven against authorized live Cotality evidence when the fact is about provider semantics/capability. Repo code may prove what Mallan currently asks for, but that is not proof Cotality accepts or means it.

For every executable provider criterion prove where applicable:

- exact Cotality resource;
- exact field(s);
- type;
- exact enum/string semantics;
- null/empty/unknown behavior;
- operator/filter semantics;
- permission/availability;
- live behavior/population;
- semantic equivalence to the broker-facing criterion.

# HARD SEARCH SCOPE

PR #618 is authenticated CRM/backend Search only.

IN SCOPE:

- `public/crm/**` authenticated agent Search UI;
- Sale Search;
- Rental Search;
- Saved Searches;
- authenticated result workbench;
- Map / Search Within Results / Search Within Map;
- selection/client actions;
- Compare;
- Reports/calculators tied to authenticated Search;
- CMA inputs/foundation;
- Building Search foundation;
- authenticated Search API/execution/mapping.

PROTECTED / OUT OF SCOPE:

- public consumer Search UI/behavior;
- public Search contracts;
- `app/search`;
- public `SearchFilterPanel`;
- `/api/listings` public consumer behavior;
- `lib/search/public-listing-*` public consumer contracts;
- `lib/search/types.ts` public consumer contract.

No Production deploy from #618.
No schema/migration/backfill/env changes from #618 without separate explicit authorization.
No unrelated Neon/R2 work in this lane.
No Cotality write.

# B — AUTHENTICATED SEARCH CONSOLIDATION

## B0. Architecture target

Search must stop being several representations of the same query.

Required chain:

`UI CONTROL → CANONICAL WORKFLOW CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY CONTRACT → ONE SERVER EXECUTOR → ONE FINAL RESULT UNIVERSE → ONE NORMALIZED RESULT → SAVED SEARCH / MAP / WORKBENCH / COMPARE / REPORTS / CMA / CLIENT ACTIONS`

Do not continue checkbox-by-checkbox patching as the primary method.

## B2 — COMPLETED CHECKPOINT `37d32cf2…`

The first architecture consolidation step is complete and must not regress.

### Proven defect

`lib/search/canonical/field-registry.ts` called itself the canonical Search mapping authority, but the authenticated executor never imported/consumed it and could not reliably join to it because `searchParam` was prose rather than a stable machine key.

The source census proved drift:

- 16 numeric criterion→field mappings existed only in the executor;
- 16 further params read by the executor had no registry entry;
- `searchParam` values were prose such as `minPrice/maxPrice`, `beds/maxBeds`, `amenities:pet-friendly`;
- borough registry/executor disagreed;
- bathrooms registry/executor disagreed;
- address registry/executor disagreed;
- `standard_status` and `mls_status` each had duplicate entries and `.find()` made the older entry authoritative by accident.

### Correction landed

Commit `37d32cf2cad562168628d159e8900ed2785c9985`:

- adds `searchParams: readonly string[]` as a real machine join key;
- keeps prose `searchParam` only as deprecated descriptive compatibility;
- adds `mappingOwner` for canonical modules that properly own mapping behavior already;
- prevents delegating registry entries from restating a provider field independently;
- adds `cotalityFields` for multi-field/composite criteria;
- merges duplicate status entries while preserving live-verified evidence conservatively;
- adds missing registry entries including explicit refusal states;
- marks new/unproven provider capabilities `needs_probe`, not `yes`;
- adds `scripts/search/registry-vs-executor-census.mjs` read-only source census;
- adds `lib/search/__tests__/one-search-mapping-authority.test.ts` anti-drift guard.

The new tests fail if:

- an executor-read param is absent from the registry;
- registry and executor name conflicting fields;
- a param resolves to duplicate entries;
- a delegated mapping also restates an independent provider field;
- a `mappingOwner` points to no canonical owner;
- a canonical key is duplicated.

Census sections A and C were reported `(none)` after correction.

Search suite reported: **48 suites / 1,457 tests pass**.

### Important limitation

B2 does NOT prove new Cotality semantics. It proves Mallan's internal registry/executor relationship. Provider capability remains live-Cotality evidence only.

## NEXT — B1 CANONICAL CRITERIA CONTRACT

This is the next structural task.

The authenticated executor's public interface is still effectively `URLSearchParams`. The browser still recollects controls into transport vocabulary, which means Basic/Advanced cannot be guaranteed to represent one durable business object.

Do not solve this by creating another parallel DTO on top of the old collector without retiring/reducing the old authority.

Required target:

### Sale
One explicit `SaleCriteria` business contract.

### Rental
One explicit `RentalCriteria` business contract.

### Building
One explicit `BuildingCriteria` contract with BUILDING identity/results.

### CMA
One `ComparableCriteria` contract reusing verified Search facts; Sale and Rental CMA remain distinct analyses.

Basic and Advanced must edit/view the SAME Sale or Rental criteria object.

Switching Basic ↔ Advanced must not:

- recollect from DOM into a different vocabulary;
- lose active criteria;
- change null/empty semantics;
- reinterpret enums;
- silently strip a criterion because one UI depth does not display it.

The canonical criteria object should be the thing Saved Search persists/restores, not DOM ids and not raw transport query params.

Transport serialization to the server must be a derived operation from canonical criteria, not the business model itself.

## B3 — RESULT UNIVERSE TRUTH MUST FOLLOW AS ONE IMPACT GRAPH

After/alongside criteria-contract consolidation, close these together before UI polish:

### Count semantics

Do not overwrite one `providerMatched` variable across phases and later label it as the original provider universe.

Preserve distinct facts:

- original provider match count, if known;
- narrowed/continuation phase counts;
- final Mallan result count;
- whether each count is exact/lower-bound/incomplete.

### Empty provider page anomaly

`records.length === 0` while exhaustion is unproven cannot silently become `phaseExhausted=true`.

Return an explicit anomaly/incomplete condition and fail closed.

### Incomplete budget page

`PAGE_INCOMPLETE_BUDGET` can never become authoritative because continuation is unavailable or a retry/fill cap was reached.

Either complete the same page or keep an explicit incomplete result state. Downstream Compare/Report/CMA/share/count-truth actions that require a complete universe must refuse or clearly operate on an explicitly selected subset.

### One universe

Eligibility, return-copy suppression, corpus filters, dedupe, sort, counts, paging, Map, and result selection must describe the same canonical result universe.

No post-page filter can silently shrink the page after a different total was announced as authoritative.

## B4 — BROWSER LOCAL SEARCH MAY NOT BE A SECOND AUTHORITY

The local loaded-catalogue filtering path may remain only as explicitly non-authoritative latency preview if it genuinely improves UX and can be maintained safely.

It may never own:

- final rows;
- result count/pages;
- Map universe;
- Saved Search result truth;
- Compare;
- Reports;
- CMA;
- client send/share/export.

Prefer simplifying/removing it if maintaining exact equivalence costs more complexity than it saves.

## B5 — MAP IS SEARCH INFRASTRUCTURE

Current first-N/head-sample Map behavior is not closure.

Grid and Map must use the same canonical criteria and canonical Listing identities.

Target:

`viewport/polygon → canonical geographic criteria → authoritative Search execution → Mallan coordinate support → pins`

Do not present an arbitrary sample as geographic completeness.

Search Within Map updates canonical criteria.

Visible transit/grid/location criteria must execute truthfully or fail explicitly; never silently strip a broker choice.

## B6 — SAVED SEARCH ROUNDTRIP

For Sale and Rental prove:

`canonical criteria → execute → save → reload session/browser → restore criteria → restore UI → execute again`

The restored business criteria must be structurally equivalent except legitimate live-market change.

Client interaction states such as pass/reject are separate from Search criteria.

## B7 — WORKBENCH / COMPARE / REPORTS / CMA

Selection persists across pages by canonical Listing identity.

Compare/Reports/CMA consume authoritative Search results or explicit canonical selections.

CMA may not build a separate Search engine.

Sale CMA uses verified transaction truth such as `ClosePrice`/`CloseDate`; never `ListPrice` posing as sold truth.

Rental CMA cannot invent achieved rent where Cotality does not prove it.

## B8 — FINAL SEARCH BROWSER E2E

For BOTH Sale and Rental on desktop/tablet/mobile prove:

`control interaction`
→ canonical criteria state
→ Basic↔Advanced with zero loss
→ verified Cotality mapping
→ server execution
→ truthful result-universe declaration
→ count/sort/page
→ detail
→ return to same result state
→ Map
→ Search Within Results / Map
→ Saved Search save
→ browser/session reload
→ restore
→ re-execute
→ selection across pages
→ client action
→ Compare
→ Report
→ CMA input where applicable
→ attribution/compliance
→ authenticated Preview proof.

Mandatory negative proof:

- unsupported criterion fails explicitly;
- unknown enum cannot silently broaden;
- incomplete result universe cannot be labeled authoritative;
- Map cannot imply completeness from a sample;
- Basic↔Advanced cannot lose criteria;
- Saved Search restore cannot lose criteria;
- valid zero-population Cotality value remains distinct from unsupported;
- another broker's Cotality listing cannot become Mallan-authored through agent association;
- Mallan Cotality return-copy cannot compete with the canonical Mallan listing.

# CURRENT #618 BASELINE / WORKTREE HAZARDS

Do not misattribute these to B2 without proving causation.

Claude measured the baseline with B2 stashed out and reported the same failures with and without B2:

- `jest-config-reachability` is affected by stray `.cache/closure2/**/jest.config.js` scratch artifacts;
- three failing suites are untracked files from other workstreams in the worktree:
  - `crm-my-listings-pagination`;
  - `ensure-listing-reserved-namespace`;
  - `buyer-participation-mapper`;
- `buyer-participation-mapper` also accounts for two type-check errors by importing symbols that do not exist on any branch.

Do not delete, absorb, or casually "fix" someone else's untracked work merely to make #618 look green.

Establish baseline vs branch-caused failure before modifying unrelated files.

### Shared generated Prisma hazard

The Search and security worktrees share a single `node_modules` by junction.

`prisma generate` in either worktree changes generated Prisma types seen by BOTH worktrees.

Before trusting type-check results:

- on #618, generate from #618's own schema;
- on A, regenerate from A's nullable-status schema.

Do not diagnose phantom type errors until this is normalized.

# AFTER SEARCH — MY LISTINGS

Once Search is genuinely closed, move immediately to My Listings. Do not open another unrelated audit.

My Listings must become the authenticated agent operational center for:

- Mallan-authored editable listings;
- suppressed Cotality return-copy of the same canonical Mallan listing;
- third-party Cotality read-only inventory;
- historical/closed listings;
- Seller/Landlord via `Listing.owner_client_id`;
- assigned agent vs authorship distinction;
- Publication State separately from Market Status;
- compliance blockers;
- media;
- documents;
- activity/timeline;
- comments;
- showings;
- permitted client activity;
- CMA/reports;
- marketing actions;
- visibility/publication scope;
- actual Last Published;
- role-specific allowed/restricted actions.

Prove actual browser create/save/reload/edit/reload and no silent data loss.

# NEW AGENT READINESS GATE

After My Listings, prove a real non-Broker Agent can use the brokerage without Maya as a workaround.

Required day-one flow includes:

- login;
- CRM/client/opportunity;
- authenticated Sale/Rental Search;
- Basic↔Advanced;
- Saved Search;
- Map/workbench/client action;
- Seller + Sale listing create/save/reload/edit;
- Landlord + Rental listing create/save/reload/edit;
- My Listings;
- publication + market status displayed separately;
- Agent correctly blocked from Broker-only approval;
- permitted activity/documents/media;
- desktop/tablet/mobile;
- logout/login durable recovery.

The agent must not need Maya to repair owners, recover lost fields, explain ignored Search criteria, recover Saved Searches, identify editable inventory, diagnose hidden publication blockers, reconcile duplicate Mallan/Cotality identities, or recover vanished activity.

# TESTING / CLOSURE STANDARD

For every workflow:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT TEST → NEGATIVE TEST → INTEGRATION → PERSISTENCE → BROWSER E2E → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION`

A source-string assertion, unit test, route handler test, in-memory persistence chain, CI pass, or READY Preview each proves something useful. None alone proves the actual user workflow.

Do not fall back into endless fail→tiny-patch→next-fail cycles. Build the full impact graph, run grouped targeted tests during development, then broad closure gates.

# DEFINITION OF DONE FOR THE CURRENT EXECUTION SEQUENCE

Do not claim completion until:

- A's schema migration is actually applied/verified and browser/Production proof is completed when authorized;
- no new Mallan local listing stores Draft as market status;
- Sale/Rental owner workflow works in the actual browser;
- #618 has one canonical criteria/mapping/execution/result architecture;
- result count/incomplete/anomaly truth is fixed;
- Saved Search, Map, workbench, Compare, Reports and CMA share the same Search truth;
- My Listings is the canonical agent listing workspace;
- a real non-Broker Agent passes the readiness gate on desktop/tablet/mobile;
- Cotality remains the sole provider/data authority;
- no silent data loss remains;
- independent CI + authenticated Preview proof exists at each closure boundary;
- Production completion is claimed only after separately controlled migration/deploy proof.
