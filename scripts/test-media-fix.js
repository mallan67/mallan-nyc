// Test the fix: Photo + Order le 3
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

  // Trestle guidance (2026-04-07): use ListingKey (= Media.ResourceRecordKey), not ListingId
  const listRes = await fetch(`${apiUrl}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active' and PropertyType ne 'ResidentialLease'")}&$select=ListingId,ListingKey,PhotosCount&$top=50&$orderby=${encodeURIComponent('ModificationTimestamp desc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const listings = (await listRes.json()).value || [];
  const ids = listings.map(l => l.ListingKey || l.ListingId);

  // Test: Photo + Order le 3 with higher $top
  const filter = `(${ids.map(id => `ResourceRecordKey eq '${id}'`).join(' or ')}) and MediaCategory eq 'Photo' and Order le 3`;
  const t = Date.now();
  const r = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(filter)}&$select=ResourceRecordKey,MediaURL,Order,PreferredPhotoYN&$top=200&$orderby=${encodeURIComponent('Order asc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d = await r.json();
  const photoIds = new Set((d.value || []).map(m => m.ResourceRecordKey || m.ResourceRecordID));
  console.log(`Photo + Order le 3, $top=200: ${(d.value||[]).length} items, ${photoIds.size}/${listings.length} listings covered, ${Date.now()-t}ms`);

  // Test: just Order le 1 with Photo category
  const filter2 = `(${ids.map(id => `ResourceRecordKey eq '${id}'`).join(' or ')}) and MediaCategory eq 'Photo' and Order le 1`;
  const t2 = Date.now();
  const r2 = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(filter2)}&$select=ResourceRecordKey,MediaURL,Order,PreferredPhotoYN&$top=200&$orderby=${encodeURIComponent('Order asc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d2 = await r2.json();
  const photoIds2 = new Set((d2.value || []).map(m => m.ResourceRecordKey || m.ResourceRecordID));
  console.log(`Photo + Order le 1, $top=200: ${(d2.value||[]).length} items, ${photoIds2.size}/${listings.length} listings covered, ${Date.now()-t2}ms`);

  // Test: PreferredPhotoYN eq true
  const filter3 = `(${ids.map(id => `ResourceRecordKey eq '${id}'`).join(' or ')}) and PreferredPhotoYN eq true`;
  const t3 = Date.now();
  const r3 = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(filter3)}&$select=ResourceRecordKey,MediaURL,Order,MediaCategory&$top=200`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d3 = await r3.json();
  const photoIds3 = new Set((d3.value || []).map(m => m.ResourceRecordKey || m.ResourceRecordID));
  console.log(`PreferredPhotoYN=true: ${(d3.value||[]).length} items, ${photoIds3.size}/${listings.length} listings covered, ${Date.now()-t3}ms`);

  // Show what preferred photos look like
  for (const m of (d3.value || []).slice(0, 3)) {
    console.log(`  Preferred: ${m.ResourceRecordKey || m.ResourceRecordID} Cat=${m.MediaCategory} Order=${m.Order}`);
  }
}
run().catch(e => console.error(e));
