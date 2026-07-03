# Media System Deep Review — CODE Census (2026-06-10)

> **Status:** read-only code-level review. NO code changes, NO commits, NO DB writes, NO R2 ops.
> Extends (does not duplicate) `docs/audits/media-pipeline-error-diagnosis-2026-06-10.md` (runtime diagnosis),
> `docs/incidents/2026-05-21-chronic-media-sync-root-cause.md` (RC1–RC7 doctrine), and
> `docs/audits/lane-c-ci3-media-backfill-cron-audit-2026-06-10.md` (CI3).
> Every claim below is a **static code-path claim (Class A)** cited file:line, read directly from the working
> tree at commit `0fe39174`. Where a claim would require live-feed or runtime proof it is explicitly marked
> **HYPOTHESIS — needs J.4 verification**. Per CLAUDE.md §F, nothing here asserts runtime behavior beyond what
> the 06-10 diagnosis already proved with probes.

The three storage layers, as referenced throughout:
- **JSON** — legacy `listings.media` JSONB column (items `{url, mediaType, order}` or legacy `{MediaURL, …}`)
- **TABLE** — `listing_media` relational rows (keyed `media_key` @unique, soft-delete `status`)
- **R2** — Cloudflare bucket objects + the TABLE columns `r2_key` / `media_url_cached` that point to them
- Plus two **derived sinks**: `listings.primary_photo_url/photo_count/primary_photo_r2_key/photos_change_timestamp`
  (denorm columns) and `listing_search_projection.media`-derived fields (written, publicly unread — PR 5B HELD).

---

## 1. WRITER CENSUS

18 distinct writer code paths. Trigger key: **C** = cron, **R** = request (user/agent action), **M** = manual script/operator.

| # | Writer | File:line (write site) | Trigger | Layer(s) |
|---|---|---|---|---|
| W1 | idx-sync `syncListings` CREATE | `lib/idx/sync.ts:290-309` (media at 298) | C `*/10` (`vercel.json:13` → `app/api/cron/idx-sync`) | JSON (+projection 384) |
| W2 | idx-sync `syncListings` UPDATE | `lib/idx/sync.ts:332` via `mediaUpdatePatch` (34-42) | C `*/10` | JSON — **RC2-guarded: omits `media` when not fetched** |
| W3 | idx-sync batch-media refill | `lib/idx/sync.ts:434-529` (write 515-518) | C `*/10`, post-loop in same firing | JSON (full replace) |
| W4 | `syncAgentHistory` upsert + its batch-media refill | `lib/idx/sync.ts:1126-1172` (create media 1135; update 1163 RC2-guarded) + refill `1222-1314` (write 1300-1303) | R — `app/api/idx/sync-historical/route.ts:85` (CRM agent-history import) | JSON (+projection 1210) |
| W5 | `backfillEmptyMedia` | `lib/idx/sync.ts:668-830` (write 813-816) | **ORPHANED** — only caller `app/api/cron/media-backfill/route.ts:27`; not in `vercel.json:7-30` since PR #176 | JSON (full replace) |
| W6 | `migrateMediaToR2` | `lib/idx/sync.ts:841-961` (R2 upload 935; JSON rewrite 948-951) | **ORPHANED** — same route, line 32 | JSON + R2 |
| W7 | media-sync `upsertListingMedia` | `lib/idx/media-sync.ts:478-617` (update 539-556, create 559-577, explicit tombstone 583-593, vanished tombstone 595-614) | C `*/15` (`vercel.json:14` → `app/api/cron/media-sync`) | TABLE |
| W8 | media-sync `updateListingMediaSummary` | `lib/idx/media-sync.ts:747-777` (listing.update 766-774) | C `*/15`, per processed listing (`media-sync.ts:1683`) | listings denorm columns (never JSON — 738-740) |
| W9 | media-sync `mirrorMediaToR2` (Phase 3) | `lib/idx/media-sync.ts:972-1146` (success write 1135-1143; failure/cooldown write 1030-1033; 3×404 tombstone 1027-1029) | C `*/15` | TABLE (`r2_key`,`media_url_cached`,`r2_attempts`,`status`) + R2 objects |
| W10 | CRM photo upload | `app/api/crm/listings/[id]/media/upload/route.ts:234-270` (+ R2 variants 172-177; + lazy JSON→rows import 131; + listing `modification_timestamp` bump 274-277) | R (agent/broker, auth + ownership) | TABLE (`crm:` keys) + R2 |
| W11 | CRM delete / set-as-main | `app/api/crm/listings/[id]/media/[mediaId]/route.ts:66-69` (soft-delete), `147-156` (preferred swap), MT bump 74-77/158-161 | R | TABLE (`crm:`-key guarded at :52,:102) |
| W12 | CRM media reorder | `app/api/crm/listings/[id]/media-order/route.ts:61-67`, MT bump 70-73 | R | TABLE — **NO `crm:` guard: can renumber Trestle rows** (where = media_key+listing_id+active only) |
| W13 | Legacy CRM photos route | `app/api/crm/listings/[id]/photos/route.ts:81-87` | R (live, auth-gated) | JSON (append arbitrary URLs; never TABLE, never R2) |
| W14 | data-retention cron | `app/api/cron/data-retention/route.ts:148-153` (T+30d `media: []`) and `:245-253` (T+180d archive `media: []`) | C daily 03:00 (`vercel.json:9`) | JSON eraser — **never touches TABLE or R2** |
| W15 | feed-reconcile orphan create | `app/api/cron/feed-reconcile/route.ts:283-296` (media at 289; fetch uses `$expand=Media` at 261-262) | C daily 03:30 (`vercel.json:11`) | JSON (create only) |
| W16 | CRM reset-sync | `app/api/crm/listings/reset-sync/route.ts:122-168` — **UPDATE branch writes `media: mapped.media` unconditionally at :159 with `expandMedia: false` (:100)** | R (broker tool) | JSON — **RC2 NOT applied → active stomp-to-`[]` path** |
| W17 | `importJsonMediaToRows` | `lib/media/crm-media.ts:117-191` (create 169-185) | R lazily from W10/W11/W12 (upload:131, mediaId:63/128, media-order:55); M bulk via `scripts/migrate-crm-media-to-rows.ts` | TABLE (JSON→rows copier; skips ANY existing media_key incl. deleted — no resurrection, 154-162) |
| W18 | Operator scripts | `scripts/ops/set-listing-primary-photo.mjs:125-137` (CRM-only guard :90-106) · `scripts/dedup-sl0004-media-rows.ts:179-185` (SL-0004 scoped) · `scripts/audit-media-mediatype-corruption.ts:293-296` (`--execute` clears JSON to `[]`) · `scripts/sync-listing-media-r2.ts:101` → `mirrorListingMediaBatch` (`lib/media/media-sync-service.ts:224-330`, R2-only, no DB write) | M (dry-run default) | TABLE / JSON / R2 respectively |

