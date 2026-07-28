# Copilot Instructions — mallan67/mallan-nyc

Before proposing or changing code, read in this order:

1. `AI-START-HERE.md`
2. `docs/architecture/MALLAN-PLATFORM-PLAN.md`
3. `AGENTS.md`
4. `docs/PROJECT-HEALTH-DASHBOARD.md`
5. `docs/PLATFORM-ISSUE-REGISTRY.md`
6. `NEON.md` when database, Prisma, migrations, sync, storage, or relevant Vercel behavior is involved
7. `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` when listings, search, display, CRM contacts, marketing, media, or public text is involved

The canonical platform plan is the single normative source for business rules, architecture, listing identity, error governance, housekeeping, and implementation phases. Do not create parallel or revision-named platform plans.

Critical listing rules:

- `SL-*` = Mallan web sale listing.
- `RL-*` = Mallan web rental listing.
- `RLS*` = separate REBNY/Cotality provider record.
- A verified matched pair keeps the Mallan record as the canonical mallan.nyc page.
- The provider record is read-only and retained internally.
- The provider duplicate is suppressed from Mallan public surfaces.
- No authority handover occurs.

Do not guess provider fields, statuses, permissions, or current behavior. Verify against the current repository and the live authorized source when required.

No merge or production release without Maya approval. Do not touch unrelated files or workstreams. Mallan Integrated is outside this repository.
