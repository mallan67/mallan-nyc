import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO, annotateCoListedSiblings } from '@/lib/idx/public-dto';
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { geocodeListings } from '@/lib/geo/geocode';
import { filterDisplayableDbListings, dbListingToPublicDTO, classifyDbListing, type DbListing } from '@/lib/idx/db-to-public-dto';
import {
  preferCrmExclusiveOverIdxDuplicate,
  dedupeAddressFromDbRow,
} from '@/lib/listings/dedupe-crm-vs-idx';
import { getOpenHouseIndex, findNextOpenHouse } from '@/lib/open-houses/upcoming-open-houses';
import { buildSearchDisplayWhere, SEARCH_DISPLAY_GATE, ADDRESS_DISCLOSED_GATE } from '@/lib/search/listing-access-decision';
import {
  applyPublicListingPostFilters,
  buildPublicListingDbSearch,
} from '@/lib/search/public-listing-db';
import { buildPublicListingTrestleFilter } from '@/lib/search/public-listing-trestle';
import { assemblePublicUniverse } from '@/lib/search/public-universe';
import { unsupportedExclusiveCriteria } from '@/lib/search/public-exclusive-criteria';
import {
  readOpenHouseMembership,
  type OpenHouseMembership,
} from '@/lib/search/open-house-membership';
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

/**
 * How many candidate rows one public search may read to settle membership.
 *
 * A BUDGET, NOT A UNIVERSE. When it is reached the count becomes a declared
 * LOWER BOUND and the last page number is withheld — the traversal says it did
 * not finish rather than pretending the inventory ended where the budget did.
 */
const PUBLIC_CANDIDATE_BUDGET = 12_000;
const PUBLIC_CANDIDATE_BATCH = 500;

/**
 * The same idea on the live-Cotality fallback: a ceiling on candidates read,
 * declared as a budget and reported as one. The minimum keeps a shallow page
 * from reading so little that ordinary exclusions empty it.
 */
const PUBLIC_TRESTLE_CANDIDATE_BUDGET = 1_000;
const PUBLIC_TRESTLE_MIN_CANDIDATES = 200;

/**
 * EVERYTHING A CARD NEEDS — used for the PAGE, never for the walk.
 *
 * 43 scalar columns plus `features` (which carries ~2.6KB of PublicRemarks),
 * the `media` JSON blob, and a filtered `listing_media` relation join. Read for
 * fifty rows that is nothing; read for a 7,125-row candidate universe it was
 * ~1.3ms per row of pure database read and transfer, and it is what made a
 * corrected public search take eleven seconds. Membership never looks at any of
 * the heavy members.
 */
const PAGE_LISTING_SELECT = {
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
} satisfies Prisma.ListingSelect;

/**
 * WHAT A CORPUS FILTER NEEDS: the card projection MINUS the display-only
 * members.
 *
 * A corpus-filter search derives propertyType, yearBuilt, furnished,
 * petsAllowed and publicRemarks through the same DTO the page uses, so it
 * cannot use the membership projection. It has no use for `media`,
 * `listing_media` or `_count` — those feed the gallery, and no filter reads
 * them. Dropping the three keeps the derivations byte-identical while removing
 * the relation join, which is the part that scales badly across a corpus.
 */
const FILTER_LISTING_SELECT = (() => {
  const {
    media: _media,
    listing_media: _listingMedia,
    _count: _countRel,
    ...rest
  } = PAGE_LISTING_SELECT;
  return rest satisfies Prisma.ListingSelect;
})();
/**
 * EVERYTHING MEMBERSHIP NEEDS, AND NOTHING ELSE.
 *
 * The six distribution-gate columns, the listing identity, the address the
 * canonical physical-unit key is built from, and the timestamp reconciliation
 * uses to pick a winner between two Mallan rows. No media, no relation join, no
 * remarks.
 */
const MEMBERSHIP_LISTING_SELECT = {
  listing_id: true,
  status: true,
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: true,
  participant_only: true,
  address: true,
  modification_timestamp: true,
} satisfies Prisma.ListingSelect;
/** Pages of the OpenHouse resource one request may walk before refusing. */
const OPEN_HOUSE_MAX_PAGES = 40;
const OPEN_HOUSE_PAGE_SIZE = 500;

