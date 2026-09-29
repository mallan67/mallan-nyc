/**
 * FROZEN LEGACY FIXTURE — the exact app/api/buildings/route.ts as it exists
 * on main c4ade4bd7015cba1b3aa431170d9b5e23f5b9a47 (production behavior).
 * USED ONLY by tests/runtime/building-payload-parity.test.ts to prove the
 * new shared cached accessor returns an IDENTICAL public payload.
 * NEVER import this from production code. Do not edit — regenerate with:
 *   git show c4ade4bd:app/api/buildings/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { getPrimaryPhoto, classifyMediaItem } from '@/lib/media/listing-media-resolver';
import prisma from '@/lib/prisma';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { upsertBuildingFromRecords } from '@/lib/buildings/upsert';
import { mapPropertyTypeToDisplay } from '@/lib/idx/public-dto';
import { isActiveDisplayStatus, Status } from '@/lib/compliance/status';
import { lookupBBL, fetchAcrisSales, boroughFromPostalCode } from '@/lib/buildings/acris-building-sales';
import { resolveVisibility } from '@/lib/search/visibility-contract';

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
  Media?: Array<{ MediaURL?: string; MediaCategory?: string; Order?: number; PreferredPhotoYN?: boolean }>;
}

/** Get the primary photo URL from a Trestle record's expanded Media (skips floor plans) */
function getPhotoUrl(record: TrestleRecord): string | null {
  const media = record.Media;
  if (!media || !Array.isArray(media) || media.length === 0) return null;
  // Find first actual photo (not floor plan, video, or virtual tour)
  // Canonical classifier (catches null-category DOCUMENT- floorplans); no media[0]
  // fallback — never hero a floorplan.
  const photo = media.find(m => classifyMediaItem(m) === 'photo');
  if (!photo?.MediaURL) return null;
  // Proxy through our server to avoid exposing Trestle Bearer tokens
  return `/api/media/proxy?url=${encodeURIComponent(String(photo.MediaURL))}`;
}

/**
 * Common $select fields for building queries.
 * NOTE: IDXEntireListingDisplayYN, ParticipantOnlyYN, IDXParticipationYN do NOT exist
 * on Trestle's IDX Plus feed — including them causes OData 400 errors.
 * Trestle IDX feed pre-filters non-displayable listings, so gate fields are unnecessary.
 */
const BUILDING_SELECT = [
  // Core listing fields
  'ListingId', 'ListingKey', 'SourceSystemKey', 'ListPrice', 'ClosePrice',
  'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf', 'LivingArea',
  'UnitNumber', 'PropertySubType', 'PropertyType', 'StandardStatus', 'MlsStatus',
  'ListOfficeName', 'CloseDate',
  // Building info
  'BuildingName', 'YearBuilt', 'StoriesTotal', 'NumberOfUnitsInCommunity',
  'NumberOfUnitsTotal', 'CommonInterest', 'OwnershipType',
  'StructureType', 'NewConstructionYN',
  // Building amenities (all IDX Plus available fields)
  // NOTE: AttendanceType does NOT exist on Trestle Property — doorman info comes from SecurityFeatures/BuildingFeatures
  'BuildingFeatures', 'AssociationAmenities', 'CommunityFeatures',
  'SecurityFeatures', 'AccessibilityFeatures',
  'ExteriorFeatures', 'PatioAndPorchFeatures',
  'PoolFeatures', 'SpaFeatures', 'LaundryFeatures',
  'ParkingFeatures', 'GarageSpaces', 'ParkingTotal',
  'Heating', 'Cooling',
  // Interior & unit details (aggregated at building level)
  'Flooring', 'InteriorFeatures', 'Appliances',
  // Financial
  'TaxAnnualAmount',
  // Pets
  'PetsAllowed',
  // Green
  'GreenBuildingVerificationType', 'GreenEnergyEfficient',
  // View & waterfront
  'View', 'WaterfrontFeatures',
  // Association/financial
  'AssociationFee', 'AssociationFeeFrequency', 'AssociationFeeIncludes',
].join(',');

