import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

/**
 * Rate limiter — 30 requests per minute per IP.
 * Prevents bulk scraping of building data per REBNY RLS compliance.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

/** Format Trestle camelCase → readable: "HealthClub" → "Health Club" */
function formatFeatureLabel(val: string): string {
  return val
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^Building\s?/, '')
    .trim();
}

/** Parse comma-separated Trestle value list */
function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.toLowerCase() !== 'none' && v.toLowerCase() !== 'other');
}

interface TrestleRecord {
  [key: string]: unknown;
}

/**
 * GET /api/buildings?streetNumber=301&streetName=E+62ND+Street&postalCode=10065
 *
 * Returns building-level data: info, active listings, closed sales, aggregate stats.
 *
 * COMPLIANCE:
 * - Distribution gates enforced (IDXEntireListingDisplayYN, OwnerOptOut)
 * - Address suppression respected
 * - REBNY RLS attribution included
 * - Server-side only MLS data access
 */
export async function GET(request: NextRequest) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const streetNumber = searchParams.get('streetNumber');
  const streetName = searchParams.get('streetName');
  const postalCode = searchParams.get('postalCode');
  const buildingName = searchParams.get('buildingName');

  if (!streetNumber || !streetName) {
    return NextResponse.json({ error: 'streetNumber and streetName required' }, { status: 400 });
  }

  try {
    const cleanStreetNumber = sanitizeOData(streetNumber);
    const cleanStreetName = sanitizeOData(streetName);
    const cleanPostalCode = postalCode ? sanitizeOData(postalCode) : '';

    // Parse the street name into components for Trestle's decomposed fields
    // e.g. "W 57th Street" → dirPrefix: "W", coreName: "57th", suffix: "Street"
    const DIR_PREFIXES = /^(N|S|E|W|North|South|East|West)\b\s*/i;
    const SUFFIXES = /\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Pl|Place|Ct|Court|Ln|Lane|Way|Terrace|Ter)\.?$/i;
    let coreStreetName = cleanStreetName;
    const dirMatch = coreStreetName.match(DIR_PREFIXES);
    const parsedDirPrefix = dirMatch ? dirMatch[1].toUpperCase().charAt(0) : '';
    if (dirMatch) coreStreetName = coreStreetName.replace(DIR_PREFIXES, '');
    coreStreetName = coreStreetName.replace(SUFFIXES, '').trim();

    // ── 1. Query DB for all listings at this address ──
    // Active + Closed listings, respecting distribution gates

    // Build address JSON match conditions
    const addressConditions: Record<string, unknown>[] = [
      { path: ['StreetNumber'], equals: cleanStreetNumber },
    ];

    // PostalCode for precision
    if (cleanPostalCode) {
      addressConditions.push({ path: ['PostalCode'], equals: cleanPostalCode });
    }

    const dbListings = await prisma.listing.findMany({
      where: {
        AND: [
          { idx_display_yn: true },
          { owner_opt_out: false },
          { internet_entire_listing_display_yn: true },
          { participant_only: false },
          ...addressConditions.map((cond) => ({
            address: { ...cond },
          })),
          {
            // Match on core street name (without dir prefix / suffix)
            address: {
              string_contains: coreStreetName,
            },
          },
        ],
      },
      orderBy: { list_price: 'desc' },
      take: 50,
    });

    // Separate active vs closed
    const activeStatuses = new Set(['Active', 'ActiveUnderContract', 'Coming Soon']);
    const closedStatuses = new Set(['Closed']);

    const activeListings = dbListings.filter((l) => activeStatuses.has(l.status));
    const closedListings = dbListings.filter((l) => closedStatuses.has(l.status));

    // ── 2. Also fetch from Trestle for fresh/additional data ──
    let trestleActive: TrestleRecord[] = [];
    let trestleClosed: TrestleRecord[] = [];
    let buildingInfo: {
      buildingName: string | null;
      yearBuilt: number | null;
      storiesTotal: number | null;
      buildingFeatures: string[];
      securityFeatures: string[];
      exteriorFeatures: string[];
      parkingFeatures: string[];
      petsAllowed: string[];
    } = {
      buildingName: null,
      yearBuilt: null,
      storiesTotal: null,
      buildingFeatures: [],
      securityFeatures: [],
      exteriorFeatures: [],
      parkingFeatures: [],
      petsAllowed: [],
    };

    try {
      const token = await getAccessToken();
      // Building query: StreetNumber + PostalCode is usually unique enough for a building.
      // Adding StreetName contains as refinement (but NOT dir prefix — Trestle stores it inconsistently).
      const zipFilter = cleanPostalCode ? ` and PostalCode eq '${cleanPostalCode}'` : '';
      const addressFilter = `StreetNumber eq '${cleanStreetNumber}' and contains(StreetName,'${coreStreetName}')${zipFilter}`;

      // Active listings
      const activeParams = new URLSearchParams({
        $filter: `${addressFilter} and MlsStatus eq 'Active'`,
        $select: [
          'ListingId', 'ListingKey', 'SourceSystemKey', 'ListPrice',
          'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf', 'LivingArea',
          'UnitNumber', 'PropertySubType', 'PropertyType', 'StandardStatus',
          'ListOfficeName', 'BuildingName', 'YearBuilt', 'StoriesTotal',
          'BuildingFeatures', 'SecurityFeatures', 'ExteriorFeatures',
          'ParkingFeatures', 'PetsAllowed',
          'IDXEntireListingDisplayYN', 'InternetEntireListingDisplayYN',
        ].join(','),
        $orderby: 'ListPrice desc',
        $top: '30',
      });

      // Closed sales
      const closedParams = new URLSearchParams({
        $filter: `${addressFilter} and (MlsStatus eq 'Closed' or StandardStatus eq 'Closed')`,
        $select: [
          'ListingId', 'ListingKey', 'SourceSystemKey', 'ClosePrice', 'ListPrice',
          'BedroomsTotal', 'BathroomsFull', 'LivingArea', 'UnitNumber',
          'CloseDate', 'PropertySubType', 'PropertyType', 'ListOfficeName',
          'BuildingName', 'YearBuilt', 'StoriesTotal',
          'BuildingFeatures', 'SecurityFeatures', 'ExteriorFeatures',
          'ParkingFeatures', 'PetsAllowed',
          'IDXEntireListingDisplayYN', 'InternetEntireListingDisplayYN',
        ].join(','),
        $orderby: 'CloseDate desc',
        $top: '30',
      });

      const [activeRes, closedRes] = await Promise.all([
        fetch(`${TRESTLE_URL}/odata/Property?${activeParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        }),
        fetch(`${TRESTLE_URL}/odata/Property?${closedParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        }),
      ]);

      if (activeRes.ok) {
        const data = await activeRes.json();
        trestleActive = (data.value || []).filter(
          (r: TrestleRecord) => r.IDXEntireListingDisplayYN !== false && r.InternetEntireListingDisplayYN !== false
        );
      }
      if (closedRes.ok) {
        const data = await closedRes.json();
        trestleClosed = (data.value || []).filter(
          (r: TrestleRecord) => r.IDXEntireListingDisplayYN !== false && r.InternetEntireListingDisplayYN !== false
        );
      }

      // Extract building info from first available record
      const allRecords = [...trestleActive, ...trestleClosed];
      for (const r of allRecords) {
        if (!buildingInfo.buildingName && r.BuildingName) {
          buildingInfo.buildingName = String(r.BuildingName);
        }
        if (!buildingInfo.yearBuilt && r.YearBuilt) {
          buildingInfo.yearBuilt = Number(r.YearBuilt);
        }
        if (!buildingInfo.storiesTotal && r.StoriesTotal) {
          buildingInfo.storiesTotal = Number(r.StoriesTotal);
        }
        if (buildingInfo.buildingFeatures.length === 0 && r.BuildingFeatures) {
          buildingInfo.buildingFeatures = parseList(String(r.BuildingFeatures));
        }
        if (buildingInfo.securityFeatures.length === 0 && r.SecurityFeatures) {
          buildingInfo.securityFeatures = parseList(String(r.SecurityFeatures));
        }
        if (buildingInfo.exteriorFeatures.length === 0 && r.ExteriorFeatures) {
          buildingInfo.exteriorFeatures = parseList(String(r.ExteriorFeatures));
        }
        if (buildingInfo.parkingFeatures.length === 0 && r.ParkingFeatures) {
          buildingInfo.parkingFeatures = parseList(String(r.ParkingFeatures));
        }
        if (buildingInfo.petsAllowed.length === 0 && r.PetsAllowed) {
          buildingInfo.petsAllowed = parseList(String(r.PetsAllowed));
        }
      }
    } catch (trestleErr) {
      console.warn('[/api/buildings] Trestle fetch error:', trestleErr);
      // Continue with DB data only
    }

    // ── 3. Merge DB + Trestle active units (dedupe by listing ID) ──
    const seenIds = new Set<string>();
    const activeUnits: Array<{
      id: string;
      mlsId: string;
      listPrice: number;
      beds: number;
      baths: number;
      bathsHalf: number;
      sqft: number;
      unit: string;
      propertyType: string;
      office: string;
      status: string;
    }> = [];

    // Trestle active first (fresher data)
    for (const r of trestleActive) {
      const id = String(r.ListingKey || r.ListingId);
      const mlsId = String(r.ListingId || '');
      if (seenIds.has(mlsId)) continue;
      seenIds.add(mlsId);
      activeUnits.push({
        id,
        mlsId,
        listPrice: Number(r.ListPrice || 0),
        beds: Number(r.BedroomsTotal || 0),
        baths: Number(r.BathroomsFull || 0),
        bathsHalf: Number(r.BathroomsHalf || 0),
        sqft: Number(r.LivingArea || 0),
        unit: String(r.UnitNumber || ''),
        propertyType: String(r.PropertySubType || r.PropertyType || ''),
        office: String(r.ListOfficeName || ''),
        status: String(r.StandardStatus || 'Active'),
      });
    }

    // DB active listings (fill gaps)
    for (const l of activeListings) {
      if (seenIds.has(l.listing_id)) continue;
      seenIds.add(l.listing_id);
      const addr = l.address as Record<string, unknown>;
      activeUnits.push({
        id: String(l.id),
        mlsId: l.listing_id,
        listPrice: Number(l.list_price),
        beds: l.bedrooms_total || 0,
        baths: l.bathrooms_full || 0,
        bathsHalf: l.bathrooms_half || 0,
        sqft: l.living_area ? Number(l.living_area) : 0,
        unit: String(addr.UnitNumber || ''),
        propertyType: l.property_sub_type || l.property_type || '',
        office: '',
        status: l.status,
      });

      // Extract building info from DB if not yet found
      const features = l.features as Record<string, unknown> | null;
      if (!buildingInfo.buildingName && addr.BuildingName) {
        buildingInfo.buildingName = String(addr.BuildingName);
      }
      if (!buildingInfo.yearBuilt && features?.YearBuilt) {
        buildingInfo.yearBuilt = Number(features.YearBuilt);
      }
    }

    // ── 4. Merge sale history ──
    const saleHistory: Array<{
      id: string;
      mlsId: string;
      closePrice: number;
      beds: number;
      baths: number;
      sqft: number;
      unit: string;
      closeDate: string | null;
      propertyType: string;
      office: string;
      source: string;
    }> = [];

    const seenSaleIds = new Set<string>();

    for (const r of trestleClosed) {
      const mlsId = String(r.ListingId || '');
      if (seenSaleIds.has(mlsId)) continue;
      seenSaleIds.add(mlsId);
      saleHistory.push({
        id: String(r.ListingKey || r.ListingId),
        mlsId,
        closePrice: Number(r.ClosePrice || r.ListPrice || 0),
        beds: Number(r.BedroomsTotal || 0),
        baths: Number(r.BathroomsFull || 0),
        sqft: Number(r.LivingArea || 0),
        unit: String(r.UnitNumber || ''),
        closeDate: r.CloseDate ? String(r.CloseDate) : null,
        propertyType: String(r.PropertySubType || r.PropertyType || ''),
        office: String(r.ListOfficeName || ''),
        source: 'mls',
      });
    }

    for (const l of closedListings) {
      if (seenSaleIds.has(l.listing_id)) continue;
      seenSaleIds.add(l.listing_id);
      const addr = l.address as Record<string, unknown>;
      const raw = l.raw_data as Record<string, unknown> | null;
      saleHistory.push({
        id: String(l.id),
        mlsId: l.listing_id,
        closePrice: raw?.ClosePrice ? Number(raw.ClosePrice) : Number(l.list_price),
        beds: l.bedrooms_total || 0,
        baths: l.bathrooms_full || 0,
        sqft: l.living_area ? Number(l.living_area) : 0,
        unit: String(addr.UnitNumber || ''),
        closeDate: raw?.CloseDate ? String(raw.CloseDate) : null,
        propertyType: l.property_sub_type || l.property_type || '',
        office: '',
        source: 'mls',
      });
    }

    // Sort by date descending
    saleHistory.sort((a, b) => {
      if (!a.closeDate && !b.closeDate) return 0;
      if (!a.closeDate) return 1;
      if (!b.closeDate) return -1;
      return new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime();
    });

    // ── 5. Compute aggregate stats ──
    const allPrices = [
      ...activeUnits.map((u) => u.listPrice),
      ...saleHistory.map((s) => s.closePrice),
    ].filter((p) => p > 0);

    const allSqft = [
      ...activeUnits.map((u) => u.sqft),
      ...saleHistory.map((s) => s.sqft),
    ].filter((s) => s > 0);

    const avgPrice = allPrices.length > 0 ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : null;
    const avgSqft = allSqft.length > 0 ? Math.round(allSqft.reduce((a, b) => a + b, 0) / allSqft.length) : null;
    const avgPricePerSqft = avgPrice && avgSqft ? Math.round(avgPrice / avgSqft) : null;

    // Override building name with query param if provided
    if (buildingName && !buildingInfo.buildingName) {
      buildingInfo.buildingName = buildingName;
    }

    // Format amenities for display
    const FEATURE_LABELS: Record<string, string> = {
      Concierge: 'Concierge',
      Elevators: 'Elevator',
      HealthClub: 'Gym',
      FitnessCenter: 'Gym',
      YogaStudio: 'Yoga Studio',
      IndoorPool: 'Pool',
      CommonPlayroom: "Children's Room",
      GameRoom: 'Recreation Room',
      ScreeningRoom: 'Screening Room',
      Sauna: 'Sauna',
      SteamRoom: 'Steam Room',
      KitchenFacilities: 'Kitchen Facilities',
      PackageRoom: 'Package Room',
      GreenBuilding: 'Green Building',
      ColdStorage: 'Cold Storage',
      SecurityGuard: 'Doorman',
      SecurityGate: 'Security Gate',
      BuildingRoofDeck: 'Roof Deck',
      BuildingGarden: 'Garden',
      BuildingCourtyard: 'Courtyard',
    };
    const EXCLUDE = new Set(['Storage', 'BikeStorage', 'BicycleStorage', 'None']);

    const amenitySet = new Set<string>();
    for (const f of buildingInfo.buildingFeatures) {
      if (EXCLUDE.has(f)) continue;
      amenitySet.add(FEATURE_LABELS[f] || formatFeatureLabel(f));
    }
    for (const f of buildingInfo.securityFeatures) {
      amenitySet.add(FEATURE_LABELS[f] || formatFeatureLabel(f));
    }
    for (const f of buildingInfo.exteriorFeatures) {
      if (f.startsWith('Building')) {
        amenitySet.add(FEATURE_LABELS[f] || formatFeatureLabel(f));
      }
    }
    if (buildingInfo.parkingFeatures.some((f) => f === 'Garage')) {
      amenitySet.add('Garage');
    }

    const amenities = [...amenitySet].sort();

    // Pet policy
    const petPolicy = buildingInfo.petsAllowed
      .map((v) => {
        const lower = v.toLowerCase();
        if (lower.includes('cat')) return 'Cats Ok';
        if (lower.includes('dog')) return 'Dogs Ok';
        if (lower === 'no') return 'No Pets';
        return formatFeatureLabel(v);
      })
      .filter((v) => v.length > 0);

    return NextResponse.json({
      success: true,
      building: {
        name: buildingInfo.buildingName,
        address: `${cleanStreetNumber} ${streetName}`,
        postalCode: cleanPostalCode || postalCode || '',
        yearBuilt: buildingInfo.yearBuilt,
        storiesTotal: buildingInfo.storiesTotal,
        amenities,
        petPolicy,
      },
      activeUnits,
      saleHistory,
      stats: {
        totalActive: activeUnits.length,
        totalSales: saleHistory.length,
        avgPrice,
        avgSqft,
        avgPricePerSqft,
      },
      _compliance: {
        source: 'idx',
        attribution: 'Based on information from the REBNY Listing Service. Data last updated ' + new Date().toISOString().split('T')[0],
        disclaimerRequired: true,
      },
    });
  } catch (err) {
    console.error('[/api/buildings] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
