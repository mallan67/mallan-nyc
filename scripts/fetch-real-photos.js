// For listings that had floor plans stripped, try to find their actual PHOTO media
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const path = require('path');

const base = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
const dataPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');

async function run() {
  const data = require(dataPath);
  const allDeals = [...data.pastSales, ...data.pastRentals];

  // Find deals from Trestle that have a listingId but no photo
  const needPhoto = allDeals.filter(d => d.listingId && !d.photoUrl);
  console.log(`Deals needing photos: ${needPhoto.length}`);
  if (needPhoto.length === 0) return;

  // Get token
  const tokenRes = await fetch(`${base}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api' }),
  });
  const { access_token } = await tokenRes.json();

  // Batch fetch ALL media for these listings (not just Order 1)
  const ids = needPhoto.map(d => d.listingId);
  let fixed = 0;

  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const filterParts = batch.map(id => `ResourceRecordID eq '${id}'`);
    const params = new URLSearchParams();
    params.set('$filter', `(${filterParts.join(' or ')})`);
    params.set('$select', 'ResourceRecordID,MediaURL,Order');
    params.set('$orderby', 'ResourceRecordID asc,Order asc');
    params.set('$top', String(batch.length * 10));

    const res = await fetch(`${base}/odata/Media?${params}`, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });
    if (!res.ok) continue;
    const media = await res.json();

    for (const m of (media.value || [])) {
      const url = m.MediaURL || '';
      const lid = String(m.ResourceRecordID || '');
      if (!lid || !url) continue;

      // Only accept PHOTO URLs
      if (!url.includes('PHOTO-')) continue;

      // Find the deal and set the photo
      const deal = allDeals.find(d => d.listingId === lid && !d.photoUrl);
      if (deal) {
        deal.photoUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
        console.log(`  Found photo for ${deal.street} ${deal.unit || ''} (Order ${m.Order})`);
        fixed++;
      }
    }
  }

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`\nAdded ${fixed} real photos`);
  console.log(`Total with photos now: ${allDeals.filter(d => d.photoUrl).length}`);
}

run().catch(console.error);
