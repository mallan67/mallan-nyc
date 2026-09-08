#!/usr/bin/env node
// Stage: provider-contract — acquire the live Cotality contract and fingerprint it.
//
// Wraps scripts/cotality/compile-live-contract.mjs (the single live acquisition path). The stage
// does not interpret the contract; it proves the contract was acquired COMPLETELY from the live
// API and records the fingerprint every later stage must cite.
//
// PASS        compile succeeded, every required catalogue (Field/Lookup/Model + service document)
//             complete, fingerprint present.
// UNVERIFIED  provider unreachable, credentials missing, a required catalogue incomplete, or the
//             compiler refused. Missing live evidence is never PASS.
// BLOCKED     (not produced here — nothing about the provider can block; it can only be unproven)
//
// --full   probe every declared field/relationship (thousands of requests; release-level)
// default  --schema-only (PR-level): $metadata + Field + Lookup + Model + service document

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { STATE, parseArgs, writeStage, exitFor, sha256 } from './lib.mjs';

const args = parseArgs();
const outDir = args.out || 'artifacts/search-closure/_unbound';
const full = Boolean(args.full);
const bundlePath = path.join(outDir, 'cotality-contract.json');

const compiler = 'scripts/cotality/compile-live-contract.mjs';
const argv = [compiler, full ? '--full' : '--schema-only', `--out=${bundlePath}`, `--concurrency=${args.concurrency || 3}`];
console.error(`[closure:provider-contract] node ${argv.join(' ')}`);
const run = spawnSync(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: process.env });

let state = STATE.UNVERIFIED;
let reason = null;
let fingerprint = null;
let summary = null;

if (run.status !== 0) {
  reason = `compiler exited ${run.status}: ${(run.stderr || '').trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`;
} else {
  try {
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
    fingerprint = bundle.fingerprint ?? null;
    summary = bundle.summary ?? null;
    if (!fingerprint?.evidence_sha256) reason = 'bundle carries no evidence_sha256';
    else if (summary?.allCatalogsComplete !== true) reason = 'a required catalogue is incomplete';
    else state = STATE.PASS;
  } catch (error) {
    reason = `bundle unreadable: ${error?.message || error}`;
  }
}

const { body } = await writeStage(outDir, 'provider-contract', {
  state,
  reason,
  mode: full ? 'full' : 'schema-only',
  bundle: bundlePath,
  bundle_sha256: state === STATE.PASS ? sha256(await readFile(bundlePath, 'utf8')) : null,
  fingerprint,
  summary,
});
console.error(`[closure:provider-contract] ${state}${reason ? ' — ' + reason : ''}${fingerprint ? ' evidence=' + fingerprint.evidence_sha256.slice(0, 12) : ''}`);
process.stdout.write(JSON.stringify({ stage: body.stage, state, fingerprint: fingerprint?.evidence_sha256 ?? null }) + '\n');
process.exit(exitFor(state));
