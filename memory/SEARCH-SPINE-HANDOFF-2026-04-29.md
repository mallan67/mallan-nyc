# Search Spine Compliance Handoff - 2026-04-29

## Source Request

User asked to review `C:\Users\MayaAllan\Desktop\1\... backend.txt`, read the repo, identify what is available, what can be done, and keep the work compliant. The brief framed the backend as an anti-shell-execution/compliance architecture effort and pushed toward a unified backend/search operating spine.

## Initial Repo Diagnosis

- The real backend is the root Next.js/Prisma application. `backend/app/main.py` is only a small FastAPI stub with in-memory agents/leads and unsafe request logging; it should not be treated as the compliant CRM backend.
- Search existed but was fragmented. Public search, CRM IDX search, saved-search execution, and search-alert cron each had separate criteria, gate, mapping, and output logic.
- The strongest compliance foundation already existed in:
  - `lib/compliance/gates.ts`
  - `lib/idx/trestle-mapper.ts`
  - `lib/idx/db-to-public-dto.ts`
  - Prisma `Listing` compliance fields
  - validators/scripts in `package.json` such as `idx:validate`, `rls:validate`, `ucba:audit`, `test:compliance`, and `compliance-check`
- Key risk found: some routes drifted from fail-closed semantics, especially address and entire-listing display gates when fields were null or undefined.
- Event/intelligence infrastructure exists, but not every client-side signal route is wired. `PortalEvent` is read in several routes but writer coverage appears thin.
- Docker compose still references `./frontend`, which does not exist locally.
- Some referenced docs from the external brief were missing locally: `memory/implementation-notes.md`, `memory/compliance-audit-log.md`, and `docs/CRM-SEARCH-DEEP-AUDIT-2026-03-23.md`.

## First Implemented Slice

Goal: create a centralized search policy/core and move the smallest high-value consumers onto it before touching larger public/IDX routes.

Added:

- `lib/search/listing-access-decision.ts`
  - Shared fail-closed display gate where fragment.
  - Status normalization for active display statuses.
  - `decideListingAccess()`
  - `canDisplayListingAddress()`
  - `isListingDisplayable()`
- `lib/search/criteria-to-prisma.ts`
  - Shared saved-search criteria to Prisma `ListingWhereInput`.
  - Supports snake_case and camelCase criteria.
  - Normalizes `rent`/`rental` aliases.
  - Applies modification timestamp for alert runs.
- `lib/search/core.ts`
  - `runListingSearch()`
  - `serializeSearchListing()`
  - `sanitizeSearchAddress()`
  - `formatSearchAlertAddress()`
- `lib/search/search-run-recorder.ts`
  - Durable `search_run` audit events for saved-search execution and alert cron.
- `lib/search/__tests__/criteria-to-prisma.test.ts`
  - Tests for fail-closed gates, active-status defaults, rental aliases, modification timestamp filters, and address suppression.

Updated:

- `app/api/crm/saved-searches/[id]/execute/route.ts`
  - Removed route-local criteria builder.
  - Uses `runListingSearch()`.
  - Serializes through shared search serialization.
  - Records durable search-run audit event.
- `app/api/cron/search-alerts/route.ts`
  - Removed duplicate weaker gate logic.
  - Uses `runListingSearch()` with `modifiedSince`.
  - Formats alert addresses through fail-closed shared helper.
  - Records durable search-run audit events.
- `app/api/crm/saved-searches/route.ts`
  - Accepts both `rent` and `rental`.
- `lib/compliance/gates.ts`
  - Fixed terminal-status logic so Closed/Expired listings within 24 hours match existing UCBA compliance tests, while Closed/Expired beyond 24 hours fail display.
- `scripts/ci-compliance-check.js`
  - Updated search-alert address-display check to recognize the shared helper instead of requiring inline duplicate gate code.

## Second Implemented Slice

Goal: move smaller portal listing surfaces onto shared display decisions before touching the large public search route.

Updated:

- `app/api/portal/listings/route.ts`
  - Uses `isListingDisplayable()` before `sanitizeListingForPortal()`.
