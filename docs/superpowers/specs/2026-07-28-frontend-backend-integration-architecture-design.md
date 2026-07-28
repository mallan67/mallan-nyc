# Frontend / Backend Integration Architecture — mallan.nyc

**Revision:** 3 · **Date:** 2026-07-28 · **Status:** DESIGN — not approved, not implemented
**Scope:** System-wide frontend/backend integration for `mallan67/mallan-nyc`
**Isolation:** Standalone. References no repository-governance, historical-audit, or other
architecture effort.

---

# A. HOW TO USE THIS DOCUMENT

Read this section before changing anything below it. It exists so that an agent picking up any
single requirement can tell what it depends on, what depends on it, and what must be re-verified
if it moves.

## A.1 Requirement IDs

Every normative requirement has a stable ID. **Cite the ID, never the prose.** IDs are permanent —
if a requirement is withdrawn, its ID is retired, never reused.

| Prefix | Domain | Section |
|---|---|---|
| `ACT` | Actors and identity | C |
| `PRV` | Listing provenance and distribution | D |
| `ARC` | Architecture and layering | E |
| `TRN` | Transport class and envelope | F |
| `AUZ` | Authorization and non-disclosure | G |
| `POL` | Policy gates (REBNY / Cotality / Fair Housing) | H |
| `VER` | Contract versioning and client compatibility | I |
| `AUD` | Contract audit | J |
| `CMA` | CMA model | K |
| `MKT` | Consent and marketing | L |
| `VRF` | Verification requirements | M |
| `PH` | Phases | N |

## A.2 Status legend

Every requirement carries exactly one.

| Status | Meaning |
|---|---|
| **DECIDED** | Settled. Change requires the §A.4 protocol. |
| **DEFERRED** | Deliberately not decided yet. Blocking condition is named. |
| **OPEN** | Needs an answer. Listed in §O. |
| **DERIVED** | Follows from another requirement; changes when its parent changes. |

## A.3 Section header convention

Every section below carries a header block:

> **Depends on:** IDs that must hold for this to be valid
> **Feeds:** IDs that break if this changes
> **Status:** the section's dominant status

## A.4 Change protocol — read before editing any requirement

Because these requirements are interdependent, changing one silently invalidates others. When
changing a requirement:

1. **Locate its ID** and its row in the dependency map (§B).
2. **Read the `Feeds` column.** Every ID listed there must be re-read and either confirmed still
   valid or changed in the same edit.
3. **If the requirement is `DECIDED`,** record the change in §P with its ID, what changed, and why.
   Do not silently rewrite a `DECIDED` requirement.
4. **If the change affects a phase already executed,** its verification evidence (§M) is invalidated
   and must be re-produced. Note this explicitly.
5. **Never widen a claim to make an edit easier.** If evidence does not support the new wording,
   the wording changes, not the evidence.

## A.5 The one rule that governs everything

> A component is described by what has been observed of it, at a named commit, by a named method.
> **Absence of evidence is recorded as "not verified," never as absence.**

---

# B. DEPENDENCY MAP

The build order and blast radius of every block. Read a row as: *this block cannot be correct until
`Depends on` holds, and changing it forces re-verification of `Feeds`.*

| Block | Depends on | Feeds | Phase |
|---|---|---|---|
| **C — Actors** | — | AUZ, POL, TRN | 2 |
| **D — Provenance** | — | AUZ-4, POL-1, CMA, PH-3 | 1 → 2 |
| **E — Architecture** | ACT | TRN, AUZ, POL, VER, AUD | 2 |
| **F — Transport / envelope** | ARC-4 | AUD-2, VER-2, all clients | 2 |
| **G — Authorization** | ACT, PRV, ARC-4 | every route; PH-3, PH-4 | 2 |
| **H — Policy gates** | PRV, ARC-4 | PH-3, PH-4, PH-5, CMA | 2 |
| **I — Versioning** | ARC-2, ARC-3, TRN-2 | both clients, AUD-3 | 2 |
| **J — Audit** | TRN, VER | every later phase | 2 |
| **K — CMA** | PRV, POL-1, AUZ-4 | PH-4 | 4 |
| **L — Marketing** | POL-2, AUZ | PH-5 | 5 |
| **M — Verification** | — | every phase exit | all |
| **N — Phases** | all of the above | — | — |

