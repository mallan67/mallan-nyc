# BUSINESS WORKFLOW GAPS — Mallan CRM

> **Part of the CRM architecture plan.** Entry point: [`README.md`](./README.md) · Plan: [`MASTER-PLAN.md`](./MASTER-PLAN.md)
> **Status:** PLANNING / docs-only. No code, schema, or implementation follows from this file.
> **Created:** 2026-05-30 · **Owner:** Maya Allan
>
> **Purpose.** The cross-cutting business workflows and policies that are **not** owned by a single build-branch but must exist for the brokerage to run end-to-end. Each entry: **what it is · why it matters · current state · the gap · where it lands (section/branch) · gate.** This is the register that keeps these from falling between the branch boundaries.
>
> **Evidence discipline (plan §0.6):** ✅ verified · ⚠️ referenced but unproven (needs live proof / flipped test) · ❌ confirmed absent. Nothing here is a "done" claim — these are gaps and intentions.

---

## 1. Seller acquisition pipeline
- **What/why:** Pre-client → prospect → pitch → exclusive signed → listed. The top of the money funnel (own inventory).
- **Current state:** `SellerLead` model + seller-prospecting concepts exist in prior specs ⚠️.
- **Gap:** No single canonical pipeline with **factual stage reasons** (plan §6.9.1); ACRIS/PLUTO/DOF enrichment is spec-only; SellerLead→Lead conversion on exclusive-signed not unified.
- **Lands in:** MASTER-PLAN §6 (Broker) + money loops; **section 6 (BROKER)**.
- **Gate:** schema (SellerLead extensions) = Maya + `NEON.md`.

## 2. Landlord renewal / relist / sell pipeline
- **What/why:** A landlord's unit cycles: rented → renewal → relist → possibly sell. Roles rotate, never close (plan role model).
- **Current state:** Rental listing intake exists ⚠️; lifecycle rotation is spec-only.
- **Gap:** No renewal/relist/sell state machine; no trigger when a lease nears expiry; no landlord→seller role transition surface.
- **Lands in:** money loops (§4) + Broker (§6); **sections 4 + 6**.
- **Gate:** schema (role/lifecycle) = Maya + `NEON.md`.

## 3. Showing workflow
- **What/why:** Request → (buyer-side: auto-populated Buyer Rep Agreement, plan §11.1) → schedule → conduct → feedback.
- **Current state:** `Showing` + `ShowingFeedback` models exist ✅; seller portal shows showings ✅.
- **Gap:** Incoming showing-request surface (agent inbox) not built; UCBA Art. II §16 buyer-rep auto-populate→sign→schedule flow not wired; open-house variant not separated.
- **Lands in:** PORTALS (§12) + AGENT/MONEY-LOOPS; **sections 3, 4, 5**.
- **Gate:** Buyer-Rep template = doc library (BROKER, schema-gated).

## 4. Offer / counteroffer workflow
- **What/why:** Offer → counter → accept/reject → contract. The conversion step before commission.
- **Current state:** `Offer` model exists (seller portal Offers tab reads a legacy path) ⚠️; legacy `ClientListingAction` vs `Offer` split.
- **Gap:** No counteroffer threading; offer→deal handoff not unified; legacy/`Offer` model duplication (plan §10.2 unify).
- **Lands in:** money loops (§4) + Broker; **section 4 / 6**.
- **Gate:** schema (offer/counter) = Maya + `NEON.md`.

## 5. Referral workflow
- **What/why:** Outbound referral (e.g., relocation) = 25% fee; inbound referrals tracked for ROI.
- **Current state:** Referral concept in role-lifecycle spec ⚠️.
- **Gap:** No referral record, fee tracking, or referral-partner directory; no link from "relocated" exit to a referral.
- **Lands in:** Broker (§6); **section 6**.
- **Gate:** schema = Maya + `NEON.md`.

## 6. Lead source attribution + ROI
- **What/why:** Which sources produce closings; spend vs. revenue per source.
- **Current state:** Source field on Lead exists ⚠️; verified-leads plugin feeds import (plan §6.9.2).
- **Gap:** No ROI roll-up (source → deals → commission); attribution not required/normalized at every entry point; no cost input.
- **Lands in:** Broker (§6) + leads lifecycle; **section 6**.
- **Gate:** none for read-model; any new field = Maya + `NEON.md`.