- `app/api/portal/favorites/route.ts`
  - Uses `buildSearchDisplayWhere()`.
  - Selects required portal DTO fields, including `internet_address_display_yn`.
  - Uses `sanitizeListingForPortal()` instead of returning raw listing address data.
- `app/api/portal/listings/[id]/react/route.ts`
  - Uses `isListingDisplayable()` before allowing reactions.
- `app/api/portal/listings/[id]/comments/route.ts`
  - Uses `isListingDisplayable()` for GET and POST access checks.

## Third Implemented Slice

Goal: start the public `/api/listings` migration with the lowest-risk change: reuse shared gate constants in the DB-backed public paths while leaving live Trestle fallback, media backfill, geocoding, open-house filtering, and exclusive merge behavior intact.

Updated:

- `app/api/listings/route.ts`
  - Imports `buildSearchDisplayWhere()` and `SEARCH_DISPLAY_GATE`.
  - DB-first RLS-eligible path now uses `SEARCH_DISPLAY_GATE`.
  - DB-first status filter now uses the shared active display status set.
  - Local exclusive listing fetch now uses the shared status/gate helpers.

## Fourth Implemented Slice

Goal: fix the public listing detail DB path that was explicitly flagged in the original review as fail-open on null/undefined display gates.

Updated:

- `app/listing/[id]/page.tsx`
  - Imports `isListingDisplayable()` and `canDisplayListingAddress()`.
  - RLS-backed DB detail pages now fail closed through the shared display gate.
  - Address suppression now fails closed on missing/non-affirmative `internet_address_display_yn`.
  - Existing website-only/commercial `rls_eligible=false` bypass behavior is preserved.

## Fifth Implemented Slice

Goal: tighten portal mutation paths that allow clients to act on listings. These had the same route-local owner/participant/internet-display checks and failed open on missing entire-listing permissions.

Updated:

- `app/api/portal/offers/route.ts`
  - Offer submission now uses `isListingDisplayable()` before creating the offer action.
- `app/api/portal/showings/route.ts`
  - Showing requests now use `isListingDisplayable()` before applying the existing Coming Soon no-showing block.

## Sixth Implemented Slice

Goal: continue independent gate consolidation outside the larger `/api/listings` filter migration. This touched analytics, recommendations, comparable listings, and similar listings without changing live Trestle fallback behavior.

Updated:

- `app/api/portal/comparables/route.ts`
  - Comparable query now uses `SEARCH_DISPLAY_GATE`.
- `app/api/listings/similar/route.ts`
  - DB-first similar-listing query now uses `SEARCH_DISPLAY_GATE`.
- `lib/cma/engine.ts`
  - CMA comparable query now uses `SEARCH_DISPLAY_GATE`.
  - CMA address output now uses `canDisplayListingAddress()` instead of truthy `internet_address_display_yn`.
- `lib/buyer-intent/recommender.ts`
  - Recommendation query now uses `SEARCH_DISPLAY_GATE`.
  - Recommendation address output now uses `canDisplayListingAddress()` instead of truthy `internet_address_display_yn`.
- `lib/market-pulse/snapshot.ts`
  - Market snapshot base query now uses `SEARCH_DISPLAY_GATE`.
- `lib/listing-momentum/scorer.ts`
  - Active listing batch now uses `buildSearchDisplayWhere()`, adding the missing participant-only and entire-listing gates.
- `lib/social-proof/cache.ts`
  - Active listing batch now uses `buildSearchDisplayWhere()`, adding the missing participant-only and entire-listing gates.

## Seventh Implemented Slice

Goal: wire missing analytics endpoints referenced by mounted client components, without schema changes and without making analytics failures user-visible.

Updated:

- `lib/behavioral/events.ts`
  - `BehavioralEventInput` now accepts optional `leadId`.
  - `recordBehavioralEvent()` persists `lead_id` when available while preserving anonymous session support.
