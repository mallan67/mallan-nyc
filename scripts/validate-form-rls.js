#!/usr/bin/env node
/**
 * validate-form-rls.js
 *
 * Cross-validates HTML form elements, collectFormData() mappings,
 * rls-form-bindings.json, and authoritative RLS field/lookup CSVs.
 *
 * Usage:  node scripts/validate-form-rls.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── ANSI colors ──
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const CRITICAL = (msg) => `${RED}${BOLD}  CRITICAL${RESET}${RED}  ${msg}${RESET}`;
const WARN     = (msg) => `${YELLOW}  WARN${RESET}${YELLOW}      ${msg}${RESET}`;
const PASS     = (msg) => `${GREEN}  PASS${RESET}${GREEN}      ${msg}${RESET}`;
const HEADER   = (msg) => `\n${CYAN}${BOLD}${'═'.repeat(70)}\n  ${msg}\n${'═'.repeat(70)}${RESET}`;
const SECTION  = (msg) => `\n${BOLD}  ── ${msg} ──${RESET}`;

// ── Paths ──
const ROOT = path.resolve(__dirname, '..');
const SALE_HTML   = path.join(ROOT, 'public', 'crm', 'SALE-FORM-REDESIGN.html');
const RENTAL_HTML = path.join(ROOT, 'public', 'crm', 'RENTAL-FORM-REDESIGN.html');
const BINDINGS    = path.join(ROOT, 'data', 'rls-form-bindings.json');
const FIELDS_CSV  = path.join(ROOT, 'data', 'rebny-rls-property-fields.csv');
const LOOKUP_CSV  = path.join(ROOT, 'data', 'rebny-rls-property-lookup.csv');

// ── CSV parser (handles quoted fields with commas and escaped quotes) ──
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current);
    return fields;
}

// ── Load authoritative RLS fields from CSV ──
function loadRLSFields() {
    const content = fs.readFileSync(FIELDS_CSV, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const fieldNames = new Set();
    // Skip header (line 0)
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        // Column 1 = "Attribute Name - Current System", Column 3 = "MatrixFieldName"
        const attrName = (cols[1] || '').trim();
        const matrixName = (cols[3] || '').trim();
        if (matrixName) fieldNames.add(matrixName);
        if (attrName && attrName !== matrixName) fieldNames.add(attrName);
    }
    return fieldNames;
}

// ── Load RLS lookup values from CSV ──
// Returns Map: fieldName -> Set of valid values
function loadRLSLookups() {
    const content = fs.readFileSync(LOOKUP_CSV, 'utf8');
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const lookups = new Map(); // fieldName -> Set<value>
    // Skip header rows (lines 0 and 1)
    for (let i = 2; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        // Column 2 = LookupName, Column 3 = Value (Current), Column 6 = MatrixWebapi_Value
        const lookupName = (cols[2] || '').trim();
        const valueCurrent = (cols[3] || '').trim();
        const matrixValue = (cols[6] || '').trim();
        if (!lookupName) continue;
        if (!lookups.has(lookupName)) lookups.set(lookupName, new Set());
        const valSet = lookups.get(lookupName);
        if (valueCurrent) valSet.add(valueCurrent);
        if (matrixValue && matrixValue !== valueCurrent) valSet.add(matrixValue);
    }
    return lookups;
}

// ── Extract form element info from HTML ──
function extractHTMLElements(html) {
    const elements = [];    // { id, name, tagName, type, rlsField, values[] }
    const idSet = new Map(); // id -> count (for duplicate detection on form elements)

    // Also collect ALL element IDs (any tag) for container reference checks
    const allElementIds = new Set();
    const anyIdRegex = /\bid="([^"]+)"/gi;
    let anyMatch;
    while ((anyMatch = anyIdRegex.exec(html)) !== null) {
        allElementIds.add(anyMatch[1]);
    }

    // Match input, select, textarea tags (single line and multiline)
    // We need to handle tags that span multiple lines
    const tagRegex = /<(input|select|textarea)\b([^>]*?)(?:\/>|>)/gi;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const tagName = match[1].toLowerCase();
        const attrs = match[2];

        const id = extractAttr(attrs, 'id');
        const name = extractAttr(attrs, 'name');
        const type = extractAttr(attrs, 'type') || (tagName === 'select' ? 'select' : tagName === 'textarea' ? 'textarea' : 'text');
        const rlsField = extractAttr(attrs, 'data-rls-field');
        const value = extractAttr(attrs, 'value');

        if (id) {
            idSet.set(id, (idSet.get(id) || 0) + 1);
        }

        elements.push({ id, name, tagName, type, rlsField, value });
    }

    // Extract select option values: find <select id="xxx"> ... </select> blocks
    const selectOptionValues = new Map(); // selectId -> [values]
    const selectRegex = /<select\b[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi;
    while ((match = selectRegex.exec(html)) !== null) {
        const selectId = match[1];
        const body = match[2];
        const optValues = [];
        const optRegex = /<option\b[^>]*value="([^"]*)"[^>]*>/gi;
        let optMatch;
        while ((optMatch = optRegex.exec(body)) !== null) {
            const v = optMatch[1].trim();
            if (v) optValues.push(v);
        }
        selectOptionValues.set(selectId, optValues);
    }

    // Extract radio/checkbox values by name
    const radioValues = new Map(); // name -> [values]
    for (const el of elements) {
        if ((el.type === 'radio' || el.type === 'checkbox') && el.name && el.value) {
            if (!radioValues.has(el.name)) radioValues.set(el.name, []);
            radioValues.get(el.name).push(el.value);
        }
    }

    // Collect all unique IDs
    const allIds = new Set(elements.filter(e => e.id).map(e => e.id));
    // Collect all unique names
    const allNames = new Set(elements.filter(e => e.name).map(e => e.name));
    // Collect all data-rls-field values
    const allRlsFields = new Map(); // rlsField -> [elementIds]
    for (const el of elements) {
        if (el.rlsField) {
            if (!allRlsFields.has(el.rlsField)) allRlsFields.set(el.rlsField, []);
            allRlsFields.get(el.rlsField).push(el.id || el.name || '(unnamed)');
        }
    }

    // Find duplicate IDs
    const duplicateIds = [];
    for (const [id, count] of idSet) {
        if (count > 1) duplicateIds.push({ id, count });
    }

    return { elements, allIds, allNames, allElementIds, allRlsFields, duplicateIds, selectOptionValues, radioValues };
}

function extractAttr(attrStr, attrName) {
    // Match attr="value" or attr='value'
    const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i');
    const m = attrStr.match(regex);
    return m ? m[1] : null;
}

// ── Extract element IDs referenced in collectFormData() ──
// The "second" definition is the one with `var data = { listing_type: ...}`
function extractCollectFormDataRefs(html, funcName) {
    // Find all occurrences of the function
    const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\(\\s*\\)\\s*\\{`, 'g');
    const matches = [];
    let m;
    while ((m = funcRegex.exec(html)) !== null) {
        matches.push(m.index);
    }

    if (matches.length === 0) {
        return { dataKeys: new Set(), elementIds: new Set(), funcFound: false, whichDef: 'none' };
    }

    // Find the "second" definition (the one with RLS mapping: `var data = { listing_type:`)
    // If there's only one, use it. If multiple, find the one with `var data = { listing_type:`
    let targetStart = -1;
    for (const startIdx of matches) {
        const snippet = html.substring(startIdx, startIdx + 500);
        if (/var\s+data\s*=\s*\{\s*listing_type\s*:/.test(snippet)) {
            targetStart = startIdx;
            break;
        }
    }
    // Fallback to last definition
    if (targetStart === -1) {
        targetStart = matches[matches.length - 1];
    }

    // Extract function body by counting braces
    let braceDepth = 0;
    let started = false;
    let funcEnd = targetStart;
    for (let i = targetStart; i < html.length; i++) {
        if (html[i] === '{') {
            braceDepth++;
            started = true;
        } else if (html[i] === '}') {
            braceDepth--;
            if (started && braceDepth === 0) {
                funcEnd = i + 1;
                break;
            }
        }
    }
    const funcBody = html.substring(targetStart, funcEnd);

    // Extract data.xxx assignments (RLS field keys being set)
    const dataKeys = new Set();
    // data.FieldName = ...
    const dataAssignRegex = /data\.(\w+)\s*=/g;
    while ((m = dataAssignRegex.exec(funcBody)) !== null) {
        dataKeys.add(m[1]);
    }
    // data['FieldName'] = ...
    const dataBracketRegex = /data\[['"](\w+)['"]\]\s*=/g;
    while ((m = dataBracketRegex.exec(funcBody)) !== null) {
        dataKeys.add(m[1]);
    }

    // Extract element IDs referenced via getElementById or val()
    const elementIds = new Set();
    // document.getElementById('xxx')
    const getByIdRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
    while ((m = getByIdRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // val('xxx') helper
    const valRegex = /\bval\(['"]([^'"]+)['"]\)/g;
    while ((m = valRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // checked('xxx') helper
    const checkedRegex = /\bchecked\(['"]([^'"]+)['"]\)/g;
    while ((m = checkedRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // radioVal('xxx') helper
    const radioValRegex = /\bradioVal\(['"]([^'"]+)['"]\)/g;
    while ((m = radioValRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // checkedValues('xxx') helper
    const checkedValuesRegex = /\bcheckedValues\(['"]([^'"]+)['"]\)/g;
    while ((m = checkedValuesRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // document.querySelector('input[name="xxx"]')
    const querySelectorNameRegex = /querySelector\(['"]input\[name=\\?["']([^'"\\]+)\\?["']\]/g;
    while ((m = querySelectorNameRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }
    // querySelectorAll('input[name="xxx"]')
    const querySelectorAllNameRegex = /querySelectorAll\(['"]input\[name=\\?["']([^'"\\]+)\\?["']\]/g;
    while ((m = querySelectorAllNameRegex.exec(funcBody)) !== null) {
        elementIds.add(m[1]);
    }

    // Also extract `data.xxx` references on the RHS of assignments — those are
    // element IDs that came from the generic querySelectorAll loop earlier in
    // the function body (e.g. `parseFloat(data.saleOriginalPrice || '0')`).
    //
    // The regex captures every `data.X` occurrence; we filter afterwards.
    //
    // Skip rules (in order):
    //   1. `dataKeys` — names that appear as LHS assignments (`data.X = ...`).
    //      These are output RLS field names being written, not element IDs.
    //      Using the dynamic `dataKeys` set (built above) is self-healing: any
    //      new RLS output field added to collectFormData() is automatically
    //      recognized without updating a hardcoded list.
    //   2. Native JS members (push/length/forEach) captured on arrays.
    const NATIVE_MEMBERS = new Set(['push', 'length', 'forEach', 'map', 'filter', 'find', 'some', 'every', 'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split', 'trim', 'toLowerCase', 'toUpperCase']);
    const dataRefRegex = /data\.(\w+)/g;
    while ((m = dataRefRegex.exec(funcBody)) !== null) {
        const key = m[1];
        if (dataKeys.has(key)) continue;        // Rule 1 — LHS output key, not an element ID
        if (NATIVE_MEMBERS.has(key)) continue;  // Rule 2 — array/string member access
        elementIds.add(key);
    }

    return { dataKeys, elementIds, funcFound: true, whichDef: matches.length > 1 ? 'second (RLS mapping)' : 'only' };
}

// ── Validate one form ──
function validateForm(formLabel, htmlPath, formKey, collectFuncName) {
    console.log(HEADER(formLabel));

    const html = fs.readFileSync(htmlPath, 'utf8');
    const bindingsJson = JSON.parse(fs.readFileSync(BINDINGS, 'utf8'));
    const rlsFieldNames = loadRLSFields();
    const rlsLookups = loadRLSLookups();

    // 1. Extract HTML elements
    const { allIds, allNames, allElementIds, allRlsFields, duplicateIds, selectOptionValues, radioValues } = extractHTMLElements(html);

    // 2. Extract collectFormData references
    const { dataKeys, elementIds, funcFound, whichDef } = extractCollectFormDataRefs(html, collectFuncName);

    // 3. Load bindings for this form
    const formBindings = (bindingsJson.files && bindingsJson.files[formKey])
        ? bindingsJson.files[formKey].bindings || {}
        : {};

    let criticalCount = 0;
    let warnCount = 0;
    let passCount = 0;

    // ═══════════════════════════════════════════
    // CHECK 1: Element IDs in collectFormData() that don't exist in HTML
    // ═══════════════════════════════════════════
    console.log(SECTION('1. Element IDs in collectFormData() missing from HTML'));
    if (!funcFound) {
        console.log(WARN(`${collectFuncName}() not found in file`));
        warnCount++;
    } else {
        console.log(DIM + `  Using ${whichDef} definition of ${collectFuncName}()` + RESET);
        const missingFromHTML = [];
        const containerOnly = []; // exists as div/container but not as form element
        for (const refId of elementIds) {
            // Check against both IDs and names (radio groups use name)
            if (!allIds.has(refId) && !allNames.has(refId)) {
                if (allElementIds.has(refId)) {
                    containerOnly.push(refId);
                } else {
                    missingFromHTML.push(refId);
                }
            }
        }
        if (missingFromHTML.length === 0 && containerOnly.length === 0) {
            console.log(PASS('All element references in collectFormData() exist in HTML'));
            passCount++;
        } else {
            for (const id of missingFromHTML.sort()) {
                console.log(CRITICAL(`Element "${id}" referenced in collectFormData() but NOT found in HTML (null read)`));
                criticalCount++;
            }
            for (const id of containerOnly.sort()) {
                console.log(PASS(`"${id}" is a container/div (not a form element) — OK for getElementById()`));
            }
            if (missingFromHTML.length === 0) passCount++;
        }
    }

    // ═══════════════════════════════════════════
    // CHECK 2: Required RLS fields from bindings not mapped in collectFormData()
    // ═══════════════════════════════════════════
    console.log(SECTION('2. RLS-bound fields from bindings NOT mapped in collectFormData()'));
    if (!funcFound) {
        console.log(WARN(`Skipped — ${collectFuncName}() not found`));
        warnCount++;
    } else {
        const rlsBoundBindings = {};
        for (const [elemId, binding] of Object.entries(formBindings)) {
            if (binding.rlsField && !binding.internal) {
                rlsBoundBindings[elemId] = binding.rlsField;
            }
        }

        const unmappedRLS = [];
        for (const [elemId, rlsField] of Object.entries(rlsBoundBindings)) {
            // Check if either the element ID appears in collectFormData references
            // OR the RLS field name appears in data keys
            const mappedViaData = dataKeys.has(rlsField);
            const referencedInFunc = elementIds.has(elemId);
            if (!mappedViaData && !referencedInFunc) {
                unmappedRLS.push({ elemId, rlsField });
            }
        }

        if (unmappedRLS.length === 0) {
            console.log(PASS('All RLS-bound fields from bindings are mapped in collectFormData()'));
            passCount++;
        } else {
            for (const { elemId, rlsField } of unmappedRLS.sort((a, b) => a.rlsField.localeCompare(b.rlsField))) {
                console.log(WARN(`RLS field "${rlsField}" (element: ${elemId}) not explicitly mapped in collectFormData()`));
                warnCount++;
            }
            console.log(DIM + `  Note: The generic querySelectorAll loop may collect these via element ID/name.` + RESET);
        }
    }

    // ═══════════════════════════════════════════
    // CHECK 3: data-rls-field attributes that don't match RLS property fields CSV
    // ═══════════════════════════════════════════
    console.log(SECTION('3. data-rls-field attributes not in RLS property fields CSV'));
    const invalidRlsAttrs = [];
    for (const [rlsField, elemIds] of allRlsFields) {
        if (!rlsFieldNames.has(rlsField)) {
            invalidRlsAttrs.push({ rlsField, elemIds });
        }
    }
    if (invalidRlsAttrs.length === 0) {
        console.log(PASS('All data-rls-field attributes match valid RLS property fields'));
        passCount++;
    } else {
        for (const { rlsField, elemIds } of invalidRlsAttrs.sort((a, b) => a.rlsField.localeCompare(b.rlsField))) {
            console.log(WARN(`data-rls-field="${rlsField}" not found in RLS fields CSV (on: ${elemIds.join(', ')})`));
            warnCount++;
        }
    }

    // ═══════════════════════════════════════════
    // CHECK 4: Picklist values in HTML that don't match RLS lookup values
    // ═══════════════════════════════════════════
    console.log(SECTION('4. Picklist values not matching RLS lookup values'));
    let picklistMismatches = 0;

    // Check select options for elements that have data-rls-field
    for (const el of extractHTMLElements(html).elements) {
        if (el.rlsField && el.id) {
            const validValues = rlsLookups.get(el.rlsField);
            if (!validValues) continue; // No lookup for this field — it's a free-text field

            // Check select options
            const optionValues = selectOptionValues.get(el.id);
            if (optionValues && optionValues.length > 0) {
                for (const optVal of optionValues) {
                    if (optVal && !validValues.has(optVal)) {
                        console.log(WARN(`Select "${el.id}" (${el.rlsField}): value "${optVal}" not in RLS lookups`));
                        warnCount++;
                        picklistMismatches++;
                    }
                }
            }
        }
    }

    // Check radio/checkbox values for groups with data-rls-field
    for (const el of extractHTMLElements(html).elements) {
        if (el.rlsField && el.name && (el.type === 'radio' || el.type === 'checkbox')) {
            const validValues = rlsLookups.get(el.rlsField);
            if (!validValues) continue;
            if (el.value && !validValues.has(el.value)) {
                console.log(WARN(`Radio/checkbox name="${el.name}" (${el.rlsField}): value "${el.value}" not in RLS lookups`));
                warnCount++;
                picklistMismatches++;
            }
        }
    }

    if (picklistMismatches === 0) {
        console.log(PASS('All picklist values match RLS lookup values (or field has no lookup)'));
        passCount++;
    }

    // ═══════════════════════════════════════════
    // CHECK 5: Duplicate element IDs
    // ═══════════════════════════════════════════
    console.log(SECTION('5. Duplicate element IDs'));
    if (duplicateIds.length === 0) {
        console.log(PASS('No duplicate element IDs found'));
        passCount++;
    } else {
        for (const { id, count } of duplicateIds.sort((a, b) => a.id.localeCompare(b.id))) {
            console.log(CRITICAL(`Duplicate ID "${id}" appears ${count} times`));
            criticalCount++;
        }
    }

    // ═══════════════════════════════════════════
    // CHECK 6: Bindings JSON element IDs that don't exist in HTML
    // ═══════════════════════════════════════════
    console.log(SECTION('6. Bindings JSON element IDs missing from HTML'));
    const bindingsMissing = [];
    for (const elemId of Object.keys(formBindings)) {
        if (!allIds.has(elemId) && !allNames.has(elemId)) {
            bindingsMissing.push(elemId);
        }
    }
    if (bindingsMissing.length === 0) {
        console.log(PASS('All bindings JSON element IDs exist in HTML'));
        passCount++;
    } else {
        for (const id of bindingsMissing.sort()) {
            console.log(WARN(`Bindings JSON references "${id}" but not found in HTML`));
            warnCount++;
        }
    }

    // ═══════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════
    console.log(SECTION('Summary Statistics'));

    const rlsBound = Object.values(formBindings).filter(b => b.rlsField && !b.internal).length;
    const internalOnly = Object.values(formBindings).filter(b => b.internal).length;
    const totalBindings = Object.keys(formBindings).length;

    console.log(`  Total HTML elements (input/select/textarea): ${allIds.size} unique IDs, ${allNames.size} unique names`);
    console.log(`  data-rls-field attributes in HTML: ${allRlsFields.size} unique RLS fields`);
    console.log(`  Bindings JSON entries: ${totalBindings} (${rlsBound} RLS-bound, ${internalOnly} internal)`);
    if (funcFound) {
        console.log(`  collectFormData() data keys: ${dataKeys.size}`);
        console.log(`  collectFormData() element refs: ${elementIds.size}`);
    }
    console.log(`  RLS fields in CSV: ${rlsFieldNames.size}`);
    console.log(`  RLS lookup fields in CSV: ${rlsLookups.size}`);
    console.log('');
    if (criticalCount > 0) console.log(RED + `  ${criticalCount} CRITICAL issue(s)` + RESET);
    if (warnCount > 0) console.log(YELLOW + `  ${warnCount} WARNING(s)` + RESET);
    if (passCount > 0) console.log(GREEN + `  ${passCount} PASS(es)` + RESET);

    return { criticalCount, warnCount, passCount };
}

// ── Main ──
console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  RLS Form Validation — Cross-Reference Report                      ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝${RESET}\n`);
console.log(DIM + `  Date: ${new Date().toISOString()}` + RESET);
console.log(DIM + `  Root: ${ROOT}` + RESET);

// Verify files exist
const requiredFiles = [SALE_HTML, RENTAL_HTML, BINDINGS, FIELDS_CSV, LOOKUP_CSV];
for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
        console.error(RED + `\n  FATAL: Required file not found: ${f}` + RESET);
        process.exit(1);
    }
}
console.log(GREEN + `  All ${requiredFiles.length} required files found.` + RESET);

const saleResult = validateForm(
    'SALE FORM — SALE-FORM-REDESIGN.html',
    SALE_HTML,
    'SALE-FORM-REDESIGN.html',
    'collectSaleFormData'
);

const rentalResult = validateForm(
    'RENTAL FORM — RENTAL-FORM-REDESIGN.html',
    RENTAL_HTML,
    'RENTAL-FORM-REDESIGN.html',
    'collectRentalFormData'
);

// ── Grand Total ──
console.log(HEADER('GRAND TOTAL'));
const totalCrit = saleResult.criticalCount + rentalResult.criticalCount;
const totalWarn = saleResult.warnCount + rentalResult.warnCount;
const totalPass = saleResult.passCount + rentalResult.passCount;

if (totalCrit > 0) console.log(RED + BOLD + `  ${totalCrit} CRITICAL` + RESET);
if (totalWarn > 0) console.log(YELLOW + `  ${totalWarn} WARNING(s)` + RESET);
console.log(GREEN + `  ${totalPass} PASS(es)` + RESET);

if (totalCrit > 0) {
    console.log(RED + `\n  Exit code: 1 (critical issues found)` + RESET + '\n');
    process.exit(1);
} else if (totalWarn > 0) {
    console.log(YELLOW + `\n  Exit code: 0 (warnings only — review recommended)` + RESET + '\n');
} else {
    console.log(GREEN + `\n  Exit code: 0 (all checks passed)` + RESET + '\n');
}
