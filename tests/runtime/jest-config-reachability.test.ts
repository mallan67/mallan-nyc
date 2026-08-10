/**
 * EVERY jest.config.js must be a root Jest project, or CI never runs it.
 *
 * WHY THIS EXISTS
 * ---------------
 * `.github/workflows/pr-check.yml:135` runs exactly one test command:
 *
 *     npx jest --ci --forceExit
 *
 * i.e. ROOT Jest. A per-directory `jest.config.js` that is absent from the root
 * `projects` list is therefore outside CI — even when an npm script exists for
 * it, because CI does not invoke those scripts.
 *
 * This has now bitten three times:
 *   - lib/media  — documented in jest.config.js itself ("the per-directory
 *     jest.config.js existed but was previously NOT wired into the root
 *     projects list ... orphaned from CI")
 *   - lib/crm    — fee-disclosure + growth-tools were running nowhere (2026-08-07)
 *   - a full audit (2026-08-07) then found EIGHT more configs holding 415
 *     passing tests CI never executed, including lib/scanner's 323 Fair Housing
 *     scanner tests and lib/geo's 67.
 *
 * A silently unreachable compliance suite is worse than a missing one: it reads
 * as coverage on the dashboard while proving nothing. This test makes the next
 * occurrence fail loudly at the moment the config is added.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = ['node_modules', '.next', '.git', 'archive'];

/** Every jest.config.* in the repo, excluding the root aggregator itself. */
function findJestConfigs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findJestConfigs(full, out);
    } else if (/^jest\.config\.(js|ts|cjs|mjs)$/.test(entry.name)) {
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (rel !== 'jest.config.js') out.push(rel);
    }
  }
  return out;
}

const rootConfigSrc = fs.readFileSync(path.join(ROOT, 'jest.config.js'), 'utf8');
const configs = findJestConfigs(ROOT);

describe('jest config reachability', () => {
  it('finds the per-directory configs at all (guards against a broken scan)', () => {
    expect(configs.length).toBeGreaterThan(5);
  });

  it.each(configs)('%s is registered as a root Jest project', (cfg) => {
    // The root config lists projects as '<rootDir>/lib/foo/jest.config.js'.
    expect(rootConfigSrc).toContain(cfg);
  });

  it('CI still runs root Jest — the assumption this test depends on', () => {
    const wf = fs.readFileSync(
      path.join(ROOT, '.github/workflows/pr-check.yml'),
      'utf8',
    );
    expect(wf).toMatch(/npx jest --ci/);
  });

  it('no per-directory config is left out of the root projects list', () => {
    const missing = configs.filter((c) => !rootConfigSrc.includes(c));
    expect(missing).toEqual([]);
  });
});
