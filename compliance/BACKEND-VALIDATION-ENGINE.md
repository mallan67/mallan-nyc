# Backend Validation Engine

> **Feed:** REBNY RLS via the Cotality API | **LMP:** RealPlus (listing input to RLS) | **IDX Display:** Cotality IDX Plus Web API (read-only on mallan.nyc)
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **NY law/DOS, Fair Housing and REBNY rules (UCBA 2026, REBNY Listing Service)** govern use, display and conduct. 2. **The live Cotality API** is the only authority for provider fields, values and picklists (`data/cotality-enums.live.json` is its committed copy).
> 3. **Mallan business rules** govern how verified facts are used; Mallan-created fields (mostly commercial and private-listing fields) are Mallan facts, never presented as provider data, and can restrict but never override a law/REBNY/provider display restriction (Master §0.2, §4, §21.1). 4. **Fail closed = NON-DISPLAY.** Plan: `MALLAN-PLATFORM-MASTER-PLAN.md`; state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

---

## Why This Matters

> **Quarterly >5% rejection rate = $10,000 fine (M13)**
> **3 quarterly fines in a year = 30-day RLS suspension (M14)**
> **Server-side validation is a financial imperative.**

---

## 1. Validation Layers

```
Layer 1: Client-side (CRM form)     → Immediate feedback, UX only
Layer 2: Server-side (API route)     → MANDATORY before RLS submission
Layer 3: RLS rejection (via the LMP) → Post-submission, must handle gracefully
```

**Layer 2 is the enforcement layer.** Layer 1 is convenience. Layer 3 is error handling.

---

## 2. Mandatory Field Validation

### Always Required (41 Fields)

Validate ALL of these are present and non-empty before RLS submission. See UCBA 2026 Exhibit A (`data/UCBA-2026-Requirements.md` §B) for the mandatory-field checklist. Use the live Cotality field name (`data/cotality-enums.live.json`) wherever one exists; a mandatory item with no live provider field is still required and is kept as Mallan-authored listing data, never silently dropped (Master §7.0).

Key mandatory fields:
- **Address:** StreetNumber, StreetName, City, CityRegion, CountyOrParish, StateOrProvince, PostalCode, PostalCity, UnParsedAddress, SubdivisionName
- **Classification:** PropertyType, PropertySubType, CommonInterest, StructureType
- **Building:** AttendanceType, BuildingLaundryFeatures, BuildingPetsAllowed, BuildingTaxLot, ElevatorsTotal, NumberOfUnitsTotal, StoriesTotal, YearBuilt, GarageYN, NewConstructionYN, NewDevelopmentYN
- **Unit:** BathroomsFull, BathroomsHalf, BathroomsTotal, BedroomsTotal, RoomsTotal, PetsAllowed
- **Agent:** ListAgentMlsId, BuyerAgentMlsId (at close)
- **Status:** MlsStatus, OnMarketDate, ExpirationDate, ListPrice
- **Display:** InternetEntireListingDisplayYN *(also gates IDX — no separate IDX field in the live Cotality schema)*, InternetAddressDisplayYN, InternetAutomatedValuationDisplayYN, InternetConsumerCommentYN, SyndicateTo *(UCBA: SyndicateYN)*
- **Description:** PublicRemarks, ShowingInstructions
- **Compliance:** CoBrokeAgreement, ListingAgreement, Concessions

### Conditional Validation Rules