**Critical path:** `PH-1` (inventory) → `ARC` + `TRN` + `AUZ` + `VER` + `AUD` (foundation) →
`PH-3` (search) → `PH-4` (seller + CMA) → `PH-5` (marketing) → `PH-6` (intelligence).

**Highest blast radius:** `TRN-2` (the envelope) and `AUZ-1` (the three outcomes). Changing either
touches every route.

---

# C. ACTORS

> **Depends on:** — · **Feeds:** AUZ, POL, TRN · **Status:** DECIDED

Frontend users and backend users are different populations with different rights.

| ID | Requirement |
|---|---|
| **ACT-1** | Five actor classes exist: `anonymous`, `portal_client`, `agent`, `broker`, `system`. |
| **ACT-2** | `portal_client` is scoped by **role** (buyer / tenant / seller / landlord) **and** by resource. Role alone never authorizes. |
| **ACT-3** | Actor context is resolved once, in the route adapter, and passed to domain services already resolved. Services never re-derive identity. |

---

# D. LISTING PROVENANCE AND DISTRIBUTION

> **Depends on:** — · **Feeds:** AUZ-4, POL-1, CMA-1, PH-3 · **Status:** DECIDED, with one OPEN

A single `origin` value cannot describe a listing's life. A listing may begin as Mallan-direct, later
be submitted to Cotality, and thereafter be governed by it. Provenance, authority, and distribution
are **four independent dimensions**.

```text
acquisition_source     how it entered Mallan — immutable
  mallan_direct | cotality

authority_source       who is authoritative for provider-controlled fields NOW
  mallan | cotality | pending_reconciliation

distribution_state     where it is actually published
  private | mallan_web_only | submitted_to_rls
  | provider_verified_syndicated | withdrawn

provider_identity      the provider's own record, when one exists
  cotality_listing_id | provider_last_verified_at | reconciliation_status
```

| ID | Requirement |
|---|---|
| **PRV-1** | `acquisition_source` is **immutable**. Original acquisition history is preserved permanently, never overwritten, even after Cotality becomes authoritative. |
| **PRV-2** | `provider_verified_syndicated` is reachable **only** from verified provider facts carrying `cotality_listing_id` and `provider_last_verified_at`. No user, form, import, or application-layer write may assert it. Any other path is a defect. |
| **PRV-3** | `submitted_to_rls` ≠ `provider_verified_syndicated`. Submission is intent; verified syndication is an observed provider fact. The gap is `pending_reconciliation`. |
| **PRV-4** | When `authority_source` is `cotality`, the provider is authoritative for provider-controlled fields. Mallan-originated values are retained as history and never presented as current provider truth. |
| **PRV-5** | A direct listing may be web-only with no Cotality provenance and **must never claim any**. No DTO, artifact, report, or email may attribute Cotality provenance to a listing lacking `provider_identity`. |
| **PRV-6** | `distribution_state` is **enforced**, not descriptive. Exposing a `private` or `mallan_web_only` listing outside its permitted surface fails closed. |
| **PRV-7** | The domain service decides visibility, so every consumer filters identically regardless of acquisition source. |
| **PRV-8** | *(OPEN — O-1)* Whether existing models express these four dimensions, and whether a schema change is required. |

---

# E. ARCHITECTURE

> **Depends on:** ACT · **Feeds:** TRN, AUZ, POL, VER, AUD · **Status:** DECIDED

```text
   Next.js frontend                      Static CRM frontend
   (app/, portals)                       (public/crm, plain JS)
          │                                       │
   browser client (ESM/TS)          generated browser client (no bundler)
          │                                       │
          └─────────────┬─────────────────────────┘
                        │  HTTP
                        ▼
             thin HTTP route adapters
        validate → authorize → policy → delegate → envelope
                        │  direct function call
                        ▼
                domain services
   (search, listings, cma, seller, marketing, intelligence)
                        │
                        ▼
      data + providers (Prisma, Cotality/Trestle, email transport)

   Next.js SERVER-SIDE code ─────────────────────► domain services
   (Server Components, Actions, cron, jobs)        DIRECT. Never via HTTP.
```

