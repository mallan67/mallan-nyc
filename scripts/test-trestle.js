// Quick test: query Trestle API directly and report what we get
require('dotenv').config({ path: '.env.local' });

const CLIENT_ID = process.env.IDX_CLIENT_ID;
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET;
const API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function main() {
  // 1. Get token
  console.log('API URL:', API_URL);
  console.log('Client ID:', CLIENT_ID);

  const tokenRes = await fetch(`${API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=api`,
  });

  if (!tokenRes.ok) {
    console.error('Token failed:', tokenRes.status, await tokenRes.text());
    return;
  }

  const { access_token } = await tokenRes.json();
  console.log('Token acquired ✓\n');

  // 2. Query: top 5 most expensive active sales
  const filter = "StandardStatus eq 'Active' and PropertyType ne 'ResidentialLease'";
  const select = 'ListingId,StreetNumber,StreetName,UnitNumber,ListPrice,CountyOrParish,CityRegion';
  const url = `${API_URL}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=5&$select=${select}&$orderby=${encodeURIComponent('ListPrice desc')}&$count=true`;

  console.log('Query:', url.substring(0, 120) + '...');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });

  if (!res.ok) {
    console.error('Query failed:', res.status, await res.text());
    return;
  }

  const data = await res.json();
  console.log('\n@odata.count:', data['@odata.count'] || 'NOT IN RESPONSE');
  console.log('@odata.nextLink:', data['@odata.nextLink'] ? 'YES' : 'NO');

  const recs = data.value || [];
  console.log(`Records returned: ${recs.length}\n`);
  console.log('Top 5 most expensive active sales:');
  recs.forEach((r, i) => {
    console.log(`  ${i+1}. $${(r.ListPrice || 0).toLocaleString()} | ${r.StreetNumber || ''} ${r.StreetName || ''} ${r.UnitNumber || ''} | ${r.CountyOrParish || ''} | ${r.CityRegion || ''} | RLS: ${r.ListingId}`);
  });

  // 3. Query: search for "400 EAST 90"
  console.log('\n--- Address search: 400 EAST 90 ---');
  const addrFilter = "StandardStatus eq 'Active' and startswith(StreetNumber,'400') and contains(StreetName,'EAST 90')";
  const addrUrl = `${API_URL}/odata/Property?$filter=${encodeURIComponent(addrFilter)}&$top=10&$select=${select}`;

  const addrRes = await fetch(addrUrl, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!addrRes.ok) {
    console.error('Address query failed:', addrRes.status, await addrRes.text());
    return;
  }

  const addrData = await addrRes.json();
  const addrRecs = addrData.value || [];
  console.log(`Results: ${addrRecs.length}`);
  addrRecs.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.StreetNumber || ''} ${r.StreetName || ''} ${r.UnitNumber || ''} | $${(r.ListPrice || 0).toLocaleString()} | ${r.CountyOrParish || ''} | RLS: ${r.ListingId}`);
  });

  // 4. Count total active listings
  console.log('\n--- Total counts ---');
  const countUrl = `${API_URL}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active'")}&$top=0&$count=true&$select=ListingId`;
  const countRes = await fetch(countUrl, { headers: { Authorization: `Bearer ${access_token}` } });
  if (countRes.ok) {
    const countData = await countRes.json();
    console.log('Total active listings:', countData['@odata.count'] || `${(countData.value || []).length} (no count, $top=0)`);
  }

  // Try $top=1 instead
  const count2Url = `${API_URL}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active'")}&$top=1&$select=ListingId&$count=true`;
  const count2Res = await fetch(count2Url, { headers: { Authorization: `Bearer ${access_token}` } });
  if (count2Res.ok) {
    const count2Data = await count2Res.json();
    console.log('Total active (with $count=true):', count2Data['@odata.count'] || 'NOT RETURNED');
    console.log('Has nextLink:', count2Data['@odata.nextLink'] ? 'YES (more data available)' : 'NO');
  }
}

main().catch(console.error);
