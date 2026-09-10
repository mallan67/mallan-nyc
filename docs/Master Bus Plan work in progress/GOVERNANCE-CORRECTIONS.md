> # 🛑 HISTORICAL EVIDENCE ONLY — NOT AN INSTRUCTION
>
> **This file cannot override the Master Plan or the Execution State.**
>
> - Product/system authority: `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md`
> - Execution state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (STATUS ONLY)
> - Agent operating instructions: `AGENTS.md` · `CLAUDE.md`
>
> Process rules issued 2026-09-07 for running the Master Plan integration rounds. Those rounds are
> reported complete in `FINAL-INTEGRATION-REVIEW.md`, so the instructions here are **spent** — do not
> act on them as live direction. It is retained because `_rows18-final.json` still uses the
> classification vocabulary defined only here ("NO CONFLICT — DIFFERENT LAYER", "NO CONFLICT — MORE
> SPECIFIC DETAIL"), so deleting it would leave that file speaking a vocabulary the repository no
> longer defines.
>
> Banner added 2026-09-10. Body unchanged.

# Governance corrections — issued by Maya 2026-09-07, binding on all remaining integration rounds

These govern how the Master Plan integration work is done. They are process rules, not Master Plan content,
and they must NOT be written into `MALLAN-PLATFORM-MASTER-PLAN.md`.

---

## 1. Architecture is not authorization — the hold is not a contradiction

Two separate truths:

```text
MASTER PLAN
= what Mallan's intended business/system architecture is

CONTINUOUS EXECUTION STATE
= what work is currently authorized / held / active
```

Therefore:

```text
§4.5 defines the architecture
≠
authorization to implement §4.5 today
```

The Master Plan MAY define the intended Schedule A / supplemental / new-development Buyer-representation
architecture even while implementation is held.

**Do NOT weaken, remove or distort the Master Plan to make it match a temporary implementation hold.**
A standing implementation hold is preserved in the execution-state / control layer, not by editing the
architecture.

**Do NOT treat writing a requirement into the Master Plan as authorization** to mutate Search, external
inventory, Schedule A ingestion, provider data, schema, production, or any held subsystem.

Consequence for the contradiction matrix: "the plan describes a capability that is currently held" is
NOT a contradiction. It is `NO CONFLICT — FUTURE ARCHITECTURE VS CURRENT HOLD`.

---

## 2. Round 3 is surgical — most Schedule A mechanics are ALREADY PRESENT

Verified already in the integrated candidate. **DO NOT RECREATE ANY OF THESE:**

- Schedule A unit universe (§4.5.4)
- `AVAILABILITY_UNCONFIRMED` and the other source/availability states
- "Schedule A is not proof of active availability" / may not be labelled `ACTIVE`
- Cotality reconciliation (§4.5.5)
- client-share gating (§4.5.7)
- Schedule A Workspace controls (§7.3)
- Reverify (§7.9)
- CMA exclusion of unconfirmed Schedule A units from verified valuation evidence (§6)

### Only these are genuinely missing and may be integrated

**A. Strategic scope exclusion.** Mallan is NOT becoming developer marketing, sponsor sales, developer
sales-office infrastructure, or a New Development brokerage platform competing for project representation.

```text
NEW DEVELOPMENT / SCHEDULE A
=
BUYER-REPRESENTATION INTELLIGENCE
```

Core business statement:

> Mallan does not need to be the developer's broker. Mallan should be the Buyer's better-informed broker.

**B. Capability-selection discipline.** Mallan should not build functionality merely because Compass,
Corcoran, Elliman, SERHANT. or another major brokerage has it. A capability must materially improve one or
more of: client representation; Agent service; property/market intelligence; legitimate lead
generation/conversion/retention; Mallan's canonical operating system; business differentiation worth
maintaining.

**C. Contextual Rendering Contract.** A UI component may not render merely because its code/DTO technically
accepts the record.

```text
CANONICAL PROPERTY / LISTING / BUSINESS TYPE
→ AUDIENCE
→ BUSINESS RULE
→ COMPLIANCE / RIGHTS
→ COMPONENT ELIGIBILITY
→ RENDER
```

Applies to at least: residential vs commercial; Sale vs Rental; Buyer vs Tenant; Landlord vs Seller;
New Development/Schedule A; Rent-v-Buy; schools; investment analysis; closing-cost calculators; application
controls; offer controls; CMA; Open House; neighborhood content; Media; disclosure blocks; CTAs.

**D. Public Content Compliance Contract.** Compliance occurs BEFORE content is published; it is not a footer
disclaimer. Governs: listing copy, neighborhood copy, AI-generated copy, media/captions, social, email,
e-blast, market reports, Search/recommendation output, audience targeting, SEO, AEO, structured data,
lead-generation pages. Subject to applicable Fair Housing; NYS/NYC Human Rights / anti-discrimination;
advertising rules; NYS DOS; REBNY; RLS; UCBA; verified Trestle/Cotality rules where provider data is
involved; media/use/copyright rights; privacy/consent.

**E. Public brokerage entry paths.** The public site must expose the actual brokerage service relationships —
BUYER, SELLER, LANDLORD/OWNER, TENANT/RENTER, INVESTOR/1031, NEW-DEVELOPMENT BUYER REPRESENTATION — and each
appropriate inquiry must resolve:

```text
INQUIRY
→ LEAD
→ PARTY RECONCILIATION
→ OPPORTUNITY
→ RESPONSIBLE AGENT
→ DURABLE HISTORY
```

not merely send a generic contact email.

---

## 3. Round 2 and Round 3 must not produce competing additions

Before applying ANY round-3 requirement:

```text
SEARCH CURRENT INTEGRATED MASTER
↓
ALREADY ADDED BY ROUND 1 OR ROUND 2?
├── YES → do not add again
└── NO → surgical addition
```

**Compare round 3 against the CURRENT INTEGRATED CANDIDATE, never against `_BASE-595`.** Comparing to the
original base is how two rounds independently introduce duplicate truths.

---

## 4. Contradiction taxonomy — eight categories

Do NOT label something a contradiction merely because:

- the Master Plan describes a future capability while execution is held;
- a detailed lifecycle expands a simple implementation rule;
- a canonical business architecture is broader than today's UI;
- a current provider implementation is narrower than Mallan's durable business model.

**A genuine contradiction exists only when two rules cannot simultaneously be true.**

```text
NO CONFLICT — DIFFERENT LAYER
NO CONFLICT — MORE SPECIFIC DETAIL
NO CONFLICT — FUTURE ARCHITECTURE VS CURRENT HOLD
CLARIFICATION
SCOPE NARROWING
TRUE BUSINESS DECISION REQUIRED
DUPLICATE — DO NOT ADD
SUPERSEDED — MAYA DECISION REQUIRED
```

---

## 5. Durable truth vs temporary truth

The Master Plan holds durable business/system architecture.

These belong in execution state / evidence, NOT in the Master Plan, unless genuinely necessary to explain an
architectural constraint:

- current branch;
- PR number;
- active implementation hold;
- current failing test;
- current migration state;
- current deployment status.

Do not pollute the durable Master Plan with temporary implementation status.

---

## 6. Do not land

No commit. No touching PR #595. No new PR. Nothing marked final. All work stays in
`docs/Master Bus Plan work in progress/`.

---

## Maya's four issued contradiction resolutions (FIRST block, binding)

1. **§17 HR boundary** — KEEP "not an HR system"; NARROW its meaning. Mallan governs the contractual,
   licensing, regulatory, tax and brokerage documents needed to operate licensed independent-contractor
   Agents/Associate Brokers. Mallan does NOT build employee payroll, benefits, time-off, unrelated employee
   HR files, or disciplinary/performance-management bureaucracy.
2. **§20.3 document context** — every document must have BUSINESS CONTEXT, but that context depends on
   lifecycle stage. Transaction-specific documents attach to the canonical Transaction once one exists;
   earlier agreements, disclosures and workflow documents attach to their actual Party/Opportunity/Property/
   Listing context. No contextless upload bucket. Link earlier records to the Deal context later — do not
   copy them into a second document truth.
3. **§21.1 provider authority** — KEEP the hierarchy. Cotality/Trestle is NOT a peer of law; it sits below
   as the current provider implementation contract. BUT Web and Media must comply with BOTH the legal/
   business/advertising/Fair-Housing/REBNY/RLS/UCBA stack AND the verified Trestle/Cotality technical/use/
   display/attribution/API contract where provider data is involved. Provider replacement must not require
   rewriting Mallan's business architecture.
4. **§19.1 lead routing** — NOT contradictory. Preserve "Do not overbuild lead routing when simple explicit
   assignment works" — it governs the ROUTING MECHANISM. The expanded Lead lifecycle governs the BUSINESS
   RELATIONSHIP. Distribution stays simple, explicit and auditable. Before assigning a brokerage-generated
   Lead, reconcile existing Party and existing active Agent relationship. Do not casually assign an existing
   Client to another Agent. Reassignment must be deliberate and retain history.
