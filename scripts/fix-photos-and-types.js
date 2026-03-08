// Fix 1: Replace DOCUMENT-Pdf URLs with null (floor plans, not photos)
// Fix 2: Fix 122 W 73rd wrong Trestle match
// Fix 3: Ensure property type from Excel is preserved when Trestle match was wrong
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');
const data = require(dataPath);

let fixedPhotos = 0;
let fixedPrices = 0;

for (const arr of [data.pastSales, data.pastRentals]) {
  for (const d of arr) {
    // Fix 1: Strip non-photo media URLs (floor plans, documents)
    if (d.photoUrl) {
      const proxyUrl = d.photoUrl;
      // The actual Trestle URL is encoded in the proxy query param
      const urlParam = decodeURIComponent(proxyUrl.replace('/api/media/proxy?url=', ''));
      if (urlParam.includes('DOCUMENT-') || urlParam.includes('VIRTUAL_TOUR') || urlParam.includes('.pdf')) {
        console.log(`  Stripped floor plan: ${d.street} ${d.unit || ''}`);
        d.photoUrl = null;
        fixedPhotos++;
      }
    }

    // Fix 2: 122 W 73rd — wrong Trestle match, clear bad data
    if (d.street.includes('73rd') && d.street.includes('122')) {
      console.log(`  Fixing 122 W 73rd: price was $${d.price}, type was ${d.type}`);
      d.price = null; // Remove wrong price from rental match
      d.type = 'Townhouse'; // Restore from Excel
      d.source = 'manual'; // Not reliably from Trestle
      d.photoUrl = null;
      d.listingId = null;
      d.listingKey = null;
      d.listOfficeName = null;
      fixedPrices++;
    }
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`\nFixed ${fixedPhotos} floor plan photos -> null`);
console.log(`Fixed ${fixedPrices} wrong price entries`);

// Verify: show remaining photos
const allDeals = [...data.pastSales, ...data.pastRentals];
const withPhotos = allDeals.filter(d => d.photoUrl);
console.log(`\nRemaining photos: ${withPhotos.length}`);
withPhotos.forEach(d => {
  const url = decodeURIComponent(d.photoUrl.replace('/api/media/proxy?url=', ''));
  const isPhoto = url.includes('PHOTO-');
  console.log(`  ${isPhoto ? 'OK' : 'BAD'} | ${d.street} ${d.unit || ''} | ${url.substring(0, 60)}...`);
});
