require('dotenv').config({ path: '.env.local' });

async function getToken() {
  const id = process.env.TRESTLE_CLIENT_ID || process.env.IDX_CLIENT_ID;
  const secret = process.env.TRESTLE_CLIENT_SECRET || process.env.IDX_CLIENT_SECRET;
  const r = await fetch('https://api.cotality.com/trestle/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${id}&client_secret=${secret}&scope=api`,
  });
  return (await r.json()).access_token;
}

async function main() {
  const token = await getToken();

  // Get many listings to see ALL possible values for unit-level fields
  const select = 'ListingId,InteriorFeatures,Flooring,Appliances,Cooling,Heating,LaundryFeatures,Levels,ExteriorFeatures';
  const filter = encodeURIComponent("StandardStatus eq 'Active' and InteriorFeatures ne null");
  const url = `https://api.cotality.com/trestle/odata/Property?$filter=${filter}&$top=200&$select=${encodeURIComponent(select)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d = await r.json();

  if (d.error) {
    console.log('Error:', d.error.message.substring(0, 300));
    return;
  }

  const allValues = {};
  for (const rec of d.value) {
    for (const [k, v] of Object.entries(rec)) {
      if (k.startsWith('@') || k === 'ListingId') continue;
      if (v == null || v === '' || v === false) continue;
      if (!allValues[k]) allValues[k] = new Set();
      String(v).split(',').forEach(val => allValues[k].add(val.trim()));
    }
  }

  console.log(`Analyzed ${d.value.length} listings\n`);

  for (const [field, values] of Object.entries(allValues)) {
    const sorted = [...values].sort();
    console.log(`\n${field} (${sorted.length} unique values):`);
    sorted.forEach(v => console.log(`  - ${v}`));
  }
}

main().catch(e => console.error(e.message));
