# Claude Continuation Instructions

This folder exists so long-running Mallan engineering sessions do not depend on chat history.

## Read order

1. `docs/architecture/MALLAN-PLATFORM-MASTER-PLAN.md` — sole product/system authority.
2. `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` — current execution state.
3. `docs/claude-instructions/CURRENT.md` — the current bounded continuation directive for the active workstream.

`CURRENT.md` is **not** a second master plan or audit. It is a subordinate execution directive and cannot override the Master Plan, the continuous execution state, Cotality live contract, or explicit Maya authorization boundaries.

## Rules for this folder

- Keep exactly one active continuation file: `CURRENT.md`.
- Update `CURRENT.md` in place when the active corrective sequence changes.
- Do not create additional master audits, replacement plans, or parallel execution-state files here.
- Historical evidence belongs in the existing audit/operations records, not as competing current instructions.
- Before mutation, verify repo, branch/worktree, and current remote head.
- Never guess Cotality fields or semantics; verify live against the authorized Cotality contract.
- Do not merge, deploy, mutate Production/Neon/R2, change environment, or perform destructive data/media actions without the required explicit authorization.

When starting or resuming this work, read `CURRENT.md` completely before taking action.
