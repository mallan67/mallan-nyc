# CLAUDE.md — Claude Command Center · mallan.nyc

> Claude-specific operating instructions for `mallan67/mallan-nyc`.
>
> Product/business/system architecture is owned only by `MALLAN-PLATFORM-MASTER-PLAN.md`. Current execution state is owned by `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`. This file adds Claude-specific working discipline and may not redefine either.

## A. Start here

Before substantive work:

1. read `AI-START-HERE.md`;
2. read the affected Master sections, or the full Master for cross-system work;
3. read current execution state;
4. refresh exact Git/PR/runtime/provider facts as applicable;
5. read `AGENTS.md`;
6. read `NEON.md` before Neon/Prisma/database/storage/retention work;
7. read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before compliance-shaped work;
8. read `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` before creating/renaming/moving/editing canonical Search, CRM, listing, media, location or IDX structures.

Do not continue from stale chat memory, old PR prose or an old dated handoff when current Git/runtime/provider evidence is available.

## B. Repository and Git discipline

- Repository: `mallan67/mallan-nyc` only.
- Authorized local checkout: `C:\Users\MayaAllan\Desktop\mallan-nyc`.
- Before local mutation verify root, remote, branch, HEAD, status and worktrees.
- One branch/worktree has one active writer.
- Stage explicit intended paths only; do not use `git add -A` or `git add .`.
- Never skip hooks (`--no-verify`), bypass signing, amend a published commit, or force-push/rebase shared work without explicit authorization.
- Do not create `*-v2`, `*-new`, `*-final` parallel systems to avoid integrating the canonical implementation.
- Do not edit generated artifacts directly when a generator is the canonical writer.

If another session owns the branch or unrelated uncommitted work is present, stop mutation and reconcile ownership rather than carrying changes across silently.

## C. Absolute architecture rule

Always implement through:

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

Do not guess provider fields, enums, source rights, permissions, statuses, null semantics, attribution or media rules.

Cotality/Trestle is authoritative for its own provider contract/source facts. Applicable law/DOS, Fair Housing/advertising, REBNY/RLS/UCBA, Mallan-authored records and other verified sources retain their separate authority. RESO vocabulary is provider-schema language only.

## D. No duplicate truth

Reuse the existing canonical Party, Agent, Property, Listing, Search, Saved Search, Client history, CMA, Media, Document, Campaign, Deal, Commission, Referral, Task and workflow models/readers/writers where they can safely satisfy the business requirement.

Before proposing a new model/table/service, prove:

- the existing canonical owner cannot safely represent the fact/relationship;
- all current writers/readers/publishers are known;
- reconciliation/migration is explicit;
- downstream/compliance impact is known;
- direct/negative/integration proof is defined.

Difficulty is not evidence that a second system is justified.

## E. Compliance-first

If work touches public listings, Search, IDX/RLS/Trestle/Cotality, syndication, CRM Leads, intake forms, advertising/public text, broker attribution, Fair Housing, consent/privacy, media, portals, status/display gates or documents/forms, read the Compliance Canonical Index and the specialized authority it points to before mutation.

If the current rule is unclear, conflicting or absent, fail closed for the affected behavior and report the exact missing authority. Do not infer a legal/provider rule from memory or another MLS/source.

## F. Neon / Prisma / infrastructure

Read `NEON.md` before any Prisma schema/migration, `db push`, production migration, index/table/FK work, database-retention/shedding, keepalive/cron, branch or connection work.

Current Neon/Vercel identifiers, endpoints, branch counts, schedules and environment state must be refreshed from their current authoritative sources when relevant. Do not freeze stale infrastructure IDs or cron values into this command center.

No Production/schema/migration/backfill, destructive data/R2, environment/credential, manual cron/reconciliation or manual Production deployment action is authorized merely because documentation or code was edited.

## G. Proof-first and anti-loop execution

Use Master §27 for every material capability.

A change is not `fixed`, `done`, `production ready` or `optimized` because source changed, tests passed, CI is green, a PR exists/merged or a deployment completed.

Required closure shape:

```text
PROVEN DEFECT / REQUIREMENT
→ ROOT OWNER
→ ALL WRITERS + READERS + PUBLISHERS
→ CORRECTION
→ DIRECT TESTS
→ NEGATIVE TESTS
→ ROUND-TRIP / INTEGRATION
→ DOWNSTREAM
→ COMPLIANCE / SECURITY
→ EXACT PREVIEW / RUNTIME PROOF
→ INDEPENDENT VERIFICATION
→ MAYA BUSINESS ACCEPTANCE WHERE REQUIRED
→ AUTHORIZED PRODUCTION PROOF
```

Forms additionally prove:

```text
CREATE → SAVE → RELOAD → EDIT → SAVE → RELOAD
```

Do not patch one failing test at a time without first establishing the common impact graph. Do not silently weaken acceptance because implementation is difficult.

## H. Current-state ownership

Do not duplicate current PR numbers, SHAs, deployment IDs, test counts, open defects, holds or next actions here.

Use:

- `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` — current execution state;
- `docs/PROJECT-HEALTH-DASHBOARD.md` — operational evidence/reference;
- `docs/PLATFORM-ISSUE-REGISTRY.md` — issue/evidence registry;
- dated handoffs/audits — supporting evidence only.

A closed dependency reopens only when new evidence contradicts its proven invariant. A new session is not evidence.

## I. Cotality/provider changes

For a Cotality field/resource/picklist change, trace the full affected path rather than patching one file:

```text
LIVE AUTHORIZED CONTRACT
→ QUERY / SELECT / EXPAND / FILTER
→ MAPPER
→ RAW / CANONICAL STORAGE
→ PROJECTION
→ BUSINESS RULE
→ DB + DIRECT PROVIDER READERS
→ SEARCH / FORM / LISTING / CMA / REPORT / MEDIA / PUBLIC CONSUMERS
→ TESTS / RUNTIME PROOF
```

A static reviewer can establish code-path facts but cannot establish live Cotality/provider truth, current REBNY rule changes or Production environment state. Verify those separately.

## J. Validation discipline

Run the current repository validators/tests appropriate to the files and business surface changed. Do not rely on stale hard-coded pass counts in documentation.

For compliance-shaped work, use the current scripts defined by the repository and Compliance Canonical Index, including the applicable type-check, RLS, compliance, UCBA, IDX and CRM/runtime suites.

State what each check proves and what it does **not** prove. Static validators never substitute for browser/runtime/provider proof.

## K. Handoff

At meaningful checkpoints and before context loss, update `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` with exact branch/head/PR, current main/Production identity where material, completed layer, evidence, blockers/holds and next exact action.

Do not create another status, master plan, handoff authority or duplicate current-state document.