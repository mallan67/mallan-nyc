# Mallan NYC Brokerage Operating System

Mallan NYC is the single operating platform for Mallan Real Estate Inc. across brokerage, agents, clients, listings, search, CMA, marketing, reporting, transactions, commissions, and post-deal relationships.

## Authority

Repository work follows this order:

1. [`MALLAN-PLATFORM-MASTER-PLAN.md`](MALLAN-PLATFORM-MASTER-PLAN.md) — sole Mallan product/system authority.
2. [`docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`](docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md) — current execution state only.
3. Verified authorized Cotality/Trestle contract and generated contract artifacts — provider fields, types, enums, permissions, and feed semantics.
4. Applicable REBNY/RLS/UCBA, NY DOS, Fair Housing, privacy, and other legal/compliance rules — business/display/compliance boundaries.
5. Current Git evidence, tests, CI, Preview/runtime, and authorized environment evidence — implementation proof.

AI session memory, handoff files, old chats, old audits, generated summaries, `CLAUDE.md`, and `AGENTS.md` are not project authority and must not be recreated as parallel project truth.

Canonical architecture:

```text
COTALITY RAW CONTRACT
  -> VERIFIED MAPPING
  -> MALLAN STORAGE / PROJECTION
  -> MALLAN BUSINESS RULE
  -> PUBLIC / CRM CONSUMER
```

## Core boundaries

- Repository: `mallan67/mallan-nyc` only.
- Authorized local checkout: `C:\Users\MayaAllan\Desktop\mallan-nyc`.
- Verify path, remote, branch, HEAD, worktrees, and dirty state before mutation.
- Do not create duplicate canonical objects or parallel truth systems.
- Mallan-authored listings are editable locally; third-party Cotality listings are read-only.
- Search is brokerage infrastructure and the foundation for CMA. Difficult criteria are corrected against the verified provider contract, not deleted to make tests pass.
- Form work must prove `create -> save -> reload -> edit -> save -> reload` with no silent data loss.
- Production, schema/migration, environment, Neon data, destructive R2, and other controlled mutations require explicit authorization.

## Development

Use the repository-declared Node runtime and install dependencies with `npm ci`.

Run targeted tests as a group for the affected impact graph. A green test alone is not workflow closure; require direct/negative, integration, downstream, compliance, Preview/runtime, and Production proof when Production proof is authorized and applicable.

## Technical references

Operational and technical documents under `docs/`, Cotality contract artifacts under `data/` and `docs/architecture/`, and compliance material under `docs/compliance/` are subordinate evidence/specification. If any such document conflicts with the Master Plan, the Master Plan governs Mallan product/system behavior; provider and legal authorities continue to govern their respective domains.

Do not create a new master plan, AI command center, cross-agent constitution, session-memory directory, handoff authority, or parallel execution-state file.
