#!/usr/bin/env node
// Enumerate the EXACT distinct value set of a filterable string field on the live feed — no sampling.
//
//   node scripts/cotality/distinct-values.mjs --resource=Property --field=CityRegion [--filter="StandardStatus eq 'Active'"] [--count]
//
// Method: ordered keyset walk of distinct values. Each request asks for the smallest value strictly
// greater than the last one seen (`$orderby=<field> asc&$top=1&$filter=<field> gt '<last>'`), so the
// walk visits every distinct value exactly once and terminates when no greater value exists. With
// --count, every value is then counted (`$filter=<field> eq '<v>'&$count=true&$top=0`) and the sum is
// reconciled against `<field> ne null` — the reconciliation is the proof the set is complete.
// Requires a filterable AND orderable field (both measured by the light probe; orderability is asserted
// by the first request itself — a 400 stops the walk as UNVERIFIED).

import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const resource = arg('resource', 'Property');
const field = arg('field');
const scope = arg('filter');
const withCount = argv.includes('--count');
const max = Number(arg('max', 5000));
if (!field) { console.error('--field is required'); process.exit(2); }

const client = createCotalityClient();
const esc = (v) => String(v).replace(/'/g, "''");
const and = (a, b) => (a && b ? `(${a}) and (${b})` : a || b);

const values = [];
let last = null;
while (values.length < max) {
  const filter = and(scope, last == null ? `${field} ne null` : `${field} gt '${esc(last)}'`);
  const json = await client.query(resource, { '$select': field, '$filter': filter, '$orderby': `${field} asc`, '$top': 1 });
  const row = json.value?.[0];
  if (!row || row[field] == null) break;
  const v = String(row[field]);
  if (last != null && v <= last) { console.error(`UNVERIFIED: walk did not advance (${JSON.stringify(v)} after ${JSON.stringify(last)})`); process.exit(2); }
  values.push(v);
  last = v;
}
const out = { source: 'LIVE_COTALITY', resource, field, scope: scope || null, distinct: values.length, values };
if (withCount) {
  const counts = {};
  let sum = 0;
  for (const v of values) {
    const json = await client.query(resource, { '$select': field, '$filter': and(scope, `${field} eq '${esc(v)}'`), '$count': 'true', '$top': 0 });
    counts[v] = json['@odata.count'];
    sum += Number(json['@odata.count'] || 0);
  }
  const total = await client.query(resource, { '$select': field, '$filter': and(scope, `${field} ne null`), '$count': 'true', '$top': 0 });
  out.counts = counts;
  out.sum_of_counts = sum;
  out.non_null_total = total['@odata.count'];
  out.complete = sum === Number(total['@odata.count']);
}
out.quota = client.quota();
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
