# CURRENT — Claude Continuation Directive

**Repository:** `mallan67/mallan-nyc`

**Active Search PR:** #618

**Active Search branch:** `fix/neon-p0-event-driven-wake-2026-08-16`

**Verified Section 4 closure code SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**Section 4 status:** **CLOSED BY EVIDENCE**

**Verified Section 5 functional closure code SHA:** `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`

**Section 5 status:** **CLOSED BY EVIDENCE** — independently accepted. No remaining wrong-answer defect in the §5 geography / transport / Registry→Executor chain.

**Current active section:** **SECTION 6 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH**

**Section 6 status:** **AUTHORIZED.**

> DO NOT REOPEN §5. Geography, neighbourhood transport, qualifier semantics, Saved Search geography restore, browser/server resolver parity and the Registry→Executor work are proven at `8e03fd3f...`. Return to §5 only if a NEW behavioral defect directly invalidates an established invariant.

> This file does not hard-code its own resulting documentation commit SHA. The commit containing this revision becomes the live #618 head. Before any mutation, read the live PR head and verify the local worktree exactly matches it.

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

- #618 code SHA: `4163435a907ad1ec56149a60fb3057187a395c6f`;
- #620 head: `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- comparison: **diverged**;
- #618 is **195 commits ahead and 3 commits behind** #620 relative to merge base `a0db2dac8b933bc2d978143721418427c0ebb65a`;
- GitHub synthetic merge for #618 at the audited code checkpoint: `1838e1c3647fabe8129d24281ec609409a5b3f1a`;
- #618: open, draft, unmerged, mergeable;
- all five GitHub PR workflows completed successfully on exact code SHA `4163435a...`: Release Truth, Claude Code Review, Guardrails, Target Platform Build and PR checks;
- Vercel Preview deployment `dpl_EnG6juKwyLZZfrVREzwzvw89qD3W` is READY and carries exact `githubCommitSha=4163435a907ad1ec56149a60fb3057187a395c6f`;
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

**SECTION 5 — CLOSED BY EVIDENCE at `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`.**

Everything below is the RECORD of what was established and must hold. Do not reopen it. The invariants are listed in §17; a change that breaks one is a new defect, not a reopened section.

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
- `UnsupportedGeographyError` surfaces through the typed `UNSUPPORTED_CRITERION` 400 boundary;
- the geography error boundary now truthfully distinguishes `not_live` from `ambiguous` and carries qualified options for ambiguity;
- `executionReadiness()` must never call an explicitly unresolved authority verified executable;
- Mallan-derived/Mallan-CRM facts must not require fabricated Cotality evidence merely to become executable under a Mallan-side strategy;
- Saved Search ambiguous/unknown neighborhood restore now records `_restoreIssues` and behaviorally blocks auto-execution rather than silently widening the saved query.

## 5.G Neighborhood identity contract — LIVE COTALITY EVIDENCE + EXPLICIT MALLAN RULE

Neighborhood is a Section 5 concern because typed input, autocomplete, Map, Saved Search and server execution all write/read the same Search criterion.

### 5.G.1 Provider evidence — corrected full universe

Live Cotality `SubdivisionName` is the provider Search fact and `CityRegion` is the provider borough fact.

The current full-feed evidence reads:

- **591,409 Property rows**;
- **592 pages**;
- **not truncated**;
- **all statuses**;
- **all PropertyTypes / no PropertyType restriction**;
- **632 folded SubdivisionName identities**;
- **124 of 632 folded names span more than one CityRegion**.

Therefore the old conclusion that folded neighborhood names were globally unique to one borough is **withdrawn**. It was true only in the earlier bounded/on-market slice and cannot be used as full-feed authority.

Raw observed `(normalized SubdivisionName × CityRegion × count)` combinations are evidence. They do not, by themselves, prove that a minority combination is provider error, a second real place, historical encoding, or a boundary case.

### 5.G.2 Mallan business geography — separation rule

`mallan_canonical_geography` owns interpretation after Cotality evidence.

Accepted rules:

- a business decision must be explicitly named, owned and explained;
- Cotality observation remains uninterpreted evidence;
- the declared 99% dominance default is a Mallan operating decision, not a provider-error claim;
- explicit Mallan geography decisions cover cases such as Marble Hill, Downtown Brooklyn, Midwood and Stuyvesant Town;
- Bay Terrace is explicitly modeled as two real places;
- there is no hidden plurality fallback.

Marble Hill remains the guard case: provider counts alone would choose Bronx, while the declared Mallan geography decision is Manhattan.

