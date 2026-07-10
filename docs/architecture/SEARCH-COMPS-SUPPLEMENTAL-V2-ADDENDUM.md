# Search / Comps / Supplemental-Inventory V2 — Design Addendum

> **Status: DESIGN ONLY — NOT AUTHORIZED FOR IMPLEMENTATION.**
> Dated 2026-07-10. Extends and *corrects* the prior "Mallan Search & Intelligence — Architecture Analysis + Design Plan" (Backend-Search analysis, main @ `2a06e0a0`/#492).
> This document changes **no** application code, Prisma schema, migration, Vercel config, or production data. All entity/field names below are **reserved logical names**, not a migration.
> Implementation of any supplemental / external-inventory capability remains **HELD** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`); syndication remains **HELD**. Nothing here releases a hold.

### Revision history
- **Rev 1** (2026-07-10) — initial addendum.
- **Rev 2** (2026-07-10) — amendment (docs-only) applying 7 review corrections: (1) split B1 → B1a read-only identity proof + B1b approval-gated identity schema/backfill; (2) fix the G2 contradiction (real coverage-manifest ingestion requires B2 **and** B3); (3) expand the source model into three separate dimensions — `SourceAuthority` (adds `nyc_dob`, renames `acris_public`→`acris`), `ObservationPlatform`, `SourceAccessMethod`; (4) split `verification_status` into `VerificationStatus` + `SupplementalLifecycleStatus`; (5) pure contract returns typed `ContractDecision`, adapters map to HTTP (no Next.js/HTTP coupling in `lib/search/canonical`); (6) relax "canonical IDs on every row" → `canonical_listing_id` + `IdentityResolutionStatus` + IDs-when-resolved; (7) redefine deterministic parity to include audience + scope + entitlements + as-of snapshot. §1.4 now reserves the complete A1 contract; Appendix A holds the reserved type signatures.

---

## 0. Scope, authorities, and guardrails

**Non-negotiable guardrails carried into every design below:**
- **Fail-closed** on unknown/unsupported criteria, unresolved audience, missing license, or unverified evidence.
- **Compliance-first** (§D of CLAUDE.md): RLS/IDX Plus display rules, FARE Act (rentals), Fair Housing scanning on any displayed text, NY DOS §175.25 attribution, NY SHIELD/retention. Supplemental inventory is **private (broker/agent only) and is never surfaced through the public IDX display path**, so it does not enter the REBNY IDX display gate — but it is still subject to Fair Housing / advertising / licensing review before any rendering.
- **Licensing before ingestion.** No external source is ingested or persisted until a `SourceLicenseProfile` with completed legal/ToS review authorizes the specific use. This document does **not** assert that any StreetEasy/Zillow/partner ingestion is currently permitted.
- **Cotality field existence ≠ permission.** The presence of a field in the Cotality/Trestle feed does **not** imply the right to display it publicly, use it in a report, or export it. Display/report/export/comp rights come **only** from `SourcePermissionCapabilities` (§1.4, Appendix A), never from feed availability.

### 0.1 Factual authorities (source of truth) vs. derived index

The **factual authorities** are, in precedence order per fact class:

| Fact class | Authority (`SourceAuthority`) |
|---|---|
| Licensed listing records (active/closed MLS) | **Cotality / REBNY RLS** (`cotality_rebny`) |
| Public transaction evidence (closed sale history, ownership of record) | **ACRIS / NYC public records** (`acris`) — via the approved ACRIS pathway, PR #488 |
| Property facts (Schedule A, building/DOB facts, BBL/tax lot) | **NYC DOB / public records** (`nyc_dob`) |
| Mallan-created records (exclusives, CRM listings, deals, leases, past deals) | **Mallan CRM** (`mallan_crm`) |
| External observations where no licensed record exists | **Authorized supplemental sources** (`supplemental`, per `SourceLicenseProfile`) |

`listing_search_projection` is **none of these**. It is a **derived Search Document (V2)** — a query-acceleration/index projection that *references* the authorities above. It must never be described or used as the factual source of truth.

---

## 1. Search projection role — correction

### 1.1 Search Document V2 = derived index, not authority
The projection carries denormalized, typed, filter/sort-ready fields **plus provenance pointers** back to the authorities. Reads for correctness/verification resolve to the authority; reads for *search/browse* resolve to the Search Document. A factual report (CMA/BPO) never trusts the Search Document for a value — it re-verifies against the authority (§6).

### 1.2 Additive expansion, not replacement
**Decision: additively expand the existing `listing_search_projection` (35 cols) into Search Document V2. Do not replace it.** Rationale: the existing dual-write path and gate semantics are already exercised by saved-search/alerts; a rip-and-replace multiplies risk and drift surface. Expansion is additive and reversible; convergence is provable before cutover.

### 1.3 Readiness gate — ALL required before the Search Document becomes any public read source
The prior plan's "make the projection the read source" is **re-gated**. None of Lane A's public cutover may proceed until every item below is proven:

1. **Zero projection drift** vs. the listing authority (extend `reconcile-projection-idx-display` to cover *every* Search-Doc field, not just `idx_display_yn`; historical drift was 1,949 rows).
2. **All supported filters typed** (no string-coerced numerics/enums; each filter key has a declared type + validator).
3. **Identity resolution present per row (not full canonical IDs).** Every Search-Doc row carries `canonical_listing_id` + `identity_resolution_status`; `canonical_property_id` / `canonical_building_id` / `canonical_unit_id` are present **when applicable and resolved**, and a documented **unresolved reason** is recorded otherwise. (Full property/building/unit resolution is impossible for land, unit-less townhouses, incomplete external observations, address-suppressed listings, and records awaiting review — so per-row 100% resolution is **not** a gate.) Public cutover instead requires an **approved minimum coverage rate** plus **fail-closed behavior for unresolved records**. See `IdentityResolutionStatus` (§1.4, Appendix A).
4. **`SourceAuthority`** on every row (`cotality_rebny | acris | nyc_dob | mallan_crm | supplemental`). `ObservationPlatform` and `SourceAccessMethod` are **separate** dimensions, never collapsed into authority (§1.4, §3).
5. **`inventory_scope`** membership on every row (§5).
6. **`VerificationStatus`** + method, kept **separate** from `SupplementalLifecycleStatus` (§1.4, §2.4).
7. **`freshness`** (source retrieval timestamp + staleness state; `observedAt` / `verifiedAt`).
8. **`audience_permissions`** (which audiences may see the row).
9. **Deterministic sort fields** (explicit, indexed sort columns + a stable id tiebreak; a single defined "newest" field, not 5 candidates).
10. **Supplemental-record support** (the Search Document can represent a `SupplementalListing` row with the same typed schema, distinguished by `SourceAuthority=supplemental`).
11. **Explicit capability validation** — unknown/unsupported/unpermitted criteria produce a typed `ContractDecision` (§1.5), never a silent drop. (The pure contract returns the decision; an API adapter later maps it to HTTP.)

### 1.4 Canonical Contract V2 — reserved dimensions (this fully specifies Decision 3's precondition and the A1 scope)
The canonical contract (`lib/search/canonical/*`, #491) is extended with the **complete** dimension set below before any Lane A execution. These are pure, behavior-free type/enum reservations (see Appendix A for signatures); **A1 wires none of them to a runtime reader.**

| Dimension | Values / shape | Capability |
|---|---|---|
| `SourceAuthority` | `cotality_rebny \| acris \| nyc_dob \| mallan_crm \| supplemental` | provenance / filter |
| `ObservationPlatform` | `streeteasy \| zillow \| direct_broker_feed \| property_manager_feed \| owner_submitted \| manual_agent_research \| none` | attribution (separate from authority) |
| `SourceAccessMethod` | `licensed_api \| licensed_feed \| direct_partner \| manual_agent_research` | licensing fact |
| `InventoryScope` | `public_inventory \| client_inventory \| agent_complete_inventory \| cotality_rebny_only \| mallan_exclusive \| supplemental_only \| missing_from_cotality \| verification_required \| source_conflicts` | filter + **audience-gated** |
| `VerificationStatus` | `verified \| verification_required \| stale \| conflicted` | filter |
| `SupplementalLifecycleStatus` | `active \| removed_at_source \| superseded_by_rebny \| license_blocked` | filter (supplemental only) |
| `EvidenceClassification` | `VALUATION_EVIDENCE \| ACTIVE_COMPETITION \| SUPPLEMENTAL_MARKET_OBSERVATION \| PROPERTY_FACT \| UNVERIFIED_LEAD` | comps |
| `CanonicalEntityReference` | `{ propertyId?, buildingId?, unitId?, listingId, sourceRecordId }` | join/dedup |
| `IdentityResolutionStatus` | `resolved \| partial \| ambiguous \| unresolved` | identity coverage |
| `SourcePermissionCapabilities` | `mayStoreIdentifiers, mayStoreListingFields, mayStorePhotos, mayStoreDescriptions, mayDisplayInternally, mayDisplayToClients, mayUseInReports, mayUseForComps, mayExport, attributionRequired, linkBackRequired, maximumRetentionHours` | licensing enforcement |
| `AttributionEnvelope` | `{ factualAuthority, observationPlatform, listingBrokerage?, listingAgent?, accessMethod, observedAt, verifiedAt?, audienceObligations }` | attribution |
| audience-enforcement decision | typed `ContractDecision` (§1.5) | fail-closed |
| deterministic sort | `sort` ∈ typed set + `(sort_key, id)` tiebreak | sort |
| capability validation | every key declares filter/sort/alert/report/scope capability; violations → `ContractDecision` | fail-loud |

### 1.5 Pure-contract failure behavior (no HTTP inside the contract)
The canonical package is a **pure TypeScript library** and must not depend on Next.js or return HTTP responses. Capability/scope/license/value violations return a **typed decision**; a future **route adapter** maps it to HTTP.

```ts
interface ContractDecision {
  ok: boolean;
  code:
    | "UNKNOWN_CRITERION"
    | "UNSUPPORTED_CRITERION"
    | "UNAUTHORIZED_SCOPE"
    | "UNLICENSED_SOURCE"
    | "INVALID_VALUE";
  criterion?: string;
  message: string;
}
```
Mapping (adapter layer, **not** part of A1): `UNKNOWN_CRITERION` / `UNSUPPORTED_CRITERION` / `INVALID_VALUE` → **400**; `UNAUTHORIZED_SCOPE` → **403**; `UNLICENSED_SOURCE` → **403/422** as appropriate. The pure contract never imports HTTP or Next.js.

### 1.6 Deterministic parity — corrected definition
Parity is **not** "same criteria = same results." Public and broker results are *intentionally* different (broker audiences see supplemental inventory, private statuses, internal records, source conflicts, and verification-required records). The guarantee is:

> **same canonical criteria + same audience + same inventory scope + same entitlement set + same as-of snapshot ⇒ same listing IDs and the same deterministic order.**

Shadow parity (G1) is measured within a fixed (audience, scope, entitlement, as-of) tuple, never across audiences.

---

## 2. Private supplemental inventory (gap-only)

### 2.1 Purpose and hard limits
A **gap-only** private inventory that fills holes in Cotality/REBNY coverage. Hard-scoped:
- **Boroughs:** Manhattan, Brooklyn, Queens only.
- **Sale and rental kept strictly separate** (separate scopes, separate comp methodologies).
- **Broker/agent access only.** Never public, never client-portal, never IDX, never syndicated.
- **Gap-only persistence:** a full `SupplementalListing` record is persisted **only when no Cotality/REBNY match exists**. When a match exists, only a lightweight match/coverage observation is retained (subject to license + retention); the full external record is not stored.

### 2.2 Pipeline
```
authorized coverage manifest (external source)
        │  ExternalCoverageManifestEntry (lightweight observation)
        ▼
identity resolution (§4)  ──►  match against Cotality/REBNY
        │
        ├─ match found  ──► SupplementalMatchDecision(matched) ──► NO full record; coverage note only
        ├─ ambiguous    ──► ManualReviewQueue
        ├─ conflict     ──► SupplementalMatchDecision(conflict) ──► ManualReviewQueue
        └─ no match (gap)──► SupplementalListing (full, private, gap-only)
```

### 2.3 Entities (reserved logical models — NOT a migration)

**`ExternalCoverageManifestEntry`** — a licensed *coverage* observation (existence/URL/address/price/class/observed_at), **not** a listing copy. Fields: `id, source_authority, observation_platform, access_method, source_record_id, observed_url, address_raw, normalized_address, bbl?, borough, neighborhood_raw, unit_raw, normalized_unit, listing_class(sale|rental), status_raw, price_raw, observed_at, manifest_batch_id, coverage_hash, match_state(unmatched|matched_rebny|ambiguous|conflict), source_license_profile_id`.

**`SupplementalListing`** — persisted **only for confirmed gaps**. Fields: `id, canonical_property_id?, canonical_building_id?, canonical_unit_id?, identity_resolution_status, canonical_listing_id, source_authority='supplemental', observation_platform, access_method, source_record_id, listing_class, address, normalized_unit, price, beds, baths, sqft, description_sanitized, media_refs(license-permitted only), listing_brokerage(only if the record states it), listing_agent(only if stated), verification_status(VerificationStatus §1.4), lifecycle_status(SupplementalLifecycleStatus §1.4), source_freshness_id, first_observed_at, last_observed_at, retrieved_at, superseded_by_listing_key?(RLS link), audience='broker_agent_only', retention_expires_at, source_license_profile_id`. **Note:** verification and lifecycle are **two separate fields** — a record may be `lifecycle=active` + `verification=stale`, or `lifecycle=superseded_by_rebny` + `verification=verified`.

**`SourceLicenseProfile`** — the ingestion gate; carries `SourcePermissionCapabilities` (§1.4). Fields: `id, source_authority, observation_platform, access_method, license_type, capabilities(SourcePermissionCapabilities), permits_public_display(bool — MUST be false), tos_url, legal_review_status(pending|approved|blocked), effective_from, expires_at`. **No ingestion or persistence occurs unless an active, approved profile's capabilities explicitly permit the specific field/use.**

**`SupplementalMatchDecision`** — Fields: `id, manifest_entry_id, candidate_rebny_listing_key?, decision(no_match_gap|matched|ambiguous|conflict), match_confidence, match_signals(bbl,address,unit,price,class), decided_by(auto|reviewer), decided_at, review_required(bool), notes`.

**`ManualReviewQueue`** — Fields: `id, entity_type(manifest_entry|supplemental_listing|match_decision|conflict|identity), entity_id, reason(ambiguous_match|source_conflict|license_ambiguity|stale_verify|identity_ambiguous|fair_housing_flag), priority, assigned_to, state(open|in_review|resolved|rejected), created_at, resolved_at, resolution`.

**`SourceFreshness`** — Fields: `id, source_authority, entity_ref, first_seen_at, last_seen_at, last_verified_at, verification_method, ttl_hours, is_stale(derived), removed_at_source_at?`.

**`AccessAudit`** — every access to private inventory is logged. Fields: `id, actor_agent_id, audience, action(view|search|export|comp_use), inventory_scope, entity_type, entity_id, criteria_hash?, occurred_at, result(allowed|blocked), reason`.

### 2.4 Two-field state machine (verification vs. lifecycle)
Verification and lifecycle transition **independent** fields; neither overloads the other.

**`VerificationStatus`** (data-quality axis):
```
verification_required ─(source verify ok)─► verified
verified ─(ttl exceeded)─► stale
stale ─(re-verify ok)─► verified
any ─(conflicting authority)─► conflicted ─► ManualReviewQueue
```

**`SupplementalLifecycleStatus`** (existence/eligibility axis):
```
active ─(gone at source)─► removed_at_source        [suppressed]
active ─(Cotality match appears)─► superseded_by_rebny [suppressed, linked]
active ─(license lapses/withdraws)─► license_blocked   [suppressed]
```
Suppressed lifecycle values (`removed_at_source`, `superseded_by_rebny`, `license_blocked`) are excluded from all result sets regardless of `VerificationStatus`; the row is retained only as long as retention rules permit. Filtering, auditing, and reporting query the appropriate axis independently (e.g., "active but stale" is expressible).

### 2.5 Supersession by Cotality/REBNY
When a supplemental gap later appears in Cotality:
1. **Cotality becomes primary.** The RLS record is the authority and the displayed row.
2. The `SupplementalListing` **links** to the RLS listing key (`superseded_by_listing_key`).
3. **`lifecycle_status` → `superseded_by_rebny`** (its `verification_status` is untouched — it may remain `verified`).
4. The **duplicate is suppressed** in all result sets (RLS row shows; supplemental does not).
5. **Historical observation** (first_observed_at, price trajectory) is retained **only as retention rules permit**, for internal market-history use — never re-displayed as an active listing.

---

## 3. Attribution — six-facet separation

Attribution is decomposed into six independent facets (encoded by the contract as `SourceAuthority` + `ObservationPlatform` + `SourceAccessMethod` + `AttributionEnvelope`); conflating any two is prohibited:

| Facet | Contract field | Example |
|---|---|---|
| **Factual authority** | `SourceAuthority` | cotality_rebny, acris, nyc_dob, mallan_crm, supplemental |
| **Observation platform** | `ObservationPlatform` | streeteasy, zillow, partner feed — where we observed it |
| **Listing brokerage** | `AttributionEnvelope.listingBrokerage` | only if the record states it |
| **Listing agent** | `AttributionEnvelope.listingAgent` | only if stated; PII rules apply |
| **Data-access method** | `SourceAccessMethod` | licensed_api, licensed_feed, direct_partner, manual_agent_research |
| **Audience permission / obligation** | `AttributionEnvelope.audienceObligations` | broker/agent only; attribution/link-back required |

**Rule:** StreetEasy / Zillow / any `ObservationPlatform` is **never** rendered or recorded as the *listing brokerage* or *listing agent* unless the source record **expressly** states that brokerage/agent. The observation platform is a data-access fact, not an attribution-of-representation fact. DOB Schedule A is a **`PROPERTY_FACT`** under `nyc_dob`; ACRIS is public transaction evidence under `acris`; these are distinct authorities, not "supplemental."

---

## 4. Property identity — split into B1a (proof) and B1b (schema), sequenced early

Canonical identity is foundational for both the Search Document (needs resolvable IDs + `IdentityResolutionStatus`) and comps (needs cross-source identity). It is split into two different risk classes:

### 4.1 B1a — Identity proof (READ-ONLY; no schema, no backfill, no links, no BuildingKey change)
A full-population, read-only analysis that must answer, with evidence:
- Full-population **address-resolution** rate; **BBL coverage**; **building-resolution** coverage; **unit-resolution** coverage.
- **Address/unit collisions**; **Cotality `BuildingKey` conflicts** (incl. the int-vs-string problem, §4.3).
- **Relisting candidates** (same property/unit across successive listings).
- **Safe auto-match thresholds** and **manual-review thresholds**.
- A **proposed additive schema** (for B1b) — proposal only.

**B1a prohibitions:** no schema change, no backfill, no permanent cross-source links, no `buildings.building_key` modification, no supplemental ingestion. Output is analysis + thresholds only.

### 4.2 B1b — Identity schema + backfill (SEPARATE, approval-gated PR after B1a)
- Internal **surrogate** property/building/unit IDs (`canonical_property_id` / `canonical_building_id` / `canonical_unit_id`).
- Cotality `BuildingKey` stored as a **nullable text source reference** (never the canonical key).
- **BBL association**; deterministic **NormalizedUnit**; listing identity across relistings; source-specific listing IDs (`{ source → source_record_id }`).
- **Backfill plan**, **collision handling**, **rollback**, and a **dual-read/dual-write transition**.

### 4.3 The `BuildingKey` type mismatch (evidence for B1a; fixed in B1b)
**Verified fact:** DB `buildings.building_key` is `integer`; live Cotality `BuildingKey` is `String(≤300)` on Property and `String(≤255, non-null)` on Building. The integer column is **lossy and unsafe** as an identity key. B1a quantifies the resulting conflicts; **B1b** (not this document, not B1a) introduces `canonical_building_id` and stores `BuildingKey` as nullable text. **B1a does not touch `building_key`.**

---

## 5. Search criteria — inventory scope + source criteria

### 5.1 Inventory scopes (`InventoryScope`, canonical contract)
Non-private (allowed for public/client per audience):
- `public_inventory`
- `client_inventory`
- `cotality_rebny_only`
- `mallan_exclusive` (where permitted)

Agent/broker-private (fail-closed for public/client):
- `agent_complete_inventory`
- `supplemental_only`
- `missing_from_cotality`
- `verification_required`
- `source_conflicts`

### 5.2 Backend audience enforcement (fail-closed, typed)
- **Public and client audiences are blocked from all private scopes by the backend** — enforced server-side in the execution service, never by the frontend. A public/client request for a private scope returns a typed `ContractDecision{ code: "UNAUTHORIZED_SCOPE" }` (the adapter maps it to **403**), logged to `AccessAudit`.
- Default scope by audience: public → `public_inventory`/`cotality_rebny_only` (+ `mallan_exclusive` where permitted); client → `client_inventory`; agent/broker → may request the private scopes explicitly.
- **Supplemental is never assumed public.** Unknown scope or unauthorized combination → typed decision, fail-closed; never silently narrowed.

---

## 6. Comp Engine V2 — staged, evidence-typed

Comps **share canonical facts and identity** with search (§1, §4) but are **not** a normal listing search. Distinct staged pipeline:

```
1. subject resolution      (resolve to a real record + re-verify live)
2. candidate retrieval     (via the shared execution service, identity-aware)
3. eligibility             (explicit, class-aware rules)
4. evidence classification (§6.1)
5. ranking
6. exclusion reasons       (recorded per candidate)
7. broker review           (mandatory for external/paid)
8. adjustment grid
9. confidence              (from data quality/evidence class)
10. immutable snapshot      (raw comps + methodology_version + retrieval timestamps)
```

### 6.1 Evidence classes (`EvidenceClassification`) and their allowed valuation role
| Class | May drive value? | Notes |
|---|---|---|
| `VALUATION_EVIDENCE` | **Yes** | verified closed sales with **verified close price** (ACRIS pathway or permitted internal record with source + retrieval timestamp) |
| `ACTIVE_COMPETITION` | Context (pricing pressure), **not** closed value | active listings, **including verified supplemental active listings** |
| `SUPPLEMENTAL_MARKET_OBSERVATION` | Context only | never auto-promoted to a closed comp; provenance flagged |
| `PROPERTY_FACT` | No (descriptive) | Schedule A (`nyc_dob`) / building facts only |
| `UNVERIFIED_LEAD` | No | may inform candidate discovery only; excluded from valuation |

### 6.2 Rules
- Verified supplemental **active** listings may be `ACTIVE_COMPETITION`.
- Supplemental observations **do not** automatically become closed comps.
- **Schedule A is `PROPERTY_FACT` only** (authority `nyc_dob`).
- Public **closed sale history follows the approved ACRIS pathway** (authority `acris`; PR #488 visibility contract).
- Permitted internal close-price records **must retain source + retrieval timestamp**.
- **Every selected comp is re-verified against its authority before final report issuance.** Cotality/authority failure → issuance fails closed (no report).

---

## 7. Saved searches — reserved fields

Reserved (logical; migration later, additive): `criteria_version`, `canonical_criteria`, `criteria_hash`, `audience`, `inventory_scope`, `last_successful_run`, `last_failure`.
- Saved searches persist the **exact canonical criteria** (+ `criteria_hash` for change detection).
- **Alerts replay the identical `canonical_criteria` through the identical execution service** — no Engine A/B split, no subset re-interpretation.
- `audience` + `inventory_scope` are stored so replay re-enforces the same visibility; a saved private-scope search owned by a broker never leaks if replayed in a lesser audience context (fail-closed, per §1.6 parity).

---

## 8. Revised sequencing — three lanes with hard gates

### Lane A — Search correctness
Canonical contract dimension reservation (A1) → projection convergence (zero drift, typed filters, identity-resolution status, `SourceAuthority`, verification/lifecycle, freshness, audience, deterministic sort, capability validation) → Search Document V2 (additive) → single execution service (flagged) → shadow parity → **public reader cutover (gated)** → thin frontend → CRM/portal onto service.

### Lane B — Inventory completeness
**B1a identity proof (read-only)** → **B1b identity schema + backfill (approval-gated)** → SourceLicenseProfile + legal/ToS review → private audience enforcement (scope gating + AccessAudit) → coverage-manifest ingestion → gap detection + match decisions + manual review → **supplemental persistence (gap-only, gated)** → supersession.

### Lane C — Comps and reports
Comp Engine V2 subject resolution + candidate retrieval → eligibility + evidence classification → verified close-price sourcing → ranking/exclusions/adjustment grid/confidence → immutable snapshot → **broker review/override + re-verify (gated)** → paid report workflow.

### Hard gates
- **G1 (public cutover):** No public reader cutover until **Search Document V2 + projection convergence (zero drift) + shadow parity** (per §1.6) are proven, with an **approved identity-coverage rate** and fail-closed handling of unresolved rows.
- **G2 (supplemental ingestion):** No **real** supplemental source ingestion or persistence until **`SourceLicenseProfile` (approved legal/ToS) AND private audience enforcement** are both implemented. A **local, non-persisted development fixture** (no external fetch, no writes) is permitted for testing without G2; any **real external fetch or any persistence** requires **both** B2 and B3.
- **G3 (paid valuation):** No external or paid valuation issuance until **Comp Engine V2 + immutable snapshots + mandatory broker signoff** are complete.

---

## 9. Updated PR dependency map

> Prior single-lane P1–P15 is superseded by this lane/gate structure. Backend-Search-0/0.1/1 (#488/#489/#491) remain merged. All PRs additive-first, flag-gated, with parity tests + monitoring + rollback. Nothing here is authorized to start beyond the noted precondition.

```
LANE A (search correctness)                 LANE B (inventory)                    LANE C (comps/reports)
A1 contract dims (this doc) ──┐             B1a identity proof (READ-ONLY) ──┐     C1 subject resolve+retrieval
   │                          │                (needs A1)                    │        (needs B1b, A4)
A2 projection convergence ────┤             B1b identity schema+backfill ◄───┤     C2 eligibility+evidence class
   │                          │                (approval-gated; needs B1a)   │        (needs C1)
A3 Search Doc V2 (additive) ◄─┴─ needs A1,A2,B1b                             │     C3 verified close-price
   │                                        B2 SourceLicenseProfile           │        (ACRIS+internal; needs B1b)
A4 execution service (flag) ◄─ needs A3        + legal/ToS review             │     C4 rank/exclude/grid/confidence
   │                                        B3 private audience enforce ◄──────┤        (needs C2,C3)
A5 shadow parity harness ◄─ needs A4           (scopes+AccessAudit; A1,A4)    │     C5 immutable snapshot+version
   │   ══ G1 ══                             B4 coverage manifest ◄═ G2:B2+B3  │        (needs C4)
A6 PUBLIC CUTOVER ◄═ G1: A3+A2+A5              (real fetch needs B2 AND B3)   │     C6 broker review+re-verify ◄═ G3
   │                                        B5 gap detect+match+review ◄───────┤        (needs C5)
A7 thin frontend ◄─ needs A6                   (needs B1b,B4)                  │     C7 paid report workflow ◄═ G3
A8 CRM/portal onto service ◄─ needs A6      B6 supplemental persist ◄═ G2      │        (needs C6; fail-closed)
                                               (gap-only; needs B2,B3,B5)      │
                                            B7 supersession ◄─ needs B6,A4
DEFERRED: i18n — only after A, B, C stable.
```

**Critical cross-lane dependency:** identity is now a two-step chain — **B1a (read-only proof) → B1b (schema+backfill) → A3 (Search Document V2 needs resolvable canonical IDs + `IdentityResolutionStatus`)**, and B1b also feeds C1/C3 (comps need cross-source identity). B1a starts alongside A1; A3 waits on B1b. Identity is foundational, not late — and its risky half (B1b) is separately approval-gated.

| PR | Lane | Preconditions | Gate | Schema | Prod impact |
|---|---|---|---|---|---|
| A1 contract dimensions | A | this addendum | — | none | none |
| A2 projection convergence | A | A1 | — | none | read-only |
| **B1a identity proof (read-only)** | B | A1 | — | **none** | **read-only** |
| **B1b identity schema + backfill** | B | **B1a (approval-gated)** | — | **additive** | low |
| A3 Search Document V2 (additive) | A | A1, A2, **B1b** | — | additive | low (flag) |
| A4 execution service | A | A3 | — | none | flag off |
| A5 shadow parity | A | A4 | **G1** | none | read-only |
| A6 public cutover | A | A5 | **G1** | none | **high** |
| A7 thin frontend | A | A6 | — | none | medium |
| A8 CRM/portal onto service | A | A6 | — | none | medium |
| B2 SourceLicenseProfile + legal review | B | — | **G2** | additive | none |
| B3 private audience enforcement | B | A1, A4 | **G2** | additive | medium |
| **B4 coverage manifest ingest** | B | **B2 + B3** | **G2** | additive | low |
| B5 gap detect + match + review | B | **B1b**, B4 | — | additive | low |
| B6 supplemental persist (gap-only) | B | B2, B3, B5 | **G2** | additive | low (private) |
| B7 supersession | B | B6, A4 | — | additive | low |
| C1 comp subject+retrieval | C | **B1b**, A4 | — | none | flag |
| C2 eligibility+evidence class | C | C1 | — | none | flag |
| C3 verified close-price | C | **B1b** | — | additive | low |
| C4 rank/exclude/grid/confidence | C | C2, C3 | — | none | flag |
| C5 immutable snapshot+version | C | C4 | **G3** | additive | flag |
| C6 broker review+re-verify | C | C5 | **G3** | additive | gated |
| C7 paid report workflow | C | C6 | **G3** | additive | gated |

---

## 10. Locked decisions (per Maya, 2026-07-10)
1. **One database-backed search read model is approved in principle**, but the current `listing_search_projection` is **not** yet approved as production-ready or as the source of truth. (It is a derived Search Document; §1 readiness gate applies.)
2. **Broker signoff is mandatory** for external and paid CMA/BPO reports (G3).
3. **Lane A A1–A4 may begin only after this addendum reserves the full canonical-contract dimensions** — which §1.4 + §1.5 + §5 + Appendix A now do. Start remains subject to Maya's go **and** PR #493 being merged.
4. **Internationalization is deferred** until search, supplemental inventory, comps, and factual reports are stable.

## 11. Compliance & holds register
- **External-inventory implementation HELD** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`); this addendum is design only and does not release it.
- **Syndication / partner export HELD** — supplemental inventory is private/internal and is **not** syndicated or publicly displayed.
- **Licensing/ToS**: no supplemental ingestion or persistence without an approved `SourceLicenseProfile` whose `SourcePermissionCapabilities` permit the specific use (G2). Cotality field availability never implies display/report/export permission.
- **Fair Housing / advertising / FARE**: any displayed supplemental text/media passes the existing Fair Housing scanner and (for rentals) FARE fields before broker-facing render.
- **Retention / SHIELD**: supplemental observations honor retention windows; suppressed lifecycle records (removed/superseded/blocked) are excluded and aged out per policy.
- **Audience**: private inventory is broker/agent only, enforced server-side, fully audited (`AccessAudit`).

---

## Appendix A — Reserved A1 contract type signatures (logical; NOT implemented in this docs PR)

> These are the exact reservations A1 will add to `lib/search/canonical`. They are pure types/enums + typed decisions — **no runtime reader, no HTTP, no Next.js, no Prisma**. Listed here for review only; this documentation PR implements none of them.

```ts
type SourceAuthority =
  | "cotality_rebny" | "acris" | "nyc_dob" | "mallan_crm" | "supplemental";

type ObservationPlatform =
  | "streeteasy" | "zillow" | "direct_broker_feed"
  | "property_manager_feed" | "owner_submitted"
  | "manual_agent_research" | "none";

type SourceAccessMethod =
  | "licensed_api" | "licensed_feed" | "direct_partner" | "manual_agent_research";

type InventoryScope =
  | "public_inventory" | "client_inventory" | "agent_complete_inventory"
  | "cotality_rebny_only" | "mallan_exclusive" | "supplemental_only"
  | "missing_from_cotality" | "verification_required" | "source_conflicts";

type VerificationStatus =
  | "verified" | "verification_required" | "stale" | "conflicted";

type SupplementalLifecycleStatus =
  | "active" | "removed_at_source" | "superseded_by_rebny" | "license_blocked";

type EvidenceClassification =
  | "VALUATION_EVIDENCE" | "ACTIVE_COMPETITION"
  | "SUPPLEMENTAL_MARKET_OBSERVATION" | "PROPERTY_FACT" | "UNVERIFIED_LEAD";

type IdentityResolutionStatus =
  | "resolved" | "partial" | "ambiguous" | "unresolved";

interface CanonicalEntityReference {
  propertyId?: string;
  buildingId?: string;
  unitId?: string;
  listingId: string;        // canonical_listing_id (always present)
  sourceRecordId: string;   // source-specific id
}

interface SourcePermissionCapabilities {
  mayStoreIdentifiers: boolean;
  mayStoreListingFields: boolean;
  mayStorePhotos: boolean;
  mayStoreDescriptions: boolean;
  mayDisplayInternally: boolean;
  mayDisplayToClients: boolean;
  mayUseInReports: boolean;
  mayUseForComps: boolean;
  mayExport: boolean;
  attributionRequired: boolean;
  linkBackRequired: boolean;
  maximumRetentionHours: number | null;
}

interface AttributionEnvelope {
  factualAuthority: SourceAuthority;
  observationPlatform: ObservationPlatform;
  listingBrokerage?: string;   // only if the record states it
  listingAgent?: string;       // only if stated
  accessMethod: SourceAccessMethod;
  observedAt: string;          // ISO-8601
  verifiedAt?: string;         // ISO-8601
  audienceObligations: string[]; // e.g. attribution_required, link_back_required, broker_agent_only
}

interface ContractDecision {
  ok: boolean;
  code:
    | "UNKNOWN_CRITERION" | "UNSUPPORTED_CRITERION"
    | "UNAUTHORIZED_SCOPE" | "UNLICENSED_SOURCE" | "INVALID_VALUE";
  criterion?: string;
  message: string;
}
```

**Audience-enforcement decisions (typed, fail-closed):** a public/client request for any agent/broker-private `InventoryScope` returns `ContractDecision{ ok:false, code:"UNAUTHORIZED_SCOPE" }`; an unknown enum/criterion value returns `UNKNOWN_CRITERION` / `INVALID_VALUE`; a source use not permitted by an active `SourceLicenseProfile` returns `UNLICENSED_SOURCE`. Adapters (not A1) map these to HTTP 400/403/422.

**End of addendum — design only. No implementation authorized.**