### Per-writer semantics that matter

**W1/W3 (idx-sync).** `useExpandMedia = false` always (`sync.ts:198`); the mapper therefore emits `media: []`
(`trestle-mapper.ts:1112-1132`). CREATE persists that `[]` (the new-listing-starvation driver confirmed in the
06-10 diagnosis §3a). The post-loop refill (W3) re-fetches Media for every record of the batch whose `raw.Media`
is empty — which is **all of them** — and `updateMany`-replaces the whole JSON array with **fresh Cotality URLs**
(`sync.ts:515-518`). Gates: rows failing distribution gates are still stored (flagged `sync_status=gated:*`,
`sync.ts:231-235`) and the refill does NOT exclude them — it fetches/stores media for gated rows too (storage
waste only; the display gate lives in the reader). Tombstone hygiene: refill filter has `MediaStatus ne 'Deleted'`
(`sync.ts:472`). Order semantics: `{url, mediaType, order}` with **preferred encoded as `order:-1`** (`sync.ts:508`).
Silent-failure mode: any non-OK batch response `continue`s (`sync.ts:489`) — the known "refill silently fails"
mode. Key-join hazard: `keyToIdMap.get(key) || key` fallback (`sync.ts:514`) silently no-ops when the
ResourceRecordKey isn't in the map (the 2026-04-24 bug class; fixed in W5 at :792-797 but **not** here).

**W5 (backfillEmptyMedia).** Eligibility: empty/malformed/photo-less JSON OR Trestle PCT > DB
`modification_timestamp` (`sync.ts:696-721`); skips `gated:owner_opt_out`/`gated:participant_only` (:717-718)
but not display-gate columns. Full-replace JSON write. No cursor, no concurrency guard (per CI3 audit). Dormant.

**W7 (upsertListingMedia).** Listing-level gates: `isPropertyComplianceBlocked` (`media-sync.ts:1199-1210`,
REBNY Gates 1/2/3) and status filter Active/AUC/ComingSoon/Pending (`media-sync.ts:1366`). Row-level:
`Permission != 'Public'` skipped (:501-504), `MediaStatus='Deleted'` tombstones (:496-499, 583-593). Order:
stores Trestle `Order` verbatim (`parseOrder` :620-625, default 0) + `preferred_photo_yn` boolean — i.e. the
**table does NOT use the JSON `-1` sentinel**. `tombstoneVanished:true` is set by the orchestrator (:1677) and is
safe only because RC1's full pagination guarantees a complete set (:1429-1450).
⚠️ **The vanished-tombstone where-clause does NOT exclude `crm:` keys** (`media-sync.ts:595-614`:
`{listing_id, status:'active', media_key:{notIn:[...seenKeys]}}`), contradicting the `crm-media.ts:2-7` header
claim that "the Trestle sync never collides with or prunes them" — see Loop L6.

