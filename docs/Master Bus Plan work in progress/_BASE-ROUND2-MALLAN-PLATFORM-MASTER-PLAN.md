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
                 LEAD / INQUIRY
                        │
                      PARTY
                        │
                  ROLE OPPORTUNITY
                        │
      REPRESENTATION / CLIENT RELATIONSHIP
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
                  ACCEPTED DEAL
                        │
                   TRANSACTION
                        │
           BROKERAGE DEAL PROGRESSION
                        │
                 CLOSED / RENTED
                        │
              COMMISSION / REFERRAL
                        │
                POST-DEAL RELATIONSHIP
                        │
          FUTURE OPPORTUNITY / REFERRAL
                        │
                        └── returns to ROLE OPPORTUNITY on the same PARTY
```

The chain begins before identity. An inbound inquiry, call, referral or form submission enters as a Lead and resolves to a canonical Party before role work begins. Resolution is governed by §3.1.

Representation is a stage, not a formality. An Agent may research and prepare at any time, but client-facing representation work proceeds through the applicable broker-approved agreement and required disclosures. The governed form/document library is §11.4 and the per-role sequence is §12–§15.

Acceptance, brokerage deal progression and close/rent are distinct governed stages rather than one undifferentiated transaction. The sale and rental stage chains are §20.

The chain closes. A completed deal produces a future opportunity or a referral on the same canonical Party, which re-enters as a new role Opportunity rather than as a new client.

**Unified means shared canonical identity, data and history. It does not mean collapsing distinct roles.**

Seller, Landlord, Buyer and Tenant remain four separate first-class opportunities and workflows. Investor/1031 uses the same canonical foundation with specialized analysis.

The same canonical Party carries through changing business roles:

```text
RENTER → BUYER → OWNER → LANDLORD → SELLER → BUYER AGAIN
```

Each transition opens a new role Opportunity on the same Party and keeps the prior history, comments, documents and deal record attached. The Buyer who closes in §14 is the Owner, and that Owner is the Landlord Party in §13 when the same unit is later rented. **Do not create a new person because the person's business role changed.** Party persistence is governed by §3.1.

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

One canonical record may be presented through more than one view. A view controls who may see which fields; it never creates a second record. Mallan's full surface model is §2.5.

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

## 2.5 Permissioned views over one canonical record

Mallan presents the same canonical business records through four permissioned views:

```text
BROKERAGE VIEW
firm-wide supervision scope

MY BUSINESS / AGENT WORKSPACE
the logged-in producer's own business

CLIENT EXPERIENCE / PORTAL
the client's permissioned view of the client's own business

PUBLIC WEB
the unauthenticated market-facing surface
```

These are views, not systems. **No view may hold its own client, property, listing, search, comment, media, document, campaign, CMA, transaction or commission truth.** A client-facing screen and a public listing page read the same canonical records the Agent works in.

Brokerage View and My Business remain the matched supervision pair defined in §2.1; Client Experience / Portal and Public Web are audience surfaces over the same records. If Mallan later restates §2.1 as a four-view model, the supervision pairing must survive that restatement rather than being flattened into one list of surfaces.

Client-visible content is governed by the visibility classes in §11.1 and the client-safe boundary in §11.2 and §11.3. A record does not become client-visible because it is displayed inside a client workspace.

Public-visible content is governed by §4 and §5.1. Public listing pages, Agent profiles and public marketing pages are the same surface as Frontend Consumer Search and carry the same eligibility, payload and exclusion rules; private supplemental inventory does not reach them.

---

# 3. CANONICAL SHARED FOUNDATION

```text
CANONICAL SHARED FOUNDATION
│
├── Brokerage
├── Agent / Licensee
├── Lead / Inquiry
├── Party — Individual(s) / Entity
├── Contact Methods / Consent / Preferences
├── Professional Contacts / Organizations
├── Property — Building / Unit
├── Listing Episode
├── Source Observation
├── Private Supplemental Inventory / Source References
├── Seller Opportunity
├── Landlord Opportunity
├── Buyer Opportunity
├── Tenant Opportunity
├── Investor / 1031 Opportunity
├── Client Relationship / Representation State
├── Search / Saved Search
├── Client × Listing History
├── CMA / Property Intelligence
├── Decision / Calculator Scenarios
├── Communications / Comments
├── Documents / Agreements / Amendments
├── Offering Plans / Schedule A / Building Documents
├── Media
├── Marketing / E-blast / Share
├── Listing Reports
├── Showings / Open Houses
├── Tasks / Calendar / Reminders
├── Offers / Applications
├── Transactions
├── Commissions / Referrals
├── Permissions / Consent / Visibility
├── Technology / Rule Flags
└── Audit / Provenance / History
```

Party identity remains separate from role. Property remains separate from Listing. A physical Property/Unit survives multiple listing episodes, ownership changes, leases, CMAs and client interest.

Client Relationship is the state of Mallan's representation of a Party — prospect, under representation, agreement expired, former client — and remains separate from the Opportunity that describes the business and from the executed document that evidences the relationship. The governed agreement/form library and the representation structures it supports are §11.4. Representation/prospecting eligibility, which §6 already treats as a separate governed decision, reads this state.

Showings and Open Houses are canonical events attached to Property/Listing, Opportunity and Client × Listing history rather than calendar entries copied per workspace. Creation for Mallan-authored listings is §7.8, and the resulting client-activity transitions are §5.15.

A StreetEasy reference, a Cotality listing, a Schedule A unit and a Mallan-authored listing that resolve to the same real unit must not become four separate properties. They are source observations or listing episodes attached to the same canonical Building/Property/Unit identity.

## 3.1 Party / entity rules

One Individual or Entity may hold multiple roles over time or simultaneously without duplicate identity.

A Lead/Inquiry is business-acquisition context, not a competing identity to Party. **Do not create a second person because an inquiry arrived through a different form, channel, campaign or referral source.**

```text
LEAD / INQUIRY
↓
IDENTITY RESOLUTION
↓
CANONICAL PARTY
↓
ONE OR MORE ROLE OPPORTUNITIES
```

An inquiry from a Party Mallan already knows resolves to that Party and opens or updates a role Opportunity. An unresolved inquiry remains a Lead until identity is established and is not promoted to a Party by assumption. Saved Search continuation from a resolved Opportunity is §5.8; brokerage lead source, assignment, response and conversion history remain §19.1.

Business-facing workflows must support one or more Individuals, an Entity, or both where applicable, including Seller, Landlord, Buyer, Tenant, Investor, Owner, Guarantor, Trustee, Executor and Authorized Signatory relationships.

Entity types may include LLC, LLP, Corporation, Partnership, Trust, Estate and Other where needed.

Entity/individual relationships may include trustee/co-trustee, executor, member, manager, partner, officer and authorized signatory where applicable.

## 3.2 Contact methods / consent / suppression

Individuals and Entities may have multiple emails, phone numbers and mailing addresses.

Preferred communication method is stored once and reused across opportunities, listings, deals and client delivery.

Contact consent, unsubscribe/suppression, permissions and share eligibility are centrally governed rather than copied independently into each campaign.

## 3.3 Professional contacts

Attorneys/law firms, lenders/mortgage professionals, managing agents and other reusable transaction professionals are canonical Parties/Organizations, not free-text copies inside every deal.

Source listing professionals, selling brokerages, sponsor contacts and owner/FSBO contacts discovered through supplemental inventory remain source-attributed contacts until identity and permitted use are verified. A source contact may be useful internally without automatically becoming a public/client-facing Mallan contact.

When a transaction reaches a stage requiring professional contacts, Mallan requests/confirms the relevant contacts and links them to the canonical Transaction.

## 3.4 Client understanding layers

What Mallan knows about a client comes from four separate layers. They are related but not interchangeable, and each is stored and attributed as its own kind of knowledge:

```text
EXPLICIT CLIENT REQUIREMENTS
what the client stated

OBSERVED CLIENT BEHAVIOR
what the client did

AGENT NOTES / INTERPRETATION
what the Agent concluded

SYSTEM-GENERATED BUSINESS OBSERVATION
what the system detected from canonical events
```

The stored requirement set is §5.8 and §5.10. Observed behavior and its history are §5.11 and §5.15. Agent notes and their visibility are §5.14 and §11.2. System observation, its evidence and its explainability are §22.

**Observed behavior and system observation may not silently overwrite explicit client instructions.** Behavior and signals may raise an Agent question, a Reconsider entry or a suggested update; they may not rewrite the client's stated criteria, and a stated exclusion or rejection stays in force until the client changes it. The Agent must be able to see which layer a statement about the client came from, in the same way §6 requires a CMA number to show whether it is a sourced fact, system calculation, system suggestion or Agent assumption.

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
STREETEASY_SUPPLEMENTAL_REFERENCE
NYS_AG_SCHEDULE_A
AGENT_CONFIRMED_SUPPLEMENTAL
```

Source existence does **not** itself grant copying, extraction, republication or client-share rights.

Authority / visibility classes include:

```text
EDITABLE_CANONICAL
READ_ONLY_SOURCE
DERIVED_OBSERVATION
SUPPRESSED_RETURN_COPY
PRIVATE_SUPPLEMENTAL
RIGHTS_GATED_SOURCE
CLIENT_SHARE_ELIGIBLE
INTERNAL_ONLY
```

A source observation can be internally useful while remaining `INTERNAL_ONLY` or `RIGHTS_GATED_SOURCE` for redistribution.

Internal visibility is not authorization. A Listing or source observation being visible inside Mallan — **including a Mallan-authored listing** — does not by itself authorize public advertising, client redistribution, media reuse, email marketing, social advertising, website publication or SEO/indexation.

Each of those is a separate decision of the source, advertising and share rule layer in §21, taken per surface and per exact share mode. The per-surface gates stated later for private supplemental inventory, third-party client share, Share, Marketing/E-blast and the Buyer journey apply this rule rather than replacing it. **Do not treat a distribution surface as ungated because this plan does not name it.**

## 4.2 Mallan-authored listing

A listing created inside Mallan remains Mallan's canonical editable listing. Authorized Mallan agents/broker may amend it.

It connects to owner Party, Seller/Landlord Opportunity, Property/Building/Unit, representation/exclusive agreement and amendments, media, marketing, e-blasts, open houses/showings, feedback, reports, offers/applications, transaction and commission.

Cotality or another source observation must never silently overwrite Mallan-authoritative fields on a Mallan-authored listing.

## 4.3 Third-party Cotality listing

Third-party Cotality listings remain read-only source truth under the verified provider contract.

Agents may Search, save, compare, comment, attach to Buyer/Tenant Opportunities, send where permitted, schedule showings, use in CMA/Property Intelligence and use in calculators/offer scenarios. Those actions create Mallan-owned workflow records and never mutate the Cotality listing.

## 4.4 Cotality return-copy of a Mallan listing

When Cotality returns a copy of a Mallan-authored listing:

- resolve it to the same canonical Mallan Listing Episode;
- retain the Cotality observation internally for reconciliation/distribution evidence;
- suppress it as a duplicate before public Search count/pagination/detail;
- keep Mallan as the editable canonical record;
- do not create a second Client × Listing history identity.

Address alone is not sufficient evidence for automatic suppression. Uncertain identity goes to review.

## 4.5 Private supplemental sale inventory — explicitly reauthorized

Maya has explicitly reauthorized private supplemental **sale** inventory for professional Agent Search.

The business goal is:

```text
MAXIMUM AUTHORIZED SALE COVERAGE
=
COTALITY / RLS INVENTORY
+
AUTHORIZED STREETEASY SALE INVENTORY ABSENT FROM COTALITY
+
NYS ATTORNEY GENERAL OFFERING-PLAN / SCHEDULE A UNIT INVENTORY
+
AGENT-CONFIRMED PRIVATE SUPPLEMENTAL INVENTORY
-
VERIFIED DUPLICATES
```

This is **not public Mallan inventory by default**.

Private supplemental inventory is for Agent research and, only when the source/advertising/share rule permits it, explicit sharing with selected Buyer clients. It does not automatically enter public Consumer Search, sitemap, SEO, public structured data or public listing feeds.

Historical external-inventory and sponsor/new-development work is evidence for this restored requirement, but the current master governs the implementation. Do not revive historical parallel tables/schema mechanically; first reconcile with the current canonical Property/Unit/Listing model.

### 4.5.1 Cotality reconciliation is first

Every StreetEasy or Schedule A unit must resolve through canonical identity before it is surfaced as supplemental inventory.

```text
SOURCE OBSERVATION / URL / SCHEDULE A UNIT
↓
NORMALIZE BUILDING + UNIT IDENTITY
↓
CHECK MALLAN CANONICAL PROPERTY / UNIT
↓
CHECK CURRENT COTALITY LISTING IDENTITY
├── MATCH FOUND
│   → use/link the canonical Cotality Listing Episode
│   → retain supplemental source as provenance/evidence only
│   → do not create a second search result
└── NO COTALITY MATCH PROVEN
    → private supplemental candidate
```

If a private supplemental unit later appears in Cotality, reconcile it to the same canonical Unit/Listing Episode, preserve the earlier source/history, and suppress the duplicate search result. Client history, comments, sends, showings and CMA context continue on the canonical identity.

### 4.5.2 StreetEasy sale inventory — gap coverage

StreetEasy is a named supplemental **sale** source because Mallan needs sale inventory that is not present in the current Cotality feed.

Business requirement:

- Agent can paste/store a StreetEasy sale URL;
- Mallan resolves address/building/unit and checks Cotality first;
- if the property is absent from Cotality, Mallan can create a private supplemental source observation/candidate;
- the record can hold permitted source facts, source URL, source listing ID where available, source listing brokerage/agent contact or FSBO/owner contact where lawfully obtained, verification date and source provenance;
- the Agent confirms/corrects imported or entered values before the record becomes trusted for Search/share;
- the record remains read-only as to the source observation; Agent annotations/local workflow state are separate Mallan-owned data.

Desired URL-assisted workflow:

```text
PASTE STREETEASY SALE URL
↓
RESOLVE / VERIFY PROPERTY + UNIT
↓
CHECK CURRENT COTALITY
├── FOUND → OPEN / ATTACH CANONICAL COTALITY LISTING
└── NOT FOUND
    ↓
    SOURCE-RIGHTS GATE
    ├── AUTHORIZED AUTOMATED EXTRACTION / LICENSED ACCESS
    │   → PREFILL PERMITTED FIELDS
    └── NO EXTRACTION RIGHT
        → STORE SOURCE URL + AGENT-CONFIRMED / MANUAL FIELDS
    ↓
AGENT REVIEW / CONFIRM
↓
PRIVATE SUPPLEMENTAL SEARCH RECORD
```

**Automated StreetEasy extraction is a rights-gated capability, not assumed authorization.** The current StreetEasy Advertising Terms prohibit automated scraping/data extraction except when expressly permitted in writing. Implementation therefore may not ship a scraper, automated URL fetch/parser, Playwright extraction or equivalent simply because the URL is public. If Mallan later obtains written permission, licensed access, an approved feed/API or another valid source right, the same adapter can populate the existing template without redesigning Search.

StreetEasy media may not be copied/rehosted merely because it is visible on a public listing page. Source photos, floor plans and other copyrighted media require verified use/reproduction rights before Mallan stores, republishes or sends copies.

### 4.5.3 Source listing professional / owner contact

For supplemental inventory, Agent Search may need the source professional or owner/FSBO contact so the Mallan Agent can verify availability and coordinate access.

Store, where verified/permitted:

- source listing brokerage;
- source listing agent/licensed name;
- source professional phone/email/contact channel;
- owner/FSBO name/contact where publicly supplied and lawfully usable;
- source URL;
- source timestamp / last verified date;
- contact provenance and use restrictions.

These contacts are **internal professional/source data by default**. They may not automatically serialize into client-facing cards, reports, emails or public pages. Attribution/contact shown to a client follows the current applicable advertising/source rules and exact share mode.

### 4.5.4 NYS Attorney General Schedule A — new-development / sponsor unit universe

The authoritative planning source is the **New York State Attorney General Real Estate Finance / offering-plan system**, not a generic NYC listing feed.

Mallan should use Offering Plans, Schedule A and accepted amendments/supplements to build a private professional unit universe for new-development/sponsor opportunities.

A Schedule A source observation can capture, depending on plan type and actual filed content:

- building/property identity;
- unit identification;
- bedrooms/bathrooms or rooms where applicable;
- approximate/usable square footage or area where provided;
- offering price **when the unit is being offered and a price is filed**;
- common-interest/share allocation where applicable;
- projected common charges for condominium units;
- projected maintenance for cooperative units;
- projected real-estate taxes where applicable;
- projected carrying charges where applicable;
- tax-abatement/tax-benefit information and conditions when supported by the plan, footnotes or amendments;
- sponsor/entity information;
- selling agent/brokerage information when contained in the plan or later verified;
- floor-plan/document references;
- plan/file number, amendment/version and effective/as-of date.

Do not flatten condo and co-op economics into one fake schema. `common charges`, `maintenance`, `taxes`, `shares/common interest` and area/room conventions retain their actual source meaning.

Schedule A is a **future/opportunity universe, not proof that every unit is currently active or guaranteed to come to market**. Current regulations expressly contemplate units identified in Schedule A that are not yet being offered. Therefore source states must distinguish, for example:

```text
OFFERING_PLAN_UNIT
AVAILABILITY_UNCONFIRMED
PLANNED / NOT YET OFFERED
CONFIRMED_AVAILABLE
ACTIVE_MARKET_LISTING
IN_CONTRACT
SOLD / CLOSED
RENTED / HELD
STALE / NEEDS_REVERIFY
```

Exact state names can be refined, but Mallan may not label an unconfirmed Schedule A unit `ACTIVE` merely because it appears in an offering plan.

### 4.5.5 Schedule A → active listing reconciliation and auto-population

When a Schedule A unit later has a verified market listing:

```text
NYS AG SCHEDULE A UNIT
↓
CANONICAL BUILDING / UNIT
↓
ACTIVE LISTING FOUND?
├── COTALITY → LINK COTALITY LISTING EPISODE
├── AUTHORIZED SUPPLEMENTAL SOURCE → LINK SUPPLEMENTAL OBSERVATION
└── NONE → KEEP AS PRIVATE OFFERING-PLAN OPPORTUNITY
```

The Agent view should auto-compose the best authorized facts **field by field**, not allow one source to overwrite every other source:

```text
IDENTITY
→ canonical Building / Unit

OFFERING-PLAN FACTS
→ latest applicable Schedule A + accepted amendments

CURRENT MARKET STATUS / LISTING PROFESSIONAL
→ current Cotality listing when present;
  otherwise authorized supplemental source / Agent verification

BUILDING / AMENITY MEDIA
→ Mallan-authorized canonical Building media

UNIT FLOOR PLAN
→ authorized unit/Offering Plan floor plan with source provenance

AGENT NOTES / AVAILABILITY CONFIRMATION
→ Mallan-owned workflow data
```

Every material fact shown from Schedule A or another supplemental source retains source, version/as-of date and currentness state.

### 4.5.6 Standard building / amenity media

Once a Schedule A or supplemental unit resolves to a canonical Building, Mallan may automatically attach the standard **Mallan-authorized Building media set** for Agent presentation, including building exterior and amenities where rights are already established.

Building/amenity photos are not unit-specific photos and must not be presented as though they depict the unit. A unit floor plan is separate media and must retain unit/source identity.

Do not scrape/reuse another broker's or portal's photos to create this library. New building media enters only through a verified Mallan-owned/licensed/authorized source.

### 4.5.7 Private Client Share gate

A private supplemental record can have separate states:

```text
INTERNAL_RESEARCH_ONLY
CLIENT_SHARE_REVIEW_REQUIRED
CLIENT_SHARE_ELIGIBLE
SHARED_WITH_SELECTED_CLIENT
SHARE_REVOKED
```

`PRIVATE` does not automatically mean legally shareable.

Before Mallan renders a third-party property as a client-facing advertisement/share, the rule engine must verify the applicable owner/listing-broker authorization, attribution, source-use and media rights. New York advertising rules broadly cover email and web advertising and restrict advertising another broker's exclusive without permission. If eligibility is not proven, the Agent can retain the source internally and use the source contact/URL to investigate rather than having Mallan republish it as its own offering.

When a share is allowed, it attaches to one selected Buyer Opportunity and becomes part of the same Client × Listing/Unit history used by Search.

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

The problem is not that Advanced Search has too many criteria. Agents need exhaustive professional Search. The problem is that visible criteria, mappings, execution, source coverage, counts, saved searches and client history are not yet one reliable system.

## 5.1 Separate Frontend and Backend Search products

### Frontend Consumer Search

Frontend Consumer Search already exists and should be **preserved, verified, corrected only where evidence proves a defect, and certified** rather than casually rebuilt.

Public inventory remains:

```text
ELIGIBLE MALLAN-AUTHORED LISTINGS
+
ELIGIBLE THIRD-PARTY COTALITY LISTINGS
-
COTALITY RETURN-COPIES OF MALLAN LISTINGS
```

Private supplemental StreetEasy references and Schedule A opportunities do **not** enter public Search merely because they appear in Backend Agent Search.

Consumer payloads exclude internal/professional-only fields before serialization.

Frontend Consumer Search and Backend Agent Search may share low-level provider client/auth, field registry, normalization, identity/address/media/provenance and retry infrastructure, but they require separate DTOs, permissions, filter contracts, caches and tests.

### Backend Agent Search

Backend Search is the full professional product and includes, subject to verified source rights and currentness:

```text
MALLAN-AUTHORED INVENTORY
+
COTALITY THIRD-PARTY INVENTORY
+
AUTHORIZED PRIVATE SUPPLEMENTAL SALE INVENTORY
+
NYS AG SCHEDULE A / OFFERING-PLAN UNIT OPPORTUNITIES
-
VERIFIED DUPLICATES
```

Third-party/supplemental source observations remain read-only. Mallan-authored listings remain editable through Listing Workspace authority.

Backend Search must visibly distinguish source and availability truth rather than making a Schedule A opportunity look identical to a verified current Cotality listing.

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
NEW DEVELOPMENT / SCHEDULE A
PRIVATE / SUPPLEMENTAL
COMP SEARCH / MARKET RESEARCH
```

The exact labels may be refined during design. These modes can be views/filters over one canonical Search identity layer; they may not create separate duplicate Property/Unit universes.

## 5.4 Exhaustive Advanced Search

Authorized agents must be able to Search from every legitimate professional perspective supported by verified current RLS/provider data **and approved private supplemental sources**, including where supported:

- listing/RLS/source ID;
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
- Schedule A/offering-plan opportunity criteria;
- confirmed/unconfirmed availability state;
- source class / private supplemental status;
- professional listing office/agent criteria where authorized;
- sponsor/selling-agent/owner source information internally where authorized;
- market/comp criteria;
- other legitimate searchable fields verified from the applicable current source contract.

Do not arbitrarily reduce professional Search.

Advanced desktop may group or progressively disclose criteria for usability, but a legitimate supported professional filter may not become a dead/ignored control.

## 5.5 Search field contract

```text
UI FIELD
↓
MALLAN CANONICAL CRITERION
↓
APPLICABLE VERIFIED SOURCE FIELD / DERIVATION
↓
TYPE / PICKLIST / NULL SEMANTICS
↓
QUERY OPERATOR
↓
SOURCE + CURRENTNESS + RIGHTS STATE
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

Search answers exactly one question: **does this property satisfy these criteria?** It is deterministic criteria satisfaction and nothing more. A property that fails a criterion is not a Search result, however interesting it is.

Agent Intelligence answers the separate question: **why might this near-match deserve Agent review?** A property that does not satisfy the explicit criteria may still reach the Agent as an Intelligence signal with its reason stated. It reaches the Agent as a signal — never as a Search result, never inside a count and never inside an automatic client send. Near-match evidence, interpretation and human decision are governed by §22.

**No control, Intelligence signal or AI assist may silently broaden, narrow or relax Search.** A criterion changes because the Agent changed it. Near-match review exists precisely so that the criteria never have to be loosened to surface an adjacent opportunity.

## 5.6 Correct Search ordering

```text
SOURCE CANDIDATES
↓
CANONICAL PROPERTY / UNIT / LISTING IDENTITY
↓
SOURCE AUTHORITY + CURRENTNESS + RIGHTS
↓
COTALITY / MALLAN / SUPPLEMENTAL RECONCILIATION
↓
AUDIENCE VISIBILITY / CLIENT-SHARE PERMISSIONS
↓
SUPPORTED FILTERS
↓
RETURN-COPY / CROSS-SOURCE DEDUPE
↓
DETERMINISTIC SORT
↓
FINAL ELIGIBLE COUNT
↓
PAGINATION
↓
PRESENTATION ENRICHMENT / MEDIA
```

`total`, `hasMore` and pagination must describe the same final eligible/deduplicated universe the Agent actually sees for that Search mode. A pre-filter/pre-dedupe source count may not be represented as the final result total.

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

- source/status badge;
- hero/building image when authorized;
- address/building/unit;
- price/rent/offering price with source label;
- current availability state;
- beds/baths/rooms;
- size/$-per-unit-area where appropriate;
- ownership/property type;
- DOM/relevant dates where a true market listing exists;
- common charges/maintenance/taxes/carrying charges with correct source semantics;
- abatement/tax-benefit indication when sourced and current;
- open house signal for true market listings;
- verified listing office/agent or source owner contact for internal Agent use where authorized;
- Schedule A / offering-plan version when applicable;
- source/history/provenance/currentness;
- `PRIVATE — CLIENT SHARE ONLY` or `AVAILABILITY UNCONFIRMED` when applicable.

Primary actions:

```text
VIEW
SAVE / ATTACH
COMPARE
ADD TO CMA
VERIFY AVAILABILITY
CONTACT SOURCE PROFESSIONAL / OWNER
SEND — ONLY IF CLIENT-SHARE ELIGIBLE
SCHEDULE SHOWING — ONLY IF VERIFIED / COORDINATED
```

Multi-select should support actions such as Compare, Add to CMA, Send to Client and Create/Update a reviewed client collection without creating duplicate Listing/Unit records.

## 5.8 Saved Search belongs to Client + Opportunity

