# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Single repository authority for the Mallan brokerage, agent, listing, search, CMA, marketing, reporting, transaction and technology operating system.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**.
- Repository scope: **`mallan67/mallan-nyc` only** unless Maya explicitly changes it.
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document is the single product/system plan. Audits, issue registries, PRs, technical notes, temporary ledgers and historical plans are evidence/reference only and may not become competing master plans.
- Production mutation remains held unless Maya separately authorizes it. Documentation, read-only verification, tests and design work do not authorize migrations, environment changes, destructive data work, R2 cleanup or manual Production deployment.
- Every listing/property/data statement used for implementation must be verified against the current authorized Cotality/RLS contract or another applicable authoritative source before it is treated as fact.
- Current REBNY/RLS/UCBA use/display rules, New York licensing/advertising requirements and the current Cotality implementation contract must be kept separate but reconciled. Cotality is the current provider implementation contract; it is not the brokerage business model.
- Cotality/Trestle may use RESO vocabulary in its technical schema. **RESO terminology is provider-schema language only; RESO is not a separate Mallan business/compliance authority.** Mallan business requirements are framed through applicable New York law/DOS, REBNY/RLS/UCBA and the verified current provider contract.
- This master is an **executable reconciled baseline**. Residual historical recovery/reconciliation continues as evidence work, but it is not a permanent global blocker. If recovered evidence proves that a still-valid requirement is missing or conflicts with an active layer, restore it here and reopen only the affected dependency.

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

Seller, Landlord, Buyer and Tenant remain four separate first-class opportunities and workflows. Investor/1031 uses the same canonical foundation with specialized analysis.

No new parallel client, property, listing, search, comment, media, document, campaign, CMA, calculator, transaction or commission truth may be created without an explicit migration/deduplication/retirement decision.

Before creating any new table/model/service that represents a real-world business object, answer:

1. What real-world thing does this represent?
2. Where is it represented today?
3. Why can the existing canonical record not be reused or extended?
4. What is the canonical ID?
5. Who writes it?
6. Who reads it?
7. What duplicate representation is retired?
8. How is existing history migrated/reconciled?
9. What end-to-end proof shows there is still one truth?

If those answers are not satisfactory, do not create the parallel model.

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

## 2.2 Independent contractors and supervision boundary

Mallan agents are independent contractors operating their own book of business inside Mallan's brokerage framework.

Mallan should provide the brokerage platform, support, reminders, flags, records, required firm controls and broker visibility where supervision/support is required.

Mallan should not try to micromanage every independent contractor's business. The individual licensee remains responsible for meeting their own professional obligations.

At the same time, independent-contractor status does not remove the representative broker's legally required responsibility for supervision of brokerage activity. The product rule is:

```text
AGENT
responsible for personal professional obligations and conduct

MALLAN
supports, reminds, records and flags

BROKER
retains required brokerage supervision/oversight
```

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

Associate Broker license status does **not** automatically create manager permissions. If Mallan later formally appoints an office manager/supervisory role, that role must be explicit and separately permissioned.

License type is stored because it controls the person's proper public professional title and applicable obligations.

## 2.4 Professional identity

Public/client-facing professional identity must use the governed license title from the person's verified professional record:

- Salesperson → **Licensed Real Estate Salesperson**
- Associate Broker → **Licensed Real Estate Associate Broker**
- Broker profile, when publicly displayed → **Licensed Real Estate Broker**

For Maya's internal Brokerage View, repeatedly displaying the full legal title is unnecessary; `Broker` / `Brokerage View` is sufficient internally.

One governed professional profile/signature supplies the current public identity to:

- online Agent Profile;
- email signature;
- business cards;
- letters;
- representation/exclusive agreements;
- approved marketing/e-blasts;
- client reports/CMA creator blocks where appropriate.

Do not independently hard-code professional titles across templates.

A later license/profile change updates future public/generated materials. Historical signed/sent documents remain immutable snapshots of what existed when they were executed/sent.

---

# 3. CANONICAL SHARED FOUNDATION

```text
CANONICAL SHARED FOUNDATION
│
├── Brokerage
├── Agent / Licensee
├── Party — Individual(s) / Entity
├── Contact Methods / Consent / Preferences
├── Professional Contacts / Organizations
├── Property — Building / Unit
├── Listing Episode
├── Source Observation
├── Seller Opportunity
├── Landlord Opportunity
├── Buyer Opportunity
├── Tenant Opportunity
├── Investor / 1031 Opportunity
├── Search / Saved Search
├── Client × Listing History
├── CMA / Property Intelligence
├── Decision / Calculator Scenarios
├── Communications / Comments
├── Documents / Agreements / Amendments
├── Media
├── Marketing / E-blast / Share
├── Listing Reports
├── Tasks / Calendar / Reminders
├── Offers / Applications
├── Transactions
├── Commissions / Referrals
├── Permissions / Consent / Visibility
├── Technology / Rule Flags
└── Audit / Provenance / History
```

Party identity remains separate from role. Property remains separate from Listing. A physical Property/Unit survives multiple listing episodes, ownership changes, leases, CMAs and client interest.

## 3.1 Party / entity rules

One Individual or Entity may hold multiple roles over time or simultaneously without duplicate identity.

Business-facing workflows must support one or more Individuals, an Entity, or both where applicable, including Seller, Landlord, Buyer, Tenant, Investor, Owner, Guarantor, Trustee, Executor and Authorized Signatory relationships.

Entity types may include LLC, LLP, Corporation, Partnership, Trust, Estate and Other where needed.

Entity/individual relationships may include trustee/co-trustee, executor, member, manager, partner, officer and authorized signatory where applicable.

## 3.2 Contact methods / consent / suppression

Individuals and Entities may have multiple emails, phone numbers and mailing addresses.

Preferred communication method is stored once and reused across opportunities, listings, deals and client delivery.

Contact consent, unsubscribe/suppression, permissions and share eligibility are centrally governed rather than copied independently into each campaign.

## 3.3 Professional contacts

Attorneys/law firms, lenders/mortgage professionals, managing agents and other reusable transaction professionals are canonical Parties/Organizations, not free-text copies inside every deal.

When a transaction reaches a stage requiring professional contacts, Mallan requests/confirms the relevant contacts and links them to the canonical Transaction.

---

# 4. LISTING SOURCE, IDENTITY, EDIT AUTHORITY AND VISIBILITY

Mallan must keep four decisions separate:

1. **Identity** — what real Property/Unit/Listing Episode is this?
2. **Source** — who supplied this observation?
3. **Authority** — who may edit the canonical record?
4. **Visibility** — who may see/use/share it?

## 4.1 Current source classes

```text
MALLAN_AUTHORED
COTALITY_THIRD_PARTY
COTALITY_RETURN_COPY
```

Authority classes:

```text
EDITABLE_CANONICAL
READ_ONLY_SOURCE
DERIVED_OBSERVATION
SUPPRESSED_RETURN_COPY
```

## 4.2 Mallan-authored listing

A listing created inside Mallan remains Mallan's canonical editable listing. Authorized Mallan agents/broker may amend it.

It connects to owner Party, Seller/Landlord Opportunity, Property/Building/Unit, representation/exclusive agreement and amendments, media, marketing, e-blasts, open houses/showings, feedback, reports, offers/applications, transaction and commission.

Cotality must never silently overwrite Mallan-authoritative fields on a Mallan-authored listing.

