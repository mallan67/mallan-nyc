# Lease Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Lease Tracker — the core landlord/tenant/property/lease management system with date-driven outreach (6mo/90d/60d/30d), dual-listing support (rent+sell simultaneously), and opportunity flagging (tenant→buyer, landlord→seller).

**Architecture:** Uses existing `Lead` model (landlords + tenants), existing `ActiveLease` model, and existing `Listing` model. New frontend panel (`lease-tracker.js`) replaces the Rentals CRM stubs. Consolidates sidebar into 3 client sections: Prospects, Lease Tracker, Listings.

**Tech Stack:** Prisma (existing models), Next.js API routes, vanilla JS (CRM frontend)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `public/crm/js/dashboard/panels/lease-tracker.js` | Create | Main Lease Tracker UI — property cards, outreach timeline, opportunity flags |
| `app/api/crm/lease-tracker/route.ts` | Create | GET: aggregated view (landlords + properties + tenants + leases + listings) |
| `app/api/crm/lease-tracker/[id]/outreach/route.ts` | Create | POST: trigger outreach email for a specific lease/landlord/tenant |
| `public/crm/js/dashboard/app.js` | Modify | Consolidate sidebar: Sales CRM + Rentals CRM → Prospects + Lease Tracker + Listings |
| `public/crm/dashboard.html` | Modify | Add lease-tracker.js script tag |
| `public/crm/js/dashboard/panels/rentals-crm/index.js` | Modify | Redirect landlords/tenants/leases to Lease Tracker |

---

## Task 1: Lease Tracker API — Aggregated View

**Files:**
- Create: `app/api/crm/lease-tracker/route.ts`

- [ ] **Step 1: Create the aggregated lease tracker endpoint**

**GET /api/crm/lease-tracker**

Query params:
- `?view=all|expiring|vacant|dual_listed|opportunities` — filter views
- `?landlord_id=X` — filter to one landlord's properties
- `?urgency=6mo|90d|60d|30d` — filter by lease expiry urgency

Returns a denormalized view joining:
- **Landlords** (Lead records with roles containing "landlord")
- **Their properties** (from Lead.property_address, or from Listings they own)
- **Tenants** on each property (Lead records with roles containing "tenant", linked via ActiveLease)
- **Lease data** (ActiveLease model: start_date, end_date, monthly_rent)
- **Active listings** for each property (both sale and rental)
- **Outreach status** (which 6mo/90d/60d/30d emails have been sent)
- **Opportunity flags** (tenant income vs rent ratio, landlord ownership duration)

Response shape:
```typescript
{
  properties: Array<{
    // Property
    address: string;
    unit: string;
    borough: string;

    // Landlord
    landlord: { id, name, email, phone, entity_name, entity_type };
    ownership_years: number | null;

    // Current tenant (if occupied)
    tenant: { id, name, email, phone, income, credit_score } | null;

    // Lease
    lease: {
      id, start_date, end_date, monthly_rent, status,
      days_until_expiry: number,
      urgency: "6mo" | "90d" | "60d" | "30d" | "expired" | "ok",
    } | null;

    // Active listings on this property
    listings: Array<{ id, type: "sale" | "rental", price, status, days_on_market }>;

    // Status
    status: "rented" | "vacant" | "listed_rent" | "listed_sale" | "dual_listed" | "managing";

    // Outreach
    outreach: {
      landlord_6mo_sent: boolean;
      landlord_90d_sent: boolean;
      landlord_60d_sent: boolean;
      landlord_30d_sent: boolean;
      tenant_6mo_sent: boolean;
      tenant_90d_sent: boolean;
      tenant_60d_sent: boolean;
      tenant_30d_sent: boolean;
    };

    // Opportunities
    flags: Array<"high_income_tenant" | "long_term_owner" | "expiring_soon" | "vacant" | "viewed_not_rented">;
  }>;

  // Summary counts
  summary: {
    total_properties: number;
    rented: number;
    vacant: number;
    expiring_6mo: number;
    expiring_90d: number;
    expiring_30d: number;
    dual_listed: number;
    opportunities: number;
  };
}
```

Data sources:
- Landlords: `prisma.lead.findMany({ where: { roles: { has: 'landlord' } } })`
- Tenants: via `ActiveLease` join (existing model with landlord_id and tenant_id)
- Listings: `prisma.listing.findMany({ where: { owner_client_id: landlordId } })`
- Outreach dates: from Lead fields (outreach_6mo_date, outreach_90d_date, etc.)
- Tenant income: Lead.annual_income

Opportunity flags:
- `high_income_tenant`: tenant annual_income > 40x monthly_rent AND annual_income > $150K
- `long_term_owner`: landlord owned > 10 years (from ACRIS ownership_years or Lead.promoted_from_landlord_at)
- `expiring_soon`: lease ends within 90 days
- `vacant`: no active tenant, no active listing