```text
LEAD — WHERE THE CLIENT ORIGINATED AS ONE
↓
AGENT
↓
CLIENT PARTY
↓
BUYER or TENANT OPPORTUNITY
↓
SAVED SEARCH
↓
EXPLICIT REQUIREMENTS
↓
CURRENT SEARCH
↓
CLIENT × LISTING / UNIT HISTORY
↓
OBSERVED INTERACTIONS
↓
AGENT INTELLIGENCE
```

A Client may have multiple Saved Searches. Buyer and Tenant Saved Searches remain separate.

Each Saved Search retains the full normalized criteria, owner Agent, client/opportunity, alert settings/frequency, created/updated history and applicable client-send permissions.

Buyer Saved Search may evaluate eligible private supplemental/new-development opportunities in the Agent workspace, but an internal match is not automatically client-shareable.

A Search-bearing Opportunity records where it came from. Where the Client originated as a brokerage lead, the requirements captured on that lead are the origin of the Saved Search criteria and the lineage is retained. The Lead itself is defined, routed and measured in §19, not here.

Maya must decide whether Lead becomes a canonical object. §19.1 caps brokerage leads at a simple assignment history — source, assigned Agent, date, accepted/declined/reassigned, response/follow-up, conversion — and §3 does not carry Lead in the canonical shared foundation. A durable Lead → Opportunity → Saved Search lineage whose captured requirements survive conversion is more than that cap allows. Until the decision is recorded, the chain executes from `CLIENT PARTY` and the lead link stays inside §19. **Mallan may not create a second Lead record inside Search to close the gap.**

## 5.9 Select Client → recall Search automatically

Selecting the Client and Saved Search must:

1. load the correct Buyer/Tenant Opportunity;
2. auto-populate all criteria;
3. run current Search;
4. load current matching eligible inventory/opportunities;
5. load Client × Listing/Unit history;
6. separate new opportunities from already-known properties.

The Agent must not re-enter the client's requirements each time.

## 5.10 Temporary edits versus saved criteria

Temporary Search changes must show as unsaved and offer:

- Discard Changes;
- Update Saved Search;
- Save as New Search.

Changing a temporary criterion may not silently mutate the client's stored requirement set.

## 5.11 Client × Listing relationship memory

For an assigned Client, Search results combine current inventory/opportunities with prior relationship history:

- sent;
- opened/viewed online;
- saved/liked;
- discuss/maybe;
- source/availability verified;
- showing requested/scheduled/completed;
- passed/rejected;
- offer/application made;
- comments;
- material listing/source changes.

History attaches to canonical Property/Unit/Listing identity, including Mallan/Cotality/supplemental reconciliation.

Useful groups include:

```text
NEW
PRIVATE / SUPPLEMENTAL
NEW DEVELOPMENT / SCHEDULE A
AVAILABILITY TO VERIFY
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

Observed Client interactions and Client × Listing/Unit history are the canonical input to Agent Intelligence. Sends, opens, saves, discussions, showings, rejections and comments are read from this history; Intelligence does not keep a second behavioral record of the same Client. What Intelligence may conclude from it is governed by §22.

## 5.12 Auto-send rules

A Client Saved Search may automatically send **only client-share-eligible** matching updates for:

1. **NEW LISTINGS / ELIGIBLE OPPORTUNITIES**
2. **VERIFIED PRICE CHANGES**
3. **MEANINGFUL VERIFIED STATUS CHANGES**

A Schedule A match with unconfirmed availability is not automatically advertised to a client as an active listing. It may route to Agent review / availability verification first.

New Listing is a recommendation/match.

Price Change is an update to a known listing.

Status Change is clearly presented as a **Market Update**, not as a new listing.

Verified status updates may include, when supported by the applicable current source mapping:

- Active → In Contract / Signed Contract;
- In Contract → Closed/Sold;
- Active Rental → Rented/Closed;
- In Contract → Back on Market;
- Schedule A / private candidate → confirmed available;
- confirmed available → active Cotality/source listing;
- other material verified transitions.

Previously sent, viewed, liked, discussed or shown listings may be sent again automatically when a qualifying verified price/status change occurs, subject to Saved Search settings and current client-share eligibility.

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

Show prior rejection date/reason/comment and old/new value or status. Agent may intentionally send again if the record is currently share-eligible.

## 5.14 Comments are permanent Client × Listing memory

Use shared Comment history rather than one overwriteable note.

Comments may be internal Agent/Brokerage or client-shared and should remain a chronological timeline attached to Client + Opportunity + canonical Property/Unit/Listing.

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
LISTING / PRIVATE OPPORTUNITY / SCHEDULE A UNIT
↓
WHICH BUYER SAVED SEARCHES MATCH?
```

Reverse matching can drive Agent review and, only where authorized, client sends and approved Marketing/E-blast audiences. It must use the same Saved Search criteria engine, permissions and canonical client records rather than a separate marketing match database.

## 5.17 Auto-send pipeline

```text
SAVED CLIENT SEARCH
↓
CURRENT ELIGIBLE SOURCE UNIVERSE
↓
CANONICAL PROPERTY / UNIT / LISTING IDENTITY
↓
SOURCE RIGHTS / AVAILABILITY / CLIENT-SHARE ELIGIBILITY
↓
CLIENT × LISTING / UNIT HISTORY
↓
CHANGE DETECTION
├── NEW + SHARE-ELIGIBLE → auto-send eligible
├── NEW + VERIFY FIRST → Agent review only
├── PRICE CHANGE → update eligible if share rights remain valid
├── STATUS CHANGE → market-update eligible if share rights remain valid
└── REJECTED + CHANGE → RECONSIDER only
↓
CLIENT-SAFE TRANSFORMATION
↓
DELIVERY
↓
RECORD SEND / UPDATE EVENT
```

## 5.18 Client-facing payload boundary

Backend Agent Search may contain professional/source contacts, provenance, owner/FSBO contact, unconfirmed Schedule A facts and rights-state information that are not appropriate for client delivery.

Client-facing transformations must:

- include only fields permitted for that source/share mode;
- apply required listing-broker/source attribution where applicable;
- label projected/estimated offering-plan charges accurately;
- label unconfirmed availability rather than present it as active;
- omit internal owner/source contact unless specifically permitted/required;
- omit source media without verified client-display rights;
- retain Mallan Agent identity and communication context.

Do not hide prohibited/internal fields with CSS. **Do not serialize them into the client payload.**

## 5.19 Search acceptance

Search is not finished until:

- every professional criterion has a verified execution contract;
- Basic mobile and Advanced desktop preserve one criteria truth;
- Cotality, Mallan and approved supplemental source candidates reconcile to one canonical Property/Unit/Listing identity;
- a StreetEasy URL cannot create a duplicate of an existing Cotality/Mallan listing;
- automated StreetEasy extraction cannot run without verified source authorization;
- Schedule A unit facts preserve plan/amendment/version provenance and unconfirmed availability cannot masquerade as active inventory;
- field-level source precedence is explicit and tested;
- private supplemental records never leak to public Search by accident;
- client share requires explicit share eligibility and client-safe transformation;
- final count/pagination match the final eligible/deduplicated universe for the selected Search mode;
- Client selection recalls the correct Saved Search and full criteria;
- current results join prior Client × Listing/Unit history;
- prior viewed/shown/rejected states are visible;
- new/price/status auto-updates behave correctly;
- rejected material changes route to Reconsider;
- comments/history persist;
- reverse matching works where authorized;
- a property that fails the criteria never appears as a Search result, in a count or in an automatic client send;
- no control, Intelligence signal or AI assist can silently broaden, narrow or relax the criteria;
- observed Client interactions and Client × Listing/Unit history reach Agent Intelligence as its canonical input;
- where the Client originated as a brokerage lead, the lead-to-Saved-Search lineage is retained once the Lead decision recorded in 5.8 is settled;
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

Sale CMA must separate **valuation comps** from **market-context / market-resistance evidence**.

The sale CMA market universe should distinguish:

- **Closed evidence — primary valuation evidence.** The final valuation comp set is made from verified Closed transactions selected by the Agent;
- **In Contract/Pending context — current acceptance direction.** It helps show where current buyers and sellers are meeting, but it is not a final Closed comp while the actual closing price remains unknown;
- **Active competition — current asking-price context.** It shows what a buyer can choose among now, but asking price is not closed value;
- **Expired market-resistance evidence — secondary evidence.** A verified Expired listing can show that a property was exposed to the market at a sourced asking price/positioning and did not produce a completed sale during that observed listing episode. This is useful when explaining to a Seller, Buyer, lender or other authorized recipient where a price point failed to clear the market, but it is not a final valuation comp;
- **Withdrawn / removed / Temporarily Off Market / Hold history — contextual evidence only when verified.** These statuses can help explain market history, but the reason may be price, seller decision, condition, access, representation strategy or another factor and Mallan must not invent the cause;
- private/supplemental or Schedule A opportunities as a separate context when relevant and sufficiently verified.

Expired or removed historical evidence may come from the current authorized Cotality data when available **or from another authorized secondary source**. A secondary-source observation must resolve to the same canonical Property/Unit/Listing Episode, remain read-only as source evidence, retain source URL/identifier where applicable, observed/listing dates, sourced asking price/status, provenance and last-verified date, and must never overwrite Cotality or Mallan canonical listing truth.

An Expired observation supports the narrower factual statement that the sourced listing episode ended without a completed sale at the recorded market exposure/price history. It does **not** by itself prove that price was the sole reason the property failed to sell.

Source-reported `Withdrawn`, `Temporarily Off Market`, `Hold` or similar states are **not representation truth**. They do not prove that an exclusive agreement ended, that the owner is unrepresented, or that solicitation is automatically appropriate. Representation/prospecting eligibility remains a separate governed decision from CMA status evidence.

Mallan does **not** require purchase of an additional Cotality Backend entitlement solely to obtain Expired/Withdrawn/TOM/Hold observations for this secondary CMA/prospecting purpose if the required historical observations can be lawfully obtained from another authorized source. Any future additional provider/feed purchase must be justified by a separate material capability Mallan actually needs.

Rental CMA should distinguish relevant:

- leased/rented evidence;
- pending/application/in-contract context where supported;
- Active competition.

Agent may broaden/tighten using the same full professional Search contract.

Unconfirmed Schedule A opportunities are not equivalent to closed comps or verified active listings and may not be silently mixed into valuation evidence without labeling.

### Market context axes

Status class is one dimension of the market universe. It is not the only one. The same eligible universe is also cut by the market the subject actually competes in, and a comp set that is correct by status can still be wrong by segment.

CMA positions the subject against:

- **Building** — the subject's own building as a market of its own: what closed in it, what is Active or In Contract in it, what expired in it, what re-priced in it, and over what period. Building identity remains the canonical Building/Unit; the building is a level of market context here, not a new object;
- **Ownership type** — condo, co-op and other applicable ownership form, kept distinct because ownership form changes carrying cost, buyer pool and time to sell. Condo and co-op economics keep their actual source meaning and are not flattened;
- **Property type / subtype**;
- **Bedroom / size segment** — how the relevant bedroom count and size range of that building, micro-neighborhood or neighborhood has behaved, as a unit of analysis and not only as a per-comp attribute;
- **Price band** — the band the subject sits in and the bands immediately above and below it, because demand, negotiation and time to sell do not move uniformly across price;
- **Micro-neighborhood** — the several-block market the subject actually competes in. This is a finer level than the neighborhood/borough/map-area geography used as a Search criterion in §5.4, not a rename of it;
- **Neighborhood**;
- **Price-change history** — the subject's and the comps' asking-price trajectory as evidence of where the market pushed back. A verified Price Change means what §5.12 says it means; §6 consumes that definition rather than restating it;
- **Carrying cost** — common charges, maintenance, taxes and other recurring charges with correct source semantics, so two comps at the same price are not presented as equivalent when they carry very differently;
- **DOM / market velocity where supported** — how fast the relevant cut is actually clearing, not only how long one record has been listed.

Each axis is a cut of the same eligible market universe. An axis is never assembled from a second market index; Search, CMA and Reporting read the same universe.

**Do not display a market-context axis Mallan cannot source.** Every axis derivation passes the §5.5 Search field contract and resolves to `SUPPORTED`, deliberately `LOCAL / DERIVED` with documented semantics, or `UNAVAILABLE`. Market velocity in particular fails visibly rather than being derived from an unverified field, and a cut with too few records states its record count instead of presenting a rate as market truth.

## 6.4 Comp selection

Mallan may suggest comps but the Agent chooses the final comp set.

For a **sale CMA, the final valuation comp set consists of verified Closed transactions**. Active, Pending/In Contract and Expired/Withdrawn/TOM market-history records may appear in clearly separated market-context sections, but they may not be silently counted as Closed valuation comps or blended into a closed-comp average/range as though their asking prices were transaction prices.

A professional comp table should show, where verified/applicable:

- property/address;
- status/source;
- ask/contract/close or offering-price evidence with clear provenance;
- relevant date;
- beds/baths/rooms;
- size;
- $/area where meaningful;
- property/ownership/type;
- DOM where a real listing exists;
- carrying cost where verified/applicable;
- Agent inclusion/exclusion state.

Carrying cost shown in a comp table, in market context or anywhere else in CMA is computed by the one deterministic shared calculator/scenario engine of §8 and labeled a deterministic calculation. **CMA does not carry its own carrying-cost formula.** A second formula here would be a parallel calculator truth, and the divergence would stay invisible until the two results drifted apart. This ownership split — §8 computes, §6 presents — must be confirmed before either section is built. The alternative, §6 computing its own carrying-cost and sensitivity numbers, is recorded here and not adopted, and reopening it requires an explicit decision.

Each suggestion should explain why it is relevant, such as same building, same ownership/property type, similar beds/baths/size, recency and geography.

The inverse is equally required. Where Mallan suggests a comp the Agent sets aside, or ranks one comp below another, it states why that comp is weaker — wrong segment, wrong line or exposure, dated evidence, condition, unusual sale circumstances or thin provenance. The Agent defends the set that was used and the set that was not, and the stated reason travels with the inclusion/exclusion state.

Same-building evidence is explained as behavior, not only as a similarity flag. Where the subject's building has its own market history, CMA shows what closed in it, what is competing in it now, what failed to sell in it and what re-priced in it, because that is the first argument an Agent makes in a listing appointment.

Ownership-type differences are explained rather than only matched. Where a comp differs in ownership form, CMA states how that difference affects price, carrying cost, buyer pool and time to sell instead of presenting the two records as interchangeable.

No unexplained black-box similarity score may be the only rationale.

## 6.5 Comp facts and source hierarchy

Use verified facts.

Do not substitute asking price, Expired-listing ask, Active ask or Schedule A offering price for close price simply because close price is missing.

If another authorized evidence source such as correctly matched ACRIS evidence or a permitted historical-listing source is used, label its provenance rather than pretending it came from the provider close/status field.

Underlying listing/source professional information may be available internally where authorized, but it is not part of the client CMA/report identity unless required by the applicable client-display rule.

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
- adjusted Closed-comp range;
- active competition;
- Pending/In Contract context;
- **Expired / failed-market price points as a separate market-resistance section**;
- private/new-development opportunity context;
- current market movement;
- Agent discussion range;
- Seller/Landlord/Buyer/Investor strategy scenarios where appropriate.

Where Expired evidence is shown, the report should state what the source proves — market exposure, recorded asking price/history, dates/status and lack of a completed sale for that observed episode — and must not automatically claim the price alone caused the failure.

For Seller-side strategy, a useful discussion may distinguish competitive, market and aspirational positioning without pretending the system can guarantee an outcome.

Positioning is not the same as segment behavior. The result must also give the Agent the differences that change the conclusion:

- **Price-segment differences** — the price band the subject sits in behaves differently from the bands above and below it in the same neighborhood, and the CMA says so rather than presenting one neighborhood-wide pattern;
- **Micro-neighborhood differences** — why two comps a few blocks apart are not interchangeable, using the micro-neighborhood level defined in §6.3;
- **Carrying-cost sensitivity** — how the pricing conclusion moves as carrying cost moves, so a Seller or Landlord sees what recurring cost does to the achievable price and the likely buyer. The scenario is computed by §8; §6.7 presents the result.

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

A later market/source change never silently rewrites a CMA already delivered. It can flag that the analysis may be stale and allow a new version.

Staleness alone is not useful. Because a saved version retains its comp/source snapshots, market-universe criteria, selections, adjustments and range, Mallan can state what actually changed between one CMA version and the next, using the same visible change intelligence §7.10 requires after Refresh/Reverify:

```text
CMA v2 — WHAT CHANGED SINCE v1
Closed evidence: 2 new closings in the building
Adjusted Closed-comp range: $1.42M–$1.55M → $1.48M–$1.60M
Comp 4: Active → In Contract
Comp 7: asking price reduced $75,000
Active competition: 3 → 5 units
Agent discussion range: unchanged
```

The prior version is never rewritten and never deleted. The change narrative is an addition to the new version, and where a comparison cannot be made it says so rather than implying no change.

## 6.9 Client-facing CMA/report identity

Client CMA/report displays only the Mallan Agent/Broker who created the report, using the creator's governed professional profile/title snapshot, except any third-party attribution specifically required by the applicable source/share rule.

**Internal Cotality/source professional email/phone/member ID and source owner PII must never leak into a client CMA/report merely because Backend Search contains it.**

## 6.10 CMA actions

From Search and from an opened Backend Listing/Opportunity, authorized Agent should be able to:

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

System calculation is labeled specifically. A number produced by the one deterministic shared engine of §8 is shown as a **deterministic calculation** and is reproducible from its stated inputs. A number produced by a model or an estimate is shown as **system analysis** and is never presented with the authority of a reproducible computation.

Agent input and Agent output are also distinct. An **Agent assumption** is an analysis input override under §6.2 and stays separate from the sourced canonical value. An **Agent professional conclusion** is the recommendation the Agent owns at the end of §6.7. The two are never merged into a single Agent label, because one is an input to the analysis and the other is professional advice.

These labels are the CMA-facing expression of the truth/provenance categories of §10.5. Do not create a second provenance vocabulary.

## 6.12 CMA acceptance

CMA is not finished until Property → market universe → selected comps → adjustments → strategy → save → reopen → version → client-safe preview/share/email works with verified data, reproducible history and no unauthorized source-professional/PII leakage.

For sale CMA specifically, closure also requires proof that the **final valuation comp set is Closed**, while Active/Pending and Expired/removed/TOM evidence remain separately labeled context; secondary-source historical observations preserve canonical identity/provenance/rights; and an Expired asking price can never silently become a transaction price.

---

# 7. BACKEND LISTING WORKSPACE — THIRD PRIORITY

After Search and CMA, the current backend Listing experience must be rebuilt into a full professional working record.

The current backend cannot remain a limited row/form that forces the Agent to leave the listing to perform basic brokerage actions.

## 7.1 Every backend listing/opportunity must open as a readable professional page

When an Agent clicks a listing/private opportunity from Search, Client history, CMA, Showing, Listing inventory or another backend surface, it must open a **full readable source-aware Workspace**, not merely an edit form.

The Workspace should display, according to source and permissions:

- full address/building/unit identity;
- price/rent/offering price with source;
- status/availability and relevant dates;
- beds/baths/rooms/size/floor;
- property/ownership/type/subtype;
- charges/taxes/maintenance where verified/applicable;
- remarks/source description where authorized;
- building/property features and amenities;
- open houses for true active listings;
- listing/source history where verified;
- authorized photo gallery;
- floor plans with source/right state;
- video/3D/other authorized media;
- map/location context;
- available Offering Plan/Schedule A/building-document status where applicable;
- internal source/provenance/currentness/share eligibility;
- authorized source listing-professional/owner contact for Agent use;
- Client history when opened in Client context;
- comments/discussion;
- showings;
- showing/open-house feedback;
- originating lead/inquiry where the record generated one;
- CMA/Compare actions;
- Share/Email actions only when eligible.

The Agent should be able to understand the property/opportunity without opening a separate public website, while still having a direct source-link action for verification.

A listing that generates business must show the business it generated. An inquiry, showing request, open-house registration or brokerage-assigned lead created from a listing links back to that canonical Listing/Property/Unit, so the Agent can see who came from this record and so the VIEWS → SAVES → INQUIRIES → SHOWINGS → OFFERS funnel of §10.3 is a real chain rather than five unconnected counts. Lead source, assignment, acceptance and conversion remain governed by §19.1; the Workspace shows the link, not a second lead record.

Showing and open-house feedback is visible on the listing that produced it, and the Agent records and reads it without leaving the Workspace. Feedback themes, anonymization and the editable Agent Assessment are governed by §10.3; the Workspace surfaces and links and does not define a second feedback model.

## 7.2 Full media experience

Backend detail must support a professional photo/media viewer for media Mallan is authorized to use:

- hero image;
- gallery;
- full-size/lightbox viewing;
- floor-plan viewing;
- video/3D where available and authorized;
- media ordering/source/right awareness where relevant.

A Schedule A unit can use canonical Building/amenity media while keeping unit-specific floor plan/media separate. Do not mislabel building representative media as unit media.

## 7.3 Source-aware controls

### Third-party Cotality listing

Read-only source listing, but Agent can still:

- Save;
- Comment;
- attach to Client/Opportunity;
- Send/Email/Share client-safe version where permitted;
- Compare;
- Add to CMA;
- Schedule Showing;
- open available Offering Plan/building documents where Mallan independently has authorized access;
- view Client history;
- review professional listing information internally.

No edit controls may imply Mallan can change the third-party source listing.

### Private supplemental / StreetEasy reference

Read-only source observation plus Mallan-owned Agent workflow actions:

- Open Source;
- Verify Cotality Match;
- Verify Availability;
- review source listing agent/brokerage or owner/FSBO contact internally;
- Save/Attach to Buyer;
- Comment;
- Compare/Add to CMA with source labeling;
- request/schedule showing after source coordination;
- Send/Share only if client-share eligibility is proven;
- mark stale/replaced/reconciled-to-Cotality without deleting source history.

No control may imply Mallan is the listing broker unless Mallan actually holds the listing authority.

### Schedule A / offering-plan opportunity

Read-only offering-plan source facts plus Mallan workflow actions:

- Open Offering Plan / Schedule A / amendment source;
- Verify latest plan/amendment;
- Verify Availability;
- link sponsor/selling professional/contact where verified;
- link current Cotality or authorized supplemental listing when found;
- attach authorized Building/amenity media;
- attach unit floor plan when authorized;
- Save/Attach to Buyer;
- Compare/Add to CMA as appropriately labeled context;
- Share only if client-share eligibility and availability presentation are appropriate.

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
OPEN SOURCE
VERIFY AVAILABILITY
SAVE / ATTACH
COMMENT
COMPARE
ADD TO CMA
SEND / EMAIL — IF ELIGIBLE
SHARE — IF ELIGIBLE
CONTACT SOURCE PROFESSIONAL / OWNER — INTERNAL
SCHEDULE SHOWING — WHEN COORDINATED
OFFERING PLAN / SCHEDULE A / BUILDING DOCS
ADD OPEN HOUSE — MALLAN-AUTHORED ONLY
REFRESH / REVERIFY
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

These are contextual actions on the same canonical Listing/Property/Unit foundation.

## 7.5 Share / Email from backend

Agent must be able to share/email an eligible listing/opportunity directly from the Backend Workspace without copying information into another tool.

```text
BACKEND LISTING / OPPORTUNITY
↓
VERIFY CLIENT-SHARE ELIGIBILITY
↓
SELECT CLIENT / RECIPIENT OR SHARE METHOD
↓
CLIENT-SAFE + SOURCE-COMPLIANT TRANSFORMATION
↓
PREVIEW
↓
SEND / EMAIL / SHARE LINK
↓
RECORD DELIVERY IN CLIENT × LISTING / UNIT HISTORY
```

The send event becomes part of the same Client × Listing/Unit history used by Saved Search.

## 7.6 Comment from backend

Agent must be able to add/view contextual comments directly from the Workspace.

When a Client is selected, comments can attach to Client + Opportunity + canonical Property/Unit/Listing and become visible in that Client's Search/history as permitted.

Internal comments remain internal; client-shared comments use the shared visibility rules.

## 7.7 CMA from backend

Agent must be able to open CMA/Compare directly from the Workspace.

Possible actions:

- Use as Subject Property;
- Add as Comp/context with source label;
- Compare with selected listings/opportunities;
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

For third-party/supplemental listings, Mallan must not create or modify a source open house as though Mallan were the listing broker. Agent may only schedule internal/client showing-related workflow as permitted.

## 7.9 Refresh / reverify — explicit professional action

The Backend Workspace must include **Refresh / Reverify** so the Agent can request current source truth without recreating the record.

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

### Supplemental / Schedule A reverify

```text
REVERIFY
↓
CHECK CURRENT COTALITY IDENTITY FIRST
↓
CHECK AUTHORIZED SOURCE / AG PLAN-AMENDMENT STATE
↓
COMPARE WITH PRIOR SOURCE SNAPSHOT
↓
UPDATE CURRENTNESS / AVAILABILITY / RIGHTS STATE
↓
RECONCILE TO CANONICAL UNIT / LISTING
↓
FLAG MATERIAL CHANGE
```

No source reverify may use an automated extraction method that lacks current source authorization.

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

External return values must not silently overwrite Mallan-authoritative fields.

## 7.10 Refresh must produce visible change intelligence

After Refresh/Reverify, the Agent should see a concise result such as:

```text
REFRESHED JUST NOW
Source: Cotality
Price: unchanged
Status: Active → In Contract
Photos: 2 added
```

or:

```text
REVERIFIED JUST NOW
Source: NYS AG Schedule A + Agent confirmation
Availability: Unconfirmed → Confirmed Available
Offering price: unchanged
Current Cotality listing: none found
```

or:

```text
NO MATERIAL CHANGE
Last verified: 10:42 AM
```

Material verified changes may feed Saved Search update rules. Rejected listings still follow the Reconsider exception.

## 7.11 Mallan-authored Listing Workspace organization

A practical structure can be:

```text
OVERVIEW
DETAILS / EDIT
MEDIA
MARKETING
ACTIVITY
OPEN HOUSES / SHOWINGS
SHOWING FEEDBACK
CMA / MARKET
COMMENTS
REPORTS
OFFERS / APPLICATIONS
DEAL / TRANSACTION
DOCUMENTS / OFFERING PLAN / SCHEDULE A
DISTRIBUTION / HISTORY
```

The exact UI can be refined during design, but all functions remain tied to the same Listing/Property foundation.

Offers and Applications are not the end of the listing's story. From the listing the Agent must also see the accepted deal, where that deal stands and whether the resulting commission is blocked or ready, and answer whether this listing is in contract, with whom, and what is holding the payment, without leaving the record.

**These surfaces are read-throughs of canonical truth, not listing-local records.** The deal stage model is §20. The stage tracker on the canonical Transaction is §23.5. Payment readiness, the blocking reason and the canonical compensation chain are §20.4, and the three compensation layers of §19.3 may never be collapsed. The Workspace displays the current stage, the readiness state and the blocking reason and links to the canonical Transaction; it does not host commission fields and does not create a second deal state.

**LINK versus OWN must be confirmed before this is built.** The rule above is written as LINK. The alternative reading — the listing owning its own deal and commission surfaces — would place commission data on a listing record, risks collapsing the three compensation layers of §19.3, and creates the parallel transaction and commission truth §1 forbids. Confirm the choice before the Deal / Transaction tab is designed.

## 7.12 Backend Listing acceptance

Backend Listings/private opportunities are not finished until an Agent can:

1. open any Search result as a full readable source-aware record;
2. view all authorized facts and media;
3. see verified current status/availability/price/history/source;
4. Refresh/Reverify and see what changed;
5. resolve/reconcile the same unit across Mallan/Cotality/StreetEasy/Schedule A without duplicates;
6. save/attach it to the correct Client/Opportunity;
7. see prior Client × Listing/Unit history;
8. add/read comments;
9. contact source professional/owner internally where permitted;
10. coordinate/schedule a showing when appropriate;
11. Add to CMA / Compare without re-finding it;
12. open/share an available authorized Offering Plan/Schedule A/building-document set where applicable;
13. preview and Send/Email/Share a client-safe version only when eligible;
14. record that send back into Client history;
15. for Mallan-authored listings, edit authorized fields;
16. Quick Add Open House without opening the full listing form;
17. manage media/marketing/reports/offers/documents/distribution as applicable;
18. keep all third-party/supplemental source layers read-only.

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
- carrying-cost sensitivity;
- financing-structure comparison;
- sell-v-re-rent;
- comparison;
- 1031 replacement analysis.

Current taxes, fees and regulatory assumptions use current verified/effective-date sources or explicit assumptions.

Saved analyses retain both sourced facts and explicit assumptions and attach to the same Party/Opportunity/Property/Transaction.

A saved analysis is not an archive entry. It is evidence about a decision a client is actually weighing, and the system treats it as such.

- **Sell-v-re-rent** answers, at lease expiration or vacancy, whether the owner is better selling or re-renting. It is the analysis the Landlord journey branches on at Hold/Sell/Rental Analysis and again at Expiration / Renew / Re-rent / Seller Opportunity in §13;
- **Financing-structure comparison** answers what the difference between financing structures does to the outcome, saved and named as a comparison rather than recomputed as one arrangement at a time;
- **Carrying-cost sensitivity** answers how the Seller, Landlord or Investor conclusion moves as carrying cost moves. §8 owns this calculation; §6.7 presents it inside the pricing discussion.

Saved scenarios are an input to System Intelligence. A saved scenario, its assumptions and its material revisions may raise a signal under §22, traceable on the same explainability chain §22.2 requires of every signal. Intelligence explains a scenario and points at what to review next; it does not re-run it with changed assumptions.

AI may explain results but not change formulas/inputs silently.

**Opening a calculator is not a statement of client intent.** Mallan does not conclude that a client wants to sell, buy, refinance or re-rent because a scenario was opened, prefilled or saved. A saved scenario is one evidence point, weighed with what the client actually said, the state of the Opportunity and the rest of the canonical record. Intelligence may surface a scenario as evidence; it may not present it as motivation, and it may not raise a client-intent signal on scenario activity alone.

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

The full set of governed marketing outputs is one named Mallan Marketing Toolkit. Campaign/E-blast is one channel inside the Toolkit, not the whole of marketing.

```text
MARKETING TOOLKIT
├── LISTING MARKETING
│   ├── listing description copy — short and long form
│   ├── marketing headlines
│   ├── website listing content
│   ├── campaign / e-blast content
│   ├── share pages
│   ├── social content
│   ├── video / visual marketing
│   ├── approved digital collateral
│   ├── approved printable collateral
│   └── authored market-update content
├── CLIENT AND PROSPECT MARKETING
│   ├── buyer/tenant match sends
│   ├── Seller and Landlord prospecting
│   ├── past-client follow-up
│   ├── referral-source follow-up
│   └── client/prospect market updates
└── BROKERAGE MARKETING
    ├── approved marketing templates
    ├── newsletters
    ├── brokerage/neighborhood market reports
    ├── Agent and brokerage announcements
    └── other Broker-approved business materials
```

A new marketing format is added to the Toolkit. It is not built as a separate marketing product with its own listing data, its own recipients or its own approval path.

Where an output lands on a surface another section governs, the Toolkit owns the marketing composition and that section keeps the surface rule. Public website listing content is composed here and published through Frontend Search (§5.1) and, where applicable, provider publishing (§4.6). Media rights, provenance, ordering and audience eligibility remain governed by §11.11. The professional identity carried on business cards, letters and approved marketing comes from §2.4. Profile-derived professional materials keep the approval/history rules in §17.3.

Approved marketing templates are versioned, Broker-approved and distinguish controlled language from editable fields in the same governance model as the brokerage form/document library (§11.4, §11.5). Do not build a second template-governance model for marketing.

Newsletters, announcements and published market reports are recurring or standalone brokerage outputs rather than listing campaigns. Their recipients use the same centrally governed consent/suppression rules as every other Mallan send (§3.2). A brokerage/neighborhood market report draws on the same market universe as Search and CMA (§6.3) and is not a third market truth.

Social content, video and printed collateral remain governed Mallan outputs even though delivery leaves Mallan. What Mallan can and cannot change after publication is stated in §9.5.

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

Every campaign output is derived from canonical records rather than typed fresh into the campaign:

```text
CANONICAL LISTING / PROPERTY
CANONICAL AGENT AND BROKERAGE IDENTITY
APPROVED MEDIA
AUDIENCE
PURPOSE
COMPLIANCE / RIGHTS
```

A marketing output holds no independent copy of any of these inputs. Firm name, license identity, office and required brokerage attribution are supplied by the same governed professional identity as the Agent profile (§2.4) and are not retyped per output or per template.

Step 3 Content composes governed assets rather than free-typed text:

- Mallan-authored listing description copy, versioned, approved once and reused across outputs;
- short-form and long-form variants of that same approved description, because a share page, an e-blast, a social post and printed collateral do not carry the same length;
- marketing headlines;
- the media set selected for this output.

Copy variants are variants of one approved description. A surface-specific variant is not a place to state a different price, a different status or a different property fact.

Media selection chooses an approved subset of canonical media for this output. Selection does not create rights: source/provenance, rights/permission, ordering and audience eligibility remain governed by §11.11, and media that is not eligible for the intended audience is not selectable.

Purposes may include:

- New Listing;
- Price Change;
- Open House;
- Buyer Match;
- Tenant Match;
- Investor/1031;
- Follow-up;
- Seller prospecting;
- Landlord prospecting;
- Past-client follow-up;
- Referral-source follow-up;
- Authored Market Update;
- Custom approved message.

Audiences may come from:

- matching Buyer/Tenant Saved Searches;
- selected canonical clients/prospects;
- approved CRM segments;
- cooperating-agent audiences where appropriate;
- past clients and closed-relationship contacts;
- referral-source contacts;
- imported recipient sets where lawful/appropriate and deduped against consent/suppression rules.

Private supplemental inventory may participate in a selected-client share only through its explicit client-share gate. It does not automatically become campaign/e-blast inventory.

Do not create a second marketing contact database.

Agents should not need to upload a spreadsheet for ordinary client-match e-blasts when Mallan already has the correct canonical recipients.

Seller and Landlord prospecting are marketing purposes, not representation decisions. Prospecting eligibility for a given owner remains the separate governed decision described in §6.3; a source status observation does not authorize the send. Landlord prospecting stays rental-distinct and carries the rental advertising and fee-disclosure treatment required of rental marketing.

A closed deal is not standing consent to market. Past-client and referral-source audiences are decided by the same governed consent/unsubscribe/suppression rules as every other send (§3.2).

Referral progress, check-ins, obligations and fees remain owned by §19.9. Marketing may address a referral source as an audience; it does not track the referral.

An Authored Market Update is Agent-composed market commentary sent to a selected audience. It is distinct from the per-listing Saved Search Market Update in §5.12, which is an automatic verified status-change send tied to one listing the client already follows. One client must not receive two competing market-update semantics for the same event.

## 9.3 Search drives marketing

```text
LISTING / MATERIAL CHANGE
↓
REVERSE MATCH TO SAVED SEARCHES
↓
SOURCE / SHARE ELIGIBILITY
↓
AGENT REVIEW WHERE REQUIRED
↓
CAMPAIGN / SEND IF AUTHORIZED
↓
CLIENT RESPONSE / ENGAGEMENT
↓
LISTING REPORTING / CLIENT HISTORY
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

A material canonical listing/source change should be consumable by:

```text
SEARCH
CLIENT ALERT EVALUATION
LIVE SHARE INVALIDATION / RE-RENDER
MARKETING FOLLOW-UP
LISTING REPORTING
SYSTEM INTELLIGENCE
```

No second editable price/status truth inside marketing assets.

## 9.7 Marketing compliance routing

Every Toolkit output that is public or client-directed is advertising, whether it is a share page, an e-blast, a social post, website listing content, digital or printed collateral, a newsletter, a market report or an announcement.

```text
COMPOSED OUTPUT
↓
SOURCE / SHARE / MEDIA RIGHTS
↓
REQUIRED ATTRIBUTION AND BROKERAGE IDENTITY
↓
ADVERTISING AND FAIR HOUSING LANGUAGE REVIEW
↓
AGENT / BROKER APPROVAL WHERE REQUIRED
↓
DELIVERY / PUBLICATION
```

Marketing applies current governed rule records rather than its own copy of a rule. Advertising, Fair Housing, media/rights and web-publication requirements are carried in the Rule Registry (§21) under their issuing authority, and the registry governs which of them apply to a given output, audience and surface.

Fair Housing review covers Mallan-authored copy, headlines, imagery and audience selection, not only required disclosures.

Rental marketing carries the current required rental fee and disclosure treatment. A rental output does not publish through a sale-marketing path that omits it.

If rights, required attribution or required language are not proven for the intended surface and audience, the output does not publish. The Agent may keep the draft; Mallan does not send it.

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
├── client matching reach
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

Private supplemental opportunity activity belongs primarily to Buyer/Client history and source verification, not Seller/Landlord Listing Reporting unless Mallan later becomes the authorized listing brokerage.

## 10.1 Internal report versus client report

The internal Agent/Broker reporting view may show provenance, data gaps, tracking gaps, source categories and technical/internal evidence needed to understand the report.

The client report is a polished client-safe decision product. It should not look like an engineering diagnostic page.

Engineering truth labels such as internal source/tracking enums belong in internal provenance, not as prominent client-facing design language.

## 10.2 Report-author identity — hard rule

A client-facing Listing Report identifies only the Mallan Agent/Broker who created the report, plus any source/listing-broker attribution specifically required by current law/rules for the content being shown.

The report must never leak internal source-agent/owner PII merely because Backend Search stores it.

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
- client matching reach where tracked;
- open-house/showing promotion activity.

Matching reporting states how many canonical Buyer/Tenant Saved Searches matched the listing and how many of those matches were share-eligible and actually sent. It is Mallan activity evidence, not client identity: the matched client, that client's criteria and any private supplemental opportunity activity stay in Buyer/Client history and never appear in a Seller/Landlord report.

The matching engine is §5.16. Listing Reporting carries only its representation in the report and may not re-run or redefine a match. Where matching is not tracked for a reporting period it reports as `NOT TRACKED`, never as `0`.

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
- segment movement — the price band, property type and geography the listing competes in;
- current CMA/pricing context.

Market Position reports both levels: the listing's direct comparable competition and the movement of the segment around it. The segment is defined by the §6.3 market universe.

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
AUTHORIZED SUPPLEMENTAL SOURCE
NYS AG OFFERING PLAN / SCHEDULE A
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

The client report must never use AI as a pathway to reintroduce stripped source-professional/owner fields.

---

# 11. COMMUNICATIONS / COMMENTS / SHARE / DOCUMENTS / AGREEMENTS / MEDIA

## 11.1 One communication history

Portal/system comments, approved email delivery, report sends, listing sends and other supported channels are communication events attached to one canonical history.

Communication attaches to the correct context, including as applicable:

- Party;
- Opportunity;
- Property;
- Listing;
- Supplemental Source Observation;
- Search;
- CMA;
- Calculator scenario;
- Campaign;
- Report;
- Showing/Open House;
- Offer/Application;
- Agreement/Amendment;
- Offering Plan/Schedule A/Building Document;
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

For third-party/private inventory, `Share` additionally depends on current source/advertising/share eligibility; existence in Agent Search is not authorization to republish.

## 11.4 Governed brokerage form and document library

Mallan maintains one governed brokerage form/document library rather than uncontrolled Agent copies scattered across the system.

The library can contain multiple current broker-approved templates and source forms for the same client role. Seller, Landlord, Buyer and Tenant are **relationship/workflow categories, not one hard-coded document each**.

Templates/forms may vary by applicable dimensions such as:

- Seller / Landlord / Buyer / Tenant;
- sale / rental;
- co-op / condo / 1–4 family / other applicable property type;
- building/ownership type where it differs from property type — co-op corporation, condominium, rental building, townhouse/1–4 family, sponsor/new-development or other applicable ownership form;
- agency/representation type — the agency relationship created with the client, which is a separate input from the listing-exclusivity structure below;
- open listing / exclusive agency / exclusive right / other approved representation structure;
- buyer/tenant representation, limited-services or Touring Agreement structure;
- exclusive / non-exclusive scope where the applicable agreement permits it;
- compensation structure and other negotiable business terms;
- approved internal/external form or signature workflow;
- workflow stage — where the client relationship currently stands, since the same client requires different documents before touring, at engagement and at deal stage;
- current broker/legal/REBNY/NYS requirements.

**Do not design one Seller form, one Landlord form, one Buyer form and one Tenant form with a property-type field attached.** The dimensions above cross into distinct governed form families, and a family is chosen rather than configured.

Seller-side families include co-op, condo, townhouse/1–4 family and other applicable residential/investment property, each with its applicable representation structures, amendments and extensions.

Landlord-side families include co-op rental, condo rental, rental building/unit and other applicable property types, each with its applicable representation structures, amendments and extensions. A co-op rental carrying board application/sublet approval is not the same governed form as a unit in a rental building.

Buyer-side families include buyer representation, the applicable Touring/limited arrangement, applicable property/transaction contexts and amendments. Tenant-side families include tenant representation, applicable rental contexts and amendments.

§11.6 selects from these families. §12, §13, §14 and §15 point at this library rather than naming role form families of their own.

The catalog must remain configurable and versioned. Adding, retiring or revising an approved form must not require hard-wiring a compensation amount, exclusivity choice or legal clause into application code.

The catalog is **not limited to the forms known when this plan is written.** Maya/Broker adds an approved form later as an uploaded document, a stored file, an authoritative external link, an approved template record or a tracked external signing/form workflow. Adding, replacing or superseding a form must not require rebuilding the Seller, Buyer, Landlord or Tenant workflows.

The exact official form name, version, applicability and source authority must be verified from authoritative NY/DOS/REBNY/RLS/UCBA sources before a form is marked current or required. The authority, effective/version date and last-verified date live in the §21.3 Rule Registry record for that form. **An unverified form is not required, does not gate a workflow and is not presented to a client as a required disclosure.** Do not guess the legal form set from historical custom or from another market's practice.

Statutory/required agency disclosures and Fair Housing disclosures remain separate records from the representation/listing agreement even when Mallan coordinates them in one signing workflow.

Initial disclosure/form families include at minimum:

```text
ANTI-DISCRIMINATION / FAIR HOUSING DISCLOSURE OR NOTICE
SELLER / BUYER AGENCY DISCLOSURE
LANDLORD / TENANT AGENCY DISCLOSURE
TOURING DISCLOSURE / TOURING-RELATED FORM
PROPERTY-SPECIFIC DISCLOSURE
RLS / DISTRIBUTION / OWNER AUTHORIZATION FORM
OTHER CURRENT NYS / DOS / REBNY / RLS / UCBA BROKER-APPROVED
FORMS AS THEY BECOME APPLICABLE
```

Agency disclosure is graded by side. The Seller/Buyer instrument and the Landlord/Tenant instrument are separate catalog entries, not one disclosure with a role switch. Anti-discrimination and Fair Housing material remain one family; do not open a second Fair Housing authority beside it. A Touring-related disclosure or form is a separate catalog entry from the Touring Agreement described in §11.6.

### Governed form catalog record

The catalog entry defines the blank approved form as a governed object and retains:

```text
FORM ID
OFFICIAL / APPROVED NAME
FORM FAMILY
AUTHORITY / SOURCE
SOURCE URL, IF APPLICABLE
UPLOADED FILE, IF APPLICABLE
VERSION / REVISION DATE
EFFECTIVE DATE
SUPERSEDED DATE, IF ANY
SELLER / BUYER / LANDLORD / TENANT APPLICABILITY
PROPERTY / TRANSACTION APPLICABILITY
WORKFLOW STAGE
REQUIRED / CONDITIONAL / OPTIONAL / BROKER POLICY
SIGNATURE / ACKNOWLEDGMENT REQUIREMENT
DELIVERY REQUIREMENT
BROKER APPROVAL REQUIREMENT, IF ANY
CURRENT / SUPERSEDED STATUS
```

Three records stay distinct and reference each other rather than flattening into one schema:

```text
§21.3 RULE RECORD
why the form applies and under what authority
↓
§11.4 CATALOG RECORD
what the blank approved form is
↓
§11.7 EXECUTED RECORD
what actually happened with this client
```

**Do not merge the catalog record into the executed record.** A catalog version describes a form; an executed record describes an event and never changes when the catalog changes.

### Form source types

Mallan supports more than one document-delivery model, and the catalog carries which one applies:

```text
UPLOADED GOVERNED DOCUMENT
→ Mallan retains the approved file and version

AUTHORITATIVE LINK
→ Mallan retains the authoritative URL and the form metadata

MALLAN TEMPLATE
→ Mallan generates/prefills an approved governed form (§11.7)

EXTERNAL SIGNING / FORM WORKFLOW
→ Mallan records the link/workflow and completion evidence (§11.7)
```

Maya can upload an approved blank form and have that file become a governed catalog version, held the way §11.10 holds governed Offering Plan files. Do not build a second document store for it.

**An authoritative link is not a substitute for governance.** Where a required form must be delivered from an authority's own site rather than copied, Mallan still knows what form it is, why it applies, its current version, when it was supplied, whether acknowledgment or signature was required, whether it was completed and what client/opportunity/property/deal it belonged to.

### Obligation status

Each catalog entry carries its obligation level for a given context:

```text
REQUIRED
CONDITIONALLY REQUIRED
BROKER POLICY
OPTIONAL
NOT APPLICABLE
SUPERSEDED
```

These are form states. They are not the §24.2 requirement proof states, which use `SUPERSEDED` for a different purpose. The two vocabularies are never read as one enum.

A statutory must and a broker-policy preference are different obligations and are never presented as the same blocker. A form that does not apply to this client is marked `NOT APPLICABLE` rather than left standing as missing. **Do not assume every form applies to every client or transaction.**

### Broker-maintained catalog operations

Maya/Broker must be able to:

```text
ADD FORM
ADD AUTHORITATIVE LINK
UPLOAD REPLACEMENT VERSION
MARK FORM SUPERSEDED
SET / CHANGE APPLICABILITY
SET REQUIRED / CONDITIONAL / OPTIONAL STATUS
ASSIGN ROLE / WORKFLOW STAGE
REVIEW CURRENT FORM INVENTORY
SEE WHICH ACTIVE CLIENTS USE AN OLD VERSION
```

Retiring a form and marking it superseded are different operations. Superseding names the successor version and the supersession date; retiring ends use without one.

Catalog administration is Broker authority over the library. It is separate from the per-document change authority in §11.5, which governs what an Agent may edit on an issued document. Do not merge the two approval models.

## 11.5 Controlled language, negotiable fields and Broker approval

Each template distinguishes:

```text
CONTROLLED / LOCKED LANGUAGE
broker/legal/required provisions that may not be silently edited

NEGOTIABLE / CONFIGURABLE FIELDS
terms the applicable agreement permits the Agent and client to negotiate

BROKER-APPROVED EXCEPTION
non-standard permitted term, clause or structure requiring Broker review before issue
```

Negotiable fields may include, where the approved template permits:

- compensation amount/rate/formula;
- compensation source and client payment obligation;
- term/effective/expiration dates;
- geographic, property or transaction scope;
- exclusive/non-exclusive structure;
- services included;
- owner-authorized external-broker compensation where applicable;
- other broker-approved variable terms.

The system may provide broker-approved defaults, choices or ranges for operational convenience, but a default is **not** a fixed brokerage fee and may not be represented as one.

Agents may change permitted negotiable fields within their authority. A non-standard or controlled-language change routes to Broker approval before the document is sent when approval is required.

Mallan records who changed a negotiable term, what changed, whether Broker approval was required, the approval/rejection decision, approver and timestamp.

## 11.6 Agreement selection — context guides; software does not dictate the business term

Mallan should help the Agent select an appropriate approved form from client role + transaction + property + representation structure + source/workflow + current rule context.

The system must not infer that:

```text
TOURING AGREEMENT = $0
BUYER AGREEMENT = FIXED %
TENANT AGREEMENT = FIXED FEE
SELLER EXCLUSIVE = FIXED %
LANDLORD EXCLUSIVE = FIXED FEE
```

Lead/source does not determine compensation.

A **Touring Agreement** is an approved limited option when a buyer initially wants to tour without committing to a longer-term relationship. It may be structured with a fee or without a direct buyer fee as permitted by the actual approved agreement and current rules. Its compensation, scope, duration and exclusivity come from the executed form, not from a Mallan hard-coded assumption.

Buyer and Tenant representation templates likewise may have fee, no-direct-client-fee or other negotiated compensation structures permitted by the approved agreement and current rules. Mallan stores the actual negotiated terms rather than labeling the entire relationship with a simplistic `fee/no-fee` boolean.

### Required-document computation

Form selection is a pull: the Agent has decided to issue a document and needs the right one. Mallan must also compute the push. **The Agent should not have to remember every required document manually.**

The system answers one question for a live client relationship: for this client role, property, representation structure and business stage, what documents are required now?

```text
CLIENT / OPPORTUNITY
↓
ROLE + REPRESENTATION + PROPERTY / TRANSACTION CONTEXT + WORKFLOW STAGE
↓
CURRENT GOVERNED FORM RULES (§11.4, §21.3)
↓
DOCUMENT CHECKLIST
├── REQUIRED NOW
├── REQUIRED LATER
├── CONDITIONALLY REQUIRED
├── COMPLETED
├── DECLINED / REFUSED, WHERE RELEVANT
├── EXPIRED / SUPERSEDED
└── NOT APPLICABLE
```

The inputs are the §11.4 dimension list in full, including building/ownership type, agency/representation type and workflow stage. §11.4 owns the dimensions; this computation consumes them and does not keep a second, shorter list.

`REQUIRED LATER` is not a blocker. A document that is not yet due is not displayed as outstanding, or the checklist becomes noise the Agent learns to ignore.

Documents drive workflow gates and status wherever the applicable brokerage workflow requires them, at every role and every stage, not only at buyer-journey entry and payment readiness. This is the one rule; §14, §15, §20.3, §20.4, §22.1, §23.4 and §23.5 consume it and do not restate it.

A governed, versioned, correctly-attached library is still not complete until it computes obligations. **A file folder of approved PDFs is not a form library.**

**Held for Maya decision — early-relationship document context.** Agency disclosure, Fair Housing material and touring forms are required at the start of a client relationship, before any Transaction exists. §20.3 states that documents attach to the canonical Transaction/Referral and never to a bucket with no deal context. §11.1 already names Party and every Opportunity type as canonical contexts, so the model supports attaching an early document to the Party/Opportunity that made it required. Maya decides whether §20.3's rule reads as a prohibition on contextless documents or as a requirement of Transaction context outright. Until she decides, an early-stage required document attaches to the Client/Opportunity that generated the obligation and carries forward to the Transaction when one is created.

### Role examples

These examples define system structure only. Current authoritative rules determine the exact required set.

```text
SELLER
→ applicable Seller/Buyer agency disclosure
→ anti-discrimination / Fair Housing material
→ appropriate Seller representation/exclusive agreement
→ additional property/RLS forms as applicable

LANDLORD
→ applicable Landlord/Tenant agency disclosure
→ anti-discrimination / Fair Housing material
→ appropriate Landlord representation/exclusive agreement
→ property/rental/RLS forms as applicable

BUYER
→ applicable Seller/Buyer agency disclosure
→ anti-discrimination / Fair Housing material
→ Touring-related or Buyer representation form as applicable
→ additional deal/property forms as the relationship progresses

