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

# 0. WORKING WITH THE COTALITY API

> Everything in this section was read from the live API. Re-derive from the API,
> never from this text, a CSV, a captured file or a prior audit. Where this text and
> the API disagree, the API is right and this text is stale.

## 0.1 The connection

```text
host      https://api.cotality.com
service   https://api.cotality.com/trestle/odata        OData v4
token     POST https://api.cotality.com/trestle/oidc/connect/token
          grant_type=client_credentials  scope=api
issuer    https://api.cotality.com        audience  .../resources
lifetime  28,800 s (8 h)   role API   scopes offered: api, rets, offline_access
```

Only `scope=api` issues a token; `rets` and `offline_access` are advertised and refused.
There is one licence on this credential and no second tier:

```text
GET /odata/DataSystem
  ID    Trestle-11371-20
  Name  IDX Plus feed for Mallan Real Estate Inc
  DD    2.0        Transport 1.0.0
```

`DataSystem` is the entitlement record and the first thing to read. Comparing it with
the service document is diagnostic: 18 entity sets advertised, 16 provisioned.

## 0.2 The API documents itself — do not maintain a local dictionary

| Resource | Rows | What it gives you |
|---|---:|---|
| `Field` | 2,246 | every field: resource, name, display name, **definition**, type, length, backing lookup |
| `Lookup` | 191,323 | every permitted picklist value, **with definitions** |
| `Model` | 17 | the resource models |
| `DataSystem` | 1 | this licence and its provisioned resources |

`Field` and `Lookup` are the **platform-wide** catalogue shared across every MLS on
Trestle — 336 different `SystemReferences` appear in them. **`$metadata` is what THIS
licence serves.** Use `$metadata` for what Mallan has; use `Field`/`Lookup` for
definitions, display names and vocabularies.

A tag such as `RLS` inside `SystemReferences` is one tenant marker among 336 and is NOT
a selector for Mallan's fields. Filtering the dictionary by it returns 534 of 2,246 rows
and silently drops the 1,068 that carry no tag at all — which are precisely the
normalized fields. Do not select fields that way.

## 0.3 What this licence actually serves

| Resource | Fields | Rows | Notes |
|---|---:|---:|---|
| Property | 757 | 591,229 | the hub; 14 navigation targets |
| CustomProperty | 142 | 591,271 | local extension, joins on `ListingKey` |
| Media | 56 | 1,978,482 | joins on `ResourceRecordKey` |
| Member | 91 | 11,152 | |
| Office | 80 | 575 | |
| OpenHouse | 47 | 2,721 | |
| PropertyUnitTypes | 52 | 1 | effectively unpopulated |
| PropertyRooms | 39 | 86 | effectively unpopulated |
| Field / Lookup / Model | 15 / 15 / 8 | 2,246 / 191,323 / 17 | self-description |
| **Building** | **1** | — | **stub: `BuildingKey` only**, 403 direct |

Provisioned but not working, three distinct faults:

| Resource | HTTP | Provider message | Cause |
|---|---|---|---|
| Building | 403 | `Resource ... Building not available` | entitlement |
| HistoryTransactional, Teams, TeamMembers | 400 | `No OriginatingSystemNames available for querying` | configuration |
| PropertyGreenVerification | 404 | `Page not found` | not served |
| Enumeration | 404 | advertised, not provisioned | expected |

## 0.4 Identity — five levels, and none of them is BuildingKey

```text
LISTING     ListingKey        String(20)  NOT NULL   the provider primary key
            ListingId         RLS20110644            provider-assigned, prefixed
            SourceSystemKey   String(255) NULLABLE    upstream id, never an identity
UNIT        CLIP              539,188                Cotality property id
            ParcelNumber      380,474                block-lot form
            UniversalPropertyId 380,468
BUILDING    TaxBlock          591,229  (100%)        + TaxLot 266,520  = BBL
            BuildingName      220,923                where named
BLOCK       TaxBlock alone
PROVENANCE  OriginatingSystemName     "RLS"          where the record came from
            OriginatingSystemSubName  "RLS_REBNY"    NOT a schema, NOT a selector
            SourceSystemID            "TRESTLE"
```

