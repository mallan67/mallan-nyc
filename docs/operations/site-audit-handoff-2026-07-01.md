# MAllan Website — Site Audit Handoff

Date: 2026-07-01
Repo: `mallan67/mallan-nyc`
Vercel project: `mallan-nyc` / `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`
Team: `mallan` / `team_kZQh5NYLyrOKqffK0r9EXf4E`

## Purpose

This file is the single handoff checkpoint for the current operating picture. Use it before starting new work, after Claude/Codex makes changes, and before any production-affecting action.

The goal is to stop fragmented decisions. Future agents should update this file with what was checked, what changed, what is broken, and what is blocked.

## Non-negotiable holds

Do not run without explicit approval:

- Gate 6 `--execute`
- any archive drain execute
- 20K or 80K drain batches
- manual cron trigger
- Vercel env changes
- Neon reclaim/downgrade
- `VACUUM FULL`
- `rotate-db-keys`
- production migrations / `prisma migrate deploy`
- PR-5B
- projection backfill
- PageSpeed/media lane
- CRM UI rebuild work beyond audit
- notification dispatcher
- open-house v2

## Current production database identity

Canonical Neon production:

- Project: `hidden-mountain-87248164`
- Org: Vercel-managed org / `Vercel: maya`
- Branch name: `main`
- Internal branch ID: `br-crimson-frog-adr7g9gt`
- Canonical endpoint: `ep-cold-waterfall-adno3ao2`

Stale / wrong targets:

- Project: `morning-bread-68708332`
- Endpoint: `ep-royal-dawn-ad6eh8t2`

Existing rollback branch for Gate 6 pilot:

- Name: `pre-gate6-5k-pilot-2026-07-01`
- Branch ID: `br-winter-credit-adlh315q`
- Parent: `br-crimson-frog-adr7g9gt`
- Restore LSN: `4/745307E0`
- Created at: `2026-07-01T07:40:39Z`
- Compute: none / `--no-compute`

## Current repo state

Repository is public and default branch is `main`.

Recent critical PRs already merged:

- #457 — Gate 6 bounded archive-drain tooling, merged as `c60ed35511a15752f39227d790d988d8a591c1bd`. Tooling only. No execute.
- #458/#459 — owner portal IDOR lane closed.
- #460/#461 — Fair Housing/compliance lane closed.
- #463/#464 — open-house display bug lane closed.

Current open PR:

- #465 — `fix(gate6): idx-sync archived-row rehydration guard`.
- Status: open, mergeable, not merged.
- Head: `f94a1b0cd4397af5bf83aa4e5bcffc7ab172af32`.
- Changed files: `lib/idx/sync.ts`, `tests/runtime/idx-sync-archived-rehydration-guard.test.ts`.
- Current blocker: Codex P2 says `archivedSafeMediaWhere()` must be null-safe. Current `sync_status: { not: 'archived' }` can exclude legacy `sync_status IS NULL` rows from media refill. Fix must allow NULL + non-archived, while excluding exact `archived`.
- Do not merge #465 until this is fixed and re-reviewed.

## Meaning of “archive” in this system

Archive does not mean delete. It keeps the listing row but strips heavy fields:

- `raw_data -> JSON null`
- `media -> []`
- `compliance -> {}`
- `sync_status -> archived`

The purpose is to reduce database bloat and stop old terminal listings from carrying heavy Cotality payloads. The risk being fixed by #465 is Cotality re-emitting terminal rows and rehydrating those stripped fields, causing strip -> rehydrate -> strip churn.

## Gate 6 archive/drain state

- Rollback branch exists.
- 5K dry-run was completed successfully.
- Dry-run output: eligible backlog `80,712`; scanned `5,000`; execute `false`; archived `0`; skipped `0`; errors `0`.
- No Gate 6 execute has run.
- No production rows have been stripped by Gate 6 operator.
- `ARCHIVE_T180_BACKLOG_ENABLED` remains OFF / absent.
- Nightly cron remains 500-cap and flag-gated.

Decision: Hold Gate 6 execute until #465 rehydration guard is clean and merged.

## Vercel / production runtime audit snapshot

Project metadata:

- Framework: Next.js
- Node: 20.x
- Domains: `mallan.nyc`, `www.mallan.nyc`, `mallan-nyc.vercel.app`
- Note: Vercel project metadata may show the latest deployment as a PR preview; check production runtime logs separately.

Vercel runtime errors, last 7 days:

- 12 runtime error groups found.
- Major historical error class: IDX sync attempted writes while database transaction was read-only (`cannot execute INSERT in a read-only transaction`). Last seen 2026-06-28 on older deployment. Needs confirmation it is no longer recurring after current deployment.
- `DB Keepalive` failures: database reachability to `ep-cold-waterfall-adno3ao2-pooler...` failed. Last seen 2026-07-01 18:00 UTC. Needs attention because it can indicate pooler/connection reliability issues.
- `CONTACT` submission DB error: two events on 2026-06-28. Needs direct contact-form smoke test before declaring contact funnel healthy.
- `social-proof` cron external fetch timeout. Last seen 2026-07-01 16:00 UTC. Likely external network/vendor issue, but should not log as scary unhandled error if non-critical.
- `lead-scoring` cron database reachability error. Last seen 2026-06-28.
- `idx-sync` has also shown successful runs in the last 24h with zero errors on specific runs, so the old read-only transaction issue may be resolved, but this must be verified over a clean 24h window after #465 and any future deploy.

