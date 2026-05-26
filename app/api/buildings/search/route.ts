import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { sanitizeOData } from '@/lib/sanitize';
import { getAccessToken } from '@/lib/idx/auth';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

/**
 * Rate limiter — 20 requests per minute per IP.
 */
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

/**
 * RESO/Cotality directional abbreviation map.
 * Trestle stores StreetDirPrefix as the short form ("E", "W", "N", "S").
 */
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

/**
 * Parse a free-text address query into RESO/Cotality-aligned components.
 *
 * Matches the proven Cotality OData pattern from lib/search/public-listing-trestle.ts.
 * Cotality stores: StreetNumber + StreetDirPrefix(enum) + StreetName + StreetSuffix
 *   e.g. "333" + "E" + "46" + "St"  (ordinal stripped by Cotality)
 *
 * Examples:
 *   "333 East"            → { streetNumber: "333", streetDirPrefix: "E" }
 *   "333 East 46th Street"→ { streetNumber: "333", streetDirPrefix: "E", streetName: "46" }
 *   "333 E 46th St"       → { streetNumber: "333", streetDirPrefix: "E", streetName: "46" }
 *   "333 46th"            → { streetNumber: "333", streetName: "46" }
 *   "157 W 57th"          → { streetNumber: "157", streetDirPrefix: "W", streetName: "57" }
 *   "One57"               → { buildingName: "One57" }
 */
function parseAddressQuery(q: string): {
  streetNumber?: string;
  streetDirPrefix?: string;
  streetName?: string;
  buildingName?: string;
} {
  const trimmed = q.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return { buildingName: trimmed };
  }

  const streetNumber = match[1];
  let rest = stripSuffix(match[2]);

  // Detect RESO directional prefix as the first token after street number
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

interface TrestleRecord {
  [key: string]: unknown;
}

/**
 * GET /api/buildings/search?q=157+W+57th
 *
 * Free-text building search for the CRM listing forms.
 * Returns a simplified list of matching buildings with key fields.
 *
 * COMPLIANCE: Agent/broker only, server-side, rate limited, no MLS credentials exposed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) return auth;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.length < 3) {
    return NextResponse.json({ buildings: [] });
  }

  const parsed = parseAddressQuery(q);
  const buildings: Array<Record<string, unknown>> = [];
  const seenAddresses = new Set<string>();

  try {
    // ── 1. Search DB first (fast, case-insensitive via raw SQL) ──
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

      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const fullAddr = `${addr.StreetNumber || ''} ${addr.StreetDirPrefix ? addr.StreetDirPrefix + ' ' : ''}${addr.StreetName || ''} ${addr.StreetSuffix || ''}`.trim();
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);

        buildings.push({
          address: fullAddr,
          name: String(addr.BuildingName || ''),
          borough: String(addr.CityRegion || ''),
          zip: String(addr.PostalCode || ''),
          neighborhood: String(addr.SubdivisionName || ''),
          common_interest: String(feat?.CommonInterest || l.property_sub_type || ''),
          structure_type: String(feat?.StructureType || ''),
          year_built: feat?.YearBuilt ? Number(feat.YearBuilt) : null,
          stories_total: feat?.StoriesTotal ? Number(feat.StoriesTotal) : null,
          units_total: feat?.NumberOfUnitsTotal ? Number(feat.NumberOfUnitsTotal) : null,
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

      for (const l of dbResults) {
        const addr = l.address as Record<string, unknown>;
        const feat = l.features as Record<string, unknown> | null;
        const fullAddr = `${addr.StreetNumber || ''} ${addr.StreetName || ''} ${addr.StreetSuffix || ''}`.trim();
        const key = `${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || ''}`.toUpperCase();
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);

        buildings.push({
          address: fullAddr,
          name: String(addr.BuildingName || ''),
          borough: String(addr.CityRegion || ''),
          zip: String(addr.PostalCode || ''),
          neighborhood: String(addr.SubdivisionName || ''),
          common_interest: String(feat?.CommonInterest || l.property_sub_type || ''),
          structure_type: String(feat?.StructureType || ''),
          year_built: feat?.YearBuilt ? Number(feat.YearBuilt) : null,
          stories_total: feat?.StoriesTotal ? Number(feat.StoriesTotal) : null,
          units_total: feat?.NumberOfUnitsTotal ? Number(feat.NumberOfUnitsTotal) : null,
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
        const params = new URLSearchParams({
          $filter: filter,
          $select: SELECT,
          $orderby: 'ListPrice desc',
          $top: '20',
        });

        const res = await fetch(`${TRESTLE_URL}/odata/Property?${params}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 3600 },
        });

        if (res.ok) {
          const data = await res.json();
          const records: TrestleRecord[] = data.value || [];

          for (const r of records) {
            const fullAddr = `${r.StreetNumber || ''} ${r.StreetDirPrefix ? r.StreetDirPrefix + ' ' : ''}${r.StreetName || ''} ${r.StreetSuffix || ''}`.trim();
            const key = `${r.StreetNumber}-${r.StreetName}-${r.PostalCode || ''}`.toUpperCase();
            if (seenAddresses.has(key)) continue;
            seenAddresses.add(key);

            // Detect amenities from building features
            const features = String(r.BuildingFeatures || '').toLowerCase();
            const attendance = String(r.AttendanceType || '').toLowerCase();

            buildings.push({
              address: fullAddr,
              name: String(r.BuildingName || ''),
              borough: '',
              zip: String(r.PostalCode || ''),
              neighborhood: String(r.SubdivisionName || ''),
              common_interest: String(r.CommonInterest || r.OwnershipType || ''),
              structure_type: String(r.StructureType || ''),
              year_built: r.YearBuilt ? Number(r.YearBuilt) : null,
              stories_total: r.StoriesTotal ? Number(r.StoriesTotal) : null,
              units_total: r.NumberOfUnitsInCommunity ? Number(r.NumberOfUnitsInCommunity) : null,
              doorman: attendance.includes('doorman'),
              elevator: features.includes('elevator'),
              gym: features.includes('healthclub') || features.includes('fitness'),
              pool: features.includes('pool'),
              laundry: features.includes('laundry'),
              parking: features.includes('parking') || features.includes('garage'),
              concierge: attendance.includes('concierge'),
            });
          }
        }
      } catch (trestleErr) {
        console.warn('[/api/buildings/search] Trestle error:', trestleErr);
      }
    }

    return NextResponse.json({ buildings });
  } catch (err) {
    console.error('[/api/buildings/search] Error:', err);
    return NextResponse.json({ buildings: [] });
  }
}
