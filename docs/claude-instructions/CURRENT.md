# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search branch / PR #618:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Search checkpoint before this directive:** `3096a6448d72895585b9ac93f4cdc84cccc99a18`

**PR #618 at that checkpoint:** draft, open, unmerged, mergeable. All five GitHub PR workflows passed. Green CI is evidence, not workflow closure.

**Durable continuation file:** `docs/claude-instructions/CURRENT.md`

> This file deliberately does not hard-code its own resulting commit SHA. The commit containing this revision becomes the new #618 head. Before any mutation, read the live PR head from GitHub and verify the local worktree matches it exactly.

# 0. START HERE — AUTHORITY / BRANCH TRUTH

Before ANY mutation:

1. verify repository == `mallan67/mallan-nyc`;
2. verify local branch/worktree == the live remote PR #618 head;
3. fetch/rebase only as needed to reach that exact tracked state — never force over a moving shared branch;
4. read THIS FILE completely;
5. read the root `MALLAN-PLATFORM-MASTER-PLAN.md` from frozen documentation authority PR #595 (`agent/publish-mallan-platform-master-plan-2026-08-04`, verified head `3c7f8722a23590652d8280ccb90326448b70f116`) as READ-ONLY product/system authority;
6. do NOT look for `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` on #618; that was a stale path;
7. do NOT merge/cherry-pick #595 into #618 merely to read the Master Plan;
8. use `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` as execution-state evidence where current, subordinate to the Master Plan and this file;
9. identify the exact numbered section below before editing;
10. do not skip ahead because another feature looks easier.

Old chats, audits, census files and handoffs are evidence only. Live authenticated Cotality, current Git evidence and the canonical authorities above control.

## Moving stack — verify every session

PR #618 is stacked on PR #620 / branch `fix/neon-r2-closure-clean-2026-08-19`, and that base moves.

Verified 2026-08-30 immediately before this directive:

- #618 head: `3096a6448d72895585b9ac93f4cdc84cccc99a18`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**, Search is **177 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- GitHub synthetic merge for #618 at this checkpoint: `d43b9fa34121a49b838ecbd42e99210cc53e2f33`;
- Production is still reported by the active PR authority as `a0db2dac...`; re-verify before any Production claim.

Do not restack/rebase the shared Search branch without Maya's explicit approval. Before merge closure, prove the exact proposed combined tree, not merely the Search-head checks.

# 1. ABSOLUTE PROVIDER AUTHORITY — COTALITY ONLY

