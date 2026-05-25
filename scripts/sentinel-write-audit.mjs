#!/usr/bin/env node
// Sentinel-D.1 — workflow-owned audit-report writer.
//
// Replaces the Claude Write tool dependency that Sentinel-A.2/A.3/A.4 could
// not get past. anthropics/claude-code-action@v1's permission matcher rejects
// Write(...) patterns for `/home/runner/...` absolute paths even with the
// documented `//` gitignore-spec syntax. This script is invoked by Claude via
// the existing `Bash(node scripts/*)` allow-list entry (no Bash broadening
// required) with the full audit content piped to stdin.
//
// Security posture:
//   - Output path is computed INTERNALLY from AUDIT_DATE env var only.
//   - No positional args accepted; argv beyond argv[1] is ignored on purpose.
//   - Pure Node fs/path/crypto. No child_process. No eval. No shell exec.
//   - All schema gates fail-closed.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ── Constants ────────────────────────────────────────────────────────────
const AUDIT_DIR = 'memory/audits';
const AUDIT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOSING_LINE = 'Report-only: no changes made.';
const MATRIX_HEADING = '## Coverage Matrix';
const REQUIRED_SECTIONS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
  'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
];
const REQUIRED_MATRIX_ROWS = 21;
const MIN_BYTES = 1024;          // 1 KB
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const FORBIDDEN_TODO_LINE = '_TODO_';
const FORBIDDEN_IN_PROGRESS = '| IN PROGRESS |';

// ── Error helper ─────────────────────────────────────────────────────────
function fail(code, message) {
  process.stderr.write(`sentinel-write-audit: ERROR [${code}] ${message}\n`);
  process.exit(1);
}

// ── Stdin reader (size-bounded) ──────────────────────────────────────────
async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    process.stdin.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(Object.assign(new Error('stdin exceeds 2 MB'), { code: 'STDIN_TOO_LARGE' }));
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
    fail('CONTENT_TOO_SMALL', `stdin is ${bytes} bytes (< ${MIN_BYTES}). Audit content must be at least 1 KB.`);
  }
  if (bytes > MAX_BYTES) {
    fail('CONTENT_TOO_LARGE', `stdin is ${bytes} bytes (> ${MAX_BYTES}). Audit content must be at most 2 MB.`);
  }

  const lines = content.split('\n');
  const todoLineIdx = lines.findIndex((line) => line === FORBIDDEN_TODO_LINE);
  if (todoLineIdx !== -1) {
    fail(
      'UNFILLED_TODO',
      `line ${todoLineIdx + 1} is the literal placeholder "${FORBIDDEN_TODO_LINE}". Every A–S section must be filled in before the report can be written.`
    );
  }

  if (content.includes(FORBIDDEN_IN_PROGRESS)) {
    fail(
      'MATRIX_IN_PROGRESS',
      `Coverage Matrix still contains "${FORBIDDEN_IN_PROGRESS}" rows. Replace every row's IN PROGRESS status with PASS / FAIL / LIMITED / NOT VERIFIED.`
    );
  }

  const matrixStart = content.indexOf(MATRIX_HEADING);
  if (matrixStart === -1) {
    fail('NO_MATRIX_HEADING', `missing "${MATRIX_HEADING}" heading.`);
  }

  // Codex P2 fix (2026-05-25): scope matrix row counting to the substring
  // BETWEEN `## Coverage Matrix` and the next level-2 heading (or end of
  // document). A numbered markdown table elsewhere in the report (e.g. a
  // priority-ordered fix table in section P, an evidence table in section
  // S) must NOT contribute to the count. Previously the regex ran across
  // the entire document and would falsely fail valid audits.
  const afterHeading = content.slice(matrixStart + MATRIX_HEADING.length);
  const nextHeadingMatch = afterHeading.match(/^## /m);
  const matrixSection = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  const matrixRowRe = /^\|\s*\d{1,2}\s*\|/gm;
  const matrixRowCount = (matrixSection.match(matrixRowRe) || []).length;
  if (matrixRowCount !== REQUIRED_MATRIX_ROWS) {
    fail(
      'MATRIX_ROW_COUNT',
      `## Coverage Matrix section has ${matrixRowCount} data rows; expected exactly ${REQUIRED_MATRIX_ROWS} (one per audit area).`
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
      `missing required A–S section header(s): ${missingSections.join(', ')}. Each section must begin with "## <letter>. ".`
    );
  }

  // Closing line must be present AND must be the last non-blank line.
  const trimmedTail = content.replace(/\s+$/, '');
  if (!trimmedTail.endsWith(CLOSING_LINE)) {
    fail(
      'MISSING_CLOSING_LINE',
      `the literal closing line "${CLOSING_LINE}" must be the last non-blank line of the report.`
    );
  }

  return { bytes };
}

// ── Output path resolution (workflow-controlled only) ────────────────────
function resolveOutputPath(auditDate) {
  if (!auditDate) {
    fail('NO_AUDIT_DATE', 'AUDIT_DATE env var is required (format: YYYY-MM-DD).');
  }
  if (!AUDIT_DATE_RE.test(auditDate)) {
    fail('BAD_AUDIT_DATE', `AUDIT_DATE "${auditDate}" must match ^\\d{4}-\\d{2}-\\d{2}$.`);
  }

  const filename = `AUDIT-${auditDate}.md`;
  // POSIX-form relative path for JSON output portability (the script runs
  // on Linux in CI; emit forward slashes regardless of host platform).
  const relPath = `${AUDIT_DIR}/${filename}`;
  const absPath = path.resolve(AUDIT_DIR, filename);
  const absDir = path.resolve(AUDIT_DIR);

  // Canonicalize and reject any path that escapes memory/audits/.
  // Even though `path.join` should prevent this for a constrained filename,
  // we re-check the resolved form as a defense-in-depth boundary.
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
  // env vars set by the workflow. Claude cannot supply a target path.
  if (process.argv.length > 2) {
    fail(
      'UNEXPECTED_ARGS',
      `positional arguments are not accepted (got ${process.argv.length - 2}). Output path is computed internally from AUDIT_DATE env.`
    );
  }

  const auditDate = process.env.AUDIT_DATE;
  const { relPath, absPath } = resolveOutputPath(auditDate);

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
  validateContent(content);

  await atomicWrite(absPath, content);

  const sha256 = createHash('sha256').update(content, 'utf8').digest('hex');
  const bytes = Buffer.byteLength(content, 'utf8');

  process.stdout.write(JSON.stringify({ path: relPath, sha256, bytes }) + '\n');
}

main().catch((err) => {
  fail('UNEXPECTED', err && err.stack ? err.stack : String(err));
});
