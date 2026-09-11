# AGENTS.md — Cross-Agent Constitution (Claude · Codex · ChatGPT)

> **Cross-agent operating constitution for `mallan67/mallan-nyc`.**
>
> Product/business/system architecture is owned only by `MALLAN-PLATFORM-MASTER-PLAN.md`. This file governs shared working discipline and is subordinate to the Master for architecture and to `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` for current execution state.

## 0. Required startup path

Every agent begins with:

1. `AI-START-HERE.md`;
2. the affected Master sections, or the full Master for cross-system work;
3. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`;
4. fresh Git/runtime/provider state as applicable;
5. this file plus specialized governance such as `CLAUDE.md`, `NEON.md` and the Compliance Canonical Index when relevant.

Old chats, PR prose, handoffs, audits and tool memory are evidence only. They do not outrank the Master or fresh runtime/provider truth.

## 1. Repository and mutation discipline

- Work only in `mallan67/mallan-nyc` for this project.
- Authorized local checkout: `C:\Users\MayaAllan\Desktop\mallan-nyc`.
- Before local mutation verify root, remote, branch, HEAD, status and worktrees.
- One active branch/worktree = one writer.
- Stage explicit paths; do not use `git add -A` or `git add .` for Mallan work.
- Never skip hooks, bypass signing, amend a published commit, admin-bypass protections or force-push shared/main work without explicit Maya authorization.
- Do not create parallel `*-v2`, `*-new`, `*-final` systems merely to avoid integrating canonical code.

## 2. Canonical architecture invariant

Always preserve:

```text
COTALITY RAW CONTRACT
→ VERIFIED MAPPING
→ MALLAN STORAGE / PROJECTION
→ MALLAN BUSINESS RULE
→ PUBLIC / CRM / SEARCH / CMA / REPORT / MARKETING CONSUMER
```

For any non-Cotality source:

```text
AUTHORITATIVE SOURCE
→ VERIFIED SOURCE CONTRACT / RIGHTS
→ VERIFIED MAPPING
→ MALLAN CANONICAL IDENTITY
→ MALLAN BUSINESS RULE
→ AUTHORIZED CONSUMER
```

Cotality/Trestle is authoritative for its own live provider schema, fields, picklists and provider-served facts. It is **not** the sole authority for Mallan-authored business records, law/DOS, REBNY/RLS/UCBA obligations, Offering Plans/Schedule A or other verified source domains.

RESO vocabulary exposed by the provider is schema vocabulary, not a separate Mallan business authority.

## 3. Provider truth rule

For any Cotality-dependent implementation claim, verify current authorized provider truth rather than copying old snapshots, hand-maintained lists or prior-agent prose.

Check the full affected surface when field/status/picklist semantics change:

```text
LIVE PROVIDER CONTRACT
→ SELECT / EXPAND / FILTER
→ MAPPING
→ STORAGE / RAW SOURCE
→ BUSINESS RULE
→ DB + DIRECT PROVIDER DTO PATHS
→ UI / FORM / SEARCH / REPORT / CMA / MEDIA CONSUMERS
→ TESTS
```

Unknown provider semantics fail closed. Never fabricate a field, enum, permission, value or fallback.

## 4. Compliance-first rule

Before changes involving listings, IDX/RLS, Search, syndication, CRM Leads, intake forms, public advertising/text, attribution, media, portals, consent/privacy, status/display gates or compliance-shaped workflows, read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and the specialized authority it points to.

If a legal, REBNY/RLS/UCBA, Fair Housing, advertising, privacy or provider-use rule is unclear or conflicting, stop the affected mutation and surface the uncertainty. Do not guess.

## 5. Canonical-object rule

Do not create a second Party, Agent, Property, Listing, Search, Saved Search, Client history, CMA, Media, Document, Campaign, Deal, Commission, Referral, Task or workflow truth because integration is difficult.

Before proposing a new model/table/service, prove why the existing canonical structures cannot safely represent the requirement, then identify writers, readers, migration/reconciliation needs, downstream consumers, compliance and proof.

Schema/migration/backfill remains explicit Maya authorization.

## 6. Proof-first rule

A change is not `fixed`, `done`, `production ready`, `optimized` or `closed` merely because code exists, CI passes, a PR exists/merges or a deployment succeeds.

Use Master §27. Evidence classes stay separate:

- Builder/static/unit/integration evidence;
- data/structural evidence;
- independent black-box runtime evidence;
- current provider evidence where applicable;
- Production proof only after authorized deployment.

Forms additionally prove:

```text
CREATE → SAVE → RELOAD → EDIT → SAVE → RELOAD
```

No silent data loss, hidden fallback, false success or unverified `unknown = zero/false/Manhattan/Active` behavior.

## 7. Impact-graph rule

Before calling a material fix complete, trace:

```text
PROVEN DEFECT / REQUIREMENT
→ ROOT OWNER
→ ALL WRITERS
→ ALL READERS / PUBLISHERS
→ CACHE / JOB / PROJECTION / EVENT EFFECTS
→ CORRECTION
→ DIRECT + NEGATIVE TESTS
→ INTEGRATION
→ DOWNSTREAM / COMPLIANCE
→ PREVIEW / RUNTIME
→ AUTHORIZED PRODUCTION PROOF
```

Do not enter endless `test fails → patch → next test fails` loops without establishing the shared impact graph first.

## 8. Current state and handoff

Current PRs, SHAs, Production deployments, open defects, holds, test counts and next exact action belong in `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

Update that file at meaningful checkpoints and before context loss. Do not duplicate transient state here.

`docs/PROJECT-HEALTH-DASHBOARD.md`, `docs/PLATFORM-ISSUE-REGISTRY.md` and dated handoffs are evidence/supporting operational views; they may not redefine the Master.

## 9. Evidence language and review discipline

- Distinguish observed fact, evidence-backed conclusion and hypothesis.
- Do not present a hypothesis as root cause.
- Review the current PR HEAD, not stale bot comments.
- A reviewer finding must be fixed, proven pre-existing/out-of-scope with evidence, or explicitly dispositioned; never silently ignored.
- High-risk work requires independent review appropriate to the risk and the Master §27 verification model.

## 10. Controlled mutation boundaries

Documentation and read-only investigation do not authorize Production/schema/migration/backfill, destructive Production/R2, environment/credential, manual cron/reconciliation, shared-branch force/rebase or manual Production deployment actions.

A held mutation freezes only that mutation. Safe unrelated work may continue.