**NEW CLOSURE FINDING at `4163435a...`: the implementation still violates this separation for the so-called ambiguous branch.** See Blocker 2 below.

### 5.G.3 Case/spelling variation — accepted

Case-only variants of one live Cotality identity collapse to one broker-facing option while preserving every raw provider spelling for execution.

Examples:

- `SoHo`, `SOHO`, `Soho`, `soho` → one **SoHo** identity;
- `NoHo`, `NOHO`, `Noho`, `noho` → one **NoHo** identity;
- `DUMBO`, `Dumbo`, `dumbo` → one **DUMBO** identity;
- `NoMad`, `NOMAD`, `nomad` → one **NoMad** identity;
- `Midtown`, `midtown` → one **Midtown** identity.

Do NOT merge genuinely different names without evidence. `Gramercy` and `Gramercy Park` remain separate.

### 5.G.4 ACCEPT vs OFFER — accepted concept, transport must be lossless

The browser receives the full ACCEPT identity contract. `offered` is only a presentation flag for current autocomplete choices.

A valid historical/Closed identity such as Union Square may be accepted/restorable even when not offered in the current-market dropdown.

However, **ACCEPT is not truthful unless every accepted identity can survive the actual browser→wire→route transport without being split or rewritten.** This is the new comma-bearing transport blocker below.

### 5.G.5 Browser/server resolver parity — accepted for resolver logic

The generated server resolver and shipped browser resolver share the same cardinality behavior for the identities they are given:

- 0 candidates → unknown;
- 1 candidate → resolved;
- multiple candidates → ambiguous unless a borough/qualified label disambiguates.

Qualified labels now use parentheses rather than commas, e.g.:

- `Bay Terrace (Queens)`;
- `Bay Terrace (Staten Island)`.

This avoids collision with the existing comma-delimited request representation for Mallan-constructed qualified labels.

`tests/runtime/browser-neighborhood-resolver.test.ts` executes the shipped browser resolver against the generated vocabulary. Preserve it, but do not treat resolver parity as proof of transport parity.

### 5.G.6 Map boundary — accepted

Polygon names remain presentation geometry only.

Map → Search calls the browser canonical resolver and distinguishes resolved / unknown / ambiguous. Unknown and ambiguous values are not auto-picked and not written blindly as provider Search truth.

Old RLS polygon/alias data may remain for drawing geometry only.

### 5.G.7 Loader/provider terminology — accepted

Accepted:

- absolute `/crm/data/neighborhood-vocabulary.generated.json`;
- explicit loading / ready / failed states;
- provider `StatenIsland` displays as `Staten Island`;
- active provider-engine wording is Cotality;
- REBNY/RLS only where genuinely compliance/attribution/legal context.

### 5.G.8 Prior three blockers — CLOSED at `4163435a...`

Independent review accepts these corrections:

1. Saved Search restore now appends ambiguous/unknown neighborhood failures to `_restoreIssues` and a behavioral test proves they prevent `performSearch()` while qualified/ordinary values still restore and execute.
2. `UnsupportedGeographyError` now distinguishes `not_live` from `ambiguous`; the route carries `refusal`, `options` and truthful detail while keeping both fail-closed 400 `UNSUPPORTED_CRITERION`.
3. The stale dominant-borough/provider-mis-tagging/deleted-artifact claims identified in the previous review were removed or explicitly withdrawn from active authority prose.

## 5.H FINAL BOUNDED §5 BLOCKERS AFTER INDEPENDENT REVIEW OF `4163435a...`

Do **not** reopen the already-fixed work above. Section 5 remains open for exactly these two defects.

### BLOCKER 1 — accepted live provider neighborhood values cannot survive comma-delimited transport

The active shipped chain still encodes the neighborhood set as comma-separated text:

`criteria.neighborhoods[] → join(',') → one neighborhood query param → server split(',') → neighborhoodOData()`

That representation is not lossless because the full ACCEPT vocabulary itself contains literal Cotality `SubdivisionName` values with commas:

- `Williamsburg,North`;
- `Williamsburg,South`.

The generated contract keeps those exact provider spellings, and `artifacts/neighborhood-borough-resolution.json` explicitly records that the current comma-separated request param splits them and **the search is wrong**.

This cannot be deferred merely because they are not currently OFFERED. Section 5 claims ACCEPT represents executable provider identity, and Comparable/Closed/Saved Search paths may carry accepted values that are not offered in the current-market autocomplete.

The existing “every live value stays searchable” test is insufficient because it calls `neighborhoodOData([name])` directly and bypasses the browser serializer, URL parameter and server parser. That is a green test around the actual defect.

