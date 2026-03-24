#!/usr/bin/env node
/**
 * build.js — Assembles index-built.html from modular source files
 *
 * Reads index.html line by line, inlines all CSS, HTML partials, and JS
 * into a single standalone HTML file (like the original SEARCH-STANDALONE.html).
 *
 * Usage: node build.js
 * Output: index-built.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'index-built.html');

function readFile(relPath) {
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
        console.error('ERROR: File not found: ' + relPath);
        process.exit(1);
    }
    return fs.readFileSync(fullPath, 'utf8');
}

// Strip </script> from JS content to prevent premature script block closure.
// The HTML parser closes the script block on </script> even inside JS comments.
// We replace the closing tag pattern with a safe version.
function escapeScriptClose(jsContent) {
    return jsContent.replace(/<\/script/gi, '< /script');
}

const lines = readFile('index.html').split('\n');
const output = [];
let stats = { cssInlined: 0, htmlInlined: 0, jsInlined: 0 };

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── CSS: Replace <link rel="stylesheet" href="css/..."> ──
    const cssMatch = trimmed.match(/^<link\s+rel="stylesheet"\s+href="(css\/[^"]+)"/);
    if (cssMatch) {
        const cssPath = cssMatch[1];
        const content = readFile(cssPath);
        if (stats.cssInlined === 0) {
            output.push('    <style>');
        }
        output.push('    /* ═══ ' + cssPath + ' ═══ */');
        output.push(content);
        // Check if next line is also a CSS link; if not, close the style tag
        const nextTrimmed = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
        if (!nextTrimmed.match(/^<link\s+rel="stylesheet"\s+href="css\//)) {
            output.push('    </style>');
        }
        stats.cssInlined++;
        continue;
    }

    // ── HTML: Replace <!-- @include path/to/file.html --> ──
    const includeMatch = trimmed.match(/^<!-- @include ([^\s]+) -->$/);
    if (includeMatch) {
        const htmlPath = includeMatch[1];
        const content = readFile(htmlPath);
        output.push('<!-- ═══ ' + htmlPath + ' ═══ -->');
        output.push(content);
        stats.htmlInlined++;
        continue;
    }

    // ── JS: Replace <script src="js/..."></script> or <script src="tests/..."></script> ──
    const scriptMatch = trimmed.match(/^<script\s+src="((?:js|tests)\/[^"]+)">\s*<\/script>$/);
    if (scriptMatch) {
        const jsPath = scriptMatch[1];
        const content = readFile(jsPath);
        const escaped = escapeScriptClose(content);
        output.push('<script>');
        output.push('// ═══ ' + jsPath + ' ═══');
        output.push(escaped);
        output.push('</script>');
        stats.jsInlined++;
        continue;
    }

    // ── Pass through all other lines ──
    output.push(line);
}

const result = output.join('\n');
fs.writeFileSync(OUTPUT, result, 'utf8');

const totalLines = result.split('\n').length;
const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
console.log('Built: ' + OUTPUT);
console.log('  Lines: ' + totalLines);
console.log('  Size:  ' + sizeKB + ' KB');
console.log('  CSS inlined:  ' + stats.cssInlined + ' files');
console.log('  HTML inlined: ' + stats.htmlInlined + ' files');
console.log('  JS inlined:   ' + stats.jsInlined + ' files');

// Validation
const scriptOpen = (result.match(/<script/g) || []).length;
const scriptClose = (result.match(/<\/script>/g) || []).length;
const divOpen = (result.match(/<div[\s>]/g) || []).length;
const divClose = (result.match(/<\/div>/g) || []).length;
console.log('  <script> tags: ' + scriptOpen + ' open, ' + scriptClose + ' close');
console.log('  <div> tags: ' + divOpen + ' open, ' + divClose + ' close (balance: ' + (divOpen - divClose) + ')');
