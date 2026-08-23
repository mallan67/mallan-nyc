# Frontend Compliance — Public Website Rules

> **Website:** mallan.nyc | **Platform:** Next.js 14 / Vercel
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. Listing Display — Gate Filtering

Before ANY listing appears on mallan.nyc, it MUST pass ALL 6 distribution gates:

```
Listing Query → Gate 1 (Owner Opt-Out?) → Gate 2 (Participant Only?)
  → Gate 3 (IDX Display?) → Gate 4 (Syndication?) → Gate 5 (Coming Soon?)
  → Gate 6 (Closed?) → DISPLAY
```

### Server-Side Filtering (REQUIRED)

| Gate | Filter | Implementation |
|------|--------|----------------|
| Gate 1 | Exclude `Permissions = Owner Opt-Out` | WHERE clause |
| Gate 2 | Exclude `Permissions = Participant Only` | WHERE clause |
| Gate 3 | Require `InternetEntireListingDisplayYN = True` *(no separate IDX field on Trestle)* | WHERE clause |
| Gate 5 | Coming Soon: add badge, disable showings | Conditional render |
| Gate 6 | Closed: remove or mark within 24hrs | Cron/webhook |

**FAIL CLOSED:** If any gate field is null/undefined, treat as `False` and exclude from display.

---

## 2. Address Suppression

When `InternetAddressDisplayYN = False`:

### MUST Hide

- Street number
- Street name
- Unit number
- Full parsed address
- Map pin at exact location
- Detail panel header address
- Report addresses (all formats)
- Share link previews with address
- Social media card addresses

### MAY Show

- Neighborhood name
- Borough
- Zip code
- General area description

### Implementation Pattern

```javascript
function displayAddress(listing) {
  if (listing.InternetAddressDisplayYN === false) {
    return listing.SubdivisionName + ', ' + listing.CityRegion;
  }
  return listing.UnParsedAddress;
}
```

**Never use `undefined` — explicitly check for `false`. Fail closed.**

---

## 3. Required Attributions on Every Page

### Listing Cards / Search Results

```
Listing Courtesy of [ListOfficeName]
```
- Font: not smaller than median typeface on the page
- Placement: visible without scrolling on the card

### Detail Pages

```
Listing Courtesy of [ListOfficeName]
Listing data last updated: [ModificationTimestamp]
```

### Footer (Every Page)

```
Equal Housing Opportunity
Mallan Real Estate Inc. | 400 E 90th St, Suite 17C, NYC 10128 | 646-258-4460
Licensed Real Estate Broker | #10991205323
```

### Market Statistics Pages

```
Based on information from the REBNY Listing Service for the period
[START] through [END]. The REBNY Listing Service makes no representations
or warranties with respect to the accuracy or completeness of such
information...
```

---

## 4. Fair Housing Language Compliance

### Prohibited Words/Phrases (Automated Scanner Required)

**Federal FHA + NYC HRL Protected Classes:**

| Category | Prohibited Examples |
|----------|-------------------|
| Race/Color | "white neighborhood", "diverse area", racial slurs |
| Religion | "near church", "Christian community", "kosher kitchen" (context-dependent) |
| National Origin | "English-speaking", "American only" |
| Familial Status | "no children", "adult community" (unless legal 55+), "perfect for couples" |
| Disability | "no wheelchairs", "must be able to climb stairs" |
| Sex/Gender | "bachelor pad", "man cave" (flagged) |
| Source of Income | "no vouchers", "no Section 8", "employed only" |
| Criminal History | "background check required", "no felons", "criminal record" |
| Marital Status | "married couples only", "single professionals" |

### Scanner Implementation

- Run on ALL text fields before display and before RLS submission
- Pattern-match against prohibited word list
- Flag for human review (not auto-reject for edge cases)
- Log all scan results for audit trail

---

## 5. Coming Soon Badge

When `MlsStatus = ComingSoon`:

### Required Badge

```
Coming Soon
No Showings or Open House until [ActivationDate]
```

### Rules

- Prominently displayed on listing card and detail page
- Date formatted as readable date (e.g., "March 15, 2026")
- No "Schedule Showing" or "Request Tour" buttons during Coming Soon
- No Open House information displayed

---

## 6. Closed/Sold Listings

