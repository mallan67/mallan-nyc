# Compliance Library — Mallan Real Estate Inc.

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Agent:** Maya Allan | **License:** #10311201806
> **Jurisdiction:** New York State / NYC | **Feed:** REBNY RLS via Trestle (Cotality)
> **LMP:** RealPlus | **Stage:** Mockup / Prototype → Production

---

## FIELD AUTHORITY ORDER (ENFORCED — ALL WORK)

| Priority | Authority | Governs |
|----------|-----------|---------|
| **1** | **UCBA** | Everything — contractual obligations, timing, statuses, agent conduct |
| **2** | **REBNY RLS rules + fields** | Permissions, timing, statuses, mapping, IDs, dissemination |
| **3** | **RLS overrides RESO/IDX** | If an RLS rule/field exists, it overrides all RESO/IDX schema or vendor defaults |
| **4** | **RESO/IDX fills gaps** | If no RLS rule/field exists, use RESO definitions for naming/types/enums |
| **5** | **INTERNAL-ONLY** | If neither RLS nor RESO/IDX governs, must not affect public display eligibility |
| **6** | **Fail closed** | Any uncertainty or missing permission data defaults to **NON-DISPLAY** |

---

## Directory

| File | Purpose | Audience |
|------|---------|----------|
| [`FIELD-AUTHORITY.md`](FIELD-AUTHORITY.md) | Governance hierarchy, all 448 RLS fields by category, 23 RESO→RLS renames | Developers, Compliance |
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
| [`RLS-VALIDATOR-V2.md`](RLS-VALIDATOR-V2.md) | Deterministic RLS compliance validator — 4-layer pipeline, 10 sections, 42 tests, mockup file validation (IN PROGRESS) | Backend, QA |
| [`MASTER-AUDIT-REPORT-v3.md`](MASTER-AUDIT-REPORT-v3.md) | Full system audit — 225 findings, 39 passes, 6 schemas, enterprise controls, production roadmap, Trestle migration enforcement | All |

## Machine-Readable Enforcement

| File | Contents | Use |
|------|----------|-----|
| [`fields.json`](fields.json) | 448 RLS fields — required/conditional/optional, editable, searchable, categories | Form validation, field mapping |
| [`lookups.json`](lookups.json) | 114 picklist fields, 1,993 official REBNY values | Dropdown validation, data quality |

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
| LMP (RealPlus) | Via RealPlus portal |
| Direct Data License | rlssupport@rebny.com |
