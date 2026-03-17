#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// INJECT RLS ATTRIBUTES INTO HTML FILES
// Reads data/rls-form-bindings.json and injects:
//   data-rls-field="FieldName"    for RLS-bound elements
//   data-rls-ignore="true"        for internal-only elements
//   data-rls-viewer="true"        on <body> of viewer files
//
// Usage: node scripts/inject-rls-attributes.js [--dry-run]
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SEARCH_MODULAR = path.resolve(REPO_ROOT, 'public', 'crm');
const BINDINGS_PATH = path.join(REPO_ROOT, 'data', 'rls-form-bindings.json');
const DRY_RUN = process.argv.includes('--dry-run');

// File path mapping (filename → full path)
const FILE_PATHS = {
  'SALE-FORM-REDESIGN.html':     path.join(SEARCH_MODULAR, 'SALE-FORM-REDESIGN.html'),
  'RENTAL-FORM-REDESIGN.html':   path.join(SEARCH_MODULAR, 'RENTAL-FORM-REDESIGN.html'),
  'SALE-FORM-WITH-TOOLS.html':   path.join(SEARCH_MODULAR, 'SALE-FORM-WITH-TOOLS.html'),
  'RENTAL-FORM-WITH-TOOLS.html': path.join(SEARCH_MODULAR, 'RENTAL-FORM-WITH-TOOLS.html'),
  'index-built.html':            path.join(SEARCH_MODULAR, 'index-built.html'),
};

// Viewer files get data-rls-viewer="true" on <body>
const VIEWER_FILES = new Set([
  'SALE-FORM-WITH-TOOLS.html',
  'RENTAL-FORM-WITH-TOOLS.html',
]);

function main() {
  console.log('Injecting RLS attributes into HTML files...\n');
  if (DRY_RUN) console.log('  (DRY RUN — no files will be modified)\n');

  if (!fs.existsSync(BINDINGS_PATH)) {
    console.error('Binding map not found. Run: node scripts/generate-rls-bindings.js');
    process.exit(1);
  }

  const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, 'utf8'));
  let totalBound = 0;
  let totalIgnored = 0;
  let totalSkipped = 0;
  let totalAlreadyTagged = 0;

  for (const [fname, fileData] of Object.entries(bindings.files)) {
    const filePath = FILE_PATHS[fname];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`  SKIP: ${fname} — file not found`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let fileBound = 0;
    let fileIgnored = 0;
    let fileSkipped = 0;
    let fileAlready = 0;

    for (const [elementId, binding] of Object.entries(fileData.bindings)) {
      // Build regex patterns to find this element by id or name attribute
      // We need to handle both id="xxx" and name="xxx"
      // Match the opening tag that contains id="elementId" or name="elementId"

      // Escape special regex chars in the element ID
      const escaped = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Pattern: find a tag with id="elementId" or name="elementId"
      // We insert the data attribute right before the closing > of the tag
      const patterns = [
        // id="elementId" — match the whole opening tag
        new RegExp(`(<(?:input|select|textarea)[^>]*\\bid="${escaped}"[^>]*?)(/?>)`, 'i'),
        // name="elementId" — only if id pattern didn't match
        new RegExp(`(<(?:input|select|textarea)[^>]*\\bname="${escaped}"[^>]*?)(/?>)`, 'i'),
      ];

      let matched = false;
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (!match) continue;

        const tagContent = match[1];
        const tagClose = match[2];

        // Skip if already has data-rls-field or data-rls-ignore
        if (tagContent.includes('data-rls-field') || tagContent.includes('data-rls-ignore')) {
          fileAlready++;
          matched = true;
          break;
        }

        let attr;
        if (binding.rlsField) {
          attr = ` data-rls-field="${binding.rlsField}"`;
          fileBound++;
        } else if (binding.internal) {
          attr = ' data-rls-ignore="true"';
          fileIgnored++;
        } else {
          // Unknown — skip (should not happen with 0 unknowns)
          fileSkipped++;
          matched = true;
          break;
        }

        // Insert attribute before the closing >
        content = content.replace(pattern, `$1${attr}$2`);
        matched = true;
        break;
      }

      if (!matched) {
        // Element not found in HTML — might be a radio button name attribute
        // Try matching input[type="radio"][name="elementId"] — just the first occurrence
        const radioPattern = new RegExp(
          `(<input[^>]*\\btype=["']radio["'][^>]*\\bname="${escaped}"[^>]*?)(/?>)`, 'i'
        );
        const radioMatch = content.match(radioPattern);
        if (radioMatch) {
          const tagContent = radioMatch[1];
          if (tagContent.includes('data-rls-field') || tagContent.includes('data-rls-ignore')) {
            fileAlready++;
          } else {
            let attr;
            if (binding.rlsField) {
              attr = ` data-rls-field="${binding.rlsField}"`;
              fileBound++;
            } else if (binding.internal) {
              attr = ' data-rls-ignore="true"';
              fileIgnored++;
            } else {
              fileSkipped++;
              continue;
            }
            // Tag ALL radio inputs with this name, not just the first
            const allRadioPattern = new RegExp(
              `(<input[^>]*\\btype=["']radio["'][^>]*\\bname="${escaped}"[^>]*?)(/?>)`, 'gi'
            );
            content = content.replace(allRadioPattern, `$1${attr}$2`);
          }
        } else {
          fileSkipped++;
        }
      }
    }

    // Add data-rls-viewer="true" to <body> for viewer files
    if (VIEWER_FILES.has(fname)) {
      if (content.includes('data-rls-viewer')) {
        // Already tagged
      } else {
        content = content.replace(/<body([^>]*)>/, '<body$1 data-rls-viewer="true">');
        console.log(`  ${fname}: Added data-rls-viewer="true" to <body>`);
      }
    }

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }

    totalBound += fileBound;
    totalIgnored += fileIgnored;
    totalSkipped += fileSkipped;
    totalAlreadyTagged += fileAlready;

    console.log(`  ${fname}: ${fileBound} bound, ${fileIgnored} ignored, ${fileSkipped} skipped, ${fileAlready} already tagged`);
  }

  console.log(`\nTOTAL: ${totalBound} bound, ${totalIgnored} ignored, ${totalSkipped} skipped, ${totalAlreadyTagged} already tagged`);
  if (DRY_RUN) console.log('\n(DRY RUN — no files were modified)');
}

main();
