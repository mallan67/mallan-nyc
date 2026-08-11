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

Mallan must operate as **one brokerage operating system**, not a collection of independent CRM, search, CMA, listing, marketing, portal, transaction, document, calculator or finance products.

**Unified means shared canonical identities, shared data, shared services and shared events. It does NOT mean combining distinct business roles or workflows.**

Seller, Landlord, Buyer and Tenant are four separate first-class operating journeys. They may use the same canonical Party, Property, Search, Media, Communication, Document, Marketing, Decision/Calculator, AI and Task services, but they must retain separate requirements, opportunity types, workflows, documents, state transitions, reporting and acceptance tests.

Every implementation must answer:

1. What is the canonical entity?
2. What is its canonical ID?
3. Which source or system is authoritative for each material fact?
4. Is this data a canonical record, source observation, history record, derived projection/index, media asset, communication, share artifact, calculation scenario or workflow state?
5. Who produces it?
6. Which role-specific workflows consume it?
7. What event/state transition connects it to the next business step?
8. What existing implementation is reused, migrated or retired?
9. What prevents duplicate Individuals, Entities, Properties, Listings, Contacts, Communications, Documents, Media, Campaigns, Calculation Scenarios, Leads, Deals and Commissions?
10. What end-to-end test proves the handoff?

**No new parallel table, service, search engine, client store, listing store, party store, communication store, media store, marketing store, calculator store or workflow may be introduced without an explicit identity, migration, deduplication and retirement decision.**

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
        showings, marketing, calculators, deals, documents, tasks and commissions
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
├── Comps / CMA
├── Decision & Calculator Engine
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
- a calculation/scenario
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

## 3.10 Comps / CMA

One evidence layer consumes canonical Property Intelligence and explicit assumptions.

It may power:

- Seller CMA and pricing strategy
- Landlord rental analysis / hold-sell comparison
- Buyer comparable/offer analysis
- Tenant rent comparison
- Investor underwriting
- 1031 replacement analysis

A brokerage CMA must not be mislabeled as a formal appraisal.

## 3.11 Decision & Calculator Engine

Mallan has **one shared Decision & Calculator Engine available from every role/workspace**. Seller, Landlord, Buyer, Tenant and Investor receive role-relevant calculator presets by default, but authorized agents may open any calculator when it helps an Individual(s) / Entity evaluate a Property, Listing or decision.

### 3.11.1 Listing/property-bound by default

Calculators are not anonymous standalone spreadsheets as the normal workflow. They open from the **actual Property/Listing the client or owner is considering**.

Primary contexts:

- Buyer → the sale Listing being considered
- Tenant → the rental Listing being considered
- Investor → the acquisition Listing being considered
- Seller → the Seller's canonical Property and active/proposed Sale Listing
- Landlord → the Landlord's canonical Property and active/proposed Rental Listing

When there is no active listing episode yet, a Seller/Landlord/prospect analysis may bind to the canonical Property plus a proposed Listing Scenario. A missing external listing may bind to the controlled supplemental Listing Episode after identity resolution.

```text
CLIENT / OWNER OPPORTUNITY
  ↓
PROPERTY / LISTING UNDER CONSIDERATION
  ↓
OPEN DECISION / CALCULATORS
  ↓
AUTO-PULL CANONICAL PROPERTY + LISTING FACTS
  ↓
ROLE PRESET
  ↓
AGENT CHANGES SCENARIO INPUTS ONLY
  ↓
RECALCULATE
  ↓
SAVE A / B / C SCENARIOS
  ↓
COMPARE / COMMENT / SHARE
```

### 3.11.2 Automatic prefill from the canonical listing/property

Where verified and applicable, the calculator should automatically prefill from the canonical Property/Listing/Property Intelligence record rather than require re-entry.

Examples include:

- current listing/asking price
- sale vs rental listing type
- property type / ownership type
- condo common charges
- condo property taxes
- co-op maintenance
- applicable verified DOF tax/assessment context
- unit size where available
- bedrooms/bathrooms where useful to comparison
- current/asking rent where applicable
- current listing status
- relevant verified Property/Building carrying-cost facts
- other calculator inputs already known by Mallan and authorized for the workflow

The agent must be able to see which values were **auto-pulled**, their source/provenance where material, and which values are manual assumptions.

No calculator should make the agent type a number Mallan already knows reliably from the canonical listing/property.