**W9 (mirrorMediaToR2).** Never writes `media_url_original` or JSON (:937-944). RC3 parking at
`r2_attempts >= 8` via `buildR2BacklogWhere` (:851-880); 3×404/410 tombstone (:1012-1029); 6h cooldown (:826).
R2 key deterministic per `(listing_id, media_type, order)` (`buildMediaR2Key`, `media-sync-service.ts:139-154`).

**W10-W12 (CRM).** Write TABLE + R2 only; the legacy JSON is intentionally left intact (upload:273). None of
them call `updateListingMediaSummary` → the denorm columns (`primary_photo_url`, `photo_count`) go stale on every
CRM media action (consumers: `lib/comps/fetch-comps.ts`, `lib/listing-auditor/auditor.ts`). All three bump
`listings.modification_timestamp` — see Loop L8 for why that's a cursor hazard.

**W16 (reset-sync).** The one **un-RC2'd** Trestle-shaped JSON writer: update branch `media: mapped.media`
(`reset-sync/route.ts:159`) with media never expanded (:100) ⇒ every record in the agent's Trestle history
(up to 2,000, :99) gets its JSON stomped to `[]` on each invocation.

### Concurrency matrix (same listing, overlapping writers)

| Pair | Can overlap? | Effect |
|---|---|---|
| W1/W3 (idx-sync, `*/10`) × W7/W8/W9 (media-sync, `*/15`) | Yes — both crons; schedules coincide at :00/:30 | Disjoint columns (JSON vs TABLE/denorms) → no clobber, only row-lock contention + `updated_at` churn. The 06-10 diagnosis additionally proved the media-sync concurrency guard itself can double-fire (runs 7s apart). |
| W7 (tombstoneVanished) × W10-W12 (CRM rows on a Trestle-synced listing) | Yes | **CRM rows tombstoned** when the listing's PCT bumps (Loop L6). |
| W7 (Order refresh) × W12 (CRM reorder of Trestle rows) | Yes | Ping-pong on `order` (Loop L7). |
| W3 (JSON refill w/ Cotality URLs) × W6-history (R2 URLs previously written into JSON) | Yes when listing touched | R2→Trestle URL stomp inside JSON (RC2 mode (a)) — still live because RC2 guarded only the per-record upsert, not the refill. |
| W14 (`media: []` on terminal) × W7/W9 | No practical overlap (statuses disjoint: W7 only syncs 4 active statuses) | TABLE rows + R2 objects of terminal listings are never cleaned — retention is JSON-only. |
| W16 (reset-sync) × everything | Yes (manual) | Mass JSON stomp; W3-equivalent refill does not run in that route at all. |

---

## 2. READER CENSUS

All DB readers share two resolver pipelines: `resolveListingMediaFromRows` (TABLE) and `resolveListingMedia`
(JSON / raw Trestle), both in `lib/media/listing-media-resolver.ts` (table path :466-513, JSON path :316-392).

| Surface | Precedence chain | Cache | Citations |
|---|---|---|---|
| **Search cards / Buy-Rent list — DB-first path** (`/api/listings`) | TABLE(active) → JSON → **live Trestle fill** (1.5s budget, in-memory mutation only) | in-process `setCache` + CDN `s-maxage=60, swr=120` | select `app/api/listings/route.ts:382-395`; DTO swap `lib/idx/db-to-public-dto.ts:329-338`; live fill `route.ts:509-523` → `lib/media/photo-fallback.ts:102-141` |
| **Search list — Trestle-live merge path** (same route, non-DB branch) | **live Trestle Media FIRST** (per-listing, concurrency 5) → TABLE → JSON | same 60s CDN | `route.ts:913-943` (live first), `route.ts:950-995` (DB fallback) — **opposite precedence to the DB-first path** |
| **Detail API** (`/api/listings/[id]`) | raw `$expand`-less Trestle record (`mapRESOToInternal` media — normally empty) → TABLE → JSON → live Trestle | CDN `s-maxage=300` | `app/api/listings/[id]/route.ts:90-153`; mapping `lib/idx/mapping.ts:327-349` |
| **Detail page** (`app/listing/[...slug]`) — gallery AND OG image | DB-first: TABLE(all statuses, resolver filters) → JSON → conditional live Trestle (photos only, merged with existing non-photos) ; DB-miss ⇒ full live Trestle (`rawToDTO` always calls `fetchListingMedia`) | ISR `revalidate = 300` (page.tsx:54) | include `page.tsx:295-316`; chain `page.tsx:469-503`; gate `listing-media-resolver.ts:550-567`; live path `page.tsx:251-262`; OG `page.tsx:851-869` |
| **Agent profile listings** (`/api/agents/[slug]/listings`) | TABLE → JSON (via DTO) → live Trestle batch (Order ≤ 3) with **broken floor-plan filter + hard-coded `mediaType:'Photo'`** | route-level | `route.ts:205-225` (table), `route.ts:293-353` (live; bug at :336 `cat.includes('floor plan')` and :341) |
| **Featured (homepage)** | client → `/api/listings` (DB-first path above) → drops photoless cards client-side, pages deeper to fill | inherits 60s API cache | `app/components/FeaturedListings.tsx:415-444`; `lib/featured/featured-ordering.ts:83-127` |
| **/api/media/batch** (detail-panel galleries) | read-only; same resolver | — | `app/api/media/batch/route.ts:61` (findMany only — no writes) |
| **CRM media GET** | TABLE; read-only JSON *preview* when zero rows ever imported | — | `app/api/crm/listings/[id]/media/route.ts:27-58` ("NO write on GET") |
| **ops:health first-image classifier** | **JSON ONLY** (`media->0->>'url' / 'MediaURL'`) | — | `scripts/ops-health.js:476-517` |
| **Comps / listing auditor** | denorm columns `primary_photo_url`/`photo_count` | — | `lib/comps/fetch-comps.ts`, `lib/listing-auditor/auditor.ts` |
| **Sitemap** | no media read | — | `app/sitemap.ts` (grep: 0 matches) |

