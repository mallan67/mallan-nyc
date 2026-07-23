# Cotality/ACRIS Source-Boundary + Neon/R2 Optimization Audit — 2026-07-23

**REV 2 (Maya live-repo review corrections, 2026-07-23):**
1. Added **D15 — consumer-facing sale-language** as a VERIFIED defect class:
   the website, its SEO metadata, and a seller solicitation CTA present ACRIS
   recorded transfers as verified "sales" (details in §3-D15). This was the
   most serious public-facing problem and rev 1 understated it.
2. The persistence claim is NARROWED: *"Public building-page ACRIS transfer
   results are not persisted to Neon or R2 by the current public adapter."*
   The separate prospecting scanner deliberately writes ACRIS-derived CSV
   snapshots and manifests (overwrite-in-place, gitignored) — the broad
   phrase "ACRIS is never persisted" was too absolute.
3. The complete public-consumer inventory (9 surfaces) is listed in §4-bis.
4. This file is now committed on the implementation PR branch (rev 1 existed
   only in a local working tree and was not independently verifiable).

**Report-only at rev 1. Rev 2 accompanies the approved narrow implementation
PR (Cotality/ACRIS boundary only).**
Verified against: main `d6db86e3` (checked out clean), production deployment
`dpl_3N7j8gvJVE7FK5ELc3Y31t2Fyq82` (target=production, sha `d6db86e3` — confirmed
via Vercel API, not assumed), the live open-PR queue, live Cotality `$metadata`
(trestle-fields cache, 0 min old), and read-only Neon queries on
`hidden-mountain-87248164`.

Classification legend: `VERIFIED` · `NOT PRESENT` · `ALREADY FIXED` ·
`UNVERIFIED` · `REQUIRES LIVE ACCESS`.

---

## 1. Current verified architecture (as deployed at d6db86e3)

```text
Cotality/Trestle API  ──One Cycle sync──►  Neon (hidden-mountain / cold-waterfall)
                                             │ listings, listing_media, projections
                                             ▼
                              cachedPublicRead (Next data cache, tag-invalidated
                              by sync, 30-min cadence fallback)  ──►  visitors
R2      = media delivery cache (feed photos mirrored by media-sync)
ACRIS   = read-only NYC Open Data calls inside the building payload (public
          closed sales) + a SEPARATE offline prospecting scanner (CSV pipeline)
CRM     = Mallan business records (SL-*/RL-*, SellerLead, contacts…)
```

