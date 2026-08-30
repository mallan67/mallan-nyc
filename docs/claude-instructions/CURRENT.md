# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search PR:** #618

**Active Search branch:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Section 4 closure code SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**Section 4 status:** **CLOSED BY EVIDENCE**

**Current active section:** **Section 5 — Registry → Executor Authority**

> This file does not hard-code its own resulting commit SHA. The commit containing this revision becomes the new live #618 head. Before any mutation, read the live PR head and verify the local worktree exactly matches it.

# 0. AUTHORITY / START RULES

Before ANY mutation:

1. verify repository == `mallan67/mallan-nyc`;
2. verify local branch/worktree == live remote PR #618 head;
3. fetch/rebase only as required to reach that exact head; never force over a moving shared branch;
4. read this file completely;
5. read the root `MALLAN-PLATFORM-MASTER-PLAN.md` from frozen documentation authority PR #595 (`agent/publish-mallan-platform-master-plan-2026-08-04`, verified head `3c7f8722a23590652d8280ccb90326448b70f116`) READ-ONLY;
6. do not look for `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` on #618 — that path was stale;
7. do not merge/cherry-pick #595 merely to read the Master Plan;
8. use `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` only as subordinate execution-state evidence;
9. identify the exact numbered section below before editing;
10. do not skip ahead because another feature is easier.

Old chats, audits, census files and handoffs are evidence only. Live authenticated Cotality, current Git evidence, the Master Plan and this continuation directive control.

# 1. CANONICAL ARCHITECTURE / PROVIDER AUTHORITY

