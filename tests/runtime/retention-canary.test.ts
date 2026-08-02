/// <reference types="jest" />
/**
 * FIRST-PRODUCTION CANARY for the retention cleanups.
 *
 * Merging PR #593 arms a nightly job that MUTATES production data. Without a
 * canary the very first execution would delete up to 10,000 audit rows and
 * clear up to 10,000 media-tombstone payloads before anyone had seen a single
 * production result. Bounded is not the same as small.
 *
 * The contract these tests pin:
 *   - env UNSET  -> 100 rows (safe by construction, no action required)
 *   - env SET    -> that value, so the operator can widen after review
 *   - env ABSURD -> clamped to the reviewed maximum, so a typo cannot
 *                   escalate beyond what was approved
 *   - env JUNK   -> falls back to the canary, never to the maximum
 */
import {
  RETENTION_CANARY_MAX_ROWS,
  resolveRetentionCap,
} from '../../lib/retention/retention-canary';
import { DIAGNOSTIC_MAX_PER_INVOCATION } from '../../lib/retention/system-diagnostic-cleanup';
import { MEDIA_TOMBSTONE_MAX_PER_INVOCATION } from '../../lib/retention/media-tombstone-compaction';

const ENV = 'RETENTION_TEST_MAX_ROWS';
const REVIEWED_MAX = 10_000;

describe('retention canary ceiling', () => {
  afterEach(() => {
    delete process.env[ENV];
  });

  it('defaults to a 100-row canary when the env var is unset', () => {
    expect(RETENTION_CANARY_MAX_ROWS).toBe(100);
    expect(resolveRetentionCap(ENV, REVIEWED_MAX)).toBe(100);
  });

  it('lets the operator widen it after reviewing the first run', () => {
    process.env[ENV] = '10000';
    expect(resolveRetentionCap(ENV, REVIEWED_MAX)).toBe(10_000);
  });

  it('CLAMPS to the reviewed maximum — a typo cannot escalate', () => {
    process.env[ENV] = '100000000';
    expect(resolveRetentionCap(ENV, REVIEWED_MAX)).toBe(REVIEWED_MAX);
  });

  it.each([
    ['non-numeric', 'lots'],
    ['zero', '0'],
    ['negative', '-500'],
    ['fractional', '250.5'],
    ['empty', ''],
  ])('falls back to the canary on %s input, never to the maximum', (_label, value) => {
    process.env[ENV] = value;
    const got = resolveRetentionCap(ENV, REVIEWED_MAX);
    expect(got).toBe(RETENTION_CANARY_MAX_ROWS);
    expect(got).not.toBe(REVIEWED_MAX);
  });

  it('both cleanups are wired to the canary, not straight to their maximum', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (rel: string) =>
      fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8') as string;

    const diag = read('lib/retention/system-diagnostic-cleanup.ts');
    const tomb = read('lib/retention/media-tombstone-compaction.ts');

    expect(diag).toMatch(
      /resolveRetentionCap\('RETENTION_DIAGNOSTIC_MAX_ROWS', DIAGNOSTIC_MAX_PER_INVOCATION\)/,
    );
    expect(tomb).toMatch(
      /resolveRetentionCap\('RETENTION_TOMBSTONE_MAX_ROWS', MEDIA_TOMBSTONE_MAX_PER_INVOCATION\)/,
    );
    // Neither may fall back to its module maximum directly — that would
    // reintroduce the unconstrained first run.
    expect(diag).not.toMatch(/maxRows = options\.maxRows \?\? DIAGNOSTIC_MAX_PER_INVOCATION/);
    expect(tomb).not.toMatch(/maxRows = options\.maxRows \?\? MEDIA_TOMBSTONE_MAX_PER_INVOCATION/);
  });

  it('the reviewed maxima are unchanged at 10,000 each', () => {
    // The canary constrains the FIRST run; it must not silently lower the
    // steady-state ceiling the compliance review approved.
    expect(DIAGNOSTIC_MAX_PER_INVOCATION).toBe(10_000);
    expect(MEDIA_TOMBSTONE_MAX_PER_INVOCATION).toBe(10_000);
  });
});
