# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search PR:** #618

**Active Search branch:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Section 4 closure code SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**Section 4 status:** **CLOSED BY EVIDENCE**

**Latest independently audited Section 5 checkpoint code SHA:** `9919e89aaceeb34bd06a3f3de7c37aa800fd703d`

**Current active section:** **Section 5 — Registry → Executor Authority**

**Section 5 status:** **OPEN — `9919e89a...` materially fixes the geography architecture, but the final closure candidate is rejected on three bounded defects. §6 is NOT authorized.**

> This file does not hard-code its own resulting documentation commit SHA. The commit containing this revision becomes the live #618 head after the documentation update. The audited **code** checkpoint remains `9919e89a...` unless later code changes are independently reviewed. Before any mutation, read the live PR head and verify the local worktree exactly matches it.

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

- #618 code SHA: `9919e89aaceeb34bd06a3f3de7c37aa800fd703d`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**;
- #618 is **193 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- GitHub synthetic merge for #618 at the audited code checkpoint: `d27282eae5a5e03e4aa697ccef9af8854df3b634`;
- #618: open, draft, unmerged, mergeable;
- all five GitHub PR workflows completed successfully on exact code SHA `9919e89a...`: Release Truth, Claude Code Review, Guardrails, Target Platform Build and PR checks;
- Vercel Preview deployment `dpl_5XBpXvswjcgFerQAz7wzSnR8RAhC` is READY and carries exact `githubCommitSha=9919e89aaceeb34bd06a3f3de7c37aa800fd703d`;
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

Behavioral proof covers shipped control → canonical → serializer → request builder → browser API client → `/api/idx/search`, including min-only, max-only, both, clear-one and clear-both.

Complete-universe financing execution is Section 6, not Section 4.

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

## 5.B Bathrooms — preserve the verified contract

Verified rule:

- Full baths = `BathroomsFull`;
- Half baths = `BathroomsHalf`;
- half baths are first-class Cotality data and MUST NOT be rounded away;
- canonical numeric total = `BathroomsFull + (BathroomsHalf × 0.5)`;
- examples: 1 full + 1 half = 1.5; 2 full + 1 half = 2.5;
- `BathroomsTotalInteger` is NOT canonical;
- detailed UI/reporting should preserve components such as `2 full, 1 half`;
- quarter/partial bath components had no meaningful non-zero population in the verified current feed; do not invent semantics.

## 5.C Listing ID dual-domain — preserve the closed boundary

Distinct identity domains:

- Mallan local `SL-/RL-...` canonical identity;
- provider Cotality `ListingId` representation identity;
- provider `ListingKey` identity used for provider/media relationships.

Mallan local identity must never be sent blindly to Cotality as `ListingId`. Provider identifiers remain reconciliation evidence and do not replace Mallan canonical identity.

## 5.D Sponsor Unit execution ownership

Section 4 proved decoding/transport/refusal semantics. Section 5 owns the strategy only.

Because Sponsor Unit lives inside `CustomProperty.CustomFields`, do not invent a top-level provider field or generic checkbox mapping. Accepted future strategy = Mallan-side projection/complete-universe filtering; until §6 implements that truthfully, keep explicit refusal.

## 5.E Maximum Financing execution ownership

Accepted Section 5 outcome:

- registry owns `max_financing_percent`;
- canonical CustomFields decoder owns raw interpretation;
- executor strategy = `mallan_projection_filter` / complete-universe Mallan-side;
- current request boundary explicitly refuses until §6.

Do NOT implement page-local financing filtering here.

## 5.F Accepted provider/operator corrections — do not throw these away

Accepted progress from the §5 passes unless new contrary evidence appears:

