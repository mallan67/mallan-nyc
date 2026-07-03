# Release Truth Audit Improvement — Workflow Failures Must Be Explained, Not Counted

**Status:** SPEC / REPORT ONLY · **Date:** 2026-05-29 · **Author:** Claude Code under Maya direction
**Companion spec:** `docs/sentinel-l-improvement-audit-2026-05-29.md` (same philosophy: explain the failure, not the match; artifact + Step Summary; comments disabled).
**Hard scope:** **No product code fixes** in the Release-Truth improvement PR. Only the Release-Truth workflow + aggregator/reporting scripts + their tests may change.

> No code was changed to produce this document. It is the design contract for the next Release-Truth iteration. Every claim below is proof-grounded against the live repo + GitHub on 2026-05-29.

---

## 0. Current state (grounded)

- **Workflow:** `.github/workflows/release-truth.yml` — runs `scripts/release-truth-check.js` (the aggregator), which calls layer validators (UCBA, workflow-completeness, migration, deploy/release-status, IDX, live-site, PR-claim) and produces a single `verdict` + `reasons[]` + `layers{}` JSON.
- **The exact problem string** is produced at `scripts/release-truth-check.js:196-198`:
  ```js
  if ((layers.workflows?.blocking_failures || 0) > 0) {
    reasons.push(`workflow blocking failures: ${layers.workflows.blocking_failures}`);
  }
  ```
  → the reviewer sees **`workflow blocking failures: 1`** with no workflow name, job, step, cause, freshness, rerun status, required/advisory class, or recommended action.
- **Output channels today:**
  - Commit status (on push) — `release-truth` context with the verdict.
  - **PR comment (ACTIVE)** — `release-truth.yml:107-129` runs `gh pr comment` on `pull_request: [ready_for_review]`. ⚠️ This conflicts with the "keep PR comments disabled" requirement.
  - Job Summary (Step Summary) — verdict + reasons + `layers` JSON.
  - **No artifact upload** — there is no `actions/upload-artifact` step.

### Gap
The aggregator reports **counts and verdicts**, not **explanations**. "workflow blocking failures: 1" cannot tell a reviewer whether the merge is actually unsafe or whether a flaky external fetch tripped once and a rerun already cleared it. That is precisely the PR #277 case (below).

---

## 1. The 9-field workflow-failure explanation schema (mandatory)

Every workflow/CI failure the Release-Truth aggregator reports MUST be emitted as a structured finding with all 9 fields (in `release-truth.json` under `layers.workflows.failures[]` and rendered in the Step Summary). The bare `"workflow blocking failures: N"` string stays only as a one-line rollup.