| Condition | Required Fields |
|-----------|----------------|
| PropertyType = Residential | Cannot use Exclusive Right To Lease |
| PropertyType = ResidentialLease | Cannot use Exclusive Right To Sell |
| CommonInterest = StockCooperative | MaximumFinancing, NumberOfShares, SpecialListingConditions |
| CommonInterest = Condominium | LivingArea, PercentOfCommonElements, TaxMonthlyAmount, SpecialListingConditions |
| CommonInterest = Condop | SpecialListingConditions |
| MlsStatus = Closed | CloseDate, ClosePrice, BuyerAgentRLSParticipantYN |
| MlsStatus = Pending | PurchaseContractDate |
| MlsStatus = Withdrawn | WithdrawnDate (must equal OffMarketDate) |
| MlsStatus = Cancelled | CancellationDate |
| MlsStatus = ComingSoon | ActivationDate (within 14 days) |
| NewDevelopmentYN = true | RUNDBA upload required |
| Furnished = Furnished/Partial/Negotiable | FurnishedListPrice |
| Any AlternateStreet field | AlternateStreetNumber + AlternateStreetName |
| BuyerAgentRLSParticipantYN = false + any Buyer field | BuyerAgentFullName, Phone, Email, License, OfficeName, OfficePhone |

---

## 3. Cross-Field Validation

| Rule | Fields | Validation |
|------|--------|------------|
| Borough-County match | CityRegion, CountyOrParish | Kings=Brooklyn, Queens=Queens, New York=Manhattan, Richmond=Staten Island, Bronx=Bronx |
| City must be NYC | City | Must be "New York" (or valid NYC variant) |
| State must be NY | StateOrProvince | Must be "NY" |
| Street in dictionary | StreetName, StreetSuffix | Reject if not in REBNY Street Dictionary |
| Listing agreement match | ListingAgreement, PropertyType | Sale type cannot have lease agreement and vice versa |
| Permissions mutex | Permissions | Cannot be both Owner Opt-Out AND Participant Only |
| Sale: no Coming Soon with opt-out | Permissions, MlsStatus | If Permissions = Owner Opt-Out, block Coming Soon |
| Sale: Permissions=Null can't set InternetEntire=False | Permissions, InternetEntireListingDisplayYN | Block if Permissions is null and InternetEntire set to False |
| Date ordering | Various dates | ListingContractDate <= OnMarketDate <= PurchaseContractDate <= CloseDate |
| Listing contract max | ListingContractDate | Cannot be >1 year from current date |
| Expiration max | ExpirationDate | Maximum 10 years |
| Coming Soon max | ActivationDate, ComingSoonTimestamp | ActivationDate within 14 calendar days of CS submission |

---

## 4. Content Scanners

### Fair Housing Scanner

Run on: `PublicRemarks`, `PrivateRemarks`, `ShowingInstructions`, all text fields

**Patterns to flag (case-insensitive):**

| Category | Patterns |
|----------|----------|
| Race/Color | racial slurs, "white neighborhood", "diverse area" |
| Religion | "Christian community", "near mosque/church/synagogue" (context) |
| National Origin | "English-speaking", "American only", ethnic slurs |
| Familial Status | "no children", "adults only", "perfect for couples" |
| Disability | "no wheelchairs", "must climb stairs", "handicapped" |
| Source of Income | "no vouchers", "no Section 8", "employed only", "no programs" |
| Criminal History | "background check required", "no felons", "criminal record", "arrest", "conviction", "ex-con" |

**Action:** Block RLS submission if violations detected. Allow broker override with acknowledgment logging.

### Agent Info Scanner

Run on: `PublicRemarks`, `PrivateRemarks`, all description fields

**Patterns to flag:**
- Phone numbers (10-digit patterns)
- Email addresses
- URLs (http/https/www)
- Known agent names from agent roster

**Action:** Block submission. No override — this is a hard rule (Art. I, Sec. 5(C)).

### Off-Market Scanner

Run on: All text fields

**Patterns to flag:**
- "off-market", "off market", "pocket listing", "pocket deal"

**Action:** Block submission. No override (Art. I, Sec. 5(D)).

### Compensation Scanner

Run on: `PublicRemarks`, `PrivateRemarks`, all description fields

**Patterns to flag:**
- "commission", "broker fee", "buyer pays", "no fee", "seller concession", "closing cost credit" (in compensation context), "X%"