- exact `StreetNumber eq` Search semantics replace numeric prefix matching for a selected/full address;
- `UnitNumber` case-insensitive execution uses live-proven `toupper(UnitNumber)`;
- provider `ListingId` positive path is live-proven while Mallan local IDs are refused from provider execution;
- `StreetDirPrefix` uses the live Cotality enum member form;
- date literal/operator shapes used by Search were live-probed;
- `PublicRemarks` keyword remains unverified at provider level and must fail loud, not disappear;
- sentinel guards on max-bound numeric provider predicates prevent unknown/zero/-1 values satisfying real upper bounds where proven sentinel semantics apply;
- BedroomsTotal zero remains a real studio and must not be sentinel-filtered;
- PostalCode `00000` is observed in-band unknown/sentinel, not a valid negative control; absence proof uses genuinely absent values;
- `UnsupportedGeographyError` must surface through the typed `UNSUPPORTED_CRITERION` 400 boundary, with truthful reason text;
- `executionReadiness()` must never call an explicitly unresolved authority verified executable;
- Mallan-derived/Mallan-CRM facts must not require fabricated Cotality evidence merely to become executable under a Mallan-side strategy.

## 5.G Neighborhood identity contract — LIVE COTALITY EVIDENCE + EXPLICIT MALLAN RULE

Neighborhood is a Section 5 concern because typed input, autocomplete, Map, Saved Search and server execution all write/read the same Search criterion.

### 5.G.1 Provider evidence — corrected full universe

Live Cotality `SubdivisionName` is the provider Search fact and `CityRegion` is the provider borough fact.

The current full-feed evidence reads:

- **591,409 Property rows**;
- **592 pages**;
- **not truncated**;
- **all statuses**;
- **all PropertyTypes / no PropertyType restriction**, so the evidence cannot drift away from Building Search merely because today's populated universe happens to be Residential + ResidentialLease;
- **632 folded SubdivisionName identities**;
- **124 of 632 folded names span more than one CityRegion**.

Therefore the old conclusion that folded neighborhood names were globally unique to one borough is **withdrawn**. It was true only in the earlier bounded/on-market slice and cannot be used as full-feed authority.

Raw observed `(normalized SubdivisionName × CityRegion × count)` combinations are evidence. They do not, by themselves, prove that a minority combination is provider error, a second real place, historical encoding, or a boundary case.

### 5.G.2 Mallan business geography — separate from Cotality observation

`mallan_canonical_geography` owns the interpretation layer after Cotality evidence.

Current rule model at audited code SHA `9919e89a...`:

- 507 names have one observed borough;
- 75 meet an explicit Mallan **99% sufficiency floor** and use that borough; this is a Mallan operating rule, NOT a claim that the residue is provider error;
- explicit Mallan geography decisions cover known cases such as Marble Hill, Downtown Brooklyn, Midwood and Stuyvesant Town;
- Bay Terrace is explicitly modeled as two places, Queens and Staten Island;
- 38 names remain **AMBIGUOUS** and are split into borough-qualified identities; a bare ambiguous name resolves to nothing and must be qualified;
- there is **no plurality fallback** below the declared floor.

Marble Hill is the guard case: the feed has more Bronx-tagged than Manhattan-tagged rows, but the Mallan geography decision is Manhattan. This proves why observation and business interpretation must remain separate layers.

### 5.G.3 Case/spelling variation — accepted

Case-only variants of one live Cotality identity collapse to one broker-facing option while preserving every raw provider spelling for execution.

Examples:

- `SoHo`, `SOHO`, `Soho`, `soho` → one **SoHo** identity;
- `NoHo`, `NOHO`, `Noho`, `noho` → one **NoHo** identity;
- `DUMBO`, `Dumbo`, `dumbo` → one **DUMBO** identity;
- `NoMad`, `NOMAD`, `nomad` → one **NoMad** identity;
- `Midtown`, `midtown` → one **Midtown** identity.

Do NOT merge genuinely different names without evidence. `Gramercy` and `Gramercy Park` remain separate.

### 5.G.4 ACCEPT vs OFFER — accepted

The browser now receives the full ACCEPT identity contract. `offered` is only a presentation flag for current autocomplete choices.

A valid historical/Closed identity such as Union Square may be accepted/restorable even when it is not offered in the current-market dropdown.

This prevents OFFER from becoming an accidental execution authority.

### 5.G.5 Browser/server resolver parity — accepted at `9919e89a...`

