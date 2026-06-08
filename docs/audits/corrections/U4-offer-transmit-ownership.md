# Correction Trace Record — `U4` offer-transmit cross-agent ownership guard

> **Status: IN-PR — fix implemented test-first** (off post-#372 main). RED→GREEN captured,
> full harness green, **security-agent PASS**, micro/macro gates pass. **The U4 ledger row stays
> `PLANNED` until THIS PR MERGES green** — do NOT mark it SETTLED before merge.
>
> **Codex #373 follow-up (addressed):** the guard now normalizes the role
> (`auth.role.toUpperCase() === "BROKER"`) — a legacy/lowercase `"broker"` session (admitted by
> `requireAgentOrBroker`) is no longer wrongly 403'd on offers it doesn't own. RED→GREEN test added
> (lowercase-broker non-owner → 200). security-agent re-review: **PASS** (zero over-permit).
> Repo-wide root cause (other exact-case `=== "BROKER"` routes + `reset-password.js` lowercase
> write) tracked as a separate non-blocking LOW for a future sprint.

## 0. Header
- **ID / Ledger row:** U4 (`settlement-ledger-2026-06.md` → Domain U; row stays **PLANNED** until merge)
- **Severity / Compliance tie:** P1 (urgent) · UCBA Art. II (offer-transmission audit-trail integrity) · NY SHIELD (agent data segregation)
- **Owning phase:** 3 (auth/security) · **Maya GO:** given ("move to U4")
- **Status:** IN-PR (fix done + verified; awaiting PR merge)

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
| 1 | failing cross-agent test (RED) | `tests/runtime/offer-transmit.test.ts` | 2 RED: non-owner agent (fresh + already-transmitted) → Expected 403, **Received 200** | ✅ RED |
| 2 | add owner check | `app/api/crm/offers/[id]/transmit/route.ts` (after the `!existing` 404, before idempotency) | +17 lines; `isOwnerOrBroker` (broker OR list/buyer agent === auth.userId) → 403 | ✅ |
| 3 | tests GREEN (denied/owner/broker) | `jest offer-transmit` | **9/9 pass** (2 flipped green; list/buyer/broker still 200) | ✅ GREEN |
| 4 | full harness vs baseline | B0 chain | type-check 0 · test:runtime **2046/2046** · build exit 0 · 0 regressions | ✅ |
| 5 | compliance chain | ucba/rls/idx/compliance-check | ucba 0 regressions · rls 0 errors · idx 1 known critical (unchanged) · compliance-check 92/0 fail/0 unverified | ✅ |
| 6 | live proof | n/a — test-only proof suffices (no render surface; §F satisfied by the failing-test-flips-green) | — | N/A |
| 7 | actual-diff vs §2 radius | `git diff --name-status main...HEAD` | `route.ts` + `offer-transmit.test.ts` — **exactly the declared radius** | ✅ |
| 8 | MICRO agents | security-agent (auth blocker) | **VERDICT: PASS** — 0 critical/high/medium; sound bigint guard, refuse-before-mutation confirmed; 1 pre-existing non-blocking low | ✅ |
| 9 | MACRO: system-impact | gate:macro | domain `crm` → security-agent; declared radius parsed = route+test; no unexpected reach; U1 non-conflict (U4 guards the existing route; U1 will create `Offer` rows it reads) | ✅ |
| 10 | commit / PR / checks / merge | branch `fix/u4-offer-transmit-ownership` | commit + PR opened (links below); **awaiting merge** | ⏳ |

## 6. Gate results
| Gate | Result | Evidence |
|---|---|---|
| B0 harness | green | type-check 0 · lint 0 err · test:runtime 2046/2046 · crm 39/39 · scanner 323/323 · ucba 46/0 regr · compliance-check 92/0 · rls 0 err · idx 1 known critical · build exit 0 |
| B1 compliance chain | 0 regressions | ucba/rls/idx/compliance-check above |
| B2 live proof (§F) | failing-test-flips-green (2 RED→GREEN) | `tests/runtime/offer-transmit.test.ts` |
| C1 micro: security-agent | **PASS** | release-gate verdict, audit trail `memory/AUDITOR-LOG.md` |
| C1 micro: gate:micro | PASS (test-first satisfied) | route + test in diff |
| C2 macro: gate:macro | PASS | domain map + declared-radius reconcile |

## 7. Sign-offs
- **security-agent: PASS** (auth release-gate — 0 critical/high/medium).
- **gate:micro / gate:macro: PASS** (test-first + blast-radius reconcile).
- **Maya:** GO to start ("move to U4") · merge approval: pending.

## 8. Trace-back / reproduce
```
git checkout main      # defect present (no ownership check)
git checkout fix/u4-offer-transmit-ownership~0 -- (test) ; npx jest offer-transmit  # 2 RED
# with the fix commit applied:
npx jest offer-transmit   # 9/9 GREEN ; npm run test:runtime → 2046/2046
```

## 9. Permanent regression guard
`tests/runtime/offer-transmit.test.ts` — the "U4 — offer transmit ownership guard" describe
(non-owner agent → 403, no update, no audit; already-transmitted no-leak; owner/broker 200).
