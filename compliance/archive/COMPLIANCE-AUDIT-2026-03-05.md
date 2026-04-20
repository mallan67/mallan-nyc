# REBNY / RLS / UCBA / Trestle — Comprehensive Compliance Audit Report

> **Date:** 2026-03-05 (VERIFIED — 2 full audit passes + manual source verification)
> **Site:** mallan.nyc (LIVE PRODUCTION)
> **Auditor:** Claude Opus 4.6 — 11 parallel audit agents + manual source verification of every finding
> **Scope:** All public pages, API routes, compliance libraries, field mapping, DTO enforcement, content scanning, distribution gates, auth, schema, FAQ structured data, calculators, navigation, Prisma schema, middleware, cron jobs
> **Mode:** REPORT ONLY — no fixes applied
> **Authority:** RLS TRUMPS ALL (UCBA > RLS > RESO/IDX > Internal > Fail Closed)

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **BLOCKER** | 5 | Must fix before REBNY audit — incurable violations or hard compliance failures |
| **HIGH** | 17 | Significant compliance gaps — could trigger fines or data quality violations |
| **MEDIUM** | 16 | Incomplete enforcement or edge cases — should be addressed |
| **LOW** | 14 | Informational, hardening, or cosmetic issues |
| **PASS** | 22 | Correctly implemented (documented for audit trail) |
| **TOTAL** | **74** | |

---

## BLOCKER FINDINGS (5) — Fix Before REBNY Audit

### B-1: "Pocket Listing" + "Pre-Launch" language on public homepage
- **File:** `app/components/ExclusivesVault.tsx` lines 54, 92-94
- **Rule:** UCBA Art. I, Sec. 5(D) — No "Off-Market" language (INCURABLE violation: $250 first, $500 subsequent)
- **Issue:** Three prohibited terms on the public homepage:
  - Line 54: `"Pre-launch opportunities and pocket listings for registered clients only."`
  - Line 92: `tag: 'Pocket Listing'` rendered as a visible gold badge
  - Line 93: `tag: 'Pre-Launch'` rendered as a visible gold badge
- **Risk:** Incurable violation — no cure period, immediate fine per occurrence

### B-2: Coming Soon badge missing required REBNY text (3 locations)
- **Files:**
  - `app/search/page.tsx` lines 30-34
  - `app/components/PropertySearch.tsx` lines 23-27
  - `app/listing/[id]/page.tsx` lines 265-269
- **Rule:** UCBA Art. I, Sec. 16(C) / H7 / D7
- **Required text:** "Coming Soon. No Showings or Open House until [Start Showing Date]"
- **Actual text:** Just "Coming Soon" — no date, no restriction text
- **Note:** `LiveListingsWidget.tsx:152` has the correct implementation — use as reference
- **Root cause:** `PublicListingDTO` does not include `ActivationDate` / `OnMarketDate`, so the date is unavailable in the pipeline. `mapping.ts` line 341 DOES map `activationDate` to IDXListing — the gap is in `public-dto.ts` which doesn't pass it through.

### B-3: `owner_opt_out` incorrectly derived in Trestle mapper
- **File:** `lib/idx/trestle-mapper.ts` line 574
- **Rule:** UCBA Art. I, Sec. 5(A) — Owner Opt-Out (INCURABLE violation)
- **Issue:** `ownerOptOut = raw.IDXEntireListingDisplayYN === false` conflates two distinct REBNY concepts:
  - **Owner Opt-Out** = `Permissions = "Owner Opt-Out"` or `MlsStatus = "OwnerOptOut"` (separate permission)
  - **IDX display opt-out** = `IDXEntireListingDisplayYN = false` (may be for other reasons)
- **Evidence:** `rls-enforcement.ts` line 249 correctly checks BOTH `MlsStatus === "OwnerOptOut" || Permissions === "Owner Opt-Out"` — but the mapper does not fetch or check `Permissions` field.
- **Risk:** False positives AND false negatives for opt-out determination

### B-4: Hardcoded 5% commission rate on public Sell page
- **File:** `app/components/SellerClosingCostCalculator.tsx` lines 37-38, 115
- **Rule:** UCBA Art. I, Sec. 17 / Art. IV / NAR Settlement — Commissions are fully negotiable; no fixed rates
- **Issue:** Calculator hardcodes `brokerCommission = salePrice * 0.05` (5%) and displays "Broker commission (5%)". Presenting a default percentage implies a standard rate exists.

### B-5: Borough FAQ pages use investment/appreciation language without disclaimers
- **Files (all in FAQ JSON-LD structured data — indexed by Google):**
  - `app/bronx/page.tsx` line 44: "strongest investment potential" + "investors seeking appreciation"
  - `app/queens/page.tsx` line 44: "strong investment potential" + "attractive cap rates"
  - `app/staten-island/page.tsx` line 60: "steady appreciation" + "strong rental yields" + "lower acquisition costs"
  - `app/brooklyn/page.tsx` line 52: "strong appreciation over the past decade"
- **Rule:** NY DOS 19 N.Y.C.R.R. § 175.25 — advertising claims must not guarantee outcomes
- **Issue:** These are structured FAQ answers indexed by Google. They make forward-looking investment claims without any disclaimer that past performance does not guarantee future results. No risk disclosure.
- **Note:** `InvestorCalculator.tsx` line 415 correctly includes "Consult a financial advisor" disclaimer — but the FAQ pages do not.

