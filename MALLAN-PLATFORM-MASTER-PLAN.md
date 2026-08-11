# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Repository start point for the complete Mallan brokerage, business and intelligence operating system.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**.
- Repository: **`mallan67/mallan-nyc` only** for this plan unless Maya explicitly changes repository scope.
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document governs the high-level business model, canonical identities, shared platform capabilities, source authority, separate operating journeys and execution sequence once approved.
- Existing audits, issue records, PRs, technical plans and historical specifications are supporting evidence. They may not become competing overall plans.
- Every new requirement discovered in an audit, conversation, hold file, specification or implementation review must be reconciled into the canonical architecture and requirement registry. Requirements may not remain stranded in isolated documents.

---

# 1. Non-negotiable canonical-system rule

Mallan must operate as **one brokerage operating system**, not a collection of independent CRM, search, CMA, listing, marketing, portal, transaction, document or finance products.

**Unified means shared canonical identities, shared data, shared services and shared events. It does NOT mean combining distinct business roles or workflows.**

Seller, Landlord, Buyer and Tenant are four separate first-class operating journeys. They may use the same canonical Party, Property, Search, Media, Communication, Document, Marketing, AI and Task services, but they must retain separate requirements, opportunity types, workflows, documents, state transitions, reporting and acceptance tests.

Every implementation must answer:

1. What is the canonical entity?
2. What is its canonical ID?
3. Which source or system is authoritative for each material fact?
4. Is this data a canonical record, source observation, history record, derived projection/index, media asset, communication, share artifact or workflow state?
5. Who produces it?
6. Which role-specific workflows consume it?
7. What event/state transition connects it to the next business step?
8. What existing implementation is reused, migrated or retired?
9. What prevents duplicate Individuals, Entities, Properties, Listings, Contacts, Communications, Documents, Media, Campaigns, Leads, Deals and Commissions?
10. What end-to-end test proves the handoff?

**No new parallel table, service, search engine, client store, listing store, party store, communication store, media store, marketing store or workflow may be introduced without an explicit identity, migration, deduplication and retirement decision.**

A feature is not complete merely because its screen or route works. It is complete only when its canonical output is consumed correctly by the next required workflow.

---

# 2. Mallan brokerage operating hierarchy

```text
MALLAN BROKERAGE
│
├── MALLAN BROKERAGE VIEW
│   └── firm-wide supervision, agents, leads, clients, listings, deals,
│       compliance, commissions, finance, exceptions and performance
│
└── MY BUSINESS / PRODUCING AGENT VIEW
    └── the logged-in producer's leads, clients, searches, CMAs, listings,
        showings, marketing, deals, documents, tasks and commissions
```

Maya is both representative broker/owner and producing agent. The system must model **one Individual with multiple roles and scopes**, not duplicate Maya as a broker identity and an agent identity.

Other agents use the same canonical records under narrower permissions. Brokerage totals aggregate agent production without duplicating records.

---

# 3. CANONICAL SHARED FOUNDATION

This is the common platform layer used across Seller, Landlord, Buyer, Tenant, Investor, Agent and Broker workflows.

**Shared foundation services are built once and reused everywhere. Role-specific workflows do not receive private duplicate versions of these services.**

```text
CANONICAL SHARED FOUNDATION
│
├── Individual(s)
├── Entity
├── Property
├── Building
├── Unit
├── Listing Episode / Source Observation
├── Contacts
├── Professionals
├── Communications
├── Comments / Questions / Requests for Information
├── Documents / Agreements / Disclosures / Offering Plans
├── Media
│   ├── Photos
│   ├── Floor Plans
│   ├── Video
│   ├── 3D / Virtual Walkthrough
│   └── other authorized listing/property media
├── Search Infrastructure
├── Comps / CMA / Analytical Calculators
├── Marketing / E-blast
├── Share / Live Share Cards / Share Links
├── AI Assistance
├── Tasks / Events / Calendar / Reminders
├── Permissions / Consent / Visibility
└── Audit / Provenance / History
```

