// Test: Are Trestle MediaURLs publicly accessible without Bearer auth?
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

const clientId = process.env.IDX_CLIENT_ID;
const clientSecret = process.env.IDX_CLIENT_SECRET;
const apiUrl = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function run() {
  // Get token
  const tokenRes = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api' }),
  });
  const { access_token } = await tokenRes.json();

  // Get a few media URLs
  const mediaRes = await fetch(`${apiUrl}/odata/Media?$filter=MediaType eq 'jpeg'&$select=MediaURL,ResourceRecordKey,ResourceRecordID&$top=3`, {
    headers: { Authorization: 'Bearer ' + access_token, Accept: 'application/json' },
  });
  const mediaData = await mediaRes.json();

  for (const item of (mediaData.value || [])) {
    const mediaUrl = item.MediaURL;
    console.log('\nMedia URL:', mediaUrl);

    // Test WITH auth
    const t1 = Date.now();
    const withAuth = await fetch(mediaUrl, { headers: { Authorization: 'Bearer ' + access_token } });
    const size1 = withAuth.ok ? (await withAuth.arrayBuffer()).byteLength : 0;
    console.log('  With auth:', withAuth.status, `${(size1/1024).toFixed(0)}KB`, `${Date.now() - t1}ms`);

    // Test WITHOUT auth (is it public?)
    const t2 = Date.now();
    const noAuth = await fetch(mediaUrl);
    const size2 = noAuth.ok ? (await noAuth.arrayBuffer()).byteLength : 0;
    console.log('  No auth:', noAuth.status, `${(size2/1024).toFixed(0)}KB`, `${Date.now() - t2}ms`);
  }
}
run().catch(e => console.error(e));
