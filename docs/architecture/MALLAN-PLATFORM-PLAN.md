# MALLAN PLATFORM PLAN

## One authoritative product, architecture, compliance, delivery, error, and housekeeping plan

**Repository:** `mallan67/mallan-nyc` only
**Canonical file:** `docs/architecture/MALLAN-PLATFORM-PLAN.md`
**Required entry points:** `AGENTS.md`, `AI-START-HERE.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `README.md`
**Status:** Governing target plan. It does not claim that every capability is implemented.
**Document rule:** Amend this file in place. Do not create `rev`, `final`, `new`, dated replacement, addendum, or supplemental versions.

---

# 0. How to use this plan

This file is the one normative reference for:

- the Mallan business model;
- Cotality, REBNY, and Mallan responsibilities;
- the `SL-`, `RL-`, and `RLS*` listing model;
- public search, CRM, portals, CMA, marketing, and intelligence;
- frontend/backend integration;
- authorization, policy, contracts, errors, and observability;
- repository housekeeping, bloat control, and safe removal;
- agent operating rules;
- implementation sequence, proof requirements, rollback, and release rules.

All AI agents and human contributors must read this file before planning or changing platform-wide behavior.

Supporting files may remain only as:

1. machine-generated evidence;
2. historical evidence;
3. narrow runbooks implementing a rule already defined here;
4. current operational status and issue registries.

A supporting file may not contradict this plan or present itself as a second active architecture.

## 0.1 Requirement identifiers

Every normative rule has a stable identifier. Cite the identifier, never the prose. Identifiers are permanent. A removed requirement is marked retired and its identifier is never reused for a different meaning.

| Family | Domain |
|---|---|
| `DOC` | Document governance |
| `AGT` | Agent operating rules |
| `BUS` | Business truth |
| `LST` | Listing identity and matched pairs |
| `COT` | Cotality contract and live-data authority |
| `REB` | REBNY policy |
| `ARC` | Architecture |
| `TRN` | Transport and envelopes |
| `VER` | Contract versions |
| `AUZ` | Authorization |
| `POL` | Policy and compliance |
| `ERR` | Error governance |
| `AUD` | Contract audit |
| `HYG` | Housekeeping and bloat |
| `SEA` | Search |
| `CRM` | CRM migration |
| `SEL` | Seller portal |
| `CMA` | Comparative market analysis |
| `MKT` | Marketing and consent |
| `INT` | Intelligence |
| `OPS` | Verification, health, and rollback |
| `PH` | Implementation phases |

## 0.2 Status legend

Every requirement carries exactly one status.

| Status | Meaning |
|---|---|
| `DECIDED` | Settled. Change requires the change protocol in section 24. |
| `DEFERRED` | Deliberately not decided. The blocking condition is named. |
| `OPEN` | Needs an answer. Tracked in section 22. |
| `DERIVED` | Follows from another requirement and changes when its parent changes. |
| `RETIRED` | Withdrawn. The identifier is never reused. |

## 0.3 Section header convention

Every numbered section carries a header block:

```text
Depends on: identifiers that must hold for this section to be valid
Feeds:      identifiers that break if this section changes
Status:     the section's dominant status
```

## 0.4 Blast radius

Three requirements have platform-wide blast radius. Changing any of them requires rechecking every dependent requirement in the same edit:

- `ARC-2` — the single application-service door. Every entry point routes through it.
- `TRN-1` through `TRN-3` — the envelopes. Every JSON response carries them.
- `COT-11` — live Cotality derivation. Every provider-derived field, attribution, string, and mapping depends on it.

## DOC-1 — Single source of platform truth

**Status:** `DECIDED`

Only this file may establish platform-wide architecture, business rules, implementation sequence, or cross-system contracts.

## DOC-2 — Repository entry points

**Status:** `DECIDED`

`AGENTS.md`, `AI-START-HERE.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `README.md` must identify this file as the first platform-plan read. They may summarize or route, but may not duplicate a competing architecture.

## DOC-3 — Amend in place

**Status:** `DECIDED`

Do not create:

```text
MALLAN-PLATFORM-PLAN-REV6.md
MALLAN-PLATFORM-PLAN-FINAL.md
MALLAN-PLATFORM-PLAN-NEW.md
MALLAN-PLATFORM-PLAN-YYYY-MM-DD.md
MALLAN-PLATFORM-PLAN-ADDENDUM.md
```

The path is stable. The contents evolve.

## DOC-4 — Source-document consolidation

**Status:** `DECIDED`

The following documents contain useful requirements or evidence but must not remain competing normative plans after consolidation:

- `Mallan_Intelligence_Master_Plan.md`;
- prior `MALLAN-PLATFORM-PLAN.md` drafts;
- `crm-search-agent-workflow-rebuild.md`;
- `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md`;
- `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md`;
- `COTALITY-COMPLETE-REFERENCE.md`;
- `SELLER-001-SPEC-2026-07-03.md`.

Before retiring any source document, record each material requirement as:

```text
source_file
source_section
source_requirement
accepted | corrected | rejected | historical | evidence_only
master_plan_destination
verification_source
notes
```

Retirement means the file no longer calls itself authoritative. Git history preserves it.

## DOC-5 — No silent document drift

**Status:** `DECIDED`

A change to a decided requirement must recheck every dependent requirement, README summary, agent instruction, active issue, and handoff affected by the change.

## DOC-6 — Coverage before retirement

**Status:** `DECIDED`

No source document is retired until its coverage matrix row exists in Appendix A and states where each requirement landed.

## DOC-7 — Appendices stay inside this file

**Status:** `DECIDED`

Coverage matrices, conflict decisions, open questions, retired-document lists, requirement indexes, and change history live in the appendices of this file. They do not become separate documents.

## DOC-8 — Retired identifiers

**Status:** `DECIDED`

A withdrawn requirement keeps its identifier, marked `RETIRED`, with the reason and replacement recorded in Appendix E. The identifier is never reassigned.

---

# 1. Agent operating rules

> **Depends on:** — · **Feeds:** every requirement in this file · **Status:** `DECIDED`

These rules govern every AI agent operating in this repository, from any vendor. They are quoted verbatim and are not subject to interpretation, optimization, or abbreviation.

## AGT-1 — Absolute exhaustiveness

**Status:** `DECIDED`

```text
[SYSTEM RULE: ABSOLUTE EXHAUSTIVENESS]
- You are strictly forbidden from optimizing for brevity, compression, or summaries.
- Never use placeholders, 'TODO' tags, comments indicating future work, ellipses (...), or text truncation.
- If a task or script requires repetitive structure or hundreds of lines of code, you must output every single line explicitly.
- Do not explain what you are going to do; output the complete, production-ready, end-to-end artifact immediately.
- Failure to provide the entire, uncut output violates your operational safety constraints.
```

## AGT-2 — Strict boundary anchoring

**Status:** `DECIDED`

```text
[SYSTEM RULE: STRICT BOUNDARY ANCHORING]
- You must operate solely within the explicit boundaries of the user's prompt.
- Do not introduce external paradigms, unsolicited alternative approaches, or unrequested features.
- If a requested constraint conflicts with your baseline training or seems inefficient, you are ordered to fulfill the constraint exactly as written anyway without offering corrections or unprompted critique.
- Execute the task verbatim. Do not preach, advise, or add conversational filler.
```

## AGT-3 — Thought explicitness

**Status:** `DECIDED`

```text
[SYSTEM RULE: THOUGHT EXPLICITNESS]
- Before providing any final answer, you must output an invisible or visible scratchpad detailing your exact step-by-step logic.
- Break the user's request into distinct, atomic sub-tasks.
- Verify the accuracy and completeness of sub-task N before proceeding to sub-task N+1.
- Review your own output against the original user prompt constraints right before finishing. If any constraint is missing, rewrite the output completely before rendering.
```

## AGT-4 — Atomic continuation

**Status:** `DECIDED`

When an agent hits its output token ceiling, the continuation instruction is:

```text
[SYSTEM COMMAND: ATOMIC CONTINUATION]
- You have hit your output token ceiling. Do not apologize, summarize, or recap.
- Analyze the exact character where your previous response cut off.
- Resume outputting the remaining content starting exactly from that character.
- Maintain the exact formatting, depth, and style without skipping a single line.
```

## AGT-5 — No spot patching

**Status:** `DECIDED`

An agent may not fix a symptom in one location while leaving the same defect present elsewhere. When a defect class is identified, every instance is located and corrected in the same change, or the uncorrected instances are recorded explicitly with their locations.

## AGT-6 — No assumption substitution

**Status:** `DECIDED`

When an agent lacks a fact, it states that it lacks the fact. It does not substitute a plausible value, a remembered value, a value from another system, or a value inferred from naming. Absence of evidence is recorded as not verified, never as absence.

## AGT-7 — Read before claiming

**Status:** `DECIDED`

An agent may not describe, summarize, assess, or modify a document it has not read in full. Spot-checking is not reading. File counts, line counts, and name patterns are not evidence of content.

---

# 2. Dependency map

> **Depends on:** — · **Feeds:** all sections · **Status:** `DECIDED`

Read a row as: this block cannot be correct until `Depends on` holds, and changing it forces recheck of `Feeds`.

| Block | Depends on | Feeds | Phase |
|---|---|---|---|
| 1 — Agent rules | — | every requirement | all |
| 3 — Business truth | — | LST, COT, REB, ARC, CRM, SEL, MKT | 1 |
| 4 — Authorities | BUS | COT, REB, POL, AUZ | 1 |
| 5 — Non-negotiable rules | BUS, COT, REB | every implementation section | all |
| 6 — Listing identity | BUS, COT | SEA, SEL, CMA, CRM, AUZ | 1 → 2 |
| 7 — Live Cotality authority | COT, REB | LST, SEA, CMA, SEL, POL | 1 → 2 |
| 8 — Architecture | BUS | TRN, AUZ, POL, ERR, AUD, CRM | 2 |
| 9 — Authorization and policy | ARC, LST, COT, REB | every entry point, SEA, SEL, CMA, MKT | 2 |
| 10 — Transport and versioning | ARC | AUD, both clients, SEA | 2 |
| 11 — Error governance | ARC, TRN | every surface | 2 |
| 12 — Contract audit | TRN, VER, ARC, ERR | every later phase | 2 |
| 13 — Housekeeping | DOC, ARC | every phase | all |
| 14 — Search | LST, COT, ARC, AUZ, POL, TRN | SEL, CMA, INT | 3 |
| 15 — CRM migration | ARC, AUZ, TRN, ERR | SEL, CMA, MKT | 4 |
| 16 — Seller and CMA | LST, COT, SEA, CRM, AUZ, POL | INT | 4 |
| 17 — Marketing | AUZ, POL, CRM | INT | 5 |
| 18 — Intelligence | LST, SEA, SEL, CMA, MKT, OPS | — | 6 |
| 19 — Verification | — | every phase exit | all |
| 20 — Phases | all above | — | — |

