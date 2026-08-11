# AI START HERE — MALLAN NYC

Every Claude, Codex, ChatGPT or other agent working in this repository must begin here.

## Repository boundary

Work only in `mallan67/mallan-nyc` for this project. `Mallan-Integrated` is separate and must not be touched.

Maya's authorized local checkout is:

`C:\Users\MayaAllan\Desktop\mallan-nyc`

Before local mutation work, verify the actual checkout/root/remote/branch/HEAD/status/worktrees. If the active local root is another Mallan clone/worktree, stop mutation work rather than silently continuing elsewhere.

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

## Continuous-program rule

Do not start a fresh or parallel master audit merely because context compacted or a new session began.

After reading the files above:

1. compare fresh Git/Production identity to the last state recorded in `MALLAN-CONTINUOUS-EXECUTION-STATE.md`;
2. if the recorded state remains valid, continue the active/next layer;
3. if new evidence invalidates a closed layer, mark it `REOPENED because <reason>` and continue from that dependency;
4. update the continuous state at every meaningful checkpoint and before the session ends/compacts.

A held Production mutation freezes only that mutation. Continue all safe independent work.

## Current execution priority

The single program currently advances in this order:

1. one-time master-plan completeness reconciliation;
2. **Search P0** — professional Search contract, full Advanced criteria, mobile Basic parity, exact filtering/count/pagination, Client-assigned Saved Searches, Client × Listing history/comments and new/price/status auto-updates;
3. **CMA / Property Intelligence** — use the same corrected Backend Search universe;
4. **Backend Listing Workspace** — full readable listing/media/detail plus Comment, Share/Email, CMA/Compare, Showing, Quick Add Open House and Refresh Listing;
5. continue the remaining master-plan sequence.

Do not create a second Search/CMA/Listings plan.

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

- `CLAUDE CLAIMED`
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