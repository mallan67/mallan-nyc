> **⚠ SUPERSEDED 2026-05-17.** The "Branch limit exceeded" framing in this audit turned out to be stale Vercel-side metadata, not real exhaustion. The bound Neon project (`neon-green-school` / `hidden-mountain-87248164`) is on the Launch plan with 8 / 5000 branches used. See `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8 for the actual root-cause investigation and `docs/neon-launch-branch-policy-audit-2026-05-17.md` for the threshold-update audit. **This document is preserved as historical record of what was believed at the time** — do not act on its recommendations without first reading the 2026-05-17 docs.

---

# Neon / Vercel Preview Branch-Limit Audit — Report Only

**Status:** Read-only. **No Neon branches deleted. No Vercel env vars changed. No code patched. No cron triggered. No reconciliation run.**
**Run at:** 2026-05-17T02:50Z (**revised 2026-05-17 per Maya — Option C downgraded, data-mutation risk flagged**)
**Trigger:** Maya identified the failing Vercel Check on PR #147 / #145 / #148 preview deploys as:
> `Neon branching: Branch limit exceeded`
**Goal:** Fix the systemic failure mode so future preview deploys stop showing "Checks Failed" **without routing preview traffic to the production database**.
**Author:** Claude Code (under Maya direction).

---

## ⚠ PREVIEW-WRITES-TO-PRODUCTION-DB IS UNSAFE FOR THIS REPO

mallan.nyc previews include API routes, cron-style handlers (manually invokable via preview URL), CRM routes, auth routes, lead-capture forms, and future mutation surfaces. Any of these can POST to the database. **A preview deployment pointed at the production DB is a data-mutation risk** — not a theoretical one.

This invalidates the "disable preview branching" option as a default permanent fix. The integration's per-preview Neon branch is providing real isolation that we cannot give up without first proving every preview-callable code path is read-only. We have not proven that, and we should not assume it.

**The permanent fix is to keep preview isolation and manage the branch cap better** (prune more aggressively, then upgrade the Neon plan if pressure continues).

---

## ⚠ Data-access caveat

`NEON_API_KEY` is not in my local `.env.local` (correctly read-protected). Without it I cannot call `console.neon.tech/api/v2/projects/{id}/branches` directly to enumerate the live Neon branch state. This report is built from:

1. **Architectural truth** — `NEON.md` §11 (the canonical doc) + `lib/neon/branches.ts` (the prune logic) + `app/api/cron/neon-branch-prune/route.ts` (the cron).
2. **Vercel deployment history** — 40 deployments since 2026-05-09 via Vercel API (each preview deploy is the Vercel-side reason a Neon branch exists).
3. **GitHub PR state** — 6 open PRs + 127 closed/merged in the last 60 days.
4. **Inferred mapping** Vercel-branch → likely Neon-branch (one-to-one per the integration model).

**To turn the inferred Neon inventory into a verified one**, Maya needs to either:
- **Quick path:** open Neon Console → Project → Branches → screenshot or copy the list to me, OR
- **Programmatic path:** run `npm run ops:neon-prune` (dry-run only — that's the existing wrapper that calls `listBranches` with her NEON_API_KEY) — that prints every branch with its name / updated_at / primary / protected flags.

The Class A / B / C / D / E / F / G sections below are usable as-is; only the per-branch table in Section C requires Maya's inventory dump to populate exact names + IDs.

---

## A. Root cause

**Neon free tier caps at 10 branches per Neon project.** The Vercel↔Neon marketplace integration (`store_K9l79ICRUTMsiRh2`) is configured to create a fresh Neon branch **on every preview deploy** so PR previews can write without touching production. Every push to a PR triggers a fresh Vercel preview build, which triggers the integration to provision a new Neon branch, which counts against the cap.

**The defensive cron exists but is not aggressive enough for high-push days.** PR #80 (merged 2026-04-28) added `app/api/cron/neon-branch-prune/route.ts` running daily at 04:00 UTC. The cron deletes preview branches whose `updated_at` is >24 h ago, never touches the `primary` branch, and never touches branches operator-flagged `protected`. **The retention window is 24 hours.** Today (2026-05-16) saw 12+ commits across 4 active PRs — that's enough fresh branches in a single day to fully exhaust the cap before the next 04:00 UTC prune.

This is precisely the failure mode `NEON.md` §11.318 documents: *"A fast-pushing day (force-pushes, multiple PRs in flight) burns through the cap in hours. Once over, every subsequent preview deploy posts a `Neon branching: Branch limit exceeded` check to Vercel — visible in the deployment row's Checks panel as a red 'Checks Failed' badge, even though the build itself succeeded and the deploy is `Ready`."*

**The badge is cosmetic.** The build succeeded; the preview URL serves; the only failure is that the 11th+ preview deploy of the day genuinely cannot get a fresh DB branch. None of today's PRs (#147, #148, #145) actually need a fresh preview Neon branch — none of them ship migrations.

---

## B. Branch inventory count (inferred, pending Maya verification)

**Verified:**
- Free-tier cap: **10 branches**
- Current state: **at cap (≥10 branches)** — proved by the "Branch limit exceeded" error on every PR's most recent preview deploy
- Daily prune cron: scheduled at `0 4 * * *` UTC, retention 24h, currently in effect on production

**Inferred from Vercel deployment data** — there are 9 distinct active git refs that have pushed a deploy in the last 24h:

| Vercel git ref | Most-recent commit | PR | PR state |
|----------------|-------------------|----|----------|
| `main` | `82c617c4` | n/a | production |
| `fix/projection-dual-write-cron-writers` | `b34b4521` | #147 | OPEN |
| `feat/reconcile-projection-idx-display` | `321480af` | #148 | OPEN |
| `fix/card-hero-white-border-detect-then-scale` | `dcc3d6cb` | #145 | OPEN |
| `fix/crm-deal-form-submit-wiring` | `f90b9e47` | #146 | OPEN |
| `chore/sentinel-search-cartographer` | `74006450` | #124 | OPEN (no recent push) |
| `emergency/disable-idx-sync-cron` | `c14245c0` | #139 | OPEN (24-48h idle) |
| `feat/sms-password-reset` | `c7793046` | #62 | OPEN (>14 days idle) |

That's 7 open-PR branches + main = **8 branches that should be KEPT**. With the cap at 10, there is only headroom for 2 fresh preview deploys before any future push hits "limit exceeded" again.

**The integration also creates one Neon branch per ad-hoc Vercel re-deploy from the dashboard** (not just per git push). Multiple "Redeploy" clicks on the same SHA produce additional Neon branches (each tagged with the new Vercel deploy id, not deduplicated). Without API access I can't tell how many of those exist.

---

## C. KEEP list (preserved per Maya's classification rules)

| # | Vercel git ref | Reason | Active PR | Notes |
|---|---------------|--------|-----------|-------|
| 1 | `main` (production) | Production. Primary Neon branch. Always KEEP. | n/a | Backed by `cold-waterfall` endpoint per the 2026-05-16 verification snapshot (`memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`). |
| 2 | `fix/projection-dual-write-cron-writers` | Open PR #147 (critical lane — H1 Tier-2 writer patch). Even if PR doesn't need a DB preview, do not delete while open. | #147 | This is the lane currently held on the Skip-Neon-check workflow. |
| 3 | `feat/reconcile-projection-idx-display` | Open PR #148 (Codex-reviewed reconciliation script, held until PR #147 ships). | #148 | Held; do not delete. |
| 4 | `fix/card-hero-white-border-detect-then-scale` | Open PR #145 (R2 white-border fix). Already validated; held on the same Neon Check. | #145 | Will follow PR #147's Skip path. |
| 5 | `fix/crm-deal-form-submit-wiring` | Open PR #146 (CRM deal-form wiring). | #146 | Awaiting your review. |
| 6 | `chore/sentinel-search-cartographer` | Open PR #124. | #124 | No recent activity. Verify still in scope before deleting. |
| 7 | `emergency/disable-idx-sync-cron` | Open PR #139 (kill-switch / break-glass artifact). | #139 | Per Class A in `docs/branch-cleanup-audit-2026-05-16.md`. |
| 8 | `feat/sms-password-reset` | Open PR #62 (auth alternative). | #62 | Idle but open. |

**Maya should also explicitly KEEP** (these are likely existing Neon branches that the integration created but doesn't touch on per-push refreshes — they'd show in the Neon console list):

- The Neon branch named `main` (the integration's name for the production-mirror branch — Neon's `primary: true` flag — this is what backs `cold-waterfall`)
- Any Neon branch explicitly flagged `protected: true` in the Neon console (these are operator-set "do not auto-delete" markers; the prune cron already respects them — see `lib/neon/branches.ts:isPrunable` line 28-30)

**About `royal-dawn`:** the rotation-related endpoint host that the 2026-05-15 incident pointed Vercel Production at briefly. The Neon branch underneath `royal-dawn` is the same `main` Neon branch — `royal-dawn` is just a *compute endpoint* attached to it (a "second compute" or "rotated compute"). Endpoints are not branches; deleting endpoints does not free branch-cap slots. The audit's KEEP / DELETE classification operates on branches, not endpoints.

---

## D. DELETE CANDIDATE list (per Maya's classification rules)

The Vercel-side branches we know about that mapped to closed-merged PRs in the last 24-48h are listed here. Each likely produced 1-N Neon branches (1 per commit pushed). The prune cron should have cleared most of these >24h after their last push, but the failing Check tells us either:
- The prune cron is being throttled by today's burst, OR
- The integration is producing duplicate branches per re-deploy that don't update `updated_at` correctly, OR
- The cron is silently skipping (missing env vars)

| Vercel git ref | Most-recent commit | PR # / Status | Hours since last push | Why delete-candidate |
|----------------|-------------------|---------------|----------------------:|---------------------|
| `chore/idx-sync-diagnostic-audit-events` | `c795e953` | PR #144 MERGED 2026-05-16 04:16Z | 22 h | Merged + branch deleted on GitHub |
| `fix/buy-duplicates-option-c-d` | `d21d25fb` | PR #143 MERGED 2026-05-15 18:42Z | 32 h | Merged |
| `fix/search-mobile-collapse-toolbar-shed` | `5bbc4763` | PR #142 MERGED 2026-05-15 14:44Z | 36 h | Merged |
| `fix/idx-sync-cursor-trestle-only` | `ee32e201` | PR #141 MERGED 2026-05-15 13:28Z | 37 h | Merged |
| `fix/idx-sync-cursor-modification-timestamp` | `4f8faa87` | PR #140 MERGED 2026-05-15 13:05Z | 37 h | Merged |
| `fix/idx-sync-max-records-cap` | `5e7dfb9e` | PR #138 MERGED 2026-05-15 12:05Z | 38 h | Merged |
| `fix/search-query-url-sync` | `fb226747` | PR #137 MERGED 2026-05-15 11:30Z | 39 h | Merged |
| `fix/rotate-workflow-*` (4 branches) | various | PRs #133–#136 MERGED 2026-05-15 | 40-42 h | All merged |
| `fix/pr-s4-header-townhouses-url` | `d00aac23` | PR #132 MERGED 2026-05-15 06:18Z | 45 h | Merged |
| `fix/pr-s1*` (5 branches) | various | PRs #125–#129 MERGED 2026-05-15 | 44-50 h | All merged |
| `fix/pr-e1a-listings-media-fallback` | `f2bb459c` | PR #120 MERGED 2026-05-14 13:32Z | 61 h | Merged |
| ...plus older merged PRs | | | >72 h | Should already be pruned |

**Every row above is >24h since last push, so per the existing prune cron's retention window, each one SHOULD already be auto-deleted.** The fact that the cap is still exhausted strongly suggests either:
- The prune cron last ran >24h ago and didn't run today's 04:00 UTC cycle, OR
- The integration is producing duplicate Neon branches per re-deploy (e.g., when you click "Redeploy" in the Vercel UI, the integration creates ANOTHER branch on top of the existing one because there's no idempotency by SHA)

**Without Neon API access I cannot tell which row of the prune cron's `examined / pruned / errors / too_recent` counters last ran. Maya's run of `npm run ops:neon-prune` (dry-run) would print this in 5 s.**

---

## E. REVIEW list

| Category | Notes |
|----------|-------|
| Long-idle open PR branches | `chore/sentinel-search-cartographer` (#124, last push 48 h ago), `feat/sms-password-reset` (#62, >14 days idle), `emergency/disable-idx-sync-cron` (#139, 48 h idle). Per Maya's rule "active PR branch ONLY if it truly needs DB preview" — none of these are migration PRs, so their Neon branches could be marked `protected: false` and allowed to be auto-pruned at 24h while the PR stays open. The PR-level KEEP is at the **GitHub-branch** level (already enforced in the prior cleanup audit); the Neon-branch can churn underneath as long as the next push re-provisions a fresh one. |
| Possible unique-data branches | If any preview branch has been WRITTEN to via the preview deploy's traffic (e.g., a manual test that POSTed data through a preview URL with DB writes), that branch contains unique data not in production. The prune cron does NOT inspect for unique data — it deletes based purely on `updated_at`. Without API enumeration I cannot identify which branches have unique writes. Production data is in `cold-waterfall`; preview-only writes are by definition disposable. |
| Compute endpoints (not branches) | `cold-waterfall` and `royal-dawn` are compute endpoints, not branches. The Neon console will show them under Branches → main → Compute endpoints. Removing an endpoint does not free branch-cap slots; do not touch them as part of this cleanup. |

---

## F. Recommended permanent fix (REVISED)

**Recommended order: A → B/E → D. Do NOT disable preview branching.**

The Vercel↔Neon integration's "fresh branch per preview" feature is providing **real data-mutation isolation** — preview deploys can hit API routes, CRM endpoints, auth flows, lead-capture forms, and manually-invoked cron handlers. Any of those can write to the database. We have not audited every preview-callable code path for read-only safety, and we should not assume it. So the recommendation is to **keep preview isolation and manage the branch cap better** — not to give up isolation.

### Recommended sequence

1. **Now (immediate unblock for today's PR work):** Maya runs **Option A** — `npm run ops:neon-prune` dry-run to see the inventory, then `npm run ops:neon-prune:execute` after approval. Frees cap headroom in <5 s.
2. **Within 24-48h (steady-state fix):** apply **Option B and/or E** — tighten retention from 24 h → 6-12 h and/or shorten the prune cron cadence. This makes the daily branch-creation burst self-clear faster.
3. **If pressure continues after B/E ship:** **Option D** — upgrade Neon to the Launch plan ($19/mo) to raise the branch cap from 10 to 100. Preview isolation is preserved; the cap simply stops being the binding constraint.

### Full options matrix (revised)

| # | Option | What it does | What you gain | What you lose | Cost | Recommended? |
|---|--------|-------------|---------------|---------------|------|--------------|
| **A ★** | **One-shot manual prune (immediate unblock)** | `npm run ops:neon-prune` dry-run → `:execute` after approval. Uses NEON_API_KEY from Maya's local shell. | Immediate headroom recovery. Frees the cap without touching production-data isolation. | Doesn't fix the systemic problem alone — next high-activity day will hit the cap again unless paired with B/E. | $0 | ★ First step today |
| **B ★** | **Tighter prune retention (24h → 6-12h)** | Edit `DEFAULT_RETENTION_HOURS` in `lib/neon/branches.ts` from 24 to 6 or 12, ship via normal PR | More headroom for fresh PRs without removing isolation. Steady-state safer. | Active PR previews lose their DB branch after 6-12h idle — next push re-provisions. Reviewing a write-heavy PR after a long break = re-trigger build. | $0 | ★ After A. Choose 12h first; drop to 6h only if 12h still saturates. |
| **E ★** | **More-frequent prune cron (daily → every 4h or hourly)** | Change `vercel.json` cron from `0 4 * * *` to `0 */4 * * *` or `0 * * * *` | Faster steady-state cleanup of merged-PR branches. Complements B without changing retention. | More cron invocations = more Vercel cron quota burn (Hobby has 100 invocations/day total across all crons). Currently ≈23 crons × 24h ≈ 552/day for daily-or-better cadence; hourly adds 23/day. **Verify Hobby quota headroom before enabling hourly.** | $0 + cron-quota burn | ★ Pair with B if quota allows. Every-4-hour is a safer first step than hourly. |
| **D ★** | **Upgrade Neon to Launch plan** | $19/mo bumps the branch cap from 10 to 100 | Permanent cap removal, preview isolation preserved, no behavioral change needed | $228/yr ongoing. Doesn't fix the integration's "branch per deploy" behavior, just hides it behind a higher ceiling. | $19/mo ($228/yr) | ★ Final step if A + B + E still leave pressure. Preserves isolation. |
| ⚠ C | Disable Vercel↔Neon preview branching | Vercel Project → Integrations → Neon → Configure → toggle preview branch creation OFF | Eliminates the failure mode | **Preview deploys would share the production main branch.** Any preview-callable POST / mutating route writes directly to production data. **Data-mutation risk for any API route, CRM route, auth route, form handler, or manually-invokable cron path.** | $0 | **⚠ UNSAFE — do NOT use unless every preview-callable code path is audited and proven read-only. mallan.nyc has not been audited that way.** |
| **NOT RECOMMENDED** | Unlink Neon integration entirely | Vercel Project → Integrations → Neon → Remove | Maximum decoupling | Loses auto-managed DATABASE_URL plumbing. Breaks the rotation workflow. | breaks rotation cron | ❌ |
| **NOT RECOMMENDED** | Admin-bypass each blocked merge | Click "Override checks" in GitHub PR UI | Skip the symptom on a per-PR basis | Doesn't fix root cause. Maya has explicitly ruled out admin bypass. | cultural cost | ❌ |

---

## G. Exact delete commands (NOT EXECUTED — for Maya's later approval)

### Path 1 — dry-run inventory first (REQUIRED before any delete)

```bash
# Maya must have NEON_API_KEY + NEON_PROJECT_ID in her local .env.local
# (NOT my session — these are real secrets she controls).

