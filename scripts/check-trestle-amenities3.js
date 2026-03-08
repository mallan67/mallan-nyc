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

  // Get many listings with BuildingFeatures to see ALL possible values
  const select = 'ListingId,BuildingFeatures,InteriorFeatures,SecurityFeatures,LaundryFeatures,SpaFeatures,PoolFeatures,CommunityFeatures,AssociationAmenities,ParkingFeatures,GarageSpaces,PetsAllowed';
  const filter = encodeURIComponent("StandardStatus eq 'Active' and BuildingFeatures ne null");
  const url = `https://api.cotality.com/trestle/odata/Property?$filter=${filter}&$top=100&$select=${encodeURIComponent(select)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d = await r.json();

  if (d.error) {
    console.log('Error:', d.error.message.substring(0, 300));
    return;
  }

  // Collect all unique values per field
  const allValues = {};
  for (const rec of d.value) {
    for (const [k, v] of Object.entries(rec)) {
      if (k.startsWith('@') || k === 'ListingId') continue;
      if (v == null || v === '' || v === false) continue;
      if (!allValues[k]) allValues[k] = new Set();
      // Split comma-separated values
      String(v).split(',').forEach(val => allValues[k].add(val.trim()));
    }
  }

  console.log(`Analyzed ${d.value.length} listings with BuildingFeatures\n`);

  for (const [field, values] of Object.entries(allValues)) {
    const sorted = [...values].sort();
    console.log(`\n${field} (${sorted.length} unique values):`);
    sorted.forEach(v => console.log(`  - ${v}`));
  }
}

main().catch(e => console.error(e.message));
