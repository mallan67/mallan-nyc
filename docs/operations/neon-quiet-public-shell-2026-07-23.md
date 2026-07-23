# Neon-Quiet Public Shell — Root Cause, Fix, and Proof (2026-07-23, rev 2)

**Branch:** `fix/public-shell-neon-quiet-2026-07-23` (base: main `c4ade4bd`) · **PR #555 (DRAFT)**
**rev 2:** incorporates Maya's CHANGES REQUIRED review — distinct-building crawl semantics, geocode manifest, auth-marker sweep, sitemap partitioning, settings-editor deprecation, and removal of the rev-1 overstatements (each noted inline).
**Status:** DRAFT — nothing merged, nothing deployed. All production numbers are read-only measurements.
**Authority hierarchy (governing):** Cotality API = sole listing/media truth → One Cycle sync → Neon operational copy → projections → Vercel cache → visitors. The building payload keeps its three layers — Neon operational copy (incl. CRM SL-/RL- exclusives), live Cotality/Trestle, ACRIS public records — only the Neon layer's ACCESS PATTERN changed.

---

## 1. Root-cause tree (measured)

```
Neon compute awake outside sync windows (NEON-001 residual after W1 #553)
│
├── /api/buildings + /buildings/[slug]  ← STRONGEST LIVE WAKE SOURCE
│   │   121 API + 179 page executions/6h of DISTINCT crawler-walked slugs
│   │   → every request a cache MISS → prisma.listing.findMany ~every
│   │   3 min — alone enough to defeat the 5-min autosuspend.
│   ├── page → internal HTTP → API (two executions per page view)
│   ├── per-building findMany on EVERY distinct building (the key defect:
│   │   caching per building does NOT fix a distinct-slug crawl)
│   └── fire-and-forget upsertBuildingFromRecords(...) — production-proven
│       DORMANT (buildings/building_units: 0 rows, 0 writes ever) but a
│       write call on a public GET regardless.
│
├── /sitemap.xml — unbounded ~10.3k-row listing scan per regeneration.
│
├── lib/geo/geocode.ts — SECOND PrismaClient + request-time geocode_cache
│   READS on every in-memory miss + request-time Census calls +
│   fire-and-forget upserts (13,499 lifetime inserts from public traffic).
│
└── Public shell chatter — settings fetches, no-store watermark fetches,
    anonymous /api/auth/me calls.
```

## 2. What changed

### A. Buildings: sharded manifest + exact tags (rev 2 — the distinct-crawl fix)
- **`lib/buildings/public-building-data.ts`:** the Neon layer is now a **building manifest** sharded by street-number first character (NYC street numbers → ≤ ~10 shards). Any crawl of N distinct buildings performs **at most ~10 bounded Neon queries per sync window — never one per building**. The manifest carries slim precomputed rows (first-photo URL precomputed; heavy media JSON never enters the cache). The public-invisible DB-closed layer was dropped (its `source:'mls'` rows were always withheld by the public visibility contract), so `raw_data` never loads.
- **Per-building cache entries carry ONLY their exact building tag** — the coarse `search` tag was REMOVED from them (rev 1 defect: it would have re-expired every building on every sync). `lib/idx/sync.ts` now derives **exact building tags** (`buildingTagFromAddress`) at all three mapped listing-change sites and revalidates only materially affected buildings. `buildingCacheTag` canonicalizes street names (direction/suffix stripping) so link-side, stored-raw, and sync-side derivations collapse to one tag. Media-JSON-only changes ride the 30-min fallback window (documented, bounded).
- Route stays a thin pure-read shell; page/generateMetadata call the accessor directly (no internal HTTP). Trestle + ACRIS layers still run per building — they are not Neon, and Cotality remains the sole listing truth.

