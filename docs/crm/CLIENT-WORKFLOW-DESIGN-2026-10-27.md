# Mallan CRM — working with clients: design proposal (2026-10-27)

**Status: proposal for Maya's decision. Not authority.** `MALLAN-PLATFORM-MASTER-PLAN.md` governs; where this document and the Master differ, the Master wins, and nothing here is built until the decisions in §10 are recorded in the Master or the Execution State.

Sources: the RealPlus (All Access NYC) and Follow Up Boss walkthroughs of 2026-10-27 (local inventory in the operations workspace, `.playwright-mcp/realplus-2026-10-27/INVENTORY.md`), the Master (§1, §5, §13, §14, §15, §22.7, §23.4), the code census of the same day, and Maya's statements: "they all seem to be falling short… and the search has to be perfect"; "it does not separate from buyer, seller, landlord and tenant"; landlords who leased their listings should get a property value six months before the lease ends; tenants should get a rent-vs-buy report to convert them to buyers; "my information for [a client] should have the ability to update and change… not static".

## 1. Why the two products fall short, in one line each
- RealPlus: a search product with a contact card bolted on. Customer = name, phones, emails, alert settings, a portfolio of picked / liked / shown listings and a saved-search list. No role, no stage, no timeline, no tasks, no deals, no lease dates, no valuation workflow.
- Follow Up Boss: an engagement product with no listings. One person record, one stage ladder for everyone (Lead → Attempted Contact → … → Closed), tags, a timeline of calls / texts / emails, tasks, deals with commission, automations. It does not know buyer from landlord, has no lease, no property value, no rent-vs-buy, and sees "views" only through partner feeds and a pixel on the agent's own site.
- Mallan today: the pieces of both exist (roles on the client record, a tenancy record, saved searches reconciled to live Cotality, a lifecycle engine, a client portal, CMA and calculators) but they are not one workflow: the search was losing its own criteria (fixed today), the landlord valuation and the rent-vs-buy report are not produced or sent, logins are not recorded, and the client list is one list.

## 2. Principles the design is held to
1. **Search criteria are business data.** A saved search is a record; the form is an editor for it; a reload, a rerun, a refinement and an alert all execute the record or a validated edit of it, never a re-read of hidden controls. Anything the build cannot execute exactly is reported, never dropped (done 2026-10-27; see the acceptance report).
2. **Live Cotality is the only listing truth.** Every count, listing and status a client sees comes from a live query; nothing is cached as truth; Engine B (the projection) only powers counts and alerts for the criteria it supports, and refuses the rest.
3. **Role first.** A client is one Party with one or more role relationships (Buyer, Seller, Landlord, Tenant, Investor), each with its own stage, criteria, documents and reports (Master §1). A landlord who buys again is the same Party with a new Buyer relationship, never a second contact.
4. **Signals, then Agent review, then client contact.** Automation raises a dated signal and prepares the material; a client-facing send happens only where Maya has recorded that it may (Master §22.7.2, §5.12).
5. **Evidence on the face of every client number.** Sourced fact, deterministic calculation, system analysis, agent assumption, agent conclusion (Master §6.11); projections labelled as projections.
6. **Everything the client does on Mallan is first-party.** Logins, searches, views, saves, shares, reactions, replies are written to the client's timeline by Mallan itself, not inferred from a pixel.

