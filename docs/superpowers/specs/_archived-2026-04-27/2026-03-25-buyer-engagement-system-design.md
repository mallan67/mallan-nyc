# Buyer/Tenant Engagement System — Design Spec

**Date:** 2026-03-25
**Status:** Draft (rev 2 — spec review fixes applied)
**Author:** Maya Allan + Claude
**Scope:** Tracked listing links, buyer CRM engagement dashboard, tenant nurture cadence

---

## Problem

Sellers and landlords are accessed through their listings — the agent opens the listing and sees everything. For buyers and tenants, there is no equivalent. The agent sends listings but has no visibility into:
- Whether the client viewed the listing
- How many times / from what device
- Whether they shared it with decision makers
- What their actual engagement pattern is (portal? email? text? mobile?)
- When the agent last reached out vs when the client last engaged

The CRM Active Buyers tab is a redirect to `/sales/prospects` (not a stub — it has no buyer-specific content). The buyer workspace references a missing `BuyerWorkspace` module (guarded by `typeof` check so it silently renders nothing, but buyer sections are completely absent). Tenant follow-up is manual with no system support.

---

## Design Principles

1. **Real actions, not scores.** No hot/warm/cold. No engagement scores. Show what actually happened — the agent reads the situation.
2. **No bloat.** No stubs, no mockups left behind. Production code only.
3. **Tracked links, not email tracking.** Email opens are unreliable (spam filters, pixel blocking). Listing views tied to client identity are reliable.
4. **Seamless.** Fits into existing CRM workspace structure. No new navigation concepts.
5. **Universal across all client types.** Communication preference and engagement tracking applies to sellers, buyers, landlords, and tenants equally. Some sellers never log into the portal — they just want email or text. The system tracks what each client actually responds to, regardless of role.

---

## Component 1: Tracked Listing Links

### How It Works

When an agent sends a listing to a client via `/api/crm/listing-sends`, the system generates a tracked link:

```
https://mallan.nyc/listing/SL-001?t=<client-token>
```

- `client-token` is a short, URL-safe hash derived from `lead_id + listing_id + SERVER_SECRET`
- Token is not guessable but is stable (same client + listing = same token, for idempotency)
- No portal login required to view — the full listing page loads normally
- Agent info remains concealed (existing DTO behavior)

### View Logging

When anyone visits a tracked listing link, the server logs:

| Field | Source | Purpose |
|-------|--------|---------|
| `lead_id` | Decoded from token | Which client this view belongs to |
| `listing_id` | URL path | Which listing was viewed |
| `viewed_at` | Server timestamp | When |
| `device_type` | User-Agent parsing | Mobile / Desktop / Tablet |
| `ip_hash` | Salted SHA-256 of IP | Unique viewer count (client vs spouse vs attorney) |
| `referrer` | Referer header | Direct link, email client, forwarded |

### Data Model

New model: `ListingView`

```prisma
model ListingView {
  id          BigInt   @id @default(autoincrement())
  lead_id     BigInt   @map("lead_id")
  listing_id  String   @map("listing_id")  // FK to Listing.listing_id (String, matches PortalEvent/DemandSignalEvent pattern)
  viewed_at   DateTime @default(now()) @map("viewed_at")
  device_type String?  @map("device_type")  // "mobile" | "desktop" | "tablet"
  ip_hash     String?  @map("ip_hash")      // SHA-256(IP + SERVER_SECRET) for unique viewer counting
  referrer    String?                        // where the click came from

  lead    Lead    @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  @@index([lead_id, listing_id])
  @@index([listing_id])
  @@index([lead_id, viewed_at])  // time-range queries per client
  @@map("listing_views")
}
```

**Note:** `listing_id` is a String FK matching the pattern used by `PortalEvent`, `DemandSignalEvent`, `ListingMomentum`, and `SocialProofCache`. It references `Listing.listing_id` logically (no formal Prisma relation to avoid cascade complexity on listing deletion). View data persists even if the listing is later closed or removed — it is historical engagement data.

**Reverse relation** on Lead model: `listing_views ListingView[]`

### Token Generation

Tokens are **derived at request time** using HMAC — no lookup table needed.