### KEY QUESTION — can card vs detail vs OG show different photos for the SAME listing?

**Yes — four concrete divergence mechanisms** (OG vs detail-gallery, however, always agree: both come from the
single `fetchListing` result on the same ISR render, `page.tsx:851` + `:1195`).

1. **Live-fallback nondeterminism frozen into different caches.** For a listing with no TABLE rows and empty
   JSON (8,977 IDX-displayable per the 06-10 diagnosis), the card's photo comes from a 1.5s-budgeted live fetch
   (`photo-fallback.ts:113-139` — whatever finishes inside the race wins) frozen into a 60s CDN entry +
   in-process cache, while the detail page does its own live fetch frozen into a 300s ISR entry. Either can
   succeed while the other timed out ⇒ card placeholder + detail photos, or vice versa, rotating per cache miss.
2. **Opposite precedence on the two list branches.** DB-first branch reads TABLE first; the Trestle-merge branch
   reads live Trestle first and only falls back to TABLE (`route.ts:913` vs `:382`). A listing whose TABLE rows
   are stale (frozen cursor) shows *old* photos on one branch and *current* feed photos on the other.
3. **TABLE-wins-even-when-stale.** Every DB reader prefers TABLE whenever ≥1 active row exists
   (`db-to-public-dto.ts:330-332`), even if the JSON was refilled with *newer* Trestle URLs by W3 minutes ago.
   With the cursor frozen since 05-14, the 3,265 "both"-populated listings can render month-old TABLE photos
   while the JSON (and the live feed) have current ones.
4. **Classifier divergence.** The agent surface labels everything `Photo` and its floor-plan filter never matches
   Trestle's `FloorPlan` enum (`agents/[slug]/listings/route.ts:336,341`), and `mapRESOToInternal` has the same
   with-space bug (`mapping.ts:335`) — so a floor plan can be the hero on an agent card while the detail page
   (canonical resolver, `listing-media-resolver.ts:137-148`) correctly demotes it.

---

## 3. LOOP ANALYSIS — "rolling into itself"

