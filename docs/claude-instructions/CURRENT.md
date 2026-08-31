# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search PR:** #618

**Active Search branch:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Section 4 closure code SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**Section 4 status:** **CLOSED BY EVIDENCE**

**Latest audited Section 5 checkpoint code SHA:** `60b24ccbc25d68c3f7aef80c582508cdc6950e6e`

**Current active section:** **Section 5 — Registry → Executor Authority**

**Section 5 status:** **OPEN — closure candidate rejected by independent audit. §6 is NOT authorized.**

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

A provider-facing Search fact may use only live-authorized Cotality contract/evidence. Old RLS/RESO names may survive only where they are literally compliance/lineage evidence or non-provider presentation geometry; they may not define provider identity, provider vocabulary, provider availability or provider Search membership.

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

Latest independently verified Search checkpoint before this CURRENT.md update:

- #618 code SHA: `60b24ccbc25d68c3f7aef80c582508cdc6950e6e`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**;
- #618 is **188 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- GitHub synthetic merge for #618 at that checkpoint: `529d9f427ac5b7f0aec40fe2c5afa83181607dc6`;
- #618: open, draft, unmerged, mergeable;
- all five GitHub PR workflows completed successfully on `60b24ccb...`;
- Vercel Preview for `60b24ccb...` is READY;
- the separate `release-truth` status context remained pending even though the Release Truth workflow itself completed successfully;
- #620 remains a separate Neon/R2 lane and is not Search closure evidence.

IMPORTANT: after `60b24ccb...`, Claude found and locally edited the neighborhood vocabulary fetch path from a conditional/relative path to the established absolute `/crm/data/neighborhood-vocabulary.generated.json`. That correction was **not on GitHub and was not covered by the green `60b24ccb...` CI/Vercel checkpoint** when independently audited. Treat any such local post-checkpoint work as unproven until it is committed, pushed and tested at the new exact head.

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

Behavioral proof covers the shipped control → canonical → serializer → request builder → browser API client → `/api/idx/search` chain, including min-only, max-only, both, clear-one and clear-both behavior.

Complete-universe financing execution is NOT Section 4. It remains Section 6.

## 4.D Money reader defect opened during closure — behaviorally closed

Real detail rendering proves unknown money, genuine zero and positive values remain distinct and do not mutate the shared listing record.

### Downstream numeric display defect remains open

`pagination.js` still converts unknown `beds`, `baths`, `rooms` and `dom` to zero on a display copy. This can fabricate presentation facts, including unknown beds appearing as Studio.

This did not block Section 4 canonical closure, but it MUST be corrected before §7/§10 Search/browser closure.

# 5. SEARCH STEP 2 — REGISTRY → EXECUTOR AUTHORITY

**CURRENT SECTION: 5 — OPEN. DO NOT DECLARE CLOSED YET.**

Target architecture:

`CANONICAL CRITERIA → FIELD_REGISTRY / VERIFIED COTALITY MAPPING OWNER → EXECUTOR`

The purpose of Section 5 is not to add more filters randomly. It is to remove duplicate criterion→provider truths and establish exactly one authoritative execution owner for each executable criterion.

## 5.A Impact-graph rule

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

## 5.B Bathrooms — canonical contract now established; preserve it

Do not reopen the bathroom meaning unless new live Cotality evidence contradicts it.

Verified rule:

- Full baths = `BathroomsFull`;
- Half baths = `BathroomsHalf`;
- half baths are real first-class Cotality data and MUST NOT be rounded away;
- canonical numeric total = `BathroomsFull + (BathroomsHalf × 0.5)`;
- examples: 1 full + 1 half = 1.5; 2 full + 1 half = 2.5;
- `BathroomsTotalInteger` is NOT canonical because it cannot preserve fractional bath truth;
- detailed UI/reporting should preserve components such as `2 full, 1 half`, not only display `2.5`;
- quarter/partial bath components currently showed no meaningful non-zero data in the verified current feed; do not invent semantics and do not assume that remains permanent without provider evidence.

## 5.C Listing ID dual-domain — preserve the closed boundary

Canonical listing reference has distinct identity domains:

- Mallan local `SL-/RL-...` canonical identity;
- provider Cotality `ListingId` representation identity;
- provider `ListingKey` identity used for provider/media relationships.

Mallan local identity must never be sent blindly to Cotality as `ListingId`. Provider identifiers remain reconciliation evidence and do not replace Mallan canonical identity.

## 5.D Sponsor Unit execution ownership

Section 4 proved decoding/transport/refusal semantics. Section 5 owns the strategy only.

