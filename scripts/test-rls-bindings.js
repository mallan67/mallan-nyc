#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION TESTS — RLS Binding Resolution
// Tests the 4-layer resolution pipeline, alias lookup, internal-only
// classification, viewer detection, and JSON config loading.
//
// Usage: node scripts/test-rls-bindings.js
// Exit:  0 = all pass, 1 = failures
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parse: parseHTML } = require('node-html-parser');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_MODULAR = path.resolve(REPO_ROOT, 'public', 'crm');

// ── Load External Config ─────────────────────────────────────────────────

const FIELD_ALIASES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-field-aliases.json'), 'utf8'));
const INTERNAL_ONLY_LIST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-internal-only.json'), 'utf8'));
const INTERNAL_ONLY_FIELDS = new Set(INTERNAL_ONLY_LIST);
const CRM_OVERLAY_VALUES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-crm-overlays.json'), 'utf8'));
const BINDINGS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-form-bindings.json'), 'utf8'));

// ── CSV / RLS Field Loading ──────────────────────────────────────────────

const RESO_TO_RLS_RENAMES = {
  'StandardStatus':           'MlsStatus',
  'ListingKey':               'SourceSystemKey',
  'ModificationTimestamp':    'SourceSystemModificationTimestamp',
};

function parseSimpleCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function loadAllRLSFields() {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'data', 'rebny-rls-property-fields.csv'), 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    let rlsName = (rows[i][3] || '').trim();
    if (!rlsName || rlsName === 'MatrixFieldName') continue;
    if (RESO_TO_RLS_RENAMES[rlsName]) rlsName = RESO_TO_RLS_RENAMES[rlsName];
    const lower = rlsName.toLowerCase();
    if (!map[lower]) map[lower] = { rlsName };
  }
  return map;
}

function loadPicklistMap() {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'data', 'rebny-rls-property-lookup.csv'), 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  const skipNames = new Set(['LookupName (Current)', 'Property Lookup', 'MatrixSelectName']);
  for (let i = 2; i < rows.length; i++) {
    const curField = (rows[i][2] || '').trim();
    if (curField && !skipNames.has(curField) && curField !== 'Yes' && !curField.startsWith('or ')) {
      if (!map[curField]) map[curField] = new Set();
    }
  }
  return map;
}

const rlsFieldMap = loadAllRLSFields();
const picklistMap = loadPicklistMap();
const picklistFieldByLower = {};
for (const fn of Object.keys(picklistMap)) {
  picklistFieldByLower[fn.toLowerCase()] = fn;
}

// ── Resolution function (matches validator Layer 2-3 logic) ──────────────

const FORM_PREFIXES = ['sale', 'rental', 'bldg', 'search', 'oh', 'crm', 'comm'];

