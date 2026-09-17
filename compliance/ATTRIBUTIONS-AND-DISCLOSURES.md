# Attributions & Disclosures

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806
> **Address:** 400 East 90th Street, Suite 17C, New York, NY 10128

---

> ### AUTHORITY (Packet 2 closure, 2026-09-06)
> **COTALITY LIVE CONTRACT** (`lib/cotality/live-contract.ts`, the dated live pulls) → provider facts: field existence, enum members.
> **REBNY / UCBA** (`lib/compliance/rebny-ucba-rules.ts`) → compliance / business rules. **MALLAN** (`lib/listings/mallan-form-contract.ts`, `lib/listings/mallan-status.ts`) → form / workflow / storage.
> **RESO = vocabulary only.** Fail closed = NON-DISPLAY. (The former "RLS overrides RESO/IDX" ordering is retired: no CSV, RESO document or hand-typed table is a field authority.)

---

## 1. IDX Listing Attribution (REQUIRED)

### Text Format

Every IDX/VOW listing displayed on mallan.nyc or any broker website MUST include:

```
Listing Courtesy of [ListOfficeName]
```

### Rules

| Rule | Source | Detail |
|------|--------|--------|
| Font size | Art. III, Sec. 2(C) | Not smaller than the median typeface on the page |
| Placement | Art. III, Sec. 2(C) | Reasonably prominent location |
| Every listing | Art. III, Sec. 2(C) | On every listing card, detail view, and report |
| Data source | RLS Field | Use `ListOfficeName` from RLS data |

### Where Attribution Must Appear

- Listing cards (gallery, grid, summary views)
- Listing detail panel / full detail page
- Print reports (Grid, Summary, Detail, Comparison, Fact Sheet, CMA)
- Email share content
- CSV/Excel exports
- Open House sign-in sheets
- Social media shares (if listing data included)

---

## 2. Statistical Data Disclaimer (REQUIRED)

### When Required

Any page, report, or feature showing aggregated or derived data from RLS:
- Market statistics (median price, average DOM, inventory counts)
- CMA (Comparative Market Analysis)
- Price trends, charts, or graphs
- Neighborhood market summaries

### Required Text

```
Based on information from the REBNY Listing Service for the period
[START DATE] through [END DATE]. The REBNY Listing Service makes no
representations or warranties with respect to the accuracy or
completeness of such information. Neither the REBNY Listing Service,
any listing participant, nor their agents or subagents shall be
responsible for its accuracy or completeness.
```

| Rule | Source |
|------|--------|
| Exact disclaimer | Art. VIII, Sec. 4 |
| Date range required | Must specify the data period |
| Cannot modify text | Use as-is |

---

## 3. Fair Housing Disclosures

### Equal Housing Opportunity

- Display the Equal Housing Opportunity logo on website footer
- Include "Equal Housing Opportunity" text
- Link to Fair Housing statement page

### Fair Housing Statement (mallan.nyc/fair-housing)

Must include:
- Federal Fair Housing Act protections
- NY State Human Rights Law protections (additional classes)
- NYC Human Rights Law Title 8 protections (additional classes)
- How to file a complaint

### Where to Display

| Location | What |
|----------|------|
| Website footer | EHO logo + link |
| Listing search results | EHO icon |
| Email signatures | EHO text |
| Print materials | EHO logo |
| Social media bios | EHO statement |

---

## 4. Commission Negotiability Disclosure

### Required Text

```
Broker commissions are not set by law and are fully negotiable.
```

### Where Required

| Document | Source |
|----------|--------|
| Exclusive Listing Agreement | UCBA Art. I, Sec. 17 |
| Buyer Representation Agreement | UCBA Art. I, Sec. 17 |
| Tenant Representation Agreement | UCBA Art. I, Sec. 17 |
| Pre-closing documents | UCBA Art. I, Sec. 17 |
| Government forms (separate disclosure) | UCBA Art. I, Sec. 17 |

---

## 5. NY DOS Advertising Attribution

### Every Advertisement Must Include

```
Mallan Real Estate Inc.
400 East 90th Street, Suite 17C, New York, NY 10128
646-258-4460
```

Or at minimum:

```
Mallan Real Estate Inc. | 646-258-4460
```

### Rules

| Rule | Source |
|------|--------|
| Brokerage name required | 19 NYCRR 175.25 |
| Address OR phone required | 19 NYCRR 175.25 |
| Agent name needs brokerage | 19 NYCRR 175.25 |
| License type if individual name | 19 NYCRR 175.25 |

### Agent Attribution Format

