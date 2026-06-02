# FORM WORKFLOW TRUTH TABLE — Mallan CRM intake & deal forms

> **Part of the CRM architecture plan.** Entry point: [`README.md`](./README.md) · Plan: [`MASTER-PLAN.md`](./MASTER-PLAN.md)
> **Status:** PLANNING / docs-only. No code, schema, or implementation follows from this file.
> **Created:** 2026-05-30 · **Owner:** Maya Allan
>
> **Purpose.** One row per form, tracing the full path: **UI file → submit handler → backend route → DB model → audit event → broker-approval gate → compliance checks → known gap → current status → next PR/branch.** This is the factual map an agent reads before touching any form so it never re-discovers the wiring from scratch.
>
> **Evidence discipline (plan §0.6).** ✅ = verified by source-read of the cited file. ⚠️ = referenced in source but the end-to-end behavior (submit → persist → audit) is **not yet proven by a live URL probe or a flipped test** — treat as *needs proof* before any "works" claim. ❌ = confirmed absent.

---

## 1. SALE-FORM-REDESIGN — list a property for sale (seller/exclusive intake)

| Field | Value |
|---|---|
| **UI file** | `public/crm/SALE-FORM-REDESIGN.html` ✅ |
| **Submit handler** | `MallanAPI.listings.create` / `.update` / `.updateStatus` (defined in `public/crm/js/core/api-client.js`) ✅ |
| **Backend route** | `app/api/crm/listings/route.ts` (POST create), `app/api/crm/listings/[id]/route.ts` (PATCH update), `app/api/crm/listings/[id]/status/route.ts` (status) ✅ |
| **Supporting routes** | `/api/buildings/search`, `/api/crm/neighborhoods/cotality`, `/api/auth/me` ✅ |
| **DB model/table** | `Listing` (Mallan-owned / exclusive rows) |
| **Audit event** | `logAuditEvent` in the listings route ⚠️ (confirm action/entity strings on create) |
| **Broker approval gate** | Exclusive publish/display gating exists in status flow; **confirm** broker-of-record gate on first publish ⚠️ |
| **Compliance checks** | REBNY attribution, 6 distribution gates, Fair Housing scan on free-text, NY DOS §175.25 — **must run via rebny-compliance skill before commit** ⚠️ |
| **Known gap** | Seller is not auto-linked as `owner_client_id` on create (owner-link flow is a PORTALS-branch item §6.2 / §12.4); commission terms capture vs. agreement source not yet unified |
| **Current status** | Route + handler exist; **end-to-end submit→persist→audit needs a live proof** before any "works" claim |
| **Next PR/branch** | STABILIZE (`fix/sale-form-commission-history-building`) for load/stability; owner-link in PORTALS (`feat/client-portals`) |

---

## 2. RENTAL-FORM-REDESIGN — list a property for rent (landlord/exclusive intake)

| Field | Value |
|---|---|
| **UI file** | `public/crm/RENTAL-FORM-REDESIGN.html` ✅ |
| **Submit handler** | `MallanAPI.listings.update` (and create path) via `public/crm/js/core/api-client.js` ✅ |
| **Backend route** | `app/api/crm/listings/route.ts` / `app/api/crm/listings/[id]/route.ts` ✅ |
| **Supporting routes** | `/api/buildings/search`, `/api/auth/me` ✅ |
| **DB model/table** | `Listing` (rental rows) |
| **Audit event** | `logAuditEvent` in listings route ⚠️ (confirm on rental create/update) |
| **Broker approval gate** | Same exclusive publish gating as sale; **confirm** ⚠️ |
| **Compliance checks** | **FARE Act** tenant-fee disclosure (NYC rentals — legal exposure $1,800–$2,000/violation), REBNY attribution, Fair Housing, 6 gates — via rebny-compliance skill ⚠️ |
| **Known gap** | FARE Act disclosure render must be proven on production rentals (see launch-readiness audit A4 — source-grep passed but conditional did not render); owner/landlord link same gap as sale |
| **Current status** | Route + handler exist; **FARE render + submit→persist need live proof** |
| **Next PR/branch** | STABILIZE for stability; FARE proof tracked under FIREWALL pre-send / compliance (`feat/tier-firewall-tests`) |