## 4.3 Third-party Cotality listing

Third-party Cotality listings remain read-only source truth.

Agents may Search, save, compare, comment, attach to Buyer/Tenant Opportunities, send, schedule showings, use in CMA/Property Intelligence and use in calculators/offer scenarios. Those actions create Mallan-owned workflow records and never mutate the Cotality listing.

## 4.4 Cotality return-copy of a Mallan listing

When Cotality returns a copy of a Mallan-authored listing:

- resolve it to the same canonical Mallan Listing Episode;
- retain the Cotality observation internally for reconciliation/distribution evidence;
- suppress it as a duplicate before public Search count/pagination/detail;
- keep Mallan as the editable canonical record;
- do not create a second Client × Listing history identity.

Address alone is not sufficient evidence for automatic suppression. Uncertain identity goes to review.

## 4.5 Historical/supplemental inventory boundary

Historical StreetEasy/external-inventory/sponsor-directory plans are **not** automatically part of the current canonical inventory model merely because an old spec/ledger mentions them.

If Maya later reauthorizes a supplemental source, it must enter through the same canonical Property/Listing identity system as a source observation with explicit source rights, visibility, dedupe and client-share rules. It may not silently become public inventory or create a second listing truth.

Current implementation planning must therefore not infer a StreetEasy/scraper/sponsor feed requirement unless it is explicitly reopened and verified.

## 4.6 Future Mallan → provider publishing

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

Inbound provider return data links to the canonical Mallan listing and is reconciliation evidence; it never becomes authority to overwrite Mallan-authored fields.

---

# 5. SEARCH — IMMEDIATE P0 PROFESSIONAL OPERATING SYSTEM

Search is the first implementation layer to fix.

The problem is not that Advanced Search has too many criteria. Agents need exhaustive professional Search. The problem is that visible criteria, mappings, execution, counts, saved searches and client history are not yet one reliable system.

## 5.1 Separate Frontend and Backend Search products

### Frontend Consumer Search

Frontend Consumer Search already exists and should be **preserved, verified, corrected only where evidence proves a defect, and certified** rather than casually rebuilt.

Public inventory:

```text
ELIGIBLE MALLAN-AUTHORED LISTINGS
+
ELIGIBLE THIRD-PARTY COTALITY LISTINGS
-
COTALITY RETURN-COPIES OF MALLAN LISTINGS
```

Consumer payloads exclude internal/professional-only fields before serialization.

Frontend Consumer Search and Backend Agent Search may share low-level provider client/auth, field registry, normalization, identity/address/media/provenance and retry infrastructure, but they require separate DTOs, permissions, filter contracts, caches and tests.

### Backend Agent Search

Backend Search is the full professional product and may expose verified professional information authorized for Mallan agents, including appropriate Cotality listing-professional information internally.

Third-party Cotality remains read-only. Mallan-authored listings remain editable through Listing Workspace authority.

## 5.2 Basic mobile / Advanced desktop — preserve this distinction

```text
BASIC = mobile presentation
ADVANCED = full professional desktop Search
```

They are two presentations of the same Search criteria contract and engine.

A Saved Search created in Advanced desktop must retain all criteria when opened on mobile. Mobile may show a compact summary plus `Advanced Criteria Applied`; changing a visible mobile criterion may not erase hidden advanced criteria.

Mobile simplicity must never be implemented by deleting professional criteria from the canonical Saved Search.

## 5.3 Professional Search modes

The professional product should make the primary intent clear without reducing the field set:

```text
SALES
RENTALS
BUILDINGS
COMP SEARCH / MARKET RESEARCH
```

The exact labels may be refined during design, but Sale/Rental/Building/Comp intent must not be hidden inside one undifferentiated form.

## 5.4 Exhaustive Advanced Search

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
- other legitimate searchable fields verified from the current provider contract.

Do not arbitrarily reduce professional Search.

Advanced desktop may group or progressively disclose criteria for usability, but a legitimate supported professional filter may not become a dead/ignored control.

## 5.5 Search field contract

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

Every criterion is either:

- `SUPPORTED`;
- deliberately `LOCAL / DERIVED` with documented semantics; or
- `UNAVAILABLE`.

Never render a control that is silently ignored or silently broadens/narrows Search.

Unsupported criteria fail visibly and specifically.

## 5.6 Correct Search ordering

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
DETERMINISTIC SORT
↓
FINAL ELIGIBLE COUNT
↓
PAGINATION
↓
PRESENTATION ENRICHMENT / MEDIA
```

`total`, `hasMore` and pagination must describe the same final eligible/deduplicated universe the user actually sees. A pre-filter/pre-dedupe database count may not be represented as the final result total.

## 5.7 Desktop result experience

Advanced desktop Search should support a professional working layout:

```text
FILTERS / CRITERIA
|
RESULTS
|
MAP / LOCATION CONTEXT
```

Panels may collapse to preserve space.

A professional result card/list row should expose, where verified/applicable:

- hero image;
- address/building/unit;
- price/rent;
- status;
- beds/baths/rooms;
- size/$-per-unit-area where appropriate;
- ownership/property type;
- DOM/relevant dates;
- charges/taxes/maintenance where applicable;
- open house signal;
- verified listing office/agent for internal Agent use;
- source/history/provenance as appropriate.

Primary actions:

```text
VIEW
SAVE / ATTACH
COMPARE
ADD TO CMA
SEND
SCHEDULE SHOWING
```

Multi-select should support actions such as Compare, Add to CMA, Send to Client and Create/Update a reviewed client collection without creating duplicate Listing records.

## 5.8 Saved Search belongs to Client + Opportunity

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

Each Saved Search retains the full normalized criteria, owner Agent, client/opportunity, alert settings/frequency, created/updated history and applicable client-send permissions.

## 5.9 Select Client → recall Search automatically

Selecting the Client and Saved Search must:

1. load the correct Buyer/Tenant Opportunity;
2. auto-populate all criteria;
3. run current Search;
4. load current matching listings;
5. load Client × Listing history;
6. separate new opportunities from already-known properties.

The Agent must not re-enter the client's requirements each time.

## 5.10 Temporary edits versus saved criteria

Temporary Search changes must show as unsaved and offer:

- Discard Changes;
- Update Saved Search;
- Save as New Search.

Changing a temporary criterion may not silently mutate the client's stored requirement set.

## 5.11 Client × Listing relationship memory

For an assigned Client, Search results combine current inventory with prior relationship history:

- sent;
- opened/viewed online;
- saved/liked;
- discuss/maybe;
- showing requested/scheduled/completed;
- passed/rejected;
- offer/application made;
- comments;
- material listing changes.

History attaches to canonical Listing identity, including Mallan/Cotality return-copy reconciliation.

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
OFFER / APPLICATION / DEAL
```

Old inventory does not disappear; it is organized.

## 5.12 Auto-send rules

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

Previously sent, viewed, liked, discussed or shown listings may be sent again automatically when a qualifying verified price/status change occurs, subject to Saved Search settings.

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

## 5.16 Reverse matching

Search also supports the reverse question:

```text
LISTING
↓
WHICH BUYER / TENANT SAVED SEARCHES MATCH?
```

Reverse matching can drive Agent review, client sends and approved Marketing/E-blast audiences. It must use the same Saved Search criteria engine, permissions and canonical client records rather than a separate marketing match database.

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

## 5.18 Client-facing payload boundary