## 3. The client model
```text
Party (person or entity) ── identity, contacts, consent, attorney, co-parties
  ├── Buyer relationship      stage · criteria (saved searches) · budget / pre-approval · timeline · portfolio · offers · closing
  ├── Seller relationship     stage · property · valuation / CMA · listing episode · showings · offers · contract · closing
  ├── Landlord relationship   stage · property/unit · tenancy (link) · rent strategy · hold-v-sell analysis · relist
  ├── Tenant relationship     stage · criteria · documents · tenancy (link) · renewal / relocate / buy
  └── Investor relationship   stage · portfolio · 1031 timing · acquisition criteria
Tenancy ── Landlord Party ↔ Tenant Party ↔ Unit ↔ term (start, end, rent, renewal state) — one record, read by both sides
Timeline ── every touch and event, per Party, filterable by relationship
```
Schema today: `Lead.roles[]`, `pipeline_stage`, `ActiveLease`, `LeadParty`, `SavedSearch.lead_id`, `PortalEvent`, `ListingView`, `IntentEvent`, `ClientListingAction`, `FollowUpTask`, `Deal`, `CmaReport`, `LifecycleTrigger`. The gap is not storage; it is one stage field for all roles, one list for all roles, tenancies entered by hand (and duplicated), and events that are not written.

Stages are per role, not one ladder. Proposed defaults (Maya decides the words): Buyer — New · Qualified · Searching · Showing · Offer · In Contract · Closed · Past; Seller — Inquiry · Valuation · Listing agreement · Active · In Contract · Closed · Past; Landlord — Inquiry · Rent strategy · Listed · Rented (tenancy running) · Expiring · Decision (renew / re-rent / sell / buy) · Past; Tenant — New · Qualified · Searching · Application · Board · Rented (tenancy running) · Expiring · Decision (renew / relocate / buy) · Past.

## 4. Workspaces (one per role, same Party header)
- **Header (all roles):** name, co-parties, consent state, last activity (first-party), next action and due date, relationships as tabs with their stage.
- **Buyer:** criteria panel = the client's saved searches with live counts and "why it matched" per listing; portfolio (sent / viewed / liked / disliked / shown / offered) with the client's own reactions and replies; showings with feedback; offers; financing (pre-approval, target purchase range from §8); documents; timeline.
- **Seller:** the property (from the address, live Cotality building facts), valuation / CMA with provenance, listing episode (status from Cotality, showings, inquiries, matched buyer searches as counts only — Master §10.4), offers, contract milestones, closing, post-close anniversaries.
- **Landlord:** property/unit, the tenancy card (tenant name as a link, rent, term, renewal state, days to expiry), rent strategy, hold-v-sell analysis, the six-month decision review with the valuation packet ready, relist / re-rent actions, the firm-wide expiring list reachable from here.
- **Tenant:** criteria and matches like Buyer, documents and board readiness, the tenancy card (same record as the landlord's, tenant-side view only), the six-month decision review with Rent vs Buy / Cost to Become an Owner ready, renewal / relocate / buy branches.
- **Investor:** portfolio of owned units (each a Landlord relationship), acquisition criteria (a saved search), 1031 timing.
A role switch never leaves the Party; a new relationship opens on the same identity.

## 5. Search as the engine of client work
- Every client relationship that looks for property owns saved searches (today: `SavedSearch.lead_id`). They are the canonical criteria (§2 principle 1); the Buyer / Tenant workspace edits them through the same form and the same reconciliation.
- New matches, verified price changes and verified status changes flow to the agent's queue per client; the agent sends (or auto-send where the record's alert gate allows it) to the client's listing page with the reply loop; the client's reactions come back as timeline events and into the portfolio.
- The map (RealPlus pattern, Mallan's own layer): neighborhood polygons for display, subway lines and stations, school zones and free-drawn shapes as criteria; because Cotality carries no coordinates, Mallan geocodes each address once into its projection and applies shape / transit / school criteria after retrieval, reported where the scan is partial (Master §5.0). Filtering by neighborhood stays on the live `SubdivisionName`.
- Market reports per neighborhood (RealPlus parity): new, price drops, sold, contract signed, back on market, expired, from live Cotality with the same status vocabulary the search uses.

## 6. Lifecycle automation (what Maya asked for)
All of it through the existing lifecycle engine, reading the tenancy record (`ActiveLease`), not the renter's self-typed lease date:
| Checkpoint | Landlord side | Tenant side | Source of the numbers |
|---|---|---|---|
| ~6 months before expiry | valuation packet: CMA on live comps for the unit and building, sell-v-re-rent numbers, "if you are thinking of selling" | Rent vs Buy / Cost to Become an Owner: the §8 preset prefilled with the lease rent and the client's stated finances, saved as a scenario on the client | `lib/cma/engine.ts`, the §8 calculators (today's CRM rent-vs-buy calculator becomes the saved, labelled report) |
| 90 / 60 / 30 days | decision status · active planning · execution; renewal or relist actions | decision status · rental and sale options · urgency | tenancy record, saved searches |
| post-closing | 6-month and 1-year anniversaries, owner check-in, "owner may need a seller or landlord conversation" | — | §22.7 |
| quarterly | nurture report with matching listings (exists; 53 sent to date) | same | saved searches |
Each checkpoint writes a dated task on the Party and prepares the material; the send is either agent-approved from a queue in the Lease Tracker or automatic — Maya's recorded decision (§10). Stamps already exist on the tenancy record (`seller_comps_6mo_sent_at`, 90/60/30).

