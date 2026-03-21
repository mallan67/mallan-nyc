/*
 scripts/insert-map-calls.js
 - Backup lib/idx/trestle-mapper.ts -> .bak
 - Add import for trestle-custom-mapper if missing
 - Insert mapCustomProperties/mapMedia calls before the first "return mapped;" after the first "const mapped" or "let mapped"
 - Idempotent: if file already contains mapCustomProperties, exits without changes
*/
const fs = require('fs');
const path = require('path');
const file = path.resolve('lib/idx/trestle-mapper.ts');

if (!fs.existsSync(file)) {
  console.error('MISSING_FILE:', file);
  process.exit(1);
}
let txt = fs.readFileSync(file,'utf8');

// idempotency
if (txt.includes('mapCustomProperties') || txt.includes('mapMedia(')) {
  console.log('ALREADY_PATCHED: trestle-mapper already contains mapping calls.');
  process.exit(0);
}

// backup
fs.copyFileSync(file, file + '.bak');
console.log('BACKUP_WRITTEN:', file + '.bak');

// add import if missing
const importLine = "import { mapCustomProperties, mapMedia } from './trestle-custom-mapper';\n";
if (!txt.includes(importLine)) {
  // find last import block
  const importRegex = /^import .*;$/gm;
  let lastImportIndex = -1;
  let match;
  while ((match = importRegex.exec(txt)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }
  if (lastImportIndex >= 0) {
    // insert after last import line and newline
    const before = txt.slice(0, lastImportIndex);
    const after = txt.slice(lastImportIndex);
    txt = before + '\n' + importLine + after;
    console.log('IMPORT_INSERTED');
  } else {
    // no imports; place at top
    txt = importLine + '\n' + txt;
    console.log('IMPORT_INSERTED_AT_TOP');
  }
} else {
  console.log('IMPORT_ALREADY_PRESENT');
}

// find insertion point: first "const mapped" or "let mapped"
const mappedPos = (() => {
  const c = txt.indexOf('const mapped');
  const l = txt.indexOf('let mapped');
  if (c === -1) return l;
  if (l === -1) return c;
  return Math.min(c, l);
})();
if (mappedPos === -1) {
  console.error('COULD_NOT_FIND_MAPPED_VARIABLE: no "const mapped" or "let mapped" found. Aborting.');
  // restore backup
  fs.writeFileSync(file, fs.readFileSync(file + '.bak','utf8'), 'utf8');
  process.exit(2);
}

// find the first "return mapped;" after mappedPos
const returnRegex = /return\s+mapped\s*;/g;
returnRegex.lastIndex = mappedPos;
const rmatch = returnRegex.exec(txt);
if (!rmatch) {
  console.error('COULD_NOT_FIND_RETURN_MAPPED: Aborting.');
  fs.writeFileSync(file, fs.readFileSync(file + '.bak','utf8'), 'utf8');
  process.exit(3);
}
const insertPos = rmatch.index;

// prepare insertion text
const insertText = '\n    // Lift folded Trestle CustomProperty/Media into mapped\n    mapped = mapCustomProperties(raw, mapped);\n    mapped = mapMedia(raw, mapped);\n\n';

// insert before return mapped;
txt = txt.slice(0, insertPos) + insertText + txt.slice(insertPos);

// write file
fs.writeFileSync(file, txt, 'utf8');
console.log('PATCH_APPLIED:', file);
