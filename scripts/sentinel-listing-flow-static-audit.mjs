#!/usr/bin/env node
// Sentinel-L.2 — deterministic listing-flow static audit.
//
// Reads $CHANGED_FILES and classifies each change by which broker/agent/
// client workflow it touches. Emits a JSON report consumed by the
// Sentinel-L workflow as a prompt input.
//
// Workflow taxonomy (per Maya's Sentinel-L spec):
//   - new_sale_listing
//   - new_rental_listing
//   - save_draft
//   - draft_appears_in_my_listings
//   - edit_reloads_draft
//   - media_upload
//   - floor_plan_upload
//   - address_building_lookup
//   - agent_auto_populate
//   - status_blockers
//   - web_only_vs_internal_only
//   - public_url_realplus_handoff
//
// Per touched workflow we record: files, lines_changed_total, user roles
// affected (broker/agent/client/public), compliance surfaces (REBNY/RLS/
// RESO/IDX/fair housing/advertising/privacy), risk (P0/P1/P2/P3),
// proof_level (live/deterministic test/static code/limited), missing_proof.
//
// This script does NOT classify findings PASS/FAIL — it surfaces
// path-and-content signals. Claude consumes them; the writer enforces the
// "no GREEN without proof" rule.
//
// Pure Node fs/path. No child_process, no eval, no shell.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── Path-to-workflow mapping ─────────────────────────────────────────────
// Each rule: { workflow, role(s), compliance_surfaces, base_risk, matcher(path,content) }
const RULES = [
  // ── Forms ────────────────────────────────────────────────────────────
  {
    workflow: 'new_sale_listing',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'RESO'],
    base_risk: 'P1',
    matcher: (p) => /^public\/crm\/SALE-FORM-REDESIGN\.html$/.test(p),
  },
  {
    workflow: 'new_rental_listing',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'FARE Act'],
    base_risk: 'P1',
    matcher: (p) => /^public\/crm\/RENTAL-FORM-REDESIGN\.html$/.test(p),
  },
  {
    workflow: 'save_draft',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'privacy'],
    base_risk: 'P1',
    matcher: (p, c) => {
      if (/^public\/crm\/(SALE|RENTAL)-FORM-REDESIGN\.html$/.test(p)) return true;
      if (/^app\/api\/crm\/listings\/route\.ts$/.test(p)) return true;
      return /^public\/crm\/js\/dashboard\/.*\.js$/.test(p) && /\b(saveDraft|draftId|localStorage.*draft)\b/i.test(c || '');
    },
  },
  {
    workflow: 'draft_appears_in_my_listings',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['privacy'],
    base_risk: 'P2',
    matcher: (p, c) => /^public\/crm\/js\/dashboard\/(panels(\.js|\/.*\.js)|app\.js|router\.js)$/.test(p)
      && /\b(myListings|listings.*draft|draft.*listings)\b/i.test(c || ''),
  },
  {
    workflow: 'edit_reloads_draft',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'RESO'],
    base_risk: 'P1',
    matcher: (p) => /^app\/api\/crm\/listings\/\[id\]\/route\.ts$/.test(p)
      || /^public\/crm\/js\/dashboard\/.*\.js$/.test(p),
  },
  // ── Media ────────────────────────────────────────────────────────────
  {
    workflow: 'media_upload',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'privacy'],
    base_risk: 'P0',
    matcher: (p) => /^app\/api\/crm\/listings\/\[id\]\/(media\/upload|photos)\/route\.ts$/.test(p)
      || /^app\/api\/crm\/listings\/\[id\]\/media-order\/route\.ts$/.test(p)
      || /^app\/api\/cron\/media-(sync|backfill)\/route\.ts$/.test(p)
      || /^lib\/media\/.*\.ts$/.test(p)
      || /^lib\/idx\/media-sync\.ts$/.test(p),
  },
  {
    workflow: 'floor_plan_upload',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS'],
    base_risk: 'P1',
    matcher: (p, c) => /^app\/api\/crm\/listings\/\[id\]\/(media\/upload|photos)\/route\.ts$/.test(p)
      || (/^public\/crm\/(SALE|RENTAL)-FORM-REDESIGN\.html$/.test(p) && /floor.plan/i.test(c || '')),
  },
  // ── Address / Building ──────────────────────────────────────────────
  {
    workflow: 'address_building_lookup',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'RESO', 'IDX'],
    base_risk: 'P0',
    matcher: (p) => /^app\/api\/buildings\/.*route\.ts$/.test(p)
      || /^public\/crm\/(SALE|RENTAL)-FORM-REDESIGN\.html$/.test(p)
      || /^public\/crm\/js\/dashboard\/.*\.js$/.test(p),
  },
  // ── Agent auto-populate ─────────────────────────────────────────────
  {
    workflow: 'agent_auto_populate',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['privacy'],
    base_risk: 'P2',
    matcher: (p, c) => /^public\/crm\/js\/dashboard\/.*\.js$/.test(p)
      && /\b(agentInfo|listAgent|ListAgentMlsId|currentAgent)\b/i.test(c || ''),
  },
  // ── Status / visibility / distribution ──────────────────────────────
  {
    workflow: 'status_blockers',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'UCBA'],
    base_risk: 'P0',
    matcher: (p, c) => /^lib\/idx\/(trestle-mapper|mapping)\.ts$/.test(p)
      || (/^app\/api\/crm\/listings\/\[id\]\/(route|status)\.ts$/.test(p))
      || /\b(StandardStatus|MlsStatus|TERMINAL_STATUSES|normalizeStandardStatus)\b/.test(c || ''),
  },
  {
    workflow: 'web_only_vs_internal_only',
    user_roles: ['broker', 'agent'],
    compliance_surfaces: ['REBNY', 'RLS', 'IDX', 'UCBA'],
    base_risk: 'P0',
    matcher: (p, c) => /^lib\/compliance\/(gates|idx-display-gate|public-listing-filter)\.ts$/.test(p)
      || /^lib\/search\/public-listing-(db|trestle)\.ts$/.test(p)
      || /^lib\/idx\/public-dto\.ts$/.test(p)
      || /\b(InternetEntireListingDisplayYN|InternetAddressDisplayYN|InHouseInternal|InHouseWeb|web_only|internal_only)\b/.test(c || ''),
  },
  {
    workflow: 'public_url_realplus_handoff',
    user_roles: ['broker', 'agent', 'public'],
    compliance_surfaces: ['REBNY', 'IDX', 'advertising'],
    base_risk: 'P1',
    matcher: (p, c) => /^app\/listing\/.*\.tsx?$/.test(p)
      || /^app\/components\/(Listing|Featured|IDX).*\.tsx?$/.test(p)
      || /\b(realplus|RealPlus|public.*url|listing.*url)\b/i.test(c || ''),
  },
];