## 7. First-party activity (what Follow Up Boss cannot do)
Write to the Party timeline, from Mallan's own portal and emails: login (fields exist; nothing writes them today), search run, listing viewed, saved, shared, reaction, reply, showing request, document uploaded, report opened, email opened / clicked, text / call logged by the agent. Show "last activity" and "last login" on the client list and the workspace header; use them in the smart lists below. Consent and unsubscribe states gate every outbound send.

## 8. Daily work: lists and queue
- Client list with role tabs (Buyers · Sellers · Landlords · Tenants · Investors), per-role stage filter, last activity, next action, lease expiry (landlords / tenants), new matches waiting, consent.
- Smart lists (saved filters with a cadence, the Follow Up Boss idea on Mallan's data): needs contact, active this week, expiring in 180 / 90 / 60 / 30 days, new matches unsent, stale 30+ days, past clients due an anniversary.
- Today: due tasks, showings, approvals waiting (packets, reports, sends), signals raised by the engine with their evidence.
- Pipeline per role with commission and projected close (Deals exist for buyer and tenant representation; extend to seller and landlord).

## 9. Reports to clients (all live, all labelled)
Listing packets with the listing-agent contact removable; Rent vs Buy / Cost to Become an Owner; valuation / CMA with Broker Price Opinion; market activity by neighborhood; closing cost and carrying cost sheets from the §8 presets. Every number carries its provenance label; projections are labelled as projections (Master §15 holds the label vocabulary question for Maya).

## 10. Decisions Maya records before this is built
1. Whether the six-month landlord valuation and the tenant Rent vs Buy go out automatically or after agent approval in the queue (Master §22.7.2 / §5.12).
2. The stage words per role (§3) and which smart lists ship first (§8).
3. The tenancy record as the one source of lease dates, created when a Tenant Deal is approved or a rental listing is marked Rented; duplicates removed.
4. Geocoding as Mallan's layer for the map (vendor and storage), or the map limited to neighborhoods until then.
5. Whether client-facing automated sends count toward the alert gate rules already recorded for saved searches.

## 11. Build order
1. Fix the known defects: lease list API 500, Lease Tracker tenant email types, duplicate tenancies, expired-tenancy roll-over, portal logins not recorded.
2. Role tabs and per-role stages on the client list and workspace; tenancy card shared by Landlord and Tenant; the firm-wide expiring list.
3. Lifecycle checkpoints on the tenancy record with the valuation packet and the Rent vs Buy report prepared into an approval queue.
4. First-party activity events to the timeline; last activity / last login columns; smart lists.
5. Client-facing listing page reply loop joined to the portfolio; pipeline per role.
6. Map layer on Mallan geocodes; market reports.
Each step is tested in the real browser against live Cotality with before / after evidence, as the search was today.
