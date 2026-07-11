# B1a — Canonical Identity Proof (read-only)

> **Status: READ-ONLY INVESTIGATION. NO schema, NO migration, NO backfill, NO permanent links, NO production writes, NO supplemental ingestion.** This document measures whether Mallan can safely resolve current records into canonical property/building/unit/listing identities, and proposes a B1b design. **B1b remains separately approval-gated.** External-inventory and syndication holds remain in force.
> **Terminology discipline (Rev 2):** this analysis proves **provisional, address-derived candidate grouping** — it does **not** prove authority-verified canonical identity. "Canonical resolved" is reserved for records confirmed by an approved authority signal (BBL / Cotality `BuildingKey` / geospatial) or a validated multi-signal rule. **Authority-verified canonical identities in current data: 0.**
> Governing architecture: `docs/architecture/SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` (Lane B). Machine-readable aggregates: `docs/architecture/b1a-identity-metrics.json`.

## 1. Executive conclusion

**Recommendation: CONDITIONAL GO for B1b DESIGN AND ADDITIVE SCHEMA ONLY.** No production backfill or automatic linking is authorized by this analysis.

The existing data can generate a **strong provisional candidate graph**: **97.6%** of the 22,472 listings can be assigned to provisional address-derived property/building(+unit) candidate groups, with **0 records unkeyable** and a **minimum obvious exception queue of ~531 (2.4%)**. `listing_id` is a clean 1:1 source key (0 duplicates).

**It cannot yet prove canonical identity.** The strongest authority signals are entirely absent from current data: **BBL 0%**, **geolocation 0%**, **Cotality `BuildingKey` 0% synced**. Address normalization here is **syntactic (keyable), not authority-verified**. The `buildings`/`building_units` tables are **empty**, and `buildings.building_key` is an `integer` that is **type-incompatible** with Cotality's `String` `BuildingKey`. **Authority-verified canonical identity count = 0.**

Therefore B1b may proceed to **schema design + enrichment preparation**, but **not** directly to automatic linking or backfill. Address+ZIP+borough is a good **candidate-generation** key, not a proven auto-link rule; the 539 relisting groups are **candidates**, not confirmed chains; the 1,943 unitless records are **likely non-unit-applicable**, not confirmed.

## 2. Data sources and exact snapshot time

