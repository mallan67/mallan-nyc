# MALLAN INTELLIGENCE
## Unified Product, Data, Technology, Compliance, and Implementation Master Plan

**Status:** Authoritative target architecture and implementation direction  
**Repository:** `mallan67/mallan-nyc` only  
**Audience:** Maya Allan, brokers, agents, engineers, reviewers, Claude, Codex, ChatGPT, Copilot, Gemini, and future AI systems  
**Operational status source:** `docs/PROJECT-HEALTH-DASHBOARD.md`  
**Issue source:** `docs/PLATFORM-ISSUE-REGISTRY.md`  
**Cross-agent rules:** `AGENTS.md` and `AI-START-HERE.md`

This document defines what the Mallan platform must become. It does not claim that every capability below is implemented. Every implementation claim must be verified against current `main`, current production, tests, and runtime evidence.

The unresolved Neon/R2 optimization campaign is a separate infrastructure workstream. It must not be represented as fixed or silently folded into this architecture plan.

---

# 1. Executive mandate

Mallan.nyc will become a **human-led, evidence-backed New York City brokerage operating system**.

It will not be built as disconnected websites, dashboards, CRMs, AI assistants, reports, and automation scripts. It will operate as one company-owned system with:

1. A public growth and education experience.
2. A professional agent search and client-service operating system.
3. A broker management, governance, finance, compliance, technology, and growth operating system.
4. Separate buyer, tenant, seller, and landlord portals.
5. One canonical property, identity, household, organization, relationship, listing, transaction, and event foundation.
6. One versioned compliance and policy system.
7. One durable workflow, approval, and notification system.
8. One evidence, provenance, and artifact system.
9. One outcome and learning loop.
10. Provider adapters that allow Cotality, communications, mapping, documents, accounting, and AI services to change without rebuilding the platform.

The competitive objective is to combine:

- a simple and polished user experience;
- deep professional listing search;
- first-party buyer-demand intelligence;
- rigorous NYC property, building, unit, and ownership intelligence;
- disciplined client and transaction operations;
- explainable recommendations;
- broker-controlled judgment;
- durable relationship memory;
- adaptable provider and compliance contracts.

---

# 2. One system, four separate product experiences

## 2.1 Public growth experience

Purpose:

- attract the right visitor;
- educate and answer real questions;
- establish expertise and trust;
- provide interactive decision tools;
- understand intent with consent;
- create the appropriate call to action;
- convert visitors into qualified relationships.

The public frontend is not the agent’s professional MLS workspace. It should make complex NYC real estate understandable and useful.

## 2.2 Agent operating system

Purpose:

- professional property search;
- client-first and property-first matching;
- property, building, unit, and market analysis;
- CMA and report preparation;
- collections and compliant sharing;
- showing, feedback, offer, application, and transaction management;
- relationship continuity and retention.

Search and listings are central to agent work, but the system must continue from discovery through advice, collaboration, transaction, and after-close service.

## 2.3 Broker operating system

Purpose:

- give the broker the complete producing-agent toolset;
- supervise agents, leads, clients, listings, and transactions;
- manage compliance, laws, forms, licenses, and incidents;
- govern commissions, referrals, receivables, payouts, accounting support, and tax-preparation records;
- monitor technology, integrations, provider health, security, cost, and releases;
- measure agent performance, business performance, risk, and growth.

## 2.4 Client portals

Separate portals are required for:

- buyers;
- tenants;
- sellers;
- landlords.

These may share a technical framework, but they must not be one generic portal with renamed labels. Each role has distinct information, decisions, permissions, documents, reports, and next actions.

## 2.5 Shared foundation, different interfaces

The four experiences may have different:

- interfaces;
- permissions;
- fields;
- filters;
- ranking;
- reports;
- actions;
- calls to action.

They must share:

- canonical identity;
- property and listing identity;
- provider field meaning;
- relationship history;
- event vocabulary;
- workflow state;
- policy and compliance decisions;
- artifact and evidence provenance;
- audit history.

Public and backend search remain separate products. They share stable definitions and provider mappings, not identical UX or identical data exposure.

---

# 3. Governing principles

## 3.1 Technology supports human judgment

Technology should remember, normalize, verify, calculate, prepare, monitor, explain, coordinate, prevent omissions, and identify timely opportunities.

The broker or agent owns trust, interpretation, advice, strategy, sensitive conversations, negotiation, conflict resolution, consequential approval, and professional responsibility.

## 3.2 One canonical owner per concept

Examples:

- Live Cotality/Trestle is authoritative for licensed feed resources, fields, enumerations, and runtime behavior.
- Mallan canonical records are authoritative for Mallan clients, relationships, commitments, decisions, workflows, and outcomes.
- The versioned policy registry is authoritative for operationalized compliance rules.
- The canonical search contract is authoritative for filter meaning and capability support.
- The artifact system is authoritative for what version was approved and delivered.
- The immutable financial ledger is authoritative for commission and payout changes.

## 3.3 No silent failure

The system must not:

- accept unsupported search criteria and silently return zero;
- reinterpret an old saved search after vocabulary changes;
- label modified inventory as new inventory;
- show stale reports as current;
- display success when the backend record was not created;
- silently map an unknown provider value;
- copy compliance logic differently into several routes;
- present AI output as verified fact without evidence.

Unknown, unsupported, stale, conflicting, and unverified states must be explicit.

## 3.4 Build closed loops

A capability is not complete because a page, route, schema, prompt, or test exists.

A capability is complete when its required data, service, API, authorization, UI, workflow, approval, notification, evidence, audit, tests, observability, production proof, rollback, documentation, and operational ownership are connected.

## 3.5 Preserve evidence and history

The system must preserve:

- source values;
- source dates;
- provider contract versions;
- policy versions;
- prior decisions;
- superseded artifacts;
- human approvals;
- outcome history.

Do not overwrite the past in a way that prevents explaining what was known and approved at the time.

---

# 4. Target architecture

