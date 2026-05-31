# Mallan Listing-Search Business-Spine — Master Plan

> **Status:** DESIGN / PLAN. **NOT approved for implementation.** No code, schema, migration, cron, env, or agent-dispatch action follows from this file until each item clears its own gate (Maya approval + `NEON.md` discipline + the compliance suite).
> **Created:** 2026-05-30 · **Owner:** Maya Allan · **Author:** Claude Code (Opus 4.8, 1M) under Maya direction.
> **This is the canonical source of truth for the search-centric rebuild.**
> **Active companion detail-specs** (subordinate to this plan, but the canonical detailed reference for their tier — mostly complete):
> - `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` (T2 — external / StreetEasy data model + workflow)
> - `docs/superpowers/specs/2026-04-30-sponsor-database-design.md` (T3 — sponsor / Schedule A data model + ETL)
>
> **RESTRICTED · non-authoritative** (archived 2026-05-30 under `docs/crm-architecture/superseded/`, read-only — **no agent may pull requirements from them**):
> - `2026-04-27-mallan-intelligence-platform-WIP.md` (vision; mostly deferred — see §0.7)
> - `crm-agent-search-architecture-audit-2026-05-21.md` (current-state map; folded in)
>
> **Still-active operational records:** `memory/REFACTOR-2026-04-25.md` · `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` · `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md`.

---

## §0. Operating laws (apply to every section)

These are binding for every agent that touches this plan.

0.1 **Search is the center.** The product is one business engine — *Search → match → send/share → track reaction → advise → show → offer/lease/sale → commission → repeat.* CRM, forms, portals, the event spine, the field registry, the broker tools — all exist to serve that loop. Nothing is built that does not advance a money action in it.

0.2 **No signaling pages.** Every page, panel, card, column, or metric MUST trace to (a) a real data source AND (b) a factual, actionable outcome. No vanity scores, no "health 87/100," no "momentum heating up," no hardcoded checkmarks. If a surface has no factual backing and no action, it is removed. Removal of any existing page is **flag-and-confirm with Maya first** — never blind delete.

0.3 **No guessing on listing data (fail-closed).** Listing price, status, and availability are never fabricated or served stale past their freshness window. When a compliance rule, a feed behavior, or a data source is unclear or missing, STOP and report — do not extrapolate. (CLAUDE.md §E.)

0.4 **Normalized & canonical.** One registry, one search core, one canonical version of every template/document. No `*-v2`/`*-new`/`*-final` files, no duplicated form logic, no two-systems-for-one-job (e.g., the current `AuditEvent` + `ActivityLog` split gets unified). (REPO-SOURCE-OF-TRUTH-CHARTER.md.)

