# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Verified code checkpoint before this instruction update:** `8eeeb2f0f80b36aa27eb0c77da79e05643efc945`.

Before mutation, fetch/rebase/pull and verify local == remote. Never force-push over Maya's instruction commits.

# PURPOSE AND REQUIRED SEQUENCE

Finish the platform work in this exact order:

1. **Close the current Listing / Security / Publication branch completely, including the schema correction below.**
2. **Return to PR #618 and consolidate authenticated Search into one coherent Cotality-driven system.** Do not continue criterion-by-criterion patching as the primary method.
3. **Move immediately to My Listings** and finish the authenticated agent listing workspace end-to-end.
4. **Run a New Agent Readiness Gate** with a real non-Broker Agent workflow on desktop, tablet, and mobile.
5. Only after these gates close move to another brokerage area.

No phase is complete because unit tests are green. Every phase requires behavioral proof through the actual user workflow.

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
- live behavior/population where the authorized tooling can prove it.

Do not rename an old assumption “Cotality” without re-verifying its semantics.

# HARD BOUNDARIES

- No merge without Maya authorization.
- No Production deploy without Maya authorization.
- No unrelated Production Neon/R2 work.
- No destructive DB/media action.
- No Cotality write.
- No external distribution activation.
- No environment change.
- No unrelated Production backfill.
- No unrelated schema growth.

## EXPLICIT SCHEMA AUTHORIZATION — 2026-08-27

Maya has now explicitly authorized the **exact schema correction needed to remove the false Mallan `Draft` value from the Listing market-status domain**.

This authorization covers:

- editing `prisma/schema.prisma` for this exact defect;
- creating the minimal Prisma migration;
- updating all affected readers/writers/types/tests;
- applying the exact migration through the controlled `NEON.md` migration process when its safety preconditions are satisfied;
- proving the migrated behavior end-to-end.

It does **not** authorize unrelated columns/tables, environment changes, destructive operations, broad backfills, or Production deployment.

`NEON.md` remains mandatory. Read it before schema/migration work. Do not put migrations in the Vercel build. Run the required drift/preflight/migration-status checks. Prepare and test the migration immediately; respect the established production migration safety window unless Maya explicitly overrides it.

# A. LISTING / SECURITY / PUBLICATION CLOSURE

## A0. Completed corrections — preserve them

Do not regress:

- staff authority requires staff identity, not merely a role string;
- client portal roles cannot become staff authority;
- invite/impersonation ownership boundaries are hardened;
- CRM listing creation cannot fabricate Cotality/provider identity;
- `Listing.owner_client_id` is the canonical Seller/Landlord relation;
- populated owner ids serialize safely;
- Seller/Landlord portal listing resolution uses the canonical owner relation;
- destructive `reset-sync` is retired and must stay gone;
- provider reconciliation may never delete Mallan CRM/client history;
- buyer-side agent association cannot turn another broker's Cotality listing into a Mallan-authored listing;
- return-copy suppression and canonical listing identity do not regress;
- duplicate fail-open public visibility authorities remain removed;
- Mallan publication/review state is separate from Cotality market status;
- dedicated publication transition endpoint exists;
- Broker approval/publication authority is enforced;
- forged public publication blobs fail closed;
- `EXPORTED` requires actual delivery evidence and cannot be fabricated;
- `Last Published` uses actual Mallan publication history;
- public owner-removal guard includes every public market status;
- publication compliance evaluates the target audience and Fair Housing/public-ad rules apply to Mallan-authored public listings.

## A1. Owner selectors — now implemented, prove behavior

The shared Seller/Landlord picker is not closed merely because the JavaScript exists.

For BOTH Sale and Rental prove through the actual form/API/persistence workflow:

`open form → search/select canonical owner → create → response → GET/reload form → owner visible → edit unrelated field → save → reload → owner unchanged → change owner when authorized → save → reload → new owner visible`

Mandatory negatives:

- unauthorized Agent cannot assign another Agent's protected client;
- Cotality-owned external listing cannot acquire Mallan local ownership through CRM edit;
- owner id, owner name, email, or label cannot diverge into separate identity truths;
- owner selector failure must fail visibly, not silently save ownerless data when an owner was chosen.

