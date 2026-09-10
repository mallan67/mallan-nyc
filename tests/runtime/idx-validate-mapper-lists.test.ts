/**
 * scripts/idx-validate.js must read the mapper's field lists in their compile-checked form.
 *
 * Regression (2026-09-08): lib/idx/trestle-mapper.ts wraps every B<n> list in
 * `cotalityFields('Property', [...])` so the compiler proves each name live. The validator's
 * extractor only matched the bare `const B1_ADDRESS = [...]` form, so it read ZERO mapper fields and
 * reported 17 "Search-critical Property field is missing from mapper" criticals plus a false
 * "$select Field Completeness" failure — a validator regression, not a mapper one.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('idx:validate reads the compile-checked mapper lists', () => {
  const run = spawnSync('node', ['scripts/idx-validate.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (run.stdout + '\n' + run.stderr).replace(/\x1b\[[0-9;]*m/g, '');

  it('reports no search-critical Property field as missing from the mapper', () => {
    expect(out).not.toContain('Search-critical Property field is missing from mapper');
  });

  it('section 1 ($select completeness) has zero failures', () => {
    const line = out.split('\n').find((l) => /\[\s*1\/\d+\]\s*\$select Field Completeness/.test(l)) || '';
    expect(line).toMatch(/\s0✗/);
  });

  it('the secrets scan does not mistake the generated contract’s sha256 fingerprints for API keys', () => {
    // lib/cotality/generated/contract.ts carries metadata/content sha256 digests (64 lowercase hex).
    // A digest is not a key; the 40+-char base64 heuristic must skip pure-hex sha256 values.
    expect(out).not.toMatch(/lib\/cotality\/generated\/contract\.ts: Potential hardcoded API key/);
  });

  it('idx:validate is at the CLAUDE.md baseline — 0 critical', () => {
    const total = out.split('\n').find((l) => /^\s*TOTAL:/.test(l)) || '';
    expect(total).toMatch(/\s0 critical/);
  });

  it('the report actually arrives — the run is not truncated in the pipe', () => {
    // This assertion failed on Linux CI with Received: "" while passing on Windows, and the reason
    // was NOT that the script stopped early. It printed TOTAL and exited 0 every time; the bytes
    // were lost in transport.
    //
    // scripts/idx-validate.js emits ~52 KB in one burst at the end, ~1,380 console.log calls. On
    // POSIX a process.stdout backed by a PIPE is a non-blocking socket: once a write cannot complete
    // inline the rest queue in libuv, and process.exit() tears the process down without draining
    // them. The cut landed at a different byte every run (measured: 10,595 / 16,797 / 36,280 /
    // 49,611 of 52,270). Windows pipes are synchronous, so the queue is always empty at exit and the
    // bug cannot be reproduced there.
    //
    // Fixed by replacing process.exit() with process.exitCode at scripts/idx-validate.js.
    expect(out).toMatch(/^\s*TOTAL:/m);
    expect(out).toMatch(/^Final:/m);
  });

  it('scripts/idx-validate.js does not terminate with process.exit(), which discards piped output', () => {
    // A source assertion, deliberately, and here is exactly what it is worth: it pins the construct
    // that caused the data loss so it cannot be "restored" by a later edit. It does NOT prove the
    // POSIX flush behaviour — that is unprovable on Windows and is proven by CI going green.
    // Comments are stripped first so the explanation above cannot be mistaken for the defect.
    const src = readFileSync(path.join(ROOT, 'scripts/idx-validate.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/\bprocess\.exit\s*\(/);
    expect(src).toMatch(/process\.exitCode\s*=/);
  });
});
