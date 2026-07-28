# Frontend / Backend Integration Architecture — mallan.nyc

**Revision:** 4 · **Date:** 2026-07-28 · **Status:** DESIGN — not approved, not implemented
**Scope:** System-wide frontend/backend integration for `mallan67/mallan-nyc`
**Isolation:** Standalone. References no repository-governance, historical-audit, or other
architecture effort.

---

# A. HOW TO USE THIS DOCUMENT

Read this before changing anything below it. It exists so an agent picking up a single requirement
can tell what it depends on, what depends on it, and what must be re-verified if it moves.

## A.1 Requirement IDs

Every normative requirement has a stable ID. **Cite the ID, never the prose.** IDs are permanent —
a withdrawn requirement's ID is retired, never reused.

| Prefix | Domain | Section |
|---|---|---|
| `ACT` | Actors and identity | C |
| `PRV` | Listing provenance | D |
| `ARC` | Architecture and layering | E |
| `TRN` | Transport class and envelope | F |
| `AUZ` | Authorization and non-disclosure | G |
| `POL` | Policy gates | H |
| `VER` | Contract versioning | I |
| `AUD` | Contract audit | J |
| `CMA` | Seller market activity and CMA | K |
| `MKT` | Consent and marketing | L |
| `VRF` | Verification requirements | M |
| `PH` | Phases | N |

## A.2 Status legend

| Status | Meaning |
|---|---|
| **DECIDED** | Settled. Change requires the §A.4 protocol. |
| **DEFERRED** | Deliberately not decided. Blocking condition named. |
| **OPEN** | Needs an answer. Listed in §O. |
| **DERIVED** | Follows from another requirement; changes when its parent changes. |

## A.3 Section header convention

> **Depends on:** IDs that must hold for this to be valid
> **Feeds:** IDs that break if this changes
> **Status:** the section's dominant status

## A.4 Change protocol — read before editing any requirement

1. **Locate its ID** and its row in the dependency map (§B).
2. **Read the `Feeds` column.** Every ID there must be re-read and either confirmed still valid or
   changed in the same edit.
3. **If `DECIDED`,** record the change in §P with its ID, what changed, and why. Never silently
   rewrite a `DECIDED` requirement.
4. **If the change affects an executed phase,** its verification evidence (§M) is invalidated and
   must be re-produced. Note this explicitly.
5. **Never widen a claim to make an edit easier.** If evidence does not support the new wording, the
   wording changes — not the evidence.

## A.5 The rule that governs everything

> A component is described by what has been observed of it, at a named commit, by a named method.
> **Absence of evidence is recorded as "not verified," never as absence.**

---

# B. DEPENDENCY MAP

| Block | Depends on | Feeds | Phase |
|---|---|---|---|
| **C — Actors** | — | AUZ, POL, ARC-5 | 2 |
| **D — Provenance** | — | AUZ-4, POL-1, CMA, PH-3 | 1 → 2 |
| **E — Architecture** | ACT | TRN, AUZ, POL, VER, AUD | 2 |
| **F — Transport / envelope** | ARC-4 | AUD-3, VER, both clients | 2 |
| **G — Authorization** | ACT, PRV, ARC-5 | every entrypoint; PH-3, PH-4 | 2 |
| **H — Policy gates** | PRV, ARC-5 | PH-3, PH-4, PH-5, CMA | 2 |
| **I — Versioning** | ARC-2, ARC-3, TRN-2 | both clients, AUD-3 | 2 |
| **J — Audit** | TRN, VER | every later phase | 2 |
| **K — Market activity + CMA** | PRV, POL-1, AUZ-4 | PH-4 | 4 |
| **L — Marketing** | POL-2, AUZ | PH-5 | 5 |
| **M — Verification** | — | every phase exit | all |
| **N — Phases** | all above | — | — |

**Critical path:** `PH-1` → `ARC`+`TRN`+`AUZ`+`VER`+`AUD` → `PH-3` → `PH-4` → `PH-5` → `PH-6`.

**Highest blast radius:** `ARC-5` (the application-service layer — every entrypoint routes through
it), `TRN-2` (envelope), `AUZ-1` (outcome model).

---

# C. ACTORS

