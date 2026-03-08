// Check: how many listings get photos from our batch query?
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

  // Get 50 active sale listings
  const listRes = await fetch(`${apiUrl}/odata/Property?$filter=${encodeURIComponent("StandardStatus eq 'Active' and PropertyType ne 'ResidentialLease'")}&$select=ListingId,PhotosCount&$top=50&$orderby=${encodeURIComponent('ModificationTimestamp desc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const listings = (await listRes.json()).value || [];
  console.log(`Got ${listings.length} listings`);

  const ids = listings.map(l => l.ListingId);

  // Query 1: With MediaCategory eq 'Photo' filter
  const filter1 = `(${ids.map(id => `ResourceRecordID eq '${id}'`).join(' or ')}) and MediaCategory eq 'Photo'`;
  const r1 = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(filter1)}&$select=ResourceRecordID,MediaCategory,Order&$top=${ids.length * 3}&$orderby=${encodeURIComponent('ResourceRecordID asc,Order asc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d1 = await r1.json();
  const photoIds1 = new Set((d1.value || []).map(m => m.ResourceRecordID));
  console.log(`\nWith MediaCategory eq 'Photo': ${(d1.value||[]).length} media items, covering ${photoIds1.size}/${listings.length} listings`);

  // Query 2: Without category filter (original Order le 2)
  const filter2 = `(${ids.map(id => `ResourceRecordID eq '${id}'`).join(' or ')}) and Order le 2`;
  const r2 = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(filter2)}&$select=ResourceRecordID,MediaCategory,Order&$top=${ids.length * 3}&$orderby=${encodeURIComponent('ResourceRecordID asc,Order asc')}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  const d2 = await r2.json();
  const photoIds2 = new Set((d2.value || []).map(m => m.ResourceRecordID));
  console.log(`With Order le 2 (no category): ${(d2.value||[]).length} media items, covering ${photoIds2.size}/${listings.length} listings`);

  // Which listings have NO photos with category filter?
  const missing = ids.filter(id => !photoIds1.has(id));
  console.log(`\nMissing from Photo filter: ${missing.length} listings`);

  // Check what those missing listings have
  if (missing.length > 0) {
    const mFilter = `(${missing.slice(0, 10).map(id => `ResourceRecordID eq '${id}'`).join(' or ')})`;
    const mr = await fetch(`${apiUrl}/odata/Media?$filter=${encodeURIComponent(mFilter)}&$select=ResourceRecordID,MediaCategory,MediaType,Order&$top=50`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    const md = await mr.json();
    console.log('\nMedia for missing listings:');
    for (const m of (md.value || [])) {
      console.log(`  ${m.ResourceRecordID}: Category=${m.MediaCategory}, Type=${m.MediaType}, Order=${m.Order}`);
    }

    // Also check PhotosCount for missing
    const missingListings = listings.filter(l => missing.includes(l.ListingId));
    for (const l of missingListings.slice(0, 10)) {
      console.log(`  ${l.ListingId}: PhotosCount=${l.PhotosCount}`);
    }
  }
}
run().catch(e => console.error(e));
