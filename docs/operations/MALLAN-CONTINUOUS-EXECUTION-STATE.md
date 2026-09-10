> # NON-AUTHORITATIVE LOCAL MIRROR — NOT RANK 2
>
> **The canonical execution state is the copy on the governance lineage:**
> `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` on
> **PR #595 / `agent/publish-mallan-platform-master-plan-2026-08-04`**, refreshed there in `f3d8279b`.
>
> This file is a mirror on an implementation branch. It is **not** rank 2, it must not be edited as a
> second execution-state truth, and where it disagrees with the canonical copy the canonical copy wins.
>
> Why it says so out loud: I recovered this file onto the implementation branch on 2026-09-10 after
> wrongly reporting it did not exist. Owner correction, same day: *"I would not preserve a second
> authoritative Continuous Execution State on #630 ... we should not create two rank-2 truths that
> will diverge."* That is the same defect this whole cleanup exists to remove — solving a duplicate
> Master Plan problem by creating a duplicate execution-state problem.
>
> **Disposition pending.** The current-state facts it carried have been transferred to the canonical
> copy. It is retained here, labelled, only until the owner decides whether it is deleted outright.

---

# MALLAN CONTINUOUS EXECUTION STATE

> **STATUS ONLY.** This file does not define product/business/system architecture.
> `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` is the sole durable
> authority. This file records the freshest verified execution state needed to continue work without
> restarting audits or relying on stale chat/PR prose.

**Checkpoint:** 2026-09-10
**Repository:** `mallan67/mallan-nyc` only
**Authorized local checkout:** `C:\Users\MayaAllan\Desktop\mallan-nyc`

---

