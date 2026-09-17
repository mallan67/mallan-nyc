#!/usr/bin/env node
// SEARCH CLOSURE — the only command allowed to say Search passed.
//
//   npm run search:closure                 PR-level: schema-only provider contract
//   npm run search:closure -- --full       release-level: full field/relationship probes
//   npm run search:closure -- --allow-dirty --stages=git-state,provider-contract
//
// Verdict is exactly one of PASS | BLOCKED | UNVERIFIED and is bound to the exact git SHA.
// Stages run in dependency order. A stage that is not yet implemented is reported UNVERIFIED with
// the reason "not implemented" — the verdict cannot be PASS until every stage exists and passes.
// No agent decides which stages are sufficient; the list below does.
//
// Evidence lands in artifacts/search-closure/<sha>/ with a manifest.json that hashes every stage
// file. Evidence from another SHA is a different directory and cannot be mistaken for this one.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STATE, gitState, parseArgs, aggregate, exitFor, sha256, now, readStage, writeStage } from './lib.mjs';

const args = parseArgs();
const g = gitState();
const outDir = args.out || path.join('artifacts', 'search-closure', g.short ?? '_unbound');

// Dependency order. Each entry: stage name -> script. A missing script is UNVERIFIED, not skipped.
const STAGES = [
  ['git-state',          'capture-git-state.mjs'],
  ['provider-contract',  'verify-provider-contract.mjs'],
  ['capability-graph',   'compile-capability-graph.mjs'],
  ['lineage',            'verify-lineage.mjs'],
  ['universe',           'verify-universe.mjs'],
  ['consumers',          'verify-consumers.mjs'],
  ['browser',            'verify-browser.mjs'],
  ['performance',        'verify-performance.mjs'],
];
const only = args.stages ? new Set(String(args.stages).split(',').map((s) => s.trim())) : null;
const passthrough = Object.entries(args).filter(([k]) => !['_', 'out', 'stages'].includes(k)).map(([k, v]) => (v === true ? `--${k}` : `--${k}=${v}`));

console.error(`[closure] ${g.branch}@${g.short}${g.dirty ? ' DIRTY' : ''} -> ${outDir}`);
const results = [];
for (const [stage, script] of STAGES) {
  if (only && !only.has(stage)) continue;
  const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), script);
  if (!existsSync(file)) {
    const { body } = await writeStage(outDir, stage, { state: STATE.UNVERIFIED, reason: 'not implemented' });
    results.push(body);
    console.error(`[closure] ${stage.padEnd(18)} UNVERIFIED — not implemented`);
    continue;
  }
  const run = spawnSync(process.execPath, [file, `--out=${outDir}`, ...passthrough], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', env: process.env });
  const body = (await readStage(outDir, stage)) ?? { stage, state: STATE.UNVERIFIED, reason: `stage wrote no result (exit ${run.status})` };
  results.push(body);
  // A BLOCKED git-state stops the run: nothing downstream can bind to an unknown identity.
  if (stage === 'git-state' && body.state === STATE.BLOCKED) break;
}

const verdict = aggregate(results.map((r) => r.state));
const contract = results.find((r) => r.stage === 'provider-contract');
const manifest = {
  format: 'mallan-search-closure-manifest/v1',
  verdict,
  produced_at: now(),
  git: g,
  provider_contract_sha256: contract?.fingerprint?.evidence_sha256 ?? null,
  stages: await Promise.all(results.map(async (r) => {
    const f = path.join(outDir, `${r.stage}.json`);
    return { stage: r.stage, state: r.state, reason: r.reason ?? null, file: f, sha256: sha256(await readFile(f, 'utf8')) };
  })),
};
manifest.manifest_sha256 = sha256({ ...manifest, produced_at: null });
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.error('');
for (const s of manifest.stages) console.error(`  ${s.state.padEnd(11)} ${s.stage}${s.reason ? '  — ' + s.reason : ''}`);
console.error(`\n[closure] VERDICT ${verdict}  sha=${g.short}${g.dirty ? ' (dirty)' : ''}  contract=${manifest.provider_contract_sha256?.slice(0, 12) ?? 'none'}\n[closure] manifest ${path.join(outDir, 'manifest.json')}`);
process.stdout.write(verdict + '\n');
process.exit(exitFor(verdict));
