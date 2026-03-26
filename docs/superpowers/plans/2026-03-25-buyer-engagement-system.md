# CRM Workspace Modules + Lease Tracker + Buyer Engagement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM work end-to-end. Build the 4 missing workspace modules so every client type renders meaningful content. Redesign the lease tracker from bloated cards to a compact responsive table. Add tracked listing links so agents can see buyer/tenant engagement. No fake scores, no stubs, no dead ends.

**Architecture:** Everything flows through `workspace.js`. The lease tracker becomes a compact entry point. Type-specific modules inject real content into the workspace overview tab. Tracked links generate `ListingView` records that surface in buyer/tenant workspaces. Convert actions get frontend buttons.

**Tech Stack:** Vanilla JS (CRM dashboard), Prisma (PostgreSQL), Next.js 16 API routes, Node.js `crypto` for HMAC tokens. Follows existing CRM patterns: `FilterBar`, `ActivityTable`, `MallanAPI`, `CRM.*`, `Utils.*`.

**Spec:** `docs/superpowers/specs/2026-03-25-buyer-engagement-system-design.md`

---

## What Exists (DO NOT REBUILD)

| Component | File | Works? |
|-----------|------|--------|
| workspace.js generic 10-tab workspace | `public/crm/js/dashboard/workspace.js` | YES — all tabs render real data |
| Action bar (Send, Note, Task, Showing, CMA, Edit) | workspace.js:128-154 | YES |
| Smart alerts (lease expiry, liked-no-showing, etc.) | workspace.js:449-520 | YES |
| Right rail (contact, financial, preferences, lead score) | workspace.js:813-879 | YES |
| Sales CRM activeSellers() + seller workspace | `sales-crm/index.js:54-253` | YES |
| Convert API (6 actions) | `app/api/crm/convert/route.ts` | YES backend, NO frontend buttons |
| Listing sends + email + audit | `app/api/crm/listing-sends/route.ts` | YES |
| Portal reactions (like/dislike/discuss/schedule) | `app/api/portal/listings/[id]/react/route.ts` | YES |
| Listing engagement API | `app/api/crm/listing-engagement/route.ts` | YES |
| Buyers API (with listings_sent_count) | `app/api/crm/sales/buyers/route.ts` | YES |
| NYC qualification math | `lib/finance/nyc-qualification.ts` | YES — real underwriting |
| Lease tracker API (data assembly) | `app/api/crm/lease-tracker/route.ts` | YES data, NO fake predictions |
| Lead drip fields | prisma/schema.prisma:294-301 | YES |
| Outreach endpoint | `app/api/crm/lease-tracker/[id]/outreach/route.ts` | YES |

---

## Phase 1: Schema Foundation

### Task 1: Add ListingView model + 3 Lead fields

**Files:** `prisma/schema.prisma`

- [ ] Add `ListingView` model after `ClientListingAction` (~line 601):
  ```prisma
  model ListingView {
    id          BigInt   @id @default(autoincrement())
    lead_id     BigInt   @map("lead_id")
    listing_id  String   @map("listing_id")
    viewed_at   DateTime @default(now()) @map("viewed_at")
    device_type String?  @map("device_type")
    ip_hash     String?  @map("ip_hash")
    referrer    String?
    lead        Lead     @relation(fields: [lead_id], references: [id], onDelete: Cascade)
    @@index([lead_id, listing_id])
    @@index([listing_id])
    @@index([lead_id, viewed_at])
    @@map("listing_views")
  }
  ```
- [ ] Add `listing_views ListingView[]` reverse relation on Lead
- [ ] Add 3 fields to Lead: `preferred_channel String?`, `preferred_device String?`, `nurture_paused Boolean @default(false)`
- [ ] `npx prisma generate` + `npx prisma migrate dev --name add-listing-views-and-engagement`
- [ ] Commit: `feat(schema): add ListingView model + engagement fields on Lead`

---

## Phase 2: Tracked Listing Links

### Task 2: Token library (TDD)

**Files:** `lib/tracking/listing-token.ts`, `lib/tracking/__tests__/listing-token.test.ts`

- [ ] Write tests: deterministic 16-char base64url, different tokens for different lead/listing, validate with candidates, null for invalid
- [ ] Run tests — FAIL (module not found)
- [ ] Implement: `generateTrackingToken(leadId, listingId)` using HMAC-SHA256, `validateTrackingToken(token, listingId, candidates)`
- [ ] Run tests — 6 PASS
- [ ] Commit: `feat(tracking): HMAC token generation + validation`

### Task 3: POST /api/tracking/listing-view

**Files:** `app/api/tracking/listing-view/route.ts`

Public endpoint (token is auth). Validates token against recent sends, logs ListingView, updates Lead engagement fields + preferred_device.

