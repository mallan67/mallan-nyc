import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';
import prisma from '@/lib/prisma';
import { geocodeListings } from '@/lib/geo/geocode';
import { filterDisplayableDbListings, dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';

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
    const useIDX = process.env.IDX_ENABLED === 'true';

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
    const statusesParam = searchParams.get('statuses'); // comma-separated: Active,ComingSoon
    const minSqft = searchParams.get('minSqft');
    const maxSqft = searchParams.get('maxSqft');
    const sortParam = searchParams.get('sort');
    const skipParam = searchParams.get('skip');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : 0;
    // New filter params
    const commercial = searchParams.get('commercial') === 'true';
    const propertySubTypes = searchParams.get('propertySubTypes'); // comma-separated
    const ownershipTypes = searchParams.get('ownershipTypes'); // comma-separated
    const yearBuiltParam = searchParams.get('yearBuilt'); // 'pre-war' | 'post-war'
    const furnishedParam = searchParams.get('furnished') === 'true';
    const amenitiesParam = searchParams.get('amenities'); // comma-separated amenity keys
    const openHouseParam = searchParams.get('openHouse') === 'true';

    // ═══════════════════════════════════════════════════════════
    // IDX PATH: Fetch from Trestle/REBNY RLS
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

      try {
        // Build OData $filter — push what we can to the server
        const filterParts: string[] = [];

        // Status filter — default to active statuses
        const allowedStatuses = ['Active', 'ComingSoon', 'ActiveUnderContract'];
        if (statusesParam) {
          // Multi-status: comma-separated
          const requested = statusesParam.split(',').filter(s => allowedStatuses.includes(s));
          if (requested.length === 1) {
            filterParts.push(`StandardStatus eq '${requested[0]}'`);
          } else if (requested.length > 1) {
            filterParts.push(`(${requested.map(s => `StandardStatus eq '${s}'`).join(' or ')})`);
          } else {
            filterParts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
          }
        } else if (statusFilter) {
          if (allowedStatuses.includes(statusFilter)) {
            filterParts.push(`StandardStatus eq '${statusFilter}'`);
          } else {
            filterParts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
          }
        } else {
          filterParts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
        }

        if (listingType === 'sale' || listingType === 'buy') {
          filterParts.push("PropertyType ne 'ResidentialLease'");
        } else if (listingType === 'rent') {
          filterParts.push("PropertyType eq 'ResidentialLease'");
        }

        // Commercial filter — uses PropertySubType values under Residential PropertyType
        if (commercial) {
          const commercialSubTypes = ['Office', 'Retail', 'Industrial', 'Warehouse', 'MixedUse'];
          filterParts.push(`(${commercialSubTypes.map(t => `PropertySubType eq '${t}'`).join(' or ')})`);
        }

        if (minPrice) filterParts.push(`ListPrice ge ${parseInt(minPrice, 10)}`);
        if (maxPrice) filterParts.push(`ListPrice le ${parseInt(maxPrice, 10)}`);
        if (minBeds) filterParts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);
        if (minBaths) filterParts.push(`BathroomsFull ge ${parseInt(minBaths, 10)}`);
        if (minSqft) filterParts.push(`LivingArea ge ${parseInt(minSqft, 10)}`);
        if (maxSqft) filterParts.push(`LivingArea le ${parseInt(maxSqft, 10)}`);

        // Year Built: pre-war (<=1946) / post-war (>=1947)
        if (yearBuiltParam === 'pre-war') filterParts.push('YearBuilt le 1946');
        else if (yearBuiltParam === 'post-war') filterParts.push('YearBuilt ge 1947');

        // Furnished (rental)
        if (furnishedParam) filterParts.push("Furnished eq 'Furnished'");

        // Property sub-types (comma-separated)
        if (propertySubTypes) {
          const subTypeMap: Record<string, string> = {
            'Townhouse': 'SingleFamilyTownhouse',
            'Multi-Family': 'MultiFamily',
            'Single Family': 'SingleFamilyResidence',
            'Office': 'Office', 'Retail': 'Retail', 'Industrial': 'Industrial',
            'Warehouse': 'Warehouse', 'Mixed Use': 'MixedUse',
            'Hospitality': 'Hospitality', 'Healthcare': 'Healthcare', 'Parking': 'Parking',
          };
          const types = propertySubTypes.split(',').map(t => subTypeMap[t.trim()] || t.trim()).filter(Boolean);
          if (types.length > 0) {
            filterParts.push(`(${types.map(t => `PropertySubType eq '${t.replace(/'/g, "''")}'`).join(' or ')})`);
          }
        }

        // Ownership types (comma-separated: Condo, Co-op, Condop)
        if (ownershipTypes) {
          const ownerMap: Record<string, string> = {
            'Condo': 'Condominium', 'Co-op': 'StockCooperative', 'Condop': 'Condop',
          };
          const types = ownershipTypes.split(',').map(t => ownerMap[t.trim()]).filter(Boolean);
          if (types.length > 0) {
            filterParts.push(`(${types.map(t => `CommonInterest eq '${t}'`).join(' or ')})`);
          }
        }

        // Legacy single propertyType filter (backward compat)
        if (propertyTypeFilter && !propertySubTypes && !ownershipTypes) {
          const commonInterestMap: Record<string, string> = {
            'Condo': 'Condominium',
            'Co-op': 'StockCooperative',
            'Condop': 'Condop',
          };
          const propertySubTypeMap: Record<string, string> = {
            'Townhouse': 'SingleFamilyTownhouse',
            'Multi-Family': 'MultiFamily',
            'Single Family': 'SingleFamilyResidence',
          };
          const safe = propertyTypeFilter.replace(/'/g, "''");
          if (commonInterestMap[safe]) {
            filterParts.push(`CommonInterest eq '${commonInterestMap[safe]}'`);
          } else if (propertySubTypeMap[safe]) {
            filterParts.push(`PropertySubType eq '${propertySubTypeMap[safe]}'`);
          } else {
            filterParts.push(`(PropertySubType eq '${safe}' or CommonInterest eq '${safe}')`);
          }
        }

        // Build OData $orderby for sort
        let orderby: string | undefined;
        switch (sortParam) {
          case 'price-asc': orderby = 'ListPrice asc'; break;
          case 'price-desc': orderby = 'ListPrice desc'; break;
          case 'sqft-desc': orderby = 'LivingArea desc'; break;
          case 'newest': default: orderby = 'ModificationTimestamp desc'; break;
        }

        // Fetch extra to account for gate filtering + post-filters, but not wildly more than needed
        const fetchTop = Math.min((limit + skip) * 2 + 20, 500);

        // Skip $expand=Media for bulk queries — it's extremely slow (2+ min for 500 records).
        // Photos are batch-fetched separately below for just the page of results.
        // When amenity filters are active, add the required fields to $select
        const amenityFields = amenitiesParam ? [
          'BuildingFeatures', 'InteriorFeatures', 'ExteriorFeatures',
          'Appliances', 'Cooling', 'View', 'ParkingFeatures', 'LaundryFeatures',
          'GarageYN',
        ] : [];
        const selectFields = [...CARD_SELECT_FIELDS, ...amenityFields.filter(f => !CARD_SELECT_FIELDS.includes(f))];

        const result = await fetchFromTrestle({
          filter: filterParts.join(' and '),
          select: selectFields,
          top: fetchTop,
          maxTotal: fetchTop,
          orderby,
          count: true,
          expandMedia: false,
        });

        // Step 1: Distribution gates on RAW Trestle data (Option A)
        // This runs checkDistributionGates() BEFORE mapping — works directly on
        // raw OData field names. No type mismatch with Listing type.
        const displayable = result.records.filter(
          (raw) => checkDistributionGates(raw).displayable
        );

        // Step 1b: Amenity filters on RAW Trestle data (before mapping)
        // Uses PascalCase field names directly from Trestle response.
        // Multi-value picklist fields contain comma-separated values (e.g. "Elevators,IndoorPool")
        let amenityFiltered = displayable;
        if (amenitiesParam) {
          const { AMENITY_FIELD_MAP } = await import('@/lib/search/types');
          const requestedAmenities = amenitiesParam.split(',').filter(
            (a): a is import('@/lib/search/types').AmenityFilter => a in AMENITY_FIELD_MAP
          );
          for (const amenityKey of requestedAmenities) {
            const mapping = AMENITY_FIELD_MAP[amenityKey];
            const fields = mapping.field.split(',');
            const matchValues = mapping.values.map(v => v.toLowerCase());

            if (amenityKey === 'pet-friendly') {
              amenityFiltered = amenityFiltered.filter((raw) => {
                const val = String(raw.PetsAllowed || '').toLowerCase();
                if (!val) return false;
                return !val.includes('no') || val.includes('catsok') || val.includes('dogsok');
              });
            } else {
              amenityFiltered = amenityFiltered.filter((raw) => {
                return fields.some(fieldName => {
                  const val = String(raw[fieldName] || '').toLowerCase();
                  return matchValues.some(mv => val.includes(mv));
                });
              });
            }
          }
        }

        // Step 2: Map to IDXListing
        const mapped = amenityFiltered
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

        if (neighborhood) {
          const neighborhoodLower = neighborhood.toLowerCase();
          filtered = filtered.filter(
            (l) => l.address.cityRegion?.toLowerCase() === neighborhoodLower
          );
        }

        // Open House filter — requires separate Trestle OpenHouse resource query
        if (openHouseParam) {
          try {
            const ohToken = await getAccessToken();
            const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
            const today = new Date().toISOString().split('T')[0];
            const ohParams = new URLSearchParams();
            ohParams.set('$select', 'ListingKey');
            ohParams.set('$filter', `OpenHouseDate ge ${today} and OpenHouseStatus eq 'Active'`);
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

        // Step 4: Apply skip + limit and convert to public DTO
        // Use OData count for true total when available; fall back to filtered.length
        const totalCount = result.odataCount ?? filtered.length;
        const pageListings = filtered.slice(skip, skip + limit);

        // Step 4b: Batch-fetch primary photos for the page (much faster than $expand=Media on 500 records)
        // Only fetch for listings that don't already have media (from $expand fallback)
        const needsPhotos = pageListings.filter(l => l.media.length === 0);
        if (needsPhotos.length > 0) {
          try {
            const token = await getAccessToken();
            const TRESTLE_API = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
            const listingIds = needsPhotos.map(l => l.listingId);
            const filterParts2 = listingIds.map(id => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`);
            // Fetch all media types — photos (up to 3), plus all floor plans, videos, virtual tours
            const mediaFilter = `(${filterParts2.join(' or ')}) and (Order le 3 or MediaCategory ne 'Photo')`;
            const mediaParams = new URLSearchParams();
            mediaParams.set('$filter', mediaFilter);
            mediaParams.set('$select', 'ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN');
            mediaParams.set('$orderby', 'ResourceRecordID asc,Order asc');
            mediaParams.set('$top', String(Math.min(needsPhotos.length * 4, 250)));

            const mediaResponse = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });

            if (mediaResponse.ok) {
              const mediaData = await mediaResponse.json();
              const mediaRecords = mediaData.value || [];

              // RESO DD: MediaCategory = content type (Photo, Floor Plan, Video, etc.)
              //          MediaType = file format (jpeg, png, gif, etc.)
              // Use MediaCategory to distinguish photos from floorplans.
              // PreferredPhotoYN marks the listing's primary/hero photo.
              function classifyMedia(m: Record<string, unknown>): 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' {
                const cat = String(m.MediaCategory || '').toLowerCase();
                if (cat.includes('floor plan')) return 'FloorPlan';
                if (cat.includes('video')) return 'Video';
                if (cat.includes('virtual tour')) return 'VirtualTour';
                if (cat === 'photo' || cat === '') return 'Photo'; // Default to photo
                // Fallback: check ShortDescription
                const desc = String(m.ShortDescription || '').toLowerCase();
                if (desc.includes('floor plan') || desc.includes('floorplan')) return 'FloorPlan';
                return 'Photo';
              }

              // Group by listing ID — separate by media type
              const mediaByListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
              for (const m of mediaRecords) {
                const lid = String(m.ResourceRecordID || '');
                if (!lid || !m.MediaURL) continue;
                const mediaType = classifyMedia(m);
                const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
                const entry = {
                  url: String(m.MediaURL),
                  mediaType,
                  order: isPreferred ? -1 : Number(m.Order ?? 0),
                };
                if (!mediaByListing.has(lid)) mediaByListing.set(lid, []);
                mediaByListing.get(lid)!.push(entry);
              }
              // Inject: photos first (preferred at top), then videos/tours, then floor plans
              const typeRank = (t: string) => t === 'Photo' ? 0 : t === 'FloorPlan' ? 2 : 1;
              for (const listing of needsPhotos) {
                const media = mediaByListing.get(listing.listingId) || [];
                if (media.length > 0) {
                  listing.media = media.sort((a, b) => {
                    const rankDiff = typeRank(a.mediaType) - typeRank(b.mediaType);
                    return rankDiff !== 0 ? rankDiff : a.order - b.order;
                  }) as typeof listing.media;
                }
              }
            }
          } catch (mediaErr) {
            // Non-fatal — listings display without photos
            console.warn('[/api/listings] Photo batch fetch failed:', mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }

        // Step 4c: Geocode listings that lack coordinates (Trestle IDX Plus returns null for Lat/Lng)
        await geocodeListings(pageListings);

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

        const responseBody = {
          success: true,
          count: mergedListings.length,
          total: totalCount + mergedListings.length - publicListings.length,
          skip,
          limit,
          hasMore: skip + limit < totalCount || result.hasMore,
          listings: mergedListings,
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
        listings: exclusiveListings,
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
      // Only Active statuses — Draft/Incomplete NEVER shown publicly
      status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] },
      // Distribution gates
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
    };

    if (listingType === 'sale' || listingType === 'buy') where.listing_type = 'sale';
    else if (listingType === 'rent') where.listing_type = 'rent';

    if (minPrice || maxPrice) {
      where.list_price = {};
      if (minPrice) (where.list_price as Prisma.DecimalFilter).gte = minPrice;
      if (maxPrice) (where.list_price as Prisma.DecimalFilter).lte = maxPrice;
    }

    if (minBeds) where.bedrooms_total = { gte: minBeds };

    if (borough) {
      where.borough = { contains: borough, mode: 'insensitive' };
    }

    if (neighborhood) {
      where.neighborhood = { equals: neighborhood, mode: 'insensitive' };
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
      },
    });

    // Serialize BigInt + Decimal for the mapper
    const serialized: DbListing[] = dbListings.map((l) => ({
      ...l,
      id: l.id.toString(),
      list_price: l.list_price.toString(),
      living_area: l.living_area?.toString() ?? null,
    }));

    const displayable = filterDisplayableDbListings(serialized);
    return displayable.map(dbListingToPublicDTO);
  } catch (err) {
    console.warn('[/api/listings] Exclusive listings fetch failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Merge local exclusive listings with Trestle IDX results.
 * Deduplicates by listing_id — if a listing exists in both Trestle and local DB,
 * the Trestle version takes precedence (it has more complete data from RLS).
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
