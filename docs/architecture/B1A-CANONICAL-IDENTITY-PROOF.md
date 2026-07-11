# B1a — Canonical Identity Proof (read-only)

> **Status: READ-ONLY INVESTIGATION. NO schema, NO migration, NO backfill, NO permanent links, NO production writes, NO supplemental ingestion.** This document measures whether Mallan can safely resolve current records into canonical property/building/unit/listing identities, and proposes a B1b design. **B1b remains separately approval-gated.** External-inventory and syndication holds remain in force.
> Governing architecture: `docs/architecture/SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` (Lane B). Machine-readable aggregates: `docs/architecture/b1a-identity-metrics.json`.

## 1. Executive conclusion

**Recommendation: CONDITIONAL GO for B1b.**

Address-derived canonical identity is highly feasible **today**: **97.6%** of the 22,472 listings resolve cleanly to a canonical property/building (+unit where applicable) from stored address data alone, with **0 hard normalization failures** and a small, well-characterized review tail (**~531 records, 2.4%**). `listing_id` is a clean 1:1 source key (0 duplicates).

**But three of the strongest identity signals are entirely unavailable in current data** and must be added by a Cotality **enrichment sync** before they can be used: **BBL (0% coverage)**, **geolocation (0% — lat/long empty everywhere)**, and **Cotality `BuildingKey` (0% synced)**. Additionally the `buildings`/`building_units` tables are **empty (0 rows)**, and the `buildings.building_key` column is an `integer` that is **type-incompatible** with Cotality's `String` `BuildingKey` — it must not be used as a canonical key.

So B1b is GO for **address-based** canonical derivation + relisting linkage, **conditional** on (a) an additive Cotality enrichment sync for ParcelNumber/geo/BuildingKey before enabling those match tiers, (b) queuing the 531 review records rather than auto-linking, and (c) using new surrogate IDs + a nullable **text** BuildingKey reference (never the integer column).

## 2. Data sources and exact snapshot time

