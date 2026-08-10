# Production evidence record — R2 policy exclusions, backlog, One Cycle, summary drift

Durable record of every Production number quoted in PR #599 and in the
2026-08-10 system-closure run, with the exact read-only SQL that produced it.

**All statements below are `SELECT`-only. Nothing here mutated Production.**

| | |
|---|---|
| Captured | **2026-08-10**, 05:20–06:30 UTC |
| Neon project | `hidden-mountain-87248164` ("neon-green-school") |
| Endpoint / branch | `ep-cold-waterfall-adno3ao2` · branch `main` (`br-crimson-frog-adr7g9gt`) |
| Access path | Neon MCP `run_sql`, read-only |
| Production application SHA | `2d121daaf6dbcd3d027d6d337901a18e43c03ad8` (PR #598 merge) |
| Production deployment | `dpl_Ey4rGtD26mij3ULsgJvrs88md6yy` · alias `mallan.nyc` · Release Truth `PROD_PROVEN` |

**Privacy.** Only aggregate counts and boundary timestamps are recorded. No
address, listing URL, MediaKey, R2 key, media URL, agent identity or any other
row-level value appears in this document.

---

## 1. Policy-parked population — 20,195 / 20,094 legacy / 101 explicit

```sql
SELECT
  count(*) FILTER (WHERE r2_policy_excluded_at IS NOT NULL) AS policy_excluded_total,
  count(*) FILTER (WHERE r2_policy_excluded_at IS NOT NULL AND status='active') AS policy_excluded_active,
  count(*) FILTER (WHERE r2_attempts = 9)  AS legacy_sentinel_9,
  count(*) FILTER (WHERE r2_attempts > 9)  AS above_9,
  count(*) FILTER (WHERE r2_attempts = 8)  AS exactly_8,
  count(*)                                 AS total_media
FROM listing_media;
```

```
policy_excluded_total=101   policy_excluded_active=101
legacy_sentinel_9=21969     above_9=80    exactly_8=290
total_media=340309
```

Restricted to the population the policy actually governs — active Photos:

```sql
WITH ranked AS (
  SELECT lm.id, lm.listing_id, lm.r2_key, lm.r2_attempts, lm.r2_policy_excluded_at,
         ROW_NUMBER() OVER (PARTITION BY lm.listing_id
           ORDER BY (lm.preferred_photo_yn AND lm.media_key LIKE 'crm:%') DESC,
                    lm.preferred_photo_yn DESC, lm."order" ASC, lm.id ASC) AS hero_rank
  FROM listing_media lm WHERE lm.status='active' AND lm.media_type='Photo'),
parked AS (
  SELECT r.*, CASE WHEN r.r2_policy_excluded_at IS NOT NULL THEN 'new_column'
                   WHEN r.r2_attempts = 9 THEN 'legacy_sentinel_9' END AS park_class
  FROM ranked r WHERE r.r2_policy_excluded_at IS NOT NULL OR r.r2_attempts = 9)
SELECT park_class, count(*) AS parked_active_photos,
       count(*) FILTER (WHERE hero_rank = 1)                  AS is_current_hero,
       count(*) FILTER (WHERE hero_rank = 1 AND r2_key IS NULL) AS hero_and_unmirrored,
       count(*) FILTER (WHERE r2_key IS NOT NULL)             AS already_has_r2_key
FROM parked GROUP BY park_class ORDER BY park_class;
```

```
legacy_sentinel_9  parked=20094  is_current_hero=43  hero_and_unmirrored=43  already_has_r2_key=0
new_column         parked=  101  is_current_hero= 0  hero_and_unmirrored= 0  already_has_r2_key=0
```

**20,195 parked active Photos. 43 stranded heroes, all in the legacy class.**

The `21,969` exact-9 total minus the `20,094` active-Photo subset is non-active
or non-Photo rows, which the policy selector never touches.

## 2. Ownership, spread and clock boundaries

```sql
-- (ranked CTE as above)
SELECT count(*) AS parked_total,
  count(*) FILTER (WHERE mallan_owned)               AS mallan_owned_parked,
  count(*) FILTER (WHERE hero_rank=1)                AS current_hero,
  count(*) FILTER (WHERE r2_attempts=9 AND r2_last_attempt_at IS NULL) AS legacy9_no_attempt_ts,
  min(r2_last_attempt_at) AS legacy9_oldest_ts, max(r2_last_attempt_at) AS legacy9_newest_ts,
  min(r2_policy_excluded_at) AS newcol_oldest, max(r2_policy_excluded_at) AS newcol_newest,
  count(DISTINCT listing_id) AS distinct_listings
FROM p;   -- p = ranked JOIN listings, parked under either encoding
```

```
parked_total=20195   mallan_owned_parked=0   current_hero=43   distinct_listings=1721
legacy9_no_attempt_ts=0
legacy9_oldest_ts=2026-05-13T03:15:50Z   legacy9_newest_ts=2026-08-10T00:50:36Z
newcol_oldest=2026-08-10T01:31:14Z       newcol_newest=2026-08-10T04:40:56Z
```

Two facts the design depends on: **zero Mallan-owned rows are parked** (the
policy is correctly third-party-only), and **every legacy row has a non-null
`r2_last_attempt_at`**, so the legacy branch has a usable age clock. The
encoding cutover is visible — the legacy writer's last stamp (00:50Z) precedes
the explicit column's first (01:31Z), i.e. the #597 Production deploy.

## 3. Due at activation — 5,331 (not 20,195)

```sql
SELECT
  count(*) FILTER (WHERE r2_policy_excluded_at IS NULL AND r2_attempts = 9
      AND (r2_last_attempt_at IS NULL OR r2_last_attempt_at < now() - interval '14 days')) AS legacy_due_now,
  count(*) FILTER (WHERE r2_policy_excluded_at IS NULL AND r2_attempts = 9
      AND r2_last_attempt_at >= now() - interval '14 days')                                AS legacy_not_yet_due,
  count(*) FILTER (WHERE r2_policy_excluded_at IS NOT NULL
      AND r2_policy_excluded_at < now() - interval '14 days')                              AS newcol_due_now,
  count(DISTINCT listing_id) FILTER (WHERE r2_policy_excluded_at IS NOT NULL OR r2_attempts = 9)
                                                                                           AS distinct_parked_listings
FROM listing_media
WHERE status='active' AND media_key IS NOT NULL AND media_url_original IS NOT NULL
  AND (r2_key IS NULL OR media_url_cached IS NULL);
```

```
legacy_due_now=5331   legacy_not_yet_due=14766   newcol_due_now=0
distinct_parked_listings=1723
```

## 4. Eventual parked population — ~23,919

```sql
-- ranked CTE over active Photos, joined to listings, third-party only
SELECT count(*) FILTER (WHERE hero_rank > 1 AND (r2_key IS NULL OR media_url_cached IS NULL)
                          AND media_key IS NOT NULL AND media_url_original IS NOT NULL) AS eventual_parkable_nonhero,
       count(*) FILTER (WHERE hero_rank = 1 AND (r2_key IS NULL OR media_url_cached IS NULL)) AS heroes_unmirrored,
       count(*) FILTER (WHERE hero_rank = 1 AND r2_key IS NOT NULL)                           AS heroes_mirrored
FROM ranked r JOIN listings l ON l.listing_id = r.listing_id
WHERE NOT (l.listing_id LIKE 'SL-%' OR l.listing_id LIKE 'RL-%' OR l.rls_eligible = false);
```

```
eventual_parkable_nonhero=23919   heroes_unmirrored=330   heroes_mirrored=20315
```

## 5. `backlog_remaining` = 0

Not a query — read from the durable run telemetry the cron itself writes:

```sql
SELECT created_at, changes FROM audit_events
WHERE action = 'one_cycle_run' ORDER BY created_at DESC LIMIT 3;
```

The three most recent `media-sync` member summaries each report
`backlog_remaining: 0`, `overlap_prevented: 0`,
`query_path_classification: "adaptive"`, `time_budget_exhausted: false`. The
#597 shared-universe fix holds: there is no phantom backlog.

## 6. One Cycle cadence — 144/day, no skipping

```sql
SELECT action, count(*) AS n, max(created_at) AS latest,
       count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS last_24h
FROM audit_events
WHERE created_at >= now() - interval '3 days'
  AND (action ILIKE '%media_sync%' OR action ILIKE '%one_cycle%' OR action ILIKE '%cycle%')
GROUP BY action ORDER BY n DESC;
```

```
media_sync_cron     n=432  last_24h=144
one_cycle_run       n=432  last_24h=144
one_cycle_started   n=432  last_24h=144
```

```sql
SELECT count(*) FILTER (WHERE changes->>'outcome'='success') AS ok,
       count(*) FILTER (WHERE changes->>'outcome'='partial') AS partial,
       count(*) FILTER (WHERE (changes->>'members_failed')::int > 0)   AS members_failed_gt0,
       count(*) FILTER (WHERE (changes->>'members_timed_out')::int > 0) AS timed_out_gt0,
       count(*) AS total
FROM audit_events WHERE action='one_cycle_run' AND created_at >= now() - interval '24 hours';
```

```
ok=143  partial=1  members_failed_gt0=0  timed_out_gt0=0  total=144
```

**The claim being recorded is narrow and exact:** the 10-minute preflight fires
144 times/day and **144 One Cycle runs are recorded**, so no firing was skipped
in this window. That is a *cadence* observation from durable DB telemetry. It is
**not** a measurement of `skip_neon` / `neon_touched` / `external_state_unavailable`,
which are not persisted to `audit_events` — see the CPU-savings caveat in the
run report. The single `partial` was one R2 mirror failure on a parked-recovery
attempt (`r2_failed: 1`), not an orchestration failure.

## 7. New stale-summary drift — 54/54 correct, so STOPPED

Boundary: `2026-08-10 01:35Z`, the #597 Production deploy.

```sql
WITH hero AS (
  SELECT DISTINCT ON (lm.listing_id) lm.listing_id, lm.r2_key, lm.media_url_original,
         lm.updated_at AS hero_updated
  FROM listing_media lm WHERE lm.status='active' AND lm.media_type='Photo'
  ORDER BY lm.listing_id, (lm.preferred_photo_yn AND lm.media_key LIKE 'crm:%') DESC,
           lm.preferred_photo_yn DESC, lm."order" ASC, lm.id ASC)
SELECT
  count(*) FILTER (WHERE h.hero_updated >= timestamp '2026-08-10 01:35:00') AS heroes_touched_since_597,
  count(*) FILTER (WHERE h.hero_updated >= timestamp '2026-08-10 01:35:00' AND h.r2_key IS NOT NULL)
                                                                            AS heroes_mirrored_since_597,
  count(*) FILTER (WHERE h.hero_updated >= timestamp '2026-08-10 01:35:00' AND h.r2_key IS NOT NULL
                     AND l.primary_photo_r2_key IS NOT DISTINCT FROM h.r2_key) AS of_those_summary_correct,
  (SELECT count(*) FROM listing_media
    WHERE r2_key IS NOT NULL AND updated_at >= timestamp '2026-08-10 01:35:00') AS any_media_mirrored_since_597
FROM hero h JOIN listings l ON l.listing_id = h.listing_id;
```

```
heroes_touched_since_597=56  heroes_mirrored_since_597=54
of_those_summary_correct=54  any_media_mirrored_since_597=418
```

And, from the stale side, `hero_touched_since_597 = 0` with
`newest_hero_touch = 2026-08-09T22:20:47Z` — every stale row predates the fix.
The 418 denominator is what makes this non-vacuous.

**Historical stale population: 4,911** (4,869 `primary_photo_r2_key` only, 12
`photo_count` only, 30 multi-field, 0 `primary_photo_url` only; 4 Mallan-owned;
2,573 on live listings). Full selector and reconciliation plan:
`docs/operations/stale-listing-media-summary-reconciliation-2026-08-10.md`.

## 8. Expiration-ownership exposure — latent, contamination zero

```sql
SELECT count(*) AS total_listings,
  count(*) FILTER (WHERE agent_id IS NOT NULL) AS with_agent_id,
  count(*) FILTER (WHERE agent_id IS NOT NULL
    AND NOT (listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%' OR rls_eligible=false)) AS third_party_with_agent_id,
  count(*) FILTER (WHERE expiration_date IS NOT NULL)      AS with_expiration,
  count(*) FILTER (WHERE expiration_30d_notified = true)   AS notified_30d_true,
  count(*) FILTER (WHERE expiration_7d_notified  = true)   AS notified_7d_true
FROM listings;
```

```
total_listings=24723  with_agent_id=41  third_party_with_agent_id=34
with_expiration=0     notified_30d_true=0  notified_7d_true=0
```

34 third-party rows do carry `agent_id`, which confirms the
association-is-not-ownership premise is real. No listing carries an
`expiration_date` yet, so the cron has never had a candidate and **historical
contamination is zero — no cleanup required.** The #598 fix is preventive.

## 9. Reproducing this record

Every statement above is a `SELECT`. Re-running them against the canonical
project will produce drifted counts (the parked population grows until the
historical third-party gallery is fully parked, and the sweep will reduce the
stranded-hero count once #599 deploys) — that drift is expected and is the point
of dating this record.
