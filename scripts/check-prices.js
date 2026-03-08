const d = require('./deals-check.json');
const all = [...d.sales, ...d.rentals];
let np = 0;
const missing = [];
all.forEach(x => {
  if (x.closePrice == null || x.closePrice <= 1) {
    np++;
    missing.push(x.street + ' ' + (x.unit || '') + ' (' + x.source + ')');
  }
});
console.log('Total:', all.length, 'Missing price:', np);
missing.forEach(s => console.log(' ', s));
