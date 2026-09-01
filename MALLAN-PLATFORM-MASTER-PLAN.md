# MALLAN BUSINESS & INTELLIGENCE OPERATING SYSTEM — MASTER PLAN

> **Single repository authority for the Mallan brokerage, agent, listing, search, CMA, marketing, reporting, transaction and technology operating system.**

## Authority and scope

- Business owner and final decision authority: **Maya Allan**.
- Repository scope: **`mallan67/mallan-nyc` only** unless Maya explicitly changes it.
- Explicit exclusion: **Do not modify or treat `Mallan-Integrated` as part of this work.**
- This document is the single product/system plan. Audits, issue registries, PRs, technical notes, temporary ledgers and historical plans are evidence/reference only and may not become competing master plans.
- Production mutation remains held unless Maya separately authorizes it. Documentation, read-only verification, tests and design work do not authorize migrations, environment changes, destructive data work, R2 cleanup or manual Production deployment.
- Every listing/property/data statement used for implementation must be verified against the current authorized Cotality/RLS contract or another applicable authoritative source before it is treated as fact.
- Current REBNY/RLS/UCBA use/display rules, New York licensing/advertising requirements and the current Cotality implementation contract must be kept separate but reconciled. Cotality is the current provider implementation contract; it is not the brokerage business model.
- Cotality/Trestle may use RESO vocabulary in its technical schema. **RESO terminology is provider-schema language only; RESO is not a separate Mallan business/compliance authority.** Mallan business requirements are framed through applicable New York law/DOS, REBNY/RLS/UCBA and the verified current provider contract.
- This master is an **executable reconciled baseline**. Residual historical recovery/reconciliation continues as evidence work, but it is not a permanent global blocker. If recovered evidence proves that a still-valid requirement is missing or conflicts with an active layer, restore it here and reopen only the affected dependency.

---

# 1. ONE MALLAN OPERATING SYSTEM

Mallan is the operating system of a New York City real-estate brokerage.

It is not a website plus separate CRM, Search, CMA, Marketing, Reporting and Commission products.

```text
MALLAN BROKERAGE
        │
        ├── BROKERAGE VIEW — firm scope
        │
        └── MY BUSINESS — individual producer scope
                        │
                        ▼
                      PARTY
                        │
                  ROLE OPPORTUNITY
           ┌────────────┼────────────┐
           │            │            │
        PROPERTY      SEARCH       LISTING
           │            │            │
           └────────────┼────────────┘
                        │
                 CMA / DECISIONS
                        │
                MARKETING / E-BLAST
                        │
                ENGAGEMENT / SHOWING
                        │
                 LISTING REPORTING
                        │
                 SYSTEM INTELLIGENCE
                        │
                OFFER / APPLICATION
                        │
                   TRANSACTION
                        │
              COMMISSION / REFERRAL
                        │
                POST-DEAL RELATIONSHIP
```

**Unified means shared canonical identity, data and history. It does not mean collapsing distinct roles.**

Seller, Landlord, Buyer and Tenant remain four separate first-class opportunities and workflows. Investor/1031 uses the same canonical foundation with specialized analysis.

No new parallel client, property, listing, search, comment, media, document, campaign, CMA, calculator, transaction or commission truth may be created without an explicit migration/deduplication/retirement decision.

Before creating any new table/model/service that represents a real-world business object, answer:

1. What real-world thing does this represent?
2. Where is it represented today?
3. Why can the existing canonical record not be reused or extended?
4. What is the canonical ID?
5. Who writes it?
6. Who reads it?
7. What duplicate representation is retired?
8. How is existing history migrated/reconciled?
9. What end-to-end proof shows there is still one truth?

If those answers are not satisfactory, do not create the parallel model.

---

# 2. SIMPLE BROKERAGE / AGENT OPERATING MODEL

Mallan must keep the human operating model simple.

## 2.1 Two views

```text
MALLAN
│
├── BROKERAGE VIEW
│   firm-wide oversight and exceptions
│
└── MY BUSINESS
    the logged-in producer's own business
```

