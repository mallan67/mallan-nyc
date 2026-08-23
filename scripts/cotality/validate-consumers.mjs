#!/usr/bin/env node
/**
 * COTALITY CONTRACT VALIDATION - do Mallan's consumers name real provider fields?
 *
 * This owns the provider-fact checks that used to live in the separate RLS
 * validator. It answers exactly one question, and only that question:
 *
 *   Does every Cotality field identity Mallan references exist on the live
 *   Cotality contract, with the resource it is attributed to?
 *
 * IT IS NOT A COMPLIANCE VALIDATOR. REBNY, UCBA, Fair Housing and NY law are
 * enforced by Mallan's one compliance system, not here. The old validator mixed
 * the two, which is how a provider-field question came to be answered by a
 * "REBNY IDX Plus is the authority" rename table.
 *
 * AUTHORITY: data/cotality-contract/crm-field-contract.json, which is derived
 * from the live API by build-crm-field-contract.mjs and carries the verification
 * state of the run that produced it. A contract not stamped VERIFIED_LIVE is not
 * usable here - UNVERIFIED is never success.
 */
import fs from 'fs';
import path from 'path';

const CONTRACT = 'data/cotality-contract/crm-field-contract.json';
const CRM_ROOT = 'public/crm';
const MAP_SOURCE = 'public/crm/js/core/cotality-field-map.js';
const BUILT = 'public/crm/index-built.html';

let failures = 0;
let checks = 0;

function ok(name) {
  checks += 1;
  if (process.env.VERBOSE) console.log('  PASS  ' + name);
}
function bad(name, detail) {
  checks += 1;
  failures += 1;
  console.error('  FAIL  ' + name);
  if (detail) console.error('        ' + detail);
}

// -- 1. The contract must itself be live-verified --------------------------
if (!fs.existsSync(CONTRACT)) {
  console.error('FAIL: ' + CONTRACT + ' missing. Run npm run cotality:crm-contract.');
  process.exit(1);
}
const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));

if (contract.verificationState !== 'VERIFIED_LIVE') {
  bad(
    'contract is live-verified',
    'verificationState=' + contract.verificationState +
      '. A contract that is not VERIFIED_LIVE cannot validate anything.',
  );
} else {
  ok('contract is live-verified');
}

if (Object.keys(contract.rejected || {}).length > 0) {
  bad('contract has no rejected fields', Object.keys(contract.rejected).join(', '));
} else {
  ok('contract has no rejected fields');
}

const resolution = contract.resolution || {};

// -- 2. Every field identity the CRM names must resolve --------------------
/**
 * Provider field identities tagged onto rendered elements.
 *
 * Mallan-derived presentation keys are lowercase and are deliberately NOT
 * checked: they are Mallan's own concepts and make no provider claim. Only
 * provider-shaped PascalCase names are held to the contract.
 */
function taggedNames(dir, acc = new Map()) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') taggedNames(full, acc);
      continue;
    }
    if (!/\.(js|html)$/.test(e.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const rx = /data-cotality-field=["']([^"']+)["']/g;
    let m;
    while ((m = rx.exec(src)) !== null) {
      if (!/^[A-Z]/.test(m[1])) continue;
      if (!acc.has(m[1])) acc.set(m[1], full);
    }
  }
  return acc;
}

const tagged = taggedNames(CRM_ROOT);
if (tagged.size === 0) {
  // A sweep that finds nothing passes everything below it.
  bad('found tagged provider fields to check', 'zero tags found - the scan is not working');
} else {
  ok('found ' + tagged.size + ' tagged provider field identities');
}

for (const [name, file] of tagged) {
  if (!resolution[name]) {
    bad(
      'data-cotality-field="' + name + '" resolves on the live contract',
      file + ' - the live Cotality contract declares no such field',
    );
  }
}
if (failures === 0) ok('every tagged field identity resolves');

// -- 3. The map must not drift between source and build --------------------
/**
 * The CRM ships a built HTML bundle with the map inlined. If the built copy and
 * the source copy disagree, the browser is using a mapping nobody reviewed.
 */
function extractMap(content) {
  const at = content.indexOf('COTALITY_FIELD_MAP');
  if (at < 0) return null;
  const start = content.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < content.length && i < start + 20000; i += 1) {
    if (content[i] === '{') depth += 1;
    if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

const sourceMap = fs.existsSync(MAP_SOURCE) ? extractMap(fs.readFileSync(MAP_SOURCE, 'utf8')) : null;
const builtMap = fs.existsSync(BUILT) ? extractMap(fs.readFileSync(BUILT, 'utf8')) : null;

if (!sourceMap) bad('source map found', MAP_SOURCE);
else if (!builtMap) bad('built map found', BUILT);
else {
  const drift = [];
  const rx = /^\s+([A-Za-z0-9_]+):\s*'([^']+)'/gm;
  const readEntries = (block) => {
    const out = new Map();
    let m;
    const r = new RegExp(rx.source, 'gm');
    while ((m = r.exec(block)) !== null) out.set(m[1], m[2]);
    return out;
  };
  const a = readEntries(sourceMap);
  const b = readEntries(builtMap);
  for (const [k, v] of a) {
    if (b.get(k) !== v) drift.push(k + ': source="' + v + '" built="' + (b.get(k) ?? 'ABSENT') + '"');
  }
  if (drift.length) bad('built map matches source', drift.slice(0, 8).join('; '));
  else ok('built map matches source (' + a.size + ' entries)');
}

// -- Result ----------------------------------------------------------------
console.log(
  '\n[cotality:validate] ' + (failures === 0 ? 'PASS' : 'FAIL') +
    ' - ' + checks + ' checks, ' + failures + ' failures',
);
process.exit(failures === 0 ? 0 : 1);