```text
EXTERNAL DATA AND SERVICES
│
├── Cotality / Trestle
├── REBNY and regulatory sources
├── ACRIS / DOB / DOF / PLUTO / HPD where permitted
├── Outlook / email
├── Calendar
├── SMS / voice
├── Documents / OCR / e-signature
├── Mapping / geocoding / transit
├── Accounting exports
├── AI models
└── Image / floor-plan / spatial analysis
        │
        ▼
SOURCE ADAPTER AND CONTRACT LAYER
│
├── Cotality adapter
├── Public-record adapters
├── Communication adapters
├── Document adapters
├── Mapping adapters
├── Accounting adapters
└── AI-model adapters
        │
        ▼
CANONICAL MALLAN GRAPH
│
├── Person
├── Household / decision group
├── Organization
├── Property
├── Building
├── Unit
├── Ownership
├── Listing
├── Lead / opportunity
├── Client relationship
├── Agent relationship
├── Search profile
├── Deal / transaction
├── Communication / interaction
├── Showing
├── Offer / application
├── Task / commitment
├── Decision
├── Document
├── Artifact
├── Insight / signal
└── Workflow run
        │
        ▼
MALLAN NERVOUS SYSTEM
│
├── Transactional event outbox
├── Runtime workflow engine
├── Capability registry
├── Deterministic tool registry
├── Policy and compliance engine
├── Approval engine
├── Artifact and version system
├── Provenance and evidence ledger
├── Dependency and staleness engine
├── Notification dispatcher
├── Audit ledger
└── Cost and outcome ledger
        │
        ▼
PRODUCT EXPERIENCES
│
├── Public growth experience
├── Agent operating system
├── Broker operating system
├── Buyer portal
├── Tenant portal
├── Seller portal
└── Landlord portal
        │
        ▼
OUTCOMES RETURN TO THE SAME SYSTEM
│
├── inquiry
├── appointment
├── showing
├── decision
├── offer / application
├── agreement
├── listing
├── contract / lease
├── closing
├── commission
├── referral
└── future opportunity
```

---

# 5. Dynamic Cotality architecture

Cotality must be treated as a replaceable external authority, not as provider terminology and request logic scattered throughout the application.

## 5.1 Authority model

The live Cotality API is authoritative for:

- resources;
- fields;
- types;
- enumerations;
- relationships;
- filterability;
- sort behavior;
- pagination;
- media classifications;
- source timestamps;
- actual runtime feed behavior.

Never infer runtime behavior from RESO certification, a CSV, a metadata snapshot, another MLS, or an old audit.

## 5.2 Adapter boundary

Application code should use stable Mallan interfaces such as:

```text
ListingProvider.search()
ListingProvider.getListing()
ListingProvider.getChangesSince()
ListingProvider.getMedia()
ListingProvider.getOpenHouses()
ListingProvider.getMember()
ListingProvider.getOffice()
```

Raw Cotality request construction, token handling, OData pagination, provider error interpretation, and provider-specific mapping belong in the Cotality integration layer.

## 5.3 Recommended integration structure

```text
lib/integrations/cotality/
├── client
├── authentication
├── metadata-reader
├── metadata-diff
├── generated-contract
├── capability-registry
├── field-mapping
├── enum-mapping
├── normalization
├── pagination
├── cursors
├── media
├── open-houses
├── members-offices
├── errors
├── telemetry
└── compatibility-tests
```

This target structure must be reconciled with existing canonical files before implementation. Do not create a second parallel integration tree if current canonical modules can be evolved.

## 5.4 Live metadata and contract cycle

Required process:

1. Retrieve live Cotality metadata.
2. Normalize it into a machine-readable contract.
3. Compare it with the approved production contract.
4. Classify changes.
5. Generate an impact report.
6. Run compatibility tests.
7. Block unsafe deployment.
8. Create a review task when manual interpretation is required.
9. Update the adapter, field registry, and tests.
10. Stage the change.
11. Verify runtime behavior and population effects.
12. Preserve prior contract versions for rollback and historical interpretation.

## 5.5 Change classification

### Additive

Examples: new optional field, new enum member, new resource.

Default behavior:

- register as discovered;
- do not expose automatically;
- classify its purpose and audience;
- adopt only after review and testing.

### Deprecation

Examples: obsolete field, replacement resource, endpoint retirement.

Default behavior:

- establish a deadline;
- identify every caller and stored dependency;
- dual-support where possible;
- remove only after production proof.

### Breaking

Examples: removed field, type change, renamed enum, changed relationship, changed filterability.

Default behavior:

- fail the compatibility gate;
- prevent automatic deployment;
- require adapter, search, data, and policy review.

### Behavioral

Examples: the schema remains compatible but returned values, filtering, throttling, pagination, or permission behavior changes.

Default behavior:

- run live probes and population comparisons;
- do not treat schema compatibility as proof.

## 5.6 Canonical field registry

Each material concept must record:

- canonical Mallan concept;
- Cotality resource and field;
- provider type and values;
- filterability, sortability, and searchability;
- alert and report support;
- public, agent, broker, and portal visibility;
- compliance role;
- database and projection destination;
- DTO destination;
- fallback behavior;
- source timestamp;
- verification status;
- contract version.

Capability statuses:

- `supported`;
- `supported_with_restrictions`;
- `needs_live_probe`;
- `discovered_not_adopted`;
- `deprecated`;
- `unsupported`;
- `blocked_by_policy`.

## 5.7 Anti-corruption layer

Raw provider terminology must not become the permanent Mallan business model.

Example:

```text
Cotality StandardStatus
→ provider adapter mapping
→ stable Mallan listing lifecycle
→ audience-specific policy decision
→ public, agent, broker, or portal representation
```

Preserve the original provider value and provenance while exposing a stable internal meaning.

## 5.8 Unknown values

Unknown provider values must:

- be retained with raw provenance;
- be logged and reported;
- not crash ingestion;
- not be silently mapped;
- be quarantined from affected regulated output until classified;
- create a contract-review task.

## 5.9 Cotality change gate

Any change touching provider fields, enums, search, listing DTOs, status, property type, ownership, media, open houses, attribution, display permissions, or comp selection must run the applicable:

- live Cotality pull and drift verification;
- field-registry validation;
- enum-membership validation;
- runtime behavioral probes;
- canonical search tests;
- compliance tests;
- compatibility report.

---

# 6. Dynamic REBNY and regulatory architecture

REBNY and regulatory requirements must not remain as comments, copied conditions, or knowledge held by one agent.

## 6.1 Versioned policy registry

Each policy should record:

```text
policy_id
jurisdiction
authority
official_source
title
description
effective_date
superseded_date
version
affected_entities
affected_workflows
audiences
severity
enforcement_mode
required_disclosure
required_form
test_ids
implementation_owner
review_status
legal_or_compliance_review
```

Authorities may include REBNY, RLS, New York Department of State, New York City, New York State, federal requirements, and brokerage policy.

## 6.2 Central policy decisions

Workflows and routes should request policy decisions rather than recreate rules:

```text
PolicyEngine.canDisplayListing(context)
PolicyEngine.canDisplayAddress(context)
PolicyEngine.requiredAttribution(context)
PolicyEngine.canSendCommunication(context)
PolicyEngine.requiredRentalDisclosure(context)
PolicyEngine.canShareClientData(context)
PolicyEngine.canReleaseDocument(context)
PolicyEngine.canCalculateCommission(context)
```

## 6.3 Policy change process

When a rule changes:

1. Register the official source and effective date.
2. Add a new policy version.
3. Map affected capabilities and artifacts.
4. Add failing tests for the new rule.
5. Update centralized policy logic.
6. Update forms, disclosures, templates, and user guidance.
7. Run retrospective impact analysis.
8. Stage behind an effective-date-aware flag when appropriate.
9. Deploy and prove before the effective date.
10. Retain historical policy versions for prior transactions and audit.