### 3.11.3 Canonical value vs scenario override

A calculator scenario must distinguish at least:

```text
CANONICAL SOURCE VALUE
Example: Listing asking price = $1,950,000

SCENARIO OVERRIDE
Example: Proposed Buyer offer price = $1,820,000
```

Changing the scenario offer price to $1,820,000 **must not change the Listing asking price**.

The saved scenario should retain:

- `property_id`
- `listing_episode_id` where applicable
- `opportunity_id`
- relevant Party/participant context
- canonical-source snapshot used in the calculation
- source/effective dates where material
- scenario overrides
- formula/calculator version
- calculation timestamp
- creator/editor
- permissions/share state

### 3.11.4 Adjustable offer/price scenarios

Closing-cost and decision calculators must make price a scenario control.

For a sale listing, the user should be able to compare, for example:

- Asking Price
- Proposed Offer
- Counteroffer
- Accepted Price
- Custom Price A
- Custom Price B
- Custom Price C

Changing the scenario price should immediately recalculate every price-dependent output while preserving the canonical listing price.

Example:

```text
LISTING ASKING PRICE: $1,950,000  ← canonical

Scenario A: Offer $1,750,000
Scenario B: Offer $1,820,000
Scenario C: Offer $1,900,000

For each scenario:
→ Buyer estimated cash to close
→ Buyer estimated closing costs
→ monthly ownership/carrying cost
→ Seller estimated closing costs
→ Seller estimated net proceeds
→ financing/equity/return outputs where applicable
```

An agent should not need to create three separate listings to compare three offer prices.

### 3.11.5 Listing changes and scenario refresh

If a canonical listing fact later changes—such as asking price, taxes, common charges, maintenance, rent or another sourced input—the platform must not silently rewrite an old saved scenario and destroy its historical meaning.

Instead:

1. retain the saved scenario's original source snapshot;
2. indicate that one or more canonical inputs have changed;
3. allow **Refresh/Recalculate using current listing data**;
4. preserve the prior scenario/version for audit/comparison if it was saved/shared;
5. allow selected scenario overrides, such as a proposed offer price, to remain in place during refresh.

### 3.11.6 Shared calculation rules

1. Canonical Property/Listing facts are prefilled where verified and available.
2. Agent/client assumptions are clearly separated from sourced facts.
3. Scenario edits do not overwrite canonical Property/Listing data.
4. Agents can create A/B/C or other side-by-side scenarios.
5. Scenarios save to the relevant Party + Opportunity + Property + Listing Episode and, where applicable, Transaction.
6. Saved scenarios retain input provenance, assumptions, calculation version and calculation date.
7. Scenario output may be shared through approved reports/share links and discussed through the shared Comments/Communication service.
8. Current taxes, transaction costs, fees or other externally changing rules must come from versioned/effective-date rules or verified inputs rather than timeless hard-coded percentages.
9. Appreciation, rent growth, expense growth and similar future values are **scenario assumptions**, not guaranteed predictions.
10. The UI lets the agent switch between role-oriented presets without creating duplicate analysis records.
11. All formulas have testable deterministic definitions; AI may explain results but may not silently change formulas or inputs.
12. Every material calculated output should expose the inputs used so the agent can explain the result to the client.

### 3.11.7 Universal calculator library

The full approved calculator library is available to authorized agents regardless of the current role, including when useful:

- Seller closing cost / net proceeds
- Buyer closing cost / cash to close
- mortgage/payment scenarios
- down-payment/financing sensitivity
- monthly carrying-cost comparison
- rent vs buy
- hold vs sell
- sale now vs later
- renew vs move
- purchase now vs later
- appreciation/equity projection scenarios
- rent-growth and expense-growth scenarios
- rental cash flow
- NOI
- cap rate
- cash-on-cash return
- ROI
- leveraged/unleveraged return comparisons
- vacancy/reserve sensitivity
- break-even/time-horizon comparison
- side-by-side property comparison
- 1031 replacement comparison

Additional deterministic measures such as IRR, NPV or DSCR may be supported when useful and correctly defined, but must use the same shared scenario engine.

### 3.11.8 Seller calculator preset

The Seller workspace surfaces by default:

**Seller Closing Cost / Net Proceeds Calculator** tied to the Seller's Property/Sale Listing.

