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
- `npm run ops:health` passed: healthy, storage 44.8%, no sync errors

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

## Sixteenth Implemented Slice

Goal: let brokers and agents add outside inventory for a client from the CRM, because IDX Plus Web API coverage may not include every listing source agents need to consider.

Updated:

- `app/api/crm/clients/[id]/external-listings/route.ts`
  - Added `POST`.
  - Agents can add outside listings for assigned clients.
  - Brokers can add outside listings for any client.
  - Uses the same external-listing normalization and validation as the buyer portal.
  - Upserts by normalized URL per client when a URL exists.
  - Defaults agent-created records to `reviewing` status.
  - Logs `external_listing_added_by_agent`.
- `public/crm/js/dashboard/workspace.js`
  - Added an Outside Listings card to the client Listings tab.
  - Agents/brokers can enter an outside listing URL, address, notes, and bucket.
  - Displays existing outside listings with clear “Not IDX Inventory” labeling.
  - Keeps outside inventory separate from IDX search and sent IDX listing records.

Validation:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

## Save Checkpoint After Sixteen Slices

Current local implementation state:

- Search spine and compliance gate centralization are committed.
- Public DB-first listing search extraction is committed.
- CRM IDX OData filter extraction is committed.
- CRM IDX result mapper extraction is committed.
- Buyer financial intent tracking is committed.
- CRM Buyer Tool Signals visibility is committed.
- Buyer external-listing intake is committed.
- Broker/agent external-listing intake from the CRM is committed.
- Repo memory and Desktop memory copies have been kept in sync.

Important deployment note:

- Commit `be6414cc Add buyer external listing intake` includes migration `20260429030000_add_external_listings`.
- Per `NEON.md`, production must run `prisma migrate deploy` manually before deploying code that depends on `external_listings`.

Next steps left, in recommended order:

1. Add external-listing bucket updates from both buyer portal and CRM: `saved`, `seen`, `liked`, `disliked`, `discuss`.
2. Surface external-listing bucket activity in the CRM client workspace next to IDX reactions.
3. Add comments/notes/request-info threads for external listings, separate from IDX `Comment`.
4. Add showing/request workflow for external listings without requiring a `Listing` row.
5. Add family/friend visibility rules for buyer portal outside listings.
6. Add broker/agent dashboard rollups for buyer portal activity across assigned clients.
7. Start seller portal signal capture: valuation requests, proceeds estimates, seller closing costs, readiness signals.
8. Start seller CRM visibility panels mirroring the buyer tool-signal pattern.
9. Continue portal-specific buildout for tenant, landlord, seller, and buyer independently.
10. Apply and verify the external-listing migration in the target database before production rollout.

## Seventeenth Implemented Slice

Goal: complete bucket updates for external listings from both buyer portal and CRM.

Added:

- `app/api/portal/external-listings/[id]/route.ts`
  - Buyer-owned `PATCH`.
  - Allows only the owning buyer lead to update the bucket.
  - Valid buckets: `saved`, `seen`, `liked`, `disliked`, `discuss`.
  - Logs `external_listing_bucket_updated`.
  - Records a buyer portal event.
- `app/api/crm/clients/[id]/external-listings/[externalId]/route.ts`
  - Agent/broker `PATCH`.
  - Agents are scoped to assigned clients; brokers can update any client.
  - Uses the same bucket whitelist.
  - Logs `external_listing_bucket_updated_by_agent`.

Updated:

- `lib/external-listings/normalize.ts`
  - Exports `normalizeExternalListingBucket()`.
- `app/portal/buyer/page.tsx`
  - Adds outside-listing bucket buttons for `saved`, `seen`, `liked`, `discuss`, and `pass`.
  - Updates buyer portal state after the PATCH response.
- `public/crm/js/dashboard/workspace.js`
  - Adds bucket buttons on each Outside Listing card in the CRM client Listings tab.
  - Updates cached CRM state after the PATCH response.

Validation:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

Add comments/request-info threads for external listings, separate from IDX `Comment`, so buyers, family members, agents, and brokers can discuss outside inventory without requiring an IDX `Listing` row.

## Eighteenth Implemented Slice

Goal: add durable comments/request-info threads for external listings, separate from IDX `Comment`.

Added:

- `ExternalListingComment` Prisma model and migration `20260429033000_add_external_listing_comments`.
  - Stores comments and request-info records for non-IDX external listings.
  - Supports buyer/lead-authored and agent-authored comments.
  - Keeps these records isolated from IDX `Listing` and `Comment`.
- `app/api/portal/external-listings/[id]/comments/route.ts`
  - Buyer-owned GET/POST thread endpoint.
  - Allows comment and request-info entries.
  - Logs `external_listing_comment_added`.
  - Records buyer portal events.
- `app/api/crm/clients/[id]/external-listings/[externalId]/comments/route.ts`
  - Agent/broker GET/POST thread endpoint.
  - Agents scoped to assigned clients; brokers can access all clients.
  - Logs `external_listing_comment_added_by_agent`.

Updated:

- `lib/external-listings/normalize.ts`
  - Adds comment body/request-type normalization and comment serialization.
- `app/portal/buyer/page.tsx`
  - Shows notes/request-info threads under each Outside Listing.
  - Buyers can add notes or send request-info messages to their agent.
- `public/crm/js/dashboard/workspace.js`
  - Shows external-listing notes in the CRM client Listings tab.
  - Agents/brokers can reply from the same Outside Listings card.

Validation:

- `npx prisma generate` passed
- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 4/4
- `npm run lint` passed
- `npm run crm:test` passed: 39/39
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87
- `npm run ops:health` passed: healthy, storage 44.8%, no sync errors

Deployment note:

- Production now needs both external-listing migrations before this workflow can run safely:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`

Next recommended slice:

Add external-listing showing/request workflow so a buyer can ask to tour or investigate an outside listing without requiring an IDX `Listing` row.

## Nineteenth Implemented Slice

Goal: add an external-listing tour/request workflow without adding another migration.

Updated:

- `app/portal/buyer/page.tsx`
  - Adds a `Request Tour` button on each Outside Listing.
  - Uses the existing external-listing comment endpoint with `request_type: "showing_request"`.
  - Allows the buyer to submit a tour/investigation request even when they have not typed a custom note.
  - Displays `Tour` and `Info` badges inside the Outside Listing thread.
- `public/crm/js/dashboard/workspace.js`
  - Displays `Tour` and `Info` badges in the CRM Outside Listing notes thread.
  - Agents/brokers can distinguish ordinary notes, request-info messages, and tour/investigation requests.

Validation:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

Add buyer family/friend visibility rules for Outside Listings so invited collaborators can see and discuss the correct subset without broadening client data access.

## Twentieth Implemented Slice

Goal: add buyer family/friend visibility rules for Outside Listings.

Added:

- `family_visible` on `ExternalListing`.
- Migration `20260429040000_add_external_listing_family_visibility`.
- `lib/external-listings/access.ts` for fail-closed portal access checks.

Updated:

- Buyer portal Outside Listings can be shared with invited family/friends.
- Buyer-owned outside listings remain private by default.
- Invited family/friends can only see outside listings where `family_visible = true`.
- Invited family/friends can comment, request info, and request a tour on shared outside listings.
- Family members cannot update the buyer's outside-listing bucket or sharing setting.
- CRM Outside Listings now show whether each outside listing is private or family-visible.
- CRM external-listing threads now identify commenters as buyer, family, agent, or broker.

Validation:

- `npx prisma generate` passed
- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 6/6
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Deployment note:

- Production now needs all three external-listing migrations before this workflow can run safely:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`

Next recommended slice:

Add CRM rollup and daily-priority queues for buyer outside-listing activity, grouped by liked, seen, discuss, pass, request-info, tour requested, and family discussion activity.

## Twenty-First Implemented Slice

Goal: add CRM rollup and daily-priority queues for buyer outside-listing activity.

Added:

- `lib/external-listings/rollup.ts`.
  - Groups outside listings by bucket: saved, seen, liked, disliked/pass, discuss.
  - Counts request-info and tour/showing requests.
  - Counts family-visible listings and active family discussion.
  - Builds a daily-priority queue for items needing agent response.
- `lib/external-listings/__tests__/rollup.test.ts`.

Updated:

- `GET /api/crm/clients/[id]/external-listings` now returns `activity_summary`.
- CRM client Outside Listings card now shows:
  - total outside listings
  - needs response
  - tours requested
  - info requests
  - family discussion active
  - daily-priority queue
  - quick filters for all, needs response, liked, seen, discuss, pass, info, and tours
- Existing outside-listing cards still show bucket controls, privacy/family-visible status, notes, and request badges.
- No new migration was added for this slice.

