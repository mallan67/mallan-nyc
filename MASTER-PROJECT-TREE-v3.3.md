# Master Project Tree v3.3 — Mallan Real Estate Inc.

> **Project:** Mallan Real Estate Inc. | **License:** #10991205323
> **Audit:** Master Audit Report v3.3 | **Findings:** 225 (47 BLOCKER, 78 HIGH, 86 MEDIUM, 14 LOW)
> **Finding count reconciled:** 225 total (verified 2026-02-23). Delta from v3.2: +1 (new Trestle CI gate in AR.3).
> **Passes:** 39 | **Go-Live Gates:** 24 | **Current Phase:** Live Production
> **Trestle Migration:** Hard deadline March 31, 2026. Vendor may decommission earlier with notice; do not rely on quota boost.
> **Platform:** Next.js 16.1.6 on Vercel (live production at mallan.nyc) — CRM portals served from `public/crm/`, frontend pages via App Router
> **Last Updated:** 2026-03-13

---

# SECTION 0: FILE ROLES & PORTAL ARCHITECTURE

> **ENFORCED — NO EXCEPTIONS. READ THIS FIRST BEFORE TOUCHING ANY FILE.**
> **Confusing file roles causes architectural damage that takes sessions to undo.**
> **Last verified: 2026-02-23 by user (Maya Allan).**

## 8 CRM Files (all in `public/crm/`)

| File | Role | Who Views / Uses | Key Detail |
|------|------|-----------------|------------|
| `dashboard.html` | **CRM HUB** | Broker (admin), Agents (own section), Clients (own portal) | 6 portals, opens external files via `window.open()` |
| `index-built.html` | **IDX SEARCH** | Each agent from their OWN Broker/Agent Admin | Each agent's OWN PRIVATE search via IDX Plus (read-only). Not shared. Not guaranteed to match full the legacy upstream intermediary (LMP) inventory. |
| `SALE-FORM-REDESIGN.html` | **SUBMISSION** | Listing Agent | Agent creates/edits OWN exclusive sale listing (CRM internal — RLS submission is via the legacy upstream intermediary (LMP), not mallan.nyc) |
| `SALE-FORM-WITH-TOOLS.html` | **VIEW ONLY** | Agents + Buyers (buyers see masked listing agent info) | Read-only listing display + Transit, Print, Email tools |
| `RENTAL-FORM-REDESIGN.html` | **SUBMISSION** | Listing Agent | Agent creates/edits OWN exclusive rental listing (CRM internal — RLS submission is via the legacy upstream intermediary (LMP), not mallan.nyc) |
| `RENTAL-FORM-WITH-TOOLS.html` | **VIEW ONLY** | Agents + Renters (renters see masked listing agent info) | Read-only listing display + Transit, Print, Email tools |
| `BUYER-DEAL-FORM.html` | **INTERNAL COMMISSION REQUEST** | Agent only (submits to broker, can check status, can edit errors) | Buyer's agent → broker. Internal only. Not client-facing. No buyer/tenant visibility into commission splits or status. |
| `TENANT-DEAL-FORM.html` | **INTERNAL COMMISSION REQUEST** | Agent only (submits to broker, can check status, can edit errors) | Renter's agent → broker. Internal only. Not client-facing. No buyer/tenant visibility into commission splits or status. |

