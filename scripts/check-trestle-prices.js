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

  const p = new URLSearchParams();
  p.set('$filter', "ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'");
  p.set('$select', 'ListingId,StreetNumber,StreetName,UnitNumber,ClosePrice,ListPrice');
  p.set('$top', '200');
  const r = await fetch(`${BASE}/odata/Property?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();

  // Show ones where ClosePrice might be null/0
  for (const x of (d.value || [])) {
    const cp = x.ClosePrice;
    const lp = x.ListPrice;
    if (!cp || cp <= 1) {
      console.log('LOW/NULL:', x.ListingId, x.StreetNumber, x.StreetName, x.UnitNumber, 'close:', cp, 'list:', lp);
    }
  }
  console.log('\nAll prices:');
  for (const x of (d.value || [])) {
    console.log(x.ListingId, x.StreetNumber, x.StreetName, x.UnitNumber || '', 'close:', x.ClosePrice, 'list:', x.ListPrice);
  }
}

run().catch(e => console.error(e.message));
