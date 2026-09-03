# MALLAN CONTINUOUS REPAIR PROGRAM — 2026-09-02

**Status:** Active recovery-control document subordinate to `MALLAN-PLATFORM-MASTER-PLAN.md`.

This is **not** a second product/system plan. The Master Plan remains the sole product/system authority. This document controls how the current Production recovery is executed and verified so implementation converges into one working Mallan brokerage system instead of repeating audit → patch → green tests → broken browser loops.

## 1. Frozen Production recovery baseline

The 2026-09-02 public/provider Production audit is the recovery baseline until superseded by a deliberately run authenticated Baseline B.

Frozen headline:

- observable structural coherence: **46/100**;
- exercised functional Production: **42/100**;
- proven functional deficiency on exercised scope: **~58%**;
- brokerage-critical capabilities fully proven: **0 of 13**;
- authenticated brokerage functionality remains materially **UNPROVEN** until exercised with an authorized database-backed runtime.

The score is a regression signal, not a completion target. A higher score never substitutes for behavioral proof. A lower score or regression of a previously working behavior blocks closure.

## 2. Recovery facts that must not be lost

Baseline A and the current Git evidence establish these current conditions:

- Production contains simulated/false-success behavior in important served workflows; a control may not claim send/submit/success unless the real server action and durable outcome occurred.
- Unknown facts must remain unknown. Missing values may not silently become `$0`, `0`, `Manhattan`, `true`, or a fallback result set.
- Public Search has proven result-universe defects including ignored/fallback criteria and count/filter/pagination inconsistency. Backend Agent Search runtime remains unproven until authenticated execution.
- Listing identity is not consistently reconciled across Mallan-authored inventory and provider return copies; the same real listing must resolve to one canonical Mallan identity.
- Open House, media and map defects must be corrected against the same canonical listing/property universe rather than patched screen by screen.
- Public soft-404/directory-index behavior and wrong professional identity are Production truth/compliance defects, not cosmetic defects.
- Claudia Milkowski must resolve as one canonical Agent with the exact public designation **Licensed Real Estate Associate Broker** when `license_type=broker` and `role=AGENT`.
- Provider absence is not permission to invent a Mallan fact. Every fact resolves as provider-served, Mallan-stored, Mallan-derived from a named authority/derivation contract, or unsupported/not provided.

## 3. Current branch disposition — convergence before more expansion

The existing large draft branches are preserved as engineering evidence/work; they are not automatically deployable units.

### PR #627 — Agent lifecycle

Use as the first release-process proof because it is bounded and directly based on current `main`.

Current verified 2026-09-02 GitHub state at program creation:

- draft/open/unmerged;
- head `99543f128fbba8b923eb2c088a039a1753da1600`;
- 13 commits / 17 files;
- 0 commits behind current `main` at verification;
- permanent purge has been split out and must not be reintroduced into the Claudia go-live path.

First closure target:

`canonical Agent → reload/edit → authentication → CRM → correct public profile`

A database-backed Preview/runtime is required. Green tests without that runtime do not close the PR.

### PR #618 — Search

Preserve and **freeze feature expansion**. Do not continue treating the entire historical branch as a deployable release.

Current verified 2026-09-02 GitHub state at program creation:

- draft/open/unmerged;
- head `d19c03cdd3c12826d02f04d6462e2edbcc8186ef`;
- PR metadata: 229 commits / 310 changed files / +117,531 / -7,691;
- stacked on the #620 branch;
- compared with current `main`, the lineage is divergent and carries inherited work.

Do not restart Search from zero and do not discard proven work. Converge the already-built accepted Search foundation into a bounded deployment candidate on the accepted current base. Do not pull CMA, Building, Reports, major UI redesign or unrelated research into the first Search deployment candidate merely because they exist on the historical branch.

### PR #620 — Neon/R2 closure

Preserve prior Neon/R2 engineering and **do not re-audit Neon from zero**.

Current verified 2026-09-02 GitHub state at program creation:

- draft/open/unmerged;
- current head `82d55a3c2ce357edd34dd5ee7ae66fed853d9ceb`;
- 15 commits / 135 changed files;
- 5 commits behind current `main` at verification;
- current branch content no longer matches the simple old PR-body description of the earlier clean closure range.

The intended Neon/R2 corrections must be reconciled onto the accepted current base without redoing the forensic program. After a stable workload is deployed, closure is by measured convergence, not by tests alone.

