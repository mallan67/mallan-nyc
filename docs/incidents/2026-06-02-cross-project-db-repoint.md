# Incident — Production bound to wrong Neon project (cross-project DB repoint) — 2026-06-02

**Status:** RESOLVED (production recovered; safety lock merged). Follow-ups open.
**Severity:** P1 — public site degraded (agent pages 500, ~34 listings instead of 105k) for ~30h.
**Author:** Claude (Opus 4.8) with Maya Allan.

---

## Summary
Production's app reads the **bare** uppercase env vars `DATABASE_URL` / `DATABASE_URL_UNPOOLED` /
`ASSISTANT_DATABASE_URL`. Those Production-scoped vars pointed at the **stale** Neon project
**`morning-bread-68708332`** (compute `ep-royal-dawn-ad6eh8t2`, Free tier). The canonical, current data —
105,697 listings, the 4 CRM exclusives, the `agents.trestle_mls_id` column, full history — lives on a
**different** Neon project, **`hidden-mountain-87248164`** (compute `ep-cold-waterfall-adno3ao2`, Launch),
which the Vercel-Neon integration injects as `database_*` vars the app does **not** read.

Result: production served the stale DB → `prisma.agent.findFirst({ select:{ trestle_mls_id }})` threw
**P2022 (column does not exist)** → `/api/agents/[slug]/listings` 500; public search showed ~34 listings.

## Root cause
- **Two separate Neon projects**, not two endpoints on one branch (the ownership map was wrong on this).
- The **`rotate-db-keys`** GitHub workflow is hardwired to `PROJECT_ID=morning-bread`, resolves
  `select(.primary==true)` (→ royal-dawn), requests `connection_uri` with **no `endpoint_id`** and **no host
  guard**, then writes the result to the bare Production env vars + redeploys.
- Prior rotations wrote royal-dawn but their **redeploy failed** (missing `name`), so production kept the good
  cold-waterfall env. The **2026-06-01 06:35:23Z** rotation succeeded end-to-end → production cut over to
  royal-dawn. (Pinned by: `gh secret DATABASE_URL` updated 06:35:23Z; `rotation-history.log` "06:35:28Z";
  last cold-waterfall write 06:31Z.)

## Detection
Agent-listings 500s in production; `idx:validate`/behavioral investigation; direct DB reads (BLOCK 0) proved
royal-dawn lacks `trestle_mls_id` + has 0 exclusives while cold-waterfall has both.

## Resolution (2026-06-02)
1. **Preserved the orphaned audit tail** written to royal-dawn after the cutover — **46,437 rows** of
   `audit_events` copied into cold-waterfall (new ids, `created_at` preserved), verified exported==imported
   across one bulk + three incremental sweeps. (No `leads`/`inquiries`/`deals`/client data was split — only
   `audit_events` + a re-derivable `geocode_cache`.)
2. **Cotality check:** confirmed `trestle_mls_id=39361` → Member "Maya Allan" (Active), 1 active + 34 closed —
   so the repoint restores real listings, not just clears the 500.
3. **Compliance gate (§G + rebny-compliance):** type-check / rls:validate / compliance-check / ucba:audit /
   crm:test PASS; **§2.05 = 0**. Two pre-existing **operational** reds (`idx:validate` media-backfill cron not
   scheduled; `ops:health` chronic media coverage) were **waived** for the emergency repoint — see
   `docs/step3-compliance-waiver-2026-06-02.md`.
4. **Repointed the 3 bare Production-only vars** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
   `ASSISTANT_DATABASE_URL` → cold-waterfall (Vercel CLI; Preview/Development + `database_*` integration vars
   untouched; rollback snapshot saved).
5. **Redeployed** production (aliased `https://mallan.nyc`).
6. **Verified:** `/api/health`, `/api/agents/maya-allan/listings` (500→200, ~35 listings),
   `/api/agents/julia-djaafar/listings` (500→200), `/api/listings?type=sale|rent` → 200. Native post-cutover
   write confirmed on cold-waterfall (read **and** write path moved). royal-dawn quiescent (0 new rows / ~18 min).
7. **Disabled the scheduled rotation** — **PR #321** (merged `2026-06-02T13:36:40Z`, `666b8735`): commented out
   the `schedule:` cron in `rotate-db-keys.yml`, kept `workflow_dispatch` (manual-only).

## Impact
- ~30h of degraded public site (agent pages 500; search ~34 listings).
- No customer/business data lost or split (only audit logs were on royal-dawn; all preserved).

## Rollback assets
- Royal-dawn env values saved to a local temp file (derived from `A_CONN`).
- Each audit sweep has an id-watermark rollback; Neon **7-day PITR** on both projects.

## Follow-ups (open)
1. **`rotate-db-keys` retarget + host guard** before re-enabling the schedule — design in
   `docs/rotate-db-keys-host-guard-patch-2026-06-02.md`. Until then it stays `workflow_dispatch`-only.
2. **Correct the inverted docs:** `CLAUDE.md §B`, `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`, `NEON.md §11`
   — they call morning-bread "production" and conflate cold-waterfall's project. Production canonical =
   **hidden-mountain/cold-waterfall**; morning-bread/royal-dawn = stale/do-not-serve.
2b. Decide long-term: let the hidden-mountain Vercel-Neon integration own the production `DATABASE_URL` (avoids
   the hardcoded-value drift risk introduced by this emergency repoint).
3. **B1** — wire `/api/cron/media-backfill` into the cron schedule (or remove the route).
4. **B2** — chronic media-sync deadlock + low `listing_media` coverage (`docs/incidents/2026-05-21-...` RC1).
5. ~20,774 **pre-cutover** royal-dawn `audit_events` (older period, not on cold-waterfall) — decide whether to
   archive for a unified retention trail.
6. Fix `validate-workflow-completeness.js` (crashed → `compliance-check` "unverified").

## Report-only artifacts from this incident
`docs/cross-project-recovery-plan-2026-06-02.md` · `two-project-comparison-plan/-query-pack-2026-06-02.*` ·
`step1-audit-events-preservation-commands-2026-06-02.md` · `step3-compliance-waiver-2026-06-02.md` ·
`rotate-db-keys-host-guard-patch-2026-06-02.md` · `royal-dawn-reconciliation-plan-2026-06-02.md` ·
`neon-console-topology-verification-2026-06-02.md`.

---
*Recorded 2026-06-02 after PR #321 merge.*