| ID | Requirement |
|---|---|
| **ARC-1** | One directory is the single source of shared request/response schemas, envelope type, error taxonomy, transport classifications, and contract version. Nothing else defines a wire shape. |
| **ARC-2** | The static CRM receives a **generated, committed, browser-loadable** client — no framework imports, no Node built-ins, no runtime TypeScript. Lifecycle in VER-5. |
| **ARC-3** | The Next.js frontend receives a typed client over the same contract, returning a discriminated union, never throwing on HTTP status. |
| **ARC-4** | A route adapter does exactly five things and contains **no business logic**: validate request · resolve actor and authorize · evaluate policy · delegate to a domain service · validate response and wrap. Anything else is a defect. |
| **ARC-5** | Domain services are plain functions with typed inputs/outputs, no knowledge of HTTP or caller. |
| **ARC-6** | **Server-side Next.js code calls domain services directly and never issues HTTP requests to its own routes.** Self-HTTP costs a round trip, loses type safety, obscures errors, breaks tracing, and re-authenticates already-authorized work. |
| **ARC-7** | The two frontends remain separate. This design gives them one contract; it does not merge them. |

---

# F. TRANSPORT CLASS AND ENVELOPE

> **Depends on:** ARC-4 · **Feeds:** AUD-2, VER-2, both clients · **Status:** DECIDED
> ⚠ **Highest blast radius — TRN-2 touches every route.**

| ID | Requirement |
|---|---|
| **TRN-1** | Every route declares a transport class in the contract: `json`, `file`, `stream`, `redirect`, `auth_callback`, `webhook`, `health`. The audit checks the declaration against actual behavior. |
| **TRN-2** | `json` routes **must** use the envelope: `{ok:true,data,meta}` / `{ok:false,error,meta}`. `meta` carries `contractVersion`, `requestId`, `actorClass`, `generatedAt`, and — for provider-derived responses — source and source timestamp. |
| **TRN-3** | `meta` is response metadata only. **The envelope introduces no database column and requires no migration.** |
| **TRN-4** | Non-JSON classes are **registered exemptions**, each stating why. An unregistered non-JSON route fails the audit. |
| **TRN-5** | The error taxonomy is a closed set: `VALIDATION`, `AUTHENTICATION`, `FORBIDDEN`, `RESOURCE_NOT_AVAILABLE`, `EMPTY_RESULT`, `CONFLICT`, `POLICY_BLOCKED`, `NOT_EVALUATED`, `PROVIDER_UNAVAILABLE`, `INTERNAL`. Clients switch on the code; messages never carry meaning the code does not. |
| **TRN-6** | **No silent failure.** Unknown, unsupported, stale, and unverified states are explicit values — never an empty success. |

---

# G. AUTHORIZATION AND NON-DISCLOSURE

> **Depends on:** ACT, PRV, ARC-4 · **Feeds:** every route, PH-3, PH-4 · **Status:** DECIDED
> ⚠ **High blast radius — AUZ-1 changes response shape across all ID-addressed routes.**

Four layers, in order, inside the route adapter, before any domain call.

| ID | Requirement |
|---|---|
| **AUZ-1** | Three distinct outcomes, never conflated — see table below. |
| **AUZ-2** | Layer 1 **Actor**: is the credential valid. Layer 2 **Role**: is this actor class permitted this operation at all. |
| **AUZ-3** | Layer 3 **Resource**: is this specific record within the actor's scope. |
| **AUZ-4** | Layer 4 **Listing-level**: is this actor entitled to *this listing*, given `acquisition_source`, `authority_source`, `distribution_state`, ownership, and representation. Separate from role because listing entitlement is not a property of the user alone. |
| **AUZ-5** | **Non-disclosure.** For ID-addressed resources, `RESOURCE_NOT_AVAILABLE` is returned identically whether the resource does not exist or exists but belongs to someone else. Body, status, and timing must not differ. This prevents enumeration of listing, client, offer, and document IDs belonging to other portal users. |

