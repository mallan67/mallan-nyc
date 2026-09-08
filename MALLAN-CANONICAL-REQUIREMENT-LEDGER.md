# MALLAN CANONICAL REQUIREMENT LEDGER

> **Stable requirement/proof index subordinate to `MALLAN-PLATFORM-MASTER-PLAN.md`.**
>
> This is not a second master plan. The Master defines Mallan architecture and business rules. This ledger gives durable requirements stable IDs, canonical owners and proof states so implementation cannot silently drop them when prose, branches or UI are reorganized.

## Governance

1. The Master wins on product/business/system architecture.
2. This ledger preserves stable IDs and implementation/proof status; it does not independently expand scope.
3. A requirement is `PROVEN` only when the applicable end-to-end business effect is demonstrated, not because a UI, route, table or test exists.
4. No requirement may create a parallel Party, Property, Listing, Search, Client, Deal, Commission, Document, Communication, Marketing or workflow truth without an explicit migration/retirement decision.
5. New source observations attach to existing canonical identities whenever they describe the same real-world Party/Property/Listing Episode.
6. Derived cards, reports, campaigns, portals and dashboards reference canonical records rather than copy editable business truth into new stores.
7. Historical audits/specs/chats are evidence only. Newly proven requirements are reconciled into the Master first, then indexed here if a stable implementation ID is useful.
8. Absence from this ledger never overrides a requirement that exists in the Master.

## Status vocabulary

`DISCOVERED → DESIGNED → BUILDING → WIRED → PROVEN → RETIRED`

Use `BLOCKED` only with a named blocker and owner. Current implementation status belongs in `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`; this ledger records durable proof state only when useful.

---

# A. Canonical identity and relationships

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| PARTY-001 | One canonical identity for every Individual. | Party / Individual | DESIGNED |
| PARTY-002 | Business-facing flows support multiple sellers, buyers, tenants or landlords on one Opportunity/Accepted Deal without duplicate people. | Party / Opportunity participant | DESIGNED |
| PARTY-003 | One canonical Entity identity with types including LLC, LLP, Corporation, Partnership, Trust, Estate and Other. | Party / Entity | DESIGNED |
| PARTY-004 | Seller, Buyer, Tenant, Landlord, Investor, Owner, Guarantor, Trustee, Executor, Authorized Signatory and similar business roles are relationships/context, not duplicate identities. | PartyRole / Relationship | DESIGNED |
| PARTY-005 | One Individual or Entity may hold multiple roles over time or simultaneously. | PartyRole | DESIGNED |
| PARTY-006 | Entity relationships support trustee/co-trustee, executor, member, manager, partner, officer and authorized signatory as applicable. | PartyRelationship | DESIGNED |
| CONTACT-001 | Individuals and Entities may have multiple email addresses, phones and mailing addresses. | ContactMethod | DESIGNED |
| CONTACT-002 | Preferred communication channel is stored once and reused across listings, deals and portals. | CommunicationPreference | DESIGNED |
| CONTACT-003 | Contact eligibility/consent/suppression state is centrally enforced rather than copied into campaign-specific lists. | Consent / Suppression | DESIGNED |
| PRO-001 | Attorneys/law firms are reusable canonical professional Parties/Organizations. | Party / Organization | DESIGNED |
| PRO-002 | Lenders, mortgage professionals, managing agents and similar professionals are reusable canonical records. | Party / Organization | DESIGNED |
| PRO-003 | Attorney/professional contact information is requested/confirmed when the applicable accepted-deal workflow requires it. | Accepted Deal participant workflow | DESIGNED |
| REL-001 | Active and past clients may carry one explicit relationship plan/next business horizon without a separate nurture database. | Party / Opportunity / Task | DESIGNED |
| REL-002 | Active business has a responsible person, current state, last meaningful activity and next action/review or explicit no-action state. | Opportunity / Task / Workflow | DESIGNED |

---

