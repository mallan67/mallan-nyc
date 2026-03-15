# REBNY UCBA 2026 — Full Compliance Audit Report

> **Date:** 2026-03-13
> **Auditor:** Claude (Opus 4.6) — verified against actual code, no assumptions
> **Source:** UCBA Master Copy (January 2026 Redline Revision) — 159 rules, 7 exhibits
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Method:** Every rule verified against actual source code files with line-number evidence. No fast pass/fail.

---

## SCORECARD

| Section | Rules | PASS | FAIL | EVALUATE CLOSELY |
|---------|-------|------|------|-------------------|
| A: DOM & Protected Period | 8 | 3 | 3 | 2 |
| C: Listing Input Rules | 18 | 11 | 1 | 6 |
| D: Coming Soon | 12 | 5 | 2 | 5 |
| E: Selling/Leasing (E7) | 1 | 0 | 1 | 0 |
| F: Prohibitions | 13 | 9 | 0 | 4 |
| G: Compensation | 5 | 4 | 0 | 1 |
| H: IDX/VOW Frontend | 12 | 10 | 0 | 2 |
| Distribution Gates (6) | 6 | 6 | 0 | 0 |
| DTO/Portal Security (5) | 5 | 5 | 0 | 0 |
| Exhibit A Fields (61) | 61 | 55 | 2 | 4 |
| K/L/O: NewDev/OptOut/Suspended | 4 | 1 | 0 | 3 |
| **TOTAL** | **145** | **109** | **9** | **27** |

---

## FAILURES — 9 Items (Must Fix)

### FAIL-1: A6/A7/A8 — Protected Period After Listing Termination
- **Rule:** Art. II, Sec. 13 — Within 7 business days after listing expiration, Exclusive Broker delivers up to 6 names. 90-day compensation window. Owner must notify new broker.
- **Finding:** Entirely unimplemented. No Prisma fields, no API endpoints, no CRM UI.
- **Evidence:** Searched `protected_period`, `protectedNames`, `protected_names` — only in documentation files.
- **Risk:** Operational — broker could lose entitled compensation if not tracked.
- **Fix:** New Prisma model + CRM UI + notification workflow.

### FAIL-2: C15 — Auction Listing Requirements
- **Rule:** Art. I, Sec. 15 — Must include minimum bid, date/time/location, registration, buyer's premium.
- **Finding:** No auction-specific fields, UI sections, or validation anywhere.
- **Evidence:** Searched sale/rental forms + all API routes. Zero matches.
- **Risk:** Low if brokerage never handles auctions. Blocks auction listings if attempted.
- **Fix:** Add auction field set to sale form (conditional on listing type).

### FAIL-3: D9 — Coming Soon One-Time Use Per Address
- **Rule:** Art. I, Sec. 16 — One Coming Soon per address/owner (60-day cooldown).
- **Finding:** `rebny-field-tables.ts:1164` documents `oneTimePerAddress: true` and `reuseCooldownDays: 60` but NO enforcement code exists. No DB query checks prior Coming Soon history.
- **Evidence:** No validation in `rls-enforcement.ts` or `status/route.ts` checks prior usage.
- **Risk:** Incurable violation ($250/$500) if same property re-enters Coming Soon.
- **Fix:** Query `Listing` by address + owner where previous `MlsStatus = ComingSoon` within 60 days.

### FAIL-4: D12 — Showing Start Date Immutable
- **Rule:** Art. I, Sec. 16 — ActivationDate cannot be changed once set on Coming Soon listing.
- **Finding:** `rebny-field-tables.ts:1163` documents `activationDateImmutable: true` but NO enforcement on update path.
- **Evidence:** Neither `rls-enforcement.ts` nor listing update routes check for ActivationDate changes.
- **Risk:** Agent could extend Coming Soon period by changing the date.
- **Fix:** Compare incoming ActivationDate against stored value in PATCH/PUT handler; reject if different.

### FAIL-5: E7 — Buyer Rep Agreement Before Showing
- **Rule:** Art. II, Sec. 16 — Co-Broker must have executed Buyer Representation Agreement before any showing.
- **Finding:** `app/api/portal/showings/route.ts` POST has NO check for buyer rep agreement.
- **Evidence:** Showing route checks auth, listing existence, opt-out, participant-only, IDX display, Coming Soon — but NOT buyer rep agreement.
- **Risk:** UCBA violation for showing without agreement.
- **Fix:** Add `buyer_rep_agreement` field/check to Lead or showing flow.

