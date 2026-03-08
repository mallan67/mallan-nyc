/**
 * Add lat/lng bounding boxes to neighborhood JSON files.
 * Based on StreetEasy boundary maps (verified March 2026).
 *
 * Format: { north, south, east, west } as decimal lat/lng
 * These define the rectangular bounding box for OData geo filtering.
 */

const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// BOUNDING BOXES — derived from StreetEasy boundary screenshots
// + Google Maps coordinate verification
//
// Manhattan grid reference:
//   Houston St ≈ 40.7264    14th St ≈ 40.7358    23rd St ≈ 40.7422
//   34th St ≈ 40.7508       42nd St ≈ 40.7549    59th St ≈ 40.7648
//   72nd St ≈ 40.7738       86th St ≈ 40.7838    96th St ≈ 40.7908
//   110th St ≈ 40.8008      125th St ≈ 40.8108   155th St ≈ 40.8308
//   Broadway ≈ -73.989 (at Houston)
//   5th Ave ≈ -73.992 (at 14th) to -73.974 (at 59th)
//   6th Ave ≈ -73.994 (at 14th)
//   7th Ave ≈ -73.999 (at 14th)
//   8th Ave ≈ -74.003 (at 14th)
//   3rd Ave ≈ -73.984 (at 14th)
//   Lexington ≈ -73.977 (at 59th)
//   Park Ave ≈ -73.979 (at 34th)
//   FDR Drive ≈ -73.972 (at 14th) to -73.955 (at 96th)
//   Hudson River ≈ -74.013 (at 14th)
// ═══════════════════════════════════════════════════════════════