---

## HIGH FINDINGS (17)

### H-1: `ListingAgreement` validation blocks all rental exclusives
- **File:** `lib/compliance/rls-enforcement.ts` line 433
- **Rule:** UCBA C1 — RLS only accepts Exclusive listings
- **Issue:** Only accepts `ExclusiveRightToSell` and `ExclusiveAgency`. Missing `ExclusiveRightToLease` (rental exclusives) and `Co-Exclusive`.

### H-2: Content scanning skips `SyndicationRemarks`
- **File:** `lib/compliance/rls-enforcement.ts` line 366
- **Rule:** UCBA Art. I, Sec. 5(C)(D)(E)
- **Issue:** Write-path gate scans `PublicRemarks`, `ShowingInstructions`, `PrivateRemarks` but NOT `SyndicationRemarks` which flows to third-party portals (openigloo, Samaki, TBI).
- **Note:** The offline RLS validator (`lib/rls-validator/src/content-scanners.ts`) DOES scan SyndicationRemarks — only the live write gate is missing it.

### H-3: DOM tracker uses "Sold"/"Rented" but Trestle sends "Closed"
- **File:** `lib/compliance/dom-tracker.ts` line 109
- **Rule:** UCBA Art. I, Sec. 11
- **Issue:** `if (newStatus === "Sold" || newStatus === "Rented")` — Trestle uses `"Closed"`.
- **Nuance (verified):** CRM state machine (`app/api/crm/listings/[id]/status/route.ts`) maps to "Sold"/"Rented" internally, so DOM freeze works for CRM writes. Gap only on Trestle sync path.

### H-4: `SyndicateYN` referenced in enforcement but never fetched
- **File:** `lib/compliance/rls-enforcement.ts` line 253
- **Rule:** UCBA Art. I, Sec. 5(A) — Owner Opt-Out syndication block
- **Issue:** Enforcement checks `SyndicateYN` but mapper uses `SyndicateTo` (different field). `SyndicateYN` is never in any $select. Dead gate on write path.

### H-5: Read-only fields in write-path mandatory validation
- **File:** `lib/compliance/rls-enforcement.ts` lines 75-78
- **Rule:** RLS Data Rules
- **Issue:** `MANDATORY_FIELDS` includes `OriginalEntryTimestamp` and `SourceSystemKey` — system-generated, read-only fields that cannot be in create payloads.

### H-6: Portal react endpoint missing 2 of 3 distribution gate checks
- **File:** `app/api/portal/listings/[id]/react/route.ts` lines 46-54
- **Rule:** UCBA Gates 2-3
- **Issue:** Checks `owner_opt_out` but NOT `participant_only` or `internet_entire_listing_display_yn`.

### H-7: Portal showings POST has zero distribution gate checks + no Coming Soon block
- **File:** `app/api/portal/showings/route.ts` lines 117-149
- **Rule:** UCBA Gates 1-3, UCBA Sec. D (Coming Soon: no showings until activation)
- **Issue:** No check for `owner_opt_out`, `participant_only`, `internet_entire_listing_display_yn`, or Coming Soon status. A client can schedule a showing on any listing including opted-out and Coming Soon.
- **UCBA D3-D4:** Coming Soon = NO showings, NO open houses until activation date. This is the most direct violation.

### H-8: CRM GET returns full unsanitized Prisma row
- **File:** `app/api/crm/listings/[id]/route.ts` lines 52-58
- **Rule:** REBNY data protection / NY SHIELD Act
- **Issue:** Returns entire Prisma row including `raw_data`, `compliance`, `sync_status`. Does not call `sanitizeForCRM()`.

### H-9: Write-path Fair Housing patterns cover only 7 of 16 NYC protected classes
- **File:** `lib/compliance/rls-enforcement.ts` lines 83-93
- **Rule:** Fair Housing Act + NY HRL + NYC HRL Title 8
- **Issue:** Missing patterns for: Age, Sex/Gender, Marital Status, Sexual Orientation, Gender Identity, Lawful Occupation, Military/Veteran Status, Caregiver Status, Partnership Status.
- **Note:** Offline validator has all 16. The `data/pages/fair-housing.json` correctly lists all classes. Only the live write gate has gaps.

### H-10: Attribution font size violates "reasonably prominent" requirement
- **Files:** `app/search/page.tsx` line 613, `app/components/PropertySearch.tsx` line 539
- **Rule:** UCBA Art. III, Sec. 2(C) — "not smaller than median typeface"
- **Issue:** Attribution uses `text-[10px]` at 30% opacity. Median card text is 14-16px.

### H-11: "pre-market properties" on public Buy page
- **File:** `app/buy/page.tsx` line 52
- **Rule:** UCBA Art. I, Sec. 5(D)
- **Issue:** FAQ answer: "provides access to listings including exclusive and pre-market properties."

### H-12: Listing detail page attribution shows individual agent name
- **File:** `app/listing/[id]/page.tsx` line 541
- **Rule:** UCBA Art. III, Sec. 2(C) — "Listing Courtesy of [Broker Name]"
- **Issue:** Shows `Courtesy of {listAgentFullName}, {listOfficeName}`. Should show only broker/office name.

