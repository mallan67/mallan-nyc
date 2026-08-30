# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search PR:** #618

**Active Search branch:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Search code checkpoint before this directive:** `e291594e2578be198fefc7b774fd59529e39afa2`

**PR state at that checkpoint:** open, draft, unmerged, mergeable. All five GitHub PR workflows passed on `e291594e...`. Vercel reported success. Green CI/build is evidence, not Search closure.

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

Verified immediately before this directive:

- #618 code checkpoint: `e291594e2578be198fefc7b774fd59529e39afa2`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**;
- Search is **179 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- current GitHub synthetic merge reported for #618 at that checkpoint: `3c45153cc94e023efba815664ad07ba6fc2e80a2`;
- #618 is open/draft/unmerged/mergeable;
- #620 is a separate Neon/R2 lane and remains held from Search work.

Do not restack/rebase the shared Search branch without Maya's explicit approval. Exact combined-tree proof is required before merge closure; Search-head CI alone does not prove the future combined tree.

# 4. SEARCH STEP 1 — CANONICAL CRITERIA / TRANSPORT

**CURRENT SECTION: 4 — STILL OPEN. DO NOT START §5 YET.**

The structural foundation is materially established and must not regress:

- `SaleCriteria`, `RentalCriteria`, `BuildingCriteria`, `ComparableCriteria` ownership;
- one canonical state per workflow;
- Basic/Advanced are views of the same canonical state, not parallel stores;
- DOM → canonical → DOM direction;
- old second DOM reconstruction path removed;
- workflow applicability/criterion roles owned by canonical contracts;
- Sponsor Unit observed string `"1"/"0"` parsing corrected through the canonical CustomFields decoder;
- Maximum Financing has one canonical identity, Sale + Building applicability, range shape, both min/max transport names, and fail-loud behavior while execution is unavailable;
- Saved Search ownership traced; full Saved Search v2 remains §8.

## 4.A MONEY BEHAVIORAL PROOF — CLOSED BY EVIDENCE AT `e291594e...`

`tests/runtime/crm-detail-money-behavior.test.ts` is real behavioral evidence.

It:

- loads the page's actual script chain through `pagination.js`;
- seeds listings after script load so `data-loader.js` cannot vacuously clear the fixture;
- invokes the real `showListingDetail()` function;
- proves the detail DOM actually renders;
- proves null money renders unavailable and does not throw;
- proves genuine zero renders `$0`;
- proves positive values render correctly;
- proves unknown/zero/positive remain distinguishable in one render;
- proves detail rendering does not mutate the shared listing record.

This closes the money behavioral proof item opened during §4.

### Downstream numeric display defect remains open but is NOT a §4 canonical blocker

`pagination.js` still converts unknown `beds`, `baths`, `rooms` and `dom` to zero on a display copy. That can fabricate presentation facts, including an unknown bed count appearing as a studio.

Track this through §7/§10. Do not let overall Search close while it remains. Do not drag a broad renderer cleanup backward into §4 unless it directly breaks the remaining §4 proof.

## 4.B MAXIMUM FINANCING — ONE BEHAVIORAL HOP STILL MISSING

At `e291594e...`, the production code path is structurally correct:

`_canonicalCriteria.max_financing_percent → serializeCanonicalToWire() → financingMin/financingMax → buildIdxSearchParams() → MallanAPI.idx.search() → /api/idx/search → UnsupportedSearchCriterionError`

`tests/runtime/crm-financing-transport-behavior.test.ts` is materially better than the old source census. It executes:

- real `buildIdxSearchParams()`;
- real `MallanAPI.idx.search()` request builder with stubbed fetch;
- the emitted `/api/idx/search` URL;
- real server `buildCrmIdxODataFilter()` refusal;
- min-only;
- max-only;
- both;
- neither;
- legitimate zero transport.

But the test currently constructs the object passed to `buildIdxSearchParams()` with `financingMin` / `financingMax` already present.

That bypasses the FIRST production hop:

`_canonicalCriteria.max_financing_percent → serializeCanonicalToWire()`

The test therefore proves:

`financingMin/financingMax → buildIdxSearchParams → API client → server refusal`

It does **not** yet behaviorally prove:

`canonical max_financing_percent range → financingMin + financingMax`

The source/invariant tests show that mapping exists, but Mallan's closure rule is that source assertions protect invariants and do not substitute for workflow behavior.

### LAST REQUIRED §4 PROOF

Add ONE bounded behavioral test/harness that uses the real production canonical path rather than pre-building wire criteria.

Required:

1. set the real canonical Sale state `max_financing_percent` to min-only;
2. run the real production serializer path that `collectSearchCriteria()` uses;
3. prove `financingMin` is produced and reaches the stubbed `/api/idx/search` request;
4. repeat max-only;
5. repeat both;
6. repeat clearing one/both bounds so stale values do not survive;
7. use Building ownership too if the production adapter exposes it through the same serializer path; at minimum prove Sale because the current behavioral test is labeled browser Search transport;
8. do not restate `CANONICAL_TO_WIRE` inside the test;
9. keep the existing downstream request/refusal tests — this new proof complements them rather than replacing them.

