# Frontend / Backend Integration Architecture — mallan.nyc

**Date:** 2026-07-28
**Status:** Design — not approved, not implemented
**Scope:** System-wide frontend/backend integration architecture for `mallan67/mallan-nyc`
**Program:** One unified program, six controlled phases (§9)

**Scope isolation.** This document is standalone. It does not depend on, modify, or reference any
repository-governance effort, historical audit, or separate architecture workstream. It may be read
and executed on its own.

---

## 0. Claims this design does NOT make

This section exists first because several statements made while exploring this problem were inferred
from file counts and text searches rather than verified. None of them is treated as fact below.
Each becomes Phase 1 work.

| Not asserted | Why not | Resolved in |
|---|---|---|
| That the portals work | UI line counts and endpoint string references prove neither authentication, authorization, response compatibility, data correctness, nor live operation | Phase 1 |
| That any route is "orphaned" | A text search over `app/**/*.tsx` cannot prove absence of callers. Correct status: **no caller found in the searched paths** | Phase 1 |
| That search is disconnected from its engine | A static `grep` for `fetch(` is not a data-path trace | Phase 1 live trace |
| That any capability is complete | Presence of a module, route, model, or test is not operation | Phase 1 |

**Rule for this program:** a component is described by what has been observed of it, at a named
commit, by a named method. Absence of evidence is recorded as *not verified*, never as absence.

---

## 1. Problem

Mallan runs two frontends against one backend:

- the **Next.js application** — public site, search, and the buyer / tenant / seller / landlord portals;
- the **static CRM** under `public/crm` — plain HTML and JavaScript.

They are to remain separate. Today they also have **separate, implicit contracts**: every call site
re-invents its request shape, error handling, and response parsing. There is no shared schema, no
shared client, no common envelope, and no single place where authorization or policy is decided.

The consequence is that every fix is made twice, every compliance gate is re-implemented per route,
and no one can state which routes are correct without reading each one.

**This design does not merge the frontends. It gives them one contract.**

---

## 2. Actors are not symmetric

Frontend users and backend users are different populations with different rights. The architecture
must model this explicitly rather than by convention.

| Actor class | Origin | Typical surface |
|---|---|---|
| `anonymous` | public web | public search, listing detail, lead capture |
| `portal_client` | authenticated client, role-scoped | buyer / tenant / seller / landlord portal |
| `agent` | brokerage staff | CRM, professional search |
| `broker` | supervising broker | CRM, governance, approval |
| `system` | cron, webhook, internal job | no user-facing surface |

`portal_client` is further scoped by **role** (buyer, tenant, seller, landlord) and by **resource**:
a seller may read *their* listing's analytics and no one else's. Role alone is insufficient —
authorization must resolve to the specific resource. See §6.

---

## 3. Listing origination — Mallan-owned and web-direct

**Requirement.** Not every listing comes from Cotality. Mallan-owned listings may be entered
directly and published to the web, and Mallan may elect to publish a listing **only** to the web.
There is currently no direct feed for these.

The architecture therefore treats listing **origin** and listing **display scope** as independent,
explicit fields on the domain model — never inferred.

```text
origin:        cotality | mallan_direct
display_scope: web_only | web_and_syndicated | private
```

Consequences:

- A `mallan_direct` listing must never be represented as Cotality-sourced, and must not claim
  Cotality provenance in any DTO, artifact, report, or email.
- Cotality display rules (RLS gates, attribution, IDX disclaimer) apply to `cotality`-origin
  listings. `mallan_direct` listings are governed by NY DOS advertising rules and Fair Housing, and
  by REBNY/RLS only where Mallan has separately undertaken those obligations.
- `display_scope: web_only` is an **enforced** gate, not a label. A route that would expose a
  `web_only` listing outside the public web must fail closed.
- The domain service — not the route — decides which listings a given actor may see, so both
  origins are filtered identically for every consumer.

**Open item for Phase 1:** whether existing models (`Listing`, `ExternalListing`) already carry
equivalent fields, and whether a schema change is required. If it is, it is gated — see §10.

---

## 4. Architecture

