# Client Lifecycle System — Design Spec

## Problem

The CRM treats sellers, buyers, landlords, and tenants as separate silos. In reality, one client moves through multiple roles over their lifetime:

- Seller sells → needs to buy (or rent while searching)
- Buyer buys → years later becomes seller
- Tenant's lease ends → ready to buy
- Buyer buys investment → becomes landlord
- Landlord sells rental → becomes buyer again

The CRM should never "close" a client. They move to their next role.

## Design

### Core Principle: One Client, Many Roles

A single `Lead` record accumulates roles over time. Each role has its own pipeline stage. Transitions between roles are explicit actions triggered by life events (deal closes, lease ends, etc.).

### Data Model Changes

**Current:** `Lead.roles: String[]` exists but `Lead.pipeline_stage: String` is a single global stage. No per-role tracking.

**New:** Add a `ClientRole` model that tracks each role independently:

```prisma
model ClientRole {
  id              BigInt   @id @default(autoincrement())
  lead_id         BigInt   @map("lead_id")
  lead            Lead     @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  role            String   // "seller" | "buyer" | "tenant" | "landlord" | "investor"
  stage           String   @default("new") // per-role pipeline stage (see stages below)
  status          String   @default("active") // "active" | "paused" | "completed" | "lost"

  // Context for this role
  property_address  String?  @map("property_address")  // which property this role relates to
  listing_id        String?  @map("listing_id")         // linked listing (if seller/landlord)
  deal_id           BigInt?  @map("deal_id")            // linked deal (if in transaction)

  // Transition tracking
  transitioned_from_id  BigInt?  @map("transitioned_from_id")  // which role triggered this one
  transition_reason     String?  @map("transition_reason")     // "sold_needs_new_home", "lease_ending", etc.

  // Dates
  started_at      DateTime @default(now()) @map("started_at")
  completed_at    DateTime? @map("completed_at")

  // Metadata
  notes           String?  @db.Text
  metadata        Json?    // role-specific data (search criteria for buyers, lease terms for tenants, etc.)

  created_at      DateTime @default(now()) @map("created_at")
  updated_at      DateTime @updatedAt @map("updated_at")

  @@index([lead_id])
  @@index([role, status])
  @@map("client_role")
}
```

**Pipeline stages per role:**

| Role | Stages |
|------|--------|
| **Seller** | prospect → pitched → exclusive_signed → listing_prep → listed → showing → offer → contract → closed |
| **Buyer** | new → pre_approved → searching → showing → offer → contract → closed |
| **Tenant** | new → searching → showing → applied → approved → lease_signed → moved_in → active |
| **Landlord** | new → exclusive_signed → listing_prep → listed → showing → application → lease_out → lease_signed → rented |
| **Investor** | new → searching → analyzing → offer → contract → closed → managing |

### Transition System

When a role reaches a terminal stage (closed, rented, active), the system prompts: **"What's next for this client?"**

**CRITICAL RULE: A client NEVER closes.** They rotate through roles indefinitely. The ONLY exit from the lifecycle is **relocation out of state**, and even that triggers a **referral** (to an out-of-state agent → referral fee income).

**Client statuses (on the Lead, not the role):**
- `active` — in the lifecycle, has at least one active role
- `nurturing` — between roles, no active transaction, staying in touch
- `relocated` — moved out of state → auto-creates referral opportunity
- `lost` — chose to work with another agent/brokerage (keep record for future win-back)
- ~~`closed`~~ — **does not exist.** Even "lost" clients may return.

**Two exits from the lifecycle (neither is permanent):**
1. **Relocated** — moved out of state → referral revenue opportunity (25% fee)
2. **Lost** — working with another agent → keep in CRM for win-back outreach (periodic market updates, "checking in" emails). They may come back for their next transaction.

**Transition map:**

```
SELLER (transaction closed) →
  "Needs to buy"             → adds BUYER role (stage: new)
  "Renting while searching"  → adds TENANT role (stage: searching)
  "Buying investment"        → adds INVESTOR role (stage: searching)
  "Nurturing"                → no new role, status = nurturing, periodic check-ins

BUYER (transaction closed) →
  "Will sell current home"   → adds SELLER role (stage: prospect, property = current home)
  "Renting out purchase"     → adds LANDLORD role (stage: new, property = purchased)
  "Nurturing"                → no new role, status = nurturing

TENANT (lease ending / active) →
  "Ready to buy"             → adds BUYER role (stage: new)
  "Renewing lease"           → updates stage to lease_signed
  "Moving out, needs rental" → new TENANT role for new search
  "Moving out of state"      → status = relocated → creates Referral record

LANDLORD (rented) →
  "Selling the property"     → adds SELLER role (stage: prospect, property = rental)
  "Buying another investment" → adds INVESTOR role (stage: searching)

INVESTOR (closed) →
  "Renting it out"          → adds LANDLORD role (stage: new, property = purchased)
  "Selling"                 → adds SELLER role (property = investment)
  "Buying another"          → adds INVESTOR role (stage: searching)

ANY ROLE → "Moving out of state" →
  status = relocated
  Auto-creates Referral record:
    - direction: outgoing
    - client: this lead
    - destination_state: [where they're moving]
    - referral_fee_pct: 25% (standard)
    - status: pending_agent_match
  Client stays in CRM — if they return to NYC, reactivate
```

### Relocation = Referral Revenue

