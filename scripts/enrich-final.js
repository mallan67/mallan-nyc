const fs = require('fs');
const data = require('../data/maya-past-deals.json');

// Manual price assignments for deals not found via automated search
const manualPrices = {
  // 100 UN Plaza 14B - sold for $1.6M in 2015 (RLS10094406)
  '100 United Nations Plaza|14B|sale': 1600000,
};

let fixed = 0;
let stillMissing = [];

for (const listName of ['pastSales', 'pastRentals']) {
  const dealType = listName === 'pastSales' ? 'sale' : 'rent';
  for (const deal of data[listName]) {
    if (!deal.price || deal.price <= 1) {
      const key = `${deal.street}|${deal.unit || ''}|${dealType}`;
      if (manualPrices[key]) {
        deal.price = manualPrices[key];
        fixed++;
        console.log(`FIXED: ${deal.street} ${deal.unit || ''} -> $${deal.price.toLocaleString()}`);
      } else {
        stillMissing.push(`${deal.street} ${deal.unit || ''} (${dealType})`);
      }
    }
  }
}

console.log(`\nFixed: ${fixed}`);
if (stillMissing.length > 0) {
  console.log(`Still missing prices (${stillMissing.length}):`);
  stillMissing.forEach(s => console.log(`  - ${s}`));
}

// Count total with prices
let withPrice = 0, total = 0;
for (const list of [data.pastSales, data.pastRentals]) {
  for (const deal of list) {
    total++;
    if (deal.price && deal.price > 1) withPrice++;
  }
}
console.log(`\nTotal: ${total}, With prices: ${withPrice}, Missing: ${total - withPrice}`);

fs.writeFileSync('data/maya-past-deals.json', JSON.stringify(data, null, 2));
console.log('Saved.');
