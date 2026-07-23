# Neon-Quiet Public Shell — Root Cause, Fix, and Proof (2026-07-23)

**Branch:** `fix/public-shell-neon-quiet-2026-07-23` (base: main `c4ade4bd`)
**Status:** DRAFT PR — nothing merged, nothing deployed. All production numbers below are read-only measurements.
**Authority hierarchy (governing):** Cotality API → One Cycle sync → Neon operational copy → projections → Vercel cache → visitors. Ordinary anonymous public requests do not read Neon. MAllan business data never overrides Cotality listing facts.

---

## 1. Root-cause tree (measured, not assumed)

```
Neon compute awake outside sync windows (NEON-001 residual after W1 #553)
│
├── /api/buildings + /buildings/[slug]  ← STRONGEST LIVE WAKE SOURCE
│   │   121 API + 179 page executions / 6h (Vercel logs), distinct
│   │   crawler-walked slugs → every request a cache MISS ≈ one Neon
│   │   touch every ~3 min — alone enough to defeat 5-min autosuspend.
│   ├── page → internal HTTP → API (two executions per page view;
│   │   generateMetadata repeated the fetch)
│   ├── prisma.listing.findMany on EVERY miss (residual ~20/h listings
│   │   seq-scans post-W1 ≈ this route's rate)
│   └── fire-and-forget upsertBuildingFromRecords(...).catch(()=>{})
│       DORMANT in practice: buildings + building_units = 0 rows,
│       0 inserts/updates EVER (BuildingKeyNumeric absent from $select)
│       — but a write call sitting on a public GET regardless.
│
├── /sitemap.xml — force-dynamic, revalidate=300: every regeneration ran an
│   UNBOUNDED prisma.listing.findMany (~10.3k rows) + agents + buildings.
│
├── lib/geo/geocode.ts — constructed a SECOND PrismaClient (own pool/
│   connections) and wrote geocode_cache during public requests
│   (13,499 lifetime inserts) + request-time Census calls.
│
└── Public shell chatter (fixed in this PR, Parts 1–3 of the prior directive)
    ├── /api/settings/company fetched by Footer + HeroSearch on every mount
    ├── /api/idx/watermark fetched no-store by Footer + IDXDisclaimer
    └── /api/auth/me called by AuthProvider for ANONYMOUS visitors
```

## 2. What changed (all in this one focused PR)

### A. Buildings become a pure cached read (items 3–5)
- **`lib/buildings/public-building-data.ts` (NEW):** the complete payload assembly moved verbatim out of the route. `getBuildingDataCached()` wraps it in the existing `cachedPublicRead` with tags `[buildingCacheTag(num, street, zip), SEARCH_CACHE_TAG]` + 30-min sync-cadence fallback. Payload proven JSON-safe (all values `Number()`/`String()` coerced; round-trip test).
- **`app/api/buildings/route.ts`:** thin shell — rate limit → param validation → cached accessor → `NextResponse.json`. Zero prisma references, zero Trestle references, zero writes. The dormant `upsertBuildingFromRecords` call and import are **removed**; building/unit sync is exclusively owned by an explicit future workflow (`lib/buildings/upsert.ts` retained for that owner).
- **`app/buildings/[slug]/page.tsx`:** internal-HTTP hop removed; page and `generateMetadata` call `getBuildingDataCached` directly — page render, metadata, and API all share ONE cache entry.
- **Compliance unchanged by construction:** distribution gates (`idx_display_yn`, `internet_entire_listing_display_yn`, `owner_opt_out`, `participant_only`), `checkDistributionGates`, ACRIS-only public sale history via `resolveVisibility(audience: 'public')`, REBNY attribution — all moved verbatim; `ci-compliance-check` rule 8 repointed to the canonical file (94/94 BLOCKER+STRICT pass).

