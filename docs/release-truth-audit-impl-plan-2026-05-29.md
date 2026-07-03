# Release-Truth Reporting — Implementation PR Plan & TDD Skeleton

**Status:** PLAN / TDD SKELETON · REPORT ONLY · **Date:** 2026-05-29
**Governs:** the implementation PR for `docs/release-truth-audit-improvement-2026-05-29.md`.
**DO NOT IMPLEMENT until Maya approves.** This document is the test-first plan only — no product code, no workflow/script edits yet.

## Scope guardrails (hard)
**In scope:** Release-Truth *reporting* only — the workflow YAML, the aggregator's failure-explanation output, and tests/fixtures.
**Explicitly OUT (must not be touched by the impl PR):** product code; the geo fix (`scripts/build-rls-geojson.js`); media; sales form; migrations; Neon/Vercel/env. PR comments stay disabled. No re-enabling without approval.

---

## 1. Exact files likely touched

### Modified (3)
| File | Change | Notes |
|---|---|---|
| `.github/workflows/release-truth.yml` | (a) Gate `Comment on PR` step `if: ${{ false }}` (preserve step body for one-line re-enable). (b) Add `Upload release-truth artifact` step (`actions/upload-artifact@v4`, `if: always()`, path = `release-truth.json` + `release-truth.md`). (c) Enrich `Job summary` to render the per-failure explanation. (d) Shorten/clarify commit-status description. | No new permissions. Comment step **stays in the file**, only disabled. |
| `scripts/release-truth-check.js` | Replace the bare `reasons.push(\`workflow blocking failures: ${N}\`)` (lines ~196-198) with: keep a one-line rollup **plus** attach structured `layers.workflows.failures[]` (9-field findings) sourced from the new explainer. Write a sibling `release-truth.md` human render. Import the new module. | Aggregator wiring only — no verdict-logic change beyond surfacing findings. |
| `package.json` | (optional) add `release:truth:explain` convenience script + ensure the new test file is picked up by the jest project that covers `scripts/__tests__`. | Only if the existing jest project glob doesn't already include the new test path. |

### New — reporting modules (2, pure + thin adapter)
| File | Responsibility | Testable how |
|---|---|---|
| `scripts/release-truth/ci-failure-explainer.js` | **Pure functions, no network:** `classifyCause()`, `computeFreshness()`, `findRootCauseStep()`, `decideAction()`, `buildFinding()`, `renderFindingMarkdown()`, `renderShortStatus()`, plus the `EXTERNAL_INFRA_SIGNATURES` + `EXTERNAL_HOSTS` tables. | Unit tests with in-memory fixtures (no `gh`). |
| `scripts/release-truth/gh-runs-adapter.js` | **Thin live adapter:** `fetchPrCiFindings(prNum, { gh })` → calls `gh run list` / `gh run view --json jobs,attempt` / `gh run view --log` / `gh pr view --json files` / branch-protection, maps raw output into the explainer's input shape, returns `findings[]`. The `gh` fn is **injected** so the adapter is mockable. | Integration test with a mocked `gh` returning fixture JSON. |

> Keeping the pure logic separate from the `gh`-calling adapter is the whole testability trick: every classification rule is unit-tested deterministically from fixtures; the adapter just shuttles data.

