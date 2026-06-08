# PR #372 — Truth, Inventory, Enforcement Level & Merge Gate (2026-06-07)

This PR stands up the settlement governance system **and** ships executable gate code + tests.
It is **NOT "docs only."** This document is the source of truth for what #372 actually is, how
strongly it is enforced, and the exact conditions under which it may merge.

## 1. What this PR actually is (metadata truth)
- It changes **documentation, executable gate code, test coverage, and one package script** —
  not docs alone.
- It **does not** change any app/business code, DB, schema, migrations, env, deploy, cron, R2,
  or any `.github/workflows/**` file.

## 2. Changed-file inventory (grouped)

**Correction trace docs / templates**
- `docs/audits/corrections/_TEMPLATE.md` — the per-correction Trace Record template (RED proof now
  forbids grep-only, per §F).
- `docs/audits/corrections/U4-offer-transmit-ownership.md` — **PLANNED** seed only (no fix yet).

**Settlement ledger / plan docs**
- `docs/audits/settlement-ledger-2026-06.md` — single source of "is it settled."
- `docs/audits/phase1-unverified-traces-2026-06-07.md` — read-only Phase 1 trace findings.
- `docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md` — the gate/oversight
  plan (micro/macro, anti-skip §G, the implemented checkers §G8).
- `docs/audits/pr372-improvement-and-merge-gate-2026-06-07.md` — this document.

**Micro/macro gate scripts (executable gate code)**
- `scripts/ci/gate-lib.js` — pure gate policy (domain map, classifiers, micro/macro rules,
  Trace-Record validity heuristic).
- `scripts/ci/micro-gate.js` — `npm run gate:micro` (test-first enforcement).
- `scripts/ci/macro-gate.js` — `npm run gate:macro` (Trace-Record + blast-radius + fail-closed
  unknown-domain + domain→gate mapping).

**Test files**
- `tests/runtime/gate-checkers.test.ts` — pins the gate logic (micro/macro/trace-record rules).
- `tests/runtime/governance-consistency.test.ts` — catches governance-doc drift; asserts the
  checkers can't be removed.

**Package scripts**
- `package.json` — adds `gate:micro` + `gate:macro` (no dependency change).

## 3. Enforcement level (plain statement — read carefully)
- `npm run gate:micro` and `npm run gate:macro` are **runnable now** and their logic is
  **harness-enforced** (the unit tests run in `test:runtime` on every PR).
- They are **NOT GitHub branch-protection required checks.** Nothing in this PR makes them block a
  merge platform-side; a person could still merge a PR without running them.
- **Therefore #372 improves discipline and makes the rules machine-checkable, but it does NOT
  complete enforced, merge-blocking governance.** (The word "unskippable" is deliberately avoided —
  it would only be accurate once §G1 lands.)

## 4. The G1 follow-up (explicit, HELD, required-next)
The control that converts these from "runnable" to merge-blocking is **G1**: wire `gate:micro`,
`gate:macro`, and the harness into the CI workflow as **required status checks** with branch
protection. That edits `.github/workflows/**`, which is **HELD** — so it is **NOT done in #372**.
It is recorded in the Settlement Ledger as a row (status **HELD**, classified the **highest-leverage
governance follow-up**). **Until G1 lands, no correction PR is fully protected** — it is
discipline-enforced, not platform-enforced.

## 5. Merge gate — #372 may merge ONLY when ALL hold
1. This PR body / this doc accurately describes the actual changed files (no "docs only").
2. The harness is green (incl. `gate-checkers` + `governance-consistency` tests).
3. The governance-consistency tests pass (no plan↔template drift).
4. Codex has **no open valid finding** on the PR.
5. **No app/business code** is touched.
6. **No HELD surface** is touched (no `.github/workflows/**`, schema, env, cron, deploy, R2).
7. The **G1 enforcement limitation is explicitly documented** (this doc + ledger + plan §G8).
8. **U4 remains PLANNED** — not fixed, not settled (see its Trace Record).

Merge is via the documented-waiver squash (no `--admin`, no force) only when the sole remaining
red is the known-stuck `release-truth` PARTIAL.