## 6.4 Effective-date behavior

Policy evaluation may depend on:

- action date;
- listing date;
- agreement date;
- communication date;
- transaction date;
- policy effective date.

Historical records must remain interpretable under the applicable historical rule while current delivery may require current disclosures.

## 6.5 Fail-closed boundaries

Fail closed when:

- display permission is unknown;
- audience is unresolved;
- consent is missing;
- owner or participant restriction is unresolved;
- required attribution cannot be produced;
- agent ownership cannot be proven;
- commission inputs or approval are incomplete;
- an artifact is stale;
- a policy conflict has not been resolved.

---

# 7. Canonical identity and property graph

## 7.1 Person

Represents an individual identity, not a role.

Supports:

- stable internal ID;
- names and aliases;
- verified contact methods;
- contact provenance;
- identity confidence;
- privacy classification;
- communication restrictions;
- merge and split history.

Email and phone are supporting identifiers, never the sole identity key.

## 7.2 Household or decision group

Represents people participating in a shared real-estate decision.

Supports:

- members;
- relationship;
- influence;
- legal authority;
- communication permissions;
- document access;
- joint approval requirements;
- active dates.

## 7.3 Organization

Represents LLCs, corporations, trusts, estates, family offices, brokerages, law firms, lenders, managing agents, property managers, and vendors.

Supports:

- legal name and aliases;
- registration identifiers;
- representatives and authority;
- addresses;
- source provenance.

## 7.4 Property graph

```text
Property
├── Building
├── Unit
├── Address history
├── BBL
├── BIN
├── Ownership history
├── Deeds and mortgages
├── Taxes and liens
├── Permits and violations
├── Building rules
├── Listings
├── Media
├── Documents
├── Client relationships
├── Transactions
└── Property passport
```

A listing is a time-bound marketing record. It is not the permanent property record.

## 7.5 Client relationship

One person or organization may simultaneously or sequentially be a buyer, seller, tenant, landlord, investor, owner, past client, referral source, or adviser.

Lifecycle state must exist per relationship or role. Do not collapse all roles into one global status.

## 7.6 Relationship knowledge types

The system must distinguish:

- **Verified fact:** source-backed and actionable.
- **Client-stated preference:** what the client explicitly said.
- **Observed behavior:** what the client did.
- **Broker hypothesis:** a labeled interpretation requiring confirmation.
- **Confirmed decision:** an approved choice that may supersede an earlier preference while preserving history.

## 7.7 Commitments

Promises must be structured:

```text
commitment
owner
recipient
due_at
status
completion_evidence
related_interaction
related_workflow
```

The agent and broker home should prominently answer: **What does Mallan owe the client now?**

---

# 8. Event, workflow, artifact, and approval system

## 8.1 Transactional event outbox

Every material data change and its event must be committed together.

Examples:

- `provider.contract_changed`;
- `policy.changed`;
- `property.tax_changed`;
- `property.violation_added`;
- `ownership.changed`;
- `listing.created`;
- `listing.price_changed`;
- `listing.status_changed`;
- `listing.media_changed`;
- `client.preference_changed`;
- `client.budget_changed`;
- `buyer.intent_changed`;
- `document.received`;
- `showing.completed`;
- `offer.received`;
- `lease.expiring`;
- `deal.closed`.

Required event context:

```text
event_id
event_type
occurred_at
recorded_at
actor
entity_type
entity_id
relationship_id
property_id
listing_id
agent_id
source
source_event_id
contract_version
policy_version
payload
sensitivity
correlation_id
causation_id
```

## 8.2 Runtime workflow engine

Each workflow should record:

```text
workflow_id
workflow_type
workflow_version
capability_id
trigger_event
primary_entity
relationship
property
human_owner
current_step
state
input_snapshot
output_references
retry_state
approval_state
next_run_at
staleness_dependencies
cost
trace_id
audit_references
outcome
```

The engine must support pause, resume, retry, wait, approval, cancellation, idempotency, compensation, deadline escalation, and partial regeneration.

## 8.3 Capability registry

Each capability identifies:

- owner and business purpose;
- user roles;
- canonical entities;
- source adapters;
- policy requirements;
- deterministic tools;
- workflow version;
- approval level;
- artifacts and notifications;
- UI surfaces;
- tests and metrics;
- cost;
- feature flag;
- maturity.

Maturity states:

- `discovered`;
- `designed`;
- `contracted`;
- `implemented`;
- `shadow_mode`;
- `limited_release`;
- `production`;
- `degraded`;
- `deprecated`;
- `retired`.

## 8.4 Human-service levels

### Level 1 — Safe automation

Internal refresh, indexing, duplicate detection, calculations, monitoring, reminders.

### Level 2 — Prepare for human

CMA draft, call brief, comparison, report, email draft, offer analysis.

### Level 3 — Human approval required

Client-facing advice, pricing recommendations, bulk outreach, marketing claims, negotiation drafts, contract-related explanations.

### Level 4 — Human only

Distress, complaint, discrimination concern, legal threat, conflict, death or estate sensitivity, deal collapse, trust breakdown, and final negotiation judgment.

## 8.5 Artifact lifecycle

```text
Draft → Review → Approved → Delivered → Superseded or Withdrawn
```

Artifacts include CMAs, research reports, seller opportunity briefs, listing presentations, marketing plans, listing descriptions, buyer comparisons, market reports, seller and landlord reports, emails, campaigns, offer analyses, transaction checklists, and property passports.

## 8.6 Artifact evidence

Every material artifact should retain:

- source records and source provider;
- source and retrieval timestamps;
- provider contract version;
- policy version;
- methodology;
- model and instruction version where AI is used;
- confidence and contradictions;
- missing information;
- reviewer and approver;
- delivery audience and delivered version;
- later changes.

## 8.7 Dependency and staleness

When a supporting fact changes:

1. Update the canonical record.
2. Emit an event.
3. identify dependent insights and artifacts;
4. mark them stale;
5. block pending delivery;
6. preserve delivered history;
7. regenerate only affected sections;
8. create a review task.

---

# 9. Search architecture

Public and professional search remain separate products while sharing stable field meaning, identity, policy, and serialization contracts.

## 9.1 Shared search contract

Defines:

- canonical filters;
- provider and internal mappings;
- capability support;
- sort semantics and stable tiebreakers;
- result identity;
- pagination;
- audience and visibility;
- attribution;
- saved-search serialization;
- alert and report compatibility.

## 9.2 Public search

Public search should:

- guide discovery;
- explain professional terminology;
- expose permitted inventory only;
- explain costs and tradeoffs;
- support building and neighborhood learning;
- provide contextual calls to action;
- preserve useful consented search memory.