| Situation | Code | Discloses existence? |
|---|---|---|
| Authorized query returning zero records | `EMPTY_RESULT` | n/a |
| Authenticated user lacks a broad feature permission | `FORBIDDEN` | No — the *feature* is denied, not a record |
| Resource-specific mismatch (listing, client, document, offer) | `RESOURCE_NOT_AVAILABLE` | **No — must not** |

User-facing message for `RESOURCE_NOT_AVAILABLE`, deliberately uninformative:

> This item is unavailable or is not associated with your account.

`EMPTY_RESULT` stays distinct from both denials so an authorized-but-empty result is never confused
with a refusal.

---

# H. POLICY GATES

> **Depends on:** PRV, ARC-4 · **Feeds:** PH-3, PH-4, PH-5, CMA · **Status:** DECIDED

Evaluated after authorization, before the domain call. Each returns `allowed` · `blocked` ·
`not_evaluated`.

| ID | Requirement |
|---|---|
| **POL-1** | REBNY/RLS and Cotality gates apply per audience to listings whose `authority_source` is `cotality`, covering display permission, attribution, and disclaimer. Resolved through the existing integration surface using **live provider values and status definitions**. No new provider vocabulary, none copied, **no hardcoded status assumptions**. |
| **POL-2** | **The Fair Housing gate never silently passes.** Until the external scanner is connected it returns `not_evaluated`. It never returns `allowed`. |
| **POL-3** | `not_evaluated` on a compliance-sensitive surface requires **human review** before send or publish. The system routes to review; it does not proceed. |
| **POL-4** | `not_evaluated` is recorded on the artifact, so anything produced while the scanner was absent stays identifiable. |
| **POL-5** | The gate receives **context** — text, originating field, audience, surface, listing provenance — not a bare string. Without context it cannot distinguish a factual amenity ("children's playroom") from a preference statement ("perfect for families"); only the second is a violation. A string-only interface guarantees false positives that train people to ignore the gate. |

**Compliance-sensitive surfaces** (POL-3), enumerated so the rule is not interpretable:

1. any outbound marketing email, campaign, or template;
2. any public listing description, headline, or marketing remark;
3. any listing presentation, seller report, landlord report, or CMA narrative shown outside the brokerage;
4. any advertising copy naming a listing, building, neighborhood, agent, or the brokerage;
5. any AI- or template-generated text destined for any of the above.

Purely internal, non-client-facing text — a private note, an internal task, a debug log — is not
gated.

---

# I. CONTRACT VERSIONING AND CLIENT COMPATIBILITY

> **Depends on:** ARC-2, ARC-3, TRN-2 · **Feeds:** both clients, AUD-3 · **Status:** DECIDED

The two frontends ship independently, so one may run an incompatible contract version.

| ID | Requirement |
|---|---|
| **VER-1** | Four version fields exist: `contractVersion` (served, in every `meta`), `minimumSupportedClientVersion` (advertised), `clientBuildVersion` (sent per request), `serverSupportedVersions` (advertised). |
| **VER-2** | Client older than `minimumSupportedClientVersion`, or newer than anything in `serverSupportedVersions`, receives a version-incompatibility error and **fails visibly** with an explicit upgrade message. |
| **VER-3** | **The generated CRM client must never silently parse an unrecognized response shape.** Unknown envelopes are errors, not plausible-looking objects. |
| **VER-4** | Version checks happen on the response envelope — no separate round trip. |
| **VER-5** | Generated-client lifecycle: generated from the contract by one named command · deterministic (same contract in, byte-identical client out) · embeds `clientBuildVersion` and source contract version · committed so the CRM loads it without a build step · **never manually copied or hand-edited** · a drift check regenerates and compares, failing on any difference. Publication *is* the commit. |

---

# J. CONTRACT AUDIT — BASELINE AND RATCHET