**`BuildingKey` is a dead end.** It is the join key to a resource that is an empty stub
in this licence, it is null on every row, and it is rejected for filtering. Building
identity is `TaxBlock` + `TaxLot`, cross-checked with `BuildingName` and street address.
Measured on one building: address components grouped 45 units, `BuildingName` grouped 50.
Use both; neither alone is complete.

## 0.5 THERE IS NO GEOGRAPHY IN THIS FEED

`Latitude`, `Longitude`, `MapCoordinate`, `MapCoordinateSource`, `MapURL`,
`MLSAreaMajor`, `MLSAreaMinor` are declared in `$metadata`, **null on every row**, and
rejected for filtering.

**Mallan creates its own geography and Search depends on it.** Neighborhood polygons,
centroids, geocoding and any map, radius or polygon search are Mallan-owned and must be
built and maintained here. The provider supplies `SubdivisionName` (591,229, filterable)
and address components; everything spatial is derived by Mallan from those.

This is not a gap to work around later. It is a permanent property of the feed.

## 0.6 Filter capability is narrower than the data

The critical distinction: **`$select` returns data that `$filter` refuses.**

| Resource | Fields | Filterable | With data | Unavailable to filter |
|---|---:|---:|---:|---:|
| Property | 757 | 536 | 312 | 175 suppressed + 46 |
| OpenHouse | 47 | 27 | 23 | 16 |
| CustomProperty | 142 | 44 | 11 | 91 |
| Media | 56 | 17 | 7 | 39 |
| Member | 91 | 13 | 7 | 76 |
| **Office** | 80 | **0** | 0 | 80 |

Office, Member, Media and CustomProperty all return complete rows on `$select` —
office names, MLS ids, agent names and emails, media URLs. **The data is available; only
querying by it is blocked.**

### Consequence for the two Search products

```text
BACKEND AGENT SEARCH   everything is available.
                       Where the API refuses a filter, retrieve with $select and
                       apply the criterion in Mallan's layer. Never drop it.

PUBLIC SEARCH          the suppressed set is what the public may receive.
                       Public restriction is applied by Mallan, on top.
```

Both IDX display gates — `InternetEntireListingDisplayYN` and `InternetAddressDisplayYN`
— are refused for filtering on Property, so the provider cannot gate for Mallan. Every
display decision happens in Mallan's layer after retrieval. A Search design that assumes
provider-side gating silently returns listings that must not be shown.

`InternetEntireListingDisplayYN` IS filterable on **Media** (1,694,011 true / 284,409
false), which is a usable path where Property refuses it.

## 0.7 Suppression, classified

175 Property fields are suppressed. They are not one thing:

| Class | Count | Assessment |
|---|---:|---|
| Buyer-side (`BuyerAgent*`, `CoBuyer*`, `BuyerBrokerage*`) | 72 | expected for a public IDX product |
| Rural / agricultural (`DistanceTo*`, `Grazing*`, `Crops*`, `Farm*`) | 59 | irrelevant to NYC; unresolved configuration |
| **Genuine problem set** | **44** | must be available to backend Agent Search |

The 44 include `DaysOnMarket`, `CumulativeDaysOnMarket`, `DaysOnMarketReplication*`,
`Disclosures`, `CopyrightNotice`, `MlsStatus`, `PreviousStandardStatus`,
`PropertyCondition`, `OccupantType`, `SourceSystemKey`, the display gates and the
geography fields.

A further **197 non-rural fields are filterable but null on every row** —
`AssociationAmenities`, `DocumentsAvailable`, `Contingency`, `DelayedMarketingYN`,
`AttributionContact`, `Disclaimer`, `CommonWalls` among them. Configured, queryable,
empty.

`DaysOnMarket` and `CumulativeDaysOnMarket` are additionally **null on every row** while
`OnMarketDate` is populated. REBNY UCBA Art. I §11 requires 30-day DOM tracking, so
Mallan derives DOM from `OnMarketDate` and does not rely on the provider fields.

## 0.8 Picklist strings — the failure that returns nothing

Every `Lookup` row carries the value in up to four forms, and they are not
interchangeable. Of 172,507 values, **28,740 differ between them**.

