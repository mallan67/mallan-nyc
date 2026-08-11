# MALLAN CANONICAL REQUIREMENT LEDGER

> **Subordinate canonical ledger to `MALLAN-PLATFORM-MASTER-PLAN.md`.**
>
> This is not a second master plan. The master plan defines the architecture and rules; this ledger gives every business requirement a stable ID, canonical owner, source/dependency and proof state so requirements cannot disappear into audits, chats, hold files or isolated specifications.

## Governance

1. Every meaningful business requirement must receive a stable ID before implementation.
2. Requirements discovered in older plans, audits, hold files, specifications, code or future conversations must be reconciled here.
3. A requirement may not be marked PROVEN merely because a UI, route, table or test exists. It is PROVEN only when its end-to-end business handoff is demonstrated.
4. No requirement may create a parallel Party, Property, Listing, Search, Client, Deal, Commission, Document, Communication or Marketing identity without an explicit migration/retirement decision.
5. New source data attaches to existing canonical identities whenever it describes the same real-world Party/Property/Listing Episode.
6. Every derived card, report, campaign and dashboard must reference canonical records rather than copy business truth into a new store.
7. Historical audits/specs remain evidence; they do not become competing authorities.
8. This is a seed ledger. The next consolidation pass must inventory all legacy plans/audits/specs/holds and reconcile every still-valid requirement into this file. Absence from the seed is not proof that a legacy requirement is rejected.

## Status vocabulary

`DISCOVERED → DESIGNED → BUILDING → WIRED → PROVEN → RETIRED`

Use `BLOCKED` only with a named blocker and owner.

---

# A. Canonical identity and relationships

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| PARTY-001 | One canonical identity for every Individual. | Party / Individual | DESIGNED |
| PARTY-002 | Business-facing flows support **Individual(s)**, including multiple sellers, buyers, tenants or landlords on one opportunity/transaction. | Party / Opportunity participant | DESIGNED |
| PARTY-003 | One canonical Entity identity with types including LLC, LLP, Corporation, Partnership, Trust, Estate and Other. | Party / Entity | DESIGNED |
| PARTY-004 | Seller, Buyer, Tenant, Landlord, Investor, Owner, Guarantor, Trustee, Executor, Authorized Signatory and other roles are relationships/roles, not duplicate identities. | PartyRole / Relationship | DESIGNED |
| PARTY-005 | One Individual or Entity may hold multiple roles over time or simultaneously. | PartyRole | DESIGNED |
| PARTY-006 | Entity relationships support trustee/co-trustee, executor, member, manager, partner, officer and authorized signatory as applicable. | PartyRelationship | DESIGNED |
| CONTACT-001 | Individuals and Entities may have multiple email addresses, phones and mailing addresses. | ContactMethod | DESIGNED |
| CONTACT-002 | Preferred communication channel is stored once and reused across listings, deals and portals. | CommunicationPreference | DESIGNED |
| CONTACT-003 | Contact eligibility/consent/suppression state is centrally enforced rather than copied into campaign-specific lists. | Consent/Suppression | DESIGNED |
| PRO-001 | Attorneys/law firms are reusable canonical professional Parties/Organizations. | Party / Organization | DESIGNED |
| PRO-002 | Lenders, mortgage professionals, managing agents and other transaction professionals are reusable canonical records. | Party / Organization | DESIGNED |
| PRO-003 | Once an offer is made, attorney contact information must be requested/confirmed for the relevant side(s). | TransactionParticipant workflow | DESIGNED |

---