> **Depends on:** — · **Feeds:** AUZ, POL, ARC-5 · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **ACT-1** | Five actor classes: `anonymous`, `portal_client`, `agent`, `broker`, `system`. |
| **ACT-2** | `portal_client` is scoped by **role** (buyer / tenant / seller / landlord) **and** by resource. Role alone never authorizes. |
| **ACT-3** | Actor context is resolved by an **adapter** (HTTP or internal) and passed to the application service already resolved. Application and domain services never re-derive identity from transport. |

---

# D. LISTING PROVENANCE

> **Depends on:** — · **Feeds:** AUZ-4, POL-1, CMA-*, PH-3 · **Status:** DECIDED, one OPEN

Provenance, authority, reconciliation, publication, and provider verification are **five distinct
kinds of fact**. Collapsing them — or mixing lifecycle status into any of them — produces states
that cannot be reasoned about.

```text
acquisition_source           how it entered Mallan — immutable
  mallan_direct | cotality

authority_source             who is authoritative for provider-controlled fields NOW
  mallan | cotality

reconciliation_status        where the provider-matching workflow stands
  not_applicable | not_submitted | submitted | pending_match
  | matched | conflict | rejected | failed

publication_scope            where Mallan publishes it
  private | mallan_web

provider_publication_status  what the provider has verified
  not_verified | provider_verified

provider_identity            the provider's own record, when one exists
  cotality_listing_id | provider_last_verified_at
```

| ID | Requirement |
|---|---|
| **PRV-1** | `acquisition_source` is **immutable**. Original acquisition history is preserved permanently, never overwritten, even after Cotality becomes authoritative. |
| **PRV-2** | **A Mallan-direct listing remains Mallan-authoritative until a verified Cotality record is matched.** Submission alone never changes authority and never proves publication or syndication. |
| **PRV-3** | `authority_source` moves to `cotality` only when `reconciliation_status` is `matched` **and** `provider_identity` is populated. |
| **PRV-4** | `provider_publication_status: provider_verified` is settable **only** from verified provider facts carrying `cotality_listing_id` and `provider_last_verified_at`. No user, form, import, or application-layer write may assert it. Any other path is a defect. |
| **PRV-5** | `reconciliation_status: submitted` is a workflow state, not a publication or authority fact. It changes neither. |
| **PRV-6** | **Listing lifecycle status — active, under contract, closed, withdrawn, expired — lives in the canonical Cotality-aligned status model. It is never embedded in provenance, publication, or distribution.** |
| **PRV-7** | When `authority_source` is `cotality`, the provider is authoritative for provider-controlled fields. Mallan-originated values are retained as history and never presented as current provider truth. |
| **PRV-8** | A Mallan-direct listing may be published `mallan_web` with no Cotality provenance and **must never claim any**. No DTO, artifact, report, or email may attribute Cotality provenance to a listing lacking `provider_identity`. |
| **PRV-9** | `publication_scope` is **enforced**, not descriptive. Exposing a `private` listing outside its permitted surface fails closed. |
| **PRV-10** | The application service decides visibility, so every consumer filters identically regardless of acquisition source. |
| **PRV-11** | *(OPEN — O-1)* Whether existing models express these dimensions, and whether a schema change is required. |

---

# E. ARCHITECTURE

> **Depends on:** ACT · **Feeds:** TRN, AUZ, POL, VER, AUD · **Status:** DECIDED
> ⚠ **ARC-5 is the highest-blast-radius requirement in this document.**

```text
   Next.js frontend                   Static CRM frontend
   (app/, portals)                    (public/crm, plain JS)
          │                                    │
   browser client (ESM/TS)      generated browser client (no bundler)
          │                                    │
          └──────────────┬─────────────────────┘
                         │ HTTP
                         ▼
              HTTP route adapter                Server Component ─┐
         (decode request / encode response)     Cron / job ───────┤
                         │                      Internal caller ──┤
                         │                                        │
                         │                    internal adapter ◄──┘
                         │              (resolves system or user actor)
                         │                        │
                         └────────────┬───────────┘
                                      ▼
                          ═══ APPLICATION SERVICE ═══
                     authorization · policy · orchestration
                          (the ONLY way in — ARC-5)
                                      ▼
                              domain services
                                      ▼
                    data + providers (Prisma, Cotality, email)
```

