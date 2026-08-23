#!/usr/bin/env node
/**
 * scripts/cotality/snapshot.js — Capture an `analyze` JSON snapshot to a
 * dated file so you can diff state across runs (e.g. overnight, before/
 * after a deploy, or during a sync convergence window).
 *
 * Output: artifacts/cotality-snapshots/YYYY-MM-DDTHHmmssZ.json
 *         artifacts/cotality-snapshots/latest.json (always overwritten)
 *
 * The `latest.json` symlink-equivalent makes diffing trivial:
 *   diff <(cat artifacts/cotality-snapshots/2026-04-29*.json | jq) \
 *        <(cat artifacts/cotality-snapshots/latest.json | jq)
 *
 * Read-only against the project. One Trestle session worth of probes
 * (same as `cotality:analyze`).
 */
require('dotenv').config({ path: '.env.local' });
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const SNAPSHOT_DIR = path.join(process.cwd(), 'artifacts', 'cotality-snapshots');

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

(async () => {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const child = spawn(process.execPath, [path.join(__dirname, 'analyze.js'), '--json'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let buf = '';
  child.stdout.on('data', (chunk) => { buf += chunk.toString(); });

  const code = await new Promise((res) => child.on('exit', res));
  if (code !== 0) {
    console.error(`[snapshot] analyze.js exited ${code}`);
    process.exit(code || 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(buf);
  } catch (err) {
    console.error('[snapshot] could not parse analyze.js JSON output:', err.message);
    process.exit(1);
  }

  const filename = `${ts()}.json`;
  const fullPath = path.join(SNAPSHOT_DIR, filename);
  const latestPath = path.join(SNAPSHOT_DIR, 'latest.json');
  const pretty = JSON.stringify(parsed, null, 2);

  fs.writeFileSync(fullPath, pretty);
  fs.writeFileSync(latestPath, pretty);

  // Brief stdout summary
  const t = parsed.trestle || {};
  const db = parsed.db || {};
  const pub = parsed.public_site || {};
  const delta = parsed.parity_delta || {};
  console.log(`[snapshot] saved → ${path.relative(process.cwd(), fullPath)}`);
  console.log(`[snapshot] trestle active=${t.active_total} | DB active=${db.listingsActive} | projection=${db.projectionTotal} | public=${pub.api_listings?.total}`);
  console.log(`[snapshot] Δ trestle-public=${delta.trestle_displayable_minus_public_site} | DB-projection=${delta.db_listings_minus_projection}`);

  // List the two most recent snapshots so the user can diff
  const all = fs.readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'latest.json')
    .sort();
  if (all.length >= 2) {
    const prev = all[all.length - 2];
    console.log(`[snapshot] previous run: ${prev}`);
    console.log(`[snapshot] diff command: diff <(jq . ${path.join(SNAPSHOT_DIR, prev)}) <(jq . ${fullPath})`);
  }
})().catch((err) => {
  console.error('[snapshot] fatal:', err);
  process.exit(1);
});