## 3.1 Individual(s) and Entity

Every human or legal participant enters through one canonical Party identity model.

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

Business-facing workflows must support **Individual(s) / Entity**, not a simplistic single-person assumption.

Roles are separate from identity. One Party may be a Seller, Landlord, Buyer, Tenant, Investor, Owner, Guarantor, Trustee, Executor, Authorized Signatory or professional participant at different times or simultaneously.

The identity remains one; the role-specific opportunity/workflow remains separate.

## 3.2 Property, Building, Unit and Listing Episode

```text
BUILDING
  ↓
PROPERTY / UNIT
  ↓
LISTING EPISODE(S)
  ↓
SOURCE OBSERVATION(S)
```

One physical property/unit must not be recreated each time it is sold, rented, marketed, shared or observed by another source.

A Listing Episode represents one market cycle. Source observations attach to the same Property/Listing Episode when they describe the same real-world listing.

## 3.3 Contacts

Individuals and Entities may have reusable canonical:

- email address(es)
- phone number(s)
- mailing address(es)
- preferred communication channel
- communication eligibility/consent/suppression state where applicable
- relationship owner / assigned Mallan agent

Contact data is not copied separately into seller, landlord, buyer, tenant, marketing and transaction databases.

## 3.4 Professionals

Attorneys, law firms, lenders, mortgage professionals, managing agents and other professionals are reusable canonical Parties/Organizations linked to the applicable opportunity or transaction.

Once an offer/application reaches the relevant stage, the applicable role-specific workflow requests or confirms professional contact information.

## 3.5 Communications

Portal/system messaging and email are channels of one canonical communication history.

A permitted Individual(s), Entity or professional participant can:

- send a message
- reply
- ask a question
- request more information
- respond to a listing
- respond to a report
- respond to an offer/application/transaction item

Communication attaches to the correct Party + Opportunity + Property/Listing + transaction context.

Visibility must support at least:

- Shared/client-visible
- Participant-restricted
- Mallan internal

## 3.6 Comments / questions / requests for information

Comments are a first-class shared capability, not an ad hoc text field on individual screens.

Comments/questions may be attached to, where applicable:

- a listing
- a saved/sent property
- a showing
- a CMA/report
- an offer/application
- a document
- a deal/transaction
- an open house
- a task/event

The same comment/thread must remain visible from all authorized views of that canonical object.

## 3.7 Documents / agreements / disclosures / offering plans

One document service supports controlled templates and record-specific documents.

It must support, as applicable:

- Seller agreements and disclosures
- Landlord agreements and disclosures
- Buyer agreements and disclosures
- Tenant agreements and disclosures
- offering plans
- building/property documents
- transaction forms
- signed documents
- broker/internal documents

Agents may complete or adjust transaction-specific fields in approved documents but may not silently alter broker/legal-controlled template language.

Every generated/signed agreement retains template version, parties, property/opportunity, dates, permissions and audit history.

## 3.8 Media

Media is a shared canonical service attached to Property/Listing Episode, not copied into separate Search, email, social and client databases.

Media includes:

- photos
- floor plans
- video
- 3D walkthrough / virtual tour
- approved brochures/creative assets where applicable

Each media item must retain:

- canonical media ID
- Property/Listing relationship
- source/provenance
- rights/authority to use
- media type
- current/retired state
- ordering/hero selection where applicable
- audience/distribution eligibility

Search cards, listing pages, seller reports, HTML emails, share cards and social assets reference the same approved media set rather than creating independent media truth.

## 3.9 Search infrastructure

One canonical Property Intelligence/Search service supports separate role-specific use cases:

- **Buyer Search** — sale inventory and purchase criteria
- **Tenant Search** — rental inventory and rental criteria
- **Seller Market Intelligence** — sale competition/comps/CMA
- **Landlord Market Intelligence** — rental competition, rent analysis and hold/sell context
- **Investor Search** — investment/replacement criteria and underwriting inputs
- **Listing → Client Matching** — find eligible matching audiences