**Critical path:** PH-1 → PH-2 → PH-3 → PH-4 → PH-5 → PH-6.

---

# 3. Current business truth

> **Depends on:** — · **Feeds:** LST, COT, REB, ARC, CRM, SEL, MKT · **Status:** `DECIDED`

## BUS-1 — What Mallan is building

**Status:** `DECIDED`

Mallan.nyc is one dynamic New York City brokerage operating system with distinct experiences for:

- the public website and public IDX search;
- agents;
- broker oversight and brokerage operations;
- buyers;
- tenants;
- sellers;
- landlords;
- listings;
- CMA and reporting;
- communications and campaigns;
- transactions, commissions, referrals, and compliance;
- evidence-backed intelligence.

Different experiences may have different interfaces and permissions, but they share one application foundation, identity model, contract vocabulary, policy system, error model, event history, and audit trail.

## BUS-2 — Current data boundary

**Status:** `DECIDED`

Mallan.nyc consumes its licensed Cotality/Trestle feed for authorized listing data and maintains Mallan-owned website records and brokerage workflow data.

Mallan.nyc does not write listing changes back to Cotality.

This website architecture does not depend on, document, or govern external listing-entry products or third-party professional-search products.

## BUS-3 — Static CRM is temporary

**Status:** `DECIDED`

The existing `public/crm` HTML/JavaScript system is legacy migration source code. It is not the permanent target and must not be preserved as a permanently separate frontend.

It must be:

1. inventoried;
2. frozen except for critical safety or production defects;
3. migrated by bounded vertical slices into a dynamic Next.js CRM;
4. kept available until each replacement proves parity;
5. retired only after data, authorization, workflow, production, and rollback proof.

## BUS-4 — One system does not mean one generic screen

**Status:** `DECIDED`

Buyer, tenant, seller, landlord, agent, broker, and public experiences remain distinct products. They share foundations without collapsing into one renamed portal.

## BUS-5 — Mallan responsibility

**Status:** `DECIDED`

Mallan controls:

- `SL-` and `RL-` website records;
- Mallan page presentation;
- CRM records;
- clients and relationships;
- communications and consent;
- portals;
- campaigns;
- showings, feedback, offers, tasks, documents, and transactions;
- local media and ordering;
- reports, decisions, events, evidence, and audit history.

## BUS-6 — Repository boundary

**Status:** `DECIDED`

This plan and repository apply only to `mallan67/mallan-nyc`. Mallan Integrated is outside scope.

## BUS-7 — No dependency on external listing-entry products

**Status:** `DECIDED`

The Mallan website architecture is complete without reference to any external listing-entry product. Provider records arrive through the licensed Cotality feed. How a provider record came to exist upstream is outside the boundary of this system and is not modelled here.

---

# 4. Authorities and precedence

> **Depends on:** BUS · **Feeds:** COT, REB, POL, AUZ · **Status:** `DECIDED`

## REB-1 — REBNY responsibility

**Status:** `DECIDED`

REBNY controls the applicable RLS policy, participation rules, display obligations, feed rights, attribution requirements, status obligations, and effective rule changes.

## REB-2 — Effective dates

**Status:** `DECIDED`

A REBNY rule is applied according to its effective date. Historical records are interpreted under the rule in force at the time of the action. Current disclosures follow the current rule.

## REB-3 — Fail closed on unclear REBNY requirements

**Status:** `DECIDED`

When a REBNY, RLS, IDX, display, or attribution requirement is unclear, conflicting, or absent from the canonical compliance source, stop and report. Do not guess from memory. Do not extrapolate from one field's handling to another's, or from one market's behavior to another's.

## COT-1 — Cotality responsibility

**Status:** `DECIDED`

Cotality/Trestle controls the live API transport and the exact resources, fields, types, enum values, relationships, pagination, throttling, and errors exposed to Mallan's licensed account.

## COT-2 — Evidence precedence

**Status:** `DECIDED`

When sources conflict, use this order:

1. current effective official REBNY rule with effective date;
2. Mallan's executed license and written authorization;
3. authenticated live Cotality API behavior for Mallan's account;
4. current production behavior and current `main`, bounded by exact evidence;
5. generated live mirrors tied to a timestamp and commit;
6. dated reference documents and historical audits.

## COT-3 — Live verification

**Status:** `DECIDED`

For any implementation touching provider fields, statuses, picklists, media, open houses, attribution, permissions, or search behavior, run the applicable live verification when credentials are available:

```bash
npm run cotality:pull
npm run cotality:verify
```

A verification record must include:

```text
verified_at
repository_sha
feed/license identity
metadata checksum
resources observed
fields observed
enum values observed
filter probes
pagination probes
known rejected operations
changes from prior verification
```

When credentials are unavailable, state that live verification did not run. Do not guess.

## COT-4 — Field existence is not permission

**Status:** `DECIDED`

A field appearing in the feed does not prove permission for public display, internal use, seller display, CMA use, analytics, storage, export, or redistribution. The executed license and REBNY authorization determine allowed use.

---

# 5. Non-negotiable rules

> **Depends on:** BUS, COT, REB · **Feeds:** every implementation section · **Status:** `DECIDED`

## ARC-1 — No client-side provider calls

**Status:** `DECIDED`

All Cotality calls occur server-side through a controlled provider adapter.

## ARC-2 — One application-service door

**Status:** `DECIDED`

HTTP routes, Server Components, jobs, crons, and internal tools must resolve an actor and call the same application/use-case service.

They may not bypass authorization or policy by calling raw domain services directly.

## ARC-3 — No silent failure

**Status:** `DECIDED`

Unknown, unsupported, stale, conflicting, unlicensed, and unverified states must be explicit.

## COT-5 — No provider guessing

**Status:** `DECIDED`

Use only verified fields and values. Never invent a provider field, enum, status, permission, media type, or query behavior.

## LST-1 — No duplicate public matched pair

**Status:** `DECIDED`

A verified Mallan/provider matched pair produces one Mallan public result and one canonical Mallan page.

## LST-2 — No local provider mutation

**Status:** `DECIDED`

Mallan web edits never rewrite the Cotality/provider row.

## LST-3 — No provider overwrite of Mallan workflow

**Status:** `DECIDED`

Provider refreshes never erase Mallan presentation, local media, seller workflow, CRM history, marketing, notes, or other Mallan-owned data.

## POL-1 — Compliance fails closed, except where the feed is pre-filtered

**Status:** `DECIDED`

Unknown display permission, unresolved audience, missing required attribution, Participant Only, Owner Opt-Out, or unresolved compliance review may not silently proceed.

**This rule is not uniform across the display gates, and applying it uniformly has already caused a production incident.**

## POL-1.1 — Gate-by-gate null semantics

**Status:** `DECIDED`

| Gate | Field | Null means | Rule |
|---|---|---|---|
| 1 — Owner Opt-Out | `Permission = OwnerOptOut` / `MlsStatus = OwnerOptOut` | — | Fail closed. Never displayed anywhere. |
| 2 — Participant Only | `Permission = Private` | — | Fail closed. Co-brokers only; never public or IDX. |
| 3 — Internet Display | `InternetEntireListingDisplayYN` | **displayable** | Block only on explicit `false`. **Do not require affirmation.** |
| 4 — Address Display | `InternetAddressDisplayYN` | **displayable** | Block only on explicit `false`. When `false`, suppress the address; the listing may still display. |
| 5 — AVM Display | `InternetAutomatedValuationDisplayYN` | **blocked** | Require affirmation. Null denies. |
| 6 — Consumer Comment | `InternetConsumerCommentYN` | **blocked** | Require affirmation. Null denies. |

## POL-1.2 — Why gates 3 and 4 differ

**Status:** `DECIDED`

The provider's policy layer pre-filters non-displayable rows **before** they reach the licensed feed. A row that arrives has already passed the internet-display gate, so null means "already permitted upstream," not "unknown."

Gates 5 and 6 are per-row opt-out flags the provider **does** populate at row level, so null legitimately means "not set" and must deny.

## POL-1.3 — Recorded incident

**Status:** `DECIDED`

On 2026-04-30, applying affirmation logic to `InternetEntireListingDisplayYN` suppressed **7,594 rows that should have been displayable**. The incident record is `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.

Any change to gate-3 or gate-4 null handling must cite this requirement and that incident record, and must be covered by a test that fails when affirmation logic is reintroduced.

## POL-1.4 — Aggregate display gate

**Status:** `DECIDED`

```text
idx_display_yn =
      rls_eligible
  AND NOT terminal_status
  AND internet_entire_listing_display_yn   (gate 3)
  AND NOT participant_only                 (gate 2)
  AND NOT owner_opt_out                    (gate 1)
```

`rls_eligible = false` — a Mallan web sale or rental listing, or a commercial record — forces `idx_display_yn = false` regardless of every other gate.

## POL-1.5 — Terminal statuses

**Status:** `DECIDED`

Terminal statuses force `idx_display_yn = false`. The set is resolved from live provider status definitions per `COT-11`; it is not hardcoded in application logic. As observed at the last verification it comprised closed, sold, leased, rented, withdrawn, expired, and cancelled. A closed record is removed from public display within 24 hours.

Status normalization folds case, resolves known aliases, and trims whitespace. **An unrecognized status value is preserved, never coerced to a familiar one** (`COT-10`).

## ERR-1 — Empty is not an error

**Status:** `DECIDED`

A valid search that finds no records returns success with an explicit empty state.

## HYG-1 — No deletion by grep alone

**Status:** `DECIDED`

The absence of a discovered caller is not proof that a route, module, field, flag, job, or document is safe to remove.

## OPS-1 — No unsupported completion claim

**Status:** `DECIDED`

A capability is not complete without exact tests, production or immutable-preview proof, health evidence, rollback, documentation, and operational ownership.

---

# 6. Listing identity and matched pairs

> **Depends on:** BUS, COT · **Feeds:** SEA, SEL, CMA, CRM, AUZ · **Status:** `DECIDED`, one `OPEN`

## LST-4 — Exact prefix definitions

**Status:** `DECIDED`

```text
SL-* = Mallan web SALE listing identifier
RL-* = Mallan web RENTAL listing identifier
RLS* = separate REBNY/Cotality provider listing identifier
```

The governing rules, stated exactly:

- `SL-*` means a Mallan web sale listing.
- `RL-*` means a Mallan web rental listing.
- The prefix identifies transaction type only.
- It does not establish whether a Cotality counterpart exists.
- `RLS*` identifies the separate Cotality/REBNY provider record.
- A Mallan web listing may have no match, a possible match, a verified match, a conflict or a broken match.
- When a verified match exists, the `SL-*` or `RL-*` record remains the canonical mallan.nyc public page.
- The `RLS*` counterpart remains read-only and retained internally.
- The provider duplicate is suppressed from Mallan public surfaces.
- Mallan fields and provider fields remain separate and never silently overwrite each other.

`RL-` is not an abbreviation of `RLS`. `RL-` carries a hyphen and identifies a Mallan web rental listing. `RLS` carries no hyphen and identifies a provider record. Treating `RL-` as a provider prefix would apply Mallan-owned display handling to provider records, which is a compliance failure.

## LST-5 — Separate dimensions

**Status:** `DECIDED`

The system must not overload the prefix. It must represent these facts separately:

```text
transaction_type
- sale
- rental