# B. Agent and brokerage workspace

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| AGENT-001 | Agents can update their own backend profile: photo, public bio, contact information, languages, specialties and other broker-approved public profile fields. | AgentProfile linked to canonical Individual | DISCOVERED |
| AGENT-002 | Regulated/governed fields such as license identifiers, license status, office/broker affiliation and other supervisory fields cannot be freely overwritten by the agent when broker/source verification is required. | AgentCredential / Broker supervision | DISCOVERED |
| AGENT-003 | Agent profile changes retain audit history and broker override/approval where the field requires supervision. | AuditEvent / AgentProfile | DISCOVERED |
| AGENT-004 | Each agent has a My Business dashboard over the same canonical leads, clients, searches, listings, showings, deals, tasks and commissions used by the brokerage view. | Agent workspace projection | DESIGNED |
| AGENT-005 | Agents can track every deal from opportunity through closing/lease execution without creating a separate personal-deal copy. | Opportunity / Transaction | DISCOVERED |
| AGENT-006 | Agents can see expected commission, split/plan basis, referral obligations, paid/unpaid status and final received commission subject to their permissions. | Transaction / Commission | DISCOVERED |
| AGENT-007 | Agents can download their commission statements/reports and transaction-linked commission records. | Commission / Report | DISCOVERED |
| AGENT-008 | Commission-plan terms are versioned and visible to the applicable agent; agents do not silently edit broker-approved compensation rules. | CompensationPlan | DISCOVERED |
| AGENT-009 | Agents have backend access to the full approved investment-calculator suite without leaving the client/property/deal workflow. | Agent tools / InvestmentAnalysis | DISCOVERED |
| AGENT-010 | Investment calculators include applicable cash flow, cap rate, cash-on-cash return, ROI, rental income/expense scenarios, financing/mortgage scenarios, debt-service metrics where appropriate, carrying-cost analysis and 1031 replacement comparison tools. | InvestmentAnalysis | DISCOVERED |
| AGENT-011 | Calculator inputs distinguish canonical sourced property facts from agent/client assumptions; saved analyses retain both provenance and assumptions. | InvestmentAnalysis / Property Intelligence | DISCOVERED |
| AGENT-012 | Saved calculator analyses attach to the same Party/Opportunity/Property/Deal and may be shared through approved reports without copying a second property record. | InvestmentAnalysis / Report | DISCOVERED |
| AGENT-013 | Agents have contextual AI assistance throughout the backend for search help, property/listing comparison, client-response drafting, follow-up suggestions, CMA explanations, marketing drafts, transaction next-step guidance and approved document/compliance lookup. | AgentAssistant | DISCOVERED |
| AGENT-014 | AI assistance is grounded in the canonical Mallan records and current approved source/reference material available to the workflow; it should identify missing facts instead of inventing them. | AgentAssistant / Tool context | DISCOVERED |
| AGENT-015 | AI may draft/recommend but may not silently change canonical records, send communications, alter agreements, make binding legal/tax conclusions or bypass broker/agent approval and permissions. | AgentAssistant approval gate | DISCOVERED |
| AGENT-016 | AI assistance invoked from Search uses the same canonical Search/Property Intelligence tools and criteria rather than a second AI-only search index. | AgentAssistant → Search | DISCOVERED |
| BROKER-001 | Broker sees the same underlying agent/client/listing/deal records with firm-wide supervisory scope. | Authorization scope | DESIGNED |
| BROKER-002 | Broker view tracks agent listing status, follow-up, production, commissions, compliance and exceptions. | Brokerage control plane | DESIGNED |

---

# C. Documents, forms, disclosures and agreements

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| DOC-001 | One brokerage document library holds approved forms/templates rather than agent-created copies scattered across the system. | DocumentTemplate | DISCOVERED |
| DOC-002 | Library supports buyer, seller, landlord and tenant representation/exclusive agreements. | DocumentTemplate / AgreementType | DISCOVERED |
| DOC-003 | Library supports required/approved disclosures and transaction forms by workflow/property type. | DocumentTemplate / DisclosureType | DISCOVERED |
| DOC-004 | Library supports offering plans and related building/property documents where Mallan is authorized to retain/share them. | PropertyDocument / BuildingDocument | DISCOVERED |
| DOC-005 | Agents can download approved documents and complete/adjust transaction-specific fields. | DocumentInstance | DISCOVERED |
| DOC-006 | Agents may not silently alter broker/legal-approved template language; changes to controlled legal text require a new approved template/version or authorized broker/legal workflow. | DocumentTemplateVersion | DISCOVERED |
| DOC-007 | Every generated/signed agreement retains template version, parties, property/opportunity, dates and audit trail. | Agreement / DocumentInstance | DISCOVERED |
| DOC-008 | Signed exclusives and representation agreements upload back to the same canonical Party/Opportunity/Listing record. | Agreement / DocumentInstance | DESIGNED |
| DOC-009 | Documents have role-based visibility: Mallan internal, selected participants, or client-shareable. | DocumentPermission | DISCOVERED |

