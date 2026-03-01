#!/usr/bin/env node
/**
 * audit-trestle-schema.js — Cross-reference CRM files against MASTER_REGISTRY
 *
 * Now reads from data/MASTER_REGISTRY.json (single source of truth) instead
 * of raw Trestle schema + CSV picklist files.
 *
 * Checks:
 * 1. data-field attributes → match valid REBNY/Trestle field names?
 * 2. RESO field references → do mapped fields exist?
 * 3. Enum/picklist values → match valid REBNY enum values?
 * 4. data-field + data-value pairs → valid enum combinations?
 * 5. REBNY required field coverage
 * 6. Field type usage breakdown
 * 7. Cross-file property type consistency
 * 8. Known corrections check
 */

const fs = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────────────────

const PROJECT = path.resolve(__dirname, '..');
const OLD_DIR = path.resolve(PROJECT, '..', '1', 'Old');

const REGISTRY_PATH = path.join(PROJECT, 'data', 'MASTER_REGISTRY.json');

const FILES = {
  search: path.join(OLD_DIR, 'SEARCH-STANDALONE.html'),
  sale:   path.join(OLD_DIR, 'SALE-FORM-REDESIGN.html'),
  rental: path.join(OLD_DIR, 'RENTAL-FORM-REDESIGN.html'),
};

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  red:     s => `\x1b[31m${s}\x1b[0m`,
  green:   s => `\x1b[32m${s}\x1b[0m`,
  yellow:  s => `\x1b[33m${s}\x1b[0m`,
  cyan:    s => `\x1b[36m${s}\x1b[0m`,
  bold:    s => `\x1b[1m${s}\x1b[0m`,
  dim:     s => `\x1b[2m${s}\x1b[0m`,
};

// ── Load MASTER_REGISTRY ──────────────────────────────────────────────────────

console.log(C.bold('\n  REBNY Schema Audit (via MASTER_REGISTRY)\n'));

