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

Mallan should provide the brokerage platform, support, reminders, flags, records, required firm controls and broker visibility where supervision/support is required.

Mallan should not try to micromanage every independent contractor's business. The individual licensee remains responsible for meeting their own professional obligations.

## 2.3 Current role model

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

License type is stored because it controls the person's proper public professional title and applicable obligations.

---

# 3. CANONICAL SHARED FOUNDATION

```text
CANONICAL SHARED FOUNDATION
│
├── Brokerage
├── Agent / Licensee
├── Party — Individual(s) / Entity
├── Property — Building / Unit
├── Listing Episode
├── Source Observation
├── Seller Opportunity
├── Landlord Opportunity
├── Buyer Opportunity
├── Tenant Opportunity
├── Investor / 1031 Opportunity
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

Party identity remains separate from role. Property remains separate from Listing. A physical Property/Unit survives multiple listing episodes, ownership changes, leases, CMAs and client interest.

---

# 4. LISTING SOURCE, IDENTITY, EDIT AUTHORITY AND VISIBILITY

Mallan must keep four decisions separate:

1. **Identity** — what real Property/Unit/Listing Episode is this?
2. **Source** — who supplied this observation?
3. **Authority** — who may edit the canonical record?
4. **Visibility** — who may see/use/share it?

## 4.1 Mallan-authored listing

A listing created inside Mallan remains Mallan's canonical editable listing. Authorized Mallan agents/broker may amend it.

It connects to owner Party, Seller/Landlord Opportunity, Property/Building/Unit, agreements/amendments, media, marketing, e-blasts, open houses/showings, feedback, reports, offers/applications, transaction and commission.

Cotality must never silently overwrite Mallan-authoritative fields on a Mallan-authored listing.

## 4.2 Third-party Cotality listing

Third-party Cotality listings remain read-only source truth.

Agents may Search, save, compare, comment, attach to Buyer/Tenant Opportunities, send, schedule showings, use in CMA/Property Intelligence and use in calculators/offer scenarios. Those actions create Mallan-owned workflow records and never mutate the Cotality listing.

## 4.3 Cotality return-copy of a Mallan listing

When Cotality returns a copy of a Mallan-authored listing:

- resolve to the same canonical Mallan Listing Episode;
- retain Cotality observation internally for reconciliation/distribution evidence;
- suppress it as a duplicate from public Search/count/pagination/detail;
- keep Mallan as editable canonical record;
- do not create a second client/history identity.

Address alone is not sufficient evidence for automatic suppression. Uncertain identity goes to review.

## 4.4 Future Mallan → provider publishing

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

The provider adapter owns verified required fields, conditional rules, picklists, formatting, IDs and mapping.

---

# 5. SEARCH — IMMEDIATE P0 PROFESSIONAL OPERATING SYSTEM

Search is the first implementation layer to fix.

The problem is not that Advanced Search has too many criteria. Agents need exhaustive professional Search. The problem is that visible criteria, mappings, execution, counts, saved searches and client history are not yet one reliable system.

## 5.1 Separate Frontend and Backend Search products

### Frontend Consumer Search

Public inventory:

```text
ELIGIBLE MALLAN-AUTHORED LISTINGS
+
ELIGIBLE THIRD-PARTY COTALITY LISTINGS
-
COTALITY RETURN-COPIES OF MALLAN LISTINGS
```

Consumer payloads exclude internal/professional-only fields before serialization.

### Backend Agent Search

Backend Search is the full professional product and may expose verified professional information authorized for Mallan agents, including appropriate Cotality listing-professional information internally.

Third-party Cotality remains read-only. Mallan-authored listings remain editable through listing-management authority.

## 5.2 Basic mobile / Advanced desktop

```text
BASIC = mobile presentation
ADVANCED = full professional desktop Search
```

They are two presentations of the same Search criteria contract and engine.

A Saved Search created in Advanced desktop must retain all criteria when opened on mobile. Mobile may show a compact summary plus `Advanced Criteria Applied`; changing a visible mobile criterion may not erase hidden advanced criteria.

## 5.3 Exhaustive Advanced Search

Authorized agents must be able to Search from every legitimate professional perspective supported by verified current RLS/provider data, including where supported:

- listing/RLS ID;
- address/building/unit/ZIP;
- geography/neighborhood/borough/map area;
- sale/rental;
- price/rent and price changes;
- detailed status/activity/date criteria;
- bedrooms/bathrooms/rooms/size/floor;
- property/ownership/subtype;
- building characteristics;
- amenities/features;
- outdoor/views/parking/storage/accessibility;
- sale-specific criteria;
- rental-specific criteria;
- open houses;
- new-development/building criteria;
- professional listing office/agent criteria where authorized;
- market/comp criteria;
- other legitimate searchable fields verified from current provider contract.

Do not arbitrarily reduce professional Search.

## 5.4 Search field contract

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

Every criterion is either SUPPORTED, deliberately LOCAL/DERIVED with correct semantics, or UNAVAILABLE. Never render a control that is silently ignored.

## 5.5 Correct Search ordering

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

## 5.6 Saved Search belongs to Client + Opportunity

```text
AGENT
↓
CLIENT PARTY
↓
BUYER or TENANT OPPORTUNITY
↓
SAVED SEARCH
```

A Client may have multiple Saved Searches. Buyer and Tenant Saved Searches remain separate.

## 5.7 Select Client → recall Search automatically

Selecting the Client and Saved Search must:

1. load the correct Buyer/Tenant Opportunity;
2. auto-populate all criteria;
3. run current Search;
4. load current matching listings;
5. load Client × Listing history;
6. separate new opportunities from already-known properties.

The Agent must not re-enter the client's requirements each time.

## 5.8 Temporary edits versus saved criteria

Temporary Search changes must show as unsaved and offer Discard, Update Saved Search, or Save as New Search.

## 5.9 Client × Listing relationship memory

For an assigned Client, Search results combine current inventory with prior relationship history:

- sent;
- opened/viewed online;
- saved/liked;
- discuss;
- showing requested/scheduled/completed;
- passed/rejected;
- offer made;
- comments;
- material listing changes.

History attaches to canonical Listing identity, including Mallan/Cotality return-copy reconciliation.

## 5.10 Result organization

Useful groups include:

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

Old inventory does not disappear; it is organized.

## 5.11 Auto-send rules

A Client Saved Search may automatically send eligible matching updates for:

1. **NEW LISTINGS**
2. **VERIFIED PRICE CHANGES**
3. **MEANINGFUL VERIFIED STATUS CHANGES**

New Listing is a recommendation/match.

Price Change is an update to a known listing.

Status Change is clearly presented as a **Market Update**, not as a new listing.

Verified status updates may include, when supported by current RLS/provider mapping:

- Active → In Contract / Signed Contract;
- In Contract → Closed/Sold;
- Active Rental → Rented/Closed;
- In Contract → Back on Market;
- other material verified transitions.

These live updates let clients see the market move in real time through their own Saved Search.

## 5.12 Previously known listings may receive updates

Previously sent, viewed, liked, discussed or shown listings may be sent again automatically when a qualifying verified price/status change occurs, subject to Saved Search alert settings.

Each update is preserved historically.

## 5.13 Rejected/Pass exception

An explicitly rejected/passed listing is never automatically resent.

If it later changes materially:

```text
REJECTED + MATERIAL CHANGE
↓
RECONSIDER
↓
AGENT REVIEW
```

Show prior rejection date/reason/comment and old/new value or status. Agent may intentionally send again.

## 5.14 Comments are permanent Client × Listing memory

Use shared Comment history rather than one overwriteable note.

Comments may be internal Agent/Brokerage or client-shared and should remain a chronological timeline attached to Client + Opportunity + Listing.

## 5.15 Showings/client activity update Search automatically

```text
SCHEDULE SHOWING → SHOWING SCHEDULED
SHOWING COMPLETED → VIEWED IN PERSON
TRACKED CLIENT OPEN → VIEWED
```

No duplicate manual status maintenance.

## 5.16 Auto-send pipeline

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
├── NEW → auto-send eligible
├── PRICE CHANGE → update eligible
├── STATUS CHANGE → market-update eligible
└── REJECTED + CHANGE → RECONSIDER only
↓
CLIENT-SAFE TRANSFORMATION
↓
DELIVERY
↓
RECORD SEND / UPDATE EVENT
```