record_source
- mallan_web
- cotality

mallan_web_id
- SL-*
- RL-*
- null

provider_identity
- cotality_listing_key
- cotality_listing_id
- source system identity when supplied
- provider_last_verified_at

reconciliation_status
- not_searched
- no_match
- possible_match
- verified_match
- conflict
- broken_match

public_canonical_source
- mallan_web
- cotality
```

## LST-6 — Example

**Status:** `DECIDED`

For 333 East 46th Street, Apartment 2G:

```text
Mallan web record: SL-0004
Transaction type: sale
Provider counterpart: RLS20093870
Reconciliation: verified_match
Mallan public canonical record: SL-0004
Provider public duplicate on Mallan surfaces: suppressed
Provider row internally: retained and read-only
```

## LST-7 — Matched-pair behavior

**Status:** `DECIDED`

When a verified match exists:

- the `SL-` or `RL-` record remains the canonical mallan.nyc page;
- the provider counterpart remains stored and refreshed;
- the provider duplicate is suppressed from Mallan public results, cards, sitemaps, canonical URLs, agent listing pages, featured listings, and similar-listing results;
- both remain visible internally for reconciliation and discrepancy review;
- the provider row is not deleted or mutated;
- Mallan presentation is not replaced by the provider row.

## LST-8 — No authority handover

**Status:** `DECIDED`

Matching does not convert the Mallan record into a provider-owned record and does not withdraw the Mallan page.

Any document that says to withdraw the `SL-`/`RL-` record, replace it publicly with `RLS*`, or transfer authority is superseded by this rule.

## LST-9 — Current implementation shortcut

**Status:** `DECIDED`

Current code may use `SL-`/`RL-` prefixes as a proxy for Mallan ownership or dedupe preference. That is an implementation shortcut, not the business definition.

PH-1 must inventory every prefix inference. PH-2 must replace unsafe inferences with explicit source, ownership, and reconciliation fields where necessary.

## LST-10 — Match confidence

**Status:** `DECIDED`

A verified match requires sufficient identity evidence, such as:

- normalized address atoms;
- unit number;
- postal code;
- listing class;
- known provider identity;
- agent/office relationship;
- effective dates;
- corroborating source data.

Email, a loose address string, or one coincidental attribute is not enough.

## LST-11 — Ambiguity fails closed

**Status:** `DECIDED`

Possible, conflicting, or broken matches may not suppress either record as though the match were verified. They require review.

## LST-12 — Provider-controlled facts

**Status:** `DECIDED`

The provider counterpart remains authoritative for its own returned facts, including provider identifiers, provider timestamps, provider status, provider attribution, provider permissions, and provider media metadata.

## LST-13 — Mallan-controlled facts

**Status:** `DECIDED`

The Mallan record remains authoritative for Mallan website presentation and workflow, including:

- Mallan headline and presentation;
- Mallan-owned media and ordering;
- seller portal content;
- marketing plan and history;
- internal notes;
- showings and feedback;
- offers and tasks;
- documents;
- CMA selection and professional adjustments;
- featured ordering when permitted.

## LST-14 — Discrepancy handling

**Status:** `DECIDED`

For a verified matched pair, compare material facts such as:

- status;
- price;
- address and unit;
- listing class;
- public remarks where relevant;
- attribution;
- open houses;
- material dates;
- provider display permission.

A discrepancy creates a visible reconciliation condition. Serious public or compliance discrepancies block or degrade publication according to policy instead of being hidden.

## LST-15 — Reconciliation controls

**Status:** `DECIDED`

The CRM must let an authorized agent or broker:

- see that a Mallan web record and a provider record represent the same listing;
- inspect field-level discrepancies;
- confirm a possible match;
- reject an incorrect match;
- repair a broken match;
- record who resolved it and when.

## LST-16 — Durable match relationship

**Status:** `OPEN` — tracked as `Q-3`

Whether the current data model expresses the match relationship explicitly, or whether matching is inferred at query time, is unverified. This determines whether a schema change is required. PH-1 resolves it.

## LST-17 — Existing implementation, verified

**Status:** `DECIDED`

Observed present in the repository at the time of writing:

- `lib/listings/dedupe-crm-vs-idx.ts` — defines the Mallan prefix set and a preference function that favors the Mallan record over a provider duplicate;
- `lib/listings/exclusive-agent-assignment.ts` — defines the Mallan-owned prefix list used for agent attribution;
- cross-source suppression is invoked from `app/api/listings/route.ts` and `app/api/agents/[slug]/listings/route.ts`.

Not verified: whether `lib/search/public-listing-db.ts` and `lib/search/public-listing-trestle.ts` apply cross-source suppression. No caller was observed in those paths, which is not proof of absence. PH-1 resolves it by live trace. No claim is made that public search currently duplicates a matched pair.

---

# 7. Live Cotality authority

> **Depends on:** COT, REB · **Feeds:** LST, SEA, CMA, SEL, POL · **Status:** `DECIDED`
> **Blast radius: platform-wide. `COT-11` governs every provider-derived value in the system.**

## COT-6 — Preserve both provider identifiers

**Status:** `DECIDED`

The provider adapter must preserve both the provider's canonical key and human or source listing identifier where supplied. Local code must not silently treat one as the other.

## COT-7 — Media identity

**Status:** `DECIDED`

Media relationships must use verified provider keys and exact provider URLs. Do not construct media URLs by guessing.

Each media asset should preserve:

```text
provider_media_key
provider_listing_key
provider_url
media_category
media_order
provider_modified_at
retrieved_at
local_storage_url when copied lawfully
source provenance
```

## COT-8 — Photo-first and media integrity

**Status:** `DECIDED`

The system must:

- preserve provider ordering where required;
- select the correct primary photo;
- distinguish photos, floor plans, videos, and virtual tours;
- avoid substituting a floor plan or non-photo as the primary image;
- retain provider timestamps;
- detect media-set changes;
- fail clearly when media is missing or unavailable.

## COT-9 — Freshness

**Status:** `DECIDED`

Every provider-derived output must carry retrieval time, source modification time when available, and an explicit freshness state.

## COT-10 — Unknown provider values

**Status:** `DECIDED`

Unknown values must be preserved raw, logged, reported, and quarantined from affected regulated outputs until classified. They may not be silently mapped.

## COT-11 — Everything provider-derived is pulled live

**Status:** `DECIDED`

Every field, every attribution, every string, every enumeration, every status, every permission value, every property classification, every picklist, every media category, and every mapping that originates with the provider must be pulled live from the Cotality API.

Prohibited without exception:

- guessing a field name, type, value, or meaning;
- assuming a value is unchanged because it was unchanged previously;
- using a placeholder value pending later correction;
- spot-patching one mapping while leaving equivalent mappings stale;
- copying a value from another market, another provider, another brokerage, a standards document, a CSV, a prior audit, a code comment, or an agent's memory;
- inferring a value from a field name;
- hardcoding a status, permission, or classification string.

## COT-12 — Committed snapshots are caches

**Status:** `DECIDED`

Any committed copy of provider vocabulary is a cache, never an authority. It must be drift-checked against live before it is relied on.

`npm run cotality:verify` is that check. It is read-only. Exit `0` means the committed copy matches live. Exit `1` means drift. Exit `2` means Cotality could not be reached.

## COT-13 — Unreachable is not unchanged

**Status:** `DECIDED`

Exit `2` from the drift check means unverified. Work that depends on provider truth stops rather than proceeding on the cached copy. An agent may not treat an unreachable provider as confirmation that nothing changed.

## COT-14 — Drift is blocking

**Status:** `DECIDED`

Detected drift is a blocking condition for any change touching the drifted vocabulary. It is not a warning to be noted and passed.

## COT-15 — Recorded drift evidence

**Status:** `DECIDED`

A live drift check executed on 2026-07-28 connected to Cotality and reported that the committed vocabulary copy had already drifted from live. Values present live and absent from the committed copy included:

```text
MlsStatus          ActiveOptionContract, PendingBackupsRequested,
                   PendingFeasibility, PendingInspection, PendingShortSale,
                   PrepNoShow, PrepShow
ListingPermission  ComingSoon
Permission         ComingSoon
SyndicateTo        JamesEditioncom, Properstarcom, RealtorcomInternational
Disclosures        OwnerIsanAgent
```

`MlsStatus` and `ListingPermission` drive display gating. A system reasoning from the committed copy is reasoning from a vocabulary the provider no longer considers complete. This is the concrete justification for `COT-11` through `COT-14`.

Remediation is `npm run cotality:pull` followed by review of the resulting difference. That regenerates a committed file and is therefore a separate, reviewable change.

## COT-16 — Attribution is provider-derived

**Status:** `DECIDED`

Listing agent name, listing office name, provider office identifiers, provider agent identifiers, and every displayed attribution string are provider-derived values subject to `COT-11`. They are never composed locally, never defaulted, and never carried forward from a stale copy when the provider row is refreshed.

## COT-17 — Mapping tables are generated, not authored

**Status:** `DECIDED`

Field maps, enum maps, and classification maps between provider vocabulary and Mallan vocabulary are generated from live provider metadata and regenerated when the provider changes. A hand-authored mapping table is a cache subject to `COT-12` and a drift check.

---

# 8. Target application architecture

> **Depends on:** BUS · **Feeds:** TRN, AUZ, POL, ERR, AUD, CRM · **Status:** `DECIDED`
> **Blast radius: `ARC-2` is platform-wide. Every entry point routes through the application service.**

## ARC-4 — Target layers

**Status:** `DECIDED`

```text
Interfaces
  public website
  dynamic CRM
  broker administration
  buyer portal
  tenant portal
  seller portal
  landlord portal
  cron/job/internal adapters

Adapters
  HTTP adapters
  Server Component adapters
  job/cron adapters

Application layer
  search use cases
  listing use cases
  CRM use cases
  seller activity use cases
  CMA use cases
  marketing use cases
  transaction use cases
  intelligence use cases

Domain and policy
  identity and reconciliation
  authorization
  compliance and display policy
  consent and suppression
  search contracts
  artifacts and evidence
  errors

