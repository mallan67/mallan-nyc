# Neon-Vercel "Branch limit exceeded" — false-check investigation & mitigation (2026-06-01)

**Status:** Mitigated (non-blocking). Root cause is a **Vercel-side** integration check bug; only Vercel can remove the red ❌.
**Scope of this doc:** record only. No app code, settings, env vars, branches, deployments, or credentials were changed by writing this file.
**Related:** `NEON.md` §10 (change log) + §11 (preview-branch architecture) · `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` · `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8

---

## 1. Root issue

The Vercel-managed Neon integration runs a per-deployment check, **"Neon branching: Branch limit exceeded"**, that **falsely fails** even though:

- The bound Neon project is on **Launch** with a **branch limit of 5000**, and
- Branch creation actually **succeeds** (the deploy's new Neon branch is created and reaches `ready`).

The check fails *after* the resource it gates is successfully provisioned → it is a stale/buggy Vercel-side check, **not** real branch exhaustion.

## 2. Identity / bindings (verified live)

| Thing | Value |
|---|---|
| Vercel project | `mallan-nyc` / `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` |
| Vercel team | `team_kZQh5NYLyrOKqffK0r9EXf4E` |
| Vercel-managed Neon store/resource | `store_K9l79ICRUTMsiRh2` |
| Bound preview Neon project | `hidden-mountain-87248164` (Vercel label **neon-green-school**) |
| Owning Neon org | `org-wild-king-99967357` ("Vercel: maya") |
| Production Neon project (separate) | `morning-bread-68708332` (**mallandb**) — personal org `org-old-tooth-88806088`, Free tier, **do not touch** |
| Orphan/duplicate (leave alone) | `round-recipe-12208101` (neon-green-door) — not connected |

## 3. Evidence the check is false

- **Neon-side limit is 5000.** `neonctl projects get hidden-mountain-87248164` → `owner.branches_limit = 5000`, `subscription_type = launch_v3`. Vercel Storage UI also shows **Plan: Launch**.
- **Actual branch count during test: ~40** — far below 5000.
- **Fresh branch created + ready.** A throwaway test deploy created Neon branch `preview/test/neon-metadata-refresh` (branch #40) which reached `ready` state → no real exhaustion.
- **Metadata refresh did not help.** *Update Project Connection* (re-synced the `database_*` env vars; confirmed re-written) left the red check unchanged.

## 4. What was changed (Vercel Storage UI → neon-green-school → Update Project Connection; Maya, manual)

1. **Create Database Branch For Deployment → Production unchecked** (Preview still checked).
   - *Why:* production deploys were minting throwaway Neon branches production never uses (prod reads `morning-bread` via the uppercase `DATABASE_URL`). Pure churn reduction.
2. **Require Active Resource Before Deploy → OFF.**
   - *Why:* makes the false Neon check **non-blocking** so deploys complete and the branch alias / custom-domain step runs instead of being skipped.

Environments stayed **All Environments**; prefix `database`; Sensitive **OFF**. No env var, production DB, Neon branch, deployment, or credential was changed.

## 5. Result (verified)

| Item | Result |
|---|---|
| Test deployment | `dpl_AUCCNDFtkDAQier4WcJtPjFWEa2d` → **READY** |
| Branch alias | `mallan-nyc-git-test-neon-require-resource-off-mallan.vercel.app` — assigned |
| "Neon branching: Branch limit exceeded" | ❌ **still renders, but now NON-BLOCKING** |
| Assigning Custom Domains / alias | **Completes** (was "Skipped" under Require=ON) |
| Preview `/api/health` | **200** (`{"success":true}`) |
| Production `/api/health` | **200** throughout |
| Merge gating | Not affected — the check is not a required GitHub status; `main` has no branch protection |

## 6. Steady-state — do we need to keep cleaning this?

**No manual cleaning required.**
- Preview branches auto-clean via the daily `neon-branch-prune` cron (24h retention) — see `NEON.md` §11.
- Production per-deploy branch creation is now OFF → lower churn.
- The red ❌ keeps appearing per preview deploy but is **non-blocking** — no per-deploy action needed.

## 7. Do-not-touch list

- ❌ Production `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (Production-scoped, manual; → `morning-bread`)
- ❌ `morning-bread-68708332` (production DB)
- ❌ `hidden-mountain-87248164` / neon-green-school project itself (only the per-deploy toggles were changed)
- ❌ `main` branch on any Neon project
- ❌ Manual Neon branch deletion (the prune cron owns this)
- ❌ Credentials / `NEON_API_KEY` / `NEON_PROJECT_ID` / rotation secrets

## 8. Rollback

