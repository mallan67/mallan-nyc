#!/usr/bin/env tsx
// PII / Hidden-Field leakage audit.
//
// REBNY HID-tier fields (must NEVER reach public/portal/non-cooperating-agent
// surfaces — penalty: 0+, license risk):
//   PrivateRemarks, ShowingInstructions, ShowingContact*, ShowingRequirements,
//   LockBox*, ListAgentDirectPhone, ListAgentEmail, ListAgentURL,
//   CoListAgentDirectPhone, CoListAgentEmail, CoListAgentURL,
//   ListOfficePhone, ListOfficeURL, ListOfficeEmail.
//
// Scan strategy:
//   1. Find every public-facing GET route under app/api/ that returns
//      listing data (heuristic: NextResponse.json containing listing fields).
//   2. For each, verify EITHER:
//        a) It goes through the canonical public projection / sanitizeForVOW() / displayAdapter, OR
//        b) It is explicitly authenticated as agent/broker (requireAgentOrBroker).
//   3. Scan public components for direct render of HID fields.
//
// Read-only. No code mutations.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_API = path.join(ROOT, 'app', 'api');
const APP_DIR = path.join(ROOT, 'app');

// HID field name patterns (camelCase + PascalCase). Word-boundary matched.
const HID_FIELDS = [
  'PrivateRemarks', 'privateRemarks',
  'ShowingInstructions', 'showingInstructions',
  'ShowingContactName', 'showingContactName',
  'ShowingContactPhone', 'showingContactPhone',
  'ShowingContactPhoneExt', 'showingContactPhoneExt',
  'ShowingContactType', 'showingContactType',
  'ShowingRequirements', 'showingRequirements',
  'LockBoxType', 'lockBoxType',
  'LockBoxLocation', 'lockBoxLocation',
  'LockBoxSerialNumber', 'lockBoxSerialNumber',
  'ListAgentDirectPhone', 'listAgentDirectPhone',
  'ListAgentEmail', 'listAgentEmail',
  'ListAgentURL', 'listAgentURL',
  'CoListAgentDirectPhone', 'coListAgentDirectPhone',
  'CoListAgentEmail', 'coListAgentEmail',
  'CoListAgentURL', 'coListAgentURL',
  'ListOfficePhone', 'listOfficePhone',
  'ListOfficeURL', 'listOfficeURL',
  'ListOfficeEmail', 'listOfficeEmail',
];

// Markers indicating the file is gated (not public).
const AUTH_GATES = [
  /requireAgentOrBroker/,
  /requireBroker/,
  /requirePortalAuth/,
  /requireSession/,
  /authenticateRequest/,
  /verifyClientPortal/,
];

// Markers indicating PII has been sanitized.
const SANITIZE_MARKERS = [
  /cotalityRecordToPublicDTO|cotalityRecordsToPublicDTOs|dbListingToPublicDTO/,
  /sanitizeForVOW/,
  /toPortalDTO/,
  /maskAgentPII/,
  /stripPrivateFields/,
];

interface Finding {
  file: string;
  kind: 'PUBLIC_HID_LEAK' | 'COMPONENT_HID_RENDER' | 'UNGATED_NO_SANITIZE';
  detail: string;
  hits?: string[];
}

function listTsFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...listTsFiles(full, exts));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function listAllAPIRoutes(): string[] {
  return listTsFiles(APP_API, ['.ts']).filter((f) => /[\\/]route\.tsx?$/.test(f));
}

function listPublicComponents(): string[] {
  return listTsFiles(APP_DIR, ['.tsx', '.ts']).filter((f) => {
    // Exclude private surfaces
    if (/[\\/]api[\\/]/.test(f)) return false;
    if (/[\\/]admin[\\/]/.test(f)) return false;
    if (/[\\/]crm[\\/]/.test(f)) return false;
    if (/[\\/]portal[\\/]/.test(f)) return false;
    return true;
  });
}

