/**
 * cotality:pull — regenerate the single source of Cotality field and enum truth from the LIVE API.
 *
 * This is the ONLY sanctioned way to (re)generate `data/cotality-enums.live.json`.
 * It authenticates to api.cotality.com/trestle, pulls the live OData $metadata, and
 * writes every EntityType with its fields and types, and every EnumType + members.
 * No hand-editing that JSON — regenerate it here.
 *
 * Law (Maya 2026-07-05): the live Cotality API is the SOLE authority for every status,
 * field, and picklist value. Never assume, never snapshot, never hand-copy a list.
 *
 * Usage:  IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node scripts/cotality/pull-enums.mjs [YYYY-MM-DD]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const STAMP = process.argv[2] || null; // pass an ISO date to stamp deterministically

const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials', scope: 'api' }),
});
if (!tokRes.ok) { console.error(`AUTH FAILED ${tokRes.status}`); process.exit(2); }
const token = (await tokRes.json()).access_token;
if (!token) { console.error('AUTH FAILED — no token'); process.exit(2); }

const metaRes = await fetch(`${BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
if (!metaRes.ok) { console.error(`$metadata FAILED ${metaRes.status}`); process.exit(2); }
const xml = await metaRes.text();

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

const enums = {};
for (const m of xml.matchAll(/<EnumType Name="([^"]+)"[\s\S]*?<\/EnumType>/g)) {
  enums[m[1]] = [...m[0].matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]);
}
// Every field the licence serves, per entity, with its declared type. A field is real only when
// a query for it succeeds (Master section 0.2); this map is what $metadata declares.
const entities = {};
for (const m of xml.matchAll(/<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g)) {
  const fields = {};
  for (const p of m[2].matchAll(/<Property\b[^>]*>/g)) fields[attr(p[0], 'Name')] = attr(p[0], 'Type');
  entities[attr(m[1], 'Name')] = sortKeys(fields);
}

const doc = {
  _README: 'GENERATED from the live Cotality $metadata by scripts/cotality/pull-enums.mjs. Do NOT hand-edit. Regenerate live; verify with `npm run cotality:verify`.',
  source: `${BASE}/odata/$metadata`,
  pulled_at: STAMP,
  entity_count: Object.keys(entities).length,
  enum_count: Object.keys(enums).length,
  entities: sortKeys(entities),
  enums: sortKeys(enums),
};
const dest = path.resolve('data/cotality-enums.live.json');
writeFileSync(dest, JSON.stringify(doc, null, 2) + '\n');
console.log(`cotality:pull — wrote ${doc.entity_count} live entities and ${doc.enum_count} live enums to ${dest}`);
console.log(`  Property fields: ${Object.keys(entities.Property || {}).length}`);
console.log(`  StandardStatus: ${enums.StandardStatus?.join(', ')}`);
console.log(`  Permission:     ${enums.Permission?.join(', ')}`);
console.log(`  PropertyType:   ${enums.PropertyType?.join(', ')}`);