### B. Sitemap cached + bounded (item 6)
- All three DB sections (listings/agents/buildings) assembled by ONE builder wrapped in `cachedPublicRead` tagged `search` — the tag every successful idx-sync revalidates. Repeated crawler hits execute ZERO Prisma queries between syncs.
- Listing scan bounded: `take: SITEMAP_LISTING_BOUND` (25,000 — ≥2× current ~10.3k population, ≤ protocol 50k, so **every canonical URL preserved**) with deterministic `orderBy` and a loud log if the bound is ever hit (no silent caps).
- Every distribution gate, the `ACTIVE_DISPLAY_VALUES` status filter, SEO-001 slug composition, CRM-vs-IDX dedupe, and suppressed-address handling preserved verbatim.
- Note: the buildings sub-query emits zero URLs today (table empty — see §1); documented in-file.

### C. Geocode request path is read-only (item 7)
- Second `PrismaClient` **removed** — module now uses the shared `@/lib/prisma` singleton (invariant: `new PrismaClient` appears only in `lib/prisma.ts` across app/ + lib/, enforced by test).
- Request-time Census call and fire-and-forget `geocodeCache.upsert` writes **removed**. Read path = memory cache → one bounded DB read (1s budget) → deterministic ZIP-centroid fallback (exactly the fallback misses already got when the 4s budget expired).
- Durable population = existing explicit bounded job `scripts/batch-geocode.js` (own Census + upsert, resumable, skips cached rows) — run deliberately, never from public traffic.

### D. Public shell (Parts 1–3, completed before the buildings redirect)
- `lib/config/public-company-settings.ts` — canonical static settings (identical to the effective production values; `data/company-settings.json` does not exist so `DEFAULT_SETTINGS` was the source); Footer/HeroSearch no longer fetch; the API route serves the same module (no drift).
- `lib/cache/idx-watermark.ts` + rewritten watermark route — tag-cached (`idx-watermark`, 30-min fallback); `lib/idx/sync.ts` revalidates the tag ONLY after a fully successful run's `syncState.upsert` (inside `errors === 0`).
- `lib/client/idx-watermark-client.ts` — ONE deduped watermark request per app mount, no `no-store`, fail-closed null.
- Auth presence marker `mallan_auth_present` (NOT httpOnly, same lifetime as session cookie, set/cleared at every session-cookie site): `AuthProvider` performs ZERO `/api/auth/me` calls without it. **Security contract:** presentation-only; no server path reads it (enforced by test); authorization continues to rely exclusively on the httpOnly session cookie.

## 3. Failing-first proof

| Suite | Red (original code) | Green (this PR) |
|---|---|---|
| `tests/runtime/neon-quiet-public-shell.test.ts` (17 tests) | 11 failed | 17/17 |
| `tests/runtime/neon-quiet-buildings-sitemap-geocode.test.ts` (17 tests) | 16 failed (1 pass = gates-preserved, correctly true in both worlds) | 17/17 |

Behavioral highlights: repeated building request after cache fill = **zero additional Prisma queries** (memoized `unstable_cache` stand-in, `findMany` call-count pinned at 1); repeated sitemap generation = zero additional queries; `geocodeListings` issues exactly one READ and no writes; payload JSON round-trip identity.

Adjusted existing pins (intent documented in each): `one-cycle-w1-sync-revalidation` (new watermark tag), `auth-login-flow` (mock exports presence config), `release-safety-source-guards` (IDXDisclaimer no-store allowlist entry retired — allowlist shrank), `public-closed-sale-source-guard` + `search-card-virtual-tour-badge` (source pointers follow the verbatim code move).

## 4. Validation (exact commands, this branch)

- `npx jest` — **307 suites / 5,350 tests, 0 failures** (final full run)
- `npx tsc --noEmit` — 0 errors
- `npm run build` — success
- `npm run rls:validate` — 0 errors / 0 unknown
- `npm run ucba:audit` — 0 regressions (CLAIM_OVERSTATED: 0)
- `npm run compliance-check` — **94 passed, 0 failed** (BLOCKER+STRICT)
- `npm run idx:validate` — 1 critical: `/api/cron/db-keepalive NOT SCHEDULED` — **pre-existing on main and intentional** (keepalive deliberately disabled per NEON.md; validator run-history confirms "Critical issues unchanged (1)"). Not caused and not fixed by this PR (cron config is HELD).