| Column | Purpose | Example |
|---|---|---|
| `LookupValue` | **the query string** | `WheelchairAccess` |
| `LegacyODataValue` | equals `LookupValue` in practice | `WheelchairAccess` |
| `StandardLookupValue` | **the display string** | `Wheelchair Access` |
| `OdataOverride` | replaces the query string where present (3 values) | `St Antoine` |

```text
Permission has 'SyndicateOptOut'    -> 9,436 rows
Permission has 'Syndicate Opt Out'  -> HTTP 400, string is not valid
```

Display `StandardLookupValue`; query `LookupValue`. Sending the display form is a hard
400, not an empty result, so a UI built on it fails on every picklist containing spaces.

## 0.9 Query mechanics, verified

| Capability | State |
|---|---|
| `eq` `ne` `and` `or` | supported |
| `ge` `le` on Number, Date, Timestamp | supported |
| `contains()` `startswith()` on String | supported |
| `has` on multi-select, **bare value** | supported |
| `contains()` / `any()` on multi-select | rejected, HTTP 400 |
| `$orderby` single and multi-key | supported |
| `$expand` Media, OpenHouse, CustomProperty, ListAgent, ListOffice, Rooms, UnitTypes | supported |
| `$expand` Building | accepted, returns nothing |
| `$top` to 5000, `$skip`, `@odata.nextLink` | supported |
| incremental: `ModificationTimestamp gt <iso>` | supported (Property and Media) |
| replication ordering: `$orderby=ModificationTimestamp,ListingKey` | supported |

## 0.10 Status — two independent enums

`StandardStatus` (11 values) and `MlsStatus` (25) are separate fields. Neither is derived
from the other. **The same label carries a different integer code in each** — Canceled 2
vs 4, Closed 3 vs 6, Pending 9 vs 16, Withdrawn 10 vs 24 — so substituting one for the
other corrupts the value even when the string matches. `StandardStatus` filters and
orders; `MlsStatus` does neither.

## 0.11 Media

1,978,482 rows, joined to a listing by `ResourceRecordKey` (100% populated). Verified:
a listing with `PhotosCount` 16 returns exactly 16 Media rows.

| Category | Rows | With a URL |
|---|---:|---:|
| Photo | 1,396,097 | 527,271 |
| FloorPlan | 582,384 | 38,601 |
| Video, Document, Other, VirtualTour | 0 | 0 |

All rows are `MediaStatus = Active`. **Only 28.6% carry a URL** — a media row is not a
retrievable asset, and code must handle the majority that are not.

## 0.12 The route — how to establish any of this again

```text
1  POST /trestle/oidc/connect/token          scope=api
2  GET  /odata/DataSystem                    the licence and its resources
3  GET  /odata/                              what the service advertises
4  GET  /odata/$metadata                     what THIS licence serves
5  GET  /odata/Field                         definitions, display names, lookups
6  GET  /odata/Lookup?$filter=LookupName eq 'X'   the permitted values
7  PROBE each field:  $top=0&$count=true&$filter=<field> ne null
       -> SUPPORTED / PROVIDER_REJECTED / UNVERIFIED. Never collapse them.
       An HTTP error is not zero rows.
8  Record the result here.
```

Traps already paid for:

- `$metadata` and the `Field` resource disagree — `Nucleus_RecordDeleteFlag` is in one
  and not the other. A field is real only when a query for it succeeds.
- Provisioned is not available; declared is not permitted; **accepted is not populated**
  — `$expand=Building` returns 200 and no data.
- Page to exhaustion. A cap makes a partial answer look complete.

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
├── Private Supplemental Inventory / Source References
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
├── Offering Plans / Schedule A / Building Documents
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

A StreetEasy reference, a Cotality listing, a Schedule A unit and a Mallan-authored listing that resolve to the same real unit must not become four separate properties. They are source observations or listing episodes attached to the same canonical Building/Property/Unit identity.

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

Source listing professionals, selling brokerages, sponsor contacts and owner/FSBO contacts discovered through supplemental inventory remain source-attributed contacts until identity and permitted use are verified. A source contact may be useful internally without automatically becoming a public/client-facing Mallan contact.

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

Buyer Saved Search may evaluate eligible private supplemental/new-development opportunities in the Agent workspace, but an internal match is not automatically client-shareable.

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
- Active competition;
- private/supplemental or Schedule A opportunities as a separate context when relevant and sufficiently verified.

