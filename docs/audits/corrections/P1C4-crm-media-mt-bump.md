# Correction Trace Record — `P1C4` CRM media MT-bump fix (scoped stop-bump)

> **Status: IN-PR.** Phase-1 media loop-closure Correction 4 (Maya GO 2026-06-11 "start
> correction 4"; standing 11-step queue). **Code fix only — NO schema, NO DB writes at fix time,
> NO R2 ops, NO backfill, NO cron/env, NO public/crm frontend.**

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident doc read:** 2026-06-11.
2. **Chronic root cause addressed:** the **§4 RC1 cursor-deadlock/skip CLASS via a side door**
   (deep-review loop **L8**): CRM media actions bumped `modification_timestamp` with local NOW on
   Trestle-synced rows, and the idx-sync cursor is `MAX(modification_timestamp) WHERE
   last_synced_from_trestle IS NOT NULL` — the next incremental filter (`MT gt SINCE`) then SKIPS
   every unprocessed feed record older than the bump (the PR-S.6/S.7 hazard reintroduced).
   Correction-series P1C4; no §4 numbering collision.
3. **Remaining OPEN after this PR:** Phase-1 Corrections 3 (floorplan), 5 (ops-health metric +
   ghost logging), 6 (feed-reconcile + HARD ghost-import item) · Lane-D split · CI3 removal ·
   crm:-upload ownership advisory · W13 legacy photos-route retirement (its `:85` bump is part of
   that separate item — NOT touched here, no creep) · §4 RC5 held migrations · §4 RC6 · ALL data
   cleaning · OQ-1.
4. **Cannot reintroduce the four canonical regressions:**
   - **`Listing.media` stomping:** zero media writes in the diff (MT-only logic).
   - **cursor deadlock/skip:** this PR REMOVES a cursor-skip vector; `lib/idx/sync.ts` /
     `getLastSyncTimestamp` untouched; companion cursor tests unchanged-green.
   - **retry purgatory:** no retry logic touched.
   - **JSON/table/R2 mismatch:** no media-layer writes; `listing_media.updated_at` remains the
     media clock for synced rows.
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed.

## 1. Defect — the BEFORE
Four bump sites wrote local NOW into MT unconditionally: upload route `:274-277`, media
`[mediaId]` DELETE `:74-77` + PATCH set-as-main `:158-161`, media-order `:97-100`. Any CRM media
action on an IDX/agent-history listing could jump the idx-sync cursor past unprocessed feed
records. **Decision (plan OQ-2, Maya "prefer stop-bumping", NO schema): scoped stop-bump** —
bump only when `last_synced_from_trestle IS NULL` (CRM-only exclusives keep sitemap
`lastModified` / disclaimer `lastUpdated` / portal-ordering behavior). Declared behavior delta:
a Trestle listing with a CRM media edit no longer floats in MT-ordered lists — correct, MT is
feed truth. The "ISR sees the change" comment was inert (detail pages are time-based ISR).

## 2. Pre-registered blast radius
- **WILL touch:** `lib/media/crm-media.ts` (additive pure `crmListingTouchData`) ·
  `app/api/crm/listings/[id]/media/upload/route.ts` ·
  `app/api/crm/listings/[id]/media/[mediaId]/route.ts` (both verbs + `resolveOwnedListing`
  select) · `app/api/crm/listings/[id]/media-order/route.ts` (select + touch) · new
  `tests/runtime/crm-media-mt-bump.test.ts` · this Trace Record.
- **MUST NOT touch:** idx sync module / getLastSyncTimestamp · schema · the legacy photos route
  (W13 retirement item) · CRM frontend · cron/env.

## 3. Compliance pre-read (§D)
No display gate / status / DTO / field-mapping change. MT semantics for the synced cohort become
MORE feed-true (fail-closed direction: local actions can no longer perturb feed bookkeeping).

## 4. Step log
| # | Step | Artifact | Result |
|---|---|---|---|
| 1 | RED (proven via stash of source fix; test kept) | `crm-media-mt-bump.test.ts` | RED: 4 failed (helper absent; reorder + delete bumped on synced; upload unconditional) / 2 passed (preserved-behavior cases, correct on main) | ✅ RED |
| 2 | fix: pure helper + 4 sites through it + selects widened | 4 files | diff | ✅ |
| 3 | GREEN | jest | **6/6**; companion cursor guards unchanged-green (verified in harness) | ✅ GREEN |
| 4 | harness | B0 chain | type-check 0 · test:runtime **2111/2111** (2112 after the fail-closed case) · ucba 46/46 0 regr · rls 0 err (1 pre-existing warning) · compliance-check 92/0 · idx 1 known critical (CI3, unchanged) | ✅ |
| 5 | gate:micro/macro · tristle · security-agent | — | all PASS, §5/§6 | ✅ |
| 6 | tristle observation hardened | helper + test | `undefined` (caller forgot the select) now FAIL-CLOSED → no touch (a wrong skip costs one benign sitemap stamp; a wrong bump can skip feed records); new unit case | ✅ |

## 5. Gate results
| Gate | Result |
|---|---|
| B2 proof | RED via source-stash (4 failed / 2 preserved-behavior passes) → GREEN 7/7 (incl. the post-gate fail-closed case); companion cursor suites 26/26 unchanged-green |
| C1 gate:micro / C2 gate:macro | PASS (6 files; declared radius matched exactly) |
| security-agent | **PASS, 0 findings at any severity** — auth chains untouched, column never serialized into any response, the touch gates nothing security-relevant (audit events fire unconditionally); characterized the fix as closing a silent feed-data-loss vector |
| tristle | **PASS** — no gate/status/DTO/field-map change; behavior delta is a compliance IMPROVEMENT (skill §9.4: "last updated **from the MLS feed**" — the old bump overstated feed freshness on IDXDisclaimer + sitemap); CRM-only cohort preserved; W13 no-creep verified; preamble complete; smoke 211/11 pre-existing on main (separate Class-E item) |

## 6. Sign-offs
- **gate:micro PASS · gate:macro PASS · security-agent PASS · tristle PASS** (2026-06-11, `559e2acb` + the fail-closed hardening commit).
- **Tristle non-blocking observations:** #1 helper-undefined direction — HARDENED in this PR
  (fail-closed, unit-tested) rather than JSDoc-only; #2 trace-record sections — filled here;
  #3 smoke-baseline drift — pre-existing, tracked separately (Class E, CRM frontend HELD).
- **Codex:** on PR open. · **Maya merge:** standing queue approval (Correction 4 GO,
  2026-06-11); merges on green CI.
