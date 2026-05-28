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
      const sql = `SELECT address, features, property_type, property_sub_type FROM listings WHERE ${conditions.join(' AND ')} LIMIT 20`;
      const dbResults = await prisma.$queryRawUnsafe<Array<{
        address: unknown; features: unknown; property_type: string | null; property_sub_type: string | null;
      }>>(sql, ...params);

      diag.localDbResultCount = dbResults.length;
      if (dbResults.length > 0) dbHadResults = true;

      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const fullAddr = formatAddress(addr);
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);

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
        });
      }
    } else if (parsed.buildingName) {
      const dbResults = await prisma.listing.findMany({
        where: {
          address: { path: ['BuildingName'], string_contains: parsed.buildingName.toUpperCase() },
        },
        select: { address: true, features: true, property_type: true, property_sub_type: true },
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
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);

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
        });
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
          'BuildingFeatures', 'PetsAllowed', 'AttendanceType',
          // Expanded 2026-05-28: surface every Cotality field the CRM
          // building modal needs so populateBuildingFromIDX can set them
          // all and Maya does not have to retype anything that exists
          // upstream.
          'CrossStreet',
          'YearBuiltDetails', 'YearBuiltSource',
          'NewConstructionYN', 'NewDevelopmentYN', 'SponsorUnitYN',
          'RentingAllowedYN',
          'TaxBlock', 'TaxLot', 'TaxAnnualAmount',
          'AssociationName', 'AssociationFee', 'AssociationFeeFrequency',
          'ZoningDescription',
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
            const key = `${r.StreetNumber}-${r.StreetName}-${r.PostalCode || ''}`.toUpperCase();
            if (seenAddresses.has(key)) continue;
            seenAddresses.add(key);

            const features = String(r.BuildingFeatures || '').toLowerCase();
            const attendance = String(r.AttendanceType || '').toLowerCase();

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
              new_development_yn: r.NewDevelopmentYN === true,
              sponsor_unit_yn: r.SponsorUnitYN === true,
              renting_allowed_yn: r.RentingAllowedYN === true,
              tax_block: String(r.TaxBlock || ''),
              tax_lot: String(r.TaxLot || ''),
              tax_annual_amount: r.TaxAnnualAmount ? Number(r.TaxAnnualAmount) : null,
              association_name: String(r.AssociationName || ''),
              association_fee: r.AssociationFee ? Number(r.AssociationFee) : null,
              association_fee_frequency: String(r.AssociationFeeFrequency || ''),
              zoning_description: String(r.ZoningDescription || ''),
              // Existing amenity flags (preserved)
              doorman: attendance.includes('doorman'),
              elevator: features.includes('elevator'),
              gym: features.includes('healthclub') || features.includes('fitness'),
              pool: features.includes('pool'),
              laundry: features.includes('laundry'),
              parking: features.includes('parking') || features.includes('garage'),
              concierge: attendance.includes('concierge'),
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
              on_site_manager: features.includes('on-site') || attendance.includes('property manager'),
              washer_dryer_allowed: features.includes('washer') || features.includes('w/d'),
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