## 4. Opus execution model — maximum three active agents

Use one controlled Opus team per active recovery packet:

### COORDINATOR

- owns scope, exact Git heads, dependency order and execution-state updates;
- ensures one writer per branch;
- does not certify its own implementation as complete;
- may not spawn additional implementation agents without Maya authorization.

### BUILDER

- has write authority only for the assigned branch/worktree;
- works one bounded defect/capability packet at a time;
- sequence: `reproduce → root cause → affected readers/writers → correction → targeted tests → Preview`;
- may not weaken/flex acceptance after implementation begins.

### INDEPENDENT VERIFIER

- runs concurrently with Builder;
- read-only with respect to implementation;
- receives the frozen acceptance criteria, Preview URL, credentials and QA identifiers — not the Builder's implementation narrative or test claims;
- should not read the PR/code before black-box acceptance;
- returns only `PASS`, `FAIL — exact observed behavior`, or `BLOCKED — exact external reason`.

A second session is not independent merely because it is a second session. Independence comes from **different inputs and no stake in the implementation**.

## 5. One branch = one writer

No two Claude/Opus sessions may push to the same active recovery branch.

Before any mutation:

1. verify authorized local root;
2. verify repo/remote;
3. verify branch/worktree;
4. verify exact HEAD;
5. inspect `git status --short`;
6. declare the one active writer.

If another session is writing the branch or the authorized checkout contains unrelated uncommitted work, stop mutation and reconcile ownership before continuing.

Do not use branch proliferation to avoid coordination. Preserve old work, but create only the bounded convergence branch required by the accepted release decision.

## 6. Acceptance is frozen before the fix

Every recovery packet has two forms of acceptance:

### Golden Thread — integration

The first permanent integrated thread is:

`Claudia login → CRM → create/edit QA Mallan rental → reload proves persistence → Search finds the same rental exactly once → provider listing remains read-only`

Extend this same thread later through:

`Media → Open House → Map → Compare → Saved Search → Reports → CMA → Client workflow → Showing → Offer/Application → Deal → Portal/Post-deal`.

### Fixed matrix — breadth

Golden Thread alone does not prove Search breadth or field persistence. Each system keeps a fixed black-box matrix:

- Agent: identity/title/status/edit/reload/login/public-profile cases;
- Rental/Sale intake: enabled-field round-trip census and no duplicate Listing creation;
- Search: Sale/Rental criteria, impossible criteria, final count, deterministic sort, pagination, identity/dedupe and provider read-only cases;
- downstream systems add their own bounded matrix when activated.

The Builder cannot delete or weaken a failing case because implementation disagrees with it.

## 7. Release gates

A change progresses only through these states:

`CODED → BUILDER TESTED → INDEPENDENT PREVIEW PROVEN → INTEGRATED GOLDEN THREAD PROVEN → MAYA ACCEPTED → PRODUCTION PROVEN → CLOSED`

For each packet:

1. **Builder proof** — targeted direct/negative/integration tests.
2. **Independent Preview proof** — frozen black-box acceptance against the actual Preview/runtime.
3. **Integrated Preview proof** — accepted changes work together on the Golden Thread.
4. **Maya acceptance** — business-critical workflow used by Maya.
5. **Production proof** — exact deployed SHA repeats the required behavior.
6. **Regression gate** — rerun the frozen relevant Baseline A checks. Any previously working behavior that regresses blocks closure.

CI/test counts alone never advance a capability to `CLOSED`.

## 8. Immediate recovery order — continuous, not fragmented

The recovery does not stop after the urgent items. The urgent items are the first visible checkpoints in one continuous system repair.

### A. Agent / operating identity — close #627 first

Prove the full release/gate mechanism on the bounded Agent PR before trusting it on the larger Search lineage.

Required Claudia truth:

- one existing canonical Agent; no duplicate;
- name `Claudia Milkowski`;
- `license_type=broker`;
- `role=AGENT`;
- exact derived designation **Licensed Real Estate Associate Broker**;
- correct reload/edit behavior;
- correct authentication/CRM access;
- correct governed public profile.

No Production data correction or deployment without Maya's explicit authorization.

### B. Mallan listing writer — Rental first because brokerage operation requires it now

Use the existing canonical Listing and existing structured fields/JSON before any schema proposal.

Acceptance:

`create → save → reload → edit → save → reload`

