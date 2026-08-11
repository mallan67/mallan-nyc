# MALLAN CONTINUOUS EXECUTION STATE

> **STATUS ONLY.** This file does not define product architecture or requirements. The sole product/system authority is `MALLAN-PLATFORM-MASTER-PLAN.md`. This file exists so Claude, Codex, ChatGPT and future agents can resume the same continuous program after context compaction without inventing a new plan or re-auditing already-proven work.

## 0. Hard repository boundary

Authorized project/repository: `mallan67/mallan-nyc` only.

Maya's authorized local checkout is:

`C:\Users\MayaAllan\Desktop\mallan-nyc`

Before local work, the operating agent must resolve and record:

1. `pwd`
2. `git rev-parse --show-toplevel`
3. `git remote get-url origin`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git status --short`
7. `git worktree list`

If the local repository root is not the authorized Mallan checkout, stop local mutation work. Do not silently switch to another Mallan clone/worktree.

## 1. Authority order

1. `MALLAN-PLATFORM-MASTER-PLAN.md` — only product/system authority.
2. This file — current execution/status pointer only.
3. `AI-START-HERE.md` — startup instructions.
4. Current code, tests, exact Git SHA, CI, deployment/runtime, Cotality/provider evidence and read-only Production evidence.
5. Historical audits/plans/PR prose — evidence/reference only; they do not redefine architecture.

Chat history is never the execution authority.

## 2. Current continuous program

**Program:** Mallan unified brokerage operating system.

**Current product sequence:**

1. Search — immediate P0
2. CMA / Property Intelligence — second
3. Backend Listing Workspace — third
4. Marketing / E-blast / Listings Reporting
5. Decision/Calculators/System Intelligence
6. Seller/Landlord/Buyer/Tenant/Investor end-to-end role journeys
7. Agent Support / Brokerage / Money / Technology governance
8. Future Mallan → current RLS provider publishing/reconciliation
9. Historical retirement and final end-to-end Production proof

These are layers of one program, not separate master plans.

## 3. Last completed durable work

**Last completed:** Product authority on draft PR #595 was updated to include:

- simple Brokerage View + My Business model;
- independent-contractor support/obligation boundary;
- correct public professional titles for Salesperson / Associate Broker / Broker profiles;
- Mallan-authored vs third-party Cotality vs Cotality return-copy source/authority rules;
- provider-independent REBNY/RLS technology governance;
- exhaustive Backend Agent Search with Basic/mobile and Advanced/desktop on one criteria contract;
- Client + Buyer/Tenant Opportunity-assigned Saved Searches;
- Client × Listing history, comments, viewed/shown/rejected state;
- auto-send for new listings plus verified price and material status changes;
- rejected/pass listings route to RECONSIDER instead of automatic resend;
- CMA as the second product layer using the same Backend Search/Property Intelligence universe;
- client-facing CMA/report source-listing-agent exclusion;
- Backend Listing Workspace as the third product layer;
- full readable listing detail with photo/media viewer;
- Share/Email, Comment, Showing, Compare/Add-to-CMA actions;
- Quick Add Open House for authorized Mallan-authored listings without reopening the full form;
- Refresh Listing / source reconciliation;
- Agent renewal reminders and transaction/payment-readiness reminders;
- Listing Reporting creator-only agent identity rule;
- regular REBNY/RLS/provider change monitoring and technology flags.

**Important honesty:** this does not by itself prove that every valid requirement from every earlier long-form plan/audit survived consolidation. A one-time reconciliation check remains ACTIVE below. No agent may claim `MASTER PLAN COMPLETE` until that reconciliation is evidenced.

## 4. Current active layer

**LAYER DOC-RECONCILE-001 — Master-plan completeness proof**

State: `ACTIVE`

Goal: prove the current single master contains all still-valid requirements from the earlier master-plan versions, Maya's subsequent corrections and applicable recovered requirements, while excluding superseded/incorrect requirements.

Required proof:

- compare current master to the immediately prior long-form master versions and valid requirement sources;
- inventory removed/changed requirements;
- classify each as `PRESERVED`, `SUPERSEDED`, `INVALIDATED`, or `MISSING — RESTORE`;
- restore every still-valid missing requirement into the same master file;
- do not create another product plan/addendum;
- update this state file with the exact reconciliation result.

After this closes, continue immediately to Search P0. Do not return to a new planning cycle.

## 5. Next exact implementation layer

**SEARCH-P0-001 — Prove and repair the professional Search contract**

Start after `DOC-RECONCILE-001` closes.

First execution sequence:

1. establish exact current main SHA, active branch/head and Production SHA;
2. inventory every current Advanced Search control/field;
3. map each visible criterion to the actual current Search request/engine/provider field or verified derivation;
4. identify silent unsupported/incorrect mappings;
5. prove current count/dedupe/pagination ordering;
6. prove current SavedSearch criteria support versus full Advanced Search;
7. prove Client assignment/recall/history paths and existing reusable models/routes;
8. produce RED-before evidence for each critical defect where feasible;
9. implement the smallest root correction on the existing canonical path;
10. audit readers/writers/caches/jobs/projections/client-send/CMA effects;
11. run exact tests plus independent contract review;
12. publish only under Maya's applicable authorization boundaries;
13. verify exact deployed SHA and defect-specific Production behavior;
14. update this state file; then continue to the next Search layer without a new plan.

## 6. Continuous-run state machine

Every layer must be recorded as:

`Layer ID → Claim → Evidence needed → Evidence obtained → State → Defect → Correction → Validation → Dependent impact → Production proof → Closure`

Allowed states:

- `ACTIVE`
- `CLOSED`
- `HELD`
- `UNVERIFIED`
- `ENVIRONMENT-UNEXERCISABLE`
- `EXTERNAL-BLOCKED`
- `SUPERSEDED`
- `REOPENED because <new evidence/change>`

Do not use vague `OPEN` or `later` as a final classification.

A closed layer is not re-audited merely because context compacted. It reopens only if a new diff, dependency change, Production regression or contradictory evidence invalidates its proof.

## 7. Compaction / restart protocol

At every meaningful checkpoint and before a long agent session is allowed to end, update this file with:

- current program;
- active Layer ID;
- exact branch;
- exact head SHA;
- relevant PR;
- current main SHA;
- exact Production SHA/deployment identity when applicable;
- last item completed;
- last proof obtained;
- current blocker/held mutation if any;
- next exact action;
- newly discovered layers;
- reopened layers and reason;
- items awaiting ChatGPT independent verification.

After context compaction or a new session:

1. read `AI-START-HERE.md`;
2. read the master plan;
3. read this file;
4. resolve current Git/main/Production identity fresh;
5. compare fresh identity with the last recorded state;
6. continue the active/next layer.

Do **not** restart from the beginning unless fresh evidence shows the recorded state is invalid.

## 8. Proof-first rule — no improvement by assertion

A change is not successful because Claude says it is fixed, code compiles, tests are green, a PR exists, or a merge/deploy occurred.

Every material change requires evidence appropriate to its claim.

### 8.1 Repository change proof

If a task claims code changed, require:

- exact changed files;
- exact diff/behavioral change;
- exact branch/head SHA;
- relevant tests tied to the changed contract;
- reader/writer/cache/job/projection impact audit where applicable.

**If the repo does not contain the claimed durable change, the change is not accepted.** Local/unpublished work is `UNVERIFIED` until durable Git evidence exists.

### 8.2 Functional proof

For a correctness fix, require the exact defect-specific behavior to change.

Prefer where feasible:

- RED-before;
- GREEN-after;
- negative/side-effect boundary;
- exact runtime/Production canary;
- current Production population/probe when the defect is data-dependent.

CI green is supporting evidence, not closure by itself.

### 8.3 Independent ChatGPT audit gate

Claude/Codex claims and ChatGPT verification are separate fields.

For every important layer record:

- `CLAUDE CLAIMED:`
- `DURABLE GIT EVIDENCE:`
- `CI / TEST EVIDENCE:`
- `RUNTIME / PRODUCTION EVIDENCE:`
- `PROVIDER / COTALITY EVIDENCE:` where applicable
- `CHATGPT AUDITOR VERIFIED:` YES / NO / PARTIAL

A critical layer may not be represented to Maya as fully proven until ChatGPT independently checks the available durable evidence. ChatGPT may not infer that Claude did not do something merely because it is absent from Git; non-Git work is instead classified `UNVERIFIED` until evidence is supplied.

## 9. Operational improvement proof — baseline → change → measured delta

Operational correctness and operational optimization are separate dimensions.

If a change claims improvement to Neon CPU/compute, storage, cache, R2, media, shedding/retention or churn, it must show a **before and after measurement**. If the expected metric does not improve after the change reaches the environment where the claim applies, the optimization is not closed; investigate the discrepancy.

Every measurement must carry:

- value;
- timestamp;
- environment;
- exact query/probe/source;
- relevant SHA/deployment;
- comparison baseline.

Historical numbers may not be reused as current constants.

### 9.1 Neon CPU / One Cycle

Track the actual available telemetry, including where implemented:

- `skip_neon`;
- `neon_touched`;
- `backlog_due`;
- freshness heartbeat;
- `external_state_unavailable`;
- `backlogPending`;
- actual Neon compute/CU usage when account-level metrics are available.

If Upstash/external state needed by the skip path is unavailable, **do not claim CPU reduction**. Classify CPU savings separately as `EXTERNAL-BLOCKED`/`UNVERIFIED` while continuing unrelated correctness work.

### 9.2 Neon storage

Track current Production measurements such as:

- database size;
- largest relevant tables/indexes;
- `listing_media` rows and storage size;
- stale-summary current population and new-drift population;
- any raw/history data targeted by a verified retention/shedding change.

A storage-reduction claim requires actual post-change bytes/rows or provider storage evidence, not merely deleted code or a cleanup script.

### 9.3 Cache / external state

For any cache optimization, identify the actual cache layer first (for example Vercel cache, Redis/Upstash or application cache) and capture the available pre/post evidence for:

- hit/miss or bypass behavior where observable;
- invalidation/revalidation correctness;
- stale-read risk;
- request/database-work reduction attributable to the change;
- external-state failures.

No invented cache metrics. If the environment does not expose the required metric, classify the optimization proof honestly and use the strongest available compensating evidence.

### 9.4 R2 / media

Track, where available and relevant:

- R2 storage/object counts;
- Class A/Class B operations when account metrics are available;
- referenced-media population;
- `missing_from_r2`;
- orphan candidate count versus protected referenced set;
- zero-usable-photo listings;
- hero/photo correctness;
- `r2_uploaded` / `r2_reused`;
- policy re-evaluated/readmitted/kept-parked/write-failed;
- backlog/inflow/convergence;
- nested proxy/media regressions.

R2/media cost controls must not suppress valid Cotality ingestion or valid display merely to make usage metrics look better.

### 9.5 Shedding / retention

Before claiming any shedding/retention improvement, first identify the **current canonical implementation** and its authority. Historical/local scripts are evidence only until reconciled to current main.

Then prove:

- exact data class eligible for shedding;
- before rows/bytes;
- rows/bytes actually removed or prevented after the authorized change;
- no required consumer became stale;
- cache/projection/reporting/compliance effects;
- pause/rollback/recovery behavior where applicable.

No destructive Production shedding/backfill is implied by this protocol; mutation authority remains separately controlled.

### 9.6 Churn

A churn reduction claim requires evidence that recurring unnecessary reads/writes/wakes/retries actually decreased while freshness/correctness stayed intact.

Measure the specific loop being changed rather than using a generic “system is quieter” statement.

## 10. Added-write / removed-write audit

For every material change:

- **removed write** → prove all readers remain fresh;
- **added write** → inspect triggers, background jobs, cache invalidation, retries, projections, reporting, audit, compliance and downstream consumers.

Root cause is not closed until both the invalid state is prevented and all existing consumers are protected.

## 11. Authorization boundary

Continuous engineering does **not** mean perpetual Production-mutation authority.

The agent may continuously investigate, audit, design, implement safe code/tests/docs within the authority Maya has granted for the run.

Production schema migrations, destructive data cleanup/backfills, environment/credential changes, manual R2 mutations, force-push/squash/rebase, manual Production deployment/alias changes and other controlled mutations require the applicable explicit authority.

A held mutation freezes only that mutation. All safe independent work continues.

## 12. Current proof debt / known evidence to carry forward

Claude's August 10 findings must be treated as claims/evidence to independently verify, not automatically accepted closure. In particular:

- R2 policy re-evaluation / re-admission work and PR #599;
- One Cycle currently reported as running frequently and CPU-savings telemetry requiring verification;
- distinction between application correctness and CPU savings;
- stale-summary new drift versus historical population;
- historical reconciliation design versus held Production backfill;
- media/R2 health measurements;
- any local/recovered work that was performed outside the authorized canonical checkout.

Do not discard these findings, but do not let them override fresh current-main/Production evidence.

## 13. Immediate completion target

`DOC-RECONCILE-001` closes only when the master-plan completeness matrix is recorded and all valid missing requirements are restored.

Then move directly into `SEARCH-P0-001` and keep this file current as the durable continuation pointer.