It should auto-pull applicable known Property/Listing values and allow adjustable sale-price scenarios, including asking price, offer, counteroffer, accepted price and custom values.

Applicable inputs/outputs may include:

- scenario sale price
- mortgage/payoff input where applicable
- broker compensation input/terms where applicable
- applicable current transfer/transaction cost categories using verified/effective rules
- attorney and other transaction-cost inputs
- building/property-specific costs where applicable
- estimated Seller closing costs
- estimated net proceeds
- difference in net proceeds between offer scenarios
- carrying cost during additional hold/marketing time
- hold vs sell
- sale now vs later
- appreciation/equity scenarios

Seller users may open any calculator from the universal library.

### 3.11.9 Buyer calculator preset

The Buyer workspace surfaces by default:

**Buyer Closing Cost / Cash-to-Close Calculator** tied to the actual Sale Listing being considered.

The starting purchase-price scenario should default to the current listing/asking price, but the agent can immediately change it to the Buyer's proposed offer, counteroffer or accepted price without changing the listing.

Applicable inputs/outputs may include:

- asking price from Listing
- scenario purchase/offer price
- down payment
- financing amount
- mortgage/payment assumptions
- current applicable transaction/financing cost categories using verified/effective rules or explicit inputs
- attorney/inspection/appraisal and other applicable costs
- building/property-specific costs where applicable
- taxes/common charges or co-op maintenance auto-pulled where available
- estimated Buyer closing costs
- estimated cash required to close
- monthly ownership/carrying cost
- financing/down-payment sensitivity
- rent vs buy
- purchase now vs later
- appreciation/equity scenarios
- side-by-side property affordability/value comparison

Buyer users may open any calculator from the universal library.

### 3.11.10 Landlord calculator preset

The Landlord workspace surfaces by default:

**Upkeep / Hold-vs-Sell Calculator** tied to the Landlord's canonical Property/Rental Listing.

Applicable auto-pulled and scenario inputs may include:

- current/asking rent
- maintenance/common charges/taxes as applicable
- verified Property carrying-cost facts
- insurance input
- repairs/reserves
- management/leasing costs if applicable
- utilities/other owner-paid costs
- financing/debt service if applicable
- vacancy assumption
- rent-growth assumption
- expense-growth assumption
- appreciation assumption
- alternative sale-price scenarios

Outputs may include:

- gross/net rental cash flow
- upkeep/carrying cost
- hold vs sell comparison
- sale net-proceeds alternative
- renew vs re-rent comparison
- selected time-horizon comparison
- cap-rate/cash-flow views where useful
- appreciation/equity scenarios

Landlord users may open any calculator from the universal library.

### 3.11.11 Tenant calculator preset

The Tenant workspace surfaces by default:

**Rent-vs-Buy Calculator** tied to the Rental Listing being considered and, when comparing ownership, a selected Sale Listing/property scenario.

Applicable inputs/outputs may include:

- current/proposed rent auto-pulled from Rental Listing
- rent-growth assumption
- renewal/move alternatives
- selected purchase Listing/price
- adjustable purchase-offer scenario
- down payment
- mortgage/payment
- ownership carrying costs
- Buyer closing costs/cash to close
- anticipated time horizon
- appreciation/equity scenario
- break-even comparison
- purchase-readiness scenario

Tenant users may open any calculator from the universal library.

### 3.11.12 Investor calculator preset

The Investor workspace surfaces by default an analysis tied to the actual acquisition Listing being considered.

Known Listing/Property values should prefill automatically. Applicable calculations may include:

- purchase/listing price and adjustable offer price
- current/market rent where verified/available
- expenses/carrying costs
- taxes/common charges/maintenance
- NOI
- cash flow
- cap rate
- cash-on-cash return
- ROI
- debt service / financing
- leveraged vs unleveraged returns
- rent-growth scenarios
- expense-growth scenarios
- vacancy/reserve sensitivity
- hold-period analysis
- sale/reversion proceeds
- **appreciation projection scenarios**
- equity build/amortization
- side-by-side acquisition comparison
- 1031 replacement comparison where applicable

Investor users may open any calculator from the universal library.

### 3.11.13 Decision cockpit behavior

Every relevant listing/property card or workspace should expose a context action such as **Decision / Calculators**.