It must not expose agent-only fields, restricted statuses, unauthorized inventory, false totals, or client-side post-pagination filtering represented as complete results.

## 9.3 Agent search

Professional capabilities should include:

- complete authorized Cotality search;
- wider licensed status visibility;
- building and unit search;
- exact address;
- map and polygon search;
- financial and common-interest fields;
- open houses;
- price and status history;
- client-linked searches;
- seller and landlord competition;
- comparable-property selection;
- configurable professional columns;
- saved templates;
- property-to-client matching;
- client-to-property matching;
- collections and compliant sharing.

## 9.4 Broker search

Adds:

- firm-wide demand and search ownership;
- agent activity;
- underserved client demand;
- listing competition;
- company opportunities;
- compliance exceptions;
- performance and adoption metrics.

## 9.5 Portal search

The client sees:

- authorized searches and collections;
- saved, hidden, compared, and discussed properties;
- agent-curated recommendations;
- explicit preference correction;
- no unauthorized agent identity or owner PII;
- no non-public inventory without an explicit compliant share.

## 9.6 Saved-search contract

Requires:

- criteria version;
- filter schema version;
- sort;
- audience;
- owner agent;
- client relationship;
- notification settings;
- consent state;
- provider capabilities;
- last successful execution;
- migration state.

Old criteria must be migrated or blocked, never silently reinterpreted.

## 9.7 Execution rules

- Apply filters before pagination.
- Return a truthful total.
- Use deterministic sort plus stable ID tiebreaker.
- Reject unsupported criteria explicitly.
- Use equivalent meaning across authorized surfaces.
- Replay alerts with the same search semantics.
- Distinguish new inventory from modified inventory.
- Deduplicate sent and alerted listings.

---

# 10. Public growth experience

## 10.1 Objective

Help a consumer understand, compare, plan, trust, and act.

## 10.2 Buyer and renter journeys

Include:

- guided discovery;
- affordability;
- monthly and move-in costs;
- closing costs;
- building and neighborhood intelligence;
- commute and transit;
- comparisons;
- open houses;
- photos, floor plans, video, and 3D where authorized;
- save, compare, hide, share;
- showing request;
- broker comparison or strategy request;
- curated search.

## 10.3 Seller journey

Include:

- valuation request;
- property, building, and unit context;
- market competition;
- buyer-demand evidence where permitted and appropriately aggregated;
- net-proceeds tools;
- preparation and marketing guidance;
- timing;
- consultation;
- ongoing property review.

## 10.4 Landlord journey

Include:

- rental-value analysis;
- comparable inventory;
- vacancy cost;
- concession analysis;
- renewal-versus-relist;
- rent-versus-sell;
- landlord consultation.

## 10.5 Contextual calls to action

Examples:

- repeated property views → private showing;
- comparison activity → broker comparison report;
- affordability activity → purchase-range review;
- empty search → alternative strategy;
- building saves → building alerts;
- seller content engagement → property review;
- landlord calculator use → leasing strategy review.

## 10.6 Progressive lead capture

Capture in stages:

1. anonymous permitted behavior;
2. voluntary saved state;
3. email or phone with consent;
4. structured needs;
5. agency or service relationship;
6. transaction detail.

Preserve source, consent, campaign, page, property, search, intent, assigned agent, and follow-up obligation.

---

# 11. Agent operating system

## 11.1 Agent home

Answer:

- Who needs attention?
- What changed?
- What is overdue?
- Which promises are due?
- Which searches produced opportunities?
- Which showings need follow-up?
- Which reports are stale?
- Which transactions are at risk?
- Which compliance tasks block action?

## 11.2 Client workspace

One workspace should contain:

- person, household, and organization identity;
- roles and agency status;
- consent and communication restrictions;
- goals, constraints, financing, and preferences;
- observed behavior and hypotheses;
- searches and listing interactions;
- communications and commitments;
- concerns and decisions;
- documents;
- showings, offers, applications, and deals;
- after-close opportunities.

## 11.3 Buyer tools

- qualification and preapproval;
- affordability and liquidity;
- monthly-cost comparison;
- client-fit ranking with explanation;
- property and building comparison;
- showing itinerary and feedback;
- offer analysis;
- buyer agreement tracking;
- compensation confirmation;
- board readiness;
- lender and attorney coordination;
- transaction checklist.

## 11.4 Seller tools

- property and ownership research;
- CMA;
- current buyer-demand evidence;
- active competition;
- pricing scenarios;
- net proceeds;
- preparation and launch plan;
- marketing;
- showing and open-house feedback;
- engagement;
- offer comparison;
- seller reports;
- closing workflow.

## 11.5 Tenant tools

- rental search and comparison;
- move-in costs;
- documentation readiness;
- showing itinerary;
- application;
- lease milestones;
- renewal;
- future buyer path.

## 11.6 Landlord tools

- rental CMA;
- vacancy and concession analysis;
- tenant demand;
- showing and application pipeline;
- lease and renewal;
- relist;
- rent-versus-sell.

## 11.7 Relationship brief

Before an important conversation, generate:

```text
CLIENT AND DECISION PARTICIPANTS
PURPOSE
CURRENT STAGE
WHAT MATTERS TO THEM
VERIFIED FACTS
CLIENT-STATED PREFERENCES
OBSERVED BEHAVIOR
CONTRADICTIONS TO CLARIFY
OPEN COMMITMENTS
PROPERTY AND MARKET CHANGES
SENSITIVE OR HUMAN-ONLY CONTEXT
RECOMMENDED QUESTIONS
RECOMMENDATION
STRONGEST ARGUMENT AGAINST IT
POST-CALL DEBRIEF
```

---

# 12. Client intelligence and next-best human action

## 12.1 Signals

Examples:

- repeat views;
- saves and comparisons;
- changed budget or geography;
- increased or decreased activity;
- report engagement;
- showing request or feedback;
- financing progress;
- seller-report engagement;
- lease expiration;
- property or ownership event;
- inactivity after strong intent.

## 12.2 Signal contract

Every signal includes:

- type;
- evidence;
- source;
- confidence;
- explanation;
- expiration;
- recommended action;
- assigned person;
- policy restrictions.

## 12.3 Explainable, not manipulative

The system may explain that a buyer may be ready for a showing because they repeatedly viewed, saved, compared, and calculated costs for a property.

It should not present an unexplained score as truth or use behavior to pressure a client.

## 12.4 Contradiction intelligence

Identify mismatches neutrally and create clarification questions.

Examples:

- stated budget differs from repeated browsing range;
- privacy preference conflicts with maximum-exposure request;
- urgent timing conflicts with incomplete financing.

Do not convert contradictions into judgments.

---

# 13. Client portals

## 13.1 Shared framework

All portals share secure identity, relationship context, timeline, tasks, decisions, documents, communication settings, Ask Mallan, and Request a Call.

