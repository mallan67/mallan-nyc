require('dotenv').config({ path: '.env.local' });
const API_URL = process.env.TRESTLE_API_URL;

async function main() {
  const tokenRes = await fetch(`${API_URL}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${process.env.IDX_CLIENT_ID}&client_secret=${process.env.IDX_CLIENT_SECRET}&scope=api`,
  });
  const { access_token } = await tokenRes.json();

  // The CORRECT way to search: direction in StreetDirPrefix, street number in StreetName
  console.log('=== Fixed search: 400 E 90 ===');
  const filter = "startswith(StreetNumber,'400') and StreetDirPrefix eq 'E' and contains(StreetName,'90')";
  const url = `${API_URL}/odata/Property?$filter=${encodeURIComponent(filter)}&$top=20&$select=ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,UnitNumber,ListPrice,StandardStatus&$count=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const data = await res.json();
  console.log('Total:', data['@odata.count'] || (data.value||[]).length);
  (data.value || []).forEach(r => {
    console.log(`  ${r.StreetNumber} ${r.StreetDirPrefix||''} ${r.StreetName} ${r.StreetSuffix||''} ${r.UnitNumber||''} | $${(r.ListPrice||0).toLocaleString()} | ${r.StandardStatus} | ${r.ListingId}`);
  });

  // Also search all statuses (not just Active)
  console.log('\n=== All statuses for 400 E 90 ===');
  const filter2 = "startswith(StreetNumber,'400') and StreetDirPrefix eq 'E' and contains(StreetName,'90')";
  const url2 = `${API_URL}/odata/Property?$filter=${encodeURIComponent(filter2)}&$top=20&$select=ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,UnitNumber,ListPrice,StandardStatus&$count=true`;
  const res2 = await fetch(url2, { headers: { Authorization: `Bearer ${access_token}` } });
  const data2 = await res2.json();
  console.log('Total:', data2['@odata.count'] || (data2.value||[]).length);
  (data2.value || []).forEach(r => {
    console.log(`  ${r.StreetNumber} ${r.StreetDirPrefix||''} ${r.StreetName} ${r.StreetSuffix||''} ${r.UnitNumber||''} | $${(r.ListPrice||0).toLocaleString()} | ${r.StandardStatus} | ${r.ListingId}`);
  });
}

main().catch(console.error);
