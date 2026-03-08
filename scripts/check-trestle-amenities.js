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

  // Test which YN fields exist on the feed
  const ynFields = [
    'DoormanYN', 'ElevatorYN', 'GymYN', 'StorageYN', 'BicycleStorageYN',
    'GardenYN', 'DeckYN', 'AttendanceType', 'PoolPrivateYN', 'SpaYN', 'GarageYN'
  ];

  console.log('=== Testing which fields exist on IDX Plus feed ===\n');

  for (const field of ynFields) {
    const url = `https://api.cotality.com/trestle/odata/Property?$filter=MlsStatus eq 'Active'&$top=1&$select=${field}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      const d = await r.json();
      if (d.error) {
        console.log(`  ${field}: NOT AVAILABLE (${d.error.message.substring(0, 60)})`);
      } else {
        const val = d.value && d.value[0] ? d.value[0][field] : 'empty';
        console.log(`  ${field}: AVAILABLE (sample: ${JSON.stringify(val)})`);
      }
    } catch (e) {
      console.log(`  ${field}: ERROR (${e.message})`);
    }
  }

  // Now check luxury listings for AssociationAmenities content
  console.log('\n=== Luxury listings with AssociationAmenities ===\n');
  const select = 'ListingId,AssociationAmenities,CommunityFeatures,SecurityFeatures,LaundryFeatures,InteriorFeatures,ParkingFeatures,GarageYN,Appliances,PetsAllowed';
  const filter = encodeURIComponent("MlsStatus eq 'Active' and PropertyType eq 'Residential' and AssociationAmenities ne null");
  const url = `https://api.cotality.com/trestle/odata/Property?$filter=${filter}&$top=5&$select=${encodeURIComponent(select)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d = await r.json();

  if (d.error) {
    console.log('Query error:', d.error.message.substring(0, 200));
  } else if (d.value) {
    for (const rec of d.value) {
      console.log(`\n--- ${rec.ListingId} ---`);
      for (const [k, v] of Object.entries(rec)) {
        if (k.startsWith('@') || k === 'ListingId') continue;
        if (v != null && v !== '' && v !== false) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
  }
}

main().catch(e => console.error(e.message));