/**
 * WHAT A CANDIDATE NEEDS TO BE, AND NOTHING MORE.
 *
 * Membership reads six things: `id` and `address` (reconciliation), and — only
 * when a corpus filter is actually requested — propertyType, yearBuilt,
 * furnished, petsAllowed and publicRemarks. It never reads media, photos, the
 * slug, the URL, agent attribution or the compliance block.
 *
 * Building a full public DTO for every candidate to reach those fields measured
 * 1.29ms per row, of which media composition alone was two thirds: nine seconds
 * of the eleven a 7,125-row sale search took, spent composing galleries for rows
 * that were only being counted. The page still gets the complete DTO — it is
 * built from `__row` after membership settles, for the fifty rows on screen.
 *
 * Satisfies DedupeCandidate and PublicPostFilterListing structurally, so both
 * existing helpers run unchanged over it.
 */
type DbCandidate = {
  id: string;
  address?: ReturnType<typeof dedupeAddressFromDbRow> | null;
  modificationTimestamp?: string | null;
  propertyType?: string | null;
  yearBuilt?: number | null;
  furnished?: string | null;
  petsAllowed?: string | null;
  publicRemarks?: string | null;
  __row: DbListing;
};

/**
 * The COMPLETE set of listing keys with an active open house in the requested
 * range, or an explicit refusal. Never a partial set: see
 * lib/search/open-house-membership.ts.
 */
