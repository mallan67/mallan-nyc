#!/usr/bin/env tsx
// Comprehensive form-to-Trestle coverage audit.
//
// For every CRM form/search HTML file, cross-reference the bindings
// against LIVE Trestle metadata. Reports four classes of finding per
// (file × resource):
//
//   1. STALE_BINDING     — data-rls-field points at a field that no
//                           longer exists on live Trestle. Validation
//                           was never going to catch this without a
//                           live check.
//   2. UNBOUND_INPUT     — a form <input>/<select>/<textarea> exists
//                           with an id matching a live Trestle field
//                           but no data-rls-field attribute is set,
//                           so the existing validator skips it.
//   3. UNCOVERED_FIELD   — the live Trestle resource has a field that
//                           NO form in the codebase binds to. May be
//                           intentional (agents don't fill it) or a
//                           gap (we should be collecting it).
//   4. ORPHAN_BINDING    — data-rls-field set, but no matching live
//                           Trestle resource has that field. Either
//                           cross-resource lookup or stale name.
//
// Usage:
//   npx tsx scripts/audit-form-trestle-coverage.ts
//   npx tsx scripts/audit-form-trestle-coverage.ts --json > coverage.json
//   npx tsx scripts/audit-form-trestle-coverage.ts --resource Property
//   npx tsx scripts/audit-form-trestle-coverage.ts --file SALE-FORM-REDESIGN.html

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { parse as parseHTML } from 'node-html-parser';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
const argFlag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n: string) => args.includes(n);
const jsonOutput = has('--json');
const resourceFilter = argFlag('--resource');
const fileFilter = argFlag('--file');

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const COTALITYURCES = ['Property', 'CustomProperty', 'Member', 'Office', 'Media', 'PropertyUnitTypes', 'OpenHouse'];

