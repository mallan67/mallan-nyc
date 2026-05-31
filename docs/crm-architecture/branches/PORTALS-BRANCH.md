# PORTALS BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`).
> **Git branch:** `feat/client-portals` · **Journal:** `docs/crm-architecture/journals/05-portals.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **PORTALS agent**. You work ONLY on branch `feat/client-portals` and ONLY the files this plan owns (§Owned files). You do NOT improvise, expand scope, refactor unrelated code, or touch another branch's files.

0. **RESUME FIRST.** Read `docs/crm-architecture/journals/05-portals.state.json` + tail `05-portals.journal.jsonl`. Resume from the step AFTER `last_completed_step`. Never redo completed work. After every action: append one line to the journal, then overwrite state. On a blocker: set `status:"blocked"`, record it, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** If a field, interface, rule, or value is unclear/undefined/missing — STOP and ask Maya. Read the actual file before changing it. Do not guess a Cotality field, a Prisma column, or a UCBA rule.
2. **ALWAYS COTALITY LIVE PULL.** All listing data is live from Cotality; the DB is a cache only; live-validate before any open/send/share; never serve stale as fresh. Live data still passes the 6 distribution gates + the **Cotality Live Connect** mapper + status-normalizer + terminal-status guard (spec §3.1).
3. **REBNY COMPLIANCE IS IN-REPO.** Primary source: `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + `compliance/UCBA-2026.md` + the `rebny-compliance` skill. Invoke the skill before any compliance-touching commit. Fail-closed on any ambiguity.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD: failing test first → make it pass. Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **NO SIGNALING PAGES.** Every portal surface = real data source + factual outcome. Honest empty-states ("no showings yet"), never a zero that reads as broken. No vanity scores. Removing any existing surface = flag-and-confirm with Maya.
6. **BUYER PII NEVER REACHES A SELLER/LANDLORD.** Sellers see aggregate counts only (traffic/views, # email inquiries, # showing requests) — never a buyer's name/email/phone. Comparative building traffic = aggregate benchmark only, own-surface data only, honest empty-state. (spec §12.2)
7. **TERMINOLOGY = COTALITY.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, fields, and UI. Do not reintroduce retired legacy product names (master plan §0.11). Only REBNY keeps its name.
8. **STAY IN LANE.** Owned files only (§Owned files). Schema/migration/cron/env/`public/crm/**` changes STOP for Maya approval + `NEON.md`.

---

**Goal:** Give a real seller a portal to track his own exclusive listing (the seller-portal pilot — runs at Phase 3, only after SEARCH + FIREWALL), then build out the fuller seller-portal content — on the already-existing 7-tab seller portal.

**Architecture:** The seller portal (`app/portal/seller/page.tsx`) already exists with auth, owner-scoping for showings/offers, and compliance-clean DTOs. This branch (a) closes the three pilot blockers, (b) verifies data, (c) does a proof-first dry-run, then (d) adds new content (anonymized engagement counts, same-building comparative traffic, DOB building issues, deal-readiness tracker). Spec: §12.

**Tech Stack:** Next.js App Router, Prisma/Neon, existing portal-token auth, `lib/compliance/dto.ts`.

## Owned files

- Modify: `app/api/portal/seller/fomo/route.ts`, `app/api/portal/seller/demand/route.ts` (owner-scoping fix)
- Create: `app/api/crm/listings/[id]/owner/route.ts` (owner-link API) + CRM UI hook
- Modify: `app/api/crm/clients/[id]/invite/route.ts` or `app/api/auth/invite/route.ts` (seller-must-exist / link)
- Create/Modify: `app/portal/seller/**` (new surfaces — later tasks)
- Test: `app/api/portal/**/__tests__/**`, `lib/**/__tests__/**`

## Dependencies (HARD — do not start before these)

1. **STABILIZE (#295) landed.**
2. **SEARCH** branch interface contract published (field authority + search core) — the pilot's data trust decisions rely on it.
3. **FIREWALL** baseline green (reverse-pin + pre-send boundary tests) — before any portal exposes anything.
4. (Per work order, scheduled after **AGENT + MONEY-LOOPS**.)

No schema change for the pilot itself (uses existing `Listing.owner_client_id`). Later content tasks (deal-readiness model, DOB) require schema → Maya approval + `NEON.md`.

---

## ⛔ START GATE (CORRECTED 2026-05-30)

**This branch does NOT start right after STABILIZE.** It starts **only after** (a) the **SEARCH** branch has published its field-authority + search-core interface contract, AND (b) the **FIREWALL** branch's reverse-pin + pre-send boundary tests are green. Per the corrected work order this runs at **Phase 3** (after AGENT + MONEY-LOOPS). Step 1 of the pilot below is to confirm those dependencies are satisfied; if they are not, STOP.

## SELLER-PORTAL PILOT (narrow — existing seller portal, not a rebuild)

### Task 1: Tighten FOMO route to owner-scoping (security)

**Files:**
- Modify: `app/api/portal/seller/fomo/route.ts`
- Test: `app/api/portal/seller/__tests__/fomo-scoping.test.ts`

- [ ] **Step 1: Read the actual route first** (NEVER ASSUME). Open `app/api/portal/seller/fomo/route.ts`; locate the listing-lookup `where` clause (currently scopes via `agent.leads.some`). Note the exact current code in the journal.

- [ ] **Step 2: Write the failing test** — a seller must NOT see FOMO for a listing they don't own.

```ts
// fomo-scoping.test.ts
it("returns 403/empty when the listing's owner_client_id !== session lead", async () => {
  // seed: listingA owner_client_id = leadA; session = leadB (same agent)
  const res = await GET(reqAs(leadB, { listingId: listingA.id }));
  expect([403, 200]).toContain(res.status);
  if (res.status === 200) expect(await res.json()).toEqual(expect.objectContaining({ items: [] }));
});
it("returns data when owner_client_id === session lead", async () => {
  const res = await GET(reqAs(leadA, { listingId: listingA.id }));
  expect(res.status).toBe(200);
});
```

- [ ] **Step 3: Run the test — expect FAIL** (`npm test -- fomo-scoping`). Current agent-scoping lets leadB through.

- [ ] **Step 4: Change the `where` clause** from the agent-relationship form to owner-scoping: the listing lookup must require `owner_client_id: auth.userId` (fail-closed: no match ⇒ empty/403). Mirror the exact pattern already used in `app/api/portal/showings/route.ts` and `app/api/portal/offers/route.ts` (read those for the canonical owner-scoped `where`).

- [ ] **Step 5: Run the test — expect PASS.**

- [ ] **Step 6: Health test + commit.** Run the full suite (rules §4). Then:
```bash
git add app/api/portal/seller/fomo/route.ts app/api/portal/seller/__tests__/fomo-scoping.test.ts
git commit -m "fix(portal): owner-scope seller FOMO route (was agent-scoped) — spec §12.4"
```

### Task 2: Tighten DEMAND route to owner-scoping

**Files:** Modify `app/api/portal/seller/demand/route.ts` · Test `app/api/portal/seller/__tests__/demand-scoping.test.ts`

- [ ] **Step 1:** Read `app/api/portal/seller/demand/route.ts`; note the current `where`.
- [ ] **Step 2:** Write the same failing scoping test as Task 1 (leadB must not see leadA's demand).
- [ ] **Step 3:** Run — expect FAIL.
- [ ] **Step 4:** Replace the agent-relationship `where` with `owner_client_id: auth.userId` (canonical pattern from `app/api/portal/offers/route.ts`).
- [ ] **Step 5:** Run — expect PASS.
- [ ] **Step 6:** Health test + commit (`fix(portal): owner-scope seller demand route — spec §12.4`).

### Task 3: Owner-link API (link a listing to its seller)

**Files:**
- Create: `app/api/crm/listings/[id]/owner/route.ts`
- Test: `app/api/crm/listings/[id]/__tests__/owner.test.ts`

- [ ] **Step 1: Write the failing test** — broker/agent links a listing to a seller lead.

```ts
it("sets Listing.owner_client_id and audits it", async () => {
  const res = await POST(reqAsAgent(agentA, { params: { id: listing.id }, body: { ownerLeadId: seller.id } }));
  expect(res.status).toBe(200);
  const row = await prisma.listing.findUnique({ where: { id: listing.id } });
  expect(row.owner_client_id).toBe(seller.id);
  // audit event written
  expect(await prisma.auditEvent.findFirst({ where: { entity_id: String(listing.id), action: "listing_owner_linked" } })).toBeTruthy();
});
it("rejects when caller is not the listing agent or broker", async () => {
  const res = await POST(reqAsAgent(otherAgent, { params: { id: listing.id }, body: { ownerLeadId: seller.id } }));
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run — expect FAIL** (route doesn't exist).

- [ ] **Step 3: Implement `POST /api/crm/listings/[id]/owner`** — `requireAgentOrBroker`; verify the caller owns the listing (`agent_id === auth.userId` or broker); verify `ownerLeadId` is a real Lead with `portal_role`/role seller; set `Listing.owner_client_id = ownerLeadId`; write `AuditEvent` `action:"listing_owner_linked"`. Follow the existing handler shape in `app/api/crm/listings/[id]/route.ts` (read it first — NEVER ASSUME the helper names).

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Health test + commit** (`feat(crm): link listing to seller owner_client_id + audit — spec §12.4`).

### Task 4: Guard the invite — seller Lead must exist (no silent fail)

**Files:** Modify the seller-invite path (`app/api/auth/invite/route.ts`) · Test alongside.

- [ ] **Step 1:** Read the invite route; confirm it 404s when the Lead doesn't exist (per the audit it does).
- [ ] **Step 2:** Write a failing test asserting a **clear 400/404 with an actionable message** ("create the seller as a Lead first") rather than a generic failure.
- [ ] **Step 3:** Run — expect FAIL (or confirm current message is unhelpful).
- [ ] **Step 4:** Return a clear error directing the agent to create the Lead first. (Do NOT auto-create the Lead in the pilot — keep it minimal; auto-create is a later task.)
- [ ] **Step 5:** Health test + commit (`fix(auth): clearer seller-invite error when lead missing — spec §12.4`).

### Task 5: Pilot dry-run (proof-first — NO real seller yet)

- [ ] **Step 1:** Create a **test** seller Lead (your own test email), create a sandbox listing, link it via Task 3's API, invite the test seller.
- [ ] **Step 2:** Log in as the test seller on an immutable preview URL. Capture rendered evidence (screenshot/log) that the 7 tabs load and show the listing.
- [ ] **Step 3:** **Verify the data crons** populated views/demand/momentum/market for that listing's building — if empty, record which cron/cache is missing (`SocialProofCache`, `MarketSnapshot`, `ListingMomentum`) and surface to Maya BEFORE the real seller is invited. Honest empty-state must show, not a broken zero.
- [ ] **Step 4:** Journal the dry-run result. Do NOT invite the real seller until the dry-run renders correctly and Maya confirms.

### Task 6: Real-seller go-live (Maya-gated)

- [ ] **Step 1:** With Maya's confirmation: ensure the real exclusive listing exists, the seller exists as a Lead, link via Task 3, invite.
- [ ] **Step 2:** Verify (live URL probe) the real seller sees ONLY his listing, correct data, no buyer PII. Journal + report.

---

## PHASE 1 — FULLER SELLER-PORTAL CONTENT (after pilot validates; several need schema → Maya approval)

Task outline (each expanded to bite-sized TDD steps at activation, against the then-existing interfaces — NEVER ASSUME upstream):

- **T7 Anonymized engagement counts** — surface traffic (views), # email inquiries (`Inquiry(listing_id)` count), # showing requests on the seller dashboard. Counts only; no buyer PII (rules §6). Test: response contains counts, never buyer identity fields.
- **T8 Same-building comps + comparative traffic (price indicator)** — extend `/api/portal/comparables` to scope to the building + return an aggregate traffic benchmark (own-surface data only, honest empty-state). Test: no named competitor unit numbers; empty-state when no Mallan data. (spec §12.2)
- **T9 Showing-request + open-house surfaces** — surface incoming showing requests + OH feedback to the seller (anonymized). 
- **T10 DOB building issues** — pull NYC DOB violations/permits (public records) for the building; display read-only. New data source — Maya approval for any cron/ETL.
- **T11 Deal-readiness tracker** (schema → Maya approval) — new model, property-type-aware (co-op: stock+proprietary lease, offering plan; condo/townhouse: title; all: attorney, condition report, mortgage payoff, accountant, closing costs, net proceeds). Ties to doc library (Broker branch §6.6).

## Done criteria (this branch)

- Pilot: real seller logs in, sees only his listing, correct data, no buyer PII; all scoping owner-based; full health suite green; journaled.
- Phase 1 content lands per-task, each TDD + health-green + compliance-checked.
- Every portal surface passes a **design-skill review** (`frontend-design` + `ui-ux-pro-max`, spec §13) — clear tabs, obvious workflow, honest empty-states, one design system.

## Self-review

Spec §12 coverage: engagement counts ✓ (T7), comps + comparative traffic ✓ (T8), open-house/showing-request ✓ (T9), offers ✓ (existing), DOB ✓ (T10), deal-readiness ✓ (T11), pilot ✓. Start gate = SEARCH + FIREWALL ready. No buyer-PII path. No placeholders in the pilot tasks. Owner-scoping types match `app/api/portal/offers/route.ts` pattern.
