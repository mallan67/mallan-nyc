# Neon Launch-plan branch-policy audit

**Status:** OPEN · REPORT ONLY · No patches. No env. No branch deletes. No cron disable. No reconnect. No migrations. No reconciliation. No PR 5B. No CRM/Sentinel.
**Date:** 2026-05-17T07:05Z
**Author:** Claude Code, under Maya direction.
**Scope:** Audit every place the repo encodes Neon free-tier branch-cap assumptions and recommend Launch-safe replacements. Defer all patches to a separate approval cycle.

---

## TL;DR

1. **Code-level runtime behavior is affected in exactly one place:** `scripts/ops-health.js` emits a `warning` every time the Neon branch count is ≥ 8 ("within 2 of free-tier 10-branch cap"). On a Launch plan with 5000-branch cap and a steady-state of 8 branches, this fires **every single ops:health run forever** — false-positive noise. Fix is a one-line threshold change.
2. **Documentation is heavily drifted but operationally harmless** — six files repeatedly cite the 10-branch cap as the rationale for the prune cron + retention window. None of these references drive code paths.
3. **The prune cron + retention window remain useful** even at 5000-branch cap, but for a different reason: hygiene (don't accumulate dead branches indefinitely) and cost-awareness (a paid plan with thousands of stale branches is still operational debt). Keep them, lower the urgency framing.
4. **Parallel observation (reclassified 2026-05-17 post-PR-#150 to NEEDS RE-EVALUATION):** the `NEON_PROJECT_ID` value the rotate-db-keys workflow uses is `morning-bread-68708332` (per its runtime env), while the Vercel integration creates preview branches on `hidden-mountain-87248164`. The original §C.4 of this audit assumed the Vercel-runtime `NEON_PROJECT_ID` matches the GH-Actions value and concluded the prune cron targets the wrong project. The post-PR-#150 ops:health smoke (cron run `status=ok, examined=17, pruned=10, errors=0`) contradicts that conclusion. The likely explanation is that the two surfaces (Vercel env vs GitHub Actions env) **intentionally differ** because they serve different automations — preview-branch hygiene vs production credential rotation. See §C.4 below for the corrected classification + read-only confirmation steps. **No behavior change recommended without those proofs.**

---

## A. Every stale free-tier assumption found

Listed in execution order: **runtime-affecting first**, then docs.

### A.1 — `scripts/ops-health.js` THRESHOLDS object (lines 33–44)

```js
const THRESHOLDS = {
  storage_free_cap_mb: 500,             // ← stale free-tier value
  storage_warning_pct: 0.80,            // % of 500 MB → 400 MB
  storage_upgrade_pct: 0.85,            // % of 500 MB → 425 MB
  compute_free_cap_hours: 191.9,        // ← stale; Launch is different
  compute_warning_hours: 160,           // = 83% of 191.9
  sync_error_warn_24h: 20,              // unrelated to plan; leave
  sync_error_critical_24h: 100,         // unrelated to plan; leave
  sync_watermark_stale_hours: 2,        // unrelated to plan; leave
  archive_backlog_warn: 1000,           // unrelated to plan; leave
};
```

Five entries reference the old free-tier caps. Two (`compute_free_cap_hours` and the 191.9 figure) are even further out-of-date — per `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md:274`, the post-2025 reset moved free-tier compute to 100 CU-hours; the 191.9 figure was an even earlier reading.

### A.2 — `scripts/ops-health.js` branch-count warning (lines 286–291)

```js
if (typeof lastPrune.changes?.examined === 'number' && lastPrune.changes.examined >= 8) {
  report.issues.push({
    level: 'warning',
    category: 'neon-prune',
    msg: `${lastPrune.changes.examined} Neon branches examined — within 2 of free-tier 10-branch cap`,
  });
}
```

This is **the only place** in code that emits an alert tied to the 10-branch cap. With Maya's current 8/5000 state, every nightly `ops:health` run from now on emits this `warning`, causing the verdict to flip from `healthy` to `warning` for a non-issue. The cron route also exits 1 in that case (warning verdict), so any CI/cron that gates on `ops:health` exit code is now permanently yellow.

### A.3 — `scripts/ops-health.js` block-comment for the warning (line 214)

```
//   - warning  if examined branch count >= 8 (within 2 of free-tier 10 cap)
```

Comment mirrors A.2; needs the same threshold + framing update.

### A.4 — `scripts/ops-health.js` storage-trigger logic + human output (lines 302–319, 401–404)

```js
report.triggers.storage_upgrade_needed = report.storage.pct_of_free >= THRESHOLDS.storage_upgrade_pct * 100;
report.triggers.storage_warning = report.storage.pct_of_free >= THRESHOLDS.storage_warning_pct * 100;
…
console.log(`  Upgrade to Launch needed: ${r.triggers.storage_upgrade_needed ? 'YES — 85%+ sustained' : 'no'}`);
```

The `pct_of_free` field name + the "Upgrade to Launch needed" line both leak the free-tier framing. Math itself is still correct relative to whatever cap is set in `storage_free_cap_mb`, but the variable names and the human-output string need a rename to match Launch reality.

### A.5 — `NEON.md` (canonical operational doc)

Multiple stale assertions. Verbatim quotes with line refs:

| Line | Assertion | Reality |
|---|---|---|
| §2 table (line 33) | "Storage **500 MB** free-tier cap" | Launch storage cap is **10 GB** per Neon docs |
| §2 table (line 36) | "Compute time **191.9 hours / month** on primary branch" | Launch compute is **300 CU-hours / month** baseline + overage billing per Neon Launch plan |
| §11.318 (line 320) | "Neon's free tier caps at **10 branches per project**" | Launch is **5000 branches per project** |
| §11.320 (line 320) | "The 11th preview deploy of the day genuinely cannot get a fresh branch" | False on Launch |
| §11.330 (line 330) | "free-tier 10-branch cap" rationale for the cron | Cron still useful; rationale changes from cap-avoidance to hygiene |
| §11.343 (line 343) | "Upgrading Neon to a paid tier that lifts the 10-branch cap" listed as ESCAPE HATCH | Already done — text contradicts current reality |
| §3 Trap #3 (lines 78–82) | "Neon free tier auto-suspends after 5 min idle" | Auto-suspend behavior persists on Launch plan as well by default; statement is true but framed as a free-tier-specific trap |
| §7 Playbook A (lines 219–227) | "Last resort: upgrade to Launch ($19/mo, 300 compute hrs, 10 GB)" | Already done |
| §10 change log (multiple) | References "free-tier 10-branch cap" as rationale for PR #80 + PR #81 | Historical; safe to keep but should add a "now on Launch" note at the top |

### A.6 — `lib/neon/branches.ts` (lines 6–11, 30–31)

Module-level docstring:

> "the Neon-Vercel marketplace integration creates a fresh DB branch on every preview deploy so PR previews can write without polluting production. Convenient — but Neon's **free tier caps at 10 branches per project**, and a fast-pushing day burns through that quickly. Once the cap is hit, every subsequent preview deploy posts a 'Neon branching: Branch limit exceeded' check to Vercel…"

The code itself is correct (the `DEFAULT_RETENTION_HOURS = 24` and `isPrunable` logic don't reference any cap). Only the comment is stale.

### A.7 — `scripts/neon-prune-branches.ts` (lines 5–13)

> "Neon's free-tier project caps at 10 branches. The Neon-Vercel marketplace integration creates a fresh branch on every preview deploy, so a fast-pushing day fills the quota and every subsequent preview shows 'Neon branching: Branch limit exceeded' in Vercel's deployment Checks panel."

Comment-only. Logic is fine.

### A.8 — `app/api/cron/neon-branch-prune/route.ts` (lines 2–11)

> "Without pruning, a fast-pushing day burns through the **free-tier 10-branch cap** and every subsequent preview deploy posts 'Branch limit exceeded' to Vercel's Checks panel. With this cron + a 24h retention window, branches auto-expire long before the cap is hit."

Comment-only. Logic is fine.

### A.9 — `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` (§1, §10, §15, §16)

This is a forward-looking design doc for a SEPARATE Neon project (`mallan-public-records`). It explicitly plans to stay on Free tier — see §1.21:

> "Free-tier limits (500 MB storage, 100 CU-hr/month compute, 10 branches per project) are enforced per-project, not per-account. The free tier allows up to 10 projects per account."

Two interpretations:

- **Option 1 — Keep public-records on Free tier as designed:** the audit leaves this doc alone. The free-tier framing is still operationally accurate FOR THAT FUTURE PROJECT. Decision deferred to whoever provisions public-records.
- **Option 2 — Reconsider and put public-records on Launch too:** consolidate billing onto one Launch plan. Requires a charter conversation and is out of this audit's scope.

This audit recommends Option 1 (leave alone). The charter is the binding source for that decision, not this audit.

### A.10 — `docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md`

The whole doc was written under the "10-branch cap is causing real exhaustion" assumption. Now we know:
- The integration is on Launch (5000 cap).
- The cap is not actually hit.
- The "Branch limit exceeded" check is stale/cosmetic.

The doc is **historically accurate for what was understood at the time**. Don't edit the body. Add a banner at the top that says "Superseded by `docs/neon-vercel-integration-repair-plan-2026-05-17.md` — the cap framing turned out to be stale Vercel-side metadata, not real exhaustion."

### A.11 — `docs/neon-vercel-integration-repair-plan-2026-05-17.md`

I authored this doc earlier today. Sections A–E reference "the free tier caps at 10 branches" several times in the original framing; §F.8 (just-finalized support packet) correctly uses Launch / 5000. Internally inconsistent. Either:
- Add a "superseded by §F.8" banner at the top of the doc, OR
- Pinpoint-edit the original sections to use Launch framing

This audit recommends the banner approach — leaves the investigative trail intact while making the final classification authoritative.

### A.12 — Historical session docs (`memory/SESSION-2026-04-28-allnighter.md`, `memory/NEXT-SESSION-2026-04-28.md`)

Multiple references to "free-tier 10-branch cap" — accurate at the time, archival.

**Don't edit.** These are append-only operational records. The 2026-05-17 audit's finding lives in this new doc, not by retroactively editing 2026-04-28 history.

---

## B. Impact class per finding

| ID | Surface | Impact class | Severity |
|---|---|---|---|
| **A.1** | THRESHOLDS object | **Runtime** — drives all of ops:health's storage + compute warnings | LOW (compute warning was never observed; storage warning at 80% of 500 = 400 MB is well above current 215 MB) |
| **A.2** | Branch-count >=8 warning | **Runtime** — emits a false-positive warning every nightly run | **MEDIUM** — daily noise; ops:health verdict permanently warning; cron exits 1 |
| **A.3** | Code comment above A.2 | Docs only | Trivial |
| **A.4** | Storage-trigger field names + human-output string | Cosmetic / framing | LOW |
| **A.5** | NEON.md §2 / §3 / §7 / §10 / §11 | Docs only | MEDIUM (operational doctrine read by humans + future Claude sessions) |
| **A.6** | lib/neon/branches.ts docstring | Docs only | LOW |
| **A.7** | scripts/neon-prune-branches.ts docstring | Docs only | LOW |
| **A.8** | app/api/cron/neon-branch-prune/route.ts comment | Docs only | LOW |
| **A.9** | public-records provisioning plan | Forward-looking design — leave alone | n/a |
| **A.10** | older preview-branch-limit audit | Banner only | LOW |
| **A.11** | integration repair plan I wrote today | Banner only | LOW |
| **A.12** | session memory docs | Archival — DO NOT EDIT | n/a |

**Cron deletion behavior is NOT affected by any finding** — the cron's prune logic operates on `updated_at` age vs. retention window, never on a cap number. (See §E.)

---

## C. Project scope per finding

| ID | Project affected |
|---|---|
| **A.1, A.2, A.3, A.4** | The Neon project named by `NEON_PROJECT_ID` env var on Production. Per the rotate-db-keys workflow runtime env, this is `morning-bread-68708332` (the production DB project). The ops:health script reads `DATABASE_URL` (also pointed at `morning-bread-68708332`'s `cold-waterfall` endpoint), so the storage/compute thresholds apply to the production DB. |
| **A.5** (NEON.md) | Mixed. The branch-cap claims (§11) apply to whichever project the Vercel integration is on — which is `neon-green-school` / `hidden-mountain-87248164`, NOT `morning-bread-68708332`. The storage/compute claims (§2) apply to the production DB on `morning-bread-68708332`. **The NEON.md page conflates the two projects throughout.** |
| **A.6, A.7, A.8** (branch-prune code + comments) | The code targets whatever project `NEON_PROJECT_ID` env var names. **Per the runtime env that's `morning-bread-68708332`** (production), NOT `neon-green-school` (where the preview branches actually live). The comments describe behavior against the integration's project, but the code is pointing somewhere else. |
| **A.9** | The future `mallan-public-records` project (not provisioned). Independent. |
| **A.10, A.11** | Both projects discussed; both docs need a "superseded" banner. |

### C.4 — Possible project mismatch — NEEDS RE-EVALUATION (not a confirmed defect)

> **🟡 RECLASSIFIED 2026-05-17T08:30Z (post-PR-#150).** The original wording of this section asserted that the prune cron was running against the wrong Neon project (`morning-bread-68708332`) instead of the integration's project (`hidden-mountain-87248164`). That conclusion was **based on incomplete evidence** — specifically, on the rotate-db-keys workflow's runtime env (a GitHub Actions surface) without confirming the Vercel runtime env. New evidence from the post-PR-#150 ops:health smoke run **contradicts that conclusion.** The cron IS pruning branches. This section is preserved as the investigative trail with the corrected classification added below.

**New evidence (PR #150 ops:health smoke, 2026-05-17T07:40Z):**

```
── BRANCH PRUNE ──────────────────────────────────
  Last run: status=ok
  Examined: 17 · pruned: 10 · errors: 0
```

The cron's most recent run examined 17 branches and pruned 10. That is NOT consistent with the original §C.4 hypothesis that the cron was a no-op against the wrong project — if it were targeting `morning-bread-68708332` (production DB), there would be at most 1 examined (the `main` primary branch, unpruneable) and 0 pruned. 17 examined / 10 pruned matches a project where preview branches genuinely accumulate, which is `hidden-mountain-87248164` (`neon-green-school`).

**Likely (NOT YET PROVEN) explanation:**

There are two `NEON_PROJECT_ID` surfaces, and they may intentionally differ:

| Surface | Likely value | Used by |
|---|---|---|
| **Vercel Production env** `NEON_PROJECT_ID` | `hidden-mountain-87248164` (the integration's project) | `app/api/cron/neon-branch-prune/route.ts` (preview-branch hygiene cron) |
| **GitHub Actions secret/var** `NEON_PROJECT_ID` | `morning-bread-68708332` (the production DB project) | `.github/workflows/rotate-db-keys.yml` (production credential rotation) |

This is a sensible two-surface architecture: the **preview-branching workspace** is one Neon project, the **production DB** is a separate Neon project, and each automation reads the value appropriate to its target. The original §C.4 assumed the two values were the same and concluded the cron was misconfigured. The new ops:health evidence is consistent with the values intentionally differing.

**What this means for the recommendation:**

- The earlier "switch the env var to point at the integration's project" recommendation is **withdrawn pending verification.** If the Vercel-runtime value already IS `hidden-mountain-87248164`, no change is needed.
- The "cron has been operationally dead since 2026-04-28" assertion is **withdrawn.** The cron's audit-event record shows otherwise.
- The "manual operator actions in `memory/NEXT-SESSION-2026-04-28.md` cited the wrong Neon project" assertion is **withdrawn.** Those actions may have been correct as written.

**Read-only confirmation steps (NONE EXECUTED — defer to Maya):**

| # | Step | Surface | Risk |
|---|------|---------|------|
| 1 | Open Vercel UI → mallan-nyc → Settings → Environment Variables → Production tab → find `NEON_PROJECT_ID` → click the value reveal (or screenshot the masked field) → note whether it reads `hidden-mountain-87248164` or `morning-bread-68708332` (or anything else) | Read-only, no clicks beyond reveal | None |
| 2 | Open Neon Console → `hidden-mountain-87248164` → Branches → count the branches and compare to the cron's `examined=17` | Read-only | None |
| 3 | (Optional) `gh secret get NEON_PROJECT_ID` is NOT supported (GitHub returns values only at workflow runtime). The rotate workflow's most-recent runtime log already shows `morning-bread-68708332` for the GH-side value. No further GH-side probe needed | n/a | None |

**No behavior change is recommended without these read-only proofs.** Specifically:
- Do NOT change `NEON_PROJECT_ID` on either surface based on this audit's current evidence.
- Do NOT disable, modify, or repoint the prune cron.
- Do NOT delete any Neon branches manually.
- Do NOT touch the integration binding.

If steps 1 + 2 confirm the two-project architecture, this section can be closed as a non-issue and the cron's operation continues as-is. If steps 1 + 2 reveal that both surfaces actually point at the same project after all, the original §C.4 analysis can be revisited with that fact in hand.

---

## D. Recommended new Launch-safe thresholds

### D.1 — Storage thresholds (`scripts/ops-health.js` THRESHOLDS)

Per Neon Launch plan docs (`https://neon.com/docs/introduction/plans`):

| Setting | Launch plan limit | Recommended threshold |
|---|---|---|
| Storage cap | **10 GB** (10,240 MB) | `storage_free_cap_mb: 10240` (rename to `storage_plan_cap_mb`) |
| Warning at | n/a (no hard cap in same sense) | `storage_warning_pct: 0.70` → warn at 7 GB |
| Upgrade-discussion trigger | n/a (next tier is Scale, $69/mo) | `storage_upgrade_pct: 0.85` → 8.7 GB; rename to `storage_scale_upgrade_pct` |

Note: Launch plan is **usage-billed past the included limits**, so the "cap" is softer than free tier. The 7 GB warning still makes sense as an early signal that growth is accelerating.

### D.2 — Compute thresholds (`scripts/ops-health.js`)

Per Launch plan docs:

| Setting | Launch plan baseline | Recommended threshold |
|---|---|---|
| Compute cap | **300 CU-hours / month** included; overage at ~$0.16/CU-hr | `compute_free_cap_hours: 300` (rename `compute_plan_cap_hours`) |
| Warning at | 80% | `compute_warning_hours: 240` |

### D.3 — Branch-count threshold

Per Maya's question (`>=25 or >=50`):

| Threshold value | Rationale | Recommended? |
|---|---|---|
| Keep at >= 8 (current) | False positives on every run | ❌ NO |
| >= 25 | Conservative; warns if preview-branch creation accelerates 3× baseline | ⭐ **Yes — primary recommendation** |
| >= 50 | More forgiving; warns at 1% of plan cap | Reasonable alternative |
| >= 100 | Late warning | Too late |
| >= 500 (10% of cap) | Match the "80% of cap" pattern from storage/compute | ❌ NO — by the time we hit 500, branch-creation has been runaway for weeks; warning is useless |

**Recommendation: 25.** Baseline is 8 branches steady-state; 25 = 3× baseline = anomalous-growth signal without being noise. If preview branches start accumulating (e.g., Vercel auto-cleanup stops working), 25 is early enough to act on with multiple weeks of runway before cap pressure.

**Critical threshold (for the doomsday case, plan-cap-approaching):** add a second threshold at `>= 4000` (80% of 5000) for a `critical` verdict. The 25-warning is "investigate"; the 4000-critical is "act immediately."

### D.4 — New THRESHOLDS object (proposed, awaits approval)

```js
const THRESHOLDS = {
  // Launch plan caps (10 GB storage, 300 CU-hr compute, 5000 branches)
  storage_plan_cap_mb: 10_240,
  storage_warning_pct: 0.70,                        // 7 GB
  storage_upgrade_pct: 0.85,                        // 8.7 GB — discuss Scale plan
  compute_plan_cap_hours: 300,
  compute_warning_hours: 240,                       // 80% of 300
  branch_count_warning: 25,                         // anomalous-growth signal
  branch_count_critical: 4000,                      // 80% of 5000 — emergency
  // unchanged — not plan-related
  sync_error_warn_24h: 20,
  sync_error_critical_24h: 100,
  sync_watermark_stale_hours: 2,
  archive_backlog_warn: 1000,
};
```

---

## E. Should the prune cron stay enabled?

**Yes — keep it enabled.** Rationale change:

| Before (free tier) | After (Launch) |
|---|---|
| Cron was load-bearing: without it, the 10-branch cap was hit within hours on a fast-pushing day | Cron is hygiene: 5000-branch cap is hard to hit, but stale branches accumulate operational debt + cost |
| Failure to prune caused immediate visible breakage (check failures, alias-stall) | Failure to prune is silent; no immediate breakage |
| Local cron was the PRIMARY cleanup mechanism | Vercel's Vercel-Managed integration also auto-cleans on Vercel deployment retention (180 days by default) — local cron is now SECONDARY belt-and-suspenders |

**Recommendation: keep the cron. Reframe the surrounding doc/comment language from "cap-avoidance" to "hygiene + cost-awareness."**

The §C.4 finding (cron is pointed at the wrong project) means the cron is functionally a no-op against the right workload anyway — but that's a separate fix lane. Fix the threshold framing here; fix the project targeting separately.

---

## F. Should retention remain 24 h?

**Yes — keep 24h.** Reasoning:

- The 24h figure is reviewer-friendly (long enough for a PR reviewer to come back to a preview the morning after a late push) AND aggressive enough to keep idle branches from accumulating
- It's also what `app/api/cron/neon-branch-prune/route.ts` is hardcoded to (line 95: `retentionHours: 24`)
- The Vercel-side retention (180 days for Vercel-Managed) is far more forgiving, so our 24h is the active discipline
- The Launch plan has no incentive to lengthen retention — branches are cheap on Launch but not free
- If preview-branch accumulation starts to bother Maya operationally (cost, console clutter), shortening to 12 h is a single-line edit that gets reviewed at that time

If we ever want to be more aggressive (e.g., to clear preview branches from PRs that have been closed for > 4 h), that's a separate conversation requiring detection of closed-PR state inside the prune logic — `lib/neon/branches.ts:isPrunable()` only looks at `updated_at` age + the primary/protected flags right now.

**Recommendation: keep retention at 24 h.**

---

## G. Should ops-health warning threshold change from >=8 to >=25 or >=50?

Already answered in §D.3. **Recommendation: change to >= 25.** Add a second `critical` threshold at >= 4000.

---

## H. Exact files to patch after approval

### Code (3 files, surgical edits)

1. **`scripts/ops-health.js`**
   - Lines 33–44: replace THRESHOLDS object per §D.4
   - Lines 213–214: update block-comment ("within 2 of free-tier 10 cap" → "exceeds Launch-plan hygiene threshold")
   - Lines 286–291: replace the `>= 8` warning condition with `>= THRESHOLDS.branch_count_warning` and update message string to "exceeds Launch-plan hygiene threshold (N branches; warn at >= 25)"
   - Add a new branch following the warning: `>= THRESHOLDS.branch_count_critical` → critical level, message "N branches — approaching plan cap of 5000"
   - Lines 302–305: rename `storage_upgrade_needed` → `storage_scale_upgrade_signal`; consider renaming `pct_of_free` → `pct_of_plan_cap` (but this would change JSON shape — keep the old field name for backwards compat unless approved as a breaking change)
   - Lines 401–404: update human-output strings ("Upgrade to Launch needed" → "Upgrade to Scale plan needed" or similar)

2. **`lib/neon/branches.ts`**
   - Lines 6–11: rewrite the module docstring to: "Neon's Launch plan caps at 5000 branches per project — far above any realistic accumulation rate. This module remains active for branch hygiene: idle preview branches accumulate operational debt + cost, even when the cap is not in danger of being hit. The cron at app/api/cron/neon-branch-prune calls this module daily to keep idle preview-branch counts within a reasonable bound."

3. **`scripts/neon-prune-branches.ts`**
   - Lines 5–13: parallel update — change "Neon's free-tier project caps at 10 branches" framing to Launch-plan hygiene framing

4. **`app/api/cron/neon-branch-prune/route.ts`**
   - Lines 2–11: parallel update — same framing change

### Documentation (1 canonical doc + 2 banner-only edits)

5. **`NEON.md`** — most extensive update:
   - §2 table: replace free-tier storage 500 MB / compute 191.9 hr with Launch-plan 10 GB / 300 CU-hr; rename column from "Free tier cap" to "Launch plan baseline"
   - §3 Trap #3: keep the text; reframe to clarify auto-suspend happens regardless of plan tier — it's not free-tier-specific
   - §7 Playbook A: remove "Last resort: upgrade to Launch" → already done; replace with "If quota approached, evaluate Scale plan upgrade"
   - §10 change log: add a new dated entry: "2026-05-17 — confirmed migration from Free to Launch tier (preview-branch cap is now 5000, storage cap 10 GB, compute 300 CU-hr). Branch-prune cron + retention window retained as hygiene discipline; ops:health thresholds updated to Launch-safe values per `docs/neon-launch-branch-policy-audit-2026-05-17.md`."
   - §11.318–.343: rewrite the free-tier framing throughout. The architecture remains correct; only the cap numbers + rationale change.

6. **`docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md`**
   - Add header banner: "Superseded 2026-05-17 — the cap framing turned out to be stale Vercel-side metadata, not real exhaustion. See `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8 for the actual root-cause investigation. This document is preserved as historical record of what was believed at the time."

7. **`docs/neon-vercel-integration-repair-plan-2026-05-17.md`**
   - Add header banner: "Final classification + repair runbook is in §F.8. Sections A–E reflect interim investigation with the free-tier framing that turned out to be incorrect; preserved for the diagnostic trail."

### Documentation that should NOT be touched

- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` (§A.9) — forward-looking design for a separate project; the free-tier framing is operationally correct for the future provisioning. Decision belongs in the charter, not this audit.
- `memory/SESSION-2026-04-28-allnighter.md`, `memory/NEXT-SESSION-2026-04-28.md`, `memory/AUDITOR-LOG.md` (§A.12) — archival. Append a new dated entry in `memory/AUDITOR-LOG.md` if Maya wants the audit visible in the round-by-round log, but do not edit historical content.

### Tests / fixtures

- `tests/runtime/neon-branch-prune-route.test.ts` — quick read to confirm no test assertions encode a 10-branch number. If any do, update alongside the source change.

---

## I. Risks if left unchanged

| Surface left stale | Realistic worst-case |
|---|---|
| **A.2** `>= 8` warning in ops:health | **Cron + ops:health verdict permanently `warning`.** Real critical issues get lost in the noise. A future on-call engineer who learns "ops:health is always yellow, ignore it" misses a real fault. **Highest immediate risk.** |
| **A.1** storage/compute thresholds | False positive at 80% of 500 MB (400 MB) — possible within ~6 months at current growth rate per `memory/NEXT-SESSION-2026-04-28.md` forecasts. Would fire spurious "upgrade needed" warnings against a Launch plan that has 10× the cap |
| **A.5** NEON.md operational doctrine | Future Claude sessions (and future Maya) reading NEON.md will base decisions on the wrong tier. Likely outcomes: avoiding necessary work because "we're already on the brink of the cap", or running needlessly defensive prune cadences |
| **A.6 / A.7 / A.8** comments in branch-prune code | Same — future readers misinterpret why the cron exists and what its job is |
| **A.10 / A.11** prior docs without banner | Diagnostic trail confused; readers see contradictory facts about the cap |
| **§C.4** prune cron project targeting | **RECLASSIFIED to NEEDS RE-EVALUATION 2026-05-17 post-PR-#150.** The original "wrong project" conclusion is withdrawn. New ops:health evidence (`examined=17, pruned=10, errors=0`) is consistent with the cron correctly targeting `hidden-mountain-87248164`. Pending the read-only proofs in §C.4, no risk to act on. |

### Compounding risk reclassified — see §C.4

The original "Compounding risk: the §C.4 finding" subsection was written under the assumption that the prune cron targets the wrong Neon project. That assumption was contradicted by the post-PR-#150 ops:health smoke (`examined=17, pruned=10, errors=0`). **The compounding-risk subsection is withdrawn.** The cron's operation appears healthy and the silent-skip detection (`status=skipped` audit-event path) remains in place. The read-only confirmation steps in §C.4 are the next move if Maya chooses to close the loop — no behavior change is recommended until those steps confirm or refute the two-project architecture hypothesis.

---

## What this audit does NOT do

- ❌ No env vars changed
- ❌ No Neon branches deleted
- ❌ No prune cron disabled
- ❌ No integration disconnect/reconnect
- ❌ No migrations
- ❌ No reconciliation
- ❌ No PR 5B started
- ❌ No CRM / Sentinel work
- ❌ No secret values printed (host bytes only for `cold-waterfall`, already public in repo docs)
- ❌ No source code patched — all §H items deferred to a follow-up PR

---

## Cross-references

- `NEON.md` — canonical Neon discipline doc (heavily impacted; see §H.5)
- `lib/neon/branches.ts` / `scripts/neon-prune-branches.ts` / `app/api/cron/neon-branch-prune/route.ts` — branch-prune trio (comment updates only)
- `scripts/ops-health.js` — only file with runtime-affecting changes (§H.1)
- `docs/neon-vercel-integration-repair-plan-2026-05-17.md` §F.8 — finalized Launch-plan support packet (correct framing already)
- `docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md` — superseded
- `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-PLAN.md` — separate project, intentionally untouched
- `memory/SESSION-2026-04-28-allnighter.md` / `memory/NEXT-SESSION-2026-04-28.md` — archival; do not edit

---

**End of audit. Awaiting approval to patch the items in §H. The §C.4 finding (cron pointed at wrong Neon project) is recommended for a separate follow-up PR.**
