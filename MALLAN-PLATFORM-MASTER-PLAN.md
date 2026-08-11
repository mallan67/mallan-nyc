# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Repository start point for the complete Mallan brokerage, business and intelligence operating system.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**.
- Repository: **`mallan67/mallan-nyc` only** for this plan unless Maya explicitly changes repository scope.
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document governs the high-level business model, canonical identities, source authority, operating journeys and execution sequence once approved.
- Existing audits, issue records, PRs, technical plans and historical specifications are supporting evidence. They may not become competing overall plans.
- Every new requirement discovered in an audit, conversation, hold file, specification or implementation review must be reconciled into this canonical plan or its linked requirement ledger. Requirements may not remain stranded in isolated documents.

## Non-negotiable canonical-system rule

Mallan must operate as **one brokerage system**, not a collection of independent CRM, search, CMA, listing, marketing, portal, transaction or finance products.

Every implementation must answer:

1. What is the canonical entity?
2. What is its canonical ID?
3. Which source or system is authoritative for each material fact?
4. Is this data a canonical record, source observation, history record, derived projection/index or workflow state?
5. Who produces it?
6. Who consumes it?
7. What event/state transition connects it to the next business step?
8. What existing implementation is reused, migrated or retired?
9. What prevents duplicate people, entities, properties, listings, communications, leads, transactions and documents?
10. What end-to-end test proves the handoff?

**No new parallel table, service, search engine, client store, listing store, party store, communication store or workflow may be introduced without an explicit identity, migration, deduplication and retirement decision.**

A feature is not complete merely because its screen or route works. It is complete only when its output is consumed correctly by the next required workflow.

---

## Critical current condition

Search is an immediate P0 business dependency because it supplies listing intelligence, comparables, CMA/pricing, seller market comparison, client sends, saved searches, alerts, matching and listing marketing audiences. Search is therefore the first property-intelligence recovery program, but search is not a separate business architecture.

The canonical requirement is:

> **One Property Intelligence/Search service must feed buyer/tenant search, seller/landlord pricing, building and area comparables, CMA, listing management, seller reporting, client matching, listing-to-client matching, saved searches, alerts and marketing.**

Do not add another search store, CMA universe, saved-search criteria model or listing inventory silo.

---

# 1. Mallan brokerage operating hierarchy

Mallan is organized around the brokerage and the actors operating it.

```text
MALLAN BROKERAGE
│
├── MALLAN BROKERAGE VIEW
│   └── firm-wide supervision, inventory, agents, leads, listings, deals,
│       compliance, finance, commissions, exceptions and performance
│
└── MY BUSINESS / PRODUCING AGENT VIEW
    └── the logged-in producer's leads, clients, searches, CMAs, listings,
        showings, marketing, deals, tasks and commissions
```

Maya is both representative broker/owner and producing agent. The system must model **one Individual with multiple roles and scopes**, not duplicate Maya as a broker identity and an agent identity.

Other agents use the same canonical records under narrower permissions. Brokerage totals aggregate agent production without duplicating records.

---

# 2. Canonical Party and relationship system

## 2.1 Party is the single identity root

Every human or legal owner/client/participant must enter the system through one canonical Party identity model.

```text
PARTY
│
├── INDIVIDUAL(S)
│   ├── Individual #1
│   ├── Individual #2
│   └── additional individuals as required
│
└── ENTITY
    ├── LLC
    ├── LLP
    ├── Corporation
    ├── Partnership
    ├── Trust
    ├── Estate
    └── Other legal entity
```

**Terminology requirement:** business-facing workflows must use **Individual(s) / Entity**, not a simplistic single-person assumption.

Trusts, LLCs, LLPs, estates, corporations and partnerships are Entity types. They must not become independent client databases. Entity-specific fields may exist where required, but identity remains canonical.

## 2.2 Roles are separate from identity

A Party may have multiple roles over time or simultaneously:

- Seller Individual(s) / Seller Entity
- Landlord Individual(s) / Landlord Entity
- Buyer Individual(s) / Buyer Entity
- Tenant Individual(s) / Tenant Entity
- Owner
- Investor
- 1031 exchanger
- Guarantor
- Trustee / co-trustee
- Executor / estate representative
- Member / manager / partner
- Authorized signatory
- Attorney / professional contact
- Lender / mortgage contact
- Referral source
- Cooperating agent/broker
- Other authorized participant

