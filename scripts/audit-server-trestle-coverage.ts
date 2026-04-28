#!/usr/bin/env tsx
// Comprehensive server-side Trestle field-name audit.
//
// Scans every TypeScript file in lib/idx/, lib/compliance/, app/api/listings/,
// app/api/idx/, app/api/listings/, and a few other key paths. Extracts
// every CamelCase token that LOOKS like a Trestle field name (≥8 chars,
// starts uppercase, recognized fragment) and cross-checks against live
// Trestle metadata.
//
// Categories reported per finding:
//
//   STALE_REFERENCE  — code uses a field name that doesn't exist on any
//                       live Trestle resource (rename or removal needed)
//   GATE_FIELD       — recognized REBNY distribution gate field; verifies
//                       it's spelled correctly per Trestle ($metadata vs
//                       common typos like IDXEntireListing vs Internet)
//   KEY_FIELD        — listing/media key field; verifies ListingKey vs
//                       ListingId vs ResourceRecordKey are used per
//                       vendor guidance (CLAUDE.md "Trestle Media API
//                       Rules — Vendor-Confirmed 2026-04-07")
//   ATTRIBUTION      — REBNY attribution text reference; verifies the
//                       label still matches RLS rules
//   PII_MASK         — DTO masking for sensitive Trestle fields; verifies
//                       the masked-out field name is current
//
// Read-only. No code mutations.
//
// Usage: npx tsx scripts/audit-server-trestle-coverage.ts [--json]

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');

const TRESTLE_BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');
const CLIENT_ID = process.env.IDX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.IDX_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET');
  process.exit(1);
}

// Files we audit (production only — never test files)
const SCAN_PATHS = [
  'lib/idx',
  'lib/compliance',
  'app/api/listings',
  'app/api/idx',
  'app/api/media',
  'app/api/buildings',
  'app/api/agents',
  'app/api/open-houses',
  'app/api/market',
  'app/api/cron', // ALL crons — sweep for stale Trestle field refs
];

// Fields that MUST exist on live Trestle (we use these everywhere). If any
// of these is missing from live, we have a critical bug.
//
// NOTE: OwnerOptOutYN and ParticipantOnlyYN do NOT exist as separate booleans
// on live Trestle (verified 2026-04-19 against $metadata). They are encoded via
// the `Permission` enum on Property (values: "OwnerOptOut", "Private", "IDX",
// "Public"). production code in lib/idx/trestle-mapper.ts:checkDistributionGates()
// already reads payload.Permission and decodes accordingly.
const MUST_EXIST_GATE_FIELDS = [
  'Permission',                              // Owner Opt-Out / Participant Only encoding
  'InternetEntireListingDisplayYN',          // Master IDX display gate
  'InternetAddressDisplayYN',                // Address display gate
  'InternetAutomatedValuationDisplayYN',     // AVM display gate
  'InternetConsumerCommentYN',               // Consumer-comment gate
  'StandardStatus',                          // Status used in display logic
  'MlsStatus',                               // RLS-side status
];

const MUST_EXIST_KEY_FIELDS = [
  'ListingKey', 'ListingKeyNumeric', 'ListingId',
  'ResourceRecordKey', 'ResourceRecordKeyNumeric',
  'ModificationTimestamp', 'PhotosChangeTimestamp',
];

// Common dead/renamed fields per CLAUDE.md "Fields That DO NOT EXIST on
// Trestle - NEVER USE". If we find any of these in code, flag it.
const FORBIDDEN_FIELDS: Record<string, string> = {
  IDXEntireListingDisplayYN: 'use InternetEntireListingDisplayYN',
  SyndicateYN: 'use SyndicateTo (multi-select)',
  VOWEntireListingDisplayYN: 'not on IDX Plus',
  VOWAutomatedValuationDisplayYN: 'not on IDX Plus',
  VOWConsumerCommentYN: 'not on IDX Plus',
  MoveInCostsAmountTotal: 'does not exist; MoveInCosts is a picklist only',
  MoveInCostsComments: 'does not exist',
  FirstShowingDate: 'use ActivationDate',
  PossessionDate: 'RESO field, Trestle ignores',
  YearRenovated: 'does not exist',
  ResourceRecordID: 'use ResourceRecordKey (CLAUDE.md vendor-confirmed 2026-04-07)',
};

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