```
token = base64url(HMAC-SHA256(lead_id + ":" + listing_id, SERVER_SECRET)).slice(0, 16)
```

- Deterministic: same input = same token (no DB lookup needed to generate or validate)
- Server validates by iterating recent listing sends for the given listing_id and regenerating tokens until a match is found
- If no match: token is invalid — page loads normally, view is simply not logged (silent fallback)

### API Changes

**Existing:** `POST /api/crm/listing-sends` — add `tracked_url` to each client's response payload

**New:** `POST /api/tracking/listing-view` — called by a client-side component on the listing page when `?t=` param is present. Fires asynchronously after page hydration. Does not block page render. Validates token server-side, logs ListingView if valid, returns 204. If token is invalid, returns 204 silently (no error to client).

**New:** `GET /api/crm/listing-views?lead_id=X` — returns all views for a client, grouped by listing, with counts and device breakdown. Agent/broker auth required.

### Privacy

- IP addresses are **salted** with `SERVER_SECRET` before SHA-256 hashing — prevents rainbow table attacks on the ~4B IPv4 space
- No cookies set for tracking
- No cross-site tracking
- Compliant with NY SHIELD Act (no PII beyond what client already provided)
- Token is not personally identifiable without server secret
- **Attribution note:** The tracked link attributes views to the *intended recipient*, not necessarily the *actual viewer*. If a client forwards the link, additional views are still counted under their name. This is intentional — it detects sharing behavior (multiple unique IP hashes = multiple viewers).

---

## Component 2: Buyer Engagement Dashboard (CRM)

### Location

Replaces the current `activeBuyers()` redirect in `public/crm/js/dashboard/panels/sales-crm/index.js` (line 1640 — currently just `Router.navigate('/sales/prospects')`). Also creates the `BuyerWorkspace` module referenced in `workspace.js:799` (currently undefined, would crash).

### Active Buyers Tab (List View)

Table of all buyers (leads with role "buyer"), sortable and searchable:

| Column | Data | Source |
|--------|------|--------|
| Name | First + last name | Lead model |
| Budget | Pre-approved amount or stated budget | Lead.pre_approved_amount |
| Last You Reached Out | Most recent listing send or email from agent | Lead.last_contacted_at (existing field) |
| Last They Engaged | Most recent view, like, message, or showing request | Lead.last_click_at (existing field, updated on ListingView/ClientListingAction) |
| Gap | Days between last_contacted_at and last_click_at | Calculated client-side |
| Listings Sent | Count of listings sent | ClientListingAction where action="sent" (note: "sent" is a valid action value written by listing-sends API, though not documented in schema comment — schema comment should be updated) |
| Views | Total views across all sent listings | ListingView aggregate |
| Preferred Channel | Most-used engagement method | Lead.preferred_channel (new field, updated by engagement events) |
| Device | Primary device type | Lead.preferred_device (new field, updated by ListingView logging) |

**Empty state:** Buyers with zero engagement show "—" in Views, Device, and Preferred Channel columns. They still appear in the grid (new buyers need to be visible so the agent can take action).

Click a row to open the buyer workspace.

### Buyer Workspace (Detail View)

**Header:**
- Client name, phone, email
- Budget / pre-approval status / down payment
- Preferred channel badge (Portal / Email / Text / Phone)
- Primary device (Mobile / Desktop)

**Section 1: Action Timeline** (reverse chronological, unified stream)

Every real action in one feed. Two-sided: agent actions (left-aligned, blue) and client actions (right-aligned, green).

```
YOU  [Mar 25]  Sent 3 listings (Chelsea 1BRs)
          [Mar 25]  Viewed 100 W 25th St #4A (mobile, 3x)  CLIENT
          [Mar 25]  Viewed 100 W 25th St #4A (desktop, 1x — different viewer)  CLIENT
          [Mar 24]  Liked 200 W 20th St #8B  CLIENT
YOU  [Mar 22]  Sent 2 listings (West Village)
          [Mar 22]  Viewed 88 Greenwich St (mobile, 1x)  CLIENT
          [Mar 20]  Requested showing: 200 W 20th St  CLIENT
YOU  [Mar 18]  Email: "New listings this week"
          [Mar 15]  Portal login (mobile)  CLIENT
```

