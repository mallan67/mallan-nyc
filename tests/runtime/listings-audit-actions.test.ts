/**
 * AUDIT ALIGNMENT — a provider fetch and a served response must be countable
 * apart, and the caller IP must actually persist.
 *
 * Both defects were real: one hard-coded `action: 'trestle_access'` made a cache
 * HIT indistinguishable from a Cotality call, so quota could not be reconciled
 * from the audit trail; and the logger read `data.ip` while every call site
 * passes `caller: { ip }`, so ip_address was persisted as null on every record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TRESTLE_FETCH_ACTION, TRESTLE_SERVED_ACTION } from '@/app/api/listings/route';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/listings/route.ts'), 'utf8');

describe('audit event kinds are non-confusable', () => {
  it('the two actions are distinct and neither is the old ambiguous value', () => {
    expect(TRESTLE_FETCH_ACTION).not.toBe(TRESTLE_SERVED_ACTION);
    expect(TRESTLE_FETCH_ACTION).not.toBe('trestle_access');
    expect(TRESTLE_SERVED_ACTION).not.toBe('trestle_access');
  });

  it('no hard-coded trestle_access action survives', () => {
    expect(SRC).not.toMatch(/action:\s*'trestle_access'/);
  });

  it('every call site passes an explicit action', () => {
    const calls = SRC.match(/logTrestleAccess\(/g) ?? [];
    const explicit = SRC.match(/logTrestleAccess\(TRESTLE_(FETCH|SERVED)_ACTION,/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(explicit.length).toBe(calls.length);
  });

  it('the provider-fetch audit sits INSIDE the cache-miss closure', () => {
    // It must appear between the closure opening and the cache key, so a cache
    // HIT cannot emit a provider-fetch record.
    const closure = SRC.indexOf('providerFetched = true;');
    const fetchLog = SRC.indexOf(`logTrestleAccess(${'TRESTLE_FETCH_ACTION'},`);
    const keyLine = SRC.indexOf('"api-listings-trestle-fallback"');
    expect(closure).toBeGreaterThan(-1);
    expect(fetchLog).toBeGreaterThan(closure);
    expect(fetchLog).toBeLessThan(keyLine);
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
