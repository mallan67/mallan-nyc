# MALLAN CONTINUOUS EXECUTION STATE

> **STATUS ONLY.** This file does not define product/business/system architecture. `MALLAN-PLATFORM-MASTER-PLAN.md` is the sole durable authority. This file records the freshest verified execution state needed to continue work without restarting audits or relying on stale chat/PR prose.

**Checkpoint:** 2026-09-08  
**Repository:** `mallan67/mallan-nyc` only  
**Authorized local checkout:** `C:\Users\MayaAllan\Desktop\mallan-nyc`

---

# 1. Authority / startup

Read in this order:

1. `AI-START-HERE.md`;
2. affected Master sections, or the full Master for cross-system work;
3. this execution-state file;
4. fresh Git/PR/runtime/provider state;
5. `AGENTS.md`, `CLAUDE.md`, `NEON.md` and the Compliance Canonical Index as applicable.

If this file conflicts with the Master on architecture, the Master wins. If this file is stale on a branch/head/runtime fact, fresh evidence wins and this file must be updated.

No new overall master audit or parallel architecture is created after context loss.

---

# 2. Verified Git governance state

## Main

Fresh GitHub verification at this checkpoint:

`main = 2a83952a31c7aaa9367141763c1685269c51c380`

## PR #595 — Master/governance

State: `OPEN · DRAFT · UNMERGED · MERGEABLE`

Branch:

`agent/publish-mallan-platform-master-plan-2026-08-04`

The Master/governance branch was consolidated on 2026-09-08 and then corrected for the current Cotality lifecycle/media rulings:

- Master remains 27 stable durable top-level sections;
- `AI-START-HERE.md`, `AGENTS.md`, `CLAUDE.md` and `docs/claude-instructions/CURRENT.md` are subordinate to the Master;
- requirement ledger is a stable proof/index layer, not another plan;
- Compliance Canonical Index is a specialized implementation registry, not a competing architecture;
- temporary September 2 Master staging/recovery duplicates were retired;
- PR body describes durable authority rather than stale implementation heads;
- Master now explicitly separates Cotality current provider state, Cotality transition/event evidence and Mallan broker-facing display wording;
- `Pending` is the current provider state used for Mallan **In Contract** under the verified current mapping;
- unresolved provider disappearance uses Mallan **Off Market** without manufacturing Withdrawn/Canceled/Expired/Hold;
- `Delisted` is not a canonical Mallan status;
- Coming Soon DOM and normal market DOM are separate clocks;
- market DOM ends only at a provider-verified Sale/Rental contract-signed point;
- Cotality Member/Property/Building Media ownership stays distinct end to end.

**Merge boundary:** #595 is substantially diverged from `main`; do not merge blindly. Perform one controlled reconciliation against then-current `main`, preserving current-main governance/code and proving the final docs tree before merge.

No documentation change in #595 authorizes Production/schema/Neon/R2/env/provider-publishing mutation.

---

# 3. Current implementation-lane pointers

These are lane pointers, not architecture.

## Search — PR #618

Fresh GitHub metadata at the last verified checkpoint:

- `OPEN · DRAFT · UNMERGED · MERGEABLE`
- head: `d19c03cdd3c12826d02f04d6462e2edbcc8186ef`
- branch: `fix/neon-p0-event-driven-wake-2026-08-16`
- base: `fix/neon-r2-closure-clean-2026-08-19`

PR #618 is a very large historical Search branch. Do not deploy/merge it wholesale merely because it contains accepted work, and do not rewrite accepted Search contracts from zero. Current Search implementation work must conform to Master §4–§6 and preserve proven contracts while converging into bounded release candidates.

## Neon/R2 — PR #620

Fresh GitHub metadata at the last verified checkpoint:

- `OPEN · DRAFT · UNMERGED · MERGEABLE`
- branch: `fix/neon-r2-closure-clean-2026-08-19`
- GitHub branch metadata, not old PR-body prose, defines the current head.

No Production deployment, R2 deletion, migration/index or direct DB mutation is authorized by this status file.

## Agent lifecycle — PR #627

Fresh GitHub metadata confirms:

- `OPEN · DRAFT · UNMERGED · MERGEABLE`
- scope is bounded Agent lifecycle / canonical CRM → database → public-profile behavior;
- permanent deletion is outside that PR;
- exact-head re-verification is required for any current acceptance claim.

Before any new Agent mutation, refresh the exact current head from GitHub and do not transfer acceptance from an older head.

## 2026-09-08 local Cotality convergence work — USER-PROVIDED / LOCAL-ONLY EVIDENCE

User-provided local execution evidence reports a large body of Cotality/status/forms/rentals/CMA/amenity/media work, approximately 27 local commits ahead of its published origin, with no push and no Production mutation at the time of the report.

Reported local findings/fixes included:

- status/lifecycle reconciliation;
- field-selection convergence;
- audience visibility;
- listing attribution;
- form create/edit normalization;
- rental criteria execution;
- CMA comp-window/eligibility corrections;
- amenity and CustomFields mapping.

