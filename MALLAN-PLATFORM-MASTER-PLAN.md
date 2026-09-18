# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Single durable product, business and system authority for `mallan67/mallan-nyc`.**
>
> This file defines what Mallan is, how the brokerage operates, which records are canonical, how source authority works, how the major business workflows connect, and what proof is required before a capability is complete.
>
> It does **not** carry temporary PR numbers, commit SHAs, deployment IDs, recovery scores, current blockers, session handoffs or transient implementation status. Those belong in `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

Business owner and final product authority: **Maya Allan**.

Repository scope: **`mallan67/mallan-nyc` only** unless Maya explicitly changes it. `Mallan-Integrated` is not part of this system.

The governing provider chain is:

```text
COTALITY RAW CONTRACT
→ VERIFIED MAPPING
→ MALLAN STORAGE / PROJECTION
→ MALLAN BUSINESS RULE
→ PUBLIC / CRM / SEARCH / CMA / REPORT / MARKETING CONSUMER
```

For non-Cotality sources, use the same discipline:

```text
AUTHORITATIVE SOURCE
→ VERIFIED SOURCE CONTRACT / RIGHTS
→ VERIFIED MAPPING
→ MALLAN CANONICAL IDENTITY
→ MALLAN BUSINESS RULE
→ AUTHORIZED CONSUMER
```

Documentation, analysis, tests and read-only verification do not authorize schema/migration changes, direct Production writes, destructive data/R2 actions, environment/credential changes, force-push/rebase of shared work or manual Production deployment. Those remain explicit Maya authorization boundaries.

---

# 1. ONE MALLAN OPERATING SYSTEM

Mallan serves four coordinated product surfaces over the same canonical records:

```text
BROKERAGE VIEW
firm-wide supervision, exceptions and business oversight

MY BUSINESS
the logged-in producer's own book of business

CLIENT EXPERIENCE / PORTAL
role-appropriate client collaboration

PUBLIC WEB
brokerage, agent, listing, search, content and inquiry surfaces
```

## 1.1 Active-business attention contract

Every active Lead, Opportunity, Listing, Deal, Referral or professional obligation must be operationally answerable without reconstructing history from email or memory:

```text
RESPONSIBLE PERSON
+ CURRENT STATE
+ LAST MEANINGFUL ACTIVITY
+ NEXT ACTION OR EXPLICIT NO-ACTION STATE
+ DUE / REVIEW DATE WHEN APPLICABLE
+ REASON / EVIDENCE
```

An active record may not silently sit in an undefined state. It is either actively worked, deliberately scheduled for future review, explicitly nurtured, blocked with a known reason, completed or closed/lost with history preserved.

This is the business contract behind Agent Home, Brokerage exceptions, reminders and Intelligence. Those surfaces may prioritize the same state; they may not create separate follow-up truths.

---

Mallan's lifetime business chain is:

```text
LEAD / INQUIRY
→ PARTY IDENTITY
→ ROLE OPPORTUNITY
→ REPRESENTATION / CLIENT RELATIONSHIP
→ PROPERTY / SEARCH / LISTING / CMA / DECISION SUPPORT
→ ENGAGEMENT / SHOWING
→ OFFER / APPLICATION
→ ACCEPTED DEAL
→ BROKERAGE DEAL PROGRESSION
→ CLOSED / RENTED
→ COMMISSION / REFERRAL CLOSEOUT
→ POST-DEAL RELATIONSHIP
→ FUTURE OPPORTUNITY / REFERRAL
```

The same Party may evolve through Tenant → Buyer → Owner → Landlord → Seller → Buyer again without losing identity/history.

---

# 2. SIMPLE BROKERAGE / AGENT OPERATING MODEL

## 2.1 Human roles

```text
MAYA ALLAN
├── Representative Broker / Brokerage View
└── Producing Agent / My Business

LICENSED REAL ESTATE SALESPERSON
└── Agent / Producer

