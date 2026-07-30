# Planning reconciliation — ancestry evidence (2026-07-30)

Produced **before** any rebase, cherry-pick or force-push. Read-only inspection in
an isolated worktree. This document is the durable, in-repository record; a
working copy also exists in an external backup directory, but **nothing in the
architecture depends on that local-only path**.

## Base and heads

| item | SHA |
|---|---|
| Safe `main` (reconstruction base) | `04db1b9921130cc1150f29508101567537573acb` |
| PR #585 head (protected) | `f51848b02cef51b8eaee56b95aa90fe6ea2885c5` |
| PR #585 backup branch | `backup/pr585-f51848b0-before-reconciliation` → same SHA, verified |
| PR #579 head | `7c15b1d517baf0236062819cfd863b8df7c355e8` |
| Recovered planning head (unpushed) | `6e8ea2d9` |
| BIZ family commit | `8aa977253d9c7284ad7689669acc439ff7d80c61` |
| BIZ correction commit | `b08b976457d4a2547d208c89117452b596c67d0e` |

## The decisive ancestry fact

```
merge-base(b08b9764, f51848b0) = 60581e51445a9e4f3461b9f9d40ebe19b4a6851c
merge-base(b08b9764, main)     = 60581e51445a9e4f3461b9f9d40ebe19b4a6851c
```

`60581e51` is an **older `main`**. The PR #585 line and the recovered planning
line are two **independent continuations** from that common ancestor.

**This is not a fast-forward.** Neither line may be rebased wholesale onto the
other, and conflicts may not be resolved by taking "ours" or "theirs" for a whole
document.

## Commits on each line since `60581e51`

**PR #585 — 5 commits**

```
f51848b0 docs: make README a stable platform entry point
b334ba0d docs: point Copilot to canonical platform plan
61344762 docs: make canonical platform plan mandatory for all agents
0562c350 docs: add mandatory AI entry point
e9bb8160 docs: add canonical Mallan platform plan
```

**Recovered planning line — 12 commits**

```
6e8ea2d9 feat(plan): ACT, PER, IAM, BRK and the enforced completion gate
b08b9764 fix(plan): BIZ correction pass — separate timeline, authority labels, showing logic, compensation model
8aa97725 feat(plan): BIZ family — NYC brokerage engagements and decoupled compensation
fc9f94e1 feat(plan): TXN family — the actual NYC brokerage transaction role
04cdb5af fix(plan): POL-1 gate-by-gate null semantics — prevents recurrence of the 7,594-row suppression
1f2b1c28 docs: compile one canonical platform plan at docs/architecture/MALLAN-PLATFORM-PLAN.md
975180e6 chore(docs): one entry point, remove stub and doc bloat
e94f5f04 merge: bring AI entry points and platform plan into one branch
0e15cd6a docs: correct listing model to verified matched-pair; document SL/RL/RLS prefixes
7062b2ef docs(design): rev4 — fix authorization bypass, provenance concept mixing, empty-result modeling
18af5c43 docs(design): rev3 — apply review corrections C1-C7 and add traceability scaffolding
cb6f285b docs(design): frontend/backend integration architecture for mallan-nyc
```

## Document comparison

| file | PR #585 | recovered line |
|---|---:|---:|
| `docs/architecture/MALLAN-PLATFORM-PLAN.md` | 1,494 lines · 141 headings | **3,650 lines · 288 headings** |
| `AI-START-HERE.md` | 43 | **152** |
| `AGENTS.md` | 176 | **245** |
| `README.md` | 113 | **952** |
| `.github/copilot-instructions.md` | **27** | absent |

**Neither line is a superset of the other.** `.github/copilot-instructions.md`
exists only on PR #585; `GEMINI.md`, `config/capabilities.mjs`,
`memory/EVIDENCE-STANDARD-2026-07-27.md` and the `package.json` capability entry
exist only on the recovered line.

## Requirement identifiers — the reconciliation constraint

