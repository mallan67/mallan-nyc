# Vercel↔Neon "Branch limit exceeded" — canonical status & support packet (2026-06-03)

> ## 🛑 AGENT STOP — Neon/Vercel database facts (read before ANY db / Neon / Vercel / deploy action)
>
> - **Canonical production data = `hidden-mountain-87248164` / "neon-green-school" / `ep-cold-waterfall-adno3ao2` / branch `main` (`br-crimson-frog-adr7g9gt`).**
> - **`morning-bread-68708332` / "mallandb" / `ep-royal-dawn-ad6eh8t2` (`br-old-tree-admdlb9z`) is STALE / DO-NOT-SERVE.**
> - **`round-recipe-12208101` / "neon-green-door" is NOT connected to mallan-nyc.**
> - **Only Vercel store bound to mallan-nyc = `store_K9l79ICRUTMsiRh2` → hidden-mountain** (store-API verified 2026-06-03). **No store binds morning-bread.**
> - **DO NOT run `rotate-db-keys`. DO NOT prune `morning-bread` to "fix" the branch-limit check. DO NOT create Neon branches from stale/test/wip/probe Git branches.**

**Status:** the red "Neon branching: Branch limit exceeded" is a **stale / FALSE Vercel-side integration check** against `hidden-mountain-87248164`, which is far under limit (**2 / 5000**). It is **non-blocking** (deploys reach READY). Only Vercel can remove the red ❌.

---

## 1. Connected Vercel store binding (Vercel store API, 2026-06-03)
| Store id | Name | Provider | Neon project | Connected to mallan-nyc? |
|---|---|---|---|---|
| **`store_K9l79ICRUTMsiRh2`** | **neon-green-school** | Neon | **`hidden-mountain-87248164`** | ✅ **YES** (`prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`) |
| `store_if4C7R8SYJlqtpcN` | neon-green-door | Neon | `round-recipe-12208101` | ❌ no |
| (supabase-* / blob / prisma-postgres stores) | — | other providers | — | ❌ (other project / suspended) |

**There is no Vercel store bound to `morning-bread-68708332`.** Its 10 branches are orphaned debris from a defunct/early binding — **not** what any current deploy check evaluates.

## 2. Neon project branch counts (Neon API, 2026-06-03)
| Neon project | Vercel label | plan | branches | limit | over? |
|---|---|---|---|---|---|
| `hidden-mountain-87248164` | neon-green-school | `launch_v3` | **2** | 5000 | no |
| `round-recipe-12208101` | neon-green-door | `launch_v3` | 1 | 5000 | no |
| `morning-bread-68708332` | mallandb | `free_v3` | 10 | 10 | at Free cap — **but not connected to mallan-nyc** |

## 3. Why the check is false/stale (evidence)
- The connected store binds **hidden-mountain (2/5000)** — it **cannot** exceed any branch limit.
- The deploy that shows the red still creates **no** Neon branch on hidden-mountain (count stays 2) yet reaches READY → the message is a Vercel-side status artifact, not a real provisioning failure.
- It does **not** appear in build logs and is **not** posted as a GitHub check-run — it lives only in Vercel's deployment UI integration step.
- Background: `NEON.md` §10 (2026-06-01 row) already classified this as a Vercel-side false check, "only removable by Vercel."

## 4. Latest known-good example (PR #322 preview)
- Deployment `dpl_7yZiw9Ywgxq2bm8CGV5vks7GYTWC` (branch `security/remove-tracked-trestle-dumps-2026-06-03`, SHA `dea63142`): **state READY**, branch alias assigned, **`/api/health` 200** on both URLs — despite the red integration check. The matching GitHub `Vercel` commit status stuck `pending` ("is deploying"), which cascades into `release-truth: PARTIAL` (also stale, not a real failure).

## 5. ⛔ Hard warnings
- **DO NOT prune `morning-bread` to fix this.** It is not the check's target; pruning will not clear the red and risks its `main` (PITR/rollback) and the `rotate-db-keys` target.
- **DO NOT run `rotate-db-keys`.** Schedule disabled (PR #321). It targets morning-bread/royal-dawn and would re-break production by overwriting `DATABASE_URL` away from cold-waterfall. Re-enable only after retarget + a fail-closed host guard (`docs/rotate-db-keys-host-guard-patch-2026-06-02.md`).
- **Keep "Require Active Resource Before Deploy" = OFF** and **"Create Database Branch for Production" = OFF** until Vercel resolves the false check.

## 6. Verify-before-you-act checklist (read-only)
1. Live Neon branch count on hidden-mountain (expect ~2, ≤10).
2. Latest deployment `state=READY` (Vercel API/MCP).
3. `/api/health` → 200 on prod + the preview.
If all three hold, the red is cosmetic — **do nothing structural; open/track a Vercel support ticket.**

## 7. Support packet summary (for Vercel)
- Team `mallan` (`team_kZQh5NYLyrOKqffK0r9EXf4E`); project `mallan-nyc` (`prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`).
- Connected Neon store `store_K9l79ICRUTMsiRh2` → `hidden-mountain-87248164`, plan Launch, **2 / 5000** branches.
- Ask: (a) clear the stuck `Vercel` deployment commit status that stays `pending` after READY; (b) suppress the false "Neon branching: Branch limit exceeded" check for this project/store.

---
*Report only. No env / Neon / Vercel / branch changes made by writing this doc.*