### H-13: `sanitizeForPublic()` casing mismatch for suppressed fields
- **File:** `lib/compliance/dto.ts` lines 48-56, 88-112
- **Rule:** RLS distribution rules
- **Issue:** `IDX_SUPPRESSED_FIELDS` uses PascalCase (`ShowingInstructions`, `Latitude`, `Longitude`). Prisma returns snake_case. The delete operations don't match Prisma data. `showingInstructions` / `latitude` / `longitude` in camelCase could leak through.

### H-14: Portal offers missing `participant_only` and `internet_display` filters
- **File:** `app/api/portal/offers/route.ts` lines 39-42
- **Rule:** UCBA Gates 2-3
- **Issue:** Filters `owner_opt_out: false` but NOT `participant_only` or `internet_entire_listing_display_yn`.

### H-15: "Private Exclusives" nav item implies off-market inventory
- **File:** `app/components/Header.tsx` line 129
- **Rule:** UCBA Art. I, Sec. 5(D)
- **Issue:** Navigation dropdown has `{ title: 'Private Exclusives', href: '/sign-in' }`. The term "Private Exclusives" implies secret/hidden off-market listings, which violates REBNY's prohibition on off-market language.

### H-16: `mapRESOToInternal()` missing `commonInterest`, `ownershipType`, `structureType`
- **File:** `lib/idx/mapping.ts` lines 259-361
- **Rule:** RLS Data Quality / Property Type Display
- **Issue:** `FIELD_MAP` declares mappings for `CommonInterest`, `OwnershipType`, `StructureType` (lines 159-161). `IDXListing` type declares them (lines 78-80). But `mapRESOToInternal()` return statement does NOT include them.
- **Impact:** `public-dto.ts` line 178 calls `mapCommonInterestToDisplay(listing.commonInterest, ...)` but `commonInterest` is always `undefined`. All listings display as "Residential" instead of "Condo"/"Co-op"/"Condop". Property type filters broken.

### H-17: No automated cron for Closed listing 24-hour removal
- **File:** `app/api/cron/dom-reset/route.ts` (only handles Withdrawn/Cancelled DOM reset)
- **Rule:** UCBA Sec. J / H6 — Closed/Expired must be removed within 24 hours
- **Issue:** `checkDistributionGates()` in `trestle-mapper.ts` filters closed >24h from SEARCH results. But there is no automated job to mark/flag/remove closed listings from the database. If Trestle sync runs and marks a listing as Closed, it remains in the DB indefinitely. Any direct DB query (CRM, portal joins) could surface stale closed listings.
- **Note:** The existing cron (`/api/cron/dom-reset`) only resets DOM for Withdrawn/Cancelled >= 30 days. It does NOT handle Closed cleanup.

---

## MEDIUM FINDINGS (16)

### M-1: DOM reset warning incorrectly includes `TemporarilyOffMarket`
- **File:** `lib/compliance/rls-enforcement.ts` line 338
- **Rule:** UCBA Art. I, Sec. 11

### M-2: Expired listings without `CloseDate` pass distribution gates
- **File:** `lib/idx/trestle-mapper.ts` lines 683-692
- **Rule:** UCBA H6

### M-3: Statistical disclaimer has hardcoded stale date range
- **File:** `app/components/neighborhoods/MarketStatsModule.tsx` lines 65-66
- **Rule:** UCBA Art. VIII, Sec. 4
- **Issue:** Hardcoded "January 2025 through December 2025" — stale as of March 2026.

### M-4: Statistical disclaimer missing "shall not be held liable" clause
- **File:** `app/components/neighborhoods/MarketStatsModule.tsx` lines 64-71
- **Rule:** UCBA Art. VIII, Sec. 4

### M-5: Portal showings GET returns stale showings for now-opted-out listings
- **File:** `app/api/portal/showings/route.ts` lines 25-46
- **Rule:** UCBA Gates 1-3

### M-6: Bulk email route accepts arbitrary listing data without gate checks
- **File:** `app/api/crm/email/bulk/route.ts` lines 48-53
- **Rule:** UCBA Art. I, Sec. 5(C) / UCBA F3

### M-7: Custom email route bypasses all content compliance
- **File:** `app/api/crm/email/route.ts` lines 111-114
- **Rule:** CAN-SPAM Act, UCBA F3, Fair Housing

### M-8: Public listing fallback to local JSON relies on flags, not `checkDistributionGates()`
- **File:** `app/api/listings/[id]/route.ts` lines 101-115

### M-9: `FeaturedListings` fail-open pattern on missing gate flags
- **File:** `app/components/FeaturedListings.tsx` line 347
- **Issue:** Checks `=== false` which passes `undefined`. Should fail closed.

### M-10: Portal listing query has no WHERE clause for distribution gates
- **File:** `app/api/portal/listings/route.ts`

### M-11: `sanitizeForPublic()` doesn't strip camelCase `latitude`/`longitude` when address suppressed
- **File:** `lib/compliance/dto.ts` lines 110-111

### M-12: Photo captions (`ShortDescription`) not scanned for agent info
- **Rule:** UCBA Art. I, Sec. 5(C)

