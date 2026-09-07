# Mallan institutional memory — design

> **Status:** DESIGN · **Created:** 2026-09-07 · **Author session:** cloud
> (`session_01H45GkB4cKoAWqAWfRFSHny`)
>
> **Implementation must be performed from a LOCAL CLI session** — it edits
> `memory/`, which carries the CLAUDE.md §A.3 desktop-mirror obligation that a
> cloud container cannot satisfy.

## Problem

Three different things are routinely confused:

| | What it holds | Survives session end |
|---|---|---|
| Full conversation | everything that happened | only where transcripts are stored |
| Active model context | recent turns + compacted summary | no |
| Git | exact code state | yes |

None of them holds **institutional reasoning**: why an architecture was chosen,
what was disproven, what Maya rejected, what must not be reopened, which evidence
was live versus inferred.

Observed cost of the gap (2026-09-07): session `session_015aiS7P4oSPuoP9oCJ12Tqw`
consumed 214,247 tokens and pushed nothing;
`git fetch origin claude/mallan-workstream-coord-4du74t` returns
`fatal: couldn't find remote ref`. That reasoning is unrecoverable.

## Finding — the store already exists

`memory/` is already this layer, in embryo. It holds 14 records that capture
reasoning rather than state, e.g. `IDX-PLUS-DISPLAY-GATE-2026-04-30.md`
("Universal rule learned: runtime payload behavior must be verified per feed")
and `HOLD-EXTERNAL-INVENTORY-2026-04-30.md` (what is parked and its release
conditions).

`HANDOFF.md` already implements supersession **by hand**:

> "Every statement below that says Phase D/DROP is 'NOT STARTED' … is SUPERSEDED
> and HISTORICAL."

**Therefore: extend `memory/` rather than starting a second decision store** —
not because a rule forbids a second store, but because the records already exist
here and cloud sessions can read Git while they cannot read local disk.

**Scope note (corrected 2026-09-07).** An earlier revision of this document
claimed the source-of-truth charter forbids a parallel store. That was an
overreach. The charter's "do not create parallel systems" (§1 rule 6, §13 rule 3)
is scoped by its own header and §13.1 to the domains in Sections 3-8 — Public
Search, CRM Search, Featured/Exclusives, Neighborhoods, Media, IDX/Trestle.
`memory/`, `docs/`, and an out-of-repo transcript archive fall outside that
scope. The charter does not govern them. The case for extending `memory/` rests
on the engineering reasons above, not on that rule.

## Rejected alternative — RAG over full transcripts

Considered and rejected as the *primary* retrieval layer.

- Transcripts are dominated by tool output, retries and abandoned approaches.
- Retrieval cannot distinguish a live decision from one considered-and-rejected
  or later reversed. A superseded decision retrieves with equal confidence.
- This is the precise failure mode CLAUDE.md §J classification and the §E
  fail-closed rule exist to prevent. The handwritten `HANDOFF.md` supersession
  banner is evidence the risk is already real at 14 files.

**Transcripts are retained as a keyed fallback archive, not as primary
retrieval.**

## Design

### 1. Record front-matter

Every `memory/` file gains a YAML header:

```yaml
---
id: MALLAN-SEARCH-0642
workstream: search
status: active            # active | superseded | historical
superseded_by: null       # id of the record that replaces this
created: 2026-08-21
updated: 2026-09-07
branches: [fix/neon-p0-event-driven-wake-2026-08-16]
prs: [618]
shas: [d19c03cd]
evidence_class: [A, B]    # CLAUDE.md §J classes substantiating this record
decision: >
  One-line statement of what was decided.
rejected: >
  What was considered and explicitly not done, and why.
transcript: local         # local | none — see §4
---
```

`status` and `superseded_by` are the load-bearing fields: a reader must never act
on a record whose status is not `active`.

### 2. `memory/INDEX.md`

Generated, never hand-edited. One row per record: id · workstream · status ·
branches · prs · one-line decision. This is what a session reads first to find
what is relevant to its current branch.

### 3. Git ↔ memory linkage

Commits touching a recorded decision carry a trailer:

```
Context-ID: MALLAN-SEARCH-0642
```

GitHub then shows only the identifier. The reasoning stays in `memory/`, and the
raw transcript (if any) stays on local disk under the same id.

### 4. Transcript archive — local, private, optional

Local CLI sessions can `/export`. Cloud sessions cannot write to local disk, so
their transcripts are **not** captured by any local scheme; their durable output
is the `memory/` record plus pushed commits.

Recommended local layout, keyed by the same ids, outside the repo and untracked:

```
C:\Users\MayaAllan\Mallan-Memory\transcripts\<ID>.md
```

Check the local retention setting before relying on resumability:

```
claude config get cleanupPeriodDays
```

The documented default is 30 days. Mallan workstreams run for months — raise it,
and treat `/export` as the durable copy regardless.

### 5. Session-start surfacing

A `SessionStart` hook reads the current branch, greps `memory/INDEX.md` for
matching `branches:`/`prs:` rows with `status: active`, and prints them.

**Touches `.claude/` — requires explicit Maya approval per CLAUDE.md §C before
implementation.**

## Division of authority

```
Git            = what changed, and the exact state
memory/        = why it changed, what was rejected, what must not be reopened
local archive  = the raw conversation behind a record, when a record is not enough
```

Linked by: `Context-ID`, branch, PR number, SHA, workstream.

## Implementation order

1. Add front-matter to the 14 existing `memory/` records (local session; mirror per §A.3).
2. Generate `memory/INDEX.md`.
3. Adopt the `Context-ID:` commit trailer.
4. Raise `cleanupPeriodDays`; begin `/export` for long workstreams.
5. **Approval gate** — `SessionStart` hook.

Steps 1–2 are mechanical and carry the real value. Step 5 is the only one behind
a hold.

## What this does not solve

- It does not make a new agent understand Mallan without reading. It makes the
  right reading findable.
- It does not capture reasoning nobody wrote down. A cloud session that ends
  without a record still loses its reasoning.
- Records are only as honest as their `status` field. A stale `active` record is
  worse than no record.
