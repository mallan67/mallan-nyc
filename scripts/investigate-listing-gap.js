/**
 * scripts/investigate-listing-gap.js
 * Investigates the gap between Trestle active count and mallan.nyc /api/listings count.
 */
require('dotenv').config({ path: '.env.local' });
const API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function getToken() {
  const r = await fetch(`${API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IDX_CLIENT_ID,
      client_secret: process.env.IDX_CLIENT_SECRET,
      scope: 'api',
    }),
  });
  const j = await r.json();
  return j.access_token;
}

async function odataCount(token, entity, filter) {
  const url = `${API}/odata/${entity}?$top=0&$count=true&$filter=${encodeURIComponent(filter)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: `${r.status}` };
  const j = await r.json();
  return { count: j['@odata.count'] };
}

async function odataSample(token, entity, filter, fields, top = 3) {
  const url = `${API}/odata/${entity}?$select=${fields}&$filter=${encodeURIComponent(filter)}&$top=${top}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { error: `${r.status} ${await r.text().catch(()=>'')}` };
  const j = await r.json();
  return { rows: j.value };
}

async function fetchPublic(path) {
  const r = await fetch(`https://mallan.nyc${path}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) return { error: `${r.status}` };
  const j = await r.json();
  return { json: j, total: j.total ?? j.count ?? j.pagination?.total ?? (Array.isArray(j) ? j.length : null) };
}

(async () => {
  const token = await getToken();
  console.log('TOKEN_OK\n');

  // 1. What PropertyType values exist in active listings?
  console.log('Sample PropertyType + StandardStatus values from active listings:');
  const sample = await odataSample(token, 'Property', `StandardStatus eq 'Active'`, 'ListingKey,StandardStatus,PropertyType,PropertySubType,MlsStatus,City,StateOrProvince', 5);
  if (sample.rows) sample.rows.forEach(r => console.log(' ', JSON.stringify(r)));
  else console.log(' ', sample.error);

  // 2. By state — is Trestle returning non-NY listings?
  console.log('\nActive listings by state:');
  for (const state of ['NY', 'NJ', 'CT']) {
    const r = await odataCount(token, 'Property', `StandardStatus eq 'Active' and StateOrProvince eq '${state}'`);
    console.log(`  ${state}: ${r.count ?? r.error}`);
  }

  // 3. By city — is Trestle returning non-NYC?
  console.log('\nActive listings by NYC borough (City field):');
  for (const city of ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']) {
    const r = await odataCount(token, 'Property', `StandardStatus eq 'Active' and City eq '${city}'`);
    console.log(`  ${city}: ${r.count ?? r.error}`);
  }

  // 4. What does /api/listings return with various pagination?
  console.log('\n/api/listings probes:');
  for (const url of [
    '/api/listings?limit=1',
    '/api/listings?limit=1&page=1',
    '/api/listings?status=Active&limit=1',
    '/api/listings?type=sale&limit=1',
    '/api/listings?type=rent&limit=1',
  ]) {
    const r = await fetchPublic(url);
    if (r.json) {
      console.log(`  ${url} → total=${r.total} keys=${Object.keys(r.json).join(',')}`);
    } else {
      console.log(`  ${url} → ${r.error}`);
    }
  }

  // 5. /api/health
  console.log('\n/api/health body:');
  try {
    const r = await fetch('https://mallan.nyc/api/health', { signal: AbortSignal.timeout(10000) });
    console.log(JSON.stringify(await r.json(), null, 2));
  } catch (e) {
    console.log('  err:', e.message);
  }

  // 6. Trestle: Try alternate gate field names that returned n/a
  console.log('\nGate field probes (singular vs alternate names):');
  const probes = [
    `IDXEntireListingDisplayYN eq false`,
    `OwnerOptOutYN eq true`,
    `ParticipantOnlyYN eq true`,
    `MlsStatus eq 'ComingSoon'`,
    `MlsStatus eq 'Coming Soon'`,
    `PropertyType eq 'Residential Lease'`,
    `PropertyType eq 'ResidentialLease'`,
    `PropertyType eq 'Residential Income'`,
  ];
  for (const f of probes) {
    const r = await odataCount(token, 'Property', `StandardStatus eq 'Active' and ${f}`);
    console.log(`  ${f}: ${r.count ?? r.error}`);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