Required correction:

- replace comma-delimited neighborhood transport with one lossless canonical list contract through every hop;
- preserve provider spellings exactly — do not rename `Williamsburg,North` or `Williamsburg,South` merely to fit the wire;
- use a representation that cannot confuse a delimiter with provider data (for example repeated query parameters or another explicit list encoding), and migrate all authenticated Search readers/writers consistently;
- keep borough/status transports separate; do not casually refactor unrelated CSV criteria unless the impact graph requires it;
- add behavioral transport proof from broker criteria through the actual query representation and route parser/executor for:
  - `Williamsburg,North`;
  - `Williamsburg,South`;
  - ordinary multi-select `Tribeca` + `Yorkville`;
  - `Bay Terrace (Queens)`;
  - one literal-comma name combined with an ordinary neighborhood;
- update the vocabulary “searchable” test so SEARCHABLE means the shipped browser→route chain, not only direct `neighborhoodOData()` invocation;
- add a negative guard that no accepted provider value becomes multiple criteria because of transport encoding.

### BLOCKER 2 — the 5% split-presence cutoff silently makes a borough decision while labeling the result “ambiguous / no decision”

The generator currently declares:

- `DOMINANCE_FLOOR = 0.99`;
- `SPLIT_PRESENCE_FLOOR = 0.05`.

For a name with multiple observed boroughs, no explicit Mallan decision, and top share below 99%, it enters `ambiguous_requires_borough` — but then keeps only boroughs whose share is at least 5%.

If the minority observed borough is below 5%, only one borough survives. `qualify` then becomes false, so the generator emits one **unqualified bare identity** even while the resolution artifact says:

`No Mallan decision ... The bare name must be qualified; it is never auto-assigned.`

Concrete proof: `Baychester` is observed Bronx 26 / Manhattan 1. The artifact records:

- `basis = ambiguous_requires_borough`;
- `resolvedTo = [Bronx]`;
- owner = `cotality_observation`;
- reason = bare name must be qualified / never auto-assigned.

But the generated vocabulary emits one unqualified `Baychester` identity in Bronx, so bare `Baychester` resolves automatically.

This is not merely a wording defect. The 5% cutoff is making an interpretation about which observed borough “counts.” That is a Mallan business rule, yet the artifact labels the outcome Cotality observation and simultaneously says no decision exists.

Required correction:

- do not infer that an observed borough below 5% is noise/provider error;
- preferred fail-safe model under the no-guess rule: when `basis = ambiguous_requires_borough`, preserve **every observed borough with positive evidence**, emit a qualified identity for each, and make bare input resolve to nothing;
- if Mallan intentionally wants a presence-floor policy instead, it must become an explicitly named Mallan-owned rule/basis with a stated reason and tests; it may not masquerade as `cotality_observation` or “no decision”;
- add generator invariants:
  - every `ambiguous_requires_borough` resolution emits more than one identity;
  - every bare ambiguous name satisfies `identityFor(name) === null`;
  - absent an explicit Mallan-owned rule, ambiguous `resolvedTo` equals all observed boroughs with positive evidence;
  - any threshold-based interpretation is owned by `mallan_canonical_geography`, not `cotality_observation`;
  - the generated ambiguous count equals the actual count of bare names that do not resolve;
- add worked regression cases including `Baychester` and at least one multi-borough case where all boroughs exceed the floor.

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
- `needs_probe`, semantic-false, unresolved, refused or not-yet-wired criteria cannot masquerade as verified execution;
- every accepted neighborhood identity survives the actual authenticated Search transport intact;
- every geography decision is attributed to the correct authority layer.

The census must fail CI if a new executor mapping appears without an authority owner or if an executing criterion is not canonically verified.

## SECTION 5 CLOSURE GATE — SATISFIED

Every item below was met at `8e03fd3f...` and independently accepted. Retained as the standard §6 closure is held to, not as open work.

The bar that was cleared:

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
- ambiguous neighborhood identity never auto-picks a borough unless an explicit Mallan-owned decision resolves it;
- Map cannot write an unverified/ambiguous polygon name into Search;
- Saved Search restore cannot drop an ambiguous or unknown neighborhood and then auto-execute;
- ambiguous live Cotality geography is not falsely described as absent/non-live;
- every accepted provider neighborhood value survives browser→URL→route transport intact, including values containing delimiter characters;
- no hidden percentage threshold converts an “ambiguous / no decision” state into an unqualified auto-resolved identity;
- neighborhood load/error state is explicit and the absolute CRM data path is used;
- active Search provider language does not call REBNY/RLS the provider engine;
- registry/comments/evidence references agree with the current authority model;
- registry→executor census is clean under the stronger readiness invariant;
- negative drift tests catch duplicate/unauthorized execution mapping, geography authority drift and transport loss;
- grouped targeted tests pass;
- broad Search/compliance gates pass at the closure checkpoint;
- exact GitHub workflows and Vercel Preview pass on the closure head;
- `CURRENT.md` records the exact Section 5 closure SHA only AFTER independent closure review.