> ## RECOVERY NOTE — 2026-09-10
>
> This file was **recovered, not created.** It has existed since 2026-08 at this exact path and was
> last updated on 2026-09-08 (`14459f21`, branch `agent/publish-mallan-platform-master-plan-2026-08-04`,
> PR #595 — still OPEN and DRAFT). It reached `main` at no point: `git log origin/main --` on this
> path is empty, so it has only ever lived on feature branches.
>
> **It was never deleted.** The two commits titled *"chore: remove obsolete AI project-context
> authorities"* (`e7017225`, `7be9ae99`) ADDED to it — +415 and +34 lines. Its absence from
> `converge/crm-listing-workflow-2026-09-09` is **branch divergence**: that branch was cut from
> `main`, and `main` never had the file.
>
> The consequence was recorded at the time, in
> `docs/operations/COTALITY-SEARCH-CONVERGENCE-STATE-2026-09-07.md` §2: *"The two declared authority
> documents are not on `main` … The SessionStart hook points every new session at files that are
> absent from the working branch … This must be fixed first or every future session starts blind."*
> That is what this recovery closes.
>
> **Correction to a claim I made on 2026-09-10:** I reported that this file "does not exist anywhere
> in the repository or working tree" and that it was the owner's to create. That was wrong. I had
> checked the working tree and the current branch and never checked git history or other refs. The
> file existed, at this path, with the correct STATUS-ONLY purpose. `CLAUDE.md` and `AGENTS.md`
> carried that error and are corrected in the same commit as this recovery.
>
> Structure and purpose below are the recovered ones. Sections 1, 2, 3 and 7 carry facts re-proven
> on 2026-09-10. Sections 4, 5 and 6 are carried forward from the 2026-09-08 checkpoint; §4 is
> explicitly marked as inherited and not re-verified.

---

# 1. Authority / startup

Read in this order:

1. `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` — the ONLY product/system
   authority. Affected sections, or the whole file for cross-system work;
2. this execution-state file — where execution currently stands;
3. fresh Git / PR / runtime / provider state;
4. `AGENTS.md`, `CLAUDE.md`, `NEON.md` and `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` as
   applicable — agent operating instructions and domain rules.

If this file conflicts with the Master Plan on architecture, **the Master Plan wins.** If this file
is stale on a branch / head / runtime fact, **fresh evidence wins and this file must be updated.**

No new overall master audit and no parallel architecture document is created after context loss.
That rule is now enforced mechanically by `tests/runtime/no-new-authority-documents.test.ts`.

> **Startup-list correction, 2026-09-10.** This section previously began *"1. `AI-START-HERE.md`"*.
> That file is not tracked in this repository — `git ls-files AI-START-HERE.md` is empty — so the
> reading order began with a file no session could open. The entry is removed and the order now
> matches the authority order in `CLAUDE.md` and `AGENTS.md`.

---

# 2. Verified Git governance state

Verified 2026-09-10 against GitHub, not quoted from memory.

## Main

`main = 2a83952a31c7aaa9367141763c1685269c51c380`

Unchanged since the 2026-09-08 checkpoint.

## Current working branch — PR #630

`converge/crm-listing-workflow-2026-09-09`
head `5d4f6e6aff422534855415d910900d5d96d9b3ee`

State: **OPEN · DRAFT · UNMERGED.** Not to be merged without the owner's explicit authorization.

CI at this head: `pr-check` PASS · `guardrails` PASS · `build` · `validate` · `geo-validate` ·
`target-platform-build` · `release-truth` · `claude-review` · Vercel deployment all PASS. The one
non-passing row is `release-truth`'s deploy-runtime validator, which is fail-closed pending a
Preview runtime proof — it needs Preview-scoped `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, which is
an owner action.

What this branch has closed, with commit SHAs:

| SHA | What |
|---|---|
| `928f31c4` | Routing ownership correction — `/crm` serves the CRM again; `/crm/search` serves Backend Agent Search |
| `fd0c08ab` | Deal-form client auth gate restored (four unterminated string literals killed the whole script block) |
| `a486c6d3` | Build-drift guard made real on Windows and Linux |
| `6a977a8e` | `CLAUDE.md` + `AGENTS.md` corrected together; authority order established |
| `bc263f17` | Legacy-provider ratchet scans the repository, not one machine's disk |
| `bd5f3701` | "dashboard is retired" premise purged from the guards that still enforced it |
| `f6e7600e` | `idx-validate` stopped discarding its own report (`process.exit` vs a POSIX pipe) |
| `47aed1ad` | 38 agent-facing documents brought in line |
| `3b321873` | Doc-proliferation guard + Backend Search independence proof |
| `5d4f6e6a` | Four design specs no longer assume one merged "CRM" |

## PR #595 — Master / governance

State: **OPEN · DRAFT · UNMERGED.**
Branch: `agent/publish-mallan-platform-master-plan-2026-08-04`

This is the branch this execution-state file was recovered from. It remains the lane for the Master
Plan and governance publication. Reconciling it against current `main` is still open.

## Open PR queue

23 open PRs at this checkpoint, 22 DRAFT and one READY (#599). The oldest is #585 (2026-07-28).
Lanes that overlap current work: #618 and #600 (Search), #620 (Neon/R2), #627 (Agent lifecycle),
#616 and #624 (obsolete provider contract / competing docs), #595 and #585 (governance).

---

# 3. Current implementation-lane pointers

## CRM / Search boundary — PR #630 (this branch)

The architecture question that blocked everything is **decided and enforced**:

```text
BROKERAGE CRM         public/crm/dashboard.html + public/crm/js/dashboard/**   /crm   (compat /crm/dashboard)
BACKEND AGENT SEARCH  public/crm/index.html -> index-built.html                /crm/search
CONSUMER SEARCH       app/search/page.tsx                                      /search /buy /rent
```

Dependency runs **CRM → Backend Search**, never the reverse — proven by
`tests/runtime/crm-backend-search-independence.test.ts`, which boots the shipped bundle with every
external resource denied.

**Open on this branch:** authenticated Preview behavioural proof. Not started, and blocked — see §7.

## Search — PR #618 · #600

Not advanced at this checkpoint. Continue from fresh branch state, not from the governance branch.

## Neon / R2 — PR #620

Not advanced at this checkpoint.

## Agent lifecycle — PR #627

Not advanced at this checkpoint.

---
# 4. Master-consolidation system-impact findings

> **INHERITED FROM CHECKPOINT 2026-09-08, NOT RE-VERIFIED IN THIS RECOVERY (2026-09-10).** These
> findings are carried forward verbatim because avoiding a restarted audit after context loss is
> the whole purpose of this file. Their status was NOT re-proven on 2026-09-10 — treat every item
> below as "believed open at the 2026-09-08 checkpoint" and re-verify against fresh evidence
> before acting. Two exceptions are noted inline where the 2026-09-10 convergence work closed them.

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


---

# 7. Next exact governance actions

Rewritten 2026-09-10. The 2026-09-08 list is superseded; git history holds it.

## Immediately blocked on the owner

1. **Preview database.** Set Preview-scoped `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from the Neon
   console and redeploy. Until then every `/crm*` route on the Preview redirects to login and no
   authenticated behavioural proof is possible. This also unblocks `release-truth`'s deploy-runtime
   validator, the last non-passing CI row on #630.
2. **Rotate `neondb_owner`.** Outstanding since a password was printed earlier in this work. Neon
   child branches inherit the parent's password.
3. **Delete the Preview Neon branch `br-damp-forest-ad5kko85`** when acceptance completes.

## Next work, in order, once unblocked

1. Authenticated Preview behavioural proof for `/crm` and `/crm/search` — which application answers
   at each address, observed rather than asserted.
2. **My Listings** against Maya's real Cotality identity (`trestle_mls_id = 39361`, 36 listings as
   list or co-list agent): her listings present, unrelated closed records absent.
3. **Search media and geography** — real Cotality Media on cards; correct borough and neighborhood;
   remove the fabricated `borough || 'Manhattan'` fallbacks, the fabricated Bike Score, and the
   fabricated transit/commute figures.
4. **Sale form** — the equivalent of the rental hydration proof already landed for 145 E 48th St.
5. Saved Search, selection, client distribution, reporting and CMA — all unproven.

## Standing governance actions

1. Do not mark #630 Ready or merge while any check is in progress or while branch/`main` divergence
   is unreconciled.
2. Reconcile #595 once against then-current `main` without reintroducing competing authority files.
3. Never treat updating a documentation PR as proof that the corresponding runtime behaviour exists.
4. Continue owned Search / Agent / Neon lanes from fresh branch state rather than from a docs branch.
5. Do not open standalone duplicate projects for legacy URL cleanup, Lead identity, lease workflow,
   tax administration or idempotency until the complete readers/writers and canonical owner are
   established.

## Known open governance items not yet closed

- `MALLAN-CONTINUOUS-EXECUTION-STATE.md` exists on four feature branches and on none of them merged
  to `main`. This recovery puts it on `converge/crm-listing-workflow-2026-09-09`; it reaches `main`
  only when that branch does.
- `C:\Users\MayaAllan\Desktop\memory\` — mandated as a byte-identical mirror by `CLAUDE.md` §A.3 —
  does not exist. Either the directory is created or the rule is retired; today the rule is
  unfollowable.
- `.claude/skills/rebny-compliance/SKILL.md` is named as canonical by `CLAUDE.md` §H and `AGENTS.md`
  §3, but `.gitignore:155` (`.claude/*`) keeps it out of every checkout. A guard that read it was
  corrected on 2026-09-10 to read the tracked compliance index instead; the pointer contradiction
  itself is still open and is the owner's call, since §A.7 holds "skills".