The infrastructure is shared; the business product, filters, documents and workflow around it remain role-specific.

## 3.10 Comps / CMA / analytical calculators

One evidence/calculation layer consumes canonical Property Intelligence and explicit assumptions.

It may power:

- Seller CMA and pricing strategy
- Landlord rental analysis / hold-sell comparison
- Buyer comparable/offer analysis
- Tenant rent comparison/occupancy-cost analysis
- Investor cap rate, cash flow, cash-on-cash, ROI and financing scenarios
- 1031 replacement comparison
- agent analytical tools

Inputs must distinguish verified sourced facts from agent/client assumptions.

## 3.11 Marketing / E-blast

E-blast is a shared marketing service connected directly to canonical Search, Listing, Party and Campaign records.

It may be invoked differently by role/workflow, for example:

- Seller listing → cooperating agents, matched buyers/prospects, prior viewers, open-house audiences
- Landlord rental listing → appropriate rental audiences and cooperating agents
- Buyer → selected listing collection or market update
- Tenant → selected rental collection or market update
- Agent → search-based client send / campaign

Recipients resolve to canonical Party records. Campaign response/engagement must connect back to the appropriate relationship/opportunity rather than create duplicate contacts/leads.

## 3.12 Share / live share cards / share links

Share is a shared rendering/distribution capability, not a separate listing database.

From Search, Listing, CMA/report or other approved contexts, agents can create/share:

- permission-aware share link/page
- listing card
- listing collection
- HTML email
- social-media-ready card/content where allowed
- client-facing report/share artifact

A live share card/page references the canonical listing/property and current approved media.

When price/status/media changes:

```text
CANONICAL LISTING CHANGE
  ↓
LISTING_CHANGED EVENT
  ├── Search refresh
  ├── Match/alert reevaluation
  ├── Seller or Landlord report refresh where applicable
  ├── Live share/card invalidation + re-render
  └── future marketing uses current canonical state
```

Do not maintain separate editable prices or media in Search cards, email cards, client cards and social/share cards.

A previously delivered email/social post remains an auditable historical publication; its linked Mallan live page can display current canonical information.

## 3.13 AI assistance

AI is a shared assistance layer available contextually throughout the backend.

Agents may use AI to help with:

- Search construction/refinement
- property/listing comparison
- client-response drafting
- follow-up drafting
- CMA/report explanations
- marketing/e-blast drafts
- listing descriptions/approved copy assistance
- transaction next-step guidance
- document/compliance lookup
- investor analysis explanation

AI must use the canonical Mallan records and approved current sources available to the workflow. It must identify missing facts rather than invent them.

AI may draft/recommend, but may not silently:

- change canonical records
- send communications
- alter controlled agreement language
- make binding legal/tax conclusions
- bypass broker/agent approval or permissions
- create a second AI-only Search/Property/Client truth

## 3.14 Tasks / events / calendar / reminders

One task/event service supports all role-specific workflows.

Examples:

- lead first-contact deadline
- seller update due
- landlord lease-expiration follow-up
- buyer showing
- tenant showing/application deadline
- open house
- attorney/document follow-up
- contract/application deadline
- board interview
- walkthrough
- closing
- commission follow-up

Business-critical future actions should be generated from known workflow states/dates rather than depend on agent memory.

## 3.15 Permissions / audit / provenance

All shared services enforce role/scope permissions centrally and retain sufficient audit/provenance to answer:

- who changed it
- when
- source
- previous state
- current state
- who may see/use/share it
- which workflow consumed it

---

# 4. Property Intelligence source-authority matrix

The source hierarchy is centrally defined and consumed by Search, CMA, Seller, Landlord, Buyer, Tenant, Investor, Listing and reporting workflows.

## 4.1 Cotality — primary listing backbone

Cotality is the primary listing source for the listing lifecycle and should provide, where present and verified from the licensed payload:

- Active
- In Contract / Signed Contract
- Closed
- Temporary Off Market
- Off Market
- Expired
- applicable historical listing states
- listing price/history and other licensed listing facts

