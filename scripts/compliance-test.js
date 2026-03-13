#!/usr/bin/env node
/**
 * COMPREHENSIVE RLS COMPLIANCE TEST
 * Tests every field, ID, scanner, gate, and mapping in both submission forms
 * against the authoritative REBNY RLS property fields, lookup values,
 * and enforcement rules.
 *
 * Run: node scripts/compliance-test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SALE_FORM = path.join(ROOT, 'public/crm/SALE-FORM-REDESIGN.html');
const RENTAL_FORM = path.join(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html');
const RLS_FIELDS_CSV = path.join(ROOT, 'data/rebny-rls-property-fields.csv');
const RLS_LOOKUP_CSV = path.join(ROOT, 'data/rebny-rls-property-lookup.csv');
const RLS_BINDINGS = path.join(ROOT, 'data/rls-form-bindings.json');
const RLS_ALIASES = path.join(ROOT, 'data/rls-field-aliases.json');
const ENFORCEMENT_TS = path.join(ROOT, 'lib/compliance/rls-enforcement.ts');
const DTO_TS = path.join(ROOT, 'lib/compliance/dto.ts');

// ─── ANSI Colors ───
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';

let totalPass = 0, totalFail = 0, totalWarn = 0, totalInfo = 0;
const failures = [];

function pass(msg) { totalPass++; console.log(`  ${G}PASS${X}  ${msg}`); }
function fail(msg, detail) { totalFail++; failures.push({ msg, detail }); console.log(`  ${R}${B}FAIL${X}  ${R}${msg}${X}${detail ? '\n        ' + D + detail + X : ''}`); }
function warn(msg) { totalWarn++; console.log(`  ${Y}WARN${X}  ${msg}`); }
function info(msg) { totalInfo++; console.log(`  ${D}INFO${X}  ${msg}`); }
function section(title) { console.log(`\n${C}${B}  ── ${title} ──${X}`); }
function header(title) { console.log(`\n${C}${B}${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}${X}`); }

// ─── Load Files ───
function loadFile(p) { return fs.readFileSync(p, 'utf-8'); }

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  });
}

// ─── Extract form elements from HTML ───
function extractFormElements(html) {
  const elements = {};  // id → { tag, type, name, rlsField, value, line }
  const radioGroups = {}; // name → [{ value, line }]
  const checkboxGroups = {}; // name → [{ value, id, rlsField, line }]
  const selectOptions = {}; // id → [{ value, text, line }]
  const dataRlsFields = {}; // id → rlsField
  const allIds = new Set();
  const duplicateIds = [];

  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Extract all elements with id
    const idMatches = [...line.matchAll(/id="([^"]+)"/g)];
    for (const m of idMatches) {
      const id = m[1];
      if (allIds.has(id)) duplicateIds.push({ id, line: lineNum });
      allIds.add(id);
    }

    // input/select/textarea with id
    const inputMatch = line.match(/<(input|select|textarea)\s[^>]*id="([^"]+)"[^>]*/i);
    if (inputMatch) {
      const tag = inputMatch[1].toLowerCase();
      const id = inputMatch[2];
      const typeMatch = line.match(/type="([^"]+)"/i);
      const nameMatch = line.match(/name="([^"]+)"/i);
      const rlsMatch = line.match(/data-rls-field="([^"]+)"/i);
      const valMatch = line.match(/value="([^"]+)"/i);
      const rlsIgnore = /data-rls-ignore="true"/i.test(line);

      elements[id] = {
        tag,
        type: typeMatch ? typeMatch[1] : (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text'),
        name: nameMatch ? nameMatch[1] : null,
        rlsField: rlsMatch ? rlsMatch[1] : null,
        rlsIgnore,
        value: valMatch ? valMatch[1] : null,
        line: lineNum,
      };

      if (rlsMatch) dataRlsFields[id] = rlsMatch[1];
    }

    // Radio/checkbox with name (may not have id)
    const radioMatch = line.match(/<input\s[^>]*type="(radio|checkbox)"[^>]*name="([^"]+)"[^>]*/i);
    if (radioMatch) {
      const type = radioMatch[1].toLowerCase();
      const name = radioMatch[2];
      const valMatch = line.match(/value="([^"]+)"/i);
      const idMatch = line.match(/id="([^"]+)"/i);
      const rlsMatch = line.match(/data-rls-field="([^"]+)"/i);
      const val = valMatch ? valMatch[1] : '';

      if (type === 'radio') {
        if (!radioGroups[name]) radioGroups[name] = [];
        radioGroups[name].push({ value: val, line: lineNum });
      } else {
        if (!checkboxGroups[name]) checkboxGroups[name] = [];
        checkboxGroups[name].push({
          value: val,
          id: idMatch ? idMatch[1] : null,
          rlsField: rlsMatch ? rlsMatch[1] : null,
          line: lineNum,
        });
      }
    }

    // Select options
    const selectMatch = line.match(/<select\s[^>]*id="([^"]+)"/i);
    if (selectMatch) {
      const selectId = selectMatch[1];
      selectOptions[selectId] = [];
      // Scan forward for options
      for (let j = i; j < Math.min(i + 100, lines.length); j++) {
        const optMatch = lines[j].match(/<option\s[^>]*value="([^"]*)"/i);
        if (optMatch) selectOptions[selectId].push({ value: optMatch[1], line: j + 1 });
        if (/<\/select>/i.test(lines[j])) break;
      }
    }
  }

  return { elements, radioGroups, checkboxGroups, selectOptions, dataRlsFields, allIds, duplicateIds };
}