/** Extract building-level info from a set of Trestle records.
 *  Scans ALL records to find the richest data for each field. */
function extractBuildingInfo(records: TrestleRecord[]) {
  const info = {
    buildingName: null as string | null,
    yearBuilt: null as number | null,
    storiesTotal: null as number | null,
    totalUnits: null as number | null,
    commonInterest: null as string | null,
    ownershipType: null as string | null,
    structureType: null as string | null,
    newConstruction: null as boolean | null,
    taxAnnualAmount: null as number | null,
    flooring: [] as string[],
    interiorFeatures: [] as string[],
    appliances: [] as string[],
    buildingFeatures: [] as string[],
    associationAmenities: [] as string[],
    communityFeatures: [] as string[],
    securityFeatures: [] as string[],
    attendanceType: [] as string[],
    accessibilityFeatures: [] as string[],
    exteriorFeatures: [] as string[],
    patioAndPorchFeatures: [] as string[],
    poolFeatures: [] as string[],
    spaFeatures: [] as string[],
    laundryFeatures: [] as string[],
    parkingFeatures: [] as string[],
    garageSpaces: null as number | null,
    parkingTotal: null as number | null,
    heating: [] as string[],
    cooling: [] as string[],
    petsAllowed: [] as string[],
    greenFeatures: [] as string[],
    view: [] as string[],
    waterfrontFeatures: [] as string[],
    associationFee: null as number | null,
    associationFeeFrequency: null as string | null,
    associationFeeIncludes: [] as string[],
  };

  /** Set a list field from the first record that has data */
  const setList = (field: keyof typeof info, value: unknown) => {
    const arr = info[field] as string[];
    if (arr.length === 0 && value) {
      const parsed = parseList(String(value));
      if (parsed.length > 0) (info[field] as string[]) = parsed;
    }
  };

  for (const r of records) {
    // Scalar fields — take first non-empty
    if (!info.buildingName && r.BuildingName) info.buildingName = String(r.BuildingName);
    if (!info.yearBuilt && r.YearBuilt) info.yearBuilt = Number(r.YearBuilt);
    if (!info.storiesTotal && r.StoriesTotal) info.storiesTotal = Number(r.StoriesTotal);
    if (!info.totalUnits && r.NumberOfUnitsInCommunity) info.totalUnits = Number(r.NumberOfUnitsInCommunity);
    if (!info.totalUnits && r.NumberOfUnitsTotal) info.totalUnits = Number(r.NumberOfUnitsTotal);
    if (!info.commonInterest && r.CommonInterest) info.commonInterest = String(r.CommonInterest);
    if (!info.ownershipType && r.OwnershipType) info.ownershipType = String(r.OwnershipType);
    if (!info.structureType && r.StructureType) info.structureType = String(r.StructureType);
    if (info.newConstruction === null && r.NewConstructionYN != null) info.newConstruction = Boolean(r.NewConstructionYN);
    if (!info.taxAnnualAmount && r.TaxAnnualAmount) info.taxAnnualAmount = Number(r.TaxAnnualAmount);
    if (!info.garageSpaces && r.GarageSpaces) info.garageSpaces = Number(r.GarageSpaces);
    if (!info.parkingTotal && r.ParkingTotal) info.parkingTotal = Number(r.ParkingTotal);
    if (!info.associationFee && r.AssociationFee) info.associationFee = Number(r.AssociationFee);
    if (!info.associationFeeFrequency && r.AssociationFeeFrequency) info.associationFeeFrequency = String(r.AssociationFeeFrequency);

    // List fields
    setList('buildingFeatures', r.BuildingFeatures);
    setList('associationAmenities', r.AssociationAmenities);
    setList('communityFeatures', r.CommunityFeatures);
    setList('securityFeatures', r.SecurityFeatures);
    setList('attendanceType', r.AttendanceType);
    setList('flooring', r.Flooring);
    setList('interiorFeatures', r.InteriorFeatures);
    setList('appliances', r.Appliances);
    setList('accessibilityFeatures', r.AccessibilityFeatures);
    setList('exteriorFeatures', r.ExteriorFeatures);
    setList('patioAndPorchFeatures', r.PatioAndPorchFeatures);
    setList('poolFeatures', r.PoolFeatures);
    setList('spaFeatures', r.SpaFeatures);
    setList('laundryFeatures', r.LaundryFeatures);
    setList('parkingFeatures', r.ParkingFeatures);
    setList('heating', r.Heating);
    setList('cooling', r.Cooling);
    setList('petsAllowed', r.PetsAllowed);
    setList('view', r.View);
    setList('waterfrontFeatures', r.WaterfrontFeatures);
    setList('associationFeeIncludes', r.AssociationFeeIncludes);

    // Green — merge multiple source fields
    if (info.greenFeatures.length === 0) {
      const green = [
        ...parseList(String(r.GreenBuildingVerificationType || '')),
        ...parseList(String(r.GreenEnergyEfficient || '')),
      ].filter(v => v.length > 0);
      if (green.length > 0) info.greenFeatures = green;
    }
  }
  return info;
}