- `app/api/analytics/behavioral/route.ts`
  - New POST endpoint for `BehavioralTracker`.
  - Validates events through `isValidBehavioralEvent()`.
  - Records anonymous behavioral events.
  - Links to authenticated lead sessions when available.
  - Returns 204 and fails soft on malformed input or persistence errors.
- `app/api/analytics/intent/route.ts`
  - New POST endpoint for `IntentTracker`.
  - Records only authenticated lead intent events because `IntentEvent.lead_id` is required by schema.
  - Upserts `BuyerIntentProfile` event count and `last_event_at`.
  - Returns 204 for anonymous/malformed calls so public browsing is not blocked.

## Eighth Implemented Slice

Goal: wire `PortalEvent` writers so portal activity dashboards have durable events instead of read-only empty surfaces.

Added:

- `lib/portal/events.ts`
  - New fail-soft `recordPortalEvent()` helper.
  - Normalizes workspace values and falls back to the lead's primary/legacy role if the caller does not pass one.
  - Writes `lead_id`, `workspace`, `event_type`, optional listing/property/campaign IDs, and JSON metadata.

Updated:

- `app/api/portal/listings/[id]/react/route.ts`
  - Records `reaction` events for toggles on and off.
- `app/api/portal/listings/[id]/comments/route.ts`
  - Records `comment_add` events after successful comment creation.
- `app/api/portal/offers/route.ts`
  - Records buyer-side `offer_submit` events.
  - Records owner-side `offer_view` events when the listing has `owner_client_id`, matching seller/landlord dashboard reads.
- `app/api/portal/showings/route.ts`
  - Records requester-side `showing_request` events.
  - Records owner-side `showing_request` events when the listing has `owner_client_id`.

## Ninth Implemented Slice

Goal: add CI guardrails so the fail-open listing gate bugs fixed in this work do not reappear.

Updated:

- `scripts/ci-compliance-check.js`
  - Added `lineHits()` helper for line-level regression reporting.
  - Added public/portal surface scans for:
    - `internet_entire_listing_display_yn === false` / `!== false`
    - `idx_display_yn === false` / `!== false`
    - `internet_address_display_yn &&`
    - `internet_address_display_yn !== false`
  - Added an ad hoc `idx_display_yn: true` filter check requiring either a canonical helper or the full gate set.
  - Compliance check total increased from 80 to 85 passing checks.

## Tenth Implemented Slice

Goal: connect anonymous browsing/behavioral sessions to identified leads at conversion points, without changing schema or making analytics failures user-visible.

Added:

- `lib/behavioral/session-link.ts`
  - Extracts supported session ID fields from request bodies: `sessionId`, `session_id`, `behavioralSessionId`, and `anonymous_session_id`.
  - Validates session IDs with bounded length and a conservative character set.
  - Links anonymous `BehavioralEvent` rows to a `Lead`.
  - Stores `Lead.anonymous_session_id` for future lead intelligence.
  - Fails soft and falls back to the existing `linkSessionToLead()` helper.
- `app/api/identity/capture/route.ts`
  - New missing endpoint for `SoftIdentityCapture`.
  - Rate limited through the shared route limiter.
  - Upserts a minimal lead from email-only capture.
  - Links the anonymous behavioral session to the lead.
  - Writes an audit event and best-effort `Inquiry` row.

Updated:

- `app/sign-up/page.tsx`
  - Sends `mallan_behavioral_session` as `sessionId` during account creation.
- `app/contact/page.tsx`
  - Sends `mallan_behavioral_session` as `sessionId` during contact submission.
- `app/sign-in/page.tsx`
  - Sends `mallan_behavioral_session` as `sessionId` during login.
- `app/api/sign-up/route.ts`
  - Links the submitted anonymous session to the newly created lead.
- `app/api/contact/route.ts`
  - Links the submitted anonymous session to the upserted contact lead.
- `app/api/auth/login/route.ts`
  - Links the submitted anonymous session to the authenticated lead after successful client login.
- `app/components/SoftIdentityCapture.tsx`
  - Sends `listingId` to the new capture route.
  - Includes agency disclosure and anti-discrimination notice because it is a lead-capture surface.