### M-13: Portal /me endpoint loads full Prisma row without `select` clause
- **File:** `app/api/portal/me/route.ts` lines 18-21
- **Verification:** Response is carefully constructed (no MLS data leaks), but full row loaded into memory.

### M-14: `REQUIRED_RLS_FIELDS` contains redundant RESO+RLS name pairs
- **File:** `lib/idx/trestle-mapper.ts` lines 703-720
- **Verification:** After `normalizeRenames()` both keys exist, so validation doesn't actually fail. Redundant but not broken.

### M-15: Ambiguous "exclusive listings" language in search empty states
- **Files:** `app/search/page.tsx` line 546, `app/components/PropertySearch.tsx` line 594
- **Issue:** "Our agents have access to exclusive listings" could be misinterpreted as off-market. Should clarify these are RLS exclusive right-to-sell/lease agreements.

### M-16: Manhattan FAQ uses "investment plans" in condo vs co-op answer
- **File:** `app/manhattan/page.tsx` line 58
- **Issue:** "Your choice depends on budget, investment plans, and lifestyle preferences." Less severe than borough pages (advisory, not forward-looking), but should still include brief disclaimer.

---

## LOW FINDINGS (14)

### L-1: $select arrays include both RESO and RLS names (wasted bandwidth)
### L-2: Multiple fields duplicated across B-category arrays
### L-3: `fetchSingleListing()` filters by `ListingId` not `ListingKey`
### L-4: `$top` default comment says 200 but code uses 500
### L-5: PropertyType validation restricted to Residential/ResidentialLease only
### L-6: TypeScript interface still defines removed compensation fields
### L-7: Agent NAME matching absent from both content scanners
### L-8: "Exclusive" badge on FeaturedListings for in-house listings
- **File:** `app/components/FeaturedListings.tsx` lines 234-237
- **Issue:** Shows "Exclusive" badge for `listing.flags.isExclusive`. This is OK if it means Exclusive Right to Sell agreement, but should NOT imply off-market.
### L-9: `ListingContractDate` exposed in public DTO (strategically sensitive)
### L-10: Borough FAQ price ranges lack RLS disclaimer
### L-11: `normalizeRenames()` variable names misleading but functionally correct
- **Verification:** Code works correctly. Variable names (`rlsName`/`canonicalName`) are swapped from semantics but logic maps RESO→RLS as intended.
### L-12: `MANDATORY_FIELDS` includes both `MlsStatus` and `StandardStatus`
### L-13: `RentVsBuyCalculator` assumes 5% investment return on down payment
- **File:** `app/components/RentVsBuyCalculator.tsx` line 82
- **Issue:** `Math.pow(1.05, yearsToStay)` hardcodes 5% annual return for opportunity cost. Not a direct REBNY issue but could be seen as implied investment advice.
### L-14: Media fetch comment says `ResourceRecordKeyNumeric` but code correctly handles both
- **File:** `lib/idx/fetch.ts` lines 301-313
- **Verification:** Code works correctly — comment is misleading.

---

## PASS / CORRECTLY IMPLEMENTED (22)

| # | Area | Verification |
|---|------|-------------|
| P-1 | Portal listings uses `sanitizeListingForPortal()` | Correct gate filtering + PII masking |
| P-2 | Public `/api/listings` full compliance pipeline | `checkDistributionGates()` + `toPublicDTO()` |
| P-3 | Public `/api/listings/[id]` IDX path correctly gated | Returns 404 for non-displayable |
| P-4 | CRM POST/PATCH runs `assertRlsCompliantPayload()` | Mandatory fields, compensation, Fair Housing |
| P-5 | Status route enforces state machine + DOM tracking | Terminal status requires broker, DOM computed |
| P-6 | Middleware auth-gates portal and CRM routes | session_token cookie required |
| P-7 | Media proxy validates against allowlist, no token exposure | Bearer token server-side only |
| P-8 | Trestle token endpoint correct (api.cotality.com) | No deprecated URLs |
| P-9 | `DOM_RESET_ELIGIBLE_STATUSES` excludes TemporarilyOffMarket | Correct per UCBA 2026 |
| P-10 | Active to Participant Only correctly stops DOM | Permissions-aware implementation |
| P-11 | Coming Soon rental blocking enforced | CS-001 gate blocks rentals |
| P-12 | No credential leakage in client-side code | Zero Bearer/IDX_CLIENT matches in .tsx |
| P-13 | Fair Housing disclosure in Footer | Federal FHA + NY HRL + NYC HRL referenced |
| P-14 | IDXDisclaimer component comprehensive | Data source, timestamp, EHO logo, broker name, commission negotiability |
| P-15 | Correct `ListOfficeName` field used for search attribution | Not co-broker or team name |
| P-16 | Compensation fields properly blocked/stripped | Write gate + DTO + IDX display |
| P-17 | Brokerage license #10991205323 displayed in Footer | Line 91 |
| P-18 | Physical address displayed in Footer | 400 East 90th Street, Suite 17C |
| P-19 | "Mallan Real Estate Inc." company name displayed | Footer line 25 |
| P-20 | Commission negotiability disclosure present | IDXDisclaimer line 57 + line 152 |
| P-21 | FARE Act rental fee disclosure in CRM forms | `RENTAL-FORM-REDESIGN.html` lines 1245-1267 |
| P-22 | InvestorCalculator includes financial advisor disclaimer | Line 415 |

