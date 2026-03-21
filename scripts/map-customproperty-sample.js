/**
 * scripts/map-customproperty-sample.js
 * - Reads artifacts/custom-media-raw.json
 * - Reads artifacts/compare-report.json to get repo_NOT_in_trestle fields
 * - Normalizes CustomProperty shapes (both name/value pair entries and mapping objects)
 * - Maps repo_NOT_in_trestle fields when present in CustomProperty
 * - Maps Media -> photos[]
 * - Writes:
 *    artifacts/mapped-sample.json  (array of mapped listings)
 *    artifacts/mapping-summary.json (counts for repo fields found + samples)
 */
const fs = require('fs');
function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function firstN(arr,n){ return arr.slice(0,n); }

if(!fs.existsSync('artifacts/custom-media-raw.json')) {
  console.error('MISSING_SAMPLE: artifacts/custom-media-raw.json');
  process.exit(2);
}
if(!fs.existsSync('artifacts/compare-report.json')) {
  console.error('MISSING_COMPARE: artifacts/compare-report.json');
  process.exit(3);
}

const raw = JSON.parse(fs.readFileSync('artifacts/custom-media-raw.json','utf8'));
const compare = JSON.parse(fs.readFileSync('artifacts/compare-report.json','utf8'));
const repoFields = (compare.repo_NOT_in_trestle && compare.repo_NOT_in_trestle.fields) || [];

const repoNormMap = {};
repoFields.forEach(f => repoNormMap[norm(f)] = f);

function mapCustomPropertiesEntry(cpEntry, mapped, repoFound) {
  // cpEntry may be either: { Name: 'X', Value: 'Y' } OR an object with many keys { InternetEntireListingDisplayYN: true, ... }
  if (!cpEntry || typeof cpEntry !== 'object') return;
  // detect name/value pair
  const possibleName = cpEntry.Name || cpEntry.NameText || cpEntry.PropertyName || cpEntry.PropertyKey || cpEntry.Key || cpEntry.Field;
  const possibleVal = cpEntry.Value ?? cpEntry.ValueText ?? cpEntry.PropertyValue ?? cpEntry.Text ?? cpEntry.ValueString;
  if (possibleName !== undefined && possibleVal !== undefined) {
    const k = String(possibleName).trim();
    const rn = norm(k);
    if (repoNormMap[rn]) {
      mapped[repoNormMap[rn]] = possibleVal;
      repoFound[rn] = repoFound[rn] || {count:0, samples:[]};
      repoFound[rn].count++;
      if (repoFound[rn].samples.length < 3) repoFound[rn].samples.push({listing: mapped.ListingId || mapped.ListingKey || '(no id)', key:k, value: possibleVal});
    } else {
      mapped.CustomPropertyMap = mapped.CustomPropertyMap || {};
      mapped.CustomPropertyMap[k] = possibleVal;
    }
    return;
  }
  // otherwise treat cpEntry as a bag-of-keys mapping
  Object.keys(cpEntry).forEach(k => {
    const v = cpEntry[k];
    // skip internal metadata fields or timestamps if you want; keep everything for audit here
    const rn = norm(k);
    if (repoNormMap[rn]) {
      mapped[repoNormMap[rn]] = v;
      repoFound[rn] = repoFound[rn] || {count:0, samples:[]};
      repoFound[rn].count++;
      if (repoFound[rn].samples.length < 3) repoFound[rn].samples.push({listing: mapped.ListingId || mapped.ListingKey || '(no id)', key:k, value: v});
    } else {
      mapped.CustomPropertyMap = mapped.CustomPropertyMap || {};
      // keep original key name
      if (mapped.CustomPropertyMap[k] === undefined) mapped.CustomPropertyMap[k] = v;
      else if (Array.isArray(mapped.CustomPropertyMap[k])) mapped.CustomPropertyMap[k].push(v);
      else mapped.CustomPropertyMap[k] = [mapped.CustomPropertyMap[k], v];
    }
  });
}

function mapMedia(raw, mapped) {
  if (!raw || !Array.isArray(raw.Media)) return;
  mapped.photos = raw.Media.map(m => ({
    url: m.MediaURL || m.Uri || m.Url || null,
    type: m.MediaType || m.MediaCategory || null,
    order: (m.Order ?? m.Sequence ?? null),
    caption: m.ShortDescription || m.Caption || null,
    source: m.OriginatingSystemName || m.SourceSystemID || null,
    id: m.ResourceRecordKey || m.ResourceRecordID || null,
    status: m.MediaStatus || null,
    permission: m.ListingPermission || m.ListingPermission || null
  })).filter(p => p.url);
  mapped.photos.sort((a,b) => (a.order ?? 9999) - (b.order ?? 9999));
}

const rows = raw.value || raw;
const mappedRows = [];
const repoFound = {}; // key: normalized repo field -> {count, samples}
rows.forEach(r => {
  const mapped = {};
  // copy obvious top-level fields
  ['ListingId','ListingKey','ListingKeyNumeric','ListPrice','StreetName','City','StandardStatus','ListOfficeMlsId','PhotosCount'].forEach(k=>{
    if (r[k] !== undefined) mapped[k] = r[k];
  });
  // Map each CustomProperty entry (handle both shapes)
  if (Array.isArray(r.CustomProperty)) {
    r.CustomProperty.forEach(cpEntry => mapCustomPropertiesEntry(cpEntry, mapped, repoFound));
  }
  // Also handle r.CustomFields (a JSON string in many CustomProperty examples) and parse it
  if (r.CustomFields && typeof r.CustomFields === 'string') {
    try {
      const cf = JSON.parse(r.CustomFields);
      Object.keys(cf).forEach(k=>{
        const rn = norm(k);
        if (repoNormMap[rn]) {
          mapped[repoNormMap[rn]] = cf[k];
          repoFound[rn] = repoFound[rn] || {count:0, samples:[]};
          repoFound[rn].count++;
          if (repoFound[rn].samples.length<3) repoFound[rn].samples.push({listing: mapped.ListingId||mapped.ListingKey||'(no id)', key:k, value:cf[k]});
        } else {
          mapped.CustomPropertyMap = mapped.CustomPropertyMap || {};
          mapped.CustomPropertyMap[k] = cf[k];
        }
      });
    } catch(e){}
  }
  // Map Media -> photos
  mapMedia(r, mapped);
  mappedRows.push(mapped);
});
// build summary counts and missing list
const summary = {
  scanned_rows: rows.length,
  repo_total: repoFields.length,
  hits: {},
  missing: []
};
repoFields.forEach(f => {
  const rn = norm(f);
  if (repoFound[rn] && repoFound[rn].count) summary.hits[f] = {count: repoFound[rn].count, samples: repoFound[rn].samples};
  else summary.missing.push(f);
});

fs.writeFileSync('artifacts/mapped-sample.json', JSON.stringify(mappedRows, null, 2), 'utf8');
fs.writeFileSync('artifacts/mapping-summary.json', JSON.stringify(summary, null, 2), 'utf8');
console.log('WROTE: artifacts/mapped-sample.json (', mappedRows.length, 'items )');
console.log('WROTE: artifacts/mapping-summary.json');