The same report claimed "all nine domains are done." **That conclusion is NOT accepted as current proof.** Maya then issued four owner rulings that materially change the policy those local fixes/tests were measured against. Therefore all affected local status/DOM/Media/form conclusions are `REOPENED — OWNER POLICY CORRECTION` until the local code, tests, coverage matrix and audit are recomputed.

Do not push or merge that local work based on the prior green matrix alone.

---

# 4. Master-consolidation system-impact findings

The 2026-09-08 Master cleanup/correction changes **governance/target contracts only**, not runtime code. It therefore cannot by itself change Production behavior. It exposes current implementation gaps that future work must reconcile.

## 4.1 Listing writer / legacy external-platform coupling

Current `main` still carries a `realPlusUrl` field through listing URL/publish contracts and CRM listing create/update/status responses/tests.

Impact:

- this is implementation debt against Master §21's rule that a legacy external listing-input platform is not Mallan architecture;
- do **not** delete/rename it casually in this docs PR;
- the Listing writer lane must census every writer/reader/test/UI consumer, determine whether the field has any legitimate current business meaning, and retire/re-map it without breaking public URL, status, Featured/Exclusive or address-display behavior.

Required closure:

`all realPlusUrl writers/readers/tests → canonical current Mallan/public/provider contract → bounded correction → direct/negative tests → Listing round-trip → downstream/public proof`.

## 4.2 Lead identity / email-only upsert

Current `main` contains multiple public Lead writers that upsert on email, including inquiry/CMA/Open House/search-alert/guide/identity-capture paths and prospect conversion.

Impact:

- email can remain a useful lookup/idempotency signal;
- email alone may not remain the canonical Party identity rule where stronger identity/relationship evidence exists;
- do not replace these writers independently route by route.

Required closure:

`all Lead/Inquiry writers → one Lead/Party reconciliation owner → existing Party + existing Agent relationship check → durable source/context → assignment → Opportunity → idempotent retry → downstream CRM/marketing/portal proof`.

## 4.3 Public contextual rendering

Master §23 requires:

`CANONICAL RECORD → BUSINESS/PROPERTY TYPE → AUDIENCE → BUSINESS RULE → COMPLIANCE/RIGHTS → COMPONENT ELIGIBILITY → RENDER`.

Impact:

- residential/commercial, Sale/Rental, Agent/client/public and New-Development components must be censused as readers of canonical property/business type;
- fixing one listing page is insufficient; shared component eligibility must be traced across listing detail, Search result/detail, calculators, neighborhood modules, disclosures, Media and CTAs.

## 4.4 Lease lifecycle / relationship plan

Master §19 requires an approximately six-month Landlord + Tenant decision review plus response-driven 90/60/30 follow-up and explicit next-action state.

Impact:

- this is a cross-system workflow spanning Party, Opportunity, Property/Unit, Lease/Accepted Deal, Task/Reminder, CMA/calculators, Saved Search and Agent/Brokerage views;
- do not implement it as a standalone reminder table or separate CRM nurture system;
- schema growth is not authorized until existing Deal/lease/task/date structures are exhausted and the missing canonical owner is proven.

## 4.5 Agent tax administration

Master §17 adds:

`W-9 → verified tax-payee record → actual Agent payments → tax-year total → applicable 1099 record → delivery/access/correction history`.

Impact:

- Commission/Payment remains the money truth;
- no manually maintained tax-form total may become a second payment ledger;
- sensitive tax data requires strict permission/privacy treatment;
- exact IRS form/rules/thresholds/dates are current-source governed, not hard-coded permanently.

## 4.6 Durable business effects / idempotency

Master §27 requires critical state-changing workflows to survive retry/partial failure without duplicate/lost business effects.

Priority impact surfaces include:

- Lead create/assignment;
- Agent create/invite/account state;
- Listing publication/status events;
- client alerts/sends;
- signed-document state;
- accepted-deal progression;
- commission/payment state;
- lease-expiration workflow creation.

This does **not** authorize a new event-sourcing platform. First census existing transaction/idempotency/audit/workflow capabilities and establish the minimum canonical mechanism.

## 4.7 Cotality listing lifecycle / status correction — REOPENED IMPLEMENTATION CONTRACT

The current durable rule is now Master §4.5.1 and §26.8.

Required system behavior:

```text
COTALITY CURRENT PROVIDER STATE
≠
COTALITY TRANSITION / EVENT EVIDENCE
≠
MALLAN DISPLAY WORDING
```

Implementation must prove across ingestion/reconciliation, storage/projection, Agent Search, Consumer Search, Listing detail, CMA, reports, alerts and marketing:

- current Cotality `Pending` maps to Mallan **In Contract** under the verified current mapping;
- `ActiveUnderContract` may exist in metadata but is not inferred merely because the enum exists;
- `Closed` Sale renders Sold, while `Closed` Rental renders Rented/Leased under governed wording;
- `BackOnMarket` remains provider transition/event evidence rather than a competing current-status owner;
- provider disappearance alone never writes Withdrawn/Canceled/Expired/Hold;
- unresolved disappearance preserves last verified provider history and uses Mallan broker-facing **Off Market**;
- no new canonical `Delisted` state exists;
- a later verified Cotality reason/current state supersedes the unresolved display state without erasing history.

