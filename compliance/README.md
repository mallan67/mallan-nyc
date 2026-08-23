# Compliance Library — Mallan Real Estate Inc.

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806
> **Jurisdiction:** New York State / NYC | **Feed:** REBNY RLS via Trestle (Cotality)
> **LMP:** RealPlus (listing input to RLS — external to mallan.nyc) | **IDX Display:** Trestle IDX Plus WebAPI (public display + internal CRM + reporting) | **Stage:** Live Production
>
> **IDX SCOPE (Confirmed by REBNY 2026-03-27):** IDX feed powers: (1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting. Client data stays on mallan.nyc — never passes through RealPlus or third parties. IDX feed is limited to the IDX-released field set and IDX-eligible inventory only — it is NOT full-market search. Agents use RealPlus for full RLS inventory and listing submission. mallan.nyc does NOT submit listings to the RLS and is NOT an LMP.

---

## FIELD AUTHORITY ORDER (ENFORCED — ALL WORK)

| Priority | Authority | Governs |
|----------|-----------|---------|
| **1** | **UCBA** | Everything — contractual obligations, timing, statuses, agent conduct |
| **2** | **REBNY RLS rules + fields** | Permissions, timing, statuses, mapping, IDs, dissemination |
| **3** | **RLS overrides Cotality/IDX** | If an RLS rule/field exists, it overrides all Cotality/IDX schema or vendor defaults |
| **4** | **Cotality/IDX fills gaps** | If no RLS rule/field exists, use Cotality definitions for naming/types/enums |
| **5** | **INTERNAL-ONLY** | If neither RLS nor Cotality/IDX governs, must not affect public display eligibility |
| **6** | **Fail closed** | Any uncertainty or missing permission data defaults to **NON-DISPLAY** |

---

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
| [`UPDATES.md`](UPDATES.md) | Running changelog — REBNY, Cotality, Cotality, FARE Act updates with dates | All |
| [`AUTH-AND-API-SECURITY.md`](AUTH-AND-API-SECURITY.md) | Sprint 9 auth architecture — dual auth (Bearer + cookie), CORS, rate limiting, session management, cross-origin security | Backend, Security |

## Machine-Readable Enforcement

| File | Contents | Use |
|------|----------|-----|
| [`fields.json`](fields.json) | 902 IDX Plus fields — required/conditional/optional, editable, searchable, categories | Form validation, field mapping |
| [`lookups.json`](lookups.json) | 114 picklist fields, 1,993 official REBNY values | Dropdown validation, data quality |

### Canonical enforcement rules (machine-readable)

> **Folder:** `compliance/rules/` — the enforcement "law" used by all scripts and validators.
> **Single pointer:** `active.json` tells every script which rule files are enforced. No guessing, no snapshots.

| File | Contents | Source |
|------|----------|--------|
| [`rules/active.json`](rules/active.json) | Single pointer to all enforced rule files, field data, and validator scripts | All below |
| [`rules/rls-required.json`](rules/rls-required.json) | 52 always-required fields + 14 conditional groups + 11 cross-field validations | UCBA 2026 Exhibit A + RLS CSV |
| [`rules/export-policy.json`](rules/export-policy.json) | 8 distribution profiles, 6 gates, display cascade, never-export list, close-only fields, syndication portals | UCBA 2026 + REBNY RLS Rules |
| [`rules/cotality-rls-renames.json`](rules/cotality-rls-renames.json) | 23 Cotality → RLS name mappings (foreign keys, case diffs, renames, splits) | RLS CSV |
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
| LMP (RealPlus) | Listing input to RLS (REBNY does not grant LMP to individual brokers) |
| mallan.nyc IDX Display | Trestle IDX Plus WebAPI (Trestle-11371-20) — read-only |
| Direct Data License | rlssupport@rebny.com |