Always:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE/PROJECTION → MALLAN BUSINESS RULE → CRM / SEARCH / BUILDING / CMA / MY LISTINGS / EBLAST / PORTALS / PUBLIC`

Cotality is Mallan's one external property/provider authority.

Do not create provider architecture whose authority is RESO, RLS, RealPlus, an old Trestle field list, a historical audit or a handwritten mapping mirror. REBNY/RLS/UCBA/law remain compliance boundaries, not separate property-data authorities.

For every provider-facing capability prove as applicable:

- exact Cotality resource;
- exact declared field/container and observed extension key;
- type/enum encoding;
- null/empty/sentinel semantics;
- filter/order/expand/operator behavior;
- permission/availability;
- live population/behavior when material;
- semantic equivalence to the broker-facing concept.

`CustomProperty.CustomFields` is a declared nullable string container. Dated evidence observed 52 NYC inner keys; each key needs its own semantic and consumer disposition.

# 2. SCOPE / CHANGE CONTROL

PR #618 is authenticated CRM/backend Search only until Search closes.

IN SCOPE:

- `public/crm/**` authenticated agent Search;
- Sale Search;
- Rental Search;
- Building Search foundation;
- ComparableCriteria/CMA Search foundation;
- authenticated Search API/mapping/executor;
- final result universe/count/pagination;
- Map / Search Within Results / Search Within Map;
- Saved Search ownership now and full roundtrip in §8;
- workbench/selection/client actions;
- Compare/Reports/CMA after the Search foundation is truthful.

PROTECTED / OUT OF SCOPE:

- public consumer Search (`app/search`, public `SearchFilterPanel`, `/api/listings`, `lib/search/public-listing-*`, public Search contracts);
- unrelated Neon/R2 work;
- schema/migration/backfill/env changes without explicit authorization;
- Cotality writes;
- Production deployment.

# 3. MOVING STACK — VERIFY EACH SESSION

PR #618 is stacked on PR #620 / `fix/neon-r2-closure-clean-2026-08-19`.

Verified at the Section 4 closure checkpoint:

- #618 code SHA: `939884e15ec8447988c7fb791a8978fb8676f3a4`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**;
- Search is **181 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- GitHub synthetic merge for #618 at that checkpoint: `94eb2e1112f1d331f126ef390cd1463a0e5f86bb`;
- #618: open, draft, unmerged, mergeable;
- all five GitHub PR workflows completed successfully on `939884e1...`;
- Vercel status on `939884e1...`: success;
- #620 remains a separate Neon/R2 lane and is not Search closure evidence.

Do not restack/rebase the shared Search branch without Maya's explicit approval. Exact combined-tree proof is required before merge closure; Search-head CI alone does not prove the future combined tree.

# 4. SEARCH STEP 1 — CANONICAL CRITERIA / TRANSPORT

**STATUS: CLOSED BY EVIDENCE at `939884e15ec8447988c7fb791a8978fb8676f3a4`.**

Do not reopen Section 4 unless a new defect directly invalidates one of its proven contracts.

## 4.A Canonical workflow state — closed

Established and protected:

- `SaleCriteria`, `RentalCriteria`, `BuildingCriteria`, `ComparableCriteria` ownership;
- one canonical state per workflow;
- Basic/Advanced are views of the same canonical state, not parallel stores;
- DOM → canonical → DOM direction;
- legacy second DOM reconstruction removed;
- workflow applicability/criterion roles owned by canonical contracts;
- custom ranges preserve arbitrary values and clearing semantics;
- Saved Search persistence/restore ownership traced without pulling full Saved Search v2 ahead of §8.

## 4.B Sponsor Unit — closed at contract/transport level

Observed Cotality CustomFields string encodings `"1"` / `"0"` decode correctly through the canonical CustomFields parser, alongside valid boolean/numeric forms. Unknown/unparseable remains unknown rather than fabricated.

Execution ownership remains a Section 5 matter.

## 4.C Maximum Financing — closed at canonical/transport/refusal level

Product contract:

- canonical criterion: `max_financing_percent`;
- workflows: Sale + Building;
- value shape: range number;
- wire bounds: `financingMin` + `financingMax`;
- source model: `CustomProperty.CustomFields` observed key `MaximumFinancingPercent`;
- provider `$filter` cannot address the inner JSON key;
- until Section 6 complete-universe execution exists, financing must fail loudly rather than silently widen results.

Behavioral proof now covers the real production chain beginning where the agent starts:

`#saleBuildingFinancingMin / #saleBuildingFinancingMax → canonical max_financing_percent → serializeCanonicalToWire() → financingMin/financingMax → buildIdxSearchParams() → MallanAPI.idx.search() → /api/idx/search`

`tests/runtime/crm-financing-canonical-path.test.ts` proves:

- shipped controls are mounted;
- min-only;
- max-only;
- both;
- clearing one bound;
- clearing both bounds;
- Basic → Advanced canonical carry;
- untouched control adds nothing;
- each layer's value is asserted, preventing adjacent-hop agreement from masking a broken earlier hop.

`tests/runtime/crm-financing-transport-behavior.test.ts` separately proves the downstream request builder and real server `UnsupportedSearchCriterionError` behavior, including a legitimate zero transport value.

Complete-universe financing execution is NOT Section 4. It remains Section 6.

## 4.D Money reader defect opened during closure — behaviorally closed

`tests/runtime/crm-detail-money-behavior.test.ts` loads the actual CRM script chain through `pagination.js`, invokes the real `showListingDetail()`, renders the DOM and proves:

- unknown money → unavailable, no throw;
- genuine zero → `$0`;
- positive values → correctly formatted amounts;
- unknown/zero/positive remain distinct in one render;
- detail rendering does not mutate the shared listing record.

### Downstream numeric display defect remains open

`pagination.js` still converts unknown `beds`, `baths`, `rooms` and `dom` to zero on a display copy. This can fabricate presentation facts, including unknown beds appearing as Studio.

This did not block Section 4 canonical closure, but it MUST be corrected before §7/§10 Search/browser closure.

# 5. SEARCH STEP 2 — REGISTRY → EXECUTOR AUTHORITY

**CURRENT SECTION: 5 — ACTIVE.**

Target architecture:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING OWNER → EXECUTOR`

The purpose of Section 5 is not to add more filters randomly. It is to remove duplicate criterion→provider truths and establish exactly one authoritative execution owner for each executable criterion.

## 5.A First: establish the full impact graph before patching

Before changing a specific field, census the current authority chain across:

- canonical criteria definitions;
- `FIELD_REGISTRY`;
- specialized canonical vocabularies/contracts;
- `crm-idx-filter.ts`;
- `/api/idx/search` route-level special handling;
- browser Search mapping tables;
- Saved Search aliases/normalizers;
- Map criteria mappings;
- Reports/CMA mappings where they already read Search criteria;
- tests that encode a competing mapping.

Classify each criterion as exactly one of:

- registry-owned provider execution;
- named specialized canonical owner + registry reference;
- Mallan projection/complete-universe execution;
- explicit boundary refusal;
- unresolved/needs live probe.

Do not patch one reader without identifying all competing readers/writers first.

## 5.B Bathrooms mapping conflict — close first or in the first grouped authority batch

Known defect: canonical/registry bathroom semantics and the active executor do not fully agree.

Required closure:

- determine exact broker-facing semantics for full/half/total baths from the canonical `bath-contract`;
- verify exact Cotality fields/operators against the authorized contract where not already live-proven;
- make one execution owner authoritative;
- remove/subordinate conflicting hard-coded mapping;
- direct + negative tests catch future field/semantic drift;
- Sale and Rental semantics may differ only where the business/Cotality contract proves the difference.

Do not substitute an approximately related bath field because it is convenient.

## 5.C Listing ID dual-domain conflict

Canonical listing reference can belong to different identity domains:

- Mallan local `SL-/RL-...` canonical identity;
- provider Cotality ListingId/representation identity.

Current recorded defect: the executor can treat a Mallan local reference as though it were a provider ListingId and emit a Cotality `ListingId eq ...` predicate that can never match.

Required closure:

- make domain resolution explicit before provider execution;
- Mallan local identity must resolve through Mallan authority, not be sent blindly to Cotality;
- provider ListingId may use provider execution where verified;
- provider ListingKey remains a different domain again and must not be conflated;
- suppression/reconciliation evidence remains attached to the canonical Mallan listing;
- negative tests prove `SL-/RL-` never becomes a Cotality ListingId filter.

Do not create a second listing identity.

## 5.D Sponsor Unit execution ownership

Section 4 proved decoding/transport/refusal semantics. Section 5 must establish the one authoritative execution strategy.

Because Sponsor Unit lives inside `CustomProperty.CustomFields`, do not invent a top-level provider field or generic checkbox mapping.

If execution cannot yet be truthful before complete-universe projection work, keep the explicit refusal and record the authoritative future strategy. Do not silently widen.

## 5.E Maximum Financing execution ownership

Section 5 establishes the one execution owner/strategy; Section 6 implements the complete-universe membership filter.

Correct Section 5 outcome can be:

- registry owns `max_financing_percent`;
- canonical CustomFields decoder owns raw interpretation;
- executor strategy is `mallan_projection_filter` / complete-universe Mallan-side;
- current request boundary explicitly refuses until §6.

Do NOT implement page-local financing filtering here.

## 5.F Unverified capabilities stay blocked

Criteria such as year/floors/units/keyword/date operators or other `needs_probe` items do not become VERIFIED because code can emit a clause.

For each one:

- prove live Cotality field + semantics + operator support;
- or retain explicit refusal/unresolved state.

No substitute fields without semantic equivalence proof.

## 5.G Registry → executor census

By Section 5 closure, produce one machine-checkable census showing:

- every executable canonical criterion;
- its registry owner;
- its execution strategy;
- the exact provider mapping or Mallan-side strategy;
- any specialized subordinate vocabulary owner;
- zero duplicate active execution maps for the same semantic criterion;
- every unsupported/unverified criterion has explicit fail behavior.

The census must fail CI if a new executor mapping appears without an authority owner.

## SECTION 5 CLOSURE GATE

Do not move to §6 until:

- bathrooms conflict is closed;
- listing-ID domains are explicitly resolved;
- every executable criterion has exactly one authoritative mapping/execution owner;
- route-level special cases are either justified named strategies or folded under the canonical owner;
- Sponsor Unit strategy is authoritative and not an invented top-level field;
- Maximum Financing has one execution owner/strategy but is not prematurely page-filtered;
- unverified capabilities remain blocked;
- registry→executor census is clean;
- negative drift test catches duplicate/unauthorized execution mapping;
- grouped targeted tests pass;
- broad Search/compliance gates pass at the closure checkpoint;
- `CURRENT.md` records the exact Section 5 closure SHA.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

Required chain:

`Cotality candidate universe → Mallan listing authority / return-copy suppression → eligibility/identity → dedupe → Mallan-side corpus filters → sort → final count → pagination`

Never page first and then apply a membership-changing criterion.

## Maximum Financing execution belongs HERE

Provider `$filter` cannot address the observed financing key inside `CustomProperty.CustomFields`.

Implement only over the COMPLETE candidate universe before final count/pagination.

Prove:

- min-only;
- max-only;
- both;
- neither;
- absent/unparseable;
- `0.00` sentinel = not specified, never literal 0%;
- disagreement across listings in one building does not get collapsed into a fake building fact.

Before §6 execution, live-probe the exact narrow expansion:

`$expand=CustomProperty($select=CustomFields)`

Do not assume the current bare full-CustomProperty expansion is required because an older compound inner-select returned 400.

## Open House

Current recorded implementation is post-pagination/wrong-universe. Fix in §6 or explicitly refuse; never present a page-local Open House result as authoritative.

## Count truth

Keep provider count, intermediate count, final Mallan count and exact/lower-bound/incomplete meaning distinct. Empty provider page without proven exhaustion is an anomaly/incomplete state, not completion.

# 7. SEARCH STEP 4 — COMPLETE SALE + RENTAL BROKER SEARCH

After §§4–6 close, prove every supported Sale/Rental criterion and meaningful combinations.

Carry the downstream null-numeric display defect here if not already fixed: unknown beds/baths/rooms/DOM must not become fabricated zero/studio/zero-days facts.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

Map/Grid share one canonical criteria object, final universe and Listing identity.

Full Saved Search v2 belongs here:

`canonical criteria → execute → save → reload → restore canonical criteria → restore UI → execute again`

Selection persists across pages by canonical Listing identity. Detail → return restores exact Search state.

# 9. SEARCH STEP 6 — COMPARE + REPORTS + CMA

Compare/Reports/CMA consume authoritative Search results/selections and must not rebuild provider criteria independently.

Sale CMA uses verified `ClosePrice`/`CloseDate` transaction truth. Rental CMA must not invent achieved rent.

# 10. SEARCH STEP 7 — AUTHENTICATED BROWSER E2E

For Sale + Rental on desktop/tablet/mobile prove:

`login → criteria → Basic↔Advanced → execute → truthful universe/count → sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload/restore → selection → client action → Compare → Report → CMA input → attribution/compliance`

Negative proof includes unsupported criterion refusal, unknown enum fail-closed, incomplete-universe labeling, no false Map completeness, no canonical-state loss, return-copy suppression, canonical listing authority, and no unknown money/numeric facts presented as real zero.

Search completes only when §10 closes.

# 11. MY LISTINGS — AFTER SEARCH

Distinguish Mallan-authored editable listings, suppressed Cotality return-copies, third-party Cotality read-only inventory, historical listings, owner relationships and assigned Agent/Broker roles. Prove create/save/reload/edit/save/reload with no silent data loss.

# 12. LISTING EBLAST — AFTER MY LISTINGS

Foundation:

`CANONICAL LISTING → MY LISTINGS → CRM PARTY/CLIENT/AGENT + SAVED SEARCH → AUDIENCE MATCH → COMPLIANT CAMPAIGN → DELIVERY → DURABLE CRM ACTIVITY`

No second contact database. No second listing-matching engine.

# 13. NEW AGENT READINESS

Run a real non-Broker Agent through the day-one brokerage chain desktop/tablet/mobile after Search + My Listings + Eblast close.

# 14. NEON / R2 — HELD

Do not execute Neon/R2 work during active #618 Search work. PR #620 is separate. Search evidence is not Neon/R2 closure evidence.

Resume only with Maya's explicit authorization. Production DB/schema/env/R2/destructive operations remain separately controlled.

# 15. ANTI-LOOP CLOSURE STANDARD

For every defect family:

`PROVEN DEFECT → ROOT CAUSE → ALL AFFECTED READERS/WRITERS → CORRECTION → DIRECT/NEGATIVE TEST → INTEGRATION/PERSISTENCE → DOWNSTREAM → COMPLIANCE → PREVIEW → PRODUCTION WHEN AUTHORIZED`

Source-string assertions protect invariants; they do not prove behavior. Unit tests, CI and READY Preview are evidence, not end-to-end closure.

Run grouped targeted tests during development and broad gates at closure boundaries. Do not return to `test fails → tiny patch → next test fails` without an impact graph.

# 16. MANDATORY CLAUDE PROGRESS FORMAT

Every substantial update/handoff begins with:

- **CURRENT SECTION**
- **STATUS** — OPEN / IN PROGRESS / CLOSED BY EVIDENCE
- **HEAD SHA**
- **BASE / STACK STATUS**
- **WHAT CLOSED**
- **KNOWN WRONG-ANSWER BLOCKERS**
- **WHAT REMAINS IN THIS SECTION**
- **NEXT SECTION ALLOWED**
- **HOLDS**
- **OUT-OF-SCOPE / DOWNSTREAM FINDINGS**

If intentionally departing from sequence, state:

`SEQUENCE DEVIATION — <reason>`

# 17. CURRENT PROGRESS NOTATION

**CURRENT SECTION:** 5 — Registry → Executor Authority

**STATUS:** ACTIVE / IN PROGRESS

**SECTION 4 CLOSURE SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**SECTION 4 CI:** all five GitHub PR workflows passed; Vercel success.

**SECTION 4 CLOSED BY EVIDENCE:**

- canonical Sale/Rental/Building/Comparable ownership;
- Basic/Advanced single-state contract;
- canonical serialization direction;
- Sponsor Unit `"1"/"0"` decoding;
- Maximum Financing both-bound canonical path from shipped controls through request;
- clear-one/clear-both financing behavior;
- explicit financing refusal pending §6;
- real detail money rendering for unknown/zero/positive;
- Saved Search ownership trace without pulling v2 forward.

**CURRENT §5 BLOCKERS:**

1. bathrooms mapping conflict;
2. listing-ID dual-domain conflict;
3. one authoritative execution owner per executable criterion;
4. Sponsor Unit execution ownership;
5. Maximum Financing execution ownership/strategy only — not §6 filtering;
6. unverified capabilities must remain blocked;
7. registry→executor census + negative drift proof.

**NEXT SECTION ALLOWED:** §6 only after §5 closure.

**DO NOT START YET:** §6 complete-universe financing/Open House, §8 Saved Search v2, CMA runtime, My Listings, Eblast, Neon/R2.

**DOWNSTREAM TRACKED:** unknown beds/baths/rooms/DOM → display-copy zero; must be corrected before §7/§10 closure.