Rental CMA should distinguish relevant:

- leased/rented evidence;
- pending/application/in-contract context where supported;
- Active competition.

Agent may broaden/tighten using the same full professional Search contract.

Unconfirmed Schedule A opportunities are not equivalent to closed comps or verified active listings and may not be silently mixed into valuation evidence without labeling.

## 6.4 Comp selection

Mallan may suggest comps but the Agent chooses the final comp set.

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
- Agent inclusion/exclusion state.

Each suggestion should explain why it is relevant, such as same building, same ownership/property type, similar beds/baths/size, recency and geography.

No unexplained black-box similarity score may be the only rationale.

## 6.5 Comp facts and source hierarchy

Use verified facts.

Do not substitute asking price or Schedule A offering price for close price simply because close price is missing.

If another authorized evidence source such as correctly matched ACRIS evidence is used, label its provenance rather than pretending it came from the provider close field.

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
- adjusted comp range;
- active competition;
- private/new-development opportunity context;
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

A later market/source change never silently rewrites a CMA already delivered. It can flag that the analysis may be stale and allow a new version.

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

## 6.12 CMA acceptance

CMA is not finished until Property → market universe → selected comps → adjustments → strategy → save → reopen → version → client-safe preview/share/email works with verified data, reproducible history and no unauthorized source-professional/PII leakage.

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
- CMA/Compare actions;
- Share/Email actions only when eligible.

The Agent should be able to understand the property/opportunity without opening a separate public website, while still having a direct source-link action for verification.

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
CMA / MARKET
COMMENTS
REPORTS
OFFERS / APPLICATIONS
DOCUMENTS / OFFERING PLAN / SCHEDULE A
DISTRIBUTION / HISTORY
```

The exact UI can be refined during design, but all functions remain tied to the same Listing/Property foundation.

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

Private supplemental inventory may participate in a selected-client share only through its explicit client-share gate. It does not automatically become campaign/e-blast inventory.

Do not create a second marketing contact database.

Agents should not need to upload a spreadsheet for ordinary client-match e-blasts when Mallan already has the correct canonical recipients.

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
- open listing / exclusive agency / exclusive right / other approved representation structure;
- buyer/tenant representation, limited-services or Touring Agreement structure;
- exclusive / non-exclusive scope where the applicable agreement permits it;
- compensation structure and other negotiable business terms;
- approved internal/external form or signature workflow;
- current broker/legal/REBNY/NYS requirements.

The catalog must remain configurable and versioned. Adding, retiring or revising an approved form must not require hard-wiring a compensation amount, exclusivity choice or legal clause into application code.

Statutory/required agency disclosures and Fair Housing disclosures remain separate records from the representation/listing agreement even when Mallan coordinates them in one signing workflow.

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

Mallan adopts a **minimum three-year brokerage-record retention policy** for the executed representation/listing agreements, agency/Fair Housing disclosures, sale contract, deal sheet, lease agreement and related executed brokerage transaction records identified by the applicable workflow. Longer retention, legal hold, complaint/dispute/litigation preservation or another controlling requirement overrides the minimum. Exact legal trigger, document scope and any longer current requirement must be verified from authoritative law/rule sources before implementation rather than guessed.

Three years is a minimum retention period, not an automatic deletion date.

## 11.9 Transaction document families

The brokerage record should distinguish at least:

- representation/listing/Touring Agreement/limited-service agreements and amendments;
- statutory/required agency disclosures;
- Fair Housing disclosures/evidence;
- deal sheets;
- fully executed sale contracts when received/applicable;
- fully executed leases when received/applicable;
- referral/co-broker documents where applicable;
- commission/payment closeout documents;
- authorized Offering Plans/Schedule A/property/building documents.

The sale contract and lease are transaction documents attached to the canonical Transaction; Mallan is not a generic legal-contract authoring system for attorney-drafted transaction instruments.

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

Do not copy/re-publish external media merely because a URL exists. Media use must remain within the verified source/rights contract.

For new-development/Schedule A opportunities, standard building/amenity media and unit floor plans remain distinct source/rights classes.

---

# 12. SELLER OPERATING JOURNEY

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
```

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

---