If the canonical store setter/adapter is intentionally not exported, mount the real form/adapter/collector path in JSDOM rather than reaching into private state with a shadow implementation.

Once this single proof passes and the exact pushed SHA is green, Section 4 may be marked:

**SECTION 4 — CLOSED BY EVIDENCE**

Then begin §5. Do NOT begin §6 financing execution first.

## SECTION 4 CLOSURE GATE

Everything below is satisfied except the single canonical-financing behavioral hop above:

- SaleCriteria drives Sale state;
- RentalCriteria drives Rental state;
- BuildingCriteria/ComparableCriteria ownership exists without parallel truth;
- Basic↔Advanced one-state contract established;
- custom ranges and clear semantics structurally covered;
- Sponsor Unit `"1"/"0"` correct;
- Maximum Financing both bounds have canonical ownership and explicit server refusal;
- serializer is canonical → transport, not DOM reconstruction;
- unsupported/unverified criteria fail explicitly;
- visible criteria are owned or explicitly refused;
- Saved Search ownership traced without pulling v2 forward;
- money behavior now proven by real renderer execution;
- targeted/broad gates green at `e291594e...`.

**Remaining blocker: behaviorally exercise `max_financing_percent` from canonical state through `serializeCanonicalToWire()`, not from a prebuilt `{ financingMin, financingMax }` object.**

# 5. SEARCH STEP 2 — REGISTRY → EXECUTOR AUTHORITY

**NEXT SECTION ALLOWED ONLY AFTER §4 CLOSES.**

Target:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING OWNER → EXECUTOR`

Known §5 blockers:

1. bathrooms mapping conflict;
2. dual-domain `listing_id_canonical`: Mallan `SL-/RL-` identity must never be sent to Cotality as though it were provider ListingId;
3. Sponsor Unit execution ownership/strategy;
4. Maximum Financing one authoritative executor owner/strategy, without implementing page-local filtering;
5. unverified year/floors/units/keyword/date semantics remain blocked until live proof;
6. remove/reduce duplicate criterion maps in browser/filter/API/Saved Search/Map/Reports/CMA where registry or a named specialized owner should control.

§5 closes only when every executable criterion has exactly one mapping owner and drift tests catch divergence.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

Required chain:

`Cotality candidate universe → Mallan listing authority / return-copy suppression → eligibility/identity → dedupe → Mallan-side corpus filters → sort → final count → pagination`

Never page first and then apply a membership-changing criterion.

## Maximum Financing execution belongs HERE

Provider `$filter` cannot address the observed financing key inside the `CustomProperty.CustomFields` string.

Implement only over the COMPLETE candidate universe before final count/pagination.

Prove:

- min-only;
- max-only;
- both;
- neither;
- absent/unparseable;
- `0.00` sentinel = not specified, never literal 0%.

Before §6 execution, live-probe the exact narrow expansion:

`$expand=CustomProperty($select=CustomFields)`

Do not assume the current bare full-CustomProperty expansion is required because an older compound inner-select returned 400.

## Open House

Current recorded implementation is post-pagination/wrong-universe. Fix in §6 or explicitly refuse; never present a page-local Open House result as authoritative.

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

**CURRENT SECTION:** 4 — Canonical Criteria / Transport Closure

**STATUS:** IN PROGRESS — ONE BOUNDED BEHAVIORAL PROOF REMAINS

**VERIFIED CODE SHA:** `e291594e2578be198fefc7b774fd59529e39afa2`

**CI AT THAT SHA:** all five GitHub PR workflows completed successfully.

**CLOSED BY EVIDENCE:**

- Sponsor Unit `"1"/"0"` decoder;
- financing registry ownership for min/max;
- buildIdxSearchParams forwarding;
- API-client query forwarding;
- typed server refusal until §6;
- real money-detail renderer proof for unknown/zero/positive and no shared-row mutation.

**ONE REMAINING §4 BLOCKER:**

The financing behavior test pre-populates `financingMin`/`financingMax` and therefore bypasses the real first production hop from canonical `max_financing_percent` through `serializeCanonicalToWire()`.

Close that exact hop behaviorally. Then, if exact-head CI is green, mark §4 CLOSED BY EVIDENCE and begin §5.

**NEXT SECTION ALLOWED:** §5 only after that proof.

**DO NOT START:** §6 complete-universe financing, §8 Saved Search v2, CMA runtime, My Listings, Eblast, Neon/R2.

**DOWNSTREAM TRACKED:** unknown beds/baths/rooms/DOM → display-copy zero; must be corrected before §7/§10 closure.
