# Operational handoff — 2026-08-10

## Production identity

| | |
|---|---|
| `main` / production SHA | **`2d121daaf6dbcd3d027d6d337901a18e43c03ad8`** (Merge PR #598) |
| Deployment | `dpl_Ey4rGtD26mij3ULsgJvrs88md6yy` — READY, holds `mallan.nyc` |
| Verified | `https://mallan.nyc/api/release-identity` returned the merge SHA |
| Release Truth | **`PROD_PROVEN`** — identity + listing smoke bound to that exact deployment, first run |
| Neon | `hidden-mountain-87248164` · `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`) |

## What changed this session

**PR #598 — MERGED and Production-proven.** Return-copy detail pages no longer 500
(`/listing/rls20093870` was a hard 500; `fetchFromDB` signalled a redirect with a fabricated
`PublicListingDTO` that `generateMetadata` dereferenced before the redirect could run). The result
model is now a discriminated union. The listing-expiration cron's 30-day and 7-day tasks now carry
`buildMallanOwnedListingWhere()`; `agent_id` is retained only as the recipient requirement.

**PR #599 — OPEN, UNMERGED, HELD for Maya.** R2 policy exclusions gain a bounded re-admission
path plus the corrections listed under "Open risks" below.

## Open production risks

| Risk | State |
|---|---|
| Canonical listing redirects return **HTTP 200 with a client-side RSC redirect**, not 308 | Pre-existing and **NOT fixed**. The route is ISR (`revalidate = 600`), so `permanentRedirect()` is serialised into the flight payload. Mitigated by `noindex, follow` + a correct `<link rel=canonical>`; the client router completes the redirect. Non-JS clients and `curl -L` do not follow. Affects every id-only listing URL, which the site never emits internally. |
| Mallan local listings absent from search and sitemap | 0 of 8,692 sitemap listing URLs are `SL-`/`RL-`. Both gates require `idx_display_yn = true`; both Active SL rows have it `false`, yet their detail pages serve `index, follow`. Needs a REBNY display-gate + exclusives-launch decision — **not touched**. |
| **OPS-026** historical media-summary drift (4,894 listings) | Design CLOSED, **Production backfill HELD**. |
| 43 stranded R2 heroes | Fix built and validated in #599; **not deployed**. |
| CPU reduction | **Still not proven functioning.** The last captured preflight reason is `external_state_unavailable` (handoff 2026-08-02, runtime logs). It was **not re-captured this session** — the Vercel MCP token is expired — so the *current* reason is unconfirmed. What is measured today: 144 One Cycle runs in 24h out of 144 possible 10-minute preflights, i.e. **zero skips**. |
| Leftover Neon branch | `preview-pr597-commit11` (`br-old-dust-ad3idcf6`), created 2026-08-08, 36 MiB logical, still `ready`. |

## Last-24h runtime state (DB-side; Vercel MCP unavailable)

144 One Cycle runs — 143 `success`, 1 `partial` (a single R2 mirror failure on a parked-recovery
attempt), **0 member failures, 0 timeouts**. Total run time 2,758 s (avg 19.2 s, max 57.3 s).
`backlog_remaining` 0 (max 57). `overlap_prevented` 0. `time_budget_exhausted` 0.

Broad Production smoke over 21 URLs: all 200 except `/api/buildings/search` = 401 (auth-protected,
expected). Gallery re-verified on 5 multi-photo listings (67/52/51/50 photos): 1 R2 hero + the rest
single Cotality proxy, **nested proxy 0** in every case.

## Write churn (24h, from durable `audit_events`)

| stream | checked | written | suppressed |
|---|---|---|---|
| `listing_media` | 80,718 | 21,638 (+622 inserts) | 59,319 |
| `listings` | 6,122 | 5,151 | 947 |
| summaries | 4,431 | 1,511 | 2,920 |
| projections | — | 51 | — |

Attribution: **14,995/day** media writes are locator-refresh only (6,643 material);
**3,813/day** listing writes are `raw_data_only`; **1,218/day** are
`modification_timestamp_only`. About **20,026 of 28,351 row writes/day (71%) change nothing a user
or the search projection can see**, and they drove **8,116 ISR revalidations/day**.

Systemic link: the hero-only R2 policy mirrors ~1 photo per third-party listing, so ~17.6k gallery
photos serve from Cotality through `/api/media/proxy`; their signed URLs rotate, so keeping
`media_url_original` fresh is load-bearing for image delivery. R2 storage was traded for DB write
churn, Neon wake time and Cotality egress.

Not attributable from durable data: `persistenceReasons` is computed in `runMediaSync` but never
persisted, so the largest write stream (21,638/day) cannot be split by cause without deriving it
from `rows_updated_changed`.

## Neon

Physical `pg_database_size` 576 MB; branch logical 598 MiB. `listing_media` 217 MB (340,342 rows) ·
`listings` 178 MB (24,723) · `audit_events` 77 MB (101,899). Branch `cpu_used_sec` 199,868 /
`active_time_seconds` 799,072 (lifetime since 2025-12-09 — no per-day series available through the
tooling used). Two branches exist (see leftover branch above).

## Exact stop point

PR #599 head `892eb8e3` + the correction commits that follow it. **CI green, 0 unresolved review
threads, deliberately UNMERGED.** Merge requires Maya's explicit authorization.

Held and untouched: merge #599 · OPS-026 backfill · R2 orphan cleanup · any migration, env or
manual R2 mutation · the Mallan-exclusive search/sitemap gate decision.
