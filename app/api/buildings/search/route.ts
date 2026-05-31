// Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §18 (CRM Building Lookup)
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';
import { canonicalizeDirection, canonicalizeSuffix, canonicalizeStreetName } from '@/lib/address/nyc-address-normalizer';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

const DIR_PREFIX_MAP: Record<string, string> = {
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  ne: 'NE', nw: 'NW', se: 'SE', sw: 'SW',
  northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW',
};

const STREET_SUFFIX_RE = /\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Pl|Place|Ct|Court|Ln|Lane|Way|Terrace|Ter)\.?\s*$/i;
const ORDINAL_RE = /(\d+)(st|nd|rd|th)\b/gi;

function stripSuffix(v: string): string { return v.replace(STREET_SUFFIX_RE, '').trim(); }
function stripOrdinal(v: string): string { return v.replace(ORDINAL_RE, '$1').trim(); }

export interface ParsedAddress {
  streetNumber?: string;
  streetDirPrefix?: string;
  streetName?: string;
  buildingName?: string;
}

export function parseAddressQuery(q: string): ParsedAddress {
  const trimmed = q.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return { buildingName: trimmed };
  }

  const streetNumber = match[1];
  let rest = stripSuffix(match[2]);

  const tokens = rest.split(/\s+/);
  const firstLower = tokens[0]?.toLowerCase() || '';
  const dirPrefix = DIR_PREFIX_MAP[firstLower];

  if (dirPrefix) {
    tokens.shift();
    const raw = tokens.length > 0 ? tokens.join(' ') : undefined;
    const streetName = raw ? stripOrdinal(raw).toLowerCase() : undefined;
    return { streetNumber, streetDirPrefix: dirPrefix, streetName: streetName || undefined };
  }

  const streetName = rest ? stripOrdinal(rest).toLowerCase() : undefined;
  return { streetNumber, streetName: streetName || undefined };
}

type ErrorClass =
  | 'none'
  | 'auth_failed'
  | 'rate_limited'
  | 'token_failed'
  | 'cotality_non_200'
  | 'cotality_zero_results'
  | 'db_error'
  | 'unknown';

interface DiagnosticInfo {
  authenticated: boolean;
  userRole: string | null;
  parsedQuery: ParsedAddress;
  localDbResultCount: number;
  cotality: {
    resource: string;
    odataFilter: string | null;
    httpStatus: number | null;
    resultCount: number | null;
    firstThreeAddresses: string[];
  };
  resultSource: 'db' | 'cotality' | 'both' | 'none';
  errorClass: ErrorClass;
  errorMessage: string | null;
}

function formatAddress(r: Record<string, unknown>): string {
  const num = String(r.StreetNumber || '');
  const dir = String(r.StreetDirPrefix || '');
  const name = String(r.StreetName || '');
  const suffix = String(r.StreetSuffix || '');
  // Some DB records have the direction already inside StreetName (e.g., "E 46TH")
  // Don't duplicate the direction if StreetName already starts with it
  const nameAlreadyHasDir = dir && name.toUpperCase().startsWith(dir.toUpperCase() + ' ');
  const dirPart = dir && !nameAlreadyHasDir ? dir + ' ' : '';
  return `${num} ${dirPart}${name} ${suffix}`.replace(/\s+/g, ' ').trim();
}