```text
LISTING / PROPERTY
  ↓
CLIENT OR OWNER OPPORTUNITY
  ↓
DECISION / CALCULATORS
  ↓
AUTO-PULL CURRENT LISTING/PROPERTY VALUES
  ↓
ROLE PRESET
  ├── Seller: closing costs / net proceeds / hold-vs-sell
  ├── Landlord: upkeep / rental cash flow / hold-vs-sell
  ├── Buyer: closing costs / cash-to-close / mortgage / rent-vs-buy
  ├── Tenant: rent-vs-buy / renew-vs-move
  └── Investor: cash-on-cash / ROI / cap rate / appreciation / hold analysis
  ↓
CHANGE OFFER / PURCHASE / RENT / FINANCING / TIME-HORIZON ASSUMPTIONS
  ↓
SAVE SCENARIO A / B / C
  ↓
COMPARE
  ↓
COMMENT / DISCUSS
  ↓
SHARE APPROVED ANALYSIS
```

## 3.12 Marketing / E-blast

E-blast is a shared marketing service connected directly to canonical Search, Listing, Party and Campaign records.

It may be invoked differently by role/workflow, for example:

- Seller listing → cooperating agents, matched buyers/prospects, prior viewers, open-house audiences
- Landlord rental listing → appropriate rental audiences and cooperating agents
- Buyer → selected listing collection or market update
- Tenant → selected rental collection or market update
- Agent → search-based client send / campaign

Recipients resolve to canonical Party records. Campaign response/engagement must connect back to the appropriate relationship/opportunity rather than create duplicate contacts/leads.

## 3.13 Share / live share cards / share links

Share is a shared rendering/distribution capability, not a separate listing database.

From Search, Listing, CMA/report, calculator/scenario or other approved contexts, agents can create/share:

- permission-aware share link/page
- listing card
- listing collection
- HTML email
- social-media-ready card/content where allowed
- client-facing report/share artifact
- approved calculation/scenario comparison

A live share card/page references the canonical listing/property and current approved media.

When price/status/media changes:

```text
CANONICAL LISTING CHANGE
  ↓
LISTING_CHANGED EVENT
  ├── Search refresh
  ├── Match/alert reevaluation
  ├── Seller report refresh where applicable
  ├── Landlord report refresh where applicable
  ├── Live share/card invalidation + re-render
  └── saved calculators flagged for source refresh where applicable
```

Do not maintain separate editable prices or media in Search cards, email cards, client cards and social/share cards.

A previously delivered email/social post remains an auditable historical publication; its linked Mallan live page can display current canonical information.

## 3.14 AI assistance

AI is a shared assistance layer available contextually throughout the backend.

Agents may use AI to help with:

- Search construction/refinement
- property/listing comparison
- client-response drafting
- follow-up drafting
- CMA/report explanations
- calculator/scenario explanations
- marketing/e-blast drafts
- listing descriptions/approved copy assistance
- transaction next-step guidance
- document/compliance lookup
- investor analysis explanation

AI must use the canonical Mallan records and approved current sources available to the workflow. It must identify missing facts rather than invent them.

AI may draft/recommend, but may not silently:

- change canonical records
- change deterministic calculator formulas
- replace sourced facts with assumptions
- send communications
- alter controlled agreement language
- make binding legal/tax conclusions
- bypass broker/agent approval or permissions
- create a second AI-only Search/Property/Client truth

## 3.15 Tasks / events / calendar / reminders

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

## 3.16 Permissions / audit / provenance

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
Decision: Seller closing costs / net proceeds / hold-vs-sell scenarios
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
Offer-price scenarios update Seller net-proceeds analysis
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
- Seller Closing Cost / Net Proceeds Calculator bound to the Seller Property/Sale Listing
- adjustable asking/offer/counter/accepted-price scenarios without changing canonical listing price
- hold-vs-sell / sale-now-vs-later scenarios
- appreciation/equity scenarios
- access to all other shared calculators
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
Decision: upkeep / rental cash flow / hold-vs-sell scenarios
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
- Property facts / carrying costs
- Upkeep / Hold-vs-Sell Calculator bound to the Landlord Property/Rental Listing
- rental cash-flow scenarios with current/asking rent auto-pulled when available
- rent-growth / expense-growth / vacancy scenarios
- appreciation/equity scenarios
- sale net-proceeds alternative using adjustable sale-price scenarios
- access to all other shared calculators
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
Open Listing → auto-prefilled Buyer decision calculators
  ↓
