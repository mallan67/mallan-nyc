const fs = require('fs');
const boroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'];
const zipMap = {};
const allHoods = {};

for (const b of boroughs) {
  const data = JSON.parse(fs.readFileSync('data/' + b + '-neighborhoods.json', 'utf8'));
  for (const n of data.neighborhoods) {
    allHoods[n.name] = { borough: b, zips: n.zipCodes || [] };
    for (const z of (n.zipCodes || [])) {
      if (!zipMap[z]) zipMap[z] = [];
      zipMap[z].push(n.name + ' (' + b + ')');
    }
  }
}

console.log('=== OVERLAPPING ZIP CODES ===');
const sorted = Object.entries(zipMap).sort((a, b) => a[0].localeCompare(b[0]));
for (const [zip, hoods] of sorted) {
  if (hoods.length > 1) {
    console.log(zip, '=>', hoods.join(', '));
  }
}

console.log('\n=== ALL NEIGHBORHOODS + ZIPS ===');
for (const [name, info] of Object.entries(allHoods).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(name, '(' + info.borough + '):', info.zips.join(', '));
}
