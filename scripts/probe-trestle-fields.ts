#!/usr/bin/env tsx
// Probe live Trestle metadata + sample records for specific candidate
// field names. Useful when the audit reports an orphan binding and we
// need to find the correct replacement name on the current Trestle spec.

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: npx tsx scripts/probe-trestle-fields.ts <substring1> [<substring2> ...]');
  console.error('Example: npx tsx scripts/probe-trestle-fields.ts Bathroom Lease Deposit Video');
  process.exit(1);
}

async function getToken(): Promise<string> {
  const res = await fetch(`${TRESTLE_BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials', scope: 'api',
    }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

(async () => {
  const token = await getToken();
  const xml = await (await fetch(`${TRESTLE_BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } })).text();

  // Pull sample CustomFields keys too (they're not in $metadata)
  const cfRes = await fetch(`${TRESTLE_BASE}/odata/CustomProperty?$top=20`, { headers: { authorization: `Bearer ${token}` } });
  const cf = ((await cfRes.json()) as { value?: Array<Record<string, unknown>> }).value || [];
  const cfKeys = new Set<string>();
  for (const row of cf) {
    const c = row.CustomFields;
    if (typeof c === 'string' && c.startsWith('{')) {
      try { for (const k of Object.keys(JSON.parse(c))) cfKeys.add(k); } catch { /* ignore */ }
    }
  }

  // Per-resource regex — find ALL Property elements in each EntityType
  const byResource = new Map<string, string[]>();
  const entityRegex = /<EntityType\s+Name\s*=\s*"([^"]+)"[\s\S]*?<\/EntityType>/g;
  let em;
  while ((em = entityRegex.exec(xml)) !== null) {
    const name = em[1];
    const propRegex = /<Property\s+Name\s*=\s*"([^"]+)"/g;
    const fields: string[] = [];
    let pm;
    while ((pm = propRegex.exec(em[0])) !== null) fields.push(pm[1]);
    byResource.set(name, fields);
  }

  for (const term of args) {
    console.log('');
    console.log(`╔═ "${term}" ═════════════════════════════════════════════`);
    let total = 0;
    for (const [resource, fields] of byResource) {
      const hits = fields.filter((f) => f.toLowerCase().includes(term.toLowerCase()));
      if (hits.length > 0) {
        console.log(`  ${resource}:`);
        for (const h of hits) console.log(`    ${h}`);
        total += hits.length;
      }
    }
    const cfHits = [...cfKeys].filter((k) => k.toLowerCase().includes(term.toLowerCase()));
    if (cfHits.length > 0) {
      console.log('  CustomProperty.CustomFields (live sample):');
      for (const h of cfHits) console.log(`    ${h}`);
      total += cfHits.length;
    }
    if (total === 0) console.log('  (no matches across any resource or CustomFields)');
  }
})().catch((e) => { console.error(e); process.exit(1); });