TENANT
→ applicable Landlord/Tenant agency disclosure
→ anti-discrimination / Fair Housing material
→ Touring/representation-related form as applicable
→ application/deal forms as the relationship progresses
```

The `Execute agreement + required disclosures` step in §12, §13, §14 and §15 resolves to this computation. Do not paste a role document list into a journey.

## 11.7 Generate / send / sign / record

Where Mallan controls the delivery/signature workflow:

```text
SELECT APPROVED TEMPLATE
↓
PREFILL VERIFIED KNOWN CLIENT / PROPERTY / AGENT DATA
↓
AGENT COMPLETES NEGOTIABLE FIELDS
↓
BROKER APPROVAL IF REQUIRED
↓
PREVIEW
↓
EMAIL / E-SIGN
↓
PENDING
↓
SIGNED / DECLINED / REFUSED / EXPIRED / REPLACED
↓
EXECUTED BROKERAGE RECORD
```

Where an approved external signature/form workflow is used, Mallan tracks the agreement source, applicable property/tour/client context, sent/signed/expiration state and permitted executed-copy/signature evidence rather than recreating the external legal form merely to duplicate it.

Every generated/signed agreement or disclosure retains, as applicable:

- template/form ID and version;
- source/workflow;
- parties/signers;
- Agent/Brokerage identity snapshot;
- Property/Listing/Opportunity/Transaction context;
- negotiable terms as executed;
- sent/delivered/viewed state where available;
- signature/completion/refusal evidence;
- effective/expiration date;
- the applicability determination that made this form required for this client, retained on the record rather than recomputed later;
- the exact document or link supplied — for an uploaded or authoritative-link form, the stored file or URL and the version that was authoritative at the moment of supply, recorded the way §11.10 records the exact Offering Plan/Schedule A/set/version supplied;
- audit history.

## 11.8 Executed originals, amendments and retention

A signed/executed document is immutable historical evidence and is never silently mutated.

```text
ORIGINAL EXECUTED AGREEMENT
↓
AMENDMENT / REPLACEMENT WHEN REQUIRED
↓
OLD TERM / NEW TERM
↓
EFFECTIVE DATE
↓
PARTIES / SIGNATURES
↓
CURRENT OPERATING TERMS
```

Preserve the original and every amendment/replacement.

An **extension** is a distinct instrument from an amendment. An extension continues an existing term without changing the negotiated business terms; an amendment changes a term. Both preserve the original, carry their own effective date, parties and signatures, and appear in the chain above.

Where the amended document is a brokerage policy or another brokerage↔Agent operating document (§11.12), the amendment creates a **new required acknowledgment from every active Agent**. The prior acknowledgment is evidence of the prior version only and is never treated as acceptance of the amended one.

Mallan adopts a **minimum three-year brokerage-record retention policy** for the executed representation/listing agreements, agency/Fair Housing disclosures, sale contract, deal sheet, lease agreement and related executed brokerage transaction records identified by the applicable workflow. Longer retention, legal hold, complaint/dispute/litigation preservation or another controlling requirement overrides the minimum. Exact legal trigger, document scope and any longer current requirement must be verified from authoritative law/rule sources before implementation rather than guessed.

Three years is a minimum retention period, not an automatic deletion date.

A catalog form version change is not a client-record change:

```text
CURRENT FORM VERSION CHANGES
≠
HISTORICAL CLIENT RECORD CHANGES
```

A newer approved form version governs future use according to its own effective/applicability rules. The catalog record states whether relationships already executed on the prior version are grandfathered for their remaining term or must be re-issued on the new version, and by when. The same computation answers which active clients are still running on a superseded version; §18 reports it.

## 11.9 Transaction document families

Document families share **one canonical document infrastructure** — the single `Documents / Agreements / Amendments` object in §3 — while retaining different business meanings. Adding a family does not add a document store, a signature workflow or a retention policy. **Do not collapse all paperwork into one `Document` meaning, and do not split one infrastructure into one store per family.**

The brokerage record should distinguish at least:

- representation/listing/Touring Agreement/limited-service agreements and amendments;
- statutory/required agency disclosures;
- Fair Housing disclosures/evidence;
- property-specific disclosures required by the subject Property/Unit rather than by the relationship, with the applicable New York instruments verified under §11.4 rather than named from memory;
- offer/application documents, including the tenant application, financial documents and guarantor materials collected in §15 and the offer materials in §20;
- deal sheets;

- fully executed sale contracts when received/applicable;
- fully executed leases when received/applicable;
- referral/co-broker documents where applicable;
- RLS/distribution/owner authorization forms — the executed owner or source authorization that makes publication, syndication or client-facing distribution lawful, which is a different instrument from the owner-authorized external-broker compensation term recorded under §19.5. §4 and §9 gate publication on that authorization being proven; this family is the record the gate resolves to;
- commission/payment closeout documents;
- authorized Offering Plans/Schedule A/property/building documents.

The sale contract and lease are transaction documents attached to the canonical Transaction; Mallan is not a generic legal-contract authoring system for attorney-drafted transaction instruments.

Brokerage↔Agent operating documents are a separate class, governed in §11.12. They are not client transaction documents and are not filed here.

**Held for Maya decision — taxonomy placement.** The class is carried in §11.12 so that this subsection's transaction framing stays true. If Maya prefers one document-family taxonomy instead, §11.9 is renamed and re-scoped to cover both classes and §11.12 folds into it. Until she decides, §11.12 is the single home for the class; do not also list brokerage↔Agent documents in this subsection.

## 11.10 Offering Plan / Schedule A library / Agent use / client courtesy / future public access

Offering Plans are a first-class **Building/Property document set**, not a Listing-specific duplicate and not a private client financial-document bucket.

Canonical structure:

```text
BUILDING / PROPERTY
↓
OFFERING PLAN RECORD
├── ORIGINAL PLAN
├── SCHEDULE A SNAPSHOT(S)
├── AMENDMENTS / SUPPLEMENTS
├── SOURCE / PROVENANCE
├── PLAN / FILE IDENTIFIER WHERE AVAILABLE
├── ACQUIRED / ADDED DATE
├── LAST SOURCE CHECK
└── COMPLETENESS / CURRENTNESS STATE
```

Useful states include:

```text
AVAILABLE — VERIFIED SET
AVAILABLE — PARTIAL / AMENDMENTS MAY BE MISSING
REQUEST PENDING
NOT ON FILE
SOURCE NOT YET VERIFIED
```

Mallan must never label an Offering Plan/Schedule A set as complete/current merely because one PDF exists. The original plan and amendments/supplements retain separate identities, dates, provenance and completeness state.

### Agent use

Authorized Agents should be able to search/open Offering Plans/Schedule A by Building/Property and use them while advising clients, preparing for a showing/offer, reviewing building information and supporting a transaction.

Schedule A also feeds the private new-development/sponsor unit universe described in §4.5; document truth and searchable unit observations remain linked to the same plan/amendment version.

If an Offering Plan is not on file, Mallan should show that clearly and support an acquisition/request workflow rather than silently substituting another building's documents or an unverified copy.

### Courtesy delivery to a Buyer

If a Buyer does not already have the applicable Offering Plan and Mallan has an authorized copy/set available, an Agent may provide access to that Buyer **at $0 as a Mallan brokerage courtesy**.

This courtesy access is separate from brokerage compensation and does not change the Buyer's representation agreement, commission terms or agency relationship.

The delivery event should record:

- Buyer/Opportunity;
- Building/Property;
- exact Offering Plan/Schedule A/set/version supplied;
- delivery date/method;
- Agent;
- whether the set was verified complete or identified as partial;
- any applicable disclaimer/currentness notice.

### Future public paid-access option — held until source/rights proof

Mallan may later choose to offer public self-service access to Offering Plans for a **configurable fee** if Mallan obtains a sufficiently broad, lawfully usable document corpus and the right to provide that access.

This is a future optional document-access product, not a current brokerage fee and not a hard-coded price.

Before public paid access is authorized, Mallan must verify and document:

- authoritative source and acquisition method for each document/set;
- lawful storage, reproduction, redistribution and commercial-access rights;
- public-record/FOIL or other source-use conditions where applicable;
- privacy/redaction requirements;
- original-plan + amendment completeness/currentness behavior;
- consumer-facing disclaimers and no-legal-advice boundary;
- pricing, taxes, payment/refund rules and receipts;
- access/download controls and audit history;
- process for correcting/removing a document if source/rights status changes.

The public price must remain configurable and may be changed by Mallan without an application-code deployment.

Do not encode a managing-agent market price or another third-party fee as Mallan's required price merely because it is observed in the market.

## 11.11 Media

Media remains canonical to Property/Listing/Building with source/provenance, rights/permission, ordering, type and audience eligibility.

The governed media record carries:

```text
MEDIA IDENTITY
SOURCE
RIGHTS
PROPERTY / BUILDING / UNIT RELATIONSHIP
ACCURACY
CURRENTNESS
STORAGE RIGHT
AGENT-USE RIGHT
CLIENT-USE RIGHT
PUBLIC-USE RIGHT
ATTRIBUTION
ADVERTISING / FAIR-HOUSING COMPLIANCE
```

Accuracy and currentness are media truth, not media plumbing. A photograph, floor plan or video represents the unit as it was on a date. A three-year-old image of a since-renovated unit is an advertising-accuracy exposure even when the relationship rule is satisfied, so the record carries the capture/as-of date, the last verification and whether the media is still believed to depict current condition. **Do not present media of unknown currentness as current condition.**

Rights are graded, not one permission. Storage right, Agent-use right, client-use right and public-use right are held separately, because a source may permit Mallan to store an image and show it to an Agent without permitting client delivery or public republication. This is the canonical grading; the source-specific statements about supplemental media in §4.5.2 and about Offering Plan documents in §11.10 are instances of it.

Attribution and the advertising/Fair-Housing determination are attributes of the media record, not only conditions checked at the moment of sharing. Media is a regulated advertising surface: an image, floor plan, caption or staging treatment can carry a discriminatory advertising message or an unauthorized claim exactly as text can. §21 owns the pre-use check chain; §11.11 owns the stored determination that check resolves to.

Do not copy/re-publish external media merely because a URL exists. Media use must remain within the verified source/rights contract.

For new-development/Schedule A opportunities, standard building/amenity media and unit floor plans remain distinct source/rights classes.

## 11.12 Brokerage ↔ Agent operating documents

The documents between Mallan and its licensees are a governed document class of their own. They are not client transaction documents, they do not attach to a Transaction, and they are not filed under the transaction families in §11.9.

They attach to the canonical Agent lifecycle named in §27.2 — the same governed lifecycle that resolves runtime Agent, authentication, CRM, directory, profile and listing attribution. Do not open a second Agent lifecycle for paperwork.

The class includes, where applicable:

- Independent Contractor Agreement;
- Agent/Associate Broker Policy;
- Policy Acknowledgment;
- confidentiality and technology/trade-secret protections;
- executed commission/split terms;
- brokerage referral policy;
- E&O requirement and proof of coverage;
- license, continuing-education and REBNY records;
- W-9/tax records;
- onboarding documents;
- offboarding/deactivation records;
- policy amendments and re-acknowledgments.

These run on the same infrastructure as every other governed document: catalog record and version under §11.4, generate/send/sign/record under §11.7, executed originals, amendments and retention under §11.8. Do not build a second document store, a second signature workflow or a second retention policy for them.

§2.2 states that Mallan agents are independent contractors operating their own book of business. The Independent Contractor Agreement is the executed document that creates that relationship. §2.2 remains the authority for the supervision boundary itself and is not restated here.

The executed compensation-plan document authorizes an Agent's split. **§19.6 remains the single authority for split values, plan versioning, approved adjustments and immutable adjustment history.** §11 holds only the document — its version, effective date, signatures and retention. Do not record a split value in two places.

The brokerage referral policy governs how Mallan agents may give and accept referrals. It is not the executed referral agreement with an outside brokerage or agent, which remains a §19.9 instrument recorded under §11.9.

Confidentiality and technology/trade-secret documents bind an active or departing Agent with respect to Mallan client, CRM and source data — the same data §4.5 and §21 treat as rights-gated and §5.18 fences at the client-facing payload boundary.

§17.1 owns the E&O requirement, status, expiration and reminder state. §11.12 owns the stored proof-of-coverage document. W-9/tax records are collected here so that the accountant-ready annual payment records in §18 have a lawful upstream identification document behind them.

Agent lifecycle:

```text
ONBOARDING DOCUMENT SET REQUIRED
↓
EXECUTED / ACKNOWLEDGED
↓
AGENT ACTIVE
↓
POLICY AMENDMENT → NEW ACKNOWLEDGMENT REQUIRED
↓
OFFBOARDING / DEACTIVATION
├── EXECUTED DOCUMENTS RETAINED UNDER §11.8
├── CLIENT / OPPORTUNITY REASSIGNMENT DECIDED AND RECORDED
├── PIPELINE AND COMMISSION OBLIGATIONS RESOLVED UNDER §19
└── ACCESS / VISIBILITY REMOVED
```

An Agent does not become active until the required onboarding document set is complete. **Deactivation never deletes an executed document and never silently reassigns a client relationship.**

**Held for Maya decision — the HR boundary.** §17 states that the system makes professional obligations visible and actionable without turning Mallan into an HR system. This class is contractual and regulatory paperwork: Mallan holds no payroll, performance-management or employment-file function, and adding one would also cut against the independent-contractor posture in §2.2. Maya decides whether §17's boundary is stated as that narrower rule or whether this class is scoped down. Until she decides, build only the documents listed above.

---

# 12. SELLER OPERATING JOURNEY

The Seller journey does not begin at a Seller Party that already exists.

```text
SELLER LEAD
→ PARTY RESOLUTION
→ SELLER OPPORTUNITY
→ PROPERTY / OWNERSHIP / AUTHORITY
→ CONSULTATION
```

Lead source, capture, assignment, contact, qualification, follow-up and conversion/loss outcome are governed by §19. §12 begins where a resolved Lead becomes a Seller Opportunity.

Party Resolution matches the inbound Lead against existing canonical Parties before any record is created, enforcing the §3.1 identity rule at intake. **Do not create a new Party because a new inquiry arrived.** A past Buyer, a current Landlord, a prior Seller and a referred owner may already be one canonical identity.

Before a listing/representation agreement is prepared, Mallan establishes who owns this Property and who is authorized to sign for it, using the Owner, Trustee, Executor, member, manager, partner, officer and Authorized Signatory relationships defined in §3.1. Ownership and signing authority for the Property is a different question from the listing edit Authority of §4 and is not satisfied by it.

Consultation is an explicit stage. The seller meeting, stated goals, timing, motivation, condition observations and constraints are recorded on the Seller Opportunity before the CMA and net-proceeds analysis are prepared.

```text
Seller Party / Entity / Participants
→ Seller Opportunity
→ Property
→ Sale CMA / Market Intelligence
→ Net-Proceeds / Decision Analysis
→ Select approved listing/representation template
→ Negotiate listing compensation + other permitted terms
→ Record owner-authorized external buyer-broker compensation, if any
→ Broker approval if non-standard/required
→ Execute agreement + required disclosures
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
→ Confirm actual owner-paid external-broker compensation, if any
→ Deal Documents / Payment Readiness
→ Mallan commission calculation from executed agreement terms
→ Post-close Relationship
→ Ongoing Party Relationship
```

Closing ends the Seller Opportunity, not the relationship. The journey returns to the canonical Party, which remains eligible for future Buyer, Landlord, Investor and Seller Opportunities on the same identity. **Do not retire the Party because the deal closed.** Signals that a past Seller may be approaching a new decision are governed by §22.

---

# 13. LANDLORD OPERATING JOURNEY

```text
Landlord Party / Entity / Participants
→ Landlord Opportunity
→ Property
→ Rental CMA / Market Intelligence
→ Hold/Sell/Rental Analysis
→ Select approved listing/representation template
→ Negotiate landlord-side compensation + other permitted terms
→ Record owner-authorized external tenant-broker compensation, if any
→ Broker approval if non-standard/required
→ Execute agreement + required disclosures
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
→ Confirm actual owner-paid external-broker compensation, if any
→ Deal Documents / Payment Readiness
→ Mallan commission calculation from executed agreement terms
→ Expiration / Renew / Re-rent / Seller Opportunity
```

Landlord is a recurring relationship. The Landlord Opportunity does not close at Move-in.

```text
LEASE / MOVE-IN
↓
TENANCY PERIOD
↓
LEASE EXPIRATION MONITORING
↓
RENEW?
├── YES → RENEWAL / NEW TERMS / NEW RECORD
├── NO → RE-RENT
├── SELL → SELLER OPPORTUNITY
└── OTHER BUSINESS DECISION
```

Tenancy Period is a state of the Landlord relationship. `Rented` is a Listing Episode status; it describes the listing, not the relationship, and one may not stand in for the other.

Lease expiration is actively monitored and produces an Agent action rather than sitting as a date inside an executed document. The firm-wide view of lease-expiration exceptions belongs to §18; the signals that combine expiration, vacancy and rental economics into a Seller conversation are governed by §22.

A renewal produces new terms and a **new tenancy record**. It never overwrites the prior tenancy. The executed original and its amendment/replacement chain follow §11.8, and the prior tenancy's dates, rent and Tenant remain readable history.

SELL opens a Seller Opportunity on the same canonical Party and Property. It does not convert the Landlord Opportunity and does not merge Landlord and Seller workflow semantics; Hold/Sell/Rental Analysis earlier in this journey supplies the evidence for that branch.

OTHER BUSINESS DECISION is a recorded owner outcome, not an unhandled state.

The canonical Landlord relationship retains, as applicable:

- lease start;
- lease expiration;
- current rent;
- rent history for the Property/Unit across successive tenancies;
- renewal state;
- vacancy expectation;
- the current Tenant relationship;
- prior rental Listing Episodes;
- next Landlord follow-up.

The current Tenant relationship links the Property/Unit to the canonical Tenant Party in occupancy. It is a link, not a copy, and it does not expose the Tenant's own Opportunity inside the Landlord workspace.

Rent history is this Property/Unit's own achieved rents across successive tenancies. It is not the leased/rented comparable evidence of a Rental CMA, and neither substitutes for the other.

Vacancy expectation is an operating fact about when the unit is expected to become available, and it drives re-rent timing and pipeline. It is not the vacancy/reserve sensitivity input of the §8 calculators.

Next Landlord follow-up uses the canonical Tasks / Calendar / Reminders object. Do not create a landlord-only reminder mechanism.

---

# 14. BUYER OPERATING JOURNEY

```text
Buyer Party / Entity / Participants
→ Buyer Opportunity
→ Choose approved Touring Agreement or buyer-representation agreement as applicable
→ Negotiate scope / term / compensation within the approved template
→ Broker approval if non-standard/required
→ Execute agreement + required disclosures before the applicable workflow gate
→ Qualification / POF / Preapproval
→ Backend Buyer Search
   ├── Mallan/Cotality current inventory
   ├── private supplemental sale inventory
   └── Schedule A/new-development opportunities
→ Client-assigned Saved Search(es)
→ New + Price/Status/Availability Market Updates
→ Client × Listing/Unit History / Comments
→ Agent verifies source / availability / share eligibility where required
→ Listing/Opportunity Sends / Engagement
→ Show / Discuss / Pass / Reconsider
→ Showing
→ CMA / Property Intelligence / Calculators
→ Offering Plan / Schedule A / Building Documents when available and relevant
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

A buyer who initially does not want a longer commitment may use an applicable broker-approved **Touring Agreement**. Mallan must use the actual executed agreement terms for compensation/scope/duration and must not hard-code a fee/no-fee conclusion.

When an applicable Offering Plan is available, an Agent may provide it to the Buyer at $0 as a brokerage courtesy, with the exact document set/currentness state recorded. If the plan is unavailable or incomplete, Mallan must say so rather than imply that the Buyer received a complete current set.

A private supplemental or Schedule A match is first an Agent research opportunity. It becomes a client-facing property presentation only after its availability and applicable share/advertising rights are sufficiently established for that mode of delivery.

Acceptance does not create a new truth. The accepted offer, and the Transaction that follows it, remain joined to the specific Buyer Opportunity, Property, Listing/source, executed representation agreement and Offer that produced them. The anchoring chain is governed by §20.

A closed Buyer becomes an Owner, and the Owner is a live source of future business.

```text
BUYER
→ OWNER
→ POSSIBLE FUTURE LANDLORD / SELLER / INVESTOR
```

The chain runs on the same canonical Party and the same canonical Property. Each later role is a **new role Opportunity on the existing identity**, never a reinterpretation of the Buyer Opportunity. Buyer, Landlord, Seller and Investor remain separate first-class workflows under §1. Surfacing when an Owner may be approaching a Landlord, Seller or Investor conversation is governed by §22.

---

# 15. TENANT OPERATING JOURNEY

The Tenant journey begins at a Tenant Lead, resolved to a canonical Party under §3.1 before a Tenant Opportunity exists. Lead source, capture, assignment, contact, qualification, follow-up and conversion/loss outcome are governed by §19.

```text
Tenant Party / Entity / Participants
→ Tenant Opportunity
→ Select approved tenant-representation agreement when the client chooses representation
→ Negotiate scope / term / compensation within the approved template
→ Broker approval if non-standard/required
→ Execute applicable agreement + required disclosures
→ Qualification
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

Tenant showing/representation rules must follow current applicable law/REBNY/NYC requirements. Mallan must not invent a universal pre-showing representation block where current authority does not require one.

Tenant business does not end at Move-in.

```text
MOVE-IN
→ RENTED
→ LEASE TERM
→ LEASE EXPIRATION
↓
RENEW?
├── YES → RENEW
├── NO → NEW TENANT SEARCH
└── BUY → BUYER OPPORTUNITY
```

Rented and Lease Term are states of the Tenant relationship. `Rented` as a Listing Episode status describes the listing and does not stand in for the client state.

The Tenant's lease expiration is actively monitored and produces an Agent action. It is not a label at the end of the journey. The renter-to-buyer signal that combines lease expiration, current/expected rent and buy-search activity is governed by §22.

BUY opens a Buyer Opportunity on the same canonical Party. It is a new role Opportunity, not a converted Tenant Opportunity, and Tenant and Buyer workflow semantics remain separate under §1. Rent Comparison / Rent-v-Buy earlier in this journey supplies the evidence for that branch.

Mallan retains and works the Tenant relationship through the lease term for renewal, relocation and homeownership opportunities. **Do not close the Tenant relationship at Move-in.**

---

# 16. INVESTOR / 1031

Investor/1031 uses the same Party, Property, Backend Search, Property Intelligence, CMA, Decision, Communication and Transaction systems with specialized acquisition/rent/NOI/cap/cash-on-cash/ROI/financing/vacancy/hold/exit/1031 analysis.

A 1031 workflow may specialize criteria and scenarios but may not create a separate property/search universe.

An Investor is normally also a current Owner or Landlord and a future Seller or Buyer. Investor analysis reads the same canonical identities rather than a separate investor record set:

```text
INVESTOR OPPORTUNITY
├── PARTY (same identity)
│   ├── current ownership
│   ├── Seller / Landlord / Buyer Opportunities on that Party
│   └── prior transactions
└── PROPERTY / UNIT (same identity)
    ├── current rent / rent history
    ├── valuation / CMA
    ├── financing
    └── exit / 1031 analysis
