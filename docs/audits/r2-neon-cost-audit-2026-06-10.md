# R2 + Neon Cost Audit — 2026-06-10

**Question (Maya, verbatim):** "R2 should remain free and I keep paying for it, same Neon."

**Status:** READ-ONLY audit. No DB writes, no R2 operations, no settings/cron/code changes. SELECT-only SQL against the canonical production DB (`hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2`), with a fail-closed host guard that aborted unless `DATABASE_URL` pointed at `ep-cold-waterfall-adno3ao2`. The stale `morning-bread` project was NOT connected to. `rotate-db-keys` and all prunes were NOT run.

**Mandatory reading completed first:** `NEON.md`, `docs/architecture/NEON-COST-CONTROL-POLICY.md`, `docs/architecture/NEON-VERCEL-OWNERSHIP-MAP.md`.

**DO NOT COMMIT this file without Maya approval.**

---

## 0. TL;DR

| | Likely top cost driver | Free tier achievable? |
|---|---|---|
| **Neon** | The **Launch plan subscription itself ($19/mo)**, upgraded 2026-05-17 only to silence a false Vercel "branch limit" check — plus possible compute overage if the endpoint's compute size is configured above 0.25 CU (console check required). | **Not today** — DB is 1,086 MB vs the 500 MB Free storage cap. Achievable after the (Maya-gated) legacy-JSON-column drop + non-displayable archive + VACUUM FULL, which together address ~630 MB of JSON in `listings`. Compute (~130 CU-hr/mo estimated at 0.25 CU) would fit Free's 191.9 CU-hr. |
| **R2** | **Storage past the 10 GB free tier** — ~81.8K DB-referenced objects (est. 16–25 GB) and an unknown additional population of never-deleted orphans (nothing in the codebase ever deletes a production R2 object; the historical migrate path uploaded 128K+ photos). However, at R2's $0.015/GB-mo this is **cents, not dollars** (~$0.10–0.35/mo). If the Cloudflare bill is materially more than ~$1/mo, the charge is almost certainly **a subscription line item (Workers Paid $5/mo or a zone Pro plan), not R2 usage** — invoice check required. | **Possibly yes on ops, no on storage at current volume.** Ops are far inside free limits. Storage exceeds 10 GB and only shrinks via a (Maya-gated, HELD) R2 cleanup. |

---

## 1. Method + provenance

- Baseline: `npm run ops:health` (read-only; repo-sanctioned), run 2026-06-10T21:59Z.
- Custom SELECT-only queries: throwaway script at `%TEMP%\r2-neon-cost-audit-readonly.js` (outside the repo; not committed), executed with `node --env-file-if-exists=.env.local`. First statement of the script:
  ```js
  if (!url.includes("ep-cold-waterfall-adno3ao2")) { console.error("FAIL-CLOSED ..."); process.exit(2); }
  ```
  The guard passed, proving every query below ran against the canonical endpoint.
- Code evidence: `vercel.json`, `app/api/cron/db-keepalive/route.ts`, `lib/idx/media-sync.ts`, `lib/images/r2.ts`, `app/api/media/proxy/route.ts`, `docs/r2-setup.md`, `docs/incidents/2026-05-21-chronic-media-sync-root-cause.md`, `docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md` (CI3).

---

## 2. NEON

### 2.1 Plan and what is actually being paid

- **Plan: Launch — $19/mo + overage** (since 2026-05-17; NEON.md header + §2). Baselines: 10 GB storage, 300 CU-hr/mo compute, overage ~$0.16/CU-hr.
- Per `NEON-COST-CONTROL-POLICY.md` §1: *"The upgrade is not a permission to use Launch headroom as budget... the plan should be re-evaluated for downgrade to Free"* once the false Vercel branch-limit check is resolved. **The recurring $19/mo is the baseline Neon charge regardless of usage.**
- Budget target (Maya policy, same doc §2): Free-tier envelope — 500 MB storage / ~100 CU-hr / 10 branches.

### 2.2 Storage — live measurements

**Q1 — total DB size** (`SELECT pg_database_size(current_database())`):

```
bytes = 1,139,253,248  →  1,086 MB
```

