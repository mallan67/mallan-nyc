# Neon ↔ Vercel Preview-Alias Incident — Closure Note

**Status:** CLOSED as **historical / stale** · **Mode:** REPORT ONLY · **Date:** 2026-05-28
**Author:** Claude Code under Maya direction
**Predecessor (authoritative background):** `docs/neon-vercel-integration-repair-plan-2026-05-17.md` (§F.8 support packet)

> **No infrastructure, environment variable, credential, Neon branch, integration binding, or app code was changed to produce this note. No secrets were printed or pulled.** This document records the evidence that closes the active-incident portion of the Neon/Vercel preview-alias investigation and states the standing recommendation: **monitor only.**

---

## 1. Incident status — HISTORICAL / STALE (not active)

The "Neon branching: Branch limit exceeded" check that stalled Vercel branch-alias auto-promotion is **not currently reproducing.**

- The only confirmed stall was on **PR #180**, branch `docs/rc8-operational-doctrine-2026-05-22`, deployment `dpl_2v6t5CK9o93AjnM7pHkRwVkNssLV` (READY) — which was corrected by a manual `vercel alias` reassignment.
- Three **newer** previews, none manually touched, auto-promoted their branch alias correctly (verified via `get_deployment` → `alias[]`):
  | PR | branch | deployment | `alias[]` auto-promoted |
  |---|---|---|---|
  | #265 | `fix/sentinel-l-platform-actionable-scanner` | `dpl_B5wGiparzXcMVpganyq5Ns6rxy2u` | ✅ |
  | #266 | `fix/sentinel-l-disable-old-pr-comments` | `dpl_GJFVJJzyXBtN39ECCkcpfwrBVCoN` | ✅ |
  | #272 | `fix/agent-listing-identity-cotality-url` | `dpl_DBBARoFLVVLrQXBturmBSqDCBjem` | ✅ |
- Last 40-deployment window: **all READY**, zero stuck / queued / building / error deployments.

## 2. Production status — HEALTHY and ISOLATED

- Plain `DATABASE_URL` and `DATABASE_URL_UNPOOLED` exist in Vercel **Production scope only** (rotate/manual-managed, ~70d), resolving to the production endpoint (`cold-waterfall` / `morning-bread-68708332`).
- 7/7 recent production deployments READY; `mallan.nyc/api/health` → `HTTP 200 {"success":true}`.
- Production does **not** depend on the Neon/Vercel integration env injection, so the preview-only check cannot affect it.

## 3. Preview status — WORKING; alias promotion active; preview DB separate from production

- **Preview `DATABASE_URL` is integration-owned.** Vercel `vercel env ls preview` shows **no plain Preview-scoped `DATABASE_URL`** — only the integration's store-prefixed `database_*` family (`database_DATABASE_URL`, `database_DATABASE_URL_UNPOOLED`, `database_POSTGRES_*`, `database_PG*`, created ~105d) plus an unused legacy `ASSISTANT_DATABASE_URL`. Preview DB connectivity is therefore supplied by the integration at deploy time.
- **Previews are NOT reading production directly.** Credential-free isolation test via `/api/listings` total:
  - preview (#265 alias): **9712**
  - preview (#272 alias): **9712**
  - production (`mallan.nyc`): **9725**
  The two preview aliases **converge on the same value (9712)** and **differ from production (9725)**, and the preview value **moves over time** (observed 9711/9713 → 9712). Frozen per-deploy clones could neither converge nor change; a direct production read would show 9725. → previews use a **single shared, live, integration-managed preview database that is distinct from production.**
- **No production-data-exposure risk** from previews.

## 4. Root cause

**Most likely a stale / orphaned one-time Neon ↔ Vercel integration check on PR #180** (plan-metadata cache asserting the old Free-tier 10-branch cap against a Launch project at 8/5000). It is **currently dormant** — the integration is functional for preview (supplies DB + working alias promotion on #265/#266/#272).

**Not confirmed closed.** Definitive confirmation (and retirement of the "wrong project at branch cap" hypothesis, "Candidate B") requires a read-only Neon inventory that could not be run in this session (`neonctl` not installed; no Neon API key). Because the symptom is not reproducing, this is non-urgent.

## 5. Action — MONITOR ONLY

Per the standing decision rule ("preview `DATABASE_URL` integration-owned **and** alias promotion currently working → monitor only; do not migrate unless the alias failure recurs"):

**NO INFRASTRUCTURE CHANGE.** Specifically do NOT:
- remove the Neon/Vercel integration
- disconnect / reconnect Neon
- rotate production credentials
- touch production `DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `ASSISTANT_DATABASE_URL`
- delete any Neon branch
- change app code (`prisma/schema.prisma` uses `env("DATABASE_URL")`; app reads `DATABASE_URL` / `DATABASE_URL_UNPOOLED`; it does **not** consume `POSTGRES_*` integration vars — code is not the cause)

**Re-open trigger:** if the "Branch limit exceeded" check fires again on a new preview AND stalls alias auto-promotion on a deployment that was not manually re-aliased.

## 6. Remaining optional check (read-only, operator-run; only to formally retire Candidate B)

```bash
neonctl projects list
neonctl branches list --project-id hidden-mountain-87248164      # bound preview project (neon-green-school)
neonctl branches list --project-id <neon-green-door-id>          # the suspicious near-duplicate, if present
```
Interpretation:
- If `neon-green-door` is **not** at a branch cap → **Candidate B killed**, audit fully closed.
- If `neon-green-door` **is** at/near a cap → produce a **cleanup plan only**; **delete nothing without explicit approval.**

---

## Cross-references
- `docs/neon-vercel-integration-repair-plan-2026-05-17.md` — prior investigation + §F.8 support packet (same issue, PR #149/#180 era)
- `NEON.md` §10–§11 — Launch-plan facts, preview-branch integration architecture, the `NEON_PROJECT_ID` mismatch note
- `docs/neon-launch-branch-policy-audit-2026-05-17.md` — Launch threshold-update audit

**Bottom line:** the system is healthy — production isolated, previews working with active alias promotion against a separate preview DB. Leave it alone. The only rational next step is this documentation plus the optional read-only `neonctl` inventory.