**Action:** Block submission. No override for public fields (Art. I, Sec. 5(E)).

---

## 5. Display Control Cascade

When `InternetEntireListingDisplayYN` is set to `False`, server MUST auto-set:

```javascript
if (listing.InternetEntireListingDisplayYN === false) {
  // Note: IDXEntireListingDisplayYN is an internal name — does not exist in the live Cotality schema
  listing.IDXEntireListingDisplayYN = false;  // internal cascade only
  listing.InternetAddressDisplayYN = false;
  listing.InternetAutomatedValuationDisplayYN = false;
  listing.InternetConsumerCommentYN = false;
  // Disable listing alerts for non-exclusive agents
}
```

---

## 6. Status Transition Validation

### Valid Transitions

| From | Allowed To |
|------|-----------|
| ComingSoon | Active, TemporarilyOffMarket, Withdrawn |
| Active | Pending, TemporarilyOffMarket, Withdrawn, Cancelled, Closed |
| Pending | Active, Closed, Withdrawn, Cancelled |
| TemporarilyOffMarket | Active, Withdrawn, Cancelled |
| Withdrawn | Active (after 30 days = DOM reset) |
| Cancelled | Active (after 30 days = DOM reset) |
| Closed | (terminal) |

### Invalid Transitions (Block)

- Closed → anything (terminal state)
- Any status → Owner Opt-Out (must be set at creation)
- ComingSoon → Pending (must go Active first)
- ComingSoon → Closed (must go Active first)

---

## 7. Timing Enforcement

| Rule | SLA | Action |
|------|-----|--------|
| Status changes | Within 24hrs of authorized change | Alert if >24hrs since last public change |
| Closing price | Within 24hrs of closing | Alert if CloseDate set but no ClosePrice |
| Closed on website | Within 24hrs | Auto-sync status to frontend |
| Owner Opt-Out form | Within 48hrs of opt-out selection | Alert at 24hrs, escalate at 48hrs |
| Coming Soon expiration | 14 calendar days max | Alert at day 12, force status change at day 14 |

---

## 8. RLS Rejection Handling

When the REBNY Listing Service rejects a submission (reported through the LMP):

1. Log rejection with timestamp, field, reason
2. Notify submitting agent immediately
3. Track rejection count per quarter
4. Alert broker when approaching 5% threshold
5. Provide specific field-level error messages

### Rejection Rate Monitoring

```
quarterly_rejection_rate = rejections / total_submissions * 100
if (quarterly_rejection_rate > 4%) → YELLOW alert to broker
if (quarterly_rejection_rate > 5%) → RED alert — $10,000 fine imminent
```

---

## 9. Picklist Validation

Use the live Cotality enums (`data/cotality-enums.live.json`, read through `lib/cotality/cotality-enums.ts`) for server-side validation of provider fields:

> **Not yet enforced on the CRM listing write path.** The frozen Sale/Rental Redesign forms still save legacy picklist values through `/api/crm/listings` (for example `PropertySubType` `SingleFamilyTownhouse` / `MultiFamilyTownhouse`, which the live enum does not contain). Enforce this together with their Cotality conversion, not before.

- Every provider picklist field MUST contain only values the live Cotality API serves (Mallan-created fields are Mallan facts with their own value lists — Master §0.2)
- Unknown/custom values = rejection
- Multi-select fields: validate each selected value individually
- Case-sensitive matching against the live Cotality enum strings

---

## 10. Data Integrity Rules

| Rule | Implementation |
|------|----------------|
| ListingContractDate immutable | Cannot be edited after initial submission |
| ActivationDate locked after CS | First Showing Date cannot change after Coming Soon submission |
| No duplicate listings | Check address + unit + owner within 30 days |
| BathroomsTotal = Full + Half | Cross-validate |
| No future CloseDate | CloseDate cannot be in the future |
| PurchaseContractDate >= ListingContractDate | Enforce date ordering |
