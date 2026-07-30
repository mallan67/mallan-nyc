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
| PR #585 plan | **0** |
| Recovered plan | **247**, across 33 families |

Recovered families:

```
ACT AGT ARC AUD AUZ BIZ BRK BUS CMA COT CRM DOC ERR GATE HYG IAM INT
LST MKT OPS PER PH POL REB SEA SEL SL SPEC TRN TXN UCBA VER
```

**Consequence for the ledger:** identifiers exist on the recovered side only.
Reconciliation must map PR #585's 141 prose sections onto identified
requirements, never the reverse, or 247 identifiers are lost.

## PR #579 — 12 changed files

```
.github/copilot-instructions.md
AGENTS.md
AI-START-HERE.md
README.md
config/capabilities.mjs                                  (12 capability entries)
docs/architecture/MASTER-PLAN-GAP-ANALYSIS-2026-07-27.md
docs/architecture/Mallan_Intelligence_Master_Plan.md     (135 headings)
docs/evidence/capability-evidence-2026-07-27-e57.md
docs/evidence/capability-evidence-2026-07-27.md
memory/EVIDENCE-STANDARD-2026-07-27.md
package.json
scripts/capability-audit.mjs
```

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

| source | requirement-bearing units |
|---|---:|
| Recovered plan | 247 identified requirements |
| PR #585 plan | 141 prose sections (unidentified) |
| PR #579 master plan | 135 headings |
| PR #579 capability registry | 12 entries |
| Safe `main` operational truth | OPS-024, OPS-025 |
| Deep system findings | 12 |

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
