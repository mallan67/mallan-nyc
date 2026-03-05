#!/usr/bin/env node
/**
 * validate-manifest.js — Compares a new build against the baseline manifest
 *
 * Usage: node scripts/validate-manifest.js [new-file]
 * Default new-file: index-built.html
 *
 * Compares against scripts/manifest.json (baseline).
 * Reports: missing IDs, missing functions, missing handlers, missing fields.
 * Exit code: 0 = pass, 1 = failures found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const baselineFile = path.join(__dirname, 'manifest.json');
const newFile = process.argv[2] || path.join(ROOT, 'index-built.html');

if (!fs.existsSync(baselineFile)) {
    console.error('No baseline manifest found. Run extract-manifest.js first.');
    process.exit(1);
}
if (!fs.existsSync(newFile)) {
    console.error('New build file not found: ' + newFile);
    process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const html = fs.readFileSync(newFile, 'utf8');

let failures = 0;
let warnings = 0;

function checkPresence(category, items, searchIn) {
    const missing = [];
    const found = [];
    items.forEach(item => {
        if (searchIn.includes(item)) {
            found.push(item);
        } else {
            missing.push(item);
        }
    });
    return { missing, found, total: items.length };
}

console.log('=== MANIFEST VALIDATION ===');
console.log('Baseline: ' + baseline.extractedFrom + ' (' + baseline.extractedAt + ')');
console.log('New build: ' + path.basename(newFile) + ' (' + html.split('\n').length + ' lines)');
console.log('');

// 1. Element IDs
const idResult = checkPresence('Element IDs', baseline.elementIds, html);
console.log('Element IDs: ' + idResult.found.length + '/' + idResult.total + ' found');
if (idResult.missing.length > 0) {
    failures += idResult.missing.length;
    console.log('  MISSING (' + idResult.missing.length + '):');
    idResult.missing.forEach(id => console.log('    - ' + id));
}

// 2. Function declarations
const funcResult = checkPresence('Functions', baseline.functionDeclarations, html);
console.log('Functions: ' + funcResult.found.length + '/' + funcResult.total + ' found');
if (funcResult.missing.length > 0) {
    failures += funcResult.missing.length;
    console.log('  MISSING (' + funcResult.missing.length + '):');
    funcResult.missing.forEach(fn => console.log('    - ' + fn));
}

// 3. Modals
const modalResult = checkPresence('Modals', baseline.modals, html);
console.log('Modals: ' + modalResult.found.length + '/' + modalResult.total + ' found');
if (modalResult.missing.length > 0) {
    failures += modalResult.missing.length;
    console.log('  MISSING (' + modalResult.missing.length + '):');
    modalResult.missing.forEach(m => console.log('    - ' + m));
}

// 4. Sections
const sectionResult = checkPresence('Sections', baseline.sections, html);
console.log('Sections: ' + sectionResult.found.length + '/' + sectionResult.total + ' found');
if (sectionResult.missing.length > 0) {
    failures += sectionResult.missing.length;
    console.log('  MISSING (' + sectionResult.missing.length + '):');
    sectionResult.missing.forEach(s => console.log('    - ' + s));
}

// 5. Form fields (check by ID)
const fieldIds = baseline.formFields.filter(f => f.id).map(f => f.id);
const fieldResult = checkPresence('Form Fields (by ID)', fieldIds, html);
console.log('Form Fields (by ID): ' + fieldResult.found.length + '/' + fieldResult.total + ' found');
if (fieldResult.missing.length > 0) {
    warnings += fieldResult.missing.length;
    console.log('  MISSING (' + fieldResult.missing.length + '):');
    fieldResult.missing.slice(0, 20).forEach(f => console.log('    - ' + f));
    if (fieldResult.missing.length > 20) console.log('    ... and ' + (fieldResult.missing.length - 20) + ' more');
}

// 6. Key event handlers (check function names are still callable)
const handlerFunctions = new Set();
baseline.eventHandlers.forEach(h => {
    const fnMatch = h.match(/=([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (fnMatch) handlerFunctions.add(fnMatch[1]);
});
const handlerFuncList = Array.from(handlerFunctions);
const handlerResult = checkPresence('Handler Functions', handlerFuncList, html);
console.log('Handler Functions: ' + handlerResult.found.length + '/' + handlerResult.total + ' found');
if (handlerResult.missing.length > 0) {
    failures += handlerResult.missing.length;
    console.log('  MISSING (' + handlerResult.missing.length + '):');
    handlerResult.missing.forEach(f => console.log('    - ' + f));
}

console.log('');
console.log('=== RESULT ===');
if (failures === 0 && warnings === 0) {
    console.log('PASS — All elements preserved.');
} else if (failures === 0) {
    console.log('PASS (with ' + warnings + ' warnings) — No critical losses.');
} else {
    console.log('FAIL — ' + failures + ' critical items missing, ' + warnings + ' warnings.');
}

process.exit(failures > 0 ? 1 : 0);
