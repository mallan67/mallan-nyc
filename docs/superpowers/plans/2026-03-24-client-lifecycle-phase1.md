# Client Lifecycle System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-role pipeline tracking to clients so one person can be a seller, buyer, tenant, landlord, or investor simultaneously — with role transitions, unified workspace, and sidebar consolidation.

**Architecture:** New `ClientRole` Prisma model linked to `Lead`. Each role has independent pipeline stages. Roles API manages CRUD + transitions. Unified client workspace shows role tabs. Sidebar merges Sales CRM + Rentals CRM into single "Clients" section with role filters.

**Tech Stack:** Prisma (migration), Next.js API routes, vanilla JS (CRM frontend panels)

**Spec:** `docs/superpowers/specs/2026-03-24-client-lifecycle-system.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add ClientRole model, add relation to Lead |
| `app/api/crm/clients/[id]/roles/route.ts` | Create | GET (list roles), POST (add role) |
| `app/api/crm/clients/[id]/roles/[roleId]/route.ts` | Create | PUT (update stage), POST /transition (add next role) |
| `app/api/crm/clients/route.ts` | Modify | Add `?role=seller&stage=listed` filters |
| `public/crm/js/dashboard/panels/sales-crm/index.js` | Modify | Remove stubs, point to unified client workspace |
| `public/crm/js/dashboard/panels/rentals-crm/index.js` | Modify | Remove stubs, point to unified client workspace |
| `public/crm/js/dashboard/panels/client-workspace.js` | Create | Unified workspace: role tabs, per-role pipeline, transitions |
| `public/crm/js/dashboard/app.js` | Modify | Consolidate sidebar: Sales + Rentals → Clients |
| `public/crm/dashboard.html` | Modify | Add script tag for client-workspace.js |

---

## Task 1: Add ClientRole Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add ClientRole model after the Lead model (after line 391)**

```prisma
// ═══════════════════════════════════════════════════════════
// CLIENT ROLE — per-role pipeline tracking (one client, many roles)
// ═══════════════════════════════════════════════════════════
model ClientRole {
  id              BigInt   @id @default(autoincrement())
  lead_id         BigInt   @map("lead_id")
  lead            Lead     @relation(fields: [lead_id], references: [id], onDelete: Cascade)

  role            String   // "seller" | "buyer" | "tenant" | "landlord" | "investor"
  stage           String   @default("new")
  status          String   @default("active") // "active" | "paused" | "completed" | "lost"

  // Context
  property_address  String?  @map("property_address")
  listing_id        String?  @map("listing_id")
  deal_id           BigInt?  @map("deal_id")

  // Transition tracking
  transitioned_from_id  BigInt?     @map("transitioned_from_id")
  transitioned_from     ClientRole? @relation("RoleTransition", fields: [transitioned_from_id], references: [id])
  transitioned_to       ClientRole[] @relation("RoleTransition")
  transition_reason     String?  @map("transition_reason")

  // Dates
  started_at      DateTime @default(now()) @map("started_at")
  completed_at    DateTime? @map("completed_at")

  notes           String?  @db.Text
  metadata        Json?

  created_at      DateTime @default(now()) @map("created_at")
  updated_at      DateTime @updatedAt @map("updated_at")

  @@index([lead_id])
  @@index([role, status])
  @@index([lead_id, role, status])
  @@map("client_role")
}
```

- [ ] **Step 2: Add relation to Lead model**

Find the Lead model's relations section (around line 368-374) and add:

```prisma
  client_roles             ClientRole[]
