#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// REBNY RLS COMPLIANCE VALIDATOR v2 — Deterministic Attribute-First
//
// Architecture:
//   Pass A — Discovery: classify every form element via 4-layer pipeline
//   Pass B — Validation: per-category checks (submission/CRM/viewer/search)
//
// Resolution pipeline (Layer 0–4):
//   0: data-rls-ignore="true"   → INTERNAL (skip)
//   1: data-rls-field="X"       → RLS_BOUND to field X (authoritative)
//   2: rls-field-aliases.json   → explicit alias lookup (fallback)
//   3: Prefix normalization     → strip sale/rental/bldg/TH + match (last resort)
//   4: FAIL                     → UNKNOWN (hard error, exit 1)
//
// Sources of truth:
//   data/rebny-rls-property-lookup.csv   (picklist values)
//   data/rebny-rls-property-fields.csv   (required/conditional fields)
//   data/rls-field-aliases.json          (explicit aliases)
//   data/rls-internal-only.json          (internal-only fields)
//   data/rls-crm-overlays.json           (CRM overlay values)
//
// Usage: node scripts/validate-rls-compliance.js [--verbose] [--html]
// Exit:  0 = all pass, 1 = errors or unknowns found
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { parse: parseHTML } = require('node-html-parser');

// ── Configuration ────────────────────────────────────────────────────────

const VERBOSE = process.argv.includes('--verbose');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_MODULAR = path.resolve(REPO_ROOT, 'public', 'crm');

// File categories (enforced by validator)
const FILE_CONFIG = {
  saleForm:     { path: path.join(SEARCH_MODULAR, 'SALE-FORM-REDESIGN.html'),     category: 'submission', type: 'sale' },
  rentalForm:   { path: path.join(SEARCH_MODULAR, 'RENTAL-FORM-REDESIGN.html'),   category: 'submission', type: 'rental' },
  saleViewer:   { path: path.join(SEARCH_MODULAR, 'SALE-FORM-WITH-TOOLS.html'),   category: 'viewer' },
  rentalViewer: { path: path.join(SEARCH_MODULAR, 'RENTAL-FORM-WITH-TOOLS.html'), category: 'viewer' },
  search:       { path: path.join(SEARCH_MODULAR, 'index-built.html'),            category: 'search' },
};

// Also check but don't RLS-validate
const EXTRA_FILES = {
  buyerDeal:    path.join(SEARCH_MODULAR, 'BUYER-DEAL-FORM.html'),
  tenantDeal:   path.join(SEARCH_MODULAR, 'TENANT-DEAL-FORM.html'),
};

const SOURCE_MODULE = path.join(SEARCH_MODULAR, 'js', 'core', 'reso-field-map.js');
const LOOKUP_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-lookup.csv');
const FIELDS_CSV = path.join(REPO_ROOT, 'data', 'rebny-rls-property-fields.csv');

// ── Load External Config ─────────────────────────────────────────────────

const FIELD_ALIASES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-field-aliases.json'), 'utf8'));
const INTERNAL_ONLY_LIST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-internal-only.json'), 'utf8'));
const INTERNAL_ONLY_FIELDS = new Set(INTERNAL_ONLY_LIST);
const CRM_OVERLAY_VALUES_RAW = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'rls-crm-overlays.json'), 'utf8'));
const CRM_OVERLAY_VALUES = {};
for (const [k, v] of Object.entries(CRM_OVERLAY_VALUES_RAW)) {
  CRM_OVERLAY_VALUES[k] = new Set(v);
}

// ── Constants (small, stable — stay in validator) ────────────────────────

const RESO_TO_RLS_RENAMES = {
  'BuyerAgentKey':            'BuyerAgentMlsId',
  'BuyerOfficeKey':           'BuyerOfficeMlsId',
  'BuyerTeamKey':             'BuyerTeamMlsId',
  'CableTvExpense':           'CableTVExpense',
  'CeilingHeight':            'CeilingHeightFeet',
  'CoBuyerAgentKey':          'CoBuyerAgentMlsId',
  'CoBuyerOfficeKey':         'CoBuyerOfficeMlsId',
  'CoExclusiveListingKey':    'DuplicateListingIDs',
  'CoListAgent2Key':          'CoListAgent2MLSID',
  'CoListAgent3Key':          'CoListAgent3MLSID',
  'CoListAgentKey':           'CoListAgentMlsId',
  'ListAgentKey':             'ListAgentMlsId',
  'ListOfficeKey':            'ListOfficeMlsId',
  'ListTeamKey':              'ListTeamMlsId',
  'LotDimensionsSource':      'LotSizeSource',
  'StandardStatus':           'MlsStatus',
  'ShowingContactPhoneExt':   'ShowingContactPhone',
  'ListingKey':               'SourceSystemKey',
  'ModificationTimestamp':    'SourceSystemModificationTimestamp',
  'UnparsedAddress':          'UnParsedAddress',
};

const CRITICAL_RENAMES = {
  status:      'MlsStatus',
  wid:         'SourceSystemKey',
  updatedDate: 'ModificationTimestamp', // live Cotality field (the REBNY submission-form name SourceSystemModificationTimestamp is not a live field)
};

const PICKLIST_SKIP_CONTEXTS = new Set(['PropertyType']);

const SYSTEM_FIELDS = new Set([
  'OriginalEntryTimestamp', 'SourceSystemKey', 'StandardStatus', 'MlsStatus',
  'DaysOnMarket', 'CumulativeDaysOnMarket', 'ListingKey', 'ListingId',
  'ListingURL', 'OffMarketDate', 'CancellationDate',
  'ListAgentMlsId', 'BuyerAgentMlsId', 'ListOfficeMlsId',
]);

const CLOSING_ONLY_FIELDS = new Set([
  'BuyerAgentMlsId', 'BuyerAgentDirectPhone', 'BuyerAgentEmail',
  'BuyerAgentFullName', 'BuyerAgentStateLicense', 'BuyerAgentRLSParticipantYN',
  'BuyerOfficeName', 'BuyerOfficePhone', 'ClosePrice', 'PurchaseContractDate',
]);

const FORM_PREFIXES = ['sale', 'rental', 'bldg', 'search', 'oh', 'crm', 'comm'];

// Fields that are rental-only or sale-only
const RENTAL_ONLY = new Set(['NetMonthlyRent', 'AvailabilityDate', 'LeaseType', 'MinLeaseMonths']);
const SALE_ONLY = new Set(['FlipTax', 'FlipTaxType', 'MaximumFinancingAmount', 'MaximumFinancingPercent',
                           'PercentOfCommonElements', 'TaxDeductionPercent']);

