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
- **Transitive (declared):** every `mapRESOToInternal` caller — detail Trestle-direct path +
  search Trestle-merge branch; inert on cron writes (`useExpandMedia=false` → `Media` absent →
  media `[]`); bites only where Media is present inline + the agent live-batch path.
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
| 4 | harness | B0 chain | (filled at commit) |
| 5 | gates · B2 LIVE proof (M3 requirement) | §5/§6 | before/after probe of `/api/agents/[slug]/listings` media[0] | (pending) |

## 5. Gate results
(pending)

## 6. Sign-offs
(pending)
