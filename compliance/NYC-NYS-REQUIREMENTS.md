# NYC & NYS Legal Requirements

> **Jurisdiction:** New York State / New York City
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806

---

> ### AUTHORITY (Packet 2 closure, 2026-09-06)
> **COTALITY LIVE CONTRACT** (`lib/cotality/live-contract.ts`, the dated live pulls) → provider facts: field existence, enum members.
> **REBNY / UCBA** (`lib/compliance/rebny-ucba-rules.ts`) → compliance / business rules. **MALLAN** (`lib/listings/mallan-form-contract.ts`, `lib/listings/mallan-status.ts`) → form / workflow / storage.
> **RESO = vocabulary only.** Fail closed = NON-DISPLAY. (The former "RLS overrides RESO/IDX" ordering is retired: no CSV, RESO document or hand-typed table is a field authority.)

---

## 1. NY DOS Advertising Rules (19 NYCRR Part 175)

### Section 175.25 — Advertising Requirements

Every advertisement (print, digital, social media, email, website) for real property MUST include:

| Requirement | Rule | Example |
|-------------|------|---------|
| **Brokerage Name** | Every ad must include the licensed brokerage name | "Mallan Real Estate Inc." |
| **Office Address OR Phone** | Must include office address or telephone number | "400 E 90th St, Suite 17C, NYC" or "646-258-4460" |
| **Agent/Team + Brokerage** | Agent or team name cannot appear without brokerage name | "Maya Allan, Mallan Real Estate Inc." |
| **License Number** | On brokerage materials | #10991205323 |
| **No Misleading Claims** | Cannot make false, misleading, or deceptive statements | -- |
| **"Licensed Real Estate Broker/Salesperson"** | If individual name used, must indicate license type | "Maya Allan, Licensed Real Estate Salesperson" |

### Section 175.28 — Anti-Discrimination Notice

- **Required disclosure** at first substantive contact with prospective buyer/tenant
- Must provide the NYS Housing Anti-Discrimination Disclosure form
- References NY Executive Law Article 15 (Human Rights Law)

### Section 175.12 — Disclosure of Interest

- Agent/broker must disclose any personal interest in the property
- Must be disclosed before any offer is made

---

## 2. Fair Housing Act (Federal) + NY State + NYC

### Federal Fair Housing Act (42 USC 3601-3619)

**Protected Classes:** Race, Color, National Origin, Religion, Sex, Familial Status, Disability

**Prohibited in advertising:**
- Any preference, limitation, or discrimination based on protected class
- Words, phrases, symbols, or images that indicate preference or exclusion

### NY State Human Rights Law (Executive Law Article 15)

**Additional Protected Classes:** Age, Marital Status, Military Status, Sexual Orientation, Gender Identity

### NYC Human Rights Law (Title 8, Admin Code 8-107)

**Additional Protected Classes:** Lawful Occupation, Lawful Source of Income, Immigration Status, Caregiver Status, Partnership Status, Alienage/Citizenship Status

### NYC Fair Chance Housing Act (LL 24/2023)

- **Effective:** January 1, 2025
- **Prohibits:** Inquiring about or considering criminal history in housing decisions
- **Prohibited language:** "arrest", "conviction", "criminal", "felon", "background check required", "criminal record", "ex-con"
- **Applies to:** All residential listings in NYC

### Penalty Summary — Fair Housing

| Source | 1st Offense | 2nd Offense |
|--------|-------------|-------------|
| REBNY/UCBA | $250 + 2 days to correct | $500 + **termination of RLS access** |
| NYC Commission on Human Rights | Up to $250,000 | Higher |
| Federal HUD | Up to $16,000 | Up to $65,000 |
| NYS SDHR | Varies | Varies |

---

## 3. Agency Disclosure (RPL Section 443)

### Required Disclosure Form: DOS-1736

- Must be provided at **first substantive contact** with prospective buyer, seller, tenant, or landlord
- Must explain the different types of agency relationships
- Must be signed/acknowledged by the consumer
- **Applies to:** Both sales and rentals
- **Form:** NYS DOS Form 1736 (standardized)

### Agency Types

| Type | Description |
|------|-------------|
| Seller's Agent | Represents seller only |
| Buyer's Agent | Represents buyer only |
| Broker's Agent | Agent of the listing or buyer broker |
| Dual Agent | Represents both (requires written consent) |
| Dual Agent with Designated Sales Agents | Different agents within same firm represent each side |

---

## 4. Property Condition Disclosure (RPL Article 14)

### Required Form: DOS-1614