Infrastructure
  Cotality adapter
  database repositories
  media/storage adapters
  email/communication adapters
  observability
```

## ARC-5 — Thin adapters

**Status:** `DECIDED`

HTTP routes decode input, resolve actor and context, invoke an application service, and encode output. They do not contain duplicated business policy.

## ARC-6 — Internal calls do not self-call HTTP

**Status:** `DECIDED`

Server Components, jobs, and crons call application services directly with an explicit actor and context. They do not make internal HTTP requests to the application's own API.

## ARC-7 — Domain services are not public entry points

**Status:** `DECIDED`

Raw domain services and repositories may not be called from arbitrary routes, UI code, or jobs.

## ARC-8 — Shared contract, not duplicated frontends

**Status:** `DECIDED`

The static CRM is migrated into the dynamic application. Public and authenticated products may remain different interfaces, but not permanently disconnected implementations with competing contracts.

## ARC-9 — Enforced by audit

**Status:** `DERIVED` from ARC-2, ARC-7

Conformance to `ARC-2` and `ARC-7` is machine-checked by the contract audit in section 12. A direct domain-service call from a route, Server Component, cron, or job is an audit violation, not a style preference.

---

# 9. Authorization, policy, and non-disclosure

> **Depends on:** ARC, LST, COT, REB · **Feeds:** every entry point, SEA, SEL, CMA, MKT · **Status:** `DECIDED`

## AUZ-1 — Actor resolution

**Status:** `DECIDED`

Every use case resolves an actor:

```text
anonymous
client
agent
broker
system_job
service_identity
```

## AUZ-2 — Resource authorization

**Status:** `DECIDED`

Authorization includes:

- actor role;
- resource ownership;
- brokerage relationship;
- client relationship;
- listing relationship;
- portal entitlement;
- field-level visibility;
- action-level permission.

## AUZ-3 — Broker role does not override provider restrictions

**Status:** `DECIDED`

Broker permissions may expand Mallan operational access but cannot bypass REBNY, license, provider, privacy, or legal restrictions.

## AUZ-4 — Non-disclosure

**Status:** `DECIDED`

For identifier-addressed protected resources, unauthorized and nonexistent resources must not be distinguishable in a way that enables enumeration.

The response must use the same status, the same body shape, and the same application-controlled execution path whether the resource does not exist or exists but belongs to another party, with no intentional or materially distinguishable timing difference.

Byte-identical wall-clock timing is not achievable and is not required. The requirement is that the application does not branch in a way an observer can measure: no extra lookup, no different code path, no distinguishable error handling between absent and not-permitted.

## AUZ-5 — Listing entitlement

**Status:** `DECIDED`

For listing-bearing operations, entitlement is evaluated against `record_source`, `mallan_web_id`, `provider_identity`, `reconciliation_status`, ownership, representation, and audience. Role alone never authorizes a listing operation.

## AUZ-6 — Three distinct outcomes

**Status:** `DECIDED`

| Situation | Response |
|---|---|
| Authorized query returning zero records | success with explicit empty state |
| Authenticated actor lacks a broad feature permission | `FORBIDDEN` |
| Identifier-addressed resource mismatch | `RESOURCE_NOT_AVAILABLE` |
| Actual failure | the applicable error code |

An authorized-but-empty result is never expressed as a denial, and a denial is never expressed as an empty result.

## POL-2 — Policy order

**Status:** `DECIDED`

The application may load the minimum record needed to evaluate policy, then applies authorization, listing restrictions, audience rules, field suppression, attribution, and purpose-specific policy before returning protected data.

Policy that depends on record-specific facts cannot precede loading that record. Requiring every gate before every data access is not implementable.

## POL-3 — Fair Housing state

**Status:** `DECIDED`

Until a production scanner and workflow are connected and proved, the state is `not_evaluated`, not `allowed`.

Compliance-sensitive public or marketing content requires human review when automated evaluation is unavailable or inconclusive.

`not_evaluated` is recorded on the artifact so that anything produced while evaluation was unavailable remains identifiable.

## POL-4 — Versioned policy

**Status:** `DECIDED`

Each operationalized policy records:

```text
policy_id
authority
official_source
effective_date
superseded_date
version
affected_workflows
audiences
enforcement_mode
required_disclosure
required_form
test_ids
owner
review_status
```

## POL-5 — Compliance-sensitive surfaces

**Status:** `DECIDED`

The following require the `POL-3` review path when evaluation is unavailable or inconclusive:

1. any outbound marketing email, campaign, or template;
2. any public listing description, headline, or marketing remark;
3. any listing presentation, seller report, landlord report, or CMA narrative shown outside the brokerage;
4. any advertising copy naming a listing, building, neighborhood, agent, or the brokerage;
5. any generated text destined for any of the above.

Purely internal, non-client-facing text is not gated.

## POL-6 — Evaluation receives context

**Status:** `DECIDED`

A compliance evaluation receives the text, the originating field, the audience, the surface, and the listing provenance. It does not receive a bare string. Without context an evaluation cannot distinguish a factual amenity description from a statement of preference about occupants, and will produce false results that train reviewers to ignore it.

---

# 10. Transport and versioning

> **Depends on:** ARC · **Feeds:** AUD, both clients, SEA · **Status:** `DECIDED`
> **Blast radius: `TRN-1` through `TRN-3` apply to every JSON response.**

## TRN-1 — Success envelope

**Status:** `DECIDED`

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "resultState": "success",
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-2 — Empty envelope

**Status:** `DECIDED`

```json
{
  "ok": true,
  "data": [],
  "meta": {
    "resultState": "empty",
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-3 — Error envelope

**Status:** `DECIDED`

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "retryable": false
  },
  "meta": {
    "contractVersion": "...",
    "requestId": "..."
  }
}
```

## TRN-4 — Exceptions

**Status:** `DECIDED`

Files, byte streams, redirects, auth callbacks, provider webhooks, and minimal health probes may use transport-specific responses, but their behavior and error contract must still be documented and registered.

Registered exception classes:

```text
file
stream
redirect
auth_callback
webhook
health
```

An unregistered non-JSON response is an audit violation.

## TRN-5 — Envelope metadata is not persisted state

**Status:** `DECIDED`

`meta` is response metadata. The envelope introduces no database column and requires no migration.

## TRN-6 — No arbitrary response shapes

**Status:** `DERIVED` from ERR-4

A route may not return an ad hoc object outside the envelope and the error catalog.

## VER-1 — Separate contract and build versions

**Status:** `DECIDED`

```text
contractVersion
clientContractVersion
minimumSupportedContractVersion
serverSupportedContractVersions
clientBuildVersion
```

A build identifier is not a contract version.

## VER-2 — Compatibility failure

**Status:** `DECIDED`

Incompatible clients receive an explicit contract error, not a generic 500 or silently altered behavior.

## VER-3 — Compatibility is determined by contract version only

**Status:** `DECIDED`

`clientContractVersion` determines compatibility. `clientBuildVersion` is retained for diagnostics, deployment tracing, and support, and never determines schema compatibility.

## VER-4 — Every response advertises versions

**Status:** `DECIDED`

Every response states the contract version used, the supported contract versions, the minimum supported contract version, and whether the client must refresh or upgrade. The check happens on the response envelope, with no separate round trip.

## VER-5 — Clients never silently parse unknown shapes

**Status:** `DECIDED`

A client receiving an unrecognized envelope raises an explicit error. It does not coerce the response into a plausible-looking object.

## VER-6 — Generated client lifecycle

**Status:** `DECIDED`

Where a frontend cannot run a build step, it receives a generated client that is:

- produced from the contract by one named command;
- deterministic, so the same contract input produces byte-identical output;
- stamped with its contract version and build version;
- committed so it loads without a build step;
- never manually copied or hand-edited;
- drift-checked by regenerating and comparing, failing on any difference.

Publication is the commit.

---

# 11. Error governance

> **Depends on:** ARC, TRN · **Feeds:** every surface · **Status:** `DECIDED`

## ERR-2 — One public error taxonomy

**Status:** `DECIDED`

Use one closed platform taxonomy:

```text
VALIDATION
AUTHENTICATION
FORBIDDEN
RESOURCE_NOT_AVAILABLE
CONFLICT
POLICY_BLOCKED
NOT_EVALUATED
PROVIDER_UNAVAILABLE
DATA_STALE
CONTRACT_INCOMPATIBLE
RATE_LIMITED
INTERNAL
```

Internal domain decisions may be more detailed, but adapters map them into this taxonomy.

## ERR-3 — Error catalog fields

**Status:** `DECIDED`

Every error code must define:

```text
code
affected surface
safe user message
internal diagnostic context
severity
retryable
fail-closed behavior
logging requirement
owner
test coverage
health-check coverage
runbook or remediation
deprecation state
```

## ERR-4 — No arbitrary route strings

**Status:** `DECIDED`

Routes may not invent one-off `{ error: "some string" }` contracts outside the error catalog.

## ERR-5 — Error lifecycle

**Status:** `DECIDED`

Every known error or defect is classified:

```text
ACTIVE_DEFECT
MONITORED
MITIGATED
BLOCKED_EXTERNAL
RESOLVED_PENDING_PROOF
CLOSED_PROVED
DEPRECATED_REMOVE
```

Every non-closed item requires an owner, first-seen date, last-verified date, affected files, impact, next action, and closure proof.

## ERR-6 — No hanging catches or warnings

**Status:** `DECIDED`

Temporary catches, fallback branches, warnings, debug logs, and error comments require a disposition and removal condition. They may not remain indefinitely without ownership.

## ERR-7 — Provider failure is never a false empty

**Status:** `DECIDED`

A provider error, timeout, throttle, or authentication failure returns `PROVIDER_UNAVAILABLE`. It never returns an empty success. An empty result asserts that the provider was reached and matched nothing.

---

# 12. Contract audit

> **Depends on:** TRN, VER, ARC, ERR · **Feeds:** every later phase · **Status:** `DECIDED`

## AUD-1 — Baseline

**Status:** `DECIDED`

The current count of conforming entry points is recorded once as a baseline.

## AUD-2 — Ratchet

**Status:** `DECIDED`

The validator fails if conformance decreases. New entry points must conform. Existing non-conforming entry points migrate at any pace but are never added to.

## AUD-3 — What the audit checks

**Status:** `DECIDED`

- entry-point classification;
- transport-exception registration;
- envelope conformance for JSON responses;
- explicit result state on collection responses;
- error-catalog conformance;
- generated-client drift;
- application-service boundary conformance per `ARC-9`;
- provider-vocabulary drift per `COT-12`.

## AUD-4 — The audit states its limits

**Status:** `DECIDED`

The validator must state what it proves and what it does not. It verifies contract conformance. It does not verify correctness, authorization behavior, or live operation.

## AUD-5 — Audit failures block

**Status:** `DECIDED`

An audit failure blocks the change. It is not advisory output.

---

# 13. Housekeeping and bloat governance

> **Depends on:** DOC, ARC · **Feeds:** every phase · **Status:** `DECIDED`

## HYG-2 — What counts as bloat

**Status:** `DECIDED`

Bloat includes:

- duplicate architecture documents;
- duplicate routes or schemas;
- duplicate provider mappers;
- multiple public error formats;
- unused flags and environment variables;
- abandoned crons and jobs;
- unreachable UI;
- obsolete scripts;
- dead exports and unused dependencies;
- backup files and revision copies;
- stale TODO or FIXME comments;
- temporary compatibility paths without deadlines;
- generated artifacts committed without purpose;
- duplicate media or listing rows without reconciliation;
- copied provider facts that become conflicting local truth;
- unresolved console warnings and production logging noise.

Historical migrations are not bloat and must not be deleted merely to make the repository smaller.

## HYG-3 — Disposition states

**Status:** `DECIDED`

Every cleanup candidate receives one state:

```text
KEEP_ACTIVE
MIGRATE
CONSOLIDATE
EVIDENCE_ONLY
HISTORICAL
DEPRECATE_AFTER_PROOF
DELETE_AFTER_PROOF
UNKNOWN_REQUIRES_TRACE
```

## HYG-4 — Required inventories

**Status:** `DECIDED`

Maintain machine-readable or generated inventories for:

- active normative documents;
- routes and HTTP methods;
- non-HTTP entry points;
- errors;
- feature flags;
- environment variables;
- crons and jobs;
- provider adapters;
- database models and fields;
- public assets;
- dependencies;
- temporary compatibility code.

## HYG-5 — Temporary code contract

**Status:** `DECIDED`

Every temporary item must record:

```text
owner
reason
introduced_at
removal_condition
latest_review_date
test proving safe removal
```

There is no permanent temporary code.

## HYG-6 — Safe removal proof

**Status:** `DECIDED`

Before removal:

1. search routes, imports, dynamic references, configuration, tests, generated code, jobs, UI triggers, and runtime traces;
2. distinguish "no caller found in searched paths" from "unused";
3. add or identify replacement behavior;
4. prove the replacement;
5. preserve rollback;
6. remove the old path;
7. verify production and health;
8. update inventories and documentation.

## HYG-7 — Per-change hygiene questions

**Status:** `DECIDED`

Every PR answers:

```text
What was added?
What was removed?
What duplication was introduced or eliminated?
Were errors added or changed?
Were old paths retired?
Did route, flag, job, env, document, or dependency inventories change?
What proves no unrelated files were included?
```

## HYG-8 — Platform check target

**Status:** `DECIDED`

A progressive command should converge on:

```bash
npm run platform:check
```

It should eventually validate:

- canonical-plan and README navigation;
- duplicate active-plan detection;
- route inventory completeness;
- error-catalog conformance;
- generated-contract drift;
- provider-vocabulary drift;
- stale flags;
- unowned TODO or FIXME items;
- expired temporary-code deadlines;
- forbidden backup or revision filenames;
- dependency and dead-export findings;
- applicable health probes.

The command must state what it currently proves and what remains planned.

## HYG-9 — One branch, one bounded capability

**Status:** `DECIDED`

A branch contains one bounded capability. Unrelated in-flight work is never swept into a commit. Before every commit, the staged set is inspected and compared against the intended scope.

---

# 14. Search

> **Depends on:** LST, COT, ARC, AUZ, POL, TRN · **Feeds:** SEL, CMA, INT · **Status:** `DECIDED`

## SEA-1 — Separate products, shared meaning

**Status:** `DECIDED`

Public search and authenticated agent search may differ in inventory, permissions, fields, ranking, and actions, but share stable filter definitions and provider mappings.

## SEA-2 — Public search scope

**Status:** `DECIDED`

Public search uses only inventory and fields authorized for public display.

## SEA-3 — Honest internal-search scope

**Status:** `DECIDED`

Do not claim full-market or full-RLS coverage unless a separately authorized feed is obtained and proved. The interface must state actual scope.

## SEA-4 — One canonical pipeline

**Status:** `DECIDED`

Each visible search control must map end to end:

```text
UI control
criteria schema
application service
provider or local query
field mapping
policy decision
DTO
rendering
saved-search version
alert replay
```

## SEA-5 — Unsupported criteria

**Status:** `DECIDED`

Unsupported or unpermitted criteria produce an explicit decision. They are not silently dropped and do not silently return zero.

## SEA-6 — Deterministic parity

**Status:** `DECIDED`

For the same criteria, audience, inventory scope, entitlement set, and as-of snapshot, the result identifiers and their order are deterministic.

Parity is not "same criteria produce same results" across audiences. Public and agent results differ intentionally. The guarantee holds within a fixed audience, scope, entitlement, and snapshot tuple.

## SEA-7 — Matched-pair suppression order

**Status:** `DECIDED`

Apply identity reconciliation and public suppression before final totals, pagination, saved-search replay, sitemap output, and similar-listing output.

## SEA-8 — Search states

**Status:** `DECIDED`

The interface distinguishes:

```text
loading
success
empty
unsupported
not authorized
stale
provider unavailable
partial or degraded
contract incompatible
```

## SEA-9 — Field contract

**Status:** `DECIDED`

Every searchable or filterable field records:

```text
canonical concept
provider field
local field
value type
supported filter operations
sort support
public visibility
agent visibility
portal visibility
report and CMA support
fallback behavior
source timestamp
verification status
```

Every provider-side entry in this contract is populated from live provider metadata per `COT-11` and `COT-17`.

## SEA-10 — Acceptance criteria

**Status:** `DECIDED`

A successful HTTP status and a well-formed envelope do not prove working search. Acceptance requires all of:

1. sale and rental separation;
2. correct totals after policy filtering;
3. pagination with no unreachable results;
4. URL state reflecting the query;
5. back and forward navigation restoring state;
6. map and list synchronization where both are present;
7. loading state;
8. empty state distinct from failure;
9. provider failure surfaced, not silently empty;
10. unsupported filter failing loudly;
11. stale-data indication;
12. mobile behavior;
13. public-field suppression;
14. required attribution present;
15. one matched pair producing one public result and one canonical Mallan URL.

---

# 15. Dynamic CRM migration

> **Depends on:** ARC, AUZ, TRN, ERR · **Feeds:** SEL, CMA, MKT · **Status:** `DECIDED`

## CRM-1 — Target

**Status:** `DECIDED`

The target is a dynamic Next.js CRM using the same application services, authorization, policy, contracts, and error system as the rest of Mallan.nyc.

## CRM-2 — Inventory first

**Status:** `DECIDED`

For every static workflow, record:

```text
screen or workflow
current files
current API calls
current writes
current permissions
current errors
current tests
current production evidence
target dynamic route and components
dependencies
retirement gate
```

## CRM-3 — Vertical-slice migration

**Status:** `DECIDED`

Migrate in bounded slices such as:

1. listing workspace;
2. client records and timelines;
3. search and saved searches;
4. collections and sharing;
5. showing and feedback;
6. tasks and notes;
7. offers and transactions;
8. CMA;
9. campaigns and communications;
10. brokerage oversight.

## CRM-4 — Retirement gate

**Status:** `DECIDED`

A static workflow may be retired only after:

- data parity;
- authorization parity;
- policy parity;
- success and failure tests;
- production or preview proof;
- rollback proof;
- no unresolved callers;
- documentation and inventory update.

## CRM-5 — Client identity

**Status:** `DECIDED`

Clients persist over time and may have multiple roles. Email and phone support identity but are never the sole identity key.

## CRM-6 — Durable history

**Status:** `DECIDED`

The CRM preserves communications, listing interactions, showings, feedback, offers, tasks, decisions, documents, campaigns, transactions, and outcomes as a coherent timeline.

## CRM-7 — Listing creation and matched-pair display

**Status:** `DECIDED`

The dynamic CRM supports creating and editing Mallan `SL-` sale and `RL-` rental website records, displays any matched provider counterpart as read-only, and surfaces reconciliation discrepancies with the controls required by `LST-15`.

---

# 16. Seller portal and CMA

> **Depends on:** LST, COT, SEA, CRM, AUZ, POL · **Feeds:** INT · **Status:** `DECIDED`

## SEL-1 — Seller portal purpose

**Status:** `DECIDED`

The seller portal provides truthful evidence of activity, market context, communications, documents, and next actions without inflating or inventing exposure.

## SEL-2 — Truth levels

**Status:** `DECIDED`

Seller information distinguishes:

```text
VERIFIED_MALLAN_TRAFFIC
TRACKED_CAMPAIGN
PORTAL_REPORTED
EXTERNAL_PRESENCE
MARKET_PROXY
```

External presence proves appearance, not traffic volume. Anonymous traffic remains aggregate unless the person self-identifies.

## SEL-3 — Live activity is separate from CMA

**Status:** `DECIDED`

Live market activity updates independently from the last shared CMA. A stale shared CMA never freezes live market activity, and refreshing live activity never alters a shared CMA version.

## SEL-4 — Live activity

**Status:** `DECIDED`

Where licensed and permitted, show:

- active in the building;
- under contract in the building;
- recently sold in the building;
- relevant area competition and closed evidence;
- listing traffic and engagement;
- campaigns;
- inquiries;
- showings and feedback;
- offers and next actions;
- data gaps and freshness.

Status categories are drawn from live provider status definitions per `COT-11`. No status label is hardcoded.

## SEL-5 — Seller sees only shared versions

**Status:** `DECIDED`

The seller sees the deliberately shared CMA version, the shared date, the data-as-of date, the selected comparable set, and whether a newer version is pending. Internal drafts, excluded comparables, and private notes remain private unless published.

## CMA-1 — Automatic starting set

**Status:** `DECIDED`

The system automatically proposes comparables based on verified facts and explains why each was selected.

Building activity covers active, under contract, recently sold, and where useful withdrawn or expired units in the subject building, prioritized by unit type, bedroom and bathroom count, approximate size, floor or line, exposure, condition, outdoor space, property type, and maintenance or common charges.

Area comparables cover similar property type, similar configuration, appropriate price range, reasonable geographic radius, recent listing and closing dates, and relevant building and amenity characteristics.

## CMA-2 — Evidence classification

**Status:** `DECIDED`

Comparable evidence is classified:

```text
COTALITY_VERIFIED
AGENT_CONFIRMED
DERIVED
EXTERNAL_REFERENCE
UNSUPPORTED
STALE
```

Only qualified evidence may drive seller-facing factual conclusions.

## CMA-3 — Agent control

**Status:** `DECIDED`

The authorized listing agent or broker may:

- add and remove comparables;
- reorder comparables;
- adjust radius, recency, and similarity;
- add condition or renovation adjustments;
- add notes;
- select seller-visible comparables;
- regenerate the report;
- share a version.

## CMA-4 — No central approval by default

**Status:** `DECIDED`

Routine seller CMAs do not require central or Maya approval. Broker review applies only when supervision is explicitly configured, a compliance condition triggers it, the product is a separate paid or external valuation product, or the agent escalates it.

## CMA-5 — Facts versus judgment

**Status:** `DECIDED`

Provider facts remain unaltered. Agent adjustments and professional judgments are stored and presented separately and remain distinguishable from provider values.

## CMA-6 — Versioning

**Status:** `DECIDED`

Preserve:

```text
system_generated_set
agent_selected_set
excluded_comparables
manual_adjustments
agent_notes
generated_at
modified_at
shared_at
```

## CMA-7 — Selection reasons

**Status:** `DECIDED`

Each proposed comparable carries the reasons it was selected, for example:

```text
Selected because:
- same building;
- one-bedroom unit;
- approximately 6% larger;
- sold within the last six months;
- similar floor and exposure.
```

## CMA-8 — Subject record authority

**Status:** `DECIDED`

Subject-listing facts come from the subject record's own source. A Mallan web sale listing or Mallan web rental listing is never described as provider-sourced. Comparable facts and status categories come from verified provider data.

## CMA-9 — Refresh and alert

**Status:** `DECIDED`

The system detects when market activity makes a shared CMA outdated and alerts the responsible agent, who may publish an updated version. The seller-visible version does not change until the agent shares it.

## CMA-10 — Re-verification before issuance

**Status:** `DECIDED`

Every selected comparable is re-verified against its authority before a seller-facing report is issued. A provider failure at issuance time fails closed: no report is issued rather than a report built on unverified comparables.

---

# 17. Marketing and consent

> **Depends on:** AUZ, POL, CRM · **Feeds:** INT · **Status:** `DEFERRED` for production sending

## MKT-1 — Consent model

**Status:** `DECIDED`

Consent is contact by channel by purpose, with source, timestamp, evidence, and later opt-out.

Mallan policy requires affirmative opt-in for the applicable channel and purpose, and permanently honors later opt-out or unsubscribe. Both states and their provenance must be durable.

## MKT-2 — Durable opt-out

**Status:** `DECIDED`

Unsubscribe and opt-out are permanent suppression events for the applicable channel and purpose unless a lawful, explicit later change is recorded.

## MKT-3 — Contact provenance

**Status:** `DECIDED`

Every marketing contact must retain source provenance and identity confidence. A purchased or guessed contact may not be silently treated as a consented relationship.

## MKT-4 — Production hold

**Status:** `DEFERRED` — blocked on the consent and provenance data-model decision

Until the consent and provenance data model and enforcement are approved and proved, the system may support classification, suppression, unsubscribe, previews, dry runs, and internal test sends only. It may not claim complete consent enforcement or perform live bulk marketing.

No documentation, report, or interface may state that consent enforcement has been achieved while this requirement is deferred.

## MKT-5 — Sender separation

**Status:** `DECIDED`

Transactional and marketing sending must be operationally separable so campaign problems do not impair transaction communication.

## MKT-6 — Recipient reconciliation

**Status:** `DECIDED`

Before any production campaign, reconcile at minimum:

```text
source audience
eligible
suppressed
unsubscribed
invalid
missing consent
policy blocked
duplicates removed
final recipients
```

The totals must reconcile exactly. An unreconciled report blocks the send.

## MKT-7 — Content policy

**Status:** `DECIDED`

Marketing content must pass applicable attribution, listing permission, Participant Only, Owner Opt-Out, Fair Housing, unsubscribe, and brokerage-policy gates.

## MKT-8 — Existing suppression retained

**Status:** `DECIDED`

Existing fail-closed suppression behavior is retained unchanged. Any bypass parameter remains restricted to transactional sending and is never enabled for marketing.

---

# 18. Intelligence

> **Depends on:** LST, SEA, SEL, CMA, MKT, OPS · **Feeds:** — · **Status:** `DECIDED`

## INT-1 — Intelligence is a consumer, not the owner

**Status:** `DECIDED`

AI and analytics consume verified system data. They do not own listing facts, identities, consent, policy, or workflow state.

## INT-2 — Explainability

**Status:** `DECIDED`

Every recommendation or signal records:

```text
evidence
source timestamps
confidence
reason codes
policy status
expiration
recommended action
assigned person
human approval requirement
model, provider, and version when AI is used
```

No unexplained score is presented as truth.

## INT-3 — No invented facts

**Status:** `DECIDED`

AI may draft, summarize, explain, prioritize, or suggest. It may not invent listing facts, legal conclusions, consent, identity, or completed actions.

## INT-4 — Replaceable providers

**Status:** `DECIDED`

AI providers remain replaceable adapters. Core business records and workflows remain company-owned.

## INT-5 — Outcome loop

**Status:** `DECIDED`

The system records whether recommendations led to contact, showing, decision, offer, agreement, transaction, referral, or no action, without rewriting prior evidence.

## INT-6 — Cost and usefulness ledger

**Status:** `DECIDED`

Each intelligence capability records model cost, human review time, failure rate, revision rate, approval rate, and observed outcome. Capabilities that do not create measurable value are disabled or redesigned.

---

# 19. Verification, health, release, and rollback

> **Depends on:** — · **Feeds:** every phase exit · **Status:** `DECIDED`

## OPS-2 — Evidence standard

**Status:** `DECIDED`

Every claim states:

```text
what was checked
exact command run
raw output
exit code
exact commit and environment
what the evidence proves
what it does not prove
```

Three of these are not sufficient. A finding must be factual, tested, proven, and result-based.

## OPS-3 — Test layers

**Status:** `DECIDED`

Use the applicable layers:

- pure contract and unit tests;
- authorization and policy tests;
- route and runtime tests;
- integration tests;
- generated-contract drift tests;
- browser and UI tests;
- preview or production smoke tests;
- health probes;
- data reconciliation queries.

## OPS-4 — Production proof

**Status:** `DECIDED`

Production proof includes the deployed commit, deployment identity, exact endpoint or workflow, timestamp, observed response or behavior, and any relevant logs or queries.

A source read or a passing unit test never substitutes for a rendering or behavior claim.

## OPS-5 — Rollback

**Status:** `DECIDED`

Every implementation PR states the rollback procedure and verifies that rollback does not corrupt data, identity, policy, or audit history.

## OPS-6 — No unrelated files

**Status:** `DECIDED`

Each branch and PR contains one bounded capability. Diff the branch against its intended base before push and before merge.

## OPS-7 — Maya approval

**Status:** `DECIDED`

No merge or production release occurs without Maya's approval.

## OPS-8 — Health checks

**Status:** `DECIDED`

Operational probes proving the affected surface responds correctly are run before and after a change, and their output is recorded.

---

# 20. Implementation sequence

> **Depends on:** all above · **Feeds:** — · **Status:** `DECIDED`

## PH-1 — Canonical truth, inventory, and cleanup baseline

**Status:** `DECIDED`

### Goal

Stop agents from guessing and establish an evidence-backed map before implementation.

### Steps

1. Put this plan in the repository.
2. Make `AGENTS.md`, `AI-START-HERE.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `README.md` route all agents here.
3. Inventory the active architecture, operational contracts, supplements, specs, and handoffs.
4. Build the source-document coverage matrix in Appendix A.
5. Classify each document as active summary, evidence, historical, runbook, merge, or retire.
6. Inventory every API route by method, runtime, entry-point type, actor, application service, policy, error shape, and caller evidence.
7. Inventory non-HTTP entry points: Server Components, jobs, crons, scripts, hooks, and direct service calls.
8. Inventory the static CRM workflows and their current backend calls.
9. Inventory all `SL-` and `RL-` prefix assumptions in code.
10. Inventory provider identity fields and matched-pair behavior.
11. Inventory public listing dedupe across search, cards, detail pages, agents, featured listings, sitemaps, and similar listings.
12. Inventory errors and arbitrary response shapes.
13. Inventory flags, environment variables, jobs, dependencies, TODO and FIXME items, compatibility paths, and duplicate mappers.
14. Run `npm run cotality:verify` and record the result, including any drift.
15. Run current tests and health checks without changing production.
16. Record exact current statuses using `WORKING`, `PARTIAL`, `UNWIRED`, `DUPLICATED`, `BROKEN`, `MISSING`, or `DEFERRED-INFRA`.
17. Live-trace the public search experience: browser network activity, server data path, whether results render, and the true status of every result dependency, before changing anything.
18. Verify portal reality per role: authentication, authorization, response compatibility, data correctness, and live operation.
19. Identify every direct domain-service call from a route, Server Component, cron, or job.
20. Do not remove code merely because no caller was found.
21. Produce the PH-2 bounded implementation backlog from verified findings.