LICENSED REAL ESTATE ASSOCIATE BROKER
└── Agent / Producer unless separately appointed to a supervisory role
```

There is no Office Manager role now.

Associate Broker license classification does not automatically grant Broker/admin permissions.

Public professional titles come from the governed license record:

- Licensed Real Estate Salesperson
- Licensed Real Estate Associate Broker
- Licensed Real Estate Broker

One governed professional profile supplies future public profile, signature, marketing and report identity. Historical sent/signed artifacts remain immutable snapshots.

## 2.2 Brokerage principle

Each Agent manages the Agent's own business inside Mallan:

```text
LEADS
BUYERS
SELLERS
LANDLORDS
TENANTS
INVESTORS / 1031
PAST CLIENTS
REFERRALS
LISTINGS
DEALS
TASKS
COMMISSIONS
```

Brokerage View sees the same records with firm-wide supervisory scope. It does not create duplicate brokerage copies.

---

# 3. CANONICAL SHARED FOUNDATION

Mallan's durable shared foundation is:

```text
Brokerage
Agent / Licensee
Party — Individual or Entity
Party Role / Relationship / Opportunity Participant
Contact Method / Consent / Suppression / Preference
Lead / Inquiry
Seller Opportunity
Landlord Opportunity
Buyer Opportunity
Tenant Opportunity
Investor / 1031 Opportunity
Professional Contact / Organization
Building
Property / Unit
Listing Episode
Source Observation
Search / Saved Search
Client × Listing History
Showing / Open House
Offer / Application
Accepted Deal / Deal Progression
CMA / Property Intelligence
Decision / Calculator Scenario
Communication / Comment
Task / Calendar / Reminder
Document / Agreement / Amendment
Offering Plan / Schedule A / Building Document
Media
Marketing / Campaign / Share
Listing Report
Commission / Referral
Professional Requirement / Tax Administration
Permission / Visibility / Rule Flag
Audit / Provenance / History
```

## 3.1 Party is identity; role is context

A person or entity is created once and may have multiple roles over time or at the same time.

Supported relationship concepts include, as applicable:

- Seller
- Landlord
- Buyer
- Tenant
- Investor
- Owner
- Guarantor
- Trustee / Co-trustee
- Executor
- Member / Manager / Partner / Officer
- Authorized Signatory

Entity types may include LLC, LLP, Corporation, Partnership, Trust, Estate and Other.

Multiple sellers, buyers, tenants, landlords or authorized representatives may participate in one opportunity without duplicating Party identity.

## 3.2 Contact identity

A Party may have multiple emails, phones and mailing addresses.

Preferred communication method, consent, unsubscribe/suppression and delivery eligibility are centrally governed and reused across CRM, marketing, reports and portals.

Email or phone may support identity reconciliation but may never be the sole identity key when stronger evidence exists.

## 3.3 Property and listing identity

A physical Building/Property/Unit survives:

- multiple listing episodes;
- ownership changes;
- leases;
- CMAs;
- client interest;
- source observations.

A Cotality record, Mallan-authored listing, Schedule A unit and authorized supplemental reference describing the same real unit must reconcile to the same canonical Property/Unit identity.

Seller/Landlord owner identity and Listing identity must remain joined through the existing canonical owner relationship, including `Listing.owner_client_id` where that is the current model owner, with additional owners/authorized parties represented through the canonical opportunity/participant model rather than duplicate listings.

## 3.4 No silent data loss

Every enabled business form must prove:

```text
CREATE
→ SAVE
→ RELOAD
→ EDIT
→ SAVE
→ RELOAD
```

A visible field either:

- persists to a canonical owner;
- is a clearly labeled temporary assumption;
- or is disabled/unavailable.

It may never be silently discarded.

---

# 4. LISTING SOURCE, IDENTITY, EDIT AUTHORITY AND VISIBILITY

Mallan separates four questions:

1. **Identity** — what real property/unit/listing episode is this?
2. **Source** — who supplied the observation?
3. **Authority** — who may edit it?
4. **Visibility** — who may see/use/share it?

## 4.1 Source classes

Core source classes include:

```text
MALLAN_AUTHORED
COTALITY_THIRD_PARTY
COTALITY_RETURN_COPY
STREETEASY_SUPPLEMENTAL_REFERENCE — rights-gated
NYS_AG_SCHEDULE_A
AUTHORIZED_SUPPLEMENTAL_REFERENCE
AGENT_CONFIRMED_SUPPLEMENTAL
```

Exact source adapters may change without changing the business architecture.

## 4.2 Mallan-authored listings

Mallan-authored listings are editable by authorized Mallan users.

They connect to:

```text
OWNER PARTY
→ SELLER / LANDLORD OPPORTUNITY
→ REPRESENTATION / EXCLUSIVE
→ PROPERTY / UNIT
→ LISTING EPISODE
→ MEDIA
→ DISTRIBUTION
→ MARKETING
→ SHOWINGS / OPEN HOUSES
→ REPORTING
→ OFFERS / APPLICATIONS
→ ACCEPTED DEAL
→ COMMISSION CLOSEOUT
```

External observations may reconcile or flag drift but may not silently overwrite Mallan-authoritative fields.

## 4.3 Third-party Cotality listings

Third-party provider records remain read-only source truth.

Mallan may create local workflow around them — Save, Comment, Client history, Showing, CMA, Calculator, Offer/Application — without mutating provider-owned listing truth.

## 4.4 Return-copy rule

When Cotality returns a Mallan-authored listing, it must resolve to the same canonical Listing Episode.

The return observation is reconciliation/distribution evidence, not a second listing.

Return-copy suppression occurs before final Search counts, pagination, detail identity, client history, CMA and reporting.

Address alone is insufficient for automatic identity proof.

## 4.5 Verified provider mapping

All Cotality-dependent implementation follows:

```text
LIVE AUTHORIZED COTALITY CONTRACT
→ RESOURCE / FIELD / PICKLIST / TYPE / NULL / PERMISSION SEMANTICS
→ VERIFIED MALLAN MAPPING
→ MALLAN STORAGE / PROJECTION
→ BUSINESS RULE
→ CONSUMER
```

Where entitlement permits, mapping must account for the relevant provider resource graph, including Property and applicable CustomProperty, Member, Office, Media, OpenHouse, PropertyUnitTypes, Building/related resources or future published resources.

No UI or business rule may invent a provider field, status, expand, picklist, meaning or permission. Field-level source precedence must be explicit and tested when more than one authorized source can supply the same displayed fact.

### 4.5.1 Provider status, transition evidence and Mallan display state

Mallan must keep three status concepts separate:

```text
COTALITY CURRENT PROVIDER STATE
≠
COTALITY TRANSITION / EVENT EVIDENCE
≠
MALLAN BROKER-FACING DISPLAY STATE
```

Current Cotality `StandardStatus` and transition/event fields are interpreted from the live authorized Cotality contract and current observed feed behavior; Mallan never manufactures a provider status from absence.

Durable rules:

- `Pending` is the provider current state used for the listings Mallan presents as **In Contract** under the verified current mapping; Mallan must not wait for `ActiveUnderContract` merely because that value exists in provider metadata.
- `Closed` requires Sale/Rental context before presentation: a verified closed Sale is **Sold**; a verified closed Rental is **Rented/Leased** according to the governed Mallan wording.
- `BackOnMarket` is transition/event evidence on the applicable current listing state; it is not a second current listing status.
- price-change and contract-event dates remain transition/history evidence and may not replace the current provider state.
- if a listing disappears from the current Cotality feed and Cotality does not provide a verified reason/current state, Mallan preserves the last verified provider state/history and may present the Mallan broker-facing state **Off Market**.
- disappearance alone may never be converted to provider `Withdrawn`, `Canceled`, `Expired`, `Hold` or any other invented reason.
- **`Delisted` is not a canonical Mallan status.**
- if Cotality later supplies a verified current reason/state, Mallan uses that verified provider fact and retains the prior history.

Provider values may exist in metadata without appearing in a given current feed population. Metadata existence does not authorize Mallan to infer a value that was not actually observed for the listing.

## 4.6 Supplemental / private inventory

Professional Agent Search may include authorized supplemental sale/new-development opportunities that are absent from the current Cotality universe. StreetEasy sale references remain an explicit supported research source when Mallan is authorized to use the relevant facts; automated scraping/extraction is never assumed.

Authorized public-record/property evidence such as ACRIS or applicable NYC tax/lot/building sources may support verified closing, ownership, lot, tax or property intelligence under a defined mapping. They do **not** create listing inventory.

Every supplemental candidate must:

- resolve canonical Building/Property/Unit first;
- check current Cotality identity before creating a separate result;
- retain source URL/identifier/provenance/currentness;
- preserve source facts as read-only observations;
- keep Agent notes/verification as Mallan-owned workflow state;
- enforce separate internal-use, client-share and public-display rights;
- reconcile to Cotality later without losing prior client/history context.

Automated extraction, media copying, redistribution or client advertising requires verified source rights. Public availability of a URL is not permission.

## 4.7 NYS AG Offering Plan / Schedule A

Offering Plan and Schedule A data is professional opportunity intelligence, not automatic active inventory.

Mallan preserves:

- Building/Unit identity;
- plan/file identifier;
- original plan;
- Schedule A;
- amendments/supplements;
- version/as-of date;
- condo/co-op-specific economics;
- offering price when actually filed/applicable;
- floor-plan/document provenance;
- availability/currentness state.

Useful states include:

```text
PLAN UNIT
AVAILABILITY UNCONFIRMED
PLANNED / NOT YET OFFERED
CONFIRMED AVAILABLE
ACTIVE MARKET LISTING
IN CONTRACT
SOLD / CLOSED
STALE / NEEDS REVERIFY
```

A later current market listing links to the same canonical Unit.

Mallan's strategic use is **Buyer intelligence and opportunity coverage**, not acting as the developer's sales/marketing firm unless Mallan separately obtains that listing authority.

## 4.8 Future Mallan → provider publishing

Outbound provider publishing is a future controlled capability:

```text
MALLAN CANONICAL LISTING
→ VERIFIED REQUIRED FIELD CONTRACT
→ VALIDATION
→ AUTHORIZED APPROVAL
→ PROVIDER PROJECTION
→ PROVIDER ACKNOWLEDGEMENT / EXTERNAL ID
→ RETURN OBSERVATION
→ RECONCILIATION TO SAME MALLAN LISTING
```

It remains held until current outbound requirements and business authorization are verified.

---

# 5. SEARCH — BROKERAGE INFRASTRUCTURE

Search is infrastructure for professional work, not an isolated page.

Frontend Consumer Search and Backend Agent Search are distinct products over shared lower-level identity/provider infrastructure.

The separation is intentional and may not be simplified away. The two products serve different audiences with different legal and provider display rights. Shared lower-level provider, mapping, identity and media infrastructure is expected; separate DTOs, permissions, filter contracts, caches and tests are required. A refactor may remove duplicated implementation; it may not collapse the audience, permission, DTO or display boundary into one Search surface.

URL namespace does not establish application ownership. A professional Search may remain under a historical path for compatibility where the application behind it is independent and the permission boundary holds. Professional Search is never collapsed into public Consumer Search.

## 5.1 Consumer Search

Public Search includes only inventory eligible for public display:

```text
ELIGIBLE MALLAN-AUTHORED
+
ELIGIBLE THIRD-PARTY COTALITY
-
VERIFIED RETURN-COPY DUPLICATES
```

Private/supplemental opportunity research never becomes public merely because Agents can search it.

Consumer payloads exclude internal/professional-only fields before serialization.

## 5.2 Agent Search

Backend Agent Search is the full professional universe:

```text
MALLAN-AUTHORED
+
COTALITY THIRD-PARTY
+
AUTHORIZED PRIVATE / SUPPLEMENTAL
+
NYS AG / SCHEDULE A OPPORTUNITIES
-
VERIFIED DUPLICATES
```

Source and availability state must remain visible.

Agent Search may consume canonical CRM records and APIs; it may not depend on the CRM application shell to run. CRM may launch and use Agent Search. The dependency is `CRM → BACKEND SEARCH / LISTINGS`, never the reverse.

Authentication alone does not authorize a field. Agent Search is authenticated professional
functionality, and every professional field remains subject to its verified provider/source
contract, actual entitlement, field/resource permission, privacy rule, applicable REBNY/RLS/UCBA
rule, Fair Housing rule and Mallan business/display rule.

## 5.3 One criteria contract

Basic/mobile and Advanced/desktop are presentations of one normalized criteria truth.

No supported professional criterion is removed merely because it is difficult to implement.

Every criterion has:

```text
UI FIELD
→ CANONICAL CRITERION
→ VERIFIED SOURCE / LOCAL DERIVATION
→ TYPE / PICKLIST / NULL SEMANTICS
→ OPERATOR
→ RIGHTS / CURRENTNESS
→ RESULT / COUNT / PAGINATION BEHAVIOR
→ CONTRACT TEST
```

A criterion is `SUPPORTED`, `LOCAL / DERIVED` with explicit semantics, or `UNAVAILABLE`.

Unsupported criteria fail visibly; they never silently broaden or narrow Search.

## 5.4 Correct result-universe order

```text
SOURCE CANDIDATES
→ CANONICAL IDENTITY
→ SOURCE AUTHORITY / RIGHTS / CURRENTNESS
→ MALLAN / COTALITY / SUPPLEMENTAL RECONCILIATION
→ AUDIENCE ELIGIBILITY
→ FILTERS
→ DEDUPE
→ DETERMINISTIC SORT
→ FINAL COUNT
→ PAGINATION
→ PRESENTATION / MEDIA
```

Count, hasMore, page membership, Map, Compare, Reports, CMA and client matching must describe the same authoritative universe.

## 5.5 Professional experience

Agent Search supports, where verified:

- Sales;
- Rentals;
- Buildings;
- New Development / Schedule A;
- Private / Supplemental;
- Comp / Market Research.

Desktop should support filters + results + map/location context.

Mobile preserves the same search meaning without deleting hidden advanced criteria.

Map and transportation/location context must come from verified provider facts or a named Mallan derivation. Missing coordinates or transit facts are never fabricated.

## 5.6 Professional criteria coverage

Agent Search must preserve the full verified professional criteria families required for NYC brokerage work rather than shrinking the product to a consumer filter set. Coverage includes, where supported by the authorized Cotality contract or an explicitly governed Mallan derivation:

- geography, borough, neighborhood, address/building and map/location context;
- sale/rental/status/date/DOM and price history context;
- property, ownership, building and unit type;
- bedrooms, bathrooms, rooms and size;
- amenities, features, exposures and building characteristics;
- carrying costs, maintenance/common charges, taxes, fees and financing-related criteria;
- sponsor/new-development, maximum financing and other professional deal-structure criteria;
- Open House/showing availability;
- office/member/listing-side/source fields needed for internal professional research;
- Media, Building, Office, Member, OpenHouse and other related Cotality resource data when the current entitlement and semantics support the use;
- transportation/location intelligence only from verified provider facts or a named Mallan derivation.

The exact field/picklist registry lives outside this Master and is verified against the current authorized Cotality contract. A difficult criterion is corrected or explicitly refused; it is not silently deleted or ignored.

### 5.6.1 DOM has two governed clocks

Mallan does not collapse Coming Soon time and normal market time into one Days on Market value.

#### Coming Soon DOM

Coming Soon has its own clock, derived only from verified Cotality Coming Soon/activation facts such as `StandardStatus = ComingSoon`, `ActivationDate` and any other exact provider timestamp whose semantics are proven for this use.

Coming Soon time is preserved separately and does not accrue into normal market DOM unless the governed Mallan business rule explicitly says so.

#### Market DOM

Mallan market DOM runs:

```text
VERIFIED ON-MARKET / LISTED DATE
→
ACTUAL CONTRACT-SIGNED POINT
```

The implementation must prove the exact Cotality field or deterministic combination that represents the contract-signed point separately for Sale and Rental before ending the clock.

`OnMarketDate`, `OnMarketTimestamp`, `PurchaseContractDate`, `ContractStatusChangeDate`, `PendingTimestamp` and other provider event dates remain separately preserved source facts. No implementation may automatically redefine `PurchaseContractDate` as “contract signed” without verified Cotality semantics for the applicable Sale/Rental workflow.

There is one governed Coming Soon DOM rule and one governed market DOM rule. Multiple readers may not maintain conflicting accrual/end-point logic.

## 5.7 Saved Search and client memory

```text
AGENT
→ CLIENT PARTY
→ BUYER / TENANT OPPORTUNITY
→ SAVED SEARCH
```

A client may have multiple Saved Searches.

Selecting the client/search should restore:

- full criteria;
- current matching universe;
- prior Client × Listing history;
- new vs previously known inventory.

Temporary edits must not silently mutate saved criteria.

Client × Listing history includes, where tracked:

```text
SENT
VIEWED
SAVED / LIKED
DISCUSS / MAYBE
SHOWING REQUESTED / SCHEDULED / COMPLETED
PASSED / REJECTED
RECONSIDER
OFFER / APPLICATION
DEAL
COMMENTS
MATERIAL PRICE / STATUS / SOURCE CHANGES
```

Rejected listings are not automatically resent. A material verified change routes to `RECONSIDER`.

## 5.8 Alerts and reverse matching

Saved Search may drive authorized new-listing, price-change and material-status alerts.

Reverse matching asks:

```text
LISTING / OPPORTUNITY
→ WHICH CLIENT SAVED SEARCHES MATCH?
```

Both directions use the same criteria and identity system.

## 5.9 Client-safe boundary

Professional-only source contacts, owner/FSBO data, rights state and unconfirmed facts are removed before client serialization unless the exact share mode requires and permits them.

Hiding prohibited data with CSS is not sufficient; it must not be serialized.

---

# 6. CMA / PROPERTY INTELLIGENCE

CMA uses the corrected Search foundation. It is not a second search engine.

```text
SUBJECT PROPERTY
→ AUTHORITATIVE MARKET UNIVERSE
→ AGENT COMP SELECTION
→ ADJUSTMENTS / ANALYSIS
→ VALUE / PRICING STRATEGY
→ VERSIONED CMA
→ CLIENT-SAFE REPORT / SHARE
```

## 6.1 Sale valuation evidence

For sale CMA:

- verified **Closed** transactions are the final valuation comp set;
- Active listings are competition/context;
- Pending/In Contract listings are current-market context;
- Expired/Withdrawn/TOM/Hold may be separately labeled market-resistance/history evidence when verified;
- asking price never becomes closing price because close price is missing.

Source-reported `Withdrawn`, `Temporarily Off Market` or `Hold` is not representation truth. It does not prove that an exclusive ended, that the owner is unrepresented, or that solicitation is appropriate.

Authorized secondary historical evidence may be used when necessary, but must remain source-attributed and reconciled to canonical identity.

## 6.2 Rental CMA

Rental CMA distinguishes:

- leased/rented evidence when verified;
- pending/application context when supported;
- Active competition.

Do not invent achieved rent.

## 6.3 Adjustments and assumptions

Canonical facts and analysis assumptions remain separate.

Adjustments must be explainable, versioned and auditable.

Agent may Accept, Edit or Remove a suggestion. Manual changes retain reason/context.

No unexplained black-box similarity score may be the only reason a property is suggested as a comp.

No adjustment mutates canonical Property or Listing truth.

## 6.4 Versioning and audience

A saved CMA retains subject, client/opportunity, as-of date, source/comp snapshots, criteria, exclusions, adjustments, strategy, creator and version.

A delivered CMA never silently rewrites after source changes.

Client-facing output uses the Mallan creator's governed identity and only required third-party attribution.

Internal professional/owner PII must not leak into client output.

## 6.5 Property / Building memory

Verified reusable knowledge about a Property/Building remains attached to the canonical Property/Building rather than being trapped inside one client, CMA or transaction. This may include source-attributed listing episodes, Offering Plan/Schedule A versions, verified sale/rental history, prior Mallan CMAs, known lease history, authorized media, building documents and market observations.

Client-specific judgments, confidential notes and private financial facts remain scoped to the applicable Party/Opportunity and do not become general Building truth.

The purpose is compounding brokerage knowledge without creating a second property database.

---

# 7. BACKEND LISTING / OPPORTUNITY WORKSPACE

Every Search result or Mallan listing should open as a full professional working record, not only a form.

The workspace should show, where authorized/applicable:

- canonical property/building/unit identity;
- price/rent/offering price;
- status/availability and dates;
- rooms, size, floor and property type;
- charges/taxes/maintenance;
- description/source remarks;
- features/amenities;
- map/location context;
- photo/floor-plan/video/3D media;
- source/provenance/currentness;
- listing/source history;
- source professional/owner contact internally where permitted;
- Offering Plan/Schedule A/building documents;
- Client history;
- comments;
- showings;
- CMA/Compare;
- share/email eligibility.

## 7.1 Source-aware actions

Third-party/source observations are read-only.

Mallan-owned actions may include:

```text
SAVE / ATTACH
COMMENT
COMPARE
ADD TO CMA
VERIFY AVAILABILITY
CONTACT SOURCE
SCHEDULE SHOWING
SHARE / EMAIL IF ELIGIBLE
REFRESH / REVERIFY
```

Mallan-authored listings additionally allow:

```text
EDIT
MEDIA
MARKETING
REPORTS
OPEN HOUSES
OFFERS / APPLICATIONS
DOCUMENTS
DISTRIBUTION / RECONCILIATION
```

## 7.2 Quick Add Open House

Authorized Mallan-authored listings support Quick Add Open House without reopening the full listing form.

The event updates the canonical Listing and downstream marketing, matching and reporting where applicable.

Third-party listings may support internal showing coordination but Mallan does not edit the source broker's open house.

## 7.3 Refresh / Reverify

Refresh rechecks current authoritative source truth and shows material changes.

It never recreates the listing, silently changes identity or overwrites Mallan-authoritative fields.

---

# 8. DECISION & CALCULATOR ENGINE

Mallan has one deterministic calculator/scenario engine across Seller, Landlord, Buyer, Tenant and Investor workflows.

Supported scenarios may include:

- Seller net proceeds;
- Buyer cash-to-close;
- mortgage/payment;
- carrying costs;
- rent-v-buy;
- hold-v-sell;
- appreciation/equity;
- rental cash flow;
- NOI;
- cap rate;
- cash-on-cash;
- ROI;
- vacancy/reserve sensitivity;
- investment comparison;
- 1031 replacement analysis.

Known canonical facts prefill from the Property/Listing.

Client/Agent assumptions are explicit and never overwrite canonical truth.

Current fee/tax/regulatory inputs must use current verified sources or be labeled assumptions.

Saved analyses attach to the same Party/Opportunity/Property/Deal context.

---

# 9. MARKETING / E-BLAST / SHARE

Marketing uses canonical Listing, Party, Saved Search, Media and Agent identity. It does not create a second listing or contact database.

## 9.1 Marketing toolkit

Authorized Mallan marketing may include:

- E-blast / HTML-email campaigns;
- listing descriptions/headlines;
- New Listing campaigns;
- Price Change campaigns;
- Open House promotion;
- Buyer/Tenant match emails;
- prior-viewer follow-up;
- Seller/Landlord prospecting;
- past-client follow-up;
- investor/1031 campaigns;
- social-ready copy/assets;
- approved listing collateral;
- market/report summaries.

All outputs remain subject to advertising, Fair Housing, source, media and attribution rules.

A material canonical Listing change should emit one reusable change event for Search refresh, client alert evaluation, live-share invalidation, marketing follow-up, Listing Reporting and Intelligence. Do not maintain copied editable price/status truths in separate marketing artifacts.

## 9.2 Audience and send

Campaign flow:

```text
PURPOSE
→ AUDIENCE
→ CONTENT
→ PREVIEW
→ RECIPIENT REVIEW
→ APPROVAL WHERE REQUIRED
→ SEND / PUBLISH
→ DELIVERY / ENGAGEMENT
→ CLIENT HISTORY / LISTING REPORT
```

Audiences derive from canonical clients, Saved Searches, approved CRM segments or authorized cooperating-professional audiences.

Consent and suppression are centrally enforced.

## 9.3 Snapshot vs live share

Sent email/social content is an auditable snapshot.

A Mallan-controlled live share page may render current canonical listing truth when reopened, subject to rights.

Do not claim previously delivered third-party content can be rewritten after delivery.

## 9.4 Truthful engagement

Track only engagement actually observed, such as:

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

Unknown is not zero.

---

# 10. LISTINGS REPORTING

## 10.1 Listing reports

Mallan-authored Seller and Landlord listings support polished client reporting built from actual:

- marketing;
- website/client activity;
- sends/shares;
- inquiries;
- open houses;
- showings;
- feedback;
- offers/applications;
- price/status changes;
- Search/CMA market movement;
- distribution state.

Seller and Landlord reports remain separate products.

Internal views may show provenance/gaps. Client views are polished and client-safe.

Delivered reports are immutable versions.

Report author is the Mallan creator, plus only attribution legally/source-required for the content shown.

---

# 11. COMMUNICATIONS / COMMENTS / SHARE / DOCUMENTS / AGREEMENTS / MEDIA

## 11.1 One communication history

Comments, approved emails, listing sends, report sends, showing messages and supported portal communications attach to one canonical context.

Visibility may be:

```text
CLIENT SHARED
PARTICIPANT RESTRICTED
BROKERAGE INTERNAL
SENSITIVE / LEGAL RESTRICTED
```

Comments are chronological history, not one overwriteable note.

## 11.2 Tasks / Calendar / Reminders

Tasks and reminders attach to canonical business records and responsible people.

A task must identify:

- business record/context;
- owner;
- due date/time where applicable;
- status;
- reason/evidence;
- next action;
- completion history.

Calendar/reminder surfaces are workflow views over the same task/deal/showing/open-house dates, not a parallel scheduling truth.

## 11.3 Governed form/document catalog

Mallan maintains one governed document/form catalog.

It may contain:

- Mallan templates;
- uploaded approved forms;
- authoritative external links/forms;
- tracked external e-sign/signature workflows.

The catalog supports multiple variants by role, transaction, property type, representation structure and source context.

Important families include, as applicable:

- Seller representation/listing agreements;
- Landlord representation/listing agreements;
- Buyer representation agreements;
- Tenant representation agreements;
- Touring Agreement;
- agency disclosures;
- anti-discrimination/Fair Housing notices and evidence;
- Seller/Buyer agency disclosure;
- Landlord/Tenant agency disclosure;
- deal sheets;
- fully executed sale contracts when received/applicable;
- fully executed leases when received/applicable;
- referral/co-broker documents;
- transaction checklists;
- commission closeout documents.

Documents between Mallan and its licensees are a governed class of their own — independent-contractor agreement, brokerage policy acknowledgement and errors-and-omissions evidence — held against the canonical Agent identity.

Forms are configurable/versioned. No fixed commission, exclusivity or legal clause is hard-wired into application logic.

Mallan is not a generic legal-document authoring system for attorney-drafted sale contracts or other instruments outside the brokerage's authority.

Controlled language, negotiable fields and Broker-required exceptions are distinct.

Signed/executed records are immutable. Changes use amendments/replacements.

## 11.4 Form-catalog administration

Broker-authorized administration must support adding an approved form or authoritative link, uploading a replacement version, marking a prior version superseded, assigning role/property/workflow applicability and reviewing which active clients or deals still reference an older version.

A new form/version changes future applicability; it never rewrites the exact document/link/version that was already delivered, acknowledged or executed historically.

## 11.5 Document provenance and retention

Each generated/signed record retains, as applicable:

- form/template ID/version;
- authoritative source;
- parties/signers;
- Agent/Brokerage identity snapshot;
- Property/Listing/Opportunity/Accepted Deal context;
- negotiated terms;
- delivery/signature state;
- effective/expiration dates;
- audit history.

A required document attaches to the canonical context that created the obligation — Party/Opportunity, and Property/Listing where one applies — from the point the obligation arises, not only at signature.

Retention requirements are governed by current authoritative law/rules and Mallan policy, not guessed in product code.

## 11.6 Offering Plans

Offering Plans are Building/Property document sets, not Listing duplicates.

Mallan tracks original plan, Schedule A, amendments/supplements, provenance, completeness and currentness.

Authorized Agents may access them during Buyer research/deal support.

An authorized available set may be provided to a Buyer at $0 as a brokerage courtesy, with the exact supplied version recorded.

A future public paid-access option remains **held** until source, reproduction, redistribution, commercial-use, privacy, payment/refund and consumer-disclosure rights are proven. Any future price is configurable, not hard-wired.

## 11.7 Media

Media preserves the owning resource declared by the verified source. Cotality `Media.ResourceName` / `Media.ResourceRecordKey` ownership is not flattened into one generic listing-photo collection.

At minimum:

```text
MEMBER
→ AGENT / MEMBER PHOTOS