# 15. TENANT OPERATING JOURNEY

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
- private supplemental inventory/source-rights/share-eligibility exceptions;
- Schedule A units with stale/unconfirmed availability when attached to an active Buyer workflow;
- deals needing support/supervision;
- agreement/template/source/version, negotiation, Broker-approval and amendment status;
- missing required disclosures/executed transaction documents;
- Offering Plan/document-set availability or incomplete-source flags where relevant to active Buyer deals;
- commissions/referrals/payment queue;
- owner-authorized external-broker compensation recorded at signing and confirmed at close/lease completion;
- brokerage operating revenue/receivables and accountant-ready annual payment records;
- compliance/advertising exceptions;
- practical Agent production/performance;
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

The checklist should distinguish required executed brokerage agreements/disclosures from transaction instruments such as the signed sale contract, deal sheet and signed lease. Missing or unsigned documents remain explicit blockers where the applicable brokerage workflow requires them.

## 20.4 Payment readiness

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

CMA, calculators, Comments, Share, Offering Plans/Schedule A and Intelligence are contextual capabilities within those workflows and do not all need top-level navigation entries.

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
Search-based professional subject → universe → Agent comp selection → explainable adjustments → strategy → versioned client-safe CMA, with private/Schedule A opportunities labeled separately from verified closed/active evidence
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
→ COMP SELECTION
→ ADJUSTMENTS
→ STRATEGY
→ VERSIONED CMA
→ PREVIEW
→ SHARE / EMAIL
```

No independent reduced comp-search engine.

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

## Search

Not complete until professional criteria execute; Basic/Advanced preserve one criteria truth; Mallan/Cotality/StreetEasy-reference/Schedule-A source observations reconcile to canonical Property/Unit/Listing identity; current source rights are enforced; unauthorized automated extraction cannot run; Schedule A version/currentness and availability are explicit; private supplemental results cannot leak publicly; client shares fail closed unless eligible; final result/count/pagination are correct after cross-source dedupe; Client Saved Search recalls full criteria; prior history/comments are visible; new/price/status/availability updates behave correctly; rejected listings go to Reconsider; reverse matching is correct where enabled; client-safe output strips internal professional/owner data; and results feed Compare/CMA.

## CMA

Not complete until it uses the same Backend Search/Property Intelligence universe, uses verified facts, distinguishes private/Schedule A opportunities from true closed/active evidence, supports Agent-selected/explainable comps and adjustments, versions reproducibly, prevents unauthorized source-professional/PII leakage into client output, shows the Mallan report creator identity plus only attribution required by current rules, and supports save/reopen/share/email end-to-end.

## Backend Listings / Opportunities

Not complete until any listing/private opportunity opens as a full readable professional record with authorized details/media; Agent can Refresh/Reverify, reconcile sources, verify availability, contact source professional/owner internally where permitted, save/attach to Client, see history, comment, coordinate showing, Add to CMA/Compare, access authorized Offering Plan/Schedule A/building documents, Share/Email only when client-share eligible; and authorized Mallan-authored listings support Edit plus Quick Add Open House without reopening the full listing form.

## Marketing / E-blast

Not complete until campaigns use canonical Listing/Party/Search data, audience selection respects consent/suppression/source-share eligibility, content can be previewed/reviewed, private supplemental inventory cannot enter broad/public marketing without authorization, actual delivery/engagement is tracked truthfully, and marketing results feed Listing Reporting/Client history without duplicate contact/listing truth.

## Listing Reporting

Not complete until real listing/marketing/e-blast/website/send/showing/feedback/offer/application data connect where tracked, Seller/Landlord remain separate, internal provenance is distinguishable from client presentation, reports are polished/versioned/truthful, Agent recommendation is reviewable, and no internal source-professional/owner PII leaks client-facing.

## Agreements / Documents / Communications

Not complete until Seller/Landlord/Buyer/Tenant remain distinct role workflows but support multiple approved agreement/form variants; template selection is contextual rather than hard-wired; Touring Agreement is a first-class limited option; controlled and negotiable fields are explicit; fee/compensation, scope, term and exclusivity use the actual approved template and negotiated terms; required Broker approvals are auditable; required disclosures remain separate; signed originals never mutate; amendments preserve version history; executed records have required retention controls; communications/comments attach to canonical context with correct visibility; and client-safe share transformations are enforced.

## Offering Plans / Schedule A

Not complete until Offering Plans are attached canonically to Building/Property; original plans, Schedule A and amendments retain provenance/version/currentness state; condo/co-op fields preserve their actual meaning; Schedule A units feed a private Agent opportunity universe without being falsely labeled active; active market listings reconcile to the same canonical Unit; Agents can find/use the documents; Buyers can receive an authorized available plan set at $0 as a recorded courtesy; missing/partial sets are identified truthfully; floor-plan/building-media rights are enforced; and any future public paid-access product remains blocked until source/acquisition/redistribution/commercial-use/privacy/consumer/payment requirements are verified. Public pricing must be configurable rather than hard-wired.

## Transactions / Money

Not complete until the executed client agreement is the source for compensation terms; Seller/Landlord owner-authorized external-broker compensation, when applicable, is recorded at agreement signing and actual payment is confirmed/recorded at closing or applicable lease/deal completion; Mallan's own compensation received is reconciled separately; internal Agent split/referral/adjustment/payout occurs only afterward; required documents/professional contacts/payment readiness remain joined to the same Transaction; and the Agent sees the blocking reason/next action.

## Referrals

Not complete until the retained incoming/outgoing referral forms create durable canonical referral records end to end; the Agent can save and reopen the Agent's own referral and see the same parties/client/deal terms; the Agent can see the Agent's own referral fee percentage/terms, expected or calculated fee amount and fee/payment status; the fee amount persists or is canonically recomputed server-side rather than existing only as a browser calculation; the Agent can add a timestamped progress check-in with current stage, note and next follow-up; prior check-ins remain historical and do not overwrite the executed referral terms; incoming/outgoing payable-versus-receivable direction is labeled correctly; Agent ownership is enforced server-side; the Agent cannot access another Agent's referral unless authorized; the Broker can see all referrals and retain required approval/supervision; and browser/API round-trip proof confirms creation, reopening, check-in persistence and fee/payment state before the feature is called functional.

## Agent / Brokerage

Not complete until Agent sees governed public professional identity, renewal/CE/REBNY/insurance/training reminders, required agreements/disclosures/deal documents, Offering Plan/Schedule A/document availability where relevant, private supplemental source/currentness/share states, **the Agent's own referral fee/progress/payment state**, Money/payment readiness and role-specific My Business; Maya sees firm exceptions including agreement approvals, source-rights/share exceptions and compensation/referral reconciliation over the same canonical records; and required supervision is supported without unnecessary management bureaucracy.

## Technology / sources

Not complete until material REBNY/RLS/UCBA/current-provider/supplemental-source field/rule/terms/rights/attribution/display/agreement-guidance changes can be detected/reviewed, field/rule/template/source-right mappings are versioned and tested, critical uncertainty fails safely, source terms prevent unauthorized extraction/republication, and provider replacement can occur through an adapter rather than product rewrites.

## Proof

No `Fixed`, `Production Ready`, `Compliant`, `Search Working`, `CMA Working`, `Listings Working`, `Reporting Working`, `Optimized` or equivalent claim without the applicable durable Git/test/runtime/provider/source/Production evidence.

---

# CURRENT HANDOFF

- This file is the intended single canonical product/system authority on draft PR #595 and remains unmerged until explicitly approved.
- Maya's recent Search/CMA/Backend Listing decisions have been preserved rather than overwritten.
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
- Immediate technical product sequence remains **Search → CMA → Backend Listings/Opportunities → Marketing/E-blast/Reporting → remaining operating system** while brokerage-master completeness reconciliation continues.
- Existing Search/CMA/Listing/Marketing/Reporting/agreement/commission/document/external-inventory/sponsor code is implementation evidence, not design authority. Reuse existing canonical capabilities where correct instead of automatically creating parallel models.
- Current documentation changes do not authorize Production mutations, schema changes, database writes, source scraping, bulk ingestion, environment changes or deployment.
- Next exact product action: **continue Brokerage Completeness Reconciliation in this same master; in parallel, Search P0 read-only proof must now include an inventory of existing external-inventory/sponsor code and a source-rights/canonical-identity design proof before supplemental implementation begins.**