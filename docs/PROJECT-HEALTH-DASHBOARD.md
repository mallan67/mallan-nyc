# Project Health Dashboard — mallan.nyc

> **Living operational status for the live Cotality/Trestle synchronization platform.** Shared source
> of truth for **Claude · Codex · ChatGPT** (see [`AGENTS.md`](../AGENTS.md)). This is not "an IDX
> website" — it is a live sync platform with downstream consumers: search, CRM, portal, media,
> compliance, archive, email, contact.

**Proof-first rule for this dashboard:** a cell is only 🟢 with **evidence**. A green cell without
evidence is the FARE-Act trap at operational scale (looks fine, isn't verified). Everything defaults
to **⚪ UNVERIFIED / fail-closed**, not assumed-healthy.

**Legend:** 🟢 healthy (verified) · 🟡 watch / degraded · 🔴 problem · ⚪ not verified this cycle.

**Two tiers:**
- **Auto tier** — refreshed read-only by `npm run health:probe` (git/PR, Neon identity, cron cadence,
  and — when a canonical `DATABASE_URL` is present — DB growth + Cotality ingestion freshness). Every
  cell is timestamped. The probe touches **nothing** in production; it only rewrites the block below.
- **Assessed tier** — needs a tool the local probe doesn't have (Vercel MCP runtime logs, live smoke,
  Lighthouse, manual review). Maintained by the agent doing the work; defaults ⚪ until verified.

---

## Auto-probed tier

<!-- HEALTH:AUTO:START -->
_Last probed (UTC): **2026-07-01T19:46:07Z** — refreshed by `npm run health:probe` (read-only). ⚪ = not verified this run._

| Area | Status | Evidence |
|------|--------|----------|
| Repo / main HEAD | 🟢 | main `10ea57c2`; probed from branch `docs/agent-health-dashboard-2026-07-01` |
| Open PRs | 🟡 | 39 open (30 non-audit): #466, #465, #428, #364 |
| PR #465 CI (rehydration guard) | 🟡 | 8 checks — 0 fail, 1 pending; review CURRENT HEAD before merge |
| Neon canonical identity | 🟢 | default `main`=`br-crimson-frog-adr7g9gt` (ready); 2 branch(es) |
| Gate 6 rollback branch | 🟢 | `pre-gate6-5k-pilot-2026-07-01` (br-winter-credit-adlh315q) ready |
| Cron cadence (live Cotality) | 🟢 | 22 crons; idx-sync `*/10 * * * *`, media-sync `*/15 * * * *`, db-keepalive `*/15 * * * *` |
| media-backfill schedule (idx:validate baseline) | 🟡 | NOT SCHEDULED — known idx:validate baseline critical (accepted, not this lane) |
| Cotality ingestion freshness | 🟢 | last_synced_from_trestle max 6m ago (cadence 10m) |
| DB growth / archive state | 🟢 | 110,597 listings; 2,032 archived (sync_status='archived') |
<!-- HEALTH:AUTO:END -->

> To fill the DB rows, run with the canonical cold-waterfall connection in env (read-only), e.g.
> `DATABASE_URL_UNPOOLED=… npm run health:probe`. Host-guarded to `ep-cold-waterfall-adno3ao2`.

---

## Assessed tier (agent-maintained; default ⚪ UNVERIFIED)

Update the **Status**, **Verified (UTC)**, and **Evidence / how to refresh** columns when you verify a
row. Do **not** mark 🟢 without a captured proof (log line, URL probe, validator output).