PROPERTY
→ LISTING / UNIT MEDIA

BUILDING
→ BUILDING / AMENITY MEDIA
```

Where the current authorized Cotality contract exposes other owners such as Office or Contacts, Mallan preserves that ownership/provenance if encountered; their existence does not automatically create a new Mallan product feature.

Property/listing media may include, where the exact provider category/type and rights support it:

- listing/unit photos;
- floor plans;
- video/tours;
- documents;
- ordering;
- primary-photo semantics.

Building media may be displayed inside a listing/property experience as a clearly separate Building section, but it remains Building-owned. It is not copied onto every unit and reclassified as Property-owned listing media.

Agent/Member media remains attached to the governed Agent/Member identity and must not enter listing-photo ordering.

Every media record retains:

- source/provenance;
- owning resource identity;
- rights/permission;
- media category/type;
- ordering where applicable;
- audience eligibility;
- capture/as-of date;
- last verification;
- whether the media is still believed to depict current condition.

Do not copy/rehost external media merely because it is publicly viewable.

Media corrections must be traced across Member/Agent profile, Building, Listing Workspace, Search, client share, reports, marketing, public pages, caches and storage without flattening ownership.

---

# 12. SELLER OPERATING JOURNEY

Role workflows stay separate while reusing the same Party, Property, Search, CMA, Communication, Document, Deal and history systems.

The shared brokerage lifecycle is:

```text
PARTY / PARTICIPANTS
→ ROLE OPPORTUNITY
→ REPRESENTATION / REQUIRED DISCLOSURES AS APPLICABLE
→ PROPERTY / SEARCH / LISTING / DECISION SUPPORT
→ ENGAGEMENT / SHOWINGS / FEEDBACK
→ OFFER OR APPLICATION
→ ACCEPTED DEAL
→ BROKERAGE DEAL PROGRESSION
→ CLOSED / RENTED
→ COMMISSION CLOSEOUT
→ POST-DEAL RELATIONSHIP / NEXT OPPORTUNITY
```

Role-specific differences remain explicit:

## 12.1 Seller

Seller adds Property authority, sale CMA, net/decision analysis, Mallan Sale Listing, distribution/publication, marketing, Open Houses/showings, Seller Reporting, pricing/marketing decisions and offer/net-scenario analysis.

---

# 13. LANDLORD OPERATING JOURNEY

This role uses the shared lifecycle defined in §12 and the same canonical Party/Property/Deal history.

## 13.1 Landlord

Landlord adds rental CMA, hold/sell/rent analysis, Mallan Rental Listing, rental marketing/reporting, application/qualification, lease/rented state and the lease-expiration review for renew, re-rent, sell, hold, reinvest or another investment purchase where appropriate.

The lease-expiration decision engine and response-driven follow-up rules are defined once in §19; this section does not duplicate that lead/relationship logic.

---

# 14. BUYER OPERATING JOURNEY

This role uses the shared lifecycle defined in §12.

## 14.1 Buyer

Buyer adds qualification/POF/preapproval, Agent Search, Saved Search and Client × Listing history, client-safe listing/opportunity sharing, showings, CMA/calculators/building documents, offer/negotiation and the post-close Owner relationship.

New-development/Schedule A information is Buyer/Investor intelligence unless Mallan separately holds listing/developer authority.

---

# 15. TENANT OPERATING JOURNEY

This role uses the shared lifecycle defined in §12.

## 15.1 Tenant

Tenant adds qualification, Agent Search, Saved Search and Client × Listing history, rental showings, application/guarantor/building process, lease/move-in and the lease-expiration review for renew, relocate or Buyer conversion.

Tenant lease-expiration and Tenant→Buyer conversion logic is governed by §19.

---

# 16. INVESTOR / 1031

This role uses the shared lifecycle defined in §12.

## 16.1 Investor / 1031

Investor/1031 reuses the Buyer/Seller/Landlord systems with specialized acquisition, rent, NOI/cap/cash-on-cash/ROI, financing, hold/exit, reinvestment and 1031 analysis. It may not create a separate property or Search universe.

---

# 17. AGENT SUPPORT / PROFESSIONAL OBLIGATIONS / MY PROFILE

Mallan supports professional compliance and administration without becoming an HR system. The boundary is narrow: Mallan governs the contractual, licensing, regulatory, tax and brokerage documents required to operate licensed independent contractors, and does not govern employment, payroll, benefits or personnel management.

## 17.1 Professional record

Agent My Business may show:

- license type/number/status/expiration;
- continuing education status;
- REBNY status/member identifier where applicable;
- insurance proof/status/expiration where applicable;
- required training;
- last verification;
- next action.

Agents may edit approved self-service profile fields such as photo, public bio, contact information, languages and specialties.

Regulated/governed professional fields require source/Broker verification where appropriate. One governed profile supplies future online profile, signature, business-card/letter identity and approved marketing/report creator blocks.

## 17.2 Onboarding / offboarding

Onboarding must preserve one Agent identity across:

```text
ROSTER
→ AUTHENTICATION
→ CRM
→ PROFESSIONAL PROFILE
→ LISTING ATTRIBUTION
→ PUBLIC PROFILE
→ COMMISSION / REFERRAL HISTORY
```

Normal offboarding preserves history and deactivates access.

Permanent deletion is a mistake-rollback exception for an erroneous/never-used identity and must fail closed when legitimate brokerage history exists.

The Broker opens an Agent with business terms only — name, email and the agreed sale, rental and referral splits. A secure invitation opens onboarding-only access on that same canonical account; the Agent completes their own onboarding package, and the governed agreement draws canonical identity, verified license type/number and the agreed splits from the record rather than from re-entry. There is no second Agent record, no second onboarding account and no Broker re-key path.

Completion does not activate. The signed package returns to the Broker, the Broker performs the NYS DOS association, and only authoritative active status opens normal platform access and the public profile. Verified Cotality Member linkage follows the same canonical identity. Offboarding deactivates that account while preserving governed history.

## 17.3 W-9 / 1099 administration

Mallan should support the independent-contractor tax administration chain:

```text
AGENT W-9
→ VERIFIED TAX-PAYEE RECORD
→ ACTUAL AGENT PAYMENTS
→ TAX YEAR TOTAL
→ APPLICABLE 1099 PREPARATION / RECORD
→ DELIVERY / AGENT ACCESS
→ CORRECTION HISTORY
```

Tax forms and sensitive tax identifiers require strict access and privacy controls.

Submitted taxpayer-identification content is not redisplayed in ordinary Agent surfaces; completion state and date may show.

Mallan supports recordkeeping/export; it does not replace the accountant or tax professional.

---

# 18. BROKERAGE VIEW — SIMPLE FIRM OVERSIGHT

Brokerage View is practical, exception-oriented firm oversight.

Primary areas:

```text
OVERVIEW
AGENTS
LEADS / CLIENTS
LISTINGS
DEALS
MONEY / REFERRALS
COMPLIANCE
TECHNOLOGY / DATA HEALTH
```

Useful exceptions include:

- Agent license/CE/insurance/training risk;
- Agent pipeline/production/GCI visibility where applicable;
- onboarding/access problem;
- lead follow-up problem;
- active listing issue;
- data/source/rights/currentness issue;
- missing required agreement/disclosure;
- deal support need;
- Offering Plan/document gap;
- commission/referral blocker;
- brokerage receivable/payment and accountant-ready annual record exception;
- advertising/compliance exception;
- provider/mapping drift;
- public-data inconsistency.

Brokerage View supervises the same canonical records used by Agents.

No Manager role is required.

---

# 19. LEADS / PERFORMANCE / MONEY / COMMISSIONS / REFERRALS

Lead generation and CRM activity are first-class brokerage infrastructure. Lead sources may include public web/search/listing inquiries, showing or Open House activity, marketing/E-blast campaigns, referrals, past clients, Agent-generated business, Brokerage-generated business, approved prospecting and other authorized sources. Every Lead retains its source and original context.

```text
LEAD SOURCE / PUBLIC INQUIRY / REFERRAL / AGENT ENTRY
→ IDENTITY RESOLUTION
→ EXISTING PARTY / NEW PARTY
→ EXISTING AGENT RELATIONSHIP CHECK
→ ASSIGNMENT / OWNERSHIP
→ FIRST CONTACT
→ QUALIFICATION
→ ROLE / INTENT
→ OPPORTUNITY
→ FOLLOW-UP
→ REPRESENTATION / ACTIVE BUSINESS
→ CONVERT / NURTURE / LOST
→ FUTURE OPPORTUNITY / PAST CLIENT
```

## 19.1 Durable inquiry rule

A public inquiry, showing request, contact form, search alert or other meaningful lead action must create durable CRM history.

Email delivery alone is never the system of record.

## 19.2 Assignment

Brokerage-generated leads retain:

- source;
- original timestamp;
- assigned Agent;
- acceptance/decline/reassignment history;
- first-contact status;
- follow-up;
- conversion result.

Agent-created/owned business remains in the Agent's My Business view while remaining visible to the Broker as required.

## 19.3 Opportunity transitions

One Party may move between or hold multiple opportunities:

```text
TENANT → FUTURE BUYER
BUYER → OWNER → FUTURE SELLER / LANDLORD
SELLER → BUYER / INVESTOR
LANDLORD → SELLER / INVESTOR
PAST CLIENT → REFERRAL SOURCE / NEW OPPORTUNITY
```

Transitions reuse the Party and property history rather than creating a new contact.

## 19.4 Relationship plan

Mallan preserves the next meaningful relationship horizon for active and past clients without creating a separate nurture database. Applicable review triggers may include:

- lease expiration;
- planned purchase/sale timing supplied by the client;
- ownership/investment review;
- agreed future follow-up;
- referral follow-up;
- post-close or post-rental review;
- CMA/valuation refresh requested or scheduled by the Agent/client.

The relationship plan records explicit client/Agent commitments and dates. Intelligence may suggest a review from evidence, but it may not silently manufacture intent or overwrite an agreed follow-up.

## 19.5 Lease-expiration lifecycle

For an active lease, Mallan should begin decision support approximately six months before expiration.

Landlord-side review may include:

- current sale CMA;
- current rental CMA;
- current rent vs market rent;
- carrying costs;
- renew vs re-rent;
- hold vs sell;
- sell and reinvest;
- buy another investment property while retaining the current property where appropriate;
- replacement investment / 1031 analysis where applicable.

Tenant-side review may include:

- current rent;
- expected renewal;
- rental alternatives;
- rent-v-buy;
- cash-to-close;
- ownership carrying cost;
- matching purchase inventory.

Follow-up timing may use practical 90/60/30-day stages, but later actions should respond to the client's actual decision rather than blindly fire generic reminders.

---

## 19.6 Practical Agent performance

Performance reporting is limited to business-useful outcomes such as lead response/conversion, active representations, listings, closed/rented business, follow-up completion, marketing/report follow-through, professional/compliance exceptions and production/GCI where applicable. It is brokerage support and supervision, not employee-HR surveillance.

## 19.7 Keep compensation layers separate

```text
1. CLIENT AGREEMENT COMPENSATION
   negotiated Seller / Landlord / Buyer / Tenant terms

