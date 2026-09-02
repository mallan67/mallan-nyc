# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Current Listing/Security branch:** `fix/auth-identity-domain-and-listing-continuity`

**Verified code checkpoint:** `726f4f058175030daf22c2fd68b9678d2b123722`

**Draft closure PR:** `#625 — fix(crm): canonical listing owner, publication, and market-status separation`

Before any mutation, fetch/rebase/pull and verify local == remote. Never force-push over Maya's instruction commits. Re-read this file after rebasing because this file is the active continuation directive.

# CURRENT EXECUTION STATUS — READ FIRST

The Listing/Security/Publication code lane has materially reached its code checkpoint, but it is **NOT fully closed in Production**.

At code checkpoint `726f4f05…`:

- the exact `Listing.status` schema correction exists in Prisma + migration;
- new Mallan-authored listings no longer write `Draft` into market status;
- Sale + Rental owner selectors exist;
- Seller/Landlord ownership authorization was corrected around `Listing.owner_client_id`;
- publication state and market status are separate;
- route-level persistence/integration workflow tests exist for Sale + Rental plus mandatory negative cases;
- local reported broad suite was green;
- draft PR #625 was opened specifically to obtain independent CI + Preview evidence;
- all six GitHub PR workflows on `726f4f05…` completed successfully:
  - CRM Validation — SUCCESS;
  - Claude Code Review — SUCCESS;
  - Guardrails (Repo + Compliance) — SUCCESS;
  - Release Truth — SUCCESS;
  - Target Platform Build — SUCCESS;
  - PR checks — SUCCESS;
- Vercel Preview for PR #625 / code SHA `726f4f05…` is READY.

These facts are **not** the same as complete workflow closure.

Still open for A:

1. the migration has NOT been applied to the real database;
2. `ops:health`, drift/preflight and post-apply `migrate status` proof still have to run with the proper database credentials under `NEON.md`;
3. authenticated browser-level Sale + Rental proof has NOT yet been performed on the Preview;
4. desktop/tablet/mobile user interaction proof is still required;
5. Production deployment is NOT authorized and Production workflow proof does not exist;
6. legacy stored `Draft` cleanup is plan-only and remains unexecuted unless separately authorized after population proof.

## IMPORTANT SEQUENCING DECISION

Do **not** idle while the controlled database migration window is pending.

Treat A as:

**CODE + CI + BUILD READY, OPERATIONALLY HELD FOR MIGRATION + AUTHENTICATED BROWSER + PRODUCTION PROOF.**

Proceed with safe authenticated Search consolidation work in #618 while preserving the exact A operational holds. When the migration window/credentials are available, return to the A operational gate, run it completely, and update the closure evidence.

Do not merge #625 merely because CI and Vercel build are green.

Do not call A Production-closed until migration + real browser + authorized Production proof exist.

# REQUIRED BUSINESS SEQUENCE

1. Maintain and finish A's operational closure when the controlled migration/browser opportunity exists.
2. In parallel, **consolidate PR #618 authenticated Search into one coherent Cotality-driven architecture.** Do not continue checkbox-by-checkbox patching as the primary method.
3. After Search closes, **move immediately to My Listings** and finish the agent listing workspace end-to-end.
4. Run the **New Agent Readiness Gate** with a real non-Broker Agent on desktop, tablet, and mobile.
5. Only after those gates close move to another brokerage area.

# ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Mallan has **one external provider/data contract only: Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / PORTALS / SEARCH / CMA / PUBLIC CONSUMERS`

No legacy provider, standards, intermediary, or historical integration vocabulary may become a second data authority, mapping authority, source taxonomy, validation authority, workflow authority, or current tooling authority.

For every retained provider-facing rule prove:

- exact Cotality resource;
- exact field;
- type;
- enum/string values;
- null/empty/unknown behavior;
- operator/filter semantics where relevant;
- permission/availability;
- live behavior/population where the authorized Cotality tooling can prove it.

Do not rename an old assumption “Cotality” without re-verifying its semantics.

Do not describe a field as “RESO” or an external rule as “RLS” architecture. A field used by Mallan because Cotality exposes it is a **Cotality contract field**.

