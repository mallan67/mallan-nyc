# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search branch / PR #618:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Pre-directive verified Search code checkpoint:** `74081a17dc154c4fbf1fbc7b971196faf2f3c500`

**PR #618 state at that checkpoint:** draft, open, unmerged, mergeable. All 5 PR workflows were green. Vercel Preview built successfully. Neither CI green nor Preview READY closes Search.

**Durable continuation file:** `docs/claude-instructions/CURRENT.md`

> IMPORTANT: this file deliberately does not hard-code its own resulting commit SHA. The commit that contains this file becomes the new PR #618 head. Before any mutation, read the live PR head from GitHub and verify the local worktree matches it exactly.

## 0. START HERE — AUTHORITY AND BRANCH TRUTH

Before ANY mutation:

1. verify repository == `mallan67/mallan-nyc`;
2. verify local worktree/branch == the live remote PR #618 head;
3. fetch/pull/rebase only as appropriate to reach that exact tracked state; do not carry unrelated untracked work across lanes;
4. read THIS FILE completely;
5. read the **root** `MALLAN-PLATFORM-MASTER-PLAN.md` from the frozen documentation authority PR #595 (`agent/publish-mallan-platform-master-plan-2026-08-04`, verified head `3c7f8722a23590652d8280ccb90326448b70f116`) as READ-ONLY product/system authority;
6. do **not** look for `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` on #618 — that path is absent on the Search branch and was a stale instruction;
7. do **not** merge/cherry-pick PR #595 into #618 merely to read the Master Plan;
8. use `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` as execution-state evidence where current, subordinate to the Master Plan and this continuation file;
9. identify the exact numbered section below that you are executing;
10. do not skip ahead because another feature looks easier.

Old chats, audits, census documents, handoffs and generated mirrors are evidence only. They do not override the Master Plan, this execution sequence, current Git evidence or live authenticated Cotality truth.

### Moving base / stacking rule — verify every session

PR #618 is stacked on branch `fix/neon-r2-closure-clean-2026-08-19` / PR #620, and that base MOVES.

At the 2026-08-30 checkpoint:

- #618 Search head: `74081a17dc154c4fbf1fbc7b971196faf2f3c500`;
- current #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- exact Git comparison showed the lanes **diverged**: #618 was 174 commits ahead and 3 commits behind current #620 relative to their merge base;
- GitHub still reported #618 mergeable and generated synthetic merge `a5288452333c1c195034b6060e33b10dc558f31e`.

Do not treat those moving SHAs as permanent. Re-read #618, #620 and the current merge-ref before closure/rebase/restack decisions.

A green check attached to one moving head is not automatically proof of the newest combined Search + #620 tree. Before merge closure, explicitly prove the exact combined tree currently proposed by GitHub.

Production was still reported as `a0db2dac8b933bc2d978143721418427c0ebb65a` at this checkpoint. Re-verify before making any Production claim. #618 remains Preview-only; no Production deployment is authorized here.

# 1. CROSS-LANE STATUS — DO NOT LOSE THIS

## A. Listing / Security / Publication lane

Branch/PR #625 remains a separate lane. It had code/CI/build evidence but was **not Production-closed**. Controlled migration, authenticated browser proof and Production proof remained outstanding.

Do not interrupt Search merely because that lane is operationally held. Do not absorb its schema/migration work into #618.

## B. Search — ACTIVE

Search is the active engineering lane.

Historical B2 checkpoint `37d32cf2cad562168628d159e8900ed2785c9985` established the mapping-registry foundation. It is **not** the current operative code checkpoint.

The operative code checkpoint immediately before this directive was `74081a17...`.

Current required section remains **Section 4** until the Section 4 contract closure gate below is satisfied.

Search is NOT complete.

## C. Sequence after Search

After Search Sections 4–10 close:

1. Section 11 — My Listings;
2. Section 12 — Listing Eblast;
3. Section 13 — New Agent Readiness;
4. Section 14 — Neon/R2 only when Maya explicitly resumes that lane.

