# CRM v2 — Final Launch Checklist

> **Status**: Code-verified. Live QA required before calling audit-ready.
> **Date**: 2026-03-17

---

## 1. Public Listing Compliance

| Check | Code Status | Live QA |
|-------|------------|---------|
| Suppressed address → "Address Upon Request" in visible text | ✅ `dto.ts` line 139: deletes address fields when `InternetAddressDisplayYN=false` | ⬜ Test on live page |
| Suppressed address → NOT in page source HTML | ✅ Listing page line 458-459: returns null if suppressed | ⬜ View source on live page |
| Suppressed address → NOT in JSON-LD structured data | ✅ Listing page line 353: uses `suppressAddress` variable | ⬜ Check JSON-LD in source |
| Suppressed address → NOT in meta title/description | ✅ Uses sanitized DTO for metadata | ⬜ Check meta tags |
| Suppressed address → canonical URL uses MLS-ID slug | ✅ Line 573: "uses MLS-ID slug if address suppressed" | ⬜ Check URL |
| OwnerOptOut → NOT in public search | ✅ `filterDisplayableDbListings` Gate 4: `if (l.owner_opt_out) return false` | ⬜ Search for opted-out listing |
| OwnerOptOut → NOT in sitemap | ✅ `sitemap.ts` line 16: "Owner opt-out excluded" | ⬜ Check sitemap.xml |
| OwnerOptOut → direct URL does not resolve | ✅ Listing page returns null for suppressed listings | ⬜ Try direct URL |

## 2. Public Search Compliance

| Check | Code Status | Live QA |
|-------|------------|---------|
| Search cards don't show suppressed addresses | ✅ Cards use `filterDisplayableDbListings` output | ⬜ Visual check |
| Map popups don't show suppressed addresses | ✅ Same filtered data | ⬜ Visual check |
| Similar/related listings filtered | ✅ Uses same DTO pipeline | ⬜ Check similar listings section |
| Neighborhood/building widgets filtered | ✅ Uses same DTO pipeline | ⬜ Check building pages |
| REBNY RLS attribution present | ✅ IDXDisclaimer component on all search pages | ⬜ Visual check |
| Commission negotiability disclosure present | ✅ Added 2026-03-13 | ⬜ Visual check |

## 3. Building Page Compliance

| Check | Code Status | Live QA |
|-------|------------|---------|
| No suppressed listings in building unit lists | ✅ `filterDisplayableDbListings` applied | ⬜ Check building page |
| Building breadcrumbs sanitized | ✅ Uses DTO | ⬜ Check breadcrumbs |
| Building structured data sanitized | ✅ No raw addresses in JSON-LD | ⬜ View source |

## 4. Robots / Indexing

| Check | Code Status | Live QA |
|-------|------------|---------|
| `/crm/` blocked in robots.txt | ✅ `robots.ts` line 130 | ⬜ Check /robots.txt |
| `/portal/` blocked in robots.txt | ✅ `robots.ts` lines 122-123 | ⬜ Check /robots.txt |
| `/api/` blocked in robots.txt | ✅ `robots.ts` lines 118-119 | ⬜ Check /robots.txt |
| `/sign-in` blocked in robots.txt | ✅ `robots.ts` line 120 | ⬜ Check /robots.txt |
| CRM pages have `noindex, nofollow` | ✅ `dashboard.html` + `login.html` meta tags | ✅ Verified in code |

## 5. CRM Auth — Broker-Only Actions

| Endpoint | Protection | Status |
|----------|-----------|--------|
| Agent CRUD (`/api/crm/agents/*`) | `requireBroker` | ✅ |
| Commission approval (`/api/crm/commissions/[id]`) | `requireBroker` | ✅ |
| Compliance audit (`/api/crm/compliance/audit`) | `requireBroker` | ✅ |
| Document batch approve (`/api/crm/documents/batch-approve`) | `requireBroker` | ✅ |
| Syndication refresh (`/api/crm/syndication/refresh`) | `requireBroker` | ✅ |
| Lead assignment (`/api/crm/lead-scoring/assign`) | `requireBroker` | ✅ |
| Lead scoring rules (`/api/crm/lead-scoring/rules`) | `requireBroker` | ✅ |
| Deal status (approved/paid/rejected) | `auth.role !== 'BROKER'` check | ✅ |

