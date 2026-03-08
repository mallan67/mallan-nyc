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

  // Check TaxBlock/TaxLot values on IDX Plus feed
  const fields = ['TaxBlock', 'TaxLot', 'TaxMapNumber'];
  console.log('=== Testing TaxBlock/TaxLot availability ===\n');
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

  // Get some listings with TaxBlock values
  console.log('\n=== Listings with TaxBlock/TaxLot ===\n');
  const select = 'ListingId,TaxBlock,TaxLot,CountyOrParish,PostalCode,StreetNumber,StreetName,UnitNumber';
  const filter = encodeURIComponent("StandardStatus eq 'Active' and TaxBlock ne null and TaxLot ne null");
  const url = `https://api.cotality.com/trestle/odata/Property?$filter=${filter}&$top=10&$select=${encodeURIComponent(select)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const d = await r.json();
  if (d.error) {
    console.log('Error:', d.error.message.substring(0, 200));
  } else if (d.value) {
    for (const rec of d.value) {
      console.log(`  ${rec.ListingId}: Block=${rec.TaxBlock} Lot=${rec.TaxLot} County=${rec.CountyOrParish} ${rec.StreetNumber} ${rec.StreetName} #${rec.UnitNumber || ''}`);
    }
  }
}

main().catch(e => console.error(e.message));
