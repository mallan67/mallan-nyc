# ACQUISITION-001 — Buyer Acquisition Pilot (two exclusive listings)

**Directed by:** Maya, 2026-11-09 · **Status:** evidence engine only (this PR). Workspace page, storage and market scan are NOT built. The two listings' identities and facts in section 1 were read live from Cotality on 2026-11-10. · **Nothing here sends, publishes, spends or changes a listing.**

Maya's two decisions on 2026-11-09 (chat), restated on 2026-11-10 ("you already have authorization for read-only research"): the "unrelated CRM and listing feature development stays held" rule in `CLAUDE.md` §B is lifted for this project only; read-only Cotality lookups for the two listings are authorized. Neither decision is recorded in the Execution State. The lookups were run on 2026-11-10. The first version of this document said they had not been run (that session had no client secret) and that #806 had no listing record; both statements were wrong or out of date and are corrected below.

## 1. What the pilot is

A private way to find evidence of buyer demand and distribution opportunities for two of Maya's exclusive listings, and to measure real inquiries and offers, without presenting an unverified prospect as a buyer.

| Pilot property | Class | Listing identity today |
|---|---|---|
| 800 Second Avenue #806 | commercial (medical/professional office) condominium | Mallan listing `SL-0010`; Cotality record `RLS20123633` (ListingKey 1194314473). Read live from Cotality on 2026-11-10: Active, list price $1,200,000, 1,482 SF, on market since 2026-11-01, ExclusiveAgency, list office 7041. The Cotality record's own `ListingURL` is the SL-0010 page, which answers 200 and shows the same price. Cotality files the unit as Residential / Apartment / Condominium with CurrentUse MedicalDental, 8 bedrooms and 3 baths, while the SL-0010 page reads "0 bed, 2 bath": the two records disagree and need reconciling. The earlier "no listing record found" statement was wrong. |
| 333 East 46th Street #2G | residential condop (Cotality: StockCooperative) | `SL-0004` (Mallan website exclusive) and `RLS20093870` (Cotality; the same unit, list office 7041; SELLER-001 §0). Read live from Cotality on 2026-11-10: Active, list price $765,000 (original $770,000, changed 2026-06-22), 860 SF, 1 bed / 1 bath, maintenance $1,749 a month, maximum financing 80%, on market since 2026-05-28, ExclusiveAgency. The listing text says the unit is tenant-occupied with a lease to 2027-08-14 and that subletting is permitted from day one; those are the listing's own statements and have not been checked against the building's governing documents. The SL-0004 page title shows the same $765,000. |

Old figures in earlier specs (rents, cap rates, tenant status, lender assumptions, compensation) are not repeated anywhere in this work.

## 2. Audit: what already exists on `main` (static reading at `56e7bef4`; nothing was executed)

| Capability | Where | What it does | Reuse |
|---|---|---|---|
| Buyer-intent profile and recommender | `lib/buyer-intent/*`, `app/api/cron/intent-profiles` (daily 11:00, `vercel.json`) | Scores an existing CRM lead from the lead's own events; recommends Active, display-eligible listings to that lead. Scores are hand-set constants. | Direction is lead to listings, the reverse of this project. Not reused. |
| Listing campaign | `app/api/crm/listing-campaigns` (+ `/recipients`) | Modes preview, dry_run, test, live. Live is refused unless `CAMPAIGN_LIVE_SEND_ENABLED=true` and `confirmedCount` matches. Cap 250 recipients. Fair Housing scan on free text (422). Per-recipient audit events. Wired to one investor-listing email template that computes investment metrics from rent and maintenance typed by the operator. | Reuse the route for any future send. The metrics are the unverified-returns risk in section 6. |
| Distribution gate | `lib/compliance/campaign-distribution-gate.ts` | Pure. Owner opt-out, Participant Only and terminal status block every listing; the two IDX flags also block RLS-backed listings (everything except a canonical Mallan id with `rls_eligible === false`). | Reused unchanged by `lib/acquisition/report.ts`. |
| Exposure tracking | `app/api/tracking/listing-view`, `ListingView` | Token-gated: writes a view only for a lead who was already sent that listing. Anonymous visits are not recorded. | Cannot measure anonymous exposure. |
| Seller report | `lib/seller-report/*`, `/admin/seller-report/[id]` (SELLER-001 Phase 1) | Five truth levels, no viewer identity, `data_gaps`. | Truth levels reused. |
| Scanner | `lib/scanner/*` | Scores property OWNERS (sellers) from public records, with a suppression list, a NY DOS cease-and-desist zone gate, and per-field provenance and confidence. | Not buyer discovery. Its gate and provenance patterns are reusable. |
| Listing identity | `lib/listings/mallan-source-identity.ts` | `SL-`/`RL-` authorship; RLS return copies are publicly suppressed but kept. | Reused through the gate. |

