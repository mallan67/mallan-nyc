/// <reference types="jest" />
/**
 * /api/listings/[id] — a Cotality (IDX) OUTAGE must never become a cached 404.
 *
 * Regression for the PR #511 review: an IDX exception was caught and fell through to the
 * local fallback; a local miss then returned a `public, s-maxage=60` 404 — so a Cotality
 * outage would publicly CACHE "listing not found" for a real listing. The route now
 * distinguishes:
 *   - IDX EXCEPTION (outage) + no local fallback  → 503 `no-store` (transient, retry)
 *   - IDX returns no record (confirmed miss) / IDX disabled + no local → short cached 404
 *   - local fallback found                        → returned normally
 */
jest.mock('@/lib/idx/fetch', () => ({
  fetchSingleListing: jest.fn(),
  fetchListingMedia: jest.fn(async () => []),
}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findUnique: jest.fn(async () => null) } },
}));

import { fetchSingleListing } from '@/lib/idx/fetch';
import { GET } from '@/app/api/listings/[id]/route';

const call = (id: string) =>
  GET(new Request(`http://localhost/api/listings/${id}`), { params: Promise.resolve({ id }) });

describe('/api/listings/[id] — IDX outage vs confirmed miss', () => {
  const OLD = process.env.IDX_ENABLED;
  beforeAll(() => {
    process.env.IDX_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.IDX_ENABLED = OLD;
  });
  beforeEach(() => jest.clearAllMocks());

  it('IDX timeout/outage + no local fallback → 503 no-store (NEVER a cached 404)', async () => {
    (fetchSingleListing as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );
    const res = await call('RLS00000000');
    expect(res.status).toBe(503);
    const cc = res.headers.get('cache-control') || '';
    expect(cc).toMatch(/no-store/);
    expect(cc).not.toMatch(/s-maxage/); // must not be publicly cached
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('IDX returns no record (confirmed miss) + no local fallback → short cached 404', async () => {
    (fetchSingleListing as jest.Mock).mockResolvedValueOnce(null);
    const res = await call('RLS00000001');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control') || '').toMatch(/s-maxage=60/);
  });
});
