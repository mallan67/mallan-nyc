// Test which buyer agent field names work in Trestle OData queries
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;

async function run() {
  const tokenRes = await fetch(`${base}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api' }),
  });
  const { access_token } = await tokenRes.json();

  // First: check what buyer-side fields exist on a known closed deal
  console.log('=== Checking buyer fields on a known closed listing ===');
  const p0 = new URLSearchParams();
  p0.set('$filter', "ListingId eq '11426539' and StandardStatus eq 'Closed'");
  p0.set('$select', 'ListingId,ListAgentFullName,BuyerAgentFullName,BuyerAgentLastName,BuyerAgentKey,BuyerAgentMlsId,BuyerOfficeName,BuyerOfficeKey,ListOfficeName');
  const r0 = await fetch(`${base}/odata/Property?${p0}`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  });
  console.log('Status:', r0.status);
  if (r0.ok) {
    const d0 = await r0.json();
    console.log('Data:', JSON.stringify(d0.value, null, 2));
  } else {
    console.log('Error:', (await r0.text()).substring(0, 300));
  }

  // Try different filter approaches for buyer agent
  const filters = [
    "BuyerAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'",
    "BuyerAgentLastName eq 'Allan' and StandardStatus eq 'Closed'",
    "BuyerAgentMlsId eq '10311201806' and StandardStatus eq 'Closed'",
  ];

  for (const filter of filters) {
    const p = new URLSearchParams();
    p.set('$filter', filter);
    p.set('$select', 'ListingId,BuyerAgentFullName,ListAgentFullName,ListOfficeName,PropertyType,CloseDate,ClosePrice');
    p.set('$top', '5');

    const res = await fetch(`${base}/odata/Property?${p}`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    console.log(`\nFilter: ${filter}`);
    console.log(`  Status: ${res.status}`);
    if (res.ok) {
      const d = await res.json();
      const vals = d.value || [];
      console.log(`  Results: ${vals.length}`);
      vals.slice(0, 3).forEach(r => {
        console.log(`    ${r.ListingId} | BuyerAgent: ${r.BuyerAgentFullName} | ListAgent: ${r.ListAgentFullName} | ListOffice: ${r.ListOfficeName} | ${r.PropertyType} | $${r.ClosePrice} | ${r.CloseDate}`);
      });
    } else {
      console.log(`  Error: ${(await res.text()).substring(0, 200)}`);
    }
  }
}

run().catch(console.error);
