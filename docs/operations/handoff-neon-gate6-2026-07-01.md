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
restore LSN `4/745307E0`. **No additional rollback branch is required before continuing Gate 6.**

## Gate 6 Status

- ✅ Rollback branch created
- ✅ 5K dry-run completed: eligible backlog ≈ 80,712 · scanned 5,000 · archived 0 ·
  execute=false · skipped 0 · errors 0
- **No production archive execute has ever run. Gate 6 remains paused.**

### Why Gate 6 is paused

Archived listings could be rehydrated by the live Cotality synchronization because
`lib/idx/sync.ts` was restoring `raw_data`, `media`, and `sync_status` after archive.
PR #465's current HEAD fixes this by protecting archived rows (NULL-safe
`archivedSafeMediaWhere`). PR #465 is awaiting final Codex review of the current HEAD before
merge. **Do not execute Gate 6 until #465 is merged.** (Registry: OPS-006. Related decision
input: OPS-009 — the `ARCHIVE_T180_BACKLOG_ENABLED` flag swaps the eligibility clock; it does
NOT gate the nightly archive loop itself.)

## PR Status

- **PR #465** — archive rehydration guard. NULL-safe implementation completed; awaiting
  current-HEAD Codex review. **Not merged.**
- **PR #466** — cross-agent governance (AGENTS.md, Health Dashboard, Platform Issue Registry,
  health probe). Codex findings addressed; awaiting latest review. **Not merged.**

## Production Scheduling (intentional — do not change)

- Live Cotality/Trestle sync: every 10 minutes
- Media synchronization: every 15 minutes
- DB keepalive: every 15 minutes

## Current Audit Framework

Every issue in `docs/PLATFORM-ISSUE-REGISTRY.md` has: Evidence Score · Blast Radius ·
Detection Method · Technical Owner · Verification Owner · Regression Watch (where applicable).
Hypotheses are tracked separately (H-###). **Nothing is considered confirmed without evidence.**

## Current Priorities

1. Merge PR #466 after clean review.
2. Merge PR #465 after clean review.
3. Run the health probe again (`npm run health:probe`, read-only).
4. Verify Vercel runtime health (note registry RW-002: the idx-sync `25006` error class must
   show 7 consecutive clean days — watch until 2026-07-05).
5. Reconsider Gate 6 execute (inputs: #465 merged + OPS-009 flag semantics decision).

## Shedding sequence (Maya directive 2026-07-01 — DO NOT EXECUTE YET)

**Objective:** stop 80K+ old terminal records being repeatedly rebuilt/rehydrated/rescanned by
Cotality sync. Data integrity and stopping duplication/churn — **cost savings are secondary**
(stripping is logical-only; billed storage does not drop inside the 7-day PITR window — measured
in the s1 reclaim assessment).

Invariants: **archive must be durable · Cotality sync must not recreate stripped data · no-op
syncs must not rewrite unchanged rows** (registry OPS-010A).

1. Merge #466 after clean Codex review.
2. Merge #465 after clean Codex review (stops rehydration — OPS-006).
3. Verify archived-row protection after **one live Cotality sync cycle** (archived row keeps
   `sync_status='archived'`, `raw_data` null, `media` []).
4. Decide OPS-009 flag semantics.
5. Then approve **only the 5K pilot execute**.
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
- **Working-tree caveat:** as of 2026-07-01, `docs/PLATFORM-ISSUE-REGISTRY.md` is untracked and
  `AGENTS.md` / `docs/PROJECT-HEALTH-DASHBOARD.md` carry uncommitted updates on branch
  `docs/agent-health-dashboard-2026-07-01`. Until these are committed to the #466 branch and
  merged, an agent reading `main` will NOT see the registry or today's governance rules. The
  "Read First" list is only fully satisfiable from this branch (or after #466 merges with these
  changes included).
