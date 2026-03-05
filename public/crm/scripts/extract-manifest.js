#!/usr/bin/env node
/**
 * extract-manifest.js — Extracts a complete manifest from index-built.html
 *
 * Catalogs every element ID, function declaration, onclick/onchange handler,
 * form field, modal, and CSS class so we can validate nothing is lost after rebuild.
 *
 * Usage: node scripts/extract-manifest.js [file]
 * Default file: index-built.html
 * Output: scripts/manifest.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const inputFile = process.argv[2] || path.join(ROOT, 'index-built.html');
const outputFile = path.join(__dirname, 'manifest.json');

if (!fs.existsSync(inputFile)) {
    console.error('File not found: ' + inputFile);
    process.exit(1);
}

const html = fs.readFileSync(inputFile, 'utf8');
const lines = html.split('\n');

const manifest = {
    extractedFrom: path.basename(inputFile),
    extractedAt: new Date().toISOString(),
    totalLines: lines.length,
    elementIds: [],
    functionDeclarations: [],
    eventHandlers: [],       // onclick, onchange, oninput, etc.
    formFields: [],          // input, select, textarea with id or name or data-field
    modals: [],              // elements that look like modal containers
    dataAttributes: [],      // data-reso-field, data-rls-field, data-field, etc.
    cssClasses: [],          // unique classes used in class="" attributes
    scriptSources: [],       // external script src references
    sections: [],            // major section div IDs
};

// ── Extract element IDs ──
const idRegex = /\bid="([^"]+)"/g;
let match;
const idSet = new Set();
while ((match = idRegex.exec(html)) !== null) {
    idSet.add(match[1]);
}
manifest.elementIds = Array.from(idSet).sort();

// ── Extract function declarations ──
// Matches: function name(, var name = function(, window.name = function(
const funcRegex = /(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(|(?:var|let|const|window\.)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\()/g;
const funcSet = new Set();
while ((match = funcRegex.exec(html)) !== null) {
    const name = match[1] || match[2];
    if (name && !name.startsWith('_') || name) {
        funcSet.add(name);
    }
}
manifest.functionDeclarations = Array.from(funcSet).sort();

// ── Extract event handlers (onclick, onchange, oninput, onsubmit, etc.) ──
const handlerRegex = /\b(on(?:click|change|input|submit|keydown|keyup|keypress|focus|blur|mouseover|mouseout|load|scroll))\s*=\s*"([^"]+)"/g;
const handlerSet = new Set();
while ((match = handlerRegex.exec(html)) !== null) {
    handlerSet.add(match[1] + '=' + match[2].substring(0, 100));
}
manifest.eventHandlers = Array.from(handlerSet).sort();

// ── Extract form fields ──
const fieldRegex = /<(?:input|select|textarea)\b[^>]*>/g;
const fields = [];
while ((match = fieldRegex.exec(html)) !== null) {
    const tag = match[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1] || null;
    const name = (tag.match(/\bname="([^"]+)"/) || [])[1] || null;
    const type = (tag.match(/\btype="([^"]+)"/) || [])[1] || null;
    const dataField = (tag.match(/\bdata-field="([^"]+)"/) || [])[1] || null;
    const dataReso = (tag.match(/\bdata-reso-field="([^"]+)"/) || [])[1] || null;
    const dataRls = (tag.match(/\bdata-rls-field="([^"]+)"/) || [])[1] || null;
    if (id || name || dataField || dataReso || dataRls) {
        fields.push({ id, name, type, dataField, dataReso, dataRls });
    }
}
manifest.formFields = fields;

// ── Extract modals ──
const modalRegex = /\bid="([^"]*(?:modal|Modal|lightbox|Lightbox|dialog|Dialog|overlay|Overlay)[^"]*)"/gi;
const modalSet = new Set();
while ((match = modalRegex.exec(html)) !== null) {
    modalSet.add(match[1]);
}
manifest.modals = Array.from(modalSet).sort();

// ── Extract data attributes ──
const dataAttrRegex = /\b(data-(?:reso-field|rls-field|field|value|listing-id|source|compliance|sub-status|reso-value))\s*=\s*"([^"]+)"/g;
const dataAttrSet = new Set();
while ((match = dataAttrRegex.exec(html)) !== null) {
    dataAttrSet.add(match[1] + '=' + match[2]);
}
manifest.dataAttributes = Array.from(dataAttrSet).sort();

// ── Extract major sections ──
const sectionIds = manifest.elementIds.filter(id =>
    id.startsWith('section-') ||
    id.endsWith('Section') ||
    id.endsWith('Page') ||
    id.endsWith('Container') ||
    id.endsWith('Panel') ||
    id.endsWith('Modal') ||
    id.endsWith('modal')
);
manifest.sections = sectionIds;

// ── Summary stats ──
const summary = {
    elementIds: manifest.elementIds.length,
    functionDeclarations: manifest.functionDeclarations.length,
    eventHandlers: manifest.eventHandlers.length,
    formFields: manifest.formFields.length,
    modals: manifest.modals.length,
    dataAttributes: manifest.dataAttributes.length,
    sections: manifest.sections.length,
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));

console.log('Manifest extracted from: ' + path.basename(inputFile));
console.log('Output: ' + outputFile);
console.log('');
console.log('Summary:');
Object.entries(summary).forEach(([key, count]) => {
    console.log('  ' + key + ': ' + count);
});