- Public building payload: `lib/buildings/public-building-data.ts` →
  `buildBuildingPayload()` → cached by `getBuildingDataCached()` under
  `buildingCacheTag(...)` (exact per-building tag, no coarse tag). Public GET is
  a pure read (#556, live).
- ACRIS public closed-sale adapter: `lib/buildings/acris-building-sales.ts`
  (`lookupBBL`, `fetchAcrisSales`, `isDuplicate`) — read-only, no prisma, every
  row carries `source: 'acris'`.
- ACRIS/PLUTO prospecting scanner: `lib/scanner/**` + `scripts/scanner/**` →
  corridor-clipped CSVs in `data/scanner/` (gitignored) →
  `scored-prospects.json` → read by authed `/api/crm/scanner/prospects`.

## 2. Already fixed on main

| Item | Status | Evidence |
|---|---|---|
| Request-time public building GET writes (upsert on GET) | ALREADY FIXED (#556, deployed) | `buildBuildingPayload` has no write path; post-deploy pg_stat: crawler traffic produced zero listings scans |
| Per-request Neon reads for building pages | ALREADY FIXED (#556) | shared cached accessor + sharded manifest, warm-after-sync |
| Building cache invalidation (old+new address, all writers) | ALREADY FIXED (#556) | `buildingInvalidationTags` at sync/expiration/reconcile/retention/CRM writers |
| Cache-first anonymous public reads (W1) | ALREADY FIXED (#553, merged 2026-07-22) | `lib/cache/public-cache.ts` `cachedPublicRead` |
| ACRIS rows carry per-row provenance | ALREADY FIXED (pre-existing) | `source: 'acris'`, `office: 'NYC ACRIS Public Records'` |
| ACRIS unit fabrication | NOT PRESENT | adapter returns `unit: ''` with an explicit comment that ACRIS deeds don't reliably carry units; no beds/baths/sqft invented on the record itself |
| Public ACRIS closed sales persisted to Neon | NOT PRESENT | adapter is prisma-free; `prisma/schema.prisma` has no ACRIS sale table; only `SellerLead` enrichment (scanner promotion, separate) |
| ACRIS media in R2 | NOT PRESENT | no R2 references in the adapter or scanner |
| Scanner CSVs committed to Git | NOT PRESENT (today) | `git ls-files data/scanner` = 11 files, all fixtures/manifest/compliance config; `data/scanner/.gitignore` blocks `acris-*.csv`, `dof-*.csv`, `pluto-corridor.csv`, `*.ndjson` |
| Scanner snapshot accumulation | NOT PRESENT | ingests are idempotent overwrite-in-place (`dos-corp-ingest.ts:19`, `pluto-ingest.ts:28`); fixed output names, no timestamped copies |
| Scanner raw bulk retention | NOT PRESENT | `refresh-from-soda.ts` streams SODA rows through filters directly into corridor-clipped CSVs; no raw full-dataset files land on disk |
| Scanner uploads to R2 / bulk copy into Neon | NOT PRESENT | no R2 writes; `build-prospects.ts` only READS `prisma.listing` for off-market cross-reference |

## 3. Defects that still exist (each with evidence)

### D1 — Blanket `source: 'idx'` over a payload containing ACRIS — VERIFIED
`lib/buildings/public-building-data.ts:963-967`:
```ts
_compliance: {
  source: 'idx',
  attribution: 'Based on information from the REBNY Listing Service. ...',
```
The same payload's `saleHistory` is, after the public visibility filter,
**ACRIS-only** (MLS closed rows are withheld at lines 883-897). The payload-level
attribution claims REBNY for content that is NYC public-record data. Per-row
`source` fields exist but the blanket statement is wrong exactly as the
directive describes.

### D2 — Mixed-source, mixed-population aggregates — VERIFIED
`public-building-data.ts:907-920`:
- `avgPrice` averages **Cotality active asking prices + ACRIS deed amounts** in
  one number, unlabeled.
- `avgSqft` filters `> 0`, which silently drops every ACRIS row (they are pushed
  with `sqft: 0`, line 870) — so `avgPricePerSqft = avgPrice / avgSqft` divides
  a price population that INCLUDES ACRIS by a sqft population that EXCLUDES it.
- An ACRIS deed can be a **whole-building transfer** (lot `0000` exists in live
  data); its amount enters `avgPrice` beside unit asking prices.
Missing did not remain missing: zeros were used as filter sentinels feeding a
cross-populated ratio.

### D3 — ACRIS bundled inside the Cotality cache identity — VERIFIED
`fetchAcrisSales` runs INSIDE `buildBuildingPayload`, which is cached under
`buildingCacheTag(...)` (Cotality-sync invalidated + 30-min fallback). Effects:
- A material Cotality change re-executes the ACRIS assembly (partially blunted
  by `next: { revalidate: 86400 }` on the two ACRIS fetches — the raw HTTP layer
  is 24-h cached).
- **`lookupBBL`'s Geoclient/Planning Labs fetches have NO caching** — every
  payload rebuild (every sync-invalidation and every 30-min fallback expiry, per
  building) re-hits the external BBL resolvers.
- There is no `building-acris-sales:<bbl>` cache entity; ACRIS results live
  under the Cotality building key. One source-ambiguous cache contract — the
  exact pattern the directive prohibits.
(The reverse direction is safe: nothing ACRIS-side invalidates Cotality tags.)

### D4 — ACRIS record misses required provenance fields — VERIFIED (minor)
`acris-building-sales.ts:116-122`: the returned record keeps document ID
(`acris-<document_id>`), amount, date, `source` — but **not the BBL and not a
retrieval timestamp** (directive items 3.2 and 3.6).

### D5 — BBL resolution ignores an available Cotality BBL — VERIFIED (with new live evidence)
`lookupBBL` goes straight to Geoclient → Planning Labs. Live evidence gathered
for this report:
- Cotality `$metadata` (live, cached 0 min): `TaxBlock`, `TaxLot`,
  `ParcelNumber`, `UniversalParcelId` exist on Property.
- `data/rebny-rls-property-fields.csv`: all four are **IDX Plus permitted**;
  `TaxBlock`/`TaxLot` are already in `lib/idx/trestle-mapper.ts:221`.
- Read-only Neon census (operational copy of the live feed):
  **9,809 / 9,810** active-family listings have `features.TaxBlock`;
  **9,806 / 9,810** have `features.TaxLot`; sampled values are already
  zero-padded BBL components (`block 01118`, `lot 0029`) with `CountyOrParish`
  giving the borough digit (fixed NYC civic mapping, not inference).
- Caveat found in the same sample: `lot = "0000"` occurs (placeholder /
  building-wide) — a Cotality-first implementation must treat `0000`/empty as
  unusable and fall back to the resolver, and must validate the borough-digit
  mapping in tests.
So the directive's priority 1 (verified Cotality BBL) is implementable today;
the resolvers correctly remain as fallback (they are NOT used as fact sources
anywhere — checked).

### D6 — Zero-filled ACRIS beds/baths/sqft rows shipped in the payload — VERIFIED
`public-building-data.ts:868-870` pushes `beds: 0, baths: 0, sqft: 0` instead of
null/absent. Besides feeding D2, any consumer rendering these as "0 beds" would
present fabricated data. Missing must remain missing (null, not 0).

### D7 — Geocode: duplicate PrismaClient + request-time public writes — VERIFIED (fix exists only in open draft #555)
`lib/geo/geocode.ts:21` (`new PrismaClient()` second client) and `:215/:239`
(fire-and-forget `geocodeCache.upsert` on public request paths). This is the
measured residual Neon wake source after #556 (~1 geocode_cache access/min in
the post-deploy pg_stat delta).

### D8 — No unchanged-row write suppression on main — VERIFIED
`lib/idx/sync.ts` and `lib/idx/media-sync.ts` contain no compare-before-write /
skip-unchanged logic (grep: 0 markers). The fixes are open drafts: #530 (N1
listing_media), #535 (N2 listing/projection/summary). #533 (N3 single bounded
backlog fetch per run) is likewise open, not merged. Every sync cycle still
rewrites unchanged rows and rescans the backlog per chunk.

### D9 — R2 mutable, order-based object keys — VERIFIED
`lib/media/media-sync-service.ts:139-147`: key =
`{namespace}/{listingId}/{order}` (mediaType-namespaced). `Order` shifts when a
gallery reorders → the same key is overwritten by a different image. The
immutable `MediaKey+sourceRevision` key design exists only in open draft #544
(Phases 1-2, flag-gated).

### D10 — `existsInR2` treats every error as "object missing" — VERIFIED
`lib/images/r2.ts:115-124`: `catch { return false; }` — permission, timeout, and
service errors are indistinguishable from absence. Consumers
(`lib/idx/media-sync.ts`, `lib/idx/sync.ts`, `lib/media/media-sync-service.ts`,
`lib/images/cache-listing-photos.ts`) can re-upload or mis-decide on transient
errors. This is the exact defect class the directive names.

### D11 — Unlimited third-party gallery mirroring — VERIFIED
Main mirrors entire feed galleries with no admission policy; the policy is open
draft #534, which Maya has separately rejected AS WRITTEN (hero-only would
violate "preserve ALL seller media" from the unified-system spec). Admission
control remains undecided + unmerged either way.

### D12 — Scanner serving path depends on committing generated JSON — VERIFIED (design defect, dormant today)
`/api/crm/scanner/prospects` reads `data/scanner/scored-prospects.json` from the
**deployed repo filesystem**, and `data/scanner/.gitignore`'s `!*.json`
allow-list would re-include that generated file if ever committed. Today it is
NOT committed (verified) — which also means the deployed endpoint always serves
an empty queue. Either outcome is wrong: commit it and generated prospect data
enters Git (prohibited); don't and the production endpoint is dead. The serving
path needs to move off Git-committed generated data.

### D13 — CRM promotion keeps no ACRIS document provenance — VERIFIED
`prisma/schema.prisma` `SellerLead`: keeps derived enrichment
(`last_purchase_price/date`, `entity_*`, `ownership_years`) but has **no ACRIS
document-id or retrieval-date columns** ("keep source document identifiers and
retrieval dates" on promotion). `pitch_data Json?` may informally hold some of
this — not a contract.

### D15 — Consumer-facing surfaces present ACRIS transfers as verified sales — VERIFIED (added in rev 2; the most serious public-facing defect)
The API attribution problem (D1) reaches consumers, SEO, and marketing copy:
- `app/components/BuildingUnits.tsx` (listing pages): sections titled
  **"Building Sales History"** / **"Sales History for …"**, empty state
  **"No recent sales found…"**, ACRIS amounts under a **"Price"** column, and
  a **"Sold"** row label — with only a small ACRIS tag.
- `app/buildings/[slug]/page.tsx` (building pages): **"Sales History"**
  section, **"Sale Price"** column, **"Recent Sales"** stat chip; SEO
  title **"Units, Sales History & Amenities"** and descriptions advertising
  "recent sales", "price history", "sales history and market data"; rows not
  visibly distinguished as ACRIS public records.
- `app/building/page.tsx` (legacy building page): same section/column/empty
  state wording; metadata "sales history".
- **Seller solicitation CTA** (`app/buildings/[slug]/page.tsx:651-652`):
  *"With X recent sales on record… an average sale price of …"* — derived
  from the ACRIS-influenced `totalSales`/`avgPrice`. An ambiguous deed amount
  must not tell an owner what units sold for. BLOCKER.
Required public language (Maya): **Recorded Transfers · NYC Property
Records · Recorded Amount · Recorded Date · Source: NYC ACRIS** — never
"sale/sold/closing price/recent sales/average sale price/$-per-sqft" without
a separately verified unit-level match.

### D14 — Retention windows exist only as code defaults, undocumented — VERIFIED
Current behavior (report-first, per directive — no replacements chosen here):
- Distress/seller-intent window: **730 days** default
  (`lib/scanner/acris-filter.ts:139`, overridable `--window-days`).
- Deed-history window: **50 years** default
  (`scripts/scanner/acris-deed-history-ingest.ts:52`, `--window-years`).
- Corridor clip: Manhattan luxury corridor BBL whitelist.
- Lifecycle: overwrite-in-place on re-run; no scheduled expiry/deletion job; no
  documented product/compliance rationale for either window.

## 4. Exact files and functions involved

| Concern | File : function |
|---|---|
| Payload assembly, attribution, aggregates | `lib/buildings/public-building-data.ts` : `buildBuildingPayload`, `getBuildingDataCached` |
| ACRIS adapter | `lib/buildings/acris-building-sales.ts` : `lookupBBL`, `fetchAcrisSales`, `isDuplicate` |
| Cache identity | `lib/cache/public-cache.ts` : `buildingCacheTag`, `cachedPublicRead` |
| Geocode writes / 2nd client | `lib/geo/geocode.ts` (:21, :215, :239) |
| Sync write suppression | `lib/idx/sync.ts`, `lib/idx/media-sync.ts` |
| R2 keys / exists / upload | `lib/media/media-sync-service.ts` : `buildMediaR2Key`; `lib/images/r2.ts` : `existsInR2`, `uploadToR2`, `keyFromUrl` |
| Scanner windows | `lib/scanner/acris-filter.ts` : `isWatchedMasterRow`, `emptyDeedHistoryStats`; `scripts/scanner/acris-deed-history-ingest.ts`; `scripts/scanner/refresh-from-soda.ts` |
| Scanner serving | `app/api/crm/scanner/prospects/route.ts`; `data/scanner/.gitignore` |
| CRM promotion | `prisma/schema.prisma` : `SellerLead` |

## 4-bis. Complete public-consumer inventory (rev 2)

Every surface the implementation PR must correct (data contract AND displayed
phrases): 1. `app/components/BuildingUnits.tsx` · 2. `app/buildings/[slug]/
page.tsx` · 3. building-page metadata + Open Graph text · 4. the stats bar ·
5. the seller CTA · 6. empty-state wording · 7. API response attribution
(`/api/buildings` payload + legacy `/api/listings/building`) · 8.
`IDXDisclaimer` placement (unchanged — REBNY disclaimer stays for Cotality
layers) · 9. the legacy `/building` page (`app/building/page.tsx`).

## 5–7. Direct answers

**5. Are public ACRIS closed sales persisted anywhere?** Narrow claim (rev 2):
**public building-page ACRIS transfer results are not persisted to Neon or R2
by the current public adapter** — they exist only inside the cached building
payload (itself the D3 problem) and the 24-h HTTP data cache. The separate
prospecting scanner DOES deliberately write ACRIS-derived CSV snapshots and
manifests to `data/scanner/` (gitignored, overwrite-in-place) — that is its
approved design, covered in §2/§7.

**6. Are scanner outputs committed / uploaded / accumulating?** NOT PRESENT
today (see §2), with the D12 design trap noted.

**7. Retention behavior per ACRIS workflow:** public adapter — no retention
(nothing stored; 24-h HTTP cache); prospecting scanner — 730-day distress /
50-year deed windows, overwrite-in-place, no expiry job, undocumented (D14);
CRM promotion — indefinite business-record retention (correct per directive),
missing provenance fields (D13).

## 8. Current cache boundaries

| Cache | Identity | Invalidation | Owner |
|---|---|---|---|
| Building payload (incl. ACRIS!) | `building:{num}:{street}:{zip}` | Cotality sync (exact tag) + 30-min fallback | Cotality — **wrongly also carries ACRIS (D3)** |
| Manifest shards | `building-manifest` tag | sync + warm | Cotality |
| Search/listing/detail | `search`, `listing:{id}` | sync | Cotality |
| ACRIS raw fetches | Next HTTP data cache | 24-h time-based | ACRIS (fetch-level only — no named cache entity) |
| BBL resolution | **none** | — | — (D3) |

## 9–10. Attribution + aggregate defects
D1 (blanket `source:'idx'`), D2 (mixed averages), D6 (zero-fill). Row-level
provenance is intact and must be preserved through any fix.

## 11. Recommended implementation sequence (each its own approved PR)

1. **PR-A (payload correctness, no infra):** split the payload into explicit
   `building` + `activeUnits` (Cotality) and `closedSales.acris` layers (keeping
   `saleHistory` as a compatibility alias if consumers require it); ACRIS rows
   gain `bbl` + `retrievedAt`, beds/baths/sqft become `null`; `_compliance`
   becomes per-layer (REBNY attribution for listing layers, "NYC ACRIS public
   records" for closed sales, derived-stats note); stats split into
   `stats.active` (Cotality-only: avgAskingPrice, avgSqft, pricePerSqft from
   rows that have BOTH price and sqft) and `stats.acrisClosedSales`
   (count, medianDeedAmount, explicitly labeled; no $/sqft — ACRIS has no sqft).
   No cross-source average survives unlabeled.
2. **PR-B (cache separation):** ACRIS block moves behind its own
   `unstable_cache` entity `building-acris-sales:<bbl>` (24-h revalidate,
   independent error handling, never sync-invalidated); `lookupBBL` result
   cached under `building-bbl:<canonical-building-key>` (long TTL — BBLs are
   stable); Cotality payload cache no longer embeds ACRIS execution. Page
   assembles the two cached results.
3. **PR-C (Cotality-first BBL):** derive BBL from `CountyOrParish` borough digit
   + `features.TaxBlock`/`TaxLot` (reject `0000`/malformed lots → resolver
   fallback → no ACRIS on failure; never synthesized). Evidence in D5.
4. **Existing open PRs (Maya's queue, unchanged by this report):** #555
   (geocode client + writes, D7), #530/#535/#533 (write suppression + bounded
   backlog, D8), #534 (admission policy — needs rework per the
   preserve-all-seller-media ruling, D11), #544 (versioned keys, D9).
5. **PR-D (R2 error semantics):** `existsInR2` returns a three-state result
   (exists / missing / error) or throws on non-404; consumers fail closed (D10).
6. **PR-E (scanner hygiene):** move prospect serving off committed files
   (private R2-equivalent store, Neon table with bounded row count, or
   build-time artifact — decision needed); tighten `data/scanner/.gitignore`
   (replace `!*.json` with explicit manifest allow-list); add
   `scored-prospects.json`/`build-prospects-manifest.json` to ignore; add
   `acris_document_id` + `source_retrieved_at` to SellerLead promotion (D13);
   write `docs/compliance/scanner-retention-policy.md` documenting the 730-day /
   50-year windows with product+compliance rationale, or proposing replacements
   for separate approval (D14).

## 12. Tests required
- Payload: layer-split shape pins; ACRIS rows carry bbl/retrievedAt/null
  beds-baths-sqft; `_compliance` per-layer attribution; stats never mix sources
  (failing-first against current mixed output); whole-building deed does not
  enter unit statistics; parity harness updated for the split (or compatibility
  alias proven byte-stable).
- Cache: Cotality tag revalidation does NOT re-execute ACRIS fetch (spy);
  ACRIS expiry does NOT touch Cotality entries; BBL cache hit path.
- BBL: county→borough digit table; `0000` lot rejection → resolver fallback →
  empty history on total failure; never-synthesized guarantee.
- R2: existsInR2 error ≠ missing (mock 403/timeout); key immutability once
  #544's identity lands.
- Scanner: gitignore pins (generated names ignored); promotion provenance
  fields present.

## 13. Migration / cleanup / rollback
- PR-A/B/C/D: no schema migration, no data cleanup, no cron changes; rollback =
  revert (payload alias keeps consumers stable).
- PR-E SellerLead provenance columns: additive migration → NEON.md procedure +
  Maya approval (HELD until then).
- All storage deletion levers (raw_data strip, audit prune, R2 deletion
  campaigns, ARCHIVE_ENABLED) remain SEPARATE, each requiring measured
  before/after evidence + approved rollback plan; none are part of this
  sequence, and none run during the #556 measurement window.

## 14. Cannot be proven with available access
- **R2 object count / bytes / operation counts / growth** — REQUIRES LIVE
  ACCESS (R2 credentials live only in Vercel env; `listR2ObjectKeys()` exists
  for a read-only inventory when run where creds exist).
- **R2 preview-vs-production credential separation** — REQUIRES LIVE ACCESS
  (Vercel env scoping view). Known partial: Prisma's bare `DATABASE_URL` is
  Production-only (preview deployments proved DB-less on 2026-07-23), so
  preview cannot reach production Neon via the app path; the `database_*`
  integration vars visible in All Environments are not read by Prisma (NEON.md).
- **Live Cotality TaxBlock/TaxLot population** was proven from the synced
  operational copy (9,809/9,810) — a direct live-feed probe would only
  re-confirm; available on request as one bounded query.
- **WAL activity / dead-tuple trend over time** — needs the scheduled T+24h /
  T+72h measurement points already armed for the #556 window.
