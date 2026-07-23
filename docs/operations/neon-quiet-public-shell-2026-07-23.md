# Neon-Quiet Public Shell — Root Cause, Fix, and Proof (2026-07-23, rev 3)

**Branch:** `fix/public-shell-neon-quiet-2026-07-23` (base: main `c4ade4bd`) · **PR #555 (DRAFT)**
**rev 2:** incorporated the first CHANGES REQUIRED review (distinct-building crawl, geocode manifest, auth sweep, sitemap partitioning, settings deprecation, overstatement removal).
**rev 3:** incorporates the exact-head PREVIEW review: the generateSitemaps machinery (which broke the a6ac0b78 preview at runtime — /sitemap.xml 500, slug conflict) is REMOVED in favor of plain route handlers over ONE cached snapshot; empty-on-error sitemap fallbacks removed; snapshot consistency proven across a cache invalidation; geocode 50k ceiling replaced with complete pagination; buildingName cache-identity fixed; auth discovery broadened to the full source tree; real Neon shard-cost evidence captured.
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

### B. Sitemap: plain-route SNAPSHOT architecture (rev 3)
- **rev 2's generateSitemaps machinery is GONE** — it passed local build but broke the exact-head Vercel preview at runtime (/sitemap.xml 500: "'id' !== '__next_metadata_id__'" slug conflict). rev 3 uses PLAIN route handlers only: `/sitemap.xml` (index), `/sitemap/{id}.xml` (partitions), `/sitemap-index.xml` (same-host 308 alias). robots.txt / Search Console registrations unchanged; the proxy rewrite hack is reverted.
- **ONE cached SitemapSnapshot serves the index AND every partition**: full gated population via deterministic keyset pagination (no fixed `take` that can silently truncate; explicit OVERFLOW throw past 50 partitions → routes 500, crawlers keep their cached copy), global CRM-vs-IDX dedupe, SEO-001 slug composition, distribution gates verbatim.
- **No empty-on-error anywhere**: a partition is complete or an explicit 5xx (failing-first test: simulated Prisma failure → 500 with no urlset in the body). The rev-2 catch-and-return-[] is removed.
- **Snapshot consistency**: chunk membership = STABLE HASH of listing_id — a listing's partition never depends on other rows' positions. Behavioral proof across a REAL cache invalidation: crawl partition 1 (v1) → insert a listing + revalidate 'search' → crawl partitions 2..K (v2) → every UNCHANGED canonical URL appears exactly once in the mixed-version crawl.
- Regeneration between syncs = zero Neon queries (behavioral pin).

### C. Geocode: manifest-served, write-free (rev 2)
- rev 1 honesty correction: the rev-1 change removed writes but **kept a per-request Neon READ** (`geocodeCache.findMany` on in-memory misses — every cold instance repeats it). Now a **geocode manifest** (whole table, slim tuples) serves ALL anonymous traffic through the shared data cache. rev 3: the fixed 50k ceiling is RETIRED — the manifest builds by deterministic keyset pagination (10k pages) and is COMPLETE (behaviorally proven at 53,000 rows: 6 bounded queries, cursor past the old cap; coordinates beyond 50k are served, never silently replaced by centroids); past an EXPLICIT 200k ceiling the build throws rather than serve an incomplete manifest. **≤1 bounded Neon read per revalidation window total; an ordinary anonymous request opens no Neon connection for geocoding.** Zero writes; no Census on the request path; second PrismaClient removed.
- **Operational contract for `scripts/batch-geocode.js`** (documented in the module and test-pinned): OWNER = Maya/designee; TRIGGER = deliberate run after new-listing influx (the job self-queues from live Trestle and skips cached rows); RETRY = rerun (idempotent/resumable); FRESHNESS SLA = best-effort — until a run covers a new address it renders at the deterministic ZIP centroid (same fallback it already got when the old 4s Census budget expired); VERIFIED vs FALLBACK = verified coordinates exist only in geocode_cache (source='census'); centroid fallbacks are computed per request and never persisted. LIMITATION (unchanged from before): the public payload does not label verified vs approximate coordinates. No schedule is created — scheduling requires Maya's cron approval.