2. OWNER-AUTHORIZED EXTERNAL-BROKER COMPENSATION
   Seller/Landlord-side cooperating broker terms, if any

3. INTERNAL MALLAN COMPENSATION
   brokerage share, Agent split, co-Agent allocation,
   referral, approved adjustment and Agent payout
```

Layer 3 never determines Layers 1 or 2.

No percentage, flat fee, payer, source or split is hard-wired because of template, lead source, property type or Agent.

Executed agreements/amendments are the source for contractual compensation terms. Touring Agreement compensation, scope, duration and exclusivity come from the executed approved form and are never inferred as `$0`, fixed-fee or non-exclusive by software.

For Seller/Landlord business, any owner-authorized external cooperating-broker terms are recorded from the applicable executed agreement and later reconciled to the actual close/rented evidence available to Mallan. This is separate from Mallan's own brokerage compensation and internal Agent split.

## 19.8 Commission closeout

After closed/rented/completed status:

```text
EXECUTED COMPENSATION TERMS
→ REQUIRED CLOSEOUT DOCUMENTS
→ MALLAN COMPENSATION DUE / RECEIVED STATE
→ INTERNAL SPLIT / REFERRAL
→ BROKER REVIEW IF REQUIRED
→ AGENT PAYOUT
→ COMMISSION STATEMENT
```

Agent Money should make clear:

```text
EXPECTED
DOCUMENTS OUTSTANDING
PAYMENT NOT RECEIVED
READY FOR REVIEW
APPROVED
PAID
```

Agents can access their own transaction-linked commission statements/reports.

Mallan records operational commission/payment status; it is not the firm's accounting ledger replacement.

## 19.9 Referrals

Retain the existing Incoming and Outgoing referral business concepts; do not build a separate referral system.

The Agent can create/read/update the Agent's own referrals and see the Agent's own fee/payment state; those values are not Broker-only.

- partner brokerage/professional;
- referred client;
- direction;
- deal type;
- executed fee terms;
- expected/calculated amount;
- stage;
- last check-in;
- next follow-up;
- expected completion;
- fee due/received or payable/paid state.

Check-ins are append-only history and do not rewrite the executed referral agreement.

Brokerage View has firm-wide supervisory access.

---

# 20. TRANSACTIONS / DEAL SUPPORT / PAYMENT READINESS

Mallan's "deal" system tracks brokerage process and commission readiness. It is **not** an escrow or money-transfer system.

## 20.1 No client-funds handling

Mallan does not:

- hold buyer deposits;
- hold seller proceeds;
- hold escrow;
- transfer purchase funds;
- act as closing agent;
- replace the parties' attorneys;
- represent attorney-controlled funds as Mallan-held money.

## 20.2 Where offer/application state belongs

Offer, application, acceptance, financing indicators, representation/exclusive documents, disclosures and property-specific deal records belong to the canonical client/opportunity/property/listing chain.

```text
PARTY
→ OPPORTUNITY
→ REPRESENTATION / EXCLUSIVE
→ PROPERTY / LISTING
→ OFFER / APPLICATION
→ ACCEPTED DEAL
→ DEAL PROGRESSION
→ CLOSED / RENTED
→ COMMISSION CLOSEOUT
```

Do not create an independent "transaction" copy that becomes a competing owner of the same deal facts.

## 20.3 Sale progression

A sale may track, as applicable:

- accepted offer;
- attorney contacts;
- due-diligence/contract indicators;
- financing type: cash or financed;
- mortgage application;
- appraisal;
- commitment/approval;
- financing contingency state;
- co-op board/application/interview;
- condo managing-agent/waiver/application process;
- walkthrough;
- closing date/status;
- required brokerage records received.

Exact stages are configurable to the actual property/deal.

## 20.4 Rental progression

A rental may track, as applicable:

- application;
- qualification/document state;
- guarantor;
- landlord decision;
- building/management process;
- approval;
- lease execution;
- move-in/rented state;
- required brokerage records received.

## 20.5 Professional contacts

Attorneys, law firms, lenders, mortgage professionals, managing agents and similar professionals are reusable canonical Parties/Organizations and are linked to the accepted deal as needed.

---

# 21. TECHNOLOGY / REBNY / RLS / PROVIDER + SUPPLEMENTAL SOURCE GOVERNANCE

## 21.1 Authority layers must stay separate

- **New York law / NYS DOS / Fair Housing / advertising law** govern legal brokerage conduct.
- **REBNY / RLS / UCBA** govern applicable brokerage participation, cooperation, listing-use and display rules.
- **Cotality / Trestle** is the current provider implementation contract and current provider authority for Cotality-served fields, statuses, resources, picklists, media ownership and provider-event semantics within Mallan's entitlement.
- **REBNY / RLS** is not a provider API, field/status vocabulary or mapping authority; it remains a separately applicable brokerage/compliance/use/display authority.
- **NYS Attorney General offering-plan records** govern their own filed documents and Schedule A facts.
- **Mallan** is authoritative for Mallan-authored business records, local workflow state and brokerage decisions.
- **Other supplemental sources** are authoritative only within their verified source scope and rights.

Cotality/Trestle may expose RESO-shaped vocabulary. **RESO is provider-schema language, not a separate Mallan business authority.**

Do not combine "Cotality contract" and "RLS rules" into one fictional authority. They must be reconciled, not conflated.

## 21.2 Legacy external-platform references are not Mallan architecture

No legacy listing-input, syndication or external operating platform is a canonical Mallan provider, data authority or product dependency unless Maya explicitly adds it to the current architecture. Historical references may remain evidence only and may not define current Mallan field truth, business rules, provider mapping or future publishing.

The governing stack is:

```text
NEW YORK LAW / NYS DOS
+ FAIR HOUSING / HUMAN RIGHTS
+ REAL-ESTATE ADVERTISING RULES
+ REBNY
+ RLS
+ UCBA
+ REBNY TECHNOLOGY / DATA / DISPLAY REQUIREMENTS
+ COTALITY / TRESTLE PROVIDER CONTRACT
+ SOURCE / MEDIA RIGHTS
+ WEB / PUBLICATION REQUIREMENTS
↓
MALLAN RULE REGISTRY
↓
MALLAN FIELD / SOURCE / RIGHTS CONTRACT
↓
MALLAN BUSINESS RULE
↓
PUBLIC / CLIENT / AGENT / BROKER CONSUMER
```

Detailed current rules belong in `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and its referenced authoritative files.