> **Depends on:** TRN, VER · **Feeds:** every later phase · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **AUD-1** | The current count of conforming routes is recorded once as a **baseline**. |
| **AUD-2** | **Ratchet:** the validator fails if conformance decreases. New routes must conform. Existing non-conforming routes migrate at any pace but are never added to. |
| **AUD-3** | The audit checks route classification, exemption registration, envelope conformance for `json` routes, and generated-client drift (VER-5). |
| **AUD-4** | The validator states what it proves **and what it does not** — it verifies contract conformance, not correctness, not authorization behavior, not live operation. |

---

# K. CMA MODEL

> **Depends on:** PRV, POL-1, AUZ-4 · **Feeds:** PH-4 · **Status:** DECIDED

> **CMA-0 — governing statement.** The CMA is generated automatically from current Cotality data.
> The authorized listing agent or broker reviews and may modify the comparable selection, analysis,
> and presentation before sharing it with the seller. **Central broker approval is not required**
> unless separately configured for brokerage supervision or exceptional compliance review.

| ID | Requirement |
|---|---|
| **CMA-1** | Every authorized agent or broker generates a CMA for their own client or listing. No company-wide approval bottleneck. |
| **CMA-2** | Two automatic views per seller listing: **building activity** and **area CMA** (below). |
| **CMA-3** | The system uses **current Cotality values and status definitions**. It hardcodes no status assumptions. |
| **CMA-4** | Each comparable carries **selection reason codes** explaining why it was chosen. |
| **CMA-5** | Both results are preserved: `system_generated_set`, `agent_selected_set`, `excluded_comparables`, `manual_adjustments`, `agent_notes`, `generated_at`, `modified_at`, `shared_at`. |
| **CMA-6** | **Manual changes never rewrite or falsify Cotality facts.** The agent adds professional judgment; original provider values remain preserved and distinguishable from adjustments. |
| **CMA-7** | The seller sees only the version the listing agent chose to share — never internal drafts, excluded properties, or private notes unless published. |
| **CMA-8** | The system refreshes when relevant market activity changes, alerts the agent, and lets them publish an update. The seller-visible version does not change until the agent shares it. |

**Building activity** — comparable units in the seller's own building, separated into: currently
active · currently under contract (live Cotality status) · recently sold · withdrawn or expired
where useful for pricing context.

Prioritized by similarity in: unit type · bedroom and bathroom count · approximate size · floor or
line · exposure · condition · outdoor space · property type · maintenance or common charges.

**Area CMA** — comparable units outside the building within the relevant market area, by: similar
property type · similar configuration · appropriate price range · reasonable geographic radius ·
recent listing and closing dates · relevant building and amenity characteristics.

**Automatic population:** active / under-contract / recently sold comparables · asking prices · last
asking prices · closed prices where available · price per square foot where size data is reliable ·
days on market · listing and closing dates · unit characteristics · building characteristics ·
source timestamp · Cotality listing identifiers.

**Selection reasons (CMA-4) example:**

```text
Selected because:
- same building;
- one-bedroom unit;
- approximately 6% larger;
- sold within the last six months;
- similar floor and exposure.
```

**Agent editing:** remove a poor comparable · add another eligible comparable · change the radius ·
adjust the recency window · change similarity criteria · reorder · add condition or renovation
adjustments · add notes · select which comparables appear in the seller-facing report · regenerate.

**Seller portal shows:** activity in the seller's building · comparable activity in the surrounding
area · current competition · properties under contract · recent closed sales · pricing and
market-position observations · the refresh date · the shared version and its shared date · the
data-as-of date · the selected comparable set · whether a newer version is pending.

**Workflow**

```text
Live Cotality data → automatic building and area sets → agent reviews and adjusts
   → agent shares selected version → seller portal displays shared CMA
   → system refreshes on market activity → agent alerted, may publish update
```

---

# L. CONSENT AND MARKETING

> **Depends on:** POL-2, AUZ · **Feeds:** PH-5 · **Status:** DEFERRED (MKT-2 blocks production)

