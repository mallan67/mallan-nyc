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
// Durable hero delivery + the ONE public media URL policy. Read-safe helper: it
// needs only R2_PUBLIC_URL and returns null (never throws) so this public read
// path falls back to the source locator instead of crashing.
import { r2PublicUrlForKeyRead } from '@/lib/images/r2';
import { excludeMallanRlsReturnCopies } from '@/lib/listings/mallan-source-identity';

import { isActiveDisplayStatus, Status } from '@/lib/compliance/status';
import { lookupBBL, fetchAcrisSales, boroughFromPostalCode } from '@/lib/buildings/acris-building-sales';
import { resolveVisibility } from '@/lib/search/visibility-contract';
import { cachedPublicRead, buildingCacheTag, BUILDING_MANIFEST_TAG, manifestShardTag } from '@/lib/cache/public-cache';

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
 *  THROWS (an explicit failure, never a silently incomplete payload).
 *
 *  2 MB CORRECTION (Maya 2026-07-24): the production Next data cache
 *  rejects entries over 2 MB — the original design cached a WHOLE shard
 *  (worst case 4,473 rows) as one value, which could exceed the limit,
 *  silently fail to persist, and re-run the Neon read on every distinct
 *  building request (defeating the shed). The cache unit is now ONE PAGE
 *  (1,500 slim rows ≈ well under the limit, guarded by an explicit
 *  serialized-byte ceiling below), keyed by (shard, cursor). */
export const MANIFEST_PAGE_SIZE = 1500;
/** Completeness ceiling in ROWS, not pages (Maya blocker 1, 2026-07-24):
 *  a fixed page count only equals a row bound when every page is full —
 *  dynamic shrink makes that false. The walk runs to cursor exhaustion and
 *  overflows on ACTUAL rows processed. ~17× today's largest shard. */
export const MANIFEST_MAX_ROWS_PER_SHARD = 75_000;
/** Explicit serialized-size ceiling per cached page entry — comfortably
 *  below the production 2 MB data-cache limit. A page over this THROWS
 *  (explicit failure, never a silently-uncacheable entry). */
export const MANIFEST_CACHE_MAX_BYTES = 1_500_000;

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
  // 2 MB correction: the heavy `media` JSON is NO LONGER read — the stored
  // media-summary column (primary_photo_url, maintained by media-sync) is
  // the hero source. The manifest read no longer drags full galleries out
  // of Neon to derive one URL.
  primary_photo_url: string | null;
  /**
   * DURABLE hero object key, preferred over the rotating source locator.
   * Without it the manifest depended on a Cotality URL that re-signs on every
   * fetch — which is what forced that locator to be kept fresh in the DB.
   */
  primary_photo_r2_key: string | null;
}

/** One cached manifest PAGE: bounded rows + the keyset cursor to the next
 *  page (null = shard complete). Each page is its own data-cache entry. */
interface ManifestPageResult {
  rows: ManifestListing[];
  nextCursor: string | null;
  /** Epoch ms when this page was read from Neon — the warm pass counts a
   *  page as freshly persisted ONLY when the verification read returns a
   *  value at least as new as the warm start (an SWR-served stale entry
   *  can NEVER be counted as a fresh warm result). */
  fetchedAt: number;
}

// NOTE (Maya blocker 2, 2026-07-24): there is deliberately NO cross-request
// in-process page cache here. An earlier revision kept pages in module
// memory for 5 minutes to absorb cache-set failures — but that defeated
// IMMEDIATE tag invalidation: a withdrawn / expired / display-disabled /
// opted-out listing could keep rendering from module memory even after the
// data cache was correctly invalidated (across writers with no follow-up
// warm, partial syncs, concurrent requests and other instances). Cache-set
// failures are instead absorbed PER INVOCATION in getCachedManifestPage
// (the resolved fetch value is captured and returned if the cache layer
// throws afterwards) — zero stale retention across requests.

/** Serialized-size guard: an over-limit page THROWS loudly instead of
 *  becoming a silently-uncacheable entry. */