- `lib/inquiries/create.ts`
  - Adds `soft_identity_capture` as a supported inquiry source.
- `lib/middleware/rate-limiter.ts`
  - Adds a dedicated `identity_capture` limiter.
- `scripts/ci-compliance-check.js`
  - Adds `SoftIdentityCapture` to agency-disclosure and anti-discrimination guardrails.

## Validation Already Run

After the first slice:

- `npx jest --config lib/search/jest.config.js` passed: 170/170
- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed
- `npm run idx:validate` passed with existing warning posture: 0 critical, 6 warnings

After the portal slice:

- `npx jest --config lib/search/jest.config.js` passed: 171/171
- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After the first public `/api/listings` DB-backed gate reuse:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 171/171
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After the public listing detail fail-closed fix:

- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After portal offer/showing mutation gate reuse:

- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After independent analytics/comparable/similar-listing gate consolidation:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 171/171
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After missing analytics endpoint wiring:

- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After PortalEvent writer wiring:

- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 80 passed, 0 failed

After fail-open regression guardrails:

- `npm run compliance-check` passed: 85 passed, 0 failed
- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 171/171
- `npm run test:compliance` passed: 194/194

After anonymous session-to-lead linking:

- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87 passed, 0 failed
- `npm run test:runtime` was attempted. 11/12 runtime suites passed, but the suite failed on existing environment/dependency setup because `crm:test` could not load `jsdom` from `node_modules`. `jsdom` is already declared in `package.json` and `package-lock.json`; the local install appears incomplete.

## Current Working Tree Scope

The first nine slices were committed in `ac385564 Build compliant search spine`.

The current uncommitted slice is the anonymous session-to-lead linking work:

- `app/api/auth/login/route.ts`
- `app/api/contact/route.ts`
- `app/api/identity/capture/route.ts`
- `app/api/sign-up/route.ts`
- `app/components/SoftIdentityCapture.tsx`
- `app/contact/page.tsx`
- `app/sign-in/page.tsx`
- `app/sign-up/page.tsx`
- `lib/behavioral/session-link.ts`
- `lib/inquiries/create.ts`
- `lib/middleware/rate-limiter.ts`
- `scripts/ci-compliance-check.js`
- `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md`

## Remaining Fragmentation

Still not migrated:

- Public `/api/listings` DB-first path.
- Public `/api/listings` live Trestle fallback path.
- CRM `/api/idx/search` direct Trestle path.
- Portal surfaces beyond listings, favorites, comments, offers, showings, and comparables.
- Deeper market/reporting surfaces beyond the first CMA/recommendation/momentum/social-proof consolidation.
- Social OAuth callbacks do not yet receive/link the browser's anonymous behavioral session.
- Stale FastAPI backend stub and stale `docker-compose.yml` frontend service.

## 2026-04-29 02:31 ET Checkpoint

The waiting window has passed. Local time verified at **2026-04-29 02:31:22 -04:00**. Working tree was clean before continuing.

Current local commit stack above `origin/main`:

- `ac385564 Build compliant search spine`
- `d54b4395 Link anonymous sessions to leads`
- `3599d293 Remove vulnerable xlsx dependency`
- `fd5131d1 docs(memory): capture 2026-04-29 backend audit`
- `44acc025 Add buyer financial intent tracking`

Buyer portal/CRM slice added after the search spine:

- Buyer calculator/tool usage now emits structured `IntentEvent` payloads for affordability, rent-vs-buy, mortgage, closing costs, cash needed, down payment, and monthly-payment tolerance.
- New assigned-agent/broker route: `GET /api/crm/clients/[id]/financial-intent`.
- New summarizer: `lib/buyer-intent/financial-intent.ts`, with tests.
- Scope is intentionally schema-light and permissioned: broker can view any client; non-broker agents can view only their assigned client.

Buyer-slice validation:

- `npm run type-check` passed
- `npm run lint` passed
- `npx jest --config lib/buyer-intent/jest.config.js` passed: 2/2
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