```

Each of those remains its own first-class Opportunity under §1. The Investor workspace links to them; it does not absorb, restate or merge them, and the rule that role workspaces must not duplicate the Party applies unchanged.

The prohibition on a separate universe extends beyond property and search to CRM, contacts, communications, documents and commissions.

Investor Intelligence reads across roles; it does not merge them. Whether a cross-role view may present another role's working record rather than a link to it requires Broker confirmation against §1 before implementation.

---

# 17. AGENT SUPPORT / PROFESSIONAL OBLIGATIONS / MY PROFILE

The system should make professional obligations visible and actionable without turning Mallan into an HR system.

An Agent is a governed lifecycle, not a set of scattered attributes. One ordered chain connects how an Agent enters the firm, operates inside it and leaves it:

```text
RECRUIT / ADD AGENT
→ IDENTITY
→ LICENSE / PROFESSIONAL DATA
→ BROKERAGE AGREEMENTS / POLICIES
→ REQUIRED ACKNOWLEDGMENTS
→ ACCOUNT / INVITATION
→ LOGIN
→ MY BUSINESS
→ PUBLIC PROFILE / DIRECTORY
→ LISTING / CLIENT / DEAL ACTIVITY
→ COMMISSION / REFERRAL
→ PROFESSIONAL REQUIREMENTS
→ DEACTIVATE / OFFBOARD
```

Runtime Agent identity, authentication, CRM, directory, public profile, listing attribution and professional designation resolve from this one chain. There is no second Agent record anywhere in the system.

Account / Invitation is a stage, not an afterthought. The professional record exists first; the account that lets the Agent log in is provisioned from it and stays linked to it.

**The boundary of this lifecycle is an open Broker decision and is not settled here.** §2.2 and the paragraph above hold that Mallan is not an HR system and does not micromanage an independent contractor's business, while the representative broker's supervision responsibility remains non-delegable. Read as brokerage records and access — who holds an account, whose license is current, whose listings and clients transfer on exit — the chain is consistent with both. Read as a recruiting pipeline and personnel management, it is not. Maya decides which one Mallan builds before implementation.

Brokerage↔Agent operating documents — Independent Contractor Agreement, policy and acknowledgment, confidentiality, the executed compensation-plan document, E&O proof, tax records, onboarding and offboarding records — are governed in §11.12 and surface in Agent My Business contextually. §11.12 carries the class and the open boundary question; do not restate either here.

## 17.1 My Professional Requirements

Agent My Business should show applicable:

- real-estate license type/number/status/expiration;
- license renewal due state;
- continuing-education completion/status;
- REBNY renewal/status/member identifier where relevant;
- insurance type/status/expiration/proof where applicable;
- errors-and-omissions (E&O) coverage where Mallan requires it, with the proof of coverage stored as a governed document under §11.12 rather than as a status field alone;
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

## 17.5 Brokerage ↔ Agent documents and acknowledgments

The Agent's own brokerage-side operating documents are a distinct document family: the independent-contractor/associate agreement and amendments, firm policies, the applicable commission plan/schedule, required firm forms and any required tax or insurance items. They are defined and retained once in §11 and surfaced here in context. §17 does not create a second document library.

The Agent sees, for each required item, whether it is provided, executed, current or missing.

Required acknowledgments are recorded, not assumed. When Mallan requires an Agent to acknowledge a policy or notice, the acknowledgment, its version and its date are retained as evidence under §11, and missing acknowledgments appear as firm exceptions under §18.

## 17.6 Deactivation / offboarding

An Agent's departure is a governed transition, not a deletion.

At deactivation Mallan resolves, as applicable:

- account/login access and permissions;
- public profile and directory presence;
- listing attribution and reassignment of active Mallan listings;
- reassignment of Clients, Opportunities and active Deals;
- pending commission, referral and payment obligations;
- outstanding documents and professional-requirement flags;
- record retention after departure.

**Do not delete the Agent.** Historical listing attribution, transaction records, commission history and executed documents remain intact and readable under the retention rules in §11.8. Deactivation removes access and public presence; it does not rewrite the past.

Reassignment moves ownership of the work. It does not alter the canonical Party, Property, Listing or Transaction identity underneath it.

---

# 18. BROKERAGE VIEW — SIMPLE FIRM OVERSIGHT

Brokerage View is practical exception-based oversight, not corporate bureaucracy.

Primary areas:

```text
OVERVIEW
AGENTS
LEADS
CLIENTS
LISTINGS
DEALS
MONEY
COMPLIANCE
INTELLIGENCE / EXCEPTIONS
TECHNOLOGY
```

Firm-scope `CLIENTS` is oversight over the same canonical Party and Opportunity records each Agent already works: representation coverage, required agreements and disclosures, source/share-rights exceptions and service follow-through. **It is not a second client roster and does not duplicate My Business client screens.**

`INTELLIGENCE / EXCEPTIONS` is the entry point to the firm exception set below and the brokerage signals in §22.1. It surfaces those signals; it does not compute a separate set of brokerage numbers.

Maya should see firm exceptions such as:

- agent professional-renewal flags;
- brokerage-generated lead distribution/status; lead intake and assignment exceptions across every authorized lead source, including a public inquiry that produced no CRM record and a Lead with no assigned Agent;
- active Mallan listings; Seller/Landlord listing exceptions such as engagement decline, an overdue owner report and a pending price/marketing decision, raised as the signals in §22.1;
- approaching lease expirations on Mallan-represented tenancies and landlord inventory, watched as a dated exception against the expiration/renew outcomes in §13 and §15;
- private supplemental inventory/source-rights/share-eligibility exceptions;
- Schedule A units with stale/unconfirmed availability when attached to an active Buyer workflow;
- Buyer/Tenant active-decision signals raised by §22.1 on the Client × Listing relationship memory in §5.11;
- Seller, Landlord, Buyer and Tenant Opportunities with no movement for their expected working interval, before any deal exists;
- deals needing support/supervision;
- agreement/template/source/version, negotiation, Broker-approval and amendment status;
- current form-catalog inventory — every approved form with its version, effective date, applicability and obligation status, reviewable as a standing list rather than only as exceptions;
- active client relationships still executed on a superseded form version, computed from the template/form ID and version retained on every executed record under §11.7;
- missing required disclosures/executed transaction documents;
- Offering Plan/document-set availability or incomplete-source flags where relevant to active Buyer deals;
- commissions/referrals/payment queue;
- owner-authorized external-broker compensation recorded at signing and confirmed at close/lease completion;
- brokerage operating revenue/receivables and accountant-ready annual payment records;
- compliance/advertising exceptions;
- listings whose promised marketing or owner-reporting cadence has lapsed;
- practical Agent production/performance;
- Brokerage Intelligence requiring Broker attention, from the BROKERAGE INTELLIGENCE view in §22.1;
- REBNY/RLS/provider/source technology flags.

No Manager role is required to make Brokerage View work.

The Brokerage Technology area should summarize the current health of the rule/provider/source contract without exposing feed plumbing to ordinary Agents. Useful summary items include:

- RLS/rule set last verified;
- current provider;
- provider metadata last checked;
- supplemental source-rights status;
- NYS AG offering-plan source last checked;
- open field/mapping/attribution/display/share flags;
- public Search contract status;
- Agent Search contract status;
- unresolved critical provider/source uncertainty.

---

# 19. LEADS / PERFORMANCE / MONEY / COMMISSIONS / REFERRALS

## 19.1 Brokerage leads

Brokerage-generated leads use a simple assignment history:

- source;
- original inquiry as submitted;
- Listing/Property context where relevant;
- Campaign context where relevant;
- Party resolution result;
- assigned Agent;
- date;
- accepted/declined/reassigned;
- response/follow-up;
- next action;
- conversion.

Conversion is one of four terminal outcomes:

```text
CONVERTED
LOST — reason recorded
NURTURE — no current transaction, stay in contact
FUTURE — dated future intent
```

A Lead that does not convert records why it was lost, or stays in Nurture or Future with an owner and a next action. A Lead is not deleted and does not sit in an undefined state.

Do not overbuild lead routing when simple explicit assignment works.

Brokerage distribution is one lead source among many. Every Lead keeps the facts above whatever its source. A Lead is a first-class record: it is how a person who is not yet a client enters Mallan, and it exists before any Opportunity does.

```text
LEAD SOURCE
↓
INQUIRY / LEAD
↓
PARTY RESOLUTION
↓
ASSIGNMENT / OWNERSHIP
↓
CONTACT
↓
QUALIFICATION
↓
ROLE / INTENT
↓
OPPORTUNITY
↓
FOLLOW-UP
↓
REPRESENTATION
↓
ACTIVE CLIENT
↓
CONVERTED / LOST / NURTURE / FUTURE
```

**Lead lifecycle is capture and state, not routing automation.** The restraint above continues to govern ASSIGNMENT / OWNERSHIP: assignment stays explicit, and no scoring, ranking or automatic distribution layer is built on it. Whether that restraint limits routing only, or the remaining stages as well, is a Broker decision that has not been made.

Authorized lead sources, where available and permitted:

```text
web inquiry
Listing inquiry
showing request
open house
email
phone
manual entry
Agent-originated business
brokerage lead
referral
prior client
marketing / e-blast
approved campaign
Saved Search / registration activity
authorized prospecting source
```

This is the only lead-source vocabulary. Brokerage View and System Intelligence read it; they do not keep their own.

**Party resolution.** An inquiry resolves against existing Party identity before anything else happens. A prior client, a current client in another role and a party on an existing deal attach to the canonical Party they already are. Do not create a new person because an inquiry arrived through a public form. Party identity rules are in §3.1.

**Role / intent.** Before an Opportunity exists, the Lead records what the person actually wants: sell, rent out, buy, rent, invest, or not yet known. Unknown and mixed intent are recorded states, not blanks. The role vocabulary is §3; the Lead only determines which one applies.

**Opportunity.** A qualified Lead with a determined role becomes the matching Seller, Landlord, Buyer, Tenant or Investor Opportunity. The Lead is not copied or retired; it remains the origin history of that Opportunity.

**Representation.** Representation is the executed agreement work in §11.4 through §11.7 and in the journeys in §12 through §15. The Lead lifecycle records only that the transition happened.

**Active client.** An Opportunity plus an executed representation agreement is an active client, worked in the role client workspace in §23.4.

Durable web inquiry:

```text
PUBLIC INQUIRY
→ CRM RECORD
```

**Every public inquiry becomes a durable CRM record.** Email delivery alone is not capture. A notification that reaches an inbox and nothing else leaves the firm with no Lead, no assigned Agent, no follow-up and no proof the inquiry was ever answered.

## 19.2 Practical Agent performance

Performance is computed from truthful canonical activity already recorded in the system. Mallan does not keep a separate activity log to be counted and does not credit volume of activity as a result. The truth of the underlying engagement numbers is governed by Marketing truth in §9.4.

The purpose is to help the Agent and the Broker improve service, not to gamify behavior.

Useful performance is transparent and limited to what helps the business:

- leads/response;
- representations;
- listings;
- transactions;
- production/GCI where applicable;
- marketing/report follow-through;
- client follow-up;
- compliance/professional-requirement exceptions.

## 19.3 Three compensation layers — never collapse them

Mallan keeps three different compensation concepts separate:

```text
1. CLIENT AGREEMENT COMPENSATION
   negotiated Seller / Landlord / Buyer / Tenant obligation and terms

2. OWNER-AUTHORIZED EXTERNAL-BROKER COMPENSATION
   Seller/Landlord-side cooperating broker amount/structure, if any

3. INTERNAL MALLAN COMPENSATION
   brokerage share, Agent split/plan, internal co-Agent allocation,
   referral, approved adjustment and Agent payout
```

Layer 3 must never determine Layer 1 or Layer 2.

A compensation percentage, amount, flat fee, formula, payer/source or client obligation may not be hard-wired merely because a particular template, property type, lead source or Agent is selected.

## 19.4 Client-agreement compensation is negotiated and template-driven

Seller, Landlord, Buyer and Tenant compensation comes from the approved agreement actually negotiated and executed with the client.

The applicable template may support, where permitted:

- percentage;
- flat amount;
- other broker-approved objectively defined formula/structure;
- client direct obligation;
- permitted compensation source(s);
- when compensation is earned;
- when compensation is due/payable;
- maximum/limit where required by the applicable agreement/rule;
- shortfall treatment where applicable;
- other approved negotiable compensation terms.

Defaults are convenience only. Mallan must never represent an internal default as a fixed commission or market-standard fee.

The executed agreement is the contractual source record. A closing or commission screen may not silently substitute a newly typed compensation term that conflicts with the executed agreement.

If compensation terms change after execution, preserve the signed original and use an authorized amendment/replacement workflow as applicable.

## 19.5 Seller/Landlord owner-paid external-broker compensation

For Mallan's Seller/Landlord operating model, compensation to the external cooperating buyer/tenant-side broker, when present, is treated as an **owner-authorized owner obligation**, not as an internal Mallan commission split.

At Seller/Landlord agreement signing, Mallan records the owner-authorized external-broker terms, including as applicable:

- none / offered;
- amount/rate/formula;
- intended recipient side/type;
- payer = Owner;
- source agreement/template/version;
- effective date;
- any Broker approval/amendment evidence.

At closing for a sale, or the applicable lease/deal completion point for a rental, Mallan records the actual/confirmed external-broker payment information available to the brokerage, including the final amount and recipient brokerage/professional identification where known/required.

This produces a clear two-point record:

```text
EXCLUSIVE / OWNER AGREEMENT SIGNED
→ owner-authorized external-broker compensation recorded

CLOSING / LEASE-DEAL COMPLETION
→ actual external-broker compensation confirmed/recorded
```

If the owner changes those terms after the exclusive is signed, the change must follow the applicable authorized amendment/approval/document workflow. History is never overwritten.

Mallan does not infer or calculate this as a share of Mallan's own listing-side commission unless an actual executed agreement expressly creates that relationship. The external-broker record and Mallan's listing-side compensation remain separate truths.

Before implementation, exact disclosure, documentation, delivery and rule language must be verified against then-current NY law/DOS, REBNY/RLS/UCBA and applicable NYC requirements rather than inferred from historical custom.

## 19.6 Internal Mallan commission truth

After the client/external compensation obligations are known, each canonical Transaction can reference:

- actual gross Mallan brokerage compensation due/received under the executed client agreement;
- applicable Agent split/plan;
- brokerage share;
- internal co-Agent allocation where applicable;
- referral obligation;
- approved adjustments;
- expected Agent amount;
- payment receipt state;
- commission review/approval;
- Agent payout;
- paid date;
- tax year.

Compensation plans/splits are versioned. Do not assume one universal split.

Agent cannot silently edit broker-approved internal compensation terms.

Broker-approved adjustments retain immutable history.

## 19.7 Agent Money view

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
- executed client compensation basis;
- gross Mallan brokerage compensation;
- split basis;
- referral if applicable;
- expected Agent amount;
- documents required/missing;
- payment received state;
- commission review state;
- payment status;
- paid date.

Agents should be able to access their transaction-linked commission statements/reports.

## 19.8 Brokerage Money queues

Useful Brokerage queues:

```text
DEALS MISSING DOCUMENTS
AWAITING PAYMENT
EXTERNAL-BROKER TERMS MISSING / UNCONFIRMED
READY FOR COMMISSION REVIEW
APPROVED
PAID
```

Brokerage Money should let the Broker reconcile the signed client agreement, owner-authorized external-broker record where applicable, actual Mallan compensation received and downstream Agent/referral obligations without creating a second accounting truth.

Mallan provides operational accounting/payment records; it does not replace the accountant.

## 19.9 Referral agreements, Agent access and progress tracking

The existing CRM referral forms for **Incoming (we received a client)** and **Outgoing (we sent a client)** are the retained canonical referral intake/agreement workflow. Do not redesign or replace those forms merely to add tracking. Correct their persistence/API wiring where needed and add the progress tracker to the resulting referral record.

Referral access follows the same My Business / Brokerage View model:

```text
AGENT / MY BUSINESS
→ create incoming and outgoing referrals
→ read and update the Agent's own referral workflow
→ see the Agent's own referral fee terms, expected/calculated fee amount and payment status
→ add progress check-ins and follow-up dates

BROKER / BROKERAGE VIEW
→ see all brokerage referrals
→ supervise exceptions, approvals, payments and closeout
```

A Broker-only `approve referral fee` capability is a supervision/approval boundary. **It must not be interpreted as making the Agent's own referral fee percentage/terms, expected amount or payment status Broker-only.** Agents need those values to manage their own incoming/outgoing referral business.

The executed referral agreement/form is the source for the agreed referral terms. The tracker is operational history and may not silently rewrite an executed referral fee, parties or agreement terms.

A referral progress tracker should include, as applicable:

- referral direction — incoming/outgoing;
- sale/rental or other approved deal type;
- responsible Mallan Agent;
- current stage;
- last check-in timestamp;
- next follow-up date;
- expected closing/completion date when known;
- check-in note/update;
- partner brokerage/agent response or status where relevant;
- referral fee terms and expected/calculated amount;
- fee due / invoiced or requested / paid or received state as applicable;
- append-only check-in history with actor, timestamp, stage change, note and next follow-up.

Useful stage vocabulary can include:

```text
REFERRAL CREATED / RECEIVED / SENT
CLIENT CONTACTED
CLIENT ENGAGED / ACTIVELY WORKING
OFFER / APPLICATION
CONTRACT / APPROVED
CLOSED
REFERRAL FEE DUE
REFERRAL FEE PAID / RECEIVED
CANCELLED / CLIENT PASSED
```

Exact sale/rental variants may be refined, but the tracker must reflect the real deal rather than force meaningless stages.

Referral direction and the executed agreement control payable/receivable semantics. The UI should clearly distinguish money Mallan owes from money due to Mallan instead of presenting one ambiguous payment label.

Useful referral attention signals include:

```text
REFERRAL_AGREEMENT_AWAITING_RESPONSE
REFERRAL_CHECKIN_OVERDUE
REFERRAL_FOLLOWUP_DUE
REFERRAL_EXPECTED_CLOSE_APPROACHING
REFERRAL_FEE_DUE
REFERRAL_FEE_OVERDUE
```

Implementation must preserve one referral truth and prove the complete round trip:

- existing form field names map explicitly to the canonical server/API fields; a frontend/backend naming mismatch may not silently break creation;
- the referral fee amount is persisted/recomputed canonically from the actual agreed terms and applicable deal basis; a browser-only calculated display value is not the source of truth;
- save → reopen returns the same partner, client, deal, fee and agreement data;
- read models return the fee/payment/progress fields required by Agent My Business and Brokerage View;
- authenticated update/check-in endpoints append progress history instead of overwriting the original agreement record;
- server-side ownership/assignment rules allow an Agent to access and update the Agent's own referrals while preventing access to another Agent's referral unless explicitly authorized;
- Broker firm-wide access and required approval/supervision remain server-enforced;
- browser/API persistence proof is required before the referral workflow is called functional.

---

# 20. TRANSACTIONS / DEAL SUPPORT / PAYMENT READINESS

For Mallan this section is brokerage deal progression and commission closeout.

**Mallan does not operate escrow or client-funds handling.** Mallan does not hold deposits, hold purchase funds, hold seller proceeds, act as attorney escrow, transfer closing funds, replace attorneys or act as closing agent. Mallan tracks brokerage-facing status, documents, milestones and next actions; it performs no attorney or escrow function.

Payment readiness therefore means readiness of Mallan's own commission, never custody of anyone else's money.

The section name is unchanged here. §23.5, §23.6, §24.3 and §26 name this same section; a rename moves all of them together or none of them.

Sale deal stages are the brokerage-facing view of the Seller and Buyer journeys in §12 and §14. The deal is already anchored to Opportunity → Representation/Exclusive → Property/Listing before an offer exists; the stages below begin at the offer because that is where the deal record starts moving, not where the business starts.

Attorney/contract, financing and building-process stages are status the brokerage records and watches. They are not work Mallan performs.

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

Rental deal stages are the brokerage-facing view of the Landlord and Tenant journeys in §13 and §15, anchored the same way: Opportunity → Representation/Exclusive where applicable → Property/Listing precede the application. Landlord review, building process and lease execution are recorded status, not Mallan-performed work.

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

An Offer, an Application and an Accepted Deal stay anchored to the canonical chain in §1: Party → Role Opportunity → Property/Listing → Offer/Application → Transaction, and to the executed representation that authorized the work.

**Do not create a new disconnected truth at acceptance.** Acceptance is a state change on that chain, not the birth of a separate transaction record. A deal that cannot name the Party, the Opportunity, the executed representation and the Property/Listing it came from is not a Mallan deal.

## 20.1 Sale subflows

Financed sale may include mortgage application, appraisal, commitment/approval and related milestone tracking.

Financing contingency status is recorded with those milestones where it applies to the deal. Financing status is brokerage-visible status recorded where known and relevant, not financial custody.

All-cash sale bypasses mortgage stages rather than displaying meaningless financing tasks.

Co-op transactions may include application/board package, review, interview/approval, walkthrough and closing.

Condo transactions may include applicable managing-agent/application/waiver/building processes, walkthrough and closing.

The exact workflow remains configurable by actual deal/property requirements.

## 20.2 Attorney/professional capture

Once an offer/deal requires attorneys or another transaction professional, Mallan should request/confirm the relevant canonical professional contacts rather than rely on repeated free text.

## 20.3 Transaction document checklist

Transaction type determines the applicable checklist.

Documents attach to the actual canonical Transaction/Referral, never a miscellaneous upload bucket with no deal context.

The checklist should distinguish required executed brokerage agreements/disclosures from transaction instruments such as the signed sale contract, deal sheet and signed lease. Missing or unsigned documents remain explicit blockers where the applicable brokerage workflow requires them.

## 20.4 Payment readiness

Every state and node below is a Mallan commission state: money Mallan is owed, money Mallan has received, and money Mallan pays its own Agents and referral partners. No client deposit, purchase fund, seller proceed or closing transfer moves through Mallan or through this chain.

A practical commission/payment-readiness chain is:

```text
NOT READY
→ DOCUMENTS OUTSTANDING
→ AGREEMENT / COMPENSATION TERMS NOT RECONCILED
→ PAYMENT NOT RECEIVED
→ READY FOR COMMISSION REVIEW
→ APPROVED FOR PAYMENT
→ PAID
```

The Agent always sees the blocking reason/next action.

Canonical chain:

```text
EXECUTED CLIENT AGREEMENT / AMENDMENTS
↓
OWNER-AUTHORIZED EXTERNAL-BROKER TERMS, IF SELLER/LANDLORD SIDE
↓
TRANSACTION / REFERRAL
↓
SIGNED CONTRACT / LEASE / REFERRAL AGREEMENT AS APPLICABLE
↓
CLOSE / LEASE EXECUTION / REFERRAL COMPLETION
↓
CONFIRM ACTUAL EXTERNAL-BROKER PAYMENT RECORD, IF APPLICABLE
↓
CLOSED DEAL FORM
↓
COMMISSION INVOICE
↓
MALLAN PAYMENT RECEIVED / CONFIRMED
↓
COMMISSION CALCULATION FROM EXECUTED AGREEMENT TRUTH
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

# 21. TECHNOLOGY / REBNY / RLS / PROVIDER + SUPPLEMENTAL SOURCE GOVERNANCE

Technology governance is rigorous while the human operating system stays simple.

This section governs more than feed plumbing. The same governance covers regulatory authority, Fair Housing and human-rights obligations, real-estate advertising rules, data and privacy obligations, media rights and web/digital publication — every surface on which Mallan presents a property, an agent or the brokerage to a person outside the firm. Provider and source technology is one input to that governance, not its boundary.

## 21.1 Authority stack

```text
NEW YORK LAW / DOS REQUIREMENTS
+
REBNY / RLS / UCBA BUSINESS + USE / DISPLAY RULES
+
SOURCE TERMS / LICENSE / WRITTEN PERMISSIONS
+
NYS AG OFFERING-PLAN / APPLICABLE GOVERNMENT SOURCE RULES
↓
MALLAN RULE REGISTRY
↓
MALLAN FIELD / SOURCE / RIGHTS CONTRACT
↓
PROVIDER + SOURCE ADAPTERS
├── COTALITY / TRESTLE — CURRENT VERIFIED PROVIDER
├── STREETEASY — SUPPLEMENTAL REFERENCE / AUTHORIZED ACCESS ONLY
└── NYS AG OFFERING PLAN / SCHEDULE A
↓
MALLAN STABLE SEARCH / LISTING / CMA / REPORTING CONTRACTS
```

The current provider or supplemental source does not define Mallan's business model.

If REBNY changes/replaces the provider, Mallan should pivot through a new provider adapter rather than rewrite brokerage workflows.

The authority layer above the Mallan Rule Registry is not limited to the four tiers drawn above. It also includes:

```text
FAIR HOUSING
+
NYS / NYC HUMAN-RIGHTS AND ANTI-DISCRIMINATION LAW
+
NEW YORK REAL-ESTATE ADVERTISING LAW / RULES
+
REBNY TECHNOLOGY / DATA / DISPLAY REQUIREMENTS
+
MEDIA COPYRIGHT / LICENSE / USE RIGHTS
+
WEB / DIGITAL PUBLICATION REQUIREMENTS
+
PRIVACY / CONSENT
```

These tiers are additive. The merged authority layer is the superset of both blocks: New York law/DOS, REBNY/RLS/UCBA business and use/display rules, source terms/license/written permissions and NYS AG offering-plan/government-source rules remain in force exactly as drawn, and the StreetEasy and Schedule A source adapters remain exactly where they sit.

Fair Housing and the NYS/NYC human-rights and anti-discrimination laws bind every Mallan surface that presents, selects, targets or withholds a housing opportunity. New York State and New York City human-rights law reach further than the federal baseline — lawful source of income is the clearest example — so the New York standard governs wherever it is broader.

New York real-estate advertising law governs every public and client-facing presentation of a listing, an agent or the brokerage. The share/advertising eligibility gate in §4.5.7 is one application of this authority, not its whole content. The Rule Registry, Field Registry, scanning process and flag set carry advertising law like any other authority rather than enforcing it only at the share gate.

REBNY technology/data/display requirements bind Mallan as a technology licensee — data handling, storage, retention and display-technology conformance — and are tracked separately from the REBNY/RLS/UCBA business and use/display rules that bind Mallan as a brokerage. A change to one does not prove a change to the other.

Media copyright/license/use rights are an independent authority. Media carries its own rights even where the listing data beside it is fully licensed. Canonical media storage, provenance, ordering and audience eligibility remain governed by §11.11.

Privacy/consent is an authority, not only a mechanic. Contact consent, unsubscribe/suppression, permissions and share eligibility are operated under §3.2; the obligations that govern them are registered, versioned, scanned and flagged here like any other rule, so that a change in privacy/consent law has a detection path.

**The current provider contract is an instance of SOURCE TERMS / LICENSE / WRITTEN PERMISSIONS, not a peer of New York law.** The Cotality/Trestle implementation contract and its API rules are registered at that tier and verified under §21.2. They stay below the authority line so that replacing the provider replaces an adapter rather than a governing obligation. Elevating the provider contract to a peer authority is a Maya decision, and it would also require amending the rule above that the current provider does not define Mallan's business model and the header rule that Cotality is the current provider implementation contract and not the brokerage business model.

## 21.2 Provider/source contract verification

Cotality fields, picklists, statuses, permissions, IDs, expands and media shapes translate into stable Mallan contracts.

Supplemental sources require the same discipline for:

- source identity and allowed access method;
- extraction/download permission;
- storage/caching permission;
- internal Agent-use permission;
- client-share/republication permission;
- attribution requirements;
- professional/owner contact use;
- media/floor-plan rights;
- freshness/reverification expectations;
- rate/technical constraints where applicable.

Frontend Search, Backend Search, CMA, Marketing and Reporting may not invent their own provider/source mappings.

Before treating a provider/source-dependent field/mapping/attribution/share rule as true, verify it against the current authorized source contract, actual payload/document and, where necessary, current authorized runtime behavior.

The chain from provider payload to rendered consumer is unbroken, and each link is confirmed rather than assumed:

```text
COTALITY RAW CONTRACT
↓
VERIFIED MAPPING
↓
MALLAN STORAGE / PROJECTION
↓
MALLAN BUSINESS RULE
↓
PUBLIC / CRM CONSUMER
```

**A mapping that stops at Mallan storage is not finished.** The same chain must reach the Mallan business rule that uses the field and the surface that renders it — public page, client-facing payload, Agent screen, CMA or report — or the field is not proven. The validator-scoped separation of raw contract, observed population, verified mapping and Mallan storage in §27.14.1 is the evidence half of this same chain.

## 21.3 Rule Registry

A governed rule record should identify at minimum:

- rule ID;
- authority/source;
- rule family — RLS/UCBA/DOS/NYS/provider/source-terms/internal;
- current text/summary;
- effective/version date;
- last verified date;
- applicability;
- affected Mallan systems;
- implementation mapping;
- proof/test references;
- current state;
- open discrepancy/flag.

Agreement/template rules and supplemental-source rights that can change independently of application code should be represented in the same governance model.

## 21.4 Field / source registry

A governed provider/source field record should identify as applicable:

- Mallan canonical field/criterion;
- source/provider resource/field/document section;
- source definition/type;
- source version/amendment/as-of date;
- lookup/picklist reference where applicable;
- null semantics;
- source/authority class;
- public/Agent/internal eligibility;
- client-share eligibility;
- attribution/display implications;
- read/write direction;
- current mapping implementation;
- last verified date;
- contract tests;
- affected screens/jobs/reports;
- open drift/uncertainty.

