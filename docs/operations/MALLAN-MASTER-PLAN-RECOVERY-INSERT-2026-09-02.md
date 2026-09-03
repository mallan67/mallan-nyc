# MASTER PLAN INSERT — PRODUCTION RECOVERY & EXECUTION CONTROL — 2026-09-02

**Target file:** `MALLAN-PLATFORM-MASTER-PLAN.md`  
**Target location:** insert after `# 26. GLOBAL DEFINITION OF DONE` and before `# CURRENT HANDOFF`, or as new `# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL` immediately before `# CURRENT HANDOFF`.

This file is an exact staging patch only because PR #595 already records that a prior full-file connector replacement of the Master Plan proved unsafe and the Master Plan was restored byte-for-byte. This staged text must be applied surgically to the Master Plan from the authorized local checkout and verified as an additive-only patch. Until then, the existing Master Plan remains the sole authority; this file is subordinate execution evidence.

---

# 27. PRODUCTION RECOVERY AND EXECUTION CONTROL

Mallan's product architecture remains the architecture defined by this Master Plan. The recovery program does not create a second architecture, second Search, second identity system or second master plan.

The purpose of this section is to govern **how the existing system is repaired and proven** so implementation converges into one working brokerage operating system rather than repeating the historical pattern of large branches, green tests, self-certified completion and broken browser behavior.

## 27.1 Frozen Production recovery baseline

The public/provider Production audit frozen on 2026-09-02 is recovery evidence with these headline measurements:

- observable structural coherence: **46/100**;
- exercised functional Production: **42/100**;
- proven functional deficiency on the exercised subset: **~58%**;
- brokerage-critical capabilities fully proven: **0 of 13**;
- authenticated brokerage functionality remains materially **UNPROVEN** until exercised through an authorized database-backed runtime.

These measurements are **regression signals, not definitions of completion**.

A higher score does not prove a workflow is fixed. A lower score, or regression of a previously working behavior, blocks closure.

Baseline B may expand what is known about authenticated functionality, but it does not erase Baseline A and does not block correction of an already-proven defect.

## 27.2 Production-truth requirements revealed by Baseline A

The following are hard system requirements, not optional audit observations:

- **No simulated success.** A control may claim send, submit, share, report generation, save or another success only when the real server action and required durable outcome occurred. Otherwise the control is honestly unavailable or reports the actual failed/unknown state.
- **Unknown remains unknown.** Missing provider/Mallan facts may not silently become `$0`, `0`, `Manhattan`, `true`, Active or a fallback result set.
- **Unsupported is not fallback.** An unsupported Search criterion must be specifically refused/unavailable rather than silently widening the universe.
- **One canonical listing identity.** Mallan-authored listing and provider return-copy must reconcile to the same canonical Mallan Listing Episode and may not compete as two Search/detail/media/CMA/report identities.
- **One canonical Agent identity.** Runtime Agent, authentication, CRM, directory, profile, sitemap, listing attribution and professional designation must resolve from one governed Agent lifecycle.
- **Public truth is part of system truth.** Soft-404 pages, directory-index route exposure, wrong professional titles, fabricated defaults and stale/nonexistent inventory presented as current are Production defects, not cosmetic cleanup.
- **Search is infrastructure.** Count, sort, pagination, dedupe, identity, filtering, Saved Search, Compare, Reports, CMA, Map and client matching may not each invent a different result universe.
- **Media/Open House/Map are cross-system consumers.** They must resolve through canonical Property/Unit/Listing identity and the same authority rules rather than being patched per screen.

## 27.3 Fact authority — no invented replacement for missing provider data

Every material fact used by Mallan resolves to one of these classes:

1. **provider-served and live-verified**;
2. **Mallan-stored canonical fact**;
3. **Mallan-derived from a named authoritative source and deterministic derivation contract**;
4. **unsupported / not provided**.

`UNRESOLVED` is not a synonym for `Mallan-derived`.

A value does not become Mallan-derived merely because Cotality does not supply it.

Any Mallan derivation must identify:

- authoritative input source;
- deterministic derivation rule;
- ambiguity/confidence behavior;
- refresh/currentness policy;
- human-review path where ambiguity is possible;
- affected readers/consumers;
- direct and negative tests.

This applies especially to coordinates, Building identity, days-on-market, rental-fee responsibility and other facts shown by the Production audit to be absent, sparse or semantically unresolved in the current provider entitlement.

When neither provider nor an approved Mallan authority can truthfully supply the fact, Mallan renders **not provided / unavailable**, not a guess.

## 27.4 Convergence before feature expansion

Large historical branches are engineering evidence and work preservation; branch size or accumulated effort does not make them deployable units.

Current recovery disposition:

### Agent lifecycle / PR #627

Use the bounded Agent lifecycle work as the first proof of the complete release mechanism.

The Agent lane must close the real runtime chain:

`canonical Agent → save/reload/edit → authentication → CRM → governed public profile`

For an Associate Broker operating as a producer:

```text
license_type = broker
role = AGENT
public professional designation = Licensed Real Estate Associate Broker
```

The existing Claudia record is corrected in place when Production correction is explicitly authorized; do not create a duplicate Agent.

Permanent purge is not a launch dependency and must remain outside the Claudia go-live path until its independent concurrency/dependency design is proven.

### Search / PR #618

Preserve existing #618 work but **freeze feature expansion** while it is converged into bounded deployment candidates.

Do not merge the entire historical branch merely because it contains months of work. Do not rewrite the same accepted work from zero.

Bring forward already-built accepted foundation in dependency order and prove it through bounded runtime acceptance before pulling additional Search/CMA/Building/Reports/UI work forward.

The first bounded Sale/Rental Search deployment candidate proves at minimum:

- correct Sale/Rental universe;
- status;
- price;
- beds;
- baths;
- borough/neighborhood;
- basic property type;
- impossible/bogus criteria do not return fallback inventory;
- final count describes the same universe displayed;
- deterministic sort;
- page 1/page 2 without duplicate/gap;
- Mallan-authored listing appears exactly once;
- provider inventory remains provider-owned/read-only;
- correct result identity and necessary media.

### Neon/R2 / PR #620

Preserve prior Neon/R2 forensic engineering. **Do not restart the Neon investigation from zero.**

Reconcile the already-proven intended corrections onto the accepted current base. Once the real stabilized workload is deployed, resume the existing convergence protocol.

Closure is measured behavior — compute duty cycle/suspend-wake-settle, write/WAL trajectory, database-storage trajectory, Listing/listing-media write rate, cache behavior and relevant R2/media behavior — not test count.

If usage does not converge, open only the exact measured residual writer/materiality/cadence defect. Never reopen a generic `investigate Neon usage` project.

## 27.5 Controlled parallel execution — Opus team model

Mallan may use parallel agents to move quickly, but parallelism is controlled.

Maximum active team for one recovery packet:

```text
COORDINATOR
BUILDER
INDEPENDENT VERIFIER
```

Do not allow uncontrolled recursive subagent spawning.

### Coordinator

- owns scope, dependency order, exact Git heads, worktree/branch ownership and execution-state continuity;
- enforces this Master Plan and the continuous execution state;
- does not certify its own implementation as complete.

### Builder

- is the sole writer for the assigned branch/worktree;
- works one bounded defect/capability packet at a time;
- follows:

`reproduce → root cause → affected readers/writers → correction → targeted tests → Preview`;

- cannot weaken acceptance because the implementation behaves differently.

### Independent Verifier

- is read-only with respect to implementation;
- runs concurrently so the failure state and acceptance criteria are established before the Builder finishes;
- receives frozen acceptance criteria, Preview URL, credentials and QA identifiers;
- does **not** receive the Builder's implementation narrative/test claims and should not read the PR/code before black-box acceptance;
- returns `PASS`, `FAIL — exact observed behavior`, or `BLOCKED — exact external reason`.

A second model/session is not independent merely because it is a separate session. Independence requires different inputs and no stake in the implementation.

## 27.6 One branch = one writer

Before mutation:

1. verify authorized checkout/repo;
2. verify remote;
3. verify branch/worktree;
4. verify exact HEAD;
5. inspect working-tree status;
6. declare the one writer.

