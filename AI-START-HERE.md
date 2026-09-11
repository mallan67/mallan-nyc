# AI START HERE — MALLAN NYC

Every Claude, Codex, ChatGPT or other agent working in this repository begins here.

## 1. Repository boundary

Work only in `mallan67/mallan-nyc` for this project. `Mallan-Integrated` is separate and must not be touched.

Authorized local checkout:

`C:\Users\MayaAllan\Desktop\mallan-nyc`

Before any local mutation, verify:

1. `pwd`
2. `git rev-parse --show-toplevel`
3. `git remote get-url origin`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git status --short`
7. `git worktree list`

If the active checkout/worktree is not the authorized one, stop mutation. Do not silently switch clones/worktrees. Stage explicit paths only; do not use `git add -A` or `git add .`.

## 2. Authority order

1. `MALLAN-PLATFORM-MASTER-PLAN.md` — **sole durable product/business/system authority**.
2. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` — current branch/head/PR, active layer, blockers, holds, evidence and next action. **Status only.**
3. Fresh Git/runtime/provider evidence — current reality always beats stale status prose.
4. `AGENTS.md` — cross-agent operating constitution, subordinate to the Master for architecture.
5. `CLAUDE.md` — Claude-specific operating instructions, subordinate to the Master and current execution state.
6. `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` — detailed current compliance implementation registry.
7. `NEON.md` — Neon/Prisma/database operating rules.
8. Health dashboard, issue registry, dated handoffs, historical plans/audits/ledgers — evidence/support only.

No old chat, PR body, audit, temporary ledger, historical plan or tool memory may independently redefine Mallan architecture.

## 3. Architectural invariant

Always preserve:

```text
COTALITY RAW CONTRACT
→ VERIFIED MAPPING
→ MALLAN STORAGE / PROJECTION
→ MALLAN BUSINESS RULE
→ PUBLIC / CRM / SEARCH / CMA / REPORT / MARKETING CONSUMER
```

For non-Cotality sources:

```text
AUTHORITATIVE SOURCE
→ VERIFIED SOURCE CONTRACT / RIGHTS
→ VERIFIED MAPPING
→ MALLAN CANONICAL IDENTITY
→ MALLAN BUSINESS RULE
→ AUTHORIZED CONSUMER
```

Cotality/Trestle governs its provider contract and source facts. REBNY/RLS/UCBA and applicable law govern their respective business/use/display obligations. RESO vocabulary is provider-schema language, not a separate Mallan authority.

## 4. Continuous-program rule

Do not start a new master audit because context changed.

At session start:

1. read the Master completely for the affected business layer;
2. read current execution state;
3. refresh exact Git/PR/runtime/provider identity as applicable;
4. continue the active dependency if the recorded state remains valid;
5. reopen only the dependency contradicted by new evidence;
6. reconcile newly proven business requirements into the same Master rather than creating another plan.

Current implementation priority, PR numbers, SHAs and holds belong in the execution-state file, not here.

## 5. Canonical-system rule

Do not create parallel Party, Agent, Property, Listing, Search, Saved Search, client-history, CMA, Media, Document, Campaign, Deal, Commission, Referral or workflow truths merely because integration is difficult.

Before proposing a new model/table/service, prove why existing canonical structures cannot safely represent the requirement and trace every affected writer, reader and downstream consumer. Schema changes remain explicit Maya authorization.

## 6. Compliance / provider rule

Before work touching listings, Search, CRM, lead capture, communications, media, advertising/public content, forms/documents, attribution, display gates or syndication, read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and the current specialized authority it points to.

Never guess provider fields, picklists, permissions, media rights, attribution or legal/compliance semantics.

## 7. Proof-first rule

No capability is complete because code exists, CI is green, a PR is open/merged or a deploy succeeded.

Use the Master §27 closure model and preserve evidence classes separately. Forms additionally prove:

```text
CREATE → SAVE → RELOAD → EDIT → SAVE → RELOAD
```

Critical actions must fail visible and recover without silently losing state or creating duplicate business effects.

## 8. Mutation boundary

Documentation/read-only investigation does not authorize Production/schema/migration/backfill, destructive data/R2, environment/credential, shared-branch force/rebase or manual Production deployment actions. Those remain explicit Maya authorization boundaries.

A held mutation freezes only that mutation; safe independent work may continue.

## 9. Handoff

Update `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` at meaningful checkpoints and before context loss with the exact active layer, branch/head/PR, main/Production identity where applicable, evidence, blockers/holds and next exact action.

Do not duplicate that transient state into the Master or this startup file.