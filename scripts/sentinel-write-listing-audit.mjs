#!/usr/bin/env node
// Sentinel-L — workflow-owned listing-readiness audit writer.
//
// Companion to scripts/sentinel-write-audit.mjs but PR-scoped instead of
// daily. Called by Claude via the existing `Bash(node scripts/*)` allow-
// list entry. Output path is computed INTERNALLY from PR_NUMBER + PR_HEAD_SHA
// env vars (workflow-supplied); Claude cannot redirect output.
//
// Schema requirements for Sentinel-L:
//   - Section headers required: ## A. … ## B. … ## C. … ## D. … ## E.
//     (see Maya's Sentinel-L spec: Address/Cotality/RESO, Sale listing
//     workflow, Draft workflow, Media workflow, Final verdict).
//   - Exactly one explicit verdict line of the form `Final verdict: GREEN`
//     or `Final verdict: YELLOW` or `Final verdict: RED`.
//   - Closing line `Sentinel-L: report-only — no changes made.`
//   - 1 KB minimum, 6 KB maximum payload (Sentinel-D.1.1 SDK parser limit).
//   - No `_TODO_` lines.
//
// Pure Node fs/path/crypto. No child_process. No eval. No shell exec.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ── Constants ────────────────────────────────────────────────────────────
const AUDIT_DIR = 'memory/audits/listing-readiness';
const PR_NUMBER_RE = /^\d+$/;
const PR_HEAD_SHA_RE = /^[a-f0-9]{40}$/;
const CLOSING_LINE = 'Sentinel-L: report-only — no changes made.';
const REQUIRED_SECTIONS = ['A', 'B', 'C', 'D', 'E'];
const VERDICT_RE = /^Final verdict:\s+(GREEN|YELLOW|RED)\s*$/m;
const MIN_BYTES = 1024;          // 1 KB
const MAX_BYTES = 6 * 1024;      // 6 KB (Sentinel-D.1.1 SDK parser limit)
const FORBIDDEN_TODO_LINE = '_TODO_';

// ── Error helper ─────────────────────────────────────────────────────────
function fail(code, message) {
  process.stderr.write(`sentinel-write-listing-audit: ERROR [${code}] ${message}\n`);
  process.exit(1);
}

// ── Stdin reader (size-bounded) ──────────────────────────────────────────
async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    process.stdin.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES + 1024) {
        // Hard kill on egregious overshoot to avoid buffering >> MAX_BYTES.
        reject(Object.assign(new Error('stdin exceeds 6 KB cap'), { code: 'STDIN_TOO_LARGE' }));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
}

// ── Validation ───────────────────────────────────────────────────────────
function validateContent(content) {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes < MIN_BYTES) {
    fail('CONTENT_TOO_SMALL', `stdin is ${bytes} bytes (< ${MIN_BYTES}). Sentinel-L audit must be at least 1 KB.`);
  }
  if (bytes > MAX_BYTES) {
    fail(
      'CONTENT_TOO_LARGE',
      `stdin is ${bytes} bytes (> ${MAX_BYTES}). Sentinel-D.1.1 SDK parser limit applies — keep payload under 6 KB.`
    );
  }

  const lines = content.split('\n');
  const todoLineIdx = lines.findIndex((line) => line === FORBIDDEN_TODO_LINE);
  if (todoLineIdx !== -1) {
    fail(
      'UNFILLED_TODO',
      `line ${todoLineIdx + 1} is the literal placeholder "${FORBIDDEN_TODO_LINE}". Every section must be filled in.`
    );
  }

  const missingSections = [];
  for (const letter of REQUIRED_SECTIONS) {
    const sectionRe = new RegExp(`^## ${letter}\\. `, 'm');
    if (!sectionRe.test(content)) missingSections.push(letter);
  }
  if (missingSections.length) {
    fail(
      'MISSING_SECTIONS',
      `missing required section header(s): ${missingSections.join(', ')}. Each section must begin with "## <letter>. ".`
    );
  }

  const verdictMatch = content.match(VERDICT_RE);
  if (!verdictMatch) {
    fail(
      'MISSING_VERDICT',
      `report must contain exactly one line of the form "Final verdict: GREEN" / "Final verdict: YELLOW" / "Final verdict: RED".`
    );
  }
  const verdict = verdictMatch[1];

  // Closing line must be the last non-blank line.
  const trimmedTail = content.replace(/\s+$/, '');
  if (!trimmedTail.endsWith(CLOSING_LINE)) {
    fail(
      'MISSING_CLOSING_LINE',
      `the literal closing line "${CLOSING_LINE}" must be the last non-blank line of the report.`
    );
  }

  return { bytes, verdict };
}