function resolve(identifier) {
  if (!identifier) throw new Error('Empty identifier');

  // Check full ID in internal list
  if (INTERNAL_ONLY_FIELDS.has(identifier)) return { internal: true };

  const lower = identifier.toLowerCase();
  if (rlsFieldMap[lower]) return { field: rlsFieldMap[lower].rlsName };
  if (picklistFieldByLower[lower]) return { field: picklistFieldByLower[lower] };

  // Prefix stripping
  let remainder = identifier;
  for (const prefix of FORM_PREFIXES) {
    if (lower.startsWith(prefix) && remainder.length > prefix.length) {
      const after = remainder.substring(prefix.length);
      if (/^[A-Z]/.test(after)) {
        if (prefix === 'bldg') {
          const bName = 'Building' + after;
          if (rlsFieldMap[bName.toLowerCase()]) return { field: rlsFieldMap[bName.toLowerCase()].rlsName };
          if (picklistFieldByLower[bName.toLowerCase()]) return { field: picklistFieldByLower[bName.toLowerCase()] };
        }
        remainder = after;
        break;
      }
    }
  }

  if (remainder.startsWith('Bldg') && remainder.length > 4 && /^[A-Z]/.test(remainder[4])) {
    const afterBldg = remainder.substring(4);
    const bName = 'Building' + afterBldg;
    if (rlsFieldMap[bName.toLowerCase()]) return { field: rlsFieldMap[bName.toLowerCase()].rlsName };
    if (picklistFieldByLower[bName.toLowerCase()]) return { field: picklistFieldByLower[bName.toLowerCase()] };
    remainder = afterBldg;
  }
  if (remainder.startsWith('TH') && remainder.length > 2 && /^[A-Z]/.test(remainder[2])) {
    remainder = remainder.substring(2);
  }

  if (INTERNAL_ONLY_FIELDS.has(remainder)) return { internal: true };

  const remLower = remainder.toLowerCase();
  if (rlsFieldMap[remLower]) return { field: rlsFieldMap[remLower].rlsName };
  if (picklistFieldByLower[remLower]) return { field: picklistFieldByLower[remLower] };

  const aliased = FIELD_ALIASES[remainder];
  if (aliased) {
    if (rlsFieldMap[aliased.toLowerCase()]) return { field: rlsFieldMap[aliased.toLowerCase()].rlsName };
    return { field: aliased };
  }

  // UNKNOWN — throw (no silent skip)
  throw new Error(`UNKNOWN field: "${identifier}" (remainder: "${remainder}")`);
}

// ── DOM-based resolution (Layer 0+1) ─────────────────────────────────────

function resolveFromDOM(htmlString) {
  const dom = parseHTML(htmlString, { comment: false });
  const el = dom.querySelector('input, select, textarea');
  if (!el) throw new Error('No form element found in HTML');

  // Layer 0
  if (el.getAttribute('data-rls-ignore') === 'true') return { internal: true };

  // Layer 1
  const rlsAttr = el.getAttribute('data-rls-field');
  if (rlsAttr) return { field: rlsAttr };

  // Fallback to heuristic
  const id = (el.getAttribute('id') || el.getAttribute('name') || '').trim();
  return resolve(id);
}

// ── Viewer detection ─────────────────────────────────────────────────────

