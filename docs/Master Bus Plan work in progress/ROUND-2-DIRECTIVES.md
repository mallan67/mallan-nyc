# ROUND 2 DIRECTIVES — verbatim as issued by Maya, 2026-09-07

These are additive to the existing Master Plan AND to the prior business-completeness additions
(round 1). The integration base for these is the already-integrated plan, not the original #595 extract.

Two directives follow, separated by a horizontal rule and a DIRECTIVE B marker.

---

# DIRECTIVE A — PR #595 — ADDITIONAL MANDATORY BUSINESS REQUIREMENTS

These requirements are additive to the existing Master Plan and the prior business-completeness additions.

Do not rewrite or replace existing sections.

---

## ADD TO §17 — AGENT SUPPORT / PROFESSIONAL OBLIGATIONS / MY PROFILE

### Agent Tax / 1099 Records

Agent financial administration must include annual tax-document support.

Mallan's Agent lifecycle must retain the Agent's tax-document relationship with the Brokerage, including:

```text
AGENT
↓
W-9 / CURRENT TAX IDENTITY RECORD
↓
COMMISSION / REFERRAL PAYMENTS DURING TAX YEAR
↓
ANNUAL TAX REPORTING RECORD
↓
1099 / APPLICABLE CURRENT IRS CONTRACTOR TAX FORM
↓
DELIVERY / ACCESS
↓
CORRECTION / REPLACEMENT HISTORY IF REQUIRED
```

The exact IRS form, reporting threshold, deadlines and tax treatment must use the then-current authoritative tax rules rather than being permanently hard-coded from the Master Plan.

Mallan should support, as applicable:

* current W-9 on file;
* tax year;
* Agent legal/tax identity required for reporting;
* annual amount paid according to canonical payment records;
* applicable 1099 form record;
* issued/generated date;
* delivery/access status;
* corrected/replacement version;
* historical annual forms;
* accountant/export support;
* Agent access to the Agent's own tax forms;
* Brokerage access to all applicable Agent tax records.

### Tax truth must come from payment truth

Do not create an independent tax-payment total.

```text
CANONICAL COMMISSION / REFERRAL PAYMENT RECORDS
↓
TAX-YEAR PAYMENT TOTAL
↓
1099 / TAX REPORTING
```

Tax reporting must reconcile to actual recorded brokerage payments.

A manually entered 1099 total may not become a second payment truth.

---

# ADD TO §19 — LEADS / PERFORMANCE / MONEY / COMMISSIONS / REFERRALS

## Lead Generation is a first-class brokerage capability

Mallan must support not only Lead intake but **Lead generation**.

Lead generation can originate from:

```text
MALLAN PUBLIC WEBSITE
LISTING PAGES
CONSUMER SEARCH
PROPERTY INFORMATION REQUESTS
SHOWING REQUESTS
OPEN HOUSES
MARKETING CAMPAIGNS
E-BLASTS
MARKET REPORTS
SELLER / LANDLORD PROSPECTING
BUYER / TENANT CAMPAIGNS
PAST CLIENTS
REFERRALS
AGENT PERSONAL BUSINESS
BROKERAGE-GENERATED BUSINESS
SOCIAL / DIGITAL MARKETING WHERE APPROVED
INVESTOR / 1031 CAMPAIGNS
OTHER AUTHORIZED SOURCES
```

Every generated Lead must retain its origin.

Example:

```text
LEAD
├── source
├── campaign
├── listing / property
├── Search or content context
├── date/time
├── original inquiry/action
├── assigned Agent
├── existing Party match
└── consent / communication eligibility
```

Marketing cannot report "leads generated" unless a durable Lead/Party activity actually exists.

---

# LEAD DISTRIBUTION

Lead distribution must be a governed brokerage workflow.

Do not create multiple competing lead-assignment systems.

The system must distinguish:

```text
AGENT-OWNED / AGENT-GENERATED LEAD

BROKERAGE-GENERATED LEAD

LISTING-SPECIFIC LEAD

PAST-CLIENT / EXISTING-RELATIONSHIP LEAD

REFERRAL LEAD

UNASSIGNED LEAD
```