- Seller must provide Property Condition Disclosure Statement
- If seller does NOT provide it, buyer receives **$500 credit** at closing
- Covers: structural, mechanical, environmental, legal conditions
- **Applies to:** Sales only (residential 1-4 units)
- **Does NOT apply to:** Co-ops (transfer of shares, not real property), new construction

---

## 5. Lead-Based Paint Disclosure (Federal)

### 42 USC 4852d — Residential Lead-Based Paint Hazard Reduction Act

- Required for **ALL housing built before 1978**
- Seller/landlord must:
  - Disclose known lead-based paint hazards
  - Provide EPA pamphlet "Protect Your Family from Lead in Your Home"
  - Include lead warning statement in contract/lease
  - Allow 10-day inspection period (sales)
- **Applies to:** Both sales and rentals (pre-1978)

---

## 6. FARE Act (NYC Local Law 119/2024)

### Fair Access to Rental and Equitable Treatment

- **Effective:** June 11, 2025
- **Core Rule:** Tenant may not be required to pay broker fee unless tenant specifically engaged the broker
- **RLS Impact:** If landlord does NOT pay broker fee → `InternetEntireListingDisplayYN = False` → excluded from IDX/VOW/syndication
- **Fee Disclosure Required:** Must disclose all fees before showing

### Fee Fields — LIVE (As of March 2026, Trestle/Cotality)

Trestle has added dedicated FARE Act fee fields:

| Field | Resource | Type | Purpose |
|-------|----------|------|---------|
| `MoveInCosts` | Property | Multi-select | Move-in cost types (Application Fee, Move-In Fee, etc.) |
| `MoveInCostsComments` | Property | Text | Comments about move-in costs |
| `MoveInCostsAmountTotal` | Property | Number | Total dollar amount of move-in costs |
| `OngoingFees` | Property | Multi-select | Ongoing recurring fees |
| `TenantPays` | Property | Multi-select | What tenant pays for (utilities, etc.) |
| `TenantPaysDescription` | Property | Text | Description of tenant-paid items |
| `AdditionalFee` | CustomProperty | Number | Additional fee amount |
| `AdditionalFeeDescription` | CustomProperty | Text | Additional fee description |
| `AdditionalFeeYN` | CustomProperty | Boolean | Whether additional fees apply |
| `FeeFrequency` | FeeFrequency Lookup | Enum | Frequency of fees (Monthly, Annually, etc.) |

**Required:** All rental listings MUST populate MoveInCosts and TenantPays fields. Fee disclosure is mandatory before showing per FARE Act §20-699.21.

### FARE Act Penalties (DCWP Enforcement)

| Violation | 1st Offense | 2nd Offense |
|-----------|-------------|-------------|
| Section 20-699.21 | $750 | $1,800 |
| Section 20-699.22 | $375 | $900 |

### Litigation Status (As of Feb 2026)

- REBNY challenged FARE Act in court; lost at district court level
- Appealed to Second Circuit (July 2025); **ruling still pending**
- REBNY updated RLS August 1, 2025 with two rental categories: Standard Active (syndication-eligible) and Non-Syndicated

---

## 7. NY SHIELD Act (Stop Hacks and Improve Electronic Data Security)

### General Business Law Section 899-aa, 899-bb

- **Applies to:** Any business holding private information of NY residents
- **Requirements:**
  - Implement reasonable data security safeguards
  - Administrative safeguards (employee training, vendor management)
  - Technical safeguards (encryption, access controls, intrusion detection)
  - Physical safeguards (secure disposal, access controls)
- **Breach notification:** Within reasonable time, not to exceed 30 days (as amended 2025)
- **Private information includes:** SSN, driver's license, financial account numbers, biometric data

### CRM/Application Impact

| Requirement | Implementation |
|-------------|----------------|
| Access controls | Role-based portal access (Broker/Agent/Client/Seller/Landlord) |
| Encryption | TLS in transit, encrypted at rest |
| Audit logging | Log all data access with timestamp, user, action |
| Data retention | Retain only what's necessary; secure disposal |
| Vendor management | Verify third-party (Trestle, Vercel, R2) compliance |
| Breach response | Notification within 30 days to affected individuals + AG + DFS + DOCS |

---

## 8. Smoke & Carbon Monoxide Detector Certification (RPL 235-b)

- **Required for:** All residential sales and rentals
- Seller/landlord must certify that smoke and CO detectors are installed and functioning
- Must comply with NYC building code requirements
- Certification at lease signing or closing

---

## 9. Bedbug Infestation Disclosure (NYC Admin Code 27-2018.1)

- **Required for:** All NYC rental buildings
- Landlord must disclose bedbug infestation history for the building and specific unit
- Must cover the prior 12-month period
- Must be provided before lease signing

