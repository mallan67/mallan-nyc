---
name: CRM Remaining Work Plan
description: Complete implementation plan for all remaining CRM fixes — missing API routes, form field data loss, stubs, Phase 4 crons, and documentation cleanup. Created 2026-03-18 after comprehensive audit.
type: project
---

# CRM REMAINING WORK PLAN — 2026-03-18

## Context

A full compliance + functional audit was completed on 2026-03-18. All compliance findings (41 total) are resolved except 2 documentation items. All runtime crashes fixed. 14 of 16 cron jobs are live. This plan covers everything still remaining.

---

## PHASE A — Missing API Routes (Priority 1) — COMPLETE (2026-03-18)

> **All 15 routes created. 0 TypeScript errors.**

### A1. Lead Assignment + Creation

**A1a. `PATCH /api/crm/leads/[id]`**
- **Called from:** `panels.js:2962, 3328` — broker assigns leads to agents
- **Create:** `app/api/crm/leads/[id]/route.ts`
- **Logic:** Accept `{ assigned_agent_id }` body, update `Lead.agent_id`, log AuditEvent
- **Auth:** `requireBroker` (only broker assigns leads)
- **Pattern:** Same as `PATCH /api/crm/clients/[id]` but on the Lead model

**A1b. `POST /api/crm/leads`**
- **Called from:** `panels.js:3300` — Outlook email import creates leads
- **Add:** POST handler to existing `app/api/crm/leads/route.ts` (currently GET only)
- **Logic:** Accept lead fields (first_name, last_name, email, phone, source, notes), create Lead record, log AuditEvent
- **Auth:** `requireAgentOrBroker`
- **Dedup:** Check existing lead by email before creating (panels.js Outlook import relies on this)

### A2. Document Vault

**A2a. `POST /api/crm/documents/upload`**
- **Called from:** `documents.js:64` — file upload from Document Vault
- **Create:** `app/api/crm/documents/upload/route.ts`
- **Logic:** Accept multipart FormData (file + metadata: scope, scopeId, doc_type, title), upload file to R2 (use same pattern as `app/api/crm/listings/[id]/media/upload/route.ts`), create Document record with file_url, log AuditEvent
- **Auth:** `requireAgentOrBroker`
- **Key fields:** `file_url`, `file_size`, `mime_type`, `doc_type`, `title`, `agent_id`, `deal_id` (optional)

**A2b. `POST /api/crm/documents/[id]/request-approval`**
- **Called from:** `documents.js:78`
- **Create:** `app/api/crm/documents/[id]/request-approval/route.ts`
- **Logic:** Update `Document.status` to `"pending_approval"`, create Notification for broker, log AuditEvent
- **Auth:** `requireAgentOrBroker`

**A2c. `POST /api/crm/documents/[id]/approve`**
- **Called from:** `documents.js:87`
- **Create:** `app/api/crm/documents/[id]/approve/route.ts`
- **Logic:** Update `Document.status` to `"approved"`, create Notification for agent, log AuditEvent
- **Auth:** `requireBroker`
- **Note:** `/api/crm/documents/batch-approve` already exists for bulk — this is for single-doc approval

### A3. Agent Photo Upload (Broker)

**`POST /api/crm/agents/[id]/photo`**
- **Called from:** `panels.js:1249, 1538` — broker uploads photo for a specific agent
- **Create:** `app/api/crm/agents/[id]/photo/route.ts`
- **Logic:** Same as `/api/crm/agents/me/photo` but takes agent ID from URL params instead of session
- **Auth:** `requireBroker` (only broker can upload for other agents)
- **Pattern:** Copy from `app/api/crm/agents/me/photo/route.ts`, change `auth.userId` to `params.id`

### A4. 1099 Tax Generation (3 routes)

**Called from:** `panels.js:4777, 4792, 4884`

**A4a. `POST /api/crm/1099/generate`**
- **Logic:** For a single agent: query all `CommissionPayment` records for the tax year where `status = 'paid'`, sum amounts, generate 1099 data object (agent name, SSN placeholder, total compensation, tax year). Store result in a JSON field or new model.
- **Auth:** `requireBroker`
- **Note:** Does NOT generate actual IRS form — generates the data needed for the accountant. The UI displays it for review.

**A4b. `POST /api/crm/1099/generate-all`**
- **Logic:** Loop through all agents with paid commissions in the tax year, call generate logic for each
- **Auth:** `requireBroker`

