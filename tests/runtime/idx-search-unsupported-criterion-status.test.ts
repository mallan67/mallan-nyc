/// <reference types="jest" />
/**
 * An UNSUPPORTED CRITERION IS NOT AN UPSTREAM FAILURE.
 *
 * `/api/idx/search` has one catch block that turns every throw into
 * `502 "Search failed. Please try again later."` That was tolerable while the
 * only throws came from Cotality being unreachable.
 *
 * It stopped being tolerable on 2026-08-21, when property-sub-type validation
 * moved Mallan-side. `buildCrmIdxODataFilter` now throws
 * `UnknownPropertySubTypeError` for a token the live enum does not declare —
 * which is a permanent, client-side, fixable condition. Telling a broker to
 * "try again later" invites them to retry a request that can never succeed, and
 * buries the one piece of information that would let them fix it: which token
 * was wrong.
 *
 * 502 means "the upstream failed". 400 means "this request cannot be served as
 * written". They are different facts and must not collapse — the same rule the
 * probe layer applies to SUPPORTED / PROVIDER_REJECTED / UNVERIFIED.
 */
import { idxSearchErrorResponse } from '@/app/api/idx/search/route';
import { UnknownPropertySubTypeError } from '@/lib/search/canonical/property-subtype-contract';

describe('idxSearchErrorResponse', () => {
  it('maps an unsupported criterion to 400, not 502', () => {
    const res = idxSearchErrorResponse(new UnknownPropertySubTypeError(['Brownstone']));
    expect(res.status).toBe(400);
  });

  it('names the offending tokens so the broker can correct the search', () => {
    const res = idxSearchErrorResponse(new UnknownPropertySubTypeError(['Brownstone', 'Loftt']));
    expect(res.body.unsupportedValues).toEqual(['Brownstone', 'Loftt']);
    expect(res.body.code).toBe('UNSUPPORTED_CRITERION');
  });

  it('does not tell the broker to retry a request that can never succeed', () => {
    const res = idxSearchErrorResponse(new UnknownPropertySubTypeError(['Brownstone']));
    expect(JSON.stringify(res.body)).not.toMatch(/try again/i);
  });

  it('still maps provider rate limiting to 503 with Retry-After', () => {
    const res = idxSearchErrorResponse(new Error('[IDX Fetch] Trestle API error (429): rate limit'));
    expect(res.status).toBe(503);
    expect(res.headers?.['Retry-After']).toBe('30');
  });

  it('still maps a genuine upstream failure to 502', () => {
    const res = idxSearchErrorResponse(new Error('[IDX Fetch] Trestle API error (500): boom'));
    expect(res.status).toBe(502);
  });

  it('never leaks the raw provider error text to the client', () => {
    const res = idxSearchErrorResponse(new Error('[IDX Fetch] Trestle API error (500): secret-host-detail'));
    expect(JSON.stringify(res.body)).not.toContain('secret-host-detail');
  });
});