| ID | Requirement |
|---|---|
| **ARC-1** | One directory is the single source of shared request/response schemas, envelope type, error taxonomy, transport classifications, and contract version. Nothing else defines a wire shape. |
| **ARC-2** | The static CRM receives a **generated, committed, browser-loadable** client — no framework imports, no Node built-ins, no runtime TypeScript. Lifecycle in VER-6. |
| **ARC-3** | The Next.js frontend receives a typed client over the same contract, returning a discriminated union, never throwing on HTTP status. |
| **ARC-4** | **HTTP route adapters decode requests and encode responses.** They contain no business logic, no authorization decisions, and no policy evaluation. |
| **ARC-5** | **The application (use-case) service is the only entry into behavior.** It enforces authorization and policy and orchestrates the use case. Both HTTP adapters and internal adapters call it. |
| **ARC-6** | **Internal adapters** — Server Components, Server Actions, cron, jobs, queue consumers — resolve the `system` or user actor and call the **application service**. They do not call domain services. |
| **ARC-7** | **Raw domain services are not directly callable from arbitrary UI, route, cron, or job code.** They are reachable only through an application service. This is enforced by the audit (AUD-5). |
| **ARC-8** | Domain services are plain functions with typed inputs/outputs, no knowledge of HTTP, transport, or caller identity. |
| **ARC-9** | Server-side code does **not** issue HTTP requests to the application's own routes. It uses an internal adapter into the application service — same authorization, same policy, no network round trip, no lost types. |
| **ARC-10** | The two frontends remain separate. This design gives them one contract; it does not merge them. |

**Why ARC-5 exists.** An earlier revision put authorization in the HTTP route adapter while allowing
server-side code to call domain services directly. That combination let a Server Component, cron
job, or background task reach data with **no actor resolution, no resource authorization, no listing
entitlement, and no policy evaluation**. The application-service layer closes that hole: there is one
door, and it is guarded regardless of who knocks.

---

# F. TRANSPORT CLASS AND ENVELOPE

> **Depends on:** ARC-4 · **Feeds:** AUD-3, VER, both clients · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **TRN-1** | Every route declares a transport class: `json`, `file`, `stream`, `redirect`, `auth_callback`, `webhook`, `health`. The audit checks the declaration against actual behavior. |
| **TRN-2** | `json` routes use the envelope: `{ok:true,data,meta}` / `{ok:false,error,meta}`. `meta` carries contract-version fields (VER-1), `requestId`, `actorClass`, `generatedAt`, and — for provider-derived responses — source and source timestamp. |
| **TRN-3** | `meta` is response metadata only. **The envelope introduces no database column and requires no migration.** |
| **TRN-4** | Non-JSON classes are **registered exemptions**, each stating why. An unregistered non-JSON route fails the audit. |
| **TRN-5** | **An authorized query returning zero records is a SUCCESS, not an error.** It returns `{ok:true, data:[], meta:{resultState:"empty"}}`. `resultState` is `ok` or `empty`. |
| **TRN-6** | The error taxonomy is a closed set of **failures only**: `VALIDATION`, `AUTHENTICATION`, `FORBIDDEN`, `RESOURCE_NOT_AVAILABLE`, `CONFLICT`, `POLICY_BLOCKED`, `NOT_EVALUATED`, `PROVIDER_UNAVAILABLE`, `VERSION_INCOMPATIBLE`, `INTERNAL`. Clients switch on the code; messages never carry meaning the code does not. |
| **TRN-7** | **No silent failure.** Unknown, unsupported, stale, and unverified states are explicit — either an error code or an explicit `meta` state. An empty array with no `resultState` is non-conforming. |

**Why an empty result is not an error.** A search that legitimately matches nothing is the system
working correctly. Encoding it as `ok:false` teaches both clients to treat a normal outcome as a
failure, pushes empty-state handling into error branches, and makes real failures harder to see.
The no-results UI is driven by `resultState:"empty"`, not by an error code.

---

# G. AUTHORIZATION AND NON-DISCLOSURE

> **Depends on:** ACT, PRV, ARC-5 · **Feeds:** every entrypoint, PH-3, PH-4 · **Status:** DECIDED