```
Maya Allan, Licensed Real Estate Salesperson
Mallan Real Estate Inc.
```

---

## 6. Coming Soon Badge (REQUIRED)

### Required Display Text

```
Coming Soon. No Showings or Open House until [START SHOWING DATE].
```

### Rules

| Rule | Source |
|------|--------|
| Must be prominently displayed | Art. I, Sec. 16(C) |
| Date must match First Showing Date | RLS: ActivationDate |
| Sales only | D1 |
| Frontend + CRM display | Both |

---

## 7. Data Update Timestamp

### Required on All IDX/VOW Pages

```
Listing data last updated: [TIMESTAMP]
```

| Rule | Source |
|------|--------|
| Must show data freshness | RESO IDX Rules |
| Format: date + time | Per RESO convention |

---

## 8. Required Disclosure Documents

### Sale Transactions

| # | Document | Legal Reference | When | Form |
|---|----------|-----------------|------|------|
| 1 | Agency Disclosure | RPL 443 | First substantive contact | DOS-1736 |
| 2 | Anti-Discrimination Notice | 19 NYCRR 175.28 | First substantive contact | NYS standard |
| 3 | Property Condition Disclosure | RPL Art. 14 | Before contract | DOS-1614 |
| 4 | Lead-Based Paint Disclosure | 42 USC 4852d | Before contract (pre-1978) | EPA standard |
| 5 | Smoke/CO Detector Certification | RPL 235-b | At closing | Seller cert |
| 6 | Buyer Rep Agreement | UCBA Art. II, Sec. 16 | Before first showing | Brokerage form |
| 7 | Exclusive Listing Agreement | RPL 443; UCBA Art. I, Sec. 4 | At listing | Brokerage form |
| 8 | Commission Negotiability | UCBA Art. I, Sec. 17 | Listing + buyer agreement + pre-closing | Standard text |
| 9 | Touring Agreement | NAR Settlement (Aug 2024) | Before property tours | NAR standard |

### Rental Transactions

| # | Document | Legal Reference | When | Form |
|---|----------|-----------------|------|------|
| 1 | Agency Disclosure | RPL 443 | First substantive contact | DOS-1736 |
| 2 | Anti-Discrimination Notice | 19 NYCRR 175.28 | First substantive contact | NYS standard |
| 3 | Lead-Based Paint Disclosure | 42 USC 4852d | Before lease (pre-1978) | EPA standard |
| 4 | Smoke/CO Detector Certification | RPL 235-b | At lease signing | Landlord cert |
| 5 | Bedbug Disclosure | NYC Admin Code 27-2018.1 | Before lease signing | Building form |
| 6 | Sprinkler Disclosure | RPL 231-a | Before lease signing | Standard form |
| 7 | Window Guard/Lead Notice | NYC Admin Code 27-2043.1 | Annually | Building form |
| 8 | FARE Act Fee Disclosure | LL 119/2024 | Before showing | Fee schedule |
| 9 | Source of Income Notice | NYC HRL 8-107 | Before screening | Standard notice |
| 10 | Tenant Rep Agreement | UCBA Art. II, Sec. 16 | Before first showing | Brokerage form |
| 11 | Exclusive Listing Agreement | RPL 443; UCBA Art. I, Sec. 4 | At listing | Brokerage form |
| 12 | Commission Negotiability | UCBA Art. I, Sec. 17 | Listing + tenant agreement | Standard text |
| 13 | Touring Agreement | NAR Settlement (Aug 2024) | Before property tours | NAR standard |

---

## 9. REBNY Exhibits (Required Forms)

| Exhibit | Form | When Required |
|---------|------|---------------|
| A | Mandatory Listing Fields Checklist | Every listing |
| B | Owner Opt-Out Form | When owner opts out of RLS |
| C | Listing Data Compliance Policy | Governs data violation procedures |
| D | RUNDBA (New Dev Brokerage Agreement) | New development listings |
| E | Change of New Dev Brokerage/Sales Office | Changing new dev broker |
| F | RLS Appeals Process | Appealing violations/fines |
| G | Coming Soon Owner Authorization | Before Coming Soon status |

---

## 10. Protected Period Notice

### When

Within 7 business days after listing expiration (Art. II, Sec. 13)

### Content

Exclusive Broker delivers up to 6 buyer/tenant names to Owner. If any named party executes a contract within 90 days, Exclusive Broker is entitled to compensation.

### Requirements

- Written notice to Owner
- Maximum 6 names
- 90-day tracking window
- Owner must notify any new Exclusive Broker of the protected period