if (!fs.existsSync(REGISTRY_PATH)) {
  console.log(C.red('  ERROR: data/MASTER_REGISTRY.json not found.'));
  console.log(C.dim('  Run: node scripts/generate-master-registry.js\n'));
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
const { fields, enums, corrections, statusMapping, propertyTypeDecomposition, complianceGates } = registry;

// Build lookup maps
const fieldNames = new Set(Object.keys(fields));
const fieldNamesLower = new Map();
for (const name of fieldNames) {
  fieldNamesLower.set(name.toLowerCase(), name);
}

// Build enum value sets for quick lookup
const enumValueSets = new Map(); // enumName -> Set of values
for (const [enumName, enumObj] of Object.entries(enums)) {
  enumValueSets.set(enumName, new Set(enumObj.values.map(v => v.value)));
}

console.log(C.dim(`  ${fieldNames.size} fields, ${Object.keys(enums).length} enums loaded from MASTER_REGISTRY`));
console.log(C.dim(`  Generated: ${registry._meta.generated}\n`));

// ── REBNY required fields ────────────────────────────────────────────────────

const REBNY_REQUIRED = {
  sale: [
    'ListPrice', 'StandardStatus', 'PropertyType', 'PropertySubType',
    'StreetAddress', 'UnitNumber', 'PostalCode', 'City', 'StateOrProvince',
    'BedroomsTotal', 'BathroomsTotalInteger',
    'LivingArea', 'ListAgentFullName', 'ListAgentMlsId',
    'ListOfficeName', 'ListOfficeMlsId', 'PublicRemarks',
    'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN',
    'OnMarketDate', 'ListingAgreement', 'CommonInterest',
    'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
    'PhotosCount', 'ListingId', 'ListingKey',
    'TaxAnnualAmount', 'AssociationFee',
    'YearBuilt', 'StoriesTotal', 'ParkingFeatures',
    'Heating', 'Cooling', 'Appliances',
  ],
  rental: [
    'ListPrice', 'StandardStatus', 'PropertyType', 'PropertySubType',
    'StreetAddress', 'UnitNumber', 'PostalCode', 'City', 'StateOrProvince',
    'BedroomsTotal', 'BathroomsTotalInteger',
    'LivingArea', 'ListAgentFullName', 'ListAgentMlsId',
    'ListOfficeName', 'ListOfficeMlsId', 'PublicRemarks',
    'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN',
    'OnMarketDate', 'ListingAgreement', 'CommonInterest',
    'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
    'PhotosCount', 'ListingId', 'ListingKey',
    'PetsAllowed', 'Heating', 'Cooling',
    'AvailabilityDate',
  ],
  search: [
    'ListPrice', 'StandardStatus', 'PropertyType', 'PropertySubType',
    'BedroomsTotal', 'BathroomsTotalInteger', 'LivingArea',
    'CommonInterest', 'InternetEntireListingDisplayYN',
    'ListAgentFullName', 'ListOfficeName',
    'DaysOnMarket', 'OnMarketDate',
    'PostalCode', 'PublicRemarks',
    'ListingId', 'ListingKey',
    'Latitude', 'Longitude',
  ],
};

// ── Extraction helpers ───────────────────────────────────────────────────────

function extractDataFields(content) {
  const result = new Set();
  const regex = /data-field="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) result.add(match[1]);
  return result;
}

function extractDataValues(content) {
  const values = [];
  // data-field before data-value
  let regex = /data-field="([^"]+)"[^>]*data-value="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    values.push({ field: match[1], value: match[2] });
  }
  // data-value before data-field
  regex = /data-value="([^"]+)"[^>]*data-field="([^"]+)"/g;
  while ((match = regex.exec(content)) !== null) {
    values.push({ field: match[2], value: match[1] });
  }
  return values;
}

function extractResoFieldRefs(content) {
  const entries = new Map();
  const mapRegex = /['"]?(\w+)['"]?\s*:\s*['"]([A-Z]\w+)['"]/g;
  let match;
  while ((match = mapRegex.exec(content)) !== null) {
    const fieldName = match[2];
    if (fieldNames.has(fieldName) || fieldNamesLower.has(fieldName.toLowerCase())) {
      entries.set(match[1], fieldName);
    }
  }
  const commentRegex = /RESO:\s*[`']?(\w+)[`']?/g;
  while ((match = commentRegex.exec(content)) !== null) {
    entries.set('comment:' + match[1], match[1]);
  }
  return entries;
}

function extractCheckboxValuesNear(content, fieldContext) {
  const values = new Set();
  const sectionRegex = new RegExp(`${fieldContext}[\\s\\S]{0,2000}`, 'g');
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(content)) !== null) {
    const section = sectionMatch[0].substring(0, 2000);
    const valueRegex = /value="([A-Z]\w+)"/g;
    let m;
    while ((m = valueRegex.exec(section)) !== null) {
      if (m[1].length > 2) values.add(m[1]);
    }
  }
  return values;
}

// ── Audit specific enums against REBNY values ────────────────────────────────

function auditEnums(content) {
  const findings = [];

  // PropertyType — REBNY only allows Residential and ResidentialLease
  const ptValues = enumValueSets.get('PropertyType');
  if (ptValues) {
    const ptRegex = /PropertyType['":\s]+['"]?(Residential|Commercial|Land|ResidentialIncome|BusinessOpportunity|Farm|CommercialLease|ResidentialLease)['"]?/gi;
    let m;
    const found = new Set();
    while ((m = ptRegex.exec(content)) !== null) found.add(m[1]);
    for (const v of found) {
      if (!ptValues.has(v)) {
        findings.push({ type: 'FAIL', msg: `PropertyType "${v}" — NOT a valid REBNY value (only: ${[...ptValues].join(', ')})` });
      }
    }
  }

  // CommonInterest — check for 'Cooperative' (should be 'StockCooperative')
  const ciValues = enumValueSets.get('CommonInterest');
  if (ciValues) {
    const ciNames = ['Condominium', 'Cooperative', 'Condop', 'StockCooperative', 'None',
      'CommunityApartment', 'RentalBuilding', 'Timeshare'];
    for (const name of ciNames) {
      if (content.includes(`"${name}"`) || content.includes(`'${name}'`)) {
        if (!ciValues.has(name)) {
          findings.push({ type: 'FAIL', msg: `CommonInterest "${name}" — NOT a valid REBNY value` });
        }
      }
    }
  }

  // Heating — check for cross-contamination with Cooling values
  const heatingValues = enumValueSets.get('Heating');
  const coolingValues = enumValueSets.get('Cooling');
  if (heatingValues) {
    const heatingSection = extractCheckboxValuesNear(content, 'Heating');
    for (const v of heatingSection) {
      if (v === 'Yes' || v === 'No') continue;
      if (!heatingValues.has(v)) {
        const inCooling = coolingValues && coolingValues.has(v);
        const msg = inCooling
          ? `Heating value "${v}" is actually a Cooling value (cross-contamination)`
          : `Heating value "${v}" not in REBNY Heating enum`;
        findings.push({ type: inCooling ? 'FAIL' : 'WARN', msg });
      }
    }
  }

  if (coolingValues) {
    const coolingSection = extractCheckboxValuesNear(content, 'Cooling');
    for (const v of coolingSection) {
      if (v === 'Yes' || v === 'No') continue;
      if (!coolingValues.has(v)) {
        const inHeating = heatingValues && heatingValues.has(v);
        const msg = inHeating
          ? `Cooling value "${v}" is actually a Heating value (cross-contamination)`
          : `Cooling value "${v}" not in REBNY Cooling enum`;
        findings.push({ type: inHeating ? 'FAIL' : 'WARN', msg });
      }
    }
  }

  return findings;
}

// ── Helper: find closest field name ──────────────────────────────────────────

function findClosest(name) {
  const lower = name.toLowerCase();
  let best = null;
  let bestDist = Infinity;

  for (const key of fieldNames) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(lower) || lower.includes(keyLower)) {
      const dist = Math.abs(key.length - name.length);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    }
  }

  if (!best) {
    for (const key of fieldNames) {
      if (key.toLowerCase().startsWith(lower.substring(0, 5))) {
        return key;
      }
    }
  }

  return best;
}

