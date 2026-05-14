# Public Records Database Charter

**Status:** DRAFT — charter only · governance rules locked at PR merge · implementation NOT approved by this charter
**Date authored:** 2026-05-14
**Authoring authority:** Maya Allan, Principal Broker, Mallan Real Estate Inc. (REBNY License #10311201806; brokerage License #10991205323)
**Companion charter:** `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md`
**Compliance source of truth:** `.claude/skills/rebny-compliance/SKILL.md`
**Companion design (separate repo):** `mallan-marketing-plans/2026-05-14-public-records-intelligence-design.md`
**Hold record this charter does NOT release:** `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`

---

## Purpose

This charter governs every aspect of how Mallan Real Estate Inc. ingests, stores, queries, and surfaces NYC + NY State public-records property data inside the mallan-nyc CRM. It defines the architectural and compliance guardrails. It exists because public-records data — Schedule A from NY AG offering plans, ACRIS deeds, DOB CO/TCO, HPD/DOB violations, DOF tax/apportionment, NY DOS corporate filings, 421-a/J-51 abatements — is regulatorily distinct from REBNY/Trestle/RLS data, and commingling the two creates real risk to both Mallan's Trestle IDX Plus license (Trestle-11371-20) and to NY DOS §175.25 advertising compliance.

The charter is binding on all future PRs that touch any system bridging RLS/IDX data and public-records data. The charter does not, by itself, approve implementation. Implementation requires a separate spec, an attorney/compliance review, and Maya's explicit go-ahead.

---

## Article 1 — Scope and binding rules (the 20 articles)

The following 20 articles are the governing rules of this charter. Each is numbered to match the originating prompt of 2026-05-14 so that future PRs and audits can cross-reference precisely.

### 1.1 — Internal CRM-only

The Public Records Intelligence database, search interface, and all derived views are accessible **only** to authenticated Mallan Real Estate Inc. agents and admins through the CRM (`public/crm/dashboard.html` and supporting routes under `app/api/crm/`). No other access path exists.

### 1.2 — Separate searchable database

Public-records data lives in a **separate Neon Postgres project**, distinct from the mallan-nyc Prisma database. The Neon project is provisioned with its own connection string, its own access credentials, its own migration history, and its own backup policy. There is no shared schema and no shared connection pool.

### 1.3 — Public-records data is not IDX/RLS inventory

Public-records data is **not** sourced from the REBNY RLS feed, not licensed under Trestle IDX Plus (Trestle-11371-20), and is not subject to REBNY UCBA 2026 listing display rules. It is sourced from NY State and NYC government public records. It does not represent listings.

### 1.4 — Public-records records are not active listings

A row in any `public_records_*` table does **not** signify that the property or unit is for sale, available, listed, or marketed. Such a row signifies only that the property or unit has a public record on file with one or more of the government sources enumerated in Article 1.18.

### 1.5 — Never appear on the public mallan.nyc website

Public-records data, in whole or in any derivative form, **must never** appear on the public-facing mallan.nyc website. This includes (without limitation): public search results, listing pages, neighborhood pages, building pages, SEO content, sitemaps, JSON-LD structured data, OpenGraph metadata, and any unauthenticated API response.

### 1.6 — Never appear in buyer/tenant/seller/landlord portals

Public-records data **must never** appear in the buyer portal, tenant portal, seller portal, or landlord portal — even when the visitor is authenticated. These portals are client-facing surfaces. Public-records intelligence is for agents only.

### 1.7 — Never returned by `sanitizeForPublic` or `sanitizeForVOW`

The DTO sanitizers `sanitizeForPublic` and `sanitizeForVOW` (in `lib/compliance/dto.ts`) **must never** return any field whose source is the public-records database. Any future change to those sanitizers that admits public-records fields is a charter violation. A unit-test guard is required to enforce this at CI time before any read-path code lands.

### 1.8 — Only returned through `sanitizeForCRM` to authenticated agents/admins

Public-records data may be returned **only** through `sanitizeForCRM` (a new or extended sanitizer in `lib/compliance/dto.ts`), and only after the request has been authenticated as a Mallan agent or admin (role-gated through the existing session_token + Agent model authentication).

### 1.9 — Separate Neon project/database is required

The public-records Neon project is non-negotiable. Putting public-records data in a new schema within the existing mallan-nyc Neon project, or in a separate database within the same Neon project, **does not satisfy this charter.** The isolation must be at the Neon project level.

### 1.10 — No persistent commingling with Trestle/RLS records

No row in any `public_records_*` table may contain fields sourced from Trestle/RLS. No row in any mallan-nyc Prisma model (Listing, Agent, Lead, Deal, ListingMedia, etc.) may contain fields sourced from the public-records database. The two data domains live in two databases and never share rows.

### 1.11 — Joins to RLS/Trestle data happen only at read time in CRM routes

When a CRM API route under `app/api/crm/buildings/`, `app/api/crm/units/`, or `app/api/crm/sponsors/` needs to display both public-records data and matching RLS listing data, the join is performed **in TypeScript at request time**, not in SQL and not in a persistent view. The merged result exists only in the response object returned to the agent's browser. Neither database persists the merged data.

### 1.12 — Every public-records search/query must write an AuditEvent

Every CRM API call that reads from the public-records database **must** write an `AuditEvent` row in the mallan-nyc Prisma database, capturing: `agent_id`, `route`, `query_params` (sanitized — never raw PII), `result_count`, `timestamp`. This is the forensic record proving internal-only use under REBNY or NY DOS inquiry.

### 1.13 — Every result must show five disclaimer elements

Every CRM result surface that displays public-records data must show all five of the following elements visibly on the page:

1. **"Internal research only"** — clear, unambiguous label
2. **"Not an active listing"** — clear, unambiguous label
3. **"Availability unknown unless separately verified"** — applied per unit/per property
4. **"Source: public government records"** — followed by the specific sources used
5. **"Data as of [date]"** — the `data_as_of` timestamp from the underlying record(s)

None of these elements may be hidden, collapsed by default, rendered with reduced contrast, or styled smaller than the surrounding body text. The five elements are functionally a unit; partial display is not compliant.

### 1.14 — Safe search labels

The following labels are approved for use in code identifiers, UI text, navigation, breadcrumbs, page titles, URL paths, log entries, and any user-facing surface:

- **Public Records**
- **Building Intelligence**
- **Unit Records**
- **Sponsor-Held Research**
- **Internal Property Research**

These are the only approved framings. Variations that preserve the intent (e.g., "Public Records Search") are acceptable. Variations that drift toward listing/inventory framing are not.

### 1.15 — Forbidden labels

The following labels are **prohibited** in code identifiers, UI text, navigation, breadcrumbs, page titles, URL paths, log entries, comments, schema names, column names, enum values, default text content, and any user-facing or developer-facing surface:

- **Off-market listings** · **Off-market** · `off_market`
- **Exclusive listings** · **Exclusive**
- **Available listings** · **Available** (as a standalone status term)
- **Hidden inventory** · `hidden_inventory`
- **Shadow inventory** · `shadow` · `shadow_inventory`
- **Pre-market** · `pre_market` · `premarket`
- **Coming Soon** · `coming_soon` (reserved REBNY RLS status — only mallan-nyc `Listing` model may use it, never the public-records database)

These labels are prohibited under REBNY UCBA 2026 Art. I §5(D) and NY DOS 19 NYCRR §175.25, and remain prohibited even for internal use because agents may inadvertently repeat them to clients. Enforcement is at code-review time and via grep-based CI guard (to be specified in the implementation plan).

### 1.16 — Allowed CRM CTAs

The CRM may present the following calls-to-action to authenticated agents/admins when viewing public-records data:

- **Log research note**
- **Verify availability**
- **Log sponsor-office call**
- **Create internal follow-up**

These are internal workflow actions. They generate audit-trail entries and routing within mallan-nyc workflows. They do not initiate any transactional process on the underlying property.

### 1.17 — Forbidden CTAs

The CRM **must not** present the following calls-to-action on any surface that displays public-records data:

- **Schedule showing**
- **Apply now**
- **Make offer**
- **Contact listing agent**
- **View exclusive**

These CTAs imply a transactional or representational relationship that the public-records source does not establish. The agent is free to take any of these actions manually, on the phone, using contact information displayed on the page — but the CRM must not provide a one-click affordance that mimics a listing platform.

### 1.18 — Initial searchable sources

The Public Records Intelligence database initially indexes the following sources only:

1. **NY AG Schedule A / offering plans** — `offeringplan.datasearch.ag.ny.gov`
2. **ACRIS deeds and mortgages** — NYC Open Data + ACRIS web (Manhattan/Brooklyn/Queens/Bronx; Staten Island via RPAD)
3. **DOB Certificates of Occupancy (TCO + Final CO)** — NYC Open Data + DOB BIS
4. **DOB / HPD violations** — NYC Open Data
5. **DOF tax, BBL, condo apportionment** — NYC Open Data + DOF web
6. **NY DOS Corporations** — NYS DOS public entity search
7. **421-a / J-51 abatements** — NYC Open Data + NYU Furman CoreData

Additional sources may be added later via charter amendment, not by ad-hoc PR.

### 1.19 — Implementation sequence

Implementation must proceed in the following sequence. Each step requires its own approval before the next begins:

1. **Charter** (this document) — merged
2. **Attorney / compliance review** — outside written confirmation that the design pattern is defensible under REBNY UCBA, NY DOS §175.25, NY GBL §349, and NY SHIELD
3. **Separate Neon DB provisioning plan** — what project, what access controls, what backup policy
4. **Scanner plan** — Scanner #14 (NY AG) and Scanner #15 (DOB CO/TCO), parse strategies, throttle, error handling
5. **Schema plan** — table-by-table DDL with column comments and forbidden-token CI check
6. **CRM read-path plan** — API routes, DTO sanitizer extension, UI components, audit-event logging
7. **Maya-only beta** — Maya tests for two weeks with real building lookups
8. **Limited internal rollout** — extended to 2–3 trusted Mallan agents, then full firm

No step may be skipped. No step may be merged with another. Each produces its own PR after approval.

### 1.20 — Charter does not approve implementation by itself

Merging this charter does **not** authorize provisioning the Neon project, writing scanner code, creating schema migrations, adding API routes, modifying DTO sanitizers, or touching the CRM UI. It authorizes only the governance rules that all future implementation work must follow. Each implementation step requires its own approval per Article 1.19.

---

## Article 2 — Database naming convention (binding)

When the schema plan in Article 1.19 step 5 is approved, the public-records Neon database **must** use the following table names exactly:

| Table | Purpose |
|---|---|
| `public_records_buildings` | One row per building; BBL, address, sponsor entity, offering-plan metadata |
| `public_records_units` | One row per unit derived from Schedule A; launch price, beds/baths/sqft, % CI |
| `public_records_ownership` | One row per ownership transaction from ACRIS; current and historical, versioned |
| `public_records_sales_offices` | Sponsor sales-office contact info from AG filings or sponsor disclosures |
| `public_records_certificates_of_occupancy` | DOB TCO + Final CO records |
| `public_records_abatements` | 421-a, J-51, and similar abatement schedules per building/unit |
| `public_records_violations` | DOB and HPD open violations per building/unit |
| `public_records_action_logs` | Internal-only agent log of calls, notes, and verification observations |

Adding a table outside this list requires a charter amendment.

---

## Article 3 — Field naming rules (binding)

### 3.1 — Required fields on every row

Every row in every `public_records_*` table must include these fields:

| Field | Type | Value |
|---|---|---|
| `source_type` | string enum | Always `public_record` for these tables |
| `visibility` | string enum | Always `internal_crm_only` |
| `availability_status` | string enum | Default `unknown`; only changed when an agent has manually verified |
| `is_listing` | boolean | Always `false` for these tables |
| `data_as_of` | timestamp | The verified-as-of timestamp from the underlying source |

These five fields are **defensive in depth**. Even if a future read path accidentally returns a public-records row through the wrong sanitizer, the receiving code can refuse to display it on a public surface by checking these flags.

### 3.2 — Forbidden field assignments

The following assignments are charter violations:

- `idx_display_yn = true` on any `public_records_*` row
- `_source = 'idx'` on any `public_records_*` row
- `_source = 'rls'` on any `public_records_*` row
- `_source = 'exclusive'` on any `public_records_*` row
- Setting `is_listing = true` on any `public_records_*` row
- Setting `visibility = 'public'` on any `public_records_*` row
- Adding a foreign key from a `public_records_*` table to any mallan-nyc Prisma table
- Adding a foreign key from any mallan-nyc Prisma table to any `public_records_*` table

---

## Article 4 — DTO surface (binding)

### 4.1 — The three tiers

| Sanitizer | May emit public-records fields? | Audience |
|---|---|---|
| `sanitizeForPublic` | **NO** | Anonymous visitors to mallan.nyc |
| `sanitizeForVOW` | **NO** | Authenticated VOW consumers |
| `sanitizeForPortal` (buyer/tenant/seller/landlord) | **NO** | Authenticated portal clients |
| `sanitizeForCRM` (or extension) | YES — only this one | Authenticated Mallan agents and admins |

### 4.2 — CI-enforced guards

The implementation plan must produce unit tests in mallan-nyc CI that:
- Import each non-CRM sanitizer
- Feed it a synthetic record with a known public-records-shaped field set
- Assert that the sanitizer emits no field whose name begins with `public_records_` and no field whose `source_type` is `public_record`

These tests must run in the standard `npm run ci` chain alongside `ucba:audit`, `rls:validate`, `compliance-check`, `idx:validate`, and `crm:test`.

---

## Article 5 — Result-surface disclaimer block (binding)

Every CRM page or API response that surfaces public-records data must render the following block, prominently, near the displayed data:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⓘ  Internal Research Only — Not an Active Listing              │
│                                                                  │
│  Availability is unknown unless separately verified by an agent.│
│  Source: public government records (see attribution below).      │
│  Data as of: [data_as_of timestamp]                              │
└─────────────────────────────────────────────────────────────────┘
```

The five elements (Article 1.13) must be displayed together as a unit. The block must be visible on initial render without scrolling, expansion, or hover.

---

## Article 6 — Audit-event contract (binding)

Every read from the public-records database via a CRM route writes a row to mallan-nyc Prisma's `AuditEvent` with at minimum:

```
{
  event_type: 'public_records_query',
  agent_id: <Mallan agent ID>,
  route: <API route path>,
  query_params: <sanitized — no raw PII, no full content>,
  result_count: <integer>,
  data_sources_queried: <array of source identifiers from Article 1.18>,
  timestamp: <ISO 8601>
}
```

These audit rows are retained for the 2-year audit-event retention window already defined in `CLAUDE.md` (NY SHIELD + REBNY).

---

## Article 7 — Cross-charter relationships

### 7.1 — Relationship to `REPO-SOURCE-OF-TRUTH-CHARTER.md`

This charter does not modify the source-of-truth charter. The public-records database is a new, distinct domain — not a parallel system within an existing domain. Per the source-of-truth charter, distinct domains may have their own files and stores; what is forbidden is parallel files within a domain (e.g., `search-v2.ts` next to `search.ts`).

### 7.2 — Relationship to the REBNY compliance skill

This charter operates within the rules in `.claude/skills/rebny-compliance/SKILL.md`. Where this charter is stricter (e.g., extending the "Off-Market" prohibition to internal code identifiers), the stricter rule wins.

### 7.3 — Relationship to the external-inventory hold

This charter does **not** release the hold documented in `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`. The external-inventory spec remains parked. Public-records intelligence is a distinct workstream and its sequencing under Article 1.19 is independent of the external-inventory release conditions.

### 7.4 — Relationship to in-flight design work

The design document at `mallan-marketing-plans/2026-05-14-public-records-intelligence-design.md` is the companion technical spec for this charter. Where the design and this charter conflict, **this charter governs.** The design is the input to the implementation-planning step (Article 1.19, step 4 onward); this charter is the boundary the implementation cannot cross.

---

## Article 8 — Amendment procedure

This charter may be amended only by a PR that:
1. Modifies this file (`docs/architecture/PUBLIC-RECORDS-DB-CHARTER.md`) directly,
2. Records the amendment date and rationale in an "Amendment History" appendix below,
3. Carries Maya Allan's explicit approval as the licensed broker of record,
4. Is reviewed against the REBNY compliance skill for any regression on UCBA, §175.25, or Trestle isolation rules.

Implementation PRs that conflict with this charter must either be rejected or paired with an amendment PR that lands first.

---

## Article 9 — Priority Geography for V1

This article fixes the v1 geographic scope of the Public Records Intelligence database. It exists for two reasons: (1) Maya has an active buyer client looking at Brooklyn new development, so the scanner must cover those specific neighborhoods in the first build; and (2) targeted scope is the principal control keeping the public-records Neon database lean within the free-tier 500 MB / 100 CU-hr budget.

### 9.1 — V1 in-scope geography

The v1 build covers exactly the following neighborhoods. No other neighborhoods may be ingested in v1.

**Manhattan — core and new-development corridors:**
- 102nd Street south through the Financial District (matches the Townhouse-Hunter Phase B scope in `mallan-marketing-plans/2026-05-12-townhouse-hunter-completion-plan.md`)

**Brooklyn — priority neighborhoods for V1:**
- DUMBO
- Boerum Hill
- Clinton Hill
- Cobble Hill
- Williamsburg
- Fort Greene

### 9.2 — Coverage commitment per source

All seven initial searchable sources defined in Article 1.18 ingest data for buildings located in the V1 geography above. Specifically:

| Source | V1 coverage commitment |
|---|---|
| NY AG Schedule A / offering plans | All NYC condo offering plans whose primary building address falls in the v1 geography |
| ACRIS deeds and mortgages | All deeds and mortgages whose property BBL maps to a building in the v1 geography |
| DOB Certificates of Occupancy (TCO + Final CO) | All CO records for buildings in the v1 geography |
| DOB / HPD violations | Open violations for buildings in the v1 geography |
| DOF tax / BBL / condo apportionment | Tax, BBL, and apportionment records for buildings in the v1 geography |
| NY DOS Corporations | Sponsor entities + principals for any sponsor whose buildings include at least one v1-geography building |
| 421-a / J-51 abatements | All abatements applied to buildings in the v1 geography |

Buildings outside the v1 geography are explicitly excluded from ingestion in v1, even when they fall in the same source dataset.

### 9.3 — Rationale: free-tier discipline

This article reflects a deliberate engineering decision to operate the public-records database on Neon's free tier for v1, in line with `NEON.md` discipline. Targeted scope is the principal compute and storage control:

- A second Neon free project (separate from the mallan-nyc primary project, per Article 1.9) provides 500 MB of storage and 100 CU-hr/month of compute at zero cost.
- V1 geography is sized to fit comfortably within that budget. Conservative estimate: under 200 MB at year 1 for the scope above, leaving meaningful headroom.
- Year-2 expansion will reassess capacity via a Neon `ops:health`-equivalent script against the public-records project specifically. Expansion to additional neighborhoods triggers a charter amendment per Article 8.
- Choosing a different free Postgres provider (Supabase, CockroachDB Serverless, Xata, Tembo, self-hosted) is not permitted in v1 without a charter amendment per Article 8. This article fixes "Neon free tier" as the v1 hosting decision.

### 9.4 — Deferred expansion

The following geographies are explicitly **out of scope for v1**, to be reconsidered only after Maya completes solo beta (Article 1.19, step 7) and the system has demonstrated stable read/write performance within the free-tier budget:

- **Brooklyn (deferred):** Park Slope, Carroll Gardens, Brooklyn Heights, Crown Heights, Prospect Heights, Bedford-Stuyvesant, Greenpoint, Bushwick, Gowanus, Red Hook, Sunset Park, Bay Ridge, Bensonhurst, Sheepshead Bay, Coney Island, and any Brooklyn neighborhood not enumerated in Article 9.1
- **Manhattan (deferred):** Any Manhattan neighborhood above 102nd Street (Inwood, Washington Heights, Hamilton Heights, Marble Hill, etc.)
- **Queens:** all neighborhoods
- **Bronx:** all neighborhoods
- **Staten Island:** all neighborhoods
- **Outside NYC:** Long Island (Nassau, Suffolk), Westchester, Rockland, Hudson Valley, upstate New York

### 9.5 — Internal-only language preserved

This geography article does **not** alter any of the internal-only, no-public-exposure, non-listing rules elsewhere in this charter. Specifically:

- Article 1.1 (internal CRM-only) — unchanged
- Article 1.5 (never on public mallan.nyc website) — unchanged
- Article 1.6 (never in buyer/tenant/seller/landlord portals) — unchanged
- Article 1.7 (never via sanitizeForPublic or sanitizeForVOW) — unchanged
- Article 1.15 (forbidden labels: off-market, exclusive, available, hidden inventory, shadow inventory, pre-market, coming soon) — unchanged
- Article 4 (DTO surface rules) — unchanged
- Article 10 (no persistent commingling with Trestle/RLS) — unchanged

The geography expansion is a scope addition, not a posture change. Brooklyn buildings are ingested under exactly the same internal-only, non-listing, audit-logged constraints as Manhattan buildings.

### 9.6 — Amendment path for v1 geography changes

Adding a neighborhood to the v1 in-scope list before solo beta completes, or removing a v1 neighborhood, requires a charter amendment PR per Article 8. Such an amendment must:
1. State the neighborhood being added/removed
2. State the projected storage impact in MB
3. State the projected compute impact in CU-hr/month
4. Demonstrate the change still fits within the public-records Neon free-tier budget (or trigger Article 9.3's upgrade reconsideration)
5. Carry Maya's explicit approval

---

## Amendment history

_None yet. This is the initial charter._

---

## Appendix A — Quick-reference cross-references

| Topic | Path |
|---|---|
| REBNY UCBA + Trestle + Fair Housing + Advertising compliance | `.claude/skills/rebny-compliance/SKILL.md` |
| Source-of-truth charter (architecture) | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Companion design (cross-repo) | `mallan-marketing-plans/2026-05-14-public-records-intelligence-design.md` |
| Phase B 13-scanner system (extended to 15) | `mallan-marketing-plans/2026-05-12-townhouse-hunter-completion-plan.md` |
| Phase A compliance pipeline | `mallan-marketing-plans/2026-05-12-mallan-marketing-phase-a-plan.md` |
| Active follow-up (master plan + holds) | `CLAUDE.md` top block + `memory/REFACTOR-2026-04-25.md` |
| External-inventory hold (NOT released by this charter) | `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` |
| Neon / Prisma / migration discipline | `NEON.md` |

---

End of charter.