| ID | Requirement | Status |
|---|---|---|
| **MKT-1** | Consent is modeled as **contact × channel × purpose**, not a boolean. Both CAN-SPAM postures supported: **opt-in** recorded affirmatively, **opt-out** honored durably. | DECIDED |
| **MKT-2** | Two items require an explicit data-model decision and approval: (a) durable consent **provenance** per contact — source, acquisition date, legal basis, evidence; (b) authorization to run **production bulk email**. Both need schema work and are gated. | DEFERRED |
| **MKT-3** | Until MKT-2 is resolved the system **may**: audience classification · provenance review · suppression checks · unsubscribe processing · Fair Housing review · campaign preview · recipient count · dry run · **test sends to internal addresses only**. | DECIDED |
| **MKT-4** | Until MKT-2 is resolved the system **may not** claim complete consent enforcement or release a live bulk campaign. No documentation, report, or interface may state that consent enforcement has been achieved. | DECIDED |
| **MKT-5** | Existing fail-closed suppression behavior is retained unchanged. | DECIDED |
| **MKT-6** | Releasing any production campaign requires a **reconciled** recipient report: `eligible`, `suppressed`, `unsubscribed`, `missing opt-in`, `pending review`, `Fair Housing blocked`, `invalid address`, `duplicate identity`. Counts must reconcile to the total audience; an unreconciled report blocks the send. | DECIDED |

---

# M. VERIFICATION REQUIREMENTS

> **Depends on:** — · **Feeds:** every phase exit · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **VRF-1** | **Health checks** — operational probes proving the surface responds correctly, run before and after change. |
| **VRF-2** | **Exact tests** — named commands, recorded raw output and exit codes, against a named commit, in a named environment. Tests fail before and pass after when behavior changes. |
| **VRF-3** | **Production proof** — live evidence from production or an immutable preview: a real request producing a real response. Source reads and unit tests never substitute for a rendering or behavior claim. |
| **VRF-4** | **Rollback** — a written, tested path back, verified before the change ships. |
| **VRF-5** | A phase completes only when VRF-1..4 all exist for it, and each states what it proves **and what it does not**. |

---

# N. PHASES

> **Depends on:** all of the above · **Status:** DECIDED

## PH-1 — Verified inventory

Produces a **decision artifact**, not merely an inventory.

**PH-1.1 Route matrix — machine-readable, one row per route:**
`route` · `transport_type` · `frontend_callers_found` · `authentication_method` · `actor_classes` ·
`resource_authorization` · `request_schema` · `response_schema` · `domain_service` ·
`data_authority` · `policy_gates` · `error_behavior` · `production_verification_status` ·
`migration_disposition`

**PH-1.2 Every route ends Phase 1 with a disposition:**

| Disposition | Meaning |
|---|---|
| `MIGRATE` | Move onto the contract |
| `KEEP_WITH_EXCEPTION` | Stays as-is with a registered transport exemption |
| `CONSOLIDATE` | Overlaps another route; merge target identified |
| `DEPRECATE_AFTER_PROOF` | Removal candidate **only after** positive proof of non-use |
| `UNKNOWN_REQUIRES_TRACE` | Cannot be classified without a live trace |

**PH-1.3** **Nothing is classified for deletion because no caller was found.** Absence of a textual
caller yields `UNKNOWN_REQUIRES_TRACE` or `DEPRECATE_AFTER_PROOF`, never deletion.

**PH-1.4** Live-trace the search experience: actual browser network activity on `/search`, the
server-side data path, whether results render, and the true status of the `/api/results` dependency.
Record the trace.

**PH-1.5** Verify portal reality per role — authentication, authorization, response compatibility,
data correctness, live operation. Replace all inferred status.

**PH-1.6** Inventory listing provenance (PRV-8) and the consent/audience data actually present on
contacts (MKT-2).

**Exit:** matrix complete, every row carries a disposition, every status names its verification
method, unverified items listed as unverified.

## PH-2 — Contract foundation

Build ARC, TRN, AUZ, POL interfaces, VER, AUD.

**Exit:** foundation in place · audit baseline recorded (AUD-1) · at least one non-critical route
migrated end to end through **both** clients · a demonstrated version-skew failure (VER-2).

