/**
 * cotality:verify — READ-ONLY drift guard for the single source of Cotality enum truth.
 *
 * Pulls the LIVE Cotality $metadata and compares it to the committed
 * `data/cotality-enums.live.json`. Fails if the committed source has drifted from live —
 * so no copy of the enum truth can silently go stale.
 *
 * Law (Maya 2026-07-05): the live Cotality API is the SOLE authority.
 *
 * Exit: 0 = committed source matches live · 1 = DRIFT · 2 = could not reach Cotality (unverified).
 * Usage:  IDX_CLIENT_ID=… IDX_CLIENT_SECRET=… node scripts/cotality-verify.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');

let committed;
try {
  committed = JSON.parse(readFileSync(path.resolve('data/cotality-enums.live.json'), 'utf8')).enums;
} catch (e) {
  console.error('[cotality:verify] cannot read data/cotality-enums.live.json — run `npm run cotality:pull` first.');
  process.exit(1);
}

let token, xml;
try {
  const tokRes = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.IDX_CLIENT_ID || '', client_secret: process.env.IDX_CLIENT_SECRET || '', grant_type: 'client_credentials', scope: 'api' }),
  });
  token = tokRes.ok ? (await tokRes.json()).access_token : null;
  if (!token) throw new Error(`auth ${tokRes.status}`);
  const metaRes = await fetch(`${BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error(`$metadata ${metaRes.status}`);
  xml = await metaRes.text();
} catch (e) {
  console.error(`[cotality:verify] UNVERIFIED — could not reach live Cotality (${e.message}). Set IDX_CLIENT_ID/IDX_CLIENT_SECRET.`);
  process.exit(2);
}

const live = {};
for (const m of xml.matchAll(/<EnumType Name="([^"]+)"[\s\S]*?<\/EnumType>/g)) {
  live[m[1]] = [...m[0].matchAll(/<Member Name="([^"]+)"/g)].map((x) => x[1]);
}

const drift = [];
const allNames = new Set([...Object.keys(committed), ...Object.keys(live)]);
for (const name of allNames) {
  const c = committed[name] || null;
  const l = live[name] || null;
  if (!c) { drift.push(`+ live has NEW enum '${name}' (${l.length}) not in committed source`); continue; }
  if (!l) { drift.push(`- committed enum '${name}' no longer exists live`); continue; }
  const cs = JSON.stringify([...c].sort()), ls = JSON.stringify([...l].sort());
  if (cs !== ls) {
    const added = l.filter((x) => !c.includes(x));
    const removed = c.filter((x) => !l.includes(x));
    drift.push(`~ '${name}': live added [${added.join(', ')}] removed [${removed.join(', ')}]`);
  }
}

if (drift.length) {
  console.error(`[cotality:verify] DRIFT — committed source disagrees with live Cotality on ${drift.length} enum(s):`);
  for (const d of drift) console.error(`  ${d}`);
  console.error('  Fix: `npm run cotality:pull` to regenerate from live, then review the diff.');
  process.exit(1);
}
console.log(`[cotality:verify] PASS — committed source matches live Cotality (${Object.keys(live).length} enums).`);
process.exit(0);