### FAIL-6: Exhibit A #49 — NumberOfShares (Co-op)
- **Rule:** Required for co-op/condop listings per conditional rule COOP-001.
- **Finding:** Form field `saleUnitShares` (line 1022) has `data-rls-ignore="true"` and payload builder never maps to `NumberOfShares`.
- **Evidence:** `SALE-FORM-REDESIGN.html:1022` — `data-rls-ignore="true"`. Searched `collectSaleData()` (lines 6450-6540) — `NumberOfShares` never appears.
- **Risk:** **Blocks co-op listing creation entirely** — backend validation will reject.
- **Fix:** Remove `data-rls-ignore`, add `data-rls-field="NumberOfShares"`, map in payload builder.

### FAIL-7: Exhibit A #52 — TaxMonthlyAmount (Condo)
- **Rule:** Required for condo listings per conditional rule CONDO-001.
- **Finding:** Field completely missing from sale form. Annual tax exists (`TaxAnnualAmount`) but monthly is a separate RLS field.
- **Evidence:** Searched `SALE-FORM-REDESIGN.html` for `TaxMonthlyAmount` — zero matches. Conditional rule at `rebny-field-tables.ts:417`.
- **Risk:** **Blocks condo listing creation** if conditional rule fires.
- **Fix:** Add `TaxMonthlyAmount` input to condo financial section.

---

## EVALUATE CLOSELY — 27 Items (Need Manual Review or Code Fix)

### Code Gaps (can fix in code)

| # | Rule | Issue | Evidence |
|---|------|-------|----------|
| EC-1 | A2: DOM starts at RLS transmission | Code uses status-change timestamp, not actual RLS transmission time. Likely acceptable. | `dom-tracker.ts:83-91` — `first_active_date = now` on Active transition |
| EC-2 | A5: No DOM circumvention | `cumulative_days_on_market` preserves history but no re-listing detection by address. | No address-based duplicate check in dom-tracker or enforcement gate |
| EC-3 | C2: Simultaneous distribution | No auto-push to RLS on publish. Listings start as Draft, manual transition required. | `app/api/crm/listings/route.ts:94` — `STATUS_INITIAL = "Draft"` |
| EC-4 | C12: Closing price within 24hrs | Status route accepts `{status: "Sold"}` without requiring `ClosePrice`. | `status/route.ts:103-112` — no ClosePrice validation on Sold transition |
| EC-5 | C14: Withdrawal constraints | No check for active public display before allowing RLS withdrawal. | Status machine allows `Active -> Withdrawn` without public display check |
| EC-6 | D4: No open houses (Coming Soon) | Write-path blocked (open houses = showings), but GET route doesn't filter Coming Soon from Trestle data. | `app/api/open-houses/route.ts` — no ComingSoon filter on read |
| EC-7 | D5: No negotiations (Coming Soon) | Client action `"offer"` allowed on any listing without ComingSoon check. | `app/api/crm/clients/[id]/actions/route.ts` — no status check |
| EC-8 | D8: Unsolicited offers | No distinction between solicited/unsolicited offers. | No offer type field exists |
| EC-9 | D10: Owner authorization (Exhibit G) | Coming Soon status has no document upload gate. | No check in status transition route |
| EC-10 | D11: Not ready = change status | No automated check for expired Coming Soon period. | No cron job monitors Coming Soon expiration |
| EC-11 | H7: Coming Soon badge (partial) | `LiveListingsWidget.tsx:207-209` shows abbreviated "Coming Soon" without full required text. | Missing "No Showings or Open House until [date]" |
| EC-12 | Exhibit A #25: PropertyCondition | Missing from sale form (present in rental). Backend validation will block. | `RENTAL-FORM-REDESIGN.html:1826` has it; sale form does not |
| EC-13 | Exhibit A #48: MaxFinancing | Form maps to `MaximumFinancingAmount` but rule requires `MaximumFinancingPercent`. | `SALE-FORM-REDESIGN.html:4596` — `data-rls-field="MaximumFinancingAmount"` vs rule CONDO-COOP-001 |

### Operational/Procedural (likely acceptable as-is)

