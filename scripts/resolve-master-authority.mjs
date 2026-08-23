#!/usr/bin/env node
/**
 * AUTHORITY BOOTSTRAP — resolve the Mallan master from PR #595, read-only.
 *
 * WHY THIS EXISTS. `MALLAN-PLATFORM-MASTER-PLAN.md` and
 * `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` are NOT tracked on the
 * #618 Search branch — they live on the still-open PR #595, which defines them
 * as the single product authority. An agent working only from #618 therefore
 * sees the audit, the PR body, the handoff and the matrices with no master above
 * them, and can treat them as competing authorities. That is the context-loss
 * loop this bootstrap closes.
 *
 * THE RESOLUTION ORDER IS DETERMINISTIC AND NOT NEGOTIABLE:
 *
 *   CURRENT #595 HEAD -> MASTER PLAN -> CONTINUOUS EXECUTION STATE
 *     -> CURRENT #618 HANDOFF -> SEARCH EVIDENCE
 *
 * #595 automatically outranks every #618 audit, matrix and handoff. A conflict
 * is NOT a question for Maya — #595 simply wins. Only a genuine ambiguity WITHIN
 * the master itself comes back to her.
 *
 * WHAT IT MUST NEVER DO:
 *   - copy either file into the #618 tree. Two physical copies can drift, which
 *     recreates the problem in a worse form. The cache below lives under
 *     `.cache/`, which is gitignored, and is rewritten from the live SHA on
 *     every run.
 *   - modify #595, #618 or #620.
 *   - resolve anything if #595 cannot be read. It fails loud instead.
 *
 * The head SHA is RE-RESOLVED on every run and never hardcoded, so the bootstrap
 * cannot silently pin a stale master.
 *
 * REMOVE THIS SCRIPT once #595 is authorized and merged — from then on the
 * authority is read from the normal repository tree. The script says so itself
 * when it detects #595 is no longer open.
 *
 *   node scripts/resolve-master-authority.mjs
 *   node scripts/resolve-master-authority.mjs --json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'mallan67/mallan-nyc';
const AUTHORITY_PR = 595;
const FILES = [
  'MALLAN-PLATFORM-MASTER-PLAN.md',
  'docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md',
];
const CACHE_DIR = join('.cache', 'master-authority');
const JSON_OUT = process.argv.includes('--json');

const log = (s = '') => { if (!JSON_OUT) console.log(s); };

/** Fail loud. An unresolved authority is never "proceed with what is present". */
function abort(what, detail) {
  console.error(`\nAUTHORITY UNRESOLVED — ${what}`);
  console.error(detail);
  console.error(
    '\nDo NOT continue by reading whatever #618 happens to contain. That is the\n' +
    'context-loss loop this bootstrap exists to close. Resolve access to PR #595\n' +
    'and re-run.',
  );
  process.exit(2);
}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    abort('the GitHub CLI call failed', String(err?.stderr || err?.message || err).slice(0, 500));
  }
}

// ── 1. Re-resolve the authority head. Never hardcoded. ──────────────────────
const pr = JSON.parse(gh(['pr', 'view', String(AUTHORITY_PR), '--repo', REPO, '--json', 'number,state,headRefOid,headRefName,title']));

if (pr.state !== 'OPEN') {
  console.error(`\nPR #${AUTHORITY_PR} is ${pr.state}, not OPEN.`);
  console.error(
    'If it was MERGED, the authority now lives in the normal repository tree:\n' +
    '  - read MALLAN-PLATFORM-MASTER-PLAN.md directly from the working tree\n' +
    '  - DELETE this bootstrap script and the handoff section that points at it\n' +
    'If it was CLOSED without merging, stop and ask Maya which document is authoritative.',
  );
  process.exit(3);
}

const sha = pr.headRefOid;
if (!/^[0-9a-f]{40}$/.test(sha)) abort('the resolved head SHA is not a commit id', String(sha));

// ── 2. Read both authority files AT THAT EXACT COMMIT, read-only. ───────────
mkdirSync(CACHE_DIR, { recursive: true });
const resolved = [];

for (const path of FILES) {
  const raw = gh(['api', `repos/${REPO}/contents/${path}?ref=${sha}`, '--jq', '.content']);
  const content = Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf8');
  if (!content.trim()) abort(`${path} resolved empty at ${sha.slice(0, 8)}`, 'An empty authority is not an authority.');

  // Cache under .cache/ ONLY — gitignored, rewritten every run, never tracked.
  const out = join(CACHE_DIR, path.replace(/[\\/]/g, '__'));
  writeFileSync(out, content);
  resolved.push({ path, bytes: content.length, cachedAt: out });
}

// ── 3. Report the chain. ────────────────────────────────────────────────────
const result = {
  resolvedAt: new Date().toISOString(),
  authorityPr: AUTHORITY_PR,
  authorityBranch: pr.headRefName,
  authorityHead: sha,
  files: resolved,
  precedence: [
    `PR #${AUTHORITY_PR} @ ${sha.slice(0, 8)} — MALLAN-PLATFORM-MASTER-PLAN.md`,
    `PR #${AUTHORITY_PR} @ ${sha.slice(0, 8)} — docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`,
    'THEN #618 docs/search/HANDOFF-AUTHENTICATED-SEARCH-2026-08-21.md',
    'THEN the #618 Search evidence documents',
  ],
  conflictRule:
    `#${AUTHORITY_PR} automatically outranks every #618 audit, matrix and handoff. A conflict is ` +
    'NOT escalated — the master wins. Only a genuine ambiguity WITHIN the master returns to Maya.',
  neverDo: [
    'copy either file into the #618 tree — two copies can drift',
    'modify #595, #618 or #620 to resolve authority',
    'proceed from #618 documents when the master cannot be read',
  ],
  removeWhen: `PR #${AUTHORITY_PR} is merged — then read the authority from the normal repository tree and delete this script.`,
};

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  log('AUTHORITY RESOLVED');
  log(`  PR #${AUTHORITY_PR} (${pr.headRefName}) @ ${sha}`);
  log('');
  for (const f of resolved) log(`  ${f.path}  ${f.bytes.toLocaleString()} bytes  ->  ${f.cachedAt}`);
  log('');
  log('  PRECEDENCE');
  for (const p of result.precedence) log(`    ${p}`);
  log('');
  log(`  ${result.conflictRule}`);
  log('');
  log('  Cache is under .cache/ (gitignored) and is rewritten from the live SHA every run.');
  log('  The master is NEVER copied into this branch.');
}
