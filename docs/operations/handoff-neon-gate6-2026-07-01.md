# Handoff Prompt — Neon / Gate 6 Current Context (2026-07-01)

> Authored by Maya 2026-07-01; fact-checked by Claude against the same-day full-coverage audit
> (see verification annex at bottom). Give this file to any agent (Claude / Codex / ChatGPT)
> continuing the Neon / Gate 6 stabilization work.

## Read First

Before making any recommendations or changes, read:

- `AGENTS.md`
- `docs/PROJECT-HEALTH-DASHBOARD.md`
- `docs/PLATFORM-ISSUE-REGISTRY.md`
- `docs/operations/site-audit-handoff-2026-07-01.md`

These are the authoritative project documents. **Do not create parallel documentation.**

## Current Objective

We are **not** implementing new features. Current work is stabilizing the production platform
before continuing development: Neon · Cotality/Trestle synchronization · Archive/Gate 6 ·
Production health · Platform audit · SEO corrections · Runtime stability.

## Canonical Production Database

- Neon project: **hidden-mountain-87248164**
- Production branch: **main** (internal id `br-crimson-frog-adr7g9gt`)
- Canonical endpoint: **ep-cold-waterfall-adno3ao2**
- **Ignore stale references:** `morning-bread-68708332`, `ep-royal-dawn-ad6eh8t2`

## Rollback Protection

Rollback branch already exists: `pre-gate6-5k-pilot-2026-07-01` (`br-winter-credit-adlh315q`),
restore LSN `4/745307E0`. **⚠️ SUPERSEDED 2026-07-03: this branch was AUTO-PRUNED (OPS-022, prune cron, 24h retention). A FRESH protected rollback branch is REQUIRED before any 5K execute — recreate + protect it (Maya-held Neon action).**

## Gate 6 Status

- ⚠️ **Rollback branch AUTO-PRUNED 2026-07-03 (OPS-022)** — `pre-gate6-5k-pilot-2026-07-01`
  (`br-winter-credit-adlh315q`) was deleted by the `neon-branch-prune` cron (24h retention,
  `app/api/cron/neon-branch-prune/route.ts:123`). Live branch list = **main only**. A FRESH
  **protected** rollback branch is a HARD prerequisite before any 5K execute (Maya-held Neon action).
- ✅ 5K dry-run completed: eligible backlog ≈ 80,712 · scanned 5,000 · archived 0 ·
  execute=false · skipped 0 · errors 0
- **No production archive execute has ever run. Gate 6 remains paused.**

### Why Gate 6 is paused

Archived listings could be rehydrated by the live Cotality synchronization because
`lib/idx/sync.ts` was restoring `raw_data`, `media`, and `sync_status` after archive.
**PR #465 fixed this and is MERGED (2026-07-02)** — the guard protects archived rows (one-way
strip + display-field freeze + forced `idx_display_yn:false`; NULL-safe `archivedSafeMediaWhere`),
deployed on `858da234` under RW-004 watch (Registry: OPS-006 → Fixed/RW-004).

**Status update 2026-07-03 — the OPS-009 blocker is CLEARED; a NEW blocker (OPS-022) took its
place.** The OPS-009 two-flag controls (`ARCHIVE_ENABLED` + `ARCHIVE_BACKLOG_DRAIN_ENABLED`) are
**IMPLEMENTED + deployed (PR #470, merged 2026-07-03) and behaviorally VERIFIED** (OPS-020: the
03:00:46Z retention run confirmed all four Maya criteria — state OFF, skip reason, T+24h carve-out
ran, no drain). Gate 6 now stays paused on **two remaining prerequisites, both Maya-held**:
(1) **OPS-022** — recreate + protect a fresh rollback branch (the prior one was auto-pruned);
(2) set `ARCHIVE_ENABLED=true` and verify one clean MAINTENANCE cycle. Only then does the 5K
execute become approvable.

## PR Status

- **PR #465** — archive rehydration guard. **MERGED 2026-07-02T02:35Z** after 4 Codex review
  rounds (unarchive-on-canonical-active · exact-match · display-field freeze · forced
  `idx_display_yn:false`). Deployed `858da234`; live baseline verified — registry **RW-004**.
- **PR #466** — cross-agent governance (AGENTS.md, Health Dashboard, Platform Issue Registry,
  health probe). **MERGED 2026-07-02T01:33Z.**

## Production Scheduling (intentional — do not change)

- Live Cotality/Trestle sync: every 10 minutes
- Media synchronization: every 15 minutes
- DB keepalive: every 15 minutes

## Current Audit Framework

