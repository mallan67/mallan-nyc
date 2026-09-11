#!/usr/bin/env node
// OBSERVED VOCABULARY — for every enum-typed field on every accessible resource, the distinct values the
// feed actually carries today, via the provider's documented `$apply=groupby((Field))` (Trestle WebAPI
// Reference: "$apply=groupby() returns unique values for the specified field(s); maximum 10,000"). One
// request per field, all statuses, no sampling. Multi-enum fields come back as comma-joined combinations;
// they are split into member sets and the combinations are kept as well. A provider-suppressed field is
// rejected with "…suppressed (provider Level) as field X cannot be used for filtering or grouping" — the
// verbatim message is recorded as the suppression evidence.
//
//   node scripts/cotality/observed-vocabulary.mjs [--resources=Property,Media,...] [--out=<file>]
//
// This is OBSERVED vocabulary. The CONTRACT vocabulary is the live Lookup catalogue
// (data/cotality-contract/lookups.live.json). The two are never collapsed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const outPath = arg('out', 'artifacts/cotality-contract/observed-vocabulary.json');
const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const lookups = JSON.parse(readFileSync('data/cotality-contract/lookups.live.json', 'utf8'));
const resources = (arg('resources', 'Property,Media,Member,Office,OpenHouse,CustomProperty,PropertyRooms,PropertyUnitTypes')).split(',').map((s) => s.trim()).filter(Boolean);

const client = createCotalityClient();
const out = { source: 'LIVE_COTALITY', method: '$apply=groupby((Field)) per enum field, all statuses', started: new Date().toISOString(), resources: {} };
for (const resource of resources) {
  const decl = compact.resources[resource];
  if (!decl || decl.access.state !== 'accessible') { out.resources[resource] = { error: `not accessible (${decl?.access?.state || 'undeclared'})` }; continue; }
  const fields = Object.entries(decl.fields).filter(([, f]) => f.enum).map(([k]) => k).sort();
  const res = { fields: {} };
  for (const field of fields) {
    const fact = decl.fields[field];
    const declared = lookups[resource]?.[field]?.members || [];
    try {
      const json = await client.query(resource, { '$apply': `groupby((${field}))` });
      const rows = Array.isArray(json.value) ? json.value : [];
      const combos = rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined).map(String);
      const members = new Set();
      for (const c of combos) for (const m of (fact.multi ? c.split(',') : [c])) if (m !== '') members.add(m);
      const declaredSet = new Set(declared);
      res.fields[field] = {
        multi: fact.multi, filterable: fact.filterable, status: 'observed', distinctCombinations: combos.length, hasNull: rows.some((r) => r[field] === null),
        observedMembers: [...members].sort(), declaredMembers: declared.length,
        observedNotDeclared: [...members].filter((m) => !declaredSet.has(m)).sort(),
        declaredNotObserved: declared.filter((m) => !members.has(m)).sort(),
        // DIAGNOSTIC ONLY. Raw combinations are kept in full and separately from the member set; the
        // published vocabulary authority remains Field → LookupName → Lookup.
        rawCombinations: fact.multi ? combos : undefined,
      };
    } catch (error) {
      res.fields[field] = { multi: fact.multi, filterable: fact.filterable, status: Number(error?.status) === 400 ? 'rejected' : 'error', http: error?.status ?? null, message: String(error?.body || error?.message || '').slice(0, 300), declaredMembers: declared.length };
    }
  }
  out.resources[resource] = res;
  console.error(`[observed-vocabulary] ${resource}: ${fields.length} enum fields, observed=${Object.values(res.fields).filter((f) => f.status === 'observed').length}, rejected=${Object.values(res.fields).filter((f) => f.status === 'rejected').length}`);
}
out.finished = new Date().toISOString();
out.quota = client.quota();
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(JSON.stringify({ wrote: outPath, resources: Object.fromEntries(Object.entries(out.resources).map(([r, v]) => [r, v.error || { fields: Object.keys(v.fields).length, observed: Object.values(v.fields).filter((f) => f.status === 'observed').length, rejected: Object.values(v.fields).filter((f) => f.status === 'rejected').length }])) }, null, 2) + '\n');