---

## COMPLIANCE RISK MATRIX

| Risk Area | BLOCKERs | HIGHs | Status |
|-----------|----------|-------|--------|
| **Off-Market Language** | 1 (B-1) | 2 (H-11, H-15) | "Pocket listing" + "Pre-Launch" + "pre-market" + "Private Exclusives" |
| **Investment Claims** | 1 (B-5, 4 pages) | 0 | Forward-looking claims without disclaimers in Google-indexed FAQ |
| **Coming Soon Badge** | 1 (B-2, 3 locations) | 0 | Missing required text on all display surfaces |
| **Owner Opt-Out Derivation** | 1 (B-3) | 0 | Wrong data source — could display opt-out listings |
| **Compensation Display** | 1 (B-4) | 0 | Hardcoded 5% on Sell page |
| **Distribution Gate Enforcement** | 0 | 4 (H-4,6,7,14) | Dead syndication gate + portal gaps + Coming Soon showings |
| **Fair Housing Scanning** | 0 | 1 (H-9) | Write gate missing 9/16 protected classes |
| **Content Scanning** | 0 | 1 (H-2) | SyndicationRemarks not scanned |
| **Field Mapping** | 0 | 3 (H-3,5,16) | DOM freeze gap, read-only mandatory, commonInterest missing |
| **Attribution** | 0 | 2 (H-10,12) | Font too small, agent name shown |
| **Data Leakage** | 0 | 2 (H-8,13) | CRM unsanitized, camelCase gaps |
| **Listing Agreement** | 0 | 1 (H-1) | Blocks all rental exclusives |
| **Automated Cleanup** | 0 | 1 (H-17) | No cron for Closed 24-hour removal |

---

## PRIORITY FIX ORDER (Recommended)

### Phase 1: Immediate (Before Any REBNY Audit) — ~4 hours

1. **B-1:** Remove "pocket listing" + "Pre-Launch" from ExclusivesVault (lines 54, 92-93). Change tags to compliant terms like "New Development" or "Exclusive Right to Sell".
2. **B-2:** Fix Coming Soon badge — add `activationDate` to `PublicListingDTO`, update 3 badge functions to show full required text.
3. **B-4:** Remove hardcoded 5% commission — make user-editable input with "Commission rates are fully negotiable" disclaimer.
4. **H-11:** Remove "pre-market" from Buy page FAQ (line 52). Replace with "REBNY RLS listings."
5. **H-15:** Rename "Private Exclusives" in Header nav (line 129) to "Client Portal" or "My Listings."
6. **B-5:** Add investment disclaimer to 4 borough FAQ pages. Template: "Past performance does not guarantee future results. Real estate investments involve risk. Consult a licensed financial advisor before making investment decisions."

### Phase 2: Critical Data Integrity — ~6 hours

7. **B-3:** Fix `owner_opt_out` derivation — fetch `Permissions` field from Trestle, check `Permissions === "Owner Opt-Out"` OR `MlsStatus === "OwnerOptOut"`.
8. **H-16:** Add `commonInterest`, `ownershipType`, `structureType` to `mapRESOToInternal()` return statement. Fixes Condo/Co-op/Condop display.
9. **H-3:** Add `"Closed"` handling to DOM tracker for Trestle-synced data.
10. **H-1:** Add `ExclusiveRightToLease` and `Co-Exclusive` to listing agreement validation.
11. **H-5:** Remove `OriginalEntryTimestamp` and `SourceSystemKey` from write-path mandatory fields.
12. **H-4:** Align `SyndicateYN` vs `SyndicateTo` — check `SyndicateTo` instead.

### Phase 3: Gate Enforcement — ~4 hours

13. **H-7:** Add full distribution gate checks + Coming Soon block to portal showings POST. Required checks before creating showing:
    ```
    if (listing.owner_opt_out || listing.participant_only) return 404
    if (listing.internet_entire_listing_display_yn === false) return 403
    if (listing.status === 'ComingSoon') return 403 "Coming Soon — no showings"
    ```
14. **H-6, H-14:** Add `participant_only` + `internet_entire_listing_display_yn` checks to portal react + offers routes.
15. **H-17:** Add Closed listing cleanup to existing DOM reset cron (or create separate daily cron).
16. **H-2:** Add `SyndicationRemarks` to content scanner text fields.
17. **H-9:** Port full 16-class Fair Housing patterns from offline validator to write gate.

### Phase 4: Attribution + Display — ~3 hours

18. **H-10:** Increase attribution font size from `text-[10px]` to at least `text-xs` (12px). Remove 30% opacity — use at least 50%.
19. **H-12:** Remove `listAgentFullName` from listing detail attribution. Show only `listOfficeName`.
20. **H-13:** Add camelCase + snake_case variants to `IDX_SUPPRESSED_FIELDS` in dto.ts.
21. **M-3, M-4:** Fix statistical disclaimer (dynamic dates, verbatim REBNY text, liability clause).
22. **H-8:** Apply `sanitizeForCRM()` to CRM GET responses.

---