## 5.17 Client-facing payload boundary

Backend Agent Search may contain professional listing-agent/office information from Cotality. That information must be removed before client sends/portal/share/email where not permitted/appropriate. Do not hide it with CSS; do not serialize it.

## 5.18 Search acceptance

Search is not finished until Client selection recalls full Saved Search criteria, executes correctly, joins prior listing history, marks prior viewed/shown/rejected states, auto-sends new listings/price changes/status changes as configured, routes rejected material changes to Reconsider, preserves comments/history and feeds Compare/CMA directly.

---

# 6. CMA / PROPERTY INTELLIGENCE — SECOND PRIORITY

CMA is the next layer after Search and must be rebuilt properly on top of the same Backend Search/Property Intelligence universe.

CMA is not a second Search engine.

```text
BACKEND AGENT SEARCH / PROPERTY INTELLIGENCE
↓
SUBJECT PROPERTY
↓
ELIGIBLE MARKET UNIVERSE
↓
AGENT COMP SELECTION
↓
ADJUSTMENTS / ANALYSIS
↓
VALUE / PRICING STRATEGY
↓
VERSIONED CMA
↓
CLIENT-SAFE REPORT / SHARE / EMAIL
```

## 6.1 Professional CMA workflow

1. Subject Property + Client/Opportunity
2. Market Universe
3. Comp Selection
4. Adjustments / Analysis
5. Pricing / Value Strategy
6. Save Version
7. Preview
8. Share / Email / Client-safe Report

