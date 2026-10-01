# Compliance Updates Log

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Feed:** REBNY RLS via the Cotality API | **LMP:** RealPlus (listing input to RLS) | **IDX Display:** Cotality IDX Plus Web API (read-only on mallan.nyc)

---

> ### AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **NY law/DOS, Fair Housing and REBNY rules (UCBA 2026, REBNY Listing Service)** govern use, display and conduct. 2. **The live Cotality API** is the only authority for provider fields, values and picklists (`data/cotality-enums.live.json` is its committed copy).
> 3. **Mallan business rules** govern how verified facts are used; Mallan-created fields (mostly commercial and private-listing fields) are Mallan facts, never presented as provider data, and can restrict but never override a law/REBNY/provider display restriction (Master §0.2, §4, §21.1). 4. **Fail closed = NON-DISPLAY.** Plan: `MALLAN-PLATFORM-MASTER-PLAN.md`; state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

---

## How to Use This File

This is a running changelog of compliance-affecting updates from REBNY, Cotality, NYC/NYS law, and NAR. Check this file before any production deployment or form update.

**Monitor these sources:**
- https://www.rebny.com/rls-updates/ — REBNY RLS bulletins
- https://www.rebny.com/compliance/ — REBNY compliance updates
- https://www.cotality.com — Cotality platform updates
- NYC Council legislation tracker — Local laws affecting real estate

---

## 2026

### April 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-04-14 | Internal | **Compliance Findings Audit** — 22 findings reviewed, 5 fixed (CAN-SPAM unsubscribe, agency disclosure, consent gating, IDX attribution, Coming Soon gate), 4 inaccurate, 13 accepted/informational. Fair Housing scanner expanded from 6 to 21 patterns (aligned with CRM frontend). RegistrationGate consent transmission fixed. | Compliance, Frontend, Email, API | **Complete** |
| 2026-04-14 | Cotality | **Cotality content patches #189** (Mar 4, 2026 — 3 new fields, 30 field changes, 37 new lookup values) and **#188** (Jan 27, 2026 — 98 new lookup values). | Field mapping, Picklists | **Superseded** — field and enum truth is the live `$metadata` contract (`data/cotality-enums.live.json`, drift-checked by `npm run cotality:verify`) |
| 2026-04-14 | REBNY | **No new policy changes since Jan 2026 UCBA.** Verified rebny.com/rls-updates/ and rebny.com/compliance/. All 5 UCBA 2026 changes already implemented. POLD (Participant Only) gate already enforced. | No action | Verified |

### March 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-03-01 | Internal | **Sprint 9: Wire CRM Files to Live Backend** — CORS + dual auth (Bearer token + httpOnly cookie), login page, auth gates on all files, mock data removed from production paths, `api-client.js` rewritten with Bearer auth + fail-fast, 42 API endpoints live. See `compliance/AUTH-AND-API-SECURITY.md` for full architecture. | Backend, Security, All CRM files | **Complete** |

### February 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-02-23 | Cotality | **API host migration (deadline March 31, 2026)** — the provider moved to `api.cotality.com/trestle`; the retired provider hosts are blocked in code by `scripts/ci/guardrails.mjs`. Media URLs work through the 2026 warranty. | All API integration, backend | **Complete** — all code uses `api.cotality.com/trestle` (verified 2026-04-14). The media proxy keeps the retired hosts allowlisted for photo URLs through the 2026 warranty. |
| 2026-02-21 | Internal | Compliance library created (14 docs + 2 JSON) | All development | Complete |
| 2026-02-21 | REBNY | No post-January 2026 UCBA amendments found | No action needed | Verified |
| 2026-02-18 | Internal | Address suppression — 8 display leaks fixed in search | Frontend | Complete |
| 2026-02-18 | Internal | Fair Chance Housing Act pattern added to search scanner | Frontend | Complete |