Legacy persisted identifiers that cannot safely be renamed without an explicitly controlled schema/env migration are compatibility artifacts only. Do not propagate those names into new architecture.

# HARD BOUNDARIES

- No merge without Maya authorization.
- No Production deploy without Maya authorization.
- No unrelated Production Neon/R2 work in this lane.
- No destructive DB/media action.
- No Cotality write.
- No external distribution activation.
- No environment change.
- No unrelated Production backfill.
- No unrelated schema growth.
- Public consumer Search remains protected zero-delta while #618 authenticated Search is being consolidated.

# A. LISTING / SECURITY / PUBLICATION — PRESERVE + FINISH OPERATIONAL PROOF

## A0. Corrections that must not regress

Preserve all of these:

- staff authority requires staff identity, not merely a role string;
- client portal roles cannot become staff authority;
- invite/impersonation ownership boundaries remain hardened;
- CRM listing creation cannot fabricate Cotality/provider identity;
- `Listing.owner_client_id` is the canonical Seller/Landlord relation;
- populated owner ids serialize safely;
- Seller/Landlord portal listing resolution uses canonical ownership;
- destructive `reset-sync` remains retired;
- provider reconciliation may never delete Mallan CRM/client history;
- buyer-side agent association cannot turn another broker's Cotality listing into a Mallan-authored listing;
- Mallan return-copy suppression/canonical identity cannot regress;
- duplicate fail-open public visibility authorities remain gone;
- Mallan publication/review state remains separate from market status;
- the dedicated publication transition endpoint remains the publication authority;
- Broker-only approval/publication rules remain enforced;
- forged public publication blobs fail closed;
- `EXPORTED` requires real delivery evidence;
- `Last Published` uses actual Mallan publication history;
- public owner-removal guard includes every displayable market state;
- target-audience compliance applies Fair Housing/public-ad rules to Mallan-authored public listings;
- owner-facing durable signals/requests may only attach to a listing proven through `Listing.owner_client_id`;
- owner requests are records/workflow requests, not direct mutation of regulated listing facts.

## A1. Owner selector implementation is not the same as browser proof

The shared Seller/Landlord selector code exists in both Sale and Rental forms.

Final behavioral proof still must show, through the actual authenticated form in Preview:

`open form → search/select owner → create → API success → reload browser → owner displayed → edit unrelated field → save → reload → owner unchanged → authorized owner change → save → reload → changed owner displayed`

Mandatory negatives in browser/integration proof:

- unauthorized Agent cannot assign another Agent's protected client;
- Cotality-owned external listing cannot acquire Mallan local ownership;
- typing a visible owner name without selecting canonical identity cannot masquerade as successful owner assignment;
- failed owner lookup/save is visible to the user and cannot silently persist an ownerless record after UI indicated success.

## A2. AUTHORIZED SCHEMA CORRECTION — CURRENT STATE

Maya explicitly authorized the exact correction that separates market status from Mallan publication state.

The intended canonical semantics are now:

- `Listing.status` = market status only;
- Cotality-owned external listing → Cotality authors the market-status fact;
- Mallan-authored local listing → Mallan authors local market-status progression using the verified compatible vocabulary where applicable;
- Mallan publication/review workflow lives only in `Listing.compliance.mallan_publication`;
- an unpublished Mallan-authored listing with no market status stores **NULL**;
- it does not store `Draft`, guessed `Incomplete`, or fabricated `Active`.

The branch contains the minimal schema direction:

- existing physical `listings.status` becomes nullable;
- the default `Active` is removed;
- no second competing market-status column is introduced.

Migration file:

`prisma/migrations/20260827090000_listings_status_nullable_market_status/migration.sql`

Code checkpoint implementing this family:

`ce60e0483f1cdd4779b198a91eddeae821a33cc0`

### What the nullable status change exposed and corrected

The schema change made previously unreachable fail-open defaults reachable. Those had to be corrected as part of the same impact graph:

- missing/unknown status may not normalize to `Active`;
- an unset market status may not make `idx_display_yn` true through a terminal-status deny-list;
- gate computations must fail closed on no market status;
- CRM status badges/surfaces may not render absent market status as green `Active`;
- local create/convert paths write null market status and explicit Mallan publication DRAFT;
- legacy `Draft` and current NULL must be treated equivalently for compatibility wherever the question is “has no market status yet.”