// ── Read changed files ──────────────────────────────────────────────────
async function readChangedFiles() {
  const fromEnv = process.env.CHANGED_FILES || '';
  let raw = fromEnv;
  if (!raw && process.argv.length > 2 && process.argv[2] === '--from-stdin') {
    raw = await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.on('data', (c) => { buf += c.toString(); });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Optional lines-changed count via `git diff --numstat` if available ──
async function readLinesChangedNumstat() {
  // The workflow passes a numstat-formatted blob via $CHANGED_FILES_NUMSTAT
  // if it captured it; otherwise we skip per-file counts and fall back to
  // counting touched files per workflow.
  const raw = process.env.CHANGED_FILES_NUMSTAT || '';
  if (!raw) return new Map();
  const m = new Map();
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const added = parseInt(parts[0], 10);
    const deleted = parseInt(parts[1], 10);
    const file = parts.slice(2).join(' ');
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) continue;
    m.set(file, { added, deleted, total: added + deleted });
  }
  return m;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const changedFiles = await readChangedFiles();
  const linesByFile = await readLinesChangedNumstat();
  const repoRoot = process.cwd();
  const scannedFiles = [];

  // Read file contents (best-effort) for matchers that inspect content.
  const fileContents = new Map();
  for (const relPath of changedFiles) {
    const absPath = path.resolve(repoRoot, relPath);
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) continue;
      // Cap reads at 1 MB to keep the script bounded on large files.
      const content = await fs.readFile(absPath, 'utf8');
      fileContents.set(relPath, content.slice(0, 1024 * 1024));
      scannedFiles.push(relPath);
    } catch {
      // missing/deleted — leave content unset
    }
  }

  // For each rule, find matching files
  const workflows = [];
  for (const rule of RULES) {
    const matchedFiles = [];
    let linesChangedTotal = 0;
    for (const relPath of changedFiles) {
      const content = fileContents.get(relPath);
      if (!rule.matcher(relPath, content)) continue;
      matchedFiles.push(relPath);
      const stats = linesByFile.get(relPath);
      if (stats) linesChangedTotal += stats.total;
    }
    if (matchedFiles.length === 0) continue;

    // Proof level: any touched test file → "deterministic test"; otherwise
    // "static code" (we can't probe live without the preview deploy).
    const hasTest = matchedFiles.some(
      (p) => /(^|\/)__tests__\//.test(p) || /\.test\.(ts|js|tsx|jsx)$/.test(p),
    );

    workflows.push({
      workflow: rule.workflow,
      files: matchedFiles,
      lines_changed_total: linesChangedTotal,
      user_roles: rule.user_roles,
      compliance_surfaces: rule.compliance_surfaces,
      risk: rule.base_risk,
      proof_level: hasTest ? 'deterministic test' : 'static code',
      missing_proof:
        hasTest
          ? 'Live broker flow on preview deployment not exercised — static + test evidence only.'
          : 'Live broker flow on preview deployment not exercised — static code analysis only.',
    });
  }

  const riskRank = (r) => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[r] ?? 99);
  const highestRisk =
    workflows.length === 0
      ? 'none'
      : workflows.reduce((acc, w) => (riskRank(w.risk) < riskRank(acc) ? w.risk : acc), 'P3');

  const output = {
    schema_version: 'sentinel-l.2-listing-flow-static-v1',
    generated_at: new Date().toISOString(),
    scanned_files: scannedFiles,
    scanned_files_count: scannedFiles.length,
    workflows,
    summary: {
      workflows_touched: workflows.length,
      workflows_with_p0: workflows.filter((w) => w.risk === 'P0').length,
      workflows_with_p1: workflows.filter((w) => w.risk === 'P1').length,
      highest_risk: highestRisk,
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`sentinel-listing-flow-static-audit: ERROR ${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
