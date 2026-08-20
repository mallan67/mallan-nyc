# Neon ↔ Vercel Ownership Map

> ## 🛑 AGENT STOP — Neon/Vercel database facts (read before ANY db / Neon / Vercel / deploy action)
>
> - **Canonical production data = `hidden-mountain-87248164` / "neon-green-school" / `ep-cold-waterfall-adno3ao2` / branch `main` (`br-crimson-frog-adr7g9gt`).**
> - **`morning-bread-68708332` / "mallandb" / `ep-royal-dawn-ad6eh8t2` (`br-old-tree-admdlb9z`) is STALE / DO-NOT-SERVE.**
> - **`round-recipe-12208101` / "neon-green-door" is NOT connected to mallan-nyc.**
> - **Only Vercel store bound to mallan-nyc = `store_K9l79ICRUTMsiRh2` → hidden-mountain** (store-API verified 2026-06-03); **no store binds morning-bread.**
> - **DO NOT run `rotate-db-keys`. DO NOT prune `morning-bread` to "fix" the Vercel branch-limit check** (it's a stale/false check on hidden-mountain at 2/5000). **DO NOT create Neon branches from stale/test/wip/probe Git branches.**
> - Full evidence: `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`.

**Status:** OPEN · REPORT-ONLY · No env vars changed. No projects altered. No automation modified. Sister doc: `docs/architecture/NEON-COST-CONTROL-POLICY.md`.
**Date:** 2026-05-18 · clarification patch 2026-05-22
**Author:** Claude Code under Maya direction.
**Scope:** Current ownership map of which Neon project is what, which env surface owns which value, and which automation owns which lifecycle — review any env / integration / cron change against this single table.

---

## Do Not Fix Blindly

If you're reading this because a Vercel preview build is stuck "pending" or a "Neon branching: Branch limit exceeded" check is failing, **STOP and classify the symptom first**:

| Symptom class | Indicator | Likely cause | Action |
|---|---|---|---|
| **A. Stale Vercel-Neon branch check** | "Branch limit exceeded" but `ops:health` reports `branch_prune` examined ≤ 25 and Neon Console shows ≤ baseline branches | Stale Vercel-side cache of the integration's pre-Launch-plan state | NO settings change. Refresh the Vercel preview status display only. See `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`. |
| **B. Stale Vercel-GitHub legacy `Vercel` status** (RC8) | GitHub `gh pr checks` shows `Vercel: pending` indefinitely, but actual Vercel deployment state is `READY` and `Vercel Preview Comments` check-run is `success` | Vercel posts build-start "pending" to GitHub's legacy Statuses API but never sends the success post-back. Modern Check-Runs API works fine. | Cosmetic only. Verify via Vercel Dashboard or `mcp__claude_ai_Vercel__get_deployment` that `state=READY` and merge based on Vercel-side truth. **Do not** reconnect the Vercel-GitHub integration without explicit Maya approval. |
| **C. Real failed deployment** | Vercel deployment state is `ERROR`; build logs show actual error | Genuine build/runtime failure | Inspect build logs via `mcp__claude_ai_Vercel__get_deployment_build_logs`. Fix the underlying error. |
| **D. Real Neon branch exhaustion** | `ops:health` reports `branch_prune` examined ≥ 4000 (critical) or `≥ 25` (warn); Neon Console actually shows that count | Cron not pruning OR cron pointed at wrong project (the known `NEON_PROJECT_ID` ambiguity) | First confirm cron's actual target project via Neon Console + Vercel env read. Only then act. |
| **E. Alias-stale promotion** (PR #175 pattern; added 2026-05-22) | Branch alias serves an OLDER deployment than the latest READY one; latest deployment's `alias: [...]` does not include the branch-alias hostname OR the branch alias resolves to a different older deployment; multiple commits/deployments exist on the same branch and alias promotion did not advance correctly. | Vercel-side alias-promotion drift — the build/deployment succeeded, but the branch alias did not advance to the latest READY deployment. The build itself is NOT failed. | Verify the latest READY deployment for the PR head SHA via Vercel evidence (`mcp__claude_ai_Vercel__get_deployment` or list_deployments); verify immutable preview URL and branch alias **SEPARATELY** (curl each `-I` and compare `dpl_*` they resolve to). Confirm whether the branch alias points to the latest READY deployment. **If alias is stale: do NOT treat as build failure. Do NOT rerun deployments as the "fix" — the deployment is already READY. Do NOT touch app/listing/media code, Neon, Prisma, env vars, workflows, cron, or integrations.** Prepare Vercel support evidence with: affected PR, head SHA, latest READY deployment ID, immutable preview URL, branch alias URL, which deployment the branch alias actually resolves to, expected deployment-alias mapping, actual deployment-alias mapping. |

**Do NOT (without explicit Maya approval AND symptom classification above):**
- ❌ Do not change `NEON_PROJECT_ID` on Vercel runtime or GitHub Actions
- ❌ Do not copy one `NEON_PROJECT_ID` value to the other surface, and do not use either value as proof of production ownership (see §7)
- ❌ Do not disconnect/reconnect the Vercel-Neon integration (resource id `store_K9l79ICRUTMsiRh2`)
- ❌ Do not reconnect the Vercel-GitHub integration
- ❌ Do not rotate DB credentials manually (the rotate workflow is the only authorized writer per §8)
- ❌ Do not change `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` on any surface
- ❌ Do not toggle Vercel preview-branching off (would route preview deploys at the production DB — see `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`)

**Why these guardrails exist:** `NEON_PROJECT_ID` is **not** proof of production ownership and its value may differ across the Vercel and GitHub Actions surfaces (see §7). Production DB ownership is determined by `DATABASE_URL` / `DATABASE_URL_UNPOOLED` + the connected Vercel store `store_K9l79ICRUTMsiRh2` (both → `hidden-mountain` / `cold-waterfall`). Treating the symptom by "fixing" the env without proving which symptom class is in play can corrupt production data binding or rotation lifecycle.

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

## 📋 Operational Doctrine — RC8 Vercel/GitHub Status Drift (added 2026-05-22, post-PR-#179)

Codified after PR #179 surfaced the pattern across 10+ PRs (#62, #124, #153, #160, #168, #174, #175, #176, #177, #178, #179). Maya direction: this is the **standing operational rule** for any PR or production deploy in this repo.

### Principle

**The legacy GitHub commit-status context named `Vercel` is NON-AUTHORITATIVE when it conflicts with Vercel-side READY evidence.** Proved on PR #179: the legacy preview-head `Vercel` status stayed `pending` indefinitely, while the merge commit deployed successfully and production became READY.

### Trusted readiness evidence (use these for any merge/readiness decision)

Do NOT rely on the legacy `Vercel` status context alone. Use these instead:

1. **Vercel deployment `state: "READY"`** — read via the Vercel MCP `get_deployment` call or the inspector URL.
2. **Immutable preview URL returns HTTP 200** — `curl -sI https://mallan-<hash>-mallan.vercel.app/` (or browser).
3. **Production deployment `state` when the change is being promoted to `main`** — verify the post-merge production rebuild reached READY.
4. **Deployment alias / `dpl_*` match when relevant** — confirm the branch alias actually points at the latest deployment (guards against the PR #175-style alias-stale variant; see "⚠️ Do Not Fix Blindly" classifier row **E (alias-stale promotion)**).
5. **GitHub Check-Runs API** (modern, not the legacy Statuses API) — `pr-check`, `guardrails`, `claude-review`, `Vercel Preview Comments` all reporting `conclusion: success`.
6. **Release-truth / repo-owned checks** if available (custom GitHub Actions verifying end-to-end behavior).

### Hard rule

**Do NOT rerun deployments as the "fix" for the stale legacy `Vercel` status.** PR #179 proved the deployment itself was READY; the stale signal was the post-back / status context, not the deployment. Rerunning will produce another READY deployment with the same stuck `Vercel: pending` legacy status — wasted compute, zero resolution.

### Durable fix (Maya approval required)

The persistent legacy-status drift is probably a Vercel/GitHub integration repair or a Vercel support investigation. It is **NOT** to be attempted via:

- ❌ App code, listing code, media code
- ❌ Neon, Prisma, schema, migrations
- ❌ Env vars
- ❌ GitHub Actions workflows
- ❌ Cron jobs
- ❌ Deployment reruns

**Maya-approved fixes only:**

- Inspect Vercel/GitHub integration state in the Vercel Dashboard (Settings → Git)
- Disconnect/reconnect Vercel-GitHub integration (Vercel UI; cannot be done from CLI)
- Open a Vercel support ticket

### PR #179 evidence package (for Vercel support if a ticket is opened)

Bundle this evidence for any future Vercel support ticket on the stale-status pattern:

| Field | Value |
|---|---|
| **Preview head SHA** | `4255cf3b340e19fbb2f91989dfa8932587585b21` |
| **Merge SHA** | `e53431eb713588fdcca46ecc7f15ceadfe1a88e6` |
| **Production deploy after merge** | Succeeded — production rebuild on `main` reached READY following PR #179 merge |
| **Legacy preview-head `Vercel` status** | Stayed `pending`. `updated_at` only `2026-05-22T04:11:35Z` (= build-start), never updated to success despite the Vercel deployment reaching READY ~2.5 min later. |
| **Modern Check-Runs API for same SHA** | 4/4 success: `claude-review`, `guardrails`, `pr-check`, `Vercel Preview Comments` |
| **GitHub Deployments API for same SHA** | `[]` (empty — Vercel did not register a GitHub Deployment object either) |
| **GitHub branch protection on `main`** | NOT enabled — confirmed via `gh api repos/mallan67/mallan-nyc/branches/main/protection` → `HTTP 404 "Branch not protected"`. The stale status was therefore not blocking the merge; PR #179 (and all prior in-pattern PRs) merged successfully via Vercel-side truth. |
| **Multi-PR pattern** | Same drift observed across PRs #62, #124, #153, #160, #168, #174, #175, #176, #177, #178, #179 |

Pair the table above with this single-sentence ticket summary:

> "On `mallan-nyc` (Vercel project `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`, team `team_kZQh5NYLyrOKqffK0r9EXf4E`), Vercel deployments consistently reach `state: READY` (confirmed via Vercel API and 200 OK on immutable URL + branch alias) but the legacy GitHub commit-status context named `Vercel` stays at `state: pending` indefinitely, with `updated_at` equal to build-start time. The modern Check-Runs API correctly reports success for `Vercel Preview Comments`. This pattern has held across 10+ PRs over multiple weeks. Please advise on integration repair."

### When this doctrine does NOT apply

- If the symptom is **alias-stale promotion** (the PR #175 pattern — branch alias points at an older deployment): a SEPARATE failure mode. See "⚠️ Do Not Fix Blindly" classifier row **E (alias-stale promotion)** and re-classify before any action.
- If the symptom is a **real build error** (`state: ERROR`): do NOT apply this workaround. Inspect build logs via `mcp__claude_ai_Vercel__get_deployment_build_logs`.
- If the symptom is a **real Neon branch-limit exhaustion** (verified via `ops:health` showing branch count ≥ 25 AND Neon Console confirming): see "⚠️ Do Not Fix Blindly" classifier row **D (real Neon branch exhaustion)**, not this RC8 doctrine.

---

## 🚧 Separation — Vercel/Neon branching ≠ media-cron Neon compute (added 2026-05-22)

**These are two SEPARATE incidents living at different layers. Do not conflate.**

| Incident | Layer | State | Owner |
|---|---|---|---|
| **Vercel-Neon "Branch limit exceeded" stale check** | Vercel CI integration ↔ Neon-Vercel marketplace integration | Stale UI state since plan upgrade 2026-05-17; actual branch count is **well under the 5000 Launch cap** (≈2 on `hidden-mountain` at last audit) | Vendor-side (Vercel-Managed integration `store_K9l79ICRUTMsiRh2`) |
| **Media-cron Neon compute burn (RC1 / RC3)** | Neon production workload | Real chronic — `media_sync_state.last_photos_change` cursor frozen 21 days; 149 r2_failed vs 1 r2_mirrored per 24h before mitigation | mallan-nyc cron (`/api/cron/media-sync` + `/api/cron/media-backfill`) |

**The media-cron compute burn is a PROVEN compute risk** (see canonical incident doc) but it is **NOT proven to cause** the Vercel-Neon preview branching status. The two share no causal path:

- Media cron writes to the canonical production project (`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`).
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
| **Neon project** | `hidden-mountain-87248164` ("neon-green-school"), Launch plan |
| **Compute endpoint / host** | `ep-cold-waterfall-adno3ao2` (`ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`) |
| **Branch** | `main` (`br-crimson-frog-adr7g9gt`) |
| **What lives here** | All production app data: `Listing`, `ListingMedia`, `Agent`, `Lead`, `Deal`, `CommissionPayment`, `AuditEvent`, … (60 Prisma models per `prisma/schema.prisma`) |
| **Read / written by** | App code via Prisma (`lib/prisma.ts` → bare `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, repointed here 2026-06-02) + crons + operator scripts |
| **Stale / do-not-serve sibling (a DIFFERENT Neon project)** | `morning-bread-68708332` ("mallandb") / `ep-royal-dawn-ad6eh8t2` (`br-old-tree-admdlb9z`, Free) — kept only as PITR/rollback; never serve from it. It is **not** a second endpoint on this branch. |

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
| `DATABASE_URL` | Production | Pooled connection string for the `ep-cold-waterfall-adno3ao2` endpoint on **`hidden-mountain-87248164`** (repointed 2026-06-02) | `lib/prisma.ts`, `lib/db.ts`, `scripts/ops-health.js`, 9 other call sites |
| `DATABASE_URL_UNPOOLED` | Production | Direct (unpooled) connection string for the same `cold-waterfall` endpoint on `hidden-mountain-87248164` | `scripts/batch-geocode.js`, `scripts/import-past-deals.js` |
| `ASSISTANT_DATABASE_URL` | Production | Same shape as `DATABASE_URL` | **Zero readers** in app source — flagged dead (no `process.env.ASSISTANT_DATABASE_URL` in code) |
| `NEON_API_KEY` | Production | Neon API token with `branches:write` scope | `app/api/cron/neon-branch-prune/route.ts` (the prune cron) |
| `NEON_PROJECT_ID` | Production | **May still be set to `morning-bread` in some legacy automation paths; do NOT use it as proof of production ownership.** Production runtime DB ownership is determined by `DATABASE_URL` / `DATABASE_URL_UNPOOLED` + the connected Vercel store `store_K9l79ICRUTMsiRh2`, both now → `hidden-mountain` / `cold-waterfall`. | `app/api/cron/neon-branch-prune/route.ts` |
| `CRON_SECRET` | Production | Cron auth header value | Every `app/api/cron/*/route.ts` |
| `database_*` integration vars (`database_DATABASE_URL`, `POSTGRES_*`, etc.) | Production/Preview/Dev | Auto-managed by the connected Vercel store `store_K9l79ICRUTMsiRh2` → **`hidden-mountain-87248164`** | **Zero readers** in app source (app reads the bare `DATABASE_URL`, not these) |

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
| `AUDIT_*` (var) | actions vars | **Orphaned** — were the audit-bot config (email, cadence, SMTP); the consuming `repo-audit-bot` workflow was decommissioned 2026-07-25, so these actions vars are no longer read by any workflow | *(no consumer — decommissioned)* |
| `NEON_PREVIEW_PROJECT_ID` | **actions var** (not secret) | **`hidden-mountain-87248164`** — the **CANONICAL PRODUCTION** project, which ALSO hosts the PR preview branches (they share one project; live-verified on the Neon control plane 2026-08-20). The `PREVIEW` in the variable name is a **legacy misnomer** — renaming a repo variable is a settings change, so the name stayed — and it does **not** denote a separate preview project. Added 2026-06-01 for Tier 2 cleanup; distinct from `NEON_PROJECT_ID`, which in Actions points at the **stale legacy** `morning-bread-68708332` and is **not** production (see the correction two rows below). | `.github/workflows/cleanup-neon-preview-branch.yml` |
| `NEON_PREVIEW_API_KEY` | secret | Neon key scoped to `hidden-mountain-87248164` — i.e. **the canonical production project** (same legacy misnomer as the row above). Added 2026-06-01 for Tier 2 cleanup; distinct from the `NEON_API_KEY` credential-rotation key. Because this key can delete branches in the project that holds production `main` (`br-crimson-frog-adr7g9gt`, which Neon reports as `protected: false`), the consuming workflow refuses that branch by **name and by id** — see its header. | `.github/workflows/cleanup-neon-preview-branch.yml` |

### Key ownership rule

**`NEON_PROJECT_ID` is NOT proof of production ownership.** The GitHub Actions value is `morning-bread-68708332` (the legacy rotation target); the Vercel runtime value may also still be `morning-bread` in legacy automation paths. Either way, **production DB ownership is determined by `DATABASE_URL` / `DATABASE_URL_UNPOOLED` and the connected Vercel store `store_K9l79ICRUTMsiRh2`, both now → `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`** — NOT by `NEON_PROJECT_ID`. Do not rename, copy, or "fix" `NEON_PROJECT_ID` to infer ownership.

### Do NOT do
- Do NOT change `NEON_PROJECT_ID` on either surface
- Do NOT set the same value on both surfaces without explicit cause
- Do NOT remove `ASSISTANT_DATABASE_URL` (the rotate workflow still writes it) — it's likely dead but removal requires confirming via full source grep first

---

## §8 — Credential rotation owner

| Field | Value |
|---|---|
| **Owner file** | `.github/workflows/rotate-db-keys.yml` |
| **Status** | ⛔ **SCHEDULE DISABLED** (PR #321; `workflow_dispatch`-only). DO NOT run until retargeted + host-guarded. |
| **Target project (must become)** | `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`. The rotation workflow is still hardcoded to the legacy `morning-bread` project and **must** be retargeted before any re-enable. |
| **Required before re-enable** | retarget to cold-waterfall + a fail-closed host guard (`docs/rotate-db-keys-host-guard-patch-2026-06-02.md`). |
| **What it did** | Reset the `neondb_owner` password, pulled new connection URIs, wrote the 3 bare DB env vars, redeployed. (This is exactly the path that mis-cut production onto royal-dawn on 2026-06-01 — hence disabled.) |
| **History** | Last known-good rotation 2026-03-01; the 2026-06-01 06:35Z run caused the cross-project DB incident (`docs/incidents/2026-06-02-cross-project-db-repoint.md`). |

### Rotation owner rules
- This workflow is the ONLY system authorized to write `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` to GH secrets + Vercel env. Manual edits to those values are forbidden.
- The workflow does NOT touch the preview/integration project (`hidden-mountain-87248164`). Preview branches use the integration's auto-managed lowercase vars.

---

## §9 — Preview branch cleanup owner

There are **two cleanup mechanisms** in play, coexisting as defense-in-depth. Mechanism A (Vercel-managed, vendor-side) operates on the connected store's project (`hidden-mountain-87248164`). Mechanism B (our prune cron) targets whatever `NEON_PROJECT_ID` resolves to at runtime, which the code does **not** independently verify (see Mechanism B + §7) — do **not** assume the two mechanisms target the same project until the Phase 2 fail-closed guard is in place.

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
| **Target Neon project** | **Runtime `NEON_PROJECT_ID`.** `app/api/cron/neon-branch-prune/route.ts` reads `process.env.NEON_PROJECT_ID` and passes that exact value to `pruneBranches()`, so the prune target is whatever `NEON_PROJECT_ID` resolves to at runtime. The current code does **not** independently verify the project — **treat this as unsafe until Phase 2 adds a fail-closed allowlist guard.** Do **not** use `NEON_PROJECT_ID` as proof of production ownership (ownership = `DATABASE_URL` / `DATABASE_URL_UNPOOLED` + the connected Vercel store — see §7). |
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
PRODUCTION:    hidden-mountain-87248164 / neon-green-school / ep-cold-waterfall-adno3ao2 / main (br-crimson-frog-adr7g9gt), Launch
               DATABASE_URL / DATABASE_URL_UNPOOLED point here (repointed 2026-06-02)

CONNECTED VERCEL STORE:  store_K9l79ICRUTMsiRh2  ->  hidden-mountain-87248164
               (this same project is also where Vercel-Neon creates preview branches)

STALE / DO-NOT-USE (a SEPARATE Neon project, NOT an endpoint on the above):
               morning-bread-68708332 / mallandb / ep-royal-dawn-ad6eh8t2 / main (br-old-tree-admdlb9z), Free
               kept only as PITR/rollback; never serve from it

NOT CONNECTED: round-recipe-12208101 / neon-green-door  (visible in Vercel UI, intentionally not connected)

RULES:
  - Do not run rotate-db-keys (disabled until retargeted to cold-waterfall + a fail-closed host guard).
  - Do not prune morning-bread to "fix" the Vercel branch-limit check.
  - Do not create Neon branches from stale/test/wip/probe Git branches.
  - Require Active Resource Before Deploy stays OFF; production database branch creation stays OFF.
  - NEON_PROJECT_ID may still say morning-bread in legacy automation - NOT proof of production ownership.
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
- ❌ No PR #148 / PR 5B / CRM work
- ❌ No source code touched
- ❌ No `scripts/ops-health.js` THRESHOLDS change
- ❌ No `memory/SESSION-*` archival docs touched
- ❌ No `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` touched

---

## §17 — Cross-references

- `docs/architecture/NEON-COST-CONTROL-POLICY.md` — sister doc; defines budget target as policy separate from plan capacity
- `NEON.md` — operational discipline (migrations, traps, change log)
- (deleted 2026-06-03) Launch-plan threshold audit — reframed by `NEON-COST-CONTROL-POLICY.md` as "capacity, not policy"
- (deleted 2026-06-03) Vercel ↔ Neon integration deep-dive — the "Branch limit exceeded" check is **stale Vercel-side state**, not actual branch exhaustion; canonical status now in `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`
- `.github/workflows/rotate-db-keys.yml` — credential rotation (this doc §8)
- `app/api/cron/neon-branch-prune/route.ts` + `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` — preview cleanup (this doc §9)
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` — describes a future 3rd Neon project (`mallan-public-records`, intentionally Free); **unrelated to mallan-nyc's production/preview pair** (see Public-Records Firewall above)
- **`docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`** — canonical chronic-incident doctrine; documents RC1–RC7 (media-sync cursor freeze, stomping, R2 retry purgatory, storage churn, held migrations, observability gap, CI Trap #2) and RC8 (Vercel-GitHub status drift, expanded in this doc's RC8 section above)
- **PR #176** (`b4f9ede0`, merged 2026-05-22) — paused `/api/cron/media-backfill` cron in `vercel.json`; first mitigation for the chronic media/Neon compute burn (see Separation section above)
- **PR #178** (`4b81dc0b`, merged 2026-05-22) — `ops-health` media-sync + storage observability; closes the RC6 observability gap (`media_sync_state` cursor staleness, listing_media coverage, R2 mirror progress, dead-tuple ratio)
- **PR #179** (`e53431eb`, merged 2026-05-22) — `NEON-VERCEL-OWNERSHIP-MAP` clarification (Do-Not-Fix-Blindly + RC8 + separation + public-records firewall); the **canonical case study** for the Operational Doctrine section above (preview-head `Vercel` status stayed `pending` while merge commit deployed READY)

---

**End of report. No env changed. No projects altered. No automation modified. Pure ownership map for review/reference.**
