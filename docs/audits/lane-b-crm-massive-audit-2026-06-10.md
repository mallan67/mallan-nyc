# Lane B — CRM + Intake-Forms Massive Audit — 2026-06-10

> **REPORT-ONLY.** No code edited, no commits, no DB writes, no schema changes, no branch ops.
> Lane B of the 4-lane parallel audit. Builds on (does not duplicate):
> `docs/backend-crm-current-gap-audit-2026-05-18.md` · `docs/crm-workflow-proof-audit-2026-05-16.md` ·
> `docs/audits/settlement-ledger-2026-06.md` (Domain U) · `docs/audits/phase1-unverified-traces-2026-06-07.md` ·
> `MALLAN-NYC-CRM-PROJECT.md` · `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`.
> All findings are **Class A (static code-path)** per CLAUDE.md §J unless marked otherwise. No live-feed claims are made.

---

## Executive summary

The CRM backend is **far more built-out than a typical brokerage CRM**: 70 Prisma models (`prisma/schema.prisma`), ~150 `app/api/crm/**` routes, 40+ `app/api/portal/**` routes, a hard fail-closed RLS write gate on listing creation (`app/api/crm/listings/route.ts:164-549` → `lib/compliance/rls-enforcement.ts`), audit logging in 100+ route files (228 `logAuditEvent`/`auditEvent.create` call sites under `app/api`), and two intake mega-forms (SALE 10,777 lines / RENTAL 7,443 lines) with 156 and 248 `data-rls-field` bindings respectively. Since the 2026-05-16 workflow audit, the two then-critical defects have been **fixed on main**: deal-form submit is wired (`public/crm/BUYER-DEAL-FORM.html:1869-1990` posts to `/api/crm/deals`) and impersonation now POSTs to the backend (`public/crm/js/dashboard/app.js:911-927`; stop route at `app/api/auth/impersonation/stop/route.ts`). U4 (cross-agent offer transmit) is SETTLED (#373).

**What is actually broken or missing falls into five clusters:**

1. **The money pipeline is severed in the middle.** Commission "Submit Request" sends `payout_status` (`public/crm/js/dashboard/panels.js:11845`) which the Deal PATCH allowlist rejects (`app/api/crm/deals/[id]/route.ts:57-71` — only `status` exists on the model, `schema.prisma:163`) → 400 swallowed by a success toast (U7/U8, P1). Broker approval queue filters on a field that is always `undefined` (`panels.js:54,293,498,4424,11682,11913`).
2. **Offers are two disjoint systems.** A full UCBA Art. II `Offer` model exists (`schema.prisma:2431-2486`) with a broker transmit route, but portal offers write `ClientListingAction(action="offer")` JSON blobs and never enter that pipeline (U1, P0 — confirmed in phase1 traces).
3. **Consent and audit gaps at the edges.** Outlook/StreetEasy imports land with `consent_captured_at=null` (U10, TCPA); 14 CRM/portal mutation route files have zero audit-event writes (list in §13); impersonated writes carry no broker provenance (U3); 20 portal mutation routes are unthrottled (U2).
4. **Relations the business needs don't exist.** No `Lead.converted_at`; `Document` links only Deal+Agent (no lead, no listing — a seller's signed listing agreement cannot be attached to the listing or the seller); no broker-approval gate between intake and active; no lead-reassignment route; no `Offer` escalation-clause fields; co-broke agreement type persists only to `raw_data`; owner-opt-out **signed-form tracking** (UCBA 48-hr rule) has no field or document link.
5. **Two frontend-calls-nothing holes**: `/api/favorites/sync` POST target does not exist (`app/components/FavoriteEmailPrompt.tsx:63` → 404, ledger CC7) and rental `applications_count` is a hardcoded `0 // TODO` (U9).

Compliance posture on the forms themselves is strong: FARE Act fee fields are present and mapped on the rental form (§6), the sale form captures `ListingAgreement`/`ExpirationDate`/`ListingContractDate`/commission-negotiability ack (§5), and the write path 422s on the 40+ mandatory RLS fields. The biggest compliance exposure is not missing fields — it is **workflow severance** (offers/commissions/consent) above.

---

## 1. CRM dashboard structure and missing workflows

**Files inspected:** `public/crm/dashboard.html`, `public/crm/js/dashboard/app.js` (2,082 lines — sidebar registry at `:381-425`, command palette routes `:1521-1551`), `public/crm/js/dashboard/panels.js` (13,488 lines), `public/crm/js/dashboard/panels/` (home, intake×5, sales-crm×7, rentals-crm×4, shared×6, tools×12, lease-tracker, admin-ethics), `router.js`, `store.js`, `permissions.js`, `workspace.js`.

