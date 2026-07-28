# AGENTS.md — Cross-Agent Constitution

> **Single shared source of truth for every AI agent and human contributor working on `mallan67/mallan-nyc`.**
>
> Claude, Codex, ChatGPT, GitHub Copilot, Gemini, and any future agent must begin with `AI-START-HERE.md`, then this file. Tool-specific memory, old chat history, PR descriptions, and local notes do not override current repository truth.

This project is a live Cotality/Trestle REBNY IDX Plus synchronization and brokerage operating platform with downstream consumers including public search, agent search, CRM, portals, media, compliance, reporting, archive, email, contacts, transactions, and brokerage operations.

---

## 0. Universal reading order

1. `AI-START-HERE.md`
2. `AGENTS.md`
3. `docs/architecture/Mallan_Intelligence_Master_Plan.md`
4. `docs/PROJECT-HEALTH-DASHBOARD.md`
5. `docs/PLATFORM-ISSUE-REGISTRY.md`
6. Latest `docs/operations/site-audit-handoff-YYYY-MM-DD.md`
7. `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` for any compliance-shaped work
8. `NEON.md` for any database, Prisma, migration, projection, cron, Neon, or Vercel-database work
9. `CLAUDE.md` for Claude-specific commands and holds

The master plan defines the target architecture. It does not prove implementation or current production health.

---

## 1. Tool entry paths

| Tool | Entry path |
|---|---|
| Claude | `CLAUDE.md` → `AI-START-HERE.md` → this file → master plan → health dashboard → latest handoff |
| Codex | `AI-START-HERE.md` → this file → master plan; review the current PR head, never stale bot comments |
| ChatGPT | Read the repository through the GitHub connector; use this hierarchy rather than chat memory |
| Copilot / Gemini / other AI | `AI-START-HERE.md` → this file → master plan → task-specific canonical files |

---

## 2. Product and architecture boundary

Mallan is one company-owned operating system with separate experiences:

- **Public growth experience:** attract, educate, learn intent with consent, and create qualified calls to action.
- **Agent operating system:** professional search, listing intelligence, client service, reports, showings, offers, transactions, and retention.
- **Broker operating system:** producing-agent capabilities plus firm-wide people, compliance, forms, commissions, referrals, accounting support, technology, performance, and risk management.
- **Role-specific portals:** buyer, tenant, seller, and landlord.

Do not collapse these experiences into one generic dashboard or one identical search. They share canonical identity, property, listing, relationship, event, workflow, policy, evidence, and audit contracts.

Repository boundary: this constitution applies only to `mallan67/mallan-nyc`. Do not modify or treat Mallan Integrated, mayaallan, or any other repository as part of this work unless Maya explicitly expands the scope.

---

## 3. Invariants — never violate

1. **Proof-first.** A change is not done without the verification appropriate to the claim: failing test flipped green, direct source read for a purely static claim, immutable preview or production probe, runtime log, database query, or other captured evidence. Source grep does not prove rendering or runtime behavior.
2. **Fail closed.** If a REBNY, RLS, IDX, FARE Act, Fair Housing, advertising, consent, authorization, commission, provider, or canonical-file rule is unclear, stop and report. Do not guess.
3. **Review current HEAD.** A reviewer comment against an older commit is not proof that the current head remains defective. Check the current SHA and current diff first.
4. **Compliance first.** Before touching listings, search, syndication, exclusives, CRM leads, intake, portals, display gates, media, reports, email, advertising, or public text, read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and its task-specific canonical files.
5. **Cotality is the sole live feed authority.** Every resource, field name, enum, status, picklist, filter behavior, and runtime provider assumption must be verified against the live Cotality API and the repository’s live pull/verify process. Do not rely on a snapshot, hand-copied list, RESO generalization, another MLS, or old audit.
6. **Provider behavior is feed-specific.** Schema presence does not prove runtime population or semantics. New MLS/provider adapters require independent live coverage and behavioral verification.
7. **No provider terminology as permanent domain truth.** Preserve raw source values and provenance, then map through a versioned adapter into stable Mallan concepts.
8. **Unknown values are explicit.** Preserve, report, and quarantine unknown provider values from affected regulated output; never silently map them.
9. **No parallel authority.** Do not create competing `STATUS`, `TODO`, `FINAL`, `V2`, duplicate master-plan, duplicate search-contract, duplicate policy, or duplicate field-registry documents. Extend canonical files.
10. **No false success.** A UI may not show success unless the required backend record or action actually completed and was audited.
11. **No silent reinterpretation.** Saved searches, artifacts, policies, and provider contracts are versioned. Migrate or block old versions explicitly.
12. **Human approval for consequential action.** Client-facing advice, pricing recommendations, bulk outreach, negotiation drafts, sensitive content, and contract-related explanations require the approval level defined by the capability and policy registry.

---

## 4. Cotality rules

- Live API: `https://api.cotality.com/trestle`.
- Server-side credentials only.
- Use the generated live authority and drift guard already defined in the repository.
- Verify the whole affected surface when a field or value changes; a copied value is usually copied in more than one place.
- Preserve raw provider values, source timestamps, and contract versions.
- Separate Cotality platform behavior, REBNY policy behavior, and RESO vocabulary.
- Do not infer one field’s null semantics from another field.
- Do not infer a future non-REBNY feed’s behavior from the REBNY feed.
- Any provider-contract change must identify affected ingestion, database, search, DTO, alert, report, media, open-house, portal, and compliance consumers.

Current status tokens, field counts, and feed facts may change. Retrieve them through the live verification process rather than copying values from this file.