The generated server resolver and shipped browser resolver now share the same cardinality rule:

- 0 candidates → unknown;
- 1 candidate → resolved;
- multiple candidates → ambiguous unless an explicit borough/qualified label disambiguates.

The browser no longer returns the first raw-spelling match for a bare ambiguous value. `Bay Terrace` resolves to neither place; `Bay Terrace, Queens` and `Bay Terrace, Staten Island` resolve to their specific identities.

Qualified labels parse the borough suffix before folding, so `Downtown, Brooklyn` cannot collide with the distinct real name `Downtown Brooklyn`.

`tests/runtime/browser-neighborhood-resolver.test.ts` executes the shipped browser module against the generated vocabulary and sweeps identity labels and raw provider spellings for browser/server disagreement.

### 5.G.6 Map boundary — accepted at `9919e89a...`

Polygon names remain presentation geometry only.

Map → Search now calls the browser canonical resolver. It distinguishes:

- resolved identity → canonical Search value;
- unknown → reported and not sent;
- ambiguous → candidate choices reported and not auto-picked.

Old RLS polygon/alias data may remain for drawing geometry, but it is not provider Search identity.

### 5.G.7 Loader/provider terminology — accepted at `9919e89a...`

Accepted:

- neighborhood vocabulary loads from absolute `/crm/data/neighborhood-vocabulary.generated.json`;
- loading / ready / failed are explicit states;
- raw provider `StatenIsland` is not the broker-facing label; display is `Staten Island`;
- active authenticated Search provider wording was corrected to Cotality where the provider engine is being described;
- REBNY/RLS may remain where genuinely required for compliance/attribution/legal context.

## 5.H FINAL BOUNDED §5 BLOCKERS AFTER INDEPENDENT REVIEW OF `9919e89a...`

Do **not** reopen the already-fixed geography architecture. Only these bounded defects remain.

### BLOCKER 1 — Saved Search restore can still silently widen an ambiguous/unknown neighborhood

`_criteriaToFormFields()` creates `_restoreIssues` specifically so any criterion that cannot be faithfully restored blocks auto-execution.

But the neighborhood branch currently does:

- `resolveState(n) === ambiguous` → show warning and `return` from that item;
- `resolveState(n) === unknown` → show warning and `return` from that item;
- **neither branch pushes a restore issue**.

`loadSavedSearch()` blocks execution only when `restoreIssues.length > 0` or when the server independently reports a non-executable disposition.

The server `savedSearchDisposition()` currently derives its status from `checkbox_filters`; it does not classify neighborhood ambiguity/unknown geography. Therefore a legacy saved search containing bare `Bay Terrace` can be reported server-side as executable, have the neighborhood skipped by the browser, and then auto-run a broader search.

Required correction:

- ambiguous neighborhood restore MUST push a named `_restoreIssues` entry including the candidate qualified identities;
- unknown neighborhood restore MUST push a named `_restoreIssues` entry;
- local restore completeness must independently stop `performSearch()` even when server `criteria_status` says executable;
- add a **behavioral** test that runs the actual Saved Search restore/load path and proves bare ambiguous and unknown neighborhoods do not call `performSearch()`;
- prove qualified `Bay Terrace, Queens` and `Bay Terrace, Staten Island` restore normally.

Full Saved Search v2 remains §8. This narrow fail-closed restore fix is §5 because the active geography writer/reader cannot be certified while it can drop a criterion and execute.

### BLOCKER 2 — ambiguous live Cotality geography is reported with a false absence message

`neighborhoodOData()` correctly distinguishes `unknown` from `ambiguous`, but both currently throw `UnsupportedGeographyError`, whose constructor text says:

`Not a live Cotality value.`

That is false for a bare ambiguous live value such as `Bay Terrace`; Cotality does carry the value, but Mallan requires borough qualification because the name maps to multiple identities.

Required correction:

- preserve typed fail-closed route behavior;
- distinguish **unknown/not-live** from **ambiguous/requires-borough** in the error reason/details;
- do not describe a live ambiguous provider value as absent;
- add direct route/boundary proof for both cases.

