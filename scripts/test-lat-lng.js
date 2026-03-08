require('dotenv').config({ path: '.env.local' });
const clientId = process.env.IDX_CLIENT_ID;
const clientSecret = process.env.IDX_CLIENT_SECRET;
const apiUrl = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function main() {
  console.log('API URL:', apiUrl);

  const tokRes = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString()
  });
  const tok = await tokRes.json();
  if (!tok.access_token) {
    console.log('Token failed:', JSON.stringify(tok).slice(0, 200));
    return;
  }
  console.log('Got token');

  const params = new URLSearchParams({
    '$select': 'ListingId,StreetName,Latitude,Longitude',
    '$filter': "StandardStatus eq 'Active'",
    '$top': '5'
  });

  const res = await fetch(apiUrl + '/odata/Property?' + params.toString(), {
    headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' }
  });
  console.log('Query status:', res.status);
  const data = await res.json();

  if (data.value) {
    data.value.forEach(r => {
      console.log(r.StreetName, '| Lat:', r.Latitude, '| Lng:', r.Longitude);
    });
  } else {
    console.log('Response:', JSON.stringify(data).slice(0, 500));
  }
}

main().catch(e => console.error('Error:', e.message));
