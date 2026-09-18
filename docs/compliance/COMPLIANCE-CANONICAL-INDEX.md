# Compliance Canonical Index — mallan.nyc

> **Specialized compliance implementation registry subordinate to `MALLAN-PLATFORM-MASTER-PLAN.md`.**
>
> Read this before work touching public listings, IDX/RLS/Trestle/Cotality, syndication, CRM Leads, Seller/Landlord intake, advertising/public text, broker attribution, Fair Housing, FARE, privacy/consent, audit retention, media or public display gates.
>
> The Master defines Mallan business/system architecture. This index points to the current specialized compliance/code authorities for each area. If this index, an old audit or a historical platform reference conflicts with the Master on architecture, the Master governs and the specialized rule must be re-verified rather than silently overriding it.

## 0. Authority and fail-closed order

Keep these layers separate:

1. applicable Federal/New York/NYC law and NYS DOS requirements;
2. REBNY/RLS/UCBA rules where applicable;
3. current authorized Cotality/Trestle provider contract for provider data/fields/permissions;
4. Mallan-authored business records and rules;
5. other authorized sources within their verified rights/scope.

Cotality/Trestle may expose RESO-shaped schema vocabulary. RESO vocabulary is not a separate Mallan business authority.

For provider field/display truth:

```text
CURRENT APPLICABLE LAW / REBNY-RLS-UCBA RULE
+
LIVE AUTHORIZED COTALITY CONTRACT
→ VERIFIED MAPPING / DISPLAY SEMANTICS
→ MALLAN BUSINESS RULE
→ AUTHORIZED CONSUMER
```

If a rule, field, permission, null semantic, media right or display eligibility is unclear, **fail closed for the affected behavior and verify the specialized authority.** Do not guess from memory, an old snapshot or another feed.

Current validator counts, current Production gaps and current runtime incidents belong in execution/operations evidence, not as permanent compliance truth here.

---

## 1. REBNY UCBA

**Canonical references:**
- `data/UCBA-2026-Requirements.md`
- machine-readable UCBA audit checklist/rules used by the repository

**Read when:** listings, cooperation, listing-agent state, compensation/protected-period, status transitions, Leads/deals or Broker approval.

**Proof:** run the current UCBA validator defined by the repository and inspect any regression; static validation does not replace current rule/source verification when the rule itself is in question.

**Fail closed:** do not invent or relax a UCBA obligation because implementation is difficult.

---

## 2. REBNY RLS distribution/display gates

**Canonical implementation references:**
- `.claude/skills/rebny-compliance/SKILL.md` where current and verified
- `lib/idx/trestle-mapper.ts`
- `lib/compliance/gates.ts`
- current RLS/UCBA source documents

**Read when:** IDX/listing display, Search membership, feed/projection, status/display-gate writes.

**Required principle:** Owner opt-out, participant-only, entire-listing display, address display, terminal-status and Coming Soon semantics must be evaluated from the current verified contract. Null handling is field-specific; never generalize one gate's null semantics to another.

**Proof:** current RLS/compliance validators + direct/negative tests + runtime/public proof for rendering/membership behavior.

---

## 3. IDX Plus field subset

**Canonical evidence:**
- current authorized Cotality/Trestle `$metadata` and entitlement behavior
- `data/rebny-rls-property-fields.csv`
- `data/rebny-rls-property-lookup.csv`
- current generated provider-enum/field artifacts where used

**Read when:** `$select`, `$expand`, `$filter`, Search criteria, mapper/storage fields, new public/internal provider facts.

**Fail closed:** a field may be used only when its current existence, type, picklist, null semantics, permission and entitlement are verified. A static CSV/markdown file is evidence, not a substitute for required live verification.

---

## 4. Trestle / Cotality Web API

**Canonical implementation references:**
- `lib/idx/auth.ts`
- `lib/idx/fetch.ts`
- `lib/idx/trestle-mapper.ts`
- current Cotality/Trestle API contract

**Read when:** authentication/token behavior, OData query construction, resource/field mapping, rate/retry behavior or provider API changes.

**Fail closed:** use the current authorized API base/resource contract. Deprecated hosts/endpoints or historical examples do not define current behavior. Verify before changing code.

---

## 5. Listing status / terminal-state behavior

