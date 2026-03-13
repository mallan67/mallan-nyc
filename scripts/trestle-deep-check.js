#!/usr/bin/env node
/**
 * Deep investigation: What does Trestle ACTUALLY return on the IDX Plus feed?
 * Traces each audit failure to its root cause.
 */
require('dotenv').config({ path: '.env.local' });

const API = process.env.TRESTLE_API_URL;
const CID = process.env.IDX_CLIENT_ID;
const SEC = process.env.IDX_CLIENT_SECRET;

async function getToken() {
  const res = await fetch(`${API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: SEC, scope: 'api' }),
  });
  const d = await res.json();
  return d.access_token;
}

async function query(token, select, filter, top) {
  const params = new URLSearchParams();
  params.set('$select', select);
  if (filter) params.set('$filter', filter);
  params.set('$top', String(top || 5));
  const url = `${API}/odata/Property?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { error: true, status: res.status, body: body.substring(0, 300) };
  }
  return await res.json();
}

async function run() {
  const token = await getToken();

  // ──────────────────────────────────────────────────────
  // TEST 1: MlsStatus vs StandardStatus
  // Root cause: Our mapper has RESO_TO_RLS_RENAMES: MlsStatus → StandardStatus
  // Does Trestle send MlsStatus, StandardStatus, or both?
  // ──────────────────────────────────────────────────────
  console.log('=== TEST 1: MlsStatus vs StandardStatus ===');
  const t1 = await query(token, 'ListingId,MlsStatus,StandardStatus', "StandardStatus eq 'Active'", 5);
  if (t1.error) {
    console.log('  ERROR:', t1.status, t1.body);
  } else {
    t1.value.forEach(l => {
      console.log(`  ${l.ListingId} | MlsStatus=${l.MlsStatus} | StandardStatus=${l.StandardStatus}`);
    });
  }

  // ──────────────────────────────────────────────────────
  // TEST 2: Latitude/Longitude
  // Root cause: 0% had geo coords in audit. Are they on the feed?
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 2: Latitude/Longitude ===');
  const t2 = await query(token, 'ListingId,Latitude,Longitude,StreetName,City', "StandardStatus eq 'Active'", 5);
  if (t2.error) {
    console.log('  ERROR:', t2.status, t2.body);
  } else {
    t2.value.forEach(l => {
      console.log(`  ${l.ListingId} | Lat=${l.Latitude} | Lng=${l.Longitude} | ${l.StreetName}, ${l.City}`);
    });
  }

  // ──────────────────────────────────────────────────────
  // TEST 3: ListingAgreement actual values from Trestle
  // Root cause: 6 listings had "CoExclusiveAgency" — is that a valid RLS value?
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 3: ListingAgreement value distribution ===');
  const t3 = await query(token, 'ListingId,ListingAgreement', "StandardStatus eq 'Active'", 200);
  if (t3.error) {
    console.log('  ERROR:', t3.status, t3.body);
  } else {
    const dist = {};
    t3.value.forEach(l => {
      const v = l.ListingAgreement || '(null)';
      dist[v] = (dist[v] || 0) + 1;
    });
    console.log('  Distribution across 200 listings:');
    Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      console.log(`    ${k}: ${v}`);
    });
  }

  // ──────────────────────────────────────────────────────
  // TEST 4: IDX-excluded fields — which ones return data?
  // Each tested individually to isolate which cause 400 errors
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 4: Field-by-field availability check ===');
  const testFields = [
    'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN',
    'IDXEntireListingDisplayYN', 'IDXParticipationYN',
    'ShowingInstructions', 'ExpirationDate', 'Concessions',
    'AttendanceType', 'NewDevelopmentYN', 'BathroomsTotal',
    'Latitude', 'Longitude', 'MlsStatus',
    'SourceSystemKey', 'DaysOnMarket', 'CumulativeDaysOnMarket',
    'WalkScore', 'SyndicateTo', 'PropertyCondition',
    'ConcessionsAmount', 'VirtualTourURLBranded',
    'CoBrokeAgreement', 'BuildingLaundryFeatures', 'BuildingPetsAllowed',
    'PetsAllowed', 'ElevatorsTotal', 'StoriesTotal',
    'SubdivisionName', 'PostalCity', 'CityRegion',
    'ListingContractDate', 'SyndicateYN',
  ];

  for (const field of testFields) {
    const res = await query(token, `ListingId,${field}`, "StandardStatus eq 'Active'", 3);
    if (res.error) {
      console.log(`  ${field}: ✗ NOT AVAILABLE (HTTP ${res.status})`);
    } else {
      const hasData = res.value.some(l => l[field] !== null && l[field] !== undefined);
      const sample = res.value[0]?.[field];
      if (hasData) {
        console.log(`  ${field}: ✓ AVAILABLE (sample: ${JSON.stringify(sample).substring(0, 60)})`);
      } else {
        console.log(`  ${field}: ⚠ QUERYABLE but NULL in all 3 samples`);
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // TEST 5: Endpoint migration — verify only api.cotality.com
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 5: Endpoint migration ===');
  console.log(`  TRESTLE_API_URL = ${process.env.TRESTLE_API_URL}`);
  console.log(`  IDX_ENDPOINT = ${process.env.IDX_ENDPOINT || '(not set)'}`);

  // Check if old endpoints are reachable (migration verification — intentional reference)
  // eslint-disable-next-line -- deprecated hosts referenced intentionally for migration testing
  const deprecatedHosts = ['https://api-trestle.corelogic.com/trestle', 'https://api-prod.corelogic.com/trestle'];
  for (const oldHost of deprecatedHosts) {
    try {
      const r = await fetch(`${oldHost}/odata/Property?$top=1`, {
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`  ${oldHost} → HTTP ${r.status} (STILL REACHABLE)`);
    } catch (e) {
      console.log(`  ${oldHost} → DEAD (${e.cause?.code || e.message})`);
    }
  }

  // ──────────────────────────────────────────────────────
  // TEST 6: Data quality — what's actually missing from the 15% rejection?
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 6: Data quality — field-level gaps in 50 listings ===');
  const t6 = await query(token, 'ListingId,PropertyType,ListPrice,BedroomsTotal,BathroomsFull,StreetName,City,PostalCode,RoomsTotal,YearBuilt,CommonInterest,StructureType', "StandardStatus eq 'Active'", 50);
  if (!t6.error) {
    const gaps = {};
    const checkFields = ['ListPrice','BedroomsTotal','BathroomsFull','StreetName','City','PostalCode','RoomsTotal','YearBuilt','CommonInterest','StructureType'];
    for (const f of checkFields) gaps[f] = 0;
    for (const l of t6.value) {
      for (const f of checkFields) {
        if (l[f] === null || l[f] === undefined || l[f] === '' || l[f] === 0) {
          gaps[f]++;
        }
      }
    }
    console.log('  Missing/zero values per field (out of 50):');
    for (const [f, count] of Object.entries(gaps)) {
      console.log(`    ${f}: ${count} missing (${Math.round(count/50*100)}%)`);
    }
  }

  // ──────────────────────────────────────────────────────
  // TEST 7: $expand=Media — full photo count vs $top limit
  // ──────────────────────────────────────────────────────
  console.log('\n=== TEST 7: $expand=Media with different $top values ===');
  const mediaParams = new URLSearchParams();
  mediaParams.set('$select', 'ListingId,PhotosCount');
  mediaParams.set('$filter', "StandardStatus eq 'Active'");
  mediaParams.set('$top', '3');
  mediaParams.set('$expand', "Media($select=MediaURL,MediaCategory,Order;$top=50;$orderby=Order)");
  const t7 = await fetch(`${API}/odata/Property?${mediaParams.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (t7.ok) {
    const d7 = await t7.json();
    d7.value.forEach(l => {
      const mediaCount = Array.isArray(l.Media) ? l.Media.length : 0;
      console.log(`  ${l.ListingId}: PhotosCount=${l.PhotosCount}, $expand returned=${mediaCount}`);
    });
  } else {
    console.log('  $expand=Media($top=50) →', t7.status, await t7.text().catch(() => ''));
  }
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