A buyer who later becomes an owner, landlord or seller remains the same Party. A seller who owns through an LLC remains linked to that Entity rather than being duplicated as a separate seller record.

## 2.3 Entity relationships

Entities may relate to one or more Individuals through explicit relationships such as:

- trustee
- co-trustee
- executor
- member
- manager
- partner
- officer
- authorized signatory
- beneficiary or other role where appropriate and lawful to retain

The system must support one or more authorized representatives without copying the Entity or the Individual.

## 2.4 Shared contact model

Every Individual(s) and Entity may have:

- preferred name / legal name
- mailing address(es)
- email address(es)
- phone number(s)
- preferred communication channel
- communication eligibility / consent / suppression state where applicable
- language/preferences where legitimately collected
- relationship ownership / assigned Mallan agent

Contact methods are reusable records linked to Party, not duplicated into every seller, buyer, tenant, landlord, listing or transaction table.

## 2.5 Professional contacts

Attorneys, law firms, lenders, mortgage professionals, managing agents and other transaction professionals are also canonical Parties/Organizations and are related to opportunities/transactions.

Once an offer is made, the workflow must request/confirm the relevant attorney information for the involved Individual(s) / Entity, including as applicable:

- attorney name
- law firm
- email
- phone
- assistant/paralegal contact where needed
- role/side represented

If the same attorney appears on five transactions, that attorney should exist once and be related to five transactions.

---

# 3. Canonical Property, Building, Unit and Listing identities

## 3.1 One physical property identity

The system must distinguish the physical asset from its marketing history.

```text
BUILDING
  ↓
PROPERTY / UNIT
  ↓
LISTING EPISODE(S)
  ↓
SOURCE OBSERVATION(S)
```

One apartment/unit must not be recreated every time it is listed, sold, rented or observed by another source.

A Property/Unit may have many Listing Episodes over time.

## 3.2 Listing Episode

A Listing Episode represents one period in which a Property/Unit is marketed for sale or rent. Historical episodes remain attached to the Property.

A new source reporting the same active market episode must attach as a Source Observation rather than creating a second search result.

## 3.3 Source observations and provenance

Material facts retain source provenance and freshness. Sources must not silently overwrite one another.

If sources conflict, the platform must preserve both observations and apply the central source-authority rule or flag the discrepancy for review.

Search projections/indexes are derived and rebuildable. They are never the source of truth.

---

# 4. Property Intelligence source-authority matrix

The source hierarchy must be centrally defined and consumed by Search, CMA, seller reports, listing management and advisory workflows.

## 4.1 Cotality — primary listing backbone

Cotality is the primary listing source for the listing lifecycle and should provide, where present and verified from the licensed payload:

- Active
- In Contract / Signed Contract
- Closed
- Temporary Off Market
- Off Market
- Expired
- other relevant licensed historical listing states
- listing price/history and other licensed listing facts

Cotality must be used first for closed-price evidence when the required close price is available.

## 4.2 StreetEasy — narrow market-gap supplement

StreetEasy is **not** a second full listing-history system.

Its approved architectural role is limited to supplementing **Active** and **Signed Contract / In Contract** listings that are missing from Cotality, subject to legal/source-use review and the applicable internal/client/public visibility rules.

Before a StreetEasy-observed item is added to internal Search:

1. normalize address/building/unit;
2. resolve the canonical Property/Unit;
3. check Cotality/current canonical listing episodes;
4. attach to an existing episode when it is the same listing;
5. create a supplemental episode only when genuinely absent;
6. never create a duplicate search result for the same property/listing episode.

If Cotality later supplies the same episode, Cotality becomes the primary listing authority and the StreetEasy observation remains provenance/history rather than a second listing.

StreetEasy must not be used to recreate Cotality's expired/off-market/closed history under this plan.

## 4.3 ACRIS — closing-price fallback and recorded evidence

For CMA/closed-sale evidence:

```text
Cotality close price available and verified?
  YES → use Cotality
  NO  → use ACRIS closing/recorded evidence where available and correctly matched
```

