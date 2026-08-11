# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Single repository authority for the Mallan brokerage, agent, listing, search, CMA, marketing, reporting, transaction and technology operating system.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**.
- Repository scope: **`mallan67/mallan-nyc` only** unless Maya explicitly changes it.
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document is the single product/system plan. Audits, issue registries, PRs, technical notes and historical plans are evidence/reference only and may not become competing master plans.
- Production mutation remains held unless Maya separately authorizes it. Documentation, read-only verification, tests and design work do not authorize migrations, environment changes, destructive data work, R2 cleanup or manual production deployment.
- Every listing/property/data statement used for implementation must be verified against the current authorized Cotality/RLS contract or another applicable authoritative source before it is treated as fact.

---

# 1. ONE MALLAN OPERATING SYSTEM

Mallan is the operating system of a New York City real-estate brokerage.

It is not a website plus separate CRM, Search, CMA, Marketing, Reporting and Commission products.

```text
MALLAN BROKERAGE
        │
        ├── BROKERAGE VIEW — firm scope
        │
        └── MY BUSINESS — individual producer scope
                        │
                        ▼
                      PARTY
                        │
                  ROLE OPPORTUNITY
           ┌────────────┼────────────┐
           │            │            │
        PROPERTY      SEARCH       LISTING
           │            │            │
           └────────────┼────────────┘
                        │
                 CMA / DECISIONS
                        │
                MARKETING / E-BLAST
                        │
                ENGAGEMENT / SHOWING
                        │
                 LISTING REPORTING
                        │
                 SYSTEM INTELLIGENCE
                        │
                OFFER / APPLICATION
                        │
                   TRANSACTION
                        │
              COMMISSION / REFERRAL
                        │
                POST-DEAL RELATIONSHIP
```

**Unified means shared canonical identity, data and history. It does not mean collapsing distinct roles.**

Seller, Landlord, Buyer and Tenant remain four separate first-class opportunities and workflows.

No new parallel client, property, listing, search, comment, media, document, campaign, CMA, calculator, transaction or commission truth may be created without an explicit migration/deduplication/retirement decision.

---

# 2. SIMPLE BROKERAGE / AGENT OPERATING MODEL

Mallan must keep the human operating model simple.

## 2.1 Two views

```text
MALLAN
│
├── BROKERAGE VIEW
│   firm-wide oversight and exceptions
│
└── MY BUSINESS
    the logged-in producer's own business
```

Maya Allan is one Individual with both scopes:

- Representative Broker / Brokerage View
- Producing Agent / My Business

If Maya is the producing agent on a deal, that deal appears in both views but remains **one canonical deal**.

## 2.2 Independent contractors

Mallan agents are independent contractors operating their own book of business inside Mallan's brokerage framework.

Mallan should:

- provide the brokerage platform;
- provide support;
- remind;
- flag;
- record;
- provide required firm controls;
- provide broker visibility where supervision/support is required.

Mallan should not try to micromanage every independent contractor's business.

The individual licensee remains responsible for meeting their own professional obligations.

## 2.3 Current role model

For the current company:

```text
MAYA ALLAN
├── Representative Broker
└── Agent / Producer

LICENSED REAL ESTATE SALESPERSON
└── Agent / Producer

LICENSED REAL ESTATE ASSOCIATE BROKER
└── Agent / Producer
```

There is no Manager/Office Manager role now.

An Associate Broker functions like another Agent/Producer in Mallan unless Mallan later deliberately creates a separate supervisory appointment/capability.

License type is still stored because it controls the person's proper public professional title and applicable obligations.

---

# 3. CANONICAL SHARED FOUNDATION

The shared foundation supports every role without creating private duplicate systems.

```text
CANONICAL SHARED FOUNDATION
│
├── Brokerage
├── Agent / Licensee
├── Party
│   ├── Individual(s)
│   └── Entity
├── Property
│   ├── Building
│   └── Unit
├── Listing Episode
├── Source Observation
├── Role-specific Opportunities
│   ├── Seller
│   ├── Landlord
│   ├── Buyer
│   ├── Tenant
│   └── Investor / 1031
├── Contacts / Professionals
├── Search
├── Client × Listing History
├── CMA / Property Intelligence
├── Decision / Calculator Scenarios
├── Communications / Comments
├── Documents / Agreements / Amendments
├── Media
├── Marketing / E-blast
├── Listing Reports
├── Tasks / Calendar / Reminders
├── Transactions
├── Commissions / Referrals
├── Permissions / Consent / Visibility
├── Technology / Rule Flags
└── Audit / Provenance / History
```

## 3.1 Party

Every human or legal participant resolves to one Party identity.

```text
PARTY
│
├── INDIVIDUAL(S)
└── ENTITY
    ├── LLC
    ├── Corporation
    ├── Partnership
    ├── Trust
    ├── Estate
    └── other legal entity
```

Role is separate from identity.

The same Party may have a Seller Opportunity, Landlord Opportunity and Buyer Opportunity without being duplicated.

## 3.2 Property / Listing

Property is not Listing.

```text
BUILDING / PROPERTY / UNIT
        ↓
LISTING EPISODE
        ↓
SOURCE OBSERVATION(S)
```

A physical Property/Unit survives multiple sale/rental listing episodes, ownership changes, leases, CMAs and client interest.

## 3.3 Professionals

Attorneys, lenders, managing agents and other professional participants are reusable Parties/Organizations linked to the applicable Opportunity/Transaction rather than recreated per screen.

---

# 4. LISTING SOURCE, IDENTITY, EDIT AUTHORITY AND VISIBILITY

Mallan must keep four decisions separate:

1. **Identity** — what real Property/Unit/Listing Episode is this?
2. **Source** — who supplied this observation?
3. **Authority** — who may edit the canonical record?
4. **Visibility** — who may see/use/share it?

These may never be collapsed into one source flag.

## 4.1 Mallan-authored listing

A listing created inside Mallan remains Mallan's canonical editable listing.

Authorized Mallan agents/broker may amend it.

It connects to:

- owner Party;
- Seller or Landlord Opportunity;
- Property/Building/Unit;
- representation/exclusive agreement and amendments;
- listing data;
- media;
- marketing;
- e-blasts;
- open houses/showings;
- feedback;
- reports;
- offers/applications;
- transaction and commission.