| # | Loop | Status | Mechanics (file:line) |
|---|---|---|---|
| **L1** | media-sync writes TABLE → idx-sync writes JSON `[]` on CREATE → readers see empty → **live fallback re-fetches Trestle at render** → 60s/300s caches freeze a nondeterministic answer → next cache miss re-fetches again | **ACTIVE** | W1 `sync.ts:298`; reader fallback `route.ts:509-523`; frozen cursor starves TABLE (diagnosis §1). Cost: repeated Trestle Media calls for the same ~9K listings on every cache rotation, competing with Phase-3's 480/min ceiling (`media-sync.ts:1319-1328`). |
| **L2** | **Deleted-at-source photo still public (COMPLIANCE).** (a) TABLE path: tombstone happens only when the cursor reaches the listing — frozen cursor ⇒ a REBNY-removed photo keeps serving from `media_url_cached` (R2 mirror) indefinitely for the 11,822 listings past the cursor. (b) JSON path: W6's historical R2-URL rewrites (`sync.ts:948-951`) put R2 copies into JSON with **no tombstone mechanism at all** — `MediaStatus ne 'Deleted'` filters only apply when a refill *runs*; an untouched listing's JSON R2 URL outlives source deletion permanently. (c) Cotality-URL JSON items die "naturally" (proxy 404s) but the entry still renders a broken slot. | **ACTIVE** (bounded by (a) cursor P0 and (b) the pre-05-21 R2-in-JSON cohort) | tombstone paths `media-sync.ts:583-614`, `1027-1029`; no JSON tombstone writer exists anywhere (grep: only full-replace or `[]` writers). The reader that keeps showing it: `db-to-public-dto.ts:332` JSON fallback for listings with no TABLE rows. |
| **L3** | JSON written fresh while TABLE lags (frozen cursor) → "both" rows diverge over time → TABLE-preferring readers serve stale photos | **ACTIVE** until cursor P0 lands; structural cause (TABLE-wins precedence with no freshness check) remains LATENT after | W3 refill `sync.ts:515-518`; precedence `db-to-public-dto.ts:330-332`; freeze evidence diagnosis §1.2 |
| **L4** | Old boundary-cluster cursor trap | **FIXED (RC1)** — keyset continuation `media-sync.ts:1374-1383` + watermark `:340-349`; **new ghost-listing freeze ACTIVE** (P0 queued, out of scope here) | diagnosis §1.3 |
| **L5** | idx-sync UPDATE stomps JSON with `[]` | **FIXED (RC2)** for `syncListings` (:332) and `syncAgentHistory` (:1163) — **but NOT for reset-sync** (`reset-sync/route.ts:159`, manual trigger) and **the W3/W4 refills still replace R2-bearing JSON with Cotality URLs** (RC2 mode (a) survives at `sync.ts:515-518`, `1300-1303`) | LATENT (reset-sync fires on use) / ACTIVE (refill stomp, low-visibility because reader prefers TABLE when rows exist) |
| **L6** | **CRM-row tombstone loop**: agent adds supplemental CRM photo/floorplan to a Trestle-synced listing (W10) → listing's PCT later bumps → media-sync `tombstoneVanished` deletes the `crm:` row (not in feed set) → agent re-uploads → repeat | **LATENT-ACTIVE** (fires whenever a CRM-supplemented IDX listing's media changes upstream; CRM-created SL-/RL- exclusives are safe only because they never appear in the Property feed query) | `media-sync.ts:595-614` (no `crm:` exclusion) vs the design claim `lib/media/crm-media.ts:2-7`; detail-page live fallback then restores Trestle photos (`page.tsx:492-503`) masking the CRM loss |
| **L7** | **Order ping-pong**: CRM media-order route renumbers Trestle rows (no `crm:` guard, `media-order/route.ts:61-67`) → next media-sync pass rewrites Trestle `Order` (`media-sync.ts:549`) → agent's ordering reverts | **LATENT-ACTIVE** (same trigger condition as L6) | also note `scripts/ops/set-listing-primary-photo.mjs:90-106` got this guard right — the route didn't |
| **L8** | **CRM media write → idx-sync cursor jump**: W10/W11/W12 bump `listings.modification_timestamp` (`upload/route.ts:274-277` etc.) on Trestle-synced rows (agent-history rows have `last_synced_from_trestle` set) → `getLastSyncTimestamp` = MAX(MT) over those rows (`sync.ts:1033-1043`) → incremental filter `MT gt NOW-ish` **skips feed records** between the true feed watermark and the local bump | **LATENT** — reintroduces exactly the PR-S.6/S.7 local-clock hazard documented at `sync.ts:963-1031`, via a side door | |
| **L9** | CRM soft-deleted photo resurrected by JSON fallback / live fetch | **FIXED** — all-status include (`page.tsx:296-316`) + `shouldFetchTrestleMediaFallback` (`listing-media-resolver.ts:550-567`); re-upload restore is intentional (`upload/route.ts:228-252`) | Codex media P0 #2/#3, PRs #281/#282 |
| **L10** | retry purgatory (R2 phase 3) | **FIXED (RC3)** — parking `media-sync.ts:839-880`; diagnosis §2 verified working | |
| **L11** | Monitoring loop: ops:health classifies first-image from **JSON only** (`ops-health.js:476-517`) while 1,697 IDX-displayable listings are TABLE-only → "EMPTY media" alarms drive corrective work at the wrong layer (this review cycle itself was partly triggered by that metric) | **ACTIVE** (observability defect, no data harm) | diagnosis Q6e/Q7f confirms 1,690+ such rows |
| **L12** | `scripts/audit-media-mediatype-corruption.ts --execute` clears JSON to `[]` **expecting the media-backfill cron ("every 8 minutes") to repopulate** — that cron has been unscheduled since PR #176 → running it today permanently empties JSON for affected listings | **LATENT** (manual, dry-run default) | `scripts/audit-media-mediatype-corruption.ts:287-296,306` |
| **L13** | feed-reconcile orphan-create fetch uses `$expand=Media` (`feed-reconcile/route.ts:261-262`) although `lib/idx/fetch.ts:32-43` documents Trestle consistently 400-ing `$expand=Media` → if rejected, orphans error out (`:265-268`) and **ghost listings are never imported** → which is precisely the food for the RC1 ghost-freeze (diagnosis §1.3: 3 ghosts "never imported", not archived) | **HYPOTHESIS — needs J.4 live verification** (one cron-log read or a single live OData call; the inner-`$filter` expand form may behave differently than the `$select`-form rejection) | |