0.5 **Compliance-first.** Anything touching listing display, Cotality data, search, forms, portal data, attribution, or user-facing text reads `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first and runs the validation suite (§7.4) before commit. The rebny-compliance skill is the gate.

0.6 **Proof-first on completion.** "Done" requires a failing test that flips green, a live URL probe, or a runtime log — not source-grep alone. (CLAUDE.md §F.)

0.7 **What we keep from the WIP vision; what we defer.** KEEP: the canonical field registry, the Event Spine (every engagement = a typed event), the role/money-loop model. DEFER (intelligence layer, sits *on top of* this spine, not in it): Approval-Potential scoring, hypothesis distributions, the decision engine, the AI co-pilot, the NYC "moats." The WIP itself records these were rejected four times as "not what I'm looking for." Do not anchor the build on them.

0.8 **Cotality is the live source of record (HARD RULE — every agent).** ALL listing information is pulled **live from Cotality**. The local database is a performance cache ONLY — never the source of truth for anything client-facing. Every listing opened, sent, or shared is **live-validated against Cotality first** (the "live capture", §3.1). No client-facing surface ever serves cached data without a live Cotality revalidation. No guessing, no assumptions, no winging it, no stale data.

0.9 **Triple compliance check before commit (HARD RULE — every agent).** Every change is checked against (a) **REBNY rules**, (b) the **project compliance suite** (§7.4), and (c) **Cotality's own data-use / display rules**, before any commit. The rebny-compliance skill is the gate; fail-closed on any conflict, missing rule, or ambiguity.

0.10 **Health-tested, all-green before commit (HARD RULE — every agent).** Everything built ships with a health test (a failing test that flips green — proof-first, §0.6). **No commit unless the full validation suite (§7.4) AND the feature's own tests all pass.** No `--no-verify`, no skipping hooks, no silencing or deleting a failing test to go green.

0.11 **Terminology + restricted archive (HARD RULE — every agent).** The live data source is **Cotality**, and the live-feed integration layer is named **"Cotality Live Connect"** (the live OData connector + mapper + status-normalizer + the 6 distribution gates + field registry). **All plan language, UI copy, new files, identifiers, and fields use "Cotality" / "Cotality Live Connect."** Do **not** introduce the retired product names (the three legacy MLS/feed acronyms) in any new code or plan text; only **REBNY** keeps its name (it is the governing rule-body). The current (legacy-named) implementation files/symbols of Cotality Live Connect are listed **once** in the `rebny-compliance` skill §2.3 code-locations — agents read that table to find them; §10 renames the module to `lib/cotality-live-connect/**`. Do not extend the legacy names. The superseded specs in `docs/crm-architecture/superseded/` are **non-authoritative and access-restricted**: no agent or session may pull requirements, scope, or instructions from them. The ONLY source of truth is this master plan.

---

## §1. The business engine (the spine)

```
        ┌──────────────────────────────────────────────────────────────────┐
        │  SEARCH → MATCH → SEND/SHARE → TRACK REACTION → ADVISE → SHOW →   │
        │  OFFER/LEASE/SALE → COMMISSION → (repeat / role-rotate)           │
        └──────────────────────────────────────────────────────────────────┘
```

Every feature in this plan is placed on this loop. The five money loops (§4) are the same engine read from five seats (buyer, renter, seller, landlord, agent-daily-queue). The broker (§6) sees all loops at once. The event spine records every step so "track reaction" and "what's the next money action" are answerable from real rows.

---

## §2. One canonical registry + one search core

The single highest-leverage idea: **one normalized field registry and one search core feed every surface.** Today search is fragmented (public reader, CRM Cotality passthrough, saved-search, alerts each with their own criteria/gates/mapping) — that fragmentation is the business killer (`SEARCH-SPINE-HANDOFF-2026-04-29.md`).

2.1 **Canonical field registry** — a single `search-registry.json` (the WIP's idea) as the source of truth for all **~1,447 Cotality fields across 12 resources**, each entry declaring: widget, tab, options, provider mapping (Cotality field/operator/datatype/resource ↔ Prisma), compliance flags (distribution_gate / vow_only / website_only), display tier. The form renderer, the criteria collector, and the provider adapters all read this registry — no hand-typed field IDs (the 2026-03-20 bug: 348 of 623 advanced fields had no IDs and were silently dropped by `collectSearchCriteria()`).

2.2 **One search core** — the existing `lib/search/**` spine (criteria builder, access-decision, search-run-recorder, public-DB search, and the Cotality Live Connect filter + mapper helpers) is extended, not forked. The same core powers: public site search, agent search, saved searches, search alerts, comps/CMA, seller pricing, landlord rental comps, portal shared listings, recommendations, and the broker daily queue.

2.3 **Agent search ≠ public search.** There is **no agent-search UI today** (audit §G.1) — this is the biggest missing piece. Agent search adds: wider status set (Pending/Withdrawn/Expired/Cancelled/Closed), tier toggles (§3), per-agent saved searches, client-match, owner-reveal-gate (T2/T3), and result→action (send/share/collection/CMA/showing). Per-agent privacy is strict (Agent A cannot see Agent B's searches/sends/shares); broker sees all.

2.4 **Result → action.** Every search result supports: send to client · add to collection · request showing · add to CMA / compare to subject · email listing agent · confirm commission · open client-match list · open building dossier · open seller/landlord pricing view. Search without action is browsing; Mallan needs conversion.

---

## §3. The three inventory tiers

The binding boundary. **T2 and T3 are kept fully separate from Cotality but are searchable inside the CRM via opt-in toggles. They never touch any public surface.**

| Tier | Source | Storage | Public? | Agent search | Client visibility |
|---|---|---|---|---|---|
| **T1 — Cotality (REBNY feed)** | Cotality feed + Mallan exclusives (manual CRM POST) | `Listing` + projection table | **YES** — REBNY attribution required | default ON | public site + portal (sanitized) |
| **T2 — External (StreetEasy not-in-feed, FSBO, off-market)** | one-time StreetEasy Manhattan scrape → dedup → maintenance | `external_inventory_listings` (separate table) | **NEVER** | opt-in toggle, default OFF, non-Cotality disclaimer | only via explicit share row; owner PII reveal-gated |
| **T3 — Schedule A / sponsor / new-development** | NY AG offering-plan ETL + ACRIS + NYC Open Data | 9-table sponsor schema (separate) | **NEVER** unless the unit is linked to a Cotality listing (`cotality_listing_id` set → T1 rules govern) | opt-in toggle, default OFF, sponsor badge + disclaimer | only via explicit share row; contact reveal-gated |

### 3.1 T1 — "live capture" rule (the keystone decision)

DB-first for speed; **a live Cotality re-fetch ("live capture") fires automatically at the two money moments — opening a listing detail, and immediately before any send/share to a client** — plus a manual **"refresh live"** on any search/result. Background **sync** keeps the DB warm and every result carries a "data as of HH:MM" stamp. Net guarantee: *a client can never receive a stale price or a dead listing,* and an agent can force live data anywhere — without making every filter keystroke a throttled OData round-trip. A config flag can later escalate to fully-live-on-every-search if desired. This respects the Cotality feed replication-licensing model and rate limits (verify exact limits in the Cotality connector before tuning).
- **COMPLIANCE PIN (non-negotiable):** "Live capture" is about *freshness*, NOT *bypassing the gates*. Every live-captured T1 row MUST pass through the existing authoritative writer/gate path — the **6 distribution gates** (owner opt-out, participant-only, `InternetEntireListingDisplayYN` fail-OPEN, `InternetAddressDisplayYN` fail-OPEN, §2.05 terminal-status, Coming Soon badge), the **Cotality Live Connect mapper, status-normalizer, and terminal-status guard** — before any display, send, or share. Live data is never shown raw. Provider-gated fields stay fail-OPEN (`!== false`); per-row opt-out fields stay fail-closed (`affirmPermission`). Per the rebny-compliance skill §2/§2.1 + the 2026-04-30 incident.

### 3.2 T2 — StreetEasy one-time scrape → dedup → maintenance

- **One-time backfill** of StreetEasy **Manhattan** listings → for each, normalize the address → check against the Cotality `Listing` table (T1). **If already in the feed, drop it** (it's already searchable as T1). Only the residual genuinely-not-in-feed inventory (FSBO, off-market, non-Cotality-broker exclusives) is stored in `external_inventory_listings`.
- Because most Manhattan listings ARE in Cotality, the residual is small → the ongoing job is **maintenance** (price/status deltas, new not-in-feed arrivals, stale removal), not a firehose.
- Dedup key = normalized address (the held spec already has this + a "this appears to be Cotality listing X, skip" path). Owner PII reveal-gated + audited. Non-Cotality disclaimer stamped at write, rendered on every surface.
- **Legal gate (must be recorded before scraper code is written):** the StreetEasy scrape touches StreetEasy ToS; the held spec parks the scraper behind a memo signed by Maya as broker of record, plus a one-time read of the source's ToS. See §5.3 + §9 Decision D2.

### 3.3 T3 — Schedule A / sponsor / offering plans

- Sourced from public-records ETL (NY AG REFB offering plans, ACRIS, NYC Open Data) per the 1003-line held sponsor spec. Offering-plan PDFs are also pulled into the §6.6 document library.
- Shadow-row rule: linked to a Cotality listing → T1 rules govern (only path to any public surface); not in Cotality → local shadow row, agent-only + share-only, sponsor badge + disclaimer.
- Commission terms reveal-gated after confirmation (post-NAR).

### 3.4 The reverse firewall (CRITICAL, currently unpinned)

`lib/external-listings/**` and future `lib/sponsor/**` **cannot** import the search projection or the **Cotality Live Connect** module, and **cannot** be referenced from `app/api/listings/**`, `app/sitemap.ts`, `app/robots.ts`, public structured-data emitters. Enforced by a source-grep CI test (the reverse of the existing syndication import-boundary test in `tests/runtime/`) + `assertNotPublicSurface()` at the helper level. This is the single most important architectural test the tiered model needs.

---

## §4. The five money loops

Each loop is the §1 engine from one seat. All read the same search core (§2) and write the same event spine.

4.1 **Buyer** — profile → agent search → shortlist/collection → send → client saves/likes/dislikes/discusses → reaction returns to CRM → refine → showing → offer → deal. Includes outside-listing intake (buyer-submitted links), family/friend collaboration, financial-intent visibility, showing/offer workflow.

4.2 **Renter / Tenant** — rental search → send options → reaction → showing → application/lease → tenant/landlord signals → **lease-start-relative buy-conversion** (do nothing months 0–6; qualify at month 6; ~90 days before lease end ask about buying; lease-application data NOT reused for buy-track without consent — WIP corrections carried forward).

4.3 **Seller / Listing acquisition** — comp search → pricing evidence → draft sale listing → seller portal signals (valuation request, desired price, payoff, prep budget, closing costs, timeline, urgency, readiness) → price-change recommendation → offer → deal. Seller form feeds search/comps/pricing — not a static intake.

4.4 **Landlord / Rental inventory** — rental comp search → draft rental listing → activity → tenant leads/showings/applications → lease → renewal/relist/sell decision (vacancy days, carrying cost, relist timing, renewal intent). Landlord form feeds comps + inventory-performance.

4.5 **Agent daily money queue** — all search/client/listing/portal signals ranked into "who to call and why, today." Real items only (§0.2). This is the agent-facing twin of the broker Money & Action Board (§6.7).

---

## §5. Compliance firewall

5.1 **Tier boundary** — §3.4 reverse pin; T2/T3 never in `/api/listings`, sitemap, SEO/JSON-LD, robots allowlist, or `ListingSearchProjection`. Default-OFF toggles. Tests in §7.4.

5.2 **Non-Cotality disclaimer** — versioned, stamped at write, rendered on every T2/T3 surface (CRM card/detail, portal card/detail, share email, export). Disclaimer text reads "did not originate from the Cotality / REBNY feed." Old rows keep their stamped version.

5.3 **Owner / contact PII reveal-gate** — default null; two-step attestation (legitimate purpose + TCPA-compliant outreach + NY DOS §175.28 anti-discrimination notice embedded in the modal) → writes `AuditEvent` + dedicated reveal-log; discovering agent + broker only; clients never.

5.4 **Pre-send scans** — Fair Housing on caption + cover note (currently only listing fields are scanned — gap), off-market language, compensation/commission text, FARE Act injection on NYC rentals, TCPA consent on recipient, brokerage attribution present (NY DOS §175.25), agent owns the recipient. Block on hit.

5.5 **Per-agent isolation** — `requireOwnedBy(req, entity, id)` applied systematically (today implicit via `where` clause only — audit §K #17). Broker bypass; portal-role mask; seller/landlord scoped by `owner_client_id`.

5.6 **Ethics gate per-request** — UCBA Art. III §6 checked in `requireAgentOrBroker()` middleware (today login-only — audit §F.1 9.1), 5-min cache.

5.7 **Broker-of-record authorization** — the StreetEasy scrape (§3.2) and any non-Cotality owner-contact outreach require Maya's recorded broker-of-record authorization. Captured in §9.

---

## §6. Broker Command Center (+ Marketing Hub, Document Library, Leads Lifecycle)

Current broker side is **60–70% complete** (audit 2026-05-30). What works: total read-visibility, agent roster/management, commission tracking+approval+stats, the compliance auditor (19 UCBA fields + Fair Housing + 6 gates), full audit log, auto-assign + scoring rules, pipeline stages, tasks, drips. What this section fixes:

### 6.1 Total visibility
Broker sees every agent + every agent's listings, leads, deals, sends/shares, showings, commissions. Mostly exists at SQL level; add a dedicated `ListingSend` model for real send-history queries (today sends are only implicit in `AuditEvent`).

### 6.2 Lead distribution
- **BUILD `POST /api/crm/leads/[id]/assign`** — declared in `permissions.js` but the backend does not exist. Manual broker→agent assignment with audit.
- **BUILD `POST /api/crm/leads/bulk-reassign`** — `{source_agent_id, target_agent_id}` for a retiring/added agent.
- Auto-assign + scoring rules already work — keep.

### 6.3 Commission oversight (post-NAR)
- Tracking + approval + stats exist. **BUILD** `CommissionConfirmation` (generalized across all tiers): `commission_confirmed_at`, `commission_basis` (seller_concession / co_broke / buyer_pays_own_agent / closing_credit / other), `commission_value`, audit of who-called-when. Post-Sitzer/Burnett, "call the agent to confirm" is the baseline for ALL listings, not just T2/T3.
- **FIX the deal-form submit stub** — buyer/tenant deal forms validate + toast but never POST → deals are never created (PR #146 staged).

### 6.4 Agent credential vault (license + CE + E&O) — NYS-tied
The weakest current area (~20%). Build one normalized per-agent credential record with broker **and** agent alerts:
- **License (auto-synced):** pull the NY DOS open dataset **"Active Real Estate Salespersons and Brokers" (`yg7h-zjbf`)** from data.ny.gov via the **SODA API with a registered Socrata app token**, **daily**, matched by **license number**. Store `license_expiration_date` → alerts at T-90 / T-30 / T-7 to agent + broker (DOS notifies only the licensee, never the supervising broker — that's the value-add).
  - **Fail-closed:** the dataset is *active-only*, no status column, no CE/disciplinary data. If a tracked agent **drops out of the active set**, flag **"REQUIRES MANUAL VERIFICATION"** and prompt a human eAccessNY lookup — **never auto-classify as revoked.** Do NOT script the eAccessNY HTML lookup.
  - **Legal checkbox before go-live:** read the Open NY Terms of Use (`77gx-ii52`) directly to confirm commercial + automated-access; register the app token.
- **CE (broker-entered, date-alerted):** new `ContinuingEducationCourse` model (provider, course_name, hours, completion_date, expiry_date, certificate_url). Alert when an agent's trailing-2-yr total < **22.5 hrs** (NY rule: 3 Fair Housing / 2.5 ethics / 2 implicit bias / 2 cultural competency / 2 agency / 1 legal updates / electives). No state CE feed exists.
- **E&O (broker-entered, date-alerted):** new Agent fields `eo_policy_number / eo_provider / eo_coverage_amount / eo_expiry / eo_premium_annual / eo_renewed_at`. Alert at `eo_expiry - 60d`. **E&O is NOT NY-mandated** (the "$500K DOS requirement" online is a myth — do not encode it); it is brokerage-tracked.
- Fold all credential health into the compliance tracker (§6.5).

### 6.5 Site-compliance tracker (improve, normalize)
Listing compliance is good (80%). Add: pre-send caption scan (§5.4), agent-credential health (§6.4) into the dashboard, and one canonical compliance health surface — **built only from real findings, never a vanity score** (§0.2).

### 6.6 Document & Template Library (NEW — broker-curated, agent-pull, versioned/canonical)
A single normalized repository agents pull from; broker owns the canonical approved version (no stale duplicates):
- **Disclosures** — DOS-2105 agency, PCDS, Fair Housing notice, FARE Act, commission-negotiability. *These become the real backing for the disclosures tracker (see §6.8) — replacing the hardcoded panel.*
- **Offering plans** — per building; **links to T3/Schedule A** (offering plan = source doc behind sponsor inventory).
- **Exclusive agreements** — listing-exclusive paperwork (ties to Mallan exclusives / acquisition).
- **Brokerage templates** — company letterhead, invoice templates, cover letters, email templates.
- Stored in existing R2 media infra; metadata = type / version / effective-date / jurisdiction. Agent pulls a template into a deal/send/listing.

### 6.7 Broker portfolio — "Money & Action Board" (NOT a standard Kanban; zero scores)
Built only from facts that have a dollar, a date, or a count, each with one next action. No health scores, no vanity metrics, no column that doesn't trace to a real row + outcome. Lanes:
- **Action needed now** — concrete blocking facts (tour request unanswered 48h · deal in offer with commission unconfirmed · doc missing for a scheduled closing · license/E&O expiring <30d), each = fact + the one action.
- **Waiting (external)** — on client / counterparty / board / lender, with how long it's been waiting + the factual next checkpoint.
- **Money in flight** — deals by closing date + real commission state (unconfirmed / confirmed / paid), in dollars.
- **This week's deadlines** — showings, lease expirations, renewal windows, CE/license/E&O dates — all from real rows.
Every card links to its source record.

### 6.8 Marketing Hub (NEW — broker/agents)
Currently ~20% (Campaign + template CRUD exist; no send logic; eBlast UI is a dead stub; market reports don't exist).
- **eBlast of exclusives** — real send backend (`POST /api/crm/campaigns/[id]/send`): recipient consent check, Fair Housing pre-send scan, CAN-SPAM footer + NY DOS §175.25 attribution + unsubscribe, queue + log every send.
- **Market reports** — builder + pre-built templates (neighborhood analysis, comp report, market trends) + scheduled delivery, every figure traced to a real data source.
- **Lead generation + management** — active lead-gen surfaced into the daily queue; referral-program tracking; the 8 existing passive intakes unified.
- **Agent tools** — client/listing tools (CMA, comps, pricing) surfaced where the agent works the loop.

### 6.9 Leads Lifecycle (improve)
Exists (~70%; pipeline stages, conversions, tasks, drips). Fixes: add `Lead.converted_at`; complete + **unify audit logging** (collapse `AuditEvent` + `ActivityLog` to one canonical source); per-lead timeline; broker portfolio view (§6.7) instead of agent-scoped only.

**6.9.1 Factual stage reason (binding — §0.2 applied to leads).** Every lead carries a traceable, factual reason for *why it sits in its current lifecycle stage* — never an unexplained position. Each stage transition records the concrete triggering event + timestamp + source (e.g., "buyer-rep agreement signed 2026-05-12", "tour requested on SL-004 2026-05-20", "no engagement 30d → nurturing", "lease signed 2026-04-01"). New `Lead.stage_reason` (current factual basis) + a stage-history relation (`LeadStageEvent`: from_stage, to_stage, reason_code, evidence_event_id, occurred_at, by). The per-lead timeline renders the chain so the broker/agent can see, for any lead, exactly what fact moved it to each stage. No stage may be set without a reason — a lead with no factual basis for its position is a defect, not a vanity row.

**6.9.2 Verified-leads plugin (Maya is building this now).** The lead-plugin intake (`POST /api/crm/leads/import`, per audit §J) accepts leads from Maya's in-development **verified-leads plugin**, carrying a `verification` payload (verifier source + method + timestamp + proof reference). Stored as `Lead.verification_source` / `verified_at` / `verification_proof_ref`, surfaced as a **factual** "Verified" badge (traces to the proof, not a vibe). Verified status sets the *initial* `stage_reason` ("imported — verified by <source> <date>"). Hard blocks still apply and are not bypassable: TCPA consent provenance (no consent → `needs_consent_capture`, automated outbound blocked), email-then-phone dedupe/merge (never silent overwrite), Fair Housing scan on imported notes, source attribution populated, `agent_id` set at import. Coordinate the plugin's payload schema with the import contract before it ships so the two are normalized from day one.

### 6.10 Signaling-page purge (flag-and-confirm — never blind delete)
- **Agent Disclosures panel** (`public/crm/js/dashboard/panels.js:908–947`) — **hardcoded** checks/X/clocks; comment says *"Placeholder — will show real data when documents are wired."* → wire to the §6.6 library + real per-deal Document status, **or delete.** Confirm with Maya first.
- **Verify** (and flag if non-factual): any "Market Insights" widget; any "Agent Performance score / ranking" (`AgentPerformanceIndex`) — remove unless the methodology is pinned in code and auditable.

---

## §7. Build sequence (search-loop ordered)

Re-anchored on the loop. Each phase clears its own gate; schema/migration/T2/T3 require explicit Maya approval + `NEON.md`.

**Phase 0 — Stabilize.** Land in-flight #295 (sale-form building/media) first; no new mess. (Maya approval per CLAUDE.md §7 for `public/crm/**`.)

**Phase 1 — Spine reality audit (DONE in part).** `docs/audits/crm-agent-search-architecture-audit-2026-05-21.md` + the 2026-05-30 broker audit are the baseline. Any new gap gets a dated audit, report-only.

**Phase 2 — Canonical registry + search core (§2).** `search-registry.json` + extend `lib/search/**`. No schema. Foundation for everything.

**Phase 3 — Agent search shell (§2.3, §2.4).** `GET /api/crm/search` + UI shell + per-agent saved searches + result→action. Reads `Listing` today (one-line swap when PR 5B lands). No schema. (Audit Lane 2.)

**Phase 4 — Money loops + send primitive (§4).** `ListingSend` model + send/share/collection + reaction tracking → daily queue. (Audit Lane 2/PR 8.)

**Phase 5 — Broker Command Center (§6).** Lead-assign/bulk-reassign, deal-form fix, credential vault (NYS sync + CE + E&O), commission confirmation, document library, Money & Action Board, Marketing Hub, lifecycle fixes, signaling-page purge. (Mostly schema — Maya approval.)

**Phase 6 — Tiered inventory (§3) — HELD, requires Maya approval.** T2 (external/StreetEasy: schema → CRM API/UI → search toggle → reverse-pin CI → share/portal) then T3 (sponsor: schema → ETL → CRM API/UI → toggle → share/portal). (Audit Lane 3.)

**Phase 7 — Live capture + freshness (§3.1).** Live-capture on detail-open + pre-send + manual refresh; "as of" stamp; sync-cadence tighten.

**Phase 8 — PR 5B reader swap — LATER.** Public reader swaps from the `Listing` display-gate column to the `ListingSearchProjection` display-gate column after W4 close + soak. (Held; Audit Lane 5.)

Lanes 1/2/4/6 (CRM hardening, agent-search shell, lead-plugin, observability) from the audit run in parallel with the above where they don't collide.

### 7.4 Validation gate (every compliance-touching commit)
Run the **full validation suite — exact commands in the `rebny-compliance` skill §7** — and confirm every check passes: type-check, the compliance/audit validators (BLOCKER+STRICT = 0, audit REGRESSIONS = 0, 0 critical), CRM smoke (172/172), and ops-health before major deploys. New tiered-inventory test suite per §3.4 + §5.

---

## §8. Execution model — parallel agents, branches, resume-journals

Each plan section is owned by one agent, on its own branch in an isolated worktree, writing a resume-journal so a freeze/shutdown is picked up exactly where it stopped. The master plan coordinates; strict file-ownership prevents collisions.

### 8.1 Resume-journal protocol (every agent)
- Append-only action log: `docs/crm-architecture/journals/<section-slug>.journal.jsonl` — one JSON line per action `{ts, step, action, files_touched, result, next}`.
- Resume pointer: `docs/crm-architecture/journals/<section-slug>.state.json` — `{branch, last_completed_step, status, blockers}`.
- On start: read state + journal, determine last completed step, resume from the next. On every meaningful action: append to journal, update state. (The Workflow tool provides this natively via run-journaling + resume; the file convention is the fallback / human-readable mirror.)

### 8.2 Section → agent → branch → file ownership (no overlap)
| Section | Agent focus | Branch | Owns (write) |
|---|---|---|---|
| §2 Registry + search core | Search spine | `feat/search-registry-core` | `search-registry.json`, `lib/search/**` |
| §2.3 Agent search shell | Agent search | `feat/agent-search-shell` | `app/api/crm/search/**`, agent-search UI panel |
| §4 Money loops + send | Loops/send | `feat/money-loops-send` | `ListingSend`, send/collection routes + UI |
| §6 Broker Command Center | **Broker section (top-notch)** | `feat/broker-command-center` | broker routes, credential vault, doc library, Money&Action board, Marketing Hub, lifecycle |
| §3 T2 external | Tier 2 (HELD) | `feat/t2-external-inventory` | `lib/external-listings/**`, `external_inventory_*` |
| §3 T3 sponsor | Tier 3 (HELD) | `feat/t3-sponsor` | `lib/sponsor/**`, sponsor schema |
| §5 Compliance firewall | Compliance | `feat/tier-firewall-tests` | reverse-pin CI tests, pre-send scans |

Each agent: read-only investigation first → TDD → run the §7.4 suite → request review → never cross its file-ownership boundary. Schema/migration/T2/T3/cron/env each stop for Maya approval.

---

## §9. Decisions captured this session (2026-05-30)

| # | Decision | Status |
|---|---|---|
| D1 | T1 search = DB-first + **live capture** on detail-open + before send/share + manual refresh; not fully-live-on-every-keystroke (config flag reserved). | ✅ Maya |
| D2 | T2 StreetEasy = **one-time Manhattan scrape → dedup against Cotality → maintenance**; residual-only stored, CRM-only, share-only, never public. | ✅ Maya — **pending** broker-of-record ToS memo (§5.7) before scraper code |
| D3 | T3 = Schedule A / sponsor via offering-plan ETL, same separation. | ✅ Maya (within existing held spec) |
| D4 | Credential vault tied to NYS via the data.ny.gov `yg7h-zjbf` dataset (license dates) + broker-entered CE/E&O; fail-closed on status. | ✅ Maya — **pending** Open NY ToS read + app-token registration |
| D5 | Broker portfolio = **Money & Action Board**, factual only, **no health scores**. | ✅ Maya |
| D6 | Build the **Document & Template Library** (disclosures, offering plans, exclusive agreements, letterhead, invoice/other templates). | ✅ Maya |
| D7 | Execution = parallel agents, per-section branches, resume-journals; Broker section gets a dedicated agent. | ✅ Maya |
| D8 | Lift the T2/T3 **planning** hold (this plan); **implementation** still gated by Maya approval + `NEON.md` per PR. | ✅ Maya |
| D9 | **Every lead carries a factual stage reason** (§6.9.1) — no unexplained lifecycle position; stage transitions record triggering event + evidence. | ✅ Maya |
| D10 | **Verified-leads plugin** (Maya building now) feeds the import contract with a verification payload + factual "Verified" badge (§6.9.2); coordinate payload schema before it ships. | ✅ Maya — plugin in development |
| D11 | **Buyer-side showing agreement** auto-populated with the working agent's name/company/own-license, sent before showings; signed → schedule; carries agreed commission; co-broker side only (§11.1). | ✅ Maya |
| D12 | **Cotality-down fallback** — flag stale, never serve silently, block send on fail (§11.2). | ✅ Maya |
| D13 | **T2 photos = link-to-source for agents, masked-like-Cotality for clients; never re-hosted** (§11.3). | ✅ Maya |
| D14 | **Address-dedup manual-review queue** for ambiguous T2 matches (§11.4). | ✅ Maya |
| D15 | **Mobile-first = agent search + own-listing price/status/description/open-house only** (§11.5). | ✅ Maya |
| D16 | **Notifications = in-CRM alert + email** (§11.6). | ✅ Maya |
| D17 | **`panels.js` modularized once, permanently** — own branch, no behavior change (§11.7). | ✅ Maya |
| D18 | **Deterministic Cotality tests** (recorded fixtures / contract tests) (§11.8). | ✅ Maya |
| D19 | **Multi-agent system built now = ready-to-hire** (§11.9). | ✅ Maya |
| D20 | Buyer-Rep rule **CONFIRMED** against the UCBA Master Copy PDF (`rev. 2026-3.30`, Maya-verified) = **Art. II §16, co-broker / buyer-side**, executed agreement before any showing. | ✅ confirmed |
| D21 | **Client Portals = first-class section** (agent `05-portals`); seller-portal content per §12.1; honest empty-states. | ✅ Maya |
| D22 | **Seller-portal pilot** (Maya's current exclusive) — **gated on SEARCH contract + FIREWALL baseline ready**, scheduled Phase 3 (NOT right after STABILIZE); punch-list §12.4. | ✅ Maya (corrected order) |
| D23 | **"Who's clicking" shown to seller is ANONYMIZED — never buyer PII** (§12.2). | ✅ Maya (compliance) |
| D24 | **Seller deal-readiness tracker**, property-type-aware (co-op stock/lease · condo/townhouse title · all: attorney/condition-report/payoff/accountant/closing-costs/proceeds) (§12.3). | ✅ Maya |
| D25 | **Owner-link flow** (`Listing.owner_client_id` + invite-owner) — needed for pilot + generally (§6.2 cousin). | ✅ Maya |
| D26 | **Comparative building traffic = factual price indicator** (§12.2): aggregate, own-surface-only, no buyer PII, honest empty-state, real numbers (not a score); feeds §4.3 price advice. | ✅ Maya |
| D27 | **Design & Workflow Standard** (§13): UI branches invoke `frontend-design` + `ui-ux-pro-max`; clear tabs, easy-to-follow workflow, one design system, mobile-first per §11.5, WCAG 2.1 AA; design-pass before "done". | ✅ Maya |
| DONE | rebny-compliance `SKILL.md §7.5` "NAR" mislabel → fixed to cite UCBA Art. II §16 (co-broker). Primary-source PDF added to `compliance/`. | ✅ done |

**Open gates before any implementation:** Phase-0 (#295) landed · per-PR Maya approval for schema/`public/crm/**`/cron/env · `NEON.md` migration discipline · StreetEasy ToS memo (D2) · Open NY ToS read (D4) · full §7.4 suite green.

---

## §10. Normalization & cleanup tasks (tracked, not optional)

10.1 **Terminology / code-identifier normalization → Cotality Live Connect.** The codebase still carries retired legacy product naming in the live-feed module, identifiers, and columns (the exact targets are enumerated **once** in the `rebny-compliance` skill §2.3). Per §0.11, new code uses **Cotality / Cotality Live Connect** naming. A dedicated normalization pass renames the legacy module to `lib/cotality-live-connect/**` plus Cotality column/field names (rename + alias map + test pins) — its own gated task: large, touches the search + live-feed surfaces, requires Maya approval + the REPO-SOURCE-OF-TRUTH-CHARTER review + `NEON.md` (column renames are migrations). Flagged, not silently performed.

10.2 **Unify the dual audit log** (`AuditEvent` + `ActivityLog` → one canonical source — §6.9).

10.3 **Restricted archive integrity.** `docs/crm-architecture/superseded/` files stay read-only + non-authoritative. If any detail must be reused, promote it into THIS plan first.

10.4 **Disclaimer text alignment.** Ensure the non-Cotality disclaimer wording uses "Cotality / REBNY feed" (never a legacy acronym) when T2/T3 implementation begins (§5.2).

---

## §11. Operational decisions & clarifications (2026-05-30, session 2)

**11.1 Buyer-side showing → auto-populated Buyer Representation Agreement (UCBA Art. II §16 — co-broker side ONLY).**
- Applies **only** when a Mallan agent acts as the **buyer's agent / co-broker**, and **only** at the **physical-showing** step. **Never** on the listing/exclusive side (the exclusive agent has no buyer-rep obligation). **Never** on search / send / share (digital sharing is ungated).
- **Flow:** buyer requests a showing → system **auto-populates the Buyer Representation Agreement** with the **working agent's** *name · company · own salesperson license #* (NOT the brokerage license #10991205323), merged from the credential vault (§6.4) into the doc-library template (§6.6) → **sent to the buyer prior to showings** → **once signed, the buyer's agent can schedule showings.**
- The agreement **states all terms, including the agreed commission** → it is the **factual source** of the buyer-side commission, feeding §6.3 commission tracking (no guessing).
- Template carries the **UCBA Art. I §17** line *"Broker commissions are not set by law and are fully negotiable."* as standard content.
- **Not a soft warning** — the executed agreement is the factual prerequisite; no appointment exists without it (fits §0.2 / §6.9.1 factual-state rule).
- ✅ **Source CONFIRMED:** validated against the **UCBA Master Copy PDF (`UCBA_Master_Copy_rev._2026_3.30.pdf`)** — Maya verified the repo transcription matches the primary source. The rule is REBNY UCBA **Art. II §16** (co-broker / buyer-side, rule E7): *"Must have executed Buyer Representation Agreement before any showing"* (E6 establishes the co-broker context). Not a guess. **Remaining cleanup:** the rebny-compliance **`SKILL.md §7.5`** mislabels this *"NAR Settlement + UCBA"* with no article cite — correct it to **"UCBA Art. II §16 (co-broker / buyer-side)"** and keep NAR separate (NAR does not bind a REBNY-only brokerage). Skill is a hold item.

**11.2 Cotality-down / rate-limit fallback (HARD).** On live-capture failure or unavailability: serve last-known data **explicitly flagged "could not verify live — may be stale,"** never silently as fresh. Rate-limit budget + circuit breaker + backoff. A failed live-capture **blocks send/share to a client** until it succeeds (fail-closed; §0.8).

**11.3 T2 external media = link, never re-host.** Do **not** copy/store StreetEasy or agent-site photos. **Agent view:** deep-link button to the source (StreetEasy / agent site). **Client view:** masked exactly like a Cotality portal listing (sanitized, private share only). Removes copyright exposure — nothing re-hosted, nothing advertised, nothing leaves the private CRM/portal.

**11.4 Address-dedup manual-review queue (T2).** "Drop if already in Cotality" relies on a strong NYC address normalizer (unit formats, building-name vs street, condo/co-op). Ambiguous matches go to a **manual-review queue** — never auto-dropped (could lose a real off-market listing), never auto-duplicated. Fail-closed.

**11.5 Mobile-first scope.** Agent login only: **(a) search, and (b) update own listings — price, status, description, open house.** Not the whole CRM; the broker command center (§6) stays desktop-first.

**11.6 Notifications = in-CRM alert + email** (license/CE/E&O expiries, lead reactions, deadlines). CAN-SPAM footer + unsubscribe on email; in-CRM alert is the primary surface. No SMS in this scope.

**11.7 `panels.js` modularize-once.** The 13,358-line `public/crm/js/dashboard/panels.js` monolith is split **once, properly** into focused per-feature modules (canonical structure, one concern per file) as a permanent foundation — own branch, **no behavior change**, proof tests. Done before/alongside the broker section so agents don't collide in the monolith. *(This is the "do it right once and permanent" item.)*

**11.8 Deterministic Cotality tests.** Health tests (§0.10) that exercise the live mapping use **recorded fixtures / contract tests** so they are deterministic and not rate-limited, while still validating the live Cotality data shape.

**11.9 Multi-agent system = ready-to-hire (intentional).** Maya is currently the only active broker; other agents are inactive (one may activate). The per-agent isolation + credential vault + lead-distribution machinery is built **now to be ready to onboard hired agents** — deliberate future-proofing, not over-engineering.

---

## §12. Client Portals + Seller-Portal Pilot (gated on SEARCH + FIREWALL)

The buyer / seller / tenant / landlord portals are a **first-class section** (own agent/branch/journal `05-portals`), not a tail of the money loops — they are the client-facing end of the event spine where clients track and react. **Honest empty-states everywhere** (§0.2): "no showings yet," never a zero that reads as broken.

**Foundation already built** (verified 2026-05-30): seller portal = 7 tabs (`app/portal/seller/page.tsx`), 72-hour hashed invite token, owner-scoped showings/offers, compliance PASS (2026-05-20 audit) — agent + buyer PII masked, address fail-closed, demand anonymized.

### 12.1 Seller portal — what the seller sees (pilot content)
| Element | Source | Status |
|---|---|---|
| Listing **price** + price history | Listing / price-history route | ✅ exists |
| **Traffic (views)** — anonymized count (§12.2) | `ListingView` / `SocialProofCache` | 🟦 counts exist; viewer view to build |
| **# of email inquiries** to the listing (count) | `Inquiry(listing_id)` | 🟦 captured in DB; count to surface |
| **# of showing requests** (count) | `Showing` requests | 🟦 incoming-request count to surface |
| **Comps** (neighborhood) + **same-building comps** for similar units + **comparative traffic** (this listing's traffic vs similar units in the building → factual **price indicator**; feeds §4.3 price-change advice) | comparables + traffic benchmark | 🟦 building-scoped comps + aggregate traffic benchmark to add |
| **Open houses** + open-house **feedback** | `Showing(type=openhouse)` + `ShowingFeedback` | 🟦 dedicated OH surface to add |
| **Showing requests** (incoming) + completed + **feedback** | `Showing` + `ShowingFeedback` | 🟦 incoming-request surface to add |
| **Offers** (if any) | `Offer` model (unify w/ legacy `ClientListingAction`) | ✅ exists (legacy path; unify per §10.2) |
| **Building info — DOB issues** (violations/permits) | NYC DOB public records (Open Data) | ❌ new — building-dossier pull |
| **Deal-readiness tracker** (§12.3) | new model | ❌ new |
| Demand / momentum / market data | caches (crons) | ✅ exists — needs cron coverage for *his* building |

### 12.2 COMPLIANCE PIN — "who's clicking" is ANONYMIZED, never buyer PII
Seller sees **aggregate counts only** — **traffic (views)**, **# of email inquiries to the listing**, **# of showing requests** — plus saves/shares and recency. The seller **NEVER** sees any buyer's name, email, phone, or identifying detail (buyers masked exactly as offers/showings already are). Exposing buyer identity to a seller = buyer-privacy + Fair Housing violation. Fail-closed: if a metric can't render without identifying a buyer, it isn't shown.

**Comparative building traffic (price indicator).** The seller can see how the listing's traffic compares to **similar units in the same building** — a factual **price signal** (markedly lower traffic than comparable units ⇒ the price is likely high). Constraints: shown as an **aggregate benchmark** ("similar 2BRs here ~X views/wk vs your Y"), **never** a named competitor unit's private numbers; only from traffic **Mallan actually observed on its own surfaces** (Mallan cannot see StreetEasy/Zillow traffic — **honest empty-state** where there's no Mallan data, never a guess); presented as the **real numbers, not a black-box score** (§0.2). This is the seller-facing input to the agent's price-change recommendation (§4.3).

### 12.3 Deal-readiness tracker (seller-side closing prep) — property-type-aware
Factual checklist (each item = real status + document/date, no vanity), varying by property type:
- **All types:** attorney engaged · **apartment/property condition report** · **mortgage payoff / close-out** · **accountant** · **closing-costs** estimate · **net proceeds** estimate
- **Co-op:** + **stock certificate & proprietary lease** located · **offering plan** · board-package readiness
- **Condo:** + **title** · offering plan
- **Townhouse:** + **title** · survey
Ties to the doc library (§6.6: offering plans, condition reports) and contacts (attorney, accountant).

### 12.4 Seller-Portal Pilot (real thin-slice test, Maya's current exclusive)
**Start gate (CORRECTED):** does NOT run right after STABILIZE. Starts **only after the SEARCH interface contract + the FIREWALL baseline are ready** (scheduled Phase 3, after AGENT + MONEY-LOOPS). Punch-list before inviting the real seller:
1. **Owner-link flow** — set `Listing.owner_client_id` (build the link-owner UI/API — the seller/landlord cousin of lead-assignment §6.2). *(Blocker)*
2. **Seller Lead account** must exist before invite (or build auto-create-on-invite). *(Blocker)*
3. **Tighten `/api/portal/seller/fomo` + `/demand` to owner-scoping** (`owner_client_id`, not agent-scoping). *(Security — required before multi-seller)*
4. **Verify data crons** populate views/demand/momentum/market for his building (else empty dashboard).
5. **Proof-first:** dry-run with a test seller → verify renders → then invite the real seller.
New content for full scope: anonymized "who's clicking," same-building comps, DOB building issues, showing-request + open-house surfaces, deal-readiness tracker.

---

## §13. Design & Workflow Standard (binding for every UI surface)

Every UI surface — agent search, broker command center, client portals, intake forms — must be **easy to follow**: the workflow should be obvious without training. Binding for the **AGENT**, **BROKER**, and **PORTALS** branches.

- **Invoke the design skills for every screen** — `frontend-design` (production-grade, distinctive, non-generic UI) + `ui-ux-pro-max` (layout, tabs, flows, components). Do **not** hand-roll a generic AI look.
- **Clear tabs + one primary action per screen.** Tabs name the *job* ("Search," "Clients," "Listings," "Showings," "Money & Action"), not internal nouns. The next step is always obvious.
- **Result → action in ≤1 click** (send / share / request-showing / add-to-CMA from a result).
- **One consistent design system** — shared components, spacing, color, type across CRM + portals. No `*-v2` UI forks (§0.4).
- **Workflow-first information architecture** — organize by what the user is *doing* (the money loop), not by data table.
- **Mobile-first where scoped** (§11.5: agent **search** + own-listing **price/status/description/open-house**).
- **Honest empty-states** (§0.2) — "no showings yet," never a broken-looking zero.
- **Accessibility WCAG 2.1 AA** (rebny-compliance requirement).
- **No signaling pages** (§0.2) — every tab/panel earns its place with real data + a real action.

Each UI branch carries an explicit **design-pass task** (design-skill review) before its surfaces are "done." The existing 13,358-line `panels.js` is modularized once (§11.7) so the design system can be applied cleanly.

---

*End of master plan — 2026-05-30. Two prior specs (WIP vision + 2026-05-21 audit) are archived RESTRICTED/read-only under `docs/crm-architecture/superseded/`. The T2 and T3 specs remain **active companion detail-specs** at `docs/superpowers/specs/`. Per-section implementation plans live in `docs/crm-architecture/branches/` (index: `docs/crm-architecture/BRANCH-INDEX.md`).*