| line | distinct `XXX-###` identifiers |
|---|---:|
| PR #585 plan | **122**, across 19 families |
| Recovered plan | **248**, across 29 families |

> **Correction (Stage F2) — this is the most consequential error in this
> document.** An earlier revision stated that the PR #585 plan carries **0**
> requirement identifiers and that its 141 headings are "prose sections". That
> is false. PR #585's plan carries **122 identified requirements** using the
> **same `XXX-N` scheme** as the recovered line, plus 19 unidentified
> structural headings (the document title and the `Goal`/`Steps`/`Exit` blocks
> of `PH-1`…`PH-6`).
>
> The consequence is that this is **not** a mapping of unidentified prose onto
> identified requirements. It is a **version comparison between two revisions
> of the same identified document**, which is a far more tractable problem and
> admits a provable answer.

Recovered families:

```
ACT AGT ARC AUD AUZ BIZ BRK BUS CMA COT CRM DOC ERR GATE HYG IAM INT
LST MKT OPS PER PH POL REB SEA SEL TRN TXN VER
```

> **Correction (Stage F0).** An earlier revision of this document said **247
> identifiers across 33 families** and listed `SL`, `SPEC` and `UCBA` as
> families. That was a regex artefact, not a fact. Scanning the plan for the
> `XXX-####` *shape* matches 247 tokens, but four of them are not requirements:
> `GATE-2026` (from the filename `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`),
> `SPEC-2026` (`SELLER-001-SPEC-2026-07-03.md`), `UCBA-2026`
> (`data/UCBA-2026-Requirements.md`) and `SL-0004` (a Mallan listing record).
> Counting only `## XXX-N — title` headings gives **243 identifiers in 29
> families**. `GATE` *is* a real family (`GATE-1`…`GATE-8`); only the
> date-suffixed `GATE-2026` token is spurious. All four excluded tokens are
> recorded with their proving line in the ledger's excluded table.

**Consequence for the ledger (corrected, Stage F2).** Comparing every `XXX-N`
heading across `f51848b0` and `6e8ea2d9` gives a decisive result:

| relation | count |
|---|---:|
| identifiers on PR #585 | 122 |
| of those, present on the recovered line | **122 (all)** |
| **unique to PR #585** | **0** |
| identical title on both lines | 117 |
| **same identifier, different requirement** | **5** |
| present only on the recovered line | 139 |

**PR #585's plan is a strict subset of the recovered line by identifier.**
Nothing is lost by taking the recovered line as the base. The entire risk is
concentrated in the five collisions:

| id | PR #585 | recovered | nature |
|---|---|---|---|
| `ARC-1` | No client-side **MLS** calls | No client-side **provider** calls | wording; recovered is the correct generalization |
| `BUS-5` | REBNY responsibility | Mallan responsibility | **identifier reassigned** |
| `BUS-6` | Mallan responsibility | Repository boundary | **identifier reassigned** |
| `BUS-7` | Repository boundary | No dependency on external listing-entry products | **identifier reassigned** |
| `POL-1` | Compliance fails closed | Compliance fails closed, **except where the feed is pre-filtered** | **incident correction** |

Two findings follow, and both must reach the canonical plan:

1. **`BUS-5`/`BUS-6`/`BUS-7` were shifted down by one** when REBNY
   responsibility moved out of `BUS` into `REB-1`. No requirement was lost, but
   an identifier now means something different than it did — exactly what
   `DOC-8` forbids. The canonical plan must carry a retired-identifier mapping
   so that anything citing `BUS-5` from the PR #585 era resolves to today's
   `REB-1`.

2. **`POL-1` is the one place where merging PR #585 would cause harm.** Its
   unqualified "compliance fails closed" is precisely the uniform reading that
   produced the 2026-04-30 incident, in which affirmation logic applied to
   `InternetEntireListingDisplayYN` suppressed **7,594 rows that should have
   been displayable**. The recovered `POL-1` plus `POL-1.1`…`POL-1.5` is the
   corrected statement and **supersedes it absolutely**.

## PR #579 — 12 changed files

