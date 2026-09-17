# Validator Truth Framework

> **Status:** Phase 1 shipped (rule truth + workflow completeness). Phases 2 and 4 also landed on `main` on 2026-04-26 (`150a7c14`, `84daeb01`) — release-truth aggregator, per-merge audit mode, migration-discipline, deploy-status, live-site and toolchain validators. *(This line read "Phase 1 (Foundation) — schema rich-format + workflow completeness layer" until 2026-09-10; the phase table below was already out of date.)*
> **Source spec:** `memory/VALIDATOR-FRAMEWORK-2026-04-26.md`
> **Created:** 2026-04-26

## Why this exists

The historical validator suite (`ucba-audit`, `ci-compliance-check`,
`idx-validate`) was pattern-based — it detected regressions but couldn't
distinguish:

- **partial implementations** (schema + backend done, UI missing) from full ones,
- **deploy failures** from successful merges,
- **silent runtime no-ops** from real side effects,
- **PR claims that overstate** from claims that match landed code,
- **operational steps that were skipped** from steps that were executed.

The framework replaces "patterns exist" with **release truth**:

> Is the rule implemented? Is the workflow complete? Did the schema migrate?
> Did the deploy succeed? Did the route actually produce its side effect? Did
> the live site reflect the fix? Did the PR claim more than the code proves?

## Shared status vocabulary (all validators speak this)

| Status | Meaning |
|---|---|
| `PASS` | Fully satisfied with evidence. |
| `PARTIAL` | Some required surfaces or proofs exist; not all. |
| `FAIL` | Required behavior missing or contradicted. |
| `REGRESSION` | Previously-passing rule now degraded. |
| `UNVERIFIED` | Evidence requires deploy/runtime/prod state not currently proven. |
| `CLAIM_OVERSTATED` | Implementation narrower than what the PR/plan claims. |
| `WARN` | Important issue, non-blocking by policy. |
| `INFO` | Advisory only. |

## Layer 1 + Layer 2 — what's shipped (Phase 1)

### Layer 1 — Rule Truth Validator

**File:** `scripts/ucba-compliance-audit.js`
**Reads:** `compliance/rules/ucba-audit-checklist.json`
**Run:** `npm run ucba:audit`

Each UCBA rule supports two formats:

#### v1 (legacy — single regex per rule)

```json
{
  "id": "C16",
  "verdict": "PASS",
  "verifyFiles": ["public/crm/SALE-FORM-REDESIGN.html"],
  "verifyPattern": "negotiable|not set by law"
}
```

The runner uses pattern presence + previous verdict to detect regressions.

#### v2 (rich — per-surface evaluation)

```json
{
  "id": "C15",
  "verdict": "FAIL",
  "validation_v2": {
    "validation_mode": "workflow",
    "ci_policy": "must_pass",
    "release_blocking": false,
    "required_surfaces": ["schema", "migration", "ui_form", "backend_route", "validation_logic"],
    "evidence": {
      "schema": ["prisma/schema.prisma"],
      "ui_form": ["public/crm/SALE-FORM-REDESIGN.html"],
      "backend_route": ["app/api/crm/sales/listings/route.ts"],
      "validation_logic": ["lib/compliance/rls-enforcement.ts"]
    },
    "surface_patterns": {
      "schema": "auction_yn|auction_type",
      "ui_form": "auction|minimum.bid|buyer.*premium",
      "validation_logic": "AU-001|AU-002"
    },
    "expected_aggregate": "PARTIAL",
    "workflow_id": "auction_listing"
  }
}
```

The runner evaluates each surface independently → aggregates to PASS / PARTIAL
/ FAIL / UNVERIFIED. When `expected_aggregate` is set, it's compared to actual
and emits `CLAIM_OVERSTATED` if actual is worse than expected.

#### Exit codes

| Exit | Cause |
|---|---|
| 0 | All checks within expectations. PARTIAL allowed if `expected_aggregate=PARTIAL`. |
| 1 | One or more blocking `FAIL` rules. |
| 2 | One or more `REGRESSION`. |
| 3 | One or more `CLAIM_OVERSTATED`. |

### Layer 2 — Workflow Completeness Validator

**File:** `scripts/validate-workflow-completeness.js`
**Reads:** `compliance/rules/workflow-map.json`
**Run:** `npm run validator:workflows`

Each workflow declares the surfaces required for the feature to be considered
complete (schema, migration, helper, backend route, UI form, etc.). The
validator evaluates each surface independently and aggregates.

**Current seeded workflows:**

| Workflow | Status | Notes |
|---|---|---|
| `auction_listing` | PARTIAL | Schema + backend done; UI sub-section deferred |
| `inquiry_capture` | PASS | Static surfaces complete; runtime test in Phase 3 |
| `offer_transmission` | PASS | Static surfaces complete; runtime test in Phase 3 |
| `ethics_training_gate` | PASS | Administrative RECORD (schema, migration, broker admin route, audit log). NOT an auth gate and has NO operational postcondition — ethics training never blocks login (commit 2c10ce0b). |

#### Exit codes

| Exit | Cause |
|---|---|
| 0 | No release-blocking workflow is FAIL or PARTIAL. |
| 1 | At least one release-blocking workflow is FAIL or PARTIAL. |