Distribution rules must be explicit and configurable rather than inferred or scattered across UI code.

A Lead distribution decision should retain:

```text
LEAD
↓
SOURCE
↓
EXISTING PARTY / RELATIONSHIP CHECK
↓
CURRENT AGENT RELATIONSHIP CHECK
↓
DISTRIBUTION RULE
↓
ASSIGNED AGENT
↓
ASSIGNED DATE/TIME
↓
ACCEPTED / CONTACTED / REASSIGNED
↓
AUDIT HISTORY
```

A Lead may not be duplicated merely because it arrives from another source.

Example:

```text
EXISTING CLIENT
+
NEW WEBSITE INQUIRY
=
NEW ACTIVITY / POSSIBLE NEW OPPORTUNITY
ON EXISTING PARTY

NOT
NEW DUPLICATE CLIENT
```

Brokerage View must be able to see:

* unassigned Leads;
* new Leads;
* uncontacted Leads;
* assigned Agent;
* first-contact status;
* aging Leads;
* follow-up due;
* reassigned Leads;
* converted Leads;
* lost Leads;
* source performance;
* campaign performance.

Agent My Business shows the Agent's own Leads and required actions.

---

# LEAD LIFECYCLE

Strengthen the lifecycle to:

```text
LEAD GENERATED / RECEIVED
↓
IDENTITY RESOLUTION
↓
PARTY
↓
SOURCE + CONTEXT
↓
ASSIGNMENT
↓
FIRST CONTACT
↓
QUALIFICATION
↓
INTENT
├── SELLER
├── LANDLORD
├── BUYER
├── TENANT
├── INVESTOR / 1031
└── FUTURE / UNKNOWN
↓
OPPORTUNITY
↓
CONSULTATION / FOLLOW-UP
↓
REPRESENTATION
↓
ACTIVE CLIENT
↓
ACTIVE BUSINESS WORKFLOW
↓
CONVERTED / CLOSED
OR
NURTURE
OR
LOST
↓
FUTURE RELATIONSHIP
```

Every stage retains:

* last activity;
* Agent;
* next action;
* next follow-up date;
* reason/status;
* opportunity relationship;
* source;
* history.

Do not let a Lead simply disappear because the Agent did not convert it immediately.

---

# ADD TO §13 — LANDLORD OPERATING JOURNEY

## Lease Lifecycle becomes a recurring business engine

A Landlord relationship does not end when the apartment is rented.

Mallan must monitor the lease lifecycle.

Canonical relationship:

```text
LANDLORD PARTY
+
TENANT PARTY
+
PROPERTY / UNIT
+
LEASE / RENTAL DEAL
+
LEASE START
+
LEASE EXPIRATION
```

The Landlord and Tenant remain separate Parties with separate confidential relationships and separate Opportunities.

Do not expose one party's confidential information to the other.

---

## Six-month lease-expiration intelligence

Approximately **6 months before lease expiration**, create a business-intelligence event and Agent task.

This is not automatically a new Listing or Opportunity.

It is a decision point.

### Landlord / Owner side

The Agent should be prompted to contact the owner.

Mallan should prepare useful property and market information using the canonical Property, Search, CMA and calculator foundation.

The owner discussion should be able to include:

```text
CURRENT PROPERTY INFORMATION
CURRENT ESTIMATED MARKET VALUE / CMA CONTEXT
RECENT RELEVANT SALES
CURRENT COMPETING SALE INVENTORY
CURRENT RENTAL MARKET
ESTIMATED CURRENT MARKET RENT
RENTAL COMPETITION
RENTAL HISTORY
KNOWN CURRENT RENT
KNOWN CARRYING COSTS
HOLD-v-SELL ANALYSIS
RE-RENT / RENEW / SELL OPTIONS
```

The purpose is to answer:

```text
DO YOU WANT TO:

RENEW THE CURRENT TENANT?
RE-RENT THE PROPERTY?
SELL THE PROPERTY?
HOLD / REVIEW LATER?
```

