# Storage Health Monitor — Neon + R2 visibility

**Script:** `scripts/storage-health-monitor.ts` · **npm:** `ops:storage-health` · **Status:** read-only, safe to run any time.
**Origin:** PR #1 of the Neon + R2 Infrastructure Closure Audit (`docs/operations/neon-r2-infrastructure-closure-audit-2026-07-08.md` §I).

> **What it is:** the "dashboard/check engine" for Neon + R2 storage. It turns every later storage
> decision (churn guard → retention → raw_data trim → R2 lifecycle) into a *measured* one.
> **What it is NOT:** it changes nothing. No DB writes, no schema changes, no DELETE, no VACUUM, no
> raw_data trimming, no R2 uploads/deletes, no cron/sync/retention side effects. Enforced by
> `tests/runtime/storage-health-monitor-readonly.test.ts`.

## Run it

```bash
# Markdown report to the terminal (default)
npm run ops:storage-health

# Machine-readable JSON (for a future cron / dashboard)
npm run ops:storage-health:json

# Also write the markdown to a file (not committed)
npm run ops:storage-health -- --out=storage-report.md

# Add a precise raw_data on-disk size (full-table scan; costs some compute)
npm run ops:storage-health -- --deep

# TRUE bucket orphan check: read-only LIST of every R2 object, diffed against DB
# keys. Needs the R2 token to hold list permission. Also yields actual R2 storage
# bytes for the free-tier check. OFF by default.
npm run ops:storage-health -- --r2-orphans

# Exit non-zero when overall status is RED (for CI/cron gating)
npm run ops:storage-health -- --strict
```

The script loads `.env.local` / `.env` automatically (same pattern as the other `ops:*` scripts) and
connects to whatever `DATABASE_URL` points at — the canonical production DB is
`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main` (see `NEON.md`).

## What it reports (Closure-Audit §I PR #1, items 1–14)

| # | Metric | Source |
|---|---|---|
| 1 | Neon database size | `pg_database_size(current_database())` |
| 2 | Synthetic/storage-billing size | **Not available via SQL** — Neon control-plane metric; read from the Neon console/API. Neon plan/tier = **needs account confirmation.** |
| 3 | Top tables by total / heap / index / toast | `pg_total_relation_size` / `pg_relation_size` / `pg_indexes_size` / toast rel size |
| 4 | Dead-tuple estimates | `pg_stat_user_tables` (`n_live_tup`, `n_dead_tup`, last autovacuum/analyze) |
| 5 | `listing_media` total rows | `count(*)` |
| 6 | Rows with `r2_key` | `count(*) FILTER (…)` |
| 7 | Rows with `media_url_cached` | `count(*) FILTER (…)` |
| 8 | Rows missing R2 key (total + active) | `count(*) FILTER (…)` |
| 9 | `primary_photo_r2_key` coverage | `listings` — **informational** (column is unused by public readers; readers use `listing_media` directly) |
| 10 | Rows the frontend would proxy from Trestle | active + `media_url_cached IS NULL` + `media_url_original IS NOT NULL`; plus "broken" = no URL at all |
| 11 | `listings` raw_data toast size | catalog toast size (default) or `sum(pg_column_size(raw_data))` under `--deep` |
| 12 | `audit_events` size + count + date range | `count`, `min/max(created_at)`, size from table catalog |
| 13 | Terminal/closed listing media | join on `listings.status = ANY(TERMINAL_STATUSES)`; counts media rows + how many still hold an R2 object (active vs tombstoned) |
| 14 | Green/yellow/red summary | see thresholds below |
| 15 | R2 duplicate / redundancy | duplicate `r2_key` groups (+ status makeup + active-vs-active), same original under different keys (real re-upload waste), same listing/order/type, top-25 groups |
| 16 | True R2 bucket orphan check | opt-in `--r2-orphans`; bucket LIST vs DB keys → orphans + missing; honest "not proven" when not run |
| 17 | Free-tier status | Neon (measured size vs plan — plan unconfirmed) + R2 (Standard free tier; actual bytes only under `--r2-orphans`; op counts need Cloudflare analytics) |

### Duplicate vs orphan — read this before acting

