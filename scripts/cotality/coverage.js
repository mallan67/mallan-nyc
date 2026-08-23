#!/usr/bin/env node
/**
 * scripts/cotality/coverage.js — Field-population coverage report for a
 * Trestle entity. For each requested field, samples N records and
 * reports what % are populated (non-null, non-empty). Useful for
 * catching "advertised but not populated" gaps and prioritizing
 * which fields are safe to project from.
 *
 * Usage:
 *   node scripts/cotality/coverage.js --entity=Property --fields=ListingId,StandardStatus,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,Latitude,Longitude
 *   node scripts/cotality/coverage.js --entity=Property --fields=YearBuilt,CommonInterest,Furnished --filter="StandardStatus eq 'Active'" --sample=2000
 *
 * Output: JSON with per-field { populated, null_or_empty, populated_pct }.
 */
require('dotenv').config({ path: '.env.local' });
const { odataSample } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

(async () => {
  const entity = arg('entity');
  const fieldsRaw = arg('fields');
  const filter = arg('filter');
  const sample = Math.min(Number(arg('sample') ?? 1000), 10_000);

  if (!entity || !fieldsRaw) {
    console.error('Usage: node scripts/cotality/coverage.js --entity=<Resource> --fields=<csv> [--filter="..."] [--sample=N]');
    process.exit(1);
  }

  const fields = fieldsRaw.split(',').map((f) => f.trim()).filter(Boolean);
  if (fields.length === 0) {
    console.error('No fields specified.');
    process.exit(1);
  }

  try {
    const rows = await odataSample(entity, fields, filter, sample);
    const total = rows.length;

    const stats = {};
    for (const f of fields) stats[f] = { populated: 0, null_or_empty: 0, populated_pct: null };

    for (const row of rows) {
      for (const f of fields) {
        const v = row[f];
        const isEmpty =
          v === null ||
          v === undefined ||
          v === '' ||
          (Array.isArray(v) && v.length === 0);
        if (isEmpty) stats[f].null_or_empty++;
        else stats[f].populated++;
      }
    }
    for (const f of fields) {
      const s = stats[f];
      s.populated_pct = total > 0 ? Math.round((s.populated / total) * 1000) / 10 : null;
    }

    console.log(JSON.stringify({
      entity,
      filter: filter || null,
      sample_requested: sample,
      sample_received: total,
      fields: stats,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, entity, fields }, null, 2));
    process.exit(1);
  }
})();
