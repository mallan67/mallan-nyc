# SEARCH HANDOFF — 2026-09-08 (session end, pre-compaction)

Branch `search/browser-integration-2026-09-05`. Read this before anything else. Every fact below is
tagged **LIVE** (measured against api.cotality.com this session, HTTP status checked), **DB** (read-only
SQL on hidden-mountain / br-crimson-frog-adr7g9gt), **CODE** (read at the cited line), or **UNVERIFIED**.
Nothing tagged otherwise may be treated as fact.

---

## 0. MAYA'S DIRECTIVES — these govern the next session, verbatim in spirit

1. **"Spot checks, sampling — this is a waste of time."** No sampled verification may be reported as
   proof. The stored corpus is 26,497 provider listings; the live corpus is 591,600. Both are small
   enough to check EXHAUSTIVELY (265 batch requests of 100 keys; 2 key-census requests at `$top=300000`).
   A `--limit` run is UNVERIFIED by definition. `ORDER BY updated_at DESC` samples the rows the sync just
   wrote — the best-case population — and hid a known 6,759-row status divergence this session.
2. **"This is not something you can just code and wish it falls into place. There are real errors that
   need to be fixed."** Stop building verification scaffolding. §4 lists the proven defects. Fix them.
3. **Everything from the Cotality API, live.** No inference from field names, URL contents, or docs.
   "Zero rows on our feed" means *contract present, feed empty* — never "use a different field."
   Do not trust prior agents' or prior sessions' claims; re-measure.
4. **Agents may find; only scripts judge.** Read-only `Explore` agents (no Edit/Write) for fan-out
   reads; every claim they make is a hypothesis until a live law or a direct read confirms it.
   Never subagents against the writable checkout. One writer.
5. **Held paths (no mutation without explicit authorization):** `public/crm/**`, `.claude/**`,
   `.github/workflows/**`, schema/migrations, Neon, R2, env, production, GitHub rulesets, Vercel config,
   the MCP verification authority.
6. **No schema change. No DB mutation. No production deploy.** Read-only DB access only.
7. Cotality/Trestle is the ONLY provider. `RLS` = REBNY compliance only. `SL-`/`RL-` = Sale/Rental
   listing identities (Mallan), preserved. `RESO` appears in provider namespaces/payloads
   (`Cotality.DataStandard.RESO.DD.*`, `@reso.context`) and must not be banned as a literal token.
8. Independent Mallan publishing must keep working: add/edit/feature listings and open houses on
   mallan.nyc without waiting for the feed round-trip.

---

## 1. REPO STATE

- HEAD `aefd5334` on `search/browser-integration-2026-09-05` (descends from `b49a30c7`; `main` at
  `2a83952a` is 5 behind on nothing relevant). Tracked tree clean at handoff except the two files
  committed with this document.
- Commits this session (newest first):
  - `aefd5334` fix(validator): three-way picklist diagnosis; `rls_listed` in the enum snapshot;
    `live-truth.ts` stamp bumped to 2026-09-08 (fixed a red suite from `60817b3d`).
  - `12d7a773` feat(search): ported Cotality spine (`live-client.mjs`, `query-live.mjs`,
    `compile-live-contract.mjs` + fingerprint) and the closure orchestrator
    (`scripts/search/closure/{lib,run,capture-git-state,verify-provider-contract}.mjs`); guard test
    `tests/runtime/cotality-live-authority-guard.test.ts` (7 pass, 1 todo).
  - `8f2bca20` fix(dom): DOM consumes `participant_only` (one canonicalization for D1+D3); Closed
    resets DOM (D4). 512/512 compliance tests.
  - Earlier same day on this lane: `derivePermissionGates` → `participant_only = tokens.includes('Private')`
    (Maya-directed); `rls-eligibility.ts` / `rls-enforcement.ts` live-vocabulary corrections.