Backend Agent Search may contain professional listing-agent/office information from Cotality. That information must be removed before client sends/portal/share/email/report where the client-facing contract forbids it.

Do not hide prohibited/internal fields with CSS. **Do not serialize them into the client payload.**

## 5.19 Search acceptance

Search is not finished until:

- every professional criterion has a verified execution contract;
- Basic mobile and Advanced desktop preserve one criteria truth;
- final count/pagination match the final eligible/deduplicated inventory;
- Client selection recalls the correct Saved Search and full criteria;
- current results join prior Client × Listing history;
- prior viewed/shown/rejected states are visible;
- new/price/status auto-updates behave correctly;
- rejected material changes route to Reconsider;
- comments/history persist;
- reverse matching works from listing to client where authorized;
- client-safe output strips internal professional data;
- selected results feed Compare/CMA directly.

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

## 6.2 Subject Property

Subject facts come from the canonical Property/Unit and verified current source observations where applicable.

If the Agent overrides a subject fact for analysis, preserve the sourced canonical value and label the analysis override separately. An analysis assumption may not silently rewrite the Property/Listing.

## 6.3 Market universe

Sale CMA should distinguish relevant:

- Closed evidence;
- In Contract/Pending context;
- Active competition.

Rental CMA should distinguish relevant:

- leased/rented evidence;
- pending/application/in-contract context where supported;
- Active competition.

Agent may broaden/tighten using the same full professional Search contract.

## 6.4 Comp selection

Mallan may suggest comps but the Agent chooses the final comp set.

A professional comp table should show, where verified/applicable:

- property/address;
- status;
- ask/contract/close or rent evidence with clear provenance;
- relevant date;
- beds/baths/rooms;
- size;
- $/area where meaningful;
- property/ownership/type;
- DOM;
- Agent inclusion/exclusion state.

Each suggestion should explain why it is relevant, such as same building, same ownership/property type, similar beds/baths/size, recency and geography.

No unexplained black-box similarity score may be the only rationale.

## 6.5 Comp facts and source hierarchy

Use verified facts.

Do not substitute asking price for close price simply because close price is missing.

If another authorized evidence source such as correctly matched ACRIS evidence is used, label its provenance rather than pretending it came from the provider close field.

Underlying listing-professional information may be available internally where authorized, but it is not part of the client CMA/report identity.

## 6.6 Adjustments

Adjustments must be versioned, auditable and explainable.

Do not use unreviewed timeless hard-coded percentage adjustments as the professional CMA engine.

Adjustment rows should identify the factor, source/rationale, system-suggested value if any, Agent action and final accepted value.

Agent may Accept, Edit or Remove an adjustment. Manual adjustments require a reason/context.

Adjustment overrides do not mutate canonical listing/property facts.

## 6.7 CMA result / strategy

CMA should distinguish evidence from Agent strategy.

Useful presentation can include:

- closed evidence range;
- adjusted comp range;
- active competition;
- current market movement;
- Agent discussion range;
- Seller/Landlord/Buyer/Investor strategy scenarios where appropriate.

For Seller-side strategy, a useful discussion may distinguish competitive, market and aspirational positioning without pretending the system can guarantee an outcome.

Mallan provides evidence and analysis support; the Agent owns the professional recommendation.

## 6.8 Versioning

Saved CMA retains:

- subject Property/Unit;
- Client/Opportunity;
- as-of date;
- comp/source IDs and snapshots;
- market-universe criteria;
- exclusions/selections;
- adjustments/method;
- range/strategy;
- creator;
- version;
- permissions/share state.

A later market change never silently rewrites a CMA already delivered. It can flag that the analysis may be stale and allow a new version.

## 6.9 Client-facing CMA/report identity

Client CMA/report displays only the Mallan Agent/Broker who created the report, using the creator's governed professional profile/title snapshot.

**Underlying Cotality listing agent, co-list agent, source listing office, source professional email/phone/member ID and other source professional information must never appear or serialize anywhere in the client CMA/report.**

## 6.10 CMA actions

From Search and from an opened Backend Listing, authorized Agent should be able to:

- Add to CMA;
- Compare;
- choose Subject or Comp role;
- open existing CMA for the Client/Property;
- create a new version;
- preview;
- share/email approved client-safe output;
- comment/discuss internally where applicable.

## 6.11 CMA screen design

A practical professional sequence is:

```text
1 SUBJECT PROPERTY
2 MARKET UNIVERSE
3 COMP SELECTION
4 ADJUSTMENTS & ANALYSIS
5 PRICING / VALUE STRATEGY
6 PREVIEW / SAVE VERSION / SHARE
```

The Agent should always be able to see where a number came from and whether it is a sourced fact, system calculation, system suggestion or Agent assumption.

## 6.12 CMA acceptance

CMA is not finished until Property → market universe → selected comps → adjustments → strategy → save → reopen → version → client-safe preview/share/email works with verified data, reproducible history and no source-professional leakage.

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

No edit controls may imply Mallan can change the third-party source listing.

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
SAVE / ATTACH
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

Canonical facts and scenario overrides remain separate. Changing proposed price, financing or another assumption never changes canonical Listing facts.

Role presets may expose, where appropriate:

- Seller net proceeds;
- Buyer closing/cash-to-close;
- mortgage/payment;
- carrying cost;
- rent-v-buy;
- hold-v-sell;
- appreciation/equity;
- rental cash flow;
- NOI;
- cap rate;
- cash-on-cash;
- ROI;
- vacancy/reserve sensitivity;
- comparison;
- 1031 replacement analysis.

Current taxes, fees and regulatory assumptions use current verified/effective-date sources or explicit assumptions.

Saved analyses retain both sourced facts and explicit assumptions and attach to the same Party/Opportunity/Property/Transaction.

AI may explain results but not change formulas/inputs silently.

---

# 9. MARKETING / E-BLAST / SHARE

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
CONTENT / PREVIEW / APPROVAL
↓
DELIVERY
↓
ENGAGEMENT
↓
LISTING REPORTING / CLIENT HISTORY
↓
SYSTEM INTELLIGENCE
```

## 9.1 Marketing plan

A Mallan-authored listing supports a simple practical plan showing:

```text
COMPLETED
UPCOMING
RECOMMENDED
```

Marketing should not become a separate project-management system.

## 9.2 Campaign creation

A practical campaign flow asks:

1. Purpose
2. Audience
3. Content
4. Preview
5. Recipient Review
6. Send / Publish where authorized
7. Results

Purposes may include:

- New Listing;
- Price Change;
- Open House;
- Buyer Match;
- Tenant Match;
- Investor/1031;
- Follow-up;
- Custom approved message.

Audiences may come from:

- matching Buyer/Tenant Saved Searches;
- selected canonical clients/prospects;
- approved CRM segments;
- cooperating-agent audiences where appropriate;
- imported recipient sets where lawful/appropriate and deduped against consent/suppression rules.

Do not create a second marketing contact database.

Agents should not need to upload a spreadsheet for ordinary client-match e-blasts when Mallan already has the correct canonical recipients.

## 9.3 Search drives marketing

```text
LISTING / MATERIAL CHANGE
↓
REVERSE MATCH TO SAVED SEARCHES
↓
AGENT REVIEW WHERE REQUIRED
↓
CAMPAIGN / SEND
↓
CLIENT RESPONSE / ENGAGEMENT
↓
LISTING REPORTING
```

## 9.4 Marketing truth

Track only engagement Mallan actually receives from the delivery/channel stack, such as where available:

- queued;
- sent;
- delivered;
- bounced;
- opened;
- clicked;
- viewed;
- saved;
- inquiry;
- showing request;
- unsubscribed.

Do not invent engagement and do not display unknown as zero.

## 9.5 Snapshot versus live share

A sent email/message is an auditable snapshot of what was sent.

A reusable Mallan share page may render current canonical listing state when reopened, subject to permissions and source rights.

Published third-party social/email content cannot be falsely represented as automatically rewriting after delivery/publication. Mallan controls its own linked live share surface, not third-party caches/content already delivered.

## 9.6 Canonical listing-change event

A material canonical listing change should be consumable by:

```text
SEARCH
CLIENT ALERT EVALUATION
LIVE SHARE INVALIDATION / RE-RENDER
MARKETING FOLLOW-UP
LISTING REPORTING
SYSTEM INTELLIGENCE
```

No second editable price/status truth inside marketing assets.

---

# 10. LISTINGS REPORTING SYSTEM

Listings Reporting is a first-class system for Mallan-authored sale/rental listings.

```text
LISTING
├── website/search visibility
├── site/client activity
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
├── distribution/external presence
└── data gaps
        ↓