# 6. SEARCH STEP 3 — FINAL UNIVERSE / COUNT / PAGINATION TRUTH

**STATUS: AUTHORIZED.** Section 5 closed by evidence at
`8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b` and the block on this section is lifted.

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

Negative proof includes unsupported criterion refusal, unknown enum fail-closed, incomplete-universe labeling, no false Map completeness, no canonical-state loss, return-copy suppression, canonical listing authority, no unknown money/numeric facts presented as real zero, and no case/spelling/transport variation causing neighborhood inventory loss.

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

**CURRENT SECTION:** 6 — Final Universe / Count / Pagination Truth

**STATUS:** **AUTHORIZED — Section 5 closed by evidence.**

**SECTION 4 CLOSURE SHA:** `939884e15ec8447988c7fb791a8978fb8676f3a4`

**SECTION 5 FUNCTIONAL CLOSURE SHA:** `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`

**§5 CLOSURE PROOF:** all five GitHub PR workflows green at that exact SHA; Vercel Preview `dpl_9k7jrmmk2G7PGpKAjvRciWrN99YQ` READY with `githubCommitSha=8e03fd3f...`; #618 open, draft, unmerged, mergeable.

**§5 ESTABLISHED INVARIANTS — DO NOT REOPEN:**

- fractional bathroom authority = Full + Half×0.5, half baths preserved as first-class data;
- provider / Mallan listing-ID domain separation;
- Sponsor Unit and Maximum Financing = Mallan-side complete-universe strategies, refused until §6;
- exact StreetNumber Search; case-insensitive UnitNumber via live-proven `toupper()`;
- numeric max-bound sentinel guards, with BedroomsTotal zero preserved as a studio;
- unresolved authority can never report `verified_executable`;
- geography evidence = 591,409 Property rows, every status, every PropertyType, not truncated;
- neighbourhood identity is (borough × normalised name); global name uniqueness is withdrawn;
- Cotality observation is separated from `mallan_canonical_geography` decisions, with no plurality fallback and no hidden presence cutoff;
- ambiguity preserves every observed borough and the bare name resolves to nothing;
- a supplied borough qualifier is never ignored — `impossible_qualifier` is its own truthful refusal;
- browser and server resolvers are behaviourally identical, swept over every label and provider spelling;
- neighbourhood lists travel as REPEATED query parameters, so literal-comma provider values survive losslessly;
- Saved Search records an unrestorable geography criterion as a restore issue and does not auto-run;
- ACCEPT and OFFER are distinct sets; case variants collapse without losing provider spellings.

**SECTION 6 SCOPE — WHAT IT OWNS:**

Complete-universe execution for criteria that cannot truthfully execute as a direct provider predicate, including the already-declared Mallan-side strategies (Maximum Financing, Sponsor Unit). The chain is:

`Cotality candidate universe → Mallan listing authority / return-copy suppression → eligibility/identity → dedupe → Mallan-side corpus filters → sort → final count → pagination`

Never page first and then apply a membership-changing criterion. DO NOT implement page-local substitutes. Open House is in scope: the current implementation is post-pagination / wrong-universe and must be fixed or explicitly refused.

Before §6 financing execution, live-probe the exact narrow expansion `$expand=CustomProperty($select=CustomFields)` — the current bare full-CustomProperty expansion is inferred from an older compound-select 400, not proven necessary.

**SEQUENCE AFTER §6:** §7 complete Sale/Rental Search → §8 Map + Saved Search + Workbench → §9 Compare + Reports + CMA → §10 authenticated browser E2E on desktop/tablet/mobile.

**HOLDS:** no restack of #618 onto #620; no Neon/R2; no schema, migration or env change; no Production deployment; public consumer Search remains protected zero-delta.

**DOWNSTREAM TRACKED (for §7/§10, not §6):** unknown beds/baths/rooms/DOM render as display-copy zero; detailed bathroom presentation must preserve components (`2 full, 1 half`); the IDX attribution bar still reads "REBNY RLS via Trestle" and is compliance-shaped text awaiting Maya's decision.
