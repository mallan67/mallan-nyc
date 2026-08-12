/**
 * AUDIT ALIGNMENT — an origin execution and a served response must be countable
 * apart, and the caller IP must actually persist.
 *
 * Both defects were real: one hard-coded `action: 'trestle_access'` made a cache
 * HIT indistinguishable from an origin execution; and the logger read
 * `data.ip` while every call site
 * passes `caller: { ip }`, so ip_address was persisted as null on every record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TRESTLE_ORIGIN_EXECUTION_ACTION, TRESTLE_SERVED_ACTION } from '@/app/api/listings/route';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/listings/route.ts'), 'utf8');

describe('audit event kinds are non-confusable', () => {
  it('neither event claims to measure Cotality HTTP traffic', () => {
    // One origin execution can issue zero outbound requests (Next's inner fetch
    // cache), one, or several (OData pagination, auth refresh, retries). The
    // route must not describe these events as a count or bound on provider
    // traffic, in either direction.
    for (const stale of [
      'bounds provider traffic',
      'counting real provider fetches',
      'tracks real',
      'SHARED provider cache',
      'quota protection',
    ]) {
      expect(SRC).not.toContain(stale);
    }
  });

  it('the two actions are distinct and neither is the old ambiguous value', () => {
    expect(TRESTLE_ORIGIN_EXECUTION_ACTION).not.toBe(TRESTLE_SERVED_ACTION);
    expect(TRESTLE_ORIGIN_EXECUTION_ACTION).not.toBe('trestle_access');
    expect(TRESTLE_SERVED_ACTION).not.toBe('trestle_access');
  });

  it('no hard-coded trestle_access action survives', () => {
    expect(SRC).not.toMatch(/action:\s*'trestle_access'/);
  });

  it('every call site passes an explicit action', () => {
    const calls = SRC.match(/logTrestleAccess\(/g) ?? [];
    const explicit = SRC.match(/logTrestleAccess\(TRESTLE_(ORIGIN_EXECUTION|SERVED)_ACTION,/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(explicit.length).toBe(calls.length);
  });

  it('the origin-execution audit sits INSIDE the cache-miss closure', () => {
    // It must appear between the closure opening and the cache key, so an outer
    // cache HIT cannot emit an origin-execution record.
    const closure = SRC.indexOf('origin: async () => {');
    const fetchLog = SRC.indexOf(`logTrestleAccess(${'TRESTLE_ORIGIN_EXECUTION_ACTION'},`);
    const closureEnd = SRC.indexOf('// Response-shape audit', fetchLog);
    expect(closure).toBeGreaterThan(-1);
    expect(fetchLog).toBeGreaterThan(closure);
    expect(fetchLog).toBeLessThan(closureEnd);
  });
});

describe('caller IP actually persists', () => {
  it('the logger reads caller.ip, not only a top-level ip', () => {
    expect(SRC).toMatch(/caller\?\.ip/);
  });

  it('no unverified retention claim is asserted in the logger comment', () => {
    expect(SRC).not.toMatch(/REBNY requires 12-month retention/);
  });
});