The Master defines the architecture and fail-closed obligation; it does not duplicate every current legal rule or provider field. Provider/source replacement must occur through verified adapters/mappings rather than forcing Search, CMA, Listing, Reporting or CRM to be rewritten around a vendor.

## 21.3 Rule / field registry

A governed rule or field mapping should record, as applicable:

- authority/source;
- effective/version date;
- last verified date;
- applicability;
- canonical Mallan field/rule;
- source resource/field;
- type/picklist/null semantics;
- rights/visibility;
- read/write direction;
- affected systems;
- implementation mapping;
- tests/proof;
- open uncertainty.

## 21.4 Change/drift workflow

```text
CHANGE DETECTED
→ EVIDENCE
→ AUTHORITY / SOURCE RIGHT
→ IMPACT GRAPH
→ CORRECTION
→ DIRECT + NEGATIVE TESTS
→ DOWNSTREAM / COMPLIANCE TESTS
→ PREVIEW PROOF
→ AUTHORIZED PRODUCTION PROOF
→ REGISTRY UPDATE
```

Unknown critical source/compliance changes fail closed. Material authorities, provider metadata/picklists and rights-dependent sources must have a recurring verification/drift process rather than relying on memory or chance discovery.

## 21.5 Media governance

Media use requires:

```text
SOURCE
→ RIGHTS / LICENSE
→ PROPERTY / BUILDING / LISTING IDENTITY
→ STORAGE / CACHE AUTHORITY
→ AGENT USE
→ CLIENT USE
→ PUBLIC USE
```