Change proposed offer price / financing / assumptions
  ↓
Show / Maybe / Pass
  ↓
Showing(s)
  ↓
Offer / negotiation / accepted offer
  ↓
Offer/counter/accepted price recalculates closing cost/cash-to-close scenarios
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
- Buyer Closing Cost / Cash-to-Close Calculator bound to the selected Sale Listing
- automatic prefill of listing price and applicable known taxes/common charges/maintenance/property facts
- adjustable proposed offer/counter/accepted-price scenarios without changing the Listing
- mortgage/payment and financing sensitivity
- monthly ownership-cost analysis
- rent-vs-buy
- purchase-now-vs-later
- appreciation/equity scenarios
- side-by-side property affordability/value comparison
- access to all other shared calculators
- Show / Maybe / Pass
- showings / no-show state
- offer(s)
- comparable/offer analysis
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
Open Listing → auto-prefilled rent-vs-buy / renew-vs-move scenarios
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
- Rent-vs-Buy Calculator bound to the Rental Listing being considered
- current/proposed rent auto-pulled from the Rental Listing
- selected Sale Listing/property can be attached when comparing purchase
- adjustable purchase-offer scenario when comparing a specific Sale Listing
- renew-vs-move scenario
- rent-growth trajectory
- purchase-readiness scenario
- appreciation/equity scenario when comparing purchase
- access to Buyer Closing Cost / Cash-to-Close when evaluating a selected Sale Listing
- access to all other shared calculators
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

Investor/1031 remains a distinct opportunity type using the shared Search/Property Intelligence/Decision & Calculator Engine foundation.

Every acquisition analysis should bind to the actual Listing/Property being considered and auto-pull known canonical facts before adding assumptions.

It may include:

- acquisition criteria
- investment SearchProfile
- rented/income-producing property identification
- listing/asking price plus adjustable acquisition-offer price
- verified rent/expense inputs where available
- taxes/common charges/maintenance
- NOI
- cash flow
- cap rate
- cash-on-cash return
- ROI
- debt-service / financing analysis
- leveraged/unleveraged scenarios
- rent-growth / expense-growth / vacancy sensitivity
- appreciation projection scenarios
- equity build/amortization
- hold-period analysis
- sale/reversion proceeds
- side-by-side acquisition comparison
- 1031 disposition/replacement timeline and replacement search
- access to all other shared calculators

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
- open the full Decision & Calculator Engine directly from any applicable Property/Listing/client context
- have known Listing/Property inputs prefilled automatically
- change offer/purchase/rent/financing/time-horizon assumptions without changing canonical source data
- save and compare A/B/C calculation scenarios
- use Seller closing-cost/net-proceeds tools
- use Buyer closing-cost/cash-to-close tools
- use Landlord upkeep/hold-vs-sell tools
- use Tenant rent-vs-buy tools
- use Investor cash-on-cash/ROI/appreciation/hold tools
- use contextual AI assistance to explain scenarios without changing formulas/facts
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

Broker scope operates over the same canonical agents, Parties, Properties, Listings, Opportunities, Transactions, Campaigns, Calculation Scenarios, Tasks and Commissions.

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
- seller update obligations
- landlord update obligations
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
  ↓
