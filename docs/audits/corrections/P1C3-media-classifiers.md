# Correction Trace Record — `P1C3` floorplan / virtual-tour classifiers (ledger M3)

> **Status: IN-PR.** Phase-1 Correction 3 (Maya standing queue, 2026-06-11). Settles ledger row
> **M3** on merge + live proof. **Code fix only — NO schema, NO DB writes, NO R2 ops, NO
> cron/env, NO public/crm frontend.**

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident doc read:** 2026-06-11.
2. **Chronic root cause addressed:** the JSON/table **classification-mismatch** species of the
   layer-mismatch class (deep-review I4 / divergence mechanism #4; ledger **M3**): two live
   render-path sites still carried the with-space `includes('floor plan')` bug the 2026-05-01 fix
   removed from sync.ts — Trestle serializes enum MEMBER NAMES (`FloorPlan`,
   `UnbrandedVirtualTour`; verified `artifacts/metadata.xml:11545-11605`, unchanged since the
   plan's verification — §J.4 satisfied), so floorplans/tours classified as `Photo` and could
   become heroes / leak onto agent cards.
3. **Remaining OPEN:** Corrections 5/6 (incl. hard ghost-import item) · Lane-D split · CI3
   removal · crm:-upload advisory · W13 · held migrations · §4 RC6 · ALL data cleaning · OQ-1.
4. **Cannot reintroduce:** stomping — zero writes to any media layer (read-path classification
   only) · cursor deadlock — sync/cursor untouched · retry purgatory — untouched · layer
   mismatch — this CLOSES divergence mechanism #4 (the two sites now agree with the canonical
   resolver's classifier).
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed.

## 1. Defect — the BEFORE
- `lib/idx/mapping.ts:331-337`: `cat.includes('floor plan')` never matches `"floorplan"`;
  `cat.includes('virtual tour')` never matches `"unbrandedvirtualtour"` → both → `'Photo'`.
- `app/api/agents/[slug]/listings/route.ts:335-336`: same with-space skip-filter (floorplans NOT
  skipped) + `:341` hard-coded `mediaType:'Photo'` for every kept record.

## 2. Pre-registered blast radius
- **WILL touch:** `lib/idx/mapping.ts` (media block only: classifier swap; ShortDescription
  heuristic + preferred/-1 sentinel + photos-first sort retained byte-identical) ·
  `app/api/agents/[slug]/listings/route.ts` (batchFetchPhotos loop → helper call) · new
  `lib/idx/agent-card-media.ts` (pure helper; route files cannot export helpers) · new
  `lib/idx/__tests__/media-classification-p1c3.test.ts` · this Trace Record.
- **Transitive (declared; tristle-completed caller set):** every `mapCOTALITYToInternal` caller —
  `app/api/listings/route.ts:813` (search Trestle-merge) · `app/listing/[...slug]/page.tsx:234`
  (detail) · `app/api/listings/[id]/route.ts` (detail API) · the agents route. All read/render
  paths — NO cron writer calls this mapper (idx-sync uses `mapTrestleToPrisma`), so the change is
  fully inert on writes; `cacheListingPhotosToR2` is dormant (zero callers).
  **Declared behavior change:** Videos/VirtualTours no longer masquerade as agent-card photos.
- **MUST NOT touch:** `classifyTrestleMediaCategory` itself · `buildMediaR2Key` · the resolver ·
  TABLE/JSON writers · gates/status logic · schema · cron/env.

## 3. Compliance pre-read (§D)
COMPLIANCE-CANONICAL-INDEX §8 (Media) re-read. Classification-only; no display gate, DTO field,
or status change. Floorplans-not-hero matches the canonical resolver's hero rules.

## 4. Step log
| # | Step | Artifact | Result |
|---|---|---|---|
| 1 | RED | `media-classification-p1c3.test.ts` | RED: 2 failed on mapping.ts (FloorPlan→Photo-and-first; VirtualTour→Photo); helper cases RED-by-absent-module | ✅ RED |
| 2 | fix: classifier swap + helper extraction + route wiring | 3 files | diff | ✅ |
| 3 | GREEN + mapping regression | jest | new 7/7 · with `c1-classification` + `c1-mapping-idx-plus` = **26/26** | ✅ GREEN |
| 4 | harness | B0 chain | type-check 0 · test:runtime **2112/2112** · ucba 46/46 0 regr · rls 0 err (1 pre-existing warning — correct: rentals can't be ComingSoon) · compliance-check 92/0 · idx 1 known critical (CI3, "delta +0" per the validator's own run history) | ✅ |
| 5 | gates | §5/§6 | tristle PASS · security PASS (0 findings) · rebny-search PASS (13/13 categories) | ✅ |
| 6 | B2 LIVE proof (M3 settlement requirement) | before/after capture | production BEFORE snapshot captured 2026-06-11 (no FloorPlan subject in the current live batch); **AFTER capture pending-until-subject — per tristle, ANY displayable listing with a FloorPlan/VirtualTour Media record on the Trestle-direct path qualifies** | ⏳ M3 stays IN-PR post-merge |

## 5. Gate results
| Gate | Result |
|---|---|
| B2 (fix claim) | behavioral RED→GREEN 7/7 + regression 26/26 — satisfies §F for the FIX; the M3 LEDGER settlement additionally requires the live capture (ledger header: "live proof attached") |
| C1/C2 micro/macro | PASS (5 files, radius matched) |
| security-agent | **PASS, 0 findings** — public route's token/query untouched context; helper sees no request-derived data; output strictly narrowed; fail-safe in both directions |
| tristle | **PASS, merge permitted; M3 must NOT settle on merge** — metadata enum verified at source (§J.4); behavior change matches the established card policy (`listing-card-media.ts REJECTED_MEDIA_TYPES`) instead of diverging; caller set completed (4 callers, all read paths, zero writers) |
| rebny-search auditor | **PASS, 13/13 categories** — picklist-CORRECTING fix; `photosCount` becomes accurate; search ranking/composition untouched |

## 5b. Post-merge Codex amendment (2026-06-11, branch fix/p1c3-card-batch-headroom)
Codex on #389 (accepted): classification moved client-side, but the Media batch `$top` stayed at
`needsPhotos.length * 4` — a mixed page could fill with discarded non-photo rows and starve
later-sorted Photos (placeholder on cards despite valid Photos existing). Fix: ×10 headroom
(single page, bounded). The cleaner server-side `MediaCategory eq 'Photo'` $filter is **Class B —
enum filterability UNPROVEN on this feed** (the InternetEntireListingDisplayYN lesson) — added as
**Q3 to the operator probe** (`scripts/__c6-feed-reconcile-probe.mjs`); adopt it in a follow-up
only on a proven 200. Structural lock pins ×10 AND the absence of the unproven filter.
Blast radius: the agents route line + the p1c3 test + this record.
**Amendment gates (2026-06-11, `fa4a2bff`):** tristle PASS (query strings byte-identical except
$top; Class-B discipline verified real — probe Q3 exists) · rebny-search PASS (single caller;
bounded ≤1000/single page; ×10 covers Order-collisions ×4 could not). Non-blocking F1 (lock-regex
same-line evasion) + F2 (confirm Media page cap in Q3) recorded for the Q3 follow-up.

## 6. Sign-offs
- **micro/macro PASS · security PASS · tristle PASS · rebny-search PASS** (2026-06-11, `8abc9597`).
- **Codex:** on PR open. · **Maya merge:** standing queue approval; merges on green CI.
- **M3 settlement condition (tristle ruling, binding):** ledger row M3 flips to SETTLED only when
  the live before/after capture is attached — first qualifying subject wins (agent batch OR any
  Trestle-direct detail render with FloorPlan media).
- **Queued follow-ups surfaced by the gates:** third inline classifier at `lib/idx/fetch.ts:534-541`
  (works, but consolidation candidate — divergence species this PR closes) · classifier's
  unknown-members→Photo default (pre-existing, future hardening candidate) · smoke-baseline drift
  + CI3 already tracked.
