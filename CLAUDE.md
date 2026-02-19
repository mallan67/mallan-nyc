# CLAUDE.md - Project Instructions for Claude Code

## Project: mallan-nyc

> **Compliance-First · Fast · Scalable**

| | |
|---|---|
| **Status** | Active Development |
| **Stage** | **MOCKUP / PROTOTYPE** |
| **Type** | **Backend CRM** (internal broker/agent tool, NOT public-facing) |
| **Jurisdiction** | New York State / NYC |
| **License Holder** | Mallan Real Estate Inc. |
| **Brokerage License** | #10991205323 (Mallan Real Estate Inc. - company) |
| **Agent License** | #10311201806 (Maya Allan - individual REBNY license) |
| **Phone** | 646-258-4460 |
| **Address** | 400 East 90th Street, Suite 17C, New York, NY 10128 |

### Portal Access Levels

The backend CRM supports multiple login types, each with different access levels:

| Portal | User Type | Access Level |
|--------|-----------|-------------|
| **Broker** | Brokerage owner/principal broker (Maya Allan) | Full admin access - all features, agent management, compliance, approvals |
| **Agent** | Licensed agents under the brokerage | Listings, clients, searches, pipeline - no admin/compliance |
| **Buyer** | Buyer clients | View listings, saved searches, feedback, documents |
| **Seller** | Seller clients | View their listing performance, offers, showing feedback |
| **Renter** | Renter clients | View rental listings, saved searches, applications |
| **Landlord** | Landlord/property owner clients | View rental performance, tenant info, financials |

---

## ⚠️ THIS IS A MOCKUP ONLY

> **THIS IS ONLY A MOCKUP/PROTOTYPE. NOT PRODUCTION CODE.**
>
> **Architecture:**
> - **THIS FILE = BACKEND CRM** (internal broker/agent/client tool)
> - **SEPARATE FRONT END exists** (public-facing website) - NOT in this file
> - The backend CRM will connect to the front end when both are complete
>
> **Do NOT:**
> - Treat this as a production application
> - Begin backend/API development until the mockup is complete and approved
> - Confuse this backend CRM with the public-facing front end
> - Make changes outside the mockup file unless explicitly asked

### Current Focus
- Complete all UI components in HTML/Tailwind CSS
- Ensure all interactions work (toggles, collapsibles, calculations)
- Test responsive design across all breakpoints
- Validate against compliance requirements
- Fix all errors identified in evaluation before moving to production

---

## 🚨 CRITICAL: MLS/IDX DATA COMPLIANCE

This project handles **licensed MLS/IDX data from REBNY RLS via Trestle/CoreLogic**.

### ❌ PROHIBITED (Violations = $40,000 damages + suspension)
- Client-side calls to MLS/IDX APIs
- Public/unsecured JSON endpoints with MLS data
- Scraping, bulk export, redistribution
- Using MLS data for AI training, embeddings, or vector databases
- Exposing credentials in frontend code
- Displaying listings where `IDXEntireListingDisplayYN = False`
- Showing addresses where `InternetAddressDisplayYN = False`
- Displaying Owner Opt-Out or Participant Only listings publicly
- Using "Off-Market" language in any listing description
- Including agent info (name, contact, URL) in property descriptions
- Including compensation/broker fees in property descriptions or comments
- Displaying compensation amounts on any listing

### ✅ REQUIRED
- Server-side only MLS data access
- REBNY RLS attribution on all IDX/VOW displayed listings
- Update timestamps on displayed data
- Fair Housing compliant language (Federal, NY State, NYC Human Rights Law)
- Audit logging for data access
- Statistical data disclaimer: "Based on information from the REBNY Listing Service for the period [date] through [date]..."
- Coming Soon badge: "Coming Soon. No Showings or Open House until [date]"
- Remove/mark closed listings within 24 hours
- Commission negotiability disclosure in listing/buyer agreements

---

## Compliance Requirements

All code and technical work must comply with:

1. **RESO Standards** - Real Estate Standards Organization data standards
2. **REBNY RLS Rules / UCBA 2026** - Universal Co-Brokerage Agreement (January 2026 revision)
3. **NY DOS Advertising Laws** - New York State real estate advertising regulations (19 N.Y.C.R.R. § 175.25)
4. **Fair Housing Act + NYC Human Rights Law Title 8** - No discriminatory language or filtering
5. **TCPA/CTIA** - Telephone Consumer Protection Act (lead capture/SMS)
6. **CAN-SPAM Act** - Email marketing compliance
7. **NY SHIELD Act** - Data security requirements
8. **WCAG 2.1 AA** - Accessibility standards

### UCBA 2026 Key Rules (Enforced by REBNY)

| Rule | Penalty |
|------|---------|
| Fair Housing violation | $250 first, $500 + RLS termination second |
| Data quality violation | $0/$250/$250/termination (escalating) |
| Incurable violation (e.g., advertising opted-out property) | $250 first, $500 subsequent |
| General UCBA violation | $500/$2K/$10K/suspension |
| Quarterly >5% rejection rate | **$10,000 fine** |
| 3 quarterly fines in a year | **30-day RLS suspension** |

---

## Responsive Design Requirements

All changes must be fully responsive and tested across:

- **Desktop** - All screen sizes (1920px+, 1440px, 1280px, 1024px)
- **Laptops** - Standard laptop displays (1366px, 1536px)
- **Tablets** - iPad, Android tablets, and all other tablet devices (768px - 1024px)
- **Mobile** - All mobile devices including iPhone, Android phones (320px - 767px)

Every UI change should work seamlessly across all screen sizes and device types.

---

## Key Project Files

| File | Purpose |
|------|---------|
| `MALLAN-NYC-CRM-PROJECT.md` | Master project document (single source of truth) |
| `CRM-ENHANCEMENT-SPEC.md` | Detailed enhancement specifications |
| `data/rebny-rls-property-fields.csv` | All 448 REBNY RLS property fields |
| `data/rebny-rls-property-lookup.csv` | All 2,066 picklist values |
| `data/UCBA-2026-Requirements.md` | UCBA 2026 rules extracted (56 pages) — all compliance requirements |
| `data/RLS-Syndication-Research.md` | RLS feed types, syndication portals, costs, pre-licensed providers |
| `Desktop/1/Old/search-modular/MALLAN-NYC-CRM-FINAL2.html` | Main CRM backend mockup file (5-tab layout, Tailwind v4 compiled build) |

---

## Data Source & RLS Feed

- **Primary Feed:** REBNY RLS via Trestle (CoreLogic) — migrated Feb 2025 from Perchwell
- **LMP:** RealPlus
- **Total Fields:** 448 Property fields
- **Picklist Values:** 2,066 lookup values
- **Data Dictionary:** `Desktop/mallan nyc web/Trestle fields/Data_Migration_2025_RLS_Data_Rules.xlsx`
- **UCBA Rules:** `data/UCBA-2026-Requirements.md` (extracted from 56-page PDF)

### Feed Types

| Feed | Purpose | For |
|------|---------|-----|
| **RLS** | Core REBNY listing database | Authorized Participants only |
| **IDX** | Reciprocal broker display on websites | Public (mallan.nyc listing search) |
| **VOW** | Consumer-facing with extra data | Client portal (requires login) |
| **Syndication** | Distribution to third-party portals | 3 Trestle opt-in portals |

### Syndication & Distribution

| Portal | Cost | Method |
|--------|------|--------|
| StreetEasy | Sales: FREE / Rentals: $7+/day | Direct upload (NOT via RLS) |
| Zillow / Trulia | FREE | Auto from StreetEasy |
| Realtor.com, Redfin, Homes.com, RentHop | FREE | Direct data license from REBNY (automatic) |
| openigloo, Samaki.com, TBI Listings | FREE | Trestle IDX Plus opt-in toggles (all ON) |

### Direct Data License (mallan.nyc)
- Applying for Direct Data License to pull RLS data into mallan.nyc (like Compass)
- Contact: rlssupport@rebny.com / 212-616-5270
- Need both IDX feed (public search) and VOW feed (client portal)

---

## UI/UX Standards

### Color Scheme
- **Luxury Gold:** #B8860B (accent for premium features)
- **Status Colors:** Blue (Active), Orange (Offer), Purple (Contract), Green (Sold), Gray (Off Market)

### Typography
- Labels: `text-xs font-semibold text-gray-700`
- Inputs: `text-sm font-medium`
- Section headers: `text-sm font-bold text-gray-700`

### Component Patterns
- Collapsible sections with +/- icons
- Status boxes with expandable sub-items
- Datalist inputs for custom + suggested values
- Calculator boxes with colored backgrounds

---

## REBNY RLS Pre-Licensed Providers

| Category | Count | Names |
|----------|-------|-------|
| **Direct Network Portal** | 3 | openigloo, Samaki.com, TBI Listings |
| **VOW** | 3 | Lofty, OLR, Zenlist |
| **LMP** | 8 | BrokersNYC, Leadkit, Lofty, OLR, Perchwell, **RealPlus (ours)**, RealtyMX, RESoft |
| **IDX** | 30 | blankslate, blueroof360, BoomTown, CINC, Constellation RE, Home ASAP, HomeJunction, IDX (Elm Street), iHomefinder, kvCORE, Leadkit, Lofty, Luxury Presence, MoxiWorks, OLR, propertybase, PropMiX, RE Webmasters, RealGeeks, RealPlus, RealtyMX, Realtyna, RealtyWatch, RESoft, Sierra Interactive, Smarter Agent, The House Club, TREM Group, Xome, Ylopo |
| **Product** | 10 | BoldTrail, brokerloop, Core Present, Espresso Agent, Haystack, LiveBy, Nancy Packes, PerryStory, UrbanDigs, Vulcan7 |

**Not on lists (own data licenses):** Realtor.com, Redfin, Homes.com, Zillow/StreetEasy, RentHop, Compass

---

## GitHub & Vercel

All deployments and CI/CD workflows must maintain compliance with the above standards.

---

## Reference

- `MALLAN-NYC-CRM-PROJECT.md` — Master project document
- `data/UCBA-2026-Requirements.md` — UCBA 2026 compliance rules (extracted from PDF)
- `data/RLS-Syndication-Research.md` — Feed types, syndication, costs, providers
- `data/rebny-rls-property-fields.csv` — All 448 REBNY RLS fields
- `data/rebny-rls-property-lookup.csv` — All 2,066 picklist values