**A4c. `GET /api/crm/1099/status`**
- **Logic:** Return generation status per agent (generated, pending, missing_data)
- **Auth:** `requireBroker`

**Implementation note:** No Prisma model exists for 1099 data. Options:
1. Store in `Agent.metadata` JSON field (if it exists)
2. Create a simple `Tax1099` model (id, agent_id, tax_year, total_compensation, status, generated_at)
3. Return computed results without persistence (simplest, no migration needed)

**Recommend option 3** for now — compute on the fly from CommissionPayment records.

### A5. CE Course Tracking (3 routes)

**Called from:** `panels.js:7208, 7823, 7828, 7845`

**A5a. `GET /api/crm/ce-courses`**
- **Logic:** Return all CE courses, optionally filtered by `?agent_id=X`
- **Auth:** `requireAgentOrBroker` (agents see own, broker sees all)

**A5b. `POST /api/crm/agents/[id]/ce-courses`**
- **Logic:** Add a CE course record for an agent (course_name, provider, hours, completion_date, certificate_url)
- **Auth:** `requireAgentOrBroker` (agent adds own, broker adds for anyone)

**A5c. `DELETE /api/crm/agents/[id]/ce-courses/[courseId]`**
- **Logic:** Delete a CE course record
- **Auth:** `requireAgentOrBroker`

**Implementation note:** No `CeCourse` Prisma model exists. Options:
1. Store in `AgentMetrics.metrics` JSON (fragile)
2. Create new model (migration required)
3. Use AuditEvent with `action: "ce_course_added"` and structured `changes` JSON

**Recommend:** Store as JSON array in a new `ce_courses` field on the Agent model, or use a lightweight standalone table. For speed, option 3 (AuditEvent-backed) works but is hacky. Best: add a `ce_courses Json @default("[]")` field to the Agent model via migration.

### A6. License Renewal Alert Settings

**`POST /api/crm/settings/renewal-alerts`**
- **Called from:** `panels.js:7669`
- **Create:** `app/api/crm/settings/renewal-alerts/route.ts`
- **Logic:** Accept `{ license_reminder_days, ce_reminder_days, eo_reminder_days }`, store in broker's NotificationPreference or a settings JSON
- **Auth:** `requireBroker`
- **Simplest:** Store in `NotificationPreference` with `type: "renewal_alerts"` and preferences JSON

### A7. Missing Portal Routes (5 routes)

**Called from:** `portals.js`

**A7a. `GET /api/portal/favorites`** (line 342)
- Return client's favorited listings (from `ClientListingAction` where `action_type = 'favorite'`)

**A7b. `GET /api/portal/messages`** (line 542)
- Return messages for the client (from `Notification` where `recipient_id = lead.id, channel = 'message'`)

**A7c. `POST /api/portal/messages`** (line 608)
- Client sends a message (create Notification for their agent)

**A7d. `GET /api/portal/open-houses`** (line 952)
- Return upcoming open houses for client's favorited/sent listings

**A7e. `POST /api/portal/open-houses/rsvp`** (line 992)
- Client RSVPs for an open house

**All portal routes:** Use `requireAuth()` and verify `userType === 'lead'`

---

## PHASE B — Form Field Data Loss (Priority 2) — ALL COMPLETE (2026-03-19)

> **Sale form: 171 fields fixed + full RLS field audit completed.**
> - 17 checkbox groups with name+value, 26 standalone fields with id
> - collectSaleFormData() updated with array collection for 21 groups
> - All checkbox group field names verified against CSV (Exposures, View, PatioAndPorchFeatures, DiningType, Flooring, Cooling, Heating, WindowFeatures, LaundryFeatures all match)
> - LaundryFeatures_Unit renamed to LaundryFeatures (CSV line 270)
> - data-rls-field="StreetName" removed from visible address input (was duplicate — hidden field at line 352 is the correct mapping)
> - SyndicateYN removed from 6 informational portal checkboxes (kept on 1 main control only)
> - name="saleCommissionType" collision fixed (radio renamed to saleBuyerCommPaidBy)
> - Commission Comments textarea got id="saleCommissionComments"
> - Agent hidden inputs now read by direct getElementById (were outside container)
> - Edit mode: 15+ wrong element IDs corrected, checkbox group population via _checkBoxes() helper
> - Preview tab: 3 wrong element IDs fixed (URL case, neighborhood, zip)
> - Distribution restructured: IDX + Syndication as primary sale controls, InternetEntireListingDisplayYN locked for standard permissions, no VOW references
>
> **Rental form (B4): DONE.**
> **Deal forms (B5/B6): DEFERRED — internal commission request forms, not connected to Trestle/IDX/RLS.**
>
> **PENDING TRESTLE CONFIRMATION:**
> - `FirstShowingDate` — used in form, NOT in CSV. Backend uses `ActivationDate`. Do NOT remap without confirmation.
> - `PossessionDate` — in Trestle mapper, NOT in CSV. Do NOT change without confirmation.