- **Snapshot:** 2026-07-10.
- **Database:** canonical production Neon — project `hidden-mountain-87248164`, endpoint `ep-cold-waterfall-adno3ao2`, branch `main` (`br-crimson-frog-adr7g9gt`). Queried **read-only** (Neon MCP, `SELECT`-only, aggregate `COUNT`/`GROUP BY`; no writes, no DDL).
- **Cotality:** live `$metadata` (trestle-fields MCP), read-only metadata verification of identity fields.
- **Repository:** read-only inspection of `origin/main` @ `e5d3396a` (#494).
- **No raw production records were extracted to disk or committed.** All examples are hashed/aggregated (no address, owner, or client data).

## 3. Population counts

| Metric | Count |
|---|---|
| Total listings | **22,472** |
| Public listings (`idx_display_yn`) | 16,586 |
| `listing_search_projection` rows | 22,472 |
| Listings with street + zip + borough | 22,472 (100%) |
| Listings with a unit number | 20,455 (91.0%) |
| Building candidates (distinct street+zip+borough) | 8,816 |
| Unit candidates (unit-applicable) | 19,645 |

## 4. Current identity-model map

- **`listings`** (66 cols): `listing_id` (text, = Cotality `ListingId`/RLS number, **unique, 0 dups**), `mls_id` (sparse, 5.6%), `address` jsonb (PascalCase `StreetNumber`/`StreetName`/`StreetSuffix`/`UnitNumber`), `postal_code`, `borough`, `neighborhood`, `raw_data` jsonb (full Trestle payload).
- **`listing_search_projection`** (35 cols): has `latitude`/`longitude` columns — **both unpopulated (0 rows with geo)**.
- **`buildings`** (84 cols, incl. `building_key int`): **0 rows** (populated only as a side-effect of building-page visits; effectively empty).
- **`building_units`** (15 cols): **0 rows**.
- **No canonical property/building/unit identity model exists today.** There is no `bbl`, no canonical surrogate id, and no cross-source listing linkage.

## 5. Address-normalization findings

- **100% resolvable** to a normalized (street number + street name + suffix) + ZIP + borough key. **0 hard normalization failures.**
- Normalization is achievable purely from `listings.address` + `postal_code` + `borough` (all 100% populated).
- **Residual risk:** normalization is *syntactic* (string), not authority-verified. Aliases (corner addresses, "1-5 Main St" ranges, "Ave" vs "Avenue") can under-merge (a building appearing under two address keys) — a false-**negative**, quantified indirectly by the multi-zip finding (§11).

## 6. BBL findings

- **BBL coverage = 0%.** No `ParcelNumber` is stored in `raw_data` (0/22,472), and there is no BBL column.
- Cotality **does** expose `Property.ParcelNumber` (`String(50)`, nullable) live — the enrichment source — but it is **not synced**. Its record-level format (whether it is a clean 10-digit BBL vs a raw parcel string) was **not** record-verified here (metadata only) and must be validated in B1b before being trusted as BBL.
- **Consequence:** BBL-based matching (hierarchy tier 1) is **impossible today** and is a B1b enrichment prerequisite.

## 7. BuildingKey findings

- `raw_data.BuildingKey` present on **0/22,472** listings.
- `buildings` table **empty (0 rows)** → `building_key`: populated 0, null 0, distinct 0, duplicated 0, truncated/lossy n/a.
- **Type mismatch confirmed:** DB `buildings.building_key` is `integer`; live Cotality `BuildingKey` is `String(≤300)` on Property and `String(≤255, non-null)` on Building. An integer column cannot faithfully hold the string key → **do not use it as canonical identity**; store the Cotality key as nullable **text** in B1b.
- **Consequence:** BuildingKey-based matching (tier 2) is **impossible today** and is a B1b enrichment prerequisite. Question 14 (integer↔string relationship) is **unanswerable from current data** — there are zero populated values to correlate.

## 8. Building-resolution findings

- **8,816 distinct building candidates** from the normalized (street+zip+borough) key (~2.5 listings/building).
- Building resolution via address is strong; the main ambiguity is **197 street+borough combinations that span multiple ZIPs** — long streets crossing ZIP boundaries and/or ZIP data inconsistencies. Because the canonical building key **includes ZIP**, these become distinct candidates (safe), but they prove that **street+borough matching without ZIP is unsafe** (would merge distinct buildings).
- Geospatial confirmation (tiers 4–5) is **unavailable** (geo 0%).

## 9. Unit-resolution findings

- **Unit present on 91.0%** (20,455); **19,645** distinct unit-applicable unit candidates.
- **2,017 listings have no unit**, split by proxy into:
  - **1,943 genuine building/property-only** (no other unit-bearing listing at the same building address) — legitimately unit-less (townhouse/single/land). *Should not have a unit.* (Answers Q5.)
  - **34 "unit-missing"** (a no-unit listing at a building address that also has unit-bearing listings) → likely a dropped unit → **partial** resolution (property/building only).
- **Floor/line are not separately stored** (only `UnitNumber`), so tier-2 unit matching (building + floor/line) is limited; **unit-alias mapping** (PH/2A/Apt/Unit normalization) is needed in B1b.

## 10. Listing and relisting findings

- **`listing_id` is a clean 1:1 source key** — 22,472 distinct, **0 duplicates**; `mls_id` sparse (1,251) with 0 duplicates. **Source-identifier conflicts = 0.**
- Cotality `ListingKey` (`String(20)`, non-null) is the stable listing key; `ListingId` (`String(255)`) is the RLS number our `listing_id` stores. `raw_data.ListingKey` is only sparsely stored (1,217) → B1b should persist `ListingKey` for durable cross-source listing identity.
- **Relisting:** among unit-applicable candidates, **757 unit keys carry >1 listing** (1,567 listings, max 8/unit). Splitting by concurrency:
  - **539 relisting chains** (≤1 currently-active listing at the unit over time) — legitimate re-listings, safely linkable.
  - **218 simultaneous-active** unit keys (>1 currently-public listing at the same unit) — potential true duplicates / sale+rent / co-exclusive → **manual review**.
  - Building-level (no-unit): 78 multi (163 listings), 18 simultaneous-active.

## 11. Collision taxonomy

| Collision type | Reason code | Count |
|---|---|---|
| Address normalization failure | `missing_address`/`invalid_address` | 0 |
| Missing BBL | `missing_bbl` | 22,472 (100%) |
| BBL conflict | `bbl_conflict` | 0 (no BBL data) |
| BuildingKey conflict | `building_key_conflict` | 0 (no data) |
| Street+borough spans multiple ZIPs | (address ambiguity) | 197 |
| Building-level simultaneous-active | `address_collision` | 18 |
| Unit simultaneous-active | `unit_collision` | 218 keys (~497 listings) |
| Unit missing at multi-unit building | `unit_missing` | 34 |
| Multiple building candidates for one listing | `multiple_building_candidates` | 0 |
| Source identifier → multiple entities | `source_identifier_conflict` | 0 |
| Possible relisting | `possible_relisting` | 539 chains |

Anonymized examples (hashed unit key; no address/PII): `520e69a3d762` = 8 listings / 3 statuses over 2026-05-27→28; `edbc0290089b` = 5 listings over 2026-06-05→24 (relisting); `856252272e8b` = 4 listings over 2026-05-05→07-10. Full list in the metrics JSON.

## 12. Resolution-status distribution

| Status | Count | % of 22,472 |
|---|---|---|
| `resolved` (unit) | 19,998 | 89.0% |
| `resolved` (building/property-only) | 1,943 | 8.6% |
| **resolved total** | **21,941** | **97.6%** |
| `partial` (unit-missing) | 34 | 0.15% |
| `ambiguous` (collision) | 497 | 2.2% |
| `unresolved` | 0 | 0.0% |

**Estimated manual-review volume: ~531 (2.4%)** = ambiguous (497) + partial (34). Separately, 539 relisting chains should be surfaced for linkage confirmation but are not blockers.

## 13. Proposed match hierarchy (measured, not assumed)

**Property/building** — usable tiers today marked ✅, blocked ⛔:
1. Exact BBL — ⛔ 0% (enrichment prerequisite)
2. Exact approved Cotality `BuildingKey` — ⛔ 0% synced (enrichment prerequisite)
3. Exact normalized address + borough + **ZIP** — ✅ **primary, 100% available** (ZIP mandatory — see §8)
4. Normalized address + geospatial proximity — ⛔ geo 0%
5. Address aliases + geo confirmation — ⛔ geo 0%
6. Manual review

**Unit:**
1. Canonical building + exact normalized unit — ✅ 91% (collision risk 1.1%)
2. Canonical building + floor/line — ⚠️ limited (floor/line not stored)
3. Address + normalized unit — ✅ (== tier 1)
4. Unit alias mapping — ⚠️ needed (PH/2A/Apt)
5. Manual review

**Listing/relisting:**
1. Exact source `ListingKey`/`ListingId` — ✅ strong (0 dup)
2. Same canonical unit/property + transaction type — ✅ strong (539 chains)
3. Overlapping/sequential listing dates — ✅ strong corroboration
4. Brokerage/agent — weak corroboration only
5. Similar price — weak corroboration only
6. Manual review

**False-positive risks measured:** (a) address-only matching without ZIP would wrongly merge ~197 street cases; (b) simultaneous-active unit keys (218) are ambiguous and must not auto-merge; (c) alias under-merge is a false-negative, not a false-positive. **Tiers 1, 2, 4, 5 (property) cannot be evaluated for false-positive rate because their data does not exist yet.**

## 14. Proposed confidence and review thresholds (evidence-derived)

Derived from observed rates, not arbitrary percentages:
- **Auto-link property/building:** exact normalized street+ZIP+borough with a single candidate. ZIP is **required** (197 multi-zip ambiguities). Observed building-candidate ambiguity within a ZIP: ~0.
- **Auto-link unit:** canonical building + exact normalized unit **AND ≤1 active listing** at that unit key → auto. Covers 89.0%. Observed collision rate gating this: 218/19,645 = **1.1%** simultaneous-active (sent to review, not auto).
- **Auto-link relisting:** same unit key + **non-overlapping** active windows + compatible transaction type → auto-link chain (539). Overlapping active → review.
- **Manual review:** all simultaneous-active collisions (497) + unit-missing (34) = **531**; plus every BBL/geo/BuildingKey-dependent match until enrichment lands.
- **Reject/no-link:** none today (0 unresolved). **No-go:** BBL/geo/BuildingKey auto-matching until enrichment.
- **By property type / unit applicability:** unit tiers apply only to unit-bearing property types (Residential/ResidentialLease apartments, Condominium/Cooperative/Condop); the 1,943 genuine building-only records auto-link at the property/building level with **no** unit requirement.

## 15. Manual-review population estimate

**~531 records (2.4%)** for the initial pass: 497 collision + 34 unit-missing. Plus **539** relisting chains for linkage confirmation (informational, batchable). This is a tractable one-time review queue.

## 16. Known limitations

- **No geo, BBL, or BuildingKey in current data** — the three strongest signals require enrichment before evaluation.
- `ParcelNumber` format **not record-verified** (metadata-only pass) — must be validated live in B1b before treating as BBL.
- Floor/line not separately stored → unit-alias normalization needed.
- `buildings`/`building_units` **empty** → no existing canonical rows to reconcile; identity must be built from listing address derivation.
- "Resolved" here is **address-derived**, not authority-verified (a BBL/BuildingKey cross-check would raise confidence).
- Relisting temporality uses `first_active_date`; full status-history depth is limited.

## 17. Proposed B1b schema (RESERVED — not created here)

Additive-only; **no change** to `listings`/`buildings` existing columns; `building_key` untouched:
- `canonical_property(id, bbl?, normalized_address, borough, zip, latitude?, longitude?, source_refs jsonb, created_at)`
- `canonical_building(id, canonical_property_id?, normalized_street, zip, borough, building_name?, cotality_building_key text?, bbl?, latitude?, longitude?)`
- `canonical_unit(id, canonical_building_id, normalized_unit, floor?, line?)`
- `listing_identity(listing_id, canonical_property_id?, canonical_building_id?, canonical_unit_id?, identity_resolution_status, resolution_reason?, source_record_id, cotality_listing_key text?, relisting_chain_id?)`
- `identity_match_audit(id, listing_id, signal, decided_by, confidence, decided_at)`; `identity_review_queue(id, listing_id, reason_code, state)`
- **Cotality `BuildingKey` stored as nullable TEXT** (never the integer `buildings.building_key`).

## 18. Proposed B1b backfill

1. Compute normalized keys for all 22,472 (already proven 100%).
2. Auto-link the **97.6%** clean set (resolved_unit + genuine building-only) to new surrogate IDs.
3. Queue the **531** review records; do not auto-link.
4. Link the **539** relisting chains via unit key + temporal + transaction type.
5. Leave `bbl`/`latitude`/`longitude`/`cotality_building_key` **NULL** until a separate additive **Cotality enrichment sync** backfills them (ParcelNumber→BBL candidate, Latitude/Longitude, BuildingKey); only then enable tiers 1/2/4/5.
6. Idempotent, resumable, chunked; deterministic (no `Date.now()` in matching).

## 19. Dual-read / dual-write transition

- **Dual-write:** the sync + CRM writers populate both `listings` (unchanged) and `listing_identity` (additive). A listing with no resolved identity simply has no `listing_identity` row (fail-open to current behavior).
- **Dual-read:** readers prefer `listing_identity` when present and `identity_resolution_status='resolved'`, else fall back to today's `listings` behavior. Feature-flagged; **no reader is switched in B1b's first PR** (parity-gated, mirroring A1/PR-5B discipline).

## 20. Rollback plan

- All B1b objects are **additive** and **droppable**; no `listings`/`buildings` column is altered and `building_key` is never written.
- Rollback = disable the flag + (optionally) drop the additive tables; production listing behavior is unaffected because dual-read falls back to `listings`.
- No permanent cross-source links are created without the enrichment + review gates.

## 21. Monitoring and audit requirements

- `identity_match_audit` row per link (signal, confidence, decided_by=auto|reviewer).
- Drift monitor: listings without a `listing_identity` row; resolved-rate over time.
- Collision monitor: new simultaneous-active unit keys (alert if the 218 baseline grows).
- Review-queue size + age; enrichment-coverage gauges (BBL/geo/BuildingKey % once syncing).
- Convergence gate before any reader cutover (mirrors Search Doc V2 §1.3).

## 22. Explicit recommendation

**CONDITIONAL GO for B1b**, conditioned on:
1. B1b ships an **additive Cotality enrichment sync** (ParcelNumber/geo/BuildingKey) **before** enabling BBL/geo/BuildingKey match tiers — those are 0% today.
2. The **531** manual-review records are queued, not auto-linked; the **539** relisting chains are confirmed, not blindly merged.
3. Canonical identity uses **new surrogate IDs + nullable text `BuildingKey`**; the integer `buildings.building_key` is **not** used or written.
4. Address auto-linking always includes **ZIP** (197 multi-zip ambiguities).
5. First B1b PR is schema + backfill **behind a flag with no reader cutover** (parity-gated), consistent with the addendum's B1b gate.

**No-go (until enrichment):** BBL, geospatial, and BuildingKey auto-matching.

---

*B1a is read-only analysis only. No schema, migration, `building_key` change, canonical IDs in production tables, backfill, permanent links, Neon writes, production writes, Cotality-sync change, SourceObservation, supplemental records, or external ingestion were performed. B1b remains separately approval-gated.*
