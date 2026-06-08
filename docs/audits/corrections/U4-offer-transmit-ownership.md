# Correction Trace Record — `U4` offer-transmit cross-agent ownership guard

> **Status: PLANNED — NOT FIXED.** This record exists in #372 only to pre-register the plan.
> Explicitly, as of #372:
> - **No code fix has been written.**
> - **No RED proof captured and no GREEN — no test has been run.**
> - **No security-agent sign-off, no macro sign-off, no live proof.**
> - Sections 5–9 will be filled **during the separate U4 PR** (off post-#372 main), committed with
>   the fix, under the micro+macro gates.
> - **This does NOT settle the U4 ledger row** — U4 stays `PLANNED` until that PR merges green.

## 0. Header
- **ID / Ledger row:** U4 (`settlement-ledger-2026-06.md` → Domain U; row status = **PLANNED**)
- **Severity / Compliance tie:** P1 (urgent) · UCBA Art. II (offer-transmission audit-trail integrity) · NY SHIELD (agent data segregation)
- **Owning phase:** 3 (auth/security) · **Maya GO:** _pending (not given)_
- **Status:** PLANNED (no fix yet)

## 1. Defect — the BEFORE proof
- `app/api/crm/offers/[id]/transmit/route.ts` is gated only by `requireAgentOrBroker` (`:25`),
  loads the offer by id (`prisma.offer.findUnique({ where: { id: offerId } })`, `:51`), and
  **never checks `existing.list_agent_id` / `existing.buyer_agent_id === auth.userId`** before it
  stamps `transmitted_to_seller_at` + advances status (`:86-99`) and writes the UCBA
  `offer_transmitted_to_seller` AuditEvent **under the caller's own user_id** (`:101`).
- **Effect:** any authenticated agent can transmit *another* agent's offer and forge the UCBA
  transmission record under their own identity → compliance-trail corruption + cross-agent write.
- **RED proof (to capture in step 1):** a runtime test where agent B calls
  `GET/POST /api/crm/offers/{offerOwnedByAgentA}/transmit` and currently succeeds (200 + audit
  written) — must become 403 + no write.

## 2. Pre-registered blast radius (the "no dark work" contract)
- **WILL touch (direct):**
  - `app/api/crm/offers/[id]/transmit/route.ts` — add an owner check immediately after the
    `findUnique` (~`:54`): allow only if `auth.role==='BROKER' || existing.list_agent_id===auth.userId || existing.buyer_agent_id===auth.userId`; else `403`.
  - `tests/runtime/offer-transmit.test.ts` — add cross-agent-denied + owner-allowed + broker-allowed cases.
- **Transitive reach / consumers:** the broker/agent "transmit offer" UI control (must still work
  for the owning agent + broker — verified by the owner-allowed/broker-allowed tests). No other
  route imports this handler. The `Offer` model + AuditEvent shape are unchanged.
- **Compliance surfaces:** UCBA Art. II offer transmission + the `offer_transmitted_to_seller`
  audit event attribution.
- **Coupled ledger rows:** U1 (portal offers → `Offer`). U4 is independent (authz on the existing
  transmit route); the macro verifier must confirm the U4 owner-check does not conflict with the
  later U1 change (which will *create* Offers the transmit route then reads). Note carried.
- **MUST NOT touch:** prisma schema / migrations (no column change) · env · `.github/**` · any
  other route · the generic `assertOwnedByOrBroker` helper (the broader CRM-wide ownership
  generalization is a SEPARATE later correction — keep this blast radius to one route + its test).

## 3. Compliance pre-read (§D)
- Read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` → UCBA Art. II offer area + audit-event
  area. Confirm the required actor attribution for a transmission record.
- Fail-closed: if the canonical rule on who-may-transmit / how attribution is recorded is unclear,
  STOP & report — do not infer from code.

## 4. Fix approach
Minimal, additive owner guard inside the existing route (no schema change). One decision: 403 vs
404 on a non-owned offer — default **403** (the offer exists; the caller is simply not authorized)
unless the compliance read says non-disclosure of existence is required, in which case 404.

## 5. Step log (fills during execution)
| # | Step | Command / file | Artifact | Result |
|---|------|----------------|----------|--------|
| 1 | failing cross-agent test (RED) | `tests/runtime/offer-transmit.test.ts` | captured RED | ▢ |
| 2 | add owner check | `…/offer-transmit/route.ts:~54` | diff | ▢ |
| 3 | tests GREEN (denied/owner/broker) | `jest …offer-transmit` | output | ▢ |
| 4 | full harness vs baseline | B0 chain | counts | ▢ |
| 5 | compliance chain | ucba/rls/idx/compliance-check | counts | ▢ |
| 6 | live proof | n/a (test-only proof suffices; no render) | — | N/A |
| 7 | actual-diff vs §2 radius | `git diff --name-only` | list | ▢ |
| 8 | MICRO: security-agent (auth change, blocker) + code-reviewer + silent-failure-hunter + pr-test-analyzer | agents | verdicts | ▢ |
| 9 | MACRO: system-impact verifier (radius match + U1 non-conflict + no other row regressed) | record | ▢ |
| 10 | commit / PR / checks / merge | SHA, PR# | links | ▢ |

## 6. Gate results — ▢ (fills during execution)
## 7. Sign-offs — security-agent PASS (required, blocker) · macro verifier PASS · Maya GO + merge — ▢
## 8. Trace-back — `git checkout <baseSHA>` → RED ; `git checkout <fixSHA>` → GREEN + harness match — ▢
## 9. Permanent regression guard — the cross-agent-denied test in `tests/runtime/offer-transmit.test.ts` — ▢