Do not reintroduce any `|| 'Active'`, default-Active, deny-list fail-open, or UI fallback that turns missing market truth into Active.

### Migration application remains operationally open

Do not apply casually.

`NEON.md` is mandatory. The Production `listings` migration must follow the controlled process and established 3–5 AM ET safety window unless Maya explicitly overrides it.

Required operational chain:

1. correct credentials available;
2. read `NEON.md` completely;
3. run schema drift check;
4. run required `ops:health` / preflight;
5. validate exact migration SQL;
6. confirm no unrelated migration is being bundled;
7. apply exact migration through migration history — never `prisma db push`;
8. confirm `prisma migrate status` after apply;
9. run post-migration route/persistence checks against the migrated DB;
10. update closure evidence with exact results.

Do not write `[neon-preflight: OK]` unless those checks actually ran and passed.

### Legacy `Draft` population

The cleanup plan exists at:

`docs/operations/legacy-draft-status-cleanup-plan-2026-08-27.md`

It is **PLAN ONLY**.

Do not execute a Production cleanup merely because the schema is now nullable.

Before any cleanup:

- prove exact row population;
- prove every matched row is Mallan-authored local inventory;
- prove no Cotality-owned row matches;
- identify all readers relying on legacy compatibility;
- dry-run exact count;
- define rollback/invariants;
- obtain the separately required data-mutation authorization if the standing rules require it.

The code must remain compatible with legacy `Draft` until the real population is safely reconciled.

## A3. Seller/Landlord capabilities

Current work added/strengthened canonical ownership and durable owner requests. Preserve it and finish the real UI/portal proof.

Capabilities must continue to resolve through one canonical Listing + owner identity for supported actions such as:

- view;
- comments;
- documents where the current schema truly supports client-scoped authorization;
- correction requests;
- pricing feedback;
- marketing approval/request;
- showing coordination;
- publication request/approval only where specified.

Do not fake missing document capability. The current owner-document path was not force-built because the existing `Deal`/`Document` structure lacks the necessary client-scoped ownership relation. That remains an explicit structural gap to resolve in the correct product/schema phase rather than bypass authorization.

Owner portal users do not directly mutate regulated canonical Listing facts just for convenience.

## A4. Route-level workflow proof already exists — final browser E2E still required

The branch now contains route-level workflow/persistence tests, including:

- `tests/runtime/listing-workflow-e2e.test.ts`
- `tests/runtime/listing-workflow-negatives-e2e.test.ts`
- in-memory persistence support that allows a write followed by an actual readback in the test harness.

These are valuable integration/persistence tests.

**Do not call them final browser E2E.**

Final Listing proof requires authenticated browser behavior on the actual Preview:

`Agent login`
→ open actual Sale/Rental form
→ select Seller/Landlord
→ create listing
→ observe success/failure UI
→ reload the page/browser state
→ verify every entered field + owner hydrates correctly
→ edit
→ save
→ reload
→ verify durable persistence
→ submit review
→ prove Agent cannot Broker-approve
→ Broker review path
→ compliance blocker UI
→ truthful market status
→ publication visibility
→ My Listings same identity
→ owner portal same identity
→ public consumer same identity when allowed
→ Last Published correct
→ later market-status change preserves owner/publication/history.

Run the equivalent negative scenarios visibly where browser proof adds value, not merely HTTP assertions.

## A5. Current independent evidence

At code SHA `726f4f058175030daf22c2fd68b9678d2b123722`, PR #625 has independent GitHub evidence:

- CRM Validation — SUCCESS;
- Claude Code Review — SUCCESS;
- Guardrails (Repo + Compliance) — SUCCESS;
- Release Truth — SUCCESS;
- Target Platform Build — SUCCESS;
- PR checks — SUCCESS.

Vercel also produced a READY Preview deployment for PR #625 / SHA `726f4f05…`.

A READY deployment proves build/deployment success. It does **not** prove the authenticated Sale/Rental workflow.

