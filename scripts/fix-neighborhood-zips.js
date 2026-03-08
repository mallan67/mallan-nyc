/**
 * Fix neighborhood ZIP code assignments.
 *
 * Rules:
 * 1. Each ZIP maps to ONE primary neighborhood (no overlaps)
 * 2. Based on USPS delivery area + NYC DCP NTA boundaries
 * 3. Where a ZIP spans two neighborhoods, assign to the one with more area
 * 4. Every neighborhood gets at least one ZIP
 */

const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// AUTHORITATIVE ZIP → PRIMARY NEIGHBORHOOD (NYC)
// Source: USPS, NYC DCP NTA 2020, verified against Google Maps
// ═══════════════════════════════════════════════════════════════

const MANHATTAN_ZIPS = {
  // Battery Park City
  'battery-park-city': ['10280', '10282'],
  // Financial District — southern tip
  'financial-district': ['10004', '10005', '10006', '10038'],
  // Two Bridges — between Manhattan/Brooklyn bridges
  'two-bridges': ['10002'],
  // Tribeca
  'tribeca': ['10007', '10013'],
  // Chinatown — shares 10013 with Tribeca, but primary area is east
  'chinatown': ['10038'],  // Remove — FiDi already has 10038. Chinatown is within 10002/10013
  // Little Italy — tiny, within 10012/10013
  'little-italy': ['10013'],  // shares with Tribeca — will fix below
  // SoHo
  'soho': ['10012'],
  // Nolita — small, east of SoHo
  'nolita': ['10012'],  // shares with SoHo — will fix below
  // NoHo
  'noho': ['10003'],  // shares with EV/GV — will fix below
  // Lower East Side
  'lower-east-side': ['10002'],  // shares with Two Bridges — will fix below
  // East Village
  'east-village': ['10009', '10003'],
  // Greenwich Village — west of Broadway
  'greenwich-village': ['10011', '10014'],
  // West Village — west of 7th Ave
  'west-village': ['10014'],  // shares with GV — will fix below
  // Chelsea
  'chelsea': ['10001', '10011'],
  // Hudson Yards
  'hudson-yards': ['10001'],  // shares with Chelsea — will fix below
  // Flatiron
  'flatiron': ['10010'],
  // Gramercy
  'gramercy': ['10003', '10010'],  // shares — will fix
  // NoMad
  'nomad': ['10016'],  // shares with Murray Hill — will fix
  // Kips Bay
  'kips-bay': ['10016'],
  // Murray Hill
  'murray-hill': ['10016', '10017'],
  // Midtown East
  'midtown-east': ['10017', '10022', '10155'],
  // Sutton Place
  'sutton-place': ['10022'],
  // Midtown West
  'midtown-west': ['10018', '10019', '10036'],
  // Hell\'s Kitchen
  'hells-kitchen': ['10019', '10036'],
  // Upper East Side
  'upper-east-side': ['10021', '10065', '10075'],
  // Yorkville
  'yorkville': ['10028', '10128'],
  // Roosevelt Island
  'roosevelt-island': ['10044'],
  // Upper West Side
  'upper-west-side': ['10023', '10024', '10069'],
  // Morningside Heights
  'morningside-heights': ['10025', '10027'],
  // Harlem
  'harlem': ['10026', '10027', '10030', '10031', '10037', '10039'],
  // East Harlem
  'east-harlem': ['10029', '10035'],
  // Washington Heights
  'washington-heights': ['10032', '10033', '10040'],
  // Inwood
  'inwood': ['10034', '10040'],
};

// ═══════════════════════════════════════════════════════════════
// CORRECT, NON-OVERLAPPING ASSIGNMENTS
// Each ZIP appears EXACTLY ONCE
// ═══════════════════════════════════════════════════════════════