```
.github/copilot-instructions.md
AGENTS.md
AI-START-HERE.md
README.md
config/capabilities.mjs                                  (see correction below)
docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md
docs/architecture/Mallan_Intelligence_Master_Plan.md     (135 headings)
docs/evidence/capability-evidence-2026-07-27-e57.md
docs/evidence/capability-evidence-2026-07-27.md
memory/EVIDENCE-STANDARD-2026-07-27.md
package.json
scripts/capability-audit.mjs
```

> **Correction (Stage F0).** An earlier revision said `config/capabilities.mjs`
> holds **12 capability entries**. It does not. The file holds **three distinct
> kinds of identifier**, and a flat `id:` scan conflates them into a misleading
> single count of 24:
>
> | export block | kind | count |
> |---|---|---:|
> | `export const programs` | program/phase entries `P0`…`P11` | **12** |
> | `export const capabilities` | capability entries `CAP-*` | **11** |
> | nested inside `CAP-MEDIA-AI-PROVENANCE` | one compliance obligation, `NYC-DCWP-AI-MEDIA-DISCLOSURE` | **1** |
>
> The "12" was the *program* count, not the capability count. The ledger carries
> these as three separate sources (`PR#579-program-registry`,
> `PR#579-capability-registry`, `PR#579-capability-obligation`) so a program is
> never reconciled as though it were a capability.

Machine-governance files (`config/capabilities.mjs`, `scripts/capability-audit.mjs`,
the `package.json` script) appear on **both** PR #579 and the recovered line, so
the capability-registry question is live on two unmerged lines and must be decided
**once**, in the ledger — not twice.

## Conflicts requiring deliberate resolution

1. Both lines edit `MALLAN-PLATFORM-PLAN.md` from a common ancestor — a real
   content merge.
2. Files exist on only one line each (see above).
3. Safe `main` now carries **OPS-024** and **OPS-025** in
   `docs/PLATFORM-ISSUE-REGISTRY.md` and `docs/PROJECT-HEALTH-DASHBOARD.md`.
   Both planning lines predate those entries and carry **stale operational
   facts**. The incident records must not be overwritten.
4. `README.md` differs by 839 lines — a role decision, not a merge.

## Measured reconciliation scope

Superseded by the measured Stage F0 inventory. The ledger
(`MALLAN-PLATFORM-RECONCILIATION-LEDGER.md`) is authoritative; these are its
actual totals, which sum to **600** inventoried rows:

| source | rows |
|---|---:|
| Recovered plan (identified requirements) | 248 |
| PR #585 plan (122 identified + 19 structural) | 141 |
| PR #579 master plan (headings) | 135 |
| PR #579 program registry (`P0`…`P11`) | 12 |
| PR #579 capability registry (`CAP-*`) | 11 |
| PR #579 capability obligation (nested) | 1 |
| PR #579 machine-governance / evidence artefacts | 6 |
| PR #585 `AGENTS.md` | 13 |
| PR #585 `README.md` | 11 |
| PR #585 `AI-START-HERE.md` | 5 |
| PR #585 `.github/copilot-instructions.md` | 1 |
| Safe `main` operational truth (incl. OPS-024, OPS-025) | 9 |
| Deep system findings | 12 |
| **TOTAL** | **605** |

## Evidence commands

```
git merge-base b08b9764 f51848b0        -> 60581e51445a9e4f3461b9f9d40ebe19b4a6851c
git merge-base b08b9764 origin/main     -> 60581e51445a9e4f3461b9f9d40ebe19b4a6851c
git merge-base --is-ancestor f51848b0 b08b9764   -> non-zero (NOT an ancestor)
git bundle verify <preserved bundle>    -> okay
git log --oneline 60581e51..f51848b0    -> 5 commits
git log --oneline 60581e51..6e8ea2d9    -> 12 commits
```

All commands are read-only. No credentials or machine-specific sensitive paths
are recorded.

## Status

**Inspection only.** Nothing has been rebased, cherry-picked, force-pushed or
merged as a result of this document.
