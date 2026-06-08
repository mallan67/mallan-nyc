# Phase 1 — Read-Only Traces of the UNVERIFIED Items (2026-06-07)

Read-only forensic sweep (4 parallel agents) turning the plan's A8 "UNVERIFIED — trace before
any fix" items into confirmed findings. **No files modified. No DB/Trestle/.env touched.**
All Class A (static code-path, authoritative for what the code does) per CLAUDE.md §J — NOT a
claim about live exploitation or production data. Each item has a FIX SHAPE (proposal only).

## Verdict summary

| ID | Item | Verdict | Sev | Compliance tie |
|---|---|---|---|---|
| U1 | Portal offers write `ClientListingAction`, never create `Offer` → never enter the UCBA transmission pipeline | **CONFIRMED** | P0 | UCBA Art. II (offer transmission/disclosure) |
| U2 | 20 portal mutation routes have NO rate limiting; global limiter bypasses authenticated users | **CONFIRMED** | P1 | data security / abuse |
| U3 | Impersonation has NO per-write provenance (`impersonated_by_broker_id` absent from session + every write); agent-attributed only; 2h cookie vs 8h DB TTL + silent rotation | **CONFIRMED** | P1 | NY DOS §175.25 broker supervision / audit integrity |
| U4 | `crm/offers/[id]/transmit` — **cross-agent write hole**: any agent can transmit ANOTHER agent's offer + write the UCBA audit event under their own id | **CONFIRMED** | **P1 (urgent)** | UCBA Art. II trail integrity / NY SHIELD |
| U5 | `crm/notifications` PATCH single-id branch — cross-recipient read-state write | CONFIRMED | P3 | minor segregation |
| U6 | Outlook import sequential per-contact; auth/scan routes unthrottled; Graph client no 429/backoff | CONFIRMED | P2 | Graph quota / reliability |
| U7 | Commission "Submit Request" → sets non-existent `payout_status` → 400 → **success-on-error toast**, no DB write | **CONFIRMED** | **P1** | financial oversight (deal lost silently) |
| U8 | Payout approve/reject read `payout_status` but Deal has only `status` — approval pipeline effectively unreachable | **CONFIRMED** | P1 | financial oversight |
| U9 | rental `applications_count: 0 // TODO` fake metric | CONFIRMED | P2 | misleading metric |
| U10 | Outlook-imported contacts land `consent_captured_at = null`, no consent flag | **CONFIRMED** | **P1 (verify rule)** | TCPA / CAN-SPAM (§D — read canonical first) |
| — | Portal workspace isolation "missing `requireWorkspace`" | **REFUTED as a hole** | — | complementary layers; no cross-lead write found |
| — | Agent row ownership "implicit per-route" | TRUE but mostly enforced | P2 | only U4/U5 are real gaps |

## Detail (evidence + fix shape)

### U1 — Portal offers bypass the UCBA `Offer` pipeline · P0 · UCBA Art. II
Both models exist and are disjoint: `Offer` (`prisma/schema.prisma:2425-2480`, full UCBA
lifecycle: `received_at`/`transmitted_to_seller_at`/`seller_acknowledged_at`/
`competing_offers_disclosed`) vs `ClientListingAction` (`schema.prisma:743-757`, generic
`action`+`comment`). Portal offer POST writes the latter
(`app/api/portal/offers/route.ts:281-288`, details JSON-stuffed into `comment`). **`Offer` is
never created anywhere** (`grep prisma.offer.create` → 0). The broker transmit route only
`findUnique`+`update`s pre-existing `Offer` rows (`app/api/crm/offers/[id]/transmit/route.ts:51,86`)
+ writes the `offer_transmitted_to_seller` AuditEvent (`:101`) — unreachable for portal offers.
Seller dashboard counts `PortalEvent`, not `Offer` (`app/api/portal/seller/dashboard/route.ts:41-43`).
Portal showings, by contrast, DO use the shared relational `Showing` model — so the divergence
is offer-specific. **FIX SHAPE:** portal offer POST creates an `Offer` (system of record), key the
audit + dashboard + transmit pipeline to it. *(Read UCBA Art. II canonical first.)*

### U2 — Portal mutations unthrottled · P1
`checkRouteRateLimit` (`lib/middleware/rate-limiter.ts:93`) is imported only by 10 public/CRM
lead-capture routes; **zero** `app/api/portal/**` routes use it. The global middleware limiter
short-circuits `return null` for any request with a `session_token` cookie
(`rate-limiter.ts:190-192`) — which portal users always carry — so portal writes are unprotected
at both layers. 20 mutating portal routes enumerated (offers/showings/feedback/comments/react/
signals×3/renewal/family-invite/messages/external-listings±/open-houses±/preferences/attorney/
complete-profile). **FIX SHAPE:** `checkRouteRateLimit` keyed by `lead_id` (not IP) at each portal
mutation handler.

### U3 — Impersonation provenance · P1 · broker supervision
`createSession("agent", agent.id, agent.role, …)` (`app/api/crm/agents/[id]/impersonate/route.ts:34`)
makes a session identity-indistinguishable from a real agent login; broker id recorded ONLY in
the `impersonate_start` `changes` JSON (`:37-48`). `SessionUser` (`lib/auth/session.ts:99-104`)
+ `Session` model (`schema.prisma:576-591`) + `AuditEvent` (`:695-710`) have **no
impersonation column**. Every CRM write during impersonation is logged `user_type=agent,
user_id=agentId` (`lib/auth/middleware.ts:182-201`) — broker invisible, no join key. 2h cookie
(`route.ts:63`) vs 8h DB TTL (`session.ts:8-9`) + silent rotation (`session.ts:159-167`) can
extend it. **FIX SHAPE:** add `impersonated_by_broker_id` to Session + AuditEvent, populate in
`createSession`, record on every write; align TTL; exempt from silent rotation. *(schema
migration = HELD.)*