The value must retain provenance. An ACRIS-derived closing amount may not be represented as though it came from Cotality.

## 4.4 PLUTO — building/lot/property facts

PLUTO and other specifically approved public records enrich the canonical Property/Building record with applicable physical/building/lot facts. PLUTO does not create listing inventory.

## 4.5 NYC Department of Finance — tax/assessment and non-primary-residence information

NYC Department of Finance information belongs to the Property Intelligence layer, including applicable:

- assessment/market-value information
- condo property-tax information
- exemptions/abatements where relevant
- non-primary-residence / pied-à-terre surcharge information
- co-op unit surcharge/valuation information when provided at the unit level

**Condo and co-op treatment must remain distinct.** A co-op unit must not be given a condo-style individual real-estate tax bill merely because DOF has a unit-level surcharge/valuation record. Co-op maintenance and building-level tax economics must remain correctly classified.

All DOF-derived values must retain tax year/effective period and provenance.

---

# 5. Search is the shared brokerage intelligence engine

Search is not an isolated page. It must answer four directions from one criteria/data contract:

## 5.1 Client → listings

Find listings matching a Buyer/Tenant/Investor/1031 client's criteria.

## 5.2 Listing → clients

Find Mallan clients/prospects whose saved criteria match a Mallan listing for authorized marketing and agent recommendations.

## 5.3 Property → market

For pricing/CMA/seller reporting, show comparable building and area inventory using the relevant statuses, including Active, In Contract, Closed, Temporary/Off Market and Expired where required and permitted.

## 5.4 Property → potential seller/landlord

Use the Property's listing history, current market, closed-price evidence and property facts to create a seller/landlord opportunity, CMA, sale/rental analysis and compliant/subtle outreach strategy.

One canonical SearchProfile/criteria contract should support buyer criteria, tenant criteria, investor criteria, 1031 replacement criteria, seller competitive-watch criteria and listing-to-client matching. Do not create separate saved-search languages.

---

# 6. CMA and valuation consume Search/Property Intelligence

CMA must not own a separate comparable universe.

```text
SUBJECT PROPERTY
    ↓
CANONICAL SEARCH / PROPERTY INTELLIGENCE
    ↓
SAME BUILDING + AREA COMPARABLES
    ↓
ACTIVE / IN CONTRACT / CLOSED /
TEMP-OFF-MARKET / OFF-MARKET / EXPIRED CONTEXT
    ↓
VERIFIED CLOSE-PRICE EVIDENCE
    ↓
CMA / PRICING / MARKET POSITION
```

The same evidence engine must serve:

- seller pricing/listing strategy
- seller market-performance reports
- buyer offer/value analysis
- landlord rental/sale analysis
- tenant rental comparisons
- investor underwriting
- 1031 replacement analysis
- lender/professional evidence packages

A brokerage CMA must never be mislabeled as a formal appraisal.

---

# 7. Seller / Landlord operating lifecycle

A seller or landlord side may contain one or more Individual(s), an Entity, or both through authorized representatives.

```text
POTENTIAL SELLER / LANDLORD
    ↓
PROPERTY + MARKET INTELLIGENCE
    ↓
CMA / SALE-RENT ANALYSIS / PITCH
    ↓
FOLLOW-UP
    ↓
APPOINTMENT
    ↓
EXCLUSIVE AGREEMENT SENT
    ↓
SIGNED EXCLUSIVE UPLOADED
    ↓
BROKERAGE FILE / REVIEW
    ↓
MALLAN LISTING
```

The Listing Workspace must include or link to, as applicable:

- Seller/Landlord Individual(s) / Entity
- authorized representative/signatory
- contact information
- assigned agent
- signed exclusive agreement
- agreement dates/expiration
- listing price/rent
- condo common charges and taxes, or co-op maintenance as applicable
- photos
- floor plan
- 3D walkthrough
- video
- current/historical status
- Search/CMA market context
- communications
- marketing history
- showings/open houses
- feedback
- offers
- transaction state
- seller/landlord reporting

### 7.1 Listing marketing actions

From the Listing Workspace the authorized agent/broker must be able to initiate and track:

- e-blast to agents/brokerage audience
- e-blast to matched potential clients
- outreach to active buyers/tenants whose criteria match
- follow-up/reminder to actual buyers/tenants who viewed the listing
- open-house invitations/reminders/follow-up
- price/status marketing when authorized
- seller/landlord report
- refreshed CMA/market report

Campaign recipients and engagement must resolve to canonical Party records and may not create duplicate leads for existing people.

### 7.2 Open-house workflow

```text
OPEN HOUSE SCHEDULED
  ↓
INVITATIONS / MARKETING
  ↓
ATTENDEE REGISTRATION
  ↓
ATTENDANCE COUNT
  ↓
INTEREST / MAYBE / PASS + NOTES
  ↓
FOLLOW-UP
  ↓
OPEN-HOUSE REPORT
  ↓
SELLER REPORT
```

### 7.3 Private-showing workflow

```text
SHOWING REQUESTED
  ↓
CONFIRMED / CANCELLED / NO-SHOW
  ↓
ATTENDED
  ↓
FEEDBACK REQUESTED / RECEIVED
  ↓
INTEREST / MAYBE / PASS
  ↓
AGENT FOLLOW-UP
  ↓
SELLER REPORT
```

---

# 8. Active Buyer / Tenant lifecycle

A Buyer/Tenant opportunity may include multiple Individual(s), an Entity, guarantor(s) and invited family/participants who may ultimately sign a contract/lease.

```text
ACTIVE BUYER / TENANT
  ↓
PARTICIPANTS CONFIRMED
  ↓
REPRESENTATION / EXCLUSIVE AGREEMENT
  ↓
SEARCH CRITERIA
  ↓
LIVE SEARCH / SAVED SEARCH
  ↓
SEND / SAVE / AUTO-ALERT NEW LISTINGS
  ↓
CLIENT RESPONSE: SHOW / MAYBE / PASS / NO RESPONSE
  ↓
SHOWING
  ↓
OFFER / APPLICATION
```

A listing sent to a client must have tracked states such as Sent, Viewed, Saved, Liked, Show, Maybe, Pass, Showing Requested, Shown and Offer/Application where applicable so the agent does not repeatedly send rejected inventory and the relationship history remains usable.

---

# 9. Offer → transaction participant workflow

Once an offer is made, the platform must require/confirm the transaction participants and professional contacts rather than discovering them late.

```text
OFFER CREATED
  ↓
BUYER/SELLER OR TENANT/LANDLORD PARTIES CONFIRMED
  ↓
ENTITY / TRUST / LLC / LLP / ESTATE STRUCTURE CONFIRMED
  ↓
AUTHORIZED SIGNATORIES CONFIRMED
  ↓
ATTORNEY INFORMATION REQUESTED/CONFIRMED
  ↓
FINANCING / LENDER INFORMATION IF APPLICABLE
  ↓
TRANSACTION WORKSPACE
```

The transaction then branches based on financing and property type.

### 9.1 Sale — financed

Offer → Accepted Offer → Attorneys/Due Diligence → Signed Contract → Mortgage Application → Appraisal/Commitment/Approval → building/property-specific application/board steps → Final Walkthrough → Closing.

### 9.2 Sale — all cash

Offer → Accepted Offer → Attorneys/Due Diligence → Signed Contract → bypass mortgage workflow → building/property-specific application/board steps → Final Walkthrough → Closing.

### 9.3 Co-op

Signed Contract → Board Package/Application → Managing-Agent/Board Review → Board Interview → Approval → Final Walkthrough → Closing.

### 9.4 Condo

Signed Contract → Condo/Managing-Agent Application and waiver/approval process as applicable → Final Walkthrough → Closing.

The system must show only applicable steps and retain a complete audit trail.

---

# 10. Investor and 1031 lifecycle

Potential/active investors remain canonical Parties with an Investor Opportunity and investment SearchProfile.

1031 replacement work must connect the disposition and replacement sides:

```text
INVESTOR / 1031 CLIENT
  ↓
DISPOSITION / TIMELINE / PROFESSIONAL COORDINATION
  ↓
REPLACEMENT SEARCH PROFILE
  ↓
MATCHED PROPERTIES
  ↓
INVESTMENT ANALYSIS
  ↓
OFFER / ACQUISITION
  ↓
PORTFOLIO / NEXT OPPORTUNITY
```

