// Strip photos from buyer-rep deals (compliance: can't use another broker's listing photos for agent advertising)
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data', 'maya-past-deals.json');
const data = require(dataPath);

let stripped = 0;
for (const arr of [data.pastSales, data.pastRentals]) {
  for (const d of arr) {
    if (d.listOfficeName && d.listOfficeName !== 'MAllan Real Estate Inc' && d.photoUrl) {
      d.photoUrl = null;
      stripped++;
    }
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('Stripped photos from ' + stripped + ' buyer-rep deals');

const allDeals = [...data.pastSales, ...data.pastRentals];
const exclusive = allDeals.filter(d => !d.listOfficeName || d.listOfficeName === 'MAllan Real Estate Inc');
const buyerRep = allDeals.filter(d => d.listOfficeName && d.listOfficeName !== 'MAllan Real Estate Inc');
const withPhotos = allDeals.filter(d => d.photoUrl);
console.log('Exclusive deals:', exclusive.length, '| Buyer-rep:', buyerRep.length);
console.log('With photos:', withPhotos.length, '(all should be exclusives now)');
console.log('Sales:', data.pastSales.length, '| Rentals:', data.pastRentals.length);
