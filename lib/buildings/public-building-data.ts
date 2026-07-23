/**
 * Canonical PUBLIC building data — ONE shared server function for the
 * /api/buildings route AND the /buildings/[slug] page + generateMetadata.
 *
 * Neon-quiet (2026-07-23). AUTHORITY: Cotality API → One Cycle sync → Neon
 * operational copy → THIS CACHED READ → Vercel cache → visitors. Live
 * evidence: crawler-driven building traffic (121 /api/buildings + 179
 * building pages in 6h, every displayed execution a cache MISS) was reaching
 * Neon (~every 3 min) via prisma.listing.findMany — enough on its own to
 * block the 5-minute autosuspend window. This module makes the assembly a
 * PURE READ (the dormant fire-and-forget building upsert was removed — see
 * route) and serves it through the Next data cache keyed by canonical
 * building identity: repeated requests for the same building execute ZERO
 * Prisma/Trestle work.
 *
 * The payload is JSON-safe by construction (it is exactly what the route
 * already serialized through NextResponse.json — no Date/BigInt/Decimal
 * instances), so the #523→#528 serialization hazard does not apply.
 */
import { getPrimaryPhoto, classifyMediaItem } from '@/lib/media/listing-media-resolver';
import prisma from '@/lib/prisma';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapPropertyTypeToDisplay } from '@/lib/idx/public-dto';
import { isActiveDisplayStatus, Status } from '@/lib/compliance/status';
import { lookupBBL, fetchAcrisSales, boroughFromPostalCode } from '@/lib/buildings/acris-building-sales';
import { resolveVisibility } from '@/lib/search/visibility-contract';
import { buildAddressKey } from '@/lib/listings/dedupe-crm-vs-idx';
import { cachedPublicRead, buildingCacheTag, BUILDING_MANIFEST_TAG, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

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

// ─────────────────────────────────────────────────────────────────────────
// BUILDING MANIFEST — the Neon layer of the building payload, shared across
// ALL buildings (Neon-quiet 2026-07-23, distinct-building correction).
//
// Why: per-building request-time findMany meant a crawl of N DISTINCT
// buildings executed N Neon queries (the measured ~3-min wake pattern).
// The manifest shards the gated listing population by the FIRST CHARACTER
// of the street number (NYC street numbers start with 1-9/0 → ≤ ~10 shards),
// so ANY building crawl — 100 or 10,000 distinct buildings — performs at
// most ~10 bounded Neon queries per sync window, then zero.
//
// Layers preserved: this manifest replaces ONLY the Neon layer. The live
// Cotality/Trestle layer and the ACRIS public-record layer still run
// per-building (they are not Neon and Cotality remains the sole listing
// truth). CRM exclusives (SL-/RL-), which exist only in Neon, stay visible
// through the manifest.
// ─────────────────────────────────────────────────────────────────────────

interface ManifestAddress {
  StreetNumber: string;
  StreetName: string;
  PostalCode: string;
  UnitNumber: string;
  BuildingName: string;
}

export interface ManifestListing {
  id: string;
  listing_id: string;
  status: string;
  list_price: number;
  bedrooms_total: number;
  bathrooms_full: number;
  bathrooms_half: number;
  living_area: number;
  property_type: string;
  property_sub_type: string;
  listing_type: string;
  address: ManifestAddress;
  features: { CommonInterest: string | null; YearBuilt: number | null; StoriesTotal: number | null };
  /** Precomputed first-photo proxy URL (same classifyMediaItem logic the
   *  route used inline) — the heavy media JSON never enters the cache. */
  photoUrl: string | null;
}

export { BUILDING_MANIFEST_TAG }; // canonical owner: lib/cache/public-cache

/** Deterministic keyset page size within a shard (listing_id is the unique
 *  cursor). COMPLETENESS IS STRUCTURAL: pagination runs to exhaustion — no
 *  fixed take can truncate a shard. Past the explicit ceiling the build
 *  THROWS (an explicit failure, never a silently incomplete payload). */
export const MANIFEST_PAGE_SIZE = 5000;
export const MANIFEST_MAX_PAGES = 20; // 100k rows/shard — ~22× today's largest shard

/** Slim row shape returned by the manifest page select (Decimal-bearing
 *  columns stay `unknown` and are coerced with Number() in the mapper —
 *  the cached ManifestListing carries primitives only). */
interface ManifestPageRow {
  id: unknown;
  listing_id: string;
  status: string;
  list_price: unknown;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: unknown;
  property_type: string | null;
  property_sub_type: string | null;
  listing_type: string | null;
  address: unknown;
  features: unknown;
  media: unknown;
}

async function buildBuildingManifestShard(shard: string): Promise<ManifestListing[]> {
  const rows: ManifestPageRow[] = [];
  let cursor: string | null = null;
  let complete = false;
  for (let page = 0; page < MANIFEST_MAX_PAGES; page++) {
    const batch = (await prisma.listing.findMany({
      where: {
        AND: [
          { idx_display_yn: true },
          { owner_opt_out: false },
          { internet_entire_listing_display_yn: true },
          { participant_only: false },
          { address: { path: ['StreetNumber'], string_starts_with: shard } },
        ],
      },
      select: {
        id: true, listing_id: true, status: true, list_price: true,
        bedrooms_total: true, bathrooms_full: true, bathrooms_half: true,
        living_area: true, property_type: true, property_sub_type: true,
        listing_type: true, address: true, features: true, media: true,
      },
      orderBy: { listing_id: 'asc' },
      take: MANIFEST_PAGE_SIZE,
      ...(cursor ? { cursor: { listing_id: cursor }, skip: 1 } : {}),
    })) as unknown as ManifestPageRow[];
    rows.push(...batch);
    if (batch.length < MANIFEST_PAGE_SIZE) { complete = true; break; }
    cursor = String(batch[batch.length - 1].listing_id);
  }
  if (!complete) {
    // EXPLICIT failure — never a successful truncated building payload.
    throw new Error(
      `[building-manifest] OVERFLOW: shard "${shard}" exceeds ${MANIFEST_PAGE_SIZE * MANIFEST_MAX_PAGES} rows — refusing to serve an incomplete manifest.`,
    );
  }
  return rows.map((l): ManifestListing => {
    const addr = (l.address ?? {}) as Record<string, unknown>;
    const features = (l.features ?? {}) as Record<string, unknown>;
    const media = l.media as unknown[];
    let photoUrl: string | null = null;
    if (Array.isArray(media) && media.length > 0) {
      const photo = (media as Record<string, unknown>[]).find((m) => classifyMediaItem(m) === 'photo');
      const url = photo?.url || photo?.MediaURL;
      photoUrl = url ? `/api/media/proxy?url=${encodeURIComponent(String(url))}` : null;
    }
    return {
      id: String(l.id),
      listing_id: l.listing_id,
      status: l.status,
      list_price: Number(l.list_price ?? 0),
      bedrooms_total: l.bedrooms_total || 0,
      bathrooms_full: l.bathrooms_full || 0,
      bathrooms_half: l.bathrooms_half || 0,
      living_area: l.living_area ? Number(l.living_area) : 0,
      property_type: l.property_type || '',
      property_sub_type: l.property_sub_type || '',
      listing_type: l.listing_type || 'sale',
      address: {
        StreetNumber: String(addr.StreetNumber ?? ''),
        StreetName: String(addr.StreetName ?? ''),
        PostalCode: String(addr.PostalCode ?? ''),
        UnitNumber: String(addr.UnitNumber ?? ''),
        BuildingName: String(addr.BuildingName ?? ''),
      },
      features: {
        CommonInterest: features.CommonInterest != null ? String(features.CommonInterest) : null,
        YearBuilt: features.YearBuilt != null ? Number(features.YearBuilt) : null,
        StoriesTotal: features.StoriesTotal != null ? Number(features.StoriesTotal) : null,
      },
      photoUrl,
    };
  });
}

/**
 * Cached manifest shard. Tagged with the manifest tag AND the coarse search
 * tag: when a sync changes ANYTHING, the shard refills on next use — that is
 * ONE bounded query per shard per sync window (≤ ~10 total), regardless of
 * how many distinct buildings are crawled. Per-building payload entries do
 * NOT carry the search tag (see getBuildingDataCached).
 */
function getBuildingManifestShard(shard: string): Promise<ManifestListing[]> {
  return cachedPublicRead(
    buildBuildingManifestShard,
    ['building-manifest'],
    { tags: [BUILDING_MANIFEST_TAG, SEARCH_CACHE_TAG] },
  )(shard);
}

/**
 * CANONICAL building-ownership classifier (Maya 2026-07-23, approved rule).
 *
 * The displayed type is determined by the BUILDING'S OWNERSHIP STRUCTURE —
 * never by whether the unit is currently offered for sale or rent:
 *   Condominium → Condo · Stock Cooperative → Co-op · Condop → Condop ·
 *   Rental / Apartment Building / no individually owned units → Rental Building.
 * Priority: unit CommonInterest → building CommonInterest → unit
 * OwnershipType → building OwnershipType. Transaction type may group
 * sale-vs-rent and format prices, but NEVER overrides ownership.
 */
export function classifyBuildingOwnership(signals: {
  commonInterest?: string | null;
  buildingCommonInterest?: string | null;
  ownershipType?: string | null;
  buildingOwnershipType?: string | null;
}): 'Condo' | 'Co-op' | 'Condop' | 'Rental Building' | null {
  const chain = [
    signals.commonInterest,
    signals.buildingCommonInterest,
    signals.ownershipType,
    signals.buildingOwnershipType,
  ];
  for (const v of chain) {
    const s = String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) continue;
    if (s.includes('condop')) return 'Condop';
    if (s.includes('condominium') || s === 'condo') return 'Condo';
    if (s.includes('cooperative') || s === 'coop') return 'Co-op';
    if (s.includes('rental') || s.includes('apartmentbuilding')) return 'Rental Building';
  }
  return null;
}