Because Sponsor Unit lives inside `CustomProperty.CustomFields`, do not invent a top-level provider field or generic checkbox mapping. The accepted future strategy is Mallan-side projection/complete-universe filtering; until §6 implements that truthfully, keep explicit refusal.

## 5.E Maximum Financing execution ownership

Accepted Section 5 outcome:

- registry owns `max_financing_percent`;
- canonical CustomFields decoder owns raw interpretation;
- executor strategy = `mallan_projection_filter` / complete-universe Mallan-side;
- current request boundary explicitly refuses until §6.

Do NOT implement page-local financing filtering here.

## 5.F Accepted provider/operator corrections — do not throw these away

The following are accepted progress from the `798787ae` → `242ba3a9` → `60b24ccb` closure passes unless new contrary evidence appears:

- exact `StreetNumber eq` Search semantics replace numeric prefix matching for a selected/full address;
- `UnitNumber` case-insensitive execution uses the live-proven `toupper(UnitNumber)` shape;
- provider `ListingId` positive path is live-proven while Mallan local IDs are refused from provider execution;
- `StreetDirPrefix` uses the live Cotality enum member form;
- date literal/operator shapes used by Search were live-probed;
- `PublicRemarks` keyword remains unverified at provider level and must fail loud, not disappear;
- sentinel guards on max-bound numeric provider predicates prevent unknown/zero/-1 values from satisfying a real upper bound where the field contract proves those values are not real facts;
- BedroomsTotal zero remains a real studio and must not be sentinel-filtered;
- PostalCode `00000` is an observed in-band unknown/sentinel, not a valid negative control; absence proof was rerun with genuinely absent values;
- `UnsupportedGeographyError` must surface through the typed `UNSUPPORTED_CRITERION` 400 protocol;
- `executionReadiness()` must never call an explicitly unresolved authority verified executable;
- Mallan-derived/Mallan-CRM facts must not require fabricated Cotality evidence merely to become executable under a Mallan-side strategy.

## 5.G Neighborhood identity contract — LIVE COTALITY ONLY

This is now a Section 5 closure blocker because browser autocomplete, Map and server execution can all write/read neighborhood criteria.

### Provider identity

Live Cotality `SubdivisionName` is the provider Search fact. The latest bounded census read the Search universe exhaustively and established that the observed folded `SubdivisionName` identities did not span more than one `CityRegion` borough in that census.

That proof does NOT authorize an old RLS/RESO alias file, polygon group or hard-coded browser table to define Cotality neighborhood identity.

### Case/spelling variation rule — REQUIRED

Case-only spelling variations of the same live Cotality neighborhood are ONE broker-facing identity.

Examples:

- `SoHo`, `SOHO`, `Soho`, `soho` → one **SoHo** choice;
- `NoHo`, `NOHO`, `Noho`, `noho` → one **NoHo** choice;
- `DUMBO`, `Dumbo`, `dumbo` → one **DUMBO** choice;
- `NoMad`, `NOMAD`, `nomad` → one **NoMad** choice;
- `Midtown`, `midtown` → one **Midtown** choice.

The broker must see one clean canonical label. Mallan must preserve all verified raw Cotality spellings behind that identity and execute the union so capitalization never causes lost inventory.

Do NOT expose every case variant as a separate neighborhood in the UI.

Do NOT casually merge genuinely different names. `Gramercy` and `Gramercy Park`, or `Stuyvesant Town` and another provider value, are not equivalents unless live Cotality evidence proves that semantic relationship.

This same normalization must hold across:

`typed input → autocomplete → canonical criteria → Saved Search restore → Map bridge → server execution`

### Current wrong-answer blockers at the latest audited checkpoint

1. `public/crm/js/search/search-engine.js` still contains a live hard-coded `_findBoroughForNeighborhood()` table, so the claim “four vocabularies → one” is false. It already contains wrong geography: the table places **Mott Haven under Manhattan**, while the live Cotality evidence places Mott Haven in the **Bronx**. Remove this competing authority and derive browser neighborhood→borough knowledge from the live Cotality-generated contract.
2. The Map still loads legacy RLS-named polygon/alias assets and returns polygon names directly as `selectedNeighborhoods` into Search. Polygon geometry may remain presentation geometry, but it may NOT become provider Search truth. A Map selection must bridge to a verified live Cotality identity, or Map-as-a-Search-writer must remain disabled until §8.
3. The pushed `60b24ccb...` autocomplete fetch path can resolve to the wrong `/data/...` URL on `/crm`; Claude found an absolute `/crm/data/...` correction locally after the push. Commit/push/prove it before closure.
4. The current browser vocabulary exposes raw provider spellings individually (`SoHo`/`Soho`/`SOHO`, `Dumbo`/`DUMBO`, etc.) and can expose raw `StatenIsland` as a broker-facing borough label. Collapse provider variants behind one canonical presentation label while preserving provider values internally.
5. Neighborhood vocabulary loading/failure is not truthfully represented. Empty `_searchList` while loading or after a failed fetch must not tell the broker “No neighborhoods found.” Provide explicit loading and load-failed states.
6. The borough registry row has been changed to `by_listing_authority`, but its explanatory note still says the authority is provisional/needs probe. Make the authority record and its prose agree.