For Schedule A, source mapping must distinguish condo versus co-op meaning and preserve plan/amendment provenance.

## 21.5 Regular scanning / drift detection

Mallan should regularly scan/verify authoritative REBNY/RLS/current-provider/current-supplemental sources for changes in:

- business/use/display rules;
- source terms/licensing/permissions;
- agreement/checklist/disclosure guidance affecting governed templates;
- fields/document structures;
- definitions/meaning;
- Schedule A / offering-plan amendments and currentness;
- picklists/status mappings;
- attribution;
- address display;
- permissions/share rights;
- media/floor-plan rights;
- endpoints/authentication;
- provider/deprecation notices.

The exact cadence may vary by source, but the system must have a recurring operating process rather than depending on memory/manual chance discovery.

The same recurring scan covers Fair Housing, human-rights and anti-discrimination requirements, real-estate advertising rules, privacy/consent obligations, media copyright/license terms and web/digital publication requirements. **An authority that is registered but never scanned has no detection path.**

## 21.6 Technology/source flags

Useful flags include:

```text
RLS_RULE_CHANGED
UCBA_RULE_CHANGED
DOS_OR_NYS_RULE_CHANGED
AGREEMENT_GUIDANCE_CHANGED
DISCLOSURE_REQUIREMENT_CHANGED
PROVIDER_CHANGED
PROVIDER_SCHEMA_CHANGED
SUPPLEMENTAL_SOURCE_TERMS_CHANGED
SUPPLEMENTAL_EXTRACTION_NOT_AUTHORIZED
CLIENT_SHARE_RIGHTS_UNVERIFIED
SOURCE_MEDIA_RIGHTS_UNVERIFIED
SCHEDULE_A_AMENDMENT_CHANGED
SCHEDULE_A_AVAILABILITY_UNCONFIRMED
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
FAIR_HOUSING_RULE_CHANGED
HUMAN_RIGHTS_RULE_CHANGED
ADVERTISING_RULE_CHANGED
PRIVACY_CONSENT_RULE_CHANGED
WEB_PUBLICATION_RULE_CHANGED
MEDIA_COPYRIGHT_TERMS_CHANGED
LISTING_CONTENT_FAIR_HOUSING_REVIEW
ALGORITHMIC_SELECTION_REVIEW_REQUIRED
```

## 21.7 Change workflow

```text
CHANGE DETECTED
↓
CAPTURE EVIDENCE
↓
IDENTIFY AUTHORITY / SOURCE RIGHT
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

Unknown changes affecting public eligibility, client-share rights, attribution, status mapping, agreement/disclosure requirements or another critical rule fail safely rather than being guessed.

## 21.8 Human simplicity

Agents should see the professional result of the technology governance — correct fields, source badges, currentness, alerts and allowed actions — not feed plumbing.

The governing principle is:

```text
PEOPLE
SUPPORT → REMIND → FLAG → RECORD → SUPERVISE WHERE REQUIRED

TECHNOLOGY / SOURCES
MONITOR → COMPARE → FLAG → VERIFY → VERSION → TEST → BLOCK UNSAFE ASSUMPTIONS
```

## 21.9 Media is a regulated advertising surface

Photography, floor plans, video, tours, renderings and building/amenity libraries are advertising, not decoration. Media is subject to the same advertising, Fair Housing and human-rights authorities as listing text, and to its own copyright/license authority.

Media passes an ordered gate before use:

```text
MEDIA
↓
IDENTITY — which Building / Property / Unit / Listing it actually depicts
↓
SOURCE — where it came from and under what access
↓
RIGHTS — verified use / reproduction / republication permission
↓
ACCURACY — it depicts what it is presented as depicting
↓
PROPERTY / BUILDING / UNIT RELATIONSHIP
↓
AUDIENCE — public / Agent-internal / named client
↓
ADVERTISING + FAIR-HOUSING CHECK
↓
ATTRIBUTION — required source / listing-broker credit
↓
ELIGIBILITY — cleared for this surface and this recipient
```

Identity, source, rights, ordering, type and audience eligibility are stored under §11.11. Building-versus-unit accuracy is governed by §4.5.6. This gate does not restate those rules; it orders them and adds the advertising and Fair-Housing check that none of them carried.

The gate applies to every channel Mallan uses:

```text
PUBLIC WEB
SOCIAL
EMAIL / E-BLAST
CLIENT SHARE
CLIENT + OWNER REPORTS
LISTING PRESENTATIONS / PITCH MATERIALS
```

**A channel does not create its own media permission.** Media cleared for one audience is not thereby cleared for another, and a listing presentation or pitch deck is an advertising surface carrying the same obligations as the public site. Marketing in §9 and Reporting in §10 consume this gate rather than defining their own.

## 21.10 Public listing publication gate

Publishing a listing to the public web is a regulated act, not a rendering step. The links below already exist as separate rules across §4, §5, §11 and §27; publication requires them in order, and no public surface may start midway through the chain.

```text
CANONICAL LISTING
↓
AUTHORITY — verified source / owner / listing-broker right to present it
↓
CURRENT STATUS
↓
DISPLAY ELIGIBILITY
↓
ADDRESS DISPLAY
↓
MEDIA ELIGIBILITY
↓
ATTRIBUTION
↓
FAIR-HOUSING + ADVERTISING CHECK
↓
INTERNAL / CLIENT PII STRIP
↓
PUBLIC DTO
↓
SEARCH / LISTING PAGE / SITEMAP / SEO / AEO / STRUCTURED DATA
```

**Address display is a governed decision, not a rendering default.** Whether a full street address, a masked address, a building-only reference or no address may be published is set by the current REBNY/RLS, source and owner-suppression rules recorded in the Rule Registry. Where the applicable rule or the record's own suppression state is unverified, Mallan publishes the more restrictive form rather than the fuller one.

**Listing content is screened before publication.** Headline, description, agent remarks, media captions and any Mallan-authored copy pass a Fair-Housing and advertising review before the listing reaches a public or client-facing surface, covering both Mallan-authored content and Mallan's presentation of source content. Where a prohibited or ambiguous term is found, publication holds for human review rather than publishing and correcting afterwards. Marketing in §9 and Reporting in §10 use this screen; they do not each define their own.

Search results, listing pages, sitemap, SEO, answer-engine (AEO) surfaces and public structured data are outputs of this one gate. They are governed publication targets in their own right, not only places private supplemental inventory must not leak into, and any competing publisher of the same fact is governed by the two-sided census in §27.14.6.

## 21.11 Fair Housing applies to algorithms too

Search matching, reverse matching, ranking, sort, scoring, recommendation, auto-send, marketing audience selection, personalization and AI assistance are housing-opportunity decisions. Fair Housing and the NYS/NYC human-rights laws apply to them exactly as they apply to a spoken recommendation.

**Mallan may select, rank, match and target on legitimate business and property facts.** Price, size, beds/baths, rooms, property and ownership type, building, geography and map area, amenities, condition, availability, timing, verified status, financing/qualification facts the client provided and the client's own stated requirements are lawful selection criteria, and they are what Search, matching and audiences run on.

**Mallan may not use a protected or sensitive characteristic, or a prohibited proxy for one, to select, rank, withhold, prioritize or target housing opportunities.** This covers race, color, religion, national origin, sex, familial status and disability, lawful source of income, and any other characteristic protected under federal, New York State or New York City law. It applies to explicit criteria, stored client attributes, scores, weights, defaults, audience definitions, personalization rules and AI-generated suggestions alike.

**A characteristic that may not be an explicit filter may not become a hidden one.** A criterion that would be prohibited in the Search form is equally prohibited inside a similarity score, a default setting, a saved audience, a ranking weight or an inferred preference.

**Unlawful steering is prohibited.** Mallan does not narrow, widen or order the inventory a client sees on the basis of a protected characteristic or a proxy for one, and does not route clients toward or away from buildings, neighborhoods or price bands on that basis.

This is the single business truth for algorithmic selection. Auto-send in §5.12 and §5.17, reverse matching in §5.16, marketing audiences in §9.2 and every Intelligence lane in §22 operate under it and do not define their own version.

---

# 22. SYSTEM INTELLIGENCE / CONTEXTUAL AI

System Intelligence is connective system behavior over real canonical events, not merely an AI chat feature.

It answers:

- what changed;
- what needs attention;
- what is at risk;
- what evidence supports that conclusion;
- what the Agent/Broker should review or do next.

System Intelligence is not a generic alert system. Its purpose is human, client, property, market and agent understanding — helping the Agent understand the client and the market well enough to give better advice, not merely reporting that a record changed.

The orienting questions are:

```text
WHAT DOES THE CLIENT SAY?
WHAT DOES THE CLIENT ACTUALLY RESPOND TO?
WHAT APPEARS TO MATTER MOST?
WHAT TRADEOFFS IS THE CLIENT MAKING?
WHAT HAS THE CLIENT REJECTED?
WHAT IS THE CLIENT REPEATEDLY VIEWING?
WHAT IS THE CLIENT NOT EXPLICITLY SAYING?
WHAT CHANGED?
HOW CLOSE IS THE CLIENT TO A DECISION?
WHAT INFORMATION WOULD HELP THE CLIENT DECIDE?
WHAT IS THE PROPERTY / MARKET DOING?
WHAT SHOULD THE AGENT INVESTIGATE OR ASK NEXT?
```

**Widening the client and market lane does not narrow the brokerage lane.** Brokerage Intelligence remains a first-class view and continues to feed the firm exception queues in §18 and the supervision responsibility in §2.2. Where one signal is both an Agent service prompt and a Broker exception — a missing required document, a blocked commission, an approaching professional requirement — it is recorded once and surfaced in both views. Which view owns escalation is Maya's decision, not a system default.

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
- private supplemental match found outside Cotality;
- Schedule A unit matches Buyer criteria but availability is unconfirmed;
- supplemental unit later appears in Cotality → reconcile;
- source/client-share rights need review;
- rejected listing materially changed → Reconsider;
- Saved Search listing goes In Contract/Closed/Rented;
- report due;
- missing signed deal document;
- agreement pending Broker approval;
- Offering Plan missing/incomplete for an active Buyer workflow;
- executed compensation terms missing/reconciled incorrectly;
- owner external-broker amount not confirmed at close/lease completion;
- commission blocked;
- payment received → commission review needed;
- Agent payment ready;
- referral agreement awaiting response/signature;
- referral check-in/follow-up overdue;
- referral fee due/overdue;
- professional renewal approaching;
- RLS/provider/source rule or field change.

Useful practical signal codes include:

```text
LICENSE_RENEWAL_RISK
CE_DEADLINE_RISK
REBNY_RENEWAL_RISK
INSURANCE_EXPIRATION_RISK
REQUIRED_TRAINING_INCOMPLETE
DEAL_DOCUMENT_MISSING
AGREEMENT_BROKER_APPROVAL_REQUIRED
OFFERING_PLAN_MISSING_OR_PARTIAL
SUPPLEMENTAL_SOURCE_REVERIFY_REQUIRED
SUPPLEMENTAL_SHARE_RIGHTS_REVIEW
SCHEDULE_A_AVAILABILITY_VERIFY
SUPPLEMENTAL_RECONCILE_TO_COTALITY
EXECUTED_COMPENSATION_MISMATCH
EXTERNAL_BROKER_PAYMENT_UNCONFIRMED
REFERRAL_FORM_MISSING
REFERRAL_AGREEMENT_AWAITING_RESPONSE
REFERRAL_CHECKIN_OVERDUE
REFERRAL_FOLLOWUP_DUE
REFERRAL_FEE_DUE
REFERRAL_FEE_OVERDUE
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
- source/provenance explanation;
- CMA explanation;
- client-response drafting;
- follow-up suggestions;
- marketing/report drafts;
- transaction next-step guidance;
- approved compliance/document lookup.

AI assistance must use canonical Mallan records and the same Search/Property Intelligence contracts rather than a second AI-only client/search/property index.

AI may draft/recommend/explain, but may not:

- invent facts;
- infer that a Schedule A unit is currently available without evidence;
- bypass a source-rights/client-share gate;
- silently mutate canonical records;
- silently change formulas/inputs;
- send/publish without required approval;
- alter signed agreements;
- bypass permissions/compliance gates;
- make binding legal/tax conclusions.

**AI is not authority.** It explains, synthesizes, drafts and investigates against canonical records. It does not decide, and its output does not become a Mallan fact until a human or a governed rule makes it one.

## 22.4 Client Intelligence

Client Intelligence reads the evidence Mallan already holds about one Client and Opportunity:

- explicit stated requirements;
- Saved Search criteria and their change history;
- searches actually performed;
- properties viewed;
- repeat views of the same property;
- properties saved;
- properties passed/rejected;
- stated rejection reasons;
- Comments;
- showing activity;
- showing and open-house feedback;
- email/share engagement actually tracked;
- CMA activity;
- calculator scenarios run;
- offers/applications made;
- Agent notes;
- lease expiration, ownership timing and other client-stated timing.

The Client × Listing/Unit relationship memory in §5.11 is the record of most of these events. Client Intelligence reads it as evidence rather than keeping a second history.

Four kinds of client truth stay separated and separately labeled:

```text
WHAT THE CLIENT SAID
WHAT THE CLIENT DID
WHAT THE SYSTEM OBSERVED
WHAT THE AGENT CONCLUDED
```

**An observation is never stored as a stated requirement.** An inferred pattern may not be written into the client's criteria set, and an Agent conclusion may not be presented as something the client said. This is a different axis from the signal traceability in §22.2 and both apply.

## 22.5 Unexpressed preference signals

Mallan may identify evidence-backed behavioral patterns the client has not stated and present them to the Agent as questions to confirm.

```text
7 OF 9 SAVED PROPERTIES HAVE OUTDOOR SPACE
↓
CONFIRM WHETHER OUTDOOR SPACE SHOULD BECOME A REQUIRED CRITERION
```

```text
CLIENT REPEATEDLY REJECTS HIGH-CARRYING-COST UNITS
↓
CARRYING COST MAY MATTER MORE THAN ORIGINALLY STATED — CONFIRM THRESHOLD
```

What a client rejects is evidence in the same way as what a client saves.

**The system proposes; the Agent confirms.** A pattern becomes a stored requirement only when the Agent accepts it. Until then it remains an observation under §22.4 and does not change Search behavior.

**Mallan does not infer race, religion, family status, disability or any other protected or sensitive characteristic**, and does not infer one indirectly from names, language, schools, places of worship, household composition, income source or neighborhood behavior. Preference inference runs on property and business facts only.

**Preference inference may not produce steering.** Governed by §21.11.

## 22.6 Decision-readiness Intelligence

Decision-readiness is separate from payment readiness in §20.4. It describes how close a client appears to be to a transaction decision.

Useful signals include:

- criteria narrowing over time;
- increasing Search frequency;
- repeat views of the same properties;
- rising showing volume;
- CMA requests;
- calculator use;
- financing readiness information the client provided;
- attorney readiness;
- Offer/application discussions;
- lease expiration approaching;
- rent change at the current residence;
- Seller/Landlord valuation questions.

**Present the evidence. Do not invent a probability.** Mallan does not produce a likelihood-to-transact score, a close-probability percentage or a lead grade. It shows which signals fired, when, and what each one is.

## 22.7 Role-transition Intelligence

Clients change roles. The journeys in §13, §14 and §15 already end at the next relationship; Role-transition Intelligence is what notices the transition early enough to be useful.

```text
LEASE EXPIRATION + CURRENT / EXPECTED RENT
+ BUY-SEARCH ACTIVITY
+ CLIENT-PROVIDED FINANCIAL READINESS
+ RENT-v-BUY ANALYSIS
↓
AGENT REVIEW — RENTER MAY BE READY TO CONSIDER BUYING
```

A closed Buyer client is not a finished file. **The relationship continues after closing.**

```text
OWNERSHIP DURATION / RENTAL ACTIVITY / VALUATION OR CMA REQUEST
/ MARKET QUESTIONS / NEW INVESTMENT ANALYSIS / STATED OWNER PLANS
↓
AGENT REVIEW — OWNER MAY NEED A SELLER OR LANDLORD CONVERSATION
```

```text
LEASE EXPIRATION / VACANCY / RENTAL ECONOMICS
/ CURRENT CARRYING COSTS / SALE-MARKET CHANGE
/ HOLD-v-SELL ANALYSIS / OWNER QUESTIONS
↓
AGENT REVIEW — LANDLORD MAY BE READY FOR A SELLER CONVERSATION
```

Only business-history signals are used. One Party holding several roles over time is normal identity under §3.1, not a new person, and the rent-v-buy and hold-v-sell analyses come from the one shared calculator engine in §8.

**Do not invent intent.** A signal that a conversation may be worth having is not evidence that the client wants to sell, rent out or buy. Mallan surfaces the signal and names it as a signal; the client's actual intent comes from the client. This is the known-client counterpart of the market-status rule in §6.3, which governs the different case of a stranger's listing status.

**Every transition routes through Agent review.** Mallan does not open a new Opportunity, start a campaign or contact a client because a transition signal fired.

## 22.8 Property Match Intelligence

Search executes the client's criteria exactly. That does not change.

Property Match Intelligence answers a separate question: **why might this property deserve Agent review even though it does not match the saved criteria exactly?**

Useful inputs include explicit criteria, client behavior, prior rejections, accumulated building/property-type affinity, carrying costs, location, material listing changes and current market/CMA context.

Accumulated building/property-type affinity is derived, retained and labeled as an observation under §22.4. It is not a stated requirement.

**A near-match goes to the Agent. It never silently broadens a Saved Search.** Intelligence may not write into the client's criteria set, relax a criterion or send a near-match to a client on its own. The separation that keeps an internal supplemental match from being automatically client-shareable in §5.8 applies to a system-generated match in the same way.

Near-match pressure belongs in this lane. It is not a reason to make a Search control approximate.

## 22.9 CMA / Valuation Intelligence

The CMA evidence classes, comp rationale, adjustment explainability and strategy presentation are governed by §6 and are not restated here. Valuation Intelligence adds the analytic lenses §6 does not carry:

- micro-market behavior within a neighborhood;
- price segment;
- bedroom/size segment;
- market velocity;
- carrying cost as a valuation dimension rather than only a calculator output.

It adds two explanation duties to those §6.4 and §6.6 already require:

- how much of an observed difference is the building versus the surrounding area;
- how the relevant segment is behaving differently from the wider market.

Every explanation identifies its evidence. An unexplained lens is no better than an unexplained similarity score.

## 22.10 Seller / Landlord Listing Intelligence

Listing performance evidence is the Seller and Landlord report input set in §10.3 and §10.4 and the tracked engagement in §9.4. Listing Intelligence reads them; it does not build a second reporting truth.

Two inputs are added to that set:

- how many current Buyer/Tenant Saved Searches the listing matches, using the reverse-match engine in §5.16;
- repeat interest — the same client returning to the listing.

Listing Intelligence works through an explicit diagnostic frame:

```text
IS IT EXPOSURE?
IS IT PRESENTATION?
IS IT PRICE?
IS IT A PROPERTY-SPECIFIC OBJECTION?
IS IT THE MARKET SEGMENT?
IS THE EVIDENCE INSUFFICIENT TO SAY?
```

**`INSUFFICIENT EVIDENCE` is a complete answer.** Mallan is not required to produce a cause, and `NOT TRACKED` remains `NOT TRACKED` under §10.5.

**Do not fabricate causation.** Correlated activity is not a cause. Mallan may state what the evidence shows about exposure, engagement, competition and price position; it may not assert why a listing has not sold or rented. This is the active-listing counterpart of the market-history rules in §6.3 and §6.7.

The Agent Assessment and the Recommendation / Next Steps in §10.3 use this frame and remain Agent-reviewed before client delivery.

## 22.11 Agent Intelligence

Agent Intelligence helps the Agent give better service by surfacing what an Agent carrying a full book will otherwise miss. It is not only a compliance and money exception feed.

Client-relationship signals include:

- follow-up missed;
- a high-interest Client has gone quiet;
- client behavior suggests the requirements have changed;
- a delivered CMA is stale enough to need a refresh;
- client activity is waiting on an Agent response.

Cross-role signals from §22.7 surface here:

- a renter may be ready to consider buying;
- an owner may need a Seller or Landlord conversation.

Listing and match signals include:

- a new Mallan listing matches several current clients — the reverse match in §5.16 pushes itself to the Agent rather than waiting to be asked;
- properties are repeatedly being sent that conflict with the client's own recorded rejection pattern.

The last signal is an Agent-facing service prompt on the Agent's own book. It is a reminder and a record, not a supervision metric, and it stays inside the boundary in §2.2. Agent Home in §23.3 presents these signals with the actual record, the evidence and the next action.

## 22.12 Agent preparation intelligence

Before the Agent contacts a Client, Mallan assembles one prepared briefing rather than eight tabs to read.

The briefing carries, where evidence exists:

- the client's original goal;
- current stated requirements;
- observed patterns not yet confirmed;
- recent property activity;
- rejection reasons;
- showing feedback;
- market changes since the last contact;
- CMA changes since the last contact;
- current scenarios;
- important timing;
- unanswered questions;
- missing information;
- relevant current opportunities;
- why those opportunities may matter;
- suggested questions for the Agent to verify;
- the next business action.

The briefing composes existing canonical evidence and adds nothing to it. Where an item has no evidence, the briefing says so rather than filling the space.

Original goal, unanswered questions, missing information and Agent-verification questions are captured state, not derivations. They are recorded on the Client and Opportunity, and the client workspace in §23.4 is where the briefing is presented.

## 22.13 Intelligence model

Intelligence has five layers and they do not blur into each other:

```text
DATA
sourced facts under the fact-authority classes in §27.3

ANALYTICS
deterministic measurement — counts, funnels, ranges, calculator output under §8

INTELLIGENCE
evidence interpreted in business context, traceable under §22.2

AI
explains, synthesizes, drafts and investigates

HUMAN AGENT / BROKER
decides
```

A deterministic measurement does not become an interpretation by being displayed beside one. An interpretation does not become a fact by being repeated. **No layer may present itself as the layer above it.**

---

# 23. PRODUCT EXPERIENCE / NAVIGATION / ROLE WORKSPACES

The platform should feel like one operating system, not a collection of admin pages.

Mallan presents four role surfaces over the same canonical records:

```text
BROKERAGE VIEW — firm oversight and exceptions
AGENT / MY BUSINESS — the producer's own book of business
CLIENT EXPERIENCE — the client's own view of the client's own business
PUBLIC WEB — brokerage identity, eligible inventory and the consumer front door
```

Brokerage View and My Business are the two business scopes defined in §2.1. §23 governs how work is presented, not who sees what; the scope split is not redefined here.

A surface is a permissioned presentation of canonical Party, Property, Listing, Search, Document, Transaction, communication and history records. **Do not create a surface-specific client, listing, search, comment, media, document or activity truth.** One record shown four ways remains one record.

No surface may present a fact the viewer is not entitled to see. Eligibility follows §4.5.7 for private supplemental sharing, §5.18 for the client-facing payload boundary, §11.1 for communication visibility classes and §21 for source/display rights.

## 23.1 Global screen rule

Every important screen should answer:

1. **What is this record?**
2. **What changed?**
3. **What matters now?**
4. **What can the Agent/Broker do next?**

Do not expose every database field merely because it exists.

Mobile, tablet and desktop are presentations of the same workflow, not different products. A small screen may show less; it may never hold less truth. **A narrow presentation may not delete, overwrite or silently drop professional data the wide presentation captured.** Saved Search criteria, CMA comp selections and adjustments, report versions, agreement terms, deal documents, comments and client history survive the device the record is opened on.

§5.2 is the worked example and remains the authority for the Basic mobile / Advanced desktop Search criteria contract. The same rule applies to Listing Workspace, CMA, Listing Reporting, Deals, Documents/Agreements, the Client Experience surface and Public Web.

## 23.2 Agent navigation

A practical Agent-level navigation target is:

```text
HOME
LEADS
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

CMA, calculators, Comments, Share, Offering Plans/Schedule A and Intelligence are contextual capabilities within those workflows and do not all need top-level navigation entries.

`LEADS` is the Agent's working queue for public inquiries and assigned brokerage leads that are not yet a qualified Party/Opportunity. The lead lifecycle, intake, identity resolution and assignment rules are defined once in §19.1; §23.2 adds only the surface entry. A lead that resolves to an existing Party opens that Party — **do not create a second person because the inquiry arrived through a new channel.**

Showings remain contextual under the rule above and are reached from the Client, Listing and Deal workflows, but the Agent also needs one cross-client view of today's and this week's showings with confirmation and feedback state. That view reads the same canonical showing records used by §5.15 and Listing Reporting. It is not a separate showing calendar.

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
SENT LISTINGS / OPPORTUNITIES
SHOWINGS
CMA & ANALYSIS
DOCUMENTS / OFFERING PLAN / SCHEDULE A
DEALS
TIMELINE
```

Buyer Search can include private supplemental/new-development research visible to the Agent, while the client-facing view contains only items explicitly shared and share-eligible.

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

### Seller / Landlord client experience

The Buyer and Tenant client-facing views are the share-eligible projection of the pages above. Seller and Landlord owners need the same standing access to their own business rather than only a report that arrives by email.

A Seller or Landlord opens the current listing and marketing state, tracked activity, inquiries, showings and feedback, delivered report history, the market/CMA context the Agent has shared, offers or applications received, deal progress, shared documents and the listing timeline.

**A live owner surface and a delivered report are two different objects.** Delivered reports remain immutable snapshots under §10.6; the owner surface shows current state and never rewrites what was already sent. What the surface may show, and how each figure is qualified, follows §10.3, §10.4 and the §10.5 truth/provenance categories — `NOT TRACKED` is not `0` on the owner's screen either.

Internal source-professional/owner data, private supplemental research and internal comments never appear on the client surface. Visibility follows §11.1 and the §5.18 client-facing payload boundary.

## 23.5 Deals

Deal screens show the stage tracker, current responsibilities, missing documents, professional contacts, dates and payment readiness on the same canonical Transaction.

## 23.6 Money

Agent Money emphasizes Expected / Blocked / Ready / Paid status.

