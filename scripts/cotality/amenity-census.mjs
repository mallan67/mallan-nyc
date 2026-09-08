#!/usr/bin/env node
// AMENITY CENSUS — exhaustive live counts for every member of the multi-select amenity fields, plus an
// exhaustive census of CustomProperty.CustomFields keys on every ACTIVE listing.
//
//   node scripts/cotality/amenity-census.mjs [--fields=BuildingFeatures,AssociationAmenities,...] [--status=Active] [--out=<file>]
//
// Multi-enum members are counted with `<Field> has '<Member>'` (the live filter form this feed accepts),
// one request per member, reconciled against `<Field> ne null`. CustomFields is a JSON string that the
// provider does not let us filter on, so it is read row by row for the whole scoped corpus via
// $expand=CustomProperty($select=CustomFields) — no sampling inside the scope.

import { writeFileSync, readFileSync } from 'node:fs';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const fields = (arg('fields', 'BuildingFeatures,AssociationAmenities,CommunityFeatures,SecurityFeatures,LaundryFeatures,ExteriorFeatures,InteriorOrRoomFeatures,Appliances,PetsAllowed,ParkingFeatures,PoolFeatures,SpaFeatures,AccessibilityFeatures,Utilities')).split(',').map((s) => s.trim()).filter(Boolean);
const status = arg('status', 'Active');
const outPath = arg('out', 'artifacts/cotality-contract/amenity-census.json');
const scope = status ? `StandardStatus eq '${status}'` : null;
const and = (a, b) => (a && b ? `(${a}) and (${b})` : a || b);
const esc = (v) => String(v).replace(/'/g, "''");

const lookups = JSON.parse(readFileSync('data/cotality-contract/lookups.live.json', 'utf8'));
const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const client = createCotalityClient();
const count = async (filter) => {
  const json = await client.query('Property', { '$select': 'ListingKey', '$filter': filter, '$count': 'true', '$top': 0 });
  return Number(json['@odata.count']);
};

const out = { source: 'LIVE_COTALITY', scope: scope || 'all', started: new Date().toISOString(), fields: {}, customFields: null };
for (const f of fields) {
  const fact = compact.resources.Property.fields[f];
  if (!fact) { out.fields[f] = { error: 'not declared' }; continue; }
  const members = lookups.Property?.[f]?.members || [];
  const nonNull = await count(and(scope, `${f} ne null`));
  const counts = {};
  for (const m of members) {
    counts[m] = await count(and(scope, fact.multi ? `${f} has '${esc(m)}'` : `${f} eq '${esc(m)}'`));
  }
  const used = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  out.fields[f] = { type: fact.type, multi: fact.multi, rlsField: fact.rlsField, nonNull, members: members.length, membersUsed: used.length, counts: Object.fromEntries(used) };
  console.error(`[amenity-census] ${f}: nonNull=${nonNull} members=${members.length} used=${used.length}`);
}

// CustomFields keys on every listing in scope.
const keys = new Map();
let rows = 0;
let withCustom = 0;
let last = null;
while (true) {
  const filter = and(scope, last == null ? null : `ListingKey gt '${esc(last)}'`);
  const json = await client.query('Property', { '$select': 'ListingKey', '$expand': 'CustomProperty($select=CustomFields)', '$filter': filter, '$orderby': 'ListingKey asc', '$top': 1000 });
  const batch = Array.isArray(json.value) ? json.value : [];
  if (!batch.length) break;
  for (const r of batch) {
    rows += 1;
    const cp = Array.isArray(r.CustomProperty) ? r.CustomProperty[0] : r.CustomProperty;
    const raw = cp?.CustomFields;
    if (typeof raw !== 'string' || !raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!parsed || typeof parsed !== 'object') continue;
    withCustom += 1;
    for (const [k, v] of Object.entries(parsed)) {
      if (!keys.has(k)) keys.set(k, { rows: 0, nonEmpty: 0, sample: new Map() });
      const e = keys.get(k);
      e.rows += 1;
      if (v !== null && v !== '' && v !== undefined) { e.nonEmpty += 1; const s = String(v).slice(0, 40); e.sample.set(s, (e.sample.get(s) || 0) + 1); }
    }
  }
  last = String(batch[batch.length - 1].ListingKey);
}
out.customFields = {
  rows, withCustomFields: withCustom, distinctKeys: keys.size,
  keys: Object.fromEntries([...keys.entries()].sort((a, b) => b[1].nonEmpty - a[1].nonEmpty).map(([k, e]) => [k, { rows: e.rows, nonEmpty: e.nonEmpty, topValues: [...e.sample.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v, n]) => `${v}=${n}`) }])),
};
out.finished = new Date().toISOString();
out.quota = client.quota();
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.error(`[amenity-census] wrote ${outPath}`);
process.stdout.write(JSON.stringify({ scope: out.scope, fields: Object.fromEntries(Object.entries(out.fields).map(([f, v]) => [f, { nonNull: v.nonNull, used: v.membersUsed, of: v.members }])), customFields: { rows, withCustomFields: withCustom, distinctKeys: keys.size } }, null, 2) + '\n');