### How CRM Opens External Files
- `openListingForm('sale')` → `SALE-FORM-REDESIGN.html` (submission)
- `openListingForm('rental')` → `RENTAL-FORM-REDESIGN.html` (submission)
- `openSearch()` → `index-built.html` (agent's own private search)
- `openDealForm('buyer')` → `BUYER-DEAL-FORM.html` (commission request → broker)
- `openDealForm('tenant')` → `TENANT-DEAL-FORM.html` (commission request → broker)
- WITH-TOOLS viewer files — need to be wired from CRM (not yet linked)

## 6 Portals

| Portal | Who | How They Get Access | What They See |
|--------|-----|---------------------|--------------|
| **Broker Admin** | Maya Allan (principal broker) | Default login | FULL admin access — all sections, all agents, all clients, compliance, approvals |
| **Broker/Agent Admin** | Each licensed agent (Maya also has this since she acts as agent) | Agent login | Their OWN private dashboard, OWN search, OWN clients, listing submission, documents, marketing, tools. NOT shared with other agents. Actions NOT visible to others. |
| **Buyer Portal** | Buyer client | Self-login OR broker assigns as lead OR agent invites from backend | Sees ONLY what their agent provides. CANNOT see listing agent name. Can: Like, Dislike, Let's Discuss, Schedule Appointment, Open House Request, Offer Submission. Can submit "view this" link → becomes pending. |
| **Tenant Portal** | Tenant/renter client | Same as buyer | Same process as buyer portal but for rentals |
| **Seller Portal** | Seller client | Listing agent invites | Follows: showings, price, comparables, showing comments, open house comments, price adjustment suggestions, marketing, offers |
| **Landlord Portal** | Landlord/property owner | Listing agent invites | Same as seller portal but for rentals |

## HARD RULES (ENFORCED — NO ASSUMPTIONS)

1. **REDESIGN = SUBMISSION** — listing agent creates/edits OWN exclusive listing in CRM (RLS submission is via the legacy upstream intermediary (LMP), not mallan.nyc)
2. **WITH-TOOLS = VIEW ONLY** — agents + buyers/renters view listings (buyers/renters see masked listing agent info)
3. **DEAL FORMS = INTERNAL COMMISSION REQUEST** — agent → broker only. Agent can check status and edit errors. NOT client-facing. No buyer/tenant visibility into commission splits or status.
4. **Search is PER AGENT** — each agent searches from their own portal. Private. Not shared. Agent A cannot access Agent B's search histories, saved searches, clients, or deals (enforced at API + DB row-level scope in Phase 2/3). **No global / brokerage-wide search exists.**
5. **CRM Admin is BROKER ONLY** — agents do NOT access the CRM admin sections
6. **Broker/Agent Admin is PRIVATE** — each agent has their own instance. Not viewed or shared with other agents.
7. **Buyer/Tenant Portal** — client sees ONLY what agent provides. CANNOT see listing agent name. **Masking enforced in API response layer, not viewer JS** — API strips listing agent fields before response reaches buyer/tenant portal.
8. **Seller/Landlord Portal** — invited by listing agent. Follows showings, price, comparables, comments, marketing, offers.
9. **Broker assigns leads** from backend. **Agents invite clients** from backend.
10. **Do NOT create duplicate files.** If roles change, update THIS section FIRST.

---

# SECTION 1: HOW TO USE THIS FILE

## Pre-Commit Checklist (before git push)
- [ ] Section 0 roles & hard rules still match reality (no drift)
- [ ] All new BLK/HI bugs added to SECTION 3
- [ ] Trestle-related strings scanned — 0 deprecated URLs
- [ ] Finding count still matches audit header (225)
- [ ] All newly checked checkboxes updated with dates/initials

## How to Use
1. **Before starting work:** Read Section 0 above. Then read the section you'll work on.
2. **When starting a task:** Mark the checkbox `[ ]` → `[x]` and note the date.
3. **Respect dependencies:** Don't start Phase N+1 until Phase N blockers are resolved.
4. **Severity key:** BLK = Blocker (must fix before go-live) | HI = High | MED = Medium | LO = Low

## Current Sprint

| Task | File | Assignee | Started | Status |
|------|------|----------|---------|--------|
| (empty — fill as you start work) | | | | |

---

# SECTION 2: COMPLETED WORK INVENTORY

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### IDX Search (`index-built.html`) — 85% COMPLETE
- Role: Each agent's OWN PRIVATE search of REBNY RLS listings
- 905+ JS functions, 26 listings, 15 modals, 5 view modes
- Reports system wired (8 formats x 5 outputs) — but generation logic incomplete
- 4 of 6 REBNY distribution gates enforced (Gates 4+5 missing)
- Fair Housing scanner, Coming Soon badges, REBNY attribution
- Off-market language removal, commission negotiability
- 6 compliance test listings (IDs 21-26)
- Email report system (.eml Outlook-compatible)
- Client section fixes (modal positioning, section toggle)
- Map polygons (123 neighborhoods, verified unique)
- Transit tool (49 stations)
- 27 test files (67 browser + 30 node checks)

### Sale Submission Form (`SALE-FORM-REDESIGN.html`) — 90% COMPLETE
- Role: Listing agent creates/edits OWN exclusive sale listing for RLS submission
- 719 fields, 93+ JS functions, 6 tabs + Tab 7 Commission
- Auto-save, validation, status state machine, conditional visibility
- Building + Media modals
- Commission Request Tab (auto-populates on Sold/SoldThruUs)

### Rental Submission Form (`RENTAL-FORM-REDESIGN.html`) — 88% COMPLETE
- Role: Listing agent creates/edits OWN exclusive rental listing for RLS submission
- 525 fields, 70+ JS functions, 6 tabs + Tab 7 Commission
- Same systems as sale (Coming Soon BLOCKED per REBNY)

### Sale Listing Viewer (`SALE-FORM-WITH-TOOLS.html`) — 40% COMPLETE
- Role: VIEW ONLY — agents + buyers view exclusive sale listings (buyers see masked listing agent info)
- PROBLEM: Currently coded as a submission form (has Submit button, editable fields, Save Draft)
- Needs CONVERSION to read-only viewer
- Has Transit tool (49 stations, Haversine distance, commute calculator) — CORRECT for viewer
- Has Print modal (13 sections, 5 presets) — CORRECT for viewer
- Has Email modal (visual listing card, clipboard copy) — CORRECT for viewer
- Tools are good; form mode is wrong
- Needs: listing agent info masking logic for buyer viewers

### Rental Listing Viewer (`RENTAL-FORM-WITH-TOOLS.html`) — 40% COMPLETE
- Role: VIEW ONLY — agents + renters view exclusive rental listings (renters see masked listing agent info)
- PROBLEM: Same as sale viewer — currently coded as submission form, needs conversion
- Has same tools as sale viewer (Transit, Print, Email) — CORRECT for viewer
- Needs: listing agent info masking logic for renter viewers

### CRM Hub (`dashboard.html`) — 80% COMPLETE
- Session 1-7: Broker Dashboard, Agent Roster, sidebar, referrals, commission, hash routing
- Session 8 (2026-03-17): Old CRM removed (MALLAN-NYC-CRM-FINAL2.html + 40 orphaned JS files)
- **Email Importer:** Couple detection, partner toggle, all roles + combos (Landlord+Seller)
- **Outlook Scanner:** Microsoft Graph OAuth, folder browser, StreetEasy lead parser, bulk import
- **Multi-Person Clients:** Secondary person fields (spouse/partner/co-owner) on Lead model, one card per unit
- **Landlord Dual Addresses:** property_address (rental unit) + home_address (owner's personal)
- **Client Workspace:** Notes endpoint, edit/delete notes, delete client, add person button, partner in header
- **Lease Tracking:** Only renters with actual leases, display names not emails
- **Validators:** All passing (Search 30/30, Sale 13/13, Rental 12/12, CRM 18/19, RLS 41/41)

### Commission Request Forms — 70% COMPLETE
- Role: INTERNAL — agent submits commission payment request to broker. Agent can check status and edit errors. NOT client-facing. No buyer/tenant visibility into commission splits or status.
- `BUYER-DEAL-FORM.html`: 1,618 lines, basic flow works
- `TENANT-DEAL-FORM.html`: 1,143 lines, basic flow works
- Contains deal info + commission calculation
- Agent can view submission status (pending/approved/denied)
- Agent can edit if they made an error

### Next.js Frontend — LIVE PRODUCTION (mallan.nyc)
- Next.js 16.1.6 on Vercel, App Router, 70+ components, 0 TS errors
- Prisma schema (42 models), middleware, security headers
- Compliance library (16 files committed to git)
- Listings served from Trestle API + PostgreSQL (Neon), media cached to Cloudflare R2
- 169 API route files, 221 HTTP handlers, 10 cron jobs
- **Status:** Live production on Next.js 16.1.6 (Vercel) — CRM portals served from `public/crm/`, listings from Trestle API + PostgreSQL (Neon/Prisma)

---

# SECTION 3: KNOWN BUGS & ERRORS

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### CRM Hub (`dashboard.html`) — 15 issues

- [ ] **BLK:** Agent login points to wrong tab ID (`dashboard` → should be `agent-dashboard`, ~line 25277)
- [ ] **HI:** Missing `client-book` section (sidebar references nonexistent div)
- [ ] **HI:** Broker-only tabs not hidden from agent sidebar on portal switch
- [ ] **HI:** Empty portal landing pages (client, seller, landlord) — persona shell mismatch (A-07 BLOCKER)
- [ ] **HI:** WITH-TOOLS viewer files not linked from CRM (no way to open listing viewer)
- [ ] **MED:** 13 empty/stub tabs (off-market, pocket-listings, NDA, UHNW, etc.)
- [ ] **MED:** Missing `mkt-email-settings` panel in Marketing Hub
- [ ] **MED:** Weak filter functions (filterClientsByType, filterComms)
- [ ] **MED:** `window.crmAgentRoster` never initialized
- [ ] **MED:** Modal close handlers incomplete
- [ ] **MED:** Sidebar not updated on portal switch
- [ ] **MED:** Listing agent info masking not implemented for buyer/tenant portal views
- [ ] **LO:** Stale comments referencing removed features

### Sale Submission Form (`SALE-FORM-REDESIGN.html`) — 13 issues

- [ ] **BLK:** Missing REBNY fields I40 (First Showing Date), I22 (Unit Pet Policy), I23 (Photo Sort Order)
- [ ] **HI:** Distribution gate cascade not implemented (no Owner Opt-Out / Participant Only validation)
- [ ] **MED:** saveSaleMedia() is a close handler with alert — not yet wired to media upload API
- [ ] **MED:** saveSaleBuilding() is a close handler with alert — not yet wired to building data API
- [ ] **MED:** saveSalesDraft() is stub (doesn't use performAutoSave())
- [ ] **MED:** Modal close functions expect event param but called without event
- [ ] **MED:** Fair Housing scanner may not be bound to input events
- [ ] **MED:** calculateSaleTHFinancials() field ID naming may not match
- [ ] **LO:** Commission Tab 7 unlock conditions may need broadening per UCBA
- [ ] **LO:** Validation summary not triggered on tab navigation

### Rental Submission Form (`RENTAL-FORM-REDESIGN.html`) — 10 issues

- [ ] **BLK:** Missing REBNY field I7 (Lobby Attendant)
- [ ] **HI:** submitRentalListing() is stub (just shows alert, not functional)
- [ ] **HI:** Coming Soon blocking may not be fully enforced
- [ ] **MED:** saveRentalMedia() is a close handler with placeholder comment — not yet wired to media upload API
- [ ] **MED:** saveRentalBuilding() is a close handler with placeholder comment — not yet wired to building data API
- [ ] **MED:** Modal close event handling inconsistency (same as sale)
- [ ] **MED:** Fair Housing scanner event binding unclear
- [ ] **MED:** Verify I12 (Building Ownership Type) exists in rental building tab
- [ ] **LO:** Same commission unlock logic question as sale form

### Sale Listing Viewer (`SALE-FORM-WITH-TOOLS.html`) — ARCHITECTURAL MISMATCH

- [ ] **BLK:** File is coded as submission form but should be VIEW-ONLY
- [ ] **BLK:** Has Submit button + submitSalesListing() — must be removed
- [ ] **BLK:** Has Save Draft button + saveSalesDraft() — must be removed
- [ ] **BLK:** All form fields are editable `<input>` — must be converted to read-only display
- [ ] **HI:** Has auto-save (30s interval) — must be removed (nothing to save in viewer)
- [ ] **HI:** Has validation engine for mandatory REBNY fields — not applicable for viewer
- [ ] **HI:** Has status state machine (Draft→Active→Sold) — not applicable for viewer
- [ ] **HI:** Has distribution gate checkboxes as editable — should be display-only info
- [ ] **HI:** No listing agent info masking for buyer viewers
- [ ] **MED:** No mechanism to RECEIVE listing data from CRM/search (needs data loading)
- [ ] **MED:** Not linked from CRM — needs `openListingViewer('sale', listingId)` function
- [ ] OK: Transit tool (correct for viewer)
- [ ] OK: Print modal (correct for viewer)
- [ ] OK: Email modal (correct for viewer)

### Rental Listing Viewer (`RENTAL-FORM-WITH-TOOLS.html`) — ARCHITECTURAL MISMATCH

- [ ] **BLK:** Same as sale viewer — coded as submission form, should be VIEW-ONLY
- [ ] **BLK:** Has Submit button + submitRentalListing() — must be removed
- [ ] **BLK:** Has Save Draft — must be removed
- [ ] **BLK:** All form fields editable — must be read-only
- [ ] **HI:** Has auto-save, validation, status machine — not applicable
- [ ] **HI:** Has distribution gates as editable checkboxes — should be display-only
- [ ] **HI:** No listing agent info masking for renter viewers
- [ ] **MED:** No data loading mechanism
- [ ] **MED:** Not linked from CRM
- [ ] OK: Transit, Print, Email tools (correct for viewer)

### IDX Search (`index-built.html`) — 20 issues

- [ ] **BLK:** Delivery modal functions are empty stubs (openDeliveryModal, closeDeliveryModal)
- [ ] **HI:** Financial calculator helper functions missing (monthlyMortgagePayment, getMansionTax, getNYCTransferTax, getNYSTransferTax, getMortgageRecordingTax, calcVal, calcSet, calcSetPct)
- [ ] **HI:** Main map not initialized for split-view mode (only modal map works)
- [ ] **HI:** Reports modal generation logic incomplete (populateReportPreview undefined)
- [ ] **MED:** Only 4 of 6 distribution gates enforced (Gates 4+5 missing)
- [ ] **MED:** Address suppression missing in Grid view and Map view
- [ ] **MED:** customerDB never initialized (client feedback fails)
- [ ] **MED:** Coming Soon field name mismatch (comingSoonDate vs comingSoonStartDate)
- [ ] **MED:** Neighborhood filter has no "show all" fallback when none selected
- [ ] **MED:** Escape key tries to close 5+ modals simultaneously (competing closers)
- [ ] **MED:** Fair Housing scanner has limited patterns (should have 19)
- [ ] **MED:** Closed listing suppression doesn't handle all terminal states
- [ ] **LO:** Detail page responsive ordering broken at tablet
- [ ] **LO:** Grid column render has no undefined fallback
- [ ] **LO:** Photo lightbox thumbnail strip overflow on mobile
- [ ] **LO:** Pagination missing boundary guards after perPage change
- [ ] **LO:** Filter modal stubs (openFilterModal/closeFilterModal empty)
- [ ] **LO:** Save search has no duplicate name check
- [ ] **LO:** Mobile search form overflow below 480px

### Commission Request Forms (`BUYER-DEAL-FORM.html` + `TENANT-DEAL-FORM.html`) — 7 issues
Role: INTERNAL — agent submits commission payment request to broker. Agent can check status and edit errors. NOT client-facing. No buyer/tenant visibility into commission splits or status.

- [ ] **MED:** Buyer commission request form has minimal validation (only address + name)
- [ ] **MED:** Tenant commission request form has minimal validation
- [ ] **MED:** Commission calculation may have edge cases
- [ ] **MED:** No status tracking UI for agent to check approval status
- [ ] **LO:** Commission form listing lookup uses inline data — should query Trestle API + PostgreSQL
- [ ] **LO:** Preview function may not populate all fields
- [ ] **LO:** Toast notifications are generic (no error differentiation)

---

# SECTION 4: PHASE 0 — REMAINING CRM BUILDOUT

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Priority 1 — Architectural Fixes (Viewer Conversion)

> **#1 EXECUTION RISK:** Until viewer conversion completes, masking is theoretical, data loading is theoretical, gate enforcement is theoretical, and RBAC is theoretical. This is the single destabilizing variable. **Finish Phase 0 before touching Phase 1.**

Convert WITH-TOOLS files from submission forms to read-only viewers.

**Acceptance Criteria (must ALL pass before viewer is considered converted):**
- [ ] 0 writable `<input>` fields — all converted to `<span>`/`<div>` display
- [ ] 0 submit/save endpoints — Submit button, Save Draft button removed
- [ ] 0 autosave timers — 30s interval removed
- [ ] 0 validation engines — mandatory field checks removed (not applicable for viewer)
- [ ] 0 status state machines — Draft→Active→Sold flow removed
- [ ] Viewer loads data ONLY from server API via `loadListingData(listingId)` from URL param or `postMessage` from CRM
- [ ] Buyer/tenant masking applied by role — if viewer is buyer/tenant portal, hide `.listing-agent-info`
- [ ] Distribution gates shown as display-only info (not editable checkboxes)

**Tasks:**
- [ ] Convert `SALE-FORM-WITH-TOOLS.html` to read-only viewer — this is VIEW ONLY for agents + buyers
- [ ] Convert `RENTAL-FORM-WITH-TOOLS.html` to read-only viewer — this is VIEW ONLY for agents + renters
- [ ] Add listing agent info masking logic for buyer/renter viewers (WITH-TOOLS files)
- [ ] Add data loading mechanism: `loadListingData(listingId)` from URL param or `postMessage` from CRM
- [ ] Wire CRM to open listing viewers: `openListingViewer('sale', id)` → `window.open('SALE-FORM-WITH-TOOLS.html?id='+id)`

### Priority 2 — CRITICAL Bugs
- [ ] Fix agent login tab ID in CRM (~line 25277)
- [ ] Add missing REBNY fields to sale submission form REDESIGN (I40, I22, I23)
- [ ] Add missing REBNY field to rental submission form REDESIGN (I7)
- [ ] Fix delivery modal stubs in search
- [ ] Fix financial calculator helper functions in search
- [ ] Add status tracking + edit capability to commission request forms (BUYER-DEAL-FORM + TENANT-DEAL-FORM)

### Priority 3 — CRM Portal Buildout
- [ ] Broker Admin: 14 empty admin tabs to build
- [ ] Broker/Agent Admin: each agent's private dashboard, search, clients, listings
- [ ] Buyer/Tenant Portal: listing view (listing agent name MASKED), Like/Dislike/Let's Discuss/Schedule/Open House/Offer, "view this" → pending
- [ ] Seller/Landlord Portal: showings, price, comparables, comments, marketing, offers, price adjustments
- [ ] Listing Manager redesign (PAUSED — needs reference screenshot)
- [ ] 10 frontend wiring fixes (FRONTEND-WIRING-FIXES.md)

---

# SECTION 5: PHASE 1 — DATA ARCHITECTURE & BACKEND FOUNDATION

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 0 complete

- [ ] **BLK D-01:** Canonical data model — 5 schemas + 1 financial ledger:
  1. **Listing** — all 902 IDX Plus fields, status state machine, distribution gates
  2. **Agent** — license, team, brokerage association, portal access
  3. **Client** (Lead) — dedupe, consent, source tracking, agent ownership
  4. **Deal** (Transaction) — listing link, parties, timeline, status
  5. **Commission** — split calculations, broker approval, ledger entries
  6. **Financial Ledger** (separate) — immutable transaction log, audit trail
  - [ ] D-01a: Lead/Client entity with deduplication policy (phone + email match, merge rules)
  - [ ] D-01b: Consent timestamp on every client record (`consent_captured_at`) — required before storing/displaying PII
  - [ ] D-01c: `agent_id` foreign key on all client records (ownership enforcement)
  - [ ] D-01d: Client intake form as required build artifact (captures consent + contact + source)
- [ ] **BLK D-02:** Database schema (PostgreSQL + Prisma) — all 902 IDX Plus fields mapped
- [ ] **BLK D-03:** Enum dictionary — all 1,993 REBNY lookup values normalized
- [ ] **BLK D-04:** State machine schemas — listing lifecycle (17 states), deal pipeline, commission request (pending/approved/denied/paid)
- [ ] **BLK D-05:** RBAC matrix — field-level visibility per portal type (broker sees all, agent sees own, buyer/renter sees masked listing agent)
- [ ] **BLK D-06:** Data ownership model — broker owns all, agents see only own data, clients see only what agent provides
- [ ] **BLK D-07:** Audit trail schema — SHIELD Act compliant, AuditEvent entity (all write operations generate event, all PII access logged) — Go-Live Gate #24
- [ ] **HI D-08:** Data lifecycle — retention, archival, deletion policies

### Pre-Build Lock Checklist
- [ ] Confirm canonical schemas finalized (5 + ledger)
- [ ] Confirm all server-enforced gates enumerated (9 total — defined in `compliance/BACKEND-VALIDATION-ENGINE.md` Section E.6)
- [ ] Confirm RBAC matrix complete before API scaffolding
- [ ] Confirm no inline JS logic considered authoritative
- [ ] Confirm Trestle endpoint fully migrated to `api.cotality.com/trestle`

---

# SECTION 6: PHASE 2 — AUTHENTICATION & AUTHORIZATION

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 1 data model

- [ ] **BLK A-01:** 6 login types (broker, agent, buyer, seller, renter, landlord)
- [ ] **BLK A-02:** Session management — portal-scoped sessions
- [ ] **BLK A-03:** Broker admin access enforcement (Maya only for admin sections)
- [ ] **BLK A-04:** Agent data isolation — each agent sees ONLY own data. Agent A cannot access Agent B's search histories, saved searches, clients, or deals (API + DB row-level scope)
- [ ] **BLK A-05:** Client data scoping — buyer/renter sees ONLY what agent provides
- [ ] **BLK A-06:** Listing agent name masking for buyer/renter portal views — **enforced in API response layer, not viewer JS** (API strips listing agent fields before response reaches buyer/tenant)
- [ ] **BLK A-07:** PII consent capture — consent required before storing/displaying PII. Fail closed when consent unknown.
- [ ] **HI A-08:** Two-step agent onboarding (broker invites → agent completes)
- [ ] **HI A-09:** Client self-registration + broker lead assignment + agent invite flows

---

# SECTION 7: PHASE 3 — API & INTEGRATION LAYER

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 2 auth

- [ ] **BLK I-01:** Trestle API integration — `api.cotality.com/trestle` — **hard deadline: March 31, 2026.** Vendor may decommission earlier with notice; do not rely on quota boost.
- [ ] **BLK I-02:** OAuth 2.0 client credentials flow — token endpoint validated against new host
- [ ] **BLK I-03:** Server-side only MLS data access (no client-side API calls)
- [ ] **BLK I-04:** 6 distribution gates enforced server-side:

| # | Gate | Field | Effect when TRUE |
|---|------|-------|-----------------|
| 1 | Owner Opt-Out | `InternetEntireListingDisplayYN = False` | Listing hidden from all public display (IDX/VOW/syndication) |
| 2 | Participant Only | `InternetEntireListingDisplayYN = False` (via agreement type) | Visible only to RLS participants, not public |
| 3 | IDX Display | `IDXEntireListingDisplayYN = False` | Excluded from IDX feeds |
| 4 | Syndication | `SyndicateYN = False` | Excluded from 3 Trestle opt-in portals |
| 5 | Coming Soon | `ComingSoonDate` in future | Badge required, no showings/open house until date |
| 6 | Closed Status | Terminal status (Sold/Leased/Withdrawn/Expired/Canceled) | Suppressed within 24 hours of status change |

> **Single source of truth:** enforcement logic lives in backend compliance engine only. Frontend reads gate state — never computes it.

- [ ] **HI I-05:** CRM listing data entry (REDESIGN forms store internally — actual RLS submission is via the legacy upstream intermediary (LMP))
- [ ] **HI I-06:** IDX/VOW feed consumption (search results for agents)
- [ ] **HI I-07:** Commission request API (agent → broker internal workflow) — submission, broker decision, status updates
- [ ] **MED I-08:** Syndication controls (SyndicateYN, 3 Trestle opt-in portals)

### Trestle Migration Requirements (AR.1–AR.5)

**AR.1 Mandatory Migration:**
1. All references to deprecated hosts removed from: backend services, API clients, environment configs, documentation, test fixtures, comments
2. Base URL in environment config: `TRESTLE_API_URL=https://api.cotality.com/trestle` — separate staging and production values — no inline strings
3. OAuth2 token endpoint validated against new host
4. All integration tests pass using new endpoint before Phase 3 completion

**AR.2 Infrastructure Layer Update (Layer 0):**
- Environment-based external API configuration (`TRESTLE_API_URL`)
- Trestle/Cotality endpoint migration completed
- OAuth token refresh validation
- External API health monitoring (IDX heartbeat check)
- Deprecated endpoint detection in CI pipeline
- Old media URLs continue through 2026 warranty; do not treat as permanent

Trestle integration is **Layer 0 dependency** — no production feature work proceeds without stable external API connectivity.

**AR.3 CI/CD Enforcement:**
Deployment fails automatically if:
- A **new runtime** reference to `api-trestle.corelogic.com` or `api-prod.corelogic.com` is detected by `scripts/ci/guardrails.mjs` §12 (non-comment, non-allowlisted code). The media-proxy route (`app/api/media/proxy/route.ts`), the IDX DTO modules (`db-to-public-dto.ts` / `public-dto.ts`), test fixtures, and comments are **intentionally allowlisted** — they keep handling the legacy media hosts during the 2026 warranty window.
- IDX integration test suite fails
- OAuth token refresh test fails

This rule applies to all branches targeting production.

**AR.4 Go-Live Gates (Gate #8 + Gate #21):**

| Gate | Scope | Verification Method | Required Result | Phase |
|------|-------|-------------------|----------------|-------|
| #8 | Functional connectivity | Live API call to new host | Successful response from `api.cotality.com/trestle` | 3 |
| #21 | Hygiene enforcement | Codebase scan + CI checks + OAuth refresh test | 0 deprecated URLs anywhere in repo | 3 |

**AR.5 Operational Risk:**
- Temporary quota boost from vendor must NOT be relied upon for performance assumptions
- Performance modeling must assume standard quota limits, no artificial buffer
- Load testing must simulate realistic quota constraints

**Failure to migrate results in:**
- No listing ingestion from RLS
- No IDX/VOW refresh (mallan.nyc reads from RLS via IDX Plus — read-only)
- No agent/company lookup
- Complete CRM data blackout

Note: mallan.nyc does NOT submit listings to the RLS. RLS submission is via the legacy upstream intermediary (LMP). However, Trestle migration failure still breaks all IDX read operations.

This is an **existential system dependency**.

---

# SECTION 8: PHASE 4 — FRONTEND INTEGRATION

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 3 APIs

- [ ] **BLK F-01:** Connect remaining CRM functions to live APIs (listings from Trestle API + PostgreSQL)
- [ ] **BLK F-02:** Connect submission forms (REDESIGN) to CRM listing storage API (RLS submission is via the legacy upstream intermediary (LMP))
- [ ] **BLK F-03:** Connect viewer forms (WITH-TOOLS) to listing data API
- [ ] **BLK F-04:** Connect search (index-built) to IDX feed API — **WARNING: search currently enforces only 4/6 distribution gates (Gates 4+5 missing). Must implement Gates 4 (Syndication) and 5 (Coming Soon) BEFORE connecting to live feed.**
- [ ] **BLK F-05:** Connect commission request forms to commission API — **WARNING: commission forms currently have minimal validation (only address + name). Must add full validation (all required fields, edge cases, error handling) BEFORE API wiring or governance breaks.**
- [ ] **HI F-06:** Portal-scoped data loading (each user sees only their data)
- [ ] **HI F-07:** Listing agent name masking in WITH-TOOLS viewers for buyer/renter
- [ ] **MED F-08:** Real-time status updates (commission approval, listing status)

---

# SECTION 9: PHASE 5 — COMPLIANCE & SECURITY HARDENING

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 4 integration

- [ ] **BLK S-01:** REBNY content scanners — Fair Housing (19 patterns — canonical list: `js/compliance/fair-housing.js` in search-modular + `compliance/BACKEND-VALIDATION-ENGINE.md` Section 4), agent info in descriptions, compensation in remarks
- [ ] **BLK S-02:** Address suppression enforced across all views (InternetAddressDisplayYN)
- [ ] **BLK S-03:** Distribution gate cascade — all 6 gates server-side enforced
- [ ] **BLK S-04:** FARE Act compliance — InternetEntireListingDisplayYN for rentals
- [ ] **BLK S-05:** NY SHIELD Act — data access logging, breach response plan
- [ ] **HI S-06:** WCAG 2.1 AA accessibility across all portals
- [ ] **HI S-07:** CSP, security headers, CORS configuration
- [ ] **HI S-08:** Rate limiting, abuse protection on all API endpoints
- [ ] **MED S-09:** Rejection rate monitoring (<5% quarterly threshold)

---

# SECTION 10: PHASE 6 — TESTING & GO-LIVE

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

### Depends on: Phase 5 compliance

- [ ] **BLK T-01:** All 6 distribution gates pass integration tests
- [ ] **BLK T-02:** All 24 Go-Live gates pass (see Section 11)
- [ ] **BLK T-03:** Portal isolation tests — agent A cannot see agent B's data
- [ ] **BLK T-04:** Listing agent masking tests — buyer/renter cannot see listing agent name in WITH-TOOLS viewers
- [ ] **HI T-05:** Load testing — concurrent users per portal type
- [ ] **HI T-06:** Mobile responsive testing across all portals and forms
- [ ] **HI T-07:** Fair Housing compliance scan — 0 violations
- [ ] **MED T-08:** End-to-end workflow tests (listing submission → search → viewer → commission request → payment)

---

# SECTION 11: GO-LIVE GATE CHECKLIST (24 Gates)

> **MANDATORY — READ SECTION 0 FIRST.**
> REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION (agent → broker).
> Search = PER AGENT (private). Buyer/Tenant CANNOT see listing agent name.

| # | Gate | Phase | Status |
|---|------|-------|--------|
| 1 | Canonical data model finalized | 1 | [ ] |
| 2 | Database schema deployed | 1 | [ ] |
| 3 | All 902 IDX Plus fields mapped | 1 | [ ] |
| 4 | RBAC matrix enforced (6 portal types) | 2 | [ ] |
| 5 | 6 login types working | 2 | [ ] |
| 6 | Agent data isolation verified (row-level DB scope) | 2 | [ ] |
| 7 | Listing agent masking for buyer/renter verified | 2 | [ ] |
| 8 | Trestle API connected — functional connectivity to `api.cotality.com/trestle` | 3 | [ ] |
| 9 | OAuth 2.0 flow working — token refresh against new host | 3 | [ ] |
| 10 | Server-side only MLS access verified | 3 | [ ] |
| 11 | 6 distribution gates enforced server-side | 3 | [ ] |
| 12 | Submission forms connected to CRM listing storage (RLS submission via the legacy upstream intermediary (LMP)) | 4 | [ ] |
| 13 | Viewer forms receiving live data | 4 | [ ] |
| 14 | Search connected to IDX feed | 4 | [ ] |
| 15 | Commission request workflow end-to-end (submission → broker decision → status updates) | 4 | [ ] |
| 16 | Fair Housing scanner — 0 violations | 5 | [ ] |
| 17 | Address suppression — 0 leaks | 5 | [ ] |
| 18 | FARE Act compliance verified | 5 | [ ] |
| 19 | NY SHIELD Act logging active | 5 | [ ] |
| 20 | All integration tests pass | 6 | [ ] |
| 21 | Trestle endpoint fully migrated — hygiene enforcement: 0 deprecated URLs in codebase + CI checks pass | 3 | [ ] |
| **22** | **PII consent enforcement — consent captured at all PII intake points, required before storing/displaying PII, fail-closed when consent unknown** | **2** | [ ] |
| **23** | **Commission governance — ledger immutability, audit logging for all commission changes, broker approval enforcement, split validation enforced, "do not calculate/disburse if split validation fails"** | **4** | [ ] |
| **24** | **Audit logging enforcement — all write operations generate AuditEvent, all PII access logged, SHIELD Act retention enforced, no write path without audit trail** | **5** | [ ] |

### Deployment Authorization
- Deployment pipeline auto-blocks if ANY gate returns false
- Manual override prohibited
- Written sign-off required: broker + tech lead + compliance
- Phase Completion Certificate signed by Tech Lead before advancing to next phase

---

# SECTION 12: BLOCKER INVENTORY (47 total)

47 BLOCKERs. All must be resolved before go-live.

---

# SECTION 13: KEY FILE REFERENCE

### CRM Files (all in `public/crm/`)
| File | Lines | Role |
|------|-------|------|
| `dashboard.html` | 31,489 | CRM Hub — 6 portals |
| `index-built.html` | 30,845 | IDX Search — agent's own private search |
| `SALE-FORM-REDESIGN.html` | 7,903 | Sale Submission — CRM internal (RLS submission via the legacy upstream intermediary (LMP)) |
| `SALE-FORM-WITH-TOOLS.html` | 8,696 | Sale Viewer — agents + buyers (masked listing agent for buyers) |
| `RENTAL-FORM-REDESIGN.html` | 6,988 | Rental Submission — CRM internal (RLS submission via the legacy upstream intermediary (LMP)) |
| `RENTAL-FORM-WITH-TOOLS.html` | 7,720 | Rental Viewer — agents + renters (masked listing agent for renters) |
| `BUYER-DEAL-FORM.html` | 1,618 | Commission Request — buyer's agent → broker (internal, no client visibility) |
| `TENANT-DEAL-FORM.html` | 1,143 | Commission Request — renter's agent → broker (internal, no client visibility) |

### Project Files (git/Vercel)
| File | Purpose |
|------|---------|
| `MASTER-PROJECT-TREE-v3.3.md` | THIS file — roles, portals, progress, phases, go-live gates, enforcement |
| `CLAUDE.md` | Project instructions for Claude Code agents |
| `compliance/fields.json` | 902 IDX Plus fields — machine-readable |
| `compliance/lookups.json` | 114 picklists, 1,993 REBNY values |

---

# SECTION 14: DEPENDENCY RULES & ENFORCEMENT

```
Phase 0 (CRM Buildout) ──→ Phase 1 (Data) ──→ Phase 2 (Auth) ──→ Phase 3 (API)
                                                                    │
                                                          Phase 4 (Frontend) ──→ Phase 5 (Compliance) ──→ Phase 6 (Go-Live)
```

## Rule 1: No Phase N+1 until Phase N blockers resolved

**Aligned with:** Dependency graph (AK), Phased roadmap (AL)

**Enforcement:**
- CI rejects branch merges tagged for Phase N+1 if any Phase N BLOCKER remains open
- CI rejects branch merges tagged for Phase N+1 if any Phase N gate test fails
- Phase Completion Certificate signed by Tech Lead before advancing
- This prevents silent drift

## Rule 2: No production deployment until all 24 Go-Live gates pass

**Aligned with:** Go-Live Gates #1–#24, deployment authorization

**Enforcement:**
- Deployment pipeline auto-blocks if any gate returns false
- Manual override prohibited
- Written sign-off required for deployment authorization (broker + tech lead + compliance)
- This removes executive override risk

## Rule 3: No API calls from client-side — server-side only

**Aligned with:** Backend enforcement boundary (AM)

**Critical for:** Trestle credentials, rate limits, data integrity, compliance gating

**Technical Enforcement:**
- CSP header blocks external API domains from frontend
- Trestle keys stored server-side only (never in client bundles)
- Proxy layer handles all outbound API calls
- Client attempts to call external APIs fail CORS by design
- Without this, RESO/Trestle keys are exposed

## Rule 4: No deprecated Trestle URLs in codebase

**Aligned with:** AR.3 CI enforcement, O-04b migration table

**Enforcement:**
- CI-gated (AR.3) — build fails on detection
- Standardized ENV variable: `TRESTLE_API_URL=https://api.cotality.com/trestle`
- Separate staging and production values
- A **new runtime** use of the deprecated URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) triggers build failure via `guardrails.mjs` §12; the media-proxy allowlist + DTO/test references are exempt (legacy media hosts stay valid during the 2026 warranty)
- Hard deadline: March 31, 2026. Vendor may decommission earlier with notice; do not rely on quota boost.

## Rule 5: Fail closed — any uncertainty defaults to NON-DISPLAY

**This is the most important rule.** It applies to:

### A. Listing Display
If compliance matrix unresolved, syndication rule ambiguous, status mismatch, or address suppression conflict → **fail-closed**: listing does NOT display.
**Aligned with:** Compliance layer (Layer 4)

### B. Distribution Surfaces
If compliance flag unresolved → **fail-closed**: no export.

### C. PII
If consent missing → **fail-closed**: block storage and display.
**Aligned with:** Go-Live Gate #22 (PII consent enforcement)

### D. Commission
If split validation fails → **fail-closed**: do not calculate, do not disburse.
**Aligned with:** Go-Live Gate #23 (Commission governance)

### E. Trestle Sync
If API response malformed → **fail-closed**: do not partially ingest listing.

---

## SYSTEM DOCTRINE — FAIL-CLOSED PRINCIPLE

> **This doctrine sits under Layer 0. It governs ALL system behavior.**

1. **Data without audit trail = invalid**
2. **Data without consent = invalid**
3. **Data without UUID = invalid**
4. **State transitions without logging = invalid**
5. **Compliance uncertainty = non-distribution**
6. **External API failure = no partial ingestion**
7. **Permission ambiguity = deny**

---

*End of Master Project Tree v3.3 — MALLAN NYC CRM*
*96,018 lines of code audited across 8 files*
*Final reconciled finding count: 225 (47 BLOCKER, 78 HIGH, 86 MEDIUM, 14 LOW)*
*Canonical schemas: 5 + 1 financial ledger schema*
*Go-Live gates: 24 (expanded from 21 — added PII consent #22, commission governance #23, audit logging enforcement #24)*
*Trestle/Cotality endpoint migration enforced — hard deadline March 31, 2026*
*Vendor may decommission earlier with notice; do not rely on quota boost*
*Old media URLs continue through 2026 warranty; do not treat as permanent*
*ENV: `TRESTLE_API_URL=https://api.cotality.com/trestle`*
*All migration controls integrated into Layer 0 + CI gating + Go-Live checklist*
