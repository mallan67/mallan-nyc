/**
 * DEFECT A — external-state failures must be distinguishable.
 *
 * Production shows 4/4 preflights returning `external_state_unavailable` and
 * 0 skip_neon events, so the CPU-saving preflight delivers nothing. That single
 * reason cannot tell us WHICH failure is happening, and the four subtypes have
 * completely different remediations:
 *
 *   redis_client_missing        env vars absent or mis-scoped   -> env fix
 *   redis_read_failed           client exists, call threw       -> endpoint/auth/DNS
 *   state_missing_or_invalid    read succeeded, nothing stored  -> normal cold start
 *   redis_write_failed          POST-cycle persist failed       -> looks healthy but never skips
 *
 * The last is the subtle one: it happens after the Neon cycle, so it must never
 * be reported as a decision reason — but swallowed silently it is
 * indistinguishable from a machine that simply never has anything to skip.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'lib/idx/one-cycle-preflight.ts'), 'utf8');

describe('decision-time subtypes are distinguishable', () => {
  it('a missing client reports redis_client_missing, not the generic reason', () => {
    const block = SRC.slice(SRC.indexOf('if (!redis) {'), SRC.indexOf('let priorState'));
    expect(block).toContain("reason: 'redis_client_missing'");
    expect(block).not.toContain("reason: 'external_state_unavailable'");
  });

  it('a throwing read reports redis_read_failed and logs the error NAME only', () => {
    const i = SRC.indexOf('external state read failed');
    expect(i).toBeGreaterThan(-1);
    const block = SRC.slice(i, i + 400);
    expect(block).toContain("reason: 'redis_read_failed'");
    // Error name only — never the message, which can carry a URL or token.
    expect(block).toContain('err.name');
    expect(block).not.toMatch(/err\.message/);
  });

  it('state_missing_or_invalid remains a distinct, already-modelled reason', () => {
    expect(SRC).toContain("| 'state_missing_or_invalid'");
  });

  it('no secret is ever logged from these paths', () => {
    for (const forbidden of ['UPSTASH_REDIS_REST_TOKEN', 'process.env.UPSTASH_REDIS_REST_URL,']) {
      expect(SRC).not.toContain(forbidden);
    }
  });
});

describe('the post-cycle write is instrumented, not swallowed', () => {
  it('finalize returns an outcome instead of void', () => {
    expect(SRC).toContain('Promise<OneCycleFinalizeOutcome>');
    expect(SRC).toContain("return 'redis_write_failed'");
    expect(SRC).toContain("return 'ok'");
  });

  it('redis_write_failed is NOT a decision reason — the unions stay separate', () => {
    const decisionUnion = SRC.slice(SRC.indexOf('export interface OneCyclePreflightDecision'), SRC.indexOf('snapshot: SourceSnapshot | null;'));
    expect(decisionUnion).not.toContain('redis_write_failed');
    expect(SRC).toContain('export type OneCycleFinalizeOutcome');
  });

  it('a missing client and a failed write are separable at finalize', () => {
    const fin = SRC.slice(SRC.indexOf('Promise<OneCycleFinalizeOutcome>'));
    expect(fin).toContain("return 'redis_client_missing'");
    expect(fin).toContain("return 'no_snapshot'");
  });
});

describe('uncertainty still fails OPEN', () => {
  it('every external-state failure path still runs the full cycle', () => {
    // shouldRun: true must accompany each failure reason — a broken cache must
    // never be read as "nothing to do".
    for (const reason of ['redis_client_missing', 'redis_read_failed']) {
      const i = SRC.indexOf(`reason: '${reason}'`);
      expect(i).toBeGreaterThan(-1);
      expect(SRC.slice(i - 200, i)).toContain('shouldRun: true');
    }
  });
});

describe('route emits the finalize outcome as structured telemetry', () => {
  const ROUTE = fs.readFileSync(
    path.join(process.cwd(), 'app/api/cron/one-cycle-preflight/route.ts'),
    'utf8',
  );

  it('captures the finalize return value instead of discarding it', () => {
    expect(ROUTE).toMatch(/const outcome = await finalizeOneCyclePreflight\(/);
  });

  it('emits a queryable external_state_finalize event', () => {
    expect(ROUTE).toContain("event: 'external_state_finalize'");
    expect(ROUTE).toContain("tag: 'one_cycle_preflight'");
    expect(ROUTE).toContain('outcome,');
  });

  it('the non-finalizable path is structured too, not a bare warn', () => {
    expect(ROUTE).toContain("outcome: 'not_finalizable'");
  });

  it('carries the decision reason so skip-rate and write-failure correlate', () => {
    expect(ROUTE).toContain('decision_reason: decision.reason');
  });

  it('logs no secret or endpoint value', () => {
    expect(ROUTE).not.toMatch(/UPSTASH_REDIS_REST_(URL|TOKEN)/);
  });
});
