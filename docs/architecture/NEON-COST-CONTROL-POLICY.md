# Neon Cost-Control Policy

> Production project for all figures below is **`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`** (`DATABASE_URL` points there). The legacy `morning-bread-68708332` / `royal-dawn` project is stale / do-not-use; some historical storage figures here were measured on it.

**Status:** OPEN · REPORT-ONLY · No runtime patched. No env vars changed. No threshold change deployed. No workflow change. Sister doc: `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`.
**Date:** 2026-05-18
**Author:** Claude Code under Maya direction.
**Supersedes (in part):** the (deleted 2026-06-03) 2026-05-17 Launch-plan branch-policy audit — which treated Launch as the new ceiling; this doc treats Launch as **temporary plan capacity, not budget policy**.

---

## TL;DR — what this document establishes

1. **Launch is a temporary capacity tier, NOT permission to expand.** The long-term Neon operating model for mallan.nyc is **Free / minimum-cost discipline**.
2. **Plan capacity ≠ budget target.** Plan capacity is what Neon will allow. Budget target is what Maya intends to live within.
3. **Every decision that adds storage / compute / branch usage must be reviewed against the budget target**, not against the Launch plan ceiling.
4. **Returning to Free is structurally blocked today** — DB is at 961 MB vs. Free's 500 MB cap. Reaching the budget target requires shipping the legacy JSON column drop (`memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`, ~115 MB recoverable on `listings` alone) plus continued discipline.
5. **`ops:health` thresholds set by PR #150 reflect plan capacity, not budget.** They prevent false positives. A future `ops:neon-budget` command (specified in §10 here) reports budget-vs-capacity diff separately.

---

## §1 — Desired long-term Neon operating model: Free / minimum-cost

### The intent

The mallan-nyc Neon usage shape is designed so the project **fits inside the Free tier**:

- A small, slim-writer–constrained `listings` table (target ~80–200 MB after legacy JSON drop)
- A bounded set of secondary tables (audit_events, demand_signals, listing_search_projection, etc.) that grow slowly
- A single production branch (`main`) on the canonical production project (`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`)
- A small, prune-disciplined set of preview branches on the same Vercel-integration project (`hidden-mountain-87248164`)
- Compute discipline: no artificial DB keepalive — the `db-keepalive` cron was **removed** and `idx-sync`/`media-sync` widened to `*/30`/hourly in the approved 2026-07 compute-reduction (PR #481) so the endpoint can autosuspend between jobs; no synthetic health-probe DB load, no permanent connection pools beyond what serverless routes use

### Why this is the policy, not just an aesthetic preference

- **Predictable cost ceiling.** Free is $0/mo. Launch is $19/mo + overage. Scale is $69/mo + overage. Every step up is a recurring spend Maya did not authorize and is not budgeted.
- **Pressure-test discipline.** The Free 500 MB cap functions as a continuous gate against accidental storage bloat (e.g. wide raw_data writes, debug columns left in production, sparse-data tables that grow without an archive policy).
- **Architectural alignment.** The slim-writer pattern (PR #75 / #76, master-plan PR 10) was designed specifically so production fits Free. Public-records is intentionally a separate Neon project planned to stay Free per `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` §15.

### The Launch-tier exception

The plan upgrade to Launch was a **temporary remediation** for the Vercel-Neon integration check that asserted "Branch limit exceeded" against the 10-branch Free cap. Maya upgraded to clear the false-positive UI noise on every preview deploy. **The upgrade is not a permission to use Launch headroom as budget.**

When the underlying integration check stops asserting branch-limit failures (via support resolution, integration re-bind, or migration off the Vercel-Managed integration variant), the plan should be re-evaluated for downgrade to Free.

---

## §2 — Plan capacity vs. budget target

| Concept | What it is | Who sets it |
|---|---|---|
| **Plan capacity** | The hard limits (or first overage-billing tier) of the currently-paid Neon plan | Neon, by plan |
| **Budget target** | The usage envelope Maya intends to live within, independent of which plan is paid | Maya, by policy |

| Dimension | Free plan cap | **Current plan (Launch) capacity** | **Maya's budget target** | Why the gap |
|---|---|---|---|---|
| Storage | 500 MB | **10 GB** (10,240 MB) | **500 MB** | Match Free; structural intent |
| Compute | ~100 CU-hr/mo (post-2025 reset; older 191.9 figure stale) | **300 CU-hr/mo baseline + overage** | **~100 CU-hr/mo** | Match Free; predictable cost |
| Branches per project | 10 | **5000** | **10** | Match Free; the integration's behavior is the only reason this matters |

**The thresholds in `scripts/ops-health.js` (set by PR #150) are keyed to plan capacity.** They prevent false positives at the current usage level. They do NOT enforce the budget target.

### The gap problem (today, 2026-05-18)

| Dimension | Maya's budget target | Actual usage | Status |
|---|---|---|---|
| Storage | 500 MB | **961 MB** | ❌ **OVER budget by 92%** (under plan capacity — at 9.4% of Launch) |
| Compute | ~100 CU-hr/mo | unknown precisely; ops:health doesn't read CU-hr | (cannot evaluate yet) |
| Branches | 10 | 17 (per most-recent cron audit-event) | ❌ **OVER budget** (under plan capacity — well below 5000) |

**`ops:health` reports HEALTHY today** because the thresholds match plan capacity. **By budget policy, the project is over-budget on every measured dimension.** That mismatch is the problem this doc fixes.

---

## §3 — Branch budget target, warning, and critical thresholds

| Threshold | Value | Source | What fires |
|---|---|---|---|
| **Budget target** | 10 branches | Maya policy (matches Free cap) | "We want ≤10 steady-state" |
| **Budget warning** | ≥ 8 branches | Within-2-of-target signal | Investigate why the count is rising — fast-pushing PRs? prune cron stalled? |
| **Budget critical** | ≥ 10 branches | At-or-over target | Stop growth, prune aggressively, investigate why retention/cleanup isn't working |
| **Plan-capacity warning** | ≥ 25 branches | PR #150 threshold (3× baseline) | True anomalous growth — branches/day rate has tripled |
| **Plan-capacity critical** | ≥ 4000 branches | PR #150 threshold (80% of 5000) | Imminent plan-ceiling — emergency |

**Two-tier monitoring is required:** budget-tier (8 / 10) fires when discipline is slipping; plan-capacity-tier (25 / 4000) fires when something is catastrophically wrong. Both are useful; collapsing to one obscures.

### Today's state vs. these thresholds

- Last cron run: examined=17, pruned=10, errors=0 → **examined=17 trips budget-critical (≥10), well below plan-capacity-warning (25).** The cron is pruning correctly; the 17 examined is the post-prune-cycle count (i.e., what's left after the 24h retention window). If the steady-state regularly lands at 7 (= 17 examined − 10 pruned) the budget is OK; if it lands at >10 the policy is being broken structurally.
- **No alerting today against the budget tier.** Adding it is in the §12 implementation roadmap.

---

## §4 — Storage and compute budget targets

### Storage

| Threshold | Value | What fires | Action |
|---|---|---|---|
| **Budget target** | 500 MB | Maya policy (Free cap) | Steady-state cap |
| **Budget warning** | ≥ 400 MB (80% of target) | Early signal | Audit recent writes; check legacy-JSON drop progress |
| **Budget critical** | ≥ 500 MB | At target | Stop net growth; ship legacy-JSON drop ASAP |
| **Plan-capacity warning** | ≥ 7 GB (70% of 10 GB Launch cap, PR #150) | Catastrophe-tier signal | Scale-plan-upgrade conversation |
| **Plan-capacity critical** | ≥ 8.7 GB (85% sustained) | Pre-emptive escalation | Forced Scale upgrade |

### Compute

| Threshold | Value | What fires | Action |
|---|---|---|---|
| **Budget target** | ~100 CU-hr/mo (Free baseline) | Maya policy | Predictable monthly bill = $0 |
| **Budget warning** | ≥ 80 CU-hr/mo | 80% of budget | Audit cron frequency, query paths, keepalive intensity |
| **Budget critical** | ≥ 100 CU-hr/mo | At budget | Reduce burn before month-end |
| **Plan-capacity warning** | ≥ 240 CU-hr/mo (80% of 300) | Plan overage imminent | Examine usage spike |
| **Plan-capacity critical** | ≥ 300 CU-hr/mo | Overage billing begins | Decide: accept overage one-time, or reduce |

### Today's state vs. these thresholds

- Storage: **961 MB** = ❌ budget critical (over target); ✓ plan-capacity OK
- Compute: not currently measured by ops:health; need the new `ops:neon-budget` command (§10) to pull CU-hr from Neon API

---

## §5–§9 — Project identities, env ownership, automation owners

**See sister doc:** `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` — full identity + ownership matrix lives there. This doc cross-references it.

### Quick reference (the punchline; full table in the ownership map)

| Concept | Value |
|---|---|
| **Production Neon project** | `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` (`DATABASE_URL` points here; repointed 2026-06-02) |
| **Preview/integration Neon project** | `hidden-mountain-87248164` — **the same project as production above.** The Vercel-Neon integration creates preview branches inside the canonical production project (UI lists the product as `neon-green-school`); there is no separate preview project. |
| **Credential rotation owner** | `.github/workflows/rotate-db-keys.yml` (GitHub Actions; **targets the legacy `morning-bread` project and is DISABLED until retargeted to cold-waterfall + host-guarded**) |
| **Preview branch cleanup owner** | `app/api/cron/neon-branch-prune/route.ts` daily 04:00 UTC + `lib/neon/branches.ts` shared logic. **Corrected 2026-08-20:** this row previously said the cron “targets preview project”. There is no separate preview project — it targets `hidden-mountain-87248164`, the **canonical PRODUCTION** project, which **also hosts the preview branches**. `isCanonicalNeonProject` pins it there (fail-closed, 409 on any other project id), so the cron holds DELETE rights over every branch of the production project. Production is therefore refused deliberately in `isPrunable()` — by branch id, by branch name, by the `primary` / `protected` / `default` flags, and by requiring the `preview/` prefix — with identity gaps failing closed. See `tests/runtime/neon-branch-prune-guard.test.ts`. |

---

## §10 — Commands that report budget health

### Existing (deployed today)

| Command | What it reports | Budget-aware? |
|---|---|---|
| `npm run ops:health` | Storage % of plan cap, sync watermark, retention compliance, branch-prune cron status, listing/audit_event counts | ❌ NO — reports against plan capacity (10 GB) only |
| `npm run ops:health:json` | Same as above as JSON | ❌ NO |
| `npm run ops:neon-prune` | Dry-run + execute mode for branch pruning | ❌ NO (operational, not reporting) |
| `npm run idx:validate` | IDX Plus 32-section validator (1278 checks) | n/a |
| `npm run ucba:audit` | UCBA 2026 145-rule audit | n/a |

### Proposed (NOT YET WIRED UP)

| Command | What it would report | Status |
|---|---|---|
| **`npm run ops:neon-budget`** | Storage vs. **500 MB budget target** (+ delta) AND vs. 10 GB plan cap; CU-hr vs. **100 CU-hr budget target** AND vs. 300 CU-hr plan baseline; branches vs. **10 budget target** AND vs. 5000 plan cap. Three-column output: budget target / plan capacity / actual. Exit non-zero on budget-critical, regardless of plan-capacity verdict. | **Proposed (§12)** |
| ops:health extension | Add a "BUDGET" section below "STORAGE" that shows the budget-tier verdict alongside the plan-capacity verdict | **Proposed (§12)** |

---

## §11 — Files requiring cost-impact review if changed

Any PR touching these files MUST include a cost-impact analysis in the PR body. The cost-impact section answers: "Does this change project storage / compute / branch usage **toward or away from** Maya's budget targets in §3 + §4?"

### Storage-impact files (high)

| File | Cost impact |
|---|---|
| `prisma/schema.prisma` | Every new column / table / index adds storage. Wide columns + JSON-typed columns are the worst offenders |
| `prisma/migrations/**` | Same — every `ADD COLUMN` is recurring storage |
| `lib/idx/sync.ts` | Controls Trestle → DB write shape. PR #75 slim-writer pattern cut listings by ~104 MB; reverting/widening writes is a budget-critical change |
| `lib/idx/trestle-mapper.ts` | The mapper's keep-set defines `raw_data` shape on every listing |
| `lib/compliance/raw-data-keep-fields.ts` | The keep-set itself — every field added grows every listing row |

### Compute-impact files (high)

| File | Cost impact |
|---|---|
| `vercel.json` (cron schedule) | Every cron tick is a DB query path. Tightening from `*/15` to `*/3` is a 5× compute burn |
| _(removed 2026-08-07)_ `app/api/cron/db-keepalive/route.ts` | Route DELETED — it was unscheduled since the approved 2026-07 compute reduction (PR #481) and an executable endpoint invites accidental reactivation. The compute-vs-uptime trade-off is documented at line 32 of this file; `lib/db/with-retry.ts` carries the cold-start retry that replaced it. |
| `app/api/cron/idx-sync/route.ts` | Sync frequency × records-per-run = compute burn |
| `app/api/cron/*` (all 23 crons) | Each one adds baseline compute |
| `lib/prisma.ts` | Connection-pool config affects warm-vs-cold time |

### Branch-impact files (medium)

| File | Cost impact |
|---|---|
| `lib/neon/branches.ts` | `DEFAULT_RETENTION_HOURS` defines the steady-state branch count |
| `app/api/cron/neon-branch-prune/route.ts` | Cron cadence + retention policy |
| `scripts/neon-prune-branches.ts` | One-off operator tool — same retention applies |

### Threshold-defining files (high — these ARE the policy)

| File | Cost impact |
|---|---|
| `scripts/ops-health.js` THRESHOLDS object | This is where plan capacity is encoded today. Adding a budget-target tier alongside (per §12) is a policy-relevant change |
| Future `scripts/ops-neon-budget.js` (proposed) | When created, this file IS the budget policy in code |

### Out-of-scope (low)

`memory/SESSION-*` archival docs, `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` (separate project intentionally Free), `tests/runtime/neon-branch-prune-route.test.ts` (test fixtures use fake counts, do not affect budget).

---

## §12 — Recommended future implementation (NOT EXECUTED in this doc)

Each item below is a separate small PR with its own validation cycle. None are part of this report-only doc.

### §12.1 — `ops:health` shows both budget target AND plan capacity

**Scope:** Extend `scripts/ops-health.js` to print a BUDGET section alongside the existing STORAGE section. Same data sources; new framing.

**Output mockup:**

```
── STORAGE ───────────────────────────────────────
  DB size: 961.34 MB
    vs budget target (500 MB):  ❌ 192% (over by 461 MB)
    vs Launch plan cap (10 GB): ✓ 9.4% (well under)
  Top 5 tables: ...

── BUDGET ────────────────────────────────────────
  Storage:     ❌ CRITICAL — over 500 MB budget target
  Compute:     (not yet measured — needs ops:neon-budget)
  Branches:    ❌ CRITICAL — 17 examined, budget target 10
  Recommendation: ship legacy-JSON drops; investigate retention
```

**Validation:** type-check, ops:health smoke shows BUDGET section, no regression in JSON output shape (back-compat).

**Estimated effort:** ~30 lines in ops-health.js; ~20 line test fixture update.

### §12.2 — New `npm run ops:neon-budget` command

**Scope:** New script `scripts/ops-neon-budget.js`. Pulls live values from Neon API (storage + CU-hr + branch count) AND from the local DB, then prints a three-column report:

```
                 BUDGET TARGET    PLAN CAPACITY    ACTUAL
Storage          500 MB           10 GB            961 MB    ❌ over budget
Compute (mo)     100 CU-hr        300 CU-hr        N CU-hr   ?
Branches         10               5000             17        ❌ over budget
```

**Exit code:** `0` if all within budget; `1` if any over budget but under capacity; `2` if any over capacity.

**Why separate from `ops:health`:** `ops:health` is the daily/per-deploy gate (must stay fast + use local DB). `ops:neon-budget` calls the Neon API (~2–5 s, needs `NEON_API_KEY`) so it lives in its own command, run on demand.

**Validation:** runtime test pinning the budget-vs-capacity-vs-actual table shape.

**Estimated effort:** ~150 lines; one runtime test file.

### §12.3 — PR template cost-impact section

**Scope:** Add a section to the GitHub PR template (`.github/pull_request_template.md` if it exists, or create one) requiring contributors to fill out a cost-impact block when changing files listed in §11.

**Template block:**

```markdown
## Cost impact (required if any §11 file touched)

| Dimension | Direction | Estimate | Budget-target status post-change |
|---|---|---|---|
| Storage | ↑ / ↓ / no change | (MB / row) | (within / over) |
| Compute | ↑ / ↓ / no change | (CU-hr / mo) | (within / over) |
| Branches | ↑ / ↓ / no change | (count) | (within / over) |
```

**Enforcement option (later):** `guardrails.yml` check that on PRs touching §11 files, the PR body contains this block.

### §12.4 — No preview branch reliance on paid plan capacity

**Scope:** Hard policy rule, no code change. The branch-prune cron + retention window MUST be designed to keep steady-state ≤ 10 branches even if the plan downgrades to Free.

**Implementation today (verify, don't change):** retention=24h with daily prune at 04:00 UTC. At steady-state (~1–3 active PRs/day + 1–3 deploys/PR), 24h retention should hold ≤ 10. Recent ops:health smoke showed `examined=17` → 17 is over the budget target; retention may need tightening to 12h (matches the §B option in the older preview-branch-limit audit) if 24h reliably misses target.

**Recommended next step:** observe for 7 days at the current 24h retention; if branch count routinely exceeds 10, ship the 24h→12h retention PR (1-line edit in `lib/neon/branches.ts`).

**Forbidden:** any architecture that would rely on Launch's 5000-branch headroom to function. If a preview-branching design starts requiring more than 10 active branches, the design is wrong for this project.

---

## §13 — What this doc does NOT do

- ❌ No env vars (Vercel or GH Actions) touched
- ❌ No NEON_PROJECT_ID change on any surface
- ❌ No Neon branches deleted
- ❌ No Neon disconnect/reconnect
- ❌ No preview-branching toggle change
- ❌ No ops:health code change
- ❌ No workflow files created or modified
- ❌ No migrations / reconciliation / cron triggers / R2 / CRM work
- ❌ No PR #148 / PR 5B work
- ❌ No source code touched
- ❌ No `scripts/ops-health.js` THRESHOLDS change
- ❌ No production-data mutation
- ❌ No memory/SESSION-* archival docs touched
- ❌ No `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` touched
- ❌ The Launch-plan thresholds set by PR #150 stay as-is in this PR

The implementation roadmap in §12 is **proposal-only**. Each item requires a separate PR with its own approval cycle.

---

## §14 — Cross-references

- `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` — sister doc; full project identity + env ownership + automation ownership matrix
- (deleted 2026-06-03) PR #150's Launch-plan threshold audit — its plan-capacity thresholds are reframed here as "capacity, not policy"
- (deleted 2026-06-03) the integration-check noise investigation — canonical status now in `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`
- `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md` — the implementation plan that, when shipped, recovers ~115 MB on `listings` toward the storage budget target
- `NEON.md` — operational discipline; this doc's policy supersedes any "Launch as steady-state" framing
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` §15 — public-records project's storage budget (also intentionally Free)
- `docs/engineering/pr-verification-checklist.md` R0 — CLAUDE.md dependency-survey rule; the precedent for procedural-without-enforcement rules

---

**End of report. No runtime patched. No env changed. No threshold deployed. Rules are policy until §12 items are approved as separate implementation PRs.**