## Operational actions registry

**File:** `compliance/rules/operational-actions.json`

Tracks PRs that require **manual rollout actions** AND a verifiable
**postcondition** before they're considered safely landed. Phase 2 will wire
this into the release-truth-check aggregator (which will check postconditions
against prod when DB access is available).

Currently registered:
- `schema_migrations_applied_to_prod` — `prisma migrate status` clean
- `r2_provisioned_before_media_sync` — `npm run ops:r2-health` ok
- `twilio_configured_for_sms_reset` — Vercel env vars present

## What's NOT shipped yet (Phase 2-4)

> **CORRECTED 2026-09-10 — this heading is no longer true for six of the eleven rows.** Verified against `package.json` and `git log`: the migration-discipline, deploy-status, release-truth-aggregator and per-merge rows shipped in `150a7c14` (2026-04-26); the live-site and toolchain rows shipped in `84daeb01` (2026-04-26). Rows are marked **SHIPPED** in place rather than deleted, so the original plan stays readable. Two Phase-3 rows have partial coverage in `tests/runtime/` (`inquiry-effect.test.ts`, `prospect-import-parse.test.ts`) — treat them as partial, not done. Only **PR claim verification** and **target-platform CI build** are genuinely unstarted.

| Layer | Phase | Description |
|---|---|---|
| Migration discipline validator | 2 | **SHIPPED `150a7c14`** — `npm run validator:migration` (`scripts/validate-migration-discipline.js`). Schema PR has migration + rollout note + prod migrate status |
| Deploy status validator | 2 | **SHIPPED `150a7c14`** — `npm run validator:deploy` (`scripts/validate-release-status.js`). GH check + Vercel state per commit SHA |
| Release truth aggregator | 2 | **SHIPPED `150a7c14`** — `npm run release:truth` (`scripts/release-truth-check.js`). Single verdict combining all layers |
| Per-merge audit mode | 2 | **SHIPPED `150a7c14`** — `npm run release:truth -- --per-merge --from-sha X --to-sha Y` |
| Runtime side-effect tests | 3 | **PARTIAL** — `tests/runtime/inquiry-effect.test.ts` exists; Offer / Auth / Import route effect proof still missing |
| Parser fixture tests | 3 | **PARTIAL** — `tests/runtime/prospect-import-parse.test.ts` exists; full csv/xlsx/blank/malformed fixture matrix against `parse.ts` still missing |
| Live site smoke validator | 4 | **SHIPPED `84daeb01`** — `npm run validator:live-site` (`scripts/validate-live-site.js`). Homepage / search / freshness / loading-state |
| PR claim verification | 4 | Compare claim phrases to evidence |
| Target-platform CI build | 4 | Linux runner with Node engines match |
| Toolchain validator | 4 | **SHIPPED `84daeb01`** — `npm run validator:toolchain` (`scripts/validate-toolchain.js`). Node/npm version policy |

## How to migrate a UCBA rule from v1 to v2

1. Identify the workflow surfaces the rule actually requires (schema?
   migration? UI form? backend route? mapper? gate? cron?).
2. List the evidence files for each surface.
3. Add a `validation_v2` block alongside the existing fields. **Do not delete
   the v1 fields** — they're still used during transition.
4. Set `expected_aggregate` to the honest current state (`PASS`, `PARTIAL`,
   `UNVERIFIED`).
5. Run `npm run ucba:audit` to confirm the v2 evaluation matches expectation.
6. If actual differs from expected, either:
   - The implementation is more complete than declared → upgrade `expected_aggregate`,
   - The declaration was wrong → fix the surfaces or evidence,
   - The rule legitimately regressed → fix the code first.

## How to add a new workflow

1. Identify the feature and the surfaces it requires.
2. List evidence files + optional regex patterns per surface.
3. Add an entry to `compliance/rules/workflow-map.json`.
4. Run `npm run validator:workflows` to confirm.
5. If the workflow has an associated UCBA rule, link the rule's
   `validation_v2.workflow_id` to the new workflow name.
6. If the workflow has an operational action (script run, env var set),
   register it in `operational-actions.json`.

## Run everything

```bash
npm run ucba:audit              # Layer 1 — rule truth
npm run validator:workflows     # Layer 2 — workflow completeness
npm run validator:migration     # Phase 2 — migration discipline
npm run validator:deploy        # Phase 2 — deploy / release status per SHA
npm run validator:live-site     # Phase 4 — live-site smoke
npm run validator:toolchain     # Phase 4 — Node/npm version policy
npm run release:truth           # Aggregator across layers
npm run release:truth -- --per-merge --from-sha A --to-sha B   # Per-merge audit
npm run ci                      # lint + type-check + compliance-check + idx:validate + build
```

> *(Corrected 2026-09-10: this block previously headed the last two commands "When Phase 2+ ships:". Phase 2 shipped 2026-04-26.)*

## See also

- `memory/VALIDATOR-FRAMEWORK-2026-04-26.md` — the full multi-phase plan
- `CLAUDE.md` — project instructions, runs `ucba:audit` in pre-commit
- `NEON.md` — schema migration discipline (which the migration validator will enforce)
