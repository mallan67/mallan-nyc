/**
 * Fix bounding boxes based on StreetEasy screenshots (March 2026).
 * Only updates neighborhoods where bounds need correction.
 */
const fs = require('fs');

const FIXES = {
  // Murray Hill: 34th to 42nd, Park Ave to FDR (per StreetEasy screenshot)
  'murray-hill':    { north: 40.7549, south: 40.7490, east: -73.9680, west: -73.9830 },
  // Midtown East: 42nd to ~60th, Madison Ave to east (per StreetEasy)
  'midtown-east':   { north: 40.7640, south: 40.7549, east: -73.9640, west: -73.9780 },
  // Kips Bay: 23rd to 34th, 1st Ave / FDR strip (per StreetEasy — narrow east strip)
  'kips-bay':       { north: 40.7490, south: 40.7400, east: -73.9700, west: -73.9810 },
  // NoMad: 23rd to 30th, 5th Ave to Park Ave S (small box, per StreetEasy)
  'nomad':          { north: 40.7478, south: 40.7422, east: -73.9840, west: -73.9910 },
  // Sutton Place: ~49th to 59th, east of 1st Ave (per StreetEasy)
  'sutton-place':   { north: 40.7620, south: 40.7560, east: -73.9580, west: -73.9660 },
  // Gramercy Park: 14th to 23rd, 3rd Ave to Park Ave S (per StreetEasy)
  'gramercy':       { north: 40.7422, south: 40.7340, east: -73.9790, west: -73.9870 },
  // Flatiron: 14th to ~23rd, 5th Ave to Park Ave S (per StreetEasy)
  'flatiron':       { north: 40.7422, south: 40.7358, east: -73.9860, west: -73.9940 },

  // FiDi: Chambers St down to Battery, per StreetEasy screenshot
  'financial-district': { north: 40.7130, south: 40.7000, east: -73.9980, west: -74.0170 },
  // Tribeca: Canal down to Chambers/Barclay, river to Broadway
  'tribeca':        { north: 40.7220, south: 40.7130, east: -74.0000, west: -74.0130 },
  // BPC: west of West St, Chambers to Battery
  'battery-park-city': { north: 40.7175, south: 40.7050, east: -74.0130, west: -74.0210 },

  // Chelsea: W 14th to ~W 30th, river to ~6th Ave (per StreetEasy screenshot)
  'chelsea':        { north: 40.7500, south: 40.7380, east: -73.9920, west: -74.0070 },

  // Greenwich Village: StreetEasy shows LARGE area — Houston to 14th, river to Broadway
  // Includes West Village area + Washington Square Park + extends to Broadway
  'greenwich-village': { north: 40.7380, south: 40.7264, east: -73.9890, west: -74.0070 },
  // West Village: subset — west of 7th Ave, Houston to 14th
  'west-village':   { north: 40.7380, south: 40.7264, east: -73.9990, west: -74.0110 },

  // East Village: Houston to 14th, Broadway/Bowery to FDR (per StreetEasy screenshot)
  'east-village':   { north: 40.7358, south: 40.7230, east: -73.9720, west: -73.9900 },

  // SoHo: Houston to Canal, west of Lafayette — per StreetEasy
  'soho':           { north: 40.7264, south: 40.7210, east: -73.9960, west: -74.0050 },
  // Nolita: Houston to Broome, Lafayette to Bowery
  'nolita':         { north: 40.7260, south: 40.7190, east: -73.9900, west: -73.9960 },
  // NoHo: Houston to ~8th St, Broadway to Bowery
  'noho':           { north: 40.7310, south: 40.7250, east: -73.9880, west: -73.9960 },

  // Hell's Kitchen / Midtown West per StreetEasy
  'hells-kitchen':  { north: 40.7670, south: 40.7549, east: -73.9880, west: -74.0020 },
  'midtown-west':   { north: 40.7620, south: 40.7490, east: -73.9830, west: -73.9990 },
};

const filePath = 'data/manhattan-neighborhoods.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let updated = 0;
for (const n of data.neighborhoods) {
  if (FIXES[n.slug]) {
    const old = JSON.stringify(n.bounds);
    n.bounds = FIXES[n.slug];
    const neu = JSON.stringify(n.bounds);
    if (old !== neu) {
      console.log(`${n.name}: updated bounds`);
      updated++;
    }
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
console.log(`\nUpdated ${updated} neighborhood bounds.`);
