#!/usr/bin/env node
/**
 * validate-form-rls.js — REBNY submission-form cross-check (CI: npm run validate:form-rls).
 *
 * Cross-validates the CRM form HTML against collectFormData() and the LIVE COTALITY CONTRACT
 * (lib/cotality/live-contract.ts): every bound field must be a live Property field and every picklist value a
 * live Lookup member. Cotality is the only field / vocabulary authority (owner ruling 2026-09-08); the retired
 * REBNY CSVs and the CSV-generated rls-form-bindings.json are not read and no longer exist.
 *
 * Runs under tsx so the TypeScript contract loads directly:  npm run validate:form-rls
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
// The live Cotality contract — the only field / vocabulary authority.
const liveContract = require(path.join(ROOT, 'lib', 'cotality', 'live-contract'));
// A form control may also bind a declared Mallan-internal key (lib/listings/mallan-form-contract.ts) or a live
// CustomProperty field (the second Cotality resource the forms collect) — the same three authorities the reporter uses.
const { MALLAN_INTERNAL_KEYS } = require(path.join(ROOT, 'lib', 'listings', 'mallan-form-contract'));
const CUSTOM_PROPERTY_FIELDS = new Set(Object.keys(
    (JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cotality-contract', 'contract.compact.json'), 'utf8')).resources.CustomProperty || {}).fields || {},
));
const INTERNAL_KEYS = new Set(MALLAN_INTERNAL_KEYS);

// ── The live Cotality contract — field existence and vocabularies (lib/cotality/live-contract.ts) ──
function loadLiveFields() {
    return liveContract.LIVE_PROPERTY_FIELDS; // Set<string> of live Property field names
}
// Returns Map: fieldName -> Set of live Lookup members (fields without a vocabulary are absent)
function loadLiveLookups() {
    const lookups = new Map();
    for (const field of liveContract.LIVE_PROPERTY_FIELDS) {
        const members = liveContract.liveEnumMembers(field);
        if (members && members.length) lookups.set(field, new Set(members));
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
        // data-cotality-field is the current binding name; data-rls-field is the legacy spelling the held forms carry.
        const rlsField = extractAttr(attrs, 'data-cotality-field') || extractAttr(attrs, 'data-rls-field');
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
    const rlsFieldNames = loadLiveFields();
    const rlsLookups = loadLiveLookups();

    // 1. Extract HTML elements
    const { allIds, allNames, allElementIds, allRlsFields, duplicateIds, selectOptionValues, radioValues } = extractHTMLElements(html);

    // 2. Extract collectFormData references
    const { dataKeys, elementIds, funcFound, whichDef } = extractCollectFormDataRefs(html, collectFuncName);

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
    // CHECK 3: bound fields that are not live Cotality fields (Property / CustomProperty) nor declared Mallan keys
    // ═══════════════════════════════════════════
    console.log(SECTION('3. bound fields that are not live Cotality fields nor declared Mallan-internal keys'));
    const invalidRlsAttrs = [];
    for (const [rlsField, elemIds] of allRlsFields) {
        if (!rlsFieldNames.has(rlsField) && !CUSTOM_PROPERTY_FIELDS.has(rlsField) && !INTERNAL_KEYS.has(rlsField)) {
            invalidRlsAttrs.push({ rlsField, elemIds });
        }
    }
    if (invalidRlsAttrs.length === 0) {
        console.log(PASS('All bound fields are live Cotality fields (Property / CustomProperty) or declared Mallan-internal keys'));
        passCount++;
    } else {
        for (const { rlsField, elemIds } of invalidRlsAttrs.sort((a, b) => a.rlsField.localeCompare(b.rlsField))) {
            console.log(WARN(`bound field "${rlsField}" is not a live Cotality field (Property / CustomProperty) nor a declared Mallan-internal key (on: ${elemIds.join(', ')})`));
            warnCount++;
        }
    }

    // ═══════════════════════════════════════════
    // CHECK 4: Picklist values in HTML that don't match RLS lookup values
    // ═══════════════════════════════════════════
    console.log(SECTION('4. picklist values that are not live Cotality members'));
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
                        console.log(WARN(`Select "${el.id}" (${el.rlsField}): value "${optVal}" is not a live Cotality member`));
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
                console.log(WARN(`Radio/checkbox name="${el.name}" (${el.rlsField}): value "${el.value}" is not a live Cotality member`));
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
    // SUMMARY
    // ═══════════════════════════════════════════
    console.log(SECTION('Summary Statistics'));

    console.log(`  Total HTML elements (input/select/textarea): ${allIds.size} unique IDs, ${allNames.size} unique names`);
    console.log(`  data-rls-field attributes in HTML: ${allRlsFields.size} unique RLS fields`);
    if (funcFound) {
        console.log(`  collectFormData() data keys: ${dataKeys.size}`);
        console.log(`  collectFormData() element refs: ${elementIds.size}`);
    }
    console.log(`  Live Cotality Property fields: ${rlsFieldNames.size} (pull ${liveContract.COTALITY_CONTRACT_PULLED_AT})`);
    console.log(`  Live Cotality Property fields with a vocabulary: ${rlsLookups.size}`);
    console.log('');
    if (criticalCount > 0) console.log(RED + `  ${criticalCount} CRITICAL issue(s)` + RESET);
    if (warnCount > 0) console.log(YELLOW + `  ${warnCount} WARNING(s)` + RESET);
    if (passCount > 0) console.log(GREEN + `  ${passCount} PASS(es)` + RESET);

    return { criticalCount, warnCount, passCount };
}

// ── Main ──
console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  REBNY Form Validation — live Cotality contract cross-check         ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝${RESET}\n`);
console.log(DIM + `  Date: ${new Date().toISOString()}` + RESET);
console.log(DIM + `  Root: ${ROOT}` + RESET);

// Verify files exist
const requiredFiles = [SALE_HTML, RENTAL_HTML];
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