### BLOCKER 3 — authority prose still contains withdrawn/contradictory geography claims

The executable behavior is newer than some comments/registry notes. §5 cannot close while its authority record simultaneously states the old and new models.

Required cleanup:

- `FIELD_REGISTRY` neighborhood note still contains the superseded sentence that every other split resolves to the dominant borough and references removed `artifacts/neighborhood-minority-borough-exclusions.json`; remove/rewrite that stale paragraph rather than appending another correction after it;
- `geography.ts` still says the executor enforces a “dominant-borough decision” and calls Downtown Brooklyn minority rows “provider error”; that claim was withdrawn and is not established by Cotality counts;
- `neighborhood-autocomplete.js` top comments still describe Union Square/Stuyvesant Town as absent and cite the old 240-value single-borough census; replace with the full-feed evidence/rule model;
- no removed artifact or withdrawn provider-error/dominance claim may remain as current authority prose.

### Final §5 correction set

The next code pass is limited to:

1. Saved Search ambiguous/unknown neighborhood restore → `_restoreIssues` + behavioral no-auto-run proof;
2. truthful unknown-vs-ambiguous server error semantics;
3. remove stale contradictory geography authority prose/references;
4. regenerate `public/crm/index-built.html` if browser source changes;
5. rerun the targeted geography/Saved Search/error-boundary suites as a group;
6. rerun registry→executor census and negative drift proof;
7. rerun broad Search/compliance/UCBA/IDX gates;
8. push one bounded checkpoint;
9. prove all five GitHub workflows and exact-SHA Vercel Preview;
10. STOP for independent §5 closure review before touching §6.

## 5.I Registry → executor census

By Section 5 closure, machine-checkably prove:

- every executable canonical criterion;
- its registry owner;
- its execution strategy;
- exact provider mapping or Mallan-side strategy;
- specialized subordinate vocabulary owner where applicable;
- zero duplicate active execution maps for the same semantic criterion;
- every unsupported/unverified criterion has explicit fail behavior;
- every criterion the live executor can execute resolves to `verified_executable` under the canonical readiness model;
- `needs_probe`, semantic-false, unresolved, refused or not-yet-wired criteria cannot masquerade as verified execution.

The census must fail CI if a new executor mapping appears without an authority owner or if an executing criterion is not canonically verified.

## SECTION 5 CLOSURE GATE

Do not move to §6 until:

- bathroom semantics remain aligned with fractional Full + Half×0.5;
- listing-ID domains remain explicitly resolved;
- every executable criterion has exactly one authoritative execution owner;
- route-level special cases are justified named strategies or folded under the canonical owner;
- Sponsor Unit strategy is authoritative and not an invented top-level field;
- Maximum Financing has one strategy but is not prematurely page-filtered;
- unverified capabilities remain blocked;
- browser geography has no second hard-coded authority;
- case-only neighborhood variants collapse without losing verified provider spellings/inventory;
- full-feed neighborhood evidence is distinct from Mallan geography business decisions;
- ambiguous neighborhood identity never auto-picks a borough;
- Map cannot write an unverified/ambiguous polygon name into Search;
- Saved Search restore cannot drop an ambiguous or unknown neighborhood and then auto-execute;
- ambiguous live Cotality geography is not falsely described as absent/non-live;
- neighborhood load/error state is explicit and the absolute CRM data path is used;
- active Search provider language does not call REBNY/RLS the provider engine;
- registry/comments/evidence references agree with the current authority model and contain no withdrawn dominance/provider-error claim as current truth;
- registry→executor census is clean under the stronger readiness invariant;
- negative drift tests catch duplicate/unauthorized execution mapping and geography drift;
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

Prove min-only, max-only, both, neither, absent/unparseable, `0.00` sentinel = not specified, and no cross-listing building-fact fabrication.

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

Also simplify the broker-facing Search surface: remove obsolete disabled legacy controls rather than making agents work around unsupported options. Preserve canonical criteria and verified Cotality mappings; old markup does not authorize new filters.

# 8. SEARCH STEP 5 — MAP + SAVED SEARCH + WORKBENCH