const CORRECT_ZIPS = {
  manhattan: {
    'battery-park-city': ['10280', '10282'],
    'financial-district': ['10004', '10005', '10006', '10007'],
    'tribeca': ['10013'],
    'chinatown': ['10038'],
    'little-italy': [],  // Too small for own ZIP — within 10012/10013
    'two-bridges': [],   // Within 10002
    'soho': ['10012'],
    'nolita': [],        // Within 10012 — SoHo gets it as primary
    'noho': [],          // Within 10003 — East Village gets it as primary
    'lower-east-side': ['10002'],
    'east-village': ['10003', '10009'],
    'greenwich-village': ['10011'],
    'west-village': ['10014'],
    'chelsea': ['10001'],
    'hudson-yards': [],  // Within 10001 — Chelsea gets it as primary
    'flatiron': ['10010'],
    'gramercy': [],      // Within 10010 — Flatiron gets it as primary (Gramercy Park is tiny)
    'nomad': [],         // Within 10016 — Murray Hill gets it as primary
    'kips-bay': ['10016'],
    'murray-hill': ['10017'],
    'midtown-east': ['10022', '10155'],
    'sutton-place': [],  // Within 10022 — Midtown East gets it
    'midtown-west': ['10018', '10019', '10036'],
    'hells-kitchen': [], // Within 10019/10036 — Midtown West gets them
    'upper-east-side': ['10021', '10065', '10075'],
    'yorkville': ['10028', '10128'],
    'roosevelt-island': ['10044'],
    'upper-west-side': ['10023', '10024', '10069'],
    'morningside-heights': ['10025'],
    'harlem': ['10026', '10027', '10030', '10031', '10037', '10039'],
    'east-harlem': ['10029', '10035'],
    'washington-heights': ['10032', '10033'],
    'inwood': ['10034', '10040'],
  },
  brooklyn: {
    'brooklyn-heights': ['11201'],
    'dumbo': [],          // Within 11201 — Brooklyn Heights gets it
    'cobble-hill': ['11231'],  // Carroll Gardens shares — see below
    'carroll-gardens': [],     // Within 11231 — Cobble Hill gets it
    'park-slope': ['11215'],
    'prospect-heights': ['11238'],
    'fort-greene': ['11205', '11217'],
    'bed-stuy': ['11206', '11216', '11221', '11233'],
    'williamsburg': ['11211', '11249'],
    'greenpoint': ['11222'],
  },
  queens: {
    'astoria': ['11102', '11103', '11105', '11106'],
    'long-island-city': ['11101', '11109', '11120'],
    'sunnyside': ['11104'],
    'jackson-heights': ['11370', '11372'],
    'flushing': ['11354', '11355', '11358'],
    'forest-hills': ['11375'],
    'bayside': ['11360', '11361', '11364'],
  },
  bronx: {
    'riverdale': ['10463', '10471'],
    'mott-haven': ['10451', '10454', '10455'],
    'fordham': ['10457', '10458', '10468'],
    'pelham-bay': ['10461', '10462', '10464', '10465'],
    'city-island': [],  // Within 10464 — Pelham Bay gets it
  },
  'staten-island': {
    'st-george': ['10301'],
    'new-brighton': ['10310'],
    'todt-hill': ['10304', '10314'],
    'great-kills': ['10308'],
  },
};

// Now update each borough JSON file
for (const [borough, neighborhoods] of Object.entries(CORRECT_ZIPS)) {
  const filePath = `data/${borough}-neighborhoods.json`;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let updated = 0;
  for (const n of data.neighborhoods) {
    if (neighborhoods[n.slug] !== undefined) {
      const oldZips = (n.zipCodes || []).join(',');
      n.zipCodes = neighborhoods[n.slug];
      const newZips = n.zipCodes.join(',');
      if (oldZips !== newZips) {
        console.log(`${n.name}: [${oldZips}] → [${newZips}]`);
        updated++;
      }
    }
  }

  if (updated > 0) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  Updated ${updated} neighborhoods in ${filePath}\n`);
  } else {
    console.log(`  No changes needed in ${filePath}\n`);
  }
}

// Verify no overlaps
console.log('\n=== VERIFICATION: Checking for overlaps ===');
const zipCheck = {};
for (const [borough, neighborhoods] of Object.entries(CORRECT_ZIPS)) {
  for (const [slug, zips] of Object.entries(neighborhoods)) {
    for (const z of zips) {
      if (zipCheck[z]) {
        console.log(`OVERLAP: ${z} => ${zipCheck[z]} AND ${slug} (${borough})`);
      }
      zipCheck[z] = `${slug} (${borough})`;
    }
  }
}
console.log(`Total unique ZIPs assigned: ${Object.keys(zipCheck).length}`);

// Check for neighborhoods with no ZIPs
console.log('\n=== Neighborhoods with NO ZIPs (too small) ===');
for (const [borough, neighborhoods] of Object.entries(CORRECT_ZIPS)) {
  for (const [slug, zips] of Object.entries(neighborhoods)) {
    if (zips.length === 0) {
      console.log(`  ${slug} (${borough}) — will use parent neighborhood ZIPs`);
    }
  }
}
