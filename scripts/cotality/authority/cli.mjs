#!/usr/bin/env node
// COTALITY AUTHORITY — CLI.
//
//   node scripts/cotality/authority/cli.mjs init --from=<evidence bundle>   state + HEALTHY health from a full compile
//   node scripts/cotality/authority/cli.mjs status                          committed state + health
//   node scripts/cotality/authority/cli.mjs detect [--write]                LIVE: 4 requests → UNCHANGED | CHANGED | UNVERIFIED
//   node scripts/cotality/authority/cli.mjs refresh [--force] [--no-impact] LIVE: incremental recompile → diff → impact → BLOCK
//   node scripts/cotality/authority/cli.mjs simulate --change="<spec>" [--out=<dir>] [--no-impact]
//   node scripts/cotality/authority/cli.mjs impact --changes=<json>         mechanical blast radius for a change set
//   node scripts/cotality/authority/cli.mjs report [<health.json>]          the human-facing BLOCKED report
//
// JSON on stdout; diagnostics on stderr. Exit 0 healthy/unchanged, 1 BLOCKED, 2 UNVERIFIED.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from '../live-client.mjs';
import { compactFromBundle } from '../contract-codegen.mjs';
import {
  PATHS,
  ROOT,
  applySimulatedChange,
  detect,
  diffContracts,
  healthDocument,
  readJson,
  readSnapshot,
  readState,
  refresh,
  renderReport,
  writeJson,
  writeSnapshot,
  writeState,
} from './lib.mjs';

const [command, ...argv] = process.argv.slice(2);
const arg = (name) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const flag = (name) => argv.includes(`--${name}`);

function out(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}
function fail(code, message) {
  console.error(`[authority] ${message}`);
  process.exit(code);
}