SAME LISTING CAN FEED DECISION/CALCULATOR ENGINE
```

No blind URL → database insert → public listing.

External photos/media may not be copied, stored or republished merely because a URL was supplied; source rights/authority must permit use.

If Cotality later supplies the same Listing Episode, reconcile the existing episode to Cotality authority rather than duplicating it. Saved scenarios referencing the supplemental episode must continue to resolve to the reconciled canonical Listing Episode.

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
- approved calculation/scenario share or report

Campaign attribution must connect recipients and engagement back to canonical Party/Opportunity records.

---

# 15. OFFER / APPLICATION / TRANSACTION CONTINUITY

Offer/application creates the appropriate role-specific transaction path and professional-participant capture.

## Sale transaction

Offer → Accepted Offer → Attorneys/Due Diligence → Contract → Mortgage or All Cash → applicable Co-op/Condo process → Final Walkthrough → Closing → Commission.

Offer, counteroffer and accepted-price changes should be usable as calculation scenarios so Buyer cash-to-close and Seller net-proceeds estimates can be refreshed at each meaningful negotiation point without changing the canonical listing asking price.

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

Financial/closing-cost calculators must use current verified/effective rules or explicit assumptions and identify estimated outputs appropriately; they are decision-support tools, not legal/tax advice or settlement statements.

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
2. Is the proposed data canonical, source observation, history, media, communication, share artifact, calculation scenario, workflow state or projection?
3. Why cannot an existing canonical service own it?
4. What is the unique/dedup identity?
5. How are uncertain matches handled?
6. What happens when another source later reports the same Party/Property/Listing?
7. What existing table/service/route is reused, migrated, merged, superseded or retired?
8. Can projections/cards/reports/calculations rebuild from canonical truth plus explicit saved assumptions?
9. How are unchanged observations prevented from producing unnecessary writes/history/media/calculation copies?
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
- canonical Property/Listing financial fact changes → saved scenarios are flagged as based on older sourced inputs and may be refreshed without losing scenario overrides/history
- showing completed → feedback + follow-up + applicable Seller or Landlord report update
- Buyer offer made → sale transaction participants/attorney workflow + Buyer/Seller price-scenario calculations available
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
8. freeze the shared Decision & Calculator Engine, listing-binding rules and role presets;
9. mark historical competing plans as reference/superseded;
10. change startup instructions so the canonical blueprint is the sole product/design authority.

## Phase 1 — Canonical Property Intelligence foundation

Converge Building/Property/Unit/Listing Episode/Source Observation identity, Cotality source authority, ACRIS/PLUTO/DOF enrichment and deduplication.

## Phase 2 — Shared Search/Media/Communication/Document/Decision foundation

Converge Search infrastructure, Media, Share, E-blast, Comments/Communication, Documents, Tasks/Events, AI interfaces and the shared Decision & Calculator Engine without role-specific duplicate stores.

The Decision & Calculator Engine must prove that a Listing opens with canonical inputs prefilled and that changing an offer/price assumption recalculates outputs without mutating the Listing.

## Phase 3 — Separate role journeys

Implement/prove in dependency order without merging workflows:

- Seller
- Landlord
- Buyer
- Tenant
- Investor/1031

Each role must consume the same shared calculator engine through its own preset and decision context.

## Phase 4 — Agent/Broker operations

Prove Agent workspace, Brokerage supervision, commissions, compliance/reference and cross-role reporting over the same canonical data.

---

# 22. GLOBAL DEFINITION OF DONE

A capability is complete only when all applicable conditions are proven:

1. canonical identity/service is reused;
2. Seller/Landlord/Buyer/Tenant role boundaries are preserved;
3. source authority/provenance is correct;
4. duplicate/parallel implementation is absent or retired/migrated;
5. media/documents/comments/share artifacts/calculation scenarios reference canonical objects;
6. calculator opens from the applicable Property/Listing and automatically consumes verified available listing/property facts;
7. sourced facts and editable scenario assumptions are visibly distinguishable;
8. changing offer/purchase/sale/rent/financing assumptions never silently changes canonical Listing/Property facts;
9. calculator formulas are deterministic/versioned/tested and role presets all use the same engine;
10. saved scenarios retain canonical-source snapshot + overrides + calculation version/history;
11. state transition is persisted correctly;
12. downstream workflow receives the result;
13. permissions/compliance are centrally enforced;
14. communication/audit history is preserved;
15. failure is visible/recoverable;
16. end-to-end role-specific acceptance journey passes;
17. production proof exists before production-ready claims.

Examples:

- Search is not finished until Buyer Search, Tenant Search, Seller market intelligence, Landlord rental intelligence, CMA, matching, share and marketing all consume the shared canonical infrastructure correctly.
- Media is not finished if Search, email and social cards maintain separate copies/prices/media truth.
- Calculator architecture is not finished if Seller closing costs, Buyer closing costs, Landlord hold-vs-sell, Tenant rent-vs-buy and Investor ROI are implemented as separate formula/data systems.
- Buyer closing costs are not finished if an agent must retype listing price/taxes/common charges already known to Mallan or if testing a different offer price changes the listing.
- Seller net proceeds are not finished if an offer/counter scenario cannot be compared against asking price while preserving the actual Listing price.
- A saved scenario is not trustworthy if a later listing price/tax/maintenance change silently rewrites the old analysis without version/history.
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
