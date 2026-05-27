#!/usr/bin/env node
// Sentinel-L.2 — deterministic field-contract audit.
//
// Reads a newline-separated list of changed files from $CHANGED_FILES (or
// argv after `--`) and emits a JSON report classifying which of the 27
// listing-contract RESO fields appear in each file. The output is consumed
// by the Sentinel-L workflow which:
//   1. Saves the JSON to memory/audits/listing-readiness/inputs/PR-N-sha-field-contract.json
//   2. Embeds a short summary into the Claude prompt
//
// This script is pure deterministic static analysis. It does NOT make
// PASS/FAIL judgments — it surfaces signals. Claude's audit uses these
// signals to assign a verdict; the writer enforces the "no GREEN without
// proof" rule downstream.
//
// Pure Node fs/path. No child_process. No eval. No shell.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── The 27 fields under Sentinel-L contract scrutiny ─────────────────────
// Per Maya's spec — address atoms, list-agent/office MlsIds, agreement,
// status, display gates, syndication, property typing, structure, media.
const CONTRACT_FIELDS = [
  // Address atoms
  'StreetNumber', 'StreetDirPrefix', 'StreetName', 'StreetSuffix',
  'UnitNumber', 'UnparsedAddress', 'PostalCity', 'CityRegion',
  'CountyOrParish', 'StateOrProvince', 'PostalCode',
  // Agent + Office
  'ListAgentMlsId', 'ListOfficeMlsId',
  'ListingAgreement', 'ListingContractDate',
  // Status
  'StandardStatus', 'MlsStatus',
  // Display gates
  'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN',
  // Syndication
  'SyndicateYN', 'SyndicationRemarks',
  // Property typing
  'PropertyType', 'PropertySubType', 'CommonInterest', 'OwnershipType',
  'StructureType',
  // Media
  'MediaCategory', 'MediaURL', 'Order',
];

// ── Category heuristics by path ──────────────────────────────────────────
const CATEGORY_PATTERNS = [
  { re: /public\/crm\/(SALE|RENTAL)-FORM-REDESIGN\.html$/, category: 'form_html' },
  { re: /public\/crm\/js\/dashboard\/.*\.js$/, category: 'dashboard_js' },
  { re: /^app\/api\/crm\/listings\/.*route\.ts$/, category: 'api_route' },
  { re: /^app\/api\/buildings\/.*route\.ts$/, category: 'api_route' },
  { re: /^app\/api\/.*route\.ts$/, category: 'api_route' },
  { re: /^lib\/idx\/trestle-mapper\.ts$/, category: 'idx_mapping' },
  { re: /^lib\/idx\/mapping\.ts$/, category: 'idx_mapping' },
  { re: /^lib\/idx\/public-dto\.ts$/, category: 'dto_sanitizer' },
  { re: /^lib\/compliance\/dto\.ts$/, category: 'dto_sanitizer' },
  { re: /^lib\/compliance\/gates\.ts$/, category: 'display_gate' },
  { re: /^lib\/compliance\/idx-display-gate\.ts$/, category: 'display_gate' },
  { re: /^lib\/compliance\/public-listing-filter\.ts$/, category: 'display_gate' },
  { re: /^lib\/search\/public-listing-.*\.ts$/, category: 'public_reader' },
  { re: /^lib\/search\/listing-search-projection\.ts$/, category: 'public_reader' },
  { re: /^app\/listing\/.*\.tsx?$/, category: 'listing_page' },
  { re: /^app\/components\/.*\.tsx?$/, category: 'display_component' },
  { re: /^prisma\/schema\.prisma$/, category: 'db_schema' },
  { re: /^tests\/.*\.test\.(ts|js|tsx|jsx)$/, category: 'test' },
  { re: /^lib\/.*__tests__.*\.test\.(ts|js|tsx|jsx)$/, category: 'test' },
  { re: /^scripts\//, category: 'script' },
];

function categorize(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const { re, category } of CATEGORY_PATTERNS) {
    if (re.test(normalized)) return category;
  }
  return 'other';
}

// ── Per-field detection inside one file ──────────────────────────────────
// Three reference types we recognize:
//   - html_attr: `data-rls-field="FieldName"`  or  `name="FieldName"`
//   - string_literal: `"FieldName"`  or  `'FieldName'`
//   - identifier: `\bFieldName\b` (word-boundary match — catches property
//                  access and bare identifiers in TS/JS)
function detectField(content, field, category) {
  const occurrences = [];
  const lines = content.split('\n');
  const htmlAttrRe = new RegExp(`(data-rls-field|name|data-field)=["']${field}["']`);
  const stringLitRe = new RegExp(`["']${field}["']`);
  const identRe = new RegExp(`\\b${field}\\b`);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (category === 'form_html') {
      if (htmlAttrRe.test(line)) {
        occurrences.push({ line: i + 1, type: 'html_attr' });
        continue;
      }
    }
    if (stringLitRe.test(line)) {
      occurrences.push({ line: i + 1, type: 'string_literal' });
      continue;
    }
    if (identRe.test(line)) {
      occurrences.push({ line: i + 1, type: 'identifier' });
    }
  }
  return occurrences;
}

