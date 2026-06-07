# Frozen Regression Baseline — 2026-06-07 (post Phase 0)

This is the reference every later checkpoint diffs against (plan §0.2/§0.3).
**The rule:** after each future step, the full HARNESS pass-set must equal
`THIS baseline ∪ {that step's new test}`. Any red **beyond the two named pre-existing
exceptions below** = a regression we caused → STOP, root-cause, fix/revert.

Captured on branch `chore/phase0-green-baseline`, based on `origin/main` (which includes
#368 featured fix). Re-measured on this exact base so the frozen counts reproduce on the
PR branch. The intended change-set is the Phase 0/0.4 test+validator+doc edits below.

## Phase 0 changes applied (the only behavior-neutral edits)
- **0.1** Quarantined orphaned test `lib/idx/__tests__/coverage-backfill-preview.test.ts`
  → `…coverage-backfill-preview.test.ts.disabled`. Proven orphaned: impl module
  `@/lib/idx/coverage-backfill-preview` absent; **0** production references; file was
  UNTRACKED (never committed). TODO: restore when the **HELD coverage-backfill** work lands
  (the `.disabled` file preserves the intended spec).
- **0.2** `lib/scanner/compliance/__tests__/suppression.test.ts`: pass explicit
  `new Date("2026-04-30")` (fixture canonical `captured_at`) into the two owner-name cases
  so they can't rot when `ms-002` expires 2026-06-01. **No fixture date bumped;
  `suppression.ts` untouched.**
- **0.4** `scripts/validate-workflow-completeness.js` (line 244): in `--json` (report)
  mode, `process.exit(0)` after emitting the report (standalone/human mode keeps exit-1
  gating). The prior non-zero exit made `ci-compliance-check.js`'s `execSync` throw and
  mark a VALID report as "UNVERIFIED — validator failed" (a harness blind spot). Added
  `tests/runtime/workflow-completeness-validator.test.ts` (2 tests) pinning the `--json`
  exit-0 + parseable-JSON contract. **Verified safe across all 4 callers**
  (ci-compliance-check ✅ fixed; idx-validate listing_display=PASS ✅ unchanged;
  release-truth-check reads the JSON `blocking_failures` field, ignores exit code ✅
  unchanged; `validator:workflows` standalone keeps exit-1 gating ✅). **Validator/test
  only — not imported by any `app/`/`lib/` runtime; no app behavior change.**
  Side effect (intended, honest): `compliance-check` now surfaces the previously-hidden
  **`ethics_training_gate` PARTIAL** as a visible **HIGH warning** (maps to Plan Phase 3.2).

## Full HARNESS result (exact counts)

| Gate | Result | Counts | State |
|---|---|---|---|
| `type-check` | **PASS** | 0 errors | ✅ **fixed in 0.1** (was 6 errors / RED) |
| `lint` | PASS | 0 errors, 10 warnings | ✅ (10 warnings = pre-existing baseline) |
| `test:runtime` | PASS | **2005/2005** · 120/120 suites | ✅ (+2 Phase 0.4 tests; base incl #368 featured) |
| `crm:test` | PASS | 39/39 | ✅ |
| `test:scanner` | **PASS** | 323/323 · 10/10 suites | ✅ **fixed in 0.2** (was 2 failed / RED) |
| `ucba:audit` | PASS | 46 PASS · 0 FAIL · **0 REGRESSIONS** | ✅ |
| `compliance-check` | PASS | 92 passed · 0 failed (BLOCKER+STRICT) · 1 warn · **0 unverified** | ✅ **EXCEPTION B RESOLVED (Phase 0.4)** |
| `rls:validate` | PASS | 0 errors · 1 warning · 0 missing | ✅ (warning = pre-existing) |
| `idx:validate` | **FAIL** | 1284 pass · **1 critical** · 3 warning · 38 info | ❌ **EXCEPTION A** |
| `audit:display-compliance` | PASS | 11/11 listing routes gated | ✅ |
| `build` | PASS | exit 0 · 297 pages | ✅ (rewrote tsconfig Node→bundler; **reverted**) |

## The two pre-existing exceptions (NOT caused by Phase 0)

### EXCEPTION A — `idx:validate` 1 critical: `/api/cron/media-backfill → NOT SCHEDULED`
- Check `[10/35] Cron Schedule Completeness`. The validator itself reports
  **"Critical issues unchanged (1)"** → this critical predates Phase 0.
- It is the **orphaned media-backfill route** (deliberately unscheduled since PR #176). This
  is **Plan Phase 4.5**, and per Maya's decision must NOT be deleted/rescheduled blindly
  (correct the false "runs every 8 min" comments first; delete only after proving no
  cron/frontend/docs/runbook reference it). 🔒HELD.
- Phase 0 changes (a scanner-test edit + an idx **test**-file rename) cannot affect a cron
  schedule check. **Confirmed not a regression.**

### EXCEPTION B — RESOLVED (Phase 0.4, 2026-06-07)
- Was: `compliance-check` 1 unverified because `ci-compliance-check.js`'s `execSync` threw
  on the validator's by-design non-zero exit (it was never a crash). **Fixed** by making the
  validator exit 0 in `--json`/report mode (gating preserved in standalone mode) + a runtime
  contract test. `compliance-check` now reports **0 unverified**.
- The real signal that was hidden is now **visible as a HIGH warning**:
  `workflow completeness — 1 release-blocking workflow PARTIAL` (= `ethics_training_gate`,
  Plan Phase 3.2). It is a **warning, not a BLOCKER+STRICT failure**, so the gate stays green
  (exit 0) — but it is no longer invisible.

## Regression-diff contract (forward)

```
Known baseline exception:
idx:validate has exactly 1 critical:
- /api/cron/media-backfill not scheduled

Any additional idx critical, or any change in this critical's identity, is a regression.
```

The baseline pass-set = **every gate above green, with exactly ONE remaining exception
(Exception A above)**. Going forward:
- `idx:validate` may show **at most** the same 1 critical (`/api/cron/media-backfill NOT
  SCHEDULED`); a **2nd** critical, or a change in this critical's identity, = regression.
- `compliance-check` must stay **0 failed (BLOCKER+STRICT)** and **0 unverified**; the
  `ethics_training_gate` HIGH **warning** may persist until Plan Phase 3.2 ships it; any
  **new** unverified or any BLOCKER+STRICT failure = regression.
- `test:runtime` must stay **2005/2005 · 120 suites** (or higher as steps add tests).
- Every other gate must stay exactly green at the counts above.
- `npm run build` must stay exit 0 (revert its tsconfig rewrite each run until Phase 5.3).

## Caveats
- `build` rewrites `tsconfig.json` `moduleResolution` `Node→bundler` every run — reverted
  after this capture; Phase 5.3 will pin it deliberately.
- `public/crm/data/validator-results.json` shows modified (generated artifact, pre-existing
  at session start) — excluded from the Phase 0 change-set, do not commit with Phase 0.
