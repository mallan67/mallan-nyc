import { NextResponse } from 'next/server';
import { fetchFromTrestle } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';

/**
 * Simple in-memory rate limiter (60 requests per minute per IP)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
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
 * GET /api/listings/suggest?q=...
 *
 * Address autocomplete for frontend search.
 * Returns top 8 matching suggestions with address, neighborhood, borough, zip.
 *
 * When IDX_ENABLED=true: queries Trestle OData with contains() on StreetName or PostalCode.
 * When IDX_ENABLED=false: returns empty array (local data doesn't support search well).
 *
 * COMPLIANCE: Same distribution gates as /api/listings. No agent PII returned.
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    const useIDX = process.env.IDX_ENABLED === 'true';

    if (!useIDX) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    // Build OData filter for address search
    // Search by street name (contains) or postal code (startsWith)
    const isZip = /^\d{3,5}$/.test(query);
    const escapedQuery = query.replace(/'/g, "''");

    const filterParts = [
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
    ];

    if (isZip) {
      filterParts.push(`startswith(PostalCode, '${escapedQuery}')`);
    } else {
      filterParts.push(`contains(StreetName, '${escapedQuery}')`);
    }

    const result = await fetchFromTrestle({
      filter: filterParts.join(' and '),
      top: 20,
      maxTotal: 20,
    });

    // Apply distribution gates
    const displayable = result.records.filter(
      (raw) => checkDistributionGates(raw).displayable
    );

    // Deduplicate by address and return top 8
    const seen = new Set<string>();
    const suggestions: {
      address: string;
      neighborhood: string;
      borough: string;
      postalCode: string;
    }[] = [];

    for (const raw of displayable) {
      if (suggestions.length >= 8) break;

      const streetNumber = String(raw.StreetNumber || '');
      const streetName = [
        raw.StreetDirPrefix,
        raw.StreetName,
        raw.StreetSuffix,
        raw.StreetDirSuffix,
      ].filter(Boolean).map(String).join(' ');

      const fullAddress = `${streetNumber} ${streetName}`.trim();

      // Suppress address when InternetAddressDisplayYN is false
      if (raw.InternetAddressDisplayYN === false) continue;

      const key = `${fullAddress}-${raw.PostalCode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // County → Borough
      const county = String(raw.CountyOrParish || '').toLowerCase();
      let borough = String(raw.CountyOrParish || '');
      if (county.includes('new york')) borough = 'Manhattan';
      else if (county.includes('kings')) borough = 'Brooklyn';
      else if (county.includes('queens')) borough = 'Queens';
      else if (county.includes('bronx')) borough = 'Bronx';
      else if (county.includes('richmond')) borough = 'Staten Island';

      suggestions.push({
        address: fullAddress,
        neighborhood: String(raw.CityRegion || ''),
        borough,
        postalCode: String(raw.PostalCode || ''),
      });
    }

    return NextResponse.json(
      { success: true, suggestions },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    console.error('[/api/listings/suggest] Error:', error);
    return NextResponse.json(
      { success: true, suggestions: [] },
      { status: 200 }
    );
  }
}