## A2. SCHEMA CORRECTION — `Listing.status` MUST BECOME A TRUTHFUL MARKET-STATUS FIELD

The current schema is defective:

`status String @default("Active")`

is used for Cotality market status, yet Mallan-authored unpublished rows have been forced to store `Draft` because the field is non-null.

`Draft` is Mallan publication/review state. It is **not** a Cotality `Property.StandardStatus` value and must not remain the permanent storage workaround.

### Required minimal schema direction

Prefer correcting the EXISTING physical `listings.status` column rather than adding a competing status column.

Target semantics:

- `Listing.status` = canonical **market status** only;
- authority is resolved by listing authority:
  - Cotality-owned external listing → Cotality authors the market-status fact;
  - Mallan-authored local listing → Mallan authors the market-status fact using the verified Cotality-compatible market vocabulary where applicable;
- Mallan publication/review workflow lives only in `Listing.compliance.mallan_publication`;
- an unpublished Mallan-local listing with no market status has **NULL**, not `Draft`, not `Active`, and not guessed `Incomplete`.

The minimal DB correction should be evaluated first as:

- make the existing `listings.status` nullable;
- remove the DB/Prisma default `Active`;
- keep the physical column rather than creating parallel truth.

Do not add a second market-status column unless the complete impact graph proves the existing physical column cannot safely serve this canonical role.

### Required code consequences

Trace **all readers/writers** before calling the migration complete.

At minimum:

- both local create paths write/omit market status truthfully; they no longer write `Draft`;
- Cotality mapper/sync writes exact verified `StandardStatus` or null — never defaults an unknown provider status to `Active`;
- market-status transition logic supports an unset/null local market status as an explicit initial condition;
- broker-facing `Sold` / `Rented` / `Leased` remain presentation labels derived from stored `Closed` + listing type;
- publication state `DRAFT` is read from the Mallan publication namespace, not the market-status column;
- public eligibility requires BOTH valid Mallan publication visibility AND a displayable market status where the business rule requires it;
- null market status fails closed publicly;
- My Listings shows **Publication State** and **Market Status** separately;
- APIs/DTOs do not collapse those two facts back into one generic label;
- Search/CMA must never send null/local publication state to Cotality as `StandardStatus`.

### Migration safety and proof

Follow `NEON.md` exactly:

1. inspect schema drift before creating migration;
2. generate the smallest migration necessary;
3. validate migration SQL;
4. run Prisma validation/generation/type-check;
5. run grouped reader/writer tests;
6. apply only through the controlled migration process;
7. confirm migration status after apply;
8. run behavioral E2E proof against a database with the migrated schema;
9. only then allow code that depends on null market status to be considered deployable.

Do not use `prisma db push` as a shortcut around migration history.

### Legacy `Draft` rows

Do not silently mass-update Production rows.

First prove whether every existing `Listing.status = 'Draft'` row is a Mallan-authored local listing and whether any reader depends on the legacy value.

Prepare a targeted, idempotent cleanup/backfill plan with:

- exact eligibility predicate;
- dry-run count;
- before/after invariant;
- rollback path;
- proof that no Cotality-owned row can match.

Execution of a broad historical data cleanup is separate from the schema migration unless the migration can prove the affected set is exact and safe under the standing production-data rules.

Do not claim “all Draft contamination removed” until the real stored population is proven.

## A3. Seller/Landlord capabilities

Use the same canonical Listing and `owner_client_id` for:

- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval only where the source specification allows it.

Owner portal users do not directly mutate regulated canonical listing facts merely for convenience. Durable owner requests/actions belong in Mallan CRM/audit history and authorized staff applies the canonical change.

## A4. REQUIRED LISTING END-TO-END BEHAVIORAL PROOF

Do not substitute source-string assertions for this test.

Run BOTH a Sale and Rental workflow using actual route/form behavior against the migrated schema:

`Agent login`
→ create/select Seller or Landlord
→ open listing form
→ select canonical owner
→ create Mallan-authored listing
→ verify DB/API market status is null/unset and Mallan publication is DRAFT
→ reload form
→ verify every entered field and owner hydrate correctly
→ edit facts
→ save
→ reload
→ verify no silent data loss
→ add permitted documents/activity and media through the existing architecture where the test environment supports it
→ submit publication review
→ prove Agent cannot perform Broker-only approval
→ Broker reviews
→ compliance failures block publication with explicit reasons
→ set/confirm truthful market status
→ Broker approves
→ Broker chooses visibility
→ public visibility changes only through canonical publication decision
→ My Listings/owner portal/public consumer all resolve the SAME Listing identity
→ Last Published records the actual Mallan publication transition
→ later market-status transition preserves owner/publication/history
→ reload again and verify persisted state.

Mandatory negative E2E cases:

- no owner → cannot progress to publication;
- null market status → cannot appear publicly when a displayable market status is required;
- discriminatory/public-ad prohibited content → cannot publish;
- Agent cannot approve/publish when Broker authority is required;
- another Agent cannot hijack protected owner/client relation;
- Cotality external row remains read-only;
- Mallan return-copy does not compete with the canonical local Listing;
- failed save/API call cannot leave UI pretending data persisted;
- provider sync cannot erase Mallan owner/publication/history.

## A5. Listing branch closure gate

Before returning to #618, require:

- schema defect corrected in Prisma + migration;
- all Listing market-status readers/writers updated;
- owner selector E2E proven in Sale and Rental;
- Seller/Landlord workflow proven;
- grouped tests green;
- relevant full suite green;
- type-check green;
- compliance/publication/UCBA/public-visibility gates green;
- CRM build green;
- authenticated Preview/browser proof for Sale and Rental on desktop + tablet + mobile responsive breakpoints;
- independent CI evidence where available;
- existing closure document amended with actual evidence; no new master audit.

If Production migration or Production proof is still waiting on the controlled migration/deploy window, state that exact operational hold; do not relabel branch-local/Preview proof as Production proof. Continue all other safe work meanwhile.

# B. PR #618 — AUTHENTICATED SEARCH CONSOLIDATION

## B0. Stop patching isolated controls

#618 is not closed by fixing the next checkbox.

Required architecture:

`UI CONTROL → WORKFLOW CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY CONTRACT → ONE SERVER EXECUTOR → ONE FINAL RESULT UNIVERSE → ONE NORMALIZED RESULT → SAVED SEARCH / MAP / WORKBENCH / COMPARE / REPORTS / CMA / CLIENT ACTIONS`

No downstream consumer may reconstruct Search from its own provider-field table.

## B1. One canonical criteria contract per workflow

Implement explicit canonical workflow contracts:

### Sale Search
One `SaleCriteria` state/contract.

### Rental Search
One `RentalCriteria` state/contract.

### Building Search
One `BuildingCriteria` contract whose result identity is a BUILDING, not a listing row with extra filters.

### CMA
One `ComparableCriteria` contract consuming the same verified Search facts; Sale CMA and Rental CMA remain distinct analyses.

Basic and Advanced are two UI-depth views over the SAME Sale or Rental criteria object.

Switching views must not:

- recollect into another vocabulary;
- lose criteria;
- reinterpret enums;
- silently disable active filters.

The current giant browser collector/serializer chain must cease being a parallel mapping authority.

## B2. One authoritative Search mapping layer

`lib/search/canonical/field-registry.ts` is the single Search mapping registry.

Remove independent provider mapping truth from:

- browser translation tables;
- server hard-coded mapping tables where registry-driven execution can own the mapping;
- independent select-field authorities;
- Saved Search aliases;
- Map criteria maps;
- Reports/CMA field maps.

Registry entries must provide enough structured truth to determine:

- canonical workflow criterion;
- exact Cotality resource + input field(s);
- provider type/enum shape;
- operator/strategy;
- live population/capability state;
- Mallan DB/projection mapping where relevant;
- audience visibility;
- attribution/display obligations;
- alertability;
- failure behavior.

A similarly named provider field is not semantic proof.

## B3. Fix result-universe truth as one impact graph

Close these together before UI polish:

### Count semantics
Preserve distinct facts:

- original provider matching count for the original query, if known;
- phase/remainder counts for narrowed continuation queries;
- final Mallan result count + exact/lower-bound meaning.

One numeric slot cannot change meaning during a traversal.

### Empty provider page anomaly
Empty records + provider exhaustion not proven = explicit provider/search anomaly or incomplete state. It must not silently mean phase exhausted.