Where verified inputs exist, investment analysis may include rent, expenses, taxes/common charges/maintenance, NOI, cash flow, cash-on-cash return, cap rate, ROI and financing assumptions. Calculated outputs must show source inputs and assumptions.

---

# 11. Potential Seller / Landlord lead pipeline

Potential Seller/Landlord opportunities may arise from legitimate property/business signals such as prior/expired marketing, lien/tax/estate-related public-record situations, vacancy/landlord context or other appropriately sourced indicators.

Sensitive trigger information is internal research unless appropriate and lawful to disclose. Outreach should address the owner's property options subtly through sale value, rental value, market opportunity and timing—not expose sensitive trigger details unnecessarily.

The workflow must support:

- property research
- owner Individual(s) / Entity resolution
- existing-Party duplicate check
- sale CMA
- rental analysis
- sale-vs-rent analysis
- pitch/market update
- contact attempt
- next required action
- follow-up/nurture
- appointment
- listing presentation
- signed engagement

No live seller/landlord opportunity may exist without owner, stage, last meaningful contact, next required action and due date.

---

# 12. Post-lease tenant and landlord lifecycle

## 12.1 Tenant after Mallan lease

Lease expiration is a first-class future workflow trigger.

- approximately 6 months before expiration: present relevant sale/buyer opportunity and sale listings where appropriate;
- if no response, approximately 90 days before expiration: repeat/follow up on ownership options;
- if still no response, approximately 60 days before expiration: send relevant rental options / relocation support.

Possible next states include renewal, new rental, buyer opportunity or nurture.

## 12.2 Landlord after Mallan lease

For a landlord whose unit Mallan leased:

- approximately 6 months before lease expiration: provide sale comps / hold-vs-sell context;
- if no response, approximately 90 days before expiration: refresh sale analysis/reminder;
- approximately 60 days before expiration: determine tenant renewal; if tenant is not renewing, prompt rental valuation and listing/relisting workflow.

Possible next states include renewed lease, new rental listing or seller opportunity.

The same Property and Landlord Party records must be reused.

---

# 13. Unified communications and comments

Portal/system communication and email are **channels**, not separate relationship histories.

Every relevant Party must be able, according to permission and preference, to:

- send a comment
- ask a question
- request more information
- respond to a listing/report/showing/offer/transaction item
- receive/reply by system/portal or email where supported

All communications must attach to the correct canonical context, such as:

```text
PARTY
 + OPPORTUNITY
 + PROPERTY/LISTING
 + SHOWING/OFFER/TRANSACTION when applicable
 + COMMUNICATION THREAD
```

The platform must preserve a unified communication history rather than leaving important client context only in an inbox.

### 13.1 Communication visibility

At minimum, messages/notes must support clear visibility classes:

- **Shared/client-visible** — approved participants may see it.
- **Participant-restricted** — only selected transaction/listing participants may see it.
- **Mallan internal** — broker/agent/staff only.

Internal notes must never become client-visible merely because they are attached to the same listing or transaction.

### 13.2 Communication preference

Each Party may select or be recorded with a preferred communication route, such as system/portal, email, phone or other supported channel. Eligibility/consent/suppression rules remain centrally enforced.

---

# 14. Lead routing and agent follow-up

A lead cannot stop at assignment.

```text
LEAD CREATED
  ↓
SOURCE / ATTRIBUTION
  ↓
ELIGIBILITY + DUPLICATE/CONFLICT CHECK
  ↓
ASSIGNED AGENT
  ↓
ACCEPT / DECLINE / TIMEOUT
  ↓
FIRST-CONTACT SLA
  ↓
CONTACT EVIDENCE
  ↓
NEXT ACTION REQUIRED
  ↓
REMINDER
  ↓
ESCALATION / BROKER ALERT
  ↓
REASSIGNMENT / RETURN TO POOL IF REQUIRED
```

Every active opportunity requires:

- responsible owner/agent
- current stage
- last meaningful contact
- next required action
- due date

Missing any one is an uncontrolled opportunity and must be visible to the broker.

---

