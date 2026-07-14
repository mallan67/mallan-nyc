#!/usr/bin/env node
/**
 * Cotality cadence & wording drift validator (COT-1).
 *
 * Single source of truth: lib/cotality/sync-standard.json (parsed as JSON — NOT
 * regex-scraped from TypeScript). The typed accessors in
 * lib/cotality/sync-standard.ts read the same file, so there is no duplicate copy
 * of the 5/15 numbers.
 *
 * Scan design: an EXPLICIT allowlist of current-facing documents (below). Nothing
 * else is scanned — historical records (memory/**, docs/audits/**) are excluded by
 * simply not being on the list, so a filename that merely contains "handoff" or
 * "incident" is never a factor. History is never rewritten; correction notes are
 * added to current-facing docs instead.
 *
 * Phased enforcement (from the json's cotality_cadence_enforcement):
 *   'planned'  — enforce canonical targets + wording; REPORT (don't fail) the
 *                current vercel.json cadence drift, so COT-1 merges with no runtime change.
 *   'enforced' — additionally HARD-FAIL on cadence/threshold mismatch (COT-3).
 *
 * Exit 0 = pass (or reported drift while planned); exit 1 = hard failure.
 * Exported `validate(root)` is pure over a filesystem root for testing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Explicit current-facing scan set (allowlist). Add current docs here; never a glob.
const CURRENT_FACING_DOCS = [
  'docs/architecture/COTALITY-COMPLETE-REFERENCE.md',
  'NEON.md',
  'AGENTS.md',
  'README.md',
  'docs/PROJECT-HEALTH-DASHBOARD.md',
  'docs/operations/neon-compute-attribution-2026-07-14.md',
  'docs/operations/neon-write-churn-forensic-2026-07-14.md',
];
// Current test dirs scanned only in 'enforced' mode. Explicit — not a wildcard.
const CURRENT_TEST_DIRS = ['tests', 'lib/idx/__tests__'];

const CONFLATION = [
  /poll\w*\s*=\s*refresh/i,
  /polling\s+every\s+(five|5)\s*min\w*\s+(meets|satisfies|equals)\s+cotality/i,
  /cotality\s+requires\s+[^.\n]*poll/i,
];
const APPROVED_DRIFT = /(\*\/30|30[\s-]?min\w*|0 \* \* \* \*|hourly)[^\n]{0,60}(approved|cotality[\s-]?align|correct(\s+cadence)?|standard cadence|governing)/i;
const NEGATED = /(drift|was\b|cost|corrected|correction|historical|not approved|do not|stale|deprecated|previously|old\b)/i;

/** @returns {{failures:string[],reported:string[],enforcement:string}} */
function validate(root) {
  const failures = [];
  const reported = [];
  const read = (p) => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; } };

  // 1. Canonical facts (reliable JSON.parse of the single source)
  const jsonRaw = read('lib/cotality/sync-standard.json');
  if (!jsonRaw) { failures.push('lib/cotality/sync-standard.json missing'); return { failures, reported, enforcement: 'unknown' }; }
  let F;
  try { F = JSON.parse(jsonRaw); } catch (e) { failures.push('sync-standard.json invalid JSON: ' + e.message); return { failures, reported, enforcement: 'unknown' }; }
  const enforcement = F.cotality_cadence_enforcement;

  if (F.cotality_property_refresh_target_minutes !== 5) failures.push(`Cotality Property refresh target must be 5 (got ${F.cotality_property_refresh_target_minutes})`);
  if (F.cotality_image_refresh_target_minutes !== 15) failures.push(`Cotality Image refresh target must be 15 (got ${F.cotality_image_refresh_target_minutes})`);
  if (F.mallan_property_poll_minutes !== 5) failures.push(`Mallan Property poll must be 5 (got ${F.mallan_property_poll_minutes})`);
  if (F.mallan_media_poll_minutes !== 15) failures.push(`Mallan Media poll must be 15 (got ${F.mallan_media_poll_minutes})`);
  if (!['planned', 'enforced'].includes(enforcement)) failures.push(`enforcement must be planned|enforced (got ${enforcement})`);

  // 2. Wording rules on current-facing docs (hard-fail in every mode)
  for (const p of CURRENT_FACING_DOCS) {
    const src = read(p);
    if (!src) continue;
    src.split('\n').forEach((line, i) => {
      for (const re of CONFLATION) if (re.test(line)) failures.push(`${p}:${i + 1} refresh/poll conflation`);
      if (APPROVED_DRIFT.test(line) && !NEGATED.test(line)) failures.push(`${p}:${i + 1} calls 30-min/hourly approved/Cotality-aligned`);
    });
  }

  // 3. vercel.json cadence — REPORT while planned, HARD-FAIL when enforced
  const vj = read('vercel.json') || '';
  const prop = (vj.match(/"\/api\/cron\/idx-sync",\s*"schedule":\s*"([^"]+)"/) || [])[1] || null;
  const media = (vj.match(/"\/api\/cron\/media-sync",\s*"schedule":\s*"([^"]+)"/) || [])[1] || null;
  if (prop !== F.expected_property_cron || media !== F.expected_media_cron) {
    const msg = `vercel.json cadence drift — idx-sync="${prop}" (want "${F.expected_property_cron}"), media-sync="${media}" (want "${F.expected_media_cron}")`;
    if (enforcement === 'enforced') failures.push(msg);
    else reported.push(msg);
  }

  // 4. Enforced-only: current tests must not encode a slower approved cadence
  if (enforcement === 'enforced') {
    const walk = (d) => {
      const abs = path.join(root, d);
      if (!fs.existsSync(abs)) return;
      for (const f of fs.readdirSync(abs)) {
        const rp = path.join(d, f);
        const st = fs.statSync(path.join(root, rp));
        if (st.isDirectory()) walk(rp);
        else if (/\.(t|j)sx?$/.test(f)) {
          const s = read(rp) || '';
          if (/(idx-sync|media-sync)[^\n]{0,40}(\*\/30|0 \* \* \* \*|hourly)/i.test(s)) failures.push(`${rp} encodes a slower approved cadence`);
        }
      }
    };
    CURRENT_TEST_DIRS.forEach(walk);
  }

  return { failures, reported, enforcement };
}

module.exports = { validate, CURRENT_FACING_DOCS, CURRENT_TEST_DIRS };

if (require.main === module) {
  const root = process.env.COTALITY_VALIDATOR_ROOT || path.resolve(__dirname, '..');
  const { failures, reported, enforcement } = validate(root);
  console.log(`\n=== Cotality cadence validator — enforcement=${enforcement} ===`);
  if (reported.length) { console.log('\n⚠ REPORTED DRIFT (known; not a failure while planned):'); reported.forEach((r) => console.log('  - ' + r)); }
  if (failures.length) { console.error('\n✖ HARD FAILURES:'); failures.forEach((f) => console.error('  - ' + f)); console.error(`\nRESULT: FAIL (${failures.length})`); process.exit(1); }
  console.log('\nRESULT: PASS' + (reported.length ? ' (with reported drift)' : ''));
  process.exit(0);
}
