#!/usr/bin/env node
// scripts/ci/check-crm-build.mjs
//
// CRM static shell drift guard.
//
// /crm/search is served by `public/crm/index-built.html`, a 36k-line bundle
// generated from `public/crm/{index.html, css/, html/, js/}` via
// `public/crm/build.js`. There is no auto-rebuild; the bundle drifts whenever
// a source file is edited without running `npm run crm:build`.
//
// This guard runs in CI on every PR + push to main:
//   1. Capture current bytes of public/crm/index-built.html into memory.
//   2. Spawn `node public/crm/build.js` (which overwrites the file on disk).
//   3. Compare the rebuilt bytes against the captured bytes (sha256).
//   4. Restore the captured bytes UNCONDITIONALLY so the working tree stays
//      clean whether the check passes or fails.
//   5. Exit 0 on match, 1 on drift, 2 if build.js itself errors.
//
// The restore-on-exit invariant means this check is non-destructive: a CI
// failure leaves the file untouched on disk, so the developer can inspect
// `npm run crm:build` output locally and decide whether to commit the rebuild.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const TARGET = resolve(REPO_ROOT, 'public/crm/index-built.html');
const BUILD_SCRIPT = resolve(REPO_ROOT, 'public/crm/build.js');
const TARGET_REL = relative(REPO_ROOT, TARGET).replace(/\\/g, '/');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

console.log('[crm-build-drift] Reading current shell: ' + TARGET_REL);
const original = readFileSync(TARGET);
const originalHash = sha256(original);
console.log('  current  sha256=' + originalHash.slice(0, 16) + '...  size=' + original.length + ' bytes');

console.log('[crm-build-drift] Running build.js to regenerate shell...');
try {
  execFileSync(process.execPath, [BUILD_SCRIPT], { stdio: 'inherit' });
} catch (err) {
  // Restore original before exiting so working tree is clean.
  writeFileSync(TARGET, original);
  console.error('\n[crm-build-drift] ERROR: public/crm/build.js exited non-zero.');
  console.error('  Working tree restored.');
  process.exit(2);
}

const rebuilt = readFileSync(TARGET);
const rebuiltHash = sha256(rebuilt);
console.log('  rebuilt  sha256=' + rebuiltHash.slice(0, 16) + '...  size=' + rebuilt.length + ' bytes');

// Restore original bytes UNCONDITIONALLY so the working tree stays clean
// whether this check passes or fails.
writeFileSync(TARGET, original);

if (originalHash === rebuiltHash) {
  console.log('\n[crm-build-drift] PASS - ' + TARGET_REL + ' is in sync with sources.');
  process.exit(0);
}

const delta = rebuilt.length - original.length;
console.error('');
console.error('[crm-build-drift] FAIL - ' + TARGET_REL + ' is OUT OF SYNC with sources.');
console.error('  current  bytes=' + original.length + '  sha256=' + originalHash);
console.error('  rebuilt  bytes=' + rebuilt.length + '  sha256=' + rebuiltHash);
console.error('  delta    bytes=' + (delta >= 0 ? '+' : '') + delta);
console.error('');
console.error('  One or more source files in public/crm/{index.html, html/, css/, js/}');
console.error('  have changed but ' + TARGET_REL + ' was not rebuilt.');
console.error('');
console.error('  To fix locally:');
console.error('    npm run crm:build');
console.error('    git diff public/crm/index-built.html   # inspect changes');
console.error('    # smoke-test /crm/search end-to-end');
console.error('    git add public/crm/index-built.html');
console.error('    git commit -m "chore(crm): rebuild static search shell"');
console.error('');
console.error('  Working tree was restored to original state by this check.');
process.exit(1);