Do not jump into Section 14 during active Search work.

# 2. ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Mallan has one external property/provider data authority: **live authenticated Cotality**.

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE/PROJECTION → MALLAN BUSINESS RULE → CRM / SEARCH / BUILDING / CMA / MY LISTINGS / EBLAST / PORTALS / PUBLIC CONSUMERS`

Do not create a second provider/standards/intermediary truth.

Do not create new Mallan architecture whose provider authority is RESO, RLS, RealPlus or an old Trestle field list. Cotality's wire vocabulary may contain legacy namespace/source strings; preserve them as raw provider evidence when required, but do not promote them into a second Mallan authority.

For every executable provider-facing criterion prove where applicable:

- exact Cotality resource;
- exact declared field or declared container + observed extension key;
- type;
- enum/multi-enum/string semantics;
- null/empty/sentinel behavior;
- filter/order/expand/operator behavior;
- permission/availability;
- current live behavior/population where relevant;
- semantic equivalence to the broker-facing concept.

`$metadata` declaration alone is insufficient because the authorized feed can over-declare inaccessible/unpopulated resources. Conversely, absence of an inner JSON key from `$metadata` does not mean Cotality does not supply it when it lives inside a declared opaque field.

### Complete-feed rule — prevent another Maximum Financing miss

The feed must be studied as a complete resource/field-family contract, not as a Property-only list.

Current audit evidence has identified separate live families including Property, CustomProperty, Media, OpenHouse, Member, Office, Teams/TeamMembers, PropertyRooms, PropertyUnitTypes, HistoryTransactional, PropertyGreenVerification, and Cotality's Field/Lookup/Model/Enumeration metadata resources. Treat dated counts as evidence, not permanent authority.

`CustomProperty.CustomFields` is a declared nullable `Edm.String` whose observed NYC JSON payload carried **52 extension keys** in the 2026-08-21 census. Each key requires its own encoding, semantics, sentinel, scope and consumer disposition. Do not call the JSON family "mapped" merely because two keys have readers.

# 3. HARD SCOPE AND CHANGE CONTROL

PR #618 is authenticated CRM/backend Search only until Search closes.

IN SCOPE:

- `public/crm/**` authenticated agent Search UI;
- Sale Search;
- Rental Search;
- Building Search foundation;
- ComparableCriteria/CMA Search foundation;
- authenticated Search API/execution/mapping;
- result universe/count/pagination;
- Saved Search ownership and later full roundtrip;
- Map/Search Within Results/Search Within Map;
- authenticated result workbench;
- selection/client actions;
- Compare;
- Reports/calculators tied to authenticated Search;
- CMA runtime only after the shared Search foundation is truthful.

PROTECTED / OUT OF SCOPE FOR #618:

- public consumer Search UI/behavior;
- `app/search`;
- public `SearchFilterPanel`;
- `/api/listings` public consumer behavior;
- `lib/search/public-listing-*` and public Search contracts;
- unrelated Neon/R2 work;
- schema/migration/backfill/env change without explicit authorization;
- Cotality writes;
- Production deployment.

No production Neon/R2 probing or mutation is authorized by this file.

# 4. SEARCH STEP 1 — CANONICAL CRITERIA CONTRACTS

**CURRENT SECTION: 4 — IN PROGRESS.**

## 4.1–4.4 — material progress already made

At/through checkpoint `74081a17...`, the following foundation was materially established and must not regress:

- `SaleCriteria`, `RentalCriteria`, `BuildingCriteria` and `ComparableCriteria` exist as projections of one canonical criteria vocabulary rather than four private type systems;
- workflow applicability belongs to the canonical registry/criteria contract, not to URL parameter existence;
- criterion role determines whether a fact is broker input, workflow invariant, non-search fact or boundary refusal;
- the duplicated financing identity in the registry was merged;
- Building result identity contract is MATCHED / AMBIGUOUS / UNRESOLVED and may not use address-only or coordinates as automatic identity;
- no actual Building identity resolver was invented merely to satisfy the contract.

## 4.5 — canonical Basic/Advanced state materially repaired

At/through `74081a17...`:

- the wrong-tab defect was fixed: Sale/Rental/Building Basic surfaces no longer execute from a different hidden workflow's controls;
- one typed criteria object per workflow is the state authority;
- Basic and Advanced are views/editors of that canonical object, not independent stores;
- DOM → canonical → DOM is the direction; never control-to-control business state copying;
- the legacy second DOM reconstruction path was deleted (approximately 488 lines); one serializer remains the path to execution;
- activity dates cross MDY↔ISO through their owner and a date range without Listed/Updated basis is visibly refused;
- boolean controls read their own values;
- price and non-price custom ranges gained canonical round-trip support;
- bidirectional surface coverage work now distinguishes owned controls from explicit refusals.

These are real improvements. They do NOT prove every criterion executes correctly.

## 4.5/4.6 — KNOWN WRONG-ANSWER / CONTRACT BLOCKERS

Do not call Section 4 closed while any item below remains unresolved in the canonical-state/transport boundary.

### 4.A Sponsor Unit encoding defect

The live 2026-08-21 CustomFields evidence recorded `SponsorUnitYN` as JSON string values `"1"` / `"0"`.

At `74081a17`, `readSponsorUnit()` accepted numeric `1/0`, booleans, `"true"/"false"`, `"Yes"/"No"`, but **not string `"1"` / `"0"`**.

Required correction/proof:

- `{"SponsorUnitYN":"1"}` → true;
- `{"SponsorUnitYN":"0"}` → false;
- absent/unparseable remains unknown/null;
- use the same canonical CustomFields decoder, not a second parser.

### 4.B Maximum Financing min/max contract is inconsistent

Business/product requirement: Maximum Financing is a real professional capability and belongs to **Sale + Building**. Rental is not automatically included.

Verified source model:

`CustomProperty.CustomFields` (declared Edm.String) → observed key `MaximumFinancingPercent`.

At `74081a17`:

- Sale and Building adapters own visible min + max controls;
- the canonical value shape is a number range;
- transport only maps the minimum (`financingMin`);
- `searchParams` on the registry entry is empty;
- backend execution does not yet apply the criterion;
- registry correctly remains non-executable/unsupported with intended `mallan_projection_filter` strategy.

A visible max bound may not disappear.

Required Section 4 decision/proof:

- preserve both visible bounds through canonical → transport unless Maya explicitly changes the product contract;
- one canonical owner for both transport parameters;
- clearing either/both bounds behaves correctly;
- Basic↔Advanced roundtrip preserves both;
- while execution is not wired, Search must fail explicitly rather than return HTTP 200 with a wider universe.

**Do not drag the complete-universe financing executor backward into Section 4 merely to close this section.** Section 4 owns the canonical/transport contract and explicit refusal. Execution belongs to Sections 5–6 below.

### 4.C Canonical → transport only

Section 4.6 must prove serialization derives FROM canonical criteria and does not reconstruct business truth from DOM/raw query parameters after canonical state exists.

`URLSearchParams` is transport, not Search truth.

Required proof:

- serializer does not mutate canonical criteria;
- no second collector/reconstruction path survives;
- every emitted parameter has one canonical owner;
- every accepted current parameter resolves to one canonical criterion or an explicit boundary refusal;
- no visible criterion is silently stripped.

### 4.D Saved Search ownership only — do NOT implement full v2 here

Section 4 must trace persistence/restore ownership so it does not create a second criteria contract.

Do not move full Saved Search v2 implementation ahead of Sections 5–7.

Full canonical execute → save → reload → restore UI → execute roundtrip belongs to **Section 8**.

### 4.E Existing P1 null-money consumer defect must remain tracked

There is an unresolved non-outdated PR review on `public/crm/js/core/data-loader.js` concerning null monetary facts and renderers.

At `74081a17`, active detail rendering still mutates unknown `totalMonthly`, `maintCC` and `reTaxes` to `0` and renders them as real dollar amounts. Unknown money is not $0.

Do not lose this defect. It can be closed when the result/workbench reader impact graph is being corrected, but it must be resolved before agent Search/browser closure.

## SECTION 4 CLOSURE GATE

Do not move to Section 5 until:

- SaleCriteria drives the active Sale state path;
- RentalCriteria drives the active Rental state path;
- BuildingCriteria and ComparableCriteria ownership is established without parallel truth;
- Basic↔Advanced preserves the same canonical object in both directions;
- custom ranges round-trip, including arbitrary non-option values and clearing one/both bounds;
- Sponsor Unit `"1"/"0"` encoding is correct;
- Maximum Financing Sale+Building min/max canonical/transport ownership is coherent;
- not-yet-executable Maximum Financing fails loudly rather than widening results;
- serialization is canonical → transport only;
- every visible criterion is owned or explicitly refused;
- unsupported/unverified criteria fail explicitly;
- Saved Search ownership is traced but full v2 is not pulled forward;
- targeted direct + negative + roundtrip tests pass;
- `CURRENT.md`/handoff state no longer points at obsolete checkpoint/path.

Green CI alone does not satisfy this gate.

# 5. SEARCH STEP 2 — REGISTRY → EXECUTOR AUTHORITY

After Section 4 closes, make runtime mapping authoritative:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING OWNER → EXECUTOR`

Remove/reduce parallel criterion→provider truth from browser tables, `crm-idx-filter`, hard-coded API tables, Saved Search aliases, Map maps, Report maps and CMA maps where the registry/specialized owner should control it.

Known Section 5 blockers already recorded in the repo include:

1. **bathrooms mapping conflict** — registry/canonical bath semantics and the active executor do not yet agree;
2. **listing_id_canonical dual-domain conflict** — Mallan `SL-/RL-` references and Cotality ListingId are different domains; a Mallan reference must not be sent to Cotality as though it were a provider ListingId;
3. **Sponsor Unit** — once Section 4 encoding is correct, execution still needs an authoritative CustomFields strategy rather than a generic provider field fantasy;
4. **Maximum Financing** — registry owns the business criterion, canonical CustomFields parser owns raw interpretation, Section 5 must establish the one execution owner/strategy;
5. unverified `needs_probe` criteria such as year/floors/units/keyword/date operators must not become "verified" because code emits a clause.

### SECTION 5 CLOSURE GATE

- one mapping-authority path for every executable criterion;
- no duplicate criterion→provider truth;
- registry/executor census clean;
- mapping conflicts closed or explicitly blocked;
- unverified capabilities remain blocked;
- negative test catches drift.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

This section owns complete-universe correctness.

Required final chain:

`Cotality candidate universe → Mallan listing authority / return-copy suppression → identity/gates → dedupe → Mallan-side corpus filters → sort → final count → pagination`

Never page first and then apply a criterion that changes membership.

## 6.A Maximum Financing execution

Provider `$filter` cannot reach the observed key inside the CustomFields string.

The Mallan-side financing predicate must therefore operate over the **complete candidate universe before final count and pagination**.

Prove:

- min-only;
- max-only;
- both bounds;
- neither;
- 0.00 sentinel = not specified, never literal 0% financing;
- absent/unparseable;
- outliers handled according to verified semantics, not guessed away;
- count/pagination reflects the filtered final universe;
- no page-local financing filter.

## 6.B Open House

Open House is a real Sale/Rental broker criterion but the current recorded implementation applies it after provider pagination. That is a wrong-universe answer.

Move/implement it only when it can operate over the truthful final universe or otherwise fail explicitly.

## 6.C Count semantics

Preserve separately:

- provider match count if known;
- narrowed/continuation phase counts;
- final Mallan-authoritative count;
- exact vs lower-bound vs incomplete meaning.

Empty provider page while exhaustion is unproven is an anomaly/incomplete state, not proof of exhaustion.

A read budget may limit work; it may not become a hidden maximum searchable inventory.

### SECTION 6 CLOSURE GATE

Prove no duplicate/gap paging, truthful exact/incomplete count states, no page-local membership filters after authoritative totals, and downstream ability to distinguish complete vs incomplete/subset results.

# 7. SEARCH STEP 4 — COMPLETE SALE + RENTAL BROKER SEARCH

Once Sections 4–6 are truthful, prove the actual agent capability criterion by criterion and in meaningful combinations.

Sale includes verified combinations of price, beds, baths, property classification, market status, geography, address, amenities, open house, advanced criteria and legitimate building facts.

Rental uses its separate contract and only verified rental concepts such as rent, beds/baths, furnished, pets, availability, property type/status and fee concepts whose Cotality semantics are proven.

No supported visible criterion may be ignored, silently stripped or interpreted differently between Basic/Advanced/server.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

Do not start this section before Sections 4–7 are ready.

## Map

Grid and Map use the same canonical Search criteria, final universe and Listing identities. Search Within Map updates canonical geographic criteria; an arbitrary first-N sample may not be presented as complete geography.

Transportation/grid/location criteria execute truthfully or fail explicitly. Coordinates are map support, not Building identity and not a raw broker Search axis.

## Saved Search

Required Sale + Rental proof:

`canonical criteria → execute → save → reload session/browser → restore canonical criteria → restore UI → execute again`

The restored criteria must be structurally equivalent except legitimate live-market change.

## Workbench

Selection persists across pages by canonical Listing identity. Detail → back/return restores exact Search state.

# 9. SEARCH STEP 6 — COMPARE + REPORTS + CMA

Compare, reports/calculators and CMA consume the authoritative Search universe/selection. They do not reconstruct provider criteria independently.

Sale CMA uses verified transaction truth such as ClosePrice/CloseDate. Never use ListPrice as sold truth.

Rental CMA must not invent achieved rent where Cotality cannot prove it.

# 10. SEARCH STEP 7 — AUTHENTICATED BROWSER E2E CLOSURE

For BOTH Sale and Rental prove on desktop/tablet/mobile:

`login → Search → criteria → Basic↔Advanced → execute → truthful count/universe → sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload → restore/re-execute → selection across pages → client action → Compare → Report → CMA input where applicable → attribution/compliance`

Mandatory negative proof includes:

- unsupported criterion fails explicitly;
- unknown Cotality enum cannot silently broaden;
- incomplete universe cannot be labeled authoritative;
- Map cannot imply completeness from a sample;
- Basic↔Advanced cannot lose criteria;
- Saved Search cannot lose criteria;
- valid zero-population value is distinct from unsupported;
- another broker's Cotality listing cannot become Mallan-authored through agent association;
- Mallan Cotality return-copy cannot compete with canonical Mallan listing;
- unknown monetary values remain unknown, never false $0.

**SEARCH IS COMPLETE ONLY WHEN SECTION 10 CLOSES.**

# 11. NEXT PHASE — MY LISTINGS

Only after Search closes.

My Listings must distinguish Mallan-authored editable listings, suppressed Cotality return-copies, third-party Cotality read-only inventory, historical listings, canonical Seller/Landlord ownership and assigned Agent/Broker roles.

Required create/save/reload/edit/save/reload proof for both Sale and Rental. No silent data loss.

# 12. NEXT PHASE — LISTING EBLAST

Foundation:

`CANONICAL LISTING → MY LISTINGS → CRM PARTY/CLIENT/AGENT + SAVED SEARCH → AUDIENCE MATCH → COMPLIANT CAMPAIGN → DELIVERY → DURABLE CRM ACTIVITY`

No second contact database and no independent listing-matching engine.

# 13. NEW AGENT READINESS

After Search + My Listings + Eblast, run a real non-Broker Agent through the day-one brokerage chain on desktop/tablet/mobile. The Agent must not need Maya to repair owner links, recover lost fields, explain ignored criteria, reconcile duplicates, recover vanished activity or copy data into parallel systems.

# 14. NEON / R2 — HELD UNTIL MAYA EXPLICITLY RESUMES

Do not execute Neon/R2 work during active #618 Search work.

PR #620 is a separate moving lane. Search must not be used as Neon/R2 closure evidence.

When Maya explicitly resumes that lane, re-read current #620, `NEON.md`, deployment authority and the latest production identity. Production DB/schema/env/R2/destructive operations remain separately controlled.

Do not restart historical probing/automations merely because older handoffs mention them.

# 15. WORKTREE / BASELINE HAZARDS

Before changing unrelated code because a test fails:

1. establish clean tracked baseline;
2. verify local branch == live remote head;
3. identify other worktree/untracked artifacts;
4. compare failure with your change removed/stashed where safe;
5. prove causation;
6. do not absorb or delete another lane's work merely to make tests green.

The Search/security worktrees have historically shared generated Prisma types through one `node_modules` junction; verify generated-state contamination before diagnosing a source defect.

# 16. ANTI-LOOP CLOSURE STANDARD

For every defect family:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT TEST → NEGATIVE TEST → INTEGRATION → PERSISTENCE → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION WHEN AUTHORIZED`

Do not run an endless `test fails → tiny patch → next test fails` cycle.

Run grouped targeted tests during development and broad gates only at closure boundaries.

A source assertion, unit test, route test, CI pass or READY Preview each proves something useful. None alone proves the complete brokerage workflow.

# 17. MANDATORY PROGRESS REPORT FORMAT FOR CLAUDE

Every substantial progress update or handoff MUST begin with:

- **CURRENT SECTION:** exact numbered section/subsection;
- **STATUS:** OPEN / IN PROGRESS / CLOSED BY EVIDENCE;
- **HEAD SHA:** exact pushed tracked head;
- **BASE / STACK STATUS:** current #620 head + whether exact proposed combined tree is verified;
- **WHAT CLOSED:** specific items with evidence;
- **KNOWN WRONG-ANSWER BLOCKERS:** explicit remaining defects, not generic TODOs;
- **WHAT REMAINS IN THIS SECTION:** explicit items;
- **NEXT SECTION ALLOWED:** only if current closure gate is actually satisfied;
- **HOLDS:** schema/migration/Production/Neon/R2 or other controlled holds;
- **OUT-OF-SCOPE/BASELINE FINDINGS:** reported separately, not silently absorbed.

If intentionally departing from the numbered sequence, write:

`SEQUENCE DEVIATION — <reason>`

and explain why continuing the required section is impossible or unsafe.

Do not quietly jump from Section 4 to Saved Search v2, CMA runtime, My Listings, Eblast or Neon/R2.

# 18. DEFINITION OF DONE FOR THIS EXECUTION PROGRAM

Do not claim the program complete until:

- controlled Listing/Security migration and browser proof is closed when authorized;
- Search Sections 4–10 close with authenticated browser evidence;
- one canonical Search criteria/mapping/execution/final-universe contract powers Saved Search, Map, workbench, Compare, Reports and CMA;
- Building identity/reconciliation is proven before Building facts are collapsed from listing observations;
- My Listings closes end-to-end;
- Listing Eblast closes end-to-end using canonical Listing + CRM + Saved Search data;
- a real non-Broker Agent passes desktop/tablet/mobile readiness;
- when Maya resumes Neon/R2, that lane closes independently with authorized Production proof;
- Cotality remains the sole external property/provider data authority;
- no silent data loss remains;
- no known wrong-answer Search criterion remains hidden behind a green test;
- Production completion is claimed only after separately authorized deployment/operational proof.

If a controlled migration/deployment window is unavailable, continue the next safe authorized engineering section while preserving the exact hold. Do not relabel partial proof as completion.