If the owner expresses an intention to sell:

```text
LANDLORD PARTY
↓
NEW SELLER OPPORTUNITY
↓
SAME PROPERTY / UNIT
```

Do not create a duplicate owner or duplicate Property.

If re-renting:

```text
LANDLORD
→ NEW / RENEWED LANDLORD OPPORTUNITY
→ NEW RENTAL LISTING EPISODE WHEN AUTHORIZED
```

---

# ADD TO §15 — TENANT OPERATING JOURNEY

## Six-month Tenant decision cycle

Approximately **6 months before lease expiration**, Mallan should also prompt the Agent to contact the Tenant.

The conversation should not assume the Tenant will remain a renter.

Mallan should help the Agent discuss:

```text
RENEW CURRENT LEASE
MOVE TO ANOTHER RENTAL
BUY A HOME
NOT SURE YET
```

### Tenant → Buyer analysis

When appropriate, Mallan should prepare a **Rent vs Buy / Cost to Become an Owner** analysis.

Use the existing deterministic calculator and current verified property/market information.

Possible report content includes, based on known or explicitly entered assumptions:

```text
CURRENT RENT
EXPECTED RENEWAL RENT
ANNUAL RENT COST

TARGET PURCHASE RANGE

ESTIMATED DOWN PAYMENT
ESTIMATED CASH TO CLOSE
ESTIMATED MORTGAGE
ESTIMATED MONTHLY PRINCIPAL / INTEREST
ESTIMATED PROPERTY TAX WHERE APPLICABLE
ESTIMATED MAINTENANCE / COMMON CHARGES
ESTIMATED INSURANCE WHERE APPLICABLE
OTHER EXPLICIT CARRYING-COST ASSUMPTIONS

ESTIMATED MONTHLY OWNERSHIP COST
RENT-v-BUY COMPARISON
POTENTIAL EQUITY / APPRECIATION SCENARIOS
```

Every value must clearly distinguish:

```text
KNOWN FACT
CURRENT VERIFIED RATE / COST
CLIENT-PROVIDED INPUT
SYSTEM CALCULATION
ASSUMPTION
```

Do not present assumptions as guarantees.

### Property recommendations

If the Tenant expresses interest in buying:

```text
EXISTING TENANT PARTY
↓
NEW BUYER OPPORTUNITY
↓
BUYER REQUIREMENTS
↓
SAVED SEARCH
↓
CURRENT MATCHING PROPERTIES
↓
CMA / CALCULATORS / SHOWINGS
```

The Tenant history remains attached to the same Party.

---

# ADD TO §22 — HUMAN, CLIENT, PROPERTY, MARKET & AGENT INTELLIGENCE

## Lease-expiration Intelligence

Lease expiration is an important relationship signal.

At approximately six months before expiration:

```text
LEASE EXPIRATION APPROACHING
↓
LANDLORD DECISION REVIEW
+
TENANT DECISION REVIEW
```

But these are two separate client intelligence paths.

### Landlord Intelligence

Prepare:

```text
PROPERTY VALUE
SALE MARKET
RENTAL MARKET
CURRENT RENT
MARKET RENT
CARRYING COSTS
RENTAL HISTORY
SALE OPPORTUNITY
RENTAL OPPORTUNITY
HOLD-v-SELL CONTEXT
```

Then help the Agent ask:

> Renew, re-rent, sell, or hold?

### Tenant Intelligence

Prepare:

```text
CURRENT RENT
EXPECTED RENEWAL COST
CURRENT RENTAL ALTERNATIVES
BUYING RANGE
RENT-v-BUY
ESTIMATED OWNERSHIP COST
CURRENT MATCHING SALE INVENTORY
```

Then help the Agent ask:

> Renew, rent elsewhere, or consider buying?

---

# FOLLOW-UP SEQUENCE — RESPONSE-DRIVEN, NOT BLIND AUTOMATION

The lease lifecycle should have follow-up checkpoints such as:

```text
6 MONTHS BEFORE EXPIRATION
→ EARLY DECISION / EDUCATION CONVERSATION

90 DAYS
→ DECISION STATUS FOLLOW-UP

60 DAYS
→ ACTIVE PLANNING FOLLOW-UP

30 DAYS
→ EXECUTION / URGENCY FOLLOW-UP
```

These are default business checkpoints.

They are **not mandatory spam intervals**.

The actual next action depends on the client's response.

Example:

```text
6-MONTH CONTACT
↓
LANDLORD SAYS:
"I WILL DEFINITELY RENEW WITH CURRENT TENANT"

→ RECORD RESPONSE
→ DO NOT KEEP SENDING SELLING PROMPTS
→ SET APPROPRIATE RENEWAL FOLLOW-UP
```

Or:

```text
6-MONTH CONTACT
↓
LANDLORD SAYS:
"I MAY SELL — CALL ME IN THREE MONTHS"

→ SELLER-INTEREST SIGNAL
→ FOLLOW-UP AT REQUESTED TIME
→ REFRESH CMA / MARKET INFORMATION BEFORE CALL
```

Or:

```text
TENANT SAYS:
"I WANT TO BUY BUT PROBABLY IN 3 MONTHS"

→ BUYER OPPORTUNITY
→ 90-DAY / AGREED FOLLOW-UP
→ RENT-v-BUY ANALYSIS
→ SAVED SEARCH / MARKET EDUCATION AS APPROPRIATE
```

Or:

```text
TENANT SAYS:
"I AM RENEWING AND NOT INTERESTED IN BUYING"

→ RECORD RESPONSE
→ SUPPRESS INAPPROPRIATE BUYING FOLLOW-UP
→ KEEP LONGER-TERM RELATIONSHIP
```

Therefore:

```text
DEFAULT FOLLOW-UP CADENCE
+
ACTUAL CLIENT RESPONSE
+
AGENT DECISION
=
NEXT FOLLOW-UP
```

Client responses control the workflow.

---

# ADD TO §23 — PRODUCT EXPERIENCE / TASKS / MY BUSINESS

## Lease Lifecycle dashboard

Agent My Business should surface an actionable lease-expiration pipeline such as:

```text
LEASES EXPIRING

6 MONTHS
90 DAYS
60 DAYS
30 DAYS
EXPIRING SOON
RENEWAL IN PROCESS
RE-RENT
POSSIBLE SALE
POSSIBLE BUYER CONVERSION
COMPLETED
```

Each row should identify:

* Property;
* Landlord;
* Tenant;
* lease expiration;
* current rent;
* assigned Agent;
* last contact;
* response;
* next action;
* next follow-up;
* current Opportunity state.

The Agent should not have to remember expiration dates manually.

---

# ADD TO §18 — BROKERAGE VIEW

Brokerage View should expose lease-lifecycle exceptions and opportunities including:

```text
LEASE EXPIRATION APPROACHING
LANDLORD NOT CONTACTED
TENANT NOT CONTACTED
NO RESPONSE
RENEWAL EXPECTED
RE-RENT OPPORTUNITY
POSSIBLE SELLER OPPORTUNITY
POSSIBLE BUYER OPPORTUNITY
FOLLOW-UP OVERDUE
```

The purpose is oversight and business support, not creation of another lease database.

---

# ADD TO §24 — BUSINESS-COMPLETENESS MATRIX

Add explicit rows for:

```text
LEAD GENERATION
LEAD SOURCE
LEAD DISTRIBUTION
LEAD ASSIGNMENT
LEAD REASSIGNMENT
LEAD FOLLOW-UP
LEAD CONVERSION
LEAD NURTURE

AGENT W-9
AGENT 1099 / ANNUAL TAX DOCUMENT
AGENT TAX-YEAR PAYMENT RECONCILIATION

LEASE LIFECYCLE
LEASE EXPIRATION
LANDLORD 6-MONTH REVIEW
TENANT 6-MONTH REVIEW
90-DAY FOLLOW-UP
60-DAY FOLLOW-UP
30-DAY FOLLOW-UP
LANDLORD → SELLER CONVERSION
LANDLORD → RE-RENT
TENANT → BUYER CONVERSION
TENANT → NEW RENTAL
LEASE RENEWAL
RENT-v-BUY REPORT
COST-TO-BECOME-OWNER REPORT
HOLD-v-SELL / RE-RENT ANALYSIS
```

