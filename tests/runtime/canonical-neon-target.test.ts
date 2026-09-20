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

// The three describe blocks that used to follow here tested
// scripts/ci/assert-canonical-neon-target.mjs: the CLI guard itself, CLI-to-TS behavioural
// parity, and constant drift between the two. That CLI existed solely to run inside
// .github/workflows/rotate-db-keys.yml before dependency install. Both the workflow and the
// CLI were DELETED, so there is no second implementation left to hold to parity. The TS
// module above is now the only implementation, and scripts/recover-stale-property-listings.ts
// is its surviving consumer.