If the Property is already attached to a Seller/Landlord/Buyer/Tenant Opportunity, Mallan should prefill it rather than ask the Agent to type the address again.

## 6.2 Market universe

Sale CMA should distinguish relevant Closed, In Contract/Pending context and Active competition.

Rental CMA should distinguish relevant leased/rented evidence, pending/application/in-contract context where supported, and Active competition.

Agent may broaden/tighten using the same full professional Search contract.

## 6.3 Comp selection

Mallan may suggest comps but the Agent chooses the final comp set.

Each suggestion should explain why it is relevant, such as same building, same ownership/property type, similar beds/baths/size, recency and geography.

No unexplained black-box score as the only rationale.

## 6.4 Comp facts

Use verified facts. Do not substitute asking price for close price simply because close price is missing.

If another authorized source such as correctly matched ACRIS evidence is used, label its provenance rather than pretending it came from the provider close field.

## 6.5 Adjustments

Adjustments must be versioned, auditable and explainable. Do not use unreviewed timeless hard-coded percentage adjustments as the professional CMA engine.

Agent overrides require a reason/context and do not mutate canonical listing/property facts.

## 6.6 CMA result / strategy

CMA should distinguish evidence from Agent strategy.

Useful presentation can include:

- closed evidence range;
- adjusted comp range;
- active competition;
- market movement;
- Agent discussion range;
- role-specific strategy scenarios.

Mallan provides evidence and analysis support; the Agent owns the professional recommendation.

## 6.7 Versioning

Saved CMA retains subject Property/Unit, Opportunity, as-of date, comp/source IDs and snapshots, criteria/exclusions/selections, adjustments/method, range/strategy, creator, version and permissions/share state.

A later market change never silently rewrites a CMA already delivered. It can flag that the analysis is stale and allow a new version.

## 6.8 Client-facing CMA/report identity

Client CMA/report displays only the Mallan Agent/Broker who created the report.

**Underlying Cotality listing agent, co-list agent and source listing office must never appear or serialize into the client CMA/report.**

## 6.9 CMA actions

From Search and from an opened Backend Listing, authorized Agent should be able to:

- Add to CMA;
- Compare;
- choose subject/comp role;
- open existing CMA for the Client/Property;
- create a new version;
- preview;
- share/email approved client-safe output;
- comment/discuss internally where applicable.

## 6.10 CMA acceptance

CMA is not finished until Property → market universe → selected comps → adjustments → strategy → save → reopen → version → client-safe share/email works with verified data and no source professional leakage.

---

# 7. BACKEND LISTING WORKSPACE — THIRD PRIORITY

After Search and CMA, the current backend Listing experience must be rebuilt into a full professional working record.

The current backend cannot remain a limited row/form that forces the Agent to leave the listing to perform basic brokerage actions.

## 7.1 Every backend listing must open as a readable professional listing page

When an Agent clicks a listing from Search, Client history, CMA, Showing, Listing inventory or another backend surface, it must open a **full readable Listing Workspace**, not merely an edit form.

The Listing Workspace should display, according to source and permissions:

- full address/building/unit identity;
- listing price/rent;
- status and relevant dates;
- beds/baths/rooms/size/floor;
- property/ownership/type/subtype;
- charges/taxes/maintenance where verified/applicable;
- public remarks and other authorized listing facts;
- building/property features and amenities;
- open houses;
- listing history/status/price history where verified;
- full photo gallery;
- floor plans;
- video/3D/other authorized media;
- map/location context;
- internal source/provenance;
- authorized Cotality listing-professional information for Agent use;
- Client history when opened in Client context;
- comments/discussion;
- showings;
- CMA/Compare actions;
- Share/Email actions.

The Agent should be able to understand the property without opening a separate edit form or public website.

