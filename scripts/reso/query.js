#!/usr/bin/env node
/**
 * scripts/reso/query.js — Generic read-only OData GET against Trestle.
 * Prints the raw OData response as JSON.
 *
 * Usage:
 *   node scripts/reso/query.js --entity=Property --top=5 --select="ListingId,StandardStatus,ListPrice"
 *   node scripts/reso/query.js --entity=Property --filter="StandardStatus eq 'Active' and BedroomsTotal eq 2" --top=10
 *   node scripts/reso/query.js --entity=Member --top=3
 *
 * All flags map to OData params:
 *   --filter=<odata>      $filter
 *   --select=<csv>        $select
 *   --top=<n>             $top (default 5, max 200 to avoid accidental large pulls)
 *   --orderby=<expr>      $orderby
 *   --expand=<csv>        $expand (e.g. "Media")
 */
require('dotenv').config({ path: '.env.local' });
const { odataGet } = require('./lib/trestle-client');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

(async () => {
  const entity = arg('entity');
  if (!entity) {
    console.error([
      'Usage: node scripts/reso/query.js --entity=<Resource> [flags]',
      'Flags: --filter --select --top --orderby --expand',
    ].join('\n'));
    process.exit(1);
  }

  const top = Math.min(Number(arg('top') ?? 5), 200);
  const params = {
    top,
    filter: arg('filter'),
    select: arg('select'),
    orderby: arg('orderby'),
    expand: arg('expand'),
  };

  try {
    const j = await odataGet(entity, params);
    console.log(JSON.stringify({
      entity,
      params,
      count: j.value?.length ?? 0,
      records: j.value || [],
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, entity, params }, null, 2));
    process.exit(1);
  }
})();
