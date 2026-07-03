# Next-Correction Decision Memo (2026-06-08)

**Purpose:** choose the next single correction after U4 (settled on main `b9d8b028`). **Analysis
only — no code, no PR, no implementation.** One correction at a time → pre-register Trace Record →
RED → fix → GREEN → micro/macro gates → specialist review → merge → settlement docs → stop.

All facts are from the ledger + prior read-only audits (Class A static; live "is it used?"
questions are flagged as **Maya/runtime-confirm** because I cannot see production usage).

## 1. Open ledger rows — ranked by severity × compliance/business risk

| Rank | ID | Defect (1-line) | Sev | Tier |
|---|---|---|---|---|
| 1 | **CC1** | Coming Soon badge not set on detail **DB path** | **P0** | Compliance (UCBA §16(C)) |
| 2 | **CC2** | FARE Act block dies if `listingType` mis-derived (rentals) | **P0** | Compliance (NYC LL 119, $/violation) |
| 3 | **U1** | Portal offers write `ClientListingAction`, never create `Offer` → bypass UCBA transmission | **P0** | Compliance (UCBA Art. II) — *if portal live* |
| 4 | CC3 | Third-party `publicRemarks` unscanned at render | P1 | Fair Housing |
| 5 | CC4 | Footer settings wholesale-replace blanks §175.25 attribution | P1 | NY DOS |
| 6 | U7/U8 | Commission "Submit" silent-fail + payout pipeline unreachable | P1 | Financial oversight — *if commission flow live* |
| 7 | U10 | Outlook imports land `consent_captured_at=null` | P1 | TCPA (verify rule first) |
| 8 | U3 | Impersonation: no per-write `impersonated_by_broker_id` | P1 | Broker supervision/audit |
| 9 | M3 | `mapping.ts` classifies Trestle FloorPlan as Photo (live path) | P1 | Media display (contained slice of M-series) |
| 10 | M1/M2/M4 | Held refactor + incremental-only sync + 8,568-listing media coverage gap | P1 | **Business** (listing quality) — multi-phase |
| — | CC6, SF1-3, S1-3, AS1-4, CI1-3, FE1-3, U2/U5/U6/U9 | (see ledger) | P1-P2 | mixed |

## 2. Top-candidate analysis

### CC1 — Coming Soon badge on the detail DB path
- **Defect:** the detail page's inline `fetchFromDB` DTO (`app/listing/[...slug]/page.tsx:653-657`) sets only attribution/disclaimer; it **never sets `_displayCompliance.comingSoon/comingSoonDate`**, so the badge gate at `:1321` never fires for a Coming Soon listing served via the **DB-first (primary) path**. The Trestle-direct path *does* set it.
- **Compliance/legal:** REBNY UCBA Art. I §16(C) — a Coming Soon listing must show the mandatory "No Showings/Open House until {date}" badge. Missing it on the primary detail path is a direct rule violation.
- **Business/user:** a Coming Soon listing detail page renders with no no-showings notice — REBNY exposure; cards already show it, so it's the detail surface specifically.
- **Blast radius:** small — one file (the inline DTO; ideally route it through `dbListingToPublicDTO` which already has the `isComingSoonStatus` block) + a test. No other consumers.
- **Schema/migration:** **No.**
- **Live proof needed:** **Yes (§F)** — a Coming Soon listing detail on a preview/prod URL showing the badge. **Dependency:** requires at least one `ComingSoon` listing in the data (ledger noted ComingSoon count was ~2 at last DB read — *Maya/runtime-confirm a probe listing exists*).
- **Test strategy:** failing test asserting the DB-path DTO sets `comingSoon`+`comingSoonDate` for a ComingSoon listing → fix → green; + a live preview capture.
- **Dependencies/coupled:** coupled with CC2 (same `page.tsx` detail render — the macro gate will flag listing-ui domain; a CC1 change must not regress FARE/attribution).
- **Why now:** P0 legal, smallest contained blast radius of the P0s, no schema, cleanest §F story (one badge). Ideal second proof of the governance process on a compliance surface.
- **Why not now:** the live render proof depends on a ComingSoon listing existing; if none does, §F is satisfiable only by the unit test + a synthetic preview (weaker). Resolvable.