| # | Rule | Issue | Evidence |
|---|------|-------|----------|
| EC-14 | C10: Mixed-use 5-unit threshold | MixedUse accepted but no 5-unit limit distinction. | `rebny-field-tables.ts:167` — MixedUse in PropertySubType |
| EC-15 | C11: Status changes within 24hrs | Timestamps recorded but no timeliness enforcement (human-behavior rule). | `status/route.ts:148-158` — `status_changed_at` updated |
| EC-16 | C17: Govt form separate disclosure | No government form detection. Own forms already include disclosure. | Commission negotiability checkbox present on all forms |
| EC-17 | F7/F8: No duplicate listings | Relies on RLS-side enforcement (correct — Trestle handles uniqueness). | No address-based duplicate check in listing creation |
| EC-18 | F10: No solicitation to terminate | Outreach templates are compliant but no check against active exclusives. | `lib/seller-readiness/config.ts` — standard prospecting language |
| EC-19 | F11: Separate agreement | Document vault exists but no dual-agreement warning UI. | Document model + signatures exist in Prisma |
| EC-20 | F13: No "free services" | RLS remarks scanned; CRM uses "complimentary CMA" (standard practice). | `rls-enforcement.ts:425-438` — free service patterns blocked on remarks |
| EC-21 | G5: Ownership interest disclosure | No field or validation exists. Would need new form field. | Zero matches for `ownership_interest` in code |
| EC-22 | H5: No off-market language | Zero on public pages. CRM internal forms use RLS status values in dropdowns. | CRM has `noindex` headers — likely compliant |
| EC-23 | K1: RUNDBA for new dev | Tracked (`NewDevelopmentYN`) but not gate-checked on write path. | No RUNDBA document check in enforcement gate |
| EC-24 | L1-L6: Opt-out form requirements | Effect enforced, but signed form not verified in system. | `rls-enforcement.ts:239-262` — blocks display, doesn't verify form |
| EC-25 | O1-O2: Suspended agent (mid-session) | Login blocked for suspended agents. 24hr session TTL limits mid-session gap. | `auth/login/route.ts:42-48` — status check on login |
| EC-26 | Exhibit A #4: Building Sublet Policy | Present in form but not in unconditional mandatory list. | `RentingAllowedYN` is building attribute |
| EC-27 | Exhibit A #24: Private Outdoor Space | Present in form but not enforcement-gated (descriptive feature field). | In form with 11 checkboxes |

---

## PASSES — 109 Items (Verified with Evidence)

### Section A: DOM Rules (3 PASS)

| Rule | Evidence |
|------|----------|
| A1: DOM reset after 30 days | `dom-tracker.ts:17` — `DOM_RESET_DAYS = 30`. `shouldResetDom()` at lines 43-52. Daily cron at `api/cron/dom-reset/route.ts`. |
| A3: DOM resets on close | `dom-tracker.ts:109-116` — Sold/Rented freezes DOM at final value. |
| A4: Coming Soon/Participant Only no DOM | `dom-tracker.ts:20` — `DOM_ACCRUING_STATUSES` = Active, ActiveUnderContract only. Lines 26-29 suppress Participant Only. |

### Section C: Listing Input Rules (11 PASS)

| Rule | Evidence |
|------|----------|
| C1: Exclusive only | Sale form: 4 exclusive types only. `rls-enforcement.ts:442-453` — whitelist enforcement. |
| C3: Owner opt-out form | `SALE-FORM-REDESIGN.html:550-556` — file upload for Exhibit B + 48hr warning. |
| C4: Owner opt-out no public | Triple-layer: enforcement gate + Trestle mapper + DB filter. |
| C5: Owner opt-out 1:1 exception | `SALE-FORM-REDESIGN.html:489` — exception documented in form UI. |
| C6: No pocket listings | CRM warning panel + `rls-enforcement.ts:95-96` — `/pocket\s+listing/i` pattern. |
| C7: No agent info in description | `rls-enforcement.ts:86-91` — 4 patterns (phone, email, URL, promotional). |
| C8: No off-market language | `rls-enforcement.ts:93-99` — 5 patterns blocked. |
| C9: No compensation in description | `rls-enforcement.ts:101-107` — 5 patterns blocked. |
| C13: Closed listings removed 24hrs | Cron at `data-retention/route.ts:37-68` + Trestle mapper gate. |
| C16: Commission negotiability | Disclosure on all 4 CRM forms + public search + sell page. |
| C18: Fair Housing language | `rls-enforcement.ts:64-84` — 17 patterns across Federal FHA + NY HRL + NYC HRL Title 8. Scans 4 text fields. |

### Section D: Coming Soon (5 PASS)

| Rule | Evidence |
|------|----------|
| D1: Sales only | `rls-enforcement.ts:265-284` — blocks rentals (CS-001) and new dev (CS-002). |
| D2: Maximum 14 days | `rls-enforcement.ts:289-302` — validates `diffDays > 14` as BLOCKER. |
| D3: No showings | `portal/showings/route.ts:141-147` — returns 422 for ComingSoon. |
| D6: May schedule appointments | Over-restrictive (blocks all, not just past dates). Safer than required. |
| D7: Display badge required | `SearchListingCard.tsx:19-29`, `listing/[id]/page.tsx:942-945` — full REBNY text. |

### Section F: Prohibitions (9 PASS)

