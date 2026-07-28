#!/usr/bin/env node
/**
 * capability-audit — machine enforcement of the master plan's §24 acceptance
 * criteria and §8.3 maturity statuses.
 *
 * Authority : docs/architecture/Mallan_Intelligence_Master_Plan.md §26 correction C-5
 * Registry  : config/capabilities.mjs
 * Run       : npm run capability:audit
 *
 * WHAT THIS VALIDATOR PROVES
 *   - every registry entry is structurally complete;
 *   - every claimed §8.3 status is backed by the evidence that status requires;
 *   - no capability claims a promoted status it has not earned;
 *   - blocked capabilities reference a real ratified correction;
 *   - the registry states its own coverage honestly.
 *
 * WHAT THIS VALIDATOR DOES NOT PROVE
 *   - that any listed test actually passes;
 *   - that any listed file exists on disk beyond an existence check;
 *   - that any capability works in production;
 *   - that the registry is a complete inventory of the platform.
 *
 * Report both halves when citing a green run. A green `capability:audit` means
 * "the registry is internally honest," not "the platform works."
 *
 * Exit codes: 0 = pass, 1 = one or more violations, 2 = validator error.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** Corrections ratified in master plan §26. `blockedBy` must reference one. */
const RATIFIED_CORRECTIONS = new Set(['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7']);

/** Fields that must be present on every capability, even if `unverified`. */
const REQUIRED_FIELDS = [
  'id',
  'name',
  'program',
  'planRef',
  'owner',
  'status',
  'canonicalFiles',
  'tests',
  'observability',
  'rollback',
  'production_proof',
];

/** A field counts as evidence only if it is a non-empty, non-`unverified` value. */
function hasEvidence(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  const s = String(value).trim().toLowerCase();
  return s !== '' && s !== 'unverified' && s !== 'none' && s !== 'n/a';
}

/** Path-ish entries are checked for existence; command entries (`npm run …`) are not. */
function isPathLike(entry) {
  return !entry.startsWith('npm ') && !entry.startsWith('yarn ') && !entry.startsWith('pnpm ');
}

const violations = [];
const warnings = [];

function violation(capId, rule, detail) {
  violations.push({ capId, rule, detail });
}
function warn(capId, rule, detail) {
  warnings.push({ capId, rule, detail });
}

let registry;
try {
  // pathToFileURL is required: on Windows a bare absolute path (`C:\...`) is
  // rejected by the ESM loader as an unsupported `c:` protocol.
  registry = await import(pathToFileURL(join(REPO_ROOT, 'config', 'capabilities.mjs')).href);
} catch (err) {
  console.error('capability:audit — FAILED TO LOAD REGISTRY');
  console.error(`  config/capabilities.mjs could not be imported: ${err.message}`);
  process.exit(2);
}

const { STATUSES, PROMOTION_PROOF, meta, programs, capabilities, coverage } = registry;

if (!Array.isArray(capabilities) || capabilities.length === 0) {
  console.error('capability:audit — registry exports no capabilities. Nothing to validate.');
  process.exit(2);
}

const statusSet = new Set(STATUSES);
const programIds = new Set(programs.map((p) => p.id));
const seenIds = new Set();

