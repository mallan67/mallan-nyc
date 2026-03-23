# Seller Pitch Packet Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the seller prospect pitch packet system with curated comps, two-step outreach (hook email → full pitch), customizable financials, and auto-populating workspace data.

**Architecture:** Add `pitch_data` JSONB column to SellerLead for per-prospect comp storage and overrides. New comp search UI in the Pitch Packet tab. Hook email uses ACRIS purchase price + curated comps to show specific equity gains. Full pitch packet email sends rich HTML inline. Auto-run research on first workspace open to eliminate empty boxes.

**Tech Stack:** Prisma (migration), Trestle OData API (comp search), ACRIS/PLUTO SODA API (equity data), vanilla JS (CRM frontend), Next.js API routes.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add `pitch_data Json?` to SellerLead |
| `app/api/crm/sales/prospects/[id]/comps/route.ts` | Create | Search Trestle for comps, save/load curated list |
| `app/api/crm/sales/prospects/[id]/hook-email/route.ts` | Create | Generate + send the hook email (first touch) |
| `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` | Modify | Use curated comps, customizable commission/fees |
| `app/api/crm/sales/prospects/[id]/send-packet/route.ts` | Modify | Send full pitch data in email (not just summary) |
| `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js` | Rewrite | Comp manager UI + redesigned pitch display |
| `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js` | Modify | Auto-research on first open, fix empty states |
| `app/api/crm/sales/prospects/[id]/route.ts` | Modify | Accept pitch_data updates via PUT |

---

## Task 1: Add pitch_data Column to SellerLead

**Files:**
- Modify: `prisma/schema.prisma` (SellerLead model, ~line 903)

- [ ] **Step 1: Add pitch_data field to SellerLead model**

After `entity_name` field (~line 903), add:

```prisma
  // Curated pitch packet data: comps, overrides, hook email content
  pitch_data            Json?     @map("pitch_data")
```

The JSON structure will be:
```typescript
{
  comps: Array<{
    mls_id: string;        // Trestle ListingId
    address: string;
    unit?: string;
    close_price: number;
    close_date: string;
    beds: number;
    baths: number;
    sqft: number;
    building_name?: string;
    property_type?: string;
    note?: string;         // Agent's note: "Similar layout", "Renovated"
    added_at: string;      // ISO date when comp was added
  }>;
  overrides: {
    estimated_value?: number;   // Manual override of calculated value
    commission_rate?: number;   // Default 0.06
    attorney_fees?: number;     // Default 3000
    custom_note?: string;       // Agent note to include in pitch
  };
  hook_email_sent_at?: string;
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma db push
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(crm): add pitch_data JSON column to SellerLead for curated comps"
```

---

## Task 2: Comp Search & Management API

**Files:**
- Create: `app/api/crm/sales/prospects/[id]/comps/route.ts`

- [ ] **Step 1: Create the comps API with GET (search) and POST (save)**

```
GET  /api/crm/sales/prospects/[id]/comps?q=88+East+End+Ave  — Search Trestle for comps
GET  /api/crm/sales/prospects/[id]/comps                     — Return saved comps from pitch_data
POST /api/crm/sales/prospects/[id]/comps                     — Save/update curated comp list
```

**GET with `q` param — Trestle comp search:**
- Parse address into StreetNumber + StreetName
- Query Trestle: `StandardStatus eq 'Closed' AND StreetNumber eq 'X' AND contains(StreetName,'Y')`
- Also support MLS ID search: `ListingId eq 'RLSXXXXXXX'`
- $select: ListingId, UnparsedAddress, UnitNumber, ClosePrice, CloseDate, BedroomsTotal, BathroomsFull, LivingArea, BuildingName, PropertySubType, StreetNumber, StreetName
- $top: 20, $orderby: CloseDate desc
- Return results as `{ results: CompResult[] }`

**GET without `q` — Return saved comps:**
- Read prospect.pitch_data.comps from DB
- Return `{ comps: Comp[], overrides: Overrides }`

**POST — Save curated comps + overrides:**
- Body: `{ comps: Comp[], overrides: Overrides }`
- Validate: each comp must have mls_id, address, close_price
- Merge into prospect.pitch_data JSON
- Return updated pitch_data