Data sources for the timeline:
- Agent actions: AuditEvent where action in ("listing_sent", "email:sent", "sms:logged") and user_id = agent
- Client actions: ListingView (views), ClientListingAction (likes/dislikes/discuss/schedule), PortalEvent (logins, showing requests), Notification (messages from client)

**Section 2: Listings Sent** (table)

| Listing | Sent Date | Views | Unique Viewers | Last Viewed | Device | Reaction |
|---------|-----------|-------|---------------|-------------|--------|----------|
| 100 W 25th St #4A | Mar 25 | 4 | 2 | 2 hours ago | Mobile | — |
| 200 W 20th St #8B | Mar 22 | 1 | 1 | Mar 22 | Mobile | Liked |
| 88 Greenwich St #3 | Mar 22 | 1 | 1 | Mar 22 | Mobile | — |
| 150 W 15th St #2 | Mar 18 | 0 | 0 | Never | — | — |

Unique Viewers = COUNT(DISTINCT ip_hash) from ListingView for that lead_id + listing_id.
Listings that are now closed/inactive still show in the table with their last-known address and a "Closed" badge.

**Section 3: Facts** (no scores, no labels — just observable data)

Simple counts and timestamps derived from engagement data:

- **Neighborhoods engaged:** Chelsea (5 views), West Village (2 views)
- **Price range of viewed listings:** $1.5M - $1.9M (budget: $1.5M)
- **Multiple viewers detected:** Yes (2 unique IPs on 100 W 25th St)
- **Portal usage:** 3 logins this month (all mobile) — from Lead.login_count + PortalEvent
- **Last portal login:** Mar 15 — from Lead.last_login_at (existing field)
- **Days since last engagement:** 0 — from Lead.last_click_at
- **Days since your last outreach:** 0 — from Lead.last_contacted_at

**Deferred to AI insights layer (not in this spec):** Dealbreaker detection, preference pattern analysis, stretch signal calculation. These require property-type correlation and algorithmic logic beyond simple counts.

**Section 4: Quick Actions**
- **Send Listings** — opens listing picker with client's budget/neighborhood pre-filtered
- **Schedule Showing** — uses existing `POST /api/crm/showings` (already built, creates showing + follow-up task + confirmation email)
- **Log Outreach** — uses existing outreach logging modal (`SalesCRM._logOutreach()`, CRM frontend built). **Note:** `POST /api/crm/activity` is currently a stub (returns hardcoded message, no data persisted). Must be implemented as part of this work to actually save outreach records.
- **Convert** — uses existing `POST /api/crm/convert` (to seller, landlord, investor, tenant — role transition)

---

## Component 3: Tenant Nurture Cadence

### Trigger

When a tenant views an exclusive rental (showing on your listing) but does not sign a lease within 30 days, they enter the nurture cadence.

### Reuse of Existing Lead Fields

The Lead model already has outreach timing fields and drip status fields. The nurture cadence **reuses these** rather than adding new ones:

| Existing Field | Nurture Usage |
|---------------|---------------|
| `reengage_anchor_date` | Date tenant first saw the exclusive (anchor for timing) |
| `sales_drip_on` / `sales_drip_status` | Whether sales listings are being sent + current stage |
| `rental_drip_on` / `rental_drip_status` | Whether rental listings are being sent + current stage |
| `outreach_6mo_date` | When the 6-month sales send is scheduled/due |
| `outreach_90d_date` | When the 90-day mixed send is scheduled/due |
| `outreach_60d_date` | When the 60-day mixed send is scheduled/due |
| `outreach_30d_date` | When the 30-day rentals-only send is scheduled/due |
| `outreach_90d_sent_at` | Actual timestamp the 90-day send was made (separate from scheduled date) |
| `outreach_60d_sent_at` | Actual timestamp the 60-day send was made |
| `outreach_30d_sent_at` | Actual timestamp the 30-day send was made |

**New fields (1 for nurture + 2 for communication preferences = 3 total on Lead):**

```prisma
// Added to Lead model
nurture_paused     Boolean @default(false) @map("nurture_paused")   // agent can pause the cadence
preferred_channel  String? @map("preferred_channel")                 // "portal" | "email" | "text" | "phone"
preferred_device   String? @map("preferred_device")                  // "mobile" | "desktop"
```

