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
    it('refuses a hostile host that merely MENTIONS the canonical endpoint', () => {
      // THE DEFECT this test was added to expose. `isCanonicalNeonHost` used
      // `uriOrHost.includes(CANONICAL)`, so any URL that carried the canonical endpoint id
      // ANYWHERE - a query parameter, the password, the path - vouched for a host that was not
      // canonical at all. drain-core.ts:33-38 had already written down exactly this hazard and
      // parsed the hostname instead; this module never got the same treatment, and it is the one
      // backing the neon-branch-prune route and recover-stale-property-listings.
      expect(
        isCanonicalNeonHost(
          'postgresql://u:p@evil.example.com:5432/db?application_name=ep-cold-waterfall-adno3ao2',
        ),
      ).toBe(false);
      expect(
        isCanonicalNeonHost(
          'postgresql://u:ep-cold-waterfall-adno3ao2@evil.example.com:5432/neondb',
        ),
      ).toBe(false);
      expect(
        isCanonicalNeonHost('postgresql://u:p@evil.example.com/ep-cold-waterfall-adno3ao2'),
      ).toBe(false);
    });

    it('refuses the canonical endpoint id served from a NON-Neon domain', () => {
      // The endpoint label alone is not identity - anyone can name a host's first label
      // `ep-cold-waterfall-adno3ao2`. The `.neon.tech` suffix is part of what makes it ours.
      expect(
        isCanonicalNeonHost('postgresql://u:p@ep-cold-waterfall-adno3ao2.attacker.example/db'),
      ).toBe(false);
    });

    it('still accepts a BARE hostname, not only a URI (legacy calling convention)', () => {
      // Load-bearing: the parameter is named `uriOrHost` and callers pass both shapes. A parsed
      // rewrite that only understood full URIs would silently start refusing every bare host.
      expect(isCanonicalNeonHost('ep-cold-waterfall-adno3ao2.us-east-1.aws.neon.tech')).toBe(true);
      expect(
        isCanonicalNeonHost('ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech'),
      ).toBe(true);
    });

    it('accepts the pooled canonical variant inside a URI', () => {
      expect(
        isCanonicalNeonHost(
          'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb',
        ),
      ).toBe(true);
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

describe('CLI ↔ TS parity — the pre-bootstrap mirror may not hold a different opinion', () => {
  const SCRIPT = path.join(process.cwd(), 'scripts', 'ci', 'assert-canonical-neon-target.mjs');
  const runHost = (uri: string) =>
    spawnSync('node', [SCRIPT, '--host', uri], { cwd: process.cwd(), encoding: 'utf-8' });

  /**
   * WHY THIS BLOCK EXISTS. The standalone CLI runs in `rotate-db-keys.yml` BEFORE any dependency
   * install, so it cannot import lib/ops/db-target.ts and has to carry its own copy of the host
   * rule. That is a legitimate constraint — but it is not a licence to hold a DIFFERENT rule.
   *
   * It held one. While the TypeScript guard was corrected to compare parsed hostnames, the CLI
   * still ran `uri.includes(CANONICAL_HOST)`, so:
   *
   *   node scripts/ci/assert-canonical-neon-target.mjs --host \
   *     'postgresql://u:p@evil.example.com:5432/db?application_name=ep-cold-waterfall-adno3ao2'
   *   => OK — target host is the canonical production host.   EXIT 0
   *
   * That CLI is not decorative and not dormant. rotate-db-keys.yml is manual-only
   * (`workflow_dispatch`) rather than disabled, and this guard is the preflight that gates the
   * Neon role password reset, the `gh secret set DATABASE_URL` writes, the Vercel production
   * environment writes, and the production redeploy that follows them. A host that slips past it
   * gets written into production credentials.
   *
   * So every case below asserts BOTH sides and asserts they AGREE. Testing the CLI alone would let
   * the two drift apart again in the other direction.
   */
  const CASES: Array<{ what: string; uri: string; canonical: boolean }> = [
    {
      what: 'canonical direct URI',
      uri: 'postgresql://u:p@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
      canonical: true,
    },
    {
      what: 'canonical pooled URI',
      uri: 'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb',
      canonical: true,
    },
    { what: 'stale direct URI', uri: ROYAL_DAWN_URI, canonical: false },
    {
      what: 'stale pooled URI',
      uri: 'postgresql://u:p@ep-royal-dawn-ad6eh8t2-pooler.us-east-1.aws.neon.tech/neondb',
      canonical: false,
    },
    {
      what: 'canonical id ONLY in a query parameter',
      uri: 'postgresql://u:p@evil.example.com:5432/db?application_name=ep-cold-waterfall-adno3ao2',
      canonical: false,
    },
    {
      what: 'canonical id ONLY in the password',
      uri: 'postgresql://u:ep-cold-waterfall-adno3ao2@evil.example.com:5432/neondb',
      canonical: false,
    },
    {
      what: 'canonical id ONLY in the path',
      uri: 'postgresql://u:p@evil.example.com:5432/ep-cold-waterfall-adno3ao2',
      canonical: false,
    },
    {
      what: 'canonical endpoint label on a NON-Neon domain',
      uri: 'postgresql://u:p@ep-cold-waterfall-adno3ao2.attacker.example/neondb',
      canonical: false,
    },
    { what: 'malformed URI', uri: 'not a url at all', canonical: false },
    { what: 'unrelated Postgres host', uri: 'postgresql://u:p@db.example.com:5432/app', canonical: false },
  ];

  it.each(CASES)('CLI: $what (canonical=$canonical)', ({ uri, canonical }) => {
    expect(runHost(uri).status).toBe(canonical ? 0 : 1);
  });

  it.each(CASES)('TS guard agrees on $what', ({ uri, canonical }) => {
    expect(isCanonicalNeonHost(uri)).toBe(canonical);
  });

  it('the CLI and the TS guard agree on EVERY case (no divergent interpretation)', () => {
    const divergent = CASES.filter(
      ({ uri }) => (runHost(uri).status === 0) !== isCanonicalNeonHost(uri),
    );
    expect(divergent.map((c) => c.what)).toEqual([]);
  });

  it('no args still fails closed', () => {
    expect(spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf-8' }).status).toBe(1);
  });

  it('never prints the supplied URI, for any case', () => {
    // A connection URI carries credentials, and GitHub Actions logs are retained.
    for (const { uri } of CASES) {
      const r = runHost(uri);
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      expect(out).not.toContain(uri);
      expect(out).not.toContain('u:p@');
    }
  });

  it('the CLI host check is not a substring test', () => {
    // Source-level regression guard on the SHAPE, so the defect cannot return in a form the
    // behavioural cases above happen not to cover.
    const src = fs.readFileSync(SCRIPT, 'utf-8');
    expect(src).toMatch(/new URL\(/);
    expect(src).not.toMatch(/return\s+uri\.includes\(\s*CANONICAL_HOST\s*\)/);
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