# COMPLETE EXECUTION GUIDE: REBNY / RLS / Trestle Compliance

> This section provides complete guidance on what mallan.nyc MUST have in place to pass a REBNY audit.

---

## 1. REQUIRED DISCLOSURES & TEXT (Must Be Present)

### 1A. REBNY RLS Attribution (UCBA Art. III, Sec. 2(C))
**Requirement:** Every page displaying listing data must show:
- "Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service"
- Attribution must be "reasonably prominent, not smaller than median typeface on the page"
- Must show broker name: "Courtesy of [ListOfficeName]" — NOT individual agent name

**Current status:** IDXDisclaimer component exists and is comprehensive. Attribution font size (10px/30% opacity) is too small.

### 1B. Data Last Updated Timestamp
**Requirement:** Every listing display must show when data was last updated.
**Current status:** PASS — IDXDisclaimer includes timestamp. `IDXSearchDisclaimer` shows current date.

### 1C. Commission Negotiability (NAR Settlement / UCBA Art. IV)
**Requirement:** "Commission rates are not set by law and are fully negotiable."
**Current status:** PASS — IDXDisclaimer line 57 and line 152.

### 1D. Equal Housing Opportunity
**Requirement:** EHO logo or text on all advertising/display pages.
**Current status:** PASS — IDXDisclaimer has EHO icon + text. Footer has EHO section.

### 1E. Brokerage Identification (NY DOS 19 N.Y.C.R.R. § 175.25)
**Requirement:** All advertising must include:
- Licensed brokerage name: "Mallan Real Estate Inc."
- Brokerage license number: #10991205323
- Physical address: 400 East 90th Street, Suite 17C, New York, NY 10128
**Current status:** PASS — All present in Footer.

### 1F. Fair Housing Statement
**Requirement:** Reference Federal FHA + NY State HRL + NYC HRL Title 8.
**Current status:** PASS — Footer has Fair Housing link. Dedicated `/fair-housing` page exists.

### 1G. Statistical Data Disclaimer (UCBA Art. VIII, Sec. 4)
**Required text:** "Based on information from the REBNY Listing Service for the period [start date] through [end date]. The REBNY does not guarantee accuracy. All data should be independently verified. Neither listing broker(s) nor REBNY shall be held responsible for any typographical errors, misinformation, or misprints."
**Current status:** FAIL — Hardcoded stale dates + missing liability clause (M-3, M-4).

---

## 2. PROHIBITED LANGUAGE (Must NOT Exist Anywhere Public)

| Prohibited Term | UCBA Rule | Penalty | Current Status |
|----------------|-----------|---------|----------------|
| "Pocket listing" | Art. I, Sec. 5(D) | $250/$500 INCURABLE | VIOLATION: ExclusivesVault line 92 |
| "Off-market" | Art. I, Sec. 5(D) | $250/$500 INCURABLE | CLEAN |
| "Pre-market" | Art. I, Sec. 5(D) | $250/$500 INCURABLE | VIOLATION: buy/page.tsx line 52 |
| "Pre-launch" | Art. I, Sec. 5(D) | $250/$500 INCURABLE | VIOLATION: ExclusivesVault line 93 |
| "Private exclusives" (implying hidden inventory) | Art. I, Sec. 5(D) | $250/$500 INCURABLE | VIOLATION: Header.tsx line 129 |
| "Secret listing" | Art. I, Sec. 5(D) | $250/$500 INCURABLE | CLEAN |
| Agent phone in listing description | Art. I, Sec. 5(C) | $500-$10K | CLEAN (scanner active) |
| Agent email in listing description | Art. I, Sec. 5(C) | $500-$10K | CLEAN (scanner active) |
| Agent personal URL in description | Art. I, Sec. 5(C) | $500-$10K | CLEAN (scanner active) |
| Compensation amounts in display | Art. I, Sec. 5(E) / NAR | $500-$10K | CLEAN (stripped in DTO) |
| Fixed commission percentage | Art. I, Sec. 17 / Art. IV | $500-$10K | VIOLATION: SellerClosingCostCalculator |
| Discriminatory language | Sec. M | $250+RLS termination | Scanner active but incomplete (7/16) |
| Investment guarantees without disclaimer | NY DOS 175.25 | $500+ | VIOLATION: 4 borough FAQ pages |

---

## 3. SIX DISTRIBUTION GATES (Must All Be Enforced)

### Gate 1: Owner Opt-Out
- **Rule:** Listings where owner has opted out must NEVER appear publicly. INCURABLE violation.
- **Detection:** `Permissions = "Owner Opt-Out"` OR `MlsStatus = "OwnerOptOut"`
- **Current:** PARTIALLY BROKEN — mapper derives from wrong field (B-3). Enforcement gate checks correctly (line 249) but mapper feeds wrong data.
- **Required enforcement points:** API listings, portal listings, search, detail pages, emails, showings

### Gate 2: Participant Only Network
- **Rule:** Visible only to authorized RLS participants — NOT public, NOT portal clients.
- **Detection:** `ParticipantOnlyYN = true` → `participant_only = true` in Prisma
- **Current:** Enforced in DTO + public API. Missing in portal react, offers, showings (H-6, H-7, H-14).

