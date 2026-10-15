# UCBA 2026 — RLS Rules & Regulations Requirements

> **Source:** `UCBA_Master_Copy_rev._2026__redline_.pdf` (January 2026)
> **Extracted:** 2026-02-08
> **Applies to:** Mallan Real Estate Inc. (Brokerage #10991205323)
> **IDX Display:** Trestle IDX Plus WebAPI (read-only on mallan.nyc)

---

## NEW IN 2026 (Redline Changes)

### 1. Days on Market Reset (Art. I, Sec. 11)
- DOM resets to zero after **30 consecutive days** in "Withdrawn" or "Cancelled" status (was previously unspecified)
- DOM resets on sold (closed) or rented (closed)
- DOM starts when listing is transmitted to RLS
- "Coming Soon" and "Participant Only Network" do NOT accrue DOM
- **Cannot circumvent by re-naming or re-listing**

### 2. Protected Period After Listing Termination (Art. II, Sec. 13)
- Within **7 business days** after expiration, Exclusive Broker delivers up to **6 names** to Owner
- If contract/lease executed within **90 days** with one of the 6 names, Exclusive Broker entitled to compensation
- Owner must notify any New Exclusive Broker of this provision

---

## PARTICIPATION, ACCESS & OBLIGATIONS

### Who Must Participate
- **RBD member firms** with offices and/or Exclusive Listings in NYC **must participate** in RLS and comply with UCBA + Code of Ethics
- **Non-RBD licensed brokerage firms** with NYC offices/listings may participate if they pay required fees/dues and agree to follow the rules

### Mandatory Ethics Training (Gating Requirement)
- **New RBD members:** principal + all brokers/associate brokers/salespersons/branch managers must complete REBNY ethics course within **90 days** (access auto-suspended until completion)
- **Non-RBD participants:** principal broker(s) must complete **before access**; additional staff within **90 days**

### Firm Responsibilities
- Must keep RLS contact emails current for updates and violation notices
- RLS can impose fines/suspension/expulsion and may publish violations on REBNY website

---

## REQUIREMENTS FOR CRM BACKEND

### A. Listing Input Rules

| Rule | UCBA Ref | Requirement | CRM Impact |
|------|----------|-------------|------------|
| Exclusive Only | Art. I, Sec. 4 | RLS only accepts Exclusive Listings (including co-exclusive). No Open, FSBO, or Ours Alone. | Listing type dropdown must only allow Exclusive types |
| Simultaneous Distribution | Art. I, Sec. 5 | Must disseminate to RLS simultaneously with ANY public dissemination or first showing, whichever is earlier | Auto-submit to RLS on publish |
| Owner Opt-Out | Art. I, Sec. 5(A) | Requires signed Owner Opt-Out Form (Exhibit B) within 48hrs. NO public dissemination at any time. Exception: non-automated phone calls and one-to-one personal emails to Participants are NOT considered public dissemination for opt-out purposes. | Opt-Out checkbox + form upload + block all syndication + allow 1:1 comms |
| No Pocket Listings | Art. I, Sec. 5(B) | Cannot promote or encourage Owner to withhold from RLS. Patterns/practices can trigger complaint/hearing. | Warning/compliance notice in CRM |
| No Agent Info in Description | Art. I, Sec. 5(C) | No agent name, contact info, or URL links in property description, floorplans, photos, comments, or internet remarks. Agent info must appear only in mandatory fields. | Validation rule on description fields |
| No "Off-Market" Language | Art. I, Sec. 5(D) | Cannot describe, advertise, or promote any Exclusive Listing as "Off-Market" | Text validation on description/broker notes |
| No Compensation in Description | Art. I, Sec. 5(E) | No broker fees, closing costs, or any compensation info in property description or comments | Text validation |
| Mixed-Use Applicability | Art. I, Sec. 5(F) | These rules apply to professional/retail units within residential properties of **5 units or less** | Apply same validation to mixed-use listings |
| Status Changes Within 24hrs | Art. I, Sec. 6 | Price/status changes entered simultaneous with public changes OR within 24hrs (excluding weekends/postal holidays) of authorized change | Timestamp tracking, sync alerts |
| Closing Price Within 24hrs | Art. I, Sec. 7 | Must provide Closing Price within 24hrs of closing | Closing workflow reminder |
| Closed Listings Removed | Art. I, Sec. 6 | Closed listings must be removed or marked closed on broker website within 24hrs | Auto-status sync to frontend |
| Withdrawal Constraints | Art. I, Sec. 9 | Listing can be withdrawn at Owner request before expiry, but if it remains displayed publicly anywhere, it **may not** be withdrawn from RLS | Block RLS withdrawal if public display active |
| Auction Listings | Art. I, Sec. 15 | Auction listings must include: minimum acceptable bid, date/time/location/bidding site, registration procedures, inspection procedures, buyer's premium, pre-auction offer policy, governing auction rules | Auction-specific field set |
| Coming Soon (Sales Only) | Art. I, Sec. 16 | Max 14 days, no showings, no negotiations, no open houses, no rentals/new dev, only once per address/owner (60-day reset) | Coming Soon workflow with date validation |
| Required Disclosures | Art. I, Sec. 17 | Must disclose: "Broker commissions are not set by law and are fully negotiable" in listing agreement, buyer agreement, and pre-closing docs. If govt form, include separate conspicuous disclosure. | Disclosure checkbox/template |
| Buyer Rep Agreement | Art. II, Sec. 16 | Co-Broker must have executed written Buyer Representation Agreement before any showing | Showing workflow gate |
| Fair Housing | Exhibit C | No words/phrases violating Fair Housing Act or NYC Human Rights Law Title 8 | AI text scanner on listing descriptions |

### B. Mandatory Fields (Exhibit A)

#### All Listings
**Location & Building:**
- Borough
- Building and Listing Classification
- Building Pet Policy
- Building Sublet Policy
- Have Elevator
- Have Garage
- Have Lobby Attendant (Full/Part Time)
- Listing Full Address
- Neighborhood
- New Development & New Construction
- Number of Total Units
- Ownership Type (Condo, Coop, Condop, Rental Building)
- Tax Block and Lot (Building and Condo Unit)
- Total Number of Floors in Building
- Unit Number (if relevant)
- Year Built

**Listing Features:**
- Board Approval Required
- Number of Bathrooms
- Number of Baths Half
- Number of Bedrooms
- Number of Total Rooms
- Pet Policy
- Photos - Sort Order
- Private Outdoor Space
- Property Conditions
- Washer/Dryer Details

**Agents & Firms:**
- Exclusive Agents & Firm
- Buyer Agent and Firm (for Closed)

**Display Permissions:**
- IDX Entire Listing Display
- Participant Only Listing (if relevant)
- Syndication Display

**Status, Price & Dates:**
- Closing Price or Rental Price
- Concessions
- Exclusive Listing Expiration Date (Hidden)
- Listing Contract Date
- Listing Status & Date Change
- Price
- Purchase Contract Signed Date (for Pending)
- Sold or Leased Date (Closed Date)

**Showing & Open House:**
- First Showing Date (default = date listing entered)
- Open House(s) Details
- Showing/Open House Instructions

**Agreements:**
- Co-Broke Agreement Type (RUNDBA)
- Listing Type (Co-Exclusive, Exclusive Right to Sell, Exclusive Right to Lease, etc.)

#### Additional: Sales (Condo/Coop/Condop)
- Flip Tax
- Living Area (Condo)
- Maintenance Fee or Common Charges
- Maximum Financing
- Number of Shares (Coop)
- Percent of Common Elements (Condo)
- Tax Abatement
- Tax Monthly Amount (Condo)

#### Additional: Sales (Building/Townhouse)
- Building Area Total
- Garage
- Size Dimensions
- Tax Annual Amount
- Total Legal Rooms

#### Additional: Rental/Lease
- Availability Date
- Furnished Details
- Lease Terms
- Lease Type (Stabilized or Non-Stabilized)

---

## SELLING/LEASING PROCEDURES (Art. II — Operational Conduct)

### Showing & Appointment Rules
- Exclusive Agent must respond promptly to showing requests
- Generally may not deny a co-broker appointment except limited exceptions (owner instruction consistent with buyer's right to representation)
- No inducing cancellation of appointments
- Best efforts to have backup coverage for showings
- Appointments only available **after listing is entered into RLS** (except Coming Soon)

### Buyer/Tenant Rights
- Buyer/tenant has a right to be represented by co-broker; exclusive side must not interfere
- Co-broker must have executed written Buyer Representation Agreement before any showing

### Name Recording
- Buyer names recorded at showing, then deleted if appointment cancelled/no visit

### Contact Restrictions
- No contacting Owner about an Exclusive Listing without Exclusive Agent consent
- Detailed restrictions when agent leaves a firm

### Negotiations
- Negotiations with owner/buyer generally require knowledge/consent of the other broker side
- Exception: owner's offer of compensation

### Board Packages
- Cooperation required between both sides
- Cover sheet must include both broker contacts
- No marketing logos in board package

### Lease Applications
- Review required by both Exclusive Agent and co-broker before submitting to owner/board

### Multiple Bids (Rev. 2026)
- Exclusive Agent discloses offers to owner
- May disclose competing bid amounts to co-brokers if seller authorizes
- Must treat parties fairly

### Open Houses
- No denying access to other Participants

### Co-Exclusive Listings
- Both co-exclusive brokers included in listing
- Coordinate communication and offers

### Tenant Multiple-Fee Disclosure
- Co-broker must inform tenant of risk of owing multiple fees if shown through multiple firms when tenant agreed to pay compensation

---

## PROHIBITIONS (Art. III — Data Use, Marketing, Accuracy)

### Unauthorized Use of Listing Info (Art. III, Sec. 1)
- Listing Information may not be disclosed/sold/leased/commercially exploited or provided to third parties unless specifically allowed by separate written agreement

### Promotional Restrictions (Art. III, Sec. 2)
Without Exclusive Broker's written consent, a Participant may not:
- Advertise the Exclusive Property (including on third-party sites)
- Conduct mass solicitations promoting it
- Disseminate identity of seller/buyer connected to viewing until after closed
- Internal firm dissemination is allowed only if confidential and not public
- **IDX/VOW exception:** Advertising via IDX or VOW must include "Listing Courtesy of [Exclusive Broker/Participant]" in reasonably prominent location, font not smaller than median type face

### Duplicate/Ownership Control (Art. III, Sec. 2(D))
- During an Exclusive Listing term, no other firm can submit that property as their own Exclusive Listing
- New firm can submit after expiry/cancellation and execution of a new Exclusive Listing
- Advertising a property during original term without written consent is prohibited

### No Solicitation (Art. III, Sec. 3)
- Cannot solicit an Owner to terminate an existing Exclusive Listing
- Can enter a separate agreement covering matters not covered by original listing (e.g., lease exclusive while sale exclusive exists), with written warning that owner may owe compensation under both

### Data Accuracy (Art. III, Sec. 4)
- Incomplete mandatory items or incorrect data = violation; subject to penalties

### No "Free Services" Claims (Art. III, Sec. 5)
- Cannot claim services are free/no cost unless no compensation will be received from any source

---

## COMPENSATION RULES (Art. IV)

- REBNY/RLS does not set or recommend compensation rates and does not display offers of compensation
- On request, participants must provide listing agreements and/or buyer representation agreements to RLS staff for confidential inspection within **48 hours**
- Disclosure rules apply for participant ownership interest or attempts to acquire interest in the listed property

---

## REQUIREMENTS FOR FRONTEND (Public Website)

### C. IDX/VOW Display Rules

| Rule | UCBA Ref | Requirement |
|------|----------|-------------|
| Attribution Required | Art. III, Sec. 2(C) | When advertising another Participant's listing through IDX/VOW, must include listing broker name in reasonably prominent location, font not smaller than median font |
| No Unauthorized Advertising | Art. III, Sec. 2(A) | Cannot advertise another Participant's listing without written consent (IDX/VOW is the exception) |
| Respect Opt-Outs | Art. I, Sec. 5(A) | Owner Opt-Out listings: NO public dissemination whatsoever |
| Respect Participant Only | Definitions (W) | Participant Only listings: authorized Participant view only, not public |
| No Off-Market Language | Art. I, Sec. 5(D) | Never describe listings as "Off-Market" |
| Closed = Remove in 24hrs | Art. I, Sec. 6 | Remove or clearly mark closed within 24hrs |
| Coming Soon Display | Art. I, Sec. 16(C) | Must prominently display: "Coming Soon. No Showings or Open House until [Start Showing Date]" |
| Statistical Data Attribution | Art. VIII, Sec. 4 | Any stats derived from RLS must include: "Based on information from the REBNY Listing Service for the period [date] through [date]. The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof." |
| No Reproduction | Art. VIII, Sec. 4 | RLS data cannot be reproduced, copied, entered into a database, used in mailing lists, except for individual personal reference |
| Confidential Fields | Art. VIII, Sec. 2 | Must protect restricted fields, names, and addresses |

### D. Compensation Display Rules (NEW 2025)

| Rule | UCBA Ref | Requirement |
|------|----------|-------------|
| No Compensation on RLS | Art. IV, Sec. 2 | RLS does NOT collect or display any offers of compensation |
| Rates Not Set by Law | Art. IV, Sec. 1 | REBNY does not fix, control, recommend, or suggest compensation rates |
| Fully Negotiable | Art. I, Sec. 17 | Must disclose commissions are fully negotiable |

---

## VIOLATION PENALTIES & FINES

### E. Fair Housing Violations (Sales & Rentals)

| Step | Action | Fine |
|------|--------|------|
| 1st Notification | 2 business days to correct | $250 |
| 2nd Notification | Termination of RLS access | Additional $500 |

### F. UCBA/Data Quality Violations (Sales & Rentals)

| Step | Action | Fine |
|------|--------|------|
| 1st Notification | 3 business days to cure | $0 |
| 2nd Notification | 2 business days to correct | $250 |
| 3rd Notification | 1 business day to correct | Additional $250 |
| 4th Notification | Termination of RLS access | — |

### G. Incurable Violations (e.g., advertising opted-out properties)

| Offense | Fine |
|---------|------|
| 1st in calendar year | $250 |
| Each subsequent in calendar year | $500 |

### H. General UCBA Violations (Art. XI)

| Offense | Penalty |
|---------|---------|
| 1st | $500 |
| 2nd within 12 months | Up to $2,000 |
| 3rd within 12 months | Up to $10,000 + posted on REBNY website |
| 4th within 12 months | Suspension up to 30 days + posted on REBNY website |
| Unpaid fines (60 days) | Broker notified, 30 days to pay or suspension |

### I. Quarterly Firm Reviews

- RLS performs 4 quarterly reviews per year
- **>5% rejection/violation rate = $10,000 fine** (must pay within 3 days)
- **3 quarterly fines in a calendar year = 30-day suspension** + must demonstrate corrective measures for reinstatement

### J. Fine Payment

- All fines must be paid within **10 days** of imposition
- Failure = termination of RLS access
- Violations waived if notice occurs >180 days after listing sold/canceled/expired

### K. Enforcement & Complaints (Art. V-X)

- Complaints must be signed/witnessed by broker leadership; good-faith resolution attempts required first
- **Statute of limitations:** generally **90 days** from discovery
- Certain data-related violations processed under Listing Data Compliance Policy (Exhibit C)
- **Duty to correct:** generally within **2 business days** after ruling (data compliance follows its own timelines)

### L. Arbitration

- Monetary disputes may be submitted to REBNY Arbitration; where client has consented, must be submitted
- Failure to submit can be a violation with penalties up to **$10,000** and potential expulsion
- Continued violations after 4th offense can lead to expulsion
- Providing access to suspended/revoked participant = unauthorized use violation

### M. Suspended/Terminated Agents

- Lose ability to update/remove/post listings
- Firm must reassign listing to another agent

---

## LISTING STATUS TYPES

| Status | Description | DOM Accrues? |
|--------|-------------|-------------|
| Active | Live on market, available for showing | Yes |
| Coming Soon | Pre-market, max 14 days, no showings | No |
| Participant Only | Co-broke only, no public dissemination | No |
| Owner Opt-Out | Not shared on RLS or publicly | N/A |
| Pending | Contract signed, not yet closed | Yes |
| Temporarily Off-Market | Temporarily removed | Paused |
| Withdrawn | Removed by broker | Paused (resets after 30 days) |
| Cancelled | Listing cancelled | Paused (resets after 30 days) |
| Closed | Sold or rented | Stops (resets to 0) |

---

## COMING SOON RULES (Art. I, Sec. 16)

1. Sales only (NOT rentals, NOT new developments)
2. Maximum **14 calendar days** from RLS submission
3. **No showings** under any circumstances (including to Exclusive Broker's own clients)
4. **No open houses** (including broker tours)
5. **No negotiations or counteroffers** until moved to Active
6. May schedule appointments, but cannot show until Active
7. Must display: "Coming Soon. No Showings or Open House until [Start Showing Date]"
8. Can convey unsolicited offers to Owner, but cannot facilitate acceptance
9. One-time use per address/owner (unless off-market 60+ days)
10. Owner must sign Coming Soon Authorization (Exhibit G)
11. If not ready on Showing Start Date, must move to "Temporarily Off-Market" or "Withdrawn"
12. Showing Start Date cannot be changed

---

## NEW DEVELOPMENT RULES (Exhibit D - RUNDBA)

1. Executed RUNDBA must be submitted to RLS before listing New Dev Units
2. All RLS participants deemed to have accepted RUNDBA terms
3. Must still register at new development/sales office
4. Registration: written record at Sales Office with Prospect's full name
5. Commission earned only upon closing (absolute condition)
6. Commission based on Net Purchase Price (less credits/concessions)
7. Commissions fully negotiable (stated in agreement)
8. No advertising Units except with materials furnished by Exclusive Sales Agent
9. Outside Broker may not attend punch list or closing without Owner's written consent
10. Change of Exclusive Broker: submit "Change of New Development Brokerage/Sales Office Form" (Exhibit E)

---

## OWNER OPT-OUT FORM REQUIREMENTS (Exhibit B)

Owner Opt-Out Form must include:
1. Owner's name
2. Exclusive Property address (including unit #)
3. Agent name and brokerage
4. Owner's signature
5. Must be submitted through LMP within 48 hours
6. Owner acknowledges: reduced exposure, may affect offers/price, may take longer to sell/rent

---

## KEY DEFINITIONS

| Term | Definition |
|------|-----------|
| **Exclusive Listing** | Written agreement (exclusive right to sell/lease or exclusive agency) |
| **Exclusive Broker** | RBD member or Participant with written exclusive appointment |
| **Exclusive Agent** | Agent affiliated with Exclusive Broker, appointed as exclusive sales/rental agent |
| **Co-Broker** | Participant representing Buyer/Tenant |
| **Participant** | Licensed broker/agent associated with RBD member or firm with NYC office/listings |
| **Participant Only** | Listing shared on RLS for authorized Participant view only, no public dissemination |
| **Owner Opt-Out** | Owner elects not to share over RLS or public dissemination |
| **Pocket Listing** | Exclusive Listing withheld from RLS and selectively co-broked (PROHIBITED) |
| **Ours Alone** | Oral/verbal listing (NOT accepted on RLS) |
| **Open Listing** | No exclusive agreement (NOT accepted on RLS) |
| **Coming Soon** | Pre-market status, max 14 days, no showings (sales only) |
| **Buyer Representation Agreement** | Written agreement outlining buyer-broker agency, compensation terms, and restriction from exceeding agreed rate |
| **Public Dissemination** | Display on broker website, agent website, social media, third-party sites, automated mass marketing |

---

## ENGINEERING IMPLEMENTATION CHECKLIST

### Required Listing Flags/Enums (Minimum)
- `listing_type`: SALE | RENT
- `listing_status`: DRAFT | COMING_SOON | ACTIVE | TEMP_OFF_MARKET | WITHDRAWN | PENDING | CLOSED | CANCELLED | EXPIRED
- `visibility`: PUBLIC_WEB | PARTICIPANT_ONLY_NETWORK | OWNER_OPTOUT | INTERNAL_ONLY
- `new_development`: true/false (and RUNDBA uploaded/verified if true)

### CRM Must Have (Compliance Critical)
- [ ] Listing type restricted to Exclusive types only (including co-exclusive)
- [ ] Simultaneous RLS submission on public dissemination
- [ ] Owner Opt-Out form upload + auto-block syndication + allow 1:1 comms only
- [ ] No agent info validation on description fields
- [ ] No "Off-Market" text validation
- [ ] No compensation text validation on description/comments
- [ ] No "free services" claims validation
- [ ] Coming Soon workflow (14-day max, no showings, date tracking)
- [ ] DOM calculation engine (start, pause, reset rules)
- [ ] Status change timestamp tracking (24hr compliance)
- [ ] Closing Price entry within 24hrs workflow
- [ ] Fair Housing text scanner on all listing descriptions
- [ ] All Exhibit A mandatory fields present in listing forms
- [ ] IDX/Participant Only/Syndication display permission toggles
- [ ] Buyer Representation Agreement tracking (required before showing)
- [ ] Commission negotiability disclosure in listing agreements
- [ ] Protected period tracking (6 names, 90 days after termination)
- [ ] Withdrawal constraint: block RLS withdrawal if public display active
- [ ] Auction listing fields (if applicable)
- [ ] New Development RUNDBA upload/verification
- [ ] Multiple bids disclosure workflow
- [ ] Board package cover sheet template (both broker contacts, no marketing logos)
- [ ] Duplicate listing prevention during active exclusive term

### Content Scanning (Blockers)
- [ ] Block personal info/URLs in description/media/comments
- [ ] Block "Off-Market" claims in public text
- [ ] Block compensation language in description/comments
- [ ] Block "free/no cost" claims unless genuinely free
- [ ] Fair Housing prohibited words/phrases detection (enforce correction SLAs)

### Timing Automation
- [ ] On publish to web/social/3rd-party: ensure listing is in RLS at same time
- [ ] Auto-enforce update SLAs: sync within 24hrs of authorized changes
- [ ] Closing data: require closing price and closed date updates within 24hrs

### Audit Logging (Minimum)
- [ ] Status changes, price changes, publish/unpublish
- [ ] Opt-out/participant-only toggles
- [ ] Compliance scan results and correction timestamps
- [ ] Exports (if any), who initiated, snapshots

### Frontend Must Have
- [ ] REBNY RLS attribution on all IDX-displayed listings
- [ ] Statistical data REBNY disclaimer with date range
- [ ] Respect InternetEntireListingDisplayYN (hide if False)
- [ ] Respect InternetAddressDisplayYN (hide address if False)
- [ ] Respect Participant Only / Owner Opt-Out (never display)
- [ ] Coming Soon badge with "No Showings until [date]"
- [ ] Remove/mark closed listings within 24hrs
- [ ] No "Off-Market" language anywhere
- [ ] No compensation amounts displayed
- [ ] No seller/buyer identity until after closed

---

## UCBA REVISION TIMELINE

| Rule Area | Added/Revised | Year |
|-----------|---------------|------|
| DOM rules refined | Rev | 2026 |
| Multiple bids disclosure updated | Rev | 2026 |
| Buyer Representation Agreement + showing gating | Added | 2025 |
| Mandatory ethics training as access condition | Rev/Added | 2025 |
| "Participant Only Network" definition | Added | 2025 |
| Commission negotiability disclosure | Added | 2025 |
| Compensation data policy (RLS does not collect/display) | Added | 2025 |
| Opt-out/public dissemination rule revisions | Rev | 2024/2025 |
| Coming Soon framework and restrictions | Rev | 2024/2025 |
| Off-Market description prohibition | Added | 2023 |

---

## OWNER/PARTICIPANT FORMS (Exhibits)

| Exhibit | Form |
|---------|------|
| Exhibit A | Mandatory Listing Fields |
| Exhibit B | Owner Opt-Out Form |
| Exhibit C | Listing Data Compliance Policy (Feb 2025) |
| Exhibit D | RUNDBA (New Development Brokerage Agreement) |
| Exhibit E | Change of New Development Brokerage/Sales Office Form |
| Exhibit F | RLS Appeals Process |
| Exhibit G | Coming Soon Owner Authorization |
