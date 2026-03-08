// Check actual MediaCategory values from Trestle
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
}

async function run() {
  const apiUrl = process.env.TRESTLE_API_URL;
  const tr = await fetch(apiUrl + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.IDX_CLIENT_ID, client_secret: process.env.IDX_CLIENT_SECRET, scope: 'api' }),
  });
  const { access_token } = await tr.json();

  const r = await fetch(`${apiUrl}/odata/Media?$select=ResourceRecordID,MediaCategory,MediaType,Order,PreferredPhotoYN&$top=200&$orderby=Order asc`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d = await r.json();
  const cats = {};
  for (const m of (d.value || [])) {
    const cat = String(m.MediaCategory ?? 'NULL');
    cats[cat] = (cats[cat] || 0) + 1;
  }
  console.log('MediaCategory values and counts:', cats);

  // Show a few samples
  const seen = new Set();
  for (const m of (d.value || [])) {
    const cat = String(m.MediaCategory ?? 'NULL');
    if (!seen.has(cat)) {
      seen.add(cat);
      console.log(`  Example ${cat}:`, JSON.stringify(m));
    }
  }
}
run().catch(e => console.error(e));