// ── Run audit per file ───────────────────────────────────────────────────────

let totalWarns = 0;
let totalFails = 0;

for (const [key, filePath] of Object.entries(FILES)) {
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  console.log(`\n  ${C.bold(C.cyan(`${label} File`))} — ${path.basename(filePath)}`);
  console.log(`  ${'═'.repeat(60)}`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ${C.red('MISSING')} — File not found\n`);
    totalFails++;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // ── 1. data-field audit ──────────────────────────────────────────────────

  console.log(`\n  ${C.bold('1. data-field Attribute Audit')}`);
  const dataFields = extractDataFields(content);
  let validFields = 0;
  const invalidFields = [];
  const closeMatches = [];

  for (const field of dataFields) {
    if (fieldNames.has(field)) {
      validFields++;
    } else {
      const lower = field.toLowerCase();
      if (fieldNamesLower.has(lower)) {
        closeMatches.push({ used: field, correct: fieldNamesLower.get(lower) });
      } else {
        invalidFields.push(field);
      }
    }
  }

  console.log(`     ${C.green(`${validFields} valid`)} REBNY/Trestle fields referenced via data-field`);

  if (closeMatches.length > 0) {
    console.log(`     ${C.yellow(`${closeMatches.length} case mismatch(es):`)}`);
    for (const cm of closeMatches) {
      console.log(`       ${C.yellow('~')} "${cm.used}" → should be "${cm.correct}"`);
      totalWarns++;
    }
  }

  if (invalidFields.length > 0) {
    // Separate CRM-internal from genuinely wrong
    const crmInternal = invalidFields.filter(f => /^[a-z]/.test(f) || /^(MlsStatus|CrossListing)$/i.test(f));
    const genuinelyWrong = invalidFields.filter(f => crmInternal.indexOf(f) === -1);

    if (genuinelyWrong.length > 0) {
      console.log(`     ${C.yellow(`${genuinelyWrong.length} non-registry field(s):`)}`);
      for (const f of genuinelyWrong.slice(0, 15)) {
        const suggestion = findClosest(f);
        const sug = suggestion ? C.dim(` → did you mean "${suggestion}"?`) : '';
        console.log(`       ${C.yellow('?')} "${f}"${sug}`);
        totalWarns++;
      }
      if (genuinelyWrong.length > 15) {
        console.log(`       ${C.dim(`... and ${genuinelyWrong.length - 15} more`)}`);
      }
    }

    if (crmInternal.length > 0) {
      console.log(`     ${C.dim(`${crmInternal.length} CRM-internal field(s) (acceptable)`)}`);
    }
  }

  if (dataFields.size === 0) {
    console.log(`     ${C.dim('No data-field attributes found (form uses id-based fields)')}`);
  }

  // ── 2. RESO field references ───────────────────────────────────────────

  console.log(`\n  ${C.bold('2. RESO Field References')}`);
  const resoRefs = extractResoFieldRefs(content);
  let validReso = 0;
  const invalidReso = [];

  for (const [internalKey, resoField] of resoRefs) {
    if (fieldNames.has(resoField) || fieldNamesLower.has(resoField.toLowerCase())) {
      validReso++;
    } else {
      invalidReso.push({ internal: internalKey, reso: resoField });
    }
  }

  console.log(`     ${C.green(`${validReso} valid`)} RESO field references`);
  if (invalidReso.length > 0) {
    console.log(`     ${C.yellow(`${invalidReso.length} unmatched:`)}`);
    for (const r of invalidReso.slice(0, 10)) {
      const suggestion = findClosest(r.reso);
      const sug = suggestion ? C.dim(` → closest: "${suggestion}"`) : '';
      console.log(`       ${C.yellow('?')} ${r.internal} → "${r.reso}"${sug}`);
      totalWarns++;
    }
  }

  // ── 3. Enum/picklist value audit ───────────────────────────────────────

  console.log(`\n  ${C.bold('3. Enum/Picklist Value Audit (REBNY authority)')}`);
  const enumFindings = auditEnums(content);

  if (enumFindings.length === 0) {
    console.log(`     ${C.green('All checked enum values match REBNY picklists')}`);
  } else {
    for (const f of enumFindings) {
      const icon = f.type === 'FAIL' ? C.red('FAIL') : C.yellow('WARN');
      console.log(`     ${icon}  ${f.msg}`);
      if (f.type === 'FAIL') totalFails++;
      else totalWarns++;
    }
  }

  // ── 4. data-field + data-value pairs ───────────────────────────────────

  console.log(`\n  ${C.bold('4. data-field + data-value Pair Audit')}`);
  const dataValues = extractDataValues(content);

  if (dataValues.length > 0) {
    let validPairs = 0;
    const invalidPairs = [];

    for (const { field, value } of dataValues) {
      const fieldObj = fields[field];
      if (!fieldObj) continue;

      if (fieldObj.isEnum || fieldObj.isMultiEnum) {
        const enumType = fieldObj.dataType;
        const validValues = enumValueSets.get(enumType);
        if (validValues) {
          if (validValues.has(value)) {
            validPairs++;
          } else {
            invalidPairs.push({ field, value, enumType });
          }
        }
      } else {
        validPairs++;
      }
    }

    console.log(`     ${C.green(`${validPairs} valid`)} data-field/data-value pairs`);
    if (invalidPairs.length > 0) {
      console.log(`     ${C.yellow(`${invalidPairs.length} invalid value(s):`)}`);
      for (const p of invalidPairs.slice(0, 15)) {
        console.log(`       ${C.yellow('!')} ${p.field} = "${p.value}" — not in ${p.enumType} enum`);
        totalWarns++;
      }
      if (invalidPairs.length > 15) {
        console.log(`       ${C.dim(`... and ${invalidPairs.length - 15} more`)}`);
      }
    }
  } else {
    console.log(`     ${C.dim('No data-field/data-value pairs found')}`);
  }

  // ── 5. REBNY required field coverage ───────────────────────────────────

  console.log(`\n  ${C.bold('5. REBNY Required Field Coverage')}`);
  const requiredFields = REBNY_REQUIRED[key] || [];
  let covered = 0;
  const missing = [];

  for (const field of requiredFields) {
    if (content.includes(field) || content.toLowerCase().includes(field.toLowerCase())) {
      covered++;
    } else {
      missing.push(field);
    }
  }

  const pct = requiredFields.length > 0 ? Math.round((covered / requiredFields.length) * 100) : 100;
  const pctColor = pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red;
  console.log(`     ${pctColor(`${covered}/${requiredFields.length} (${pct}%)`)} REBNY required fields present`);

  if (missing.length > 0) {
    console.log(`     ${C.yellow('Missing:')}`);
    for (const m of missing) {
      const fieldObj = fields[m];
      const type = fieldObj ? `(${fieldObj.dataType || 'unknown'})` : '';
      console.log(`       ${C.red('x')} ${m} ${C.dim(type)}`);
      totalWarns++;
    }
  }

  // ── 6. Field type usage breakdown ──────────────────────────────────────

  console.log(`\n  ${C.bold('6. Field Type Usage')}`);
  let enumFieldCount = 0;
  let multiEnumCount = 0;
  const typeCounts = {};

  for (const field of dataFields) {
    const fieldObj = fields[field];
    if (!fieldObj) continue;
    if (fieldObj.isEnum) enumFieldCount++;
    if (fieldObj.isMultiEnum) multiEnumCount++;
    const dt = fieldObj.dataType || 'unknown';
    typeCounts[dt] = (typeCounts[dt] || 0) + 1;
  }

  if (enumFieldCount > 0 || multiEnumCount > 0) {
    console.log(`     ${C.green(enumFieldCount)} enum fields, ${C.green(multiEnumCount)} multi-enum fields`);
  }
  if (Object.keys(typeCounts).length > 0) {
    const typeStr = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t}(${c})`)
      .join(', ');
    console.log(`     ${C.dim(`Types: ${typeStr}`)}`);
  }
}

