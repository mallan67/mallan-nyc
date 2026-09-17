#!/usr/bin/env node
// NAVIGATION CAPABILITY MATRIX — the provider ACCESS-PATH dimension. For every declared Property
// navigation, on representative Active / Pending / ComingSoon / Closed listings, record SEPARATELY:
//   declared            the navigation exists in $metadata (contract)
//   http                the $expand request was accepted (200) or rejected (code + verbatim message)
//   collection present  the response row carries the navigation key at all
//   populated           the collection has ≥1 record (HTTP 200 + [] is NOT "unavailable")
//   record count        records per row, totals
//   key linkage         the payload's key matches the Property scalar it should relate to
//                       (ListAgentKey↔MemberKey, BuyerAgentMlsId↔MemberMlsId, ResourceRecordKey↔ListingKey, …)
//   context             StandardStatus and Permission of the sampled rows (status/permission dependence)
//   direct access       the target entity set queried directly, by the linked key (entitlement of the path)
//   nested expand       second-hop expands through the navigation (e.g. ListAgent($expand=Media))
// Null Property scalars never imply that the related record is unavailable — the Closed BuyerAgent
// navigation delivers Member payloads although every BuyerAgent* Property scalar is provider-suppressed.
//
//   node scripts/cotality/navigation-capability.mjs [--per-status=40] [--out=<base>]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const perStatus = Number(arg('per-status', 40));
const outBase = arg('out', 'docs/operations/evidence-2026-09-08/navigation/navigation-capability-matrix');
const esc = (v) => String(v).replace(/'/g, "''");

const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const NAV = compact.resources.Property.navigation;
const STATUSES = ['Active', 'Pending', 'ComingSoon', 'Closed'];

// Property scalars that should relate to each navigation's payload (suppressed ones stay in the list on
// purpose: their nullness is recorded next to the payload that arrives anyway).
const SCALARS = ['ListingKey', 'ListingId', 'StandardStatus', 'Permission', 'CloseDate', 'PhotosCount', 'VideosCount', 'RoomsTotal', 'NumberOfUnitsTotal',
  'ListAgentKey', 'ListAgentMlsId', 'ListOfficeKey', 'ListOfficeMlsId', 'CoListAgentKey', 'CoListAgentMlsId', 'CoListAgent2Key', 'CoListAgent2MlsId', 'CoListAgent3Key', 'CoListAgent3MlsId',
  'CoListOfficeKey', 'CoListOfficeMlsId', 'CoListOffice2Key', 'CoListOffice2MlsId',
  'BuyerAgentKey', 'BuyerAgentMlsId', 'BuyerOfficeKey', 'BuyerOfficeMlsId', 'CoBuyerAgentKey', 'CoBuyerAgentMlsId', 'CoBuyerOfficeKey', 'CoBuyerOfficeMlsId',
  'BuildingKey', 'BuildingKeyNumeric'];
const PAYLOAD_SELECT = {
  Building: ['BuildingKey'],
  Member: ['MemberKey', 'MemberMlsId', 'MemberStatus', 'MemberType', 'OfficeKey', 'OfficeMlsId'],
  Office: ['OfficeKey', 'OfficeMlsId', 'OfficeStatus', 'OfficeType'],
  Media: ['MediaKey', 'ResourceRecordKey', 'ResourceName', 'MediaCategory', 'MediaStatus'],
  OpenHouse: ['OpenHouseKey', 'ListingKey', 'OpenHouseStatus', 'OpenHouseType'],
  CustomProperty: ['ListingKey', 'StandardStatus'],
  PropertyRooms: ['RoomKey', 'ListingKey', 'RoomType'],
  PropertyUnitTypes: ['UnitTypeKey', 'ListingKey', 'UnitTypeType'],
};
// navigation → [payload key, Property scalar] pairs that must agree when both are non-null.
const LINKAGE = {
  ListAgent: [['MemberKey', 'ListAgentKey'], ['MemberMlsId', 'ListAgentMlsId']],
  CoListAgent: [['MemberKey', 'CoListAgentKey'], ['MemberMlsId', 'CoListAgentMlsId'], ['MemberKey', 'CoListAgent2Key'], ['MemberKey', 'CoListAgent3Key']],
  BuyerAgent: [['MemberKey', 'BuyerAgentKey'], ['MemberMlsId', 'BuyerAgentMlsId']],
  CoBuyerAgent: [['MemberKey', 'CoBuyerAgentKey'], ['MemberMlsId', 'CoBuyerAgentMlsId']],
  ListOffice: [['OfficeKey', 'ListOfficeKey'], ['OfficeMlsId', 'ListOfficeMlsId']],
  CoListOffice: [['OfficeKey', 'CoListOfficeKey'], ['OfficeMlsId', 'CoListOfficeMlsId'], ['OfficeKey', 'CoListOffice2Key']],
  BuyerOffice: [['OfficeKey', 'BuyerOfficeKey'], ['OfficeMlsId', 'BuyerOfficeMlsId']],
  CoBuyerOffice: [['OfficeKey', 'CoBuyerOfficeKey'], ['OfficeMlsId', 'CoBuyerOfficeMlsId']],
  Media: [['ResourceRecordKey', 'ListingKey']],
  OpenHouse: [['ListingKey', 'ListingKey']],
  CustomProperty: [['ListingKey', 'ListingKey']],
  Rooms: [['ListingKey', 'ListingKey']],
  UnitTypes: [['ListingKey', 'ListingKey']],
  Building: [['BuildingKey', 'BuildingKey']],
};
// Direct entity-set access by the linked key, per target.
const DIRECT = {
  Member: [['MemberKey', 'MemberKey'], ['MemberMlsId', 'MemberMlsId']],
  Office: [['OfficeKey', 'OfficeKey'], ['OfficeMlsId', 'OfficeMlsId']],
  Media: [['ResourceRecordKey', 'ResourceRecordKey']],
  OpenHouse: [['ListingKey', 'ListingKey']],
  CustomProperty: [['ListingKey', 'ListingKey']],
  PropertyRooms: [['ListingKey', 'ListingKey']],
  PropertyUnitTypes: [['ListingKey', 'ListingKey']],
  Building: [['BuildingKey', 'BuildingKey']],
};

const client = createCotalityClient();
const q = async (resource, params) => {
  try { const json = await client.query(resource, params); return { http: 200, json }; }
  catch (error) { return { http: Number(error?.status) || 0, message: String(error?.body || error?.message || '').slice(0, 400) }; }
};

// ── 1. representative samples per status (deterministic: keyset ends + most recent close) ───────────
const samples = {};
for (const st of STATUSES) {
  const rows = new Map();
  const pull = async (orderby, top) => {
    const r = await q('Property', { '$select': SCALARS.join(','), '$filter': `StandardStatus eq '${st}'`, '$orderby': orderby, '$top': top });
    if (r.http !== 200) return r;
    for (const row of r.json.value || []) rows.set(row.ListingKey, row);
    return r;
  };
  const half = Math.max(1, Math.ceil(perStatus / 2));
  await pull('ListingKey asc', half);
  await pull('ListingKey desc', half);
  if (st === 'Closed') await pull('CloseDate desc', half);
  samples[st] = [...rows.values()];
  console.error(`[navigation-capability] ${st}: ${samples[st].length} representative rows`);
}

// ── 2. per navigation × status: expand the sample, record everything separately ────────────────────
const matrix = {};
const directProbes = [];
const seenDirect = new Set();
for (const nav of Object.keys(NAV).sort()) {
  const target = NAV[nav].target;
  const select = PAYLOAD_SELECT[target] || [Object.keys(compact.resources[target]?.fields || {})[0]];
  matrix[nav] = { target, declared: true, collection: NAV[nav].collection, targetEntitySetAccess: compact.resources[target]?.access || null, byStatus: {} };
  for (const st of STATUSES) {
    const sample = samples[st];
    const cell = { sampled: sample.length, http: null, message: null, collectionKeyPresent: 0, populated: 0, empty: 0, records: 0, maxPerRow: 0, linkage: {}, byPermission: {}, rowsWithScalarButEmpty: [], examples: [] };
    if (!sample.length) { matrix[nav].byStatus[st] = cell; continue; }
    const keys = sample.map((r) => `'${esc(r.ListingKey)}'`).join(',');
    const r = await q('Property', { '$select': SCALARS.join(','), '$expand': `${nav}($select=${select.join(',')})`, '$filter': `ListingKey in (${keys})`, '$top': sample.length });
    cell.http = r.http;
    if (r.http !== 200) { cell.message = r.message; matrix[nav].byStatus[st] = cell; continue; }
    for (const row of r.json.value || []) {
      const has = Object.prototype.hasOwnProperty.call(row, nav);
      if (has) cell.collectionKeyPresent += 1;
      const v = row[nav];
      const arr = Array.isArray(v) ? v : v ? [v] : [];
      const perm = String(row.Permission ?? 'null');
      if (!cell.byPermission[perm]) cell.byPermission[perm] = { sampled: 0, populated: 0 };
      cell.byPermission[perm].sampled += 1;
      if (arr.length) {
        cell.populated += 1; cell.records += arr.length; cell.maxPerRow = Math.max(cell.maxPerRow, arr.length); cell.byPermission[perm].populated += 1;
        for (const [pk, sk] of LINKAGE[nav] || []) {
          const scalar = row[sk];
          const payloadKeys = arr.map((p) => p?.[pk]).filter((x) => x != null).map(String);
          const key = `${pk}↔${sk}`;
          if (!cell.linkage[key]) cell.linkage[key] = { scalarNonNull: 0, scalarNull: 0, match: 0, mismatch: 0 };
          const L = cell.linkage[key];
          if (scalar == null) { L.scalarNull += 1; continue; }
          L.scalarNonNull += 1;
          if (payloadKeys.includes(String(scalar))) L.match += 1; else L.mismatch += 1;
        }
        if (cell.examples.length < 3) cell.examples.push({ ListingKey: row.ListingKey, StandardStatus: row.StandardStatus, Permission: row.Permission, count: arr.length, first: arr[0] });
        // direct-resource access through the linked key (once per target/key kind)
        for (const [pk, dk] of DIRECT[target] || []) {
          const val = arr[0]?.[pk];
          if (val == null) continue;
          const id = `${target}.${dk}`;
          if (seenDirect.has(id)) continue;
          seenDirect.add(id);
          const d = await q(target, { '$filter': `${dk} eq '${esc(val)}'`, '$select': select.join(','), '$top': 5, '$count': 'true' });
          directProbes.push({ target, via: `${nav} payload ${pk}`, filter: `${dk} eq '${val}'`, http: d.http, count: d.http === 200 ? Number(d.json['@odata.count']) : null, message: d.message || null });
        }
      } else {
        cell.empty += 1;
        // A non-null Property scalar with an empty navigation payload: data- or permission-dependent, recorded for follow-up.
        const scalarPairs = (LINKAGE[nav] || []).filter(([, sk]) => row[sk] != null).map(([, sk]) => `${sk}=${row[sk]}`);
        if (scalarPairs.length && cell.rowsWithScalarButEmpty.length < 10) cell.rowsWithScalarButEmpty.push({ ListingKey: row.ListingKey, Permission: row.Permission, scalars: scalarPairs });
      }
    }
    matrix[nav].byStatus[st] = cell;
  }
  console.error(`[navigation-capability] ${nav} → ${target}: ${STATUSES.map((st) => `${st}=${matrix[nav].byStatus[st].http}/${matrix[nav].byStatus[st].populated}/${matrix[nav].byStatus[st].sampled}`).join(' ')}`);
}

// ── 3. rows whose navigation came back empty although the Property scalar names a record: direct lookup ──
const emptyFollowUps = [];
for (const nav of ['ListAgent', 'CoListAgent', 'ListOffice', 'CoListOffice', 'BuyerAgent', 'BuyerOffice']) {
  const target = NAV[nav].target;
  for (const st of STATUSES) {
    for (const row of (matrix[nav].byStatus[st].rowsWithScalarButEmpty || []).slice(0, 3)) {
      for (const s of row.scalars) {
        const [sk, val] = s.split('=');
        const dk = /MlsId$/.test(sk) ? (target === 'Member' ? 'MemberMlsId' : 'OfficeMlsId') : (target === 'Member' ? 'MemberKey' : 'OfficeKey');
        const d = await q(target, { '$filter': `${dk} eq '${esc(val)}'`, '$select': PAYLOAD_SELECT[target].join(','), '$top': 3, '$count': 'true' });
        emptyFollowUps.push({ nav, status: st, ListingKey: row.ListingKey, Permission: row.Permission, scalar: s, direct: `${target}?$filter=${dk} eq '${val}'`, http: d.http, count: d.http === 200 ? Number(d.json['@odata.count']) : null, sample: d.http === 200 ? (d.json.value || [])[0] || null : null, message: d.message || null });
      }
    }
  }
}

// ── 4. nested expands through a navigation (second hop) ───────────────────────────────────────────
const nested = [];
const active1 = samples.Active[0]?.ListingKey;
const closed1 = (matrix.BuyerAgent.byStatus.Closed.examples[0] || {}).ListingKey || samples.Closed[0]?.ListingKey;
for (const [label, key, expand] of [
  ['Active ListAgent($expand=Media)', active1, 'ListAgent($select=MemberKey;$expand=Media($select=MediaKey,MediaCategory;$top=3))'],
  ['Active ListOffice($expand=Media)', active1, 'ListOffice($select=OfficeKey;$expand=Media($select=MediaKey,MediaCategory;$top=3))'],
  ['Active Building($expand=Media)', active1, 'Building($expand=Media($select=MediaKey))'],
  ['Active Building($expand=Property)', active1, 'Building($expand=Property($select=ListingKey))'],
  ['Closed BuyerAgent($expand=Media)', closed1, 'BuyerAgent($select=MemberKey;$expand=Media($select=MediaKey;$top=3))'],
  ['Active Media($filter=MediaCategory eq Photo;$top=2)', active1, "Media($select=MediaKey,MediaCategory;$filter=MediaCategory eq 'Photo';$top=2)"],
  ['Active all 14 navigations key-only in one request', active1, Object.keys(NAV).map((n) => `${n}($select=${(PAYLOAD_SELECT[NAV[n].target] || ['ListingKey'])[0]})`).join(',')],
]) {
  if (!key) continue;
  const r = await q('Property', { '$select': 'ListingKey', '$expand': expand, '$filter': `ListingKey eq '${esc(key)}'` });
  nested.push({ label, ListingKey: key, expand, http: r.http, message: r.message || null, payload: r.http === 200 ? JSON.stringify((r.json.value || [])[0] || null).slice(0, 600) : null });
}

// ── 5. direct entity-set access without a key (entitlement of the resource itself) ─────────────────
const entitySets = {};
for (const target of [...new Set(Object.values(NAV).map((n) => n.target))]) {
  const r = await q(target, { '$top': 1, '$select': (PAYLOAD_SELECT[target] || [])[0] || undefined });
  entitySets[target] = { http: r.http, message: r.message || null, rows: r.http === 200 ? (r.json.value || []).length : null };
}

const out = { source: 'LIVE_COTALITY', generated: new Date().toISOString(), perStatus, statuses: STATUSES, samples: Object.fromEntries(STATUSES.map((s) => [s, samples[s].map((r) => r.ListingKey)])), matrix, directProbes, emptyFollowUps, nested, entitySets, quota: client.quota() };
mkdirSync(path.dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.json`, JSON.stringify(out, null, 2) + '\n');

// ── render ─────────────────────────────────────────────────────────────────
const md = [];
md.push('# Navigation capability matrix — provider access paths, measured live (2026-09-08)');
md.push('');
md.push('Representative rows per status (keyset ends, plus most recent CloseDate for Closed). Columns are recorded separately: **declared** (in $metadata), **HTTP** of the `$expand` request, **collection key present** in the row, **populated** rows (≥1 record) vs **empty** (HTTP 200 + `[]`), records, **key linkage** (payload key ↔ Property scalar, counted only where the scalar is non-null), and **direct entity-set access** by the linked key. HTTP 200 + empty is not "unavailable"; a null Property scalar is not "no related record".');
md.push('');
md.push('## A. Navigation × status');
md.push('');
md.push('| Navigation → target | Status | Sampled | HTTP | Collection key present | Populated / empty | Records (max per row) | Key linkage (match / mismatch / scalar null) | Populated by Permission |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const [nav, m] of Object.entries(matrix)) {
  for (const st of STATUSES) {
    const c = m.byStatus[st];
    const link = Object.entries(c.linkage).map(([k, v]) => `${k}: ${v.match}/${v.mismatch}/${v.scalarNull}`).join('; ') || '—';
    const perm = Object.entries(c.byPermission).map(([k, v]) => `${k}: ${v.populated}/${v.sampled}`).join('; ') || '—';
    md.push(`| \`${nav}\` → ${m.target} | ${st} | ${c.sampled} | ${c.http ?? '—'}${c.message ? ` — ${c.message.slice(0, 120)}` : ''} | ${c.collectionKeyPresent} | ${c.populated} / ${c.empty} | ${c.records} (${c.maxPerRow}) | ${link} | ${perm} |`);
  }
}
md.push('');
md.push('## B. Target entity sets — direct access (entitlement of the resource itself)');
md.push('');
md.push('| Target | Direct `$top=1` | Rows | Message |');
md.push('|---|---|---|---|');
for (const [t, v] of Object.entries(entitySets)) md.push(`| ${t} | HTTP ${v.http} | ${v.rows ?? '—'} | ${v.message ? v.message.slice(0, 160) : '—'} |`);
md.push('');
md.push('## C. Direct access by the linked key (the path a consumer would take without $expand)');
md.push('');
md.push('| Target | Via | Filter | HTTP | Count |');
md.push('|---|---|---|---|---|');
for (const d of directProbes) md.push(`| ${d.target} | ${d.via} | \`${d.filter}\` | ${d.http} | ${d.count ?? '—'}${d.message ? ` — ${d.message.slice(0, 120)}` : ''} |`);
md.push('');
md.push('## D. Navigation empty although the Property scalar names a record — direct lookup');
md.push('');
md.push('| Navigation | Status | ListingKey | Permission | Scalar | Direct query | HTTP | Count | Sample |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const e of emptyFollowUps) md.push(`| ${e.nav} | ${e.status} | ${e.ListingKey} | ${e.Permission} | ${e.scalar} | \`${e.direct}\` | ${e.http} | ${e.count ?? '—'} | ${e.sample ? JSON.stringify(e.sample).slice(0, 160) : e.message ? e.message.slice(0, 120) : '—'} |`);
if (!emptyFollowUps.length) md.push('| — | — | — | — | — | — | — | — | none observed in the samples |');
md.push('');
md.push('## E. Second-hop expands through a navigation');
md.push('');
md.push('| Probe | ListingKey | HTTP | Payload / message |');
md.push('|---|---|---|---|');
for (const n of nested) md.push(`| ${n.label} | ${n.ListingKey} | ${n.http} | ${n.payload ? `\`${n.payload.replace(/\|/g, '\\|').slice(0, 300)}\`` : n.message ? n.message.slice(0, 200) : '—'} |`);
md.push('');
writeFileSync(`${outBase}.md`, md.join('\n') + '\n');
process.stdout.write(JSON.stringify({ wrote: [`${outBase}.md`, `${outBase}.json`], summary: Object.fromEntries(Object.entries(matrix).map(([nav, m]) => [nav, Object.fromEntries(STATUSES.map((st) => [st, `${m.byStatus[st].http}:${m.byStatus[st].populated}/${m.byStatus[st].sampled}`]))])), entitySets: Object.fromEntries(Object.entries(entitySets).map(([t, v]) => [t, v.http])) }, null, 2) + '\n');
