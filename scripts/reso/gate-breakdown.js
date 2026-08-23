#!/usr/bin/env node
/**
 * scripts/reso/gate-breakdown.js — For a given starting filter, show
 * how many listings are eliminated by each successive gate.
 *
 * Useful when "Trestle says X but our public site shows Y" — narrows
 * the gap to a specific gate so you can see whether the drop is
 * compliance-correct (e.g. participant-only) or a sync issue.
 *
 * Trestle calls: 1 baseline + up to 4 gate probes (pet-friendly /
 * AVM / consumer-comment / coming-soon counts) per invocation.
 * IDX-PLUS-aware: skips gate fields that aren't queryable on the IDX
 * Plus tier (OwnerOptOut, ParticipantOnly).
 *
 * Usage:
 *   npm run reso:gate-breakdown
 *   npm run reso:gate-breakdown -- --status=Active --type=sale
 *   npm run reso:gate-breakdown -- --status=Active --type=sale --json
 *   npm run reso:gate-breakdown -- --dry-run     # emit the OData queries without running them
 *
 * Flags:
 *   --status=<RESO StandardStatus>   default 'Active'
 *   --type=<sale|rent|all>           default 'all'
 *   --json                           emit a single JSON object
 *   --dry-run                        list the queries without executing — useful when quota is exhausted
 */
require('dotenv').config({ path: '.env.local' });
const { odataCount } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

(async () => {
  const status = arg('status', 'Active');
  const typeFlag = arg('type', 'all');
  const json = process.argv.includes('--json');
  const dryRun = process.argv.includes('--dry-run');

  const propertyTypeClause =
    typeFlag === 'sale' ? `PropertyType eq 'Residential'` :
    typeFlag === 'rent' ? `PropertyType eq 'ResidentialLease'` :
    null;

  const baseFilter =
    `StandardStatus eq '${status}'` +
    (propertyTypeClause ? ` and ${propertyTypeClause}` : '');

  // Each row = one Trestle probe. Order matters: each probe answers
  // "how many listings ALSO match this gate-blocking condition?" relative
  // to the baseline, NOT a chained narrowing.
  const probes = [
    { name: 'baseline', filter: baseFilter, kind: 'total', note: `Active listings of the requested type.` },
    { name: 'idx_display_yn=false', filter: `${baseFilter} and InternetEntireListingDisplayYN eq false`, kind: 'gate', note: 'Listings the participant flagged off public IDX entirely.' },
    { name: 'address_display_yn=false', filter: `${baseFilter} and InternetAddressDisplayYN eq false`, kind: 'gate', note: 'Listings with the address sub-gate off (cascade applies).' },
    { name: 'avm_display=false', filter: `${baseFilter} and InternetAutomatedValuationDisplayYN eq false`, kind: 'gate', note: 'Listings opted out of AVM display (Zestimate-equivalent).' },
    { name: 'consumer_comment_yn=false', filter: `${baseFilter} and InternetConsumerCommentYN eq false`, kind: 'gate', note: 'Listings opted out of public comments / reviews.' },
    { name: 'auction=true', filter: `${baseFilter} and AuctionYN eq true`, kind: 'flag', note: 'Auction listings — UCBA Art. I auction display rules apply.' },
  ];

  if (dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      base_filter: baseFilter,
      probes_planned: probes.map(({ name, filter, note }) => ({ name, filter, note })),
      note: 'No Trestle queries issued. Re-run without --dry-run when quota is available.',
    }, null, 2));
    return;
  }

  const t0 = Date.now();
  const results = [];
  let baselineTotal = null;

  for (const probe of probes) {
    const count = await odataCount('Property', probe.filter);
    if (probe.kind === 'total') baselineTotal = count;
    results.push({
      ...probe,
      count,
      pct_of_baseline: baselineTotal !== null && count !== null
        ? Math.round((count / Math.max(baselineTotal, 1)) * 1000) / 10
        : null,
    });
  }

  const elapsedMs = Date.now() - t0;

  const report = {
    captured_at: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    base_filter: baseFilter,
    note_idx_plus_quirks: 'OwnerOptOut and ParticipantOnly are NOT queryable on IDX Plus — Trestle pre-filters those listings out of the feed entirely. Their elimination is invisible at this layer (subtracted upstream).',
    baseline: baselineTotal,
    gates: results.filter((r) => r.kind !== 'total').map(({ name, filter, count, pct_of_baseline, note }) => ({ name, filter, count, pct_of_baseline, note })),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human view
  const fmt = (n) => (n === null || n === undefined ? 'n/a' : n.toLocaleString());
  console.log(`\n── Gate breakdown for: ${baseFilter} ──`);
  console.log(`Baseline (total matching base filter): ${fmt(baselineTotal)}`);
  console.log('');
  for (const r of results) {
    if (r.kind === 'total') continue;
    const pct = r.pct_of_baseline !== null ? `${r.pct_of_baseline}%` : 'n/a';
    console.log(`  ${r.name.padEnd(35)}: ${fmt(r.count).padStart(8)}  (${pct.padStart(6)} of baseline)`);
    console.log(`    ${r.note}`);
  }
  console.log('');
  console.log(`Note: OwnerOptOut and ParticipantOnly listings are pre-filtered out of`);
  console.log(`      the IDX Plus feed entirely — they don't appear in the baseline at`);
  console.log(`      all, so their elimination is invisible at this layer.`);
  console.log(`Probes completed in ${elapsedMs} ms`);
})().catch((err) => {
  console.error('[gate-breakdown] fatal:', err.message || err);
  process.exit(1);
});
