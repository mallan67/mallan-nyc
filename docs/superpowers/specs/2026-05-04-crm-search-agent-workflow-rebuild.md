# CRM / Search / Agent Workflow Rebuild — Design Doc

**Date:** 2026-05-04
**Status:** Draft for review (parallel track to immediate P0 stop-gap fixes)
**Owner:** Maya Allan (broker, principal owner of mallan.nyc)
**Predecessor patches:** A1, A4, A5, A6, A7, A9, A10, A11, A12, A13, A14, A15, A16, A17 + Batch 3 (dead-control disable) + P0-A (detail UX) — all landed 2026-05-03 → 2026-05-04 via commits `2483b7b1` through `947a301c`.

This document is a **structured rebuild plan** for the CRM/search/agent workflow. It captures every workflow you described, maps each line item against current state, defines the supported-vs-unsupported field contract, and breaks implementation into phases with explicit acceptance gates. It does NOT itself authorize any patches — it's the structured backlog feed for future batches.

---

## 1. Executive Summary

The mallan.nyc CRM has a working core: borough/neighborhood/beds/price/status/listingId all proven via tests and live telemetry, distribution gates enforced server-side, refine routes through `_serverSearch`, photo-first media ordering. **What's missing is workflow completeness** — the connective tissue between search → detail → email → client portal that makes the CRM a daily agent tool rather than a working-but-fragmented surface.

**Five workflows need rebuild work** (in priority order):
1. **Email & Share Center** — agent inquiry has no audit trail; CMA endpoint lacks TCPA consent; SMTP fail-loud not propagated to all routes
2. **Client Collections** — selected listings flow exists but compare/bulk/export are partial
3. **Quick Search (mobile broker)** — definition + scope decision needed; existing surface is desktop-Basic-mode card
4. **Saved Searches** — exists but not regression-tested with A1 borough chip
5. **Advanced Search active-filter chip strip** — Refine has chips, Advanced doesn't

**Five workflows are working** (but need acceptance tests):
1. Refine search (post-A10)
2. Detail back-to-results (post-A9)
3. Borough/neighborhood routing (post-A1)
4. Sponsor unit filter+label (post-A11/A12)
5. Detail gallery + nav (post-A16/A17)

**Two workflows need product decisions** before implementation:
1. **Quick Search definition** — agent quick lookup vs mobile broker UI vs public-site search? Determines scope.
2. **Open House date filter** — implement via OpenHouse entity, or remove the date-range picker?

---

## 2. Goals & Non-Goals

### Goals
- **Single canonical search pipeline** end-to-end: DOM → criteria → API param → OData → Trestle field → mapper → render. Every visible control proven via test or live telemetry.
- **No silently-dead controls.** Every checkbox/input either reaches the backend with a verified mapping OR is disabled with a "Not currently supported" tooltip.
- **Compliance-by-default.** UCBA Art. I §5(C) (no agent info in description), §5(D) (no Off-Market), §16(C) (Coming Soon date), §17 (commission negotiability), Fair Housing screening, NY DOS §175.25, TCPA, CAN-SPAM. Each workflow must pass its compliance gate before merging.
- **Test-first for every behavior change.** Backend filter mappings have unit tests; route side effects have runtime tests; UI flows have manual acceptance tests in `tests/runtime/` or smoke tests via crm-test-runner.
- **Agent productivity.** Search → detail → send-to-client should take ≤3 clicks. Bulk operations should not require leaving the result page.
- **Mobile-friendly broker workflow** (if Quick Search Option C wins) — single-screen flows for showings, inquiry triage, listing lookups while in the field.

### Non-Goals
- Public-site rebuild (`app/search/page.tsx`) — separate domain per Charter §3.
- LMP integration — mallan.nyc is read-only IDX consumer per CLAUDE.md.
- Auction listings (UCBA Art. I exception, post-C3 work).
- Schema redesign — Prisma models stay as-is unless explicit user approval per master plan PR 5.
- VOW (Virtual Office Website) consumer-facing flows for non-buyer/non-tenant clients — that's portal work, not CRM.

---

## 3. Current State Snapshot (2026-05-04)

