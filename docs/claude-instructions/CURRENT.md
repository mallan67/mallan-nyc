# CURRENT — CLAUDE CONTINUATION DIRECTIVE

> **Status/instructions only.** Product architecture is owned only by `MALLAN-PLATFORM-MASTER-PLAN.md`. This file tells Claude where to resume and what not to reopen after context loss.

**Repository:** `mallan67/mallan-nyc` only  
**Authorized local checkout:** `C:\Users\MayaAllan\Desktop\mallan-nyc`  
**Documentation authority branch:** `agent/publish-mallan-platform-master-plan-2026-08-04` / PR #595  
**Date of this directive:** 2026-09-03


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

## 0. Start rule — verify before mutation

Before any local mutation:

1. verify repository root, remote, branch, HEAD, status and worktrees;
2. read `MALLAN-PLATFORM-MASTER-PLAN.md` completely;
3. read `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`;
4. read this file;
5. refresh the live GitHub PR/head/main/deployment identities rather than trusting stale prose;
6. do not restack/rebase/force-push shared work without Maya's explicit authorization.

Old chats, audits, PR descriptions and temporary evidence are evidence only. They do not replace the master or current live Git/runtime/provider truth.

## 1. Canonical architecture

Always:

`COTALITY RAW CONTRACT → VERIFIED COTALITY MAPPING → MALLAN STORAGE / PROJECTION → MALLAN BUSINESS RULE → CRM / SEARCH / LISTING / CMA / REPORT / PUBLIC CONSUMER`

Cotality is the current external property/provider authority. REBNY/RLS/UCBA remain compliance/use/display boundaries. RESO is provider-schema vocabulary, not a second Mallan business authority.

No duplicate business truth. Reuse canonical models/readers/writers before creating anything parallel.

## 2. PRIMARY ACTIVE LANE — SEARCH

Search remains the primary continuous implementation lane. Agent onboarding work is separate and must not interrupt or restack Search.

### Current Search PR

- PR: **#618** — open, draft, unmerged.
- Branch: `fix/neon-p0-event-driven-wake-2026-08-16`.
- Latest independently verified Search head at this directive: **`2d55ce6a528adbeaf64584f031aa3711dd8be6bb`**.
- PR base remains `fix/neon-r2-closure-clean-2026-08-19` at the old stack base; do not restack onto the moving Neon/R2 lane without Maya authorization.
- Search is Preview-only until separately authorized for Production integration/deployment.

### Closed Search layers — do not reopen without new contradictory behavioral evidence

- **§4 Canonical Criteria / Transport — CLOSED** at `939884e15ec8447988c7fb791a8978fb8676f3a4`.
- **§5 Registry → Executor Authority — CLOSED** at `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`.
- **Bounded public-Search correctness sub-lane discovered during §6 — ACCEPTED/CLOSED** at `2d55ce6a528adbeaf64584f031aa3711dd8be6bb`.

The accepted public corrections include final-universe-before-pagination behavior, return-copy suppression, Open House fail-closed behavior, correct numeric bathroom semantics and removal of the redundant exclusives injection that could broaden a correct empty answer into a wrong non-empty answer.

Do not keep auditing public Search merely because it was touched. Reopen only for a newly proven behavioral regression.

### ACTIVE NOW — authenticated §6

**§6 FINAL UNIVERSE / COUNT / PAGINATION TRUTH — ACTIVE.**

Required chain:

`canonical criteria → Cotality candidates → Mallan listing authority / return-copy suppression → eligibility / identity → dedupe → complete-corpus Mallan filters → deterministic global sort → final count/completion state → pagination → result/workbench consumers`

Known closure targets must be handled as one impact group, not an endless sequence of isolated patches:

- selection persists across pagination/views by canonical Listing identity;
- sorting operates on the complete result universe, never only the loaded page;
- reports cannot label one page as `All Results`;
- status/removal/compliance filtering cannot punch page holes or leave totals describing a different population;
- browser-side compliance cannot independently change membership after count/pagination;
- `countMeaning=exact` is emitted only when genuine completion/exhaustion is proven;
- complete-corpus criteria such as Sponsor Unit / Maximum Financing execute over the complete eligible universe or explicitly refuse;
- averages/statistics state the population they describe and never present page-only analysis as market-wide truth;
- Search Within Results must be real or removed/disabled rather than remaining a dead control.

### Continuous Search sequence after §6

Do not stop merely because a numbered section closes. Continue safe work directly through:

1. **§6** authenticated final universe/count/pagination;
2. **§7** complete Sale + Rental Search workflows;
3. **§8** Map + Saved Search + Workbench/selection/client actions;
4. **§9** Compare + Reports + CMA on the corrected Search universe;
5. **§10** authenticated desktop/tablet/mobile browser E2E closure.

Search is not complete before §10 proves:

`login → criteria → Basic↔Advanced → execute → truthful count → global sort → paginate → detail → return → Map → Search Within Results/Map → Saved Search → reload/restore → selection → client action → Compare → Report → CMA input → attribution/compliance`

Use grouped targeted development tests. Establish the complete impact graph before declaring a defect closed. Green source-string tests are not sufficient behavioral proof.

## 3. SECONDARY INDEPENDENT LANE — AGENT ROSTER / ONBOARDING / ACCESS

This lane is a real brokerage requirement because an active Agent must be able to be onboarded, authenticated and represented correctly without browser-console work. It may proceed in a separate branch/chat, but **must not derail Search**.

### Canonical identity and role rule

The canonical runtime Agent is the existing Prisma `Agent` record. Do not create another Agent/contact/auth database.

Professional license classification and authorization role are different:

- Licensed Real Estate Salesperson → authorization role normally `AGENT`;
- Licensed Real Estate Associate Broker → authorization role normally `AGENT`;
- Principal/Representative Broker administrative authority → `BROKER`.

Associate Broker status must never automatically grant Principal Broker/admin permissions, and an Associate Broker must never be displayed as a Salesperson because the authorization role is `AGENT`.

### Proven/current Agent Roster defects to close

1. **Add Agent form silently drops visible inputs.** The existing CRM modal collects more fields than its submit payload persists. Visible fields must either map to a canonical owner or be clearly unavailable/disabled; no silent data loss.
2. **License form/API contract is inconsistent.** The UI's Associate Broker selection does not currently map safely to the canonical license classification/title and can degrade to Salesperson presentation.
3. **Create and public-profile contract are incomplete.** A newly created DB Agent can override a correct static profile while missing title/bio/photo/languages/specialties/public slug. Creation must persist the complete governed profile required by downstream readers.
4. **`Send Invite` is not a trustworthy transaction.** Current behavior can create the Agent record and then report an email/invite failure. The UI must distinguish account creation from invite-delivery state, never claim `sent` without delivery-provider handoff, and a retry must resend the invite rather than create another Agent.
5. **Invite deliverability is unproven.** A current invite reached spam and surfaced an error. Deliverability and actual password-setup/login must be proven end to end before onboarding is called complete.
6. **`Save Draft` semantics are false if it creates `status=active`.** Either implement a true non-active draft state using the existing canonical model/allowed states, or remove/rename the control. Do not call an active account a draft.
7. **Two Agent create writers exist.** `/api/crm/agents` and `/api/auth/agent/register` must not remain competing Agent-creation authorities. Establish one canonical creation owner and retire/delegate the duplicate path without creating another model.
8. **Deactivate is not Delete Permanently.** Existing `DELETE /api/crm/agents/[id]` is soft deactivation: status inactive + session removal + audit. Keep this as normal brokerage offboarding.
9. **A mistake-rollback hard delete is missing from the CRM.** Delete Permanently is required only for erroneous/never-used records and must be broker-only, dependency-previewed, audited, atomic and fail closed when business/history evidence exists.
10. **Public profile authority is split.** `/agents` and sitemap use active DB Agent records, while an individual profile can fall back to `data/agents.json` when no active DB Agent is found. Deactivation/deletion must not accidentally leave a ghost public profile. Static JSON is seed/fallback evidence, not a competing live professional-identity authority.
11. **Agent sign-in and Broker admin login are distinct.** Ordinary Agents use `/sign-in` and route to `/crm/dashboard`; `/admin/login` is Broker-only. Do not give Associate Brokers the Principal Broker role merely to make login work.
12. **No console/cookie/password workflow.** Onboarding and cleanup must be operable from governed CRM/server paths. Never ask Maya to paste session cookies, tokens or passwords into chat/console.