interface TrestleRecord {
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building-identity key. A building is the SAME building across listings when:
//   1. BuildingKeyNumeric matches (Cotality's canonical building id), else
//   2. full normalized address + borough + zip matches, else
//   3. full normalized address matches (when borough/zip are absent).
// NEVER keyed by listing id — many units (listings) share one building identity,
// and saved building-profile values must aggregate across ALL of them.
//   `rec` may be either a DB address object (StreetNumber/StreetName/CityRegion/
//   PostalCode) or a Cotality record (same field names) — both expose the same
//   member names, so one resolver serves both paths.
// Returns the address-fallback key (borough+zip incorporated); the BK key is
// derived separately by callers that have features/BuildingKeyNumeric. (Building
// identity profile merge.)
// ─────────────────────────────────────────────────────────────────────────────
function addressIdentityKey(rec: Record<string, unknown>): string {
  const num = String(rec.StreetNumber ?? '').trim();
  // Canonicalize variant tokens so the SAME building matches regardless of which
  // source produced the row: "East" vs "E", "Street" vs "St", "46" vs "46th".
  // Without this, adding StreetDirPrefix/StreetSuffix to the key (vs the old
  // number-name-zip key) would split one building into two whenever the CRM form
  // saved full words and Cotality used abbreviations. (Codex review 3 2026-05-31.)
  const dir = canonicalizeDirection(String(rec.StreetDirPrefix ?? ''));
  const name = canonicalizeStreetName(String(rec.StreetName ?? ''));
  const suffix = canonicalizeSuffix(String(rec.StreetSuffix ?? ''));
  // Don't duplicate a direction already embedded in StreetName (e.g. "E 46TH").
  const nameHasDir = dir && name.toUpperCase().startsWith(dir.toUpperCase() + ' ');
  const addrPart = `${num} ${dir && !nameHasDir ? dir + ' ' : ''}${name} ${suffix}`.replace(/\s+/g, ' ').trim();
  const borough = String(rec.CityRegion ?? '').trim();
  const zip = String(rec.PostalCode ?? '').trim();
  // Borough + zip incorporated when present, else plain full address (fallback).
  return `${addrPart}|${borough}|${zip}`.toUpperCase();
}

// Address-ONLY identity key (street parts, no borough/zip). This is the
// fallback the layer-3 identity rule needs: when one side of a candidate match
// is missing borough or zip, the full keys differ (e.g. `… ST|MANHATTAN|10017`
// vs `… ST||`) and would never collapse. The address-only key lets them match,
// but ONLY through findRegisteredBuilding's borough/zip compatibility guard, so
// two genuinely different buildings that merely share a street address across
// different boroughs/zips are NEVER merged. (Codex review 2026-05-31.)
function addressOnlyKey(rec: Record<string, unknown>): string {
  // Reuse addressIdentityKey's exact normalization, then drop the |borough|zip.
  return addressIdentityKey(rec).split('|')[0];
}

// Resolve an already-registered building for this row, in building-identity
// order: BuildingKeyNumeric → full address+borough+zip → address-only (guarded).
// The address-only step matches a candidate only when borough AND zip are
// COMPATIBLE — equal, or blank on either side. A blank borough/zip on the
// partial side never blocks the merge (Codex's asymmetric case); two fully
// specified DIFFERENT boroughs or zips never merge. Returns undefined when no
// compatible building exists yet.
function findRegisteredBuilding(
  buildingByKey: Map<string, Record<string, unknown>>,
  buildingByAddrOnly: Map<string, Array<Record<string, unknown>>>,
  bkKey: string | null,
  addrKey: string,
  aoKey: string,
  borough: string,
  zip: string,
): Record<string, unknown> | undefined {
  if (bkKey) {
    const byBk = buildingByKey.get(bkKey);
    if (byBk) return byBk;
  }
  const byAddr = buildingByKey.get(addrKey);
  if (byAddr) return byAddr;
  const candidates = buildingByAddrOnly.get(aoKey);
  if (!candidates) return undefined;
  const B = borough.trim().toUpperCase();
  const Z = zip.trim().toUpperCase();
  return candidates.find((c) => {
    const cb = String(c.borough ?? '').trim().toUpperCase();
    const cz = String(c.zip ?? '').trim().toUpperCase();
    const boroughOk = !B || !cb || B === cb;
    const zipOk = !Z || !cz || Z === cz;
    return boroughOk && zipOk;
  });
}

// Promote the fullest-known identity (borough / zip / building_key) onto an
// EXISTING building when its own fields are still blank. The address-only
// compatibility guard reads bldg.borough / bldg.zip; if the FIRST row for an
// address lacked them, a later fully-specified row would merge (blank =
// compatible) but leave the object blank — so a subsequent DIFFERENT-borough/zip
// row for the same street address would ALSO pass the guard and wrongly merge.
// Copying the fuller values forward closes that hole: once a building knows its
// borough/zip it can no longer be polluted by a mismatching address. building_key
// is promoted on the same principle (BK identity, once known, sticks). Never
// overwrites an already-known value. (Codex review 2 2026-05-31.)
function promoteIdentity(
  existing: Record<string, unknown>,
  borough: string,
  zip: string,
  bkKey: string | null,
): void {
  if (borough && !String(existing.borough ?? '').trim()) existing.borough = borough;
  if (zip && !String(existing.zip ?? '').trim()) existing.zip = zip;
  // bkKey is the 'BK:<num>' index key; the building_key field stores the bare num.
  if (bkKey && !String(existing.building_key ?? '').trim()) existing.building_key = bkKey.slice(3);
}

// Register a building object under ALL of its identity keys (full address key,
// BuildingKeyNumeric key when known, and the address-only fallback list).
// Idempotent — safe to call again when a later duplicate row reveals a
// BuildingKeyNumeric (or a fuller address) the first row lacked, so the
// existing object becomes reachable by the newly-known key too.
function registerBuilding(
  buildingByKey: Map<string, Record<string, unknown>>,
  buildingByAddrOnly: Map<string, Array<Record<string, unknown>>>,
  bldg: Record<string, unknown>,
  bkKey: string | null,
  addrKey: string,
  aoKey: string,
): void {
  buildingByKey.set(addrKey, bldg);
  if (bkKey) buildingByKey.set(bkKey, bldg);
  const arr = buildingByAddrOnly.get(aoKey);
  if (arr) {
    if (!arr.includes(bldg)) arr.push(bldg);
  } else {
    buildingByAddrOnly.set(aoKey, [bldg]);
  }
}

/**
 * Real-Cotality parking / laundry / documents / pets fields surfaced for the
 * CRM building-modal auto-fill (Track 1). EVERY field below is verified present
 * in live $metadata (artifacts/metadata.xml, 2026-05-30):
 *   GarageYN, AttachedGarageYN, GarageSpaces, OpenParkingSpaces, CoveredSpaces,
 *   ParkingFeatures, LaundryFeatures, DocumentsAvailable, PetsAllowed,
 *   PetsAllowedYN.
 * Phantom co-op/condo policy fields (board approval, max financing, sublet,
 * total shares, underlying mortgage, capital reserves, flip tax, tax abatement)
 * are intentionally NOT surfaced — they do not exist on the Cotality Property
 * entity, so there is nothing to auto-fill (filling them would be guessing).
 * PetsAllowed is UNIT-level Cotality data; the form uses it as a suggestion only
 * (populate fills it only when the agent left the pet policy empty).
 */
/**
 * Backfill building extras from a live Cotality record into an existing (DB-
 * cached) building result, WITHOUT overwriting non-empty DB values. The DB
 * features JSON may lack the newer Cotality-only fields (e.g. CoveredSpaces /
 * PetsAllowedYN that the IDX mapper does not persist), and the Cotality
 * supplement loop dedups the same address — so a cached building would
 * otherwise lose those live values. Only fills target keys that are empty
 * (null / '' / false) with a meaningful Cotality value. (Codex review #297.)
 */
function mergeMissingExtras(target: Record<string, unknown>, extras: Record<string, unknown>) {
  for (const k of Object.keys(extras)) {
    const v = extras[k];
    const cur = target[k];
    // An empty array counts as empty (backfillable) and a non-empty array as
    // meaningful — so aggregating multiple units of a building by BuildingKeyNumeric
    // backfills building_pets/building_laundry regardless of $orderby. (Codex #301)
    const curEmpty = cur === null || cur === undefined || cur === '' || cur === false || (Array.isArray(cur) && cur.length === 0);
    const vMeaningful = v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0);
    if (curEmpty && vMeaningful) target[k] = v;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVED Mallan/REBNY building-profile values.
//
// These are NOT Cotality fields — Cotality has no management-company / super /
// board / financing / sublet data. They are values a Mallan agent typed once on
// a PRIOR listing in the same building and that we persisted (raw_data first,
// then features, then custom_fields) under the FORM's saved key names
// (e.g. raw_data.saleBldgMgmtCompany). The building-search route re-surfaces
// them so the agent does not retype building-wide facts for every unit.
//
// Each entry maps a SHARED-CONTRACT key (consumed by populateBuildingFromIDX)
// to the form's saved key name. The contract key is the one the building object
// carries; the saved key is what we read out of the stored listing JSON.
//
// Hard rule: NEVER invent values. If no saved value exists on any listing of the
// building identity, the key is simply absent (blank). (Building-profile merge.)
// ─────────────────────────────────────────────────────────────────────────────
const SAVED_PROFILE_CONTRACT_TO_FORM: Record<string, string> = {
  building_mgmt_company: 'saleBldgMgmtCompany',
  building_mgmt_phone: 'saleBldgMgmtPhone',
  building_mgmt_email: 'saleBldgMgmtEmail',
  building_mgmt_address: 'saleBldgMgmtAddress',
  building_super_name: 'saleBldgSuperName',
  building_super_phone: 'saleBldgSuperPhone',
  building_super_email: 'saleBldgSuperEmail',
  building_resident_manager_name: 'saleBldgManagerName',
  building_resident_manager_phone: 'saleBldgManagerPhone',
  building_resident_manager_email: 'saleBldgManagerEmail',
  building_board_president: 'saleBldgBoardPresident',
  building_board_email: 'saleBldgBoardEmail',
  building_max_financing: 'saleBldgMaxFinancing',
  building_min_down: 'saleBldgMinDownPayment',
  building_dti: 'saleBldgDTIRatio',
  building_post_close_liquidity: 'saleBldgPostCloseLiquidity',
  building_board_approval: 'saleBldgBoardApproval',
  building_board_interview: 'saleBldgBoardInterview',
  building_sublet_allowed: 'saleBldgSublettingAllowed',
  building_sublet_policy: 'saleBldgSubletPolicy',
  building_sublet_fee: 'saleBldgSubletFee',
  building_sublet_max_years: 'saleBldgMaxSubletYears',
};

/**
 * Extract SAVED Mallan/REBNY building-profile values from one listing's stored
 * JSON columns. Reads each contract key's saved form-field name from raw_data
 * first, then features, then custom_fields, and returns the values keyed by the
 * SHARED-CONTRACT key. Only non-empty values are returned (so merging never
 * clobbers a real value with a blank). Never invents — absent stays absent.
 */
function extractSavedProfileValues(
  raw_data: unknown,
  features: unknown,
  custom_fields: unknown,
): Record<string, unknown> {
  const rd = (raw_data && typeof raw_data === 'object' ? raw_data : {}) as Record<string, unknown>;
  const ft = (features && typeof features === 'object' ? features : {}) as Record<string, unknown>;
  const cf = (custom_fields && typeof custom_fields === 'object' ? custom_fields : {}) as Record<string, unknown>;

  const out: Record<string, unknown> = {};
  for (const [contractKey, savedKey] of Object.entries(SAVED_PROFILE_CONTRACT_TO_FORM)) {
    // raw_data wins, then features, then custom_fields (matches the form's
    // restore precedence). A value counts as present only when not null/''/undefined.
    const candidates = [rd[savedKey], ft[savedKey], cf[savedKey]];
    for (const v of candidates) {
      if (v !== null && v !== undefined && v !== '') { out[contractKey] = v; break; }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cotality building amenity resolver (verified against live $metadata 2026-05-31).
// Building amenities are spread across SIX Multi-enum fields, and building-level
// items appear as Building*-prefixed members. We union all six and match on EXACT
// member names (no substring guessing). Doorman / live-in-super have no Cotality
// member (AttendanceType is not on the Property entity) → left to manual entry.
// ─────────────────────────────────────────────────────────────────────────────
const AMENITY_FEATURE_FIELDS = [
  'BuildingFeatures', 'ExteriorFeatures', 'CommunityFeatures',
  'AssociationAmenities', 'AccessibilityFeatures', 'ParkingFeatures',
];
const AMENITY_MEMBERS: Record<string, string[]> = {
  elevator: ['Elevators', 'Elevator', 'ServiceElevators', 'FreightElevator', 'AccessibleElevatorInstalled', 'BuildingAccessibleElevatorInstalled'],
  gym: ['FitnessCenter', 'HealthClub'],
  pool: ['IndoorPool', 'Pool', 'CommunityPool'],
  concierge: ['Concierge'],
  spa: ['SpaHotTub', 'Sauna', 'SteamRoom', 'ColdPlungePool'],
  roof_deck: ['BuildingRoofDeck', 'RoofDeck', 'RooftopDeck'],
  storage: ['Storage', 'BuildingStorage', 'StorageFacilities', 'Lockers'],
  bike_room: ['BikeStorage', 'BicycleStorage'],
  package_room: ['PackageRoom', 'PackageDeliveryLocker', 'PackageService'],
  lounge: ['CommonLounge', 'BarLounge', 'RooftopLounge', 'RecreationRoom', 'Clubhouse', 'ClubhouseOrPartyRoom', 'PartyRoom'],
  playroom: ['CommonPlayroom', 'BuildingPlayroom', 'Playground', 'BuildingPlayground', 'GameRoom'],
  business_center: ['BusinessCenter', 'Coworkspace', 'ComputerArea'],
  conference_room: ['ConferenceRoom', 'ConferenceMeetingRoom', 'MeetingRoom', 'MeetingRooms', 'MeetingBanquetPartyRoom'],
  cold_storage: ['ColdStorage', 'Coolers', 'Freezers'],
  courtyard: ['Courtyard', 'BuildingCourtyard', 'CoveredCourtyard', 'UncoveredCourtyard', 'BuildingCoveredCourtyard', 'BuildingUncoveredCourtyard'],
  parking: ['Parking', 'ParkingGarage', 'Garage', 'GarageAvailable', 'BuildingGarage', 'ParkingLot', 'BuildingParkingLot', 'Attached', 'BuildingAttached', 'Covered', 'BuildingCovered', 'Assigned', 'BuildingAssigned'],
  valet: ['Valet', 'BuildingValet'],
  wheelchair_access: ['WheelchairAccess', 'WheelchairAccessible', 'BuildingWheelchairAccessible', 'HandicapAccess', 'HandicapAccessible', 'AdaCompliant', 'BuildingAdaCompliant'],
  on_site_manager: ['OnSiteManagement', 'PropertyManagerOnSite', 'MaintenanceOnSite', 'Management'],
};
// PetsAllowed building-level members → form saleBuildingPetsAllowed values (Ok→OK).
const BUILDING_PET_MAP: Record<string, string> = {
  BuildingYes: 'BuildingYes', BuildingNo: 'BuildingNo',
  BuildingCatsOk: 'BuildingCatsOK', BuildingDogsOk: 'BuildingDogsOK',
  BuildingBreedRestrictions: 'BuildingBreedRestrictions',
  BuildingSizeLimit: 'BuildingSizeLimit', BuildingNumberLimit: 'BuildingNumberLimit',
};

function amenityTokenSet(rec: Record<string, unknown>): Set<string> {
  const s = new Set<string>();
  for (const f of AMENITY_FEATURE_FIELDS) {
    String(rec[f] || '').split(',').forEach((m) => { const t = m.trim().toLowerCase(); if (t) s.add(t); });
  }
  return s;
}
// Returns ONLY the amenity flags that are TRUE — so spreading it never clobbers
// a per-record true with false (and leaves doorman/live_in_super to manual).
function buildingAmenityFlags(rec: Record<string, unknown>): Record<string, boolean> {
  const set = amenityTokenSet(rec);
  const out: Record<string, boolean> = {};
  for (const [flag, members] of Object.entries(AMENITY_MEMBERS)) {
    if (members.some((m) => set.has(m.toLowerCase()))) out[flag] = true;
  }
  return out;
}
// Building PET policy from PetsAllowed Building*-prefixed members (NOT unit-level).
function buildingPetPolicy(rec: Record<string, unknown>): string[] {
  return String(rec.PetsAllowed || '').split(',').map((m) => m.trim())
    .map((m) => BUILDING_PET_MAP[m]).filter(Boolean) as string[];
}
// Building LAUNDRY policy from LaundryFeatures Building*-prefixed members; the
// form's building-laundry checkboxes use the UNPREFIXED value, so strip "Building".
function buildingLaundryPolicy(rec: Record<string, unknown>): string[] {
  return String(rec.LaundryFeatures || '').split(',').map((m) => m.trim())
    .filter((m) => m.startsWith('Building') && m.length > 'Building'.length)
    .map((m) => m.slice('Building'.length))
    .filter(Boolean);
}

function buildingExtras(rec: Record<string, unknown> | null | undefined) {
  const r = rec || {};
  const num = (v: unknown) =>
    v === 0 || (v !== null && v !== undefined && v !== '') ? Number(v) : null;
  return {
    garage_yn: r.GarageYN === true,
    attached_garage_yn: r.AttachedGarageYN === true,
    garage_spaces: num(r.GarageSpaces),
    open_parking_spaces: num(r.OpenParkingSpaces),
    covered_spaces: num(r.CoveredSpaces),
    parking_features: String(r.ParkingFeatures || ''),
    laundry_features: String(r.LaundryFeatures || ''),
    documents_available: String(r.DocumentsAvailable || ''),
    pets_allowed: String(r.PetsAllowed || ''),
    // Nullable on purpose: a strict boolean would make "missing" look like
    // "false" and wrongly suggest "No pets". Only true/false when Cotality
    // actually provided the field; otherwise null (no suggestion).
    pets_allowed_yn: r.PetsAllowedYN === true ? true : r.PetsAllowedYN === false ? false : null,
    // ── Building-level union (all 6 feature fields, Building*-aware) ──
    ...buildingAmenityFlags(r),
    building_pets: buildingPetPolicy(r),       // building pet-policy group (from PetsAllowed Building* members)
    building_laundry: buildingLaundryPolicy(r), // building laundry-policy group (from LaundryFeatures Building* members)
    // ── Building identity + facts (for aggregation + fact fields) ──
    building_key: r.BuildingKeyNumeric != null && r.BuildingKeyNumeric !== '' ? String(r.BuildingKeyNumeric) : '',
    units_in_community: num(r.NumberOfUnitsInCommunity),
    association_yn: r.AssociationYN === true,
    association_phone: String(r.AssociationPhone || ''),
    ownership_type: String(r.OwnershipType || ''),
    property_condition: String(r.PropertyCondition || ''),
    property_attached_yn: r.PropertyAttachedYN === true,
    building_area_total: num(r.BuildingAreaTotal),
  };
}

export async function GET(request: NextRequest) {
  const debugMode = request.nextUrl.searchParams.get('debug') === '1';

  const diag: DiagnosticInfo = {
    authenticated: false,
    userRole: null,
    parsedQuery: {},
    localDbResultCount: 0,
    cotality: {
      resource: '/odata/Property',
      odataFilter: null,
      httpStatus: null,
      resultCount: null,
      firstThreeAddresses: [],
    },
    resultSource: 'none',
    errorClass: 'none',
    errorMessage: null,
  };

  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) {
    diag.errorClass = 'auth_failed';
    diag.errorMessage = 'Session expired or not authenticated';
    if (debugMode) {
      return NextResponse.json({ buildings: [], _debug: diag, _errorHint: 'Session expired. Please log in again.' }, { status: 401 });
    }
    return NextResponse.json({ buildings: [], _errorHint: 'Session expired. Please log in again.' }, { status: 401 });
  }

  diag.authenticated = true;
  diag.userRole = auth.role;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    diag.errorClass = 'rate_limited';
    diag.errorMessage = 'Rate limit exceeded';
    if (debugMode) {
      return NextResponse.json({ buildings: [], _debug: diag, _errorHint: 'Building lookup temporarily unavailable.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.length < 3) {
    if (debugMode) {
      diag.errorMessage = 'Query too short (minimum 3 characters)';
      return NextResponse.json({ buildings: [], _debug: diag });
    }
    return NextResponse.json({ buildings: [] });
  }

  const parsed = parseAddressQuery(q);
  diag.parsedQuery = parsed;

  const buildings: Array<Record<string, unknown>> = [];
  // building object indexed by BOTH its address key and BuildingKeyNumeric key,
  // so a duplicate detected on EITHER key resolves to the exact existing object
  // for enrichment — never relying on raw address-string equality (DB vs Cotality
  // may format the same address differently). (Codex #301)
  const buildingByKey = new Map<string, Record<string, unknown>>();
  // Address-ONLY fallback index (street parts, no borough/zip) → the buildings
  // sharing that street address. Used by findRegisteredBuilding's layer-3
  // guarded match so a partial row (missing borough/zip) still collapses onto
  // the same building. (Codex review 2026-05-31.)
  const buildingByAddrOnly = new Map<string, Array<Record<string, unknown>>>();
  let dbHadResults = false;
  let cotHadResults = false;

  try {
    // ── 1. Search DB first ──
    if (parsed.streetNumber && (parsed.streetName || parsed.streetDirPrefix)) {
      const conditions = [`address->>'StreetNumber' = $1`];
      const params: string[] = [parsed.streetNumber];
      let paramIdx = 2;
      if (parsed.streetDirPrefix) {
        conditions.push(`address->>'StreetDirPrefix' = $${paramIdx}`);
        params.push(parsed.streetDirPrefix);
        paramIdx++;
      }
      if (parsed.streetName) {
        conditions.push(`LOWER(address->>'StreetName') LIKE $${paramIdx}`);
        params.push(`%${parsed.streetName}%`);
        paramIdx++;
      }
      const sql = `SELECT address, features, raw_data, custom_fields, property_type, property_sub_type FROM listings WHERE ${conditions.join(' AND ')} LIMIT 20`;
      const dbResults = await prisma.$queryRawUnsafe<Array<{
        address: unknown; features: unknown; raw_data: unknown; custom_fields: unknown; property_type: string | null; property_sub_type: string | null;
      }>>(sql, ...params);

      diag.localDbResultCount = dbResults.length;
      if (dbResults.length > 0) dbHadResults = true;

      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const fullAddr = formatAddress(addr);
        // Building identity: BuildingKeyNumeric (BK) if present, else full
        // address + borough + zip (addressIdentityKey). (Building identity merge.)
        const _addrKey = addressIdentityKey(addr);
        const _aoKey = addressOnlyKey(addr);
        const _bkKey = feat && feat.BuildingKeyNumeric ? 'BK:' + String(feat.BuildingKeyNumeric) : null;
        // SAVED Mallan/REBNY building-profile values from THIS listing's stored
        // JSON (raw_data -> features -> custom_fields). Aggregated across all
        // listings of the building identity: first listing with a value wins.
        const savedProfile = extractSavedProfileValues(l.raw_data, l.features, l.custom_fields);
        // Resolve any building already built for this identity (BK → full
        // address+borough+zip → guarded address-only). A duplicate DB row (SQL
        // has no ORDER BY) backfills missed fields onto the existing object and
        // re-registers it under any newly-known key (e.g. a BK the first row
        // lacked) so a later Cotality record matches instead of duplicating.
        const _existing = findRegisteredBuilding(
          buildingByKey, buildingByAddrOnly, _bkKey, _addrKey, _aoKey,
          String(addr.CityRegion ?? ''), String(addr.PostalCode ?? ''),
        );
        if (_existing) {
          mergeMissingExtras(_existing, buildingExtras(feat));
          // Merge saved profile values from this additional unit of the same
          // building — first non-empty value per key wins. (Building merge.)
          mergeMissingExtras(_existing, savedProfile);
          // Carry this row's fuller borough/zip/building_key onto the existing
          // building so the address-only guard can reject a later different
          // borough/zip row, and the BK identity sticks once known.
          promoteIdentity(_existing, String(addr.CityRegion ?? ''), String(addr.PostalCode ?? ''), _bkKey);
          registerBuilding(buildingByKey, buildingByAddrOnly, _existing, _bkKey, _addrKey, _aoKey);
          continue;
        }

        const dbFeatures = String(feat?.BuildingFeatures || '').toLowerCase();
        const dbAttendance = String(feat?.AttendanceType || '').toLowerCase();
        buildings.push({
          address: fullAddr,
          name: String(addr.BuildingName || ''),
          borough: String(addr.CityRegion || ''),
          city: String(addr.City || ''),
          state: String(addr.StateOrProvince || ''),
          zip: String(addr.PostalCode || ''),
          neighborhood: String(addr.SubdivisionName || ''),
          subdivisionName: String(addr.SubdivisionName || ''),
          streetNumber: String(addr.StreetNumber || ''),
          streetDirPrefix: String(addr.StreetDirPrefix || ''),
          streetName: String(addr.StreetName || ''),
          streetSuffix: String(addr.StreetSuffix || ''),
          cross_street: String(addr.CrossStreet || ''),
          crossStreet: String(addr.CrossStreet || ''),
          source: 'db',
          common_interest: String(feat?.CommonInterest || l.property_sub_type || ''),
          structure_type: String(feat?.StructureType || ''),
          year_built: feat?.YearBuilt ? Number(feat.YearBuilt) : null,
          year_built_details: String(feat?.YearBuiltDetails || ''),
          stories_total: feat?.StoriesTotal ? Number(feat.StoriesTotal) : null,
          units_total: feat?.NumberOfUnitsTotal ? Number(feat.NumberOfUnitsTotal) : null,
          new_construction_yn: feat?.NewConstructionYN === true,
          new_development_yn: feat?.NewDevelopmentYN === true,
          sponsor_unit_yn: feat?.SponsorUnitYN === true,
          renting_allowed_yn: feat?.RentingAllowedYN === true,
          tax_block: String(feat?.TaxBlock || ''),
          tax_lot: String(feat?.TaxLot || ''),
          tax_annual_amount: feat?.TaxAnnualAmount ? Number(feat.TaxAnnualAmount) : null,
          association_name: String(feat?.AssociationName || ''),
          association_fee: feat?.AssociationFee ? Number(feat.AssociationFee) : null,
          association_fee_frequency: String(feat?.AssociationFeeFrequency || ''),
          zoning_description: String(feat?.ZoningDescription || ''),
          doorman: dbAttendance.includes('doorman'),
          elevator: dbFeatures.includes('elevator'),
          gym: dbFeatures.includes('healthclub') || dbFeatures.includes('fitness'),
          pool: dbFeatures.includes('pool'),
          laundry: dbFeatures.includes('laundry'),
          parking: dbFeatures.includes('parking') || dbFeatures.includes('garage'),
          concierge: dbAttendance.includes('concierge'),
          roof_deck: dbFeatures.includes('roof deck') || dbFeatures.includes('roof terrace'),
          storage: dbFeatures.includes('storage'),
          spa: dbFeatures.includes('spa'),
          bike_room: dbFeatures.includes('bike'),
          package_room: dbFeatures.includes('package'),
          lounge: dbFeatures.includes('lounge'),
          playroom: dbFeatures.includes('playroom') || dbFeatures.includes('children'),
          business_center: dbFeatures.includes('business center'),
          conference_room: dbFeatures.includes('conference'),
          cold_storage: dbFeatures.includes('cold storage'),
          courtyard: dbFeatures.includes('courtyard'),
          valet: dbFeatures.includes('valet'),
          wheelchair_access: dbFeatures.includes('wheelchair') || dbFeatures.includes('ada'),
          live_in_super: dbFeatures.includes('live-in super') || dbFeatures.includes('live in superintendent'),
          on_site_manager: dbFeatures.includes('on-site') || dbAttendance.includes('property manager'),
          washer_dryer_allowed: dbFeatures.includes('washer') || dbFeatures.includes('w/d'),
          ...buildingExtras(feat),
          // SAVED Mallan/REBNY building-profile values (NOT Cotality). Spread
          // last so a real saved value wins over a blank default. (Building merge.)
          ...savedProfile,
        });
        registerBuilding(buildingByKey, buildingByAddrOnly, buildings[buildings.length - 1], _bkKey, _addrKey, _aoKey);
      }
    } else if (parsed.buildingName) {
      const dbResults = await prisma.listing.findMany({
        where: {
          address: { path: ['BuildingName'], string_contains: parsed.buildingName.toUpperCase() },
        },
        select: { address: true, features: true, raw_data: true, custom_fields: true, property_type: true, property_sub_type: true },
        take: 10,
      });

      diag.localDbResultCount = dbResults.length;
      if (dbResults.length > 0) dbHadResults = true;

      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        // Use formatAddress so StreetDirPrefix is preserved — the prior
        // inline concat dropped E/W/N/S and saved malformed addresses.
        const fullAddr = formatAddress(addr);
        // Building identity: BuildingKeyNumeric (BK) if present, else full
        // address + borough + zip (addressIdentityKey). (Building identity merge.)
        const _addrKey = addressIdentityKey(addr);
        const _aoKey = addressOnlyKey(addr);
        const _bkKey = feat && feat.BuildingKeyNumeric ? 'BK:' + String(feat.BuildingKeyNumeric) : null;
        // SAVED Mallan/REBNY building-profile values from THIS listing's stored
        // JSON (raw_data -> features -> custom_fields). (Building identity merge.)
        const savedProfile = extractSavedProfileValues(l.raw_data, l.features, l.custom_fields);
        // Resolve any building already built for this identity (BK → full
        // address+borough+zip → guarded address-only). A duplicate DB row
        // backfills missed fields and re-registers the existing object under any
        // newly-known key so a later Cotality record matches, not duplicates.
        const _existing = findRegisteredBuilding(
          buildingByKey, buildingByAddrOnly, _bkKey, _addrKey, _aoKey,
          String(addr.CityRegion ?? ''), String(addr.PostalCode ?? ''),
        );
        if (_existing) {
          mergeMissingExtras(_existing, buildingExtras(feat));
          // Merge saved profile values across units of the same building —
          // first non-empty value per key wins. (Building merge.)
          mergeMissingExtras(_existing, savedProfile);
          // Carry this row's fuller borough/zip/building_key onto the existing
          // building so the address-only guard can reject a later different
          // borough/zip row, and the BK identity sticks once known.
          promoteIdentity(_existing, String(addr.CityRegion ?? ''), String(addr.PostalCode ?? ''), _bkKey);
          registerBuilding(buildingByKey, buildingByAddrOnly, _existing, _bkKey, _addrKey, _aoKey);
          continue;
        }

        const dbFeatures = String(feat?.BuildingFeatures || '').toLowerCase();
        const dbAttendance = String(feat?.AttendanceType || '').toLowerCase();
        buildings.push({
          address: fullAddr,
          name: String(addr.BuildingName || ''),
          borough: String(addr.CityRegion || ''),
          city: String(addr.City || ''),
          state: String(addr.StateOrProvince || ''),
          zip: String(addr.PostalCode || ''),
          neighborhood: String(addr.SubdivisionName || ''),
          subdivisionName: String(addr.SubdivisionName || ''),
          streetNumber: String(addr.StreetNumber || ''),
          streetDirPrefix: String(addr.StreetDirPrefix || ''),
          streetName: String(addr.StreetName || ''),
          streetSuffix: String(addr.StreetSuffix || ''),
          cross_street: String(addr.CrossStreet || ''),
          crossStreet: String(addr.CrossStreet || ''),
          source: 'db',
          common_interest: String(feat?.CommonInterest || l.property_sub_type || ''),
          structure_type: String(feat?.StructureType || ''),
          year_built: feat?.YearBuilt ? Number(feat.YearBuilt) : null,
          year_built_details: String(feat?.YearBuiltDetails || ''),
          stories_total: feat?.StoriesTotal ? Number(feat.StoriesTotal) : null,
          units_total: feat?.NumberOfUnitsTotal ? Number(feat.NumberOfUnitsTotal) : null,
          new_construction_yn: feat?.NewConstructionYN === true,
          new_development_yn: feat?.NewDevelopmentYN === true,
          sponsor_unit_yn: feat?.SponsorUnitYN === true,
          renting_allowed_yn: feat?.RentingAllowedYN === true,
          tax_block: String(feat?.TaxBlock || ''),
          tax_lot: String(feat?.TaxLot || ''),
          tax_annual_amount: feat?.TaxAnnualAmount ? Number(feat.TaxAnnualAmount) : null,
          association_name: String(feat?.AssociationName || ''),
          association_fee: feat?.AssociationFee ? Number(feat.AssociationFee) : null,
          association_fee_frequency: String(feat?.AssociationFeeFrequency || ''),
          zoning_description: String(feat?.ZoningDescription || ''),
          doorman: dbAttendance.includes('doorman'),
          elevator: dbFeatures.includes('elevator'),
          gym: dbFeatures.includes('healthclub') || dbFeatures.includes('fitness'),
          pool: dbFeatures.includes('pool'),
          laundry: dbFeatures.includes('laundry'),
          parking: dbFeatures.includes('parking') || dbFeatures.includes('garage'),
          concierge: dbAttendance.includes('concierge'),
          roof_deck: dbFeatures.includes('roof deck') || dbFeatures.includes('roof terrace'),
          storage: dbFeatures.includes('storage'),
          spa: dbFeatures.includes('spa'),
          bike_room: dbFeatures.includes('bike'),
          package_room: dbFeatures.includes('package'),
          lounge: dbFeatures.includes('lounge'),
          playroom: dbFeatures.includes('playroom') || dbFeatures.includes('children'),
          business_center: dbFeatures.includes('business center'),
          conference_room: dbFeatures.includes('conference'),
          cold_storage: dbFeatures.includes('cold storage'),
          courtyard: dbFeatures.includes('courtyard'),
          valet: dbFeatures.includes('valet'),
          wheelchair_access: dbFeatures.includes('wheelchair') || dbFeatures.includes('ada'),
          live_in_super: dbFeatures.includes('live-in super') || dbFeatures.includes('live in superintendent'),
          on_site_manager: dbFeatures.includes('on-site') || dbAttendance.includes('property manager'),
          washer_dryer_allowed: dbFeatures.includes('washer') || dbFeatures.includes('w/d'),
          ...buildingExtras(feat),
          // SAVED Mallan/REBNY building-profile values (NOT Cotality). (Building merge.)
          ...savedProfile,
        });
        registerBuilding(buildingByKey, buildingByAddrOnly, buildings[buildings.length - 1], _bkKey, _addrKey, _aoKey);
      }
    }

    // ── 2. Supplement from Trestle if DB has <5 results ──
    if (buildings.length < 5 && parsed.streetNumber && (parsed.streetName || parsed.streetDirPrefix)) {
      try {
        const token = await getAccessToken();
        const cleanNum = sanitizeOData(parsed.streetNumber);

        const SELECT = [
          'ListingId', 'BuildingName', 'YearBuilt', 'StoriesTotal',
          'NumberOfUnitsInCommunity', 'CommonInterest', 'OwnershipType',
          'PropertyType', 'PropertySubType', 'StructureType',
          'StreetNumber', 'StreetName', 'StreetSuffix', 'StreetDirPrefix',
          'PostalCode', 'UnitNumber', 'SubdivisionName',
          'City', 'StateOrProvince',
          'CityRegion', 'CountyOrParish',
          'BuildingFeatures', 'PetsAllowed',
          // Expanded 2026-05-28: surface every Cotality field the CRM
          // building modal needs so populateBuildingFromIDX can set them
          // all and Maya does not have to retype anything that exists
          // upstream.
          // 2026-05-29: REMOVED AttendanceType, NewDevelopmentYN, SponsorUnitYN,
          // RentingAllowedYN — none exist on the live Cotality Property entity
          // (verified against artifacts/metadata.xml). Their presence made
          // Trestle reject the whole $select with HTTP 400 (no 4xx retry),
          // silently killing the Cotality building lookup. Concierge / on-site
          // manager are derived from BuildingFeatures (valid Multi enum); the
          // remaining flags have no valid Cotality equivalent and are left for
          // manual entry on the Cotality path (the DB path still sets them from
          // stored features). Do NOT re-add these without a metadata check —
          // tests/runtime/cotality-building-autopopulate.test.ts will fail.
          'CrossStreet',
          'YearBuiltDetails', 'YearBuiltSource',
          'NewConstructionYN',
          'TaxBlock', 'TaxLot', 'TaxAnnualAmount',
          'AssociationName', 'AssociationFee', 'AssociationFeeFrequency',
          'ZoningDescription',
          // Parking / laundry / documents / pets — all verified in live
          // $metadata (2026-05-30). Surfaced for building-modal auto-fill.
          // Do NOT add a field here without a metadata check — an invalid
          // $select makes Trestle reject the whole query with HTTP 400.
          'GarageYN', 'AttachedGarageYN', 'GarageSpaces',
          'OpenParkingSpaces', 'CoveredSpaces', 'ParkingFeatures',
          'LaundryFeatures', 'DocumentsAvailable', 'PetsAllowedYN',
          // Full Cotality building subset — all verified in live $metadata
          // (2026-05-31). Building amenities are spread across these Multi-enum
          // fields (Building*-prefixed members = building-level); building facts +
          // association; BuildingKeyNumeric for cross-unit aggregation.
          'BuildingKeyNumeric', 'BuildingAreaTotal', 'BuildingAreaUnits', 'BuildingAreaSource',
          'YearBuiltDetails', 'YearBuiltSource',
          'NumberOfUnitsInCommunity', 'PropertyCondition', 'OwnershipType', 'PropertyAttachedYN',
          'AssociationYN', 'AssociationPhone', 'AssociationFee2',
          // All SIX amenity feature fields the resolver unions must be fetched —
          // AssociationAmenities was missing, so association-only amenities
          // (Concierge/IndoorPool) never filled on the Cotality path. (Codex #301)
          'ExteriorFeatures', 'CommunityFeatures', 'AccessibilityFeatures', 'AssociationAmenities',
        ].join(',');

        const filterParts = [`startswith(StreetNumber,'${cleanNum}')`];
        if (parsed.streetDirPrefix) {
          const cleanDir = sanitizeOData(parsed.streetDirPrefix);
          filterParts.push(`StreetDirPrefix eq '${cleanDir}'`);
        }
        if (parsed.streetName) {
          const cleanName = sanitizeOData(parsed.streetName).toLowerCase();
          filterParts.push(`contains(tolower(StreetName),'${cleanName}')`);
        }
        const filter = filterParts.join(' and ');
        diag.cotality.odataFilter = filter;

        const odataParams = new URLSearchParams({
          $filter: filter,
          $select: SELECT,
          $orderby: 'ListPrice desc',
          $top: '20',
        });

        const res = await fetch(`${TRESTLE_URL}/odata/Property?${odataParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        });

        diag.cotality.httpStatus = res.status;

        if (res.ok) {
          const data = await res.json();
          const records: TrestleRecord[] = data.value || [];
          diag.cotality.resultCount = records.length;
          diag.cotality.firstThreeAddresses = records.slice(0, 3).map(formatAddress);

          if (records.length > 0) cotHadResults = true;
          if (records.length === 0) {
            diag.errorClass = 'cotality_zero_results';
          }

          for (const r of records) {
            const fullAddr = formatAddress(r);
            // Same building-identity key as the DB path so a Cotality record
            // enriches (not duplicates) a DB-built building — and so the saved
            // building-profile values already merged onto that DB object survive
            // (buildingExtras has no profile keys, so mergeMissingExtras here
            // never touches them). (Building identity merge.)
            const _addrKey = addressIdentityKey(r);
            const _aoKey = addressOnlyKey(r);
            const _bkKey = (r.BuildingKeyNumeric != null && r.BuildingKeyNumeric !== '') ? 'BK:' + String(r.BuildingKeyNumeric) : null;
            // Dedup via the SAME identity resolution as the DB path (BK → full
            // address+borough+zip → guarded address-only) so a Cotality record
            // ENRICHES a DB-built building — incl. older DB rows lacking
            // BuildingKeyNumeric, or partial rows missing borough/zip — rather
            // than duplicating it. (Codex #301 + Codex review 2026-05-31)
            const existing = findRegisteredBuilding(
              buildingByKey, buildingByAddrOnly, _bkKey, _addrKey, _aoKey,
              String(r.CityRegion ?? ''), String(r.PostalCode ?? ''),
            );
            if (existing) {
              mergeMissingExtras(existing, buildingExtras(r));
              // Carry this record's fuller borough/zip/building_key onto the
              // existing building so the address-only guard can reject a later
              // different one, and the BK identity sticks once known.
              promoteIdentity(existing, String(r.CityRegion ?? ''), String(r.PostalCode ?? ''), _bkKey);
              // Re-register so any newly-known key (BK / fuller address) also
              // resolves to this object on a later row.
              registerBuilding(buildingByKey, buildingByAddrOnly, existing, _bkKey, _addrKey, _aoKey);
              continue;
            }

            const features = String(r.BuildingFeatures || '').toLowerCase();

            buildings.push({
              address: fullAddr,
              name: String(r.BuildingName || ''),
              borough: String(r.CityRegion || ''),
              city: String(r.City || ''),
              state: String(r.StateOrProvince || ''),
              zip: String(r.PostalCode || ''),
              neighborhood: String(r.SubdivisionName || ''),
              subdivisionName: String(r.SubdivisionName || ''),
              // Address atoms — surface separately so the form can save
              // them without re-parsing the display label.
              streetNumber: String(r.StreetNumber || ''),
              streetDirPrefix: String(r.StreetDirPrefix || ''),
              streetName: String(r.StreetName || ''),
              streetSuffix: String(r.StreetSuffix || ''),
              cross_street: String(r.CrossStreet || ''),
              crossStreet: String(r.CrossStreet || ''),
              source: 'cotality',
              common_interest: String(r.CommonInterest || r.OwnershipType || ''),
              structure_type: String(r.StructureType || ''),
              year_built: r.YearBuilt ? Number(r.YearBuilt) : null,
              year_built_details: String(r.YearBuiltDetails || ''),
              stories_total: r.StoriesTotal ? Number(r.StoriesTotal) : null,
              units_total: r.NumberOfUnitsInCommunity ? Number(r.NumberOfUnitsInCommunity) : null,
              new_construction_yn: r.NewConstructionYN === true,
              // No valid Cotality Property field for these on this feed
              // (NewDevelopmentYN / SponsorUnitYN / RentingAllowedYN are not in
              // $metadata) — left false for manual entry. DB path sets them
              // from stored features.
              new_development_yn: false,
              sponsor_unit_yn: false,
              renting_allowed_yn: false,
              tax_block: String(r.TaxBlock || ''),
              tax_lot: String(r.TaxLot || ''),
              tax_annual_amount: r.TaxAnnualAmount ? Number(r.TaxAnnualAmount) : null,
              association_name: String(r.AssociationName || ''),
              association_fee: r.AssociationFee ? Number(r.AssociationFee) : null,
              association_fee_frequency: String(r.AssociationFeeFrequency || ''),
              zoning_description: String(r.ZoningDescription || ''),
              // Amenity flags derived from BuildingFeatures (valid Multi enum).
              // 'Doorman' is not a BuildingFeatures member on this feed, so the
              // Cotality path cannot auto-detect it — left for manual entry.
              doorman: features.includes('doorman'),
              elevator: features.includes('elevator'),
              gym: features.includes('healthclub') || features.includes('fitness'),
              pool: features.includes('pool'),
              laundry: features.includes('laundry'),
              parking: features.includes('parking') || features.includes('garage'),
              concierge: features.includes('concierge'),
              // Expanded amenity flags derived from BuildingFeatures
              roof_deck: features.includes('roof deck') || features.includes('roof terrace'),
              storage: features.includes('storage'),
              spa: features.includes('spa'),
              bike_room: features.includes('bike'),
              package_room: features.includes('package'),
              lounge: features.includes('lounge'),
              playroom: features.includes('playroom') || features.includes('children'),
              business_center: features.includes('business center'),
              conference_room: features.includes('conference'),
              cold_storage: features.includes('cold storage'),
              courtyard: features.includes('courtyard'),
              valet: features.includes('valet'),
              wheelchair_access: features.includes('wheelchair') || features.includes('ada'),
              live_in_super: features.includes('live-in super') || features.includes('live in superintendent'),
              on_site_manager: features.includes('on-site') || features.includes('property manager'),
              washer_dryer_allowed: features.includes('washer') || features.includes('w/d'),
              ...buildingExtras(r),
            });
            registerBuilding(buildingByKey, buildingByAddrOnly, buildings[buildings.length - 1], _bkKey, _addrKey, _aoKey);
          }
        } else {
          diag.errorClass = 'cotality_non_200';
          diag.errorMessage = `Cotality returned HTTP ${res.status}`;
        }
      } catch (trestleErr) {
        const errMsg = trestleErr instanceof Error ? trestleErr.message : String(trestleErr);
        if (errMsg.includes('IDX Auth') || errMsg.includes('Missing IDX_CLIENT')) {
          diag.errorClass = 'token_failed';
          diag.errorMessage = 'Cotality token acquisition failed';
        } else {
          diag.errorClass = diag.errorClass === 'none' ? 'unknown' : diag.errorClass;
          diag.errorMessage = 'Cotality request failed';
        }
        console.warn('[/api/buildings/search] Trestle error:', trestleErr);
      }
    }

    // Compute result source
    if (dbHadResults && cotHadResults) diag.resultSource = 'both';
    else if (dbHadResults) diag.resultSource = 'db';
    else if (cotHadResults) diag.resultSource = 'cotality';
    else diag.resultSource = 'none';

    // Build error hint for frontend
    let errorHint: string | undefined;
    if (buildings.length === 0) {
      if (diag.errorClass === 'cotality_non_200' || diag.errorClass === 'token_failed' || diag.errorClass === 'unknown') {
        errorHint = 'Building lookup temporarily unavailable.';
      } else {
        errorHint = 'No Cotality/Trestle building match found.';
      }
    }

    const response: Record<string, unknown> = { buildings };
    if (errorHint) response._errorHint = errorHint;
    if (debugMode) response._debug = diag;

    return NextResponse.json(response);
  } catch (err) {
    diag.errorClass = 'db_error';
    diag.errorMessage = 'Internal server error';
    console.error('[/api/buildings/search] Error:', err);
    const response: Record<string, unknown> = {
      buildings: [],
      _errorHint: 'Building lookup temporarily unavailable.',
    };
    if (debugMode) response._debug = diag;
    return NextResponse.json(response, { status: 500 });
  }
}
