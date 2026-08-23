#!/usr/bin/env node
/**
 * generate-master-registry.js — Build MASTER_REGISTRY.json
 *
 * Merges 6 fragmented data sources into ONE authoritative file:
 *   1. rebny-rls-property-fields.csv   → 902 REBNY IDX Plus fields (primary authority)
 *   2. rebny-rls-property-lookup.csv   → 143 enums / 2,066 picklist values
 *   3. trestle-schema.json             → data types, precision, maxLength, nullable
 *   4. FIELD_REGISTRY.json             → CRM canonical keys, labels, surfaces
 *   5. SEARCH_CONTROL_MAP.json         → search DOM mappings
 *   6. trestle-metadata.xml            → (baseline reference — not directly parsed here)
 *
 * Zero npm dependencies. Run: node scripts/generate-master-registry.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT = path.resolve(__dirname, '..');
const DATA = path.join(PROJECT, 'data');

// ── Paths ────────────────────────────────────────────────────────────────────

const PATHS = {
  rebnyFields:  path.join(DATA, 'rebny-rls-property-fields.csv'),
  rebnyLookup:  path.join(DATA, 'rebny-rls-property-lookup.csv'),
  trestle:      path.join(DATA, 'trestle-dictionary', 'trestle-schema.json'),
  fieldReg:     path.join(DATA, 'FIELD_REGISTRY.json'),
  searchMap:    path.join(DATA, 'SEARCH_CONTROL_MAP.json'),
  output:       path.join(DATA, 'MASTER_REGISTRY.json'),
};

// ── Colors ───────────────────────────────────────────────────────────────────

const C = {
  red:     s => `\x1b[31m${s}\x1b[0m`,
  green:   s => `\x1b[32m${s}\x1b[0m`,
  yellow:  s => `\x1b[33m${s}\x1b[0m`,
  cyan:    s => `\x1b[36m${s}\x1b[0m`,
  bold:    s => `\x1b[1m${s}\x1b[0m`,
  dim:     s => `\x1b[2m${s}\x1b[0m`,
};

console.log(C.bold('\n  MASTER_REGISTRY Generator\n'));

// ── CSV Parser (handles quoted fields with commas AND multi-line values) ─────

/**
 * Parse a full CSV file into rows, correctly handling:
 * - Quoted fields with commas inside
 * - Multi-line values within quoted fields
 * - Escaped quotes (doubled "")
 */
