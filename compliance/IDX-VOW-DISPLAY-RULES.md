# IDX & VOW Display Rules

> **Feed:** REBNY RLS via Trestle (Cotality) | **LMP:** Direct (mallan.nyc)
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY RLS rules + RLS fields** — **RLS TRUMPS ALL.**
> 3. **RLS overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## Feed Types

| Feed | Purpose | Audience | Auth Required? |
|------|---------|----------|----------------|
| **RLS** | Core REBNY listing database | Authorized Participants only | Yes — RLS credentials |
| **IDX** | Reciprocal broker display on websites | Public (mallan.nyc search) | No |
| **VOW** | Consumer-facing with extra data | Client portal (requires login) | Yes — consumer registration |
| **Syndication** | Distribution to third-party portals | Public via portal | No |

---

## 6 Distribution Gates

Every listing must pass through ALL 6 gates before appearing on any public channel. Gates are evaluated in order.

### Gate 1: Owner Opt-Out

| Field | `Permissions = Owner Opt-Out` |
|-------|------|
| Source | Art. I, Sec. 5(A); Exhibit B |
| Effect | **ALL fields blocked from ALL channels.** No RLS, no IDX, no VOW, no Syndication, no public. |
| Exception | 1:1 personal phone calls and emails to Participants only. |
| Form Required | Exhibit B — submitted through LMP within 48 hours. |
| Violation | Incurable — $250 first, $500 subsequent (M7-M8). |

### Gate 2: Participant Only

| Field | `Permissions = Private (Participant Only)` |
|-------|------|
| Source | UCBA Definition (W) |
| Effect | **All fields to RLS only.** No IDX, VOW, Syndication, websites, social media. |
| Constraint | Cannot combine with Owner Opt-Out. One or the other. |
| DOM | Does NOT accrue (A4). |
| Violation | Incurable — $250 first, $500 subsequent (M7-M8). |

### Gate 3: IDX Display

| Field | `IDXEntireListingDisplayYN` |
|-------|------|
| Source | Art. III, Sec. 2(C) |
| Default | **True** (LMPs must default to True) |
| True | All public-eligible fields flow to IDX broker websites. Attribution required. |
| False | Excluded from all IDX. Remains on RLS. |
| Dependency | Also requires `ListOfficeIDXParticipationYN = True` (system-managed). |

### Gate 4: Syndication

| Field | `SyndicateYN` |
|-------|------|
| Source | UCBA General |
| Default | **True** (LMPs must default to True) |
| True | All public-eligible fields flow to opted-in third-party portals. |
| False | Excluded from all syndication. Remains on RLS. |
| Independent | Can be True while IDX is False, and vice versa. |

### Gate 5: Coming Soon Status

| Field | `MlsStatus = ComingSoon` |
|-------|------|
| Source | Art. I, Sec. 16 |
| Effect | Fields flow to RLS + display channels. Open Houses DISABLED. Showings RESTRICTED. |
| Badge Required | "Coming Soon. No Showings or Open House until [Start Showing Date]" |
| Duration | Maximum 14 calendar days from RLS submission. |
| Sales Only | NOT rentals, NOT new developments. |

### Gate 6: Closed Status

| Field | `MlsStatus = Closed` |
|-------|------|
| Source | Art. I, Sec. 6-7 |
| Effect | Closing Price + Closed Date REQUIRED within 24hrs. Buyer Agent populated. |
| Website | Must remove or clearly mark as closed within 24 hours. |

---

## InternetEntireListingDisplayYN Cascade

When `InternetEntireListingDisplayYN = False`, these fields AUTO-CASCADE to False:

| Field | Cascaded Value |
|-------|---------------|
| `IDXEntireListingDisplayYN` | False |
| `InternetAddressDisplayYN` | False |
| `InternetAutomatedValuationDisplayYN` | False |
| `InternetConsumerCommentYN` | False |
| Listing alerts/auto-sharing | Disabled for non-exclusive agents |

**FARE Act:** When landlord does NOT pay broker fee, `InternetEntireListingDisplayYN = False` — triggers full cascade above.

---

## Display Control Flags (7 Total)

| # | RLS Field | Required | Default | Effect When False |
|---|-----------|----------|---------|-------------------|
| 1 | `InternetEntireListingDisplayYN` | **REQ** | True | Master switch — cascades all below to False |
| 2 | `IDXEntireListingDisplayYN` | **REQ** | True | Excluded from IDX broker websites |
| 3 | `InternetAddressDisplayYN` | **REQ** | True | **Address MUST be suppressed.** Violation if displayed. |
| 4 | `InternetAutomatedValuationDisplayYN` | **REQ** | True | AVM (Zestimate-style) display disabled |
| 5 | `InternetConsumerCommentYN` | **REQ** | True | Consumer comments/blogs disabled |
| 6 | `SyndicateYN` | **REQ** | True | Excluded from syndication portals |
| 7 | `ListOfficeIDXParticipationYN` | SYS | -- | System-managed from REBNY membership |

---