function scanFile(file: string): { hits: { line: number; field: string; text: string }[]; gated: boolean; sanitized: boolean } {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  const hits: { line: number; field: string; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip pure comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const f of HID_FIELDS) {
      const re = new RegExp(`(?<![A-Za-z_])${f}(?![A-Za-z_])`, 'g');
      if (re.test(line)) hits.push({ line: i + 1, field: f, text: trimmed });
    }
  }

  const gated = AUTH_GATES.some((re) => re.test(content));
  const sanitized = SANITIZE_MARKERS.some((re) => re.test(content));

  return { hits, gated, sanitized };
}

const findings: Finding[] = [];
const summary = {
  apiRoutesScanned: 0,
  apiRoutesPublicWithHidLeaks: 0,
  apiRoutesGatedOk: 0,
  apiRoutesSanitizedOk: 0,
  componentsScanned: 0,
  componentsLeaking: 0,
};

// Scan API routes
const apiRoutes = listAllAPIRoutes();
summary.apiRoutesScanned = apiRoutes.length;
for (const route of apiRoutes) {
  const rel = path.relative(ROOT, route);
  const { hits, gated, sanitized } = scanFile(route);
  if (hits.length === 0) continue;

  if (gated) {
    summary.apiRoutesGatedOk++;
    continue;
  }
  if (sanitized) {
    summary.apiRoutesSanitizedOk++;
    continue;
  }
  // Has HID hits, no gate, no sanitizer → leak
  summary.apiRoutesPublicWithHidLeaks++;
  findings.push({
    file: rel,
    kind: 'UNGATED_NO_SANITIZE',
    detail: `API route returns HID fields without auth gate or sanitizer (${hits.length} hits)`,
    hits: hits.slice(0, 5).map((h) => `${h.line}: ${h.field}`),
  });
}

// Scan public components for direct renders of HID fields
const components = listPublicComponents();
summary.componentsScanned = components.length;
for (const comp of components) {
  const rel = path.relative(ROOT, comp);
  const { hits } = scanFile(comp);
  if (hits.length === 0) continue;

  // Allowed if filename clearly indicates agent/broker view
  if (/[Aa]gent[Vv]iew|[Bb]roker[Vv]iew|[Cc]rm/.test(rel)) continue;

  // Allow JSX comments, type definitions, prop typing — only catch direct render
  // i.e. the line uses `{ ... HID_FIELD }` or sets value={...HID_FIELD}
  const renderHits = hits.filter((h) => /\{.*\}/.test(h.text) || /value\s*=/.test(h.text));
  if (renderHits.length === 0) continue;

  summary.componentsLeaking++;
  findings.push({
    file: rel,
    kind: 'COMPONENT_HID_RENDER',
    detail: `Public component renders HID-tier field (${renderHits.length} hits)`,
    hits: renderHits.slice(0, 5).map((h) => `${h.line}: ${h.field}`),
  });
}

console.log('═══ PII MASKING AUDIT ═══');
console.log(`API routes scanned:              ${summary.apiRoutesScanned}`);
console.log(`  Gated by auth (OK):            ${summary.apiRoutesGatedOk}`);
console.log(`  Sanitized via DTO (OK):        ${summary.apiRoutesSanitizedOk}`);
console.log(`  PUBLIC + HID LEAK (✗):         ${summary.apiRoutesPublicWithHidLeaks}`);
console.log(`Components scanned:              ${summary.componentsScanned}`);
console.log(`  Public render of HID (✗):      ${summary.componentsLeaking}`);
console.log('');
if (findings.length === 0) {
  console.log('✓ No PII leaks detected.');
} else {
  console.log(`✗ ${findings.length} findings:`);
  for (const f of findings) {
    console.log('');
    console.log(`  [${f.kind}] ${f.file}`);
    console.log(`     ${f.detail}`);
    if (f.hits) for (const h of f.hits) console.log(`       ${h}`);
  }
}
process.exit(findings.length > 0 ? 1 : 0);
