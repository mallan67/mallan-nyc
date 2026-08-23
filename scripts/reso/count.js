#!/usr/bin/env node
/**
 * scripts/reso/count.js — Fast `$count` against any Trestle entity, with
 * optional `$filter`. Prints JSON.
 *
 * Usage:
 *   node scripts/reso/count.js --entity=Property
 *   node scripts/reso/count.js --entity=Property --filter="StandardStatus eq 'Active'"
 *   node scripts/reso/count.js --entity=Media
 *
 * Exit code: 0 on success, 1 on error.
 */
require('dotenv').config({ path: '.env.local' });
const { odataCount } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

(async () => {
  const entity = arg('entity');
  const filter = arg('filter');
  if (!entity) {
    console.error('Usage: node scripts/reso/count.js --entity=<Resource> [--filter="..."]');
    process.exit(1);
  }
  try {
    const count = await odataCount(entity, filter, { throwOnError: true });
    console.log(JSON.stringify({ entity, filter: filter || null, count }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, entity, filter: filter || null }, null, 2));
    process.exit(1);
  }
})();
