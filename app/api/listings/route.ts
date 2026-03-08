import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { filterDisplayableDbListings, dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { generateAttributionText } from '@/lib/idx/mapping';
import type { PublicListingDTO } from '@/lib/idx/public-dto';
import type { Prisma } from '@prisma/client';

// ── In-memory cache ──
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

// ── Rate limiter ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
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

// ── DB select shape (matches what dbListingToPublicDTO needs) ──
const DB_LISTING_SELECT = {
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
  media: true,
  agent_info: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: true,
  participant_only: true,
  listing_contract_date: true,
  modification_timestamp: true,
  created_at: true,
  updated_at: true,
} as const;

function serializeDbListing(l: { id: bigint; list_price: Prisma.Decimal; living_area: Prisma.Decimal | null; [key: string]: unknown }): DbListing {
  return {
    ...l,
    id: l.id.toString(),
    list_price: l.list_price.toString(),
    living_area: l.living_area?.toString() ?? null,
  } as DbListing;
}

/**
 * GET /api/listings
 *
 * DB-FIRST ARCHITECTURE:
 *   Queries pre-synced Postgres listings (synced every 4h from Trestle via cron).
 *   Photos, coordinates, and all data are already stored in the DB.
 *   Response time: ~20-80ms (vs 2-6s hitting Trestle live).
 *
 * Fallback: If DB has no synced listings, falls back to live Trestle query.
 *
 * COMPLIANCE PIPELINE:
 *   DB records already passed distribution gates during sync.
 *   filterDisplayableDbListings() re-checks gates at display time.
 *   dbListingToPublicDTO() strips private data, suppresses addresses.
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    // Cache key from all query params
    const cacheKey = `db-listings:${searchParams.toString()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      });
    }

    // Parse query params
    const listingType = searchParams.get('type');
    const neighborhood = searchParams.get('neighborhood');
    const borough = searchParams.get('borough');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const minBeds = searchParams.get('beds');
    const minBaths = searchParams.get('minBaths');
    const propertyTypeFilter = searchParams.get('propertyType');
    const statusFilter = searchParams.get('status');
    const statusesParam = searchParams.get('statuses');
    const minSqft = searchParams.get('minSqft');
    const maxSqft = searchParams.get('maxSqft');
    const sortParam = searchParams.get('sort');
    const skipParam = searchParams.get('skip');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : 0;
    const commercial = searchParams.get('commercial') === 'true';
    const propertySubTypes = searchParams.get('propertySubTypes');
    const ownershipTypes = searchParams.get('ownershipTypes');

    // ═══════════════════════════════════════════════════════════
    // DB-FIRST: Query pre-synced Postgres listings
    // ═══════════════════════════════════════════════════════════

    // Check if DB has synced listings
    const syncedCount = await prisma.listing.count({
      where: { sync_status: 'synced', status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] } },
    });

    if (syncedCount > 0) {
      // Build Prisma where clause
      const where: Prisma.ListingWhereInput = {
        // Distribution gates
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
      };

      // Status filter
      const allowedStatuses = ['Active', 'ComingSoon', 'ActiveUnderContract'];
      if (statusesParam) {
        const requested = statusesParam.split(',').filter(s => allowedStatuses.includes(s));
        where.status = { in: requested.length > 0 ? requested : allowedStatuses };
      } else if (statusFilter && allowedStatuses.includes(statusFilter)) {
        where.status = statusFilter;
      } else {
        where.status = { in: allowedStatuses };
      }

      // Listing type
      if (listingType === 'sale' || listingType === 'buy') {
        where.listing_type = 'sale';
      } else if (listingType === 'rent') {
        where.listing_type = 'rent';
      }

      // Commercial filter
      if (commercial) {
        where.property_sub_type = { in: ['Office', 'Retail', 'Industrial', 'Warehouse', 'MixedUse'] };
      }

      // Price
      if (minPrice || maxPrice) {
        where.list_price = {};
        if (minPrice) (where.list_price as Prisma.DecimalFilter).gte = parseInt(minPrice, 10);
        if (maxPrice) (where.list_price as Prisma.DecimalFilter).lte = parseInt(maxPrice, 10);
      }

      // Beds & baths
      if (minBeds) where.bedrooms_total = { gte: parseInt(minBeds, 10) };
      if (minBaths) where.bathrooms_full = { gte: parseInt(minBaths, 10) };

      // Sqft
      if (minSqft || maxSqft) {
        where.living_area = {};
        if (minSqft) (where.living_area as Prisma.DecimalNullableFilter).gte = parseInt(minSqft, 10);
        if (maxSqft) (where.living_area as Prisma.DecimalNullableFilter).lte = parseInt(maxSqft, 10);
      }

      // Borough
      if (borough) {
        where.borough = { contains: borough, mode: 'insensitive' };
      }

      // Neighborhood
      if (neighborhood) {
        where.neighborhood = { equals: neighborhood, mode: 'insensitive' };
      }

      // Property sub-types
      if (propertySubTypes) {
        const subTypeMap: Record<string, string> = {
          'Townhouse': 'SingleFamilyTownhouse', 'Multi-Family': 'MultiFamily',
          'Single Family': 'SingleFamilyResidence',
        };
        const types = propertySubTypes.split(',').map(t => subTypeMap[t.trim()] || t.trim()).filter(Boolean);
        if (types.length > 0) {
          where.property_sub_type = { in: types };
        }
      }

      // Legacy single propertyType filter
      if (propertyTypeFilter && !propertySubTypes && !ownershipTypes) {
        const ptMap: Record<string, Prisma.ListingWhereInput> = {
          'Condo': { property_type: 'Condominium' },
          'Co-op': { property_type: 'StockCooperative' },
          'Condop': { property_type: 'Condop' },
          'Townhouse': { property_sub_type: 'SingleFamilyTownhouse' },
          'Multi-Family': { property_sub_type: 'MultiFamily' },
        };
        const ptWhere = ptMap[propertyTypeFilter];
        if (ptWhere) Object.assign(where, ptWhere);
      }

      // Sort
      let orderBy: Prisma.ListingOrderByWithRelationInput;
      switch (sortParam) {
        case 'price-asc': orderBy = { list_price: 'asc' }; break;
        case 'price-desc': orderBy = { list_price: 'desc' }; break;
        case 'sqft-desc': orderBy = { living_area: 'desc' }; break;
        case 'newest': default: orderBy = { modification_timestamp: 'desc' }; break;
      }

      // Query DB
      const [dbListings, totalCount] = await Promise.all([
        prisma.listing.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: DB_LISTING_SELECT,
        }),
        prisma.listing.count({ where }),
      ]);

      // Serialize and convert to public DTO
      const serialized = dbListings.map(l => serializeDbListing(l as unknown as Parameters<typeof serializeDbListing>[0]));
      const displayable = filterDisplayableDbListings(serialized);
      const publicListings = displayable.map(dbListingToPublicDTO);

      // Proxy Trestle media URLs
      const proxyUrl = (url: string) => {
        try {
          const parsed = new URL(url);
          if (parsed.hostname === 'api.cotality.com') {
            return `/api/media/proxy?url=${encodeURIComponent(url)}`;
          }
        } catch { /* not a URL */ }
        return url;
      };
      for (const listing of publicListings) {
        listing.media = listing.media.map(m => ({ ...m, url: proxyUrl(m.url) }));
      }

      const responseBody = {
        success: true,
        count: publicListings.length,
        total: totalCount,
        skip,
        limit,
        hasMore: skip + limit < totalCount,
        listings: publicListings,
        _compliance: {
          source: 'db+idx',
          idxEnabled: true,
          attribution: generateAttributionText(),
          disclaimer:
            'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
        },
      };

      setCache(cacheKey, responseBody);

      return NextResponse.json(responseBody, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK: No synced listings in DB — query Trestle live
    // (Same as before, only triggered when DB is empty)
    // ═══════════════════════════════════════════════════════════
    const useIDX = process.env.IDX_ENABLED === 'true';
    if (useIDX) {
      return await trestleLiveFallback(request, searchParams, limit, skip);
    }

    // IDX not enabled — return empty
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
        idxEnabled: false,
        disclaimer: 'IDX search is not enabled. Contact administrator.',
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error) {
    console.error('Error fetching listings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

/**
 * Trestle live fallback — only used when DB has no synced listings.
 * This is the original code path, kept as-is for bootstrap/recovery scenarios.
 */
async function trestleLiveFallback(
  request: Request,
  searchParams: URLSearchParams,
  limit: number,
  skip: number,
) {
  const { fetchFromTrestle } = await import('@/lib/idx/fetch');
  const { getAccessToken } = await import('@/lib/idx/auth');
  const { checkDistributionGates } = await import('@/lib/idx/trestle-mapper');
  const { mapRESOToInternal } = await import('@/lib/idx/mapping');
  const { toPublicDTO } = await import('@/lib/idx/public-dto');
  const { CARD_SELECT_FIELDS } = await import('@/lib/idx/card-fields');
  const { geocodeListings } = await import('@/lib/geo/geocode');

  const listingType = searchParams.get('type');
  const borough = searchParams.get('borough');
  const neighborhood = searchParams.get('neighborhood');
  const sortParam = searchParams.get('sort');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const minBeds = searchParams.get('beds');
  const minBaths = searchParams.get('minBaths');

  try {
    const filterParts: string[] = [];
    filterParts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
    if (listingType === 'sale' || listingType === 'buy') filterParts.push("PropertyType ne 'ResidentialLease'");
    else if (listingType === 'rent') filterParts.push("PropertyType eq 'ResidentialLease'");
    if (minPrice) filterParts.push(`ListPrice ge ${parseInt(minPrice, 10)}`);
    if (maxPrice) filterParts.push(`ListPrice le ${parseInt(maxPrice, 10)}`);
    if (minBeds) filterParts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);
    if (minBaths) filterParts.push(`BathroomsFull ge ${parseInt(minBaths, 10)}`);
    if (borough) {
      const boroughMap: Record<string, string> = {
        'manhattan': 'New York', 'brooklyn': 'Kings', 'queens': 'Queens',
        'bronx': 'Bronx', 'staten island': 'Richmond',
      };
      const countyValue = boroughMap[borough.toLowerCase()] || borough;
      filterParts.push(`CountyOrParish eq '${countyValue.replace(/'/g, "''")}'`);
    }

    let orderby: string;
    switch (sortParam) {
      case 'price-asc': orderby = 'ListPrice asc'; break;
      case 'price-desc': orderby = 'ListPrice desc'; break;
      case 'sqft-desc': orderby = 'LivingArea desc'; break;
      default: orderby = 'ModificationTimestamp desc'; break;
    }

    const fetchTop = Math.min((limit + skip) * 2 + 20, 500);
    const result = await fetchFromTrestle({
      filter: filterParts.join(' and '),
      select: CARD_SELECT_FIELDS,
      top: fetchTop,
      maxTotal: fetchTop,
      orderby,
      count: true,
      expandMedia: false,
    });

    const displayable = result.records.filter(raw => checkDistributionGates(raw).displayable);
    let mapped = displayable.map(raw => mapRESOToInternal(raw)).filter((l): l is NonNullable<typeof l> => l !== null);

    if (neighborhood) {
      const nLow = neighborhood.toLowerCase();
      mapped = mapped.filter(l => l.address.cityRegion?.toLowerCase() === nLow);
    }

    const totalCount = result.odataCount ?? mapped.length;
    const pageListings = mapped.slice(skip, skip + limit);

    // Batch-fetch photos + geocode in parallel
    const needsPhotos = pageListings.filter(l => l.media.length === 0);
    const photoPromise = needsPhotos.length > 0 ? (async () => {
      try {
        const token = await getAccessToken();
        const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
        const ids = needsPhotos.map(l => l.listingId);
        const idFilter = ids.map(id => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`).join(' or ');
        const mediaParams = new URLSearchParams();
        mediaParams.set('$filter', `(${idFilter}) and Order le 3`);
        mediaParams.set('$select', 'ResourceRecordID,MediaURL,Order,PreferredPhotoYN');
        mediaParams.set('$orderby', 'ResourceRecordID asc,Order asc');
        mediaParams.set('$top', String(needsPhotos.length * 3));
        const res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const byListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
          for (const m of (data.value || [])) {
            const lid = String(m.ResourceRecordID || '');
            if (!lid || !m.MediaURL) continue;
            if (!byListing.has(lid)) byListing.set(lid, []);
            const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
            byListing.get(lid)!.push({ url: String(m.MediaURL), mediaType: 'Photo', order: isPreferred ? -1 : Number(m.Order ?? 0) });
          }
          for (const listing of needsPhotos) {
            const media = byListing.get(listing.listingId);
            if (media?.length) listing.media = media.sort((a, b) => a.order - b.order) as typeof listing.media;
          }
        }
      } catch { /* non-fatal */ }
    })() : Promise.resolve();

    const geocodePromise = geocodeListings(pageListings).catch(() => {});
    await Promise.allSettled([photoPromise, geocodePromise]);

    const publicListings = pageListings.map(toPublicDTO);

    return NextResponse.json({
      success: true,
      count: publicListings.length,
      total: totalCount,
      skip, limit,
      hasMore: skip + limit < totalCount || result.hasMore,
      listings: publicListings,
      _compliance: {
        source: 'idx-live',
        idxEnabled: true,
        attribution: generateAttributionText(),
        disclaimer: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
      },
    }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/listings] Trestle live fallback failed:', message);
    return NextResponse.json(
      { success: false, error: 'Unable to load listings. Please try again later.', count: 0, total: 0, listings: [] },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