---

## 3. BUYER-DEAL-FORM — record a buyer-side deal

| Field | Value |
|---|---|
| **UI file** | `public/crm/BUYER-DEAL-FORM.html` ✅ |
| **Submit handler** | `MallanAPI.deals.create` (via `public/crm/js/core/api-client.js`) ✅ |
| **Backend route** | `app/api/crm/deals/route.ts` — `POST` → `createDeal(...)`, returns `201 {id,status}` ✅ |
| **Supporting routes** | `/api/schemas/deal` (schema), `/api/idx/search` (listing lookup), `/api/auth/me` ✅ |
| **DB model/table** | `Deal` |
| **Audit event** | ✅ `logAuditEvent("create","deal",<id>,…)` present in `app/api/crm/deals/route.ts` |
| **Broker approval gate** | Route uses `requireAgentOrBroker` ✅; **commission-confirmation gate (post-NAR) not yet present** — `CommissionConfirmation` is a held BROKER-branch schema item |
| **Compliance checks** | Buyer-rep agreement is the factual commission source (UCBA Art. II §16, co-broker side — see plan §11.1); TCPA on outbound; Fair Housing on notes ⚠️ |
| **Known gap** | Prior audit flagged the deal form as a **client-side stub** (validate + green toast, no POST), PR #146 staged to wire it. Route now exists and persists — **re-verify the form's submit actually calls `deals.create` end-to-end** (live proof) rather than assuming either state |
| **Current status** | Backend persists ✅; **form→route submission needs a live proof** to close the #146 question |
| **Next PR/branch** | MONEY-LOOPS (`feat/money-loops-send`) for deal/send wiring; commission confirmation in BROKER (`feat/broker-command-center`, schema = Maya approval) |

---

## 4. TENANT-DEAL-FORM — record a tenant-side deal

| Field | Value |
|---|---|
| **UI file** | `public/crm/TENANT-DEAL-FORM.html` ✅ |
| **Submit handler** | `MallanAPI.deals.create` / `.update` (via `public/crm/js/core/api-client.js`) ✅ |
| **Backend route** | `app/api/crm/deals/route.ts` (POST create) + `app/api/crm/deals/[id]/route.ts` (update) ✅ |
| **Supporting routes** | `/api/auth/me` ✅ |
| **DB model/table** | `Deal` (tenant-side) |
| **Audit event** | ✅ `logAuditEvent("create","deal",…)` in deals route |
| **Broker approval gate** | `requireAgentOrBroker` ✅; commission confirmation held (BROKER schema) |
| **Compliance checks** | FARE Act (rental), TCPA, Fair Housing on notes — via rebny-compliance skill ⚠️ |
| **Known gap** | Same stub-vs-wired question as the buyer deal form (#146); rental-specific compliance (FARE) on the deal record path unverified |
| **Current status** | Backend persists ✅; **form→route submission needs a live proof** |
| **Next PR/branch** | MONEY-LOOPS (`feat/money-loops-send`); commission confirmation in BROKER |

---

## Cross-form notes

- **`MallanAPI` client** lives in `public/crm/js/core/api-client.js` — the single place the four forms reach the backend. Any route/path change updates here once (canonical, no duplication).
- **`public/crm/**` is Maya-approval-gated** (plan §F / CLAUDE.md). No edits to these forms or `api-client.js` without approval.
- **Proof-first close-out:** every ⚠️ in this table must be resolved by a **live URL probe or a flipped test in the same PR** before the related row is marked ✅ "works." Source-grep alone is not sufficient (plan §0.6).
- **Compliance gate:** the rebny-compliance skill MUST be invoked before any commit touching these forms or routes.

*End of truth table — 2026-05-30. Update each row's status as PRs land; keep evidence markers honest.*
