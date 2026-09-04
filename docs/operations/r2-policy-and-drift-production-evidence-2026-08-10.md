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
WITH cls AS (
  SELECT lm.*,
    CASE
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('floorplan','floor plan')
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%floor plan%'
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%floor_plan%'
        OR lower(coalesce(lm.media_classification,'')) = 'document'
        OR lower(coalesce(lm.media_url_original,'')) ~ '/floorplans?/'
        OR lower(coalesce(lm.media_url_original,'')) ~ 'floor[[:space:]_-]?plans?'
        OR lower(coalesce(lm.media_url_original,'')) ~ '\.pdf(\?|$)'
        OR lower(coalesce(lm.media_url_original,'')) ~ '(^|[/_-])(site[[:space:]_-]?plans?|diagrams?)([/_.-]|$)'
        OR lower(coalesce(lm.media_url_original,'')) ~* '/media/property/document-(gif|jpeg|png|pdf)/'
        THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) = 'video'
        OR lower(coalesce(lm.media_category, lm.media_type,'')) LIKE '%video%'
        OR lower(coalesce(lm.media_url_original,'')) ~ '\.(mp4|mov|webm)(\?|$)' THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('virtualtour','virtual tour')
        THEN false
      WHEN lower(coalesce(lm.media_category, lm.media_type,'')) IN ('photo','image','') THEN true
      ELSE false END AS is_photo
  FROM listing_media lm),
ranked AS (
  SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.listing_id
    ORDER BY (c.preferred_photo_yn AND c.media_key LIKE 'crm:%') DESC,
             c.preferred_photo_yn DESC, c."order" ASC, c.id ASC) AS hero_rank
  FROM cls c WHERE c.status='active' AND c.is_photo),
pol AS (
  SELECT r.*,
    ( (r.media_type IN ('Photo','FloorPlan')
        AND (l.listing_id LIKE 'SL-%' OR l.listing_id LIKE 'RL-%' OR l.rls_eligible = false))
      OR (r.media_type IN ('Photo')
        AND l.idx_display_yn = true AND l.owner_opt_out = false
        AND l.participant_only = false AND l.internet_entire_listing_display_yn = true
        AND l.status IN ('Active','ActiveUnderContract','ComingSoon')
        AND (l.rls_eligible = false OR l.listing_id LIKE 'SL-%' OR l.listing_id LIKE 'RL-%'
             OR l.list_office_mls_id IS NULL OR l.list_office_mls_id NOT IN ('7041')))
    ) AS policy_admissible
  FROM ranked r JOIN listings l ON l.listing_id = r.listing_id)
SELECT
  count(*) FILTER (WHERE r2_policy_excluded_at IS NOT NULL OR r2_attempts = 9) AS parked_total,
  count(*) FILTER (WHERE r2_attempts = 9 AND r2_policy_excluded_at IS NULL)    AS parked_legacy,
  count(*) FILTER (WHERE r2_policy_excluded_at IS NOT NULL)                    AS parked_newcol,
  count(*) FILTER (WHERE (r2_policy_excluded_at IS NOT NULL OR r2_attempts=9)
                     AND hero_rank=1 AND r2_key IS NULL)                       AS stranded_heroes,
  count(*) FILTER (WHERE (r2_policy_excluded_at IS NOT NULL OR r2_attempts=9)
      AND policy_admissible AND media_key IS NOT NULL AND media_url_original IS NOT NULL
      AND (r2_key IS NULL OR media_url_cached IS NULL)
      AND ( (r2_policy_excluded_at IS NOT NULL
             AND r2_policy_excluded_at < now() - interval '14 days')
         OR (r2_policy_excluded_at IS NULL AND r2_attempts = 9
             AND (r2_last_attempt_at IS NULL
                  OR r2_last_attempt_at < now() - interval '14 days')) ))      AS due_now_exact,
  count(*) FILTER (WHERE hero_rank > 1 AND policy_admissible
      AND (r2_key IS NULL OR media_url_cached IS NULL)
      AND media_key IS NOT NULL AND media_url_original IS NOT NULL)            AS eventual_parkable,
  count(DISTINCT listing_id) FILTER (WHERE r2_policy_excluded_at IS NOT NULL
                                        OR r2_attempts=9)                      AS parked_listings
