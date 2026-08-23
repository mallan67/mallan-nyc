#!/usr/bin/env tsx
// Live Trestle metadata vs local CSV truth check.
//
// Pulls $metadata + sample records from Trestle, extracts the live field
// list per resource, then diffs against data/rebny-rls-property-fields.csv
// (the file the "rls:validate" script keys off).
//
// Output: which fields are on Trestle live but missing from our CSV (i.e.
// new/changed since 2026-03-19), and which fields are in our CSV but no
// longer on Trestle (i.e. removed since the spec was published).
//
// Read-only. No DB or schema changes.

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { detectResidue } from './lib/csv-residue';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET in .env.local');
  process.exit(1);
}

// Resources we care about — the IDX Plus 7 + a couple Trestle extras
const COTALITYURCES = ['Property', 'CustomProperty', 'Member', 'Office', 'Media', 'PropertyUnitTypes', 'OpenHouse'];

async function getToken(): Promise<string> {
  const tokenUrl = `${TRESTLE_BASE}/oidc/connect/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'api',
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token request failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('No access_token in response');
  return json.access_token;
}

async function fetchSample(token: string, resource: string): Promise<Record<string, unknown> | null> {
  // Pull 1 row with all fields. The OData response includes every property
  // on the entity, which gives us the live field list.
  const url = `${TRESTLE_BASE}/odata/${resource}?$top=1`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`  ${resource} fetch failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const json = (await res.json()) as { value?: Record<string, unknown>[] };
  return json.value?.[0] || null;
}

async function fetchMetadataFields(token: string, resource: string): Promise<string[] | null> {
  // The full metadata XML lists every property defined on the entity, even
  // ones not present in a particular sample row.
  const url = `${TRESTLE_BASE}/odata/$metadata`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const xml = await res.text();
  // Extract <Property Name="..."/> entries from the EntityType matching this resource
  const entityRegex = new RegExp(`<EntityType[^>]*\\bName\\s*=\\s*"${resource}"[\\s\\S]*?</EntityType>`, 'i');
  const m = entityRegex.exec(xml);
  if (!m) return null;
  const propRegex = /<Property\s+Name\s*=\s*"([^"]+)"/g;
  const props: string[] = [];
  let pm;
  while ((pm = propRegex.exec(m[0])) !== null) {
    props.push(pm[1]);
  }
  return props.sort();
}

function parseCsvFields(): Map<string, Set<string>> {
  // Build resource → Set<field> from data/rebny-rls-property-fields.csv
  const csvPath = path.resolve('data/rebny-rls-property-fields.csv');
  const txt = fs.readFileSync(csvPath, 'utf-8');
  const lines = txt.split('\n');
  const header = lines[0].split(',');
  const fieldNameIdx = header.findIndex((c) => c.toLowerCase().includes('matrixfieldname'));
  const resourceIdx = header.findIndex((c) => c.trim().toLowerCase() === 'resource');
  if (fieldNameIdx < 0 || resourceIdx < 0) {
    throw new Error(`Cannot find MatrixFieldName/Resource columns in CSV. Header: ${lines[0]}`);
  }
  const out = new Map<string, Set<string>>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const field = (cells[fieldNameIdx] || '').trim();
    let resource = (cells[resourceIdx] || '').trim();
    if (!field || !resource) continue;
    // Normalize "Custom Property" → "CustomProperty", "Property UnitTypes" → "PropertyUnitTypes"
    resource = resource.replace(/\s+/g, '');
    if (!out.has(resource)) out.set(resource, new Set());
    out.get(resource)!.add(field);
  }
  return out;
}

async function main() {
  console.log('Pulling token...');
  const token = await getToken();
  console.log('  ✓ token acquired');
  console.log('');

  const csvFields = parseCsvFields();
  const liveByResource = new Map<string, Set<string>>();

  for (const resource of COTALITYURCES) {
    console.log(`── ${resource} ${'─'.repeat(50 - resource.length)}`);
    const liveFields = await fetchMetadataFields(token, resource);
    if (!liveFields) {
      console.log('  metadata fetch failed — skipping');
      continue;
    }
    const csvSet = csvFields.get(resource) || new Set<string>();
    const liveSet = new Set(liveFields);
    liveByResource.set(resource, liveSet); // feeds the residue detector (empty-fetch-guarded)

    const onlyOnLive = liveFields.filter((f) => !csvSet.has(f)).sort();
    const onlyInCsv = [...csvSet].filter((f) => !liveSet.has(f)).sort();

    console.log(`  CSV count:  ${csvSet.size}`);
    console.log(`  Live count: ${liveSet.size}`);
    console.log(`  In live, NOT in CSV (new/changed):  ${onlyOnLive.length}`);
    console.log(`  In CSV, NOT on live (removed):       ${onlyInCsv.length}`);

    if (onlyOnLive.length > 0) {
      console.log('  Sample new live fields (top 10):');
      for (const f of onlyOnLive.slice(0, 10)) console.log(`    + ${f}`);
    }
    if (onlyInCsv.length > 0) {
      console.log('  Sample removed-from-live fields (top 10):');
      for (const f of onlyInCsv.slice(0, 10)) console.log(`    - ${f}`);
    }
    console.log('');
  }

  // Migration-residue gate: FAIL (non-zero exit) when any resource has CSV rows
  // (field, resource) that no longer exist on live for that resource. Valid
  // multi-resource fields are preserved; empty/failed fetches are skipped.
  const residue = detectResidue(csvFields, liveByResource);
  console.log('── SUMMARY ─────────────────────────────────────────');
  console.log(`  Migration residue (CSV rows not on live for their resource): ${residue.length}`);
  if (residue.length > 0) {
    for (const r of residue) console.log(`    - ${r.field}  (${r.resource})`);
    console.log('');
    console.log('  ✗ FAIL — stale CSV resource ownership. Prune with `npm run trestle:refresh-csv -- --prune`.');
    process.exit(1);
  }
  console.log('  ✓ no residue — CSV resource ownership matches live.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
