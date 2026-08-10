/**
 * RELEASE-TRUTH GUARD — every tracked test FILE must be reachable by root Jest.
 *
 * WHY THIS EXISTS SEPARATELY FROM jest-config-reachability
 * --------------------------------------------------------
 * `jest-config-reachability.test.ts` proves every per-directory `jest.config.*`
 * is registered in the root `projects` list. That is necessary but NOT
 * sufficient: it says nothing about a test file living in a directory that no
 * registered project SELECTS.
 *
 * That gap has now bitten three times in this workstream — most recently a new
 * regression written under `lib/__tests__/`, a directory no project covers. It
 * reported "No tests found" and would have shipped as silent zero coverage.
 *
 * Adding `lib/__tests__` to some roots would fix ONE location and leave the trap
 * alive everywhere else. This instead enforces the invariant directly: resolve
 * each registered project's real selection rules and prove every tracked test
 * file is claimed by at least one of them.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(__dirname, '..', '..');

/** Repository Jest test-file conventions. */
const TEST_FILE_RE = /\.(test|spec)\.(js|jsx|ts|tsx)$/;

/**
 * The ONE documented exception class: Playwright end-to-end specs.
 *
 * These match the `*.spec.ts` convention but are owned by a different runner,
 * so being absent from Jest is correct, not a coverage hole.
 *
 * It is expressed as a VERIFIED class rather than a hardcoded file list: the
 * directory is read from `playwright.config.ts`, and each excluded file must
 * actually import `@playwright/test`. So a plain Jest test accidentally dropped
 * into `tests/e2e/` is still reported unreachable instead of being waved
 * through by its location.
 */
function playwrightTestDir(): string {
  const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
  const m = /testDir:\s*['"]\.?\/?([^'"]+)['"]/.exec(cfg);
  if (!m) throw new Error('playwright testDir not found — exception class unverifiable');
  return m[1].replace(/^\.\//, '').replace(/\/$/, '');
}

function isPlaywrightOwned(relFile: string, dir: string): boolean {
  if (!relFile.startsWith(`${dir}/`)) return false;
  const src = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  return /from\s+['"]@playwright\/test['"]/.test(src);
}

function trackedTestFiles(): string[] {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter((f) => f && TEST_FILE_RE.test(f))
    .map((f) => f.replace(/\\/g, '/'));
}

/**
 * Ask Jest itself which files it would run. This is the authoritative answer:
 * it reflects every registered project's roots, testMatch and ignore patterns
 * rather than re-implementing that resolution here (which is exactly how a
 * guard drifts from the thing it guards).
 */
function jestSelectedFiles(): Set<string> {
  const raw = execFileSync(
    'npx',
    ['jest', '--listTests', '--json', '--silent'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
  );
  const start = raw.indexOf('[');
  const files = JSON.parse(raw.slice(start)) as string[];
  return new Set(
    files.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')),
  );
}

describe('every tracked test file is reachable by root Jest', () => {
  const tracked = trackedTestFiles();
  const selected = jestSelectedFiles();
  const pwDir = playwrightTestDir();

  it('finds tracked test files at all (guards against a broken scan)', () => {
    expect(tracked.length).toBeGreaterThan(300);
    expect(selected.size).toBeGreaterThan(300);
  });

  it('ZERO tracked test files are unreachable', () => {
    const unreachable = tracked.filter(
      (f) => !selected.has(f) && !isPlaywrightOwned(f, pwDir),
    );
    // Named, not just counted — a bare count tells nobody what to fix.
    expect(unreachable).toEqual([]);
  });

  it('known-good locations are genuinely selected', () => {
    // If these ever stop matching, the guard itself has broken and the
    // "zero unreachable" result above would be vacuously true.
    const mustBeCovered = [
      /^tests\/runtime\/.*\.test\.ts$/,
      /^lib\/idx\/__tests__\/.*\.test\.ts$/,
      /^scripts\/__tests__\/.*\.test\.js$/,
    ];
    for (const re of mustBeCovered) {
      const sample = [...selected].filter((f) => re.test(f));
      expect(sample.length).toBeGreaterThan(0);
    }
  });

  it('DETECTS an orphan: a sentinel in an unregistered directory is unreachable', () => {
    // The guard must actually be capable of failing. `lib/__tests__/` is the
    // directory that silently swallowed a real regression — no registered
    // project selects it, so a file there must be reported unreachable.
    const sentinelDir = path.join(ROOT, 'lib', '__tests__');
    const sentinel = path.join(sentinelDir, 'orphan.test.ts');
    const dirExisted = fs.existsSync(sentinelDir);
    if (!dirExisted) fs.mkdirSync(sentinelDir, { recursive: true });
    fs.writeFileSync(sentinel, 'it("orphan", () => { expect(1).toBe(1); });\n');
    try {
      const afterSelected = jestSelectedFiles();
      expect(afterSelected.has('lib/__tests__/orphan.test.ts')).toBe(false);
    } finally {
      fs.unlinkSync(sentinel);
      if (!dirExisted) fs.rmdirSync(sentinelDir);
    }
  });

  it('the Playwright exception class is real, verified, and bounded', () => {
    // The class must actually apply to something, be owned by Playwright, and
    // never silently absorb a Jest test that merely lives in the same folder.
    const excluded = tracked.filter((f) => !selected.has(f));
    expect(excluded.length).toBeGreaterThan(0);
    for (const f of excluded) {
      expect(f.startsWith(pwDir + '/')).toBe(true);
      expect(isPlaywrightOwned(f, pwDir)).toBe(true);
    }
  });
});