### U4 — Cross-agent offer-transmit write hole · P1 (URGENT) · UCBA Art. II
`app/api/crm/offers/[id]/transmit/route.ts` is `requireAgentOrBroker` (`:25`), loads the offer
by id (`findUnique({where:{id:offerId}})`, `:51`), and **never checks
`existing.list_agent_id/buyer_agent_id === auth.userId`**. Any authenticated agent can transmit
**another agent's** offer (stamp `transmitted_to_seller_at`, advance status, `:86-99`) and write
the UCBA `offer_transmitted_to_seller` AuditEvent **under their own id** (`:101`). Idempotency
(`:62`) limits repeats but not the first illegitimate write. **FIX SHAPE:** owner check after the
findUnique → 403; failing cross-agent test flipped green (home: `tests/runtime/offer-transmit.test.ts`).
*Note:* no project validator tests route authz — this is invisible to the green compliance chain;
it must be a `tests/runtime/` auth test.

### U5 — Notifications cross-recipient read-state write · P3
`app/api/crm/notifications/route.ts:98-103` single-id PATCH `update({where:{id}})` with no
`recipient_id===auth.userId`. Mark-all branch is scoped (`:93`); only the targeted-id branch is
open. **FIX SHAPE:** `updateMany({where:{id, recipient_id:auth.userId}})`, 404 on count 0.

### U6 — Outlook scaling/limits · P2
Client-side sequential per-contact import (`public/crm/js/dashboard/panels.js:3061-3078`, 1-2
HTTP/contact). Outlook auth/callback/scan/folders/disconnect routes: **0** rate-limit matches;
authenticated → exempt from the edge limiter. `graphFetch` (`lib/outlook/graph-client.ts:84`) has
no 429/Retry-After/backoff; frontend auto-refetches (`panels.js:2907`). **FIX SHAPE:** per-agent
limiter on scan/auth; 429+backoff in graphFetch; bulk `POST /api/crm/clients/bulk` (createMany).

### U7 — Commission "Submit Request" silent-fail · P1 · financial oversight
`panels.js:11845` `deals.update(dealId,{payout_status:'submitted'})` → `PATCH /api/crm/deals/[id]`,
whose allowlist (`app/api/crm/deals/[id]/route.ts:57-68`) does NOT include `payout_status` → route
returns **400 "No valid fields"** (`:71`). The caller `.catch(()=>CRM.toast('Request submitted'))`
(`panels.js:11850`) shows **success on failure** and mutates only local state. DB never written —
canonical UI-says-success-no-write. **FIX SHAPE:** see U8 (single coherent fix) + remove the
success-on-error catch.

### U8 — Payout `payout_status` vs `status` mismatch · P1
Deal model has only `status` (`schema.prisma:151-174`); **no `payout_status` column** exists. UI
reads `d.payoutStatus||d.payout_status` everywhere (`panels.js:54,293,498,4424,11682`) → always
`undefined`; approval-queue "pending payout" filter can't match. Approve/reject hit the real
`PATCH …/status` route (state machine `submitted→approved|rejected`,
`deals/[id]/status/route.ts:13-19`) but nothing sets `status='submitted'` via the UI (U7 fails),
so approvals 422 in practice. **FIX SHAPE (with U7):** pick ONE field — either add a real
`payout_status` column + dedicated broker-gated route + state machine, OR collapse onto `status`
(submit → `status='submitted'`, repoint reads). *(schema migration = HELD if option A.)*

### U9 — rental `applications_count` fake · P2
`app/api/crm/rentals/listings/route.ts:55` literal `applications_count: 0 // TODO`; `_count` only
counts showings (`:25`). `app/api/crm/rentals/applications/route.ts` exists. **FIX SHAPE:** count
the real applications relation/model, or hide the metric.

### U10 — TCPA on Outlook imports · P1 (verify rule) · §D
Imported contacts created via `POST /api/crm/clients` (`source:'outlook_import'/'streeteasy'`,
`panels.js:3045`); `createClient` (`app/api/crm/clients/route.ts:53-71`) never sets
`consent_captured_at` (`schema.prisma:200`, TCPA/CAN-SPAM field) → imported leads land
`consent_captured_at=null`. Contacts scraped from arbitrary mail folders (`scan/route.ts:200-220`)
never opted in. **FIX SHAPE:** stamp imports `consent_status='none'/import_unverified`; gate ALL
outbound automation on consent; **READ the TCPA canonical (COMPLIANCE-CANONICAL-INDEX) before any
fix — fail-closed §E.**

## What this changes in the plan
- The plan's A8 "UNVERIFIED" block is resolved → these become CONFIRMED ledger rows (a new
  **Domain U — CRM/Portal**). The portal **workspace isolation** worry is REFUTED (good — de-risked).
- **Newly urgent (not previously ledgered):** U4 (cross-agent offer-transmit authz + UCBA trail),
  U7/U8 (commission payout silently lost / pipeline unreachable), U1 (portal offers never reach
  UCBA transmission), U10 (TCPA on imports), U3 (impersonation provenance).
- Owning phases: U2/U3/U4/U5/U6 → Phase 3 (auth/security); U1/U7/U8 → Phase 6 (compliance/CRM
  durability); U9 → minor (Phase 4/6); U10 → Phase 2 (lead-flow/consent) + §D read.