### January 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-01-01 | REBNY | **UCBA 2026 effective** — January 2026 redline revision | All systems | Active |
| 2026-01-01 | REBNY | DOM reset: 90 days → 30 days for Withdrawn/Cancelled | DOM calculation | Documented |
| 2026-01-01 | REBNY | Protected period: 6 names / 90 days (revised) | CRM workflow | Documented |
| 2026-01-01 | REBNY | Owner Opt-Out: must submit through LMP only (email eliminated) | Process | Documented |
| 2026-01-01 | REBNY | Multiple bids disclosure updated | Offer management | Documented |

---

## 2025

### August 2025

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2025-08-01 | REBNY | **Compensation fields removed from RLS** (NAR Settlement) | All systems | Applied — fields clean |
| 2025-08-01 | REBNY | Fields removed: BuyerAgencyCompensation, BuyerAgencyCompensationType, SubAgencyCompensation, SubAgencyCompensationType, all offer-of-compensation fields | Forms, search, display | Verified clean |
| 2025-08-01 | REBNY | RLS updated with two rental categories: Standard Active + Non-Syndicated (FARE Act) | Rental distribution | Documented |

### June 2025

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2025-06-11 | NYC | **FARE Act effective** (LL 119/2024) | Rental listings | Active |
| 2025-06-11 | NYC | InternetEntireListingDisplayYN=False when landlord doesn't pay broker fee | IDX filtering | Documented |
| 2025-06-11 | NYC | DCWP penalties: §20-699.21 ($750/$1,800), §20-699.22 ($375/$900) | Compliance | Documented |

### March 2025

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2025-03-01 | Cotality | Provider rebranded as **Cotality** | URLs, documentation | Documented |

### February 2025

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2025-02 | REBNY | Off-market photos: only primary photo remains in IDX/VOW | Photo display | Documented |
| 2025-02 | REBNY | Private Outdoor Space became required field | Forms | Documented |
| 2025-02 | REBNY | Listing Data Compliance Policy updated (Exhibit C) | Violations | Documented |

### January 2025

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2025-01 | REBNY | New listing ID format: "RLS" + digits (e.g., RLS1234567) | System IDs | Documented |
| 2025-01-01 | NYC | **Fair Chance Housing Act effective** (LL 24/2023) | Fair Housing scanner | Applied |
| 2025 | REBNY | "Participant Only Network" listing type added | Distribution gates | Documented |
| 2025 | REBNY | Buyer Representation Agreement required before showing | Showing workflow | Documented |
| 2025 | REBNY | Commission negotiability disclosure required | Forms, agreements | Documented |
| 2025 | REBNY | Mandatory ethics training as access condition | Agent onboarding | Documented |

---

## 2024

### August 2024

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2024-08 | NAR | **NAR Settlement effective** — buyer agreements required, compensation decoupled | All systems | Applied |
| 2024-08 | NAR | Touring Agreement required before property tours | Document center | Applied |

---

## Pending / Watch Items

| Item | Source | Expected | Impact |
|------|--------|----------|--------|
| FARE Act fee fields | REBNY | TBD ("will take some time") | Rental forms — currently using PublicRemarks + MoveInCosts |
| FARE Act Second Circuit ruling | Courts | TBD | Could modify or uphold FARE Act requirements |
| Official neighborhood picklist | REBNY | TBD | SubdivisionName validation |
| Cotality schema changes | Cotality | Ongoing | Detected by `npm run cotality:verify` against live `$metadata` |

---

## How to Add Updates

When a new compliance change is identified:

1. Add entry to the appropriate year/month section above
2. Include: Date, Source, Change description, Impact, Status
3. Update the relevant compliance document (e.g., UCBA-2026.md, NYC-NYS-REQUIREMENTS.md)
4. If field or enum changes: regenerate `data/cotality-enums.live.json` with `npm run cotality:pull` and confirm with `npm run cotality:verify`
5. If rule changes: update the affected compliance doc
6. Commit with message: `compliance: [source] — [brief description]`
