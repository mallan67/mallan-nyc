#!/usr/bin/env node
/**
 * REBNY RLS Validator — CLI
 *
 * Usage:
 *   npx tsx lib/rls-validator/src/cli.ts validate listing.json
 *   npx tsx lib/rls-validator/src/cli.ts validate listing.json --rental --strict
 *   npx tsx lib/rls-validator/src/cli.ts validate listing.json --suite MANDATORY_FIELD,CONTENT_FAIR_HOUSING
 *   npx tsx lib/rls-validator/src/cli.ts batch listings/*.json
 *   npx tsx lib/rls-validator/src/cli.ts registry --stats
 *   npx tsx lib/rls-validator/src/cli.ts registry --field MlsStatus
 *   npx tsx lib/rls-validator/src/cli.ts registry --lookup PropertySubType
 *   npx tsx lib/rls-validator/src/cli.ts penalty FAIR_HOUSING 2
 *
 * Exit codes:
 *   0 = all valid (no blockers/errors)
 *   1 = validation issues found
 *   2 = input/usage error
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { validateListing, validateBatch } from './index';
import { loadFieldRegistry, loadLookupRegistry, MANDATORY_FIELDS, RESO_TO_RLS_RENAMES } from './registry';
import { assessPenalty } from './validators';
import type { ValidatorOptions, ValidationCategory, MlsStatus, PenaltyCategory, ValidationResult } from './types';

// ─── Color helpers (ANSI) ─────────────────────────────────────────────

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function colorSeverity(sev: string): string {
  switch (sev) {
    case 'BLOCKER': return `${RED}${BOLD}BLOCKER${RESET}`;
    case 'ERROR': return `${RED}ERROR${RESET}`;
    case 'WARNING': return `${YELLOW}WARNING${RESET}`;
    case 'INFO': return `${DIM}INFO${RESET}`;
    default: return sev;
  }
}

// ─── CLI Parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
${BOLD}REBNY RLS Validator${RESET} — Validate listings against ALL REBNY RLS rules

${BOLD}USAGE:${RESET}
  npx tsx lib/rls-validator/src/cli.ts <command> [options]

${BOLD}COMMANDS:${RESET}
  validate <file.json>     Validate a single listing payload
  batch <files...>         Validate multiple listing files
  registry                 Show RLS field registry info
  penalty <category> <n>   Calculate penalty for nth offense

${BOLD}VALIDATE OPTIONS:${RESET}
  --rental                 Mark listing as rental (PropertyType = ResidentialLease)
  --new-dev                Mark listing as new development
  --strict                 Treat warnings as errors
  --suite <suites>         Comma-separated validation suites to run
  --feed <type>            Feed type: RLS, IDX, VOW, SYNDICATION
  --prev-status <status>   Previous MLS status (for transition validation)
  --output <file.json>     Write JSON report to file
  --json                   Output as JSON instead of formatted text

${BOLD}REGISTRY OPTIONS:${RESET}
  --stats                  Show field statistics
  --field <name>           Show details for a specific field
  --lookup <name>          Show picklist values for a field
  --mandatory              List all mandatory fields
  --renames                Show RESO → RLS field renames

${BOLD}PENALTY OPTIONS:${RESET}
  Categories: FAIR_HOUSING, DATA_QUALITY, INCURABLE, GENERAL_UCBA, QUARTERLY_REJECTION

${BOLD}EXIT CODES:${RESET}
  0 = pass (no blockers/errors)
  1 = fail (blockers or errors found)
  2 = usage error

${BOLD}FIELD AUTHORITY:${RESET}
  1. UCBA governs everything
  2. REBNY RLS rules + fields — ${RED}RLS TRUMPS ALL${RESET}
  3. RLS overrides RESO/IDX
  4. RESO/IDX fills gaps only
  5. INTERNAL-ONLY otherwise
  6. Fail closed = NON-DISPLAY
`);
}

function getFlag(flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

// ─── Commands ─────────────────────────────────────────────────────────

function cmdValidate() {
  const file = args[1];
  if (!file || file.startsWith('--')) {
    console.error(`${RED}Error: validate requires a JSON file path${RESET}`);
    process.exit(2);
  }

  const filePath = resolve(file);
  if (!existsSync(filePath)) {
    console.error(`${RED}Error: File not found: ${filePath}${RESET}`);
    process.exit(2);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`${RED}Error: Invalid JSON in ${filePath}${RESET}`);
    process.exit(2);
    return;
  }

  const opts: ValidatorOptions = {};
  if (getFlag('--rental')) opts.isRental = true;
  if (getFlag('--new-dev')) opts.isNewDevelopment = true;
  if (getFlag('--strict')) opts.strict = true;

  const feed = getFlagValue('--feed');
  if (feed) opts.feedType = feed as ValidatorOptions['feedType'];

  const prevStatus = getFlagValue('--prev-status');
  if (prevStatus) opts.previousStatus = prevStatus as MlsStatus;

  const suites = getFlagValue('--suite');
  if (suites) opts.suites = suites.split(',') as ValidationCategory[];

  const result = validateListing(payload, opts);

  if (getFlag('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(result, basename(filePath));
  }

  // Write JSON output
  const output = getFlagValue('--output');
  if (output) {
    writeFileSync(resolve(output), JSON.stringify(result, null, 2));
    console.log(`\n${DIM}Report written to: ${output}${RESET}`);
  }

  process.exit(result.valid ? 0 : 1);
}

function cmdBatch() {
  const files = args.slice(1).filter(a => !a.startsWith('--'));
  if (files.length === 0) {
    console.error(`${RED}Error: batch requires at least one JSON file${RESET}`);
    process.exit(2);
  }

  const payloads: Record<string, unknown>[] = [];
  for (const file of files) {
    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      console.error(`${YELLOW}Warning: Skipping ${file} (not found)${RESET}`);
      continue;
    }
    try {
      payloads.push(JSON.parse(readFileSync(filePath, 'utf-8')));
    } catch {
      console.error(`${YELLOW}Warning: Skipping ${file} (invalid JSON)${RESET}`);
    }
  }

  const opts: ValidatorOptions = {};
  if (getFlag('--strict')) opts.strict = true;

  const { results, batchSummary } = validateBatch(payloads, opts);

  console.log(`\n${BOLD}═══ BATCH VALIDATION RESULTS ═══${RESET}`);
  console.log(`Files: ${files.length} | Payloads: ${payloads.length}`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const status = r.valid ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  ${status} ${files[i]} — ${r.summary.blockers}B ${r.summary.errors}E ${r.summary.warnings}W ${r.summary.info}I`);
  }

  console.log(`\n${BOLD}Batch Summary:${RESET}`);
  console.log(`  Total issues: ${batchSummary.total}`);
  console.log(`  Blockers: ${RED}${batchSummary.blockers}${RESET}`);
  console.log(`  Errors: ${RED}${batchSummary.errors}${RESET}`);
  console.log(`  Warnings: ${YELLOW}${batchSummary.warnings}${RESET}`);
  console.log(`  Info: ${batchSummary.info}`);

  const output = getFlagValue('--output');
  if (output) {
    writeFileSync(resolve(output), JSON.stringify({ results, batchSummary }, null, 2));
    console.log(`\n${DIM}Report written to: ${output}${RESET}`);
  }

  const passed = results.every(r => r.valid);
  process.exit(passed ? 0 : 1);
}

function cmdRegistry() {
  if (getFlag('--stats')) {
    const fields = loadFieldRegistry();
    const lookups = loadLookupRegistry();

    let mandatory = 0, conditional = 0, optional = 0;
    let editable = 0, searchable = 0;

    for (const f of fields.values()) {
      if (f.requirement === 'mandatory') mandatory++;
      else if (f.requirement === 'conditional') conditional++;
      else optional++;
      if (f.lmpAddEdit) editable++;
      if (f.lmpSearch) searchable++;
    }

    let totalValues = 0;
    for (const l of lookups.values()) {
      totalValues += l.values.length;
    }

    console.log(`\n${BOLD}═══ RLS FIELD REGISTRY STATISTICS ═══${RESET}`);
    console.log(`  Total fields:      ${BOLD}${fields.size}${RESET}`);
    console.log(`  Mandatory:         ${RED}${mandatory}${RESET}`);
    console.log(`  Conditional:       ${YELLOW}${conditional}${RESET}`);
    console.log(`  Optional:          ${optional}`);
    console.log(`  Editable (Add/Edit): ${editable}`);
    console.log(`  Searchable:        ${searchable}`);
    console.log(`  Read-only:         ${fields.size - editable}`);
    console.log(`  Picklist fields:   ${lookups.size}`);
    console.log(`  Total picklist values: ${totalValues}`);
    console.log(`  RESO→RLS renames:  ${RESO_TO_RLS_RENAMES.length}`);
    return;
  }

  const fieldName = getFlagValue('--field');
  if (fieldName) {
    const fields = loadFieldRegistry();
    const field = fields.get(fieldName);
    if (!field) {
      console.error(`${RED}Field not found: ${fieldName}${RESET}`);
      // Search for close matches
      const matches = Array.from(fields.keys()).filter(k => k.toLowerCase().includes(fieldName.toLowerCase()));
      if (matches.length > 0) {
        console.log(`${DIM}Did you mean: ${matches.slice(0, 10).join(', ')}${RESET}`);
      }
      process.exit(2);
      return;
    }
    console.log(`\n${BOLD}Field: ${field.name}${RESET}`);
    console.log(`  Requirement: ${field.requirement}`);
    console.log(`  LMP Add/Edit: ${field.lmpAddEdit}`);
    console.log(`  LMP Search: ${field.lmpSearch}`);
    console.log(`  Description: ${field.description}`);
    if (field.conditionalRule) {
      console.log(`  Condition: ${field.conditionalRule}`);
    }
    return;
  }

  const lookupName = getFlagValue('--lookup');
  if (lookupName) {
    const lookups = loadLookupRegistry();
    const lookup = lookups.get(lookupName);
    if (!lookup) {
      console.error(`${RED}Lookup not found: ${lookupName}${RESET}`);
      const matches = Array.from(lookups.keys()).filter(k => k.toLowerCase().includes(lookupName.toLowerCase()));
      if (matches.length > 0) {
        console.log(`${DIM}Did you mean: ${matches.slice(0, 10).join(', ')}${RESET}`);
      }
      process.exit(2);
      return;
    }
    console.log(`\n${BOLD}Lookup: ${lookup.fieldName}${RESET} (${lookup.values.length} values)`);
    for (const v of lookup.values) {
      console.log(`  - ${v}`);
    }
    return;
  }

  if (getFlag('--mandatory')) {
    console.log(`\n${BOLD}═══ ${MANDATORY_FIELDS.length} MANDATORY RLS FIELDS ═══${RESET}`);
    for (const f of MANDATORY_FIELDS) {
      console.log(`  ${f}`);
    }
    return;
  }

  if (getFlag('--renames')) {
    console.log(`\n${BOLD}═══ ${RESO_TO_RLS_RENAMES.length} RESO → RLS FIELD RENAMES ═══${RESET}`);
    console.log(`${DIM}Always use RLS name. RLS TRUMPS.${RESET}\n`);
    for (const r of RESO_TO_RLS_RENAMES) {
      console.log(`  ${DIM}${r.resoName}${RESET} → ${BOLD}${r.rlsName}${RESET}  ${DIM}(${r.notes})${RESET}`);
    }
    return;
  }

  printUsage();
}

function cmdPenalty() {
  const category = args[1] as PenaltyCategory;
  const offense = parseInt(args[2] || '1', 10);

  const validCategories: PenaltyCategory[] = ['FAIR_HOUSING', 'DATA_QUALITY', 'INCURABLE', 'GENERAL_UCBA', 'QUARTERLY_REJECTION'];
  if (!validCategories.includes(category)) {
    console.error(`${RED}Invalid category: ${category}${RESET}`);
    console.log(`Valid categories: ${validCategories.join(', ')}`);
    process.exit(2);
    return;
  }

  const p = assessPenalty(category, offense);
  console.log(`\n${BOLD}═══ PENALTY ASSESSMENT ═══${RESET}`);
  console.log(`  Category:        ${p.category}`);
  console.log(`  Offense:         ${p.offense}${p.offense === 1 ? 'st' : p.offense === 2 ? 'nd' : p.offense === 3 ? 'rd' : 'th'}`);
  console.log(`  Fine:            ${p.fine > 0 ? `${RED}$${p.fine.toLocaleString()}${RESET}` : '$0'}`);
  console.log(`  Cure Period:     ${p.cureperiodDays > 0 ? `${p.cureperiodDays} business days` : 'None (immediate)'}`);
  console.log(`  Termination Risk: ${p.terminationRisk ? `${RED}${BOLD}YES${RESET}` : 'No'}`);
  console.log(`  UCBA Ref:        ${p.ucbaRef}`);
}

// ─── Result Printer ───────────────────────────────────────────────────

function printResult(result: ValidationResult, filename: string) {
  const status = result.valid ? `${GREEN}${BOLD}PASS${RESET}` : `${RED}${BOLD}FAIL${RESET}`;

  console.log(`\n${BOLD}═══ REBNY RLS VALIDATION RESULT ═══${RESET}`);
  console.log(`File: ${filename}`);
  console.log(`Status: ${status}`);
  console.log(`Timestamp: ${result.timestamp}`);
  if (result.listingKey) console.log(`Listing Key: ${result.listingKey}`);

  console.log(`\n${BOLD}Summary:${RESET}`);
  console.log(`  Total issues: ${result.summary.total}`);
  console.log(`  ${RED}Blockers: ${result.summary.blockers}${RESET}`);
  console.log(`  ${RED}Errors:   ${result.summary.errors}${RESET}`);
  console.log(`  ${YELLOW}Warnings: ${result.summary.warnings}${RESET}`);
  console.log(`  ${DIM}Info:     ${result.summary.info}${RESET}`);

  if (Object.keys(result.summary.byCategory).length > 0) {
    console.log(`\n${BOLD}By Category:${RESET}`);
    for (const [cat, count] of Object.entries(result.summary.byCategory)) {
      if (count > 0) {
        console.log(`  ${cat}: ${count}`);
      }
    }
  }

  if (result.issues.length > 0) {
    console.log(`\n${BOLD}Issues:${RESET}`);
    // Group by severity, blockers first
    const order = ['BLOCKER', 'ERROR', 'WARNING', 'INFO'];
    for (const sev of order) {
      const sevIssues = result.issues.filter(i => i.severity === sev);
      if (sevIssues.length === 0) continue;

      for (const i of sevIssues) {
        const refs = [i.ruleId, i.ucbaRef].filter(Boolean).join(' | ');
        console.log(`  ${colorSeverity(i.severity)} [${i.code}] ${i.message}${refs ? ` ${DIM}(${refs})${RESET}` : ''}`);
      }
    }
  }

  console.log(`\n${DIM}Field Authority: UCBA → RLS (TRUMPS) → RESO/IDX → INTERNAL → Fail Closed${RESET}`);
}

// ─── Main ─────────────────────────────────────────────────────────────

switch (command) {
  case 'validate':
    cmdValidate();
    break;
  case 'batch':
    cmdBatch();
    break;
  case 'registry':
    cmdRegistry();
    break;
  case 'penalty':
    cmdPenalty();
    break;
  case '--help':
  case '-h':
  case 'help':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`${RED}Unknown command: ${command}${RESET}`);
    printUsage();
    process.exit(2);
}