LISTING REPORTING
```

## 10.1 Internal report versus client report

The internal Agent/Broker reporting view may show provenance, data gaps, tracking gaps, source categories and technical/internal evidence needed to understand the report.

The client report is a polished client-safe decision product. It should not look like an engineering diagnostic page.

Engineering truth labels such as internal source/tracking enums belong in internal provenance, not as prominent client-facing design language.

## 10.2 Report-author identity — hard rule

A client-facing Listing Report identifies only the Mallan Agent/Broker who created the report.

The report must never display or serialize underlying Cotality/source listing agent, co-list agent, source listing office professional attribution, source agent contact information/member ID or other source professional information.

Store a report-author snapshot with creator ID, creator professional identity and created/sent timestamp so a historical report remains accurate even if the Agent's later profile changes.

## 10.3 Seller client report

A professional Seller Activity & Market Report should support:

### Cover / header

- listing/property hero image;
- property identity;
- reporting period;
- Prepared by the report creator Agent with governed title.

### Executive Summary

- concise Agent-approved narrative;
- headline KPIs where actually tracked;
- meaningful change versus prior reporting period where available;
- clear statement of what matters now.

### Marketing Activity

- what Mallan/Agent did;
- campaign/e-blast timeline;
- actual reach/engagement where tracked;
- open-house/showing promotion activity.

### Buyer / Market Engagement

Where tracked, show useful trends/funnel relationships such as:

```text
VIEWS → SAVES → INQUIRIES → SHOWINGS → OFFERS
```

Do not fabricate missing stages.

### Showing / Open House Feedback

- attendance/activity;
- anonymized feedback themes;
- follow-up state;
- editable Agent Assessment.

### Market Position

- relevant new competition;
- verified price changes;
- in-contract movement;
- closings/market evidence;
- current CMA/pricing context.

Search + CMA + Reporting must connect rather than use independent market datasets.

### Recommendation / Next Steps

System Intelligence may draft an evidence-based assessment. Agent reviews/edits/approves the recommendation before client delivery.

## 10.4 Landlord client report

Landlord reporting remains separate and rental-specific. Useful focus includes:

- views/interest where tracked;
- inquiries;
- sends;
- showings;
- applications/qualified-applicant progress where appropriate;
- marketing activity;
- rental competition;
- feedback themes;
- application/lease pipeline;
- rent position;
- Agent Assessment and recommendation.

Do not force Landlord reporting into Seller sale-report semantics.

## 10.5 Truth/provenance categories

Internally, every metric should be traceable to a truth category such as:

```text
VERIFIED MALLAN ACTIVITY
TRACKED CAMPAIGN
TRACKED E-BLAST
TRACKED SHOWING / OPEN HOUSE
CLIENT / AGENT ENTERED
COTALITY SOURCE
EXTERNAL PRESENCE
MARKET PROXY
NOT TRACKED
```

`NOT TRACKED` is not `0`.

## 10.6 Versions and delivery

Delivered reports remain immutable historical snapshots.

New data creates a new report version; it never rewrites what was already sent.

Report delivery/share/email is itself recorded in the canonical communication/report history.

## 10.7 AI/report narrative

AI may draft summaries and recommendations from verified report data, but the output must identify missing evidence rather than invent it and must be Agent-reviewed before client delivery.

The client report must never use AI as a pathway to reintroduce stripped source-professional fields.

---

# 11. COMMUNICATIONS / COMMENTS / SHARE / DOCUMENTS / AGREEMENTS / MEDIA

## 11.1 One communication history

Portal/system comments, approved email delivery, report sends, listing sends and other supported channels are communication events attached to one canonical history.

Communication attaches to the correct context, including as applicable:

- Party;
- Opportunity;
- Property;
- Listing;
- Search;
- CMA;
- Calculator scenario;
- Campaign;
- Report;
- Showing/Open House;
- Offer/Application;
- Agreement/Amendment;
- Transaction;
- Commission/Referral;
- Task.

Visibility classes include:

```text
CLIENT SHARED
PARTICIPANT RESTRICTED
BROKERAGE INTERNAL
SENSITIVE / LEGAL RESTRICTED
```

## 11.2 Comments

Comments are chronological history, not one overwriteable note.

An internal note remains internal. A client-shared comment must pass the client-safe boundary before delivery.

## 11.3 Share

Share is a permission-aware rendering/distribution capability over canonical records, not a second listing database.

## 11.4 Brokerage document library

One brokerage document library holds approved templates/forms rather than uncontrolled Agent copies scattered across the system.

It may include approved representation/exclusive agreements, disclosures, transaction forms and authorized property/building documents.

Agents may populate transaction-specific fields, but controlled broker/legal template language may not be silently edited. Controlled wording changes require an approved template/version or an authorized legal/broker workflow.

Every generated/signed document retains its template/version, parties, property/opportunity/transaction, dates, signer state and audit history.

## 11.5 Four agreement families — separate and first class

Mallan has four separate agreement families:

```text
SELLER REPRESENTATION / EXCLUSIVE
LANDLORD REPRESENTATION / EXCLUSIVE
BUYER REPRESENTATION / EXCLUSIVE
TENANT REPRESENTATION / EXCLUSIVE
```

Do not merge them into one generic agreement workflow if the parties, obligations, terms or downstream workflow differ.

A signed agreement is never silently mutated.

```text
ORIGINAL AGREEMENT
↓
AMENDMENT
↓
OLD TERM / NEW TERM
↓
EFFECTIVE DATE
↓
PARTIES / SIGNATURES
↓
CURRENT OPERATING TERMS
```

Preserve the original and every amendment.

## 11.6 Media

Media remains canonical to Property/Listing with source/provenance, rights/permission, ordering, type and audience eligibility.

Do not copy/re-publish external media merely because a URL exists. Media use must remain within the verified source/rights contract.

---

# 12. SELLER OPERATING JOURNEY

```text
Seller Party / Entity / Participants
→ Seller Opportunity
→ Property
→ Sale CMA / Market Intelligence
→ Net-Proceeds / Decision Analysis
→ Representation / Exclusive
→ Amendments as required
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
→ Deal Documents / Payment Readiness
→ Commission
→ Post-close Relationship
```

---

# 13. LANDLORD OPERATING JOURNEY

```text
Landlord Party / Entity / Participants
→ Landlord Opportunity
→ Property
→ Rental CMA / Market Intelligence
→ Hold/Sell/Rental Analysis
→ Representation / Exclusive
→ Amendments as required
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
→ Deal Documents / Payment Readiness
→ Commission
→ Expiration / Renew / Re-rent / Seller Opportunity
```

---

# 14. BUYER OPERATING JOURNEY

```text
Buyer Party / Entity / Participants
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
→ Attorney Capture / Confirmation
→ Accepted
→ Attorney / Contract
→ Financing or Cash / Building Process
→ Walkthrough
→ Closing
→ Deal Documents / Payment Readiness
→ Commission
→ New Owner Relationship
```

---

# 15. TENANT OPERATING JOURNEY

```text
Tenant Party / Entity / Participants
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
→ Deal Documents / Payment Readiness
→ Commission
→ Expiration / Renew / Relocate / Buyer Opportunity
```

---

# 16. INVESTOR / 1031

Investor/1031 uses the same Party, Property, Backend Search, Property Intelligence, CMA, Decision, Communication and Transaction systems with specialized acquisition/rent/NOI/cap/cash-on-cash/ROI/financing/vacancy/hold/exit/1031 analysis.

A 1031 workflow may specialize criteria and scenarios but may not create a separate property/search universe.

---

# 17. AGENT SUPPORT / PROFESSIONAL OBLIGATIONS / MY PROFILE

The system should make professional obligations visible and actionable without turning Mallan into an HR system.

## 17.1 My Professional Requirements

Agent My Business should show applicable:

- real-estate license type/number/status/expiration;
- license renewal due state;
- continuing-education completion/status;
- REBNY renewal/status/member identifier where relevant;
- insurance type/status/expiration/proof where applicable;
- required-training status;
- last verified date;
- next action/flag.

A practical dashboard shows:

```text
CURRENT STATUS
DUE DATE
DAYS REMAINING
REQUIREMENT
EVIDENCE SUBMITTED / COMPLETED
MISSING ITEM
NEXT ACTION
```

## 17.2 Reminders

Progressive reminder timing can be configured for practical intervals such as 90/60/30/15/7/1 days where appropriate; exact policy may vary by requirement and authoritative due date.

Useful flags include:

```text
LICENSE_RENEWAL_RISK
CE_DEADLINE_RISK
REBNY_RENEWAL_RISK
INSURANCE_EXPIRATION_RISK
REQUIRED_TRAINING_INCOMPLETE
```

## 17.3 Professional materials

One governed profile drives Online Profile and approved professional signature materials.

Agents may update appropriate self-service fields such as photo, public bio, contact information, languages and specialties, subject to governance/approval rules.

Regulated/governed fields such as license identity/status, broker/office association and other verified fields may not be freely overwritten when source/broker verification is required.

Changes retain history/approval evidence where applicable.

## 17.4 Deal-document reminders

Transaction/referral reminders include, as applicable:

- signed contract for a sale;
- signed lease for a rental;
- signed referral form/agreement;
- closed deal form;
- commission invoice;
- check/wire/payment notice or confirmation.

The Agent sees the specific missing item preventing commission processing/payment.

---

# 18. BROKERAGE VIEW — SIMPLE FIRM OVERSIGHT

Brokerage View is practical exception-based oversight, not corporate bureaucracy.

Primary areas:

```text
OVERVIEW
AGENTS
LEADS
LISTINGS
DEALS
MONEY
COMPLIANCE
TECHNOLOGY
```

Maya should see firm exceptions such as:

- agent professional-renewal flags;
- brokerage-generated lead distribution/status;
- active Mallan listings;
- deals needing support/supervision;
- Seller/Landlord/Buyer/Tenant agreement/amendment status;
- missing transaction documents;
- commissions/referrals/payment queue;
- brokerage operating revenue/receivables and accountant-ready annual payment records;
- compliance/advertising exceptions;
- practical Agent production/performance;
- REBNY/RLS/provider technology flags.

No Manager role is required to make Brokerage View work.

The Brokerage Technology area should summarize the current health of the rule/provider contract without exposing feed plumbing to ordinary Agents. Useful summary items include:

- RLS/rule set last verified;
- current provider;
- provider metadata last checked;
- open field/mapping/attribution/display flags;
- public Search contract status;
- Agent Search contract status;
- unresolved critical provider uncertainty.

---

# 19. LEADS / PERFORMANCE / MONEY / COMMISSIONS / REFERRALS

## 19.1 Brokerage leads

Brokerage-generated leads use a simple assignment history:

- source;
- assigned Agent;
- date;
- accepted/declined/reassigned;
- response/follow-up;
- conversion.

Do not overbuild lead routing when simple explicit assignment works.

## 19.2 Practical Agent performance

Useful performance is transparent and limited to what helps the business:

- leads/response;
- representations;
- listings;
- transactions;
- production/GCI where applicable;
- marketing/report follow-through;
- client follow-up;
- compliance/professional-requirement exceptions.

## 19.3 Commission truth

Each canonical Transaction can reference:

- gross brokerage compensation;
- applicable Agent split/plan;
- brokerage share;
- referral obligation;
- approved adjustments;
- expected Agent amount;
- payment receipt state;
- commission review/approval;
- Agent payout;
- paid date;
- tax year.

Compensation plans/splits are versioned. Do not assume one universal split.

Agent cannot silently edit broker-approved compensation terms.

Broker-approved adjustments retain immutable history.

## 19.4 Agent Money view

Agent My Business should make money status understandable:

```text
EXPECTED
DOCUMENTS OUTSTANDING
PAYMENT NOT RECEIVED
READY FOR COMMISSION REVIEW
APPROVED FOR PAYMENT
PAID
```

Each row should show, subject to permissions:

- property/deal/client;
- close/lease/completion date;
- gross compensation;
- split basis;
- referral if applicable;
- expected Agent amount;
- documents required/missing;
- payment received state;
- commission review state;
- payment status;
- paid date.

Agents should be able to access their transaction-linked commission statements/reports.

## 19.5 Brokerage Money queues

Useful Brokerage queues:

```text
DEALS MISSING DOCUMENTS
AWAITING PAYMENT
READY FOR COMMISSION REVIEW
APPROVED
PAID
```

Mallan provides operational accounting/payment records; it does not replace the accountant.

---

# 20. TRANSACTIONS / DEAL SUPPORT / PAYMENT READINESS

Sale:

```text
Offer
→ Accepted
→ Attorneys / Due Diligence
→ Contract
→ Financing or Cash
→ Building Process
→ Walkthrough
→ Closing
→ Deal Closeout Documents
→ Payment / Commission
```

Rental:

```text
Application
→ Documents / Qualification
→ Landlord Review
→ Approval
→ Building Process
→ Lease
→ Move-in
→ Deal Closeout Documents
→ Payment / Commission
```

## 20.1 Sale subflows

Financed sale may include mortgage application, appraisal, commitment/approval and related milestone tracking.

All-cash sale bypasses mortgage stages rather than displaying meaningless financing tasks.

Co-op transactions may include application/board package, review, interview/approval, walkthrough and closing.

Condo transactions may include applicable managing-agent/application/waiver/building processes, walkthrough and closing.

The exact workflow remains configurable by actual deal/property requirements.

## 20.2 Attorney/professional capture

Once an offer/deal requires attorneys or another transaction professional, Mallan should request/confirm the relevant canonical professional contacts rather than rely on repeated free text.

## 20.3 Transaction document checklist

Transaction type determines the applicable checklist.

Documents attach to the actual canonical Transaction/Referral, never a miscellaneous upload bucket with no deal context.

## 20.4 Payment readiness

A practical commission/payment-readiness chain is:

```text
NOT READY
→ DOCUMENTS OUTSTANDING
→ PAYMENT NOT RECEIVED
→ READY FOR COMMISSION REVIEW
→ APPROVED FOR PAYMENT
→ PAID
```

The Agent always sees the blocking reason/next action.

Canonical chain:

```text
TRANSACTION / REFERRAL
↓
SIGNED CONTRACT / LEASE / REFERRAL AGREEMENT AS APPLICABLE
↓
CLOSE / LEASE EXECUTION / REFERRAL COMPLETION
↓
CLOSED DEAL FORM
↓
COMMISSION INVOICE
↓
PAYMENT RECEIVED / CONFIRMED
↓
COMMISSION CALCULATION
↓
AGENT SPLIT + REFERRAL
↓
BROKER REVIEW
↓
AGENT PAYMENT
↓
COMMISSION STATEMENT
```

No unnecessary payout complexity. Overrides are explicit, authorized and audited.

---

# 21. TECHNOLOGY / REBNY / RLS / PROVIDER GOVERNANCE

Technology governance is rigorous while the human operating system stays simple.

## 21.1 Authority stack

```text
NEW YORK LAW / DOS REQUIREMENTS
+
REBNY / RLS / UCBA BUSINESS + USE / DISPLAY RULES
↓
MALLAN RULE REGISTRY
↓
MALLAN FIELD / SOURCE CONTRACT
↓
PROVIDER ADAPTER
↓
CURRENT PROVIDER — COTALITY / TRESTLE WHERE VERIFIED
↓
MALLAN STABLE SEARCH / LISTING / CMA / REPORTING CONTRACTS
```

The current provider does not define Mallan's business model.

If REBNY changes/replaces the provider, Mallan should pivot through a new provider adapter rather than rewrite brokerage workflows.

## 21.2 Provider contract verification

Cotality fields, picklists, statuses, permissions, IDs, expands and media shapes translate into stable Mallan contracts.

Frontend Search, Backend Search, CMA, Marketing and Reporting may not invent their own provider mappings.

Before treating a provider-dependent field/mapping/attribution rule as true, verify it against the current authorized Cotality/Trestle metadata, schema/payload and, where necessary, current authorized runtime behavior. Documentation examples alone do not prove a particular Mallan feed populates a field.

Provider metadata terms may be RESO-derived. That does not convert RESO into a separate Mallan business/compliance requirement.

## 21.3 Rule Registry

A governed rule record should identify at minimum:

- rule ID;
- authority/source;
- rule family — RLS/UCBA/DOS/NYS/provider/internal;
- current text/summary;
- effective/version date;
- last verified date;
- applicability;
- affected Mallan systems;
- implementation mapping;
- proof/test references;
- current state;
- open discrepancy/flag.

## 21.4 Field Registry

A governed provider field record should identify as applicable:

- Mallan canonical field/criterion;
- current provider resource/field;
- provider definition/type;
- lookup/picklist reference;
- null semantics;
- source/authority class;
- public/Agent/internal eligibility;
- attribution/display implications;
- read/write direction;
- current mapping implementation;
- provider modification/version timestamp where available;
- last verified date;
- contract tests;
- affected screens/jobs/reports;
- open drift/uncertainty.

## 21.5 Regular scanning / drift detection

Mallan should regularly scan/verify authoritative REBNY/RLS/current-provider sources for changes in:

- business/use/display rules;
- fields;
- types;
- definitions/meaning;
- picklists;
- status mappings;
- attribution;
- address display;
- permissions;
- media;
- endpoints/authentication;
- provider/deprecation notices.

The exact cadence may vary by source, but the system must have a recurring operating process rather than depending on memory/manual chance discovery.

## 21.6 Technology flags

Useful flags include:

```text
RLS_RULE_CHANGED
UCBA_RULE_CHANGED
DOS_OR_NYS_RULE_CHANGED
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