### Test surface
- **Backend search filter** (`lib/search/__tests__/crm-idx-filter.test.ts`): 31 tests covering type, status, borough, neighborhood (single + multi), address parser, beds/baths/rooms/sqft/year/floors/units, dates (Listed/Updated/Contract/Close), propertySubType, ownership, listingId (single + comma), checkboxFilters whitelist, gridFilter, plus 6 DEAD-pattern regressions.
- **Backend mapper** (`lib/search/__tests__/crm-idx-mapper.test.ts`): 29 tests covering display property type, media classification, IDX Plus pre-filter null semantics (4 tests), full sale mapping, rental mapping, status mapper UCBA exhaustiveness (Off Market → WITHDRAWN, unmapped → UNKNOWN, 13 canonical mappings), Coming Soon date population (4 tests), sponsorUnit JSON parsing (11 tests).
- **Runtime** (`tests/runtime/`): 13 suites, 64 tests. Includes contact form consent + SMTP fail-loud (7 tests, post-A14/A15).
- **Compliance gates** (`lib/compliance/__tests__/`): 90 tests covering all 6 distribution gates and IDX Plus pre-filter conventions.
- **Media** (`lib/media/__tests__/`): 74 tests covering photo-first resolver and R2 sync classifier.
- **Total search-related tests:** 324 (was 278 before this week's batch).

### Production telemetry
- `idx_search_telemetry` value-logging deployed in commit `79c247bc`. Captures filter values + count outcomes per `/api/idx/search` call. Stays in place until full CRM acceptance passes.
- 9 unique param signatures observed in 7-day pull. Most common shape: `borough + minBeds + maxBeds + status + type` for Manhattan/Queens 1-BR sale searches.

### Charter compliance
- **All canonical files used.** No `-v2` / `-new` / `-final` files invented this week.
- **Repo Source-of-Truth Charter** at `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` is the rulebook.

---

## 4. Workflow Specs

For each workflow: **target spec → current state → gap → implementation phase**.

### 4a. Quick Search (mobile broker)

**Target spec (your authorization):**
- RLS ID, address/building, borough/neighborhood, sale/rent, beds, price, status
- Immediate clean result cards
- Mobile-first; single-tap interactions

**Current state:** AMBIGUOUS — interpretation depends on choice:
- **Option A** — "Quick Search" = the existing mini-card inside Basic-mode (RLS ID + Zip + Address + Unit at `search-form-and-results.html:454-534`). Already proven post-A4 (commit `cd3395af` removed the criterion-required gate).
- **Option B** — "Quick Search" = the public website search at `app/search/page.tsx`. Different audience (consumer, not broker), different domain per Charter §3, different field surface (IDX Plus only, no co-broker visibility).
- **Option C** — "Quick Search" = a NEW mobile broker UI (separate route or a `/crm/quick-search` page). Net-new feature with new components + responsive layout.

**Phase decision required.** Until A/B/C is chosen, Phase = **decision-pending**.

**If Option A:** Quick Search is done. Acceptance test: Maya can type RLS ID `RLS20078109` into the Quick Search mini-card → Search → result renders. Already proven by telemetry sample at 06:06:47Z.

**If Option C:** New Phase 1 = wireframe + component design. Out of scope for the current immediate-fix track.

### 4b. Advanced Search (desk)

**Target spec:**
- Full filters grouped by category
- Only fields proven mapped (Batch 3 disabled the rest)
- Unsupported fields hidden until implemented (post-Batch 3 ✅)
- Clear filter chips (active filters visible)
- Count updates from Trestle (post-A7 ✅)
- Save search
- Refine without losing scope (post-A10 ✅)

**Current state:**
| Requirement | Status |
|---|---|
| Filter groups | ✅ existing layout |
| Only proven fields | ✅ post-Batch 3 (`7c88dfe7`) |
| Hide unsupported | ✅ post-Batch 3 |
| Count updates | ✅ post-A7 (`f704dbf1`) |
| Save search | 🟡 exists, not regression-tested |
| Refine without losing scope | ✅ post-A10 (`946bdd69`) |
| **Active-filter chip strip** | ❌ Refine has it; Advanced doesn't |

**Gap A:** Add an "active filters" chip strip at the top of the Advanced Search panel mirroring Refine's chips. Click-to-remove per chip.

**Gap B:** Saved-search regression test. Specifically: load a saved search with `borough` set → verify it routes to `criteria.borough` (not `criteria.neighborhoods`) per A1 contract.

**Phase:** P1 — both gaps small (~50 LOC each).

### 4c. Search Results Workflow

**Target spec:**
- Next/previous result in detail
- Back to exact search
- Persistent result set
- Compare/select listings
- Bulk actions
- Email selected listings to client
- Export/share link or PDF

**Current state:**
| Requirement | Status |
|---|---|
| Next/previous result | ✅ post-A17 (`947a301c`) |
| Back to exact search | ✅ post-A9 (`cd280c75`) |
| Persistent result set | ✅ via sessionStorage `_searchState` (5 min TTL) |
| Compare/select | 🟡 selection works (`.listing-checkbox`); compare-side-by-side UI unverified |
| Bulk actions | 🟡 email-selected works; mark-as / share-as-link / export-CSV unverified |
| Email selected | ✅ `MallanAPI.listingSends.send` route at `app/api/crm/listing-sends/route.ts` |
| Export PDF | ✅ `reports.js` (per `crm-tests/cases-form-validators.js:13`) |
| Share link | ⚠️ broker-auth-gated; no public-portal link from CRM detail |

**Gap A:** Compare-side-by-side flow — verify or implement. Likely panel that takes 2-4 selected listings and shows them in columns.

**Gap B:** Public-portal share link — add a "Copy public URL" button to detail panel that produces `https://mallan.nyc/buy/<slug>-<id>` (pattern already exists per `pagination.js:1164` in `buildAgentMailtoBody`).

**Gap C:** Export-as-CSV for selected listings — verify or add. Useful for spreadsheet workflows.

**Phase:** P1 — Gaps A and C unverified; Gap B is small (~20 LOC).

### 4d. Listing Detail Workflow

**Target spec:**
- Gallery expand/scroll
- Next/previous listing
- Back to results
- Send to client
- Email listing agent
- Request showing/info
- Add note/task
- Add to collection/CMA

**Current state:**
| Requirement | Status |
|---|---|
| Gallery expand | ✅ post-A16 (`947a301c`) |
| Gallery scroll | ✅ existing thumb strip in lightbox |
| Next/previous listing | ✅ post-A17 |
| Back to results | ✅ post-A9 |
| Send to client | ✅ `MallanAPI.listingSends.send` |
| Email listing agent | 🟡 `sendAgentInquiry` exists but uses mailto: + `sendEmailDirect` — no AuditEvent, no Lead/Inquiry row, no REBNY attribution in body |
| Request showing | ❔ `MallanAPI.showings.create` exists; UI flow from detail unverified |
| Add note/task | ❔ Notes exist on client/agent dashboard; from-detail flow unverified |
| Add to collection | ❔ ListingSend creates a "ClientListingAction" row but no explicit "collection" concept; verify |
| Add to CMA | 🟡 `MallanAPI.cma.create` exists; UI flow from detail unverified |

**Gap A — agent email refactor.** Currently a client-side mailto:/HTML send via `sendEmailDirect`. Needs:
- New API route `app/api/crm/agent-inquiry/route.ts`
- AuditEvent on send
- REBNY attribution in body
- Optional Lead/Inquiry row with `source = 'agent_inquiry'`

**Gap B — flows from detail to showing/note/CMA.** Verify each end-to-end. Likely ≤2-3 buttons each + form modal.

**Phase:** P1 (Gap A is medium scope ~80 LOC); P1-research for Gap B.

### 4e. Gallery

**Target spec:** expand/scroll, click thumbs, next/prev photo.

**Current state:** ALL DONE post-A16.

- 4 thumb-grid render paths all open `openPhotoLightbox` ✅
- Lightbox prev/next + keyboard + thumb strip ✅
- Main photo hero arrows (`detailPhotoPrev/Next`) ✅
- Explicit "Expand" button at `pagination.js:142` ✅

**Acceptance test:** see manual test plan in commit `947a301c`. Maya should run all 8 verification steps.

### 4f. Email & Share Center

**Target spec:**

**Client email** must include:
- Selected listings, photos, address/unit, price, beds/baths, maint/taxes, listing status, attribution/disclaimer, agent signature, CTA back to Mallan portal/search.

**Agent email** must include:
- Listing ID, address/unit, client-safe or internal note, clear question/request, sender contact, brokerage info, listing link/reference, audit trail.

**Landing page email** must:
- Fail clearly if SMTP is not configured. Not pretend success. (Done post-A15 for `/api/contact`.)

**Current state (per parallel email-audit, see Section 7 below):**

| Workflow | Status |
|---|---|
| Send selected listings → client | ✅ Working (full spec coverage incl. REBNY footer + tracking URL) |
| Email listing agent | 🟡 mailto: pattern; missing AuditEvent + REBNY attribution |
| Listing inquiry form | 🟡 Lead/Inquiry/AuditEvent ✅; SMTP fail-loud missing |
| Contact form | ✅ post-A14/A15 (TCPA + fail-loud) |
| CMA / valuation | 🟡 Lead/Inquiry/AuditEvent ✅; **TCPA consent NOT enforced**; SMTP fail-loud missing |
| Search alerts (cron) | 🟡 consent ✅ at signup; cron-side SMTP fail-loud missing; no photos in alert template |
| Guide / lead magnet | ❌ Route does not exist |

**Phase:** P0 (CMA consent + SMTP fail-loud across all routes), P1 (agent-inquiry refactor + alert photos).

### 4g. Client Collections

**Target spec:** group selected listings into a named bundle for a client; persist; allow client-portal viewing.

**Current state:**
- ListingSend creates a `ClientListingAction` row per (client, listing, action) tuple (per email audit Section A). This is the closest to a "collection" but is per-action, not a named bundle.
- No explicit `Collection` table in Prisma schema.
- No CRM UI for creating/naming/organizing collections.

**Gap:** Net-new feature. Out of scope for stop-gap track. Phase: **P3 / future master-plan extension.**

### 4h. Saved Searches

**Target spec:** persist criteria; restore later; alert on new matches.

**Current state:**
- `MallanAPI.savedSearches.*` API exists (per `api-client.js:457-492`)
- `saved-searches.js` frontend module exists
- localStorage persistence (`lastSearchCriteria_<agentId>`)
- Cron-driven alert delivery for matched results

**Gap:** Regression test against A1 borough chip — verify a saved search with `criteria.borough` correctly repopulates the autocomplete chip via `selectNeighborhood(name, borough, !borough, ...)` (`saved-searches.js:228`).

**Phase:** P1 — small test addition.

### 4i. CMA / Comps

**Target spec:** subject property → comparables → report → email/share.

**Current state:**
- `MallanAPI.cma.list/get/create` API exists
- CMA-specific search-fields-schema entries
- `app/api/cma/route.ts` lead capture
- Report rendering via `reports.js`

**Gap:** TCPA consent on `/api/cma` (no checkbox required currently). Same SMTP fail-loud gap.

**Phase:** P0 (consent gap is compliance-critical).

---

## 5. Field Contract — Supported vs Unsupported

This section is the canonical reference for what the search backend supports. Each line is backed by either a unit test or a live telemetry sample (or both). Per Bug A8 round 2, this matrix supersedes any static-only inferences.

### 5.1 Supported (proven)

| Field family | API params | OData clause | Test/telemetry evidence |
|---|---|---|---|
| Type | `type=sale\|rental` | `PropertyType ne/eq 'ResidentialLease'` | test + 9 telemetry samples |
| Status | `status=Active\|*\|<comma list>` | `StandardStatus eq 'X'` (or default 3-status fallback) | test + telemetry |
| Borough | `borough=Manhattan\|Brooklyn\|Queens\|Bronx\|Staten Island` | `CityRegion eq 'X'` | test + 11 samples |
| Neighborhood (1+) | `neighborhood=X[,Y,Z]` | `SubdivisionName eq 'X'` (+ alias OR expansion via `expandCrmIdxNeighborhood`) | test + 1 sample |
| Beds | `minBeds`, `maxBeds` | `BedroomsTotal ge/le N` | test + 8 samples |
| Baths | `minBaths`, `maxBaths` | `BathroomsTotalInteger ge/le N` | test (incl. 1.5) |
| Rooms | `minRooms`, `maxRooms` | `RoomsTotal ge/le N` | test |
| SqFt | `minSqft`, `maxSqft` | `LivingArea ge/le N` | test |
| Year built | `minYear`, `maxYear` | `YearBuilt ge/le N` | test |
| Floors | `minFloors`, `maxFloors` | `StoriesTotal ge/le N` | test |
| Units | `minUnits`, `maxUnits` | `NumberOfUnitsTotal ge/le N` | test |
| Price | `minPrice`, `maxPrice` | `ListPrice ge/le N` | test + telemetry |
| Address | `address=<text>` | StreetNumber + direction prefix + StreetName + BuildingName fallback | test (3 branches) |
| Zip | `zip=10001` | `PostalCode eq '10001'` | test |
| Unit | `unit=4A` | `UnitNumber eq '4A'` (uppercased) | test |
| Keyword | `keyword=<text>` | `contains(PublicRemarks, '...')` | test |
| Building name | `buildingName=<text>` | `contains(BuildingName, '...')` | test |
| Management company | `managementCompany=<text>` | `contains(ListOfficeName, '...')` | test |
| PropertySubType (multi) | `propertySubType=A,B` | `(contains(PropertySubType,'A') or 'B')` | test |
| Ownership / CommonInterest (multi) | `ownership=A,B` | `(CommonInterest eq 'A' or 'B')` | test |
| Listing ID (single + multi) | `listingId=A[,B]` | `ListingId eq 'A'` or `(... or ...)` | test + 5 samples |
| Date filters | `dateFrom/To`, `dateType=Listed\|Updated`, `contractDateFrom/To`, `closeDateFrom/To` | `ListingContractDate` / `ModificationTimestamp` / `CloseDate` | test |
| Sponsor unit (post-fetch filter) | `sponsorUnit=true` | post-fetch on `listing.sponsorUnit === true` parsed from `CustomProperty.CustomFields.SponsorUnitYN` | mapper tests; route test pending |
| Whitelisted checkboxFilters | `checkboxFilters=<JSON>` for {ListingAgreement, LandLeaseYN, CoolingYN, GarageYN, DirectionFaces, NewConstructionYN, StructureType, ArchitecturalStyle, BusinessType, PetsAllowedYN, ConstructionMaterials, View, AccessibilityFeatures, ExteriorFeatures, BuildingFeatures, LaundryFeatures, SecurityFeatures} | `${field} eq '${value}'` per item | partial test (CoolingYN, BuildingLaundryFeatures→LaundryFeatures alias) |
| Manhattan grid / transit bounds | `gridFilter=<OData>` (regex-validated) | passed through after regex acceptance | test (regex shape) |

### 5.2 Unsupported / disabled in UI (Batch 3)

| Pattern | Why unsupported | Test contract |
|---|---|---|
| `data-field="AttendanceType"` | Not in OData whitelist | `crm-idx-filter.test.ts:DEAD: non-whitelisted` |
| `data-field="Furnished"` | Not in whitelist | same |
| `data-field="OwnerPays"` | Not in whitelist | same |
| `data-field="Concessions"` | Not in whitelist | same |
| `data-field="BuildingRules"` | Not in whitelist | same |
| `data-field="RentingAllowedYN"` | Not in whitelist | same |
| `data-field="MaximumFinancingPercent"` | Not in whitelist + operator parsing missing | same |
| `data-field="ListOfficeMlsId"` | Not in whitelist | same |
| `data-field="RLSParticipantOnly"` | Not in whitelist | same |
| `data-field="InternetEntireListingDisplayYN"` | REBNY-policy-suppressed at OData $filter level (HTTP 400) | same |
| `data-field="CRM"` (AdvertisingAllowed, DiplomatsAllowed) | No Trestle correspondence | same |
| `data-local-field="CrossListing"` (Listed for Rent / Also for Sale) | Intentionally CRM-internal | same |
| `data-local-field="Conversion"` | CRM-internal | same |
| `data-local-field="ConstructionType"` | CRM-internal | same |
| Operator-prefixed `data-value` (`lte:N`, `gte:N`, `gt:N`, `eq:N`) | Backend builds literal string equality | `DEAD: operator-prefixed` |
| `data-value="Any"` placeholders | No expansion logic | `DEAD: data-value="Any"` |
| `data-not="X"` negations | Frontend scanner reads `data-value`, not `data-not` | `DEAD: data-not negation` |
| Status sub-statuses (OfferOut, ContractSigned, etc.) | statusMap doesn't recognize | `DEAD: status sub-statuses` |
| Open House date filter | No clause in `crm-idx-filter.ts` (would need OpenHouse entity expansion) | `DEAD: openHouseDateFrom/To` |

### 5.3 Implementation rules for new fields

When adding real backend support:
1. Add the corresponding OData clause to `lib/search/crm-idx-filter.ts`
2. Add a unit test that asserts the expected OData
3. Update / remove the corresponding DEAD test in `crm-idx-filter.test.ts:BATCH 2`
4. Remove the corresponding selector from `init-disable-dead-controls.js`
5. Verify in production via `idx_search_telemetry` that the field reaches the backend with a non-zero `trestle_total_count`

---

## 6. Compliance Rules

Sources: `CLAUDE.md`, `data/UCBA-2026-Requirements.md`, `compliance/NYC-NYS-REQUIREMENTS.md`, `.claude/skills/rebny-compliance/SKILL.md`.

### Hard requirements
- **REBNY UCBA Art. I §5(C)** — No agent name/contact in private description, photos, floorplans, or listing comments. Detail panel agent contact must be hidden from non-broker views.
- **REBNY UCBA Art. I §5(D)** — "Off-Market" labeling prohibited. Status mapper exhaustive (post-Batch 4 `075d8e2c`).
- **REBNY UCBA Art. I §5(E)** — No compensation in description or comments.
- **REBNY UCBA Art. I §16(C)** — Coming Soon must disclose specific date "No Showings or Open House until [date]". `comingSoonDate` populated from Trestle ActivationDate (post-Batch 4 `075d8e2c`).
- **REBNY UCBA Art. III §2(C)** — "Listing Courtesy of [Exclusive Broker]" attribution at font size ≥ median of other text on page. Currently 9px in `render-master-detail.js:215` — UCBA risk if surrounding text > 11px.
- **NY DOS 19 NYCRR §175.25** — Every public-facing ad must include "Mallan Real Estate Inc." + office address OR phone. Verify each public surface has the brokerage name.
- **TCPA 47 CFR 64.1200(f)(8)** — Affirmative consent for autodialed/SMS/marketing. Contact form ✅ post-A14. CMA endpoint ❌ — no consent enforcement. Search alerts ✅. Inquiry form ✅.
- **CAN-SPAM 15 USC §7702** — Unsubscribe + sender ID on marketing email. RFC 8058 List-Unsubscribe headers in `lib/email/sendgrid.ts:138-140` ✅.
- **NY SHIELD Act** — Audit logging + IP hashing on all PII-touching writes. AuditEvent rows ✅; `lib/inquiries/create.ts:90` hashes IP via SHA-256.

### Distribution gates (post-A0a)
- Owner Opt-Out → never display
- Participant Only → broker-only, never IDX/public
- Internet Display = false → never display
- Closed > 24h → suppress
- Coming Soon → display + badge + showing-block; date required
- IDX Participation = false → never display

All gates enforced via `lib/compliance/gates.ts:evaluateDisplayGate` with `idxPlusPreFiltered: true` flag for IDX feed (null-as-displayable convention).

### Compliance acceptance gates (must pass before any merge to `main`)
- `npm run ucba:audit` — 0 regressions on the 145-rule checklist
- `npm run rls:validate` — distribution gates green
- `npm run compliance-check` — schema/migration coupling, workflow completeness, side-effect coverage
- `npm run idx:validate` — REBNY field-coverage validator
- `npm run lint && npm run type-check` — code style + types
- All `lib/search/__tests__` + `tests/runtime/` + `lib/compliance/__tests__` + `lib/media/__tests__` green

---

## 7. Acceptance Tests

Each workflow has explicit acceptance criteria. These are the gates the user must pass before declaring a workflow "shipped."

### 7.1 Search (Quick / Advanced / Refine)
1. **Borough chip** → typing "Manh" → click "Manhattan [Borough]" → Search → telemetry shows `borough_value=Manhattan, neighborhood_value=null` and trestle_fetched > 0.
2. **Neighborhood single** → click "Battery Park City" → telemetry shows `borough_value=Manhattan` (auto-derived) + `neighborhood_value=Battery Park City`.
3. **Neighborhood multi** → click "Tribeca" + "SoHo" → telemetry shows `neighborhood_value=Tribeca,SoHo` and OData OR group.
4. **No filters** → Search → returns ~200 active sale listings; no validation toast; no fixture pollution.
5. **RLS ID single** → "RLS20078109" → returns 1 result.
6. **RLS ID comma-separated** → returns N results.
7. **Refine after Queens** → set 1BR → telemetry shows `borough_value=Queens`, results all in Queens.
8. **Reset Search** → no chips, no internal state, next search has no leaked params.
9. **Sponsor toggle** → telemetry shows `params.sponsorUnit=true` → results have purple SPONSOR badge.
10. **Dead-control hover** → all disabled checkboxes show "Not currently supported" tooltip.

### 7.2 Detail
1. Click result card → detail opens.
2. Click main photo → lightbox opens.
3. Click any thumbnail (4 grids) → lightbox opens at correct photo.
4. Lightbox arrows + keyboard arrows + Escape work.
5. Detail Prev/Next visible when length>1; disabled at edges with tooltip.
6. "Back to Results" → returns to exact same page.
7. Browser back from `#detail/X` → restores results section.

### 7.3 Email & Share
1. Send selected listings to client → email arrives with photos, address, price, beds/baths, status, REBNY footer, agent signature, tracking link.
2. Email listing agent → AuditEvent row created (post-Gap-A fix); email body has REBNY attribution.
3. Contact form with consent unchecked → 400 "TCPA required."
4. Contact form with consent + SMTP env missing → 503 "SMTP_NOT_CONFIGURED" with reference id.
5. CMA request with consent unchecked → 400 (post-Batch 4-CMA fix).
6. Search alert signup → consent enforced; cron delivers alert with REBNY footer.

### 7.4 Compliance
1. `npm run ucba:audit` → 0 regressions.
2. `npm run rls:validate` → all sections green.
3. No "OFF MARKET" string in any rendered status badge.
4. No "$0/mo" rendered when source field is null (post-renderer fix).
5. REBNY attribution font ≥ 11px (post-attribution-fix).

---

## 8. Implementation Phases

Phases are ordered by **compliance risk × user-facing impact**. Each phase is one PR-sized batch.

### Phase P0-A — Detail UX (DONE 2026-05-04, commit `947a301c`)
- Gallery thumb-grid → lightbox (3 paths)
- Detail Prev/Next reliable visibility
- Acceptance: §7.2 tests 1–7

### Phase P0-B — Email pipeline compliance (NEXT)
- Contact form TCPA + SMTP fail-loud (DONE post-A14/A15)
- **CMA endpoint TCPA consent**
- **CMA + Inquiries SMTP fail-loud propagation**
- **Cron search-alerts SMTP fail-loud**
- Acceptance: §7.3 tests 3–6

### Phase P1 — Workflow polish
- Active-filter chip strip in Advanced Search (Gap 4b-A)
- Saved-search regression test (Gap 4b-B)
- Compare-side-by-side flow verification/implementation (Gap 4c-A)
- Public-portal share link from CRM detail (Gap 4c-B)
- Export-as-CSV for selected listings (Gap 4c-C)

### Phase P2 — Email completeness
- Agent inquiry refactor: new `/api/crm/agent-inquiry/route.ts` with AuditEvent (Gap 4d-A)
- Inquiry auto-response template adds price/beds/baths
- CMA auto-response adds agent signature
- Search alert template adds photos

### Phase P3 — Larger product decisions
- Quick Search Option C (mobile broker UI) — full design+build if Option C wins
- Client Collections (named bundle of listings, persistent) — schema addition + UI
- Open House date filter via OpenHouse entity expansion

### Phase P4 — Polish + accessibility
- Renderer maint/CC/tax null → "—" everywhere (carry mapper change to UI)
- REBNY attribution font ≥ 11px throughout
- WCAG 2.1 AA audit on detail page + search form
- Keyboard navigation for all primary flows

---

## 9. Out of Scope

- **PR 4** — blocked until CRM acceptance passes per `memory/REFACTOR-2026-04-25.md`
- **Schema changes** — Prisma models stay as-is unless explicit user approval. Master-plan PR 5 owns the projection schema rework.
- **Public-site rewrite** — `app/search/page.tsx` is a separate domain per Charter §3.
- **VOW consumer flows** — portal work, not CRM.
- **Auction listings** — UCBA Art. I exception, post-C3 work.
- **LMP submission** — mallan.nyc is read-only IDX consumer. The external LMP owns submission.
- **AI / embeddings on MLS data** — explicitly prohibited by REBNY (CLAUDE.md "PROHIBITED").

---

## 10. References

### Patches landed in this rebuild track (chronological)
- `2483b7b1` — A1 borough chip routing
- `cd3395af` — A4 quickSearch unified
- `856d99d0` — A5/A6 fixture pollution removed
- `f704dbf1` — A7 live-match badge real Trestle count
- `cd280c75` — A9 back-button restores results UI
- `946bdd69` — A10 Refine routes through `_serverSearch`
- `33f2a630` — A11/A12 Sponsor wired to CustomFields.SponsorUnitYN
- `4e2028a9` — A13 RLS ID honest labels + comma-separated
- `375ab782` — A14/A15 TCPA consent + SMTP fail-loud (contact form)
- `c7a294c6` — Backend filter test coverage + DEAD-pattern regressions (24 new tests)
- `075d8e2c` — Mapper UCBA + Coming Soon + Sponsor parsing tests (21 new tests)
- `7c88dfe7` — Batch 3: dead UI controls disabled with tooltip
- `d3491598` — Bug-X2 autocomplete dropdown clipping
- `947a301c` — A16/A17 detail gallery thumbs → lightbox + reliable Prev/Next

### Test catalog
- `lib/search/__tests__/crm-idx-filter.test.ts` — 31 tests (backend OData filter)
- `lib/search/__tests__/crm-idx-mapper.test.ts` — 29 tests (Trestle → CRM listing shape)
- `tests/runtime/contact-form-consent.test.ts` — 7 tests (TCPA + SMTP fail-loud)
- `lib/compliance/__tests__/compliance-gates.test.ts` — 90 tests (6-gate enforcement)
- `lib/media/__tests__/listing-media-resolver.test.ts` — 38 tests (photo-first ordering)
- `lib/media/__tests__/media-sync-service.test.ts` — 36 tests (R2 key generation, Trestle classifier)

### Canonical files (per Charter)
- `lib/search/crm-idx-filter.ts` — OData filter builder
- `lib/search/crm-idx-mapper.ts` — Trestle → CRM listing mapper
- `lib/idx/trestle-mapper.ts` — DB-write mapper + distribution gates
- `lib/idx/fetch.ts` — Trestle OData fetch helper
- `app/api/idx/search/route.ts` — CRM live-search endpoint
- `app/api/contact/route.ts` — Contact form
- `lib/email/sendgrid.ts` — M365 SMTP send + RFC 8058 unsubscribe headers
- `lib/email/templates.ts` — Email body templates
- `lib/inquiries/create.ts` — Inquiry row creator with IP hashing
- `public/crm/html/search-form-and-results.html` — CRM search source HTML
- `public/crm/js/search/*.js` — CRM search frontend
- `public/crm/js/init/init-disable-dead-controls.js` — dead-control disable layer
- `public/crm/index-built.html` — generated; rebuild via `npm run crm:build`

### Memory + spec files
- `memory/REFACTOR-2026-04-25.md` — master-plan PR sequence (CRM acceptance gates PR 4)
- `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` — external-inventory hold
- `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` — canonical-files rulebook
- `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` — held spec
- `docs/superpowers/specs/2026-04-30-sponsor-database-design.md` — held spec

---

## 11. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-03 | Disable dead UI controls instead of silent no-op | User: "Do not allow visible controls that silently do nothing." |
| 2026-05-04 | Use route-layer SMTP fail-loud, not lib-layer throw | Many other routes use sendEmail with non-fatal try/catch; route-layer keeps change scoped |
| 2026-05-04 | Sponsor filter post-fetch, not OData $filter | `SponsorUnitYN` lives in CustomFields JSON string, not OData-filterable |
| 2026-05-04 | Quick Search Option A/B/C — pending | Need user direction before scoping Phase 3 |
| 2026-05-04 | Web ID lookup not in scope | No canonical Trestle Property field; if needed, separate `SourceSystemKey` feature |

---

## 12. Spec self-review (per superpowers:brainstorming)

- **Placeholder scan:** No "TBD" / "TODO" / vague requirements. Every line item has a status verdict.
- **Internal consistency:** Compliance rules in §6 align with acceptance gates in §7.4. Phase ordering in §8 reflects dependency chain (P0-B email blocks P2 email completeness; P3 product decisions are independent).
- **Scope check:** Document is plan-of-record for the rebuild track, not a single PR. Each phase is independently mergeable.
- **Ambiguity check:** Section 4a Quick Search has explicit Option A/B/C — flagged as decision-pending. All other workflows have specific gap statements with file:line references.

---

**End of design doc.** Next session should review §8 phase order and authorize the next batch in sequence.