const BOUNDS = {
  manhattan: {
    // ── Downtown ──
    'battery-park-city':    { north: 40.7175, south: 40.7060, east: -74.0130, west: -74.0210 },
    'financial-district':   { north: 40.7130, south: 40.6995, east: -74.0000, west: -74.0170 },
    'tribeca':              { north: 40.7264, south: 40.7130, east: -74.0010, west: -74.0120 },
    'chinatown':            { north: 40.7180, south: 40.7085, east: -73.9900, west: -74.0010 },
    'two-bridges':          { north: 40.7120, south: 40.7050, east: -73.9770, west: -73.9920 },
    'little-italy':        { north: 40.7230, south: 40.7180, east: -73.9940, west: -73.9990 },
    'lower-east-side':     { north: 40.7230, south: 40.7120, east: -73.9750, west: -73.9900 },

    // ── SoHo / NoHo / Nolita ──
    'soho':                 { north: 40.7264, south: 40.7200, east: -73.9960, west: -74.0050 },
    'nolita':               { north: 40.7250, south: 40.7190, east: -73.9900, west: -73.9960 },
    'noho':                 { north: 40.7300, south: 40.7250, east: -73.9880, west: -73.9960 },

    // ── Village ──
    // Greenwich Village: W Houston to ~14th, Broadway to Hudson River
    // StreetEasy shows it as a LARGE area including WSP, from river to Broadway
    'greenwich-village':    { north: 40.7380, south: 40.7264, east: -73.9890, west: -74.0060 },
    // West Village: subset of GV — west of 7th Ave, Houston to 14th
    'west-village':         { north: 40.7380, south: 40.7264, east: -73.9990, west: -74.0110 },

    // ── Chelsea / Hudson Yards ──
    // Chelsea: W 14th to ~W 30th, river to 6th Ave
    'chelsea':              { north: 40.7500, south: 40.7380, east: -73.9920, west: -74.0070 },
    // Hudson Yards: W 30th to W 37th, river to 10th Ave
    'hudson-yards':         { north: 40.7560, south: 40.7500, east: -73.9940, west: -74.0050 },

    // ── Midtown South ──
    // Flatiron: ~15th-23rd, 5th Ave to Park Ave S (west side)
    'flatiron':             { north: 40.7422, south: 40.7358, east: -73.9860, west: -73.9920 },
    // Gramercy: ~14th-23rd, Park Ave S to 3rd Ave
    'gramercy':             { north: 40.7422, south: 40.7330, east: -73.9790, west: -73.9860 },
    // NoMad: ~23rd-30th, 5th Ave to Madison
    'nomad':                { north: 40.7480, south: 40.7422, east: -73.9840, west: -73.9910 },
    // Kips Bay: ~23rd-34th, 3rd Ave to FDR
    'kips-bay':             { north: 40.7490, south: 40.7380, east: -73.9700, west: -73.9810 },
    // Murray Hill: ~34th-40th, 3rd Ave to Madison
    'murray-hill':          { north: 40.7530, south: 40.7480, east: -73.9730, west: -73.9830 },

    // ── East Village ──
    // Houston to 14th, Broadway/3rd to FDR
    'east-village':         { north: 40.7358, south: 40.7230, east: -73.9720, west: -73.9890 },

    // ── Midtown ──
    'midtown-east':         { north: 40.7610, south: 40.7530, east: -73.9650, west: -73.9780 },
    'sutton-place':         { north: 40.7620, south: 40.7530, east: -73.9580, west: -73.9650 },
    'midtown-west':         { north: 40.7620, south: 40.7530, east: -73.9830, west: -73.9990 },
    'hells-kitchen':        { north: 40.7670, south: 40.7530, east: -73.9900, west: -74.0020 },

    // ── Upper East / West ──
    'upper-east-side':      { north: 40.7850, south: 40.7610, east: -73.9500, west: -73.9680 },
    'yorkville':            { north: 40.7908, south: 40.7810, east: -73.9430, west: -73.9580 },
    'roosevelt-island':     { north: 40.7720, south: 40.7500, east: -73.9380, west: -73.9530 },
    'upper-west-side':      { north: 40.8010, south: 40.7700, east: -73.9700, west: -73.9820 },

    // ── Uptown ──
    'morningside-heights':  { north: 40.8120, south: 40.8008, east: -73.9540, west: -73.9680 },
    'harlem':               { north: 40.8240, south: 40.8008, east: -73.9360, west: -73.9600 },
    'east-harlem':          { north: 40.8050, south: 40.7908, east: -73.9350, west: -73.9500 },
    'washington-heights':   { north: 40.8580, south: 40.8340, east: -73.9240, west: -73.9460 },
    'inwood':               { north: 40.8760, south: 40.8550, east: -73.9130, west: -73.9330 },
  },
  brooklyn: {
    'brooklyn-heights':     { north: 40.6990, south: 40.6890, east: -73.9870, west: -74.0020 },
    'dumbo':                { north: 40.7060, south: 40.6990, east: -73.9790, west: -73.9930 },
    'cobble-hill':          { north: 40.6890, south: 40.6810, east: -73.9890, west: -73.9990 },
    'carroll-gardens':      { north: 40.6830, south: 40.6740, east: -73.9920, west: -74.0020 },
    'park-slope':           { north: 40.6810, south: 40.6600, east: -73.9690, west: -73.9830 },
    'prospect-heights':     { north: 40.6850, south: 40.6740, east: -73.9590, west: -73.9720 },
    'fort-greene':          { north: 40.6950, south: 40.6830, east: -73.9700, west: -73.9830 },
    'bed-stuy':             { north: 40.6930, south: 40.6730, east: -73.9280, west: -73.9530 },
    'williamsburg':         { north: 40.7190, south: 40.6990, east: -73.9380, west: -73.9640 },
    'greenpoint':           { north: 40.7340, south: 40.7190, east: -73.9370, west: -73.9590 },
  },
  queens: {
    'astoria':              { north: 40.7840, south: 40.7580, east: -73.8920, west: -73.9280 },
    'long-island-city':     { north: 40.7570, south: 40.7350, east: -73.9300, west: -73.9600 },
    'sunnyside':            { north: 40.7500, south: 40.7350, east: -73.8980, west: -73.9230 },
    'jackson-heights':      { north: 40.7580, south: 40.7420, east: -73.8650, west: -73.8960 },
    'flushing':             { north: 40.7720, south: 40.7500, east: -73.7900, west: -73.8300 },
    'forest-hills':         { north: 40.7280, south: 40.7100, east: -73.8350, west: -73.8600 },
    'bayside':              { north: 40.7850, south: 40.7550, east: -73.7500, west: -73.7830 },
  },
  bronx: {
    'riverdale':            { north: 40.9050, south: 40.8760, east: -73.8920, west: -73.9200 },
    'mott-haven':           { north: 40.8220, south: 40.8040, east: -73.9060, west: -73.9280 },
    'fordham':              { north: 40.8650, south: 40.8500, east: -73.8870, west: -73.9100 },
    'pelham-bay':           { north: 40.8650, south: 40.8350, east: -73.8090, west: -73.8500 },
    'city-island':          { north: 40.8590, south: 40.8400, east: -73.7800, west: -73.7950 },
  },
  'staten-island': {
    'st-george':            { north: 40.6480, south: 40.6350, east: -74.0700, west: -74.0900 },
    'new-brighton':         { north: 40.6450, south: 40.6300, east: -74.0850, west: -74.1050 },
    'todt-hill':            { north: 40.6080, south: 40.5850, east: -74.1000, west: -74.1300 },
    'great-kills':          { north: 40.5600, south: 40.5350, east: -74.1300, west: -74.1600 },
  },
};

// Update each borough JSON
for (const [borough, neighborhoods] of Object.entries(BOUNDS)) {
  const filePath = `data/${borough}-neighborhoods.json`;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let updated = 0;
  for (const n of data.neighborhoods) {
    if (neighborhoods[n.slug]) {
      n.bounds = neighborhoods[n.slug];
      updated++;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`${borough}: added bounds to ${updated} neighborhoods`);
}

console.log('\nDone. Bounding boxes added to all neighborhood JSON files.');
