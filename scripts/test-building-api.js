const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local'), override: true });

async function test() {
  // Get token
  const tokenUrl = 'https://api.cotality.com/trestle/oidc/connect/token';
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IDX_CLIENT_ID || '',
      client_secret: process.env.IDX_CLIENT_SECRET || '',
      scope: 'api',
    }),
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  console.log('Token:', token ? token.substring(0, 20) + '...' : 'NONE');

  // Query for One57
  const filter = "StreetNumber eq '157' and contains(StreetName,'57TH')";
  const params = new URLSearchParams({
    $filter: filter,
    $select: 'ListingId,BuildingName,YearBuilt,StoriesTotal,BuildingFeatures,MlsStatus,StandardStatus,ListPrice,StreetName,StreetDirPrefix,StreetNumber,IDXEntireListingDisplayYN,InternetEntireListingDisplayYN,OwnerOptOut,ParticipantOnlyYN',
    $top: '5',
  });
  const url = `https://api.cotality.com/trestle/odata/Property?${params}`;
  console.log('Filter:', filter);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Records:', (data.value || []).length);
  if (data.value) {
    data.value.forEach((r, i) => {
      console.log(`[${i}]`, r.ListingId, r.BuildingName, 'MLS:', r.MlsStatus, 'Std:', r.StandardStatus, 'IDX:', r.IDXEntireListingDisplayYN, 'Internet:', r.InternetEntireListingDisplayYN, 'OptOut:', r.OwnerOptOut, 'PO:', r.ParticipantOnlyYN, '$' + r.ListPrice);
    });
  }
  if (data.error) console.log('Error:', JSON.stringify(data.error));

  // Also try without direction prefix
  const filter2 = "StreetNumber eq '157' and contains(StreetName,'57')";
  const params2 = new URLSearchParams({
    $filter: filter2,
    $select: 'ListingId,BuildingName,MlsStatus,StreetName,StreetDirPrefix,StreetNumber,PostalCode',
    $top: '10',
  });
  const res2 = await fetch(`https://api.cotality.com/trestle/odata/Property?${params2}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const data2 = await res2.json();
  console.log('\nBroader filter (contains 57):', (data2.value || []).length, 'records');
  if (data2.value) {
    data2.value.slice(0, 10).forEach((r, i) => {
      console.log(`[${i}]`, r.ListingId, r.BuildingName, r.MlsStatus, r.StreetDirPrefix, r.StreetName, r.PostalCode);
    });
  }
}

test().catch(console.error);