# B. Agent and brokerage workspace

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| AGENT-001 | Agents can update approved backend profile fields such as photo, public bio, contact information, languages and specialties. | AgentProfile | DISCOVERED |
| AGENT-002 | Regulated/governed license, status, office/broker affiliation and supervisory fields require the appropriate source/Broker authority. | AgentCredential / Broker supervision | DISCOVERED |
| AGENT-003 | Governed Agent-profile changes retain audit history and approval/override where required. | AuditEvent / AgentProfile | DISCOVERED |
| AGENT-004 | Each Agent has My Business over the same canonical Leads, clients, searches, listings, showings, deals, tasks and commissions used by Brokerage View. | Agent workspace projection | DESIGNED |
| AGENT-005 | Agents track brokerage deals through accepted-deal progression without creating a separate personal-deal copy. | Opportunity / Accepted Deal | DISCOVERED |
| AGENT-006 | Agents can see expected commission, plan/split basis, referral obligations, received/paid state and final payout subject to permissions. | Commission | DISCOVERED |
| AGENT-007 | Agents can access their own commission statements/reports and transaction-linked commission records. | Commission / Report | DISCOVERED |
| AGENT-008 | Commission-plan terms are versioned and not silently editable by Agents. | CompensationPlan | DISCOVERED |
| AGENT-009 | Agents have contextual access to the approved investment/calculator suite. | Agent tools / Decision Scenario | DISCOVERED |
| AGENT-010 | Investment tools support applicable cash flow, cap rate, cash-on-cash, ROI, financing, carrying-cost and 1031 comparisons. | Decision Scenario | DISCOVERED |
| AGENT-011 | Calculator inputs distinguish canonical sourced facts from Agent/client assumptions. | Decision Scenario / Property Intelligence | DISCOVERED |
| AGENT-012 | Saved analyses attach to the same Party/Opportunity/Property/Accepted Deal. | Decision Scenario / Report | DISCOVERED |
| AGENT-013 | Agents have contextual AI assistance for Search, comparison, drafting, CMA explanation, marketing, follow-up, deal guidance and approved reference lookup. | AgentAssistant | DISCOVERED |
| AGENT-014 | AI is grounded in canonical Mallan records/current approved sources and identifies missing facts instead of inventing them. | AgentAssistant / Tool context | DISCOVERED |
| AGENT-015 | AI may draft/recommend but may not silently mutate canonical records, send/publish, alter agreements, make binding legal/tax conclusions or bypass permissions/approval. | AgentAssistant approval gate | DISCOVERED |
| AGENT-016 | AI invoked from Search uses the canonical Search/Property Intelligence system rather than a second AI-only Search. | AgentAssistant → Search | DISCOVERED |
| BROKER-001 | Broker sees the same underlying Agent/client/listing/deal records with firm-wide supervisory scope. | Authorization scope | DESIGNED |
| BROKER-002 | Brokerage View surfaces business-useful pipeline, money, compliance and exception information over those records. | Brokerage control plane | DESIGNED |
| TAX-001 | Agent W-9/tax-payee record → actual Agent payments → tax-year total → applicable 1099 record → delivery/access/correction history uses one payment truth. | Agent / Payment / Tax administration | DESIGNED |

---

# C. Documents, forms, disclosures and agreements

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| DOC-001 | One governed brokerage document/form catalog holds approved templates, uploaded forms and authoritative links. | DocumentTemplate / Form catalog | DISCOVERED |
| DOC-002 | Catalog supports Buyer, Seller, Landlord and Tenant representation/listing agreements. | DocumentTemplate / AgreementType | DISCOVERED |
| DOC-003 | Catalog supports applicable agency, anti-discrimination/Fair Housing and transaction/property disclosures/forms. | DocumentTemplate / DisclosureType | DISCOVERED |
| DOC-004 | Catalog supports Offering Plans and related Building/Property documents where Mallan is authorized to retain/share them. | PropertyDocument / BuildingDocument | DISCOVERED |
| DOC-005 | Agents can use approved documents and complete transaction-specific fields within governed controls. | DocumentInstance | DISCOVERED |
| DOC-006 | Controlled legal/template language cannot be silently altered; changes require an approved version/workflow. | DocumentTemplateVersion | DISCOVERED |
| DOC-007 | Generated/signed agreements retain template/version, parties, context, dates and audit trail. | Agreement / DocumentInstance | DISCOVERED |
| DOC-008 | Signed representation/exclusive documents attach back to the same canonical Party/Opportunity/Property/Listing context. | Agreement / DocumentInstance | DESIGNED |
| DOC-009 | Documents have role-based visibility: internal, participant-restricted or client-shareable. | DocumentPermission | DISCOVERED |
| DOC-010 | Broker-authorized catalog administration can add/replace/supersede forms/links and set applicability without rewriting historical delivered/executed records. | Form catalog administration | DESIGNED |