## 7.2 Full media experience

Backend listing detail must support a professional photo/media viewer:

- hero image;
- gallery;
- full-size/lightbox viewing;
- floor-plan viewing;
- video/3D where available and authorized;
- media ordering/source awareness where relevant.

A listing without readable media in the backend is not an acceptable professional Agent record.

## 7.3 Source-aware controls

### Third-party Cotality listing

Read-only source listing, but Agent can still:

- Save;
- Comment;
- attach to Client/Opportunity;
- Send/Email/Share client-safe version;
- Compare;
- Add to CMA;
- Schedule Showing;
- view Client history;
- review professional listing information internally.

No edit controls that imply Mallan can change the third-party source listing.

### Mallan-authored listing

Same professional readable workspace plus authorized controls for:

- Edit Listing;
- Media management;
- Marketing/E-blast;
- Open Houses;
- Listing Reporting;
- Offers/Applications;
- Documents;
- Distribution/reconciliation;
- listing amendment/history as applicable.

## 7.4 Listing workspace action bar

The primary Agent action bar should expose, according to context/permissions:

```text
SAVE
COMMENT
COMPARE
ADD TO CMA
SEND / EMAIL
SHARE
SCHEDULE SHOWING
ADD OPEN HOUSE
REFRESH LISTING
```

Mallan-authored listing may additionally expose:

```text
EDIT LISTING
MEDIA
MARKETING
REPORTS
OFFERS / APPLICATIONS
DOCUMENTS
DISTRIBUTION
```

These are contextual actions on the same canonical Listing.

## 7.5 Share / Email from backend

Agent must be able to share/email a listing directly from the Backend Listing Workspace without copying information into another tool.

Flow:

```text
BACKEND LISTING
↓
SELECT CLIENT / RECIPIENT OR SHARE METHOD
↓
CLIENT-SAFE TRANSFORMATION
↓
PREVIEW
↓
SEND / EMAIL / SHARE LINK
↓
RECORD DELIVERY IN CLIENT × LISTING HISTORY
```

For Cotality listings, internal listing-agent/office professional information must be removed from the client output as required by the client-safe boundary.

The send event becomes part of the same Client × Listing history used by Saved Search.

## 7.6 Comment from backend

Agent must be able to add/view contextual comments directly from the Listing Workspace.

When a Client is selected, comments can attach to Client + Opportunity + Listing and become visible in that Client's Search/listing history.

Internal comments remain internal; client-shared comments use the shared visibility rules.

## 7.7 CMA from backend

Agent must be able to open CMA/Compare directly from the Listing Workspace.

Possible actions:

- Use as Subject Property;
- Add as Comp;
- Compare with selected listings;
- Open Client's existing CMA;
- Create CMA for a Seller/Landlord/Buyer/Tenant context where appropriate.

Do not make Agent re-find the same property in a separate CMA Search.

## 7.8 Quick Add Open House — no full listing form required

For a Mallan-authored listing where the Agent has authority, the Listing Workspace must provide a **Quick Add Open House** action.

The Agent should not need to reopen the entire Sale/Rental listing form just to add an open house.

A compact Open House action/modal should capture only the required open-house fields, subject to current verified RLS/provider and Mallan rules, such as applicable:

- date;
- start time;
- end time;
- open-house type/format;
- public/appointment instructions where allowed;
- registration/notes where applicable;
- source/distribution state.

On save:

```text
LISTING
↓
OPEN HOUSE EVENT CREATED
↓
LISTING WORKSPACE UPDATED
↓
MARKETING / CLIENT MATCH / REPORTING EVENTS UPDATED AS APPLICABLE
↓
PROVIDER PUBLISH/UPDATE QUEUE WHEN FUTURE OUTBOUND PUBLISHING IS ENABLED
```

The exact fields and distribution behavior must be verified from the current provider/RLS contract before implementation.

For third-party Cotality listings, Mallan must not create or modify a source open house as though Mallan were the listing broker. Agent may only schedule internal/client showing-related workflow as permitted.

## 7.9 Refresh Listing — explicit professional action

The Backend Listing Workspace must include **Refresh Listing** so the Agent can request the latest verified source observation without recreating/reopening the listing form.

### Third-party Cotality listing refresh

```text
REFRESH LISTING
↓
FETCH LATEST CURRENT PROVIDER OBSERVATION
↓
VERIFY IDENTITY
↓
COMPARE WITH CURRENT MALLAN OBSERVATION
↓
UPDATE READ-ONLY SOURCE VIEW / HISTORY
↓
FLAG MATERIAL PRICE / STATUS / MEDIA / FIELD CHANGES
↓
REEVALUATE SAVED SEARCH / CLIENT UPDATE RULES AS APPLICABLE
```