When a client relocates:
1. All active roles marked as `paused` (not deleted — they may return)
2. Lead status set to `relocated`
3. A Referral record auto-created linking to the existing Referral Tracking system
4. Agent is prompted to find a receiving agent in the destination state
5. **Referral fee (typically 25%) is tracked through closing**
6. If client returns to NYC → reactivate, resume lifecycle

This connects the client lifecycle directly to the brokerage Referral Tracking system that already exists in the sidebar.

### Unified Client Workspace

When you open a client, you see ALL their roles as tabs:

```
┌─────────────────────────────────────────────────────────┐
│  John Smith                                              │
│  📍 88 East End Ave                                      │
│  Seller (closed) → Buyer (searching)                     │
│                                                          │
│  ┌────────┬────────┬─────────┬──────────┬──────────┐    │
│  │ Seller │ Buyer  │ History │ Marketing│ Activity  │    │
│  │(closed)│(active)│         │          │           │    │
│  └────────┴────────┴─────────┴──────────┴──────────┘    │
│                                                          │
│  [Current tab content for active role]                   │
│                                                          │
│  ┌──────────────────────────────────┐                   │
│  │  + Add Role  │  Transition ▼    │                    │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

- **Role tabs** show stage badge (active/completed)
- **History tab** shows all roles over time as a timeline
- **Marketing tab** shows all outreach across all roles
- **Activity tab** shows all events across all roles
- **"+ Add Role"** opens transition modal with context-aware options
- Completed roles are grayed but still accessible (shows the closed deal data)

### Sidebar Restructure

```
SALES & RENTALS
  Seller Prospects      ← pre-client prospecting (SellerLead model, stays separate)
  Clients               ← ALL clients, filter by active role
  Listings              ← all listings (sale + rental) with prep workflow
  Deals                 ← active transactions

BROKERAGE
  [existing 11 items unchanged]

OPERATIONS
  [existing items, remove overlap with above]
```

**Clients view** has filter tabs:
- All | Sellers | Buyers | Tenants | Landlords | Investors
- Each shows only clients with that ACTIVE role
- Badge counts per role

### SellerLead → Lead Conversion

When a seller prospect signs an exclusive:
1. Create/find a Lead record for this person (by email match)
2. Add a `ClientRole` with role="seller", stage="exclusive_signed"
3. Link to the listing being created
4. The prospect's research data (ACRIS, comps, pitch) carries forward as metadata

### Marketing Integration

Marketing actions live INSIDE each role's workspace tab:

| Role | Marketing Actions |
|------|------------------|
| **Seller (prospect)** | Hook email, pitch packet, outreach cadence |
| **Seller (listed)** | Just Listed email, open house blast, price change notice |
| **Buyer (searching)** | Property alerts, new listing matches, market updates |
| **Buyer (offer+)** | Status updates, closing timeline |
| **Tenant (searching)** | Listing matches, showing confirmations |
| **Tenant (active)** | Renewal reminders, "ready to buy?" check-ins |
| **Landlord (rented)** | Lease renewal reminders, market updates, "time to sell?" |

### Listing Prep Workflow

When a seller signs exclusive → listing is created with prep checklist:

```
LISTING PREP (stages within the listing, not the client)
  □ Exclusive agreement filed with REBNY
  □ Property walkthrough completed
  □ Staging recommendations sent
  □ Photography scheduled / completed
  □ Floor plan ordered / received
  □ Listing description drafted / approved by seller
  □ Pricing finalized (from pitch packet comps)
  □ Disclosures collected (lead paint, property condition)
  □ Co-op/condo board package (if applicable)
  □ Marketing plan confirmed
  □ RLS submission ready
  → GO LIVE
```

This checklist lives on the Listing model, not the client. Multiple sellers can share a listing (co-owners).

### API Changes

**New endpoints:**
- `GET/POST /api/crm/clients/:id/roles` — list/add roles for a client
- `PUT /api/crm/clients/:id/roles/:roleId` — update role stage
- `POST /api/crm/clients/:id/roles/:roleId/transition` — transition to new role
- `GET /api/crm/clients?role=seller&stage=listed` — filter clients by active role + stage

**Modified endpoints:**
- `POST /api/crm/sales/prospects/:id/convert` — now creates ClientRole, not just Lead
- `GET /api/crm/clients/:id` — returns all roles with stages

### Cron Integration

**Existing crons that need updates:**
- `lifecycle-triggers` (daily 5pm) — check for role transition opportunities:
  - Listings that closed → prompt seller's agent about buyer/tenant transition
  - Leases expiring in 90 days → prompt tenant's agent about renewal or buy
  - Investors with completed deals → prompt about next investment or landlord role
- `lead-scoring` (daily 1pm) — score per-role, not global

### Implementation Phases

**Phase 1: Foundation** (current session)
- Add `ClientRole` model to Prisma
- Create roles API endpoints
- Update the unified client workspace with role tabs

**Phase 2: Transitions**
- Transition modal with context-aware options
- Auto-prompt on deal close / lease end
- Role-to-role data carry-forward

**Phase 3: Listing Prep**
- Prep checklist on Listing model
- Seller prospect → Listing conversion flow
- Go-live workflow

**Phase 4: Marketing Integration**
- Per-role marketing actions in workspace
- Cross-role campaign targeting (e.g., all active buyers)
- Automated triggers (lease ending → send "ready to buy?" email)

**Phase 5: Sidebar Cleanup**
- Remove stubs (Active Sellers, Active Buyers as separate tabs)
- Unified Clients view with role filters
- Remove Sales CRM / Rentals CRM split → single "Clients" section