Cotality is used first for closed-price evidence when the required close price is available.

Agents consume Cotality-backed information through Mallan; they do not manage Cotality API/schema plumbing.

## 4.2 StreetEasy — narrow current-market gap supplement

StreetEasy is not a second full listing-history system.

Its architectural role is limited to supplementing missing **Active** and **Signed Contract / In Contract** listings, subject to source-use/legal/visibility review.

Before a StreetEasy-observed item is used:

1. normalize address/building/unit;
2. resolve canonical Property/Unit;
3. check Cotality/current canonical Listing Episodes;
4. attach to an existing episode when it is the same listing;
5. create a supplemental episode only when genuinely absent;
6. never create a duplicate search result for the same Property/Listing Episode.

If Cotality later supplies the same episode, Cotality becomes the primary listing authority.

## 4.3 ACRIS — recorded evidence / close-price fallback

```text
Cotality close price available and verified?
  YES → use Cotality
  NO  → use correctly matched ACRIS recorded/closing evidence where available
```

Provenance must remain visible.

## 4.4 PLUTO

PLUTO enriches Building/Property/lot facts. It does not create listing inventory.

## 4.5 NYC Department of Finance

DOF belongs to Property Intelligence for applicable:

- assessment/market value
- condo property tax
- exemptions/abatements
- non-primary-residence / pied-à-terre surcharge
- unit-level co-op surcharge/valuation information when published

Condo and co-op treatment must remain distinct. A co-op unit must not be given a condo-style individual tax bill merely because a unit-level DOF surcharge/valuation record exists.

---

# 5. ROLE-SEPARATION RULE

**Seller, Landlord, Buyer and Tenant are never collapsed into one generic client pipeline or combined opportunity type.**

Shared services are reused, but each role owns a separate opportunity/workflow and its own requirements.

Prohibited simplifications include treating these as a single implementation solely because some fields overlap:

- Seller + Landlord Opportunity
- Buyer + Tenant Opportunity
- generic Buyer/Tenant SearchProfile without role-specific semantics
- generic Seller/Landlord transaction state machine
- generic one-size-fits-all representation agreement

One Individual/Entity may participate in multiple opportunities without identity duplication.

Example:

```text
JANE SMITH — one canonical Individual
│
├── Seller Opportunity — 123 Main St #5A
├── Landlord Opportunity — 456 Park Ave #8C
└── Buyer Opportunity — future purchase
```

---

# 6. SELLER OPERATING JOURNEY

Seller is a sale-side ownership/disposition workflow.

```text
POTENTIAL SELLER
  ↓
Seller Individual(s) / Seller Entity
  ↓
Property / ownership context
  ↓
Sale CMA / pricing / market opportunity
  ↓
Outreach / follow-up / appointment
  ↓
Seller representation / exclusive agreement
  ↓
Signed exclusive uploaded / brokerage file
  ↓
SALE LISTING
  ↓
Sale marketing / e-blasts / share / open houses / private showings
  ↓
Feedback / Seller Report / price strategy
  ↓
Offer(s) / negotiation / accepted offer
  ↓
Attorneys / due diligence / contract of sale
  ↓
Buyer financing status or all-cash path
  ↓
Co-op/condo process as applicable
  ↓
Final walkthrough
  ↓
Closing
  ↓
Commission / post-close relationship
```

Seller workspace requirements include, as applicable:

- Seller Individual(s) / Entity and authorized signatories
- seller contact information
- assigned agent
- seller attorney when applicable
- signed exclusive and dates/expiration
- sale listing price
- Property Intelligence / Cotality history
- same-building and area sale comps
- Active / In Contract / Closed / applicable Off-Market / Expired competition
- condo taxes/common charges or co-op maintenance as appropriate to the Property
- photos
- floor plan
- video
- 3D walkthrough
- marketing/e-blast history
- share artifacts
- open houses / attendance / report
- private showings / feedback
- comments/questions/communications
- seller reports
- offers
- sale transaction state

---