### Entry-point matrix

One row per route and HTTP method, plus one row per non-HTTP entry point. A route file exposing two methods with different authentication, schemas, or behavior is two rows.

Columns:

```text
route
method
entrypoint_type
runtime
transport_type
frontend_callers_found
authentication_method
actor_classes
resource_authorization
request_schema
response_schema
application_service
domain_service
data_authority
policy_gates
error_behavior
production_verification_status
migration_disposition
```

Every row ends PH-1 with one disposition:

```text
MIGRATE
KEEP_WITH_EXCEPTION
CONSOLIDATE
DEPRECATE_AFTER_PROOF
UNKNOWN_REQUIRES_TRACE
```

Nothing is classified for deletion because no caller was found. Absence of a discovered caller yields `UNKNOWN_REQUIRES_TRACE` or `DEPRECATE_AFTER_PROOF`.

### Exit

- one canonical plan is discoverable from every agent entry point;
- no competing document remains silently authoritative;
- route, error, workflow, listing-identity, and bloat inventories exist;
- current behavior is separated from target behavior;
- every status names its verification method, and unverified items are listed as unverified;
- PH-2 scope is evidence-based.

## PH-2 — Application foundation and identity

**Status:** `DECIDED`

### Goal

Create the shared application, contract, authorization, error, and identity foundation.