Cotality must never silently overwrite Mallan-authoritative fields on a Mallan-authored listing.

## 4.2 Third-party Cotality listing

A listing supplied by Cotality for another brokerage is read-only source truth inside Mallan.

Authorized agents may:

- Search;
- save;
- compare;
- comment;
- attach it to Buyer/Tenant Opportunities;
- send it to clients;
- schedule showings;
- use it in CMA/Property Intelligence;
- use it in calculators/offer scenarios.

These actions create Mallan-owned workflow records. They never mutate the third-party Cotality listing.

## 4.3 Cotality return-copy of a Mallan listing

When Cotality later returns a copy of a Mallan-authored listing:

- resolve it to the same canonical Mallan Listing Episode;
- keep the Cotality observation internally for reconciliation/distribution evidence;
- suppress it as a duplicate from public Search/count/pagination/detail surfaces;
- keep Mallan as the editable canonical record;
- do not create a second client/history identity.

Address alone is not sufficient evidence for automatic suppression. Uncertain identity goes to review rather than false merge/suppression.

## 4.4 Future Mallan → Cotality publishing

Mallan must be designed now so Mallan-authored listings can later publish directly to the current RLS provider without creating another internal listing truth.

```text
MALLAN CANONICAL LISTING
        ↓
VALIDATION
        ↓
AGENT / BROKER APPROVAL AS REQUIRED
        ↓
PROVIDER PUBLISH PROJECTION
        ↓
CURRENT PROVIDER
        ↓
ACKNOWLEDGEMENT / EXTERNAL IDS
        ↓
RETURN OBSERVATION
        ↓
RECONCILIATION TO SAME MALLAN LISTING
```

The internal Mallan listing form is not itself the provider payload. The provider adapter owns verified required fields, conditional rules, picklists, formatting, IDs and mapping.

---

# 5. SEARCH — P0 PROFESSIONAL OPERATING SYSTEM

Search is one of Mallan's most important operating systems and is immediate P0 work because the current implementation does not yet deliver the intended professional behavior reliably.

Search must be exhaustive for agents. The problem is **not** that Advanced Search has too many criteria. The problem is that visible criteria, mappings, execution, counts, saved searches and client history are not yet one reliable system.

## 5.1 Two separate Search products

### Frontend Consumer Search

Public/consumer Search remains a separate product and should be preserved, verified and corrected rather than blindly rebuilt.

Its public inventory is:

```text
ELIGIBLE MALLAN-AUTHORED LISTINGS
+
ELIGIBLE THIRD-PARTY COTALITY LISTINGS
-
COTALITY RETURN-COPIES OF MALLAN LISTINGS
```

Consumer payloads must exclude internal/professional-only fields before serialization.

### Backend Agent Search

Backend Agent Search is the full professional product.

It may expose verified professional information authorized for Mallan agents, including appropriate Cotality listing-professional information internally.

Third-party Cotality listings remain read-only.

Mallan-authored listings remain editable only through the listing-management authority, not because they appeared in Search.

Frontend and Backend Search may share low-level provider, identity, normalization and media infrastructure, but they require separate contracts, permissions, DTOs and acceptance tests.

## 5.2 Basic mobile / Advanced desktop

The existing concept is retained:

```text
BASIC
= mobile presentation

ADVANCED
= full professional desktop Search
```

They are **two presentations of the same Search criteria contract and Search engine**.

A Saved Search created in Advanced desktop must retain all criteria when opened on mobile, even if the Basic mobile interface does not display every advanced control.

Mobile may show, for example:

```text
Manhattan
$1.5M–$2.0M
2+ Beds
Condo
+ 23 Advanced Criteria Applied
```

Changing a visible mobile criterion must not silently erase hidden advanced criteria.

## 5.3 Exhaustive Advanced Search

Authorized agents must be able to Search from every legitimate professional perspective supported by the verified current RLS/provider data.

This includes, where verified and supported:

- listing/RLS ID;
- address, building, unit, ZIP;
- geography/neighborhood/borough/map area;
- sale/rental;
- price/rent and price changes;
- detailed status/activity/date criteria;
- bedrooms, bathrooms, rooms, size and floor;
- property/ownership/subtype;
- building characteristics;
- amenities/features;
- outdoor space/views/parking/storage/accessibility;
- sale-specific criteria;
- rental-specific criteria;
- open houses;
- new-development/building criteria;
- professional listing office/agent criteria where authorized;
- market/comp-oriented criteria;
- additional legitimate searchable fields verified from the current provider contract.

Do not impose an arbitrary small product list of filters on professional Advanced Search.

## 5.4 Search field contract

Every Search field requires a controlled contract:

```text
UI FIELD
↓
MALLAN CANONICAL CRITERION
↓
CURRENT PROVIDER FIELD / VERIFIED DERIVATION
↓
TYPE / PICKLIST / NULL SEMANTICS
↓
QUERY OPERATOR
↓
RESULT / COUNT / PAGINATION BEHAVIOR
↓
CONTRACT TEST
```

Each criterion has one of three honest states:

- **SUPPORTED** — translated and executed correctly;
- **LOCAL/DERIVED** — intentionally calculated with exact semantics and correct count/pagination handling;
- **UNAVAILABLE** — not presented as a functioning Search control.

Never render a Search control that is silently ignored.

## 5.5 Correct Search ordering

Final Search semantics must be correct before the UI is considered fixed.

Conceptually:

```text
SOURCE CANDIDATES
↓
CANONICAL IDENTITY / SOURCE AUTHORITY
↓
AUDIENCE VISIBILITY / PERMISSIONS
↓
SUPPORTED FILTERS
↓
RETURN-COPY SUPPRESSION / DEDUPE
↓
SORT
↓
FINAL COUNT
↓
PAGINATION
↓
PRESENTATION ENRICHMENT
```

Filtering/dedupe after pagination may not produce phantom totals, short pages or unreachable eligible listings.

## 5.6 Saved Search belongs to Client + Opportunity

A Saved Search is not merely an Agent bookmark.

```text
AGENT
↓
CLIENT PARTY
↓
BUYER or TENANT OPPORTUNITY
↓
SAVED SEARCH
```

A Client may have multiple Saved Searches.

Example:

```text
JOHN SMITH — BUYER
├── Manhattan 2BR Condo
├── Brooklyn Heights 3BR
└── Investment Condo
```

Buyer and Tenant Saved Searches remain separate because they belong to different role Opportunities.

## 5.7 Select Client → recall Search automatically

Backend Search has a persistent Client selector and Saved Search selector.

Example:

```text
Client:      [ John Smith — Buyer ▼ ]
Saved Search:[ Manhattan 2BR Condo ▼ ]
```

Selecting the Client/Search must:

1. load the correct Buyer/Tenant Opportunity;
2. auto-populate all Saved Search criteria;
3. run the current Search;
4. load all current matching listings;
5. load the Client × Listing history for those listings;
6. present new opportunities separately from already-known properties.

The agent does not re-enter the client's requirements every time.

## 5.8 Temporary edits versus saved criteria

An Agent may temporarily broaden/tighten a Search without accidentally overwriting the saved Client criteria.

Unsaved changes must be obvious and offer:

- Discard;
- Update this Saved Search;
- Save as New Search.

## 5.9 Client × Listing relationship memory

For an assigned Client, Search results are **current inventory plus the client's prior relationship with each canonical listing**.

History can include:

- sent;
- opened/viewed online;
- saved/liked;
- discuss;
- showing requested;
- showing scheduled;
- showing completed/viewed in person;
- passed/rejected;
- offer made;
- comments/discussion;
- material listing changes since prior review.

Client history attaches to canonical Listing identity. A Cotality return-copy of the same Mallan listing must inherit the same history rather than appear as a new property.

## 5.10 Result organization for an assigned Client

Default Client Search should prioritize actionable inventory without erasing history.

Useful groupings include:

```text
NEW
PRICE / STATUS UPDATES
RECONSIDER
SENT / NOT YET VIEWED
VIEWED
LIKED / DISCUSS
SHOWING / SHOWN
REJECTED
OFFER / DEAL
```

The Agent can still review every relevant listing.

## 5.11 Auto-send rules

A Client Saved Search may automatically send eligible matching updates for:

1. **NEW LISTINGS**
2. **VERIFIED PRICE CHANGES**
3. **MEANINGFUL VERIFIED STATUS CHANGES**

These are not all the same message type.

### New listing

Presented as a new recommendation/match.

### Price change

Presented as an update to a known listing with previous and current price where verified.

### Status change

Presented clearly as a **Market Update**, not falsely as a new recommendation.

Verified status updates may include, when supported by the current RLS/provider mapping:

- Active → In Contract / Signed Contract;
- In Contract → Closed/Sold;
- Active Rental → Rented/Closed;
- In Contract → Back on Market;
- other material verified status transitions.

The exact labels and transitions must come from the current verified provider/RLS mapping. Mallan must not guess that a property is sold, rented or in contract.

These updates let a Client see the market moving through their own live Saved Search rather than relying only on the Agent saying that a property is gone or under contract.

## 5.12 Previously known listings may receive updates

A listing that was previously sent, viewed, liked, discussed or shown may be sent again automatically when a qualifying verified price/status change occurs, subject to the Client's Saved Search alert settings.

A repeated update is preserved as a new historical event; it does not overwrite the prior send/view history.

## 5.13 Rejected/Pass is the exception

An explicitly rejected/passed listing is **never automatically resent**.

If a rejected listing later has a material price/status change:

```text
REJECTED LISTING
+
MATERIAL VERIFIED CHANGE
↓
RECONSIDER
↓
AGENT REVIEW
```

Mallan should show:

- previous rejection/pass date;
- rejection reason/comment if available;
- previous value/status;
- new value/status;
- material change.

The Agent may intentionally send it again after review.

`RECONSIDER` is not `NEW` and does not auto-send.

## 5.14 Comments are permanent Client × Listing memory

Search must use the shared Comment system rather than one overwriteable note.

```text
CLIENT
+
ROLE OPPORTUNITY
+
CANONICAL LISTING
↓
COMMENT / DISCUSSION TIMELINE
```

Comments may be:

- internal Agent/Brokerage;
- client-shared.

Example timeline:

```text
Aug 4 — Agent: Sent because layout closely matches requirements.
Aug 5 — Client: Likes kitchen; concerned about monthly costs.
Aug 5 — Agent: Discussed costs by phone; client wants to see it.
Aug 10 — Showing completed.
Aug 10 — Agent: Likes building; bedroom feels small.
Aug 10 — Client: Pass for now.
```

The Agent should be able to see the latest relevant comment directly from Search results.

## 5.15 Structured disposition + free comment

When useful, Mallan may capture a simple structured reason such as:

- Price
- Location
- Size
- Layout
- Condition
- Building
- Monthly costs
- Amenities
- Light/View
- Other

plus a free-text comment.

This helps the Agent remember the discussion and may later support explainable Search recommendations. The system must not silently change Client Search criteria without Agent approval.

## 5.16 Showings and Client activity update Search automatically

The same history must update from real workflow events.

```text
SCHEDULE SHOWING
→ Search result = SHOWING SCHEDULED

SHOWING COMPLETED
→ Search result = VIEWED IN PERSON

TRACKED CLIENT OPEN/VIEW
→ Search result = VIEWED
```

The Agent should not have to maintain duplicate status manually in Search and Showings.

## 5.17 Auto-send pipeline

```text
SAVED CLIENT SEARCH
↓
CURRENT ELIGIBLE INVENTORY
↓
CANONICAL LISTING IDENTITY
↓
CURRENT PROVIDER / RLS PERMISSION RULES
↓
CLIENT × LISTING HISTORY
↓
CHANGE DETECTION
├── NEW → eligible for auto-send
├── PRICE CHANGE → eligible for update
├── STATUS CHANGE → eligible for market update
└── REJECTED + CHANGE → RECONSIDER only
↓
CLIENT-SAFE TRANSFORMATION
↓
DELIVERY
↓
RECORD SEND / UPDATE EVENT
```

## 5.18 Client-facing Search payload boundary

Authorized Backend Agent Search may contain professional listing-agent/office information from Cotality.

That information must be removed before client sends/portal/share/email where it is not permitted/appropriate.

Never hide sensitive/internal professional data with CSS. It must not be serialized into the client payload.

## 5.19 Search acceptance example

Search is not finished until this workflow works end-to-end:

```text
1. Agent selects John Smith — Buyer.
2. Agent selects John's Manhattan 2BR Saved Search.
3. All saved criteria auto-populate.
4. Current professional Search executes correctly.
5. Mallan identifies current matches.
6. Every match is joined to John's prior listing history.
7. New listings are clearly separated.
8. Previously viewed/shown/rejected properties are marked.
9. New matching listings auto-send if enabled.
10. Verified price changes auto-send if enabled.
11. Verified material status changes auto-send as Market Updates if enabled.
12. Rejected listings never auto-resend; material changes go to RECONSIDER.
13. Agent can review old comments and intentionally resend.
14. Client view/showing/comment activity returns to the same history.
15. The same listing identity feeds Compare/CMA without client disposition removing valid market evidence.
```

---

# 6. CMA / PROPERTY INTELLIGENCE — BUILT ON THE SAME SEARCH FOUNDATION

CMA is not a second Search universe.

```text
BACKEND AGENT SEARCH / PROPERTY INTELLIGENCE
        ↓
ELIGIBLE MARKET UNIVERSE
        ↓
AGENT COMP SELECTION
        ↓
ADJUSTMENTS / ANALYSIS
        ↓
PRICING / VALUE STRATEGY
        ↓
VERSIONED CMA / CLIENT REPORT
```

## 6.1 CMA workflow

The professional CMA experience should follow:

1. Subject Property / Client Opportunity
2. Market Universe
3. Comp Selection
4. Adjustments / Analysis
5. Pricing/Value Strategy
6. Save Version
7. Preview / Client-safe Report

## 6.2 Market universe

Sale CMA should distinguish relevant:

- Closed evidence;
- Pending/In Contract context;
- Active competition.

Rental CMA should distinguish relevant:

- leased/rented evidence where verified;
- pending/application/in-contract context where supported;
- active rental competition.

The Agent may tighten/broaden using the same professional Search field contract.

## 6.3 Comp evidence

Use verified transaction/listing facts.

Never substitute asking/list price for a closed price merely because a close value is missing.

Where an authorized supplemental recorded source such as ACRIS is used, label its provenance rather than pretending it is the provider's close field.

## 6.4 Agent-selected and explainable

Mallan may suggest comps but the Agent chooses the presented comp set.

Suggested comps should explain why they were selected, for example:

- same building;
- same property/ownership type;
- similar bedroom/bath count;
- similar size;
- recent relevant date;
- geographic proximity.

Avoid unexplained black-box similarity scores.

## 6.5 Adjustments

Adjustments must be versioned/auditable and explainable.

Do not use unreviewed timeless fixed percentages as the professional valuation engine.

Agent overrides require a reason/context and must never silently mutate the source listing/property facts.

## 6.6 Versioning

A saved CMA retains:

- subject Property/Unit;
- role Opportunity;
- as-of date;
- source/comp IDs and source snapshots;
- criteria/exclusions/selections;
- adjustments/method;
- value/range/strategy;
- creator;
- version;
- permissions/share state.

A later source change does not rewrite an already-delivered CMA. The system can flag that market evidence changed and allow a new version.

## 6.7 CMA report professional identity

A client-facing CMA/report displays the Mallan Agent/Broker who created the report.

**The underlying Cotality listing agent, co-list agent and source listing office must never appear on the client CMA/report.**

Source professional information remains internal Agent Search/Property Intelligence only.

---

# 7. DECISION & CALCULATOR ENGINE

Mallan has one deterministic shared calculator/scenario engine available across Seller, Landlord, Buyer, Tenant and Investor workflows.

Calculators normally open from the actual Property/Listing being considered and prefill verified known facts.

## 7.1 Canonical facts vs scenario overrides

```text
CANONICAL FACT
Listing asking price = $1,950,000

SCENARIO
Proposed offer = $1,820,000
```

Changing a scenario does not change the Listing.

Saved scenarios retain source snapshot, overrides, formula version, date, creator and context.

## 7.2 Shared calculator library

Role presets may expose, as applicable:

- Seller closing cost / net proceeds;
- Buyer closing cost / cash to close;
- mortgage/payment and financing sensitivity;
- monthly carrying cost;
- rent vs buy;
- hold vs sell;
- sale now vs later;
- renew vs move;
- purchase now vs later;
- appreciation/equity scenarios;
- rental cash flow;
- NOI;
- cap rate;
- cash-on-cash return;
- ROI;
- vacancy/reserve sensitivity;
- side-by-side property comparison;
- 1031 replacement comparison.

Current taxes, transaction costs, fees and other changing rules must use current verified/effective-date rules or explicit assumptions rather than timeless hard-coded values.

AI may explain deterministic results but may not silently change formulas or inputs.

---

# 8. MARKETING / E-BLAST

Marketing is connected to canonical Listing, Search, Party and Opportunity records.

```text
LISTING / BUSINESS OBJECTIVE
↓
MARKETING PLAN
↓
CAMPAIGN / E-BLAST / SHARE
↓
AUDIENCE
↓
DELIVERY
↓
ENGAGEMENT
↓
LISTING REPORTING / CLIENT HISTORY
↓
SYSTEM INTELLIGENCE
```

## 8.1 Audience

Where appropriate and authorized, audiences may come from:

- matching Buyer Saved Searches;
- matching Tenant Saved Searches;
- selected clients/prospects;
- cooperating-agent audiences;
- prior viewers/engaged recipients;
- other approved segments.

Do not create a second marketing contact database.

## 8.2 E-blast / listing sends

Search should be able to produce a reviewed recipient set from canonical Client Opportunities/Saved Searches.

Delivery and engagement history attach back to the relevant Client/Opportunity/Listing when known.

Client-safe transforms apply before sending.

## 8.3 Historical publication

A previously sent email/campaign remains a historical publication. Live Mallan links/cards may resolve current canonical listing data according to audience permissions.

---

# 9. LISTINGS REPORTING SYSTEM

Listings Reporting is a first-class brokerage system for Mallan-authored sale and rental listings.

It is not merely a grid of internal metrics.

```text
LISTING
├── website/search visibility
├── marketing activity
├── e-blasts
├── listing sends/shares
├── inquiries/saves where tracked
├── open houses
├── showings
├── feedback
├── offers/applications
├── price/status changes
├── CMA/market movement
└── distribution state / data gaps
        ↓
LISTING REPORTING
```