- [ ] Implement endpoint (silent 204 on any failure — never errors to client)
- [ ] Commit: `feat(tracking): POST /api/tracking/listing-view`

### Task 4: GET /api/crm/listing-views

**Files:** `app/api/crm/listing-views/route.ts`

Agent/broker auth. Returns views grouped by listing with counts, unique viewers (distinct ip_hash), device breakdown.

- [ ] Implement endpoint
- [ ] Commit: `feat(tracking): GET /api/crm/listing-views`

### Task 5: Wire tracked URLs into listing-sends + listing page

**Files:** `app/api/crm/listing-sends/route.ts`, `app/components/TrackListingSend.tsx`, `app/listing/[id]/page.tsx`

- [ ] Add `import { generateTrackingToken }` to listing-sends, return `tracked_urls` per client in response
- [ ] Create `TrackListingSend.tsx` client component (reads `?t=` param, fires POST to tracking API after hydration, renders null)
- [ ] Add `<TrackListingSend>` to listing page alongside existing `<TrackListingView>`
- [ ] Commit: `feat(tracking): tracked URLs in listing-sends + TrackListingSend component`

### Task 6: Add views_count to buyers API

**Files:** `app/api/crm/sales/buyers/route.ts`

- [ ] Add `ListingView.groupBy` aggregation, add `views_count` to each buyer
- [ ] Commit: `feat(crm): enrich buyers with views_count from ListingView`

---

## Phase 3: Lease Tracker Redesign

### Task 7: Redesign lease-tracker.js — compact responsive table

**Files:** `public/crm/js/dashboard/panels/lease-tracker.js`

Replace the giant property cards with a **compact responsive table**. Each property is one row. Click a row to go to the landlord or tenant workspace.

**Remove:**
- Fake AI prediction scores (Sell/Buy/Renew/Outreach percentages)
- Priority score circle (average of fake scores)
- Inline tenant qualification (move to tenant workspace)
- Inline landlord signals (move to landlord workspace)
- "999 days ago" fallback text

**Keep:**
- KPI summary bar (Total, Rented, Vacant, Expiring, Dual Listed)
- Filter tabs (All, Expiring, Vacant, Dual Listed)
- Add Lease button + modal
- Edit Lease modal
- Outreach timeline (simplified — horizontal dots, not a section)

**New table columns:**
| Column | Data |
|--------|------|
| Address | `prop.address + unit` |
| Borough | `prop.borough` |
| Status badge | Rented/Vacant/Listed Rent/Listed Sale/Dual Listed |
| Landlord | Name (clickable → workspace) |
| Tenant | Name or "Vacant" (clickable → workspace) |
| Rent | `$X,XXX/mo` |
| Lease Ends | Date + urgency color (red ≤30d, orange ≤90d) |
| Outreach | 4 dots (6mo/90d/60d/30d) — filled=sent, empty=pending, red=overdue |
| Actions | Email Landlord, Email Tenant dropdowns |

**Responsive:** On mobile, collapse to card layout with address + status + landlord + tenant + lease end only.