### Steps

1. Define the application and use-case service boundary.
2. Route one bounded vertical slice through thin HTTP and internal adapters.
3. Resolve actor and context consistently.
4. Centralize resource authorization and non-disclosure.
5. Centralize applicable listing and display policy.
6. Implement shared success, empty, and error envelopes.
7. Implement contract and build version separation.
8. Establish the error catalog and mapping.
9. Establish explicit record source, ownership, provider identity, and reconciliation concepts.
10. Replace unsafe prefix-based ownership assumptions within the selected slice.
11. Implement verified, possible, conflict, and broken matched-pair states.
12. Preserve Mallan and provider field separation.
13. Generate provider field and enum maps from live metadata.
14. Add dependency and drift tests.
15. Record the contract audit baseline and enable the ratchet.
16. Prove the slice in preview or production and verify rollback.
17. Ratchet architecture checks so new bypasses cannot be introduced.

### Exit

- one use case proves the architecture end to end;
- authorization and policy cannot be bypassed in that slice;
- empty results and errors are contract-correct;
- matched-pair identity is explicit;
- no authority-transfer behavior exists;
- one internal caller is proved through an internal adapter;
- a version-skew failure is demonstrated.

## PH-3 — Working public search

**Status:** `DECIDED`

### Goal

Deliver reliable, deterministic, compliant public search.