---

# D. Compliance, provider and publication authority

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| COMP-001 | Backend includes one practical Compliance/Professional Reference Center for Agents and Broker. | ComplianceKnowledge | DISCOVERED |
| COMP-002 | Reference Center provides current applicable REBNY/RLS/UCBA requirements with authoritative references/versioning. | ComplianceSource | DISCOVERED |
| COMP-003 | Reference Center provides current NY Department of State licensing/advertising requirements and authoritative references. | ComplianceSource | DISCOVERED |
| COMP-004 | Agent-facing guidance includes applicable Mallan policy, checklists and forms; provider API plumbing remains an engineering/data-governance concern. | ComplianceSource / InternalPolicy | DISCOVERED |
| COMP-005 | Compliance entries retain source, effective/version date, last verification and applicability. | ComplianceSourceVersion | DISCOVERED |
| COMP-006 | Workflows link to applicable requirements/forms rather than requiring manual discovery. | Workflow → ComplianceReference | DISCOVERED |
| COMP-007 | Cotality field/data integration uses the verified Cotality provider contract plus separately applicable REBNY/RLS/UCBA use/display rules. | Provider contract / Engineering governance | DISCOVERED |
| GOV-001 | Cotality/Trestle provider authority, REBNY/RLS/UCBA business rules, law/DOS/Fair Housing, Mallan-authored truth and supplemental-source rights remain separate authority layers. | Rule/source registry | DESIGNED |
| GOV-002 | Legacy external operating/listing platforms are historical evidence only unless explicitly added to current Mallan architecture. | Architecture governance | DESIGNED |
| WEB-001 | Public listing/content publication passes authority, display, attribution, media, privacy/Fair-Housing/advertising and contextual-eligibility gates before rendering. | Public publication contract | DESIGNED |
| WEB-002 | Buyer/Seller/Landlord/Tenant/Investor/New-Development public inquiry paths create durable Lead → Party → Opportunity context instead of email-only/generic-contact loss. | Lead / Public inquiry | DESIGNED |

---

# E. Property, listing and source authority

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| PROP-001 | One physical Building/Property/Unit identity exists regardless of listing episodes or sources. | Building / Property / Unit | DESIGNED |
| PROP-002 | Reusable verified Building/Property knowledge compounds on canonical identity; client-confidential judgments remain scoped to Party/Opportunity. | Property / Building Intelligence | DESIGNED |
| LIST-001 | Each marketing period is a Listing Episode attached to the canonical Property/Unit. | ListingEpisode | DESIGNED |
| SRC-COT-001 | Cotality is the primary provider listing backbone where current entitlement supplies/licences the required facts. | SourceObservation / ListingEpisode | DESIGNED |
| SRC-SE-001 | StreetEasy may supplement missing sale/opportunity research only under verified source-use rights; scraping/extraction is never assumed. | SourceObservation | DESIGNED |
| SRC-ACR-001 | ACRIS may provide verified recorded closing/ownership evidence where needed and correctly reconciled. | Property/Transaction evidence | DESIGNED |
| SRC-PLU-001 | PLUTO/authorized NYC lot/building evidence may enrich property facts; it does not create listing inventory. | Property facts | DESIGNED |
| SRC-DOF-001 | NYC DOF evidence may supply applicable assessment/tax facts with tax year/provenance. | Property financial facts | DESIGNED |
| SRC-DOF-002 | Condo tax treatment and co-op maintenance/building-tax economics remain distinct. | Property financial facts | DESIGNED |
| SRC-DOF-003 | Co-op unit surcharge/valuation evidence is not mislabeled as a condo-style unit tax bill. | Property financial facts | DESIGNED |