// ── Cross-file consistency ────────────────────────────────────────────────────

console.log(`\n  ${C.bold(C.cyan('Cross-File Consistency'))}`);
console.log(`  ${'═'.repeat(60)}`);

// Property type radios from sale and rental forms
if (fs.existsSync(FILES.sale) && fs.existsSync(FILES.rental)) {
  const saleContent = fs.readFileSync(FILES.sale, 'utf-8');
  const rentalContent = fs.readFileSync(FILES.rental, 'utf-8');

  const saleTypes = new Set();
  const rentalTypes = new Set();

  let m;
  const saleTypeRegex = /name="salePropertyType"[^>]*value="([^"]+)"/g;
  const rentalTypeRegex = /name="rentalPropertyType"[^>]*value="([^"]+)"/g;

  while ((m = saleTypeRegex.exec(saleContent)) !== null) saleTypes.add(m[1]);
  while ((m = rentalTypeRegex.exec(rentalContent)) !== null) rentalTypes.add(m[1]);

  console.log(`\n  ${C.bold('Property Type Radios')}`);
  console.log(`     Sale: ${saleTypes.size} types — ${[...saleTypes].join(', ')}`);
  console.log(`     Rental: ${rentalTypes.size} types — ${[...rentalTypes].join(', ')}`);

  const saleOnly = [...saleTypes].filter(function(t) { return !rentalTypes.has(t); });
  const rentalOnly = [...rentalTypes].filter(function(t) { return !saleTypes.has(t); });
  if (saleOnly.length > 0) console.log(`     ${C.dim(`Sale-only: ${saleOnly.join(', ')}`)}`);
  if (rentalOnly.length > 0) console.log(`     ${C.dim(`Rental-only: ${rentalOnly.join(', ')}`)}`);
}