## 7. Communication log
- **What/why:** One timeline of every client touch (email, call, SMS, portal) — factual, two-sided.
- **Current state:** `AuditEvent` + `ActivityLog` both exist (two uncoordinated logs) ⚠️.
- **Gap:** **Dual-log split** must be unified to one canonical source (plan §10.2 / §6.9); no unified per-client timeline view; channel/device preference derivation spec-only.
- **Lands in:** Broker + leads lifecycle; **section 6** (+ §10.2 normalization).
- **Gate:** log unification touches many writers — plan as its own task; schema = Maya.

## 8. Duplicate / merge rules
- **What/why:** Same person/lead entering twice (email then phone, plugin import vs. web) must merge, never silently overwrite.
- **Current state:** Email-then-phone dedupe noted as a hard block on import (plan §6.9.2) ⚠️.
- **Gap:** No canonical merge policy/UI; address+unit dedup for inventory (T2) is a separate manual-review queue (plan §11.4); no audit of merges.
- **Lands in:** Broker/leads (§6) + T2 (§3.2 dedup); **sections 6, 7**.
- **Gate:** merge logic = Maya review (data-integrity sensitive).

## 9. Role / permission matrix
- **What/why:** Broker sees all; each agent sees only their own (searches/sends/shares/clients); clients see masked subsets.
- **Current state:** `requireAgentOrBroker` on routes ✅; per-agent row isolation flagged as a gap in the (superseded) audit ⚠️.
- **Gap:** No single documented matrix (role × resource × action); per-agent isolation not uniformly enforced; portal DTO tiers not centralized.
- **Lands in:** FIREWALL (boundaries) + Broker; **sections 2, 6**.
- **Gate:** authz changes = security-sensitive; run rebny-compliance + tests.

## 10. Broker impersonation backend fix
- **What/why:** Broker "act as agent" must be server-side + audited (not client-only).
- **Current state:** Impersonation is **client-side only → no audit trail** ⚠️ (per superseded audit).
- **Gap:** No backend impersonation with audit; actions taken "as agent" not attributable.
- **Lands in:** Broker (§6); **section 6**.
- **Gate:** authz + audit = Maya approval; security review required.

## 11. Export / download policy
- **What/why:** What can leave the system, by whom, in what format — and what is forbidden (T2/T3 never exportable to public; owner PII reveal-gated).
- **Current state:** No `/api/exports/*` route exists ✅ (syndication held; empty-config guard, plan §C holds).
- **Gap:** No written export policy (allowed fields per role, watermarking, audit on export); CSV/PDF show-sheet/comps export paths not policy-bound.
- **Lands in:** FIREWALL (boundaries) + Broker; **sections 2, 6**.
- **Gate:** any export route = Maya + compliance (REBNY display + Cotality data-use).

## 12. Retention / deletion policy
- **What/why:** Audit-retention windows, lead/PII deletion on request (NY SHIELD), TCPA consent provenance retention.
- **Current state:** Audit-event creation exists ⚠️; retention windows referenced in compliance index.
- **Gap:** No documented retention schedule per data class; no deletion/erasure workflow; no consent-record lifecycle.
- **Lands in:** Compliance/FIREWALL + Broker; **sections 2, 6**.
- **Gate:** compliance-canonical-index is source; changes = Maya + rebny-compliance.

## 13. Production rollout checklist
- **What/why:** The gate sequence before any section ships to production.
- **Current state:** Per-branch gates + plan §7.4 suite defined ✅; no single consolidated rollout checklist.
- **Gap:** No one-page "before prod" list (suite green, NEON manual-apply, live Cotality fallback verified, FARE render proven, compliance PASS, rollback plan).
- **Lands in:** this folder (ops) + each branch done-criteria; **all sections**.
- **Gate:** STOP for Maya on schema/`public/crm`/cron/env/T2/T3/force-push.

---

## How to use this register
- Each gap is **owned by a section/branch** above — work it there, under that branch's rules and journal.
- Nothing here is "done." Resolve a gap → cite the PR + a **live proof or flipped test** → then update its line.
- Compliance- or authz-touching gaps (7, 9, 10, 11, 12) require the **rebny-compliance skill** before any commit and Maya approval for schema/authz.

*End of gap register — 2026-05-30. Keep honest: gaps stay listed until proven closed.*
