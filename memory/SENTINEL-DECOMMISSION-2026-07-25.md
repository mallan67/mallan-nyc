# Mallan Sentinel — repo-audit-bot subsystem DECOMMISSIONED (2026-07-25)

**Decision (Maya, 2026-07-25):** fully remove the "Mallan Sentinel" repo-audit-bot
subsystem. It was HELD; this is the explicit approval + record of the removal.

## What Sentinel was
A scheduled, report-only repo-audit bot (Claude-driven) that ran deep compliance
/ product / infra audits and wrote dated reports under `memory/audits/`. Its
write-integrity was self-verified by `scripts/sentinel-write-audit.mjs` (invoked
by the workflow), and it shipped as a tracked `.claude/agents/` spec so the
GitHub Actions runner could read it. A family of `sentinel-*` audit scripts +
tests + a `sentinel-g` tool + retention/mandate docs made up the rest.

## Removed (16 files)
- Workflow: `.github/workflows/repo-audit-bot.yml`
- Agent spec: `.claude/agents/repo-audit-bot.md`
- Tool: `tools/sentinel-g/run-sentinel-g.ts`
- Scripts: `scripts/sentinel-compliance-language-audit.mjs`,
  `sentinel-field-contract-audit.mjs`, `sentinel-listing-flow-static-audit.mjs`,
  `sentinel-write-audit.mjs`, `sentinel-write-listing-audit.mjs`
- Tests: `scripts/__tests__/sentinel-{compliance-language,field-contract,
  listing-flow-static,workflow-structure,write,write-listing}-audit.test.js`
- Docs: `docs/agents/SENTINEL-G-MANDATE-2026-05-28.md`,
  `docs/compliance/sentinel-l-retention-matrix-2026-07-21.md`

## De-referenced (active config only)
- `CLAUDE.md` — removed "Sentinel" from the two HELD-approval lists (§A.7, §C).
- `.gitignore` — dropped the Sentinel-specific `.claude/agents/repo-audit-bot.md`
  ship-exception and the `ops/audit/sentinel-l/` ignore; kept the unrelated
  ops-health `.ops-health-last` sentinel FILE and the general `/ops/audit/` ignore.
- `scripts/health/probe.ts` — dropped the "Sentinel audit" PR-title filter.

## Deliberately LEFT (not the subsystem)
- Generic **"sentinel value"** uses in `lib/**`, `tests/**`, `public/crm/**`,
  etc. (a programming term, e.g. the `OwnerOptOut`/`r2_attempts` sentinel values)
  — unrelated to the bot.
- The ops-health `.ops-health-last` sentinel file + NEON pre-commit guard.
- **Historical dated audit reports** under `docs/audits/**`, `docs/**`,
  `memory/audits/**` that mention Sentinel — those are immutable records of what
  happened, not active config; rewriting history is out of scope.

## Safety
No production code, `pr-check` gate, or npm script depended on the subsystem
(the `app/api/listings/suggest/route.ts` "sentinel" hit was an `OwnerOptOut`
sentinel-value comment). Git-reversible. Delivered as its own PR
(`chore/decommission-sentinel-2026-07-25`), separate from the release-truth work.
