#!/usr/bin/env node
// LOCATION CENSUS — exhaustive full-corpus scan of the Property location fields on the live feed.
//
//   node scripts/cotality/location-census.mjs [--out=<file>] [--filter="StandardStatus eq 'Active'"]
//
// Why a scan and not counts: MLSAreaMajor/MLSAreaMinor are provider-suppressed for $filter, so their
// population cannot be counted; and the QUESTION is semantic — does every SubdivisionName sit under
// exactly one CityRegion, is CityRegion exactly the five boroughs on every row — which needs the
// co-occurrence of values, not per-field counts. One keyset walk over ListingKey (1,000 rows per
// page, ~592 pages for 591,607 rows) reads every row once. Nothing is sampled.

import { writeFileSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const outPath = arg('out', 'artifacts/cotality-contract/location-census.json');
const scope = arg('filter');
const FIELDS = ['ListingKey', 'StandardStatus', 'PropertyType', 'CityRegion', 'SubdivisionName', 'City', 'PostalCity', 'CountyOrParish', 'StateOrProvince', 'CountrySubdivision', 'MLSAreaMajor', 'MLSAreaMinor', 'PostalCode'];

const client = createCotalityClient();
const tally = {};
for (const f of FIELDS.slice(1)) tally[f] = { nonNull: 0, values: new Map() };
const pairs = { SubdivisionName_by_CityRegion: new Map(), CityRegion_by_CountyOrParish: new Map(), CityRegion_by_City: new Map(), PostalCity_by_CityRegion: new Map() };
const bump = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
const pair = (name, a, b) => { const m = pairs[name]; if (!m.has(a)) m.set(a, new Map()); bump(m.get(a), b); };

let rows = 0;
let pages = 0;
let last = null;
const started = new Date().toISOString();
while (true) {
  const filter = [scope, last == null ? null : `ListingKey gt '${last.replace(/'/g, "''")}'`].filter(Boolean).map((x) => `(${x})`).join(' and ') || undefined;
  const json = await client.query('Property', { '$select': FIELDS.join(','), '$filter': filter, '$orderby': 'ListingKey asc', '$top': 1000 });
  const batch = Array.isArray(json.value) ? json.value : [];
  if (!batch.length) break;
  pages += 1;
  for (const r of batch) {
    rows += 1;
    for (const f of FIELDS.slice(1)) {
      const v = r[f];
      if (v == null || v === '') continue;
      tally[f].nonNull += 1;
      bump(tally[f].values, String(v));
    }
    const cr = r.CityRegion == null ? '∅' : String(r.CityRegion);
    if (r.SubdivisionName != null) pair('SubdivisionName_by_CityRegion', String(r.SubdivisionName), cr);
    if (r.CountyOrParish != null) pair('CityRegion_by_CountyOrParish', String(r.CountyOrParish), cr);
    if (r.City != null) pair('CityRegion_by_City', String(r.City), cr);
    if (r.PostalCity != null) pair('PostalCity_by_CityRegion', String(r.PostalCity), cr);
  }
  last = String(batch[batch.length - 1].ListingKey);
  if (pages % 50 === 0) console.error(`[location-census] ${rows} rows, ${pages} pages, quota=${JSON.stringify(client.quota())}`);
}

const top = (map, n = 60) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v, c]) => ({ value: v, count: c }));
const out = { source: 'LIVE_COTALITY', started, finished: new Date().toISOString(), scope: scope || null, rows, pages, fields: {}, pairs: {} };
for (const f of FIELDS.slice(1)) out.fields[f] = { nonNull: tally[f].nonNull, distinct: tally[f].values.size, top: top(tally[f].values, tally[f].values.size <= 60 ? 60 : 40), all: tally[f].values.size <= 2000 ? Object.fromEntries([...tally[f].values.entries()].sort((a, b) => b[1] - a[1])) : null };
for (const [name, m] of Object.entries(pairs)) {
  const multi = [...m.entries()].filter(([, inner]) => inner.size > 1).map(([a, inner]) => ({ value: a, under: Object.fromEntries([...inner.entries()].sort((x, y) => y[1] - x[1])) }));
  out.pairs[name] = { keys: m.size, keys_under_more_than_one: multi.length, examples: multi.slice(0, 40) };
}
out.quota = client.quota();
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.error(`[location-census] wrote ${outPath} (${rows} rows)`);
process.stdout.write(JSON.stringify({ rows, pages, fields: Object.fromEntries(Object.entries(out.fields).map(([f, v]) => [f, { nonNull: v.nonNull, distinct: v.distinct }])), pairs: Object.fromEntries(Object.entries(out.pairs).map(([k, v]) => [k, { keys: v.keys, keys_under_more_than_one: v.keys_under_more_than_one }])) }, null, 2) + '\n');