---

# F. Agent-added and supplemental inventory

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| EXT-001 | Authorized Agents can add a missing opportunity for internal brokerage use/permitted client sharing. | ListingEpisode / SourceObservation | DISCOVERED |
| EXT-002 | Supplemental inventory resolves Building/Property/Unit and dedupes against current canonical/source observations before creating a separate result. | Identity resolver | DISCOVERED |
| EXT-003 | An Agent may paste a source URL to begin a governed supplemental draft when that source/use is permitted. | URL/source intake workflow | DISCOVERED |
| EXT-004 | Source intake uses an approved adapter/fetch method and only permitted facts; blocked/unsupported sources require Agent-confirmed manual entry. | Source adapter | DISCOVERED |
| EXT-005 | Source intake creates a draft/source observation, not an unquestioned canonical/public listing. | SupplementalListingDraft | DISCOVERED |
| EXT-006 | Source URL/ID, observed time, last verification, rights/visibility and disclaimer are retained. | SourceObservation | DISCOVERED |
| EXT-007 | External media is not copied/stored/re-published without use authority. | Media policy | DISCOVERED |
| EXT-008 | Supplemental records are shared only under their permitted visibility/use rules; no automatic public publication. | Distribution policy | DISCOVERED |
| EXT-009 | If Cotality later supplies the same episode, reconcile to the existing canonical identity rather than duplicate it. | Identity/source reconciliation | DESIGNED |

---

# G. Search, save, send and matching

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| SEARCH-001 | One Search/Property Intelligence contract feeds Broker, Agent, client, CMA, reporting and marketing workflows. | Search / Property Intelligence | DESIGNED |
| SEARCH-002 | Agents can Search/select/send listings to canonical client Parties/Opportunities. | ListingSend / Communication | DESIGNED |
| SEARCH-003 | Agents/clients can save listings and Saved Search criteria without separate criteria languages. | Saved Search / Client Listing Action | DESIGNED |
| SEARCH-004 | New/materially changed matching listings can trigger Agent-reviewed or authorized alerts. | Match / Alert workflow | DESIGNED |
| SEARCH-005 | Search supports reverse matching: a listing finds eligible/matching client Saved Searches. | Match engine | DESIGNED |
| SEARCH-006 | Backend results can launch permitted send/save/compare/show/CMA/share/marketing actions without copying listing truth. | Search action contract | DISCOVERED |
| SEARCH-007 | Count, sort, pagination, Map, Compare, Reports, CMA and matching describe the same authoritative final result universe. | Search result-universe contract | DESIGNED |
| SEARCH-008 | Difficult supported professional criteria are corrected or explicitly refused; they are never silently deleted/ignored. | Criteria registry/executor | DESIGNED |

---

# H. Marketing and sharing tied to canonical Listing/Search

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| MKT-001 | Marketing actions are available from backend Search results and Mallan Listing workspaces. | Campaign / ShareArtifact | DISCOVERED |
| MKT-002 | Selected listing(s) can generate an approved HTML-email campaign/send. | Campaign / EmailArtifact | DISCOVERED |
| MKT-003 | Selected listing(s) can generate a permission-aware share link/page. | ShareArtifact | DISCOVERED |
| MKT-004 | Selected listing(s) can generate social-ready content/assets where rights permit. | ShareArtifact / SocialAsset | DISCOVERED |
| MKT-005 | Marketing/share artifacts reference canonical Listing/Property data instead of storing a second editable price/status truth. | ShareArtifact reference | DISCOVERED |
| MKT-006 | Live share pages/cards render current canonical truth allowed for that audience. | Live ShareArtifact renderer | DISCOVERED |
| MKT-007 | Canonical price/status/media changes invalidate/re-render reusable live artifacts rather than requiring copied manual edits. | Listing event → Share refresh | DISCOVERED |
| MKT-008 | Sent email is an auditable snapshot plus, where applicable, a link to current live content. | CampaignRecipient / MessageSnapshot | DISCOVERED |
| MKT-009 | Published third-party social content is an audited snapshot; Mallan controls only its own linked live content. | SocialPublication / ShareArtifact | DISCOVERED |
| MKT-010 | One canonical material Listing-change event feeds Search refresh, alerts/matching, reporting and marketing/share refresh. | ListingChanged event | DISCOVERED |