A media fix is incomplete if another surface still uses stale, unauthorized or mismatched media.

## 21.6 Web/publication governance

```text
LISTING / AGENT / BROKERAGE AUTHORITY
→ PUBLICATION ELIGIBILITY
→ ADDRESS-DISPLAY RULE
→ ATTRIBUTION
→ MEDIA ELIGIBILITY
→ CLIENT/PUBLIC-SAFE TRANSFORM
→ CANONICAL URL
→ STRUCTURED DATA
→ SEARCH / SEO / AEO
→ INQUIRY
→ DURABLE CRM ACTIVITY
```

"The page loads" is not publication proof.

## 21.7 Public-content / algorithmic compliance contract

The same publication boundary applies before content or recommendations are exposed through listing descriptions, neighborhood copy, AI-generated copy, Media captions, email/E-blast, social content, market reports, Search/recommendation ranking, audience targeting, SEO/AEO, structured data and lead-generation pages.

Fair Housing, anti-discrimination, advertising, privacy/consent, source-rights and applicable REBNY/RLS/UCBA/provider rules are enforced at generation/selection/publication time; a footer disclaimer is not a substitute. Protected characteristics or prohibited proxies may not drive housing matching, ranking, targeting or personalization.

---

# 22. SYSTEM INTELLIGENCE / CONTEXTUAL AI