These cannot disappear during implementation.

---

# ADD TO §26 — DEFINITION OF DONE

## Lead Generation / Distribution

Not complete until:

```text
LEAD CREATED
→ SOURCE PRESERVED
→ PARTY DEDUPED / RESOLVED
→ DISTRIBUTED
→ AGENT RECEIVES IT
→ FOLLOW-UP RECORDED
→ OPPORTUNITY CREATED WHEN APPROPRIATE
→ CONVERSION / NURTURE / LOSS PRESERVED
```

works end-to-end.

## Lease Lifecycle

Not complete until a real lease can prove:

```text
LEASE EXPIRATION DATE
→ 6-MONTH ALERT
→ LANDLORD CONTACT / RESPONSE
→ TENANT CONTACT / RESPONSE
→ MARKET / VALUATION / RENT-v-BUY SUPPORT
→ RESPONSE-DRIVEN NEXT FOLLOW-UP
→ 90 / 60 / 30 DAY CHECKPOINTS AS APPLICABLE
→ RENEW / RE-RENT / SELL / BUY / MOVE OUTCOME
→ CORRECT NEW OPPORTUNITY
→ SAME PARTY + PROPERTY HISTORY
```

## Agent Tax Documents

Not complete until:

```text
PAYMENT HISTORY
→ TAX YEAR
→ APPLICABLE ANNUAL TAX RECORD
→ AGENT ACCESS
→ BROKERAGE ACCESS
→ HISTORICAL RETENTION
```

reconciles without an independent duplicate payment truth.

---
---

# DIRECTIVE B — PR #595 — ADDITIVE REQUIREMENTS: AGENT BOOK OF BUSINESS + EXPANDED LANDLORD/INVESTOR LIFECYCLE

These requirements are additive to the existing Master Plan.

Do not rewrite existing sections.

---

## ADD TO §2 / §3 — AGENT BOOK OF BUSINESS OWNERSHIP

Every Mallan Agent manages their own book of business inside the shared Mallan brokerage operating system.

Each Agent's **My Business** includes the Agent's own:

```text
LEADS

BUYERS

SELLERS

LANDLORDS / OWNERS

TENANTS / RENTERS

INVESTORS / 1031 CLIENTS

PAST CLIENTS

REFERRALS

SAVED SEARCHES

LISTINGS

SHOWINGS / OPEN HOUSES

CMA / ANALYSIS

OFFERS / APPLICATIONS

ACTIVE DEALS

FOLLOW-UPS / TASKS

COMMISSIONS / REFERRAL FEES

POST-DEAL / FUTURE OPPORTUNITIES
```

This does not mean each Agent gets a separate CRM or separate copy of Party, Property, Listing or history.

The architecture remains:

```text
ONE CANONICAL MALLAN SYSTEM
↓
CANONICAL PARTY / PROPERTY / LISTING / HISTORY
↓
AGENT ASSIGNMENT / OWNERSHIP
↓
MY BUSINESS
```

Maya/Broker sees firm-wide records through Brokerage View.

---

## CANONICAL PARTY IS SHARED; OPPORTUNITY OWNERSHIP IS EXPLICIT

A Party remains one canonical identity even when that person has multiple business relationships.

Example:

```text
JOHN — ONE PARTY

├── BUYER OPPORTUNITY
├── FUTURE LANDLORD OPPORTUNITY
├── SELLER OPPORTUNITY
└── INVESTOR OPPORTUNITY
```

Each Opportunity must identify its responsible Agent.

Do not duplicate John simply because the business role changes.

---

## AGENT OWNERSHIP FIELDS / RELATIONSHIPS

Every Lead and active Opportunity must have a clear responsible Agent or explicitly be unassigned.

Conceptually:

```text
LEAD
→ assigned_agent_id

OPPORTUNITY
→ owner_agent_id

LISTING
→ responsible / listing Agent relationship

SAVED SEARCH
→ owning Agent + Client Opportunity

DEAL
→ responsible Agent relationship

REFERRAL
→ responsible Agent

TASK / FOLLOW-UP
→ assigned Agent
```

Use existing canonical models/fields where they already satisfy these responsibilities.

Do not casually create new schema.

---

## LEAD OWNERSHIP

Every Agent manages the Agent's own Leads.

Agent My Business should show:

```text
NEW LEADS
UNCONTACTED
FOLLOW-UP DUE
QUALIFYING
ACTIVE OPPORTUNITIES
NURTURE
CONVERTED
LOST
FUTURE FOLLOW-UP
```

Brokerage View shows all Leads firm-wide.

### Existing relationship protection

Before distributing a new Lead:

```text
NEW LEAD
↓
IDENTITY RESOLUTION
↓
EXISTING PARTY?
↓
EXISTING ACTIVE AGENT RELATIONSHIP?
```

If there is already a valid Agent/client relationship, the system must not casually assign the same person to another Agent and create competing brokerage relationships.

Any reassignment/transfer must be deliberate and recorded.

---

## LEAD TRANSFER / REASSIGNMENT

If a Lead or Opportunity changes Agents:

```text
CURRENT AGENT
↓
TRANSFER / REASSIGNMENT
↓
NEW AGENT
```

Preserve:

* original Agent;
* new Agent;
* date/time;
* reason;
* actor making the change;
* existing communications/history;
* client requirements;
* Search history;
* property activity;
* documents;
* prior work.

Do not create a new Party or wipe history to accomplish reassignment.

---

## BROKERAGE VIEW VERSUS MY BUSINESS

### Agent / My Business

Agent sees and operates the Agent's own business:

```text
MY LEADS
MY CLIENTS
MY BUYERS
MY SELLERS
MY LANDLORDS
MY TENANTS
MY INVESTORS
MY LISTINGS
MY SEARCHES
MY DEALS
MY REFERRALS
MY MONEY
MY TASKS
```

### Broker / Brokerage View

Maya sees:

```text
ALL AGENTS
ALL BROKERAGE LEADS
ALL CLIENT OPPORTUNITIES
ALL MALLAN LISTINGS
ALL ACTIVE DEALS
ALL COMMISSION / REFERRAL QUEUES
ALL COMPLIANCE / PROFESSIONAL EXCEPTIONS
```

Brokerage View is supervisory/firm-wide visibility over the same records.

It is not a second database.

---

# ADD TO §13 — EXPANDED LANDLORD LIFECYCLE

The Landlord relationship can result in more than:

```text
RENEW
RE-RENT
SELL
```

It can also result in:

```text
BUY ANOTHER INVESTMENT PROPERTY
```

The full decision branch should therefore become:

```text
LEASE EXPIRATION / PROPERTY REVIEW
↓
OWNER / LANDLORD DECISION

├── RENEW CURRENT TENANT
│
├── RE-RENT PROPERTY
│
├── SELL PROPERTY
│   → SELLER OPPORTUNITY
│
├── BUY ANOTHER INVESTMENT PROPERTY
│   → INVESTOR / BUYER OPPORTUNITY
│
├── SELL + REINVEST
│   → SELLER OPPORTUNITY
│   + INVESTOR / BUYER OPPORTUNITY
│   + 1031 ANALYSIS WHERE APPLICABLE
│
└── HOLD / REVIEW LATER
```

All of these remain attached to the same Landlord Party.

---

# SIX-MONTH LANDLORD REVIEW SHOULD INCLUDE INVESTMENT OPPORTUNITY

At approximately six months before lease expiration, the Landlord review should not ask only:

> Renew, re-rent or sell?

It should help the Agent explore:

```text
RENEW?

RE-RENT?

SELL?

HOLD?

BUY ANOTHER INVESTMENT PROPERTY?

SELL AND REINVEST?

REVIEW A 1031 STRATEGY WHERE RELEVANT?
```