Refresh must not mutate Cotality.

### Mallan-authored listing refresh/reconcile

For a Mallan-authored listing, Refresh means rechecking relevant current source/distribution observations and reconciliation state while preserving Mallan as the canonical editable listing.

```text
MALLAN LISTING
↓
REFRESH / RECONCILE EXTERNAL OBSERVATION
↓
LINK RETURN-COPY
↓
COMPARE EXTERNAL IDS / STATUS / DISTRIBUTION / FIELDS
↓
FLAG DRIFT OR CONFIRM MATCH
```

Cotality return values must not silently overwrite Mallan-authoritative fields.

## 7.10 Refresh must produce visible change intelligence

After Refresh, the Agent should see a concise result such as:

```text
REFRESHED JUST NOW
Price: unchanged
Status: Active → In Contract
Photos: 2 added
Open House: new event
Source: Cotality
```

or:

```text
NO MATERIAL CHANGE
Last verified: 10:42 AM
```

Material verified price/status changes may feed the Saved Search auto-update rules. Rejected listings still follow the Reconsider exception.

## 7.11 Mallan-authored Listing Workspace organization

A practical structure can be:

```text
OVERVIEW
DETAILS / EDIT
MEDIA
MARKETING
ACTIVITY
OPEN HOUSES / SHOWINGS
CMA / MARKET
COMMENTS
REPORTS
OFFERS / APPLICATIONS
DOCUMENTS
DISTRIBUTION / HISTORY
```

The exact UI can be refined during design, but all functions remain tied to the same Listing.

## 7.12 Backend Listing acceptance

Backend Listings are not finished until an Agent can:

1. open any Search result as a full readable listing;
2. view all authorized facts and photos/media;
3. see verified current status/price/history;
4. Refresh Listing and see what changed;
5. save/attach it to the correct Client/Opportunity;
6. see prior Client × Listing history;
7. add/read comments;
8. schedule a showing;
9. Add to CMA / Compare without re-finding it;
10. preview and Send/Email/Share a client-safe version;
11. record that send back into Client history;
12. for Mallan-authored listings, edit authorized fields;
13. Quick Add Open House without opening the full listing form;
14. manage media/marketing/reports/offers/documents/distribution as applicable;
15. for third-party Cotality listings, remain strictly read-only at the source layer.

---

# 8. DECISION & CALCULATOR ENGINE

Mallan has one deterministic shared calculator/scenario engine across Seller, Landlord, Buyer, Tenant and Investor workflows.

Calculators normally open from the actual Property/Listing and prefill verified known facts.

Canonical facts and scenario overrides remain separate. Changing proposed price, financing or other assumptions never changes canonical Listing facts.

Role presets may expose Seller net proceeds, Buyer closing/cash-to-close, mortgage/payment, carrying cost, rent-v-buy, hold-v-sell, appreciation/equity, rental cash flow, NOI, cap rate, cash-on-cash, ROI, vacancy/reserve sensitivity, comparison and 1031 analysis.

Current taxes/fees/rules use current verified/effective-date sources or explicit assumptions. AI may explain results but not change formulas/inputs silently.

---

# 9. MARKETING / E-BLAST

Marketing connects Listing, Search, Party and Opportunity.

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

Audiences may come from matching Buyer/Tenant Saved Searches, selected clients/prospects, cooperating-agent audiences and other approved segments.

Do not create a second marketing contact database.

Search should be able to produce a reviewed recipient set. Delivery/engagement attaches back to Client/Opportunity/Listing where known.

---

# 10. LISTINGS REPORTING SYSTEM

Listings Reporting is a first-class system for Mallan-authored sale/rental listings.

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
└── distribution/data gaps
        ↓