FROM pol;
```

**Runnable as printed.** The §0 classifier is inlined above rather than referenced, so this query
executes without manual reconstruction. §3's write-stream queries read `audit_events` and do not
need the classifier; §6's summary-drift query inlines it as well.

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
-- listings stream + change-reason attribution
WITH ms AS (
  SELECT changes->'members' AS members FROM audit_events
  WHERE action='one_cycle_run' AND created_at >= now() - interval '24 hours'),
r AS (SELECT m->'summary'->'write_paths'->'listing_change_reasons' AS lcr,
             m->'summary'->'write_paths'->'listings'      AS l,
             m->'summary'->'write_paths'->'batch_media'   AS bm,
             m->'summary'->'write_paths'->'projections'   AS pj,
             m->'summary'->'write_paths'->'revalidation'  AS rv
      FROM ms, LATERAL jsonb_array_elements(members) m WHERE m->>'member'='idx-sync')
SELECT sum((l->>'rows_checked')::int)              AS listings_checked,
       sum((l->>'rows_updated')::int)              AS listings_written,
       sum((l->>'rows_suppressed_unchanged')::int) AS listings_suppressed,
       sum((bm->>'rows_updated')::int)             AS batch_media_written,
       sum((pj->>'rows_updated')::int)             AS projection_writes,
       sum((rv->>'pages_revalidated')::int)        AS pages_revalidated,
       sum((lcr->>'modification_timestamp_only')::int) AS ts_only,
       sum((lcr->>'raw_data_only')::int)           AS raw_data_only,
       sum((lcr->>'status')::int)                  AS status,
       sum((lcr->>'price')::int)                   AS price,
       sum((lcr->>'display_permissions')::int)     AS display_permissions,
       sum((lcr->>'attribution')::int)             AS attribution,
       sum((lcr->>'address')::int)                 AS address,
       sum((lcr->>'media_identity')::int)          AS media_identity,
       sum((lcr->>'other')::int)                   AS other
FROM r;

-- media stream + locator-refresh attribution + R2 totals
WITH ms AS (
  SELECT changes->'members' AS members FROM audit_events
  WHERE action='one_cycle_run' AND created_at >= now() - interval '24 hours'),
m AS (SELECT x->'summary' AS s FROM ms, LATERAL jsonb_array_elements(members) x
      WHERE x->>'member'='media-sync')
SELECT sum((s->>'rows_checked')::int)           AS media_checked,
       sum((s->>'rows_updated')::int)           AS media_written,
       sum((s->>'rows_updated_changed')::int)   AS media_materially_changed,
       sum((s->>'rows_updated')::int) - sum((s->>'rows_updated_changed')::int)
                                               AS locator_refresh_only,
       sum((s->>'rows_inserted')::int)          AS media_inserted,
       sum((s->>'rows_skipped_unchanged')::int) AS media_suppressed,
       sum((s->>'r2_uploaded')::int)            AS r2_uploaded,
       sum((s->>'r2_reused')::int)              AS r2_reused,
       sum((s->>'r2_failed')::int)              AS r2_failed,
       sum((s->>'mirror_rejected_policy_parked')::int) AS policy_parked,
       sum((s->>'rows_tombstoned')::int)        AS tombstoned,
       sum((s->'summary_writes'->>'rows_updated')::int) AS summary_writes,
       sum((s->'summary_writes'->>'rows_suppressed_unchanged')::int) AS summary_suppressed,
       max((s->>'backlog_remaining')::int)      AS max_backlog_remaining,
       sum((s->>'overlap_prevented')::int)      AS overlap_prevented
FROM m;
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

### Classification — the three classes are NOT equivalent

An earlier version of this document summed all three and called them "writes that change nothing a
user can see". That was wrong: it collapsed one necessary class, one unproven class and one genuinely
avoidable class into a single "71% waste" figure. Corrected:

| class | volume/day | verdict |
|---|---|---|
| **Locator refresh** | 14,995 | **NECESSARY under the current delivery architecture.** An unmirrored photo is served from `media_url_original`; that signed URL rotates, so refreshing it prevents a broken image on ~17.6k gallery photos. Expensive DB churn, but not a useless write. Removing it requires an architecture change, not a suppression rule. |
| **`raw_data_only`** | 3,813 | **ATTRIBUTION REQUIRED — not proven invisible.** `raw_data` participates in public behaviour (`lib/listings/terminal-since.ts` reads `raw_data.CloseDate` / `OffMarketDate` / `ExpirationDate`), and it is deliberately treated as cache-invalidating. The codebase itself holds the question open: `lib/idx/sync.ts:1382` emits a changed-key histogram built to answer "which `raw_data` KEYS change on `raw_data_only` writes?". Until that histogram plus a consumer trace exist, this class cannot be called waste. |
| **`modification_timestamp_only`** | 1,218 | **PROVENANCE-ONLY — the clearest avoidable physical write.** Already classified as such in code, and it adds **no cache tags** (`lib/idx/sync.ts:610`: "a provenance-only listing write adds NO tags — a change nobody can see must not expire any cache"). It performs a physical listing-row write and invalidates nothing. This is the next clear writer fix. |

What can be said without overreach: **~20,026 of 28,351 row writes/day (71%) produce no typed or
search-projection delta.** That is a statement about *field-level* change, not about waste — only
the 1,218/day provenance class is presently demonstrated as avoidable.

The **8,116 ISR revalidations/day** likewise cannot be attributed to all three: the provenance class
invalidates nothing by design, so it contributes zero of them.

Systemic link: the hero-only R2 policy mirrors ~1 photo per third-party listing, so ~17.6k gallery
photos serve from Cotality through `/api/media/proxy`. Their signed URLs rotate, so keeping
`media_url_original` fresh is load-bearing for image delivery. R2 storage was traded for DB write
churn, Neon wake time and Cotality egress — a real architectural trade, not an accident.

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

### Storage comparison — growth is continuing

A prior durable measurement **does** exist, and an earlier version of this document wrongly stated
that no historical point was available:

| date | physical `pg_database_size` | source |
|---|---|---|
| 2026-08-02 | **~555 MB** | `docs/operations/neon-cpu-storage-evidence-2026-08-02.md` (line 15) |
| 2026-08-10 | **~576 MB** | this record |
| change | **~+21 MB over 8 days** | ~2.6 MB/day at this sample |

Classification, stated separately so none is over-read:

- **Immediate capacity danger — NOT demonstrated.** 576 MB against a documented 10 GB plan limit.
- **Physical growth — CONTINUING.** Two points is a comparison, not a trend line; the direction is
  nonetheless up, and the churn measured in §3 is the obvious driver.
- **Billed / synthetic storage trend — UNMEASURED.** `describe_project` reports lifetime totals and
  a current logical size; billable size is not exposed through the MCP path used here. The last
  recorded billed figure (1,493 MB, 2026-07-02) was **not** re-measured today, so no billed trend is
  claimed.

**Branch count: 2.** `main` (`br-crimson-frog-adr7g9gt`) plus a leftover
`preview-pr597-commit11` (`br-old-dust-ad3idcf6`), created 2026-08-08, logical 36 MiB, state
`ready`, last updated 2026-08-10 05:17Z. It is the branch-scoped DB used by the #597/#598 previews.

## 6. Summary drift (canonical classifier, all four summary fields)

```
photo-bearing listings examined            20721
stale primary_photo_r2_key                  4832
stale photo_count                             42
stale photos_change_timestamp                 13
stale primary_photo_url  production rule       12
stale primary_photo_url  universal strip       12   (rejected rule, for comparison)
stale primary_photo_url  byte-exact            12   (for comparison)
listings the OLD prefilter would have missed     4
TOTAL exact selector (production URL rule)  4847
   of which Mallan-owned                        4
   of which on a live listing                2573
```

Superseded figures: **4,911** (r0 — naive classifier, `photos_change_timestamp` omitted) then
**4,894** (r1 — canonical classifier but a universal query-strip and an under-selecting prefilter).
Current **4,847** uses the production provider-scoped URL rule and a media-side candidate join.

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