### Gate 3: IDX Display
- **Rule:** `IDXEntireListingDisplayYN = false` → do NOT display on IDX website.
- **Detection:** `idx_display_yn = false` in Prisma
- **Current:** Enforced in public API + checkDistributionGates. Missing in some portal routes.

### Gate 4: Internet Entire Listing Display
- **Rule:** `InternetEntireListingDisplayYN = false` → do NOT display anywhere on internet.
- **Detection:** `internet_entire_listing_display_yn = false` in Prisma
- **Current:** Enforced in DTO. Missing in portal react, offers.

### Gate 5: Coming Soon
- **Rule:** Coming Soon listings:
  - Sales ONLY (rentals cannot be Coming Soon)
  - 14-day maximum
  - Badge MUST say: "Coming Soon. No Showings or Open House until [Start Showing Date]"
  - NO showings, NO open houses until activation
  - NO compensation display
- **Current:** Rental block enforced (P-11). Badge text wrong (B-2). Showings not blocked (H-7). 14-day rule enforced on write.

### Gate 6: Closed Status (24-Hour Removal)
- **Rule:** Closed/Expired listings must be removed or marked within 24 hours.
- **Current:** Search results filter via `checkDistributionGates()` (time-based). No automated DB cleanup cron (H-17).

---

## 4. FIELD MAPPING (Trestle → Display)

### 4A. 23 RESO-to-RLS Renames
All 23 renames in `RESO_TO_RLS_RENAMES` are correctly defined and applied. The `normalizeRenames()` function works despite misleading variable names.

### 4B. Key Field Mapping Issues

| Field | Issue | Impact |
|-------|-------|--------|
| `CommonInterest` | In FIELD_MAP but NOT in mapRESOToInternal() return | All properties show "Residential" instead of Condo/Co-op/Condop |
| `OwnershipType` | Same — mapped but not returned | Property ownership type never displayed |
| `StructureType` | Same — mapped but not returned | Structure type never displayed |
| `SyndicateYN` vs `SyndicateTo` | Enforcement checks wrong field | Syndication gate dead on write path |
| `Permissions` | Not fetched from Trestle | Owner opt-out derivation wrong |
| `previousListPrice` | In FIELD_MAP but not in return | Price change tracking broken |

### 4C. Required Trestle $select Additions
To fix the above, add to $select query:
- `Permissions` (for owner opt-out determination)
- `SyndicateYN` or verify `SyndicateTo` covers the use case

### 4D. IDX Plus Field Coverage
`IDX_PLUS_SELECT_FIELDS` covers 273 of 527 Property fields in IDX Plus. The 85 excluded are justified (gate pre-filters, $expand needed, not provisioned by IDX Plus feed). Total REBNY IDX Plus: 902 fields across 7 resources.

---

## 5. DATA SANITIZATION LAYERS

### Layer 1: Public/IDX (toPublicDTO + sanitizeForPublic)
- Strips: privateRemarks, showingInstructions, agent PII (email, phone, MLS ID), compensation fields
- Enforces: address suppression when InternetAddressDisplayYN=false, lat/lng suppression
- **Gap:** PascalCase-only deletion doesn't match Prisma camelCase/snake_case data (H-13)

### Layer 2: Portal (sanitizeListingForPortal)
- Hard-blocks: owner_opt_out, participant_only, internet_entire_listing_display_yn
- Returns null for gated listings (caller must handle)
- **Gap:** Not used in showings, react, or offers routes (H-6, H-7, H-14)

### Layer 3: CRM (sanitizeForCRM)
- Preserves: agent info, showing instructions (CRM users need them)
- Strips: raw_data, sync internals
- **Gap:** Not called in CRM GET listing route (H-8)

---

## 6. CONTENT SCANNING REQUIREMENTS

### 6A. Fair Housing (16 NYC Protected Classes)
Must scan for discriminatory language referencing ALL 16 classes:
1. Race/Color, 2. Religion, 3. National Origin, 4. Sex/Gender, 5. Familial Status, 6. Disability, 7. Age, 8. Marital Status, 9. Sexual Orientation, 10. Gender Identity, 11. Lawful Source of Income, 12. Immigration/Citizenship, 13. Military/Veteran Status, 14. Lawful Occupation, 15. Partnership Status, 16. Caregiver Status

**Current:** Write gate has 7 of 16. Offline validator has all 16.

### 6B. Agent Info in Remarks
Phone numbers, emails, personal URLs must not appear in PublicRemarks or SyndicationRemarks.
**Current:** PASS for PublicRemarks. SyndicationRemarks not scanned (H-2).

### 6C. Off-Market Language
"Pocket listing", "off-market", "pre-market", "secret listing" must be blocked.
**Current:** Write gate blocks these in remarks. Public pages still have violations (B-1, H-11, H-15).

### 6D. Compensation in Remarks
No compensation amounts, percentages, or terms in any remarks field.
**Current:** PASS — scanner active on PublicRemarks.

---

## 7. COMING SOON RULES (UCBA Art. I, Sec. 16 / Rules D1-D12)