### D. Auth marker: centralized + repo-wide swept + legacy-covered (rev 2)
- rev 1 covered only password/invite/reset. Now **one pair owns the session cookie**: `applySessionCookies` / `clearSessionCookies` in `lib/auth/cookie-config.ts` set/delete the httpOnly session cookie AND the presence marker together, with per-site overrides preserved (OAuth 24h, impersonation 2h, dev-login secure:false). Converted: password login (agent+lead), MFA completion, OAuth agent / new lead / existing lead, invitation, reset, impersonation start/stop, dev-login (×2), logout (×2), invalid-session clears (/api/auth/me + auth middleware).
- **Full-source-tree automatic discovery test** (rev 3 — no hardcoded file OR directory list): the scan walks the ENTIRE first-party source tree from the repository root (ts/tsx/js/mjs/cjs; generated/vendor/test dirs excluded), matching by the SESSION_COOKIE constant AND the literal cookie name — zero direct writers outside lib/auth/cookie-config.ts; any future direct setter anywhere fails CI.
- **Legacy pre-deployment sessions:** `proxy.ts` mirrors the marker from cookie **presence only** (`req.cookies.has` — never reads the value, never validates, never touches Neon). Behavioral test drives the real proxy: legacy session cookie → marker set; anonymous → no marker. An invalid legacy session still 401s at `/api/auth/me`, which clears both cookies. Authorization remains exclusively the httpOnly session cookie (test-enforced: no server authorization path reads the marker).

### E. Company settings: ADMINISTRATIVE FEATURE REMOVED (rev 2/3 — explicit disclosure)

**This is a product-behavior removal, not an optimization:** the broker-facing company-settings editing capability (POST /api/settings/company) is REMOVED — the route now returns 410 Gone (still broker-gated; attempts audited). It is NOT presented as behavior-preserving. Rationale and context:
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
| Combined rev-2 correction red-run | **39/51 failed** against pre-correction branch state | **51/51** after |
| rev 3: buildings-sitemap-geocode rewrite (19) + distinct-buildings +1 (8) + auth full-tree (26) | rev-3 behaviors red vs rev-2 code (metadata machinery present; 50k cap; bn identity fork; empty-fallback) | **53/53** green |

rev-3 key pins: simulated Prisma failure → sitemap 500 with NO urlset (empty-on-error banned); mixed-version crawl across a real cache invalidation loses/duplicates no unchanged URL; 53,000 geocode rows served completely (6 keyset pages, cursor past the old 50k cap); 3 buildingName variants → ONE cache assembly. rev-2 pins retained: 100 distinct buildings → ≤10 Neon queries (measured in-test: shard bound), re-crawl → 0; coarse `search` revalidation → **0 building re-assemblies and 0 Neon queries** (the rev-1 wake-pattern recurrence is impossible); one exact building tag → exactly 1 re-assembly. Sitemap: 25,001 rows → ids [0..4], every URL exactly once, deterministic across passes, cross-partition CRM dedupe holds, zero queries on regeneration. Geocode: 3 requests / 3 different addresses → 1 Neon read total. Auth: real-proxy legacy-session test; helper parity for broker/agent/lead + overrides.

## 4b. Building-shard cost — REAL Neon evidence (rev 3, read-only)

Live production measurements (2026-07-23, project hidden-mountain, no index applied — reported only):

