// Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §18 (CRM Building Lookup)
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';

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
  const seenAddresses = new Set<string>();
  let dbHadResults = false;
  let cotHadResults = false;

  // Aggregate multiple unit listings into one building candidate.
  // Groups by building key (StreetNumber-StreetName-PostalCode), then picks
  // the best value for each field across all units. Majority vote for
  // CommonInterest so a building with 8 Co-op units and 2 Condop units
  // correctly reports the dominant type.
  function aggregateBuilding(records: Array<{ address: Record<string, unknown>; features: Record<string, unknown> | null; property_type: string | null; property_sub_type: string | null }>): Record<string, unknown> | null {
    if (records.length === 0) return null;
    const first = records[0];
    const addr = first.address;

    // Majority vote for CommonInterest
    const ciCounts: Record<string, number> = {};
    records.forEach(r => {
      const ci = String(r.features?.CommonInterest || r.property_sub_type || '');
      if (ci) ciCounts[ci] = (ciCounts[ci] || 0) + 1;
    });
    let bestCI = '';
    let bestCICount = 0;
    for (const [ci, count] of Object.entries(ciCounts)) {
      if (count > bestCICount) { bestCI = ci; bestCICount = count; }
    }

    // Pick best non-null value for each building fact across all units
    let yearBuilt: number | null = null;
    let storiesTotal: number | null = null;
    let unitsTotal: number | null = null;
    let buildingName = '';
    let structureType = '';
    let borough = '';
    let neighborhood = '';
    const amenities = { doorman: false, elevator: false, gym: false, pool: false, laundry: false, parking: false, concierge: false, spa: false };

    records.forEach(r => {
      const a = r.address;
      const f = r.features;
      if (!buildingName && a.BuildingName) buildingName = String(a.BuildingName);
      if (!borough && a.CityRegion) borough = String(a.CityRegion);
      if (!neighborhood && a.SubdivisionName) neighborhood = String(a.SubdivisionName);
      if (!structureType && f?.StructureType) structureType = String(f.StructureType);
      if (yearBuilt === null && f?.YearBuilt) yearBuilt = Number(f.YearBuilt);
      if (storiesTotal === null && f?.StoriesTotal) storiesTotal = Number(f.StoriesTotal);
      if (unitsTotal === null && f?.NumberOfUnitsTotal) unitsTotal = Number(f.NumberOfUnitsTotal);
      const bf = String(f?.BuildingFeatures || '').toLowerCase();
      const at = String(f?.AttendanceType || '').toLowerCase();
      if (at.includes('doorman')) amenities.doorman = true;
      if (bf.includes('elevator') || f?.ElevatorYN) amenities.elevator = true;
      if (bf.includes('healthclub') || bf.includes('fitness') || bf.includes('gym')) amenities.gym = true;
      if (bf.includes('pool')) amenities.pool = true;
      if (bf.includes('laundry')) amenities.laundry = true;
      if (bf.includes('parking') || bf.includes('garage')) amenities.parking = true;
      if (at.includes('concierge')) amenities.concierge = true;
      if (bf.includes('spa')) amenities.spa = true;
    });

    return {
      address: formatAddress(addr),
      name: buildingName,
      borough,
      zip: String(addr.PostalCode || ''),
      neighborhood,
      common_interest: bestCI,
      structure_type: structureType,
      year_built: yearBuilt,
      stories_total: storiesTotal,
      units_total: unitsTotal,
      units_found: records.length,
      source: 'db',
      ...amenities,
    };
  }

  try {
    // ── 1. Search DB first — aggregate by building ──
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
      const sql = `SELECT address, features, property_type, property_sub_type FROM listings WHERE ${conditions.join(' AND ')} LIMIT 50`;
      const dbResults = await prisma.$queryRawUnsafe<Array<{
        address: unknown; features: unknown; property_type: string | null; property_sub_type: string | null;
      }>>(sql, ...params);

      diag.localDbResultCount = dbResults.length;
      if (dbResults.length > 0) dbHadResults = true;

      // Group by building address key
      const buildingGroups = new Map<string, Array<{ address: Record<string, unknown>; features: Record<string, unknown> | null; property_type: string | null; property_sub_type: string | null }>>();
      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (!buildingGroups.has(key)) buildingGroups.set(key, []);
        buildingGroups.get(key)!.push({ address: addr, features: feat, property_type: l.property_type, property_sub_type: l.property_sub_type });
      }

      for (const [key, group] of buildingGroups) {
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);
        const building = aggregateBuilding(group);
        if (building) buildings.push(building);
      }
    } else if (parsed.buildingName) {
      const dbResults = await prisma.listing.findMany({
        where: {
          address: { path: ['BuildingName'], string_contains: parsed.buildingName.toUpperCase() },
        },
        select: { address: true, features: true, property_type: true, property_sub_type: true },
        take: 20,
      });

      diag.localDbResultCount = dbResults.length;
      if (dbResults.length > 0) dbHadResults = true;

      const buildingGroups = new Map<string, Array<{ address: Record<string, unknown>; features: Record<string, unknown> | null; property_type: string | null; property_sub_type: string | null }>>();
      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (!buildingGroups.has(key)) buildingGroups.set(key, []);
        buildingGroups.get(key)!.push({ address: addr, features: feat, property_type: l.property_type, property_sub_type: l.property_sub_type });
      }

      for (const [key, group] of buildingGroups) {
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);
        const building = aggregateBuilding(group);
        if (building) buildings.push(building);
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
          'CityRegion', 'CountyOrParish',
          'BuildingFeatures', 'PetsAllowed', 'AttendanceType',
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

          // Group Trestle results by building, then aggregate
          const trestleGroups = new Map<string, TrestleRecord[]>();
          for (const r of records) {
            const key = `${r.StreetNumber}-${r.StreetName}-${r.PostalCode || ''}`.toUpperCase();
            if (seenAddresses.has(key)) continue;
            if (!trestleGroups.has(key)) trestleGroups.set(key, []);
            trestleGroups.get(key)!.push(r);
          }

          for (const [key, group] of trestleGroups) {
            seenAddresses.add(key);
            const first = group[0];

            // Majority vote for CommonInterest across units
            const ciCounts: Record<string, number> = {};
            group.forEach(r => {
              const ci = String(r.CommonInterest || r.OwnershipType || '');
              if (ci) ciCounts[ci] = (ciCounts[ci] || 0) + 1;
            });
            let bestCI = '';
            let bestCICount = 0;
            for (const [ci, count] of Object.entries(ciCounts)) {
              if (count > bestCICount) { bestCI = ci; bestCICount = count; }
            }

            // Aggregate best building facts
            let yearBuilt: number | null = null;
            let storiesTotal: number | null = null;
            let unitsTotal: number | null = null;
            let buildingName = '';
            let structureType = '';
            const amenities = { doorman: false, elevator: false, gym: false, pool: false, laundry: false, parking: false, concierge: false };
            group.forEach(r => {
              if (!buildingName && r.BuildingName) buildingName = String(r.BuildingName);
              if (!structureType && r.StructureType) structureType = String(r.StructureType);
              if (yearBuilt === null && r.YearBuilt) yearBuilt = Number(r.YearBuilt);
              if (storiesTotal === null && r.StoriesTotal) storiesTotal = Number(r.StoriesTotal);
              if (unitsTotal === null && r.NumberOfUnitsInCommunity) unitsTotal = Number(r.NumberOfUnitsInCommunity);
              const bf = String(r.BuildingFeatures || '').toLowerCase();
              const at = String(r.AttendanceType || '').toLowerCase();
              if (at.includes('doorman')) amenities.doorman = true;
              if (bf.includes('elevator')) amenities.elevator = true;
              if (bf.includes('healthclub') || bf.includes('fitness')) amenities.gym = true;
              if (bf.includes('pool')) amenities.pool = true;
              if (bf.includes('laundry')) amenities.laundry = true;
              if (bf.includes('parking') || bf.includes('garage')) amenities.parking = true;
              if (at.includes('concierge')) amenities.concierge = true;
            });

            buildings.push({
              address: formatAddress(first),
              name: buildingName,
              borough: String(first.CityRegion || ''),
              zip: String(first.PostalCode || ''),
              neighborhood: String(first.SubdivisionName || ''),
              common_interest: bestCI,
              structure_type: structureType,
              year_built: yearBuilt,
              stories_total: storiesTotal,
              units_total: unitsTotal,
              units_found: group.length,
              source: 'cotality',
              ...amenities,
            });
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