function assertPageCacheable(shard: string, cursor: string | null, page: ManifestPageResult): void {
  const bytes = Buffer.byteLength(JSON.stringify(page), 'utf8');
  if (bytes > MANIFEST_CACHE_MAX_BYTES) {
    throw new Error(
      `[building-manifest] PAGE OVER CACHE LIMIT: shard "${shard}" cursor "${cursor ?? 'START'}" serializes to ${bytes} bytes (> ${MANIFEST_CACHE_MAX_BYTES}). Refusing a silently-uncacheable page.`,
    );
  }
}

/** Execution counter per page-cache key — lets the warm pass distinguish a
 *  PERSISTED cache entry (second call does not re-execute) from a
 *  fallback-live read (set failed; fn re-ran). Bounded by pruning alongside
 *  the memory map. */
const manifestPageExecCount = new Map<string, number>();

function pageKey(shard: string, cursor: string | null): string {
  return `${shard}|${cursor ?? 'START'}`;
}

/** ONE bounded keyset page read from Neon, mapped to slim cacheable rows.
 *  This is the ONLY Neon touch point of the manifest. */
/** Test hook: resets the warm execution counters. */
export function clearManifestPageMemory(): void {
  manifestPageExecCount.clear();
}

async function fetchManifestPage(
  shard: string,
  cursor: string | null,
): Promise<ManifestPageResult> {
  const key = pageKey(shard, cursor);
  manifestPageExecCount.set(key, (manifestPageExecCount.get(key) ?? 0) + 1);
  const batch = (await prisma.listing.findMany({
      where: {
        AND: [
          { idx_display_yn: true },
          { owner_opt_out: false },
          { internet_entire_listing_display_yn: true },
          { participant_only: false },
          // MALLAN RLS RETURN-COPY SUPPRESSION — CHARTER Section 1A.
          //
          // The building manifest is a PUBLIC surface. Without this, Mallan's
          // own returned Cotality row would appear as a separate unit in its own
          // building, next to the local canonical listing. Applied inside the
          // query so it precedes the shard page window, from the same single
          // owner as every other emitter.
          excludeMallanRlsReturnCopies(),
          { address: { path: ['StreetNumber'], string_starts_with: shard } },
        ],
      },
      select: {
        id: true, listing_id: true, status: true, list_price: true,
        bedrooms_total: true, bathrooms_full: true, bathrooms_half: true,
        living_area: true, property_type: true, property_sub_type: true,
        listing_type: true, address: true, features: true,
        // 2 MB correction: the stored media-summary hero (maintained by
        // media-sync) replaces the full `media` JSON read.
        primary_photo_url: true,
        primary_photo_r2_key: true,
      },
      orderBy: { listing_id: 'asc' },
      take: MANIFEST_PAGE_SIZE,
      ...(cursor ? { cursor: { listing_id: cursor }, skip: 1 } : {}),
    })) as unknown as ManifestPageRow[];
  const mapped = batch.map((l): ManifestListing => {
    const addr = (l.address ?? {}) as Record<string, unknown>;
    const features = (l.features ?? {}) as Record<string, unknown>;
    // HERO COTALITYLUTION — durable first, source fallback second.
    //
    // 1. A usable `primary_photo_r2_key` is a DURABLE public object: serve it
    //    directly. No proxy hop, and no dependency on a signed locator that
    //    Cotality re-issues on every fetch.
    // 2. Otherwise fall back to the stored source locator, proxied exactly as
    //    before. The fallback form is deliberately UNCHANGED here: three
    //    hand-built `/api/media/proxy?url=` formulas exist in this area
    //    (:69, here, and buildings/upsert.ts:144) and the building payload is
    //    pinned by a parity test against a second implementation. Consolidating
    //    them onto `toPublicMediaUrl` is a correct but SEPARATE change — doing
    //    it inside this fix silently altered the payload for non-Cotality URLs
    //    (an R2/CRM hero stopped being proxied), which the parity test caught.
    //    Recorded as an open duplicate-formula item rather than smuggled in.
    const durableHero = r2PublicUrlForKeyRead(l.primary_photo_r2_key);
    const photoUrl =
      durableHero ??
      (l.primary_photo_url
        ? `/api/media/proxy?url=${encodeURIComponent(String(l.primary_photo_url))}`
        : null);
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
  let keptRows = mapped;
  let shardComplete = batch.length < MANIFEST_PAGE_SIZE;
  let result: ManifestPageResult = {
    rows: keptRows,
    nextCursor: shardComplete ? null : String(batch[batch.length - 1].listing_id),
    fetchedAt: Date.now(),
  };
  // DYNAMIC SHRINK (Maya 2026-07-24 req 7): if REAL production rows ever
  // serialize past the budget, the page shrinks to fit instead of failing —
  // the keyset walk simply continues from the last kept row. Only the
  // pathological single-row-over-budget page still fails loudly (below).
  while (
    keptRows.length > 1 &&
    Buffer.byteLength(JSON.stringify(result), 'utf8') > MANIFEST_CACHE_MAX_BYTES
  ) {
    keptRows = keptRows.slice(0, Math.ceil(keptRows.length / 2));
    result = {
      rows: keptRows,
      nextCursor: String(keptRows[keptRows.length - 1].listing_id),
      fetchedAt: result.fetchedAt,
    };
    shardComplete = false;
  }
  // Explicit ceiling: a page that could not persist must FAIL LOUDLY, never
  // become a silently-uncacheable entry that re-reads Neon per request.
  assertPageCacheable(shard, cursor, result);
  return result;
}

/**
 * Cached manifest PAGE. Tagged with the manifest tag AND the coarse search
 * tag: when a sync changes ANYTHING, pages refill on next use — bounded
 * keyset queries per sync window regardless of how many distinct buildings
 * are crawled. Each entry is ONE page (2 MB-safe by construction + explicit
 * byte guard). Per-building payload entries do NOT carry the search tag
 * (see getBuildingDataCached).
 */
async function getCachedManifestPage(
  shard: string,
  cursor: string | null,
): Promise<ManifestPageResult> {
  // PER-INVOCATION capture (Maya blocker 2): if the cache backend throws
  // AFTER the wrapped fetch already resolved (the production 2 MB failure
  // shape), return the captured value — the Neon read is never re-run for
  // a cache-set failure, and NO cross-request stale memory is involved.
  let captured: ManifestPageResult | null = null;
  const capturingFetch = async (s: string, c: string | null): Promise<ManifestPageResult> => {
    captured = await fetchManifestPage(s, c);
    return captured;
  };
  try {
    return await cachedPublicRead(
      capturingFetch,
      ['building-manifest-page'],
      // Per-shard invalidation (Maya review of PR #561): pages carry their
      // SHARD tag — writers expire exactly the shards whose listings
      // changed and every other shard's cache survives the cycle. The
      // coarse `search` tag is deliberately ABSENT (it used to expire all
      // nine shards on any listing change anywhere). BUILDING_MANIFEST_TAG
      // remains as the rare full-purge handle. Changes with no address
      // context (media-sync hero/summary updates) ride the 10-min fallback
      // window — same stance as building payloads for media-only changes.
      { tags: [BUILDING_MANIFEST_TAG, manifestShardTag(shard)] },
    )(shard, cursor);
  } catch (err) {
    if (captured !== null) return captured;
    throw err;
  }
}

/** Complete shard = the cached pages walked to CURSOR EXHAUSTION with a
 *  TOTAL-ROW ceiling (Maya blocker 1: a fixed page count is only a row
 *  bound when every page is full — dynamic shrink broke that). Invariants
 *  enforced per nonterminal page: at least one row; the cursor advances;
 *  no cursor ever repeats. Every violation and the row-ceiling overflow
 *  FAIL EXPLICITLY — never a silently truncated manifest. */
export async function getBuildingManifestShard(shard: string): Promise<ManifestListing[]> {
  const rows: ManifestListing[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const pageResult: ManifestPageResult = await getCachedManifestPage(shard, cursor);
    rows.push(...pageResult.rows);
    // Row ceiling is enforced IMMEDIATELY after accumulation — BEFORE the
    // terminal return (Maya boundary fix: a 75,001-row shard whose last
    // page is terminal must still overflow, never succeed).
    if (rows.length > MANIFEST_MAX_ROWS_PER_SHARD) {
      throw new Error(
        `[building-manifest] OVERFLOW: shard "${shard}" exceeds ${MANIFEST_MAX_ROWS_PER_SHARD} rows (${rows.length} processed) — refusing to serve an incomplete manifest.`,
      );
    }
    if (pageResult.nextCursor === null) return rows;
    if (pageResult.rows.length === 0) {
      throw new Error(
        `[building-manifest] EMPTY NONTERMINAL PAGE: shard "${shard}" cursor "${cursor ?? 'START'}" returned 0 rows with a nextCursor — refusing a manifest that cannot progress.`,
      );
    }
    if (pageResult.nextCursor === cursor || seenCursors.has(pageResult.nextCursor)) {
      throw new Error(
        `[building-manifest] CURSOR DID NOT ADVANCE: shard "${shard}" repeated cursor "${pageResult.nextCursor}" — refusing a manifest that cannot terminate.`,
      );
    }
    seenCursors.add(pageResult.nextCursor);
    cursor = pageResult.nextCursor;
  }
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
      // ALL structural manifest invariant failures propagate (OVERFLOW,
      // EMPTY NONTERMINAL PAGE, CURSOR DID NOT ADVANCE, PAGE OVER CACHE
      // LIMIT) — never a silently degraded incomplete payload. Ordinary
      // Neon outages (no marker) still degrade to the Trestle layers.
      if (dbErr instanceof Error && dbErr.message.includes('[building-manifest]')) throw dbErr;
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
      // E-0: this expand serves PUBLIC building-page thumbnails (`photoUrl` →
      // `/api/buildings` → `/buildings/[slug]`), so it needs the provider media
      // display authorization like every other live media path. It was the last
      // reader without it.
      //
      // Filtered SERVER-side. `ne false` keeps null rows, which is required —
      // null means "not suppressed" — and that is LIVE VERIFIED, not assumed:
      // `ne false` (1,690,414) === `eq true` (1,690,352) + `eq null` (62).
      //
      // A Property-level `checkDistributionGates` already runs below, but that
      // is a LISTING gate; this is the per-media-row one.
      const MEDIA_EXPAND =
        "Media($select=MediaURL,MediaCategory,Order,PreferredPhotoYN,InternetEntireListingDisplayYN;" +
        "$filter=InternetEntireListingDisplayYN ne false;$top=10;$orderby=Order)";
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
      });
    }

    for (const l of activeListings) {
      if (seenIds.has(l.listing_id)) continue;
      seenIds.add(l.listing_id);
      const addr = l.address;
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
        office: '',
        status: l.status,
        listingType: l.listing_type || 'sale',
        photoUrl: l.photoUrl,
      });

      // Extract building info from the DB manifest layer
      if (!buildingInfo.buildingName && addr.BuildingName) buildingInfo.buildingName = String(addr.BuildingName);
      if (!buildingInfo.yearBuilt && l.features.YearBuilt) buildingInfo.yearBuilt = l.features.YearBuilt;
      if (!buildingInfo.storiesTotal && l.features.StoriesTotal) buildingInfo.storiesTotal = l.features.StoriesTotal;
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
    };
}