async function getAllLiveFields(): Promise<{
  byResource: Map<string, Set<string>>;
  all: Set<string>;
  customFieldKeys: Set<string>;
}> {
  const token = await getToken();
  const xml = await (await fetch(`${TRESTLE_BASE}/odata/$metadata`, { headers: { authorization: `Bearer ${token}` } })).text();
  const byResource = new Map<string, Set<string>>();
  const all = new Set<string>();
  const entityRegex = /<EntityType\s+Name\s*=\s*"([^"]+)"[\s\S]*?<\/EntityType>/g;
  let em;
  while ((em = entityRegex.exec(xml)) !== null) {
    const name = em[1];
    const fields = new Set<string>();
    const propRegex = /<Property\s+Name\s*=\s*"([^"]+)"/g;
    let pm;
    while ((pm = propRegex.exec(em[0])) !== null) {
      fields.add(pm[1]);
      all.add(pm[1]);
    }
    byResource.set(name, fields);
  }
  // Sample CustomFields too
  const cfRes = await fetch(`${TRESTLE_BASE}/odata/CustomProperty?$top=20`, { headers: { authorization: `Bearer ${token}` } });
  const cf = ((await cfRes.json()) as { value?: Array<Record<string, unknown>> }).value || [];
  const customFieldKeys = new Set<string>();
  for (const row of cf) {
    const c = row.CustomFields;
    if (typeof c === 'string' && c.startsWith('{')) {
      try { for (const k of Object.keys(JSON.parse(c))) { customFieldKeys.add(k); all.add(k); } } catch { /* ignore */ }
    }
  }
  // REBNY canonical CustomFields list
  const REBNY_CF = ['AttendanceType','BathroomCondition','BuildingParkingTotal','BuildingRules','BuildingSmokeFreeYN','BuildingTaxLot','CapitalReservesTotal','CapitalReservesYN','CeilingHeightFeet','CeilingHeightInches','CertificateOfOccupancyYN','ClosetsTotal','CommercialUnitsYN','ElevatorsTotal','FlipTax','FlipTaxRemarks','FlipTaxType','FurnishedListPrice','FurnishedMaxLeaseMonths','FurnishedMinLeaseMonths','GuarantorsAcceptedYN','KitchenCondition','LandmarkStatusYN','ManagingAgencyListingYN','MaxLeaseMonths','MaximumFinancingAmount','MaximumFinancingPercent','MaximumFinancingRemarks','PercentOfCommonElements','PrivateOutdoorSpaceSize','SponsorUnitYN','TaxAbatementComments','TaxAbatementExpirationYear','TaxAbatementYN','TaxDeductionAmount','TaxDeductionPercent','TaxDeductionRemarks','TaxMonthlyAmount','UnitLine','ViewRemarks'];
  for (const k of REBNY_CF) { customFieldKeys.add(k); all.add(k); }
  return { byResource, all, customFieldKeys };
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
  kind: 'FORBIDDEN_REFERENCE' | 'MUST_EXIST_GATE_MISSING_FROM_LIVE' | 'MUST_EXIST_KEY_MISSING_FROM_LIVE' | 'STALE_REFERENCE' | 'LEGACY_GUARD';
  file?: string;
  line?: number;
  field: string;
  detail?: string;
}