```text
   Next.js frontend                         Static CRM frontend
   (app/, portals)                          (public/crm, plain JS)
          │                                          │
   browser client (ESM/TS)              generated browser client (IIFE/ESM, no bundler)
          │                                          │
          └──────────────┬───────────────────────────┘
                         │  HTTP
                         ▼
              thin HTTP route adapters
              (validate → authorize → policy → delegate → envelope)
                         │  direct function call
                         ▼
                 domain services
      (search, listings, cma, seller, marketing, intelligence)
                         │
                         ▼
        data + providers (Prisma, Cotality/Trestle, email transport)


   Next.js SERVER-SIDE code  ──────────────────────► domain services
   (Server Components, Server Actions, cron, jobs)     DIRECT. Never via HTTP.
```

### 4.1 Contract source of truth

One directory is the single source of shared request/response schemas. Both clients and all route
adapters are generated from or validated against it. Nothing else defines a wire shape.

Contents: request schemas, response schemas, the envelope type, the error taxonomy, transport
classifications, and the contract version.

### 4.2 Generated browser client for the static CRM

The CRM has no build step and no module bundler. It therefore receives a **generated, committed,
browser-loadable client** — no framework imports, no Node built-ins, no TypeScript at runtime.

- Generated from the contract source; generation is reproducible and verified in CI-equivalent checks.
- Committed as a build artifact with the contract version embedded.
- A drift check fails if the committed artifact does not match regeneration from the current contract.

### 4.3 Browser client for the Next.js frontend

A typed client for React client components. Same contract, same envelope, same error taxonomy.
Returns a discriminated union; never throws on HTTP status.

### 4.4 Thin HTTP route adapters

A route adapter does exactly five things and contains **no business logic**:

1. validate the request against the contract schema;
2. resolve the actor and authorize (actor · role · resource · listing);
3. evaluate policy gates (REBNY / Cotality / Fair Housing);
4. delegate to a domain service;
5. validate the response and wrap it in the envelope.

Anything else in a route is a defect.

### 4.5 Reusable domain services

Domain services hold the behavior. They are plain functions with typed inputs and outputs, no
knowledge of HTTP, and no knowledge of who is calling.

**Server-side Next.js code — Server Components, Server Actions, cron handlers, background jobs —
calls domain services directly.** It must never issue an HTTP request to the application's own
routes. Self-HTTP costs a network round trip, loses type safety, obscures errors, breaks tracing,
and re-authenticates work that is already authorized.

Authorization is passed to the service as an explicit, already-resolved actor context. The service
enforces resource scoping; it does not re-derive identity.

---

## 5. Transport classification and the envelope

Not every route can or should return JSON. Each route declares its transport class in the contract,
and the audit (§8) checks it against actual behavior.

| Class | Envelope | Examples |
|---|---|---|
| `json` | **Required** | the large majority of routes |
| `file` | Exempt — registered | document download, export, PDF |
| `stream` | Exempt — registered | SSE, progressive responses |
| `redirect` | Exempt — registered | unsubscribe confirmation, OAuth entry |
| `auth_callback` | Exempt — registered | provider callbacks with fixed contracts |
| `webhook` | Exempt — registered | inbound provider callbacks; shape set by the sender |
| `health` | Exempt — registered | liveness and readiness probes |

**Exemptions are registered, not implicit.** An unregistered non-JSON route fails the audit. A route
registered as exempt must state why.

### 5.1 The JSON envelope

```jsonc
// success
{ "ok": true,  "data": { }, "meta": { } }
// failure
{ "ok": false, "error": { "code": "", "message": "", "details": {} }, "meta": { } }
```

`meta` carries `contractVersion`, `requestId`, `actorClass`, and `generatedAt`. Where a response
derives from provider data it additionally carries source and source timestamp.

`meta` is response metadata only. **No database column is introduced by the envelope**, so the
envelope itself requires no migration.

### 5.2 Error taxonomy

A closed set of machine-readable codes — validation, authentication, authorization, not-found,
conflict, policy-blocked, provider-unavailable, not-evaluated, internal. Both clients switch on the
code. Human-readable messages never carry meaning the code does not.

**No silent failure.** Unknown, unsupported, stale, and unverified states are explicit values, never
an empty success.

---

## 6. Authorization

Four layers, evaluated in order, all inside the route adapter before any domain call:

1. **Actor** — who is calling, and is the credential valid;
2. **Role** — is this actor class permitted this operation at all;
3. **Resource** — is this specific record within the actor's scope;
4. **Listing-level** — for listing-bearing routes, is this actor entitled to *this listing*, given
   origin, display scope, ownership, and representation.