```

- [ ] **Step 3: Run migration**

```bash
npx prisma db push
npx prisma validate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(crm): add ClientRole model for per-role pipeline tracking"
```

---

## Task 2: Roles API — List & Add

**Files:**
- Create: `app/api/crm/clients/[id]/roles/route.ts`

- [ ] **Step 1: Create the roles endpoint**

**GET /api/crm/clients/[id]/roles** — list all roles for a client
- Auth: `requireAgentOrBroker()`
- Fetch all ClientRole records for this lead_id, ordered by started_at desc
- Include transition_from relation (to show where the role came from)
- Return `{ roles: ClientRole[] }`

**POST /api/crm/clients/[id]/roles** — add a new role
- Auth + write guard
- Body: `{ role, stage?, property_address?, listing_id?, transitioned_from_id?, transition_reason?, notes? }`
- Validate role is one of: seller, buyer, tenant, landlord, investor
- Validate stage is valid for the role (use STAGE_MAP below)
- Also add the role to Lead.roles array if not already present (keep in sync)
- Also update Lead.enabled_workspaces to include the new role
- Return the created ClientRole

**STAGE_MAP** (valid stages per role):
```typescript
const STAGE_MAP: Record<string, string[]> = {
  seller: ["prospect", "pitched", "exclusive_signed", "listing_prep", "listed", "showing", "offer", "contract", "closed"],
  buyer: ["new", "pre_approved", "searching", "showing", "offer", "contract", "closed"],
  tenant: ["new", "searching", "showing", "applied", "approved", "lease_signed", "moved_in", "active"],
  landlord: ["new", "exclusive_signed", "listing_prep", "listed", "showing", "application", "lease_out", "lease_signed", "rented"],
  investor: ["new", "searching", "analyzing", "offer", "contract", "closed", "managing"],
};
```

Key imports: `requireAgentOrBroker`, `isAuthError`, `logAuditEvent`, `safeBigInt`, `serializeBigInts`, `assertWriteAllowed` from existing lib modules.

Route params: `type RouteParams = { params: Promise<{ id: string }> };`

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/clients/\[id\]/roles/route.ts
git commit -m "feat(crm): roles API — list and add client roles with stage validation"
```

---

## Task 3: Role Update & Transition API

**Files:**
- Create: `app/api/crm/clients/[id]/roles/[roleId]/route.ts`

- [ ] **Step 1: Create the role detail endpoint**

**PUT /api/crm/clients/[id]/roles/[roleId]** — update stage/status
- Auth + write guard
- Body: `{ stage?, status?, property_address?, listing_id?, deal_id?, notes? }`
- Validate new stage is valid for this role's type
- If status = "completed", set completed_at = now
- If status = "lost", set completed_at = now
- Log audit event: `client_role_updated`
- Return updated role

**POST /api/crm/clients/[id]/roles/[roleId]/transition** — create a new role from this one
- Auth + write guard
- Body: `{ new_role, new_stage?, property_address?, transition_reason }`
- Validate the current role is completed or active
- Create new ClientRole with transitioned_from_id pointing to this role
- Update Lead.roles array and enabled_workspaces
- If transition_reason is "relocated":
  - Set Lead status to "relocated"
  - Pause all active roles (status = "paused")
- If transition_reason is "lost_to_competitor":
  - Set current role status to "lost"
  - Set Lead status to "lost" (if no other active roles)
- Log audit event: `client_role_transitioned`
- Return `{ previous_role, new_role }`