---

# D. Compliance and professional reference center

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| COMP-001 | Backend includes one practical Compliance/Professional Reference Center for agents and broker. | ComplianceKnowledge | DISCOVERED |
| COMP-002 | Reference Center provides current applicable REBNY/RLS/UCBA requirements and links/versions to authoritative sources. | ComplianceSource | DISCOVERED |
| COMP-003 | Reference Center provides current NY Department of State real-estate licensing requirements and authoritative-source references. | ComplianceSource | DISCOVERED |
| COMP-004 | Agent-facing guidance may include Mallan policies, workflow checklists, required forms/disclosures and practical brokerage procedures; technical listing-feed schema/transport mechanics are not an agent responsibility. | ComplianceSource / InternalPolicy | DISCOVERED |
| COMP-005 | Every compliance item stores source, effective date/version, last verified date and applicability; stale static summaries must not masquerade as current law/rules. | ComplianceSourceVersion | DISCOVERED |
| COMP-006 | Transaction/listing workflows link directly to the applicable requirement/forms rather than requiring agents to search a separate knowledge site manually. | Workflow → ComplianceReference | DISCOVERED |
| COMP-007 | Technical listing-data integration and field governance are engineering/data-governance concerns and must use the verified **Cotality API/schema/payload contract** plus applicable REBNY/RLS/UCBA use/display rules; agents consume the resulting brokerage data without dealing with API plumbing. | Cotality source contract / Engineering governance | DISCOVERED |

---

# E. Property, listing and source authority

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| PROP-001 | One physical Building/Property/Unit identity regardless of how many listing episodes or sources exist. | Building / Property / Unit | DESIGNED |
| LIST-001 | Each marketing period is a Listing Episode attached to the canonical Property/Unit. | ListingEpisode | DESIGNED |
| SRC-COT-001 | Cotality is primary listing backbone for Active, In Contract/Signed Contract, Closed, Temp Off Market, Off Market, Expired and applicable history where provided/licensed. | SourceObservation / ListingEpisode | DESIGNED |
| SRC-SE-001 | StreetEasy supplements only missing Active and Signed Contract/In Contract inventory under the approved source-use rules. | SourceObservation | DESIGNED |
| SRC-ACR-001 | ACRIS is closing-price/recorded-evidence fallback when required close price is unavailable from Cotality and the match is verified. | Property/Transaction evidence | DESIGNED |
| SRC-PLU-001 | PLUTO enriches building/lot/property facts; it does not create listing inventory. | Property facts | DESIGNED |
| SRC-DOF-001 | NYC DOF provides applicable assessment/tax/non-primary-residence information with tax year/provenance. | Property financial facts | DESIGNED |
| SRC-DOF-002 | Condo tax treatment and co-op maintenance/building-tax economics remain distinct. | Property financial facts | DESIGNED |
| SRC-DOF-003 | DOF co-op unit surcharge/valuation data is stored as unit-level surcharge/valuation evidence, not mislabeled as a normal condo-style unit tax bill. | Property financial facts | DESIGNED |

---