## 13.2 Buyer portal

- search and alerts;
- favorites and hidden properties;
- comparisons and collections;
- comments and questions;
- showing requests;
- affordability;
- documents;
- offer and deal progress.

## 13.3 Tenant portal

- rental search;
- costs and document checklist;
- favorites and showings;
- application status;
- lease milestones;
- renewal;
- future purchase planning.

## 13.4 Seller portal

- owned listing only;
- marketing and traffic;
- saves, repeat viewers, and inquiries in permitted form;
- showings and feedback;
- open houses;
- offers;
- competition and pricing history;
- reports, documents, and closing.

## 13.5 Landlord portal

- owned property and units only;
- listings and vacancy;
- inquiry quality;
- showings and applications;
- concessions and rental comps;
- lease, renewal, documents, and strategy.

---

# 14. Broker operating system

## 14.1 Producing-broker mode

The broker receives every agent capability for the broker’s own business.

## 14.2 Agent management

- roster;
- licenses and expiration;
- continuing education and ethics records;
- E&O;
- agreements and commission plans;
- onboarding and offboarding;
- access and assignment;
- workload and production;
- coaching and compliance history.

## 14.3 Agent performance

Measure more than gross commission:

- response time;
- contact and follow-up completion;
- qualification;
- search creation;
- listing sends and client engagement;
- showing conversion;
- offer or application conversion;
- close conversion;
- transaction duration;
- overdue tasks;
- documentation completeness;
- client retention;
- referrals and repeat business;
- compliance exceptions;
- commission collected;
- pipeline value;
- source profitability.

Every KPI must drill into the records that produced it.

## 14.4 Lead and client governance

- source and consent;
- assignment and reassignment;
- response SLA;
- duplicate and identity review;
- unassigned and unworked leads;
- inactive clients;
- role transitions;
- referral potential;
- agent coverage;
- audit history.

## 14.5 Listing governance

- agreements;
- required fields;
- compliance;
- media and photo order;
- open houses and appointment-only access;
- display permissions;
- pricing and expiration;
- protected periods;
- marketing;
- offers;
- closing.

## 14.6 Compliance and law center

- official rule library;
- source and effective date;
- affected workflows;
- implementation status;
- required forms and disclosures;
- acknowledgments;
- incidents and exceptions;
- corrective actions;
- policy tests;
- legal-review notes.

The system operationalizes confirmed requirements; it does not replace legal counsel.

## 14.7 Forms center

- approved form and version;
- effective date;
- applicable transaction;
- required signatures;
- replacement notice;
- archive;
- agent acknowledgment;
- client completion.

## 14.8 Commission and referral center

- compensation confirmation;
- buyer-paid compensation;
- seller concessions;
- verified co-broke where applicable;
- splits and team splits;
- referrals;
- receivables;
- approval and payout;
- adjustments and clawbacks;
- immutable ledger;
- supporting evidence.

Incomplete terms or split validation must block calculation and disbursement.

## 14.9 Accounting and tax-support center

- closed revenue;
- commission receivables;
- agent payables;
- referral receivables and payables;
- operating, technology, marketing, and vendor expenses;
- deal and agent profitability;
- cash-flow forecast;
- year-to-date income;
- accounting export;
- tax-category mapping;
- 1099 support;
- accountant document package.

The platform supports accounting operations. It does not make legal or tax decisions.

## 14.10 Technology center

- provider registry and contracts;
- provider health and data freshness;
- workflow and communication delivery failures;
- security incidents;
- vendor and model cost;
- feature flags and rollout state;
- backup and restore evidence;
- unresolved defects;
- deployment identity;
- current policy and provider-contract versions.

## 14.11 Business command center

- pipeline and expected commission;
- targets;
- lead-source ROI;
- listing, buyer, and rental pipeline;
- retention and referrals;
- market-segment performance;
- agent capacity;
- marketing performance;
- risk register.

---

# 15. Property, media, documents, transactions, and after-close

## 15.1 Media

One canonical media contract must classify and order:

- photos;
- hero image;
- floor plans;
- video;
- virtual and 3D tours;
- original source;
- provider ordering;
- authorization;
- deletion;
- AI modification provenance.

No surface should independently assume that `media[0]` is a valid hero image.

## 15.2 Documents

Support secure upload, validation, classification, versioning, required-document checklists, missing items, signatures, approval, expiration, access control, retention, and audit.

## 15.3 Transaction intelligence

Support:

- offers and applications;
- accepted terms;
- contract or lease;
- financing and appraisal;
- inspections;
- attorneys;
- board or management;
- title;
- closing or lease signing;
- move-in;
- commission and referral;
- post-close transition.

## 15.4 Decision support

Help compare price, net, certainty, financing, contingencies, timing, concessions, appraisal risk, board/building risk, and client priorities.

Do not automate final negotiation judgment.

## 15.5 Property passport

After close, preserve:

- ownership and purchase basis;
- mortgage;
- estimated value range with methodology;
- taxes;
- permits and violations;
- renovations;
- building changes;
- authorized insurance documents;
- lease dates;
- market reports;
- refinance, sale, rental, and referral opportunities;
- relationship milestones.

---

# 16. Communications and notifications

## 16.1 Canonical communication record

Every send records:

- sender and recipient;
- relationship;
- channel and purpose;
- source and template version;
- policy version;
- consent and suppression result;
- delivery and response;
- workflow and audit.

## 16.2 Notification dispatcher

One dispatcher should support in-app and email now, with future SMS and voice adapters.

Required behavior:

- deduplication;
- retries;
- dead-letter handling;
- delivery status;
- quiet hours;
- preferences;
- suppression;
- escalation.

## 16.3 Unsubscribe

- GET confirmation remains non-mutating.
- POST performs the unsubscribe.
- Scanner traffic and mutating opt-out traffic use separate limiter buckets.
- Suppression applies to every automated send path.
- Token validation fails closed.

## 16.4 Outlook

Support thread capture, relationship matching, draft preparation, human approval, delivery, reply ingestion, task and commitment extraction, rate limits, token rotation, and audit.

---

# 17. AI and future technology

## 17.1 One supervisor and registered capabilities

Do not create independent AI systems with separate data and policies.

Use:

- one canonical data foundation;
- one policy system;
- one deterministic tool registry;
- one capability registry;
- one workflow and approval engine;
- replaceable specialized models.

## 17.2 Model abstraction

Stable interfaces may include:

```text
AIService.generateStructured()
AIService.summarize()
AIService.classify()
AIService.extract()
AIService.reasonWithEvidence()
AIService.analyzeImage()
AIService.transcribe()
```

Model selection belongs in configuration and evaluation, not scattered hardcoded calls.

## 17.3 AI output contract

Record:

- model and version;
- instruction version;
- source references;
- structured schema validation;
- confidence where appropriate;
- prohibited-content and policy checks;
- human-review requirement;
- cost and trace.

## 17.4 Voice

Voice is a command layer after the workflows exist.

Example:

```text
“Prepare me for my call with the seller.”
→ authenticate
→ resolve relationship
→ run registered relationship-brief workflow
→ retrieve verified changes
→ prepare draft artifact
→ present for human review
```

Voice may not improvise unauthorized writes or communications.

## 17.5 Multimodal property intelligence

Reserve capability for:

- photo classification;
- floor-plan extraction;
- room relationships;
- condition and finishes;
- renovation quality;
- defects;
- media compliance;
- virtual-staging provenance;
- spatial comparison.

Preserve the original asset, derived analysis, edited version, edit type, provider/model, date, disclosure, approval, publication history, and withdrawal status.

## 17.6 Future protocols and providers

External tool and agent protocols may be adopted only through adapters and may not bypass identity, authorization, policy, workflow, approval, audit, or evidence.

## 17.7 AI economics

Track per capability:

- model and vendor cost;
- human-review time;
- duration;
- failure and revision rate;
- approval and completion rate;
- conversion;
- revenue attribution;
- client satisfaction.

Disable or redesign capabilities that do not create measurable value.

---

# 18. Build-versus-buy policy

## Mallan must own

- canonical identity, relationship, and property graph;
- identity-resolution policy;
- NYC property intelligence;
- search meaning;
- client and relationship memory;
- workflow orchestration;
- policy and compliance decisions;
- approval rules;
- artifact provenance;
- buyer and seller matching;
- broker, agent, and client experience;
- outcome learning;
- business judgment rules.

## Mallan may buy

- licensed listing data access;
- speech transcription;
- AI inference;
- OCR and document parsing;
- email, SMS, and voice transport;
- contact verification;
- image recognition;
- mapping and geocoding;
- e-signature;
- accounting transport.

**Buy commodity engines. Own intelligence, policy, workflow, evidence, relationship, and experience.**

---

# 19. Security, privacy, and governance

Required:

- secure sessions and MFA for sensitive roles;
- role and object authorization;
- agent ownership and broker oversight;
- portal isolation;
- rate limiting;
- request validation and CSRF protection;
- webhook signatures and cron authentication;
- sensitive-field encryption;
- audit of PII access;
- consent and universal suppression;
- retention, export, correction, deletion, and legal hold;
- incident response;
- secrets management.

Every capability must state its data classification, retention, authorized roles, export behavior, deletion behavior, and audit requirements.

---

# 20. Observability and operational control

Every request, provider call, job, workflow, and model call should carry applicable:

- request and correlation ID;
- workflow ID;
- deployment SHA;
- actor and entity;
- provider;
- contract and policy version;
- duration and result;
- retry count;
- records read, written, and skipped;
- cost;
- error class.

Required dashboards:

- provider health and data freshness;
- workflow health;
- notification delivery;
- search correctness;
- portal and agent activity;
- policy compliance;
- AI cost and quality;
- business outcomes.

A green status requires evidence, not assumption.

---

# 21. Evolution and migration strategy

## 21.1 Strangler migration

Do not replace the entire platform.

For each domain:

1. Identify the current implementation.
2. Classify it as working, partial, unwired, duplicated, broken, obsolete, or missing.
3. Place a canonical service or contract in front of it.
4. Add contract and behavior tests.
5. Run shadow comparisons.
6. Route a limited audience.
7. Measure correctness, compliance, performance, and business outcome.
8. Expand.
9. Remove the old path only after proof.

## 21.2 Feature flags

Support flags by audience, agent, broker, workflow, provider-contract version, policy effective date, model, and rollout percentage.

## 21.3 Shadow mode

New search, scoring, workflow, or AI logic should first run without changing user outcomes.

Compare population, ordering, decisions, cost, errors, compliance, and results.

## 21.4 Compatibility windows

When contracts change:

- support current and next versions where possible;
- migrate saved criteria and artifacts explicitly;
- retain historical interpreters;
- prohibit silent reinterpretation.

---

# 22. Implementation programs

## Program 0 — Adopt and reconcile the authority

Deliver:

- approved architecture and terminology;
- capability registry;
- current implementation inventory;
- owner map;
- dependency graph;
- obsolete-document list;
- architecture decision records.

The master plan is the target authority. Current operational truth remains in the dashboard, issue registry, and current source.

## Program 1 — Provider and policy adaptability

Build or reconcile:

- Cotality contract registry;
- live metadata diff;
- provider adapter;
- compatibility gate;
- canonical field registry;
- unknown-value quarantine;
- versioned REBNY/regulatory policy registry;
- policy decision service;
- effective-date handling;
- change-impact tooling.

## Program 2 — Canonical graph and identity

Build or reconcile person, household, organization, property, building, unit, ownership, relationship, participants, authority, interactions, commitments, decisions, preferences, concerns, and support context.

Avoid email-only identity.

## Program 3 — Canonical search runtime

Wire stable filters, sorts, totals, public execution, agent execution, saved searches, alerts, map, buildings, attribution, media, and comp eligibility.

Keep public and professional experiences separate while sharing meaning.

## Program 4 — Events, workflows, artifacts, and approvals

Build the transactional outbox, workflow engine, runtime capability registry, artifact versions, approval queue, staleness engine, notification dispatcher, and trace/cost records.

## Program 5 — Public growth system

Complete buyer, renter, seller, and landlord journeys; interactive tools; contextual calls to action; progressive lead capture; content-to-service conversion; consented behavior capture.

## Program 6 — Agent service system

Complete these loops:

- client → search → collection → send → interaction → showing → feedback;
- seller research → CMA → pitch → listing;
- tenant → search → application → lease;
- landlord → pricing → marketing → application → lease;
- relationship brief → next-best human action.

## Program 7 — Client portals

Complete in dependency order:

1. Buyer.
2. Tenant.
3. Seller.
4. Landlord.

Each must be role-specific, authorized, and fully wired.

## Program 8 — Broker operating system

Complete agent management, performance, lead governance, listing governance, compliance/law, forms, commissions, referrals, accounting support, technology center, and business command center.

## Program 9 — Transactions and after-close

Complete documents, offers/applications, milestones, approvals, commissions, referrals, property passports, anniversary workflows, and future-opportunity monitoring.

## Program 10 — Advanced intelligence

Only after trusted data, events, and workflows:

- supply-and-demand matching;
- explainable signals;
- voice;
- multimodal property analysis;
- predictive but reviewable opportunities;
- model evaluation and AI economics;
- additional providers and channels.

## Program 11 — Decommissioning and consolidation

Added by ratified correction **C-4** (§26). Runs continuously alongside Programs 1–10, not after them: every strangler migration under §21.1 creates retirement work, and unowned retirement work is how parallel truth returns.