Two active sessions may not push to the same recovery branch.

If another writer or unrelated uncommitted work is discovered, stop mutation and reconcile ownership first.

Do not create parallel mappings/models/identity systems merely to avoid a branch collision.

## 27.7 Golden Threads plus fixed breadth matrices

One Golden Thread proves integration. It does not prove breadth. Therefore every material recovery uses **both**.

### First Golden Thread

```text
Claudia login
→ CRM
→ create/edit designated QA Mallan rental
→ save/reload/edit/save/reload
→ same canonical Listing identity
→ Search finds the rental exactly once
→ provider listing beside it remains provider-owned/read-only
```

As the system stabilizes, extend the same identity chain through:

`Media → Open House → Map → Compare → Saved Search → Reports → CMA → Client workflow → Showing → Offer/Application → Deal → Portal/Post-deal`.

### Fixed breadth matrices

At minimum:

- Agent — identity, professional title, status, create/edit/reload, auth, CRM, public-profile cases;
- Sale/Rental intake — enabled-field round-trip census, no silent loss, no duplicate Listing creation;
- Search — criterion execution/refusal, impossible criteria, final count, deterministic sort, pagination, identity/dedupe, provider read-only cases;
- each downstream system adds a bounded matrix before implementation begins.

The acceptance matrix is frozen before the fix and cannot be weakened by the Builder.

## 27.8 Release states and closure gates

Use these states:

```text
CODED
→ BUILDER TESTED
→ INDEPENDENT PREVIEW PROVEN
→ INTEGRATED GOLDEN THREAD PROVEN
→ MAYA ACCEPTED
→ PRODUCTION PROVEN
→ CLOSED
```

Required gates:

1. targeted direct/negative/integration tests by Builder;
2. independent black-box Preview proof;
3. integrated Golden Thread proof across accepted changes;
4. Maya business acceptance for critical workflows;
5. exact deployed-SHA Production proof after explicit deployment authorization;
6. rerun the frozen relevant Baseline A checks on the deployed commit.

A previously working behavior that regresses, or a lower comparable Baseline result, blocks closure.

A score increase does not independently prove closure.

## 27.9 Immediate continuous recovery order

The urgent operational work is the **first checkpoint of one continuous system repair**, not a set of disconnected projects.

Current order:

1. **Agent runtime / #627** — prove the new Build + Independent Verify + Maya + Production gate on a bounded change.
2. **Mallan listing writer — Rental immediately, then Sale contract integrity** — prove `create → save → reload → edit → save → reload` on canonical Listing with zero silent loss on enabled fields.
3. **Core Sale/Rental Search convergence** — bounded accepted foundation, independent black-box acceptance and Golden Thread with the Mallan QA rental.
4. **Existing Neon/R2 convergence proof** — resume, do not restart.
5. **Media + Open House + Map** on the settled identity/result universe.
6. **Saved Search + Compare + Reports + CMA** on that same Search/property foundation.
7. **Seller + Landlord + Buyer + Tenant workflows** end to end on canonical Party/Opportunity/Listing/Transaction history.
8. **Marketing/E-blast + Portals + Alerts + client activity** with truthful delivery and durable CRM history.
9. **UI system/hardening + responsive usability + SEO/compliance/reliability** after and alongside truthful functionality, without using design to hide backend failure.

Do not wait for the entire later system before delivering the first usable brokerage checkpoint. Do not treat the first usable checkpoint as the end of the recovery.

## 27.10 On-the-spot behavioral testing

Do not accumulate dozens of commits before browser proof.

After a material boundary is corrected, run the relevant Preview/browser acceptance immediately.

Examples:

- Rental save fixed → create/reload immediately;
- Rental edit fixed → edit/reload immediately;
- Search pagination fixed → page 1/page 2 immediately;
- Mallan local identity wired → search the designated QA rental immediately;
- Agent designation fixed → render the actual profile immediately.

A failed behavioral test stays in the same bounded packet until corrected. It does not trigger a new master audit or unrelated cleanup.

## 27.11 No-restart rule

Prior audit/forensic work is evidence and starting state.