LISTING REPORTING
```

## 10.1 Report-author identity — hard rule

A client-facing Listing Report identifies only the Mallan Agent/Broker who created the report.

The report must never display or serialize underlying Cotality/source listing agent, co-list agent, source listing office professional attribution, agent contact/member ID or other source professional information.

## 10.2 Seller report

Client report should be polished and decision-useful: Property/reporting period/Prepared by, executive summary, headline activity, marketing performed, engagement trends, open houses/showings, feedback themes, offers, market position and Agent assessment/next steps.

## 10.3 Landlord report

Separate rental-focused report emphasizing views, inquiries, sends, showings, applications/qualification where appropriate, rental competition, asking-rent changes, lease progress and Agent assessment.

## 10.4 Truth / versions

Do not fabricate missing metrics. `Not tracked` is different from zero.

Delivered reports remain immutable historical snapshots. New data creates a new version.

---

# 11. COMMUNICATIONS / COMMENTS / SHARE / DOCUMENTS / MEDIA

One communication/comment history attaches to canonical context. Share is a rendering/distribution capability, not another listing database. Documents support separate Seller/Landlord/Buyer/Tenant agreements and versioned amendments. Media remains canonical to Property/Listing with source/provenance/rights/order/audience eligibility.

---

# 12. SELLER OPERATING JOURNEY

```text
Seller Party
→ Seller Opportunity
→ Property
→ Sale CMA / Market Intelligence
→ Net-Proceeds / Decision Analysis
→ Representation / Exclusive
→ Mallan Sale Listing
→ Frontend Search / Distribution
→ Marketing / E-blast
→ Open Houses / Showings / Feedback
→ Listing Reporting
→ System Intelligence / Agent Assessment
→ Price / Marketing Decisions
→ Offers / Net Scenarios
→ Accepted
→ Attorney / Contract
→ Financing or Cash / Building Process
→ Walkthrough
→ Closing
→ Commission
→ Post-close Relationship
```

---

# 13. LANDLORD OPERATING JOURNEY

```text
Landlord Party
→ Landlord Opportunity
→ Property
→ Rental CMA / Market Intelligence
→ Hold/Sell/Rental Analysis
→ Representation / Exclusive
→ Mallan Rental Listing
→ Frontend Search / Distribution
→ Marketing / E-blast
→ Showings / Feedback
→ Listing Reporting
→ System Intelligence / Agent Assessment
→ Applications / Qualification / Guarantor
→ Approval / Building Process
→ Lease
→ Move-in
→ Commission
→ Expiration / Renew / Re-rent / Seller Opportunity
```

---

# 14. BUYER OPERATING JOURNEY

```text
Buyer Party
→ Buyer Opportunity
→ Representation / Qualification / POF / Preapproval
→ Backend Buyer Search
→ Client-assigned Saved Search(es)
→ New + Price/Status Market Updates
→ Client × Listing History / Comments
→ Listing Sends / Engagement
→ Show / Discuss / Pass / Reconsider
→ Showing
→ CMA / Property Intelligence / Calculators
→ Offer / Negotiation
→ Accepted
→ Attorney / Contract
→ Financing / Building Process
→ Walkthrough
→ Closing
→ Commission
→ New Owner Relationship
```

---

# 15. TENANT OPERATING JOURNEY

```text
Tenant Party
→ Tenant Opportunity
→ Representation / Qualification
→ Backend Tenant Search
→ Client-assigned Saved Search(es)
→ New + Price/Status Market Updates
→ Client × Listing History / Comments
→ Listing Sends / Engagement
→ Show / Discuss / Pass / Reconsider
→ Showing
→ Rent Comparison / Rent-v-Buy
→ Application / Financial Docs / Guarantor
→ Approval / Building Process
→ Lease
→ Move-in
→ Commission
→ Expiration / Renew / Relocate / Buyer Opportunity
```

---

# 16. INVESTOR / 1031

Investor/1031 uses the same Party, Property, Backend Search, Property Intelligence, CMA, Decision and Comment systems with specialized acquisition/rent/NOI/cap/cash-on-cash/ROI/financing/vacancy/hold/exit/1031 analysis.

---

# 17. AGENT SUPPORT / PROFESSIONAL OBLIGATIONS

Agent My Business should show reminders/flags for applicable license renewal, REBNY renewal, CE, insurance renewal, required training and compliance items.

License type drives public professional title:

- Salesperson → **Licensed Real Estate Salesperson**
- Associate Broker → **Licensed Real Estate Associate Broker**
- Broker profile where public → **Licensed Real Estate Broker**

One governed professional profile feeds online profile, email signature, business card, letters, agreements, marketing/e-blasts and report/CMA creator block where applicable.

Deal-document reminders attach to the Transaction/Referral, including signed contract, signed lease, signed referral agreement, closed-deal form, commission invoice and check/wire/payment confirmation as applicable.

Payment Readiness should make clear what is missing and whether Agent payout is ready for review/approved/paid.

---

# 18. BROKERAGE VIEW — SIMPLE FIRM OVERSIGHT

Useful areas:

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

Maya should see firm exceptions: agent professional-renewal flags, lead distribution, active Mallan listings, deals needing broker support, agreement/amendment status, missing transaction documents, commissions/referrals/payment queue, brokerage operating revenue/receivables, accountant-ready annual payment records, compliance/advertising exceptions, Agent production/performance and technology/RLS/provider flags.

---

# 19. LEADS / PERFORMANCE / MONEY

Brokerage-generated leads use a simple assignment history: source, assigned Agent, date, accepted/declined/reassigned, response/follow-up and conversion.

Agent performance remains transparent/practical: leads, response, representations, listings, transactions, GCI/production, reports/marketing completion, follow-up and compliance issues.

Each Transaction can reference gross brokerage compensation, applicable Agent split/plan, brokerage share, referral, approved adjustments, payout, payment status and tax year. Compensation plans are versioned.

Mallan provides operational year-end payment records for accounting/tax preparation; it does not replace the accountant.

---

# 20. TRANSACTIONS

Sale:

```text
Offer → Accepted → Attorneys / Due Diligence → Contract → Financing / Cash → Building Process → Walkthrough → Closing → Commission
```

Rental:

```text
Application → Documents / Qualification → Landlord Review → Approval → Building Process → Lease → Move-in → Commission
```

Required documents, professional contacts, dates, communications, payment-readiness and commission status attach to the same canonical Transaction.

---

# 21. TECHNOLOGY / REBNY / RLS / PROVIDER GOVERNANCE

Technology governance is rigorous while the human operating system stays simple.

```text
REBNY / RLS BUSINESS RULE
↓
MALLAN RULE / FIELD REGISTRY
↓
PROVIDER ADAPTER
↓
CURRENT PROVIDER — COTALITY TODAY
```

If REBNY changes provider, Mallan should pivot through a new provider adapter rather than rewrite brokerage workflows.

Cotality fields/picklists/statuses/permissions/IDs/media shapes translate into stable Mallan contracts. Frontend Search, Backend Search, CMA, Marketing and Reporting may not invent their own provider mappings.

Mallan should regularly scan/verify authoritative REBNY/RLS/current-provider sources for rule, field, type, picklist, status, permission, attribution, address, media, endpoint/authentication and provider/deprecation changes.

Useful flags include:

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

Every flag identifies affected Mallan systems and requires evidence → impact map → review → correction → regression/contract test → authorized deploy → production verification → registry update.

Unknown changes affecting public eligibility, attribution, status mapping or critical rules fail safely rather than being guessed.

---

# 22. SYSTEM INTELLIGENCE

System Intelligence consumes real canonical events. It answers what changed, what needs attention, what is at risk and what the Agent/Broker should review next.

Examples: listing engagement decline, new comp changes pricing context, Client high-interest behavior, rejected listing materially changed → Reconsider, Saved Search listing goes In Contract/Closed/Rented, report due, missing signed deal document, commission blocked, professional renewal approaching, RLS/provider rule or field change.

Every signal must be explainable. AI may explain/draft but may not invent facts, silently change data/formulas, send without authorization or make binding legal/tax decisions.

---

# 23. REQUIREMENT / DOCUMENT GOVERNANCE

There is one master product/system plan: this file.

Operational issue/handoff documents may describe current state only. Historical plans/audits/specifications become reference/evidence after valid requirements are absorbed.

New requirements must be reconciled into this same file rather than creating another Search, CMA, Listings, Reporting, Brokerage or Technology plan.

Use proof states such as Implemented — Unverified, Merged — Not Production Verified, Production Verified, Blocked and Superseded.

---

# 24. DEVELOPMENT SEQUENCE — ONE CONTINUOUS PROGRAM

Do not split these phases into separate master plans.

## Phase 0 — Consolidation / recovery

Preserve/reconcile useful historical work, keep one authorized repository/workspace, absorb valid requirements, identify duplicates/retirements and maintain one active implementation line at a time.

## Phase 1 — Listing identity / source authority / provider contract

Settle Mallan-authored vs third-party Cotality vs return-copy, canonical identity, provider field/rule registry, public vs Agent boundaries and future outbound architecture.

## Phase 2 — SEARCH P0 — FIRST ACTIVE PRODUCT LAYER

1. inventory every Advanced Search field;
2. verify provider mapping/type/picklist/null semantics;
3. make Basic/mobile and Advanced/desktop one normalized criteria contract;
4. remove silent unsupported fields;
5. correct filtering/dedupe/count/pagination;
6. make full criteria saveable;
7. assign Saved Search to Client + Buyer/Tenant Opportunity;
8. Client/Search selection auto-populates criteria and current inventory;
9. join Client × Listing history;
10. implement comments/timeline;
11. integrate view/showing history;
12. auto-send new listings + verified price changes + verified material status changes;
13. rejected/pass listings never auto-resend; material changes → Reconsider;
14. preserve professional internal fields and client-safe transforms;
15. connect selected listings to Compare/CMA.

## Phase 3 — CMA P1 — SECOND ACTIVE PRODUCT LAYER

Rebuild CMA on corrected Backend Search/Property Intelligence:

Subject → Market Universe → Comp Selection → Adjustments → Strategy → Versioned CMA → Preview → Share/Email.

No independent reduced comp-search engine.

## Phase 4 — BACKEND LISTINGS P2 — THIRD ACTIVE PRODUCT LAYER

Rebuild Backend Listing Workspace so every listing opens as a full readable professional record with photos/media and contextual actions.

Required:

- full readable details;
- photo gallery/floorplan/video/3D where available;
- source/provenance and authorized professional info internally;
- Client × Listing history;
- Comments;
- Save/Attach to Client;
- Schedule Showing;
- Compare/Add to CMA;
- Share/Email client-safe version;
- Quick Add Open House for authorized Mallan-authored listings without full form;
- Refresh Listing / source reconciliation;
- Mallan-authored Edit/Media/Marketing/Reports/Offers/Documents/Distribution controls;
- third-party Cotality source remains read-only.

## Phase 5 — Marketing / E-blast / Listing Reporting

Connect actual Search/listing/client/marketing/showing data and build polished separate Seller/Landlord reports.

## Phase 6 — Decision / Calculators / System Intelligence

Connect deterministic scenarios and contextual intelligence to real workflows.

## Phase 7 — Role journeys

Complete Seller, Landlord, Buyer, Tenant, Investor/1031 end-to-end without merging role semantics.

## Phase 8 — Agent support / Brokerage / Money / Technology

Complete professional reminders/profile, deal-document/payment readiness, lead distribution, commissions/referrals, brokerage exceptions and REBNY/RLS/provider monitoring.

## Phase 9 — Future Mallan → provider publishing

Only after Mallan-authored Listing Management and provider mapping are stable.

## Phase 10 — Historical retirement / final proof

Retire superseded code/docs/branches only after requirements/useful behavior are accounted for and replacement proven.

---

# 25. GLOBAL DEFINITION OF DONE

## Search

Not complete until professional criteria execute, Basic/Advanced preserve one criteria truth, result/count/pagination are correct, Client Saved Search recalls full criteria, prior history/comments are visible, new/price/status updates behave correctly, rejected listings go to Reconsider, client-safe output strips internal professional data and results feed Compare/CMA.

## CMA

Not complete until it uses the same Backend Search/Property Intelligence universe, uses verified facts, supports Agent-selected/explainable comps and adjustments, versions reproducibly, never leaks source listing-agent information into client output, shows only report creator identity and supports save/reopen/share/email end-to-end.

## Backend Listings

Not complete until any listing opens as a full readable professional record with authorized details and media; Agent can Refresh Listing, save/attach to Client, see history, comment, schedule showing, Add to CMA/Compare, Share/Email client-safe output; and authorized Mallan-authored listings support Edit plus Quick Add Open House without reopening the full listing form.

## Listing Reporting

Not complete until real listing/marketing/e-blast/website/send/showing/feedback/offer/application data connect where tracked, Seller/Landlord remain separate, reports are polished/versioned/truthful and only the Mallan report creator identity appears.

## Agent / Brokerage

Not complete until Agent sees professional renewal reminders, governed public title, required deal documents and payment-readiness; Maya sees firm exceptions over the same canonical records.

## Technology

Not complete until material REBNY/RLS/current-provider field/rule/attribution changes can be detected/reviewed and provider replacement occurs through an adapter.

No `Fixed`, `Production Ready`, `Compliant`, `Search Working`, `CMA Working`, `Listings Working` or equivalent claim without applicable runtime/production proof.

---

# Current handoff

- This file remains the intended single canonical product/system authority on draft PR #595 and is unmerged until explicitly approved.
- Immediate execution order is now explicit: **Search first → CMA second → Backend Listings third**.
- Backend Listings requirement now includes full readable listing detail with photos/media, Comments, CMA/Compare, Share/Email, Client history, Showing actions, Quick Add Open House for authorized Mallan listings, and Refresh Listing/reconciliation.
- Existing Search/CMA/Listing code is implementation evidence, not design authority. Reuse existing SavedSearch, ClientListingAction, Showing, Comment, listing-send and Listing/media capabilities where correct instead of automatically creating parallel models.
- Documentation changes do not authorize production mutations, schema changes or deployment.