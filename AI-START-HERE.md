# AI START HERE

This repository is `mallan67/mallan-nyc` only.

Before planning, reviewing, or changing code, read these files in order:

1. [`docs/architecture/MALLAN-PLATFORM-PLAN.md`](docs/architecture/MALLAN-PLATFORM-PLAN.md) — the single normative business, architecture, error, housekeeping, and implementation plan.
2. [`AGENTS.md`](AGENTS.md) — cross-agent operating rules, holds, evidence language, and review rules.
3. [`docs/PROJECT-HEALTH-DASHBOARD.md`](docs/PROJECT-HEALTH-DASHBOARD.md) — current operational status.
4. [`docs/PLATFORM-ISSUE-REGISTRY.md`](docs/PLATFORM-ISSUE-REGISTRY.md) — tracked issues, risks, and debt.
5. [`NEON.md`](NEON.md) — required before any Neon, Prisma, database, sync, migration, or relevant Vercel work.
6. [`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`](docs/compliance/COMPLIANCE-CANONICAL-INDEX.md) — required before listing, search, display, CRM contact, marketing, media, or public-text changes.

## Governing rule

When chat memory, old handoffs, dated plans, addenda, comments, or earlier reviews disagree with the canonical platform plan, stop and verify the current repository and effective source. Do not guess.

The canonical plan is amended in place. Do not create a revision, final, new, dated replacement, addendum, or supplemental platform plan.

## Listing identity

- `SL-*` = Mallan web sale listing.
- `RL-*` = Mallan web rental listing.
- `RLS*` = separate REBNY/Cotality provider record.
- The `SL-`/`RL-` prefix identifies transaction type; it does not prove whether a provider counterpart exists.
- A verified matched pair keeps the Mallan record as the canonical mallan.nyc page.
- The provider counterpart remains read-only and retained internally.
- The provider duplicate is suppressed from Mallan public surfaces.
- No authority handover occurs.

## Scope and safety

- Mallan Integrated is outside this repository and outside this plan.
- No merge or production release without Maya approval.
- Do not stage or modify unrelated work.
- Do not run destructive database, storage, cron, environment, migration, archive, or force-push operations without the applicable explicit approval.
- No implementation phase may be called complete without tests, runtime proof, health evidence, rollback, documentation, and operational ownership.

## Immediate program state

The next program phase is PH-1 from the canonical platform plan: verified inventory, document consolidation, route/error/workflow mapping, static-CRM inventory, listing-identity inventory, and housekeeping baseline.

Do not begin PH-2 architecture implementation until PH-1 findings are reviewed and approved.