Canonical chain:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE/PROJECTION → MALLAN BUSINESS RULE → CRM / SEARCH / BUILDING / CMA / MY LISTINGS / EBLAST / PORTALS / PUBLIC`

Cotality is the one external property/provider authority. Do not create Mallan architecture whose provider authority is RESO, RLS, RealPlus, an old Trestle field list or a handwritten historical reference.

For every executable provider-facing capability prove where applicable:

- exact Cotality resource;
- exact declared field/container and observed extension key if applicable;
- type/enum encoding;
- null/empty/sentinel semantics;
- filter/order/expand/operator support;
- permission/availability;
- live population/behavior where material;
- semantic equivalence to the broker-facing concept.

`CustomProperty.CustomFields` is a declared nullable string container. Dated evidence found 52 inner NYC extension keys. Each key needs its own semantics/disposition; decoding the JSON container does not make all keys mapped.

# 2. HARD SCOPE / CHANGE CONTROL

PR #618 is authenticated CRM/backend Search only until Search closes.

IN SCOPE:

- `public/crm/**` authenticated agent Search;
- Sale/Rental criteria and execution;
- Building Search foundation;
- ComparableCriteria/CMA Search foundation;
- authenticated Search API/mapping/executor;
- result universe/count/pagination;
- Map / Search Within Results / Search Within Map;
- Saved Search ownership now and full roundtrip later in §8;
- workbench selection/client actions;
- Compare / Reports / CMA after the Search foundation is truthful.

PROTECTED / OUT OF SCOPE:

- public consumer Search (`app/search`, public `SearchFilterPanel`, `/api/listings`, `lib/search/public-listing-*`, public Search contracts);
- unrelated Neon/R2 work;
- schema/migration/backfill/env changes without explicit authorization;
- Cotality writes;
- Production deployment.

# 3. SEARCH FOUNDATION ALREADY ESTABLISHED — DO NOT REGRESS

Historical B2 checkpoint `37d32cf2...` made `FIELD_REGISTRY` mechanically joinable to execution. Later work through `74081a17...`, `dd4eff61...` and `3096a644...` materially established:

- `SaleCriteria`, `RentalCriteria`, `BuildingCriteria`, `ComparableCriteria` ownership;
- one canonical workflow state rather than Basic/Advanced parallel truth;
- DOM → canonical → DOM direction;
- old second DOM reconstruction path removed;
- status transport defect corrected;
- criterion roles and workflow applicability in canonical authority;
- Sponsor Unit decoding centralized in canonical CustomFields parser;
- Maximum Financing identity merged to one canonical criterion;
- financing min/max both represented in canonical transport ownership;
- explicit unsupported/fail-loud behavior where execution is not yet truthful.

This foundation is not Search completion.

# 4. SEARCH STEP 1 — CANONICAL CRITERIA CONTRACTS

**CURRENT SECTION: 4 — STILL OPEN. DO NOT START §5 YET.**

## 4.1–4.5 material state

The structural canonical-state work is materially complete enough to attempt closure:

- Sale and Rental have separate workflow contracts over one canonical vocabulary;
- Building and Comparable/CMA ownership exists without a separate provider truth;
- Basic/Advanced edit the same canonical workflow object;
- custom ranges have canonical support;
- Sponsor Unit observed string encodings `"1"` / `"0"` are decoded correctly;
- Maximum Financing is Sale + Building, not Rental;
- Saved Search ownership has been traced; full v2 implementation remains in §8.

## 4.6 Maximum Financing transport — CODE PATH NOW CORRECT, BEHAVIORAL CLOSURE STILL MISSING

At `3096a644...`, the four transport hops were corrected:

1. `FIELD_REGISTRY.searchParams` now owns `financingMin` + `financingMax`;
2. `buildIdxSearchParams` carries both;
3. `api-client.js` forwards both;
4. `crm-idx-filter.ts` reads either/both and throws `UnsupportedSearchCriterionError` until complete-universe execution exists.

This is the correct interim product behavior: a broker asking for financing must not receive a widened HTTP 200 answer.

However, DO NOT call this boundary behaviorally closed yet. The new transport test is still principally a **source-structure census**. Mallan's rules explicitly say source-string assertions protect invariants but do not prove workflows.

Required final §4 financing proof:

- execute the REAL canonical serializer/buildIdxSearchParams path with min-only, max-only, both and neither;
- execute the REAL API-client request builder/stubbed fetch and prove both query keys reach `/api/idx/search`;
- prove the server returns the typed unsupported criterion response for min-only, max-only and both while neither proceeds normally;
- prove zero is not silently dropped if zero reaches the transport contract;
- no hand-restated shadow transport table in the test.

Complete-universe financing filtering is NOT §4. It remains §6.

## 4.7 Null-money reader correction — CODE IMPROVED, CLAIM OF RUNTIME MOUNT IS FALSE

`3096a644...` corrected the active `pagination.js` money readers so null, genuine zero and positive values are distinct. It also removed two additional false-money cases: zero RE tax treated as absent and unknown list price falling back to `$0` in the timeline.

But the new `tests/runtime/crm-pagination-money-render.test.ts` **does not mount/render `pagination.js`** despite the progress recap saying it does. It reads the file, evaluates the helper functions and regex-scans unsafe patterns.

That is a useful anti-regression invariant, but it is not behavioral renderer proof.

Required before closing this defect family:

- load the real `pagination.js` in JSDOM/browser-compatible harness;
- invoke the real detail render path with null money, real zero and positive money;
- assert no throw;
- assert unknown renders unavailable, real zero renders `$0`, positive renders amount;
- cover the result row/detail financial card/timeline paths actually reached by the render invocation, not only helper extraction;
- do not replace this with another source-string-only test.

This behavioral money proof is the last known direct-proof gap blocking §4 closure because the defect was opened and corrected inside the current closure cycle.

## 4.8 Downstream numeric display defect — TRACK, DO NOT HIDE

`pagination.js` still intentionally converts unknown `beds`, `baths`, `rooms` and `dom` to zero on a display copy. This can create downstream false presentation (for example unknown beds can look like a Studio).

This is NOT canonical criteria-state ownership and does not require dragging a 94-reader renderer cleanup into §4. Record it as a downstream Search result/detail blocker for §7/§10 unless a current §4 behavioral test proves it directly breaks canonical-state closure.

Do not lose it and do not call overall Search finished while it remains.

## SECTION 4 CLOSURE GATE

Do not move to §5 until all are true:

- SaleCriteria drives active Sale state;
- RentalCriteria drives active Rental state;
- BuildingCriteria + ComparableCriteria ownership established without parallel truth;
- Basic↔Advanced preserves one canonical object both directions;
- custom ranges round-trip, including clear-one/clear-both behavior;
- Sponsor Unit `"1"/"0"` correct;
- Maximum Financing min/max canonical ownership and full transport/refusal path proven behaviorally;
- serializer derives from canonical criteria and does not mutate them;
- every visible criterion is canonically owned or explicitly refused;
- unsupported/unverified criteria fail explicitly;
- Saved Search persistence ownership traced, full v2 not pulled forward;
- null-money correction has one real renderer behavioral proof, not only source assertions;
- targeted direct + negative + roundtrip tests pass;
- Current file records the exact closure SHA when the gate is satisfied.

Green CI alone does not satisfy this gate.

# 5. SEARCH STEP 2 — REGISTRY → EXECUTOR AUTHORITY

**NEXT SECTION ALLOWED ONLY AFTER §4 CLOSES.**

Target:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING OWNER → EXECUTOR`

Known §5 blockers:

1. bathrooms mapping conflict;
2. dual-domain `listing_id_canonical` — Mallan `SL-/RL-` identity must not be sent to Cotality as provider ListingId;
3. Sponsor Unit execution ownership/strategy;
4. Maximum Financing one executor owner/strategy, without prematurely implementing page-local filtering;
5. unverified year/floors/units/keyword/date semantics must remain `needs_probe`/blocked rather than promoted by code emission;
6. remove/reduce duplicate maps in browser/filter/API/Saved Search/Map/Report/CMA where registry or named specialized owner should control.

§5 closes only when every executable criterion has exactly one mapping owner and negative drift tests catch divergence.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

Required final chain:

`Cotality candidate universe → Mallan listing authority/return-copy suppression → eligibility/identity → dedupe → Mallan-side corpus filters → sort → final count → pagination`

Never page first and then apply membership-changing criteria.

## Maximum Financing execution

The observed key is inside `CustomProperty.CustomFields`; provider `$filter` cannot address the inner JSON value.

Implement only over the COMPLETE candidate universe before final count/pagination.

Prove min-only, max-only, both, neither, absent/unparseable and `0.00` sentinel behavior. `0.00` is not literal 0% financing.

Before this work, live-probe the exact narrow expansion:

`$expand=CustomProperty($select=CustomFields)`

Do not assume the current bare full-CustomProperty expansion is necessary merely because an older compound inner-select returned 400.

## Open House

Current recorded implementation is post-pagination and therefore wrong-universe. Fix in §6 or fail explicitly; no page-local authoritative Open House answer.

## Count truth

Keep provider count, intermediate count, final Mallan count and exact/lower-bound/incomplete meaning distinct. Empty provider page without proven exhaustion is an anomaly/incomplete state, not completion.

# 7. SEARCH STEP 4 — COMPLETE SALE + RENTAL BROKER SEARCH

After §§4–6 are truthful, prove every supported Sale/Rental criterion and meaningful combinations. No visible supported criterion may be ignored, stripped or reinterpreted between Basic/Advanced/server.

Carry the downstream detail-render null-numeric defect here if not already corrected: unknown beds/baths/rooms/DOM must not become fabricated zero/studio/zero-days facts.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

Map and Grid share one canonical criteria object, one final universe and canonical Listing identity.

Saved Search v2 belongs here:

`canonical criteria → execute → save → reload session/browser → restore canonical criteria → restore UI → execute again`

Selection persists across pages by canonical Listing identity. Detail → return restores exact Search state.

# 9. SEARCH STEP 6 — COMPARE + REPORTS + CMA

Compare/Reports/CMA consume authoritative Search results/selections. They do not reconstruct provider criteria independently.

Sale CMA uses verified transaction truth (`ClosePrice`/`CloseDate`), never ListPrice as sold truth. Rental CMA must not invent achieved rent.

# 10. SEARCH STEP 7 — AUTHENTICATED BROWSER E2E

For Sale + Rental on desktop/tablet/mobile prove:

`login → criteria → Basic↔Advanced → execute → truthful universe/count → sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload/restore → selection → client action → Compare → Report → CMA input → attribution/compliance`

Negative proof includes unsupported criterion refusal, unknown enum fail-closed, incomplete universe labeling, no false Map completeness, no Basic/Advanced loss, no Saved Search loss, return-copy suppression, canonical listing authority, and no unknown money/numeric facts presented as real zero.

Search is complete only when §10 closes.

# 11. MY LISTINGS — AFTER SEARCH

My Listings must distinguish Mallan-authored editable listings, suppressed Cotality return-copies, third-party Cotality read-only inventory, historical listings, Seller/Landlord ownership and assigned Agent/Broker roles. Prove Sale + Rental create/save/reload/edit/save/reload with no silent data loss.

# 12. LISTING EBLAST — AFTER MY LISTINGS

Foundation:

`CANONICAL LISTING → MY LISTINGS → CRM PARTY/CLIENT/AGENT + SAVED SEARCH → AUDIENCE MATCH → COMPLIANT CAMPAIGN → DELIVERY → DURABLE CRM ACTIVITY`

No second contact database. No second listing-matching engine.

# 13. NEW AGENT READINESS

After Search + My Listings + Eblast, run a real non-Broker Agent through the day-one brokerage chain on desktop/tablet/mobile. The Agent must not need Maya to repair owner links, recover lost fields, explain ignored Search criteria, reconcile duplicates, recover vanished activity or copy data into parallel systems.

# 14. NEON / R2 — HELD

Do not execute Neon/R2 work during active #618 Search work. PR #620 is a separate moving lane. Search evidence is not Neon/R2 closure evidence.

Resume only when Maya explicitly reauthorizes that lane. Production DB/schema/env/R2/destructive operations remain separately controlled.

# 15. WORKTREE / BASELINE HAZARDS

Before changing unrelated code because a test fails:

1. establish clean tracked baseline;
2. verify local branch == live remote head;
3. identify other worktree/untracked/generated contamination;
4. reproduce failure without your change where safe;
5. prove causation;
6. do not absorb/delete another lane's work to make tests green.

# 16. ANTI-LOOP CLOSURE STANDARD

For every defect family:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT TEST → NEGATIVE TEST → INTEGRATION/PERSISTENCE → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION WHEN AUTHORIZED`

Source-string assertions protect invariants; they do not prove behavior. Unit tests, CI and READY Preview are evidence, not end-to-end closure.

Run grouped targeted tests during development. Run broad gates at closure boundaries. Do not return to `test fails → tiny patch → next test fails` without an impact graph.

# 17. MANDATORY CLAUDE PROGRESS FORMAT

Every substantial update/handoff begins with:

- **CURRENT SECTION**
- **STATUS** — OPEN / IN PROGRESS / CLOSED BY EVIDENCE
- **HEAD SHA**
- **BASE / STACK STATUS** — current #620 head + ahead/behind + exact combined-tree proof status
- **WHAT CLOSED** — specific evidence
- **KNOWN WRONG-ANSWER BLOCKERS**
- **WHAT REMAINS IN THIS SECTION**
- **NEXT SECTION ALLOWED**
- **HOLDS**
- **OUT-OF-SCOPE / DOWNSTREAM FINDINGS**

If intentionally departing from sequence, write:

`SEQUENCE DEVIATION — <reason>`

Do not quietly jump from §4 to §5, Saved Search v2, CMA runtime, My Listings, Eblast or Neon/R2.

# 18. CURRENT PROGRESS NOTATION FOR THE NEXT CLAUDE ACTION

**CURRENT SECTION:** 4 — Canonical Criteria / Transport Closure

**STATUS:** IN PROGRESS — NOT CLOSED

**PRE-DIRECTIVE CODE SHA:** `3096a6448d72895585b9ac93f4cdc84cccc99a18`

**WHAT CLOSED IN CODE:**

- Sponsor Unit observed string `"1"/"0"` parsing;
- Maximum Financing registry ownership for both bounds;
- buildIdxSearchParams carries both bounds;
- API client forwards both bounds;
- server explicitly refuses financing until §6 execution exists;
- money helper/readers corrected across pagination source;
- 5/5 GitHub workflows passed at `3096a644...`.

**WHAT IS NOT YET CLOSED BY BEHAVIORAL EVIDENCE:**

1. `crm-pagination-money-render.test.ts` is source/helper analysis, not an actual mounted detail render. Add one real renderer behavioral test.
2. Financing transport is structurally proven but still needs one executed client transport/refusal roundtrip using the real serializer/request builder, not only source regexes.

**DOWNSTREAM OPEN FINDING, NOT A §4 CANONICAL BLOCKER:**

- unknown beds/baths/rooms/DOM are still coerced to zero on a detail display copy; track for §7/§10 and do not let overall Search close with fabricated zero/studio facts.

**NEXT SECTION ALLOWED:** none until the two behavioral proofs above close §4.

After those two proofs pass and the exact pushed SHA is green, update this file with `SECTION 4 — CLOSED BY EVIDENCE` and begin §5. Do NOT begin §6 financing execution first.