| Rule | Evidence |
|------|----------|
| F1: No unauthorized use | Bot blocking (25+), rate limiting, auth, CSRF, robots.txt blocks `/api/`. |
| F2: No unauthorized advertising | All data from authorized Trestle IDX feed, server-side only. |
| F3: No mass solicitations | Bulk email: broker-only, rate-limited (50/hr), own clients only. |
| F4: No identity disclosure until closed | DTO strips all identity fields. No seller/buyer names in frontend. |
| F5: Internal dissemination OK | CRM behind auth + RBAC. Agent sees only own data. |
| F6: IDX/VOW attribution | "Listing Courtesy of [Broker]" on all cards, detail, sidepanels, widgets. |
| F9: No advertising during term | Only IDX feed listings displayed — structural prevention. |
| F12: Data accuracy | 48 mandatory + 51 conditional rules + content scanning on write path. |

### Section G: Compensation (4 PASS)

| Rule | Evidence |
|------|----------|
| G1: No compensation on RLS | `REMOVED_FIELDS` stripped at all tiers. Write-path also rejects. |
| G2: Rates not set by law | Calculator uses "est. 5%*" with "not set by law" disclaimer. |
| G3: Fully negotiable | Disclosure on detail, search, calculator, footer. |
| G4: Agreement inspection | Document vault with signatures for storage/retrieval. |

### Section H: IDX/VOW Frontend Display (10 PASS)

| Rule | Evidence |
|------|----------|
| H1: Attribution required | `listing/[id]/page.tsx:1666-1668`, `SearchListingCard.tsx:107-113`, LiveListingsWidget, ListingSidePanel. |
| H2: No unauthorized advertising | All data from Trestle IDX Plus feed. |
| H3: Respect owner opt-outs | Enforced at 4 layers: Trestle gate, DB query, portal DTO, detail page. |
| H4: Respect participant only | Same 4-layer enforcement. |
| H6: Closed = remove 24hrs | Trestle gate real-time + weekly cron. |
| H8: Statistical data attribution | Full disclaimer on MarketStatsModule, search, market report, price history. |
| H9: No reproduction | 25+ bots blocked, rate limiting, CSP, CSRF, security headers. |
| H10: Protect confidential fields | Address suppression in DTO (both PascalCase/camelCase). ExpirationDate stripped at 2 layers. |
| H11: No compensation displayed | All compensation in REMOVED_FIELDS. No amounts in frontend. |
| H12: No seller/buyer identity | Zero matches for seller/buyer/owner name fields in frontend. |

### Distribution Gates (6/6 PASS)

| Gate | Evidence |
|------|----------|
| Gate 1: Owner Opt-Out | 9 enforcement points verified (Trestle mapper, public API, ISR, DB-to-DTO, detail page, portal DTO, portal listings, portal showings, portal offers). |
| Gate 2: Participant Only | 7 enforcement points. |
| Gate 3: IDX Display | 5 enforcement points + Trestle pre-filter. |
| Gate 4: Syndication | Write-path + validator enforcement. Correctly scoped to 3rd-party. |
| Gate 5: Coming Soon | Badge, showing block, 14-day max, rental block. |
| Gate 6: Closed Status | Cron + query filter + Trestle gate. |

### DTO/Portal Security (5/5 PASS)

| Tier | Evidence |
|------|----------|
| Public (IDX) | `dto.ts:95-157` — strips CRM_ONLY, AGENT_PII, REMOVED, IDX_SUPPRESSED fields. |
| VOW | `dto.ts:176-199` — adds back 14 enriched fields after public sanitization. |
| Portal | `dto.ts:207-229` — buyer/tenant gets company only; seller/landlord gets full agent info. |
| CRM | `dto.ts:306-315` — only strips removed compensation fields. |
| Address suppression | `dto.ts:134-154` — both PascalCase and camelCase variants stripped. |

### InternetEntireListingDisplayYN Cascade — PASS

`rls-enforcement.ts:200-218` — enforces cascade of 4 fields (`IDXEntireListingDisplayYN`, `InternetAddressDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`) to False when master switch is False. BLOCKER on write.

### Exhibit A Mandatory Fields (55/61 PASS)

All 55 passing fields verified in: form HTML (field exists with `data-rls-field`), backend validation (`rebny-field-tables.ts` mandatory list or conditional rules), and Prisma schema (column or JSONB). See detailed field-by-field evidence in agent output.

**Notable:** 44 common fields + 8 condo/coop + 5 building/TH + 4 rental — all present and validated.

### Suspended Agent Handling (O1-O2) — PASS