A reopened defect begins from:

`previous proven conclusion + new measured delta`.

Do not repeat completed censuses, provider probes, Neon root-cause programs or Search audits simply because a session changed.

If new evidence contradicts an old conclusion, reopen only the contradicted dependency and record why.

## 27.12 Schema/migration authorization remains explicit

Do **not** pre-authorize identity migrations.

Before any schema change, prove:

- existing canonical model/structured fields/JSON cannot safely represent the required fact or identity;
- reuse/extension cannot meet the requirement;
- all affected readers/writers are identified;
- backfill/reconciliation strategy is explicit;
- direct/negative/integration/downstream/compliance proof is defined;
- Maya explicitly authorizes the migration.

The difficulty of integrating an existing model is not itself proof that a new schema is necessary.

## 27.13 Global recovery finish line

Mallan is not fixed when a PR merges or when a score reaches an arbitrary number.

The Production recovery is complete only when brokerage-critical capabilities are behaviorally proven end to end in Production with no material `BROKEN`, `PARTIAL` or important `UNPROVEN` state on the critical business path, including:

- canonical Agent/Party/Property/Listing identity;
- Mallan Sale/Rental intake and edit round trips;
- trustworthy public and professional Search under their correct consumer contracts;
- Mallan/provider return-copy reconciliation;
- media/Open House/map;
- Saved Search/Compare/Reports/CMA;
- durable CRM/client activity;
- Seller/Landlord/Buyer/Tenant role journeys;
- truthful marketing/delivery/portal/alert behavior;
- usable responsive UI;
- compliance/SEO truth;
- Neon/R2/cache/cron reliability and measured convergence.

The recovery must continuously produce usable checkpoints while preserving this single-system finish line.

---

## CURRENT HANDOFF REPLACEMENT / ADDITIONS

When this insertion is applied to the Master Plan, update the `CURRENT HANDOFF` section so it no longer says the immediate technical sequence is simply `Search → CMA → Backend Listings...` without the recovery controls above.

Add/replace with these current statements:

- **Baseline A 2026-09-02 is the frozen public/provider recovery baseline:** 46/100 observable structural coherence, 42/100 exercised functional Production, ~58% proven deficiency on exercised scope, 0/13 brokerage-critical capabilities fully proven. Scores are regression signals, not definitions of done.
- **Current recovery is convergence-first, not feature-expansion-first.** Existing #627/#618/#620 work is preserved; giant moving branches are not automatically deployable units.
- **#627 closes first as the release-process proof** with database-backed Preview acceptance, independent black-box verification, Maya acceptance, exact Production proof and Baseline regression check. Claudia must resolve as one canonical Agent and `Licensed Real Estate Associate Broker`; permanent purge is not a go-live blocker.
- **Rental Listing intake is immediate operating-core work:** existing canonical Listing, no silent field loss, `create → save → reload → edit → save → reload`, third-party Cotality remains read-only.
- **#618 feature expansion is frozen while accepted Search work is converged into bounded deployment candidates.** Do not merge the whole historical branch or rewrite it from zero.
- **#620 Neon/R2 forensics are not restarted.** Reconcile the previously proved intended corrections, then run the existing convergence measurement under the stable workload; residual work begins from the measured delta only.
- **Opus recovery runs with maximum three roles:** Coordinator, one Builder/writer, one independent read-only Verifier. One branch = one writer. The Verifier receives frozen acceptance inputs, not the Builder's narrative.
- **Every critical release uses both a Golden Thread and a frozen breadth matrix.** The first Golden Thread is Claudia login → CRM → QA Rental round trip → Search returns that Mallan rental exactly once → provider listing remains read-only.
- **Closure states are:** `CODED → BUILDER TESTED → INDEPENDENT PREVIEW PROVEN → INTEGRATED GOLDEN THREAD PROVEN → MAYA ACCEPTED → PRODUCTION PROVEN → CLOSED`.
- **No pre-authorized identity migration.** Exhaust existing canonical models/fields/JSON first; schema change remains explicit Maya authorization.
- **No restart.** A reopened defect begins from prior proof plus the new measured delta, never another generic master audit.