Enforced in the **application service** (ARC-5), so HTTP and internal callers are governed
identically.

| ID | Requirement |
|---|---|
| **AUZ-1** | Four distinct outcomes, never conflated — see table below. |
| **AUZ-2** | Layer 1 **Actor**: is the credential valid. Layer 2 **Role**: is this actor class permitted this operation at all. |
| **AUZ-3** | Layer 3 **Resource**: is this specific record within the actor's scope. |
| **AUZ-4** | Layer 4 **Listing-level**: is this actor entitled to *this listing*, given `acquisition_source`, `authority_source`, `publication_scope`, ownership, and representation. Separate from role because listing entitlement is not a property of the user alone. |
| **AUZ-5** | **Non-disclosure.** For ID-addressed resources, `RESOURCE_NOT_AVAILABLE` must use **the same status, the same body shape, and the same application-controlled execution path** whether the resource does not exist or exists but belongs to someone else, **with no intentional or materially distinguishable timing difference**. This prevents enumeration of listing, client, offer, and document IDs across portal users. |

| Situation | Response | Discloses existence? |
|---|---|---|
| Authorized query, zero records | `ok:true`, `data:[]`, `resultState:"empty"` | n/a |
| Authenticated user lacks a broad feature permission | `FORBIDDEN` | No — the *feature* is denied, not a record |
| ID-addressed resource mismatch (listing, client, document, offer) | `RESOURCE_NOT_AVAILABLE` | **No — must not** |
| Actual failure | the applicable error code | n/a |

User-facing message for `RESOURCE_NOT_AVAILABLE`, deliberately uninformative:

> This item is unavailable or is not associated with your account.

**On AUZ-5 timing.** Byte-identical wall-clock timing is not achievable and is not required. The
requirement is that the *application* does not branch in a way an observer can measure — no extra
lookup, no different code path, no distinguishable error handling between "absent" and "not yours."

---

# H. POLICY GATES

> **Depends on:** PRV, ARC-5 · **Feeds:** PH-3, PH-4, PH-5, CMA · **Status:** DECIDED

Evaluated **inside the application service**. Each returns `allowed` · `blocked` · `not_evaluated`.

| ID | Requirement |
|---|---|
| **POL-0** | **Policy evaluation order is: authorize what can be authorized without loading → load the minimum resource required → authorize resource and listing entitlement → evaluate policy → execute.** Policy that depends on listing-specific facts cannot precede loading that listing; requiring every gate before every domain call is not implementable. The application service owns this sequence. |
| **POL-1** | REBNY/RLS and Cotality gates apply per audience to listings whose `authority_source` is `cotality`, covering display permission, attribution, and disclaimer. Resolved through the existing integration surface using **live provider values and status definitions**. No new provider vocabulary, none copied, **no hardcoded status assumptions**. |
| **POL-2** | **The Fair Housing gate never silently passes.** Until the external scanner is connected it returns `not_evaluated`. It never returns `allowed`. |
| **POL-3** | `not_evaluated` on a compliance-sensitive surface requires **human review** before send or publish. The system routes to review; it does not proceed. |
| **POL-4** | `not_evaluated` is recorded on the artifact, so anything produced while the scanner was absent stays identifiable. |
| **POL-5** | The gate receives **context** — text, originating field, audience, surface, listing provenance — not a bare string. Without context it cannot distinguish a factual amenity ("children's playroom") from a preference statement ("perfect for families"); only the second is a violation. A string-only interface guarantees false positives that train people to ignore the gate. |

**Compliance-sensitive surfaces** (POL-3):

1. any outbound marketing email, campaign, or template;
2. any public listing description, headline, or marketing remark;
3. any listing presentation, seller report, landlord report, or CMA narrative shown outside the brokerage;
4. any advertising copy naming a listing, building, neighborhood, agent, or the brokerage;
5. any AI- or template-generated text destined for any of the above.

Purely internal, non-client-facing text — a private note, an internal task, a debug log — is not
gated.

---

# I. CONTRACT VERSIONING

> **Depends on:** ARC-2, ARC-3, TRN-2 · **Feeds:** both clients, AUD-3 · **Status:** DECIDED

**Contract version and build version are different facts.** Compatibility is a property of the
contract, not of when a bundle was built.