### B1. Sale Form — Add IDs to All Checkbox Groups

**File:** `public/crm/SALE-FORM-REDESIGN.html`

**Method:**
1. Read the full form file
2. Find every `<input type="checkbox">` and `<select>` that lacks an `id` attribute
3. Add a unique `id` following the naming convention: `sale{SectionName}_{FieldName}` (e.g., `saleExposure_North`, `saleViews_CityView`)
4. For multi-value checkbox groups (Exposure, Views, etc.), also add a `name` attribute for group collection

**Known missing groups (from audit):**
- Exposure (N/S/E/W)
- Views (City, Park, River, Bridge, Water, Skyline, Garden, Courtyard, Open, etc.)
- Additional Rooms (Home Office, Library, Den, Media Room, etc.)
- Kitchen Type (Eat-In, Galley, Windowed, Open, Chef's, etc.)
- Kitchen Features (Dishwasher, Microwave, Wine Cooler, etc.)
- Dining (Formal, Dining Area, Eat-In Kitchen, etc.)
- Bathroom Features (Tub, Stall Shower, Soaking Tub, Jacuzzi, etc.)
- Feature Details (Fireplace, High Ceilings, Washer/Dryer, etc.)
- Windows (North, South, East, West, Corner, Floor-to-Ceiling, etc.)
- Ceilings (Standard, High, Coffered, Beamed, etc.)
- Flooring (Hardwood, Marble, Tile, Carpet, etc.)
- Storage (Walk-In Closet, Storage Unit, Bike Room, etc.)
- Fresh Air (Balcony, Terrace, Patio, Roof Deck, etc.)
- HVAC (Central Air, PTAC, Window Unit, etc.)

**Estimated:** 80-100 checkboxes to update

### B2. Update `collectSaleFormData()` to Collect Checkbox Groups

**File:** `public/crm/SALE-FORM-REDESIGN.html` — function at ~line 6475

**Method:** After adding IDs, update the collection function to:
1. For each checkbox group, collect all checked values into an array
2. Map to the correct RESO/RLS field name (e.g., `Exposure` → array of directions)
3. Add to the formData object

**Example:**
```javascript
// Collect Exposure checkboxes
var exposureChecked = [];
document.querySelectorAll('[name="saleExposure"]:checked').forEach(function(cb) {
  exposureChecked.push(cb.value);
});
if (exposureChecked.length) data.Exposure = exposureChecked.join(',');
```

### B3. Specific Fields Missing IDs

| Field | Lines (approx) | RLS Field |
|-------|----------------|-----------|
| Flip Tax Type | 1093 | FlipTaxType |
| Flip Tax Paid By | 1100 | FlipTaxPaidBy |
| Flip Tax Remarks | 1116 | FlipTaxRemarks |
| Staff Bedrooms | 1745 | StaffBedrooms |
| Staff Bathrooms | 1749 | StaffBathrooms |
| Ceiling Height | 1789 | CeilingHeight |
| Number of Garage Spaces | 1828 | GarageSpaces |

### B4. Rental Form — Same Audit — COMPLETE (2026-03-18)

**File:** `public/crm/RENTAL-FORM-REDESIGN.html`

**Fixed:**
1. **7 Commercial Lease Spec fields** — added IDs: `rentalCommUsableSqFt`, `rentalCommLeaseType`, `rentalCommZoning`, `rentalCommCeilingHeight`, `rentalCommFrontage`, `rentalCommMinLeaseTerm`, `rentalCommLeaseExpiration`
2. **Basement Type select** — added `id="rentalTHBasementDetails"` with `data-rls-field="Basement"`
3. **10 checkbox groups** — added `name` + `value` attributes: Exposure (4), Views (7), Kitchen Features (2), Appliances (3), Room Type (3), Dining (4), Additional Rooms (8), Storage (4), Building Amenities (11), In-Unit Features (8), Outdoor Space (6)
4. **Heating (43 checkboxes) + Cooling (25 checkboxes)** — already had `name`/`value`, now collected as arrays
5. **Fees table** — added `data-fee-field` attrs (type/description/amount) to 6 hardcoded rows + dynamic rows, collected as `DealFees[]` array
6. **Open House** — added `data-oh-field` attrs (date/startTime/endTime/type/notes), collected as `OpenHouses[]` array
7. **collectRentalFormData()** — added `checkboxGroups` array (15 groups), fees/OH structured collection, commercial + basement field mapping
8. **ID collision fix** — renamed building storage checkbox `rentalStorage` → `rentalBldgStorage` + updated preview reference

### B5. Wire Deal Form IDX Search to API — DEFERRED

**Files:** `BUYER-DEAL-FORM.html`, `TENANT-DEAL-FORM.html`

**Status:** Deferred. Deal forms are INTERNAL commission request forms (agent → broker). They should NOT connect to Trestle/IDX/RLS. The WITH-TOOLS viewer files (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) are the ones that feed the listings view. Deal form search wiring is a future sprint item.

### B6. Add Edit Mode to Deal Forms — DEFERRED

Same — deferred to a future sprint alongside B5.

---

## PHASE C — CRM Stub & UX Fixes (Priority 3) — COMPLETE (2026-03-18)

> **All 6 fixes done. 0 TypeScript errors.**

### C1. Notification Settings Save Handler

**File:** `panels.js:12090-12116`
**Fix:** Add `onchange` handlers to toggle checkboxes that call `MallanAPI._fetch('/api/crm/notifications/preferences', { method: 'PUT', body: ... })`
**Note:** The API at `/api/crm/notifications/preferences` already exists with GET and PUT.

### C2. Integrations Page Buttons

**File:** `panels.js:12118-12140`
**Fix:** Either wire "Connect" buttons to OAuth flows (if integrations exist) or add `onclick` handlers that show "Coming Soon" toast. Don't leave dead buttons.

### C3. CRM Dashboard postMessage Listener

**File:** `app.js` or `panels.js`
**Fix:** Add `window.addEventListener('message', ...)` handler that listens for `{ type: 'listing_saved' }` messages from form windows and auto-refreshes the listings panel.
**Note:** The forms already send `postMessage` on save (added this session).

### C4. Timeline XSS Fix

**File:** `ui-components.js:139-140`
**Fix:** Change `item.title` and `item.description` in innerHTML to use `Utils.esc(item.title)` and `Utils.esc(item.description)`. Same for `item.time`.

### C5. Commission POST Auth Fix

**File:** `app/api/crm/commissions/route.ts:45`
**Fix:** Change `requireAgentOrBroker` to `requireBroker` on the POST handler (or add explicit role check inside).

### C6. Client DELETE Cascade Fix

**File:** `app/api/crm/clients/[id]/route.ts:278-282`
**Fix:** Before deleting the Lead, cascade-delete related records:
- `ActivityLog` where `lead_id = id`
- `FollowUpTask` where `lead_id = id`
- `FamilyMember` where `person_id = id` OR `related_person_id = id`
- `ShowingFeedback` where `lead_id = id`
- `Showing` where `lead_id = id`
- `Notification` where `recipient_id = id, recipient_type = 'lead'`
- `LeadScore` where `lead_id = id`
- `ConvictionScore` where `lead_id = id`
- `SavedSearch` where `lead_id = id`
- `Comment` where `lead_id = id`
- `IntentEvent` where `lead_id = id`
- `BehavioralEvent` where `lead_id = id`

Use `prisma.$transaction()` to ensure atomicity.

---

## PHASE D — Phase 4 Crons (Priority 4) — COMPLETE (2026-03-18)

> **Both crons + libraries created. All 16 crons now live in vercel.json. 0 TypeScript errors.**

### D1. Experiment Metrics (daily 9am)

**Create:** `lib/experiment/metrics.ts` (~130 lines) + `app/api/cron/experiment-metrics/route.ts`
**Logic:**
1. Find active `PricingExperiment` records
2. For each arm: aggregate `EngagementEvent` by type (views, inquiries, saves, showings, dwell_time)
3. Store in `ExperimentArm.summary_metrics` JSON
4. Auto-conclude if past `end_date`
**Add to vercel.json:** `{ "path": "/api/cron/experiment-metrics", "schedule": "0 9 * * *" }`

### D2. Demand Signals (daily 10am)

**Create:** `lib/demand-index/collector.ts` + `lib/demand-index/indexer.ts` (~250 lines total) + `app/api/cron/demand-signals/route.ts`
**Logic:**
1. Collect signals: first-party search volume by neighborhood (from `BehavioralEvent`), NYC building permits (SODA API), DOB filings
2. Store raw signals in `DemandSignal`
3. Compute weighted composite `DemandIndex` score per neighborhood
4. Evaluate `DemandAlert` thresholds, fire notifications
**Env vars needed:** `SODA_DATASET_ACRIS_MASTER`, `SODA_DATASET_DOB_PERMITS`, SODA app token
**Add to vercel.json:** `{ "path": "/api/cron/demand-signals", "schedule": "0 10 * * *" }`

---

## PHASE E — Documentation Cleanup (Priority 5) — COMPLETE (2026-03-18)

> **All 3 doc fixes applied.**

### E1. FinancialLedger Decision
**Issue:** `FinancialLedger` model exists with `immutable_hash` field but no code writes to it.
**Options:** (a) Implement hash chain during commission tracker sprint, (b) Remove from CLAUDE.md and schema.
**Recommend:** Implement — it's a strong compliance differentiator for audit trail integrity.

### E2. CLAUDE.md Path Fix
**Issue:** Says `lib/rls-validator/` but code is in `lib/compliance/`
**Fix:** Update CLAUDE.md reference.

### E3. CLAUDE.md Cron Count
**Issue:** Says 16 crons but only 14 exist (2 Phase 4 remaining).
**Fix:** Update when Phase 4 done, or note them as "planned".

---

## EXECUTION ORDER SUMMARY

| Phase | Items | Status |
|-------|-------|--------|
| **A** | 15 API routes | **COMPLETE** |
| **B** | Sale form field audit + fixes, rental form fixes, deal form deferred | **COMPLETE** (sale + rental done, deals deferred) |
| **C** | 6 stub/UX fixes | **COMPLETE** |
| **D** | 16 crons (was 5) | **COMPLETE** — all 16 live |
| **E** | 3 doc updates | **COMPLETE** |
| **F** | Sale form REBNY distribution restructure | **COMPLETE** — IDX/Syndication primary, no VOW, InternetEntireListingDisplayYN locked |
| **G** | Sale form full RLS field audit | **COMPLETE** — 119 data-rls-field values verified against 479-field CSV |

## REMAINING (deferred / pending confirmation)

| Item | Status | Blocker |
|------|--------|---------|
| Deal form IDX search wiring (B5) | Deferred | Internal form, not RLS-connected |
| Deal form edit mode (B6) | Deferred | Internal form, not RLS-connected |
| `FirstShowingDate` → `ActivationDate` | **RESOLVED** (2026-03-19) | Trestle confirmed: FirstShowingDate not accepted. Remapped to ActivationDate in both forms. |
| `PossessionDate` | **RESOLVED** (2026-03-19) | Trestle confirmed: not sent, not accepted. Kept in mapper for RESO compat, always null. |
| FinancialLedger hash chain | Pending decision | Schema exists, no code writes to it |

**Total remaining:** ~1,590 lines across ~30 files

---

## COMPLETED WORK (for reference)

### Compliance Audit (2026-03-18)
- 41 findings across 8 agents, every file read line-by-line
- 39 findings resolved in code, 2 documentation-only remaining
- All CRITICAL (3), HIGH (5), and MEDIUM (11) findings fixed
- Fair Housing scanner expanded (Color + National Origin patterns added to backend + rental form)
- Distribution gates: 2 missing gates added to search alerts cron
- OData injection: sanitized on similar listings endpoint
- Auth: 5 endpoints fixed (geoclient, seller demand, seller fomo, contact GET, communications read)

### CRM Functional Audit (2026-03-18)
- 13 JS modules (~21,600 lines), 6 form files (~45,000 lines), 72 API routes audited
- 5 runtime crashes fixed (past deal modal, alerts, edit mode IDs, event log, double-click)
- 5 missing API routes created (audit-log, alerts, inquiries, task DELETE, document DELETE)

### Cron Jobs (2026-03-18)
- 9 new cron routes created (was 5, now 14)
- 2 new libraries: `lib/listing-momentum/scorer.ts`, `lib/social-proof/cache.ts`
- `seedDefaultTriggers()` added to lifecycle engine
- vercel.json updated with all schedules + 60s maxDuration for crons
- All 14 crons verified with `tsc --noEmit` — 0 errors