# 15. Brokerage inventory and supervision

The broker control plane must track Mallan listings by canonical status and lifecycle, including relevant states such as Coming Soon, Active, In Contract, Closed/Sold, Temporary Off Market, Off Market, Expired, Withdrawn or Cancelled as defined by the authoritative status contract.

For each Mallan listing, the brokerage view should expose at least:

- listing/property identity
- Seller/Landlord Individual(s) / Entity
- responsible agent
- price/rent
- status and status history
- DOM where applicable
- agreement expiration
- last seller/landlord contact
- last marketing activity
- next report/update due
- showings/open houses
- offers/applications
- transaction stage
- commission/financial state where applicable
- missing/overdue required actions

Agent supervision must use the same leads, clients, listings, tasks and transactions as the agent workspace rather than duplicate supervisory copies.

---

# 16. Finance and tax intelligence

The finance/business-performance layer includes brokerage revenue/commission/accounting workflows and property-level carrying-cost intelligence.

Property-level financial facts used in Search/CMA/advisory/reports must be sourced through Property Intelligence, including applicable DOF tax/assessment and non-primary-residence surcharge data, condo taxes, co-op maintenance and other verified carrying-cost inputs.

Brokerage finance must track applicable commission/revenue state, referral obligations and firm/agent economics using the transaction as the financial source of truth rather than a separate manually maintained deal copy.

---

# 17. Requirement ledger and anti-loss governance

This master plan must be supported by one canonical requirement ledger. Every meaningful requirement receives a stable ID and must never disappear because an older audit/spec/hold is not reread.

Each requirement record must contain at least:

- requirement ID
- exact requirement
- business purpose
- actor(s)
- canonical entity/entities
- source authority
- producer
- downstream consumers
- trigger/state transition/event
- permissions/compliance constraints
- current implementation path(s)
- duplicate/competing implementation(s)
- dependency
- status
- acceptance test
- production proof
- superseded/retired path where applicable

Recommended status vocabulary:

```text
DISCOVERED → DESIGNED → BUILDING → WIRED → PROVEN → RETIRED
```

A requirement is not PROVEN because a table, API route or UI exists. It is PROVEN only when the required end-to-end business journey works and the downstream handoff is demonstrated.

### 17.1 Required identity families

The ledger must include stable requirements for at least:

- canonical Individual(s)
- canonical Entity and Entity subtype
- Party roles and relationships
- contact methods/preferences
- professional contacts/attorneys
- Building/Property/Unit identity
- Listing Episode identity
- source observations/provenance
- Search/SearchProfile
- CMA/comparables
- seller/landlord prospecting
- listing management
- marketing
- showings/open houses
- offers/applications
- transactions
- lease lifecycle
- tenant/landlord timed follow-up
- investor/1031
- communications/comments/email
- lead routing/SLA
- commissions/finance
- portals and permissions

---

# 18. Duplicate and bloat gate

Before any schema/service implementation is approved, the work package must answer:

1. Does this entity already exist?
2. Is it canonical data, source observation, history, workflow state or projection?
3. Why can the existing canonical entity not own the requirement?
4. What is the unique identity/dedup key?
5. How are uncertain matches handled?
6. What happens when another source later reports the same Party/Property/Listing?
7. Which existing table/service/route is reused, migrated, superseded or retired?
8. How does the projection/index rebuild from canonical truth?
9. How are repeated unchanged source observations prevented from causing unnecessary writes/history bloat?
10. What test proves no duplicate business record was created?

**If these are unanswered: no new canonical table and no new parallel service.**

---

# 19. Event/workflow continuity

Important state changes must create the next required action rather than end a workflow silently.

Examples:

- signed exclusive → activate listing workflow, Search/CMA, marketing and seller-report obligations;
- listing created/changed → matching/alerts/marketing eligibility;
- showing completed → feedback + agent follow-up + seller reporting;
- offer made → transaction-participant/attorney workflow;
- contract signed → financing/application/board workflow according to property/financing type;
- closing → owner/past-client/landlord/investor lifecycle;
- lease signed → tenant and landlord pre-expiration follow-up schedule;
- ignored lead → reminder/escalation/reassignment path.

No business-critical workflow may depend on an agent remembering a future date that the platform already knows.

