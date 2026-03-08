/**
 * Test Trestle API geo filtering capabilities.
 * Probes Latitude/Longitude OData filters to see what works.
 */
async function main() {
  // Get token
  const tokenRes = await fetch('https://api.cotality.com/trestle/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'd5212c48_b473_4f79_81f9_a42e61b1d76a',
      client_secret: '2b725eee24fc47ac9105449fe9cc2c5c',
      scope: 'api',
    }),
  });
  const { access_token } = await tokenRes.json();
  console.log('Got token.\n');

  const BASE = 'https://api.cotality.com/trestle/odata/Property';
  const headers = { Authorization: 'Bearer ' + access_token, Accept: 'application/json' };

  async function tryFilter(label, filter, select) {
    const params = new URLSearchParams();
    params.set('$filter', filter);
    params.set('$select', select || 'ListingId,Latitude,Longitude,PostalCode,StreetNumber,StreetName');
    params.set('$top', '5');

    console.log(`--- ${label} ---`);
    console.log(`Filter: ${filter}`);
    try {
      const r = await fetch(BASE + '?' + params.toString(), { headers });
      console.log(`Status: ${r.status}`);
      if (!r.ok) {
        const txt = await r.text();
        console.log(`Error: ${txt.substring(0, 300)}\n`);
        return;
      }
      const d = await r.json();
      const results = d.value || [];
      console.log(`Results: ${results.length}`);
      results.slice(0, 3).forEach(r =>
        console.log(`  ${r.ListingId} | ${r.StreetNumber} ${r.StreetName} ${r.PostalCode} | lat:${r.Latitude} lng:${r.Longitude}`)
      );
      console.log('');
    } catch (e) {
      console.log(`Fetch error: ${e.message}\n`);
    }
  }

  // Test 1: Basic Latitude ge/le
  await tryFilter(
    'Test 1: Latitude ge/le',
    "StandardStatus eq 'Active' and Latitude ge 40.738 and Latitude le 40.75"
  );

  // Test 2: Longitude ge/le only
  await tryFilter(
    'Test 2: Longitude ge/le',
    "StandardStatus eq 'Active' and Longitude ge -74.007 and Longitude le -73.992"
  );

  // Test 3: Full bounding box (Chelsea)
  await tryFilter(
    'Test 3: Full bounding box',
    "StandardStatus eq 'Active' and Latitude ge 40.738 and Latitude le 40.75 and Longitude ge -74.007 and Longitude le -73.992"
  );

  // Test 4: Check if Latitude is even returned (no filter)
  await tryFilter(
    'Test 4: No geo filter — check if Lat/Lng returned',
    "StandardStatus eq 'Active' and PostalCode eq '10011'"
  );

  // Test 5: Try Latitude ne null
  await tryFilter(
    'Test 5: Latitude ne null',
    "StandardStatus eq 'Active' and Latitude ne null and PostalCode eq '10011'"
  );

  // Test 6: Try geo with $metadata endpoint to see schema
  console.log('--- Test 6: Check $metadata for Latitude field type ---');
  try {
    const metaRes = await fetch(BASE + '/$metadata', { headers: { ...headers, Accept: 'application/xml' } });
    const metaTxt = await metaRes.text();
    // Find Latitude in metadata
    const latMatch = metaTxt.match(/Name="Latitude"[^>]*/);
    const lngMatch = metaTxt.match(/Name="Longitude"[^>]*/);
    console.log('Latitude field:', latMatch ? latMatch[0] : 'NOT FOUND');
    console.log('Longitude field:', lngMatch ? lngMatch[0] : 'NOT FOUND');
  } catch (e) {
    console.log('Metadata error:', e.message);
  }
}

main().catch(console.error);