| ID | Requirement |
|---|---|
| **VER-1** | Five fields exist: `contractVersion` (served, in every `meta`) · `clientContractVersion` (sent per request) · `minimumSupportedContractVersion` (advertised) · `serverSupportedContractVersions` (advertised) · `clientBuildVersion` (sent per request). |
| **VER-2** | **Compatibility is determined from `clientContractVersion` only.** |
| **VER-3** | `clientBuildVersion` is retained for diagnostics, deployment tracing, and support. **It never determines schema compatibility.** |
| **VER-4** | A client whose `clientContractVersion` is below `minimumSupportedContractVersion`, or absent from `serverSupportedContractVersions`, receives `VERSION_INCOMPATIBLE` and **fails visibly** with an explicit refresh-or-upgrade message. |
| **VER-5** | Every response states the contract version used, the supported contract versions, the minimum supported contract version, and whether the client must refresh or upgrade. Checks happen on the response envelope — no separate round trip. |
| **VER-6** | **The generated CRM client never silently parses an unrecognized response shape.** An unrecognized envelope is an error, not a plausible-looking object. |
| **VER-7** | Generated-client lifecycle: generated from the contract by one named command · deterministic (same contract in, byte-identical client out) · embeds `clientContractVersion` and `clientBuildVersion` · committed so the CRM loads it without a build step · **never manually copied or hand-edited** · a drift check regenerates and compares, failing on any difference. Publication *is* the commit. |

---

# J. CONTRACT AUDIT — BASELINE AND RATCHET

> **Depends on:** TRN, VER, ARC · **Feeds:** every later phase · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **AUD-1** | The current count of conforming entrypoints is recorded once as a **baseline**. |
| **AUD-2** | **Ratchet:** the validator fails if conformance decreases. New entrypoints must conform. Existing non-conforming ones migrate at any pace but are never added to. |
| **AUD-3** | Checks entrypoint classification, exemption registration, envelope conformance for `json` routes, `resultState` presence on collection responses, and generated-client drift (VER-7). |
| **AUD-4** | The validator states what it proves **and what it does not** — it verifies contract conformance, not correctness, not authorization behavior, not live operation. |
| **AUD-5** | Checks **ARC-7**: that domain services are reached only through application services. A direct domain-service call from a route, Server Component, cron, or job is a violation. |

---

# K. SELLER MARKET ACTIVITY AND CMA

> **Depends on:** PRV, POL-1, AUZ-4 · **Feeds:** PH-4 · **Status:** DECIDED

The seller portal has **two connected but different products**. Conflating them is why an earlier
revision incorrectly froze factual market activity behind an agent's republish action.

> **CMA-0 — governing statement.** Subject-listing facts come from the subject listing's current
> `authority_source`. Comparable listing facts and Cotality status categories come from verified
> Cotality data. **A Mallan-direct subject listing must never be described as Cotality-sourced.**
> The authorized listing agent or broker reviews and may modify comparable selection, analysis, and
> presentation before sharing. **Central broker approval is not required.**

## K.1 Product A — Live building market activity

| ID | Requirement |
|---|---|
| **CMA-1** | Automatically refreshed from Cotality: active similar units in the building · under-contract similar units · recently sold similar units · useful withdrawn or expired units · dates, prices, and source timestamps. |
| **CMA-2** | **This is factual market activity. It refreshes automatically and does not depend on the agent republishing anything.** |
| **CMA-3** | **The agent cannot edit the underlying Cotality facts** in this view. |
| **CMA-4** | Status categories come from **live Cotality status definitions**. No hardcoded status assumptions (PRV-6, POL-1). |

## K.2 Product B — Agent-controlled CMA

