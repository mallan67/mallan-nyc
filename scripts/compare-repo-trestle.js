/**
 * scripts/compare-repo-trestle.js
 * Usage: node scripts/compare-repo-trestle.js artifacts/trestle-fields.json > artifacts/compare-report.json
 */
const fs = require('fs');
const path = require('path');

// load repo canonical list
const mapper = require('../lib/idx/trestle-mapper');
const repo = mapper.IDX_PLUS_SELECT_FIELDS || [];

// read trestle metadata (first arg) or default path
const trestleFile = process.argv[2] || path.join('artifacts','trestle-fields.json');
if (!fs.existsSync(trestleFile)) {
  console.error('Trestle metadata not found:', trestleFile);
  process.exit(2);
}
const trestleRaw = JSON.parse(fs.readFileSync(trestleFile,'utf8'));

// helper to pull Property entity fields from various metadata shapes
function extractPropertyFields(obj) {
  if (!obj) return [];
  // case 1: obj.Property is array of fields
  if (Array.isArray(obj.Property)) return obj.Property;
  // case 2: obj is map of entity->props where props is array
  if (obj.Property && Array.isArray(obj.Property)) return obj.Property;
  // case 3: some dumps are { "Schema": [ ... ] } -> find EntityType named Property
  // fallback: search for key "Property" or entity names containing "Property"
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === 'property' && Array.isArray(obj[k])) return obj[k];
  }
  // If the file appears to be a metadata map of EntityType -> [props]
  // return obj['Property'] if present, else try to find the first "Property"-like key
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase().includes('property') && Array.isArray(obj[k])) return obj[k];
  }
  // If obj is a map of entity -> object, try to extract Property from inner objects
  // Collect prop names if inner arrays exist
  for (const k of Object.keys(obj)) {
    if (Array.isArray(obj[k]) && obj[k].every(x => typeof x === 'string')) {
      // likely list already; return first match
      return obj[k];
    }
  }
  // last resort: if metadata parsed EDmx -> Schema -> EntityType
  try {
    const edmx = obj['edmx:Edmx'] && obj['edmx:Edmx']['edmx:DataServices'];
    if (edmx) {
      const schemas = Array.isArray(edmx.Schema) ? edmx.Schema : [edmx.Schema];
      for (const s of schemas) {
        const ets = s.EntityType ? (Array.isArray(s.EntityType) ? s.EntityType : [s.EntityType]) : [];
        for (const et of ets) {
          if (et['@_Name'] === 'Property' && et.Property) {
            const props = Array.isArray(et.Property) ? et.Property.map(p => p['@_Name']) : [et.Property['@_Name']];
            return props;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  // give up
  return [];
}

const live = extractPropertyFields(trestleRaw) || [];
const repoSet = new Set(repo);
const liveSet = new Set(live);

const repoOnly = repo.filter(f => !liveSet.has(f));
const liveOnly = live.filter(f => !repoSet.has(f));
const common = repo.filter(f => liveSet.has(f));

function head(arr, n=20){ return arr.slice(0,n); }

const report = {
  timestamp: new Date().toISOString(),
  counts: { repo: repo.length, trestle: live.length, repoOnly: repoOnly.length, liveOnly: liveOnly.length, common: common.length },
  repoOnlySample: head(repoOnly,20),
  liveOnlySample: head(liveOnly,20),
  commonSample: head(common,20)
};

console.log(JSON.stringify(report, null, 2));