Validation:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/external-listings/jest.config.js` passed: 7/7
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Next recommended slice:

Start seller portal signal capture: seller valuation requests, proceeds calculator, seller closing-cost calculator, readiness/urgency inputs, then expose those signals in seller CRM visibility panels.

## Final Save Checkpoint Before Membership/Session Switch

Saved at local time: **2026-04-29 04:12:34 -04:00**.

Current Git state:

- Working tree: clean before this checkpoint section was added.
- Local branch: `main`.
- Remote tracking: `main...origin/main [ahead 15]`.
- Latest implementation commit before this checkpoint: `0ef50dbc Add external listing tour requests`.
- The 15 local commits have **not** been pushed.

What is safely saved locally:

- All implementation work is committed in Git through `0ef50dbc`.
- This memory file is saved in the repo at `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md`.
- Mirror memory copies are saved on Desktop under `C:\Users\MayaAllan\Desktop\memory`.

Critical production/deploy warning:

- Do **not** push/deploy the external-listing workflow until the database migrations are applied manually to the target database.
- Required migrations:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`
- Per `NEON.md`, run `npm run ops:health`, manually run `prisma migrate deploy` against the target database, verify migration status, then push/deploy.

Latest completed workflow:

- Buyers can add outside/non-IDX listings.
- Agents/brokers can add outside/non-IDX listings for clients.
- Outside listings have buckets: `saved`, `seen`, `liked`, `disliked`, `discuss`.
- Buyers and agents/brokers can update buckets.
- Buyers can add notes, request info, and request tour/investigation on outside listings.
- Buyers can choose whether an outside listing is visible to invited family/friends.
- Invited family/friends can see and discuss only outside listings shared with them.
- Agents/brokers can see outside-listing rollups and daily-priority queues in the CRM client workspace.
- Agents/brokers can see and reply to outside-listing notes in CRM.
- Outside inventory remains separate from IDX/MLS `Listing`.

Recommended next slice:

1. Start seller portal signal capture and seller CRM visibility.
2. Then continue tenant/landlord workflow signals and broker lead distribution.
3. Then finish final integration/deploy prep after migrations are manually applied.

## User Push Gate

User instruction: **make sure everything is completed before pushing anything. Read through and do not miss any lines.**

Do not push `main` or deploy this work until all of the following are true:

1. The next functional slices intentionally selected for this local batch are finished and validated.
2. The three external-listing migrations have been applied manually to the target database and verified:
   - `20260429030000_add_external_listings`
   - `20260429033000_add_external_listing_comments`
   - `20260429040000_add_external_listing_family_visibility`
3. Full validation has been rerun after the final local slice:
   - `npm run type-check`
   - `node --check public/crm/js/dashboard/workspace.js`
   - `npm run crm:test`
   - `npm run lint`
   - `npm run test:compliance`
   - `npm run compliance-check`
4. `git status --short --branch` is clean except for the expected ahead-of-origin count.
5. The user explicitly confirms it is time to push.

## Twenty-Second Slice: Seller Portal Signal Capture

Saved at local time: **2026-04-29 04:45:09 -04:00**.

Completed locally after the CRM outside-listing rollup slice:

- Seller portal now has a Seller Planning panel for valuation, desired sale price, mortgage payoff, prep budget, closing costs, timeline, urgency, readiness, and notes.
- Seller portal saves those inputs through `POST /api/portal/seller/signals`.
- Seller signals are stored as existing `PortalEvent` records with `workspace: "seller"`:
  - `seller_valuation_request`
  - `seller_proceeds_estimate`
  - `seller_closing_cost_estimate`
  - `seller_readiness_update`
- Seller signal payloads are normalized by `lib/seller-signals/summary.ts`, including estimated net proceeds.
- CRM now has `GET /api/crm/clients/[id]/seller-signals`.
- CRM client financial view shows Seller Portal Signals for seller clients, including valuation, desired sale price, estimated net proceeds, closing costs, readiness, urgency, property context, attorney context, last signal date, and recent activity.
- Broker can read seller signals for all leads; agents can read only assigned leads.
- No new database migration was added for this slice.

Validation after the seller portal signal capture slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/seller-signals/jest.config.js` passed: 2/2
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next slice:

1. Continue tenant/landlord workflow signals:
   - saved rentals
   - outside rental links
   - lease-end and rent-vs-buy conversion signals
   - showing requests and document readiness
   - vacancy cost calculator
   - tenant renewal and re-listing signals
   - owner document and showing workflow
2. Then implement broker lead distribution.
3. Then implement per-agent system separation.
4. Then complete final integration/deploy prep only after the required migrations are manually applied and verified.

## Twenty-Third Slice: Tenant/Landlord Workflow Signals

Saved at local time: **2026-04-29 04:54:26 -04:00**.

Completed locally after the seller portal signal capture slice:

- Added shared rental signal normalization and summaries in `lib/rental-signals/summary.ts`.
- Added focused rental signal tests in `lib/rental-signals/__tests__/summary.test.ts`.
- Added tenant portal signal capture through `POST /api/portal/tenant/signals`.
- Added landlord portal signal capture through `POST /api/portal/landlord/signals`.
- Added CRM rental signal visibility through `GET /api/crm/clients/[id]/rental-signals`.
- Tenant portal Lease tab now captures:
  - outside rental link
  - outside rental address
  - rent-vs-buy context
  - lease intent
  - move timing
  - document readiness
  - notes for the agent
- Landlord portal Dashboard now captures:
  - expected vacancy days
  - monthly carrying cost
  - estimated vacancy cost
  - relist timing
  - tenant renewal intent
  - owner document readiness
  - showing readiness
  - vacant-now flag
  - owner notes
- CRM Financial tab now shows Rental Portal Signals for tenant/renter and landlord clients.
- Broker can read rental workflow signals for all leads; agents can read only assigned leads.
- No new database migration was added for this slice.

Validation after the tenant/landlord workflow signal slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npx jest --config lib/rental-signals/jest.config.js` passed: 4/4
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next slice:

1. Broker lead distribution:
   - self-registered buyers/sellers/tenants/landlords enter a broker queue
   - broker assigns an agent
   - assigned agent inherits portal activity, calculators, outside listings, rental signals, seller signals, notes, and lead history
2. Then implement per-agent system separation.
3. Then complete final integration/deploy prep only after the required migrations are manually applied and verified.

## Twenty-Fourth Slice: Broker Lead Distribution Inheritance

Saved at local time: **2026-04-29 05:04:22 -04:00**.

Completed locally after the tenant/landlord workflow signal slice:

- Added shared broker assignment helper in `lib/lead-distribution/assign.ts`.
- Broker lead assignment through `PATCH /api/crm/leads/[id]` now uses the shared helper.
- Client reassignment through `PATCH /api/crm/clients/[id]` now uses the same helper for broker-driven reassignment.
- Auto-assignment from lead scoring now uses the same inheritance path.
- Assigned agents inherit unassigned child records where applicable:
  - outside listings
  - saved searches
  - active leases connected as landlord or tenant
- Assignment creates an activity log with previous agent, assigned agent, inherited counts, and broker note metadata.
- Assignment notifications now tell the agent to review portal history.
- Broker unassigned-leads API now returns inheritance preview counts:
  - portal events
  - outside listings
  - saved searches
  - listing actions
  - CRM activity logs
- Broker dashboard and full distribution panel now show what activity the assigned agent will inherit.
- No new database migration was added for this slice.