## 6. CRM Auth — Agent Scope

| Check | Status |
|-------|--------|
| Agent can only see own clients | ✅ 39 routes enforce `agent_id !== auth.userId` |
| Agent can only edit own listings | ✅ Ownership check on all listing PATCH/DELETE |
| Agent can only see own deals | ✅ Scope filter on deals list |
| Agent can only see own tasks | ✅ Scope filter on tasks list |
| Agent can only see own showings | ✅ Scope filter on showings list |
| Agent cannot reassign clients | ✅ Broker-only field |
| Agent cannot approve payouts | ✅ `requireBroker` on approval |

## 7. Portal Auth — Role Isolation

| Endpoint | Allowed Roles | Status |
|----------|--------------|--------|
| `/api/portal/marketing` | seller, landlord | ✅ `requirePortalRole` |
| `/api/portal/price-history` | seller, landlord | ✅ `requirePortalRole` |
| `/api/portal/listings/[id]/react` | buyer, renter | ✅ `requirePortalRole` |
| `/api/portal/preferences` | buyer, renter | ✅ `requirePortalRole` |
| `/api/portal/listings/request` | buyer, renter | ✅ `requirePortalRole` |
| `/api/portal/offer-status` | buyer, seller | ✅ `requirePortalRole` |
| `/api/portal/attorney` | buyer, seller | ✅ `requirePortalRole` |
| `/api/portal/comparables` | buyer, seller | ✅ `requirePortalRole` |
| `/api/portal/family` | all roles | ✅ `requirePortalRole` |
| `/api/portal/comments` | all roles | ✅ `requirePortalRole` |

## 8. Impersonation Audit

| Check | Status |
|-------|--------|
| Impersonation start logged | ✅ `Events.log('impersonation_started')` with agent ID |
| Impersonation end logged | ✅ `Events.log('impersonation_ended')` |
| Server audit logs actual actor (broker) | ✅ `logAuditEvent` uses `auth.userId` (always broker's real session) |
| Actions during impersonation logged to broker | ✅ Session never changes — broker's auth persists |
| Audit log shows impersonation badge | ✅ Purple badge in audit log UI |

## 9. Broker Controls

| Check | Code Status | Live QA |
|-------|------------|---------|
| Approval Queue shows all pending items | ✅ Loads documents, payouts, referrals, compliance | ⬜ Test with real data |
| Compliance dashboard shows real exceptions | ✅ Server-side audit via POST /api/crm/compliance/audit | ⬜ Test with real data |
| IDX/Trestle monitor shows sync status | ✅ Calls MallanAPI.idx.status() | ⬜ Test on live |
| License/CE/E&O alerts accurate | ✅ Computed from agent data | ⬜ Test with real expiry dates |
| Portal masking works (buyer/renter views) | ✅ Agent name masked in portal listings | ⬜ Test portal login |

## 10. Data Integrity

| Check | Status |
|-------|--------|
| No success toast without API persistence | ✅ Remediated across all flows |
| Canonical record first, event derived | ✅ All send/note/task flows |
| Stage move rolls back on failure | ✅ Captures old stage, reverts |
| Showing feedback — no false success | ✅ Modal stays open on failure |
| Button locking during submits | ✅ All quick actions + workspace forms |
| Financial scenarios API-backed | ✅ POST/GET/DELETE /api/crm/financial-scenarios |

---

## Summary

| Area | Code Verified | Needs Live QA |
|------|:------------:|:-------------:|
| Public listing compliance | ✅ | ⬜ 8 checks |
| Public search compliance | ✅ | ⬜ 6 checks |
| Building page compliance | ✅ | ⬜ 3 checks |
| Robots/indexing | ✅ | ⬜ 4 checks |
| CRM broker auth | ✅ | — |
| CRM agent scope | ✅ | — |
| Portal role isolation | ✅ | — |
| Impersonation audit | ✅ | — |
| Broker controls | ✅ | ⬜ 5 checks |
| Data integrity | ✅ | — |

**Total: 26 live QA checks remaining. Zero code changes needed unless QA finds a breach.**