## 21.7 Change workflow

```text
CHANGE DETECTED
↓
CAPTURE EVIDENCE
↓
IDENTIFY AUTHORITY
↓
CLASSIFY CHANGE
↓
MAP AFFECTED SYSTEMS
↓
OPEN FLAG
↓
REVIEW / CORRECT ADAPTER OR MALLAN RULE
↓
REGRESSION / CONTRACT TEST
↓
AUTHORIZED DEPLOY
↓
PRODUCTION VERIFY
↓
UPDATE REGISTRY
↓
CLOSE FLAG
```

Every flag identifies affected Mallan systems.

Unknown changes affecting public eligibility, attribution, status mapping or another critical rule fail safely rather than being guessed.

## 21.8 Human simplicity

Agents should see the professional result of the technology governance — correct fields, titles, alerts and allowed actions — not feed plumbing.

The governing principle is:

```text
PEOPLE
SUPPORT → REMIND → FLAG → RECORD → SUPERVISE WHERE REQUIRED

TECHNOLOGY
MONITOR → COMPARE → FLAG → VERIFY → VERSION → TEST → BLOCK UNSAFE ASSUMPTIONS
```

---

# 22. SYSTEM INTELLIGENCE / CONTEXTUAL AI

System Intelligence is connective system behavior over real canonical events, not merely an AI chat feature.