Before A is fully operationally closed, still require:

- controlled migration applied and verified;
- authenticated browser proof on a schema-compatible environment;
- desktop/tablet/mobile responsive workflow proof;
- post-migration persistence verification;
- Production proof only after separately authorized deploy.

# B. PR #618 — AUTHENTICATED SEARCH CONSOLIDATION

## B0. Search remains unfinished and fragmented

Do not patch the next checkbox and call it progress toward closure.

The current #618 contract is intended to support four authenticated brokerage workflows over one Cotality mapping authority:

- Sale Search;
- Rental Search;
- CMA;
- Building Search.

Target architecture:

`UI CONTROL → WORKFLOW CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY CONTRACT → ONE SERVER EXECUTOR → ONE FINAL RESULT UNIVERSE → ONE NORMALIZED RESULT → SAVED SEARCH / MAP / WORKBENCH / COMPARE / REPORTS / CMA / CLIENT ACTIONS`

No downstream consumer may rebuild Search from its own independent provider-field table.

Public consumer Search remains out of this PR and zero-delta.

## B1. One canonical criteria state per workflow

Create/finish explicit contracts:

### Sale Search
One `SaleCriteria` state/contract.

### Rental Search
One `RentalCriteria` state/contract.

### Building Search
One `BuildingCriteria` contract whose result identity is a BUILDING, not a listing row with additional filters.

### CMA
One `ComparableCriteria` contract consuming the same verified Search facts. Sale and Rental CMA remain different analyses.

Basic and Advanced are two UI-depth views of the SAME Sale/Rental criteria state.

Switching views must not:

- recollect into another vocabulary;
- lose criteria;
- reinterpret enums;
- silently disable or strip active filters.

The giant browser collector/serializer chain must stop being a second mapping authority.

## B2. `FIELD_REGISTRY` is the Search mapping authority

`lib/search/canonical/field-registry.ts` must become genuinely authoritative.

Remove parallel mapping truth from:

- browser translation tables;
- server hard-coded provider maps where the registry can own them;
- independent select-field lists that encode semantics separately;
- Saved Search aliases;
- Map criteria maps;
- Report maps;
- CMA maps.

Each executable criterion must have structured proof of:

- canonical workflow key;
- exact Cotality resource;
- exact Cotality field(s);
- type/enum shape;
- operator/strategy;
- null/empty/unknown semantics;
- live capability/population state;
- Mallan projection/storage mapping where relevant;
- authority resolution;
- audience/display obligations;
- alertability where applicable;
- explicit failure behavior.

A similar field name is not semantic equivalence.

A criterion derived from multiple Cotality fields must enumerate them explicitly.

## B3. Fix result-universe truth as one impact graph

Close these together before UI polish:

### Provider count semantics

Preserve separate facts for:

- original provider matching count, if known;
- phase/remainder counts from continuation/narrowed queries;
- final Mallan result count and whether it is exact or lower-bound.

One numeric slot cannot change meaning during traversal.

### Empty provider page anomaly

Empty rows while provider exhaustion is not proven must become an explicit anomaly/incomplete state. It cannot silently mean “phase exhausted.”

### Incomplete page authority

`PAGE_INCOMPLETE_BUDGET` cannot become authoritative just because continuation is missing or a fill-attempt limit was reached.

Either complete the page or return a truthful incomplete state and block downstream operations that require a complete universe.

### One universe

Eligibility, return-copy suppression, dedupe, corpus filters, sort, counts, and paging all describe the SAME final universe.

No downstream filter may shrink a page after a different total was declared authoritative.

## B4. Browser preview cannot become a second Search engine

A local loaded-catalogue filter may exist only as clearly labeled non-authoritative latency feedback if its complexity is justified.

It may never own:

- final rows;
- counts/pages;
- Map universe;
- Saved Search truth;
- Compare;
- Reports;
- CMA;
- client send/share/export.

Prefer removing/simplifying it if equivalence maintenance creates drift.

## B5. Map is Search infrastructure

The existing bounded head sample is not closure.

Grid and Map must express the same canonical criteria and canonical Listing identities.

Required architecture:

