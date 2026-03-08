// Fix sale/rental misplacement by using price as the final authority
// Rentals: < $15,000/mo  |  Sales: > $50,000
// The $15K-$50K zone is empty in NYC residential RE
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');
const data = require(dataPath);

const RENTAL_CEILING = 15000;
const SALE_FLOOR = 50000;

// Move misplaced entries
const movedToRentals = [];
const movedToSales = [];

// Sales with rental prices -> move to rentals
data.pastSales = data.pastSales.filter(d => {
  if (d.price && d.price > 0 && d.price < RENTAL_CEILING) {
    movedToRentals.push(d);
    return false;
  }
  return true;
});

// Rentals with sale prices -> move to sales
data.pastRentals = data.pastRentals.filter(d => {
  if (d.price && d.price > SALE_FLOOR) {
    movedToSales.push(d);
    return false;
  }
  return true;
});

data.pastSales.push(...movedToSales);
data.pastRentals.push(...movedToRentals);

// Sort by date descending
const sortByDate = (a, b) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
};
data.pastSales.sort(sortByDate);
data.pastRentals.sort(sortByDate);

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

console.log(`Moved ${movedToRentals.length} entries from Sales -> Rentals:`);
movedToRentals.forEach(d => console.log(`  ${d.street} ${d.unit || ''} | $${d.price}`));

console.log(`\nMoved ${movedToSales.length} entries from Rentals -> Sales:`);
movedToSales.forEach(d => console.log(`  ${d.street} ${d.unit || ''} | $${d.price}`));

console.log(`\nFinal: Sales=${data.pastSales.length} | Rentals=${data.pastRentals.length}`);

// Verify no more misplaced
const badSales = data.pastSales.filter(d => d.price && d.price > 0 && d.price < RENTAL_CEILING);
const badRentals = data.pastRentals.filter(d => d.price && d.price > SALE_FLOOR);
if (badSales.length) console.log('\nWARN: Still have low-price sales:', badSales.length);
if (badRentals.length) console.log('\nWARN: Still have high-price rentals:', badRentals.length);
if (!badSales.length && !badRentals.length) console.log('\nAll clean - no misplaced entries.');