That is **10.6% of the Launch 10 GB cap** but **217% of the 500 MB Free cap / budget target**. (History: 196 MB on 2026-04-28 post-slim-backfill → 961 MB on 2026-05-18 → 1,086 MB today. Still growing.)

**Q2 — top 15 relations by `pg_total_relation_size`:**

| relation | total | heap | indexes | TOAST |
|---|---|---|---|---|
| `listings` | **893 MB** | 189 MB | 26 MB | **677 MB** |
| `listing_search_projection` | 70 MB | 46 MB | 24 MB | 112 kB |
| `audit_events` | 51 MB | 45 MB | 5 MB | 744 kB |
| `listing_media` | 49 MB | 38 MB | 11 MB | 8 kB |
| `demand_signals` | 4.1 MB | | | |
| `geocode_cache` | 2.7 MB | | | |
| (9 more, all ≤ 568 kB) | | | | |

`listings` was 173 MB after the 2026-04-28 slim backfill, 871–892 MB during the media-backfill era — **it is 893 MB NOW**, i.e. the bloat never went away. 677 MB of it is TOAST = the JSON columns.

**Q3 — what's inside the `listings` JSON** (`sum(pg_column_size(col))` over 107,258 rows):

| column | size |
|---|---|
| `raw_data` | **257 MB** |
| `compliance` | **196 MB** |
| `features` | **99 MB** |
| `agent_info` | 38 MB |
| `address` | 34 MB |
| `media` (legacy) | 6 MB |
| **JSON total** | **≈ 630 MB** |

So the "legacy `listings.media`/`raw_data` JSON" question: `media` JSON is now nearly empty (6 MB — largely wiped by the RC2 `[]`-stomp era and never the big item anymore), but **`raw_data` + `compliance` + `features` alone are 552 MB**. The legacy-JSON drop plan (`memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`, NEON.md §8) estimated "~115 MB recoverable" — that figure is **badly stale; the real lever is now ~630 MB**, plus heap shrink from archiving the ~91K non-IDX-displayable rows (107,258 total listings vs 15,868 IDX-displayable per ops:health).

**Q4 — dead-tuple bloat (`pg_stat_user_tables`), top rows:**

| relation | live | dead | dead % | last autovacuum |
|---|---|---|---|---|
| `listing_search_projection` | 107,255 | 18,063 | 14.4% | 2026-06-05 |
| `listing_media` | 82,148 | 6,613 | 7.5% | 2026-06-09 |
| `listings` | 103,523 | 2,556 | 2.4% | 2026-06-10 |
| `leads` | 50 | 51 | 50.5% | never |
| `mfa_sessions` | 0 | 39 | 100% | never |