### Steps

1. Trace the current browser and server path for the search experience.
2. Trace every result dependency before changing it.
3. Map every visible filter to the canonical field contract.
4. Remove or disable unsupported controls.
5. Connect the interface to the application search service.
6. Limit public inventory to authorized scope.
7. Apply authorization, policy, and matched-pair suppression before final totals and pagination.
8. Implement deterministic sorting and stable pagination.
9. Implement URL state and saved-search versioning.
10. Distinguish loading, empty, unsupported, stale, provider failure, and partial states.
11. Verify sale and rental separation.
12. Verify address and field suppression.
13. Verify required attribution, populated live.
14. Verify mobile behavior.
15. Replay saved searches under the correct contract version.
16. Prove one matched pair produces one public result and one canonical Mallan URL.
17. Prove provider failure does not become a false empty result.

### Exit

- all fifteen `SEA-10` acceptance criteria proven live per audience;
- no visible dead controls;
- no silently ignored criteria;
- deterministic results;
- accurate scope and attribution;
- one canonical result for matched pairs.

## PH-4 — Dynamic CRM, seller loop, and CMA

**Status:** `DECIDED`

### Goal

Replace the most important static workflows and deliver the seller value loop.

### Steps

1. Migrate the listing workspace into the dynamic CRM.
2. Support creation and editing of Mallan `SL-` sale and `RL-` rental website records.
3. Display any matched provider counterpart as read-only.
4. Display reconciliation discrepancies and required actions.
5. Provide match confirmation, rejection, and repair controls.
6. Migrate the client timeline and core communication workflow.
7. Migrate showing, feedback, task, note, offer, and document workflows needed by sellers.
8. Build the seller activity service with truth levels.
9. Add building and area market activity using authorized data and live status definitions.
10. Build automatic initial comparable selection.
11. Explain why each comparable was selected.
12. Allow agent add, remove, reorder, adjust, and note actions.
13. Keep provider facts separate from agent judgment.
14. Version and deliberately share the seller-facing CMA.
15. Keep live market activity updating independently of the shared CMA.
16. Re-verify comparables before issuance and fail closed on provider failure.
17. Add seller portal authorization and non-disclosure.
18. Add stale, missing, and provider-failure states.
19. Prove the flow with an authorized Mallan listing.
20. Retire the corresponding static workflow only after parity and rollback proof.

### Exit

- the dynamic CRM supports the selected daily workflow;
- the seller sees truthful activity and market context;
- live building activity and the shared CMA are visually and semantically distinct;
- the agent can create and share a CMA;
- no provider fact is silently altered;
- the static replacement is safely retired only where proved.

## PH-5 — Marketing readiness

**Status:** `DECIDED`

### Goal

Build a lawful, auditable campaign system before any production bulk send.

### Steps

1. Approve the contact by channel by purpose consent model.
2. Preserve contact-source provenance and identity confidence.
3. Implement opt-in and durable opt-out and unsubscribe.
4. Separate transactional and marketing senders.
5. Implement recipient eligibility and suppression.
6. Handle invalid addresses, bounces, complaints, and duplicates.
7. Connect Fair Housing evaluation and human review.
8. Apply listing permission, Participant Only, Owner Opt-Out, attribution, and audience rules.
9. Build preview and dry-run workflows.
10. Require exact recipient reconciliation.
11. Add campaign audit history and listing and client linkage.
12. Run internal test sends.
13. Require Maya's explicit release before a production campaign.

### Exit

- consent and suppression enforcement are proven;
- totals reconcile exactly;
- compliance fails closed;
- marketing cannot impair transactional email;
- no live send occurs without approval.

## PH-6 — Explainable intelligence and continuous cleanup

**Status:** `DECIDED`

### Goal

Use trustworthy events and outcomes to assist agents without allowing AI or bloat to own the system.

### Steps

1. Define signal vocabulary and reason codes.
2. Connect verified signals to shared contracts.
3. Attach evidence, timestamps, confidence, and policy state.
4. Build human-approved next-best-action recommendations.
5. Keep AI replaceable and subordinate.
6. Record outcomes and usefulness.
7. Add capability and cost ledgers.
8. Continue CRM migration by vertical slice.
9. Schedule document, route, error, flag, job, dependency, and temporary-code review.
10. Remove only items with safe-removal proof.
11. Re-run provider and policy drift checks on a defined cadence.
12. Invalidate dependent evidence when a governing contract changes.

### Exit

- intelligence is explainable and evidence-backed;
- AI does not invent or own facts;
- provider and policy drift are monitored;
- bloat cannot accumulate without ownership and disposition.

---

# 21. Per-PR operating checklist

> **Depends on:** HYG, OPS · **Feeds:** every change · **Status:** `DECIDED`

Every PR must answer:

```text
What bounded capability does this change?
Which requirement identifiers govern it?
What was added?
What was removed?
What duplication was introduced or eliminated?
Were routes, errors, flags, jobs, environment variables, dependencies, or documents changed?
What provider or policy source was verified, and when?
What does the evidence prove?
What does it not prove?
What production or immutable-preview proof exists?
What is the rollback?
What remains open?
Why are there no unrelated files?
```

---

# 22. Open questions and external gates

> **Depends on:** — · **Feeds:** the requirements named · **Status:** `OPEN`

| Identifier | Question | Blocks |
|---|---|---|
| `Q-1` | Exact rights in Mallan's executed feed license for each public, internal, portal, CMA, analytics, storage, and export use | COT-4, SEA-2, SEL-4, CMA-2 |
| `Q-2` | Current authenticated Cotality fields, values, filters, expansions, and runtime behavior | COT-3, COT-11, SEA-9 |
| `Q-3` | Whether durable matched-pair identity requires a schema change | LST-16, PH-2 |
| `Q-4` | Consent and provenance schema changes for production marketing | MKT-4, PH-5 |
| `Q-5` | Any Neon, R2, media-reconciliation, or storage work | PH-2 onward |
| `Q-6` | Any broader licensed inventory source needed for expanded professional search | SEA-3 |
| `Q-7` | Any additional feed or product acquisition | SEA-3, BUS-2 |
| `Q-8` | Which entry points legitimately require a non-JSON transport class | TRN-4, PH-1 |
| `Q-9` | Market-area definition for area comparables: radius, neighborhood boundary, or both, and whether it is configurable per listing | CMA-1, PH-4 |
| `Q-10` | Whether public search currently applies cross-source matched-pair suppression | LST-17, SEA-7, PH-1 |

These are evidence gates. They are not permission to guess, and not a reason to write another plan.

---

# 23. Completion definition

> **Depends on:** OPS · **Feeds:** every phase exit · **Status:** `DECIDED`

A capability is complete only when:

- the business purpose is correct;
- data authority and permitted use are known;
- identity is correct;
- authorization and policy are enforced;
- request and response contracts are validated;
- interface and workflow are connected;
- errors are explicit and owned;
- evidence and audit are durable;
- tests cover success and failure;
- health checks exist;
- production or immutable-preview behavior is proved;
- rollback is proved;
- stale and duplicate paths are retired safely;
- inventories and documentation are current;
- Maya approved the merge or release.

---

# 24. Change protocol

> **Depends on:** DOC · **Feeds:** every requirement · **Status:** `DECIDED`

For every amendment to this file:

1. identify the requirement identifiers being changed;
2. state why the existing rule is insufficient or wrong;
3. locate each identifier in the dependency map in section 2 and read its `Feeds` column;
4. recheck every dependent requirement and either confirm it still holds or change it in the same edit;
5. identify all dependent active code and document surfaces;
6. update affected summaries and agent entry points in the same PR;
7. if the change affects an already-executed phase, note that its verification evidence is invalidated and must be reproduced;
8. record evidence and unresolved gaps;
9. record the change in Appendix E with its identifier;
10. do not reuse a retired identifier for a different meaning;
11. never widen a claim to make an edit easier — if evidence does not support the new wording, the wording changes, not the evidence;
12. preserve the prior version in Git history rather than creating another active plan file.

This file is the stable address. Its contents evolve; its path does not.

---

# Appendix A — Source-document coverage matrix

Per `DOC-6`, no source document is retired until its coverage rows exist here.

**Read status is stated per document, because `AGT-7` forbids describing a document that has not been read in full.** A document read only in part cannot be classified as fully covered, and saying so is a finding, not a placeholder.

| Document | Lines | Read status | What was actually read |
|---|---|---|---|
| `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` | 489 | **Partial** | All section headings; §1.5 typed contract decision, §1.6 deterministic parity, §6 comp pipeline, §6.1 evidence classes, §6.2 rules — read in full |
| `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md` | 378 | **Partial** | All section headings; §8 local web listing rules — read in full |
| `Mallan_Intelligence_Master_Plan.md` | 2129 | **Partial** | All 26 section headings; verified by search that it contains no listing-identity model and no provider-transition model |
| `crm-search-agent-workflow-rebuild.md` | 544 | **Headings only** | 12 section headings. No section read in full |
| `SELLER-001-SPEC-2026-07-03.md` | 225 | **Partial** | All section headings; the matched-pair example line and the address-variant line |
| `COTALITY-COMPLETE-REFERENCE.md` | unmeasured | **Not read** | Only targeted searches for prefix definitions |
| prior `MALLAN-PLATFORM-PLAN.md` draft | 665 | **Full** | Entire file |
| PR #585 plan | 1494 | **Full** | Entire file |

## A.1 — Requirements transferred, with evidence

These rows are based on text read in full and are safe to rely on.

