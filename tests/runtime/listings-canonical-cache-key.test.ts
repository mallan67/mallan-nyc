/**
 * CANONICAL SEARCH KEY — parameter ORDER must not fork the cache.
 *
 * `searchParams.toString()` preserves caller order, so `?beds=2&type=sale` and
 * `?type=sale&beds=2` produced two keys for one search — and therefore two
 * separate Neon reads of identical rows. With Neon showing 203 GB of transfer
 * against a 0.67 GB database, duplicate identities for equivalent searches are
 * a direct cost defect.
 */
import { canonicalSearchKey } from '@/app/api/listings/route';

const k = (qs: string) => canonicalSearchKey(new URLSearchParams(qs));

describe('canonicalSearchKey', () => {
  it('collapses parameter ORDER onto one identity', () => {
    expect(k('beds=2&type=sale')).toBe(k('type=sale&beds=2'));
  });

  it('collapses repeated-key ORDER too', () => {
    expect(k('n=1&n=2')).toBe(k('n=2&n=1'));
  });

  it('still distinguishes genuinely different searches', () => {
    expect(k('beds=2&type=sale')).not.toBe(k('beds=3&type=sale'));
    expect(k('beds=2')).not.toBe(k('beds=2&type=sale'));
  });

  it('is stable and order-independent across many params', () => {
    const a = k('type=sale&beds=2&baths=1&zip=10128&sort=price');
    const b = k('sort=price&zip=10128&baths=1&beds=2&type=sale');
    expect(a).toBe(b);
  });

  it('an empty query yields a stable empty key', () => {
    expect(k('')).toBe('');
  });
});