### 24-Hour Removal SLA

When `MlsStatus = Closed`:
- Remove from active search results within 24 hours
- OR clearly mark as "Sold" / "Rented" with sold badge
- Show `ClosePrice` if available
- Show `CloseDate`

### Off-Market Photo Rules

When listing goes off-market:
- Only primary photo remains in IDX/VOW display
- All other photos removed from public view

---

## 7. No MLS Data on Client-Side

### Prohibited

- Client-side API calls to MLS/Trestle endpoints
- MLS credentials in frontend JavaScript
- Public/unsecured JSON endpoints returning MLS data
- LocalStorage/SessionStorage with bulk MLS data
- Embedding API keys in client bundle

### Required

- All MLS data fetched server-side only
- API routes with authentication
- Server components for listing data
- Rate limiting on all data endpoints

---

## 8. Fields That MUST NOT Appear on Frontend

| Field | Reason |
|-------|--------|
| `ExpirationDate` | HIDDEN — confidential |
| `ShowingInstructions` | Agent-only (AGT distribution) |
| `PrivateRemarks` | Agent-only (AGT distribution) |
| `PropertyCondition` | Agent-only (with disclaimer if shown to agents) |
| `ListingContractDate` | HIDDEN |
| Seller/Buyer name/identity | Hidden until Closed (F4, H12) |
| Compensation/commission fields | REMOVED from RLS (Aug 2025) |
| `BuyerAgentCompensation` | Prohibited (NAR Settlement) |
| `SubAgencyCompensation` | Prohibited (NAR Settlement) |

---

## 9. Content Restrictions — Frontend Text

The frontend must NEVER display:

| Prohibited | Source |
|------------|--------|
| "Off-Market" language | Art. I, Sec. 5(D) |
| Agent info in descriptions | Art. I, Sec. 5(C) |
| Compensation amounts | Art. IV, Sec. 2 |
| "Free services" claims | Art. III, Sec. 5 |
| Seller/buyer identity (until Closed) | Art. III, Sec. 2 |

---

## 10. Accessibility (WCAG 2.1 AA)

| Requirement | Standard |
|-------------|----------|
| Color contrast | 4.5:1 minimum for normal text |
| Keyboard navigation | All interactive elements reachable via keyboard |
| Screen reader support | Semantic HTML, ARIA labels, alt text |
| Form labels | Every input has associated label |
| Focus indicators | Visible focus ring on all focusable elements |
| Responsive design | Functional at 320px to 1920px+ |
| Skip navigation | Skip-to-content link |
| Error messaging | Clear, specific error messages associated with fields |

---

## 11. SEO & Meta Compliance

### Listing Pages

- Title: `[Address] - [PropertySubType] for [Sale/Rent] | Mallan Real Estate`
- Description: First 160 chars of `PublicRemarks` (scanned for compliance)
- Open Graph image: Primary listing photo
- No `ExpirationDate` or confidential fields in meta tags
- `noindex` on Participant Only listings (should not be indexed)
- `noindex` on Closed listings older than 90 days

### Address in URL/Meta

- Respect `InternetAddressDisplayYN` — do not include address in URL slug or meta if suppressed
- Use listing ID instead: `/listing/RLS1234567`

---

## 12. Security Headers

Configured in `vercel.json`:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | Restrict sources | Prevent XSS |
| Permissions-Policy | Restrict APIs | Limit browser features |
| Cross-Origin-Opener-Policy | same-origin | Isolate browsing context |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer data |

---

## Implementation Checklist

- [ ] All 6 distribution gates enforced server-side
- [ ] Address suppression on all display surfaces
- [ ] IDX attribution on every listing card and detail view
- [ ] Coming Soon badge with correct date
- [ ] Closed listings removed/marked within 24hrs
- [ ] No MLS data in client-side JavaScript
- [ ] Prohibited fields never rendered on frontend
- [ ] Fair Housing scanner on all user-facing text
- [ ] Content restrictions enforced (no off-market, no agent info, no compensation)
- [ ] WCAG 2.1 AA compliance
- [ ] Statistical data disclaimer on derived stats
- [ ] Footer: EHO logo, brokerage info, license number
- [ ] Security headers configured
- [ ] Meta tags respect address suppression