### Cadence Logic

| Stage | Timing | What to Send | Advance Condition |
|-------|--------|-------------|-------------------|
| `6mo_sales` | 6 months after `reengage_anchor_date` | Sale listings matching their search criteria | Client views 0 sent listings in 90 days |
| `90d_mixed` | 90 days after 6mo send | Sales + rental listings | Client views 0 in 60 days |
| `60d_mixed` | 60 days after 90d send | Sales + rental listings | Client views 0 in 30 days |
| `30d_rentals` | 30 days after 60d send | Rental listings only (no-fee / your exclusives) | End of cadence |

The drip status fields track which stage is active:
- `sales_drip_status = "6mo"` → 6mo_sales stage
- `sales_drip_status = "90d"` → 90d_mixed stage
- `sales_drip_status = "60d"` → 60d_mixed stage
- `rental_drip_status = "30d"` → 30d_rentals stage (sales drip turned off)

**If client engages at any stage** (views a sent listing via tracked link): stay at that stage, keep sending that type.

**If client converts** (signs buyer rep, signs lease): drip statuses set to "completed", drip flags turned off.

### Draft Sends (Agent Review)

The cron job does NOT auto-send. It creates a **Notification** for the agent:

```
{
  recipient_type: "agent",
  recipient_id: agent_id,
  channel: "in_app",
  type: "nurture_draft",
  title: "Nurture: 3 listings ready for John Smith",
  body: "6-month sales listings based on John's Chelsea 1BR search.",
  data: { lead_id, stage, suggested_criteria },
  status: "pending"
}
```

The agent sees this in their CRM notifications, clicks through to the buyer's workspace, reviews the suggested criteria, picks listings, and sends via the normal listing-sends flow. No new model needed — reuses existing Notification.

### Cron Job

New cron: `/api/cron/tenant-nurture` — runs daily at 8am.

1. Query all leads where `sales_drip_on = true OR rental_drip_on = true` and `nurture_paused = false`
2. Check timing: compare current date vs outreach date fields
3. Check engagement: query ListingView for views since last send date
4. If advancing: update drip status + outreach date, create Notification for agent
5. If engaged: stay at current stage, no action
6. Audit log each decision via logAuditEvent

---

## Component 4: Universal Communication Preferences

### Applies To All Client Types

Communication preferences are tracked using **2 new fields** on the Lead model, plus reuse of existing fields:

**New fields:**

```prisma
// Added to Lead model
preferred_channel  String? @map("preferred_channel")  // "portal" | "email" | "text" | "phone" — derived from behavior
preferred_device   String? @map("preferred_device")    // "mobile" | "desktop" — derived from listing views
```

**Existing fields reused (no changes):**

| Field | Already Exists | Used For |
|-------|---------------|----------|
| `last_login_at` | Yes (Lead line 226) | Last portal login |
| `login_count` | Yes (Lead line 227) | Portal login frequency |
| `last_contacted_at` | Yes (Lead line 194) | When agent last reached out |
| `last_click_at` | Yes (Lead line 229) | When client last engaged (view, like, message) |
| `last_response_at` | Yes (Lead line 228) | When client last responded (message, reaction) |

### How Preferences Are Updated

Updated **on each engagement event**, not by a separate derivation job. Simple rules:

| Event | Updates |
|-------|---------|
| ListingView logged (from tracked link) | `last_click_at = now()`, `preferred_device = device_type` (if 3+ views from same device type) |
| Portal login | `last_login_at = now()`, `login_count++`, `preferred_channel = "portal"` (if login_count >= 3) |
| ClientListingAction (like/discuss/schedule) | `last_click_at = now()`, `last_response_at = now()` |
| Portal message sent | `last_response_at = now()`, `preferred_channel = "portal"` |
| SMS response logged (manual via Log Outreach) | `last_response_at = now()`, `preferred_channel = "text"` |
| Email response logged (manual via Log Outreach) | `last_response_at = now()`, `preferred_channel = "email"` |
| Phone call logged (manual via Log Outreach) | `last_response_at = now()`, `preferred_channel = "phone"` |