`viewport/polygon → canonical geographic criteria → authoritative server Search → Mallan coordinate resolution → pins`

Use verified Cotality geography and Mallan's existing geocode support. Do not create another provider authority.

Requirements:

- no arbitrary first-N sample shown as complete geography;
- Search Within Map updates canonical criteria;
- map refinement survives Basic↔Advanced and Saved Search where supported;
- transit/grid/location controls execute truthfully or fail explicitly;
- visible broker criteria may not be silently stripped.

## B6. Saved Search is a true criteria roundtrip

For BOTH Sale and Rental:

`canonical criteria → execute → save → GET/reload → restore UI → execute again`

Restored criteria must be structurally equivalent to the saved canonical business criteria and produce the same universe except legitimate live-market change.

Do not persist DOM element ids as business authority.

Client interaction states such as rejected/pass are separate from the Search query and may not silently mutate it.

## B7. Workbench / Compare / Reports / CMA share canonical identity

Selection persists across pages using canonical Listing identity.

Compare, reports, and CMA operate on authoritative results or explicitly selected canonical listings.

CMA cannot become a second Search engine.

Sale CMA must use verified transaction truth such as `ClosePrice` / `CloseDate`; `ListPrice` may not pose as sold data.

Rental CMA may not invent achieved rent when Cotality does not prove it.

## B8. Search browser E2E closure

For BOTH Sale and Rental on desktop/tablet/mobile prove:

`control interaction`
→ canonical workflow state
→ Basic↔Advanced switch without loss
→ verified Cotality mapping
→ server execution
→ truthful result-universe state
→ count/sort/page
→ open detail
→ return to same results
→ Map
→ Search Within Results / Map where supported
→ save search
→ reload browser/session
→ restore search
→ re-execute
→ selection across pages
→ client action
→ Compare
→ report
→ CMA input where applicable
→ attribution/compliance
→ authenticated Preview proof.

Mandatory negatives:

- unsupported criterion fails explicitly by name;
- unknown enum cannot silently broaden;
- incomplete universe cannot be called authoritative;
- Map cannot imply completeness from a sample;
- Basic↔Advanced cannot lose active criteria;
- Saved Search restore cannot lose criteria;
- zero-population valid Cotality value is distinct from unsupported;
- another broker's Cotality listing cannot become Mallan-authored through agent association;
- Mallan return-copy cannot compete with the canonical Mallan listing.

# C. MY LISTINGS — IMMEDIATELY AFTER SEARCH

Do not start another unrelated audit after Search.

My Listings must become the operational center for an agent's listings.

## C1. Canonical authority

One workspace must distinguish correctly:

- Mallan-authored editable listing;
- same Mallan listing with suppressed Cotality representation;
- third-party Cotality inventory, read-only;
- historical/closed listing;
- canonical Seller/Landlord owner through `Listing.owner_client_id`;
- assigned Agent/Broker without confusing assignment with authorship.

No duplicate listing identity or second ownership model.

## C2. Required workspace content

For Mallan-authored listings show in one workspace:

- canonical listing facts;
- owner Seller/Landlord;
- **Publication State** separately;
- **Market Status** separately;
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
- real Last Published;
- allowed actions for current user;
- Broker-only actions visibly restricted/explained.

Third-party Cotality inventory remains read-only.

## C3. Forms ↔ My Listings ↔ portals ↔ public

Prove:

`My Listings → New Listing → Sale/Rental → owner → create → save → reload → edit → documents/media/activity → submit → Broker review → publication decision → My Listings updates → owner portal same listing → public same listing when allowed`

No form may persist data that My Listings cannot reload/edit/display correctly.

## C4. My Listings browser E2E

Desktop/tablet/mobile:

- find listing quickly;
- distinguish editable vs read-only inventory;
- resume unfinished local listing;
- see missing owner/market/compliance blockers;
- edit permitted facts and reload;
- manage documents/media through the existing architecture;
- see activity/comments/showings;
- request review;
- Broker performs restricted action;
- publication state and market status update independently;
- return from Search/client workflow without losing listing context.

# D. NEW AGENT READINESS GATE

Maya has a new agent coming on board. The platform is not operationally ready until a real non-Broker Agent can use it without Maya manually repairing the workflow.

