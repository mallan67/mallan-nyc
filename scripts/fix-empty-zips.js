/**
 * Fix neighborhoods with empty zipCodes by assigning
 * the most relevant neighboring ZIP(s).
 *
 * These neighborhoods are too small to have their own ZIP,
 * so we pick the ZIP that covers the most of their area.
 */
const fs = require('fs');

// Fallback: assign one "best fit" ZIP per small neighborhood
const FALLBACKS = {
  manhattan: {
    'little-italy': ['10013'],    // Within Tribeca's 10013
    'two-bridges': ['10002'],     // Within LES's 10002
    'nolita': ['10012'],          // Within SoHo's 10012
    'noho': ['10003'],            // Within East Village's 10003
    'hudson-yards': ['10001'],    // Within Chelsea's 10001
    'gramercy': ['10010'],        // Within Flatiron's 10010
    'nomad': ['10016'],           // Within Kips Bay's 10016
    'sutton-place': ['10022'],    // Within Midtown East's 10022
    'hells-kitchen': ['10019'],   // Within Midtown West's 10019
  },
  brooklyn: {
    'dumbo': ['11201'],           // Within Brooklyn Heights' 11201
    'carroll-gardens': ['11231'], // Within Cobble Hill's 11231
  },
  bronx: {
    'city-island': ['10464'],     // Within Pelham Bay's 10464
  },
};

for (const [borough, fallbacks] of Object.entries(FALLBACKS)) {
  const filePath = `data/${borough}-neighborhoods.json`;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let updated = 0;
  for (const n of data.neighborhoods) {
    if (fallbacks[n.slug] && (!n.zipCodes || n.zipCodes.length === 0)) {
      n.zipCodes = fallbacks[n.slug];
      console.log(`${n.name}: [] → [${n.zipCodes.join(',')}] (fallback)`);
      updated++;
    }
  }

  if (updated > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  Updated ${updated} in ${filePath}\n`);
  }
}

// Final verification
console.log('\n=== FINAL CHECK ===');
const boroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'];
let empty = 0;
for (const b of boroughs) {
  const data = JSON.parse(fs.readFileSync(`data/${b}-neighborhoods.json`, 'utf8'));
  for (const n of data.neighborhoods) {
    if (!n.zipCodes || n.zipCodes.length === 0) {
      console.log(`WARNING: ${n.name} (${b}) still has no ZIPs`);
      empty++;
    }
  }
}
if (empty === 0) console.log('All neighborhoods have at least 1 ZIP code.');

// Show final zip overlap check
const zipMap = {};
for (const b of boroughs) {
  const data = JSON.parse(fs.readFileSync(`data/${b}-neighborhoods.json`, 'utf8'));
  for (const n of data.neighborhoods) {
    for (const z of (n.zipCodes || [])) {
      if (!zipMap[z]) zipMap[z] = [];
      zipMap[z].push(n.name);
    }
  }
}
console.log('\n=== Shared ZIPs (intentional — small neighborhoods share parent ZIP) ===');
for (const [zip, hoods] of Object.entries(zipMap).sort()) {
  if (hoods.length > 1) console.log(`  ${zip} => ${hoods.join(', ')}`);
}