- **Shard alphabet:** street numbers start 1-9 → exactly **9 shards**. Rows per shard: 1→4,473 · 2→3,425 · 3→2,658 · 4→1,760 · 5→1,515 · 6→739 · 7→684 · 8→596 · 9→423 (16,273 gated rows total).
- **Worst-shard plan (EXPLAIN ANALYZE, BUFFERS — shard '1'):** Seq Scan on listings, 23,460 tuples read, 18,987 removed by filter, 4,473 returned; buffers 5,237 hit + 596 read; external merge sort 5.1 MB; **execution 55.4 ms**.
- **Cold-fill of ALL 9 shards ≈ 9 seq scans ≈ ~0.5 s total DB time and ~211k seq_tup_read, at most once per sync window.** Compare: the per-building architecture ran a comparable JSON-filtered query on EVERY distinct building request (~300 requests/6h measured).
- **Transfer weight per full fill:** media JSON ≈ 12 MB + address/features ≈ 26 MB across all shards (slimmed immediately; heavy JSON never enters the cache). Bounded, once per window.
- **Honest note:** each shard fill is a full-table seq scan (no expression index on address->>'StreetNumber'). An expression index would cut it — NOT applied (requires Maya's approval per NEON.md); at 9×55 ms/window the unindexed cost is small.

## 5. Analytics / append-only inventory (REPORT ONLY — unchanged from rev 1)

behavioral_events 78 / intent_events 16 / listing_views 0 — **no purge path (gap; trivial today)**. geocode_cache 13,512 (1-year purge ✓). audit_events 88,948 rows / 60.1 MB (2-year purge ✓ with CAN-SPAM exemption); 52% is one closed incident cohort (`idx_sync_listing_upsert_failure`, 46,011 rows, 2026-05-21→06-13, ~30 MB) that sits until 2028 — bounded prune = candidate for separate approval, NOT performed.

## 6. Cron maxDuration (REPORT ONLY — unchanged from rev 1)

vercel.json glob 30s vs in-code exports (18×60s, feed-reconcile 300s; idx/media-sync have explicit 120s entries): latent declared-vs-exported conflict. Empirically zero cron 5xx in the full log-retention window — nothing is being killed today. No change made (vercel.json is a hard boundary).

## 7. Baseline + measurement protocol (unchanged)

Baseline 2026-07-23T03:10:46Z: `cpu_used_sec` 470,284 · `active_time_seconds` 1,879,592 · logical_size 572,923,904 B. W1-only slope ≈ 0.35 CU-h/h with no suspend gap observed — consistent with the distinct-building MISS cadence. **Actual reduction must be verified post-deploy** by re-reading the same counters over wall-clock at T+2h / T+24h. No NEON-001 closure is claimed.

## 8. Preview runtime probes (exact head 02cd2b93, dpl_C6ngwv59ZRy5X73FefLJ7oft3hEZ, READY)

**Routing — the rev-2 blocker is FIXED on the exact preview:**
- /sitemap.xml → resolves to OUR handler (no slug conflict); returns the DESIGNED fail-closed 500 (see below) with 'sitemap temporarily unavailable', never an empty urlset.
- /sitemap-index.xml → clean same-host 308 → /sitemap.xml ✓
- /sitemap/abc.xml → 404 ✓ ; /sitemap/99.xml → 500 (fail-closed: the id bound is unknowable without the snapshot on a DB-less runtime) — consistent with design.
- Anonymous / → ZERO Set-Cookie headers (presence-marker gate correct).

**Why the preview cannot prove sitemap CONTENT (environment, not code):** the Vercel PREVIEW environment has NO DATABASE_URL — verified on this exact deployment: the DB-only listing detail page (PR #511 render) also 500s; /api/idx/watermark returns all nulls; /api/listings silently serves its Trestle-direct fallback (total 9,773 = live feed); and pg_stat deltas during ~50 preview building probes show ZERO production-Neon queries. This is pre-existing env design (NEON.md-adjacent), visible on EVERY preview, not introduced by this PR. The sitemap's 500 here is exactly the banned-silent-empty alternative done right. Two paths to full preview content-proof — both are Maya's call: (a) add a Preview-scoped DATABASE_URL (env change, HELD), or (b) accept routing-level preview proof + local behavioral proof, with content verified on production post-deploy.

**Building probes (100 distinct identities from production addresses):** the route's own REBNY anti-scrape rate limiter (30 req/min/IP) correctly throttled an unpaced 100-request burst with 429s — compliance behavior working as designed. Paced results (2.2 s spacing) in §8b. On the DB-less preview these exercise the Trestle + ACRIS layers and the Vercel data cache; the Neon-side shard evidence is the direct production measurement in §4b.

## 8b. Paced building-probe results

Paced at 2.2 s (respecting the route's 30/min limiter), exact preview dpl_C6ngwv59…:

| pass | requests | ok | fail | avg latency |
|---|---|---|---|---|
| COLD — 100 DISTINCT buildings (real production addresses, incl. case-variant street names) | 100 | **100** | 0 | 245 ms |
| WARM — same first 30 | 30 | **30** | 0 | 272 ms |

Zero errors, zero 5xx across every distinct building; case-variant identities ('1 5TH' vs '1 5th') served consistently. An UNPACED 100-burst was correctly throttled by the route's own REBNY anti-scrape limiter (429s) — compliance behavior intact. Production-Neon queries during the entire battery: ZERO (pg_stat delta = my one EXPLAIN only), confirming the preview runtime is DB-less and the Neon-side shard evidence stands on §4b's direct production measurements.

## 9. Verdict

**CHANGES REQUIRED — blocked on an ENVIRONMENT decision, not on code.** Per Maya's rule ('final classification must remain CHANGES REQUIRED unless the exact-head preview runtime probes pass'): the sitemap content probes cannot pass on a preview that has no DATABASE_URL by design. Everything code-side is green on the exact head 02cd2b93: all GitHub checks pass; Jest 5,386/5,386; tsc 0; build 0 with the plain sitemap routes; validators clean; failing-first proof for every review finding; routing verified on the exact preview. The remaining decision — Preview-scoped DATABASE_URL (env change) vs. accepting routing+local proof — is Maya's alone. Not merged, not deployed, not marked ready; no migration, no vercel.json/cron/Neon-settings change, no index applied, no production-row mutation; #544/#554 untouched. Production CU/storage reduction remains NOT DEPLOYED and NOT PROVEN (§7 protocol).