/** Format amenities from raw building info into display-ready categorized data.
 *  STRICT WHITELIST — only approved building amenities are shown. */
function formatAmenities(buildingInfo: ReturnType<typeof extractBuildingInfo>) {
  // Trestle raw value → approved display label (whitelist)
  const APPROVED: Record<string, string> = {
    // Lobby & Services
    SecurityGuard: 'Doorman',
    Concierge: 'Concierge',
    LiveInSuper: 'Live-in Super',
    VirtualDoorman: 'Virtual Doorman',
    ResidentManager: 'Live-in Super',
    // Common Areas
    HealthClub: 'Gym/Fitness',
    FitnessCenter: 'Gym/Fitness',
    YogaStudio: 'Gym/Fitness',
    Sauna: 'Sauna',
    SteamRoom: 'Steam Room',
    BuildingRoofDeck: 'Roof Deck',
    BuildingGarden: 'Common Garden',
    Storage: 'Storage',
    BikeStorage: 'Bike Room',
    BicycleStorage: 'Bike Room',
    // Building Features
    CommonPlayroom: "Children's Playroom",
    Elevators: 'Elevator',
    BusinessCenter: 'Business Center',
    GameRoom: "Residents' Lounge",
    MediaRoom: "Residents' Lounge",
    ScreeningRoom: "Residents' Lounge",
    GolfSimulation: 'Golf Simulation',
    MaidService: 'Maid Service',
  };

  const amenitySet = new Set<string>();

  // Scan all feature sources but ONLY add whitelisted values
  const allSources = [
    ...buildingInfo.buildingFeatures,
    ...buildingInfo.associationAmenities,
    ...buildingInfo.communityFeatures,
    ...buildingInfo.securityFeatures,
    ...buildingInfo.exteriorFeatures,
  ];
  for (const f of allSources) {
    if (APPROVED[f]) amenitySet.add(APPROVED[f]);
  }

  // Pool — any pool feature → "Pool"
  if (buildingInfo.poolFeatures.length > 0) amenitySet.add('Pool');

  // Spa — any spa feature → "Spa Room"
  if (buildingInfo.spaFeatures.length > 0) amenitySet.add('Spa Room');

  // Laundry — building-level only → "Laundry Room"
  const buildingLaundry = new Set(['CommonArea', 'CommonOnFloor', 'LaundryRoom', 'BuildingInside', 'BuildingMultipleLocations']);
  if (buildingInfo.laundryFeatures.some(f => buildingLaundry.has(f))) amenitySet.add('Laundry Room');

  // Parking — garage → "Parking Garage"
  if (buildingInfo.parkingFeatures.some(f => f.toLowerCase().includes('garage'))) amenitySet.add('Parking Garage');

  // AttendanceType → Doorman / 24hr Doorman / Attended Lobby
  for (const val of buildingInfo.attendanceType) {
    if (val === 'DoormanFullTime') amenitySet.add('24hr Doorman');
    else if (val === 'DoormanPartTime' || val === 'DoormanYes') amenitySet.add('Doorman');
    else if (val === 'LobbyAttendantFullTime' || val === 'LobbyAttendantPartTime' || val === 'LobbyAttendantYes') amenitySet.add('Attended Lobby');
    else if (val === 'VideoDoormanFullTime' || val === 'VideoDoormanPartTime' || val === 'VideoDoormanYes') amenitySet.add('Virtual Doorman');
    else if (val === 'ConciergeFullTime' || val === 'ConciergePartTime' || val === 'ConciergeYes') amenitySet.add('Concierge');
  }

  // Pet policy
  const petPolicySet = new Set<string>();
  for (const v of buildingInfo.petsAllowed) {
    const lower = v.toLowerCase();
    if (lower.includes('cat')) petPolicySet.add('Cats Ok');
    else if (lower.includes('dog')) petPolicySet.add('Dogs Ok');
    else if (lower === 'no') petPolicySet.add('No Pets');
    else if (lower === 'yes' || lower.includes('buildingyes') || lower === 'building yes') petPolicySet.add('Pets Allowed');
    else if (lower.includes('sizelimit')) petPolicySet.add('Size Limit');
    else if (lower.includes('numberlimit')) petPolicySet.add('Number Limit');
    else { const label = formatFeatureLabel(v); if (label) petPolicySet.add(label); }
  }

  return {
    amenities: [...amenitySet].sort(),
    petPolicy: [...petPolicySet],
    view: buildingInfo.view.map(formatFeatureLabel).filter(v => v && v !== 'None'),
    parking: {
      features: buildingInfo.parkingFeatures.map(formatFeatureLabel),
      garageSpaces: buildingInfo.garageSpaces,
      totalSpaces: buildingInfo.parkingTotal,
    },
    heating: buildingInfo.heating.map(formatFeatureLabel),
    cooling: buildingInfo.cooling.map(formatFeatureLabel),
    flooring: buildingInfo.flooring.map(formatFeatureLabel),
    interiorFeatures: buildingInfo.interiorFeatures.map(formatFeatureLabel),
    appliances: buildingInfo.appliances.map(formatFeatureLabel),
    associationFee: buildingInfo.associationFee,
    associationFeeFrequency: buildingInfo.associationFeeFrequency,
    associationFeeIncludes: buildingInfo.associationFeeIncludes.map(formatFeatureLabel),
  };
}

