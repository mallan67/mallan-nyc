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
  p.set('$select', 'ListingId,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,UnparsedAddress,City,PostalCode');
  p.set('$top', '10');
  const r = await fetch(`${BASE}/odata/Property?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  for (const x of (d.value || [])) {
    console.log(JSON.stringify({
      id: x.ListingId,
      num: x.StreetNumber,
      dirPre: x.StreetDirPrefix,
      name: x.StreetName,
      suffix: x.StreetSuffix,
      dirSuf: x.StreetDirSuffix,
      unit: x.UnitNumber,
      unparsed: x.UnparsedAddress,
      city: x.City,
      zip: x.PostalCode,
    }));
  }
}

run().catch(e => console.error(e.message));
