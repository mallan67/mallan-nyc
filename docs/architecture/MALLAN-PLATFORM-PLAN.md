# MALLAN PLATFORM PLAN

## One authoritative product, architecture, compliance, delivery, error, and housekeeping plan

**Repository:** `mallan67/mallan-nyc` only  
**Canonical file:** `docs/architecture/MALLAN-PLATFORM-PLAN.md`  
**Required entry points:** `AGENTS.md`, `AI-START-HERE.md`, and `README.md`  
**Status:** Governing target plan. It does not claim that every capability is implemented.  
**Document rule:** Amend this file in place. Do not create `rev`, `final`, `new`, dated replacement, addendum, or supplemental versions.

---

# 0. How to use this plan

This file is the one normative reference for:

- the Mallan business model;
- Cotality, REBNY, and Mallan responsibilities;
- the `SL-`, `RL-`, and `RLS*` listing model;
- public search, CRM, portals, CMA, marketing, and intelligence;
- frontend/backend integration;
- authorization, policy, contracts, errors, and observability;
- repository housekeeping, bloat control, and safe removal;
- implementation sequence, proof requirements, rollback, and release rules.

All AI agents and human contributors must read this file before planning or changing platform-wide behavior.

Supporting files may remain only as:

1. machine-generated evidence;
2. historical evidence;
3. narrow runbooks implementing a rule already defined here;
4. current operational status and issue registries.

A supporting file may not contradict this plan or present itself as a second active architecture.

## DOC-1 — Single source of platform truth

Only this file may establish platform-wide architecture, business rules, implementation sequence, or cross-system contracts.

## DOC-2 — Repository entry points

`AGENTS.md`, `AI-START-HERE.md`, and `README.md` must identify this file as the first platform-plan read. They may summarize or route, but may not duplicate a competing architecture.

## DOC-3 — Amend in place

Do not create:

```text
MALLAN-PLATFORM-PLAN-REV6.md
MALLAN-PLATFORM-PLAN-FINAL.md
MALLAN-PLATFORM-PLAN-NEW.md
MALLAN-PLATFORM-PLAN-YYYY-MM-DD.md
MALLAN-PLATFORM-PLAN-ADDENDUM.md
```

## DOC-4 — Source-document consolidation

The following documents contain useful requirements or evidence but must not remain competing normative plans after consolidation:

- `Mallan_Intelligence_Master_Plan.md`;
- prior `MALLAN-PLATFORM-PLAN.md` drafts;
- `crm-search-agent-workflow-rebuild.md`;
- `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md`;
- `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md`;
- `COTALITY-COMPLETE-REFERENCE.md`;
- `SELLER-001-SPEC-2026-07-03.md`.

Before retiring any source document, record each material requirement as:

```text
source_file
source_section
source_requirement
accepted | corrected | rejected | historical | evidence_only
master_plan_destination
verification_source
notes
```

Retirement means the file no longer calls itself authoritative. Git history preserves it.

## DOC-5 — No silent document drift

A change to a decided requirement must recheck every dependent requirement, README summary, agent instruction, active issue, and handoff affected by the change.

---

# 1. Current business truth

## BUS-1 — What Mallan is building

Mallan.nyc is one dynamic New York City brokerage operating system with distinct experiences for:

- the public website and public IDX search;
- agents;
- broker oversight and brokerage operations;
- buyers;
- tenants;
- sellers;
- landlords;
- listings;
- CMA and reporting;
- communications and campaigns;
- transactions, commissions, referrals, and compliance;
- evidence-backed intelligence.

Different experiences may have different interfaces and permissions, but they share one application foundation, identity model, contract vocabulary, policy system, error model, event history, and audit trail.

## BUS-2 — Current data boundary

Mallan.nyc consumes its licensed Cotality/Trestle feed for authorized listing data and maintains Mallan-owned website records and brokerage workflow data.

Mallan.nyc does not write listing changes back to Cotality.

This website architecture does not depend on, document, or govern external listing-entry products or third-party professional-search products.

## BUS-3 — Static CRM is temporary

The existing `public/crm` HTML/JavaScript system is legacy migration source code. It is not the permanent target and must not be preserved as a permanently separate frontend.

It must be:

1. inventoried;
2. frozen except for critical safety or production defects;
3. migrated by bounded vertical slices into a dynamic Next.js CRM;
4. kept available until each replacement proves parity;
5. retired only after data, authorization, workflow, production, and rollback proof.

## BUS-4 — One system does not mean one generic screen

Buyer, tenant, seller, landlord, agent, broker, and public experiences remain distinct products. They share foundations without collapsing into one renamed portal.

---

# 2. Authorities and precedence

## BUS-5 — REBNY responsibility

REBNY controls the applicable RLS policy, participation rules, display obligations, feed rights, attribution requirements, status obligations, and effective rule changes.

## COT-1 — Cotality responsibility