Maya Allan is one Individual with both scopes:

- Representative Broker / Brokerage View
- Producing Agent / My Business

If Maya is the producing agent on a deal, that deal appears in both views but remains **one canonical deal**.

## 2.2 Independent contractors and supervision boundary

Mallan agents are independent contractors operating their own book of business inside Mallan's brokerage framework.

Mallan should provide the brokerage platform, support, reminders, flags, records, required firm controls and broker visibility where supervision/support is required.

Mallan should not try to micromanage every independent contractor's business. The individual licensee remains responsible for meeting their own professional obligations.

At the same time, independent-contractor status does not remove the representative broker's legally required responsibility for supervision of brokerage activity. The product rule is:

```text
AGENT
responsible for personal professional obligations and conduct

MALLAN
supports, reminds, records and flags

BROKER
retains required brokerage supervision/oversight
```

## 2.3 Current role model

```text
MAYA ALLAN
├── Representative Broker
└── Agent / Producer

LICENSED REAL ESTATE SALESPERSON
└── Agent / Producer

LICENSED REAL ESTATE ASSOCIATE BROKER
└── Agent / Producer
```

There is no Manager/Office Manager role now.

An Associate Broker functions like another Agent/Producer in Mallan unless Mallan later deliberately creates a separate supervisory appointment/capability.

Associate Broker license status does **not** automatically create manager permissions. If Mallan later formally appoints an office manager/supervisory role, that role must be explicit and separately permissioned.

License type is stored because it controls the person's proper public professional title and applicable obligations.

## 2.4 Professional identity

Public/client-facing professional identity must use the governed license title from the person's verified professional record:

- Salesperson → **Licensed Real Estate Salesperson**
- Associate Broker → **Licensed Real Estate Associate Broker**
- Broker profile, when publicly displayed → **Licensed Real Estate Broker**

For Maya's internal Brokerage View, repeatedly displaying the full legal title is unnecessary; `Broker` / `Brokerage View` is sufficient internally.

One governed professional profile/signature supplies the current public identity to:

- online Agent Profile;
- email signature;
- business cards;
- letters;
- representation/exclusive agreements;
- approved marketing/e-blasts;
- client reports/CMA creator blocks where appropriate.

Do not independently hard-code professional titles across templates.

A later license/profile change updates future public/generated materials. Historical signed/sent documents remain immutable snapshots of what existed when they were executed/sent.

## 2.5 Agent Roster / onboarding / access lifecycle

The Brokerage Agent Roster is the operational surface for adding, maintaining, deactivating and, only when appropriate, permanently removing an Agent account. It is not a second identity system.

The existing canonical runtime Agent record remains the account/professional identity owner. Seed/static profile material can support bootstrap/fallback, but it may not become a competing live account truth.

### One Agent identity, one create authority

Mallan must have one canonical Agent-creation authority. If more than one route or helper can create the same Agent record, all secondary paths must delegate to the canonical owner or be retired. A second independent create writer is a defect because it can produce different validation, password, role, profile, audit and invitation behavior for the same real person.

Agent creation must be idempotent against canonical identity constraints. A repeated click/retry may resend/recover an invitation, but it must never create another Agent merely because delivery or UI confirmation failed.

### License class is not authorization role

Professional license classification and system authorization are separate facts:

```text
LICENSED REAL ESTATE SALESPERSON
→ professional title: Licensed Real Estate Salesperson
→ ordinary producer authorization: AGENT

LICENSED REAL ESTATE ASSOCIATE BROKER
→ professional title: Licensed Real Estate Associate Broker
→ ordinary producer authorization: AGENT

REPRESENTATIVE / PRINCIPAL BROKER
→ professional title: Licensed Real Estate Broker
→ brokerage administrative authorization: BROKER
```

An Associate Broker must never be displayed as a Salesperson because the authorization role is `AGENT`, and must never receive Principal Broker/admin permissions merely because the license class is broker-level.

