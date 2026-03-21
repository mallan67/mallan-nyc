/*
 scripts/get-metadata.js
 - Reads .env.local for TRESTLE_API_URL, IDX_CLIENT_ID, IDX_CLIENT_SECRET
 - Gets a client_credentials token (does NOT print it)
 - Fetches /odata/$metadata and writes artifacts/metadata.xml
 - Prints short status lines only (no secrets)
*/
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

(async () => {
  try {
    if (!process.env.TRESTLE_API_URL || !process.env.IDX_CLIENT_ID || !process.env.IDX_CLIENT_SECRET) {
      console.error('MISSING_ENV');
      process.exit(2);
    }
    const fetch = (await import('node-fetch')).default;

    // get token
    const tokenRes = await fetch(`${process.env.TRESTLE_API_URL}/oidc/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.IDX_CLIENT_ID,
        client_secret: process.env.IDX_CLIENT_SECRET,
        scope: 'api'
      })
    });
    const tokenText = await tokenRes.text();
    let tokenJson;
    try { tokenJson = JSON.parse(tokenText); } catch(e) { console.error('TOKEN_PARSE_ERR', tokenText.slice(0,1000)); process.exit(3); }
    if (!tokenJson.access_token) { console.error('TOKEN_ERR', JSON.stringify(tokenJson)); process.exit(4); }
    const token = tokenJson.access_token;
    console.log('TOKEN_OK');

    // fetch metadata
    const metaRes = await fetch(`${process.env.TRESTLE_API_URL}/odata/$metadata`, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/xml' },
      // allow longer timeout in some environments
    });
    const metaText = await metaRes.text();
    if (!metaRes.ok) {
      console.error('METADATA_FETCH_ERR', metaRes.status, metaText.slice(0,1000));
      fs.writeFileSync('artifacts/metadata-error.txt', metaText.slice(0,20000), 'utf8');
      process.exit(5);
    }
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/metadata.xml', metaText, 'utf8');
    console.log('METADATA_OK', 'wrote artifacts/metadata.xml');
    process.exit(0);
  } catch (err) {
    console.error('UNEXPECTED', err && (err.message || err));
    process.exit(99);
  }
})();
