/**
 * Sentinel-L — scripts/sentinel-write-listing-audit.mjs validation tests.
 *
 * Companion to scripts/__tests__/sentinel-write-audit.test.js but exercises
 * the PR-scoped listing-readiness writer rather than the daily Sentinel-D
 * writer. The two scripts share the same architectural shape (stdin-only,
 * env-supplied path, atomic .tmp+rename, pure Node fs/path/crypto, no
 * child_process, no eval) but enforce different schema:
 *
 *   - 5 required sections (A–E for Address/Sale/Draft/Media/Verdict) vs
 *     19 required sections (A–S) in Sentinel-D.
 *   - Required `Final verdict: GREEN|YELLOW|RED` marker line vs Sentinel-D's
 *     `Overall status: Green|Yellow|Red`.
 *   - Closing line "Sentinel-L: report-only — no changes made." vs
 *     Sentinel-D's "Report-only: no changes made.".
 *   - 1 KB minimum / 6 KB maximum (same as Sentinel-D.1.1 SDK parser cap).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'sentinel-write-listing-audit.mjs');
const VALID_PR_NUMBER = '192';
const VALID_PR_HEAD_SHA = 'a'.repeat(40);
const CLOSING_LINE = 'Sentinel-L: report-only — no changes made.';

function makeTmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-l-test-'));
}

function runScript({ stdin, env = {}, args = [], cwd }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        PR_NUMBER: VALID_PR_NUMBER,
        PR_HEAD_SHA: VALID_PR_HEAD_SHA,
        ...env,
      },
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

/** Build valid Sentinel-L audit content (~1.3 KB). */
function buildValidAudit({ verdict = 'GREEN', sections = ['A', 'B', 'C', 'D', 'E'] } = {}) {
  const body = [
    `# Sentinel-L — Listing Workflow Readiness PR #${VALID_PR_NUMBER}`,
    '',
    `commit: ${VALID_PR_HEAD_SHA}`,
    '',
    '---',
    '',
    ...sections.map((L) => [
      `## ${L}. Section ${L}`,
      '',
      `Compact finding for section ${L}. Evidence: \`file/path-${L.toLowerCase()}.ts:42\`. Verified the live workflow path produces the expected result on the preview deployment. Cross-checked the route handler, the form-side caller, and the DB persistence path. No regressions versus the prior audit baseline; the merged PRs in this surface are reflected in the current diff.`,
      '',
    ].join('\n')),
    '',
    `Final verdict: ${verdict}`,
    '',
    CLOSING_LINE,
    '',
  ].join('\n');

  if (Buffer.byteLength(body, 'utf8') < 1024) {
    throw new Error(`fixture too small: ${Buffer.byteLength(body, 'utf8')} bytes`);
  }
  return body;
}