Layer 4 is separate because listing entitlement is not a property of the user alone. A seller sees
their own listing's analytics; an agent sees listings they represent; the public sees only what
display scope and RLS permit.

Authorization failures return `authorization` — never a silent empty result set, which would be
indistinguishable from "no data."

---

## 7. Policy gates

Policy gates are evaluated in the route adapter, after authorization, before the domain call. Each
returns an explicit decision, never a boolean guess.

```text
allowed | blocked | not_evaluated
```

### 7.1 REBNY / RLS and Cotality gates

Applied to `cotality`-origin listings for display permission, attribution, and disclaimer
requirements, per the canonical compliance index. Applied per audience, since public, agent, and
portal audiences differ.

Cotality field, enum, and runtime truth is resolved through the existing integration surface. This
design adds no new provider vocabulary and copies none.

### 7.2 Fair Housing gate — never silently passes

The Fair Housing scanner is being built separately and is not connected.

**Until it is connected, the Fair Housing gate returns `not_evaluated`.** It never returns `allowed`.

- `not_evaluated` on a **compliance-sensitive surface** requires **human review** before the content
  may be sent or published. The system routes it to review; it does not proceed.

**Compliance-sensitive surfaces**, defined explicitly so the rule is not interpretable:

  1. any outbound marketing email, campaign, or template;
  2. any public listing description, headline, or marketing remark;
  3. any listing presentation, seller report, landlord report, or CMA narrative shown outside the brokerage;
  4. any advertising copy naming a listing, building, neighborhood, agent, or the brokerage;
  5. any AI- or template-generated text destined for any of the above.

  Purely internal, non-client-facing text — an agent's private note, an internal task, a debug log —
  is not compliance-sensitive and is not gated.
- `not_evaluated` is recorded on the artifact, so anything produced while the scanner was absent is
  identifiable later.
- A gate that returns `allowed` without having evaluated anything is a defect, not a convenience.

**Interface requirement.** The gate receives **context**, not a bare string: the text, the field it
came from, the audience, the surface, and the listing origin. Without context the gate cannot
distinguish a factual amenity from a preference statement — a building's children's playroom is a
description of the property; "perfect for families" is a statement about desired occupants. Only the
second is a violation. A string-only interface would make that distinction impossible and would
guarantee false positives that train people to ignore the gate.

The scanner plugs in behind this interface. Nothing else changes when it lands.

---

## 8. Contract audit — baseline and ratchet

A validator classifies every route and enforces that the system only improves.

- **Baseline:** the current count of conforming routes is recorded once.
- **Ratchet:** the validator fails if conformance decreases. New routes must conform. Existing
  non-conforming routes may be migrated at any pace, but never added to.
- Route classification, exemption registration, and client-artifact drift are all checked.
- The validator reports what it proves **and what it does not** — it verifies contract conformance,
  not correctness, not authorization behavior, and not live operation.

This makes migration measurable rather than asserted, and prevents regression without demanding a
big-bang rewrite.

---

## 9. Phases

One program. Each phase has an entry condition, an exit condition, and required evidence. No phase
is declared complete on the strength of code existing.

### Phase 1 — Verified inventory

**Nothing is designed further until reality is measured.**

- Live-trace the search experience end to end: the actual browser network activity on `/search`,
  the server-side data path, whether results render, and the true status of the `/api/results`
  dependency. Record the trace.
- Verify portal reality per role: authentication, authorization, response compatibility, data
  correctness, and live operation. Replace all inferred status.
- Re-classify every route with no caller found: search `public/crm`, tests, server-side code, and
  dynamically constructed paths before assigning any status. Output is *caller found* / *no caller
  found in searched paths*, never "orphaned."
- Inventory listing origination: whether `origin` and `display_scope` equivalents exist today.
- Inventory consent and audience data actually present on contacts.

**Exit:** a dated inventory in which every status names its verification method. Unverified items
are listed as unverified.

### Phase 2 — Contract foundation

Contract source of truth; envelope; error taxonomy; transport classification and exemption
registry; route adapter; domain-service boundary; both clients; authorization layers; policy gate
interfaces including the Fair Housing `not_evaluated` behavior; the baseline-and-ratchet audit.

**Exit:** foundation in place, audit baseline recorded, at least one non-critical route migrated
end to end through both clients as proof.

