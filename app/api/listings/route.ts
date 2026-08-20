import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, annotateCoListedSiblings } from '@/lib/idx/public-dto';
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';
import prisma from '@/lib/prisma';
import { geocodeListings } from '@/lib/geo/geocode';
import { filterDisplayableDbListings, dbListingToPublicDTO, classifyDbListing, type DbListing } from '@/lib/idx/db-to-public-dto';
import { preferCrmExclusiveOverIdxDuplicate } from '@/lib/listings/dedupe-crm-vs-idx';
import { getOpenHouseIndex, findNextOpenHouse } from '@/lib/open-houses/upcoming-open-houses';
import { buildSearchDisplayWhere, SEARCH_DISPLAY_GATE, ADDRESS_DISCLOSED_GATE } from '@/lib/search/listing-access-decision';
import { UNSUPPORTED_AMENITIES } from '@/lib/search/types';
import {
  amenityMatches,
  TRESTLE_AMENITY_SELECT_FIELDS,
} from '@/lib/search/canonical/amenity-match';
import { computeFinalUniverse, computeHasMore } from '@/lib/search/canonical/final-universe';
import {
  applyPublicListingPostFilters,
  buildPublicListingDbSearch,
} from '@/lib/search/public-listing-db';
import { buildPublicListingTrestleFilter } from '@/lib/search/public-listing-trestle';
import { toPublicListingSummaries } from '@/lib/idx/public-listing-summary';
// Trestle access audit logger — REBNY requires 12-month retention on MLS data access
const logTrestleAccess = async (data: Record<string, unknown>) => {
  try {
    const prismaModule = await import('@/lib/prisma');
    const db = prismaModule.default;
    await db.auditEvent.create({
      data: {
        action: 'trestle_access',
        entity_type: 'listing',
        entity_id: (data.filter as string)?.slice(0, 200) || 'unknown',
        user_type: 'system',
        changes: JSON.parse(JSON.stringify(data)),
        ip_address: (data.ip as string) || null,
      },
    });
  } catch {
    // Non-fatal — don't break listing fetch if audit logging fails
  }
};
import { reportApiError } from '@/lib/sentry-report';
import { lookupNeighborhoodZips } from '@/lib/geo/neighborhood-zips';

// ── Date helpers for OpenHouse filter ──
function nextDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getNextWeekend(): { sat: string; mon: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
  const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + (dayOfWeek === 6 ? 0 : daysUntilSat));
  const mon = new Date(sat);
  mon.setDate(sat.getDate() + 2);
  return {
    sat: sat.toISOString().split('T')[0],
    mon: mon.toISOString().split('T')[0],
  };
}

/**
 * Compute the envelope `_compliance.source` for a DB-first response.
 *
 * C1 fix (2026-05-13): replaces the prior hard-coded `db+exclusive`. The
 * label now reflects the actual provenance composition of the result set:
 *
 *   - `db+idx`       → every row is a third-party RLS sync (no Mallan
 *                       attribution); the envelope-level RLS disclaimer is
 *                       authoritative.
 *   - `db+exclusive` → every row is Mallan-authored or website-only
 *                       commercial (no RLS provenance).
 *   - `db+mixed`     → at least one row of each kind. The disclaimer still
 *                       applies because at least one row needs it.
 *
 * Empty result sets default to `db+exclusive` to match the legacy short-
 * circuit at the `isMallanExclusiveOnly` and `isNumberedAddressSearch`
 * branches below, which already emit that label.
 */
export function computeDbEnvelopeSource(
  listings: ReadonlyArray<Pick<DbListing, 'agent_id' | 'owner_client_id' | 'rls_eligible'>>,
): 'db+idx' | 'db+exclusive' | 'db+mixed' {
  if (listings.length === 0) return 'db+exclusive';
  let hasThirdParty = false;
  let hasMallan = false;
  for (const l of listings) {
    if (classifyDbListing(l) === 'third-party-idx') hasThirdParty = true;
    else hasMallan = true; // mallan-exclusive OR website-only
    if (hasThirdParty && hasMallan) return 'db+mixed';
  }
  return hasThirdParty ? 'db+idx' : 'db+exclusive';
}

// Vercel serverless: allow up to 60s for Trestle API calls + media fetch
export const maxDuration = 60;

