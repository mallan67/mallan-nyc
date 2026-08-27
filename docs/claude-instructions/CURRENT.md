# CURRENT — Claude Continuation Directive

**Active branch:** `fix/auth-identity-domain-and-listing-continuity`

**Verified branch checkpoint before this instruction update:** `1ea64c4468174062d717d8039ed64b8640bc4001`.

Before any mutation, fetch/rebase/pull and verify local == remote. Never force-push over Maya's instruction commits.

## Purpose and required sequence

Finish this work in the following order without drifting into parallel audits or unrelated cleanup:

1. **Close the current listing/security/publication branch completely.**
2. **Return to PR #618 and consolidate authenticated Search into one coherent Cotality-driven architecture.** Do not continue checkbox-by-checkbox patching.
3. **Immediately move to My Listings** and finish the authenticated agent listing workspace end-to-end.
4. **Run a New Agent Readiness Gate** so an incoming agent can actually use Mallan safely on desktop, tablet, and mobile without broker-only knowledge or manual workarounds.
5. Only after those gates close should work move to the next brokerage area.

Do not stop after diagnosis when a safe code-only correction is available. Do not claim completion from green unit tests alone.

# PHASE 0 — ABSOLUTE PROVIDER AUTHORITY: COTALITY ONLY

Mallan has **one external provider/data contract only: Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE → MALLAN BUSINESS RULE → CRM / PORTALS / SEARCH / CMA / PUBLIC CONSUMERS`

There is no separate provider/data-authority layer for legacy intermediary names, standards labels, or prior integration vocabulary.

Legacy persisted DB/env identifiers that cannot safely be renamed without explicit authorization are compatibility artifacts only. They may not define new architecture or be propagated into new code.

For every active provider-facing rule retained, prove it against Cotality:

- exact resource;
- exact field;
- type;
- enum/string values;
- null/empty/unknown behavior;
- operator/filter semantics where relevant;
- permission/availability;
- live behavior/population where the authorized tooling can prove it.

Do not fake a cleanup by renaming an old assumption "Cotality" without re-verifying its semantics.

# HARD BOUNDARIES

- No merge without Maya authorization.
- No Production deploy without Maya authorization.
- No Production Neon/R2 work in this lane.
- No destructive DB/media action.
- No Cotality write.
- No external distribution activation.
- No environment change.
- No Production backfill.
- No schema migration without explicit Maya authorization of the exact migration.
- Do not contaminate PR #618 until this current branch is genuinely closed.

# A. CURRENT LISTING / SECURITY / PUBLICATION CLOSURE

## Completed corrections that must not regress

The current branch has already corrected or materially hardened these areas; preserve them:

- staff authorization requires staff identity domain, not just AGENT/BROKER text;
- client portal-role inputs are constrained;
- impersonation/invite ownership boundaries are hardened;
- CRM listing creation cannot fabricate provider identity;
- canonical `Listing.owner_client_id` server-side set/change/repair exists;
- populated `owner_client_id` no longer causes BigInt serialization failure on listing detail;
- Seller/Landlord listing resolution uses `Listing.owner_client_id`;
- destructive `reset-sync` endpoint has been retired; it must stay gone;
- Mallan history hanging off Cotality listings must never be deleted by provider reconciliation;
- another broker's Cotality listing may not become a Mallan exclusive because a Mallan agent appeared on the buyer side;
- return-copy/public visibility corrections must not regress;
- dead duplicate fail-open visibility gates remain removed;
- publication/review state is separate from Cotality market status;
- dedicated publication transition endpoint exists;
- Broker approval/publication authority is enforced;
- forged public publication blobs fail closed;
- `EXPORTED` cannot be created without real delivery evidence;
- `Last Published` uses actual Mallan publication history, latest public transition first;
- owner removal guard covers every publicly displayable market status, including `ActiveUnderContract`;
- publication compliance evaluates the target audience and does not skip Fair Housing merely because a listing is Mallan-authored.

## Remaining listing closure work

### A1. Finish owner continuity in BOTH Sale and Rental forms

`Listing.owner_client_id` is the only canonical Seller/Landlord owner relation.

Use the existing authenticated CRM clients source:

- Sale owner selector → `/api/crm/clients?role=seller`
- Rental owner selector → `/api/crm/clients?role=landlord`

Do not create a second client/owner database or free-text owner authority.

Prove for both forms:

`select owner → create → save → GET/reload → edit → save → GET/reload → owner change/repair → GET/reload`

Mandatory negatives:

- unauthorized Agent cannot assign another Agent's client;
- Cotality-owned external row cannot acquire Mallan local ownership through CRM edit;
- ownerless local draft cannot proceed through publication;
- assigning an owner removes only the owner blocker, not compliance/review blockers;
- Seller/Landlord portal resolves the same canonical listing.

### A2. Resolve the local `Listing.status = Draft` storage conflict truthfully

Cotality `Property.StandardStatus` is a Cotality market fact. Mallan publication/review state is a different business fact.

Do not guess that Cotality `Incomplete` means Mallan Draft.

Trace every writer/reader of `Listing.status`. If a truthful no-schema correction exists, implement it. If the current non-null schema makes a truthful separation impossible, finish all safe code-only work and isolate that exact schema conflict for Maya's authorization; do not silently invent a provider value.

### A3. Finish Seller/Landlord capabilities and behavioral closure

Use the same canonical listing and owner identity for:

- view;
- comments;
- documents;
- correction requests;
- pricing feedback;
- marketing approval;
- showing coordination;
- publication request/approval only where the source specification allows it.

Owner portal users do not directly mutate regulated canonical listing facts merely for convenience. Durable requests/actions belong in Mallan CRM/audit history.

For Sale and Rental prove the actual sequence:

Agent selects Seller/Landlord
→ creates canonical Mallan listing
→ owner persists
→ draft saves/reloads
→ edit saves/reloads
→ publication state persists
→ submit/review
→ unauthorized actor cannot approve
→ Broker approves only after required compliance
→ Broker chooses publication scope
→ visibility changes through the canonical decision
→ actual Mallan publication timestamp is recorded
→ public consumers agree
→ Seller/Landlord portal resolves the same listing
→ later market changes preserve Mallan history
→ no silent data loss.

### A4. Current branch closure gate

Before returning to #618:

- grouped targeted tests green;
- relevant broad suite green;
- type-check green;
- compliance/publication/UCBA/public-visibility gates green;
- CRM build green;
- Preview proof for Sale and Rental workflows;
- independent CI evidence where available;
- amend the existing closure document only; do not create another master audit.

# B. PR #618 — AUTHENTICATED SEARCH CONSOLIDATION

## B0. Stop patching individual criteria in isolation

PR #618 is not complete. The current implementation still has too many independent representations of one search.

The target architecture is exactly:

`UI CONTROL → WORKFLOW CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY CONTRACT → ONE SERVER EXECUTOR → ONE FINAL RESULT UNIVERSE → ONE NORMALIZED RESULT → SAVED SEARCH / MAP / WORKBENCH / COMPARE / REPORTS / CMA / CLIENT ACTIONS`

No downstream consumer may reconstruct Search from its own field table.

## B1. One workflow state per business workflow

Implement explicit canonical workflow contracts:

### Sale Search
One `SaleCriteria` state/contract.

### Rental Search
One `RentalCriteria` state/contract.

### Building Search
One `BuildingCriteria` contract whose result identity is a BUILDING, not a listing row with building filters.

### CMA
One `ComparableCriteria` contract consuming the same verified Search facts. Sale CMA and Rental CMA remain distinct analyses.

Basic and Advanced are two UI-depth views over the SAME Sale or Rental criteria object. Switching views must not recollect into a different vocabulary or silently lose active filters.

The current giant browser `collectSearchCriteria()` + `buildIdxSearchParams()` chain must not remain the de facto mapping authority. Refactor toward workflow contracts without creating a parallel third system.

## B2. `FIELD_REGISTRY` becomes genuinely authoritative

`lib/search/canonical/field-registry.ts` is the one Search mapping registry.

Eliminate independent provider mapping truth from:

- browser serializer tables;
- server filter hard-codes where registry-driven execution can own them;
- independent provider select lists;
- Saved Search aliases;
- Map-specific criteria maps;
- Report/CMA field maps.

The registry must carry enough structured information to determine, per criterion:

- canonical workflow key;
- Cotality resource and exact input field(s);
- expected type/enum shape;
- operator/strategy;
- population/capability status;
- DB/projection mapping where applicable;
- audience visibility;
- attribution/display obligations;
- alertability;
- failure behavior.

A criterion derived from multiple Cotality fields must list all inputs explicitly.

No criterion is executable because a similarly named field exists. Semantic equivalence must be proven.

## B3. Fix the result-universe engine before UI polish

Close these engine-truth defects as a group:

### Provider-count semantics
`providerMatched` must not be overwritten across pages/phases and then mislabeled as the original provider universe. Define and preserve distinct facts:

- initial provider matching count for the original provider query, if known;
- phase/remainder counts for narrowed continuation queries;
- final Mallan result count with exact/lower-bound meaning.

No one number may change meaning across a traversal.

### Empty provider page anomaly
An empty provider page with provider exhaustion NOT proven must not silently mean "phase exhausted". Return an explicit provider/search anomaly or incomplete result state and fail closed.

### Incomplete page authority
A `PAGE_INCOMPLETE_BUDGET` page must NEVER become authoritative merely because continuation is unavailable or a fill-attempt cap was reached.

Required outcomes:

- finish the same page;
- or mark it `SEARCH_INCOMPLETE` / equivalent and block Compare, Reports, Save-result-count, email/share/export/CMA from treating it as complete.

No "Mallan stopped reading" condition may be presented as a finished broker universe.

### Counts, paging, sort, dedupe and filtering use ONE universe

Every corpus-level criterion/gate/dedupe must occur before final page/count semantics are declared. No downstream post-filter may shrink a page after totals were announced.

## B4. Remove the second pseudo-search engine from the browser

The current loaded catalogue/local filter may remain only as clearly labeled latency preview if it materially improves UX, but it must never decide:

- authoritative rows;
- result count;
- page count;
- Map universe;
- Saved Search results;
- Compare;
- reports;
- CMA;
- client send/share.

Prefer simplifying/removing local execution if maintaining equivalence costs more complexity than it provides.

There must be one authoritative server Search answer.

## B5. Map becomes part of Search infrastructure

The existing map head-sample is not closure.

The Map must express the SAME canonical criteria/universe as the grid.

Given current Cotality coordinate limitations, use the verified Cotality geographic vocabulary plus Mallan's existing geocode support without inventing another provider truth:

`viewport/polygon → canonical neighborhoods/boroughs/postal criteria → server Search universe → Mallan geocode coordinates → pins`

Requirements:

- no arbitrary first-500 result sample presented as geographic completeness;
- Search Within Map updates the canonical criteria;
- grid and map describe the same search;
- map selection/refinement survives Basic↔Advanced and Saved Search where supported;
- transportation/grid/location criteria must either execute truthfully or fail explicitly — never silently strip a visible broker choice.

## B6. Saved Search is a true roundtrip of workflow criteria

Prove for Sale and Rental:

`criteria → execute → save → GET/reload → restore UI → execute again`

The restored canonical criteria must be structurally equivalent and return the same universe subject only to legitimate live-market change.

Do not persist browser-control ids as business authority.

Rejected/pass/client interaction state is separate from Search criteria and must not silently alter the saved query.

## B7. Workbench, Compare, Reports and CMA consume the SAME result identity

Selection must persist across paging by canonical Listing identity.

Compare, reports and CMA may only operate on authoritative Search results or explicitly selected canonical listings.

CMA must not create a separate comparable search engine.

Sale CMA uses verified transaction facts such as `ClosePrice`/`CloseDate`; never use `ListPrice` as sold truth.

Rental CMA must not invent achieved rent when Cotality does not prove it.

## B8. Search closure proof

Do not call #618 complete until the following is proven end-to-end for BOTH Sale and Rental on desktop/tablet/mobile:

control
→ canonical workflow criteria
→ verified Cotality mapping
→ server execution
→ complete/declared result universe
→ count/sort/page
→ detail
→ return to results
→ map
→ Search Within Results
→ Saved Search save/reload
→ selection
→ client action
→ Compare
→ report
→ CMA input where applicable
→ attribution/compliance
→ Preview proof.

Also prove negative cases:

- unsupported criterion fails by name;
- unknown enum never silently broadens;
- incomplete universe cannot be called authoritative;
- map cannot imply full coverage from a sample;
- another broker's listing cannot become Mallan-authored by agent association;
- suppressed Mallan Cotality return-copy cannot compete with the canonical Mallan listing;
- Basic↔Advanced does not lose criteria;
- Saved Search restore does not lose criteria;
- zero-population valid Cotality values are distinguished from unsupported values.

# C. AFTER SEARCH — MOVE IMMEDIATELY TO MY LISTINGS

Do not start another unrelated audit after Search. Move directly into **My Listings**, because an incoming agent must be able to operate the brokerage without depending on Maya to repair or explain the workflow.

## C1. My Listings must use canonical listing identity and authority

One workspace must correctly distinguish:

- Mallan-authored editable listings;
- Mallan-authored listing with suppressed Cotality return-copy;
- third-party Cotality inventory, read-only;
- historical/closed listings;
- owner/client relationship through `Listing.owner_client_id`;
- assigned Agent/Broker relationship without confusing assignment with authorship.

No duplicate listing identity and no second ownership model.

## C2. My Listings agent workspace requirements

For each Mallan-authored listing, an authorized agent should be able to see from one workspace:

- canonical listing facts;
- owner Seller/Landlord;
- publication/review state;
- actual market status;
- compliance blockers;
- media;
- documents;
- activity/timeline;
- comments;
- showing activity;
- client interactions where permitted;
- CMA/report access;
- marketing actions;
- visibility/publication status;
- real Last Published timestamp;
- actions the current user is allowed to take;
- actions reserved to Broker, visibly disabled/explained rather than silently missing.

Third-party Cotality rows remain read-only and cannot acquire Mallan ownership/edit capability merely because an agent worked with the buyer/tenant.

## C3. My Listings must connect directly to the corrected Sale/Rental forms

New Listing
→ choose Sale or Rental
→ select canonical Seller/Landlord
→ create Draft
→ save/reload
→ edit
→ media/documents
→ review/compliance
→ Broker publication decision
→ My Listings reflects new state
→ owner portal reflects same listing
→ public visibility reflects same publication decision.

No form may save data that My Listings cannot reload and edit.

## C4. Mobile/tablet/desktop agent usability

Prove the agent can, without horizontal-interface breakage or hidden essential actions:

- find a listing;
- create one;
- resume an unfinished Draft;
- see blockers;
- update editable facts;
- upload/manage permitted media/documents through the existing media architecture;
- request/perform review as allowed;
- see publication state;
- run Search from a client/opportunity and return to My Listings;
- act on client/showing/activity tasks.

Do not optimize only desktop and call the agent workflow complete.

# D. NEW AGENT READINESS GATE

Maya has a new agent coming on board. The platform must be safe and operational for that agent before this lane is called ready.

This is a PRODUCT/TECH readiness gate. It does not replace legal onboarding documents.

## D1. Identity and permissions

Prove a newly created Agent account:

- logs in successfully;
- is `userType=agent`;
- receives AGENT permissions, never Broker permissions;
- cannot escalate through client/portal roles;
- sees only clients/listings/actions within authorized brokerage scope;
- cannot alter Broker-only publication/compliance decisions;
- cannot edit third-party Cotality inventory;
- cannot access another agent's restricted client relationship where policy forbids it.

## D2. Day-one brokerage workflow

Using a non-Broker agent account, prove:

1. open CRM on desktop, tablet, mobile;
2. find/create the correct client;
3. create a Buyer/Tenant opportunity and Saved Search;
4. run authenticated Sale/Rental Search;
5. save/restore Search;
6. select/send/record listing activity for the client;
7. create or access a Seller/Landlord client as permitted;
8. create a Mallan Sale/Rental Draft linked to that owner;
9. save/reload/edit without data loss;
10. see required Broker-review/publication blockers;
11. use My Listings to resume the workflow;
12. add/show activity/comments/documents/media through authorized paths;
13. request review/publication rather than bypassing Broker authority;
14. see the resulting timeline/history.

## D3. No hidden Maya-only workaround

The new agent must not need Maya to:

- manually repair owner identity;
- manually reconstruct lost form data;
- explain why Basic and Advanced Search disagree;
- find results that pagination/map omitted;
- restore a Saved Search that changed meaning;
- fix a listing misclassified as Mallan's;
- identify whether a listing is editable;
- discover why publication is blocked;
- recover data lost by a sync/reset operation.

If any one of those is still necessary, New Agent Readiness is NOT closed.

## D4. Auditability

Critical agent actions must leave durable Mallan history:

- client creation/update;
- Saved Search creation/change;
- listing sent/shared;
- showing/task/comment/activity;
- listing create/edit;
- owner assignment/change;
- publication submissions/transitions;
- Broker approval/rejection;
- marketing/document actions where applicable.

Email delivery alone is never the only record of client activity.

# E. CI / PREVIEW / HANDOFF STANDARD

At each closure boundary use grouped targeted tests during development, then broad verification.

Required before declaring the whole sequence ready:

- relevant full suite green;
- type-check green;
- Cotality contract/mapping verification green;
- compliance/UCBA/publication/public-visibility checks green;
- CRM build green;
- authenticated Preview proof on desktop/tablet/mobile;
- non-Broker agent behavioral proof;
- Git evidence at the exact head;
- independent CI evidence where available.

Green source-string tests alone are insufficient.

# FINAL DEFINITION OF DONE FOR THIS EXECUTION SEQUENCE

Do not stop at an audit or after one subsystem turns green.

The sequence is complete only when:

1. current listing/security/publication branch is genuinely closed;
2. authenticated Search is one coherent Cotality-driven execution architecture, not a chain of competing translators;
3. Sale/Rental Search, Saved Search, Map, workbench, Compare, Reports and CMA share the same canonical criteria/result foundation;
4. My Listings is a complete agent workspace over canonical listings and history;
5. Sale/Rental authoring roundtrips through My Listings without data loss;
6. Broker-only publication/compliance authority remains enforced;
7. a new non-Broker agent can perform the day-one brokerage workflow on desktop/tablet/mobile without hidden manual repair by Maya;
8. Preview + tests + CI prove the behavior.

If any required step needs schema/environment/Production/destructive authorization, finish every safe code-only correction first, isolate only the exact blocked fact, and continue every unrelated safe item instead of stopping the whole execution lane.