### B. Sitemap: PARTITIONED — silent truncation structurally impossible (rev 2)
- `generateSitemaps` serves `/sitemap/{id}.xml`: partition 0 = static/legal/agents/buildings; partitions 1..K = deterministic 10k listing chunks (orderBy `listing_id` ASC). K derives from a cached COUNT of the exact gated population **+1 slack partition** (growth between refreshes lands in slack, never off the end). Past `MAX_SITEMAP_PARTITIONS` (50 = 500k URLs) the set **fails closed** (500; crawlers keep the cached copy) — it never publishes a falsely complete sitemap. (rev 1's `take:25000` + console.error was still silent truncation; retired.)
- The classic **`/sitemap.xml` URL keeps working** as a standards-compliant `<sitemapindex>` (`app/sitemap.xml/route.ts`) over the partitions — robots.txt and Search Console registrations unchanged.
- CRM-vs-IDX dedupe is **cross-partition correct**: every chunk dedupes against the full cached CRM-exclusive set, so an exclusive and its IDX duplicate can never both be emitted even in different partitions. Gates, `ACTIVE_DISPLAY_VALUES`, SEO-001 slug composition, suppressed-address handling — verbatim.
- All sections through `cachedPublicRead` tagged `search`: regeneration between syncs = zero Neon queries.

### C. Geocode: manifest-served, write-free (rev 2)
- rev 1 honesty correction: the rev-1 change removed writes but **kept a per-request Neon READ** (`geocodeCache.findMany` on in-memory misses — every cold instance repeats it). Now a **geocode manifest** (whole 13.5k-row table, slim, ≈0.7 MB, bounded at 50k with loud log) serves ALL anonymous traffic through the shared data cache: **≤1 bounded Neon read per revalidation window total; an ordinary anonymous request opens no Neon connection for geocoding.** Zero writes; no Census on the request path; second PrismaClient removed.
- **Operational contract for `scripts/batch-geocode.js`** (documented in the module and test-pinned): OWNER = Maya/designee; TRIGGER = deliberate run after new-listing influx (the job self-queues from live Trestle and skips cached rows); RETRY = rerun (idempotent/resumable); FRESHNESS SLA = best-effort — until a run covers a new address it renders at the deterministic ZIP centroid (same fallback it already got when the old 4s Census budget expired); VERIFIED vs FALLBACK = verified coordinates exist only in geocode_cache (source='census'); centroid fallbacks are computed per request and never persisted. LIMITATION (unchanged from before): the public payload does not label verified vs approximate coordinates. No schedule is created — scheduling requires Maya's cron approval.

### D. Auth marker: centralized + repo-wide swept + legacy-covered (rev 2)
- rev 1 covered only password/invite/reset. Now **one pair owns the session cookie**: `applySessionCookies` / `clearSessionCookies` in `lib/auth/cookie-config.ts` set/delete the httpOnly session cookie AND the presence marker together, with per-site overrides preserved (OAuth 24h, impersonation 2h, dev-login secure:false). Converted: password login (agent+lead), MFA completion, OAuth agent / new lead / existing lead, invitation, reset, impersonation start/stop, dev-login (×2), logout (×2), invalid-session clears (/api/auth/me + auth middleware).
- **Repo-wide automatic discovery test** (no hardcoded file list): zero direct `cookies.set/delete(SESSION_COOKIE…)` outside the helper across app/, lib/, proxy.ts; any future direct setter fails CI.
- **Legacy pre-deployment sessions:** `proxy.ts` mirrors the marker from cookie **presence only** (`req.cookies.has` — never reads the value, never validates, never touches Neon). Behavioral test drives the real proxy: legacy session cookie → marker set; anonymous → no marker. An invalid legacy session still 401s at `/api/auth/me`, which clears both cookies. Authorization remains exclusively the httpOnly session cookie (test-enforced: no server authorization path reads the marker).

### E. Company settings: editor explicitly DEPRECATED (rev 2)
- rev 1 misframed this as "preserved behavior." Correction: the broker POST wrote an **ephemeral** JSON file that the public shell (build-time module) could never reflect. Leaving it "working" would be dishonest. POST now returns **410 Gone** with a clear message (still broker-gated; attempt audited). Repo-wide sweep: **zero in-repo callers** of the POST existed. To change settings today: edit `lib/config/public-company-settings.ts` and deploy — the ONE source the GET and the public shell both serve. A durable editor needs the HELD CompanySetting migration + tag invalidation of the public shell (design noted here for when Maya approves).

### F. Public shell (unchanged from rev 1)
Static company-settings module; deduped tag-cached IDX watermark (revalidated only after a fully successful sync's `syncState.upsert`); presence-marker gate so anonymous visitors make zero `/api/auth/me` calls.

## 3. Corrected claims (rev 1 overstatements removed)

| rev 1 said | rev 2 truth |
|---|---|
| "ordinary anonymous public requests do not read Neon" | Anonymous requests perform **zero per-request Neon reads and zero writes**. Neon is read only through bounded cached fills: ≤ ~10 building-manifest shards + 1 geocode manifest + the sitemap sections, each at most once per revalidation window across ALL traffic. |
| "marker set/cleared at every session-cookie site" (3 files) | True only after rev 2: centralized helper + repo-wide discovery + proxy legacy mirror; OAuth/MFA/impersonation/dev-login/legacy were uncovered in rev 1. |
| "every canonical URL preserved" (fixed take + log) | Now structural: partitioned + slack + fail-closed cap; proven behaviorally at a 25,001 population with cross-partition dedupe and determinism. |
| "distinct crawler wake source fixed" (same-building test only) | Now proven with a 100-distinct-building behavioral test incl. sync-invalidation simulation (see §4). |
| Verdict "SAFE FOR MAYA TO CONSIDER" (rev 1) | Withdrawn for rev 1; re-classified in §8 on the rev-2 evidence. |

## 4. Failing-first proof

| Suite | Red | Green |
|---|---|---|
| `neon-quiet-public-shell.test.ts` (17) | 11 failed vs pre-PR main | 17/17 |
| `neon-quiet-distinct-buildings.test.ts` (7, NEW) | red vs pre-correction | 7/7 |
| `neon-quiet-auth-marker-sweep.test.ts` (26, NEW) | red vs pre-correction | 26/26 |
| `neon-quiet-buildings-sitemap-geocode.test.ts` (18, rewritten) | red vs pre-correction | 18/18 |
| Combined correction red-run | **39/51 failed** against pre-correction branch state | **51/51** after |

Key behavioral pins: 100 distinct buildings → ≤10 Neon queries (measured in-test: shard bound), re-crawl → 0; coarse `search` revalidation → **0 building re-assemblies and 0 Neon queries** (the rev-1 wake-pattern recurrence is impossible); one exact building tag → exactly 1 re-assembly. Sitemap: 25,001 rows → ids [0..4], every URL exactly once, deterministic across passes, cross-partition CRM dedupe holds, zero queries on regeneration. Geocode: 3 requests / 3 different addresses → 1 Neon read total. Auth: real-proxy legacy-session test; helper parity for broker/agent/lead + overrides.

## 5. Analytics / append-only inventory (REPORT ONLY — unchanged from rev 1)

behavioral_events 78 / intent_events 16 / listing_views 0 — **no purge path (gap; trivial today)**. geocode_cache 13,512 (1-year purge ✓). audit_events 88,948 rows / 60.1 MB (2-year purge ✓ with CAN-SPAM exemption); 52% is one closed incident cohort (`idx_sync_listing_upsert_failure`, 46,011 rows, 2026-05-21→06-13, ~30 MB) that sits until 2028 — bounded prune = candidate for separate approval, NOT performed.

## 6. Cron maxDuration (REPORT ONLY — unchanged from rev 1)

vercel.json glob 30s vs in-code exports (18×60s, feed-reconcile 300s; idx/media-sync have explicit 120s entries): latent declared-vs-exported conflict. Empirically zero cron 5xx in the full log-retention window — nothing is being killed today. No change made (vercel.json is a hard boundary).

## 7. Baseline + measurement protocol (unchanged)

Baseline 2026-07-23T03:10:46Z: `cpu_used_sec` 470,284 · `active_time_seconds` 1,879,592 · logical_size 572,923,904 B. W1-only slope ≈ 0.35 CU-h/h with no suspend gap observed — consistent with the distinct-building MISS cadence. **Actual reduction must be verified post-deploy** by re-reading the same counters over wall-clock at T+2h / T+24h. No NEON-001 closure is claimed.

## 8. Verdict

**SAFE FOR MAYA TO CONSIDER** — as a DRAFT, on the rev-2 evidence above: all four review findings corrected with failing-first proof, full battery green (Jest suites incl. 51 correction tests, tsc, build, RLS, UCBA 0 regressions, compliance BLOCKER+STRICT 0 failures, workflows, Release Truth), remote CI on the exact pushed head. The one idx:validate critical (`db-keepalive NOT SCHEDULED`) is pre-existing and intentional. Not merged, not deployed, not marked ready; no migration, no vercel.json/cron/Neon-settings change, no production-row mutation; #544/#554 untouched. Production CU/storage reduction remains **NOT YET PROVEN** — it requires the §7 post-deploy slope measurements, which can only happen after Maya's separate deployment decision.