// ── Results Tracking ─────────────────────────────────────────────────────

const results = {
  1:  { name: 'PICKLIST VALUES',       errors: [], warnings: [] },
  2:  { name: 'REQUIRED FIELDS',       errors: [], warnings: [] },
  3:  { name: 'RESO→RLS RENAMES',      errors: [], warnings: [] },
  4:  { name: 'DISTRIBUTION GATES',    errors: [], warnings: [] },
  5:  { name: 'FIELD MAP INTEGRITY',   errors: [], warnings: [] },
  6:  { name: '(REMOVED)',             errors: [], warnings: [] },
  7:  { name: 'CONDITIONAL RULES',     errors: [], warnings: [], missing: [] },
  8:  { name: 'ROLE MASKING',          errors: [], warnings: [] },
  9:  { name: 'RLS FIELD COVERAGE',    errors: [], warnings: [] },
  10: { name: 'VIEWER LOCKDOWN',       errors: [], warnings: [] },
};

function error(section, msg) { results[section].errors.push(msg); }
function warn(section, msg)  { results[section].warnings.push(msg); }
function missing(msg)        { results[7].missing.push(msg); }
function log(msg) { if (VERBOSE) console.log('  ' + msg); }

// ── Classification Tracking ──────────────────────────────────────────────

const classification = {
  rlsBound: 0,
  internal: 0,
  unknown: 0,
  byFile: {},  // fname → { rlsBound, internal, unknown, unknownIds }
  byLayer: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
};

// ── CSV Parsers ──────────────────────────────────────────────────────────

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

function loadPicklistMap() {
  const text = fs.readFileSync(LOOKUP_CSV, 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  // AUTHORITY: for every field that is an enum on the live Cotality resource, the valid picklist is the
  // dated live pull (data/cotality-enums.live.json — regenerated by `npm run cotality:compile`). The
  // REBNY CSV below is a SNAPSHOT used only for submission-form fields that are not live enum fields
  // (AttendanceType, BuildingPetsAllowed, …). Packet 2 closure, 2026-09-06.
  const liveEnums = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'cotality-enums.live.json'), 'utf8')).enums || {};
  for (const [field, members] of Object.entries(liveEnums)) {
    if (Array.isArray(members) && members.length) map[field] = new Set(members);
  }
  const liveFields = new Set(Object.keys(map));
  const skipNames = new Set(['LookupName (Current)', 'Property Lookup', 'MatrixSelectName']);
  for (let i = 2; i < rows.length; i++) {
    const curField = (rows[i][2] || '').trim();
    const curValue = (rows[i][3] || '').trim();
    const mtxField = (rows[i][5] || '').trim();
    const mtxValue = (rows[i][6] || '').trim();
    if (curField && !skipNames.has(curField) && curField !== 'Yes' && !curField.startsWith('or ') && !liveFields.has(curField)) {
      if (!map[curField]) map[curField] = new Set();
      if (curValue) map[curField].add(curValue);
    }
    if (mtxField && !skipNames.has(mtxField) && mtxField !== 'Yes' && !mtxField.startsWith('or ')) {
      if ((!curField || curField !== mtxField || !curValue) && !liveFields.has(mtxField)) {
        if (!map[mtxField]) map[mtxField] = new Set();
        if (mtxValue) map[mtxField].add(mtxValue);
      }
    }
  }
  return map;
}

function loadRequiredFields() {
  const text = fs.readFileSync(FIELDS_CSV, 'utf8');
  const rows = parseSimpleCSV(text);
  const required = [];
  const conditional = [];
  for (let i = 1; i < rows.length; i++) {
    let name = (rows[i][1] || '').trim();
    const rules = (rows[i][7] || '').trim();
    if (!name || !rules) continue;
    if (RESO_TO_RLS_RENAMES[name]) name = RESO_TO_RLS_RENAMES[name];
    if (/^yes/i.test(rules) || rules === 'Required') {
      required.push(name);
    } else if (/^conditional/i.test(rules)) {
      conditional.push({ name, rule: rules });
    }
  }
  return { required: [...new Set(required)], conditional };
}

function loadAllRLSFields() {
  const text = fs.readFileSync(FIELDS_CSV, 'utf8');
  const rows = parseSimpleCSV(text);
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    let rlsName = (rows[i][3] || '').trim();
    const addEdit = (rows[i][5] || '').trim();
    const search = (rows[i][6] || '').trim();
    const rules = (rows[i][7] || '').trim();
    if (!rlsName || rlsName === 'MatrixFieldName') continue;
    if (RESO_TO_RLS_RENAMES[rlsName]) rlsName = RESO_TO_RLS_RENAMES[rlsName];
    const lower = rlsName.toLowerCase();
    if (!map[lower]) map[lower] = { rlsName, addEdit, search, rules };
  }
  return map;
}

// ── File Loaders ─────────────────────────────────────────────────────────

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) { console.error('  FILE NOT FOUND: ' + filePath); return null; }
  return fs.readFileSync(filePath, 'utf8');
}

function loadDOM(filePath) {
  const content = loadFile(filePath);
  if (!content) return null;
  return { dom: parseHTML(content, { comment: false }), raw: content };
}

function shortName(filePath) { return path.basename(filePath); }

// ═══════════════════════════════════════════════════════════════════════════
// 4-LAYER RESOLUTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