async function main() {
  if (!command || command === 'help') {
    out({ commands: ['init --from=<bundle>', 'status', 'detect [--write]', 'refresh [--force] [--no-impact]', 'simulate --change="<spec>" [--out=<dir>] [--no-impact]', 'impact --changes=<json>', 'report [<health.json>]'] });
    return;
  }

  if (command === 'init') {
    const from = arg('from');
    if (!from) fail(2, 'init requires --from=<evidence bundle>');
    const bundle = readJson(path.resolve(from));
    const { compact } = compactFromBundle(bundle);
    const committed = existsSync(PATHS.compact) ? readJson(PATHS.compact) : null;
    if (!committed || committed.fingerprint.content_sha256 !== compact.fingerprint.content_sha256) fail(2, 'init: the committed snapshot does not match this bundle — run cotality:generate first');
    const { stateFromBundle } = await import('./lib.mjs');
    const state = stateFromBundle(bundle, compact);
    writeState(state);
    const health = healthDocument({ state, compact, note: 'initialized from a full live compile' });
    writeJson(PATHS.health, health);
    out({ state, health: { state: health.state, checked_at: health.checked_at } });
    return;
  }

  if (command === 'status') {
    const state = readState();
    const health = existsSync(PATHS.health) ? readJson(PATHS.health) : null;
    out({ state, health });
    process.exit(health?.state === 'HEALTHY' ? 0 : health?.state === 'BLOCKED' ? 1 : 2);
  }

  if (command === 'detect') {
    const state = readState();
    if (!state) fail(2, 'no authority state — run init');
    const client = createCotalityClient();
    const result = await detect(client, state);
    if (flag('write')) {
      const { compact } = readSnapshot();
      writeJson(PATHS.health, healthDocument({ state, compact, detection: result, note: 'detect only — run refresh to recompile and compute impact' }));
    }
    out(result);
    process.exit(result.state === 'UNCHANGED' ? 0 : result.state === 'CHANGED' ? 1 : 2);
  }

  if (command === 'refresh') {
    const state = readState();
    if (!state) fail(2, 'no authority state — run init');
    const previous = readSnapshot();
    const client = createCotalityClient();
    let result;
    try {
      result = await refresh(client, state, previous, { force: flag('force') });
    } catch (error) {
      const health = healthDocument({ state, compact: previous.compact, detection: { state: 'UNVERIFIED', error: String(error?.message || error) }, note: 'refresh failed — committed truth left untouched, verdict UNVERIFIED' });
      writeJson(PATHS.health, health);
      fail(2, `UNVERIFIED: ${error?.message || error}`);
    }
    let impact = null;
    if (result.changes.length && !flag('no-impact')) {
      const { computeImpact } = await import('./impact.mjs');
      impact = computeImpact({ changes: result.changes, compact: result.compact });
    } else if (!result.changes.length) {
      impact = { state: 'HEALTHY', changes: [], affected: [], unbound: [], blocked_surfaces: [], transitive_surfaces: [], repair_order: [] };
    }
    writeSnapshot(result.compact, result.lookups);
    writeState(result.state);
    const health = healthDocument({ state: result.state, compact: result.compact, impact, note: `incremental refresh: ${JSON.stringify(result.requests)}` });
    writeJson(PATHS.health, health);
    out({ changes: result.changes, requests: result.requests, state: result.state, health: { state: health.state } , impact });
    if (impact?.state === 'BLOCKED') console.error(renderReport(impact));
    process.exit(health.state === 'HEALTHY' ? 0 : 1);
  }

  if (command === 'simulate') {
    const spec = arg('change');
    if (!spec) fail(2, 'simulate requires --change="<spec>"');
    const { compact, lookups } = readSnapshot();
    const sim = applySimulatedChange(compact, lookups, spec);
    const changes = diffContracts(compact, lookups, sim.compact, sim.lookups);
    let impact = { state: changes.length ? 'BLOCKED' : 'HEALTHY', changes, affected: [], unbound: [], blocked_surfaces: [], transitive_surfaces: [], repair_order: [] };
    if (!flag('no-impact') && changes.length) {
      const { computeImpact } = await import('./impact.mjs');
      impact = computeImpact({ changes, compact: sim.compact });
    }
    const outDir = arg('out');
    if (outDir) {
      writeJson(path.join(path.resolve(outDir), 'simulated.compact.json'), sim.compact);
      writeJson(path.join(path.resolve(outDir), 'simulated.lookups.json'), sim.lookups);
      writeJson(path.join(path.resolve(outDir), 'simulated.health.json'), healthDocument({ state: readState(), compact: sim.compact, impact, note: `SIMULATION: ${spec}` }));
    }
    out({ simulation: sim.spec, ...impact });
    if (impact.state === 'BLOCKED' && !flag('no-impact')) console.error(renderReport(impact));
    return;
  }

  if (command === 'impact') {
    const file = arg('changes');
    if (!file) fail(2, 'impact requires --changes=<json>');
    const changes = readJson(path.resolve(file));
    const { compact } = readSnapshot();
    const { computeImpact } = await import('./impact.mjs');
    const impact = computeImpact({ changes, compact });
    out(impact);
    console.error(renderReport(impact));
    process.exit(impact.state === 'BLOCKED' ? 1 : 0);
  }

  if (command === 'boundary') {
    const boundaryPath = path.join(ROOT, 'data/cotality-contract/boundary.json');
    const baselinePath = path.join(ROOT, 'data/cotality-contract/boundary-baseline.json');
    const declared = readJson(boundaryPath);
    const { compact } = readSnapshot();
    const { boundaryCensus } = await import('./impact.mjs');
    const census = boundaryCensus({ compact, boundary: declared.boundary });
    if (flag('write-baseline')) {
      const previous = existsSync(baselinePath) ? readJson(baselinePath) : null;
      const keys = census.violations.map((v) => v.key);
      if (previous && keys.some((k) => !previous.keys.includes(k)) && !flag('allow-growth')) {
        fail(1, `baseline may only shrink: ${keys.filter((k) => !previous.keys.includes(k)).length} new key(s) — repair them instead (or pass --allow-growth with Maya's authorization)`);
      }
      writeJson(baselinePath, { format: 'mallan-cotality-boundary-baseline/v1', written_at: new Date().toISOString(), rule: 'This list may only shrink. A key is file::field of a raw Cotality read outside data/cotality-contract/boundary.json.', counts: census.counts, keys });
    }
    out(census);
    return;
  }

  if (command === 'report') {
    const file = argv.find((a) => !a.startsWith('--')) || PATHS.health;
    const health = readJson(path.resolve(file));
    process.stdout.write(renderReport(health) + '\n');
    process.exit(health.state === 'HEALTHY' ? 0 : health.state === 'BLOCKED' ? 1 : 2);
  }

  fail(2, `unknown command ${command}`);
}

main().catch((error) => fail(2, error?.stack || error?.message || String(error)));
void ROOT;