Cotality/Trestle controls the live API transport and the exact resources, fields, types, enum values, relationships, pagination, throttling, and errors exposed to Mallan's licensed account.

## BUS-6 — Mallan responsibility

Mallan controls:

- `SL-` and `RL-` website records;
- Mallan page presentation;
- CRM records;
- clients and relationships;
- communications and consent;
- portals;
- campaigns;
- showings, feedback, offers, tasks, documents, and transactions;
- local media and ordering;
- reports, decisions, events, evidence, and audit history.

## COT-2 — Evidence precedence

When sources conflict, use this order:

1. current effective official REBNY rule with effective date;
2. Mallan's executed license and written authorization;
3. authenticated live Cotality API behavior for Mallan's account;
4. current production behavior and current `main`, bounded by exact evidence;
5. generated live mirrors tied to a timestamp and commit;
6. dated reference documents and historical audits.

## COT-3 — Live verification

For any implementation touching provider fields, statuses, picklists, media, open houses, attribution, permissions, or search behavior, run the applicable live verification when credentials are available:

```bash
npm run cotality:pull
npm run cotality:verify
```

A verification record must include:

```text
verified_at
repository_sha
feed/license identity
metadata checksum
resources observed
fields observed
enum values observed
filter probes
pagination probes
known rejected operations
changes from prior verification
```

When credentials are unavailable, state that live verification did not run. Do not guess.

## COT-4 — Field existence is not permission

A field appearing in the feed does not prove permission for public display, internal use, seller display, CMA use, analytics, storage, export, or redistribution. The executed license and REBNY authorization determine allowed use.

---

# 3. Non-negotiable rules

## ARC-1 — No client-side MLS calls

All Cotality calls occur server-side through a controlled provider adapter.

## ARC-2 — One application-service door

HTTP routes, Server Components, jobs, crons, and internal tools must resolve an actor and call the same application/use-case service.

They may not bypass authorization or policy by calling raw domain services directly.

## ARC-3 — No silent failure

Unknown, unsupported, stale, conflicting, unlicensed, and unverified states must be explicit.

## COT-5 — No provider guessing

Use only verified fields and values. Never invent a provider field, enum, status, permission, media type, or query behavior.

## LST-1 — No duplicate public matched pair

A verified Mallan/provider matched pair produces one Mallan public result and one canonical Mallan page.

## LST-2 — No local provider mutation

Mallan web edits never rewrite the Cotality/provider row.

## LST-3 — No provider overwrite of Mallan workflow

Provider refreshes never erase Mallan presentation, local media, seller workflow, CRM history, marketing, notes, or other Mallan-owned data.

## POL-1 — Compliance fails closed

Unknown display permission, unresolved audience, missing required attribution, Participant Only, Owner Opt-Out, or unresolved compliance review may not silently proceed.

## ERR-1 — Empty is not an error

A valid search that finds no records returns success with an explicit empty state.

## HYG-1 — No deletion by grep alone

The absence of a discovered caller is not proof that a route, module, field, flag, job, or document is safe to remove.

## OPS-1 — No unsupported completion claim

A capability is not complete without exact tests, production or immutable-preview proof, health evidence, rollback, documentation, and operational ownership.

## BUS-7 — Repository boundary

This plan and repository apply only to `mallan67/mallan-nyc`. Mallan Integrated is outside scope.

---

# 4. Listing identity and matched pairs

## LST-4 — Exact prefix definitions

```text
SL-* = Mallan web SALE listing identifier
RL-* = Mallan web RENTAL listing identifier
RLS* = separate REBNY/Cotality provider listing identifier
```

`SL-` and `RL-` identify the transaction type of a Mallan web record. They do not establish whether a provider counterpart exists.

## LST-5 — Separate dimensions

The system must not overload the prefix. It must represent these facts separately:

```text
transaction_type
- sale
- rental

record_source
- mallan_web
- cotality

mallan_web_id
- SL-*
- RL-*
- null

provider_identity
- cotality_listing_key
- cotality_listing_id
- source system identity when supplied
- provider_last_verified_at

reconciliation_status
- not_searched
- no_match
- possible_match
- verified_match
- conflict
- broken_match

public_canonical_source
- mallan_web
- cotality
```

## LST-6 — Example

For 333 East 46th Street, Apartment 2G:

```text
Mallan web record: SL-0004
Transaction type: sale
Provider counterpart: RLS20093870
Reconciliation: verified_match
Mallan public canonical record: SL-0004
Provider public duplicate on Mallan surfaces: suppressed
Provider row internally: retained and read-only
```

## LST-7 — Matched-pair behavior

When a verified match exists:

- the `SL-` or `RL-` record remains the canonical mallan.nyc page;
- the provider counterpart remains stored and refreshed;
- the provider duplicate is suppressed from Mallan public results, cards, sitemaps, canonical URLs, agent listing pages, featured listings, and similar-listing results;
- both remain visible internally for reconciliation and discrepancy review;
- the provider row is not deleted or mutated;
- Mallan presentation is not replaced by the provider row.

