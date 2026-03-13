import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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
 * Parse a free-text address query into components.
 * Examples:
 *   "157 W 57th" → { streetNumber: "157", streetName: "W 57TH" }
 *   "400 East 90th Street" → { streetNumber: "400", streetName: "EAST 90TH" }
 *   "One57" → { buildingName: "One57" }
 */
function parseAddressQuery(q: string): {
  streetNumber?: string;
  streetName?: string;
  buildingName?: string;
} {
  const trimmed = q.trim();
  // Try to match "123 Street Name..."
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match) {
    let streetName = match[2]
      .replace(/\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Pl|Place|Ct|Court|Ln|Lane|Way|Terrace|Ter)\.?\s*$/i, '')
      .trim()
      .toUpperCase();
    return { streetNumber: match[1], streetName };
  }
  // No leading number — treat as building name search
  return { buildingName: trimmed };
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
 * COMPLIANCE: Server-side only, rate limited, no MLS credentials exposed.
 */
export async function GET(request: NextRequest) {
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
    // ── 1. Search DB first (fast) ──
    if (parsed.streetNumber && parsed.streetName) {
      const dbResults = await prisma.listing.findMany({
        where: {
          AND: [
            { address: { path: ['StreetNumber'], equals: parsed.streetNumber } },
            { address: { path: ['StreetName'], string_contains: parsed.streetName } },
          ],
        },
        select: {
          address: true,
          features: true,
          property_type: true,
          property_sub_type: true,
        },
        take: 20,
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
    if (buildings.length < 5 && parsed.streetNumber && parsed.streetName) {
      try {
        const token = await getAccessToken();
        const cleanNum = sanitizeOData(parsed.streetNumber);
        const cleanName = sanitizeOData(parsed.streetName);

        const SELECT = [
          'ListingId', 'BuildingName', 'YearBuilt', 'StoriesTotal',
          'NumberOfUnitsInCommunity', 'CommonInterest', 'OwnershipType',
          'PropertyType', 'PropertySubType', 'StructureType',
          'StreetNumber', 'StreetName', 'StreetSuffix', 'StreetDirPrefix',
          'PostalCode', 'UnitNumber', 'SubdivisionName',
          'BuildingFeatures', 'PetsAllowed', 'AttendanceType',
        ].join(',');

        const filter = `StreetNumber eq '${cleanNum}' and contains(StreetName,'${cleanName}')`;
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