// Files we audit. Include both submission forms AND search forms — the
// search forms typically don't have data-rls-field today (which is the
// gap), so the audit also reports their input ids vs Trestle fields.
const FORM_FILES = [
  // Submission forms
  'public/crm/SALE-FORM-REDESIGN.html',
  'public/crm/RENTAL-FORM-REDESIGN.html',
  // Read-only viewer forms (should mirror submission bindings)
  'public/crm/SALE-FORM-WITH-TOOLS.html',
  'public/crm/RENTAL-FORM-WITH-TOOLS.html',
  // Search forms (basic + advanced + buildings) — currently unbound
  'public/crm/html/search-form-and-results.html',
  // Other CRM pages with form inputs
  'public/crm/dashboard.html',
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
  if (!res.ok) throw new Error(`Token: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function getMetadataXml(token: string): Promise<string> {
  const res = await fetch(`${TRESTLE_BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Metadata: ${res.status}`);
  return res.text();
}

// REBNY's per-resource ${name}.CustomFields blob carries 40+ extra fields
// that DON'T appear in OData $metadata (they're keys inside a JSON string,
// not entity properties). Sample a live record and extract those keys.
async function getCustomPropertyFieldsFromSample(token: string): Promise<Set<string>> {
  const fields = new Set<string>();
  // Try a couple of live records — different listings expose different
  // key sets in CustomFields, so union across a small sample.
  const url = `${TRESTLE_BASE}/odata/CustomProperty?$top=20`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return fields;
  const json = (await res.json()) as { value?: Array<Record<string, unknown>> };
  for (const row of json.value || []) {
    const cf = row.CustomFields;
    if (typeof cf === 'string' && cf.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(cf);
        for (const k of Object.keys(parsed)) fields.add(k);
      } catch { /* swallow */ }
    } else if (cf && typeof cf === 'object') {
      for (const k of Object.keys(cf as object)) fields.add(k);
    }
  }
  return fields;
}

function extractFieldsForResource(xml: string, resource: string): Set<string> {
  const entityRegex = new RegExp(`<EntityType[^>]*\\bName\\s*=\\s*"${resource}"[\\s\\S]*?</EntityType>`, 'i');
  const m = entityRegex.exec(xml);
  if (!m) return new Set();
  const propRegex = /<Property\s+Name\s*=\s*"([^"]+)"/g;
  const fields = new Set<string>();
  let pm;
  while ((pm = propRegex.exec(m[0])) !== null) fields.add(pm[1]);
  return fields;
}

interface FormSurvey {
  file: string;
  totalInputs: number;
  bindings: Map<string, number>;       // field name → count
  unboundInputs: Array<{ id: string; type: string; name?: string }>;
}

function surveyForm(filePath: string): FormSurvey | null {
  if (!fs.existsSync(filePath)) return null;
  const html = fs.readFileSync(filePath, 'utf-8');
  const root = parseHTML(html);

  const survey: FormSurvey = {
    file: filePath,
    totalInputs: 0,
    bindings: new Map(),
    unboundInputs: [],
  };

  // Collect data-rls-field bindings
  const bound = root.querySelectorAll('[data-rls-field]');
  for (const el of bound) {
    const field = el.getAttribute('data-rls-field') || '';
    if (!field) continue;
    survey.bindings.set(field, (survey.bindings.get(field) || 0) + 1);
  }

  // Collect form-control elements lacking a binding (excluding data-rls-ignore)
  const inputs = root.querySelectorAll('input, select, textarea');
  survey.totalInputs = inputs.length;
  for (const el of inputs) {
    if (el.getAttribute('data-rls-ignore') === 'true') continue;
    if (el.getAttribute('data-rls-field')) continue;
    const id = el.getAttribute('id') || '';
    const name = el.getAttribute('name') || '';
    const type = el.tagName.toLowerCase() + (el.getAttribute('type') ? `[type=${el.getAttribute('type')}]` : '');
    if (!id && !name) continue;
    survey.unboundInputs.push({ id, type, name });
  }

  return survey;
}

interface Finding {
  kind: 'STALE_BINDING' | 'UNBOUND_INPUT' | 'UNCOVERED_FIELD' | 'ORPHAN_BINDING';
  file?: string;
  resource?: string;
  field: string;
  detail?: string;
}

async function main() {
  const log = (msg: string) => { if (!jsonOutput) console.log(msg); };
  log('Pulling live Trestle metadata...');
  const token = await getToken();
  const xml = await getMetadataXml(token);

  const liveByResource = new Map<string, Set<string>>();
  const allLiveFields = new Set<string>();
  for (const r of COTALITYURCES) {
    const fields = extractFieldsForResource(xml, r);
    liveByResource.set(r, fields);
    for (const f of fields) allLiveFields.add(f);
  }
  // Pull actual CustomFields keys from a live sample (these are keys inside
  // CustomProperty.CustomFields JSON — not visible in $metadata).
  log('Sampling CustomProperty.CustomFields keys from live...');
  const customFieldKeys = await getCustomPropertyFieldsFromSample(token);

  // Plus the authoritative REBNY 40-key CustomFields list (from CLAUDE.md
  // section "CustomProperty.CustomFields (41 REBNY fields in JSON string)").
  // Different listings carry different subsets — a small sample misses
  // several legitimate keys, so we union with this canonical list.
  const REBNY_CUSTOM_FIELDS = [
    'AttendanceType', 'BathroomCondition', 'BuildingParkingTotal',
    'BuildingRules', 'BuildingSmokeFreeYN', 'BuildingTaxLot',
    'CapitalReservesTotal', 'CapitalReservesYN', 'CeilingHeightFeet',
    'CeilingHeightInches', 'CertificateOfOccupancyYN', 'ClosetsTotal',
    'CommercialUnitsYN', 'ElevatorsTotal', 'FlipTax', 'FlipTaxRemarks',
    'FlipTaxType', 'FurnishedListPrice', 'FurnishedMaxLeaseMonths',
    'FurnishedMinLeaseMonths', 'GuarantorsAcceptedYN', 'KitchenCondition',
    'LandmarkStatusYN', 'ManagingAgencyListingYN', 'MaxLeaseMonths',
    'MaximumFinancingAmount', 'MaximumFinancingPercent',
    'MaximumFinancingRemarks', 'PercentOfCommonElements',
    'PrivateOutdoorSpaceSize', 'SponsorUnitYN', 'TaxAbatementComments',
    'TaxAbatementExpirationYear', 'TaxAbatementYN', 'TaxDeductionAmount',
    'TaxDeductionPercent', 'TaxDeductionRemarks', 'TaxMonthlyAmount',
    'UnitLine', 'ViewRemarks',
  ];
  const allCustomKeys = new Set([...customFieldKeys, ...REBNY_CUSTOM_FIELDS]);
  for (const k of allCustomKeys) {
    liveByResource.get('CustomProperty')!.add(k);
    allLiveFields.add(k);
  }
  log(`  ✓ live total: ${allLiveFields.size} fields across ${COTALITYURCES.length} resources`);
  log(`     (CustomProperty includes ${allCustomKeys.size} CustomFields keys: ${customFieldKeys.size} from sample + ${REBNY_CUSTOM_FIELDS.length} from REBNY canonical list)`);
  log('');

  const surveys: FormSurvey[] = [];
  for (const file of FORM_FILES) {
    if (fileFilter && !file.endsWith(fileFilter)) continue;
    const s = surveyForm(file);
    if (s) surveys.push(s);
  }

  // Aggregate all bindings across surveys → which live fields are covered by ANY form
  const allBoundFields = new Set<string>();
  for (const s of surveys) for (const f of s.bindings.keys()) allBoundFields.add(f);

  const findings: Finding[] = [];

  // 1. STALE_BINDING + 4. ORPHAN_BINDING per file
  for (const s of surveys) {
    for (const [field] of s.bindings) {
      let foundInResource: string | null = null;
      for (const r of COTALITYURCES) {
        if (liveByResource.get(r)!.has(field)) { foundInResource = r; break; }
      }
      if (!foundInResource) {
        findings.push({
          kind: 'ORPHAN_BINDING',
          file: s.file,
          field,
          detail: `field name "${field}" is not present on any of the 7 live Trestle resources`,
        });
      }
    }
  }

  // 2. UNBOUND_INPUT — input id matches a live Trestle field but no binding
  // Use case-insensitive match since HTML ids are sometimes lowercased
  const liveLowerToCanonical = new Map<string, { resource: string; field: string }>();
  for (const r of COTALITYURCES) {
    for (const f of liveByResource.get(r)!) {
      liveLowerToCanonical.set(f.toLowerCase(), { resource: r, field: f });
    }
  }
  for (const s of surveys) {
    for (const inp of s.unboundInputs) {
      const candidates = [inp.id, inp.name].filter(Boolean);
      for (const cand of candidates) {
        // Strip common prefixes (sale/rental/bldg/adv/comp + camelCase)
        const stripped = cand
          .replace(/^(sale|rental|bldg|building|adv|comp)/i, '')
          .replace(/^[A-Z]/, (c) => c.toLowerCase());
        const matches = [cand.toLowerCase(), stripped.toLowerCase()];
        for (const m of matches) {
          const hit = liveLowerToCanonical.get(m);
          if (hit) {
            findings.push({
              kind: 'UNBOUND_INPUT',
              file: s.file,
              resource: hit.resource,
              field: hit.field,
              detail: `<${inp.type}> id="${inp.id}" matches live Trestle ${hit.resource}.${hit.field} but has no data-rls-field`,
            });
            break;
          }
        }
      }
    }
  }

  // 3. UNCOVERED_FIELD per resource — live field that NO form in repo binds
  for (const r of COTALITYURCES) {
    if (resourceFilter && r !== resourceFilter) continue;
    for (const f of liveByResource.get(r)!) {
      if (!allBoundFields.has(f)) {
        findings.push({
          kind: 'UNCOVERED_FIELD',
          resource: r,
          field: f,
          detail: `no form in the codebase binds to ${r}.${f}`,
        });
      }
    }
  }

  // ─── Output ────────────────────────────────────────────────────────────
  if (jsonOutput) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      live_field_count: allLiveFields.size,
      live_by_resource: Object.fromEntries(
        Array.from(liveByResource).map(([r, s]) => [r, s.size])
      ),
      forms: surveys.map((s) => ({
        file: s.file,
        total_inputs: s.totalInputs,
        bindings_total: Array.from(s.bindings.values()).reduce((a, b) => a + b, 0),
        bindings_unique: s.bindings.size,
        unbound_inputs: s.unboundInputs.length,
      })),
      findings_summary: {
        stale_binding: findings.filter((f) => f.kind === 'STALE_BINDING').length,
        orphan_binding: findings.filter((f) => f.kind === 'ORPHAN_BINDING').length,
        unbound_input: findings.filter((f) => f.kind === 'UNBOUND_INPUT').length,
        uncovered_field: findings.filter((f) => f.kind === 'UNCOVERED_FIELD').length,
      },
      findings,
    }, null, 2));
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Form ↔ Live Trestle Coverage Audit                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('── PER-FORM BINDING SURVEY ────────────────────────────────────');
  for (const s of surveys) {
    const totalBindings = Array.from(s.bindings.values()).reduce((a, b) => a + b, 0);
    console.log(`  ${path.basename(s.file).padEnd(36)} ${s.totalInputs.toString().padStart(4)} inputs  ${totalBindings.toString().padStart(4)} bindings  ${s.bindings.size.toString().padStart(4)} unique  ${s.unboundInputs.length.toString().padStart(4)} unbound`);
  }
  console.log('');

  console.log('── PER-COTALITYURCE LIVE COVERAGE ─────────────────────────────────');
  for (const r of COTALITYURCES) {
    if (resourceFilter && r !== resourceFilter) continue;
    const live = liveByResource.get(r)!;
    const covered = Array.from(live).filter((f) => allBoundFields.has(f)).length;
    const pct = live.size > 0 ? Math.round((covered / live.size) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`  ${r.padEnd(20)} ${covered.toString().padStart(4)} / ${live.size.toString().padStart(4)}  ${bar} ${pct}%`);
  }
  console.log('');

  const stale = findings.filter((f) => f.kind === 'ORPHAN_BINDING');
  if (stale.length > 0) {
    console.log('── ORPHAN BINDINGS (data-rls-field name not on any live resource) ─');
    for (const f of stale.slice(0, 50)) {
      console.log(`  ✗ ${path.basename(f.file || '?').padEnd(36)} ${f.field}`);
    }
    if (stale.length > 50) console.log(`  ... and ${stale.length - 50} more`);
    console.log('');
  }

  const unbound = findings.filter((f) => f.kind === 'UNBOUND_INPUT');
  if (unbound.length > 0) {
    console.log('── UNBOUND INPUTS (id matches a live field but no data-rls-field) ─');
    for (const f of unbound.slice(0, 30)) {
      console.log(`  ◐ ${path.basename(f.file || '?').padEnd(36)} ${f.detail}`);
    }
    if (unbound.length > 30) console.log(`  ... and ${unbound.length - 30} more`);
    console.log('');
  }

  console.log('── COVERAGE SUMMARY ───────────────────────────────────────────');
  console.log(`  ${stale.length} orphan binding(s)`);
  console.log(`  ${unbound.length} unbound input(s) that match live field names`);
  console.log(`  ${findings.filter((f) => f.kind === 'UNCOVERED_FIELD').length} live field(s) not bound by any form (intentional or gap — review)`);
  console.log('');

  process.exit(stale.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