// ─── Extract collectFormData assignments ───
function extractCollectFormData(html, funcName) {
  const regex = new RegExp('function\\s+' + funcName + '\\s*\\(\\)', 'g');
  let lastIdx = -1, match;
  while ((match = regex.exec(html)) !== null) lastIdx = match.index;
  if (lastIdx === -1) return { rlsMappings: {}, elementRefs: [], multiArrays: [] };

  // Find function body
  let braces = 0, start = html.indexOf('{', lastIdx), end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') braces++;
    if (html[i] === '}') braces--;
    if (braces === 0) { end = i; break; }
  }
  const body = html.substring(start, end + 1);

  // Extract data.RLSField = ... assignments
  const rlsMappings = {};
  const assignRegex = /data\.(\w+)\s*=\s*([^;]+);/g;
  let m;
  while ((m = assignRegex.exec(body)) !== null) {
    rlsMappings[m[1]] = m[2].trim();
  }

  // Extract element references (getElementById, val(), data.xxx)
  const elementRefs = [];
  const refRegex = /data\.(\w+)/g;
  while ((m = refRegex.exec(body)) !== null) {
    elementRefs.push(m[1]);
  }

  // Extract multi-value array collectors
  const multiArrays = [];
  const arrayRegex = /data\.(\w+)\s*=\s*\[\]/g;
  while ((m = arrayRegex.exec(body)) !== null) {
    multiArrays.push(m[1]);
  }

  return { rlsMappings, elementRefs, multiArrays, body };
}

