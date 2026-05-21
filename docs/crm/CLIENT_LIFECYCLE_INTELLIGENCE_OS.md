# Client Lifecycle Intelligence OS — Canonical Doctrine

> **Status:** CANONICAL. Doctrine only. No code, schema, env, cron, or workflow changes.
> **Owner:** Maya Allan, Principal Broker, Mallan Real Estate Inc.
> **Created:** 2026-05-21
> **Supersedes (as doctrine source):** the archived 2026-03-24 lifecycle spec and the 2026-04-27 WIP intelligence-platform working file — both retained as historical reference only (see §17 and §18).
> **Does NOT authorize:** any schema migration, API route, cron, workflow, or UI change. Implementation is gated behind a separate, future approval step.

---

## §0. TL;DR

The Client Lifecycle Intelligence OS is Mallan Real Estate Inc.'s canonical doctrine for how a CRM client moves through life-stages, how their behavior is observed, how listings and reports are matched and sent to them, and how the agent is prompted to act. It is a system of doctrine — every rule below must be referenced by any future implementation PR (schema, API, cron, UI, or doc).

This file is the **single canonical reference** for that doctrine. Schema columns, archived specs, and the WIP intelligence platform file are fragments — they may inform implementation, but they do **not** override this doctrine. Anything that conflicts with this file is wrong.

---

## §1. Governance Rule (HARD)

The Client Lifecycle Intelligence OS operates under one non-negotiable governance rule:

> **AI suggests. Agent approves. No autonomous client contact. No protected-class inference. No protected-class targeting.**

Decomposed:

1. **AI suggests.** Every signal-derived recommendation (a listing match, a quarterly-report send, a reactivation outreach, a referral CTA, a price-drop notification) is a **suggestion** to an authenticated agent. The system may compose, compute, score, rank, draft, and queue. The system may not send to a client.
2. **Agent approves.** Every outbound to a client (email, SMS, portal push, mailed packet, report delivery) requires a recorded, authenticated, per-send agent approval. Approval is per-send. Bulk approval is permitted only inside an explicit, agent-confirmed pre-certified template allow-list with a per-recipient review pass.
3. **No autonomous client contact.** No cron, scheduled job, queue worker, or AI process may write directly to a client's email inbox, SMS, or portal notification stream without a recorded agent approval upstream of the send.
4. **No protected-class inference.** The system may not infer, predict, score, or otherwise compute any value that maps to a protected class under federal Fair Housing Act, NY State Human Rights Law (Exec. Law Art. 15), NYC Human Rights Law (Title 8, Admin Code §8-107), or the NYC Fair Chance Housing Act (LL 24/2023). See §15 for the full enumerated list.
5. **No protected-class targeting.** The system may not segment, filter, route, prioritize, suppress, exclude, or order client outreach by protected class or by a proxy that correlates with protected class. The list of forbidden proxies is non-exhaustive and includes (but is not limited to): school-district selection used as familial-status proxy; religious-institution proximity used as religion proxy; named ethnic/cultural neighborhood preference used as national-origin proxy; income/source-of-income filtering used as race/disability proxy; criminal-history signals (prohibited absolutely by NYC Fair Chance Housing Act).

Rule conflict precedence: this governance rule wins over every other section of this document, every other doctrine doc, every archived spec, every schema column, every product preference, every UX intuition, and every implementation convenience. If a future implementation cannot satisfy this rule, the implementation is the thing that does not ship.

---

## §2. Client Lifecycle States

A client moves through twelve canonical states. States are **per-role**, not global (see §3). A client may simultaneously hold different states in different roles (e.g., `CLOSED_CLIENT` as a buyer, `ACTIVE_LISTING` as a seller).

| # | State | Definition | Entry trigger | Exit trigger(s) |
|---|---|---|---|---|
| 1 | `NEW_LEAD` | Inbound contact captured; no qualification step taken. | Any inquiry (form, call, referral, open house, agent-added). | Agent runs qualification step, OR 90 days of inactivity without qualification → `DORMANT`. |
| 2 | `QUALIFIED` | Intake complete: agent-confirmed needs, role(s), timeline, and consent posture (TCPA, agency disclosure if applicable). | Agent marks qualification complete. | First search/listing/deal action → `ACTIVE_SEARCH` / `ACTIVE_LISTING` / `ACTIVE_DEAL`. |
| 3 | `ACTIVE_SEARCH` | Buyer/renter/investor actively shown listings and gathering preferences. | First listing send, saved search, or active showing schedule. | Offer submitted → `ACTIVE_DEAL`. Inactivity threshold → `DORMANT`. |
| 4 | `ACTIVE_LISTING` | Seller/landlord with a live listing under Mallan representation. | Exclusive signed and listing live (RLS or Mallan-exclusive). | Accepted offer → `ACTIVE_DEAL`. Expired/withdrawn → `DORMANT` (or `POST_DEAL_NURTURE` if relationship preserved). |
| 5 | `ACTIVE_DEAL` | Offer submitted, negotiation in progress, contract not yet fully executed. | Offer recorded. | Contract executed → `UNDER_CONTRACT`. Deal dies → return to prior state or → `DORMANT`. |
| 6 | `UNDER_CONTRACT` | Contract fully executed; pre-closing or board-approval phase. | Contract execution. | Closing → `CLOSED_CLIENT`. Falls through → `DORMANT` or back to `ACTIVE_DEAL`. |
| 7 | `CLOSED_CLIENT` | Transaction closed for this role. | Closing recorded. | Eligible for post-deal nurture → `POST_DEAL_NURTURE` (default). |
| 8 | `POST_DEAL_NURTURE` | Active long-term relationship: quarterly cadence + real-time signal coverage. | Auto from `CLOSED_CLIENT` unless agent pauses. | New deal in same/another role → returns to `ACTIVE_*`. Inactivity beyond threshold → `DORMANT`. Outbound block → `ARCHIVED`. |
| 9 | `REFERRAL_SOURCE` | Past or current client who has produced at least one Mallan-attributable referral. May coexist with any other state. | First attributable referral recorded. | Tag is sticky; does not exit by inactivity. |
| 10 | `REACTIVATED` | A `DORMANT` or `POST_DEAL_NURTURE` client who has produced a fresh engagement signal (see §13) that the agent has acknowledged. | Signal threshold met AND agent acknowledges. | Active intent confirmed → `ACTIVE_*`. No follow-through within agent-defined window → return to `POST_DEAL_NURTURE` or `DORMANT`. |
| 11 | `DORMANT` | No actionable engagement; periodic, low-cadence nurture only. | Inactivity threshold reached in any state (per-state threshold defined in implementation; not in this doctrine). | Re-engagement signal → `REACTIVATED`. Explicit unsubscribe / opt-out → `ARCHIVED`. |
| 12 | `ARCHIVED` | Client has opted out, gone to another brokerage permanently, deceased, or otherwise must not be contacted. | Explicit opt-out, hard-bounce confirmation, agent-flagged, or legal-hold removal. | None. Exit from `ARCHIVED` requires explicit agent re-engagement gesture AND fresh consent. |

