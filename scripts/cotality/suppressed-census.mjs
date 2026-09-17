#!/usr/bin/env node
// SUPPRESSED-FIELD CENSUS — the live contract marks 292 fields across the accessible resources as
// `filterable:false` ("Results from 'RLS' has been suppressed (provider Level)"), so their population
// cannot be counted with `<Field> ne null`. They CAN be $selected. This walks the scoped corpus row by
// row (ordered keyset, $top=1000, no sampling) and counts, per field and per StandardStatus, how many
// rows carry a non-null value. Distinct values are recorded only for enum-typed / vocabulary-shaped
// fields — never for names, phones, e-mails, remarks, instructions, codes, keys or URLs.
//
//   node scripts/cotality/suppressed-census.mjs [--resources=Property,Member,...] [--status=Active|all]
//                                                [--out=<file>]
//
// Output: { resources: { <Resource>: { scope, rows, fields: { <Field>: { nonNull, byStatus, distinct? } } } } }

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const status = arg('status', 'Active');
const esc = (v) => String(v).replace(/'/g, "''");
const scope = status && status !== 'all' ? `StandardStatus eq '${esc(status)}'` : null;
const outPath = arg('out', `artifacts/cotality-contract/suppressed-census-${status || 'all'}.json`);

const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const KEY = { Property: 'ListingKey', Media: 'MediaKey', Member: 'MemberKey', Office: 'OfficeKey', OpenHouse: 'OpenHouseKey', CustomProperty: 'ListingKey', PropertyRooms: 'RoomKey', PropertyUnitTypes: 'UnitTypeKey' };
const HAS_STATUS = new Set(['Property', 'Media', 'OpenHouse', 'CustomProperty', 'PropertyRooms', 'PropertyUnitTypes']);
const resources = (arg('resources', Object.keys(KEY).join(','))).split(',').map((s) => s.trim()).filter(Boolean);

const PII = /Name|Phone|Email|Remarks|Instructions|Comments|Code|Serial|Key|License|Owner|Occupant|URL|Pager|Fax|VoiceMail|Id$|Login|Description|Dimensions/;
const VOCAB = /Type$|Status$|Units$|Source$|Country|Region|YN$|Days$|Requirements$|Considerations$|Disclosures$|Concessions$|Vegetation|Amenities$|Affiliation|Designation$|Class$|Preference$|Option$|SyndicateTo|Membership$|Tenure$|Rights$|Range$|Model$|Condition$|AOR$|^Permission$/;
const recordDistinct = (resource, field) => {
  const fact = compact.resources[resource].fields[field];
  if (fact?.enum) return true;
  return VOCAB.test(field) && !PII.test(field);
};

const client = createCotalityClient();
const out = { source: 'LIVE_COTALITY', scope: scope || 'all', started: new Date().toISOString(), resources: {} };

for (const resource of resources) {
  const decl = compact.resources[resource];
  if (!decl || decl.access.state !== 'accessible') { out.resources[resource] = { error: `not accessible (${decl?.access?.state || 'undeclared'})` }; continue; }
  const suppressed = Object.entries(decl.fields).filter(([, f]) => f.filterable === false).map(([k]) => k).sort();
  if (!suppressed.length) { out.resources[resource] = { scope: null, rows: 0, fields: {} }; continue; }
  const key = KEY[resource];
  const withStatus = HAS_STATUS.has(resource);
  const select = [key, ...(withStatus && !suppressed.includes('StandardStatus') ? ['StandardStatus'] : []), ...suppressed].join(',');
  const filter0 = withStatus ? scope : null;
  const counts = Object.fromEntries(suppressed.map((f) => [f, { nonNull: 0, nonEmpty: 0, byStatus: {}, distinct: recordDistinct(resource, f) ? new Map() : null, kinds: {} }]));
  let rows = 0;
  let last = null;
  let pages = 0;
  const byStatusRows = {};
  while (true) {
    const parts = [];
    if (filter0) parts.push(`(${filter0})`);
    if (last != null) parts.push(`(${key} gt '${esc(last)}')`);
    const params = { '$select': select, '$orderby': `${key} asc`, '$top': 1000 };
    if (parts.length) params['$filter'] = parts.join(' and ');
    const json = await client.query(resource, params);
    const batch = Array.isArray(json.value) ? json.value : [];
    if (!batch.length) break;
    pages += 1;
    for (const r of batch) {
      rows += 1;
      const st = withStatus ? String(r.StandardStatus ?? 'null') : 'n/a';
      byStatusRows[st] = (byStatusRows[st] || 0) + 1;
      for (const f of suppressed) {
        const v = r[f];
        if (v === null || v === undefined) continue;
        const c = counts[f];
        c.nonNull += 1;
        if (!(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0)) c.nonEmpty += 1;
        c.byStatus[st] = (c.byStatus[st] || 0) + 1;
        const kind = Array.isArray(v) ? 'array' : typeof v;
        c.kinds[kind] = (c.kinds[kind] || 0) + 1;
        if (c.distinct) {
          for (const item of Array.isArray(v) ? v : [v]) {
            const s = String(item).slice(0, 60);
            if (c.distinct.size < 200 || c.distinct.has(s)) c.distinct.set(s, (c.distinct.get(s) || 0) + 1);
          }
        }
      }
    }
    last = batch[batch.length - 1][key];
    if (pages % 25 === 0) console.error(`[suppressed-census] ${resource}: ${rows} rows, ${pages} pages, quota ${JSON.stringify(client.quota())}`);
  }
  out.resources[resource] = {
    scope: withStatus ? (scope || 'all') : 'all (resource has no StandardStatus)', key, rows, pages, rowsByStatus: byStatusRows, suppressed: suppressed.length,
    fields: Object.fromEntries(suppressed.map((f) => [f, {
      nonNull: counts[f].nonNull, nonEmpty: counts[f].nonEmpty, byStatus: counts[f].byStatus, kinds: counts[f].kinds,
      distinct: counts[f].distinct ? Object.fromEntries([...counts[f].distinct.entries()].sort((a, b) => b[1] - a[1])) : undefined,
    }])),
  };
  console.error(`[suppressed-census] ${resource}: rows=${rows} suppressed=${suppressed.length} populated=${suppressed.filter((f) => counts[f].nonNull > 0).length}`);
}
out.finished = new Date().toISOString();
out.quota = client.quota();
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(JSON.stringify({ wrote: outPath, scope: out.scope, resources: Object.fromEntries(Object.entries(out.resources).map(([r, v]) => [r, v.error ? v.error : { rows: v.rows, suppressed: v.suppressed, populated: Object.values(v.fields).filter((f) => f.nonNull > 0).length }])) }, null, 2) + '\n');