function isViewer(filename) {
  const filePath = path.join(SEARCH_MODULAR, filename);
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes('data-rls-viewer="true"');
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  RLS BINDING REGRESSION TESTS');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. Binding Resolution Tests ──────────────────────────────────────────

console.log('  --- Binding Resolution ---');

test('saleBldgHeating → BuildingHeating', () => {
  const r = resolve('saleBldgHeating');
  assert.strictEqual(r.field, 'BuildingHeating', `Expected BuildingHeating, got ${r.field}`);
});

test('saleStatus → MlsStatus', () => {
  const r = resolve('saleStatus');
  assert.strictEqual(r.field, 'MlsStatus', `Expected MlsStatus, got ${r.field}`);
});

test('rentalBldgCooling → BuildingCooling', () => {
  const r = resolve('rentalBldgCooling');
  assert.strictEqual(r.field, 'BuildingCooling', `Expected BuildingCooling, got ${r.field}`);
});

test('saleBorough → CityRegion', () => {
  const r = resolve('saleBorough');
  assert.strictEqual(r.field, 'CityRegion', `Expected CityRegion, got ${r.field}`);
});

test('saleMaintCC → AssociationFee', () => {
  const r = resolve('saleMaintCC');
  assert.strictEqual(r.field, 'AssociationFee', `Expected AssociationFee, got ${r.field}`);
});

test('rentalBedrooms → BedroomsTotal', () => {
  const r = resolve('rentalBedrooms');
  assert.strictEqual(r.field, 'BedroomsTotal', `Expected BedroomsTotal, got ${r.field}`);
});

test('saleTHDevStatus → DevelopmentStatus', () => {
  const r = resolve('saleTHDevStatus');
  assert.strictEqual(r.field, 'DevelopmentStatus', `Expected DevelopmentStatus, got ${r.field}`);
});

test('bldgHeating → BuildingHeating', () => {
  const r = resolve('bldgHeating');
  assert.strictEqual(r.field, 'BuildingHeating', `Expected BuildingHeating, got ${r.field}`);
});

test('rentalDescription → PublicRemarks', () => {
  const r = resolve('rentalDescription');
  assert.strictEqual(r.field, 'PublicRemarks', `Expected PublicRemarks, got ${r.field}`);
});

test('saleOriginalPrice → OriginalListPrice', () => {
  const r = resolve('saleOriginalPrice');
  assert.strictEqual(r.field, 'OriginalListPrice', `Expected OriginalListPrice, got ${r.field}`);
});

test('saleSoldPrice → ClosePrice', () => {
  const r = resolve('saleSoldPrice');
  assert.strictEqual(r.field, 'ClosePrice', `Expected ClosePrice, got ${r.field}`);
});

test('rentalAvailableDate → AvailabilityDate', () => {
  const r = resolve('rentalAvailableDate');
  assert.strictEqual(r.field, 'AvailabilityDate', `Expected AvailabilityDate, got ${r.field}`);
});

// ── 2. Internal-Only Classification ──────────────────────────────────────

console.log('\n  --- Internal-Only Classification ---');

test('saleCalcTerm is internal', () => {
  const r = resolve('saleCalcTerm');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('perPageSelect is internal', () => {
  const r = resolve('perPageSelect');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('agentLoginSelect is internal', () => {
  const r = resolve('agentLoginSelect');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('saleShowRequiredOnly is internal', () => {
  const r = resolve('saleShowRequiredOnly');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('saleBuildingSearch is internal', () => {
  const r = resolve('saleBuildingSearch');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('saleCommissionType is internal', () => {
  const r = resolve('saleCommissionType');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('commSaleRlsId is internal (commission request)', () => {
  const r = resolve('commSaleRlsId');
  // comm strip → SaleRlsId which is in internal list
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

// ── 3. No Silent Skip — Unknown Must Throw ───────────────────────────────

console.log('\n  --- No Silent Skip ---');

test('completelyFakeField throws UNKNOWN', () => {
  assert.throws(() => resolve('completelyFakeField'), /UNKNOWN/);
});

test('xyzNotARealField123 throws UNKNOWN', () => {
  assert.throws(() => resolve('xyzNotARealField123'), /UNKNOWN/);
});

// ── 4. Attribute-First (data-rls-field takes precedence) ─────────────────

console.log('\n  --- Attribute-First (Layer 0 + 1) ---');

test('data-rls-field takes precedence over heuristic', () => {
  const r = resolveFromDOM('<select data-rls-field="BuildingHeating" id="wrongName"></select>');
  assert.strictEqual(r.field, 'BuildingHeating', `Expected BuildingHeating, got ${r.field}`);
});

test('data-rls-ignore marks element as internal', () => {
  const r = resolveFromDOM('<input data-rls-ignore="true" id="someField" type="text">');
  assert.strictEqual(r.internal, true, 'Expected internal=true');
});

test('data-rls-field overrides a normally-internal id', () => {
  const r = resolveFromDOM('<select data-rls-field="MlsStatus" id="saleCalcTerm"></select>');
  assert.strictEqual(r.field, 'MlsStatus', 'data-rls-field should override internal classification');
});

test('data-rls-ignore overrides a normally-RLS id', () => {
  const r = resolveFromDOM('<select data-rls-ignore="true" id="saleStatus"></select>');
  assert.strictEqual(r.internal, true, 'data-rls-ignore should override RLS classification');
});

// ── 5. Viewer Detection ──────────────────────────────────────────────────

console.log('\n  --- Viewer Detection ---');

test('SALE-FORM-WITH-TOOLS.html is a viewer', () => {
  assert.strictEqual(isViewer('SALE-FORM-WITH-TOOLS.html'), true);
});

test('RENTAL-FORM-WITH-TOOLS.html is a viewer', () => {
  assert.strictEqual(isViewer('RENTAL-FORM-WITH-TOOLS.html'), true);
});

test('SALE-FORM-REDESIGN.html is NOT a viewer', () => {
  assert.strictEqual(isViewer('SALE-FORM-REDESIGN.html'), false);
});

test('RENTAL-FORM-REDESIGN.html is NOT a viewer', () => {
  assert.strictEqual(isViewer('RENTAL-FORM-REDESIGN.html'), false);
});

test('index-built.html is NOT a viewer', () => {
  assert.strictEqual(isViewer('index-built.html'), false);
});

// ── 6. JSON Config Loading ───────────────────────────────────────────────

console.log('\n  --- JSON Config Integrity ---');

test('rls-field-aliases.json has 200+ entries', () => {
  assert(Object.keys(FIELD_ALIASES).length >= 200, `Only ${Object.keys(FIELD_ALIASES).length} aliases`);
});

test('rls-internal-only.json has 400+ entries', () => {
  assert(INTERNAL_ONLY_LIST.length >= 400, `Only ${INTERNAL_ONLY_LIST.length} internal fields`);
});

test('rls-crm-overlays.json has MlsStatus with 20+ values', () => {
  assert(CRM_OVERLAY_VALUES.MlsStatus && CRM_OVERLAY_VALUES.MlsStatus.length >= 20,
    `MlsStatus has ${CRM_OVERLAY_VALUES.MlsStatus ? CRM_OVERLAY_VALUES.MlsStatus.length : 0} values`);
});

test('rls-form-bindings.json has 0 unknown', () => {
  assert.strictEqual(BINDINGS.summary.unknown, 0, `${BINDINGS.summary.unknown} unknowns found`);
});

test('rls-form-bindings.json has 5 files', () => {
  assert.strictEqual(Object.keys(BINDINGS.files).length, 5, `${Object.keys(BINDINGS.files).length} files`);
});

// ── 7. Binding Map Completeness ──────────────────────────────────────────

console.log('\n  --- Binding Map Completeness ---');

test('Sale form has 150+ RLS-bound elements', () => {
  const stats = BINDINGS.files['SALE-FORM-REDESIGN.html'].stats;
  assert(stats.rlsBound >= 150, `Only ${stats.rlsBound} RLS-bound`);
});

test('Rental form has 200+ RLS-bound elements', () => {
  const stats = BINDINGS.files['RENTAL-FORM-REDESIGN.html'].stats;
  assert(stats.rlsBound >= 200, `Only ${stats.rlsBound} RLS-bound`);
});

// CRM entry removed — dashboard.html is modular (no static form fields to validate)

test('No file has unknown elements', () => {
  for (const [fname, fileData] of Object.entries(BINDINGS.files)) {
    assert.strictEqual(fileData.stats.unknown, 0, `${fname} has ${fileData.stats.unknown} unknowns`);
  }
});

// ── 8. HTML Attribute Injection Verification ──────────────────────────────

console.log('\n  --- Attribute Injection Verification ---');

test('Sale form HTML has data-rls-field attributes', () => {
  const content = fs.readFileSync(path.join(SEARCH_MODULAR, 'SALE-FORM-REDESIGN.html'), 'utf8');
  const count = (content.match(/data-rls-field/g) || []).length;
  assert(count >= 150, `Only ${count} data-rls-field attributes in sale form`);
});

test('Viewer files have data-rls-viewer on body', () => {
  for (const f of ['SALE-FORM-WITH-TOOLS.html', 'RENTAL-FORM-WITH-TOOLS.html']) {
    const content = fs.readFileSync(path.join(SEARCH_MODULAR, f), 'utf8');
    assert(content.includes('data-rls-viewer="true"'), `${f} missing data-rls-viewer on body`);
  }
});

test('Submission forms do NOT have data-rls-viewer', () => {
  for (const f of ['SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html']) {
    const content = fs.readFileSync(path.join(SEARCH_MODULAR, f), 'utf8');
    assert(!content.includes('data-rls-viewer="true"'), `${f} should NOT have data-rls-viewer`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
