# Neon ↔ Vercel Ownership Map

**Status:** OPEN · REPORT-ONLY · No env vars changed. No projects altered. No automation modified. Sister doc: `docs/architecture/NEON-COST-CONTROL-POLICY.md`.
**Date:** 2026-05-18
**Author:** Claude Code under Maya direction.
**Scope:** Definitive map of which Neon project is what, which env surface owns which value, which automation owns which lifecycle. The map exists so any future change to env / integration / cron can be reviewed against a single ownership table.

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
- `docs/neon-vercel-integration-repair-plan-2026-05-17.md` — Vercel ↔ Neon integration deep-dive (the support-packet path)
- `.github/workflows/rotate-db-keys.yml` — credential rotation (this doc §8)
- `app/api/cron/neon-branch-prune/route.ts` + `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` — preview cleanup (this doc §9)
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` — describes a future 3rd Neon project (`mallan-public-records`, intentionally Free); unrelated to mallan-nyc's production/preview pair

---

**End of report. No env changed. No projects altered. No automation modified. Pure ownership map for review/reference.**
