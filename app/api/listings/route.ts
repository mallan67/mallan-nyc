import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';
import { isDisplayableInIDX, sanitizeForPublicDisplay } from '@/lib/compliance/idx-display-gate';
import { fetchFromTrestle } from '@/lib/idx/fetch';
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
 * When IDX_ENABLED=false (or Trestle fails): falls back to data/listings.json.
 *
 * Query parameters:
 * - type: 'sale' | 'rent' | 'buy' - Filter by listing type
 * - neighborhood: string - Filter by neighborhood (CityRegion)
 * - borough: string - Filter by borough
 * - minPrice: number - Minimum price
 * - maxPrice: number - Maximum price
 * - beds: number - Minimum number of bedrooms
 * - propertyType: string - Property sub-type (Condo, Co-op, etc.)
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
    const propertyTypeFilter = searchParams.get('propertyType');
    const petsOnly = searchParams.get('pets') === 'true';
    const featuredOnly = searchParams.get('featured') === 'true';
    const exclusiveOnly = searchParams.get('exclusive') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // ═══════════════════════════════════════════════════════════
    // IDX PATH: Fetch from Trestle/REBNY RLS
    // ═══════════════════════════════════════════════════════════
    if (useIDX) {
      try {
        // Build OData $filter — push what we can to the server
        const filterParts: string[] = [
          "(MlsStatus eq 'Active' or MlsStatus eq 'Coming Soon' or MlsStatus eq 'Active Under Contract')",
        ];

        if (listingType === 'sale' || listingType === 'buy') {
          filterParts.push("PropertyType ne 'ResidentialLease'");
        } else if (listingType === 'rent') {
          filterParts.push("PropertyType eq 'ResidentialLease'");
        }

        if (minPrice) filterParts.push(`ListPrice ge ${parseInt(minPrice, 10)}`);
        if (maxPrice) filterParts.push(`ListPrice le ${parseInt(maxPrice, 10)}`);
        if (minBeds) filterParts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);

        // Fetch extra records to account for gate filtering
        const fetchTop = Math.min(limit * 2, 200);

        const result = await fetchFromTrestle({
          filter: filterParts.join(' and '),
          top: fetchTop,
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

        if (propertyTypeFilter) {
          const ptLower = propertyTypeFilter.toLowerCase();
          filtered = filtered.filter(
            (l) =>
              l.propertyType.toLowerCase() === ptLower ||
              (l.propertySubType && l.propertySubType.toLowerCase() === ptLower)
          );
        }

        // Step 4: Apply limit and convert to public DTO
        const publicListings = filtered.slice(0, limit).map(toPublicDTO);

        return NextResponse.json(
          {
            success: true,
            count: publicListings.length,
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
              'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
          }
        );
      } catch (idxError) {
        // IDX fetch failed — fall through to local data for resilience
        console.error('[/api/listings] IDX fetch failed, falling back to local data:', idxError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LOCAL PATH: Serve from data/listings.json (fallback)
    // ═══════════════════════════════════════════════════════════
    let listings = listingsData.listings as unknown as Listing[];

    // Apply filters — REBNY RLS: Enforce all 6 distribution gates
    listings = listings.filter((listing) => {
      // Centralized IDX display gate (all 6 REBNY distribution gates)
      if (!isDisplayableInIDX(listing)) return false;

      // Type filter
      if (listingType) {
        const typeMap: Record<string, string> = { sale: 'sale', rent: 'rent', buy: 'sale' };
        if (listing.listingType !== typeMap[listingType]) return false;
      }

      // Borough filter
      if (borough && listing.address.borough !== borough) return false;

      // Neighborhood filter
      if (neighborhood && listing.address.neighborhood !== neighborhood) return false;

      // Price filter (using REBNY-compliant nested structure)
      if (minPrice && listing.price.listPrice < parseInt(minPrice, 10)) return false;
      if (maxPrice && listing.price.listPrice > parseInt(maxPrice, 10)) return false;

      // Beds filter
      if (minBeds && listing.propertyInfo.bedroomsTotal < parseInt(minBeds, 10)) return false;

      // Property type filter
      if (propertyTypeFilter && listing.propertyInfo.propertyType !== propertyTypeFilter) return false;

      // Pets filter
      if (petsOnly && !listing.features.pets.allowed) return false;

      // Featured filter
      if (featuredOnly && !listing.flags.isFeatured) return false;

      // Exclusive filter
      if (exclusiveOnly && !listing.flags.isExclusive) return false;

      return true;
    });

    // Sort: featured first, then exclusives, then by date
    listings.sort((a, b) => {
      if (a.flags.isFeatured !== b.flags.isFeatured) return b.flags.isFeatured ? 1 : -1;
      if (a.flags.isExclusive !== b.flags.isExclusive) return b.flags.isExclusive ? 1 : -1;
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    });

    // Apply limit
    listings = listings.slice(0, limit);

    // REBNY COMPLIANCE: Sanitize listings for public display — strip private data
    const sanitizedListings = listings.map(sanitizeForPublicDisplay);

    return NextResponse.json(
      {
        success: true,
        count: sanitizedListings.length,
        listings: sanitizedListings,
        _compliance: {
          source: 'exclusive',
          idxEnabled: useIDX,
          disclaimer: 'Information deemed reliable but not guaranteed.',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
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