## PH-3 — Search integration

Wire search to its domain service through the contract, informed by PH-1.4. Resolve `/api/results`.
Support every PRV combination with `distribution_state` enforced.

**PH-3.1 Acceptance — product behavior, not request success.** A 200 response and a valid envelope
do **not** prove working search. All fifteen required:

1. sale and rental separation
2. correct totals **after** policy filtering
3. pagination with no unreachable results
4. URL state reflects the query
5. back / forward navigation restores state
6. map and list stay synchronized
7. loading state
8. no-results state, distinct from failure
9. provider failure surfaced, not silently empty
10. unsupported filter fails loudly
11. stale-data warning
12. mobile behavior
13. public-field suppression
14. Cotality attribution where required
15. direct web-only listing behavior

**Exit:** all fifteen proven live per audience.

## PH-4 — Seller operating loop

Seller portal on the contract: listing status, traffic, engagement, showings, offers, and CMA per §K.

**Exit:** a seller sees their listing's real activity and the CMA their agent shared, proven live.

## PH-5 — Marketing readiness

MKT-3 capabilities on the contract, Fair Housing gate returning `not_evaluated` and routing to review.
**No live bulk campaign** (MKT-4).

**Exit:** the MKT-6 production-gate report can be produced in full and reconciles, with consent
limitations stated.

## PH-6 — Explainable intelligence

Signals as structured records: signal type · evidence · source · source timestamp · confidence ·
reason codes · policy status · expiration · recommended action · assigned person · human-approval
requirement.

No unexplained score is presented as truth. Any future AI layer is a **replaceable consumer** — it
may summarize, rank, or draft, and must **never invent the underlying facts**. Model, prompt
version, and cost are recorded; output requiring judgment requires human approval.

**Exit:** signals visible with evidence and reason codes, each stating what it does and does not
establish.

---

# O. OPEN QUESTIONS

| ID | Question | Blocks |
|---|---|---|
| **O-1** | Do existing models express the four PRV dimensions, or is a schema change required? | PRV-8, PH-2 |
| **O-2** | Which routes legitimately need a non-JSON transport class? | TRN-4, PH-1 |
| **O-3** | What is the actual browser and server data path for `/search` today? | PH-3 |
| **O-4** | What consent and audience data exists on contacts now, and what must be added? | MKT-2, PH-5 |
| **O-5** | Market-area definition for the Area CMA — radius, neighborhood boundary, or both; configurable per listing? | CMA-2, PH-4 |
| **O-6** | Should brokerage supervision of CMAs be enabled initially, or left off? | CMA-0, PH-4 |

---

# P. CHANGE LOG

Per §A.4 step 3, every change to a `DECIDED` requirement is recorded here with its ID.

| Rev | Date | ID | Change |
|---|---|---|---|
| 2 | 2026-07-28 | PRV-1..8 | Two-field origin model replaced by four independent dimensions |
| 2 | 2026-07-28 | AUZ-1, AUZ-5 | Single authorization error split into three outcomes with non-disclosure |
| 2 | 2026-07-28 | CMA-0..8 | Broker-approval gate **removed**; CMA is agent-owned, auto-populated, agent-shared |
| 2 | 2026-07-28 | PH-1.1, PH-1.2 | Phase 1 produces a machine-readable matrix with mandatory dispositions |
| 2 | 2026-07-28 | VER-1..5 | Version-skew controls and generated-client pipeline added |
| 2 | 2026-07-28 | PH-3.1 | Search acceptance expanded to fifteen product-behavior checks |
| 2 | 2026-07-28 | MKT-6 | Production gate requires a reconciled recipient report |
| 3 | 2026-07-28 | — | Reorganized: stable IDs, dependency map (§B), status legend, change protocol (§A.4). No requirement changed. |

---

# Q. NON-GOALS

Merging the two frontends · rewriting the static CRM · introducing a new AI provider · building the
Fair Housing scanner · production bulk email · any schema migration (separately gated, requires
explicit approval) · any repository-governance, historical-audit, or unrelated architecture work.