export type PublicBuildingPayload = Awaited<ReturnType<typeof buildBuildingPayload>>;

/**
 * Shared cached accessor — the ONLY entry point for public building data.
 * Tagged with the canonical building tag (sync-invalidated when a listing at
 * this building materially changes → its building tag is revalidated by One
 * Cycle); 10-min sync-cadence fallback window. Deliberately NO coarse tag.
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
      // in lib/idx/sync.ts); everything else stays cached, with the 10-min
      // fallback as the safety net (media-JSON-only changes ride the fallback).
      //
      // ── WHY THE CONSUMED MANIFEST SHARD TAG IS *NOT* ADDED HERE ───────
      // `buildBuildingPayload` reads `getBuildingManifestShard(shard)`, whose
      // own entry carries `manifestShardTag(shard)`, so at first glance this
      // consumer should carry its dependency's tag. It deliberately does not.
      //
      // A shard is the FIRST CHARACTER of the street number — roughly a tenth
      // of every building on the site. Tagging each building payload with it
      // would mean ONE listing change expires ~10% of all building payloads and
      // re-reads Neon for buildings that did not change. That is precisely the
      // crawler-wake amplification this work exists to remove, and
      // `neon-quiet-distinct-buildings.test.ts` pins the opposite behaviour
      // ("an unrelated building in the SAME shard stays cached").
      //
      // The disjointness is SAFE because of an invariant on the writer side,
      // not because of luck: `publicListingChangeTags` derives the building
      // tag(s) AND the shard tag(s) from the SAME address(es), so a shard is
      // never invalidated without the exact building tag for the changed
      // address being invalidated in the same call. The affected building's
      // payload therefore always expires; unaffected ones correctly survive.
      // `public-listing-change-tags.test.ts` pins that pairing.
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
  /** Distinct shards this warm was asked to (and did) walk. */
  shards_requested: number;
  shards_warmed: number;
  shards_failed: number;
  /** Pages whose fetch EXECUTED during this warm — exactly ONE bounded Neon
   *  query each (scope A: the same-request verification re-read is gone).
   *  Whether the resulting SET persisted is NOT knowable in this request
   *  (the sync's own tag revalidation forces same-request re-execution —
   *  dist incremental-cache/index.js:289-291); persistence is verified by
   *  probeManifestPersistence in the NEXT request. */
  pages_filled: number;
  /** Pages served WITHOUT executing the fetch — a valid pre-existing entry
   *  (normal when the shard's tag was not revalidated this run). A stale
   *  SWR serve also lands here and is never counted as a fill. */
  cache_hit_existing: number;
  duration_ms: number;
}