### Permanent-delete implementation evidence — not yet Production authority

User-provided local execution evidence reports a bounded branch:

- local branch: `feat/agent-permanent-delete-2026-09-01`;
- local commit: `5c7ef52e8096fc6e7b91552e4b22f66013637fc5`;
- based from then-current main `2a83952a31c7aaa9367141763c1685269c51c380`;
- implements read-only purge preview + atomic purge route + dependency policy/tests;
- reported tests: 28 new purge tests, 292/292 across Agent suites, type-check/compliance/UCBA/RLS green;
- **reported as unpushed at handoff**.

Treat this as **LOCAL / USER-PROVIDED IMPLEMENTATION EVIDENCE ONLY** until the commit is actually present on GitHub and independently reviewed. Do not claim it is merged, deployed or Production-proven.

No Production purge is authorized merely because this implementation exists. R2 cleanup is separately authorization-gated.

### Required Delete Permanently behavior

Normal offboarding = **Deactivate** and preserve history.

Mistake rollback = **Delete Permanently**, only when all required conditions pass:

- refuse self;
- refuse any authorization `role=BROKER` target;
- refuse anyone who has ever logged in;
- preview/recount all Agent FK and loose/polymorphic identity references;
- any legitimate deal/client/listing/CMA/document/task/marketing/commission/protected-period/actor-attribution/business history blocks deletion;
- onboarding/audit events written *about* the erroneous Agent record by broker/system may survive and do not by themselves prove that target acted;
- Session/MFA artifacts may be removed as ephemeral auth state;
- no cascade deletion of brokerage history merely to make an Agent delete succeed;
- final recheck + ephemeral deletion + Agent deletion + purge AuditEvent occur atomically in one transaction;
- purge AuditEvent retains an immutable identity/dependency snapshot;
- static public-profile presence is reported but is not silently modified by DB purge;
- R2 media is report-only unless separately authorized.

## 4. Current main / Production integration boundary

At this directive, independently verified `main` is:

`2a83952a31c7aaa9367141763c1685269c51c380`

That main includes the merged Agent-profile work from PR #626. Search PR #618 is still separate and unmerged.

Do not repeatedly rebase Search while it is moving. Finish the current Search closure checkpoint, then perform one controlled integration against then-current main with exact combined-tree proof before any Production Search deployment.

## 5. Mutation boundaries

Safe work may continue without stopping for routine implementation/tests/docs inside the active authorized lane.

Stop and obtain explicit Maya authorization before:

- schema/migration/backfill;
- direct Production Neon/DB mutation;
- destructive Production cleanup;
- R2 mutation/deletion;
- environment/credential change;
- force-push/squash/rebase of shared branches;
- manual Production deployment/alias change;
- any newly discovered architectural contradiction that cannot safely fit the existing canonical model.

A held mutation freezes only that mutation. Continue safe unrelated work.

## 6. Closure model

For Search, Agent Roster and every material feature use:

`Proven defect → root cause → all affected readers/writers → correction → direct tests → negative tests → integration/persistence → downstream consumers → compliance → Preview/runtime proof → Production proof when authorized`

Forms additionally require:

`create → save → reload → edit → save → reload`

No silent data loss. No parallel truths. No claim of `done` merely because CI is green.