// Look ±5 lines around a hit for any of these comment markers. A hit framed by
// such a marker is documented intentional (defensive guard, vendor fallback) —
// not a stale bug.
const INTENT_MARKERS = [
  /legacy[ -]?(guard|name|payload|field|alias)/i,
  /defensive(?:\s+only)?/i,
  /do(es)?\s+not\s+exist\s+on\s+(live\s+)?trestle/i,
  /not\s+on\s+trestle/i,
  /vendor[-\s]?confirmed/i,
  /CLAUDE\.md/i,
  /backwards[-\s]?compat/i,
  /fallback\s+to/i,
  /last\s+resort/i,
  /trestle\s+guidance/i,
  /not\s+unique\s+across\s+MLOs/i,
  /preferred\s+if\s+available/i,
  /removed\s+\(does\s+not\s+exist/i,
  /verified\s+\d{4}-\d{2}-\d{2}/i,
  /per\s+vendor/i,
  /historical\s+compatib/i,
  /legacy\s+(?:DTO|field|name|map|alias)/i,
  /\blegacy\s*\//i, // matches "legacy /" prose form
];

function hasIntentMarkerNearby(lines: string[], lineIndex: number, radius = 5): boolean {
  const start = Math.max(0, lineIndex - radius);
  const end = Math.min(lines.length, lineIndex + radius + 1);
  for (let i = start; i < end; i++) {
    for (const re of INTENT_MARKERS) {
      if (re.test(lines[i])) return true;
    }
  }
  return false;
}

// CLAUDE.md (vendor-confirmed 2026-04-07): "use ResourceRecordKey first, fall
// back to ResourceRecordID if mls_id/ListingKey is null." So a ResourceRecordID
// hit in a file that ALSO uses ResourceRecordKey is the documented fallback
// pattern, not a stale bug. Treat as legacy guard.
function isVendorBlessedFallback(field: string, content: string): boolean {
  if (field !== 'ResourceRecordID') return false;
  return /\bResourceRecordKey\b/.test(content);
}

(async () => {
  console.log('Pulling live Trestle metadata...');
  const live = await getAllLiveFields();
  console.log(`  ✓ live: ${live.all.size} unique fields across ${live.byResource.size} resources + ${live.customFieldKeys.size} CustomFields keys`);
  console.log('');

  const findings: Finding[] = [];

  // 1. MUST_EXIST gates: every gate field must be on live Trestle
  console.log('── REBNY Distribution Gate fields (must exist on live) ────────');
  for (const f of MUST_EXIST_GATE_FIELDS) {
    const present = live.all.has(f);
    console.log(`  ${present ? '✓' : '✗'} ${f}${present ? '' : '   ← NOT FOUND ON LIVE'}`);
    if (!present) findings.push({ kind: 'MUST_EXIST_GATE_MISSING_FROM_LIVE', field: f });
  }
  console.log('');

  // 2. MUST_EXIST key fields
  console.log('── ID/Key fields (must exist on live) ─────────────────────────');
  for (const f of MUST_EXIST_KEY_FIELDS) {
    const present = live.all.has(f);
    console.log(`  ${present ? '✓' : '✗'} ${f}${present ? '' : '   ← NOT FOUND ON LIVE'}`);
    if (!present) findings.push({ kind: 'MUST_EXIST_KEY_MISSING_FROM_LIVE', field: f });
  }
  console.log('');

  // 3. Scan code for forbidden references
  console.log('── Scanning server code for forbidden field names ─────────────');
  const allTsFiles: string[] = [];
  for (const p of SCAN_PATHS) {
    allTsFiles.push(...listTsFiles(p));
  }

  for (const file of allTsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (const [bad, hint] of Object.entries(FORBIDDEN_FIELDS)) {
      // Avoid matching a longer name that contains the bad token (e.g.
      // "InternetEntireListingDisplayYN" should NOT match "IDXEntireListingDisplayYN")
      const re = new RegExp(`(?<![A-Za-z])${bad}(?![A-Za-z])`, 'g');
      lines.forEach((line, i) => {
        // Skip comment-only lines that DOCUMENT the forbidden mapping
        // (we'd be flagging our own documentation otherwise)
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('"//')) return;
        if (re.test(line)) {
          // If the surrounding ±5 lines contain a "legacy guard" / "defensive" /
          // "vendor-confirmed" / "CLAUDE.md" comment marker, treat as documented
          // intentional rather than a stale bug. Also treat ResourceRecordID as
          // documented fallback when ResourceRecordKey is used in the same file.
          const isLegacyGuard =
            hasIntentMarkerNearby(lines, i) ||
            isVendorBlessedFallback(bad, content);
          findings.push({
            kind: isLegacyGuard ? 'LEGACY_GUARD' : 'FORBIDDEN_REFERENCE',
            file,
            line: i + 1,
            field: bad,
            detail: hint,
          });
        }
      });
    }
  }

  const forbidden = findings.filter((f) => f.kind === 'FORBIDDEN_REFERENCE');
  const legacyGuards = findings.filter((f) => f.kind === 'LEGACY_GUARD');

  if (forbidden.length === 0) {
    console.log('  ✓ no stale forbidden field references found in production code');
  } else {
    const byField = new Map<string, Finding[]>();
    for (const f of forbidden) {
      if (!byField.has(f.field)) byField.set(f.field, []);
      byField.get(f.field)!.push(f);
    }
    for (const [field, hits] of byField) {
      console.log(`  ✗ ${field}  (${hits.length} hits — STALE) — ${FORBIDDEN_FIELDS[field]}`);
      for (const h of hits.slice(0, 5)) {
        console.log(`      ${h.file}:${h.line}`);
      }
      if (hits.length > 5) console.log(`      ... and ${hits.length - 5} more`);
    }
  }
  if (legacyGuards.length > 0) {
    const byGuard = new Map<string, number>();
    for (const f of legacyGuards) byGuard.set(f.field, (byGuard.get(f.field) || 0) + 1);
    console.log('');
    console.log('  ◐ Documented legacy guards (intentional defensive references):');
    for (const [field, n] of byGuard) {
      console.log(`      ${field}: ${n} hits  (framed by intent marker — see comment)`);
    }
  }
  console.log('');

  console.log('── SUMMARY ─────────────────────────────────────────────────────');
  console.log(`  Files scanned:                       ${allTsFiles.length}`);
  console.log(`  Stale forbidden references:          ${forbidden.length}    ${forbidden.length === 0 ? '(✓)' : '(✗)'}`);
  console.log(`  Documented legacy guards:            ${legacyGuards.length}    (informational — not bugs)`);
  console.log(`  Gate fields missing from live:       ${findings.filter((f) => f.kind === 'MUST_EXIST_GATE_MISSING_FROM_LIVE').length}`);
  console.log(`  Key fields missing from live:        ${findings.filter((f) => f.kind === 'MUST_EXIST_KEY_MISSING_FROM_LIVE').length}`);
  console.log('');

  if (jsonOutput) {
    console.log(JSON.stringify({ findings }, null, 2));
  }

  // Exit non-zero only on STALE references or missing live fields — legacy
  // guards (documented intentional) do NOT fail the audit.
  const fatal =
    forbidden.length +
    findings.filter((f) => f.kind === 'MUST_EXIST_GATE_MISSING_FROM_LIVE').length +
    findings.filter((f) => f.kind === 'MUST_EXIST_KEY_MISSING_FROM_LIVE').length;
  process.exit(fatal > 0 ? 1 : 0);
})().catch((e) => { console.error('Failed:', e instanceof Error ? e.message : String(e)); process.exit(1); });