### CC2 — FARE Act `listingType` single-point-of-failure
- **Defect:** the entire FARE block is gated on `isRental` (`page.tsx:1725`), derived solely from `listingType === 'rent'` (`:946`). Any rental mis-typed as sale (DB `listing_type` ≠ `'rent'`, or Trestle `PropertyType` lacking `lease`) renders **zero** FARE disclosure. SplitCard also omits the `FareActFeeBadge`.
- **Compliance/legal:** NYC LL 119/2024; DCWP penalties up to **$2,000/violation**. Highest per-violation $ exposure in this set.
- **Business/user:** a rental shown with no FARE fee disclosure = direct legal exposure on every affected rental view.
- **Blast radius:** medium — `page.tsx` (harden `listingType` derivation) + `SearchListingCard.tsx` (SplitCard badge) + tests. Wider than CC1 and touches the derivation logic (riskier).
- **Schema/migration:** **No.**
- **Live proof needed:** **Yes, and it's the hard part (§F / the 2026-05-20 A4 finding)** — needs a **live production rental** render proof, and ideally proof for a *mis-typed* rental (the actual risk). Data-dependent + harder to construct.
- **Test strategy:** tests for `listingType` derivation edge cases (mis-typed rental must not silently drop FARE) + SplitCard badge test + live rental probe.
- **Dependencies/coupled:** CC1 (same detail render); the residual risk lives in the derivation, which a unit test can pin but only a live rental proves.
- **Why now:** highest legal $ exposure; same P0 tier.
- **Why not now:** larger + riskier than CC1; the §F proof is the hardest of the candidates (mis-typed-rental render). Better as the *second* compliance correction once CC1 has re-proven the listing-detail change pattern.

### U1 — Portal offers bypass the `Offer` pipeline
- **Defect:** portal offer POST (`app/api/portal/offers/route.ts:281-288`) writes `ClientListingAction` (JSON in `comment`); **`Offer` is never created**, so portal offers never enter the broker transmit/UCBA Art. II pipeline.
- **Compliance/legal:** UCBA Art. II offer transmission/disclosure trail — portal-submitted offers are invisible to it.
- **Business/user:** **conditional on portal usage** — if sellers submit offers via the portal in production, the broker's `Offer`-based pipeline never sees them (reporting + compliance gap). *Maya/runtime-confirm: is the seller portal live with real offer submissions?*
- **Blast radius:** medium-large — portal offer write (create `Offer`), seller dashboard read, and the broker transmit pipeline (which U4 just guarded) must all align.
- **Schema/migration:** **Possibly** — the `Offer` model exists; if portal fields don't map cleanly, a migration may be needed (HELD). Likely additive/none, but must verify.
- **Live proof needed:** Yes — portal offer → `Offer` row → broker pipeline; a flow test + possibly a live portal probe.
- **Test strategy:** portal POST creates an `Offer` (received_at stamped); dashboard + transmit read it; audit keyed to `Offer.id`.
- **Dependencies/coupled:** **U4** (transmit route — now guarded; U1 creates the rows it reads) and **U7/U8** (data-model unification theme).
- **Why now:** P0 UCBA, and it directly extends the U4 work (offer integrity).
- **Why not now:** value hinges on portal being live; larger blast radius; possible schema; needs a data-model decision (mirror vs replace `ClientListingAction`). Decision-gated.

### U7 / U8 — Commission payout loss
- **Defect:** "Submit Request" writes a non-existent `payout_status` → 400 → **success-on-error toast** (silent loss); approve/reject read `payout_status` while `Deal` has only `status` → approval pipeline unreachable.
- **Compliance/legal:** not a hard legal line — financial oversight / broker accountability.
- **Business/user:** **conditional** — if the commission flow is used, agents believe they submitted payout requests the broker never receives (financial integrity). *Maya/runtime-confirm: is the commission/payout flow live?*
- **Blast radius:** **touches `public/crm/**` (HELD CRM frontend — `panels.js`)** + `app/api/crm/deals/[id]/route.ts` + a **Deal field decision** (add `payout_status` column [migration, HELD] **or** collapse onto `status` [no schema]).
- **Schema/migration:** **Decision-gated** — option A = migration (HELD); option B = none.
- **Live proof needed:** Yes — CRM flow.
- **Test strategy:** depends on the field decision; remove the success-on-error catch; status-machine test.
- **Dependencies/coupled:** U7+U8 are one fix (same field); themewith U1.
- **Why now:** financial integrity if live.
- **Why not now:** HELD CRM frontend + a schema/field decision → **not contained**, needs Maya decisions first. Not a clean next-correction.

