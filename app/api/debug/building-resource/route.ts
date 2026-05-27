// TEMPORARY DIAGNOSTIC — Probes /odata/Building to determine what REBNY's
// IDX Plus feed actually returns. Broker-only. Remove after investigation.
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, isAuthError } from '@/lib/auth';
import { getAccessToken } from '@/lib/idx/auth';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (isAuthError(auth)) return auth;

  const results: Record<string, unknown> = {
    probe: 'building-resource',
    timestamp: new Date().toISOString(),
    tests: {},
  };

  let token: string;
  try {
    token = await getAccessToken();
    results.tokenAcquired = true;
  } catch (err) {
    results.tokenAcquired = false;
    results.tokenError = err instanceof Error ? err.message : String(err);
    return NextResponse.json(results);
  }

  // Test 1: GET /odata/Building?$top=1 (no $select — see what comes back)
  try {
    const res = await fetch(`${TRESTLE_URL}/odata/Building?$top=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body = await res.text();
    (results.tests as Record<string, unknown>).building_top1 = {
      status: res.status,
      statusText: res.statusText,
      body: body.length > 5000 ? body.slice(0, 5000) + '...(truncated)' : body,
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).building_top1 = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Test 2: GET /odata/Building?$top=1&$select=BuildingKey
  try {
    const res = await fetch(`${TRESTLE_URL}/odata/Building?$top=1&$select=BuildingKey`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body = await res.text();
    (results.tests as Record<string, unknown>).building_select_key = {
      status: res.status,
      body: body.length > 2000 ? body.slice(0, 2000) + '...(truncated)' : body,
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).building_select_key = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Test 3: GET /odata/Building?$top=1&$expand=Property($top=1;$select=StreetNumber,StreetName,StreetDirPrefix,PostalCode,BuildingName,YearBuilt,StoriesTotal,CommonInterest,CityRegion)
  try {
    const expandSelect = 'StreetNumber,StreetName,StreetDirPrefix,StreetSuffix,PostalCode,BuildingName,YearBuilt,StoriesTotal,NumberOfUnitsTotal,CommonInterest,CityRegion,SubdivisionName';
    const res = await fetch(
      `${TRESTLE_URL}/odata/Building?$top=1&$expand=Property($top=3;$select=${expandSelect})`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const body = await res.text();
    (results.tests as Record<string, unknown>).building_expand_property = {
      status: res.status,
      body: body.length > 5000 ? body.slice(0, 5000) + '...(truncated)' : body,
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).building_expand_property = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Test 4: GET /odata/Building/$count — how many buildings total
  try {
    const res = await fetch(`${TRESTLE_URL}/odata/Building/$count`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/plain' },
    });
    const body = await res.text();
    (results.tests as Record<string, unknown>).building_count = {
      status: res.status,
      count: body,
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).building_count = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Test 5: For comparison — /odata/Property for 333 E 46th (proven working)
  try {
    const res = await fetch(
      `${TRESTLE_URL}/odata/Property?$top=3&$filter=startswith(StreetNumber,'333') and StreetDirPrefix eq 'E' and contains(tolower(StreetName),'46')&$select=ListingId,BuildingKeyNumeric,BuildingName,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,PostalCode,YearBuilt,StoriesTotal,CommonInterest,CityRegion`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const body = await res.text();
    (results.tests as Record<string, unknown>).property_333_e_46th = {
      status: res.status,
      body: body.length > 5000 ? body.slice(0, 5000) + '...(truncated)' : body,
    };
  } catch (err) {
    (results.tests as Record<string, unknown>).property_333_e_46th = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