Auth: `requireAgentOrBroker()` on all routes.

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/comps/route.ts
git commit -m "feat(crm): comp search & management API (Trestle search + save curated list)"
```

---

## Task 3: Auto-Generate Comps on Research

**Files:**
- Modify: `app/api/crm/sales/prospects/[id]/research/route.ts`

- [ ] **Step 1: After ACRIS/PLUTO enrichment, auto-fetch initial comps**

After Step 5 (DOF tax) and before Step 6 (apply enrichment), add a new section that:
1. Gets the prospect's beds, sqft, building_name, postal_code (from the enriched data)
2. Queries Trestle for closed sales in the same building (last 18 months)
3. Falls back to same zip code, ±1 BR, ±30% sqft if building match returns < 3 results
4. Saves top 5-8 results as initial comps in `pitch_data.comps` (only if comps array is currently empty — don't overwrite curated comps)

This gives the prospect an initial comp set without the agent having to manually search.

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/research/route.ts
git commit -m "feat(crm): auto-populate initial comps from Trestle during research"
```

---

## Task 4: Redesign Pitch Packet Frontend — Comp Manager

**Files:**
- Rewrite: `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js`

- [ ] **Step 1: Rewrite pitch-packet.js with comp management UI**

The new Pitch Packet tab has 3 sections:

**Section A: Comp Manager (top)**
- "Your Comps (X selected)" header with "Search & Add" button
- Table of saved comps: Address, Price, Beds, Baths, Sqft, Close Date, Note, [Remove]
- Each comp row has:
  - Inline editable "Note" field (small input)
  - Red X button to remove
- "Search & Add" opens inline search bar:
  - Text input for address or MLS ID
  - Fires GET `/api/crm/sales/prospects/[id]/comps?q=...`
  - Results shown as cards with "Add" button
  - Adding a comp immediately saves to backend
- Empty state: "No comps selected. Click 'Search & Add' or run Research to auto-populate."

**Section B: Pricing & Financials (middle)**
- Calculated from selected comps (median $/sqft × prospect sqft)
- 3 price cards: Conservative / Recommended / Aspirational
- Editable overrides:
  - "Override estimated value" input (pre-filled with calculated, editable)
  - "Commission rate" input (default 6%)
  - "Attorney fees" input (default $3,000)
- Net proceeds calculation (updates live as overrides change)
- "Save Overrides" button → POST to comps API

**Section C: Actions (bottom)**
- "Send Hook Email" button — first-touch equity email
- "Send Full Pitch Packet" button — complete pitch with comps
- "Download PDF" button — existing functionality
- Status indicators: "Hook sent: [date]" / "Pitch sent: [date]"

- [ ] **Step 2: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/pitch-packet.js
git commit -m "feat(crm): redesign pitch packet tab with comp manager and customizable financials"
```

---

## Task 5: Redesign Pitch Packet API to Use Curated Comps

**Files:**
- Modify: `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts`

- [ ] **Step 1: Update pitch generation to use pitch_data.comps**

Current flow: Queries Trestle live for comps every time.
New flow:
1. Read `prospect.pitch_data.comps` — use these as the comp set
2. If no curated comps saved, fall back to live Trestle query (backward compat)
3. Read `prospect.pitch_data.overrides` for commission_rate, attorney_fees, estimated_value
4. Calculate pricing from curated comps (same median $/sqft logic)
5. If `overrides.estimated_value` is set, use that instead of calculated value
6. Use `overrides.commission_rate` (default 0.06) and `overrides.attorney_fees` (default 3000)
7. Include the equity gain: `estimated_value - last_purchase_price`

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/pitch-packet/route.ts
git commit -m "feat(crm): use curated comps and overrides in pitch packet generation"
```

---

## Task 6: Hook Email API (First-Touch)

**Files:**
- Create: `app/api/crm/sales/prospects/[id]/hook-email/route.ts`

- [ ] **Step 1: Create the hook email endpoint**

**POST /api/crm/sales/prospects/[id]/hook-email**

Logic:
1. Auth + readonly guard + TCPA check (same as send-packet)
2. Require: `owner_email`, `last_purchase_price`, `last_purchase_date`, and ≥2 comps in `pitch_data.comps`
3. Calculate estimated current value from comps (median $/sqft × sqft)
4. Calculate equity gain: estimated_value - last_purchase_price
5. Build HTML email:

```
Subject: "Your Home at [Address] — $[equity_gain] in Equity Since [purchase_year]"

Body:
- One-line personal greeting
- "You purchased [address] for [purchase_price] in [purchase_year]."
- "Based on [N] recent comparable sales in your building and area:"
  - Table: 2-3 top comps (address, price, date) — from curated comps
- "Your unit is now estimated at approximately [estimated_value]."
- "That's [equity_gain] in equity growth."
- Soft CTA: "I'd be happy to prepare a detailed market analysis for your specific unit — no obligation. Just reply to this email."
- REBNY attribution + Fair Housing footer
```

6. Send via sendEmail()
7. Set `pitch_data.hook_email_sent_at` timestamp
8. Create OutreachEvent (template_id: "hook_email")
9. Log audit event

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/hook-email/route.ts
git commit -m "feat(crm): hook email API — first-touch with specific equity gain from ACRIS + comps"
```

---

## Task 7: Redesign Full Pitch Packet Email

**Files:**
- Modify: `app/api/crm/sales/prospects/[id]/send-packet/route.ts`

- [ ] **Step 1: Update email to include full pitch data inline**

Current: Sends a summary with hardcoded 0 competition.
New: Calls the pitch-packet GET endpoint internally (or reuses logic) to get full data, then renders rich HTML:

1. Personalized greeting with owner name
2. **Your Property** — address, type, beds/baths/sqft
3. **Comparable Sales** — full comp table from curated comps (not just counts)
4. **Pricing Strategy** — 3 tiers with the recommended value highlighted
5. **Your Estimated Equity** — purchase price → current value → gain amount
6. **Net Proceeds Estimate** — gross - commission - tax - attorney - mortgage = net
7. **Our Marketing Plan** — exposure stats (buyers, agents, portals)
8. CTA: "Schedule a Consultation" + agent phone + email
9. REBNY attribution + Fair Housing + unsubscribe

This replaces the current minimal email with the full pitch inline.

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/send-packet/route.ts
git commit -m "feat(crm): send full pitch packet data inline in email (comps, pricing, financials)"
```

---

## Task 8: Auto-Run Research on First Workspace Open

**Files:**
- Modify: `public/crm/js/dashboard/panels/sales-crm/seller-prospects.js`

- [ ] **Step 1: Auto-trigger research when workspace opens for first time**

In `openWorkspace()` function (around line 830), after fetching the prospect data:
```javascript
// If prospect has never been researched and has address + borough, auto-run
if (!p.last_researched_at && p.address && p.borough) {
  CRM.toast('Auto-running research...', 'info');
  MallanAPI._fetch('/api/crm/sales/prospects/' + p.id + '/research', { method: 'POST' })
    .then(function () {
      CRM.toast('Research complete', 'success');
      openWorkspace(String(p.id)); // Reload with data
    })
    .catch(function () {
      // Non-blocking — workspace still renders
    });
}
```

- [ ] **Step 2: Improve empty states across all tabs**

In `_wsOverview()`, replace blank field displays with contextual messages:
- If no purchase price: Show "Run Research to pull ACRIS data" instead of "—"
- If no beds/baths/sqft: Show "Edit to add property details" with link to edit modal
- If no entity info: Show "Detected from ACRIS on research" placeholder

In `_wsResearch()`:
- If no research data: Show prominent "Run Research" button with explanation instead of empty boxes

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/dashboard/panels/sales-crm/seller-prospects.js
git commit -m "feat(crm): auto-run research on first workspace open + better empty states"
```

---

## Task 9: Update Prospect PUT to Accept pitch_data

**Files:**
- Modify: `app/api/crm/sales/prospects/[id]/route.ts`

- [ ] **Step 1: Allow pitch_data in PUT body**

In the PUT handler, add `pitch_data` to the allowed update fields. Validate:
- Must be valid JSON
- If `comps` array present, each item must have `mls_id` and `close_price`
- If `overrides` object present, validate commission_rate is 0-0.15 range, attorney_fees ≥ 0

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/sales/prospects/\[id\]/route.ts
git commit -m "feat(crm): allow pitch_data updates via prospect PUT endpoint"
```

---

## Execution Order

Tasks should be executed in this order (dependencies):
1. **Task 1** — DB migration (foundation)
2. **Task 9** — PUT endpoint accepts pitch_data (needed by frontend)
3. **Task 2** — Comp search API (needed by frontend + pitch generation)
4. **Task 3** — Auto-generate comps on research
5. **Task 5** — Pitch packet API uses curated comps
6. **Task 4** — Frontend comp manager (depends on comp API)
7. **Task 6** — Hook email API
8. **Task 7** — Redesigned pitch email
9. **Task 8** — Auto-research + empty states (final polish)