- [ ] Rewrite `_renderDashboard()` — replace card loop with `ActivityTable.render()` table
- [ ] Rewrite `_renderPropertyCard()` as `_renderPropertyRow()` — single table row
- [ ] Simplify outreach to inline dot indicators (not a full timeline section)
- [ ] Remove `_renderQualification()`, `_renderSignals()` from this file (they'll live in workspace modules)
- [ ] Add responsive card fallback for mobile (matchMedia check)
- [ ] Remove `predictLandlordSell()`, `predictTenantBuy()`, `predictLeaseRenewal()`, `predictOutreachTiming()` from the API response (or keep data but don't render fake scores)
- [ ] Fix "999 days ago" — show "No outreach" instead
- [ ] Commit: `refactor(crm): redesign lease tracker — compact table, remove fake predictions`

### Task 8: Update lease tracker API — remove fake prediction scores from response

**Files:** `app/api/crm/lease-tracker/route.ts`

- [ ] Remove `predictions` object from response (or keep raw signals without scores)
- [ ] Keep `qualification` in response (it's real math, workspace will use it)
- [ ] Remove `priority_score` (was average of fake scores)
- [ ] Replace with simple sort: expiring soonest first, then vacant, then by rent
- [ ] Commit: `refactor(api): simplify lease tracker response — real data, no fake scores`

---

## Phase 4: Workspace Modules

These 4 modules render inside workspace.js lines 794-811. Each is a JS file that defines a global (`SellerWorkspace`, `BuyerWorkspace`, etc.) with a `render*Sections(cl)` function. The function returns HTML string that gets injected into the overview tab.

### Task 9: SellerWorkspace module

**Files:** `public/crm/js/dashboard/panels/sales-crm/seller-workspace.js`, `public/crm/dashboard.html`

**Pattern:** Follow inline seller workspace in index.js (lines 149-253) — header, tabs, tab content.

**Sections to render (inside overview tab):**
- **Communication strip:** Preferred channel badge, last reached out, last engaged, gap
- **Listing status:** Active listing linked via `active_sale_listing_id` — status, price, DOM, showings count. "Create Listing" button if no active listing (calls convert API `promote_to_listing`)
- **Outreach history:** Recent AuditEvents (listing_sent, email:sent) — compact list
- **Entity/Attorney:** Entity name/type, attorney name/phone/email (from Lead fields)
- **Convert actions:** "Convert to Buyer" / "Convert to Renter" buttons (call convert API `role_transition`)

- [ ] Create `seller-workspace.js` with `SellerWorkspace.renderSellerSections(cl)`
- [ ] Add `<script>` tag to dashboard.html (before workspace.js or after sales-crm/index.js)
- [ ] Commit: `feat(crm): add SellerWorkspace module — listing status, outreach, convert actions`

### Task 10: BuyerWorkspace module (engagement dashboard)

**Files:** `public/crm/js/dashboard/panels/sales-crm/buyer-workspace.js`, `public/crm/dashboard.html`

**This is the buyer engagement dashboard from the spec, but rendered INSIDE the workspace overview tab.**

**Sections:**
- **Communication strip:** Preferred channel, preferred device, last reached out, last engaged, gap
- **Engagement summary:** Total views, listings sent count, views with multiple IPs (shared)
- **Action timeline:** Two-sided feed (agent=blue, client=green) from listing-engagement + listing-views APIs
- **Listings sent table:** Per listing — views, unique viewers, last viewed, device, reaction
- **Facts:** Observable data — neighborhoods engaged, portal logins, days since engagement. NO scores.
- **Convert actions:** "Buyer Rep Signed" button (convert API `buyer_rep_signed`), "Convert to Seller/Renter" buttons
- **Quick actions:** Send Listings, Schedule Showing, Log Outreach (delegate to existing SalesCRM/Workspace functions)

- [ ] Create `buyer-workspace.js` with `BuyerWorkspace.renderBuyerSections(cl)`
- [ ] Fetch `GET /api/crm/listing-views?lead_id=X` and `GET /api/crm/listing-engagement?client_id=X` for data
- [ ] Add `<script>` tag to dashboard.html
- [ ] Commit: `feat(crm): add BuyerWorkspace module — engagement timeline, views, facts`

### Task 11: LandlordWorkspace module

**Files:** `public/crm/js/dashboard/panels/rentals-crm/landlord-workspace.js`, `public/crm/dashboard.html`

**Sections:**
- **Communication strip:** Same as seller/buyer
- **Rental listing status:** Active rental listing linked via `active_rental_listing_id` — status, rent, DOM. "Create Listing" button if none.
- **Lease info:** Current tenant, lease dates, rent, expiry countdown, renewal status (from Lead fields)
- **Tenant qualification:** Reuse `calculateQualification()` output — Co-op/Condo max purchase, rental max. (Moved from lease tracker cards to here)
- **Real signals:** Observable data from Lead — seller_potential field, entity type, portfolio size. NO fake prediction scores.
- **Outreach timeline:** 6mo/90d/60d/30d dots (reuse pattern from lease tracker but compact)
- **Convert actions:** "Add Seller Role" (convert API `role_transition`), "1031 Exchange" (future), "Create Sale Listing" (convert API `promote_to_listing`)

- [ ] Create `landlord-workspace.js` with `LandlordWorkspace.renderLandlordSections(cl)`
- [ ] Add `<script>` tag to dashboard.html
- [ ] Commit: `feat(crm): add LandlordWorkspace module — lease, qualification, signals, convert`

### Task 12: TenantWorkspace module

**Files:** `public/crm/js/dashboard/panels/rentals-crm/tenant-workspace.js`, `public/crm/dashboard.html`

**Sections:**
- **Communication strip:** Same as all types
- **Lease info:** Current lease dates, rent, expiry, renewal status
- **Engagement summary:** Views, listings sent, preferred device (same pattern as buyer)
- **Qualification:** Co-op/Condo/Rental max purchase prices (from qualification math)
- **Nurture status:** Current drip stage (6mo/90d/60d/30d), paused toggle, next action date
- **Convert actions:** "Promote to Buyer" (convert API `promote_to_buyer`), "Sign Lease" (convert API `sign_lease`), "Activate Renter" (convert API `activate_renter`)

- [ ] Create `tenant-workspace.js` with `TenantWorkspace.renderRenterSections(cl)`
- [ ] Add `<script>` tag to dashboard.html
- [ ] Commit: `feat(crm): add TenantWorkspace module — lease, qualification, nurture, convert`

---

## Phase 5: Wire Up Missing Connections

### Task 13: Replace Sales CRM stubs with real functions

**Files:** `public/crm/js/dashboard/panels/sales-crm/index.js`

- [ ] Replace `activeBuyers()` (line 1640): Build real buyer grid using same pattern as `activeSellers()` — fetch `/api/crm/sales/buyers`, render table with Name, Budget, Stage, Last Outreach, Last Engaged, Gap, Sent, Views, Channel. Row click → `Workspace.openClient(id)`
- [ ] Replace `landlordSellers()` (line 1641): Either redirect to lease tracker (if that's the right flow) or build landlord grid
- [ ] Remove dead stubs: `salesMarketing()`, `salesActivity()`, `salesAutomation()` — or wire to real panels
- [ ] Commit: `feat(crm): replace Sales CRM stubs with real buyer grid + landlord routing`

### Task 14: Update portal react endpoint to set engagement timestamps

**Files:** `app/api/portal/listings/[id]/react/route.ts`

- [ ] Add `prisma.lead.update({ where: { id }, data: { last_click_at: new Date(), last_response_at: new Date() } })` after action toggle
- [ ] Commit: `feat(engagement): update Lead timestamps on portal reactions`

### Task 15: Add preferred channel badge to workspace header

**Files:** `public/crm/js/dashboard/workspace.js`

- [ ] In `_renderClientWorkspace()` (~line 87, after role/stage badges), add preferred channel + device badges if present
- [ ] Add engagement gap below contact info: "Last reached out: X ago | Last engaged: Y ago"
- [ ] Commit: `feat(crm): add preferred channel + engagement gap to workspace header`

---

## Phase 6: Tenant Nurture Cron

### Task 16: Create tenant-nurture cron

**Files:** `app/api/cron/tenant-nurture/route.ts`, `vercel.json`

Follow existing cron pattern (CRON_SECRET + timingSafeEqual). Queries leads with active drips, checks timing + engagement (ListingView), advances stages, creates Notification for agent review.

- [ ] Implement cron endpoint (~120 lines)
- [ ] Add to vercel.json: `{ "path": "/api/cron/tenant-nurture", "schedule": "30 8 * * *" }`
- [ ] Commit: `feat(cron): tenant nurture cadence — daily 8:30am`

---

## Phase 7: Verify

### Task 17: Run all validators + tests

- [ ] `npx jest lib/tracking/__tests__/listing-token.test.ts` — PASS
- [ ] `npx jest lib/compliance/__tests__/portal-dto.test.ts` — PASS (regression)
- [ ] `node scripts/smoke-test-crm.js` — PASS
- [ ] `npm run idx:validate` — 0 critical
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npx next build` — succeeds
- [ ] Manual: Open CRM → click a buyer → see engagement sections render
- [ ] Manual: Lease tracker → compact table → click landlord → workspace with lease/qualification/signals

---

## Env Vars

Add to Vercel (production + preview):
```
TRACKING_SECRET=<random-64-char-hex>
```

---

## Dependency Graph

```
Phase 1 (Schema)
  ├─→ Phase 2 (Tracked Links) ─→ Phase 4 Task 10 (BuyerWorkspace needs listing-views API)
  ├─→ Phase 3 (Lease Tracker Redesign) — independent
  ├─→ Phase 4 (Workspace Modules) — Task 9,11,12 independent; Task 10 needs Phase 2
  ├─→ Phase 5 (Wire Up) — needs Phase 4
  └─→ Phase 6 (Tenant Nurture) — needs Phase 1

Phase 7 runs last
```

Phases 2, 3, and parts of 4 can run in parallel after Phase 1.

---

## What This Fixes

| Before | After |
|--------|-------|
| Click buyer → redirect to /sales/prospects | Click buyer → workspace with engagement timeline, views, facts |
| Click tenant → generic workspace, no type content | Click tenant → workspace with lease, qualification, nurture status |
| Click landlord → generic workspace, nothing | Click landlord → workspace with lease, signals, tenant qual, convert |
| Click seller → generic workspace, nothing | Click seller → workspace with listing status, outreach, convert |
| Lease tracker: giant cards with fake AI scores | Lease tracker: compact table, click row → workspace |
| No listing view tracking | Tracked links, view counts, device detection, sharing signal |
| No convert buttons in CRM | Convert buttons in each workspace module |
| "999 days ago" displayed | "No outreach" or real dates |
| Broken responsive layout | Compact table + mobile card fallback |
