# SEARCH — FIRST CHECKPOINT PACKET (Sale + Rental foundation)

Lane: `search/clean-foundation-2026-09-04` · worktree `C:\Users\MayaAllan\Desktop\mallan-nyc-search-clean` · base `main @ 2a83952a`.
Governing authority: `MALLAN-PLATFORM-MASTER-PLAN.md` (PR #595), including its permanent verification structure. This packet is the lane's own evidence record; it is not a competing plan.

## Verification model applied to this packet

Five evidence classes. They are recorded separately and are never combined to manufacture a PASS. The Builder certifies nothing.

| Role | Sees | Produces | Must not |
|---|---|---|---|
| **Coordinator** | everything | freezes SHA, deployment, scope, acceptance matrix; classifies evidence | convert one class into another |
| **Builder** | live provider truth first, then code | the correction, direct tests, negative tests | certify own work; verify own assumptions with tests |
| **Contract/Data Validator** | live Cotality only, never registry/#618/docs | resource · field · type · picklist · population · semantics · permission, compared to `FIELD_REGISTRY` afterwards | become a second Builder |
| **Runtime/Integration Validator** | the running system | criterion → request → execution → final universe → exact total → sort → pagination → reload → downstream | rely on Builder tests |
| **Security/Compliance Validator** | the running system + contracts | auth, attribution, RLS/REBNY/UCBA, display gates, address disclosure, opt-out/participant-only, provider-vs-Mallan authority, fail-closed | weaken a gate to pass |
| **Independent Verifier** | ONLY frozen matrix + Preview URL + SHA/deployment + credentials | PASS / FAIL / BLOCKED per assertion | read Builder narrative, diff or tests before verdict; convert BLOCKED to PASS |
| **Maya UAT** | the Preview, as the broker | acceptance | substitute for any of the above |

Any code change after freeze invalidates the exact-head Independent Verifier result.

## Order of operations for every criterion

```
LIVE COTALITY RESOURCE/FIELD → LIVE TYPE/PICKLIST → LIVE POPULATION + SEMANTIC PROOF
        → VERIFIED MAPPING → FIELD_REGISTRY → EXECUTOR → RESULT
```

Live first. Registry second. Tests last. If live evidence contradicts `FIELD_REGISTRY`, #618, a census file, a doc or a prior audit, the live provider wins and the mapping is corrected.

## Scope of this checkpoint

Sale: status · ListPrice · bedrooms · baths · borough · neighborhood · basic property type.
Rental: status/universe · rent · bedrooms · baths · borough · neighborhood · basic property type.

Both: Mallan-authored `SL-`/`RL-` included exactly once · verified Mallan return-copy suppressed · third-party inventory read-only · correct media · exact total · correct sort · correct pagination/continuation · no post-page filtering · no gaps · no invented provider facts · display gates fail closed.

## Hard parallel boundary (until #627 merges)

Not modified by this lane: `public/crm/js/core/api-client.js`, `public/crm/js/dashboard/panels.js`, `public/crm/js/output/reports.js`, `public/crm/js/search/pagination.js`, `public/crm/index-built.html`, `public/crm/SALE-FORM-WITH-TOOLS.html`, `public/crm/RENTAL-FORM-WITH-TOOLS.html`, `app/api/crm/agent-inquiry/route.ts`, `app/api/listings/suggest/route.ts`. Any integration point that needs one of these is marked PENDING here, never edited through.

## Evidence sections (filled as each class reports)

### 1. Contract/Data Validator — live provider truth
_Status: RUNNING (dispatched 2026-09-05, live Cotality only, no registry or #618 visibility)._
Evidence file: `SEARCH-CHECKPOINT-LIVE-COTALITY-IV-2026-09-05.md` (scratchpad; copied here on receipt).
Registry comparison per executable entry: VERIFIED_CURRENT · CORRECT_MAPPING_REQUIRED · NEEDS_LIVE_SEMANTIC_PROBE · NOT_POPULATED · NOT_AUTHORIZED · REMOVE_FROM_EXECUTION — _pending the live report_.

### 2. Builder — extraction ledger from #618 (evidence only, never merged wholesale)
`#618 source → current-main equivalent → contract re-verified against section 1? → tests → runtime dependency` — _pending_.

### 3. Runtime/Integration Validator
_pending a Preview with the QA database._

### 4. Security/Compliance Validator
_pending._

### 5. Independent Verifier
Frozen matrix, Preview URL, SHA/deployment and credentials only. _Not yet frozen._

### 6. Maya UAT
_After zero FAILs._

## Pending list (blocked by #627 boundary)
_none recorded yet._