function resolveElement(el, rlsFieldMap, picklistFieldByLower) {
  // Layer 0: data-rls-ignore="true" → INTERNAL
  if (el.getAttribute('data-rls-ignore') === 'true') {
    classification.byLayer[0]++;
    return { internal: true, layer: 0 };
  }

  // Layer 1: data-rls-field="X" → RLS_BOUND (authoritative)
  const rlsAttr = el.getAttribute('data-rls-field');
  if (rlsAttr) {
    classification.byLayer[1]++;
    return { field: rlsAttr, layer: 1 };
  }

  // Get identifier for fallback layers
  const elId = (el.getAttribute('id') || '').trim();
  const elName = (el.getAttribute('name') || '').trim();
  const identifier = elId || elName;
  if (!identifier) return { internal: true, layer: 0 };  // no id/name = skip

  // Check full ID in internal list
  if (INTERNAL_ONLY_FIELDS.has(identifier)) {
    classification.byLayer[2]++;
    return { internal: true, layer: 2 };
  }

  // Layer 2+: require field maps — if not provided, stop resolution here
  if (!rlsFieldMap || !picklistFieldByLower) {
    classification.byLayer[4]++;
    return { unknown: true, identifier, layer: 4 };
  }

  // Layer 2: Alias lookup
  let remainder = identifier;
  const lower = identifier.toLowerCase();

  // Try exact match first
  if (rlsFieldMap[lower]) {
    classification.byLayer[2]++;
    return { field: rlsFieldMap[lower].rlsName, layer: 2 };
  }
  if (picklistFieldByLower[lower]) {
    classification.byLayer[2]++;
    return { field: picklistFieldByLower[lower], layer: 2 };
  }

  // Layer 3: Prefix normalization
  for (const prefix of FORM_PREFIXES) {
    if (lower.startsWith(prefix) && remainder.length > prefix.length) {
      const after = remainder.substring(prefix.length);
      if (/^[A-Z]/.test(after)) {
        if (prefix === 'bldg') {
          const bName = 'Building' + after;
          if (rlsFieldMap[bName.toLowerCase()]) {
            classification.byLayer[3]++;
            return { field: rlsFieldMap[bName.toLowerCase()].rlsName, layer: 3 };
          }
          if (picklistFieldByLower[bName.toLowerCase()]) {
            classification.byLayer[3]++;
            return { field: picklistFieldByLower[bName.toLowerCase()], layer: 3 };
          }
        }
        remainder = after;
        break;
      }
    }
  }

  // Compound prefix: Bldg or TH
  if (remainder.startsWith('Bldg') && remainder.length > 4 && /^[A-Z]/.test(remainder[4])) {
    const afterBldg = remainder.substring(4);
    const bName = 'Building' + afterBldg;
    if (rlsFieldMap[bName.toLowerCase()]) {
      classification.byLayer[3]++;
      return { field: rlsFieldMap[bName.toLowerCase()].rlsName, layer: 3 };
    }
    if (picklistFieldByLower[bName.toLowerCase()]) {
      classification.byLayer[3]++;
      return { field: picklistFieldByLower[bName.toLowerCase()], layer: 3 };
    }
    remainder = afterBldg;
  }
  if (remainder.startsWith('TH') && remainder.length > 2 && /^[A-Z]/.test(remainder[2])) {
    remainder = remainder.substring(2);
  }

  // Check remainder against internal list
  if (INTERNAL_ONLY_FIELDS.has(remainder)) {
    classification.byLayer[3]++;
    return { internal: true, layer: 3 };
  }

  // Try remainder against RLS fields
  const remLower = remainder.toLowerCase();
  if (rlsFieldMap[remLower]) {
    classification.byLayer[3]++;
    return { field: rlsFieldMap[remLower].rlsName, layer: 3 };
  }
  if (picklistFieldByLower[remLower]) {
    classification.byLayer[3]++;
    return { field: picklistFieldByLower[remLower], layer: 3 };
  }

  // Try alias match
  const aliased = FIELD_ALIASES[remainder];
  if (aliased) {
    classification.byLayer[3]++;
    if (rlsFieldMap[aliased.toLowerCase()]) {
      return { field: rlsFieldMap[aliased.toLowerCase()].rlsName, layer: 3 };
    }
    return { field: aliased, layer: 3 };
  }

  // Layer 4: FAIL — UNKNOWN
  classification.byLayer[4]++;
  return { unknown: true, identifier, layer: 4 };
}

// ═══════════════════════════════════════════════════════════════════════════
// PASS A: DISCOVERY — classify every element
// ═══════════════════════════════════════════════════════════════════════════

function passA_Discovery(rlsFieldMap, picklistMap) {
  console.log('\n  PASS A: Discovery — classifying all elements...');

  const picklistFieldByLower = {};
  for (const fn of Object.keys(picklistMap)) {
    picklistFieldByLower[fn.toLowerCase()] = fn;
  }

  const fileElements = {};  // fileKey → [{ el, identifier, result }]

  for (const [fileKey, config] of Object.entries(FILE_CONFIG)) {
    const loaded = loadDOM(config.path);
    if (!loaded) continue;
    const { dom, raw } = loaded;
    const fname = shortName(config.path);

    const elements = [];
    const seen = new Set();
    const allEls = dom.querySelectorAll('input, select, textarea');

    for (const el of allEls) {
      const elId = (el.getAttribute('id') || '').trim();
      const elName = (el.getAttribute('name') || '').trim();
      const identifier = elId || elName;
      if (!identifier || seen.has(identifier)) continue;
      seen.add(identifier);

      const result = resolveElement(el, rlsFieldMap, picklistFieldByLower);
      elements.push({ el, identifier, result, elType: el.getAttribute('type') || el.tagName.toLowerCase() });

      if (result.field) classification.rlsBound++;
      else if (result.internal) classification.internal++;
      else if (result.unknown) classification.unknown++;
    }

    // Radio buttons by name
    const radios = dom.querySelectorAll('input[type="radio"]');
    for (const r of radios) {
      const rName = (r.getAttribute('name') || '').trim();
      if (!rName || seen.has(rName)) continue;
      seen.add(rName);

      const result = resolveElement(r, rlsFieldMap, picklistFieldByLower);
      elements.push({ el: r, identifier: rName, result, elType: 'radio' });

      if (result.field) classification.rlsBound++;
      else if (result.internal) classification.internal++;
      else if (result.unknown) classification.unknown++;
    }

    if (!classification.byFile[fname]) {
      classification.byFile[fname] = { rlsBound: 0, internal: 0, unknown: 0, unknownIds: [] };
    }
    for (const { result, identifier } of elements) {
      if (result.field) classification.byFile[fname].rlsBound++;
      else if (result.internal) classification.byFile[fname].internal++;
      else if (result.unknown) {
        classification.byFile[fname].unknown++;
        classification.byFile[fname].unknownIds.push(identifier);
      }
    }

    fileElements[fileKey] = { elements, dom, raw, fname, config };
    log(`${fname}: ${elements.length} elements — ${classification.byFile[fname].rlsBound} RLS, ${classification.byFile[fname].internal} internal, ${classification.byFile[fname].unknown} unknown`);
  }

  return fileElements;
}

// ═══════════════════════════════════════════════════════════════════════════
// PASS B: VALIDATION — per-category checks
// ═══════════════════════════════════════════════════════════════════════════

