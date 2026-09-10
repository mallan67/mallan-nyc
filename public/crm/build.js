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

// Every source is normalized to LF on the way in, so the artifact is a function of CONTENT and
// nothing else.
//
// Without this, the artifact inherited whatever line endings the CHECKOUT produced: CRLF on Windows
// (core.autocrlf=true), LF on Linux and on Vercel. The same sources therefore built to two different
// files differing by 34,131 bytes, every one of them a carriage return — which made
// tests/runtime/crm-build-drift.test.ts pass locally and fail on CI without either result saying
// anything about whether the build was actually stale.
//
// `\r\n?` also collapses a LONE carriage return. One committed source
// (js/init/init-disable-dead-controls.js) carried 253 `\r\r\n` sequences from a double CRLF
// conversion; a lone CR makes git classify a file as binary, which is exactly how `* text=auto`
// came to skip normalizing the artifact for months.
//
// This is safe for every input the builder inlines: in JS a raw CR is whitespace outside a string
// and illegal inside one (a template literal normalizes CRLF and CR to LF per spec anyway), and in
// HTML and CSS it is whitespace.
function readFile(relPath) {
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
        console.error('ERROR: File not found: ' + relPath);
        process.exit(1);
    }
    return fs.readFileSync(fullPath, 'utf8').replace(/\r\n?/g, '\n');
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