| # | Field (JSON key) | Meaning | How it is sourced (read-only) |
|---|---|---|---|
| 1 | `workflow` | Which workflow failed. | GitHub check-run / `gh run list` → workflow name (e.g. `CRM Validation`). |
| 2 | `job` | Which job failed. | `gh run view <id> --json jobs` → job with `conclusion=failure`. |
| 3 | `step` | Which exact step failed (the step that exited non-zero) **and** the root-cause step if different. | `gh run view <id> --log-failed` (failing step) + full log scan for an earlier step that swallowed an error (see PR #277 — the failing step is the *validator*, the root cause is an earlier *build* step that caught the fetch error). |
| 4 | `freshness` | **current** or **stale**. Stale = a newer attempt/commit superseded this result. | Compare the failing run's `attempt`/`headSha`/`created` against the latest attempt for the same workflow on the PR head. |
| 5 | `rerunPassed` | Did a later run/attempt of the same workflow pass? `true`/`false`/`n_a`. | `gh run view <id> --json attempt` + `gh run list` for the same workflow/head — latest conclusion. |
| 6 | `gating` | **required** or **advisory**. | Branch-protection required-status-checks for the base branch (`gh api repos/:o/:r/branches/main/protection`); Release-Truth itself is advisory (workflow header). |
| 7 | `cause` | **pr** or **external_infra** (or `indeterminate`). | Compare PR changed files (`gh pr view --json files`) to the failing surface; classify the error host/string (see §3 infra patterns). |
| 8 | `exactReason` | The exact failure reason, verbatim. | The matched log line(s) — e.g. `NYC Open Data fetch: read ECONNRESET`. Never paraphrase to "something went wrong". |
| 9 | `recommendedAction` | One of: `rerun` · `fix_pr` · `separate_infra_pr` · `ignore_stale_advisory`. | Derived from fields 4–8 (decision table §4). |

Supporting fields (not in the 9 but required for traceability): `runId`, `runUrl`, `attempt`, `headSha`, `confidence{level,reason}`.

---

## 2. PR #277 — the worked example (fully proof-grounded)

This is the real, verified case — not a template.

```json
{
  "workflow": "CRM Validation",
  "job": "geo-validate",
  "step": "Geo: Run 12-check validator (validate-rls-geo.js) — exit 1; ROOT CAUSE in earlier step 'Geo: Build GeoJSON from canonical list' (build-rls-geojson.js:305-307) which caught the fetch error and degraded to patches-only",
  "freshness": "stale",
  "rerunPassed": true,
  "gating": "advisory-or-required (read from branch protection; in practice it went red then a rerun cleared it)",
  "cause": "external_infra",
  "exactReason": "NYC Open Data fetch failed: 'WARN: Could not fetch NTA data (read ECONNRESET) — using patches only' → 'WARNING: 627 canonical neighborhoods have no polygon' → validator check 3 'Canonical ↔ GeoJSON mismatch: 344 missing' + check 13 'Upper M' → 'Exit 1 — 2 strict failures'",
  "recommendedAction": "ignore_stale_advisory",
  "runId": "26660570016",
  "runUrl": "https://github.com/mallan67/mallan-nyc/actions/runs/26660570016",
  "attempt": 1,
  "headSha": "81bcb8b8",
  "confidence": { "level": "high", "reason": "Attempt-1 log shows the verbatim 'read ECONNRESET' from data.cityofnewyork.us; attempt-2 rerun (no code change) is all-green; PR #277 changed only buildings-search route + sale form + a test — zero geo/rls/data files." }
}
```

**Human-readable rendering the reviewer should see (instead of `workflow blocking failures: 1`):**
> **CRM Validation / geo-validate** failed on the first run because the **NYC Open Data fetch returned `read ECONNRESET`** (`data.cityofnewyork.us` NTA boundaries). The build script caught it and degraded to patches-only, so the downstream validator reported "344 missing" + "Upper M". **The rerun (attempt 2) passed with no code change.** PR #277 touched no geo/RLS data files. → **External flaky fetch, not a product regression. Treat as stale advisory; no PR fix needed.** (Optional hardening — retry/cache the NYC Open Data fetch — is a *separate infrastructure PR*, not a product fix here.)

### Why the step field needs root-cause, not just "which step exited 1"
The step that exited 1 was the **validator**. But the validator only failed because an **earlier** step (`build-rls-geojson.js:305-307`) **caught** the `ECONNRESET` and continued with a degraded GeoJSON. A naive "which step failed" report blames the validator (looks like a geo-data bug); the truthful report names the swallowed upstream fetch. Field 3 must capture both.

---

## 3. Cause classification — `pr` vs `external_infra`

`cause=external_infra` when the failure matches a known external/transient signature AND the PR's changed files don't touch the failing surface. `cause=pr` when the failure is deterministic and the PR touched the relevant files.

**External-infra signatures (transient — favor `rerun`/`ignore_stale_advisory`):**
- Network: `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, `socket hang up`, `503`/`429` from a third-party host.
- Known external hosts in this repo: `data.cityofnewyork.us` (NYC Open Data / Socrata — used by `scripts/build-rls-geojson.js:299`), `api.cotality.com` (feed; though feed flakiness on a build is rarer), npm registry, GitHub API rate limits.
- Vercel/Neon platform: deployment-check stalls, "Neon branching: Branch limit exceeded" (see `docs/neon-vercel-preview-alias-incident-closure-2026-05-28.md`).
- Runner: image/tool provisioning, `npm ci` registry blips.

**PR-caused signatures (deterministic — favor `fix_pr`):**
- A failing run that **fails identically on rerun** (no transient signature).
- The PR's changed files include the failing surface (e.g. a test file the PR edited, a route the PR changed).
- Type-check/lint/compile errors, assertion failures referencing changed code.

**Cross-check rule:** if a transient signature is present **and** a rerun passed **and** the PR didn't touch the surface → `external_infra`. If any one of those is false, do not auto-classify as infra; mark `indeterminate` and require human read (fail-closed — don't excuse a real regression as "flaky").

---

## 4. `recommendedAction` decision table

| freshness | rerunPassed | cause | gating | → recommendedAction |
|---|---|---|---|---|
| stale | true | external_infra | advisory | `ignore_stale_advisory` |
| stale | true | external_infra | required | `ignore_stale_advisory` (note: required check is already green via rerun) |
| current | false | external_infra | any | `rerun` (then re-evaluate; if it keeps failing → `separate_infra_pr`) |
| current | false | external_infra (persistent, e.g. host down >N reruns) | any | `separate_infra_pr` (harden retry/cache/timeout) |
| current | false | pr | required | `fix_pr` (blocking) |
| current | false | pr | advisory | `fix_pr` (recommended, non-blocking) |
| any | false | indeterminate | required | **human review** — do not auto-classify |

`separate_infra_pr` for the PR #277 class would be: add retry-with-backoff + a committed cache fallback + a hard-fail (instead of silent patches-only degrade) to `scripts/build-rls-geojson.js`. **That is an infra/tooling change, explicitly NOT part of this Release-Truth improvement PR and not a product fix.**

---

## 5. Output behavior requirements (match the desired posture)

1. **Disable the PR comment.** `release-truth.yml`'s `Comment on PR` step (currently active, lines 107-129) must be gated `if: ${{ false }}` (or behind an explicit approval input), mirroring Sentinel-L / PR #266. **No `gh pr comment` fires** unless you explicitly approve re-enabling.
2. **Add an artifact.** Upload `release-truth.json` (full structured findings incl. the 9 fields) via `actions/upload-artifact@v4` with `if: always()`. This is the primary durable channel.
3. **Enrich the Step Summary.** The `Job summary` step renders the per-failure 9-field explanation (not just verdict + bare reasons). Keep the `layers` JSON in a `<details>`.
4. **Keep the commit status** (on push) — verdict + a *short* enriched description (e.g. `PARTIAL: CRM Validation/geo-validate ECONNRESET (stale, rerun passed)` instead of `PARTIAL: workflow blocking failures: 1`).
5. **No email side effects.** Signals = commit status + artifact + Step Summary only.
6. **No product fixes.** Only `release-truth.yml`, `scripts/release-truth-check.js`, the workflow-layer validators it reports through (`validate-workflow-completeness.js`, `validate-release-status.js`), and their tests may change. No `app/**`, `lib/**`, `public/crm/**`, `scripts/build-rls-geojson.js` (the geo fix is its own infra PR), `prisma/**`, env, Neon, or Vercel changes.

---

## 6. Acceptance criteria (proof-first)

1. **Schema enforced:** a test asserts every reported workflow failure carries all 9 fields + `runId`/`runUrl`/`attempt`/`confidence`; a missing field fails the test.
2. **Freshness/rerun sourced correctly:** a fixture with attempt-1 failure + attempt-2 success yields `freshness=stale`, `rerunPassed=true` (the PR #277 shape).
3. **Cause classifier:** unit tests for the §3 signatures — `ECONNRESET` + untouched surface → `external_infra`; identical-on-rerun + touched file → `pr`; missing either → `indeterminate`.
4. **Exact-reason is verbatim:** a fixture log asserts `exactReason` contains the literal matched line (`read ECONNRESET`), not a paraphrase.
5. **Decision table:** parameterized tests over §4 rows → expected `recommendedAction`.
6. **Output behavior pinned:** workflow-structure test asserts the PR-comment step is `if: ${{ false }}`, the artifact-upload step exists with `if: always()`, the Step Summary includes the per-failure fields, and no `gh pr comment`/issue/mail step is enabled.
7. **Project gates green** (CLAUDE.md §G) even though no product paths change.

---

## 7. Out of scope (explicit)

- No product fixes; no `scripts/build-rls-geojson.js` change (the NYC Open Data retry/cache hardening is a separate infrastructure PR).
- No re-enabling of PR comments (Release-Truth **or** Sentinel-L) without explicit approval.
- No Neon/Vercel/env/cron changes.

**Bottom line:** replace `workflow blocking failures: 1` with *"CRM Validation / geo-validate failed on the first run because the NYC Open Data fetch returned `read ECONNRESET`; the rerun passed; PR #277 touched no geo data — external flaky fetch, not a product regression"* — emitted to artifact + Step Summary, with PR comments disabled.