### Required neighborhood/map tests before §5 closes

Add negative/behavioral coverage that fails for:

- any second hard-coded neighborhood→borough authority;
- Mott Haven assigned to Manhattan;
- a Map-emitted Search value that has no verified live Cotality identity;
- separate broker-facing options for case-only variants of one identity;
- lost Cotality inventory because capitalization differs;
- raw provider `StatenIsland` shown as the broker label instead of `Staten Island`;
- silent vocabulary-load failure or false “No neighborhoods found” while loading;
- reintroduction of a relative `/data/...` neighborhood vocabulary fetch on the CRM route.

## 5.H Active CRM UI provider terminology — bounded correction now, full UX cleanup later

The authenticated Search form currently presents an **“REBNY RLS Live”** tracker even though Cotality is the active provider authority. Correct active provider/data-source UI language to Cotality. REBNY/RLS may remain where it is genuinely compliance, attribution or legal context; do not present it as the Search data engine.

The form also retains substantial legacy status/control vocabulary and DOM names such as `data-field="MlsStatus"`. The canonical backend correctly uses Cotality `StandardStatus`, and unsupported legacy sub-status controls are presently disabled rather than silently executed. Do not pull the entire UI redesign into §5: preserve fail-closed behavior now, correct active authority/provider wording now, and carry broad disabled-control simplification/product redesign into §7 unless it directly affects truthful Search execution.

## 5.I Registry → executor census

By Section 5 closure, produce one machine-checkable census showing:

- every executable canonical criterion;
- its registry owner;
- its execution strategy;
- the exact provider mapping or Mallan-side strategy;
- any specialized subordinate vocabulary owner;
- zero duplicate active execution maps for the same semantic criterion;
- every unsupported/unverified criterion has explicit fail behavior;
- any criterion the live executor can execute resolves to `verified_executable` under the canonical readiness model;
- any `needs_probe`, semantic-false, unresolved, refused or not-yet-wired criterion cannot masquerade as verified execution.

The census must fail CI if a new executor mapping appears without an authority owner or if an executing criterion is not canonically verified.

## SECTION 5 CLOSURE GATE

Do not move to §6 until:

- bathroom semantics remain aligned with the fractional full+half contract;
- listing-ID domains remain explicitly resolved;
- every executable criterion has exactly one authoritative mapping/execution owner;
- route-level special cases are either justified named strategies or folded under the canonical owner;
- Sponsor Unit strategy is authoritative and not an invented top-level field;
- Maximum Financing has one execution owner/strategy but is not prematurely page-filtered;
- unverified capabilities remain blocked;
- browser geography has no second hard-coded authority;
- case-only neighborhood variants collapse to one broker-facing identity without losing any verified Cotality spellings/inventory;
- Map cannot write a non-Cotality neighborhood value into Search;
- neighborhood load/error state is explicit and the CRM data path works in Preview;
- active Search provider language does not call REBNY/RLS the provider engine;
- registry notes agree with the actual authority state;
- registry→executor census is clean under the stronger readiness invariant;
- negative drift tests catch duplicate/unauthorized execution mapping and geography authority drift;
- grouped targeted tests pass;
- broad Search/compliance gates pass at the closure checkpoint;
- exact GitHub workflows and Vercel Preview pass on the closure head;
- `CURRENT.md` records the exact Section 5 closure SHA only AFTER independent closure review.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

**STATUS: BLOCKED UNTIL SECTION 5 CLOSES.**

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

Also simplify the broker-facing Search surface: remove obsolete disabled legacy controls rather than making agents work around a museum of unsupported options. This UI cleanup must preserve the canonical criteria and verified Cotality mappings; it does not authorize new filters merely because old markup exists.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

Map/Grid share one canonical criteria object, final universe and Listing identity.

