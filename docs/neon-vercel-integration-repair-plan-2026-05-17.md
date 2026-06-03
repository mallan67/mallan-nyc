> **⚠ AUTHORITATIVE SECTION IS §F.8.** Sections A–E of this doc reflect interim investigation that ran on the (incorrect) free-tier framing. They are preserved for the diagnostic trail. The final classification + support packet in §F.8 has the correct Launch-plan facts: bound project = `neon-green-school` / `hidden-mountain-87248164`, plan = Launch (8 / 5000 branches), the failing check is stale Vercel-side state. The Launch threshold-update audit lives in `docs/neon-launch-branch-policy-audit-2026-05-17.md`.

---

# Neon ↔ Vercel Integration Repair Plan

**Status:** OPEN · **Mode:** REPORT ONLY · **No code, no env, no unlink, no migrations, no cron triggers, no Neon branch deletes, no secrets printed.**
**Date:** 2026-05-17T06:25Z
**Author:** Claude Code under Maya direction
**Goal:** Fix the systemic "Neon branching: Branch limit exceeded" check failure on Vercel previews even though Neon Console reports 8 / 5000 branches.

---

## TL;DR

1. The Vercel↔Neon integration is **Vercel-Managed** (marketplace install, resource id `store_K9l79ICRUTMsiRh2`).
2. The integration is bound to Neon project **`morning-bread-68708332`** — NOT `neon-green-school` and NOT `hidden-mountain-87248164`. The two latter names appear only as hypotheses in prior notes; the rotate workflow's runtime env conclusively shows the bound project.
3. Production endpoint is **`ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`**, on the `main` Neon branch. A second rotation-related compute endpoint `royal-dawn-ad6eh8t2-pooler` exists on the same `main` branch.
4. The failing check **"Neon branching: Branch limit exceeded"** is posted by Vercel-Managed integration backend into Vercel's per-deployment Checks panel. **It is NOT a GitHub status context and not a GitHub check-run.** GitHub merge is unaffected.
5. The rotate-db-keys workflow has **NOT successfully run since 2026-03-01 05:44:12 UTC**. Four patches landed 2026-05-15 morning ET addressing four discovered root causes, but the workflow has not been manually triggered to verify the fixes, and the next scheduled run is 2026-06-01 05:00 UTC.
6. Production is currently healthy. `mallan.nyc` serves `dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx` (SHA `9fa75a4d`, PR #149 merge), and a DATABASE_URL last rotated on 2026-03-01 is still authenticating successfully against Neon.
7. **The branch-cap check is plausibly a stale plan-metadata cache on Vercel's side** — Neon Console shows 8 / 5000, but the Vercel-Managed integration backend may have cached pre-upgrade plan info. Confirmation requires either Maya's UI inspection or a Vercel support touch.

---

## A. Vercel/Neon binding

### A.1 Which integration is installed

| Field | Value | Evidence |
|---|---|---|
| Integration type | **Vercel-Managed** (Vercel Marketplace) | `store_*` resource-id prefix is the Vercel marketplace shape |
| Resource ID | `store_K9l79ICRUTMsiRh2` | `NEON.md` §11.316 |
| Scope | `mallan-nyc` project on Vercel team `team_kZQh5NYLyrOKqffK0r9EXf4E` | `NEON.md` §11; `.vercel/project.json` |
| Cleanup model | **Vercel-Managed** deletes preview branches when the Vercel deployment is removed (default Vercel retention = 180 days) | Neon docs — `https://neon.com/docs/guides/vercel-branch-cleanup` |

### A.2 Vercel-Managed vs Neon-Managed

Per Neon docs (`https://neon.com/docs/guides/vercel-managed-integration`, `https://neon.com/docs/guides/neon-managed-vercel-integration`, `https://neon.com/docs/guides/vercel-branch-cleanup`):

> "The **Vercel-Managed** integration deletes a Neon preview branch when its last associated **Vercel deployment is removed**, either automatically by Vercel's retention policy (which can take months) or manually by the user."
>
> "The **Neon-Managed** integration deletes a Neon preview branch when the corresponding **Git branch is deleted** from the repository, triggered on the next preview deployment."

The `store_*` shape of mallan-nyc's resource ID is the Vercel marketplace install — Vercel-Managed. (Neon-Managed installs are surfaced via a different listing in the Vercel Settings → Integrations panel.)

### A.3 Which Neon project / resource is bound

**Definitively `morning-bread-68708332`.** Evidence chain:

> ⚠️ **SUPERSEDED 2026-06-03.** This "definitively morning-bread = production" conclusion was **inverted**. The 2026-06-02 cross-project DB rescue (PRs #321/#322) established that production DATA is served by **`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`**, and `morning-bread-68708332` / `ep-royal-dawn-ad6eh8t2` is stale / do-not-serve. The `.cleanbak` evidence files cited below were **removed in PR #322**. See `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` top CORRECTION banner. The original evidence chain is retained below for the historical record.

1. **Runtime env in latest rotate-db-keys workflow run** (`gh run view 25910701936 --log-failed`) — env block shows `PROJECT_ID: morning-bread-68708332`. The workflow's `PROJECT_ID` reads from `secrets.NEON_PROJECT_ID || vars.NEON_PROJECT_ID`. The GH org `vars` listing shows `NEON_PROJECT_ID` is one of the configured variables.
2. **Backup workflow file** `.github/workflows/backups/rotate-db-keys.yml.cleanbak:24` — hardcodes `PROJECT_ID: "morning-bread-68708332"` (preserved before the refactor that moved it to secrets/vars).
3. **Backup workflow connection string** `.github/workflows/backups/rotate-db-keys.yml.cleanbak:82` — references endpoint `ep-royal-dawn-ad6eh8t2-pooler.c-2.us-east-1.aws.neon.tech` (which is a compute endpoint attached to `morning-bread-68708332`'s `main` branch).
4. **Architecture docs** consistently name `cold-waterfall` endpoint (`ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`) as the active production endpoint — also on `morning-bread-68708332`'s `main` branch:
   - `memory/BACKEND-AUDIT-2026-04-29.md:891` — migration `20260429130000_add_listing_search_projection` applied against `ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech`.
   - `docs/listing-search-projection-drift-report-2026-05-16.md:5` — references the same host.
   - `docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md:81,92,95` — describes `cold-waterfall` as the primary-branch compute endpoint and `royal-dawn` as a rotation-related secondary compute endpoint on the same branch.

### A.4 Was the integration ever bound to neon-green-school / hidden-mountain-87248164?

**No evidence in the repo.** The names `neon-green-school` and `hidden-mountain-87248164` appear only inside `docs/followup-vercel-neon-integration-repair-2026-05-17.md`'s hypothesis section (line 24), and they appear there as Maya-recalled possibilities — not as facts confirmed against any audit log or rotation log. Repo-wide grep across all source, scripts, docs, memory, and workflow backups found **zero occurrences** of these strings.

**Conclusion**: either the names were never the bound project, or they were the project at some pre-repo-history era and have since been renamed/migrated. Treat them as unverified going forward.

### A.5 Stale plan / quota metadata evidence

Indirect:
- Neon Console (per Maya 2026-05-17) shows **8 / 5000** branches → upgraded plan is live on Neon side.
- Every PR preview deploy since 2026-05-15 has posted a failing check **"Neon branching: Branch limit exceeded"** in Vercel's per-deployment Checks panel.
- These two states are inconsistent unless the integration's quota check is operating on stale plan metadata.

Direct: not collectible without `VERCEL_TOKEN` in this session OR Maya's UI screenshot. Per Maya's directive, no unlink/relink right now — so confirmation has to wait on her UI inspection (see §E).

### A.6 "Automatically delete obsolete Neon branches" toggle

Per Neon's 2024-03-29 changelog and `https://neon.com/docs/guides/vercel-branch-cleanup`:

> "Enable **Automatically delete obsolete Neon branches** (recommended) to clean up branches when git branches are deleted."

For the Vercel-Managed integration, this setting is presented in the integration install dialog and (post-install) inside Vercel UI → Settings → Integrations → Neon → Configure. **Whether it's currently enabled on mallan-nyc is unknown without UI access.** The local prune cron (`app/api/cron/neon-branch-prune` at `0 4 * * *` UTC) operates independently of this toggle and is the project's actual cleanup engine.

Multiple users on the Vercel community thread (`https://community.vercel.com/t/neon-integration-set-automatic-branch-expiration/26957`) report being unable to locate this setting post-install, suggesting the UI affordance is hard to find or has shifted.

---

## B. Failing check details

### B.1 The exact GitHub-side picture (PR #149, latest preview SHA `f3686521`)

Pulled via `gh api repos/mallan67/mallan-nyc/commits/<sha>/check-runs` + `…/statuses` + `…/check-suites`:

**check-runs on `f3686521`** (only 4 entries, all SUCCESS):
- `claude-review` — github-actions — SUCCESS
- `guardrails` — github-actions — SUCCESS
- `pr-check` — github-actions — SUCCESS
- `Vercel Preview Comments` — vercel — SUCCESS

**commit statuses on `f3686521`** (legacy GitHub status API, only 1 entry):
- `Vercel` — vercel[bot] — `pending` — "Vercel is deploying your app"

**check-suites on `f3686521`**:
- vercel — `completed` / `success`
- claude — `queued`
- sentry — `queued`
- 3 × github-actions — `completed` / `success`

**No "Neon branching" check anywhere in GitHub-side API.** The only Vercel-side surface in GitHub is the single rollup commit status, which reflects deployment state, not integration check-runs.

### B.2 The failing check on the Vercel side

Without an authenticated `VERCEL_TOKEN` in this session, I cannot pull `GET /v2/deployments/{id}/check-runs` directly to retrieve the integration check-run's `conclusion` + `conclusionText`. The check is visible in Vercel UI at:

`https://vercel.com/mallan/mallan-nyc/<deployment-short-id>` → Checks panel

**To capture exact text — Maya needs to screenshot:** the failing "Neon branching" row in any failed-check preview deploy (e.g., `dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV`), expand its detail card, and copy the `conclusionText` value.

### B.3 Confirmation: Vercel-UI-only, not a GitHub required check

Confirmed by:
- `gh api …/check-runs` for the same SHA returns zero "Neon" entries
- `gh api …/statuses` for the same SHA returns zero "Neon" entries
- Maya has already merged PR #149 to main via `gh pr merge --merge` (no `--admin`), which succeeded — proving GitHub did NOT block the merge

### B.4 Effect on preview branch alias rotation

Documented in `docs/followup-vercel-neon-integration-repair-2026-05-17.md` (2026-05-17 update section).

Symptom: the preview branch alias `mallan-nyc-git-feat-adaptive-white-border-crop-mallan.vercel.app` stayed pinned to `dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv` (commit `dee36576`, the very first preview build of PR #149) even after four subsequent pushes each produced their own `state: READY` deployment.

Theory: alias auto-promotion is gated on either (a) all integration checks passing or (b) the failing checks being explicitly Skipped. Maya Skipped the Neon check on the first preview; subsequent ones each spawned a new failing check that was never Skipped → alias stayed pinned to the first.

This DID cost Maya a half-day's investigation cycle (we kept measuring "old bundle" through the stale alias). **Production aliases are unaffected** because production deploys don't go through the same per-PR check gate.

---

## C. Production safety

### C.1 DATABASE_URL / DATABASE_URL_UNPOOLED still pointed at cold-waterfall

| Surface | Evidence |
|---|---|
| Vercel env (production) | `DATABASE_URL` + `DATABASE_URL_UNPOOLED` are registered as Vercel env vars per the rotate workflow's `upsert_vercel_env` history (last successful upsert 2026-03-01) |
| GitHub secrets mirror | `gh secret list` shows: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ASSISTANT_DATABASE_URL`, `DEV_DATABASE_URL` |
| Active endpoint host | `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` (per `docs/listing-search-projection-drift-report-2026-05-16.md:5`, `memory/BACKEND-AUDIT-2026-04-29.md:891`) |
| Production live | `mallan.nyc` returns 200, search results render — the DATABASE_URL credential is authenticating successfully |

### C.2 No production deploy pending

`mcp__claude_ai_Vercel__list_deployments` confirms the most recent production deploy is `dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx` (SHA `9fa75a4d`, READY at 2026-05-17T06:10:50Z). No subsequent production deploy is queued or building.

### C.3 Current production site works

Verified during the PR #149 production verification (see prior delivered report):
- `mallan.nyc` HTTP 200
- `/api/health` returns `{"success":true}`
- `/search?tab=rent-residential&sort=price-desc` renders cards
- Playwright proof: 401 WEST PH = 3 px residual white band, 15 W 68TH = 0 px (no false positive), FeaturedListings unaffected

### C.4 No env vars changed in this lane

Confirmed. Nothing in this lane has touched:
- Vercel env vars
- GitHub secrets
- GitHub vars
- `.env*` files in the repo
- `.vercel/project.json`

---

## D. rotate-db-keys.yml audit

### D.1 Run timeline

| Date / Time UTC | Outcome | SHA prefix | Run ID | Notable |
|---|---|---|---|---|
| 2026-02-01 05:54 | ✅ success | (prior) | (older) | per `rotation-history.log` |
| 2026-02-15 05:49 | ✅ success | (prior) | (older) | per `rotation-history.log` |
| **2026-03-01 05:44** | ✅ success | (prior) | (older) | **LAST KNOWN-GOOD ROTATION** |
| 2026-04-01 05:39 | ❌ failure | (older) | 23833796286 | first failed scheduled run after 6 weeks of green |
| 2026-04-15 05:40 | ❌ failure | (older) | 24438414499 | |
| 2026-05-01 06:01 | ❌ failure | `0309875b` | 25204420163 | |
| 2026-05-15 06:11 | ❌ failure (sched) | `1e31f495` | 25903348530 | initiated the diagnostic cycle |
| 2026-05-15 07:22 | ❌ failure (dispatch) | `6280a8f1` | 25905817923 | |
| 2026-05-15 07:29 | ❌ failure (dispatch) | `6280a8f1` | 25906072251 | |
| 2026-05-15 07:43 | ❌ failure (dispatch) | `6280a8f1` | 25906622656 | |
| 2026-05-15 08:26 | ❌ failure (dispatch) | `5a4095f8` | 25908079420 | **preflight fail — `curl: (43)`** |
| 2026-05-15 08:57 | ❌ failure (dispatch) | `6320cdbe` | 25909322451 | |
| 2026-05-15 09:30 | ❌ failure (dispatch) | `6320cdbe` | 25910701936 | **reached Neon, failed redeploy — HTTP 400 missing `name`** |
| 2026-06-01 05:00 | (scheduled) | (will be `9fa75a4d` if no further pushes) | — | next opportunity |

### D.2 Exact failure step (latest run)

Run `25910701936` (2026-05-15 09:30 UTC, SHA `6320cdbe`):

```
Rotate Neon password and update consumers:
  PROJECT_ID: morning-bread-68708332
  VERCEL_PROJECT_ID: ***
  …
  ##[error]Vercel redeploy failed with HTTP 400: Invalid request: missing required property `name`.
  ##[error]Process completed with exit code 1.
```

The workflow reached and **completed the Neon side** of rotation (auth OK, branch resolved, password reset OK, connection_uri retrieved, GH secrets upserted, Vercel env vars upserted). It failed on the **last step** — `POST /v13/deployments?forceNew=1` to trigger a production redeploy.

### D.3 Is VERCEL_TOKEN malformed/expired/missing?

| Symptom | Evidence | Verdict |
|---|---|---|
| Missing | `gh secret list` shows `VERCEL_TOKEN` is registered | No |
| Expired | Run 25910701936's earlier steps successfully called Vercel API endpoints `GET /v6/deployments` (preflight passed) and `POST /v10/projects/<id>/env?upsert=true` (3 env upserts succeeded) before the failing step | **Token is valid** |
| Malformed (CR/LF) | Run 25908079420 failed at preflight with `curl: (43)` = CURLE_BAD_FUNCTION_ARGUMENT (libcurl rejects header containing CR/LF). Patches `a9e1ce46` + `bb89f1de` strip CR/LF from VERCEL_TOKEN/NEON_API_KEY/MY_GITHUB_PAT before any auth-bearing call. After those patches, all subsequent runs reached past preflight | **Was malformed; now sanitized inline** |

**Verdict: VERCEL_TOKEN is currently valid (post-patch). The "missing required property `name`" failure was a different issue — the `POST /v13/deployments` body required a `name` field that the previous workflow version omitted. Patch `73f97552` added it. Patch landed at 2026-05-15 10:13 UTC, AFTER the last failing run, so it is unverified by an actual workflow run.**

### D.4 Is NEON_API_KEY malformed/expired/missing-permission?

| Symptom | Evidence | Verdict |
|---|---|---|
| Missing | `gh secret list` shows `NEON_API_KEY` is registered | No |
| Permission-scoped | Run 25910701936 successfully called: `GET /projects/<id>/branches`, `GET /branches/<id>/roles/<role>`, `POST /branches/<id>/roles/<role>/reset_password`, `GET /operations/<id>`, `GET /connection_uri` — all returned 2xx | **Permissions OK** |
| Malformed | After CR/LF normalization, no Neon-API-side errors observed | OK |

**Verdict: NEON_API_KEY is currently valid.** Note: this token has `branches:write` + `roles:write` scope (proven by successful password reset). If it's the same token used by the local `npm run ops:neon-prune` cron, that scope is sufficient.

### D.5 Workflow writes ASSISTANT_DATABASE_URL or other stale vars

Lines `313–315` of `rotate-db-keys.yml` write three secrets to GH:
```
gh secret set DATABASE_URL           ← active
gh secret set ASSISTANT_DATABASE_URL ← active
gh secret set DATABASE_URL_UNPOOLED  ← active
```

Lines `342–344` upsert three Vercel env vars (production target):
```
upsert_vercel_env DATABASE_URL           "$pooled_uri"
upsert_vercel_env ASSISTANT_DATABASE_URL "$pooled_uri"
upsert_vercel_env DATABASE_URL_UNPOOLED  "$direct_uri"
```

**`ASSISTANT_DATABASE_URL` is written both to GH secrets and Vercel env on every successful rotation.** It is a separate env var from `DATABASE_URL`. The repo also has `DEV_DATABASE_URL` as a secret (not written by this workflow — presumably set manually for local dev). All four appear in the active surface.

**Potential cleanup question (defer to Maya):** does `ASSISTANT_DATABASE_URL` still have a real consumer? Quick grep would answer (not run here to avoid scope creep). If unused, removing it from the rotation upsert reduces blast radius on future rotation runs.

### D.6 Safe repair recommendation (NOT patched in this lane)

Per Maya's directive ("do not patch yet"):

1. **Verify the 4 fixes from 2026-05-15 morning ET actually work** by `workflow_dispatch` of `rotate-db-keys.yml` from the Actions UI. This:
   - Rotates the Neon credentials (current ones are 76 days old — fine; Neon doesn't force-rotate).
   - Updates DATABASE_URL / ASSISTANT_DATABASE_URL / DATABASE_URL_UNPOOLED on both GH secrets and Vercel env.
   - Triggers a production redeploy.
   - **Production side effect:** brief redeploy (~2 min). Already done multiple times today (PR #145, PR #147, PR #149 merges) without incident.
   - **Risk:** if the patch is incomplete, rotation fails again; secrets haven't changed in 76 days, so another delay is non-critical.
   - **Defer:** if Maya prefers, wait for the natural 2026-06-01 schedule to test in production.
2. **If/when it fails again,** add a more verbose error capture step that prints the full Vercel API response body (with masking) so the next debugging cycle isn't blind.
3. **Decide whether `ASSISTANT_DATABASE_URL` is still needed** — if not, remove from the upsert list to shrink surface area.

---

## E. Recommended repair plan (ranked, NOTHING EXECUTED)

| # | Option | Effort | Risk | Confidence in fix |
|---|---|---|---|---|
| **E.1 ★** | **Verify which Neon project Maya is reading** | Trivial (UI) | None | High — confirms or refutes binding-mismatch hypothesis |
| **E.2 ★** | **Capture the failing check's exact conclusionText from Vercel UI** | Trivial (UI screenshot) | None | High — needed to differentiate "stale plan cache" from "real cap hit" from "auth error" |
| **E.3 ★** | **Manual workflow_dispatch of rotate-db-keys.yml** | One click | Low (rotation is reversible via re-run on failure) | Medium — verifies 4 patches landed today; ALSO refreshes Vercel env with current Neon credentials, which MAY itself nudge the integration's cached plan metadata |
| **E.4 ★** | **Refresh integration binding in Vercel UI** — Vercel → Settings → Integrations → Neon → Configure → re-select the correct Neon project (NOT unlink) | Few clicks | Low — preserves existing env vars; just re-binds metadata | High if hypothesis is "stale plan cache" |
| E.5 | **Open Neon support ticket** with evidence packet: `store_K9l79ICRUTMsiRh2`, screenshots of branch count + failing check, deployment IDs (`dpl_BAgcasV52`, `dpl_29Kmkr77`, `dpl_3VozPXSUYh`), and timeline | Email + back-and-forth | None | High if E.1–E.4 don't resolve |
| ⚠ E.6 | **Disable preview branching** (Vercel → Configure → toggle off) | One click | **HIGH — DATA-MUTATION RISK** if previews point at prod DB | Out of scope per Maya 2026-05-17 unless preview-callable code paths are audited read-only |
| ❌ E.7 | **Point previews at production DB** | n/a | UNSAFE | Forbidden |

Recommended sequence: **E.1 → E.2 → E.3 → E.4 → E.5**, stopping as soon as the failing check clears on a new preview deployment.

### E.A · Exact UI steps for E.1 (verify Maya's Neon console view)

1. Open `https://console.neon.tech/app/projects` (Neon Console root).
2. Look at the **project list** — there should be a card titled `morning-bread-68708332` (slug-style name). If multiple Neon projects exist on Maya's account, identify the one whose **Connection details** page shows endpoint `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`.
3. Click into that project → **Branches** tab.
4. Confirm the branch count widget reads **8 / 5000** (or whatever the current state is). **If it reads a different cap or a different count**, that's the actual Neon-side state. **If a different project name appears instead**, that's the real binding to investigate.
5. **Screenshot the project name + branch widget**.

### E.B · Exact UI steps for E.2 (capture failing check)

1. Open Vercel UI → `https://vercel.com/mallan/mallan-nyc/29Kmkr77mh2uw1V9tRXeGn84xvhV` (latest failing preview).
2. Scroll to the **Checks** panel under the deployment header.
3. Find the row labeled **"Neon branching"** (or similar — the exact name lives in the integration's `name` field).
4. Click to expand.
5. **Screenshot** the rendered detail: status, conclusion, conclusionText, integration name, and any "Re-run" / "Skip" button.

### E.C · Exact UI steps for E.3 (manual workflow run)

1. GitHub → repo `mallan67/mallan-nyc` → Actions → workflow "Rotate Neon DB Credentials".
2. Click **Run workflow** → select branch `main` (currently at `9fa75a4d`) → Run.
3. Watch the job. The 4 patches from this morning ET should let it complete to Vercel redeploy.
4. On success: `rotation-history.log` will show `"✅ Rotation successful."`. A production redeploy will fire (~2 min).
5. On failure: capture the failing step's full error text and feed back here for next round.

### E.D · Exact UI steps for E.4 (refresh integration binding — Configure, NOT unlink)

1. Vercel UI → `https://vercel.com/mallan/mallan-nyc/settings/integrations`.
2. Find the **Neon** integration in the list.
3. Click **Configure** (NOT Remove).
4. In the configuration panel, locate the **Neon project** binding. Verify it reads `morning-bread-68708332`.
5. If correct: scroll for an "**Automatically delete obsolete Neon branches**" toggle. **Screenshot its current state without changing it.**
6. If incorrect (binding shows a different project): note the actual bound project name, screenshot, and STOP. Do NOT click "Connect a different database" yet — bring back to me for triage.

### E.E · Rollback plan per step

| Step | Rollback |
|---|---|
| E.1 (Neon Console read) | No state mutated; no rollback needed |
| E.2 (Vercel UI screenshot) | No state mutated; no rollback needed |
| E.3 (workflow run) | If rotation fails partway, the partial-state remediation is in `rotation-history.log` — re-run the workflow after fixing the failing step; old credentials remain valid because the workflow's first action is to read the existing Neon credentials, not delete them. Worst case: Neon support can restore from a point-in-time snapshot (7-day PITR retention) |
| E.4 (refresh binding) | If "Configure" reveals the wrong project bound, do nothing — note the state and bring back to me. If everything reads correct, no changes are made by Configure itself; closing the panel without saving is a no-op |
| E.5 (support ticket) | n/a — vendor-mediated |

### E.F · Risks per step

| Step | Risk class | Worst case |
|---|---|---|
| E.1 | **None** | Read-only |
| E.2 | **None** | Read-only |
| E.3 | **Low** | Workflow fails on a different step; no production data harmed because the rotation transaction is atomic per the workflow's error-handling structure (Neon password reset is reversible; Vercel env upsert is idempotent). Production DATABASE_URL stays valid throughout |
| E.4 | **Low to Medium** | If "Configure" panel mis-saves or auto-applies a different project, integration may temporarily break DATABASE_URL plumbing — but Vercel env vars are separate from the integration's runtime binding for our app, so production routes that read `DATABASE_URL` directly still work. **Take screenshot before any save.** |
| E.5 | **None** | Vendor-mediated |
| E.6 | **HIGH** | Preview deploys write to production DB. Mitigations exist but are out of scope right now per Maya |
| E.7 | **CRITICAL** | Forbidden |

### E.G · What to screenshot

1. Neon Console → projects list (E.1 step 2).
2. Neon Console → `morning-bread-68708332` → Branches tab — the branch count widget (E.1 step 4).
3. Vercel UI → failing preview's Checks panel — Neon-branching row expanded (E.2 step 5).
4. Vercel UI → Settings → Integrations → Neon → Configure — the bound project name + Automatically-delete toggle (E.4 step 5–6).
5. After E.3 succeeds: the new `rotation-history.log` line in git after the audit-log commit step.

### E.H · What NOT to touch

- ❌ Do not click **Remove** on the Neon integration.
- ❌ Do not change `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL` directly in Vercel env settings (let the rotation workflow own them).
- ❌ Do not delete any Neon branch from the console.
- ❌ Do not click "Connect a different database" until binding is confirmed wrong.
- ❌ Do not toggle off "Automatically delete obsolete Neon branches" if it's enabled (we have our own cron that does the same job; turning off the integration's toggle is fine, but turning it ON without checking interaction would compound).
- ❌ Do not toggle preview branching off.
- ❌ Do not manually run any cron from Vercel UI.

### E.I · Post-repair validation

After whichever step clears the failing check:

1. Push an empty commit to any open feature branch.
2. Wait for Vercel to start the preview build.
3. **Expected:** the Vercel UI Checks panel shows the "Neon branching" check as `success` (or passes without manual Skip).
4. Open the deployed preview URL → confirm it serves the new build (not a stale alias — the alias should rotate correctly once the gating check passes).
5. Open Neon Console → branch widget should show count went 8 → 9 during the deploy, then back to 8 ≤ 24h later (after the prune cron runs).
6. After 24 h: confirm `app/api/cron/neon-branch-prune` cron logs an `examined=N, pruned=…` entry per its `AuditEvent` writer.
7. Run any next PR push as a smoke test — the failing check should be gone.

---

## What this report does NOT do

- ❌ No code modified.
- ❌ No env vars added / removed / edited.
- ❌ No integration unlinked or relinked.
- ❌ No Vercel UI clicks made.
- ❌ No Neon API calls.
- ❌ No GitHub Actions workflow runs triggered.
- ❌ No GitHub merge.
- ❌ No PR 5B / PR #148 / reconciliation / R2 / CRM / Sentinel work.
- ❌ No DATABASE_URL printed (all surfaces remain redacted).

---

## Cross-references

- `NEON.md` §11 — Preview-branch integration architecture (the canonical doc)
- `docs/followup-vercel-neon-integration-repair-2026-05-17.md` — earlier follow-up + the new 2026-05-17 sub-section on preview-alias rotation block
- `docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md` — branch-cap pressure analysis with cleanup options
- `.github/workflows/rotate-db-keys.yml` — current state, post-2026-05-15 patches
- `.github/workflows/backups/rotate-db-keys.yml.cleanbak` — **removed in PR #322** (was a historical hardcoded binding; its `morning-bread`/`royal-dawn` values fed the now-corrected production-ownership inversion — see `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md` top banner)
- `lib/neon/branches.ts` — prune logic
- `app/api/cron/neon-branch-prune/route.ts` — daily cron at 04:00 UTC
- `scripts/neon-prune-branches.ts` — local CLI wrapper for the same logic
- `rotation-history.log` — append-only rotation outcome log; last success 2026-03-01

---

**End of original repair plan.**

---

## 2026-05-17T06:50Z UPDATE — Final classification + repair runbook

E.1, E.2, and E.4 have been performed by Maya. The findings supersede the earlier binding section.

### Final classification

| Surface | Value | Evidence |
|---|---|---|
| **Active Vercel ↔ Neon integration product** | `neon-green-school` (Neon-side project ID `hidden-mountain-87248164`) | Vercel UI → Settings → Integrations → Neon. "Connected to mallan-nyc / All Environments." |
| **Second Neon product on the same account** | `neon-green-door` | Visible in Vercel UI but `Connect to Project` button shown — NOT bound to mallan-nyc |
| **Neon Console for `neon-green-school`** | **8 / 5000 branches** | Maya's UI read 2026-05-17 |
| **Vercel check** "Neon branching: Branch limit exceeded" | **Persists on every preview deploy** despite 8/5000 actual headroom | Maya 2026-05-15 → 2026-05-17 observations |
| **Vercel UI conclusionText for the failing check** | **No additional detail string exposed** — only the headline "Branch limit exceeded" | Maya's E.2 verification 2026-05-17 |
| **GitHub-side propagation** | None — not a check-run, not a status context | `gh api …/check-runs` and `…/statuses` on `f3686521` showed zero "Neon" entries |
| **Production DATABASE_URL points to** | `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` (host bytes only — secret value not printed) | `memory/BACKEND-AUDIT-2026-04-29.md:891`, `docs/listing-search-projection-drift-report-2026-05-16.md:5` |
| **rotate-db-keys.yml `PROJECT_ID`** | `morning-bread-68708332` | `gh run view 25910701936` env block |

**Final conclusion: this is stale/broken Vercel-Neon integration state, NOT real branch exhaustion.** The Neon Console for the bound project shows comfortable headroom (8/5000); Vercel's integration backend is asserting the opposite without any conclusionText to support the claim. Either Vercel's cache of integration plan metadata is stale post-upgrade, or the integration's check job is reaching a different Neon project from the one Maya has bound (the `neon-green-door` vs `neon-green-school` near-duplicate names on the same Neon account are suspicious in this regard).

### Open question (not in scope for this runbook — flag only)

**The rotate-db-keys workflow rotates `morning-bread-68708332`. The Vercel integration is bound to `neon-green-school` / `hidden-mountain-87248164`. These are different Neon project names.**

Three possibilities, each worth a separate read-only investigation later:

1. `cold-waterfall` endpoint lives on `neon-green-school`'s `main` branch (in which case the rotate workflow's `PROJECT_ID` is incorrect — but rotation was succeeding through 2026-03-01, so the API key + project ID combo HAS worked historically against `morning-bread-68708332`)
2. There are two independent Neon projects on this account, and they serve distinct purposes (production DB vs. preview-branching workspace). Both are real. Both are needed.
3. A legacy migration from one Neon project to another left dangling references in either the workflow or the integration. One of them needs to be retired.

**Surfacing for awareness; not blocking the runbook. Confirmation requires Maya to open Neon Console → look at `neon-green-school` → Branches → `main` → Compute endpoints → confirm whether `cold-waterfall` appears there.** If it does → option 1 (workflow needs PROJECT_ID update). If it doesn't → option 2 (deliberate two-project split). Either is independently investigable later.

---

### F.1 · Pre-runbook safety snapshot (read-only, NOTHING printed beyond names)

| Item | Snapshot | Source |
|---|---|---|
| Production deploy state | `dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx` READY since 2026-05-17T06:10:50Z | `mcp__claude_ai_Vercel__list_deployments` |
| Deploys in progress | None (most recent is READY; no BUILDING / QUEUED entries) | same |
| `mallan.nyc/api/health` | HTTP 200 → `{"success":true}` | direct curl probe |
| `mallan.nyc/search` | HTTP 200 in 0.29s, serves chunks from `dpl_GiNFHhM5...` | curl + chunk-grep |
| Production endpoint host | `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` (host bytes only) | `memory/BACKEND-AUDIT-2026-04-29.md:891`, `docs/listing-search-projection-drift-report-2026-05-16.md:5` |
| Currently-serving SHA | `9fa75a4d` (PR #149 merge commit) | Vercel deployment metadata |

### F.2 · Vercel env var name inventory (NAMES + EXPECTED SCOPE, NO VALUES)

Two layers exist; this runbook treats them differently.

**Layer 1 — rotate-workflow-managed (UPPERCASE):**

| Name | Scope | Owner | Used by app? |
|---|---|---|---|
| `DATABASE_URL` | Production | `rotate-db-keys.yml` step `Rotate Neon password and update consumers` line 342 | **Yes** — primary read path (`process.env.DATABASE_URL` referenced by `lib/db.ts:2`, `scripts/ops-health.js:21`, 9 other call sites) |
| `DATABASE_URL_UNPOOLED` | Production | `rotate-db-keys.yml` line 344 | **Yes** — `scripts/batch-geocode.js:21`, `scripts/import-past-deals.js:11` |
| `ASSISTANT_DATABASE_URL` | Production | `rotate-db-keys.yml` line 343 | **NO** — zero `process.env.ASSISTANT_DATABASE_URL` occurrences in source. Likely dead. (Don't touch in this lane.) |
| `NEON_PROJECT_ID` | Actions vars | GH org-level variable, used by rotate workflow + neon-prune cron route | Yes — both consumers |
| `NEON_API_KEY` | GH secrets | Rotate workflow + neon-prune cron route | Yes — both consumers |
| `VERCEL_PROJECT_ID` | GH secrets | Rotate workflow | Workflow-internal |
| `VERCEL_TOKEN` | GH secrets | Rotate workflow | Workflow-internal |

**Layer 2 — Vercel-Neon-Integration-managed (LOWERCASE, auto-generated):**

These are NOT explicitly read by any line of app code (`grep -n "process.env.database_url\|process.env.POSTGRES_URL\|process.env.POSTGRES_PRISMA_URL" → 0 matches`). They exist as a side-effect of the integration install. Common shape (per Neon's Vercel-Managed integration docs):

| Likely name | Expected scope |
|---|---|
| `DATABASE_URL` (lowercase variant or duplicate) | Production / Preview / Development — auto-set by integration |
| `database_url_unpooled` (or similar) | same |
| `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` | Preview env only (per integration scope) |
| `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_DATABASE`, `POSTGRES_PASSWORD` | Preview env only |

**The runbook treats Layer 2 as expendable**: app doesn't read them. The integration regenerates them on every preview deploy anyway.

**The runbook treats Layer 1 as untouchable**: app DOES read them. Any UI step that asks Maya to choose between "Replace existing env vars" vs "Add new env vars" — choose **ADD ONLY / DO NOT OVERWRITE**.

### F.3 · DATABASE_URL host bytes confirmation (no secrets printed)

| Test | Pass criterion | Result |
|---|---|---|
| Production `/api/health` returns `success:true` | Means `DATABASE_URL` is currently resolving to a reachable Postgres | ✓ PASS |
| Production `/search` returns 200 with listings | Means DB queries against `Listing` table are succeeding via Prisma + DATABASE_URL | ✓ PASS |
| Audit trail logs DATABASE_URL host as `cold-waterfall` | Multiple repo docs cite `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` as the active host since at least 2026-04-29 | ✓ PASS |
| No deploy in flight | `mcp__claude_ai_Vercel__list_deployments` returns no BUILDING/QUEUED for production target | ✓ PASS |

**Verdict: production DATABASE_URL is healthy and pointing at `cold-waterfall`. Repair runbook can proceed without first triggering a rotation (which is what the failed rotate-db-keys runs would have done).**

### F.4 · Rollback plan for the refresh/reconnect step

Maya's planned action in F.5 is **"refresh"** the integration via Vercel UI **Configure** panel — NOT disconnect/reconnect. The rollback policy depends on what UI affordance is actually exposed.

**Variant A — A "Sync" / "Refresh integration metadata" button exists:**

- Click → integration backend re-queries Neon plan metadata → cap updates from cached "10" to "5000"
- Rollback: none needed; the operation is read-only on the Neon side and only refreshes the Vercel-side cache
- Validation: see F.6

**Variant B — Only "Disconnect" / "Reconnect" buttons exist:**

This is the path that warrants caution. The rollback policy:

| Concern | Impact | Mitigation |
|---|---|---|
| Layer 1 env vars (DATABASE_URL etc.) overwritten | App breaks on next request | The Vercel-Managed integration writes lowercase variants by default. UPPERCASE Layer 1 vars are NOT touched by the integration unless Maya explicitly clicks "Replace all" — which she won't. Pre-action screenshot of Production env tab is the proof |
| Lowercase Layer 2 env vars temporarily missing during reconnect window | App unaffected — doesn't read them | None needed |
| Preview Layer 2 env vars regenerate with new branch host | New preview branches will use new credentials. Existing preview branches keep their old creds (Vercel injects per-deployment env, not retroactively) | None needed — only future preview deploys are affected, and they were broken anyway |
| Integration loses the "Automatically delete obsolete branches" setting | Branch cleanup goes to baseline (Vercel deployment retention only) | Local cron `app/api/cron/neon-branch-prune` already does this independently — defense in depth covers the gap |

**Hard rollback procedure if reconnect breaks production:**

1. Open Vercel UI → Project → Settings → Environment Variables → Production tab
2. Confirm `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ASSISTANT_DATABASE_URL` are all present and have non-empty values (UI shows redacted, that's fine)
3. If any are missing or empty: **manually re-add them from the rotate-history audit trail**. The values must come from a fresh rotation run (no value is stored in this repo or by me). Run `gh workflow run rotate-db-keys.yml` from main → wait for success → DATABASE_URL is restored
4. Alternative if rotation fails: **roll back to a known-good Vercel deployment**. `dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx` is currently production and is `isRollbackCandidate: true`. Promote via Vercel UI → Deployments → … menu → Promote
5. Last resort: Neon support ticket with Production DATABASE_URL recovery request

**Why the runbook stops at "refresh" and does NOT recommend disconnect/reconnect:**

Per Maya's directive ("do not unlink/relink Neon yet"), the refresh path is the floor. The disconnect/reconnect path is the ceiling — defer until refresh proves insufficient.

### F.5 · Exact UI steps to refresh/reconnect the Neon integration

Read-only diagnostic steps (perform first; no state change):

**F.5.D — Diagnostic UI walkthrough (NO clicks beyond navigation + screenshot)**

1. Open Vercel UI → `https://vercel.com/mallan/mallan-nyc/settings/integrations`
2. Find the **Neon** card. Confirm Active product shows `neon-green-school` (per E.4) and that scope reads "All Environments"
3. Hover/click the **⋯** menu next to the neon-green-school product card. Note which actions are exposed (likely: Configure / Manage / Disconnect / View on Neon)
4. Click **Configure** (NOT Disconnect, NOT Manage if it opens a settings panel — Configure is preferred). Take a screenshot of:
   - Bound Neon project name
   - Region
   - "Automatically delete obsolete Neon branches" toggle state
   - Any "Sync" / "Refresh" / "Re-evaluate plan" button
5. **STOP at this point and report findings back.** Do not click any action yet.

Choose-your-own-path remediation steps (perform ONE based on F.5.D results):

**F.5.A — IF a "Sync metadata" / "Refresh plan" button exists in the Configure panel:**

1. Click the button (single click — no confirmation expected)
2. Wait 30–60 s for any UI feedback
3. Push an empty commit on any feature branch and verify the failing check clears (see F.6)
4. Rollback: not needed — this is a read-only metadata refresh

**F.5.B — IF Configure only shows settings (no sync button), and the "Automatically delete obsolete branches" toggle is **OFF**:**

1. Take a screenshot of the toggle state
2. Toggle it **ON**
3. Save (if there's an explicit Save button)
4. Push an empty commit and verify
5. Rollback: toggle back OFF — symmetric, no data implication

**F.5.C — IF Configure shows everything correct AND F.5.A/B don't apply:**

This is where the runbook escalates from "refresh" toward "reconnect". Maya signs off explicitly OR the runbook stops here and pivots to F.7 (support ticket).

**Disconnect/Reconnect path — requires explicit Maya approval. Outline only:**

1. Pre-action: screenshot Vercel UI → Project → Settings → Environment Variables → Production tab (all rows visible, names + scope columns)
2. Click **Disconnect** on neon-green-school
3. Vercel may surface a confirmation dialog asking what to do with existing env vars. Choose **Keep environment variables** (NOT "Remove env vars")
4. Verify all Layer 1 UPPERCASE vars still present in Production tab (use the pre-action screenshot for diff)
5. Click **Connect** → select **Existing Neon resource** → select `neon-green-school` → All Environments
6. During the connect flow, if Vercel asks "What to do with conflicting env vars?", choose **Skip / Keep existing** for all UPPERCASE Layer 1 vars
7. Verify Layer 1 vars unchanged (re-screenshot Production tab and diff)
8. Push empty commit + validate per F.6
9. Rollback: re-disconnect → reconnect a second time, OR rotate-db-keys.yml manual run to restore Layer 1 vars

### F.6 · Post-refresh validation

After F.5.A, F.5.B, or (after explicit approval) the disconnect/reconnect path:

1. **Create a test preview**. Easiest: push an empty commit on a feature branch (NOT the closed PR-149 branch — pick a stale open PR or create a throwaway). `git commit --allow-empty -m "ci: post-refresh validation"` + push
2. **Wait for Vercel preview deploy to reach READY** (~2 min). Poll via `mcp__claude_ai_Vercel__list_deployments` or watch the GitHub PR's Vercel comment
3. **Verify the failing check is cleared.** Open the Vercel UI for the new preview deploy → Checks panel → "Neon branching" row should now read SUCCESS (or be absent entirely if the integration stopped posting). Screenshot to confirm
4. **Verify preview alias rotated.** `curl -s "https://<branch-alias>/search?…" | grep -oE 'dpl=dpl_[A-Za-z0-9]+'` should return the NEW preview's deployment ID, not a stale one
5. **Verify production env unchanged.** Open Vercel UI → Settings → Env Vars → Production tab → confirm Layer 1 names still present (visual check against the pre-action screenshot). Most important: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ASSISTANT_DATABASE_URL`
6. **Verify mallan.nyc still healthy.** `curl -s https://mallan.nyc/api/health` should return `{"success":true}`. `curl -sI https://mallan.nyc/search` should return HTTP 200
7. **Optional but recommended**: open Neon Console → `neon-green-school` → Branches → confirm the new preview branch was provisioned (count went 8 → 9). Within 24 h the prune cron should bring it back to 8

If ANY validation fails → see F.4 rollback procedure.

### F.7 · Support-ticket fallback (if F.5 doesn't resolve)

**Address:** dual ticket — Neon support (`https://console.neon.tech` → Support) AND Vercel support (`https://vercel.com/help`).

**Evidence packet (do NOT include secrets in the ticket text):**

```
Subject: Vercel-Neon integration "Branch limit exceeded" persists after plan upgrade

Vercel project ID:        prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW
Vercel team ID:           team_kZQh5NYLyrOKqffK0r9EXf4E
Vercel integration ID:    store_K9l79ICRUTMsiRh2
Neon project (bound):     neon-green-school (Neon-side ID hidden-mountain-87248164)
Neon project (other,
not connected):           neon-green-door
Neon plan branch cap:     5000
Neon Console actual:      8 / 5000 branches
Vercel check posting:     "Neon branching: Branch limit exceeded" (no conclusionText)

Affected deployments (in chronological order, all preview, all state=READY):
  - dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv (SHA dee36576, 2026-05-17T04:08Z)
  - dpl_Hi52RLwdx2xvT8JSqkGiQ6no2Fgx (SHA 3797ce8c, 2026-05-17T04:16Z)
  - dpl_64VnrREDyyjf9c9vEqcsFbtkSwGi (SHA aeea758c, 2026-05-17T04:28Z)
  - dpl_BAgcasV52rwmewyC8UMGWfhGS1nv (SHA 915a734a, 2026-05-17T04:33Z)
  - dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV (SHA f3686521, 2026-05-17T05:35Z)

Each of these reached state=READY. Each posted the failing check.

Symptoms:
1. Check has no conclusionText / detail string — only the headline
2. Neon Console for the bound project shows comfortable headroom
3. Vercel UI "Configure" panel for the integration shows bound project + region correctly
4. GitHub-side check-runs API returns zero "Neon" entries for the affected SHAs
5. Preview branch alias auto-rotation appears to stall on preview deploys that fail the check (alias stayed pinned to dpl_3VozPXSUYh through all 5 deploys, even though each was READY)
6. Production deploys (dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx, SHA 9fa75a4d) are unaffected — production alias rotates correctly

Hypothesis: Vercel-side cached plan metadata is stale post-upgrade.

Asks:
- Confirm whether a Vercel-side cache exists for the integration's plan/quota,
  and how to force its re-evaluation without disconnect/reconnect
- Confirm whether the second Neon product on the same account (neon-green-door)
  affects routing for the connected product (neon-green-school)
- Confirm whether the per-PR Vercel preview branch alias rotation is intentionally
  gated on integration check success

Please advise on remediation that preserves the existing Layer 1 env vars
(DATABASE_URL, DATABASE_URL_UNPOOLED, ASSISTANT_DATABASE_URL).
```

**Attachments:**
- Screenshot of Neon Console showing 8/5000 on `neon-green-school`
- Screenshot of failing check row from any affected deployment's Vercel UI Checks panel
- Screenshot of Vercel Configure panel for the Neon integration (with toggle states visible)

**Response timeline:** Neon typically responds within 1 business day on paid plans. Vercel Pro support similar. Pro tier may be needed to get acknowledgment within 24 h.

**Hold the disconnect/reconnect path while the ticket is open** — it removes evidence both vendors will want to inspect.

---

## What this runbook does NOT do

- ❌ No `neon-green-door` connection
- ❌ No `neon-green-school` disconnect
- ❌ No env vars added / removed / edited
- ❌ No rotation triggered
- ❌ No migrations applied
- ❌ No reconciliation
- ❌ No PR 5B started
- ❌ No Neon branches deleted
- ❌ No CRM / Sentinel work
- ❌ No secret values printed (only env var NAMES + host bytes)
- ❌ Awaiting Maya's choice of F.5.D / F.5.A / F.5.B / F.5.C / F.7

---

**End of repair runbook.**

---

## F.8 · Finalized Vercel + Neon support packet (copy-pasteable)

> Filed 2026-05-17 by Maya Allan, mallan.nyc. Status: ready to send. Open one ticket with each vendor and cross-reference between them in the subject line.

### F.8.1 · Ticket envelope (use for BOTH vendors)

**To:**
- Neon support: `https://console.neon.tech` → top-right → Support → New ticket (Launch-plan customer)
- Vercel support: `https://vercel.com/help` → Submit a ticket → category: Integrations → Marketplace

**Subject:**
```
Vercel-Neon integration check "Branch limit exceeded" on a project at 8/5000 — no conclusionText, no Manage UI affordances
```

**Cross-reference:** if filing both, mention "cross-filed with [Neon|Vercel] for the same issue" in the first paragraph of each.

### F.8.2 · Ticket body (verbatim copy-paste)

```
Hi Neon / Vercel support,

A Vercel deployment check posted by the Neon integration is reporting
"Branch limit exceeded" on every preview deploy of our Vercel project,
even though the bound Neon project has 8 of 5000 branches used and is
on the Launch plan. The check has no conclusionText exposed in the
Vercel UI, and the Neon Console's Integrations page does not surface
the usual Manage / Settings / Integrated Branches / Disconnect
affordances for this Vercel connection — it only shows
"Manage Neon subscription."

Production is unaffected (the production DATABASE_URL points to a
different Neon compute endpoint and is healthy at 8/5000 confirmed
in the Neon Console). The issue is preview deployment checks only,
and it has the side-effect that the Vercel preview branch alias for
a PR stops auto-rotating to new commits when this check fires —
which has caused real debugging confusion (Playwright e2e against
the alias kept measuring a stale deploy's output for hours).

We are NOT requesting a disconnect/reconnect at this point — we
want to understand the root cause first because the Neon Console
UI suggests something is off with how the integration is registered
on the Neon side (missing Manage UI).

— Identifiers —

Vercel project:                    mallan-nyc
Vercel project ID:                 prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW
Vercel team:                       team_kZQh5NYLyrOKqffK0r9EXf4E
Vercel integration resource ID:    store_K9l79ICRUTMsiRh2
Connected Neon product:            neon-green-school
Neon project ID:                   hidden-mountain-87248164
Neon plan:                         Launch
Neon Console branch count:         8 / 5000
Second Neon project on same
Neon account (NOT connected):      neon-green-door

Production custom domain:          https://mallan.nyc

— Reproduction (any recent preview deploy) —

1. Push any commit to a feature branch in GitHub repo mallan67/mallan-nyc
2. Vercel triggers a preview build. Build succeeds.
   Deployment reaches state=READY.
3. Vercel Deployment Check "Neon branching" is posted with
   conclusion=failure and a one-line title "Branch limit exceeded"
   visible in the per-deployment Checks panel.
4. Clicking the check row does NOT expand a conclusionText
   or detail blob — only the title is exposed.

— Failing deployments (chronological, all state=READY) —

  dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv  SHA dee36576  2026-05-17T04:08Z
  dpl_Hi52RLwdx2xvT8JSqkGiQ6no2Fgx  SHA 3797ce8c  2026-05-17T04:16Z
  dpl_64VnrREDyyjf9c9vEqcsFbtkSwGi  SHA aeea758c  2026-05-17T04:28Z
  dpl_BAgcasV52rwmewyC8UMGWfhGS1nv  SHA 915a734a  2026-05-17T04:33Z
  dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV  SHA f3686521  2026-05-17T05:35Z

Each posted the failing "Neon branching: Branch limit exceeded"
check. Each is READY. Each is in the Neon Console-reported branch
count of 8 (the integration is creating branches successfully —
the cap-exceeded message is the only failure).

— Unaffected control —

Production deployment (target=production, alias=mallan.nyc):

  dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx  SHA 9fa75a4d  2026-05-17T06:08Z

This deployment uses a separate DATABASE_URL that does NOT go
through the Vercel-Neon integration env-injection path. It is
healthy:
  curl https://mallan.nyc/api/health  →  HTTP 200 {"success":true}
  curl https://mallan.nyc/search?…    →  HTTP 200, renders correctly

— What we observe on the Neon side —

Neon Console → Project: neon-green-school (ID hidden-mountain-87248164):
  - Plan: Launch
  - Branches: 8 of 5000 used
  - Branch list is healthy — no orphaned or stuck-in-deletion entries
  - Project → Settings → Integrations:
      The Vercel connection appears in the list but does NOT expose
      the usual Manage / Settings / Integrated Branches / Disconnect
      buttons. Only "Manage Neon subscription" is shown.
  - The other Neon project (neon-green-door) on the same Neon
    account is NOT connected to this Vercel project; we are
    intentionally leaving it that way.

— What we observe on the Vercel side —

Vercel UI → Project mallan-nyc → Settings → Integrations → Neon:
  - "Active connected" card shows neon-green-school connected to
    mallan-nyc across All Environments.
  - "Not connected" card shows neon-green-door with a
    "Connect to Project" button (intentionally not connected).
  - Configure panel (clicked but not modified):
      [Maya — please paste what the Configure panel currently
       shows for the bound Neon project, region, and any toggles
       such as "Automatically delete obsolete Neon branches"]

— Side-effect: preview branch alias rotation stalls —

A consequence we have measured: when "Neon branching: Branch limit
exceeded" fires on a preview deploy, the Vercel preview branch alias
mallan-nyc-git-<branch>-mallan.vercel.app stays pinned to whichever
earlier deployment last had the check Skipped, instead of rotating
to the latest READY deployment.

Concrete evidence: on the feature branch above (5 preview deploys),
the alias stayed pinned to the first deploy (dpl_3VozPXSUYh) through
all four subsequent successful builds. Direct curl proof:

  curl -s "https://mallan-nyc-git-<branch>-mallan.vercel.app/search?…"
    | grep -oE 'dpl=dpl_[A-Za-z0-9]+'
  → dpl=dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv  (first deploy, stale)

  curl -s "https://mallan-db3hg2e11-mallan.vercel.app/search?…"
    | grep -oE 'dpl=dpl_[A-Za-z0-9]+'
  → dpl=dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV  (most recent, correct)

Vercel's get-deployment API for both the latest and the first deploy
each claim `"alias": ["mallan-nyc-git-…-mallan.vercel.app"]`,
so the API says ownership rotated; the actual edge routing did not.

We are not sure whether the alias-rotation gate is intentional or
a side-effect of the failing integration check.

— GitHub-side propagation —

Confirmed via GitHub REST API:
  gh api repos/mallan67/mallan-nyc/commits/<sha>/check-runs
  gh api repos/mallan67/mallan-nyc/commits/<sha>/statuses

Both return ZERO entries named "Neon branching" for any of the
affected SHAs. GitHub does NOT see this check. Our merges therefore
proceed normally — but the Vercel UI keeps flagging it, and the
alias-rotation side-effect costs us debugging cycles.

— What we have ruled out —

- Actual branch exhaustion (Neon Console = 8/5000)
- Wrong Neon project (Vercel Integrations panel confirms
  neon-green-school is the bound one)
- Real Neon API failure (the integration creates the preview
  branches successfully — the cap-exceeded message fires AFTER
  the branch is provisioned)
- Stale GitHub branch protection (no protection enforced on main;
  no required-check rule references this integration check)
- Stale build cache on our side (we verified the deployed JS
  chunk reflects the source code byte-for-byte)
- Stale browser cache (verified with multiple browsers + curl
  against the immutable Vercel URLs)

— Asks (in order of priority) —

1. Where does the Vercel "Neon branching" integration check source
   its quota number from?
     - The Neon API's GET /v2/projects/<id>/branches?limit_check=1
       (or similar endpoint)?
     - A cached value the integration backend keeps?
     - A value embedded in the integration's plan metadata?

   If a cache exists, how do we force its invalidation without
   disconnecting/reconnecting the integration?

2. Why does the Neon Console Integrations page NOT expose the
   typical Manage / Settings / Integrated Branches / Disconnect
   affordances for this Vercel connection? We see only
   "Manage Neon subscription." Is the integration registered
   correctly on the Neon side?

3. Why is no conclusionText exposed for the failing check? Per
   Vercel docs the check-runs API model supports both `.output.title`
   and `.output.summary`. The integration appears to set the title
   but not the summary. Is this a known limitation or a bug?

4. Is the preview branch alias auto-rotation intentionally gated
   on integration check success? If yes, can we configure mallan-nyc
   to ungate this specific integration's check while keeping it as
   an advisory signal? If no, the alias-stall is a separate bug.

5. Confirm: the second Neon project on the same Neon account
   (neon-green-door, NOT connected to mallan-nyc) does NOT affect
   the quota resolution for the connected project (neon-green-school).
   We want a definitive yes/no from someone with access to the
   integration's resolution logic.

6. Recommended remediation that preserves our existing production
   env vars (DATABASE_URL, DATABASE_URL_UNPOOLED). We have NOT
   attempted disconnect/reconnect and we want to avoid it if
   alternatives exist.

— What we are NOT asking for —

- We do not want our production DATABASE_URL credentials changed
- We do not want any Neon branches deleted by support
- We do not want a forced rotation of the integration's keys
- We do not want anyone to connect neon-green-door

— Attachments (separate files) —

- screenshot-neon-console-branch-widget.png
    Neon Console → neon-green-school → showing 8 / 5000

- screenshot-neon-console-integrations-page.png
    Neon Console → Settings/Integrations → showing the Vercel
    connection with only "Manage Neon subscription" exposed

- screenshot-vercel-failing-check.png
    Vercel UI → dpl_29Kmkr77… → Checks panel → expanded "Neon
    branching" row showing only the title, no conclusionText

- screenshot-vercel-integrations-panel.png
    Vercel UI → Settings → Integrations → Neon → showing both
    products (neon-green-school connected, neon-green-door not)

- screenshot-vercel-configure-panel.png  (optional)
    Vercel UI → Configure on neon-green-school → showing bound
    project, region, and any toggles

Thank you. Please advise on the safest remediation path.
We are happy to provide additional reproduction steps or to
schedule a brief screenshare if needed.

— Maya Allan
   Mallan Real Estate Inc.
   mallan.nyc
```

### F.8.3 · Required attachments

| File | What to capture |
|---|---|
| `screenshot-neon-console-branch-widget.png` | Neon Console → `neon-green-school` → top header or Branches tab showing the "8 / 5000" widget |
| `screenshot-neon-console-integrations-page.png` | Neon Console → Project settings → Integrations tab → showing the Vercel entry with only "Manage Neon subscription" exposed (no Manage / Settings / Integrated Branches / Disconnect buttons) |
| `screenshot-vercel-failing-check.png` | Vercel UI → most-recent failing preview deploy (`dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV`) → Checks panel → "Neon branching" row expanded — capture the entire panel including the headline AND the empty detail area |
| `screenshot-vercel-integrations-panel.png` | Vercel UI → Settings → Integrations → showing both Neon products: `neon-green-school` (Active connected) + `neon-green-door` ("Connect to Project") |
| `screenshot-vercel-configure-panel.png` | Optional, but useful: Vercel UI → Configure on `neon-green-school` → showing bound project name, region, and any toggles like "Automatically delete obsolete Neon branches" |

**Do NOT include in attachments:**
- Any screenshot showing env var VALUES (Production env tab is OK to screenshot but mask the value column if it's expanded)
- Any DATABASE_URL string
- Any Neon password / connection URI
- Any auth tokens / API keys
- Any PII from the mallan.nyc CRM

### F.8.4 · Follow-up tracking

After sending:

1. Add a memory note dated 2026-05-17 with the ticket IDs from both vendors
2. Note the SLA expectations: Launch-plan customers typically get a Neon response within 1 business day; Vercel Pro support similar
3. While the ticket is open: **do NOT** disconnect/reconnect, do NOT trigger rotation, do NOT delete branches. The vendors' diagnostic process may want to inspect the failing state in place
4. Re-validate weekly that production stays healthy: `curl mallan.nyc/api/health` + smoke check `/search` + confirm no production deploy failures
5. If a vendor responds with a remediation step, evaluate it against the runbook's hard holds before executing

### F.8.5 · Decision matrix while ticket is open

| Situation | Action |
|---|---|
| You need to merge a PR | Continue as before. GitHub doesn't see the check; merge is unaffected |
| You need to verify a preview deploy | **DO NOT trust the branch alias.** Use the immutable per-deploy URL (`mallan-<short>-mallan.vercel.app`) shown in the Vercel deployment metadata |
| A vendor asks you to disconnect/reconnect | Pause and check the runbook §F.5.C before executing — pre-action screenshot of Production env tab is required |
| A vendor asks for the failing deploy's check-runs JSON via the Vercel REST API | They'll need a Vercel-scoped token; this is normal. Provide via the support portal, not by pasting in chat |
| Branch count grows beyond 50 | Run the local prune cron (`/api/cron/neon-branch-prune` already does this at 04:00 UTC daily). No action needed |
| Production deploy fails | Roll back via Vercel UI → Deployments → `dpl_GiNFHhM5QWk1BFTrLrzVQgm3ohVx` → Promote |

---

**End of finalized support packet. Awaiting Maya's screenshots → packet send.**