Any code/test/audit that encoded "disappeared = Withdrawn" or canonical `Delisted` is invalid against the current Master and must be corrected before the affected domain can close.

## 4.8 DOM correction — TWO CLOCKS

Master §5.6.1 now governs DOM.

Required implementation:

### Coming Soon DOM

Separate clock using only verified Cotality Coming Soon/activation facts.

### Market DOM

```text
VERIFIED ON-MARKET / LISTED DATE
→
ACTUAL CONTRACT-SIGNED POINT
```

Before implementation closes, prove the exact Cotality field or deterministic combination that represents the contract-signed point separately for Sale and Rental.

Do **not** silently define `PurchaseContractDate` as contract signed. Preserve `OnMarketDate`, `OnMarketTimestamp`, `PurchaseContractDate`, `ContractStatusChangeDate`, `PendingTimestamp` and other provider events as separate facts.

There must be one owner for Coming Soon DOM and one owner for market DOM. Conflicting reader-local DOM formulas are a defect.

## 4.9 Cotality Media ownership correction

Master §11.7 now requires source ownership to survive ingestion/storage/consumption:

```text
MEMBER → AGENT / MEMBER PHOTOS
PROPERTY → LISTING / UNIT MEDIA
BUILDING → BUILDING / AMENITY MEDIA
```

Where Cotality exposes Office or Contacts as Media owners, preserve their source ownership if encountered without automatically inventing a Mallan feature.

Required closure:

- Agent/Member photos never enter listing-photo ordering;
- Property/listing photos/floor plans/video/etc. remain Property-owned;
- Building media can be shown in a Building section but is not copied onto each unit as listing-owned Media;
- `ResourceName` / `ResourceRecordKey` ownership is retained through mapper/storage/cache/client/public transformation;
- Search, Listing detail, reports, marketing and public rendering do not flatten Member/Property/Building media into one collection.

## 4.10 "RLS" provider wording correction

Cotality/Trestle is the current provider API/mapping/status/media authority within entitlement.

REBNY/RLS/UCBA remains separately applicable business/compliance/use/display authority.

Therefore any implementation/test/report phrase such as "RLS provider field," "RLS status enum," or "RLS API mapping" must be classified:

- current Cotality provider contract;
- legitimate REBNY/RLS compliance rule;
- Mallan business field;
- obsolete legacy/provider wording.

In particular, the reported 20 held form-binding errors must be classified individually rather than accepted wholesale as "RLS form errors." The forms ultimately bind to current Cotality fields and Mallan canonical business fields, while genuine REBNY/RLS rules remain compliance gates.

---

# 5. Continuous closure model

Every material implementation packet follows Master §27:

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
→ CLOSED
```

Forms additionally require:

`CREATE → SAVE → RELOAD → EDIT → SAVE → RELOAD`

One branch/worktree = one writer. Builder proof and independent black-box proof remain separate evidence classes. A previous-head acceptance never transfers automatically to a new head.

---

# 6. Controlled mutation boundaries

Explicit Maya authorization remains required before:

- schema/migration/backfill;
- direct Production Neon/DB mutation;
- destructive Production/R2 cleanup;
- environment/credential change;
- manual cron/reconciliation runs;
- force-push/squash/rebase of shared branches;
- manual Production deployment/alias change;
- provider publishing/new external-inventory implementation where separately held.

A held mutation freezes only that mutation. Safe independent design, read-only verification, tests and bounded implementation may continue where already authorized.

---

# 7. Next exact governance actions

For #595:

1. complete exact-head CI/review after the documentation consolidation and today's Cotality lifecycle correction;
2. do not mark Ready/merge while checks are still in progress or while branch/main divergence is unreconciled;
3. reconcile #595 once against then-current `main` without reintroducing old competing authority files/prose;
4. verify the resulting tree still changes governance/docs only and retains all 27 Master sections;
5. obtain Maya's final business review before merge.

For the local 2026-09-08 Cotality convergence work:

1. do not push based on the prior "all nine domains done" conclusion;
2. re-run the affected status/lifecycle/DOM/Media/form policy against the corrected Master;
3. classify all 20 reported form bindings by current Cotality vs legitimate REBNY/RLS compliance vs Mallan business field vs obsolete binding;
4. prove no canonical `Delisted` state and no disappearance→Withdrawn inference survives;
5. prove separate Coming Soon and market DOM owners/endpoints;
6. prove Member/Property/Building Media ownership end to end;
7. regenerate the final audit/coverage matrix after those corrections;
8. only then decide whether the local branch is fit to push for review.

For other implementation lanes:

1. continue already-owned Search/Agent/Neon work from fresh branch state rather than this docs branch;
2. incorporate the Master impact gaps above into the appropriate existing implementation lane/dependency graph;
3. do not open standalone duplicate projects for legacy URL cleanup, Lead identity, lease workflow, tax administration or idempotency until the complete readers/writers and canonical owner are established;
4. never treat updating #595 as proof that the corresponding runtime behavior has been implemented.