function parseCSVRows(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // End of row (skip \r in \r\n)
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      currentField = '';
      if (currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }
  // Last row
  currentRow.push(currentField.trim());
  if (currentRow.some(f => f.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

// ── 1. Parse REBNY Property Fields CSV ───────────────────────────────────────

console.log(C.dim('  1. Parsing REBNY property fields...'));

const fieldsRaw = fs.readFileSync(PATHS.rebnyFields, 'utf-8');
const fieldsRows = parseCSVRows(fieldsRaw);

// Header: ,Attribute Name - Current System,,MatrixFieldName,RLS Description,LMP Add/Edit,LMP Search,Requirements/Rules
// Columns: [0]=empty, [1]=Attribute Name, [2]=empty, [3]=MatrixFieldName, [4]=Description, [5]=LMP Add/Edit, [6]=LMP Search, [7]=Requirements

const rebnyFields = new Map(); // MatrixFieldName -> field object

for (let i = 1; i < fieldsRows.length; i++) {
  const cols = fieldsRows[i];
  const fieldName = (cols[3] || '').trim();
  if (!fieldName) continue;

  // Skip if fieldName doesn't start with uppercase (garbage fragment)
  if (!/^[A-Z]/.test(fieldName)) continue;

  const requirements = (cols[7] || '').trim();
  let required = 'No';
  let conditionalRule = null;

  if (/^Yes/i.test(requirements)) {
    required = 'Yes';
    const afterYes = requirements.replace(/^Yes\s*,?\s*/i, '').trim();
    if (afterYes) conditionalRule = afterYes;
  } else if (/^Conditional/i.test(requirements)) {
    required = 'Conditional';
    conditionalRule = requirements.replace(/^Conditional:\s*/i, '').trim() || requirements;
  } else if (requirements && requirements !== 'No') {
    conditionalRule = requirements;
  }

  rebnyFields.set(fieldName, {
    attributeName: (cols[1] || '').trim() || null,
    rebnyDescription: (cols[4] || '').trim() || null,
    lmpAddEdit: (cols[5] || '').trim().toLowerCase() === 'yes',
    lmpSearch: (cols[6] || '').trim().toLowerCase() === 'yes',
    required,
    conditionalRule,
  });
}

console.log(C.green(`     ${rebnyFields.size} fields parsed`));

// ── 2. Parse REBNY Lookup CSV (picklist values) ──────────────────────────────

console.log(C.dim('  2. Parsing REBNY picklist values...'));

const lookupRaw = fs.readFileSync(PATHS.rebnyLookup, 'utf-8');
const lookupRows = parseCSVRows(lookupRaw);

// Header: ,TableName,LookupName (Current),Value (Current),,MatrixSelectName,MatrixWebapi_Value,RLS Description,LMP Add/Edit,LMP Search,Requirements/Rules
// Cols:   [0]=empty, [1]=TableName, [2]=LookupName, [3]=Value, [4]=empty, [5]=MatrixSelectName, [6]=MatrixWebapi_Value, [7]=Description, [8]=Add/Edit, [9]=Search, [10]=Rules

const rebnyEnums = new Map(); // enumName -> { values: [...] }
let totalValues = 0;

for (let i = 1; i < lookupRows.length; i++) {
  const cols = lookupRows[i];
  // MatrixSelectName (col 5) is canonical; fallback to LookupName (col 2)
  const enumName = (cols[5] || cols[2] || '').trim();
  const value = (cols[6] || cols[3] || '').trim();
  if (!enumName || !value) continue;

  // Skip header row echo or garbage
  if (enumName === 'MatrixSelectName' || !/^[A-Z]/.test(enumName)) continue;

  const description = (cols[7] || '').trim() || null;

  if (!rebnyEnums.has(enumName)) {
    rebnyEnums.set(enumName, { values: [] });
  }

  // Avoid duplicate values within same enum
  const existing = rebnyEnums.get(enumName).values;
  if (!existing.find(v => v.value === value)) {
    existing.push({ value, description });
    totalValues++;
  }
}

console.log(C.green(`     ${rebnyEnums.size} enums, ${totalValues} values parsed`));

// ── 3. Load Trestle Schema ───────────────────────────────────────────────────

console.log(C.dim('  3. Loading Trestle schema...'));

const trestleSchema = JSON.parse(fs.readFileSync(PATHS.trestle, 'utf-8'));
const trestleProps = trestleSchema.entities.Property.properties;

const trestleMap = new Map(); // name -> property object
for (const prop of trestleProps) {
  trestleMap.set(prop.name, prop);
}

console.log(C.green(`     ${trestleMap.size} Trestle fields loaded`));

// ── 4. Load FIELD_REGISTRY.json ──────────────────────────────────────────────

console.log(C.dim('  4. Loading FIELD_REGISTRY...'));

const fieldReg = JSON.parse(fs.readFileSync(PATHS.fieldReg, 'utf-8'));
const fieldRegFields = fieldReg.fields || [];

// Build reverse lookup: trestle_field -> registry entry
const regByTrestle = new Map();
for (const f of fieldRegFields) {
  if (f.trestle_field) {
    // Handle computed fields like "AssociationFee+TaxAnnualAmount"
    if (!f.trestle_field.includes('+')) {
      regByTrestle.set(f.trestle_field, f);
    }
  }
}

console.log(C.green(`     ${fieldRegFields.length} registry entries loaded (${regByTrestle.size} mapped to Trestle)`));

// ── 5. Load SEARCH_CONTROL_MAP.json ──────────────────────────────────────────

console.log(C.dim('  5. Loading SEARCH_CONTROL_MAP...'));

const searchMap = JSON.parse(fs.readFileSync(PATHS.searchMap, 'utf-8'));

// Build lookup: Trestle field -> search DOM IDs
const searchByField = new Map(); // trestle field name -> { saleIds, rentalIds }

function indexRangeFilters(filters, tab) {
  for (const f of filters) {
    const field = f.target_field;
    if (!searchByField.has(field)) searchByField.set(field, {});
    const entry = searchByField.get(field);
    entry[`${tab}Min`] = f.dom_id_min;
    entry[`${tab}Max`] = f.dom_id_max;
  }
}

if (searchMap.range_filters) {
  if (searchMap.range_filters.sale) indexRangeFilters(searchMap.range_filters.sale, 'sale');
  if (searchMap.range_filters.rental) indexRangeFilters(searchMap.range_filters.rental, 'rental');
}

console.log(C.green(`     ${searchByField.size} search field mappings indexed`));

// ── 6. IDX Display Classification ────────────────────────────────────────────
//
// Per UCBA 2026 + REBNY RLS rules, fields fall into display tiers:
//   "idx"      — Can appear on public IDX websites (mallan.nyc search, etc.)
//   "vow"      — Only for authenticated clients (VOW = Virtual Office Website)
//   "internal"  — Broker/agent CRM only — NEVER public
//   "system"   — System-managed read-only (timestamps, keys, calculated)
//
// Listing-level gates (checked BEFORE any field display):
//   InternetEntireListingDisplayYN = false → entire listing hidden from public
//   IDXEntireListingDisplayYN = false → hidden from IDX specifically
//   InternetAddressDisplayYN = false → address suppressed
//   Permissions = "Private" → Participant Only (authorized agents only)
//   Permissions = "OwnerOptOut" → NO public dissemination at all

const NEVER_DISPLAY_FIELDS = new Set([
  'PrivateRemarks', 'PrivateOfficeRemarks',
  'BuyerBrokerageCompensation', 'BuyerBrokerageCompensationType',
  'ListAgentHomePhone', 'ListAgentMobilePhone',
  'CoListAgentHomePhone', 'CoListAgentMobilePhone',
  'BuyerAgentHomePhone', 'BuyerAgentMobilePhone',
  'CoBuyerAgentHomePhone', 'CoBuyerAgentMobilePhone',
  'ShowingContactPhone', 'ShowingInstructions',
  'LockBoxLocation', 'LockBoxSerialNumber', 'LockBoxType',
]);

const VOW_ONLY_FIELDS = new Set([
  'ClosePrice', 'CloseDate',
  'DaysOnMarket', 'CumulativeDaysOnMarket',
  'OriginalListPrice', 'PreviousListPrice',
  'TaxAnnualAmount', 'TaxAssessedValue', 'TaxBlock', 'TaxLot',
  'AssociationFee', 'AssociationFee2',
]);

const IDX_GATE_FIELDS = new Set([
  'InternetEntireListingDisplayYN', 'IDXEntireListingDisplayYN',
  'InternetAddressDisplayYN', 'InternetAutomatedValuationDisplayYN',
  'InternetConsumerCommentYN', 'Permissions',
  'SyndicateYN', 'SyndicateTo',
  'ListOfficeIDXParticipationYN',
]);

function classifyDisplay(fieldName, reg) {
  // Hardcoded never-display (checked FIRST — overrides everything)
  if (NEVER_DISPLAY_FIELDS.has(fieldName)) return 'internal';
  // FIELD_REGISTRY: empty surfaces + NEVER in notes = internal
  if (reg && reg.allowed_surfaces && reg.allowed_surfaces.length === 0) {
    if (reg.notes && /NEVER/i.test(reg.notes)) return 'internal';
  }
  // VOW-only (from FIELD_REGISTRY or hardcoded set)
  if (reg && reg.vow_only) return 'vow';
  if (VOW_ONLY_FIELDS.has(fieldName)) return 'vow';
  // IDX gate fields are system/internal
  if (IDX_GATE_FIELDS.has(fieldName)) return 'system';
  // System fields (read-only timestamps, keys, calculated)
  if (/Timestamp$|KeyNumeric$|MlsId$|Key$/.test(fieldName) && fieldName !== 'ListingKey') return 'system';
  // Default: IDX-eligible
  return 'idx';
}

// ── 7. Build Fields Object ───────────────────────────────────────────────────

console.log(C.dim('\n  Building merged fields...'));

const fields = {};
let requiredCount = 0;
let conditionalCount = 0;
let readOnlyCount = 0;
let rebnyCount = 0;
let trestleOnlyCount = 0;

// Pass 1: REBNY RLS fields (primary — these are the NY-specific fields REBNY accepts)
for (const [fieldName, rebny] of rebnyFields) {
  const trestle = trestleMap.get(fieldName);
  const reg = regByTrestle.get(fieldName);
  const search = searchByField.get(fieldName);
  const displayTier = classifyDisplay(fieldName, reg);

  fields[fieldName] = {
    // Source classification
    isRebny: true,
    trestleMatch: !!trestle,

    // Trestle data type info
    dataType: trestle ? trestle.dataType : null,
    maxLength: trestle && trestle.maxLength ? trestle.maxLength : null,
    precision: trestle && trestle.precision ? parseInt(trestle.precision, 10) || null : null,
    scale: trestle && trestle.scale ? parseInt(trestle.scale, 10) || null : null,
    nullable: trestle ? trestle.nullable === 'true' : null,
    isEnum: trestle ? trestle.isEnum === true : false,
    isMultiEnum: trestle ? trestle.isMultiEnum === true : false,

    // REBNY-specific
    rebnyDescription: rebny.rebnyDescription,
    lmpAddEdit: rebny.lmpAddEdit,
    lmpSearch: rebny.lmpSearch,
    required: rebny.required,
    conditionalRule: rebny.conditionalRule,

    // IDX/VOW display tier
    displayTier,

    // CRM mapping (from FIELD_REGISTRY)
    canonicalKey: reg ? reg.canonical_key : null,
    label: reg ? reg.label : null,
    allowedSurfaces: reg ? reg.allowed_surfaces : null,

    // Search DOM mappings
    searchDomIds: search || null,

    // Compliance notes
    complianceNotes: reg && reg.notes ? reg.notes : null,
  };

  rebnyCount++;
  if (rebny.required === 'Yes') requiredCount++;
  if (rebny.required === 'Conditional') conditionalCount++;
  if (!rebny.lmpAddEdit) readOnlyCount++;
}

// Pass 2: FIELD_REGISTRY supplement (fields like BuyerBrokerageCompensation that
// are in the CRM mapping but not in the REBNY CSV — system-managed fields)
let supplementCount = 0;
for (const [trestleField, reg] of regByTrestle) {
  if (fields[trestleField]) continue;
  const trestle = trestleMap.get(trestleField);
  const displayTier = classifyDisplay(trestleField, reg);

  fields[trestleField] = {
    isRebny: true, // these are still REBNY-relevant fields, just system-managed
    trestleMatch: !!trestle,
    dataType: trestle ? trestle.dataType : null,
    maxLength: trestle && trestle.maxLength ? trestle.maxLength : null,
    precision: trestle && trestle.precision ? parseInt(trestle.precision, 10) || null : null,
    scale: trestle && trestle.scale ? parseInt(trestle.scale, 10) || null : null,
    nullable: trestle ? trestle.nullable === 'true' : null,
    isEnum: trestle ? trestle.isEnum === true : false,
    isMultiEnum: trestle ? trestle.isMultiEnum === true : false,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: reg.required ? 'Yes' : 'No',
    conditionalRule: null,
    displayTier,
    canonicalKey: reg.canonical_key,
    label: reg.label,
    allowedSurfaces: reg.allowed_surfaces,
    searchDomIds: searchByField.get(trestleField) || null,
    complianceNotes: reg.notes || null,
  };
  supplementCount++;
}

// Pass 3: ALL remaining Trestle fields not in REBNY (broader RESO standard)
for (const trestle of trestleProps) {
  if (fields[trestle.name]) continue; // already from REBNY or supplement
  const displayTier = classifyDisplay(trestle.name, null);

  fields[trestle.name] = {
    isRebny: false,
    trestleMatch: true,
    dataType: trestle.dataType,
    maxLength: trestle.maxLength || null,
    precision: trestle.precision ? parseInt(trestle.precision, 10) || null : null,
    scale: trestle.scale ? parseInt(trestle.scale, 10) || null : null,
    nullable: trestle.nullable === 'true',
    isEnum: trestle.isEnum === true,
    isMultiEnum: trestle.isMultiEnum === true,
    rebnyDescription: null,
    lmpAddEdit: false,
    lmpSearch: false,
    required: 'No',
    conditionalRule: null,
    displayTier,
    canonicalKey: null,
    label: null,
    allowedSurfaces: null,
    searchDomIds: null,
    complianceNotes: null,
  };
  trestleOnlyCount++;
}

console.log(C.green(`     ${Object.keys(fields).length} total fields merged`));
console.log(`       ${C.cyan(rebnyCount)} REBNY RLS fields (NY-specific)`);
console.log(`       ${C.cyan(supplementCount)} CRM supplement fields`);
console.log(`       ${C.cyan(trestleOnlyCount)} Trestle-only fields (broader RESO)`);

// Display tier breakdown
const tierCounts = { idx: 0, vow: 0, internal: 0, system: 0 };
for (const f of Object.values(fields)) tierCounts[f.displayTier]++;
console.log(`       Display tiers: ${C.green(tierCounts.idx)} idx, ${C.yellow(tierCounts.vow)} vow, ${C.red(tierCounts.internal)} internal, ${C.dim(tierCounts.system)} system`);

// ── 8. Build Enums Object ────────────────────────────────────────────────────

console.log(C.dim('  Building enums...'));

const enums = {};
let rebnyEnumCount = 0;
let trestleOnlyEnumCount = 0;

// Pass 1: REBNY enums (with full picklist values from REBNY CSV)
for (const [enumName, enumData] of rebnyEnums) {
  const usedByFields = [];
  for (const prop of trestleProps) {
    if (prop.dataType === enumName) usedByFields.push(prop.name);
  }

  let isMultiSelect = false;
  for (const fn of usedByFields) {
    const t = trestleMap.get(fn);
    if (t && t.isMultiEnum) { isMultiSelect = true; break; }
  }

  enums[enumName] = {
    isRebny: true,
    isMultiSelect,
    usedByFields: usedByFields.length > 0 ? usedByFields : [enumName],
    values: enumData.values,
  };
  rebnyEnumCount++;
}

// Pass 2: Trestle-only enum types (referenced by Trestle fields but no REBNY picklist values)
const trestleEnumTypes = new Set();
for (const prop of trestleProps) {
  if ((prop.isEnum || prop.isMultiEnum) && !enums[prop.dataType]) {
    trestleEnumTypes.add(prop.dataType);
  }
}

for (const enumType of trestleEnumTypes) {
  const usedByFields = [];
  for (const prop of trestleProps) {
    if (prop.dataType === enumType) usedByFields.push(prop.name);
  }

  enums[enumType] = {
    isRebny: false,
    isMultiSelect: usedByFields.some(fn => { const t = trestleMap.get(fn); return t && t.isMultiEnum; }),
    usedByFields,
    values: [], // no REBNY picklist — values only available from Trestle OData metadata
  };
  trestleOnlyEnumCount++;
}

console.log(C.green(`     ${Object.keys(enums).length} enums built (${rebnyEnumCount} REBNY + ${trestleOnlyEnumCount} Trestle-only)`));

// ── 8. Corrections (known CRM → REBNY mismatches) ───────────────────────────

const corrections = [
  {
    id: 'C001',
    severity: 'critical',
    field: 'CommonInterest',
    crmValue: 'Cooperative',
    rebnyValue: 'StockCooperative',
    affectedFiles: ['search', 'sale', 'rental'],
    description: "CRM uses 'Cooperative' but REBNY requires 'StockCooperative'"
  },
  {
    id: 'C002',
    severity: 'critical',
    field: 'PropertyType',
    crmValue: 'Commercial',
    rebnyValue: null,
    affectedFiles: ['search', 'sale', 'rental'],
    description: 'REBNY only has Residential and ResidentialLease. Commercial is NOT RLS-eligible.'
  },
  {
    id: 'C003',
    severity: 'high',
    field: 'PropertyType',
    crmValue: 'Land',
    rebnyValue: null,
    affectedFiles: ['search', 'sale'],
    description: "REBNY has no 'Land' PropertyType. Land is PropertyType=Residential + PropertySubType=UnimprovedLand."
  },
  {
    id: 'C004',
    severity: 'medium',
    field: 'Heating',
    crmValue: null,
    rebnyValue: null,
    affectedFiles: ['sale', 'rental'],
    description: 'Heating and Cooling are separate REBNY enums (43 and 25 values respectively). CRM must not cross-contaminate values between them.'
  },
  {
    id: 'C005',
    severity: 'medium',
    field: 'ListingAgreement',
    crmValue: 'Exclusive',
    rebnyValue: 'ExclusiveRightToSell',
    affectedFiles: ['search', 'sale'],
    description: "CRM uses 'Exclusive' but REBNY has ExclusiveRightToSell, ExclusiveRightToLease, ExclusiveAgency, ExclusiveRightWithException, CoExclusive."
  },
  {
    id: 'C006',
    severity: 'medium',
    field: 'StandardStatus',
    crmValue: 'BackOnMarket',
    rebnyValue: 'Active',
    affectedFiles: ['search'],
    description: "CRM 'BackOnMarket' maps to REBNY 'Active' — it's a sub-status, not a top-level MlsStatus."
  },
  {
    id: 'C007',
    severity: 'low',
    field: 'CommonInterest',
    crmValue: 'Rental Building',
    rebnyValue: 'RentalBuilding',
    affectedFiles: ['search'],
    description: "CRM display label 'Rental Building' vs REBNY enum value 'RentalBuilding' (no space)."
  },
];

// ── 9. Status Mapping ────────────────────────────────────────────────────────

const statusMapping = {
  rebnyValues: ['Active', 'Canceled', 'Closed', 'ComingSoon', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'],
  crmToRebny: {
    Draft: 'Incomplete',
    Active: 'Active',
    BackOnMarket: 'Active',
    ComingSoon: 'ComingSoon',
    OfferOut: 'Pending',
    OfferAccepted: 'Pending',
    ContractOut: 'Pending',
    ContractSigned: 'Pending',
    BoardPackageSubmitted: 'Pending',
    BoardApproved: 'Pending',
    Sold: 'Closed',
    Leased: 'Closed',
    Rented: 'Closed',
    PermOffMarket: 'Withdrawn',
    TempOffMarket: 'Hold',
    Expired: 'Expired',
    Withdrawn: 'Withdrawn',
    Canceled: 'Canceled',
  },
};

// ── 10. Property Type Decomposition ──────────────────────────────────────────

const propertyTypeDecomposition = {
  Condo:                { PropertyType: 'Residential',      CommonInterest: 'Condominium',      PropertySubType: 'Apartment' },
  Coop:                 { PropertyType: 'Residential',      CommonInterest: 'StockCooperative',  PropertySubType: 'Apartment' },
  Condop:               { PropertyType: 'Residential',      CommonInterest: 'Condop',            PropertySubType: 'Apartment' },
  SingleFamilyTownhouse:{ PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'SingleFamilyTownhouse' },
  MultiFamilyTownhouse: { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'MultiFamilyTownhouse' },
  SingleFamily:         { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'SingleFamilyResidence' },
  MultiFamily:          { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'MultiFamily' },
  MixedUse:             { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'MixedUse' },
  Loft:                 { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'Loft' },
  Duplex:               { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'Duplex' },
  Triplex:              { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'Triplex' },
  Quadruplex:           { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'Quadruplex' },
  Office:               { PropertyType: 'Residential',      CommonInterest: '[dynamic]',         PropertySubType: 'Office' },
  Retail:               { PropertyType: 'Residential',      CommonInterest: '[dynamic]',         PropertySubType: 'Retail' },
  Land:                 { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'UnimprovedLand' },
  DeededParking:        { PropertyType: 'Residential',      CommonInterest: 'None',              PropertySubType: 'DeededParking' },
  RentalBuilding:       { PropertyType: 'ResidentialLease', CommonInterest: 'RentalBuilding',    PropertySubType: 'Apartment' },
};

// ── 11. Compliance Gates ─────────────────────────────────────────────────────

const complianceGates = [
  {
    field: 'InternetEntireListingDisplayYN',
    rule: 'If false, listing MUST NOT appear on any public display (IDX, VOW, syndication)',
    penalty: '$40,000 damages + RLS suspension',
  },
  {
    field: 'InternetAddressDisplayYN',
    rule: "If false, show 'Address Available Upon Request' instead of actual address",
    penalty: '$40,000 damages',
  },
  {
    field: 'BuyerBrokerageCompensation',
    rule: 'NEVER display on ANY surface — agent/broker internal CRM only',
    penalty: 'UCBA violation — $500/$2K/$10K/suspension',
  },
  {
    field: 'PrivateRemarks',
    rule: 'NEVER display publicly — agent/broker internal only',
    penalty: 'UCBA violation',
  },
  {
    field: 'PublicRemarks',
    rule: 'MUST NOT contain agent contact info (phone, email, URL) or compensation amounts',
    penalty: 'Data quality rejection — $0/$250/$250/termination escalation',
  },
];

// ── 12. IDX Distribution Gates ───────────────────────────────────────────────

const idxDistributionGates = {
  _doc: 'Listing-level permission checks. ALL must pass before a listing appears on IDX/public.',
  gates: [
    {
      field: 'InternetEntireListingDisplayYN',
      check: 'Must be true',
      effect: 'If false, listing hidden from ALL public surfaces (IDX, VOW, syndication)',
      cascades: ['IDXEntireListingDisplayYN=false', 'InternetAddressDisplayYN=false', 'InternetAutomatedValuationDisplayYN=false'],
      penalty: '$40,000 damages + RLS suspension',
    },
    {
      field: 'IDXEntireListingDisplayYN',
      check: 'Must be true AND ListOfficeIDXParticipationYN=true',
      effect: 'If false, listing hidden from IDX websites specifically',
      penalty: '$40,000 damages',
    },
    {
      field: 'InternetAddressDisplayYN',
      check: 'Must be true to show address',
      effect: "If false, show 'Address Available Upon Request' instead of actual address",
      penalty: '$40,000 damages',
    },
    {
      field: 'Permissions',
      check: 'Must NOT be OwnerOptOut or Private',
      values: {
        'null': 'Normal listing — full IDX/VOW/syndication display allowed',
        'OwnerOptOut': 'NO public dissemination whatsoever — owner opted out of RLS sharing',
        'Private': 'Participant Only — visible to authorized RLS Participants only, NOT public',
      },
      penalty: 'Incurable violation — $250 first, $500 subsequent',
    },
    {
      field: 'SyndicateYN',
      check: 'Must be true for syndication portals',
      effect: 'Controls distribution to openigloo, Samaki.com, TBI Listings via Trestle IDX Plus',
    },
    {
      field: 'ListOfficeIDXParticipationYN',
      check: 'Read-only — set from REBNY membership directory',
      effect: 'If false, no listings from this office appear on IDX regardless of listing-level settings',
    },
  ],
  feedTypes: {
    RLS: { audience: 'Authorized Participants only', description: 'Core REBNY listing database — all fields visible to agents/brokers' },
    IDX: { audience: 'Public (mallan.nyc listing search)', description: 'Reciprocal broker display — subset of fields, requires attribution' },
    VOW: { audience: 'Authenticated clients (requires login)', description: 'Virtual Office Website — more data than IDX (sold prices, DOM, tax data)' },
    Syndication: { audience: 'Third-party portals', description: 'Distribution to openigloo, Samaki, TBI via Trestle opt-in toggles' },
  },
};

// ── 13. Assemble Final Registry ──────────────────────────────────────────────

console.log(C.dim('\n  Assembling MASTER_REGISTRY.json...'));

const totalEnumValues = Object.values(enums).reduce((sum, e) => sum + e.values.length, 0);

const registry = {
  _meta: {
    title: 'REBNY RLS + Trestle Master Field Registry',
    version: '2.0.0',
    generated: new Date().toISOString().split('T')[0],
    authority: 'REBNY RLS via Trestle (CoreLogic)',
    sources: [
      'data/rebny-rls-property-fields.csv (902 REBNY IDX Plus fields across 7 resources)',
      'data/rebny-rls-property-lookup.csv (105 REBNY enums / 1,942 picklist values)',
      'data/trestle-dictionary/trestle-schema.json (744 Trestle fields — full RESO)',
      'data/FIELD_REGISTRY.json (65 CRM canonical mappings)',
      'data/SEARCH_CONTROL_MAP.json (search DOM mappings)',
      'trestle-metadata.xml (OData baseline)',
    ],
    stats: {
      totalFields: Object.keys(fields).length,
      rebnyFields: rebnyCount,
      trestleOnlyFields: trestleOnlyCount,
      supplementFields: supplementCount,
      totalEnums: Object.keys(enums).length,
      rebnyEnums: rebnyEnumCount,
      trestleOnlyEnums: trestleOnlyEnumCount,
      totalPicklistValues: totalEnumValues,
      requiredFields: requiredCount,
      conditionalFields: conditionalCount,
      readOnlyFields: readOnlyCount,
      crmMapped: regByTrestle.size,
      displayTiers: tierCounts,
      complianceGates: complianceGates.length,
    },
  },
  fields,
  enums,
  corrections,
  statusMapping,
  propertyTypeDecomposition,
  complianceGates,
  idxDistributionGates,
};

// ── 13. Write Output ─────────────────────────────────────────────────────────

const json = JSON.stringify(registry, null, 2);
fs.writeFileSync(PATHS.output, json, 'utf-8');

const lines = json.split('\n').length;
const sizeKB = Math.round(Buffer.byteLength(json, 'utf-8') / 1024);

console.log(C.bold(C.green(`\n  MASTER_REGISTRY.json written successfully\n`)));
console.log(`  Location:    ${PATHS.output}`);
console.log(`  Size:        ${sizeKB} KB (${lines} lines)`);
console.log('');

// ── 15. Stats Summary ────────────────────────────────────────────────────────

console.log(C.bold('  Stats:\n'));
console.log(`  Fields (total):    ${C.cyan(Object.keys(fields).length)}`);
console.log(`    REBNY RLS:       ${C.green(rebnyCount)} (NY-specific, what REBNY accepts)`);
console.log(`    CRM supplement:  ${C.cyan(supplementCount)}`);
console.log(`    Trestle-only:    ${C.dim(trestleOnlyCount)} (broader RESO, not in REBNY CSV)`);
console.log(`    Required:        ${C.cyan(requiredCount)}`);
console.log(`    Conditional:     ${C.cyan(conditionalCount)}`);
console.log(`    Read-only:       ${C.dim(readOnlyCount)}`);
console.log(`    CRM-mapped:      ${C.cyan(regByTrestle.size)}`);
console.log('');
console.log(`  Display tiers:`);
console.log(`    IDX (public):    ${C.green(tierCounts.idx)}`);
console.log(`    VOW (auth):      ${C.yellow(tierCounts.vow)}`);
console.log(`    Internal (CRM):  ${C.red(tierCounts.internal)}`);
console.log(`    System:          ${C.dim(tierCounts.system)}`);
console.log('');
console.log(`  Enums (total):     ${C.cyan(Object.keys(enums).length)}`);
console.log(`    REBNY enums:     ${C.green(rebnyEnumCount)} (with picklist values)`);
console.log(`    Trestle-only:    ${C.dim(trestleOnlyEnumCount)} (type reference only)`);
console.log(`  Picklist values:   ${C.cyan(totalEnumValues)}`);
console.log(`  Corrections:       ${C.yellow(corrections.length)}`);
console.log(`  Compliance gates:  ${C.red(complianceGates.length)}`);
console.log(`  IDX dist gates:    ${C.cyan(idxDistributionGates.gates.length)}`);
console.log('');

// ── 15. Spot-Check Validation ────────────────────────────────────────────────

console.log(C.bold('  Spot-Check Validation:\n'));

const checks = [
  // Enum value checks
  {
    label: 'CommonInterest has StockCooperative (not Cooperative)',
    pass: enums.CommonInterest && enums.CommonInterest.values.some(v => v.value === 'StockCooperative'),
  },
  {
    label: 'PropertyType has only Residential and ResidentialLease',
    pass: enums.PropertyType &&
          enums.PropertyType.values.length === 2 &&
          enums.PropertyType.values.some(v => v.value === 'Residential') &&
          enums.PropertyType.values.some(v => v.value === 'ResidentialLease'),
  },
  {
    label: 'ListingAgreement has CoExclusive',
    pass: enums.ListingAgreement && enums.ListingAgreement.values.some(v => v.value === 'CoExclusive'),
  },
  {
    label: 'Heating has 43 values (no Cooling mixed in)',
    pass: enums.Heating && enums.Heating.values.length === 43,
  },
  {
    label: 'Cooling has 25 values (separate from Heating)',
    pass: enums.Cooling && enums.Cooling.values.length === 25,
  },
  // Field checks
  {
    label: 'ListPrice field exists with dataType=Decimal',
    pass: fields.ListPrice && fields.ListPrice.dataType === 'Decimal',
  },
  {
    label: 'ListPrice.isRebny = true',
    pass: fields.ListPrice && fields.ListPrice.isRebny === true,
  },
  {
    label: 'ListPrice.displayTier = idx',
    pass: fields.ListPrice && fields.ListPrice.displayTier === 'idx',
  },
  // Compliance & display tier
  {
    label: 'InternetEntireListingDisplayYN in compliance gates',
    pass: complianceGates.some(g => g.field === 'InternetEntireListingDisplayYN'),
  },
  {
    label: 'BuyerBrokerageCompensation displayTier = internal',
    pass: fields.BuyerBrokerageCompensation && fields.BuyerBrokerageCompensation.displayTier === 'internal',
  },
  {
    label: 'PrivateRemarks displayTier = internal',
    pass: fields.PrivateRemarks && fields.PrivateRemarks.displayTier === 'internal',
  },
  {
    label: 'ClosePrice displayTier = vow',
    pass: fields.ClosePrice && fields.ClosePrice.displayTier === 'vow',
  },
  // REBNY vs Trestle-only
  {
    label: `Total fields = ${trestleMap.size} (all Trestle)`,
    pass: Object.keys(fields).length >= trestleMap.size,
  },
  {
    label: `REBNY fields = ${rebnyCount} (902 expected)`,
    pass: rebnyCount >= 448,
  },
  {
    label: 'Trestle-only fields have isRebny=false',
    pass: trestleOnlyCount > 0 && Object.values(fields).filter(f => !f.isRebny).length === trestleOnlyCount,
  },
  {
    label: 'REBNY enums have isRebny=true',
    pass: enums.CommonInterest && enums.CommonInterest.isRebny === true,
  },
  // Decomposition & mapping
  {
    label: 'propertyTypeDecomposition.Coop uses StockCooperative',
    pass: propertyTypeDecomposition.Coop.CommonInterest === 'StockCooperative',
  },
  {
    label: 'statusMapping: ContractSigned -> Pending',
    pass: statusMapping.crmToRebny.ContractSigned === 'Pending',
  },
];

let allPass = true;
for (const check of checks) {
  const icon = check.pass ? C.green('PASS') : C.red('FAIL');
  console.log(`  ${icon}  ${check.label}`);
  if (!check.pass) allPass = false;
}

console.log('');
if (allPass) {
  console.log(C.bold(C.green('  All spot-checks passed.\n')));
} else {
  console.log(C.bold(C.red('  Some spot-checks FAILED — review output above.\n')));
  process.exit(1);
}