## 9.1 Report-author identity — hard rule

A client-facing Listing Report identifies only the **Mallan Agent/Broker who created the report**.

The report must never display or serialize the underlying Cotality/source:

- listing agent;
- co-list agent;
- listing office professional attribution;
- source agent email/phone/member ID;
- other source professional information.

This applies to Seller reports, Landlord reports, emailed/downloaded reports, portal reports and AI-generated client report narratives.

Report-author identity and source listing-professional identity are separate concepts.

## 9.2 Report creator snapshot

A historical report should retain the creator identity/title used at that time so a later profile change does not rewrite an already-issued report.

## 9.3 Seller report design

A polished Seller report should lead with decision-useful presentation rather than engineering diagnostics.

Suggested client structure:

1. Property / reporting period / Prepared by
2. Executive summary
3. Headline activity metrics
4. Marketing activity performed
5. Website/client engagement trends
6. Showings / open houses
7. Feedback themes
8. Offers / material activity
9. Market position / competition / new relevant evidence
10. Agent assessment / recommended next steps

Charts/funnels may be used when the underlying measurement is real.

Example funnel:

```text
Views
↓
Saves / Inquiries
↓
Showings
↓
Offers
```

## 9.4 Landlord report design

Landlord reporting remains separate and may emphasize:

- views;
- inquiries;
- listing sends;
- showings;
- applications;
- qualified/application progress where appropriate;
- rental competition;
- asking-rent changes;
- lease progress;
- Agent assessment/next actions.

Do not reuse a Seller report with labels changed.

## 9.5 Truth and data gaps

Internally, every metric retains provenance such as tracked Mallan activity, tracked campaign, Agent-entered, current provider source, external presence, market proxy or not tracked.

Client presentation should remain clean and understandable. Do not make engineering provenance labels the dominant client design.

Never display a fabricated zero when the truthful state is `Not tracked`.

## 9.6 Report versions

Support useful reporting periods such as:

- since launch;
- last 7/14/30 days;
- since last report;
- custom period;
- before/after a price change.

A report already delivered remains a historical version. New data creates a new version.

## 9.7 Reporting feeds action

```text
REPORT
↓
WHAT CHANGED / WHAT IS WORKING / WHAT IS NOT
↓
SYSTEM INTELLIGENCE
↓
AGENT ASSESSMENT
↓
OWNER / AGENT DECISION
↓
PRICE / MARKETING / NEXT ACTION
```

---

# 10. COMMUNICATIONS / COMMENTS / SHARE / DOCUMENTS / MEDIA

## 10.1 Communications

One communication history can attach to Party, Opportunity, Property, Listing, Search, CMA, Report, Showing, Offer/Application, Document and Transaction.

Visibility distinguishes at least:

- client-shared;
- participant-restricted;
- brokerage-internal;
- sensitive/legal where applicable.

## 10.2 Comments

Comments are a shared thread/timeline capability. Do not create separate Search notes, CMA notes and Report notes when they refer to the same canonical context.

## 10.3 Share

Share is a rendering/distribution capability, not another listing database.

It may render approved client-safe:

- listing;
- listing collection;
- Search collection;
- CMA;
- calculation scenarios;
- Listing Report.

## 10.4 Documents / agreements / amendments

One controlled document service supports Seller, Landlord, Buyer and Tenant agreements plus transaction/document needs.

Signed agreements are never silently edited.

A change to a signed agreement occurs through a versioned Amendment preserving:

- original agreement;
- what changed;
- previous term;
- new term;
- effective date;
- parties/signatures;
- audit history.

## 10.5 Media

Property/Listing media is shared canonical media with source/provenance, type, ordering, rights/authority and audience eligibility.

Search cards, listing pages, marketing and reports reference the same approved media identity rather than building separate media truth.

---

# 11. SELLER OPERATING JOURNEY

```text
Seller Party
↓
Seller Opportunity
↓
Property
↓
Sale Market Intelligence / CMA
↓
Decision / Net-Proceeds Analysis
↓
Representation / Exclusive
↓
Mallan-authored Sale Listing
↓
Frontend Search / Distribution
↓
Marketing / E-blast
↓
Open Houses / Showings / Feedback
↓
Listing Reporting
↓
System Intelligence / Agent Assessment
↓
Price / Marketing Decisions
↓
Offers / Net Scenarios
↓
Accepted
↓
Attorney / Due Diligence / Contract
↓
Financing or Cash / Building Process
↓
Walkthrough
↓
Closing
↓
Commission
↓
Post-close Relationship
```

Seller uses the same canonical Property, Listing, Media, Marketing, Reporting, Transaction and Commission systems.

---

# 12. LANDLORD OPERATING JOURNEY

```text
Landlord Party
↓
Landlord Opportunity
↓
Property
↓
Rental Market Intelligence / CMA
↓
Hold / Sell / Rental Analysis
↓
Representation / Exclusive
↓
Mallan-authored Rental Listing
↓
Frontend Search / Distribution
↓
Marketing / E-blast
↓
Showings / Feedback
↓
Listing Reporting
↓
System Intelligence / Agent Assessment
↓
Applications / Qualification / Guarantor
↓
Approval / Building Process
↓
Lease
↓
Move-in
↓
Commission
↓
Expiration / Renew / Re-rent / Seller Opportunity
```

Landlord reporting, rental CMA and rental transaction state remain separate from Seller.

---

# 13. BUYER OPERATING JOURNEY

```text
Buyer Party
↓
Buyer Opportunity
↓
Representation / Qualification / POF / Preapproval
↓
Backend Buyer Search
↓
Client-assigned Saved Search(es)
↓
New + Price/Status Market Updates
↓
Client × Listing History / Comments
↓
Listing Sends / Engagement
↓
Show / Discuss / Pass / Reconsider
↓
Showing
↓
CMA / Property Intelligence / Calculators
↓
Offer / Negotiation
↓
Accepted
↓
Attorney / Contract
↓
Financing / Building Process
↓
Walkthrough
↓
Closing
↓
Commission
↓
New Owner Relationship
```

Buyer Search must remember prior sends, views, showings, rejections and discussion so the Agent does not repeatedly send the same listing as though it were new.

---

# 14. TENANT OPERATING JOURNEY