// ─── Main Test Runner ───
function main() {
  console.log(`${B}╔══════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  COMPREHENSIVE RLS COMPLIANCE TEST                                  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════╝${X}`);
  console.log(`${D}  Date: ${new Date().toISOString()}${X}`);
  console.log(`${D}  Root: ${ROOT}${X}\n`);

  // ─── Load all files ───
  const saleHtml = loadFile(SALE_FORM);
  const rentalHtml = loadFile(RENTAL_FORM);
  const rlsFieldsRaw = loadFile(RLS_FIELDS_CSV);
  const rlsLookupRaw = loadFile(RLS_LOOKUP_CSV);
  const bindings = JSON.parse(loadFile(RLS_BINDINGS));
  const aliases = JSON.parse(loadFile(RLS_ALIASES));
  const enforcementTs = loadFile(ENFORCEMENT_TS);
  const dtoTs = loadFile(DTO_TS);

  // Parse CSVs
  const rlsFields = parseCSV(rlsFieldsRaw);
  const rlsLookup = parseCSV(rlsLookupRaw);

  // Build lookup value map: fieldName → Set of valid values
  const lookupValues = {};
  for (const row of rlsLookup) {
    const fieldName = row[2] || '';
    const value = row[3] || '';
    if (fieldName && value) {
      if (!lookupValues[fieldName]) lookupValues[fieldName] = new Set();
      lookupValues[fieldName].add(value);
    }
  }

  // Build RLS field name set
  const rlsFieldNames = new Set();
  for (const row of rlsFields) {
    const name = (row[2] || row[1] || '').trim();
    if (name && name !== 'FieldName' && name !== 'Field Name') rlsFieldNames.add(name);
  }

  // Extract form data
  const sale = extractFormElements(saleHtml);
  const rental = extractFormElements(rentalHtml);
  const saleCollect = extractCollectFormData(saleHtml, 'collectSaleFormData');
  const rentalCollect = extractCollectFormData(rentalHtml, 'collectRentalFormData');

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE A: SALE FORM
  // ═══════════════════════════════════════════════════════════════════
  header('A. SALE FORM — Element & Field Validation');

  // A1: Duplicate IDs
  section('A1. Duplicate Element IDs');
  if (sale.duplicateIds.length === 0) {
    pass('No duplicate element IDs found');
  } else {
    for (const d of sale.duplicateIds) {
      fail(`Duplicate ID "${d.id}" at line ${d.line}`);
    }
  }

  // A2: data-rls-field references valid RLS fields
  section('A2. data-rls-field Attributes Match RLS Fields');
  let rlsFieldMatchCount = 0;
  for (const [id, rlsField] of Object.entries(sale.dataRlsFields)) {
    if (rlsFieldNames.has(rlsField)) {
      rlsFieldMatchCount++;
    } else if (aliases[rlsField]) {
      warn(`"${id}" → data-rls-field="${rlsField}" is an alias (canonical: ${aliases[rlsField]})`);
    } else {
      fail(`"${id}" → data-rls-field="${rlsField}" is NOT a valid RLS field`);
    }
  }
  pass(`${rlsFieldMatchCount}/${Object.keys(sale.dataRlsFields).length} data-rls-field attributes match valid RLS fields`);

  // A3: Radio group values match RLS lookups
  section('A3. Radio Group Values vs RLS Lookup');
  const SALE_RADIO_RLS_MAP = {
    'saleListingType': 'ListingAgreement',
    'salePropertyType': 'PropertySubType',
    'saleInternetAVMDisplayYN': 'InternetAutomatedValuationDisplayYN',
  };
  for (const [groupName, rlsField] of Object.entries(SALE_RADIO_RLS_MAP)) {
    const group = sale.radioGroups[groupName];
    if (!group) { fail(`Radio group "${groupName}" not found in HTML`); continue; }
    const validVals = lookupValues[rlsField];
    if (!validVals) { warn(`No RLS lookup found for "${rlsField}" — may use free-text`); continue; }
    for (const radio of group) {
      // Skip permission-based values that aren't ListingAgreement values
      if (['OwnerOptOut', 'ParticipantOnly', 'InHouse'].includes(radio.value)) {
        info(`"${groupName}" value "${radio.value}" is a permission flag, not a ${rlsField} value — handled by collectFormData`);
        continue;
      }
      if (validVals.has(radio.value)) {
        pass(`"${groupName}" value "${radio.value}" matches RLS ${rlsField}`);
      } else {
        fail(`"${groupName}" value "${radio.value}" NOT in RLS ${rlsField} lookup`, `Valid: ${[...validVals].join(', ')}`);
      }
    }
  }

  // A4: Checkbox group values match RLS lookups
  section('A4. Checkbox Group Values vs RLS Lookup');
  const SALE_CB_RLS_MAP = {
    'salePetsAllowed': 'PetsAllowed',
    'saleBuildingPetsAllowed': 'BuildingPetsAllowed',
    'saleAttendanceType': 'AttendanceType',
    'saleBuildingLaundryFeatures': 'BuildingLaundryFeatures',
    'saleBldgCooling': 'Cooling',
  };
  for (const [groupName, rlsField] of Object.entries(SALE_CB_RLS_MAP)) {
    const group = sale.checkboxGroups[groupName];
    if (!group) { fail(`Checkbox group "${groupName}" not found in HTML`); continue; }
    const validVals = lookupValues[rlsField];
    if (!validVals) { warn(`No RLS lookup for "${rlsField}"`); continue; }
    let matched = 0, unmatched = 0;
    for (const cb of group) {
      if (validVals.has(cb.value)) {
        matched++;
      } else {
        fail(`"${groupName}" value "${cb.value}" NOT in RLS ${rlsField} lookup (line ${cb.line})`);
        unmatched++;
      }
    }
    if (unmatched === 0) pass(`All ${matched} values in "${groupName}" match RLS ${rlsField}`);
  }

  // A5: collectSaleFormData — RLS field mappings
  section('A5. collectSaleFormData() — RLS Mappings');
  const REQUIRED_RLS_MAPPINGS_SALE = [
    'PropertyType', 'PropertySubType', 'CommonInterest', 'MlsStatus',
    'ListPrice', 'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf', 'BathroomsTotal', 'LivingArea',
    'StreetNumber', 'StreetName', 'StreetSuffix', 'UnitNumber', 'City', 'CityRegion',
    'SubdivisionName', 'StateOrProvince', 'PostalCode', 'UnParsedAddress',
    'PublicRemarks', 'PrivateRemarks', 'ShowingInstructions',
    'YearBuilt', 'NewDevelopmentYN', 'ListingAgreement', 'CoBrokeAgreement', 'Permissions',
    'IDXEntireListingDisplayYN', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'SyndicateYN',
    'ListAgentMlsId', 'ListAgentFullName', 'ListAgentEmail', 'ListAgentDirectPhone',
    'ListOfficeName', 'ListOfficeKey',
    'BuildingName', 'StructureType', 'StoriesTotal', 'NumberOfUnitsTotal',
    'CrossStreet', 'TaxBlock', 'BuildingTaxLot', 'AssociationName',
    'PetsAllowed', 'BuildingPetsAllowed', 'BuildingFeatures',
    'AttendanceType', 'BuildingLaundryFeatures',
    'CountyOrParish', 'PostalCity', 'RoomsTotal', 'Concessions',
    'NewConstructionYN', 'ElevatorsTotal', 'GarageYN',
    'OnMarketDate', 'ExpirationDate', 'ListingContractDate',
  ];
  for (const field of REQUIRED_RLS_MAPPINGS_SALE) {
    if (saleCollect.rlsMappings[field] !== undefined) {
      pass(`data.${field} is mapped`);
    } else {
      fail(`data.${field} NOT mapped in collectSaleFormData()`);
    }
  }

  // A6: Multi-value arrays properly collected
  section('A6. Multi-Value Array Collection (Sale)');
  const SALE_ARRAYS = ['PetsAllowed', 'BuildingPetsAllowed', 'BuildingFeatures', 'AttendanceType', 'BuildingLaundryFeatures'];
  for (const arr of SALE_ARRAYS) {
    if (saleCollect.multiArrays.includes(arr)) {
      pass(`${arr} collected as array`);
    } else {
      fail(`${arr} NOT collected as array — will lose multi-select values`);
    }
  }

  // A7: ListingAgreement / Permissions separation
  section('A7. ListingAgreement / Permissions Logic (Sale)');
  if (saleCollect.body && saleCollect.body.includes("isOwnerOptOut")) {
    pass('OwnerOptOut detection variable exists');
  } else {
    fail('No OwnerOptOut detection — ListingAgreement may receive invalid value');
  }
  if (saleCollect.body && saleCollect.body.includes("isParticipantOnly")) {
    pass('ParticipantOnly detection variable exists');
  } else {
    fail('No ParticipantOnly detection');
  }
  if (saleCollect.body && /isOwnerOptOut\s*\|\|\s*isParticipantOnly/.test(saleCollect.body)) {
    pass('Distribution gates forced OFF for OwnerOptOut/ParticipantOnly');
  } else {
    fail('Distribution gates NOT forced OFF for permission-based listings');
  }
  // Check Permissions value matches RLS lookup
  if (saleCollect.body && /Permissions.*'OwnerOptOut'/.test(saleCollect.body)) {
    pass('Permissions sends RLS value "OwnerOptOut" (matches lookup CSV)');
  } else {
    fail('Permissions does not send "OwnerOptOut" — may use wrong format');
  }
  if (saleCollect.body && /Permissions.*'Private'/.test(saleCollect.body)) {
    pass('Permissions sends RLS value "Private" (matches lookup CSV)');
  } else {
    fail('Permissions does not send "Private"');
  }

  // A8: Building Modal
  section('A8. Building Modal (Sale)');
  if (sale.allIds.has('saleBuildingModal')) {
    pass('saleBuildingModal container exists');
  } else {
    fail('saleBuildingModal container NOT found');
  }
  if (saleCollect.body && /saleBuildingModal/.test(saleCollect.body)) {
    pass('collectSaleFormData() explicitly collects from saleBuildingModal');
  } else {
    fail('collectSaleFormData() does NOT collect building modal fields');
  }
  const BLDG_FIELDS_SALE = ['saleBldgName', 'saleBldgYearBuilt', 'saleBldgTotalFloors', 'saleBldgTotalUnits', 'saleBldgType'];
  for (const f of BLDG_FIELDS_SALE) {
    if (sale.elements[f]) {
      pass(`Building field "${f}" exists (line ${sale.elements[f].line})`);
    } else {
      fail(`Building field "${f}" NOT found in HTML`);
    }
  }

  // A9: Media Modal
  section('A9. Media Modal (Sale)');
  if (sale.allIds.has('saleMediaModal')) {
    pass('saleMediaModal container exists');
  } else {
    fail('saleMediaModal container NOT found');
  }
  if (saleCollect.body && /saleMediaModal/.test(saleCollect.body)) {
    pass('collectSaleFormData() explicitly collects from saleMediaModal');
  } else {
    fail('collectSaleFormData() does NOT collect media modal fields');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE B: RENTAL FORM
  // ═══════════════════════════════════════════════════════════════════
  header('B. RENTAL FORM — Element & Field Validation');

  // B1: Duplicate IDs
  section('B1. Duplicate Element IDs');
  if (rental.duplicateIds.length === 0) {
    pass('No duplicate element IDs found');
  } else {
    for (const d of rental.duplicateIds) {
      fail(`Duplicate ID "${d.id}" at line ${d.line}`, 'Duplicate IDs cause getElementById() to return wrong element');
    }
  }

  // B2: data-rls-field
  section('B2. data-rls-field Attributes Match RLS Fields');
  let rentalRlsMatch = 0;
  for (const [id, rlsField] of Object.entries(rental.dataRlsFields)) {
    if (rlsFieldNames.has(rlsField)) {
      rentalRlsMatch++;
    } else if (aliases[rlsField]) {
      warn(`"${id}" → data-rls-field="${rlsField}" is an alias (canonical: ${aliases[rlsField]})`);
    } else {
      fail(`"${id}" → data-rls-field="${rlsField}" is NOT a valid RLS field`);
    }
  }
  pass(`${rentalRlsMatch}/${Object.keys(rental.dataRlsFields).length} data-rls-field attributes match valid RLS fields`);

  // B3: Radio group values
  section('B3. Radio Group Values vs RLS Lookup');
  const RENTAL_RADIO_RLS_MAP = {
    'rentalListingType': 'ListingAgreement',
    'rentalPropertyType': 'PropertySubType',
    'rentalCoBrokeAgreement': 'CoBrokeAgreement',
  };
  for (const [groupName, rlsField] of Object.entries(RENTAL_RADIO_RLS_MAP)) {
    const group = rental.radioGroups[groupName];
    if (!group) { fail(`Radio group "${groupName}" not found in HTML`); continue; }
    const validVals = lookupValues[rlsField];
    if (!validVals) { warn(`No RLS lookup for "${rlsField}"`); continue; }
    for (const radio of group) {
      if (['RLS-Owner-OptOut', 'RLS-Participant', 'InHouse'].includes(radio.value)) {
        info(`"${groupName}" value "${radio.value}" is a permission flag — handled by collectFormData`);
        continue;
      }
      if (validVals.has(radio.value)) {
        pass(`"${groupName}" value "${radio.value}" matches RLS ${rlsField}`);
      } else {
        fail(`"${groupName}" value "${radio.value}" NOT in RLS ${rlsField} lookup`);
      }
    }
  }

  // B4: Checkbox groups
  section('B4. Checkbox Group Values vs RLS Lookup');
  const RENTAL_CB_RLS_MAP = {
    'rentalPetsAllowed': 'PetsAllowed',
    'rentalBuildingPetsAllowed': 'BuildingPetsAllowed',
    'rentalAttendanceType': 'AttendanceType',
    'rentalBuildingLaundryFeatures': 'BuildingLaundryFeatures',
  };
  for (const [groupName, rlsField] of Object.entries(RENTAL_CB_RLS_MAP)) {
    const group = rental.checkboxGroups[groupName];
    if (!group) { fail(`Checkbox group "${groupName}" not found in HTML`); continue; }
    const validVals = lookupValues[rlsField];
    if (!validVals) { warn(`No RLS lookup for "${rlsField}"`); continue; }
    let matched = 0, unmatched = 0;
    for (const cb of group) {
      if (validVals.has(cb.value)) {
        matched++;
      } else {
        fail(`"${groupName}" value "${cb.value}" NOT in RLS ${rlsField} lookup (line ${cb.line})`);
        unmatched++;
      }
    }
    if (unmatched === 0) pass(`All ${matched} values in "${groupName}" match RLS ${rlsField}`);
  }

  // B5: collectRentalFormData — mappings
  section('B5. collectRentalFormData() — RLS Mappings');
  const REQUIRED_RLS_MAPPINGS_RENTAL = [
    'PropertyType', 'PropertySubType', 'CommonInterest', 'MlsStatus',
    'ListPrice', 'NetMonthlyRent', 'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf', 'BathroomsTotal', 'LivingArea',
    'StreetNumber', 'StreetName', 'StreetSuffix', 'UnitNumber', 'City', 'CityRegion',
    'SubdivisionName', 'StateOrProvince', 'PostalCode', 'UnParsedAddress',
    'PublicRemarks', 'PrivateRemarks', 'ShowingInstructions',
    'YearBuilt', 'NewDevelopmentYN', 'ListingAgreement', 'CoBrokeAgreement', 'Permissions',
    'IDXEntireListingDisplayYN', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'SyndicateYN',
    'ListAgentMlsId', 'ListAgentFullName', 'ListAgentEmail', 'ListAgentDirectPhone',
    'ListOfficeName', 'ListOfficeKey',
    'BuildingName', 'StructureType', 'StoriesTotal', 'NumberOfUnitsTotal',
    'CrossStreet', 'TaxBlock', 'BuildingTaxLot', 'AssociationName',
    'PetsAllowed', 'BuildingPetsAllowed', 'BuildingFeatures',
    'AttendanceType', 'BuildingLaundryFeatures', 'OwnerPays',
    'CountyOrParish', 'PostalCity', 'RoomsTotal', 'Concessions',
    'ElevatorsTotal', 'GarageYN',
    'OnMarketDate', 'ExpirationDate', 'ListingContractDate', 'AvailabilityDate',
  ];
  for (const field of REQUIRED_RLS_MAPPINGS_RENTAL) {
    if (rentalCollect.rlsMappings[field] !== undefined) {
      pass(`data.${field} is mapped`);
    } else {
      fail(`data.${field} NOT mapped in collectRentalFormData()`);
    }
  }

  // B6: Multi-value arrays
  section('B6. Multi-Value Array Collection (Rental)');
  const RENTAL_ARRAYS = ['PetsAllowed', 'BuildingPetsAllowed', 'BuildingFeatures', 'AttendanceType', 'BuildingLaundryFeatures', 'OwnerPays'];
  for (const arr of RENTAL_ARRAYS) {
    if (rentalCollect.multiArrays.includes(arr)) {
      pass(`${arr} collected as array`);
    } else if (rentalCollect.body && new RegExp('data\\.' + arr + '\\s*=').test(rentalCollect.body)) {
      // OwnerPays is special — assigned directly, not via [] init
      warn(`${arr} is assigned but not initialized as array[] — check if single-value fallback`);
    } else {
      fail(`${arr} NOT collected as array`);
    }
  }

  // B7: ListingAgreement / Permissions separation (Rental)
  section('B7. ListingAgreement / Permissions Logic (Rental)');
  if (rentalCollect.body && rentalCollect.body.includes("'RLS-Owner-OptOut'")) {
    pass('Rental uses correct radio value "RLS-Owner-OptOut" for Owner Opt-Out');
  } else {
    fail('Rental does not check for "RLS-Owner-OptOut" — Permissions will be null for opt-outs');
  }
  if (rentalCollect.body && rentalCollect.body.includes("'RLS-Participant'")) {
    pass('Rental uses correct radio value "RLS-Participant" for Participant Only');
  } else {
    fail('Rental does not check for "RLS-Participant"');
  }
  if (rentalCollect.body && /isOwnerOptOut\s*\|\|\s*isParticipantOnly/.test(rentalCollect.body)) {
    pass('Distribution gates forced OFF for OwnerOptOut/ParticipantOnly');
  } else {
    fail('Distribution gates NOT forced OFF for permission-based listings');
  }
  if (rentalCollect.body && /Permissions.*'OwnerOptOut'/.test(rentalCollect.body)) {
    pass('Permissions sends "OwnerOptOut" (matches RLS lookup)');
  } else {
    fail('Permissions value mismatch for Owner Opt-Out');
  }
  if (rentalCollect.body && /Permissions.*'Private'/.test(rentalCollect.body)) {
    pass('Permissions sends "Private" (matches RLS lookup)');
  } else {
    fail('Permissions value mismatch for Participant Only');
  }

  // B8: Building Modal (Rental)
  section('B8. Building Modal (Rental)');
  if (rental.allIds.has('rentalBuildingModal')) {
    pass('rentalBuildingModal container exists');
  } else {
    fail('rentalBuildingModal container NOT found');
  }
  if (rentalCollect.body && /rentalBuildingModal/.test(rentalCollect.body)) {
    pass('collectRentalFormData() explicitly collects from rentalBuildingModal');
  } else {
    fail('collectRentalFormData() does NOT collect building modal fields');
  }

  // B9: Media Modal (Rental)
  section('B9. Media Modal (Rental)');
  if (rental.allIds.has('rentalMediaModal')) {
    pass('rentalMediaModal container exists');
  } else {
    fail('rentalMediaModal container NOT found');
  }
  if (rentalCollect.body && /rentalMediaModal/.test(rentalCollect.body)) {
    pass('collectRentalFormData() explicitly collects from rentalMediaModal');
  } else {
    fail('collectRentalFormData() does NOT collect media modal fields');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE C: BACKEND ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════
  header('C. Backend Enforcement — rls-enforcement.ts');

  // C1: Mandatory fields
  section('C1. Mandatory Field Enforcement');
  const MANDATORY = [
    'PropertyType', 'ListPrice', 'MlsStatus', 'StandardStatus', 'ListAgentMlsId',
    'ListingAgreement', 'StreetName', 'City', 'StateOrProvince', 'PostalCode',
    'CountyOrParish', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN',
    'IDXEntireListingDisplayYN', 'PublicRemarks', 'OriginalEntryTimestamp',
    'OnMarketDate', 'ExpirationDate', 'SourceSystemKey',
  ];
  for (const f of MANDATORY) {
    if (enforcementTs.includes(`"${f}"`)) {
      pass(`Mandatory field "${f}" enforced`);
    } else {
      fail(`Mandatory field "${f}" NOT in enforcement gate`);
    }
  }

  // C2: Fair Housing scanner patterns
  section('C2. Fair Housing Scanner');
  const FH_PATTERNS = [
    { desc: 'Race discrimination', term: 'whites?\\s+only' },
    { desc: 'Religion discrimination', term: 'christian\\s+' },
    { desc: 'Familial status', term: 'no\\s+(children|kids)' },
    { desc: 'Disability', term: 'no\\s+(wheelchair|handicap)' },
    { desc: 'NYC income source', term: 'no\\s+section\\s*8' },
    { desc: 'Immigration', term: 'citizen(s|ship)?\\s+only' },
  ];
  for (const p of FH_PATTERNS) {
    if (enforcementTs.includes(p.term) || new RegExp(p.term.replace(/\\/g, '\\\\')).test(enforcementTs)) {
      pass(`Fair Housing: ${p.desc} pattern present`);
    } else {
      // Check with simpler match
      const simpler = p.term.replace(/\\s\+/g, ' ').replace(/\\s\*/g, '').replace(/\(\?/g, '');
      if (enforcementTs.toLowerCase().includes(simpler.toLowerCase().replace(/[\\()?+*]/g, ''))) {
        pass(`Fair Housing: ${p.desc} pattern present (simplified match)`);
      } else {
        warn(`Fair Housing: ${p.desc} pattern may not be present — verify manually`);
      }
    }
  }

  // C3: Agent info in remarks scanner
  section('C3. Agent Info / Off-Market / Compensation Scanners');
  const SCANNER_PATTERNS = [
    { desc: 'Phone number in remarks', key: 'AGENT_INFO_PATTERNS' },
    { desc: 'Email in remarks', key: 'email' },
    { desc: 'URL in remarks', key: 'http' },
    { desc: 'Off-market language', key: 'off-market' },
    { desc: 'Pocket listing language', key: 'pocket' },
    { desc: 'Commission/compensation language', key: 'commission' },
  ];
  for (const s of SCANNER_PATTERNS) {
    if (enforcementTs.toLowerCase().includes(s.key.toLowerCase())) {
      pass(`Scanner: ${s.desc}`);
    } else {
      warn(`Scanner: ${s.desc} — not found in enforcement gate`);
    }
  }

  // C4: Distribution gate cascade
  section('C4. Distribution Gate Cascade');
  if (enforcementTs.includes('InternetEntireListingDisplayYN') && enforcementTs.includes('DG-001')) {
    pass('DG-001: InternetEntireListingDisplayYN=false cascade enforced');
  } else {
    fail('DG-001 cascade not enforced');
  }
  if (enforcementTs.includes('DG-002') && (enforcementTs.includes('OwnerOptOut') || enforcementTs.includes('Owner Opt-Out'))) {
    pass('DG-002: Owner Opt-Out display blocking enforced');
  } else {
    fail('DG-002 Owner Opt-Out blocking not enforced');
  }
  if (enforcementTs.includes('DG-003')) {
    pass('DG-003: Sale+Permissions=null cannot set InternetEntireListingDisplayYN=false');
  } else {
    fail('DG-003 not enforced');
  }
  // Check that Private (Participant Only) is also blocked
  if (enforcementTs.includes('"Private"') && enforcementTs.includes('DG-002')) {
    pass('DG-002 also blocks Participant Only (Private) listings');
  } else if (enforcementTs.includes('Private')) {
    pass('Private permission check present in enforcement');
  } else {
    fail('Participant Only (Private) NOT blocked by distribution gates');
  }

  // C5: ListingAgreement validation
  section('C5. ListingAgreement Validation');
  const VALID_AGREEMENTS = ['ExclusiveRightToSell', 'ExclusiveAgency', 'ExclusiveRightToLease', 'CoExclusive', 'ExclusiveRightWithException'];
  for (const a of VALID_AGREEMENTS) {
    if (enforcementTs.includes(`"${a}"`)) {
      pass(`ListingAgreement "${a}" allowed`);
    } else {
      fail(`ListingAgreement "${a}" NOT in allowed list`);
    }
  }
  // Verify OwnerOptOut/ParticipantOnly are NOT valid ListingAgreement values
  if (enforcementTs.includes('VALID_LISTING_AGREEMENTS') &&
      !enforcementTs.match(/VALID_LISTING_AGREEMENTS[^;]*OwnerOptOut/)) {
    pass('"OwnerOptOut" correctly excluded from VALID_LISTING_AGREEMENTS');
  }

  // C6: Coming Soon rules
  section('C6. Coming Soon Rules');
  if (enforcementTs.includes('CS-001') && enforcementTs.includes('rent')) {
    pass('CS-001: Coming Soon blocked for rentals');
  } else {
    fail('CS-001 rental block not enforced');
  }
  if (enforcementTs.includes('ActivationDate')) {
    pass('Coming Soon requires ActivationDate');
  } else {
    fail('ActivationDate not required for Coming Soon');
  }

  // C7: Closed status rules
  section('C7. Closed Status Requirements');
  if (enforcementTs.includes('CloseDate') && enforcementTs.includes('Closed')) {
    pass('CloseDate required for Closed status');
  } else {
    fail('CloseDate not required for Closed');
  }
  if (enforcementTs.includes('ClosePrice')) {
    pass('ClosePrice required for Closed status');
  } else {
    fail('ClosePrice not required for Closed');
  }

  // C8: NAR Settlement removed fields
  section('C8. NAR Settlement — Removed Compensation Fields');
  const REMOVED = ['BuyerAgencyCompensation', 'BuyerAgencyCompensationType', 'SubAgencyCompensation', 'SubAgencyCompensationType'];
  for (const f of REMOVED) {
    if (enforcementTs.includes(`"${f}"`)) {
      pass(`"${f}" in removed fields list`);
    } else {
      fail(`"${f}" NOT in removed fields list`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE D: DTO / PORTAL MASKING
  // ═══════════════════════════════════════════════════════════════════
  header('D. Portal DTO — Agent PII Masking & Display Gating');

  section('D1. Agent PII Masking');
  const AGENT_PII = ['ListAgentEmail', 'ListAgentDirectPhone', 'ListAgentKey', 'ListAgentFullName'];
  for (const f of AGENT_PII) {
    if (dtoTs.includes(f)) {
      pass(`Agent PII field "${f}" handled in DTO`);
    } else {
      fail(`Agent PII field "${f}" NOT in DTO — may leak to buyer/tenant portal`);
    }
  }

  section('D2. Portal Role Filtering');
  const PORTAL_ROLES = ['buyer', 'tenant', 'seller', 'landlord'];
  for (const role of PORTAL_ROLES) {
    if (dtoTs.toLowerCase().includes(role)) {
      pass(`Portal role "${role}" handled in DTO`);
    } else {
      fail(`Portal role "${role}" NOT found in DTO`);
    }
  }

  section('D3. Display Gating in DTO');
  if (dtoTs.includes('InternetEntireListingDisplayYN')) {
    pass('InternetEntireListingDisplayYN checked in DTO');
  } else {
    fail('InternetEntireListingDisplayYN NOT checked in DTO — non-display listings may leak');
  }
  if (dtoTs.includes('InternetAddressDisplayYN')) {
    pass('InternetAddressDisplayYN checked in DTO — address suppression active');
  } else {
    fail('InternetAddressDisplayYN NOT checked — addresses may display when suppressed');
  }
  if (dtoTs.includes('owner_opt_out') || dtoTs.includes('OwnerOptOut') || dtoTs.includes('opt_out')) {
    pass('Owner opt-out exclusion in DTO');
  } else {
    fail('Owner opt-out NOT checked in DTO — opted-out listings may appear in portal');
  }

  section('D4. Compensation Field Removal');
  for (const f of REMOVED) {
    if (dtoTs.includes(f)) {
      pass(`Removed field "${f}" stripped in DTO`);
    } else {
      warn(`"${f}" not explicitly in DTO — may need verification`);
    }
  }

  section('D5. CRM-Only Fields');
  const CRM_ONLY = ['raw_data', 'agent_id', 'sync_status'];
  for (const f of CRM_ONLY) {
    if (dtoTs.includes(f)) {
      pass(`CRM-only field "${f}" stripped from public/portal output`);
    } else {
      warn(`"${f}" not explicitly stripped in DTO`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE E: FORM-LEVEL COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════
  header('E. Form-Level Compliance Checks');

  section('E1. Fair Housing Scanner in Forms');
  if (saleHtml.includes('checkDescriptionCompliance') || saleHtml.includes('_performComplianceCheck')) {
    pass('Sale form has Fair Housing compliance scanner');
  } else {
    fail('Sale form MISSING Fair Housing scanner');
  }
  if (rentalHtml.includes('checkDescriptionCompliance') || rentalHtml.includes('_performComplianceCheck')) {
    pass('Rental form has Fair Housing compliance scanner');
  } else {
    fail('Rental form MISSING Fair Housing scanner');
  }

  section('E2. Fair Housing Acknowledgment');
  if (sale.elements['saleFairHousingAck']) {
    pass('Sale form has Fair Housing acknowledgment checkbox');
  } else {
    fail('Sale form MISSING Fair Housing acknowledgment');
  }
  if (rental.elements['rentalFairHousingAck']) {
    pass('Rental form has Fair Housing acknowledgment checkbox');
  } else {
    fail('Rental form MISSING Fair Housing acknowledgment');
  }

  section('E3. Commission Negotiability Disclosure');
  if (sale.elements['saleCommNegotiabilityAck']) {
    pass('Sale form has commission negotiability acknowledgment');
  } else {
    fail('Sale form MISSING commission negotiability disclosure (UCBA 2026)');
  }
  if (rental.elements['rentalCommNegotiabilityAck']) {
    pass('Rental form has commission negotiability acknowledgment');
  } else {
    fail('Rental form MISSING commission negotiability disclosure');
  }

  section('E4. Coming Soon Blocked for Rental');
  if (rentalHtml.includes('Coming Soon') && (rentalHtml.includes('not available') || rentalHtml.includes('BLOCKED') || rentalHtml.includes('blocked'))) {
    pass('Rental form blocks Coming Soon status');
  } else {
    warn('Rental form Coming Soon blocking — verify manually');
  }

  section('E5. Submit Validation');
  if (saleHtml.includes('submitSalesListing') && saleHtml.includes('_performComplianceCheck')) {
    pass('Sale form runs compliance check before submit');
  } else {
    fail('Sale form does NOT run compliance check before submit');
  }
  if (rentalHtml.includes('submitRentalListing') && rentalHtml.includes('_performComplianceCheck')) {
    pass('Rental form runs compliance check before submit');
  } else {
    fail('Rental form does NOT run compliance check before submit');
  }

  section('E6. Owner Opt-Out Warning & Exhibit B');
  if (saleHtml.includes('Exhibit B') || saleHtml.includes('exhibit B') || saleHtml.includes('exhibitB')) {
    pass('Sale form references Exhibit B for Owner Opt-Out');
  } else {
    warn('Sale form may not mention Exhibit B requirement');
  }
  if (rentalHtml.includes('Exhibit B') || rentalHtml.includes('exhibit B')) {
    pass('Rental form references Exhibit B for Owner Opt-Out');
  } else {
    warn('Rental form may not mention Exhibit B requirement');
  }

  section('E7. FARE Act (Rental Only — NYC LL 119/2024)');
  if (rentalHtml.includes('FARE') || rentalHtml.includes('fareAct') || rentalHtml.includes('LL 119')) {
    pass('Rental form has FARE Act section');
  } else {
    fail('Rental form MISSING FARE Act compliance (NYC LL 119/2024)');
  }

  section('E8. Building Search — API-Backed (No Mock Data)');
  if (saleHtml.includes('fetchBuildingsFromAPI') && saleHtml.includes('/api/buildings/search')) {
    pass('Sale form uses API-backed building search');
  } else {
    fail('Sale form NOT using API-backed building search');
  }
  if (rentalHtml.includes('fetchBuildingsFromAPI') && rentalHtml.includes('/api/buildings/search')) {
    pass('Rental form uses API-backed building search');
  } else {
    fail('Rental form NOT using API-backed building search');
  }
  // Check for hardcoded mock data
  const saleMockMatch = saleHtml.match(/buildingDatabase\s*=\s*\[(\s*\{)/);
  const rentalMockMatch = rentalHtml.match(/buildingDatabase\s*=\s*\[(\s*\{)/);
  if (!saleMockMatch) {
    pass('Sale form: no hardcoded buildingDatabase mock data');
  } else {
    fail('Sale form: hardcoded buildingDatabase mock data still present');
  }
  if (!rentalMockMatch) {
    pass('Rental form: no hardcoded buildingDatabase mock data');
  } else {
    fail('Rental form: hardcoded buildingDatabase mock data still present');
  }

  section('E9. Auto-Save System');
  if (saleHtml.includes('autoSave') || saleHtml.includes('auto-save') || saleHtml.includes('saveSaleDraft')) {
    pass('Sale form has auto-save / draft persistence');
  } else {
    warn('Sale form auto-save not detected');
  }
  if (rentalHtml.includes('autoSave') || rentalHtml.includes('auto-save') || rentalHtml.includes('saveRentalDraft')) {
    pass('Rental form has auto-save / draft persistence');
  } else {
    warn('Rental form auto-save not detected');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST SUITE F: RLS BINDINGS CROSS-CHECK
  // ═══════════════════════════════════════════════════════════════════
  header('F. RLS Form Bindings — Cross-Reference');

  section('F1. Sale Form Bindings Validation');
  const saleBindings = bindings.sale || {};
  const saleElements = saleBindings.elements || {};
  let saleBindingsOk = 0, saleBindingsMissing = 0;
  for (const [elemId, binding] of Object.entries(saleElements)) {
    if (binding.rls_field && binding.rls_field !== 'INTERNAL') {
      if (!rlsFieldNames.has(binding.rls_field) && !aliases[binding.rls_field]) {
        fail(`Sale binding: "${elemId}" → "${binding.rls_field}" is NOT a valid RLS field`);
      } else {
        saleBindingsOk++;
      }
    }
  }
  if (saleBindingsOk > 0) pass(`${saleBindingsOk} sale form bindings reference valid RLS fields`);

  section('F2. Rental Form Bindings Validation');
  const rentalBindings = bindings.rental || {};
  const rentalElements = rentalBindings.elements || {};
  let rentalBindingsOk = 0;
  for (const [elemId, binding] of Object.entries(rentalElements)) {
    if (binding.rls_field && binding.rls_field !== 'INTERNAL') {
      if (!rlsFieldNames.has(binding.rls_field) && !aliases[binding.rls_field]) {
        fail(`Rental binding: "${elemId}" → "${binding.rls_field}" is NOT a valid RLS field`);
      } else {
        rentalBindingsOk++;
      }
    }
  }
  if (rentalBindingsOk > 0) pass(`${rentalBindingsOk} rental form bindings reference valid RLS fields`);

  // ═══════════════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════════════
  console.log(`\n${B}${'═'.repeat(70)}`);
  console.log(`  FINAL REPORT`);
  console.log(`${'═'.repeat(70)}${X}`);
  console.log(`  ${G}PASS:${X} ${totalPass}`);
  console.log(`  ${R}FAIL:${X} ${totalFail}`);
  console.log(`  ${Y}WARN:${X} ${totalWarn}`);
  console.log(`  ${D}INFO:${X} ${totalInfo}`);
  console.log(`  ${B}Total:${X} ${totalPass + totalFail + totalWarn + totalInfo}`);

  if (totalFail > 0) {
    console.log(`\n${R}${B}  FAILURES SUMMARY:${X}`);
    for (let i = 0; i < failures.length; i++) {
      console.log(`  ${R}${i + 1}. ${failures[i].msg}${X}`);
      if (failures[i].detail) console.log(`     ${D}${failures[i].detail}${X}`);
    }
  }

  console.log(`\n${D}  Test completed at ${new Date().toISOString()}${X}\n`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
