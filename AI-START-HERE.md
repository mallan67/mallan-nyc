# AI START HERE — mallan.nyc

**Applies to:** Claude, Codex, ChatGPT, GitHub Copilot, Gemini, and every current or future AI system or human contributor working in `mallan67/mallan-nyc`.

This file is the universal entry point. Tool-specific memory, chat history, generated summaries, and local notes do not override repository truth.

## Required reading order

1. `AI-START-HERE.md` — this entry point.
2. `AGENTS.md` — cross-agent constitution, holds, evidence language, and operating rules.
3. `docs/architecture/Mallan_Intelligence_Master_Plan.md` — authoritative target product and technology architecture.
4. `docs/PROJECT-HEALTH-DASHBOARD.md` — current operational status; never infer current health from the master plan.
5. `docs/PLATFORM-ISSUE-REGISTRY.md` — canonical issue, incident, risk, and technical-debt registry.
6. Latest `docs/operations/site-audit-handoff-YYYY-MM-DD.md` — current stop point and handoff evidence.
7. `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before touching any listing, CRM, lead, portal, media, search, advertising, email, report, or compliance-shaped surface.
8. `NEON.md` before any database, Prisma, migration, Neon, Vercel database, cron, storage, or projection work.
9. `CLAUDE.md` when operating through Claude; its tool-specific commands supplement but do not replace this hierarchy.

## Authority hierarchy

When documents conflict, apply this order:

1. Explicit current instruction from Maya Allan.
2. Applicable law, contract, REBNY/RLS requirement, and confirmed Cotality runtime behavior.
3. `AGENTS.md` and the canonical compliance index.
4. Current operational truth in the health dashboard, issue registry, and latest handoff.
5. The Mallan Intelligence Master Plan for target architecture and implementation direction.
6. Current source code and tests for what is actually implemented.
7. Historical audits, plans, memory files, PR descriptions, and chat transcripts as evidence only.

A target architecture document does not prove implementation. Existing code does not automatically define the desired architecture. Current production behavior must be proven separately.

## Repository boundary

This file applies only to `mallan67/mallan-nyc`.

Do not modify, commit to, or treat `Mallan-Integrated`, `mayaallan`, or any other repository as part of this work unless Maya explicitly expands the scope.

## Product boundary

Mallan is one company-owned operating system with separate experiences:

- **Public growth experience:** attract, educate, learn intent with consent, and create qualified calls to action.
- **Agent operating system:** professional search, property analysis, client service, reports, showings, offers, transactions, and retention.
- **Broker operating system:** producing-agent tools plus firm-wide people, compliance, forms, commissions, referrals, accounting support, technology, performance, and risk management.
- **Role-specific portals:** buyer, tenant, seller, and landlord experiences.

These experiences must not be collapsed into one generic dashboard or one identical search. They share canonical identity, property, listing, relationship, event, workflow, policy, evidence, and audit contracts.

## Cotality rule

The live Cotality/Trestle API is the only field, resource, enum, and runtime feed-behavior authority.

- Never guess from RESO standards, a CSV, a snapshot, another MLS, or an old audit.
- Run the repository’s live Cotality pull/verify process when a task depends on provider truth.
- Keep raw provider values and provenance.
- Map provider values through a versioned adapter into stable Mallan domain concepts.
- Unknown values must be reported and quarantined from affected regulated output; never silently map them.
- A provider schema match does not prove runtime behavior. Use live behavioral probes when behavior matters.

## REBNY and compliance rule

Operational rules must be centralized, versioned, effective-date aware, tested, and fail closed where authority or permission is unresolved.

Do not copy compliance formulas into routes or UI components. Use the canonical policy and compliance services identified by the compliance index.

## Evidence standard

Every factual finding, fix claim, and completion claim must be:

1. **Factual** — states exactly what was observed.
2. **Tested** — uses the correct verification method for the claim.
3. **Proven** — preserves reproducible evidence.
4. **Result-based** — explains the demonstrated behavior or outcome.

Three out of four is a failure.

Mandatory finding format:

```text
FINDING ID / TITLE
STATUS: confirmed | disproved | unverified-hypothesis
SCOPE / ENVIRONMENT:
COMMAND OR REQUEST RUN:
RAW OUTPUT OR CAPTURE:
EXIT CODE / HTTP STATUS:
WHAT THIS PROVES:
WHAT THIS DOES NOT PROVE:
USER OR BUSINESS IMPACT:
NEXT VERIFIED ACTION:
```

`unverified-hypothesis` is a legal confidence value. A hypothesis presented as a confirmed finding is a process failure.

Source grep can prove source presence. It cannot prove rendering, runtime behavior, data correctness, delivery, or production deployment.

## Change discipline

Before implementing:

1. Inspect current `main` and current production identity.
2. Classify the target capability as working, partial, unwired, duplicated, broken, obsolete, or missing.
3. Identify canonical owner files and consumers.
4. Identify compliance, data, migration, provider, and rollout dependencies.
5. Define the closed-loop acceptance criteria.
6. Use the smallest bounded PR that closes a real loop.
7. Add tests that fail before and pass after when behavior changes.
8. Keep schema, backfill, destructive cleanup, provider-contract changes, and broad UI rewrites in separate controlled changes unless an approved runbook says otherwise.
9. Prove the immutable deployment identity and live behavior after merge when the change affects production.
10. Update the issue registry, dashboard, handoff, and derived summaries in the same change when their status changes.

## Do not create parallel truth

Do not create replacement `STATUS`, `TODO`, `FINAL`, `V2`, `NEW`, duplicate master-plan, duplicate search-contract, duplicate policy, or duplicate field-registry documents.

Extend the canonical files. Dated audits may record evidence but may not silently become new authorities.

## Definition of done

A capability is not complete because a page, route, schema, model, prompt, or test exists. It is complete only when the required parts are connected and proven:

- canonical data ownership;
- provider and policy contracts;
- schema and migration where required;
- service and API;
- authorization and isolation;
- user interface;
- workflow and approval;
- artifact and evidence provenance;
- notifications and suppression;
- audit history;
- observability;
- tests;
- production proof where applicable;
- rollback;
- documentation and operational owner.

## Start-of-session declaration

Before doing substantive work, state internally or in the work log:

```text
Repository: mallan67/mallan-nyc
Current branch and HEAD:
Production identity checked: yes/no/not applicable
Canonical files read:
Task scope:
Explicit holds:
Evidence required:
Files expected to change:
```

If the required canonical file is missing, conflicting, or not available, stop and report the exact gap. Do not guess.