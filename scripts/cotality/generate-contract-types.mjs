#!/usr/bin/env node
// Generate the TypeScript Cotality contract from a live evidence bundle.
//
//   node scripts/cotality/generate-contract-types.mjs --from=artifacts/cotality-contract/latest-light.json
//       writes data/cotality-contract/contract.compact.json
//              data/cotality-contract/lookups.live.json
//              lib/cotality/generated/contract.ts
//
//   node scripts/cotality/generate-contract-types.mjs --check
//       re-renders lib/cotality/generated/contract.ts from the COMMITTED snapshots in memory and
//       exits 1 unless the file on disk is byte-identical. Run by tests/runtime/cotality-generated-contract.test.ts.
//
// The bundle must come from `compile-live-contract.mjs --light` or `--full` (per-field probes). A
// schema-only bundle is refused: existence without measurement is exactly the half-knowledge that
// produced the errors this module exists to end.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactFromBundle, renderContractTs } from './contract-codegen.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPACT_PATH = path.join(ROOT, 'data/cotality-contract/contract.compact.json');
const LOOKUPS_PATH = path.join(ROOT, 'data/cotality-contract/lookups.live.json');
const GENERATED_PATH = path.join(ROOT, 'lib/cotality/generated/contract.ts');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const fromArg = argv.find((a) => a.startsWith('--from='));
const allowSchemaOnly = argv.includes('--allow-schema-only');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function stable(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

if (check) {
  if (!existsSync(COMPACT_PATH) || !existsSync(LOOKUPS_PATH) || !existsSync(GENERATED_PATH)) {
    console.error('CHECK FAIL: snapshot or generated module missing. Run with --from=<bundle>.');
    process.exit(1);
  }
  const compact = readJson(COMPACT_PATH);
  const lookups = readJson(LOOKUPS_PATH);
  const expected = renderContractTs(compact, lookups);
  const actual = readFileSync(GENERATED_PATH, 'utf8').replace(/\r\n/g, '\n');
  if (expected !== actual) {
    console.error('CHECK FAIL: lib/cotality/generated/contract.ts differs from a regeneration of the committed snapshot.');
    console.error('Regenerate (never hand-edit): node scripts/cotality/generate-contract-types.mjs --from=<bundle>');
    process.exit(1);
  }
  if (!allowSchemaOnly && compact.probe_mode === 'schema-only') {
    console.error('CHECK FAIL: committed snapshot is schema-only (no live probes). Compile with --light or --full.');
    process.exit(1);
  }
  console.log(`CHECK OK: contract.ts matches snapshot (probe_mode=${compact.probe_mode}, metadata_sha=${compact.fingerprint.metadata_sha256?.slice(0, 12)}, acquired_at=${compact.fingerprint.acquired_at})`);
  process.exit(0);
}

if (!fromArg) {
  console.error('Usage: generate-contract-types.mjs --from=<evidence bundle .json> | --check');
  process.exit(2);
}

const bundlePath = path.resolve(fromArg.slice('--from='.length));
const bundle = readJson(bundlePath);
const { compact, lookups } = compactFromBundle(bundle);

if (compact.probe_mode === 'schema-only' && !allowSchemaOnly) {
  console.error(`REFUSED: ${bundlePath} is schema-only (no live field probes). Compile with --light or --full so filterable/populated are MEASURED.`);
  process.exit(2);
}

const unmeasured = [];
for (const [resource, r] of Object.entries(compact.resources)) {
  if (r.access.state !== 'accessible') continue;
  for (const [field, f] of Object.entries(r.fields)) {
    if (typeof f.filterable !== 'boolean') unmeasured.push(`${resource}.${field}`);
  }
}
if (unmeasured.length && !allowSchemaOnly) {
  console.error(`REFUSED: ${unmeasured.length} fields on accessible resources have no filterable verdict (probe UNVERIFIED): ${unmeasured.slice(0, 10).join(', ')}${unmeasured.length > 10 ? ', …' : ''}`);
  process.exit(2);
}

mkdirSync(path.dirname(COMPACT_PATH), { recursive: true });
mkdirSync(path.dirname(GENERATED_PATH), { recursive: true });
writeFileSync(COMPACT_PATH, stable(compact));
writeFileSync(LOOKUPS_PATH, stable(lookups));
writeFileSync(GENERATED_PATH, renderContractTs(compact, lookups));

const accessible = Object.entries(compact.resources).filter(([, r]) => r.access.state === 'accessible').map(([n]) => n);
const rejected = Object.entries(compact.resources).filter(([, r]) => r.access.state === 'rejected').map(([n, r]) => `${n}(${r.access.http})`);
console.log(JSON.stringify({
  wrote: [path.relative(ROOT, COMPACT_PATH), path.relative(ROOT, LOOKUPS_PATH), path.relative(ROOT, GENERATED_PATH)],
  probe_mode: compact.probe_mode,
  acquired_at: compact.fingerprint.acquired_at,
  metadata_sha256: compact.fingerprint.metadata_sha256,
  resources: compact.resourceCount,
  fields: compact.fieldCount,
  navigations: compact.navigationCount,
  accessible,
  rejected,
  lookupFields: Object.values(lookups).reduce((n, r) => n + Object.keys(r).length, 0),
}, null, 2));
