# Retired record — legacy JSON column drop plan

This file was a dated working record from 2026-04-28. It is retired: it is not current instruction and
it is not an authority for any implementation, hold or provider fact.

- Current authority: `MALLAN-PLATFORM-MASTER-PLAN.md`. Current state, holds and stop point:
  `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.
- Full historical text: Git history on `main` (frozen at `3656a423`), for example
  `git show 3656a42333f2be5e837015e0165387ea96fe99b6:memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`.
- Neon storage and migration rules live in `NEON.md` under the Master; the current Prisma schema is the column truth.
- This path remains only because the protected `prisma/migrations/20260510095000_add_listing_agent_typed_columns/migration.sql` and some Neon documents still cite it. Delete this file in the same change that
  removes those citations.