## LST-8 — No authority handover

Matching does not convert the Mallan record into a provider-owned record and does not withdraw the Mallan page.

Any document that says to withdraw the `SL-`/`RL-` record, replace it publicly with `RLS*`, or transfer authority is superseded by this rule.

## LST-9 — Current implementation shortcut

Current code may use `SL-`/`RL-` prefixes as a proxy for Mallan ownership or dedupe preference. That is an implementation shortcut, not the business definition.

PH-1 must inventory every prefix inference. PH-2 must replace unsafe inferences with explicit source, ownership, and reconciliation fields where necessary.

## LST-10 — Match confidence

A verified match requires sufficient identity evidence, such as:

- normalized address atoms;
- unit number;
- postal code;
- listing class;
- known provider identity;
- agent/office relationship;
- effective dates;
- corroborating source data.

Email, a loose address string, or one coincidental attribute is not enough.

## LST-11 — Ambiguity fails closed

Possible, conflicting, or broken matches may not suppress either record as though the match were verified. They require review.

## LST-12 — Provider-controlled facts

The provider counterpart remains authoritative for its own returned facts, including provider IDs, provider timestamps, provider status, provider attribution, provider permissions, and provider media metadata.

## LST-13 — Mallan-controlled facts

The Mallan record remains authoritative for Mallan website presentation and workflow, including:

- Mallan headline and presentation;
- Mallan-owned media and ordering;
- seller portal content;
- marketing plan and history;
- internal notes;
- showings and feedback;
- offers and tasks;
- documents;
- CMA selection and professional adjustments;
- featured ordering when permitted.

## LST-14 — Discrepancy handling

For a verified matched pair, compare material facts such as:

- status;
- price;
- address and unit;
- listing class;
- public remarks where relevant;
- attribution;
- open houses;
- material dates;
- provider display permission.

A discrepancy creates a visible reconciliation condition. Serious public/compliance discrepancies block or degrade publication according to policy instead of being hidden.

---

# 5. Provider identity, media, and freshness

## COT-6 — Preserve both provider identifiers

The provider adapter must preserve both the provider's canonical key and human/source listing identifier where supplied. Local code must not silently treat one as the other.

## COT-7 — Media identity

Media relationships must use verified provider keys and exact provider URLs. Do not construct media URLs by guessing.

Each media asset should preserve:

```text
provider_media_key
provider_listing_key
provider_url
media_category
media_order
provider_modified_at
retrieved_at
local_storage_url when copied lawfully
source provenance
```

## COT-8 — Photo-first and media integrity

The system must:

- preserve provider ordering where required;
- select the correct primary photo;
- distinguish photos, floor plans, videos, and virtual tours;
- avoid substituting a floor plan or non-photo as the primary image;
- retain provider timestamps;
- detect media-set changes;
- fail clearly when media is missing or unavailable.

## COT-9 — Freshness

Every provider-derived output must carry retrieval time, source modification time when available, and an explicit freshness state.

## COT-10 — Unknown provider values

Unknown values must be preserved raw, logged, reported, and quarantined from affected regulated outputs until classified. They may not be silently mapped.

---

# 6. Target application architecture

## ARC-4 — Target layers

```text
Interfaces
  public website
  dynamic CRM
  broker administration
  buyer portal
  tenant portal
  seller portal
  landlord portal
  cron/job/internal adapters

Adapters
  HTTP adapters
  Server Component adapters
  job/cron adapters

Application layer
  search use cases
  listing use cases
  CRM use cases
  seller activity use cases
  CMA use cases
  marketing use cases
  transaction use cases
  intelligence use cases

Domain and policy
  identity and reconciliation
  authorization
  compliance and display policy
  consent and suppression
  search contracts
  artifacts and evidence
  errors

Infrastructure
  Cotality adapter
  database repositories
  media/storage adapters
  email/communication adapters
  observability
```

## ARC-5 — Thin adapters

HTTP routes decode input, resolve actor/context, invoke an application service, and encode output. They do not contain duplicated business policy.

## ARC-6 — Internal calls do not self-call HTTP

Server Components, jobs, and crons call application services directly with an explicit actor/context. They do not make internal HTTP requests to the application's own API.

## ARC-7 — Domain services are not public entry points

Raw domain services and repositories may not be called from arbitrary routes, UI code, or jobs.

## ARC-8 — Shared contract, not duplicated frontends

The static CRM is migrated into the dynamic application. Public and authenticated products may remain different interfaces, but not permanently disconnected implementations with competing contracts.

---

# 7. Authorization, policy, and non-disclosure

## AUZ-1 — Actor resolution

Every use case resolves an actor:

```text
anonymous
client
agent
broker
system_job
service_identity
```

## AUZ-2 — Resource authorization