Polygon/geometry names may be presentation assets, but Map selection that writes Search criteria must resolve through the verified live Cotality neighborhood identity contract established in §5. No RLS/RESO polygon alias becomes provider Search truth.

Full Saved Search v2 belongs here:

`canonical criteria → execute → save → reload → restore canonical criteria → restore UI → execute again`

Selection persists across pages by canonical Listing identity. Detail → return restores exact Search state.

# 9. SEARCH STEP 6 — COMPARE + REPORTS + CMA

Compare/Reports/CMA consume authoritative Search results/selections and must not rebuild provider criteria independently.

Sale CMA uses verified `ClosePrice`/`CloseDate` transaction truth. Rental CMA must not invent achieved rent.

# 10. SEARCH STEP 7 — AUTHENTICATED BROWSER E2E

For Sale + Rental on desktop/tablet/mobile prove:

`login → criteria → Basic↔Advanced → execute → truthful universe/count → sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload/restore → selection → client action → Compare → Report → CMA input → attribution/compliance`

Negative proof includes unsupported criterion refusal, unknown enum fail-closed, incomplete-universe labeling, no false Map completeness, no canonical-state loss, return-copy suppression, canonical listing authority, no unknown money/numeric facts presented as real zero, and no case/spelling variation causing neighborhood inventory loss.

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

**STATUS:** **OPEN — latest closure candidate rejected by independent audit**

**SECTION 4 CLOSURE SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**LATEST AUDITED §5 CHECKPOINT SHA:** `60b24ccbc25d68c3f7aef80c582508cdc6950e6e`

**CHECKPOINT CI:** all five GitHub PR workflows passed; Vercel Preview READY. The post-checkpoint local neighborhood-path correction was not part of that green SHA.

**§5 PROGRESS ACCEPTED / DO NOT REOPEN WITHOUT NEW EVIDENCE:**

- fractional bathroom authority: Full + Half×0.5; half baths preserved as first-class data;
- provider/Mallan listing-ID domain separation;
- Sponsor Unit future strategy = Mallan-side projection, refused until §6;
- Maximum Financing future strategy = Mallan-side projection, refused until §6;
- exact StreetNumber Search instead of prefix widening;
- case-insensitive UnitNumber provider execution via live-proven function;
- keyword refusal reaches the server boundary rather than being silently dropped;
- ZIP `00000` sentinel finding and corrected negative proof;
- numeric max-bound sentinel guards with studio exception;
- unresolved authority cannot report `verified_executable`;
- geography authority is by listing authority: Mallan-local geography is Mallan-authored, third-party provider geography is Cotality-authored;
- typed UnsupportedGeography 400 boundary;
- live `SubdivisionName × CityRegion` uniqueness census at the audited checkpoint.

**CURRENT §5 WRONG-ANSWER / CLOSURE BLOCKERS:**

1. commit/push/prove the absolute `/crm/data/neighborhood-vocabulary.generated.json` loader correction;
2. remove the live hard-coded `_findBoroughForNeighborhood()` table and derive borough association from the live Cotality contract;
3. correct the Mott Haven wrong-borough proof and add a regression test;
4. stop Map polygon/RLS names from writing directly into Cotality Search; bridge to live Cotality identity or disable Map-as-writer until §8;
5. collapse case-only variants (`SoHo`/`SOHO`/`Soho`, etc.) into one broker-facing identity while searching the union of all verified raw Cotality variants;
6. keep raw provider spellings/internal values separate from presentation labels (`StatenIsland` provider value → `Staten Island` broker label);
7. add explicit neighborhood loading and load-failed UI states;
8. make borough/neighborhood registry prose agree with the actual authority state;
9. change active authenticated Search provider wording from “REBNY RLS Live” to Cotality while preserving REBNY/RLS only where it is truly compliance/attribution/legal context;
10. strengthen the one-vocabulary/census tests so a second browser/Map authority cannot pass green;
11. regenerate the CRM bundle and rerun grouped §5 tests, census/mutation proof, Search/compliance gates, exact GitHub workflows and Vercel Preview at the new head;
12. stop for independent §5 closure review before touching §6.

**NEXT SECTION ALLOWED:** none. §6 only after independent Section 5 closure.

**DO NOT START YET:** §6 complete-universe financing/Open House, §8 Saved Search v2, CMA runtime, My Listings, Eblast, Neon/R2.

**DOWNSTREAM TRACKED:** unknown beds/baths/rooms/DOM → display-copy zero and detailed bathroom presentation (`2 full, 1 half`) must be corrected before §7/§10 closure.