- Untracked scratch left in `docs/Backend Search/*.txt` (Maya's strategy documents — read them, they
  are the program's requirements) and `docs/operations/evidence-2026-09-07/`.
- npm: `cotality:query`, `cotality:compile[:schema]`, `search:closure`, `cotality:pull` (now records
  `rls_listed`).
- Pre-existing red suites at HEAD, none caused this session, none fixed: `jest-config-reachability`
  (`.cache/closure2/*`), `guardrails-prohibited-terms` (`.cache/closure/JOURNAL-PARSED.json`),
  `rls-validator-canonical-reporter` (expects 0 form errors — forms are wrong, see §4),
  `s1-compliance-repoint` (asserts the superseded `participant_only=false` contract),
  `provider-authority-census` (two `scripts/__probe-*.ts` scratch files).

---

## 2. WHAT EXISTS NOW (all verified by execution)

| Component | Path | State |
|---|---|---|
| Live client | `scripts/cotality/live-client.mjs` | quota-header throttle (280/min, 8400/hr read from headers), time-budgeted 429, `declared` resolved from `$metadata`, no snapshot fallback |
| Contract compiler | `scripts/cotality/compile-live-contract.mjs` | `--schema-only` → 17 resources / 1,456 fields / 31 navs, `evidence_sha256 2c832915…` at 8f2bca20, ~130 MB |
| Closure orchestrator | `scripts/search/closure/run.mjs` | PASS/BLOCKED/UNVERIFIED bound to SHA; unimplemented stage ⇒ UNVERIFIED; exit 0/1/2 proven |
| Derivation registry stage | `scripts/search/closure/compile-capability-graph.mjs` | **UNCOMMITTED until this handoff.** Ran on a 200-row sample ⇒ BLOCKED (4 laws). MUST be made exhaustive (§8). |
| Provider Behavior Catalogue | `scripts/cotality/provider-behavior.mjs` | **UNCOMMITTED until this handoff.** 12 measured behaviours as executable assertions; `--verify` ⇒ 11 hold, PB-02 reframed (§5). |
| Enum snapshot | `data/cotality-enums.live.json` | pulled 2026-09-08, `rls_listed[resource][field]` added, vocabulary byte-identical to 09-06/09-07 |
| Guard | `tests/runtime/cotality-live-authority-guard.test.ts` | fails the build on snapshot fallback / attempt-count retry / missing fingerprint |

---

## 3. THE LIVE COTALITY MODEL — every item LIVE unless marked

**Entitlement (17 entity sets):** accessible = Property, Office, Member, Media, OpenHouse,
CustomProperty, PropertyRooms, PropertyUnitTypes, Field, Lookup, Model. Not accessible = Building 403,
HistoryTransactional 400 "no access", Teams/TeamMembers 400, Enumeration 404,
PropertyGreenVerification 404. Buyer-side navs (BuyerAgent/BuyerOffice/CoBuyer*) 400.

**Navigation graph:** 31 declared edges, 25 expand live. Property: Media, OpenHouse, CustomProperty,
ListAgent, CoListAgent, ListOffice, CoListOffice (data), Rooms/UnitTypes (REBNY ≈ unused: 86 / 1 rows
in the whole set), Building (200, 0 data). Office and Member each have 5 navs incl. reverse
`ListOfficeProperties` / `ListAgentProperties` (work via `$expand` on a filtered Office/Member query;
`Office(key)/Nav` URL segments 404). Every subsection has a `Property` back-nav.

**Authorities:** `$metadata` = existence for THIS subscription (1,456 fields). `Field` = platform-wide
catalogue (2,249 rows, includes `Media.MediaURLDirect`, `PropertyLevels`, `Custom_Property` — not
selectable). `Field.Definition` is empty (= name) for all 2,249 rows; real definitions are on `Lookup`
rows and Cotality's public docs. `Lookup.SystemReferences` includes `RLS` = REBNY lists the member —
a VOCABULARY fact only (MlsStatus RLS-listed and null everywhere; VideosCount unlisted and >0 on
31,498 rows).

**Query capabilities:** `$top` 1,000 normal / 300,000 key-only (`$select=ListingKey`). `@odata.nextLink`
emitted on every FULL page incl. the last; following it → 0 rows, no link. `$expand` works with nested
`$select/$filter/$orderby/$top` (proven by row counts). Navigation-path lambda filters unsupported
(`OpenHouse/any(...)` → 400 reads it as a field). `contains()` on `CustomProperty.CustomFields` is
accepted and inert (empty needle → 0). `PrettyEnums=true`, `Replication=true` accepted. Not filterable
on Property (221 fields) incl. `Latitude`, `Longitude`, `MLSAreaMajor/Minor`, `MlsStatus`,
`Internet*DisplayYN`, `DaysOnMarket*`, all `Buyer*`, `PrivateRemarks`, `ExpirationDate`.

**Population (Property, 591,600 rows):** 312 fields populated >0; 224 filterable-but-zero; 221 not
filterable. `StandardStatus` live has FOUR values only: Active 7,594 · ComingSoon 5–7 · Pending 5,593 ·
Closed 578,395. Withdrawn/Canceled/Expired/Hold/ActiveUnderContract = 0. `MlsStatus` 100% null.
`Permission` is `'IDX'` on every row (`Permission has 'Private'` = 0). Mallan office = `ListOfficeMlsId
'7041'` (35 rows; 20196 has 0) — repo constant correct.

**DOM / dates:** `DaysOnMarket`, `CumulativeDaysOnMarket`, `DaysOnMarketReplication*` — declared,
selectable, provider-suppressed for filter/orderby, null on every row measured (~13k live + 26,486
stored payloads + all live ComingSoon). `StartShowingDate` declared, RLS-listed, 0 populated.
`ActivationDate` 46,095 · `OnMarketDate` 119,561 · `OnMarketTimestamp` 265,692 ·
`StatusChangeTimestamp` 591,409 · `OriginalEntryTimestamp` 100% · `BackOnMarketDate` 4,354 ·
`DelayedMarketing*` 0. `ActivationTimestamp`, `ComingSoonDate/Timestamp` NOT on Property.
Coming Soon rows: `OriginalEntryTimestamp == StatusChangeTimestamp`. Permission enum (18):
AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo/Yes, FirmOnly, History, IDX, MemberInactive,
OfficeInactive, OfficeOnly, OfficeSuspended, Officeidxoptout, PhotoOptedOut, Private, Public,
SyndicateOptOut, VOW. RLS-listed: IDX, Private, SyndicateOptOut.

**Media (2,000,834 rows, 56 fields):** `MediaCategory` live = Photo 1,417,033 · FloorPlan 583,800
only; Video / Branded / UnbrandedVirtualTour = 0 (all RLS-listed vocabulary). `MediaType` = Jpeg,
Pdf 448,721, Gif, Png; all video formats 0. `MediaStatus` Active 100%. `ResourceName` Property +
Building 62 (orphaned). `ImageOf` unused. Descriptors carry no tour/video labels. `MediaHTML`,
`OriginalMediaUrl`, `X_MediaStream` = 0. **Video and virtual tour on this feed exist only as
`Property.VirtualTourURLBranded/Unbranded`** (13,879 / 26,372 rows; RESO definition "URL for a virtual
tour"; content is ~80% YouTube/Vimeo, ~15% Matterport — a data-quality fact, NOT a contract).
`VideosCount` (RESO: "videos or virtual tours") is NOT RLS-listed; 14,909 rows have `>0` with no URL and
no video row in any status. `PhotosCount` counts ALL Media rows incl. floorplans (RESO: "pictures or
photos"; matched Photo-only rows on 14/60).

**CustomProperty (591,642 rows ≈ 1:1 with Property, 142 fields):** `CustomFields` is a JSON string on
100% of rows carrying REBNY's NYC vocabulary — 50 keys across 3,000 rows: ElevatorsTotal,
BuildingTaxLot, AttendanceType (DoormanFullTime,…), TaxAbatementYN, SponsorUnitYN, FlipTax,
MaximumFinancingPercent, PercentOfCommonElements, CertificateOfOccupancyYN, LandmarkStatusYN,
TaxMonthlyAmount, MaxLeaseMonths, PrivateOutdoorSpaceSize, BuyerAgentRLSParticipantYN, UnitLine,
KitchenCondition, BuildingSmokeFreeYN, FlipTaxType, FurnishedListPrice, BuildingStaffType,
GuarantorsAcceptedYN, CommercialUnitsYN, BuildingRules, … No media/URL keys. **Not filterable at the
provider (PB-01). Not hydrated by Search. Not reachable by any criterion.** `AdditionalFeeYN` 100%,
`SourceFloorPlansCount` 11,313, `ThirdPartyIntegrationType` 0.

**OpenHouse (1,494 rows):** `OpenHouseDate`/`EndTime` filterable and 100% populated → open-house
search is executable via the OpenHouse set joined on `ListingKey` (not via Property).

---

## 4. PROVEN DEFECTS — the real errors. Fix these. Do not re-audit them.

| # | Defect | Evidence | Where | Status |
|---|---|---|---|---|
| 1 | `has_video` / `has_virtual_tour` = **0** on all 26,501 projection rows while **3,262** listings (883 Active) carry a tour URL in `raw_data` | DB + LIVE | `lib/search/listing-search-projection.ts:362-378` derives both from `listing_media.media_type`; neither path reads `VirtualTourURL*` | OPEN. Registry law: 147/200 agree |
| 2 | Stored media never purges: **103 surplus rows on 25 listings**; 3 dead Video/Tour rows; RLS20103876 stored 139 vs live 74 | LIVE vs DB | media sync has no reconcile/purge; Cotality says incremental sync cannot see removals | OPEN. Law: 152/200 |
| 3 | `listings.photo_count` disagrees with `PhotosCount` on **76%** of rows | LIVE vs DB | column written from resolver photo-only count; provider counts all media | OPEN. Law: 48/200 |
| 4 | **6,759** rows `status='Withdrawn'` while `raw_data.StandardStatus='Active'`; live never emits Withdrawn | DB + LIVE | local writers set Withdrawn on feed absence; cause not traced | OPEN. Hidden by the Active-only sample; all-status sample shows 60/200 diverge |
| 5 | DOM clock is local: `status_changed_at` written from `new Date()`/`now` by **9 writers**; `terminal_since` by 11; provider `StatusChangeTimestamp` (591,409 rows) fetched at `trestle-mapper.ts:90`, never mapped, dropped by keep-list. Gap median 0.34 d, **max 425 d** | CODE + LIVE | `lib/idx/sync.ts:1001`, `:778-796`, `app/api/crm/listings/[id]/status/route.ts:286`, `feed-reconcile/route.ts:430,545`, `listing-expiration:278`, `reconcile-execute.ts:128`, `reconcile-ghosts.js:250`, `recover-stale:708-723` | OPEN. Maya: existing `status_changed_at` column can hold the provider value for Cotality rows — no new column |
| 6 | Fetched and discarded (in mapper select, absent from `raw-data-keep-fields.ts`, populated live): `StatusChangeTimestamp`, `BackOnMarketDate` (DOM-reset marker), `OriginalEntryTimestamp`, `VideosCount`, `PhotosChangeTimestamp`, `DocumentsCount`, `UnparsedAddress` | LIVE + DB | `lib/compliance/raw-data-keep-fields.ts` | OPEN. (`ClosePrice`, `CloseDate`, `City`, `CountyOrParish`, `StateOrProvince`, `PreviousListPrice`, `VirtualTourURL*` ARE kept — lineage agents over-claimed) |
| 7 | D2: `computeDomTransition` fires only on `existing.status !== mapped.status` (`sync.ts:785`); UCBA §11 says DOM moves on status OR permission change. Active+Private→Active+IDX produces no transition | CODE | `lib/idx/sync.ts:785` | OPEN, latent (0 Private rows). Needs a provider timestamp that moves on permission change — HistoryTransactional inaccessible; **do not invent one** |
| 8 | Coming Soon 14-day rule computes `ActivationDate − OnMarketDate` only when both present inside a ComingSoon branch (`rls-enforcement.ts:468-491`); not proven to represent the CS duration | CODE | | OPEN. Maya: re-establish from lifecycle facts; `StartShowingDate` exists (0 populated) — do not substitute |
| 9 | MCP `mcp/trestle-fields/index.ts:36,330-333` falls back to `artifacts/metadata.xml` (dated 2026-06-04, 5 Content Patches stale) while its tool text says "always current — fetched live" (:371); `.mcp.json` runs an untracked `dist/index.js` built 2026-07-05. The d19 MCP (217 lines) has no fallback | CODE | | HELD — Maya's decision. Guard test records it as `it.todo` |
| 10 | Search engine: `provider-client.ts` no `$expand`, resources `Property|Media|OpenHouse` only; `hydrate.ts` loads Property+Media only; `provider-query.ts:86` injects `Permission has 'IDX'` unconditionally (excludes 0 rows today — latent); `crm-idx-mapper.ts:106-130` reads `raw.CustomProperty` that is never hydrated (only test fixtures supply it); `universe.ts:154` `total: rows.length` | CODE + LIVE | | OPEN. `$expand` WORKS (the repo doc claiming it is broken was wrong — a dead nested `$select` field was misattributed) |
| 11 | 20 CRM form binding defects (`public/crm/**`, HELD): 12 DEAD BINDING (`AvailableLeaseType`, `SyndicateTo`, `LivingAreaSource`, `BusinessType` — 0 RLS-listed, 0 populated live), 4 SHAPE MISMATCH (`fireplace` Yes/No radio on multi-enum `InteriorFeatures`; `FireplaceYN` exists), 4 WRONG VALUE (`CurrentUse` Healthcare/Professional; RLS-listed: MedicalDental, Office, …). Rent stabilization is Mallan-only; contract already has `LeaseType` | LIVE + CODE | validator now names each | HELD (forms). Skill defect: phantom table says `SyndicateYN → SyndicateTo` — `SyndicateTo` is never populated |
| 12 | Media pipeline hazards (lineage, CODE): `classifyTrestleMediaCategory` DEFAULTS missing category to Photo; `preferred_photo_yn` fail-to-false on 'Y'/'TRUE '/1 and is REWRITTEN from feed every set (overrides agent choice); `media_category` collapses "" to NULL then reader promotes derived type; substring matching on provider tokens; `listing_media.media_type` holds the resolver class, NOT Trestle `MediaType` (which is Jpeg/Pdf) — schema comment wrong | CODE | `lib/media/*`, `lib/idx/media-sync.ts` | OPEN |
| 13 | `computeGateColumns` treats string `"false"` as displayable (fail-open) while `gates.ts:197` rejects it — asymmetry; absent `Permission` → `providerIdxPermitted=null` → permitted; `rls_eligible` silently defaults true in the mapper (`:895`) | CODE | `lib/idx/trestle-mapper.ts:872-914` | OPEN, latent |
| 14 | `listing_search_projection.borough` derives from `CountyOrParish+City` (`inferBorough`); search DTO uses `CityRegion` — two derivations. **Registry law: they AGREE 200/200 on Active rows.** Not a defect in practice; keep both under one law | LIVE | | CLOSED-by-measurement (Active only; re-check exhaustively) |

---

## 5. CORRECTIONS TO CLAIMS MADE THIS SESSION — do not repeat

- "`VirtualTourURL*` is the only carrier of video/tour; classify by host" — WRONG. API contract for
  video/tour is Media rows (`Video`/`*VirtualTour`, RLS-listed, 0 today) AND the RESO URL fields
  (RLS-listed, populated). Both recorded as distinct facts; the display decision is Maya's.
- "PhotosCount says 19 but Media has 0 (RLS20112998)" — RETRACTED: live Media set has 19; the empty
  `$expand` was a load artifact… **then reframed again by PB-02 verify: 1 of 3 rows on a clean run had
  empty expand with `PhotosCount>0`.** The behaviour is NOT confined to load. Exact cause (stale counter
  vs unreliable expand) UNVERIFIED — measure exhaustively: for every stored key, expanded-Media count vs
  Media-set count vs `PhotosCount`.
- "Defect: `Participant Only Network` token can't match" — STALE: the set already had `"Private"`;
  the real defect was the string contract (fixed in 8f2bca20).
- "Only tests call dom-tracker" — WRONG (4 production callers). "`status_changed_at` needs a new
  column" — WRONG. "Section 1 works today" — NOT PROVEN. "Closed freezes DOM" — UCBA says resets
  (fixed).
- "`$top` max is 1000" — incomplete (300,000 key-only). "Nested `$select` works" from HTTP 200 —
  unproven then, proven by row counts later.
- "Stranded branch will be lost if the disk fails" — OVERSTATED: `live-client`, compiler, CLI,
  vocabularies are byte-identical on PUSHED `d19c03cd`; only `compile-nyc-geography.mjs`, the
  `fetch.ts` hardening, and `nyc-geography.live.json` are unique to unpushed `42c5f241`.
- "Nothing in the repo does reconciliation" — WRONG: `app/api/cron/feed-reconcile/route.ts` (669),
  `lib/idx/cursor/keyset-cursor.ts`, `watermark.ts`, `reconcile-decision.ts` exist.
- "`field-registry.ts` has zero importers" — WRONG (two test files via the barrel); not wired to runtime.
- "SystemReferences RLS-listed ⇒ REBNY uses it" — NOT proof either way (PB-08).
- `data/cotality-contract/` dirs on HEAD are dead scaffolding (untracked, empty, unreferenced).
- The lineage workflow's DISCARDED family over-claimed 7 kept fields; its verifiers were crippled
  by my 12,000-char prompt truncation — verdicts there are about scope, not substance.

---

## 6. THE STRANDED WORK

PR #618 = `fix/neon-p0-event-driven-wake-2026-08-16` @ `d19c03cd`, OPEN draft, base
`fix/neon-r2-closure-clean-2026-08-19`, 103 commits ahead of main, never merged. It has the Cotality
spine (now ported), an 876-line `field-registry.ts` ("THE CANONICAL SEARCH MAPPING AUTHORITY", wired),
`lib/search/final-universe.ts` (648, conservation of inventory), `geography.ts` (358) +
`subdivision-vocabulary.generated.ts` (818), `checkbox-criteria.ts` (621), and a guard test — but
**NO `lib/search/engine/`** (this lane's executor/universe/hydrate) and carries a permanent Property
cursor stall. Two halves of one Search. Port is file-by-file, never merge. Local-only
`fix/backend-agent-search-geography-2026-08-24` @ `42c5f241` (no upstream) holds the three unique
files above. `verify-search-live.mjs` and `registry-vs-executor-census.mjs` hardcode
`lib/search/crm-idx-filter.ts` (absent here) and crash on this lane — not ported. `field-registry.ts`
port is a MERGE: `sourceAuthority` spelling differs (`cotality` there; `cotality_rebny` here — the
rename commit `75491392` is NOT on this lane), 5 missing files, 3 incompatible, a value import of
`AMENITY_TOKENS`.

---

## 7. DECISIONS WAITING ON MAYA

1. MCP snapshot fallback — adopt the d19 live-only MCP or fix in place (held: verification authority).
2. Push `42c5f241` (three unique files).
3. Raise `DaysOnMarket` / `VideosCount` population with rlssupport@rebny.com (212-616-5270).
4. A read-only `DATABASE_URL` (or the `U` pattern of `scripts/audit/reconcile-dryrun.ts:62`) in the
   working environment so the registry stage can read ALL 26,497 rows itself instead of via 200-row
   MCP extracts. Without it the Mallan side of any law is UNVERIFIED.
5. Form fixes in `public/crm/**` (§4 #11) and the skill's `SyndicateTo` phantom entry.
6. DOM D4 storage semantics after close: `days_on_market=0`, `cumulative` retains — implemented for
   future transitions; 6,101 existing Closed rows untouched (backfill requires authorization).
7. `Participant Only` vs `Permission has 'Private'` — settled: `participant_only` is the canonical fact.

---

## 8. NEXT — and what NOT to do

**Do not:** sample; spot-check; build another framework; write a prose Cotality briefing; run agents
against the writable tree; treat a zero as "use another field"; port `d19` wholesale.

**Do, in order:**
1. Make `compile-capability-graph.mjs` EXHAUSTIVE: read every stored provider row (needs §7.4),
   batch-fetch every key live (100/request, quota-aware), run every law over the full population,
   add a reconcile section (stored keys vs live key census: ghosts / misses), add `dependsOn` so the
   four media-family failures report one root, and add the 50 NYC `CustomFields` keys as edges whose
   law is "present on live CustomProperty ∧ reachable by a Search criterion" (today: 0 reachable).
   Any `--limit` run reports UNVERIFIED.
2. Fix §4 #1 (`has_virtual_tour`/`has_video` read `VirtualTourURL*` from `raw_data`, which the
   keep-list preserves) with a failing test first — behavior change on a Search facet, so Maya says go.
3. Fix §4 #6: add `StatusChangeTimestamp`, `BackOnMarketDate`, `OriginalEntryTimestamp`,
   `PhotosChangeTimestamp` to the keep-list (no schema change; `raw_data` is JSON).
4. Fix §4 #5 for Cotality-origin rows: `status_changed_at ← StatusChangeTimestamp` in the mapper;
   Mallan-authored rows keep the local clock. Then D2 stays open until a permission timestamp exists.
5. Media reconcile/purge (§4 #2, #3) — the media half of the reconcile plane.
6. Trace §4 #4 (who writes Withdrawn on feed absence) exhaustively — not sampled.
7. Only then: engine graph awareness (`$expand=CustomProperty($select=CustomFields),Media`), the
   IDX-filter boundary, `final-universe.ts` port + wiring.

---

## 9. EVIDENCE LOCATIONS

Session scratchpad (temp, session-specific — copy anything needed into `docs/operations/evidence-*`):
`C:\Users\MAYAAL~1\AppData\Local\Temp\claude\C--Users-MayaAllan-Desktop-mallan-nyc\7a9ea54c-c890-44b7-9608-ce34650ced4d\scratchpad\`
— `property-census.json` (757 fields: type, filterable, populated, 14 navs), `subsection-census.json`
(507 fields, 7 sets), `lineage-edges.json` (361 edges), `mallan-sample.json` / `mallan-sample-allstatus.json`,
`port-verify/contract-schema-only.json` (132 MB), `port-verify/scripts/**` (d19 originals), all probe
scripts (`full-graph.mjs`, `nav-filter.mjs`, `media-*.mjs`, `dom-*.mjs`, `expand*.mjs`, `nextlink-doctrine.mjs`,
`quota-headers.mjs`, `validator-enums.mjs`, `dead-binding-verify.mjs`).
Repo: `artifacts/search-closure/<sha>/` (gitignored) holds the last closure runs incl.
`capability-graph.json` at `aefd5334`. Workflow journals under
`~/.claude/projects/C--Users-MayaAllan-Desktop-mallan-nyc/7a9ea54c-…/subagents/workflows/`
(`wf_dd33d689-418` recovery matrix, `wf_fc091ccd-12e` import closure, `wf_1672400b-714` lineage).