Authorization includes:

- actor role;
- resource ownership;
- brokerage relationship;
- client relationship;
- listing relationship;
- portal entitlement;
- field-level visibility;
- action-level permission.

## AUZ-3 — Broker role does not override provider restrictions

Broker permissions may expand Mallan operational access but cannot bypass REBNY, license, provider, privacy, or legal restrictions.

## AUZ-4 — Non-disclosure

For ID-addressed protected resources, unauthorized and nonexistent resources must not be distinguishable in a way that enables enumeration.

## POL-2 — Policy order

The application may load the minimum record needed to evaluate policy, then applies authorization, listing restrictions, audience rules, field suppression, attribution, and purpose-specific policy before returning protected data.

## POL-3 — Fair Housing state

Until a production scanner and workflow are connected and proved, the state is `not_evaluated`, not `allowed`.

Compliance-sensitive public or marketing content requires human review when automated evaluation is unavailable or inconclusive.

## POL-4 — Versioned policy

Each operationalized policy records:

```text
policy_id
authority
official_source
effective_date
superseded_date
version
affected_workflows
audiences
enforcement_mode
required_disclosure
required_form
test_ids
owner
review_status
```

---

# 8. Transport and versioning

## TRN-1 — Success envelope

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "resultState": "success",
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-2 — Empty envelope