describe('sentinel-write-listing-audit.mjs', () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = makeTmpdir();
    fs.mkdirSync(path.join(tmpdir, 'memory', 'audits', 'listing-readiness'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── Source-level guardrails (read the script source, not exec) ─────────

  describe('source-level guardrails', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
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

  // ── PR_NUMBER / PR_HEAD_SHA validation ─────────────────────────────────

  describe('env var validation', () => {
    test('rejects missing PR_NUMBER', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_NUMBER: '' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/NO_PR_NUMBER/);
    });

    test('rejects non-numeric PR_NUMBER', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_NUMBER: 'abc123' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_PR_NUMBER/);
    });

    test('rejects path-traversal in PR_NUMBER', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_NUMBER: '../etc' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_PR_NUMBER/);
    });

    test('rejects missing PR_HEAD_SHA', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_HEAD_SHA: '' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/NO_PR_HEAD_SHA/);
    });

    test('rejects malformed PR_HEAD_SHA (too short)', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_HEAD_SHA: 'abc123' },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_PR_HEAD_SHA/);
    });

    test('rejects PR_HEAD_SHA with uppercase hex', async () => {
      const { code, stderr } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_HEAD_SHA: 'A'.repeat(40) },
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/BAD_PR_HEAD_SHA/);
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

    test('rejects stdin over 6 KB (Sentinel-D.1.1 parser cap)', async () => {
      const big = 'X'.repeat(6 * 1024 + 200);
      const { code, stderr } = await runScript({
        stdin: big,
        cwd: tmpdir,
      });
      expect(code).toBe(1);
      expect(stderr).toMatch(/CONTENT_TOO_LARGE/);
    });
  });

  // ── Schema gates ───────────────────────────────────────────────────────

  describe('schema validation', () => {
    test('rejects any line == "_TODO_"', async () => {
      const content = buildValidAudit().replace(
        'Compact finding for section A.',
        '_TODO_'
      ).replace(
        'Evidence: `file/path.ts:42`.',
        ''
      );
      // The replace above leaves a `_TODO_` line surrounded by other text;
      // make sure the literal-line check trips.
      const safer = buildValidAudit().replace(
        /^Compact finding for section A\. .*$/m,
        '_TODO_'
      );
      const { code, stderr } = await runScript({ stdin: safer, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/UNFILLED_TODO/);
    });

    test.each(['A', 'B', 'C', 'D', 'E'])('rejects missing section %s', async (letter) => {
      const sections = ['A', 'B', 'C', 'D', 'E'].filter((L) => L !== letter);
      const content = buildValidAudit({ sections });
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_SECTIONS/);
      expect(stderr).toMatch(new RegExp(`\\b${letter}\\b`));
    });

    test('rejects missing Final verdict line', async () => {
      const content = buildValidAudit().replace(/Final verdict:.*$/m, 'Some other line');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_VERDICT/);
    });

    test('rejects invalid verdict value', async () => {
      const content = buildValidAudit().replace('Final verdict: GREEN', 'Final verdict: BLUE');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_VERDICT/);
    });

    test.each(['GREEN', 'YELLOW', 'RED'])('accepts verdict %s', async (verdict) => {
      const content = buildValidAudit({ verdict });
      const { code, stdout } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(0);
      const payload = JSON.parse(stdout.trim());
      expect(payload.verdict).toBe(verdict);
    });

    test('rejects missing closing line', async () => {
      const content = buildValidAudit().replace(CLOSING_LINE, 'Some other final line.');
      const { code, stderr } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(1);
      expect(stderr).toMatch(/MISSING_CLOSING_LINE/);
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  describe('happy path', () => {
    test('writes the file atomically and emits {path,sha256,bytes,verdict} JSON', async () => {
      const content = buildValidAudit({ verdict: 'YELLOW' });
      const shortSha = VALID_PR_HEAD_SHA.slice(0, 8);
      const expectedPath = `memory/audits/listing-readiness/PR-${VALID_PR_NUMBER}-${shortSha}.md`;
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
        verdict: 'YELLOW',
      });

      const onDisk = fs.readFileSync(path.join(tmpdir, expectedPath), 'utf8');
      expect(onDisk).toBe(content);
      const onDiskSha = crypto.createHash('sha256').update(onDisk, 'utf8').digest('hex');
      expect(onDiskSha).toBe(expectedSha);

      expect(fs.existsSync(path.join(tmpdir, expectedPath + '.tmp'))).toBe(false);
    });

    test('uses short-SHA (first 8 chars) in the output filename', async () => {
      const longSha = 'b'.repeat(40);
      const { code, stdout } = await runScript({
        stdin: buildValidAudit(),
        env: { PR_HEAD_SHA: longSha },
        cwd: tmpdir,
      });
      expect(code).toBe(0);
      const payload = JSON.parse(stdout.trim());
      // Filename must include the 8-char prefix, NOT the full 40-char SHA.
      expect(payload.path).toContain('bbbbbbbb.md');
      expect(payload.path).not.toContain(longSha);
    });

    test('overwrites an existing audit for the same PR + SHA combination', async () => {
      const shortSha = VALID_PR_HEAD_SHA.slice(0, 8);
      const expectedPath = path.join(
        tmpdir,
        'memory', 'audits', 'listing-readiness',
        `PR-${VALID_PR_NUMBER}-${shortSha}.md`,
      );
      fs.writeFileSync(expectedPath, 'STALE CONTENT FROM PRIOR RUN');

      const content = buildValidAudit();
      const { code } = await runScript({ stdin: content, cwd: tmpdir });
      expect(code).toBe(0);
      expect(fs.readFileSync(expectedPath, 'utf8')).toBe(content);
    });
  });
});
