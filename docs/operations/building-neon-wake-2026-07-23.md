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
4. **Exact invalidation** — sync derives `buildingTagFromAddress(mapped.address)` at all three mapped listing-change sites; only materially changed buildings expire. Per-building entries carry NO coarse tag; a `search` bump expires zero building payloads (test-proven). Media-JSON-only changes ride the 30-min fallback window.
5. **Bounded manifest** — the Neon layer is a manifest sharded by street-number first character (production census: shards 1–9; largest 4,473 rows; worst-shard EXPLAIN: seq scan 55.4 ms). A crawl of ANY number of distinct buildings performs ≤ ~10 bounded queries per sync window — never one per building.
6. **Manifest completeness (structural)** — deterministic keyset pagination (5,000/page, `listing_id` cursor) runs to exhaustion; no fixed take can truncate. Past the explicit 100k/shard ceiling the build THROWS, and that OVERFLOW **propagates** (explicit failure — never a successful DB-truncated payload). Transient DB errors keep the PRE-EXISTING production degrade (page continues on the live Cotality/ACRIS layers).
7. **Wake clustering** — immediately after a FULLY SUCCESSFUL idx-sync (errors === 0), AFTER the SyncState upsert commits, the sync warms all shards while the compute is already awake (`warmBuildingManifestShards`, ~0.5 s total from production EXPLAIN timings). Counters (`shards_warmed/shards_failed/duration_ms`) are recorded on the sync result (`write_paths.building_manifest_warm`). Best-effort by construction: failures are counted, never thrown — feed state is already committed and cannot be advanced, blocked, or corrupted. Unchanged run → every warm call is a cache hit (zero Neon). Cron schedule untouched.

## Proof

- **Payload parity** (`building-payload-parity.test.ts`, 7/7): the EXACT production route (frozen from main `c4ade4bd` as `tests/fixtures/legacy-buildings-route-c4ade4bd.ts`) vs the new accessor — **full-JSON equality**, plus explicit field classes (listing IDs, sale/rental/coming-soon classification, counts, prices, photos incl. never-floorplan-hero, name/address, facts, amenities, pet policy, ACRIS-only public sale history, VOW withholding + gatedRecordsCount, compliance attribution, metadata-driving fields) and identical null/error behavior (Neon down, Cotality down, both down, bn-decoration). All fixtures/mocks — zero production traffic.
- **Distinct-crawl behavior** (`neon-quiet-distinct-buildings.test.ts`, 13/13, tag-aware cache): 100 distinct buildings → ≤10 Neon queries; re-crawl → 0; `search` bump → 0 re-assemblies AND 0 Neon queries; one exact tag → one rebuild + one bounded shard refill; unrelated buildings never invalidated; bn variants → one identity; >5,000-row shard fills completely in exactly two keyset pages; pathological never-short shard → explicit OVERFLOW throw; warm-up fills every shard, second warm = zero queries, post-warm crawl = zero queries, failing shard counted never thrown.
- **Contracts** (`building-neon-wake-contracts.test.ts`, 5/5): thin pure-read route, direct page accessor, zero writes, no app-path upsert calls, warm wired after upsert under `errors === 0`.
- **Red proof:** all three suites against main's code → 3 suites fail; restored → 25/25.
- W1 revalidation suite updated: a materially changed listing now revalidates listing + building + search (3 tags).

## Remaining risks (reported, not hidden)

- **Production-data manifest parity** is fixture-proven, not production-proven: whether the shard manifest yields exactly the rows the old per-building SQL yielded for every REAL building needs real data. Preview `DATABASE_URL` was REFUSED, so the one remaining question is: *"on production rows, does `manifest-filter(shard) ∩ building-match` equal the legacy per-building query for all ~16k gated rows?"* Proposal (NOT created): a separately-approved isolated read-only Neon branch, one bounded SQL comparison, then delete the branch.
- Preview browser checks run without a DB (env design): the Neon manifest layer silently degrades there, so preview pages exercise the Trestle+ACRIS layers only; CRM-exclusive rendering on preview cannot be shown (covered by the fixture parity instead).
- Shard fills remain a seq scan (no expression index — not applied; needs approval). At ≤10×55 ms per sync window this is small.
- Production CU reduction is NOT proven until deployed and measured (slope + suspension gaps).