It answers:

- what changed;
- what needs attention;
- what is at risk;
- what evidence supports that conclusion;
- what the Agent/Broker should review or do next.

## 22.1 Practical intelligence views

```text
BROKERAGE INTELLIGENCE
AGENT BUSINESS INTELLIGENCE
CLIENT / DEAL INTELLIGENCE
```

Examples:

- listing engagement decline;
- new comp changes pricing context;
- Client high-interest behavior;
- rejected listing materially changed → Reconsider;
- Saved Search listing goes In Contract/Closed/Rented;
- report due;
- missing signed deal document;
- commission blocked;
- payment received → commission review needed;
- Agent payment ready;
- professional renewal approaching;
- RLS/provider rule or field change.

Useful practical signal codes include:

```text
LICENSE_RENEWAL_RISK
CE_DEADLINE_RISK
REBNY_RENEWAL_RISK
INSURANCE_EXPIRATION_RISK
REQUIRED_TRAINING_INCOMPLETE
DEAL_DOCUMENT_MISSING
REFERRAL_FORM_MISSING
COMMISSION_PAYMENT_BLOCKED
PAYMENT_RECEIVED_COMMISSION_REVIEW_NEEDED
AGENT_PAYMENT_READY
```

## 22.2 Explainability

Each signal should be traceable as:

```text
SIGNAL
↓
EVIDENCE
↓
INTERPRETATION
↓
SUGGESTED ACTION
↓
HUMAN DECISION WHERE REQUIRED
```

## 22.3 AI assistance

Contextual AI assistance may help with:

- Search explanation/help;
- property/listing comparison;
- CMA explanation;
- client-response drafting;
- follow-up suggestions;
- marketing/report drafts;
- transaction next-step guidance;
- approved compliance/document lookup.