export interface ManifestPersistenceProbe {
  shards_probed: number;
  /** First page served without executing the fetch → the entry PERSISTED
   *  across requests. Zero Neon cost. */
  cache_hits: number;
  /** First page had to execute → the previous warm's SET did not survive
   *  (or the shard was never warmed). One bounded Neon read that itself
   *  refills the page — measured, never wasted. */
  live_fills: number;
  failed: number;
  duration_ms: number;
}

/**
 * Refill manifest shards NOW — called by idx-sync immediately after a FULLY
 * SUCCESSFUL run, while the Neon compute is already awake for that sync.
 * Scope B (Maya directive 2026-07-24): the caller passes ONLY the shards
 * whose listings physically changed this run (old + new address shard on a
 * move); unaffected shards are never queried and refill lazily on first
 * demand, one bounded page at a time. An empty set performs zero work.
 *
 * Scope A: ONE read per page — no same-request verification re-read. The
 * warm executes each missing page's fetch exactly once (pages_filled) or
 * observes a valid pre-existing entry (cache_hit_existing). Persistence is
 * verified by `probeManifestPersistence` at the START of the next sync
 * request, before that request revalidates anything.
 *
 * STRICTLY BEST-EFFORT AND READ-ONLY: failures are counted and logged,
 * never thrown — a warm-up failure can NEVER advance, block, or corrupt
 * feed state (it runs after the SyncState upsert, outside its try/catch,
 * and touches no sync variables).
 */
