# Next Session Entry Point — 2026-04-28 (close-of-day)

> **First doc to read in the next session.** Supersedes `memory/OUTSTANDING-WORK-2026-04-27.md` (now stale — every "remaining" item from that snapshot landed on `main` during the 2026-04-28 session). This file is the resume signal for whoever picks up next.

---

## State of the project at the close of 2026-04-28

**Both major plans are now complete:**
- Master refactor plan (`memory/REFACTOR-2026-04-25.md`) — **10/10 PRs merged**. PR 10 (Neon shedding) shipped today as #75 + #76 hardening.
- Workstream C UCBA compliance (`memory/FOLLOWUP-2026-05-01.md`) — **4/4 sub-workstreams merged**. C3c (auction UI) shipped as #74; C4c (ethics admin panel) shipped as #73.

Full session record: [`memory/SESSION-2026-04-28-allnighter.md`](SESSION-2026-04-28-allnighter.md). Auditor ROUND 5 entry: [`memory/AUDITOR-LOG.md`](AUDITOR-LOG.md). All 11 PRs (#71–#81) listed with merge SHAs in `compliance/UPDATES.md` and `README.md` §Recent Work.

**No active emergencies. No blocking work in flight.**

---

## Pre-flight checklist for the next session

Run these in order before touching anything:

```sh
npm run ops:health                # verify Neon storage + sync still healthy
npm run ucba:audit                # confirm 0 regressions
npm run rls:validate              # confirm 0 errors
npm run test:compliance           # confirm 194/194 pass
gh pr list                        # confirm only intended PRs are open
gh run list --branch main --limit 5 --json conclusion,name,createdAt
                                  # spot-check post-merge CI on main
```

Expected baseline at session start (matches close-of-day 2026-04-28):
- DB size: ~216 MB / 500 MB cap (~43 %)
- Slim writer: live since 2026-04-28 02:10 ET
- Branch count on Neon: 1 (`main` only)
- All gates green

If any of those drift, address before starting new work.

---

## TWO operator credential actions still pending

Both are credential operations the agent's permission system blocks. They are **not blockers** for daily operation — the systems they enable degrade gracefully — but they should be completed in the next session so the automation actually does what it was designed to do.

### Action 1 — Vercel Production env (enables `neon-branch-prune` cron)

The cron at `/api/cron/neon-branch-prune` fires daily at 04:00 UTC. Without these two env vars set, it exits 200 with `{ skipped: true, reason: "..." }` — visible in cron logs, doesn't fail, doesn't actually clean.

```sh
vercel env add NEON_API_KEY production
vercel env add NEON_PROJECT_ID production
```

- Get the API key at https://console.neon.tech/app/settings/api-keys → scope **Project**, write access.
- Project ID is at the top of https://console.neon.tech/app/projects/{slug}/settings.

After setting: trigger a fresh production deploy (any commit on main) so Vercel picks up the env vars, then watch the next 04:00 UTC cron log for a structured `{ examined: N, pruned: N, kept: {...} }` payload.

### Action 2 — GitHub Actions secrets (enables daily Trestle live audit)

The workflow `.github/workflows/trestle-live-audit.yml` runs at 13:30 UTC daily. Pre-fix, it failed silently because secrets were missing; PR #79 made it skip cleanly with a `::warning`. To actually have the audit run, set:

```sh
gh secret set IDX_CLIENT_ID --repo mallan67/mallan-nyc
gh secret set IDX_CLIENT_SECRET --repo mallan67/mallan-nyc
```

Same Trestle/Cotality credentials already in `.env.local` and Vercel env. After setting: manually `gh workflow run "Trestle live audit"` to verify, or wait for the next 13:30 UTC fire.

---

## Deferred — PR #62 (SMS password reset, Twilio)

**Status:** OPEN since 2026-04-26 · **Decision (2026-04-28):** leave open, defer until brainstorming/research is done.

`feat/sms-password-reset` ([PR #62](https://github.com/mallan67/mallan-nyc/pull/62)) adds SMS-based password reset via Twilio. It is **not ready to merge** as-is — the auth-flow trade-offs (SMS vs. email-only OTP, TCPA opt-in surfaces, account-recovery security model, Twilio vendor contract scope) need a brainstorming pass before a merge/close decision.

**Action for next session:** before any other auth work, run a brainstorming session on the password-reset model. Inputs to consider:
- Current MFA flow is email OTP via M365 SMTP (`lib/auth/mfa.ts`). SMS is "ready when Twilio env vars added" per CLAUDE.md.
- TCPA constraints on SMS to clients (consent capture surface, STOP keyword handling, message templates).
- Whether SMS-reset belongs with brokers/agents only (low volume, internal) or extends to client portals (high volume, TCPA-hot).
- Twilio cost model + vendor contract scope (PR description says "no new vendor" — confirm).

After the brainstorming session: either merge PR #62 with whatever scoping it needs, or close it with a written rationale captured in `compliance/UPDATES.md`.

**Do not auto-merge.** This is the only open PR after PR #81 lands; surfacing it here so it doesn't drift again.

---

## Verification windows

These will close themselves overnight without intervention; just spot-check on resume:

| When | Where | What you should see |
|---|---|---|
| 04:00 UTC Apr 29 | Vercel Cron logs → `/api/cron/neon-branch-prune` | If Action 1 done: structured `{ examined: 1, pruned: 0, kept: { primary: 1 } }` (nothing to prune since the user manually swept all stale branches). If Action 1 not done: `{ skipped: true }`. |
| 13:30 UTC Apr 29 | GitHub Actions → `Trestle live audit` | If Action 2 done: 4 audits executed for real; opens an issue if drift detected. If Action 2 not done: skip warning, exit 0. |
| Hourly all day | GitHub Actions → `Live Site Smoke (cron)` | All green. If a runner-pool flake hits, the new auto-retry workflow reruns it automatically; the original failure no longer pages. |
| Every 10 min | Vercel Cron → `/api/cron/idx-sync` | Slim raw_data writes; `npm run ops:health` last-run line should always be < 0.2h ago, 0 errors. |

---

## What to pick up next (prioritized)

### Option A — Mallan Intelligence Platform planning (next-phase work)

There's a WIP planning doc at [`docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md`](../docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md). It is currently untracked on the working tree (excluded from PRs because it's strategic, not implementation). Read it first; it describes the next strategic direction.

### Option B — Search redesign (was hinted at in older specs, never executed)

Search is the highest-leverage UX surface. Older specs in `docs/superpowers/specs/_archived-2026-04-27/` (the ones moved to archive in PR #71) include `2026-03-25-search-ux-flatten-design.md` and `2026-03-23-schema-driven-search-design.md`. Read those, decide whether they're still aligned with the current state, then either resurrect or write a fresh search-redesign plan.

### Option C — Worktree cleanup (cosmetic; ~10 minutes)

Today's session left these worktrees on merged branches; safe to remove:

```sh
git worktree remove C:/Users/MayaAllan/Desktop/mallan-nyc-c3c
git worktree remove C:/Users/MayaAllan/Desktop/mallan-nyc-c4c
git worktree remove C:/Users/MayaAllan/Desktop/mallan-nyc-pr10
git worktree remove C:/Users/MayaAllan/Desktop/mallan-nyc-pr11
git worktree prune
```

(Skip any worktree the user wants to keep around for active work.)

### Option D — Prisma 7 upgrade (PR 12 from old plan; still queued)

Was originally gated on "PR 10 merged + ≥1 week prod stability." PR 10 just merged tonight; the week starts the clock now. So earliest start is ~2026-05-05. Not urgent — current Prisma 6.19 has no known issues.

---

## Will Neon stay in the free range?

**Yes — comfortably, with the current architecture.**

| Window | DB size | % of 500 MB cap | Source of growth |
|---|---|---|---|
| Pre-session (yesterday close) | 290.94 MB | 58.2 % | Pre-shed; ~3 MB/day from fat raw_data |
| Post-shed + VACUUM (02:53 ET) | 196.23 MB | 39.2 % | Backfill close |
| End-of-day (16:00 ET) | 216.43 MB | 43.3 % | +20 MB across 13 h on an atypically busy day (10 PRs, multiple Vercel previews, MVCC churn) |

**Steady-state forecast** (slim writer + branch prune both live):

- Idx-sync writes ~5 listings × 5 KB slim raw_data per cycle. Net DB growth is ~0 once autovacuum reclaims dead tuples (it churns the same 19 K rows).
- Other tables (audit_events, demand_signals, market_snapshots, lead-scoring outputs) grow ~0.3–0.8 MB/day combined under normal traffic.
- **Realistic net growth: 0.5–1 MB/day.**

**Runway from 216 MB:**
- To 80 % warning line (400 MB): **~6 months**
- To 100 % hard cap (500 MB): **~9 months**

**Two safety nets that didn't exist 24 hours ago and now keep it that way:**
1. Slim writer caps every Trestle row at ~5 KB (was ~14 KB). New rows can't grow the way they did before.
2. `neon-branch-prune` cron deletes idle preview branches nightly. Prevents the secondary metadata-space leak vector that was exposed today.

**Earliest next phase-6 trigger:** `audit_events` partition at 10 M rows. Currently 13 K rows. **Months away** — not a near-term concern.

**Conclusion:** Free tier holds. The next time storage warrants attention is either when slim-writer assumptions break (e.g., Trestle adds large new fields to the keep set) or when `audit_events` approaches the partition trigger. Neither is imminent.

---

## Don't-forget pointers

- `NEON.md` — read before any DB / migration / `vercel.json` work. §11 (new) documents the Neon-Vercel preview-branch architecture.
- `CLAUDE.md` — project instructions; check the Active Follow-up block for anything new.
- `compliance/UPDATES.md` — running compliance changelog. Add to it before shipping any compliance-affecting change.
- `memory/AUDITOR-LOG.md` — round-by-round release record. Add a new ROUND for any future multi-PR session.
- `npm run ucba:audit` — must show **0 regressions** before any merge to main.

End of next-session entry point.