```json
{
  "ok": true,
  "data": [],
  "meta": {
    "resultState": "empty",
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-3 — Error envelope

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "retryable": false
  },
  "meta": {
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-4 — Exceptions

Files, byte streams, redirects, auth callbacks, provider webhooks, and minimal health probes may use transport-specific responses, but their behavior and error contract must still be documented.

## VER-1 — Separate contract and build versions

```text
contractVersion
clientContractVersion
minimumSupportedContractVersion
serverSupportedContractVersions
clientBuildVersion
```

A build identifier is not a contract version.

## VER-2 — Compatibility failure

Incompatible clients receive an explicit contract error, not a generic 500 or silently altered behavior.

---

# 9. Error governance

## ERR-2 — One public error taxonomy

Use one closed platform taxonomy:

```text
VALIDATION
AUTHENTICATION
FORBIDDEN
RESOURCE_NOT_AVAILABLE
CONFLICT
POLICY_BLOCKED
NOT_EVALUATED
PROVIDER_UNAVAILABLE
DATA_STALE
CONTRACT_INCOMPATIBLE
RATE_LIMITED
INTERNAL
```

Internal domain decisions may be more detailed, but adapters map them into this taxonomy.

## ERR-3 — Error catalog fields

Every error code must define:

```text
code
affected surface
safe user message
internal diagnostic context
severity
retryable
fail-closed behavior
logging requirement
owner
test coverage
health-check coverage
runbook or remediation
deprecation state
```

## ERR-4 — No arbitrary route strings

Routes may not invent one-off `{ error: "some string" }` contracts outside the error catalog.

## ERR-5 — Error lifecycle

Every known error or defect is classified:

```text
ACTIVE_DEFECT
MONITORED
MITIGATED
BLOCKED_EXTERNAL
RESOLVED_PENDING_PROOF
CLOSED_PROVED
DEPRECATED_REMOVE
```

Every non-closed item requires an owner, first-seen date, last-verified date, affected files, impact, next action, and closure proof.

## ERR-6 — No hanging catches or warnings

Temporary catches, fallback branches, warnings, debug logs, and error comments require a disposition and removal condition. They may not remain indefinitely without ownership.

---

# 10. Housekeeping and bloat governance

## HYG-2 — What counts as bloat

Bloat includes:

- duplicate architecture documents;
- duplicate routes or schemas;
- duplicate provider mappers;
- multiple public error formats;
- unused flags and environment variables;
- abandoned crons and jobs;
- unreachable UI;
- obsolete scripts;
- dead exports and unused dependencies;
- backup files and revision copies;
- stale TODO/FIXME comments;
- temporary compatibility paths without deadlines;
- generated artifacts committed without purpose;
- duplicate media or listing rows without reconciliation;
- copied provider facts that become conflicting local truth;
- unresolved console warnings and production logging noise.

Historical migrations are not bloat and must not be deleted merely to make the repository smaller.

## HYG-3 — Disposition states

Every cleanup candidate receives one state:

```text
KEEP_ACTIVE
MIGRATE
CONSOLIDATE
EVIDENCE_ONLY
HISTORICAL
DEPRECATE_AFTER_PROOF
DELETE_AFTER_PROOF
UNKNOWN_REQUIRES_TRACE
```

## HYG-4 — Required inventories

Maintain machine-readable or generated inventories for:

- active normative documents;
- routes and HTTP methods;
- non-HTTP entry points;
- errors;
- feature flags;
- environment variables;
- crons and jobs;
- provider adapters;
- database models and fields;
- public assets;
- dependencies;
- temporary compatibility code.

## HYG-5 — Temporary code contract

Every temporary item must record:

```text
owner
reason
introduced_at
removal_condition
latest_review_date
test proving safe removal
```

There is no permanent temporary code.

## HYG-6 — Safe removal proof

Before removal:

1. search routes, imports, dynamic references, configuration, tests, generated code, jobs, UI triggers, and runtime traces;
2. distinguish “no caller found in searched paths” from “unused”;
3. add or identify replacement behavior;
4. prove the replacement;
5. preserve rollback;
6. remove the old path;
7. verify production and health;
8. update inventories and documentation.

## HYG-7 — Per-change hygiene questions

Every PR answers:

```text
What was added?
What was removed?
What duplication was introduced or eliminated?
Were errors added or changed?
Were old paths retired?
Did route, flag, job, env, document, or dependency inventories change?
What proves no unrelated files were included?
```

## HYG-8 — Platform check target

A progressive command should converge on:

```bash
npm run platform:check
```

It should eventually validate:

- canonical-plan and README navigation;
- duplicate active-plan detection;
- route inventory completeness;
- error-catalog conformance;
- generated-contract drift;
- stale flags;
- unowned TODO/FIXME items;
- expired temporary-code deadlines;
- forbidden backup/revision filenames;
- dependency and dead-export findings;
- applicable health probes.

The command must state what it currently proves and what remains planned.

---

# 11. Search

## SEA-1 — Separate products, shared meaning

Public search and authenticated agent search may differ in inventory, permissions, fields, ranking, and actions, but share stable filter definitions and provider mappings.

## SEA-2 — Public search scope

Public search uses only inventory and fields authorized for public display.

## SEA-3 — Honest internal-search scope

Do not claim full-market or full-RLS coverage unless a separately authorized feed is obtained and proved. The UI must state actual scope.

## SEA-4 — One canonical pipeline

Each visible search control must map end to end:

```text
UI control
criteria schema
application service
provider/local query
field mapping
policy decision
DTO
rendering
saved-search version
alert replay
```

## SEA-5 — Unsupported criteria

Unsupported or unpermitted criteria produce an explicit decision. They are not silently dropped and do not silently return zero.

## SEA-6 — Deterministic parity

For the same criteria, audience, inventory scope, entitlement set, and as-of snapshot, the result IDs and order are deterministic.

## SEA-7 — Matched-pair suppression order

Apply identity reconciliation and public suppression before final totals, pagination, saved-search replay, sitemap output, and similar-listing output.

## SEA-8 — Search states

The UI distinguishes:

```text
loading
success
empty
unsupported
not authorized
stale
provider unavailable
partial/degraded
contract incompatible
```

## SEA-9 — Field contract

Every searchable/filterable field records:

```text
canonical concept
provider field
local field
value type
supported filter operations
sort support
public visibility
agent visibility
portal visibility
report/CMA support
fallback behavior
source timestamp
verification status
```

---

# 12. Dynamic CRM migration

## CRM-1 — Target

The target is a dynamic Next.js CRM using the same application services, authorization, policy, contracts, and error system as the rest of Mallan.nyc.

## CRM-2 — Inventory first

For every static workflow, record:

```text
screen/workflow
current files
current API calls
current writes
current permissions
current errors
current tests
current production evidence
target dynamic route/components
dependencies
retirement gate
```

## CRM-3 — Vertical-slice migration

Migrate in bounded slices such as:

1. listing workspace;
2. client records and timelines;
3. search and saved searches;
4. collections and sharing;
5. showing and feedback;
6. tasks and notes;
7. offers and transactions;
8. CMA;
9. campaigns and communications;
10. brokerage oversight.

## CRM-4 — Retirement gate

A static workflow may be retired only after:

- data parity;
- authorization parity;
- policy parity;
- success and failure tests;
- production/preview proof;
- rollback proof;
- no unresolved callers;
- documentation and inventory update.

## CRM-5 — Client identity

Clients persist over time and may have multiple roles. Email and phone support identity but are never the sole identity key.

## CRM-6 — Durable history

The CRM preserves communications, listing interactions, showings, feedback, offers, tasks, decisions, documents, campaigns, transactions, and outcomes as a coherent timeline.

---

# 13. Seller portal and CMA

## SEL-1 — Seller portal purpose

The seller portal provides truthful evidence of activity, market context, communications, documents, and next actions without inflating or inventing exposure.

## SEL-2 — Truth levels

Seller information distinguishes:

```text
VERIFIED_MALLAN_TRAFFIC
TRACKED_CAMPAIGN
PORTAL_REPORTED
EXTERNAL_PRESENCE
MARKET_PROXY
```

External presence proves appearance, not traffic volume. Anonymous traffic remains aggregate unless the person self-identifies.

## SEL-3 — Live activity is separate from CMA

Live market activity updates independently from the last shared CMA.

## SEL-4 — Live activity

Where licensed and permitted, show:

- active in the building;
- under contract in the building;
- recently sold in the building;
- relevant area competition and closed evidence;
- listing traffic and engagement;
- campaigns;
- inquiries;
- showings and feedback;
- offers and next actions;
- data gaps and freshness.

## CMA-1 — Automatic starting set

The system automatically proposes comparables based on verified facts and explains why each was selected.

## CMA-2 — Evidence classification

Comparable evidence is classified:

```text
COTALITY_VERIFIED
AGENT_CONFIRMED
DERIVED
EXTERNAL_REFERENCE
UNSUPPORTED
STALE
```

Only qualified evidence may drive seller-facing factual conclusions.

## CMA-3 — Agent control

The authorized listing agent or broker may:

- add and remove comparables;
- reorder comparables;
- adjust radius, recency, and similarity;
- add condition or renovation adjustments;
- add notes;
- select seller-visible comparables;
- regenerate the report;
- share a version.

## CMA-4 — No central approval by default

Routine seller CMAs do not require central or Maya approval. Broker review applies only when supervision is explicitly configured, a compliance condition triggers it, the product is a separate paid/external valuation product, or the agent escalates it.

## CMA-5 — Facts versus judgment

Provider facts remain unaltered. Agent adjustments and professional judgments are stored and presented separately.

## CMA-6 — Versioning

Preserve:

```text
system_generated_set
agent_selected_set
excluded_comparables
manual_adjustments
agent_notes
generated_at
modified_at
shared_at
```

The seller sees only the deliberately shared CMA version. Internal drafts, exclusions, and private notes remain private.

---

# 14. Marketing and consent

## MKT-1 — Consent model

Consent is contact × channel × purpose, with source, timestamp, evidence, and later opt-out.

## MKT-2 — Durable opt-out

Unsubscribe and opt-out are permanent suppression events for the applicable channel and purpose unless a lawful, explicit later change is recorded.

## MKT-3 — Contact provenance

Every marketing contact must retain source provenance and identity confidence. A purchased or guessed contact may not be silently treated as a consented relationship.

## MKT-4 — Production hold

Until the consent/provenance data model and enforcement are approved and proved, the system may support classification, suppression, unsubscribe, previews, dry runs, and internal test sends only. It may not claim complete consent enforcement or perform live bulk marketing.

## MKT-5 — Sender separation

Transactional and marketing sending must be operationally separable so campaign problems do not impair transaction communication.

## MKT-6 — Recipient reconciliation

Before any production campaign, reconcile at minimum:

```text
source audience
eligible
suppressed
unsubscribed
invalid
missing consent
policy blocked
duplicates removed
final recipients
```

The totals must reconcile exactly.

## MKT-7 — Content policy

Marketing content must pass applicable attribution, listing permission, Participant Only, Owner Opt-Out, Fair Housing, unsubscribe, and brokerage-policy gates.

---

# 15. Intelligence

## INT-1 — Intelligence is a consumer, not the owner

AI and analytics consume verified system data. They do not own listing facts, identities, consent, policy, or workflow state.

## INT-2 — Explainability

Every recommendation or signal records:

```text
evidence
source timestamps
confidence
reason codes
policy status
human approval requirement
model/provider/version when AI is used
```

## INT-3 — No invented facts

AI may draft, summarize, explain, prioritize, or suggest. It may not invent listing facts, legal conclusions, consent, identity, or completed actions.

## INT-4 — Replaceable providers

AI providers remain replaceable adapters. Core business records and workflows remain company-owned.

## INT-5 — Outcome loop

The system records whether recommendations led to contact, showing, decision, offer, agreement, transaction, referral, or no action, without rewriting prior evidence.

---

# 16. Verification, health, release, and rollback

## OPS-2 — Evidence standard

Every claim states:

```text
what was checked
exact commit/environment
what the evidence proves
what it does not prove
```

## OPS-3 — Test layers

Use the applicable layers:

- pure contract/unit tests;
- authorization and policy tests;
- route/runtime tests;
- integration tests;
- generated-contract drift tests;
- browser/UI tests;
- preview or production smoke tests;
- health probes;
- data reconciliation queries.

## OPS-4 — Production proof

Production proof includes the deployed SHA, deployment identity, exact endpoint or workflow, timestamp, observed response/behavior, and any relevant logs or queries.

## OPS-5 — Rollback

Every implementation PR states the rollback procedure and verifies that rollback does not corrupt data, identity, policy, or audit history.

## OPS-6 — No unrelated files

Each branch and PR contains one bounded capability. Diff the branch against its intended base before push and before merge.

## OPS-7 — Maya approval

No merge or production release occurs without Maya's approval.

---

# 17. Implementation sequence

## PH-1 — Canonical truth, inventory, and cleanup baseline

### Goal

Stop agents from guessing and establish an evidence-backed map before implementation.

### Steps

1. Put this plan in the repository.
2. Make `AGENTS.md`, `AI-START-HERE.md`, and `README.md` route all agents here.
3. Inventory the active architecture, operational contracts, supplements, specs, and handoffs.
4. Build the source-document coverage matrix.
5. Classify each document as active summary, evidence, historical, runbook, merge, or retire.
6. Inventory every API route by method, runtime, entrypoint type, actor, application service, policy, error shape, and caller evidence.
7. Inventory non-HTTP entry points: Server Components, jobs, crons, scripts, hooks, and direct service calls.
8. Inventory the static CRM workflows and their current backend calls.
9. Inventory all `SL-`/`RL-` prefix assumptions in code.
10. Inventory Cotality/provider identity fields and matched-pair behavior.
11. Inventory public listing dedupe across search, cards, detail pages, agents, featured listings, sitemaps, and similar listings.
12. Inventory errors and arbitrary response shapes.
13. Inventory flags, environment variables, jobs, dependencies, TODO/FIXME items, compatibility paths, and duplicate mappers.
14. Run current tests and health checks without changing production.
15. Record exact current statuses using `WORKING`, `PARTIAL`, `UNWIRED`, `DUPLICATED`, `BROKEN`, `MISSING`, or `DEFERRED-INFRA`.
16. Do not remove code merely because no caller was found.
17. Produce the PH-2 bounded implementation backlog from verified findings.

### Exit

- one canonical plan is discoverable from every agent entry point;
- no competing document remains silently authoritative;
- route, error, workflow, listing-identity, and bloat inventories exist;
- current behavior is separated from target behavior;
- PH-2 scope is evidence-based.

## PH-2 — Application foundation and identity

### Goal

Create the shared application, contract, authorization, error, and identity foundation.

### Steps

1. Define the application/use-case service boundary.
2. Route one bounded vertical slice through thin HTTP and internal adapters.
3. Resolve actor/context consistently.
4. Centralize resource authorization and non-disclosure.
5. Centralize applicable listing/display policy.
6. Implement shared success, empty, and error envelopes.
7. Implement contract/build version separation.
8. Establish the error catalog and mapping.
9. Establish explicit record source, ownership, provider identity, and reconciliation concepts.
10. Replace unsafe prefix-based ownership assumptions within the selected slice.
11. Implement verified/possible/conflict/broken matched-pair states.
12. Preserve Mallan/provider field separation.
13. Add dependency and drift tests.
14. Prove the slice in preview/production and verify rollback.
15. Ratchet architecture checks so new bypasses cannot be introduced.

### Exit

- one use case proves the architecture end to end;
- authorization and policy cannot be bypassed in that slice;
- empty results and errors are contract-correct;
- matched-pair identity is explicit;
- no authority-transfer behavior exists.

## PH-3 — Working public search

### Goal

Deliver reliable, deterministic, compliant public search.

### Steps

1. Trace the current browser/server path for `/search`.
2. Trace `/api/results` and any alternate result paths before changing them.
3. Map every visible filter to the canonical field contract.
4. Remove or disable unsupported controls.
5. Connect the UI to the application search service.
6. Limit public inventory to authorized scope.
7. Apply authorization/policy and matched-pair suppression before final totals and pagination.
8. Implement deterministic sorting and stable pagination.
9. Implement URL state and saved-search versioning.
10. Distinguish loading, empty, unsupported, stale, provider failure, and partial states.
11. Verify sale/rental separation.
12. Verify address and field suppression.
13. Verify required attribution.
14. Verify mobile behavior.
15. Replay saved searches under the correct contract version.
16. Prove one matched `SL-`/`RLS*` case produces one public result and one canonical Mallan URL.
17. Prove provider failure does not become a false empty result.

### Exit

- search works end to end;
- no visible dead controls;
- no silently ignored criteria;
- deterministic results;
- accurate scope and attribution;
- one canonical result for matched pairs.

## PH-4 — Dynamic CRM, seller loop, and CMA

### Goal

Replace the most important static workflows and deliver the seller value loop.

### Steps

1. Migrate the listing workspace into the dynamic CRM.
2. Support creation/editing of Mallan `SL-` sale and `RL-` rental website records.
3. Display any matched provider counterpart as read-only.
4. Display reconciliation discrepancies and required actions.
5. Migrate the client timeline and core communication workflow.
6. Migrate showing, feedback, task, note, offer, and document workflows needed by sellers.
7. Build the seller activity service with truth levels.
8. Add building and area market activity using authorized data.
9. Build automatic initial comparable selection.
10. Explain why each comparable was selected.
11. Allow agent add/remove/reorder/adjust/note actions.
12. Keep provider facts separate from agent judgment.
13. Version and deliberately share the seller-facing CMA.
14. Keep live market activity updating independently of the shared CMA.
15. Add seller portal authorization and non-disclosure.
16. Add stale/missing/provider-failure states.
17. Prove the flow with an authorized Mallan listing.
18. Retire the corresponding static workflow only after parity and rollback proof.

### Exit

- the dynamic CRM supports the selected daily workflow;
- the seller sees truthful activity and market context;
- the agent can create and share a CMA;
- no provider fact is silently altered;
- the static replacement is safely retired only where proved.

## PH-5 — Marketing readiness

### Goal

Build a lawful, auditable campaign system before any production bulk send.

### Steps

1. Approve the contact × channel × purpose consent model.
2. Preserve contact-source provenance and identity confidence.
3. Implement opt-in and durable opt-out/unsubscribe.
4. Separate transactional and marketing senders.
5. Implement recipient eligibility and suppression.
6. Handle invalid addresses, bounces, complaints, and duplicates.
7. Connect Fair Housing evaluation and human review.
8. Apply listing permission, Participant Only, Owner Opt-Out, attribution, and audience rules.
9. Build preview and dry-run workflows.
10. Require exact recipient reconciliation.
11. Add campaign audit history and listing/client linkage.
12. Run internal test sends.
13. Require Maya's explicit release before a production campaign.

### Exit

- consent and suppression enforcement are proven;
- totals reconcile;
- compliance fails closed;
- marketing cannot impair transactional email;
- no live send occurs without approval.

## PH-6 — Explainable intelligence and continuous cleanup

### Goal

Use trustworthy events and outcomes to assist agents without allowing AI or bloat to own the system.

### Steps

1. Define signal vocabulary and reason codes.
2. Connect verified signals to shared contracts.
3. Attach evidence, timestamps, confidence, and policy state.
4. Build human-approved next-best-action recommendations.
5. Keep AI replaceable and subordinate.
6. Record outcomes and usefulness.
7. Add capability and cost ledgers.
8. Continue CRM migration by vertical slice.
9. Schedule document, route, error, flag, job, dependency, and temporary-code review.
10. Remove only items with safe-removal proof.
11. Re-run provider and policy drift checks on a defined cadence.
12. Invalidate dependent evidence when a governing contract changes.

### Exit

- intelligence is explainable and evidence-backed;
- AI does not invent or own facts;
- provider and policy drift are monitored;
- bloat cannot accumulate without ownership and disposition.

---

# 18. Immediate next steps

These are the next actions after this document is placed in the repository:

1. Update agent entry points to require this plan.
2. Open a documentation-only PR containing this plan and navigation changes.
3. Review and approve the business rules, especially `SL-`, `RL-`, `RLS*`, matched-pair behavior, static CRM migration, error governance, and housekeeping.
4. Merge only after Maya approval.
5. Begin PH-1 in a new bounded branch.
6. Do not begin PH-2 implementation before PH-1 inventories and findings are reviewed.
7. Do not alter Neon, R2, Prisma, migrations, crons, environment variables, or provider sync as part of this documentation change.

---

# 19. Per-PR operating checklist

Every PR must answer:

```text
What bounded capability does this change?
Which requirement IDs govern it?
What was added?
What was removed?
What duplication was introduced or eliminated?
Were routes, errors, flags, jobs, env vars, dependencies, or documents changed?
What provider or policy source was verified?
What does the evidence prove?
What does it not prove?
What production or immutable-preview proof exists?
What is the rollback?
What remains open?
Why are there no unrelated files?
```

---

# 20. Open external gates

The following require evidence or approval before implementation:

1. Exact rights in Mallan's executed feed license for each public, internal, portal, CMA, analytics, storage, and export use.
2. Current authenticated Cotality fields, values, filters, expansions, and runtime behavior.
3. Whether durable matched-pair identity requires a schema change.
4. Consent/provenance schema changes for production marketing.
5. Any Neon, R2, media-reconciliation, or storage work.
6. Any broader licensed inventory source needed for expanded professional search.
7. Any additional feed/product acquisition.

These are evidence gates, not permission to guess or write another plan.

---

# 21. Completion definition

A capability is complete only when:

- the business purpose is correct;
- data authority and permitted use are known;
- identity is correct;
- authorization and policy are enforced;
- request and response contracts are validated;
- UI and workflow are connected;
- errors are explicit and owned;
- evidence and audit are durable;
- tests cover success and failure;
- health checks exist;
- production or immutable-preview behavior is proved;
- rollback is proved;
- stale and duplicate paths are retired safely;
- inventories and documentation are current;
- Maya approved the merge or release.

---

# 22. Change protocol

For every amendment to this file:

1. identify the requirement IDs being changed;
2. state why the existing rule is insufficient or wrong;
3. identify all dependent requirements and active code/doc surfaces;
4. update affected summaries and agent entry points in the same PR;
5. record evidence and unresolved gaps;
6. do not reuse a retired ID for a different meaning;
7. preserve the prior version in Git history rather than creating another active plan file.

This file is the stable address. Its contents evolve; its path does not.