---

## 5. Evidence standard

Every factual finding, fix claim, and completion claim must be:

1. **Factual**
2. **Tested**
3. **Proven**
4. **Result-based**

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

`unverified-hypothesis` is an allowed confidence value. Presenting a hypothesis as a confirmed finding is not allowed.

Evidence language:

- Words such as “probably,” “likely,” “appears,” and “root cause” may not be used as findings unless clearly placed in the issue registry’s hypothesis format. “Root cause” requires direct evidence.
- Every issue has one canonical ID in `docs/PLATFORM-ISSUE-REGISTRY.md`.
- Changing an issue requires updating its derived summaries in the same PR: issue row, priority table, dashboard, and handoff where applicable.
- Never mark a status healthy without captured evidence.

---

## 6. Where truth lives

| Topic | Canonical file |
|---|---|
| Universal AI entry point | `AI-START-HERE.md` |
| Cross-agent constitution | `AGENTS.md` |
| Target product and technology architecture | `docs/architecture/Mallan_Intelligence_Master_Plan.md` |
| Live operational status | `docs/PROJECT-HEALTH-DASHBOARD.md` |
| All tracked issues, incidents, debt, and risks | `docs/PLATFORM-ISSUE-REGISTRY.md` |
| Dated session snapshot | `docs/operations/site-audit-handoff-YYYY-MM-DD.md` |
| Claude-specific command center | `CLAUDE.md` |
| Neon, Prisma, and database rules | `NEON.md` |
| Compliance per-area map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| Repository source-of-truth rules | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Live Cotality generated mirror | `data/cotality-enums.live.json`, generated and verified by the repository commands |

Historical audits, plans, memory files, and PR descriptions are evidence, not automatic current authority.

---

## 7. Non-negotiable holds

The complete current hold list lives in `CLAUDE.md`, `NEON.md`, the issue registry, and the latest handoff. At minimum, obtain explicit Maya approval before:

- production migrations or database pushes;
- Neon or Vercel environment/settings changes;
- manual cron triggers;
- reconciliation or destructive cleanup runs;
- archive-drain execution or large backfills;
- projection reader swaps or held projection work;
- external-inventory or sponsor implementation;
- syndication exports or partner integrations;
- broad CRM frontend rewrites;
- agent/skill/workflow configuration changes;
- `.github/workflows/**` changes;
- admin merge bypass;
- force-push to main.

A master-plan item is not automatic implementation authorization.

---

## 8. Change discipline

Before implementation:

1. Inspect current `main`, open PRs, and current production identity when relevant.
2. Read the task-specific canonical files.
3. Classify the capability as working, partial, unwired, duplicated, broken, obsolete, or missing.
4. Identify canonical owner modules and all consumers.
5. Identify provider, policy, data, migration, security, rollout, and operational dependencies.
6. Define the closed-loop acceptance criteria.
7. Use the smallest bounded PR that closes a real loop.
8. Add a failing test before the fix when behavior changes.
9. Keep schema, migration, backfill, destructive cleanup, provider-contract change, and broad UI change separate unless an approved runbook explicitly joins them.
10. Prove the immutable deployment identity and live behavior after merge when production is affected.
11. Update canonical operational documentation in the same PR when status changes.

Do not amend a published commit, bypass hooks, bypass signing, or force-push main.

---

## 9. Required validation

Run the task-appropriate repository validators. For compliance-shaped work, the baseline includes the repository’s current commands for:

- TypeScript/type checking;
- REBNY/RLS validation;
- compliance validation;
- UCBA audit;
- IDX validation;
- CRM tests when CRM surfaces change;
- operational health before high-risk deployment.

Use the current command definitions from `package.json`, `CLAUDE.md`, the compliance index, and engineering verification docs. Do not copy stale expected counts into this file as permanent truth.

All required exit codes must be zero. Do not edit tests or guardrails merely to silence a valid failure.

---

## 10. Review and merge policy

- Codex is preferred, not the sole gatekeeper.
- High-risk PRs require either a clean Codex review or two independent clean reviews plus a written exception note, subject to current repository policy.
- High-risk areas include migrations, environment flags, cron, archive/storage, public compliance, contact/lead writes, authorization, commission, and seller-report attribution.
- Low-risk documentation and read-only PRs require green CI, one independent review, no unrelated files, and no unresolved current-head finding.
- Every review finding must be fixed, proven pre-existing and moved to its canonical issue, or explicitly documented as held/out of scope. Never silently ignore it.

---

## 11. Handoff rule

Before ending a session:

1. Refresh the read-only health dashboard using the repository’s canonical health command when the environment permits.
2. Update only the assessed statuses actually verified; leave all others unverified.
3. Update the dated handoff with date/time, branch and SHA, open PRs, production identity when relevant, runtime evidence, unresolved blockers, changes, and exact stop point.
4. Update the issue registry and all derived summaries for changed issues.
5. Never rely on chat memory as the handoff.

---

## 12. Definition of done

A capability is not complete because a page, route, schema, model, prompt, or test exists. It is complete only when all applicable elements are connected and proven:

- business purpose and owner;
- canonical data ownership;
- provider and policy contracts;
- schema and migration;
- service and API;
- authorization and isolation;
- user interface;
- workflow and approval;
- artifact and evidence provenance;
- notification, consent, and suppression;
- audit history;
- metrics, cost, and observability;
- tests;
- production proof;
- rollback;
- documentation and operational owner.

When any required canonical file is missing, conflicting, or unavailable, stop and report the exact gap. Do not guess.