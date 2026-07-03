# DRAFT — Vercel Support ticket: false "Neon branching: Branch limit exceeded" + stuck deployment status

> **STATUS: DRAFT — REPORT ONLY. NOT SUBMITTED.** Awaiting Maya's explicit approval before sending.
> No env / Neon / Vercel / branch / settings changes were made in producing this draft.
> Companion evidence doc: `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`.

---

## Submission metadata (fill at send time)
- **Channel:** Vercel Dashboard → Help → Support (or support@vercel.com), team scope `mallan`.
- **Plan:** (state current Vercel plan at submission.)
- **Team:** `mallan` — `team_kZQh5NYLyrOKqffK0r9EXf4E`
- **Project:** `mallan-nyc` — `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`
- **Connected Neon store:** `store_K9l79ICRUTMsiRh2` ("neon-green-school") → Neon project `hidden-mountain-87248164`

---

## Subject
False "Neon branching: Branch limit exceeded" integration check + `Vercel` deployment commit-status stuck `pending` after deployments reach READY (project `mallan-nyc`)

## Summary (what we're asking)
Our project's Vercel→Neon integration shows a red **"Neon branching: Branch limit exceeded"** status in the deployment UI, and the GitHub **`Vercel`** commit status stays **`pending` ("is deploying")** even after the deployment reaches **READY**. Both appear to be **stale/false Vercel-side status artifacts** — the connected Neon project is far under its branch limit and deployments succeed. We are **not** asking for any change to our Neon data. We need Vercel to:

1. **Clear / suppress the false "Branch limit exceeded" integration check** for this project + connected store, and
2. **Fix the stuck `Vercel` deployment commit status** that remains `pending` after the deployment is READY (it cascades into a downstream "PARTIAL" CI verdict on our side).

## Evidence the check is false (not a real provisioning failure)

1. **The connected store binds an under-limit Neon project.** Store `store_K9l79ICRUTMsiRh2` → Neon project `hidden-mountain-87248164`, which is at **2 / 5000** branches (Neon API, verified 2026-06-03 — re-verify live at submission). It cannot exceed any branch limit.
2. **Deployments reach READY despite the red.** Latest production deployment (today): `dpl_DumPeXg8PZkdbFFCpfrMnN1ahcmb`, commit `14d5114153de784e50e80ab8ae9a232b24f03673` (branch `main`), **`state: READY`**, `target: production`.
3. **The app is healthy.** `GET https://mallan.nyc/api/health` → **HTTP 200** `{"success":true}` (verified 2026-06-17).
4. **No Neon branch is actually created** by the deploys that show the red — the hidden-mountain branch count stays at 2.
5. **It is not a build failure** — the message does **not** appear in build logs and is **not** posted as a GitHub check-run; it lives only in the Vercel deployment-UI integration step.
6. **The stuck `Vercel` commit status** staying `pending` after READY is the second half of the same artifact (example: deployment `dpl_7yZiw9Ywgxq2bm8CGV5vks7GYTWC`, PR #322 preview, SHA `dea63142` — READY, alias assigned, `/api/health` 200, yet the `Vercel` status stuck `pending`).

## Important context (so the fix isn't misdirected)
- There are **orphaned Neon branches on a DIFFERENT, unconnected legacy project** (`morning-bread-68708332`, "mallandb", at its Free cap of 10/10). **That project is NOT bound to `mallan-nyc`** (no Vercel store binds it — store-API verified 2026-06-03). Please do **not** key the fix off that project; the connected store is `hidden-mountain` only.
- We have intentionally **left "Require Active Resource Before Deploy" = OFF and "Create Database Branch for Production" = OFF** to avoid the false check blocking deploys, and we have **not** pruned or modified any Neon project to "work around" the status. We'd like the underlying false status resolved so we can reconsider those settings.

## Requested resolution
1. Suppress/clear the **"Neon branching: Branch limit exceeded"** integration check for project `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` + store `store_K9l79ICRUTMsiRh2`.
2. Resolve the **`Vercel` deployment commit status** remaining `pending` after the deployment state is `READY`.
3. Confirm whether re-enabling "Require Active Resource Before Deploy" / "Create Database Branch for Production" is safe once (1) is cleared.

## Reproduction / IDs for your investigation
- Team `team_kZQh5NYLyrOKqffK0r9EXf4E`, project `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`.
- READY-with-red example (current): `dpl_DumPeXg8PZkdbFFCpfrMnN1ahcmb` (commit `14d5114`).
- Stuck-`pending`-status example: `dpl_7yZiw9Ywgxq2bm8CGV5vks7GYTWC` (SHA `dea63142`).
- Connected store `store_K9l79ICRUTMsiRh2` → `hidden-mountain-87248164` (2/5000 branches).

---

## Pre-send checklist (read-only re-verify at submission — Maya-gated)
- [ ] Live Neon branch count on `hidden-mountain` still ≤ 10 (expect ~2) — needs Neon API key (operator step; Claude is blocked from `.env`).
- [ ] Latest production deployment still `state=READY` (Vercel API/MCP). *(Confirmed READY 2026-06-17.)*
- [ ] `https://mallan.nyc/api/health` still 200. *(Confirmed 200 2026-06-17.)*
- [ ] Current Vercel plan name filled into "Submission metadata".

*Report only. Nothing submitted. No platform settings changed.*
