# Building-Only Neon Wake Correction (2026-07-23)

**Branch:** `fix/building-neon-wake-2026-07-23` (base: main `c4ade4bd`). **DRAFT — nothing merged or deployed.**
**Approved scope (Maya):** building-level Neon correction ONLY. Successor to the building portion of PR #555 (which stays open/draft/unmodified); auth/sitemap/geocode/settings/watermark work is explicitly excluded and lives only on #555.
**Authority:** Cotality API = sole listing/media truth → One Cycle sync → Neon operational copy → this cached read → visitors. All three building-payload layers preserved: Neon manifest (incl. SL-/RL- CRM exclusives) + live Cotality/Trestle + ACRIS.

## Root cause (measured on production)

Distinct crawler-walked building slugs — 121 `/api/buildings` + 179 building-page executions/6h, each a cache MISS → `prisma.listing.findMany` ~every 3 minutes — alone enough to defeat the 5-minute autosuspend. The page additionally ran an internal HTTP hop to its own API (two executions per view), and the public GET carried a dormant fire-and-forget building upsert (production-proven never-fired: buildings/building_units 0 rows, 0 writes ever).

## The correction

1. **One shared accessor** — `getBuildingDataCached()` in `lib/buildings/public-building-data.ts` serves the route, the page, AND generateMetadata (no internal HTTP; assembly moved verbatim).
2. **Pure read** — the dormant `upsertBuildingFromRecords` call is removed from the public GET; a public request can never write building rows. Sync-workflow ownership only (`lib/buildings/upsert.ts` retained for that future owner).
3. **Canonical cache identity** — `building:{num}:{canonical-street}:{zip}`; street-name canonicalization (direction/suffix stripping) collapses link-side, stored-raw, and sync-side derivations into ONE tag; `buildingName` is display-only and applied POST-cache (variants share one entry).
4. **Exact invalidation** — sync derives BOTH the previous and the new building tag (buildingInvalidationTags(existing.address, mapped.address)) at all three mapped listing-change sites; only materially changed buildings expire — and an address correction expires both buildings in one cycle. Per-building entries carry NO coarse tag; a `search` bump expires zero building payloads (test-proven). Media-JSON-only changes ride the 30-min fallback window.
5. **Bounded manifest** — the Neon layer is a manifest sharded by street-number first character (production census: shards 1–9; largest 4,473 rows; worst-shard EXPLAIN: seq scan 55.4 ms). A crawl of ANY number of distinct buildings performs ≤ ~10 bounded queries per sync window — never one per building.
6. **Manifest completeness (structural)** — deterministic keyset pagination (5,000/page, `listing_id` cursor) runs to exhaustion; no fixed take can truncate. Past the explicit 100k/shard ceiling the build THROWS, and that OVERFLOW **propagates** (explicit failure — never a successful DB-truncated payload). Transient DB errors keep the PRE-EXISTING production degrade (page continues on the live Cotality/ACRIS layers).
7. **Wake clustering** — immediately after a FULLY SUCCESSFUL idx-sync (errors === 0), AFTER the SyncState upsert commits, the sync warms all shards while the compute is already awake (`warmBuildingManifestShards`, ~0.5 s total from production EXPLAIN timings). Counters (`shards_warmed/shards_failed/duration_ms`) are recorded on the sync result (`write_paths.building_manifest_warm`). Best-effort by construction: failures are counted, never thrown — feed state is already committed and cannot be advanced, blocked, or corrupted. Unchanged run → every warm call is a cache hit (zero Neon). Cron schedule untouched.

## Writer invalidation contract (round 2)

Every writer that can change building-visible inventory revalidates the EXACT building tag(s), with BOTH the previous and new tags on an address change (shared helper buildingInvalidationTags in lib/cache/public-cache.ts — null-safe, deduplicating, masked-address-proof):