## Eleventh Implemented Slice

Goal: continue the original public-search migration without touching the live Trestle fallback path.

Added:

- `lib/search/public-listing-db.ts`
  - Extracts DB-first `/api/listings` where/order construction into the shared search package.
  - Preserves the two-path display model:
    - RLS-eligible listings must pass the full shared fail-closed gate.
    - Website-only `rls_eligible=false` listings remain available for non-RLS Mallan-owned inventory.
  - Handles public filter params for type, commercial, price, beds, baths, sqft, borough, neighborhood-to-ZIP, `zipCodes`, status/statuses, property subtypes, address JSON search, and public sort modes.
- `lib/search/__tests__/public-listing-db.test.ts`
  - Covers full gate preservation, public filter translation, DB-backed address search, and special sort filters.

Updated:

- `app/api/listings/route.ts`
  - DB-first public path now delegates where/order construction to `buildPublicListingDbSearch(searchParams)`.
  - Live Trestle fallback, media/geocoding, open-house filtering, DTO mapping, and exclusive merge behavior were intentionally left untouched.

Validation:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 175/175
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87
- `npm run lint` passed

## Twelfth Implemented Slice

Goal: continue CRM `/api/idx/search` migration with a behavior-preserving extraction before touching Trestle fetch or CRM result mapping.

Added:

- `lib/search/crm-idx-filter.ts`
  - Extracts the CRM IDX OData filter builder from `app/api/idx/search/route.ts`.
  - Keeps neighborhood alias expansion, OData string escaping, sale/rent filters, status defaults/wildcard, address parsing, date filters, building/management/property/ownership filters, safe checkbox filters, safe grid filters, and direct `listingId` lookup.
- `lib/search/__tests__/crm-idx-filter.test.ts`
  - Covers sale/rent filters, default and explicit statuses, status wildcard, OData escaping, address search, date/building filters, ownership/property subtype filters, safe checkbox filters, and grid filters.

Updated:

- `app/api/idx/search/route.ts`
  - Now imports and calls `buildCrmIdxODataFilter(params)`.
  - Keeps auth, Trestle fetch, distribution gates, media handling, mapping, caching, and response shape unchanged.

Validation:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 181/181
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

## Thirteenth Implemented Slice

Goal: finish the CRM `/api/idx/search` behavior-preserving extraction by moving the Trestle-to-CRM result mapper into shared search code.

Added:

- `lib/search/crm-idx-mapper.ts`
  - Extracts `mapTrestleToCRM()`, property-type display mapping, and media-category classification from `app/api/idx/search/route.ts`.
  - Preserves fail-closed address suppression with `affirmPermission()`.
  - Preserves CRM flat response fields, rental monthly-price behavior, Trestle media proxying, status normalization, DPA fields, searchable checkbox pass-through fields, and permission flags.
- `lib/search/__tests__/crm-idx-mapper.test.ts`
  - Covers address suppression, affirmative internet display, media proxying, floorplan classification, status normalization, sales monthly cost, price-change fields, DPA fields, property labels, and rental total-monthly behavior.

Updated:

- `app/api/idx/search/route.ts`
  - Now imports `mapTrestleToCrmListing()` from the shared search package.
  - Keeps auth, Trestle fetch, distribution gates, cache, media backfill, and response shape unchanged.

Validation:

- `npm run type-check` passed
- `npx jest --config lib/search/jest.config.js` passed: 186/186
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

## Recommended Next Move

Do not rewrite all of `/api/listings` at once. It mixes:

- DB-first search
- live Trestle fallback
- media backfill
- geocoding
- bounds filtering
- open-house filtering
- exclusive-listing merge
- public DTO mapping
- caching and audit logging

The safer next slice is to extract only the DB-first public listing where-building into a shared helper or adapt it incrementally to `criteriaToPrismaWhere()` while preserving its extra public filters. Keep Trestle live-search untouched until DB-first is passing tests and compliance checks.

Suggested next steps:

1. Add support in `criteria-to-prisma.ts` for public filters currently used by `/api/listings`: `propertySubTypes`, `zipCodes`, address search, commercial/new-development sort filters, and status/statuses aliases.
2. Gradually replace DB-first route-local filters with tested shared helpers, one filter family at a time.
3. Preserve website-only/commercial `rls_eligible=false` behavior explicitly if it is still required.
4. Add tests around null gates, address suppression, status aliases, and public filter translation.
5. Run:
   - `npm run type-check`
   - `npx jest --config lib/search/jest.config.js`
   - `npm run test:compliance`
   - `npm run compliance-check`
   - `npm run idx:validate`

## Legal/Compliance Note

This is an engineering compliance implementation and audit trail, not legal sign-off. Current external context checked during review: NY DOS real-estate advertising guidance, REBNY RLS FAQ, and NYC DCWP FARE Act FAQ. Any policy-sensitive production release should still be reviewed by the responsible broker/legal owner.

## Fourteenth Implemented Slice

Goal: make the buyer financial-intent tracking visible to the assigned agent or broker inside the client workspace.

Updated:

- `public/crm/js/dashboard/workspace.js`
  - Added a Buyer Tool Signals card to the Financial tab.
  - Calls the protected CRM endpoint at `/api/crm/clients/[id]/financial-intent`.
  - Shows tools used, total financial events, highest budget tested, latest/highest monthly payment, cash needed, closing costs, stated budget context, pre-approval context, stretch amount/percent, intent stage/strength, and recent tool activity.
  - Keeps display read-only and scoped to the existing workspace client id.
  - Preserves the existing saved-scenarios and local calculator workflows.

Validation:

- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run type-check` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next portal/CRM slices:

1. Add a buyer external-listing link intake model/API so registered or invited buyers can add non-IDX listing links without mixing those records into IDX listings.
2. Add buyer shortlist buckets for saved, liked, disliked, seen, and discuss/request-info states, using existing `ClientListingAction` where possible.
3. Add buyer family/friend invite acceptance and permission boundaries per buyer portal.
4. Add agent/broker dashboard panels that roll up buyer portal activity across all assigned clients.
5. Mirror the same approach for seller portal valuation/proceeds/closing-cost signals after buyer activity is stable.

## Fifteenth Implemented Slice

Goal: let buyers submit and track non-IDX listing links/addresses without contaminating IDX/MLS listing data.

Added:

- `ExternalListing` Prisma model and migration `20260429030000_add_external_listings`.
  - Stores buyer-submitted outside links/addresses in `external_listings`.
  - Keeps records separate from `Listing`.
  - Tracks owner lead, submitting lead, assigned agent, URL, normalized URL, source host, address, notes, status, bucket, and timestamps.
- `lib/external-listings/normalize.ts`.
  - Normalizes http(s) listing URLs.
  - Extracts source host.
  - Rejects unsafe/non-http URLs unless an address is provided.
  - Normalizes allowed buckets/status values.
  - Serializes BigInt/Date values for API responses.
- `app/api/portal/external-listings/route.ts`.
  - Buyer workspace GET/POST endpoint.
  - Creates durable external-listing records.
  - Logs `external_listing_submitted` audit events.
  - Records portal events for buyer activity.
- `app/api/crm/clients/[id]/external-listings/route.ts`.
  - Agent/broker read endpoint for a client’s outside listings.
  - Agents are scoped to assigned clients; brokers can view all.
- `lib/external-listings/__tests__/normalize.test.ts`.

Updated:

- `app/portal/buyer/page.tsx`
  - Existing “Send a listing link or address” flow now saves a durable external listing.
  - Renders “Outside Listings” separately from agent-shared IDX listings.
  - Labels outside listings as not IDX inventory.

Validation:

- `npx prisma generate` passed
- `npm run type-check` passed
- `npm run lint` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next buyer slice:

Add bucket-changing actions for external listings (`seen`, `liked`, `disliked`, `discuss`) and expose those buckets in the agent/broker CRM client workspace alongside IDX listing reactions.
