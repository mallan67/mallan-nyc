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

  async function query(filter, label) {
    const p = new URLSearchParams();
    p.set('$filter', filter);
    p.set('$select', 'ListingId,StandardStatus,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,StreetDirSuffix,UnitNumber,City,PostalCode,CloseDate,ClosePrice,ListPrice,PropertyType,CommonInterest,BedroomsTotal,BathroomsFull,BathroomsHalf,LivingArea,ListOfficeName,ListAgentFullName,PhotosCount');
    p.set('$orderby', 'CloseDate desc');
    p.set('$top', '200');
    p.set('$count', 'true');
    const r = await fetch(`${BASE}/odata/Property?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    console.log(`\n=== ${label} ===`);
    console.log(`Count: ${d['@odata.count']}`);
    const byStatus = {};
    for (const x of (d.value || [])) {
      byStatus[x.StandardStatus] = (byStatus[x.StandardStatus] || 0) + 1;
    }
    console.log('By status:', JSON.stringify(byStatus));
    for (const x of (d.value || [])) {
      const addr = [x.StreetNumber, x.StreetDirPrefix, x.StreetName, x.StreetSuffix, x.StreetDirSuffix].filter(Boolean).join(' ');
      console.log(`  ${x.ListingId} | ${x.StandardStatus} | ${addr} ${x.UnitNumber||''} | ${x.PropertyType} | ${x.CommonInterest||''} | close:${x.CloseDate||'N/A'} | $${x.ClosePrice||x.ListPrice||'N/A'} | photos:${x.PhotosCount} | ${x.ListAgentFullName}`);
    }
    return d.value || [];
  }

  // All by agent name
  await query("ListAgentFullName eq 'Maya Allan'", 'All by Maya Allan (agent name)');

  // All by office
  await query("ListOfficeName eq 'MAllan Real Estate Inc'", 'All by MAllan Real Estate Inc (office)');
}

run().catch(e => console.error(e.message));