Deliver:

- classification of every candidate directory, module, script, document, and route as live, superseded-but-referenced, superseded-and-unreferenced, generated, or unknown — **with reference-search evidence, not impression**;
- the obsolete-document list Program 0 promises but does not own;
- bounded retirement PRs, one per group, each with rollback;
- consolidation of duplicated surfaces onto their canonical owner per `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md`.

Nothing is deleted on suspicion. Classification precedes retirement, always.

---

# 23. First five closed-loop proofs

## Proof 1 — Seller opportunity

```text
property or ownership signal changes
→ canonical property and owner resolved
→ research refreshed
→ readiness recalculated
→ contact eligibility checked
→ current buyer demand measured
→ broker action created
→ brief prepared
→ outreach drafted
→ policy checked
→ broker approves
→ delivery recorded
→ reply ingested
→ next action updated
```

## Proof 2 — Buyer demand

```text
buyer behavior changes
→ preference and intent profile updates
→ matching inventory evaluated
→ reasons generated
→ agent reviews
→ collection delivered
→ client responds
→ showing or decision recorded
→ outcome improves future matching
```

## Proof 3 — Listing launch

```text
agreement signed
→ facts verified
→ media verified
→ disclosures assembled
→ description and campaign drafted
→ human approval
→ publication and distribution
→ engagement captured
→ seller reporting updated
```

## Proof 4 — Transaction

```text
contract or lease received
→ classified
→ obligations and dates extracted
→ missing items identified
→ calendar and tasks created
→ authorized parties notified
→ risks monitored
→ commission completed
→ close recorded
```

## Proof 5 — Property passport

```text
transaction closes
→ property passport begins
→ ownership and property changes monitored
→ reports and anniversaries generated
→ refinance, lease, sale, or referral opportunity detected
→ broker reviews
→ relationship reactivated
```

Do not build a large collection of disconnected AI features before these loops work.

---

# 24. Acceptance criteria for every capability

A capability is not done until all applicable items pass:

- [ ] business purpose and owner;
- [ ] user roles and permission matrix;
- [ ] canonical entities and source of truth;
- [ ] provider contracts and policy rules;
- [ ] schema and migration where required;
- [ ] deterministic service;
- [ ] API;
- [ ] object-level authorization and isolation;
- [ ] UI;
- [ ] workflow and approval;
- [ ] artifact and provenance;
- [ ] notification, consent, and suppression;
- [ ] audit;
- [ ] metrics and cost;
- [ ] unit tests;
- [ ] integration tests;
- [ ] authorization tests;
- [ ] compliance tests;
- [ ] provider-contract tests;
- [ ] production probe where applicable;
- [ ] rollback;
- [ ] documentation and operational owner.

---

# 25. Final product definition

Mallan Intelligence is:

> A unified, flexible, human-led NYC brokerage operating system in which the public website attracts, educates, learns, and converts; agents use professional search and intelligence to serve clients; clients collaborate through role-specific portals; the broker controls people, compliance, finance, technology, and growth; and every capability operates through canonical records, provider adapters, versioned policies, durable workflows, evidence-backed artifacts, approvals, and measurable outcomes.

The system must be able to absorb:

- Cotality resource, field, enum, endpoint, and runtime-behavior changes;
- REBNY and regulatory changes;
- new public-record sources;
- new AI models;
- voice and multimodal analysis;
- new communication channels;
- new accounting and document vendors;
- future mobile interfaces;
- additional brokerage services;

without rebuilding its identity, property, relationship, policy, event, workflow, evidence, and approval foundations.
---

# 26. Ratified corrections

**Ratified:** 2026-07-27
**Evidence basis:** `docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md`
**Status:** Normative. Where a correction below conflicts with an earlier section of this document, **the correction governs** and the earlier section is read as amended.

These corrections exist because the sections they amend were written as target architecture without a measured reading of the current implementation. Each cites the measurement that produced it. None changes the plan's intent; together they make it executable.

## C-1 — `audit_events` is not the §8.1 transactional outbox

The repository already contains `model AuditEvent` (`prisma/schema.prisma`, table `audit_events`). It carries `action`, `entity_type`, `entity_id`, `user_type`, `user_id`, `changes`, `ip_address`, `created_at`, and is bounded to a 2-year rolling retention.

§8.1 requires an event carrying `event_id`, `event_type`, `occurred_at` **and** `recorded_at` as distinct values, `actor`, `relationship_id`, `property_id`, `listing_id`, `agent_id`, `source`, `source_event_id`, `contract_version`, `policy_version`, `payload`, `sensitivity`, `correlation_id`, and `causation_id`.

These are **two different systems with similar names.**

- `audit_events` is a **retrospective compliance and PII-access record.** It answers "who changed what, when."
- The §8.1 outbox is a **forward dispatch mechanism.** It answers "what work must now happen, caused by what, under which contract and policy version."

**Ruling.** The outbox is **additive and separate**. `audit_events` is retained unchanged, keeps its 2-year bound, and **must not** be widened into an event bus. Any proposal to "just add columns to `audit_events`" is rejected by this correction. Compliance retention and workflow causality have different lifecycles, different sensitivity handling, and different deletion rules; merging them would make both incorrect.

## C-2 — Cotality consolidates on `lib/idx/`; no parallel integration tree

§5.3 presents a target structure at `lib/integrations/cotality/` and already instructs: "This target structure must be reconciled with existing canonical files before implementation. Do not create a second parallel integration tree if current canonical modules can be evolved."

**This correction performs that reconciliation.**

Measured: `lib/cotality/` contains exactly one file (`cotality-enums.ts`). The working Cotality/Trestle integration lives in **`lib/idx/` — 29 files** including `auth.ts`, `fetch.ts`, `trestle-mapper.ts`, `mapping.ts`, `sync.ts`, `media-sync.ts`, `public-dto.ts`, `db-to-public-dto.ts`, `display-adapter.ts`, `cotality-telemetry.ts`, `write-suppression.ts`, `media-reconcile-guard.ts`, `reconcile-decision.ts`, plus `__tests__/`.

**Ruling.**

1. **`lib/idx/` is the canonical Cotality adapter surface.** §5.3's tree is read as a *capability checklist*, not a directory specification.
2. **`lib/integrations/cotality/` must not be created.** Doing so would violate `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` and `AI-START-HERE.md` "Do not create parallel truth."
3. `lib/cotality/cotality-enums.ts` is folded into `lib/idx/` or explicitly retained with a documented reason. It must not become the seed of a second tree.
4. The genuinely missing capabilities are added **inside `lib/idx/`**:
   - `metadata-diff` — exists as `npm run trestle:diff`; **not yet a blocking gate**;
   - `generated-contract` — absent;
   - `capability-registry` — absent;
   - `compatibility-tests` as a **blocking** §5.9 gate — absent;
   - the `ListingProvider.*` domain interface of §5.2 — absent; callers currently reach into `lib/idx` directly.