Validation after the broker lead distribution inheritance slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/app.js` passed
- `node --check public/crm/js/dashboard/panels/home/home-screen.js` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next slice:

1. Per-agent system separation:
   - audit every CRM route and dashboard panel for agent-vs-broker data boundaries
   - confirm each agent sees only their clients, searches, CRM, marketing, reports, pipeline, and activity
   - confirm broker still sees all clients and can reassign/oversee
2. Then complete final integration/deploy prep.
3. Do not push/deploy until selected local work is complete, full validation passes, required external-listing migrations are manually applied/verified, and the user explicitly confirms pushing.

## Twenty-Fifth Slice: Per-Agent CRM Access Separation

Saved at local time: **2026-04-29 05:14:05 -04:00**.

Completed locally after the broker lead distribution inheritance slice:

- Added shared CRM access helper in `lib/crm/access.ts`.
- Hardened client-scoped API access so agents can only read/write assigned clients while brokers retain oversight.
- Applied shared lead access checks to:
  - client family links
  - client parties
  - activity/audit posts
  - activity-log events
  - conviction score reads
  - financial scenarios
  - inquiries
  - listing engagement
  - listing sends
  - listing views
  - communications
  - CRM email sends
  - saved searches
  - showing history
  - rental applications
  - rental lease creation/update tenant links
  - active lease tenant links
  - automation drip-tier adjustments
  - sales promotions
  - conversion actions
  - tasks filtered by client
- Closed direct-ID access gaps where an agent could previously submit another client's `lead_id`, `client_id`, `member_lead_id`, `tenant_lead_id`, or `client_ids[]`.
- Restricted non-broker inquiry feeds to inquiries connected to the agent's assigned leads or own listings.
- Prevented non-broker conversion actions from choosing another `agentId`.
- No new database migration was added for this slice.

Validation after the per-agent CRM access separation slice:

- `npm run type-check` passed
- `node --check public/crm/js/dashboard/workspace.js` passed
- `npm run crm:test` passed: 39/39
- `npm run lint` passed
- `npm run test:compliance` passed: 194/194
- `npm run compliance-check` passed: 87/87

Recommended next slice:

1. Final integration/deploy prep:
   - run a final route/data-boundary smoke review
   - confirm all selected local slices are committed and working tree is clean
   - manually apply and verify required external-listing migrations
   - rerun full validation after DB verification
2. Push/deploy only after the user explicitly confirms pushing.

## Twenty-Sixth Slice: Final Integration / Deploy Preflight Checkpoint

Saved at local time: **2026-04-29 05:20:20 -04:00**.

Completed locally after the per-agent CRM access separation slice:

- Ran final preflight review commands before any push.
- Confirmed local `main` was ahead of `origin/main` and remained unpushed.
- Confirmed the production/deploy blocker is still the required manual migration step, not code validation.
- Updated the IDX validator so portal routes using `requirePortalRole` are recognized as authenticated mutation routes.
- Marked `/api/identity/capture` as an intentionally public lead-capture endpoint in the IDX validator; it remains rate-limited.
- Added an explicit `/api/idx/search` comment documenting that generic `checkboxFilters` are parsed in `buildCrmIdxODataFilter(params)` and only OData-safe fields are forwarded.
- Refreshed IDX validator result/history artifacts after the validator cleanup.

Final validation status:

- `npm run ops:health` passed / healthy:
  - DB size: 224.26 MB of 500 MB cap (44.9%).
  - Largest table: `listings` at 201.21 MB.
  - Last sync was recent, with 12 upserted and 0 errors.
  - REBNY Section 2.05 violations: 0.
  - Upgrade needed: no.
- `npx prisma validate` passed.
  - Warning only: Prisma preview feature `driverAdapters` is deprecated.
- `npm run ucba:audit` passed: 46/46 rules.
- `npm run idx:validate` passed with WARN result, 0 critical:
  - Final terminal summary: 852 pass, 0 critical, 5 warnings, 29 info, 0 unverified.
  - Persisted result artifact: 851 pass, 0 critical, 5 warnings, 28 info.
  - Remaining accepted warnings: Property field coverage, mapper return fields not in `Listing`, and contact route PII log review.
- `npm run type-check` passed.
- `node --check public/crm/js/dashboard/workspace.js` passed.
- `npm run crm:test` passed: 39/39.
- `npm run lint` passed.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run rls:validate` passed with 0 errors, 1 warning:
  - Existing warning: `RENTAL-FORM-REDESIGN.html` `MlsStatus` missing RLS picklist value `ComingSoon`.

Required before push/deploy:

1. Do not push yet.
2. Confirm the target production database URL is intentionally selected.
3. Run `npm run ops:health`.
4. Manually run `prisma migrate deploy` against the target database.
5. Verify migration status after deploy.
6. Rerun the validation suite after DB verification.
7. Push/deploy only after the user explicitly confirms.

Required local migrations still queued for manual target DB apply:

- `20260429030000_add_external_listings`
- `20260429033000_add_external_listing_comments`
- `20260429040000_add_external_listing_family_visibility`

## Twenty-Seventh Slice: External Listing Migrations Applied / Push-Ready Gate

Saved at local time: **2026-04-29 05:26:30 -04:00**.

Completed after the final preflight checkpoint:

- Re-read `NEON.md` before touching the database.
- Confirmed `.env.local` contains a `DATABASE_URL` pointed at Neon database `neondb`; credentials were not printed.
- Ran `npm run ops:health` before migration:
  - Healthy.
  - DB size: 224.26 MB of 500 MB cap (44.9%).
  - REBNY Section 2.05 violations: 0.
  - Upgrade needed: no.
- Ran `prisma migrate status` against the configured Neon DB and confirmed exactly these pending migrations:
  - `20260429030000_add_external_listings`
  - `20260429033000_add_external_listing_comments`
  - `20260429040000_add_external_listing_family_visibility`
- Re-read all three migration SQL files before applying them.
- Ran `prisma migrate deploy` against the configured Neon DB.
- All three external-listing migrations applied successfully.
- Ran `prisma migrate status` after deploy:
  - Database schema is up to date.
- Ran `npm run ops:health` after migration:
  - Healthy.
  - DB size: 224.44 MB of 500 MB cap (44.9%).
  - REBNY Section 2.05 violations: 0.
  - Upgrade needed: no.

Post-migration validation:

- `npx prisma validate` passed.
  - Warning only: Prisma preview feature `driverAdapters` is deprecated.
- `npm run type-check` passed.
- `node --check public/crm/js/dashboard/workspace.js` passed.
- `npm run crm:test` passed: 39/39.
- `npm run lint` passed.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result, 0 critical:
  - Final terminal summary: 852 pass, 0 critical, 5 warnings, 29 info, 0 unverified.
- `npm run ucba:audit` passed: 46/46.
- `npm run rls:validate` passed with 0 errors, 1 warning:
  - Existing warning: `RENTAL-FORM-REDESIGN.html` `MlsStatus` missing RLS picklist value `ComingSoon`.

Current deployment state:

- The prior hard DB migration gate is now complete.
- Local branch remains ahead of `origin/main`.
- No push has been performed yet.
- Next action is user-confirmed push/deploy only.

## Public `/api/listings` DB-first migration FINISH

User-bounded slice: complete the DB-first path so all where/order/filter
construction is delegated to `buildPublicListingDbSearch()`. Hard limits
honored: only `app/api/listings/route.ts` and `lib/search/public-listing-db.ts`
modified, plus focused tests in `lib/search/__tests__/public-listing-db.test.ts`.
Trestle live fallback, schema, migrations, package files, env, Vercel config,
and unrelated routes were not touched.

Helper changes (`lib/search/public-listing-db.ts`):

- New static import: `AMENITY_FIELD_MAP, AmenityFilter` from `@/lib/search/types` (replaces the previous route-local dynamic `await import`).
- New constants: `OWNERSHIP_TYPE_MAP`, `AMENITY_FIELD_TO_DTO`.
- New exported interface: `PublicPostFilterListing` (DTO shape needed for post-filter typing).
- New exported function: `applyPublicListingPostFilters<T extends PublicPostFilterListing>(listings, featuresById, params): T[]`.
- The function applies, in order matching the prior inline route logic:
  - `ownershipTypes` — substring match against DTO `propertyType` (Condo excludes Condop).
  - `yearBuilt` — pre-war ≤ 1946 / post-war ≥ 1947.
  - `furnished` — DTO `furnished === "Furnished"`.
  - `amenities` — AND across requested keys; each key is OR-of-substring across DTO + features JSON; pet-friendly retains the negative-value handling.
  - `keywords` — AND across PublicRemarks substring (PUB-tier only; deliberately not extended to PrivateRemarks/ShowingInstructions).
- `buildPublicListingDbSearch()` itself is unchanged.

Route changes (`app/api/listings/route.ts`):

- Import expanded to `{ applyPublicListingPostFilters, buildPublicListingDbSearch }` from the helper.
- The DB-first block now flows: serialize → `filterDisplayableDbListings` → `dbListingToPublicDTO` → build `featuresById` → start `geocodePromise` (race vs 1.5s) → `applyPublicListingPostFilters(...)` → open-house Trestle filter → `await geocodePromise` → response/cache.
- 5 inline post-filter blocks deleted (~110 lines): `ownershipTypes`, `yearBuilt`, `furnished`, `amenities` (incl. dynamic import), `keywords`.
- Geocoding promise position moved from "after ownership / before yearBuilt" to "before the bundled post-filter call". Geocoding now sees the full DTO list rather than the post-ownership list, but is still fire-and-forget with the same 1.5s race and the same final await; the response is unchanged.
- Open-house Trestle resource intersection stays in the route (external resource lookup is intentionally not delegated to the helper).
- Trestle live fallback (line ~360 onward) is untouched.

Test changes (`lib/search/__tests__/public-listing-db.test.ts`):