### Add Agent form contract — no silent data loss

Every visible Add Agent field must have one of three explicit dispositions:

1. persists to an existing canonical owner;
2. is derived from a named canonical fact; or
3. is visibly unavailable/disabled until a legitimate owner exists.

A field may not appear editable and then disappear after save.

The complete onboarding write must carry every governed field required by downstream consumers, including as applicable the professional title/profile, public slug, biography, photo, languages, specialties, contact data, license data and status. Creating a sparse database Agent that then overrides a richer governed public profile is not acceptable.

Every Agent form follows the platform persistence rule:

`create → save → reload → edit → save → reload`

### Draft versus active account

A control labelled `Save Draft` must create a genuinely non-active/non-login-ready draft state under an existing legitimate lifecycle model, or it must be removed/renamed. Mallan may not label an active Agent account a draft merely because no invitation was sent.

### Invitation / password setup is a durable workflow

Account creation and invitation delivery are two related but distinct states.

```text
AGENT RECORD CREATED / UPDATED
↓
INVITATION / PASSWORD-SETUP REQUEST
↓
DELIVERY PROVIDER HANDOFF
↓
DELIVERED / FAILED / BOUNCED / RETRY NEEDED WHERE OBSERVABLE
↓
PASSWORD ESTABLISHED
↓
LOGIN PROVEN
```

The UI must never collapse a partially successful transaction into an ambiguous generic error. If the Agent record was created but delivery failed, the roster must say so and offer a safe resend/recovery action against that same Agent.

`Send Invite` must not mean `create another Agent`. Retry is invitation recovery, not account creation.

Delivery status must reflect what the actual delivery system can prove. Spam placement, provider failure, bounce or unknown delivery may not be represented as a clean successful onboarding simply because an API call returned.

Ordinary Agents use the normal Agent sign-in path and enter their own My Business/CRM scope. Broker-admin login remains reserved for the `BROKER` authorization role.

No onboarding or account-recovery workflow may require Maya or another broker to paste browser-console JavaScript, session cookies, tokens or passwords.

### Public profile / directory authority

Active Agent directory, individual profile, sitemap, contact/signature and other public professional surfaces must resolve from one governed professional identity contract.

A deactivated or permanently deleted database Agent must not remain publicly presented as active merely because a static fallback record still exists. Static bootstrap/fallback data may not create a ghost public profile that contradicts account lifecycle state.

Conversely, activating a new database Agent must not degrade a previously correct public profile because the database row omitted required professional fields.

### Deactivate and Delete Permanently are different business actions

**Deactivate** is normal brokerage offboarding.

Deactivate must:

- disable login/session access;
- remove the Agent from active roster/public participation as appropriate;
- preserve clients, listings, deals, documents, commissions, referrals, communications, compliance records and historical attribution;
- preserve the Agent record/history needed to understand past brokerage activity.

**Delete Permanently** is mistake rollback only for an erroneous/never-used Agent record. It is not normal offboarding and must be deliberately difficult to qualify for.

Delete Permanently must:

- be Broker-only;
- refuse self-deletion;
- refuse any target whose authorization role is `BROKER`;
- refuse any target that has ever successfully logged in;
- perform a read-only dependency preview before the destructive action;
- independently re-read/recount dependencies again inside the final delete transaction;
- inspect both declared foreign-key relations and loose/polymorphic Agent identity references;
- refuse when legitimate listing/client/deal/CMA/document/showing/task/marketing/commission/referral/protected-period/audit-actor or other brokerage history proves the Agent actually participated in business;
- treat audit/onboarding records written **about** an erroneous Agent by Broker/system separately from records proving the target Agent acted;
- remove only ephemeral authentication artifacts such as sessions/MFA artifacts when eligible;
- never cascade-delete or rewrite legitimate brokerage history merely to make the Agent delete succeed;
- perform the final dependency recheck, ephemeral-auth cleanup, Agent delete and purge AuditEvent atomically so failure rolls back the entire destructive action;
- preserve an immutable audit snapshot of the deleted Agent identity and observed dependency counts;
- report retained static-profile or media/R2 remnants clearly rather than silently deleting them;
- keep R2/media deletion behind its own explicit authorization and proof boundary.