### Incomplete page authority
`PAGE_INCOMPLETE_BUDGET` must never become authoritative because continuation is unavailable or a fill cap was hit.

Either finish the same page or return/retain an explicit incomplete state and block downstream actions that require a complete universe.

### One universe
Every corpus-level filter, eligibility gate, return-copy suppression, dedupe, count, page, and sort decision must describe the SAME final universe.

No page-local post-filter after totals are declared.

## B4. Browser preview is never a second Search engine

A local loaded-catalogue filter may exist only as a clearly non-authoritative latency preview if it is worth the complexity.

It may never own:

- final rows;
- count/pages;
- Map universe;
- Saved Search result truth;
- Compare;
- Reports;
- CMA;
- client send/share.

Prefer removing/simplifying it if equivalence maintenance is creating drift.

## B5. Map is Search infrastructure

The current bounded head sample is not closure.

Grid and Map use the SAME canonical criteria and final listing identities.

Use verified Cotality geography + existing Mallan geocode support; do not invent a second provider truth.

Required behavior:

`viewport/polygon → canonical geographic criteria → authoritative server Search → Mallan coordinate resolution → pins`

No arbitrary sample may be presented as complete geography.

Search Within Map updates canonical criteria. Map filters survive Basic↔Advanced and Saved Search where supported.

Transportation/grid/location controls must execute truthfully or fail explicitly; never silently strip a visible broker selection.

## B6. Saved Search is a structural roundtrip

For Sale and Rental prove:

`criteria → execute → save → GET/reload → restore UI → execute`

Restored canonical criteria must be structurally equivalent to saved criteria and produce the same universe except legitimate live-market change.

Do not persist DOM ids as business authority.

## B7. Workbench / Compare / Reports / CMA share identity

Selection persists across pages by canonical Listing identity.

Compare, Reports and CMA use authoritative Search results or explicitly selected canonical listings.

CMA may not create a separate Search engine.

Sale CMA uses verified transaction truth such as `ClosePrice` / `CloseDate`; never `ListPrice` pretending to be sold data.

Rental CMA must not invent achieved rent when Cotality does not prove it.

## B8. REQUIRED SEARCH END-TO-END PROOF

For BOTH Sale and Rental, on desktop/tablet/mobile, prove:

`control interaction`
→ canonical workflow state
→ Basic↔Advanced switch without loss
→ verified Cotality mapping
→ server execution
→ result-universe declaration
→ count/sort/page
→ open detail
→ return to same results
→ Map
→ Search Within Results / Search Within Map where supported
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

Negative E2E:

- unsupported criterion fails by name;
- unknown enum cannot widen silently;
- incomplete universe cannot become authoritative;
- Map cannot imply completeness from a sample;
- Basic↔Advanced cannot lose criteria;
- Saved Search restore cannot lose criteria;
- valid zero-population value is distinct from unsupported value;
- another broker's listing cannot become Mallan-authored through agent association;
- Mallan Cotality return-copy cannot compete with canonical Mallan listing.

# C. MY LISTINGS — IMMEDIATELY AFTER SEARCH

Do not start another unrelated audit after Search.

My Listings must become the operational center for an agent's listings.

## C1. Canonical authority

One workspace correctly distinguishes:

- Mallan-authored editable listing;
- same Mallan listing with suppressed Cotality representation;
- third-party Cotality inventory, read-only;
- historical/closed listing;
- canonical Seller/Landlord owner via `Listing.owner_client_id`;
- assigned Agent/Broker without confusing assignment with authorship.

No duplicate identity or second ownership system.

## C2. Required workspace content

For each Mallan-authored listing show from one place:

- listing facts;
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
- actual Last Published;
- current user's allowed actions;
- Broker-only actions visibly restricted/explained.

Third-party Cotality inventory remains read-only.

## C3. My Listings ↔ forms ↔ portals ↔ public

Prove:

`My Listings → New Listing → Sale/Rental → owner → create → save → reload → edit → documents/media/activity → submit → Broker review → publish → My Listings state updates → owner portal same listing → public same listing when allowed`

No form may store a field that My Listings cannot reload/edit/display correctly.

## C4. REQUIRED MY LISTINGS E2E PROOF

Desktop, tablet, mobile:

- locate listing quickly;
- distinguish editable vs read-only inventory;
- resume unfinished local listing;
- see missing owner/market/compliance blockers;
- edit permitted facts and reload them;
- manage documents/media through existing architecture;
- see activity/comments/showings;
- request review;
- Broker performs restricted action;
- publication/market status update independently;
- return from Search/client workflow without losing listing context.

# D. NEW AGENT READINESS GATE

Maya has a new agent coming on board. The platform is not operationally ready until a real non-Broker Agent can use it without Maya repairing the workflow manually.

This gate covers product/technology workflow, not legal onboarding documents.

## D1. Identity/permissions

Prove a newly created Agent:

- can log in;
- is `userType=agent` with AGENT authority;
- cannot receive Broker authority through any client/portal string;
- sees only authorized clients/listings/actions;
- cannot perform Broker-only publication/compliance actions;
- cannot edit third-party Cotality inventory;
- cannot seize another Agent's protected client relation.

## D2. Day-one workflow

Using the actual non-Broker Agent account, prove:

1. login on desktop;
2. open CRM dashboard;
3. find/create a client;
4. create Buyer/Tenant opportunity where relevant;
5. run authenticated Sale Search;
6. switch Basic↔Advanced without losing criteria;
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
17. see publication + market status separately;
18. submit review but fail correctly on Broker-only approval;
19. add permitted activity/documents/media;
20. use tablet layout;
21. use mobile layout;
22. log out/login and recover durable state.

## D3. No Maya-as-workaround

The new Agent must not require Maya to:

- repair owner links;
- recover lost form fields;
- explain why Search ignored a visible criterion;
- recover a broken Saved Search;
- tell them whether a listing is editable;
- identify why publication is blocked when the UI could show it;
- reconcile duplicate Mallan/Cotality copies;
- recover activity that vanished after reload.

# E. TESTING STANDARD — END TO END MEANS END TO END

For every completed workflow, evidence must include all applicable layers:

`UI interaction → browser state → request payload → auth/validation → API/business rule → DB persistence → GET/readback → UI hydration → downstream consumer → reload/session recovery`

A test that only asserts source strings, function calls, DOM presence, or mocked JSON does not close the workflow.

Required testing mix:

- direct unit tests for pure invariants;
- negative authority/compliance tests;
- route/API integration tests;
- persistence roundtrip tests against the migrated schema;
- browser-level behavioral tests (Playwright or existing equivalent) for forms/Search/My Listings;
- responsive proof at desktop/tablet/mobile viewports;
- authenticated Preview proof;
- independent CI evidence;
- Production proof only after authorized deploy/migration.

Every E2E case must verify **observable user behavior and durable persistence**, not just HTTP 200.

# CLOSURE MODEL

For each defect/family follow:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT TESTS → NEGATIVE TESTS → INTEGRATION → E2E WORKFLOW → DOWNSTREAM CONSUMERS → COMPLIANCE → PREVIEW → PRODUCTION`

Do not start the next family merely because the first local test passed.

Do not run the whole repository after every tiny edit; run grouped targeted tests during development and the broad gates at closure boundaries.

# DEFINITION OF DONE FOR THIS EXECUTION SEQUENCE

Do not claim completion until:

- the `Listing.status` schema defect is corrected, migrated, and all readers/writers are coherent;
- no new Mallan local listing stores `Draft` as market status;
- owner selection/persistence works in both forms;
- Sale and Rental listing workflows pass full E2E persistence/publication proof;
- Search uses one canonical criteria/mapping/execution/result architecture;
- Search engine count/incomplete/anomaly defects are closed;
- Saved Search, Map, workbench, Compare, Reports and CMA use the same Search truth;
- My Listings is the canonical agent listing workspace and roundtrips every editable field/action;
- a real non-Broker Agent passes the New Agent Readiness Gate on desktop/tablet/mobile;
- Cotality remains the only provider/data authority;
- no silent data loss remains in these workflows;
- Preview + independent CI evidence exist;
- Production closure is claimed only after the separately controlled deploy/migration proof exists.

If an operational deployment window temporarily blocks Production application, continue all safe implementation/testing and document the exact remaining operational step. Do not stop the engineering work or substitute a partial state for completion.