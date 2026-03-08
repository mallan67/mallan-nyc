const data = require('../data/maya-past-deals.json');
const fs = require('fs');

for (const list of [data.pastSales, data.pastRentals]) {
  for (const d of list) {
    // Remove city names from unit field
    if (d.unit && /^(New York|Brooklyn|Long Island)/i.test(d.unit)) {
      d.unit = null;
    }
    // Fix street names with embedded unit like '630 First Avenue 19P'
    const m = d.street.match(/^(.+?)\s+(\d+\w{1,3})$/);
    if (m && !d.unit && /\d/.test(m[2])) {
      d.street = m[1];
      d.unit = m[2];
    }
    // Clean 'Apt' prefix from units
    if (d.unit) d.unit = d.unit.replace(/^Apt\s+/i, '');
    // Normalize type capitalization
    if (d.type) d.type = d.type.charAt(0).toUpperCase() + d.type.slice(1);
    // Fix 'Condp' typo
    if (d.type === 'Condp') d.type = 'Condop';
    // Fix 'Condo Commercial' -> 'Commercial'
    if (/commercial/i.test(d.type)) d.type = 'Commercial';
    // Trim neighborhood
    if (d.neighborhood) d.neighborhood = d.neighborhood.trim();
  }
}

fs.writeFileSync('data/maya-past-deals.json', JSON.stringify(data, null, 2));
console.log('Fixed. Sales:', data.pastSales.length, 'Rentals:', data.pastRentals.length);
