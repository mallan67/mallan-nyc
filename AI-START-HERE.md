# AI START HERE — MALLAN NYC

Every Claude, Codex, ChatGPT or other agent working in this repository must begin here.

## Repository boundary

Work only in `mallan67/mallan-nyc` for this project. `Mallan-Integrated` is separate and must not be touched.

Maya's authorized local checkout is:

`C:\Users\MayaAllan\Desktop\mallan-nyc`

Before local mutation work, verify:

1. `pwd`
2. `git rev-parse --show-toplevel`
3. `git remote get-url origin`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git status --short`
7. `git worktree list`

If the active local root is another Mallan clone/worktree, stop mutation work rather than silently continuing elsewhere.

Do not use `git add -A` or `git add .` for Mallan work. Stage explicit intended paths only and review the staged diff.

## Required reading order — do not skip

1. [`MALLAN-PLATFORM-MASTER-PLAN.md`](./MALLAN-PLATFORM-MASTER-PLAN.md) — the **one and only product/system authority**.
2. [`docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`](./docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md) — current program, last completed proof, active layer and next exact action. **Status only; it may not redefine architecture.**
3. Resolve current Git state fresh: main SHA, active branch/head, PR state and worktree status.
4. Resolve current Production deployment/SHA fresh when the task touches deployed behavior. Do not reuse a stale PR body or prior-session claim as current Production truth.
5. [`AGENTS.md`](./AGENTS.md) — cross-agent constitution and non-negotiable rules.
6. [`docs/PROJECT-HEALTH-DASHBOARD.md`](./docs/PROJECT-HEALTH-DASHBOARD.md) — operational evidence/reference; it may not replace the master plan or continuous state.
7. [`docs/PLATFORM-ISSUE-REGISTRY.md`](./docs/PLATFORM-ISSUE-REGISTRY.md) — issue/evidence registry; reconcile conflicts against current code/runtime and the master plan.
8. Latest relevant dated operations/audit handoff only as supporting evidence. Do not restart the program from an old handoff.
9. [`NEON.md`](./NEON.md) before Neon, Prisma, migration, ingestion, retention, storage or shedding work.
10. [`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`](./docs/compliance/COMPLIANCE-CANONICAL-INDEX.md) before listing, search, CRM, lead, communication, media, public-text or compliance work.

Temporary ledgers and historical plans/specs/audits are evidence only. If they conflict with the current master, the master governs unless Maya explicitly changes it.

## Continuous-program rule

Do not start a fresh or parallel master audit merely because context compacted or a new session began.

After reading the files above:

1. compare fresh Git/Production identity to the last state recorded in `MALLAN-CONTINUOUS-EXECUTION-STATE.md`;
2. if the recorded state remains valid, continue the active/next layer;
3. if new evidence invalidates a closed layer, mark it `REOPENED because <reason>` and continue from that dependency;
4. if historical evidence reveals a still-valid missing requirement, reconcile it into the same master and reopen only the affected dependency;
5. update the continuous state at every meaningful checkpoint and before the session ends/compacts.

A held Production mutation freezes only that mutation. Continue all safe independent work.

## Current execution priority

The current active product layer is **Search P0**.

The program advances:

1. **Search P0** — prove/repair the professional Search contract, exhaustive Advanced desktop + Basic mobile parity, current Cotality/RLS field mappings, source authority, return-copy suppression/dedupe, exact final count/pagination, full Saved Search round-trip, Client × Listing history/comments/showings, new/price/status updates, Reconsider, reverse matching and Compare/CMA handoff;
2. **CMA / Property Intelligence** — same corrected Backend Search universe;
3. **Backend Listing Workspace** — full readable listing/media/detail plus Comment, Share/Email, CMA/Compare, Showing, Quick Add Open House and Refresh Listing;
4. **Marketing / E-blast / Listings Reporting**;
5. continue the remaining master-plan sequence.

Residual historical reconciliation continues as a **non-blocking evidence lane**. It is not a reason to hold Search until every old file/chat is classified.

Do not create a second Search/CMA/Listings plan.

## Search-specific truth rule

Search must not be “simplified” by reducing Advanced Search.

```text
BASIC = mobile presentation
ADVANCED = full professional desktop Search
```

Both use one normalized criteria truth.

Every visible criterion must be proven as `SUPPORTED`, deliberately `LOCAL / DERIVED`, or not rendered as an active criterion. Never leave a control visually active while silently ignored.

Exact Cotality/provider fields, types, picklists, null semantics, statuses, attribution and permissions must be verified from current authorized provider/RLS evidence before implementation claims are accepted.

## Proof-first operating rule

No agent may report `fixed`, `improved`, `optimized`, `production ready`, `CPU reduced`, `storage reduced`, `cache improved`, `media fixed`, `shedding reduced churn` or similar based only on prose, a local edit, tests, CI, a PR or a deploy.

For material changes require durable evidence appropriate to the claim:

- exact Git diff/files and SHA;
- critical defect RED-before/GREEN-after where feasible;
- reader/writer/cache/job/projection/downstream audit;
- exact deployment/runtime proof;
- current Cotality/provider evidence for provider-dependent claims;
- current Production data probes for data-dependent claims;
- before/after measured operational metrics for optimization claims.

If an optimization is expected to affect Neon CPU/compute, storage, cache, R2/media, shedding/retention or churn and the post-change metric does **not** improve, do not call it successful. Investigate why the expected effect is absent. Separate application correctness from operational savings.

Historical measurements must include their date/environment/source and may not be reused as current values.

## Independent verification requirement

Claude/Codex output is not final authority.

For important layers preserve separate fields in the continuous state:

- `CLAUDE / CODEX CLAIMED`
- `DURABLE GIT EVIDENCE`
- `CI / TEST EVIDENCE`
- `RUNTIME / PRODUCTION EVIDENCE`
- `PROVIDER / COTALITY EVIDENCE` where applicable
- `CHATGPT AUDITOR VERIFIED`

ChatGPT must independently challenge the available evidence before a critical layer is represented to Maya as fully proven.

## Brokerage operating rule

Mallan is one brokerage operating system with:

- **Brokerage View** for Maya's firm-level oversight/support;
- **My Business** for each producing independent contractor's own book of business.

Maya is one Individual acting as both representative broker and producer. Associate Brokers currently function as Agents/Producers unless a distinct supervisory appointment is deliberately added later.

Agents remain responsible for their personal professional obligations while Mallan supports/reminds/records/flags and the representative Broker retains required supervision of brokerage activity.

## Provider / compliance framing

Mallan's business/compliance authority is based on applicable New York law/DOS and REBNY/RLS/UCBA requirements plus the verified current provider implementation contract.

Cotality/Trestle technical metadata may use RESO vocabulary. That is provider schema language only; it does not make RESO a separate Mallan business authority.

Provider replacement must be handled through the provider adapter/rule-field registries rather than rewriting Mallan workflows.

## Handoff requirement

The durable handoff is `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`, not chat history.

Before a session ends or compacts, record at minimum:

- active Layer ID;
- branch/head SHA;
- PR;
- current main SHA;
- Production SHA/deployment when applicable;
- exact changes made;
- tests/CI;
- live/provider/data proof;
- ChatGPT audit status;
- last item completed;
- current blocker/held mutation;
- next exact action;
- newly discovered/reopened layers.

A future agent must be able to continue from that record without asking Maya to reconstruct what happened.