// ── Verify property type decomposition against REBNY enums ───────────────────

console.log(`\n  ${C.bold('Property Type Decomposition Check')}`);
const ptEnum = enumValueSets.get('PropertyType');
const ciEnum = enumValueSets.get('CommonInterest');
const pstEnum = enumValueSets.get('PropertySubType');

let decompPass = 0;
let decompFail = 0;

for (const [alias, decomp] of Object.entries(propertyTypeDecomposition)) {
  const checks = [];
  if (ptEnum && !ptEnum.has(decomp.PropertyType)) {
    checks.push(`PropertyType="${decomp.PropertyType}" invalid`);
  }
  if (ciEnum && decomp.CommonInterest !== '[dynamic]' && !ciEnum.has(decomp.CommonInterest)) {
    checks.push(`CommonInterest="${decomp.CommonInterest}" invalid`);
  }
  if (pstEnum && !pstEnum.has(decomp.PropertySubType)) {
    checks.push(`PropertySubType="${decomp.PropertySubType}" invalid`);
  }

  if (checks.length === 0) {
    decompPass++;
  } else {
    console.log(`     ${C.red('FAIL')}  ${alias}: ${checks.join(', ')}`);
    decompFail++;
    totalFails++;
  }
}

if (decompFail === 0) {
  console.log(`     ${C.green(`All ${decompPass} decompositions valid against REBNY enums`)}`);
}

