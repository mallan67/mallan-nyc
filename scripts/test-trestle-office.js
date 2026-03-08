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

  // Check MAllan office - all statuses
  const params = new URLSearchParams();
  params.set('$filter', "ListOfficeName eq 'MAllan Real Estate Inc'");
  params.set('$select', 'ListingId,StandardStatus,StreetNumber,StreetName,UnitNumber,ListAgentFullName');
  params.set('$count', 'true');
  params.set('$top', '50');

  const r = await fetch(`${BASE}/odata/Property?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const d = await r.json();
  console.log('MAllan office count:', d['@odata.count']);
  (d.value || []).forEach(x => console.log(x.ListingId, x.StandardStatus, x.StreetNumber, x.StreetName, x.UnitNumber, '|', x.ListAgentFullName));
}

run().catch(e => console.error(e.message));