**Current behavior.** Three navigation tiers (app.js:381-425): Broker Console (Dashboard, Agent Roster, Licensing/CE/E&O, Ethics Training, Clients, Referrals, Finance incl. Payouts/Revenue/1099, Company Listings, Compliance & IDX, Featured, Documents, Audit Log, IDX/RLS Activity, Settings), CRM (Prospects, Sellers, Buyers, Landlords, Tenants, Lease Tracker), Operations (Dashboard, Property Search, My Listings, Clients, Pipeline, Tasks & Follow-ups, Communications, Deals & Commissions, Revenue, Market Activity, Import Contacts, Outlook Scanner). `panels.js` remains a 13,488-line monolith (finding #19 of the 2026-05-16 audit — still true).

**Gaps / missing workflows:**

| Gap | Evidence | Status |
|---|---|---|
| Broker payout approval queue unreachable (filters on phantom `payout_status`) | `panels.js:54,293,498,4424,11682,11913` vs `schema.prisma:163` | U7/U8, ledger PLANNED |
| Lead reassignment workflow — `permissions.js` declares `assign_lead` but only broker-gated `POST /api/crm/lead-scoring/assign` (auto-assign) exists; no manual `POST /api/crm/leads/[id]/assign`, no UI | `app/api/crm/leads/[id]/` contains only `parties/` + `route.ts`; `app/api/crm/lead-scoring/assign/route.ts` | Open since 05-16 (#4) |
| Referral approval — UI permission declared, no backend route | 2026-05-16 audit A9; no `app/api/crm/referrals/[id]/approve` (only `app/api/crm/referrals/route.ts`) | Open |
| Broker approval gate between seller/landlord intake and active lead | No `pending_broker_approval` status anywhere in `app/api/crm/intake/[type]/route.ts` or `Lead.status` enum comment (`schema.prisma:186`) | Open (business decision needed) |
| Outlook import: N+1 sequential create, silent 409 skip, no consent stamp | `panels.js:3045-3078`; U6/U10 | Open |
| `panels.js` monolith — change-risk multiplier for every Maya-gated CRM-frontend PR | 13,488 lines | Open |

**Backend requirement:** payout-state machine decision (one field), `leads/[id]/assign` route, referral-approve route, optional intake approval gate, bulk-import endpoint.

## 2. Lead capture and assignment

**Files inspected:** `app/api/inquiries/route.ts`, `app/api/contact/route.ts` (per compliance index §16 — 8 lead-capture endpoints), `lib/inquiries/create.ts`, `app/api/crm/clients/route.ts`, `app/api/crm/unassigned-leads/route.ts`, `app/api/crm/lead-scoring/{assign,rules}/route.ts`, `lib/lead-scoring/scorer.ts`, `lib/crm/access.ts`.

**Current behavior.** Public inquiry POST is rate-limited (30/hr/IP), enforces **strict-boolean** TCPA consent (`agreeToTerms !== true` → 400, `inquiries/route.ts:55-61`), upserts Lead by email with `consent_captured_at`, writes an `inquiry_submitted` AuditEvent and a real `Inquiry` row. Assignment: `LeadAssignmentRule` model exists (`schema.prisma:1699-1715`) and `autoAssignLead` (`lib/lead-scoring/scorer.ts:113-144`) matches rules by priority/quota — but it is **only invoked from the broker-manual route** `app/api/crm/lead-scoring/assign/route.ts:23`. Nothing in the public inquiry path calls it: every public lead lands **unassigned** until a broker acts (the `unassigned-leads` panel exists for this).

**Gaps:**
- No automatic routing on inquiry creation (auto-assign is opt-in manual). Per-listing inquiries do not notify the listing's owning agent (gap B2 of `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md`, still open).
- Duplicate policy inconsistency unchanged since 05-16 (#3): public inquiry silently upserts by email (`inquiries/route.ts:84-103`); CRM manual create 409s. No phone dedup, no `inquiry_duplicate_detected` audit action.
- Outlook/StreetEasy imports bypass consent entirely (U10): `POST /api/crm/clients` never sets `consent_captured_at` (`app/api/crm/clients/route.ts:53-71` per phase1 trace; field at `schema.prisma:200`). Outbound automation (`app/api/crm/email/route.ts:66-68` blocks on consent) would correctly refuse these leads — but only if every send path checks; drip flags on Lead (`sales_drip_on` etc., `schema.prisma:326-336`) have no schema-level consent guard.
- No `Lead.converted_at` (confirmed absent from the full Lead model read, `schema.prisma:179-432`; only `promoted_to_*` timestamps exist).

**Backend requirement:** wire `autoAssignLead` (or owning-agent notify) into `lib/inquiries/create.ts`; consent-status stamping for imports (`consent_status='import_unverified'`) + universal send-gate; converted_at column (schema, HELD).

## 3. Buyer/renter records

**Files inspected:** `Lead` model (`schema.prisma:179-432`), `ClientPreference` (`:715-738`), `ClientListingAction` (`:743-757`), `SavedSearch` (`:862-883`), `IntentEvent`/`BuyerIntentProfile` (`:1425-1465`), `app/api/crm/intake/[type]/route.ts` (buyer/investor/renter field allowlists `:9-51`), `public/crm/js/crm/client-database.js` (258 lines), `public/crm/js/dashboard/panels/intake/{buyer,investor,renter}-intake.js`, buyer/tenant workspaces.

**Current behavior.** The Lead model is exceptionally rich for buyers/renters: financial qualification (income, credit range, pre-approval, down payment, monthly debt), renter-specific NYC fields (`no_fee_only`, `fee_tolerance`, `guarantor_type`/`guarantor_company` (Insurent/TheGuarantors), `income_multiple` 40x, `is_international`, `move_in_date`/flexibility), buyer closing-cost estimates (mansion tax, mortgage recording tax, board-app status pipeline `:384-388`), HNW flags, investor strategy/1031 fields, `custom_fields` JSON escape hatch (`:421`). Intake route allowlists map 1:1 to these columns with type coercion. Favorites = `ClientListingAction` unique on (lead, listing, action); saved searches support alert frequency + email override.

**Gaps:**
- `buyer_rep_agreement` is a bare boolean + date (`schema.prisma:254-255`) with **no link to a Document row** — the signed agreement file cannot be attached (Document has no `lead_id`, §11).
- `SavedSearch.lead_id` nullable semantics still undocumented (05-16 #14).
- Public favorites sync dead-ends: `app/components/FavoriteEmailPrompt.tsx:63` POSTs `/api/favorites/sync`; **no `app/api/favorites/` directory exists** → 404, anonymous-favorite → lead conversion silently lost (ledger CC7, P1, lead-routing/TCPA).
- Rental applications: `app/api/crm/rentals/applications/route.ts` exists but rentals listings metric is faked (`applications_count: 0 // TODO`, U9) and the applications route writes **no audit events** (§13).

**Backend requirement:** `/api/favorites/sync` route (or remove caller), real applications count, Document↔Lead relation (schema, HELD).

## 4. Seller/landlord records

**Files inspected:** `SellerLead` (`schema.prisma:1112+`), seller/landlord intake allowlists (`app/api/crm/intake/[type]/route.ts:24-41`), `Lead` seller/landlord fields (`:290-294, 396-406`), `LeadParty` (`:935+`), `app/api/crm/sales/{sellers,prospects}/`, `app/api/crm/rentals/landlords/`, `app/portal/{seller,landlord}/`, `app/api/portal/{seller,landlord}/`, `app/api/crm/clients/[id]/invite/route.ts`.

**Current behavior.** Seller intake captures entity ownership (LLC/Trust + EIN + managing member, `schema.prisma:356-363`), attorney block, `home_prep_checklist`/`disclosures`/`documents_collected`/`marketing_strategy` JSON; landlord intake adds `property_disclosures`, `lease_terms`, `fee_structure` (`owner_pay|tenant_pay|no_fee` — the FARE-relevant flag). `Listing.owner_client_id` FK ties listings back to the seller/landlord Lead (`schema.prisma:443-444`). Seller portal (11 GET slices) verified real-Prisma in the 05-16 audit. Portal invite flow is sound: hashed token, 72h TTL, raw token never in JSON (`clients/[id]/invite/route.ts:58-80`), audited.

**Gaps:**
- Seller/landlord intake → active with **no broker review step** (05-16 D5, unchanged).
- `disclosures`/`documents_collected` are JSON checklists, not Document links — no actual file behind "collected".
- Landlord `fee_structure` on the Lead and the rental form's FARE `rentalLandlordPaysFee` cascade are **not reconciled by any backend check** (the listing could say landlord-pays while the landlord record says tenant_pay).
- Seller dashboard offer counts come from `PortalEvent`, not `Offer` (`app/api/portal/seller/dashboard/route.ts:41-43` per phase1 U1 trace) — sellers can see numbers that the UCBA pipeline never recorded.

**Backend requirement:** optional approval gate; Document relations; a consistency check (warning-level) between landlord fee_structure and listing FARE fields; key seller dashboards to `Offer` after U1.

## 5. Sale listing intake form

**Files inspected:** `public/crm/SALE-FORM-REDESIGN.html` (10,777 lines; 156 `data-rls-field`), POST target `app/api/crm/listings/route.ts` (read in full), `lib/compliance/rls-enforcement.ts`, `lib/compliance/rebny-field-tables.ts:34-128`, `lib/compliance/{rebny-validator,rls-eligibility,normalizer}.ts` (via route imports), `lib/crm/listing-publish-contract.ts`, `lib/listings/exclusive-agent-assignment.ts` (via route).

**Current behavior.** The form posts via `MallanAPI.listings.create` → `POST /api/crm/listings` which runs, in order: RLS-eligibility classification (UCBA mixed-use ≤5-unit model, In-House → website-only), `validateListing`, `assertRlsCompliantPayload` (422 on blockers), UCBA D9 Coming-Soon-once-per-address check (`route.ts:248-273`), normalizer (NAR-removed-field strip + alias renames + Permissions→booleans), transactional create with advisory-locked `SL-xxxx` ID + same-transaction AuditEvent, terminal-status guard on `idx_display_yn`, Mallan exclusive agent attribution stamping (§175.25/UCBA Art. III §2(C), `route.ts:306-336`), projection dual-write, publish contract response. Captured business fields confirmed present: `ListingAgreement` mapped from sale listing type (`:7314-7327`, default ExclusiveRightToSell), `ExpirationDate` (`saleExclusiveExpires`, `:1033`), `ListingContractDate` (`saleExclusiveStart`, `:7622`), CoBroke agreement type (`:546`, → `raw_data` as phantom field per `rebny-field-tables.ts:46-49`), first co-broke date (`:1038`, rls-ignore), Concessions block (`:1303-1329`), **commission negotiability acknowledgment** (required checkbox, `:552-557`).

**Gaps:**
- Status is hardcoded `Draft` on create; publish/status transitions go through `app/api/crm/listings/[id]/status/route.ts` — agent-info-in-description scanning relies on the form-side scanner + write-gate content scan; render-side third-party remarks remain unscanned (ledger CC3, different surface).
- `saleCommNegotiabilityAck` is `data-rls-ignore` — the acknowledgment is **enforced client-side only** (required attr) and not persisted as a structured field or AuditEvent payload key; no server 422 if a direct API call omits it.
- Owner opt-out: form sets `Permissions` → `owner_opt_out` boolean, but the UCBA Art. I §5(A) **signed opt-out form within 48 hrs** has no `owner_opt_out_signed_at` field and no Document link (fail-closed row §6 of the compliance index describes the rule; the tracking artifact is absent).

## 6. Rental listing intake form

**Files inspected:** `public/crm/RENTAL-FORM-REDESIGN.html` (7,443 lines; 248 `data-rls-field`), submit path `:5881-5952` (`MallanAPI.listings.create/update` → same `/api/crm/listings`), FARE sections `:1077-1131, 1347-1362`, mapping `:5865-5876`, hydrate-with-legacy-fallback `:6963-6979`, `lib/crm/fee-disclosure.ts` (read in full).

**Current behavior.** FARE Act (NYC LL 119/2024) coverage is genuinely good: canonical live-Property fields `MoveInCosts`, `MoveInCostsAmount`, `MoveInCostsComments`, `OngoingFees`, `TenantPays`, `TenantPaysDescription` all bound (`:1084-1131`) and mapped on save (`:5866-5872`), with documented read-time legacy fallback (`AdditionalFee*` → canonical wins, Codex #346 noted inline at `:6973-6977`). A dedicated FARE landlord-pays toggle drives the `InternetEntireListingDisplayYN` cascade with an explicit red warning banner (`:1347-1362`). Backend publish gate `checkFeeDisclosure` (`lib/crm/fee-disclosure.ts`) blocks display-ready statuses (Active/ComingSoon) when a fee is flagged without clear detail; Draft maps to `Incomplete` and is never gated. Compliance pre-submit scans 3 free-text fields and hard-blocks on red/orange flags (`:5892-5912`).

**Gaps:**
- Submit failure falls back to `alert()` + localStorage draft (`:5943-5946`) — a draft saved only in one browser is invisible to the broker (durability, not compliance).
- Known C1 warning unchanged: rental form `MlsStatus` picklist missing `ComingSoon` (compliance index §17 / launch-readiness C1).
- The FARE **public rendering** defect is a separate surface (ledger CC2, `app/listing/[...slug]/page.tsx` listingType mis-derivation) — intake is fine; display is the open P0.

## 7. Required fields for NYC/REBNY/RLS/IDX Plus compliance on intake

**Files inspected:** `lib/compliance/rebny-field-tables.ts:34-148` (the mandatory-field authority), `lib/compliance/rls-enforcement.ts:63-69, 255-260`, `data/RLS-FIELD-REGISTRY.md`, compliance index §§1-3, 12, 17.

**Current behavior.** Mandatory agent-submitted fields (40+) enforced at write: PropertyType/SubType/StructureType/CommonInterest/ListPrice/MlsStatus; ListAgentMlsId/ListingAgreement/Concessions; full canonical address set (CityRegion not Borough, `UnparsedAddress` lowercase-p per Cotality-clean 2026-05-30); building block (TaxLot/TaxBlock/ElevatorsTotal/GarageYN/NumberOfUnitsTotal/StoriesTotal/NewConstructionYN/NewDevelopmentYN/YearBuilt); unit (BathroomsFull/Half, BedroomsTotal, RoomsTotal); the 5 internet display gates + SyndicateTo; PublicRemarks/ShowingInstructions/**ExpirationDate**/**ListingContractDate**. Constraints: YearBuilt 1700→+10yr, ExpirationDate ≤10yr, StateOrProvince=NY, City=NewYorkCity, borough↔county match. Phantom fields (CoBrokeAgreement, AttendanceType, BuildingPetsAllowed, BuildingTaxLot, IDXEntireListingDisplayYN, SyndicateYN) correctly **demoted** from mandatory with dated comments — the table is live-metadata-disciplined.

**Cross-check verdicts:**
- **FARE rental fields:** present on form + publish-gated (§6). ✓
- **UCBA exclusive-only:** enforced — In-House/non-exclusive types route to website-only via `classifyRlsEligibility` (`app/api/crm/listings/route.ts:193-205`). ✓
- **No agent info in description:** content scanner in `assertRlsCompliantPayload` + client scanner (`public/crm/js/compliance/fair-housing.js`); Fair Housing hard blocks at `lib/compliance/rls-enforcement.ts:90-143` (13 regex families incl. NYC Fair Chance, source-of-income, lawful occupation). ✓ at write; render-side third-party remarks not re-scanned (CC3).
- **Commission negotiability:** form-ack only, not server-enforced (§5 gap).
- **Trestle-mapper note:** `lib/idx/trestle-mapper.ts` (`TERMINAL_STATUSES`, `normalizeStandardStatus`, `computeGateColumns`) is the reader/sync-side gate authority and is correctly imported by the CRM write path (`listings/route.ts:12`), so CRM-created exclusives obey the same terminal/display semantics as feed rows.

**Gap table is in the Missing-fields section below.**

## 8. Frontend-only vs backend-required matrix

| Surface | Frontend artifact | Backend reality | Verdict |
|---|---|---|---|
| Deal submit (buyer/tenant forms) | `BUYER-DEAL-FORM.html:1869-1990` | `POST /api/crm/deals` real | **WIRED** (fixed since 05-16) |
| Commission payout submit | `panels.js:11845` sends `payout_status` | Field doesn't exist; PATCH allowlist (`deals/[id]/route.ts:57-71`) → 400; `.catch` shows success | **BROKEN — silent data loss (U7)** |
| Broker payout approve/reject queue | `panels.js:54,293,498,11682,11913` read `payout_status` | Always `undefined`; real route is `PATCH /deals/[id]/status` but nothing sets `submitted` | **BROKEN (U8)** |
| Portal offer submit | portal offer POST | Writes `ClientListingAction` blob; `prisma.offer.create` = 0 hits repo-wide | **WIRED to wrong model (U1)** |
| Impersonation | `app.js:911-927` POSTs `agents/[id]/impersonate`; stop via `app/api/auth/impersonation/stop` | Real delegated session + audit | **WIRED** (provenance gap = U3) |
| Public favorite→lead sync | `FavoriteEmailPrompt.tsx:63` | **No `app/api/favorites/` route** | **BROKEN — 404 (CC7)** |
| Analytics events | client posts `/api/analytics/event` | route absent | **BROKEN (SF2)** |
| Rental applications count | rentals listings panel | `applications_count: 0 // TODO` (`app/api/crm/rentals/listings/route.ts:55`) | **FAKE METRIC (U9)** |
| Sale/rental intake forms | both mega-forms | `POST /api/crm/listings` full gate chain | **WIRED** |
| Sale/rental form draft fallback | localStorage draft on API failure | no server draft | Frontend-only (durability gap) |
| Saved views / feature flags (`store.js`) | localStorage | intentional per 05-16 audit | OK |
| Seller-prospects 5-tab persistence, Pitch-Packet "Save Comps", Lease "Add Lease" | panels | `app/api/crm/sales/comps/criteria/`, `app/api/crm/lease-tracker/` routes exist; per-tab persistence still **unverified** (05-18 §8 verify items never closed) | VERIFY |
| Commission negotiability ack | required checkbox, `data-rls-ignore` | not validated server-side, not persisted | **FRONTEND-ONLY** |
| Outlook import | `panels.js:3045-3078` sequential | real routes, no consent stamp, no bulk endpoint | WIRED w/ U6+U10 defects |

## 9. Missing fields (business-critical) — with compliance citations

| Missing field / artifact | Where it should live | Why | Compliance citation |
|---|---|---|---|
| `Deal.payout_status` (or collapse onto `status` + repoint UI) | `schema.prisma:151-174` | Entire payout pipeline unreachable | Financial oversight; NY DOS 6-yr transaction records (index §15) |
| `Lead.converted_at` | Lead model | Cannot answer "when did lead become client"; conversion is implicit pipeline_stage | Audit integrity (index §15) |
| `Lead.consent_status` / import-source consent flag | Lead model | Imports indistinguishable from consented leads | TCPA 47 CFR 64.1200(f)(8) (index §13) |
| `owner_opt_out_signed_at` + opt-out Document link | Listing | UCBA requires signed Owner Opt-Out form within 48h; only the boolean gate exists | UCBA Art. I §5(A) (index §6) |
| `Document.lead_id`, `Document.listing_id` | `schema.prisma:1606-1631` (currently deal+agent only) | Listing agreements, buyer-rep agreements, opt-out forms, board packages can't attach to client/listing | NY DOS 6-yr retention of agreements (index §14) |
| Commission-negotiability ack as persisted field/audit payload | listing create/raw_data + AuditEvent | Currently client-side checkbox only | UCBA 2026 / NAR settlement disclosure |
| `Offer` escalation-clause fields (`escalation_yn`, cap, increment) | Offer model (`:2445-2452` has only amount/terms/contingencies) | NYC bidding wars routinely use escalations; today they'd be free-text in `offer_terms` | UCBA Art. II offer-terms completeness |
| Co-broke: structured internal `co_broke_agreement_type` column | Listing (today raw_data only, `rebny-field-tables.ts:46-49`) | REBNY-internal concept; reporting/1099 splits need it queryable | UCBA co-brokerage |
| `Session.impersonated_by_broker_id` + AuditEvent column | Session/AuditEvent (`:576-591`, `:695-710`) | Broker invisible on impersonated writes | NY DOS §175.25 supervision; SHIELD (U3) |
| `Inquiry.duplicate_of_lead_id` | Inquiry model | Silent merge has no trail | Lead-routing audit (index §16) |
| Rental `MlsStatus` `ComingSoon` picklist value | RENTAL-FORM | Known C1 warning | UCBA §16(C) (index §17) |
| Broker-approval status for intake (`pending_broker_approval`) | Lead.status | If business mandates supervision of new seller/landlord records | NY DOS supervision (business decision) |
| `ListingSend` dedicated model | (today AuditEvent rows) | Send-frequency stats, open-rate per agent | low; 05-16 #12 |

## 10. Roles / permissions — current vs target

**Current (verified):** `Session.role ∈ {BROKER, AGENT, buyer, tenant, seller, landlord}` with `user_type ∈ {agent, lead}` (`schema.prisma:576-591`). Helpers: `requireAuth`/`requireRole`/`requireBroker` (24 route files)/`requireAgentOrBroker`/`requirePortalRole`/`requireWorkspace` (`lib/auth/middleware.ts:20-168`). Lead-row ownership via `lib/crm/access.ts` (`assertLeadAccess` — broker bypass, agent must own). Portal access: invite-token (hashed, 72h, audited — `clients/[id]/invite/route.ts`) + password login; multi-workspace via `Lead.enabled_workspaces[]` with legacy `portal_role` fallback (`middleware.ts:146-153`). Seller and landlord logins **already exist** (portal pages `app/portal/{seller,landlord}` + `requirePortalRole("seller"|"landlord")` routes). Broker-only enforcement is real server-side (requireBroker on agents list, doc approval, deal status BROKER_ONLY_STATUSES, audit-log, 1099, lead PATCH).

**Missing for the target model:**
1. **Impersonation provenance** (U3): no `impersonated_by_broker_id` on Session/AuditEvent; 2h cookie vs 8h DB TTL + silent rotation. Schema = HELD.
2. **Broker-as-agent server enforcement**: session is plain BROKER during impersonation; UI-hidden broker powers (approve own payout) still callable (05-16 BA9).
3. **Per-request ethics gate** (AS2, ledger): `ethics_training_expires_at` checked at login only.
4. **Seller/landlord self-signup**: portal is invite-first; `app/api/sign-up` creates buyer-shaped leads. If sellers/landlords should self-register from `/sell` pages, a role-aware signup + verification flow is needed (today: inquiry → agent invites).
5. **Agent row-isolation completeness**: pattern is good on lead-scoped routes via `assertLeadAccess`, but it is per-route discipline, not middleware; U4-style holes (fixed for transmit) can recur — a runtime test pin per mutation route family is the cheap guard.
6. **No distinct ADMIN vs BROKER** role; acceptable for a one-broker shop, but note `requireBroker` is the de-facto admin.

## 11. Data relations — existing vs missing

**Existing (verified in `prisma/schema.prisma`):**
- Lead ⇄ Agent, Lead ⇄ Listing (`owner_client_id`), Lead → Inquiry/SavedSearch/ClientListingAction/Showing/ShowingHistory/Comment/FamilyMember/LeadParty/FollowUpTask/ActivityLog/ClientPreference/IntentEvent/BuyerIntentProfile/LeadScore/PortalEvent/ListingView/ExternalListing/ActiveLease(2 roles).
- Listing → ClientListingAction/Showing/Comment/Inquiry/**Offer**/PriceHistory/MarketingActivity/ListingMedia/ListingSearchProjection/ProtectedPeriod(+ProtectedBuyer with deal-executed tracking).
- Deal → Document/CommissionPayment; Agent → ~20 relations incl. PastDeal, CmaReport, Campaign.
- AuditEvent: string `entity_type/entity_id` (no FK — by design, immutable log), 2-yr retention cron; longer-retention data correctly lives on dedicated models (index §15 fail-closed).

**Missing relations:**
| Missing | Impact |
|---|---|
| **Document → Lead / Listing** (only Deal+Agent today) | The single biggest relational gap: client docs, listing agreements, opt-out forms, board packages unattachable. Storage itself exists (R2 upload, 20MB, allowlisted — `app/api/crm/documents/upload/route.ts`) |
| **Offer → portal flow** (relation exists; *writes* don't — U1) | UCBA pipeline starved |
| FollowUpTask → Listing/Deal (lead+agent only, `:2014-2033`) | "Follow up on this listing/deal" tasks must abuse lead linkage |
| Deal → Listing / Lead (Deal has only free-text `property_address`, `:156`) | Commission requests can't join to the listing or client they're for — blocks per-listing P&L and UCBA trail joins |
| Inquiry → auto-notify owning agent | B2 gap (launch-readiness) |
| AuditEvent ↔ ActivityLog coordination (two parallel systems, 05-16 #10) | Timeline fragmentation |

**AuditEvent coverage gaps (mutation route files with zero audit writes; grep `logAuditEvent|auditEvent.create`):** `app/api/crm/clients/[id]/parties/route.ts`, `crm/communications/[id]/read`, `crm/events`, `crm/financial-scenarios/[id]`, `crm/listings/[id]/validate` (read-shaped, OK), `crm/market-report` (OK), `crm/notifications` (+`/preferences`) — also U5 cross-recipient PATCH, `crm/outlook/disconnect`, `crm/rentals/applications`, `crm/sales/prospects/[id]/comps`, and portal: `portal/complete-profile`, `portal/messages`, `portal/tenant/renewal`. Of these, **parties, events, financial-scenarios, applications, outlook/disconnect, complete-profile, messages, renewal** are true gaps (state-changing, unaudited).

## 12. RealPlus-style Buyer Interest / Buyer Demand Intelligence — FUTURE PHASE ONLY

**Already captured by the current schema (would feed it with zero new collection):**
- `SavedSearch.criteria` JSON + alert cadence (`schema.prisma:862-883`) — explicit demand by neighborhood/price/beds.
- `ClientListingAction` (liked/disliked/discuss/schedule/offer, `:743-757`) + `ListingView` + `ShowingHistory` + `Showing.feedback` — revealed preference per listing.
- `IntentEvent` → `BuyerIntentProfile` (`:1425-1465`): computed `intent_strength`, `intent_stage`, preferred neighborhoods/types/beds/amenities/boroughs, `top_features` JSON — this **is** a buyer-demand profile already.
- `DemandSignal`/`DemandIndex`/`DemandAlert` (`:1359-1419`) + daily cron `app/api/cron/demand-signals/route.ts` (CRON_SECRET + timingSafeEqual, audited) — neighborhood-level demand index with agent alerts.
- `Inquiry` rows per listing; `ClientPreference` structured criteria; `LeadScore` grades; seller-side `ListingMomentum`/`SocialProofCache` and portal `seller/demand` endpoint already render demand to sellers.

**Net-new for a RealPlus-style "buyers in the building/line" product (no implementation detail per scope):** cross-matching layer (active buyer profiles × a subject listing/building → counted, anonymized interest), building-level aggregation (Building/BuildingUnit models exist at `:2138-2263` but no buyer-demand join), anonymized buyer-card disclosure rules (Fair Housing review required — demand surfacing must not proxy protected classes; index §10), and an agent-facing "demand for my pitch" packet feed. **MLS/IDX data must not feed predictive/behavioral profiling per the REBNY AI restriction (`MALLAN-NYC-CRM-PROJECT.md` §AI/ML)** — only first-party behavioral + internal data may drive it; that boundary already holds (IntentEvent is first-party).

## 13. Follow-up tasks / agent workflow · audit completeness · broker-only enforcement (cross-cutting)

- **Tasks:** `FollowUpTask` model is real and routed (`app/api/crm/tasks/` GET/POST + `[id]`), agent-scoped, typed (`call/email/showing/meeting/review/renewal_check/buyer_conversion`), with due/priority/status. Missing: listing/deal linkage (§11), recurring tasks, and no automation creates tasks from triggers (LifecycleTrigger/TriggerExecution models exist `:1855-1894` — wiring unverified).
- **Audit completeness:** 228 audit call sites across 100+ files is strong; gaps enumerated in §11. The convert API's 6 handlers (05-16 #9) now show 7 call sites in `app/api/crm/convert/route.ts` — likely closed, verify per-handler before claiming.
- **Broker-only:** server-enforced (24 requireBroker files); the leak is impersonation-mode broker writes (U3/BA9) and the missing per-request ethics check (AS2).

---

## Phased build plan (starts ONLY after Maya approval; respects media/cron-first + one write lane)

**Preconditions for ANY CRM phase:** media program rows (M2 remaining work, M3, M4) and cron/CI risks (SF1, CI1) are not in a state that blocks public-site stability; only one write/merge lane active at a time per settlement-gate governance. Every phase: full validation chain (§G CLAUDE.md), proof-first (§F), MICRO/MACRO gates, ledger Trace Records. Coupled sets per ledger macro note: U7+U8, U1+U7/U8.

**Phase CRM-0 — Backend-only correctness (no schema, no CRM frontend, no env → lowest gate burden)**
- CC7: create `/api/favorites/sync` (or remove caller) — lead-capture compliance path (read index §16 first).
- U10: stamp imports `consent_status='import_unverified'` if doable without schema (else move to CRM-2); gate all outbound sends on consent (read index §13 FIRST, fail-closed §E).
- U2: rate-limit 20 portal mutation routes keyed by lead_id; U6 Outlook throttle + 429 backoff; U5 notifications `updateMany` scoping.
- Audit-gap closure: add `logAuditEvent` to the 8 true-gap mutation routes (§11).
- Dependencies: none. Maya-gated only by the standing "no CRM work without approval" rule.

**Phase CRM-1 — Money pipeline (U7+U8 as ONE blast radius)**
- Decision needed from Maya first (see Open Questions #1): add `payout_status` column (schema = HELD gate) **or** collapse onto `status` (code-only but touches `public/crm/**` = CRM-frontend gate either way).
- Remove the success-on-error `.catch` (`panels.js:11850`); flow-verifier + silent-failure-hunter gates per ledger.
- Adds: `Deal.listing_id`/`Deal.lead_id` FKs **only if** Maya approves schema in the same window (§11).

**Phase CRM-2 — Offers unification (U1, P0 UCBA)**
- Portal offer POST creates `Offer` rows; transmit/dashboard/seller-counts keyed to `Offer`; read-time dual-pull of legacy `ClientListingAction` offers for ≥1 quarter. Read UCBA Art. II canonical (`data/UCBA-2026-Requirements.md`) FIRST. No schema needed (model exists). CRM-frontend + portal touch = Maya-gated.

**Phase CRM-3 — Supervision & provenance (schema window — single migration batch, NEON.md discipline)**
- U3 impersonation columns; `Lead.converted_at`; `Inquiry.duplicate_of_lead_id`; `Document.lead_id/listing_id`; optional `owner_opt_out_signed_at`. One additive nullable migration set, Maya-applied pre-merge (RC1 precedent).
- AS2 per-request ethics gate (code-only, same window).

**Phase CRM-4 — Workflow completion (code + small UI)**
- `POST /api/crm/leads/[id]/assign` + UI; referral-approve route; inquiry → owning-agent notify (B2); optional intake broker-approval gate (business decision); rental applications real count (U9); Outlook bulk-import endpoint.

**Phase CRM-5 — FUTURE: Buyer Demand Intelligence (§12). Design-doc first; Fair-Housing review mandatory; no implementation until separately approved.**

---

## Open questions for Maya

1. **Payout field decision (blocks CRM-1):** new `payout_status` column (schema migration) or collapse onto existing `Deal.status` state machine?
2. **Multi-agent model:** is per-agent row isolation the intended design (current), or "all agents see all"? Determines whether the isolation test-pin work is a guard or a redesign.
3. **Broker approval gate** between seller/landlord intake and active records — required business rule or not?
4. **Seller/landlord self-signup** from the public /sell pages, or keep invite-only portal?
5. **Duplicate-lead policy:** silent merge (current public path) vs reject (current CRM path) — pick one globally?
6. **Documents:** approve adding Lead/Listing links so signed agreements (listing, buyer-rep, owner opt-out) attach to the records they govern? (6-yr NY DOS retention currently rides on R2 objects with deal-only linkage.)
7. **Offer escalation clauses:** structured fields wanted, or keep in `offer_terms` free text?
8. **Commission-negotiability ack:** persist server-side (raw_data + audit payload) or accept client-side-only?
9. **Lead auto-assignment:** should public inquiries auto-route via `LeadAssignmentRule`, or stay broker-manual via the unassigned queue?

---

*End of Lane B report. No files modified outside this report. No commits.*
