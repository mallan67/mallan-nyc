#!/usr/bin/env node
/**
 * scripts/reso/lookups.js — Discover the distinct enum values populated
 * for a given Trestle field. Useful for catching lookup drift between
 * REBNY's documented enum set and what's actually populated in the feed.
 *
 * Usage:
 *   node scripts/reso/lookups.js --entity=Property --field=PropertySubType
 *   node scripts/reso/lookups.js --entity=Property --field=CommonInterest --filter="StandardStatus eq 'Active'"
 *   node scripts/reso/lookups.js --entity=Property --field=MlsStatus --sample=2000
 *
 * Notes:
 *   - OData on Trestle does not support `$apply=groupby` reliably for
 *     all fields. We fall back to a single-field `$select` sample and
 *     count distinct values client-side. Default sample size: 1,000.
 *   - For multi-value fields (BuildingFeatures, Appliances, etc.) the
 *     populated values are comma-separated strings; this script splits
 *     them so each enum value gets its own count.
 */
require('dotenv').config({ path: '.env.local' });
const { odataSample } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const MULTI_VALUE_FIELDS = new Set([
  'BuildingFeatures',
  'InteriorFeatures',
  'ExteriorFeatures',
  'Appliances',
  'Cooling',
  'Heating',
  'View',
  'ParkingFeatures',
  'LaundryFeatures',
  'PetsAllowed',
  'AssociationAmenities',
  'AccessibilityFeatures',
  'PoolFeatures',
  'PatioAndPorchFeatures',
  'SecurityFeatures',
  'StructureType',
  'ListingTerms',
  'WaterfrontFeatures',
]);

(async () => {
  const entity = arg('entity');
  const field = arg('field');
  const filter = arg('filter');
  const sample = Math.min(Number(arg('sample') ?? 1000), 10_000);

  if (!entity || !field) {
    console.error('Usage: node scripts/reso/lookups.js --entity=<Resource> --field=<Field> [--filter="..."] [--sample=N]');
    process.exit(1);
  }

  try {
    const rows = await odataSample(entity, [field], filter, sample);
    const counts = new Map();
    let nullCount = 0;

    const splitMulti = MULTI_VALUE_FIELDS.has(field);

    for (const r of rows) {
      const raw = r[field];
      if (raw === null || raw === undefined || raw === '') {
        nullCount++;
        continue;
      }
      const values = splitMulti && typeof raw === 'string'
        ? raw.split(',').map((v) => v.trim()).filter(Boolean)
        : [raw];
      for (const v of values) {
        counts.set(String(v), (counts.get(String(v)) || 0) + 1);
      }
    }

    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));

    console.log(JSON.stringify({
      entity,
      field,
      filter: filter || null,
      sample_size: rows.length,
      multi_value_field: splitMulti,
      null_or_empty: nullCount,
      distinct_values: sorted.length,
      values: sorted,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, entity, field }, null, 2));
    process.exit(1);
  }
})();