```text
Tenant Party
↓
Tenant Opportunity
↓
Representation / Qualification
↓
Backend Tenant Search
↓
Client-assigned Saved Search(es)
↓
New + Price/Status Market Updates
↓
Client × Listing History / Comments
↓
Listing Sends / Engagement
↓
Show / Discuss / Pass / Reconsider
↓
Showing
↓
Rent Comparison / Rent-v-Buy
↓
Application / Financial Documents / Guarantor
↓
Approval / Building Process
↓
Lease
↓
Move-in
↓
Commission
↓
Expiration / Renew / Relocate / Buyer Opportunity
```

Buyer and Tenant remain separate role Opportunities and separate Saved Search histories even if the same Party holds both roles.

---

# 15. INVESTOR / 1031

Investor/1031 uses the same Party, Property, Backend Search, Property Intelligence, CMA, Decision and Comment systems with specialized analysis for acquisition, rent, NOI, cap rate, cash-on-cash return, ROI, financing, vacancy/reserves, hold/exit and 1031 replacement scenarios.

Do not create a separate investment-property truth.

---

# 16. AGENT SUPPORT / PROFESSIONAL OBLIGATIONS

Mallan should make it easy for each Agent to know what requires attention while leaving the individual independent contractor responsible for completing their own obligations.

## 16.1 My Professional Requirements

Agent My Business should show simple reminders/flags for applicable:

- NY license renewal;
- REBNY renewal;
- Continuing Education completion/renewal cycle;
- insurance renewal where required/applicable;
- required brokerage/REBNY training;
- outstanding compliance items.

Each item should show, where known:

- current status;
- due/expiration date;
- what is required;
- what has been submitted;
- what is missing;
- next action.

Mallan reminds and records; the Agent completes the obligation.

## 16.2 Professional title / online profile

License type is stored once and drives the correct public professional title.

Required public title behavior:

- Salesperson → **Licensed Real Estate Salesperson**
- Associate Broker → **Licensed Real Estate Associate Broker**
- Broker profile, where publicly displayed → **Licensed Real Estate Broker**

This matters for the Agent's online profile and future generated professional materials.

Associate Broker title does not create management authority inside Mallan.

## 16.3 Governed professional signature profile

One Agent professional profile supplies approved identity/contact/title information to, where applicable:

- online Agent profile;
- email signature;
- business card;
- letters;
- agreements;
- marketing pieces;
- e-blasts;
- CMA/report creator block.

Templates must not independently hard-code professional titles.

A future license-title change updates future materials; historical signed documents/reports remain historical snapshots.

## 16.4 Deal-document reminders / payment readiness

Mallan should remind the producing Agent to submit the required deal documents tied to the actual Transaction.

Examples:

### Sale

- signed contract;
- when closed: closed-deal form;
- commission invoice;
- check copy/notice or wire/payment confirmation as applicable.

### Rental

- signed lease;
- closed-deal form;
- commission invoice;
- check/wire/payment confirmation as applicable.

### Referral

- signed referral form/agreement;
- completion/closed information when applicable;
- referral/commission invoice;
- payment confirmation where applicable.

These are not miscellaneous uploads; they attach to the canonical Transaction/Referral.

A simple Payment Readiness state should answer:

```text
WHAT IS MISSING?
WHAT IS BLOCKING COMMISSION REVIEW?
HAS PAYMENT BEEN RECEIVED/CONFIRMED?
IS THE AGENT READY TO BE PAID?
```

Possible operating states:

- Not Ready
- Documents Outstanding
- Payment Not Received
- Ready for Commission Review
- Approved for Payment
- Paid

---

# 17. BROKERAGE VIEW — SIMPLE FIRM OVERSIGHT

Maya's Brokerage View should focus on exceptions/support rather than becoming an oversized management application.

Useful firm areas:

```text
Overview
Agents
Leads
Listings
Deals
Money
Compliance
Technology
```

Brokerage View may include:

- agent roster and license/CE/REBNY/insurance flags;
- brokerage-generated lead distribution/status;
- active Mallan listings;
- deals requiring broker support;
- representation/exclusive agreement status and amendments;
- transaction blockers/missing required documents;
- commission splits;
- referrals;
- commission-payment queue;
- brokerage revenue/receivables operating data;
- year-end payment/1099 operating records for accountant preparation;
- compliance/advertising exceptions;
- Agent performance/production;
- technology/RLS/provider flags.

Agents see their own business information in My Business. Maya sees firm-wide supervisory/operating context over the same records.

---

# 18. LEADS / PERFORMANCE / MONEY

## 18.1 Lead distribution

Brokerage-generated leads can enter a simple assignment queue with:

- source;
- assigned Agent;
- assignment date;
- accepted/declined/reassigned;
- response/follow-up;
- conversion.

Do not build unnecessary routing complexity until business needs require it.

## 18.2 Agent performance

Performance may include practical transparent measures such as:

- brokerage leads received/responded;
- representations signed;
- listings;
- transactions;
- GCI/production;
- listing-report/marketing completion;
- follow-up;
- compliance issues.

No opaque AI Agent score is required.

## 18.3 Commission / split / referral

Each Transaction can reference applicable:

- gross brokerage compensation;
- Agent compensation plan/split effective for the deal;
- brokerage share;
- referral amount;
- approved adjustments;
- Agent payout;
- payment status;
- tax year.

Compensation plans/splits are versioned because they may change over time.

Referral records link the referral agreement, Client/Opportunity, applicable Transaction, expected amount, payment and documentation.

## 18.4 Year-end tax operations

Mallan provides operational payment records for professional accounting/tax preparation, including payee, W-9/tax-document status where applicable, payment history, annual amount, tax year and 1099 preparation/status fields where appropriate.

Mallan does not replace the accountant or make final tax-law determinations.

---

# 19. TRANSACTIONS

Sale and rental transactions remain distinct.

## Sale

```text
Offer
→ Accepted
→ Attorneys / Due Diligence
→ Contract
→ Financing / Cash
→ Co-op/Condo Process where applicable
→ Walkthrough
→ Closing
→ Commission
```

## Rental

```text
Application
→ Documents / Qualification
→ Landlord Review
→ Approval
→ Co-op/Condo Process where applicable
→ Lease
→ Move-in
→ Commission
```