# 7. LANDLORD OPERATING JOURNEY

Landlord is a rental ownership/lease workflow, not Seller-with-a-rent-field.

```text
POTENTIAL LANDLORD
  ↓
Landlord Individual(s) / Landlord Entity
  ↓
Property / ownership context
  ↓
Rental analysis / asking-rent strategy / hold-sell context
  ↓
Outreach / follow-up / appointment
  ↓
Landlord representation / rental exclusive
  ↓
RENTAL LISTING
  ↓
Rental marketing / e-blasts / share / showings
  ↓
Tenant application(s)
  ↓
Qualification / guarantor(s) as applicable
  ↓
Landlord decision
  ↓
Co-op/condo application process if applicable
  ↓
Lease preparation/execution
  ↓
Move-in
  ↓
Lease expiration lifecycle
```

Landlord workspace requirements include, as applicable:

- Landlord Individual(s) / Entity and authorized signatories
- landlord contact information
- assigned agent
- attorney/professionals when applicable
- rental exclusive/agreement and dates
- asking rent
- rental market analysis
- rental competition and relevant leased/rental evidence
- sale/hold comparison when requested
- Property facts / carrying costs
- photos
- floor plan
- video
- 3D walkthrough
- rental marketing/e-blasts/share
- showings
- applications
- applicant/guarantor status
- comments/questions/communications
- lease state
- renewal/relist/sell lifecycle

Post-lease Landlord workflow:

- approximately 6 months before expiration → sale comps / hold-vs-sell context;
- if no response, approximately 90 days before expiration → refreshed sale analysis/reminder;
- approximately 60 days before expiration → determine renewal; if tenant is not renewing, prompt rental valuation/relisting workflow.

---

# 8. BUYER OPERATING JOURNEY

Buyer is a purchase/acquisition workflow.

```text
POTENTIAL BUYER
  ↓
Buyer Individual(s) / Buyer Entity
  ↓
Additional purchasing/signing parties
  ↓
Qualification / proof of funds / financing readiness
  ↓
Buyer representation agreement
  ↓
BUYER SEARCH PROFILE
  ↓
Search / saved search / auto-send / listing sends
  ↓
Show / Maybe / Pass
  ↓
Showing(s)
  ↓
Offer / negotiation / accepted offer
  ↓
Buyer attorney / contract
  ↓
Mortgage workflow OR all-cash path
  ↓
Co-op board OR condo application where applicable
  ↓
Final walkthrough
  ↓
Closing
  ↓
New Owner relationship
```

Buyer workspace requirements include:

- Buyer Individual(s) / Entity
- invited family/other future signatories/participants as appropriate
- buyer attorney once applicable
- lender/mortgage contacts if financed
- buyer representation agreement
- purchase SearchProfile
- saved searches
- auto-send/new listing alerts
- listing sends
- comments/questions/request-more-information
- Show / Maybe / Pass
- showings / no-show state
- offer(s)
- comparable/offer analysis
- purchase calculators
- documents
- transaction/financing/application state

---

# 9. TENANT OPERATING JOURNEY

Tenant is a rental-occupancy workflow, not Buyer-lite.

```text
POTENTIAL TENANT
  ↓
Tenant Individual(s) / Tenant Entity
  ↓
Additional occupants / guarantor(s)
  ↓
Tenant representation agreement where applicable
  ↓
TENANT RENTAL SEARCH PROFILE
  ↓
Search / saved search / auto-send / rental listing sends
  ↓
Show / Maybe / Pass
  ↓
Showing(s)
  ↓
Rental application
  ↓
Financial/application documents
  ↓
Landlord approval
  ↓
Co-op/condo application if applicable
  ↓
Lease
  ↓
Move-in
  ↓
Lease expiration lifecycle
```

Tenant workspace requirements include:

- Tenant Individual(s) / Entity
- occupants/guarantors
- tenant contact information
- representation agreement where applicable
- rental SearchProfile
- saved search / auto-send
- listing sends
- comments/questions/request-more-information
- Show / Maybe / Pass
- showings
- application and financial-document status
- landlord/building approval status
- lease documents
- move-in / expiration dates