If the non-blocking behavior ever needs reverting:
- Vercel Storage → neon-green-school → Projects → mallan-nyc → ⋮ → Update Project Connection → **Require Active Resource Before Deploy → ON**, Save.
- **Expect the stale check to block alias / custom-domain assignment again** (the "Skipped" behavior returns). That is the only reason to revert.
- Re-checking "Production" under Create Database Branch is not recommended (re-introduces unused-branch churn).

## 9. The only real fix — Vercel support

The red ❌ itself is generated by Vercel's integration and **cannot be removed by any project setting.** Removing/fixing it requires Vercel integration engineering.

**Evidence packet to send (HELD until Maya submits):**
- Store `store_K9l79ICRUTMsiRh2`; project `hidden-mountain-87248164` / neon-green-school; team `team_kZQh5NYLyrOKqffK0r9EXf4E`.
- Neon reports `branches_limit=5000` (`launch_v3`); ~40 branches; a fresh deploy created branch #40 which reached `ready`.
- Metadata re-sync (Update Project Connection) did not clear the check.
- Deploy `dpl_AUCCNDFtkDAQier4WcJtPjFWEa2d` reached READY; preview + production `/api/health` 200.
- Ask: confirm which project ID / branch-limit value the deployment check evaluates for this store; refresh the cached metadata; if not flushable, **escalate to integration engineering to fix/disable the false check.**

## 10. History pointer