**Direct answer to Maya's "does it keep rolling into itself and duplicating":** the system does not meaningfully
*duplicate stored bytes* (diagnosis §4: ~12 dup rows, ~2.8 MB dup JSON, 0 double-mirrored R2 objects). What it
does do is **re-do the same work in circles**: the frozen cursor re-chews one 50-listing window (~50-60K wasted
row updates/day), the live render fallback re-fetches the same photo-less listings on every cache rotation, the
refill/stomp pair rewrites the same JSON arrays, and the CRM↔Trestle tombstone/order loops (L6/L7) undo each
other's writes. The "duplication" is duplicated *effort and divergent truth*, not duplicated storage.

---

## 4. INTEGRATION MISMATCH LIST (Trestle → Neon → R2)

| # | Mismatch | Where | Consequence |
|---|---|---|---|
| I1 | **MediaKey vs no-key JSON** — TABLE is keyed `media_key` @unique; JSON items carry no key at all (`{url, mediaType, order}`, `trestle-mapper.ts:1113-1132`) | both layers | JSON↔TABLE reconciliation can never join on identity; only the URL-stem heuristic `visualIdentity` (`listing-media-resolver.ts:234-251`) exists. Any M4/M1 reconcile must accept fuzzy matching. |
| I2 | **Order semantics** — JSON encodes preferred-photo as sentinel `order: -1` (`mapping.ts:341`, `sync.ts:508,807`, `fetch.ts:547`); TABLE stores raw Trestle `Order` + `preferred_photo_yn` boolean (`media-sync.ts:549-551`). `importJsonMediaToRows` copies the JSON order (−1 included) into the TABLE `order` with `preferred_photo_yn:false` (`crm-media.ts:165,180`) — sentinel leaks across the boundary. | write boundary | hero/ordering can differ between layers for the same listing. |
| I3 | **Trestle `Order` is per-MediaCategory sequential** (`media-sync-service.ts:95-99`): Photo#1 and FloorPlan#1 both have Order=1. `buildMediaR2Key` namespaces by type (:139-154) so cross-type collision is fixed, but **same-type order duplicates** (two photos defaulting to 0 via `parseOrder` `media-sync.ts:620-625` / `Order ?? 0` mapping) still produce one shared `r2_key` for two rows — the diagnosis's 20 shared-key pairs, with possible wrong-image display. | R2 key derivation | bounded (20 pairs), but the key scheme structurally allows it. |
| I4 | **MediaCategory classification — 4 divergent classifiers**: canonical `classifyTrestleMediaCategory` (`media-sync-service.ts:112-137`, handles "floorplan") · resolver `classifyMediaItem` (`listing-media-resolver.ts:115-160`, adds URL-shape heuristics) · **`mapping.ts:335` `cat.includes('floor plan')` — with space — never matches Trestle's `FloorPlan` enum ⇒ FloorPlan classified as Photo (M3 CONFIRMED, still present)** · **`agents/[slug]/listings/route.ts:336` same with-space bug + `:341` hard-codes `mediaType:'Photo'`**. (`fetch.ts:535` checks both forms — OK.) | read mapping | floor-plan heroes on the `/api/listings/[id]` expanded path and on agent cards. |
| I5 | **MediaModificationTimestamp vs ModificationTimestamp vs PhotosChangeTimestamp** — cursor takes the max of both per-row fields (`media-sync.ts:211-221`); summary `photos_change_timestamp` = max over active rows (:712-722); `backfillEmptyMedia` compares Trestle PCT against the *listing* MT with a bare `::timestamp` cast (`sync.ts:710-714`); PCT routinely drifts ahead of MT (18,411-row audit, incident doc §1). | cursors / eligibility | three different "media freshness" clocks that can disagree; the W5 eligibility test mixes feed-clock and row-clock. |
| I6 | **ResourceRecordKey vs ListingId joins** — Media joins on `ResourceRecordKey = Property.ListingKey` (mls_id), but DB rows are keyed `listing_id = Property.ListingId`. W3 still has the `keyToIdMap.get(key) \|\| key` silent-no-op fallback (`sync.ts:514`, also `:1299`) — the exact 2026-04-24 bug class fixed in W5 (:792-797) but not here. `upsertListingMedia` re-parents a row to a new `listing_id` on update (`media-sync.ts:542`) if a MediaKey ever moves. | join layer | silent media loss (0-row updateMany) on key-map misses; no double-insert risk (media_key @unique blocks it — schema-level). |
| I7 | **FK ghosts** — `listing_media.listing_id → listings` FK + feed listings absent locally = insert throws = RC1 ghost freeze (diagnosis §1.3). Code has no "listing missing locally" branch in Phase 1 (`media-sync.ts:1666-1699` catch treats it as ok:false). | TABLE | the queued P0. |
| I8 | **`url` vs `MediaURL` JSON field naming** — both shapes exist in production JSON; readers tolerate both (`listing-media-resolver.ts:127,323`; ops-health COALESCE `ops-health.js:484-505`); writers W1/W3/W5 emit `url`, older raw writers emitted `MediaURL`; W6 rewrites set `url` and `MediaURL: undefined` (`sync.ts:914,938`). | JSON | migration debt; any naive `media->0->>'url'` query undercounts. |
| I9 | **Variant naming (CRM) vs single-URL (Trestle)** — CRM writes `…/{ts}-{hero\|card\|thumb}.webp` triples (`upload/route.ts:174`), TABLE maps hero→`media_url_original`, card→`media_url_cached` (:237-238) — i.e. for CRM rows `media_url_original` is NOT a Trestle source URL; resolver variant heuristics (`listing-media-resolver.ts:175-219`) bridge it. The W9 mirror could in principle select a CRM row (its `r2_key` is set at upload, so the backlog `where` excludes it — only if both `r2_key` and `media_url_cached` are set; upload sets both, OK). | TABLE/R2 | semantic overload of `media_url_original`; safe today but fragile for any future "re-mirror from original" logic. |
| I10 | **Denorm staleness** — `photo_count`/`primary_photo_url` written only by W8 (feed statuses only, frozen cursor) — never by CRM writers, never on retention erase. | denorm columns | comps/auditor read stale values; harmless to public surfaces (PR 5B unread). |