**Constraints:**

- A lead is **never** "closed" as a permanent terminal state. `CLOSED_CLIENT` is a per-role transactional outcome, not a relationship terminal state.
- The only relationship-terminal state is `ARCHIVED`, and re-entry requires fresh consent.
- State transitions must be recorded in an append-only history; the current state alone is insufficient. (Implementation detail; this doctrine does not specify the table.)

---

## §3. Multi-Role Client Rule

One client may simultaneously hold any subset of the following roles:

- **buyer** (sale-side, purchasing)
- **renter** (rental-side, lease-taker)
- **seller** (sale-side, listing)
- **landlord** (rental-side, listing)
- **investor** (acquisition for income/appreciation; may overlap buyer/landlord)
- **tenant** (current renter under an active lease)
- **past client** (closed at least one transaction with Mallan in any role)
- **referral source** (has produced at least one attributable referral)

**Doctrine:**

1. Lifecycle is **per-role**, not global. The current schema's global `Lead.pipeline_stage` (`prisma/schema.prisma:221`) is insufficient and must be augmented in implementation by a per-role lifecycle representation. The archived 2026-03-24 spec proposed a `ClientRole` model; this doctrine adopts the **per-role lifecycle principle** but does not adopt the archived model's schema (the schema is an implementation decision deferred to a later PR).
2. Roles accumulate, they do not replace. A seller who closes and becomes a buyer holds both `seller` (state: `CLOSED_CLIENT`) and `buyer` (state: `NEW_LEAD` or onward) simultaneously.
3. Per-role agency must be tracked separately. Under RPL §443 and 19 NYCRR §175.7, fiduciary duties (LODCAR: Loyalty, Obedience, Disclosure, Confidentiality, Accountability, Reasonable care) are owed per-client, per-transaction, per-agent. Cross-role data reuse requires explicit consent (e.g., lease-application data may not seed a buy-track search without affirmative consent).
4. The unified Client Workspace (§5) must surface every role with its own state, queue, and timeline.

---

## §4. Universal Agent Search Requirement

Search is the operational front door of the Client Lifecycle Intelligence OS. Today's CRM has a bifurcated search experience (modern `dashboard.html` has no integrated search; the legacy `index-built.html` popup carries full search behind a `window.open('/crm/search')` call — see PR #173 audit). The OS canonicalizes the search requirement as follows:

**Search must be:**