export async function warmBuildingManifestShards(
  shards: readonly string[] = BUILDING_MANIFEST_SHARDS,
): Promise<ManifestWarmResult> {
  const t0 = Date.now();
  const targets = [...new Set(shards.filter((s) => typeof s === 'string' && s.length > 0))];
  let warmed = 0;
  let failed = 0;
  let pagesFilled = 0;
  let cacheHitExisting = 0;
  if (targets.length === 0) {
    return {
      shards_requested: 0,
      shards_warmed: 0,
      shards_failed: 0,
      pages_filled: 0,
      cache_hit_existing: 0,
      duration_ms: Date.now() - t0,
    };
  }
  // Bound the exec-count map: one warm per sync; clearing here caps growth
  // to the pages touched between warms.
  manifestPageExecCount.clear();
  for (const shard of targets) {
    try {
      // Walk the shard's pages under the SAME row-ceiling/invariant rules
      // as the reader. Classification is execution-based only: the fetch
      // ran (pages_filled — one Neon query) or it did not
      // (cache_hit_existing — zero Neon).
      const seenCursors = new Set<string>();
      let rowsSeen = 0;
      let cursor: string | null = null;
      for (;;) {
        const key = pageKey(shard, cursor);
        const execBefore = manifestPageExecCount.get(key) ?? 0;
        const page: ManifestPageResult = await getCachedManifestPage(shard, cursor);
        const execAfter = manifestPageExecCount.get(key) ?? 0;
        if (execAfter === execBefore) cacheHitExisting++;
        else pagesFilled++;
        rowsSeen += page.rows.length;
        // Same boundary rule as the reader: ceiling BEFORE the terminal
        // break, so a terminal page cannot smuggle the shard past the limit.
        if (rowsSeen > MANIFEST_MAX_ROWS_PER_SHARD) {
          throw new Error(
            `[building-manifest] OVERFLOW during warm: shard "${shard}" exceeds ${MANIFEST_MAX_ROWS_PER_SHARD} rows`,
          );
        }
        if (page.nextCursor === null) break;
        if (page.rows.length === 0 || page.nextCursor === cursor || seenCursors.has(page.nextCursor)) {
          throw new Error(
            `[building-manifest] warm walk invariant violated for shard "${shard}" at cursor "${cursor ?? 'START'}"`,
          );
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      warmed++;
    } catch (err) {
      failed++;
      console.error(
        `[building-manifest] warm-up failed for shard "${shard}" (non-fatal; lazy fill remains):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    shards_requested: targets.length,
    shards_warmed: warmed,
    shards_failed: failed,
    pages_filled: pagesFilled,
    cache_hit_existing: cacheHitExisting,
    duration_ms: Date.now() - t0,
  };
}

/**
 * The cross-request persistence instrument (Maya directive 2026-07-24:
 * persistence "must be verified by the next separate request, the next sync
 * invocation, or a dedicated post-request probe — not by rereading inside
 * the request that invalidated the tag").
 *
 * Reads ONLY the FIRST page of each shard through the normal cached read
 * path. MUST run BEFORE the calling request revalidates any tags (idx-sync
 * calls it at run start): a served-from-cache page proves the prior warm's
 * SET survived request teardown and tag flushing (cache_hits, zero Neon); a
 * re-executed page proves it did not (live_fills — one bounded read that
 * itself refills the page). Best-effort: per-shard failures are counted,
 * never thrown.
 */
export async function probeManifestPersistence(
  shards: readonly string[] = BUILDING_MANIFEST_SHARDS,
): Promise<ManifestPersistenceProbe> {
  const t0 = Date.now();
  const targets = [...new Set(shards.filter((s) => typeof s === 'string' && s.length > 0))];
  let cacheHits = 0;
  let liveFills = 0;
  let failed = 0;
  for (const shard of targets) {
    try {
      const key = pageKey(shard, null);
      const execBefore = manifestPageExecCount.get(key) ?? 0;
      await getCachedManifestPage(shard, null);
      const execAfter = manifestPageExecCount.get(key) ?? 0;
      if (execAfter === execBefore) cacheHits++;
      else liveFills++;
    } catch (err) {
      failed++;
      console.error(
        `[building-manifest] persistence probe failed for shard "${shard}" (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    shards_probed: targets.length,
    cache_hits: cacheHits,
    live_fills: liveFills,
    failed,
    duration_ms: Date.now() - t0,
  };
}
