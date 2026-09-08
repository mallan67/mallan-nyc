#!/usr/bin/env node
// NAVIGATION CENSUS — for each Property navigation property, how many rows of the scoped corpus actually
// carry a payload under `$expand=<Nav>($select=<key>)`. "$expand accepted" (HTTP 200) and "payload delivered"
// are different capabilities: Property.Building is accepted and empty on every sampled row while the Building
// entity set is 403. This measures the payload side exhaustively (ordered keyset walk, $top=1000, no sampling).
//
//   node scripts/cotality/navigation-census.mjs [--navs=Building,BuyerAgent,...] [--status=Active|all] [--out=<file>]
//
// Media and OpenHouse are excluded by default: their multiplicity per listing makes a nested key-only expand
// heavy, and their payload presence is already measured on the resources themselves (ResourceRecordKey /
// ListingKey counts). Pass --navs=Media to include them deliberately.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const status = arg('status', 'Active');
const esc = (v) => String(v).replace(/'/g, "''");
const scope = status && status !== 'all' ? `StandardStatus eq '${esc(status)}'` : null;
const outPath = arg('out', `artifacts/cotality-contract/navigation-census-${status || 'all'}.json`);

const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const NAV = compact.resources.Property.navigation;
const KEY = { Building: 'BuildingKey', Member: 'MemberKey', Office: 'OfficeKey', CustomProperty: 'ListingKey', PropertyRooms: 'RoomKey', PropertyUnitTypes: 'UnitTypeKey', Media: 'MediaKey', OpenHouse: 'OpenHouseKey' };
const DEFAULT_NAVS = Object.keys(NAV).filter((n) => !['Media', 'OpenHouse'].includes(n));
const navs = (arg('navs', DEFAULT_NAVS.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
for (const n of navs) if (!NAV[n]) throw new Error(`Property has no navigation property ${n}`);

const client = createCotalityClient();
const expand = navs.map((n) => `${n}($select=${KEY[NAV[n].target]})`).join(',');
const counts = Object.fromEntries(navs.map((n) => [n, { rowsWithPayload: 0, payloadRows: 0, byStatus: {}, samples: [] }]));
let rows = 0;
let pages = 0;
let last = null;
const rowsByStatus = {};
while (true) {
  const parts = [];
  if (scope) parts.push(`(${scope})`);
  if (last != null) parts.push(`(ListingKey gt '${esc(last)}')`);
  const params = { '$select': 'ListingKey,StandardStatus', '$expand': expand, '$orderby': 'ListingKey asc', '$top': 1000 };
  if (parts.length) params['$filter'] = parts.join(' and ');
  const json = await client.query('Property', params);
  const batch = Array.isArray(json.value) ? json.value : [];
  if (!batch.length) break;
  pages += 1;
  for (const r of batch) {
    rows += 1;
    const st = String(r.StandardStatus ?? 'null');
    rowsByStatus[st] = (rowsByStatus[st] || 0) + 1;
    for (const n of navs) {
      const v = r[n];
      const arr = Array.isArray(v) ? v : v ? [v] : [];
      if (!arr.length) continue;
      const c = counts[n];
      c.rowsWithPayload += 1;
      c.payloadRows += arr.length;
      c.byStatus[st] = (c.byStatus[st] || 0) + 1;
      if (c.samples.length < 5) c.samples.push({ ListingKey: r.ListingKey, StandardStatus: st, payload: arr.slice(0, 3) });
    }
  }
  last = batch[batch.length - 1].ListingKey;
  if (pages % 50 === 0) console.error(`[navigation-census] ${rows} rows, ${pages} pages, ${navs.map((n) => `${n}=${counts[n].rowsWithPayload}`).join(' ')}`);
}
const out = {
  source: 'LIVE_COTALITY', scope: scope || 'all', request: `Property?$select=ListingKey,StandardStatus&$expand=${expand}&$orderby=ListingKey asc&$top=1000 (keyset walk)`,
  rows, pages, rowsByStatus, navigations: Object.fromEntries(navs.map((n) => [n, { target: NAV[n].target, expandHttp: NAV[n].http, ...counts[n] }])),
  finished: new Date().toISOString(), quota: client.quota(),
};
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(JSON.stringify({ wrote: outPath, scope: out.scope, rows, navigations: Object.fromEntries(navs.map((n) => [n, counts[n].rowsWithPayload])) }, null, 2) + '\n');