/**
 * GET /api/buildings?streetNumber=157&streetName=W+57th+Street&postalCode=10019&buildingName=One57
 *
 * Returns building-level data: info, active listings (sale + rental), closed sales, aggregate stats.
 *
 * Strategy:
 * 1. Query Trestle for ALL statuses at address (not just Active/Closed) to get building info
 * 2. Separate into active/available vs closed for display
 * 3. If initial query returns 0, retry without postal code (fallback)
 * 4. Track gated records count for VOW login prompt
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
    const dirPrefix = dirMatch ? dirMatch[1].toUpperCase().charAt(0) : null; // "W", "E", "N", "S"
    if (dirMatch) coreStreetName = coreStreetName.replace(DIR_PREFIXES, '');
    coreStreetName = coreStreetName.replace(SUFFIXES, '').trim();
    // Trestle stores street names in UPPERCASE — OData contains() is case-sensitive
    const coreStreetNameUpper = coreStreetName.toUpperCase();

    // ── 1. Query DB for all listings at this address (non-blocking) ──
    let dbListings: Awaited<ReturnType<typeof prisma.listing.findMany>> = [];
    try {
      const addressConditions: Record<string, unknown>[] = [
        { path: ['StreetNumber'], equals: cleanStreetNumber },
      ];
      if (cleanPostalCode) {
        addressConditions.push({ path: ['PostalCode'], equals: cleanPostalCode });
      }

      dbListings = await prisma.listing.findMany({
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
              address: {
                path: ['StreetName'],
                string_contains: coreStreetNameUpper,
              },
            },
          ],
        },
        orderBy: { list_price: 'desc' },
        take: 50,
      });
    } catch (dbErr) {
      console.warn('[/api/buildings] DB query failed, continuing with Trestle only:', dbErr);
    }

    // Canonical status helpers — was `new Set(['Active', 'ActiveUnderContract', 'Coming Soon'])`
    // which included a space-formatted 'Coming Soon' that never matched DB values.
    const activeListings = dbListings.filter((l) => isActiveDisplayStatus(l.status));
    const closedListings = dbListings.filter((l) => l.status === Status.CLOSED);

    // ── 2. Fetch from Trestle — ALL records at this address ──
    // Single broad query: no status filter, get everything, then separate
    let allTrestleRecords: TrestleRecord[] = [];
    const gatedRecordsCount = 0; // Records that exist but are gated (VOW prompt)

    try {
      const token = await getAccessToken();
      const zipFilter = cleanPostalCode ? ` and PostalCode eq '${cleanPostalCode}'` : '';
      // Add direction prefix to filter if available (reduces false positives)
      const dirFilter = dirPrefix ? ` and StreetDirPrefix eq '${dirPrefix}'` : '';
      const addressFilter = `StreetNumber eq '${cleanStreetNumber}' and contains(StreetName,'${coreStreetNameUpper}')${dirFilter}${zipFilter}`;

      // Fetch the first 10 media rows (not 1): getPhotoUrl scans for the first
      // real PHOTO via classifyMediaItem, and Trestle often orders a FloorPlan at
      // Order 0. With $top=1 a floorplan-first listing returned only that row and
      // getPhotoUrl (no media[0] fallback) yielded null — the unit lost its
      // thumbnail. 10 rows clears any realistic run of leading floorplans. (Codex #482)
      const MEDIA_EXPAND = "Media($select=MediaURL,MediaCategory,Order,PreferredPhotoYN;$top=10;$orderby=Order)";
      const allParams = new URLSearchParams({
        $filter: addressFilter,
        $select: BUILDING_SELECT,
        $expand: MEDIA_EXPAND,
        $orderby: 'ListPrice desc',
        $top: '60',
      });

      let allRes = await fetch(`${TRESTLE_URL}/odata/Property?${allParams}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        next: { revalidate: 3600 },
      });

      // If direction prefix caused 0 results, retry without it
      if (allRes.ok) {
        const data = await allRes.json();
        const rawRecords: TrestleRecord[] = data.value || [];

        if (rawRecords.length === 0 && dirPrefix) {
          // Fallback: drop direction prefix
          const fallbackFilter = `StreetNumber eq '${cleanStreetNumber}' and contains(StreetName,'${coreStreetNameUpper}')${zipFilter}`;
          const fallbackParams = new URLSearchParams({
            $filter: fallbackFilter,
            $select: BUILDING_SELECT,
            $expand: MEDIA_EXPAND,
            $orderby: 'ListPrice desc',
            $top: '60',
          });
          const fallbackRes = await fetch(`${TRESTLE_URL}/odata/Property?${fallbackParams}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            next: { revalidate: 3600 },
          });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            allTrestleRecords = fallbackData.value || [];
          }
        } else {
          allTrestleRecords = rawRecords;
        }

        // If STILL 0 results and we have a postal code, try without it
        if (allTrestleRecords.length === 0 && cleanPostalCode) {
          const noZipFilter = `StreetNumber eq '${cleanStreetNumber}' and contains(StreetName,'${coreStreetNameUpper}')`;
          const noZipParams = new URLSearchParams({
            $filter: noZipFilter,
            $select: BUILDING_SELECT,
            $expand: MEDIA_EXPAND,
            $orderby: 'ListPrice desc',
            $top: '60',
          });
          const noZipRes = await fetch(`${TRESTLE_URL}/odata/Property?${noZipParams}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            next: { revalidate: 3600 },
          });
          if (noZipRes.ok) {
            const noZipData = await noZipRes.json();
            allTrestleRecords = noZipData.value || [];
          }
        }
      } else if (allRes.status === 400) {
        // OData filter error — try simpler filter without direction
        const simpleFilter = `StreetNumber eq '${cleanStreetNumber}' and contains(StreetName,'${coreStreetNameUpper}')`;
        const simpleParams = new URLSearchParams({
          $filter: simpleFilter,
          $select: BUILDING_SELECT,
          $expand: MEDIA_EXPAND,
          $orderby: 'ListPrice desc',
          $top: '60',
        });
        allRes = await fetch(`${TRESTLE_URL}/odata/Property?${simpleParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        });
        if (allRes.ok) {
          const data = await allRes.json();
          allTrestleRecords = data.value || [];
        }
      }

      // gatedRecordsCount stays 0 — IDX feed already excludes gated listings
    } catch (trestleErr) {
      console.warn('[/api/buildings] Trestle fetch error:', trestleErr);
    }

    // Silent upsert — populate building DB without triggering alerts
    const bKey = allTrestleRecords[0]?.BuildingKeyNumeric;
    if (bKey) {
      upsertBuildingFromRecords(Number(bKey), allTrestleRecords).catch(() => {});
    }

    // Extract building-level info from ALL records BEFORE gate filtering.
    // Building metadata (year, stories, amenities) is building-level, not listing-level —
    // a closed sale from 2020 still tells us the building has an elevator.
    const buildingInfo = extractBuildingInfo(allTrestleRecords);

    // Now filter for individual listing display (Closed > 24h removed per REBNY RLS Sec. 2.05)
    allTrestleRecords = allTrestleRecords.filter(
      (r) => checkDistributionGates(r as Record<string, unknown>).displayable
    );

    // Separate records by status — Trestle returns either canonical or
    // legacy space-formatted values. isActiveDisplayStatus accepts both.
    // For closed: only Closed/Sold (buildings history UI shows
    // completed transactions, not withdrawn/expired listings).
    const trestleActive = allTrestleRecords.filter((r) =>
      isActiveDisplayStatus(r.MlsStatus || r.StandardStatus || '')
    );
    const trestleClosed = allTrestleRecords.filter((r) => {
      const status = String(r.MlsStatus || r.StandardStatus || '');
      return status === Status.CLOSED || status === Status.SOLD;
    });

    // ── 3. Merge active units (Trestle + DB) ──
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
      listingType: string;
      photoUrl: string | null;
    }> = [];

    for (const r of trestleActive) {
      const id = String(r.ListingKey || r.ListingId);
      const mlsId = String(r.ListingId || '');
      if (seenIds.has(mlsId)) continue;
      seenIds.add(mlsId);
      const propType = String(r.PropertyType || '').toLowerCase();
      const listingType = propType.includes('residential lease') || propType.includes('rental') ? 'rent' : 'sale';
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
        status: String(r.StandardStatus || r.MlsStatus || 'Active'),
        listingType,
        photoUrl: getPhotoUrl(r),
      });
    }

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
        propertyType: mapPropertyTypeToDisplay((l.features as Record<string, unknown>)?.CommonInterest as string | undefined, l.property_sub_type, l.property_type || ''),
        office: '',
        // Schema-forced narrowing only (listings.status became nullable).
        // Behaviour is identical for every row this loop can see.
        status: l.status ?? '',
        listingType: l.listing_type || 'sale',
        photoUrl: (() => {
          const media = l.media as unknown[];
          if (!Array.isArray(media) || media.length === 0) return null;
          // Find first photo (skip floor plans, videos, virtual tours)
          const photo = (media as Record<string, unknown>[]).find(m => classifyMediaItem(m) === 'photo');
          if (!photo) return null;
          const url = photo?.url || photo?.MediaURL;
          return url ? `/api/media/proxy?url=${encodeURIComponent(String(url))}` : null;
        })(),
      });

      // Extract building info from DB
      const features = l.features as Record<string, unknown> | null;
      if (!buildingInfo.buildingName && addr.BuildingName) buildingInfo.buildingName = String(addr.BuildingName);
      if (!buildingInfo.yearBuilt && features?.YearBuilt) buildingInfo.yearBuilt = Number(features.YearBuilt);
      if (!buildingInfo.storiesTotal && features?.StoriesTotal) buildingInfo.storiesTotal = Number(features.StoriesTotal);
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
        propertyType: mapPropertyTypeToDisplay((l.features as Record<string, unknown>)?.CommonInterest as string | undefined, l.property_sub_type, l.property_type || ''),
        office: '',
        source: 'mls',
      });
    }

    // ── ACRIS public-record closed sales — the ONLY closed-sale source a PUBLIC
    // route may ship. Cotality-API/MLS closed rows (source:'mls' above) and closed
    // rentals are withheld here by the visibility contract; they remain available
    // to agent/internal/report surfaces (Backend-Search-6/7). ──
    try {
      const borough = boroughFromPostalCode(postalCode || '');
      const bbl = await lookupBBL(cleanStreetNumber, streetName, borough);
      if (bbl) {
        const rawAcris = await fetchAcrisSales(bbl);
        // No dedup against the MLS rows: public output is ACRIS-only (the MLS
        // rows are withheld below), so deduping ACRIS against a to-be-withheld
        // MLS twin would drop the only public-allowed record for that sale.
        for (const a of rawAcris) {
          saleHistory.push({
            id: a.id,
            mlsId: '',
            closePrice: a.closePrice,
            beds: 0,
            baths: 0,
            sqft: 0,
            unit: a.unit,
            closeDate: a.closeDate,
            propertyType: '',
            office: 'NYC ACRIS Public Records',
            source: 'acris',
          });
        }
      }
    } catch (err) {
      console.warn('[/api/buildings] ACRIS fetch error:', err);
    }

    // Audience-aware visibility: this is a PUBLIC route, so ship ACRIS closed_sold
    // ONLY. resolveVisibility blocks MLS/Cotality closed prices and closed rentals
    // from public sale history (sold vs rented never collapsed). Agent/internal/
    // report surfaces are unaffected.
    const publicSaleHistory = saleHistory.filter((s) =>
      resolveVisibility({
        audience: 'public',
        status: 'closed_sold',
        transactionType: 'sale',
        source: s.source === 'acris' ? 'acris' : 'mls',
        usage: 'comp',
      }).allowed,
    );
    saleHistory.length = 0;
    saleHistory.push(...publicSaleHistory);

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

    const formatted = formatAmenities(buildingInfo);

    return NextResponse.json({
      success: true,
      building: {
        name: buildingInfo.buildingName,
        address: `${cleanStreetNumber} ${streetName}`,
        postalCode: cleanPostalCode || postalCode || '',
        yearBuilt: buildingInfo.yearBuilt,
        storiesTotal: buildingInfo.storiesTotal,
        totalUnits: buildingInfo.totalUnits,
        commonInterest: buildingInfo.commonInterest,
        ownershipType: buildingInfo.ownershipType,
        structureType: buildingInfo.structureType,
        newConstruction: buildingInfo.newConstruction,
        taxAnnualAmount: buildingInfo.taxAnnualAmount,
        amenities: formatted.amenities,
        petPolicy: formatted.petPolicy,
        view: formatted.view,
        parking: formatted.parking,
        heating: formatted.heating,
        cooling: formatted.cooling,
        flooring: formatted.flooring,
        interiorFeatures: formatted.interiorFeatures,
        appliances: formatted.appliances,
        associationFee: formatted.associationFee,
        associationFeeFrequency: formatted.associationFeeFrequency,
        associationFeeIncludes: formatted.associationFeeIncludes,
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
      gatedRecordsCount,
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