---

# 20. End-to-end operating journeys

The plan must be validated through complete journeys rather than feature checklists.

## 20.1 Seller exclusive revenue journey

```text
PROPERTY / OWNER
  ↓
SELLER OPPORTUNITY
  ↓
CMA / PITCH
  ↓
SIGNED EXCLUSIVE
  ↓
MALLAN LISTING
  ↓
SEARCH / MARKET INTELLIGENCE
  ↓
MATCH CLIENTS + E-BLAST AGENTS/BUYERS
  ↓
OPEN HOUSES / PRIVATE SHOWINGS / FOLLOW-UP
  ↓
SELLER REPORT
  ↓
OFFER
  ↓
CONTRACT / FINANCING / APPLICATION / BOARD
  ↓
WALKTHROUGH
  ↓
CLOSING
  ↓
COMMISSION
  ↓
POST-CLOSE RELATIONSHIP / NEXT OPPORTUNITY
```

## 20.2 Buyer/tenant journey

```text
LEAD / PROSPECT
  ↓
ACTIVE CLIENT + PARTICIPANTS
  ↓
REPRESENTATION
  ↓
SEARCH / SAVE / SEND / ALERT
  ↓
SHOW / MAYBE / PASS
  ↓
SHOWING
  ↓
OFFER / APPLICATION
  ↓
CONTRACT / LEASE
  ↓
FINANCING / BOARD / APPROVAL AS APPLICABLE
  ↓
WALKTHROUGH / MOVE-IN / CLOSING
  ↓
OWNER OR TENANT LIFECYCLE
```

## 20.3 Landlord/tenant renewal and conversion journey

```text
LEASE
  ↓
EXPIRATION DATE
  ↓
6-MONTH TENANT BUYER OPTIONS + LANDLORD SALE COMPS
  ↓
90-DAY FOLLOW-UP IF NO RESPONSE
  ↓
60-DAY RENTAL/RELIST/RELOCATION ACTION
  ↓
RENEW / RE-RENT / BUY / SELL
```

---

# 21. Development programs

## Program 0 — Canonical plan and operating truth

Before broad feature implementation:

1. inventory all active plans, audits, specifications, hold files and unmerged roadmap documents;
2. extract every requirement;
3. deduplicate requirements into the canonical ledger;
4. map each requirement to canonical entities and journeys;
5. identify competing identity systems/tables/routes/services;
6. freeze source authority and identity rules;
7. produce the dependency/execution graph;
8. prohibit new parallel overall plans.

## Program 1 — Property Intelligence/Search/CMA foundation

Converge canonical Building/Property/Unit/Listing Episode/Source Observation identity and source authority, then wire one Search/criteria runtime and one comps/CMA evidence path.

Acceptance requires that the same canonical output be consumable by client search, seller market comparison, CMA, saved search, alerts, matching, listing marketing and reporting.

## Program 2 — Party/Relationship/Workflow spine

Converge Individual(s), Entity, roles, relationships, contacts, professional contacts, opportunities, communications, tasks, SLAs, events, approvals and audit history.

## Program 3 — Listing, client and marketing operations

Complete seller/landlord listing workspace, buyer/tenant search/send/save/alerts, open houses, showings, marketing, engagement capture, seller reporting and lead follow-up using Programs 1–2.

## Program 4 — Transaction and finance delivery

Complete offers/applications, attorney/professional participant capture, contract/lease workflows, mortgage/all-cash branches, co-op/condo application/board processes, walkthrough, closing, commissions and transaction-linked finance.

## Program 5 — Lifecycle/retention and advanced intelligence

Complete post-close/post-lease owner, tenant, landlord, investor, 1031, referral and timed follow-up journeys; then advance intelligence only after deterministic canonical systems and evidence are proven.

---

# 22. Broker and agent operating model

The broker is also a producing agent. The system must model one Individual with multiple operating roles and permissions.

Maya uses:

1. a **My Business / producing-agent workspace**, shared in core structure with authorized agents, for her own leads, clients, searches, valuations, listings, communications and transactions; and
2. a **Mallan Brokerage / broker supervisory control plane** for firm-wide lead distribution, assignments, licenses, supervision, approvals, listings, sales, production, commissions, referrals, performance, finance, risk and technology.

