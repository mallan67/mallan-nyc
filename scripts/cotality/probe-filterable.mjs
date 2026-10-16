#!/usr/bin/env node
/**
 * cotality:probe — which live Cotality Property fields can be used in an OData $filter.
 *
 * Reads the field list from data/cotality-enums.live.json (run `npm run cotality:pull` first) and asks the
 * live API, for every Property field, whether `<field> ne null` is accepted. The RLS provider rejects
 * filtering on some fields (HTTP 400 "cannot be used for filtering or ordering queries"); those are recorded
 * as blocked and are searched on the fetched page instead.
 *
 * Writes data/cotality-filterable.live.json. Do NOT hand-edit. Read-only toward Cotality, paced under the
 * provider quota (280 requests/minute): ~4 requests/second with back-off on HTTP 429.
 *
 * Env: IDX_CLIENT_ID, IDX_CLIENT_SECRET, TRESTLE_API_URL (the same variables lib/idx/auth.ts reads).
 * Usage: node scripts/cotality/probe-filterable.mjs [YYYY-MM-DD stamp]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contract = JSON.parse(readFileSync(resolve(root, 'data/cotality-enums.live.json'), 'utf8'));
const stamp = process.argv[2] || null;

const base = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const id = process.env.IDX_CLIENT_ID;
const secret = process.env.IDX_CLIENT_SECRET;
if (!id || !secret) { console.error('IDX_CLIENT_ID / IDX_CLIENT_SECRET missing'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokenRes = await fetch(`${base}/oidc/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'api' }),
});
if (!tokenRes.ok) { console.error('token request failed', tokenRes.status); process.exit(1); }
const token = (await tokenRes.json()).access_token;

async function accepts(field) {
  const url = `${base}/odata/Property?$top=1&$select=ListingKey&$filter=${encodeURIComponent(`${field} ne null`)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.ok) return { ok: true };
    const text = await res.text();
    if (res.status === 429) { await sleep(15_000); continue; }
    if (/cannot be used for filtering|suppressed|not permitted/i.test(text)) return { ok: false, why: 'provider-blocked' };
    return { ok: false, why: `HTTP ${res.status}` };
  }
  return { ok: false, why: 'rate-limited' };
}

const fields = Object.entries(contract.entities.Property);
const filterable = [];
const blocked = [];
const other = {};
let n = 0;
for (const [name] of fields) {
  const r = await accepts(name);
  if (r.ok) filterable.push(name);
  else if (r.why === 'provider-blocked') blocked.push(name);
  else other[name] = r.why;
  await sleep(250);
  if (++n % 100 === 0) console.log(`probed ${n}/${fields.length}`);
}

const doc = {
  _README: 'GENERATED from the live Cotality API by scripts/cotality/probe-filterable.mjs. Do NOT hand-edit. Regenerate with `npm run cotality:probe`.',
  pulled_at: stamp,
  property_field_count: fields.length,
  filterable: filterable.sort(),
  provider_blocked: blocked.sort(),
  other_failures: other,
};
writeFileSync(resolve(root, 'data/cotality-filterable.live.json'), JSON.stringify(doc, null, 2) + '\n');
console.log(`cotality:probe — ${filterable.length} filterable, ${blocked.length} provider-blocked, ${Object.keys(other).length} other of ${fields.length}`);
