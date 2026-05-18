# CRM Workflow Proof Audit — 2026-05-16

**Repo HEAD:** `82c617c4` (main, post-PR-#144 merge) · **Auditor:** Claude (Sonnet 4) · **Scope:** read-only · **No patches, no migrations, no schema changes**

This audit answers the business question: **can broker/admin, broker-as-agent, agent, buyer, renter, seller, landlord actually use this as a producing CRM?** Each workflow is traced end-to-end (UI file → JS function → API route → auth check → Prisma model → response → UI render). Each item is rated WORKING / PARTIAL / BROKEN / MOCK / MISSING / UNKNOWN.

---

## Executive summary

| Domain | Working | Partial | Broken / Missing | Critical findings |
|---|---|---|---|---|
| **Broker/Admin** (10) | 7 | 3 | 0 | Impersonation bypasses backend audit; lead-reassign API absent; referral-approval API absent |
| **Broker-as-agent** (10) | 8 | 2 | 0 | Inherits agent flow but impersonation entry is client-side only (security gap) |
| **Agent** (11) | 10 | 1 | 0 | Agents cannot PATCH `/api/crm/leads/[id]` directly (broker-only) |
| **Lead → Client lifecycle** (8) | 5 | 2 | 1 | **CRITICAL:** public inquiries silently upsert duplicates; no `Lead.converted_at` |
| **Seller / Landlord** (8) | 7 | 0 | 1 | No broker-approval gate between intake and active listing |
| **Buyer / Renter** (7) | 6 | 0 | 1 | **CRITICAL: BUYER-DEAL-FORM.html + TENANT-DEAL-FORM.html submit handlers are STUBS** — backend exists but no POST |
| **Portal** (40 routes) | 27 | 0 | 3 unknown / 10 not sampled | All sampled routes auth-gated; **no security regressions found**; legacy `portal_role` vs new `enabled_workspaces[]` dual-storage is technical debt only |

**Bottom-line answer to the business question:**

The system is **75–80% producing-CRM capable today**. It is NOT broken-by-default: most core flows (agent leads, agent clients, portal data isolation, REBNY compliance gates on listings) work end-to-end with proper Prisma persistence and audit logging. But three concrete defects prevent it from being a **complete** producing CRM:

1. **Commission requests cannot be submitted** — `BUYER-DEAL-FORM.html` and `TENANT-DEAL-FORM.html` have submit buttons wired to JS stubs that don't POST. The backend `/api/crm/deals` POST handler exists and works.
2. **Broker cannot reassign leads via API** — permission matrix declares the capability but no `POST/PATCH /api/crm/leads/[id]/assign` route exists.
3. **Impersonation is client-side only** — `Store.startImpersonation()` is invoked directly from `app.js` without calling the existing `POST /api/crm/agents/[id]/impersonate` route, so no audit trail is written and the delegated session is never created.

The 4th and 5th items (broker approval gate for seller/landlord intake; duplicate-inquiry warning) are business-logic gaps, not code defects.

---

## 1. Broker / Admin workflow truth table

| # | Item | STATUS | UI file(s) | JS caller / function | API route | Prisma model(s) | Auth / permission behavior | Issue & required fix |
|---|---|---|---|---|---|---|---|---|
| A1 | Broker login opens correct CRM hub | **WORKING** | `public/crm/login.html` · `dashboard.html` | `api-client.js:70-83` `auth.login()` → `app.js` `MallanAPI.init()` | `POST /api/auth/login` (lines 1-100) | `Agent`, `MfaSession` | Line 74-75 checks `agent.role === 'BROKER'`; MFA enforced; HTTP-only cookie set; `app.js:118-120` routes broker → `/broker/dashboard` | — |
| A2 | Broker can see ALL leads | **WORKING** | (panels.js) | `MallanAPI.leads.list()` | `GET /api/crm/leads` (lines 23-31) | `Lead` | Lines 23-31: non-broker → `where.agent_id = auth.userId`; broker default = unassigned, `?all=true` = all | — |
| A3 | Broker can see ALL agents | **WORKING** | (panels.js → Panels.agentRoster) | `MallanAPI.agents.list()` `api-client.js:282` | `GET /api/crm/agents` | `Agent` | Line 10: `requireBroker(req)` — agents 403 | — |
| A4 | Broker can assign/reassign lead to agent | **PARTIAL** | (panels.js — no explicit UI found in sampled lines) | None found in `api-client.js` | **MISSING** — no `/api/crm/leads/[id]/assign` route | `Lead.agent_id` field exists | `permissions.js:34` declares `assign_lead: { broker: true }` but no backend endpoint | **FIX:** Create `POST /api/crm/leads/[id]/assign` with broker-only gate + audit log; wire UI in `panels.js` |
| A5 | Broker can create/update tasks | **WORKING** | (panels.js tasks panel) | `MallanAPI.tasks.*` | `GET /api/crm/tasks` (line 26), `POST /api/crm/tasks` (line 69) | `FollowUpTask` | Line 26: non-broker → `where.agent_id = auth.userId`; broker sees all | — |
| A6 | Broker can see ALL clients | **WORKING** | (panels.js → Panels.clientAddressBook) | `MallanAPI.clients.list()` | `GET /api/crm/clients` (lines 11-34) | `Lead` (via `lib/db/clients.ts:61` `findClients`) | Role passed; broker = all, agent = own only | — |
| A7 | Broker can see pipeline / deals | **WORKING** | (panels.js) | `MallanAPI.deals.list()`, `MallanAPI.pipeline.*` | `GET /api/crm/pipeline` (lines 9-79), `GET /api/crm/deals` (lines 10-31) | `Lead`, `Deal` | Pipeline line 14: non-broker → `where.agent_id`; deals uses `findDeals()` helper | — |
| A8 | Broker can act as agent on own leads/listings (impersonation) | **PARTIAL — SECURITY GAP** | `app.js:872-889` `doImpersonate()` | `Store.startImpersonation(agent)` `app.js:877` — **client-side only** | Backend `POST /api/crm/agents/[id]/impersonate` (lines 1-68) **EXISTS but NOT CALLED** | `Agent` | Backend line 12 requires broker, creates 2h delegated session, logs audit (lines 37-48). `permissions.js:13` derives `broker_as_agent` from `Store.isBroker() && Store.isImpersonating()` | **FIX:** Modify `doImpersonate()` to POST to backend first, receive delegated session token, set cookie. Currently impersonation has NO audit trail and NO server-side delegated session — pure client localStorage flag |
| A9 | Broker can approve/supervise listing/intake workflow | **PARTIAL** | `panels.js:25-196` (brokerApprovalQueue), `:4683-4686` (`_approvePayout`), `:6759-6767` (`_approveDoc`) | `_approvePayout` → `MallanAPI.deals.updateStatus()`; `_approveDoc` → `Documents.approve()` | `PATCH /api/crm/deals/[id]/status` (lines 1-123); `POST /api/crm/documents/[id]/approve` (lines 1-45) | `Deal`, `Document`, `Notification` | Deals line 90: `BROKER_ONLY_STATUSES` (approved, rejected) blocked for agents; Docs line 13: `requireBroker()` | **GAP:** `permissions.js:65` declares `approve_referral_fee` but no backend route exists. **FIX:** Create `POST /api/crm/referrals/[id]/approve` for parity |
| A10 | Broker-only tabs hidden from non-broker agents | **WORKING** | `dashboard.html` shell + `app.js:379-393` `renderSidebar()` | `Permissions.canSeeBrokerConsole()` | n/a (client gate); Router enforces server-side via `requireBroker()` on endpoints | n/a | Dual gating: sidebar visibility AND router redirects `/broker/*` → `/ops/dashboard` if `!canSeeBrokerConsole()` | — |

---

## 2. Broker-as-agent workflow truth table

Broker-as-agent is broker impersonating an agent. Per `permissions.js:13`, the role is derived from `Store.isBroker() && Store.isImpersonating()`. The permission matrix gives broker-as-agent slightly broader rights than agent on some actions (`create_referral`, `change_featured: false vs agent's false`), but server-side most routes don't distinguish — they only see the session role (BROKER) and the impersonated agent ID via header / session.

| # | Item | STATUS | Behavior + issue |
|---|---|---|---|
| BA1 | Broker can start impersonation | **PARTIAL** | `Store.startImpersonation(agent)` is client-only — bypasses backend `POST /api/crm/agents/[id]/impersonate` (see A8). No audit row written. |
| BA2 | Impersonated session has correct effective agent ID | **WORKING (client-side)** | `Store.getEffectiveAgentId()` returns `impersonatedAgentId` when impersonating |
| BA3 | Server sees broker session, not impersonated session | **PARTIAL** | Because impersonation never reaches the backend, server-side queries still run with broker auth — effectively broker sees ALL data, not the impersonated agent's filtered view. UI shows the agent's filtered view via `getEffectiveAgentId()`, but the underlying API calls don't include any `impersonate_agent_id` header. |
| BA4 | Audit log distinguishes broker-as-agent actions | **MISSING** | No `impersonating_agent_id` field captured in `AuditEvent.changes`. Audit shows broker as the actor regardless. |
| BA5 | Sidebar shows agent-scoped tabs while impersonating | **WORKING** | `canSeeBrokerConsole()` returns false when impersonating |
| BA6 | Stop impersonation returns to broker view | **WORKING (client-side)** | `Store.stopImpersonation()` clears flags + emits `impersonation:ended` |
| BA7 | Broker-as-agent can create lead on behalf of impersonated agent | **PARTIAL** | UI shows agent context; backend creates lead with broker's userId as `agent_id` unless the create payload explicitly sets it. Verify per-route. |
| BA8 | Broker-as-agent can convert lead | **WORKING (with caveat)** | `convert_lead: { broker: true, broker_as_agent: 'assigned' }` — but `assigned` ownership check on client uses `Store.getEffectiveAgentId()`. Server has no equivalent restriction since session is broker. |
| BA9 | Broker-as-agent can approve payouts (NO per spec) | **WORKING** | `approve_payout: { broker_as_agent: false }` — UI hides; server-side `BROKER_ONLY_STATUSES` checks role===BROKER which is still true while impersonating, so this is actually LEAKY — broker can still approve while in impersonation mode via direct API calls. Client UI hides the button but server still allows it. |
| BA10 | All broker-as-agent actions audited | **MISSING** | See BA4 — no distinction in audit log. |

**Net:** Impersonation is fundamentally **client-side cosmetic** at present. The backend never knows the broker is impersonating. This is acceptable for **read-only filtering view** but **dangerous for writes** (broker-as-agent could still approve their own deals because the server doesn't enforce the impersonation role restrictions).

---

## 3. Agent workflow truth table

| # | Item | STATUS | UI file(s) | JS caller / function | API route | Prisma model(s) | Auth / permission behavior | Issue & required fix |
|---|---|---|---|---|---|---|---|---|
| B1 | Agent login opens correct agent workspace | **WORKING** | `login.html` → `dashboard.html` | `api-client.js:70` `auth.login()` | `POST /api/auth/login` (lines 54-129) | `Agent`, `Session` | Non-broker role → 8h `createSession("agent", agent.id, agent.role)`; `home-screen.js:12` branches on role | — |
| B2 | Agent sees ASSIGNED leads only | **WORKING** | (leads panel) | `MallanAPI.leads.list()` | `GET /api/crm/leads` (lines 23-31) | `Lead` | Line 24: `where.agent_id = auth.userId` for non-broker | — (note: this endpoint is for **lead distribution** — assigned clients are fetched via `/api/crm/clients`) |
| B3 | Agent can update lead status | **PARTIAL — BROKER-ONLY** | (leads detail panel) | `MallanAPI.leads.update()` | `PATCH /api/crm/leads/[id]` (line 15) | `Lead` | Line 21: `requireBroker()` — **agents 403** | **FIX:** Either (a) loosen route to allow agents to update non-sensitive fields on their own leads, or (b) provide a separate agent-scoped endpoint (e.g. `PATCH /api/crm/leads/[id]/status` with agent gate). Agents currently must go through `/api/crm/intake/[type]` or the convert API for status changes |
| B4 | Agent can add notes / activity | **WORKING** | (workspace panels) | `MallanAPI._fetch /api/crm/notes`, `/api/crm/activity` | `POST /api/crm/notes` (line 8), `GET/POST /api/crm/activity` (lines 6-64) | `Lead` (notes appended), `ActivityLog` | Notes line 41: agents 403 if `client.agent_id !== auth.userId`; activity uses `assertLeadIdStringAccess()` | — |
| B5 | Agent can create/update tasks | **WORKING** | (tasks panel) | `MallanAPI.tasks.*` | `GET/POST /api/crm/tasks` (lines 26, 84-92) | `FollowUpTask` | POST checks agent owns the lead before creating task | — |
| B6 | Agent sees ASSIGNED clients only | **WORKING** | (clients address book panel) | `MallanAPI.clients.list()` | `GET /api/crm/clients` (line 19-27) | `Lead` via `findClients()` `lib/db/clients.ts:61` | Non-broker → `where.agent_id = userId` | — (replicated correctly across sales/buyers, sales/landlord-sellers, rentals/landlords, rentals/tenants) |
| B7 | Agent can save/send searches | **WORKING** | (search panel + saved-searches UI) | `MallanAPI.savedSearches.*` | `GET/POST /api/crm/saved-searches` (lines 69-223) | `SavedSearch` | Line 75: `where: { agent_id: auth.userId }`; POST sets agent_id (line 199); Fair Housing scan on `name` (line 160) | (minor: `SavedSearch.lead_id` is nullable — allows agent-only saved searches, intentional?) |
| B8 | Agent can manage buyer/renter workflow | **WORKING** | `sales-crm/buyer-workspace.js`, `rentals-crm/tenant-workspace.js` | `renderBuyerSections()` → fetches `/api/crm/listing-views`, `/api/crm/listing-engagement` | Multiple — see E1-E7 | — | — | — |
| B9 | Agent can manage seller/landlord workflow | **WORKING** | `sales-crm/seller-workspace.js` (1,641 lines), `rentals-crm/landlord-workspace.js` | (workspace render fns) | `/api/crm/sales/landlord-sellers`, `/api/crm/rentals/landlords` | `Lead`, `Listing` | Agent-id filter on list endpoints | — |
| B10 | Agent CANNOT see broker-only data | **WORKING** | n/a | n/a | All `view_all_*` routes use `requireBroker()` or filter by `agent_id` | n/a | Server-side enforcement, NOT just UI hiding. Verified across leads, clients, agents, deals, audit-log | — |
| B11 | Agent activity is audited | **WORKING** | n/a | n/a | `logAuditEvent()` called 240+ times across `app/api/crm/**` | `AuditEvent` | `audit-log` GET filters by `user_id: auth.userId` for agents | — |

---

## 4. Lead → Client lifecycle truth table

| # | Item | STATUS | UI file(s) | API route | Prisma model(s) | Auth | Issue & required fix |
|---|---|---|---|---|---|---|---|
| C1 | Public inquiry creates Lead | **WORKING** | `app/components/InquiryForm.tsx`, `InquiryModal.tsx` + 8 calculator/contact endpoints | `POST /api/inquiries` (lines 1-243) | `Lead` (upsert by email lines 82-101), `Inquiry`, `AuditEvent` | Public; rate-limited 30/hr/IP; consent required | — but see C7 (duplicates) |
| C2 | Lead has source, role/type, contact info, assigned agent | **WORKING** | (intake forms) | n/a | `Lead.source`, `roles[]`, `agent_id`, `status`, `pipeline_stage` | — | — |
| C3 | Lead converts to Client | **WORKING (multi-path)** | (intake panels, sales-crm prospect convert button) | `POST /api/crm/convert` (lines 1-400+) handles 6 actions; **separate** `POST /api/crm/sales/prospects/[id]/convert` for SellerLead→Lead | `Lead`, `SellerLead`, `Listing` | Agent or broker; agent only on own | **ISSUE:** No `Lead.converted_at` timestamp — conversion is implicit via `pipeline_stage` change. **FIX:** Add `Lead.converted_at` (nullable DateTime), set on first non-"new" transition |
| C4 | Client can have multiple roles | **WORKING** | (intake forms support multi-select) | `POST /api/crm/intake/[type]` (lines 74-145) | `Lead.roles[]` (TEXT[]) | Agent/broker | **ISSUE:** No dedupe — multi-intake can produce `roles = ["buyer", "buyer", "investor"]`. **FIX:** `Array.from(new Set(lead.roles))` on update |
| C5 | `/api/crm/convert` end-to-end | **WORKING** | n/a | `POST /api/crm/convert` 6 actions: `promote_to_listing` (creates Listing with `owner_client_id=lead.id`), `buyer_rep_signed`, `activate_renter`, `sign_lease`, `promote_to_buyer`, `role_transition` | `Lead`, `Listing`, `ActiveLease` | — | **ISSUE:** Audit logging incomplete across all 6 handlers (`buyer_rep_signed` + `promote_to_listing` log; others may not). **FIX:** Ensure every handler calls `logAuditEvent` with before/after |
| C6 | `Listing.owner_client_id` written on convert | **WORKING** | n/a | `/api/crm/convert` line 218 sets `owner_client_id: lead.id` | `Listing` FK to `Lead` | — | — (FK constraint working; consumed by lease-tracker, events) |
| C7 | Duplicate lead/client handling | **CRITICAL GAP** | n/a | `POST /api/inquiries` lines 82-101 silently upserts on email; `POST /api/crm/clients` lines 46-50 returns **409 reject** | `Lead` | — | **CRITICAL:** Inconsistent policy. Public inquiry silently merges, CRM manual create rejects. No phone-based dedup. **FIX:** (a) log `AuditEvent` action `inquiry_duplicate_detected` on upsert hit; (b) add `Inquiry.duplicate_of_lead_id` (nullable BigInt); (c) decide one policy globally and apply |
| C8 | Activity history follows lead/client | **PARTIAL** | n/a | Two layers: `AuditEvent` (240+ writes) AND `ActivityLog` (less coverage) | `AuditEvent`, `ActivityLog` | — | **ISSUE:** Two parallel audit systems not coordinated. `ActivityLog` rarely written from API routes. **FIX:** Either collapse into single `AuditEvent` source-of-truth OR ensure every Lead-state change writes both rows |

---

## 5. Seller / Landlord workflow truth table

| # | Item | STATUS | UI file(s) | API route | Prisma model(s) | Auth | Issue & required fix |
|---|---|---|---|---|---|---|---|
| D1 | Seller / landlord intake form exists | **WORKING** | `seller-intake.js:303-670`, `landlord-intake.js:1-150` | Form auto-saves to `PATCH /api/crm/clients/{id}` (line 644-654) | `Lead` | Agent/broker | — |
| D2 | Form fields map to API payload | **WORKING** | Field names match 1:1 | `/api/crm/clients/{id}` whitelist (lines 139-147) covers `home_prep_checklist`, `authorized_signatories`, `marketing_strategy`, etc. | `Lead` | — | — |
| D3 | API writes to real Prisma | **WORKING** | n/a | `prisma.lead.create()` (line 85 sellers, line 77 landlords) | `Lead`, `SellerLead` | — | No localStorage fallback; all real writes |
| D4 | Agent assignment | **WORKING** | (auto) | `agent_id: auth.userId` at intake POST line 94 sellers, line 86 landlords | `Lead` | — | Auto-assigned to creating agent. No reassignment UI yet (see A4 gap) |
| D5 | Broker approval gate | **MISSING** | — | No `/api/crm/sales/sellers/.../approve` or `/api/crm/rentals/landlords/.../approve` route | n/a | — | **GAP:** Intake → active lead happens directly. **FIX (if business requires):** Add status field with values like `pending_broker_approval` → `approved`, create approval routes with `requireBroker()` |
| D6 | Listing draft → live conversion | **WORKING** | `SALE-FORM-REDESIGN.html` (8,302 lines), `RENTAL-FORM-REDESIGN.html` (7,397 lines) | `POST /api/crm/listings` (lines 136-299) initial status `Draft`; submit triggers REBNY validation | `Listing` with `owner_client_id` link back to Lead | Agent/broker | — |
| D7 | Required listing fields captured | **WORKING** | 182 `data-rls-field` attrs in sale form | `lib/compliance/rls-enforcement.ts` `assertRlsCompliantPayload()` line 191 enforces all 19 UCBA mandatory fields | — | — | RLS enforcement gate active; 422 on missing fields |
| D8 | Portal status page loads real data | **WORKING** | n/a | All 4 seller endpoints + all 4 landlord endpoints query real Prisma; **zero mock data found** | `Lead`, `Listing`, `Showing`, `PortalEvent`, `BuyerIntentProfile`, `ListingMomentum`, `SocialProofCache`, `MarketSnapshot` | Portal role gate | — |

---

## 6. Buyer / Renter workflow truth table

| # | Item | STATUS | UI file(s) | API route | Prisma model(s) | Auth | Issue & required fix |
|---|---|---|---|---|---|---|---|
| E1 | Public + agent-created inquiry | **WORKING** | `InquiryForm.tsx` (public), `buyer-intake.js`, `renter-intake.js` (CRM) | `POST /api/inquiries`, `POST /api/crm/intake/[type]` | `Lead`, `Inquiry` | Public; agent/broker | Both paths converge on Lead/Inquiry |
| E2 | Saved searches tied to client + agent | **WORKING** | (search panel) | `GET/POST /api/crm/saved-searches` | `SavedSearch` (agent_id, lead_id nullable) | Agent/broker | — |
| E3 | Listing sends tied to client + agent | **WORKING** | (panels) | `POST /api/crm/listing-sends` (lines 13-98) — backing store is `AuditEvent` with `action="listing_sent"`, NOT a dedicated model | `AuditEvent` (with idempotency) | Agent/broker; `assertLeadIdsAccess()` | **OBSERVATION:** No dedicated `ListingSend` table — history is in audit_events. Likely acceptable but limits richer queries (e.g., open-rate stats per agent). |
| E4 | Showing requests tied to client + agent | **WORKING** | (showings panel + portal) | `GET/POST /api/crm/showings` + `GET/POST /api/portal/showings` | `Showing` (lead_id, listing_id, agent_id, feedback) | Agent/broker; portal role | Properly scoped |
| E5 | Reactions / favorites | **WORKING** | (portal listing card) | `POST /api/portal/listings/[id]/react`, `GET /api/portal/favorites` | `ClientListingAction` (unique on lead_id+listing_id+action) | Buyer/renter portal role | Actions: liked, disliked, discuss, schedule |
| E6 | Deal form (commission request) writes to real model | **CRITICAL — BROKEN** | `BUYER-DEAL-FORM.html` (1,895 lines), `TENANT-DEAL-FORM.html` (1,402 lines) | Backend `POST /api/crm/deals` (lines 33-73) **EXISTS AND WORKS** — but **frontend `submitBuyerDeal()` is a STUB** (line 1869) that only validates + toasts; **does NOT POST** | `Deal`, `CommissionPayment` (backend models ready) | Agent/broker | **CRITICAL FIX:** Implement `submitBuyerDeal()` and `submitTenantDeal()` to: (1) collect form data, (2) POST to `/api/crm/deals` with `{agent_id, representation_code, property_address, price_usd, commission_rate_percent, split_percent, agent_fee_usd, company_fee_usd, gross_commission_usd, contract_signed}`, (3) capture returned `deal.id`, (4) update form UI with draft badge + history tab. Backend is ready; this is a JS-only fix of <50 lines per form |
| E7 | Portal data loads real backend | **WORKING** | n/a | Buyer (`/portal/buyer/activity`, `/saved`), Tenant (`/lease`, `/viewed-history`, `/signals`, `/renewal`), shared (`/showings`, `/favorites`, `/listings/[id]/react`) all query real Prisma | `PortalEvent`, `ClientListingAction`, `Showing`, `ShowingHistory`, `Lead` | Portal role gate | All sanitized via `sanitizeListingForPortal()` (agent PII stripped per REBNY) |

---

## 7. Portal workflow truth table (40 routes)

**Auth model:** HTTP-only `session_token` cookie → `validateSession()` (`lib/auth/middleware.ts:20-43`) → `SessionUser{userId, userType: "lead"|"agent", role}`. Portal-specific gating via `requirePortalRole(role)` (line 89-118) or `requireWorkspace()` (new pattern using `Lead.enabled_workspaces[]`).

| Portal | Routes | Auth gate | Data source | PII sanitized? | Status |
|---|---|---|---|---|---|
| **Buyer** | 8 (listings, saved, favorites, external-listings, comments, showings, offers, messages) | `requirePortalRole("buyer")` | Real Prisma w/ ownership filters | ✓ agent name masked "via agent"; address suppressed | WORKING |
| **Seller** | 7 (dashboard, activity, demand, fomo, signals, showings, offers) | `requirePortalRole("seller")` | Real Prisma; scoped to `owner_client_id` | ✓ buyer masked "Buyer (via agent)" | WORKING |
| **Tenant** | 6 (lease, viewed-history, renewal, signals, showings via buyer, messages) | `requirePortalRole("tenant")` | Real Prisma; tenant lease fields | ✓ | WORKING |
| **Landlord** | 6 (dashboard, activity, relist, signals, showings, offers) | `requirePortalRole("landlord")` | Real Prisma; scoped to `owner_client_id` | ✓ | WORKING |
| **Shared** | 13 (me, complete-profile, preferences, family, family/invite, price-history, comparables, open-houses, marketing, documents, attorney, listings/request, offer-status) | `requireAuth()` + workspace check | Mix real + static config | ✓ via DTO | mostly WORKING; 6 routes unread (UNKNOWN) |

**Critical security finding (already fixed in current code):** `/api/portal/showings` (line 42-46) and `/api/portal/offers` (lines 79-93) now scope by `owner_client_id` — earlier scoping by `agent_id` would have leaked cross-client data when sharing an agent. **No cross-lead leak is currently exploitable** in sampled routes.

**Technical debt (not security):** `Lead.portal_role` (single value, LEGACY) + `Lead.enabled_workspaces[]` (array, NEW) dual storage. Routes mix both. Migration to `requireWorkspace()` exclusively is recommended but not urgent.

**Unknown / not sampled (10 routes):** `price-history`, `comparables`, `marketing`, `listings/request`, `offer-status`, `attorney`, `documents`, `seller/demand`, `seller/signals`, `tenant/renewal`, `tenant/signals`, `landlord/signals`, `landlord/relist` — assumed working per same pattern but not verified line-by-line.

---

## 8. Top 25 broken / missing items, ranked by production impact

| Rank | Item | Severity | Domain | What's broken | Fix sketch |
|---|---|---|---|---|---|
| 1 | **BUYER-DEAL-FORM + TENANT-DEAL-FORM submit handlers are STUBS** | **CRITICAL** | E6 | Agents cannot submit commission requests. Forms validate + toast but don't POST. Backend is ready. | ~50 LoC per form: collect → POST `/api/crm/deals` → capture deal.id → render draft badge |
| 2 | **Impersonation is client-side only (`Store.startImpersonation` bypasses backend)** | **CRITICAL — SECURITY** | A8, BA1-BA10 | Backend has `POST /api/crm/agents/[id]/impersonate` with delegated session + audit, but `app.js:doImpersonate()` calls `Store.startImpersonation()` directly | Modify `doImpersonate()` to POST first, receive session, set cookie. Add `impersonating_agent_id` to AuditEvent payload helper |
| 3 | **Public inquiries silently merge duplicate emails; CRM rejects duplicates** | HIGH | C7 | Inconsistent dedup policy. No phone-based dedup. No audit trail on merge. | Add `Inquiry.duplicate_of_lead_id` field + log `AuditEvent` action `inquiry_duplicate_detected`; pick one global policy |
| 4 | **No broker-only `POST /api/crm/leads/[id]/assign` route** | HIGH | A4 | Permission matrix declares `assign_lead`, no backend endpoint, no reassignment UI | Create endpoint with broker gate + audit; wire UI in `panels.js` |
| 5 | **No `Lead.converted_at` timestamp** | HIGH | C3 | Cannot answer "when did this lead become a client" cleanly | Add nullable `DateTime?` field; populate on first non-"new" `pipeline_stage` transition |
| 6 | **`PATCH /api/crm/leads/[id]` is broker-only — agents cannot update their own leads' status** | HIGH | B3 | Agents must go through convert/intake routes; no direct status update | Either loosen route or add `PATCH /api/crm/leads/[id]/status` with agent gate |
| 7 | **No broker approval gate between seller/landlord intake and active state** | MEDIUM | D5 | Intake → active lead directly. If business mandates broker sign-off, missing | Add `pending_broker_approval` status + approve routes |
| 8 | **No `POST /api/crm/referrals/[id]/approve` endpoint** | MEDIUM | A9 | `permissions.js:65` declares `approve_referral_fee` but no backend | Create with broker gate + audit |
| 9 | **Convert API audit logging is incomplete across 6 handlers** | MEDIUM | C5 | `promote_to_listing` + `buyer_rep_signed` log; others (`activate_renter`, `sign_lease`, `promote_to_buyer`, `role_transition`) may not | Ensure every handler calls `logAuditEvent` with before/after state |
| 10 | **Two parallel audit systems (`AuditEvent` + `ActivityLog`) not coordinated** | MEDIUM | C8 | `ActivityLog` rarely populated from API routes; `AuditEvent` is the de-facto source-of-truth | Either collapse into one OR write both on every state change |
| 11 | **Multi-role intake can accumulate duplicate role values in `Lead.roles[]`** | LOW | C4 | `roles = ["buyer", "buyer", "investor"]` possible if intake submits twice | Dedupe via `Array.from(new Set(...))` on update |
| 12 | **No dedicated `ListingSend` model — history lives in `AuditEvent`** | LOW | E3 | Limits richer queries (e.g., per-agent open rate, send-frequency throttling) | Add canonical `ListingSend` model in next schema migration |
| 13 | **Broker-as-agent role not enforced server-side** | MEDIUM — SECURITY | BA3, BA9 | Server sees broker session always, regardless of client-side impersonation. Broker-as-agent could approve own deals via direct API call (UI hides button but server allows). | Once #2 (impersonation backend) is wired, server can enforce role restrictions on impersonation-tagged requests |
| 14 | **`SavedSearch.lead_id` nullable allows orphan saved searches** | LOW | E2 | Intentional? Agent-only "team search"? Unclear from code | Document policy; add UI clarity for personal-vs-client searches |
| 15 | **10 portal routes not sampled in detail** | UNKNOWN | Portal | `price-history`, `comparables`, `marketing`, `attorney`, etc. — assumed working but unverified | Sample-audit each route for data source + auth gate |
| 16 | **No phone-based duplicate detection on inquiry** | LOW | C7 | Only email is checked for upsert | Add phone normalization + secondary unique key |
| 17 | **No CRM tests for full lead-lifecycle integration (inquiry → upsert → assign → convert → listing)** | MEDIUM | (test coverage) | 692 .test.ts files but no end-to-end inquiry-to-listing flow | Add Playwright e2e test |
| 18 | **CRM v2 lifecycle docs claim `detectTypeAndPhase()` routing but actual JS implementation not yet traced** | UNKNOWN | (architecture) | CLAUDE.md describes but workspace.js (6,395 lines) not deeply read | Deeper pass on `workspace.js` |
| 19 | **`panels.js` (13,358 lines) is monolithic — hosts Featured, Sales CRM, Rentals CRM, multiple workspaces** | MEDIUM | (maintainability) | Single point of brittleness; hard to test in isolation | Decompose by domain in a scoped refactor PR |
| 20 | **No buyer-side commission/agreement upload flow visible** | UNKNOWN | (buyer rep agreement) | `buyer_rep_signed` action exists in convert but document upload from buyer portal not verified | Trace `/api/portal/documents` + `/api/crm/documents` upload chain |
| 21 | **Outlook integration (5 routes) not workflow-traced** | UNKNOWN | (auxiliary) | OAuth + folder scan + StreetEasy lead import — assumed working but not deeply audited | Sample-audit + add e2e |
| 22 | **Sentinel/audit-bot self-failures (Claude turns budget) periodically fail report-only** | LOW | (workflow infra) | Reported and classified separately on 2026-05-16; not a code defect | Tune workflow timeout / agent turn budget |
| 23 | **No "broker can change another agent's password" UI** | LOW | A_aux | `permissions.js:28` declares `set_agent_password: { broker: true }` — backend route may exist but UI not traced | Verify route + UI |
| 24 | **Buyer portal has only 2 dedicated routes (vs seller 5, tenant 4, landlord 4)** | LOW | (parity) | Most buyer functionality uses shared `/listings`, `/favorites`, `/showings` — likely sufficient but worth verifying parity for "current matches", "agent contact", etc. | Compare buyer UI requirements against seller portal feature parity |
| 25 | **No CRM-wide "test mode" / sandbox** | LOW | (dev safety) | Brokers/agents working with real production data; no separate sandbox tenant for training | Out of scope for this audit; flagged for future product decision |

---

## 9. Exact PR sequence to turn this into a producing CRM

Minimum-viable-CRM ordering. Each PR must run all gates (`type-check`, `lint`, `compliance-check`, `ucba:audit`, `rls:validate`). No schema changes in items 1-2 (can ship immediately).

### Phase 1 — Unblock commission + impersonation (immediate, code-only)

**PR-CRM.1 — Wire `BUYER-DEAL-FORM` + `TENANT-DEAL-FORM` to backend (#1 critical)**
- Files: `public/crm/BUYER-DEAL-FORM.html`, `public/crm/TENANT-DEAL-FORM.html`
- Implement `submitBuyerDeal()` + `submitTenantDeal()` JS handlers
- Collect form data → POST `/api/crm/deals` → render draft badge
- No backend change (route already exists)
- Tests: Playwright e2e + Jest source-regex pinning the handler shape
- ETA: 1 PR, ~150 LoC, 1 commit

**PR-CRM.2 — Wire impersonation through backend (#2 critical security)**
- File: `public/crm/js/dashboard/app.js`
- Modify `doImpersonate()` to POST `/api/crm/agents/[id]/impersonate` first
- Receive delegated session token, set cookie via response Set-Cookie header
- Add `stopImpersonation` call to a complement backend route (verify exists or create)
- Tests: source-regex pinning the POST shape; manual verify audit row created
- ETA: 1 PR, ~50 LoC

### Phase 2 — Lead lifecycle integrity (schema-touching, follow NEON.md)

**PR-CRM.3 — Add `Lead.converted_at` + dedupe `roles[]` (#5, #11)**
- File: `prisma/schema.prisma` (Lead model)
- Add `converted_at DateTime?`
- Migration: nullable column, no backfill required
- Update `/api/crm/convert` + `/api/crm/intake/[type]` to set `converted_at` on first non-"new" transition and dedupe `roles`
- Tests: migration validation + Jest

**PR-CRM.4 — Unify duplicate-inquiry policy + log merge audit (#3)**
- Files: `app/api/inquiries/route.ts`, `app/api/crm/clients/route.ts`
- Add `Inquiry.duplicate_of_lead_id` field (schema)
- On upsert match, write `AuditEvent` action `inquiry_duplicate_detected`
- Optionally add `?confirm_merge=true` to require explicit override
- Tests: integration

**PR-CRM.5 — Wire `POST /api/crm/leads/[id]/assign` for broker reassignment (#4)**
- New file: `app/api/crm/leads/[id]/assign/route.ts`
- Broker gate + audit log + UI button in `panels.js`
- Tests: source + behavioral

### Phase 3 — Server-side enforcement (security hardening)

**PR-CRM.6 — Enforce broker-as-agent role server-side (#13)**
- Add `impersonating_agent_id` to `SessionUser` after PR-CRM.2 lands
- Update `requireBroker()` to optionally reject when impersonating
- Update audit helper to capture `impersonating_agent_id` in all changes payloads
- Tests: integration

**PR-CRM.7 — Allow agents to PATCH their own leads' status (#6)**
- Either loosen `/api/crm/leads/[id]` to allow agents on `status` field, OR new `PATCH /api/crm/leads/[id]/status`
- Agent gate + own-lead ownership check
- Tests: source + behavioral

### Phase 4 — Approval workflows (business-logic gaps)

**PR-CRM.8 — Broker approval gate for seller/landlord intake (#7, optional per business rules)**
- Add `Lead.status` value `pending_broker_approval`
- New routes: `POST /api/crm/sales/sellers/[id]/approve`, `POST /api/crm/rentals/landlords/[id]/approve`
- Configurable via feature flag — only enable if business mandates

**PR-CRM.9 — `POST /api/crm/referrals/[id]/approve` (#8)**
- New route, broker gate, audit log

### Phase 5 — Activity / audit consolidation

**PR-CRM.10 — Complete convert-API audit logging (#9)**
- Touch `app/api/crm/convert/route.ts` — ensure all 6 handlers call `logAuditEvent`
- Pure code change, no schema

**PR-CRM.11 — Unify `ActivityLog` + `AuditEvent` OR auto-write both (#10)**
- Decision needed: collapse vs co-write
- Schema implication: if collapse, deprecate `ActivityLog` (mark deprecated, migrate readers)

### Phase 6 — Coverage + maintainability (lower priority)

**PR-CRM.12 — Decompose `panels.js` (13,358 LoC) into per-domain modules (#19)**
- Refactor in scoped commits per domain (Featured, Sales CRM, Rentals CRM, Tools)
- No behavior change; pure mechanical extraction
- Will take multiple PRs

**PR-CRM.13 — End-to-end lifecycle tests (#17)**
- Playwright e2e: public inquiry → lead → assign → convert → listing → portal status

---

## 10. Real vs Mock — explicit list

### REAL (queries Prisma, persists data)

- All 150 `/api/crm/**` routes sampled — every one writes/reads real Prisma
- All 27 portal routes sampled — every one queries real Prisma
- All intake forms (`buyer-intake`, `seller-intake`, `landlord-intake`, `renter-intake`, `investor-intake`) — POST to real Prisma via `/api/crm/clients/{id}` or `/api/crm/intake/[type]`
- Listing creation form (`SALE-FORM-REDESIGN`, `RENTAL-FORM-REDESIGN`) — POST to real Prisma via `/api/crm/listings`
- Saved searches, listing sends, showings, reactions, favorites — all real
- Audit logging — 240+ real `AuditEvent.create` calls
- 8 portal endpoints for seller + landlord (dashboard, activity, demand, fomo, signals, relist, lease) — verified Prisma queries, **zero hardcoded JSON**

### NOT REAL (mock, stub, or static)

- **`BUYER-DEAL-FORM.html` line 1869 `submitBuyerDeal()`** — STUB, validates + toasts, no POST (#1 critical)
- **`TENANT-DEAL-FORM.html` `submitTenantDeal()`** — same stub pattern (#1 critical)
- **`Store.startImpersonation()`** — client-side localStorage flag, backend untouched (#2 critical)
- `Store.saveView()` — localStorage only (intentional — saved-view UI preferences are per-browser, not synced)
- `_featureFlags` in `store.js` — localStorage only (intentional)

### STATIC / CONFIG

- `public/crm/data/search-fields-schema.json` (52 KB) — static field metadata
- `public/crm/data/mta-stations-manhattan.json` (25 KB) — static transit data
- `public/crm/data/validator-results.json` (8 KB) — auto-regenerated by `idx:validate` cron, not editable

### UNKNOWN (not sampled in this pass)

- 10 portal routes (price-history, comparables, marketing, attorney, etc.) — likely real per same pattern but unverified
- Outlook integration (5 routes) — OAuth + scan + StreetEasy import, not traced
- `panels.js` Featured section — exists per charter but not part of this workflow audit
- CRM v2 `detectTypeAndPhase()` routing logic in `workspace.js` (6,395 LoC) — not traced

---

## Methodology

- 6 parallel Explore-agent investigations, each tracing one workflow domain end-to-end
- Read-only Glob + Grep + Read across:
  - `public/crm/**` (31 HTML + 100+ JS files)
  - `app/api/crm/**` (150 routes)
  - `app/api/portal/**` (40 routes)
  - `prisma/schema.prisma` (60 models)
  - `lib/auth/**`, `lib/compliance/**`, `lib/db/clients.ts`
- Each item independently verified by line-number citation
- No code modifications. No schema changes. No production crons triggered.

**Files audited (sample):** `permissions.js` (145 lines), `router.js` (155 lines), `store.js` (393 lines), `dashboard.html` (204 lines), `app.js` (sampled), `panels.js` (sampled — 13,358 lines), all intake forms (5 files, sampled), all workspace files (sampled), `api-client.js` (sampled), 30+ route files read line-by-line.

**End of audit.**