Not found: a buyer-organization model, a search-data provider (code search for eight common provider names returned nothing; indicative only), and campaign-link or external-placement tracking (SELLER-001 §3 records those tables as HELD for a migration).

Two campaign systems exist and are separate: the `Campaign` table (lead-audience counters) and the listing-campaign route (audit events only).

## 3. Gaps against the engine

1. Property-to-buyer evidence records with a citation and date. **This PR.**
2. Evidence-based ranking and confidence that never reads as a sale probability. **This PR.**
3. A performance funnel that keeps exposure, visits, inquiries, showings, diligence requests, offers and contracts apart. **This PR (logic only).**
4. Storage for findings and reports. **HELD: needs a Maya-approved migration (NEON.md).** Until then reports are generated, not stored.
5. A private workspace page. Needs (4) and a feature flag (an environment change, HELD).
6. A market-scan provider. None connected; section 5.
7. Commercial and medical outreach templates. The one template is residential and investor-shaped.
8. Campaign links and external-placement log. HELD with SELLER-001 Phase 2.
9. Live Cotality facts for both listings. Read on 2026-11-10 (section 1); read again before any outward use, because prices and statuses change.

## 4. What this PR adds

`lib/acquisition/*` (pure) and `tests/runtime/acquisition-engine.test.ts` (45 cases).

- A finding is ranked only with an https citation and the date its source shows. A finding that fails is reported with reasons, never dropped.
- An expansion signal or an acquisition record cannot be described as buying; labels say so.
- An anonymous searcher carries no name and no contact. A person is reachable only through the approved CRM channel; a public contact is for an organization or a cooperating broker. Nothing imports a third-party contact.
- Residential audience criteria come from a short allow-list; free text is scanned by `scanRecordForFairHousing` from `lib/compliance/rls-enforcement`.
- A distribution channel carries a placement status: possible, application_prepared or verified_live. Only the last needs, and carries, a citation as live.
- A fact is verified only with a source and an as-of date. Outward materials are allowed only when the gate allows and every required fact is verified. The required lists are Maya's checklist from the brief, not a REBNY or Cotality field list.
- Sample rows are excluded unless asked for and are labelled on every row.
- Confidence describes the evidence (kind, verification, age). `FRESH_EVIDENCE_DAYS = 180` is a policy constant for Maya to set.

## 5. Connecting an external service (none is connected)

- **Market-scan provider:** choose one, confirm its terms permit this use, and give Maya the cost per query first. Its key would be a Vercel environment variable, which is an approved-only change. Until then a scan returns nothing; the engine accepts only findings that already carry a citation, so a manual finding works.
- **Cotality (live listing facts):** the runtime client is `lib/idx/auth.ts` (`client_credentials`, scope `api`). Facts are read-only and each is stored with its source and as-of date. Run on 2026-11-10 for both listings with the existing Vercel-held credentials; nothing was written.

## 6. Cost, compliance and operational risks

- The listing-campaign route's own comments describe cold commercial email to public-record prospects as Maya-approved on 2026-07-14, under CAN-SPAM with suppression and a signed unsubscribe. Any outreach for this project still needs operator approval per message set.
- The investor template computes metrics from operator-typed rent and maintenance. Do not use it for either pilot until those inputs are verified.
- Checked 2026-11-10: neither `SL-0004` nor `SL-0010` (nor any URL for either building) is in `mallan.nyc/sitemap.xml` (9,946 URLs), so neither exclusive is offered to search engines through the sitemap; the cause was not established. The Cotality-copy pages (`/rls20123633`, `/rls20093870`) answer 200 but are `noindex, follow` with the SL page as canonical, so the duplicate-page question is answered. `SL-0004`'s canonical slug reads `new-york-ny`, and the `new-york-city-ny` form of the same URL also answers 200.
- Anonymous traffic is not measured, so "visits" counts only known leads until Phase 2 tracking exists.
- Search-provider cost and terms are unknown until a provider is chosen.
