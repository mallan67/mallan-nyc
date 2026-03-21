/*
 scripts/inspect-custom-media.js
 Reads artifacts/custom-media-raw.json and prints:
  - ListingId
  - CustomProperty: sample keys & first items
  - Media: sample keys & first item
*/
const fs = require('fs');
const p = 'artifacts/custom-media-raw.json';
if (!fs.existsSync(p)) { console.error('missing', p); process.exit(1); }
const data = JSON.parse(fs.readFileSync(p,'utf8'));
const rows = data.value || data;
rows.forEach(r => {
  console.log('LISTING:', r.ListingId || r.ListingKey || '(no id)');
  if (Array.isArray(r.CustomProperty) && r.CustomProperty.length) {
    console.log('  CustomProperty count:', r.CustomProperty.length);
    // collect union of keys across first 5 items
    const sample = r.CustomProperty.slice(0,5);
    const keys = new Set();
    sample.forEach(cp => Object.keys(cp || {}).forEach(k => keys.add(k)));
    console.log('  keys sample:', Array.from(keys).join(', '));
    console.log('  first 3 items (truncated):');
    sample.slice(0,3).forEach(cp => console.log('    -', JSON.stringify(cp).slice(0,300)));
  } else {
    console.log('  CustomProperty: (none)');
  }
  if (Array.isArray(r.Media) && r.Media.length) {
    console.log('  Media count:', r.Media.length);
    const m = r.Media[0];
    console.log('  Media keys (sample):', Object.keys(m).slice(0,20).join(', '));
    console.log('  first media item (truncated):', JSON.stringify(m).slice(0,400));
  } else {
    console.log('  Media: (none)');
  }
  console.log('---');
});
