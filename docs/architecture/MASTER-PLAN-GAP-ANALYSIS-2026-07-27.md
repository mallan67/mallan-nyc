# Mallan Intelligence Master Plan — Measured Gap Analysis & Competitive Technology Review

**Date:** 2026-07-27
**Document class:** Dated gap-analysis **evidence**. Under `AI-START-HERE.md` authority hierarchy
item 7, this ranks as evidence only — **not** architecture authority, **not** current operational
truth. Operational truth is `docs/PROJECT-HEALTH-DASHBOARD.md` and `docs/PLATFORM-ISSUE-REGISTRY.md`.
**Plan under assessment:** `docs/architecture/Mallan_Intelligence_Master_Plan.md` @ commit
`a30b6283c1f9e90a9adcf6251d715be528dda805` (PR #579 head), 1,947 lines.
**Code baseline measured:** branch `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` @ `262b6693`.
**Evidence standard:** `AI-START-HERE.md` §Evidence standard (canonical), enforcement detail in
`memory/EVIDENCE-STANDARD-2026-07-27.md`.

---

## 0. Two corrections recorded before anything else

Both are retained rather than deleted. They are live demonstrations of the exact failure modes the
evidence standard exists to prevent, and deleting them would destroy the proof that the standard
caught them.

### C-0.1 — "The plan was not in the repo" — WITHDRAWN

An earlier draft of this document stated the master plan "was **not** previously in the repo,"
citing:

```
$ find . -iname "*Intelligence_Master_Plan*"         → no output;  exit 0 (find exits 0 when it finds nothing)
$ grep -rl "MALLAN INTELLIGENCE" --include="*.md" .  → no output;  exit 1 (grep exits 1 when it finds nothing)
```

Note the asymmetry, which is itself a trap: `find` returning nothing exits `0`, while `grep`
returning nothing exits `1`. Neither code alone tells you what was found — the **output** does.

**Those commands were run against the working tree of `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26`.**
They prove only that the file was absent **from that branch's working tree**. They do not prove
repository absence. The plan was already committed on `docs/unified-ai-master-plan-2026-07-27`
(PR #579), proven by:

```
$ gh pr diff 579 --name-only
.github/copilot-instructions.md
AGENTS.md
AI-START-HERE.md
docs/architecture/Mallan_Intelligence_Master_Plan.md
```

**Lesson:** working-tree absence ≠ repository absence. A `find` proves the scope it was run in.

### C-0.2 — The analyzed document was the WRONG VERSION — MATERIAL

The first pass analyzed a copy taken from `~/Downloads/Mallan_Intelligence_Master_Plan.md`.
That file is a **stale earlier draft**, not the authoritative plan.

```
$ wc -l  <downloads copy>  <PR #579 copy>
  2295  downloads (stale draft)
  1947  PR #579 (authoritative)

$ diff <PR579> <downloads> | grep -c "^[<>]"
4243        # near-total rewrite, not an edit
```

Consequence: **every section citation in the first pass was numbered against the stale draft.**
The authoritative plan renumbers §2–§8 and merges the draft's §7 and §8 into a single §8.
All citations in this document have been remapped and re-verified by `grep -n "^## "` against
the PR #579 file. Mapping table:

| Stale draft | Authoritative (PR #579) | Title |
|---|---|---|
| §2.3 | **§3.2** | One canonical owner per concept |
| §2.4 | **§3.3** | No silent failure |
| §2.5 | **§3.4** | Build closed loops |
| §4.2 | **§5.3** | Recommended integration structure |
| §4.7 | **§5.8** | Unknown values |
| §4.8 | **§5.9** | Cotality change gate |
| §5.1 | **§6.1** | Versioned policy registry |
| §5.4 | **§6.4** | Effective-date behavior |
| §6.1–6.4 | **§7.1–7.4** | Person / Household / Organization / Property graph |
| §7.1 | **§8.1** | Transactional event outbox |
| §7.2 | **§8.2** | Runtime workflow engine |
| §7.3 | **§8.3** | Capability registry |
| §7.4 | **§8.4** | Human-service levels |
| §8.2 | **§8.6** | Artifact evidence |
| §15.4 | **§15.5** | Property passport |
| — | **§15.1** | Media *(new in authoritative — includes "AI modification provenance")* |
| §11.5 | **§11.5 + §11.6** | Tenant tools / Landlord tools *(split)* |

§9–§14, §16–§25 and Programs 0–10 retain their numbers.

**The stale Downloads copy must not be committed to the repository.** It has been removed from the
local working tree. Only the PR #579 version is authoritative.

---

## 1. Measured baseline (point-in-time, expected to go stale)

> **These are dated measurements, not permanent architecture facts.** They are valid for
> `262b6693` on `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` as of 2026-07-27.
> Re-run the commands before citing them again.

| Measure | Value | Command |
|---|---|---|
| Prisma models | **77** | `grep -c "^model " prisma/schema.prisma` |
| Migrations | **31** | `ls prisma/migrations/ \| wc -l` |
| API routes | **288** | `find app/api -name "route.ts" \| wc -l` |
| — CRM routes | **156** | `find app/api/crm -name route.ts \| wc -l` |
| — portal routes | **40** | `find app/api/portal -name route.ts \| wc -l` |
| Cron routes | **23** | `find app/api/cron -name route.ts \| wc -l` |
| Test files | **512** | `find . -path ./node_modules -prune -o \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) -print \| wc -l` |
| `lib/**/__tests__` dirs | **21** | `find lib -type d -name "__tests__" \| wc -l` |

**EXIT CODE:** all `0`. These are counting commands — `grep -c` with matches present, and
`find … | wc -l` pipelines — so `0` is genuinely each command's own exit code, not a masked one.
Contrast §2, where the searches find nothing and therefore exit `1`.
**WHAT THIS PROVES:** file and declaration counts at that commit.
**WHAT THIS DOES NOT PROVE:** that any route is reachable, that any model is populated in
production, that any test passes, or that any capability is wired end-to-end. No test run was
executed during this analysis. No production probe was executed during this analysis.

**Qualitative read (supported by the file listings above):** this is a substantial, well-tested
codebase with a real compliance validator chain — `ucba:audit`, `rls:validate`, `idx:validate`,
`compliance-check`, `trestle:*`, `ops:health`. The plan's §3.3 (no silent failure) discipline is
already operating; the Neon Phase-2A commits are textbook evidence-first delivery. What the plan
describes is **not a rewrite of this** — it is a structural layer that does not yet exist beneath it.

---

## 2. The four load-bearing absences

> **EXIT-CODE CORRECTION, 2026-07-27.** This section previously read
> *"**EXIT CODE `0`; zero matching files**"* for every search below. **That was wrong and is
> withdrawn.** `grep` exits `0` when it **finds** a match and `1` when it finds **none**. A
> "zero matching files" result is exit **`1`**.
>
> The `0` came from the wrappers actually used — `grep … | wc -l` and `grep … || echo "NONE FOUND"`
> — whose *pipeline* exit code is `0` no matter what `grep` returned. Recording that as the search's
> own exit code inverted the meaning of the evidence.
>
> Both forms are now shown below with the code each actually returns, re-verified at
> `40ae3917`. The error is preserved rather than quietly overwritten: the evidence standard
> requires the exact command **and** its actual exit code, and this is what happens when a
> convenience wrapper is mistaken for the command.

### 2.1 No event/workflow substrate — Program 4 measured at zero

**Bare searches — the commands, with their true exit codes:**

```
$ grep -rilE "outbox" lib app prisma scripts                        → no output;  exit 1
$ grep -rilE "workflow_run" lib app prisma scripts                  → no output;  exit 1
$ grep -rilE "capability_registry|capabilityRegistry" lib app prisma scripts
                                                                    → no output;  exit 1
$ grep -nE "model WorkflowRun|model Event" prisma/schema.prisma     → no output;  exit 1
```

**Exit `1` is the finding.** It means "searched successfully, found nothing" — as distinct from
exit `2`, which would mean a bad path or read error and would invalidate the result.

**The counting wrapper originally used, for reference:**

```
$ n=$(grep -ril "outbox" lib app prisma scripts 2>/dev/null | wc -l); echo "$n"
0
$ echo $?
0
```

Here `0` is `wc`'s exit code and `0` is also its *output* — two different zeros. Only the output
carries the finding.

**What plays this role today:** 23 fixed-schedule cron routes under `app/api/cron/`
(`agent-metrics`, `conviction-scores`, `data-retention`, `db-keepalive`, `demand-signals`,
`dom-reset`, `experiment-metrics`, `feed-reconcile`, `idx-sync`, `intent-profiles`,
`lead-scoring`, `lifecycle-triggers`, `listing-expiration`, `listing-momentum`,
`market-snapshots`, `media-sync`, `neon-branch-prune`, `one-cycle`, `prospect-triggers`,
`search-alerts`, `seller-scoring`, `social-proof`, `tenant-nurture`).

That is a **scheduler**, not a workflow engine. Plan §8.2 requires pause, resume, retry, wait,
approval, cancellation, idempotency, compensation/rollback, partial regeneration, and deadline
escalation. A cron has none of these.

**WHAT THIS PROVES:** no module or model in the searched paths declares an outbox, workflow run,
or capability registry.
**WHAT THIS DOES NOT PROVE:** that no ad-hoc equivalent exists under another name. Not exhaustively
searched for synonyms.

**Consequence:** every capability the plan describes as a closed loop (§23 Proofs 1–5) currently has
no substrate to run on. **Highest-leverage gap.**

### 2.2 No policy engine — Program 1's regulatory half measured at zero

```
$ grep -rilE "policy_registry|policyEngine|PolicyEngine" lib app prisma scripts
                                                                    → no output;  exit 1
$ grep -inE "contractVersion|policyVersion|contract_version|policy_version" prisma/schema.prisma
                                                                    → no output;  exit 1
```

Exit `1` = searched successfully, found nothing. Re-verified at `40ae3917`.

Compliance today is **strong but code-shaped, not data-shaped**. `lib/compliance/` holds 19 modules
(`gates.ts`, `idx-display-gate.ts`, `rls-enforcement.ts`, `rls-rules.json`, `rebny-validator.ts`,
`public-listing-filter.ts`, `status.ts`, `reso-mapper.ts`, …) plus four validator suites. It works.

Missing: the §6.1 registry (`policy_id`, `effective_date`, `superseded_date`, `version`,
`enforcement_mode`, `test_ids`) and — critically — **no version stamping anywhere in the schema.**

**Consequence:** the system cannot answer *"which rule was in force when this record was created?"*
Plan §6.4 (effective-date behavior) and §8.6 (artifact evidence) are both unimplementable until
versions are stamped. **This is migration-shaped and requires Maya's explicit approval**
(`CLAUDE.md` §A.7).

### 2.3 Cotality: one file locally, seventeen modules in the plan

Plan §5.3 specifies a 17-module tree at `lib/integrations/cotality/`.

```
$ ls lib/cotality/
cotality-enums.ts        # 1 file
```

Actual integration lives in `lib/idx/` — **29 files**: `auth.ts`, `fetch.ts`, `trestle-mapper.ts`,
`mapping.ts`, `sync.ts`, `media-sync.ts`, `media-sync-member.ts`, `public-dto.ts`,
`db-to-public-dto.ts`, `display-adapter.ts`, `card-fields.ts`, `cotality-telemetry.ts`,
`normalize-street-case.ts`, `write-suppression.ts`, `media-reconcile-guard.ts`,
`reconcile-decision.ts`, `media-set-hash.ts`, `watermark.ts`, `orphan-chunk.ts`, … plus `__tests__/`.

**This is a naming/boundary mismatch, not a defect.** `lib/idx/` already implements client, auth,
fetch, mapping, media, normalization, and telemetry.

Genuinely missing regardless of location:

| §5.3 module | Status |
|---|---|
| `metadata-diff` | **Partial** — `npm run trestle:diff` exists; **not wired to a blocking deploy gate** |
| `generated-contract` | **Absent** |
| `capability-registry` | **Absent** |
| `compatibility-tests` as a **blocking** gate (§5.9) | **Absent** |
| `ListingProvider.*` domain interface (§5.2) | **Absent** — callers reach into `lib/idx` directly |

**Note:** plan §5.3 already states *"This target structure must be reconciled with existing
canonical files before implementation. Do not create a second parallel integration tree if current
canonical modules can be evolved."* The plan asks for this reconciliation but does not perform it.
Correction **C-2** performs it.

### 2.4 Canonical graph is property-first, not person-first

Present and real: `CanonicalProperty`, `CanonicalBuilding`, `CanonicalUnit`, `ListingIdentity`,
`IdentityMatchAudit`, `IdentityReviewQueue` — genuine identity-resolution machinery for **property**.

```
$ grep -nE "model Person|model Household|model Organization|model Artifact" prisma/schema.prisma
                                                                    → no output;  exit 1
```

| Plan §7 entity | Status |
|---|---|
| §7.1 Person | **Missing.** Nearest: `Lead` + `LeadParty` + `FamilyMember` — role-shaped, not identity-shaped |
| §7.2 Household / decision group | **Missing.** `FamilyMember` is partial |
| §7.3 Organization (LLC, trust, estate, lender, managing agent, law firm) | **Missing entirely** |
| §7.4 Property graph | **Substantially present** |
| §7.7 Commitments | **Missing.** Nearest: `FollowUpTask` |
| §8.5 Artifact (versioned, approvable, staleable) | **Missing.** `CmaReport` etc. are one-off tables |

**§7.3 Organization is the most consequential omission.** NYC transactions run through LLCs, trusts,
estates, co-op boards, managing agents, and law firms. Without it, §15 (transactions) and §14.8
(commissions/referrals) have no counterparty entity to attach to.

**`UNVERIFIED-HYPOTHESIS`:** plan §7.1 warns "email and phone are supporting identifiers, not sole
identity keys." Whether `model Lead` currently keys on email was **not tested**. Requires reading
`model Lead` before any claim.

---

## 3. Measured status per Program

Assigned from §2 evidence using the plan's own §8.3 maturity vocabulary.

| Program | Measured status | Basis |
|---|---|---|
| **0** — Adopt/reconcile authority | `designed` | Plan committed on PR #579; capability registry absent |
| **1** — Provider & policy adaptability | `partial` | Cotality mapping strong; **policy registry at zero** (§2.2) |
| **2** — Canonical graph & identity | `partial` | Property side real; **person/org side absent** (§2.4) |
| **3** — Canonical search runtime | **`implemented`** | `lib/search/canonical/`, `visibility-contract.ts`, `listing-access-decision.ts`, `criteria-to-prisma.ts` + `__tests__`. **Strongest area.** |
| **4** — Events, workflows, artifacts, approvals | **`discovered`** | Zero implementation (§2.1) |
| **5** — Public growth system | `partial` | Routes exist (`/buy`, `/rent`, `/sell`, 5 boroughs, `/neighborhoods`, `/market`); §10.5 contextual CTAs and §10.6 progressive ladder **not verified** |
| **6** — Agent service system | `partial` | 156 CRM routes; loops cannot close without §2.1 substrate |
| **7** — Client portals | **`shell`** | buyer/seller/tenant/landlord = **2 `.tsx` files each**; 40 backing API routes. Backend ahead of frontend. |
| **8** — Broker operating system | `discovered` | `app/admin/` contains only `login` + `seller-report`. §14.8–14.11 absent |
| **9** — Transactions & after-close | `partial` | `Deal`, `Offer`, `Document`, `DocumentSignature`, `CommissionPayment` exist; `lib/document-vault/` = 1 file; no immutable ledger; no §15.5 property passport |
| **10** — Advanced intelligence | `partial` | Real signal machinery exists (`lib/buyer-intent`, `demand-index`, `conviction`, `lead-scoring`, `seller-readiness`, `listing-momentum`); §12.2 signal contract envelope **not verified** |

**The pattern:** Programs 3, 5, 6, 10 (features) were built **upward** without Programs 1, 2, 4
(substrate) **underneath**. That inverts the plan's own ordering, and it is the structural reason
compliance keeps needing per-route re-verification.

---

## 4. Ratified corrections to the master plan

Full normative text is in the plan's own **§26 Ratified corrections**. Summary and evidence basis:

| ID | Correction | Evidence |
|---|---|---|
| **C-1** | `audit_events` is **not** the §8.1 outbox — distinct systems, both retained | §4.1 below |
| **C-2** | Cotality consolidates on **`lib/idx/`**; no `lib/integrations/cotality/` tree | §2.3 |
| **C-3** | Neon/R2 remediation is a **hard dependency gate** before schema-heavy substrate | §4.2 below |
| **C-4** | Add **Program 11 — Decommissioning and consolidation** | §4.3 below |
| **C-5** | §24 acceptance criteria become **machine-enforced** via `capability:audit` | §4.4 below |
| **C-6** | AI-media provenance moves to early compliance **on existing-obligation grounds only** | §5.6 |
| **C-7** | Gap-analysis measurements are **dated evidence**, never permanent architecture facts | §1 |

### 4.1 (C-1) `audit_events` ≠ transactional outbox

Existing `model AuditEvent` (`prisma/schema.prisma:733`), verbatim field list:

```prisma
model AuditEvent {
  id          BigInt   @id @default(autoincrement())
  action      String   // "create" | "update" | "delete" | "status_change" | "login" | "logout"
  entity_type String   @map("entity_type")
  entity_id   String   @map("entity_id")
  user_type   String   @map("user_type")
  user_id     BigInt?  @map("user_id")
  changes     Json?    // { field: { old, new } } diff
  ip_address  String?  @map("ip_address")
  created_at  DateTime @default(now()) @map("created_at")
}
```

Plan §8.1 requires an event carrying `event_id`, `event_type`, `occurred_at` **and** `recorded_at`
(distinct), `actor`, `entity_type`, `entity_id`, `relationship_id`, `property_id`, `listing_id`,
`agent_id`, `source`, `source_event_id`, `contract_version`, `policy_version`, `payload`,
`sensitivity`, `correlation_id`, `causation_id`.

| Property | `audit_events` | §8.1 outbox |
|---|---|---|
| Purpose | Retrospective compliance/PII access record | Forward dispatch of work |
| Causality (`correlation_id`/`causation_id`) | **No** | Required |
| Version stamping | **No** | Required |
| `occurred_at` vs `recorded_at` | Single `created_at` | Both required |
| Delivery/consumer semantics | None | Required |
| Retention | 2-year rolling (per commit `048dbb24`) | Governed by workflow lifecycle |

**Ruling:** the outbox is **additive and separate**. `audit_events` is retained unchanged, keeps its
2-year bound, and **must not** be widened into an event bus. Similar name, different system.

### 4.2 (C-3) Neon/R2 as a hard dependency gate

Plan line 13 states the Neon/R2 campaign "is a separate infrastructure workstream. It must not be
represented as fixed." That is a **reporting** rule. It is **not** a sequencing rule, and the plan
contains no other Neon/R2 reference (`grep -n "Neon\|R2"` → 1 match, line 13).

Programs 2 and 4 add `Person`, `Household`, `Organization`, `Artifact`, `Event`/outbox, and
`WorkflowRun`, plus `contract_version`/`policy_version` columns on existing tables — a **large
write-volume and storage increase into the exact system currently under write-amplification
remediation** (branch `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26`, 11 unpushed commits,
plus `docs/superpowers/plans/2026-07-28-neon-cpu-storage-remediation.md` and
`2026-07-28-r2-storage-remediation.md` in flight).

**Ruling:** C-3 converts this from a reporting rule into a **gate**. No Program 2 or Program 4
schema work begins until the Neon/R2 remediation is verified complete and Maya approves.

### 4.3 (C-4) Program 11 — decommissioning

`grep -n "Program 11\|decommission"` against the plan → **0 matches.** The plan says what to build
and never what to retire. §21.1 step 8 says "remove the old path" but assigns no owner or program.

Observed candidates at repo root (`ls -d */`): `__pw-review/`, `__pw-review-v2/`, `__pw-review-v3/`,
`__pw-shots/`, `archive/`, `backups/`, plus `src/`, `backend/`, `frontend/` coexisting with
`app/` and `lib/`.
**`UNVERIFIED-HYPOTHESIS`:** whether each is genuinely dead is **not tested**. Program 11's first
deliverable is classification with evidence, not deletion.

### 4.4 (C-5) Machine-enforced capability registry

`grep -n "capability:audit"` against the plan → **0 matches.** §24's 26 acceptance checkboxes are
currently enforced by human memory, which drifts. C-5 makes them a validator in the existing chain,
consistent with how `ucba:audit` and `rls:validate` already operate in this repo.

Delivered in this PR as **schema-free, static** artifacts (no migration, no hold triggered):

- `config/capabilities.mjs` — the registry. **Data only**: no imports, no filesystem, no network,
  no environment reads, no side effects;
- `scripts/capability-audit.mjs` — the validator;
- `docs/evidence/capability-evidence-2026-07-27.md` — the durable evidence artifact every
  promoted status points to;
- `npm run capability:audit` — the entry point.

**Promotion thresholds are enforced** per plan §26 C-5.1. `implemented` requires a complete
structured evidence record — exact command, `resultArtifact`, integer `exitCode`, `testedAt`,
`targetSha`, `proves`, `doesNotProve`. Placeholders (`unverified`, `tbd`, `pending`) never satisfy
an evidence field. A missing declared path is a **violation** for a promoted capability. Program
`assessment` and capability `status` are separate vocabularies and the validator rejects confusion
between them (§26 C-5.2).

**Test evidence was captured at prior PR head `6d2518b8`**, not at the current head.
`git diff --name-only 6d2518b8 40ae3917` shows changes only to the capability registry, the
validator, the master plan, this gap analysis, and the evidence document — **no `lib/search`,
`lib/idx`, or `lib/compliance` application or test file changed between those commits**
(`… | grep -E "^lib/|\.test\.|\.spec\."` → no output, exit `1`). The results below therefore remain
valid for the code they tested. Full detail in `docs/evidence/capability-evidence-2026-07-27.md`.

| Suite | Result | Exit |
|---|---|---|
| `npx jest --config lib/search/jest.config.js --ci` | 23 suites / 625 tests passed | `0` |
| `npx jest --config lib/idx/jest.config.js --ci` | 39 suites / 784 tests passed | `0` |
| `npx jest --config lib/compliance/jest.config.js --ci` | 14 suites / 381 tests passed | `0` |

Negative evidence for the media split: `grep -rilE "editType|virtualStaging|aiModified|disclosureRequired"`
over `lib/idx/ lib/media/` → **no output, exit `1`** (no matches). Zero of the ten §17.5 provenance
scope items exists.

**The validator was negative-tested**, not merely run green — a validator that only ever passes
proves nothing. Every run is preserved verbatim, with its raw output and exit code, in evidence
**E-5** (`docs/evidence/capability-evidence-2026-07-27.md`):

| Test | Induced fault | Violation raised | Exit |
|---|---|---|---|
| E-5.1 | none — positive control | — | `0` |
| E-5.2 | program carries `status` | `PROGRAM_USES_STATUS`, `ILLEGAL_ASSESSMENT` | `1` |
| E-5.3 | unearned `production` | `UNEARNED_STATUS` ×8, `NO_OWNER` | `1` |
| E-5.4 | promoted path missing | `PROMOTED_PATH_MISSING` | `1` |
| E-5.5 | placeholder `exitCode` | `EVIDENCE_INCOMPLETE` | `1` |
| E-5.6 | restoration check | `cmp` byte-identical | `0` |

E-5.3 is the informative one: `CAP-SEARCH-CANONICAL`, the strongest capability in the registry with
a genuine 625-test pass, still **cannot** reach `production` on that evidence. It is short by eight
distinct proofs plus a named owner.

**Local evidence is sufficient for `implemented`** (ratified 2026-07-27) provided it carries
command, output, exit code, **environment**, target SHA, and proof boundary — `environment` is now
a required field of every evidence record. Durable CI and live-runtime evidence are required only
for `limited_release` and `production`.

**Not** wired into `.github/workflows/**` — that path is held pending Maya's approval
(`CLAUDE.md` §A.7).

---

## 5. Competitive technology landscape (July 2026)

> **Source class: trade press and vendor material.** Adequate for competitive orientation.
> **Not** adequate for any compliance, legal, or Cotality field-truth claim (`CLAUDE.md` §J.3).
> Nothing in this Part may be cited as authority for a field, a REBNY rule, or a legal obligation.

### 5.1 Compass now owns the NYC field

The **Compass–Anywhere merger closed January 9, 2026**, faster than Compass itself had guided.
Compass absorbed **Corcoran, Sotheby's International Realty, Coldwell Banker, and Century 21** in a
**$1.6B all-stock** deal. Combined: **~340,000 agents, ~$414B annual sales volume — larger than the
next five brokerages combined.**

Technology on top of that scale:

- **Compass One** — client-facing shared workspace (launched 2024, expanded through 2026). Clients
  see offers, appraisals, listing contracts, open houses, market analyses, a calendar, and tasks.
  This is materially the plan's **§13 client portals**, already shipped.
- **Home Platform** — deployed across all company-owned brands July 2026; Compass calls it the
  largest technology deployment in residential real estate history.
- **Voice-activated AI assistant** — agents draft emails, create follow-ups, generate marketing
  collateral, and send Compass One invitations hands-free. This is the plan's **§17.4 voice layer**,
  already shipped.
- An AI "coach" and a brokerage comparison tool (July 2026).

Douglas Elliman's CEO publicly called the merger "a mess" from the outside. Four-brand integration
risk is real, and it is the window a disciplined smaller operator has.

### 5.2 SERHANT — the AI-native boutique playbook

- **$45M raised** (Camber Creek, Left Lane Capital) to build **S.MPLE**, positioned as an
  "AI-powered chief of staff" for agents.
- Explicitly **human-in-the-loop** — "smart workflows *with real human oversight*." Same thesis as
  plan **§8.4 human-service levels**.
- Publishes throughput metrics (1,400+ requests processed, 5,000+ agent hours saved) — i.e. they
  measure plan **§17.7 AI economics**.
- Expanded to California (April 2026) and Texas (June 2026); T-Mobile SuperMobile partnership.

**Read:** a boutique can compete on technology. Their differentiator is *operational leverage per
agent*, not proprietary data.

### 5.3 Zillow / StreetEasy — owns the consumer, now owns the search box

- **LLM-powered AI search rolled out to ~5% of Zillow's audience** (millions of users).
- Long-standing ML: Home Value Estimate, Listing Recommendations, **Buyer Propensity Scoring**.
- **StreetEasy Agent Advantage** (April 2026) — two-tier paid membership (Pro / Signature):
  priority search placement, performance analytics, customizable comps reports.
- Owned stack: Zillow Premier Agent, Rentals, **Follow Up Boss** (CRM), **ShowingTime**,
  **dotloop** (transactions), Zillow Closing, Trulia, Out East, HotPads.

**Read:** Zillow already owns CRM + showings + transaction rails, and StreetEasy is the NYC consumer
front door. Mallan cannot win consumer search volume. Mallan can win **depth of service after
contact** — which is what Programs 2, 4, 6 actually build.

### 5.4 The shared data layer — Cotality/Trestle

- **REBNY replaced Perchwell with CoreLogic as RLS back-end provider** (announced Feb 2025), citing
  CoreLogic's ability to build a centralized building database. **CoreLogic now trades as Cotality.**
- RLS is **RESO Data Dictionary + OData Web API**; REBNY brokerages and vendors submit through it.
- UCBA changes take effect in 2026.

**Read:** every REBNY competitor drinks from the same Cotality pipe Mallan does. **Listing data is
table stakes, not a differentiator.** This directly validates plan §18 — buy the commodity feed,
own the intelligence.

### 5.5 NYC-specific intelligence vendors — where the moat actually is

| Vendor | What they own |
|---|---|
| **UrbanDigs** | Independent Manhattan/Brooklyn pricing intelligence; real-time supply/demand stats; sells to agents (KW NYC partnership) |
| **Marketproof** | Largest NYC condo dataset; **AI-enhanced skip tracing** for owner outreach; instant CMAs; property analytics |
| **Localize.city** | Israeli AI/urban-planning data (Madlan subsidiary); mines public datasets with data scientists + urban planners for quality-of-life signals |

**Read:** these three each sell *pieces* of the plan's §7.4 property graph and §15.5 property
passport — **to Mallan's competitors.** The plan's ACRIS/DOB/DOF/PLUTO/HPD integration (§4) is the
one component no large competitor has bothered to build well for NYC. **That is the defensible moat.**

### 5.6 (C-6) AI-altered media disclosure — SIGNAL, NOT LAW

> **CONFIDENCE: `unverified-hypothesis` as to legal obligation. Class C finding (`CLAUDE.md` §J.1).**
> An earlier draft of this section stated "NYC **will** require disclosure" and "§17.5 is about to
> become law." **Both are withdrawn as overclaims.**

| Question | Answer | Source class |
|---|---|---|
| Does an enacted NYC law require AI-alteration disclosure on listings today? | **No** | Secondary + legal-industry |
| What exists? | A **recommendation** — 1 of 23 actions in the 68-page "Rental Ripoff Report," released July 2026 by the Mayor's office, shaped by testimony from ~2,400 tenants | Secondary |
| Legal mechanism | **Proposed DCWP agency rulemaking.** Administration stated the package would be pursued via a mix of executive action, agency rulemaking, legislation, and litigation | Secondary |
| Enforcing agency | Department of Consumer and Worker Protection, described as coordinating with Zillow/StreetEasy | Secondary |
| Effective date | **None published.** Roughly three-year staggered timeline | Secondary |
| Legal-industry read | A NYC real-estate law firm characterizes it as **"a coming AI-altered listing disclosure rule"** — preliminary, in development, **not yet binding on owners** | Legal-industry secondary |

**WHAT THIS PROVES:** NYC has publicly signaled intent to regulate disclosure of AI-altered listing
media and named DCWP as the vehicle.

**WHAT THIS DOES NOT PROVE:** that any legal obligation binds Mallan today; that rule text exists;
that a comment period has opened; that an effective date is set; that final scope will cover sales
as well as rentals; or that scope will match §17.5's field list.

**Evidence limitation, stated plainly:** every source here is **secondary**. The official NYC.gov
release returned **HTTP 403** to automated fetch and was **not read directly**. The 68-page report
was **not read**. No Local Law number, Intro number, or DCWP rule citation has been obtained.

**Required before any implementation claim** (`CLAUDE.md` §E fail-closed, §J.4 Class-C proof): a
dated official source — the NYC.gov release read directly, the report PDF, a City Record notice of
proposed rulemaking, a Council Intro number, or a REBNY member notice.

**Why it still moves in sequence.** Plan **§15.1 already requires "AI modification provenance"** in
the canonical media contract, and **§17.5 already requires** preserving original asset, derived
analysis, edited version, edit type, provider/model, date, disclosure, approval, publication
history, and withdrawal status. Building that envelope is defensible **today on existing grounds** —
REBNY/RLS media rules and plan §3.2 — entirely independent of whether DCWP ever issues a rule.

**Ruling (C-6):** move the **§15.1/§17.5 provenance envelope** into the early compliance program on
**existing-obligation grounds only**. Register the DCWP item in the §6.1 policy registry as
`review_status: monitoring`, `enforcement_mode: none`, **no `effective_date`**. Do **not** implement
a disclosure *gate* against hypothetical rule text — that would violate §5.8 in spirit (never act on
an unclassified value). Same treatment for the report's tenant-union recognition, repeat-offender
enforcement, and building-registration items: **monitor, do not implement.**

---

## 6. Recommended sequence

Nothing below starts without Maya's approval. Several items are explicitly held
(`CLAUDE.md` §A.7, §C).

**Tier 1 — no migration, no hold triggered, deliverable now:**

1. Land the plan as authority + record §26 ratified corrections. *(this PR)*
2. **Capability registry as a static file** — `config/capabilities.mjs` + `capability:audit`
   validator enforcing §24. Program 0 with zero schema risk. *(this PR)*
3. Extract the **`ListingProvider`** interface over `lib/idx/` — pure refactor, no migration.
4. Promote `trestle:diff` to a **blocking** PR gate (§5.9). *(CI wiring is held — needs approval)*

**Tier 2 — migration-shaped, requires Maya's explicit approval AND the C-3 Neon/R2 gate:**

5. `contract_version` + `policy_version` stamping (§6.4, §8.6).
6. Policy registry tables (§6.1).
7. Transactional outbox + `WorkflowRun` (§8.1, §8.2).
8. `Person` / `Household` / `Organization` (§7.1–7.3).

**Tier 3 — escalated on existing-obligation grounds only:**

9. §15.1/§17.5 AI-media provenance envelope. DCWP item stays `monitoring` until an official source
   is captured (§5.6).

---

## Sources

**Competitive / trade press (Part 5) — orientation only, not authority:**

- [Compass–Anywhere merger closed (The Real Deal, Jan 2026)](https://therealdeal.com/national/2026/01/09/compass-anywhere-merger-has-closed-heres-what-to-know/)
- [What the merger means for the NY market (The Real Deal)](https://therealdeal.com/new-york/2026/01/10/compass-anywhere-mega-merger-new-york-market-agents/)
- [Compass rolls out AI-powered Home Platform (RISMedia, Jul 2026)](https://www.rismedia.com/2026/07/02/compass-rolls-out-ai-powered-home-platform-across-company-owned-brokerage-brands/)
- [Compass One client portal (HousingWire)](https://www.housingwire.com/articles/compass-one-portal-clients-listings/)
- [Compass unveils AI Assistant (Real Estate News, Jul 2026)](https://www.realestatenews.com/2026/07/21/compass-unveils-ai-assistant-brokerage-comparison-tool-launches)
- [Douglas Elliman CEO on the merger (Inman)](https://www.inman.com/2026/01/28/douglas-elliman-ceo-on-compass-anywhere-from-the-outside-it-looks-like-a-mess/)
- [SERHANT. secures $45M for AI platform (HousingWire)](https://www.housingwire.com/articles/serhant-45m-funding-ai-camber-creek-left-lane-capital/)
- [S.MPLE by SERHANT.](https://serhant.com/simple)
- [StreetEasy's AI journey with LLMs (Zillow)](https://www.zillow.com/news/revolutionizing-the-real-estate-experience-with-llms-streeteasys-ai-journey/)
- [StreetEasy Agent Advantage (Real Estate News, Apr 2026)](https://www.realestatenews.com/2026/04/14/streeteasy-product-aims-to-give-agents-an-edge-in-tough-market)
- [Zillow leans into AI, revenue up 18% (GeekWire)](https://www.geekwire.com/2026/zillow-group-leans-into-ai-as-revenue-climbs-18-in-flat-housing-market/)
- [REBNY taps CoreLogic for RLS, replacing Perchwell (The Real Deal)](https://therealdeal.com/new-york/2025/02/11/rebny-taps-corelogic-for-rls-perchwell-provider-change/)
- [Trestle by Cotality](https://www.cotality.com/products/trestle)
- [REBNY Residential Listing Service](https://www.rebny.com/rls/)
- [Marketproof Pro](https://marketproof.com/pro)
- [UrbanDigs](https://www.urbandigs.com/)

**Regulatory (§5.6) — status: proposed, not enacted:**

- [NYC Rental Ripoff Report — owners' guide, legal analysis (Nacmias Law)](https://nacmiaslaw.com/resources/articles/nyc-rental-ripoff-report-owners-guide) — basis for "proposed rulemaking, not yet binding"
- [NYC proposes AI disclosure rules for rental listing photos (Fortune, Jul 2026)](https://fortune.com/2026/07/22/mamdani-ai-altered-rental-listing-disclosures/)
- [NYC targets deceptive AI images in rental listings (Northeast Times)](https://northeasttimes.com/2026/07/19/new-york-city-targets-deceptive-ai-images-in-rental-listings/)
- [Rental Ripoff Report — 23 tenant actions (Bushwick Daily)](https://bushwickdaily.com/news/that-streeteasy-listing-photo-could-be-ai-altered-and-landlords-dont-have-to-tell-you-mamdanis-rental-ripoff-report-would-change-that-among-22-other-new-tenant-rules/)
- **NOT READ — official primary source, HTTP 403 to automated fetch:**
  [Mayor's Office release, "Rental Ripoff Report" (nyc.gov, Jul 2026)](https://www.nyc.gov/mayors-office/news/2026/07/mayor-mamdani-releases--rental-ripoff-report---outlining-new-act).
  §5.6 must not be upgraded from `monitoring` until this or an equivalent primary source is captured.