# F. Agent-added and URL-assisted supplemental inventory

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| EXT-001 | Authorized agents can add a listing/opportunity that is missing from the system for internal brokerage use and permitted client sharing. | ListingEpisode / SourceObservation | DISCOVERED |
| EXT-002 | Agent-added inventory must first resolve Building/Property/Unit and dedupe against Cotality, StreetEasy supplement and existing Mallan/internal episodes. | Identity resolver | DISCOVERED |
| EXT-003 | Agent can paste a listing URL into the backend to begin creation of a supplemental listing record. | URL ingestion workflow | DISCOVERED |
| EXT-004 | URL ingestion uses an approved source adapter/fetch method and extracts only information Mallan is permitted to retrieve/use; unsupported/blocked sources fall back to agent-confirmed manual entry. | Source adapter | DISCOVERED |
| EXT-005 | URL ingestion creates a **draft/source observation**, not an unquestioned canonical/public listing. Agent confirms identity and critical facts before client use. | SupplementalListingDraft | DISCOVERED |
| EXT-006 | Source URL, source ID, observed time, last verified time, source rights/visibility class and disclaimer are retained. | SourceObservation | DISCOVERED |
| EXT-007 | Photos/media are not copied/stored/re-published from an external URL unless Mallan has authority to use them. | Media policy | DISCOVERED |
| EXT-008 | Supplemental listing may be shared with clients only under the source's permitted visibility/use rules; no automatic public-site syndication. | Distribution policy | DISCOVERED |
| EXT-009 | If Cotality later supplies the same listing episode, the existing episode is reconciled/promoted to Cotality authority rather than duplicated. | Identity/source reconciliation | DESIGNED |

### URL-to-client flow

```text
PASTE LISTING URL
  ↓
IDENTIFY SOURCE / FETCH PERMITTED METADATA
  ↓
NORMALIZE ADDRESS + UNIT
  ↓
RESOLVE CANONICAL PROPERTY
  ↓
DEDUPE AGAINST EXISTING LISTING EPISODES
  ↓
CREATE/ATTACH SOURCE OBSERVATION DRAFT
  ↓
AGENT CONFIRMS MATERIAL FACTS + SHARE RIGHTS
  ↓
CLIENT-SHARE ELIGIBLE LISTING CARD
```

A pasted URL must never mean `URL → blind INSERT → public listing`.

---

# G. Search, save, send and matching

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| SEARCH-001 | One Search/Property Intelligence contract feeds broker, agent, client, CMA, seller report and marketing workflows. | Search / Property Intelligence | DESIGNED |
| SEARCH-002 | Agents can search, select and send listings to canonical client Parties/Opportunities. | ListingSend / Communication | DESIGNED |
| SEARCH-003 | Agents/clients can save listings and saved-search criteria without separate criteria languages. | SearchProfile / ClientListingAction | DESIGNED |
| SEARCH-004 | New matching listings can trigger agent-reviewed or authorized automatic alerts. | Match / Alert workflow | DESIGNED |
| SEARCH-005 | Search supports reverse matching: a listing finds eligible/matching clients/prospects. | Match engine | DESIGNED |
| SEARCH-006 | Every backend search result can launch permitted actions such as send, save, compare, show, CMA, share and marketing without copying the listing into a second store. | Search action contract | DISCOVERED |

---

# H. Marketing and sharing tied directly to Search/Listing

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| MKT-001 | Marketing actions are available directly from backend Search results and Mallan Listing workspaces. | Campaign / ShareArtifact | DISCOVERED |
| MKT-002 | Selected listing(s) can generate an approved HTML-email campaign/send. | Campaign / EmailArtifact | DISCOVERED |
| MKT-003 | Selected listing(s) can generate a permission-aware share link/page. | ShareArtifact | DISCOVERED |
| MKT-004 | Selected listing(s) can generate social-media-ready share content/assets where source/advertising rights permit. | ShareArtifact / SocialAsset | DISCOVERED |
| MKT-005 | Marketing/share artifacts reference canonical Listing/Property data instead of storing a second editable price/status truth. | ShareArtifact reference | DISCOVERED |
| MKT-006 | A live share page/card must display the current canonical price/status/media allowed for that audience when reopened/refreshed. | Live ShareArtifact renderer | DISCOVERED |
| MKT-007 | When a canonical price/status changes, reusable live share assets are invalidated/re-rendered from the new canonical state rather than manually edited in multiple places. | Listing event → ShareArtifact refresh | DISCOVERED |
| MKT-008 | Sent HTML email is an auditable snapshot of what was sent, plus a link to the current live listing/share page. The system must not falsely claim already-delivered email body text can always change after delivery. | CampaignRecipient / MessageSnapshot | DISCOVERED |
| MKT-009 | Published social posts are audited snapshots; Mallan controls the linked live share page, while third-party social preview caches may not refresh immediately. | SocialPublication / ShareArtifact | DISCOVERED |
| MKT-010 | Listing price/status/media changes emit one canonical event consumed by Search, saved-client alerts, seller reports and share/marketing refreshes. | ListingChanged event | DISCOVERED |