// SECTION 1: PICKLIST VALUES
function validatePicklists(fileElements, picklistMap) {
  console.log('\n  Section 1: Picklist Values ...');

  const SKIP_VALUES = new Set(['', 'Select', 'select', '--', 'Choose', 'choose', 'All', 'Any']);

  for (const [fileKey, data] of Object.entries(fileElements)) {
    const { elements, dom, raw, fname, config } = data;

    // Skip search — internal-only hygiene only
    if (config.category === 'search') continue;

    // Check selects
    const selects = dom.querySelectorAll('select');
    for (const sel of selects) {
      const result = resolveElement(sel, null, null);
      // If Layer 0 or 1 resolved it, use that. Otherwise skip non-RLS elements.
      let fieldName = null;
      const rlsAttr = sel.getAttribute('data-rls-field');
      if (sel.getAttribute('data-rls-ignore') === 'true') continue;
      if (rlsAttr) {
        fieldName = rlsAttr;
      } else {
        // Fallback: find from elements array
        const elId = (sel.getAttribute('id') || '').trim();
        const elName = (sel.getAttribute('name') || '').trim();
        const identifier = elId || elName;
        const match = elements.find(e => e.identifier === identifier);
        if (!match || !match.result.field) continue;
        fieldName = match.result.field;
      }

      if (PICKLIST_SKIP_CONTEXTS.has(fieldName)) continue;
      if (!picklistMap[fieldName]) continue;

      const validValues = picklistMap[fieldName];
      if (!validValues || validValues.size === 0) continue;

      const options = sel.querySelectorAll('option');
      for (const opt of options) {
        const val = (opt.getAttribute('value') || '').trim();
        if (SKIP_VALUES.has(val)) continue;
        if (!validValues.has(val)) {
          const overlaySet = CRM_OVERLAY_VALUES[fieldName];
          if (overlaySet && overlaySet.has(val)) {
            log(`${fname}: CRM overlay "${fieldName}": value "${val}"`);
            continue;
          }
          error(1, `${fname}: <select> "${fieldName}": value "${val}" not in RLS picklist`);
        }
      }

      // Completeness check — warn if RLS values missing
      if (config.category !== 'viewer') {
        const formValues = new Set();
        for (const opt of options) {
          const val = (opt.getAttribute('value') || '').trim();
          if (val && !SKIP_VALUES.has(val)) formValues.add(val);
        }
        const miss = [...validValues].filter(v => !formValues.has(v));
        if (miss.length > 0 && miss.length <= 10) {
          warn(1, `${fname}: "${fieldName}": missing ${miss.length} RLS values: ${miss.join(', ')}`);
        } else if (miss.length > 10) {
          warn(1, `${fname}: "${fieldName}": missing ${miss.length} RLS values (first 5): ${miss.slice(0, 5).join(', ')}...`);
        }
      }
    }

    // Check checkboxes
    const checkboxes = dom.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (cb.getAttribute('data-rls-ignore') === 'true') continue;
      const fieldName = cb.getAttribute('data-rls-field');
      if (!fieldName) continue;
      if (PICKLIST_SKIP_CONTEXTS.has(fieldName)) continue;
      if (!picklistMap[fieldName]) continue;

      const validValues = picklistMap[fieldName];
      if (!validValues || validValues.size === 0) continue;

      const val = (cb.getAttribute('value') || '').trim();
      if (val && !SKIP_VALUES.has(val) && !validValues.has(val)) {
        const overlaySet = CRM_OVERLAY_VALUES[fieldName];
        if (overlaySet && overlaySet.has(val)) continue;
        error(1, `${fname}: checkbox "${fieldName}": value "${val}" not in RLS picklist`);
      }
    }

  }
}

// SECTION 2: REQUIRED FIELDS (submission files only)
function validateRequiredFields(fileElements, requiredFields) {
  console.log('\n  Section 2: Required Fields (submission files only) ...');

  for (const [fileKey, data] of Object.entries(fileElements)) {
    const { elements, dom, raw, fname, config } = data;
    if (config.category !== 'submission') continue;

    const skip = config.type === 'sale' ? RENTAL_ONLY : SALE_ONLY;
    const rawLower = raw.toLowerCase();

    // Build set of RLS fields covered by this form
    const coveredFields = new Set();
    for (const { result } of elements) {
      if (result.field) coveredFields.add(result.field);
    }

    for (const fieldName of requiredFields) {
      if (SYSTEM_FIELDS.has(fieldName)) continue;
      if (fieldName.includes(' ') || fieldName.length < 3) continue;
      if (skip.has(fieldName)) continue;

      if (coveredFields.has(fieldName)) continue;

      // Check JS references as fallback
      const inJS = raw.includes(fieldName) || rawLower.includes(fieldName.toLowerCase());

      if (CLOSING_ONLY_FIELDS.has(fieldName)) {
        if (!inJS) {
          warn(2, `${fname}: closing-only field "${fieldName}" not found (OK if only at closing)`);
        }
      } else if (inJS) {
        log(`${fname}: "${fieldName}" — no HTML element but referenced in JS`);
      } else {
        error(2, `${fname}: required field "${fieldName}" — no form element or JS reference`);
      }
    }
  }
}

// SECTION 3: RESO→RLS RENAMES
function validateRenames() {
  console.log('\n  Section 3: RESO→RLS Renames (23 renames) ...');

  const allFiles = [
    ...Object.values(FILE_CONFIG).map(c => c.path),
    ...Object.values(EXTRA_FILES),
    SOURCE_MODULE,
  ];

  for (const filePath of allFiles) {
    const content = loadFile(filePath);
    if (!content) continue;
    const fname = shortName(filePath);

    for (const [resoName, rlsName] of Object.entries(RESO_TO_RLS_RENAMES)) {
      const attrPattern = new RegExp(`data-reso-field=["']${resoName}["']`, 'g');
      const matches = content.match(attrPattern);
      if (matches) {
        error(3, `${fname}: data-reso-field="${resoName}" should be "${rlsName}" (${matches.length}x)`);
      }
    }

    if (fname === 'reso-field-map.js' || fname === 'index-built.html') {
      const mapStart = content.indexOf('RESO_FIELD_MAP');
      const mapBlockStart = mapStart >= 0 ? content.indexOf('{', mapStart) : -1;
      if (mapBlockStart >= 0) {
        let depth = 0, mapEnd = mapBlockStart;
        for (let i = mapBlockStart; i < content.length && i < mapBlockStart + 10000; i++) {
          if (content[i] === '{') depth++;
          if (content[i] === '}') { depth--; if (depth === 0) { mapEnd = i + 1; break; } }
        }
        const mapBlock = content.substring(mapBlockStart, mapEnd);
        for (const [mockKey, expectedRLS] of Object.entries(CRITICAL_RENAMES)) {
          const mapPattern = new RegExp(`${mockKey}:\\s*['"]([^'"]+)['"]`);
          const match = mapBlock.match(mapPattern);
          if (match) {
            if (match[1] !== expectedRLS) {
              error(3, `${fname}: RESO_FIELD_MAP.${mockKey} = "${match[1]}" — should be "${expectedRLS}"`);
            } else {
              log(`${fname}: RESO_FIELD_MAP.${mockKey} = "${match[1]}" OK`);
            }
          }
        }
      }
    }
  }
}

