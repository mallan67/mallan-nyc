// Clear Trestle data from entries where the matched listing agent is NOT Maya Allan
// These are wrong matches — different transactions at the same address
const fs = require('fs');
const path = require('path');
const { readWorkbook, worksheetToObjects } = require('./lib/exceljs-rows');

const dataPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');
const data = require(dataPath);

const excelPath = path.join('C:', 'Users', 'MayaAllan', 'Desktop', 'Closed Deals Real Estate', 'Closed Deals MAllan', 'Total Deals.xlsx');

function parseExcelDate(serial) {
  if (!serial) return null;
  if (serial instanceof Date) return serial.toISOString().split('T')[0];
  if (typeof serial === 'string') return serial;
  return new Date((serial - 25569) * 86400000).toISOString().split('T')[0];
}

function normalizeType(t) {
  if (!t) return 'Residential';
  const tl = t.toLowerCase().trim();
  if (tl.includes('commercial')) return 'Commercial';
  if (tl === 'condo') return 'Condo';
  if (tl === 'coop') return 'Co-op';
  if (tl === 'condop' || tl === 'condp') return 'Condop';
  if (tl === 'townhouse') return 'Townhouse';
  if (tl === 'garage') return 'Garage';
  if (tl === 'rental') return 'Rental';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

async function main() {
  const wb = await readWorkbook(excelPath);

  // Build Excel lookup by normalized address for restoring original types
  const excelSales = worksheetToObjects(wb.getWorksheet('Total Sales'));
  const excelRentals = worksheetToObjects(wb.getWorksheet('Total Rentals'));

  // Build Excel type lookup
  const excelTypeLookup = new Map();
  for (const row of [...excelSales, ...excelRentals]) {
    const addr = (row['Address'] || '').split(',')[0].toLowerCase().replace(/\s+/g, ' ').trim();
    excelTypeLookup.set(addr, normalizeType(row['Type'] || row['type']));
  }

  let fixed = 0;
  for (const arr of [data.pastSales, data.pastRentals]) {
    for (const d of arr) {
      // If the Trestle listing agent is NOT Maya, this is a wrong match
      if (d.listAgentFullName && d.listAgentFullName !== 'Maya Allan') {
        console.log(`Clearing: ${d.street} ${d.unit || ''} | was $${(d.price || 0).toLocaleString()} | agent: ${d.listAgentFullName} | office: ${d.listOfficeName}`);

        // Restore Excel type
        const addrKey = d.street.toLowerCase().replace(/\s+/g, ' ').trim();
        const excelType = excelTypeLookup.get(addrKey);
        if (excelType) d.type = excelType;

        // Clear wrong Trestle data
        d.price = null;
        d.photoUrl = null;
        d.source = 'manual';
        d.listingId = null;
        d.listingKey = null;
        // Keep listOfficeName and listAgentFullName for reference but mark as buyer-rep
        fixed++;
      }
    }
  }

  // Now re-run the placement fix (some entries moved to wrong tab based on wrong prices)
  const RENTAL_CEILING = 15000;
  const SALE_FLOOR = 50000;
  const movedToRentals = [];
  const movedToSales = [];

  data.pastSales = data.pastSales.filter(d => {
    if (d.price && d.price > 0 && d.price < RENTAL_CEILING) {
      movedToRentals.push(d);
      return false;
    }
    return true;
  });

  data.pastRentals = data.pastRentals.filter(d => {
    if (d.price && d.price > SALE_FLOOR) {
      movedToSales.push(d);
      return false;
    }
    return true;
  });

  data.pastSales.push(...movedToSales);
  data.pastRentals.push(...movedToRentals);

  // Sort by date
  const sortByDate = (a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  };
  data.pastSales.sort(sortByDate);
  data.pastRentals.sort(sortByDate);

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  console.log(`\nCleared wrong Trestle data from ${fixed} entries`);
  console.log(`Moved ${movedToRentals.length} to rentals, ${movedToSales.length} to sales`);
  console.log(`Final: Sales=${data.pastSales.length} | Rentals=${data.pastRentals.length}`);

  // Verify: only Maya's deals should have Trestle data
  const allDeals = [...data.pastSales, ...data.pastRentals];
  const withPrice = allDeals.filter(d => d.price && d.price > 1);
  const withPhoto = allDeals.filter(d => d.photoUrl);
  const trestle = allDeals.filter(d => d.source === 'trestle');
  console.log(`With price: ${withPrice.length} | With photo: ${withPhoto.length} | From Trestle: ${trestle.length}`);
  console.log(`\nAll remaining Trestle entries are Maya's:`);
  trestle.forEach(d => console.log(`  ${d.street} ${d.unit || ''} | $${(d.price || 0).toLocaleString()} | ${d.listAgentFullName}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
