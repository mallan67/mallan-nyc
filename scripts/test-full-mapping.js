#!/usr/bin/env node
/**
 * scripts/test-full-mapping.js
 *
 * Fetches one record from each Trestle resource with ALL fields,
 * maps every REBNY field, and produces a complete mapping report.
 *
 * Connects to: api.cotality.com/trestle (live API)
 * Writes: artifacts/full-mapping-test.json + Desktop CSV
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const API = 'https://api.cotality.com/trestle';

async function getToken() {
  const r = await fetch(`${API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IDX_CLIENT_ID,
      client_secret: process.env.IDX_CLIENT_SECRET,
      scope: 'api'
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Token error: ' + JSON.stringify(j));
  console.log('TOKEN_OK');
  return j.access_token;
}

async function fetchResource(token, resource, filter, expand) {
  let url = `${API}/odata/${resource}?$top=5`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  if (expand) url += `&$expand=${expand}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  if (!r.ok) {
    const err = await r.text();
    console.error(`  ERROR ${resource}: ${r.status} ${err.substring(0, 200)}`);
    return [];
  }
  const j = await r.json();
  return j.value || [];
}

(async () => {
  const token = await getToken();

  // Load REBNY fields by resource
  const rebny = JSON.parse(fs.readFileSync('artifacts/rebny-fields-by-resource.json', 'utf8'));

  // Resource configs: Trestle entity name, filter, expand
  const configs = [
    { rebnyName: 'Property', entity: 'Property', filter: "StandardStatus eq 'Active'", expand: 'CustomProperty,Media' },
    { rebnyName: 'Custom Property', entity: 'CustomProperty', filter: null, expand: null },
    { rebnyName: 'Media', entity: 'Media', filter: null, expand: null },
    { rebnyName: 'Member', entity: 'Member', filter: null, expand: null },
    { rebnyName: 'Office', entity: 'Office', filter: null, expand: null },
    { rebnyName: 'Open House', entity: 'OpenHouse', filter: null, expand: null },
    { rebnyName: 'Property UnitTypes', entity: 'PropertyUnitTypes', filter: null, expand: null },
  ];

  const results = [];
  let totalFound = 0;
  let totalNotFound = 0;
  let totalRebny = 0;

  for (const cfg of configs) {
    const rebnyFields = rebny[cfg.rebnyName] || [];
    if (!rebnyFields.length) { console.log(`  Skip ${cfg.rebnyName} — no REBNY fields`); continue; }

    console.log(`\nFetching ${cfg.entity} (${rebnyFields.length} REBNY fields)...`);
    const records = await fetchResource(token, cfg.entity, cfg.filter, cfg.expand);
    console.log(`  Got ${records.length} records`);

    if (!records.length) {
      rebnyFields.forEach(f => {
        results.push({ rebnyField: f, resource: cfg.rebnyName, found: false, location: 'No records', value: null, type: null });
        totalNotFound++;
      });
      totalRebny += rebnyFields.length;
      continue;
    }

    // For Property, also extract CustomProperty and CustomFields
    let cpFields = {};  // flattened CustomProperty fields across all records
    let cfFields = {};  // flattened CustomFields JSON fields
    let mediaFields = {}; // flattened Media fields

    for (const rec of records) {
      // CustomProperty (expanded on Property)
      const cp = Array.isArray(rec.CustomProperty) ? rec.CustomProperty : rec.CustomProperty ? [rec.CustomProperty] : [];
      for (const el of cp) {
        if (!el || typeof el !== 'object') continue;
        for (const [k, v] of Object.entries(el)) {
          if (k.startsWith('@')) continue;
          if (!cpFields[k] && v !== null && v !== undefined && v !== '') cpFields[k] = v;
          // Parse CustomFields JSON
          if (k === 'CustomFields' && typeof v === 'string') {
            try {
              const cf = JSON.parse(v);
              if (cf && typeof cf === 'object') {
                for (const [ck, cv] of Object.entries(cf)) {
                  if (!cfFields[ck] && cv !== null && cv !== undefined && cv !== '') cfFields[ck] = cv;
                }
              }
            } catch (e) {}
          }
        }
      }
      // Media (expanded on Property)
      const media = Array.isArray(rec.Media) ? rec.Media : [];
      for (const m of media.slice(0, 1)) {
        for (const [k, v] of Object.entries(m)) {
          if (k.startsWith('@')) continue;
          if (!mediaFields[k] && v !== null && v !== undefined && v !== '') mediaFields[k] = v;
        }
      }
    }

    // Check each REBNY field
    let found = 0;
    let notFound = 0;

    for (const field of rebnyFields) {
      let location = null;
      let value = null;
      let dataType = null;

      // 1. Check top-level in first record with data
      for (const rec of records) {
        if (rec[field] !== null && rec[field] !== undefined && rec[field] !== '') {
          location = cfg.entity + ' (top-level)';
          value = rec[field];
          dataType = typeof value;
          if (typeof value === 'object') value = JSON.stringify(value).substring(0, 150);
          else value = String(value).substring(0, 150);
          break;
        }
      }

      // 2. If Property and not found top-level, check CustomProperty
      if (!location && cfg.rebnyName === 'Property' && cpFields[field] !== undefined) {
        location = 'CustomProperty (bag key)';
        value = String(cpFields[field]).substring(0, 150);
        dataType = typeof cpFields[field];
      }

      // 3. Check CustomFields JSON
      if (!location && cfg.rebnyName === 'Property' && cfFields[field] !== undefined) {
        location = 'CustomProperty.CustomFields (JSON)';
        value = String(cfFields[field]).substring(0, 150);
        dataType = typeof cfFields[field];
      }

      // 4. Check Media
      if (!location && cfg.rebnyName === 'Property' && mediaFields[field] !== undefined) {
        location = 'Media (expanded)';
        value = String(mediaFields[field]).substring(0, 150);
        dataType = typeof mediaFields[field];
      }

      // 5. For non-Property resources, check if field exists but is null in all records
      if (!location) {
        for (const rec of records) {
          if (field in rec) {
            location = cfg.entity + ' (exists, all null in sample)';
            value = null;
            dataType = 'null';
            break;
          }
        }
      }

      if (location) {
        found++;
        totalFound++;
      } else {
        notFound++;
        totalNotFound++;
      }

      results.push({
        rebnyField: field,
        resource: cfg.rebnyName,
        found: !!location,
        location: location || 'NOT FOUND',
        value: value,
        type: dataType
      });

      totalRebny++;
    }

    console.log(`  Found: ${found}/${rebnyFields.length} (${Math.round(found/rebnyFields.length*100)}%)`);
  }

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    source: 'api.cotality.com/trestle (live)',
    totalRebnyFields: totalRebny,
    totalFound: totalFound,
    totalNotFound: totalNotFound,
    coveragePct: Math.round(totalFound / totalRebny * 1000) / 10,
    results
  };
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/full-mapping-test.json', JSON.stringify(report, null, 2));

  // Save CSV to Desktop
  let csv = '\ufeffREBNY Field,Resource,Found,Location,Data Type,Sample Value\n';
  results.forEach(r => {
    const val = (r.value || '').replace(/"/g, '""').substring(0, 200);
    csv += `"${r.rebnyField}","${r.resource}",${r.found ? 'YES' : 'NO'},"${r.location}","${r.type || ''}","${val}"\n`;
  });
  fs.writeFileSync('C:/Users/MayaAllan/Desktop/REBNY-Full-Mapping-Test.csv', csv);

  // Summary
  console.log('\n========================================');
  console.log('FULL MAPPING TEST RESULTS');
  console.log('========================================');
  console.log(`Total REBNY fields: ${totalRebny}`);
  console.log(`Found in Trestle:   ${totalFound}`);
  console.log(`NOT found:          ${totalNotFound}`);
  console.log(`Coverage:           ${report.coveragePct}%`);
  console.log('');

  // Breakdown by resource
  const byRes = {};
  results.forEach(r => {
    if (!byRes[r.resource]) byRes[r.resource] = { found: 0, notFound: 0, total: 0 };
    byRes[r.resource].total++;
    if (r.found) byRes[r.resource].found++;
    else byRes[r.resource].notFound++;
  });
  Object.entries(byRes).forEach(([res, counts]) => {
    console.log(`  ${res}: ${counts.found}/${counts.total} (${Math.round(counts.found/counts.total*100)}%)`);
  });

  // List not-found
  const notFoundList = results.filter(r => !r.found);
  if (notFoundList.length > 0) {
    console.log(`\nNOT FOUND (${notFoundList.length}):`);
    notFoundList.forEach(r => console.log(`  - ${r.rebnyField} (${r.resource})`));
  }

  console.log('\nSaved: artifacts/full-mapping-test.json');
  console.log('Saved: Desktop/REBNY-Full-Mapping-Test.csv');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