| source_file | source_section | source_requirement | disposition | destination | verification_source |
|---|---|---|---|---|---|
| prior `MALLAN-PLATFORM-PLAN.md` | A.1–A.5 | Identifier system, status legend, header convention, change protocol, governing evidence rule | accepted | 0.1–0.4, 24 | read in full |
| prior `MALLAN-PLATFORM-PLAN.md` | B | Dependency map and blast radius | accepted | 2 | read in full |
| prior `MALLAN-PLATFORM-PLAN.md` | G | Non-disclosure with timing bound | accepted | AUZ-4 | read in full |
| prior `MALLAN-PLATFORM-PLAN.md` | I | Contract-versus-build version separation | accepted | VER-3 … VER-6 | read in full |
| prior `MALLAN-PLATFORM-PLAN.md` | J | Contract audit baseline and ratchet | accepted | AUD-1 … AUD-5 | read in full |
| PR #585 plan | 1–22 | Business truth, provider contract, error governance, housekeeping, CRM migration, seller truth levels, intelligence, per-PR checklist, completion definition | accepted | 3–23 | read in full |
| `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` | 1.6 | Deterministic parity holds within a fixed audience, scope, entitlement, and snapshot tuple — not across audiences | accepted | SEA-6 | §1.6 read in full |
| `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` | 6.1 | Evidence classification governing which comparables may drive value | accepted | CMA-2 | §6.1 read in full |
| `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` | 6 | Every comparable re-verified against its authority before issuance; provider failure fails closed | accepted | CMA-10 | §6 read in full |
| `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md` | 1.5 | Contract is pure, returns typed decisions, adapter maps to transport | accepted | ARC-5, ERR-2 | §1.5 read in full |
| `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md` | 8 | Local web listing distribution gates and reconciliation | **corrected** | 6 | §8 read in full |
| `SELLER-001-SPEC-2026-07-03.md` | header | `SL-0004` and `RLS20093870` are the same unit | accepted | LST-6 | line read in full |

## A.2 — Known-present but untransferred, with the specific gap

These are real findings, not deferred work items. Each states what is known to exist and what is unknown about it.

| Document | Known to contain | Not transferred because |
|---|---|---|
| `crm-search-agent-workflow-rebuild.md` | §5 "Field Contract — Supported vs Unsupported"; §6 Compliance Rules; §7 Acceptance Tests; §8 Implementation Phases; §11 Decision log | Only headings were read. `SEA-9` defines the field-contract *shape*; whether this document's actual field list conflicts with it is unknown. Its §8 phase model is a third sequencing scheme that must be reconciled against section 20 or explicitly discarded |
| `Mallan_Intelligence_Master_Plan.md` | 26 sections including broker operating system, public growth journeys, communications architecture, build-versus-buy policy, security and governance, observability, and five closed-loop proofs | Only headings were read. **Six of its domains have no counterpart in this plan at all**: broker operating system, public growth journeys, communications and notification architecture, build-versus-buy policy, security and privacy governance, and observability. This plan is therefore narrower than that document in those six areas |
| `COTALITY-COMPLETE-REFERENCE.md` | Provider reference tables including listing-type identifier tables | Not read. Content is a cache of provider vocabulary and is superseded as authority by `COT-11` and `COT-12`, but any non-vocabulary requirements it contains are unknown |
| `SELLER-001-SPEC-2026-07-03.md` | §3 data models for listing events, external presence, campaign links, broker-network presence, owner reports — all migration-gated; §5 correctness-audit fields; §6 investor metrics | Only headings were read. Phase 1 of this spec is already shipped in production, so it describes live behavior this plan does not yet account for |
| `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md` | §1–7 and §9–15: ownership, auth, resources, address lookup, query patterns, site routes, CRM form rules, sync contract, featured listings, media contract, compliance, error handling, testing, change control | Only §8 was read in full. §11 media contract informed `COT-7` and `COT-8` by heading only. §15 imposes a change-control rule requiring PRs touching its files to cite it — that obligation is live and unincorporated |

## A.3 — Consequence

This plan is complete for the domains it covers and is **not yet a superset** of the documents in A.2. The named source documents therefore remain active and may not be retired under `DOC-6`. Retiring them now would delete requirements that were never read.

Closing A.2 requires reading each document in full — a bounded, nameable task, not an open-ended one.

# Appendix B — Conflict resolution matrix

Where source documents disagreed, the resolution and its reason are recorded here.

| Conflict | Source A | Source B | Resolution | Reason |
|---|---|---|---|---|
| Matched-pair handling | Operational contract: withdraw the Mallan record when the provider record arrives; two separate rows; manual replacement | This plan: Mallan record remains canonical permanently | **This plan** — `LST-7`, `LST-8` | Stated business rule. The Mallan page is the controlled surface; the provider record cannot be edited from this system |
| Listing prefix meaning | Interpretation that `RL-` denotes a provider record | Code and reference tables: `RL-` is a Mallan rental listing | **Mallan rental listing** — `LST-4` | Confirmed against the sale and rental CRM forms that generate the two prefixes, and against provider identifier format |
| CMA supervision | Earlier draft: broker review required | Later draft: supervision off by default with named exceptions | **Off by default with exceptions** — `CMA-4` | Later and more precise; carves out paid and external valuation products |
| Error vocabulary | Search addendum typed contract decision codes | Platform error taxonomy | **Platform taxonomy** — `ERR-2`, with domain decisions mapped by adapters | One public taxonomy; internal decisions may be richer |
| Phase model | Three lanes with gates; a separate phase list; this plan's six phases | — | **Six phases** — section 20 | One sequence; lane content absorbed into the phase steps |
| Empty result | Earlier draft: an error code | This plan: success with explicit empty state | **Success** — `ERR-1`, `TRN-2` | A search that matches nothing is the system working correctly |
| Authority on match | Earlier draft: authority transitions to the provider | This plan: no handover | **No handover** — `LST-8` | The Mallan record is never provider-controlled |

---

# Appendix C — Retired documents

A document is listed here only after its coverage rows exist in Appendix A. Retirement means the file no longer claims authority. Git history preserves it.

| Document | Retired on | Superseded by | Status |
|---|---|---|---|
| `2026-04-27-mallan-intelligence-platform-WIP.md` | 2026-07-28 | this file | Removed. Declared itself a single source of truth while being an abandoned stub |

Pending retirement, subject to Appendix A completion during PH-1:

- `Mallan_Intelligence_Master_Plan.md`
- `crm-search-agent-workflow-rebuild.md`
- `SEARCH-COMPS-SUPPLEMENTAL-V2-ADDENDUM.md`

Remaining active as operating contracts or registry items, not competing plans:

- `COTALITY-TRESTLE-OPERATIONAL-CONTRACT.md` — operating contract with change control
- `COTALITY-COMPLETE-REFERENCE.md` — evidence cache subject to `COT-12`
- `SELLER-001-SPEC-2026-07-03.md` — registry item, phase 1 shipped

---

# Appendix D — Requirement identifier index

| Family | Identifiers | Count |
|---|---|---|
| `DOC` | DOC-1 … DOC-8 | 8 |
| `AGT` | AGT-1 … AGT-7 | 7 |
| `BUS` | BUS-1 … BUS-7 | 7 |
| `LST` | LST-1 … LST-17 | 17 |
| `COT` | COT-1 … COT-17 | 17 |
| `REB` | REB-1 … REB-3 | 3 |
| `ARC` | ARC-1 … ARC-9 | 9 |
| `TRN` | TRN-1 … TRN-6 | 6 |
| `VER` | VER-1 … VER-6 | 6 |
| `AUZ` | AUZ-1 … AUZ-6 | 6 |
| `POL` | POL-1 … POL-6 | 6 |
| `ERR` | ERR-1 … ERR-7 | 7 |
| `AUD` | AUD-1 … AUD-5 | 5 |
| `HYG` | HYG-1 … HYG-9 | 9 |
| `SEA` | SEA-1 … SEA-10 | 10 |
| `CRM` | CRM-1 … CRM-7 | 7 |
| `SEL` | SEL-1 … SEL-5 | 5 |
| `CMA` | CMA-1 … CMA-10 | 10 |
| `MKT` | MKT-1 … MKT-8 | 8 |
| `INT` | INT-1 … INT-6 | 6 |
| `OPS` | OPS-1 … OPS-8 | 8 |
| `PH` | PH-1 … PH-6 | 6 |
| `Q` | Q-1 … Q-10 | 10 |

No identifier is retired at this revision.

---

# Appendix E — Change log

| Identifier | Change | Reason |
|---|---|---|
| all | Consolidated two competing plan documents into this single file at `docs/architecture/MALLAN-PLATFORM-PLAN.md` | One governing plan; pointing between files did not work |
| `AGT-1` … `AGT-7` | Added agent operating rules | Exhaustiveness, boundary anchoring, thought explicitness, atomic continuation, no spot patching, no assumption substitution, read before claiming |
| `COT-11` … `COT-17` | Added live-derivation requirements | Every field, attribution, string, enumeration, and mapping is pulled live. No guessing, assumptions, placeholders, or spot patching |
| `COT-15` | Recorded live drift evidence from 2026-07-28 | Concrete proof that a committed vocabulary cache had already gone stale on display-gating values |
| `REB-1` … `REB-3` | Split REBNY policy into its own family | Previously folded into business truth; REBNY is a separate authority with effective dates and fail-closed handling |
| `AUD-1` … `AUD-5` | Added contract audit family | Baseline and ratchet were absent from the larger source document |
| `LST-4` | Listing rules restated in exact governing wording | Prefix identifies transaction type only and does not establish whether a counterpart exists |
| `LST-15` … `LST-17` | Added reconciliation controls, durable-match open question, and verified implementation record | |
| `AUZ-4` … `AUZ-6` | Added non-disclosure timing bound, listing entitlement, and the three distinct outcomes | |
| `POL-5`, `POL-6` | Added compliance-sensitive surface list and context requirement | A string-only evaluation cannot distinguish an amenity description from a preference statement |
| `TRN-4` … `TRN-6` | Added registered exception classes, metadata clarification, and no-arbitrary-shape rule | |
| `VER-3` … `VER-6` | Added contract-versus-build determination, advertisement, unknown-shape handling, and generated-client lifecycle | |
| `ERR-7` | Added provider-failure rule | A provider failure must never present as an empty success |
| `HYG-9` | Added one-branch-one-capability rule | Unrelated in-flight work must never be swept into a commit |
| `SEA-6`, `SEA-10` | Added deterministic parity definition and the fifteen acceptance criteria | Absorbed from the search addendum and the prior integration plan |
| `CMA-2`, `CMA-7` … `CMA-10` | Added evidence classification, selection reasons, subject-record authority, refresh alerting, and re-verification before issuance | |
| `SEL-3`, `SEL-5` | Made live activity independence and shared-version visibility explicit | |
| `MKT-8` | Retained existing fail-closed suppression explicitly | |
| `INT-2`, `INT-6` | Expanded explainability fields and added the cost and usefulness ledger | |
| `OPS-2`, `OPS-8` | Expanded the evidence standard and added health checks | Findings must be factual, tested, proven, and result-based |
| removed | Prior provenance dimensions replaced by `LST-5` | The prior model described an authority transfer that does not occur, and a submission workflow this system does not perform |
| removed | Prior external listing-entry product references | Out of scope per `BUS-2` and `BUS-7` |

---

**End of plan.**