### Canonical dynamic-share rule

```text
LISTING PRICE/STATUS/MEDIA CHANGE
  ↓
CANONICAL LISTING UPDATED ONCE
  ↓
LISTING_CHANGED EVENT
  ├── SEARCH RESULT REFRESH
  ├── CLIENT ALERT/MATCH EVALUATION
  ├── SELLER REPORT UPDATE
  └── LIVE SHARE/CARD INVALIDATION + RE-RENDER
```

Do not maintain separate editable prices in email cards, social cards, client cards and search cards.

---

# I. Seller/Landlord listing, marketing and reporting

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| SELL-001 | Seller/Landlord side supports one or more Individual(s), Entity or both through authorized representatives. | Opportunity participants | DESIGNED |
| SELL-002 | Signed exclusive agreement uploads to brokerage record and drives listing workflow. | Agreement / Listing | DESIGNED |
| SELL-003 | Listing includes price/rent, condo common charges/taxes or co-op maintenance as applicable, plus approved photos/floorplan/3D/video. | Listing / Property facts / Media | DESIGNED |
| SELL-004 | Listing workspace launches agent e-blast, matched-client e-blast, prior-viewer follow-up and open-house marketing. | Listing → Campaign | DESIGNED |
| SELL-005 | Open-house attendance count, attendee identities, feedback and follow-up feed the seller report. | OpenHouse / Showing / Report | DESIGNED |
| SELL-006 | Private-showing attendance/feedback/follow-up feeds seller report. | Showing / Report | DESIGNED |
| SELL-007 | Seller report compares subject against relevant building/area Active, In Contract, Closed, Off Market/Temp Off Market and Expired context as applicable. | SellerReport / Search | DESIGNED |
| SELL-008 | Potential-seller/landlord workflow uses property intelligence, sale/rent analysis and subtle situation-aware outreach without unnecessarily exposing sensitive trigger data. | Seller/Landlord Opportunity | DESIGNED |

---

# J. Buyer/Tenant/Investor journeys

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| BUY-001 | Active Buyer/Tenant opportunity supports multiple Individual(s), Entity, guarantors and invited future signatories/participants. | Opportunity participants | DESIGNED |
| BUY-002 | Representation/exclusive agreement can be sent, signed and retained from the same opportunity. | Agreement | DESIGNED |
| BUY-003 | Client receives/saves listings and can respond Show / Maybe / Pass / No Response. | ClientListingAction | DESIGNED |
| BUY-004 | Showing → offer/application → contract/lease uses the same client/opportunity records. | Showing / Offer / Transaction | DESIGNED |
| INV-001 | Investor search can show verified rental/expense metrics and calculated ROI/cash-on-cash/cap-rate outputs with assumptions. | InvestmentAnalysis | DESIGNED |
| INV-002 | 1031 replacement criteria reuse SearchProfile/Property Intelligence rather than a separate inventory system. | 1031Case / SearchProfile | DESIGNED |

---

# K. Offers, deals, transactions and commissions

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| TXN-001 | Offer creates/activates transaction participant workflow and attorney capture. | Offer / Transaction | DESIGNED |
| TXN-002 | Financed sale includes mortgage application/appraisal/commitment/approval steps. | Transaction workflow | DESIGNED |
| TXN-003 | All-cash sale bypasses mortgage workflow. | Transaction workflow | DESIGNED |
| TXN-004 | Co-op transaction supports application/board package, review, interview, approval, walkthrough and closing. | Transaction workflow | DESIGNED |
| TXN-005 | Condo transaction supports applicable managing-agent/application/waiver process, walkthrough and closing. | Transaction workflow | DESIGNED |
| COMMISSION-001 | Commission derives from canonical Transaction/closing truth; no independent manually maintained deal copy is authoritative. | Commission / Transaction | DESIGNED |
| COMMISSION-002 | Agent can view deal-level expected/earned/paid commission and applicable split/referral details. | Commission | DISCOVERED |
| COMMISSION-003 | Broker has supervisory/adjustment authority and immutable history for approved commission changes. | CommissionAdjustment / Audit | DISCOVERED |

