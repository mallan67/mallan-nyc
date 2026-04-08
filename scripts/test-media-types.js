// Check what media types Trestle returns — find photos vs floor plans
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

  // Get media for a few known listings — check ALL fields
  // Use actual listing IDs from the data
  const testIds = ['RLS10797980', 'RLS10659197', 'RLS10645106', 'RLS10051583', 'RLS10094443'];

  for (const id of testIds) {
    const params = new URLSearchParams();
    // Trestle guidance (2026-04-07): prefer ResourceRecordKey (always unique)
    // These are hardcoded ListingIds — try both fields
    params.set('$filter', `(ResourceRecordKey eq '${id}' or ResourceRecordID eq '${id}')`);
    params.set('$select', 'ResourceRecordKey,ResourceRecordID,MediaURL,ShortDescription,LongDescription,Order,PreferredPhotoYN');
    params.set('$orderby', 'Order asc');
    params.set('$top', '10');

    const res = await fetch(`${base}/odata/Media?${params}`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    if (!res.ok) { console.log(`${id}: HTTP ${res.status}`); continue; }
    const data = await res.json();
    const items = data.value || [];
    console.log(`\n=== ${id} (${items.length} media items) ===`);
    items.forEach(m => {
      console.log(`  Order=${m.Order} | Type=${m.MediaType} | Cat=${m.MediaCategory} | Preferred=${m.PreferredPhotoYN} | Desc="${m.ShortDescription || m.LongDescription || ''}" | MIME=${m.MimeType} | URL=${(m.MediaURL || '').substring(0, 80)}...`);
    });
  }
}

run().catch(console.error);
