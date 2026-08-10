/**
 * MONITORING VERDICT ALGEBRA — the one place a health result is interpreted.
 *
 * THE INVARIANT: ABSENCE OF EVIDENCE IS NEVER `PASS`.
 *
 * A monitor that cannot reach a subsystem has learned nothing about it. The
 * dangerous outcome is not a red dashboard — it is a green one produced by a
 * probe that silently did not run: an expired token, an unauthed CLI, a missing
 * bucket name. `UNAVAILABLE` is therefore a first-class verdict rather than an
 * error to swallow, it can never be promoted to `PASS`, and it is always
 * enumerated in the report even when a louder problem owns the headline.
 *
 * WHY FIVE SEPARATE SUBJECTS
 * --------------------------
 * "The site answers HTTP" and "the database is ready" are different questions
 * with different remediations and different blast radii. Collapsing them into a
 * single "healthy" bit is how an outage gets mis-triaged: the app can serve
 * perfectly while the provider feed is stale, and R2 can be entirely unmirrored
 * while every page still renders through the proxy.
 *
 *   app-liveness  the runtime is serving HTTP at all
 *   db-readiness  Neon is reachable and answering
 *   provider      the Cotality/Trestle feed is current
 *   media-proxy   listing imagery is actually being delivered
 *   r2-mirror     durable mirroring is keeping up
 *
 * `/api/health` deliberately remains a zero-DB liveness probe and must NOT be
 * turned into a database query — it answers `app-liveness` ONLY. Conflating it
 * with `db-readiness` would both burn Neon compute on every uptime poll and
 * destroy the distinction that makes triage possible.
 *
 * PURE — no I/O, no Prisma, no network. Callers perform probes; this decides
 * what the results MEAN.
 */

/** The independently-addressable subjects. Order is stable for reporting. */
export const HEALTH_SUBJECTS = [
  'app-liveness',
  'db-readiness',
  'provider',
  'media-proxy',
  'r2-mirror',
] as const;

export type HealthSubject = (typeof HEALTH_SUBJECTS)[number];

/**
 * PASS        observed, and healthy
 * DEGRADED    observed, and partially impaired — bounded, known impact
 * FAIL        observed, and broken
 * UNAVAILABLE NOT OBSERVED — unbounded uncertainty. Never a synonym for healthy.
 */
export type HealthVerdict = 'PASS' | 'DEGRADED' | 'FAIL' | 'UNAVAILABLE';

export interface HealthCheck {
  subject: HealthSubject;
  verdict: HealthVerdict;
  /** Human-readable proof. MUST name credentials, never print their values. */
  evidence: string;
}

export interface HealthReport {
  /** Headline verdict. See the precedence note below. */
  verdict: HealthVerdict;
  /** TRUE only when every subject was observed AND every one passed. */
  certifiable: boolean;
  failed: HealthSubject[];
  degraded: HealthSubject[];
  /** Subjects explicitly reported as unobservable. */
  unavailable: HealthSubject[];
  /** Subjects for which no check was supplied at all. */
  unobserved: HealthSubject[];
}

/**
 * Collapse per-subject checks into one report.
 *
 * HEADLINE PRECEDENCE: `FAIL` > `DEGRADED` > `UNAVAILABLE` > `PASS`.
 *
 * DEGRADED deliberately outranks UNAVAILABLE in the HEADLINE ONLY: a known,
 * live, user-facing impairment is what an on-call operator must see first. That
 * ordering is safe precisely because it cannot hide anything — `unavailable`
 * and `unobserved` are always populated, and `certifiable` is false whenever
 * either is non-empty. The headline chooses what to shout, never what to omit.
 *
 * An EMPTY check list yields UNAVAILABLE, not PASS: having observed nothing is
 * not the same as having found nothing wrong.
 */
export function aggregateHealth(checks: readonly HealthCheck[]): HealthReport {
  const seen = new Map<HealthSubject, HealthVerdict[]>();
  for (const check of checks) {
    const existing = seen.get(check.subject);
    if (existing) existing.push(check.verdict);
    else seen.set(check.subject, [check.verdict]);
  }

  const withVerdict = (want: HealthVerdict): HealthSubject[] =>
    HEALTH_SUBJECTS.filter((s) => (seen.get(s) ?? []).includes(want));

  const failed = withVerdict('FAIL');
  const degraded = withVerdict('DEGRADED');
  const unavailable = withVerdict('UNAVAILABLE');
  const unobserved = HEALTH_SUBJECTS.filter((s) => !seen.has(s));

  const verdict: HealthVerdict = failed.length
    ? 'FAIL'
    : degraded.length
      ? 'DEGRADED'
      : unavailable.length || unobserved.length
        ? 'UNAVAILABLE'
        : 'PASS';

  return {
    verdict,
    certifiable: verdict === 'PASS',
    failed: [...failed],
    degraded: [...degraded],
    unavailable: [...unavailable],
    unobserved: [...unobserved],
  };
}

/** A credential is ABSENT unless it is a non-blank string. */
function isAbsent(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * Gate a probe on the credentials it needs.
 *
 * Returns an `UNAVAILABLE` check when anything required is absent — NOT `FAIL`.
 * We did not observe the subsystem breaking; we observed that we cannot look,
 * and reporting a missing bucket name as an R2 outage would send an operator
 * chasing an incident that is not happening.
 *
 * Returns `null` when every credential is present, so the caller proceeds to the
 * REAL probe. It deliberately never returns `PASS`: possessing credentials is
 * evidence about the environment, not about the subsystem's health.
 *
 * Only credential NAMES ever reach `evidence`. Values are never read into it.
 */
export function checkCredentials(
  subject: HealthSubject,
  required: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): HealthCheck | null {
  const missing = required.filter((name) => isAbsent(env[name]));
  if (missing.length === 0) return null;
  return {
    subject,
    verdict: 'UNAVAILABLE',
    evidence: `cannot probe — credential(s) absent: ${missing.join(', ')}`,
  };
}
