# Neon ↔ Vercel Ownership Map

> ## 🛑 AGENT STOP — current authority rules (2026-09-18)
>
> - **GitHub is repository truth.** This document is a map, not a substitute for current GitHub/Vercel/Neon reads.
> - **Canonical Production binding:** Vercel `mallan-nyc` → `neon-green-school` /
>   `store_K9l79ICRUTMsiRh2` → Neon `hidden-mountain-87248164` → `main`
>   (`br-crimson-frog-adr7g9gt`) → `ep-cold-waterfall-adno3ao2`.
> - **Stale / DO-NOT-SERVE:** `morning-bread-68708332` / `ep-royal-dawn-ad6eh8t2`.
> - **`round-recipe-12208101` is UNVERIFIED**, not proven disconnected; it is not visible in the currently
>   accessible Neon orgs. Do not turn invisibility into an ownership claim.
> - **Branch history is not established by the 2026-09-18 current/deleted enumeration.** It returned
>   only `main`, while repository evidence records 8 branches on 2026-05-17 and approximately 40 on
>   2026-06-01. Current topology must be re-read through the Vercel-managed resource.
> - **Direct Neon control is quarantined.** The old prune/cleanup/rotation paths are not current
>   lifecycle authority and may not mutate Neon directly.
> - The Vercel-managed Neon entry path is `vercel integration open neon neon-green-school` (SSO).
> - Do not change DB env, resource scope, Neon settings, branch lifecycle, or rotation without Maya approval.
>
**Status:** OPEN · REPORT-ONLY · No env vars changed. No projects altered. No automation modified. Sister doc: `docs/architecture/NEON-COST-CONTROL-POLICY.md`.
**Date:** 2026-05-18 · clarification patch 2026-05-22
**Author:** Claude Code under Maya direction.
**Scope:** Current ownership map of which Neon project is what, which env surface owns which value, and which automation owns which lifecycle — review any env / integration / cron change against this single table.

---

## Do Not Fix Blindly

If you're reading this because a Vercel preview build is stuck "pending" or a "Neon branching: Branch limit exceeded" check is failing, **STOP and classify the symptom first**:

| Symptom class | Indicator | Likely cause | Action |
|---|---|---|---|
| **A. Stale Vercel-Neon branch check** | "Branch limit exceeded" while the current Vercel-managed Neon resource does not substantiate an actual branch-limit condition | Stale/incorrect integration state is possible; historical prune-audit counts are not current proof | NO direct-Neon settings change. Re-read the Vercel-managed resource and deployment evidence first. |
| **B. Stale Vercel-GitHub legacy `Vercel` status** (RC8) | GitHub `gh pr checks` shows `Vercel: pending` indefinitely, but actual Vercel deployment state is `READY` and `Vercel Preview Comments` check-run is `success` | Vercel posts build-start "pending" to GitHub's legacy Statuses API but never sends the success post-back. Modern Check-Runs API works fine. | Cosmetic only. Verify via Vercel Dashboard or `mcp__claude_ai_Vercel__get_deployment` that `state=READY` and merge based on Vercel-side truth. **Do not** reconnect the Vercel-GitHub integration without explicit Maya approval. |
| **C. Real failed deployment** | Vercel deployment state is `ERROR`; build logs show actual error | Genuine build/runtime failure | Inspect build logs via `mcp__claude_ai_Vercel__get_deployment_build_logs`. Fix the underlying error. |
| **D. Real Neon branch exhaustion** | The authorized Vercel-managed Neon resource itself shows a branch/capacity condition | Provider lifecycle/capacity issue | Diagnose through the Vercel-managed resource. Do not reactivate the retired direct-Neon prune path. |
| **E. Alias-stale promotion** (PR #175 pattern; added 2026-05-22) | Branch alias serves an OLDER deployment than the latest READY one; latest deployment's `alias: [...]` does not include the branch-alias hostname OR the branch alias resolves to a different older deployment; multiple commits/deployments exist on the same branch and alias promotion did not advance correctly. | Vercel-side alias-promotion drift — the build/deployment succeeded, but the branch alias did not advance to the latest READY deployment. The build itself is NOT failed. | Verify the latest READY deployment for the PR head SHA via Vercel evidence (`mcp__claude_ai_Vercel__get_deployment` or list_deployments); verify immutable preview URL and branch alias **SEPARATELY** (curl each `-I` and compare `dpl_*` they resolve to). Confirm whether the branch alias points to the latest READY deployment. **If alias is stale: do NOT treat as build failure. Do NOT rerun deployments as the "fix" — the deployment is already READY. Do NOT touch app/listing/media code, Neon, Prisma, env vars, workflows, cron, or integrations.** Prepare Vercel support evidence with: affected PR, head SHA, latest READY deployment ID, immutable preview URL, branch alias URL, which deployment the branch alias actually resolves to, expected deployment-alias mapping, actual deployment-alias mapping. |

**Do NOT (without explicit Maya approval AND symptom classification above):**
- ❌ Do not change `NEON_PROJECT_ID` on Vercel runtime or GitHub Actions
- ❌ Do not copy one `NEON_PROJECT_ID` value to the other surface, and do not use either value as proof of production ownership (see §7)
- ❌ Do not disconnect/reconnect the Vercel-Neon integration (resource id `store_K9l79ICRUTMsiRh2`)
- ❌ Do not reconnect the Vercel-GitHub integration
- ❌ Do not rotate DB credentials manually; the old direct-Neon rotate workflow is quarantined and is not an authorized writer
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
- If the symptom is a **real Neon branch-limit exhaustion** (verified via `ops:health` showing branch count ≥ 25 AND confirmation inside the resource opened through Vercel SSO, never a direct Neon Console login): see "⚠️ Do Not Fix Blindly" classifier row **D (real Neon branch exhaustion)**, not this RC8 doctrine.

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

Any separate public-records project must remain operationally isolated. Mallan-nyc lifecycle/rotation is **not** owned by direct-Neon workflows or bare `NEON_PROJECT_ID`; those paths are quarantined.

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

## §6 — Current Vercel ↔ Neon resource topology

| Field | Current measured state |
|---|---|
| Vercel project | `mallan-nyc` / `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` |
| Neon Marketplace resource | `neon-green-school` / `store_K9l79ICRUTMsiRh2` |
| Neon project | `hidden-mountain-87248164` |
| Production branch | `main` / `br-crimson-frog-adr7g9gt` |
| Production endpoint identity | `ep-cold-waterfall-adno3ao2` |
| Resource environment connection | All Environments at time of 2026-09-18 audit; re-read live before changing |
| Branch history in Production project | **UNVERIFIED as lifetime history.** 2026-09-18 current/deleted response returned `main` only; historical repo evidence records 8 branches (2026-05-17) and ~40 (2026-06-01). |
| Vercel SSO entry | `vercel integration open neon neon-green-school` |

The old statement that Preview branches "live here" is superseded. Historical auto-created Preview branches are
in the stale `morning-bread` project, not in current Production.

## §7 — Environment ownership: measured vs unverified

### Vercel project environment

| Variable/family | Current measured state | Reader/owner |
|---|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Production | canonical `cold-waterfall` | Prisma/runtime + scripts |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Development | also canonical Production today — **known defect** | Prisma/runtime |
| generic Preview bare DB URLs | absent/fail-closed | Prisma/runtime |
| historical branch-scoped bare DB overrides | five branch configurations; empty/dead/temp-QA provenance established; cleanup pending | manually-created Vercel project vars |
| `database_*` family | generated by Vercel Neon Marketplace connection; currently spans Production/Preview/Development | **integration-owned**; do not hand-edit individual members |
| `database_NEON_PROJECT_ID` | `hidden-mountain-87248164` | integration-owned metadata |
| bare `NEON_PROJECT_ID` — Production | historical/direct-control variable; current value is not lifecycle authority | retired/quarantined direct-Neon path |
| bare `NEON_API_KEY` — Production | historical/direct-control variable; current value is not lifecycle authority | retired/quarantined direct-Neon path |
| `ASSISTANT_DATABASE_URL` | present on multiple scopes; final reader/owner disposition unresolved | trace before cleanup |

**Presence in `vercel env ls` is not proof of a usable value.** Empty encrypted variables have existed here.
Use an effective environment read when the value class matters; never print credentials.

### GitHub Actions variables/secrets

Current secret/variable **values are not readable through the GitHub connector used for this audit**. Workflow
source proves readers/writers; historical logs may provide evidence about past values, but are not current-state
authority. Therefore old rows asserting current GitHub Action values (for example "NEON_PROJECT_ID =
morning-bread") are superseded unless re-proven from an authorized current surface.

### Ownership rule

Production DB authority is the reconciled bare Prisma URL endpoint identity plus the bound Vercel Marketplace
resource. `NEON_PROJECT_ID`, prefixed Marketplace variables, a workflow variable, or an old audit cannot
independently establish runtime DB authority.

## §8 — Credential rotation

`.github/workflows/rotate-db-keys.yml` was DELETED on 2026-09-20 (PR #632). It is not a Production-capable operating path and it no longer exists. Packet 1
added a fail-closed canonical-host preflight guard. Do not dispatch it merely because an old ownership-map row
says rotation is due. Before any future run, re-read the current workflow HEAD and current Production binding,
and obtain Maya's explicit authorization.

Historical rotation incidents remain evidence; they are not instructions to copy old env values.

## §9 — Preview branch cleanup

### Repo-side prune path — DELETED

There is no repo-side prune path. On 2026-09-20 (PR #632) these were removed from the repository
outright, not disabled and not left as tombstones:

- `app/api/cron/neon-branch-prune/route.ts` and its Vercel cron schedule
- `lib/neon/branches.ts`
- `scripts/neon-prune-branches.ts`
- `scripts/branch-prune-health.js`
- `.github/workflows/cleanup-neon-preview-branch.yml`
- `.github/workflows/rotate-db-keys.yml`

`scripts/ci/mallan-execution-control.mjs` refuses their return, and refuses any new file that
reaches the Neon control plane under a different name. Branch and resource lifecycle is observed
through the Vercel-managed Marketplace resource; a replacement capability must be designed against
that contract and separately authorized.

Historical, 2026-09-18: the Production control-plane variables `NEON_API_KEY` and
`NEON_PROJECT_ID` were measured empty, which made the then-existing scheduled route inert.
That is a dated pre-deletion record. It describes nothing current: the route, the cron
schedule, the operator CLI and the shared pruning library were DELETED on 2026-09-20, so
there is no scheduled writer to be inert and no operator script to be reachable. At the
current head no tracked file reads either variable.

### Vercel-managed Preview lifecycle

Do not assume automatic Preview branches are functioning for the current project: current branch
topology is **UNVERIFIED**, because it is not exposed through the authorized Vercel-managed path,
and a bounded historical observation never established lifetime topology in either direction.
Environments must be read live before any Preview-branching design change.

Do not delete cleanup code merely because provisioning is currently broken; first decide the intended Preview
topology and then reconcile creator + cleanup + health semantics together.

## §11 — Files requiring cost-impact review (cross-reference)

The full list is in `NEON-COST-CONTROL-POLICY.md` §11. Highlights for the ownership-map context:

| File | Cost impact | Why it's an ownership-map concern |
|---|---|---|
| `.github/workflows/rotate-db-keys.yml` | **DELETED 2026-09-20 (PR #632); the execution gate refuses its return under any filename** | The file does not exist |
| `app/api/cron/neon-branch-prune/route.ts` | **DELETED 2026-09-20 (PR #632); the execution gate refuses its return under any filename** | The file does not exist |
| `lib/neon/branches.ts` | `DEFAULT_RETENTION_HOURS` defines steady-state count | Same |
| `vercel.json` cron schedule | Defines cleanup cadence | Same |
| `scripts/ops-health.js` THRESHOLDS | Encodes plan-capacity thresholds | Will be the surface for the §12.1 budget extension in the sister doc |

---

## §15 — Quick-glance cheat sheet

```
REPO AUTHORITY:
  GitHub current branch / PR HEAD. Do not use Desktop copies/worktrees as truth.

PRODUCTION DB:
  Vercel mallan-nyc
    -> neon-green-school / store_K9l79ICRUTMsiRh2
    -> hidden-mountain-87248164
    -> main / br-crimson-frog-adr7g9gt
    -> ep-cold-waterfall-adno3ao2

STALE / REFUSE:
  morning-bread-68708332 / ep-royal-dawn-ad6eh8t2

CURRENT BRANCH REALITY:
  2026-09-18 current/deleted enumeration returned main only.
  That bounded response does not establish lifetime history.
  Re-read current topology through the Vercel-managed resource before acting.

CURRENT VERCEL DB RISK:
  Development bare DATABASE_URL* still targets Production.
  Generic Preview bare DATABASE_URL* is fail-closed.
  database_* is Marketplace-owned and spans environments until the resource scope is reconciled.

DIRECT-NEON PRUNE:
  retired/quarantined; no Vercel cron schedule.
  ops:health does not use historical prune audit events as current branch proof.

ACCESS:
  vercel integration open neon neon-green-school
  -> Vercel SSO into the bound Neon project.

UNVERIFIED:
  round-recipe-12208101 ownership/connectivity.
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
- `.github/workflows/rotate-db-keys.yml` — DELETED 2026-09-20; no credential-rotation path exists
- `app/api/cron/neon-branch-prune/route.ts` + `scripts/neon-prune-branches.ts` — DELETED 2026-09-20; not present in the repository
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` — describes a future 3rd Neon project (`mallan-public-records`, intentionally Free); **unrelated to mallan-nyc's production/preview pair** (see Public-Records Firewall above)
- **`docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`** — canonical chronic-incident doctrine; documents RC1–RC7 (media-sync cursor freeze, stomping, R2 retry purgatory, storage churn, held migrations, observability gap, CI Trap #2) and RC8 (Vercel-GitHub status drift, expanded in this doc's RC8 section above)
- **PR #176** (`b4f9ede0`, merged 2026-05-22) — paused `/api/cron/media-backfill` cron in `vercel.json`; first mitigation for the chronic media/Neon compute burn (see Separation section above)
- **PR #178** (`4b81dc0b`, merged 2026-05-22) — `ops-health` media-sync + storage observability; closes the RC6 observability gap (`media_sync_state` cursor staleness, listing_media coverage, R2 mirror progress, dead-tuple ratio)
- **PR #179** (`e53431eb`, merged 2026-05-22) — `NEON-VERCEL-OWNERSHIP-MAP` clarification (Do-Not-Fix-Blindly + RC8 + separation + public-records firewall); the **canonical case study** for the Operational Doctrine section above (preview-head `Vercel` status stayed `pending` while merge commit deployed READY)

---

**End of report. No env changed. No projects altered. No automation modified. Pure ownership map for review/reference.**