**Canonical implementation references:**
- centralized status normalization/terminal-state/gate logic in the current mapper/compliance implementation
- any retention/reconciliation code that mutates terminal rows

**Read when:** status writes, public eligibility, Search membership, retention/reconciliation.

**Invariant:** normalize status before terminal evaluation; a terminal/status mutation must keep all canonical display/search projections consistent in the same governed operation.

---

## 6. Owner opt-out

**Canonical implementation references:**
- `lib/compliance/gates.ts`
- current mapper derivation
- current REBNY/RLS/UCBA authority

**Invariant:** a verified owner opt-out is not publicly disseminated. Do not invent an opt-out state from an unverified field/value.

---

## 7. Internet display fields

**Canonical implementation references:**
- centralized mapper/display-gate logic
- `lib/compliance/gates.ts`
- current RLS/Cotality field contract

**Invariant:** different internet-display fields may have different null/permission semantics. Preserve the verified asymmetry and test writer + reader behavior; never wrap all fields in one generic coercion without proof.

---

## 8. Media / photo / floor plan / video

**Canonical implementation references:**
- current Cotality Media contract
- `lib/idx/sync.ts`
- `lib/idx/fetch.ts`
- media proxy/cache/storage paths

**Required principle:** provider Media identity must use the current verified ResourceRecord key contract; source, rights, listing/property identity, audience and cache/storage authority must all be correct.

**Fail closed:** do not copy, rehost, cache or publicly display external Media merely because it is reachable. Media fixes must be traced across Search, listing pages/workspaces, client share, marketing, reports and storage.

---

## 9. Broker/Agent attribution and professional identity

**Canonical references:**
- public layout/footer/IDX-disclaimer components
- governed Agent professional profile/license source
- public DTO sanitizer/attribution rules
- current NYS DOS/REBNY advertising authority

**Read when:** any public listing, Agent profile, marketing/email, structured data or public lead-capture surface.

**Invariant:** professional title comes from the governed license record, not authorization role. Brokerage/Agent attribution must meet current applicable requirements; client/public DTOs must not leak prohibited professional/owner PII.

---

## 10. Fair Housing / anti-discrimination

**Canonical implementation references:**
- `lib/compliance/rls-enforcement.ts`
- client-side/internal Fair Housing scanners where they are current
- current Federal/NYS/NYC Fair Housing/Human Rights authority

**Read when:** free text, listing/neighborhood copy, Search/filter/ranking, AI recommendations, audience targeting, marketing/email/social/SEO/AEO or client matching.

**Invariant:** protected characteristics or prohibited proxies may not drive housing filtering, ranking, targeting, personalization or steering. Objective property/geographic criteria must remain within current lawful boundaries.

A footer disclaimer does not cure prohibited generation, ranking or targeting.

---

## 11. NYS DOS advertising / anti-discrimination notice

**Canonical references:**
- current NYS DOS advertising/agency/anti-discrimination requirements
- public attribution/notice components
- lead-capture forms/endpoints

**Read when:** public advertising, Agent/brokerage/listing claims, email/social copy, first substantive contact/lead forms.

**Invariant:** no misleading/false/deceptive claim; required brokerage/license/notice/agency disclosures must be present at the stage required by current authority.

---

## 12. NYC FARE / rental-fee disclosure

**Canonical implementation references:**
- current rental listing display/intake paths
- `lib/idx/trestle-mapper.ts`
- current FARE/REBNY/Cotality field authority

**Read when:** rental fee responsibility, rental listing display, rental intake, rental marketing/syndication.

**Invariant:** do not infer fee responsibility or publish unsupported fee facts. Use the current verified fields/rules and prove the disclosure renders behaviorally, not only by source grep.

---

## 13. Consent / TCPA / communications eligibility

**Canonical implementation references:**
- `lib/inquiries/create.ts`
- public lead-capture endpoints
- CRM email/SMS/outreach eligibility gates

**Read when:** new Lead form, autoresponder, SMS/email marketing, portal/signup/search alert, Open House RSVP or outreach path.

**Invariant:** capture the consent/communication eligibility required for the intended channel in the same durable Lead/Party workflow; suppression/unsubscribe is centrally enforced. No autosend/send path may bypass required consent or falsely claim delivery.

---

## 14. Privacy / NY SHIELD / sensitive data

