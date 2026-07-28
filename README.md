# Mallan Real Estate Inc. — NYC Brokerage Platform

**Repository:** `mallan67/mallan-nyc`  
**Status:** Active development; production system at mallan.nyc  
**Scope:** Public website, licensed listing search, dynamic CRM target, broker operations, client portals, seller reporting, CMA, marketing controls, compliance, and explainable intelligence.

## Start here

Every human contributor and AI agent must read these files in order:

1. [`AI-START-HERE.md`](AI-START-HERE.md)
2. [`docs/architecture/MALLAN-PLATFORM-PLAN.md`](docs/architecture/MALLAN-PLATFORM-PLAN.md)
3. [`AGENTS.md`](AGENTS.md)
4. [`docs/PROJECT-HEALTH-DASHBOARD.md`](docs/PROJECT-HEALTH-DASHBOARD.md)
5. [`docs/PLATFORM-ISSUE-REGISTRY.md`](docs/PLATFORM-ISSUE-REGISTRY.md)
6. [`NEON.md`](NEON.md) before database, Prisma, migration, sync, storage, or relevant Vercel work
7. [`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`](docs/compliance/COMPLIANCE-CANONICAL-INDEX.md) before listing, search, display, CRM-contact, marketing, media, or public-text work

The canonical platform plan is the single normative source for the business model, architecture, listing identity, errors, housekeeping, and implementation phases. Amend it in place; do not create revision, final, new, dated replacement, addendum, or supplemental platform plans.

## Platform contract

Mallan.nyc is one dynamic NYC brokerage operating system with distinct public, agent, broker, buyer, tenant, seller, and landlord experiences on a shared application, identity, contract, policy, error, event, and audit foundation.

Cotality/Trestle is a read-only provider connection for Mallan's licensed listing data. REBNY controls applicable policy and feed rights. Mallan controls its website records, CRM, clients, portals, marketing, reporting, workflows, evidence, and public presentation.

### Listing identity

```text
SL-* = Mallan web sale listing
RL-* = Mallan web rental listing
RLS* = separate REBNY/Cotality provider record
```

The `SL-`/`RL-` prefix identifies transaction type. It does not prove whether a provider counterpart exists.

When a Mallan web record and a provider record are a verified matched pair:

- the Mallan record remains the canonical mallan.nyc page;
- the provider record remains read-only and retained internally;
- the provider duplicate is suppressed from Mallan public surfaces;
- Mallan presentation and workflow data remain separate from provider facts;
- no authority handover occurs.

### CRM direction

The existing static CRM is legacy migration source code, not the permanent target. Workflows move into the dynamic Next.js CRM in bounded, reversible slices and are retired only after parity, authorization, policy, production, and rollback proof.

### Non-negotiable rules

- No client-side provider calls.
- No guessed provider fields, statuses, values, permissions, or runtime behavior.
- No silent failures or silently ignored search criteria.
- No duplicate public result for a verified matched pair.
- No local mutation of the provider row.
- No provider refresh may erase Mallan-owned presentation or workflow data.
- Compliance fails closed.
- Valid zero-result searches are successful empty results, not errors.
- No deletion based only on grep or absence of a discovered caller.
- No production-complete claim without tests, runtime proof, health evidence, rollback, and documentation.
- No merge or production release without Maya approval.
- Mallan Integrated is outside this repository.

## Implementation sequence

The canonical plan defines the program phases:

1. **PH-1 — Canonical truth and inventory:** consolidate active guidance; inventory routes, entry points, static CRM workflows, errors, flags, jobs, dependencies, listing identity, and bloat.
2. **PH-2 — Shared foundation:** application services, authorization, contracts, error catalog, explicit source/ownership fields, and matched-pair identity.
3. **PH-3 — Working search:** deterministic, compliant public search with accurate scope and matched-pair suppression.
4. **PH-4 — Dynamic CRM and seller loop:** listing workspace, client workflows, seller activity, seller portal, and agent-controlled CMA.
5. **PH-5 — Marketing readiness:** consent, provenance, suppression, unsubscribe, policy review, dry runs, and controlled release.
6. **PH-6 — Explainable intelligence and continuous cleanup:** evidence-backed recommendations, outcome loops, contract drift monitoring, and ongoing bloat control.

The immediate next program work is PH-1 only. Do not start PH-2 implementation before PH-1 findings are reviewed and approved.

## Data, database, and infrastructure safety

Before touching `prisma/schema.prisma`, `prisma/migrations/`, relevant Vercel configuration, Prisma clients, provider sync, Neon, storage, or production database behavior, read [`NEON.md`](NEON.md) and follow its preflight, migration, cost, and rollback rules.

Do not combine documentation, feature, database, media, storage, cron, environment, or sync work in one unbounded branch.

## Compliance and licensed data

This repository handles licensed listing data and regulated brokerage workflows.

- Provider credentials and calls remain server-side.
- Public outputs use only authorized fields and inventory.
- Required attribution, address suppression, Participant Only, Owner Opt-Out, status, and other applicable rules are enforced server-side.
- Feed-field existence does not prove permission for every public, internal, portal, CMA, analytics, storage, export, or redistribution use.
- Listing data must not be used for model training, fine-tuning, embeddings, vector databases, resale, sublicensing, or derivative datasets unless separately authorized in writing.
- When uncertain, stop and verify the effective source instead of guessing.

See [`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`](docs/compliance/COMPLIANCE-CANONICAL-INDEX.md).

## Evidence and completion

A claim must state:

```text
what was checked
exact commit and environment
what the evidence proves
what it does not prove
```

A capability is complete only when its business purpose, authority, permitted use, identity, authorization, policy, contracts, UI, workflow, errors, evidence, tests, health checks, production or immutable-preview proof, rollback, cleanup, documentation, and operational ownership are connected and Maya approves release.

## Repository hygiene

Do not create parallel architecture plans, duplicate route contracts, arbitrary error formats, abandoned flags/jobs, revision copies, backup files, or permanent temporary code.

Every cleanup candidate must be traced, classified, owned, and removed only after safe-removal proof. See the housekeeping section of the canonical platform plan.