---

# I. Seller/Landlord listing, marketing and reporting

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| SELL-001 | Seller/Landlord side supports one or more Individuals, an Entity or both through authorized participants. | Opportunity participants | DESIGNED |
| SELL-002 | Signed representation/exclusive agreement attaches to the brokerage record and governs listing workflow. | Agreement / Listing | DESIGNED |
| SELL-003 | Listing uses canonical price/rent, applicable charges/taxes/maintenance and approved Media. | Listing / Property / Media | DESIGNED |
| SELL-004 | Listing workspace launches permitted E-blast, matching, prior-viewer and Open House marketing. | Listing → Campaign | DESIGNED |
| SELL-005 | Open House attendance/identity/feedback/follow-up feeds Seller/Landlord reporting. | OpenHouse / Report | DESIGNED |
| SELL-006 | Private-showing attendance/feedback/follow-up feeds reporting. | Showing / Report | DESIGNED |
| SELL-007 | Reporting compares the subject with relevant current/closed/market-resistance context from authoritative Search/CMA. | ListingReport / Search | DESIGNED |
| SELL-008 | Potential Seller/Landlord workflow uses property intelligence/decision support without unnecessarily exposing sensitive trigger data. | Seller/Landlord Opportunity | DESIGNED |

---

# J. Buyer/Tenant/Investor journeys

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| BUY-001 | Buyer/Tenant Opportunity supports multiple Individuals, Entity, guarantors and authorized participants. | Opportunity participants | DESIGNED |
| BUY-002 | Representation agreement can be delivered/signed/retained from the same Opportunity. | Agreement | DESIGNED |
| BUY-003 | Client receives/saves listings and can express interest/pass/comment/showing intent in canonical Client × Listing history. | ClientListingAction | DESIGNED |
| BUY-004 | Showing → Offer/Application → Accepted Deal uses the same Party/Opportunity/Property records. | Showing / Offer / Accepted Deal | DESIGNED |
| INV-001 | Investor analysis can show verified rental/expense metrics and deterministic ROI/cash-on-cash/cap outputs with explicit assumptions. | Decision Scenario | DESIGNED |
| INV-002 | 1031 replacement criteria reuse Search/Property Intelligence rather than a separate inventory system. | Investor/1031 Opportunity / Saved Search | DESIGNED |

---

# K. Offers, accepted deals and commissions

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| TXN-001 | Accepted offer/application activates the applicable accepted-deal progression and professional-contact workflow. | Offer/Application / Accepted Deal | DESIGNED |
| TXN-002 | Financed sale can track mortgage application/appraisal/commitment/approval indicators. | Accepted Deal progression | DESIGNED |
| TXN-003 | All-cash sale bypasses financing stages that do not apply. | Accepted Deal progression | DESIGNED |
| TXN-004 | Co-op deal supports applicable application/board/interview/approval/walkthrough/closing progression. | Accepted Deal progression | DESIGNED |
| TXN-005 | Condo deal supports applicable managing-agent/application/waiver/walkthrough/closing progression. | Accepted Deal progression | DESIGNED |
| COMMISSION-001 | Commission derives from canonical Accepted Deal/closing/contractual truth; no independent manually maintained deal copy is authoritative. | Commission / Accepted Deal | DESIGNED |
| COMMISSION-002 | Agent can view applicable expected/earned/received/paid commission and split/referral details. | Commission | DISCOVERED |
| COMMISSION-003 | Broker-approved commission adjustments retain immutable history. | CommissionAdjustment / Audit | DISCOVERED |
| MONEY-001 | Mallan's deal system tracks brokerage payment readiness/commission closeout and does not represent Mallan as holder of client escrow, deposits or proceeds. | Accepted Deal / Commission | DESIGNED |