Agent My Business must also expose the Agent's own incoming/outgoing referrals, including the agreed referral fee terms/percentage, expected/calculated amount, deal/progress state and fee payment/receipt state. Referral fee information for the Agent's own referral is not Broker-only.

Brokerage Money adds firm-wide queues and brokerage totals without creating a separate commission or referral truth.

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
CLIENTS
LISTINGS
DEALS
MONEY
COMPLIANCE
INTELLIGENCE / EXCEPTIONS
TECHNOLOGY
```

Brokerage View is exception-oriented. It should not become a duplicate copy of each Agent's My Business screens.

This list mirrors the §18 primary areas and carries no separate definition of the Brokerage surface. `CLIENTS` and `INTELLIGENCE / EXCEPTIONS` are firm-scope oversight over the same canonical records and signals described in §18 and §22.1.

## 23.9 Public Web

Public Web is a role surface, not a marketing afterthought. It is where the brokerage, its licensees and its eligible inventory are presented to people who are not yet clients.

Public Web presents:

```text
BROKERAGE IDENTITY / LICENSED PRESENCE
AGENT PROFILES
ELIGIBLE PUBLIC INVENTORY
CONSUMER SEARCH
LISTING PAGES
PROPERTY / BUILDING / NEIGHBORHOOD CONTENT
COMPLIANT MEDIA
INQUIRY / SHOWING OR INFORMATION REQUEST
```

Eligible public inventory and Consumer Search behavior are defined in §5.1. Public professional identity and titles come from the one governed profile in §2.4. Media use follows §11.11 and the §4.5 rights gate. **Private supplemental inventory does not enter Public Web** — the exclusion stated in §4.5 stands unchanged and nothing in §23.9 widens it.

A public Listing page is a product, not a search result with a larger photo. It renders the listing's authorized detail, media, required disclosure and attribution, and the responsible Mallan licensee, and it resolves to the same canonical Listing Episode used by Search, CMA, Reporting and Marketing.

### Discoverability

Eligible public inventory, Agent profiles and brokerage identity must be findable. Mallan's public pages carry accurate titles, canonical URLs, sitemap membership and correct structured data, and remain addressable by answer engines (AEO) that read and cite a page rather than crawling a result grid.

**Discoverability applies only to content already proven publicly eligible.** It is never a reason to publish a private supplemental row, an unconfirmed Schedule A unit, an internal professional/owner fact or unlicensed media. The §4.5 exclusion and its Phase 1 leak proof in §25 govern; discoverability work is verified against them, not around them.

Stale, withdrawn or nonexistent inventory presented as current is a public-truth defect under §27.2, not an optimization opportunity.

### Inquiry and showing/information request

Every public conversion action — listing inquiry, showing request, information request, valuation or consultation request — creates a durable record at the moment it is made and routes to a responsible Agent. **A public inquiry is intake, not a metric.** It becomes a Lead under §19.1, resolves against existing Party identity rather than creating a duplicate person, and carries its source, timestamp, subject property/listing and consent state into canonical history.

§9.4 continues to own after-the-fact engagement measurement. Counting an inquiry is not capturing it, and a counted inquiry that produced no durable record is a defect.

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
preserve + verify + correct proven defects + certify; private supplemental inventory remains excluded unless separately authorized for public display
```

### Backend Agent Search

```text
CURRENT
legacy/partial professional Search with criteria/mapping/runtime parity concerns; historical external/sponsor specs exist but are not current implementation proof

TARGET
one verified full professional Search contract + Client/Saved Search/history/matching workflow + canonical private supplemental sale coverage from authorized StreetEasy references and NYS AG Schedule A/new-development source observations, reconciled against Cotality before display
```

### Supplemental / private sale inventory

```text
CURRENT
historical design evidence exists; current implementation, source rights, routes/models and production behavior must be freshly inventoried before reuse

TARGET
StreetEasy sale gap coverage + Agent-confirmed private source observations + selected-client sharing, all attached to canonical Property/Unit identity; URL-assisted extraction only when licensed/written-source authorization permits it; otherwise source URL + manual/Agent-confirmed fields; no accidental public exposure
```

### Schedule A / new-development inventory

```text
CURRENT
Offering Plan document workflow is now in the master; historical sponsor-database design exists; exact current data acquisition/coverage and code support remain unverified

TARGET
NYS AG Offering Plan + Schedule A + amendment observations mapped to canonical Building/Unit, searchable privately by Agents, with source-version/currentness, condo/co-op-specific economics, authorized Building/amenity media, unit floor plans where rights permit, availability verification, Cotality reconciliation and explicit selected-client share gates
```

### CMA

```text
CURRENT
partial heuristic/address-driven implementation evidence

TARGET
Search-based professional subject → universe → Agent selection of verified Closed final valuation comps → explainable adjustments → strategy → versioned client-safe CMA, with Active/Pending context and Expired/removed market-resistance evidence kept in separately labeled sections; authorized secondary historical sources may supply missing Expired evidence as read-only canonical source observations without making an additional Cotality Backend feed a prerequisite solely for that secondary use
```

### Backend Listing

```text
CURRENT
listing-management/detail capabilities are fragmented

TARGET
full readable source-aware Listing/Opportunity Workspace with media + client history + contextual actions + Offering Plan/Schedule A/building-document access + supplemental source verification where independently authorized
```

### Marketing / E-blast

```text
CURRENT
useful but narrow campaign capabilities exist

TARGET
one listing/search/client-driven Marketing workflow with reviewed audiences and measurable reporting; private supplemental items never enter broad campaign/public marketing without current authorization
```

### Listings Reporting

```text
CURRENT
internal/Phase-1 diagnostic capability exists but client output/design/data connection is incomplete

TARGET
separate polished Seller/Landlord report products using actual tracked activity + market/CMA context + Agent-approved recommendation
```

### Agreements / Documents

```text
CURRENT
basic document-library and four-family agreement framing exists

TARGET
one governed configurable agreement/form catalog with multiple role/property/representation/source variants, Touring Agreement option, locked vs negotiable fields, Broker approval for non-standard terms, e-sign/external-workflow tracking, immutable executed originals/amendments and minimum-retention controls
```

### Offering Plans / Building documents

```text
CURRENT
availability/source/storage/workflow must be inventoried and proven

TARGET
one Building/Property-linked Offering Plan library with original-plan + Schedule A + amendment provenance/completeness, Agent access, $0 Buyer courtesy delivery, Schedule A Search linkage, and a HELD future public paid-access option only after source/redistribution/commercial-use rights and consumer controls are verified
```

### Brokerage / Agent support

```text
CURRENT
capabilities are distributed across existing CRM/deal/profile data

TARGET
simple My Business + Brokerage View over the same canonical records with professional/deal/payment/technology/source-rights exceptions
```

### Referrals / referral tracking

```text
CURRENT
incoming/outgoing referral UI, fee display concepts and referral-list read path exist, but end-to-end creation/tracking is not proven: the current frontend/API partner-company field contract is inconsistent, the browser-calculated fee amount is removed before POST, and no durable referral-specific update/check-in endpoint is proven

TARGET
retain the existing incoming/outgoing referral forms; align canonical field mapping and server-persisted/recomputed fee truth; let each Agent create/read/update the Agent's own referrals and see the Agent's own fee terms/amount/payment state; give the Broker firm-wide visibility/supervision; add append-only progress check-ins, last/next follow-up, expected close and fee-due/paid-received tracking without mutating the executed referral agreement
```

### Compensation / Money

```text
CURRENT
transaction-level commission/split/payment concepts exist

TARGET
executed client agreement compensation → owner-paid external-broker record where applicable → actual Mallan compensation → internal split/referral/payout, with no hard-wired fees and no duplicate compensation truth
```

Historical code is implementation evidence, not product authority. Reuse existing models/routes/services where correct; do not automatically rebuild in parallel.

## 24.4 Business-completeness matrix

The map above records what is being corrected. It does not prove a capability was ever considered. The repeated failure is not a wrong answer about a capability; it is a capability nobody wrote down.

The nine questions in §1 fire when someone proposes a new model. They do not fire when a business capability is simply forgotten. This matrix fires on coverage.

Every major capability is represented with the same attributes:

```text
CAPABILITY
BUSINESS OUTCOME
ACTOR
CANONICAL OBJECTS
AUTHORITATIVE FACTS
WRITERS
READERS
LIFECYCLE
DOWNSTREAM CONSUMERS
COMPLIANCE / RIGHTS
INTELLIGENCE
ROLE EXPERIENCE
DEFINITION OF DONE
MASTER-PLAN SECTION
CURRENT IMPLEMENTATION
GAP / CONTRADICTION
```

`CANONICAL OBJECTS`, `WRITERS` and `READERS` are answered from §3 and the §1 questions. A capability that needs an object §3 does not name raises a §3 question, not a new model.

`CURRENT IMPLEMENTATION` uses the §24.2 proof states verbatim. **Do not invent a second status vocabulary.**

`MASTER-PLAN SECTION` names the section that owns the business truth. If no section owns it, the capability is not yet architected and the entry says exactly that. `DEFINITION OF DONE` points at §26 rather than writing a competing completion standard.

An empty attribute is a finding. `UNKNOWN` is a valid entry; a blank is not.

The matrix is an index over this plan. **It does not define business truth and may not contradict the section that owns it.**

### Required capability families

Coverage is measured against these families:

```text
Lead intake / Lead lifecycle / Party — CRM
Seller / Landlord / Buyer / Tenant / Investor — 1031
Property / Building / Unit
Listing intake / Listing / Media / Web publication
Search / Saved Search / Client × Listing history / Property Match Intelligence
CMA / CMA Intelligence / Calculators
Open Houses / Showings / Feedback
Marketing toolkit / E-blast / Listing Reporting
Communications / Tasks, Calendar, Reminders
Agent onboarding / Agent professional requirements / Broker and Agent operating documents
Agreements / Disclosures / Offering Plans, Schedule A
Offers / Applications / Deal progression / Transactions
Commissions / Referrals / Money
Compliance / Fair Housing / Advertising / REBNY, RLS, UCBA
Trestle, Cotality provider / Provider mapping
Public Web / SEO, AEO / Client Portals
Brokerage View / Business Intelligence / Agent Intelligence / Client Intelligence
Post-deal relationship / Repeat business
```

A family already owned by a section above is entered by reference to that section. **Do not author a second definition of a family in §24 because it has no map row.** Where a family has no owning section, that is the finding, and the business truth is written into the owning section first.

---

# 25. DEVELOPMENT SEQUENCE — ONE CONTINUOUS PROGRAM

Do not split these phases into separate master plans.

Engineering sequence is subordinate to business architecture. The order of work is:

```text
BUSINESS REQUIREMENT
→ CANONICAL ARCHITECTURE
→ DEPENDENCY / IMPACT GRAPH
→ COMPLIANCE
→ PRODUCT EXPERIENCE
→ CURRENT IMPLEMENTATION
→ GAP
→ CORRECTION
→ PROOF
```

The dependency/impact graph names every writer, reader, publisher and downstream consumer a change touches before the correction is scoped. Product experience is decided before current implementation is examined, so that what the business needs is not silently narrowed to what the code already does.

**The chain is never `ACTIVE PR → BUSINESS ARCHITECTURE`.** An open branch, PR or historical specification is implementation evidence, not product authority; §24 states this for code and §27 states that recovery creates no second architecture, and neither is restated here.

§27.14.5 is the inner engineering loop this chain hands off to at `CORRECTION`. §27 sequences **how** existing proven work converges and is proved; §1–§26 determine **what** is correct and complete. The CURRENT HANDOFF makes the product sequence subordinate to §27's convergence controls, and that remains true for the order of repair — it does not make the open PR queue the source of the requirement. Maya adjudicates any case where following one reading rather than the other would change *what* gets built rather than *when*.

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
3. verify current Cotality mapping/type/picklist/null semantics;
4. prove Basic/mobile and Advanced/desktop use one normalized criteria contract;
5. identify/remove silent unsupported/incorrect mappings;
6. prove/fix Mallan/Cotality source authority, display eligibility, return-copy suppression and dedupe ordering;
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
19. **inventory current historical external-inventory/sponsor code/models/routes before reuse**;
20. define one canonical supplemental identity contract across StreetEasy reference, Schedule A, Cotality and Mallan sources;
21. implement StreetEasy sale URL/reference intake only within current source-rights authorization; do not implement unauthorized scraping/data extraction;
22. check Cotality before creating any private supplemental result and reconcile future Cotality matches;
23. ingest/map authorized NYS AG Offering Plan/Schedule A/amendment observations to canonical Building/Unit with source version/currentness;
24. implement Schedule A availability states and Agent verification rather than treating all plan units as active;
25. connect authorized canonical Building/amenity media and rights-cleared unit floor plans;
26. implement private Agent Search result badges/filters and source professional/owner internal contact handling;
27. implement selected-client share eligibility + client-safe/attribution transform, fail-closed when rights are unproven;
28. prove private supplemental rows cannot leak into public Consumer Search/sitemap/SEO;
29. prove final counts/pagination/dedupe across the full selected Agent Search universe;
30. prove the complete professional desktop and Basic mobile UX end to end.

The historical external-inventory/sponsor specs are useful evidence for steps 19–28 but are not implementation authority and may not force parallel tables if current canonical models can be extended safely.

## Phase 2 — CMA / PROPERTY INTELLIGENCE

Rebuild CMA on corrected Backend Search/Property Intelligence:

```text
SUBJECT
→ MARKET UNIVERSE
→ CLOSED FINAL VALUATION COMP SET
→ ACTIVE / PENDING MARKET CONTEXT
→ EXPIRED / REMOVED MARKET-RESISTANCE EVIDENCE WHEN AUTHORIZED
→ ADJUSTMENTS
→ STRATEGY
→ VERSIONED CMA
→ PREVIEW
→ SHARE / EMAIL
```

No independent reduced comp-search engine. Historical Expired/removed observations may come from an authorized secondary source when the current Cotality entitlement does not supply them; they remain source-attributed context and never replace Closed transaction truth.

## Phase 3 — BACKEND LISTING / OPPORTUNITY WORKSPACE

Rebuild/complete Backend Workspace so every listing/private opportunity opens as a full readable professional record with photos/media and contextual actions.

Required:

- full readable details;
- photo gallery/floorplan/video/3D where authorized;
- source/provenance/currentness/share eligibility;
- authorized source professional/owner info internally;
- Client × Listing/Unit history;
- Comments;
- Save/Attach to Client;
- Verify Availability / Contact Source;
- Schedule Showing where coordinated;
- Compare/Add to CMA;
- Offering Plan/Schedule A/building-document access where independently authorized;
- Share/Email client-safe version only when eligible;
- Quick Add Open House for authorized Mallan-authored listings without full form;
- Refresh/Reverify/source reconciliation;
- Mallan-authored Edit/Media/Marketing/Reports/Offers/Documents/Distribution controls;
- all third-party/supplemental source layers remain read-only.

## Phase 4 — MARKETING / E-BLAST / LISTING REPORTING

Connect actual Search/listing/client/marketing/showing data and build polished separate Seller/Landlord reports.

## Phase 5 — DECISION / CALCULATORS / SYSTEM INTELLIGENCE

Connect deterministic scenarios and contextual explainable intelligence to real workflows.

## Phase 6 — COMMUNICATIONS / DOCUMENTS / AGREEMENTS / OFFERING PLANS / DEAL SUPPORT

Complete one communication history and the governed brokerage form/agreement/document engine:

- multiple approved Seller/Landlord/Buyer/Tenant templates rather than four hard-coded documents;
- sale/rental/property/representation/source variations;
- approved Touring Agreement option;
- controlled vs negotiable fields;
- Broker approval for non-standard terms;
- configurable compensation rather than hard-wired fees;
- required companion disclosures kept separate but coordinated;
- email/e-sign or tracked external signature workflow;
- immutable executed originals + amendments;
- minimum-retention controls;
- Building/Property-linked Offering Plan/Schedule A library with provenance/completeness;
- Agent Offering Plan access and $0 Buyer courtesy delivery;
- future public paid Offering Plan access remains held pending source/use/redistribution/commercial-rights verification;
- transaction checklists and payment readiness.

## Phase 7 — ROLE JOURNEYS

Complete Seller, Landlord, Buyer, Tenant and Investor/1031 end-to-end without merging role semantics.

## Phase 8 — AGENT SUPPORT / BROKERAGE / MONEY / TECHNOLOGY

Complete professional reminders/profile, agreement/document exception queues, supplemental-source/share-rights exception queues, owner-paid external-broker signing/closing reconciliation, deal-document/payment readiness, lead distribution, commissions/referrals, **Agent-accessible own-referral fee/status plus persistent progress/check-in tracking**, brokerage exceptions and REBNY/RLS/provider/source monitoring.

## Phase 9 — FUTURE MALLAN → PROVIDER PUBLISHING

Only after Mallan-authored Listing Management and provider mapping are stable and current outbound requirements are verified.

## Phase 10 — HISTORICAL RETIREMENT / FINAL PROOF

Retire superseded code/docs/branches only after requirements/useful behavior are accounted for and replacement proven.

Complete full end-to-end Production proof under the applicable authorization boundaries.

---

# 26. GLOBAL DEFINITION OF DONE

## Lead / CRM

Not complete until a public or brokerage-generated inquiry becomes a durable record at the moment it is made; the lead resolves against existing Party identity rather than creating a duplicate person; assignment, acceptance, decline and reassignment are recorded; the receiving Agent has a working surface with current stage, next follow-up and outcome; conversion to a role Opportunity carries the original source, timestamp, subject property/listing, consent state and all prior activity forward without loss; nurture and loss are explicitly recorded outcomes rather than silence; a lost or dormant lead remains recoverable as canonical history and can be reopened without a second identity; and no lead activity exists only in a form log, an inbox or a browser. The lead lifecycle itself is defined in §19.1.

## Search

Not complete until professional criteria execute; Basic/Advanced preserve one criteria truth; Mallan/Cotality/StreetEasy-reference/Schedule-A source observations reconcile to canonical Property/Unit/Listing identity; current source rights are enforced; unauthorized automated extraction cannot run; Schedule A version/currentness and availability are explicit; private supplemental results cannot leak publicly; client shares fail closed unless eligible; final result/count/pagination are correct after cross-source dedupe; Client Saved Search recalls full criteria; prior history/comments are visible; new/price/status/availability updates behave correctly; rejected listings go to Reconsider; reverse matching is correct where enabled; client-safe output strips internal professional/owner data; and results feed Compare/CMA.

## CMA

Not complete until it uses the same Backend Search/Property Intelligence universe, uses verified facts, makes verified Closed transactions the final sale valuation comp set, keeps Active/Pending context separate, keeps Expired/removed/TOM market-resistance evidence separate from transaction comps, preserves source/canonical identity/provenance for any authorized secondary historical observations, never converts an asking price into a close price, supports Agent-selected/explainable comps and adjustments, versions reproducibly, prevents unauthorized source-professional/PII leakage into client output, shows the Mallan report creator identity plus only attribution required by current rules, and supports save/reopen/share/email end-to-end.

## Backend Listings / Opportunities

Not complete until any listing/private opportunity opens as a full readable professional record with authorized details/media; Agent can Refresh/Reverify, reconcile sources, verify availability, contact source professional/owner internally where permitted, save/attach to Client, see history, comment, coordinate showing, Add to CMA/Compare, access authorized Offering Plan/Schedule A/building documents, Share/Email only when client-share eligible; and authorized Mallan-authored listings support Edit plus Quick Add Open House without reopening the full listing form.

## Marketing / E-blast

Not complete until campaigns use canonical Listing/Party/Search data, audience selection respects consent/suppression/source-share eligibility, content can be previewed/reviewed, private supplemental inventory cannot enter broad/public marketing without authorization, actual delivery/engagement is tracked truthfully, and marketing results feed Listing Reporting/Client history without duplicate contact/listing truth. The professional identity, title and brokerage attribution carried by any campaign come from the one governed profile in §2.4 rather than from template text. The same canonical facts, source rights, consent and attribution rules apply to every channel the toolkit adds — print, social, portal, web page, PDF or e-blast — and a new channel is not done until it enforces them.

## Listing Reporting

Not complete until real listing/marketing/e-blast/website/send/showing/feedback/offer/application data connect where tracked, Seller/Landlord remain separate, internal provenance is distinguishable from client presentation, reports are polished/versioned/truthful, Agent recommendation is reviewable, and no internal source-professional/owner PII leaks client-facing.

## Agreements / Documents / Communications

Not complete until Seller/Landlord/Buyer/Tenant remain distinct role workflows but support multiple approved agreement/form variants; template selection is contextual rather than hard-wired; Touring Agreement is a first-class limited option; controlled and negotiable fields are explicit; fee/compensation, scope, term and exclusivity use the actual approved template and negotiated terms; required Broker approvals are auditable; an in-progress form saves and reopens with the same selected template and version, context, prefilled canonical facts and negotiated terms intact, matching the save-and-reopen standard already required of referrals below; required disclosures remain separate; signed originals never mutate; amendments preserve version history; executed records have required retention controls; communications/comments attach to canonical context with correct visibility; and client-safe share transformations are enforced.

## Offering Plans / Schedule A

Not complete until Offering Plans are attached canonically to Building/Property; original plans, Schedule A and amendments retain provenance/version/currentness state; condo/co-op fields preserve their actual meaning; Schedule A units feed a private Agent opportunity universe without being falsely labeled active; active market listings reconcile to the same canonical Unit; Agents can find/use the documents; Buyers can receive an authorized available plan set at $0 as a recorded courtesy; missing/partial sets are identified truthfully; floor-plan/building-media rights are enforced; and any future public paid-access product remains blocked until source/acquisition/redistribution/commercial-use/privacy/consumer/payment requirements are verified. Public pricing must be configurable rather than hard-wired.

## Transactions / Money

Not complete until the executed client agreement is the source for compensation terms; Seller/Landlord owner-authorized external-broker compensation, when applicable, is recorded at agreement signing and actual payment is confirmed/recorded at closing or applicable lease/deal completion; Mallan's own compensation received is reconciled separately; internal Agent split/referral/adjustment/payout occurs only afterward; required documents/professional contacts/payment readiness remain joined to the same Transaction; and the Agent sees the blocking reason/next action.

## Landlord / Tenant lifecycle

Not complete at `Rented`. Not complete until the executed lease, its term and its key dates are canonical; the resulting tenancy is a tracked ongoing state rather than a closed transaction record; expiration becomes visible in advance to the Landlord side and the Tenant side; renewal, re-rent, relocation and the Landlord → Seller and Tenant → Buyer transitions are supported as continuations of the same Party and Property history rather than new unrelated files; and commission, deal documents and payment readiness for the completed rental remain joined to the same Transaction.

`Rented` and `Move-in` are milestones inside the lifecycle, not its end. §13 and §15 define the journeys; this is the completion standard for them. If an ongoing tenancy is to be held as its own canonical state, it is added to §3 through the §1 questions and not invented inside a rental screen.

## Referrals

Not complete until the retained incoming/outgoing referral forms create durable canonical referral records end to end; the Agent can save and reopen the Agent's own referral and see the same parties/client/deal terms; the Agent can see the Agent's own referral fee percentage/terms, expected or calculated fee amount and fee/payment status; the fee amount persists or is canonically recomputed server-side rather than existing only as a browser calculation; the Agent can add a timestamped progress check-in with current stage, note and next follow-up; prior check-ins remain historical and do not overwrite the executed referral terms; incoming/outgoing payable-versus-receivable direction is labeled correctly; Agent ownership is enforced server-side; the Agent cannot access another Agent's referral unless authorized; the Broker can see all referrals and retain required approval/supervision; and browser/API round-trip proof confirms creation, reopening, check-in persistence and fee/payment state before the feature is called functional.

## Agent / Brokerage

Not complete until Agent sees governed public professional identity, renewal/CE/REBNY/insurance/training reminders, required agreements/disclosures/deal documents, Offering Plan/Schedule A/document availability where relevant, private supplemental source/currentness/share states, **the Agent's own referral fee/progress/payment state**, Money/payment readiness and role-specific My Business; Maya sees firm exceptions including agreement approvals, source-rights/share exceptions and compensation/referral reconciliation over the same canonical records; and required supervision is supported without unnecessary management bureaucracy.

## Media / Web

Not complete until advertising, Fair Housing, New York City human-rights, REBNY/RLS/UCBA, provider, source-rights, attribution and publication rules are enforced **before** content is rendered, sent or published rather than reviewed afterward; the gate applies to Mallan's own listings, media, marketing copy, Agent profiles and public pages and not only to republished third-party property; every image, floor plan, video and tour resolves to a verified rights class; required attribution and disclosure travel with the content on every surface that shows it; a rendering path that cannot prove eligibility shows nothing rather than showing it unproven; and public web, client share, e-blast, report and portal output all run the same gate from one rule set. The rules themselves are owned by §21, the third-party share gate by §4.5 and media rights by §11.11.

## Intelligence

Not complete until every signal is built from real canonical events and records rather than a separate AI index; each displayed value is explicitly one of verified fact, computed analytics over canonical data, or inference, and inference is never presented as fact; evidence and interpretation are traceable per §22.2; the Agent or Broker can act on the signal inside the workflow it came from; matching, scoring, audience selection and recommendation stay inside Fair Housing and privacy boundaries and may not use, proxy or infer a protected characteristic; a suggested action requiring a human decision stops for one; and intelligence never silently mutates canonical business truth, formulas, permissions or compliance gates per §22.3.

## Technology / sources

Not complete until material REBNY/RLS/UCBA/current-provider/supplemental-source field/rule/terms/rights/attribution/display/agreement-guidance changes can be detected/reviewed, field/rule/template/source-right mappings are versioned and tested, critical uncertainty fails safely, source terms prevent unauthorized extraction/republication, and provider replacement can occur through an adapter rather than product rewrites.

## Product experience

Not complete until the four role surfaces in §23 — Brokerage View, Agent/My Business, Client Experience and Public Web — resolve to one canonical business history; the same listing, party, deal, document, showing, communication or figure reads consistently on every surface entitled to see it, differing only by permission, share eligibility and presentation; no surface holds a fact the others cannot reconcile to; mobile, tablet and desktop presentations of a workflow preserve the same truth; and a surface is not done because it renders — it is done when what it renders is the same record the other three see.

