# IDX & VOW Display Rules

> **Feed:** REBNY RLS via the Cotality API | **LMP:** RealPlus (listing input to RLS) | **IDX Display:** Cotality IDX Plus Web API — public display + internal CRM + reporting (REBNY confirmed 2026-03-27). IDX-eligible inventory only, not full-market search.
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **NY law/DOS, Fair Housing and REBNY rules (UCBA 2026, REBNY Listing Service)** govern use, display and conduct. 2. **The live Cotality API** is the only authority for provider fields, values and picklists (`data/cotality-enums.live.json` is its committed copy).
> 3. **Mallan business rules** govern how verified facts are used; Mallan-created fields (mostly commercial and private-listing fields) are Mallan facts, never presented as provider data, and can restrict but never override a law/REBNY/provider display restriction (Master §0.2, §4, §21.1). 4. **Fail closed = NON-DISPLAY.** Plan: `MALLAN-PLATFORM-MASTER-PLAN.md`; state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

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

| Field | `InternetEntireListingDisplayYN` *(Cotality field; UCBA refers to "IDX Entire Listing Display" — no separate `IDXEntireListingDisplayYN` field exists in the live Cotality schema)* |
|-------|------|
| Source | Art. III, Sec. 2(C) |
| Default | **True** (LMPs must default to True) |
| True | All public-eligible fields flow to IDX broker websites. Attribution required. |
| False | Excluded from all IDX. Remains on RLS. |
| Dependency | Also requires the listing office's IDX participation (`Office.IDXOfficeParticipationYN` in the live Cotality schema; system-managed). |

### Gate 4: Syndication

| Field | `SyndicateTo` *(Cotality field; UCBA refers to "SyndicateYN" as boolean — Cotality uses `SyndicateTo` for portal selection)* |
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
| `InternetAddressDisplayYN` | False |
| `InternetAutomatedValuationDisplayYN` | False |
| `InternetConsumerCommentYN` | False |
| Listing alerts/auto-sharing | Disabled for non-exclusive agents |

**FARE Act:** When landlord does NOT pay broker fee, `InternetEntireListingDisplayYN = False` — triggers full cascade above.

---

## Display Control Flags (6 Total)

| # | Cotality Field | Required | Default | Effect When False |
|---|-----------|----------|---------|-------------------|
| 1 | `InternetEntireListingDisplayYN` | **REQ** | True | Master switch — cascades all below to False. Also serves as IDX display gate (no separate `IDXEntireListingDisplayYN` in the live Cotality schema). |
| 2 | `InternetAddressDisplayYN` | **REQ** | True | **Address MUST be suppressed.** Violation if displayed. |
| 3 | `InternetAutomatedValuationDisplayYN` | **REQ** | True | AVM (Zestimate-style) display disabled |
| 4 | `InternetConsumerCommentYN` | **REQ** | True | Consumer comments/blogs disabled |
| 5 | `SyndicateTo` | **REQ** | True | Excluded from syndication portals. *(UCBA references as `SyndicateYN`)* |
| 6 | `Office.IDXOfficeParticipationYN` (Office resource) | SYS | -- | System-managed from REBNY membership |

---

## IDX Display Rules

### What MUST Appear on IDX Listings

| Requirement | Source | Implementation |
|-------------|--------|----------------|
| Listing broker attribution | Art. III, Sec. 2(C) | "Listing Courtesy of [ListOfficeName]" — font not smaller than median |
| Data timestamp | IDX display practice — source not yet verified (no UCBA 2026 citation) | "Last updated: [date/time]" |
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

> **Verified 2026-03-26:** The REBNY IDX/VOW Compliance Checklist (Dec 2021) contains NO field-level
> restriction blocking ClosePrice, OriginalListPrice, or PreviousListPrice from IDX display.
> NAR IDX Policy 7.58 requires sold data on IDX when publicly accessible — NYC sold prices are public via ACRIS.
> Field existence comes from live `$metadata` (committed copy `data/cotality-enums.live.json`); population must be checked live (Master §0.5).

| Feature | IDX | VOW |
|---------|-----|-----|
| Authentication | None | Consumer login required |
| Data scope | Fields the live Cotality IDX Plus feed returns | Same feed + VOW registration requirements |
| Address display | Follows `InternetAddressDisplayYN` | Same |
| Agent info fields | Public fields only | Extended agent info |
| Sold/closed data (ClosePrice, CloseDate) | **Available** | Available |
| Days on market | Mallan derives DOM from `OnMarketDate`; `DaysOnMarket` / `CumulativeDaysOnMarket` are suppressed and null on the feed (Master §0.5) | Same |
| Search | Basic property search | Advanced, saved searches |

### VOW Requirements

| Requirement | Implementation |
|-------------|----------------|
| Consumer registration | Email + name minimum; must agree to terms |
| Terms of use | Must include data use restrictions |
| No scraping notice | Prohibit automated data collection |
| Attribution | Same as IDX — "Listing Courtesy of [Broker]" |
| Opt-out respect | Same gate logic as IDX — all 6 gates apply |

### Field Availability on the Cotality IDX Plus Feed

> **Corrected 2026-03-26:** ClosePrice, CloseDate, OriginalListPrice, PreviousListPrice CAN be displayed publicly.
> The REBNY IDX/VOW Compliance Checklist has no VOW-only restriction on them.
>
> A field the live Cotality feed returns on Mallan's licence is available to Mallan; whether it may be shown, and to
> whom, is decided by REBNY/UCBA rules and the display rules on this page (Master §21.1 — both stacks apply).
> Re-verify a field with a live query before relying on it (Master §0.1: `$metadata` alone does not prove a field).

| Field | Display rule |
|-------|--------------|
| ClosePrice, CloseDate, OriginalListPrice, PreviousListPrice, PurchaseContractDate, WithdrawnDate | REBNY IDX display permission (checked 2026-03-26 against REBNY's IDX Plus specification); may be displayed publicly when returned on Mallan's IDX Plus feed. Presence in `$metadata` or `data/cotality-enums.live.json` alone is not display permission. |
| ListingContractDate, BuyerFinancing | Conflicting rules: `compliance/FRONTEND-COMPLIANCE.md` §8 and `compliance/PORTALS-AND-RBAC.md` hide `ListingContractDate`; the feed writer strips `BuyerFinancing` before storage (`PRIVATE_FIELDS` in `lib/idx/trestle-mapper.ts`). Fail closed — do not display publicly until the REBNY rule is re-verified. |
| DaysOnMarket, CumulativeDaysOnMarket | Suppressed and null on the feed; DOM is derived from `OnMarketDate` (Master §0.5) |
| Concessions / ConcessionsAmount | Live fields; verify population before display |
| CancellationDate | Live field |
| ExpirationDate | Explicitly "Hidden" per UCBA Exhibit A — never display. |
| PropertyCondition | Agent-only per UCBA — with disclaimer if shown to agents. |
| Extended agent info (direct phone, email) | REBNY checklist prohibits seller/occupant contact info. Agent PII display is for attribution only. |

---

## Syndication Rules

### Active Syndication Portals (via Cotality)

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

- `SyndicateTo` enabled for portal distribution *(UCBA: `SyndicateYN`)*
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
- [ ] Gate 3: Check `InternetEntireListingDisplayYN` before IDX display *(no separate IDX field in the live Cotality schema)*
- [ ] Gate 4: Check `SyndicateTo` before syndication *(UCBA: `SyndicateYN`)*
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