Vercel runtime logs, last 24h:

- `/api/cron/db-keepalive` returned 500 once due to DB reachability.
- `/api/cron/social-proof` returned 200 but logged `TypeError: fetch failed` / external timeout.
- `/api/cron/demand-signals` returned 200 with SODA query coordinator warning: `community_board` column not grouped.
- `/api/cron/seller-scoring` returned 200 with SODA warning: `job_filed_date` no such column.
- `/api/nearby-poi` repeatedly returned 200 but logged Overpass `406` warnings.
- `/api/cron/idx-sync` had successful recent runs fetching 148/159 records with zero sync errors.

## Public site smoke snapshot

Homepage `https://mallan.nyc/` loads and renders public content: hero, navigation, featured listings, license/fair-housing text, footer, and REBNY/IDX disclaimer.

Attention item: homepage footer says listing data last updated `February 11, 2026`. This is stale relative to the current audit date. Confirm whether this is static placeholder text or actual IDX timestamp. If static, fix because it undermines trust and compliance optics.

## Current broken / needs-attention list

### P0 / Blockers

None confirmed as active site-down issues in this pass.

### P1 / High priority

1. PR #465 not merge-ready due to NULL sync_status media-guard bug.
   - Fix TDD-first.
   - Re-run type-check, idx-sync suites, compliance validators.
   - Request Codex re-review.
   - Do not merge until clean.

2. Vercel DB reachability instability.
   - `db-keepalive` 500 on 2026-07-01.
   - Check Neon compute/pooler health and whether keepalive itself is useful or causing noise.
   - Confirm no user-facing failures during the same window.

3. Contact funnel health not proven.
   - Vercel shows contact submission DB errors on 2026-06-28.
   - Run a controlled contact-form smoke test or inspect logs after a test submission.

### P2 / Medium priority

4. SODA/DOB query drift in `seller-scoring` and `demand-signals`.
   - `job_filed_date` appears invalid.
   - `community_board` grouping query is invalid.
   - These are 200 responses with warnings, but they reduce lead/scoring signal quality.

5. Nearby POI Overpass 406 warnings.
   - Repeated warnings mean POI feature may be degraded even though HTTP returns 200.
   - Audit query format and fallback behavior.

6. Social proof external timeout.
   - Should degrade quietly if non-critical.
   - Add timeout/fallback logging classification if needed.

7. IDX footer timestamp stale on homepage.
   - Verify data source and display logic.

### P3 / Operational hygiene

8. `vercel.json` comments mismatch real cron schedule.
   - `db-keepalive` route comment says every 4 minutes, but `vercel.json` schedules every 15 minutes.
   - `idx-sync` route comment says every 4 hours, but `vercel.json` schedules every 10 minutes.
   - Not runtime-breaking, but bad for handoffs.

9. Existing `idx:validate` baseline critical `/api/cron/media-backfill -> NOT SCHEDULED` remains pre-existing and should either be fixed or explicitly accepted in this file.

## Required periodic recheck protocol

Run this after every meaningful Claude/Codex PR, and at least daily while active development continues.

### GitHub checks

- List open PRs.
- Confirm no PR is merge-ready with unresolved Codex comments.
- Confirm main head SHA and latest merged PR.
- Check changed files for any PR touching:
  - `lib/idx/sync.ts`
  - `app/api/cron/*`
  - `lib/retention/*`
  - `app/api/crm/*`
  - `app/api/portal/*`
  - `vercel.json`
  - `prisma/schema.prisma`

### Vercel checks

- Check latest production deployment is READY.
- Check production runtime errors for last 24h and 7d.
- Check top warning/error routes.
- Check DB reachability failures.
- Check contact-form errors.
- Check IDX sync success/failure count.

### Repo/local gates Claude should run before PR handoff

- `npm run type-check`
- relevant jest suite(s)
- `npm run rls:validate`
- `npm run ucba:audit`
- `npm run compliance-check`
- `npm run idx:validate`
- for public route changes: `npm run validator:live-site` if env allows
- for CRM/static changes: `npm run crm:check-build`

### Live smoke checks

At minimum:

- `/`
- `/buy`
- `/rent`
- `/sell`
- `/open-houses`
- `/agents`
- `/contact`
- `/crm`
- `/api/health` if intentionally public
- one active listing detail page
- one Mallan local exclusive detail page

Record pass/fail and timestamps here.

## Next recommended sequence

1. Fix PR #465 NULL-safe media guard.
2. Re-request Codex.
3. Merge #465 only after clean review.
4. Re-check Vercel runtime errors for 24h clean window or at least immediate post-deploy sanity.
5. Only then reconsider Gate 6 5K execute.
6. In parallel, audit and fix production warnings: contact form, DB keepalive, SODA queries, POI 406, stale IDX timestamp.

## Update rule for future agents

Before starting new work, update this file with:

- current date/time
- main SHA
- open PRs
- latest Vercel production deployment
- last 24h runtime errors
- unresolved blockers
- what was changed during the session
- exact stop point

Do not rely on chat memory alone.
