# Compliance Updates Log

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Feed:** REBNY RLS via Trestle (Cotality) | **LMP:** legacy upstream intermediary (listing input to REBNY RLS) | **IDX Display:** Trestle IDX Plus WebAPI (read-only on mallan.nyc)

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## How to Use This File

This is a running changelog of compliance-affecting updates from REBNY, RESO, Cotality, NYC/NYS law, and NAR. Check this file before any production deployment or form update.

**Monitor these sources:**
- https://www.rebny.com/rls-updates/ — REBNY RLS bulletins
- https://www.rebny.com/compliance/ — REBNY compliance updates
- https://www.cotality.com — Trestle/Cotality platform updates
- NYC Council legislation tracker — Local laws affecting real estate

---

## 2026

### April 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-04-28 | Internal | **Master plan PR 10 (Neon shedding) shipped to production + 10 follow-on PRs in one overnight session.** (1) `lib/idx/trestle-mapper.ts` slim writer wraps the existing `stripPrivateFields()` so all programmatic Trestle write paths (`lib/idx/sync.ts` main loop + `syncAgentHistory`, `app/api/cron/feed-reconcile`, `app/api/crm/listings/reset-sync`) now persist only the 110-field consumer keep-set defined in `lib/compliance/raw-data-keep-fields.ts`. PII-affecting fields (`PrivateRemarks`, `ShowingInstructions`, `ListAgentEmail`, `ListAgentDirectPhone`) continue to be stripped pre-slim — the slim is layered on top, never replaces. Mallan-CRM-created listings (POST `/api/crm/listings`) preserved unchanged. (2) Production backfill executed: 19,371 rows slimmed, 103 MB raw_data dropped, listings table 270 → 173 MB, total DB 293 → 196 MB (58.6 % → 39.2 % of 500 MB cap). (3) Workstream C closed: PR #74 auction form (UCBA Art. I) + PR #73 broker ethics admin panel (UCBA Art. III §6) — both shipped with full Codex-review remediation. (4) New daily cron `app/api/cron/neon-branch-prune` at 04:00 UTC keeps the Neon-Vercel preview-branch integration under the free-tier cap (root-cause fix for recurring "Neon branching: Branch limit exceeded" preview-deploy check failures). (5) CI hardening — auto-retry workflow for Live Site Smoke runner-pool flakes; Trestle live audit graceful-skip when secrets missing. Full session log at `memory/SESSION-2026-04-28-allnighter.md`; full audit-trail in `memory/AUDITOR-LOG.md` ROUND 5. | Backend storage, data lifecycle, UCBA 2026 compliance, ops tooling, CI infrastructure | **Complete** — type-check 0, lint 0, 194/194 compliance tests, UCBA 46 PASS / 0 regressions, ops:health HEALTHY |
| 2026-04-14 | Internal | **Compliance Findings Audit** — 22 findings reviewed, 5 fixed (CAN-SPAM unsubscribe, agency disclosure, consent gating, IDX attribution, Coming Soon gate), 4 inaccurate, 13 accepted/informational. Fair Housing scanner expanded from 6 to 21 patterns (aligned with CRM frontend). RegistrationGate consent transmission fixed. | Compliance, Frontend, Email, API | **Complete** |
| 2026-04-14 | Cotality | **Trestle Content Patch #189** (Mar 4, 2026) — 3 new fields, 30 field changes, 37 new lookup values. **Patch #188** (Jan 27, 2026) — 98 new lookup values. Neither verified against trestle-mapper.ts or lookups. | Field mapping, Picklists | **ACTION REQUIRED** — download patch PDFs from Cotality, compare against trestle-mapper.ts |
| 2026-04-14 | REBNY | **No new policy changes since Jan 2026 UCBA.** Verified rebny.com/rls-updates/ and rebny.com/compliance/. All 5 UCBA 2026 changes already implemented. POLD (Participant Only) gate already enforced. | No action | Verified |

### March 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-03-01 | Internal | **Sprint 9: Wire CRM Files to Live Backend** — CORS + dual auth (Bearer token + httpOnly cookie), login page, auth gates on all files, mock data removed from production paths, `api-client.js` rewritten with Bearer auth + fail-fast, 42 API endpoints live. See `compliance/AUTH-AND-API-SECURITY.md` for full architecture. | Backend, Security, All CRM files | **Complete** |
| 2026-03-01 | Internal | RLS Validator v2 post-Sprint 9 verification: **0 UNKNOWN**, 10/10 sections PASS, 2 pre-existing ERRORS (cosmetic RESO→RLS renames), 2 pre-existing WARNINGS (ComingSoon rental — by design). No new issues from Sprint 9 changes. | Compliance | Verified |

### February 2026

| Date | Source | Change | Impact | Status |
|------|--------|--------|--------|--------|
| 2026-02-23 | Cotality | **Trestle API URL migration deadline: March 31, 2026** — old URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) deprecated → new URL `api.cotality.com/trestle`. Media URLs work through 2026 warranty. Extra quota boost available on new endpoint. | All API integration, backend | **Complete** — all code uses `api.cotality.com/trestle` (verified 2026-04-14). Media proxy allowlists legacy domains through 2026 warranty. |
| 2026-02-23 | Internal | Master Audit Report v3.3 — 225 findings, 39 passes. Trestle migration enforced at Layer 0 + CI gating + Go-Live gate #21 (Pass 39 — Section AR). Finding totals reconciled. Pre-build lock checklist added. | Documentation | Complete |
| 2026-02-21 | Internal | Compliance library created (14 docs + 2 JSON) | All development | Complete |
| 2026-02-21 | REBNY | No post-January 2026 UCBA amendments found | No action needed | Verified |
| 2026-02-19 | Internal | Field Authority Order added to all memory files | Documentation | Complete |
| 2026-02-19 | Internal | 23 RESO→RLS name renames documented | Field mapping | Complete |
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
| 2025-03-01 | Cotality | CoreLogic rebranded to **Cotality** | URLs, documentation | Documented |

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
| RESO Building Resource | RESO | TBD | New building-level fields in feeds |
| Official neighborhood picklist | REBNY | TBD | SubdivisionName validation |
| RESO DD 2.1 | RESO | TBD | Association Management + Offer Management |
| RESO DD 2.2 | RESO | TBD | webp MediaType, High-Speed Internet fields |
| RESO DD 3.0 | RESO | TBD | WaterBodyRestrictions fields |

---

## How to Add Updates

When a new compliance change is identified:

1. Add entry to the appropriate year/month section above
2. Include: Date, Source, Change description, Impact, Status
3. Update the relevant compliance document (e.g., UCBA-2026.md, NYC-NYS-REQUIREMENTS.md)
4. If field changes: update `fields.json` and/or `lookups.json`
5. If rule changes: update the affected compliance doc
6. Commit with message: `compliance: [source] — [brief description]`
