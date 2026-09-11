#!/usr/bin/env node
// STORED STATUS vs LIVE — for a set of stored listings (ids file: [{type, ids[]}]), ask the live feed what each
// listing is today. Batched `ListingId in (...)`, no sampling. Output: per stored type, how many are absent from the
// entitled feed and how many are present, by live StandardStatus / MajorChangeType.
//   node scripts/cotality/stored-status-vs-live.mjs --ids=<file> --stored=Withdrawn --out=<file>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const groups = JSON.parse(readFileSync(arg('ids'), 'utf8'));
const stored = arg('stored', 'Withdrawn');
const outPath = arg('out', 'artifacts/cotality-contract/stored-status-vs-live.json');
const client = createCotalityClient();
const esc = (v) => String(v).replace(/'/g, "''");
const SELECT = 'ListingId,ListingKey,PropertyType,StandardStatus,MajorChangeType,MajorChangeTimestamp,CloseDate,OffMarketDate,PendingTimestamp,PurchaseContractDate,BackOnMarketDate,ModificationTimestamp,Permission';
const out = { source: 'LIVE_COTALITY', stored, started: new Date().toISOString(), groups: {} };
for (const g of groups) {
  const res = { stored: g.ids.length, present: 0, absent: 0, byLiveStatus: {}, byLiveStatusAndMajorChange: {}, byPermission: {}, presentSamples: [], presentRows: [], absentSample: [], absentIds: [] };
  for (let i = 0; i < g.ids.length; i += 100) {
    const batch = g.ids.slice(i, i + 100);
    const json = await client.query('Property', { '$select': SELECT, '$filter': `ListingId in (${batch.map((x) => `'${esc(x)}'`).join(',')})`, '$top': 1000 });
    const rows = json.value || [];
    const seen = new Set(rows.map((r) => r.ListingId));
    for (const r of rows) {
      res.present += 1;
      const st = String(r.StandardStatus); const mct = String(r.MajorChangeType);
      res.byLiveStatus[st] = (res.byLiveStatus[st] || 0) + 1;
      const k = `${st} / ${mct}`; res.byLiveStatusAndMajorChange[k] = (res.byLiveStatusAndMajorChange[k] || 0) + 1;
      const perm = String(r.Permission); res.byPermission[perm] = (res.byPermission[perm] || 0) + 1;
      res.presentRows.push({ ListingId: r.ListingId, ListingKey: r.ListingKey, PropertyType: r.PropertyType, StandardStatus: r.StandardStatus, MajorChangeType: r.MajorChangeType, CloseDate: r.CloseDate, ModificationTimestamp: r.ModificationTimestamp });
      if (res.presentSamples.length < 12) res.presentSamples.push({ ListingId: r.ListingId, StandardStatus: r.StandardStatus, MajorChangeType: r.MajorChangeType, CloseDate: r.CloseDate, OffMarketDate: r.OffMarketDate, ModificationTimestamp: r.ModificationTimestamp, Permission: r.Permission });
    }
    for (const id of batch) if (!seen.has(id)) { res.absent += 1; res.absentIds.push(id); if (res.absentSample.length < 12) res.absentSample.push(id); }
    if ((i / 100) % 10 === 0) console.error(`[stored-vs-live] ${g.type}: ${i + batch.length}/${g.ids.length} present=${res.present} absent=${res.absent}`);
  }
  out.groups[g.type] = res;
}
out.finished = new Date().toISOString();
out.quota = client.quota();
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(out.groups).map(([t, r]) => [t, { stored: r.stored, present: r.present, absent: r.absent, byLiveStatus: r.byLiveStatus, byLiveStatusAndMajorChange: r.byLiveStatusAndMajorChange, byPermission: r.byPermission }])), null, 2) + '\n');