| Writer | Coverage |
|---|---|
| idx-sync (incremental) | old+new tags at listing-upsert + projection sites (existing row's address is in LISTING_SYNC_COMPARE_SELECT) |
| agent-history sync (= sync.ts full-sync path) | old+new tags at the clock site; flushed by its own safeRevalidateTags |
| listing-expiration cron | expired exclusive → its building tag + search |
| feed-reconcile cron | ghost withdrawal (address added to the ourActive select) AND orphan recovery (raw Trestle record atoms) → building tag + search |
| data-retention display removal | every stale-closed listing (address added to select) → building tags + search |
| CRM PATCH | old+new address tags (existingAddress vs updated.address) + search |
| CRM soft-withdraw DELETE + status change | building tag + search |
| dom-reset | PROVEN N/A — its only listing write is days_on_market/first_active_date (building-invisible; test-pinned) |
| media writers (media-sync summary, CRM media routes, sync batch-media) | thumbnail-class only — no inventory fields; bounded by the 30-min fallback + the next sync's search-driven manifest refresh (documented) |

All non-sync writers already bump SEARCH_CACHE_TAG, which the manifest shards also carry — so the manifest refreshes with the payload. Proof: A→B behavioral through real syncListings (both tags in one cycle); unchanged run = ZERO revalidations; cache-level eviction test (listing removed from ITS building payload while an unrelated building in the SAME shard stays cached, zero re-assembly); per-writer source pins. Red proof: 8 failures across 3 suites against pre-round code.

## Maya-directed display correction (2026-07-23, mid-review)

Unit cards must show the OWNERSHIP form — Condo / Co-op / Condop — never raw 'Apartment' for ownership units. The Trestle-sourced card path now routes through the canonical mapPropertyTypeToDisplay (CommonInterest-first), matching what the DB-sourced path already did; genuine rentals (no ownership form) keep 'Apartment' via the old value as fallback. This is the ONE deliberate payload divergence from production; the parity harness strips exactly this field from deep-equal and pins the new mapping explicitly (sale/coming-soon → Condo; rental → Apartment).

## Proof

- **Payload parity** (`building-payload-parity.test.ts`, 7/7): the EXACT production route (frozen from main `c4ade4bd` as `tests/fixtures/legacy-buildings-route-c4ade4bd.ts`) vs the new accessor — **full-JSON equality**, plus explicit field classes (listing IDs, sale/rental/coming-soon classification, counts, prices, photos incl. never-floorplan-hero, name/address, facts, amenities, pet policy, ACRIS-only public sale history, VOW withholding + gatedRecordsCount, compliance attribution, metadata-driving fields) and identical null/error behavior (Neon down, Cotality down, both down, bn-decoration). All fixtures/mocks — zero production traffic.
- **Distinct-crawl behavior** (`neon-quiet-distinct-buildings.test.ts`, 14/14, tag-aware cache): 100 distinct buildings → ≤10 Neon queries; re-crawl → 0; `search` bump → 0 re-assemblies AND 0 Neon queries; one exact tag → one rebuild + one bounded shard refill; unrelated buildings never invalidated; bn variants → one identity; >5,000-row shard fills completely in exactly two keyset pages; pathological never-short shard → explicit OVERFLOW throw; warm-up fills every shard, second warm = zero queries, post-warm crawl = zero queries, failing shard counted never thrown.
- **Contracts** (`building-neon-wake-contracts.test.ts`, 12/12): thin pure-read route, direct page accessor, zero writes, no app-path upsert calls, warm wired after upsert under `errors === 0`.
- **Red proof:** round 1 — all three suites fail against main (25/25 after); round 2 — 8 invalidation tests fail against pre-round code (31/31 after).
- W1 revalidation suite updated: a materially changed listing now revalidates listing + building + search (3 tags).

## Remaining risks (reported, not hidden)

- **Production-data manifest parity** is fixture-proven, not production-proven: whether the shard manifest yields exactly the rows the old per-building SQL yielded for every REAL building needs real data. Preview `DATABASE_URL` was REFUSED, so the one remaining question is: *"on production rows, does `manifest-filter(shard) ∩ building-match` equal the legacy per-building query for all ~16k gated rows?"* Proposal (NOT created): a separately-approved isolated read-only Neon branch, one bounded SQL comparison, then delete the branch.
- Preview browser checks run without a DB (env design): the Neon manifest layer silently degrades there, so preview pages exercise the Trestle+ACRIS layers only; CRM-exclusive rendering on preview cannot be shown (covered by the fixture parity instead).
- Shard fills remain a seq scan (no expression index — not applied; needs approval). At ≤10×55 ms per sync window this is small.
- Production CU reduction is NOT proven until deployed and measured (slope + suspension gaps).