// One Cycle W1: the paged findMany below is NOT wrapped yet — its select
// includes the BigInt `id` (and full rows), which the Next data cache cannot
// serialize safely; wrapping it needs the serialize-inside-closure refactor
// (W1 follow-up). The COUNT read (pure integer) is wrapped now.
import { cachedPublicRead, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { resolveFeedAuthorityForPage } from '@/lib/media/feed-media-authority';

// ── In-memory cache (same pattern as /api/idx/search) ──
interface CacheEntry { data: unknown; expiresAt: number }
const listingsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const CACHE_MAX = 50;

function getCached(key: string): unknown | null {
  const entry = listingsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { listingsCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  if (listingsCache.size >= CACHE_MAX) {
    const firstKey = listingsCache.keys().next().value;
    if (firstKey !== undefined) listingsCache.delete(firstKey);
  }
  listingsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Simple in-memory rate limiter (60 requests per minute per IP)
 * Prevents bulk scraping of listing data per REBNY RLS compliance
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/**
 * GET /api/listings
 *
 * COMPLIANCE PIPELINE (Option A — distribution gates on raw Trestle data):
 *   fetchFromTrestle() → raw records
 *   checkDistributionGates(raw) → filter non-displayable
 *   mapRESOToInternal(raw) → IDXListing
 *   toPublicDTO(listing) → PublicListingDTO (strips private data, suppresses address)
 *
 * When IDX_ENABLED=true: fetches from Trestle/REBNY RLS via OData v4.
 * When IDX_ENABLED=false: returns empty with clear indicator.
 * When Trestle fails: returns error (does NOT silently fall through).
 *
 * Query parameters:
 * - type: 'sale' | 'rent' | 'buy' - Filter by listing type
 * - neighborhood: string - Filter by neighborhood (CityRegion)
 * - borough: string - Filter by borough
 * - minPrice: number - Minimum price
 * - maxPrice: number - Maximum price
 * - beds: number - Minimum number of bedrooms
 * - minBaths: number - Minimum full bathrooms
 * - propertyType: string - Property sub-type (Condo, Co-op, etc.)
 * - status: string - StandardStatus filter (Active, ComingSoon, ActiveUnderContract)
 * - minSqft: number - Minimum living area in sqft
 * - maxSqft: number - Maximum living area in sqft
 * - sort: string - Sort order (price-asc, price-desc, newest, sqft-desc)
 * - skip: number - Pagination offset
 * - pets: boolean - Only show pet-friendly listings (local path only)
 * - featured: boolean - Only show featured listings (local path only)
 * - exclusive: boolean - Only show exclusive listings (local path only)
 * - limit: number - Max results (default 50)
 */
/**
 * PR-S.3 (2026-05-15) — q/address alias for public listing search.
 *
 * Public search URLs from `app/search/page.tsx` and `SearchAutocomplete`
 * route plain typed/selected queries through `?q=…`, but every downstream
 * consumer of `/api/listings` (the DB filter `buildPublicListingDbSearch`,
 * the Trestle fallback `buildPublicListingTrestleFilter`, and the numbered-
 * address heuristic below) reads `?address=…`. Without aliasing, a user
 * typing or selecting an address on the results page sees the query
 * silently dropped — fixed autocomplete (PR-S.1c–e) suggested the address,
 * the user picked it, and then results pretended no filter was set.
 *
 * Mutates `searchParams` in place by setting `address` to a trimmed `q`
 * when `address` is not already populated:
 *   - If `address` (trimmed) is non-empty → kept as-is; `q` is ignored.
 *     ("address wins" — preserves explicit callers and avoids redirect loops.)
 *   - Else if `q` (trimmed) is non-empty → `address` is set to trimmed `q`.
 *   - Else → no change.
 *
 * Idempotent. Safe to call multiple times. The cache key at the DB-first
 * path is built from `searchParams.toString()` AFTER this call, so
 * `?q=425` and `?address=425` collapse to the same cache key — better
 * hit rate and no cache-poisoning surprise.
 *
 * Exported for unit testing. Next.js App Router ignores non-handler
 * exports from route files at runtime.
 */
export function resolveAddressAlias(searchParams: URLSearchParams): void {
  const existingAddress = (searchParams.get('address') || '').trim();
  if (existingAddress) return; // address wins
  const qParam = (searchParams.get('q') || '').trim();
  if (!qParam) return; // empty / whitespace-only q ignored
  searchParams.set('address', qParam);
}

export async function GET(request: Request) {
  // Rate limiting — prevent bulk scraping
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    // PR-S.3 (2026-05-15): collapse `?q=…` into `?address=…` BEFORE any
    // downstream reader (cache key, DB filter, Trestle fallback). See the
    // resolveAddressAlias JSDoc above for the contract.
    resolveAddressAlias(searchParams);
    const useIDX = process.env.IDX_ENABLED === 'true';

    // Parse query params used directly by this route handler.
    // Filter/sort params consumed only by buildPublicListingDbSearch /
    // applyPublicListingPostFilters / buildPublicListingTrestleFilter are not
    // re-extracted here — those helpers read searchParams themselves.
    const listingType = searchParams.get('type');
    const neighborhood = searchParams.get('neighborhood');
    const borough = searchParams.get('borough');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const minBeds = searchParams.get('beds');
    const sortParam = searchParams.get('sort');
    const skipParam = searchParams.get('skip');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : 0;
    const propertySubTypes = searchParams.get('propertySubTypes') || searchParams.get('subTypes'); // accept both
    const amenitiesParam = searchParams.get('amenities'); // route-side pet-friendly RAW post-filter on the Trestle path

    // Amenities the UI can request but NO live Cotality field can answer must
    // be REJECTED, never quietly dropped. Verified corpus-wide on 2026-08-19:
    // `no-fee` has no `ListingTerms` on any row and `Concessions` is NULL on
    // all of them; `renovated`, `natural-light` and `quiet` have no
    // corresponding token in the live feature vocabularies at all.
    //
    // Silently ignoring one of these returns the FULL unfiltered corpus to a
    // user who asked to narrow it — a wrong answer presented as a right one.
    // Failing loud is the fail-closed direction for a search contract.
    const unsupportedAmenities = (amenitiesParam ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a) => UNSUPPORTED_AMENITIES.has(a));
    if (unsupportedAmenities.length > 0) {
      return NextResponse.json(
        {
          error: 'UNSUPPORTED_FILTER',
          message: `No live provider data backs these filters: ${unsupportedAmenities.join(', ')}.`,
          unsupported: unsupportedAmenities,
        },
        { status: 400 },
      );
    }
    const openHouseParam = searchParams.get('openHouse') === 'true';
    const openHouseDateParam = searchParams.get('openHouseDate'); // 'weekend' | ISO date | undefined
    const excludeUndisclosed = searchParams.get('excludeUndisclosed') === 'true';
    // `/exclusives` redirect (vercel.json:55-58) → `/buy?exclusive=mallan`.
    // When set, the response MUST contain only Mallan-authored listings —
    // returning other brokers' rows would violate UCBA Art. III §2(A) (no
    // unauthorized advertising) and 19 NYCRR §175.25 (no misleading
    // advertising). The DB filter is applied in `buildPublicListingDbSearch`;
    // here we additionally short-circuit the Trestle fallback so external
    // listings can never reach the response on this path.
    const isMallanExclusiveOnly = searchParams.get('exclusive') === 'mallan';
    // Numbered-address short-circuit (PR #107 + Codex follow-up).
    //
    // The search UI routes ALL plain free-text input through `address` (see
    // `app/search/page.tsx` plain-text branch). That includes numbered street
    // addresses ("425 park avenue south") AND building / neighborhood text
    // ("Carnegie Hall", "Hudson Yards", "central park"). The DB-first
    // `addressConditions()` only queries `StreetNumber` + `StreetName`, but
    // the Trestle fallback at `lib/search/public-listing-trestle.ts:138`
    // also searches `BuildingName` on its text-only path — that's where
    // building-name queries find their matches.
    //
    // For NUMBERED queries an unfiltered Trestle fallback returns garbage
    // (UCBA Art. III §2(A) / 19 NYCRR §175.25 violation surfaced as the
    // 425 Park bug Maya filed). For TEXT-ONLY queries the Trestle fallback
    // is the only place a building-name search works.
    //
    // Heuristic: a leading digit (after trim) reliably marks a numbered
    // street address. Everything else is treated as text and allowed to
    // fall through to Trestle. Codex P1 feedback on PR #107 — narrowing
    // the original `isAddressSearch` so building-name queries still find
    // their listings.
    const addressInput = (searchParams.get('address') || '').trim();
    const isNumberedAddressSearch = /^\d/.test(addressInput);

    // Min > Max price validation
    if (minPrice && maxPrice && parseInt(minPrice, 10) > parseInt(maxPrice, 10)) {
      return NextResponse.json({
        success: true,
        count: 0,
        total: 0,
        skip: 0,
        limit,
        hasMore: false,
        listings: [],
        _compliance: {
          source: 'none',
          idxEnabled: useIDX,
          disclaimer: 'Minimum price exceeds maximum price.',
        },
      }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // DB-FIRST PATH: Serve from Postgres when synced data exists.
    // Falls through to live Trestle if DB has no synced listings.
    // ═══════════════════════════════════════════════════════════
    if (useIDX) {
      // Cache key from all query params
      const cacheKey = `listings:${searchParams.toString()}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
        });
      }

      // ── Try DB-first: query synced listings from Postgres ──
      // Skips extra count query — just runs the main query directly.
      // If no synced results come back, falls through to live Trestle.
      try {
        {
          // Two display paths: RLS listings (must pass 6 distribution gates) OR
          // website-only listings (commercial, rls_eligible=false — bypass gates)
          const { where: dbWhere, orderBy: dbOrderBy } = buildPublicListingDbSearch(searchParams);
          if (excludeUndisclosed) {
            // Canonical DB-side address-disclosure gate, ANDed BEFORE pagination.
            // This previously ORed in `listing_id startsWith 'SL-' | 'RL-'`, so a
            // PREFIX satisfied a filter whose whole purpose is "only listings
            // whose address I may show" — an RLS-eligible Mallan exclusive with a
            // seller address opt-out was returned anyway. A prefix is provenance,
            // never permission. See ADDRESS_DISCLOSED_GATE.
            const w = dbWhere as Record<string, unknown>;
            const andClause = ADDRESS_DISCLOSED_GATE;
            w.AND = Array.isArray(w.AND) ? [...w.AND, andClause] : w.AND ? [w.AND, andClause] : [andClause];
          }
          const dbTake = limit;
          const dbSkip = skip;

          const [dbListings, dbTotal] = await Promise.all([
            prisma.listing.findMany({
              where: dbWhere,
              orderBy: dbOrderBy,
              skip: dbSkip,
              take: dbTake,
              select: {
                id: true,
                listing_id: true,
                status: true,
                listing_type: true,
                property_type: true,
                property_sub_type: true,
                list_price: true,
                bedrooms_total: true,
                bathrooms_full: true,
                bathrooms_half: true,
                living_area: true,
                borough: true,
                neighborhood: true,
                postal_code: true,
                address: true,
                features: true,
                // dbListingToPublicDTO derives several public fields ONLY from
                // raw_data (the full Trestle payload): virtualTourURL
                // (VirtualTourURLBranded/Unbranded — not stored in `features`,
                // which excludes the B26 media group), plus previousListPrice,
                // daysOnMarket, leaseAmount, availabilityDate, on/closeDate.
                // Omitting raw_data silently dropped all of these from DB-backed
                // cards (e.g. the PR-C 3D Tour badge never showed). Response is
                // cached (5 min), so the extra JSON is amortized.
                raw_data: true,
                // PR 4: keep reading `media` JSON as the fallback source for
                // the 0.3% of listings not yet mirrored into listing_media.
                media: true,
                // Phase B: typed agent columns so the public DTO resolves attribution TYPED-FIRST.
                list_agent_full_name: true, list_office_name: true,
                list_agent_email: true, list_agent_direct_phone: true,
                list_office_mls_id: true, list_agent_mls_id: true,
                co_list_office_mls_id: true, co_list_agent_mls_id: true,
                // C1 fix (2026-05-13): provenance signals needed by the DTO
                // to distinguish Mallan exclusives (agent_id / owner_client_id)
                // from website-only commercial (rls_eligible=false) from
                // third-party IDX/RLS (everything else). Without these the DTO
                // hard-codes `_source: "exclusive"` for every row.
                agent_id: true,
                owner_client_id: true,
                rls_eligible: true,
                idx_display_yn: true,
                internet_entire_listing_display_yn: true,
                internet_address_display_yn: true,
                owner_opt_out: true,
                participant_only: true,
                listing_contract_date: true,
                modification_timestamp: true,
                created_at: true,
                updated_at: true,
                // PR 4 reader swap — relational media table. Filtered to
                // active rows and ordered by (order, id) so the resolver
                // receives a stable input. Selected columns mirror
                // ListingMediaTableRow exactly so we don't over-fetch.
                listing_media: {
                  where: { status: 'active' },
                  orderBy: [{ order: 'asc' }, { id: 'asc' }],
                  select: {
                    // media_key: MIXED-GALLERY COMPOSITION. resolveDbListingMedia treats an
                    // all-`crm:` relational set as a SUPPLEMENT to the legacy Cotality feed
                    // JSON rather than as the whole gallery; without this column that case is
                    // undetectable and one CRM upload hides the entire feed gallery.
                    media_key: true,
                    media_url_original: true,
                    media_url_cached: true,
                    media_type: true,
                    media_category: true,
                    media_classification: true,
                    order: true,
                    preferred_photo_yn: true,
                    status: true,
                  },
                },
                // All-status existence signal for the DTO's media authority (this
                // select is ACTIVE-only). Without it, a Mallan exclusive whose
                // relational photos were all deleted would read as "never imported"
                // and resurrect deleted photos from the legacy JSON. Same batched
                // query — no N+1 (Codex review, 2026-07-16).
                _count: { select: { listing_media: true } },
              },
            }),
            cachedPublicRead(() => prisma.listing.count({ where: dbWhere }), [
              "api-listings-count",
              cacheKey,
            ], { tags: [SEARCH_CACHE_TAG] })(),
          ]);

          if (dbListings.length > 0) {
            const serialized: DbListing[] = dbListings.map((l) => ({
              ...l,
              id: l.id.toString(),
              list_price: l.list_price.toString(),
              living_area: l.living_area?.toString() ?? null,
              // C1 fix: stringify BigInt FKs for JSON safety; the classifier
              // only checks `!= null` so the value shape doesn't matter, but
              // mixing BigInts into JSON.stringify throws at serialization.
              agent_id: l.agent_id != null ? l.agent_id.toString() : null,
              owner_client_id: l.owner_client_id != null ? l.owner_client_id.toString() : null,
            }));

            const displayable = filterDisplayableDbListings(serialized);
            // Public-surface dedupe (2026-05-28): when a Mallan CRM exclusive
            // (SL-/RL-) and a Trestle-synced IDX duplicate represent the same
            // physical unit (same address atoms + unit + zip), keep only the
            // CRM row. The IDX row stays in DB for audit history. See
            // docs/crm/listing-canonical-mallan-exclusive-audit-2026-05-28.md
            // and lib/listings/dedupe-crm-vs-idx.ts.
            // FEED-authority: ONE grouped query for the page (lib/media/feed-media-authority.ts).
            // Only genuinely ambiguous listings are queried — Mallan-owned are excluded, a listing
            // already holding an ACTIVE feed row is proven without a read, and a listing with no
            // legacy payload has nothing to gate. A failed lookup PROPAGATES rather than quietly
            // permitting the stale legacy replay.
            const feedAuthority = await resolveFeedAuthorityForPage(
              prisma,
              displayable.map((l) => ({
                ctx: { listingId: l.listing_id, rlsEligible: l.rls_eligible },
                tableRows: Array.isArray(l.listing_media) ? l.listing_media : [],
                hasLegacyPayload: Array.isArray(l.media) && l.media.length > 0,
              })),
            );

            // Explicit arrow, NOT a bare `.map(dbListingToPublicDTO)`: `Array.map` passes
            // (value, index, array), so a bare reference would hand the INDEX to the options param.
            let publicListings = preferCrmExclusiveOverIdxDuplicate(
              displayable.map((l) =>
                dbListingToPublicDTO(l, { hadFeedRelationalRows: feedAuthority.get(l.listing_id) }),
              ),
            );

            // Build features lookup — passed into applyPublicListingPostFilters
            // for amenity/keyword evaluation against the raw Trestle features JSON.
            const featuresById = new Map<string, Record<string, unknown>>();
            for (const dbL of serialized) {
              const feat = (dbL.features || {}) as Record<string, unknown>;
              featuresById.set(dbL.listing_id, feat);
            }

            // Geocode DB listings — use only in-memory + DB cache (fast).
            // Census API geocoding is too slow for search (~2-5s) — it runs during
            // the IDX sync cron instead. Listings without cached coords get ZIP centroids.
            // Fire-and-forget with a tight 1.5s timeout so it never blocks the response.
            const geocodePromise = Promise.race([
              geocodeListings(publicListings),
              new Promise<void>((resolve) => setTimeout(resolve, 1500)),
            ]).catch(() => { /* non-fatal */ });

            // All DB-first DTO post-filters (ownership, yearBuilt, furnished,
            // amenities, keywords) are owned by lib/search/public-listing-db.ts.
            // Address search is already pushed into the Prisma query via
            // buildPublicListingDbSearch(). Open House is handled below — it
            // requires a live Trestle OpenHouse resource lookup that the
            // helper intentionally does not own.
            publicListings = applyPublicListingPostFilters(publicListings, featuresById, searchParams);

            // Open House filter on DB path — query Trestle OpenHouse resource
            if (openHouseParam) {
              try {
                const ohToken = await getAccessToken();
                const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
                const today = new Date().toISOString().split('T')[0];

                let ohDateFilter = `OpenHouseDate ge ${today}`;
                if (openHouseDateParam && openHouseDateParam !== 'weekend') {
                  ohDateFilter = `OpenHouseDate ge ${openHouseDateParam} and OpenHouseDate lt ${nextDay(openHouseDateParam)}`;
                } else if (openHouseDateParam === 'weekend') {
                  const { sat, mon } = getNextWeekend();
                  ohDateFilter = `OpenHouseDate ge ${sat} and OpenHouseDate lt ${mon}`;
                }

                const ohParams = new URLSearchParams();
                ohParams.set('$select', 'ListingKey');
                ohParams.set('$filter', `${ohDateFilter} and OpenHouseStatus eq 'Active'`);
                ohParams.set('$top', '500');
                const ohRes = await fetch(`${TRESTLE_API}/odata/OpenHouse?${ohParams.toString()}`, {
                  headers: { Authorization: `Bearer ${ohToken}`, Accept: 'application/json' },
                });
                if (ohRes.ok) {
                  const ohData = await ohRes.json();
                  const ohKeys = new Set((ohData.value || []).map((r: Record<string, unknown>) => String(r.ListingKey)));
                  publicListings = publicListings.filter(l => ohKeys.has(l.id));
                }
              } catch (ohErr) {
                console.warn('[/api/listings] DB-path open house filter failed:', ohErr instanceof Error ? ohErr.message : ohErr);
              }
            }

            // PR-E.1.a (2026-05-14) — bounded live media fallback for the
            // DB-first path.
            //
            // The 2026-05-14 PR-E.1 investigation found 1,286 listings (12.2%
            // of all active+displayable) had ZERO media in both the relational
            // `listing_media` table AND the legacy `media` JSON column. Those
            // rendered as blank search cards. The `/api/listings/[id]` detail
            // endpoint already fetches media live from Trestle for the same
            // listings successfully (HEAD returns 200 image/jpeg on 90%+ of
            // them). This brings the same fallback into the list endpoint,
            // strictly bounded to never add more than 1.5s to the response.
            //
            // What this does NOT change (verified by the test suite):
            //   - No DB writes. listing_media + media JSON untouched.
            //   - No R2 mutations.
            //   - No change to _source, attribution, disclaimer, address
            //     suppression, or any compliance/distribution-gate flag.
            //   - No change to media-sync or media-backfill cron.
            // The earlier "Fetching photos per-listing during search added
            // 3-10s latency" comment referred to an unbounded fallback. This
            // one is hard-capped at 1.5s total via Promise.race in
            // `fillEmptyMediaWithLiveFallback`.
            //
            // PR-E.1.b will investigate why listing_media's `last_photos_change`
            // watermark is stuck at 2026-04-30 (the underlying cron issue).
            // PR-E.1.c may add a one-shot backfill script if needed. Neither
            // is in scope here.
            const { fillEmptyMediaWithLiveFallback } = await import('@/lib/media/photo-fallback');
            const { fetchListingMedia } = await import('@/lib/idx/fetch');
            const photoFallbackPromise = fillEmptyMediaWithLiveFallback(
              publicListings,
              {
                fetcher: (id) => fetchListingMedia(id),
                concurrency: 5,
                timeoutMs: 1500,
              },
            ).catch(() => publicListings);

            // Wait for both geocoding and photo fallback — each carries its
            // own 1.5s top-level timeout, so the response is never delayed
            // more than ~1.5s by these two background tasks combined.
            await Promise.allSettled([geocodePromise, photoFallbackPromise]);

            // C1 fix (2026-05-13): envelope source reflects the actual
            // composition of the response. Before this fix, every DB-first
            // response was labeled `db+exclusive` regardless of whether the
            // listings were Mallan-authored, third-party RLS, or both. Now:
            //   - `db+idx`       → all rows are third-party Trestle/RLS syncs
            //   - `db+exclusive` → all rows are Mallan-authored or website-only
            //   - `db+mixed`     → mixed result set
            // The full RLS disclaimer text stays in the envelope for ALL three
            // cases so the user-visible attribution never regresses.
            const envelopeSource = computeDbEnvelopeSource(displayable);

            // PR-FE.2 Option C (2026-05-15): annotate cards whose slug
            // shares an address with another listing on the same page
            // (NYC luxury new-development co-listing case: 3 brokerages
            // listing the same physical apartment). Each annotated card
            // gets `_coListedCount` + `_coListedBrokerages` so the
            // SearchListingCard can render a small "Also listed by …"
            // badge that visually differentiates 3 otherwise-identical
            // cards. Pure post-processing — does NOT remove or merge
            // any rows. Single pass over the array; O(N) work.
            let annotatedListings = annotateCoListedSiblings(publicListings);
            if (excludeUndisclosed) {
              annotatedListings = annotatedListings.filter(
                // No `_source === 'exclusive'` exemption. Provenance is not address
                // permission: once the canonical DTO says 'Address Undisclosed', a
                // Mallan exclusive is exactly as undisclosed as any other listing.
                l => l.address?.streetName !== 'Address Undisclosed'
              );
            }

            // Attach the upcoming PUBLIC open house to each card (homepage Featured + search /
            // Mallan-listings cards read this for the "Open House · Sun 12–1 PM" banner). The index is
            // Mallan-scoped and matched by listing id OR normalized address (twin-safe: a SL-0007
            // exclusive card matches the open house on its RLS20099289 twin). Best-effort — a Trestle
            // hiccup never blocks or breaks the listings response. ET times, no agent contact info.
            try {
              const ohIndex = await getOpenHouseIndex();
              if (ohIndex.size > 0) {
                for (const l of annotatedListings) {
                  const next = findNextOpenHouse(l, ohIndex);
                  if (next) l.nextOpenHouse = next;
                }
              }
            } catch { /* best-effort enrichment */ }

            const responseBody = {
              success: true,
              count: annotatedListings.length,
              total: dbTotal,
              skip,
              limit,
              hasMore: skip + limit < dbTotal,
              // SUMMARY CONTRACTION at the response boundary — cards get the
              // canonical hero + full photosCount, never the whole gallery.
              // Applied AFTER post-filters/dedupe/geocode/live-fallback and
              // annotation, so nothing upstream loses complete media.
              listings: toPublicListingSummaries(annotatedListings),
              _compliance: {
                source: envelopeSource,
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
              },
            };

            setCache(cacheKey, responseBody);

            return NextResponse.json(responseBody, {
              headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
            });
          }

          // `exclusive=mallan` short-circuit. The DB filter
          // (`buildPublicListingDbSearch` → `where.agent_id = { not: null }`)
          // returned 0 rows — meaning no Mallan-authored listings currently
          // exist. UCBA Art. III §2(A) + 19 NYCRR §175.25 require the page to
          // truthfully reflect this; falling through to the Trestle merge
          // would surface other brokers' rows under our "exclusives" label.
          if (isMallanExclusiveOnly) {
            const responseBody = {
              success: true,
              count: 0,
              total: 0,
              skip,
              limit,
              hasMore: false,
              listings: [],
              _compliance: {
                source: 'db+exclusive',
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer: 'No exclusive Mallan listings currently available.',
              },
            };
            setCache(cacheKey, responseBody);
            return NextResponse.json(responseBody, {
              headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
            });
          }
          // Numbered-address miss short-circuit. See the
          // `isNumberedAddressSearch` comment at the top of the route for
          // the compliance rationale and the leading-digit heuristic.
          // Text-only queries (building names, neighborhood fragments) are
          // intentionally NOT caught here — they need the Trestle
          // BuildingName fallback to find their matches.
          if (isNumberedAddressSearch) {
            const responseBody = {
              success: true,
              count: 0,
              total: 0,
              skip,
              limit,
              hasMore: false,
              listings: [],
              _compliance: {
                source: 'db+exclusive',
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer: `No listings found matching "${addressInput}". Try a different address or broaden your search.`,
              },
            };
            setCache(cacheKey, responseBody);
            return NextResponse.json(responseBody, {
              headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
            });
          }
        }
      } catch (dbErr) {
        // DB query failed — fall through to live Trestle (unless this is an
        // exclusive=mallan or numbered-address search; those must never
        // silently serve unrelated external rows). Text-only address
        // queries still fall through so the Trestle BuildingName search
        // can find building-name matches.
        console.warn('[/api/listings] DB-first query failed, falling back to Trestle:', dbErr instanceof Error ? dbErr.message : dbErr);
        if (isMallanExclusiveOnly) {
          return NextResponse.json(
            {
              success: true,
              count: 0,
              total: 0,
              skip,
              limit,
              hasMore: false,
              listings: [],
              _compliance: {
                source: 'db+exclusive',
                idxEnabled: true,
                disclaimer: 'No exclusive Mallan listings currently available.',
              },
            },
            { headers: { 'Cache-Control': 'private, no-store' } },
          );
        }
        if (isNumberedAddressSearch) {
          return NextResponse.json(
            {
              success: true,
              count: 0,
              total: 0,
              skip,
              limit,
              hasMore: false,
              listings: [],
              _compliance: {
                source: 'db+exclusive',
                idxEnabled: true,
                disclaimer: `No listings found matching "${addressInput}". Try a different address or broaden your search.`,
              },
            },
            { headers: { 'Cache-Control': 'private, no-store' } },
          );
        }
      }

      // ═══════════════════════════════════════════════════════════
      // TRESTLE FALLBACK: Live Trestle API (when DB has no synced data)
      // ═══════════════════════════════════════════════════════════
      try {
        // Build OData $filter via the public Trestle helper.
        // The helper owns: status, listing type, commercial, price/beds/baths/
        // sqft, propertySubTypes, ownershipTypes, propertyType, yearBuilt,
        // furnished, address parsing, zip, neighborhood→ZIP, borough→county,
        // and keywords. The route still owns $orderby, $top, $select, the
        // RAW post-filters (pet-friendly, sub-type, borough, bounds), the
        // OpenHouse intersection, media backfill, DTO mapping, and cache.
        const filter = buildPublicListingTrestleFilter(searchParams);

        // Bounds is needed twice below — for fetchTop sizing and for the
        // bounds post-filter. Trestle IDX Plus does not expose Latitude/
        // Longitude for OData $filter, so bounds is always a post-filter.
        const boundsParam = searchParams.get('bounds'); // "south,west,north,east"

        // Build OData $orderby for sort. Owned by the route — sort wiring
        // is intentionally not part of the filter helper.
        let orderby: string | undefined;
        switch (sortParam) {
          case 'price-asc': orderby = 'ListPrice asc'; break;
          case 'price-desc': orderby = 'ListPrice desc'; break;
          case 'sqft-desc': orderby = 'LivingArea desc'; break;
          case 'beds-desc': orderby = 'BedroomsTotal desc'; break;
          case 'neighborhood': orderby = 'City asc'; break;
          case 'new-development':
            // PropertySubType OData filter crashes Trestle — handled as post-filter
            orderby = 'ModificationTimestamp desc';
            break;
          case 'exclusives':
            // Exclusives are DB-only (our own listings) — skip Trestle, handled by merge
            orderby = 'ModificationTimestamp desc';
            break;
          case 'newest': orderby = 'ListingContractDate desc'; break;
          default: orderby = 'ListPrice desc'; break;
        }

        // Fetch extra to account for gate filtering + post-filters
        // Property type, neighborhood, borough all need heavy post-filtering headroom
        // Collection amenities are evaluated LOCALLY (lambda filters are HTTP
        // 400), so they are post-filters and must size the fetch like any other.
        // They were absent here, so an amenity request fetched a page sized for
        // NO post-filtering and then discarded most of it.
        const hasCollectionAmenityFilter = (amenitiesParam ?? '')
          .split(',')
          .map((a) => a.trim())
          .some((a) => a && a !== 'pet-friendly' && !UNSUPPORTED_AMENITIES.has(a));
        const hasPostFilter = !!(boundsParam || borough || neighborhood || sortParam === 'new-development' || hasCollectionAmenityFilter);
        const fetchTop = Math.min(Math.ceil((limit + skip) * (hasPostFilter ? 4 : 1.2) + 20), 1000);

        // Amenity fields ARE selectable. The comment here used to assert they
        // are "unavailable on IDX Plus feed and Trestle rejects unknown fields
        // (causes 400/502)". Live-verified 2026-08-19: all 16 of
        // BuildingFeatures / InteriorFeatures / ExteriorFeatures / Appliances /
        // LaundryFeatures / Cooling / View / ParkingFeatures / PetsAllowed /
        // NewConstructionYN / GarageYN / FireplaceYN / PropertySubType /
        // CommonInterest / YearBuilt / Furnished $select together and ALL are
        // returned. What is genuinely rejected is `/any()` LAMBDA FILTERING on
        // the collection fields (HTTP 400) — selecting them is fine, so they can
        // be matched Mallan-side by the SAME canonical matcher the projection
        // producer uses.
        const selectFields = [...new Set([...CARD_SELECT_FIELDS, ...TRESTLE_AMENITY_SELECT_FIELDS])];

        // NEVER use $expand=Media — Trestle's OData $expand returns empty arrays for
        // ~50% of listings (broken navigation property). Always batch-fetch separately.
        const useExpandMedia = false;

        const result = await fetchFromTrestle({
          filter,
          select: selectFields,
          top: fetchTop,
          maxTotal: fetchTop,
          orderby,
          count: true,
          expandMedia: useExpandMedia,
        });

        // Step 1: Distribution gates on RAW Trestle data (Option A)
        // This runs checkDistributionGates() BEFORE mapping — works directly on
        // raw OData field names. No type mismatch with Listing type.
        const displayable = result.records.filter(
          (raw) => checkDistributionGates(raw).displayable
        );

        // ── Step 1b: amenities, through the ONE canonical matcher ────────────
        //
        // THE SECOND ENGINE THAT USED TO LIVE HERE IS GONE. It re-derived a
        // different answer AFTER the corrected provider filter had already run,
        // so a single request had two Search truths:
        //   - pet-friendly was matched by substring on a lowercased PetsAllowed,
        //     which treats "BuildingYes,No" (building permits pets, THE UNIT DOES
        //     NOT) as a match;
        //   - every non-pet amenity was silently IGNORED, so a fallback response
        //     answered "elevator + dishwasher" with unfiltered inventory;
        //   - New Development was re-narrowed by PublicRemarks prose plus a
        //     "YearBuilt within 3 years" guess, AFTER the provider had already
        //     narrowed it correctly by `NewConstructionYN eq true`;
        //   - a local subTypeMap carried `SingleFamilyTownhouse`, `NewConstruction`
        //     and space-variant literals that are not live enum members at all.
        //
        // Pets and New Development are now PROVIDER-side (exact-token
        // `PetsAllowed has`, and `NewConstructionYN eq true`), so they are not
        // re-applied here. Collection amenities cannot be pushed (lambda filters
        // are HTTP 400), so they run here — but through `amenityMatches`, the
        // same function that derives `amenity_keys` for the projection. One
        // contract, two execution sources.
        let amenityFiltered = displayable;
        const requestedAmenities = (amenitiesParam ?? '')
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a && a !== 'pet-friendly' && !UNSUPPORTED_AMENITIES.has(a));
        for (const amenity of requestedAmenities) {
          amenityFiltered = amenityFiltered.filter((raw) =>
            amenityMatches(amenity, raw as Record<string, unknown>),
          );
        }

        // Step 1c: sub-types are pushed to the provider (PropertySubType and
        // CommonInterest are both live-filterable — `PropertySubType eq
        // 'Apartment'` returns 6,680), so there is nothing to re-derive here.
        const subTypeFiltered = amenityFiltered;

        // Step 2: Map to IDXListing
        const mapped = subTypeFiltered
          .map((raw) => mapRESOToInternal(raw))
          .filter((l): l is NonNullable<typeof l> => l !== null);

        // Step 3: Post-fetch filters (can't push to OData)
        let filtered = mapped;

        if (borough) {
          const boroughLower = borough.toLowerCase();
          filtered = filtered.filter((l) => {
            const county = l.address.county.toLowerCase();
            const city = l.address.city.toLowerCase();
            if (boroughLower === 'manhattan') return county.includes('new york') || city === 'manhattan';
            if (boroughLower === 'brooklyn') return county.includes('kings') || city === 'brooklyn';
            if (boroughLower === 'queens') return county.includes('queens') || city === 'queens';
            if (boroughLower === 'bronx') return county.includes('bronx') || city === 'bronx';
            if (boroughLower === 'staten island') return county.includes('richmond') || city === 'staten island';
            return county.includes(boroughLower) || city === boroughLower;
          });
        }

        // Neighborhood post-filter REMOVED — CityRegion is unreliable in REBNY data.
        // Neighborhood filtering is handled by ZIP-code push to OData (line ~631).
        // The old CityRegion post-filter was discarding ALL results.

        // Bounds post-filter: narrow ZIP-based results to precise lat/lng box.
        // Trestle IDX Plus returns Latitude/Longitude as null AND blocks OData
        // geo filters (400 error). We must geocode first, then filter by bounds.
        if (boundsParam) {
          const [south, west, north, east] = boundsParam.split(',').map(Number);
          if (south && west && north && east) {
            // Geocode filtered listings BEFORE bounds check, with a 5s timeout.
            // (Trestle gives null lat/lng — Census geocoder fills them in)
            // Without timeout, Census API + Neon cold starts can hang for 26s+.
            try {
              await Promise.race([
                geocodeListings(filtered),
                new Promise<void>((resolve) => setTimeout(resolve, 5000)),
              ]);
            } catch (geoErr) {
              console.warn('[/api/listings] Pre-bounds geocoding failed:', geoErr instanceof Error ? geoErr.message : geoErr);
            }

            filtered = filtered.filter((l) => {
              const lat = l.address.latitude;
              const lng = l.address.longitude;
              if (!lat || !lng) return true; // keep listings without coords
              return lat >= south && lat <= north && lng >= west && lng <= east;
            });
          }
        }

        // Open House filter — requires separate Trestle OpenHouse resource query
        if (openHouseParam) {
          try {
            const ohToken = await getAccessToken();
            const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
            const today = new Date().toISOString().split('T')[0];

            // Build date filter based on user selection
            let ohDateFilter = `OpenHouseDate ge ${today}`;
            if (openHouseDateParam && openHouseDateParam !== 'weekend') {
              // Specific date: show open houses on that exact day
              ohDateFilter = `OpenHouseDate ge ${openHouseDateParam} and OpenHouseDate lt ${nextDay(openHouseDateParam)}`;
            } else if (openHouseDateParam === 'weekend') {
              // This weekend: Saturday + Sunday
              const { sat, mon } = getNextWeekend();
              ohDateFilter = `OpenHouseDate ge ${sat} and OpenHouseDate lt ${mon}`;
            }

            const ohParams = new URLSearchParams();
            ohParams.set('$select', 'ListingKey');
            ohParams.set('$filter', `${ohDateFilter} and OpenHouseStatus eq 'Active'`);
            ohParams.set('$top', '500');
            const ohRes = await fetch(`${TRESTLE_API}/odata/OpenHouse?${ohParams.toString()}`, {
              headers: { Authorization: `Bearer ${ohToken}`, Accept: 'application/json' },
            });
            if (ohRes.ok) {
              const ohData = await ohRes.json();
              const ohListingKeys = new Set((ohData.value || []).map((r: Record<string, unknown>) => String(r.ListingKey)));
              filtered = filtered.filter(l => ohListingKeys.has(l.listingId));
            }
          } catch (ohErr) {
            console.warn('[/api/listings] Open house filter failed:', ohErr instanceof Error ? ohErr.message : ohErr);
          }
        }

        // Step 4: FINAL ELIGIBLE UNIVERSE, then pagination — in that order.
        //
        // `total` previously used the provider count unless bounds/borough/
        // neighborhood were present. Collection amenities filter LOCALLY and
        // were not in that list, so an elevator search returned elevator-only
        // IDs beside the PRE-amenity provider total. Where a local filter WAS
        // recognised the code used `filtered.length` — a locally-filtered slice
        // of a BOUNDED head sample, which is not a corpus count either.
        //
        // The canonical helper refuses to fabricate: when a local filter is
        // active and the head sample was saturated it reports the total as a
        // LOWER BOUND and keeps paging open, rather than publishing a confident
        // wrong number.
        const finalUniverse = computeFinalUniverse({
          providerCount: result.odataCount ?? null,
          fetchedCount: result.records.length,
          fetchTop,
          locallyFilteredCount: filtered.length,
          hasLocalFilter: !!(boundsParam || borough || neighborhood || hasCollectionAmenityFilter),
        });
        const totalCount = finalUniverse.total;
        const pageListings = filtered.slice(skip, skip + limit);

        // Step 4b+4c: Batch-fetch photos AND geocode IN PARALLEL (both are slow I/O)
        // When $expand=Media was used, photos are already inline — skip batch fetch.
        // Fallback batch-fetch only runs for large queries where $expand was disabled.
        // Fetch media: try Trestle per-listing first, then fall back to DB.
        // Trestle Media queries are unreliable for ~50% of listings (OData bug).
        // DB has photos from previous successful syncs — use as fallback.
        const { fetchListingMedia } = await import('@/lib/idx/fetch');
        const photoPromise = (async () => {
          const needsPhotos = pageListings.filter(l => l.media.length === 0);
          // Batch photo fetch for listings missing media
          if (needsPhotos.length === 0) return;

          // Phase 1: Fetch from Trestle per-listing
          try {
            const CONCURRENCY = 5;
            for (let i = 0; i < needsPhotos.length; i += CONCURRENCY) {
              const batch = needsPhotos.slice(i, i + CONCURRENCY);
              const results = await Promise.allSettled(batch.map(async (listing) => {
                const media = await fetchListingMedia(listing.listingId, {
                  listingKeyNumeric: listing.listingKeyNumeric,
                });
                if (media.length > 0) {
                  const PH = ['cotality.com', 'corelogic.com'];
                  listing.media = media.map(m => ({
                    ...m,
                    url: PH.some(h => m.url.includes(h))
                      ? `/api/media/proxy?url=${encodeURIComponent(m.url)}`
                      : m.url,
                  })) as typeof listing.media;
                }
                return { id: listing.listingId, count: media.length };
              }));
              // Phase 1 photo-batch results are surfaced through the audit
              // trail at the call site, not logged here.
              void results;
            }
          } catch (e) { console.warn('[Photos] Phase 1 error:', e instanceof Error ? e.message : e); }
          // Remaining empty listings fall through to DB phase

          // Phase 2: For listings STILL empty, check DB via the SHARED DB-only
          // policy `resolveDbListingMedia` — parity with the detail page.
          //
          // This query selects only ACTIVE `listing_media` rows (the card never
          // needs deleted rows in its payload), so it CANNOT tell "no rows ever
          // imported" from "rows existed but were intentionally deleted" by row
          // count alone. `_count: { select: { listing_media: true } }` supplies
          // the all-status existence signal in the SAME batched query (a Prisma
          // aggregate subquery — NOT a per-listing round-trip, no N+1). Media
          // ownership follows the canonical isMallanExclusiveListing rule
          // (SL-/RL- listing_id OR rls_eligible === false; NEVER agent_id or
          // owner_client_id, and never mls_id), which lets a Mallan-owned
          // listing's intentional deletion stay
          // authoritative (no legacy-JSON resurrection) while a third-party
          // Cotality listing with all-inactive rows falls back to its
          // Cotality-sourced JSON — matching the detail page exactly.
          const stillEmpty = pageListings.filter(l => l.media.length === 0);
          if (stillEmpty.length > 0) {
            try {
              const { resolveDbListingMedia, toDtoMedia } = await import('@/lib/media/listing-media-resolver');
              const dbListings = await prisma.listing.findMany({
                where: {
                  listing_id: { in: stillEmpty.map(l => l.listingId) },
                },
                select: {
                  listing_id: true,
                  media: true,
                  rls_eligible: true,
                  _count: { select: { listing_media: true } },
                  listing_media: {
                    where: { status: 'active' },
                    orderBy: [{ order: 'asc' }, { id: 'asc' }],
                    select: {
                      // media_key: MIXED-GALLERY COMPOSITION. resolveDbListingMedia treats an
                      // all-`crm:` relational set as a SUPPLEMENT to the legacy Cotality feed
                      // JSON rather than as the whole gallery; without this column that case is
                      // undetectable and one CRM upload hides the entire feed gallery.
                      media_key: true,
                      media_url_original: true,
                      media_url_cached: true,
                      media_type: true,
                      media_category: true,
                      media_classification: true,
                      order: true,
                      preferred_photo_yn: true,
                      status: true,
                    },
                  },
                },
              });
              // FEED-authority in ONE grouped query before the backfill loop. This path exists to
              // fill cards Trestle returned EMPTY — so if the feed is authoritatively empty
              // (rows materialized then tombstoned), backfilling from the stale legacy JSON is
              // exactly the republication this fix closes.
              const backfillAuthority = await resolveFeedAuthorityForPage(
                prisma,
                dbListings.map((dbL) => ({
                  ctx: { listingId: dbL.listing_id, rlsEligible: dbL.rls_eligible },
                  tableRows: Array.isArray(dbL.listing_media) ? dbL.listing_media : [],
                  hasLegacyPayload: Array.isArray(dbL.media) && dbL.media.length > 0,
                })),
              );
              for (const dbL of dbListings) {
                const listing = stillEmpty.find(l => l.listingId === dbL.listing_id);
                if (!listing) continue;
                const tableRows = Array.isArray(dbL.listing_media) ? dbL.listing_media : [];
                const resolved = resolveDbListingMedia(
                  tableRows,
                  Array.isArray(dbL.media) ? (dbL.media as Record<string, unknown>[]) : [],
                  {
                    listingId: dbL.listing_id,
                    rlsEligible: dbL.rls_eligible,
                  },
                  {
                    hadRelationalRows: (dbL._count?.listing_media ?? 0) > 0,
                    hadFeedRelationalRows: backfillAuthority.get(dbL.listing_id),
                  },
                );
                if (resolved.length === 0) continue;
                listing.media = toDtoMedia(resolved) as typeof listing.media;
              }
            } catch { /* non-fatal — DB fallback is best-effort */ }
          }
        })();

        // Geocode only if we didn't already geocode the full set for bounds filtering
        const geocodePromise = !boundsParam
          ? geocodeListings(pageListings).catch(geoErr => {
              console.warn('[/api/listings] Geocoding failed:', geoErr instanceof Error ? geoErr.message : geoErr);
            })
          : Promise.resolve();

        // Wait for both to finish in parallel
        await Promise.allSettled([photoPromise, geocodePromise]);

        const publicListings = pageListings.map(toPublicDTO);

        // ── Merge local exclusive listings from DB ──
        // UCBA Art. I, Sec. 5: Simultaneous Distribution — only show listings
        // that are Active (already on RLS). Drafts are NOT displayed publicly.
        // Dedup by listing_id to avoid showing the same listing twice.
        const mergedListings = await mergeExclusiveListings(
          publicListings,
          listingType,
          borough,
          neighborhood,
          minPrice ? parseInt(minPrice, 10) : undefined,
          maxPrice ? parseInt(maxPrice, 10) : undefined,
          minBeds ? parseInt(minBeds, 10) : undefined,
        );

        // PR-FE.2 Option C (2026-05-15) — annotate co-listed siblings in
        // the Trestle-direct + exclusive-merged path too. Same shape and
        // semantics as the DB-first branch above. Pure post-processing,
        // does not remove or merge rows.
        let annotatedMerged = annotateCoListedSiblings(mergedListings);
        if (excludeUndisclosed) {
          annotatedMerged = annotatedMerged.filter(
            // No `_source === 'exclusive'` exemption — provenance is not address
            // permission. See ADDRESS_DISCLOSED_GATE.
            l => l.address?.streetName !== 'Address Undisclosed'
          );
        }

        const responseBody = {
          success: true,
          count: annotatedMerged.length,
          total: totalCount + annotatedMerged.length - publicListings.length,
          skip,
          limit,
          hasMore: computeHasMore(finalUniverse, skip, limit) || result.hasMore,
          // SUMMARY CONTRACTION at the response boundary — cards get the
          // canonical hero + full photosCount, never the whole gallery.
          // Applied AFTER post-filters/dedupe/geocode/live-fallback and
          // annotation, so nothing upstream loses complete media.
          listings: toPublicListingSummaries(annotatedMerged),
          _compliance: {
            source: 'idx+exclusive',
            idxEnabled: true,
            attribution: generateAttributionText(),
            disclaimer:
              'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
            totalFetched: result.totalFetched,
          },
        };

        setCache(cacheKey, responseBody);

        // Async audit log (non-blocking)
        logTrestleAccess({
          endpoint: '/api/listings',
          method: 'GET',
          trestleResource: 'Property',
          filter,
          recordCount: publicListings.length,
          gateFilteredCount: result.totalFetched - displayable.length,
          caller: { ip },
          durationMs: Date.now() - (performance.now() | 0),
          statusCode: 200,
        }).catch(() => {});

        return NextResponse.json(responseBody, {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        });
      } catch (idxError) {
        // IDX fetch failed — return error to frontend (do NOT silently fall through to empty data)
        const message = idxError instanceof Error ? idxError.message : 'Unknown error';
        console.error('[/api/listings] IDX fetch failed:', message);

        // Surface a safe error to the frontend — no internal details leaked
        const isRateLimit = message.includes('429') || message.includes('rate limit');
        const isAuth = message.includes('401') || message.includes('Missing IDX_CLIENT');
        const statusCode = isRateLimit ? 503 : isAuth ? 503 : 502;
        const userMessage = isRateLimit
          ? 'Search temporarily unavailable. Please try again shortly.'
          : 'Unable to load listings. Please try again later.';

        return NextResponse.json(
          {
            success: false,
            error: userMessage,
            count: 0,
            total: 0,
            listings: [],
            _compliance: {
              source: 'idx',
              idxEnabled: true,
              disclaimer: 'Information deemed reliable but not guaranteed.',
            },
          },
          {
            status: statusCode,
            headers: {
              'Cache-Control': 'private, no-store',
              ...(isRateLimit ? { 'Retry-After': '30' } : {}),
            },
          }
        );
      }
    }

    // IDX not enabled — still show local exclusive listings if any
    const exclusiveListings = await fetchExclusiveListings(
      listingType,
      borough,
      neighborhood,
      minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice ? parseInt(maxPrice, 10) : undefined,
      minBeds ? parseInt(minBeds, 10) : undefined,
    );

    return NextResponse.json(
      {
        success: true,
        count: exclusiveListings.length,
        total: exclusiveListings.length,
        skip: 0,
        limit,
        hasMore: false,
        // SUMMARY CONTRACTION at the response boundary — cards get the
        // canonical hero + full photosCount, never the whole gallery.
        // Applied AFTER post-filters/dedupe/geocode/live-fallback and
        // annotation, so nothing upstream loses complete media.
        listings: toPublicListingSummaries(exclusiveListings),
        _compliance: {
          source: exclusiveListings.length > 0 ? 'exclusive' : 'none',
          idxEnabled: false,
          disclaimer: exclusiveListings.length > 0
            ? 'Exclusive listings by Mallan Real Estate Inc.'
            : 'IDX search is not enabled. Contact administrator.',
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching listings:', error);
    reportApiError(error, { route: '/api/listings', method: 'GET' });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// ── Local Exclusive Listings from Database ──
// UCBA Art. I, Sec. 5: Only Active listings that have been submitted to RLS
// may be displayed publicly. Draft/Incomplete listings are NOT shown.

import type { PublicListingDTO } from '@/lib/idx/public-dto';
import type { Prisma } from '@prisma/client';

async function fetchExclusiveListings(
  listingType?: string | null,
  borough?: string | null,
  neighborhood?: string | null,
  minPrice?: number,
  maxPrice?: number,
  minBeds?: number,
): Promise<PublicListingDTO[]> {
  try {
    const where: Prisma.ListingWhereInput = {
      status: buildSearchDisplayWhere().status,
      OR: [
        { rls_eligible: true, ...SEARCH_DISPLAY_GATE },
        { rls_eligible: false, list_price: { gt: 0 }, address: { not: { equals: null } } },
      ],
    };

    if (listingType === 'sale' || listingType === 'buy') where.listing_type = 'sale';
    else if (listingType === 'rent') where.listing_type = 'rent';

    if (minPrice || maxPrice) {
      where.list_price = {};
      if (minPrice) (where.list_price as Prisma.DecimalFilter).gte = minPrice;
      if (maxPrice) (where.list_price as Prisma.DecimalFilter).lte = maxPrice;
    }

    if (minBeds != null) where.bedrooms_total = minBeds === 0 ? { equals: 0 } : { gte: minBeds };

    if (borough) {
      where.borough = { contains: borough, mode: 'insensitive' };
    }

    if (neighborhood) {
      const names = neighborhood.split(',').map(n => n.trim()).filter(Boolean);
      const allZips = [...new Set(names.flatMap(n => lookupNeighborhoodZips(n)))];
      const nameConditions = names.map(n => ({ neighborhood: { equals: n, mode: 'insensitive' as const } }));
      if (allZips.length > 0) {
        where.AND = [{ OR: [{ postal_code: { in: allZips } }, ...nameConditions] }];
      } else if (names.length === 1) {
        where.neighborhood = { equals: names[0], mode: 'insensitive' };
      } else {
        where.AND = [{ OR: nameConditions }];
      }
    }

    const dbListings = await prisma.listing.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      take: 50,
      select: {
        id: true,
        listing_id: true,
        status: true,
        listing_type: true,
        property_type: true,
        property_sub_type: true,
        list_price: true,
        bedrooms_total: true,
        bathrooms_full: true,
        bathrooms_half: true,
        living_area: true,
        borough: true,
        neighborhood: true,
        address: true,
        features: true,
        // dbListingToPublicDTO derives virtualTourURL + previousListPrice,
        // daysOnMarket, leaseAmount, availabilityDate, on/closeDate from
        // raw_data (not stored in `features`). Mirrors the main DB-first select.
        raw_data: true,
        // PR 4: media JSON kept as the fallback source for un-synced rows.
        media: true,
        // Phase B: typed agent columns so the public DTO resolves attribution TYPED-FIRST.
        list_agent_full_name: true, list_office_name: true,
        list_agent_email: true, list_agent_direct_phone: true,
        list_office_mls_id: true, list_agent_mls_id: true,
        co_list_office_mls_id: true, co_list_agent_mls_id: true,
        // C1 fix (2026-05-13): provenance signals for the DTO classifier.
        // Mirrors the main DB-first select above.
        agent_id: true,
        owner_client_id: true,
        rls_eligible: true,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: true,
        participant_only: true,
        listing_contract_date: true,
        modification_timestamp: true,
        created_at: true,
        updated_at: true,
        // PR 4 reader swap — relational media table (preferred path).
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            // media_key: MIXED-GALLERY COMPOSITION. resolveDbListingMedia treats an
            // all-`crm:` relational set as a SUPPLEMENT to the legacy Cotality feed
            // JSON rather than as the whole gallery; without this column that case is
            // undetectable and one CRM upload hides the entire feed gallery.
            media_key: true,
            media_url_original: true,
            media_url_cached: true,
            media_type: true,
            media_category: true,
            media_classification: true,
            order: true,
            preferred_photo_yn: true,
            status: true,
          },
        },
        // All-status existence signal (this select is ACTIVE-only) so the DTO's
        // media authority can tell "never imported" from "all deleted" and never
        // resurrects deleted Mallan photos. Same batched query — no N+1 (Codex
        // review, 2026-07-16).
        _count: { select: { listing_media: true } },
      },
    });

    // Serialize BigInt + Decimal for the mapper
    const serialized: DbListing[] = dbListings.map((l) => ({
      ...l,
      id: l.id.toString(),
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
      // C1 fix: stringify BigInt FKs for JSON safety; see the main DB-first
      // path above for the same shape.
      agent_id: l.agent_id != null ? l.agent_id.toString() : null,
      owner_client_id: l.owner_client_id != null ? l.owner_client_id.toString() : null,
    }));

    const displayable = filterDisplayableDbListings(serialized);
    // Explicit arrow, NOT a bare `.map(dbListingToPublicDTO)`: `Array.map` passes (value, index,
    // array), so a bare reference would hand the numeric INDEX to the options parameter.
    //
    // No feed-authority signal here by design — this is the Mallan EXCLUSIVES path (SL-/RL-), and
    // Mallan-owned media keeps its existing `hadRelationalRows === false` rule untouched.
    return displayable.map((l) => dbListingToPublicDTO(l));
  } catch (err) {
    console.warn('[/api/listings] Exclusive listings fetch failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Merge local exclusive listings with Trestle IDX results.
 * Deduplicates by listing_id — if a listing exists in both Trestle and local DB,
 * the LOCAL Mallan row is canonical (CHARTER Section 1A). The returned Cotality
 * RLS copy is retained internally for source/audit but must NOT become the public
 * canonical listing. This comment previously said the Trestle version took
 * precedence, which is the reversed model.
 */
async function mergeExclusiveListings(
  trestleListings: PublicListingDTO[],
  listingType?: string | null,
  borough?: string | null,
  neighborhood?: string | null,
  minPrice?: number,
  maxPrice?: number,
  minBeds?: number,
): Promise<PublicListingDTO[]> {
  const exclusives = await fetchExclusiveListings(listingType, borough, neighborhood, minPrice, maxPrice, minBeds);

  if (exclusives.length === 0) return trestleListings;

  // Build set of IDs already in Trestle results
  const trestleIds = new Set(trestleListings.map((l) => l.id));

  // Only add exclusives that aren't already in Trestle results
  const newExclusives = exclusives.filter((e) => !trestleIds.has(e.id));

  if (newExclusives.length === 0) return trestleListings;

  // Prepend exclusives (your own listings first)
  return [...newExclusives, ...trestleListings];
}