AI assistance must use canonical Mallan records and the same Search/Property Intelligence contracts rather than a second AI-only client/search/property index.

AI may draft/recommend/explain, but may not:

- invent facts;
- silently mutate canonical records;
- silently change formulas/inputs;
- send/publish without required approval;
- alter signed agreements;
- bypass permissions/compliance gates;
- make binding legal/tax conclusions.

---

# 23. PRODUCT EXPERIENCE / NAVIGATION / ROLE WORKSPACES

The platform should feel like one operating system, not a collection of admin pages.

## 23.1 Global screen rule

Every important screen should answer:

1. **What is this record?**
2. **What changed?**
3. **What matters now?**
4. **What can the Agent/Broker do next?**

Do not expose every database field merely because it exists.

## 23.2 Agent navigation

A practical Agent-level navigation target is:

```text
HOME
CLIENTS
SEARCH
LISTINGS
MARKETING
REPORTS
DEALS
MONEY
TASKS
MY PROFILE
```

CMA, calculators, Comments, Share and Intelligence are contextual capabilities within those workflows and do not all need top-level navigation entries.

## 23.3 Agent Home

Agent Home answers **what needs attention today**.

Useful groups:

- Needs Attention;
- My Business;
- Money;
- Upcoming;
- Priority Actions.

Priority actions must identify the actual record, evidence/reason and next action, not vague AI advice.

## 23.4 Clients

Client pages remain role-specific rather than one generic CRM record.

### Buyer

```text
OVERVIEW
SEARCH
SENT LISTINGS
SHOWINGS
CMA & ANALYSIS
DOCUMENTS
DEALS
TIMELINE
```

### Seller

```text
OVERVIEW
PROPERTY
CMA
LISTING
MARKETING
REPORTS
OFFERS
DOCUMENTS
DEAL
TIMELINE
```

### Landlord

Use the same overall structure but preserve rental-specific Listing, Reporting, Applications, Lease and rental-market semantics.

### Tenant

Use Buyer-like Search/Sent Listings/Showings flow but preserve rental qualification, Application, Lease and Move-in semantics.

One Party may have multiple role Opportunities; role workspaces must not duplicate the Party.

## 23.5 Deals

Deal screens show the stage tracker, current responsibilities, missing documents, professional contacts, dates and payment readiness on the same canonical Transaction.

## 23.6 Money

Agent Money emphasizes Expected / Blocked / Ready / Paid status.

Brokerage Money adds firm-wide queues and brokerage totals without creating a separate commission truth.

## 23.7 My Profile

My Profile should group:

```text
PROFESSIONAL PROFILE
PROFESSIONAL REQUIREMENTS
PROFESSIONAL MATERIALS
```

Online profile preview should let the Agent see the public governed professional title/identity that will be displayed.

## 23.8 Brokerage navigation

```text
OVERVIEW
AGENTS
LEADS
LISTINGS
DEALS
MONEY
COMPLIANCE
TECHNOLOGY
```

Brokerage View is exception-oriented. It should not become a duplicate copy of each Agent's My Business screens.

---

# 24. REQUIREMENT / DOCUMENT GOVERNANCE AND CURRENT-TO-TARGET MAP

There is one master product/system plan: this file.

Operational issue/handoff documents may describe current state only. Historical plans/audits/specifications become reference/evidence after valid requirements are absorbed.

New requirements must be reconciled into this same file rather than creating another Search, CMA, Listings, Reporting, Brokerage or Technology plan.

`MALLAN-CANONICAL-REQUIREMENT-LEDGER.md` is temporary reconciliation/index evidence. It may preserve stable IDs and historical requirement candidates while absorption is underway, but it may not override or independently define the product architecture. After its still-valid requirements are absorbed/mapped here, it should be retired or reduced to historical evidence.

A requirement found only in a historical doc/ledger is not automatically current. Classify it against current Maya direction as:

```text
PRESERVED
SUPERSEDED
INVALIDATED
MISSING — RESTORE
HELD / REQUIRES MAYA DECISION
```

Residual historical reconciliation continues without spawning a fresh master-plan cycle.

## 24.1 Stable requirement identity

Meaningful implementation work should carry a stable requirement/layer ID in commits/tests/execution state so a requirement cannot disappear merely because wording/layout changes.

Where an existing stable ledger ID maps cleanly to the current master, preserve the ID during implementation rather than inventing a second ID for the same requirement.

## 24.2 Proof states

Use proof states such as:

```text
DESIGNED / NOT IMPLEMENTED
IMPLEMENTED — UNVERIFIED
MERGED — NOT PRODUCTION VERIFIED
PRODUCTION VERIFIED
BLOCKED
SUPERSEDED
REOPENED BECAUSE <EVIDENCE>
```

Do not equate `committed`, `PR open`, `draft`, `checks green` or `merged` with end-to-end completion.

## 24.3 Current → target implementation map

### Frontend Consumer Search

```text
CURRENT
existing product with established behavior

TARGET
preserve + verify + correct proven defects + certify
```

### Backend Agent Search

```text
CURRENT
legacy/partial professional Search with criteria/mapping/runtime parity concerns

TARGET
one verified full professional Search contract + Client/Saved Search/history/matching workflow
```

### CMA

```text
CURRENT
partial heuristic/address-driven implementation evidence

TARGET
Search-based professional subject → universe → Agent comp selection → explainable adjustments → strategy → versioned client-safe CMA
```

### Backend Listing

```text
CURRENT
listing-management/detail capabilities are fragmented

TARGET
full readable source-aware Listing Workspace with media + client history + contextual actions
```

### Marketing / E-blast

```text
CURRENT
useful but narrow campaign capabilities exist

TARGET
one listing/search/client-driven Marketing workflow with reviewed audiences and measurable reporting
```

### Listings Reporting

```text
CURRENT
internal/Phase-1 diagnostic capability exists but client output/design/data connection is incomplete

TARGET
separate polished Seller/Landlord report products using actual tracked activity + market/CMA context + Agent-approved recommendation
```

### Brokerage / Agent support

```text
CURRENT
capabilities are distributed across existing CRM/deal/profile data

TARGET
simple My Business + Brokerage View over the same canonical records with professional/deal/payment/technology exceptions
```

Historical code is implementation evidence, not product authority. Reuse existing models/routes/services where correct; do not automatically rebuild in parallel.

---

# 25. DEVELOPMENT SEQUENCE — ONE CONTINUOUS PROGRAM

Do not split these phases into separate master plans.

Residual historical recovery/reconciliation is an evidence lane throughout the program. It does not require waiting for perfect archaeology before safe current-state work begins.

One active implementation branch at a time remains the default. Read-only investigation/design/proof can continue while a documentation branch awaits disposition, but do not create parallel implementation truth.

## Phase 0 — Authority baseline / residual recovery

- preserve uniquely recoverable historical work/evidence where necessary;
- keep one authorized repository/workspace;
- maintain this master as the single current authority;
- absorb any newly proven still-valid missing requirement here;
- do not restart a fresh overall audit merely because context changed.

**Phase 0 is no longer a permanent global hold on Search.** A newly recovered requirement reopens the specific affected dependency only.

## Phase 1 — SEARCH P0 — FIRST ACTIVE PRODUCT LAYER

Read-only proof/audit may begin immediately.

Implementation sequence:

1. establish exact current main, active branch/head and Production identity as applicable;
2. inventory every Advanced Search field/control;
3. verify provider mapping/type/picklist/null semantics;
4. prove Basic/mobile and Advanced/desktop use one normalized criteria contract;
5. identify/remove silent unsupported/incorrect mappings;
6. prove/fix source authority, display eligibility, return-copy suppression and dedupe ordering;
7. prove/fix exact final count/pagination/hasMore semantics;
8. make full criteria saveable/reopenable;
9. assign Saved Search to Client + Buyer/Tenant Opportunity;
10. Client/Search selection auto-populates criteria and current inventory;
11. join Client × Listing history;
12. integrate Comments/timeline;
13. integrate view/showing history;
14. implement authorized new-listing + verified price + material-status update behavior;
15. rejected/pass listings never auto-resend; material changes → Reconsider;
16. implement reverse matching from Listing to eligible clients where authorized;
17. preserve professional internal fields and client-safe transforms;
18. connect selected listings to Compare/CMA;
19. prove the complete professional desktop and Basic mobile UX end to end.

## Phase 2 — CMA / PROPERTY INTELLIGENCE

Rebuild CMA on corrected Backend Search/Property Intelligence:

```text
SUBJECT
→ MARKET UNIVERSE
→ COMP SELECTION
→ ADJUSTMENTS
→ STRATEGY
→ VERSIONED CMA
→ PREVIEW
→ SHARE / EMAIL
```

No independent reduced comp-search engine.

## Phase 3 — BACKEND LISTING WORKSPACE

Rebuild/complete Backend Listing Workspace so every listing opens as a full readable professional record with photos/media and contextual actions.

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
- Refresh Listing/source reconciliation;
- Mallan-authored Edit/Media/Marketing/Reports/Offers/Documents/Distribution controls;
- third-party Cotality source remains read-only.

## Phase 4 — MARKETING / E-BLAST / LISTING REPORTING

Connect actual Search/listing/client/marketing/showing data and build polished separate Seller/Landlord reports.

## Phase 5 — DECISION / CALCULATORS / SYSTEM INTELLIGENCE

Connect deterministic scenarios and contextual explainable intelligence to real workflows.

## Phase 6 — COMMUNICATIONS / DOCUMENTS / AGREEMENTS / DEAL SUPPORT

Complete one communication history, four agreement families/amendments, approved document library, transaction checklists and payment readiness.

## Phase 7 — ROLE JOURNEYS

Complete Seller, Landlord, Buyer, Tenant and Investor/1031 end-to-end without merging role semantics.

## Phase 8 — AGENT SUPPORT / BROKERAGE / MONEY / TECHNOLOGY

Complete professional reminders/profile, deal-document/payment readiness, lead distribution, commissions/referrals, brokerage exceptions and REBNY/RLS/provider monitoring.

## Phase 9 — FUTURE MALLAN → PROVIDER PUBLISHING

Only after Mallan-authored Listing Management and provider mapping are stable and current outbound requirements are verified.

## Phase 10 — HISTORICAL RETIREMENT / FINAL PROOF

Retire superseded code/docs/branches only after requirements/useful behavior are accounted for and replacement proven.

Complete full end-to-end Production proof under the applicable authorization boundaries.

---

# 26. GLOBAL DEFINITION OF DONE

## Search

Not complete until professional criteria execute, Basic/Advanced preserve one criteria truth, final result/count/pagination are correct, Client Saved Search recalls full criteria, prior history/comments are visible, new/price/status updates behave correctly, rejected listings go to Reconsider, reverse matching is correct where enabled, client-safe output strips internal professional data and results feed Compare/CMA.

## CMA

Not complete until it uses the same Backend Search/Property Intelligence universe, uses verified facts, supports Agent-selected/explainable comps and adjustments, versions reproducibly, never leaks source listing-agent information into client output, shows only report creator identity and supports save/reopen/share/email end-to-end.

## Backend Listings

Not complete until any listing opens as a full readable professional record with authorized details and media; Agent can Refresh Listing, save/attach to Client, see history, comment, schedule showing, Add to CMA/Compare, Share/Email client-safe output; and authorized Mallan-authored listings support Edit plus Quick Add Open House without reopening the full listing form.

## Marketing / E-blast

Not complete until campaigns use canonical Listing/Party/Search data, audience selection respects consent/suppression, content can be previewed/reviewed, actual delivery/engagement is tracked truthfully, and marketing results feed Listing Reporting/Client history without duplicate contact/listing truth.

## Listing Reporting

Not complete until real listing/marketing/e-blast/website/send/showing/feedback/offer/application data connect where tracked, Seller/Landlord remain separate, internal provenance is distinguishable from client presentation, reports are polished/versioned/truthful, Agent recommendation is reviewable, and only the Mallan report creator identity appears client-facing.

## Agreements / Documents / Communications

Not complete until four agreement families remain distinct, signed originals never mutate, amendments preserve version history, controlled template language is governed, communications/comments attach to canonical context with correct visibility and client-safe share transformations are enforced.

## Transactions / Money

Not complete until deal stages, required documents, professional contacts, payment readiness, commission/referral calculation, broker review and Agent payment status are joined to the same Transaction and the Agent sees the blocking reason/next action.

## Agent / Brokerage

Not complete until Agent sees governed public professional identity, renewal/CE/REBNY/insurance/training reminders, required deal documents, Money/payment readiness and role-specific My Business; Maya sees firm exceptions over the same canonical records and required supervision is supported without unnecessary management bureaucracy.

## Technology

Not complete until material REBNY/RLS/UCBA/current-provider field/rule/attribution/display changes can be detected/reviewed, field/rule mappings are versioned and tested, critical uncertainty fails safely, and provider replacement can occur through an adapter rather than product rewrites.

## Proof

No `Fixed`, `Production Ready`, `Compliant`, `Search Working`, `CMA Working`, `Listings Working`, `Reporting Working`, `Optimized` or equivalent claim without the applicable durable Git/test/runtime/provider/Production evidence.

---

# CURRENT HANDOFF

- This file is the intended single canonical product/system authority on draft PR #595 and remains unmerged until explicitly approved.
- Maya's recent Search/CMA/Backend Listing decisions have been preserved rather than overwritten.
- The master now also explicitly absorbs previously implicit/stranded requirements for Party/Entity identity, professional contacts, broker supervision boundary, governed professional profiles, four agreement families/amendments, document library, Search reverse matching/UX, transparent CMA workflow, Marketing/E-blast, polished Seller/Landlord Reporting, professional requirements, commission/payment readiness, role-specific product navigation, technology rule/field registries and provider-pivot governance.
- Historical StreetEasy/external/sponsor inventory concepts are not silently restored as current requirements; they remain non-authoritative unless explicitly reopened and verified.
- Residual historical reconciliation continues as evidence work but is **not a global blocker to beginning Search P0 read-only proof/audit**.
- Immediate product sequence is **Search → CMA → Backend Listings → Marketing/E-blast/Reporting → remaining operating system**.
- Existing Search/CMA/Listing/Marketing/Reporting code is implementation evidence, not design authority. Reuse existing SavedSearch, ClientListingAction, Showing, Comment, listing-send, Listing/media, campaign and report capabilities where correct instead of automatically creating parallel models.
- Current documentation changes do not authorize Production mutations, schema changes or deployment.
- Next exact product action: **SEARCH-P0 — inventory and verify every Advanced Search criterion, then prove source-authority/filter/dedupe/final-count/pagination and Saved Search recall/history on the existing canonical path.**