This is the continuation of the 2026-05-17 finding (`NEON.md` §10 entry + `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8), which first identified the check as stale Vercel-side state. The 2026-06-01 work confirmed it with a live create-branch test and reduced it to non-blocking.

---

## 11. Tier 2 stabilization — durable cleanup automation

**Goal:** make the working state durable: keep *Require Active Resource OFF*, auto-clean preview branches at PR close, and document the false check as known/non-blocking while keeping production isolated.

### Cleanup automation
- **Workflow:** `.github/workflows/cleanup-neon-preview-branch.yml`
- **Trigger:** `pull_request: [closed]` (merged or not).
- **Action:** a fail-closed **guard step** followed by a **controlled Neon API call** (list → exact-match → delete). *(Switched from the official `neondatabase/delete-branch-action@v3` + `continue-on-error` per Codex review on PR #315: a blanket `continue-on-error` masked auth/permission failures, so the workflow could report success while silently never deleting. The controlled call instead **fails hard** on missing key / auth / list / delete errors and tolerates **only** a genuinely-absent branch.)*
- **Deletes only:** `preview/<head_ref>` on the **preview** project (exact name match; `primary==false && protected==false`).
- **Complements** (does not replace) the daily `neon-branch-prune` cron (`app/api/cron/neon-branch-prune/route.ts`, 24h retention). The cron is the safety net; this workflow is the immediate, PR-scoped clean.

### Production-isolation design (why it is safe)
- Uses **dedicated, preview-only** credentials — never the production-pointing ones:
  - `vars.NEON_PREVIEW_PROJECT_ID` (must equal `hidden-mountain-87248164`)
  - `secrets.NEON_PREVIEW_API_KEY`
- Hard-pins the preview project and **refuses** to run if it is empty, equals production (`morning-bread-68708332`), or is anything other than `hidden-mountain-87248164`.
- **Refuses** protected branch names (`main`, `master`, `production`, `preview/main`) and suspicious refs containing `..`, `~`, `^`, `:`, `\`, `[`, `]`, `{`, `}`, or spaces.
- Skips fork PRs; `permissions: contents: read`; reads `head_ref` via env (no shell injection); **trims stray whitespace** on the project id (a trailing newline in the GitHub secret broke the exact-match guard in the PR #316 smoke test); prints no secrets (no `set -x` / `curl -v`; GitHub masks).
- **Fail-loud, not silent:** missing/wrong API key or any non-200 list/delete response **fails the run** (not masked). The *only* tolerated no-op is "branch genuinely not found."

### Required GitHub configuration (Maya adds; HELD until then)
| Item | Type | Value |
|---|---|---|
| `NEON_PREVIEW_PROJECT_ID` | **Variable** (or repo Secret — workflow accepts either via `vars.X \|\| secrets.X`) | `hidden-mountain-87248164` |
| `NEON_PREVIEW_API_KEY` | **Secret** | a Neon key that can manage `hidden-mountain` (ideally an org key for "Vercel: maya", which structurally cannot reach production) |

> ⚠️ Do **not** reuse `vars.NEON_PROJECT_ID` (= production `morning-bread-68708332`) or `secrets.NEON_API_KEY` (production rotation key) — see `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` §7.

### Pre-enable read-only key test
```bash
# Confirms the key can LIST (read-only) the PREVIEW project and does NOT expose production.
curl -s "https://console.neon.tech/api/v2/projects/hidden-mountain-87248164/branches" \
  -H "Authorization: Bearer $NEON_PREVIEW_API_KEY" | jq '.branches[] | {name, primary, protected}'
```
Expect: a branch list including `preview/*` entries. (Do not run any delete during verification.)

### First-test procedure (after secrets added)
1. Open a throwaway PR from a branch like `test/neon-cleanup-smoke` (let it produce a preview deploy → a `preview/test/neon-cleanup-smoke` Neon branch is created).
2. **Close** the PR.
3. Confirm the workflow run deletes **only** `preview/test/neon-cleanup-smoke` (read-only Neon list before/after).
4. Confirm the **production** project `morning-bread-68708332` branch count is **unchanged**.
5. Confirm **no secret values** appear in the workflow logs.
6. Delete the throwaway git branch.

---

## 12. Tier 1 — future migration (separately approved)

The durable architectural fix is to move from the **Vercel-Managed** integration to the **Neon-Managed Vercel integration**, which puts branch-limit/billing metadata under Neon's control and uses git-branch-based cleanup — likely retiring the false check entirely (after which *Require Active Resource* could return to ON). This is a larger change requiring its own plan + maintenance window and explicit Maya approval. High-level checklist:
1. Record current `DATABASE_URL` values (production + preview) — do not print secrets.
2. Install the Neon-Managed integration; link the existing `hidden-mountain-87248164` project.
3. Enable automatic obsolete-branch cleanup.
4. Verify env-var injection on a preview deploy; monitor ~1 week.
5. Disconnect the old Vercel-Managed integration; remove the Tier 2 workaround if no longer needed.

**Do-not-touch (Tier 1 & 2):** production `DATABASE_URL`/`DATABASE_URL_UNPOOLED`, `morning-bread-68708332`, the `green-school` project itself, any `main`/primary branch, manual Neon branch deletion (cron owns it), credentials.

---

## 13. Final state — 2026-06-02 (post research + prune)

Deep-research (97-agent harness) reframed the diagnosis: the check is **not** a stale false positive but a **true over-included-allowance signal**. On the **current** Neon Launch plan the **included branch allowance is 10/project** (5,000 is the hard ceiling; the "5,000 = Launch" figure is a *legacy*-plan number). Extra branches on paid plans are **billed (~$1.50/branch-month)**, not blocked — which is why the check was red at ~40 yet branch creation still succeeded. Root cause of accumulation: branch-per-preview-deploy + Vercel's 180-day deployment retention + **GitHub `delete_branch_on_merge` was off**, so merged-PR git branches (and their Neon branches) lingered. Sources: `neon.com/docs/introduction/plans`, `…/legacy-plans`, `…/guides/vercel-branch-cleanup`, `…/guides/neon-managed-vercel-integration`, Neon changelog 2024-03-01.

**Actions taken (all Maya-approved):**
- **Safe-29 prune executed:** 29 merged/closed-PR preview branches (idle ≥24h) deleted from `hidden-mountain-87248164`. 0 failures.
- **hidden-mountain: 40 → 11 branches.**
- **Production health: 200** (`mallan.nyc/api/health`) before + after; `morning-bread` never queried or touched.
- **Open-PR preview branches kept** (PRs #290, #279, #302, #289, #303); **`main` kept** (primary).
- **Left alone:** `preview/fix/search-exclusive-card-hero` (#313, active branch) and `preview/fix/sale-form-video-autofill` (no PR, git branch still exists — investigate before removing).
- **Branch-overage billing:** ~30 extra branches → ~1; trending to $0 as the cron prunes the remainder.

**Controls now in place (self-maintaining, 3 layers):**
1. **GitHub `delete_branch_on_merge` = true** (flipped 2026-06-02) — merged PRs auto-delete their git branch.
2. **PR-close cleanup workflow live** — `.github/workflows/cleanup-neon-preview-branch.yml` (PRs #315 + #317; controlled API call, fail-loud, hard-pinned to the preview project).
3. **Daily `neon-branch-prune` cron** — idle ≥24h safety net (the only sanctioned manual-equivalent deleter).

**Left to the cron (not deleted manually):** `preview/fix/exclusive-media-agent-controls` (#311), `preview/fix/our-listings-nav-exclusives` (#312), `preview/test/neon-metadata-refresh` (orphan).

**Red "Branch limit exceeded" check — expected effect:** the check fires at the **included allowance (10)**, not the 5,000 ceiling. At **11 branches it is expected to remain red** (1 over); it should **clear once the cron drops the count to ≤10** (expected within ~24–48h, settling at ~6 = open PRs + `main`). The check's red/green state is only observable on a **fresh** preview deployment's *Deployment Checks* panel (not via API). The earlier "send Vercel a false-positive support ticket" plan is **withdrawn** — there is no false positive to escalate; the fix is branch-count reduction (done/ongoing) + the controls above.