for (const cap of capabilities) {
  const id = cap.id ?? '<missing id>';

  // ---- structural completeness (§24) --------------------------------------
  for (const field of REQUIRED_FIELDS) {
    if (!(field in cap)) {
      violation(id, 'REQUIRED_FIELD_MISSING', `field \`${field}\` is absent`);
    }
  }

  // ---- unique ids ---------------------------------------------------------
  if (seenIds.has(cap.id)) {
    violation(id, 'DUPLICATE_ID', `capability id \`${cap.id}\` appears more than once`);
  }
  seenIds.add(cap.id);

  // ---- status is a legal §8.3 value ---------------------------------------
  if (!statusSet.has(cap.status)) {
    violation(
      id,
      'ILLEGAL_STATUS',
      `status \`${cap.status}\` is not one of §8.3: ${STATUSES.join(', ')}`,
    );
  }

  // ---- program reference resolves -----------------------------------------
  if (cap.program && !programIds.has(cap.program)) {
    violation(id, 'UNKNOWN_PROGRAM', `program \`${cap.program}\` is not declared in programs[]`);
  }

  // ---- THE CORE RULE: promotion requires proof (C-5) ----------------------
  const required = PROMOTION_PROOF[cap.status];
  if (required) {
    for (const field of required) {
      if (!hasEvidence(cap[field])) {
        violation(
          id,
          'UNEARNED_STATUS',
          `status \`${cap.status}\` requires evidence in \`${field}\`, but it is ` +
            `\`${JSON.stringify(cap[field] ?? null)}\`. Either supply the evidence or ` +
            `lower the status. Status is assigned from evidence, not intent.`,
        );
      }
    }
  }

  // ---- blocked capabilities must cite a ratified correction ---------------
  if (cap.blockedBy && !RATIFIED_CORRECTIONS.has(cap.blockedBy)) {
    violation(
      id,
      'UNKNOWN_BLOCKER',
      `blockedBy \`${cap.blockedBy}\` is not a ratified §26 correction`,
    );
  }

  // ---- a blocked capability must not claim a promoted status --------------
  const promotedIdx = STATUSES.indexOf('implemented');
  if (cap.blockedBy && STATUSES.indexOf(cap.status) > promotedIdx) {
    violation(
      id,
      'BLOCKED_BUT_PROMOTED',
      `capability is blocked by ${cap.blockedBy} yet claims \`${cap.status}\``,
    );
  }

  // ---- owner must be assigned before promotion beyond `implemented` -------
  if (STATUSES.indexOf(cap.status) > promotedIdx && cap.owner === 'unassigned') {
    violation(id, 'NO_OWNER', `status \`${cap.status}\` requires a named owner (§24)`);
  }

  // ---- declared paths should exist (warning, not violation) ---------------
  for (const list of [cap.canonicalFiles ?? [], cap.tests ?? []]) {
    for (const entry of list) {
      if (isPathLike(entry) && !existsSync(join(REPO_ROOT, entry))) {
        warn(id, 'PATH_NOT_FOUND', `declared path \`${entry}\` does not exist`);
      }
    }
  }

  // ---- policy watch entries must not carry an effective date silently ----
  for (const w of cap.policyWatch ?? []) {
    if (w.review_status === 'monitoring' && w.effective_date !== null) {
      violation(
        id,
        'MONITORING_WITH_DATE',
        `policy watch \`${w.id}\` is \`monitoring\` but declares an effective_date. ` +
          `A monitored item has no effective date until an official source is captured.`,
      );
    }
    if (w.review_status !== 'monitoring' && w.enforcement_mode === 'none') {
      warn(id, 'ENFORCEMENT_MISMATCH', `policy watch \`${w.id}\` is promoted but enforces nothing`);
    }
  }
}

// ---- registry-level honesty checks ----------------------------------------
if (!coverage || coverage.capabilitiesTotalEstimated === undefined) {
  violation('<registry>', 'NO_COVERAGE_STATEMENT', 'registry must state its own coverage (C-5)');
}
if (coverage && coverage.capabilitiesRegistered !== capabilities.length) {
  violation(
    '<registry>',
    'COVERAGE_COUNT_MISMATCH',
    `coverage.capabilitiesRegistered=${coverage.capabilitiesRegistered} but ` +
      `capabilities.length=${capabilities.length}`,
  );
}

// ---- report ---------------------------------------------------------------
const line = '─'.repeat(72);
console.log(line);
console.log('capability:audit — master plan §24 / §8.3 / §26 C-5');
console.log(line);
console.log(`registry        : config/capabilities.mjs (v${meta?.version ?? '?'})`);
console.log(`baseline        : ${meta?.baselineCommit ?? '?'} on ${meta?.baselineBranch ?? '?'}`);
console.log(`programs        : ${programs.length}`);
console.log(`capabilities    : ${capabilities.length}`);
console.log(`coverage        : ${coverage?.capabilitiesRegistered ?? '?'} registered of ` +
            `${coverage?.capabilitiesTotalEstimated ?? '?'} total`);
console.log('');

const byStatus = {};
for (const c of capabilities) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
console.log('status distribution:');
for (const s of STATUSES) {
  if (byStatus[s]) console.log(`  ${s.padEnd(16)} ${byStatus[s]}`);
}
console.log('');

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}) — not blocking:`);
  for (const w of warnings) console.log(`  [${w.capId}] ${w.rule}: ${w.detail}`);
  console.log('');
}

if (violations.length) {
  console.log(`VIOLATIONS (${violations.length}) — blocking:`);
  for (const v of violations) console.log(`  [${v.capId}] ${v.rule}\n      ${v.detail}`);
  console.log('');
  console.log(line);
  console.log(`RESULT: FAIL — ${violations.length} violation(s)`);
  console.log(line);
  process.exit(1);
}

console.log(line);
console.log('RESULT: PASS — registry is internally consistent and no status is unearned.');
console.log('');
console.log('THIS PROVES : the registry is structurally complete and every claimed status');
console.log('              is backed by the evidence that status requires.');
console.log('THIS DOES NOT PROVE : that any test passes, that any capability works in');
console.log('              production, or that the registry is a complete platform inventory.');
console.log(`              ${coverage?.knownUnregisteredAreas?.length ?? 0} known area(s) remain unregistered.`);
console.log(line);
process.exit(0);
