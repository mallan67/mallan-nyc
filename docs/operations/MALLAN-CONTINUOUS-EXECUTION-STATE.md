# MALLAN CONTINUOUS EXECUTION STATE

> **STATUS ONLY.** This file does not define product architecture or requirements. The sole product/system authority is `MALLAN-PLATFORM-MASTER-PLAN.md`. `docs/claude-instructions/CURRENT.md` is the active continuation directive. This file records what is closed, active, open and held so a new session does not restart the program or repeat already-proven work.

**Checkpoint date:** 2026-09-03  
**Repository:** `mallan67/mallan-nyc` only  
**Authorized local checkout:** `C:\Users\MayaAllan\Desktop\mallan-nyc`


## SECTION 27 IS IN FORCE — READ THIS BEFORE ANYTHING BELOW

**`# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL` is now present in
`MALLAN-PLATFORM-MASTER-PLAN.md` at `4edfc300e6a417224a4ba10c9e04c23c3c03111c`
(PR #595).** It is normative. Where anything further down this file disagrees
with it, Section 27 wins and the older text is stale status, not instruction.

- **Baseline A (2026-09-02) is the frozen Production recovery baseline:**
  observable structural coherence **46/100**, exercised functional Production
  **42/100**, **0 of 13** brokerage-critical capabilities fully proven. These are
  regression signals, not a definition of done.
- **Execution model: Coordinator + Builder + independent black-box Verifier.**
  Maximum three agents. The Verifier is read-only and does not read the
  Builder's implementation, PR narrative or test claims before acceptance.
  A release may not be self-certified by whoever built it.
- **One branch = one writer.** No other session pushes to a branch that already
  has an owner.
- **#627 is the ONLY active implementation packet** — the first bounded
  release-process proof, at `99543f128fbba8b923eb2c088a039a1753da1600`.
- **#618 feature expansion is FROZEN at `d19c03cdd3c12826d02f04d6462e2edbcc8186ef`.**
  It is preservation/convergence work. The 229-commit / 310-file branch is NOT a
  wholesale deployment candidate and is not to be rewritten from zero either.
- **#620 is preservation/convergence work, not a generic Neon restart.** Prior
  forensics are reused; residual work begins from the measured delta only.
- **Rental intake is the immediate canonical Listing writer checkpoint**, after
  or alongside Agent runtime closure: `create -> save -> reload -> edit -> save
  -> reload` with no silent field loss, third-party Cotality read-only.
- **No Production, schema, migration, Neon, R2 or environment mutation is
  authorized by any documentation change.** That authorization is Maya's alone
  and is given per operation.

Everything below this block predates 2026-09-02 and is retained as history.
Do not treat an older "ACTIVE" or "next action" line as current instruction.

## 0. Hard start rule

Before local mutation, record:

1. `pwd`
2. `git rev-parse --show-toplevel`
3. `git remote get-url origin`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git status --short`
7. `git worktree list`

If the repository/worktree is not the authorized Mallan checkout, stop mutation work. Do not silently switch to a different clone/worktree.

## 1. Authority order

1. `MALLAN-PLATFORM-MASTER-PLAN.md` — single product/system authority.
2. `docs/claude-instructions/CURRENT.md` — current continuation/execution instruction.
3. This file — status/checkpoint only.
4. `AI-START-HERE.md` — startup/proof protocol.
5. Current code, exact SHA/diff, tests/CI, Preview/runtime, Cotality and authorized Production evidence.
6. Historical chats/audits/PR prose/temporary ledgers — evidence only.

No new master audit is created after context loss. A closed layer reopens only when new evidence invalidates a proven invariant.

## 2. Current program and priority

Mallan remains one brokerage operating system. The immediate implementation priority is:

1. **Search — ACTIVE P0, finish end to end**
2. CMA / Property Intelligence
3. Backend Listing / Opportunity Workspace
4. Marketing / E-blast / Listing Reporting
5. Decision / Calculators / System Intelligence
6. Communications / Documents / Agreements / Offering Plans / Deal Support
7. Seller / Landlord / Buyer / Tenant / Investor end-to-end journeys
8. Agent Support / Brokerage / Money / Technology governance
9. Future Mallan → provider publishing
10. Historical retirement / final Production proof

A separate bounded **Agent Roster / onboarding / access** lane is active because the brokerage now needs reliable real-Agent access. It may proceed independently, but it must not interrupt/restack Search.

## 3. Current Git/runtime identities — refresh before relying on them

### Main / Production

Last independently verified `main`:

`2a83952a31c7aaa9367141763c1685269c51c380`

That merge includes PR #626 Agent-profile work. Last independently verified Production deployment for that main:

`dpl_2xwQdeEuSV8Uc7Bcui8pKKARbckq`

Refresh both before any later Production claim.

### Documentation authority

- PR **#595** — draft, open, unmerged.
- Branch: `agent/publish-mallan-platform-master-plan-2026-08-04`.
- This branch owns the Master Plan, this execution state and `docs/claude-instructions/CURRENT.md`.

### Search

- PR **#618** — open, draft, unmerged.
- Branch: `fix/neon-p0-event-driven-wake-2026-08-16`.
- Latest independently verified Search head at this checkpoint:
  `2d55ce6a528adbeaf64584f031aa3711dd8be6bb`.
- Exact accepted public-Search Preview:
  `dpl_BSPgzafUMu6cU7Nfu8XH5DU7dCkr` — READY / Preview.
- Search remains separate from `main` and is not Production-deployed from this PR.
- Do not restack/rebase #618 onto #620 or another moving lane without Maya's explicit authorization.

## 4. Search — completed durable layers

### §4 Canonical Criteria / Transport — CLOSED

Closure SHA:

`939884e15ec8447988c7fb791a8978fb8676f3a4`

Established invariants include:

- canonical SaleCriteria / RentalCriteria / BuildingCriteria / ComparableCriteria;
- Basic and Advanced are views of one canonical workflow state;
- DOM → canonical → DOM with no second competing reconstruction;
- arbitrary range values and clear semantics survive round-trip;
- Sponsor Unit and Maximum Financing transport/refusal semantics;
- canonical bathroom value = `BathroomsFull + 0.5 × BathroomsHalf`; `BathroomsTotalInteger` is not the canonical numeric bathroom truth.

Do not reopen without new contradictory behavioral evidence.

### §5 Registry → Executor Authority — CLOSED

Functional closure SHA:

`8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`

Follow-up documentation/test-hardening commits included:

- `02acd6e6b17a4c5277fce005af9cf8a2966ed0e5`
- `eb52724542d67a6bb6b513cc3d8e589013d6410f`
- `60e855219dd95c0c23bc425ce91fea4e51c1ceea`

Established invariants include lossless repeated neighborhood query parameters, literal provider commas surviving transport, explicit borough-disambiguation, no hidden plurality/5% borough cutoff, browser/server resolver parity and Saved Search/Map fail-closed behavior for ambiguous/unknown/impossible geography.

Do not reopen without new contradictory behavioral evidence.

### Public Search correctness sub-lane found during §6 — CLOSED

Accepted closure SHA:

`2d55ce6a528adbeaf64584f031aa3711dd8be6bb`

The bounded public-Search work corrected proven membership/count/pagination/compliance defects without redesigning the public Search UI. Durable corrections include:

- result membership settled before final count/pagination;
- Mallan Cotality return-copy suppression restored to the public DB reader;
- Open House complete-enough/fail-closed behavior rather than page-local fail-open broadening;
- public bathrooms use the canonical Full + 0.5 Half semantics on both DB and live-provider paths;
- the redundant `mergeExclusiveListings` fallback injection was removed because it could re-add rows the full criteria had already rejected;
- the IDX-disabled local-only path now fails closed on criteria it cannot evaluate rather than answering a looser question.

Pinned wrong-answer probes that exposed the final defect changed from one injected result to zero for both:

- `maxBaths=1.5` against a 2.0-bath pinned listing;
- impossible `minSqft=99000` against that same listing.

Genuine Mallan exclusives remained available through the canonical DB path.

Performance remained within the accepted profile; representative medians were approximately sale 1.01s, Manhattan 0.78s, keywords 3.57s on the accepted Preview.

Local reported suite at the final public closure tree: 9,281 passing with the same five pre-existing/untracked-WIP failing suites. Validators: compliance 95/95, UCBA 46/46 with zero regressions, RLS unknown 0, IDX 1,277 pass / 0 critical.

CI reporting rule: the `release-truth` **check run** completed successfully, while a commit-status layer may remain `pending` by design when runtime/deploy proof is fail-closed. Report these separately; never compress them into a misleading `all green` statement.

Do not reopen this public sub-lane merely because later authenticated Search work touches shared contracts.

## 5. Search — ACTIVE and open

### §6 Authenticated final universe / count / pagination — ACTIVE

Required chain:

`canonical criteria → Cotality candidates → Mallan listing authority / return-copy suppression → eligibility / identity → dedupe → complete-corpus Mallan filters → deterministic global sort → final count/completion → pagination → workbench consumers`

Known closure targets to prove together:

- selection persists across pagination and view changes by canonical Listing identity;
- sorting is global/server-authoritative and never page-local;
- reports cannot label a loaded page as `All Results`;
- status/removal/compliance filtering cannot create short/empty page holes while totals describe another population;
- browser-side compliance cannot independently change membership after the server count/slice;
- `countMeaning=exact` only when genuine completion/exhaustion is proven;
- complete-corpus filters such as Sponsor Unit / Maximum Financing either execute over the complete eligible universe or explicitly refuse;
- averages/statistics explicitly identify their population and never present page-only values as full-market analysis;
- Search Within Results must become a real secondary filter over the authoritative Search snapshot or be removed/disabled.

Do not patch these one by one without first tracing the common result-universe readers/writers.

### Remaining Search sequence after §6

**§7 — Sale + Rental Search**

Prove both separate workflow contracts end to end:

`Basic ↔ Advanced → canonical criteria → execute → truthful results → global sort → paginate → detail → return`

No Sale/Rental criterion leakage. Unknown remains unknown. Unsupported/unverified provider semantics fail visibly rather than being fabricated.

**§8 — Map + Saved Search + Workbench**

One universe/state drives Grid, Gallery, Summary, Master/Detail and Map. Map does not invent exact points from approximate geography. Saved Search must prove:

`create → save → reload → restore canonical criteria → restore UI → execute with same meaning`

Selection and client actions persist by canonical Listing identity.

**§9 — Compare + Reports + CMA**

Compare/Reports/CMA consume the authoritative Search snapshot and selection. Reports must use real server delivery/delivery state. Sale CMA uses verified ClosePrice/CloseDate for Closed valuation evidence. Rental CMA may not invent achieved rent.

**§10 — authenticated browser E2E closure**

Mandatory desktop, tablet and mobile proof for Sale + Rental:

`login → criteria → Basic↔Advanced → execute → truthful count → sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload/restore → select → client action → Compare → Report → CMA input → attribution/compliance`

Search is not complete until §10 closes.

## 6. Agent Roster / onboarding / access — independent active lane

State: `ACTIVE — SEPARATE FROM SEARCH`

The canonical runtime Agent is the existing Prisma `Agent`. Do not build another Agent/contact/auth truth.

### Completed / established Agent facts

- Professional license classification is distinct from authorization role.
- Licensed Real Estate Associate Broker is a professional/license classification; normal CRM authorization remains `role=AGENT` unless the person is explicitly the Principal/Representative Broker.
- PR #626 merged Agent-profile/title corrections to main at `2a83952a...`.
- Existing CRM Agent Roster has an Add Agent modal wired to `POST /api/crm/agents`.
- Existing `DELETE /api/crm/agents/[id]` is a **soft Deactivate**, not a database hard-delete: it sets status inactive, removes sessions and records audit history.
- Ordinary Agents authenticate through `/sign-in` and route to `/crm/dashboard`; `/admin/login` is Broker-only.

### Open Agent Roster defects

1. Add Agent displays inputs that the submit payload does not persist — silent data loss.
2. Associate Broker form values do not map reliably to the canonical license/title contract and can display the Agent as a Salesperson.
3. Creation does not carry the complete public professional profile contract; an incomplete DB row can override a correct static fallback profile.
4. `Send Invite` is not a trustworthy atomic/observable workflow: account creation may succeed while invite/email reports an error.
5. Invite delivery/deliverability is not proven; one current invite reached spam and the UI surfaced an error.
6. Retry must resend/recover invitation state, never create a second Agent.
7. `Save Draft` is false if it calls the same create route that sets the account active; implement a true draft/non-active behavior using the existing model if supported, or remove/rename the control.
8. `/api/crm/agents` and `/api/auth/agent/register` are competing Agent-creation writers; establish one canonical create owner and delegate/retire the duplicate path.
9. CRM has Deactivate but no governed **Delete Permanently** mistake-rollback action.
10. Public profile authority is split: active DB Agent drives directory/sitemap while individual profile may fall back to static `data/agents.json` when no active DB row is found. Deactivation/deletion must not leave a ghost public profile.
11. Onboarding must never require browser DevTools, session cookies, tokens or manually pasted JavaScript.

### Delete Permanently contract

Normal business offboarding = **Deactivate** and preserve brokerage history.

Permanent deletion = **mistake rollback only** for an erroneous/never-used record. It must:

- be Broker-only;
- refuse self;
- refuse authorization `role=BROKER` targets;
- refuse anyone who has ever logged in;
- preview/recheck all FK plus loose/polymorphic Agent identity references;
- refuse if any legitimate deal/client/listing/CMA/document/task/commission/protected-period/actor-attribution/business history exists;
- preserve onboarding/audit evidence written *about* the bad Agent record by broker/system without treating those events as evidence the target conducted brokerage activity;
- remove only ephemeral auth artifacts such as Session/MFA as part of the purge;
- never cascade-delete brokerage history merely to make the Agent delete succeed;
- perform final recount + ephemeral cleanup + Agent delete + purge AuditEvent atomically in one transaction;
- preserve an immutable target identity/dependency snapshot in the purge AuditEvent;
- report static public-profile/R2 remnants but not silently modify Git or R2;
- keep R2 deletion behind separate explicit authorization.

### Local hard-delete implementation evidence — NOT closed

User-provided/local Claude handoff reports:

- branch: `feat/agent-permanent-delete-2026-09-01`;
- local commit: `5c7ef52e8096fc6e7b91552e4b22f66013637fc5`;
- based on then-current main `2a83952a...`;
- files include a declarative Agent purge policy, read-only preview route, atomic purge route and runtime tests;
- reported proof: 28 new purge tests, 292/292 across 22 Agent suites, type-check clean, compliance 95/0, UCBA zero regressions, RLS zero errors.

**State: `IMPLEMENTED LOCALLY — UNVERIFIED / UNPUSHED AT HANDOFF`.**

Do not represent this as GitHub-durable, merged, Preview-proven or Production-proven until the branch/commit is actually pushed and independently reviewed.

No Production purge is authorized by this checkpoint.

### Agent Roster next sequence

In the separate Agent lane:

1. push the hard-delete branch without rewriting Search;
2. independently review exact diff/tests and Preview behavior;
3. add the governed CRM `Delete Permanently` control with dependency preview/email confirmation/double-submit protection;
4. correct Add Agent field persistence and Associate Broker mapping;
5. consolidate Agent creation to one canonical writer;
6. turn invite/password setup into a durable, retryable workflow that reports account state and delivery state separately;
7. correct public-profile authority so deactivation/deletion cannot create ghost profile behavior;
8. prove `create → save → reload → edit → save → reload → invite/password setup → login → roster/public profile/sitemap`;
9. obtain separate authorization before any Production purge or other destructive Production mutation.

## 7. Other open/held work carried forward

These remain real but do not preempt Search unless new evidence proves a direct dependency or Production safety issue:

- PR #620 Neon/R2 closure lane and any Production deployment/runtime proof;
- R2 deletions/cleanup remain separately authorization-gated;
- schema/index/migration work remains separately authorization-gated;
- historical stale-summary/backfill reconciliation remains held where destructive/Production mutation is required;
- supplemental/private sale inventory and Schedule A requirements remain in the Master Plan, but implementation must follow source-rights/canonical-identity gates and must not derail the current Search closure sequence;
- Listing Workspace, E-blast, Reporting, Agreements, Offering Plans, Transactions/Money and referrals remain open downstream layers per the Master Plan.

## 8. Continuous closure model

Every material layer uses:

`Layer → Proven defect/claim → evidence needed → evidence obtained → root cause → affected readers/writers → correction → direct tests → negative tests → integration/persistence → downstream/compliance → Preview/runtime → Production proof when authorized → closure`

Allowed states:

- `ACTIVE`
- `CLOSED`
- `HELD`
- `UNVERIFIED`
- `IMPLEMENTED LOCALLY — UNVERIFIED`
- `ENVIRONMENT-UNEXERCISABLE`
- `EXTERNAL-BLOCKED`
- `SUPERSEDED`
- `REOPENED because <evidence>`

Forms additionally require:

`create → save → reload → edit → save → reload`

Green tests do not prove a workflow. Source-string assertions protect invariants but do not substitute for behavioral/runtime proof.

## 9. Mutation boundaries

Continuous engineering does not imply continuous Production mutation authority.

Explicit authorization is required before:

- schema/migration/backfill;
- direct Production Neon/DB mutation;
- destructive Production cleanup;
- R2 mutation/deletion;
- environment/credential change;
- force-push/squash/rebase of shared branches;
- manual Production deployment/alias change.

A held mutation freezes only that mutation. Continue safe unrelated implementation/tests/docs.

## 10. Compaction / handoff protocol

At every meaningful checkpoint update this file with:

- current branch/head/PR;
- current main and Production deployment where material;
- exact completed layer and closure SHA;
- active layer;
- exact open blockers;
- tests/CI/runtime/provider evidence;
- auditor ruling;
- controlled mutations still held;
- next exact action.

After compaction/new session:

1. read `AI-START-HERE.md`;
2. read the Master Plan;
3. read `docs/claude-instructions/CURRENT.md`;
4. read this file;
5. refresh Git/runtime/provider identity;
6. continue the active layer.

Do not restart from the beginning.

## 11. Last completed / current / next exact actions

**LAST COMPLETED SEARCH LAYER:** bounded public-Search §6 correctness sub-lane accepted at `2d55ce6a528adbeaf64584f031aa3711dd8be6bb`.

**CURRENT PRIMARY LAYER:** authenticated §6 final universe/count/pagination truth on PR #618.

**NEXT SEARCH ACTION:** reproduce/trace the remaining authenticated §6 selection/sort/report/count/compliance/exactness/complete-corpus/statistics/Search-Within-Results defects as one impact graph, correct root owners, prove them together, then continue directly to §7 unless a controlled authorization boundary is reached.

**CURRENT SECONDARY LANE:** Agent Roster/onboarding/access. Hard-delete implementation is reported locally at `5c7ef52e...` but remains unpushed/unverified. Its next action is push + independent review/Preview, while onboarding/create/invite/public-profile authority defects remain open.