Auth: `requireAgentOrBroker()`

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/lease-tracker/route.ts
git commit -m "feat(crm): lease tracker API — aggregated landlord/tenant/property/lease view"
```

---

## Task 2: Lease Tracker Frontend — Main Panel

**Files:**
- Create: `public/crm/js/dashboard/panels/lease-tracker.js`
- Modify: `public/crm/dashboard.html` (add script tag)

- [ ] **Step 1: Create the Lease Tracker panel**

The panel shows a dashboard-style view with:

**Summary bar (top):** KPI cards
- Total Properties | Rented | Vacant | Expiring (90d) | Dual Listed | Opportunities

**Filter tabs:**
- All | Expiring Soon | Vacant | Dual Listed | Opportunities

**Property cards (main content):** Each property is a card showing:

```
┌─────────────────────────────────────────────────────────┐
│  88 East End Ave #4A                    DUAL LISTED     │
│  Manhattan                                               │
│                                                          │
│  LANDLORD: HZL Realty LLC          TENANT: [Vacant]     │
│  jerry@email.com                                         │
│  (212) 555-1234                                         │
│                                                          │
│  LISTINGS:                                               │
│    🔵 Rental: $4,500/mo (Active, 12 DOM)                │
│    🟡 Sale: $1,300,000 (Active, 5 DOM)                  │
│    → Whichever closes first                              │
│                                                          │
│  LEASE: No active lease (vacant)                         │
│                                                          │
│  ⚡ FLAGS: vacant, long_term_owner                       │
│                                                          │
│  ACTIONS: [Email Landlord] [Create Listing] [Add Tenant]│
└─────────────────────────────────────────────────────────┘
```

For occupied properties with lease:
```
┌─────────────────────────────────────────────────────────┐
│  400 E 90th St #12B                         RENTED      │
│  Manhattan                                               │
│                                                          │
│  LANDLORD: Smith Trust             TENANT: John Doe     │
│  smith@email.com                   john@email.com        │
│                                    Income: $185K ⚡HIGH  │
│                                                          │
│  LEASE: Apr 1, 2025 → Dec 31, 2026                     │
│  Rent: $3,800/mo                                        │
│  Expires in: 281 days                                    │
│                                                          │
│  OUTREACH TIMELINE:                                      │
│  6mo ✅ sent Jul 1  │ 90d ⏳ Oct 2  │ 60d — │ 30d —    │
│                                                          │
│  ⚡ FLAGS: high_income_tenant                            │
│                                                          │
│  ACTIONS: [Email Landlord "Sell?"] [Email Tenant "Buy?"]│
│           [Renew Lease] [View Client]                    │
└─────────────────────────────────────────────────────────┘
```

**Outreach timeline visualization:**
```
6 months ───── 90 days ───── 60 days ───── 30 days ───── Lease End
   ✅            ⏳             ○             ○           Dec 31
  (sent)      (due Oct 2)   (pending)    (pending)
```
- ✅ green = sent
- ⏳ gold = due (within 7 days of target date)
- ○ gray = future
- 🔴 red = overdue (past target date, not sent)

**"Viewed / Did Not Rent" section:**
Same card format but:
- No lease dates — uses "viewed date" as the anchor
- Outreach cycle starts from viewing date
- Shows which property they viewed and when

**Actions on each card:**
- "Email Landlord" → opens compose with context (lease ending, sell opportunity)
- "Email Tenant" → opens compose with context (buy opportunity, renewal)
- "Create Listing" → opens listing form pre-filled with property
- "Add Tenant" → opens client form linked to this property
- "Renew Lease" → updates lease end date
- "View Client" → opens unified client workspace for landlord or tenant

**Module structure:**
```javascript
var LeaseTracker = (function() {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var _data = null;
  var _view = 'all';

  function render() {
    CRM.setPanelTitle('Lease Tracker');
    var c = CRM.getContent();
    c.innerHTML = /* loading */;
    MallanAPI._fetch('/api/crm/lease-tracker?view=' + _view)
      .then(function(data) { _data = data; _renderDashboard(c); })
      .catch(function(err) { /* error state */ });
  }

  function _renderDashboard(c) { /* summary + filters + property cards */ }
  function _renderPropertyCard(prop) { /* individual card */ }
  function _renderOutreachTimeline(lease, outreach) { /* timeline viz */ }
  function _filterView(view) { _view = view; render(); }
  function _emailLandlord(propertyIdx, type) { /* compose email */ }
  function _emailTenant(propertyIdx, type) { /* compose email */ }
  function _renewLease(leaseId) { /* update modal */ }
  function _openClient(clientId) { Router.navigate('/clients/' + clientId); }

  return {
    render: render,
    _filterView: _filterView,
    _emailLandlord: _emailLandlord,
    _emailTenant: _emailTenant,
    _renewLease: _renewLease,
    _openClient: _openClient,
  };
})();
```

- [ ] **Step 2: Add script tag to dashboard.html**

After existing script tags:
```html
<script src="/crm/js/dashboard/panels/lease-tracker.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/dashboard/panels/lease-tracker.js public/crm/dashboard.html
git commit -m "feat(crm): lease tracker UI — property cards, outreach timeline, opportunity flags"
```

---

## Task 3: Outreach Trigger API

**Files:**
- Create: `app/api/crm/lease-tracker/[id]/outreach/route.ts`

- [ ] **Step 1: Create outreach trigger endpoint**

**POST /api/crm/lease-tracker/[id]/outreach**

Body: `{ target: "landlord" | "tenant", type: "6mo" | "90d" | "60d" | "30d" | "sell_inquiry" | "buy_inquiry" | "renewal" | "viewed_followup" }`

Logic:
1. Auth + write guard + TCPA check
2. Fetch the Lead (landlord or tenant) by ID
3. Based on type, generate contextual email:
   - `sell_inquiry` → "Have you considered selling [address]? Based on recent sales..."
   - `buy_inquiry` → "With your income level, you may qualify to purchase..."
   - `renewal` → "Your lease at [address] ends [date]. Would you like to renew?"
   - `viewed_followup` → "You viewed [address] on [date]. Still looking?"
   - `6mo/90d/60d/30d` → timeline-based check-in emails
4. Send via `sendEmail()`
5. Update the appropriate outreach date field on the Lead (outreach_6mo_date, etc.)
6. Create OutreachEvent record
7. Log audit event

TCPA: Check `Lead.last_unsubscribe_at` — if set, return 403.

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/lease-tracker/\[id\]/outreach/route.ts
git commit -m "feat(crm): lease tracker outreach API — contextual emails for landlord/tenant lifecycle"
```

