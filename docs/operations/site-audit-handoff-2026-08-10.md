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
| **OPS-026** historical media-summary drift (4,847 listings, production URL rule) | Design CLOSED, **Production backfill HELD**. **Two severities:** 4,832 cost-only; **12 `primary_photo_url` rows are a correctness defect — 8 render a genuinely different asset, 4 are live.** |
| 43 stranded R2 heroes | Fix built and validated in #599; **not deployed**. |
| **OPS-027** PHASE 4a sibling-revalidation race | Bounded residual on PR #599 — write guard covers only the candidate row, so a sibling change between the staleness check and the write can leave a stale decision. Worst case: one re-admission delayed by an interval, or one wasted admission the drain rejects. **Registered, NOT accepted — awaiting Maya's disposition (implement / accept-and-monitor / hold).** |
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

Attribution — **the three classes are not equivalent and must not be summed as "waste":**

| class | /day | verdict |
|---|---|---|
| Locator refresh | 14,995 | **Necessary under the current delivery architecture.** An unmirrored photo serves from `media_url_original`; that signed URL rotates. High cost, not a useless write. |
| `raw_data_only` | 3,813 | **Attribution still required.** `raw_data` feeds public behaviour (`terminal-since.ts`) and is cache-invalidating by design; the changed-key histogram (`sync.ts:1382`) has not been run. Not proven invisible. |
| `modification_timestamp_only` | 1,218 | **Provenance-only and adds NO cache tags** (`sync.ts:610`). A physical write that invalidates nothing — the next clear writer fix. |

What can be said without overreach: **~20,026 of 28,351 row writes/day (71%) produce no typed or
search-projection delta.** That is field-level change, not proven waste — only the 1,218/day
provenance class is presently demonstrated as avoidable. The **8,116 ISR revalidations/day** cannot
be attributed to all three either: the provenance class contributes zero by design.

Systemic link: the hero-only R2 policy mirrors ~1 photo per third-party listing, so ~17.6k gallery
photos serve from Cotality through `/api/media/proxy`; their signed URLs rotate, so keeping
`media_url_original` fresh is load-bearing for image delivery. R2 storage was traded for DB write
churn, Neon wake time and Cotality egress.

Not attributable from durable data: `persistenceReasons` is computed in `runMediaSync` but never
persisted, so the largest write stream (21,638/day) cannot be split by cause without deriving it
from `rows_updated_changed`.

## Neon

Physical `pg_database_size` **576 MB** (2026-08-02: **555 MB** — about **+21 MB over 8 days**; no capacity danger against the 10 GB plan, growth continuing, billed trend unmeasured); branch logical 598 MiB. `listing_media` 217 MB (340,342 rows) ·
`listings` 178 MB (24,723) · `audit_events` 77 MB (101,899). Branch `cpu_used_sec` 199,868 /
`active_time_seconds` 799,072 (lifetime since 2025-12-09 — no per-day series available through the
tooling used). Two branches exist (see leftover branch above).

## Exact stop point

| | |
|---|---|
| `main` SHA | `2d121daaf6dbcd3d027d6d337901a18e43c03ad8` (PR #598 merge) |
| Production SHA / deployment | `2d121daa` · `dpl_Ey4rGtD26mij3ULsgJvrs88md6yy` · alias `mallan.nyc` · Release Truth `PROD_PROVEN` |
| PR #599 last CODE head | **`6ba2944ace3144eef50040c7c0e28c3aa9e62d77`** — the commit carrying the twelve-item correction pass. Documentation-only commits may sit on top of it (recording a SHA necessarily creates a later one). |
| PR #599 exact head at hand-off | Read it live: `gh pr view 599 --repo mallan67/mallan-nyc --json headRefOid`. Do not infer it from this file. |
| Branch | `fix/r2-policy-reevaluation-2026-08-10` |
| PR state | OPEN · not draft · MERGEABLE · 0 unresolved review threads · **UNMERGED** |

**Last completed layer:** the twelve-item contained correction pass on #599, plus three follow-on review corrections (unbudgeted sweep, accounting-before-gate, false budget-exhaustion) — domain-audit
telemetry, cursor-failure observability, stale-claim removal, provider-scoped URL equality, the
media-side candidate join, executable evidence SQL, cost re-classification, storage comparison,
`AGENTS.md` runtime model, and this handoff.

**Current layer:** none in flight. #599 is at the merge-authorization boundary.

**Next immediate action (needs Maya):** authorize the merge of #599. Everything after it is gated
on that: live R2 re-admission verification, backlog/control-plane revalidation, durable
preflight-reason telemetry, the Neon skip proof, the `modification_timestamp_only` writer fix,
`raw_data_only` attribution, the locator-refresh architecture, exact server HTTP 308, Mallan local
search/sitemap visibility, storage/churn remeasurement, and a final fresh audit.

**Held mutations — none executed:** merge #599 · OPS-026 backfill · R2 orphan cleanup · Neon branch
deletion · any migration · any Production env change · manual R2 mutation · the Mallan-exclusive
search/sitemap gate decision.

## Remaining issues, carried forward

| issue | state |
|---|---|
| Neon CPU savings | **NOT PROVEN.** 144/144 preflights ran One Cycle — zero skips. The reason was **not captured this session** (Vercel MCP token expired); last captured reason is `external_state_unavailable` (2026-08-02). |
| Locator-refresh churn | 14,995 writes/day. **Necessary under the current delivery architecture** — the signed URL of an unmirrored photo must stay fresh. Architecture change, not a suppression rule. |
| `raw_data_only` churn | 3,813 writes/day. **Attribution required** — `raw_data` feeds public behaviour and the changed-key histogram has not been run. Not proven waste. |
| `modification_timestamp_only` churn | 1,218 writes/day. **Provenance-only, invalidates no cache** — the clearest avoidable physical write and the next writer fix. |
| Canonical redirects | Served as HTTP 200 + client-side RSC redirect, not 308 (ISR). Mitigated by `noindex, follow` + canonical. Pre-existing. |
| Mallan local search/sitemap visibility | 0 of 8,692 sitemap listing URLs are `SL-`/`RL-`; both gates require `idx_display_yn = true`. Needs a compliance + launch decision. |
| Storage | 555 MB (08-02) -> 576 MB (08-10), ~+21 MB/8 days. No capacity danger; growth continuing; billed trend unmeasured. |
| Test flakiness | Three different cold-start/P1001 retry suites each flaked once across five full runs, all green in isolation and on rerun. Pre-existing timing sensitivity under parallel load. |