- **`r2_key` is deterministic** (`{folder}/{listingId}/{order}.jpg`). Multiple DB rows with the
  **same key point to ONE R2 object**, so DB-row "duplicates" do **not** multiply R2 storage. Most
  duplicate `r2_key` groups are a live row + tombstoned history rows (soft-delete) sharing the key —
  a `listing_media` **row-retention** matter, not an R2 storage-waste one.
- The check that actually detects wasted R2 storage is **"same original image under different keys"**
  (§15 #2). If that's `0`, re-uploads aren't inflating the bucket.
- **Only `--r2-orphans` can prove there are no bucket orphans** (objects in R2 with no DB row). Without
  it the report says `r2_orphan_check_status: not_run` and makes **no** orphan claim.
- The orphan diff is **scoped to listing-media key prefixes** (`photos/`, `floorplans/`, `videos/`,
  `virtualtours/`). The bucket is shared with other subsystems (broker-uploaded photos,
  `Document.file_url`, …); objects **outside** those prefixes are counted as `out_of_scope`, **never**
  flagged as orphans — a lifecycle PR must confirm the owning table before any action. The reference
  set is `listing_media.r2_key` + `listings.primary_photo_r2_key` + keys derived from
  `listing_media.media_url_cached` (covers CRM variants where cached ≠ r2_key).
- **This tool never deletes** a duplicate or orphan object. Any cleanup is a separate, Maya-approved
  lifecycle PR (roadmap step 5).

`TERMINAL_STATUSES` is **imported from `lib/idx/trestle-mapper.ts`** (the compliance-canonical set:
Closed, Sold, Leased, Rented, Withdrawn, Expired, Cancelled) so the terminal-media count never drifts
from the mapper.

## RAG thresholds (advisory)

Defined in `RAG_THRESHOLDS` at the top of the script. They are **signals, not SLAs** — in particular
the DB-size band is a *predictability* signal, **not** a free-tier-limit claim (the Neon plan is
unconfirmed).

| Dimension | 🟢 Green | 🟡 Yellow | 🔴 Red |
|---|---|---|---|
| R2 coverage (active media w/ `r2_key`) | ≥ 98% | ≥ 90% | < 90% |
| Proxy/Trestle fallback (active) | ≤ 2% | ≤ 10% | > 10% |
| DB size (advisory) | < 1 GiB | < 4 GiB | ≥ 4 GiB |
| Max dead-tuple % (churn tables) | ≤ 20% | ≤ 40% | > 40% |
| Broken active media (no URL) | 0 | — | ≥ 1 |
| Duplicate uploads (same original, diff key) | 0 groups | ≤ 25 | > 25 |

Overall = the worst of the dimensions. **The R2 bucket orphan check is NOT part of the overall RAG** —
it shows as `PROVEN` only when `--r2-orphans` ran, otherwise `UNPROVEN`; the overall status never
implies "no orphans."

## Safety / compliance notes

- **Strictly read-only.** All DB access is `prisma.$queryRaw` / `$queryRawUnsafe` (SELECT only). R2 is
  only checked for *config presence* (`hasR2Config`) — no smoke upload/delete (that lives in
  `scripts/ops-r2-health.ts`).
- **Guarded by test.** `tests/runtime/storage-health-monitor-readonly.test.ts` fails the build if the
  script ever gains a Prisma write method, an `$executeRaw*` call, a DDL/DML SQL verb, or an R2
  mutation. Run it via `npm run test:runtime`.
- **No compliance surface touched.** This change adds a reporting script + test + docs only; it does
  not alter field mapping, display gates, DTO tiers, or any public-facing text, so the UCBA/RLS/IDX
  validators are not triggered by it. `npm run type-check` and the runtime guard test are the relevant
  gates.

## Where this sits in the plan

Ordered roadmap from the closure audit (this is step 1 only):

1. **Monitoring script / storage dashboard** ← *this PR*
2. Sync churn guard plan
3. Retention policy decision (working assumptions: `audit_events` 12-month min; `raw_data` kept for
   active/on-market, slimmed/archived for terminal after a safe window; terminal media metadata kept
   for audit/history/CMA; **no R2 deletion until a retention policy is approved and tested**)
4. raw_data trim/archive PR
5. R2 lifecycle/cleanup PR

Steps 2–5 are **not** started and require explicit Maya approval per the CLAUDE.md holds.
