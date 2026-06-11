/// <reference types="jest" />
/**
 * Lane-D — R2 retry-backlog split: drift guard + pure-policy behavior
 * (RED→GREEN: module absent on main).
 *
 * The exhaustion threshold is deliberately duplicated in plain-CommonJS
 * scripts/r2-retry-health.js (ops-health.js cannot require the TS module).
 * This test BINDS the duplicate to the canonical lib/idx/media-sync constant —
 * change one without the other and this fails loudly.
 */

import { GHOST_ID_LOG_CAP as _anchor } from '@/lib/idx/media-sync'; // type-anchor import keeps TS path resolution honest
import { R2_RETRY_EXHAUSTED_THRESHOLD as CANONICAL } from '@/lib/idx/media-sync';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policy = require('../../scripts/r2-retry-health.js') as {
  R2_RETRY_EXHAUSTED_THRESHOLD: number;
  THRESHOLDS: { actionable_warn: number; actionable_critical: number; parked_warn: number; parked_critical: number };
  classifyR2RetryBacklog: (c: { actionable: number; parked: number }) => Array<{ level: string; msg: string }>;
};

describe('Lane-D — threshold drift guard', () => {
  it('scripts duplicate === canonical lib/idx/media-sync R2_RETRY_EXHAUSTED_THRESHOLD', () => {
    expect(policy.R2_RETRY_EXHAUSTED_THRESHOLD).toBe(CANONICAL);
  });
});

describe('Lane-D — classifyR2RetryBacklog policy', () => {
  it('production truth at RC3 settlement {44 actionable, 40 parked} → ZERO issues (the false warn dies)', () => {
    expect(policy.classifyR2RetryBacklog({ actionable: 44, parked: 40 })).toEqual([]);
  });

  it('actionable boundaries: 50 quiet · 51 warn · 500 critical', () => {
    expect(policy.classifyR2RetryBacklog({ actionable: 50, parked: 0 })).toEqual([]);
    expect(policy.classifyR2RetryBacklog({ actionable: 51, parked: 0 })).toMatchObject([{ level: 'warning' }]);
    expect(policy.classifyR2RetryBacklog({ actionable: 500, parked: 0 })).toMatchObject([{ level: 'critical' }]);
  });

  it('parked growth guard (fail-closed): 150 quiet · 151 warn · 1000 critical — mass parking still surfaces', () => {
    expect(policy.classifyR2RetryBacklog({ actionable: 0, parked: 150 })).toEqual([]);
    expect(policy.classifyR2RetryBacklog({ actionable: 0, parked: 151 })).toMatchObject([{ level: 'warning' }]);
    expect(policy.classifyR2RetryBacklog({ actionable: 0, parked: 1000 })).toMatchObject([{ level: 'critical' }]);
  });

  it('both elevated → both issues, independently', () => {
    const issues = policy.classifyR2RetryBacklog({ actionable: 600, parked: 1200 });
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.level === 'critical')).toBe(true);
  });
});