- 7 new tests in a dedicated `describe("applyPublicListingPostFilters", ...)` block:
  1. No-op pass-through with empty `URLSearchParams`.
  2. `ownershipTypes` Co-op selection + Condo-vs-Condop disambiguation.
  3. `yearBuilt` pre-war / post-war thresholds.
  4. `furnished` matches DTO `Furnished`.
  5. `amenities` single key (`dishwasher`), `pet-friendly` negative-value handling, AND across multiple keys.
  6. `keywords` single + AND across two terms.
  7. Sparse `featuresById` map falls back to listing.publicRemarks without throwing.

Validation after the public `/api/listings` DB-first finish slice:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 193/193 (previous: 186/186; +7 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result, 0 critical: 853 pass, 0 critical, 5 warnings, 29 info.

Diff stat:

- `app/api/listings/route.ts`: +12 / -117.
- `lib/search/public-listing-db.ts`: +144 (additions only).
- `lib/search/__tests__/public-listing-db.test.ts`: +157.

Remaining `/api/listings` fragmentation (unchanged from prior handoff —
explicitly out of scope for this slice):

- Public `/api/listings` live Trestle fallback path — still has its own inline OData filter builder.
- Open House Trestle resource lookup — kept in the route's DB-first block by design (external resource).

Push gate: unchanged. Local branch remains ahead of `origin/main`. No push performed.

## `/api/listings` final integration audit + dead-var cleanup

Pure audit of the 11 integration items requested (DB-first / Trestle helper
adoption, response shape, DTO mapping, media, geocoding, Open House, exclusive
merge, fail-closed gates) confirmed everything is wired correctly. Five
pre-existing param mismatches between paths were documented (`type=buy`,
legacy `propertyType`, `bounds`, neighborhood-name fallback, non-pet-friendly
amenities) — none introduced by the extractions and all preserved verbatim.

The audit surfaced 14 `@typescript-eslint/no-unused-vars` lint warnings on
`app/api/listings/route.ts` from dead `const X = searchParams.get(...)`
declarations that were used by the pre-extraction inline filter logic and
became unused once the helpers started reading `searchParams` directly.

Cleanup slice: deleted those 14 const declarations. Vars removed:
`maxBeds`, `minBaths`, `maxBaths`, `propertyTypeFilter`, `statusFilter`,
`statusesParam`, `minSqft`, `maxSqft`, `commercial`, `ownershipTypes`,
`yearBuiltParam`, `furnishedParam`, `addressParam`, `keywords`.

Vars kept (still used by route orchestration outside the helpers):
`listingType`, `neighborhood`, `borough`, `minPrice`, `maxPrice`, `minBeds`,
`sortParam`, `skipParam`, `limit`, `skip`, `propertySubTypes`, `amenitiesParam`
(pet-friendly RAW post-filter on the Trestle path), `openHouseParam`,
`openHouseDateParam`.

Validation:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 236/236.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed: WARN, 0 critical (853 pass).
- `npm run lint` passed: **0 errors, 0 warnings** (was 0 errors, 14 warnings).

Diff: `app/api/listings/route.ts` only (+5 / −18). No other files touched.

## Buyer-priorities slice (committed from working tree + bug fix)

Closed an in-flight feature that had been sitting on the working tree:
buyer daily priorities panel for the agent CRM client view.

New files:

- `lib/buyer-priorities/summary.ts` — pure `summarizeBuyerDailyPriorities()`
  derivation. Reads externalListings (with comments), financial intent
  summary, and showings; emits a sorted urgent/high/normal queue with
  counts. No schema dependency beyond what was already added by prior
  Workstream-C external-listing migrations.
- `lib/buyer-priorities/__tests__/summary.test.ts` — 2 cases.
- `lib/buyer-priorities/jest.config.js` — package-local Jest config.
- `app/api/crm/clients/[id]/buyer-priorities/route.ts` — GET only,
  agent/broker auth, scoped per `lib/crm/access.ts` shape.

Updated:

- `public/crm/js/dashboard/workspace.js` — buyer priorities panel + cache
  invalidation hooks + injection in `_clientOverview` for buyer/renter.
- Fixed an incidental bug: the rental-signals panel was assigning
  `clientType = ...` without a `var` declarator (prior refactor leftover).
  Without `var`, the assignment would create an implicit global in
  non-strict mode (or throw in strict). Re-added `var clientType = ...`.

Validation:

- `node --check public/crm/js/dashboard/workspace.js` passed.
- `npx jest --config lib/buyer-priorities/jest.config.js` passed: 2/2.
- `npm run type-check` passed.
- `npm run crm:test` passed: 39/39.
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run lint` passed: 0 errors, 0 warnings.

No schema, migration, package, env, Vercel, or unrelated route boundary
touched. Push gate unchanged.

## Master plan PR 5A — listing_search_projection schema slice

User-bounded brief: schema-first additive slice only. No reader migration,
no dual-write, no `lib/idx/sync.ts` edits, no public API shape change.
Helper required to be pure and testable.

Schema (`prisma/schema.prisma`):

- New model `ListingSearchProjection` (end of file).
- FK relation `listing Listing @relation(fields: [listing_id], references:
  [listing_id], onDelete: Cascade)` mirroring the `ListingMedia` pattern
  — references `Listing.listing_id` (String, unique) rather than the
  BigInt PK because that's the canonical relation key in this schema.
- Back-relation on `Listing`: `listing_search_projection
  ListingSearchProjection?` (singular, optional 1:1). One-line addition
  required for Prisma to compile; no other `Listing` changes.
- Columns: as listed in the brief — RESO/Trestle source tracking,
  classification, geography, numeric search dimensions, four boolean
  facet flags, distribution-gate mirror (rls_eligible default true,
  four nullable gate booleans), free-text/structured fields.
- Indexes (9 total): `(listing_type, mls_status)`,
  `(borough, neighborhood)`, `postal_code`, `list_price`, `bedrooms`,
  `bathrooms`, `property_sub_type`, `modified_at`, plus a four-column
  composite distribution-gate index aliased as
  `lsp_distribution_gates_idx` so the identifier stays under the
  63-char Postgres limit.

Migration (`prisma/migrations/20260429130000_add_listing_search_projection/`):

- Additive `CREATE TABLE` + 9 `CREATE INDEX` statements + FK with
  `ON DELETE CASCADE ON UPDATE CASCADE`.
- Per NEON.md §4 the indexes are non-CONCURRENT but safe — the table is
  empty at creation. CONCURRENTLY is required only for >10K-row tables.
- **NOT applied to production Neon** in this slice. Per NEON.md §4 the
  migration applies manually to prod before any code that depends on
  the table merges. PR 5A introduces no readers/writers of the new
  table, so applying now is safe but not required. Recommended
  application moment: at the start of PR 5B (dual-write).

Helper (`lib/search/listing-search-projection.ts`, 357 LOC):

- `buildListingSearchProjectionFromListing(listing)` — main builder
  returning the canonical `ListingSearchProjectionRow` shape (excludes
  Prisma-managed `id`/`created_at`/`updated_at` so the same shape works
  for both `create` and `update`).
- `normalizeProjectionSearchText(listing)` — lowercased,
  whitespace-collapsed concatenation of PublicRemarks + address parts +
  neighborhood + city. Compliance comment forbids extending to
  PrivateRemarks/ShowingInstructions (HID tier).
- `extractProjectionAmenityKeys(listing)` — reuses `AMENITY_FIELD_MAP`
  from `@/lib/search/types`. Returns canonical AmenityFilter keys
  matching features-JSON values. Same pet-friendly negative-value
  handling as `applyPublicListingPostFilters`.
- `extractProjectionFeatureFlags(listing)` — derives `has_floorplan` /
  `has_video` / `has_virtual_tour` from media[] + `is_furnished` /
  `is_pet_friendly` from features.
- All four functions pure (no DB, no I/O). Loose `ListingProjectionSource`
  input shape tolerates raw Prisma rows + serialized fixtures.
- Distribution-gate fields mirrored verbatim — null stays null, false
  stays false — preserving the fail-closed semantic for future readers.

Tests (`lib/search/__tests__/listing-search-projection.test.ts`, 16 cases):

1. Sale projection round-trip — every column in the canonical shape.
2. Rental projection — incl. is_furnished + is_pet_friendly flags.
3. Fail-closed permission preservation — null→null AND false→false
   distribution-gate inputs round-trip without coercion.
4. searchable_text positive + null-empty paths.
5. Amenity key extraction — positive + null + pet-friendly negative
   ("No" → not flagged).
6. Feature flag extraction — media + features + null + pet-friendly
   negative.
7. Commercial flag — commercial_sub_type + property_sub_type set.
8. New-development flag — property_sub_type = NewConstruction.
9. Exclusive flag — agent_id presence.
10. Rental flag — listing_type === "rent".

Validation:

- `npx prisma validate` passed (only the existing `driverAdapters`
  preview deprecation warning).
- `npx prisma generate` regenerated the Prisma Client.
- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 252/252
  (previous: 236/236; +16 new).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed: WARN, 0 critical (853 pass, 5 warn,
  29 info — no new false positives from the new model).

Diff: `prisma/schema.prisma` +96, migration SQL +109 new, helper +357
new, tests +259 new. No other files touched.

`lib/idx/sync.ts`: untouched. PR 5B will add dual-write here using
`buildListingSearchProjectionFromListing`. PR 5C verifies one sync
cycle. PR 5D migrates the first reader.

## PR 5A migration applied to production Neon

User-authorized application. NEON.md re-read before applying.

- `npx prisma migrate deploy` applied `20260429130000_add_listing_search_projection`
  cleanly against the configured Neon DB.
- `npx prisma migrate status` reported "Database schema is up to date!"
- Post-migration `ops:health`: HEALTHY. DB ~215 MB / 500 MB cap; sync 0
  errors last 24h; REBNY §2.05 violations: 0; no upgrade needed.
- Validation rerun (all green):
  - `npm run type-check`: pass
  - `npx jest --config lib/search/jest.config.js`: 252/252
  - `npm run test:compliance`: 194/194
  - `npm run compliance-check`: 87/87
  - `npm run idx:validate`: WARN, 0 critical (853 pass)
  - `npm run lint`: 0/0
- The `listing_search_projection` table is in production but empty.
  PR 5B (dual-write from `lib/idx/sync.ts`) is intentionally NOT
  started in this session per the user's instruction; awaits a
  separate brief.
- The neon-precommit-guard hook no longer requires bypass for future
  PR 5B/5C/5D commits — `prisma migrate status` is up-to-date.

## Master plan PR 5B — dual-write ListingSearchProjection from IDX sync

User-bounded brief: dual-write the projection from the canonical IDX
sync path. Pure helper for the upsert payload; no schema change; no
reader migration; no /api/listings change.

Sync changes (`lib/idx/sync.ts`):

- Located both Listing upsert sites:
  - `syncListings()` — Trestle-driven incremental + full sync. No agent_id.
  - `syncAgentHistory()` — per-agent historical sync. Sets `agent_id`.
- Added imports for `buildListingSearchProjectionFromListing`,
  `buildProjectionUpsertPayload`, and `ListingProjectionSource`.
- After each `prisma.listing.upsert(...)` succeeds, the sync builds
  a `ListingProjectionSource` from the same `mapped` object and calls
  `prisma.listingSearchProjection.upsert(buildProjectionUpsertPayload(...))`.
- Both writes share the existing per-listing try/catch — sequential
  pattern, no transaction wrapper. A projection failure increments the
  same `errors` counter and logs to console; the next sync cycle retries.
- `mapTrestleToPrisma` output does NOT carry `rls_eligible` or
  `commercial_sub_type` — Trestle data inherits schema defaults.
  Both sync paths hardcode `rls_eligible: true, commercial_sub_type: null`
  in the projection input because Trestle data is RLS-eligible by
  definition and the website-only commercial path is CRM-authored.
- Distribution-gate fields (`idx_display_yn`,
  `internet_entire_listing_display_yn`, `internet_address_display_yn`,
  `participant_only`) flow directly from `mapped` — null/false
  round-trip verbatim.

Helper (`lib/search/listing-search-projection.ts`):

- New runtime import of `Prisma` from `@prisma/client` (was type-only).
- New private `jsonInput()` coercion: returns `Prisma.JsonNull` for
  `null`, otherwise `value as Prisma.InputJsonValue`. Strict Prisma
  types reject bare `null` on `Json?` columns.
- New exported `ListingSearchProjectionUpsertPayload` type.
- New exported `buildProjectionUpsertPayload(projection)` function —
  pure, returns Prisma-shaped `{ where: { listing_id }, create, update }`
  payload. `create` and `update` carry the same fields (every column
  is fully derived from the source Listing, so update overwrites
  every column — no stale projection state).

Tests (`lib/search/__tests__/listing-search-projection.test.ts`):

- 4 new cases in a `describe("buildProjectionUpsertPayload …", …)`
  block:
  1. Create-branch payload carries every column.
  2. Update-branch is idempotent against create.
  3. Null permissions: gate scalars stay null, JSON columns become
     `Prisma.JsonNull`.
  4. False permissions: round-trip verbatim, no coercion.
- No standalone IDX sync test file exists in the repo
  (`lib/idx/__tests__/` doesn't exist). The testable seam is the pure
  `buildProjectionUpsertPayload` helper, which is fully covered.

Validation:

- `npx prisma validate`: pass.
- `npm run type-check`: pass.
- `npx jest --config lib/search/jest.config.js`: 256/256 (was 252).
- `npm run test:compliance`: 194/194.
- `npm run compliance-check`: 87/87.
- `npm run idx:validate`: WARN, 0 critical (853 pass).
- `npm run lint`: 0 errors, 0 warnings.
- `npm run ops:health`: HEALTHY. 19,697 listings; sync 0 errors.

Diff: `lib/idx/sync.ts` +69 / −2, helper +83 / −1, tests +90.
No schema, migration, env, Vercel, or unrelated routes touched.

Production state: projection table still empty at commit time. Next
idx-sync cycle (`*/10 * * * *`) will start populating rows.

Next: PR 5C — verify the next sync cycle populates rows (passive
verification preferred; active backfill is an option if faster
population is required).

## PR 5C — passive verification (post-push, post-sync)

Push completed at 19:14:17 UTC: `b9b83245..0d6ccacd main -> main`.
3 commits delivered (PR 5A schema, migration-applied checkpoint,
PR 5B dual-write).

CI: `Release Truth` ✅ + `Guardrails (Repo + Compliance)` ✅
+ `Auto-retry runner-pool flakes` skipped.

Sync cycle observation:

- Baseline (19:14:30 UTC): `projection_count = 0`, `listings_count = 19,813`.
- First post-deploy sync cycle ran 19:20:18 → 19:20:24 UTC (8.2 s).
- Post-cycle: `projection_count = 101`, `listings_count = 19,815`.
- Projection rows: `min(created_at) = max(created_at) - 3s` —
  all 101 rows inserted in a 3-second window during the sync.
- Sync duration grew from ~4.9 s pre-PR-5B to 8.2 s for a 101-row
  cycle — ~33 ms per projection upsert. Within Vercel cron budget.

ops:health post-cycle: HEALTHY. Last run 0.0h ago, 101 upserted,
0 errors. 24h error count: 0. REBNY §2.05 violations: 0.

idx:validate post-cycle: WARN, 0 critical (853 pass, 5 warnings,
29 info — unchanged from pre-push).

compliance-check post-cycle: 87/87.

**Dual-write confirmed working in production.** The 101 rows include
2 newly-inserted listings (count 19,813 → 19,815) and 99 existing
listings whose Trestle ModificationTimestamp updated, triggering
re-upsert of both `Listing` and projection.

Active backfill: not needed for correctness — natural-churn convergence
will populate the projection over 1–2 weeks. Defer the backfill
decision to PR 5D, when we know which reader is migrating first and
whether partial coverage is acceptable for that reader's contract.

## PR 5C-backfill — bounded one-shot listing_search_projection backfill

Decision after passive verification: rather than wait 1–2 weeks for
natural-churn convergence, run a one-shot bounded backfill so PR 5D
can start with full projection parity.

New script: `scripts/backfill-listing-search-projection.ts`

- Idempotent. Dry-run by default; `--execute` required for real writes.
- Cursor-paginated by `id ASC`, 500-row default batch.
- Filter: Prisma 1:1 relation `listing_search_projection: null` —
  only listings without an existing projection.
- Reuses the existing pure helpers `buildListingSearchProjectionFromListing`
  + `buildProjectionUpsertPayload`. No new helper. No schema change.
- Reads only existing `Listing` rows. Never touches Trestle.
- Loud failure: per-row errors are logged + counted, and the script
  exits non-zero if any row errored.
- Flags: `--batch=N`, `--max-batches=N`, `--limit=N`.

New npm scripts: `ops:projection-backfill` and
`ops:projection-backfill:execute`. Match `ops:neon-shed[:execute]` pattern.

Dry-run:

- 19,579 expected to backfill out of 19,826 listings (247 already
  populated by PR 5B dual-write across the prior ~50 min of sync cycles).
- 40 batches. 0 errors. 18.0 s elapsed (read-only).
- Sample payload validated: gates round-tripped, amenity_keys + feature_flags
  populated, is_exclusive / is_rental correctly derived.

Execute:

- 40 batches. 0 errors. 16.4 min elapsed.
- 11 net-new listings concurrently arrived via the natural sync cron;
  no conflicts because upserts are idempotent on `listing_id`.

Post-backfill SQL verification:

- `SELECT COUNT(*) FROM listing_search_projection` → **19,830**
- `SELECT COUNT(*) FROM listings` → **19,830**
- `SELECT COUNT(*) FROM listings l LEFT JOIN listing_search_projection p
  ON p.listing_id = l.listing_id WHERE p.listing_id IS NULL` → **0**
- `MIN(proj.created_at)` → 2026-04-29T19:20:18.633Z (first PR 5B dual-write)
- `MAX(proj.created_at)` → 2026-04-29T20:03:20.401Z (last backfilled row)

Health post-backfill:

- `ops:health` HEALTHY. Sync still running; dual-write firing every
  10-min cycle (last cycle: 71 upserts, 0 errors, 8.3 s).
- REBNY §2.05 violations: 0.

Validation rerun (all green):

- `npx prisma validate`: pass
- `npm run type-check`: pass
- `npx jest --config lib/search/jest.config.js`: 256/256
- `npm run test:compliance`: 194/194
- `npm run compliance-check`: 87/87
- `npm run idx:validate`: WARN, 0 critical
- `npm run lint`: 0/0

PR 5D readiness: **safe to start.** Projection at full parity
(19,830/19,830 with 0 missing). Dual-write keeps it converged on every
sync cycle. Recommended first reader: `app/api/crm/saved-searches/[id]/execute/route.ts`
— smallest surface area, already routes through `lib/search/core.ts`,
easiest rollback.

Push: not performed per the brief ("Do NOT push unless explicitly
instructed").

## PR 5D — saved-search execute reader migrated to projection

Bounded brief executed: migrate the first reader
(`app/api/crm/saved-searches/[id]/execute/route.ts`) to read through
`listing_search_projection`. Preserve fail-closed gates, address
suppression, and response shape. No reader migration for public
search yet.

### Files changed

- `lib/search/listing-access-decision.ts`: +30. Added
  `PROJECTION_DISPLAY_GATE` + `buildProjectionSearchWhere`. Closes the
  PR 5A schema gap (no `owner_opt_out` column on projection) by
  applying `owner_opt_out: false` via the FK relation
  `listing: { owner_opt_out: false }`.
- `lib/search/criteria-to-prisma.ts`: +90. Added
  `criteriaToProjectionWhere`. Same `SearchCriteria` aliases, same
  rental/multi-status normalization. Renames Listing-side columns to
  projection columns (bedrooms_total → bedrooms, bathrooms_full →
  bathrooms, status → mls_status, modification_timestamp → modified_at).
- `lib/search/core.ts`: +85. Added `runProjectionListingSearch`
  alongside the existing `runListingSearch` (kept intact for PR 5E's
  search-alerts cron). Single Prisma call:
  `prisma.listingSearchProjection.findMany({ ..., include: { listing:
  { select: SEARCH_RESULT_LISTING_SELECT } } })`.
- `app/api/crm/saved-searches/[id]/execute/route.ts`: +9 / −2.
  Swapped `runListingSearch` → `runProjectionListingSearch`. Single
  call-site change. Response body shape, audit shape, scope check, and
  pagination defaults are byte-identical.
- `lib/search/__tests__/criteria-to-prisma.test.ts`: +175. 14 new
  tests covering gate constant shape, default-status fallback, fail-
  closed multi-status, criteria → projection where, rental aliases,
  column renames (Listing-side names absent / projection-side present),
  borough/neighborhoods/property_type filters, `modifiedSince` on
  `modified_at`, multi-status, runner orderBy + include + where shape,
  null cascade-race resilience, response shape preservation, address
  suppression preservation, limit/offset/modifiedSince propagation.

### Behavior

- **Saved-search execute now reads projection first.** Single Prisma
  call: projection is the primary index, listings is JOIN via the FK
  relation declared on the projection model.
- **Listing include/join still used** — `include: { listing: { select:
  SEARCH_RESULT_LISTING_SELECT } }`. Required because the projection
  doesn't carry full `address` / `media` JSON. Single SQL JOIN, no
  second round-trip.
- **Response shape preservation: identical.** `serializeSearchListing`
  consumes the same `SearchResultListing` shape regardless of source.
  Address suppression via `sanitizeSearchAddress` still applies.
- **Fallback behavior: none.** Existing error policy already returns
  HTTP 500 on DB failures; adding a Listing-backed fallback would
  change error semantics and mask projection-write bugs.
- **Fail-closed gates preserved exactly:** 4 mirrored gates
  (`rls_eligible`, `idx_display_yn`,
  `internet_entire_listing_display_yn`, `participant_only_yn`) fire on
  the projection. `owner_opt_out` fires on the FK-linked listing. Null
  excluded everywhere — `idx_display_yn === true` excludes null/false;
  `participant_only_yn === false` excludes null/true.

### Validation

- `npx prisma validate`: pass
- `npm run type-check`: pass
- `npx jest --config lib/search/jest.config.js`: 270/270 (was 256, +14)
- `npm run test:compliance`: 194/194
- `npm run compliance-check`: 87/87
- `npm run idx:validate`: WARN, 0 critical (853 pass)
- `npm run lint`: 0 errors, 0 warnings
- `npm run ops:health`: HEALTHY. 19,839 listings (up 9 from PR 5C
  backfill close — sync's dual-write keeps the projection converged).

### PR 5E readiness

Safe to start. `runListingSearch` is still exported and is now used
only by the search-alerts cron at
`app/api/cron/search-alerts/route.ts`. Same migration shape as PR 5D:
swap the call to `runProjectionListingSearch`, preserve the
`modifiedSince` cron pattern (already supported by the new runner).

Push: not performed per the brief.

## PR 5E — search-alerts cron migrated to projection

Bounded brief: swap `runListingSearch` → `runProjectionListingSearch`
in the search-alerts cron, preserve modifiedSince + address
suppression + audit events + cron error handling + response shape.

Files changed:

- `app/api/cron/search-alerts/route.ts`: +7 / −1.
  - Single import-line change (runListingSearch → runProjectionListingSearch).
  - Single call-site change at the runner invocation.
  - Inline comment added documenting modifiedSince support via the
    projection's mirrored `modified_at` column and address suppression
    via the included Listing's permission flags.

No edits to `lib/search/core.ts` — `runProjectionListingSearch`
already supports `modifiedSince` from PR 5D. No tests added — the
runner contract is fully covered by PR 5D's 14 cases.

Behavior preservation (verified by reading the route + reasoning
through the runner contract):

- **modifiedSince** preserved. `criteriaToProjectionWhere(criteria, {
  modifiedSince })` produces `where.modified_at = { gte }`. Projection
  `modified_at` is mirrored from `Listing.modification_timestamp` by
  the PR 5A helper.
- **Fail-closed display gates** preserved.
  `PROJECTION_DISPLAY_GATE` enforces 4 mirrored gates on projection
  columns; `owner_opt_out: false` enforced via the FK `listing`
  relation.
- **Address suppression** preserved. The included Listing carries
  `internet_entire_listing_display_yn` /
  `internet_address_display_yn`; `formatSearchAlertAddress(listing)`
  evaluates them through `canDisplayListingAddress` and emits
  "Neighborhood, City (Address Available on Request)" when display is
  not affirmatively true. Identical string, identical gate semantics.
- **search_alert_cron audit event** preserved via recordSearchRun
  shape — searchRun.total / limit / offset round-trip from both
  runners.
- **Cron error handling** preserved. Per-search try/catch increments
  errored++; outer try/catch writes `search_alerts_cron_error` audit
  event and returns HTTP 500.
- **Cron response shape** preserved: `{ success, total, sent, skipped,
  errored }` on success.
- **ClientListingAction upsert** preserved. The new runner's listings
  carry the same `Listing.id` BigInt the upsert keys on.
- **No fallback added** — same posture as PR 5D.

`runListingSearch` (the Listing-backed runner) is now unused in the
route surface. Both saved-search execute and search-alerts cron go
through the projection. The function remains exported because the
existing test fixtures still exercise its `criteriaToPrismaWhere`
shape — removing it would break tests with no behavior benefit. PR 5F
or later can deprecate-and-remove if/when no longer needed.

Validation:

- `npx prisma validate`: pass
- `npm run type-check`: pass
- `npx jest --config lib/search/jest.config.js`: 270/270 (unchanged
  from PR 5D — no new tests in this slice)
- `npm run test:compliance`: 194/194
- `npm run compliance-check`: 87/87
- `npm run idx:validate`: WARN, 0 critical (853 pass)
- `npm run lint`: 0 errors, 0 warnings
- `npm run ops:health`: HEALTHY. 19,845 listings (up 6 since PR 5D
  — natural sync; dual-write keeps projection converged).

Push: not performed per the brief.

PR 5F readiness: safe to proceed when scoped. Per the user's agenda,
PR 5F is "maybe CRM saved search list/counts" — a smaller derived-
data path with the same swap pattern. Public `/api/listings` is still
deferred until at least two lower-risk projection readers (5D + 5E)
are live and stable in production.

## PR 5C/5D/5E pushed + corrections to the prior session report

Push delivered: `0d6ccacd..0ca7a0de  main -> main`. Vercel deploy READY
at commit `0ca7a0de` around `2026-04-29T21:05Z`. `origin/main` and
local HEAD both at `0ca7a0de`. Branch even with origin.

CI: Release Truth ✅, Guardrails (Repo + Compliance) ✅, Auto-retry
runner-pool flakes (skipped — correct).

Corrections to my prior post-push report:

- **Cron schedule**: IDX sync is `*/10 * * * *` (every 10 minutes), NOT
  every 12 minutes. All earlier passages in this file have been
  corrected.
- **Search-alerts schedule** is `30 7 * * *` (daily 07:30 UTC). The
  pre-deploy audit row at `2026-04-29T07:30:06.434Z` was on the OLD
  code; deploy happened ~14h later. Next firing on the new code:
  `2026-04-30T07:30 UTC`.
- **Audit `created_at` is `timestamp without time zone`.** Treat row
  values as scheduled / raw DB times rather than precision UTC stamps
  through Prisma's TS layer.
- **Live counts at verification** (2026-04-29T21:45 UTC):
  `projection_count = 19,851`, `listings_count = 19,851`,
  `missing_projection_count = 0`. Listings count grew naturally
  between push and verification because the dual-write kept the
  projection converged.
- **Latest `ops:health` post-deploy**: HEALTHY. Last sync 105 upserted,
  0 errors, 8340 ms. REBNY §2.05 violations: 0.
- **`listing_search_projection` storage**: 12.68 MB (table now visible
  in the top-5 by size).
- **Targeted projection tests**: 24/24 pass (incl. PR 5D's 14
  projection-reader cases).
- **Public smoke**: homepage 200, `/api/listings` 200, `/api/health`
  200 — no regression on unchanged surfaces.
- **Saved-search execute** (auth-gated): structurally verified — CI
  + parity + 14 projection-reader unit tests covering response shape,
  address suppression, and `SearchResultListing` contract. End-to-end
  response-shape probe was not performed (needs a session cookie).
- **Search-alerts cron** history: clean. 5 most recent runs all
  `errored: 0` / `total: 0` (no saved searches with
  `alert_enabled: true` configured — normal). Active backfill is no
  longer required.
- **Desktop mirror claim retracted.** I cannot independently
  substantiate that an obvious root Desktop / `.codex/memories`
  mirror exists. **In-repo memory is the reliable source.**

Wait for next search-alerts cron firing at `2026-04-30T07:30 UTC`,
then run:

```sql
SELECT * FROM audit_events
 WHERE action IN ('search_alerts_cron', 'search_alerts_cron_error')
 ORDER BY created_at DESC
 LIMIT 10;
```

(this project's column is `action`, not `event_type`)

Confirm:
- Latest `search_alerts_cron` row exists with `created_at` after the
  deploy time (`2026-04-29T21:05Z`).
- That row's `changes.errored = 0`.
- No `search_alerts_cron_error` rows after the deploy.

After all three conditions hold, PR 5F is safe to start. Public
`/api/listings` projection migration remains deferred.

## Public `/api/listings` live Trestle fallback filter extraction

User-bounded slice: extract the OData $filter string construction out of
`app/api/listings/route.ts` into a new helper, leaving DB-first search,
$orderby, $top, $select, post-fetch RAW filters, OpenHouse, media,
geocoding, DTO mapping, cache, audit, and exclusive merge untouched.

New file (`lib/search/public-listing-trestle.ts`, 370 LOC):

- Exports `buildPublicListingTrestleFilter(searchParams: URLSearchParams): string`.
- Internal helpers (not exported): `escapeOData`, `escapeODataLower`,
  `stripStreetSuffix`, `stripStreetOrdinal`, `buildAddressFilterPart`,
  `buildStatusFilterPart`, `buildListingTypeFilterPart`,
  `buildPriceBedsBathsSqftParts`, `buildPropertySubTypeFilterPart`,
  `buildSortNewDevelopmentFilterPart`, `buildOwnershipTypesFilterPart`,
  `buildLegacyPropertyTypeFilterPart`, `buildZipCodesFilterPart`,
  `buildNeighborhoodFilterPart`, `buildBoroughFilterPart`,
  `buildKeywordsFilterParts`.
- Imports `lookupNeighborhoodZips` from `@/lib/geo/neighborhood-zips`.
- Filter clauses produced (verbatim semantic match to the prior inline route logic):
  - status: ALLOWED `Active`/`ComingSoon`/`ActiveUnderContract` allowlist with
    fallback to the default 3-status OR clause.
  - listing type: `sale`/`buy` → `PropertyType ne 'ResidentialLease'`;
    `rent` → `PropertyType eq 'ResidentialLease'`.
  - commercial: OR-of-PropertySubType across Office/Retail/Industrial/Warehouse/MixedUse.
  - price/beds/baths/sqft (incl. half-bath threshold).
  - yearBuilt: pre-war ≤ 1946, post-war ≥ 1947.
  - furnished: `Furnished eq 'Furnished'`.
  - address: 4 patterns with `tolower()` + suffix/ordinal stripping +
    quote escaping.
  - propertySubTypes: CommonInterest push for Condo/Co-op/Condop +
    PublicRemarks contains 4-phrase set for New Development.
  - sort=new-development standalone: 3-phrase PublicRemarks contains.
  - ownershipTypes: OR-of-CommonInterest.
  - legacy single `propertyType`: only when neither propertySubTypes nor
    ownershipTypes also supplied.
  - zipCodes: 5-digit allowlist, 1 vs N branching.
  - neighborhood→ZIP via `lookupNeighborhoodZips`, only when no explicit
    zipCodes was supplied.
  - borough → CountyOrParish (Manhattan→New York, etc.).
  - keywords: per-keyword `contains(tolower(PublicRemarks), …)` with
    wildcard stripping + quote escaping + lowercasing + AND join.
- Compliance note in helper docstring: keywords search is restricted to
  PublicRemarks (PUB-tier); do NOT extend to PrivateRemarks or
  ShowingInstructions per IDX/VOW display rules.

Route changes (`app/api/listings/route.ts`):

- Import `buildPublicListingTrestleFilter` from the helper.
- Inside the Trestle fallback `try {` block: removed ~267 lines of inline
  filter-building (status, listing type, commercial, price/beds/baths/
  sqft, yearBuilt, furnished, address parsing, propertySubTypes,
  ownershipTypes, legacy propertyType, zip, neighborhood, borough,
  keywords, plus the inline `commercialSubTypes` array, `commonInterestPush`
  map, `commonInterestMap` map, `boroughMap` map, `ownerMap` map, and
  `stripSuffix`/`stripOrdinal`/`odataSafe` closures).
- Replaced with: `const filter = buildPublicListingTrestleFilter(searchParams);`
- Preserved `const boundsParam = searchParams.get('bounds')` — still needed
  for `hasPostFilter` sizing and the bounds post-filter further down.
- Preserved the entire `$orderby` switch verbatim — sort wiring is
  intentionally not part of the filter helper's scope.
- Updated `fetchFromTrestle({ filter, ... })` call site and the audit log
  payload to consume the new `filter` const instead of `filterParts.join(' and ')`.
- Net diff for route: +17 / −249.

Tests (`lib/search/__tests__/public-listing-trestle.test.ts`, 364 LOC):

43 cases across 10 groups — default sale/rent/status, OData escaping,
address parsing (4 patterns), borough/neighborhood/zip with precedence
rules, ownershipTypes, yearBuilt thresholds, furnished, amenities including
pet-friendly (verifies amenities do NOT push to OData), keywords/PublicRemarks
with wildcard handling, commercial / new-development including the
sort-vs-propertySubTypes precedence rule.

Validation after the public `/api/listings` Trestle fallback filter extraction:

- `npm run type-check` passed.
- `npx jest --config lib/search/jest.config.js` passed: 236/236 (previous: 193/193; +43 new tests).
- `npm run test:compliance` passed: 194/194.
- `npm run compliance-check` passed: 87/87.
- `npm run idx:validate` passed with WARN result, 0 critical: 853 pass, 0 critical, 5 warnings, 29 info.

Diff stat:

- `app/api/listings/route.ts`: +17 / −249.
- `lib/search/public-listing-trestle.ts`: +370 (new file).
- `lib/search/__tests__/public-listing-trestle.test.ts`: +364 (new file).

DB-first path: untouched by this slice (only the import line at the top
of the route was changed). Response shape: untouched (same responseBody
keys, same `_compliance` block, same caching headers, same audit log
shape — only the value passed for `filter` changed from
`filterParts.join(' and ')` to the new `filter` const).

Remaining `/api/listings` fragmentation:

- DB-first cache check / responseBody construction (route-owned response shaping).
- `featuresById` lookup build (needs pre-DTO serialized rows).
- `filterDisplayableDbListings()` second-pass fail-closed gate (canonical helper).
- `dbListingToPublicDTO` mapping (DTO mapping was explicitly out of scope).
- `geocodeListings` chain on both DB-first and Trestle paths (route-owned side-effect).
- Open House Trestle resource lookup on both paths (external resource by design).
- Trestle fallback RAW post-filters: distribution gates, pet-friendly amenity
  match against `PetsAllowed`, property sub-type post-filter, borough
  post-filter against `address.county`/`address.city`, bounds post-filter
  against geocoded lat/lng. All intentionally outside the helper's OData scope.
- `mapRESOToInternal` mapping (DTO mapping out of scope).
- Trestle media backfill chain (Phase 1 per-listing + Phase 2 DB fallback).
- $orderby switch + `fetchTop` / `selectFields` / `useExpandMedia` flags
  (route-owned Trestle query shaping).
- The CRM `/api/idx/search` direct Trestle path — separately migrated.

Push gate: unchanged. Local branch remains ahead of `origin/main`. No push performed.

## Resume + push checkpoint — 2026-04-29T23:27 UTC

Two queued local commits delivered to `origin/main`.

Push: `0ca7a0de..5b164553  main -> main` at `2026-04-29T23:27:10Z`.
- `437b78e4` — memory corrections (10-min cron schedule, deploy time,
  parity counts, retracted Desktop-mirror claim).
- `5b164553` — RESO read-only diagnostic toolkit + MCP setup runbook
  (Layer 2 + Layer 3). Added `scripts/reso/` (7 tools + shared client +
  README) and `docs/reso-mcp-setup.md`. Six new `reso:*` npm scripts.
  Read-only — no schema, no migrations, no `lib/idx/` writers, no
  `lib/search/` writers, no /api routes touched.

Pre-push validation (all clean):
- `npm run type-check`: 0 errors
- `npm run compliance-check`: 87/87
- `npm run lint`: 0 errors, 0 warnings
- `npm run idx:validate`: WARN, 0 critical (853 pass, 5 warn, 29 info)
- `npm run ops:health`: HEALTHY. Sync ok. 0 errors. REBNY §2.05
  violations: 0.

Post-push:
- CI on the new HEAD: Release Truth ✅, Guardrails ✅, Auto-retry
  skipped (correct).
- Vercel deploy live: `/`, `/api/health`, `/api/listings` all 200.
- `npm run reso:analyze` at `2026-04-29T23:28Z`:
  - Trestle active 10,433 (sale 9,490, rent 943).
  - DB active 10,485 (Δ −52 vs Trestle expected — stale Active rows
    handled by data-retention cron).
  - Projection 19,869 / 19,869, **0 missing** (parity intact).
  - Public `/api/listings` total 5,163 (Δ −5,270 vs Trestle expected,
    in-flight migration gap, unchanged from earlier).
  - IDX Plus rate limit was partially consumed by today's earlier
    sessions — gate probes returned `n/a` for several gates. Per the
    resume prompt's rule, RESO probing stopped after one pass.

Search-alerts cron gate: **NOT YET CLEARED.**

- Latest `search_alerts_cron` audit row is `2026-04-29T07:30:06.434Z`
  with `{ sent: 0, total: 0, skipped: 0, errored: 0 }` — but that's
  pre-deploy.
- Original 0ca7a0de deploy was ~21:05Z. This resume push at 23:27Z is
  even later.
- Search-alerts schedule: `30 7 * * *` (daily 07:30 UTC).
- Next firing on new code: **`2026-04-30T07:30:00Z`** (~8 h from this
  push).
- No `search_alerts_cron_error` rows in the recent 10-row window.

PR 5F readiness: **NOT CLEARED.** Re-check after the
`2026-04-30T07:30 UTC` firing using:

```sql
SELECT * FROM audit_events
 WHERE action IN ('search_alerts_cron', 'search_alerts_cron_error')
 ORDER BY created_at DESC
 LIMIT 10;
```

Confirm `created_at` of the latest row is post-deploy (after ~`21:05Z`),
`changes.errored = 0`, and no `search_alerts_cron_error` rows
post-deploy. Once those three conditions hold, PR 5F is cleared to
start.

Memory writeback push state: this checkpoint is **local-only**. The
resume prompt's Step 3 push authorized only the two queued commits;
this fresh memory commit sits at +1 ahead of `origin/main` until the
next session decides to push.

---

## 2026-04-30 · RESO toolkit Layer-2 expansion (5 tools added — local commit only)

While waiting on the `2026-04-30T07:30 UTC` search-alerts cron gate
that clears PR 5F, expanded `scripts/reso/` from a 7-tool set to a
12-tool set. None of the additions touch DB writers, schema, env,
Vercel config, or the master-plan migration path — all are
read-only diagnostics that can run alongside the in-flight migration
without quota or risk concerns.

| New tool | npm alias | Burns Trestle quota? |
|---|---|---|
| `snapshot.js` | `reso:snapshot` | yes — one analyze pass per run (same as `reso:analyze`) |
| `gate-breakdown.js` | `reso:gate-breakdown` | yes — 1 baseline + 4 gate probes per run; has `--dry-run` to plan without spending |
| `drift.js` | `reso:drift` | **no** — reads `artifacts/metadata.xml` + REBNY CSV only |
| `route-catalog.js` | `reso:route-catalog` | **no** — static analysis of `app/api/**/route.ts` |
| `schema-audit.js` | `reso:schema-audit` | **no** — three-way compare of Prisma Listing model + REBNY CSV + metadata.xml |

### Trestle ↔ REBNY drift baseline (`drift.js` first run)

Cached `artifacts/metadata.xml` vs `data/rebny-rls-property-fields.csv`,
captured `2026-04-30T00:10:34Z` and persisted to
`artifacts/reso-drift/2026-04-30T00-10-34-631Z.json` + `latest.json`:

- **Property**: 745 fields in both, 0 Trestle-only, 1 REBNY-only.
  Trestle catches up on DD 2.1 → expect Trestle field count to rise.
- **Member / Office / Media**: identical sets (90/79/55 each).
- **OpenHouse / PropertyUnitTypes / CustomProperty**: REBNY uses
  spaced names (`Open House`, `Property UnitTypes`, `Custom Property`)
  while Trestle uses non-spaced (`OpenHouse`, `PropertyUnitTypes`,
  `CustomProperty`). Same fields — naming-cosmetic drift.
- **Trestle-only resources REBNY does not document**:
  PropertyRooms (39), Teams (48), TeamMembers (29),
  PropertyGreenVerification (39), DataSystem (7), Field (15),
  Lookup (15), Enumeration (8), Model (8). Matches the
  "Additional Trestle Resources" line in `CLAUDE.md`.

This baseline is what future runs diff against. When Trestle pushes
new fields (DD 2.1 certification, new resources) or REBNY revises the
IDX Plus CSV, the next run's `changes_since_prior` array will surface
the delta on stdout.

### Compliance topology baselines

`route-catalog.js` first run — 276 routes:
- agent/broker (explicit + path heuristic): 136
- public: 36 · portal: 25 · broker: 24 · cron: 23 · public(auth): 17
  · portal(path): 15 · agent/broker(path): 2
- listing-adjacent public routes WITH gate enforcement: 8
- listing-adjacent public routes WITHOUT gate enforcement: 2
  (worth eyeballing once for a tighter audit, but the static heuristic
  may be conservative — manual review before flagging as a finding.)

`schema-audit.js` first run — 58 Listing columns:
- 22 fully RESO + Trestle aligned
- 31 mallan-internal (deliberately not RESO-mapped: FKs, sync state,
  derived columns, JSON containers)
- 5 drift / verify-mapping (auction composite + small tail)

### Push state

`origin/main` is at `5b164553`. Local commits ahead of origin:
- `dde1819a` docs(memory): record resume + push of memory corrections + RESO toolkit
- `9bf3c9c9` docs(memory): RESO compliance audit 2026-04-29
- `14b16d4e` chore(reso): add scripts/reso/trace.js
- (this commit) chore(reso): Layer-2 tools — snapshot/gate-breakdown/drift/route-catalog/schema-audit

All four sit local-only awaiting explicit push authorization.
