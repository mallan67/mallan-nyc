# CRM & Messaging Compliance

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. TCPA — Telephone Consumer Protection Act (47 USC 227)

### Requirements

| Rule | Requirement |
|------|-------------|
| Prior express written consent | Required before ANY automated/prerecorded calls or texts |
| Opt-out mechanism | Every message must include opt-out instructions |
| Do Not Call list | Check Federal and State DNC lists before calling |
| Time restrictions | No calls before 8am or after 9pm (recipient's time zone) |
| Caller ID | Must transmit accurate caller ID |
| Record keeping | Maintain consent records for 5 years |

### CRM Implementation

- Lead capture forms MUST include TCPA consent checkbox
- Consent text: "By providing your phone number, you consent to receive calls and texts from Mallan Real Estate Inc. regarding real estate services. Message and data rates may apply. Reply STOP to opt out."
- Store: consent timestamp, source (form/phone/in-person), IP address
- Honor opt-outs within 30 days (10 business days recommended)
- Maintain suppression list

### Penalties

- $500 per violation (negligent)
- $1,500 per violation (willful/knowing)
- Class action liability

---

## 2. CAN-SPAM Act (15 USC 7701-7713)

### Requirements for All Commercial Email

| Rule | Requirement |
|------|-------------|
| Accurate "From" | Must identify sender accurately |
| Honest subject lines | Cannot be misleading or deceptive |
| Identify as ad | If commercial, must be identifiable as advertisement |
| Physical address | Must include valid postal address |
| Opt-out mechanism | Clear, conspicuous unsubscribe option |
| Honor opt-outs | Within 10 business days |
| No harvested addresses | Cannot use scraped/purchased lists without consent |

### CRM Implementation

Every marketing email MUST include:

```
Mallan Real Estate Inc.
400 East 90th Street, Suite 17C, New York, NY 10128
646-258-4460

To unsubscribe from future emails, click here: [UNSUBSCRIBE_LINK]
```

### Email Templates — Compliance Checklist

- [ ] From address: maya@mallan.nyc or similar branded domain
- [ ] Subject line: accurate, not misleading
- [ ] Physical address in footer
- [ ] Unsubscribe link in footer
- [ ] No listing content that violates Fair Housing
- [ ] No compensation amounts in listing emails
- [ ] No agent info in listing description sections
- [ ] IDX attribution if sharing another broker's listing

### Penalties

- Up to $50,120 per violation
- FTC enforcement

---

## 3. Fair Housing in Communications

### All Outbound Communications

Every email, text, social media post, flyer, or marketing material must comply with:

| Law | Protected Classes |
|-----|-------------------|
| Federal FHA | Race, Color, National Origin, Religion, Sex, Familial Status, Disability |
| NY State HRL | + Age, Marital Status, Military Status, Sexual Orientation, Gender Identity |
| NYC HRL Title 8 | + Lawful Occupation, Source of Income, Immigration, Caregiver, Partnership, Alienage |
| Fair Chance Housing | Criminal history (NYC LL 24/2023) |

### Prohibited in Any Communication

- Discriminatory language or preferences
- Steering (directing clients to/from neighborhoods based on protected class)
- Selective marketing (sending listings only to certain demographics)
- "No vouchers", "employed only", "no children", etc.

### Scanning Required

- Run Fair Housing scanner on all mass email content before send
- Run on social media post drafts
- Run on listing descriptions in email shares

---

## 4. Listing Description in Communications

### When Sharing Listings via Email/Text/Social

| Allowed | Prohibited |
|---------|------------|
| Property address (if InternetAddressDisplayYN = True) | Agent info in description |
| Price, beds, baths, sq ft | "Off-Market" language |
| Public remarks (scanned) | Compensation amounts |
| Photos (not containing agent info) | Seller/buyer identity (until Closed) |
| Listing courtesy attribution | Confidential fields (ExpirationDate, etc.) |

### Attribution in Shared Listings

Every listing shared in email/text MUST include:
```
Listing Courtesy of [ListOfficeName]
```

---

## 5. Client Data Handling

### NY SHIELD Act Requirements in CRM

| Requirement | Implementation |
|-------------|----------------|
| Access controls | Role-based permissions per portal type |
| Encryption | TLS for transit, encrypted at rest |
| Minimum data | Collect only what's necessary |
| Secure disposal | Purge client data per retention policy |
| Employee training | Train agents on data handling |

### Client PII in CRM

| Data | Storage | Access |
|------|---------|--------|
| Client name | Encrypted | Agent + Broker |
| Phone number | Encrypted | Agent + Broker |
| Email | Encrypted | Agent + Broker |
| SSN (if collected) | **Never store in CRM** | Separate secure system only |
| Financial info | Encrypted, limited retention | Agent + Broker |
| Showing history | Standard | Agent + Broker |
| Search preferences | Standard | Agent + Broker |

---

## 6. Mass Marketing Rules

### Cannot Mass-Market Another Broker's Listing

- F3: "Cannot conduct mass solicitations promoting another broker's listing"
- Mass email blasts featuring non-own listings require written consent from Exclusive Broker
- Exception: IDX/VOW display on website is authorized

### "Free Services" Claims

- F13: Cannot claim services are free/no cost unless no compensation from any source
- Review all marketing copy for "free", "no cost", "complimentary" claims

---

## 7. Social Media Compliance

### Every Real Estate Post Must Include

- Brokerage name: "Mallan Real Estate Inc."
- Agent title: "Licensed Real Estate Salesperson" (if individual name used)
- Fair Housing: Equal Housing Opportunity reference

### Prohibited Content

- Listing descriptions with agent info
- "Off-Market" or "pocket listing" references
- Compensation/commission amounts
- Seller/buyer identity (until Closed)
- Discriminatory language or targeting

---

## 8. Auto-Alerts & Drip Campaigns

### FARE Act Impact on Rental Alerts

When `InternetEntireListingDisplayYN = False`:
- Listing MUST NOT appear in automated consumer alerts
- MUST NOT appear in saved search results
- MUST NOT be included in drip campaigns

### Opt-Out Listings in Alerts

- Owner Opt-Out listings: NEVER in any automated communication
- Participant Only listings: NEVER in consumer-facing alerts (agent alerts OK)

### Coming Soon in Alerts

- May appear in alerts WITH required badge
- No "Schedule Showing" CTA during Coming Soon period
