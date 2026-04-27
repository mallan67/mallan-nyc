#!/usr/bin/env tsx
// Refresh data/rebny-rls-property-fields.csv from live Trestle metadata.
//
// Reads the live $metadata for each of the 7 IDX Plus resources, finds
// any fields the live Trestle has but our CSV does NOT, and appends them
// as new rows to the CSV with a "Discovered: <date>" marker in a new
// column so the source of each row is traceable.
//
// IMPORTANT: This script ADDS fields the live feed has, never REMOVES
// fields. If REBNY removes a field from their official IDX Plus spec,
// that needs to be done by hand against the next published REBNY CSV.
//
// Why we don't just replace the CSV with live $metadata: REBNY's
// published IDX Plus CSV carries license-tier metadata (Required /
// Conditional / Public Display / Agent Display) that the OData
// $metadata response doesn't include. We preserve that metadata; we
// only add the missing rows.
//
// Usage:
//   npx tsx scripts/refresh-trestle-csv.ts
//   npx tsx scripts/refresh-trestle-csv.ts --dry-run
//   npx tsx scripts/refresh-trestle-csv.ts --resource Media     # one resource only

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
const argFlag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n: string) => args.includes(n);
const dryRun = has('--dry-run');
const resourceFilter = argFlag('--resource');

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
const CSV_PATH = path.resolve('data/rebny-rls-property-fields.csv');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const RESOURCES = [
  { name: 'Property',          csvLabel: 'Property' },
  { name: 'CustomProperty',    csvLabel: 'Custom Property' },
  { name: 'Member',            csvLabel: 'Member' },
  { name: 'Office',            csvLabel: 'Office' },
  { name: 'Media',             csvLabel: 'Media' },
  { name: 'PropertyUnitTypes', csvLabel: 'Property UnitTypes' },
  { name: 'OpenHouse',         csvLabel: 'Open House' },
];

async function getToken(): Promise<string> {
  const res = await fetch(`${TRESTLE_BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'api',
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error('No access_token');
  return access_token;
}

async function getMetadataXml(token: string): Promise<string> {
  const res = await fetch(`${TRESTLE_BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Metadata: ${res.status}`);
  return res.text();
}

interface FieldInfo {
  name: string;
  edmType: string;          // e.g. Edm.String, Edm.DateTimeOffset
  nullable: boolean;
  maxLength?: string;
}

function extractFieldsForResource(xml: string, resource: string): FieldInfo[] {
  const entityRegex = new RegExp(`<EntityType[^>]*\\bName\\s*=\\s*"${resource}"[\\s\\S]*?</EntityType>`, 'i');
  const m = entityRegex.exec(xml);
  if (!m) return [];
  const propRegex = /<Property\s+([^>/]+)\/?>/g;
  const fields: FieldInfo[] = [];
  let pm;
  while ((pm = propRegex.exec(m[0])) !== null) {
    const attrs = pm[1];
    const name = /Name\s*=\s*"([^"]+)"/.exec(attrs)?.[1];
    const type = /Type\s*=\s*"([^"]+)"/.exec(attrs)?.[1] || 'Edm.String';
    const nullable = !/Nullable\s*=\s*"false"/i.test(attrs);
    const maxLength = /MaxLength\s*=\s*"([^"]+)"/.exec(attrs)?.[1];
    if (!name) continue;
    fields.push({ name, edmType: type, nullable, maxLength });
  }
  return fields;
}

interface CsvRow {
  raw: string;     // original line
  cells: string[]; // parsed cells
  fieldName: string;
  resource: string;
}

function parseCsv(): { header: string; headerCells: string[]; fieldCol: number; resourceCol: number; rows: CsvRow[] } {
  const txt = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = txt.split(/\r?\n/);
  const header = lines[0];
  const headerCells = header.split(',');
  const fieldCol = headerCells.findIndex((c) => c.trim().toLowerCase().includes('matrixfieldname'));
  const resourceCol = headerCells.findIndex((c) => c.trim().toLowerCase() === 'resource');
  if (fieldCol < 0 || resourceCol < 0) {
    throw new Error(`Cannot find MatrixFieldName/Resource cols. Header: ${header}`);
  }
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split(',');
    rows.push({
      raw: line,
      cells,
      fieldName: (cells[fieldCol] || '').trim(),
      resource: (cells[resourceCol] || '').trim(),
    });
  }
  return { header, headerCells, fieldCol, resourceCol, rows };
}

async function main() {
  console.log('Pulling Trestle token + metadata...');
  const token = await getToken();
  const xml = await getMetadataXml(token);
  console.log(`  ✓ metadata fetched (${(xml.length / 1024).toFixed(0)} KB)`);
  console.log('');

  const csv = parseCsv();
  console.log(`Existing CSV: ${csv.rows.length} rows, ${csv.headerCells.length} columns`);
  console.log('');

  const newRows: string[] = [];
  let totalNew = 0;
  let totalLive = 0;

  for (const r of RESOURCES) {
    if (resourceFilter && r.name !== resourceFilter) continue;
    const liveFields = extractFieldsForResource(xml, r.name);
    totalLive += liveFields.length;
    const existing = new Set(csv.rows.filter((row) => row.resource.replace(/\s+/g, '') === r.name).map((row) => row.fieldName));
    const toAdd = liveFields.filter((f) => !existing.has(f.name));

    console.log(`── ${r.name.padEnd(20)} csv=${existing.size}  live=${liveFields.length}  new=${toAdd.length}`);

    for (const f of toAdd) {
      // Build a CSV row matching the existing column shape. The columns we
      // know for sure: MatrixFieldName, Resource, plus a marker column at
      // the end for traceability. Other columns get empty values.
      const row = csv.headerCells.map((h, idx) => {
        const k = h.trim().toLowerCase();
        if (idx === csv.fieldCol) return f.name;
        if (idx === csv.resourceCol) return r.csvLabel;
        if (k.includes('attribute name')) return f.name;
        if (k.includes('standard type')) return f.edmType;
        if (k === 'feed') return 'live-discovered';
        return '';
      });
      newRows.push(row.join(','));
      totalNew++;
    }
  }

  console.log('');
  console.log(`Summary: live total ${totalLive}, csv existing ${csv.rows.length}, will add ${totalNew} rows`);
  console.log('');

  if (totalNew === 0) {
    console.log('✓ CSV is in sync with live Trestle for the queried resources. Nothing to write.');
    return;
  }

  if (dryRun) {
    console.log('--dry-run: not writing. Sample of rows that would be added (top 10):');
    for (const row of newRows.slice(0, 10)) console.log('  + ' + row);
    return;
  }

  // Append to file
  const original = fs.readFileSync(CSV_PATH, 'utf-8');
  const trailingNewline = original.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(CSV_PATH, original + trailingNewline + newRows.join('\n') + '\n');
  console.log(`✓ Wrote ${totalNew} new rows to ${CSV_PATH}`);
  console.log('  Existing rows preserved (no removals; refresh is additive only).');
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
