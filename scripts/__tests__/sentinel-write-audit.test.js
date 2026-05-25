/**
 * Sentinel-D.1 — scripts/sentinel-write-audit.mjs validation tests.
 *
 * Spawns the script as a subprocess (the test file is allowed to use
 * child_process; the script under test is NOT — it's enforced via grep
 * in `script does not import child_process` below).
 *
 * Covers every rejection mode required by the Sentinel-D.1 spec:
 *   - missing / malformed AUDIT_DATE
 *   - positional args
 *   - undersized stdin (< 1 KB)
 *   - oversized stdin (> 2 MB)
 *   - any `_TODO_` line remaining
 *   - any `| IN PROGRESS |` matrix row remaining
 *   - missing Coverage Matrix heading
 *   - wrong Coverage Matrix row count
 *   - missing required A–S section headers
 *   - missing closing line
 *   - happy path → atomic write + JSON output shape
 *   - path escape attempts
 *
 * The happy path also asserts the on-disk SHA-256 matches the JSON output.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'sentinel-write-audit.mjs');
const VALID_DATE = '2026-05-25';
const CLOSING_LINE = 'Report-only: no changes made.';

/** Build a freshly-numbered tmpdir so parallel jest workers don't collide. */
function makeTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-d-test-'));
}

/** Spawn the script and return { code, stdout, stderr }. */
function runScript({ stdin, env = {}, args = [], cwd }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd,
      env: { ...process.env, AUDIT_DATE: VALID_DATE, ...env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}

/** Build valid audit content that passes every schema gate. */
function buildValidAudit() {
  // 21 matrix rows. The script accepts either `| 1  |` or `| 1 |` — we use
  // a uniform `| <n> |` form here.
  const matrixRows = Array.from({ length: 21 }, (_, i) => {
    return `| ${i + 1} | Area ${i + 1} | PASS | evidence/${i + 1}.md | note |`;
  }).join('\n');

  // 19 A–S section headers, each with real body text (no `_TODO_`).
  const sectionLetters = 'ABCDEFGHIJKLMNOPQRS'.split('');
  const sections = sectionLetters
    .map((L) => `## ${L}. Section ${L} title\n\nReal finding body for section ${L}. evidence: file:1.\n`)
    .join('\n');

  const body = [
    `# Mallan Sentinel Audit — ${VALID_DATE}`,
    '',
    `timestamp_eastern: ${VALID_DATE}T08:00:00-0400`,
    `timestamp_utc:     ${VALID_DATE}T12:00:00Z`,
    'status:            COMPLETE',
    '',
    'Overall status: Green — all gates pass.',
    '',
    '---',
    '',
    '## Coverage Matrix',
    '',
    '| # | Area | Status | Evidence | Notes |',
    '|---|------|--------|----------|-------|',
    matrixRows,
    '',
    '---',
    '',
    sections,
    '',
    CLOSING_LINE,
    '',
  ].join('\n');

  // Pad with extra prose so the body is >= 1 KB without re-violating any
  // gate. We add a non-A–S "appendix-style" trailing block AFTER the
  // closing line is constructed, but BEFORE the closing line is appended
  // — so the closing line stays last.
  //
  // The body above is already >= 1 KB given 21 matrix rows + 19 sections
  // with two-line bodies each, but we sanity-check below.
  if (Buffer.byteLength(body, 'utf8') < 1024) {
    throw new Error(`fixture too small: ${Buffer.byteLength(body, 'utf8')} bytes`);
  }
  return body;
}

describe('sentinel-write-audit.mjs', () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = makeTmpdir();
    fs.mkdirSync(path.join(tmpdir, 'memory', 'audits'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── Source-level guardrails (read the script source, not exec) ─────────

  describe('source-level guardrails', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // Strip JS comments (line + block) so source-text checks only catch
    // actual call/import sites, not comment mentions of the same token.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    test('script does not import or require child_process', () => {
      expect(codeOnly).not.toMatch(/child_process/);
    });

    test('script does not use eval', () => {
      expect(codeOnly).not.toMatch(/\beval\s*\(/);
    });

    test('script does not use new Function', () => {
      expect(codeOnly).not.toMatch(/new\s+Function\s*\(/);
    });

    test('script uses ESM imports only (no require call sites)', () => {
      expect(codeOnly).not.toMatch(/^\s*(const|let|var)\s+\w+\s*=\s*require\s*\(/m);
    });
  });

  // ── AUDIT_DATE validation ──────────────────────────────────────────────

  describe('AUDIT_DATE validation', () => {
    test('rejects missing AUDIT_DATE', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { AUDIT_DATE: '' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/NO_AUDIT_DATE/);
    });

    test('rejects malformed AUDIT_DATE — wrong format', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { AUDIT_DATE: '05-25-2026' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_AUDIT_DATE/);
    });

    test('rejects malformed AUDIT_DATE — short year', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { AUDIT_DATE: '26-05-25' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_AUDIT_DATE/);
    });

    test('rejects path traversal injection in AUDIT_DATE', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { AUDIT_DATE: '../etc/passwd' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_AUDIT_DATE/);
    });
  });

  // ── Positional args rejected ───────────────────────────────────────────

  describe('positional args', () => {
    test('rejects any positional arg', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        args: ['/tmp/evil.md'],
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/UNEXPECTED_ARGS/);
    });
  });

  // ── Size bounds ────────────────────────────────────────────────────────

  describe('stdin size bounds', () => {
    test('rejects stdin under 1 KB', async () => {
      const { code, stderr } = await runScript({
        stdin: 'too small',
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/CONTENT_TOO_SMALL/);
    });

    test('rejects stdin over 2 MB', async () => {
      const bigContent = 'X'.repeat(2 * 1024 * 1024 + 10);
      const { code, stderr } = await runScript({
        stdin: bigContent,
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/CONTENT_TOO_LARGE/);
    });
  });

  // ── Schema gates ───────────────────────────────────────────────────────

  describe('schema validation', () => {
    test('rejects any line == "_TODO_"', async () => {
      // Replace the entire section-A body line so `_TODO_` stands alone.
      const content = buildValidAudit().replace(
        'Real finding body for section A. evidence: file:1.',
        '_TODO_'
      );
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/UNFILLED_TODO/);
    });

    test('rejects "| IN PROGRESS |" in matrix', async () => {
      const content = buildValidAudit().replace(
        '| 1 | Area 1 | PASS | evidence/1.md | note |',
        '| 1 | Area 1 | IN PROGRESS | evidence/1.md | note |'
      );
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MATRIX_IN_PROGRESS/);
    });

    test('rejects missing Coverage Matrix heading', async () => {
      const content = buildValidAudit().replace('## Coverage Matrix', '## Cover Sheet');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/NO_MATRIX_HEADING/);
    });

    test('rejects wrong Coverage Matrix row count (too few)', async () => {
      // Strip rows 20 and 21
      const content = buildValidAudit()
        .replace(/^\| 21 \| Area 21 .*$/m, '')
        .replace(/^\| 20 \| Area 20 .*$/m, '');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MATRIX_ROW_COUNT/);
    });

    // Codex P2 regression — matrix row counting must be scoped to the
    // Coverage Matrix section, not the whole document.

    test('rejects extra row INSIDE Coverage Matrix (22 rows fails)', async () => {
      // Inject a 22nd row immediately after the legitimate row 21.
      const content = buildValidAudit().replace(
        '| 21 | Area 21 | PASS | evidence/21.md | note |',
        '| 21 | Area 21 | PASS | evidence/21.md | note |\n| 22 | Area 22 | PASS | evidence/22.md | note |'
      );
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MATRIX_ROW_COUNT/);
      expect(stderr).toMatch(/Coverage Matrix section has 22/);
    });

    test('accepts numbered markdown table OUTSIDE Coverage Matrix (Codex P2)', async () => {
      // Inject a numbered markdown table into section P (Recommended fix
      // order). Pre-fix this would have been counted as additional matrix
      // rows and falsely tripped MATRIX_ROW_COUNT. After the Codex P2 fix
      // the row count is scoped to the `## Coverage Matrix` section only.
      const extraTable = [
        '## P. Section P title',
        '',
        '| # | Item | Priority |',
        '|---|------|----------|',
        '| 1 | Fix media-sync RC1 | HIGH |',
        '| 2 | Fix media-sync RC2 | HIGH |',
        '| 3 | Add CSP header | MEDIUM |',
        '',
        'Real finding body for section P. evidence: file:1.',
      ].join('\n');

      const content = buildValidAudit().replace(
        '## P. Section P title\n\nReal finding body for section P. evidence: file:1.',
        extraTable
      );

      const { code, stderr, stdout } = await runScript({ stdin: content, cwd: tmpdir });
      expect(stderr).toBe('');
      expect(code).toBe(0);
      // Must successfully produce the JSON output with on-disk file.
      const payload = JSON.parse(stdout.trim());
      expect(payload.path).toBe(`memory/audits/AUDIT-${VALID_DATE}.md`);
      expect(payload.bytes).toBeGreaterThan(0);
      expect(fs.readFileSync(path.join(tmpdir, payload.path), 'utf8')).toBe(content);
    });

    test('accepts valid report with exactly 21 Coverage Matrix rows', async () => {
      // Explicit assertion that the baseline fixture (21 rows in the
      // Coverage Matrix, nothing else) still passes. This complements the
      // happy-path block by being a single-purpose "row count == 21" check.
      const content = buildValidAudit();
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(stderr).toBe('');
      expect(code).toBe(0);
    });

    test.each(['A', 'F', 'M', 'R', 'S'])('rejects missing section %s', async (letter) => {
      const content = buildValidAudit().replace(`## ${letter}. Section ${letter} title`, `## ZZZ ${letter}`);
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_SECTIONS/);
      expect(stderr).toMatch(new RegExp(`\\b${letter}\\b`));
    });

    test('rejects missing closing line', async () => {
      const content = buildValidAudit().replace(CLOSING_LINE, 'Some other final line.');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_CLOSING_LINE/);
    });

    test('rejects closing line not at end (followed by extra non-blank content)', async () => {
      const content = buildValidAudit() + '\nstray extra line after closing\n';
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_CLOSING_LINE/);
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  describe('happy path', () => {
    test('writes the file atomically and emits {path,sha256,bytes} JSON', async () => {
      const content = buildValidAudit();
      const expectedPath = `memory/audits/AUDIT-${VALID_DATE}.md`;
      const expectedSha = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      const expectedBytes = Buffer.byteLength(content, 'utf8');

      const { code, stdout, stderr } = await runScript({
        stdin: content,
        cwd: tmpdir,
      });

      expect(stderr).toBe('');
      expect(code).toBe(0);

      const payload = JSON.parse(stdout.trim());
      expect(payload).toEqual({
        path: expectedPath,
        sha256: expectedSha,
        bytes: expectedBytes,
      });

      // On-disk file matches the JSON payload byte-for-byte.
      const onDisk = fs.readFileSync(path.join(tmpdir, expectedPath), 'utf8');
      expect(onDisk).toBe(content);
      const onDiskSha = crypto.createHash('sha256').update(onDisk, 'utf8').digest('hex');
      expect(onDiskSha).toBe(expectedSha);

      // .tmp sentinel was renamed away (no orphan).
      expect(fs.existsSync(path.join(tmpdir, expectedPath + '.tmp'))).toBe(false);
    });

    test('overwrites an existing same-day audit file', async () => {
      const expectedPath = path.join(tmpdir, 'memory', 'audits', `AUDIT-${VALID_DATE}.md`);
      fs.writeFileSync(expectedPath, 'STALE CONTENT FROM PRIOR RUN');

      const content = buildValidAudit();
      const { code } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(0);

      expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content);
    });
  });
});
