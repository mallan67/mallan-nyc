# Mallan platform plan — the canonical normative document

**Repository:** `mallan67/mallan-nyc` · **Base:** safe `main` `04db1b99` ·
**Reconstructed:** 2026-07-30

This is the **single** normative platform plan and **the only normative
document in this change**. It was not taken wholesale from either unmerged
planning line: it was built from a per-requirement reconciliation of both.

> **The reconciliation working materials are HISTORICAL and NON-NORMATIVE, and
> they are not part of this repository.** The 608-row ledger, its machine-readable
> dispositions, its frozen baseline, its validation artifact and the ancestry
> evidence are preserved at the protected archival tag
> `archive/platform-plan-reconciliation-corpus-53688877`.
> They are **evidence of how this plan was assembled, not an authority over it**,
> and they carry known unvalidated defects recorded in that tag's annotation.
> **Where this plan and any archived material differ, this plan governs.**

> **A `deferred_with_gate` item is accounted for. It is *not* a settled product
> or policy decision.** **31** requirements are deferred:
>
> `BIZ-4`, `CAP-CANONICAL-PERSON`, `CAP-CANONICAL-PROPERTY`, `CAP-CLIENT-PORTALS`, `CAP-COMPLIANCE-GATES`, `CAP-EVENT-OUTBOX`, `CAP-IDX-COTALITY-ADAPTER`, `CAP-MEDIA-AI-PROVENANCE`, `CAP-MEDIA-SYNC`, `CAP-POLICY-REGISTRY`, `CAP-SEARCH-CANONICAL`, `CAP-WORKFLOW-ENGINE`, `CONFLICT-CAPABILITY-VOCABULARY`, `CONFLICT-POL-GATE34-PORTAL`, `IAM-10`, `LST-16`, `MKT-4`, `P0`, `P1`, `P10`, `P11`, `P2`, `P3`, `P4`, `P5`, `P6`, `P7`, `P8`, `P9`, `PER-1`, `PER-4`.
>

>
> Separately, **6 machine-governance artefacts** from the PR #579 line are deferred
> with them — `config/capabilities.mjs`, `scripts/capability-audit.mjs`, the
> `package.json` `capability:audit` entry and three evidence documents. They are
> files, not requirements, and are preserved by PR #579's archival tag.
>
> This plan records what is decided, what is deferred, and what is contested, and
> never presents the second or third as the first. The per-row evidence behind
> these dispositions is historical and lives only at the archival tag; **this
> list is normative, the archived evidence is not**.

> **These figures are stated by this plan and are not machine-verified.** No
> generator, verifier or CI job in this repository recomputes them. They were
> derived from the reconciliation materials now preserved at the archival tag,
> and they are maintained and reviewed **by hand**. Treat them as dated evidence
> under §0.5, not as an automatically enforced invariant.

Every section below names the requirement families and IDs it implements.
Those identifiers are **defined by this plan**; the archived reconciliation
materials record how each was resolved but do not override anything stated
here.

---

## 0. Authority and evidence rules

*Implements:* `DOC-1`…`DOC-8`, `AGT-1`…`AGT-7`, `OPS-1`…`OPS-8`,
`GATE-1`…`GATE-8`, `AUD-1`…`AUD-5`, `COT-1`…`COT-5`, `REB-1`…`REB-3`, `BIZ-0`,
`C-7`

### 0.1 Plan authority

Only this file establishes platform-wide architecture, business rules,
implementation sequence, or cross-system contracts (`DOC-1`). It lives at a
stable path and is **amended in place**; `-REV*`, `-FINAL`, `-NEW`, `-ADDENDUM`
and date-suffixed variants are forbidden (`DOC-3`).

### 0.2 Operational-document authority

`AGENTS.md`, `AI-START-HERE.md`, `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md` and `README.md` **route** to this plan. They
may summarize; they may not state a competing architecture (`DOC-2`).
Live operational status lives in `docs/PROJECT-HEALTH-DASHBOARD.md` and
`docs/PLATFORM-ISSUE-REGISTRY.md`, not here.

### 0.3 Provider authority

Cotality/Trestle controls transport, resources, fields, types, enums,
relationships, pagination, throttling and errors for Mallan's licensed account
(`COT-1`). Everything provider-derived is pulled live (`COT-11`). A committed
copy of provider vocabulary is a **cache, never an authority** (`COT-12`);
unreachable is **not** unchanged (`COT-13`); detected drift **blocks**
(`COT-14`). **Field existence is not permission** (`COT-4`).

**License limits are cumulative, not ranked.** `COT-2`'s precedence order breaks
*ties between conflicting sources*; it does **not** mean a general REBNY rule
overrides a narrower restriction in Mallan's executed IDX Plus licence. Where a
general rule permits a use and the licence or written authorization restricts it
— narrower inventory, a field usable internally but not publicly, an export not
covered — **the narrower constraint governs and every applicable constraint must
be satisfied simultaneously.** Reading precedence as "the higher source wins,
so the licence can be ignored" would authorize use beyond what Mallan actually
licensed. When the licence's scope for a specific use is unclear, `REB-3`
applies: stop and report.

### 0.4 Compliance authority

REBNY controls RLS policy, participation, display obligations, feed rights,
attribution and effective dates (`REB-1`), applied by effective date (`REB-2`).
Every obligation records its authority explicitly — `NY_STATUTE`,
`NY_REGULATION`, `NYC_LAW`, `REBNY_UCBA`, `REBNY_RLS`, `NAR_MLS_POLICY`,
`BROKERAGE_POLICY` (`BIZ-0`). **No generated text may describe a REBNY, UCBA or
MLS obligation as "required by New York law."**

Per-area canonical rules live in `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`,
**which is the authority for compliance rule text.** This plan points at it
rather than maintaining a parallel rule set.

**One deliberate exception, stated rather than hidden.** §13.2 reproduces the
`POL-1.1` gate-by-gate null-semantics table in full. That is not an oversight
and not a second authority — it is there because `POL-1.3` requires that any
change to gate-3 or gate-4 null handling **cite this requirement**, and because
paraphrasing that table is precisely what produced the 2026-04-30 incident. The
authority model for it is therefore explicit:

- `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and the canonical file it
  points to remain **authoritative for the rule**;
- §13.2 is a **verbatim, non-paraphrasable transfer** carried here so that the
  requirement is unmissable at the point of architectural decision;
- **if the two ever differ, the canonical compliance file wins and §13.2 is the
  defect** — fix §13.2, never the canonical file, and record the correction;
- no other compliance rule is reproduced in this plan.

Everywhere else, this plan carries **requirement IDs and pointers only**.

### 0.5 Dated evidence

Measured baselines are **dated evidence, not architecture facts** (`C-7`). Every
count, assessment and probe result carries its date and the commit it was taken
against. This rule has already been proven necessary twice inside this
reconciliation: the provider vocabulary had already drifted from the committed
copy when checked (`COT-15`), and the ancestry document's own counts were wrong
twice and had to be corrected (`AUDIT-GOVERNANCE-DRIFT`). **Counts in this plan
were derived from the reconciliation materials rather than asserted from
memory** — but no verification tooling ships in this repository, so they are
**hand-maintained and unverified**, and they are dated evidence rather than
architecture facts.

### 0.6 Implementation, production and completion evidence

```text
implemented  !=  merged  !=  deployed  !=  production_proven
```

These are four different claims. A capability is not complete without exact
tests, production or immutable-preview proof, health evidence, rollback,
documentation and operational ownership (`OPS-1`). Completion is a **structured,
machine-checkable claim**, never prose (`GATE-1`), carrying method, verbatim
command *including any wrapper*, raw (not summarized) output, integer exit code,
`target_sha`, environment, and both `proves` and `does_not_prove`.

A source read never substitutes for a rendering or behavior claim (`OPS-4`,
`GATE-2` `SOURCE_READ_FOR_BEHAVIOR`). A search finding nothing proves
**"not found in the searched paths"**, never "does not exist" (`GATE-5`,
`HYG-1`, `AGT-6`).

### 0.7 Conflict handling

When a REBNY/RLS/IDX/display/attribution requirement is unclear, conflicting or
absent from the canonical source: **stop and report** (`REB-3`, and CLAUDE.md
§E). Do not guess from memory. Do not extrapolate from one field's handling to
another's. Contested items become explicit conflict records with a decision
owner and a gate — currently `CONFLICT-POL-GATE34-PORTAL` (§11.3) and
`CONFLICT-CAPABILITY-VOCABULARY` (§16). Both are recorded **without** selecting
a side; a conflict resolved by quiet preference is not resolved.

### 0.8 Identifier integrity

A withdrawn or reassigned requirement **keeps its identifier**, marked
`RETIRED`, with reason and replacement recorded. **An identifier is never
reassigned to a different requirement without an entry in the identifier
retirement map** (`DOC-8`). **The map below is normative and lives in this
plan.**

Currently retired/remapped: `BUS-5` → `REB-1`, `BUS-6` → `BUS-5`,
`BUS-7` → `BUS-6` (with `BUS-7` then reused for new content, disambiguated in
the map); plus two non-reassignments recorded for traceability — `ARC-1`
(corrected wording) and `POL-1` (**superseded statement**; see §13.2).

### 0.9 Requirement retirement

No source document is retired until its coverage row exists and states where
each requirement landed (`DOC-6`). Retirement means the file **stops calling
itself authoritative**; git history preserves it and nothing is deleted
(`DOC-4`).

---

## 1. Current verified system baseline

*Implements:* `OPS-024`, `OPS-025`, `OPS-026`, `MAIN-GOVERNANCE-001`…`006`,
`MAIN-SCHEDULES-001`, `AUDIT-*`, `C-3`, `C-7`

> **This section is dated evidence, not permanent architecture** (`C-7`).
> Captured 2026-07-30 against safe `main` `04db1b99`, read-only.

| item | value |
|---|---|
| Safe `main` / production SHA | `04db1b9921130cc1150f29508101567537573acb` |
| Ingestion architecture | `one-cycle` cron, currently every 10 minutes (`MAIN-SCHEDULES-001`) |
| Canonical database | Neon `hidden-mountain-87248164` · `ep-cold-waterfall-adno3ao2` · branch `main` |

### 1.1 Open incidents

- **`OPS-024`** (P0) — Phase 1A froze Property ingestion for four cycles.
  The two keyset streams shipped using the default `IDX_PLUS_SELECT_FIELDS`,
  which requests `SourceSystemKey` — renamed to `ListingKey` by the mapper
  *after* the fetch — and not `ListingKey` itself. `SourceSystemKey` is null
  feed-wide and the cursor/merge layer reads **raw** rows *before* that rename,
  so every row was rejected `missing_listing_key` and both streams froze on the
  bootstrap epoch. Recovered by rollback plus revert of `main`.
  This is the empirical proof of `COT-6` and `AUDIT-PROVIDER-BOUNDARY`.
- **`OPS-025`** — `mls_id IS NULL` on 22,809 of 23,980 IDX listings (95.1%).
  Pre-existing; explicitly **not** Phase 1A scope. Carried as a known open
  condition so it is not later mistaken for regression.
- **`OPS-026`** (confirmed 2026-07-30) — public listing pagination occurs
  before final display and matched-pair filtering. Full evidence in §6.3.

### 1.2 Open contested items

Both are `deferred_with_gate` — **accounted for but policy-unresolved**. Both
are **open** and both require Maya's decision.

- **`CONFLICT-POL-GATE34-PORTAL`** — portal gate 3/4 null semantics. See §11.3.
  No code change is authorized.
- **`CONFLICT-CAPABILITY-VOCABULARY`** — capability maturity vocabulary: the
  archived prototype registry and §16 use different status lists. See §16.
  **Neither list is adopted**, and it must be settled before any machine
  enforcement returns. Decision owner **Maya**.

### 1.3 Holds

Neon settings/pool · media and R2 · schema migrations · env vars · cron config ·
`public/crm/**` · agents · skills · `.github/workflows/**` · manual cron
triggers · reconciliation runs · admin merge bypass · force-push to `main` ·
PR 5B reader swap · external inventory · syndication exports.
`C-3` makes **Neon/R2 remediation a hard dependency gate**, not parallel work.

### 1.4 Active legacy fallbacks — none may be removed

`Listing.media` JSON · `raw_data.Media` · relational `ListingMedia` ·
live provider media fallback · the DB-vs-Trestle search fallback.
**No fallback removal is authorized by this plan** (`HYG-1`, `HYG-6`).

### 1.5 Schema-only capabilities — schema is not implementation

`CanonicalProperty`, `CanonicalBuilding`, `CanonicalUnit`, `ListingIdentity`,
`IdentityMatchAudit`, `IdentityReviewQueue` exist as schema with **zero
non-test references** in `app/` or `lib/` (`AUDIT-PROPERTY-IDENTITY`). See §9.

### 1.6 Not production-proven

No capability in the registry carries production evidence meeting `GATE-1`.
`P3` "Canonical search runtime" is recorded `implemented` with evidence `E-1`,
but `OPS-026` is inside that program's scope, so **`implemented` is not
conformance**.

### 1.7 In-flight work

**PR #589** — draft, unmerged, undeployed, head `de35ad1e`. The corrected
Phase 1A. Untouched by this plan.

---

## 2. Product and business platform

*Implements:* `BUS-1`…`BUS-7`, `BIZ-0`…`BIZ-13`, `LST-*`, `SEA-*`, `CRM-*`,
`SEL-*`, `MKT-*`, `TXN-*`, `BRK-*`, `INT-*`, `PER-*`

One NYC brokerage operating system with distinct experiences sharing **one**
application foundation, identity model, contract vocabulary, policy system,
error model, event history and audit trail (`BUS-1`). Shared foundations do
**not** mean one generic screen — buyer, tenant, seller, landlord, agent, broker
and public remain distinct products (`BUS-4`).

| surface | governing families |
|---|---|
| Public search and discovery | `SEA-1`…`SEA-10`, `POL-1`, `COT-11` |
| Mallan-owned listing authority | `LST-4`, `LST-5`, `LST-13`, `BUS-5` |
| Provider listings | `LST-2`, `LST-12`, `COT-1`…`COT-17` |
| CRM | `CRM-1`…`CRM-7`, `BUS-3` |
| Agent operating system | `CRM-*`, `ACT-4`…`ACT-7` |
| Broker operating system | `BRK-1`…`BRK-7` |
| Buyer / tenant portals | `PER-12`, `AUZ-5`, `IAM-2`…`IAM-4` |
| Seller portal | `SEL-1`…`SEL-5`, `CMA-1`…`CMA-10` |
| Landlord portal | `SEL-*`, `BIZ-12`, `TXN-9`, `TXN-10` |
| Professional / transaction-party portals | `PER-4`, `TXN-3`, `TXN-12` |
| Communications | `MKT-1`…`MKT-3`, `MKT-5`, `PER-8`, `PER-11` |
| Marketing | `MKT-1`…`MKT-8`, `POL-5`, `BIZ-8` |
| Reporting | `BRK-6`, `BRK-7`, `SEL-2` |
| Transactions | `TXN-1`…`TXN-12`, `BIZ-4`…`BIZ-6` |
| Compliance | `POL-1`…`POL-6`, `REB-1`…`REB-3`, `BIZ-0` |
| Property intelligence | `CMA-*`, `INT-1`…`INT-6` |
| Relationship intelligence | `PER-1`…`PER-12`, `INT-*` |
| Workflow and approvals | `C-1`, `AUDIT-WORKFLOW-OUTBOX`, `IAM-9` |

**Business boundaries.** Mallan does not write listing changes back to Cotality
(`BUS-2`). The architecture is complete without any external listing-entry
product (`BUS-7`). **`mallan67/mallan-nyc` only — Mallan Integrated is out of
scope** (`BUS-6`).

---

## 3. Actor, subject and authorization

*Implements:* `ACT-1`…`ACT-7`, `AUZ-1`…`AUZ-6`, `IAM-1`…`IAM-10`, `PER-12`,
`AUDIT-PORTAL-ACTOR-SUBJECT`

### 3.1 The vocabulary

```text
actor                 who is performing the operation
subject               whose data the operation concerns
identity_domain       staff | client | service | anonymous
representation        the executed agreement, if any, linking actor to subject
relationship          the durable role-scoped link between person and matter
workspace             the bounded set a principal may operate within
operation             the use case being invoked
on_behalf_of_authority  the recorded basis for acting for another party
audit_identity        the identity written to audit history, never inferred
```

**`actor` and `subject` are different things.** Conflating them is the defect in
`AUDIT-PORTAL-ACTOR-SUBJECT`.

Actor classes (`ACT-1`, and `AUZ-1` uses the same set): `anonymous`, `client`,
`agent`, `broker`, `system_job`, `service_identity`.

Actor context is resolved **once**, by an adapter, and passed already-resolved
(`ACT-3`, `IAM-1`). A domain service that inspects transport to determine who is
calling is a defect (`ARC-7`, `ARC-9`).

Capacity is held by a person, not by an account type; each action records
`acting_capacity` (`ACT-5`). One person may hold both `broker` and `agent`
(`ACT-4`).

### 3.2 Authorization

Role alone never authorizes. Authorization evaluates actor role, resource
ownership, brokerage relationship, client relationship, listing relationship,
portal entitlement, field-level visibility and action-level permission
(`AUZ-2`). Listing entitlement additionally evaluates `record_source`,
`mallan_web_id`, `provider_identity`, `reconciliation_status`, ownership,
representation and audience (`AUZ-5`).

Broker permissions expand **operational** access and can never bypass REBNY,
license, provider, privacy or legal restrictions (`AUZ-3`).

Four outcomes stay distinct (`AUZ-6`): authorized-but-empty → success with an
explicit empty state; missing broad permission → `FORBIDDEN`;
identifier-addressed mismatch → `RESOURCE_NOT_AVAILABLE`; real failure → the
applicable code. **An authorized-but-empty result is never a denial, and a
denial is never an empty result** (`ERR-1`).

Unauthorized and nonexistent identifier-addressed resources must be
indistinguishable, to prevent enumeration (`AUZ-4`). Byte-identical timing is
explicitly **not** required; the requirement is that the application does not
branch in a way an observer can measure.

### 3.3 Unresolved and gated — Agent ID versus Lead ID

**Status: unresolved, gated.** `requirePortalRole` permits agent and broker
principals while routes reinterpret `auth.userId` as `Lead.id`, conflating actor
with subject. `Session.user_type` admits only `"agent"|"lead"` and
`Session.user_id` is a single `BigInt`, so the schema cannot currently
distinguish them. Resolution depends on the person-identity foundation (§10) and
therefore on the schema-migration hold. **No change is authorized here.**

---

## 4. Provider contract architecture

*Implements:* `COT-1`…`COT-17`, `ARC-1`, `AUDIT-PROVIDER-BOUNDARY`, `OPS-024`,
`C-2`, `AUDIT-IDX-GOD-MODULE`

### 4.1 The pipeline

```text
Cotality transport
  → typed raw response
  → raw-field validation          ← the boundary OPS-024 crossed unsafely
  → normalization                 ← where mapper renames occur
  → normalized domain record
  → cursor / deduplication        ← MUST read normalized records, not raw rows
  → persistence
  → read projection
  → public DTO
```

All Cotality calls occur server-side through a controlled adapter (`ARC-1`).

### 4.2 `OPS-024` as the concrete failure case

The keyset cursor read **raw** rows *before* normalization, while the `$select`
requested `SourceSystemKey` — which the mapper renames to `ListingKey`
*after* the fetch. `SourceSystemKey` is null feed-wide, so at the cursor's
position in the pipeline no row carried a key. Every row was rejected
`missing_listing_key`; both streams froze; four production cycles processed zero
records. Every fixture had fabricated `ListingKey`, so 5,814 passing tests never
exercised the production request shape.

**Rules this proves, not merely illustrates:**

1. **Preserve both provider identifiers** and never let local code silently
   treat one as the other (`COT-6`).
2. Any stage reading **raw** rows must declare the raw fields it requires, and
   the select list must be **asserted** to contain them.
3. A test whose fixture fabricates a provider field proves nothing about the
   production request shape (`OPS-3`, `GATE-2`).

### 4.3 Live-truth rules

Everything provider-derived is pulled live (`COT-11`): no guessing a field name,
type, value or meaning; no assuming a value is unchanged; no placeholder pending
correction; no spot-patching one mapping while equivalents go stale; no copying
from another market, provider, standards document, CSV, prior audit, code
comment or agent memory; no inferring from a field name; no hardcoded status,
permission or classification string.

Attribution is provider-derived and never composed locally or carried forward
stale (`COT-16`). Mapping tables are **generated, not authored** (`COT-17`).
Unknown values are preserved raw, logged, reported and **quarantined** from
regulated outputs until classified (`COT-10`). Media uses verified provider keys
and exact provider URLs, never constructed (`COT-7`).

### 4.4 Integration location

Cotality integration stays under **`lib/idx/`**. **No competing integration
tree** (`C-2`). This does not conflict with decomposing the module: `lib/idx/`
currently concentrates fetch, map, persist, media, cache and cursor concerns
across 6,421 lines in two files (`AUDIT-IDX-GOD-MODULE`), and the fix is to
decompose **within** one tree. Growing a second tree would be the competing-
contracts failure `ARC-8` forbids.

---

## 5. Listing authority and identity

*Implements:* `LST-1`…`LST-17`, `BUS-5`, `CMA-8`, `SEA-7`

### 5.1 Prefixes — exact meanings

```text
SL-*   Mallan web SALE listing identifier
RL-*   Mallan web RENTAL listing identifier
RLS*   separate REBNY/Cotality PROVIDER listing identifier
```

The prefix identifies **transaction type only**. It does **not** establish
whether a Cotality counterpart exists (`LST-4`).
**`RL-` is not an abbreviation of `RLS`.** Treating `RL-` as a provider prefix
would apply Mallan-owned display handling to provider records — a compliance
failure.

### 5.2 Dimensions kept separate

The prefix must never be overloaded (`LST-5`): `transaction_type`,
`record_source`, `mallan_web_id`, `provider_identity`, `reconciliation_status`
(`not_searched` | `no_match` | `possible_match` | `verified_match` | `conflict` |
`broken_match`), `public_canonical_source`.

**Current shortcut, recorded not endorsed** (`LST-9`): `lib/search/public-listing-db.ts:219-223`
filters `exclusive=mallan` by `listing_id startsWith "SL-"/"RL-"`. This is an
implementation shortcut, not the business definition. Replacing it requires the
explicit fields above and therefore the schema-migration hold.

### 5.3 Matched pairs

On a verified match (`LST-7`): the `SL-`/`RL-` record remains the canonical
mallan.nyc page; the provider counterpart remains stored, refreshed and
**read-only**; the provider duplicate is **suppressed** from public results,
cards, sitemaps, canonical URLs, agent listing pages, featured listings and
similar listings; both stay visible internally for reconciliation; the provider
row is never deleted or mutated.

**No authority handover** (`LST-8`): matching never converts the Mallan record
into a provider-owned record and never withdraws the Mallan page. Any document
saying otherwise is superseded.

Ambiguity **fails closed** (`LST-11`): possible, conflicting or broken matches
may not suppress either record as though verified.

### 5.4 Authority split

Provider-controlled (`LST-12`): provider identifiers, timestamps, status,
attribution, permissions, media metadata.
Mallan-controlled (`LST-13`): headline and presentation, Mallan-owned media and
ordering, seller portal content, marketing, notes, showings, feedback, offers,
tasks, documents, CMA selection and adjustments, featured ordering.
Provider refreshes never erase Mallan workflow (`LST-3`); Mallan edits never
rewrite the provider row (`LST-2`).

### 5.5 Transaction class, relisting, building and unit identity

Sale and rental are distinct classes end to end. A relisting is a new listing
record against a persistent property identity (§9), never an edit that destroys
history. Building and unit identity are modelled separately from listing
identity — `CanonicalBuilding` and `CanonicalUnit` exist as schema only (§9).

### 5.6 Durable match relationship — open

`LST-16` (`Q-3`) remains **open**. `ListingIdentity`, `IdentityMatchAudit` and
`IdentityReviewQueue` exist in schema, so an explicit identity layer is present,
but whether it is populated and read on the public path is unverified. Closing
it may require a schema change. **Gated.**

---

## 6. Search architecture

*Implements:* `SEA-1`…`SEA-10`, `OPS-026`, `AUDIT-SEARCH-DUAL-RUNTIME`,
`AUDIT-PROJECTION-MIGRATION`, `ERR-1`, `ERR-7`

### 6.1 Two runtimes exist today

| aspect | Postgres-backed (`lib/search/public-listing-db.ts`) | Live Cotality fallback (`lib/search/public-listing-trestle.ts`) |
|---|---|---|
| Builds | Prisma `{where, orderBy}` | OData `$filter` string |
| Supported filters | amenities/keywords via `applyPublicListingPostFilters`; commercial branch | status, type, price, beds/baths, sqft, subtypes, new-dev, ownership, yearBuilt, furnished, address, keywords, borough→CountyOrParish, neighborhood→ZIP |
| Amenities | post-filter over raw features JSON | not equivalent |
| Media | DB rows, backfilled per page | `$expand=Media` or per-listing fetch |
| Open houses | post-filter | post-filter |
| Caching | `cachedPublicRead` with `SEARCH_CACHE_TAG` | none equivalent |
| Failure handling | DB error surfaces | provider failure must be `PROVIDER_UNAVAILABLE`, never empty (`ERR-7`) |
| **Pagination** | **`skip`/`take` in query — slice *then* filter** | **filter *then* slice** |
| Ranking | `dbOrderBy` | OData `$orderby` |
| Freshness | as-synced | live |
| Source disclosure | not surfaced to the caller | not surfaced to the caller |

**The two are not semantically equivalent** (`AUDIT-SEARCH-DUAL-RUNTIME`), which
breaks `SEA-6` determinism *across* branches: the same criteria can yield
different results and different totals depending on which branch serves.

### 6.2 Requirements

Public search uses only inventory and fields authorized for public display
(`SEA-2`). Internal-search scope must be stated honestly — no full-market or
full-RLS claim without a separately authorized, proved feed (`SEA-3`).
Unsupported criteria produce an explicit decision, never a silent drop or silent
zero (`SEA-5`). Nine states stay distinct (`SEA-8`): loading, success, empty,
unsupported, not authorized, stale, provider unavailable, partial/degraded,
contract incompatible. Every searchable field carries the thirteen-attribute
contract, with provider-side entries generated from live metadata
(`SEA-9`, `COT-11`, `COT-17`).

### 6.3 `OPS-026` — pagination precedes display and matched-pair filtering

**Confirmed 2026-07-30 by direct code read at `04db1b99`, read-only.**

Order in `app/api/listings/route.ts` (DB branch):

| step | line | what happens |
|---|---:|---|
| pagination | 336-337 | `skip: dbSkip, take: dbTake` **inside the query** |
| total | 415 | `prisma.listing.count({where: dbWhere})` — same `where`, **no display filtering, no suppression** |
| display eligibility | 434 | `filterDisplayableDbListings` on the **already-cut page** |
| matched-pair suppression | 441 | `preferCrmExclusiveOverIdxDuplicate` after that |
| further narrowing | — | `applyPublicListingPostFilters`, optional open-house filter |
| response | 589-593 | `count: annotatedListings.length` (post-filter) but `total: dbTotal`, `hasMore: skip + limit < dbTotal` |

**No refill and no recomputation exists.** `dbTotal` is referenced at exactly
three lines — 332, 590, 593 — and flows unmodified into the response.

**The live-Cotality fallback branch shares the defect** (same file, verified by
direct read at `04db1b99`). It filters *before* slicing — `filtered.slice(skip,
skip + limit)` at 940 — which is the correct order. But its **total selection is
incomplete**:

| line | code | effect |
|---:|---|---|
| 937-939 | ``totalCount = (boundsParam \|\| borough \|\| neighborhood) ? filtered.length : (result.odataCount ?? filtered.length)`` | the provider's **pre-filter** `odataCount` is used unless bounds, borough or neighborhood is set |
| 1086 | `total: totalCount + …` | pre-filter total reaches the response |
| 1089 | `hasMore: skip + limit < totalCount \|\| result.hasMore` | pre-filter total drives paging |

The condition omits every other server-side post-filter — **open house, amenity,
subtype and new development** among them. For those requests the fallback also
reports rows it filtered out. **The fallback is therefore NOT categorically
correct**: it is correct only for the three filters named in that condition.

**Consequences.** A page may contain fewer records than the limit even when later
eligible records exist; the reported total can exceed the displayable result set;
page boundaries are inconsistent between the two runtimes; matched-pair
suppression removes records after the page is cut; and **both** runtimes can
report a pre-filter total, producing phantom pages. **`SEA-10` criterion 3
("pagination with no unreachable results") is not satisfied.**

**Proof limitations.** No production probe was run — no claim is made about how
many production queries currently span a matched pair across a page boundary, or
about observed user impact. **Tests missing:** no test asserting `total` against
the displayable count was found in `lib/search/__tests__/` or `tests/runtime/`;
per `GATE-5` that is *not found in the searched paths*, **not** *does not exist*.
**No production mutation. No correction is included in this planning branch.**

### 6.4 Target architecture — a gated decision, not a choice made here

Two admissible targets:

1. **Postgres-authoritative search** with explicit degraded behavior — the live
   fallback becomes a declared degraded mode surfacing `stale` /
   `partial_or_degraded` (`SEA-8`) rather than silently substituting.
2. **Governed dual-source search under one canonical contract** — both runtimes
   satisfy one field contract (`SEA-9`) with proven parity.

**This plan does not select one.** Selection is gated on the projection
convergence decision (§8, PR 5B hold) and on `OPS-026` remediation. Whichever is
chosen, suppression and display filtering must precede totals and pagination
(`SEA-7`).

---

## 7. Media and R2 convergence

*Implements:* `COT-7`, `COT-8`, `AUDIT-MEDIA-DUPLICATION`, `C-3`, `HYG-5`,
`HYG-6`

The same media is representable in **five** places (`AUDIT-MEDIA-DUPLICATION`):
`Listing.media` (schema line 42), `Listing.raw_data` (51), the promoted columns
(58-60), the `ListingMedia` table, and R2. The schema's own comment records this
as an **in-flight migration** — readers still use the JSON column until the
PR 4 reader swap.

| representation | authority | writer | reader | notes |
|---|---|---|---|---|
| `Listing.media` (JSON) | legacy aggregate | `lib/idx/sync.ts` | current public readers | **active fallback — not removable** |
| `raw_data.Media` | provider snapshot | sync | fallback | provenance only |
| `ListingMedia` (relational) | target | `lib/idx/media-sync.ts` | migrating | target of PR 4 swap |
| `primary_photo_url` | promoted | media-sync | card render | denormalized |
| `primary_photo_r2_key` | promoted | media-sync | card render | R2 pointer |
| original URL | provider | provider | fallback | `COT-7` exact URL |
| cached URL / R2 key | Mallan | media-sync | render | storage |
| live provider fallback | provider | — | last resort | **not removable** |

Per representation the plan requires: authority · writer · reader ·
completeness · reconciliation · retry · deletion · **anti-resurrection** ·
fallback · retirement evidence · rollback.

**Media types** stay distinguished — photo, video, `Virtual3D`, floor plan — and
a floor plan or non-photo is never substituted as the primary image (`COT-8`).

**Every temporary compatibility path needs owner, reason, `introduced_at`,
removal condition, review date and a test proving safe removal** (`HYG-5`). The
media migration currently has **no recorded deadline**; that is a gap.

> **No fallback removal is authorized.** `C-3` makes Neon/R2 remediation a hard
> dependency gate. R2 operations remain a standing hold.

---

## 8. Search projection convergence

*Implements:* `AUDIT-PROJECTION-MIGRATION`, `SEA-*`, PR 5B hold

`listing_search_projection` is touched by four non-test modules:
`lib/idx/sync.ts` (writer), `lib/search/listing-search-projection.ts`,
`lib/search/core.ts`, `app/api/crm/saved-searches/route.ts`.

| concern | requirement |
|---|---|
| Source authority | `listings` remains authoritative until the reader swap is approved |
| Projection version | every row carries the projection contract version that wrote it |
| Writer | exactly one writer; dual-write is **best-effort today** and must become verified |
| Dual write | failures must be observable, never silent |
| Reconciliation | a query proving projection matches source for the display gate |
| Drift detection | scheduled comparison with an explicit non-zero exit on drift |
| Rebuild | a deterministic, resumable rebuild that does not mutate source |
| Reader migration | **PR 5B — HELD**, requires explicit Maya approval |
| Rollback | readers revert to `listings` without data loss |
| Retirement | only after parity proof, per `CRM-4` and `HYG-6` |

**The reader swap (`listings.idx_display_yn` → `listing_search_projection.idx_display_yn`)
is gated on the PR 5B hold, not on engineering readiness.**

---

## 9. Property identity

*Implements:* `AUDIT-PROPERTY-IDENTITY`, `LST-16`, `LST-5`, `CMA-8`

```text
schema exists
  != writer exists
  != enrichment exists
  != matching validated
  != backfill complete
  != readers migrated
  != production proven
```

**Current state, code-verified:** `CanonicalProperty` has **zero non-test
references** anywhere in `app/` or `lib/`. With `CanonicalBuilding`,
`CanonicalUnit`, `ListingIdentity`, `IdentityMatchAudit` and
`IdentityReviewQueue` it is **schema only** — no proven writer, no proven reader
on any live path.

Consequences: `LST-16` (`Q-3`) cannot be closed by reading the schema; `AUZ-5`
listing entitlement is unenforceable as specified; and `LST-9`'s prefix shortcut
remains load-bearing in production.

Each stage above is a separate promotion requiring its own `GATE-1` evidence.
**Schema presence is never reported as capability.**

---

## 10. Person, household, organization and relationships

*Implements:* `PER-1`…`PER-12`, `AUDIT-PERSON-ORG-IDENTITY`, `BIZ-11`,
`MKT-1`…`MKT-3`, `IAM-10`

`PER` declares itself **the spine** that search, portals, marketing,
transactions and intelligence attach to.

> **Code-verified gap: no `Person` model and no `Organization` model exist.**
> `Lead` is the de-facto person record. `FamilyMember` and `LeadParty` express
> some multi-party structure but not the decision-group attributes `PER-3`
> requires. **This is the single largest structural gap in the plan, and closing
> it requires a schema migration — a standing hold.**

Required entities: Person · Household / decision group · Organization — LLC,
trust, estate, co-operative board, managing agent, attorney, lender, title
company · beneficial owner · ownership interest · representative /
authorized signatory · contact point · provenance · confidence · consent ·
communication purpose.

**Rules that must survive implementation:**

- A person is a durable identity; **lifecycle state belongs to the role, never
  to the person** (`PER-1`). Today `Lead.status` carries it — the conflation
  `PER-1` forbids.
- **Email and phone are supporting evidence, never sole identity keys**
  (`PER-2`, `CRM-5`). Identity resolution records confidence; merges are
  reversible and retain history.
- A transaction counterparty may be an **organization**, and a signatory is a
  person acting *for* it (`PER-4`).
- Lead is a **role state**, not a separate entity (`PER-5`). Nine states are
  required including **`represented`**, the precondition for agent-led tours
  under `BIZ-2.2`. `Lead.status` currently documents four
  (new/contacted/active/closed) and lacks `represented`.
- Provenance is **immutable** — a later interaction never rewrites how a person
  first arrived (`PER-6`).
- **One canonical append-only timeline per person** (`PER-8`). At least six
  event stores exist today — `ActivityLog`, `PortalEvent`, `BehavioralEvent`,
  `IntentEvent`, `AuditEvent`, `OutreachEvent` — with no canonical timeline, and
  `AuditEvent` **must not** be repurposed as one (§12).
- Knowledge types are never silently promoted (`PER-9`): verified fact ·
  client-stated preference · observed behavior · broker hypothesis · confirmed
  decision.
- **Consent attaches to the person, per channel, per purpose, and survives role
  changes** (`PER-11`, `MKT-1`, `MKT-2`). With no Person model this is not
  structurally guaranteed today.
- Retention periods remain **open** (`IAM-10`, `Q-12`); no period is chosen by
  assumption.

---

## 11. CRM and portals

*Implements:* `CRM-1`…`CRM-7`, `BUS-3`, `AUZ-*`, `IAM-*`, `PER-12`,
`CONFLICT-POL-GATE34-PORTAL`

### 11.1 Layers kept distinct

Backend routes · authorization · service layer · frontend · workflow ·
notifications · audit · production proof. **A route existing is not a working
workflow, and route count is never completion evidence** (`OPS-1`, `GATE-1`).

### 11.2 Migration

The CRM is still static (`public/crm/*.html`). It is legacy migration source:
inventory, freeze except for critical safety or production defects, migrate by
bounded vertical slices, keep available until each replacement proves parity,
retire only after data, authorization, workflow, production and rollback proof
(`BUS-3`, `CRM-2`, `CRM-3`, `CRM-4`). **`public/crm/**` is a standing hold.**

The dynamic CRM creates and edits `SL-`/`RL-` records, displays any matched
provider counterpart **read-only**, and surfaces reconciliation discrepancies
with the `LST-15` controls (`CRM-7`).

### 11.3 `CONFLICT-POL-GATE34-PORTAL` — stated, not resolved

**Ledger disposition `deferred_with_gate`: ledger-resolved, policy-unresolved.**

| aspect | statement |
|---|---|
| **Current behavior** | `null` → **DENY**. `lib/compliance/gates.ts:71` `affirmPermission` wraps `coerceStrictBool`; `null`/`undefined`/missing all deny. Applied at `dto.ts:364` (gate 3, in `sanitizeListingForPortal`) and `dto.ts:185` (gate 4, in `sanitizeForPortal`). Both code comments show the tightening was deliberate. |
| **Conflicting proposed behavior** | `POL-1.1`: `null` → **DISPLAYABLE** for gates 3 and 4; block only on explicit `false`; do not require affirmation. |
| **Scope** | **Portal DTO / read paths only**, on current evidence. The sync **write** path that computes `idx_display_yn` was *not* shown to affirm the raw gate-3 field, and `db-to-public-dto.ts:279` affirms the already-computed `idx_display_yn` aggregate — a genuine boolean, which is correct. |
| **Required evidence** | Authoritative REBNY / Cotality / compliance-source verification. Also unproven: whether the write path affirms the raw field; whether the column is null for a material number of production rows; whether the regression test `POL-1.3` requires exists (**not found in the searched paths**, not *does not exist*). |
| **Decision owner** | **Maya**, on authoritative compliance verification. |
| **Until resolved** | **Preserve current deployed behavior. Implementation is prohibited.** The deployed behavior is the stricter one, so preserving it cannot cause over-disclosure; the risk it carries is under-display, which is recoverable. |

> **Neither `null` behavior is universally correct.** This plan does not select
> the recovered rule or the current code as the permanent target.

---

## 12. Workflow, events, approvals and artifacts

*Implements:* `C-1`, `AUDIT-WORKFLOW-OUTBOX`, `PER-8`, `IAM-9`, `ERR-5`

These are **distinct concepts and must not be collapsed**:

```text
AuditEvent            compliance evidence, retained, append-only
ActivityLog           operational activity
PortalEvent           portal interaction
IntentEvent           behavioral signal
domain event          a fact the domain emits
transactional outbox  reliable delivery of domain events
workflow run          an executing process instance
workflow step         a unit within a run
task                  human-owned work
notification          a delivery
approval              a gated decision with an owner
artifact              a produced, versioned output
```

> **`AuditEvent` must not become the transactional outbox** (`C-1`,
> `AUDIT-WORKFLOW-OUTBOX`). Audit history is compliance evidence with its own
> retention obligations; coupling workflow retries to it makes an evidentiary
> record mutable for operational reasons.

Operations that must not double-apply — offer submission, showing request,
agreement execution, campaign release, arrangement creation, document upload —
accept an **idempotency key** and return the original outcome on replay
(`IAM-9`). No general idempotency contract exists today; it is present only in
media-sync and an ad-hoc check in `api/crm/convert/route.ts:169`.

---

## 13. Compliance and policy versioning

*Implements:* `POL-1`…`POL-6`, `POL-1.1`…`POL-1.5`, `REB-1`…`REB-3`, `BIZ-0`,
`AUDIT-POLICY-VERSIONING`, `C-6`

### 13.1 Reconstructable decisions

Every compliance decision must be reconstructable from: authority type ·
provider contract version · policy version · effective date · superseded date ·
rule · decision reason · evidence · audience · enforcement mode · reviewer ·
decision timestamp (`POL-4`).

None of this exists today (`AUDIT-POLICY-VERSIONING`), which matters concretely:
`COT-15` recorded that the committed provider vocabulary had **already drifted**
from live, and `MlsStatus` and `ListingPermission` drive display gating — so
decisions made before and after a vocabulary refresh are indistinguishable.

### 13.2 `POL-1` — fail closed, **except where the feed is pre-filtered**

The unqualified form of `POL-1` is **superseded**. Applying it uniformly caused a
production incident.

**Gate-by-gate null semantics (`POL-1.1`) — transfer verbatim, never paraphrase:**

| Gate | Field | Null means | Rule |
|---|---|---|---|
| 1 — Owner Opt-Out | `Permission`/`MlsStatus` = `OwnerOptOut` | — | Fail closed. Never displayed. |
| 2 — Participant Only | `Permission = Private` | — | Fail closed. Co-brokers only. |
| 3 — Internet Display | `InternetEntireListingDisplayYN` | **displayable** | Block only on explicit `false`. **Do not require affirmation.** |
| 4 — Address Display | `InternetAddressDisplayYN` | **displayable** | Block only on explicit `false`. Suppress address; listing may still display. |
| 5 — AVM Display | `InternetAutomatedValuationDisplayYN` | **blocked** | Require affirmation. Null denies. |
| 6 — Consumer Comment | `InternetConsumerCommentYN` | **blocked** | Require affirmation. Null denies. |

**Why 3 and 4 differ (`POL-1.2`).** The provider's policy layer pre-filters
non-displayable rows *before* they reach the licensed feed, so a row that
arrives has already passed the internet-display gate — null means "already
permitted upstream," not "unknown." Gates 5 and 6 are per-row opt-out flags the
provider *does* populate, so null legitimately means "not set" and must deny.

**Recorded incident (`POL-1.3`).** On 2026-04-30, applying affirmation logic to
`InternetEntireListingDisplayYN` suppressed **7,594 rows that should have been
displayable**. Record: `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`. **Any change
to gate-3 or gate-4 null handling must cite this requirement and that record, and
must be covered by a test that fails when affirmation logic is reintroduced.**

**Aggregate gate (`POL-1.4`).**

```text
idx_display_yn =
      rls_eligible
  AND NOT terminal_status
  AND internet_entire_listing_display_yn   (gate 3)
  AND NOT participant_only                 (gate 2)
  AND NOT owner_opt_out                    (gate 1)
```

`rls_eligible = false` forces `idx_display_yn = false` regardless of every other
gate.

**Terminal statuses (`POL-1.5`)** are resolved from **live** provider status
definitions (`COT-11`), never hardcoded. An unrecognized status is **preserved,
never coerced** (`COT-10`). A closed record leaves public display within 24 hours.

> **Do not treat the example set as provider truth.** `POL-1.5` records
> "closed, sold, leased, rented, withdrawn, expired, and cancelled" as *observed
> at the last verification*. The repository's own generated live mirror
> `data/cotality-enums.live.json` **does not agree with that list**: it contains
> `Canceled` (single L) and **zero** occurrences of `Cancelled`, `"Sold"` or
> `"Rented"`, while `Closed`, `Withdrawn`, `Expired` and `Leased` are present.
>
> This is exactly why `POL-1.5` says the set is resolved live and **not
> hardcoded** — the illustrative list has already drifted from the mirror, which
> is `C-7` in action. **Whether the live feed currently exposes `Sold`/`Rented`
> at all, and the authoritative spelling of `Canceled`, is a Class B question
> under `CLAUDE.md` §J.3–§J.4** and cannot be settled from the repository or from a
> static reviewer. It requires an independent live Cotality pull
> (`npm run cotality:pull` / `cotality:verify`), which **was not run** in this
> reconciliation.
>
> Until that probe is run: **resolve terminal statuses from the live source at
> runtime, never from the example list above, and never from the committed
> mirror without a drift check** (`COT-12`, `COT-13`, `COT-14`).

> §11.3's conflict concerns the **portal** application of gates 3 and 4 and is
> unresolved. The gate table above states the plan's requirement; it does not
> authorize a code change.

### 13.3 Fair Housing and surfaces

Until a production scanner is connected and **proved**, the state is
`not_evaluated`, **not** `allowed`, and is recorded on the artifact so anything
produced while evaluation was unavailable stays identifiable (`POL-3`).
Five surface classes require review (`POL-5`), including any **generated** text
destined for them; purely internal text is **not** gated. Evaluation receives
text, originating field, audience, surface and listing provenance — never a bare
string (`POL-6`), because a context-free scanner produces false results that
train reviewers to ignore it.

### 13.4 AI-altered media provenance

Moved early, **on existing-obligation grounds only** (`C-6`) — justified by
obligations that already exist, never by anticipating a future rule. Carried as
`NYC-DCWP-AI-MEDIA-DISCLOSURE`, labelled with its authority (`BIZ-0`).

---

## 14. Infrastructure and cost architecture

*Implements:* `AUDIT-NEON-POOL`, `C-3`, `OPS-8`, `MAIN-GOVERNANCE-006`,
`HYG-4`

| concern | requirement |
|---|---|
| Neon connection ownership | one owner per connection path; Prisma reads the bare `DATABASE_URL`/`DATABASE_URL_UNPOOLED` |
| Pool limits | declared, monitored; observed multi-second Prisma waits against a small pool (`AUDIT-NEON-POOL`) |
| Per-invocation concurrency | bounded per function invocation, not per request |
| Overlapping jobs | a cron cycle must not overlap itself; overlap is an explicit, observable condition |
| Cache failure behavior | a cache miss or failure degrades to source, never to an empty success (`ERR-1`, `ERR-7`) |
| Query budgets | per-endpoint and per-cycle budgets with recorded thresholds |
| Cron budgets | per-cycle work ceilings; partial completion is an explicit run status |
| R2 policy | lifecycle, dereference and deletion are **gated**; no operation authorized here |
| Media budgets | object and byte ceilings with exclusive classification and exact reconciliation |
| Operational thresholds | recorded in `docs/PROJECT-HEALTH-DASHBOARD.md`, not here |
| Recovery semantics | rollback must not corrupt data, identity, policy or audit history (`OPS-5`) |

**Neon settings, cron configuration and R2 operations are standing holds.**
`AUDIT-NEON-POOL` is carried as an **open operational condition**: no production
database probe was run in this reconciliation, so it is recorded, not confirmed.

---

## 15. Testing and evidence classes

*Implements:* `OPS-2`…`OPS-4`, `GATE-1`…`GATE-6`, `AUD-4`

| class | proves | does **not** prove |
|---|---|---|
| `unit` | a function's logic in isolation | integration, provider shape, production |
| `raw_provider_contract` | the **request shape actually generated** and raw rows accepted | that the provider returns them |
| `normalized_provider_contract` | mapper output shape | raw-boundary correctness |
| `domain_logic` | rules over normalized records | wiring |
| `route_integration` | route wiring and envelope | authorization isolation, live data |
| `database_integration` | queries against a real schema | production data shape |
| `authorization_isolation` | actor A cannot read subject B | correctness of business rules |
| `immutable_preview` | rendering at a fixed deployment | production behavior over time |
| `live_provider_probe` | live provider truth at a timestamp | that it stays true (`COT-13`) |
| `production_probe` | observed production behavior at a timestamp | absence of other defects |

> **`OPS-024` is why `raw_provider_contract` is a separate class.** 5,814 unit
> tests passed while every fixture fabricated `ListingKey`, so none exercised the
> production request shape. Unit coverage cannot establish provider-contract
> correctness.

A green validator means claims are honest in **form**; substance comes from the
evidence and from review (`GATE-6`, `AUD-4`).

---

## 16. Capability maturity

*Implements:* `C-5`, `C-5.1`, `C-5.2`, `GATE-1`…`GATE-8`, program registry

```text
discovered → designed → schema_only → implemented → integrated
→ limited_release → production_proven → retiring → retired
```

> **MACHINE ENFORCEMENT IS DEFERRED — this section defines the concepts only.**
> The capability registry (`config/capabilities.mjs`) and the validator
> (`scripts/capability-audit.mjs`) were **removed from the reconciliation PR on
> 2026-07-30** and carried to a separate governance-tooling workstream. Eight
> consecutive review rounds left the canonical-plan reconciliation stable while
> nearly every new finding came from that validator, which is the signal that it
> needs its own contract and test work rather than more incremental hardening
> inside a documentation PR.
>
> Nothing is lost: the requirements remain `deferred_with_gate` in this plan,
> and the implementation is preserved by PR #579's archival tag and in git
> history. **Production
> impact is none** — nothing in `app/` or `lib/` imported either file, and no
> route, job or cron invoked them.
>
> **Required before any future merge of machine enforcement:** an explicit
> vocabulary decision (below) · a declared registry data schema · focused
> automated tests · clean-checkout behaviour · evidence-field type validation ·
> artifact validation (a regular file, not a directory) · retirement-evidence
> validation · independent review. Contract first, implementation second.
>
> Until then the maturity ladder above is a **definition**, not an enforced
> contract, and no `capability:audit` command exists in this repository.

> **UNRESOLVED — the archived registry's vocabulary does not match this one.**
> The archived capability-governance prototype used the registry vocabulary
> shown below: `config/capabilities.mjs` exported a different `STATUSES` array,
> and that prototype included a `capability:audit` command which enforced it.
> **No capability registry, validator or `capability:audit` command is
> introduced by PR #585**, and nothing in this repository enforces either list
> today:
>
> ```text
> registry : discovered · designed · contracted · implemented · shadow_mode
>            · limited_release · production · degraded · deprecated · retired
> plan     : discovered · designed · schema_only · implemented · integrated
>            · limited_release · production_proven · retiring · retired
> ```
>
> The registry has no `schema_only`, `integrated`, `production_proven` or
> `retiring`; this plan has no `contracted`, `shadow_mode`, `production`,
> `degraded` or `deprecated`. The two lists came from the two different planning
> lines; the divergence was found by review at head `3be70fa4`. The registry is
> no longer in this PR, so the divergence is now a **pending decision** rather
> than a live inconsistency — but it must be settled BEFORE machine enforcement
> returns, because the validator would otherwise enforce a vocabulary this plan
> does not adopt.
>
> The practical consequence is concrete: `CAP-CANONICAL-PROPERTY` was
> `contracted` in the archived registry while this plan and §9 describe that
> capability as **`schema_only`**. In the archived prototype `capability:audit`
> would therefore have passed a registry contradicting the plan it was meant to
> enforce — which is why the vocabulary must be settled before any machine
> enforcement returns.
>
> **Neither list is adopted here.** Picking one silently would be exactly the
> failure this reconciliation exists to prevent, and aligning them changes
> machine-governance behavior. Recorded as
> **`CONFLICT-CAPABILITY-VOCABULARY`**, `deferred_with_gate`, decision owner
> **Maya**. Until it is resolved, read a registry status as *the registry's*
> word, not this plan's.

> **Program assessment is a separate vocabulary from capability maturity**
> (`C-5.2`). The registry holds **12 programs** (`P0`…`P11`, with an
> `assessment` field) and **11 capabilities** (`CAP-*`, with maturity), plus one
> nested compliance obligation. This reconciliation itself initially conflated
> them — reporting "24 capabilities" from a flat `id:` scan — and had to be
> corrected. **A program is never reconciled as though it were a capability.**

**Capabilities are not promoted because tests pass.** Promotion requires
`GATE-1` evidence; `production_proven` requires production evidence (`OPS-4`).
A capability may not be quietly demoted to avoid producing evidence (`GATE-7`).
When a requirement changes, dependent claims whose evidence predates it become
`EVIDENCE_STALE` (`GATE-4`).

---

## 17. Decommissioning

*Implements:* `C-4`, `HYG-1`…`HYG-9`, `DOC-4`, `DOC-6`, `DOC-8`

Decommissioning is a first-class program (`P11`, `C-4`), executed under the `HYG`
rules.

```text
live                          in use, keep
generated                     regenerate, never hand-edit
superseded_but_referenced     replacement exists, callers remain
superseded_and_unreferenced   replacement exists, no caller found
unknown                       requires trace
```

Before any removal (`HYG-6`): reader/writer inventory across routes, imports,
dynamic references, configuration, tests, generated code, jobs, UI triggers and
runtime traces → **distinguish "no caller found in the searched paths" from
"unused"** → parity proof of the replacement → retention review → preserved
rollback → removal → production and health verification → inventory update.

> **`HYG-1`: absence of a discovered caller is never proof that something is
> safe to remove.** `superseded_and_unreferenced` authorizes **investigation**,
> not deletion. **Historical migrations are not bloat** (`HYG-2`).
> **No fallback removal is authorized by this plan.**

---

## 18. Implementation sequence

*Implements:* `PH-1`…`PH-6`, `C-3`, `C-4`, all holds

```text
Phase 0 — production stabilization
Phase 1 — one planning authority
Phase 2 — boundaries without schema expansion
Phase 3 — complete existing migrations
Phase 4 — add missing identity/workflow/policy foundation (explicit schema approval)
Phase 5 — migrate complete vertical journeys
Phase 6 — advanced intelligence
```

| phase | contents | gate |
|---|---|---|
| **0** | Keep ingestion healthy. Land the corrected Phase 1A (**PR #589**) on its own merits. Resolve `OPS-026`. | Maya approval per merge (`OPS-7`) |
| **1** | This plan becomes the single authority; entry points route to it; `Mallan_Intelligence_Master_Plan.md` stops being normative. | `DOC-1`, `DOC-4`, `DOC-6` |
| **2** | Provider raw boundary (§4), actor/subject separation (§3), error taxonomy and envelope, application-service door (`ARC-2`), decompose `lib/idx/` **within** `lib/idx/` (`C-2`). **No new tables.** | audit-enforced (`ARC-9`, `AUD-5`) |
| **3** | Finish media convergence (§7) and projection convergence (§8). Retire nothing without parity proof. | **PR 5B hold**, `C-3` Neon/R2 gate |
| **4** | Person / household / organization (§10), property identity writers and readers (§9), workflow and outbox (§12), policy versioning (§13.1). | **explicit schema-migration approval** |
| **5** | Vertical journeys end to end — buyer, tenant, seller, landlord — each proved before the next. | `CRM-4` retirement gate |
| **6** | Intelligence, last because `INT-1` makes it a **consumer** of verified data. | `INT-2`, `INT-6` |

**`C-3` is a hard dependency gate:** capabilities depending on database or
storage headroom may not be promoted before Neon/R2 remediation clears.

> **This sequence does not halt work already in flight.** It orders *this plan's*
> structural programme; it is not a freeze on active business tracks.
> `SELLER-001` and `SELLER-002` are recorded **In progress (P1 business)** in
> `docs/PLATFORM-ISSUE-REGISTRY.md` and continue under their own Maya
> directives. Phase 1 establishes **one planning authority** — it does not gate
> delivery behind a documentation milestone, and nothing here supersedes the
> registry's live status. Where a phase boundary and an active track genuinely
> conflict, the conflict is recorded and taken to Maya rather than resolved by
> assuming the plan outranks the registry: the plan states **what must be**, the
> registry states **what is**, and neither silently overwrites the other
> (§0.2).

**Deferred and unresolved — accounted for here, NOT decided (31):**
`BIZ-4`, `CAP-CANONICAL-PERSON`, `CAP-CANONICAL-PROPERTY`, `CAP-CLIENT-PORTALS`, `CAP-COMPLIANCE-GATES`, `CAP-EVENT-OUTBOX`, `CAP-IDX-COTALITY-ADAPTER`, `CAP-MEDIA-AI-PROVENANCE`, `CAP-MEDIA-SYNC`, `CAP-POLICY-REGISTRY`, `CAP-SEARCH-CANONICAL`, `CAP-WORKFLOW-ENGINE`, `CONFLICT-CAPABILITY-VOCABULARY`, `CONFLICT-POL-GATE34-PORTAL`, `IAM-10`, `LST-16`, `MKT-4`, `P0`, `P1`, `P10`, `P11`, `P2`, `P3`, `P4`, `P5`, `P6`, `P7`, `P8`, `P9`, `PER-1`, `PER-4`.

Read with the gloss: `BIZ-4` compensation arrangement model · `PER-1`/`PER-4`
person and organization identity · `IAM-10` retention periods (`Q-12`) ·
`LST-16` durable match relationship (`Q-3`) · `MKT-4` marketing production hold ·
`CONFLICT-POL-GATE34-PORTAL` portal gate 3/4 null semantics ·
`CONFLICT-CAPABILITY-VOCABULARY` registry vs plan maturity vocabulary.

---

## Provenance

This plan was assembled by a per-requirement reconciliation of two divergent
planning lines whose merge-base was an older `main` (`60581e51`), so neither
could be rebased onto the other and no whole-document "ours/theirs" resolution
was admissible.

**The reconciliation working materials are HISTORICAL and NON-NORMATIVE and are
deliberately not carried in this repository.** They are preserved at the
protected archival tag:

```text
archive/platform-plan-reconciliation-corpus-53688877
```

containing the 608-row ledger, `RECONCILIATION-RESOLUTIONS.json`, the frozen
605-ID baseline, the validation artifact and the ancestry evidence. Two further
tags preserve the source plans and the removed tooling prototype:

```text
archive/platform-plan-recovered-6e8ea2d9
archive/platform-plan-pr585-f51848b0
archive/platform-plan-pr579-7c15b1d5
archive/platform-plan-ledger-tooling-e96bbd2b
```

**Those materials are evidence, not authority.** They carry known unvalidated
defects — recorded in the corpus tag's annotation — including symbolic
`canonical_destination` values that resolve to no heading here, one incorrect
identifier count, one stale unresolved-row statement and one dependency naming a
retired identifier. They were removed from this change rather than corrected
because validating a 608-row audit trail is separate work from publishing this
plan. **Nothing in this plan depends on them being correct**, and where this plan
and any archived material differ, **this plan governs**.
