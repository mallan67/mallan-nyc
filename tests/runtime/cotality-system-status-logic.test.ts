/// <reference types="jest" />
/**
 * Cotality system-status pure decision logic. No DB, no mocks — these pin the
 * classification rules the protected /crm/system-status page depends on:
 *  - monitoring state (incl. data_missing: a successful query is NOT enough — both
 *    the Property and Media status rows must exist before state is `ok`);
 *  - run health (a failed/errored latest run is critical regardless of recency);
 *  - connection mode (a missing URL is `unknown`, never `direct`);
 *  - DB-error classification (auth → unauthorized; everything else → unreachable).
 */
import {
  deriveMonitoringState,
  combined,
  connMode,
  classifyDbError,
} from '@/lib/cotality/system-status';

describe('deriveMonitoringState', () => {
  it('not configured → not_configured', () => {
    expect(deriveMonitoringState({ configured: false, propPresent: false, mediaPresent: false }))
      .toBe('not_configured');
  });

  it('query threw auth error → unauthorized', () => {
    expect(deriveMonitoringState({ configured: true, queryError: { code: 'P1000' }, propPresent: false, mediaPresent: false }))
      .toBe('unauthorized');
  });

  it('query threw connection error → unreachable', () => {
    expect(deriveMonitoringState({ configured: true, queryError: new Error('connect ETIMEDOUT'), propPresent: false, mediaPresent: false }))
      .toBe('unreachable');
  });

  it('queries succeeded but Property row missing → data_missing', () => {
    expect(deriveMonitoringState({ configured: true, propPresent: false, mediaPresent: true }))
      .toBe('data_missing');
  });

  it('queries succeeded but Media row missing → data_missing', () => {
    expect(deriveMonitoringState({ configured: true, propPresent: true, mediaPresent: false }))
      .toBe('data_missing');
  });

  it('configured, no error, BOTH rows present → ok', () => {
    expect(deriveMonitoringState({ configured: true, propPresent: true, mediaPresent: true }))
      .toBe('ok');
  });
});

describe('combined run health (status + age)', () => {
  it('errored latest run is critical even when fresh', () => {
    expect(combined('error', 1, 15, 30)).toBe('critical');
  });
  it('failed latest run is critical even when fresh', () => {
    expect(combined('failed', 2, 15, 30)).toBe('critical');
  });
  it('partial latest run is warning', () => {
    expect(combined('partial', 1, 15, 30)).toBe('warning');
  });
  it('success + fresh is healthy', () => {
    expect(combined('success', 1, 15, 30)).toBe('healthy');
  });
  it('success but stale (age past critical) is critical', () => {
    expect(combined('success', 40, 15, 30)).toBe('critical');
  });
  it('success but aging (past warning) is warning', () => {
    expect(combined('success', 20, 15, 30)).toBe('warning');
  });
  it('no status and no age is unknown', () => {
    expect(combined(null, null, 15, 30)).toBe('unknown');
  });
});

describe('connMode', () => {
  it('missing URL → unknown (never direct)', () => {
    expect(connMode(undefined)).toBe('unknown');
    expect(connMode('')).toBe('unknown');
  });
  it('pooler host → pooled', () => {
    expect(connMode('postgresql://u:p@ep-x-pooler.neon.tech/db')).toBe('pooled');
  });
  it('non-pooler host → direct', () => {
    expect(connMode('postgresql://u:p@ep-x.neon.tech/db')).toBe('direct');
  });
});

describe('classifyDbError', () => {
  it('Prisma P1000 → unauthorized', () => {
    expect(classifyDbError({ code: 'P1000' })).toBe('unauthorized');
  });
  it('permission-denied message → unauthorized', () => {
    expect(classifyDbError(new Error('permission denied for table leads'))).toBe('unauthorized');
  });
  it('generic/connection error → unreachable', () => {
    expect(classifyDbError(new Error('connect ECONNREFUSED'))).toBe('unreachable');
  });
});