1. **Client-aware.** A search executed in a client context (from a client workspace, from a "find listings for client X" entry point) carries that client's preference graph (§7) and lifecycle state into the query so results, ranking, and explanations are tailored.
2. **Saveable.** Any agent search may be saved as a named query attached to (a) the agent, (b) zero or more clients, or (c) a market-watch profile not tied to a specific client.
3. **Sendable.** A search result set, in whole or filtered, may become a listing send (§10) to a client — subject to the governance rule (§1) and consent gates (§15).
4. **Report-capable.** A saved search may produce a market report (§9) as a one-off or on a cadence.
5. **Trackable.** Every send originating from a search must produce a measurable loop (§10): open, view, reaction, timeline write-back, preference-graph update.
6. **Compliance-gated.** Search results may not bypass the existing REBNY/Trestle distribution gates (`InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, Owner Opt-Out, Participant Only, terminal-status §2.05, Coming Soon badge — see `.claude/skills/rebny-compliance/SKILL.md` §2). Fair Housing scanning, FARE Act flags, and NY DOS §175.25 attribution must hold downstream of every search-originated artifact.

**Out of scope of this doctrine:** the specific search UI layout, field set, or routing. These are implementation decisions referenced by PR #173 architecture audit and the schema-driven search registry concept in the archived 2026-03-23 spec.

---

## §5. Client Workspace Requirement

One unified workspace per client must surface the following, all in one view, all consistent across roles:

1. **Lifecycle stage** — current per-role state(s) from §2; transition history visible on demand.
2. **Roles** — every role the client holds (§3), with per-role queue and stage.
3. **Active needs** — stated preferences (budget, neighborhoods, building types, lease/sale, timeline) for each role.
4. **Past deals** — closed transactions across roles, with property, closing date, role at the time, and any post-deal status.
5. **Saved searches** — agent or client-saved (subject to consent), with last-run, result-count, and change-since-last-run indicators.
6. **Sent listings** — full history of listings sent to this client across roles, with send date, send template, agent who approved, opened/viewed/reaction state.
7. **Sent reports** — CMAs, packets, quarterly reports, market reports (§9), with delivery state, opens, section-click depth.
8. **Portal activity** — every portal session and event (logins, views, saves, hides, reaction inputs, showing requests, feedback submissions).
9. **Communications** — email/SMS/call/voicemail/portal-message log, with direction and recorded consent posture at time of send.
10. **Showings** — past, scheduled, and proposed; with feedback captured (`ShowingFeedback`).
11. **Offers / deals** — per role, with status and document trail.
12. **Compliance status** — TCPA consent state, agency disclosure status per active transaction, Fair Housing scan history on agent-composed personal notes, FARE Act flags on rental work, DSAR/SHIELD posture, do-not-contact flags, hard bounces, opt-outs.
13. **Timeline** — see §6.
14. **Preference graph** — see §7.
15. **Next-best-action queue** — see §14.

The workspace must be the single canonical entry point for working with a client. Federating data from existing portal endpoints into the workspace must respect cross-client confidentiality (REBNY Art. III §2): a client workspace must not expose data belonging to another client (e.g., another seller's demand metrics) — see PR #174 findings B1–B5.

---

## §6. Client Timeline Requirement

A unified, append-only, two-sided timeline per client. Every entry carries:

- **Source side** (one of): `agent_action`, `client_action`, `system_signal`, `ai_suggestion`, `agent_approval`, `agent_rejection`, `compliance_event`.
- **Actor** (agent ID, client ID, or `system`).
- **Subject** (lifecycle event, listing send, report send, portal session, signal computation, etc.).
- **Timestamp.**
- **Context** (deal/role/listing/report references where applicable).
- **Audit linkage** (every entry that produces a side effect must link to its `AuditEvent` row).

**Visual rule (UI):** agent actions left-aligned, client actions right-aligned, system signals and AI suggestions inline-marked. Approvals/rejections must visually thread to the suggestion they responded to.

**Doctrine:**

1. The timeline is append-only. Edits/redactions require an `AuditEvent` of their own.
2. The timeline must show AI suggestions even when rejected by the agent — to preserve evidence of the human override that the governance rule (§1) demands.
3. The timeline must show every compliance gate decision (Fair Housing flag, TCPA gate, Owner Opt-Out exclusion) so the agent has a defensible record.
4. Timeline retention follows the NY SHIELD Act + audit retention windows defined in `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`.

---

## §7. Preference Graph Requirement

A client's preferences are represented as a graph combining two layers:

**Layer A — Stated preferences.** Captured explicitly: intake forms, lease/board applications (with consent for re-use), search criteria the client entered themselves, conversations the agent recorded.

**Layer B — Behavioral signals.** Inferred from observed engagement on Mallan surfaces only (see §10 + §11): listings opened, listings saved, listings hidden, time-on-listing, repeat-views, reactions, showing requests, report-section clicks, search alerts opened, portal session frequency. Behavioral signals are confidence-weighted and time-decayed (decay periods are an implementation detail; this doctrine does not fix the half-lives).

**Allow-list of permissible inference axes:**

- Price band (stated or revealed)
- Bedroom / bathroom count
- Listing type (condo / co-op / rental / townhouse / sponsor)
- Building type / age
- Geographic neighborhood (as a pure geographic boundary)
- Amenity preference (doorman, gym, parking — pure feature)
- Outdoor / view / floor preference
- Lease term, furnished/unfurnished, pet preference (rental)
- Investment metric preference (cap rate, GRM — investor role)

**Hard deny-list of inference axes (non-exhaustive):**

- Race, color, national origin, ethnicity, citizenship status, immigration status
- Religion, religious-institution proximity
- Sex, gender identity, sexual orientation
- Familial status, household composition, presence of children
- Age (except as a permitted derived attribute, e.g., 55+ housing only when the listing is legally so designated)
- Disability, source of income, military status, marital status
- Lawful occupation, partnership status, caregiver status
- Domestic-violence victim status
- Criminal history (NYC Fair Chance Housing Act — absolute prohibition)
- School-district preference used as familial-status proxy
- "Family-friendly," "ethnic neighborhood," "religious community," "quiet area," or any equivalent natural-language inference target

**Doctrine:**

1. Inference is by allow-list, never by deny-list. If an axis is not in the allow-list, it may not be inferred or scored.
2. The preference graph must record the source of each preference (stated vs. behavioral) and the confidence level. Low-confidence inferences must be gated from autonomous use even where autonomy is permitted.
3. The graph is the input to the Listing Match Engine (§8) and the Quarterly Report Engine (§12).
4. Re-use of cross-role data (lease-application income to seed a buyer search; landlord-side confidential info to inform a tenant outreach) requires explicit per-purpose consent. The information firewall is real.

---

## §8. Listing Match Engine Requirement

The Listing Match Engine matches available listings to clients using the preference graph (§7), with **explainable** match output.

**Doctrine:**

1. Every match must carry a human-readable explanation of which preference axes produced the match and at what confidence. "Matched because: 1BR in your saved neighborhood (stated), price within $50K of your last saved-search ceiling (stated), repeat behavior on similar floor plan (behavioral, confidence 0.62)."
2. Matches must respect REBNY distribution gates. Owner Opt-Out, Participant Only, and terminal-status listings must be excluded before they enter match candidates. Coming Soon listings may surface but only with the required badge and no showing references.
3. Matches must respect the deny-list in §7. A match that requires a deny-list axis is not a match.
4. Matches do not auto-send. Matches enter the Next-Best-Action queue (§14) as suggestions for agent review.
5. Cross-side discovery (§3) — a tenant's preferences matching a sponsor unit launch in the neighbor building — is permitted but must respect both sides' active agency relationships and confidentiality.

---

## §9. Report Builder Requirement

The Report Builder produces the following canonical artifacts. Each is a defined product, not an ad-hoc PDF.

| # | Report | Audience role | Typical cadence | Required compliance footers |
|---|---|---|---|---|
| 1 | **CMA** (Comparative Market Analysis) | seller, landlord, investor | one-off, pre-listing | NY DOS §175.25 attribution; IDX attribution + statistical disclaimer; UCBA Art. I §17 commission negotiability if commission is referenced; Fair Housing scan on any narrative |
| 2 | **Buyer Packet** | buyer | one-off, by stage | NY DOS §175.25; IDX attribution; FARE Act not applicable; agency-disclosure status if pre-conversion |
| 3 | **Renter Packet** | renter | one-off, by stage | NY DOS §175.25; IDX attribution; FARE Act applicability statement when fees are referenced |
| 4 | **Seller Report** (post-listing-launch + recurring) | seller | weekly during active, then milestone | NY DOS §175.25; IDX attribution; UCBA Art. I §17; cross-client confidentiality (no other clients' data) |
| 5 | **Landlord Report** | landlord | weekly during active, then quarterly | NY DOS §175.25; FARE Act fee disclosure; rent-stabilization status if applicable |
| 6 | **Investor Report** | investor | quarterly | NY DOS §175.25; IDX attribution; LL97 carbon-risk band where applicable; tax-abatement countdown where applicable |
| 7 | **Market Report** | any role | quarterly or on-demand | IDX attribution; statistical disclaimer; no protected-class commentary |
| 8 | **Quarterly Post-Deal Report** | buyer/owner, renter, seller, landlord, investor (5 distinct templates) | quarterly from `CLOSED_CLIENT` entry | See §12 + §15 |
| 9 | **Referral / Reactivation Report** | past client, dormant client, referral source | event-driven (signal in §13) | NY DOS §175.25; TCPA consent posture; CAN-SPAM unsubscribe + physical address |

**Doctrine:**

1. Every report is templated. Templates are version-controlled and reviewed.
2. Every report send goes through the same approval gate (§1, §14).
3. Every report must respect the deny-list in §7 — no protected-class commentary in narratives, no protected-class proxies in selection logic.
4. Every report carries a delivery footer with brokerage attribution (Mallan Real Estate Inc., 400 East 90th Street Suite 17C, NY 10128, 646-258-4460, NY broker license #10991205323), per 19 NYCRR §175.25.
5. Every email-delivered report must carry an unsubscribe link and physical address (CAN-SPAM 15 USC §7704).

---

## §10. Listing Send / Share / Track Requirement

Every listing sent to a client must produce a measurable loop:

```
agent composes / system suggests
  → agent approves (per-send, per §1)
  → compliance pre-flight (Fair Housing scan on personal notes, TCPA consent, agency disclosure, REBNY gates)
  → send transport (email / SMS / portal push)
  → client opens (event recorded)
  → client views (event recorded with dwell time)
  → client reacts (saved / hidden / liked / disliked / showing-requested / comment)
  → CRM logs (typed event, AuditEvent linkage)
  → timeline updates (§6)
  → preference graph updates (§7)
  → Next-Best-Action queue may produce a suggestion (§14)
```

**Doctrine:**

1. **No send without approval.** The current `app/api/crm/listing-sends/route.ts` path is the focal route and must be aligned with the governance rule before any OS-scale send volume is permitted. PR #174 finding C6 (`personalNote` bypasses Fair Housing scan) is a blocker for this section.
2. **No send without consent.** TCPA positive consent (47 CFR 64.1200(f)(8)) is mandatory for SMS and required for first-contact email solicitation depending on context. CAN-SPAM requirements apply to every commercial email.
3. **Every send is logged.** The send, every open, every view, every reaction must produce an event linked to the client and the originating approval.
4. **Send transport is fail-closed.** If transport is unavailable or `ListingSend` (master plan PR 8) is not implemented, the OS may not silently degrade — the send must be queued and surfaced as a deferred action, never autonomously retried into the void or dropped.
5. **Cross-client confidentiality holds.** A listing send to client A may not embed analytics from client B (e.g., "12 other Mallan clients viewed this"). PR #174 findings B1–B5 are blockers for any cross-client signal aggregation in send payloads.

---

## §11. Client Portal Feedback Loop Requirement

The client portal is the in-bound counterpart to §10. Every observable client action on a Mallan-owned surface (mallan.nyc, client portal, branded report links) must feed back to the CRM intelligence.

**Permitted client actions (allow-list):**

- View a listing
- Like / save a listing
- Dislike / hide a listing
- Save a search
- Comment / send a note on a listing
- Request a showing
- Open a report
- Click a report section (valuation, rental trend, comp set, referral CTA, contact, neighborhood profile, building dossier)
- Submit feedback after a showing
- Update stated preferences
- Update communication preferences (channel, frequency, opt-out)

**Doctrine:**

1. Every action produces a typed event written to a single event spine (implementation detail), with: action type, target (listing / report / search / preference), timestamp, session, device class, consent posture at action time.
2. Events feed (a) the timeline (§6), (b) the preference graph (§7), (c) the signal engine (§13), and (d) the next-best-action queue (§14).
3. Mallan only observes engagement on Mallan-owned surfaces. The OS may not represent off-Mallan engagement (StreetEasy, Zillow, Compass, etc.) as Mallan-observed. Where data is absent, the OS reflects absence honestly.
4. Portal data is gated by ownership: a client portal session reveals only that client's data. Routes that aggregate cross-client data (PR #174 §B) must be remediated before the OS uses portal-side aggregates in a client-facing surface.
5. Agent PII masking holds on every portal view: buyer/tenant portals show "Mallan Real Estate Inc." not individual agent contact details, per existing portal DTO tiers (`lib/compliance/dto.ts`).

---

## §12. Post-Deal Quarterly Report Engine

When a client transitions to `CLOSED_CLIENT` in any role, the client must auto-enter `POST_DEAL_NURTURE` unless the agent explicitly pauses (`nurture_paused = true`, existing column at `prisma/schema.prisma:336`).

**Baseline cadence:** **quarterly.** Implementation may add finer-grained cadences (e.g., 6-month, annual) for specific roles or sub-cases, but quarterly is the floor.

**Role-specific quarterly report templates (the 5 canonical templates referenced in §9 row 8):**

1. **Buyer / Owner quarterly:** estimated home value (AVM + comps), neighborhood market summary, building-specific signals (sales velocity, ACRIS activity in building, LL97 risk band updates, tax-abatement countdown if applicable), refinance/equity narrative, referral CTA, contact CTA.
2. **Renter quarterly:** lease-renewal window outlook (if within window), neighborhood rental trends, comparable rentals in their building/line, rent-vs-buy outlook (if budget-qualified), referral CTA, contact CTA.
3. **Seller (post-sale) quarterly:** market-segment continuity for the property they sold (helps them recommend Mallan), neighborhood and building activity, referral CTA, contact CTA. **No data on the new owner.**
4. **Landlord quarterly:** rental market trend for their unit type and neighborhood, vacancy-rate outlook, rent-stabilization regulatory updates if applicable, capex/LL97 outlook for their building, referral CTA, contact CTA.
5. **Investor quarterly:** portfolio-level rollup if multiple holdings; per-property cap-rate and GRM benchmarking vs. market; new-development supply pipeline in their target neighborhoods; tax-abatement schedule per property; LL97 risk per property; referral CTA, contact CTA.

**Doctrine:**

1. Every quarterly send goes through the §1 governance rule. Quarterly is the cadence; approval is per-send and per-agent.
2. Every quarterly send is logged as a typed event tied to the client, the role, the quarter, the report template version, the approving agent, and the AuditEvent.
3. Section-level click events on quarterly reports are first-class signals (§13).
4. Quarterly reports must respect every compliance gate in §15.
5. A paused client (`nurture_paused = true`) does not receive quarterly reports until un-paused. The reason for pause should be recorded in the timeline.

**Quarterly report purpose:**

- Stay top of mind.
- Provide useful market intelligence.
- Trigger referrals (referral-source role transition path).
- Detect re-engagement (signal to surface in §14).
- Surface life-cycle changes that may indicate a new transaction window.
- Bring past clients back **before** another broker does.

---

## §13. Real-Time Responsiveness

Quarterly cadence is the baseline. The OS must also react to real-time signals between quarterly cycles. The following signals are first-class and must be observable by the signal engine:

1. **Report opened multiple times** (same recipient, same quarter) — momentum signal.
2. **Clicked valuation section** — interest in current home value; potential seller signal.
3. **Clicked rental-trend section** — potential mover or investor signal.
4. **Clicked referral CTA** — potential referral source; advance to `REFERRAL_SOURCE`.
5. **Went quiet** — engagement dropped below client-specific baseline; surface for re-engagement decision.
6. **Re-engaged** — engagement returned after `DORMANT` or quiet period; transition consideration to `REACTIVATED`.
7. **Price-drop reaction** — client reacted to a price-drop notification (open, save, showing request).
8. **Major neighborhood / building movement** — large change in sales velocity, new development launching, LL97 reclassification, board policy change; alert relevant clients.
9. **Lease renewal window** — for tenants and landlords; surface 180 / 90 / 60 / 30 days before lease end.
10. **Closing / purchase / sale anniversary** — Year-1, Year-3, Year-5 milestones from a closed transaction; reactivation opportunity.
11. **Referral interaction** — a Mallan client introduces a contact; the contact must be captured as a new `NEW_LEAD` with referral attribution back to the source client.

**Doctrine:**

1. Signals are computed by the signal engine (implementation deferred). They write to a projection consumed by the next-best-action queue (§14). They do not autonomously trigger client outreach.
2. Signals must respect the deny-list (§7). A signal that requires a protected-class inference is not a signal.
3. Signals must respect cross-client confidentiality. A signal about "12 buyers like you also viewed this listing" must not embed identifying data and must not be derived from confidential information owed to another client.
4. Signal retention follows the SHIELD Act and audit retention windows.

---

## §14. Next-Best-Action Queue

Suggestions from the signal engine (§13), listing match engine (§8), and report engine (§9, §12) enter a per-agent Next-Best-Action (NBA) queue.

**Doctrine:**

1. Every NBA suggestion is explainable. The queue surface must show: which signal(s) produced the suggestion, which preference axes were involved, what action is proposed, what client(s) are involved, what compliance gates apply.
2. Every NBA is auditable. The suggestion itself, the agent's decision (approve / reject / defer), the reason for rejection (free text or coded), and the downstream action (if approved) all generate `AuditEvent` rows.
3. Agent approval is **per-action**. The system may not bundle approvals across clients. A "send quarterly to all buyer/owner clients this Friday" path may exist as a batch UX, but each row in the batch is an individual approval with the agent able to review the per-recipient send before approving.
4. Bulk reject is permitted; bulk approve requires per-row visibility and is recorded as such in the audit.
5. The NBA queue is the canonical entry surface for daily agent work derived from the OS. It does not replace the agent's manual workflow — it augments it.
6. A rejected NBA is not deleted. It remains visible in the timeline as evidence of the human-override mandate (§1).

---

## §15. Compliance Requirements (Preserved and Enforced)

The Client Lifecycle Intelligence OS sits on top of, and must preserve, every existing compliance rule. The list below is the canonical compliance surface for the OS; it does not replace the canonical compliance index (`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`) — it points to it.

| Area | Rule source | OS obligation |
|---|---|---|
| **REBNY / RLS / IDX Plus / Trestle / Cotality** | UCBA 2026; Trestle Web API terms; `.claude/skills/rebny-compliance/SKILL.md` §2 | Honor all six distribution gates (Owner Opt-Out, Participant Only, `InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, terminal-status §2.05, Coming Soon badge). IDX attribution + statistical disclaimer on every IDX-sourced display in any OS artifact. |
| **NYC / NYS real-estate law** | RPL §443; 19 NYCRR §175.7; NY DOS §175.25 advertising; §175.28 anti-discrimination notice; §175.12 personal-interest disclosure | Per-role agency relationship tracking; LODCAR fidelity per current client; brokerage attribution on every outbound (Mallan Real Estate Inc., office address or phone, license type). |
| **Fair Housing — Federal** | Fair Housing Act 42 USC §3601 et seq. | Allow-list inference (§7); language scan on every agent-composed narrative; HUD 2024 AI guidance considered for any model influencing housing consequence. |
| **Fair Housing — NY State** | NYSHRL Exec. Law Art. 15 | Adds: age, marital status, military status, sexual orientation, gender identity, lawful source of income, domestic violence victim status. |
| **Fair Housing — NYC** | NYCHRL Title 8, Admin Code §8-107 | Adds: citizenship, partnership, caregiver, immigration status, lawful occupation. |
| **Fair Chance Housing Act** | NYC LL 24/2023 | Criminal history may not be inquired about or considered. Absolute prohibition. |
| **FARE Act** | NYC LL 119/2024 (effective 2025-06-11) | Tenant cannot be required to pay broker fee unless tenant engaged the broker. Rental sends and reports must surface required fee fields and disclosures. Litigation pending at 2nd Circuit; law remains enforceable. |
| **TCPA** | 47 CFR 64.1200(f)(8) positive consent | Recorded, dated, methodologically defensible consent for SMS and certain email outreach. `consent_captured_at` gating on every send path. Stale consent (>1yr in many contexts) is treated as absent. |
| **CAN-SPAM** | 15 USC §7704 | Every commercial email outbound carries clear identification, a functioning unsubscribe link, and the brokerage physical address. Honor unsubscribe within statutory window. |
| **NY SHIELD Act** | NY GBL §899-aa, §899-bb | Reasonable safeguards for "private information." Retention windows defined; signal data does not persist beyond legitimate business need. Breach notification posture preserved. |
| **Audit logs** | Internal + UCBA + SHIELD evidentiary posture | Every state transition, send approval/rejection, signal-derived suggestion, compliance-gate decision, and consent change writes an `AuditEvent` via `lib/auth/middleware.ts:182` (`logAuditEvent`). |
| **Agent ownership isolation** | UCBA Art. III §2 (confidentiality); per-team agency | An agent may not see another agent's clients' confidential data without an authorized supervisory relationship. The Client Workspace honors agent ownership. |
| **Client privacy** | SHIELD + REBNY confidentiality | Within-OS aggregates do not leak across clients. Cross-client analytics (e.g., "demand" surfaces) are scoped to non-confidential, non-identifying signal classes only. |
| **Portal masking** | UCBA Art. III §2; existing DTO tiers | Buyer/tenant portals show brokerage attribution, never individual agent PII. Existing `sanitizeForPortal` (`lib/compliance/dto.ts:261`) is the canonical sanitizer. |
| **Consent gates** | TCPA + REBNY agency disclosure + NY SHIELD | Every outbound channel respects: TCPA consent posture; agency disclosure status before any customer→client conversion act; data-reuse consent for cross-role data. |
| **Rate limits** | Internal anti-abuse; carrier policy (SMS); ESP policy (email) | Per-agent, per-client, per-channel rate limits enforced upstream of send. Bulk operations rate-limited regardless of agent approval. |

