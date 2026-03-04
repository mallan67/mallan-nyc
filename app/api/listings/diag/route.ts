import { NextResponse } from 'next/server';
import { getAccessToken, hasCredentials } from '@/lib/idx/auth';
import { IDX_PLUS_SELECT_FIELDS } from '@/lib/idx/trestle-mapper';

/**
 * GET /api/listings/diag — temporary diagnostic endpoint.
 * Tests Trestle connectivity step by step. DELETE after verified.
 */
export async function GET() {
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    idxEnabled: process.env.IDX_ENABLED,
    hasCredentials: hasCredentials(),
    trestleUrl: process.env.TRESTLE_API_URL ? 'SET' : 'NOT_SET',
    selectFieldCount: IDX_PLUS_SELECT_FIELDS.length,
  };

  try {
    // Step 1: Get token
    const token = await getAccessToken();
    diag.tokenOk = true;
    diag.tokenLength = token.length;
  } catch (e) {
    diag.tokenOk = false;
    diag.tokenError = e instanceof Error ? e.message : String(e);
    return NextResponse.json(diag, { status: 500 });
  }

  try {
    // Step 2: Try a minimal query
    const token = await getAccessToken();
    const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
    const url = `${base}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active'")}&$top=1&$select=ListingId,ListPrice,StandardStatus`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    diag.queryStatus = res.status;
    if (res.ok) {
      const data = await res.json();
      diag.queryOk = true;
      diag.listingsReturned = (data.value || []).length;
      if (data.value?.[0]) {
        diag.sampleListing = data.value[0];
      }
    } else {
      diag.queryOk = false;
      diag.queryError = (await res.text()).substring(0, 500);
    }
  } catch (e) {
    diag.queryOk = false;
    diag.queryError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(diag, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