Extracting `ListingProvider` is a pure refactor with no migration and is the correct first step.

## C-3 — Neon/R2 remediation is a hard dependency gate

Line 13 of this document states the Neon/R2 campaign "is a separate infrastructure workstream. It must not be represented as fixed or silently folded into this architecture plan." That is a **reporting** rule. It is not a **sequencing** rule, and no other Neon/R2 reference exists in this document.

Program 2 and Program 4 introduce `Person`, `Household`, `Organization`, `Artifact`, the event outbox, and `WorkflowRun`, plus `contract_version` and `policy_version` columns on existing tables. That is a **substantial write-volume and storage increase directed into the exact database currently under write-amplification remediation.**

**Ruling.** This correction converts the reporting rule into a **gate**:

> No Program 2 or Program 4 **schema** work begins until the Neon/R2 remediation workstream is verified complete against production evidence and Maya has approved the migration.

Non-schema Program 2/4 work — interface design, contract definition, service shape, tests against in-memory fixtures — may proceed. Only tables, columns, indexes, and backfills are gated.

This gate is additive to the existing standing hold on schema migrations (`CLAUDE.md` §A.7). Satisfying one does not satisfy the other; both are required.

## C-4 — Program 11: Decommissioning and consolidation

This document specifies what to build and never what to retire. §21.1 step 8 says "remove the old path" but assigns no owner and no program. Without one, the strangler migration of §21.1 accumulates strangled-but-never-removed paths — which is how parallel truth returns through the back door.

**Ruling. Add Program 11 — Decommissioning and consolidation.**

Deliverables, in order:

1. **Classify** every candidate directory, module, script, document, and route as: live · superseded-but-referenced · superseded-and-unreferenced · generated · unknown. Classification requires evidence — a reference search, not an impression.
2. **Produce the obsolete-document list** that Program 0 already promises but does not own.
3. **Retire** only what is proven unreferenced, one bounded PR per group, with rollback.
4. **Consolidate** duplicated surfaces onto their canonical owner per the source-of-truth charter.

Observed candidates at repository root: `__pw-review/`, `__pw-review-v2/`, `__pw-review-v3/`, `__pw-shots/`, `archive/`, `backups/`, and the coexistence of `src/`, `backend/`, and `frontend/` alongside `app/` and `lib/`.

**These are candidates, not conclusions.** Whether each is genuinely dead is **untested**. Program 11's first deliverable is classification with evidence. Nothing is deleted on suspicion.

## C-5 — §24 acceptance criteria become machine-enforced

§24 lists 26 acceptance items and §8.3 defines ten maturity statuses. Both are currently enforced by human memory, which drifts — and drift in an acceptance checklist silently converts "not done" into "done."

**Ruling.** §24 and §8.3 become machine-checkable, using the pattern already proven in this repository by `ucba:audit`, `rls:validate`, `idx:validate`, and `compliance-check`:

- **`config/capabilities.mjs`** — the capability registry (a module, not YAML: neither `js-yaml` nor `yaml` is a dependency, and a hand-rolled parser could silently mis-parse, making the validator itself untrustworthy). One entry per capability, carrying its §8.3 maturity status, its §24 acceptance evidence, and its owner.
- **`scripts/capability-audit.mjs`** — the validator. Verifies structural completeness, that every claimed status is supported by declared evidence, and that no capability claims a promoted status without the proof that status requires.
- **`npm run capability:audit`** — the entry point.

The registry begins as a **static file with no schema and no migration**, so Program 0 can complete without touching the database and without triggering the C-3 gate. It becomes a runtime registry later, under §8.3, once the C-3 gate is satisfied.

**Maturity status is assigned from evidence, never from intent or from volume of code written.** A capability with a route, a model, and a test but no wired loop is `implemented`, not `production`.

CI enforcement is **not** included: `.github/workflows/**` is held pending Maya's approval (`CLAUDE.md` §A.7). Until then the validator is run manually and its result stated explicitly.

## C-6 — AI-altered media provenance moves early, on existing-obligation grounds only

§15.1 already requires "AI modification provenance" in the canonical media contract. §17.5 already requires preserving the original asset, derived analysis, edited version, edit type, provider/model, date, disclosure, approval, publication history, and withdrawal status. §17.5 currently sits in Program 10 — last.

Separately, New York City has **signalled intent** to require disclosure of AI-altered listing media, as one of 23 actions in the July 2026 "Rental Ripoff Report," to be pursued through Department of Consumer and Worker Protection rulemaking.

**That signal is not law, and this correction does not treat it as law.**

Verified status: **proposed agency rulemaking. Not enacted. No published effective date. No Local Law number, no Intro number, and no rule citation obtained.** The official NYC.gov release returned HTTP 403 to automated fetch and was **not read directly**; the 68-page report was **not read**. All sourcing is secondary. Legal-industry commentary describes it as "a coming rule," preliminary and not yet binding on owners.

**Ruling.**

1. **Move the §15.1 / §17.5 media-provenance envelope into the early compliance program** — justified **today** by REBNY/RLS media rules and §3.2, entirely independent of any DCWP action. Virtual staging is already in industry use; provenance is already required. This is defensible on its own merits.
2. **Register the DCWP item in the §6.1 policy registry as `review_status: monitoring`, `enforcement_mode: none`, with no `effective_date`.**
3. **Do not implement a disclosure gate against hypothetical rule text.** Building enforcement against an unread rule violates §5.8 in spirit — never act on an unclassified value — and would produce a gate that fails in the wrong direction when the real text arrives.
4. **Promotion out of `monitoring` requires a dated official source** per `CLAUDE.md` §E and §J.4: the NYC.gov release read directly, the report PDF, a City Record notice of proposed rulemaking, a Council Intro number, or a REBNY member notice.
5. The same report's tenant-union recognition, repeat-offender enforcement, and building-registration items receive identical treatment: **monitor, do not implement.**

## C-7 — Measured baselines are dated evidence, not architecture facts

`MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md` records a measured baseline — 77 Prisma models, 31 migrations, 288 API routes, 156 CRM routes, 40 portal routes, 23 cron routes, 512 test files.

**Ruling.** Those numbers are **dated gap-analysis evidence, valid only for the commit and branch stated in that document.** They are not permanent architecture facts, not acceptance criteria, and not targets. They will go stale, and going stale is expected and correct.

Per `AI-START-HERE.md`, current operational truth lives in `docs/PROJECT-HEALTH-DASHBOARD.md` and `docs/PLATFORM-ISSUE-REGISTRY.md`. Anyone citing a count from the gap analysis must **re-run the stated command** and cite their own result, not the recorded one.

Counts prove declarations exist. They do not prove reachability, correctness, population, wiring, or that any test passes.
