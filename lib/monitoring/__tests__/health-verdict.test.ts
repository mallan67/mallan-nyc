/**
 * COMMIT 10 — monitoring verdict algebra.
 *
 * THE INVARIANT: ABSENCE OF EVIDENCE IS NEVER `PASS`.
 *
 * The failure mode this exists to stop is a monitor that cannot reach a
 * subsystem, reports nothing, and is read as "fine". A missing credential, an
 * unauthed CLI or an unobserved subject must surface as UNAVAILABLE — a
 * first-class verdict — and must never be able to reach PASS or be silently
 * dropped from the report.
 *
 * The five subjects are deliberately separate: "the site answers HTTP" and "the
 * database is ready" are different questions with different remediations, and
 * collapsing them is how an outage gets mis-triaged.
 */

import {
  HEALTH_SUBJECTS,
  aggregateHealth,
  checkCredentials,
  type HealthCheck,
} from '../health-verdict';

const pass = (subject: HealthCheck['subject']): HealthCheck => ({
  subject,
  verdict: 'PASS',
  evidence: 'observed healthy',
});

describe('the five subjects are separately addressable', () => {
  it('names app liveness, DB readiness, provider, media proxy and R2 distinctly', () => {
    expect([...HEALTH_SUBJECTS].sort()).toEqual(
      ['app-liveness', 'db-readiness', 'media-proxy', 'provider', 'r2-mirror'].sort(),
    );
  });
});

describe('PASS is earned, never assumed', () => {
  it('is certifiable ONLY when every subject passed', () => {
    const report = aggregateHealth(HEALTH_SUBJECTS.map(pass));
    expect(report.verdict).toBe('PASS');
    expect(report.certifiable).toBe(true);
  });

  it('an EMPTY check list is NOT healthy — nothing observed is not "all fine"', () => {
    const report = aggregateHealth([]);
    expect(report.verdict).toBe('UNAVAILABLE');
    expect(report.certifiable).toBe(false);
  });

  it('a subject that was never checked at all blocks certification', () => {
    // Only app-liveness reported. The other four were not observed.
    const report = aggregateHealth([pass('app-liveness')]);
    expect(report.certifiable).toBe(false);
    expect(report.unobserved).toEqual(
      expect.arrayContaining(['db-readiness', 'provider', 'media-proxy', 'r2-mirror']),
    );
  });
});

describe('UNAVAILABLE can never become PASS', () => {
  it('one unavailable subject prevents PASS even when all others pass', () => {
    const checks = HEALTH_SUBJECTS.map(pass);
    checks[4] = { subject: 'r2-mirror', verdict: 'UNAVAILABLE', evidence: 'no credentials' };
    const report = aggregateHealth(checks);
    expect(report.verdict).not.toBe('PASS');
    expect(report.certifiable).toBe(false);
  });

  it('unavailable subjects stay ENUMERATED even when a degradation owns the headline', () => {
    // A known user-facing degradation is the more urgent headline, but the
    // unknown must not disappear behind it — that is how an unchecked subsystem
    // gets forgotten.
    const checks: HealthCheck[] = [
      pass('app-liveness'),
      pass('db-readiness'),
      { subject: 'provider', verdict: 'DEGRADED', evidence: 'partial feed' },
      pass('media-proxy'),
      { subject: 'r2-mirror', verdict: 'UNAVAILABLE', evidence: 'no credentials' },
    ];
    const report = aggregateHealth(checks);
    expect(report.verdict).toBe('DEGRADED');
    expect(report.unavailable).toEqual(['r2-mirror']);
    expect(report.certifiable).toBe(false);
  });
});

describe('headline precedence', () => {
  it('any FAIL outranks everything else', () => {
    const checks: HealthCheck[] = [
      { subject: 'app-liveness', verdict: 'FAIL', evidence: 'no HTTP' },
      { subject: 'db-readiness', verdict: 'UNAVAILABLE', evidence: 'unknown' },
      { subject: 'provider', verdict: 'DEGRADED', evidence: 'partial' },
      pass('media-proxy'),
      pass('r2-mirror'),
    ];
    expect(aggregateHealth(checks).verdict).toBe('FAIL');
  });

  it('with no FAIL and no DEGRADED, an unknown owns the headline', () => {
    const checks = HEALTH_SUBJECTS.map(pass);
    checks[1] = { subject: 'db-readiness', verdict: 'UNAVAILABLE', evidence: 'unknown' };
    expect(aggregateHealth(checks).verdict).toBe('UNAVAILABLE');
  });

  it('failed and degraded subjects are enumerated for triage', () => {
    const checks: HealthCheck[] = [
      pass('app-liveness'),
      { subject: 'db-readiness', verdict: 'FAIL', evidence: 'refused' },
      { subject: 'provider', verdict: 'DEGRADED', evidence: 'partial' },
      pass('media-proxy'),
      pass('r2-mirror'),
    ];
    const report = aggregateHealth(checks);
    expect(report.failed).toEqual(['db-readiness']);
    expect(report.degraded).toEqual(['provider']);
  });
});

describe('missing credentials produce UNAVAILABLE — never PASS, never FAIL', () => {
  it('a missing credential is UNAVAILABLE and names what is missing', () => {
    const check = checkCredentials('r2-mirror', ['R2_ACCESS_KEY_ID', 'R2_BUCKET'], {
      R2_ACCESS_KEY_ID: 'present',
    });
    expect(check?.verdict).toBe('UNAVAILABLE');
    expect(check?.evidence).toContain('R2_BUCKET');
  });

  it('a missing credential is NOT reported as a failure of the subsystem', () => {
    // We did not observe R2 breaking. We observed that we cannot look.
    const check = checkCredentials('r2-mirror', ['R2_BUCKET'], {});
    expect(check?.verdict).not.toBe('FAIL');
    expect(check?.verdict).not.toBe('DEGRADED');
  });

  it('NEVER prints the credential VALUE, only its name', () => {
    const secret = 'sk-live-do-not-print-me';
    const check = checkCredentials('r2-mirror', ['R2_BUCKET', 'R2_SECRET_ACCESS_KEY'], {
      R2_SECRET_ACCESS_KEY: secret,
    });
    expect(check?.evidence).not.toContain(secret);
  });

  it('an empty-string credential counts as ABSENT, not present', () => {
    const check = checkCredentials('db-readiness', ['DATABASE_URL'], { DATABASE_URL: '' });
    expect(check?.verdict).toBe('UNAVAILABLE');
  });

  it('whitespace-only credential counts as ABSENT', () => {
    const check = checkCredentials('db-readiness', ['DATABASE_URL'], { DATABASE_URL: '   ' });
    expect(check?.verdict).toBe('UNAVAILABLE');
  });

  it('returns null when every credential is present — the caller then does the REAL probe', () => {
    // Crucially it does NOT return PASS: having credentials proves nothing about
    // the subsystem's health, only that a probe is possible.
    const check = checkCredentials('db-readiness', ['DATABASE_URL'], { DATABASE_URL: 'postgres://x' });
    expect(check).toBeNull();
  });
});