This is a product/technology gate, not a substitute for legal onboarding documents.

## D1. Identity + permissions

Prove a newly created Agent:

- logs in successfully;
- is `userType=agent` with AGENT authority;
- cannot obtain Broker authority through client/portal strings;
- sees only authorized clients/listings/actions;
- cannot perform Broker-only publication/compliance decisions;
- cannot edit third-party Cotality inventory;
- cannot seize another Agent's protected client relation.

## D2. Day-one brokerage workflow

Using an actual non-Broker Agent account prove:

1. login on desktop;
2. open CRM dashboard;
3. find/create client;
4. create Buyer/Tenant opportunity where relevant;
5. run authenticated Sale Search;
6. switch Basic↔Advanced without loss;
7. save/reload Search;
8. use Map/result workbench;
9. select/send/record client action;
10. create Seller client;
11. create Sale listing with owner;
12. save/reload/edit it;
13. create Landlord client;
14. create Rental listing with owner;
15. save/reload/edit it;
16. find both in My Listings;
17. see Publication State + Market Status separately;
18. submit review and fail correctly on Broker-only approval;
19. add permitted activity/documents/media;
20. use tablet layout;
21. use mobile layout;
22. log out/login and recover durable state.

## D3. No Maya-as-workaround

The new Agent may not require Maya to:

- repair owner links;
- recover lost fields;
- explain why Search ignored a visible criterion;
- recover broken Saved Search state;
- tell them whether a listing is editable;
- diagnose publication blockers the UI should show;
- reconcile duplicate Mallan/Cotality copies manually;
- recover activity that vanished after reload.

# E. TESTING STANDARD — END TO END MEANS END TO END

For every completed workflow, applicable evidence must cross:

`UI interaction → browser state → request payload → auth/validation → API/business rule → DB persistence → GET/readback → UI hydration → downstream consumer → reload/session recovery`

A source grep, DOM-exists assertion, route-only mock, in-memory-only route chain, unit test, green build, or HTTP 200 can each prove something useful. None alone proves the user workflow.

Required testing mix:

- unit tests for pure invariants;
- negative authority/compliance tests;
- route/API integration tests;
- persistence roundtrip tests against the schema the code expects;
- browser-level behavioral tests (Playwright or existing equivalent) for forms/Search/My Listings;
- responsive desktop/tablet/mobile proof;
- authenticated Preview proof;
- independent CI evidence;
- Production proof only after authorized migration/deploy.

Every browser E2E case must verify observable user behavior **and durable persistence**.

# CLOSURE MODEL

For each defect/family:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT TESTS → NEGATIVE TESTS → INTEGRATION → PERSISTENCE → BROWSER E2E → DOWNSTREAM CONSUMERS → COMPLIANCE → PREVIEW → PRODUCTION`

Build the impact graph before calling the correction done.

Run grouped targeted tests during development. Run broad gates at closure boundaries. Do not fall back into endless test-fails → tiny patch → next-test-fails loops.

# DEFINITION OF DONE FOR THIS EXECUTION SEQUENCE

Do not claim the platform lane complete until:

- `Listing.status` schema defect is corrected AND migration application is verified;
- no new Mallan local listing stores `Draft` as market status;
- owner selection/persistence works in both actual forms;
- Sale + Rental listing workflows pass final authenticated browser persistence/publication proof;
- Search uses one canonical workflow-criteria/mapping/execution/result architecture;
- Search count/incomplete/anomaly defects are closed;
- Saved Search, Map, workbench, Compare, Reports and CMA share one Search truth;
- My Listings is the canonical agent listing workspace and roundtrips every editable fact/action;
- a real non-Broker Agent passes the readiness gate on desktop/tablet/mobile;
- Cotality remains the sole provider/data authority;
- no silent data loss remains across these workflows;
- Preview + independent CI evidence exist for each closure boundary;
- Production completion is claimed only after separately controlled migration/deploy proof.

If a controlled migration or Production window is temporarily unavailable, continue all safe engineering on the next authorized lane and keep the exact operational hold visible. Do not stop the project and do not substitute partial proof for completion.