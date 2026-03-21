/**
 * scripts/generate-mapping-report.js
 * Produces all Claude mapping artifacts:
 *   - claude-mapping-report.json
 *   - claude-field-catalog.json
 *   - claude-mapping-summary.json
 *   - claude-mapped-samples.ndjson
 *
 * Run AFTER fetch-entity-ndjson.js has populated artifacts/
 * Usage: node scripts/generate-mapping-report.js
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const readline = require('readline');

const ARTIFACTS = 'artifacts';

// Load REBNY field list
const rebnyFields = fs.readFileSync('data/rebny-fields.txt', 'utf8').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const rebnySet = new Set(rebnyFields);

// Load field catalogs per entity
function loadCatalog(entity) {
  const file = `${ARTIFACTS}/fields-${entity}.json`;
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Load REBNY field locations
function loadLocations() {
  const file = `${ARTIFACTS}/rebny-field-locations.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return null;
}

(async () => {
  // --- 1. Build field catalog across all entities ---
  const entities = ['Property', 'CustomProperty', 'Media', 'Member', 'Office', 'OpenHouse', 'PropertyUnitTypes', 'PropertyRooms', 'Teams'];
  const catalogPerEntity = {};
  let totalTrestleFields = 0;

  for (const e of entities) {
    const cat = loadCatalog(e);
    if (!cat) continue;
    catalogPerEntity[e] = cat;
    totalTrestleFields += cat.totalFields;
  }

  // Write claude-field-catalog.json
  const fieldCatalog = Object.entries(catalogPerEntity).map(([entity, cat]) => ({
    entity,
    totalRecords: cat.totalRecords,
    totalFields: cat.totalFields,
    fields: cat.fields.slice(0, 200) // cap for readability
  }));
  fs.writeFileSync(`${ARTIFACTS}/claude-field-catalog.json`, JSON.stringify(fieldCatalog, null, 2));
  console.log('WROTE claude-field-catalog.json');

  // --- 2. Map REBNY fields to Trestle locations ---
  // Check Property top-level first, then CustomProperty, then Media, then CustomFields
  const propCat = catalogPerEntity.Property;
  const cpCat = catalogPerEntity.CustomProperty;
  const mediaCat = catalogPerEntity.Media;

  const propFields = propCat ? new Set(propCat.fields.map(f => f.field)) : new Set();
  const cpFields = cpCat ? new Set(cpCat.fields.map(f => f.field)) : new Set();
  const mediaFields = mediaCat ? new Set(mediaCat.fields.map(f => f.field)) : new Set();

  // Also check nested paths (CustomProperty[0].FieldName, etc.)
  const propNestedFields = propCat ? new Set(propCat.fields.filter(f => f.field.includes('.')).map(f => {
    const parts = f.field.split('.');
    return parts[parts.length - 1]; // leaf name
  })) : new Set();

  const mappings = [];
  const unmapped = [];

  for (const field of rebnyFields) {
    if (propFields.has(field)) {
      const cat = propCat.fields.find(f => f.field === field);
      mappings.push({
        rebny_field: field,
        mapped_to: { entity: 'Property', path: field },
        mapping_type: 'top-level',
        count: cat ? cat.count : 0,
        pct: cat ? cat.pct : 0,
        sample: cat ? cat.sample : null,
        note: ''
      });
    } else if (cpFields.has(field)) {
      const cat = cpCat.fields.find(f => f.field === field);
      mappings.push({
        rebny_field: field,
        mapped_to: { entity: 'CustomProperty', path: field },
        mapping_type: 'CustomProperty',
        count: cat ? cat.count : 0,
        pct: cat ? cat.pct : 0,
        sample: cat ? cat.sample : null,
        note: 'Requires $expand=CustomProperty'
      });
    } else if (propNestedFields.has(field)) {
      // Found in nested path (e.g., CustomProperty[0].FieldName)
      const fullPath = propCat.fields.find(f => f.field.endsWith('.' + field));
      mappings.push({
        rebny_field: field,
        mapped_to: { entity: 'Property', path: fullPath ? fullPath.field : 'nested.' + field },
        mapping_type: 'CustomFields',
        count: fullPath ? fullPath.count : 0,
        pct: fullPath ? fullPath.pct : 0,
        sample: fullPath ? fullPath.sample : null,
        note: 'Found in nested path — may be inside CustomProperty.CustomFields JSON'
      });
    } else if (mediaFields.has(field)) {
      const cat = mediaCat.fields.find(f => f.field === field);
      mappings.push({
        rebny_field: field,
        mapped_to: { entity: 'Media', path: field },
        mapping_type: 'Media',
        count: cat ? cat.count : 0,
        pct: cat ? cat.pct : 0,
        sample: cat ? cat.sample : null,
        note: 'Requires $expand=Media'
      });
    } else {
      // Try case-insensitive match
      const lf = field.toLowerCase();
      const ciMatch = propCat ? propCat.fields.find(f => f.field.toLowerCase() === lf) : null;
      const ciCpMatch = cpCat ? cpCat.fields.find(f => f.field.toLowerCase() === lf) : null;
      if (ciMatch) {
        mappings.push({
          rebny_field: field,
          mapped_to: { entity: 'Property', path: ciMatch.field },
          mapping_type: 'top-level',
          count: ciMatch.count,
          pct: ciMatch.pct,
          sample: ciMatch.sample,
          note: 'Case-insensitive match: REBNY=' + field + ' Trestle=' + ciMatch.field
        });
      } else if (ciCpMatch) {
        mappings.push({
          rebny_field: field,
          mapped_to: { entity: 'CustomProperty', path: ciCpMatch.field },
          mapping_type: 'CustomProperty',
          count: ciCpMatch.count,
          pct: ciCpMatch.pct,
          sample: ciCpMatch.sample,
          note: 'Case-insensitive match in CustomProperty'
        });
      } else {
        unmapped.push({ rebny_field: field, reason: 'Not found in Property, CustomProperty, or Media' });
      }
    }
  }

  const coveragePct = Math.round((mappings.length / rebnyFields.length) * 1000) / 10;

  // Warnings
  const warnings = [];
  const duplicates = mappings.filter(m => m.note.includes('Case-insensitive'));
  if (duplicates.length > 0) warnings.push(`${duplicates.length} fields matched only via case-insensitive lookup`);
  const cpMappings = mappings.filter(m => m.mapping_type === 'CustomProperty');
  if (cpMappings.length > 0) warnings.push(`${cpMappings.length} REBNY fields are in CustomProperty (requires $expand)`);
  const lowPct = mappings.filter(m => m.pct < 10 && m.count > 0);
  if (lowPct.length > 0) warnings.push(`${lowPct.length} fields have <10% population rate`);

  // --- Write claude-mapping-report.json ---
  const report = {
    timestamp: new Date().toISOString(),
    trestle_field_count: totalTrestleFields,
    rebny_field_count: rebnyFields.length,
    mapped_count: mappings.length,
    unmapped_count: unmapped.length,
    coverage_pct: coveragePct,
    fields: mappings,
    unmapped_rebny_fields: unmapped,
    warnings
  };
  fs.writeFileSync(`${ARTIFACTS}/claude-mapping-report.json`, JSON.stringify(report, null, 2));
  console.log('WROTE claude-mapping-report.json');
  console.log(`  Coverage: ${coveragePct}% (${mappings.length}/${rebnyFields.length})`);
  console.log(`  Unmapped: ${unmapped.length}`);

  // --- Write claude-mapping-summary.json ---
  const summary = {
    timestamp: new Date().toISOString(),
    total_trestle_fields: totalTrestleFields,
    total_rebny_fields: rebnyFields.length,
    matched_top_level: mappings.filter(m => m.mapping_type === 'top-level').length,
    matched_custom_property: mappings.filter(m => m.mapping_type === 'CustomProperty').length,
    matched_media: mappings.filter(m => m.mapping_type === 'Media').length,
    matched_custom_fields: mappings.filter(m => m.mapping_type === 'CustomFields').length,
    matched_other: mappings.filter(m => !['top-level', 'CustomProperty', 'Media', 'CustomFields'].includes(m.mapping_type)).length,
    unmapped: unmapped.length,
    coverage_pct: coveragePct,
    warnings
  };
  fs.writeFileSync(`${ARTIFACTS}/claude-mapping-summary.json`, JSON.stringify(summary, null, 2));
  console.log('WROTE claude-mapping-summary.json');

  // --- Write claude-mapped-samples.ndjson (5 samples) ---
  const propNdjson = `${ARTIFACTS}/trestle-Property.ndjson`;
  if (fs.existsSync(propNdjson)) {
    const lines = fs.readFileSync(propNdjson, 'utf8').trim().split('\n').slice(0, 5);
    const samples = [];
    for (const line of lines) {
      const raw = JSON.parse(line);
      const mapped = {};
      for (const m of mappings) {
        const field = m.rebny_field;
        let value = null;
        if (m.mapping_type === 'top-level') {
          value = raw[m.mapped_to.path] !== undefined ? raw[m.mapped_to.path] : null;
        } else if (m.mapping_type === 'CustomProperty') {
          const cp = Array.isArray(raw.CustomProperty) ? raw.CustomProperty[0] : raw.CustomProperty;
          if (cp) value = cp[m.mapped_to.path] !== undefined ? cp[m.mapped_to.path] : null;
        } else if (m.mapping_type === 'Media') {
          const media = Array.isArray(raw.Media) ? raw.Media[0] : null;
          if (media) value = media[m.mapped_to.path] !== undefined ? media[m.mapped_to.path] : null;
        }
        mapped[field] = {
          value,
          from: `${m.mapped_to.entity}.${m.mapped_to.path}`,
          via: m.mapping_type
        };
      }
      samples.push({ listingKey: raw.ListingKey, raw_partial: { ListingKey: raw.ListingKey, ListPrice: raw.ListPrice, StreetName: raw.StreetName, StandardStatus: raw.StandardStatus }, mapped });
    }
    const ndjson = samples.map(s => JSON.stringify(s)).join('\n') + '\n';
    fs.writeFileSync(`${ARTIFACTS}/claude-mapped-samples.ndjson`, ndjson);
    console.log('WROTE claude-mapped-samples.ndjson (' + samples.length + ' samples)');
  }

  // Final summary to console
  console.log('\n=== MAPPING SUMMARY ===');
  console.log(`Total Trestle fields: ${totalTrestleFields}`);
  console.log(`Total REBNY fields: ${rebnyFields.length}`);
  console.log(`Mapped: ${mappings.length} (${coveragePct}%)`);
  console.log(`  Top-level: ${summary.matched_top_level}`);
  console.log(`  CustomProperty: ${summary.matched_custom_property}`);
  console.log(`  Media: ${summary.matched_media}`);
  console.log(`  CustomFields: ${summary.matched_custom_fields}`);
  console.log(`Unmapped: ${unmapped.length}`);
  if (unmapped.length > 0) {
    console.log('Unmapped fields:');
    unmapped.forEach(u => console.log(`  - ${u.rebny_field}: ${u.reason}`));
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