---

# L. Communications

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| COMM-001 | Portal/system comments and approved email/messages are channels of one canonical communication history. | Communication / Thread | DESIGNED |
| COMM-002 | Permitted participants can ask questions/comment/request information through supported channels. | Communication / Permission | DESIGNED |
| COMM-003 | Communication attaches to the correct Party + Opportunity + Property/Listing + Showing/Offer/Accepted Deal context. | CommunicationContext | DESIGNED |
| COMM-004 | Visibility supports Client shared, Participant restricted, Brokerage internal and sensitive/legal-restricted contexts. | CommunicationPermission | DESIGNED |

---

# M. Lead, post-lease and post-close lifecycle

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| LEAD-001 | Every meaningful public/Agent/Brokerage inquiry creates durable CRM Lead/activity history; email delivery alone is not the system of record. | Lead / Inquiry | DESIGNED |
| LEAD-002 | Lead flow resolves identity, checks existing Agent relationship, records ownership/assignment, first contact, qualification, Opportunity and conversion/nurture/lost history. | Lead / Party / Opportunity | DESIGNED |
| LEAD-003 | Reassignment preserves original/new Agent, reason, timestamp and full prior relationship/history. | Lead / Opportunity assignment history | DESIGNED |
| LIFE-001 | Tenant lease expiration begins an approximately six-month decision review that may lead to renew, relocate or Buyer Opportunity, with response-driven follow-up. | Lease / Tenant Opportunity | DESIGNED |
| LIFE-002 | Landlord lease expiration begins an approximately six-month owner review that may lead to renew, re-rent, sell, hold, reinvest or another investment purchase, with response-driven follow-up. | Lease / Landlord Opportunity | DESIGNED |
| LIFE-003 | Closing/rented completion updates the relationship for Owner/Past Client/Landlord/Investor/referral follow-up without duplicating the Party. | Relationship / Workflow | DESIGNED |
| LIFE-004 | Practical 90/60/30-day lease follow-up stages are driven by actual client response and never blind spam. | Task / Relationship plan | DESIGNED |

---

# N. Reliability and cross-system Definition of Done

| ID | Requirement | Canonical owner | Status |
|---|---|---|---|
| RELIAB-001 | Critical canonical state changes and downstream business effects are durable/idempotent so retry cannot silently create a second Lead, payment, send or contradictory state. | Command / Event / Workflow boundary | DESIGNED |
| RELIAB-002 | Business reliability is measured at user/business outcomes, including durable Lead creation, form round-trip, truthful Search universe/count, timely lease review, truthful delivery and recoverable downstream failure. | Operations / SLO evidence | DESIGNED |
| RENDER-001 | A UI component renders only after canonical record type, business/property context, audience, business rule and compliance/rights eligibility are proven. | Product rendering contract | DESIGNED |

Every implemented requirement must prove, as applicable:

1. canonical identity is reused;
2. source authority is correct;
3. duplicates/parallel truths are not created;
4. permission/privacy/compliance is applied before use/display;
5. required state persists and round-trips;
6. downstream consumers use the same truth;
7. communication/audit evidence exists where applicable;
8. failure/unknown is visible and recoverable;
9. direct/negative/integration/downstream acceptance passes;
10. Preview and authorized Production proof exist before corresponding claims;
11. active business has a responsible person and explicit next-action/review/closed state;
12. retry/recovery cannot silently duplicate or lose a critical business effect.

The implementation dependency order is governed by Master §25. Do **not** perform another global requirements consolidation or create another overall plan merely because this ledger changes.