| ID | Requirement |
|---|---|
| **CMA-5** | Every authorized agent or broker generates a CMA for their own client or listing. No company-wide approval bottleneck. **Brokerage supervision is off by default** (resolves former O-6); it may be configured later and is not a launch dependency. |
| **CMA-6** | Automatically generated from building comparables **and** similar units in the surrounding area. |
| **CMA-7** | The agent may: add or remove eligible provider-backed comparables · adjust radius and recency · reorder · add renovation or condition adjustments · add professional commentary · decide which version to share. |
| **CMA-8** | Each comparable carries **selection reason codes**. |
| **CMA-9** | Both results are preserved: `system_generated_set`, `agent_selected_set`, `excluded_comparables`, `manual_adjustments`, `agent_notes`, `generated_at`, `modified_at`, `shared_at`. |
| **CMA-10** | **Manual changes never rewrite or falsify provider facts.** The agent adds professional judgment; original provider values remain preserved and distinguishable from adjustments. |
| **CMA-11** | The seller sees **the last shared CMA version** — never internal drafts, excluded properties, or private notes unless published. |
| **CMA-12** | **Product A continues to update independently of Product B.** A stale shared CMA never freezes live building activity. |
| **CMA-13** | The system alerts the agent when market activity makes the shared CMA outdated; the agent may publish an update. |

**Comparable similarity** — building: unit type · bedroom and bathroom count · approximate size ·
floor or line · exposure · condition · outdoor space · property type · maintenance or common
charges. Area: similar property type · similar configuration · appropriate price range · reasonable
geographic radius · recent listing and closing dates · relevant building and amenity characteristics.

**Automatic population:** asking prices · last asking prices · closed prices where available · price
per square foot where size data is reliable · days on market · listing and closing dates · unit
characteristics · building characteristics · source timestamp · Cotality listing identifiers.

**Selection reasons (CMA-8) example:**

```text
Selected because:
- same building;
- one-bedroom unit;
- approximately 6% larger;
- sold within the last six months;
- similar floor and exposure.
```

**Seller portal shows**, with A and B clearly distinguished: live activity in the seller's building
(A, auto-refreshed, with its refresh date) · the shared CMA (B) with its shared date, data-as-of
date, selected comparable set, and whether a newer version is pending · current competition ·
properties under contract · recent closed sales · pricing and market-position observations.

**Workflow**

```text
A: Live Cotality data ──► building market activity ──► seller portal (auto-refresh)

B: Live Cotality data ──► automatic building + area sets ──► agent reviews/adjusts
                          ──► agent shares version ──► seller portal (last shared)
                          ──► market activity changes ──► agent alerted, may republish
```

---

# L. CONSENT AND MARKETING

> **Depends on:** POL-2, AUZ · **Feeds:** PH-5 · **Status:** DEFERRED (MKT-2 blocks production)

| ID | Requirement | Status |
|---|---|---|
| **MKT-1** | **Mallan policy requires affirmative opt-in for the applicable channel and purpose, and permanently honors later opt-out or unsubscribe. Both states and their provenance must be durable.** Consent is modeled as **contact × channel × purpose**, not a boolean. | DECIDED |
| **MKT-2** | Two items require an explicit data-model decision and approval: (a) durable consent **provenance** per contact — source, acquisition date, legal basis, evidence; (b) authorization to run **production bulk email**. Both need schema work and are gated. | DEFERRED |
| **MKT-3** | Until MKT-2 resolves the system **may**: audience classification · provenance review · suppression checks · unsubscribe processing · Fair Housing review · campaign preview · recipient count · dry run · **test sends to internal addresses only**. | DECIDED |
| **MKT-4** | Until MKT-2 resolves the system **may not** claim complete consent enforcement or release a live bulk campaign. No documentation, report, or interface may state that consent enforcement has been achieved. | DECIDED |
| **MKT-5** | Existing fail-closed suppression behavior is retained unchanged. | DECIDED |
| **MKT-6** | Releasing any production campaign requires a **reconciled** recipient report: `eligible`, `suppressed`, `unsubscribed`, `missing opt-in`, `pending review`, `Fair Housing blocked`, `invalid address`, `duplicate identity`. Counts must reconcile to the total audience; an unreconciled report blocks the send. | DECIDED |

---

# M. VERIFICATION REQUIREMENTS

> **Depends on:** — · **Feeds:** every phase exit · **Status:** DECIDED

| ID | Requirement |
|---|---|
| **VRF-1** | **Health checks** — operational probes proving the surface responds correctly, before and after change. |
| **VRF-2** | **Exact tests** — named commands, recorded raw output and exit codes, against a named commit, in a named environment. Tests fail before and pass after when behavior changes. |
| **VRF-3** | **Production proof** — live evidence from production or an immutable preview: a real request producing a real response. Source reads and unit tests never substitute for a rendering or behavior claim. |
| **VRF-4** | **Rollback** — a written, tested path back, verified before the change ships. |
| **VRF-5** | A phase completes only when VRF-1..4 all exist for it, each stating what it proves **and what it does not**. |