Autovacuum IS running on the big tables (CI3's "no VACUUM" refers to *manual* VACUUM — `manual VACUUM=0` per ops:health — and to the missing monthly VACUUM cron, fix option F in the incident doc). Dead tuples are NOT the storage problem today; **plain autovacuum never returns space to disk**. After the JSON drop, a one-time `VACUUM FULL listings` (Maya-gated DB op, 3–5 AM ET window per NEON.md §4) is what actually shrinks the file.

### 2.3 Branches

- Last `neon-branch-prune` run (2026-06-10 04:00 UTC): **examined=1, pruned=0, errors=0** → steady-state branch count ≈ 2 (main + ≤1 preview). Well inside both the 10-branch budget target and the 5000 Launch cap. **Branches are not a cost driver.**

### 2.4 Compute — the keepalive question, corrected

**Premise check:** the tasking assumed "*/15 keepalive ⇒ endpoint can NEVER suspend ⇒ ~744 h/mo*". That is **not correct** per NEON.md §2/§10: Neon suspends after **5 min idle**, and a 15-min ping interval lets the endpoint suspend between pings. The keepalive's documented job (changelog `93fb0cd9`) is preventing **multi-hour** idle (the 2026-03-26 cold-start outage), not 5-min suspends.

**But the full cron schedule is what matters.** From `vercel.json`: `idx-sync` at `*/10`, `media-sync` at `*/15`, `db-keepalive` at `*/15`, plus ~19 daily/weekly crons. Per-hour DB wake events at minutes **00, 10, 15, 20, 30, 40, 45, 50**. With a 5-min idle suspend and ~1 min activity per firing, the awake windows chain to roughly **(00–06) + (10–26) + (30–36) + (40–56) ≈ 44 min/hour ≈ 73% duty cycle, 24/7**:

- ≈ 533 active hours/month.
- At **0.25 CU** (Neon minimum): **≈ 133 CU-hr/mo** → inside the Launch 300 baseline (no overage; bill = flat $19) and inside Free's 191.9 CU-hr — but over the policy doc's ~100 CU-hr budget target.
- At **1 CU minimum** (if the endpoint was created larger, or autoscaling min was raised): **≈ 533 CU-hr/mo → ~233 CU-hr overage ≈ +$37/mo**. *(Assumption-labeled: we cannot see the compute-size config from SQL. This is THE console check that decides whether Maya is paying $19 or $50+.)*

**Is db-keepalive itself the burner? No — it is redundant.** Its fire times (:00/:15/:30/:45) are exactly `media-sync`'s fire times, and `idx-sync` at `*/10` wakes the DB more often than keepalive does. Disabling keepalive saves ~0 compute while removing the only wake-source that survives if both sync crons are ever paused. This matches CI3 (`docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md` A6): "**db-keepalive ineffective (15m vs 5m suspend)**" — ineffective at keeping the DB warm, and (per this audit) also irrelevant to compute burn. **The real compute lever is the `idx-sync */10` + `media-sync */15` cadence.** Loosening both to `*/30` would drop the duty cycle to roughly 20–25 min/hour (~2× compute reduction) at the price of staler IDX data (REBNY freshness rules constrain how far this can go — compliance read required before touching).

What depends on the wake cadence: cold-start latency for the first user request after an idle gap (~2–5 s, accepted trade-off per NEON.md Trap #3) — nothing else.

### 2.5 Other Neon projects (docs-only; NOT connected to)

Neon bills **per account/org**, so sibling projects share the paid plan:

- **`morning-bread-68708332`** ("mallandb", stale/do-not-serve, kept as PITR/rollback per ownership map §5, listed there as Free-tier-sized). It holds a **full stale copy of the production DB (~1 GB-class)**. If it lives in the same billed Neon org as `hidden-mountain`, its storage-GB-months are billable. **Flag for Maya's console review — do not delete; it is the designated rollback copy.**
- **`round-recipe-12208101`** ("neon-green-door") — not connected to mallan-nyc; unknown size. Console review only. Leave alone.

### 2.6 What we CANNOT see without the Neon console

1. The actual invoice / plan tier confirmation (Launch vs anything else).
2. The compute-hours meter for the current cycle and the **configured compute size / autoscaling min-max** on `ep-cold-waterfall-adno3ao2`.
3. The suspend-timeout setting (default 5 min assumed).
4. Whether `morning-bread` / `round-recipe` are in the same billed org, and their storage/compute meters.

### 2.7 Maya's 5-minute Neon console checklist

1. **console.neon.tech → Billing** → read the current invoice line items: plan fee vs compute overage vs storage overage. (Decides everything below.)
2. **Project `hidden-mountain-87248164` → Usage** → "Compute" CU-hr used this cycle vs 300, and "Storage" GB.
3. **Same project → Branches → `main` → Compute settings** → note compute size / autoscaling range. If min > 0.25 CU, that is the overage source; lowering it to 0.25 CU is a one-click cost fix (Maya-gated Neon setting).
4. **Org → Projects list** → confirm whether `morning-bread` and `round-recipe` show non-zero storage/compute and whether they bill into the same org.
5. Note the **plan downgrade blocker**: Free needs ≤ 500 MB; we are at 1,086 MB until the JSON drop + archive + VACUUM FULL ship.

---

## 3. CLOUDFLARE R2

### 3.1 Stored volume — DB-side inventory

`listing_media` has **no byte-size column** (schema check: `width`/`height` only, both largely unpopulated) — so volume is estimated from object count × assumed average size.

**Q5 — `listing_media` R2 inventory by status:**

| status | rows | with r2_key | fully mirrored | r2_attempts ≥ 8 | any failed attempts |
|---|---|---|---|---|---|
| active | 81,918 | **81,841** | 81,841 | 40 | 77 |
| deleted | 225 | 31 | 31 | 49 | 193 |

**Q6 — distinct R2 keys referenced:** 81,829 total (81,821 by active rows, 30 by non-active; keys are reused across statuses because the key scheme is deterministic `photos/{listingId}/{order}.jpg` — `lib/media/media-sync-service.ts:139`).

**Estimate (assumption labeled):** average Trestle listing photo = **200–300 KB** (full-size JPEG; not measured — no size column).
- DB-referenced objects: 81,829 × 250 KB ≈ **20 GB** (range 16–25 GB).
- **The bucket almost certainly holds more:** `lib/idx/media-sync.ts:1326` documents the legacy `migrateMediaToR2` cron having "drained **128K+ photos**", and **`deleteFromR2()` has zero production callers** (only the `ops-r2-health` self-test) — nothing has ever deleted a production object. Listings that left the feed, shrunk photo counts (stale higher `order` indexes), and pre-rename keys all persist. Plausible bucket population: **128K–200K+ objects ≈ 30–50 GB.**

**Versus the free tier (10 GB-month): storage is over, by roughly 1–4×.** At $0.015/GB-month that is **$0.10–$0.60/month** — real but tiny.

### 3.2 Operations volume

Cloudflare classes: **Class A** = PutObject, ListObjects (1M/mo free); **Class B** = GetObject, HeadObject (10M/mo free); **egress free**.

Per `runMediaSync` Phase 3 (`lib/idx/media-sync.ts`): each mirror attempt = 1 × `existsInR2` **HEAD (Class B)**; on miss + successful Trestle fetch = 1 × `uploadToR2` **PUT (Class A)**. Failed Trestle fetches consume the HEAD but no PUT. Cron = 96 firings/day, but the backlog is small and cooldown-gated:

- ops:health, last 24 h: **mirrored=90, failed=215** across 95 firings → ≈ 305 HEADs + ≤ 90 PUTs per day.
- Monthly: ≈ **9,200 Class B + ≤ 2,700 Class A** from sync. That is **0.09% / 0.27% of the free allowances.** The 215/day retry churn is a Neon/Trestle-side waste issue (RC3, now parked at 8 attempts per PR #379), **not** a material R2 op cost.

**Public serving path:** the site does NOT proxy R2 — `/api/media/proxy` only proxies **Trestle/Cotality** hosts (`ALLOWED_HOSTS` in `app/api/media/proxy/route.ts`; R2 not in the list). Pages reference `media_url_cached` = `https://pub-<hash>.r2.dev/...` directly (`R2_PUBLIC_URL`, per `docs/r2-setup.md` §3 and `docs/architecture/search-media-foundation-execution-plan-2026-06-06.md`). Two consequences:

1. Every browser/bot image fetch from `pub-*.r2.dev` is a **Class B GET** — **r2.dev URLs are not cached by Cloudflare's CDN** (and are rate-limited; Cloudflare labels them non-production). Mitigation already partially in place: `next.config.js` allows `*.r2.dev` through `next/image`, so views routed through the Vercel image optimizer are cached on Vercel and only miss to R2 occasionally.
2. Rough ceiling: 2,012 listings currently serve an R2 hero image (ops:health "First image classification"); even at 10K page views/day × ~20 gallery images ≈ 6M Class B/mo — near but likely under 10M. Heavy bot crawl could push it over; overage is $0.36 per extra million — again, **small dollars**.

### 3.3 Orphaned objects (billed but unused)

**Q7 — tombstoned rows still holding an r2_key:** 31.
**Q8 — tombstoned keys NOT reused by any active row** (true orphan candidates among DB-known keys): **8**. Negligible.

The material orphan population is the **DB-invisible** one described in §3.1 (historical uploads minus current 81.8K references — potentially ~46K+ objects / ~10 GB+). Only a bucket listing (Cloudflare dashboard or a read-only `ListObjects` reconciliation — **R2 cleanup is HELD**) can size it.

**Q9 — legacy `listings.media` JSON still referencing R2:** 3,795 of 8,335 listings with non-empty media JSON — these reference the same deterministic keys, so they don't add objects, but they are why the legacy JSON can't be declared R2-independent yet (PR 5B / reader-swap is HELD).

### 3.4 Likely R2 charge driver — verdict

- **Storage over 10 GB: YES, almost certainly** (est. 2–5× over, incl. orphans) → but only **$0.15–$0.60/mo**.
- **Class A from retry churn: NO** (≈ 2.7K/mo vs 1M free).
- **Class B from page views: probably under free**, worst case low single dollars.

**If the Cloudflare invoice shows materially more than ~$1/mo, the charge is NOT R2 usage** — most likely candidates: **Workers Paid plan ($5/mo)** (sometimes enabled when setting up R2 tooling), a **zone plan (Pro $25/mo)** on a Cloudflare-managed domain, or another Cloudflare product. `docs/r2-setup.md` §1 notes R2 required a payment method on file even for free-tier use — having a card on file is how small overages started billing silently.

### 3.5 What we CANNOT see without the Cloudflare dashboard

1. The actual invoice and which product each line item belongs to.
2. True bucket object count + stored GB (R2 → bucket → Metrics).
3. Class A / Class B op counters for the month.
4. Whether a Workers Paid / zone plan subscription exists.
5. r2.dev rate-limit throttling events.

### 3.6 Maya's 5-minute Cloudflare console checklist

1. **dash.cloudflare.com → Billing → Invoices** → open the latest invoice; note each line item (R2 storage? R2 operations? Workers Paid? Zone plan?). This alone answers "what am I paying for."
2. **R2 → Overview → `mallan-nyc-media` → Metrics** → read "Storage" (GB) and "Operations" (Class A / B this month). Compare: 10 GB / 1M / 10M free.
3. **R2 → bucket → Settings** → confirm storage class = Standard and public access = r2.dev (no custom domain yet).
4. **Workers & Pages → Plans** → check whether a $5/mo Workers Paid subscription is active (cancel if unused — Maya decision).
5. Note object count vs the DB's 81,829 referenced keys — the difference is the orphan population a future (HELD) cleanup would reclaim.

---

## 4. SQL appendix — every query + result

All run 2026-06-10 ~22:00 UTC against `ep-cold-waterfall-adno3ao2` (host-guard verified). All SELECT-only.

**Q1**
```sql
SELECT pg_database_size(current_database()) AS bytes,
       pg_size_pretty(pg_database_size(current_database())) AS pretty;
-- → bytes=1139253248, pretty='1086 MB'
```

**Q2**
```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid)) AS heap,
       pg_size_pretty(pg_indexes_size(c.oid)) AS indexes,
       pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid),0)) AS toast
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 15;
-- → listings 893 MB (heap 189 MB / idx 26 MB / TOAST 677 MB);
--   listing_search_projection 70 MB; audit_events 51 MB; listing_media 49 MB;
--   demand_signals 4136 kB; geocode_cache 2736 kB; market_snapshots 568 kB;
--   demand_indices 264 kB; listing_momentum 224 kB; leads 192 kB;
--   behavioral_events 160 kB; seller_leads 144 kB; listings_archive 144 kB;
--   social_proof_cache 136 kB; trigger_executions 136 kB
```

**Q3**
```sql
SELECT count(*) AS rows,
  pg_size_pretty(sum(pg_column_size(media))::bigint)      AS media_json,
  pg_size_pretty(sum(pg_column_size(raw_data))::bigint)   AS raw_data,
  pg_size_pretty(sum(pg_column_size(address))::bigint)    AS address_json,
  pg_size_pretty(sum(pg_column_size(features))::bigint)   AS features_json,
  pg_size_pretty(sum(pg_column_size(compliance))::bigint) AS compliance_json,
  pg_size_pretty(sum(pg_column_size(agent_info))::bigint) AS agent_info_json
FROM listings;
-- → rows=107258; media=5991 kB; raw_data=257 MB; address=34 MB;
--   features=99 MB; compliance=196 MB; agent_info=38 MB
```

**Q4**
```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),1) AS dead_pct,
       last_vacuum, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
-- → listing_search_projection 18063 dead (14.4%, autovac 06-05);
--   listing_media 6613 (7.5%, 06-09); listings 2556 (2.4%, 06-10);
--   demand_indices 102 (27.1%); leads 51 (50.5%, never);
--   lead_scores 50 (50%); listing_momentum 45 (14.2%);
--   mfa_sessions 39 (100%, never); seller_leads 38 (95%, never);
--   project_config 36 (97.3%, never). last_vacuum (manual) = NULL everywhere.
```

**Q5**
```sql
SELECT status, count(*) AS rows,
       count(*) FILTER (WHERE r2_key IS NOT NULL) AS with_r2_key,
       count(*) FILTER (WHERE r2_key IS NOT NULL AND media_url_cached IS NOT NULL) AS fully_mirrored,
       count(*) FILTER (WHERE r2_attempts >= 8) AS retry_exhausted,
       count(*) FILTER (WHERE r2_attempts > 0) AS any_failed_attempts
FROM listing_media GROUP BY status ORDER BY rows DESC;
-- → active: 81918 rows / 81841 r2_key / 81841 mirrored / 40 exhausted / 77 failed
--   deleted: 225 rows / 31 r2_key / 31 mirrored / 49 exhausted / 193 failed
```

**Q6**
```sql
SELECT count(DISTINCT r2_key) AS distinct_r2_keys,
       count(DISTINCT r2_key) FILTER (WHERE status='active') AS active_keys,
       count(DISTINCT r2_key) FILTER (WHERE status<>'active') AS nonactive_keys
FROM listing_media WHERE r2_key IS NOT NULL;
-- → 81829 distinct / 81821 active / 30 non-active
```

**Q7**
```sql
SELECT count(*) FROM listing_media WHERE status='deleted' AND r2_key IS NOT NULL;
-- → 31
```

**Q8**
```sql
SELECT count(DISTINCT d.r2_key)
FROM listing_media d
WHERE d.status='deleted' AND d.r2_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM listing_media a
                  WHERE a.status='active' AND a.r2_key=d.r2_key);
-- → 8
```

**Q9**
```sql
SELECT count(*) AS listings_with_media_json,
       count(*) FILTER (WHERE media::text LIKE '%r2.dev%'
                          OR media::text LIKE '%r2.cloudflarestorage%') AS media_json_mentions_r2
FROM listings WHERE media IS NOT NULL AND media::text <> '[]' AND media::text <> 'null';
-- → 8335 / 3795
```

**Q10 — media_sync_state**
```sql
SELECT resource, last_photos_change, last_media_modified, last_run_at,
       last_run_status, rows_checked, rows_updated, rows_failed
FROM media_sync_state;
-- → Media: last_photos_change=2026-05-14T20:37:58Z (649h stale — RC1, known),
--   last_media_modified=2026-06-09, last_run=2026-06-10T21:31Z status=partial,
--   checked=391 updated=362 failed=4
```

**Q11 — Phase-3 backlog + attempts histogram**
```sql
SELECT count(*) FROM listing_media
WHERE status='active' AND media_url_original IS NOT NULL
  AND (r2_key IS NULL OR media_url_cached IS NULL);
-- → 77

SELECT coalesce(r2_attempts,0) AS attempts, count(*) FROM listing_media
WHERE status='active' AND (r2_key IS NULL OR media_url_cached IS NULL)
GROUP BY 1 ORDER BY 1;
-- → attempts 7: 37 rows · 43: 6 · 44: 1 · 107: 7 · 108: 10 · 109: 5 ·
--   110: 5 · 111: 4 · 112: 2   (rows at 100+ attempts predate the RC3
--   parking threshold; now excluded from the backlog SELECT at >= 8)
```

**ops:health excerpts (baseline, 2026-06-10T21:59Z):** DB 1086.48 MB (10.6% of cap); listings 892.69 MB; R2 mirror 24h: mirrored=90 / failed=215 / 95 firings; R2 backlog 77 rows; branch prune examined=1; IDX-displayable 15,868 of 107,258 listings; media-sync cursor 649.4 h stale (RC1).

---

## 5. Assumptions (labeled)

| # | Assumption | Basis |
|---|---|---|
| A1 | Average R2 object size 200–300 KB | No size column in `listing_media`; typical Trestle full-size JPEG. Verify in R2 Metrics (GB ÷ object count). |
| A2 | Bucket holds ≥ 128K objects | `lib/idx/media-sync.ts:1326` ("drained 128K+ photos") + zero production `deleteFromR2` callers. Verify via dashboard. |
| A3 | Endpoint compute = 0.25 CU min (autoscaling default) | Not visible via SQL; NEON.md does not record the compute size. **Console check 3 decides.** |
| A4 | ~1 min DB activity per cron firing; 5-min idle suspend | NEON.md §2/§3; idx-sync/media-sync maxDuration 120 s can stretch the duty cycle slightly higher. |
| A5 | Page-view-driven Class B GETs < 10M/mo | No analytics read in this audit; bot-crawl could break this. Verify via R2 Metrics. |
| A6 | Neon free-plan compute allowance 191.9 CU-hr/mo | Per tasking; `NEON-COST-CONTROL-POLICY.md` §2 says ~100 CU-hr post-2025-reset. Both reported. |

---

## 6. Final table — cost driver → evidence → fix option → gating

| Cost driver | Evidence | Fix option | Maya-gated? |
|---|---|---|---|
| **Neon: Launch plan fee $19/mo** | NEON.md §2 (Launch since 2026-05-17, upgraded only to silence false branch-limit check); cost-control policy says re-evaluate downgrade | Downgrade to Free once storage < 500 MB and Vercel false-check is resolved (support ticket) | **YES** (Neon settings = HELD) |
| **Neon: storage 1,086 MB (2.2× Free cap)** — `listings` TOAST 677 MB; JSON cols ≈ 630 MB (raw_data 257 + compliance 196 + features 99 + agent_info 38 + address 34 + media 6) | Q1–Q3 | (1) Ship legacy-JSON-column drop (`memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`, master-plan PR 10 follow-up; real lever ≈ 630 MB, not the stale ~115 MB estimate); (2) archive ~91K non-displayable listings (incident-doc option G); (3) one-time `VACUUM FULL listings` to return space | **YES** (schema migration = HELD; VACUUM = DB op needing approval; PR 5B reader-swap = HELD prerequisite for media JSON) |
| **Neon: compute duty cycle ~73% 24/7 (~133 CU-hr/mo @0.25 CU; ~533 @1 CU ⇒ +$37/mo overage)** | `vercel.json` cron table (idx-sync */10, media-sync */15, keepalive */15); NEON.md §2 5-min suspend math | (1) Console-verify compute size; lower min to 0.25 CU if higher; (2) loosen idx-sync/media-sync cadence (compliance read first — IDX freshness); (3) db-keepalive itself is redundant (fire times ⊂ media-sync ∪ idx-sync) — removing it saves ~0 but simplifies | **YES** (cron config + Neon settings = HELD) |
| **Neon: sibling projects (morning-bread ~1 GB stale copy; round-recipe)** | Ownership map §5; org-level billing | Console review only; morning-bread is the designated rollback copy — do NOT delete without a replacement rollback strategy | **YES** (Neon = HELD; morning-bread protected by AGENT STOP) |
| **R2: storage over 10 GB free (est. 16–50 GB incl. orphans) ⇒ ~$0.10–0.60/mo** | Q5/Q6 (81,829 referenced keys), A1/A2, no production delete path (`deleteFromR2` callers: health-check only) | Orphan reconciliation (read-only ListObjects diff vs DB keys) then batched delete of unreferenced objects | **YES** (R2 cleanup = HELD) |
| **R2: ops (Class A ~2.7K/mo, Class B ~9K/mo sync + page-view GETs)** | ops:health 24h counters; Phase-3 code path (1 HEAD + ≤1 PUT per attempt) | Nothing needed — orders of magnitude inside free tier; optional: custom domain (`media.mallan.nyc`) to get CDN caching in front of Class B GETs | Custom domain = **YES** (env-var + Cloudflare change) |
| **R2: possible non-R2 Cloudflare subscription (Workers Paid $5/mo / zone Pro)** | Inference — R2 usage at this scale cannot exceed ~$1/mo; payment method on file per `docs/r2-setup.md` §1 | Invoice check; cancel unused subscription | Maya manual (dashboard) |
| **(Waste, not cost) R2 retry churn 215 failed/24h** | ops:health; Q11 histogram | Already mitigated: RC3 parking at 8 attempts (PR #379, merged); rows at 100+ attempts predate it and are now excluded | Done (monitor via ops:health) |

---

*Audit script (throwaway, outside repo): `%TEMP%\r2-neon-cost-audit-readonly.js`. Report generated 2026-06-10. Do not commit without Maya approval.*