The preferred_channel reflects the **most recent confirmed response channel**. It can change over time as behavior changes. If a client has never responded through any channel, preferred_channel is null (displayed as "—" in the UI).

### Seller/Landlord Workspace Addition

The existing seller/landlord workspace header gets a small addition:
- Preferred channel badge (or "—" if unknown)
- Last engagement timestamp
- "Last you reached out" vs "Last they engaged" gap indicator

No new tabs, no restructuring — just the communication context added to the existing header bar.

### Multi-Role Clients

A client with `roles: ["buyer", "renter"]` appears in both the buyer grid and may be in a tenant nurture cadence. This is correct — they are both. The engagement dashboard shows all actions regardless of role. The nurture cadence operates independently based on drip status fields. If the client converts to an active buyer (signs rep agreement), the nurture cadence stops (drip flags turned off).

---

## What This Does NOT Include (Deferred)

| Feature | Reason |
|---------|--------|
| AI insights / pattern analysis (dealbreakers, stretch signals) | Build on top of engagement data later. Foundation first. |
| Enhanced calculators (mortgage, 5yr/10yr, investor ROI, cash-on-cash) | Separate feature. Listing page calculators need audit first. |
| Listing page gaps (units count, pre-war, conversion type) | Small fixes, separate PR. |
| External listing save (paste URL from other sites) | Future feature for buyer portal. |
| Threaded comments on shared listings | Future portal enhancement. |
| Automated listing selection for nurture sends | Agent reviews and picks listings manually for now. |

---

## Files To Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `app/api/tracking/listing-view/route.ts` | POST: log a tracked listing view (called by client component) |
| `app/api/crm/listing-views/route.ts` | GET: views for a client, grouped by listing (agent/broker auth) |
| `app/components/TrackListingSend.tsx` | Client component: fires view API when `?t=` param present |
| `lib/tracking/listing-token.ts` | Token generation (HMAC) + validation helpers |
| `public/crm/js/dashboard/panels/sales-crm/buyer-workspace.js` | BuyerWorkspace module (engagement dashboard) |
| `app/api/cron/tenant-nurture/route.ts` | Daily nurture cadence cron |

### Modified Files
| File | Change |
|------|--------|
| `app/listing/[id]/page.tsx` | Import TrackListingSend component, render when `?t=` searchParam present |
| `app/api/crm/listing-sends/route.ts` | Generate and return tracked URLs per client |
| `app/api/crm/activity/route.ts` | Implement POST handler (currently a stub — must persist outreach records to AuditEvent or Activity model) |
| `public/crm/js/dashboard/panels/sales-crm/index.js` | Replace `activeBuyers()` redirect with real buyer grid |
| `public/crm/js/dashboard/workspace.js` | Wire BuyerWorkspace module (fix line 799 crash) |
| `prisma/schema.prisma` | Add ListingView model (new table), add 3 new fields to Lead (`nurture_paused`, `preferred_channel`, `preferred_device`), add `listing_views ListingView[]` reverse relation to Lead |
| `vercel.json` | Add tenant-nurture cron schedule (daily 8am) |

---

## Dependencies

- No new npm packages required
- Uses existing: Prisma, Next.js API routes, CRM dashboard framework
- Listing page tracking is non-blocking (client component fires after hydration)
- Token generation uses Node.js built-in `crypto` module (HMAC-SHA256)
- Requires a new `LISTING_TRACK_SECRET` env var for HMAC token generation and IP hashing (dedicated secret, not shared with `CRON_SECRET` which is for cron auth). Must be added to Vercel env vars.

---

## Success Criteria

1. Agent sends listing → client receives tracked link → views are logged with device + unique viewers
2. Active Buyers tab shows real buyer grid with engagement data (replaces redirect)
3. Clicking a buyer opens workspace with action timeline, listings sent table, and facts section
4. Agent can see: when they last reached out, when client last engaged, the gap between the two
5. Agent can see: what device client uses, whether listing was shared (multiple unique viewers)
6. Preferred channel badge shows on ALL client workspace headers (buyer, seller, landlord, tenant)
7. Tenant nurture cadence runs daily, creates notification for agent to review and send listings
8. No mock data, no stubs, no bloat. Every element shows real data from real actions.