// ── Coverage flags ───────────────────────────────────────────────────────
const COVERAGE_BY_CATEGORY = {
  form_html: 'source_form',
  dashboard_js: 'form_api',
  api_route: 'api_db',
  idx_mapping: 'api_db',
  dto_sanitizer: 'display_public',
  display_gate: 'display_public',
  public_reader: 'display_public',
  listing_page: 'display_public',
  display_component: 'display_public',
  db_schema: 'api_db',
};

function emptyCoverage() {
  return {
    source_form: false,
    form_api: false,
    api_db: false,
    db_reload: false,
    display_public: false,
  };
}

function deriveProofLevel(occurrences, hasTestRef, coverage) {
  if (occurrences.length === 0) return 'untouched';
  if (hasTestRef) return 'deterministic test';
  const coverageHits = Object.values(coverage).filter(Boolean).length;
  if (coverageHits === 0) return 'limited';
  if (coverageHits >= 3) return 'static';
  return 'limited';
}

// ── Inputs ───────────────────────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const changedFiles = await readChangedFiles();
  const repoRoot = process.cwd();

  // Initialize per-field state
  const fields = {};
  for (const f of CONTRACT_FIELDS) {
    fields[f] = {
      touched: false,
      occurrences: [],
      coverage: emptyCoverage(),
      categories: new Set(),
      has_test_ref: false,
    };
  }

  const scannedFiles = [];
  for (const relPath of changedFiles) {
    const absPath = path.resolve(repoRoot, relPath);
    let content;
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) continue;
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      // File doesn't exist (deleted, renamed) — skip silently.
      continue;
    }
    scannedFiles.push(relPath);
    const category = categorize(relPath);

    for (const f of CONTRACT_FIELDS) {
      const hits = detectField(content, f, category);
      if (hits.length === 0) continue;
      fields[f].touched = true;
      fields[f].categories.add(category);
      for (const h of hits.slice(0, 5)) {
        fields[f].occurrences.push({ file: relPath, category, line: h.line, type: h.type });
      }
      const coverageKey = COVERAGE_BY_CATEGORY[category];
      if (coverageKey) fields[f].coverage[coverageKey] = true;
      if (category === 'test') fields[f].has_test_ref = true;
      // Heuristic for db_reload: api_route + dashboard_js together means
      // there's both a GET endpoint and a form-side reload caller.
      if (
        fields[f].coverage.api_db &&
        (fields[f].categories.has('dashboard_js') || fields[f].categories.has('form_html'))
      ) {
        fields[f].coverage.db_reload = true;
      }
    }
  }

  // Finalize
  const fieldsOut = {};
  let touchedCount = 0;
  let fullCoverageCount = 0;
  let partialCoverageCount = 0;
  let noCoverageCount = 0;
  for (const [name, state] of Object.entries(fields)) {
    if (!state.touched) continue;
    touchedCount += 1;
    const proofLevel = deriveProofLevel(state.occurrences, state.has_test_ref, state.coverage);
    const coverageHits = Object.values(state.coverage).filter(Boolean).length;
    if (coverageHits >= 4) fullCoverageCount += 1;
    else if (coverageHits >= 1) partialCoverageCount += 1;
    else noCoverageCount += 1;

    const concerns = [];
    if (!state.coverage.source_form) concerns.push('not in any form HTML');
    if (!state.coverage.form_api) concerns.push('no form-to-API serialization path observed');
    if (!state.coverage.api_db) concerns.push('no API/DB persistence path observed');
    if (!state.coverage.display_public) concerns.push('no public display path observed');

    fieldsOut[name] = {
      touched: true,
      occurrences: state.occurrences,
      categories: Array.from(state.categories).sort(),
      coverage: state.coverage,
      proof_level: proofLevel,
      concerns,
    };
  }

  const output = {
    schema_version: 'sentinel-l.2-field-contract-v1',
    generated_at: new Date().toISOString(),
    scanned_files: scannedFiles,
    scanned_files_count: scannedFiles.length,
    fields: fieldsOut,
    summary: {
      touched_count: touchedCount,
      fields_with_full_coverage: fullCoverageCount,
      fields_with_partial_coverage: partialCoverageCount,
      fields_with_no_coverage: noCoverageCount,
      contract_fields_total: CONTRACT_FIELDS.length,
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`sentinel-field-contract-audit: ERROR ${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