### Phase 3 — Search integration

Wire the search experience to its domain service through the contract, informed by the Phase 1
trace. Resolve `/api/results`. Support both `cotality` and `mallan_direct` origins with display
scope enforced. Public and professional audiences share meaning, not exposure.

**Exit:** search works, proven live, for each audience, with correct totals and no silent empty
results.

### Phase 4 — Seller operating loop

Seller portal on the contract: listing status, traffic, engagement, showings, offers, and **CMA**.

CMA is treated as a **versioned artifact** with a lifecycle — draft → reviewed → **broker-approved**
→ delivered → superseded. **A CMA is exposed to a seller only after broker approval.** It carries
its inputs, method, comparable set, source timestamps, contract version, policy status, and
approver. An unapproved or stale CMA is never shown.

**Exit:** a seller sees their listing's real activity and an approved CMA, proven live.

### Phase 5 — Marketing readiness

Audience classification, suppression, unsubscribe, previews, and dry runs on the contract, with the
Fair Housing gate returning `not_evaluated` and routing to human review.

**This phase explicitly does not claim complete consent enforcement.** See §10.

**Exit:** the system can classify audiences, suppress correctly, honor unsubscribe, and produce
previews and dry runs with full recipient accounting — with its consent limitations stated.

### Phase 6 — Explainable intelligence

Signals surfaced through the contract as structured, explainable records:

```text
signal type · evidence · source · source timestamp · confidence
reason codes · policy status · expiration · recommended action
assigned person · human-approval requirement
```

No unexplained score is presented as truth. Any future AI layer is a **replaceable consumer** of
these signals: it may summarize, rank, or draft, and it must **never invent the underlying facts**.
Model, prompt version, and cost are recorded; output requiring judgment requires human approval.

**Exit:** signals visible with evidence and reason codes, and a documented statement of what each
signal does and does not establish.

---

## 10. Consent — explicit deferred decision

Consent is modeled as **contact × channel × purpose**, not a boolean.

- **contact** — the person
- **channel** — email, SMS, voice, portal
- **purpose** — transactional, listing updates, marketing, market reports

Both CAN-SPAM postures are supported: **opt-in** recorded affirmatively, and **opt-out** honored
durably.

**Deferred, requiring an explicit data-model decision and approval:**

1. durable consent **provenance** per contact — source, acquisition date, legal basis, and evidence;
2. authorization to run **production bulk email**.

These require schema work and are therefore gated. Until both are decided:

- the marketing system **may** support audience classification, suppression, unsubscribe, previews,
  and dry runs;
- the marketing system **may not** claim complete consent enforcement, and no documentation,
  report, or interface may state that it has been achieved;
- production bulk sends remain out of scope for this design.

Existing fail-closed suppression behavior is retained unchanged.

---

## 11. Verification requirements

Every phase carries all four. None is optional, and none substitutes for another.

| Requirement | Meaning |
|---|---|
| **Health checks** | Operational probes proving the surface responds correctly, run before and after change |
| **Exact tests** | Named commands with recorded raw output and exit codes, against a named commit, in a named environment. Tests fail before the change and pass after when behavior changes |
| **Production proof** | Live evidence from production or an immutable preview — a real request producing a real response. Source reads and unit tests never substitute for a rendering or behavior claim |
| **Rollback** | A written, tested path back, verified before the change ships |

A phase is complete when all four exist for it, and each states what it proves **and what it does
not**.

---

## 12. Explicit non-goals

- Merging the two frontends. They stay separate by decision.
- Rewriting the static CRM.
- Introducing a new AI provider or model dependency.
- Building the Fair Housing scanner — external by decision, consumed through the §7.2 interface.
- Production bulk email — gated by §10.
- Any schema migration, which is separately gated and requires explicit approval.
- Any repository-governance, historical-audit, or unrelated architecture work.

---

## 13. Open questions

1. Do `Listing` / `ExternalListing` already express `origin` and `display_scope`, or is a schema
   change required? (Phase 1)
2. Which routes legitimately need a non-JSON transport class? (Phase 1 registry)
3. What is the actual browser and server data path for `/search` today? (Phase 1 live trace)
4. What consent and audience data exists on contacts now, and what must be added? (Phase 1, then §10)
5. Who is the named approver for CMA artifacts, and what is the review turnaround? (Phase 4)
