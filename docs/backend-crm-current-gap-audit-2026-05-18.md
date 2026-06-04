# Backend / CRM Current Gap Audit — 2026-05-18

> **Status:** REPORT-ONLY · no code patched · no PR opened · no env/Neon/migration/cron/IDX/projection/reconciliation/CRM/R2/Sentinel changes.
> **Scope:** Backend & CRM items that can move forward **while IDX / projection / reconciliation are on hold** (PR #147 soak in progress, PR #148 held, PR 5B `NOT_STARTED`).
> **Truth source:** current `main` (HEAD `69c4ac40`). Older session/plan docs are treated as **evidence**, not authority.
> **Method:** parallel `Explore` sweeps (281 API routes + 8 CRM panels + 4 portal types + 3 form families + open-PR review) + targeted file reads + `gh pr view` of `#146 #62 #148 #139 #124 #153`. Probe scripts disposable, not committed.
> **Hold context preserved:** no reconciliation, no merge of #148, no PR 5B start, no IDX patches, no manual cron, no env vars, no Neon, no migrations, no cron, no Sentinel/bots, no edits to `agents/skills/workflows`, no CRM patches.

---

## Classification key

Every finding below is classified A–E. Maya's worklist for safe near-term work is the union of Class **A** items.

| Class | Meaning | Move now? |
|---|---|---|
| **A** | Safe small fix now. No schema, no IDX, no projection, no migration, no cron. Pure code + tests. | ✅ Yes |
| **B** | Needs schema/migration. Hold until NEON discipline window. | ⏸ Hold |
| **C** | Touches IDX / projection / reconciliation. Hold until PR 5B unblock. | ⏸ Hold |
| **D** | Broad CRM scope / Sentinel / agents / workflows. Needs Maya approval before any PR. | ⏸ Hold |
| **E** | Stale doc / no longer true on current `main`. Documentation cleanup only. | ✅ Note |

---

## Executive summary

| Lens | Count |
|---|---:|
| API route files audited | **281** (135 CRM · 41 portal · 19 auth · 24 cron · 8 lead-capture · 54 misc) |
| Routes with `requireAuth`/`requireRole` | 223 |
| Routes with `CRON_SECRET` + `timingSafeEqual` | 24 |
| Routes intentionally public (with token-as-auth or rate-limit only) | 34 |
| Class A (safe-now) findings | **9** |
| Class B (schema/migration) findings | **6** |
| Class C (IDX/projection coupled) findings | **3** |
| Class D (broad/Sentinel/agents) findings | **4** |
| Class E (stale doc / not true) findings | **5** |

**Headline:** The biggest movable lever in Class A right now is **rate-limiting portal write routes** (offers, showings, comments, signals). The biggest near-term **Class B blocker** is the SMS password-reset migration (PR #62, open 22 days). The most surprising find is a **silent-success stub** that already has a fix waiting in PR #146 (deal-form header `Submit` showed green toast without calling backend) — that PR is review-ready.

---

## Open PRs touching CRM / backend (current state)

| PR # | Title | Branch | Age | Class | Status |
|---:|---|---|---:|:---:|---|
| **146** | `fix(crm): wire BUYER + TENANT deal-form header submit to /api/crm/deals (PR-CRM.1)` | `fix/crm-deal-form-submit-wiring` | 2 d | **A** | Ready for review · +832/−2 across 4 files (incl. `docs/crm-workflow-proof-audit-2026-05-16.md`) · 27/27 tests pass · 93/93 compliance · NO schema/cron/IDX/projection touch |
| **62** | `feat(auth): SMS-based password reset (Twilio, no email, no new vendor)` | `feat/sms-password-reset` | **22 d** | **B** | Has new Prisma model + migration · needs Twilio env confirm · awaiting Maya's pre-merge runbook steps (migrate deploy + `audit-missing-phones.ts`) |
| **148** | `feat(ops): one-shot projection drift reconciliation (dry-run validated)` | `feat/reconcile-projection-idx-display` | 1 d | **C** | Held per Maya 2026-05-18; 2nd soak cycle pending |
| **139** | `ops(emergency): disable idx-sync cron schedule (Path C step 1)` | `emergency/disable-idx-sync-cron` | 3 d | **C** | Out of scope this audit |
| **124** | `ci(sentinel): add Mallan Search Cartographer + memory/site-map/ knowledge files` | `chore/sentinel-search-cartographer` | 3 d | **D** | Held — no Sentinel implementation work |
| **153** | `docs: clear remaining §C.4 contradictions in Neon launch audit (Codex feedback on PR #152)` | `docs/fix-codex-c4-contradictions` | 1 d | E (already shipped) | Already merged as PR #152's follow-up #153 stayed open from earlier today — verify state at next session |

---

## Prior audit docs — staleness verdicts

| Doc | Date | Verdict on current `main` |
|---|---|---|
| `compliance/CRM-AND-MESSAGING-COMPLIANCE.md` | undated | **CURRENT-ENOUGH (E)** — TCPA/FARE/Fair Housing patterns still match `lib/compliance/` and `app/api/inquiries/route.ts`. Re-stamp date and link from `CLAUDE.md`. |
| `compliance/AUDIT-LOGGING-AND-EVIDENCE.md` | undated | **CURRENT-ENOUGH (E)** — NY SHIELD Act + audit event patterns still match `prisma/schema.prisma` `AuditEvent`. Re-stamp. |
| `docs/crm-workflow-proof-audit-2026-05-16.md` | 2026-05-16 | **CURRENT but not on `main` yet** — lives on PR #146 branch. Its §8 item #1 is the very stub-then-toast finding PR #146 fixes. |

---

## Findings — by category

### 1. CRM API routes

#### 1.1 — Buyer + Tenant deal-form header `Submit` is a silent-success stub on current main

| Field | Value |
|---|---|
| Path | `public/crm/BUYER-DEAL-FORM.html` ~line 1869 (`submitBuyerDeal()`) · `public/crm/TENANT-DEAL-FORM.html` ~line 1380 (`submitTenantDeal()`) |
| Current behavior | Runs client-side validation, shows green *"submitted successfully"* toast, **does not POST anywhere.** No row in `deals` table. |
| Business impact | Deals appear saved to the agent but never reach broker queue, never appear in commission tracking, never get audited. **Top-of-funnel data loss.** |
| Risk | Compliance/auditing: every "submit" the agent does should be `logAuditEvent("create","deal",…)`. Currently zero audit trail. |
| Backend completeness | The `POST /api/crm/deals` route, `Deal` Prisma model, `createDealSchema`, `MallanAPI.deals.create()` all exist and work. Only the header `onclick` is missing wiring. |
| Recommended PR size | **XS** — PR #146 already does it: +832 / −2 across 4 files, 27/27 tests pass. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes** — PR #146 already targets `main`. Pure HTML + tests. No CRM patch required from this audit; PR #146 ships it. |

#### 1.2 — Outlook import is N+1 client.create + N optional client.update — no bulk endpoint

| Field | Value |
|---|---|
| Path | `public/crm/js/dashboard/panels.js:2989-3061` `_importSelectedOutlook()` |
| Current behavior | For each selected contact: `MallanAPI.clients.create(person.create)` then optional `MallanAPI.clients.update(id, { notes })`. Sequential `.then()` chain. 409 = silently `skipped++`. |
| Backend route used | `POST /api/crm/clients` + `PATCH /api/crm/clients/[id]` — both exist, both auth-gated (`requireAgentOrBroker`). |
| Business impact | A 50-contact StreetEasy folder = ~100 sequential HTTP round-trips. Browser may stall for tens of seconds. Per-row 409 (duplicate email) is silent — agent sees "Imported X, skipped Y" but not WHICH rows or why. |
| Risk | UX regression on large folders; potentially partial imports if browser tab closes mid-chain. |
| Recommended PR size | **S** — add `POST /api/crm/clients/bulk-import` that takes an array, returns per-row `{ created, skipped, error }` summary, fans out within one Prisma transaction. Frontend swap is ~30 lines. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes** — pure CRM, no IDX / projection / migration. Reuses existing `Lead`/`Client` model. |

#### 1.3 — Broker approval queue: `_approvePayout` / `_rejectPayout` / `_approveDoc` / `_rejectDoc` need source-side verification

| Field | Value |
|---|---|
| Path | `public/crm/js/dashboard/panels.js:4641` (`_rejectPayout`) · `:4683` (`_approvePayout`); doc analogs further down. |
| Current behavior | Functions exist (not name-only stubs). Buttons render and call them. Audit did NOT verify whether they POST to a real backend route or perform local-only state updates. |
| Audit status | **Partial** — explore agent flagged as "stub" because POST target was not grep-traceable. Source-side read shows the functions DO exist but their bodies were not opened in this pass. |
| Recommended action | Open `panels.js:4641-4750` and confirm each function POSTs to a real `/api/crm/...` route with `logAuditEvent`. Targeted 30-min read, report-only. |
| Class | **A** (verify-only · no patch implied) — promote to actionable A/B/D after the read completes. |
| Eligible before #148 / 5B? | **Yes**, as a 30-min read-only follow-up. |

#### 1.4 — CRM list endpoints have no documented page-size cap

| Field | Value |
|---|---|
| Path | `app/api/crm/leads/route.ts` (GET) · `app/api/crm/clients/route.ts` (GET) · `app/api/crm/listings/route.ts` (GET) — sample |
| Current behavior | Several CRM list endpoints accept `limit` from query string; explore agent could not confirm a server-side cap on every list. (Featured-config PATCH did get a cap added in a prior fix.) |
| Business impact | An agent (or compromised session) can request `?limit=99999` and pull entire CRM client/lead/listing table in a single payload. NY SHIELD Act audit-trail concern. |
| Recommended PR size | **XS** — add a `clamp(limit, 1, 200)` at the top of each GET handler + a tiny `tests/runtime/crm-list-page-cap.test.ts` source-pin. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes** — independent of IDX/projection. |

---

### 2. Portal API routes

#### 2.1 — Portal write routes have NO rate limit (offers, showings, comments, signals, family)

| Field | Value |
|---|---|
| Paths (representative — all 41 portal write surfaces) | `app/api/portal/offers/route.ts` POST · `app/api/portal/showings/route.ts` POST · `app/api/portal/listings/[id]/comments/route.ts` POST · `app/api/portal/external-listings/[id]/comments/route.ts` POST · `app/api/portal/seller/signals/route.ts` POST · `app/api/portal/tenant/signals/route.ts` POST · `app/api/portal/landlord/signals/route.ts` POST · `app/api/portal/family/...` POST · `app/api/portal/showings/feedback/route.ts` POST · `app/api/portal/listings/request/route.ts` POST · `app/api/portal/listings/[id]/react/route.ts` POST |
| Current behavior | All authenticated (`requireAuth` + role check). Zero rate-limit calls. `lib/middleware/rate-limiter.ts` exists and is used on public lead-capture routes (`signup`, `contact`, `cma`, `inquiry`, `alert`, `rsvp`, `guide`) but not on any portal write. |
| Business impact | An authenticated buyer/seller/tenant/landlord can spam broker inbox with comments / showing requests / offers. Email-fanout side effects compound: each offer-POST notifies an agent. |
| Risk | DDoS-by-lead; reputational harm if an upset client floods comments; UCBA 2026 "data quality violation" risk on duplicate offers. |
| Recommended PR size | **S** — extend `lib/middleware/rate-limiter.ts` config with `portal_write: 30/hr/lead` (or per-action keys); wrap each route's POST with the existing helper. Estimate ~150 LOC across 11 files + one shared helper. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes** — no IDX / projection / migration. |

#### 2.2 — Portal offers still use `ClientListingAction.action="offer"` instead of the UCBA Art. II `Offer` model

| Field | Value |
|---|---|
| Path | `app/api/portal/offers/route.ts:1-4` comment: *"Uses ClientListingAction with action='offer' (v1 — no separate Offer model). Offer details stored as JSON in the `comment` field…"* |
| Current behavior | Portal offer submission writes a `ClientListingAction` row with JSON-blob comment. The dedicated `Offer` model from C2 (PR #49, `0bb3d740` 2026-04-26) is **NOT** wired to the buyer/tenant portal yet. UCBA Art. II transmission endpoint exists at the CRM side. |
| Business impact | Two divergent offer storage paths (portal-side string blob vs CRM-side relational `Offer`) — fragments downstream reporting, complicates the §2.05/UCBA audit trail, and blocks future portal-side transmission compliance. |
| Recommended PR size | **M** — migrate portal `POST /api/portal/offers` to write `Offer` rows instead of `ClientListingAction`, with a read-time backfill helper that surfaces both old + new for at least one quarter. |
| Class | **D** (broad CRM scope · needs Maya approval — touches data model semantics across portal + CRM) |
| Eligible before #148 / 5B? | Conceptually yes (no IDX coupling), but **scope warrants approval first.** |

#### 2.3 — `requireWorkspace()` exists but is not used on every portal write that needs role isolation

| Field | Value |
|---|---|
| Path | `lib/auth/require-workspace.ts` (or equivalent) — the helper exists per the Explore inventory but only a subset of portal routes use it. |
| Current behavior | Portal routes use `requireAuth` + ad-hoc `auth.userType !== "lead"` checks. No consistent enforcement that a buyer in workspace A cannot read/write workspace B data. |
| Business impact | Cross-tenant data leak risk inside the portal layer. The current model is "any authenticated lead is OK" without workspace isolation. |
| Recommended PR size | **S–M** — audit each portal POST/PATCH handler, add `requireWorkspace()` where missing, add a tiny test pin that fails if a portal POST handler doesn't call it. |
| Class | **A** if the helper already enforces correctly. **D** if it needs new design (multi-tenant model decisions). |
| Eligible before #148 / 5B? | **Yes** for the audit pass + test pin. Patch itself depends on the design decision. |

---

### 3. Lead-capture routes

#### 3.1 — Sign-up honeypot accepts bot submissions silently (TCPA-OK but UX gap)

| Field | Value |
|---|---|
| Path | `app/api/sign-up/route.ts` |
| Current behavior | Honeypot `website` field is silently accepted (no `400 Bad Request`), then the row is presumably rejected later — but the bot's HTTP response looks like a success. Maya's prior fix elsewhere uses an explicit `200 OK` with a "thanks!" message + DB no-op. |
| Business impact | Some bots will record "success" and stop retrying. Some will succeed in creating a real row if a code path doesn't filter the trap. Not a security catastrophe but a small data-quality leak. |
| Recommended PR size | **XS** — verify the honeypot path actually no-ops in `app/api/sign-up/route.ts`; add a positive-test that submitting `website="x"` returns 200 with no DB row. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes** — pure lead-capture hardening. |

#### 3.2 — Search-alert unsubscribe token entropy not audited

| Field | Value |
|---|---|
| Path | `app/api/search-alerts/unsubscribe/route.ts` |
| Current behavior | Rate-limited (20/hr/IP) but the token format itself was not inspected by this audit. If tokens are short or sequential, an attacker could enumerate them from observed email headers. |
| Recommended action | Read `lib/email/unsubscribe-token.ts` (or equivalent) and confirm: ≥128-bit entropy, HMAC-signed (so server can validate without DB lookup), no PII in the token body. |
| Recommended PR size | **XS** if hardening is needed; **0** if already strong. |
| Class | **A** (verify) |
| Eligible before #148 / 5B? | **Yes** — independent. |

#### 3.3 — `/api/open-houses` POST consent capture not confirmed

| Field | Value |
|---|---|
| Path | `app/api/open-houses/route.ts` |
| Current behavior | Explore agent flagged that rate-limit/consent capture status was not visible. CLAUDE.md claims all 8 lead-capture endpoints record `consent_captured_at` — needs spot verification on this one. |
| Recommended PR size | **XS** — read the file, confirm or add `consent_captured_at` write + add a test that pins it. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes**. |

---

### 4. Outlook scan / import workflow

#### 4.1 — Outlook routes have no rate limit on token-generating endpoints

| Field | Value |
|---|---|
| Paths | `app/api/crm/outlook/auth/route.ts` (OAuth start) · `app/api/crm/outlook/callback/route.ts` (code exchange) · `app/api/crm/outlook/scan/route.ts` (email fetch) |
| Current behavior | All gated to `requireAgentOrBroker`. None call the rate-limiter helper. An authenticated agent can repeatedly initiate OAuth or scan large folders, hammering Microsoft Graph's per-tenant quota. |
| Business impact | Microsoft Graph throttle → broker tenant could be temporarily blocked from Graph API → other Outlook-dependent flows break. |
| Recommended PR size | **XS** — add `crm_outlook_scan: 10/hr/agent` and `crm_outlook_auth: 5/hr/agent` to the rate-limit config. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes**. |

#### 4.2 — Outlook OAuth refresh-token rotation not audited

| Field | Value |
|---|---|
| Paths | `lib/outlook/*` (token storage) · `app/api/crm/outlook/callback/route.ts` |
| Current behavior | Tokens stored in DB per agent. Refresh-token rotation pattern not visible in this audit (e.g., whether new refresh token is written back on each access-token refresh). |
| Recommended action | Read `lib/outlook/token-store.ts` and confirm: refresh on expiry, persist updated refresh_token, decrypt-at-rest if PII-tagged. |
| Recommended PR size | **0** if already correct; **S** if rotation is missing. |
| Class | **A** (verify) |
| Eligible before #148 / 5B? | **Yes**. |

---

### 5. Featured config persistence UX/API

| Field | Value |
|---|---|
| Paths | `app/api/featured-config/route.ts` (GET + PATCH) · `public/crm/js/dashboard/panels.js:6284-6472` admin UI |
| Current behavior | **Working end-to-end.** GET cached 5 min, PATCH broker-only, server caps `pinnedListingIds ≤ 12` + `limit ∈ [1,24]`, `AuditEvent` row written per PATCH. Frontend reads / writes / lists exclusives via `/api/crm/listings?limit=100&status=Active`. |
| Gap | **None of substance.** Minor: the PATCH response shape and audit-event `entity_id` were not confirmed in this audit. |
| Business impact | n/a — feature is correct. |
| Recommended PR size | **0** — leave alone. |
| Class | (no finding) |
| Eligible before #148 / 5B? | n/a |

---

### 6. Seller portal backend completeness

#### 6.1 — Seller portal reads are 100% wired; mutations partly verified, partly inferred

| Field | Value |
|---|---|
| Frontend | `app/portal/seller/page.tsx:164-398` (typed hooks, 12 data slices) |
| Reads (verified) | `/api/portal/seller/fomo`, `/seller/demand`, `/comparables`, `/price-history`, `/marketing`, `/attorney`, `/listings`, `/showings`, `/offers`, `/documents`, `/family` — all 11 GETs gated, all return tier-correct DTOs. |
| Writes (state) | `POST /api/portal/showings` (showing request) — **verified exists** · `POST /api/portal/offers` (offer) — **verified exists** (uses `ClientListingAction.action="offer"`, see Finding 2.2) · `POST /api/portal/showings/feedback` — **verified exists** · `POST /api/portal/listings/[id]/comments` — **verified exists** · documents/family POST handlers were not opened in this audit. |
| Gap on current main | Documents upload + family invite POST handlers need source-side verification (deferred to a follow-up read). |
| Recommended PR size | **0** for what's wired. **XS** if family-invite POST is missing (Verify-first). |
| Class | **A** (verify-only follow-up) |
| Eligible before #148 / 5B? | **Yes**. |

---

### 7. Orphan / debug API routes

#### 7.1 — `app/api/debug/media-health/route.ts` is properly gated (Explore agent's "no auth" flag was incorrect)

| Field | Value |
|---|---|
| Current behavior | `requireAgentOrBroker(req)` at line 11, returns immediately on `isAuthError`. Returns Trestle + R2 + Prisma diagnostics. |
| Verdict | **Not orphan, not unauthenticated.** Keep. |
| Class | **E** (stale finding from Explore inventory — correct status now confirmed) |
| Eligible before #148 / 5B? | n/a |

#### 7.2 — `app/api/tracking/listing-view/route.ts` is intentionally public (token-as-auth)

| Field | Value |
|---|---|
| Current behavior | Comment line 2: *"Public endpoint — token IS the auth. Silent 204 on any failure."* Validates the tracking token against recent `ClientListingAction.action='sent'` rows for the listing. |
| Verdict | **Intentional design**, not an unauthenticated PII leak. Silent 204 is the documented pattern. |
| Risk | Acceptable iff the token entropy + HMAC are strong. Same verification as Finding 3.2. |
| Class | **E** + **A** (verify token entropy) |
| Eligible before #148 / 5B? | **Yes**. |

#### 7.3 — `app/api/pages/[slug]/route.ts` was flagged "no auth"

| Field | Value |
|---|---|
| Status | Not opened in this audit. Could be a public CMS slug endpoint (legitimate) or an oversight. |
| Recommended PR size | **XS** — open + categorize. If public CMS: no change needed. If accidentally public: add `requireAgentOrBroker` for write methods. |
| Class | **A** (read + classify) |
| Eligible before #148 / 5B? | **Yes**. |

---

### 8. CRM analytics panels — frontend-only or stubbed

The 14 CRM analytics systems in `CLAUDE.md` (Demand Heatmap, Buyer Intent, Agent Performance, CMA Engine, Showing Feedback, Notifications, Document Vault, Market Pulse, Lead Scoring, Commission Tracker, Listing Auditor, Seller Outreach, Pricing Experiments, Pipeline) were not all individually opened — but the Explore wiring trace flagged the following as **PARTIAL / stub**:

| Panel | Frontend status | Backend status (per Explore + targeted reads) | Class |
|---|---|---|---|
| Seller Prospects → 5-tab workspace | Reads OK | Each tab's persistence path not explicitly traced — likely workspace-local state only | A (verify) |
| Pitch Packet → "Save Comps" | Save button exists | POST target not grep-traceable | A (verify) |
| Lease Tracker → "Add Lease" modal | Modal renders | No POST traced | A (verify) |
| Broker Approval Queue → approve/reject actions | Buttons render and call `_approvePayout` / `_rejectPayout` / `_approveDoc` / `_rejectDoc` | Functions exist at `panels.js:4641-4750+` — need to confirm each POSTs to a real `/api/crm/...` route | A (verify) |
| Commission Tracker → mark-approved / mark-paid | Status filter works · CSV export works · status mutations unverified | Commission `PATCH` route needs confirmation | A (verify) |

**Recommended action:** one read-only follow-up session opens each "verify" item, reports `wired` / `stub` / `local-only`. Then promote the genuine stubs to S-size PRs. None of this touches IDX/projection/cron.

Class **A** across the board for **the verification work**. Patch sizing depends on what verification finds.
**Eligible before #148 / 5B? Yes.**

---

### 9. Auth / role gates

#### 9.1 — Ethics-training gate is login-only, not per-request

| Field | Value |
|---|---|
| Path | `lib/auth/session.ts` (createSession) checks `ethics_training_expires_at` and throws `EthicsTrainingExpiredError`. CRM/portal routes use `requireAgentOrBroker` / `requireAuth` which validate the session token only, not the ethics field. |
| Current behavior | An agent whose ethics training **expires mid-session** continues to act until logout or session expiry. |
| Business impact | UCBA Art. III §6 ethics-training-gate ↔ **enforcement is "at the door"** rather than "at every action." A determined session-holding agent could continue posting from an expired-ethics state for up to 8h (agent session TTL). |
| Recommended PR size | **S** — extend `requireAgentOrBroker` to re-check the agent's `ethics_training_expires_at` against `Date.now()` and 401 with the retraining URL. Same pattern as `createSession`. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes**. |

#### 9.2 — Agent-level row isolation is implicit, not enforced

| Field | Value |
|---|---|
| Path | All CRM CRUD routes |
| Current behavior | `requireAgentOrBroker` validates the session role but does not enforce that an agent can only read/write their own clients/leads/listings. UI filters by `agent_id` but server queries trust the caller. |
| Business impact | An agent can craft a request to `PATCH /api/crm/clients/[id]` for any client and (depending on Prisma `where` clauses) modify it. |
| Recommended PR size | **M** — introduce a `requireOwnedBy(req, table, id)` helper that enforces `agent_id === auth.userId` for AGENT role; BROKER bypasses. Add to ~40 CRM CRUD handlers. Add a runtime test pin that every `PATCH /api/crm/{clients,leads,listings,deals}/[id]/...` calls the helper. |
| Class | **D** — broader CRM scope, needs Maya's call on the multi-agent model (is it "all agents see all" by design, or per-agent isolation?). |
| Eligible before #148 / 5B? | Depends on design decision. The **test pin** alone is **A**. |

#### 9.3 — `auth/invite/[token]/route.ts` token TTL not validated server-side

| Field | Value |
|---|---|
| Path | `app/api/auth/invite/[token]/route.ts` (GET + POST) |
| Current behavior | Per Explore inventory: route does not validate token TTL server-side (format also undocumented). |
| Business impact | Stale broker invites can be redeemed indefinitely; if a token leaks (email forward, mailing list ingest, server log), it remains valid. |
| Recommended PR size | **XS** — confirm token TTL is enforced in the route handler; if missing, add `expires_at > now()` check + 410 Gone response. |
| Class | **A** |
| Eligible before #148 / 5B? | **Yes**. |

#### 9.4 — `auth/me` does NOT re-verify ethics training (mirrors 9.1)

| Path | `app/api/auth/me/route.ts` returns active session user. Does not call ethics gate. |
| Recommended | Folded into 9.1's PR. |
| Class | **A**, same PR. |

---

### 10. Rate limits / consent capture

| Surface | Rate-limit | Consent | Class |
|---|---|---|---|
| `inquiries` (public lead) | ✓ 30/hr/IP | ✓ strict boolean | — |
| `contact` (CRM-initiated) | ✓ 20/hr/IP | ✓ strict + timestamp | — |
| `cma` | ✓ 10/hr/IP | ✓ | — |
| `sign-up` | ✓ 10/hr/IP | ✓ tcpaConsent | — (see 3.1) |
| `search-alerts` | ✓ 10/hr/IP | ✓ | — |
| `search-alerts/unsubscribe` | ✓ 20/hr/IP | n/a | A (entropy verify — 3.2) |
| `guides` | ✓ 15/hr/IP | ✓ | — |
| `favorites` (public) | unknown | unknown | A (verify) |
| `open-houses` RSVP | unverified | unverified | A (verify — 3.3) |
| `/api/portal/**` POSTs | **✗ no limit on any** | n/a (covered at signup) | **A (PR — 2.1)** |
| `/api/crm/outlook/auth\|callback\|scan` | ✗ no limit | n/a | **A (PR — 4.1)** |
| CRM list GETs (`leads`, `clients`, `listings`) | n/a | n/a | A (page-cap — 1.4) |

**Headline:** Public lead-capture surfaces are well-covered. The two biggest gaps are **portal writes** (Finding 2.1) and **Outlook scan/auth** (Finding 4.1) — both are Class A and movable now.

---

### 11. Townhouse seller funnel — backend feasibility without migration

#### 11.1 — Townhouse search + buy/sell pages exist; CRM intake reuses Lead

| Path | Status |
|---|---|
| `app/buy/townhouses/page.tsx` | Public townhouse-listings landing — wired to `/api/listings` |
| `app/sell/townhouses/upper-west-side/page.tsx` | Public **seller** landing page for UWS townhouses — content present |
| `app/api/crm/sales/prospects/[id]/research/route.ts` | CRM prospect research — supports townhouse-type prospects |
| `app/api/crm/market-report/route.ts` | Market report includes townhouse property type |
| `public/crm/SALE-FORM-REDESIGN.html` | Townhouse is one of the sale form's property sub-types |
| `app/api/crm/intake/[type]/route.ts` (seller intake) | Accepts generic `seller` intake — no `townhouse`-specific schema |
| `lib/compliance/` (RLS validator) | Allows townhouse property sub-type |

#### 11.2 — Feasibility WITHOUT schema/migration

A townhouse-seller funnel **can** be assembled today using:

1. **Public landing page** `/sell/townhouses/upper-west-side` already exists. Add a townhouse-specific intake form there.
2. **Submission target**: `POST /api/inquiries` (public, rate-limited 30/hr/IP, consent-captured, writes `Lead` + `Inquiry` rows). Reuse `lead_type='seller'` + `property_sub_type='Townhouse'` in the `Inquiry.payload` JSON.
3. **CRM ingestion**: the existing `crm/intake/seller` route covers the secondary fill-out. No schema change required — `Lead.notes` + `Inquiry.payload` cover the bespoke townhouse fields (lot size, certificate of occupancy, condition narrative, etc.) as JSON until a future migration formalizes them.
4. **Routing**: `_importSelectedOutlook` already supports `role='seller'`. StreetEasy townhouse inquiry imports flow through unchanged.

#### 11.3 — Recommended PR size

**S** — one new component (`app/components/forms/TownhouseSellerForm.tsx`), one new prop on the landing page, no API routes added (reuse `/api/inquiries`), no Prisma changes, ~150 LOC + test.

**Class A.** Eligible before #148 / 5B because it uses the public lead-capture surface (which is independent of IDX, projection, and reconciliation).

#### 11.4 — Future hardening (not now)

A dedicated `TownhouseSellerProfile` model would make pitch-packet data structured rather than JSON-blob. **Class B**. Hold until next migration window.

---

## Class B — schema / migration items (held)

| Item | Why B | Notes |
|---|---|---|
| PR #62 SMS password reset | New `PasswordResetSession` model + migration `20260426120000_add_password_reset_session` | Awaiting Maya's pre-merge runbook: `prisma migrate deploy` to prod + `audit-missing-phones.ts` + Twilio env confirm. **22 days open.** |
| Portal-side `Offer` model migration (Finding 2.2) | Move portal offers from `ClientListingAction.action="offer"` to `Offer` model | Requires read-time dual-pull during transition |
| Townhouse seller dedicated model (Finding 11.4) | `TownhouseSellerProfile` to formalize JSON-blob fields | After 11.3 ships and we know the actual field shape |
| Saved-searches population (M1, per `CLAUDE.md` follow-up) | `saved_searches` table empty | Populate after PR 5B |
| `agent-level row isolation` (Finding 9.2) — if it requires new auth tables | Possibly schema if we add `agent_team` joins | Maya's design call first |
| Documents upload backend if missing (Finding 6.1) | Possible new `DocumentMetadata` model + R2 path | Verify-first |

---

## Class C — IDX / projection / reconciliation coupled (held)

| Item | Reason |
|---|---|
| PR #148 reconciliation | Maya's explicit hold; 2nd soak cycle pending |
| PR #139 emergency idx-sync disable | Part of Path C control plane — out of scope this audit |
| PR 5B search projection reader migration | `NOT_STARTED`; preconditions need to be met |

---

## Class D — needs Maya approval before any PR

| Item | Reason |
|---|---|
| Portal offer model migration (Finding 2.2) | Touches both portal + CRM data semantics |
| Agent-level row isolation (Finding 9.2) | Requires design call on multi-agent model |
| PR #124 Sentinel Search Cartographer | Held per Maya 2026-05-18 — no Sentinel implementation work |
| Mid-session ethics enforcement (Finding 9.1) — IF it changes session-rotation cadence | Pure code path is A; cadence change is D |

---

## Class E — stale doc / no longer true

| Doc | What to do |
|---|---|
| `compliance/CRM-AND-MESSAGING-COMPLIANCE.md` | Add date stamp + verify-link to live `lib/compliance/` modules. |
| `compliance/AUDIT-LOGGING-AND-EVIDENCE.md` | Add date stamp + link to `AuditEvent` model + ops:health audit-event growth pin. |
| Explore agent's "no-auth" flag on `app/api/debug/media-health/route.ts` | Incorrect — route IS gated (`requireAgentOrBroker`). Note in next session. |

---

## Prioritized Class A worklist (safe-now, before #148 / 5B)

Ordered by **value-per-LOC** within the audit's findings. Each is independently mergeable.

| Rank | Item | Finding | Size | Estimated effort | Depends on |
|---:|---|---|:---:|---|---|
| 1 | **Merge PR #146** (deal-form `Submit` wiring) | 1.1 | — | Maya approval only — PR is ready | none |
| 2 | **Rate-limit portal writes** (11 routes + shared helper) | 2.1 | S | ½ day | none |
| 3 | **Rate-limit Outlook auth + scan** (3 routes) | 4.1 | XS | ~30 min | none |
| 4 | **CRM list page-size caps** (3+ routes + test pin) | 1.4 | XS | ~30 min | none |
| 5 | **Verify-pass: approval queue / commission status mutations / "Save Comps" / "Add Lease"** (read-only audit) | 8 | XS | ½ day | none |
| 6 | **Mid-session ethics gate** (extend `requireAgentOrBroker`) | 9.1 / 9.4 | S | ½ day | none |
| 7 | **Outlook bulk-import endpoint** (replace N+1 client.create chain) | 1.2 | S | ½–1 day | none |
| 8 | **Auth invite TTL verification + fix** | 9.3 | XS | ~30 min | none |
| 9 | **Honeypot + unsubscribe entropy + open-house consent verifications** | 3.1, 3.2, 3.3 | XS each | ½ day total | none |
| 10 | **Townhouse seller funnel landing form** | 11.3 | S | ½–1 day | none |

**Total estimated effort if all Class A items ship: ~5 development days, no schema, no migration, no IDX/projection touch.**

---

## Cross-references

- Pre-existing follow-ups: `memory/REFACTOR-2026-04-25.md` (10-PR master plan — items 5 / 6 / 7 / 8 / 9 still `NOT_STARTED`), `memory/FOLLOWUP-2026-05-01.md` Workstream C (all 4 sub-PRs merged; C3c + C4c still in review).
- IDX/projection holds: `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` (H1 closed by PR #112 + #113; H2 + H3 open), `docs/listing-search-projection-drift-report-2026-05-16.md` (1,892 → 1,949 baseline, see today's PR #147 soak report).
- Compliance gates that constrain every change above: `.claude/skills/rebny-compliance/SKILL.md` (UCBA 2026, IDX Plus, FARE Act, Fair Housing, NY DOS §175.25, TCPA, NY SHIELD Act, CAN-SPAM).
- Engineering rules: `docs/engineering/pr-verification-checklist.md` R0/R5/R6/R7/R9/R10 · `docs/engineering/vercel-preview-proof-rules.md` V1–V8.

---

## Hard holds (unchanged this audit)

- ❌ No reconciliation execution
- ❌ No merge of PR #148
- ❌ No PR 5B start
- ❌ No IDX code patches
- ❌ No manual cron triggers
- ❌ No env / Neon / migrations / cron / CRM patches in this session
- ❌ No Sentinel/bots/agents/skills/workflows edits
- ❌ No commits from this audit
- ❌ The PR #147 soak watch (Task #172) is unchanged — still awaiting 2026-05-19T03:30 UTC

---

**End of report.** No code modified. No PR opened. No DB rows touched. No env vars changed.