---

# N. PHASES

> **Depends on:** all above · **Status:** DECIDED

## PH-1 — Verified inventory

Produces a **decision artifact**, not merely an inventory.

**PH-1.1 Entrypoint matrix — one row per route × HTTP method, plus one row per non-HTTP
entrypoint** (cron, job, queue consumer, Server Action, internal caller). A single route file
exposing `GET` and `POST` with different authentication, schemas, and behavior is **two rows**.

Columns:

`route` · `method` · `entrypoint_type` · `runtime` · `transport_type` · `frontend_callers_found` ·
`authentication_method` · `actor_classes` · `resource_authorization` · `request_schema` ·
`response_schema` · `application_service` · `domain_service` · `data_authority` · `policy_gates` ·
`error_behavior` · `production_verification_status` · `migration_disposition`

**PH-1.2 Every row ends Phase 1 with a disposition:**

| Disposition | Meaning |
|---|---|
| `MIGRATE` | Move onto the contract |
| `KEEP_WITH_EXCEPTION` | Stays as-is with a registered transport exemption |
| `CONSOLIDATE` | Overlaps another entrypoint; merge target identified |
| `DEPRECATE_AFTER_PROOF` | Removal candidate **only after** positive proof of non-use |
| `UNKNOWN_REQUIRES_TRACE` | Cannot be classified without a live trace |

**PH-1.3** **Nothing is classified for deletion because no caller was found.** Absence of a textual
caller yields `UNKNOWN_REQUIRES_TRACE` or `DEPRECATE_AFTER_PROOF`, never deletion.

**PH-1.4** Live-trace the search experience: actual browser network activity on `/search`, the
server-side data path, whether results render, and the true status of the `/api/results` dependency.
Record the trace.

**PH-1.5** Verify portal reality per role — authentication, authorization, response compatibility,
data correctness, live operation. Replace all inferred status.

**PH-1.6** Inventory listing provenance (PRV-11) and the consent/audience data present on contacts
(MKT-2).

**PH-1.7** Identify every existing direct domain-service call from a route, Server Component, cron,
or job — the ARC-7 violations that the application layer must absorb.

**Exit:** matrix complete, every row carries a disposition, every status names its verification
method, unverified items listed as unverified.

## PH-2 — Contract foundation

Build ARC (including the application-service layer), TRN, AUZ, POL interfaces, VER, AUD.

**Exit:** foundation in place · audit baseline recorded (AUD-1) · at least one non-critical
entrypoint migrated end to end through **both** clients · one internal (cron or Server Component)
caller migrated through an internal adapter, proving ARC-6 · a demonstrated version-skew failure
(VER-4).

## PH-3 — Search integration

Wire search to its application service, informed by PH-1.4. Resolve `/api/results`. Support every
PRV combination with `publication_scope` enforced.

**PH-3.1 Acceptance — product behavior, not request success.** A 200 response and a valid envelope
do **not** prove working search. All fifteen required:

1. sale and rental separation
2. correct totals **after** policy filtering
3. pagination with no unreachable results
4. URL state reflects the query
5. back / forward navigation restores state
6. map and list stay synchronized
7. loading state
8. no-results state via `resultState:"empty"`, distinct from failure
9. provider failure surfaced, not silently empty
10. unsupported filter fails loudly
11. stale-data warning
12. mobile behavior
13. public-field suppression
14. Cotality attribution where required
15. Mallan-direct `mallan_web` listing behavior

**Exit:** all fifteen proven live per audience.

## PH-4 — Seller operating loop

Seller portal on the contract: listing status, traffic, engagement, showings, offers, plus **both**
K.1 live building activity and K.2 the shared CMA.

**Exit:** a seller sees auto-refreshing building market activity **and** the CMA their agent shared,
with the two visually and semantically distinct, proven live.

## PH-5 — Marketing readiness

