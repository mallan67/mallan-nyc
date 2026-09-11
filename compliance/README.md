> **HISTORICAL NOTE (2026-09-05, Search Consolidation Packet 2):** any mention of **RealPlus** in this document describes a former submission tool and is retained as history only. RealPlus has no role in Mallan's application architecture. Cotality/Trestle (`api.cotality.com/trestle`) is the only provider and feed authority; REBNY RLS submission happens outside this system. See `docs/operations/evidence-2026-09-08/provider-system/REMOVAL-2026-09-08.md`.

# Compliance Library — Mallan Real Estate Inc.

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806
> **Jurisdiction:** New York State / NYC | **Feed:** REBNY RLS via Trestle (Cotality)
> **REBNY RLS submission:** outside this system (REBNY does not grant listing input to individual brokers) | **IDX Display:** Trestle IDX Plus WebAPI (public display + internal CRM + reporting) | **Stage:** Live Production
>
> **IDX SCOPE (Confirmed by REBNY 2026-03-27):** IDX feed powers: (1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting. Client data stays on mallan.nyc — never passes through RealPlus or third parties. IDX feed is limited to the IDX-released field set and IDX-eligible inventory only — it is NOT full-market search. Full RLS inventory search and listing submission happen outside this system. mallan.nyc does NOT submit listings to the RLS and is NOT an LMP.

---

## AUTHORITY (Packet 2 closure, 2026-09-06)

| Layer | Source | Governs |
|---|---|---|
| **COTALITY LIVE CONTRACT** | `lib/cotality/live-contract.ts` (the dated live pulls from api.cotality.com) | provider facts: which fields exist, which enum members exist — for every provider-named field |
| **REBNY / UCBA** | `lib/compliance/rebny-ucba-rules.ts` (+ `lib/compliance/rls-enforcement.ts`, the one required / conditional evaluator) | compliance and business rules: required-under-condition fields, removed fields, content rules, display policy, DOM |
| **MALLAN** | `lib/listings/mallan-form-contract.ts`, `lib/listings/mallan-status.ts`, `lib/crm/listing-form-mapping.ts` | form input, workflow, storage; the server-owned conversion of form state into live vocabulary |
| **RESO** | — | vocabulary only; never an authority for field existence, enum members or display |
| **Fail closed** | — | any uncertainty or missing permission data defaults to **NON-DISPLAY** |

The former "FIELD AUTHORITY ORDER … RLS overrides RESO/IDX … RESO/IDX fills gaps" ordering is retired: no CSV, RESO document or hand-typed table is a field authority.

---

> **Read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` FIRST.** That index is the per-area canonical map — 18 numbered areas, each with canonical file · backup · validator · when-to-read · fail-closed instruction — and it is what `CLAUDE.md` §D sends you to. This README is the directory of the long-form reference documents in `compliance/`. When the two disagree, **the canonical index wins**.
>
> **Application architecture is not decided here.** For what the applications are and where a feature belongs, the authority is `MALLAN-PLATFORM-MASTER-PLAN.md` (repo root, canonical lineage PR #595 / `agent/publish-mallan-platform-master-plan-2026-08-04`.

## Directory

| File | Purpose | Audience |
|------|---------|----------|
| [`UCBA-2026.md`](UCBA-2026.md) | Full REBNY UCBA rules — 159 rules, 7 exhibits, penalties, enforcement | Broker, Agents, Developers |
| [`NYC-NYS-REQUIREMENTS.md`](NYC-NYS-REQUIREMENTS.md) | NYC/NYS law — DOS advertising, Fair Housing, FARE Act, SHIELD Act, disclosures | All |
| [`IDX-VOW-DISPLAY-RULES.md`](IDX-VOW-DISPLAY-RULES.md) | 6 distribution gates, IDX/VOW feed rules, display eligibility, suppression | Frontend, Backend |
| [`ATTRIBUTIONS-AND-DISCLOSURES.md`](ATTRIBUTIONS-AND-DISCLOSURES.md) | Required attribution text, disclosure documents, when/where to display | Frontend, Agents |
| [`PORTALS-AND-RBAC.md`](PORTALS-AND-RBAC.md) | 6 portal types, role-based access control, what each role can see/do | Backend, Security |
| [`FRONTEND-COMPLIANCE.md`](FRONTEND-COMPLIANCE.md) | Public website rules — Fair Housing language, address suppression, accessibility | Frontend |
| [`BACKEND-VALIDATION-ENGINE.md`](BACKEND-VALIDATION-ENGINE.md) | Server-side validation, REBNY rejection rules, >5% rejection rate penalty | Backend |
| [`FORMS-AND-RLS-SUBMISSION.md`](FORMS-AND-RLS-SUBMISSION.md) | Form field requirements, RLS submission workflow, mandatory field checklist | Forms, Backend |
| [`CRM-AND-MESSAGING-COMPLIANCE.md`](CRM-AND-MESSAGING-COMPLIANCE.md) | TCPA, CAN-SPAM, Fair Housing in comms, no agent info in descriptions | CRM, Marketing |
| [`AUDIT-LOGGING-AND-EVIDENCE.md`](AUDIT-LOGGING-AND-EVIDENCE.md) | NY SHIELD Act, data access logging, evidence retention, breach response | Backend, Security |
| [`THIRD-PARTY-AND-FEED-GOVERNANCE.md`](THIRD-PARTY-AND-FEED-GOVERNANCE.md) | Trestle/Cotality API, StreetEasy, syndication portals, data license rules | Backend, Ops |
| [`UPDATES.md`](UPDATES.md) | Running changelog — REBNY, RESO, Cotality, FARE Act updates with dates | All |
| [`AUTH-AND-API-SECURITY.md`](AUTH-AND-API-SECURITY.md) | Sprint 9 auth architecture — dual auth (Bearer + cookie), CORS, rate limiting, session management, cross-origin security | Backend, Security |
| [`DATA-LIFECYCLE-POLICY.md`](DATA-LIFECYCLE-POLICY.md) | Retention schedule + cron enforcement — **superseded on audit-event and media retention by `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14/§15** | Backend, Ops |
| [`VALIDATOR-FRAMEWORK.md`](VALIDATOR-FRAMEWORK.md) | Validator truth framework — Layer 1/2 + release-truth aggregator; how to migrate a UCBA rule and add a workflow | Developers |
| [`pii-and-distribution-checklist.md`](pii-and-distribution-checklist.md) | PII + 6-gate pre-commit checklist | Developers |
| [`REACT-PATTERNS-AUDIT-2026-04-27.md`](REACT-PATTERNS-AUDIT-2026-04-27.md) | Dated audit record (2026-04-27) — history, not direction | Developers |

## Machine-Readable Enforcement

| File | Contents | Use |
|------|----------|-----|
| the live Cotality contract (`lib/cotality/live-contract.ts`, `data/cotality-contract/**`) | Field existence, measured facts, live vocabularies | Form validation, field mapping, dropdown validation |

### Canonical enforcement rules (machine-readable)

> **Folder:** `compliance/rules/` — the enforcement "law" used by all scripts and validators.
> **Single pointer:** `active.json` tells every script which rule files are enforced. No guessing, no snapshots.

| File | Contents | Source |
|------|----------|--------|
| [`rules/active.json`](rules/active.json) | Single pointer to all enforced rule files, field data, and validator scripts | All below |
| `lib/compliance/rebny-ucba-rules.ts` (`REBNY_UCBA_RULES.requiredFields` / `conditionalRules`) | Always-required fields + conditional groups | UCBA 2026 Exhibit A |
| [`rules/export-policy.json`](rules/export-policy.json) | 8 distribution profiles, 6 gates, display cascade, never-export list, close-only fields, syndication portals | UCBA 2026 + REBNY RLS Rules |
| [`rules/status-rules.json`](rules/status-rules.json) | 9 status definitions, valid/invalid transitions, DOM rules, 5 timing SLAs | UCBA 2026 Art. I |
| [`rules/content-restrictions.json`](rules/content-restrictions.json) | 11 content restriction rules + 4 scanner definitions (Fair Housing, Agent Info, Off-Market, Compensation) | UCBA 2026 Art. I, III, VIII + Exhibit C |
| [`rules/ucba-audit-checklist.json`](rules/ucba-audit-checklist.json) | **Machine-readable UCBA 2026 audit checklist** — 145 verifiable rules with file paths, regex patterns, and verdicts. Used by `scripts/ucba-compliance-audit.js` for regression detection. | UCBA 2026 (all sections) |

---

## Quick Reference

### Feed Types

| Feed | Purpose | Audience |
|------|---------|----------|
| **RLS** | Core REBNY listing database | Authorized Participants only |
| **IDX** | Reciprocal broker display on websites | Public (mallan.nyc search) |
| **VOW** | Consumer-facing with extra data | Client portal (requires login) |
| **Syndication** | Distribution to third-party portals | 3 Trestle opt-in portals |

### Penalty Summary

| Violation | Penalty |
|-----------|---------|
| Fair Housing | $250 first, $500 + RLS termination second |
| Data quality | $0/$250/$250/termination (escalating) |
| Incurable (e.g., advertising opted-out property) | $250 first, $500 subsequent |
| General UCBA | $500/$2K/$10K/suspension |
| Quarterly >5% rejection rate | **$10,000 fine** |
| 3 quarterly fines in a year | **30-day RLS suspension** |
| FARE Act §20-699.21 | $750 first, $1,800 second (DCWP) |
| FARE Act §20-699.22 | $375 first, $900 second (DCWP) |

### Key Contacts

| Resource | Contact |
|----------|---------|
| REBNY RLS Support | rlssupport@rebny.com / 212-616-5270 |
| Trestle/Cotality Support | trestlesupport@cotality.com |
| REBNY RLS submission | Outside this system (REBNY does not grant listing input to individual brokers) |
| mallan.nyc IDX Display | Trestle IDX Plus WebAPI (Trestle-11371-20) — read-only |
| Direct Data License | rlssupport@rebny.com |
