# Search / Comps / Supplemental-Inventory V2 — Design Addendum

> **Status: DESIGN ONLY — NOT AUTHORIZED FOR IMPLEMENTATION.**
> Dated 2026-07-10. Extends and *corrects* the prior "Mallan Search & Intelligence — Architecture Analysis + Design Plan" (Backend-Search analysis, main @ `2a06e0a0`/#492).
> This document changes **no** application code, Prisma schema, migration, Vercel config, or production data. All entity/field names below are **reserved logical names**, not a migration.
> Implementation of any supplemental / external-inventory capability remains **HELD** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`); syndication remains **HELD**. Nothing here releases a hold.

---

## 0. Scope, authorities, and guardrails

**Non-negotiable guardrails carried into every design below:**
- **Fail-closed** on unknown/unsupported criteria, unresolved audience, missing license, or unverified evidence.
- **Compliance-first** (§D of CLAUDE.md): RLS/IDX Plus display rules, FARE Act (rentals), Fair Housing scanning on any displayed text, NY DOS §175.25 attribution, NY SHIELD/retention. Supplemental inventory is **private (broker/agent only) and is never surfaced through the public IDX display path**, so it does not enter the REBNY IDX display gate — but it is still subject to Fair Housing / advertising / licensing review before any rendering.
- **Licensing before ingestion.** No external source is ingested or persisted until a `SourceLicenseProfile` with completed legal/ToS review authorizes the specific use. This document does **not** assert that any StreetEasy/Zillow/partner ingestion is currently permitted.

### 0.1 Factual authorities (source of truth) vs. derived index

The **factual authorities** are, in precedence order per fact class:

| Fact class | Authority |
|---|---|
| Licensed listing records (active/closed MLS) | **Cotality / REBNY RLS** |
| Public property facts (closed sale history, BBL, tax lot, ownership of record) | **ACRIS / NYC public records** (via the approved ACRIS pathway, PR #488) |
| Mallan-created records (exclusives, CRM listings, deals, leases, past deals) | **Mallan CRM** |
| External observations where no licensed record exists | **Authorized supplemental sources** (per `SourceLicenseProfile`) |

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
3. **Canonical property / building / unit IDs** present on every row (§4).
4. **`source_class`** on every row (cotality_rebny | acris_public | mallan_crm | supplemental).
5. **`inventory_scope`** membership on every row (§5).
6. **`verification_status`** + method.
7. **`freshness`** (source retrieval timestamp + staleness state).
8. **`audience_permissions`** (which audiences may see the row).
9. **Deterministic sort fields** (explicit, indexed sort columns + a stable id tiebreak; a single defined "newest" field, not 5 candidates).
10. **Supplemental-record support** (the Search Document can represent a `SupplementalListing` row with the same typed schema, distinguished by `source_class`).
11. **Explicit capability validation** — unknown/unsupported/unpermitted criteria fail loud (400/403); never silently dropped or ignored.

### 1.4 Canonical Contract V2 — required dimensions (this satisfies Decision 3's precondition)
The canonical contract (`lib/search/canonical/*`, #491) is extended with these **dimensions** before any P1–P3 (Lane A) work begins:

| Dimension | Values / shape | Capability |
|---|---|---|
| `inventory_scope` | see §5 | filter + audience-gated |
| `source_class` | cotality_rebny \| acris_public \| mallan_crm \| supplemental | filter |
| `verification_status` | verification_required \| verified_active \| stale \| removed_at_source \| source_conflict \| superseded_by_rebny \| license_blocked | filter |
| `freshness` | retrieved_at + ttl + is_stale | filter/sort |
| `audience_permissions` | public \| client \| agent \| broker | enforcement |
| canonical IDs | `canonical_property_id`, `canonical_building_id`, `canonical_unit_id` | join/dedup |
| deterministic sort | `sort` ∈ typed set + `(sort_key,id)` tiebreak | sort |
| supplemental support | Search-Doc rows may be `source_class=supplemental` | filter |
| capability validation | every key declares filter/sort/alert/report/scope capability | fail-loud |

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

**`ExternalCoverageManifestEntry`** — a licensed *coverage* observation (existence/URL/address/price/class/observed_at), **not** a listing copy. Fields: `id, source, source_listing_id, observed_url, address_raw, normalized_address, bbl?, borough, neighborhood_raw, unit_raw, normalized_unit, listing_class(sale|rental), status_raw, price_raw, observed_at, manifest_batch_id, coverage_hash, match_state(unmatched|matched_rebny|ambiguous|conflict), source_license_profile_id`.

**`SupplementalListing`** — persisted **only for confirmed gaps**. Fields: `id, canonical_property_id, canonical_building_id, canonical_unit_id, source, source_listing_id, listing_class, address, normalized_unit, price, beds, baths, sqft, description_sanitized, media_refs(license-permitted only), observation_platform, listing_brokerage(only if the record states it), listing_agent(only if stated), factual_authority='supplemental_observation', verification_status, source_freshness_id, first_observed_at, last_observed_at, retrieved_at, status(state machine §2.4), superseded_by_listing_key?(RLS link), audience='broker_agent_only', retention_expires_at, source_license_profile_id`.

**`SourceLicenseProfile`** — the ingestion gate. Fields: `id, source, license_type, permits_persistence(bool), permits_media(bool), permits_public_display(bool — MUST be false), permitted_uses[](internal_gap_display|comp_context|none), permitted_fields[], attribution_requirements, rate_limits, tos_url, legal_review_status(pending|approved|blocked), effective_from, expires_at`. **No ingestion or persistence occurs unless an active, approved profile explicitly permits the specific field/use.**

**`SupplementalMatchDecision`** — Fields: `id, manifest_entry_id, candidate_rebny_listing_key?, decision(no_match_gap|matched|ambiguous|conflict), match_confidence, match_signals(bbl,address,unit,price,class), decided_by(auto|reviewer), decided_at, review_required(bool), notes`.

**`ManualReviewQueue`** — Fields: `id, entity_type(manifest_entry|supplemental_listing|match_decision|conflict), entity_id, reason(ambiguous_match|source_conflict|license_ambiguity|stale_verify|fair_housing_flag), priority, assigned_to, state(open|in_review|resolved|rejected), created_at, resolved_at, resolution`.

**`SourceFreshness`** — Fields: `id, source, entity_ref, first_seen_at, last_seen_at, last_verified_at, verification_method, ttl_hours, is_stale(derived), removed_at_source_at?`.

**`AccessAudit`** — every access to private inventory is logged. Fields: `id, actor_agent_id, audience, action(view|search|export|comp_use), inventory_scope, entity_type, entity_id, criteria_hash?, occurred_at, result(allowed|blocked), reason`.

### 2.4 Status state machine (`SupplementalListing.status`)
```
verification_required ─(source verify ok)─► verified_active
verified_active ─(ttl exceeded)─► stale
stale ─(re-verify ok)─► verified_active
stale ─(gone at source)─► removed_at_source        [suppressed]
any ─(conflicting authority)─► source_conflict ─► ManualReviewQueue
any ─(Cotality match appears)─► superseded_by_rebny [suppressed, linked]
any ─(license lapses/withdraws)─► license_blocked   [suppressed]
```
Suppressed statuses (`removed_at_source`, `superseded_by_rebny`, `license_blocked`) are excluded from all result sets; the row is retained only as long as retention rules permit.

### 2.5 Supersession by Cotality/REBNY
When a supplemental gap later appears in Cotality:
1. **Cotality becomes primary.** The RLS record is the authority and the displayed row.
2. The `SupplementalListing` **links** to the RLS listing key (`superseded_by_listing_key`).
3. Status → **`superseded_by_rebny`**.
4. The **duplicate is suppressed** in all result sets (RLS row shows; supplemental does not).
5. **Historical observation** (first_observed_at, price trajectory) is retained **only as retention rules permit**, for internal market-history use — never re-displayed as an active listing.

---

## 3. Attribution — six-facet separation

Attribution is decomposed into six independent facets; conflating any two is prohibited:

| Facet | Meaning | Example |
|---|---|---|
| **Observation platform** | where we observed it | StreetEasy, Zillow, partner feed |
| **Listing brokerage** | the brokerage of record | only if the record states it |
| **Listing agent** | the agent of record | only if stated; PII rules apply |
| **Data-access method** | how the fact was obtained | licensed API, partner manifest, ACRIS pull |
| **Factual authority** | who vouches for the fact | Cotality, ACRIS, Mallan CRM, supplemental observation |
| **Audience permission** | who may see it | broker/agent only for supplemental |

**Rule:** StreetEasy / Zillow / any observation platform is **never** rendered or recorded as the *listing brokerage* or *listing agent* unless the source record **expressly** states that brokerage/agent. The observation platform is a data-access fact, not an attribution-of-representation fact.

---

## 4. Property identity — moved earlier (Lane B, prerequisite to Search Document V2)

Canonical identity is a **prerequisite** for both the Search Document (needs canonical IDs) and comps (needs cross-source identity). It is sequenced **before** supplemental ingestion and before the public read cutover.

### 4.1 Identity model (reserved logical)
- **CanonicalAddress** — normalized components (house no., street, unit, borough, zip) + geocode.
- **BBL** — NYC Borough-Block-Lot, the durable NYC property key (from NYC public records / geocoding). Primary durable identity anchor for NYC.
- **`canonical_building_id`** — Mallan-owned surrogate, keyed primarily by BBL, fallback normalized-address+geo. **Cotality `BuildingKey` is stored as a source reference string, not as the canonical key.**
- **`canonical_unit_id`** — `(canonical_building_id + normalized_unit)`.
- **NormalizedUnit** — deterministic unit canonicalization (e.g., `Apt 2`/`2`/`Unit 2` → `2`; `PH1`, `2A`).
- **Listing identity across relistings** — a stable property/unit identity that binds successive listings (RLS relistings + supplemental) into one timeline.
- **Source-specific listing IDs** — `{ source → source_listing_id }` map for cross-source dedup (RLS `ListingKey`/`ListingId`, supplemental IDs).

### 4.2 Resolve the `BuildingKey` type mismatch FIRST
**Verified fact:** DB `buildings.building_key` is `integer`; live Cotality `BuildingKey` is `String(≤300)` on Property and `String(≤255, non-null)` on Building. The integer column is **lossy and unsafe** as an identity key.
- **Do not** use `buildings.building_key` (integer) as canonical building identity.
- Introduce `canonical_building_id` (surrogate) + store Cotality `BuildingKey` as a **text** source reference alongside BBL.
- Treat the existing integer column as a legacy source-ref only, to be widened/retired in a later additive migration (not in this document).

---

## 5. Search criteria — inventory scope + source criteria

### 5.1 Agent inventory scopes (canonical contract additions)
- `all_internal`
- `cotality_rebny_only`
- `mallan_exclusive`
- `supplemental_only`
- `missing_from_cotality`
- `verification_required`
- `source_conflicts`

### 5.2 Backend audience enforcement (fail-closed)
- **Public and client audiences are blocked from all private scopes by the backend** — enforced server-side in the execution service, never by the frontend. Requesting a private scope without a broker/agent audience → **403, loud** (logged to `AccessAudit`).
- Default scope by audience: public/client → `cotality_rebny_only` (+ `mallan_exclusive` where permitted); agent/broker → may request the private scopes.
- Capability validation: a scope the audience may not use, or an unknown scope, **fails loud** — never silently narrowed.

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

### 6.1 Evidence classes and their allowed valuation role
| Class | May drive value? | Notes |
|---|---|---|
| `VALUATION_EVIDENCE` | **Yes** | verified closed sales with **verified close price** (ACRIS pathway or permitted internal record with source + retrieval timestamp) |
| `ACTIVE_COMPETITION` | Context (pricing pressure), **not** closed value | active listings, **including verified supplemental active listings** |
| `SUPPLEMENTAL_MARKET_OBSERVATION` | Context only | never auto-promoted to a closed comp; provenance flagged |
| `PROPERTY_FACT` | No (descriptive) | Schedule A / building facts only |
| `UNVERIFIED_LEAD` | No | may inform candidate discovery only; excluded from valuation |

### 6.2 Rules
- Verified supplemental **active** listings may be `ACTIVE_COMPETITION`.
- Supplemental observations **do not** automatically become closed comps.
- **Schedule A is `PROPERTY_FACT` only.**
- Public **closed sale history follows the approved ACRIS pathway** (PR #488 visibility contract).
- Permitted internal close-price records **must retain source + retrieval timestamp**.
- **Every selected comp is re-verified against its authority before final report issuance.** Cotality/authority failure → issuance fails closed (no report).

---

## 7. Saved searches — reserved fields

Reserved (logical; migration later, additive): `criteria_version`, `canonical_criteria`, `criteria_hash`, `audience`, `inventory_scope`, `last_successful_run`, `last_failure`.
- Saved searches persist the **exact canonical criteria** (+ `criteria_hash` for change detection).
- **Alerts replay the identical `canonical_criteria` through the identical execution service** — no Engine A/B split, no subset re-interpretation.
- `audience` + `inventory_scope` are stored so replay re-enforces the same visibility; a saved private-scope search owned by a broker never leaks if replayed in a lesser audience context (fail-closed).

---

## 8. Revised sequencing — three lanes with hard gates

### Lane A — Search correctness
Canonical contract dimension update → projection convergence (zero drift, typed filters, canonical IDs, source_class, verification, freshness, audience, deterministic sort, capability validation) → Search Document V2 (additive) → single execution service (flagged) → shadow parity → **public reader cutover (gated)** → thin frontend → CRM/portal onto service.

### Lane B — Inventory completeness
**Property/Building/Unit canonical identity + BBL + BuildingKey fix (first)** → SourceLicenseProfile + legal/ToS review → private audience enforcement (scope gating + AccessAudit) → coverage-manifest ingestion → gap detection + match decisions + manual review → **supplemental persistence (gap-only, gated)** → supersession.

### Lane C — Comps and reports
Comp Engine V2 subject resolution + candidate retrieval → eligibility + evidence classification → verified close-price sourcing → ranking/exclusions/adjustment grid/confidence → immutable snapshot → **broker review/override + re-verify (gated)** → paid report workflow.

### Hard gates
- **G1 (public cutover):** No public reader cutover until **Search Document V2 + projection convergence (zero drift) + shadow parity** are proven.
- **G2 (supplemental ingestion):** No supplemental source ingestion until **`SourceLicenseProfile` (approved legal/ToS) + private audience enforcement** are implemented.
- **G3 (paid valuation):** No external or paid valuation issuance until **Comp Engine V2 + immutable snapshots + mandatory broker signoff** are complete.

---

## 9. Updated PR dependency map

> Prior single-lane P1–P15 is superseded by this lane/gate structure. Backend-Search-0/0.1/1 (#488/#489/#491) remain merged. All PRs additive-first, flag-gated, with parity tests + monitoring + rollback. Nothing here is authorized to start beyond the noted precondition.

```
LANE A (search correctness)                LANE B (inventory)                 LANE C (comps/reports)
A1 contract dims (this doc) ──┐            B1 canonical identity + BBL ──┐     C1 subject resolve+retrieval
   │                          │               + BuildingKey fix         │        (needs B1, A4)
A2 projection convergence ────┤            (needs A1; feeds A3)          │     C2 eligibility+evidence class
A3 Search Doc V2 (additive) ◄─┴─ needs A1,A2,B1                          │        (needs C1)
   │                                       B2 SourceLicenseProfile        │     C3 verified close-price
A4 execution service (flag) ◄─ needs A3       + legal/ToS review          │        (ACRIS + internal, needs B1)
   │                                       B3 private audience enforce ◄──┤     C4 rank/exclude/grid/confidence
A5 shadow parity harness ◄─ needs A4          (scopes + AccessAudit;      │        (needs C2,C3)
   │   ══ G1 ══                                needs A1,A4)               │     C5 immutable snapshot+version
A6 PUBLIC CUTOVER ◄═ G1: A3+A2+A5           B4 coverage manifest ◄─ G2:B2 │        (needs C4)
   │                                        B5 gap detect+match+review ◄──┤     C6 broker review+re-verify ◄═ G3
A7 thin frontend ◄─ needs A6                   (needs B1,B4)              │        (needs C5)
A8 CRM/portal onto service ◄─ needs A6      B6 supplemental persist ◄═ G2 │     C7 paid report workflow ◄═ G3
                                               (gap-only; needs B2,B3,B5) │        (needs C6; fail-closed)
                                            B7 supersession ◄─ needs B6,A4
DEFERRED: i18n — only after A, B, C stable.
```

**Critical cross-lane dependency:** **B1 (canonical identity) is a prerequisite for A3 (Search Document V2 needs canonical IDs)** and for C1/C3 (comps need cross-source identity). B1 therefore starts in parallel with A1 and lands before A3 — identity is foundational, not late.

| PR | Lane | Precondition | Gate | Schema | Prod impact |
|---|---|---|---|---|---|
| A1 contract dimensions | A | this addendum | — | none | none |
| A2 projection convergence | A | A1 | — | none | read-only |
| B1 canonical identity + BuildingKey fix | B | A1 | — | additive (later) | low |
| A3 Search Document V2 (additive) | A | A1,A2,B1 | — | additive | low (flag) |
| A4 execution service | A | A3 | — | none | flag off |
| A5 shadow parity | A | A4 | **G1** | none | read-only |
| A6 public cutover | A | A5 | **G1** | none | **high** |
| A7 thin frontend | A | A6 | — | none | medium |
| A8 CRM/portal onto service | A | A6 | — | none | medium |
| B2 SourceLicenseProfile + legal review | B | — | **G2** | additive | none |
| B3 private audience enforcement | B | A1,A4 | **G2** | additive | medium |
| B4 coverage manifest ingest | B | B2 | **G2** | additive | low |
| B5 gap detect + match + review | B | B1,B4 | — | additive | low |
| B6 supplemental persist (gap-only) | B | B2,B3,B5 | **G2** | additive | low (private) |
| B7 supersession | B | B6,A4 | — | additive | low |
| C1 comp subject+retrieval | C | B1,A4 | — | none | flag |
| C2 eligibility+evidence class | C | C1 | — | none | flag |
| C3 verified close-price | C | B1 | — | additive | low |
| C4 rank/exclude/grid/confidence | C | C2,C3 | — | none | flag |
| C5 immutable snapshot+version | C | C4 | **G3** | additive | flag |
| C6 broker review+re-verify | C | C5 | **G3** | additive | gated |
| C7 paid report workflow | C | C6 | **G3** | additive | gated |

---

## 10. Locked decisions (per Maya, 2026-07-10)
1. **One database-backed search read model is approved in principle**, but the current `listing_search_projection` is **not** yet approved as production-ready or as the source of truth. (It is a derived Search Document; §1 readiness gate applies.)
2. **Broker signoff is mandatory** for external and paid CMA/BPO reports (G3).
3. **P1–P3 (Lane A A1–A4) may begin only after this addendum updates the canonical-contract dimensions** — which §1.4 + §5 now do. Start remains subject to Maya's go.
4. **Internationalization is deferred** until search, supplemental inventory, comps, and factual reports are stable.

## 11. Compliance & holds register
- **External-inventory implementation HELD** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`); this addendum is design only and does not release it.
- **Syndication / partner export HELD** — supplemental inventory is private/internal and is **not** syndicated or publicly displayed.
- **Licensing/ToS**: no supplemental ingestion or persistence without an approved `SourceLicenseProfile` (G2).
- **Fair Housing / advertising / FARE**: any displayed supplemental text/media passes the existing Fair Housing scanner and (for rentals) FARE fields before broker-facing render.
- **Retention / SHIELD**: supplemental observations honor retention windows; superseded/removed records are suppressed and aged out per policy.
- **Audience**: private inventory is broker/agent only, enforced server-side, fully audited (`AccessAudit`).

**End of addendum — design only. No implementation authorized.**
