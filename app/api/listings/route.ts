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
import { logTrestleAccess } from '@/lib/audit/trestle-logger';

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
    const addressParam = searchParams.get('address'); // free-text street name search

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
      // Only use DB path if we have synced listings (check count first).
      // This is ~20-80ms vs 2-8s for live Trestle.
      try {
        const syncedCount = await prisma.listing.count({
          where: {
            sync_status: 'synced',
            status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] },
          },
        });

        if (syncedCount > 0) {
          // Two display paths: RLS listings (must pass 6 distribution gates) OR
          // website-only listings (commercial, rls_eligible=false — bypass gates)
          const dbWhere: Prisma.ListingWhereInput = {
            status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] },
            OR: [
              // Path 1: RLS-eligible listings — must pass all distribution gates
              {
                rls_eligible: true,
                idx_display_yn: true,
                internet_entire_listing_display_yn: true,
                owner_opt_out: false,
                participant_only: false,
              },
              // Path 2: Website-only listings (commercial) — no RLS gates
              {
                rls_eligible: false,
              },
            ],
          };

          // Type filter
          if (listingType === 'sale') {
            dbWhere.listing_type = 'sale';
          } else if (listingType === 'rent') {
            dbWhere.listing_type = 'rent';
          }

          // Commercial filter — restrict to commercial property types
          if (commercial) {
            dbWhere.AND = [
              {
                OR: [
                  { property_sub_type: { in: ['Commercial', 'Office', 'Retail', 'Industrial', 'MixedUse', 'MultiFamily'] } },
                  { commercial_sub_type: { not: null } },
                ],
              },
            ];
          }

          // Price range
          if (minPrice) dbWhere.list_price = { ...(dbWhere.list_price as object || {}), gte: parseInt(minPrice, 10) };
          if (maxPrice) dbWhere.list_price = { ...(dbWhere.list_price as object || {}), lte: parseInt(maxPrice, 10) };

          // Beds/Baths — Studio (beds=0) needs exact match, not gte
          if (minBeds !== null && minBeds !== undefined) {
            const bedsVal = parseInt(minBeds, 10);
            dbWhere.bedrooms_total = bedsVal === 0 ? { equals: 0 } : { gte: bedsVal };
          }
          if (minBaths) dbWhere.bathrooms_full = { gte: parseInt(minBaths, 10) };

          // Sqft
          if (minSqft) dbWhere.living_area = { ...(dbWhere.living_area as object || {}), gte: parseInt(minSqft, 10) };
          if (maxSqft) dbWhere.living_area = { ...(dbWhere.living_area as object || {}), lte: parseInt(maxSqft, 10) };

          // Borough
          if (borough) {
            dbWhere.borough = { contains: borough, mode: 'insensitive' };
          }

          // Neighborhood
          if (neighborhood) {
            dbWhere.neighborhood = { equals: neighborhood, mode: 'insensitive' };
          }

          // ZIP codes
          const zipCodes = searchParams.get('zipCodes');
          if (zipCodes) {
            const zips = zipCodes.split(',').map(z => z.trim()).filter(Boolean);
            if (zips.length > 0) {
              dbWhere.postal_code = { in: zips };
            }
          }

          // Statuses
          if (statusesParam) {
            const allowedStatuses = ['Active', 'ComingSoon', 'ActiveUnderContract'];
            const requested = statusesParam.split(',').filter(s => allowedStatuses.includes(s));
            if (requested.length > 0) {
              dbWhere.status = { in: requested };
            }
          }

          // Property sub-types
          if (propertySubTypes) {
            const subTypeMap: Record<string, string> = {
              'Condo': 'Condo', 'Co-op': 'StockCooperative', 'Condop': 'Condop',
              'Townhouse': 'SingleFamilyTownhouse', 'Multi-Family': 'MultiFamily',
            };
            const types = propertySubTypes.split(',').map(t => subTypeMap[t.trim()] || t.trim()).filter(Boolean);
            if (types.length > 0) {
              dbWhere.property_sub_type = { in: types };
            }
          }

          // Sort order
          let dbOrderBy: Prisma.ListingOrderByWithRelationInput = { modification_timestamp: 'desc' };
          switch (sortParam) {
            case 'price-asc': dbOrderBy = { list_price: 'asc' }; break;
            case 'price-desc': dbOrderBy = { list_price: 'desc' }; break;
            case 'newest': dbOrderBy = { modification_timestamp: 'desc' }; break;
            case 'sqft-desc': dbOrderBy = { living_area: 'desc' }; break;
            case 'beds-desc': dbOrderBy = { bedrooms_total: 'desc' }; break;
          }

          const [dbListings, dbTotal] = await Promise.all([
            prisma.listing.findMany({
              where: dbWhere,
              orderBy: dbOrderBy,
              skip,
              take: limit,
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
            }),
            prisma.listing.count({ where: dbWhere }),
          ]);

          if (dbListings.length > 0) {
            const serialized: DbListing[] = dbListings.map((l) => ({
              ...l,
              id: l.id.toString(),
              list_price: l.list_price.toString(),
              living_area: l.living_area?.toString() ?? null,
            }));

            const displayable = filterDisplayableDbListings(serialized);
            let publicListings = displayable.map(dbListingToPublicDTO);

            // Post-filter for fields stored in features JSON (not DB columns)
            // ownershipTypes → CommonInterest in features
            if (ownershipTypes) {
              const ownerMap: Record<string, string> = {
                'Condo': 'Condominium', 'Co-op': 'StockCooperative', 'Condop': 'Condop',
              };
              const types = ownershipTypes.split(',').map(t => ownerMap[t.trim()] || t.trim()).filter(Boolean);
              if (types.length > 0) {
                publicListings = publicListings.filter(l => {
                  // propertyType on DTO is mapped from CommonInterest
                  const pt = l.propertyType?.toLowerCase() || '';
                  return types.some(t => {
                    if (t === 'Condominium') return pt.includes('condo') && !pt.includes('condop');
                    if (t === 'StockCooperative') return pt.includes('co-op');
                    if (t === 'Condop') return pt.includes('condop');
                    return false;
                  });
                });
              }
            }

            // yearBuilt filter
            if (yearBuiltParam === 'pre-war') {
              publicListings = publicListings.filter(l => l.yearBuilt != null && l.yearBuilt <= 1946);
            } else if (yearBuiltParam === 'post-war') {
              publicListings = publicListings.filter(l => l.yearBuilt != null && l.yearBuilt >= 1947);
            }

            // Furnished filter
            if (furnishedParam) {
              publicListings = publicListings.filter(l =>
                l.furnished?.toLowerCase() === 'furnished'
              );
            }

            // Address/text search (contains on street name)
            if (addressParam) {
              const addrLower = addressParam.trim().toLowerCase();
              if (addrLower) {
                publicListings = publicListings.filter(l => {
                  const street = `${l.address.streetNumber || ''} ${l.address.streetName || ''}`.toLowerCase();
                  return street.includes(addrLower);
                });
              }
            }

            const responseBody = {
              success: true,
              count: publicListings.length,
              total: dbTotal,
              skip,
              limit,
              hasMore: skip + limit < dbTotal,
              listings: publicListings,
              _compliance: {
                source: 'db+exclusive',
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
        }
      } catch (dbErr) {
        // DB query failed — fall through to live Trestle
        console.warn('[/api/listings] DB-first query failed, falling back to Trestle:', dbErr instanceof Error ? dbErr.message : dbErr);
      }

      // ═══════════════════════════════════════════════════════════
      // TRESTLE FALLBACK: Live Trestle API (when DB has no synced data)
      // ═══════════════════════════════════════════════════════════
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
        if (minBeds !== null && minBeds !== undefined) {
          const bedsVal = parseInt(minBeds, 10);
          filterParts.push(bedsVal === 0 ? `BedroomsTotal eq 0` : `BedroomsTotal ge ${bedsVal}`);
        }
        if (minBaths) filterParts.push(`BathroomsFull ge ${parseInt(minBaths, 10)}`);
        if (minSqft) filterParts.push(`LivingArea ge ${parseInt(minSqft, 10)}`);
        if (maxSqft) filterParts.push(`LivingArea le ${parseInt(maxSqft, 10)}`);

        // Year Built: pre-war (<=1946) / post-war (>=1947)
        if (yearBuiltParam === 'pre-war') filterParts.push('YearBuilt le 1946');
        else if (yearBuiltParam === 'post-war') filterParts.push('YearBuilt ge 1947');

        // Furnished (rental)
        if (furnishedParam) filterParts.push("Furnished eq 'Furnished'");

        // Address/text search — OData contains() on StreetName
        if (addressParam) {
          const safeAddr = addressParam.trim().replace(/'/g, "''");
          if (safeAddr) {
            filterParts.push(`contains(StreetName,'${safeAddr}')`);
          }
        }

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

        // Neighborhood filtering strategy:
        // Trestle IDX Plus does NOT expose Latitude/Longitude for OData filtering.
        // Step 1: Use ZIP codes to narrow the Trestle query (server-side push).
        // Step 2: Post-filter results by lat/lng bounding box for precision.
        const boundsParam = searchParams.get('bounds'); // "south,west,north,east"
        const zipCodes = searchParams.get('zipCodes');

        // Push ZIP filter to Trestle OData
        if (zipCodes) {
          const zips = zipCodes.split(',').map(z => z.trim()).filter(Boolean);
          if (zips.length === 1) {
            filterParts.push(`PostalCode eq '${zips[0]}'`);
          } else if (zips.length > 1) {
            filterParts.push(`(${zips.map(z => `PostalCode eq '${z}'`).join(' or ')})`);
          }
        }

        // Borough — push to OData
        if (borough) {
          const boroughMap: Record<string, string> = {
            'manhattan': 'New York', 'brooklyn': 'Kings', 'queens': 'Queens',
            'bronx': 'Bronx', 'staten island': 'Richmond',
          };
          const countyValue = boroughMap[borough.toLowerCase()] || borough;
          const safeBorough = countyValue.replace(/'/g, "''");
          filterParts.push(`CountyOrParish eq '${safeBorough}'`);
        }

        // Build OData $orderby for sort
        let orderby: string | undefined;
        switch (sortParam) {
          case 'price-asc': orderby = 'ListPrice asc'; break;
          case 'price-desc': orderby = 'ListPrice desc'; break;
          case 'sqft-desc': orderby = 'LivingArea desc'; break;
          case 'beds-desc': orderby = 'BedroomsTotal desc'; break;
          case 'newest': default: orderby = 'ModificationTimestamp desc'; break;
        }

        // Fetch extra to account for gate filtering + post-filters
        // Neighborhood/borough/bounds queries need more headroom (heavy post-filtering)
        const hasPostFilter = !!(boundsParam || borough || neighborhood);
        const fetchTop = Math.min((limit + skip) * (hasPostFilter ? 2.5 : 1.2) + 10, 1000);

        // When amenity filters are active, add the required fields to $select
        const amenityFields = amenitiesParam ? [
          'BuildingFeatures', 'InteriorFeatures', 'ExteriorFeatures',
          'Appliances', 'Cooling', 'View', 'ParkingFeatures', 'LaundryFeatures',
          'GarageYN', 'AttendanceType',
        ] : [];
        const selectFields = [...CARD_SELECT_FIELDS, ...amenityFields.filter(f => !CARD_SELECT_FIELDS.includes(f))];

        // $expand=Media eliminates separate photo batch-fetch (saves 5-10s).
        // Trestle supports it for $top ≤ ~200. For larger queries, batch-fetch separately.
        const useExpandMedia = fetchTop <= 200;

        const result = await fetchFromTrestle({
          filter: filterParts.join(' and '),
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

        // Bounds post-filter: narrow ZIP-based results to precise lat/lng box.
        // Trestle IDX Plus returns Latitude/Longitude as null AND blocks OData
        // geo filters (400 error). We must geocode first, then filter by bounds.
        if (boundsParam) {
          const [south, west, north, east] = boundsParam.split(',').map(Number);
          if (south && west && north && east) {
            // Geocode all filtered listings BEFORE bounds check
            // (Trestle gives null lat/lng — Census geocoder fills them in)
            try {
              await geocodeListings(filtered);
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
        // When post-filtering (bounds, borough, neighborhood), use filtered.length as total
        // because OData count doesn't account for server-side filtering.
        const totalCount = (boundsParam || borough || neighborhood)
          ? filtered.length
          : (result.odataCount ?? filtered.length);
        const pageListings = filtered.slice(skip, skip + limit);

        // Step 4b+4c: Batch-fetch photos AND geocode IN PARALLEL (both are slow I/O)
        // When $expand=Media was used, photos are already inline — skip batch fetch.
        // Fallback batch-fetch only runs for large queries where $expand was disabled.
        const photoPromise = (async () => {
          const needsPhotos = pageListings.filter(l => l.media.length === 0);
          if (needsPhotos.length === 0) return;
          try {
            const token = await getAccessToken();
            const TRESTLE_API = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";

            function classifyMedia(m: Record<string, unknown>): 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' {
              const cat = String(m.MediaCategory || '').toLowerCase();
              if (cat.includes('floor plan')) return 'FloorPlan';
              if (cat.includes('video')) return 'Video';
              if (cat.includes('virtual tour')) return 'VirtualTour';
              if (cat === 'photo' || cat === '') return 'Photo';
              const desc = String(m.ShortDescription || '').toLowerCase();
              if (desc.includes('floor plan') || desc.includes('floorplan')) return 'FloorPlan';
              return 'Photo';
            }

            const MEDIA_BATCH = 50;
            const mediaByListing = new Map<string, { url: string; mediaType: string; order: number }[]>();
            const chunks: typeof needsPhotos[] = [];
            for (let i = 0; i < needsPhotos.length; i += MEDIA_BATCH) {
              chunks.push(needsPhotos.slice(i, i + MEDIA_BATCH));
            }

            const fetchChunk = async (chunk: typeof needsPhotos) => {
              const ids = chunk.map(l => l.listingId);
              const idFilter = ids.map(id => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`).join(' or ');
              const mediaFilter = `(${idFilter}) and (Order le 3 or MediaCategory ne 'Photo')`;
              const mediaParams = new URLSearchParams();
              mediaParams.set('$filter', mediaFilter);
              mediaParams.set('$select', 'ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN');
              mediaParams.set('$orderby', 'ResourceRecordID asc,Order asc');
              mediaParams.set('$top', String(chunk.length * 4));

              const res = await fetch(`${TRESTLE_API}/odata/Media?${mediaParams.toString()}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
              });
              if (!res.ok) return;
              const data = await res.json();
              for (const m of (data.value || [])) {
                const lid = String(m.ResourceRecordID || '');
                if (!lid || !m.MediaURL) continue;
                const mediaType = classifyMedia(m);
                const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
                if (!mediaByListing.has(lid)) mediaByListing.set(lid, []);
                mediaByListing.get(lid)!.push({
                  url: String(m.MediaURL),
                  mediaType,
                  order: isPreferred ? -1 : Number(m.Order ?? 0),
                });
              }
            };

            // Run up to 4 chunks in parallel
            for (let i = 0; i < chunks.length; i += 4) {
              await Promise.allSettled(chunks.slice(i, i + 4).map(fetchChunk));
            }

            // Inject media into listings
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
          } catch (mediaErr) {
            console.warn('[/api/listings] Photo batch fetch failed:', mediaErr instanceof Error ? mediaErr.message : mediaErr);
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

        // Async audit log (non-blocking)
        logTrestleAccess({
          endpoint: '/api/listings',
          method: 'GET',
          trestleResource: 'Property',
          filter: filterParts.join(' and '),
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