---

# L. Communications

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| COMM-001 | Portal/system comments and email are communication channels of one canonical history. | Communication / Thread | DESIGNED |
| COMM-002 | Individual(s), Entities and permitted participants may ask questions, comment or request more information through their selected supported channel. | Communication / Permission | DESIGNED |
| COMM-003 | Communication attaches to correct Party + Opportunity + Property/Listing + Showing/Offer/Transaction context. | CommunicationContext | DESIGNED |
| COMM-004 | Visibility supports Shared/client-visible, Participant-restricted and Mallan-internal. | CommunicationPermission | DESIGNED |

---

# M. Post-lease and post-close lifecycle

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| LIFE-001 | Tenant lease expiration triggers approximately 6-month buyer/sale option outreach, 90-day follow-up and 60-day rental/relocation action when appropriate. | Lease / Workflow | DESIGNED |
| LIFE-002 | Mallan landlord lease expiration triggers approximately 6-month sale comps, 90-day reminder and 60-day renewal/relist workflow. | Lease / Workflow | DESIGNED |
| LIFE-003 | Closing converts/updates relationship state for owner/past-client/landlord/investor/referral follow-up without duplicating the Party. | Relationship / Workflow | DESIGNED |

---

# N. Cross-system Definition of Done

Every requirement implemented from this ledger must prove:

1. the canonical identity/entity is reused;
2. the authoritative source is respected;
3. duplicates/parallel systems are not created;
4. the correct permission/compliance rules are applied;
5. the state transition is persisted;
6. the correct downstream workflow consumes it;
7. communication/audit evidence exists where applicable;
8. error/failure state is visible and recoverable;
9. end-to-end acceptance passes;
10. production evidence exists before claiming production readiness.

Examples:

- Agent Profile is not complete if agents edit a separate profile database that the public/CRM views do not consume.
- Commission tracking is not complete if the agent dashboard and brokerage ledger disagree.
- Agreement library is not complete if agents can create uncontrolled template variants.
- Search marketing is not complete if email/share/social cards carry copied prices that drift from the canonical listing.
- URL listing entry is not complete if it can create a second version of an existing Cotality/Mallan listing.
- Compliance reference is not complete if its source/effective date cannot be verified.
- AI assistance is not complete if it creates a separate AI-only client/search/property truth or can act without the required human/broker approval.
- Investment tools are not complete if their outputs cannot be traced to canonical facts plus explicit assumptions.

---

# O. Mandatory next consolidation pass

Before broad schema/feature work, perform a read-only repository-wide reconciliation:

1. inventory every master plan, audit, spec, hold file, workflow document and active issue/PR relevant to the brokerage system;
2. extract every still-valid requirement;
3. map it to an existing ID here or create a new stable ID;
4. identify conflicts/duplicates between requirements;
5. map every requirement to actual current models/tables/routes/services;
6. identify competing identity systems and duplicate stores;
7. mark each requirement DISCOVERED/DESIGNED/BUILDING/WIRED/PROVEN/RETIRED with evidence;
8. produce an execution dependency graph from the ledger;
9. do not create another overall plan.

The implementation sequence after consolidation remains dependency-driven:

```text
CANONICAL IDENTITY + SOURCE AUTHORITY
  ↓
PROPERTY INTELLIGENCE / SEARCH
  ↓
COMPS / CMA
  ↓
PARTY / RELATIONSHIP / AGENT WORKSPACE
  ↓
CLIENT SAVE/SEND/ALERT + LISTING-TO-CLIENT MATCH
  ↓
LISTING WORKSPACE + DOCUMENTS
  ↓
MARKETING / SHARE ARTIFACTS / OPEN HOUSES / SHOWINGS
  ↓
LEADS / FOLLOW-UP / SELLER REPORT
  ↓
OFFER / TRANSACTION / ATTORNEYS / FINANCING / BOARD
  ↓
COMMISSION / FINANCE
  ↓
POST-CLOSE / POST-LEASE LIFECYCLE
```
