require('dotenv').config({ path: '.env.local' });
const CID = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const SEC = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function run() {
  const tr = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CID}&client_secret=${SEC}&scope=api`,
  });
  const { access_token: token } = await tr.json();

  // Get closed listings
  const p = new URLSearchParams();
  p.set('$filter', "ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'");
  p.set('$select', 'ListingId,PhotosCount,StreetNumber,StreetName');
  p.set('$top', '5');
  const r = await fetch(`${BASE}/odata/Property?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  console.log('Listings:');
  for (const x of (d.value || [])) {
    console.log(x.ListingId, x.StreetNumber, x.StreetName, 'photos:', x.PhotosCount);
  }

  // Check media for first listing
  if (d.value && d.value[0]) {
    const lid = d.value[0].ListingId;
    const mp = new URLSearchParams();
    mp.set('$filter', `ResourceRecordID eq '${lid}'`);
    mp.set('$select', 'ResourceRecordID,MediaURL,Order,PreferredPhotoYN');
    mp.set('$top', '5');
    const mr = await fetch(`${BASE}/odata/Media?${mp}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const md = await mr.json();
    console.log(`\nMedia for ${lid}:`);
    for (const m of (md.value || [])) {
      console.log('  Order:', m.Order, 'Pref:', m.PreferredPhotoYN, 'URL:', (m.MediaURL || '').substring(0, 80));
    }
  }
}

run().catch(e => console.error(e.message));
