/**
 * cotality:pull — regenerate the single source of Cotality enum truth from the LIVE API.
 *
 * This is the ONLY sanctioned way to (re)generate `data/cotality-enums.live.json`.
 * It authenticates to api.cotality.com/trestle, pulls the live OData $metadata, and
 * writes every EnumType + members. No hand-editing that JSON — regenerate it here.
 *
 * Law (Maya 2026-07-05): the live Cotality API is the SOLE authority for every status,
 * field, and picklist value. Never assume, never snapshot, never hand-copy a list.
 *
 * Usage:  IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node scripts/cotality/pull-enums.mjs
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

const enums = {};
for (const m of xml.matchAll(/<EnumType Name="([^"]+)"[\s\S]*?<\/EnumType>/g)) {
  enums[m[1]] = [...m[0].matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]);
}
const names = Object.keys(enums).sort();
const ordered = {};
for (const n of names) ordered[n] = enums[n];

const doc = {
  _README: 'GENERATED from the live Cotality $metadata by scripts/cotality/pull-enums.mjs. Do NOT hand-edit. Regenerate live; verify with `npm run cotality:verify`.',
  source: `${BASE}/odata/$metadata`,
  pulled_at: STAMP,
  enum_count: names.length,
  enums: ordered,
};
const dest = path.resolve('data/cotality-enums.live.json');
writeFileSync(dest, JSON.stringify(doc, null, 2) + '\n');
console.log(`cotality:pull — wrote ${names.length} live enums to ${dest}`);
console.log(`  StandardStatus: ${enums.StandardStatus?.join(', ')}`);
console.log(`  Permission:     ${enums.Permission?.join(', ')}`);
console.log(`  PropertyType:   ${enums.PropertyType?.join(', ')}`);