// ── Env var validation ───────────────────────────────────────────────────
function readEnv() {
  const prNumber = process.env.PR_NUMBER;
  const prHeadSha = process.env.PR_HEAD_SHA;

  if (!prNumber) {
    fail('NO_PR_NUMBER', 'PR_NUMBER env var is required (format: positive integer).');
  }
  if (!PR_NUMBER_RE.test(prNumber)) {
    fail('BAD_PR_NUMBER', `PR_NUMBER "${prNumber}" must match ^\\d+$.`);
  }

  if (!prHeadSha) {
    fail('NO_PR_HEAD_SHA', 'PR_HEAD_SHA env var is required (format: 40-char lowercase hex).');
  }
  if (!PR_HEAD_SHA_RE.test(prHeadSha)) {
    fail('BAD_PR_HEAD_SHA', `PR_HEAD_SHA "${prHeadSha}" must match ^[a-f0-9]{40}$.`);
  }

  return { prNumber, prHeadSha };
}

// ── Output path resolution (workflow-controlled only) ────────────────────
function resolveOutputPath({ prNumber, prHeadSha }) {
  const shortSha = prHeadSha.slice(0, 8);
  const filename = `PR-${prNumber}-${shortSha}.md`;
  const relPath = `${AUDIT_DIR}/${filename}`;
  const absPath = path.resolve(AUDIT_DIR, filename);
  const absDir = path.resolve(AUDIT_DIR);

  // Defense-in-depth: re-check the resolved path stays under AUDIT_DIR.
  if (!absPath.startsWith(absDir + path.sep) && absPath !== absDir) {
    fail('PATH_ESCAPE', `resolved path "${absPath}" escapes "${absDir}". Refusing.`);
  }
  if (path.dirname(absPath) !== absDir) {
    fail('PATH_NOT_IN_AUDITS', `resolved directory "${path.dirname(absPath)}" is not "${absDir}".`);
  }

  return { relPath, absPath };
}

// ── Atomic write ─────────────────────────────────────────────────────────
async function atomicWrite(absPath, content) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp`;
  await fs.writeFile(tmpPath, content, { encoding: 'utf8', flag: 'w' });
  await fs.rename(tmpPath, absPath);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  // Reject any positional args. The script's path is determined ONLY from
  // env vars set by the workflow.
  if (process.argv.length > 2) {
    fail(
      'UNEXPECTED_ARGS',
      `positional arguments are not accepted (got ${process.argv.length - 2}). Output path is computed internally from PR_NUMBER + PR_HEAD_SHA env.`
    );
  }

  const envVars = readEnv();
  const { relPath, absPath } = resolveOutputPath(envVars);

  let buf;
  try {
    buf = await readStdin();
  } catch (err) {
    if (err && err.code === 'STDIN_TOO_LARGE') {
      fail('CONTENT_TOO_LARGE', `stdin exceeded ${MAX_BYTES} bytes during read.`);
    }
    fail('STDIN_READ_ERROR', `failed to read stdin: ${err && err.message ? err.message : String(err)}`);
  }

  const content = buf.toString('utf8');
  const { bytes, verdict } = validateContent(content);

  await atomicWrite(absPath, content);

  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');

  process.stdout.write(JSON.stringify({ path: relPath, sha256, bytes, verdict }) + '\n');
}

main().catch((err) => {
  fail('UNEXPECTED', err && err.stack ? err.stack : String(err));
});
