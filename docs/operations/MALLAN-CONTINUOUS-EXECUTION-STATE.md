# MALLAN Continuous Execution State

**Updated:** 2026-09-06

This file tracks current execution state. It is subordinate to `MALLAN-PLATFORM-MASTER-PLAN.md` and must not become a second product/system plan.

## Durable context rule

AI session memory, handoff files, `CLAUDE.md`, `AGENTS.md`, old chats, audits, generated summaries, scratchpads, and previous-session narratives are non-authoritative and must not be recreated as parallel Mallan project truth.

A new session resolves state from:

1. `MALLAN-PLATFORM-MASTER-PLAN.md`;
2. this execution-state file;
3. current Git branch/SHA/worktree evidence;
4. verified authorized Cotality/Trestle contract where provider truth is required;
5. applicable legal/compliance authority for compliance decisions.

If historical evidence conflicts with those authorities, the historical evidence does not override them.

## Repository baseline for this cleanup

- Repository: `mallan67/mallan-nyc`.
- Cleanup base `main`: `2a83952a31c7aaa9367141763c1685269c51c380`.
- AI-reference cleanup branch: `chore/remove-ai-reference-sprawl-2026-09-06`.
- This cleanup changes repository documentation/context only. It does not authorize or perform Search behavior changes, Production deployment, Neon writes, schema/migration changes, environment changes, R2 changes, or secret/authentication changes.

## Ongoing execution rule

Feature completion follows:

`Proven Defect -> Root Cause -> All Affected Readers/Writers -> Correction -> Direct/Negative Tests -> Integration -> Downstream -> Compliance -> Preview -> Production proof when authorized.`

Do not reopen broad master-audit work to recover context. Reconcile the bounded affected dependency against the Master Plan, current Git evidence, and verified external authority, then continue execution.