| Rule | Requirement | Current Status |
|------|-------------|----------------|
| D1 | Sales only — rentals cannot be Coming Soon | PASS (CS-001 gate) |
| D2 | 14-day maximum duration | PASS (enforcement gate lines 292-306) |
| D3 | No showings until activation | FAIL — showings POST has no block (H-7) |
| D4 | No open houses until activation | N/A (no open house feature yet) |
| D5 | ActivationDate required | PASS (enforcement gate) |
| D6 | Must have list price | PASS (mandatory field) |
| D7 | Badge: "Coming Soon. No Showings or Open House until [date]" | FAIL — just says "Coming Soon" (B-2) |
| D8 | No compensation display | PASS (stripped in DTO) |
| D9 | Can cancel Coming Soon early | PASS (status machine allows) |
| D10 | DOM does not accrue during Coming Soon | PASS (dom-tracker handles) |
| D11 | Listing Courtesy attribution required | PASS (attribution present) |
| D12 | Must transition to Active by activation date | No automated enforcement |

---

## 8. DOM (DAYS ON MARKET) TRACKING (UCBA Art. I, Sec. 11)

| Rule | Requirement | Current Status |
|------|-------------|----------------|
| DOM accrues from Active start | From `first_active_date` | PASS |
| DOM pauses for Participant Only | Permissions-aware | PASS |
| DOM freezes at close | When status → Closed/Sold/Rented | PARTIAL — works for CRM, not Trestle sync (H-3) |
| DOM resets after 30 days Withdrawn/Cancelled | `shouldResetDom()` | PASS |
| DOM does NOT reset for TemporarilyOffMarket | Excluded from eligible statuses | PASS |
| Cumulative DOM tracked separately | `cumulative_days_on_market` column | PASS |
| Daily cron resets eligible listings | `/api/cron/dom-reset` | PASS |

---

## 9. AUTH & SECURITY (NY SHIELD Act / REBNY Data Protection)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Cookie-only auth (no Bearer tokens) | PASS | Sprint 10 removed all Bearer code |
| httpOnly + SameSite=Lax + Secure cookies | PASS | `lib/auth.ts` |
| Rate limiting (API 30/min, login 5/min) | PASS | `middleware.ts` |
| CSP headers | PASS | `vercel.json` |
| X-Frame-Options: DENY | PASS | `vercel.json` |
| No client-side MLS API calls | PASS | Zero Trestle references in .tsx |
| Media proxy (server-side Bearer) | PASS | `/api/media/proxy` |
| Robots.txt blocks AI crawlers | PASS | `app/robots.ts` |
| CORS restricted (prod only mallan.nyc) | PASS | `middleware.ts` |
| Audit logging on sensitive operations | PASS | All CRM/portal writes logged |

---

## 10. TRESTLE API MIGRATION DEADLINE

**CRITICAL DATE: March 31, 2026** (26 days from now)

| Endpoint | Status |
|----------|--------|
| `api.cotality.com/trestle` (new) | IN USE — current code |
| `api-trestle.corelogic.com` (deprecated) | Media proxy allowlists it during transition |
| `api-prod.corelogic.com` (deprecated) | Media proxy allowlists it during transition |

**Action needed:** After March 31, 2026, remove deprecated domains from media proxy allowlist. Verify all Trestle calls use `api.cotality.com` exclusively.

---

## PENALTY EXPOSURE SUMMARY

| Violation Type | Applicable Findings | Penalty per UCBA |
|---------------|--------------------|--------------------|
| Incurable (Off-Market Language) | B-1, H-11, H-15 | $250 first / $500 subsequent per calendar year |
| Investment Claims (NY DOS) | B-5 (4 pages) | $500+ per advertising violation |
| Incurable (Opt-Out Display) | B-3 (potential) | $250 first / $500 subsequent |
| Fair Housing | H-9 (gap in scanner) | $250 first / $500 + **RLS termination** second |
| Data Quality | H-1, H-5, H-16 | $0 → $250 → $250 → **termination** (escalating) |
| General UCBA | B-2, B-4, H-10, H-12 | $500 → $2K → $10K → **30-day suspension** |
| Quarterly >5% rejection | Multiple field gaps | **$10,000** per quarter |

---

## VERIFICATION NOTES

All 74 findings verified against source code across 2 full audit passes (11 agents + manual verification).

Key corrections from agent reports:
1. **B-4 old (SyndicateYN):** Downgraded from BLOCKER to H-4 — write-path only, not a display issue.
2. **H-3 (DOM tracker):** Added nuance — works for CRM writes, gap only on Trestle sync.
3. **Portal /me (old H-9):** Downgraded to M-13 — returns user's own data, no MLS leak.
4. **normalizeRenames (old H-16):** Downgraded to L-11 — code works, variable names misleading.
5. **mapping.ts commonInterest (NEW H-16):** Real gap — FIELD_MAP declares it, type expects it, return doesn't include it.
6. **Borough investment FAQ (NEW B-5):** 4 pages with forward-looking claims in Google-indexed structured data.
7. **"Private Exclusives" nav (NEW H-15):** Implies off-market inventory in public navigation.
8. **Closed listing cron (NEW H-17):** No automated 24-hour removal — only DOM reset cron exists.
9. **Agent reports incorrectly flagged `saved-searches/[id]/execute`** — this file does NOT exist. False positive removed.

---

*Report generated 2026-03-05. Two full audit passes completed. All findings verified against live source code.*
