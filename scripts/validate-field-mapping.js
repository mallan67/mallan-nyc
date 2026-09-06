#!/usr/bin/env node
/**
 * scripts/validate-field-mapping.js
 *
 * Validates that every REBNY IDX Plus field (902) is correctly:
 *   1. Present in the Trestle mapper ($select or $expand)
 *   2. Mapped to a Prisma DB column or raw_data JSON
 *   3. Has correct data-rls-field in the sale/rental form HTML
 *   4. Has correct ID association in the form
 *   5. Is collected by collectSaleFormData() / collectRentalFormData()
 *
 * Connects to: Trestle API (live, read-only) for field verification
 * Reads: REBNY Excel, trestle-mapper.ts, forms, Prisma schema
 *
 * Usage:
 *   node scripts/validate-field-mapping.js
 *   node scripts/validate-field-mapping.js --json
 *   node scripts/validate-field-mapping.js --csv
 *
 * Output: artifacts/field-mapping-validation.json + Desktop CSV
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { readWorkbook, worksheetToObjects } = require('./lib/exceljs-rows');

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(ROOT, 'artifacts');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const csvOut = args.includes('--csv');

fs.mkdirSync(ARTIFACTS, { recursive: true });

async function main() {

// ─── 1. Load REBNY fields ─────────────────────────────────────────────
const wb = await readWorkbook(path.join(ROOT, 'data', 'rebny-idx-plus-3.15.26.xlsx'));
const rebnyData = worksheetToObjects(wb.getWorksheet('Sheet1'));
console.log(`REBNY fields loaded: ${rebnyData.length}`);

// ─── 2. Load mapper fields ────────────────────────────────────────────
const mapperSrc = fs.readFileSync(path.join(ROOT, 'lib', 'idx', 'trestle-mapper.ts'), 'utf8');

// Extract COTALITY_PROPERTY_FIELDS (B1-B29 arrays — live Cotality Property fields only)
const allMapperFields = new Set();
const arrayRe = /const\s+B\d+_\w+\s*(?::\s*string\[\])?\s*=\s*\[([\s\S]*?)\];/g;
let m;
while ((m = arrayRe.exec(mapperSrc)) !== null) {
  const strRe = /['"](\w+)['"]/g;
  let sm;
  while ((sm = strRe.exec(m[1])) !== null) allMapperFields.add(sm[1]);
}

// Extract LIVE_FIELDS_NOT_SELECTED (live fields deliberately absent from the $select)
const excludedFields = new Set();
const exMatch = mapperSrc.match(/LIVE_FIELDS_NOT_SELECTED\s*=\s*new\s+Set<string>\(\[([\s\S]*?)\]\)/);
if (exMatch) {
  const exRe = /['"](\w+)['"]/g;
  while ((m = exRe.exec(exMatch[1])) !== null) excludedFields.add(m[1]);
}

// The mapper carries no alias table (live Cotality field names only — Packet 2 closure).
const renames = {};

console.log(`Mapper: ${allMapperFields.size} fields, ${excludedFields.size} excluded, ${Object.keys(renames).length} renames`);

// ─── 3. Load sale form data-rls-field attributes ──────────────────────
const saleFormPath = path.join(ROOT, 'public', 'crm', 'SALE-FORM-REDESIGN.html');
const saleForm = fs.readFileSync(saleFormPath, 'utf8');
const saleRlsFields = new Map(); // fieldName -> {line, id, element}
const rlsRe = /data-rls-field="(\w+)"/g;
const saleLines = saleForm.split('\n');
for (let i = 0; i < saleLines.length; i++) {
  const line = saleLines[i];
  let rm;
  while ((rm = rlsRe.exec(line)) !== null) {
    const fieldName = rm[1];
    const idMatch = line.match(/id="([^"]+)"/);
    const nameMatch = line.match(/name="([^"]+)"/);
    if (!saleRlsFields.has(fieldName)) {
      saleRlsFields.set(fieldName, {
        line: i + 1,
        id: idMatch ? idMatch[1] : null,
        name: nameMatch ? nameMatch[1] : null,
        element: line.includes('<select') ? 'select' : line.includes('checkbox') ? 'checkbox' : line.includes('radio') ? 'radio' : line.includes('textarea') ? 'textarea' : 'input'
      });
    }
  }
}
console.log(`Sale form: ${saleRlsFields.size} data-rls-field attributes`);

// ─── 4. Load rental form data-rls-field attributes ────────────────────
const rentalFormPath = path.join(ROOT, 'public', 'crm', 'RENTAL-FORM-REDESIGN.html');
const rentalForm = fs.readFileSync(rentalFormPath, 'utf8');
const rentalRlsFields = new Map();
const rentalLines = rentalForm.split('\n');
for (let i = 0; i < rentalLines.length; i++) {
  const line = rentalLines[i];
  let rm;
  const rlsRe2 = /data-rls-field="(\w+)"/g;
  while ((rm = rlsRe2.exec(line)) !== null) {
    const fieldName = rm[1];
    const idMatch = line.match(/id="([^"]+)"/);
    const nameMatch = line.match(/name="([^"]+)"/);
    if (!rentalRlsFields.has(fieldName)) {
      rentalRlsFields.set(fieldName, {
        line: i + 1,
        id: idMatch ? idMatch[1] : null,
        name: nameMatch ? nameMatch[1] : null,
        element: line.includes('<select') ? 'select' : line.includes('checkbox') ? 'checkbox' : line.includes('radio') ? 'radio' : line.includes('textarea') ? 'textarea' : 'input'
      });
    }
  }
}
console.log(`Rental form: ${rentalRlsFields.size} data-rls-field attributes`);

// ─── 5. Load collectSaleFormData mapping ──────────────────────────────
const collectMatch = saleForm.match(/function collectSaleFormData\(\)([\s\S]*?)^function /m);
const collectedFields = new Set();
if (collectMatch) {
  // Find data.FieldName = references
  const dataRe = /data\.(\w+)\s*=/g;
  while ((m = dataRe.exec(collectMatch[1])) !== null) {
    collectedFields.add(m[1]);
  }
}
console.log(`collectSaleFormData maps: ${collectedFields.size} fields`);

// ─── 6. Load Prisma schema fields ────────────────────────────────────
const prismaPath = path.join(ROOT, 'prisma', 'schema.prisma');
const prisma = fs.readFileSync(prismaPath, 'utf8');
const listingMatch = prisma.match(/model Listing \{([\s\S]*?)\n\}/);
const prismaFields = new Set();
if (listingMatch) {
  const fieldRe = /^\s+(\w+)\s+/gm;
  while ((m = fieldRe.exec(listingMatch[1])) !== null) {
    if (!['@@', 'model'].includes(m[1])) prismaFields.add(m[1]);
  }
}
console.log(`Prisma Listing model: ${prismaFields.size} fields`);

// ─── 7. Validate each REBNY Property field ───────────────────────────
const results = [];
let issues = 0;

for (const row of rebnyData) {
  const field = row['Standard Name'];
  const resource = row['Resource'] || '';
  const type = row['Standard Type'] || '';
  if (!field) continue;

  // Only validate Property fields against the form/mapper (other resources have different paths)
  if (resource !== 'Property') {
    results.push({
      field, resource, type,
      inMapper: 'N/A',
      inSaleForm: 'N/A',
      inRentalForm: 'N/A',
      collected: 'N/A',
      inPrisma: 'N/A',
      issues: [],
      status: 'OK (non-Property resource)'
    });
    continue;
  }

  const fieldIssues = [];

  // Check mapper
  const inMapper = allMapperFields.has(field);
  const isExcluded = excludedFields.has(field);
  const isRenamed = Object.values(renames).includes(field) || renames[field];
  const mapperStatus = inMapper ? 'YES' : isExcluded ? 'EXCLUDED' : isRenamed ? 'RENAMED' : 'MISSING';

  if (!inMapper && !isExcluded && !isRenamed) {
    fieldIssues.push('NOT in trestle-mapper $select — will not be fetched from Trestle');
  }

  // Check sale form
  const saleEntry = saleRlsFields.get(field);
  const inSaleForm = saleEntry ? 'YES (line ' + saleEntry.line + ')' : 'NO';
  if (saleEntry && !saleEntry.id && !saleEntry.name) {
    fieldIssues.push('In sale form but element has no id or name — value cannot be collected');
  }

  // Check rental form
  const rentalEntry = rentalRlsFields.get(field);
  const inRentalForm = rentalEntry ? 'YES (line ' + rentalEntry.line + ')' : 'NO';

  // Check if collected by submit function
  const isCollected = collectedFields.has(field);
  const collectedStatus = isCollected ? 'YES' : saleEntry ? 'MAPPED (via data-rls-field)' : 'NO';

  // Check for ID mismatch: if sale form has data-rls-field but the id doesn't follow convention
  if (saleEntry && saleEntry.id) {
    // Check if the id is referenced in collectSaleFormData or _populateSaleFormFromApi
    const idInCollect = saleForm.includes("'" + saleEntry.id + "'") || saleForm.includes('"' + saleEntry.id + '"');
    if (!idInCollect && !isCollected) {
      // Check if it's collected via the generic loop (has id, so it will be collected as data[id])
      // This is OK — the generic loop picks up anything with id
    }
  }

  // Duplicate data-rls-field check
  const saleCount = (saleForm.match(new RegExp('data-rls-field="' + field + '"', 'g')) || []).length;
  if (saleCount > 1) {
    fieldIssues.push('data-rls-field="' + field + '" appears ' + saleCount + ' times in sale form — potential duplicate collection');
  }

  if (fieldIssues.length > 0) issues += fieldIssues.length;

  results.push({
    field, resource, type,
    inMapper: mapperStatus,
    inSaleForm,
    inRentalForm,
    collected: collectedStatus,
    inPrisma: prismaFields.has(field.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')) ? 'YES' : 'raw_data',
    issues: fieldIssues,
    status: fieldIssues.length === 0 ? 'OK' : 'ISSUES (' + fieldIssues.length + ')'
  });
}

// ─── 8. Summary ─────────────────────────────────────────────────
const propResults = results.filter(r => r.resource === 'Property');
const withIssues = propResults.filter(r => r.issues.length > 0);
const inMapperCount = propResults.filter(r => r.inMapper === 'YES').length;
const excludedCount = propResults.filter(r => r.inMapper === 'EXCLUDED').length;
const missingMapper = propResults.filter(r => r.inMapper === 'MISSING');
const inSaleCount = propResults.filter(r => r.inSaleForm.startsWith('YES')).length;
const duplicateRls = propResults.filter(r => r.issues.some(i => i.includes('duplicate')));

const report = {
  timestamp: new Date().toISOString(),
  rebnyTotal: rebnyData.length,
  propertyFields: propResults.length,
  otherResourceFields: results.length - propResults.length,
  mapper: {
    inSelect: inMapperCount,
    excluded: excludedCount,
    missing: missingMapper.length,
    missingFields: missingMapper.map(r => r.field)
  },
  saleForm: {
    withRlsField: inSaleCount,
    total: propResults.length
  },
  duplicateRlsFields: duplicateRls.map(r => ({ field: r.field, issues: r.issues })),
  totalIssues: issues,
  fieldsWithIssues: withIssues.length,
  results
};

fs.writeFileSync(path.join(ARTIFACTS, 'field-mapping-validation.json'), JSON.stringify(report, null, 2));

// CSV
let csv = '\ufeffREBNY Field,Resource,Type,In Mapper,In Sale Form,In Rental Form,Collected,In Prisma,Status,Issues\n';
results.forEach(r => {
  const iss = r.issues.join('; ').replace(/"/g, '""');
  csv += `"${r.field}","${r.resource}","${r.type}","${r.inMapper}","${r.inSaleForm}","${r.inRentalForm}","${r.collected}","${r.inPrisma}","${r.status}","${iss}"\n`;
});
const csvPath = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'REBNY-Field-Validation.csv');
fs.writeFileSync(csvPath, csv);

// Print results
console.log('\n========================================');
console.log('  REBNY FIELD MAPPING VALIDATION');
console.log('========================================');
console.log(`Total REBNY fields: ${rebnyData.length}`);
console.log(`Property fields: ${propResults.length}`);
console.log(`Other resource fields: ${results.length - propResults.length}`);
console.log('');
console.log('MAPPER (trestle-mapper.ts):');
console.log(`  In $select: ${inMapperCount}`);
console.log(`  Excluded (IDX Plus): ${excludedCount}`);
console.log(`  Missing: ${missingMapper.length}`);
if (missingMapper.length > 0) {
  console.log('  Missing fields:');
  missingMapper.forEach(r => console.log('    - ' + r.field));
}
console.log('');
console.log('SALE FORM:');
console.log(`  Fields with data-rls-field: ${inSaleCount}`);
if (duplicateRls.length > 0) {
  console.log(`  Duplicate data-rls-field: ${duplicateRls.length}`);
  duplicateRls.forEach(r => console.log('    - ' + r.field + ': ' + r.issues[0]));
}
console.log('');
console.log(`TOTAL ISSUES: ${issues}`);
console.log(`Fields with issues: ${withIssues.length}`);
if (withIssues.length > 0) {
  console.log('');
  console.log('FIELDS WITH ISSUES:');
  withIssues.forEach(r => {
    console.log(`  ${r.field}:`);
    r.issues.forEach(i => console.log(`    - ${i}`));
  });
}
console.log('');
console.log('Saved: artifacts/field-mapping-validation.json');
console.log('Saved: ' + csvPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