---

## 10. Sprinkler System Disclosure (RPL 231-a)

- **Required for:** All NYC rental units
- Must disclose whether the building has a sprinkler system
- Must state whether the specific unit is equipped with sprinklers

---

## 11. Window Guard & Lead Annual Notice (NYC Admin Code 27-2043.1)

- **Required for:** All NYC rental buildings
- Annual notice about window guard availability (required if child under 10 in residence)
- Lead paint annual notice for pre-1960 buildings (or pre-1978 if known lead)

---

## 12. Source of Income Discrimination (NYC HRL 8-107)

- **Protected source of income includes:** Section 8 vouchers, HASA, FHEPS, CityFHEPS, Veterans benefits, Social Security, pension
- Landlords/brokers CANNOT refuse to rent based on lawful source of income
- CANNOT state "no vouchers," "no programs," or "employed applicants only"
- **Applies to:** All NYC rental listings

---

## 13. Buyer/Tenant Representation Agreement (NAR/UCBA)

- **Required before:** Any showing (UCBA Art. II, Sec. 16; NAR Settlement Aug 2024)
- Must be written and executed
- Must outline: agency relationship, compensation terms, duration
- Must include commission negotiability disclosure

---

## 14. Commission Negotiability Disclosure (UCBA Art. I, Sec. 17)

- **Required text:** "Broker commissions are not set by law and are fully negotiable"
- **Must appear in:** Listing agreement, buyer representation agreement, pre-closing documents
- If government form is used, separate conspicuous disclosure required

---

## 15. TCPA — Telephone Consumer Protection Act (47 USC 227)

- **Prior express written consent** required before any automated/prerecorded calls or texts
- Opt-out mechanism required for all marketing communications
- Do Not Call list compliance
- Maximum penalties: $500-$1,500 per violation

---

## 16. CAN-SPAM Act (15 USC 7701-7713)

- **Required for:** All commercial email
- Must include: physical postal address, opt-out mechanism, honest subject lines
- Opt-out requests must be honored within 10 business days
- Cannot use deceptive headers or misleading subject lines
- Maximum penalties: $50,120 per violation

---

## 17. WCAG 2.1 AA — Accessibility

- **Applies to:** Public-facing website (mallan.nyc)
- Required for compliance with ADA Title III and NYC accessibility laws
- Key requirements: keyboard navigation, screen reader support, color contrast 4.5:1, alt text for images, form labels
- CRM (internal tool) should also follow accessibility best practices

---

## Quick Reference — Document Checklist

### Sale Transaction

| # | Document | Legal Reference | When |
|---|----------|-----------------|------|
| 1 | Agency Disclosure (DOS-1736) | RPL 443 | First substantive contact |
| 2 | Anti-Discrimination Notice | 19 NYCRR 175.28 | First substantive contact |
| 3 | Property Condition Disclosure (DOS-1614) | RPL Art. 14 | Before contract |
| 4 | Lead-Based Paint Disclosure (pre-1978) | 42 USC 4852d | Before contract |
| 5 | Smoke/CO Detector Certification | RPL 235-b | At closing |
| 6 | Buyer Representation Agreement | UCBA Art. II | Before first showing |
| 7 | Exclusive Listing Agreement | RPL 443; UCBA Art. I | At listing |
| 8 | Commission Negotiability Disclosure | UCBA Art. I, Sec. 17 | At listing + buyer agreement + pre-closing |

### Rental Transaction

| # | Document | Legal Reference | When |
|---|----------|-----------------|------|
| 1 | Agency Disclosure (DOS-1736) | RPL 443 | First substantive contact |
| 2 | Anti-Discrimination Notice | 19 NYCRR 175.28 | First substantive contact |
| 3 | Lead-Based Paint Disclosure (pre-1978) | 42 USC 4852d | Before lease signing |
| 4 | Smoke/CO Detector Certification | RPL 235-b | At lease signing |
| 5 | Bedbug Disclosure | NYC Admin Code 27-2018.1 | Before lease signing |
| 6 | Sprinkler Disclosure | RPL 231-a | Before lease signing |
| 7 | Window Guard/Lead Notice | NYC Admin Code 27-2043.1 | Annually |
| 8 | FARE Act Fee Disclosure | LL 119/2024 | Before showing |
| 9 | Source of Income Notice | NYC HRL 8-107 | Before screening |
| 10 | Tenant Representation Agreement | UCBA Art. II | Before first showing |
| 11 | Exclusive Listing Agreement | RPL 443; UCBA Art. I | At listing |
| 12 | Commission Negotiability Disclosure | UCBA Art. I, Sec. 17 | At listing + tenant agreement |