- **Snapshot:** 2026-07-10.
- **Database:** canonical production Neon — project `hidden-mountain-87248164`, endpoint `ep-cold-waterfall-adno3ao2`, branch `main` (`br-crimson-frog-adr7g9gt`). Queried **read-only** (Neon MCP, `SELECT`-only, aggregate; no writes, no DDL).
- **Cotality:** live `$metadata` (trestle-fields MCP), **metadata existence only**. See §7 for the explicit distinction between metadata existence and record-level verification.
- **Repository:** read-only inspection of `origin/main` @ `e5d3396a` (#494).
- **No raw production records were extracted to disk or committed.** All examples are hashed/aggregated (no address, owner, or client data).

## 3. Population counts

| Metric | Count |
|---|---|
| Total listings | **22,472** |
| Public listings (`idx_display_yn`) | 16,586 |
| `listing_search_projection` rows | 22,472 |
| Listings **address-keyable** (street+zip+borough populated) | 22,472 (100%) |
| Listings with a unit number | 20,455 (91.0%) |
| Provisional building candidates (distinct street+zip+borough) | 8,816 |
| Provisional unit candidates (unit-applicable) | 19,645 |
| **Authority-verified canonical identities** | **0** |

## 4. Current identity-model map

- **`listings`** (66 cols): `listing_id` (text, = Cotality `ListingId`/RLS number, **unique, 0 dups**), `mls_id` (sparse, 5.6%), `address` jsonb (PascalCase `StreetNumber`/`StreetName`/`StreetSuffix`/`UnitNumber`), `postal_code`, `borough`, `raw_data` jsonb.
- **`listing_search_projection`** (35 cols): `latitude`/`longitude` columns — **both unpopulated (0 rows with geo)**.
- **`buildings`** (84 cols, incl. `building_key int`): **0 rows**. **`building_units`** (15 cols): **0 rows**.
- **No canonical property/building/unit identity model exists today** — no `bbl`, no surrogate id, no cross-source linkage.

## 5. Address-normalization findings

**Accurate statement: 100% were address-keyable using the currently stored street, ZIP, and borough fields.** This is **not** proof of canonical normalization.

The analysis did **not** prove correct handling of:
- Queens **hyphenated** addresses (e.g., `34-36`),
- street **ranges** (`1-5 Main St`),
- **corner-address** alternatives / alternate building entrances,
- **directional** aliases (N/S/E/W vs North/…),
- **suffix** aliases (St/Street, Ave/Avenue),
- **malformed unit** values,
- ZIP/borough correctness.

These are candidate-key construction successes, not validated canonical normalizations. Alias under-merge (one building under two keys) is a false-**negative** risk, partially evidenced by the multi-zip finding (§11).

## 6. BBL findings

- **BBL coverage = 0%.** No `ParcelNumber` stored (0/22,472); no BBL column.
- Cotality exposes `Property.ParcelNumber` (`String(50)`, nullable) **at the metadata level** — a candidate enrichment source — but it is **not synced** and was **not record-verified** here (whether it is a valid 10-digit NYC BBL vs a raw parcel string is **unknown**).
- **Consequence:** BBL matching is impossible today and its suitability is unproven; it is a B1b enrichment prerequisite requiring record-level validation.

## 7. BuildingKey findings

- `raw_data.BuildingKey` present on **0/22,472**.
- `buildings` table **empty** → `building_key`: populated 0, null 0, distinct 0, duplicated 0.
- **Type mismatch confirmed at schema level:** DB `buildings.building_key` is `integer`; Cotality `BuildingKey` is `String(≤300)` (Property) / `String(≤255, non-null)` (Building). **Do not use the integer column as canonical identity.**
- **Consequence:** Question 14 (integer↔string relationship) is **unanswerable from current data** (zero populated values). Cotality `BuildingKey` **population/completeness in live records was not verified** (metadata existence only).

## 8. Building-resolution findings

- **8,816 provisional building candidates** from the normalized (street+zip+borough) key.
- The candidate key is useful for **candidate generation**; it is **not** a proven auto-link rule. It has **not** been validated against BBL, live `BuildingKey`, geospatial evidence, known-good/known-bad samples, alias-address pairs, multi-building complexes, or street-address ranges.
- **197 street+borough combinations span multiple ZIPs** — proving that street+borough matching **without** ZIP is unsafe, and flagging ZIP-boundary / data-quality ambiguity that even the ZIP-inclusive key does not fully resolve.

## 9. Unit-resolution findings

- **Unit present on 91.0%** (20,455); **19,645** provisional unit-applicable candidates.
- **2,017 listings have no unit.** Under the current proxy (a unitless listing whose building address has **no** other unit-bearing listing), **1,943** are **likely non-unit-applicable or unit-unavailable** — **not** confirmed building/property-only. A unit can be absent because the address variant differs, unit parsing failed, the feed omitted it, only one listing is currently stored, the record is an entire building/townhouse, or the property type was mapped incorrectly. **Property type + authority evidence must validate genuine non-applicability.** The remaining **34** are unitless at multi-unit buildings → `partial_candidate`.
- **Floor/line are not separately stored** (only `UnitNumber`) → unit-alias mapping (PH/2A/Apt) needed in B1b.

## 10. Listing and relisting findings

- **`listing_id` is a clean 1:1 source key** — 22,472 distinct, **0 duplicates**; `mls_id` sparse (1,251), 0 dups. **Source-identifier conflicts = 0.**
- Cotality `ListingKey` (`String(20)`, non-null, metadata) is the stable key; `ListingId` (`String(255)`) is the RLS number our `listing_id` stores. `raw_data.ListingKey` is sparsely stored (1,217); the `ListingKey`↔`ListingId` relationship was **not record-verified**.
- **Relisting is a CANDIDATE signal only.** 757 unit keys carry >1 listing (1,567 listings, max 8/unit); **539** have ≤1 currently-active listing. These **539 are "relisting candidates," not confirmed chains** — they could be separate sale/rental events, listings years apart, different ownership periods, duplicate imports, cancelled-then-re-represented listings, sponsor vs resale units, or unrelated marketing events. **218** unit keys are simultaneous-active (review). Building-level: 78 multi, 18 simultaneous-active.

## 11. Collision taxonomy

| Collision type | Reason code | Count |
|---|---|---|
| Address unkeyable | `missing_address`/`invalid_address` | 0 |
| Missing BBL | `missing_bbl` | 22,472 (100%) |
| BBL conflict | `bbl_conflict` | 0 (no BBL data) |
| BuildingKey conflict | `building_key_conflict` | 0 (no data) |
| Street+borough spans multiple ZIPs | (address ambiguity) | 197 |
| Building-level simultaneous-active | `address_collision` | 18 |
| Unit simultaneous-active | `unit_collision` | 218 keys (~497 listings) |
| Unit missing at multi-unit building | `unit_missing` | 34 |
| Multiple building candidates for one listing | `multiple_building_candidates` | 0 |
| Source identifier → multiple entities | `source_identifier_conflict` | 0 |
| Possible relisting (candidate) | `possible_relisting` | 539 |

Anonymized examples (hashed unit key; no address/PII): `520e69a3d762` = 8 listings / 3 statuses over 2026-05-27→28; `edbc0290089b` = 5 listings over 2026-06-05→24; `856252272e8b` = 4 listings over 2026-05-05→07-10. Full list in the metrics JSON.

## 12. Resolution-status distribution (provisional candidate states)

**These are provisional address-derived candidate states, not canonical resolution.**

| State | Count | % of 22,472 |
|---|---|---|
| `provisional_resolved_unit_candidate` | 19,998 | 89.0% |
| `provisional_resolved_building_candidate` | 1,943 | 8.6% |
| **provisional candidate total** | **21,941** | **97.6%** |
| `partial_candidate` (unit-missing) | 34 | 0.15% |
| `ambiguous_candidate` (collision) | 497 | 2.2% |
| `insufficient_identity_evidence` (unkeyable address) | 0 | 0.0% |
| **`insufficient_authority_evidence`** (no BBL/BuildingKey/geo → not authority-verified) | **22,472** | **100%** |

Every record currently lacks an approved authority signal → **0 authority-verified canonical identities**.

## 13. Proposed match hierarchy (measured; candidate-generation vs auto-link)

**Property/building** — availability today:
1. Exact BBL — ⛔ 0% (enrichment + record validation prerequisite)
2. Exact approved Cotality `BuildingKey` — ⛔ 0% synced (enrichment prerequisite)
3. Exact normalized address + borough + **ZIP** — ✅ available as a **candidate-generation** key (100% keyable). **NOT approved for automatic identity linking** until validated (§14).
4. Normalized address + geospatial proximity — ⛔ geo 0%
5. Address aliases + geo confirmation — ⛔ geo 0%
6. Manual review

**Unit:** (1) canonical building + exact normalized unit — candidate, 91%; (2) building + floor/line — limited (not stored); (3) address + unit — == (1); (4) unit alias mapping — needed; (5) manual review.

**Listing/relisting:** (1) exact `ListingKey`/`ListingId` — strong (0 dup); (2) same provisional unit/property + transaction class — candidate; (3) sequential dates — corroboration; (4) brokerage/agent — weak; (5) price — weak; (6) manual review.

**False-positive risks:** address-only without ZIP would merge ~197 street cases; simultaneous-active unit keys (218) must not auto-merge; tiers 1/2/4/5 (property) **cannot be evaluated** because their data does not exist yet.

## 14. Proposed confidence and review thresholds (NOT finalizable yet)

**Thresholds cannot be finalized until a stratified sample is validated against approved authority evidence.** Address+ZIP+borough is downgraded from "auto-link" to **candidate generation**; it must be checked against BBL / live `BuildingKey` / geospatial evidence / known-good samples / known-bad samples / alias-address pairs / multi-building complexes / street ranges before any automatic linking is approved.

**Provisional (to be validated, not enacted):**
- Building candidate: exact normalized street+**ZIP**+borough, single candidate (ZIP mandatory — 197 multi-zip ambiguities).
- Unit candidate: canonical building + exact normalized unit **AND ≤1 active listing** at the unit key (observed simultaneous-active collision rate 218/19,645 = **1.1%** → review, not auto).
- Relisting **candidate** (not chain): requires **all** of — same provisional property/unit; same **transaction class** (sale/rental analyzed **separately**); compatible lifecycle sequence; non-overlapping marketing windows; reasonable temporal interval; no conflicting source identifiers; no simultaneous-active conflict.
- Manual review: simultaneous-active collisions (497) + unit-missing (34) = **531 minimum obvious exception queue** (NOT the complete population — see §15).
- No-go: BBL/geo/`BuildingKey` auto-matching until enrichment **and** record-level validation.

**Required stratified validation sample (for B1b dry-run, anonymized):** Manhattan / Brooklyn / Queens; condos, co-ops, condops, townhouses, multifamily, land, rentals; unit-bearing and unitless; sale and rental; hyphenated Queens addresses; street ranges; multi-ZIP patterns; simultaneous-active unit groups; relisting candidates; address and unit aliases. Each cell validated against approved authority evidence (BBL/BuildingKey/geo/known-good/known-bad) before any threshold is finalized.

## 15. Manual-review population estimate

- **531 = minimum obvious exception queue only** (497 collisions + 34 unit-missing).
- **Additional review not included in 531:** the **539 relisting candidates** (validation or approved batch rules); undetected **address aliases**; the **197 multi-ZIP** street patterns; **unit-alias** variants; and **all records requiring authority confirmation** before any identity backfill (i.e., all 22,472 need authority verification before "canonical resolved").
- **531 is NOT the complete B1b review population.**

## 16. Known limitations

- No geo, BBL, or `BuildingKey` in current data — the three strongest signals require enrichment **and** record-level validation before evaluation.
- Cotality verification here is **metadata existence only** (§7) — not record-level population/format/suitability.
- Floor/line not stored → unit-alias normalization needed.
- `buildings`/`building_units` empty → no existing canonical rows to reconcile.
- "Provisional" grouping is **syntactic string keying**, not authority-verified identity.
- Relisting temporality uses `first_active_date`; status-history depth is limited.

## 17. Proposed B1b schema (RESERVED — not created here; additive-only)

No change to `listings`/`buildings` existing columns; `building_key` untouched:
- `canonical_property(id, bbl?, normalized_address, borough, zip, latitude?, longitude?, source_refs jsonb, created_at)`
- `canonical_building(id, canonical_property_id?, normalized_street, zip, borough, building_name?, cotality_building_key text?, bbl?, latitude?, longitude?)`
- `canonical_unit(id, canonical_building_id, normalized_unit, floor?, line?)`
- `listing_identity(listing_id, canonical_property_id?, canonical_building_id?, canonical_unit_id?, identity_resolution_status, resolution_reason?, source_record_id, cotality_listing_key text?, relisting_chain_id?)`
- `identity_match_audit(...)`, `identity_review_queue(...)`
- Cotality `BuildingKey` stored as nullable **TEXT** (never the integer `buildings.building_key`).

## 18. Proposed B1b backfill (SPLIT; each step separately approved)

The first B1b PR must **not** combine schema and backfill. Sequence:
- **B1b-1:** additive canonical identity schema **only**, no data backfill.
- **B1b-2:** Cotality / NYC identity **enrichment ingestion behind disabled flags** (ParcelNumber→BBL candidate, Latitude/Longitude, BuildingKey), incl. record-level format validation.
- **B1b-3:** **dry-run** candidate generation, authority reconciliation, and exception reporting (no writes to canonical tables beyond the dry-run sandbox).
- **B1b-4:** **separately approved** controlled backfill in batches.
- **B1b-5:** dual-read/dual-write verification before any reader dependency.

## 19. Dual-read / dual-write transition

- **Dual-write:** sync + CRM writers populate `listings` (unchanged) and `listing_identity` (additive); no resolved identity ⇒ no row (fail-open to current behavior).
- **Dual-read:** readers prefer `listing_identity` only when authority-confirmed; else fall back to `listings`. Feature-flagged; **no reader switched until B1b-5** (parity-gated).

## 20. Rollback plan

- All B1b objects additive/droppable; no `listings`/`buildings` column altered; `building_key` never written.
- Rollback = disable flag + optionally drop additive tables; production listing behavior unaffected (dual-read falls back).
- No permanent cross-source links without enrichment + validation + review gates.

## 21. Monitoring and audit requirements

- `identity_match_audit` row per link (signal, confidence, decided_by, authority evidence).
- Drift monitor (listings without a confirmed identity); resolved-rate over time.
- Collision monitor (simultaneous-active growth beyond the 218 baseline).
- Review-queue size/age; enrichment-coverage gauges (BBL/geo/BuildingKey %).
- Convergence gate before any reader cutover.

## 22. Explicit recommendation

**CONDITIONAL GO for B1b DESIGN AND ADDITIVE SCHEMA ONLY.** Not authorized: production backfill, automatic linking, reader cutover.

Conditions:
1. B1b is split into B1b-1…B1b-5 (§18), each **separately approved**.
2. Enrichment (ParcelNumber/geo/BuildingKey) is added behind disabled flags **with record-level validation** before any BBL/geo/BuildingKey matching.
3. Thresholds are finalized **only** after the stratified validation sample (§14) is checked against approved authority evidence.
4. The 531 exceptions + 539 relisting candidates are queued, not auto-linked.
5. Canonical identity uses new surrogate IDs + nullable **text** `BuildingKey`; the integer `buildings.building_key` is never used/written.
6. Address auto-linking is **not** approved on street+ZIP+borough alone.

**Truthful bottom line:** the existing data yields a **strong provisional candidate graph** but **cannot prove canonical identities** because the strongest authority signals (BBL, geo, `BuildingKey`) are absent. B1b may proceed to schema design + enrichment preparation, **not** to automatic linking or backfill.

---

*B1a is read-only analysis only. No schema, migration, `building_key` change, canonical IDs in production tables, backfill, permanent links, Neon writes, production writes, Cotality-sync change, SourceObservation, supplemental records, or external ingestion were performed. B1b remains separately approval-gated.*