async function readPublicOpenHouseMembership(
  openHouseDateParam: string | null,
): Promise<OpenHouseMembership> {
  const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
  const today = new Date().toISOString().split('T')[0];

  let ohDateFilter = `OpenHouseDate ge ${today}`;
  if (openHouseDateParam && openHouseDateParam !== 'weekend') {
    ohDateFilter = `OpenHouseDate ge ${openHouseDateParam} and OpenHouseDate lt ${nextDay(openHouseDateParam)}`;
  } else if (openHouseDateParam === 'weekend') {
    const { sat, mon } = getNextWeekend();
    ohDateFilter = `OpenHouseDate ge ${sat} and OpenHouseDate lt ${mon}`;
  }

  const first = new URLSearchParams();
  first.set('$select', 'ListingKey');
  first.set('$filter', `${ohDateFilter} and OpenHouseStatus eq 'Active'`);
  first.set('$top', String(OPEN_HOUSE_PAGE_SIZE));
  const firstUrl = `${TRESTLE_API}/odata/OpenHouse?${first.toString()}`;

  return readOpenHouseMembership({
    maxPages: OPEN_HOUSE_MAX_PAGES,
    fetchPage: async (nextLink) => {
      const token = await getAccessToken();
      const res = await fetch(nextLink ?? firstUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      // THROWN, NOT SWALLOWED. A non-OK response is a failure to establish
      // membership; degrading it to an empty page would read as "nothing has an
      // open house" and return an empty search under a 200.
      if (!res.ok) throw new Error(`OpenHouse HTTP ${res.status}`);
      const data = await res.json();
      return {
        keys: (data.value || []).map((r: Record<string, unknown>) => String(r.ListingKey)),
        nextLink: (data['@odata.nextLink'] as string | undefined) ?? null,
      };
    },
  });
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
          // CANDIDATES, NOT A PAGE.
          //
          // `skip`/`take` here are CANDIDATE coordinates. The broker's page is
          // cut later, from membership that has been settled — see
          // assemblePublicUniverse below. This query used to take `skip: skip,
          // take: limit` and hand a page straight to filters that then removed
          // rows from it, which is how a page of 50 rendered 31 and how the
          // rows removed were lost rather than pulled forward.
          const readCandidateBatch = (batchSkip: number, batchTake: number) =>
            prisma.listing.findMany({
              where: dbWhere,
              orderBy: dbOrderBy,
              skip: batchSkip,
              take: batchTake,
              select: PAGE_LISTING_SELECT
            });

          // OPEN HOUSE MEMBERSHIP IS ESTABLISHED FIRST, OR THE CRITERION IS REFUSED.
          //
          // It used to run last, as a `$top=500` read intersected with rows that
          // were already a page, inside a `try { } catch { console.warn }`. When
          // the provider failed the filter simply did not run and the response
          // carried the UNFILTERED set under an Open House request — a silent
          // widening behind a 200. Now the complete range is resolved up front
          // and a range that cannot be completed refuses the search instead of
          // answering it wrongly.
          let openHouseKeys: ReadonlySet<string> | null = null;
          if (openHouseParam) {
            const membership = await readPublicOpenHouseMembership(
              openHouseDateParam,
            );
            if (membership.state === "unavailable") {
              return NextResponse.json(
                {
                  success: false,
                  error: "Open House results are unavailable right now.",
                  criterion: "openHouse",
                  reason: membership.reason,
                },
                { status: 503, headers: { "Cache-Control": "no-store" } },
              );
            }
            openHouseKeys = membership.listingKeys;
          }

          // Typed by the columns it actually converts, not by one caller's row
          // shape — the card projection and the corpus-filter projection differ
          // by three display-only members, and both need serializing.
          // Typed by the columns it actually converts, not by one caller's row
          // shape — the card projection and the corpus-filter projection differ
          // by three display-only members, and both need serializing.
          const serializeCandidate = <
            T extends {
              id: bigint;
              list_price: unknown;
              living_area: unknown;
              agent_id: bigint | null;
              owner_client_id: bigint | null;
            },
          >(
            l: T,
          ): DbListing =>
            ({
              ...l,
              id: String(l.id),
              list_price: String(l.list_price),
              living_area: l.living_area != null ? String(l.living_area) : null,
              // C1 fix: stringify BigInt FKs for JSON safety; the classifier
              // only checks `!= null` so the value shape doesn't matter, but
              // mixing BigInts into JSON.stringify throws at serialization.
              agent_id: l.agent_id != null ? String(l.agent_id) : null,
              owner_client_id: l.owner_client_id != null ? String(l.owner_client_id) : null,
            }) as unknown as DbListing;

          // THE CANDIDATE-PREDICATE POPULATION — a DIFFERENT number, kept and
          // named as one.
          //
          // This is what `prisma.count(dbWhere)` has always measured: how many
          // rows the SQL predicate matches, BEFORE display eligibility, Mallan
          // reconciliation, the business filters and Open House removed
          // anything. It used to be reported as `total`, which is why the number
          // above the cards described a population the cards did not come from.
          // It is genuinely useful — it says how much the Mallan-side stages
          // removed — so it is kept, cached as an anonymous public read, and
          // published under its own name where it cannot be mistaken for a
          // result count. `findMany` stays uncached: its rows carry BigInt ids
          // that the data cache cannot serialize.
          const dbPredicateCount = await cachedPublicRead(() => prisma.listing.count({ where: dbWhere }), [
            "api-listings-count",
            cacheKey,
          ], { tags: [SEARCH_CACHE_TAG] })();

          // DOES ANY STAGE NEED MORE THAN THE MEMBERSHIP PROJECTION?
          //
          // A corpus filter derives its five fields through the same DTO the
          // page uses, so its walk must read the fuller row. Nothing else does.
          //
          // This flag REPLACES a shortcut that skipped the walk entirely when no
          // Mallan-authored row matched the predicate. That precondition proved
          // dead in Preview: Mallan holds exclusives in every broad sale band, so
          // it never fired where it was needed, and it charged an extra count
          // query to every request to find that out. The walk itself is now cheap
          // enough that skipping it buys nothing worth a precondition.
          const corpusFiltersActive =
            !!openHouseParam ||
            ["ownershipTypes", "yearBuilt", "furnished", "amenities", "keywords"].some(
              (p) => !!searchParams.get(p),
            );

          // THE FINAL PUBLIC UNIVERSE. Reconciliation, display eligibility and
          // every business filter run over the WHOLE corpus; the page is the
          // last thing that happens, and `count` describes the same set the
          // cards come from.
          const universe = await assemblePublicUniverse<DbListing, DbCandidate>({
            // READ WHAT MEMBERSHIP NEEDS, NOT WHAT A CARD NEEDS.
            //
            // Measured on Preview: with DTO construction already removed from
            // this path, a 7,125-row walk still cost ~9.4s — ~1.3ms per row of
            // database read and transfer, because every candidate arrived with
            // ~2.6KB of remarks, a media JSON blob and a filtered relation join
            // for photos nobody was going to look at. A corpus filter still
            // needs the full row (it derives its five fields through the same
            // DTO the page uses), and those searches legitimately do more work.
            readBatch: async (batchSkip, batchTake) =>
              corpusFiltersActive
                ? (
                    await prisma.listing.findMany({
                      where: dbWhere,
                      orderBy: dbOrderBy,
                      skip: batchSkip,
                      take: batchTake,
                      select: FILTER_LISTING_SELECT,
                    })
                  ).map(serializeCandidate)
                : ((await prisma.listing.findMany({
                    where: dbWhere,
                    orderBy: dbOrderBy,
                    skip: batchSkip,
                    take: batchTake,
                    select: MEMBERSHIP_LISTING_SELECT,
                    // The membership projection carries no BigInt column, so it
                    // needs no serialization pass. The gate helper reads only
                    // the six columns above; the cast says so rather than
                    // pretending this is a whole listing.
                  })) as unknown as DbListing[]),
            // Display eligibility is already in `dbWhere`; this stays as
            // defense-in-depth. It runs HERE and not inside readBatch on
            // purpose: readBatch's row count is the exhaustion signal, and a
            // filter that shortened a batch would fake the end of the universe.
            toDtos: (rows) =>
              filterDisplayableDbListings(rows).map((l) => {
                // The five corpus-filter fields are derived through the SAME
                // DTO the page uses, so a filter can never see a value the card
                // would not — but ONLY when a corpus filter was requested. With
                // none requested those fields are never read, and building them
                // is the nine seconds this walk used to spend.
                const filterFields = corpusFiltersActive
                  ? dbListingToPublicDTO(l)
                  : null;
                return {
                  id: l.listing_id,
                  // One mapping, shared with buildAddressKeyFromDbRow, so a row
                  // keyed here and a row keyed through the DTO cannot disagree
                  // about which physical unit it is.
                  address: dedupeAddressFromDbRow(l),
                  modificationTimestamp:
                    l.modification_timestamp instanceof Date
                      ? l.modification_timestamp.toISOString()
                      : (l.modification_timestamp as string | null) ?? null,
                  propertyType: filterFields?.propertyType ?? null,
                  yearBuilt: filterFields?.yearBuilt ?? null,
                  furnished: filterFields?.furnished ?? null,
                  petsAllowed: filterFields?.petsAllowed ?? null,
                  publicRemarks: filterFields?.publicRemarks ?? null,
                  __row: l,
                } as DbCandidate;
              }),
            reconcile: (candidates) => preferCrmExclusiveOverIdxDuplicate(candidates),
            corpusFilter: (candidates) => {
              const featuresById = new Map<string, Record<string, unknown>>();
              for (const c of candidates) {
                featuresById.set(
                  c.__row.listing_id,
                  (c.__row.features || {}) as Record<string, unknown>,
                );
              }
              const filtered = applyPublicListingPostFilters(
                candidates,
                featuresById,
                searchParams,
              );
              return openHouseKeys
                ? filtered.filter((l) => openHouseKeys!.has(l.id))
                : filtered;
            },
            page: Math.floor(skip / Math.max(1, limit)) + 1,
            pageSize: limit,
            budget: PUBLIC_CANDIDATE_BUDGET,
            batchSize: PUBLIC_CANDIDATE_BATCH,
          });

          const dbTotal = universe.count;

          // CANDIDATES READ, not rows on this page. A deep page of a real result
          // set is legitimately empty, and falling through to the live provider
          // because page 9 of a 3-page search is empty would answer a different
          // question from a different source.
          if (universe.candidatesRead > 0) {
            // THE PAGE, hydrated from rows whose membership is already settled.
            //
            // Public-surface dedupe (2026-05-28) — when a Mallan CRM exclusive
            // (SL-/RL-) and a Trestle-synced IDX duplicate represent the same
            // physical unit (same address atoms + unit + zip), keep only the
            // CRM row — now runs as the universe's `reconcile` stage over the
            // COMPLETE corpus. Page-local, it could not collapse a twin that
            // landed on another page, so one physical unit occupied two
            // identities in the public universe. See
            // docs/crm/listing-canonical-mallan-exclusive-audit-2026-05-28.md
            // and lib/listings/dedupe-crm-vs-idx.ts.
            // HYDRATE THE PAGE, NOT THE UNIVERSE.
            //
            // When the walk used the membership projection its rows carry no
            // media, so the fifty rows on screen are re-read with the full card
            // select. One small indexed query by listing_id, against a walk that
            // would otherwise have dragged every heavy column across thousands
            // of rows. Order is restored from the settled page, not from the
            // database — membership decided it, and a re-read must not reorder
            // what the count already described.
            const pageListingIds = universe.rows.map((c) => c.__row.listing_id);
            let displayable: DbListing[];
            if (corpusFiltersActive) {
              displayable = universe.rows.map((c) => c.__row);
            } else if (pageListingIds.length === 0) {
              displayable = [];
            } else {
              const hydrated = (
                await prisma.listing.findMany({
                  where: { listing_id: { in: pageListingIds } },
                  select: PAGE_LISTING_SELECT,
                })
              ).map(serializeCandidate);
              const byListingId = new Map(hydrated.map((l) => [l.listing_id, l]));
              displayable = pageListingIds
                .map((id) => byListingId.get(id))
                .filter((l): l is DbListing => !!l);
            }
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
            //
            // Re-mapped rather than reused from the universe because feed-media
            // authority is a PER-PAGE batched query — resolving it across the
            // whole corpus would be a large read for a value that changes no
            // row's membership, only its media.
            let publicListings = displayable.map((l) =>
              dbListingToPublicDTO(l, { hadFeedRelationalRows: feedAuthority.get(l.listing_id) }),
            );

            // Geocode DB listings — use only in-memory + DB cache (fast).
            // Census API geocoding is too slow for search (~2-5s) — it runs during
            // the IDX sync cron instead. Listings without cached coords get ZIP centroids.
            // Fire-and-forget with a tight 1.5s timeout so it never blocks the response.
            const geocodePromise = Promise.race([
              geocodeListings(publicListings),
              new Promise<void>((resolve) => setTimeout(resolve, 1500)),
            ]).catch(() => { /* non-fatal */ });

            // MEMBERSHIP IS ALREADY SETTLED.
            //
            // The DB-first business filters (ownership, yearBuilt, furnished,
            // amenities, keywords) and the Open House intersection used to run
            // HERE, on rows that were already a page. Both are now stages of
            // assemblePublicUniverse above, applied to the complete corpus
            // before the count is taken and before the page is cut. Nothing
            // below this line may remove a listing: `publicListings` IS the
            // page, and a row dropped now is a row the count already promised.
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
              // THE SAME UNIVERSE THE CARDS CAME FROM.
              //
              // `total` was `prisma.count(dbWhere)` — the population BEFORE
              // display eligibility, Mallan reconciliation, the business filters
              // and the Open House intersection had removed anything. The number
              // above the results and the results themselves described different
              // sets, and the gap grew with every criterion the SQL could not
              // express. It is now the size of the settled universe.
              total: dbTotal,
              countMeaning: universe.countMeaning,
              totalPages: universe.totalPages,
              /** Which stage removed what, kept separate so a missing listing is traceable. */
              excluded: universe.exclusions,
              candidatesRead: universe.candidatesRead,
              /** SQL-predicate matches, before any Mallan-side stage. NOT a result count. */
              candidatePredicateCount: dbPredicateCount,
              skip,
              limit,
              // Fail-SAFE: also true when the count is only a floor, so a
              // truncated traversal never reads as "that is everything".
              hasMore: universe.hasMore,
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

        // A WORK BUDGET, NOT A UNIVERSE.
        //
        // This was `(limit + skip) * (hasPostFilter ? 4 : 1.2) + 20`, capped at
        // 1000 — a guess at how much headroom the Mallan-side filters would need.
        // Two things were wrong with it, and neither is fixed by a bigger
        // multiple. It could not PROVE it had read far enough, so whenever
        // exclusions exceeded the guess the search silently lost rows; and
        // whichever number came out, the response reported the result as though
        // the inventory had ended there.
        //
        // Open House is deliberately NOT added to a headroom list here. Adding a
        // criterion to a multiplier does not make the multiplier honest — it
        // just moves the same guess. What changed is that a truncated read now
        // SAYS it was truncated: `countMeaning` below reports LOWER_BOUND and
        // the last page number is withheld, so a budget can bound the work of
        // one request without ever claiming to be the end of the inventory.
        const fetchTop = Math.min(
          Math.max(limit + skip + 20, PUBLIC_TRESTLE_MIN_CANDIDATES),
          PUBLIC_TRESTLE_CANDIDATE_BUDGET,
        );

        // Amenity fields are NOT added to Trestle $select — many are unavailable
        // on IDX Plus feed and Trestle rejects unknown fields (causes 400/502).
        // Amenity filtering uses PetsAllowed (already in CARD_SELECT_FIELDS) for
        // pet-friendly, and relies on DB path for all other amenity filters.
        const selectFields = [...CARD_SELECT_FIELDS];

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

        // Step 1b: Amenity filters on RAW Trestle data (before mapping)
        // Only pet-friendly is filterable on Trestle path (PetsAllowed is in $select).
        // Other amenity fields (BuildingFeatures, InteriorFeatures, etc.) are NOT
        // available on IDX Plus $select — those filters only work on DB path.
        let amenityFiltered = displayable;
        if (amenitiesParam) {
          const amenityList = amenitiesParam.split(',');
          if (amenityList.includes('pet-friendly')) {
            amenityFiltered = amenityFiltered.filter((raw) => {
              const val = String(raw.PetsAllowed || '').toLowerCase();
              if (!val) return false;
              return !val.includes('no') || val.includes('catsok') || val.includes('dogsok');
            });
          }
          // Note: doorman, gym, elevator, etc. cannot be filtered on Trestle path
          // because BuildingFeatures/InteriorFeatures are not in IDX Plus $select.
          // These amenities are properly filtered on the DB path (features JSONB).
        }

        // Step 1c: Property sub-type post-filter (can't push to OData — causes 502)
        let subTypeFiltered = amenityFiltered;
        if (propertySubTypes || sortParam === 'new-development') {
          const subTypeMap: Record<string, string[]> = {
            'Condo': ['Condo', 'Condominium'],
            'Co-op': ['StockCooperative', 'Stock Cooperative'],
            'Condop': ['Condop'],
            'Townhouse': ['SingleFamilyTownhouse', 'Townhouse'],
            'Multi-Family': ['MultiFamily', 'Multi-Family'],
            'Single Family': ['SingleFamilyResidence', 'Single Family'],
            'New Development': ['NewConstruction', 'New Construction'],
            'Loft': ['Loft'],
            'Duplex': ['Duplex'],
            'Triplex': ['Triplex'],
          };
          const isNewDev = sortParam === 'new-development' ||
            (propertySubTypes || '').split(',').some(t => t.trim() === 'New Development');
          if (isNewDev) {
            // NewConstructionYN/NewDevelopmentYN not available on IDX Plus $select.
            // Identify new development from PublicRemarks + YearBuilt.
            const currentYear = new Date().getFullYear();
            subTypeFiltered = subTypeFiltered.filter((raw) => {
              const remarks = String(raw.PublicRemarks || '').toLowerCase();
              const yearBuilt = Number(raw.YearBuilt) || 0;
              const isRecent = yearBuilt >= currentYear - 3;
              const hasKeywords = /new\s*(?:development|construction|building|condo)|sponsor\s*(?:unit|sale)|brand\s*new|never\s*(?:lived|occupied)|first\s*occupan/i.test(remarks);
              return hasKeywords || isRecent;
            });
          }
          // Also filter by structural/ownership types if requested (non-new-dev types)
          const nonNewDevTypes = (propertySubTypes || '').split(',')
            .filter(t => t.trim() !== 'New Development')
            .flatMap(t => subTypeMap[t.trim()] || [t.trim()])
            .filter(Boolean);
          if (nonNewDevTypes.length > 0 && !isNewDev) {
            const lowerTypes = nonNewDevTypes.map(t => t.toLowerCase());
            subTypeFiltered = subTypeFiltered.filter((raw) => {
              const pst = String(raw.PropertySubType || '').toLowerCase();
              const ci = String(raw.CommonInterest || '').toLowerCase();
              return lowerTypes.some(t => pst.includes(t) || ci.includes(t));
            });
          }
        }

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

        // OPEN HOUSE — THE SAME COMPLETE-RANGE RULE AS THE DB PATH.
        //
        // This was a single `$top=500` read wrapped in a catch that logged and
        // carried on. Both halves were wrong in the same direction as the DB
        // path: 501 open houses in the range silently stripped the 501st
        // listing's open house, and a provider failure skipped the filter
        // entirely, so an Open House search returned listings with none.
        //
        // One reader now owns both executors, so neither can drift from the
        // other, and an unanswerable range refuses the search instead of
        // answering it wrongly.
        if (openHouseParam) {
          const membership = await readPublicOpenHouseMembership(openHouseDateParam);
          if (membership.state === 'unavailable') {
            return NextResponse.json(
              {
                success: false,
                error: 'Open House results are unavailable right now.',
                criterion: 'openHouse',
                reason: membership.reason,
              },
              { status: 503, headers: { 'Cache-Control': 'no-store' } },
            );
          }
          filtered = filtered.filter((l) => membership.listingKeys.has(String(l.listingId)));
        }
        // ── Step 4: SETTLE MEMBERSHIP, THEN CUT THE PAGE ──
        //
        // Three things used to happen in the wrong order here. The page was cut
        // from `filtered`; THEN `mergeExclusiveListings` prepended Mallan
        // exclusives to that page; THEN `excludeUndisclosed` removed rows from
        // it. So the page grew and shrank after it had been decided, and the
        // reported total was
        //
        //     totalCount + annotatedMerged.length - publicListings.length
        //
        // — arithmetic across three different populations. Because a different
        // number of exclusives lands on each page, that total CHANGED AS THE
        // USER PAGED, and a listing could occupy a place on more than one page.
        //
        // Mallan authority and address permission are membership decisions, so
        // they belong to the corpus, not to a page. The count below is the size
        // of the set the cards are cut from — the same one, every page.
        // THE SECOND INJECTION IS GONE.
        //
        // `mergeExclusiveListings` used to prepend Mallan rows here. It applied
        // its own predicate carrying only type / borough / neighborhood / price
        // / beds — NOT the request's criteria — so it re-injected listings the
        // search had already excluded. Proven on Preview at 535d2a24: a query
        // pinned to one listing returned that listing under `maxBaths=1.5`
        // despite its 2.0 baths, and again under an impossible
        // `minSqft=99000`. An empty CORRECT answer was being broadened into a
        // wrong one.
        //
        // It is not merely unsafe here, it is REDUNDANT, and that is what
        // settles the question. This branch is reached only when the DB path
        // read ZERO candidates, and `dbWhere` already carries the full criteria
        // AND already admits Mallan-authored inventory — `rls_eligible: true`
        // under the display gates, website-only `rls_eligible: false`, and the
        // return-copy clause explicitly keeps `SL-`/`RL-`. So a Mallan exclusive
        // that genuinely matched would have made `candidatesRead > 0` and been
        // served by the DB path; this code could only ever add rows the criteria
        // had rejected.
        //
        // The fix is therefore removal, not a second filter engine. Copying the
        // criteria list into the exclusives query would leave two places to
        // forget a criterion, which is how this defect and the bathroom defect
        // both happened.
        const corpus = excludeUndisclosed
          ? filtered.map(toPublicDTO).filter(
              // No `_source === 'exclusive'` exemption — provenance is not
              // address permission. See ADDRESS_DISCLOSED_GATE.
              (l) => l.address?.streetName !== 'Address Undisclosed',
            )
          : filtered.map(toPublicDTO);
        // WHAT THE COUNT MEANS. `result.odataCount` is the PROVIDER's matching
        // universe, taken before gates, Mallan-side filters, the exclusives
        // merge and the disclosure gate removed or added anything — it can
        // never be a Mallan result count, with or without a bounds/borough
        // filter. The settled corpus is the only number that describes the
        // cards, and it is EXACT only when the provider read was not truncated.
        const totalCount = corpus.length;
        const candidatesTruncated = !!result.hasMore;
        const pageDtos = corpus.slice(skip, skip + limit);

        // Media and geocoding enrich only the PROVIDER-origin rows on this page;
        // exclusives arrive complete from the DB. Recovered by id so the page
        // order set above is preserved exactly.
        const internalById = new Map(filtered.map((l) => [String(l.listingId), l]));
        const pageListings = pageDtos
          .map((d) => internalById.get(String(d.id)))
          .filter((l): l is NonNullable<typeof l> => !!l);

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

        // The enriched provider rows go back into the page IN PLACE, so the
        // order settled above survives. Exclusives pass through untouched —
        // they arrive complete from the DB and were never media-enriched here.
        const enrichedById = new Map(
          pageListings.map((l) => [String(l.listingId), toPublicDTO(l)]),
        );
        const publicListings = pageDtos.map((d) => enrichedById.get(String(d.id)) ?? d);

        // PR-FE.2 Option C (2026-05-15) — annotate co-listed siblings in the
        // Trestle-direct + exclusive-merged path too. Same shape and semantics
        // as the DB-first branch above. Pure post-processing: it does not remove
        // or merge rows, and it must stay that way, because membership is
        // settled and counted before this line.
        //
        // The exclusives merge and the disclosure gate used to run HERE, after
        // the page was cut. Both are membership decisions and both now run on
        // the corpus at Step 4.
        const annotatedMerged = annotateCoListedSiblings(publicListings);
        const responseBody = {
          success: true,
          count: annotatedMerged.length,
          // THE SETTLED CORPUS. Not `totalCount + merged.length - page.length`,
          // which mixed a provider count with two page lengths and therefore
          // changed as the user paged.
          total: totalCount,
          countMeaning: candidatesTruncated ? 'lower_bound' : 'exact',
          // Withheld when the candidate read was truncated: "1000+ results /
          // page 1 of 5" is a self-contradiction.
          totalPages: candidatesTruncated ? null : Math.max(1, Math.ceil(totalCount / limit)),
          skip,
          limit,
          hasMore: skip + limit < totalCount || result.hasMore,
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

    // IDX not enabled — local Mallan listings only.
    //
    // FAIL CLOSED ON A CRITERION THIS PATH CANNOT ANSWER. `fetchExclusiveListings`
    // evaluates six things: type, borough, neighborhood, price, beds. Every other
    // public criterion — baths, sqft, year built, ownership, furnished, amenities,
    // keywords, open house, statuses, sub-types, ZIPs — it simply does not apply.
    //
    // Ignoring them returns listings that violate the search. That is exactly the
    // defect proven on the fallback branch, where an unevaluated criterion turned
    // a correct empty answer into a wrong non-empty one. An unanswerable criterion
    // must narrow to nothing here, never widen: being asked a question this path
    // cannot answer is not permission to answer a different one.
    const unsupportedForExclusives = unsupportedExclusiveCriteria(searchParams);
    const exclusiveListings = unsupportedForExclusives.length > 0
      ? []
      : await fetchExclusiveListings(
          listingType,
          borough,
          neighborhood,
          minPrice ? parseInt(minPrice, 10) : undefined,
          maxPrice ? parseInt(maxPrice, 10) : undefined,
          minBeds ? parseInt(minBeds, 10) : undefined,
        );
    if (unsupportedForExclusives.length > 0) {
      console.warn(
        `[/api/listings] IDX disabled: refusing local-exclusive results because ` +
          `${unsupportedForExclusives.join(', ')} cannot be evaluated on this path.`,
      );
    }

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