---

## 5. SYSTEMATIC CLEANING PLAN

**Sequencing principles (the rationale):**
- **Close writer loops before reconciling data** — reconciling JSON↔TABLE while reset-sync can stomp JSON,
  media-sync can tombstone CRM rows, and the refill can rewrite URLs would produce a reconciliation that is
  wrong the next time any of those fire.
- **Unfreeze the cursor before any backfill** — M4 writing `listing_media` while Phase 1 re-chews its window
  wastes Trestle quota twice and the catch-up itself fills most of the M4 gap (9,610 listings) for free.
- **Never drop or stop writing JSON until TABLE coverage ≥ JSON coverage on IDX-displayable rows** (today:
  TABLE 4,962 vs JSON 5,193 populated — diagnosis Q7f) **and** every reader fallback + the live render fallback
  are demonstrably idle (ops:health metric, not source-grep).
- **Storage note / correction:** the big Neon lever is NOT the media JSON (~6.1 MB, diagnosis Q7g). The
  ~677-893 MB lever is `listings` raw_data/compliance on historical rows + dead-tuple churn = RC4/archival
  territory (incident doc §4 RC4). M1/PR-10 media-JSON drop is the right *architecture* move but a small
  *storage* move; don't sell it as the cost fix.

### Phase 0 — already queued/approved (not this review's scope)
| Item | Covers | Gate |
|---|---|---|
| P0 ghost-skip cursor fix (`runMediaSync` Phase 1 treats locally-absent listing as resolved skip) | L4-new, I7; unblocks everything downstream | per decision memo 2026-06-08 — **Maya-approved queue** |
| CI3: delete `app/api/cron/media-backfill/route.ts` | removes W5/W6's only trigger | per Lane-C audit §6 — **Maya gate on the PR** |

### Phase 1 — code loop-closures (small, independent, each one PR-sized; ALL touch §D surfaces ⇒ compliance-index read + §G chain + **Maya approval per standing practice**)
1. **reset-sync RC2 patch** — apply `mediaUpdatePatch` at `reset-sync/route.ts:159` (closes L5-manual). One line + test mirroring the existing RC2 test.
2. **`crm:` guard on media-order route** (`media-order/route.ts:61-67`) and **`crm:` exclusion in `tombstoneVanished`** (`media-sync.ts:602-608` add `NOT startsWith 'crm:'`) — closes L6 + L7. The tombstone change is the riskier of the two: add the test "Trestle feed set absent a crm: row ⇒ crm: row survives".
3. **M3 classifier unification** — replace `mapping.ts:335` and `agents/[slug]/listings/route.ts:336,341` with `classifyTrestleMediaCategory`/`classifyMediaItem`. Closes the floor-plan-as-hero divergence (I4).
4. **Retire legacy JSON writers**: delete/410 the photos route (`photos/route.ts:81-87`, W13) and fix the stale `--execute` assumption in `audit-media-mediatype-corruption.ts:287-306` (L12) — either point it at an M4-compatible repair or hard-disable `--execute`.
5. **Stop CRM media routes bumping `modification_timestamp` on Trestle-synced rows** (or bump a different column) — closes L8. Verify first that nothing else (ISR revalidation, CRM edit-load) depends on the bump; if something does, scope the fix to rows with `last_synced_from_trestle IS NOT NULL`.
6. **ops:health table-aware no-image metric** — classify "no usable image" as JSON-empty AND no-active-`listing_media` (closes L11; the diagnosis already wrote the exact SQL). Also surfaces the Phase-3/coverage trend needed to time Phase 3 below.
7. *(Optional, cheap)* normalize the `-1` order sentinel in `importJsonMediaToRows` (I2) and replace the `|| key` silent fallback at `sync.ts:514`/`1299` with the W5-style dual lookup (I6).