// SECTION 4: DISTRIBUTION GATES
function validateDistributionGates(fileElements) {
  console.log('\n  Section 4: Distribution Gates (6 gates) ...');

  const gateKeys = ['search', 'saleViewer', 'rentalViewer', 'crm'];
  const gates = [
    { name: 'Gate 1: Owner Opt-Out',      patterns: ['ownerOptOut'], required: true },
    { name: 'Gate 2: Participant Only',    patterns: ['participantOnly'], required: true },
    { name: 'Gate 3: IDX Display',         patterns: ['idxDisplayYN', 'IDXEntireListingDisplayYN', 'idxDisplay'], required: true },
    { name: 'Gate 4: Syndication',         patterns: ['SyndicateYN', 'syndicateYN'], required: true },
    { name: 'Gate 5: Coming Soon',         patterns: ['COMING_SOON', 'ComingSoon', 'comingSoon'], required: true },
    { name: 'Gate 6: Closed 24hr',         patterns: ['CLOSED', 'closedDate', 'CloseDate'], required: true },
    { name: 'Address Suppression',         patterns: ['addressDisplayYN', 'InternetAddressDisplayYN'], required: true },
    { name: 'Display Cascade',             patterns: ['InternetEntireListingDisplayYN'], required: true },
  ];

  const searchData = fileElements.search;
  if (searchData && searchData.raw) {
    if (searchData.raw.includes('checkListingCompliance')) {
      log('index-built.html: checkListingCompliance function FOUND');
    } else {
      error(4, 'index-built.html: checkListingCompliance function NOT FOUND');
    }
  }

  for (const gate of gates) {
    let found = false;
    for (const fileKey of gateKeys) {
      const data = fileElements[fileKey];
      if (!data) continue;
      for (const p of gate.patterns) {
        if (data.raw.includes(p)) { found = true; break; }
      }
      if (found) break;
    }
    if (!found && gate.required) {
      error(4, `${gate.name}: no reference found in any gate file`);
    } else {
      log(`${gate.name}: FOUND`);
    }
  }

  for (const key of ['saleForm', 'rentalForm']) {
    const data = fileElements[key];
    if (!data) continue;
    if (!data.raw.includes('SyndicateYN') && !data.raw.includes('syndicateYN') && !data.raw.includes('Syndicate')) {
      warn(4, `${data.fname}: SyndicateYN field not found in distribution section`);
    }
  }
}

// SECTION 5: FIELD MAP INTEGRITY
function validateFieldMapIntegrity() {
  console.log('\n  Section 5: RESO_FIELD_MAP Integrity ...');

  const sourceContent = loadFile(SOURCE_MODULE);
  const searchContent = loadFile(FILE_CONFIG.search.path);

  if (!sourceContent) { error(5, 'Source module not found'); return; }
  if (!searchContent) { error(5, 'Built file not found'); return; }

  if (!sourceContent.includes('RESO_FIELD_MAP')) error(5, 'reso-field-map.js: RESO_FIELD_MAP not found');
  if (!searchContent.includes('RESO_FIELD_MAP')) error(5, 'index-built.html: RESO_FIELD_MAP not found');

  function extractMapBlock(content) {
    const mapStart = content.indexOf('RESO_FIELD_MAP');
    const blockStart = mapStart >= 0 ? content.indexOf('{', mapStart) : -1;
    if (blockStart < 0) return null;
    let depth = 0, blockEnd = blockStart;
    for (let i = blockStart; i < content.length && i < blockStart + 10000; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') { depth--; if (depth === 0) { blockEnd = i + 1; break; } }
    }
    return content.substring(blockStart, blockEnd);
  }

  const sourceMap = extractMapBlock(sourceContent);
  const builtMap = extractMapBlock(searchContent);

  for (const [mockKey, expectedRLS] of Object.entries(CRITICAL_RENAMES)) {
    const pattern = new RegExp(`${mockKey}:\\s*['"]([^'"]+)['"]`);
    const sourceMatch = sourceMap ? sourceMap.match(pattern) : null;
    const builtMatch = builtMap ? builtMap.match(pattern) : null;
    if (sourceMatch && builtMatch) {
      if (sourceMatch[1] !== builtMatch[1]) {
        error(5, `BUILD DRIFT: ${mockKey} — source="${sourceMatch[1]}" vs built="${builtMatch[1]}"`);
      }
    } else if (!sourceMatch) {
      error(5, `reso-field-map.js: ${mockKey} mapping not found in RESO_FIELD_MAP`);
    } else if (!builtMatch) {
      warn(5, `index-built.html: ${mockKey} mapping not found in RESO_FIELD_MAP`);
    }
  }

  const removedFields = ['BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
                         'SubAgencyCompensation', 'SubAgencyCompensationType'];
  for (const field of removedFields) {
    const activePattern = new RegExp(`^(?!.*\\/\\/).*['"]${field}['"]`, 'm');
    if (activePattern.test(sourceContent)) {
      error(5, `reso-field-map.js: removed field "${field}" is active`);
    }
  }

  for (const helper of ['resoAttr', 'resoData']) {
    if (!searchContent.includes(`function ${helper}`)) {
      error(5, `index-built.html: helper function ${helper}() not found`);
    }
  }
}

// SECTION 6: (removed — mock data eliminated)

// SECTION 7: CONDITIONAL RULES (submission files only)
function validateConditionalRules(fileElements, conditionalFields) {
  console.log('\n  Section 7: Conditional Rules ...');

  const enforcementRules = [
    { name: 'BuildingPetsAllowed=BuildingNo → PetsAllowed=UnitNo',
      patterns: ['BuildingPetsAllowed', 'PetsAllowed', 'BuildingNo'] },
    { name: 'MlsStatus=ComingSoon → ActivationDate required',
      patterns: ['ComingSoon', 'ActivationDate'] },
    { name: 'AssociationFee > 0 → AssociationFeeFrequency required',
      patterns: ['AssociationFee', 'AssociationFeeFrequency'] },
    { name: 'TaxAbatementYN=true → TaxAbatementExpirationYear required',
      patterns: ['TaxAbatement', 'ExpirationYear'] },
    { name: 'CoolingYN=true → Cooling required',
      patterns: ['CoolingYN', 'Cooling'] },
    { name: 'HeatingYN=true → Heating required',
      patterns: ['HeatingYN', 'Heating'] },
    { name: 'ViewYN=true → View required',
      patterns: ['ViewYN', 'View'] },
    { name: 'LotSizeArea > 0 → LotSizeUnits required',
      patterns: ['LotSize', 'LotSizeUnits'] },
    { name: 'BuildingAreaTotal > 0 → BuildingAreaUnits required',
      patterns: ['BuildingAreaTotal', 'BuildingAreaUnits'] },
    { name: 'AssociationFee2 > 0 → AssociationFee2Frequency required',
      patterns: ['AssociationFee2', 'Fee2Frequency'] },
  ];

  for (const [fileKey, data] of Object.entries(fileElements)) {
    if (data.config.category !== 'submission') continue;

    for (const rule of enforcementRules) {
      const allFound = rule.patterns.every(p => data.raw.includes(p));
      if (!allFound) {
        missing(`${data.fname}: ${rule.name} — enforcement logic NOT FOUND`);
      } else {
        log(`${data.fname}: ${rule.name} — FOUND`);
      }
    }
  }
}