Map/Grid share one canonical criteria object, final universe and Listing identity.

Polygon/geometry names may be presentation assets, but Map selection that writes Search criteria must resolve through the verified Cotality/Mallan neighborhood identity contract established in §5.

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

**STATUS:** **OPEN — `9919e89a...` final closure candidate rejected by independent audit on three bounded defects**

**SECTION 4 CLOSURE SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**LATEST AUDITED §5 CODE CHECKPOINT SHA:** `9919e89aaceeb34bd06a3f3de7c37aa800fd703d`

**CHECKPOINT DELIVERY PROOF:** all five GitHub PR workflows passed at exact `9919e89a...`; Vercel Preview `dpl_5XBpXvswjcgFerQAz7wzSnR8RAhC` is READY at the same SHA. Green delivery does not override the three behavioral/authority blockers below.

**STACK:** #620 head `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`; #618 and #620 remain diverged; #618 is 193 commits ahead / 3 behind from merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`. No restack without Maya authorization.

**§5 PROGRESS ACCEPTED / DO NOT REOPEN WITHOUT NEW EVIDENCE:**

- fractional bathroom authority = Full + Half×0.5; half baths preserved;
- provider/Mallan listing-ID domain separation;
- Sponsor Unit future strategy = Mallan-side complete-universe projection; refused until §6;
- Maximum Financing future strategy = Mallan-side complete-universe projection; refused until §6;
- exact StreetNumber Search, case-insensitive UnitNumber execution, corrected sentinel behavior and typed provider boundaries;
- unresolved authority cannot report `verified_executable`;
- full-feed geography evidence = 591,409 Property rows / 592 pages / all statuses / all PropertyTypes;
- 124/632 folded neighborhood names span multiple CityRegions, so global name uniqueness is withdrawn;
- Cotality observed geography is separated from `mallan_canonical_geography` business decisions;
- no plurality fallback below the declared rule floor;
- browser/server resolver parity is behaviorally tested on shipped browser code;
- case variants collapse without losing provider spellings;
- ACCEPT and OFFER are distinct;
- bare ambiguous neighborhood values do not auto-pick a borough in browser/server resolver;
- Map distinguishes resolved / unknown / ambiguous and does not auto-pick ambiguity;
- absolute CRM vocabulary path and explicit loading/failure states are committed;
- active provider-engine wording is Cotality;
- exact-SHA CI and Vercel Preview are green.

**CURRENT §5 WRONG-ANSWER / CLOSURE BLOCKERS — ONLY THESE:**

1. Saved Search restore detects ambiguous/unknown neighborhood values but does not append them to `_restoreIssues`; because server disposition currently does not classify geography ambiguity, the skipped neighborhood can still be followed by auto-execution of a broader search. Add restore issues + real no-auto-run behavioral proof.
2. Server geography boundary calls ambiguous live values “Not a live Cotality value.” Distinguish unknown from ambiguous/requires-borough truthfully while preserving fail-closed typed behavior.
3. Clean stale authority prose: remove the superseded dominant-borough/provider-mis-tagging paragraph and deleted-artifact reference from `FIELD_REGISTRY`; remove withdrawn provider-error/dominance prose from `geography.ts`; replace the old 240-value/single-borough/Union-Square-absent comments in `neighborhood-autocomplete.js`.

**FINAL §5 PASS:** correct those three only; regenerate the CRM bundle if needed; run targeted Saved Search/geography/error-boundary tests, registry→executor census, broad Search/compliance gates, exact GitHub workflows and exact-SHA Vercel Preview; then STOP for independent §5 closure review.

**NEXT SECTION ALLOWED:** none. §6 only after independent Section 5 closure.

**DO NOT START YET:** §6 complete-universe financing/Open House, §8 Saved Search v2, CMA runtime, My Listings, Eblast, Neon/R2.

**DOWNSTREAM TRACKED:** unknown beds/baths/rooms/DOM → display-copy zero and detailed bathroom presentation (`2 full, 1 half`) must be corrected before §7/§10 closure.
