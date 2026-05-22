# Neon ↔ Vercel Ownership Map

**Status:** OPEN · REPORT-ONLY · No env vars changed. No projects altered. No automation modified. Sister doc: `docs/architecture/NEON-COST-CONTROL-POLICY.md`.
**Date:** 2026-05-18 · clarification patch 2026-05-22
**Author:** Claude Code under Maya direction.
**Scope:** **Current best-known ownership map** of which Neon project is what, which env surface owns which value, which automation owns which lifecycle. The map exists so any future change to env / integration / cron can be reviewed against a single ownership table. (Prior wording said "Definitive map"; downgraded 2026-05-22 because not every surface has dashboard-confirmed values — see Confirmation Tier below.)

**Confirmation tier (2026-05-22):**

- **Production Neon project `morning-bread-68708332` → PROVEN.** Active reads/writes confirmed via `prisma/schema.prisma` migrations applied (`memory/BACKEND-AUDIT-2026-04-29.md:891`), `ops:health` storage measurements (961 MB → 1000 MB across 4 days), and the rotation script's endpoint hardcode (`.github/workflows/backups/rotate-db-keys.yml.cleanbak:82`).
- **Preview / integration Neon project `hidden-mountain-87248164` → UI-PROVEN from 2026-05-17.** Vercel Configure panel + Neon Console read by Maya on 2026-05-17 (per `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8). Vercel-side display name: "neon-green-school".
- **Vercel runtime `NEON_PROJECT_ID` env-var value → NO-CHANGE / PENDING FINAL DASHBOARD CONFIRMATION.** Inferred from cron behavior (examined=17 pruned=10 implies preview project, not production) but the operator has not yet read the literal Vercel Production env value side-by-side with the Neon Console URL bar. See §7 "Key ownership rule" and `docs/neon-launch-branch-policy-audit-2026-05-17.md` §C.4. **Do not change this value without that confirmation** (see Do-Not-Fix-Blindly below).

---

## ⚠️ Do Not Fix Blindly (added 2026-05-22)

If you're reading this because a Vercel preview build is stuck "pending" or a "Neon branching: Branch limit exceeded" check is failing, **STOP and classify the symptom first**:

| Symptom class | Indicator | Likely cause | Action |
|---|---|---|---|
| **A. Stale Vercel-Neon branch check** | "Branch limit exceeded" but `ops:health` reports `branch_prune` examined ≤ 25 and Neon Console shows ≤ baseline branches | Stale Vercel-side cache of the integration's pre-Launch-plan state | NO settings change. Refresh the Vercel preview status display only. See `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8. |
| **B. Stale Vercel-GitHub legacy `Vercel` status** (RC8) | GitHub `gh pr checks` shows `Vercel: pending` indefinitely, but actual Vercel deployment state is `READY` and `Vercel Preview Comments` check-run is `success` | Vercel posts build-start "pending" to GitHub's legacy Statuses API but never sends the success post-back. Modern Check-Runs API works fine. | Cosmetic only. Verify via Vercel Dashboard or `mcp__claude_ai_Vercel__get_deployment` that `state=READY` and merge based on Vercel-side truth. **Do not** reconnect the Vercel-GitHub integration without explicit Maya approval. |
| **C. Real failed deployment** | Vercel deployment state is `ERROR`; build logs show actual error | Genuine build/runtime failure | Inspect build logs via `mcp__claude_ai_Vercel__get_deployment_build_logs`. Fix the underlying error. |
| **D. Real Neon branch exhaustion** | `ops:health` reports `branch_prune` examined ≥ 4000 (critical) or `≥ 25` (warn); Neon Console actually shows that count | Cron not pruning OR cron pointed at wrong project (the known `NEON_PROJECT_ID` ambiguity) | First confirm cron's actual target project via Neon Console + Vercel env read. Only then act. |

**Do NOT (without explicit Maya approval AND symptom classification above):**
- ❌ Do not change `NEON_PROJECT_ID` on Vercel runtime or GitHub Actions
- ❌ Do not copy one `NEON_PROJECT_ID` value to the other surface (the two intentionally differ per §7)
- ❌ Do not disconnect/reconnect the Vercel-Neon integration (resource id `store_K9l79ICRUTMsiRh2`)
- ❌ Do not reconnect the Vercel-GitHub integration
- ❌ Do not rotate DB credentials manually (the rotate workflow is the only authorized writer per §8)
- ❌ Do not change `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` on any surface
- ❌ Do not toggle Vercel preview-branching off (would route preview deploys at production DB — see `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.6)

**Why these guardrails exist:** the `NEON_PROJECT_ID` value differs between Vercel and GitHub Actions surfaces by design (see §7). Treating the symptom by "fixing" the env without proving which symptom class is in play can corrupt production data binding or rotation lifecycle.

---

## 🔌 RC8 — GitHub legacy `Vercel` status drift (added 2026-05-22)

GitHub maintains **two parallel commit-status APIs** that Vercel posts to. They get out of sync chronically on this repo:

- **Modern Check-Runs API** (`commits/{sha}/check-runs`) → Vercel posts `Vercel Preview Comments` with `conclusion: success`. Works correctly.
- **Legacy Statuses API** (`commits/{sha}/status`) → Vercel posts `context: "Vercel"` at `state: "pending"` when the build starts, then **never sends the success post-back**. Stuck at "pending" indefinitely.

**Operational consequence:**

- `gh pr checks` reads BOTH and labels the row "Vercel: pending" forever.
- `mergeStateStatus` stays `UNSTABLE`. This is **cosmetic only**.
- Branch protection on `main` is NOT enabled (verified via `gh api repos/.../branches/main/protection` → 404 "Branch not protected"), so the cosmetic state does not block merges.

**Use Vercel deployment state + Vercel Preview Comments before calling a build "failed".**

To verify a build's truth state:
```
mcp__claude_ai_Vercel__get_deployment(idOrUrl=<dpl_*>, teamId=team_kZQh5NYLyrOKqffK0r9EXf4E)
→ check {state: "READY"}
```
Or use the inspector URL on the GitHub check row (`https://vercel.com/mallan/mallan-nyc/<id>`).

Cross-reference: `docs/incidents/2026-05-21-chronic-media-sync-root-cause.md` §RC8 (canonical incident treatment).

---

## 🚧 Separation — Vercel/Neon branching ≠ media-cron Neon compute (added 2026-05-22)

**These are two SEPARATE incidents living at different layers. Do not conflate.**

| Incident | Layer | State | Owner |
|---|---|---|---|
| **Vercel-Neon "Branch limit exceeded" stale check** | Vercel CI integration ↔ Neon-Vercel marketplace integration | Stale UI state since plan upgrade 2026-05-17; actual branch count is **8 / 5000** | Vendor-side (Vercel-Managed integration `store_K9l79ICRUTMsiRh2`) |
| **Media-cron Neon compute burn (RC1 / RC3)** | Neon production workload | Real chronic — `media_sync_state.last_photos_change` cursor frozen 21 days; 149 r2_failed vs 1 r2_mirrored per 24h before mitigation | mallan-nyc cron (`/api/cron/media-sync` + `/api/cron/media-backfill`) |

**The media-cron compute burn is a PROVEN compute risk** (see canonical incident doc) but it is **NOT proven to cause** the Vercel-Neon preview branching status. The two share no causal path:

- Media cron writes to the **production** project (`morning-bread-68708332`).
- Preview branching lives on the **integration** project (`hidden-mountain-87248164`).
- Branch-limit GitHub checks read Vercel/Neon UI state, not Neon production compute metrics.

**Mitigation status (2026-05-22):**

- PR #176 (merged at `b4f9ede0`) paused `/api/cron/media-backfill` — addresses the legacy `Listing.media` JSON stomp half of the compute burn.
- PR #178 (merged at `4b81dc0b`) added observability (`ops:health` media-sync section) — surfaces cursor staleness + R2 mirror failure ratio + dead-tuple ratio within one cron interval going forward.
- Vercel-Neon preview-branch status drift is unchanged (still cosmetic). No integration reconnect performed.

---

## 🧱 Public-records firewall (added 2026-05-22)

`PUBLIC_RECORDS_*` env-var family and the `mallan-public-records` Neon project (planned, intentionally Free per `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md`) are **unrelated to mallan-nyc production/preview ownership**.

**Do NOT use public-records provisioning rules to:**
- Change `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` on mallan-nyc surfaces
- Change `NEON_PROJECT_ID` on Vercel runtime or GitHub Actions for mallan-nyc
- Tune branch pruning retention in `lib/neon/branches.ts` (governed by `NEON-COST-CONTROL-POLICY.md`)
- Modify the Vercel-Neon integration binding for mallan-nyc (`store_K9l79ICRUTMsiRh2`)

The two projects share an account but **must remain operationally isolated** — provisioning, rotation, and cleanup are owned by separate workflows targeting different `NEON_PROJECT_ID` values.

---

## §5 — Production Neon project

| Field | Value |
|---|---|
| **Neon project name (Console / API)** | `morning-bread-68708332` |
| **Neon-side ID** | `morning-bread-68708332` (matches project name) |
| **Branch in use** | `main` (Neon's `primary: true` branch) |
| **Active compute endpoint(s)** | `cold-waterfall-adno3ao2` (primary; serves `DATABASE_URL`) ⋅ `royal-dawn-ad6eh8t2` (rotation-related secondary; provisioned during a credential rotation cycle, attached to the same `main` branch) |
| **Active host pattern** | `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` |
| **Pooled / unpooled** | Both (Vercel env stores `DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED` direct) |
| **What lives here** | All production app data: `Listing`, `ListingMedia`, `Agent`, `Lead`, `Deal`, `CommissionPayment`, `AuditEvent`, etc. (60 Prisma models per `prisma/schema.prisma`) |
| **Storage at 2026-05-18 16:40 ET** | **961 MB** (per ops:health) — note: over the Free-tier 500 MB cap; over Maya's budget target |
| **Reads from** | All app code via Prisma client (`lib/prisma.ts`) → `process.env.DATABASE_URL` |
| **Writes from** | Prod app routes + 23 crons + manual operator (`scripts/*` via local `.env.local`) |
| **Evidence files** | `memory/BACKEND-AUDIT-2026-04-29.md:891` (migration applied here); `docs/listing-search-projection-drift-report-2026-05-16.md:5` (host bytes cited); `.github/workflows/backups/rotate-db-keys.yml.cleanbak:82` (the rotation script's endpoint URL hardcodes this project's endpoint) |

---

## §6 — Preview / integration Neon project

| Field | Value |
|---|---|
| **Neon project name (Console / API)** | `hidden-mountain-87248164` |
| **Vercel UI label** | "neon-green-school" (Vercel-side display name for the same Neon project) |
| **Bound to Vercel** | mallan-nyc project (`prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`), All Environments scope |
| **Vercel integration resource ID** | `store_K9l79ICRUTMsiRh2` (Vercel-Managed integration) |
| **What lives here** | Preview branches — one fresh branch per Vercel preview deploy of mallan-nyc. Each is a throwaway copy of the production schema for preview-deploy isolation |
| **Branch count at 2026-05-17 04:00 ET** | 17 examined / 10 pruned / 7 net (per ops:health cron audit-event) |
| **Branches per project (Free cap)** | 10 |
| **Branches per project (Launch cap, current plan)** | 5000 |
| **Maya's budget target** | 10 (matches Free cap; see `NEON-COST-CONTROL-POLICY.md` §3) |
| **Reads from** | Preview deploys via integration-managed env vars (lowercase) — but mallan-nyc's app code reads only uppercase env vars, so preview branches are not actually used by app reads in practice. They exist as a side-effect of the Vercel-Managed integration's default behavior |
| **Other Neon project on same account, NOT bound to mallan-nyc** | `neon-green-door` (visible in Vercel Integrations UI, "Connect to Project" button shown — intentionally not connected; do not connect) |

---

## §7 — Env-var ownership: Vercel runtime vs. GitHub Actions

The same env-var NAME may live on both surfaces with **different values**. This is the most common source of confusion.

### Vercel runtime env (Production scope) — what app code reads

| Env-var name | Scope | Likely value | Reader |
|---|---|---|---|
| `DATABASE_URL` | Production | Pooled connection string for `cold-waterfall` endpoint on `morning-bread-68708332` | `lib/prisma.ts`, `lib/db.ts`, `scripts/ops-health.js`, 9 other call sites |
| `DATABASE_URL_UNPOOLED` | Production | Direct (unpooled) connection string for the same endpoint | `scripts/batch-geocode.js`, `scripts/import-past-deals.js` |
| `ASSISTANT_DATABASE_URL` | Production | Same shape as `DATABASE_URL` | **Zero readers** in app source — flagged dead in `docs/neon-launch-branch-policy-audit-2026-05-17.md` §D.5 |
| `NEON_API_KEY` | Production | Neon API token with `branches:write` scope | `app/api/cron/neon-branch-prune/route.ts` (the prune cron) |
| `NEON_PROJECT_ID` | Production | **Most likely `hidden-mountain-87248164`** (the integration's project) — inferred from cron's `examined=17 pruned=10` (would be ≤1 if it targeted `morning-bread`). Pending Maya's read-only UI confirmation per `docs/neon-launch-branch-policy-audit-2026-05-17.md` §C.4 | `app/api/cron/neon-branch-prune/route.ts` |
| `CRON_SECRET` | Production | Cron auth header value | Every `app/api/cron/*/route.ts` |
| Lowercase integration vars (`database_url`, `POSTGRES_*`, etc.) | Production/Preview/Dev | Auto-managed by the Vercel-Neon integration | **Zero readers** in app source (verified via grep) |

### GitHub Actions env (repository / variables) — what workflows read

| Env-var name | Type | Likely value | Reader |
|---|---|---|---|
| `DATABASE_URL` | secret | Pooled connection string (used by some workflows for migration commands) | Workflows that run Prisma; rotate workflow writes the canonical value |
| `DATABASE_URL_UNPOOLED` | secret | Same as Vercel | Same |
| `ASSISTANT_DATABASE_URL` | secret | Same as Vercel | Likely dead |
| `NEON_API_KEY` | secret | Same Neon API token as Vercel-side (or could differ — depends on how Maya provisioned them) | `.github/workflows/rotate-db-keys.yml` |
| `NEON_PROJECT_ID` | **actions var** (not secret) | **`morning-bread-68708332`** (per rotate workflow's most-recent runtime log) | `.github/workflows/rotate-db-keys.yml` |
| `VERCEL_TOKEN` | secret | Vercel API token | rotate workflow |
| `VERCEL_PROJECT_ID` | secret | `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` | rotate workflow |
| `MY_GITHUB_PAT` | secret | GitHub Personal Access Token | rotate workflow (to write GH secrets) |
| `SMTP_USER` / `SMTP_PASS` | secrets | M365 / Gmail SMTP creds | rotate workflow (email notification step) |
| `SLACK_WEBHOOK_URL` | secret | Slack alert endpoint | rotate workflow |
| `NEON_ADMIN_KEY`, `NEON_ROTATION_ADMIN`, `ROTATION_ADMIN_KEY`, `ASSISTANT_PAT`, `TEST_SECRET`, `NYC_GEOCLIENT_KEY`, `NYC_SODA_*`, `SOCRATA_APP_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` | secrets | Various integration creds | Various workflows |
| `AUDIT_*` (var) | actions vars | Audit-bot config (email, cadence, SMTP) | `.github/workflows/repo-audit-bot.yml` |

### Key ownership rule

**`NEON_PROJECT_ID` differs across the two surfaces by design** (best-current-evidence). The Vercel runtime value targets the preview/integration project; the GitHub Actions value targets the production project. Renaming, copying, or "fixing" either value without confirming the value on both surfaces will break automation.

### Do NOT do
- Do NOT change `NEON_PROJECT_ID` on either surface
- Do NOT set the same value on both surfaces without explicit cause
- Do NOT remove `ASSISTANT_DATABASE_URL` (the rotate workflow still writes it) — it's likely dead but removal requires confirming via full source grep first

---

## §8 — Credential rotation owner

| Field | Value |
|---|---|
| **Owner system** | GitHub Actions |
| **Owner file** | `.github/workflows/rotate-db-keys.yml` |
| **Target Neon project** | `morning-bread-68708332` (production) |
| **Schedule** | `cron: "0 5 1,15 * *"` — 1st and 15th of each month at 05:00 UTC + `workflow_dispatch` for manual |
| **What it does** | (1) Resets the Neon `neondb_owner` role password on the production project's `main` branch. (2) Pulls new pooled + unpooled connection URIs. (3) Writes them to 3 GH secrets: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ASSISTANT_DATABASE_URL`. (4) Upserts the same 3 values into Vercel Production env. (5) Triggers a production redeploy with `forceNew=1`. (6) Sends Slack + email notification. (7) Appends to `rotation-history.log`. |
| **Last known-good rotation** | 2026-03-01 05:44:12 UTC (per `rotation-history.log` in repo) |
| **Last failed run** | 2026-05-15 09:30 UTC (after 4 patches landed earlier the same morning) |
| **Failures since 2026-04-01** | Every scheduled run has failed; the 4 morning-of-2026-05-15 patches addressed 4 separate root causes but have not been verified by an actual successful run yet |
| **Patches landed but unverified** | `a9e1ce46` (CR/LF in MY_GITHUB_PAT) ⋅ `bb89f1de` (CR/LF in all auth secrets) ⋅ `1046d844 + 1deea773` (SMTP optional + empty-string clear) ⋅ `73f97552` (missing `name` in Vercel redeploy payload) |
| **Next scheduled run** | 2026-06-01 05:00 UTC (or manual `gh workflow run rotate-db-keys.yml`) |

### Rotation owner rules
- This workflow is the ONLY system authorized to write `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` to GH secrets + Vercel env. Manual edits to those values are forbidden.
- The workflow does NOT touch the preview/integration project (`hidden-mountain-87248164`). Preview branches use the integration's auto-managed lowercase vars.

---

## §9 — Preview branch cleanup owner

There are **two cleanup mechanisms** in play. Both target the same project (`hidden-mountain-87248164`) — they coexist as defense-in-depth.

### Mechanism A — Vercel-Managed integration's auto-cleanup (vendor-side)

| Field | Value |
|---|---|
| **Owner** | Vercel-Managed Neon integration (vendor-side, no repo code) |
| **Triggered by** | Vercel deployment deletion |
| **Retention** | Vercel's default deployment retention: **180 days** |
| **Visibility to us** | None — opaque vendor behavior |
| **Reliability assumption** | Cannot rely on this for budget-target enforcement (180-day retention is far too long for 10-branch budget) |

### Mechanism B — Our prune cron (repo-side, daily)

| Field | Value |
|---|---|
| **Owner file** | `app/api/cron/neon-branch-prune/route.ts` + shared logic in `lib/neon/branches.ts` + operator CLI in `scripts/neon-prune-branches.ts` |
| **Target Neon project** | `hidden-mountain-87248164` (per `NEON_PROJECT_ID` Vercel runtime env value, best evidence pending Maya's UI confirmation) |
| **Schedule** | `vercel.json` cron entry `{ "path": "/api/cron/neon-branch-prune", "schedule": "0 4 * * *" }` — daily 04:00 UTC |
| **Retention** | `DEFAULT_RETENTION_HOURS = 24` in `lib/neon/branches.ts:47` |
| **Skips** | `primary` branches (production `main`) and `protected` branches (operator-flagged) |
| **Observability** | Writes `AuditEvent` with `action: 'neon_branch_prune_cron'` on every run (success or skipped). `ops:health` reads the most recent record and surfaces `examined / pruned / errors` counts |
| **Most recent run** | 2026-05-17T04:00:24Z → status=ok, examined=17, pruned=10, errors=0 |

### Cleanup owner rules
- The prune cron is the **only** repo-side mechanism that should delete Neon branches. Manual API calls forbidden absent explicit Maya approval.
- The cron MUST stay enabled regardless of plan tier. Per `NEON-COST-CONTROL-POLICY.md` §12.4, preview branching must NOT rely on Launch's 5000-branch headroom — the cron is what keeps the steady-state inside the budget.
- If the steady-state branch count routinely exceeds Maya's 10-branch budget target, the next move is to **tighten retention from 24h to 12h** in `lib/neon/branches.ts:47` (one-line edit). Do not loosen retention.
- The Vercel auto-cleanup (Mechanism A) is welcome but not load-bearing; if it stops working (vendor outage, integration drift), the budget target is still enforced by Mechanism B.

---

## §11 — Files requiring cost-impact review (cross-reference)

The full list is in `NEON-COST-CONTROL-POLICY.md` §11. Highlights for the ownership-map context:

| File | Cost impact | Why it's an ownership-map concern |
|---|---|---|
| `.github/workflows/rotate-db-keys.yml` | Modifies which production env values are live; can re-bind via redeploy | Owns rotation (this doc §8). Changes here affect production DB connection |
| `app/api/cron/neon-branch-prune/route.ts` | Defines the cleanup-cron behavior | Owns preview cleanup (this doc §9). Changes here affect the budget-target enforcement |
| `lib/neon/branches.ts` | `DEFAULT_RETENTION_HOURS` defines steady-state count | Same |
| `vercel.json` cron schedule | Defines cleanup cadence | Same |
| `scripts/ops-health.js` THRESHOLDS | Encodes plan-capacity thresholds | Will be the surface for the §12.1 budget extension in the sister doc |

---

## §15 — Quick-glance cheat sheet

```
┌─────────────────────────────────────────────────────────────────────┐
│ PRODUCTION:    morning-bread-68708332                                │
│                ├─ branch:   main (primary)                           │
│                ├─ endpoint: ep-cold-waterfall-adno3ao2 (active)      │
│                ├─ endpoint: ep-royal-dawn-ad6eh8t2     (rotation)    │
│                └─ owned by: rotate-db-keys.yml (GH Actions)          │
│                                                                       │
│ PREVIEW:       hidden-mountain-87248164  (Vercel label: green-school)│
│                ├─ branches: ~10–17 (steady-state should be ≤10)      │
│                ├─ owned by: neon-branch-prune (Vercel cron)          │
│                └─ owned by: Vercel-Neon integration (auto-creates)   │
│                                                                       │
│ NOT BOUND:     neon-green-door                                       │
│                └─ visible in Vercel UI; intentionally not connected  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ NEON_PROJECT_ID    Vercel runtime env  →  hidden-mountain-87248164  │
│                    GitHub Actions env  →  morning-bread-68708332    │
│                    (intentionally different, per §7)                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## §16 — What this doc does NOT do

- ❌ No env vars (Vercel or GH Actions) touched
- ❌ No `NEON_PROJECT_ID` change on any surface
- ❌ No Neon branches deleted
- ❌ No Neon disconnect/reconnect
- ❌ No preview-branching toggle change
- ❌ No `ops:health` code change
- ❌ No workflow files modified
- ❌ No migrations / reconciliation / cron triggers
- ❌ No PR #148 / PR 5B / CRM / Sentinel work
- ❌ No source code touched
- ❌ No `scripts/ops-health.js` THRESHOLDS change
- ❌ No `memory/SESSION-*` archival docs touched
- ❌ No `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` touched

---

## §17 — Cross-references

- `docs/architecture/NEON-COST-CONTROL-POLICY.md` — sister doc; defines budget target as policy separate from plan capacity
- `NEON.md` — operational discipline (migrations, traps, change log)
- `docs/neon-launch-branch-policy-audit-2026-05-17.md` — Launch-plan threshold audit (which `NEON-COST-CONTROL-POLICY.md` reframes as "capacity, not policy")
- `docs/neon-vercel-integration-repair-plan-2026-05-17.md` **§F.8** — Vercel ↔ Neon integration deep-dive; specifically §F.8 documents that the "Branch limit exceeded" check is **stale Vercel-side state**, not actual branch exhaustion (cited in Do-Not-Fix-Blindly and Separation sections above)
- `.github/workflows/rotate-db-keys.yml` — credential rotation (this doc §8)
- `app/api/cron/neon-branch-prune/route.ts` + `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` — preview cleanup (this doc §9)
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` — describes a future 3rd Neon project (`mallan-public-records`, intentionally Free); **unrelated to mallan-nyc's production/preview pair** (see Public-Records Firewall above)
- **`docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`** — canonical chronic-incident doctrine; documents RC1–RC7 (media-sync cursor freeze, stomping, R2 retry purgatory, storage churn, held migrations, observability gap, CI Trap #2) and RC8 (Vercel-GitHub status drift, expanded in this doc's RC8 section above)
- **PR #176** (`b4f9ede0`, merged 2026-05-22) — paused `/api/cron/media-backfill` cron in `vercel.json`; first mitigation for the chronic media/Neon compute burn (see Separation section above)
- **PR #178** (`4b81dc0b`, merged 2026-05-22) — `ops-health` media-sync + storage observability; closes the RC6 observability gap (`media_sync_state` cursor staleness, listing_media coverage, R2 mirror progress, dead-tuple ratio)

---

**End of report. No env changed. No projects altered. No automation modified. Pure ownership map for review/reference.**