## IDX Display Rules

### What MUST Appear on IDX Listings

| Requirement | Source | Implementation |
|-------------|--------|----------------|
| Listing broker attribution | Art. III, Sec. 2(C) | "Listing Courtesy of [ListOfficeName]" — font not smaller than median |
| Data timestamp | RESO IDX Rules | "Last updated: [date/time]" |
| Fair Housing logo/link | Federal + NYC HRL | Equal Housing Opportunity icon |
| Commission negotiability | Art. I, Sec. 17 | Disclosure accessible from listing |

### What MUST NOT Appear on IDX Listings

| Prohibited | Source | Rule |
|------------|--------|------|
| Agent info in description/photos | Art. I, Sec. 5(C) | Agent info ONLY in agent fields |
| "Off-Market" language | Art. I, Sec. 5(D) | Block in all text |
| Compensation amounts | Art. IV, Sec. 2 | No commission/fee fields displayed |
| Seller/buyer identity | Art. III, Sec. 2 | Hidden until status = Closed |
| Owner Opt-Out listings | Art. I, Sec. 5(A) | Never display |
| Participant Only listings | Definition (W) | Never display publicly |
| `ExpirationDate` | Exhibit A | HIDDEN — never display |
| `ShowingInstructions` | Exhibit A | Agent-only field |
| `PrivateRemarks` | Exhibit A | Agent-only field |
| `PropertyCondition` | Exhibit A | Agent-only — with disclaimer if shown to agents |

### Address Suppression

When `InternetAddressDisplayYN = False`:
- **Hide:** Street number, street name, unit number, full address
- **Show:** Neighborhood, borough, zip code (general location)
- **Must check:** Detail panel, listing cards, report outputs, map pins, share links
- **Violation:** Displaying suppressed address = UCBA violation

---

## VOW Display Rules

VOW (Virtual Office Website) provides more data than IDX but requires consumer registration.

### VOW vs IDX Differences

| Feature | IDX | VOW |
|---------|-----|-----|
| Authentication | None | Consumer login required |
| Data scope | Public marketing fields | Extended fields (sold data, DOM, etc.) |
| Address display | Follows `InternetAddressDisplayYN` | Same |
| Agent info fields | Public fields only | Extended agent info |
| Sold/closed data | Limited | Full historical access |
| Search | Basic property search | Advanced, saved searches |

### VOW Requirements

| Requirement | Implementation |
|-------------|----------------|
| Consumer registration | Email + name minimum; must agree to terms |
| Terms of use | Must include data use restrictions |
| No scraping notice | Prohibit automated data collection |
| Attribution | Same as IDX — "Listing Courtesy of [Broker]" |
| Opt-out respect | Same gate logic as IDX — all 6 gates apply |

### VOW-Only Fields (Not in IDX)

| Field | Notes |
|-------|-------|
| Historical sold/rented data | ClosePrice, CloseDate after Closed status |
| Cumulative DOM | Full history |
| Extended agent info | Additional contact details |
| Property condition (with disclaimer) | Agent-view disclaimer still required |

---

## Syndication Rules

### Active Syndication Portals (via Trestle)

| Portal | Cost | Status |
|--------|------|--------|
| openigloo | Free | Opted IN |
| Samaki.com | Free | Opted IN |
| TBI Listings | Free | Opted IN |

### Direct Data Licensees (NOT via RLS)

| Portal | Method | Cost |
|--------|--------|------|
| StreetEasy | Direct upload | Sales free, rentals $7+/day |
| Realtor.com | Auto from REBNY | Free |
| Redfin | Auto from REBNY | Free |
| Homes.com | Auto from REBNY | Free |
| RentHop | Auto from REBNY | Free |
| RealtyHop | Auto from REBNY | Free |

### Syndication Requirements

- `SyndicateYN = True` for portal distribution
- All 6 gates must pass
- Attribution required on all syndicated displays
- Data update frequency per portal agreement

---

## Off-Market Photo Rules (Feb 2025)

When a listing goes off-market:
- **Only the primary photo** remains in IDX/VOW feeds
- All other photos removed from public display
- Photos remain in RLS for Participant access

---

## Implementation Checklist

- [ ] Gate 1: Filter Owner Opt-Out from all public queries
- [ ] Gate 2: Filter Participant Only from all public queries
- [ ] Gate 3: Check `IDXEntireListingDisplayYN` before IDX display
- [ ] Gate 4: Check `SyndicateYN` before syndication
- [ ] Gate 5: Coming Soon badge on all Coming Soon listings
- [ ] Gate 6: Closed listings removed/marked within 24hrs
- [ ] Address suppression when `InternetAddressDisplayYN = False`
- [ ] Attribution on every IDX/VOW listing card
- [ ] No agent info in descriptions/photos
- [ ] No compensation amounts displayed
- [ ] No "Off-Market" language anywhere
- [ ] Statistical data disclaimer on any derived market stats
- [ ] VOW login gate for extended data
- [ ] Off-market: only primary photo in IDX/VOW