- same Listing identity throughout;
- zero silent loss on enabled fields;
- fields with no canonical owner are visibly unavailable until an approved owner exists;
- Mallan-authored listing editable;
- third-party Cotality listing read-only.

This is not a side project. It is the write-side proof of the canonical Listing spine used by Search and all later workflows.

### C. Search convergence — accepted work, bounded release

Do not merge the entire historical #618 merely because it contains months of work, and do not rewrite the work from zero.

The first bounded Search deployment candidate must prove at minimum:

- Sale and Rental universe correctness;
- status;
- price;
- beds;
- baths;
- borough/neighborhood;
- basic property type;
- impossible/bogus criteria do not widen into fallback inventory;
- final count describes the same universe displayed;
- deterministic sort;
- page 1/page 2 without duplicate/gap;
- Mallan-authored listing appears exactly once;
- provider inventory stays provider-owned/read-only;
- necessary result media/identity are correct.

Then stop for independent verification and Maya acceptance before pulling additional historical #618 capability forward.

### D. Neon/R2 closure — verification, not restart

After the accepted stable workload is deployed, resume the existing Neon/R2 closure protocol.

Measure actual post-deploy behavior, including where available:

- compute duty cycle / suspend-wake-settle behavior;
- write/WAL trajectory;
- Listing and listing-media write rate;
- database-storage trajectory;
- R2/media write behavior;
- cache correctness and stale-reader behavior.

Outcomes:

- `CONVERGED` → close the measured defect;
- `NOT CONVERGED` → open only the exact measured residual writer/materiality/cadence issue.

Never reopen a generic `investigate Neon usage` audit.

## 9. Continue through the entire system

After Agent + canonical Listing writer + trustworthy core Search are accepted, continue on the same canonical identities and Search/property universe:

`Media/Open House/Map → Saved Search/Compare/Reports/CMA → Seller/Landlord/Buyer/Tenant workflows → Marketing/Eblast/Portals/Alerts → UI system/hardening → final reliability/compliance/SEO proof`.

No downstream capability gets a separate data truth merely to move faster.

UI modernization is judged against working workflows. It may fix urgent usability defects earlier, but it may not be used to hide unproven or false backend behavior.

## 10. Truth and authority rules

Every fact used by a workflow is classified as one of:

1. **provider-served and live-verified**;
2. **Mallan-stored canonical fact**;
3. **Mallan-derived from a named authoritative source and deterministic derivation contract**;
4. **unsupported / not provided**.

`UNRESOLVED` is not `Mallan-derived`.

If coordinates, building identity, days-on-market, rental-fee responsibility or another fact is not supported by the current provider entitlement, Mallan may not fabricate a substitute. Any derivation must identify source, derivation rule, refresh/currentness policy, ambiguity/confidence behavior, human-review path where needed and all consumers.

## 11. No silent success / no silent loss

A control must either perform its stated real workflow and report the real outcome or be honestly unavailable.

A visible enabled form input must either round-trip to its canonical owner or be disabled/unavailable. Never collect and silently discard it.

Unknown is not zero. Unsupported is not fallback.

## 12. Schema / migration boundary

Do **not** pre-authorize identity migrations.

Before any schema change, prove:

- the existing canonical model/fields/JSON cannot represent the required fact/identity safely;
- no existing canonical model can be extended/reused;
- readers/writers and backfill/reconciliation are identified;
- direct/negative/integration/downstream/compliance proof is defined;
- Maya explicitly authorizes the migration.

## 13. Recovery completion

Mallan is not considered fixed because a PR merges or the baseline score reaches an arbitrary number.

The recovery ends only when brokerage-critical capabilities are behaviorally proven end to end in Production with no material `BROKEN`, `PARTIAL` or important `UNPROVEN` state on the critical business path, including:

- canonical Agent/Party/Listing identity;
- working Mallan Sale/Rental intake and edit round trips;
- trustworthy Search and listing facts;
- correct Mallan/provider reconciliation;
- media/Open House/map;
- Saved Search/Compare/Reports/CMA;
- durable CRM activity;
- Seller/Landlord/Buyer/Tenant workflows;
- marketing/delivery/portals/alerts;
- responsive usable UI;
- compliance/SEO truth;
- Neon/R2/cache/cron reliability and measured convergence.

The program must produce visible usable results continuously, but no urgent checkpoint is allowed to become a false endpoint for the system repair.
