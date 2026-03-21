/**
 * scripts/fetch-custom-media.js
 * - Uses global fetch (Node 18+)
 * - Reads .env.local for TRESTLE_API_URL, IDX_CLIENT_ID, IDX_CLIENT_SECRET
 * - Fetches 3 active Property records with CustomProperty and Media expanded
 * - Writes artifacts/custom-media-raw.json and a truncated pretty file
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function getToken() {
  const url = `${process.env.TRESTLE_API_URL}/oidc/connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.IDX_CLIENT_ID,
    client_secret: process.env.IDX_CLIENT_SECRET,
    scope: 'api'
  });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    if (data.access_token) return data.access_token;
    console.error('TOKEN_ERROR', text);
    process.exit(2);
  } catch (e) {
    console.error('TOKEN_PARSE_ERROR', text);
    process.exit(3);
  }
}

(async () => {
  try {
    if (!process.env.TRESTLE_API_URL || !process.env.IDX_CLIENT_ID || !process.env.IDX_CLIENT_SECRET) {
      console.error('Missing TRESTLE_API_URL or IDX_CLIENT_ID/IDX_CLIENT_SECRET in .env.local');
      process.exit(1);
    }
    const token = await getToken();
    console.log('Token acquired');

    const url = `${process.env.TRESTLE_API_URL}/odata/Property?$filter=StandardStatus eq 'Active'&$top=3&$select=ListingId,PhotosCount,ListPrice,StreetName,City&$expand=CustomProperty,Media`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }});
    const text = await res.text();
    if (!res.ok) {
      console.error('FETCH_ERROR', res.status, text.slice(0,2000));
      fs.writeFileSync('artifacts/custom-media-error.txt', `status:${res.status}\n\n${text}`);
      process.exit(5);
    }
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/custom-media-raw.json', text, 'utf8');
    const j = JSON.parse(text);
    fs.writeFileSync('artifacts/custom-media-pretty.json', JSON.stringify(j, null, 2).slice(0, 20000), 'utf8');
    console.log('Wrote artifacts/custom-media-raw.json and truncated pretty JSON.');
    process.exit(0);
  } catch (err) {
    console.error('UNEXPECTED_ERROR', err && err.message);
    process.exit(99);
  }
})();