Post-lease Tenant workflow:

- approximately 6 months before expiration → relevant purchase opportunity / sale listings where appropriate;
- if no response, approximately 90 days before expiration → buyer-option follow-up;
- if still no response, approximately 60 days before expiration → rental/relocation options;
- possible next states: renewal, new rental, Buyer Opportunity, nurture.

---

# 10. INVESTOR / 1031 OPERATING JOURNEY

Investor/1031 remains a distinct opportunity type using the shared Search/Property Intelligence/calculator foundation.

It may include:

- acquisition criteria
- investment SearchProfile
- rented/income-producing property identification
- verified rent/expense inputs
- taxes/common charges/maintenance
- NOI/cash flow
- cap rate
- cash-on-cash
- ROI
- financing assumptions
- 1031 disposition/replacement timeline and replacement search

All calculated outputs retain source inputs and explicit assumptions.

---

# 11. AGENT WORKSPACE

Agents operate on the same canonical records seen in the Brokerage view, under their permitted scope.

Agents must be able to:

- update approved public profile fields
- track leads/clients
- use Buyer Search
- use Tenant Search
- use Seller market/CMA tools
- use Landlord rental analysis
- use investor/1031 calculators
- use contextual AI assistance
- create/save/send searches
- add missing supplemental listings through controlled workflow
- paste a supported listing URL to start a deduped supplemental-listing draft
- create/send HTML e-blasts
- create live share links/cards
- create social-ready share assets where authorized
- access comments/communications
- track listings/showings/open houses
- track Seller deals
- track Landlord rental deals
- track Buyer purchase deals
- track Tenant rental deals
- track commissions
- download commission statements/reports
- access approved agreements/disclosures/offering plans/documents
- access practical REBNY/RLS/UCBA and NY DOS licensing guidance

Agent-facing workflows consume Cotality-backed data; agents are not responsible for Cotality API/schema/ingestion mechanics.

---

# 12. BROKERAGE SUPERVISION

Broker scope operates over the same canonical agents, Parties, Properties, Listings, Opportunities, Transactions, Campaigns, Tasks and Commissions.

Broker control includes:

- agent roster/profile/licensing supervision
- lead routing/acceptance/first-contact/follow-up SLAs
- Seller opportunities/listings
- Landlord opportunities/rental listings
- Buyer opportunities
- Tenant opportunities
- investor/1031 work
- company listing inventory
- agreement expiration
- marketing activity
- seller/landlord update obligations
- overdue follow-up
- transaction status/deadlines
- commissions/referrals/company economics
- compliance exceptions
- performance/production

---

# 13. AGENT-ADDED / URL-ASSISTED SUPPLEMENTAL INVENTORY

Authorized agents may add a listing missing from the system for permitted internal/client use, but must not create duplicate Property/Listing truth.

```text
PASTE LISTING URL OR MANUAL ADD
  ↓
IDENTIFY SOURCE / PERMITTED FETCH
  ↓
NORMALIZE ADDRESS + UNIT
  ↓
RESOLVE CANONICAL PROPERTY
  ↓
DEDUPE AGAINST COTALITY + APPROVED SUPPLEMENTAL INVENTORY
  ↓
CREATE/ATTACH DRAFT SOURCE OBSERVATION / LISTING EPISODE IF NEEDED
  ↓
AGENT CONFIRMS MATERIAL FACTS + SHARE RIGHTS
  ↓
PERMITTED CLIENT-SHARE LISTING
```

No blind URL → database insert → public listing.

External photos/media may not be copied, stored or republished merely because a URL was supplied; source rights/authority must permit use.

If Cotality later supplies the same Listing Episode, reconcile the existing episode to Cotality authority rather than duplicating it.

---

# 14. MARKETING / SHARING CONTINUITY

Marketing is driven from canonical Search/Listing/Party data and the shared Media/Share services.

Possible authorized actions include:

- HTML email / e-blast
- send selected listings to one client
- send listing collection
- cooperating-agent e-blast
- matched-client audience e-blast
- open-house announcement/reminder
- prior-viewer follow-up
- price-change campaign
- live share card/link
- social-media-ready content/card

Campaign attribution must connect recipients and engagement back to canonical Party/Opportunity records.

---

# 15. OFFER / APPLICATION / TRANSACTION CONTINUITY

Offer/application creates the appropriate role-specific transaction path and professional-participant capture.

## Sale transaction

Offer → Accepted Offer → Attorneys/Due Diligence → Contract → Mortgage or All Cash → applicable Co-op/Condo process → Final Walkthrough → Closing → Commission.

## Rental transaction

Application → Documents/Qualification → Landlord Decision → applicable Co-op/Condo application → Lease → Move-in → Commission/lease lifecycle.

Sale and rental transaction state machines must not be forced into one generic pipeline merely because both result in a Deal record.

---

# 16. LEAD ROUTING / FOLLOW-UP

Every lead/opportunity remains attached to its distinct role:

- Seller lead/opportunity
- Landlord lead/opportunity
- Buyer lead/opportunity
- Tenant lead/opportunity
- Investor/1031 opportunity

Shared routing infrastructure supports assignment, accept/decline/timeout, first-contact SLA, next action, reminders, escalation, broker alert and reassignment.

Every active opportunity requires:

- assigned owner/agent
- role/opportunity type
- stage
- last meaningful contact
- next action
- due date

---

# 17. COMPLIANCE / PROFESSIONAL REFERENCE

Agent-facing Compliance/Professional Reference focuses on practical brokerage requirements, including:

- applicable REBNY/RLS/UCBA requirements
- NY Department of State licensing requirements
- Mallan policies/workflow checklists
- approved agreements/disclosures/forms
- links/version/effective dates to authoritative sources

Technical Cotality field/schema/payload/source-integration governance is an engineering/data-governance responsibility, not an agent-facing operational burden.

---

# 18. REQUIREMENT AND DOCUMENT GOVERNANCE

The final canonical system must not depend on agents/developers assembling product truth from multiple competing planning documents.

The target governance model is:

- **ONE canonical system blueprint** for business architecture, shared foundation, role-specific journeys, requirements, source authority and build sequence.
- operational health/issue/handoff documents may describe current state only;
- external/source reference documents may describe Cotality/REBNY/DOS/public-data facts only;
- historical plans/audits/specs become evidence/reference after their valid requirements are absorbed;
- they may not redefine the product architecture.

During the current consolidation phase, the existing requirement ledger remains temporary working material and must ultimately be absorbed into the one canonical blueprint rather than survive as a competing authority.

Every requirement must identify:

- stable requirement ID
- role: Shared / Seller / Landlord / Buyer / Tenant / Investor / Agent / Broker
- canonical entity/service
- source authority
- producer
- downstream consumer
- event/state transition
- UX/workspace location
- permission/compliance rule
- current implementation path
- duplicate/competing implementation
- status
- acceptance test
- production proof

Status vocabulary:

`DISCOVERED → DESIGNED → BUILDING → WIRED → PROVEN → RETIRED`

---

# 19. DUPLICATE / BLOAT GATE

Before any schema/service implementation is approved:

1. Does the canonical entity/service already exist?
2. Is the proposed data canonical, source observation, history, media, communication, share artifact, workflow state or projection?
3. Why cannot an existing canonical service own it?
4. What is the unique/dedup identity?
5. How are uncertain matches handled?
6. What happens when another source later reports the same Party/Property/Listing?
7. What existing table/service/route is reused, migrated, merged, superseded or retired?
8. Can projections/cards/reports rebuild from canonical truth?
9. How are unchanged observations prevented from producing unnecessary writes/history/media copies?
10. What test proves no duplicate business record was created?

If unanswered: **no new canonical table and no new parallel service.**

---

# 20. EVENT / WORKFLOW CONTINUITY

Important state changes create the next required action.

Examples:

- Seller exclusive signed → Sale Listing workflow + marketing + Seller reporting
- Landlord exclusive signed → Rental Listing workflow + rental marketing
- Buyer representation active → Buyer Search/alert workflow
- Tenant representation active → Tenant Search/alert workflow
- listing price/media/status change → Search/share/marketing/report refresh as applicable
- showing completed → feedback + follow-up + applicable Seller/Landlord report update
- Buyer offer made → sale transaction participants/attorney workflow
- Tenant application made → rental application/approval workflow
- sale contract signed → financing/cash + building process
- lease signed → Tenant and Landlord expiration workflows
- closing → commission + owner/past-client lifecycle
- ignored lead → reminder/escalation/reassignment

---

# 21. DEVELOPMENT SEQUENCE

## Phase 0 — Canonical consolidation

1. inventory all master plans, audits, specifications, hold files and unmerged roadmap documents;
2. extract every still-valid requirement;
3. assign it to Shared, Seller, Landlord, Buyer, Tenant, Investor, Agent or Broker;
4. deduplicate into one canonical blueprint;
5. identify competing identity systems/tables/routes/services;
6. freeze source authority and canonical shared services;
7. freeze each role-specific state machine;
8. mark historical competing plans as reference/superseded;
9. change startup instructions so the canonical blueprint is the sole product/design authority.

## Phase 1 — Canonical Property Intelligence foundation

Converge Building/Property/Unit/Listing Episode/Source Observation identity, Cotality source authority, ACRIS/PLUTO/DOF enrichment and deduplication.

## Phase 2 — Shared Search/Media/Communication/Document foundation

Converge Search infrastructure, Media, Share, E-blast, Comments/Communication, Documents, Tasks/Events, AI interfaces and analytical/calculator services without role-specific duplicate stores.

## Phase 3 — Separate role journeys

Implement/prove in dependency order without merging workflows:

- Seller
- Landlord
- Buyer
- Tenant
- Investor/1031

## Phase 4 — Agent/Broker operations

Prove Agent workspace, Brokerage supervision, commissions, compliance/reference and cross-role reporting over the same canonical data.

---

# 22. GLOBAL DEFINITION OF DONE

A capability is complete only when all applicable conditions are proven:

1. canonical identity/service is reused;
2. Seller/Landlord/Buyer/Tenant role boundaries are preserved;
3. source authority/provenance is correct;
4. duplicate/parallel implementation is absent or retired/migrated;
5. media/documents/comments/share artifacts reference canonical objects;
6. state transition is persisted correctly;
7. downstream workflow receives the result;
8. permissions/compliance are centrally enforced;
9. communication/audit history is preserved;
10. failure is visible/recoverable;
11. end-to-end role-specific acceptance journey passes;
12. production proof exists before production-ready claims.

Examples:

- Search is not finished until Buyer Search, Tenant Search, Seller market intelligence, Landlord rental intelligence, CMA, matching, share and marketing all consume the shared canonical infrastructure correctly.
- Media is not finished if Search, email and social cards maintain separate copies/prices/media truth.
- Seller is not finished until sale listing → marketing → showing → Seller report → offer → contract → closing handoff works.
- Landlord is not finished until rental listing → application → approval → lease → expiration lifecycle works.
- Buyer is not finished until search → showing → offer → contract → financing/cash → closing works.
- Tenant is not finished until rental search → showing → application → approval → lease → move-in works.
- An offer/application is not finished until the correct professional/transaction workflow begins.
- A closing/lease is not finished until commission and post-close/post-lease lifecycle state exists.

---

# Current handoff

- This document is the intended canonical high-level business/identity/execution authority on PR #595 and remains unmerged until explicitly approved.
- The current architecture is still in consolidation; current frontend/backend implementation must be audited against this target rather than treated as the design authority.
- The temporary separate requirement ledger must ultimately be absorbed into the single canonical blueprint to prevent document drift.
- No application code, database migration, R2 mutation, environment change, deployment or production configuration is authorized by this documentation update.