The system should prepare useful decision context such as:

```text
CURRENT PROPERTY VALUE

CURRENT / POTENTIAL MARKET RENT

CURRENT CARRYING COSTS

RENTAL PERFORMANCE

SALE MARKET

RENTAL MARKET

HOLD-v-SELL

CURRENT EQUITY / VALUE CONTEXT WHERE AVAILABLE

POTENTIAL INVESTMENT PURCHASE RANGE

CURRENT INVESTMENT PROPERTY OPPORTUNITIES

NOI / CAP / CASH-ON-CASH ANALYSIS

1031 REPLACEMENT ANALYSIS WHERE APPLICABLE
```

This creates a legitimate additional brokerage path:

```text
LANDLORD
↓
INVESTOR OPPORTUNITY
↓
INVESTMENT SAVED SEARCH
↓
PROPERTY INTELLIGENCE
↓
INVESTMENT ANALYSIS
↓
SHOWINGS
↓
OFFER
↓
PURCHASE
↓
NEW PROPERTY
↓
FUTURE LANDLORD / SELLER LIFECYCLE
```

---

# ADD TO §16 — INVESTOR / 1031

Investor business should not depend only on a new Investor Lead.

Investor Opportunities can originate from existing Mallan relationships.

Examples:

```text
LANDLORD
→ BUY ANOTHER INVESTMENT PROPERTY

SELLER
→ REINVEST SALE PROCEEDS

BUYER
→ FUTURE INVESTOR

PAST CLIENT
→ INVESTMENT PURCHASE

1031 CLIENT
→ REPLACEMENT PROPERTY
```

These all reuse the same Party identity.

An Agent managing the underlying relationship should see the resulting Investor Opportunity in the Agent's My Business.

---

# ADD TO §22 — RELATIONSHIP INTELLIGENCE

Mallan should continuously identify legitimate **next-business opportunities** from existing relationships.

Examples:

```text
TENANT
→ RENEW
→ MOVE
→ BUY

LANDLORD
→ RENEW
→ RE-RENT
→ SELL
→ BUY ANOTHER INVESTMENT
→ SELL + REINVEST / 1031

BUYER
→ OWNER
→ LANDLORD
→ INVESTOR
→ SELLER

SELLER
→ BUYER
→ INVESTOR
→ 1031

PAST CLIENT
→ REPEAT CLIENT
→ REFERRAL SOURCE
```

These are not automatic conversions.

The system surfaces evidence and an Agent opportunity to discuss the next need.

The Agent determines the appropriate conversation.

---

# ADD TO §23 — MY BUSINESS CLIENT ORGANIZATION

Agent My Business should make the Agent's book understandable by current relationship.

Useful views include:

```text
MY LEADS

MY BUYERS

MY SELLERS

MY LANDLORDS

MY TENANTS

MY INVESTORS / 1031

MY PAST CLIENTS

MY ACTIVE DEALS

MY LISTINGS

MY FOLLOW-UPS

MY FUTURE OPPORTUNITIES
```

A single Party may appear in more than one appropriate business view because the Party has multiple Opportunities.

That does not create duplicate Party records.

---

# ADD TO §26 — DEFINITION OF DONE

Agent book-of-business ownership is not complete until:

```text
LEAD
→ AGENT ASSIGNMENT
→ PARTY
→ OPPORTUNITY
→ MY BUSINESS
→ SEARCH / LISTING / CMA / WORKFLOW
→ DEAL
→ POST-DEAL
→ FUTURE OPPORTUNITY
```

remains attached to the responsible Agent and canonical Party.

Brokerage View must simultaneously see the appropriate firm-wide record.

Reassignment must preserve history.

A returning Client must reconcile to the existing Party rather than create another person.

Landlord lifecycle is not complete until the system can support:

```text
RENEW
RE-RENT
SELL
BUY ANOTHER INVESTMENT
SELL + REINVEST / 1031
HOLD
```

with the resulting Opportunity attached to the same Landlord Party and responsible Agent.
