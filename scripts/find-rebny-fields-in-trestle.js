/**
 * scripts/find-rebny-fields-in-trestle.js
 * Locates REBNY fields inside Trestle NDJSON files (Property, CustomProperty, etc.)
 * Usage: node scripts/find-rebny-fields-in-trestle.js data/rebny-fields.txt artifacts/trestle-*.ndjson
 * Output: JSON to stdout
 */
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
if (args.length < 2) { console.error('Usage: node find-rebny-fields-in-trestle.js <rebny-fields.txt> <ndjson files...>'); process.exit(2); }

const rebnyFile = args[0];
const ndjsonFiles = args.slice(1);

const rebnyFields = fs.readFileSync(rebnyFile, 'utf8').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const rebnySet = new Set(rebnyFields);

// Track where each REBNY field is found
const found = {};      // field -> { resource, location, sampleValue, count }
const notFound = [];

function normalize(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function scanFile(file) {
  const entity = file.match(/trestle-(\w+)\./)?.[1] || 'unknown';
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    // Check top-level fields
    for (const k of Object.keys(rec)) {
      if (rebnySet.has(k) && !found[k]) {
        found[k] = { resource: entity, location: 'top-level', sampleValue: rec[k] !== null ? String(rec[k]).substring(0, 100) : null, count: 1 };
      } else if (found[k] && rebnySet.has(k) && rec[k] !== null) {
        found[k].count++;
      }
    }

    // Check CustomProperty (array of objects or single object)
    const cp = Array.isArray(rec.CustomProperty) ? rec.CustomProperty : rec.CustomProperty ? [rec.CustomProperty] : [];
    for (const cpObj of cp) {
      if (!cpObj || typeof cpObj !== 'object') continue;
      for (const k of Object.keys(cpObj)) {
        if (rebnySet.has(k) && !found[k]) {
          found[k] = { resource: entity, location: 'CustomProperty', sampleValue: cpObj[k] !== null ? String(cpObj[k]).substring(0, 100) : null, count: 1 };
        } else if (found[k] && rebnySet.has(k) && cpObj[k] !== null) {
          found[k].count++;
        }
      }
      // Also check CustomFields JSON string inside CustomProperty
      if (cpObj.CustomFields && typeof cpObj.CustomFields === 'string') {
        try {
          const cf = JSON.parse(cpObj.CustomFields);
          for (const k of Object.keys(cf)) {
            if (rebnySet.has(k) && !found[k]) {
              found[k] = { resource: entity, location: 'CustomProperty.CustomFields', sampleValue: cf[k] !== null ? String(cf[k]).substring(0, 100) : null, count: 1 };
            }
          }
        } catch {}
      }
    }

    // Check Media (array)
    const media = Array.isArray(rec.Media) ? rec.Media : [];
    for (const m of media.slice(0, 1)) {
      for (const k of Object.keys(m)) {
        if (rebnySet.has(k) && !found[k]) {
          found[k] = { resource: entity, location: 'Media', sampleValue: m[k] !== null ? String(m[k]).substring(0, 100) : null, count: 1 };
        }
      }
    }
  }
}

(async () => {
  for (const file of ndjsonFiles) {
    if (!fs.existsSync(file)) { console.error('  skip missing: ' + file); continue; }
    await scanFile(file);
  }

  // Determine not-found
  for (const f of rebnyFields) {
    if (!found[f]) notFound.push(f);
  }

  const report = {
    rebnyTotal: rebnyFields.length,
    foundCount: Object.keys(found).length,
    notFoundCount: notFound.length,
    found: Object.entries(found).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ field: k, ...v })),
    notFound: notFound.sort()
  };

  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