Route params: `type RouteParams = { params: Promise<{ id: string; roleId: string }> };`

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/clients/\[id\]/roles/\[roleId\]/route.ts
git commit -m "feat(crm): role update & transition API — stage changes, role-to-role transitions"
```

---

## Task 4: Update Clients List API with Role Filters

**Files:**
- Modify: `app/api/crm/clients/route.ts`

- [ ] **Step 1: Read the existing GET handler and add role/stage filters**

Add query params:
- `?role=seller` — filter to clients who have an ACTIVE ClientRole with this role
- `?stage=listed` — filter to clients whose active role is at this stage
- `?status=active|nurturing|relocated|lost` — filter by Lead status

The existing endpoint returns Lead records. Add a join/filter:
```typescript
// If role filter specified, only return leads with matching active ClientRole
if (role) {
  where.client_roles = {
    some: {
      role: role,
      status: "active",
      ...(stage ? { stage: stage } : {}),
    },
  };
}
```

Also add to the `include` clause:
```typescript
include: {
  client_roles: {
    where: { status: "active" },
    orderBy: { started_at: "desc" },
  },
  // ... existing includes
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/crm/clients/route.ts
git commit -m "feat(crm): add role and stage filters to clients list API"
```

---

## Task 5: Unified Client Workspace — Role Tabs

**Files:**
- Create: `public/crm/js/dashboard/panels/client-workspace.js`
- Modify: `public/crm/dashboard.html` (add script tag)

- [ ] **Step 1: Create the unified client workspace**

This is the core UI file. When you open a client, it shows:

**Header:** Client name, contact info, lifecycle summary ("Seller (closed) → Buyer (searching)")

**Role tabs:** One tab per role (active roles highlighted, completed roles grayed)

**Per-role content:** Each role tab shows:
- Pipeline stage indicator (visual steps)
- Stage-appropriate actions (varies by role + stage)
- "Advance Stage" button to move to next stage
- Role-specific data fields

**Bottom actions:**
- "+ Add Role" button — opens modal with role options
- "Transition" dropdown — context-aware (shows valid next roles based on current stage)
- "Mark as Relocated" — triggers referral creation
- "Mark as Lost" — records reason, keeps in CRM

**Structure:**
```javascript
var ClientWorkspace = (function() {
  'use strict';
  var E = Utils.esc;
  var $ = Utils.formatMoney;
  var D = Utils.formatDate;

  var _client = null;
  var _roles = [];
  var _activeTab = null; // roleId of currently viewed role

  function open(clientId, tab) { /* fetch client + roles, render */ }
  function _render(container) { /* header + role tabs + content */ }
  function _renderRoleTab(role) { /* per-role pipeline + actions */ }
  function _renderPipeline(role) { /* visual stage steps */ }
  function _advanceStage(roleId) { /* PUT to advance to next stage */ }
  function _addRole() { /* modal: pick role + optional context */ }
  function _transition(roleId) { /* modal: pick next role + reason */ }
  function _markRelocated() { /* sets status, creates referral prompt */ }
  function _markLost() { /* sets status, records reason */ }

  return {
    open: open,
    _advanceStage: _advanceStage,
    _addRole: _addRole,
    _transition: _transition,
    _markRelocated: _markRelocated,
    _markLost: _markLost,
    // ... other exposed functions for onclick handlers
  };
})();
```

**Pipeline visualization per role (horizontal steps):**
```
○ Prospect → ○ Pitched → ● Exclusive → ○ Prep → ○ Listed → ○ Showing → ○ Offer → ○ Contract → ○ Closed
                           (current)
```

Active stage is gold filled circle, completed stages have checkmarks, future stages are gray outlines.

**Role tab bar:**
```html
<div class="flex gap-1 border-b">
  <button class="active-tab">Seller (listed)</button>
  <button class="completed-tab">Buyer (closed ✓)</button>
  <button class="add-tab">+ Add Role</button>
</div>
```

- Active roles: gold text, border-bottom
- Completed roles: gray text with ✓
- Paused roles: italic, muted

**Transition modal (shown after clicking "What's Next?"):**
Shows context-aware options based on the completed role. For example after Seller closes:
- "Needs to buy" → adds Buyer role
- "Renting while searching" → adds Tenant role
- "Buying investment" → adds Investor role
- "Moving out of state" → marks as relocated, prompts referral
- "Working with another agent" → marks as lost

**Important:** This file must use the same patterns as existing CRM panels:
- `CRM.getContent()` for container
- `CRM.setPanelTitle()` for title
- `MallanAPI._fetch()` for API calls
- `CRM.openModal()` for modals
- `CRM.toast()` for notifications
- `Router.navigate()` for navigation

- [ ] **Step 2: Add script tag to dashboard.html**

After the existing script tags (around line 189), add:
```html
<script src="/crm/js/dashboard/panels/client-workspace.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add public/crm/js/dashboard/panels/client-workspace.js public/crm/dashboard.html
git commit -m "feat(crm): unified client workspace with role tabs, pipeline, and transitions"
```

---

## Task 6: Wire Workspace to Router + Sidebar

**Files:**
- Modify: `public/crm/js/dashboard/app.js`

- [ ] **Step 1: Add workspace routes**

Add new routes for the unified workspace:
```javascript
Router.register('/clients', function() { Panels.clientAddressBook(); });
Router.register('/clients/:id', function(p) { ClientWorkspace.open(p.id); });
Router.register('/clients/:id/:tab', function(p) { ClientWorkspace.open(p.id, p.tab); });
```

- [ ] **Step 2: Consolidate sidebar**

Replace the SALES CRM and RENTALS CRM groups with a single unified section:

```javascript
html += _sidebarGroup('CLIENTS', 'clients', [
  { route: '/sales/prospects', icon: 'fa-crosshairs', label: 'Seller Prospects' },
  { route: '/clients?role=seller', icon: 'fa-home', label: 'Sellers' },
  { route: '/clients?role=buyer', icon: 'fa-user-tag', label: 'Buyers' },
  { route: '/clients?role=landlord', icon: 'fa-key', label: 'Landlords' },
  { route: '/clients?role=tenant', icon: 'fa-user-check', label: 'Tenants' },
  { route: '/clients?role=investor', icon: 'fa-chart-line', label: 'Investors' },
  { route: '/listings', icon: 'fa-building', label: 'Listings' },
]);
```

This replaces both SALES CRM (8 items) and RENTALS CRM (8 items) with 7 items.

- [ ] **Step 3: Update SalesCRM and RentalsCRM to redirect stubs**

In `sales-crm/index.js`, update stub functions to redirect:
```javascript
function activeBuyers() { Router.navigate('/clients?role=buyer'); }
function landlordSellers() { Router.navigate('/clients?role=seller'); }
function salesListings() { Router.navigate('/listings'); }
```

In `rentals-crm/index.js`, same pattern:
```javascript
function rentalListings() { Router.navigate('/listings'); }
function viewedDidNotRent() { Router.navigate('/clients?role=tenant&stage=lost'); }
```

- [ ] **Step 4: Commit**

```bash
git add public/crm/js/dashboard/app.js public/crm/js/dashboard/panels/sales-crm/index.js public/crm/js/dashboard/panels/rentals-crm/index.js
git commit -m "feat(crm): consolidate sidebar — unified Clients section replaces Sales + Rentals CRM"
```

---

## Task 7: Migrate Existing Clients to ClientRole

**Files:**
- Create: `scripts/migrate-client-roles.ts`

- [ ] **Step 1: Write migration script**

For each Lead that has `roles[]` populated, create corresponding ClientRole records:

```typescript
// For each Lead with roles
const leads = await prisma.lead.findMany({
  where: { roles: { isEmpty: false } },
});

for (const lead of leads) {
  for (const role of lead.roles) {
    // Check if ClientRole already exists
    const existing = await prisma.clientRole.findFirst({
      where: { lead_id: lead.id, role: role },
    });
    if (existing) continue;

    await prisma.clientRole.create({
      data: {
        lead_id: lead.id,
        role: role,
        stage: mapPipelineStage(lead.pipeline_stage, role),
        status: lead.status === 'closed' ? 'completed' : 'active',
        property_address: lead.property_address,
        started_at: lead.created_at,
        completed_at: lead.closing_date,
      },
    });
  }
}
```

- [ ] **Step 2: Run migration**

```bash
npx tsx scripts/migrate-client-roles.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-client-roles.ts
git commit -m "feat(crm): migration script — create ClientRole records from existing Lead.roles"
```

---

## Execution Order

1. **Task 1** — ClientRole model (foundation)
2. **Task 2** — Roles API: list & add
3. **Task 3** — Role update & transition API
4. **Task 4** — Client list API filters
5. **Task 7** — Migration script (populate data)
6. **Task 5** — Unified workspace UI (biggest task)
7. **Task 6** — Router + sidebar consolidation