### U3 — Impersonation per-write provenance
- **Defect:** no `impersonated_by_broker_id` on session or any write; broker-as-agent writes are agent-attributed only; 2h cookie vs 8h DB TTL + silent rotation.
- **Compliance/legal:** NY DOS broker supervision / audit-trail integrity.
- **Blast radius:** **schema** (`Session.impersonated_by_broker_id` + `AuditEvent` column) + session.ts + impersonate route + `logAuditEvent`. Wider.
- **Schema/migration:** **Yes (HELD).**
- **Why now:** accountability gap on a privileged flow.
- **Why not now:** schema migration (HELD) + multiple files → not contained; needs an enforcement-policy decision.

### U10 — TCPA on Outlook imports
- **Defect:** imported contacts land `consent_captured_at=null` with no consent flag.
- **Compliance/legal:** TCPA/CAN-SPAM — **but the rule must be read from the canonical index first (§D/§E)**; the exposure is only real if outbound automation sends to these without a consent gate.
- **Blast radius:** import stamping (`clients/route.ts`) + outbound-automation consent gate + possibly a `consent_status` field (schema).
- **Schema/migration:** **Possibly.**
- **Live proof needed:** confirm outbound paths gate on consent.
- **Why now:** legal if automation sends to imports.
- **Why not now:** needs the §D canonical read + a runtime confirm that automation actually contacts imported leads; possible schema. Investigate-first, not code-first.

### M-series (media root-cause) — context
- **M3 (contained slice):** `lib/idx/mapping.ts:335` classifies Trestle `FloorPlan` as Photo on the live render path → floorplan-as-hero. **Contained, no schema, test-first** — a viable smaller correction if media quality is the priority.
- **M1/M2/M4 (full root-cause):** held refactor + sync rebuild + 8,568-listing coverage backfill = **multi-phase, schema (drop JSON cols), HELD, large blast radius.** This is the biggest *business* lever (the original blank/photoless-card complaint) but is **NOT a single contained correction** — it's Plan Phases 3-5-8 and must not be started as "one correction."

## 3. Recommendation — **CC1 (Coming Soon badge on the detail DB path)**
- **P0 compliance** (UCBA §16(C)), **smallest contained blast radius** of the P0s, **no schema**, single-file fix + test, and the **cleanest §F live-proof story** (one badge on a Coming Soon detail page).
- It re-proves the governance process on a **compliance surface** (U4 proved it on auth) with minimal risk, and is coupled to — but safely separable from — CC2.
- **Pre-condition to confirm before starting:** at least one `ComingSoon` listing exists for the live render proof (Maya/runtime-confirm). If none, CC1 still ships with the unit-test proof + a synthetic preview, and the live capture follows when a ComingSoon listing appears.

## 4. Runner-up — **CC2 (FARE Act `listingType`)**
Same P0 tier and the **highest per-violation $ exposure**, but it is **second** because: (a) larger/riskier blast radius (derivation logic + SplitCard), and (b) its §F proof is the **hardest** (needs a live, and ideally mis-typed, rental render). Best taken **immediately after CC1**, reusing the listing-detail change pattern CC1 establishes.

## 5. Decisions/inputs needed from Maya before the chosen correction starts
1. **Approve the next correction** (CC1 recommended).
2. **CC1 live-proof:** does a `ComingSoon` listing exist to probe? (else live capture is deferred).
3. For later candidates: **is the seller portal live with real offers (U1)?** **is the commission flow live (U7/U8)?** — these flip P0/P1 business impact and decide ordering.
4. If/when U1 or U7/U8: the **data-model decision** (mirror vs replace `ClientListingAction`; add `payout_status` column vs collapse onto `status`).

**No implementation performed. Awaiting explicit approval of the next single correction.**