## Proof

No `Fixed`, `Production Ready`, `Compliant`, `Search Working`, `CMA Working`, `Listings Working`, `Reporting Working`, `Optimized` or equivalent claim without the applicable durable Git/test/runtime/provider/source/Production evidence.

---

# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL

Mallan's product architecture remains the architecture defined by this Master Plan. The recovery program does not create a second architecture, second Search, second identity system or second master plan.

The purpose of this section is to govern **how the existing system is repaired and proven** so implementation converges into one working brokerage operating system rather than repeating the historical pattern of large branches, green tests, self-certified completion and broken browser behavior.

§27 governs:

```text
HOW CHANGES ARE REPAIRED — §27.4, §27.10, §27.14.4
HOW PROOF IS COLLECTED — §27.7, §27.8, §27.14.1–§27.14.3
HOW BRANCHES AND PRs CONVERGE — §27.4, §27.6
WHAT PRODUCTION MUTATIONS REQUIRE AUTHORIZATION — §27.8, §27.12
HOW REGRESSIONS ARE PREVENTED — §27.1, §27.8, §27.13
```

§27 does not define business architecture. Where a §27 statement restates an architecture rule owned by §1–§26 — as §27.2 does for listing/Agent identity, unsupported-versus-fallback and unknown-versus-default, and as §27.4 does for the #627 public professional designation — the owning section governs the rule and §27 governs the proof that Production honors it. **These restatements are preserved as recovery evidence and are not deleted.** Maya adjudicates whether each is reduced to a cross-reference to its owning section or the owning section absorbs it.

§27.3 is the open case. Its four fact classes and derivation contract are the plan's only platform-wide fact-provenance rule — §21.1 is a rule/source authority stack, §10.5 a report-metric truth list and §6.5 a comp-fact hierarchy, and none of them is a general fact-class contract. It is load-bearing for §27.2's `Unknown remains unknown` and stays where it is until Maya decides whether the taxonomy moves to §3 or §21 with §27.3 retained as the proof obligation.

## 27.1 Frozen Production recovery baseline

The public/provider Production audit frozen on 2026-09-02 is recovery evidence with these headline measurements:

- observable structural coherence: **46/100**;
- exercised functional Production: **42/100**;
- proven functional deficiency on the exercised subset: **~58%**;
- brokerage-critical capabilities fully proven: **0 of 13**;
- authenticated brokerage functionality remains materially **UNPROVEN** until exercised through an authorized database-backed runtime.

These measurements are **regression signals, not definitions of completion**.

A higher score does not prove a workflow is fixed. A lower score, or regression of a previously working behavior, blocks closure.

Baseline B may expand what is known about authenticated functionality, but it does not erase Baseline A and does not block correction of an already-proven defect.

## 27.2 Production-truth requirements revealed by Baseline A

The following are hard system requirements, not optional audit observations:

- **No simulated success.** A control may claim send, submit, share, report generation, save or another success only when the real server action and required durable outcome occurred. Otherwise the control is honestly unavailable or reports the actual failed/unknown state.
- **Unknown remains unknown.** Missing provider/Mallan facts may not silently become `$0`, `0`, `Manhattan`, `true`, Active or a fallback result set.
- **Unsupported is not fallback.** An unsupported Search criterion must be specifically refused/unavailable rather than silently widening the universe.
- **One canonical listing identity.** Mallan-authored listing and provider return-copy must reconcile to the same canonical Mallan Listing Episode and may not compete as two Search/detail/media/CMA/report identities.
- **One canonical Agent identity.** Runtime Agent, authentication, CRM, directory, profile, sitemap, listing attribution and professional designation must resolve from one governed Agent lifecycle.
- **Public truth is part of system truth.** Soft-404 pages, directory-index route exposure, wrong professional titles, fabricated defaults and stale/nonexistent inventory presented as current are Production defects, not cosmetic cleanup.
- **Search is infrastructure.** Count, sort, pagination, dedupe, identity, filtering, Saved Search, Compare, Reports, CMA, Map and client matching may not each invent a different result universe.
- **Media/Open House/Map are cross-system consumers.** They must resolve through canonical Property/Unit/Listing identity and the same authority rules rather than being patched per screen.

## 27.3 Fact authority — no invented replacement for missing provider data

Every material fact used by Mallan resolves to one of these classes:

1. **provider-served and live-verified**;
2. **Mallan-stored canonical fact**;
3. **Mallan-derived from a named authoritative source and deterministic derivation contract**;
4. **unsupported / not provided**.

`UNRESOLVED` is not a synonym for `Mallan-derived`.

A value does not become Mallan-derived merely because Cotality does not supply it.

Any Mallan derivation must identify:

- authoritative input source;
- deterministic derivation rule;
- ambiguity/confidence behavior;
- refresh/currentness policy;
- human-review path where ambiguity is possible;
- affected readers/consumers;
- direct and negative tests.

This applies especially to coordinates, Building identity, days-on-market, rental-fee responsibility and other facts shown by the Production audit to be absent, sparse or semantically unresolved in the current provider entitlement.

When neither provider nor an approved Mallan authority can truthfully supply the fact, Mallan renders **not provided / unavailable**, not a guess.

## 27.4 Convergence before feature expansion

Large historical branches are engineering evidence and work preservation; branch size or accumulated effort does not make them deployable units.

Current recovery disposition:

### Agent lifecycle / PR #627

Use the bounded Agent lifecycle work as the first proof of the complete release mechanism.

The Agent lane must close the real runtime chain:

`canonical Agent → save/reload/edit → authentication → CRM → governed public profile`

For an Associate Broker operating as a producer:

```text
license_type = broker
role = AGENT
public professional designation = Licensed Real Estate Associate Broker
```

The existing Claudia record is corrected in place when Production correction is explicitly authorized; do not create a duplicate Agent.

Permanent purge is not a launch dependency and must remain outside the Claudia go-live path until its independent concurrency/dependency design is proven.

### Search / PR #618

Preserve existing #618 work but **freeze feature expansion** while it is converged into bounded deployment candidates.

Do not merge the entire historical branch merely because it contains months of work. Do not rewrite the same accepted work from zero.

Bring forward already-built accepted foundation in dependency order and prove it through bounded runtime acceptance before pulling additional Search/CMA/Building/Reports/UI work forward.

The first bounded Sale/Rental Search deployment candidate proves at minimum:

- correct Sale/Rental universe;
- status;
- price;
- beds;
- baths;
- borough/neighborhood;
- basic property type;
- impossible/bogus criteria do not return fallback inventory;
- final count describes the same universe displayed;
- deterministic sort;
- page 1/page 2 without duplicate/gap;
- Mallan-authored listing appears exactly once;
- provider inventory remains provider-owned/read-only;
- correct result identity and necessary media.

### Neon/R2 / PR #620

Preserve prior Neon/R2 forensic engineering. **Do not restart the Neon investigation from zero.**

Reconcile the already-proven intended corrections onto the accepted current base. Once the real stabilized workload is deployed, resume the existing convergence protocol.

Closure is measured behavior — compute duty cycle/suspend-wake-settle, write/WAL trajectory, database-storage trajectory, Listing/listing-media write rate, cache behavior and relevant R2/media behavior — not test count.

If usage does not converge, open only the exact measured residual writer/materiality/cadence defect. Never reopen a generic `investigate Neon usage` project.

## 27.5 Controlled parallel execution — Opus team model

Mallan may use parallel agents to move quickly, but parallelism is controlled.

Maximum active team for one recovery packet:

```text
COORDINATOR
BUILDER
INDEPENDENT VERIFIER
```

Do not allow uncontrolled recursive subagent spawning.

### Coordinator

- owns scope, dependency order, exact Git heads, worktree/branch ownership and execution-state continuity;
- enforces this Master Plan and the continuous execution state;
- does not certify its own implementation as complete.

### Builder

- is the sole writer for the assigned branch/worktree;
- works one bounded defect/capability packet at a time;
- follows:

`reproduce → root cause → affected readers/writers → correction → targeted tests → Preview`;

- cannot weaken acceptance because the implementation behaves differently.

### Independent Verifier

- is read-only with respect to implementation;
- runs concurrently so the failure state and acceptance criteria are established before the Builder finishes;
- receives frozen acceptance criteria, Preview URL, credentials and QA identifiers;
- does **not** receive the Builder's implementation narrative/test claims and should not read the PR/code before black-box acceptance;
- returns `PASS`, `FAIL — exact observed behavior`, or `BLOCKED — exact external reason`.

A second model/session is not independent merely because it is a separate session. Independence requires different inputs and no stake in the implementation.

## 27.6 One branch = one writer

Before mutation:

1. verify authorized checkout/repo;
2. verify remote;
3. verify branch/worktree;
4. verify exact HEAD;
5. inspect working-tree status;
6. declare the one writer.

Two active sessions may not push to the same recovery branch.

If another writer or unrelated uncommitted work is discovered, stop mutation and reconcile ownership first.

Do not create parallel mappings/models/identity systems merely to avoid a branch collision.

## 27.7 Golden Threads plus fixed breadth matrices

One Golden Thread proves integration. It does not prove breadth. Therefore every material recovery uses **both**.

### First Golden Thread

```text
Claudia login
→ CRM
→ create/edit designated QA Mallan rental
→ save/reload/edit/save/reload
→ same canonical Listing identity
→ Search finds the rental exactly once
→ provider listing beside it remains provider-owned/read-only
```

As the system stabilizes, extend the same identity chain through:

`Media → Open House → Map → Compare → Saved Search → Reports → CMA → Client workflow → Showing → Offer/Application → Deal → Portal/Post-deal`.

### Fixed breadth matrices

At minimum:

- Agent — identity, professional title, status, create/edit/reload, auth, CRM, public-profile cases;
- Sale/Rental intake — enabled-field round-trip census, no silent loss, no duplicate Listing creation;
- Search — criterion execution/refusal, impossible criteria, final count, deterministic sort, pagination, identity/dedupe, provider read-only cases;
- each downstream system adds a bounded matrix before implementation begins.

The acceptance matrix is frozen before the fix and cannot be weakened by the Builder.

## 27.8 Release states and closure gates

Use these states:

```text
CODED
→ BUILDER TESTED
→ INDEPENDENT PREVIEW PROVEN
→ INTEGRATED GOLDEN THREAD PROVEN
→ MAYA ACCEPTED
→ PRODUCTION PROVEN
→ CLOSED
```

Required gates:

1. targeted direct/negative/integration tests by Builder;
2. independent black-box Preview proof;
3. integrated Golden Thread proof across accepted changes;
4. Maya business acceptance for critical workflows;
5. exact deployed-SHA Production proof after explicit deployment authorization;
6. rerun the frozen relevant Baseline A checks on the deployed commit.

A previously working behavior that regresses, or a lower comparable Baseline result, blocks closure.

A score increase does not independently prove closure.

## 27.9 Immediate continuous recovery order

The urgent operational work is the **first checkpoint of one continuous system repair**, not a set of disconnected projects.

Current order:

1. **Agent runtime / #627** — prove the new Build + Independent Verify + Maya + Production gate on a bounded change.
2. **Mallan listing writer — Rental immediately, then Sale contract integrity** — prove `create → save → reload → edit → save → reload` on canonical Listing with zero silent loss on enabled fields.
3. **Core Sale/Rental Search convergence** — bounded accepted foundation, independent black-box acceptance and Golden Thread with the Mallan QA rental.
4. **Existing Neon/R2 convergence proof** — resume, do not restart.
5. **Media + Open House + Map** on the settled identity/result universe.
6. **Saved Search + Compare + Reports + CMA** on that same Search/property foundation.
7. **Seller + Landlord + Buyer + Tenant workflows** end to end on canonical Party/Opportunity/Listing/Transaction history.
8. **Marketing/E-blast + Portals + Alerts + client activity** with truthful delivery and durable CRM history.
9. **UI system/hardening + responsive usability + SEO/compliance/reliability** after and alongside truthful functionality, without using design to hide backend failure.

Do not wait for the entire later system before delivering the first usable brokerage checkpoint. Do not treat the first usable checkpoint as the end of the recovery.

## 27.10 On-the-spot behavioral testing

Do not accumulate dozens of commits before browser proof.

After a material boundary is corrected, run the relevant Preview/browser acceptance immediately.

Examples:

- Rental save fixed → create/reload immediately;
- Rental edit fixed → edit/reload immediately;
- Search pagination fixed → page 1/page 2 immediately;
- Mallan local identity wired → search the designated QA rental immediately;
- Agent designation fixed → render the actual profile immediately.

A failed behavioral test stays in the same bounded packet until corrected. It does not trigger a new master audit or unrelated cleanup.

## 27.11 No-restart rule

Prior audit/forensic work is evidence and starting state.

A reopened defect begins from:

`previous proven conclusion + new measured delta`.

Do not repeat completed censuses, provider probes, Neon root-cause programs or Search audits simply because a session changed.

If new evidence contradicts an old conclusion, reopen only the contradicted dependency and record why.

## 27.12 Schema/migration authorization remains explicit

Do **not** pre-authorize identity migrations.

Before any schema change, prove:

- existing canonical model/structured fields/JSON cannot safely represent the required fact or identity;
- reuse/extension cannot meet the requirement;
- all affected readers/writers are identified;
- backfill/reconciliation strategy is explicit;
- direct/negative/integration/downstream/compliance proof is defined;
- Maya explicitly authorizes the migration.

The difficulty of integrating an existing model is not itself proof that a new schema is necessary.

## 27.13 Global recovery finish line

Mallan is not fixed when a PR merges or when a score reaches an arbitrary number.

The Production recovery is complete only when brokerage-critical capabilities are behaviorally proven end to end in Production with no material `BROKEN`, `PARTIAL` or important `UNPROVEN` state on the critical business path, including:

- canonical Agent/Party/Property/Listing identity;
- Mallan Sale/Rental intake and edit round trips;
- trustworthy public and professional Search under their correct consumer contracts;
- Mallan/provider return-copy reconciliation;
- media/Open House/map;
- Saved Search/Compare/Reports/CMA;
- durable CRM/client activity;
- Seller/Landlord/Buyer/Tenant role journeys;
- truthful marketing/delivery/portal/alert behavior;
- usable responsive UI;
- compliance/SEO truth;
- Neon/R2/cache/cron reliability and measured convergence.

The recovery must continuously produce usable checkpoints while preserving this single-system finish line.

## 27.14 Permanent independent verification structure

The team model in `27.5` is **not a temporary recovery measure and is not specific to any
one PR**. It is a standing Mallan engineering control. It survives the closure of #627 and
carries forward into Rental canonical persistence, Sale/Rental Search convergence, Golden
Thread work, Media / Open House / Map / Compare / Saved Search / Reports / CMA, CRM,
authorization, compliance and Neon/R2 closure.

**Do not dismantle it when a packet closes.** Every workstream keeps a Builder, an
independent Verifier, and the Validators appropriate to its evidence.

Its purpose is singular: to prevent Mallan returning to *"Builder changed code → Builder
tests green → declared done."* **No capability is done until independent evidence reaches
the actual consumer.**

### 27.14.1 Permanent Validators

The roles in `27.5` stand as written. They are extended with standing Validators, which
exist because a black-box Verifier cannot safely establish every class of evidence.
Validators supplement the Independent Verifier; they never replace it, and additional
specialists may be **added** but may not **merge it away**.

**Contract / Data Validator**

- verifies canonical object ownership, exact stored fields, mappings and identity;
- keeps apart: raw contract → observed population → verified mapping → Mallan storage;
- may inspect database or source where explicitly authorized;
- its evidence is labelled **DATA / STRUCTURAL**, never black-box runtime.

**Runtime / Integration Validator**

- verifies, at the exact head: API → UI → persistence → reload → downstream consumers;
- exercises `create → save → reload → edit → save → reload`;
- exercises negative cases and downstream effects.

**Security / Compliance Validator**

- verifies authorization boundaries, privacy, REBNY / RLS / UCBA / Fair Housing rules,
  public publication and fail-closed behaviour;
- does not expand scope through unauthorized Production probing.

**A Validator may not become a second Builder.** It reports; it does not implement.

### 27.14.2 Evidence separation is mandatory

Evidence classes may **never** be combined to manufacture a `PASS`. Three distinct classes,
each labelled at the point of record:

| Class | Example |
|---|---|
| **Black-box runtime** | a rendered designation observed over HTTP by the Independent Verifier |
| **Data / structural** | `license_type` read directly from the database by Coordinator or Contract/Data Validator |
| **Builder structural test** | a unit test proving a write payload excludes a regulated field |

These may **jointly** support a release judgment. They are **not interchangeable**. The
Coordinator owns evidence classification and may not silently convert one class into
another — including by tallying a data-derived fact inside a black-box result.

### 27.14.3 Exact-head freeze

Once independent verification begins, the following are frozen:

1. the exact Git SHA;
2. the deployment / Preview identifier;
3. the acceptance matrix;
4. relevant QA state — except an explicitly authorized and **documented** discriminating
   test setup.

Any **functional** change afterwards means a new exact SHA, and the affected acceptance
must be re-run. Comment or PR-body cleanup must not casually invalidate a verified
functional SHA: record nonfunctional debt separately unless it materially misstates
runtime behaviour or release truth.

An acceptance result is bound to the head **and** the environment state in which it was
measured. If either changes, the result does not carry forward. A superseded result is
marked superseded — never edited in place, and never left standing beside the corrected
one.

### 27.14.4 Defect handling loop

```text
Verifier / Validator finds defect
  → Coordinator confirms root cause and scope
  → Builder receives ONLY a bounded correction
  → new exact SHA
  → affected validation
  → independent verification
```

A found defect never authorizes a broader rewrite than the defect requires.

### 27.14.5 Closure standard

```text
proven defect → root cause → ALL affected writers/readers/publishers → correction
  → direct + negative tests → integration → downstream → compliance/security
  → exact Preview proof → independent verification → Maya UAT → Production proof
```

`BLOCKED` stays `BLOCKED`. `FAIL` stays `FAIL`. A frozen case is never weakened,
reworded, re-scoped or removed because an implementation behaves differently. A condition
is never manufactured to turn a case green.

### 27.14.6 Census writers AND publishers

Every regulated or canonical fact must census **both**:

1. who can **WRITE** or change it;
2. who can **READ, PUBLISH or PRESENT** an independent version of it.

A census scoped to persistence code is incomplete. The #627 structured-data defect proved
that a competing **publisher** can violate canonical identity on every page without ever
writing a database row — it was sourced from a tracked file and surfaced only from
black-box observation of rendered output, not from tracing writes.

Regulated designations, licence classes, brokerage roles, disclosures and attributions all
require the two-sided census.

---

# CURRENT HANDOFF

- This file is the intended single canonical product/system authority on draft PR #595 and remains unmerged until explicitly approved.
- Maya's recent Search/CMA/Backend Listing decisions have been preserved rather than overwritten.
- **Sale CMA now explicitly uses verified Closed transactions as the final valuation comp set.** Active/Pending remain current-market context; Expired/removed/TOM evidence is a separately labeled market-resistance/history layer. Authorized secondary sources may supply missing Expired observations as read-only canonical Source Observations, and an additional Cotality Backend entitlement is not required solely for that secondary purpose. Source-reported TOM/Withdrawn/Hold is not treated as proof that representation ended or that solicitation is automatically appropriate.
- **Private supplemental sale inventory is now explicitly reauthorized for Backend Agent Search.** The target is maximum authorized StreetEasy sale coverage for units absent from Cotality plus NYS Attorney General Offering Plan/Schedule A new-development/sponsor unit opportunities, all reconciled to the same canonical Property/Unit/Listing identity.
- StreetEasy URL-assisted intake is a required UX direction, but automated extraction/scraping is `RIGHTS-GATED`: current StreetEasy terms prohibit automated scraping/data extraction except where expressly permitted in writing. Without authorized access, Mallan stores the source URL and Agent-confirmed/manual fields; with future written/licensed/API/feed access, the same adapter may prefill the existing template.
- Private supplemental records are Agent/professional inventory by default and never silently enter public Consumer Search, sitemap, SEO or public feeds. Selected-client sharing requires current share/advertising/source/media rights and client-safe transformation; `private` is not treated as an automatic exemption.
- Schedule A is sourced from the **NYS Attorney General offering-plan system**. Schedule A units are a future/opportunity universe, not proof every unit is currently active. Mallan must preserve plan/amendment provenance, distinguish condo/co-op economics, verify availability, and link any later Cotality/authorized market listing to the same canonical Unit.
- Standard Building/amenity media can auto-compose onto a Schedule A/private unit only from Mallan-authorized canonical Building media. Unit floor plans remain unit/source-specific and rights-gated. Another broker/portal's photos are not copied merely because they are publicly visible.
- Source listing agent/brokerage or owner/FSBO contact can be stored internally with provenance where lawfully obtained/used. It does not automatically serialize client-facing.
- Historical external-inventory and sponsor-database specs are now relevant evidence again because Maya explicitly reopened these business requirements, but they remain subordinate to this current master and may not force old parallel schema.
- The master also preserves the governed configurable Brokerage Agreement & Forms Engine: multiple approved Seller/Landlord/Buyer/Tenant templates; property/transaction/representation/source variants; controlled vs negotiable fields; Broker approval for non-standard terms; coordinated but separate disclosures; e-sign/external-workflow tracking; immutable executed records/amendments; and minimum-retention controls.
- Touring Agreement remains the generic limited buyer option when the buyer initially does not want a longer commitment. Its fee/no-fee, scope, duration and exclusivity come from the actual approved negotiated form and are not hard-wired.
- Compensation remains explicitly non-hard-wired and separated into negotiated client-agreement compensation, Seller/Landlord owner-authorized external-broker compensation, and internal Mallan Agent/brokerage/referral payout logic. For Seller/Landlord transactions the owner-paid external-broker terms are recorded when the exclusive/owner agreement is signed and the actual payment is confirmed/recorded again at closing or applicable lease/deal completion.
- **Referral forms remain the existing Incoming/Outgoing CRM forms; the target is to make them work correctly, not redesign them.** Agents must be able to create and access their own incoming/outgoing referrals, see their own agreed referral fee terms/percentage, expected/calculated amount and fee/payment status, and add persistent progress check-ins/next follow-up. Broker firm-wide visibility and required approval/supervision remain separate. Current UI presence is not accepted as proof of function until form→API mapping, fee persistence, secure Agent ownership, check-in persistence and browser/API round-trip are proven.
- Agency and Fair Housing disclosures remain distinct from the representation/listing contract even when delivered together operationally.
- Offering Plans remain a canonical Building/Property document set: Agents can use them, an available authorized set may be supplied to a Buyer at $0 as a brokerage courtesy, original plan/Schedule A/amendment completeness is tracked, and a future public paid-access option is held until authoritative source and commercial redistribution/access rights are verified. Any eventual public price is configurable, not hard-wired.
- The brokerage document system is a governed template, delivery/signature, Offering Plan/document-access and record-retention system, not a generic legal-document editor.
- Residual historical reconciliation continues as evidence work but is **not a global blocker to Search P0 read-only proof/audit**.
- Immediate technical product sequence remains **Search → CMA → Backend Listings/Opportunities → Marketing/E-blast/Reporting → remaining operating system** while brokerage-master completeness reconciliation continues. **This sequence is now subordinate to the recovery controls in `# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL`:** convergence of existing #627/#618/#620 work precedes feature expansion, and each step closes through independent black-box Preview verification and Maya acceptance rather than builder self-certification.
- Existing Search/CMA/Listing/Marketing/Reporting/agreement/commission/document/external-inventory/sponsor code is implementation evidence, not design authority. Reuse existing canonical capabilities where correct instead of automatically creating parallel models.
- Current documentation changes do not authorize Production mutations, schema changes, database writes, source scraping, bulk ingestion, environment changes or deployment.
- Next exact product action: **continue Brokerage Completeness Reconciliation in this same master; in parallel, Search P0 read-only proof must now include an inventory of existing external-inventory/sponsor code and a source-rights/canonical-identity design proof before supplemental implementation begins.**

<!-- Added 2026-09-02 with `# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL`.
     Additive only: no pre-existing handoff requirement above was removed. -->
- **Baseline A 2026-09-02 is the frozen public/provider recovery baseline:** 46/100 observable structural coherence, 42/100 exercised functional Production, ~58% proven deficiency on exercised scope, 0/13 brokerage-critical capabilities fully proven. Scores are regression signals, not definitions of done.
- **Current recovery is convergence-first, not feature-expansion-first.** Existing #627/#618/#620 work is preserved; giant moving branches are not automatically deployable units.
- **#627 closes first as the release-process proof** with database-backed Preview acceptance, independent black-box verification, Maya acceptance, exact Production proof and Baseline regression check. Claudia must resolve as one canonical Agent and `Licensed Real Estate Associate Broker`; permanent purge is not a go-live blocker.
- **Rental Listing intake is immediate operating-core work:** existing canonical Listing, no silent field loss, `create → save → reload → edit → save → reload`, third-party Cotality remains read-only.
- **#618 feature expansion is frozen while accepted Search work is converged into bounded deployment candidates.** Do not merge the whole historical branch or rewrite it from zero.
- **#620 Neon/R2 forensics are not restarted.** Reconcile the previously proved intended corrections, then run the existing convergence measurement under the stable workload; residual work begins from the measured delta only.
- **Opus recovery runs with maximum three roles:** Coordinator, one Builder/writer, one independent read-only Verifier. One branch = one writer. The Verifier receives frozen acceptance inputs, not the Builder's narrative.
- **Every critical release uses both a Golden Thread and a frozen breadth matrix.** The first Golden Thread is Claudia login → CRM → QA Rental round trip → Search returns that Mallan rental exactly once → provider listing remains read-only.
- **Closure states are:** `CODED → BUILDER TESTED → INDEPENDENT PREVIEW PROVEN → INTEGRATED GOLDEN THREAD PROVEN → MAYA ACCEPTED → PRODUCTION PROVEN → CLOSED`.
- **No pre-authorized identity migration.** Exhaust existing canonical models/fields/JSON first; schema change remains explicit Maya authorization.
- **No restart.** A reopened defect begins from prior proof plus the new measured delta, never another generic master audit.