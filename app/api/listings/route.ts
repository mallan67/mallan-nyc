import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';

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
    const minSqft = searchParams.get('minSqft');
    const maxSqft = searchParams.get('maxSqft');
    const sortParam = searchParams.get('sort');
    const skipParam = searchParams.get('skip');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : 0;

    // ═══════════════════════════════════════════════════════════
    // IDX PATH: Fetch from Trestle/REBNY RLS
    // ═══════════════════════════════════════════════════════════
    if (useIDX) {
      try {
        // Build OData $filter — push what we can to the server
        const filterParts: string[] = [];

        // Status filter — default to active statuses
        if (statusFilter) {
          // Validate against allowed RESO enum tokens
          const allowedStatuses = ['Active', 'ComingSoon', 'ActiveUnderContract'];
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

        if (minPrice) filterParts.push(`ListPrice ge ${parseInt(minPrice, 10)}`);
        if (maxPrice) filterParts.push(`ListPrice le ${parseInt(maxPrice, 10)}`);
        if (minBeds) filterParts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);
        if (minBaths) filterParts.push(`BathroomsFull ge ${parseInt(minBaths, 10)}`);
        if (minSqft) filterParts.push(`LivingArea ge ${parseInt(minSqft, 10)}`);
        if (maxSqft) filterParts.push(`LivingArea le ${parseInt(maxSqft, 10)}`);

        if (propertyTypeFilter) {
          // Map user-friendly names to Trestle fields
          // Condo/Co-op/Condop are CommonInterest, not PropertySubType
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
            // Try both fields for unknown values
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

        // Fetch more records to account for gate filtering + post-filters + pagination
        const fetchTop = Math.min(Math.max((limit + skip) * 3, 500), 500);

        // Skip $expand=Media for bulk queries — it's extremely slow (2+ min for 500 records).
        // Photos are batch-fetched separately below for just the page of results.
        const result = await fetchFromTrestle({
          filter: filterParts.join(' and '),
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

        // Step 2: Map to IDXListing
        const mapped = displayable
          .map((raw) => mapRESOToInternal(raw))
          .filter((l): l is NonNullable<typeof l> => l !== null);

        // Step 3: Post-fetch filters (can't push to OData)
        let filtered = mapped;

        if (borough) {
          const boroughLower = borough.toLowerCase();
          filtered = filtered.filter((l) => {
            const county = l.address.county.toLowerCase();
            const city = l.address.city.toLowerCase();
            // NYC borough → county mapping
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

        // propertyType filter already pushed to OData — no post-fetch filtering needed

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
            // Fetch first 8 media items per listing — enough to find a real photo even if floorplans are first
            const mediaFilter = `(${filterParts2.join(' or ')}) and Order le 7`;
            const mediaParams = new URLSearchParams();
            mediaParams.set('$filter', mediaFilter);
            mediaParams.set('$select', 'ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN');
            mediaParams.set('$orderby', 'ResourceRecordID asc,Order asc');
            mediaParams.set('$top', String(needsPhotos.length * 8));

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

              // Group by listing ID — separate photos from floorplans
              const photosByListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
              const floorplansByListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
              for (const m of mediaRecords) {
                const lid = String(m.ResourceRecordID || '');
                if (!lid || !m.MediaURL) continue;
                const mediaType = classifyMedia(m);
                const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
                const entry = {
                  url: String(m.MediaURL),
                  mediaType,
                  order: isPreferred ? -1 : Number(m.Order ?? 0), // Preferred photo sorts first
                };
                if (mediaType === 'FloorPlan') {
                  if (!floorplansByListing.has(lid)) floorplansByListing.set(lid, []);
                  floorplansByListing.get(lid)!.push(entry);
                } else {
                  if (!photosByListing.has(lid)) photosByListing.set(lid, []);
                  photosByListing.get(lid)!.push(entry);
                }
              }
              // Inject: photos first (preferred photo at top), then floorplans at the end
              for (const listing of needsPhotos) {
                const photos = photosByListing.get(listing.listingId) || [];
                const floorplans = floorplansByListing.get(listing.listingId) || [];
                const combined = [...photos.sort((a, b) => a.order - b.order), ...floorplans.sort((a, b) => a.order - b.order)];
                if (combined.length > 0) {
                  listing.media = combined as typeof listing.media;
                }
              }
            }
          } catch (mediaErr) {
            // Non-fatal — listings display without photos
            console.warn('[/api/listings] Photo batch fetch failed:', mediaErr instanceof Error ? mediaErr.message : mediaErr);
          }
        }

        const publicListings = pageListings.map(toPublicDTO);

        return NextResponse.json(
          {
            success: true,
            count: publicListings.length,
            total: totalCount,
            skip,
            limit,
            hasMore: skip + limit < totalCount || result.hasMore,
            listings: publicListings,
            _compliance: {
              source: 'idx',
              idxEnabled: true,
              attribution: generateAttributionText(),
              disclaimer:
                'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
              totalFetched: result.totalFetched,
              gateFiltered: result.records.length - displayable.length,
            },
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
          }
        );
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

    // IDX not enabled — return empty with clear indicator (no silent fallback to stale data)
    return NextResponse.json(
      {
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