Required transaction documents, professional contacts, dates, communications, payment-readiness and commission status attach to the same canonical Transaction.

---

# 20. TECHNOLOGY / REBNY / RLS / PROVIDER GOVERNANCE

Technology governance should be rigorous while the human operating system stays simple.

Mallan must not architect the product as if Cotality will necessarily remain the RLS provider forever.

## 20.1 Provider-independent rule architecture

```text
REBNY / RLS BUSINESS RULE
        ↓
MALLAN RULE / FIELD REGISTRY
        ↓
PROVIDER ADAPTER
        ↓
CURRENT PROVIDER — COTALITY TODAY
```

If REBNY later changes provider:

```text
MALLAN RULE / FIELD REGISTRY
        ↓
NEW PROVIDER ADAPTER
        ↓
NEW PROVIDER
```

The brokerage workflows and canonical Mallan entities should not require a wholesale rewrite.

## 20.2 Cotality does not define Mallan's internal model

Cotality field names/picklists/statuses/permissions/IDs/media shapes are translated through the provider adapter into stable Mallan contracts.

Frontend Search, Backend Search, CMA, Marketing and Reporting must not each invent their own provider-field mapping.

## 20.3 Rule / field registry

For material rules/fields track, as applicable:

- authority/source;
- effective date;
- verified date;
- provider;
- provider field/type/picklist/null behavior;
- Mallan meaning/behavior;
- public vs Agent use;
- transformation/mapping;
- affected systems;
- test/evidence;
- current status.

## 20.4 Regular monitoring

Mallan should regularly scan/verify authoritative REBNY/RLS and current-provider sources for changes affecting:

- RLS/UCBA rules;
- listing distribution/display;
- statuses;
- fields/types/picklists;
- permissions;
- attribution;
- address handling;
- media;
- endpoints/authentication;
- technical-provider changes/deprecations.

Detected changes create reviewable Technology/Compliance flags rather than silently changing production behavior.

## 20.5 Technology flags

Useful flag classes include:

```text
RLS_RULE_CHANGED
UCBA_RULE_CHANGED
PROVIDER_CHANGED
PROVIDER_SCHEMA_CHANGED
FIELD_ADDED
FIELD_REMOVED
FIELD_TYPE_CHANGED
FIELD_MEANING_CHANGED
PICKLIST_CHANGED
STATUS_CHANGED
ATTRIBUTION_RULE_CHANGED
DISPLAY_RULE_CHANGED
ADDRESS_RULE_CHANGED
MEDIA_RULE_CHANGED
PERMISSION_RULE_CHANGED
ENDPOINT_CHANGED
AUTHENTICATION_CHANGED
DEPRECATION_NOTICE
MAPPING_DRIFT
UNVERIFIED_PROVIDER_BEHAVIOR
```

Every flag identifies affected Mallan systems such as Frontend Search, Backend Search, Listing Detail, Listing Entry, CMA, Marketing, Reporting, Client Share, Media, Sync and tests.

## 20.6 Change workflow

```text
CHANGE DETECTED
↓
CAPTURE AUTHORITATIVE EVIDENCE
↓
CLASSIFY / IMPACT MAP
↓
FLAG
↓
REVIEW
↓
IMPLEMENT CORRECTION
↓
CONTRACT / REGRESSION TEST
↓
DEPLOY WHEN AUTHORIZED
↓
PRODUCTION VERIFY
↓
UPDATE REGISTRY
↓
CLOSE FLAG
```

Unknown changes affecting public eligibility, attribution, status mapping or other critical rules must fail safely rather than be guessed.

## 20.7 Provider replacement readiness

If REBNY changes provider, the replacement process must inventory and validate:

- identity;
- fields;
- statuses;
- permissions;
- attribution;
- media;
- relationships;
- frontend contract;
- backend professional contract;
- reconciliation/cutover.

The old adapter is retired only after the new provider contract is proven.

---

# 21. SYSTEM INTELLIGENCE

System Intelligence is the cross-system analytical layer, not a separate AI database.

It consumes real canonical events from Search, Listings, Marketing, Reports, Showings, Comments, Offers/Applications, Transactions, compliance and technology.

Its job is to answer:

```text
WHAT CHANGED?
WHAT NEEDS ATTENTION?
WHAT IS AT RISK?
WHAT SHOULD THE AGENT OR BROKER REVIEW NEXT?
```

Examples:

- Seller listing engagement declined;
- new comp changed pricing context;
- Buyer repeatedly engaged with one listing;
- rejected listing dropped materially in price → Reconsider;
- Saved Search property went In Contract/Closed/Rented;
- report due;
- signed contract/lease/referral form missing;
- commission blocked by missing invoice/payment confirmation;
- Agent license/CE/REBNY/insurance renewal approaching;
- RLS/Cotality field or attribution rule changed.

Every signal must be explainable from underlying evidence.

AI may help explain/draft recommendations but may not invent facts, silently change canonical data, alter formulas, send without authorization or make binding legal/tax decisions.

---

# 22. COMPLIANCE / PROFESSIONAL REFERENCE

Agent-facing compliance should remain practical.

It may provide/remind on:

- applicable REBNY/RLS/UCBA requirements;
- NY Department of State licensing requirements;
- brokerage policies/workflow checklists;
- approved agreements/forms;
- advertising/professional-title rules;
- effective dates/links to authoritative sources.

Agents are not responsible for Cotality API/schema/ingestion plumbing.

Technical rules belong to the Technology/Rule Registry and provider adapter.

---

# 23. REQUIREMENT / DOCUMENT GOVERNANCE

There is one master product/system plan: this file.

Operational issue/handoff documents may describe current state only.

Historical plans/audits/specifications become reference/evidence after valid requirements are absorbed.

Every new requirement must be reconciled into this same plan rather than creating another Search plan, CMA plan, Reporting plan, Brokerage plan or Technology addendum.

Implementation requirements should identify, as applicable:

- role/domain;
- canonical entity/service;
- source authority;
- producer/writer;
- downstream reader/consumer;
- UX location;
- permission/compliance rule;
- current implementation path;
- duplicate/competing implementation;
- acceptance test;
- production proof.

A capability is not `fixed` because code exists or CI is green.

Use proof states such as:

- Implemented — Unverified
- Merged — Not Production Verified
- Production Verified
- Blocked
- Superseded

