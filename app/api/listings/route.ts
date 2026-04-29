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
import { buildSearchDisplayWhere, SEARCH_DISPLAY_GATE } from '@/lib/search/listing-access-decision';
import { buildPublicListingDbSearch } from '@/lib/search/public-listing-db';
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

// Vercel serverless: allow up to 60s for Trestle API calls + media fetch
export const maxDuration = 60;

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
    const maxBeds = searchParams.get('maxBeds');
    const minBaths = searchParams.get('minBaths');
    const maxBaths = searchParams.get('maxBaths');
    const propertyTypeFilter = searchParams.get('propertyType');
    const statusFilter = searchParams.get('status');
    const statusesParam = searchParams.get('statuses'); // comma-separated: Active,ComingSoon
    const minSqft = searchParams.get('minSqft');
    const maxSqft = searchParams.get('maxSqft');
    const sortParam = searchParams.get('sort');
    const skipParam = searchParams.get('skip');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const skip = skipParam ? Math.max(0, parseInt(skipParam, 10)) : 0;
    // New filter params
    const commercial = searchParams.get('commercial') === 'true';
    const propertySubTypes = searchParams.get('propertySubTypes') || searchParams.get('subTypes'); // accept both
    const ownershipTypes = searchParams.get('ownershipTypes'); // comma-separated
    const yearBuiltParam = searchParams.get('yearBuilt'); // 'pre-war' | 'post-war'
    const furnishedParam = searchParams.get('furnished') === 'true';
    const amenitiesParam = searchParams.get('amenities'); // comma-separated amenity keys
    const openHouseParam = searchParams.get('openHouse') === 'true';
    const openHouseDateParam = searchParams.get('openHouseDate'); // 'weekend' | ISO date | undefined
    const addressParam = searchParams.get('address'); // free-text street name search
    const keywords = searchParams.get('keywords')?.split(',').filter(Boolean) || [];

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

            // Build features lookup — shared by ownershipTypes, amenities, and keywords post-filters
            const featuresById = new Map<string, Record<string, unknown>>();
            for (const dbL of serialized) {
              const feat = (dbL.features || {}) as Record<string, unknown>;
              featuresById.set(dbL.listing_id, feat);
            }

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

            // Geocode DB listings — use only in-memory + DB cache (fast).
            // Census API geocoding is too slow for search (~2-5s) — it runs during
            // the IDX sync cron instead. Listings without cached coords get ZIP centroids.
            // Fire-and-forget with a tight 1.5s timeout so it never blocks the response.
            const geocodePromise = Promise.race([
              geocodeListings(publicListings),
              new Promise<void>((resolve) => setTimeout(resolve, 1500)),
            ]).catch(() => { /* non-fatal */ });

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

            // Address search is now handled in the Prisma query (JSON path filters)
            // so no post-filter needed here — results are already narrowed by SQL

            // Amenity post-filtering on DB path (same AND logic as Trestle path)
            // DB listings store amenity fields in the features JSON column with
            // PascalCase keys (same as raw Trestle field names). The DTO also
            // exposes these as camelCase. We check both DTO + features JSON.
            if (amenitiesParam) {
              const { AMENITY_FIELD_MAP } = await import('@/lib/search/types');
              // PascalCase → camelCase mapping for DTO fields
              const fieldToDto: Record<string, string> = {
                'BuildingFeatures': 'buildingFeatures',
                'InteriorFeatures': 'interiorFeatures',
                'ExteriorFeatures': 'exteriorFeatures',
                'Appliances': 'appliances',
                'Cooling': 'cooling',
                'View': 'view',
                'ParkingFeatures': 'parkingFeatures',
                'LaundryFeatures': 'laundryFeatures',
                'PetsAllowed': 'petsAllowed',
              };
              const requestedAmenities = amenitiesParam.split(',').filter(
                (a): a is import('@/lib/search/types').AmenityFilter => a in AMENITY_FIELD_MAP
              );

              // AND logic: each selected amenity must be present
              for (const amenityKey of requestedAmenities) {
                const mapping = AMENITY_FIELD_MAP[amenityKey];
                const fields = mapping.field.split(',').map(f => f.trim());
                const matchValues = mapping.values.map(v => v.toLowerCase());

                if (amenityKey === 'pet-friendly') {
                  publicListings = publicListings.filter((listing) => {
                    // Check DTO petsAllowed + features JSON PetsAllowed
                    const dtoVal = String(listing.petsAllowed || '').toLowerCase();
                    const feat = featuresById.get(listing.id) || {};
                    const featVal = String(feat.PetsAllowed || '').toLowerCase();
                    const val = dtoVal || featVal;
                    if (!val) return false;
                    return !val.includes('no') || val.includes('catsok') || val.includes('dogsok');
                  });
                } else {
                  publicListings = publicListings.filter((listing) => {
                    const feat = featuresById.get(listing.id) || {};
                    return fields.some(fieldName => {
                      // Try DTO field first (camelCase), then features JSON (PascalCase)
                      const dtoKey = fieldToDto[fieldName];
                      const dtoVal = dtoKey ? String((listing as unknown as Record<string, unknown>)[dtoKey] || '') : '';
                      const featVal = String(feat[fieldName] || '');
                      const val = (dtoVal || featVal).toLowerCase();
                      return matchValues.some(mv => val.includes(mv));
                    });
                  });
                }
              }
            }

            // Keywords post-filter: search PublicRemarks in features JSON (AND logic)
            // PublicRemarks is a PUB-tier IDX field — safe for public text search.
            // Do NOT search PrivateRemarks or ShowingInstructions (HID tier).
            if (keywords.length > 0) {
              publicListings = publicListings.filter(listing => {
                const feat = featuresById.get(listing.id) || {};
                const remarks = String(feat.PublicRemarks || listing.publicRemarks || '').toLowerCase();
                return keywords.every(kw => remarks.includes(kw.toLowerCase().trim()));
              });
            }

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

            // Media backfill removed from search path — the /api/cron/media-backfill
            // cron (every 8min) handles this. Fetching photos per-listing during search
            // added 3-10s latency. Listings without photos show a placeholder.

            // Wait for geocoding (with tight 1.5s timeout set above)
            await geocodePromise;

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
          filterParts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);
        }
        if (maxBeds !== null && maxBeds !== undefined) {
          filterParts.push(`BedroomsTotal le ${parseInt(maxBeds, 10)}`);
        }
        if (minBaths) {
          const bathVal = Number(minBaths);
          filterParts.push(`BathroomsFull ge ${Math.floor(bathVal)}`);
          if (bathVal % 1 >= 0.5) filterParts.push(`BathroomsHalf ge 1`);
        }
        if (maxBaths) {
          filterParts.push(`BathroomsFull le ${Math.floor(Number(maxBaths))}`);
        }
        if (minSqft) filterParts.push(`LivingArea ge ${parseInt(minSqft, 10)}`);
        if (maxSqft) filterParts.push(`LivingArea le ${parseInt(maxSqft, 10)}`);

        // Year Built: pre-war (<=1946) / post-war (>=1947)
        if (yearBuiltParam === 'pre-war') filterParts.push('YearBuilt le 1946');
        else if (yearBuiltParam === 'post-war') filterParts.push('YearBuilt ge 1947');

        // Furnished (rental)
        if (furnishedParam) filterParts.push("Furnished eq 'Furnished'");

        // Address/text search — Trestle stores: StreetNumber, StreetDirPrefix (E/W/N/S), StreetName, StreetSuffix
        // Must split input into components to match correctly.
        // Uses tolower() for case-insensitive OData matching (Trestle stores uppercase but we normalize).
        if (addressParam) {
          const raw = addressParam.trim();

          // Strip street suffixes (Street, Ave, etc.) from the end
          const stripSuffix = (s: string): string =>
            s.replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER)\s*$/i, '').trim();

          // Strip ordinal suffixes from street numbers (1ST→1, 2ND→2, 90TH→90)
          // Only strip when preceded by a digit to avoid removing "ST" from "PARK"
          const stripOrdinal = (s: string): string =>
            s.replace(/(\d+)(ST|ND|RD|TH)\b/gi, '$1').trim();

          // OData-safe string: lowercase, single-quote escaping
          const odataSafe = (s: string): string =>
            s.toLowerCase().replace(/'/g, "''");

          // Pattern 1: "400 E 90TH ST" or "400 EAST 90TH STREET" — number + direction + street
          const dirWithNumPattern = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
          // Pattern 2: "E 90TH ST" or "EAST 90TH STREET" — direction + street (no number)
          const dirNoNumPattern = /^(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
          // Pattern 3: "400 PARK AVE" — number + street (no direction)
          const numOnlyPattern = /^(\d+)\s+(.*)/;

          const dirWithNumMatch = raw.match(dirWithNumPattern);
          if (dirWithNumMatch) {
            const streetNum = dirWithNumMatch[1];
            const direction = dirWithNumMatch[2].charAt(0).toUpperCase();
            const streetPart = odataSafe(stripOrdinal(stripSuffix(dirWithNumMatch[3])));
            const conditions = [`startswith(StreetNumber,'${streetNum}')`, `StreetDirPrefix eq '${direction}'`];
            if (streetPart) conditions.push(`contains(tolower(StreetName),'${streetPart}')`);
            filterParts.push(`(${conditions.join(' and ')})`);
          } else {
            const dirNoNumMatch = raw.match(dirNoNumPattern);
            if (dirNoNumMatch) {
              // "East 90th Street" — direction + street, no number
              const direction = dirNoNumMatch[1].charAt(0).toUpperCase();
              const streetPart = odataSafe(stripOrdinal(stripSuffix(dirNoNumMatch[2])));
              const conditions = [`StreetDirPrefix eq '${direction}'`];
              if (streetPart) conditions.push(`contains(tolower(StreetName),'${streetPart}')`);
              filterParts.push(`(${conditions.join(' and ')})`);
            } else {
              const numMatch = raw.match(numOnlyPattern);
              if (numMatch && numMatch[1]) {
                // "400 Park Ave" or "400 90th" — number + street, no direction
                const streetNum = numMatch[1];
                const streetPart = odataSafe(stripOrdinal(stripSuffix(numMatch[2] || '')));
                if (streetPart) {
                  filterParts.push(`(startswith(StreetNumber,'${streetNum}') and contains(tolower(StreetName),'${streetPart}'))`);
                } else {
                  filterParts.push(`startswith(StreetNumber,'${streetNum}')`);
                }
              } else {
                // Text only — street name or building name
                const cleaned = odataSafe(stripSuffix(raw));
                if (cleaned) {
                  filterParts.push(`(contains(tolower(StreetName),'${cleaned}') or contains(tolower(BuildingName),'${cleaned}'))`);
                }
              }
            }
          }
        }

        // Property sub-types: PropertySubType can't be pushed to OData (causes 502).
        // But CommonInterest CAN be pushed for Condo/Co-op/Condop (ownership types).
        // Structural types (Loft, Townhouse, etc.) are handled as post-filter.
        // Property type OData push: ONLY CommonInterest works on Trestle IDX Plus.
        // PropertySubType, NewConstructionYN, NewDevelopmentYN all cause 502.
        // Non-CommonInterest types handled as post-filter after fetch.
        if (propertySubTypes) {
          const types = propertySubTypes.split(',').map(t => t.trim());
          const odataParts: string[] = [];

          // CommonInterest for ownership types
          const commonInterestPush: Record<string, string> = {
            'Condo': 'Condominium', 'Co-op': 'StockCooperative', 'Condop': 'Condop',
          };
          for (const t of types) {
            if (commonInterestPush[t]) {
              odataParts.push(`CommonInterest eq '${commonInterestPush[t]}'`);
            }
          }

          // New Development — push PublicRemarks contains to OData
          if (types.includes('New Development')) {
            odataParts.push(
              "contains(PublicRemarks,'new development')",
              "contains(PublicRemarks,'new construction')",
              "contains(PublicRemarks,'sponsor unit')",
              "contains(PublicRemarks,'brand new')",
            );
          }

          if (odataParts.length > 0) {
            filterParts.push(`(${odataParts.join(' or ')})`);
          }
        }
        // Sort = new-development
        if (sortParam === 'new-development' && !propertySubTypes) {
          filterParts.push("(contains(PublicRemarks,'new development') or contains(PublicRemarks,'new construction') or contains(PublicRemarks,'sponsor unit'))");
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

        // Legacy single propertyType filter — only push CommonInterest to OData
        // (PropertySubType causes Trestle 502, handled as post-filter)
        if (propertyTypeFilter && !propertySubTypes && !ownershipTypes) {
          const commonInterestMap: Record<string, string> = {
            'Condo': 'Condominium',
            'Co-op': 'StockCooperative',
            'Condop': 'Condop',
          };
          const safe = propertyTypeFilter.replace(/'/g, "''");
          if (commonInterestMap[safe]) {
            filterParts.push(`CommonInterest eq '${commonInterestMap[safe]}'`);
          } else {
            // Can't push PropertySubType to OData — will be post-filtered;
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
          const zips = zipCodes.split(',').map(z => z.trim().replace(/[^0-9]/g, '')).filter(z => z.length === 5);
          if (zips.length === 1) {
            filterParts.push(`PostalCode eq '${zips[0]}'`);
          } else if (zips.length > 1) {
            filterParts.push(`(${zips.map(z => `PostalCode eq '${z}'`).join(' or ')})`);
          }
        }

        // Neighborhood → ZIP push for Trestle OData (CityRegion is unreliable)
        // Supports multi-neighborhood: comma-separated names
        if (neighborhood && !zipCodes) {
          const names = neighborhood.split(',').map(n => n.trim()).filter(Boolean);
          const allZips = [...new Set(names.flatMap(n => lookupNeighborhoodZips(n)))];
          if (allZips.length > 0) {
            if (allZips.length === 1) {
              filterParts.push(`PostalCode eq '${allZips[0]}'`);
            } else {
              filterParts.push(`(${allZips.map(z => `PostalCode eq '${z}'`).join(' or ')})`);
            }
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

        // Keywords → OData contains() on PublicRemarks (AND logic — all must match)
        // PublicRemarks is a PUB-tier IDX field available on Trestle $select.
        // OData-safe: escape single quotes, strip SQL wildcards.
        if (keywords.length > 0) {
          for (const kw of keywords) {
            const safe = kw.replace(/[%_]/g, '').replace(/'/g, "''").trim().toLowerCase();
            if (safe) {
              filterParts.push(`contains(tolower(PublicRemarks),'${safe}')`);
            }
          }
        }

        // Fetch extra to account for gate filtering + post-filters
        // Property type, neighborhood, borough all need heavy post-filtering headroom
        const hasPostFilter = !!(boundsParam || borough || neighborhood || propertySubTypes || sortParam === 'new-development');
        const fetchTop = Math.min(Math.ceil((limit + skip) * (hasPostFilter ? 4 : 1.2) + 20), 1000);

        // Amenity fields are NOT added to Trestle $select — many are unavailable
        // on IDX Plus feed and Trestle rejects unknown fields (causes 400/502).
        // Amenity filtering uses PetsAllowed (already in CARD_SELECT_FIELDS) for
        // pet-friendly, and relies on DB path for all other amenity filters.
        const selectFields = [...CARD_SELECT_FIELDS];

        // NEVER use $expand=Media — Trestle's OData $expand returns empty arrays for
        // ~50% of listings (broken navigation property). Always batch-fetch separately.
        const useExpandMedia = false;

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

          // Phase 2: For listings STILL empty, check DB (photos from sync/backfill)
          const stillEmpty = pageListings.filter(l => l.media.length === 0);
          if (stillEmpty.length > 0) {
            try {
              const dbListings = await prisma.listing.findMany({
                where: {
                  listing_id: { in: stillEmpty.map(l => l.listingId) },
                },
                select: { listing_id: true, media: true },
              });
              for (const dbL of dbListings) {
                const mediaArr = Array.isArray(dbL.media) ? (dbL.media as Record<string, unknown>[]) : [];
                if (mediaArr.length === 0) continue;
                const listing = stillEmpty.find(l => l.listingId === dbL.listing_id);
                if (!listing) continue;
                // Normalize DB media (handles both raw Trestle and mapped formats)
                const normalized = mediaArr
                  .map((m) => {
                    const cat = String(m.MediaCategory || m.mediaType || 'Photo').toLowerCase();
                    let mediaType: 'Photo' | 'FloorPlan' | 'Video' | 'VirtualTour' = 'Photo';
                    if (cat.includes('floor plan') || cat.includes('floorplan')) mediaType = 'FloorPlan';
                    else if (cat.includes('video')) mediaType = 'Video';
                    else if (cat.includes('virtual tour')) mediaType = 'VirtualTour';
                    return {
                      url: String(m.url || m.MediaURL || ''),
                      mediaType,
                      order: Number(m.order ?? m.Order ?? 0),
                    };
                  })
                  .filter((m) => m.url);
                if (normalized.length > 0) {
                  listing.media = normalized as typeof listing.media;
                }
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
      // Only Active statuses — Draft/Incomplete NEVER shown publicly
      status: buildSearchDisplayWhere().status,
      // Distribution gates
      ...SEARCH_DISPLAY_GATE,
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