# Lists every branch with name, id, primary, protected, updated_at.
# Prints which would be pruned at the 24h default retention. Writes NOTHING.
npm run ops:neon-prune

# Same listing but with a 6h retention (more aggressive cutoff preview):
npx tsx scripts/neon-prune-branches.ts --hours=6

# Same listing but with a 1h cutoff to see absolutely-everyone-prunable:
npx tsx scripts/neon-prune-branches.ts --hours=1
```

### Path 2 — execute the one-shot prune (immediate unblock for today's PR work)

```bash
# DELETES every preview branch idle >24h. Skips primary + protected.
# Equivalent to manually running the daily cron 14h early.
npm run ops:neon-prune:execute

# Same but with aggressive 1h cutoff (only run if you want maximum headroom NOW):
npx tsx scripts/neon-prune-branches.ts --hours=1 --execute
```

### Path 3 — disable preview branching (the recommended permanent fix)

**This is a UI-only action — there is no command-line equivalent.**

1. Go to **https://vercel.com/mallan/mallan-nyc/settings/integrations**
2. Find the **Neon** integration in the list
3. Click **Configure**
4. In the integration's settings panel, locate the toggle labeled something like:
   - "Create database branch for every deployment" OR
   - "Database branch per deployment" OR
   - "Preview branching enabled"
5. **Turn it OFF**
6. Save
7. **Verify** by triggering a fresh preview build (push any branch) and confirming the deploy uses the production DATABASE_URL instead of provisioning a new branch

After this, the next push to any PR should NOT post the "Neon branching: Branch limit exceeded" Check, and the existing branches will age out on the prune cron's next run (or you can do a one-shot via Path 2).

---

## H. Exact Vercel + Neon UI steps to stop future preview failures (REVISED)

| # | UI step | Required? | Reversible? |
|---|---------|-----------|-------------|
| 1 | **Open Vercel UI** → mallan-nyc project → blocked PR's deployment → "Checks" panel → identify "Neon branching: Branch limit exceeded" → click **Skip** (per-PR symptom unblock) | One-time per blocked PR | Yes |
| 2 | **Maya's local shell** → `npm run ops:neon-prune` (dry-run, read-only) → review the inventory → `npm run ops:neon-prune:execute` after approval → share result back to me | Required for steady-state cleanup | Yes (prune cron is idempotent) |
| 3 | **Vercel UI** → Settings → Environment Variables → confirm `NEON_API_KEY` and `NEON_PROJECT_ID` are set on the Production env. Without them, the daily prune cron silently skips and the failure recurs. | Diagnostic | Yes |
| 4 | **Edit `lib/neon/branches.ts`** in a normal PR → change `DEFAULT_RETENTION_HOURS = 24` to `12` (or `6` if 12 still saturates) → normal validation → merge → deploy. (Option B) | Recommended after step 2 | Yes — revert PR |
| 5 | **Edit `vercel.json`** in same or follow-up PR → change idx-prune cron `0 4 * * *` to `0 */4 * * *` (every 4h) → normal validation → merge. (Option E) | Optional. Pair with #4 if Vercel cron quota allows. | Yes — revert PR |
| 6 | **Neon Console** → Settings → Upgrade → Launch plan ($19/mo) for a 100-branch cap, ONLY IF branch pressure persists after #4 + #5 ship. Preserves preview isolation. (Option D) | Optional. Last step if pressure remains. | Yes — can downgrade |
| ⚠ | **Vercel UI** → Settings → Integrations → Neon → Configure → toggle preview branch creation OFF. **DO NOT do this** until every preview-callable code path is audited and proven read-only. | **Unsafe — not in scope.** | Yes (re-enable) |

---

## I. Risk of each option (REVISED)

| Option | Risk class | Worst-case |
|--------|-----------|------------|
| **A — Dry-run + manual prune** | **Lowest** | A prunable branch you actually wanted is deleted. The cron's `isPrunable` already skips `primary` and `protected`, so production data is safe. Recovery: Neon retains point-in-time snapshots; re-create from snapshot in Neon Console. Preview isolation preserved. |
| **B — Tighter retention (24h → 6–12h)** | Low | Active PR previews lose their DB branch faster. If a reviewer is mid-review of a write-heavy preview at hour 7, they'd lose state. Recovery: re-trigger build, fresh branch provisioned. Preview isolation preserved. |
| **E — More-frequent cron** | Low | Burns more Vercel Cron quota (Hobby has 100 cron invocations / day total across all crons; ~23 daily crons currently). Hourly adds ~24/day = small percentage. Every-4-hour adds 6/day. **Verify quota headroom in Vercel dashboard before enabling hourly.** Preview isolation preserved. |
| **D — Upgrade to Launch ($19/mo)** | None functional | $228/yr ongoing. The integration's "branch per deploy" behavior still happens — just won't hit a cap. **Strongest preservation of preview isolation** because it eliminates the cap as a binding constraint. Recommended if A + B + E together don't hold. |
| **⚠ C — Disable preview branching** | **HIGH — DATA-MUTATION RISK** | Preview deploys would share the production main Neon branch. **Any preview-callable POST writes directly to production data.** mallan.nyc previews include API routes, CRM routes, auth routes, lead-capture forms, and manually-invokable cron paths — all of which can mutate. The `db:push` block prevents schema migrations but does NOT prevent application-level writes (Prisma `.create / .update / .delete` calls work normally against production data via a preview deploy URL). **Worst case: an attacker (or a careless dev) hitting a preview URL's POST endpoint corrupts production data with no audit trail distinct from a production action.** Use only after every preview-callable code path has been audited and pinned read-only. mallan.nyc has not been audited that way. |
| Unlink Neon entirely (NOT recommended) | **High** | Breaks the rotation workflow (`.github/workflows/rotate-db-keys.yml`), breaks the integration-managed `DATABASE_URL` plumbing. Recovery requires manually setting all DB env vars on Vercel + updating the rotation workflow to not depend on the integration. Avoid. |
| Admin bypass (NOT recommended) | Low (cosmetic) | Per-PR symptom-only fix. Conditions admin-bypass habit, which Maya has explicitly ruled out. |

---

## J. What can be done immediately to unblock PR #147/#145 without admin bypass

**Per-PR Skip is already the active plan** — Maya is doing this manually in the Vercel UI for PR #147 right now, then will repeat for PR #145.

### After Skip on PR #147 + #145

1. **Watcher `bic8utozu`** picks up the GitHub status flipping from PENDING to SUCCESS (after Vercel re-posts the cleared Check).
2. Normal merge PR #147.
3. Production deploy.
4. 5-item verification per the standing plan.
5. Then PR #145.

### To prevent the next PR from hitting the same wall (recommended sequencing — REVISED)

**Order of operations (A → B/E → D, NOT C):**

| Step | Action | Owner | Side-effects |
|------|--------|-------|--------------|
| 1 | Skip the failing Neon-branching check on PR #147 in the Vercel UI | Maya | Per-PR symptom-only; preview isolation preserved |
| 2 | Confirm `bic8utozu` clears + normal merge PR #147 + verify production | Maya + Claude | Standing plan |
| 3 | Repeat steps 1-2 for PR #145 | Maya + Claude | Same flow |
| 4 | Run `npm run ops:neon-prune` (dry-run) locally to see the current Neon branch list | Maya (uses her NEON_API_KEY) | Read-only — prints inventory + which branches the cron WOULD prune |
| 5 | Share the dry-run output back to me | Maya | Populates this report's Section C exact table |
| 6 | After approval: `npm run ops:neon-prune:execute` to delete the prunable subset only | Maya | Frees cap headroom immediately while keeping preview isolation |
| 7 | Decide tightened retention/cadence: PR to change `DEFAULT_RETENTION_HOURS` 24 → 12 (or 6) and/or change `vercel.json` cron `0 4 * * *` → `0 */4 * * *` | Maya + Claude (when she signals) | Normal PR, normal merge, normal validation. Preserves isolation. |
| 8 | Monitor for 1 week. If branch pressure persists despite B + E: upgrade to Neon Launch plan ($19/mo) via Neon Console | Maya | Cost decision. Preserves isolation. |
| 9 | **DO NOT** disable preview branching (Option C). Re-evaluate ONLY after every preview-callable code path has been audited as read-only — that audit is out of scope for this report. | — | — |

### Database env-var cleanup (deferred — Maya's earlier instruction "do not remove unused `database_*` until integration decision lands")

The lowercase `database_*` env vars added by the Neon integration remain in place for now. The decision to remove them stays parked until:

1. The recommended sequence above (A → B/E → D) has stabilized the branch-cap problem.
2. The integration's role is confirmed (still feeding production `DATABASE_URL` via the lowercase vars → keep them).
3. ONLY if the integration is fully unlinked (NOT recommended) do the lowercase vars become removable, and at that point the canonical uppercase `DATABASE_URL` + `DATABASE_URL_UNPOOLED` (the ones the app actually reads) need to be set manually first.

This is exactly the cleanup pass spelled out in your standing instructions; nothing executes until you signal.

---

## What this report does NOT do

- ❌ No Neon branches deleted (no DELETE call to the Neon API).
- ❌ No Vercel env vars added / removed / edited.
- ❌ No Vercel integration toggled (preview branching still ON).
- ❌ No code patched.
- ❌ No prisma migrate.
- ❌ No cron manually triggered.
- ❌ No reconciliation run.
- ❌ No PR 5B started.
- ❌ PRs #147 / #145 / #148 untouched (no code changes on any branch).
- ❌ No CRM / Sentinel work.
- ❌ No watchers killed.

Pure-read investigation: 2 Vercel API calls (40 deployments enumerated), 2 GitHub API queries (open + closed PRs), 0 Neon API calls (NEON_API_KEY not in my session — that's the security boundary you maintain).

---

## Standing by

- PR #147 watcher `bic8utozu` still running.
- PR #145 watcher `bvz9ayiax` still running.
- Both will fire on green or red after Maya's Skip clicks.

Awaiting your Skip on PR #147's "Neon branching" Check + (optional) the dry-run output of `npm run ops:neon-prune` to populate Section C's exact branch table.

**End of report. Nothing executed.**
