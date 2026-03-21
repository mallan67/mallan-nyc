/**
 * scripts/find-repo-only-in-customproperty.js
 * Usage: node scripts/find-repo-only-in-customproperty.js
 * Requires: artifacts/custom-media-raw.json (or artifacts/properties.ndjson)
 */
const fs = require('fs');

const compare = JSON.parse(fs.readFileSync('artifacts/compare-report.json','utf8'));
const repoOnly = (compare.repo_NOT_in_trestle && compare.repo_NOT_in_trestle.fields) || [];

const file1 = 'artifacts/custom-media-raw.json';
const file2 = 'artifacts/properties.ndjson';

const found = {};
repoOnly.forEach(f => found[f] = []);

function inspectRecord(r) {
  const id = r.ListingId || r.ListingKey || r.ListingKeyNumeric || '(no id)';
  if (Array.isArray(r.CustomProperty)) {
    r.CustomProperty.forEach(cp => {
      const keys = Object.keys(cp||{}).map(k => k.toLowerCase());
      repoOnly.forEach(f => {
        const fn = f.toLowerCase();
        // if any key matches substring of the repo field or exact equals
        if (keys.some(k => k.includes(fn) || k === fn)) {
          if (found[f].length < 5) found[f].push({ listing: id, sample: cp });
        } else {
          // also check cp values if name stored in a separate field
          for (const k of Object.keys(cp||{})) {
            const v = (cp[k] || '').toString().toLowerCase();
            if (v.includes(fn)) {
              if (found[f].length < 5) found[f].push({ listing: id, sample: cp });
              break;
            }
          }
        }
      });
    });
  }
}

// scan custom-media-raw.json if present
if (fs.existsSync(file1)) {
  const j = JSON.parse(fs.readFileSync(file1,'utf8'));
  const rows = j.value || j;
  rows.forEach(inspectRecord);
} 

// scan properties.ndjson (if present) - streaming
if (fs.existsSync(file2)) {
  const rl = require('readline').createInterface({
    input: fs.createReadStream(file2),
    crlfDelay: Infinity
  });
  (async ()=> {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        inspectRecord(r);
      } catch(e){}
    }
    // output results
    console.log(JSON.stringify(Object.fromEntries(Object.entries(found).map(([k,v]) => [k, v.length])), null, 2));
    // print small samples for matched fields
    for (const [k,v] of Object.entries(found)) {
      if (v.length) {
        console.log('\\n=== SAMPLE for', k, '===\\n', JSON.stringify(v.slice(0,3), null, 2));
      }
    }
  })();
} else {
  // output results directly from custom-media
  console.log(JSON.stringify(Object.fromEntries(Object.entries(found).map(([k,v]) => [k, v.length])), null, 2));
  for (const [k,v] of Object.entries(found)) {
    if (v.length) {
      console.log('\\n=== SAMPLE for', k, '===\\n', JSON.stringify(v.slice(0,3), null, 2));
    }
  }
}