### Phase 2 — verification items (read-only, no gate needed beyond probe discipline)
- **L13 check**: confirm whether feed-reconcile's `$expand=Media` orphan fetch succeeds in production (one runtime log read or one live OData call, J.4). If it 400s, fixing it is the *durable* ghost-prevention companion to the P0 cursor fix (P0 makes ghosts non-fatal; this stops manufacturing them).
- After P0 deploys: watch cursor drain to completion (~2.5-3 days per diagnosis §1.4) and Phase-3 backlog → ~0.

### Phase 3 — data cleaning (ALL Maya-gated; run only after Phase 1 items 1-2 are merged and the cursor has drained)
| Item | What | Gate / hold |
|---|---|---|
| **M4 backfill** (residual gap after catch-up) into `listing_media` + W8 denorm recompute | sized by the post-drain ops:health metric, executed via the separately-approved write PRs (PR #364 preview path) | **HELD — M4 program, Maya per-PR** |
| **JSON↔TABLE reconcile + compliance sweep** | for "both"-rows: verify TABLE is a superset/fresher; for JSON-only rows with R2 URLs (W6 cohort): cross-check against live feed `MediaStatus` and purge deleted-at-source entries (closes L2(b), the deleted-photo persistence) | **Maya** (mass JSON writes) |
| **Orphan R2 cleanup** (~8 objects + the 20 shared-r2_key collision pairs + decide terminal-listing R2 retention policy, since W14 never touches R2) | trivial scale; policy decision is the real content | **HELD (R2 ops), Maya** |
| Retire `backfillEmptyMedia`/`migrateMediaToR2` lib functions once M4 lands | M1 prerequisite | **HELD — M1** |

### Phase 4 — architecture convergence (the M1/5B/PR-10 ladder;每 step Maya-gated, in this order only)
1. **M1 writer consolidation** — `listing_media` becomes the sole media writer; idx-sync stops writing `media` even on CREATE (write `[]` only as a typed default, or drop the column write entirely); kill the W3/W4 refills (their job moves to media-sync, which now drains correctly).
2. **PR 5B reader swap** (HELD) — only after M1 + coverage parity; removes the JSON fallback from `db-to-public-dto.ts:329-332` and friends, and retires the render-time live fallback (`photo-fallback.ts`) whose 1.5s Trestle fetches then have nothing left to fill.
3. **PR-10 / JSON column drop** (HELD) — last, after a full release cycle of 5B with the ops:health fallback-usage metric flat at zero. Pair with the RC4 archival work if the goal is the Neon bill (see storage note above).

**Never-do list while loops are open:** no JSON mass-repair via `audit-media-mediatype-corruption --execute`;
no re-scheduling of media-backfill (CI3 option (a), rejected); no reconcile/backfill concurrent with a frozen or
draining cursor; no JSON drop while `photo-fallback.ts` or any `resolveListingMedia(JSON)` call sites remain live.

---

## 6. One-line verdicts

- **Writers:** 18 paths; 6 still write the legacy JSON (W1, W3, W4, W14, W15, W16) — W16 un-RC2'd, W13 a live legacy appender.
- **Conflict pairs:** media-sync↔CRM (tombstone L6, order L7), idx-sync-refill↔R2-in-JSON (L5 residual), CRM-MT-bump↔idx-sync cursor (L8), reset-sync↔everything (L5).
- **Readers:** TABLE→JSON→live everywhere except the Trestle-merge list branch (live-first) and the agent surface (broken classifier). Card/detail CAN disagree; detail/OG cannot.
- **Compliance loop:** yes — a source-deleted photo can keep serving via (a) frozen-cursor TABLE/R2 and (b) tombstone-less R2 URLs inside JSON (L2). Both are bounded and both have a planned closure (P0 + Phase-3 sweep).
- **It "rolls into itself"** in effort and truth, not in storage: same window re-chewed, same photos re-fetched at render, same arrays re-written, CRM and feed writers undoing each other.

*Read-only review by Claude (Fable 5), 2026-06-10. Do not commit without Maya's instruction.*