// SECTION 8: ROLE MASKING (viewer files)
function validateRoleMasking(fileElements) {
  console.log('\n  Section 8: Role-Based Masking ...');

  const viewerChecks = [
    { key: 'saleViewer',   maskFn: 'applySaleRoleMasking',   defaultRole: 'buyer' },
    { key: 'rentalViewer', maskFn: 'applyRentalRoleMasking', defaultRole: 'tenant' },
  ];

  for (const { key, maskFn, defaultRole } of viewerChecks) {
    const data = fileElements[key];
    if (!data) { error(8, `Cannot load ${key}`); continue; }
    const { raw, fname } = data;

    if (!raw.includes(`function ${maskFn}`)) {
      error(8, `${fname}: ${maskFn}() function NOT FOUND`);
    }

    if (!raw.includes('VIEWER_VALID_ROLES')) {
      error(8, `${fname}: VIEWER_VALID_ROLES not found`);
    } else {
      for (const role of ['broker', 'agent', 'buyer', 'tenant', 'seller', 'landlord']) {
        if (!raw.includes(`'${role}'`)) {
          error(8, `${fname}: role "${role}" not in VIEWER_VALID_ROLES`);
        }
      }
    }

    if (!raw.includes('isInsideSkipZone')) {
      error(8, `${fname}: isInsideSkipZone() NOT FOUND`);
    }

    if (!raw.includes(`'${defaultRole}'`) && !raw.includes(`"${defaultRole}"`)) {
      warn(8, `${fname}: no default to "${defaultRole}" for unknown role (fail-closed)`);
    }

    if (!raw.includes('_isLocal') && !raw.includes('IS_DEV') && !raw.includes('localhost')) {
      error(8, `${fname}: no localhost/dev-mode check found`);
    }

    const hidesDistribution = raw.includes('Tab4') || raw.includes('tab4') || raw.includes('Distribution');
    const hidesHistory = raw.includes('Tab6') || raw.includes('tab6') || raw.includes('History');
    if (!hidesDistribution) warn(8, `${fname}: no evidence of hiding Distribution tab for restricted roles`);
    if (!hidesHistory) warn(8, `${fname}: no evidence of hiding History tab for restricted roles`);

    if (!raw.includes('listing-agent-mask') && !raw.includes('agentMask') && !raw.includes('agent-mask')) {
      error(8, `${fname}: no agent info masking CSS class found`);
    }
  }
}

// SECTION 9: RLS FIELD COVERAGE
function validateRLSCoverage(fileElements, rlsFieldMap, picklistMap) {
  console.log('\n  Section 9: RLS Field Coverage ...');

  const editableFields = [];
  for (const [lower, info] of Object.entries(rlsFieldMap)) {
    if (info.addEdit === 'Yes') editableFields.push(info.rlsName);
  }

  for (const [fileKey, data] of Object.entries(fileElements)) {
    if (data.config.category !== 'submission') continue;

    const coveredFields = new Set();
    for (const { result } of data.elements) {
      if (result.field) coveredFields.add(result.field);
    }
    // Also check JS references
    for (const fn of editableFields) {
      if (data.raw.includes(fn)) coveredFields.add(fn);
    }

    const covered = editableFields.filter(f => coveredFields.has(f));
    const pct = ((covered.length / editableFields.length) * 100).toFixed(1);
    log(`${data.fname}: ${covered.length}/${editableFields.length} editable fields covered (${pct}%)`);
  }

  log(`Total RLS fields: ${Object.keys(rlsFieldMap).length}`);
  log(`Editable (Add/Edit=Yes): ${editableFields.length}`);
}

