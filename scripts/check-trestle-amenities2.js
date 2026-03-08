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

  // Test amenity-related fields on IDX Plus
  const fields = [
    'BuildingFeatures', 'BuildingLaundryFeatures', 'BuildingPoolFeatures',
    'BuildingPatioAndPorchFeatures', 'ElevatorsTotal', 'GarageSpaces',
    'GarageSpacesAssignedYN', 'SpaFeatures', 'PoolFeatures',
    'LaundryFeatures', 'InteriorFeatures', 'CommunityFeatures',
    'SecurityFeatures', 'ParkingFeatures', 'Appliances', 'PetsAllowed',
    'AssociationAmenities', 'AssociationFeeIncludes'
  ];

  console.log('=== Testing amenity fields on IDX Plus ===\n');
  for (const field of fields) {
    const url = `https://api.cotality.com/trestle/odata/Property?$filter=StandardStatus eq 'Active'&$top=1&$select=${field}`;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      const d = await r.json();
      if (d.error) {
        console.log(`  ${field}: NOT AVAILABLE`);
      } else {
        const val = d.value && d.value[0] ? d.value[0][field] : 'null';
        console.log(`  ${field}: AVAILABLE (sample: ${JSON.stringify(val)})`);
      }
    } catch (e) {
      console.log(`  ${field}: ERROR (${e.message})`);
    }
  }

  // Now get listings with rich BuildingFeatures data
  console.log('\n=== Listings with BuildingFeatures ===\n');
  const select = 'ListingId,BuildingFeatures,BuildingLaundryFeatures,BuildingPoolFeatures,BuildingPatioAndPorchFeatures,ElevatorsTotal,SpaFeatures,PoolFeatures,LaundryFeatures,InteriorFeatures,CommunityFeatures,AssociationAmenities,AssociationFeeIncludes,PetsAllowed,GarageSpaces,GarageSpacesAssignedYN,ParkingFeatures';
  const filter = encodeURIComponent("StandardStatus eq 'Active' and BuildingFeatures ne null");
  const url = `https://api.cotality.com/trestle/odata/Property?$filter=${filter}&$top=5&$select=${encodeURIComponent(select)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d = await r.json();
  if (d.error) {
    console.log('Error:', d.error.message.substring(0, 200));
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

  // Also check AssociationFeeIncludes separately
  console.log('\n=== Listings with AssociationFeeIncludes ===\n');
  const filter2 = encodeURIComponent("StandardStatus eq 'Active' and AssociationFeeIncludes ne null");
  const url2 = `https://api.cotality.com/trestle/odata/Property?$filter=${filter2}&$top=5&$select=ListingId,AssociationFeeIncludes,AssociationAmenities,BuildingFeatures`;
  const r2 = await fetch(url2, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d2 = await r2.json();
  if (d2.error) {
    console.log('Error:', d2.error.message.substring(0, 200));
  } else if (d2.value) {
    for (const rec of d2.value) {
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
