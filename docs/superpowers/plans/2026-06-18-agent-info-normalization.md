# Retired record — agent_info normalization implementation plan

This file was a dated working record from 2026-06-18. It is retired: it is not current instruction and
it is not an authority for any implementation, hold or provider fact.

- Current authority: `MALLAN-PLATFORM-MASTER-PLAN.md`. Current state, holds and stop point:
  `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.
- Full historical text: Git history on `main` (frozen at `3656a423`), for example
  `git show 3656a42333f2be5e837015e0165387ea96fe99b6:docs/superpowers/plans/2026-06-18-agent-info-normalization.md`.
- The completed migration's result is the current Prisma schema; read the schema, not this plan.
- This path remains only because protected files (`prisma/schema.prisma` and `prisma/migrations/20260618181007_add_agent_info_typed_columns/migration.sql`) still cite it. Delete this file in the same change that
  removes those citations.