---

# 24. DEVELOPMENT SEQUENCE — ONE CONTINUOUS PROGRAM

Do not split these phases into separate master plans.

## Phase 0 — Consolidation / recovery

- preserve/reconcile useful historical requirements/work;
- keep one authorized repository/workspace;
- absorb valid requirements into this file;
- identify duplicates/retirements;
- maintain one active implementation line at a time.

## Phase 1 — Listing identity / source authority / provider contract

- Mallan-authored vs third-party Cotality vs Cotality return-copy;
- canonical Property/Listing identity;
- provider field/rule registry;
- public vs Agent visibility boundaries;
- future outbound publishing architecture.

## Phase 2 — Search P0

### Frontend

Preserve → verify → correct → certify.

Prove public eligibility, return-copy suppression, filters, counts, pagination, map/results, media and client-safe payloads.

### Backend Agent Search

Reconstruct/repair the professional Search contract:

1. inventory every Advanced Search field;
2. verify provider mapping/type/picklist/null semantics;
3. make Basic/mobile and Advanced/desktop use one normalized criteria contract;
4. remove silent unsupported fields;
5. correct filtering/dedupe/count/pagination;
6. make full criteria saveable;
7. assign Saved Search to Client + Buyer/Tenant Opportunity;
8. selecting Client/Search auto-populates criteria and recalls current inventory;
9. join Client × Listing history;
10. implement comments/timeline;
11. integrate view/showing history;
12. auto-send new listings + verified price changes + verified material status changes;
13. never auto-resend rejected/pass listings; route material changes to Reconsider;
14. preserve internal professional fields and client-safe transform boundaries;
15. connect selected listings directly to Compare/CMA.

## Phase 3 — CMA / Property Intelligence

Rebuild CMA on the corrected Backend Search/Property Intelligence universe:

Subject → Market Universe → Comp Selection → Adjustments → Strategy → Versioned Client Report.

## Phase 4 — Listing workspace / Marketing / E-blast / Reporting

Unify Mallan-authored listing editing, media, marketing, Search distribution, activity, reports, offers/applications and distribution/reconciliation.

Build polished separate Seller and Landlord reports using real measured data.

## Phase 5 — Decision / Calculators / System Intelligence

Connect deterministic scenarios to real Property/Listing/Opportunity context and make intelligence contextual across Search, reports and deals.

## Phase 6 — Role journeys

Complete end-to-end:

- Seller
- Landlord
- Buyer
- Tenant
- Investor/1031

without merging role semantics.

## Phase 7 — Agent support / Brokerage / Money / Technology

Complete professional reminders/profile, deal-document/payment readiness, lead distribution, commissions/referrals, brokerage exceptions and REBNY/RLS/provider monitoring.

## Phase 8 — Future Mallan → provider publishing

Only after Mallan-authored listing management and provider contract mapping are stable.

## Phase 9 — Historical retirement / final proof

Retire superseded code/docs/branches only after requirements and useful behavior are accounted for and the replacement is proven.

---

# 25. GLOBAL DEFINITION OF DONE

A capability is complete only when its end-to-end business handoff works.

## Search

Search is not complete until:

- visible professional criteria actually execute;
- Basic/mobile and Advanced/desktop preserve the same criteria truth;
- exact result/count/pagination semantics are proven;
- client Saved Search can be recalled by Client/Opportunity;
- prior sent/viewed/shown/rejected history is visible;
- comments remain historical;
- new listings auto-send when enabled;
- verified price changes auto-send when enabled;
- verified material status changes auto-send as clear Market Updates when enabled;
- rejected/pass listings never auto-resend and instead appear as Reconsider when materially changed;
- client-safe output strips internal professional data;
- selected results flow directly to Compare/CMA.

## CMA

CMA is not complete until:

- it consumes the same Backend Search/Property Intelligence universe;
- closed evidence uses verified close facts;
- Agent comp selection/adjustments are explainable;
- saved versions remain reproducible;
- source listing-agent information never leaks into the client report;
- the report shows only the Mallan report creator professional identity;
- Property → universe → selected comps → adjustments → conclusion → save → reopen → client-safe share works.

## Listing Reporting

Listing Reporting is not complete until:

- real listing, marketing, e-blast, website, send, inquiry, showing, feedback and offer/application data connect where tracked;
- Seller and Landlord reports remain separate;
- delivered versions are immutable snapshots;
- client presentation is polished/decision-useful;
- missing data is not fabricated;
- only the Mallan report creator identity appears;
- source listing agents/offices never serialize into the client report.

## Agent / Brokerage

Agent support is not complete until the Agent can see professional renewal reminders, correct governed public title, required deal documents and payment-readiness status from My Business.

Brokerage support is not complete until Maya can see the firm exceptions requiring attention without duplicate business records.

## Technology

Technology governance is not complete until Mallan can detect/review material REBNY/RLS/current-provider field/rule/attribution changes and the provider can be replaced through an adapter rather than rewriting the brokerage system.

## Role journeys

- Seller: opportunity → CMA → agreement → Mallan listing → marketing/reporting → offer → transaction → commission.
- Landlord: opportunity → rental analysis → agreement → Mallan rental listing → marketing/reporting → application → lease → commission.
- Buyer: opportunity → Saved Search → market updates/history → showing → CMA/calculation → offer → transaction → commission.
- Tenant: opportunity → Saved Search → market updates/history → showing → application → lease → commission.

No `Production Ready`, `Fixed`, `Compliant`, `Search Working`, `CMA Working` or equivalent claim is allowed without the applicable runtime/production proof.

---

# Current handoff

- This file remains the intended single canonical product/system authority on draft PR #595 and is still unmerged until explicitly approved.
- Search is the immediate product-design/implementation priority because the intended professional Search, Saved Search/client recall, history-aware auto-send and CMA dependency are not yet proven end-to-end.
- Current Search/CMA/Listing Report code must be audited against this target; existing routes/models are implementation evidence, not permission to create another parallel system.
- The current code already contains useful pieces such as SavedSearch, ClientListingAction, Showing, Comment/listing activity concepts and listing-send records. The target is to connect/reuse those where correct rather than automatically introduce another client-search-history database.
- Documentation changes in this branch do not authorize production mutations, schema changes or deployment.