// ── Known corrections check ──────────────────────────────────────────────────

console.log(`\n  ${C.bold('Known Corrections (from MASTER_REGISTRY)')}`);
for (const corr of corrections) {
  const icon = corr.severity === 'critical' ? C.red('CRIT') :
               corr.severity === 'high' ? C.yellow('HIGH') :
               corr.severity === 'medium' ? C.cyan('MED ') : C.dim('LOW ');
  console.log(`     ${icon}  [${corr.id}] ${corr.description}`);
}

// ── Compliance gates ─────────────────────────────────────────────────────────

console.log(`\n  ${C.bold('Compliance Gates')}`);
for (const gate of complianceGates) {
  const fieldObj = fields[gate.field];
  const present = fieldObj ? C.green('IN REGISTRY') : C.red('MISSING');
  console.log(`     ${present}  ${gate.field} — ${gate.rule}`);
  if (!fieldObj) totalFails++;
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n  ${'═'.repeat(60)}`);
console.log(C.bold('\n  AUDIT SUMMARY\n'));

console.log(`  Data source:       MASTER_REGISTRY.json (v${registry._meta.version})`);
console.log(`  REBNY fields:      ${registry._meta.stats.totalFields}`);
console.log(`  REBNY enums:       ${registry._meta.stats.totalEnums} (${registry._meta.stats.totalPicklistValues} values)`);
console.log(`  Files audited:     ${Object.keys(FILES).length} (${Object.keys(FILES).join(', ')})`);
console.log(`  Warnings:          ${totalWarns}`);
console.log(`  Critical failures: ${totalFails}`);

if (totalFails === 0 && totalWarns < 10) {
  console.log(`\n  ${C.green('RESULT: PASS')} — Good REBNY schema alignment\n`);
} else if (totalFails === 0) {
  console.log(`\n  ${C.yellow(`RESULT: PASS with ${totalWarns} warnings`)} — Review above\n`);
} else {
  console.log(`\n  ${C.red('RESULT: FAIL')} — ${totalFails} critical issue(s) found\n`);
}