/**
 * Unit-card display type. Ownership classification first (see above). When
 * NO ownership signal exists anywhere: a LEASE unit is by definition in a
 * building with no individually owned units → 'Rental Building' (never
 * 'Apartment' merely because PropertyType is Residential Lease); a SALE
 * unit falls to the canonical mapper (Townhouse/House/etc. unchanged).
 */
function unitDisplayType(
  rowCommonInterest: string | null | undefined,
  buildingCommonInterest: string | null | undefined,
  rowOwnershipType: string | null | undefined,
  buildingOwnershipType: string | null | undefined,
  isRent: boolean,
  propertySubType: string | null | undefined,
  legacy: string,
): string {
  const own = classifyBuildingOwnership({
    commonInterest: rowCommonInterest,
    buildingCommonInterest,
    ownershipType: rowOwnershipType,
    buildingOwnershipType,
  });
  if (own) return own;
  if (isRent) return 'Rental Building';
  return mapPropertyTypeToDisplay(rowCommonInterest ?? undefined, propertySubType ?? null, legacy);
}

/** Assemble the complete public building payload (PURE READ — no Neon writes). */
async function buildBuildingPayload(
  streetNumber: string,
  streetName: string,
  postalCode: string | null,
) {
  // Canonical identity is number+street+zip. buildingName is display-only and
  // deliberately NOT a parameter: unstable_cache keys include the wrapped
  // function ARGS, so passing it would mint a separate cache entry (and a
  // separate Neon-visible assembly) per name variant of the SAME building.
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

    // ── 1. DB layer via the shared building MANIFEST (zero per-building Neon
    // queries — see the manifest block above). Matching semantics identical to
    // the old per-building SQL: StreetNumber equals + StreetName contains core
    // + optional PostalCode equals; then the old orderBy list_price desc,
    // take 50.
    let dbListings: ManifestListing[] = [];
    try {
      const shard = cleanStreetNumber.charAt(0);
      const manifest = shard ? await getBuildingManifestShard(shard) : [];
      dbListings = manifest
        .filter((l) => {
          const a = l.address;
          if (a.StreetNumber !== cleanStreetNumber) return false;
          if (cleanPostalCode && a.PostalCode !== cleanPostalCode) return false;
          return a.StreetName.toUpperCase().includes(coreStreetNameUpper);
        })
        .sort((x, y) => y.list_price - x.list_price)
        .slice(0, 50);
    } catch (dbErr) {
      // OVERFLOW is a structural completeness failure — PROPAGATE (explicit
      // fail; never a silently DB-truncated payload). Transient DB errors keep
      // the PRE-EXISTING degrade production has today: continue with the live
      // Cotality/Trestle + ACRIS layers so the page stays available.
      if (dbErr instanceof Error && dbErr.message.includes('[building-manifest] OVERFLOW')) throw dbErr;
      console.warn('[/api/buildings] DB manifest lookup failed, continuing with Trestle only:', dbErr);
    }

    // Canonical status helpers — was `new Set(['Active', 'ActiveUnderContract', 'Coming Soon'])`
    // which included a space-formatted 'Coming Soon' that never matched DB values.
    const activeListings = dbListings.filter((l) => isActiveDisplayStatus(l.status));
    // NOTE (Neon-quiet 2026-07-23): the old DB-closed layer (status=Closed
    // rows pushed as source:'mls' sale history) is GONE from this public
    // payload — the public visibility contract below withholds every
    // source:'mls' closed row anyway (ACRIS-only public sale history), so
    // those rows never appeared in public output. Dropping them lets the
    // manifest skip the heavy raw_data JSON entirely. Agent/internal
    // surfaces are unaffected (they do not use this public module).

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

    // Neon-quiet (2026-07-23): the fire-and-forget upsertBuildingFromRecords
    // write path was REMOVED from this public read. Production proof it was
    // DORMANT: buildings + building_units have 0 rows and 0 inserts/updates
    // EVER (BuildingKeyNumeric is not in the public $select). Building/unit
    // synchronization is now exclusively owned by an explicitly-run sync
    // workflow (lib/buildings/upsert stays for that owner). A public GET
    // must never write Neon.

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
      /** Truthful per-row provenance (Maya 2026-07-23): the effective public
       *  inventory mixes unsuppressed Cotality/Trestle listings with Mallan
       *  exclusives published directly by Mallan Real Estate Inc. */
      source: 'cotality-trestle' | 'mallan-exclusive';
      /** Present ONLY on a Mallan exclusive whose reconciled Cotality twin is
       *  suppressed while the local-publication override is active. */
      publication?: {
        authority: 'mallan-local';
        reconciledCotalityId: string;
        cotalityDisplaySuppressed: true;
      };
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
        propertyType: unitDisplayType(r.CommonInterest as string | undefined, buildingInfo.commonInterest, r.OwnershipType as string | undefined, buildingInfo.ownershipType, listingType === 'rent', r.PropertySubType as string | null, String(r.PropertySubType || r.PropertyType || '')),
        office: String(r.ListOfficeName || ''),
        status: String(r.StandardStatus || r.MlsStatus || 'Active'),
        listingType,
        photoUrl: getPhotoUrl(r),
        source: 'cotality-trestle',
      });
    }

    for (const l of activeListings) {
      if (seenIds.has(l.listing_id)) continue;
      seenIds.add(l.listing_id);
      const addr = l.address;
      const isMallanExclusive = l.listing_id.startsWith('SL-') || l.listing_id.startsWith('RL-');
      activeUnits.push({
        id: String(l.id),
        mlsId: l.listing_id,
        listPrice: Number(l.list_price),
        beds: l.bedrooms_total || 0,
        baths: l.bathrooms_full || 0,
        bathsHalf: l.bathrooms_half || 0,
        sqft: l.living_area ? Number(l.living_area) : 0,
        unit: String(addr.UnitNumber || ''),
        propertyType: unitDisplayType(l.features.CommonInterest, buildingInfo.commonInterest, null, buildingInfo.ownershipType, (l.listing_type || 'sale') === 'rent', l.property_sub_type, mapPropertyTypeToDisplay(l.features.CommonInterest ?? undefined, l.property_sub_type, l.property_type || '')),
        // Maya rule 7: the effective public Mallan record is attributed to
        // Mallan Real Estate Inc., never to Cotality merely because a
        // reconciled Cotality twin exists.
        office: isMallanExclusive ? 'Mallan Real Estate Inc.' : '',
        status: l.status,
        listingType: l.listing_type || 'sale',
        photoUrl: l.photoUrl,
        source: isMallanExclusive ? 'mallan-exclusive' : 'cotality-trestle',
      });

      // Extract building info from the DB manifest layer
      if (!buildingInfo.buildingName && addr.BuildingName) buildingInfo.buildingName = String(addr.BuildingName);
      if (!buildingInfo.yearBuilt && l.features.YearBuilt) buildingInfo.yearBuilt = l.features.YearBuilt;
      if (!buildingInfo.storiesTotal && l.features.StoriesTotal) buildingInfo.storiesTotal = l.features.StoriesTotal;
    }

    // ── 3b. Mallan-exclusive local-publication override (Maya 2026-07-23) ──
    // An SL-/RL- exclusive and its Cotality/Trestle twin are ONE listing
    // identity with two reconciled representations. While the local override
    // is active the LOCAL record is the authoritative public representation:
    // the Cotality twin is suppressed from display (NOT deleted — it stays in
    // Neon as the reconciled upstream representation for feed identity,
    // compliance history and future fallback), the listing counts once, and
    // the LOCAL asking price / sqft / status feed the statistics.
    //
    // Identity evidence: the shared site-wide rule (same building street
    // atoms + REQUIRED unit + postal, canonicalized) via buildAddressKey —
    // never approximate address text alone; rows without a unit are never
    // reconciled. When the override ends (the local row leaves the active
    // set), the still-eligible Cotality twin re-enters this merge naturally
    // on the next build — never both at once.
    {
      const keyForUnit = (unit: string) =>
        buildAddressKey({
          streetNumber: cleanStreetNumber,
          streetName,
          unitNumber: unit,
          postalCode: cleanPostalCode || postalCode || '',
        });
      const groups = new Map<string, number[]>();
      activeUnits.forEach((u, i) => {
        const k = keyForUnit(u.unit);
        if (k === null) return;
        const g = groups.get(k);
        if (g) g.push(i); else groups.set(k, [i]);
      });
      const suppressed = new Set<number>();
      for (const idxs of groups.values()) {
        const mallanIdxs = idxs.filter((i) => activeUnits[i].source === 'mallan-exclusive');
        if (mallanIdxs.length === 0) continue;
        const cotalityIdxs = idxs.filter((i) => activeUnits[i].source !== 'mallan-exclusive');
        if (cotalityIdxs.length === 0) continue;
        const winner = activeUnits[mallanIdxs[0]];
        winner.publication = {
          authority: 'mallan-local',
          reconciledCotalityId: activeUnits[cotalityIdxs[0]].mlsId,
          cotalityDisplaySuppressed: true,
        };
        for (const i of cotalityIdxs) suppressed.add(i);
      }
      if (suppressed.size > 0) {
        const kept = activeUnits.filter((_, i) => !suppressed.has(i));
        activeUnits.length = 0;
        activeUnits.push(...kept);
      }
    }

    // ── 4. Merge sale history ──
    // Maya 2026-07-23 source-boundary rules: ACRIS rows are RECORDED
    // TRANSFERS (public-record documents), never verified unit sales.
    // beds/baths/sqft are null (missing stays missing — never 0), and every
    // ACRIS row carries documentId/bbl/retrievedAt provenance + an explicit
    // 'recorded-transfer' label.
    const saleHistory: Array<{
      id: string;
      mlsId: string;
      closePrice: number;
      beds: number | null;
      baths: number | null;
      sqft: number | null;
      unit: string;
      closeDate: string | null;
      propertyType: string;
      office: string;
      source: string;
      label?: 'recorded-transfer';
      documentId?: string;
      bbl?: string;
      retrievedAt?: string;
    }> = [];

    // Canonical ACRIS layer (explicit provenance; saleHistory stays as the
    // compatibility alias carrying the same rows).
    const recordedTransfers: Array<{
      id: string;
      documentId: string;
      bbl: string;
      amount: number;
      recordedDate: string | null;
      unit: string;
      beds: null;
      baths: null;
      sqft: null;
      source: 'acris';
      label: 'recorded-transfer';
      retrievedAt: string;
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
        propertyType: unitDisplayType(r.CommonInterest as string | undefined, buildingInfo.commonInterest, r.OwnershipType as string | undefined, buildingInfo.ownershipType, false, r.PropertySubType as string | null, String(r.PropertySubType || r.PropertyType || '')),
        office: String(r.ListOfficeName || ''),
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
          // No inference: unit stays blank, beds/baths/sqft stay null. The
          // document amount is NOT presented as a verified unit closing price.
          saleHistory.push({
            id: a.id,
            mlsId: '',
            closePrice: a.closePrice,
            beds: null,
            baths: null,
            sqft: null,
            unit: a.unit,
            closeDate: a.closeDate,
            propertyType: '',
            office: 'NYC ACRIS Public Records',
            source: 'acris',
            label: 'recorded-transfer',
            documentId: a.documentId ?? String(a.id).replace(/^acris-/, ''),
            bbl: a.bbl ?? bbl,
            retrievedAt: a.retrievedAt ?? new Date().toISOString(),
          });
          recordedTransfers.push({
            id: a.id,
            documentId: a.documentId ?? String(a.id).replace(/^acris-/, ''),
            bbl: a.bbl ?? bbl,
            amount: a.amount ?? a.closePrice,
            recordedDate: a.recordedDate ?? a.closeDate,
            unit: a.unit,
            beds: null,
            baths: null,
            sqft: null,
            source: 'acris',
            label: 'recorded-transfer',
            retrievedAt: a.retrievedAt ?? new Date().toISOString(),
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
    recordedTransfers.sort((a, b) => {
      if (!a.recordedDate && !b.recordedDate) return 0;
      if (!a.recordedDate) return 1;
      if (!b.recordedDate) return -1;
      return new Date(b.recordedDate).getTime() - new Date(a.recordedDate).getTime();
    });

    // ── 5. Compute aggregate stats — Cotality ACTIVE listings ONLY ──
    // Maya 2026-07-23: ACRIS recorded-transfer amounts must never enter
    // listing/unit-market statistics (no reliable unit match, amounts may
    // cover whole buildings). avgPricePerSqft uses ONE consistent population:
    // active units that carry BOTH a price and a square footage. Empty
    // populations return null — zero is never substituted for missing data.
    const activePriced = activeUnits.filter((u) => u.listPrice > 0);
    const activeSized = activeUnits.filter((u) => u.sqft > 0);
    const activeBoth = activeUnits.filter((u) => u.listPrice > 0 && u.sqft > 0);

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgPrice = activePriced.length > 0 ? Math.round(mean(activePriced.map((u) => u.listPrice))) : null;
    const avgSqft = activeSized.length > 0 ? Math.round(mean(activeSized.map((u) => u.sqft))) : null;
    const avgPricePerSqft = activeBoth.length > 0
      ? Math.round(mean(activeBoth.map((u) => u.listPrice)) / mean(activeBoth.map((u) => u.sqft)))
      : null;

    // (The query-param buildingName display override happens POST-CACHE in
    // getBuildingDataCached — it must not participate in cache identity.)
    const formatted = formatAmenities(buildingInfo);

    return {
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
      // Compatibility alias — same rows as recordedTransfers (ACRIS-only on
      // this public surface), null-not-zero semantics.
      saleHistory,
      recordedTransfers,
      stats: {
        totalActive: activeUnits.length,
        // Compat: numerically the recorded-transfer count (as before).
        totalSales: saleHistory.length,
        // Cotality ACTIVE listings only — see §5 above.
        avgPrice,
        avgSqft,
        avgPricePerSqft,
        active: {
          count: activeUnits.length,
          avgListPrice: avgPrice,
          avgSqft,
          avgPricePerSqft,
        },
        // Count only. Transfer AMOUNTS carry no approved unit-market
        // methodology and ship in no statistic.
        recordedTransfers: { count: recordedTransfers.length },
      },
      gatedRecordsCount,
      sourceAttribution: {
        building: {
          source: 'effective-public-inventory',
          attribution: 'Building facts are derived from the records that supplied them: Cotality/Trestle (REBNY RLS) feed records and Mallan-maintained exclusive records. Feed-supplied facts: Based on information from the REBNY Listing Service.',
        },
        activeUnits: {
          source: 'effective-public-inventory',
          attribution: 'Effective publicly displayed active inventory: unsuppressed Cotality/Trestle (REBNY RLS) listings and Mallan exclusives published directly by Mallan Real Estate Inc. — Licensed Real Estate Broker. Each listing carries its own source; suppressed duplicate feed representations are excluded.',
        },
        recordedTransfers: {
          source: 'nyc-acris',
          attribution: 'NYC ACRIS public records — recorded transfer documents. Amounts are not verified unit-level sale prices; a transfer may cover a whole building or multiple properties.',
        },
        statistics: {
          source: 'mallan-derived',
          attribution: 'Derived by Mallan Real Estate Inc. from the effective publicly displayed active inventory. Suppressed duplicate feed representations and NYC ACRIS recorded transfers are excluded.',
        },
      },
      _compliance: {
        source: 'cotality-trestle+mallan-exclusive+nyc-acris',
        attribution:
          'Active inventory: unsuppressed Cotality/Trestle listings (Based on information from the REBNY Listing Service) and Mallan Real Estate Inc. exclusives. ' +
          'Recorded transfers: NYC ACRIS public records — not verified unit-level sales. ' +
          'Statistics: Derived by Mallan Real Estate Inc. from the effective publicly displayed active inventory; suppressed duplicate feed representations and ACRIS recorded transfers excluded. ' +
          'Data last updated ' + new Date().toISOString().split('T')[0],
        disclaimerRequired: true,
      },
    };
}

export type PublicBuildingPayload = Awaited<ReturnType<typeof buildBuildingPayload>>;

/**
 * Shared cached accessor — the ONLY entry point for public building data.
 * Tagged with the canonical building tag (sync-invalidated when a listing at
 * this building materially changes → its building tag is revalidated by One
 * Cycle); 30-min sync-cadence fallback window. Deliberately NO coarse tag.
 */
export async function getBuildingDataCached(params: {
  streetNumber: string;
  streetName: string;
  postalCode?: string | null;
  buildingName?: string | null;
}): Promise<PublicBuildingPayload> {
  const streetNumber = params.streetNumber.trim();
  const streetName = params.streetName.trim();
  const postalCode = params.postalCode?.trim() || null;
  const payload = await cachedPublicRead(
    buildBuildingPayload,
    ['building-data', streetNumber.toUpperCase(), streetName.toUpperCase(), postalCode ?? ''],
    {
      // EXACT tag only (Neon-quiet distinct-building correction): the coarse
      // search tag would expire EVERY building on EVERY sync that changed any
      // listing, recreating the crawler wake pattern. Sync now revalidates
      // the exact building tags it materially changed (buildingTagFromAddress
      // in lib/idx/sync.ts); everything else stays cached, with the 30-min
      // fallback as the safety net (media-JSON-only changes ride the fallback).
      tags: [buildingCacheTag(streetNumber, streetName, postalCode ?? undefined)],
    },
  )(streetNumber, streetName, postalCode);
  // Display-only decoration, applied POST-CACHE so a bn= query param can
  // never mint a second cache identity (or a second Neon-visible assembly)
  // for the same canonical building.
  const buildingName = params.buildingName?.trim() || null;
  if (buildingName && !payload.building.name) {
    return { ...payload, building: { ...payload.building, name: buildingName } };
  }
  return payload;
}

// ── Wake clustering (sync-driven manifest warm-up) ─────────────────────────

/** Street-number first characters observed in production (census 2026-07-23:
 *  every gated listing starts 1-9). Exotic shards outside this set fill
 *  lazily on first request — bounded by construction. */
export const BUILDING_MANIFEST_SHARDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface ManifestWarmResult {
  shards_warmed: number;
  shards_failed: number;
  duration_ms: number;
}

/**
 * Refill every manifest shard NOW — called by idx-sync immediately after a
 * FULLY SUCCESSFUL run, while the Neon compute is already awake for that
 * sync. This clusters the ≤9 bounded fills into the existing wake window
 * instead of letting lazy fills land scattered across the autosuspend
 * period. When the sync changed nothing (search tag not bumped) every call
 * is a cache HIT and zero Neon queries execute.
 *
 * STRICTLY BEST-EFFORT AND READ-ONLY: failures are counted and logged,
 * never thrown — a warm-up failure can NEVER advance, block, or corrupt
 * feed state (it runs after the SyncState upsert, outside its try/catch,
 * and touches no sync variables).
 */
export async function warmBuildingManifestShards(): Promise<ManifestWarmResult> {
  const t0 = Date.now();
  let warmed = 0;
  let failed = 0;
  for (const shard of BUILDING_MANIFEST_SHARDS) {
    try {
      await getBuildingManifestShard(shard);
      warmed++;
    } catch (err) {
      failed++;
      console.error(
        `[building-manifest] warm-up failed for shard "${shard}" (non-fatal; lazy fill remains):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { shards_warmed: warmed, shards_failed: failed, duration_ms: Date.now() - t0 };
}
