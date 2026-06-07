/// <reference types="jest" />
/**
 * Phase 0.5 — canonical Neon production-target guard tests.
 *
 * Proves (a) the shared TS guard refuses wrong project/host and allows the
 * canonical one, (b) the standalone CLI guard used by the rotate-db-keys
 * workflow refuses/allows with the right exit codes (so the workflow fails
 * closed BEFORE any mutation), and (c) the CLI constants stay in sync with the
 * TS module (no silent drift between the two definitions).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  CANONICAL_NEON_PROJECT_ID,
  CANONICAL_NEON_HOST_SUBSTRING,
  isCanonicalNeonProject,
  isCanonicalNeonHost,
  assertCanonicalNeonProject,
  assertCanonicalNeonHost,
} from '@/lib/ops/canonical-neon-target';

const CANONICAL_URI = `postgresql://u:p@ep-cold-waterfall-adno3ao2.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const ROYAL_DAWN_URI = `postgresql://u:p@ep-royal-dawn-ad6eh8t2.us-east-1.aws.neon.tech/neondb?sslmode=require`;

describe('canonical-neon-target (TS module)', () => {
  describe('isCanonicalNeonProject — strict allow-list, fail-closed', () => {
    it('accepts ONLY the canonical project (trimmed)', () => {
      expect(isCanonicalNeonProject('hidden-mountain-87248164')).toBe(true);
      expect(isCanonicalNeonProject('  hidden-mountain-87248164  ')).toBe(true);
    });
    it('refuses the stale morning-bread, any other id, empty, and null', () => {
      expect(isCanonicalNeonProject('morning-bread-68708332')).toBe(false);
      expect(isCanonicalNeonProject('some-other-project')).toBe(false);
      expect(isCanonicalNeonProject('')).toBe(false);
      expect(isCanonicalNeonProject('   ')).toBe(false);
      expect(isCanonicalNeonProject(null)).toBe(false);
      expect(isCanonicalNeonProject(undefined)).toBe(false);
    });
  });

  describe('isCanonicalNeonHost — requires cold-waterfall, refuses royal-dawn', () => {
    it('accepts a URI containing the canonical host', () => {
      expect(isCanonicalNeonHost(CANONICAL_URI)).toBe(true);
    });
    it('refuses royal-dawn even if otherwise URI-shaped, empty, and null', () => {
      expect(isCanonicalNeonHost(ROYAL_DAWN_URI)).toBe(false);
      expect(isCanonicalNeonHost('postgresql://u:p@some-host/neondb')).toBe(false);
      expect(isCanonicalNeonHost('')).toBe(false);
      expect(isCanonicalNeonHost(null)).toBe(false);
      expect(isCanonicalNeonHost(undefined)).toBe(false);
    });
    it('refuses a URI that contains BOTH substrings (forbidden wins)', () => {
      expect(isCanonicalNeonHost(`${CANONICAL_URI}#${ROYAL_DAWN_URI}`)).toBe(false);
    });
  });

  describe('assert* throws on refusal, passes on canonical', () => {
    it('assertCanonicalNeonProject', () => {
      expect(() => assertCanonicalNeonProject('morning-bread-68708332')).toThrow();
      expect(() => assertCanonicalNeonProject('hidden-mountain-87248164')).not.toThrow();
    });
    it('assertCanonicalNeonHost does NOT leak the URI in the error', () => {
      let msg = '';
      try {
        assertCanonicalNeonHost(ROYAL_DAWN_URI);
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      expect(msg).toContain(CANONICAL_NEON_HOST_SUBSTRING);
      expect(msg).not.toContain('ep-royal-dawn-ad6eh8t2');
      expect(() => assertCanonicalNeonHost(CANONICAL_URI)).not.toThrow();
    });
  });
});

describe('assert-canonical-neon-target.mjs (workflow CLI guard)', () => {
  const SCRIPT = path.join(process.cwd(), 'scripts', 'ci', 'assert-canonical-neon-target.mjs');
  const run = (args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: process.cwd(), encoding: 'utf-8' });

  it('exists', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('--project canonical → exit 0', () => {
    expect(run(['--project', 'hidden-mountain-87248164']).status).toBe(0);
  });
  it('--project stale morning-bread → exit 1 (refuse)', () => {
    expect(run(['--project', 'morning-bread-68708332']).status).toBe(1);
  });
  it('--project other → exit 1 (refuse)', () => {
    expect(run(['--project', 'whatever-123']).status).toBe(1);
  });
  it('--host canonical → exit 0', () => {
    expect(run(['--host', CANONICAL_URI]).status).toBe(0);
  });
  it('--host royal-dawn → exit 1 (refuse)', () => {
    expect(run(['--host', ROYAL_DAWN_URI]).status).toBe(1);
  });
  it('no args → exit 1 (fail-closed)', () => {
    expect(run([]).status).toBe(1);
  });
  it('never prints the supplied host (no credential leak)', () => {
    const r = run(['--host', ROYAL_DAWN_URI]);
    expect(`${r.stdout}${r.stderr}`).not.toContain('ep-royal-dawn-ad6eh8t2');
  });
});

describe('CLI constants stay in sync with the TS module (no drift)', () => {
  it('the .mjs hardcodes the same canonical project + host', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'ci', 'assert-canonical-neon-target.mjs'),
      'utf-8',
    );
    expect(src).toContain(CANONICAL_NEON_PROJECT_ID);
    expect(src).toContain(CANONICAL_NEON_HOST_SUBSTRING);
  });
});