---

## Task 4: Consolidate Sidebar

**Files:**
- Modify: `public/crm/js/dashboard/app.js`

- [ ] **Step 1: Replace Sales CRM + Rentals CRM with unified structure**

Replace both sidebar groups with:

```javascript
// CLIENTS (unified — replaces Sales CRM + Rentals CRM)
html += _sidebarGroup('CLIENTS', 'clients', [
  { route: '/sales/prospects', icon: 'fa-crosshairs', label: 'Prospects' },
  { route: '/lease-tracker', icon: 'fa-calendar-alt', label: 'Lease Tracker' },
  { route: '/listings', icon: 'fa-building', label: 'Listings' },
]);
```

- [ ] **Step 2: Add router registrations**

```javascript
Router.register('/lease-tracker', function() { LeaseTracker.render(); });
```

Keep existing routes as aliases (backward compat):
```javascript
// Legacy redirects
Router.register('/rentals/landlords', function() { LeaseTracker.render(); });
Router.register('/rentals/active-leases', function() { LeaseTracker.render(); });
Router.register('/rentals/tenants', function() { LeaseTracker.render(); });
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/dashboard/app.js
git commit -m "feat(crm): consolidate sidebar — Sales + Rentals → Prospects + Lease Tracker + Listings"
```

---

## Task 5: Viewed / Did Not Rent Integration

**Files:**
- Modify: `public/crm/js/dashboard/panels/lease-tracker.js`
- Modify: `app/api/crm/lease-tracker/route.ts`

- [ ] **Step 1: Add "Viewed Not Rented" section to the API**

In the lease tracker API, also fetch leads with:
- `pipeline_stage = 'viewed_not_rent'` or `viewed_addresses` is not null
- These are people who viewed a rental but didn't sign
- For each, use the viewing date as the outreach anchor (like lease end date)
- Same 6mo/90d/60d/30d cycle from viewing date

Add to response:
```typescript
viewed_not_rented: Array<{
  client: { id, name, email, phone, income };
  viewed_address: string;
  viewed_date: string;
  days_since_viewed: number;
  outreach_status: { /* same 6mo/90d/60d/30d */ };
  flags: Array<"high_income" | "buy_potential">;
}>;
```

- [ ] **Step 2: Add "Viewed / Didn't Rent" tab to the Lease Tracker UI**

Add a filter tab "Didn't Rent" that shows these leads as cards:
```
┌─────────────────────────────────────────────────────────┐
│  Sarah Johnson                    VIEWED / DID NOT RENT │
│  sarah@email.com | (212) 555-4567                       │
│  Income: $120K                                           │
│                                                          │
│  Viewed: 157 W 57th St #12A on Mar 15, 2026            │
│  45 days ago                                             │
│                                                          │
│  OUTREACH:                                               │
│  Day 7 ✅  │ Day 30 ⏳  │ Day 60 ○  │ Day 90 ○         │
│                                                          │
│  ACTIONS: [Email "Still Looking?"] [Convert to Buyer]   │
└─────────────────────────────────────────────────────────┘
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/dashboard/panels/lease-tracker.js app/api/crm/lease-tracker/route.ts
git commit -m "feat(crm): viewed/did-not-rent integration in lease tracker with outreach cycle"
```

---

## Execution Order

1. **Task 1** — API (data foundation)
2. **Task 2** — Frontend (main UI)
3. **Task 3** — Outreach API (email triggers)
4. **Task 5** — Viewed/didn't rent integration
5. **Task 4** — Sidebar consolidation (last — after everything works)