Her personal production rolls into brokerage totals while remaining separately measurable.

### Lead distribution is first-class

The broker control plane must support manual, automatic and hybrid routing using legitimate business criteria such as geography, language, specialty, transaction type, price, source, capacity, availability, performance and license eligibility, plus conflict/duplicate checks, accept/decline/timeout, reassignment, return-to-pool, response SLAs, attribution, fairness review and immutable assignment history.

### People, licensing and performance are first-class

The platform must track license type/UID, sponsoring/representative-broker relationship, office, license status/expiration, continuing education, agreements, commission plans, referral terms, onboarding, training, offboarding, access revocation, production, conversion, service levels, compliance, coaching and capacity.

---

# 23. Mandatory agent startup and work-package contract

Before changing code:

1. Confirm current `main`, production deployment, open PRs and relevant issue rows.
2. Confirm repository/project scope.
3. Read `AGENTS.md`, `docs/PROJECT-HEALTH-DASHBOARD.md`, `docs/PLATFORM-ISSUE-REGISTRY.md`, the latest dated handoff, this master plan and applicable compliance/Neon/source-contract documents.
4. Re-run current evidence. Do not inherit historical conclusions as current truth.
5. Identify the actor, role, authority, canonical entity, source, upstream producer, downstream consumer, state transition/event, workflow and measurable outcome affected.
6. State explicit scope and exclusions.
7. Search for all existing writers/readers/models/routes of the affected entity before adding another implementation.
8. Reuse, migrate or retire existing implementations deliberately.
9. State deduplication and identity behavior.
10. Preserve production unless the active work package explicitly authorizes a controlled change.
11. Provide RED-before/GREEN-after evidence for behavior changes where feasible.
12. Prove the cross-flow handoff, not merely the local route/component.
13. Update the canonical requirement ledger and this file when the high-level model, roadmap, decision or active package changes.

Every implementation work package/PR must declare:

- requirement IDs implemented
- upstream inputs
- source authority
- canonical IDs/entities
- state transition
- emitted event or workflow trigger
- downstream consumers
- permissions/compliance gates
- duplicate/retirement analysis
- audit/observability evidence
- tests including cross-flow handoff
- whether it changes runtime, only contracts, or only documentation

---

# 24. Global Definition of Done

A capability is complete only when all applicable conditions are proven:

1. canonical identity is used;
2. source authority/provenance is correct;
3. duplicate/parallel implementation is absent or explicitly retired/migrated;
4. state transition is persisted correctly;
5. downstream workflow receives the result;
6. permissions/compliance are enforced centrally;
7. communication/audit history is preserved where applicable;
8. error/failure state is visible and recoverable;
9. end-to-end acceptance journey passes;
10. production proof exists when the capability is claimed as production-ready.

Examples:

- Search is not finished until client send/save/alert, CMA, matching, listing marketing and seller reporting consume its canonical output.
- A listing is not finished until agreement, marketing, showings, reports, offers and transaction handoff work.
- A showing is not finished until feedback/follow-up/reporting update.
- An offer is not finished until participants/attorneys and transaction workflow are created.
- A closing is not finished until commission and post-close relationship state exist.
- A lease is not finished until future tenant/landlord expiration workflows are scheduled.

---

# Current handoff

- This document is the intended canonical high-level business/identity/execution authority on PR #595 and remains unmerged until explicitly approved.
- The Aug. 4 audit identified competing overall plans; do not merge or create another competing master plan without an explicit supersession decision.
- Current infrastructure work such as PR #599 must not become a blocker for safe architecture/requirements consolidation unless it directly affects canonical property/listing truth.
- Search/Property Intelligence/CMA convergence is the first business foundation after canonical-plan consolidation.
- No application code, database migration, R2 mutation, environment change, deployment or production configuration is authorized by this documentation update.

## Publication note

This repository version establishes the durable agent start point and the canonical brokerage architecture. Longer working drafts, audits, historical specifications and parked plans must be reconciled into this document/requirement ledger; they are evidence, not competing authorities. Do not merge PR #585 as a competing overall plan unless Maya explicitly reverses this decision.