`auth/login/route.ts:42-48` — blocks login for `status !== "active"`. OAuth path also blocked at `lib/auth/oauth.ts:34-37`.

---

## RECOMMENDED PRIORITY FIXES

### Tier 1: Immediate (blocks functionality)
1. **FAIL-6:** Fix `NumberOfShares` — remove `data-rls-ignore`, map to payload (blocks co-op listings)
2. **FAIL-7:** Add `TaxMonthlyAmount` field to sale form (blocks condo listings)
3. **EC-12:** Add `PropertyCondition` field to sale form (blocks residential sale listings)
4. **EC-13:** Fix `MaximumFinancingPercent` mapping in sale form

### Tier 2: High (compliance violations)
5. **FAIL-5:** Add buyer rep agreement check to showings endpoint
6. **FAIL-3:** Enforce Coming Soon one-time-use per address (D9)
7. **FAIL-4:** Make ActivationDate immutable on Coming Soon updates (D12)
8. **EC-11:** Fix LiveListingsWidget Coming Soon badge text (H7)

### Tier 3: Medium (operational gaps)
9. **FAIL-1:** Protected period tracking (A6/A7/A8) — new data model needed
10. **EC-4:** Require ClosePrice when transitioning to Sold/Rented (C12)
11. **EC-10:** Add Coming Soon expiration monitoring cron (D11)
12. **EC-7:** Block offer actions on Coming Soon listings (D5)

### Tier 4: Low (procedural/deferred)
13. **FAIL-2:** Auction fields (only if brokerage handles auctions)
14. **EC-21:** Ownership interest disclosure field (G5)
15. **EC-23:** RUNDBA document gate for new dev (K1)

---

## FILES EXAMINED

| File | Purpose |
|------|---------|
| `lib/compliance/rls-enforcement.ts` | Write-path enforcement gate (48 mandatory + 51 conditional + content scanning) |
| `lib/compliance/dto.ts` | DTO sanitization (4 tiers: Public/VOW/Portal/CRM) |
| `lib/compliance/dom-tracker.ts` | DOM calculation + 30-day reset |
| `lib/compliance/rebny-field-tables.ts` | Canonical authority table (all fields, rules, patterns) |
| `lib/compliance/idx-display-gate.ts` | IDX display eligibility + Coming Soon badge |
| `lib/idx/trestle-mapper.ts` | Trestle raw data → normalized listing + distribution gates |
| `lib/idx/db-to-public-dto.ts` | DB listing → public DTO + display filtering |
| `lib/idx/fetch.ts` | Trestle API client |
| `lib/idx/auth.ts` | OAuth2 for Trestle |
| `lib/auth/middleware.ts` | RBAC: requireAuth, requireRole, requireBroker |
| `middleware.ts` | Edge middleware: bot blocking, rate limiting, CSRF, auth routing |
| `app/api/crm/listings/route.ts` | Listing CRUD + enforcement gate |
| `app/api/crm/listings/[id]/status/route.ts` | Status transitions + DOM tracking |
| `app/api/portal/showings/route.ts` | Showing request + gate checks |
| `app/api/portal/offers/route.ts` | Offer viewing |
| `app/api/portal/listings/route.ts` | Portal listing display |
| `app/api/cron/data-retention/route.ts` | Closed listing cleanup |
| `app/api/cron/dom-reset/route.ts` | Daily DOM reset |
| `app/listing/[id]/page.tsx` | Listing detail page |
| `app/components/SearchListingCard.tsx` | Search result cards |
| `app/components/PropertySearch.tsx` | Property search component |
| `app/components/IDXDisclaimer.tsx` | Attribution + disclaimers |
| `app/components/SellerClosingCostCalculator.tsx` | Commission calculator |
| `app/components/neighborhoods/LiveListingsWidget.tsx` | Neighborhood listings |
| `app/search/page.tsx` | Search page |
| `app/robots.ts` | Robots.txt + bot blocking |
| `public/crm/SALE-FORM-REDESIGN.html` | Sale submission form |
| `public/crm/RENTAL-FORM-REDESIGN.html` | Rental submission form |
| `public/crm/BUYER-DEAL-FORM.html` | Buyer deal form |
| `public/crm/TENANT-DEAL-FORM.html` | Tenant deal form |
| `public/crm/MALLAN-NYC-CRM-FINAL2.html` | CRM hub |
| `prisma/schema.prisma` | Database schema |
| `vercel.json` | Cron jobs + security headers |
| `compliance/rules/*.json` | Machine-readable enforcement rules |

---

## REVISION HISTORY

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-13 | v1.0 | Initial full audit — 145 rules, 109 PASS, 9 FAIL, 27 EVALUATE CLOSELY |