| Area | Status | Verified (UTC) | Evidence / how to refresh |
|------|--------|----------------|---------------------------|
| Vercel production deploy | ⚪ | — | Vercel MCP `get_project` / `list_deployments` → latest `target=production` READY |
| Vercel runtime errors (24h/7d) | 🟡 | 2026-07-01 (handoff) | 12 error groups in last audit; DB-keepalive 500 (2026-07-01 18:00Z); read-only-txn INSERT class last seen 2026-06-28 — reverify clean 24h window post-#465 (Vercel MCP `get_runtime_errors`) |
| Live Cotality ingestion health | 🟢 | 2026-07-01 (handoff) | recent `/api/cron/idx-sync` runs fetched 148/159 records, 0 sync errors (Vercel logs) — reconfirm each cycle |
| Media pipeline | ⚪ | — | media-sync cron + `backfillEmptyMedia`; verify no archived-media rehydration after #465 merges |
| Search projection | ⚪ | — | `listing_search_projection` freshness vs `listings`; PR-5B is HELD |
| CRM | ⚪ | — | `npm run crm:test` (172-smoke) + a live `/crm` load |
| Portal (buyer/seller/landlord) | ⚪ | — | IDOR lane #458/#459 merged; re-smoke owner routes + PII masking |
| Email / notifications | ⚪ | — | dispatcher is HELD; confirm no silent send failures |
| Contact funnel | 🔴 | 2026-07-01 (handoff) | contact submission DB errors 2026-06-28 — needs a controlled contact-form smoke before declaring healthy |
| Open Houses | 🟢 | 2026-07-01 | twin-safe display fixes #463/#464 merged; SL-0007 ↔ RLS twin verified |
| Compliance validators | 🟢 | 2026-07-01 | rls 0 err · ucba REGRESSIONS 0 · compliance-check 0 BLOCKER+STRICT (re-run per change) |
| Security | ⚪ | — | security-agent PASS required before any deploy touching auth/routes/env |
| Neon health (compute/pooler) | 🟡 | 2026-07-01 (handoff) | `db-keepalive` 500 on pooler `ep-cold-waterfall-…-pooler` 2026-07-01 — watch reliability |
| Runtime SODA/DOB queries | 🟡 | 2026-07-01 (handoff) | `seller-scoring` (`job_filed_date`), `demand-signals` (`community_board` grouping) 200-with-warnings |
| Nearby POI (Overpass) | 🟡 | 2026-07-01 (handoff) | repeated `406` warnings though HTTP 200 — feature may be degraded |
| Homepage feed timestamp | 🟡 | 2026-07-01 (handoff) | footer says "last updated February 11, 2026" — confirm static vs live; fix if static |
| Lighthouse / performance | ⚪ | — | not run this cycle (PageSpeed/media lane HELD) |
| SEO | ⚪ | — | not run this cycle |
| Accessibility | ⚪ | — | not run this cycle |
| Mobile / responsive | ⚪ | — | not run this cycle |
| Technical debt | ⚪ | — | narrative — see handoff snapshot |

---

## Open production risks (source: handoff snapshot)

Canonical detail lives in [`docs/operations/site-audit-handoff-2026-07-01.md`](operations/site-audit-handoff-2026-07-01.md).

- **P1** — PR #465 must not merge until Codex reviews **current HEAD `65b9507a`** (NULL-safe guard is present); re-run gates.
- **P1** — Neon DB reachability instability (`db-keepalive` 500).
- **P1** — Contact funnel health unproven (DB errors 2026-06-28).
- **P2** — SODA/DOB query drift; Overpass 406; social-proof external timeout; stale homepage feed timestamp.
- **P3** — cron route comments mismatch real schedule (fix comments, not schedules); `media-backfill` NOT SCHEDULED baseline (accept or fix).

---

## Gate 6 archive/drain status

- Rollback branch `pre-gate6-5k-pilot-2026-07-01` (`br-winter-credit-adlh315q`) exists; restore LSN `4/745307E0`.
- 5K **dry-run** done (backlog 80,712; scanned 5,000; archived 0; skipped 0; errors 0). **No execute has run.**
- `ARCHIVE_T180_BACKLOG_ENABLED` OFF. Nightly retention cron stays 500-cap, flag-gated.
- **Decision:** hold Gate 6 execute until #465 (rehydration guard) is reviewed on current HEAD and merged.

---

## Refresh protocol (every session, before handoff)

1. `npm run health:probe` — refreshes the auto tier (pass the canonical `DATABASE_URL_UNPOOLED` to fill DB rows).
2. Update any assessed-tier rows you actually verified this session (with evidence). Leave the rest ⚪.
3. Update [`docs/operations/site-audit-handoff-YYYY-MM-DD.md`](operations/) with the session narrative + exact stop point.
4. Do not mark 🟢 without proof. Do not rely on chat memory.
