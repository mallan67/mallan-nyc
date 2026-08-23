#!/usr/bin/env tsx
// Per-resource Trestle $select audit for non-Property resources.
//
// Scans every line that addresses a non-Property OData resource and extracts
// the explicit $select field list. Then cross-checks each name against the
// live $metadata for that resource. Same for fields embedded in $expand=Resource(...)
// blocks.

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET');
  process.exit(1);
}

const RESOURCES = [
  'Member', 'Office', 'Media', 'OpenHouse', 'PropertyUnitTypes',
  'Building', 'Teams', 'TeamMembers', 'PropertyGreenVerification',
  'PropertyRooms', 'CustomProperty',
];

const SCAN_PATHS = ['lib/idx', 'lib/compliance', 'app/api'];

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

async function getResourceFields(): Promise<Map<string, Set<string>>> {
  const token = await getToken();
  const xml = await (await fetch(`${TRESTLE_BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } })).text();
  const byResource = new Map<string, Set<string>>();
  const entityRegex = /<EntityType\s+Name\s*=\s*"([^"]+)"[\s\S]*?<\/EntityType>/g;
  let em;
  while ((em = entityRegex.exec(xml)) !== null) {
    const name = em[1];
    const fields = new Set<string>();
    const propRegex = /<Property\s+Name\s*=\s*"([^"]+)"/g;
    let pm;
    while ((pm = propRegex.exec(em[0])) !== null) fields.add(pm[1]);
    byResource.set(name, fields);
  }
  return byResource;
}

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

interface Finding {
  resource: string;
  file: string;
  line: number;
  field: string;
  text: string;
}

(async () => {
  console.log('Pulling live Trestle metadata...');
  const liveByResource = await getResourceFields();
  console.log(`  ✓ ${liveByResource.size} resources in live $metadata`);
  console.log('');

  const allFiles: string[] = [];
  for (const p of SCAN_PATHS) allFiles.push(...listTsFiles(p));

  const findings: Finding[] = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(process.cwd(), file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // Pattern A: `/odata/<Resource>?…$select=A,B,C`. We allow $select to span
      // multiple lines or be in a separate URLSearchParams call — so instead
      // of regexing one line, look for a Resource URL on this line and then
      // search the next 30 lines for `$select` set or string.
      for (const resource of RESOURCES) {
        const urlPattern = new RegExp(`/odata/${resource}\\b`);
        if (!urlPattern.test(line)) continue;
        const liveFields = liveByResource.get(resource);
        if (!liveFields) continue;

        // Look ABOVE this line (where the URL fetch happens) for the $select
        // assignment. URLSearchParams.set('$select', '...') typically precedes
        // the fetch by a few lines.
        const start = Math.max(0, i - 30);
        let windowText = lines.slice(start, i + 1).join('\n');
        // Strip out $expand=Resource($select=...) groups so we don't
        // misattribute expanded-resource fields to the outer resource.
        windowText = windowText.replace(/\$expand=[A-Z][A-Za-z]+\(\$select=[^)]+\)/g, '$expand=__OUT__');
        // Also strip when $expand is set via URLSearchParams.set('$expand', '...')
        windowText = windowText.replace(/['"`]\$expand['"`]\s*,\s*['"`][^'"`]+['"`]/g, '"\\$expand","__OUT__"');
        const selectMatches = [
          ...windowText.matchAll(/['"`]\$select['"`]\s*,\s*['"`]([^'"`]+)['"`]/g),
          ...windowText.matchAll(/\$select:\s*['"`]([^'"`]+)['"`]/g),
        ];
        for (const m of selectMatches) {
          const fields = m[1].split(',').map((s) => s.trim()).filter(Boolean);
          for (const field of fields) {
            // Strip any nested parens, e.g. "Media($select=...)" — left side only
            const bare = field.replace(/\(.*$/, '');
            if (!bare || /[^A-Za-z]/.test(bare)) continue;
            if (!liveFields.has(bare)) {
              findings.push({
                resource,
                file: rel,
                line: i + 1,
                field: bare,
                text: trimmed.slice(0, 140),
              });
            }
          }
        }
      }

      // Pattern B: $expand=<Resource>($select=A,B,C) — fields belong to the
      // expanded resource, not Property.
      const expandRe = /\$expand=([A-Z][A-Za-z]+)\(\$select=([^)]+)\)/g;
      let xm;
      while ((xm = expandRe.exec(line)) !== null) {
        const resource = xm[1];
        const liveFields = liveByResource.get(resource);
        if (!liveFields) continue;
        const fields = xm[2].split(',').map((s) => s.trim()).filter(Boolean);
        for (const field of fields) {
          if (!field || /[^A-Za-z]/.test(field)) continue;
          if (!liveFields.has(field)) {
            findings.push({
              resource,
              file: rel,
              line: i + 1,
              field,
              text: trimmed.slice(0, 140),
            });
          }
        }
      }
    }
  }

  console.log('═══ NON-PROPERTY RESOURCE $SELECT AUDIT ═══');
  console.log('');
  if (findings.length === 0) {
    console.log('✓ Every $select against non-Property resources uses fields that exist on that resource.');
  } else {
    const byResource = new Map<string, Finding[]>();
    for (const f of findings) {
      const k = f.resource;
      if (!byResource.has(k)) byResource.set(k, []);
      byResource.get(k)!.push(f);
    }
    for (const [resource, list] of byResource) {
      console.log(`✗ ${resource}: ${list.length} stale field reference(s)`);
      for (const f of list) {
        console.log(`     ${f.file}:${f.line} — "${f.field}" not in live ${resource} $metadata`);
        console.log(`        ${f.text}`);
      }
      console.log('');
    }
  }
  process.exit(findings.length > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