Any new compliance regulation (e.g., Co-op Application Timeline Law 2026-07-28, HUD AI guidance updates, Colorado AI Act 2026-06-30 to the extent it touches Mallan AI use) is added to this table as it lands, not retro-engineered into the source code first.

---

## §16. Cross-References

This doctrine sits on top of, and depends on, the following canonical artifacts. Where this doctrine and one of the artifacts disagree, this doctrine wins for OS questions; the artifact wins for its own domain.

| Reference | What it provides | Authority |
|---|---|---|
| `CLAUDE.md` | Project doctrine, holds, validation chain | Canonical |
| `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` | Per-area canonical compliance pointers | Canonical (compliance) |
| `.claude/skills/rebny-compliance/SKILL.md` | REBNY UCBA + Trestle + Fair Housing + FARE Act detailed rules | Canonical (REBNY) |
| `NEON.md` | Database doctrine | Canonical (DB) |
| `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` | File-location and parallel-file prohibition | Canonical (repo) |
| `memory/REFACTOR-2026-04-25.md` | Master 10-PR refactor plan (PR 5B reader swap held; PR 8 `ListingSend` not started) | Canonical (backend roadmap) |
| `docs/audits/crm-agent-search-architecture-audit-2026-05-21.md` (PR #173, merged at `1190c88e`) | Canonical CRM + agent-search architecture audit; 3-tier inventory model; 25 compliance constraints; 34-PR sequence | **Canonical CRM architecture baseline.** This OS doctrine is the lifecycle/intelligence overlay sitting on top of the architecture this audit describes. |
| `docs/audits/search-reports-backbone-failure-audit-2026-05-21.md` (PR #174, OPEN at head `55e8f2fb`) | Canonical failure-reproduction audit of search + reports backbone; 15 BLOCKER + 12 STRICT findings; 5-lane PR sequence | **Canonical failure baseline.** The blockers cataloged in this audit must be remediated before OS modules reuse the affected routes. PR #174 is not merged at the time of this doctrine's creation. |
| `docs/superpowers/specs/_archived-2026-04-27/2026-03-24-client-lifecycle-system.md` | Archived lifecycle spec (proposed `ClientRole` model, per-role pipelines, "client never closes" principle) | **Historical reference only.** See §17, §18. |
| `docs/superpowers/specs/_archived-2026-04-27/2026-03-25-buyer-engagement-system-design.md` | Archived buyer/tenant engagement spec (proposed `ListingView` model, tenant nurture cadence) | **Historical reference only.** See §17, §18. |
| `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md` | Working file for the broader intelligence platform vision; explicitly marked "WIP. NOT APPROVED. NOT FOR IMPLEMENTATION." | **Non-canonical / not approved.** See §17, §18. |

---

## §17. Hard Warning — Archived and WIP Material

> **Archived or WIP lifecycle docs MUST NOT be used as implementation authority unless this canonical MD adopts the specific rule.**

The following files exist in the repo and carry detailed proposals. They are **historical reference only** until and unless this canonical document (§1–§16) cites a specific rule from them by name and adopts it:

- `docs/superpowers/specs/_archived-2026-04-27/2026-03-24-client-lifecycle-system.md` — proposes `ClientRole`, transition map, "client never closes" principle. **The principles are honored in §2 and §3 of this doctrine. The schema and API surfaces in the archived spec are not adopted by this doctrine; they remain deferred implementation choices.**
- `docs/superpowers/specs/_archived-2026-04-27/2026-03-25-buyer-engagement-system-design.md` — proposes `ListingView`, tenant nurture cadence, `preferred_channel` / `preferred_device`. **The engagement-loop principle is honored in §10 and §11. The specific schema and tracking-token approach are deferred implementation choices.**
- `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md` — contains the broader vision (Approval Potential matrix, hypothesis distributions, autonomy state machine, the four NYC-specific moats, the cuts list). **Maya explicitly rejected iteration 4 of that working file and the file remains "NOT APPROVED. NOT FOR IMPLEMENTATION." Specific rules from that file may be adopted only by amending this canonical MD; no implementation may cite the WIP as authority.**

A reviewer encountering an implementation PR that cites an archived or WIP file as authority — without a corresponding rule in this canonical MD — must reject that PR and require the proposing party to first amend this MD via a doctrine-only PR.

---

## §18. Change History

| Date | Author | Change | Authority |
|---|---|---|---|
| 2026-05-21 | Maya Allan (via Claude doctrine pass) | Initial canonicalization. Sections §0–§18. | Maya approval recorded in chat: "Proceed with the smallest doc-only canonicalization step." |

---

## §19. Out-of-Scope (v1)

The following are explicitly **not** in scope for the v1 doctrine. They may be added by future amendment to this MD if and only if Maya approves. Carried forward from the 2026-04-27 WIP cuts list and from the 2026-05-21 audit findings:

- Causal inference / synthetic pricing experiments (sample size too small).
- Voice cloning for routine touches.
- zk-SNARK private off-market matchmaking.
- Real-time negotiation earpiece / live whispering.
- Per-viewer dynamic listing descriptions that rewrite themselves per reader.
- Continuous regulatory web-scraping auto-updater.
- Live daily building price index (Bloomberg-style); deferred to year-three when the dataset is dense enough.
- In-house board-package builder (Boardpackager owns; do not rebuild).
- Building requirements DB (Boardpackager owns).
- Tenant intake form at lease start (duplicates lease application).
- Approval-matrix engine that re-asks the client for financials (application/board-package process produces this; consume, don't re-ask).
- "Multi-agent swarm" as a customer-facing marketing concept.
- Autonomous post-deal nurture sends without per-send agent approval. (Hard governance violation. Not in scope ever.)

---

## §20. Open Questions Deferred to Maya

Before any implementation PR is opened against this doctrine, Maya should provide direction on each of the following. None of these is resolved in v1:

1. Per-state inactivity thresholds for `NEW_LEAD → DORMANT` and `ACTIVE_SEARCH → DORMANT`.
2. Quarterly cadence anchor: from `CLOSED_CLIENT` entry date, or from a global Mallan quarter calendar?
3. Template eligibility for the pre-certified allow-list referenced in §1.2 — i.e., which specific report/send templates qualify to flow through the allow-listed per-recipient-review path, as distinct from those that must always be agent-composed. The per-recipient review pass remains mandatory per §1 and §14 either way.
4. Per-channel preference defaults at intake (email, SMS, portal, postal).
5. `REACTIVATED` confirmation window before returning to `POST_DEAL_NURTURE` or `DORMANT`.
6. Referral attribution algorithm (single-source vs. multi-touch; commission split semantics).
7. Cross-side discovery (§3, §8) — agent disclosure cadence when matching a tenant to a sponsor-unit in the building they currently rent in.
8. Signal-decay half-lives for each axis in §7 Layer B.
9. Bulk-approve UX threshold (e.g., max recipients in a single approval session) for quarterly batches.
10. Data-reuse consent UX wording for cross-role re-use of lease-application data.

These are documented here so they are not silently decided by an implementer. They are deferred until Maya answers.

---

## §21. Codex Findings Table (Carried Forward From 2026-05-21 Audit)

The following findings from the 2026-05-21 lifecycle audit (P0-1) are carried forward and remain open. Implementation PRs that touch any of these surfaces must reference the corresponding finding number and demonstrate remediation or explicit deferral.

| # | Finding | File:Line | Severity | Status (2026-05-21) |
|---|---|---|---|---|
| C1 | Lifecycle direction was non-canonical — fullest articulation was in a "NOT FOR IMPLEMENTATION" file. | `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md:3` | P1 | **Addressed by this doctrine (§17, §18).** WIP retained as historical reference. |
| C2 | `Lead.pipeline_stage` is GLOBAL — collapses multi-role clients. | `prisma/schema.prisma:221` | P1 | Doctrine §3 establishes per-role requirement. Implementation deferred. |
| C3 | `LifecycleTrigger.trigger_type` declares `ghost_detected` + `momentum_drop` with no producer code. | `prisma/schema.prisma:1858` | P2 | Doctrine §13 enumerates the real-time signals; producer implementation deferred. |
| C4 | `Campaign.campaign_type` declares `reactivation` + `renewal` with no cron consumer. | `prisma/schema.prisma:2064` | P2 | Doctrine §12 + §13 establish quarterly + real-time requirements; consumer implementation deferred. |
| C5 | Archived spec defines `ClientRole`, never migrated. | `docs/superpowers/specs/_archived-2026-04-27/2026-03-24-client-lifecycle-system.md:42` | P2 | Doctrine §3 adopts the per-role principle but does not adopt the schema. Implementation deferred. |
| C6 | `personalNote` bypasses Fair Housing scan — quarterly-report module would inherit. | `app/api/crm/listing-sends/route.ts:211` | P0 | **Blocker for §10 and §12.** Remediation tracked in PR #174 audit. |
| C7 | Five portal routes leak cross-client data — lifecycle dashboard would inherit. | `app/api/portal/{seller/fomo,seller/demand,marketing,comparables,price-history}/route.ts` | P0 | **Blocker for §5 and §10.** Remediation tracked in PR #174 audit. |
| C8 | `search-alerts` cron has no TCPA consent gate — quarterly-report cron would need same gate. | `app/api/cron/search-alerts/route.ts` | P0 | **Blocker for §10 and §12.** Remediation tracked in PR #174 audit. |
| C9 | `ListingSend` model not started (master plan PR 8). | `prisma/schema.prisma` (absent) | P1 | **Blocker for §10 send transport.** Tracked in master plan. |
| C10 | No NBA queue table / route / UI exists. | filesystem absent | P1 | Doctrine §14 establishes the requirement; implementation deferred. |
| C11 | No signal projection table — signals fragmented across 6+ models with no composer. | `BuyerIntentProfile, DemandSignal, DemandIndex, DemandAlert, ClientListingAction, PortalEvent, ShowingFeedback, ClientPreference, ActiveLease` | P1 | Doctrine §13 establishes the signal engine requirement; implementation deferred. |
| C12 | No closing/purchase anniversary signal materialized. | `Deal.closed_at` (column exists, no projection) | P2 | Doctrine §13 item 10 establishes the requirement; implementation deferred. |
| C13 | No referral-source attribution on Lead. | `prisma/schema.prisma` (column absent) | P2 | Doctrine §2 (`REFERRAL_SOURCE`), §13 item 11 establish the requirement; implementation deferred. |
| C14 | `nurture_paused` exists but no autonomy state column. | `prisma/schema.prisma:336` (existing) + absent autonomy_state | P2 | Doctrine §1 + §14 establish the per-send approval requirement; implementation may choose `nurture_paused` granularity or add an enum. Deferred. |
| C15 | Doc gap: no `docs/crm/` directory existed. | filesystem absent | P3 | **Addressed by this doctrine.** This file lives at `docs/crm/CLIENT_LIFECYCLE_INTELLIGENCE_OS.md`. |

---

## §22. Hard Holds Confirmed (At Time Of Writing)

This canonical doctrine was produced under the following holds. None of these were touched by this MD's creation:

- PR 5B reader swap (`refactor/05-listing-search-projection`) — **HELD**, not touched.
- `/api/listings` reader — **NOT TOUCHED**.
- `ListingSearchProjection` reader — **NOT TOUCHED**.
- Environment variables — **NOT TOUCHED**.
- Neon settings — **NOT TOUCHED**.
- Prisma schema / migrations — **NOT TOUCHED** (read for citation only).
- Cron / jobs / triggers — **NOT TOUCHED**.
- `.github/workflows/**` — **NOT TOUCHED**.
- Agents / skills / Sentinel — **NOT TOUCHED**.
- Admin merge bypass — **NOT USED**.
- PR #174 (search + reports backbone failure audit, head `55e8f2fb`) — **NOT MERGED** (still awaiting Maya approval).
- T2 external-inventory / T3 sponsor inventory — **NOT TOUCHED**.
- Master plan PR 8 (`ListingSend`) — **NOT STARTED**.
- CRM frontend (`public/crm/**`) — **NOT TOUCHED**.

---

*End of canonical doctrine. Amendments to this file must be doctrine-only PRs reviewed by Maya. No implementation may cite this document as authority for a rule not stated explicitly in §1–§22.*