Every issue in `docs/PLATFORM-ISSUE-REGISTRY.md` has: Evidence Score · Blast Radius ·
Detection Method · Technical Owner · Verification Owner · Regression Watch (where applicable).
Hypotheses are tracked separately (H-###). **Nothing is considered confirmed without evidence.**

## Current Priorities

1. ✅ DONE — PR #466 merged 2026-07-02T01:33Z.
2. ✅ DONE — PR #465 merged 2026-07-02T02:35Z (4 Codex rounds).
3. Run the health probe again (`npm run health:probe`, read-only) — last run 2026-07-02T04:04Z.
4. Verify Vercel runtime health (note registry RW-002: the idx-sync `25006` error class must
   show 7 consecutive clean days — watch until 2026-07-05).
5. Reconsider Gate 6 execute — updated 2026-07-03: #465 merged ✅ · OPS-009 two-flag IMPLEMENTATION landed + deployed + kill-switch VERIFIED ✅ (PR #470 / OPS-020). Remaining HARD prerequisites before any 5K execute: (a) **OPS-022** — a FRESH protected rollback branch exists (the prior one was auto-pruned 2026-07-03); (b) `ARCHIVE_ENABLED=true` set + one clean MAINTENANCE cycle verified. Both are Maya-held. (Registry OPS-009 / OPS-020 / OPS-022; dashboard Gate-6 sequence.)

## Shedding sequence (Maya directive 2026-07-01 — DO NOT EXECUTE YET)

**Objective:** stop 80K+ old terminal records being repeatedly rebuilt/rehydrated/rescanned by
Cotality sync. Data integrity and stopping duplication/churn — **cost savings are secondary**
(stripping is logical-only; billed storage does not drop inside the history-retention window —
measured in the s1 reclaim assessment; window verified directly from Neon configuration
2026-07-02 as **6 hours**, not the previously documented 7 days [OPS-016]).

Invariants: **archive must be durable · Cotality sync must not recreate stripped data · no-op
syncs must not rewrite unchanged rows** (registry OPS-010A).

1. Merge #466 after clean Codex review.
2. Merge #465 after clean Codex review (stops rehydration — OPS-006).
3. Verify archived-row protection after **one live Cotality sync cycle** (archived row keeps
   `sync_status='archived'`, `raw_data` null, `media` []).
4. OPS-009: two-flag design **IMPLEMENTED + deployed + kill-switch VERIFIED** (PR #470 / OPS-020, 2026-07-03). Remaining before the pilot: **(4a)** recreate + protect a fresh rollback branch (**OPS-022** — the prior one was auto-pruned 2026-07-03); **(4b)** set `ARCHIVE_ENABLED=true` and verify one clean MAINTENANCE cycle.
5. Then approve **only the 5K pilot execute** (requires BOTH flags + `--execute` + `--ack-rollback-branch` + `--max-rows` + the fresh rollback branch from 4a).
6. Scale only after proving the 5K rows **stay stripped** across live sync cycles.

Follow-on after #465: **OPS-010A** diff-before-write suppression (recurring ~750 MB+/mo history
churn — a larger long-term Neon storage driver than the one-time backlog); **OPS-015**
db-keepalive redundancy (tracked decision, not a fix now).

## Do Not (without explicit Maya approval)

- Execute Gate 6
- Change production env
- Run migrations
- Reclaim Neon
- Run VACUUM FULL
- Rotate DB keys (`rotate-db-keys` stays disabled; `workflow_dispatch` exists but is off-limits)
- Modify cron cadence

## How To Work

When reporting findings, separate: **Verified · Observed · Hypothesis · Recommendation.**
Never promote a hypothesis to a confirmed issue. Always cite evidence (file:line, log line,
probe transcript). If production cannot be verified, explicitly state that it is **unverified**
rather than assuming success. Language rule (AGENTS.md §5): "probably/likely/appears/root cause"
are forbidden outside a registered Hypothesis H-### (or "root cause" with Evidence Score ≥ 9).

---

## Verification annex (Claude, 2026-07-01)

Fact-check of the above against same-day evidence:

- Canonical/stale Neon identities, rollback branch + LSN, dry-run numbers, cron cadences
  (idx-sync `*/10`, media-sync `*/15`, db-keepalive `*/15` in `vercel.json`), PR #465/#466
  states, and the rehydration mechanism (`lib/idx/sync.ts:385-424` restoring `raw_data:415`,
  `sync_status:419`) — **all match** the dashboard auto tier, Vercel `list_deployments`
  capture, and the 2026-07-01 operations audit.
- **Working-tree caveat RESOLVED 2026-07-02:** #466 merged — the registry and all governance
  rules are on `main`; the "Read First" list is fully satisfiable from `main`.