MKT-3 capabilities on the contract, Fair Housing gate returning `not_evaluated` and routing to
review. **No live bulk campaign** (MKT-4).

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
| **O-1** | Do existing models express the six PRV dimensions, or is a schema change required? | PRV-11, PH-2 |
| **O-2** | Which entrypoints legitimately need a non-JSON transport class? | TRN-4, PH-1 |
| **O-3** | What is the actual browser and server data path for `/search` today? | PH-3 |
| **O-4** | What consent and audience data exists on contacts now, and what must be added? | MKT-2, PH-5 |
| **O-5** | Market-area definition for the Area CMA — radius, neighborhood boundary, or both; configurable per listing? | CMA-6, PH-4 |

*O-6 (brokerage CMA supervision) is resolved — see CMA-5. Supervision is off by default.*

---

# P. CHANGE LOG

| Rev | ID | Change |
|---|---|---|
| 2 | PRV-* | Two-field origin model replaced by multiple dimensions |
| 2 | AUZ-1, AUZ-5 | Single authorization error split into distinct outcomes with non-disclosure |
| 2 | CMA-* | Broker-approval gate removed; CMA agent-owned |
| 2 | PH-1.1/1.2 | Phase 1 produces a machine-readable matrix with dispositions |
| 2 | VER-* | Version-skew controls and generated-client pipeline added |
| 2 | PH-3.1 | Search acceptance expanded to fifteen checks |
| 2 | MKT-6 | Production gate requires a reconciled recipient report |
| 3 | — | Reorganized: stable IDs, dependency map, status legend, change protocol. No requirement changed. |
| **4** | **PRV-1..11** | Provenance split into six dimensions. `pending_reconciliation` removed from `authority_source`; `submitted_to_rls` removed from distribution; **lifecycle status (active/under contract/closed/withdrawn) removed from provenance entirely (PRV-6)** and returned to the canonical Cotality-aligned status model. New `reconciliation_status`, `publication_scope`, `provider_publication_status`. |
| **4** | **ARC-5..9** | **Application/use-case service layer added.** Rev 3 allowed server-side code to call domain services directly while authorization lived in the HTTP adapter — a hole letting cron, jobs, and Server Components bypass actor resolution, resource authorization, listing entitlement, and policy. Authorization and policy now live in the application service; domain services are reachable only through it (ARC-7, enforced by AUD-5). |
| **4** | **POL-0** | Policy order corrected. Rev 3 required every gate before any domain call, which is not implementable for listing-specific policy. The application service may load the minimum resource, authorize it, evaluate policy, then execute. |
| **4** | **TRN-5, TRN-6, AUZ-1** | `EMPTY_RESULT` removed from the error taxonomy. An authorized zero-record result is a **success** with `meta.resultState:"empty"`. Error taxonomy is now failures only; `VERSION_INCOMPATIBLE` added. |
| **4** | **AUZ-5** | Timing requirement softened from identical timing to same status, body shape, and application-controlled execution path with no intentional or materially distinguishable timing difference. |
| **4** | **VER-1..3** | Contract version and build version separated. Compatibility determined from `clientContractVersion`; `clientBuildVersion` is diagnostics only. |
| **4** | **CMA-1..13** | Split into Product A (live building market activity, auto-refreshed, agent cannot edit) and Product B (agent-controlled CMA, shared versions). A updates independently of B (CMA-12). CMA-0 subject-listing authority rule added: subject facts follow the subject's `authority_source`; a Mallan-direct subject is never described as Cotality-sourced. |
| **4** | **CMA-5** | O-6 resolved: brokerage supervision off by default, not a launch dependency. |
| **4** | **PH-1.1** | Matrix is now one row per route × HTTP method plus non-HTTP entrypoints; added `method`, `runtime`, `entrypoint_type`, `application_service`. |
| **4** | **PH-1.7** | New: inventory existing direct domain-service calls (ARC-7 violations). |
| **4** | **MKT-1** | Reworded to state Mallan policy — affirmative opt-in per channel and purpose, permanent honoring of opt-out — rather than describing "CAN-SPAM postures." |

---

# Q. NON-GOALS

Merging the two frontends · rewriting the static CRM · introducing a new AI provider · building the
Fair Housing scanner · production bulk email · any schema migration (separately gated, requires
explicit approval) · any repository-governance, historical-audit, or unrelated architecture work.