// SECTION 10: VIEWER LOCKDOWN
function validateViewerLockdown(fileElements) {
  console.log('\n  Section 10: Viewer Lockdown ...');

  for (const [fileKey, data] of Object.entries(fileElements)) {
    if (data.config.category !== 'viewer') continue;
    const { raw, fname } = data;

    // Check <body data-rls-viewer="true">
    if (!raw.includes('data-rls-viewer="true"')) {
      error(10, `${fname}: <body> missing data-rls-viewer="true" attribute`);
    }

    // Check for form submission routes
    const formActionPattern = /<form[^>]*action=["'][^"']*["'][^>]*>/gi;
    const formActions = raw.match(formActionPattern);
    if (formActions) {
      for (const fa of formActions) {
        // Allow empty action or # or javascript:void
        if (!fa.includes('action=""') && !fa.includes('action="#"') && !fa.includes('javascript:')) {
          error(10, `${fname}: form has non-empty action attribute: ${fa.substring(0, 80)}`);
        }
      }
    }

    // Check for submit buttons wired to endpoints
    const dangerousPatterns = [
      { pattern: /\bsubmitToRLS\b/g, name: 'submitToRLS()' },
      { pattern: /\bbuildRLSPayload\b/g, name: 'buildRLSPayload()' },
      { pattern: /\bfetch\s*\(\s*['"][^'"]*api/gi, name: 'fetch() to API endpoint' },
      { pattern: /\bXMLHttpRequest\b/g, name: 'XMLHttpRequest' },
    ];

    for (const { pattern, name } of dangerousPatterns) {
      const matches = raw.match(pattern);
      if (matches) {
        error(10, `${fname}: viewer contains ${name} (${matches.length}x) — not allowed in view-only file`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  REBNY RLS COMPLIANCE VALIDATOR v2 — Deterministic');
  console.log('  Attribute-First | 4-Layer Pipeline | Per-Category Suites');
  console.log('═══════════════════════════════════════════════════════════════');

  // Verify files exist
  let filesMissing = false;
  for (const [key, config] of Object.entries(FILE_CONFIG)) {
    if (!fs.existsSync(config.path)) {
      console.error(`  MISSING: ${key} → ${config.path}`);
      filesMissing = true;
    }
  }
  if (!fs.existsSync(SOURCE_MODULE)) {
    console.error(`  MISSING: source module → ${SOURCE_MODULE}`);
    filesMissing = true;
  }
  if (filesMissing) {
    console.error('\n  Cannot proceed — fix missing files first.');
    process.exit(1);
  }

  // Load CSV data
  console.log('\n  Loading RLS data sources...');
  const picklistMap = loadPicklistMap();
  const { required: requiredFields, conditional: conditionalFields } = loadRequiredFields();
  const rlsFieldMap = loadAllRLSFields();
  console.log(`  Total RLS fields: ${Object.keys(rlsFieldMap).length}`);
  console.log(`  Picklist fields: ${Object.keys(picklistMap).length}`);
  console.log(`  Required fields: ${requiredFields.length}`);
  console.log(`  Conditional fields: ${conditionalFields.length}`);
  console.log(`  Aliases: ${Object.keys(FIELD_ALIASES).length}`);
  console.log(`  Internal-only: ${INTERNAL_ONLY_FIELDS.size}`);
  console.log(`  CRM overlays: ${Object.keys(CRM_OVERLAY_VALUES).length} fields`);

  // PASS A: Discovery
  const fileElements = passA_Discovery(rlsFieldMap, picklistMap);

  // PASS B: Validation (10 sections)
  validatePicklists(fileElements, picklistMap);
  validateRequiredFields(fileElements, requiredFields);
  validateRenames();
  validateDistributionGates(fileElements);
  validateFieldMapIntegrity();
  validateConditionalRules(fileElements, conditionalFields);
  validateRoleMasking(fileElements);
  validateRLSCoverage(fileElements, rlsFieldMap, picklistMap);
  validateViewerLockdown(fileElements);

  // ── Classification Summary ─────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CLASSIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`  RLS_BOUND:     ${classification.rlsBound} elements across ${Object.keys(FILE_CONFIG).length} files`);
  console.log(`  INTERNAL_ONLY: ${classification.internal} elements across ${Object.keys(FILE_CONFIG).length} files`);
  console.log(`  UNKNOWN:       ${classification.unknown} elements (MUST be 0 for CI pass)\n`);

  console.log('  Resolution layers:');
  console.log(`    Layer 0 (data-rls-ignore):  ${classification.byLayer[0]}`);
  console.log(`    Layer 1 (data-rls-field):   ${classification.byLayer[1]}`);
  console.log(`    Layer 2 (alias/exact):      ${classification.byLayer[2]}`);
  console.log(`    Layer 3 (prefix strip):     ${classification.byLayer[3]}`);
  console.log(`    Layer 4 (UNKNOWN/FAIL):     ${classification.byLayer[4]}\n`);

  console.log('  Per-file breakdown:');
  for (const [fname, stats] of Object.entries(classification.byFile)) {
    const total = stats.rlsBound + stats.internal + stats.unknown;
    console.log(`    ${fname}: ${total} total — ${stats.rlsBound} RLS, ${stats.internal} internal, ${stats.unknown} unknown`);
    if (stats.unknownIds.length > 0) {
      console.log(`      UNKNOWN IDs: ${stats.unknownIds.join(', ')}`);
    }
  }

  // ── Validation Results ─────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VALIDATION RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalMissing = 0;

  for (const [num, section] of Object.entries(results)) {
    const errs = section.errors.length;
    const warns = section.warnings.length;
    const miss = section.missing ? section.missing.length : 0;
    totalErrors += errs;
    totalWarnings += warns;
    totalMissing += miss;

    let status;
    if (errs > 0) {
      status = `${errs} ERROR${errs > 1 ? 'S' : ''}`;
      if (warns > 0) status += `, ${warns} WARNING${warns > 1 ? 'S' : ''}`;
      if (miss > 0) status += `, ${miss} MISSING`;
    } else if (miss > 0) {
      status = `${miss} MISSING`;
      if (warns > 0) status += `, ${warns} WARNING${warns > 1 ? 'S' : ''}`;
    } else if (warns > 0) {
      status = `${warns} WARNING${warns > 1 ? 'S' : ''}`;
    } else {
      status = 'PASS';
    }

    const pad = '.'.repeat(Math.max(1, 35 - section.name.length));
    console.log(`  Section ${num.toString().padStart(2)}: ${section.name} ${pad} ${status}`);

    for (const e of section.errors) console.log(`    ERROR: ${e}`);
    for (const w of section.warnings) console.log(`    WARN:  ${w}`);
    if (section.missing) {
      for (const m of section.missing) console.log(`    MISSING: ${m}`);
    }
  }

  // Category summaries
  const categories = { submission: { errors: 0, warnings: 0 }, crm: { errors: 0, warnings: 0 },
                       viewer: { errors: 0, warnings: 0 }, search: { errors: 0, warnings: 0 } };
  // We don't easily split by category from the current results, so just report totals

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${totalErrors} ERROR${totalErrors !== 1 ? 'S' : ''}, ${totalWarnings} WARNING${totalWarnings !== 1 ? 'S' : ''}, ${totalMissing} MISSING`);
  console.log(`  UNKNOWN: ${classification.unknown} (MUST be 0)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── HTML Report ────────────────────────────────────────────────────────
  if (process.argv.includes('--html')) {
    const reportPath = path.join(REPO_ROOT, 'public', 'rls-report.html');
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const passAll = totalErrors === 0 && totalMissing === 0 && classification.unknown === 0;
    const numSections = Object.keys(results).length;

    let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RLS Compliance Report v2</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}
.container{max-width:1100px;margin:0 auto}
h1{font-size:1.5rem;font-weight:700;margin-bottom:.25rem;color:#f8fafc}
.subtitle{color:#94a3b8;font-size:.875rem;margin-bottom:1.5rem}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:9999px;font-size:.75rem;font-weight:700;letter-spacing:.05em}
.badge-pass{background:#065f46;color:#6ee7b7}
.badge-fail{background:#7f1d1d;color:#fca5a5}
.badge-warn{background:#78350f;color:#fcd34d}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;margin:1.5rem 0}
.stat{background:#1e293b;border-radius:.75rem;padding:1rem;text-align:center;border:1px solid #334155}
.stat-num{font-size:2rem;font-weight:800}
.stat-label{font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-top:.25rem}
.stat-err .stat-num{color:#f87171}
.stat-warn .stat-num{color:#fbbf24}
.stat-pass .stat-num{color:#34d399}
.stat-miss .stat-num{color:#a78bfa}
.stat-info .stat-num{color:#60a5fa}
.section{background:#1e293b;border-radius:.75rem;margin-bottom:1rem;border:1px solid #334155;overflow:hidden}
.section-header{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;cursor:pointer;user-select:none}
.section-header:hover{background:#253349}
.section-title{font-weight:600;font-size:.95rem}
.section-body{padding:0 1.25rem 1rem;display:none}
.section.open .section-body{display:block}
.item{padding:.4rem .75rem;border-radius:.375rem;font-size:.8rem;font-family:'SF Mono',Consolas,monospace;margin:.25rem 0;word-break:break-all}
.item-err{background:#3b1111;color:#fca5a5;border-left:3px solid #ef4444}
.item-warn{background:#3b2e11;color:#fcd34d;border-left:3px solid #f59e0b}
.item-miss{background:#2e1b4e;color:#c4b5fd;border-left:3px solid #8b5cf6}
.item-pass{background:#0b3d2e;color:#6ee7b7;border-left:3px solid #10b981}
.item-info{background:#1e293b;color:#93c5fd;border-left:3px solid #3b82f6}
.chevron{transition:transform .2s;font-size:.8rem}
.section.open .chevron{transform:rotate(90deg)}
.timestamp{color:#64748b;font-size:.75rem;margin-top:2rem;text-align:center}
.class-summary{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.25rem;margin:1.5rem 0}
.class-summary h2{font-size:1rem;font-weight:700;margin-bottom:.75rem;color:#f8fafc}
.class-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.5rem}
.class-item{display:flex;justify-content:space-between;font-size:.85rem;padding:.25rem .5rem;border-radius:.25rem;background:#0f172a}
.class-label{color:#94a3b8}
.class-val{font-weight:700}
</style></head><body>
<div class="container">
<h1>REBNY RLS Compliance Report v2</h1>
<p class="subtitle">Mallan Real Estate Inc. — License #10991205323 &nbsp; <span class="badge ${passAll ? 'badge-pass' : 'badge-fail'}">${passAll ? 'ALL PASS' : 'ISSUES FOUND'}</span></p>
<div class="stats">
<div class="stat ${totalErrors > 0 ? 'stat-err' : 'stat-pass'}"><div class="stat-num">${totalErrors}</div><div class="stat-label">Errors</div></div>
<div class="stat ${totalWarnings > 0 ? 'stat-warn' : 'stat-pass'}"><div class="stat-num">${totalWarnings}</div><div class="stat-label">Warnings</div></div>
<div class="stat ${totalMissing > 0 ? 'stat-miss' : 'stat-pass'}"><div class="stat-num">${totalMissing}</div><div class="stat-label">Missing</div></div>
<div class="stat ${classification.unknown > 0 ? 'stat-err' : 'stat-pass'}"><div class="stat-num">${classification.unknown}</div><div class="stat-label">Unknown</div></div>
<div class="stat stat-info"><div class="stat-num">${classification.rlsBound}</div><div class="stat-label">RLS Bound</div></div>
<div class="stat stat-info"><div class="stat-num">${classification.internal}</div><div class="stat-label">Internal</div></div>
<div class="stat stat-pass"><div class="stat-num">${Object.values(results).filter(s => s.errors.length === 0 && (!s.missing || s.missing.length === 0)).length}/${numSections}</div><div class="stat-label">Sections Pass</div></div>
</div>

<div class="class-summary">
<h2>Classification Summary</h2>
<div class="class-grid">
<div class="class-item"><span class="class-label">RLS_BOUND</span><span class="class-val" style="color:#34d399">${classification.rlsBound}</span></div>
<div class="class-item"><span class="class-label">INTERNAL_ONLY</span><span class="class-val" style="color:#60a5fa">${classification.internal}</span></div>
<div class="class-item"><span class="class-label">UNKNOWN</span><span class="class-val" style="color:${classification.unknown > 0 ? '#f87171' : '#34d399'}">${classification.unknown}</span></div>
<div class="class-item"><span class="class-label">Layer 0 (data-rls-ignore)</span><span class="class-val">${classification.byLayer[0]}</span></div>
<div class="class-item"><span class="class-label">Layer 1 (data-rls-field)</span><span class="class-val">${classification.byLayer[1]}</span></div>
<div class="class-item"><span class="class-label">Layer 2 (alias/exact)</span><span class="class-val">${classification.byLayer[2]}</span></div>
<div class="class-item"><span class="class-label">Layer 3 (prefix strip)</span><span class="class-val">${classification.byLayer[3]}</span></div>
<div class="class-item"><span class="class-label">Layer 4 (FAIL)</span><span class="class-val" style="color:${classification.byLayer[4] > 0 ? '#f87171' : '#34d399'}">${classification.byLayer[4]}</span></div>
</div>
</div>\n`;

    for (const [num, section] of Object.entries(results)) {
      const errs = section.errors.length;
      const warns = section.warnings.length;
      const miss = section.missing ? section.missing.length : 0;
      const isPass = errs === 0 && miss === 0;
      const hasItems = errs + warns + miss > 0;
      const badgeClass = errs > 0 ? 'badge-fail' : miss > 0 ? 'badge-fail' : warns > 0 ? 'badge-warn' : 'badge-pass';
      const badgeText = errs > 0 ? `${errs} ERR` : miss > 0 ? `${miss} MISS` : warns > 0 ? `${warns} WARN` : 'PASS';

      html += `<div class="section${!hasItems ? ' open' : ''}">
<div class="section-header" onclick="this.parentElement.classList.toggle('open')">
<span class="section-title">Section ${num}: ${section.name}</span>
<span><span class="badge ${badgeClass}">${badgeText}</span> <span class="chevron">&#9654;</span></span>
</div><div class="section-body">\n`;

      if (errs === 0 && warns === 0 && miss === 0) {
        html += `<div class="item item-pass">All checks passed.</div>\n`;
      }
      for (const e of section.errors) {
        html += `<div class="item item-err">${e.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>\n`;
      }
      for (const w of section.warnings) {
        html += `<div class="item item-warn">${w.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>\n`;
      }
      if (section.missing) {
        for (const m of section.missing) {
          html += `<div class="item item-miss">${m.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>\n`;
        }
      }
      html += `</div></div>\n`;
    }

    html += `<p class="timestamp">Generated: ${now} ET | Source: validate-rls-compliance.js v2 (attribute-first)</p>
</div></body></html>`;

    fs.writeFileSync(reportPath, html, 'utf8');
    console.log(`  HTML report → ${reportPath}`);
  }

  const exitCode = (totalErrors > 0 || classification.unknown > 0) ? 1 : 0;
  process.exit(exitCode);
}

main();