What these prove / don't: validators prove static rule conformance of THIS repo; they do not prove any field is live on Cotality; live-production effect requires the post-deploy slope measurements in §7.

## 5. Analytics / append-only inventory (item 8 — REPORT ONLY, nothing deleted)

| Table | Rows (2026-07-23) | Retention coverage |
|---|---|---|
| behavioral_events | 78 | **NONE — no deleteMany anywhere (gap; trivial today)** |
| intent_events | 16 | **NONE (gap; trivial today)** |
| listing_views | 0 | **NONE (gap; empty)** |
| geocode_cache | 13,512 | 1-year purge in data-retention cron ✓ |
| audit_events | 88,948 (60.1 MB) | 2-year purge ✓ (with CAN-SPAM `email_unsubscribed` exemption) |

audit_events composition: **`idx_sync_listing_upsert_failure` = 46,011 rows (52%) — entirely from the closed 2026-05-21→06-13 incident window**; sits until the 2-year window in 2028. A bounded intentional prune of that single closed cohort (~30 MB) is a candidate for a separately-approved retention action — NOT performed. Ongoing writers: `idx_sync`+`idx_sync_cron` ≈96 rows/day, `media_sync_cron` 24/day, `feed_reconcile_ghost_transition` ongoing.

## 6. Cron maxDuration verification (item 9 — conflicts only)

- `vercel.json`: glob `app/api/**/*.ts` → 30s; explicit `idx-sync` 120s, `media-sync` 120s. 21 crons scheduled.
- In-code exports conflict with the glob: 18 cron routes export `maxDuration = 60`, `feed-reconcile` exports `300` — while the deployed vercel.json glob declares 30 for them.
- **Empirical check (production, full log-retention window):** zero 5xx on any cron path; feed-reconcile's 03:30 run returned 200. No cron is being killed by a duration cap in the observed window. The declared-vs-exported mismatch is a latent conflict to reconcile when vercel.json is next opened under approval — reported only, no change made (vercel.json is a hard boundary).

## 7. Current baseline + predicted effect (slopes, not cumulative numbers)

Baseline (Neon control plane, project `hidden-mountain-87248164`, 2026-07-23T03:10:46Z):
`cpu_used_sec` 470,284 · `active_time_seconds` 1,879,592 · logical_size 572,923,904 B · db 524 MB.

W1-only slope measured 03:10:46→~04:08Z (~0.95h): **+1,182 CU-s (≈0.35 CU-h/h ≈ 8.3 CU-h/day if sustained)**; active-time delta ≈ elapsed wall-clock → effectively no suspend gap in this window — consistent with the ~3-min building-MISS cadence being the remaining wake source.

Predicted after this PR deploys: building requests collapse to ≤1 Neon read per building per sync window (tag/30-min bounded) instead of one per request; sitemap to ≤1 scan per sync window; geocode writes from public traffic → 0; anonymous-shell function invocations for settings/watermark/auth-me → ~0. Residual expected wake sources: the 21 scheduled crons and authenticated CRM traffic. **Actual CU-hour and storage reduction must be verified post-deploy by re-reading `cpu_used_sec` / `active_time_seconds` / logical_size deltas over wall-clock at T+2h and T+24h — no claim of NEON-001 closure is made here.**

Current scan rates (retiring the stale 108M-tuples/day figure): listings seq-scans ~20/h; media ~10/media-sync run. buildings table: seq_scan counter 4,774 lifetime, 0 rows, 0 writes ever.

## 8. Verdict

**SAFE FOR MAYA TO CONSIDER** — draft PR only. Not merged, not deployed, not marked ready. #544 and #554 untouched. No migration, no vercel.json change, no cron change, no Neon settings change, no production-row mutation. The db-keepalive validator critical is pre-existing and intentionally unresolved.