System Intelligence converts canonical business events into evidence-backed attention and decisions.

It is not merely a chat box.

## 22.1 Intelligence domains

```text
CLIENT / RELATIONSHIP
LISTING / MARKET
DEAL
MONEY / COMMISSION
COMPLIANCE / PROFESSIONAL
TECHNOLOGY / DATA
```

Each signal follows:

```text
CANONICAL RECORD
→ EVENT / CHANGE / DEADLINE
→ VERIFIED EVIDENCE
→ BUSINESS RULE
→ IMPACT / RISK / OPPORTUNITY
→ RESPONSIBLE PERSON
→ NEXT ACTION
→ PRIORITY / DUE
→ RESOLUTION
→ AUDIT HISTORY
```

## 22.2 Client behavior vs interpretation

Mallan must distinguish:

```text
WHAT THE CLIENT SAID
WHAT THE CLIENT DID
WHAT THE SYSTEM OBSERVED
WHAT THE AGENT CONCLUDED
```

Useful evidence may include:

- Saved Search criteria;
- repeated views;
- saves/likes;
- passes/rejections and recorded reasons;
- showing requests/completions;
- comments/feedback;
- price/feature tradeoffs;
- offer/application behavior;
- financing readiness supplied by the client/Agent;
- calculator/CMA use;
- lease-expiration timing.

The system may summarize patterns but must show the evidence and preserve human judgment.

## 22.3 Intelligence uses

Possible intelligence includes:

- client fit and changing preferences;
- property-match opportunity;
- market/CMA change;
- listing engagement deterioration;
- Seller/Landlord pricing/repositioning need;
- lease-expiration decision readiness;
- deal/document risk;
- commission/referral blocker;
- professional compliance deadline;
- provider/rule/mapping drift.

## 22.4 Protected-class / steering boundary

AI and analytics may never infer, rank, steer, segment or recommend housing based on protected characteristics or proxies for protected characteristics.

Neighborhood, school, demographic or behavioral analysis must remain within lawful, objective real-estate criteria and Fair Housing rules.

## 22.5 AI permissions

AI may:

- explain Search/property/CMA results;
- summarize verified activity;
- draft client communications;
- draft marketing/report narrative;
- suggest follow-up;
- surface missing facts;
- assist with approved document/compliance lookup.

AI may not:

- invent facts;
- silently mutate canonical records;
- bypass rights/compliance;
- change formulas/inputs without visibility;
- send/publish without required approval;
- alter signed agreements;
- make binding legal/tax conclusions;
- create a separate AI-only search/client/property truth.

---

# 23. PRODUCT EXPERIENCE / NAVIGATION / ROLE WORKSPACES

The platform should feel like one operating system, not a collection of disconnected admin pages.

## 23.1 Global screen rule

Every important screen should answer:

1. What is this record?
2. What changed?
3. What matters now?
4. What can I do next?

## 23.2 Agent / My Business

A practical navigation target:

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

CMA, calculators, comments, share, Offering Plans and Intelligence are contextual capabilities rather than separate duplicate products.

## 23.3 Brokerage View

The product surface implements the firm-wide exception and oversight contract in §18 over the same canonical records. Navigation may group those concerns for usability, but it may not create a second pipeline, compliance queue, money truth or client truth.

## 23.4 Client experience

Buyer/Tenant clients may receive role-appropriate:

- Search/recommendations;
- viewed/saved/liked/interested/pass/hide/share state;
- comments;
- showing requests;
- shared CMA/analysis;
- documents;
- offer/application/deal status;
- timeline.

Seller/Landlord clients may receive role-appropriate:

- listing;
- marketing activity;
- inquiries/showings;
- feedback;
- reports;
- market/CMA updates;
- offers/applications;
- deal progress;
- documents;
- timeline.

Client surfaces contain only client-eligible information.

## 23.5 Public web

Public web includes, as applicable:

- brokerage identity;
- governed agent profiles;
- eligible listings;
- Consumer Search;
- property/listing pages;
- compliant content;
- contact/inquiry;
- showing/information requests;
- SEO/AEO.

Every inquiry feeds the canonical Lead/Party/Opportunity system. Public acquisition should expose distinct, truthful entry paths for Buyer, Seller, Landlord/Owner, Tenant/Renter, Investor/1031 and New-Development Buyer Representation so the resulting Opportunity context is not lost in a generic contact form.

## 23.6 Contextual rendering contract

No component should render merely because data exists.

```text
CANONICAL RECORD
→ BUSINESS / PROPERTY TYPE
→ AUDIENCE
→ BUSINESS RULE
→ COMPLIANCE / RIGHTS
→ COMPONENT ELIGIBILITY
→ RENDER
```

Commercial/residential, sale/rental, Agent/client/public and source-specific modules must render only in valid context.

## 23.7 Responsive rule

Desktop, tablet and mobile are presentations of the same workflow truth.

Mobile may simplify presentation but may not silently remove criteria, fields, states, history or permissions from the canonical workflow.

---

# 24. REQUIREMENT / DOCUMENT GOVERNANCE AND CURRENT-TO-TARGET MAP

There is one durable product/system plan: this file. Operational state, evidence and specialized registries remain subordinate and may not independently redefine product architecture.

New requirements are reconciled into this same Master rather than spawning another Search, CMA, Listings, Reporting, Brokerage or Technology plan.

A Business-Completeness Matrix should map each material capability to: business outcome, actor, canonical objects, authoritative facts, writers, readers, lifecycle, downstream consumers, compliance/rights, Intelligence, role experience, Definition of Done and current implementation/gap state. The matrix is an index/proof aid, not a second architecture.

Requirement states may include `PRESERVED`, `SUPERSEDED`, `INVALIDATED`, `MISSING — RESTORE`, and `HELD / MAYA DECISION REQUIRED`. A historical file/ledger does not become current merely because it exists.

Meaningful implementation work should preserve stable requirement/layer IDs where they already exist, so a requirement cannot disappear because prose is reorganized.

Current-to-target implementation status belongs primarily in the execution-state file. This Master carries only durable target contracts.

## 24.1 What belongs outside this Master

To prevent this file from becoming bloated again, the following do **not** belong here:

- current PR numbers;
- branch names or current SHAs;
- deployment IDs;
- current test counts;
- temporary recovery scores;
- current blockers/next actions;
- person-specific recovery state;
- session handoffs;
- current issue lists;
- temporary implementation holds;
- raw Cotality field tables/picklists;
- verbatim legal/provider rule catalogs;
- duplicate current-state maps;
- one-off forensic histories.

Use:

```text
MALLAN-PLATFORM-MASTER-PLAN.md
→ durable business/product/system authority

docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md
→ current implementation state, heads, blockers and next action

docs/compliance/COMPLIANCE-CANONICAL-INDEX.md
→ current detailed compliance implementation registry

provider field/source registries
→ current field/picklist/mapping evidence

historical audits / recovery docs
→ evidence only
```

`AGENTS.md`, `CLAUDE.md`, `AI-START-HERE.md` and other startup instructions must explicitly remain subordinate to this Master for product/business architecture and must not identify an older document as a competing "master plan."

Any subordinate file that conflicts with this Master must be corrected or clearly marked historical before the Master is treated as final.

---

# 25. DEVELOPMENT SEQUENCE — ONE CONTINUOUS PROGRAM

Every material capability starts from the business contract:

```text
BUSINESS OBJECTIVE
→ ACTORS
→ CANONICAL BUSINESS OBJECTS
→ AUTHORITATIVE FACTS / SOURCES
→ WRITERS
→ BUSINESS RULES
→ READERS / DOWNSTREAM CONSUMERS
→ ROLE EXPERIENCES
→ COMPLIANCE / RIGHTS
→ PERSISTENCE / HISTORY
→ DIRECT + NEGATIVE TESTS
→ INTEGRATION
→ DOWNSTREAM TESTS
→ PREVIEW PROOF
→ PRODUCTION PROOF
```

Only after this chain is known should work be translated into branches/PRs.

**PR numbers never define the business architecture.**

Development follows dependency order, not PR age or feature visibility:

```text
AUTHORITY / IDENTITY / CANONICAL WRITERS
→ SEARCH
→ CMA / PROPERTY INTELLIGENCE
→ BACKEND LISTING / OPPORTUNITY WORKSPACE
→ MARKETING / REPORTING
→ DECISION / CALCULATORS / INTELLIGENCE
→ COMMUNICATIONS / DOCUMENTS / DEAL SUPPORT
→ ROLE JOURNEYS
→ AGENT / BROKERAGE / MONEY / TECHNOLOGY
→ FUTURE MALLAN → PROVIDER PUBLISHING WHEN AUTHORIZED
→ HISTORICAL RETIREMENT / FINAL PROOF
```

The dependency sequence may be advanced in bounded checkpoints, but downstream systems may not create parallel data truth to bypass an unfinished foundation. A newly recovered requirement reopens only its affected dependency.

---

# 26. GLOBAL DEFINITION OF DONE

A capability is not complete because code exists, CI is green, a PR is open/merged, or one screen looks correct.

For every material workflow, prove as applicable:

1. one canonical identity is reused;
2. source authority is correct;
3. Mallan-authored vs third-party edit authority is enforced;
4. required fields persist with no silent loss;
5. permission/privacy/compliance rules are enforced before serialization/display;
6. downstream consumers use the same canonical truth;
7. durable history/audit exists;
8. failure/unknown state is visible and recoverable;
9. direct and negative tests pass;
10. integration and downstream tests pass;
11. responsive/browser behavior is proven where relevant;
12. Preview behavior is proven at the exact head;
13. Production is proven only after authorized deployment;
14. Neon/R2/cache/cron behavior is measured where the feature can affect infrastructure cost/reliability;
15. no material regression is introduced;
16. active business records have a responsible person and an explicit next-action/review/closed state;
17. retry/recovery of a critical action cannot silently duplicate or lose the intended business effect.

## 26.1 Search

Search is not done until criterion execution/refusal, identity, source authority, dedupe, count, global sort, pagination, Map, Saved Search, Client history, Compare, Reports, CMA inputs and client-safe output agree on the same result universe.

The Consumer/Agent boundary additionally requires NEGATIVE proof, demonstrated behaviourally:

- a public Consumer Search request cannot obtain a professional/member-only field or private
  inventory;
- an unauthenticated caller cannot execute Agent Search;
- Agent Search direct-loads and executes without the CRM application shell;
- a change to shared mapping, identity or media cannot erase the Consumer/professional DTO and
  permission boundary.

## 26.2 Listing intake

Sale/Rental intake is not done until every enabled field proves `create → save → reload → edit → save → reload`, Mallan-authored records remain editable and provider-owned records remain read-only.

## 26.3 CMA

CMA is not done until it uses the corrected Search universe, verified Closed sale valuation evidence, separate market context, auditable adjustments, versions and client-safe output.

## 26.4 Marketing / reporting

Marketing/Reporting is not done until it uses canonical Listing/Party/Search activity, actual delivery/engagement, valid audience/consent, immutable sent/report versions and no duplicate contact/listing truth.

## 26.5 Deal / money

Deal closeout is not done until accepted-deal progression, required brokerage records, contractual compensation truth, received/due state, internal split/referral and Agent payment status stay joined without implying Mallan holds client escrow/funds.

## 26.6 Agent / brokerage

Agent administration is not done until identity, license title, authentication, CRM, public profile, listing attribution, referrals, commissions, W-9/1099 administration and offboarding all resolve to the same canonical Agent.

## 26.7 Public web

Public publication is not done until canonical URL, structured data, address-display eligibility, attribution, media rights, role/title truth, compliant contextual rendering and durable inquiry capture are proven.

## 26.8 Provider lifecycle / DOM / Media

Provider lifecycle interpretation is not done until:

- current Cotality provider state, provider transition/event evidence and Mallan display wording remain separate;
- `Pending` → Mallan **In Contract** behavior is proven against the current authorized Cotality contract/feed mapping;
- Closed Sale vs Closed Rental renders Sold vs Rented/Leased correctly;
- unresolved feed disappearance preserves provider history and uses Mallan **Off Market** without manufacturing a provider reason;
- no canonical `Delisted` status exists;
- Coming Soon DOM and market DOM are separate and have one owner each;
- the actual Sale and Rental contract-signed endpoint used for market DOM is provider-verified;
- Member/Agent, Property/Listing and Building Media ownership remains distinct from source through storage and every consumer.

---

# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL

The recovery/execution program does not create a second architecture. It governs how the Master is implemented and proven. Temporary PRs, SHAs, blockers and scores stay in `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

## 27.1 Closure model

```text
PROVEN DEFECT / REQUIREMENT
→ ROOT CAUSE / CURRENT GAP
→ ALL AFFECTED WRITERS + READERS + PUBLISHERS
→ CORRECTION
→ DIRECT TESTS
→ NEGATIVE TESTS
→ INTEGRATION / ROUND TRIP
→ DOWNSTREAM
→ COMPLIANCE / SECURITY
→ EXACT PREVIEW PROOF
→ INDEPENDENT VERIFICATION
→ MAYA BUSINESS ACCEPTANCE WHERE REQUIRED
→ AUTHORIZED PRODUCTION PROOF
→ CLOSED
```

No endless `test fails → patch → next test fails` loop without first establishing the impact graph.

## 27.2 One writer / independent proof

One active branch/worktree has one writer.

Independent verification is separate from Builder self-certification.

Evidence classes remain distinct:

- black-box runtime;
- data/structural;
- Builder test/static evidence.

They may jointly support a release decision but may not be mislabeled as one another.

## 27.3 Exact-head / environment binding

Runtime acceptance is bound to:

- exact Git SHA;
- exact Preview/deployment;
- frozen acceptance matrix;
- relevant environment/QA state.

Functional changes after verification require re-verification of affected acceptance.

## 27.4 Golden Thread + breadth matrix

A Golden Thread proves cross-system integration.

A fixed breadth matrix proves coverage.

Both are required for material systems such as Agent identity, Listing intake, Search, Media, Saved Search, CMA and client workflow.

## 27.5 No-restart rule

When a defect reopens:

```text
PRIOR PROVEN CONCLUSION
+
NEW MEASURED DELTA
→ BOUNDED REOPEN
```

Do not restart generic audits merely because context or session changed.

## 27.6 Durable business effects

For critical actions that change canonical state and trigger downstream work, the design must prove that a partial failure cannot silently lose or duplicate the business effect. Examples include Lead creation/assignment, Listing publication changes, client alerts, signed-document state, accepted deals, commission/payment state and lease-expiration workflow creation.

Required property:

```text
CANONICAL COMMAND
→ AUTHORITATIVE STATE CHANGE
→ DURABLE EFFECT / EVENT RECORD
→ DOWNSTREAM PROCESSING
→ IDEMPOTENT RETRY
→ VERIFIED POSTCONDITION
```

The implementation mechanism may use existing database/workflow capabilities; this Master does not mandate a new event-sourcing platform. The business invariant is that retrying cannot create a second Lead, second payment, second send or contradictory state.

## 27.7 Business reliability measures

Reliability is measured at the business boundary, not only by HTTP uptime. Material workflows should define measurable service indicators appropriate to their risk, such as:

- inquiry became a durable Lead exactly once;
- assigned Lead has an owner and next action;
- enabled form fields survive round trip;
- Search count and displayed universe agree;
- client send/delivery state is truthful;
- required lease-expiration review is created on time;
- commission/payment state reconciles to canonical deal truth;
- public publication passes contextual/compliance eligibility;
- failed downstream work is visible and recoverable.

Targets, alert thresholds and current measurements belong in execution/operations evidence, not in this durable Master.

---

## 27.8 Mutation boundaries

Production/schema/migration/backfill, destructive data/R2, environment/credential, force-push/rebase of shared work and manual Production deployment remain explicit Maya authorization boundaries. A held mutation freezes only that mutation; safe independent work continues.

## 27.9 Execution-state boundary

`MALLAN-CONTINUOUS-EXECUTION-STATE.md` owns the current active layer, branch/head, PR, blockers, test/runtime/provider evidence, controlled holds and next exact action. This Master owns durable business architecture and proof rules. If the execution state conflicts with this Master on architecture, the Master wins; if the Master contains temporary status, move that status out rather than treating it as durable architecture.

## 27.14 Permanent independent verification structure

The independent-verification model in §§27.2–27.4 is permanent, not a temporary recovery tactic. It applies across Listing intake, Search, CMA, Media, Open House, Map, Saved Search, Reports, CRM, authorization, compliance, Neon/R2 and every later material capability.

Builder implementation evidence, data/structural evidence and independent black-box runtime evidence remain separately labeled. A capability may not be self-certified by the Builder, and a verifier/validator may not silently become a second Builder. Exact-head/environment binding and Golden Thread + breadth-matrix proof remain mandatory where applicable.

---
