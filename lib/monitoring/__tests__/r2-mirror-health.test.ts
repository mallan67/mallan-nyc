/**
 * COMMIT 10 — the `r2-mirror` subject.
 *
 * This is where commit 9 and commit 10 must agree. `r2_attempts = 9` is a
 * DELIBERATE POLICY EXCLUSION, not a failure. A monitor that counts sentinels
 * as broken assets pages an operator at 3am for rows the system intentionally
 * chose not to mirror — and, worse, trains everyone to ignore the alert.
 *
 * Mirror health is derived from observed `listing_media` state. Object-level
 * verification against the bucket is a DIFFERENT probe that this does not claim
 * to perform.
 */

import {
  r2MirrorHealth,
  R2_MIRROR_FAIL_RATIO,
} from '../r2-mirror-health';
import { R2_POLICY_PARKED_ATTEMPTS, R2_RETRY_EXHAUSTED_THRESHOLD } from '@/lib/idx/media-sync';

const mirrored = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ r2_key: `photos/${i}.jpg`, r2_attempts: 0 }));
const policyExcluded = (n: number) =>
  Array.from({ length: n }, () => ({ r2_attempts: R2_POLICY_PARKED_ATTEMPTS }));
const exhausted = (n: number) =>
  Array.from({ length: n }, () => ({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD }));
const retrying = (n: number) => Array.from({ length: n }, () => ({ r2_attempts: 2 }));

describe('absence of evidence is never PASS', () => {
  it('unobserved rows are UNAVAILABLE, not PASS', () => {
    const check = r2MirrorHealth(null);
    expect(check.verdict).toBe('UNAVAILABLE');
    expect(check.subject).toBe('r2-mirror');
  });

  it('observing ZERO rows is UNAVAILABLE, not a clean bill of health', () => {
    // A media table that returns nothing is a broken observation, not proof
    // that every asset is mirrored.
    expect(r2MirrorHealth([]).verdict).toBe('UNAVAILABLE');
  });
});

describe('a policy exclusion is not a mirror failure', () => {
  it('policy-excluded rows never drive the verdict toward FAIL — even in bulk', () => {
    // 500 rows the system deliberately declined to mirror. Nothing is broken.
    const check = r2MirrorHealth([...mirrored(10), ...policyExcluded(500)]);
    expect(check.verdict).toBe('PASS');
  });

  it('rows that are ALL policy-excluded are PASS — nothing was owed', () => {
    const check = r2MirrorHealth(policyExcluded(50));
    expect(check.verdict).toBe('PASS');
    expect(check.evidence).toMatch(/0 eligible/i);
  });

  it('the sentinel is excluded from the denominator, so it cannot mask a real failure rate', () => {
    // 1 exhausted out of 2 ELIGIBLE = 50%, despite 98 policy-excluded rows that
    // would dilute the ratio to 1% if wrongly counted as eligible.
    const check = r2MirrorHealth([...mirrored(1), ...exhausted(1), ...policyExcluded(98)]);
    expect(check.verdict).toBe('FAIL');
  });
});

describe('real failures are surfaced', () => {
  it('fully mirrored is PASS', () => {
    expect(r2MirrorHealth(mirrored(100)).verdict).toBe('PASS');
  });

  it('in-flight retries are not failures', () => {
    expect(r2MirrorHealth([...mirrored(90), ...retrying(10)]).verdict).toBe('PASS');
  });

  it('a few genuinely exhausted rows are DEGRADED, not FAIL', () => {
    // 1 exhausted / 1000 eligible = 0.1%, under the systemic threshold.
    const check = r2MirrorHealth([...mirrored(999), ...exhausted(1)]);
    expect(check.verdict).toBe('DEGRADED');
    expect(R2_MIRROR_FAIL_RATIO).toBeGreaterThan(0.001);
  });

  it('exhaustion above the systemic threshold is FAIL', () => {
    const check = r2MirrorHealth([...mirrored(50), ...exhausted(50)]);
    expect(check.verdict).toBe('FAIL');
  });

  it('evidence reports the counts an operator needs, without inventing any', () => {
    const check = r2MirrorHealth([...mirrored(8), ...exhausted(2), ...policyExcluded(5)]);
    expect(check.evidence).toContain('2');
    expect(check.evidence).toMatch(/polic/i);
  });
});
