# Validator Truth Framework — 2026-04-26

> **Status:** ACTIVE · **Created:** 2026-04-26 · **Owner:** Maya Allan
>
> Source: full architectural spec provided by user 2026-04-26 to replace
> pattern-based confidence with release truth. Replaces "patterns exist"
> mental model with "evidence of implemented behavior + release readiness
> + live correctness."

## Why this exists

The current validator suite (ucba-audit, ci-compliance-check, idx-validate)
is pattern-based. It detects regressions but not partial implementations,
deploy failures, runtime no-ops, or PR claims that overstate landing.

Real misses this framework would have caught:
- **#47/#55** — merged but deploy failed (would-be CODE_VALID, DEPLOY_INVALID)
- **#50/#57** — claimed to close C15 auction but only schema + backend
  enforcement landed; sale-form UI never shipped (PARTIAL, CLAIM_OVERSTATED)
- **#59** — backfill script existed but proof-of-execution wasn't tracked
- **#45** — parser migration (xlsx → exceljs) lacked real-input fixture proof
- **#56** — Linux deploy break invisible to all static validators

## Final shared status vocabulary (used by every validator)

```
PASS              fully satisfied with evidence
PARTIAL           some required surfaces or proofs exist, not all
FAIL              required behavior missing or contradicted
REGRESSION        previously passing rule now missing a required surface
UNVERIFIED        evidence requires deploy/runtime/prod state not currently proven
CLAIM_OVERSTATED  implementation narrower than what the PR/plan claims
WARN              important issue, non-blocking by policy
INFO              advisory only
```

## Final aggregate verdicts (from release-truth-check.js)

```
PROD_PROVEN        code-valid + deploy-pass + no blockers + live healthy + no overstatement
CODE_VALID         code structure sound, deploy/live/prod proof missing
PARTIAL            some surfaces implemented, not all
DEPLOY_INVALID     merged code exists but deploy failed
UNVERIFIED         not enough runtime/prod evidence
CLAIM_OVERSTATED   PR claims more than evidence supports
REGRESSION         previously-passing rule broke
```

## 7-layer model

1. **Rule Truth Layer** — UCBA / REBNY rule satisfaction
2. **Workflow Completeness Layer** — feature crosses all required surfaces
3. **Runtime Effect Layer** — high-risk routes actually do what they claim
4. **Migration / Rollout Layer** — schema safety, migration presence, rollout proof
5. **Build / Deploy Layer** — install/build succeeds + merged-commit deploy result
6. **Live Site Layer** — production behavior matches expectations
7. **Claim Verification Layer** — PR text matches actual evidence

## Phase plan

### Phase 1 — Foundation (THIS SESSION)
Delivers the *truth* part of the framework. Subsequent phases plug into it.

**Files:**
- NEW `compliance/rules/ucba-audit-checklist.v2.json` — rich rule format with
  `validation_mode`, `required_surfaces`, `evidence`, `ci_policy`
- NEW `compliance/rules/workflow-map.json` — feature-to-surface map, seeded
  with C15 (auction), C1 (inquiry), C4 (ethics gate), C2 (offer transmission)
- NEW `compliance/rules/operational-actions.json` — registry of rollout actions
  + their postconditions (e.g. ethics backfill must show 0 lock-outs)
- UPDATED `scripts/ucba-compliance-audit.js` — emits PASS/PARTIAL/FAIL/UNVERIFIED;
  hard-fails on FAIL; supports both v1 (legacy) and v2 (rich) checklist
  formats during transition
- NEW `scripts/validate-workflow-completeness.js` — reads workflow-map.json,
  evaluates each surface independently, aggregates per workflow
- DOCS — `compliance/VALIDATOR-FRAMEWORK.md` user-facing usage guide

**Out of scope this phase (deferred to later phases):**
- Migration discipline validator
- Deploy status validator
- Release truth aggregator
- Runtime side-effect tests
- Live site smoke
- Target-platform CI build job
- PR claim verification

**Acceptance:**
- C15 reports `PARTIAL` (schema + backend enforcement done, UI form missing)
  not `FAIL` and not `PASS` — the "honest" verdict
- C1 (inquiry), C2 (offer), C4 (ethics) report `PASS` — all surfaces present
- Workflow validator output independent of UCBA audit output
- Both validators readable by humans + machine-parseable for CI

### Phase 2 — Schema & Deploy Truth
- `scripts/validate-migration-discipline.js` — schema PR has migration,
  rollout note, prod migrate status when DB accessible
- `scripts/validate-release-status.js` — GH check status + Vercel state
  per commit SHA → DEPLOY_PASS/FAIL/PENDING/UNKNOWN
- `scripts/release-truth-check.js` — aggregator (Phase 1 + Phase 2 inputs)
- Per-merge audit mode: `--per-merge --from-sha X --to-sha Y`

### Phase 3 — Runtime Effect Tests
- Inquiry route effect tests (8 endpoints)
- Auth route tests (login + MFA verify + ethics gate)
- Offer transmit route test (idempotency + UCBA precondition)
- Import route tests (preview + import + duplicate handling + malformed)
- Test fixtures for parser (csv, xlsx, blank rows, mixed types, malformed)

### Phase 4 — Live Truth + CI Hardening
- `scripts/validate-live-site.js` — homepage, search, public APIs, freshness
- PR claim verification module (extends release-truth-check.js)
- New CI job: target-platform install/build (Linux, Node version match)
- Toolchain validator
- Per-rule severity policy (BLOCKER / HIGH / MEDIUM / LOW / INFO)

## How to resume

1. Read this file top-to-bottom.
2. Check git for any open PR with title containing "validator" or branch
   `feat/validator-*`.
3. Identify lowest-numbered phase with status `IN_PROGRESS` or `NOT_STARTED`
   in the phase table below.
4. Execute that phase per its file list + acceptance criteria.
5. Update this file's phase table when each phase merges.

## Phase status

| Phase | Title | Status |
|---|---|---|
| 1 | Foundation — schema + UCBA truth | IN_PROGRESS |
| 2 | Schema & Deploy Truth | NOT_STARTED |
| 3 | Runtime Effect Tests | NOT_STARTED |
| 4 | Live Truth + CI Hardening | NOT_STARTED |

## Final definition of success

After all phases land, the system must force the repo to say exactly what
is true:
- code exists / does not exist
- deploy succeeded / failed
- workflow is complete / partial
- runtime effect is proven / unverified
- production is healthy / stale
- claim is confirmed / overstated

No human can say "this works" or "this is closed" without the validator
agreeing.