### New — tests (2)
| File | Covers |
|---|---|
| `scripts/__tests__/release-truth-workflow-structure.test.js` | YAML structure: comment disabled, artifact upload exists, summary renders, no active `gh pr comment`. |
| `scripts/__tests__/release-truth-ci-explainer.test.js` | Pure-logic unit tests + the two fixture scenarios (PR #277 external, geo regression) + adapter-with-mocked-gh. |

### New — fixtures (dir)
`scripts/__tests__/fixtures/release-truth/`
- `pr277-econnreset/` → `pr-files.json`, `run-list.json`, `run-jobs.json`, `build-step-log.txt` (contains `read ECONNRESET`), `failed-step-log.txt` (validator exit 1), `branch-protection.json`.
- `geo-regression/` → `pr-files.json` (touches `public/geo/**` or `data/rls/**`), `run-list.json` (fail, **rerun also failed / identical**), `run-jobs.json`, `failed-step-log.txt`, `branch-protection.json`.
- `unknown-failure/` → a failure with no transient signature and an untouched-but-unclassifiable surface → must stay `indeterminate`.

---

## 2. Test names (jest `describe`/`test`)

### `release-truth-workflow-structure.test.js`
```
describe('release-truth.yml — reporting posture')
  test('Comment on PR step exists but is gated if: ${{ false }} (preserved for re-enable)')
  test('no enabled step runs `gh pr comment` (comment step disabled)')
  test('Upload artifact step exists with uses actions/upload-artifact@v4 and if: always()')
  test('artifact path includes release-truth.json (full detail)')
  test('Job summary step exists and is if: always()')
  test('commit-status description is enriched (not the bare "workflow blocking failures")')
```

### `release-truth-ci-explainer.test.js`
```
describe('ci-failure-explainer — schema')
  test('buildFinding emits all 9 fields: workflow, job, failingStep, rootCauseStep, freshness, rerunPassed, gating, cause, exactReason, recommendedAction')
  test('finding also carries runId, runUrl, attempt, confidence')
  test('missing any required field throws (writer rejects incomplete finding)')

describe('ci-failure-explainer — freshness & rerun')
  test('attempt-1 fail + attempt-2 success → freshness="stale", rerunPassed=true')
  test('single failing attempt, no newer run → freshness="current", rerunPassed=false')

describe('ci-failure-explainer — root-cause step')
  test('findRootCauseStep returns the earliest step whose log matches a transient signature even if it exited 0')
  test('PR277 fixture: failingStep="Geo: Run 12-check validator", rootCauseStep="Geo: Build GeoJSON from canonical list"')

describe('ci-failure-explainer — cause classification')
  test('ECONNRESET from data.cityofnewyork.us + PR touched no geo files → cause="external_infra"')
  test('deterministic fail (identical on rerun) + PR touched public/geo → cause="pr"')
  test('no transient signature AND cannot map surface → cause="indeterminate" (FAIL-CLOSED)')
  test('transient signature present but PR ALSO touched the surface → cause="indeterminate" (not auto-excused)')

describe('ci-failure-explainer — recommendedAction decision table')
  test('stale + rerunPassed + external_infra → "ignore_stale_advisory"')
  test('current + !rerunPassed + external_infra (first occurrence) → "rerun"')
  test('current + persistent external_infra (>=N reruns failed) → "separate_infra_pr"')
  test('current + pr + required → "fix_pr"')
  test('indeterminate + required → "human review" (never auto-excused)')

describe('ci-failure-explainer — gating')
  test('gating is set explicitly from branch-protection required-status-checks (required vs advisory)')
  test('gating is never omitted/blank')

describe('ci-failure-explainer — human render (the required message)')
  test('PR277 render contains "CRM Validation / geo-validate"')
  test('PR277 render contains the verbatim exactReason "read ECONNRESET"')
  test('PR277 render states the rerun passed')
  test('PR277 render states no PR files touched geo data')
  test('PR277 render concludes "not a product regression"')
  test('render never emits a bare "workflow blocking failures: N" without an accompanying explanation')

describe('release-truth-check integration (mocked gh)')
  test('PR #277 fixture → layers.workflows.failures[0] matches the external_infra finding')
  test('geo-regression fixture → finding cause is "pr" (or indeterminate), recommendedAction "fix_pr", NOT external')
  test('reasons[] still has a one-line rollup AND layers.workflows.failures[] has full detail')
```

### Mapping to the user's "Tests required" (8)
1. *no gh pr comment active* → `no enabled step runs gh pr comment` + `Comment on PR ... if: ${{ false }}`.
2. *artifact upload exists* → `Upload artifact step exists ...`.
3. *step summary exists* → `Job summary step exists ...`.
4. *vague "workflow blocking failures: N" not emitted alone* → `render never emits a bare ... without an accompanying explanation` + `reasons[] one-line rollup AND failures[] full detail`.
5. *external ECONNRESET rerun-passed gets clear explanation* → the entire `human render` group + `cause="external_infra"`.
6. *unknown failure stays indeterminate* → `cause="indeterminate" (FAIL-CLOSED)`.
7. *required vs advisory explicit* → the `gating` group.
8. *(real regression)* → `geo-regression fixture → cause "pr"/indeterminate, NOT external`.

---

## 3. Expected fixtures (shape)

### `pr277-econnreset/`
- `pr-files.json` → `[{ "path": "app/api/buildings/search/route.ts" }, { "path": "public/crm/SALE-FORM-REDESIGN.html" }, { "path": "tests/runtime/cotality-building-autopopulate.test.ts" }]` (no geo/rls).
- `run-list.json` → one run `26660570016`, workflow `CRM Validation`, `attempt: 2`, latest `conclusion: success`.
- `run-jobs.json` → attempt-1 job `geo-validate` `conclusion: failure`; attempt-2 all success.
- `build-step-log.txt` → includes the verbatim lines: `Fetching NTA 2020 boundaries from NYC Open Data...`, `WARN: Could not fetch NTA data (read ECONNRESET) — using patches only`, `WARNING: 627 canonical neighborhoods have no polygon.`
- `failed-step-log.txt` → validator output `[FAIL] 3. Canonical ↔ GeoJSON mismatch: 344 missing`, `[FAIL] 13. ... Upper M`, `Exit 1 — 2 strict failures.`
- `branch-protection.json` → required-status-checks list (set whether `CRM Validation` is required; the test only asserts `gating` is explicit).
- **Expected finding:** `cause=external_infra`, `freshness=stale`, `rerunPassed=true`, `recommendedAction=ignore_stale_advisory`, render concludes "not a product regression".

### `geo-regression/`
- `pr-files.json` → includes `public/geo/rls-neighborhoods.geojson` (or `data/rls/...`) — PR **did** touch geo.
- `run-list.json` / `run-jobs.json` → geo-validate fails, and the rerun (attempt 2) **also fails identically** (no transient signature in logs).
- `failed-step-log.txt` → validator FAIL with **no** `ECONNRESET`/network line.
- **Expected finding:** `cause=pr` (deterministic + PR touched geo) → if any ambiguity, `indeterminate`; `recommendedAction=fix_pr`; **must not** be classified `external_infra`.

### `unknown-failure/`
- A failing step with a generic non-zero exit, no transient signature, surface not mappable to PR files.
- **Expected finding:** `cause=indeterminate`, `recommendedAction` routes to human review; never `external_infra`.

---

## 4. Implementation steps (strict TDD order)

1. **Write fixtures** (`scripts/__tests__/fixtures/release-truth/...`) from the verbatim PR #277 evidence in this repo + a synthetic geo-regression + unknown case.
2. **Write `release-truth-ci-explainer.test.js` RED** — all the §2 unit tests against the not-yet-existing pure module.
3. **Implement `scripts/release-truth/ci-failure-explainer.js`** until green — pure functions only:
   - `EXTERNAL_INFRA_SIGNATURES` (`/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i`, 5xx/429), `EXTERNAL_HOSTS` (`data.cityofnewyork.us`, npm, GitHub API, Vercel/Neon platform).
   - `classifyCause({ logs, prFiles, surfaceMap, rerunPassed })` with the fail-closed `indeterminate` branch.
   - `computeFreshness`, `findRootCauseStep`, `decideAction` (decision table), `buildFinding` (9 fields + traceability, throws on missing), `renderFindingMarkdown`/`renderShortStatus` (the required sentence).
4. **Write `release-truth-workflow-structure.test.js` RED** — assert the disabled comment, artifact upload, summary.
5. **Edit `.github/workflows/release-truth.yml`** until green — disable comment (`if: ${{ false }}`), add artifact upload (`if: always()`), enrich summary + status.
6. **Write the integration test RED** (mocked `gh`) for `gh-runs-adapter.js` + `release-truth-check.js` wiring.
7. **Implement `gh-runs-adapter.js` + wire into `release-truth-check.js`** until green — replace the bare reason with the rollup + `layers.workflows.failures[]`; write `release-truth.json` + `release-truth.md`.
8. **Self-check:** run `node scripts/release-truth-check.js --pr 277 --json` locally (read-only) and confirm the rendered explanation matches the required message.
9. **Update** `docs/release-truth-audit-improvement-2026-05-29.md` "current state" → "implemented" with the run/commit evidence.

---

## 5. Merge gates

- All new jest tests green (explainer unit + workflow-structure + integration).
- `npm run release:truth` (and `:json`) run clean locally; `release-truth.json` artifact contains `layers.workflows.failures[]` with all 9 fields.
- Workflow-structure test proves: comment step `if: ${{ false }}`, artifact `if: always()`, no enabled `gh pr comment`.
- Project gates (CLAUDE.md §G) green even though no product paths change: `npm run type-check`, `npm run compliance-check`, `npm run ucba:audit` (0 REGRESSIONS), `npm run rls:validate`. `crm:test` not required (no `public/crm/**` change).
- CI `pr-check.yml` green; no admin bypass.
- Diff touches **only**: `release-truth.yml`, `release-truth-check.js`, `scripts/release-truth/*`, `scripts/__tests__/release-truth-*`, fixtures, `package.json` (test wiring), and the doc. **Zero** product/geo/media/form/migration/Neon/Vercel/env files (reviewer + the structure test both enforce this).

---

## 6. Out of scope (explicit)
- The geo fix (retry/cache/hard-fail in `scripts/build-rls-geojson.js`) — **separate infrastructure PR**.
- Re-enabling PR comments — needs explicit approval (the step is preserved for a one-line flip).
- Any product/Neon/Vercel/env change.

**Awaiting approval before any code is written.**