**Canonical references:**
- current privacy/security policy and retention implementation
- Prisma schema/data-classification evidence
- session/auth controls

**Read when:** new PII/sensitive fields, portals, tax forms/W-9, exports, third-party integrations, retention or deletion.

**Invariant:** least access, appropriate encryption/security, explicit retention/currentness and auditability. Sensitive tax/client/professional data must not be exposed through generic CRM/public DTOs.

Current retention durations must be verified against the applicable authoritative policy/rule before changing enforcement.

---

## 15. Audit / diagnostic retention

**Canonical references:**
- Prisma `AuditEvent` model/current audit writer
- `app/api/cron/data-retention/route.ts`
- `docs/compliance/OPERATIONAL-DIAGNOSTIC-RETENTION.md`

**Read when:** new mutation/audit action, retention/purge, administrative override, diagnostic-event change.

**Invariant:** business/audit evidence and disposable operational diagnostics are not the same class. A narrow diagnostic-retention exception may not be widened by convenience. Transaction/legal retention must not rely on a shorter generic AuditEvent window when a dedicated durable business record is required.

---

## 16. CRM / Lead routing compliance

**Canonical implementation references:**
- current public lead-capture endpoints
- `lib/inquiries/create.ts`
- canonical Lead/Inquiry/Party models and assignment logic

**Read when:** public inquiry, assignment/reassignment, signup, showing/Open House request, portal access, email/SMS send or role/permission changes.

**Invariant:** every meaningful public Lead action becomes durable CRM history with source/context; identity is reconciled before duplicate creation; existing Agent relationship is checked before reassignment; consent/rate-limit/anti-abuse/audit requirements are applied as appropriate. Email delivery alone is not the Lead record.

---

## 17. Seller / Landlord intake compliance

**Canonical implementation references:**
- `public/crm/SALE-FORM-REDESIGN.html`
- `public/crm/RENTAL-FORM-REDESIGN.html`
- `lib/compliance/rls-enforcement.ts`
- current canonical Listing writer/API

**Architecture boundary:** Mallan Sale/Rental intake is Mallan's internal canonical authoring workflow. Third-party Cotality inventory remains read-only. Any outbound provider/listing-service publishing path is a separate future/controlled capability and must use the current verified provider/REBNY contract and explicit authorization. A historical external listing-input platform is **not** a Mallan architectural dependency.

**Read when:** form field/picklist changes, required-field logic, listing create/edit, free-text restrictions, publication/distribution.

**Invariant:** every enabled field must map to a canonical owner and prove `create → save → reload → edit → save → reload`; Fair Housing/content/compliance gates run before any external/public use; unsupported provider fields are not fabricated.

---

## 18. Mallan-authored listing distribution / syndication eligibility

**Canonical implementation references:**
- `lib/syndication/eligibility.ts`
- `lib/syndication/mallan-identity.ts`
- current Mallan listing identity/owner authority
- current approved distribution plan/rules

**Read when:** new export/syndication/partner path, listing-side identity, eligibility gate or provider publishing.

**Invariant:** Mallan-authored identity, owner/representation authority, current listing state, source/display/media rights and required Broker approval must be proven before distribution. Empty/unverified identity configuration fails closed. No export/provider-publishing route is authorized merely because internal listing data exists.

---

# Maintenance protocol

1. Keep product/business architecture in the Master, not here.
2. Add/update a compliance area only with a current authoritative source, canonical implementation pointer, proof/validator and fail-closed behavior.
3. Do not freeze current PR numbers, pass counts, current incidents or deployment state into this index; put those in execution/operations evidence.
4. If a current specialized rule conflicts with the Master on architecture, stop the affected mutation and reconcile the rule/source rather than silently creating a second authority.
5. Deprecate historical compliance guidance explicitly; do not let it remain discoverable as current instruction without a replacement pointer.

# Cross-references

- `MALLAN-PLATFORM-MASTER-PLAN.md` — sole product/business/system authority
- `AI-START-HERE.md` — startup/authority order
- `AGENTS.md` — cross-agent working constitution
- `CLAUDE.md` — Claude-specific discipline
- `NEON.md` — database/infrastructure governance
- `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` — canonical file/folder rules
- `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` — current implementation/runtime status
- historical audits/incidents — evidence only