If the target does not qualify for mistake rollback, the product directs the Broker to Deactivate/reassign instead of manufacturing eligibility by deleting history.

### Agent Roster lifecycle acceptance

Agent Roster/onboarding is not complete until a real Agent can be handled end to end through governed UI/server paths:

`Add Agent → save → reload → edit → save → reload → invitation/password setup → login → My Business/CRM access → correct public profile/directory/sitemap → normal deactivation`

and a deliberately erroneous never-used record can additionally prove:

`dependency preview → confirmation → atomic permanent delete → audit retained → no orphaned identity/access state`

The acceptance proof must include Salesperson and Associate Broker cases and must prove that Associate Broker professional identity stays correct while authorization remains `AGENT`.

---

# 3. CANONICAL SHARED FOUNDATION

The complete previously reconciled canonical shared foundation and all subsequent product sections remain authoritative exactly as established on this branch, including Property/Listing/source identity, professional Search, CMA, Backend Listing Workspace, calculators, Marketing/E-blast, Listing Reporting, communications/documents/agreements/Offering Plans, Seller/Landlord/Buyer/Tenant/Investor journeys, Agent professional obligations, Brokerage View, leads/performance/money/commissions/referrals, Transactions/payment readiness, technology/source governance, System Intelligence, product/navigation, requirement governance, current-to-target mapping, development sequence and Global Definition of Done.

**No requirement in those established sections is superseded or removed by §2.5.** The Agent Roster lifecycle is additive and must be implemented through the same canonical Agent, Party, professional-profile, permissions, audit, document, transaction and money foundations rather than through a parallel Agent system.

For exact previously reconciled wording and detailed requirements, use this branch's immediately preceding master-plan blob `01e9b2dcbe180e5f2dbec7da2129a117a39843dd` as preserved evidence. Any future reconciliation must restore valid detail into this single current master before relying on it for implementation.

---

# CURRENT HANDOFF — 2026-09-01 UPDATE

This Master Plan remains the single product/system authority. The September 1 execution state is maintained in the subordinate `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` and `docs/claude-instructions/CURRENT.md`; those files record status/instructions and do not replace this architecture.

Current execution priority is still Search first. Independently verified Search status at this update:

- §4 Canonical Criteria / Transport — closed at `939884e15ec8447988c7fb791a8978fb8676f3a4`;
- §5 Registry → Executor Authority — closed at `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b`;
- bounded public-Search correctness work discovered during §6 — accepted/closed at `2d55ce6a528adbeaf64584f031aa3711dd8be6bb`;
- authenticated §6 final universe/count/pagination — active;
- then §7 Sale/Rental, §8 Map/Saved Search/Workbench, §9 Compare/Reports/CMA and §10 authenticated desktop/tablet/mobile E2E continue without restarting closed layers.

Agent Roster/onboarding/access is a separate bounded lane because an active brokerage Agent must be onboarded and authenticated reliably without blocking Search. The open implementation issues are the concrete product obligations defined in §2.5: complete Add Agent persistence, correct Associate Broker mapping, one create authority, durable invite/password setup and retry behavior, truthful draft semantics, correct public-profile lifecycle, governed Deactivate, and mistake-only Delete Permanently.

A local Claude handoff reported a hard-delete implementation at `5c7ef52e8096fc6e7b91552e4b22f66013637fc5` on `feat/agent-permanent-delete-2026-09-01`, but it was reported unpushed. It therefore remains implementation evidence only until GitHub-durable and independently reviewed; it is not merged, Preview-proven or Production-proven authority, and it does not authorize a Production purge.

No documentation change here authorizes schema/migration/backfill, Production Neon/DB mutation, R2 deletion, environment/credential changes, Search restacking/rebasing, destructive Agent cleanup or Production deployment.