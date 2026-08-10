# Production evidence record — R2 policy, backlog, One Cycle, churn, storage, summary drift

Durable record of every Production number quoted in PR #599 and in the 2026-08-10 system-closure
run, with the read-only SQL that produced it.

**All statements below are `SELECT`-only. Nothing here mutated Production.**

| | |
|---|---|
| Captured | **2026-08-10**, 05:20–10:00 UTC |
| Neon project | `hidden-mountain-87248164` ("neon-green-school") |
| Endpoint / branch | `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`) |
| Access path | Neon MCP `run_sql`, read-only |
| Production application SHA | `2d121daaf6dbcd3d027d6d337901a18e43c03ad8` (PR #598 merge) |
| Production deployment | `dpl_Ey4rGtD26mij3ULsgJvrs88md6yy` · alias `mallan.nyc` · Release Truth `PROD_PROVEN` |

**Privacy.** Only aggregate counts and boundary timestamps are recorded. This document contains no
address, listing URL, MediaKey, R2 key, media URL, agent identity or any other row-level value.

> **Revision (same day).** The first version derived hero/photo truth from
> `status='active' AND media_type='Photo'`. That is not the production rule — `filterActivePhotoRows`
> delegates to `classifyMediaItem`, which weighs MediaCategory, MediaClassification and the Trestle
> `DOCUMENT-*` URL shape first. Every population below is recomputed with a verified equivalent of
> the real classifier, and the due-population now applies the FULL policy filter
> (`buildR2PolicyReevaluationWhere` including `buildR2MirrorPolicyMediaWhere`). Superseded figures
> are shown alongside the corrected ones rather than deleted.

---

## 0. Classifier equivalence (run before any population was quoted)

```sql
-- canonical predicate, applied to every listing_media row
CASE
  WHEN lower(coalesce(media_category, media_type,'')) IN ('floorplan','floor plan')
    OR lower(coalesce(media_category, media_type,'')) LIKE '%floor plan%'
    OR lower(coalesce(media_category, media_type,'')) LIKE '%floor_plan%'
    OR lower(coalesce(media_classification,'')) = 'document'
    OR lower(coalesce(media_url_original,'')) ~ '/floorplans?/'
    OR lower(coalesce(media_url_original,'')) ~ 'floor[[:space:]_-]?plans?'
    OR lower(coalesce(media_url_original,'')) ~ '\.pdf(\?|$)'
    OR lower(coalesce(media_url_original,'')) ~ '(^|[/_-])(site[[:space:]_-]?plans?|diagrams?)([/_.-]|$)'
    OR lower(coalesce(media_url_original,'')) ~* '/media/property/document-(gif|jpeg|png|pdf)/' THEN false
  WHEN lower(coalesce(media_category, media_type,'')) = 'video'
    OR lower(coalesce(media_category, media_type,'')) LIKE '%video%'
    OR lower(coalesce(media_url_original,'')) ~ '\.(mp4|mov|webm)(\?|$)' THEN false
  WHEN lower(coalesce(media_category, media_type,'')) IN ('virtualtour','virtual tour') THEN false
  WHEN lower(coalesce(media_category, media_type,'')) IN ('photo','image','') THEN true
  ELSE false END
```

```
canonical active photos        286457
naive media_type='Photo'       286457
typed Photo but not photo           0
photo but typed otherwise           0
```

The two agree **exactly** on today's data. The hero-parity code defect corrected in PR #599 is
therefore **latent — zero materialized instances in Production right now.** It is still a real
defect: the moment a floor plan arrives with a missing MediaCategory (the documented Trestle
behaviour), the mirror and the public card would disagree.

Two bounded divergences, stated: the classifier's `ShortDescription`/caption branch is inert at this
call site (only category, classification, type and URL are passed), and `unwrapProxyUrl` is a no-op
on stored Trestle locators, which are never proxied at rest.

## 1. Policy-parked population

```sql
-- ranked over CANONICAL active photos, joined to listings, with the full
-- buildR2MirrorPolicyMediaWhere admissibility expression
```

| metric | first version (naive) | **corrected (canonical + full policy filter)** |
|---|---|---|
| Parked active photos | 20,195 | **20,193** |
| — legacy (`r2_attempts = 9`) | 20,094 | **20,062** |
| — explicit column | 101 | **131** |
| Distinct listings | 1,721 | **1,722** |
| **Stranded heroes** (current hero, unmirrored, parked) | 43 | **43 — unchanged** |
| Mallan-owned rows parked | 0 | **0** |
| **Due now** (exact `buildR2PolicyReevaluationWhere`) | 5,331 | **4,462** |
| Eventual parkable non-hero | 23,919 | **17,568** |

Why the last two moved: the first version omitted `buildR2MirrorPolicyMediaWhere()`. **869 parked
rows are no longer policy-admissible** (their listing left the displayable/active set), so they are
correctly not due, and the eventual steady-state population is ~17.6k rather than ~24k. The
activation burst and the steady-state write estimate in PR #599 were revised accordingly.

Encoding-cutover boundary (unchanged): legacy writer's last stamp `2026-08-10T00:50:36Z`, explicit
column's first `2026-08-10T01:31:14Z`. Legacy rows with a null `r2_last_attempt_at`: **0**, so the
legacy branch has a usable age clock.

## 2. `backlog_remaining` and One Cycle

From the durable run telemetry the cron writes:

```sql
SELECT action, count(*) AS n,
       count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS last_24h
FROM audit_events WHERE created_at >= now() - interval '3 days'
  AND (action ILIKE '%media_sync%' OR action ILIKE '%one_cycle%') GROUP BY action;

SELECT count(*) AS runs_24h,
       round(sum((changes->>'duration_ms')::numeric)/1000.0) AS total_seconds,
       round(avg((changes->>'duration_ms')::numeric)/1000.0,1) AS avg_seconds,
       round(max((changes->>'duration_ms')::numeric)/1000.0,1) AS max_seconds,
       round(min((changes->>'duration_ms')::numeric)/1000.0,1) AS min_seconds
FROM audit_events WHERE action='one_cycle_run' AND created_at >= now() - interval '24 hours';
```

```
one_cycle_run / media_sync_cron / one_cycle_started : 144 each in 24h
duration: total 2758 s · avg 19.2 s · max 57.3 s · min 1.7 s
outcomes: ok 143 · partial 1 · members_failed 0 · members_timed_out 0
backlog_remaining: 0 in the sampled runs, max 57 over 24h
overlap_prevented 0 · time_budget_exhausted 0 · r2_failure_budget_exhausted false
```

**The claim recorded here is narrow:** the 10-minute preflight fires 144×/day and **144 One Cycle
runs are recorded**, so no firing was skipped in this window. That is a cadence observation from
durable DB telemetry.

**Why no skip occurred is NOT asserted here.** `skip_neon`, `neon_touched` and
`external_state_unavailable` are not persisted to `audit_events`, and the Vercel MCP token expired
during this session, so preflight reason telemetry was **not captured**. The last captured reason is
`external_state_unavailable` in the 2026-08-02 handoff; whether that is still the current reason is
**unverified**.

## 3. Write churn by stream (24h)

```sql
-- summed from audit_events -> changes->'members' -> summary->'write_paths'
```

| stream | checked | written | suppressed |
|---|---|---|---|
| `listing_media` | 80,718 | **21,638** (+622 inserts) | 59,319 |
| `listings` | 6,122 | **5,151** | 947 |
| summaries | 4,431 | **1,511** | 2,920 |
| projections | — | **51** | — |
| **total row writes/day** | | **≈ 28,351** | |

Attribution:

```
listing_media  rows_updated 21638 · rows_updated_changed 6643
               => locator-refresh only            14995
listings       modification_timestamp_only         1218
               raw_data_only                       3813
               status 53 · price 23 · display_permissions 10
               attribution 4 · address 1 · media_identity 0 · other 91
ISR            pages_revalidated                   8116
```

**≈ 20,026 of 28,351 row writes/day (71%) change nothing a user or the search projection can see**
(14,995 locator-refresh + 3,813 `raw_data_only` + 1,218 timestamp-only), and they drove **8,116 ISR
revalidations/day** — about 1.6 revalidations per materially-changed listing.

Systemic link: the hero-only R2 policy mirrors ~1 photo per third-party listing, so ~17.6k gallery
photos serve from Cotality through `/api/media/proxy`. Their signed URLs rotate, so keeping
`media_url_original` fresh is load-bearing for image delivery. R2 storage was traded for DB write
churn, Neon wake time and Cotality egress.

**Not attributable from durable data:** `persistenceReasons` (including
`refresh_while_<deliveryState>`) is computed in `runMediaSync` but never persisted, so the largest
write stream in the system cannot be split by cause without deriving it from `rows_updated_changed`.

## 4. R2 activity (24h)

```
r2_uploaded 37 · r2_reused 0 · r2_failed 1
mirror_rejected_policy 488 · mirror_rejected_policy_parked 488
rows_tombstoned 292 · summary_writes 1511 (2920 suppressed)
```

37 new R2 objects/day against 340,342 media rows — consistent with hero-only admission and a
converged backlog.

## 5. Neon storage and branches

```sql
SELECT pg_size_pretty(pg_database_size(current_database())),
       pg_size_pretty(pg_total_relation_size('listing_media')),
       pg_size_pretty(pg_total_relation_size('listings')),
       pg_size_pretty(pg_total_relation_size('audit_events'));
```

```
physical pg_database_size        576 MB
branch logical_size              627,367,936 B (598 MiB)
listing_media  217 MB (340,342 rows)
listings       178 MB (24,723 rows)
audit_events    77 MB (101,899 rows)
branch cpu_used_sec 199,868 · active_time_seconds 799,072   (LIFETIME since 2025-12-09)
```

**No historical size series is available** through the tooling used here — `describe_project`
reports lifetime totals and a current size, not a trend, and billable/synthetic storage is not
exposed. A storage trend therefore remains **unmeasured**, and no trend claim is made.

**Branch count: 2.** `main` (`br-crimson-frog-adr7g9gt`) plus a leftover
`preview-pr597-commit11` (`br-old-dust-ad3idcf6`), created 2026-08-08, logical 36 MiB, state
`ready`, last updated 2026-08-10 05:17Z. It is the branch-scoped DB used by the #597/#598 previews.

## 6. Summary drift (canonical classifier, all four summary fields)

```
photo-bearing listings examined            20649
stale primary_photo_r2_key                  4879
stale photo_count                             42
stale photos_change_timestamp                 13
stale primary_photo_url  byte-exact           12
stale primary_photo_url  provider-identity    12   (identical -> rotation is not inflating it)
TOTAL exact selector                        4894
   of which Mallan-owned                        4
   of which on a live listing                2573
```

Superseded first-version figure: 4,911 (naive classifier, `photos_change_timestamp` omitted).

**New drift check (canonical):** heroes touched since the 01:35Z #597 deploy **78**, of those
mirrored **62**, of those with a correct summary **62/62**; stale listings whose hero was touched
after the deploy **0**; media rows mirrored in the window **490** (non-vacuity denominator).
**NEW DRIFT = STOPPED.** Tracked as **OPS-026**.

## 7. Expiration-ownership exposure

```
total_listings 24723 · with_agent_id 41 · third_party_with_agent_id 34
with_expiration 0 · expiration_30d_notified=true 0 · expiration_7d_notified=true 0
```

34 third-party rows carry `agent_id`, confirming the association-is-not-ownership premise. No
listing carries an `expiration_date`, so the cron has never had a candidate and **historical
contamination is zero — no cleanup required.** The PR #598 fix is preventive.

## 8. Reproducing this record

Every statement above is a `SELECT`. Re-running them will produce drifted counts — the parked
population grows until the historical third-party gallery is fully parked, and the sweep will reduce
the stranded-hero count once #599 deploys. That drift is expected and is the reason this record is
dated and versioned rather than overwritten.
