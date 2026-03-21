/**
 * scripts/extract-field-catalog.js
 * Reads an NDJSON file and extracts unique field names with counts of non-null values.
 * Usage: node scripts/extract-field-catalog.js artifacts/trestle-Property.ndjson
 * Output: JSON to stdout
 */
const fs = require('fs');
const readline = require('readline');

const file = process.argv[2];
if (!file) { console.error('Usage: node extract-field-catalog.js <ndjson-file>'); process.exit(2); }

const fieldCounts = {};    // field -> count of records where non-null
const fieldSamples = {};   // field -> first non-null sample value
let totalRecords = 0;

const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

rl.on('line', line => {
  if (!line.trim()) return;
  let rec;
  try { rec = JSON.parse(line); } catch { return; }
  totalRecords++;

  function extract(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@')) continue;
      const key = prefix ? `${prefix}.${k}` : k;
      if (!fieldCounts[key]) fieldCounts[key] = 0;
      if (v !== null && v !== undefined && v !== '') {
        fieldCounts[key]++;
        if (!fieldSamples[key]) {
          fieldSamples[key] = typeof v === 'object' ? JSON.stringify(v).substring(0, 120) : String(v).substring(0, 120);
        }
      }
      // Recurse into nested objects (but not arrays of objects like Media/CustomProperty)
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        extract(v, key);
      }
      // For arrays (Media, CustomProperty), extract keys from first element
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        extract(v[0], key + '[0]');
      }
    }
  }

  extract(rec, '');
});

rl.on('close', () => {
  const fields = Object.keys(fieldCounts).sort().map(f => ({
    field: f,
    count: fieldCounts[f],
    pct: totalRecords > 0 ? Math.round((fieldCounts[f] / totalRecords) * 100) : 0,
    sample: fieldSamples[f] || null
  }));
  const out = { totalRecords, totalFields: fields.length, fields };
  console.log(JSON.stringify(out, null, 2));
});
