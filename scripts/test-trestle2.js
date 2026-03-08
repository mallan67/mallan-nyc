require('dotenv').config({ path: '.env.local' });
const API_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function main() {
  const tokenRes = await fetch(`${API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${process.env.IDX_CLIENT_ID}&client_secret=${process.env.IDX_CLIENT_SECRET}&scope=api`,
  });
  const { access_token } = await tokenRes.json();

  // Check how "400 East 90th" is stored
  console.log('=== Searching for StreetNumber=400, various StreetName patterns ===\n');

  const tests = [
    "startswith(StreetNumber,'400') and contains(StreetName,'EAST 90')",
    "startswith(StreetNumber,'400') and contains(StreetName,'East 90')",
    "startswith(StreetNumber,'400') and contains(StreetName,'90')",
    "startswith(StreetNumber,'400') and contains(StreetName,'90TH')",
    "StreetNumber eq '400' and contains(StreetName,'90')",
  ];

  for (const filter of tests) {
    const fullFilter = `StandardStatus eq 'Active' and ${filter}`;
    const url = `${API_URL}/odata/Property?$filter=${encodeURIComponent(fullFilter)}&$top=5&$select=ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,UnitNumber,ListPrice,CountyOrParish`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    const data = await res.json();
    const recs = data.value || [];
    console.log(`Filter: ${filter}`);
    console.log(`  Results: ${recs.length}`);
    recs.slice(0, 3).forEach(r => {
      console.log(`    ${r.StreetNumber} ${r.StreetDirPrefix||''} ${r.StreetName} ${r.StreetSuffix||''} ${r.UnitNumber||''} | $${(r.ListPrice||0).toLocaleString()} | ${r.ListingId}`);
    });
    console.log('');
  }

  // Also check: what does StreetName look like for "East" streets?
  console.log('=== Sample "East" street names ===');
  const eastFilter = "StandardStatus eq 'Active' and contains(StreetName,'East')";
  const eastUrl = `${API_URL}/odata/Property?$filter=${encodeURIComponent(eastFilter)}&$top=5&$select=StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,UnitNumber`;
  const eastRes = await fetch(eastUrl, { headers: { Authorization: `Bearer ${access_token}` } });
  const eastData = await eastRes.json();
  (eastData.value || []).forEach(r => {
    console.log(`  Num="${r.StreetNumber}" DirPrefix="${r.StreetDirPrefix||''}" Name="${r.StreetName}" Suffix="${r.StreetSuffix||''}" Unit="${r.UnitNumber||''}"`);
  });
}

main().catch(console.error);
