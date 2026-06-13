# Zero-Billing / Connection Audit — Neon + Vercel — 2026-06-12

> **READ-ONLY. COMMITTED 2026-06-12 per Maya option A (PR #398)** as durable evidence for the
> P2-MONEY plan. No plan changes, no deletes, no env changes, no migrations, no Neon settings writes
> were made. All probes are `GET`/`SELECT`-only; the one SQL probe is host-guarded to cold-waterfall
> and runs `SET default_transaction_read_only = on`. No secret values are printed anywhere in this
> document — only var NAMES, project IDs, store IDs, and masked host fragments. **The probe scripts
> stay UNTRACKED / operator-held** (they read `.env`; not in the repo — a fresh clone lacks them);
> the load-bearing facts are inlined so this document is self-contained (Codex #398).
>
> **Maya's framing:** "Neon should be FREE — prove why it charges. Do not assume the charge is legitimate." This audit answers that head-on (§8/§9).

**Probes (operator-held, NOT in the repo):** `scripts/__zero-billing-neon-2026-06-12{,b,c,d,e,f,g,h}.mjs`. Live capture 2026-06-13T02:10–02:15Z.

---

## 0. TL;DR — the answer to "why does Neon charge?"

**Neon is NOT charging for usage overage. Neon is charging a flat $19/mo Launch *subscription* that Maya turned on manually on 2026-05-17 to silence a FALSE Vercel "Branch limit exceeded" UI check.** Every usage dimension is *inside the Free allowance* except one: storage (1,139 MB vs Free's 500 MB cap). So today there are **two** distinct reasons money moves:

1. **The $19/mo Launch subscription itself** (`store_K9l79ICRUTMsiRh2` billingPlan = `launch_v3`, `paymentMethodRequired=true`). This is a *chosen plan*, not a usage charge. It is the entire current Neon bill.
2. **Storage 1,139 MB > 500 MB Free cap** — the only thing that *would* block a return to Free even after the subscription is cancelled. 663 MB of it is legacy JSON on `listings` (per `neon-storage-cost-audit-2026-06-12.md`).

**Compute is a non-issue for billing**: 61.4 CU-h used so far this period, projecting ~150 CU-h/month — under *both* the Launch 300 baseline and the Free ~100–192 allowance. The "720 CU-h" figure in the cron audit was wall-clock-active hours mis-scaled; the CU-weighted meter (min CU = 0.25) reads **61.4 CU-h in 12 days**.

**morning-bread (stale) costs ~90 MB of org-pooled storage and is still being woken** (~25 active-h this period) — small, but it is real debris that should be exported-then-deleted.

**round-recipe is NOT mallan's** — different Neon region, different account (the mallan project key gets HTTP 404 "user has no access"), 1-agent/2-deal prototype schema. Its Vercel store binding has **already been removed** since the 2026-06-03 doc. Exclude from mallan's bill.

---

## 1. Account / plan tier (Q1, Q8a)

| Layer | Value | Source |
|---|---|---|
| **Vercel team** | `team_kZQh5NYLyrOKqffK0r9EXf4E` slug=`mallan` name=`maya` — **plan = `pro`** (`planIteration: plus`), Stripe, status active, period 2026-05-24→2026-06-24 | probe e/f team billing |
| **Neon billing** | Driven through the **Vercel-managed Neon store** `store_K9l79ICRUTMsiRh2`, billingPlan **`launch_v3` ("Launch")**, `paymentMethodRequired=true`, billingState=active | probe e/f stores |
| **Neon org/account API** | The account-level Neon API keys in `.env.local` (`NEON_ADMIN_KEY`, `NEON_ROTATION_ADMIN`) return **HTTP 401** (revoked/invalid); `NEON_PREVIEW_API_KEY` is **project-scoped** (returns 400 on `/projects`, works on `/projects/{id}`). **Account-wide enumeration via Neon API was NOT possible from here.** | probe (main) §B2 |

**Could-not-verify (state the operator command):** the Neon *org* plan tier (Free vs Launch at the org level) and the org-level consumption meter are not reachable with the available keys. The Launch billing is proven via the **Vercel store** (`launch_v3`), which is the actual billing path for this Vercel-managed integration. To read Neon-org billing directly: `curl -H "Authorization: Bearer $NEON_ORG_KEY" https://console.neon.tech/api/v2/consumption_history/account?...&org_id=<org>` with a valid **org-scoped** key (the 400 response said `org_id is required`).

---

## 2. Per-project enumeration (Q1) — via project-scoped key + Vercel store API

| Project (id) | Name | Region | Storage (synthetic) | Branch logical | Compute endpoint / autoscale / suspend | last_active | Created | **Likely owner** |
|---|---|---|---|---|---|---|---|---|
| **hidden-mountain-87248164** | neon-green-school | aws-us-east-1 | **1,190.9 MB** | main 1,160.7 MB | `ep-cold-waterfall-adno3ao2` rw/**active** cu=0.25–0.25 suspend=0s | 2026-06-13T02:10Z | 2025-12-09 | **mallan PROD** |
| **morning-bread-68708332** | mallandb | aws-us-east-1 | **90.2 MB** | main 90.1 MB + 9 preview | `ep-royal-dawn-ad6eh8t2` rw/**idle** cu=0.25–2 + 9 idle preview endpoints | 2026-06-13T01:55Z | 2025-10-22 | **mallan STALE** |
| **round-recipe-12208101** | neon-green-door | (other region: `…ahaswtw0`/`ep-hidden-morning-ahs1u869`) | n/a — **HTTP 404 "user has no access"** | n/a | n/a | n/a | (early prototype) | **NOT mallan** (separate account; see §4) |

Notes:
- **hidden-mountain has exactly 1 branch** (`main`) right now — the "2nd branch" referenced in CLAUDE.md (2/5000) has since been pruned; today it is **1/5000**. No idle preview branches on the production project. Suspend timeout = **0s = "never auto-suspend"** on cold-waterfall (this is why it stays warm 24/7 — see §8c).
- **morning-bread has 10 branches** (1 main + 9 abandoned `preview/*` + `vercel-dev`), the Free 10-branch cap. Preview endpoints last active **2025-11-06/07** (7 months idle). Main endpoint woke at 01:55Z today (something still pings it — likely the disabled-but-referenced rotate path or a stray monitor; see §3).
- Storage figures are *synthetic_storage_size* (logical + history). History retention on both = 21,600s (6 h) — small PITR footprint.

---

## 3. morning-bread — still active / billable? (Q3)

| Fact | Value |
|---|---|
| synthetic storage | **90.2 MB** (main 90.1 MB; the 9 preview branches are copy-on-write, ~30 MB *logical* each but share base pages) |
| endpoint state | `ep-royal-dawn-ad6eh8t2` = **idle** (not suspended — suspend_timeout=0s means it never auto-suspends; it just sits idle) |
| last_active | **2026-06-13T01:55Z** — woke ~20 min before this audit. NOT fully dormant. |
| compute this period | active_time 25.6 h / **6.5 CU-h** (12 days) → projecting ~16 CU-h/mo |
| Vercel store binding | **NONE** — no Vercel store binds morning-bread (confirmed: only 7 stores exist, none point at it) |

**Billing impact:** On a paid plan, Neon storage is **org-pooled** — morning-bread's ~90 MB counts against the same storage line as prod. But 90 MB is *trivial* (the whole org is ~1,281 MB; morning-bread is 7% of it) and the entire org is still under the 10 GB Launch baseline, so morning-bread contributes **$0 of marginal charge today** (no overage tier reached). Its cost is *latent*: if the org ever downgrades to Free, the pooled total must be <500 MB, and morning-bread's 90 MB eats into that headroom. It is debris to remove on principle, not a current dollar driver.

**What still wakes it:** nothing in `.env.local` or Vercel runtime points app traffic at royal-dawn (all DB vars → cold-waterfall, §5). The most likely waker is the **GitHub Actions repo variable `NEON_PROJECT_ID = morning-bread-68708332`** combined with any branch-prune/rotate path that lists its branches via the Neon API (a list call wakes the control plane, not necessarily compute). The 6.5 CU-h is small and harmless but explains the non-zero `last_active`.

---

## 4. round-recipe attribution (Q4) — NOT mallan

Evidence it belongs to a **different account / project family**, not mallan-nyc:

1. **Neon API access:** the mallan project-scoped key gets `HTTP 404 "user has no access to projects"` for `round-recipe-12208101` — it is in a different Neon account/org than hidden-mountain + morning-bread (both of which the same key reads fine).
2. **Different region/endpoint family:** branch `br-spring-wildflower-ahaswtw0`, endpoint `ep-hidden-morning-ahs1u869` — the `ah…` host suffix is a *different AWS region* than the `ad…` (us-east-1) suffix shared by both mallan projects.
3. **Schema is a throwaway prototype:** the pre-uninstall backup (`backups/neon-green-door-round-recipe-2026-06-03/schema-summary.md`) shows just `agents` (1 row) + `deals` (2 rows) — a commission-split prototype, not mallan's 60-model production schema.
4. **No mallan env references it:** zero references to `round-recipe`, `neon-green-door`, or its endpoint host in `.env.local`, Vercel runtime env, or app code. The only repo hits are in *guard/backup/doc* files (the canonical-target allowlist refuses everything that isn't cold-waterfall, so round-recipe is implicitly excluded).
5. **Vercel store binding already removed:** the 2026-06-03 doc listed `store_if4C7R8SYJlqtpcN` (neon-green-door → round-recipe) as a bound store. **That store no longer exists** — only 7 stores remain, and the sole Neon store is `neon-green-school`. The neon-green-door integration has been uninstalled on the Vercel side since 06-03.

**Verdict:** round-recipe is **excluded from mallan's bill analysis.** It does not share mallan's Neon org (the 404 proves separate ownership), so it does NOT even pool storage against hidden-mountain. It is almost certainly tied to a *different Neon account* (possibly the personal `mayaallan` / `stocks-information-tracker` Vercel projects, which use **Supabase + Blob**, not Neon — so round-recipe is likely an orphaned standalone Neon account, not bound to any current Vercel project at all). No action needed from the mallan side; its existence is noted only for completeness.

---

## 5. DB connection-string vars across all surfaces (Q5) — names + masked hosts only

**Every active DB var on every surface points at `ep-cold-waterfall-adno3ao2` (hidden-mountain). Zero active vars point at royal-dawn/morning-bread.**

| Var NAME | Local `.env.local` | Vercel Production | Vercel Preview/Dev | GitHub secret? | Host (masked) |
|---|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ (updated 2026-06-02) | ✓ dev | ✓ secret (2026-06-01) | `ep-cold-waterfall…-pooler` |
| `DATABASE_URL_UNPOOLED` | ✓ | ✓ (2026-06-02) | ✓ dev | ✓ secret | `ep-cold-waterfall…` (direct) |
| `ASSISTANT_DATABASE_URL` | ✓ | ✓ (2026-06-02) | ✓ | ✓ secret | `ep-cold-waterfall…-pooler` (zero code readers) |
| `database_*` (16 integration vars: `database_DATABASE_URL`, `database_POSTGRES_*`, `database_PGHOST`, …) | ✓ | ✓ (2026-06-01) | ✓ | — | all → `ep-cold-waterfall…` (zero code readers; managed by the store) |
| `DIRECT_URL` / `SHADOW_DATABASE_URL` / `POSTGRES_URL` (bare) | absent | absent | absent | — | n/a |
| `DEV_DATABASE_URL` | — | — | — | ✓ secret (2025-11-05) | not inspected (dev only) |
| `NEON_API_KEY` | absent locally | ✓ (sensitive, empty to reader) | ✓ | ✓ secret (2026-05-15) | — |
| `NEON_PREVIEW_API_KEY` | ✓ (project-scoped) | ✓ sensitive | ✓ | ✓ secret (2026-06-03) | — |
| `NEON_PROJECT_ID` | absent | ✓ sensitive (empty to reader) | ✓ | — | — |
| `database_NEON_PROJECT_ID` | ✓ (len 24) | ✓ | ✓ | — | = hidden-mountain |
| **`NEON_PROJECT_ID` (GitHub Actions repo VARIABLE)** | — | — | — | **variable = `morning-bread-68708332`** ⚠ | **STALE** |
| `NEON_PREVIEW_PROJECT_ID` (GitHub) | — | — | — | ✓ secret (2026-06-01) | = hidden-mountain (preview) |

**The ONE stale pointer that could execute (Q5 flag):** GitHub Actions repo variable **`NEON_PROJECT_ID = morning-bread-68708332`**. It is consumed only by `.github/workflows/rotate-db-keys.yml`, whose **`schedule:` trigger is commented out** (DISABLED 2026-06-02, `workflow_dispatch`-only). So it cannot fire automatically, but a *manual* dispatch of rotate-db-keys would still target morning-bread and re-break production — exactly the 2026-06-01 incident. The `lib/ops/canonical-neon-target.ts` fail-closed guard + `scripts/ci/assert-canonical-neon-target.mjs` now defend against this, but the stale variable itself remains. **Do not run rotate-db-keys.**

The pre-repoint backup (`.env.local.backup-before-repoint`) contains `A_CONN=ep-royal-dawn…` / `B_CONN=ep-cold-waterfall…` — these are inert comparison-probe vars in a backup file, not an execution path.

---

## 6. Proof mallan.nyc connects to exactly ONE Neon DB (Q6)

| Evidence | Result |
|---|---|
| Runtime SQL via canonical `DATABASE_URL` (host-guarded, read-only) | `current_database = neondb`, host `ep-cold-waterfall-adno3ao2-pooler…`, PG 17.10, `pg_database_size = 1138 MB`, db_now 2026-06-13T02:14Z (probe g) |
| Production `/api/health` | **HTTP 200** `{"success":true}` (mallan.nyc, live) |
| Vercel store bound to mallan-nyc | exactly one Neon store, `store_K9l79ICRUTMsiRh2` → hidden-mountain (probe f) |
| All DB env vars (prod + preview + dev + GH secrets) | all → cold-waterfall (§5) |
| Crons | run on the production deployment only (Vercel crons fire on prod); `vercel.json` crons all hit `/api/cron/*` routes that use the bare `DATABASE_URL` → cold-waterfall |

**Conclusion: prod + preview + crons all resolve to the single canonical DB `hidden-mountain / cold-waterfall / neondb`. No second-DB connection found in any active path.** (morning-bread is reachable only by the disabled rotate workflow's stale `NEON_PROJECT_ID`, which is a *control-plane* target, not an app DB connection.)

---

## 7. Unused billable Neon resources (Q7)

| Resource | What | Billable today? |
|---|---|---|
| **morning-bread project** | 90 MB stale prod copy + 9 abandoned preview branches (idle since Nov 2025) | Org-pooled storage only (~90 MB); $0 marginal (under baseline) |
| morning-bread 9 preview branches | `preview/*` + `vercel-dev`, last active 2025-11-06/07 | Pooled storage, negligible (COW) |
| hidden-mountain extra branches | **NONE today** — 1/5000 (the prior 2nd branch was pruned) | n/a |
| cold-waterfall endpoint | suspend_timeout **0s = never suspends** → runs ~24/7 | Compute (see §8c) — under baseline, $0 marginal |
| round-recipe | separate account, not pooled with mallan | Not mallan's bill |

No idle-but-unsuspended *preview* endpoints on the production project. The only idle-unsuspended compute is cold-waterfall itself (production, intentional) and royal-dawn (stale).

---

## 8. Why it charges — precise attribution (Q8)

The current Neon bill = **$19/mo flat Launch subscription**. There is **no usage overage**. Breaking down each candidate driver:

| (x) | Candidate | Verdict | $ contribution |
|---|---|---|---|
| **(a)** | **Wrong PLAN selection (Launch when Free would do, except storage)** | **THIS IS THE BILL.** Launch was switched on 2026-05-17 to silence a *false* Vercel "Branch limit exceeded" check (which targets hidden-mountain at 1–2/5000 — it cannot really be over). The subscription is the charge. | **$19/mo (100% of the bill)** |
| (b) | Duplicate/stale storage (morning-bread 90 MB) | Real debris, org-pooled, but under baseline → no overage | $0 marginal |
| (c) | Active compute (keepalive + 1-min monitor preventing autosuspend) | cold-waterfall never suspends (suspend=0s), runs ~24/7: **244.8 active-h / 61.4 CU-h in 12 days → ~150 CU-h/mo**. Under Launch 300 **and** under Free ~100–192. The "720 CU-h" earlier figure conflated wall-clock with CU-weighted hours. | $0 overage (within baseline) |
| (d) | Storage > 500 MB Free cap (prod 1,139 MB) | **The real blocker to returning to Free.** Not an overage charge on Launch (1.1 GB ≪ 10 GB), but it makes Free *impossible* until cleanup. | $0 on Launch; **gates the $0 path** |
| (e) | Branch/project duplication | hidden-mountain 1/5000; morning-bread's 10 are pooled-trivial | $0 |

**Plain-language answer for Maya:** *Neon is charging $19/mo because the account is on a paid "Launch" subscription that was turned on to hide a Vercel display bug — not because of real usage. Compute and branches are both inside the free allowance. The ONLY genuine free-tier blocker is database size (1.1 GB vs the 500 MB free cap), and 663 MB of that is old JSON we already have a plan to drop.*

---

## 9. Exact safe path to $0 (Q9) — recommendations only, nothing executed

To reach **$0 Neon**, two independent things must both be true: (i) cancel the Launch subscription (downgrade to Free), and (ii) get pooled storage under 500 MB. They must happen in the right order, and there is a real availability tradeoff.

**Step A — Resolve the false Vercel check FIRST (prerequisite to downgrade).**
The Launch upgrade only exists to mute the false "Branch limit exceeded" check. Open the Vercel support ticket (packet ready in `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md` §7) to clear it. **Do NOT downgrade while the false check is unresolved** — on Free, the 10-branch cap is a *hard* cap, and the stale check plus preview-branch creation could actually start failing deploys.

**Step B — Get storage under 500 MB (independent track, all Maya-gated, HELD).**
Per `neon-storage-cost-audit-2026-06-12.md` §10: ship the legacy-JSON drop (R1, ~600 MB) + let the T+180 terminal archive run (R2) + a one-time `listings` table rewrite (R4) to return the space to disk. Lands at ~480–500 MB — *right at* the Free line, so the terminal-archive cadence must keep recycling ~45–50 MB/mo of new-listing growth or it re-breaches within weeks. These are all schema/DB-op HELD items requiring PR 5B + C6 first.

**Step C — Delete morning-bread after a final archival export (frees pooled headroom + removes debris).**
A safety export already exists for round-recipe; do the equivalent `pg_dump` of morning-bread `main` to `backups/`, confirm bytes, then delete the project. Removes 90 MB from the pool and the 9 abandoned preview branches. (Per CLAUDE.md this is a Neon settings/delete action = **HELD, Maya approval required**.)

**Step D — Decide the compute/availability tradeoff.**
Free autosuspends idle compute after 5 min. Reaching the lowest cost means *accepting autosuspend* (cold starts of ~2–5 s for the first visitor after idle, plus possible cron cold-start blips) OR keeping the keepalive/1-min monitor (which keeps it warm but is moot on Free since Free still suspends and the monitor just re-wakes it). cold-waterfall's `suspend_timeout=0s` (never-suspend) is a *Launch-era* setting; on Free it reverts to a hard 5-min suspend.

**Honest floor:** **$0 is incompatible with guaranteed 24/7 instant-warm availability.** The realistic outcomes are:
- **$0/mo (Free):** requires Step A + B + C all done; accept cold starts after idle; storage must stay <500 MB forever (tight). Best for a low-traffic site that tolerates an occasional 2–5 s first-load.
- **$19/mo (stay Launch):** no cold starts (never-suspend), 10 GB headroom, no cleanup pressure. This is the current, comfortable state — everything is well inside baseline, so the only charge is the flat $19.

There is no "free AND always-warm AND no-cleanup" option. If Maya's priority is *truly $0*, the path is A→B→C→accept-autosuspend. If the priority is *no surprise overage*, she is already there — the $19 is fully predictable and usage will not push it higher at current scale.

---

## 10. Full resource table

| Resource | Provider | Plan/tier | Monthly charge | Why charging | Used by prod? | Evidence | Safe action to $0 | Risk | Maya approval? |
|---|---|---|---|---|---|---|---|---|---|
| Neon store `store_K9l79ICRUTMsiRh2` (hidden-mountain) | Neon via Vercel | `launch_v3` Launch | **$19/mo** | Flat subscription chosen 2026-05-17 to mute false Vercel branch check | **YES** (canonical prod) | probe f; runtime SQL probe g | Resolve Vercel false check → downgrade to Free (after storage <500 MB) | Free 10-branch hard cap + cold starts; premature downgrade can fail deploys | **YES** |
| hidden-mountain storage 1,139 MB | Neon | (in Launch) | $0 overage (in 10 GB) | Over 500 MB Free cap — blocks Free, not Launch | YES | storage audit 06-12; probe d | Ship JSON drop (R1/R2/R4) → ~480 MB | Schema migration risk; HELD on PR 5B + C6 | **YES** |
| cold-waterfall compute (~150 CU-h/mo) | Neon | (in Launch) | $0 (under 300 baseline) | Never-suspend (suspend=0s) keeps it ~24/7 | YES | probe d/h (61.4 CU-h/12d) | Accept autosuspend on Free, or keep keepalive | Cold-start latency / cron blips | **YES** (settings) |
| morning-bread project (90 MB + 9 preview br) | Neon | Free (`free_v3`) | $0 (pooled, under baseline) | Stale prod copy; org-pooled storage | NO | probe d | `pg_dump` to backups/ then delete project | Loses PITR/rollback safety net | **YES** (delete) |
| GH Actions var `NEON_PROJECT_ID=morning-bread` | GitHub | n/a | $0 | Stale rotate-db-keys target | NO (disabled wf) | gh variable list | Retarget to hidden-mountain (do not run rotate) | Manual dispatch could re-break prod | **YES** |
| round-recipe / neon-green-door | Neon (separate acct) | n/a | not mallan's bill | Early prototype, different account | NO | 404 "no access"; backup schema | None (not mallan's) | n/a | NO |
| Vercel team `mallan` | Vercel | **Pro** | (separate from Neon) | Vercel Pro subscription | YES (hosting) | team billing probe | Out of scope of this Neon audit | n/a | n/a |

---

## Appendix — provenance & could-not-verify

- Probes (operator-held, NOT in repo): `scripts/__zero-billing-neon-2026-06-12{,b,c,d,e,f,g,h}.mjs`. Capture window 2026-06-13T02:10–02:15Z.
- **Verified:** per-project storage/compute/branch/endpoint metadata (project-scoped Neon key); all Vercel env var names + masked hosts; all 7 Vercel stores + bindings; Vercel team plan; GitHub secret + variable names; runtime `current_database()` + host + size; production `/api/health` 200.
- **Could NOT verify (key/permission-blocked) + operator command:**
  - Neon **org-level** plan tier + org consumption meter — account keys 401, project key 400 (`org_id required`). Operator: use an **org-scoped** Neon API key → `GET /api/v2/consumption_history/account?org_id=<org>&from=…&to=…&granularity=daily`, and check the Neon Console → Billing page.
  - Neon Console **history/PITR GB** and the **per-cycle CU-h meter UI** — not exposed to the project key. Operator: Neon Console → Project → Usage.
  - round-recipe internals — 404 (separate account); intentionally not pursued.
- **No mutations.** No plan/env/Neon-settings/branch/migration changes. This document is uncommitted per instruction.
