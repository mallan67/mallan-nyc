# Step 3 compliance-gate waiver — 2026-06-02 (emergency DB repoint ONLY)

> Maya-approved waiver for the cross-project production DB repoint (royal-dawn → cold-waterfall).
> Scope: **this emergency recovery only.** Both items remain open follow-up tickets.

## Gate result (full §G + rebny-compliance, run 2026-06-02)
PASS: `type-check` (0 errors) · `rls:validate` (0 errors) · `compliance-check` (0 BLOCKER+STRICT) ·
`ucba:audit` (0 regressions) · `crm:test` (39/39). REBNY **§2.05 = 0 violations**.

## Waived (pre-existing, operational — NOT compliance violations)
- **B1 — `idx:validate` critical:** `[10/35] Cron Schedule Completeness` → `/api/cron/media-backfill → NOT SCHEDULED`.
  A cron-wiring gap (static repo check). Fix touches cron config (`vercel.json`/`.github/workflows`) — HELD surface.
- **B2 — `ops:health` CRITICAL:** chronic `media-sync` cursor staleness + `listing_media` coverage 28.5% / 8,021
  IDX listings with empty media (documented: `docs/incidents/2026-05-21-chronic-media-sync-root-cause.md` RC1),
  plus `sync watermark 30.1h stale`.

## Waiver rationale (Maya, 2026-06-02)
- Both are **pre-existing operational issues already live in production** (same code; the repoint is a DB-binding
  change, not a code change → does not introduce them).
- **Not** caused by Step 1 (audit copy touched only `audit_events`).
- **Not** REBNY / UCBA / Fair Housing / §2.05 compliance violations (all green).
- The `sync watermark stale` component is an **artifact of the incident** (crons stopped on cold-waterfall at the
  06:30 cutover) and is **expected to improve** once production is repointed back.
- Staying on royal-dawn = live site serving a gutted DB (34 listings, broken agent pages) — worse than the waived items.

## Follow-up tickets (after emergency recovery)
1. Wire `/api/cron/media-backfill` into the cron schedule (or remove the route if dead).
2. Resolve chronic media-sync deadlock + raise `listing_media` coverage (RC1 incident).
3. Fix `validate-workflow-completeness.js` (crashed → `compliance-check` "unverified").

*Record only. Author: Claude (Opus 4.8), 2026-06-02.*
