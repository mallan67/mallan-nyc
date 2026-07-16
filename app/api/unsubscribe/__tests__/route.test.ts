// Route-level tests for /api/unsubscribe token verification.
process.env.UNSUBSCRIBE_SECRET = 'route-secret';

const mockLeadUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 1 });
const mockSavedUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>().mockResolvedValue({ count: 0 });
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { updateMany: (a: unknown) => mockLeadUpdateMany(a) },
    savedSearch: { updateMany: (a: unknown) => mockSavedUpdateMany(a) },
    auditEvent: { create: (a: unknown) => mockAuditCreate(a) },
  },
}));

// Per-route limiter mock: records the route name each call used, and can be told
// to "exhaust" a specific bucket by name via mockDenied.
const mockDenied = new Set<string>();
const mockCheckRoute = jest.fn(async (_ip: string, route: string) => !mockDenied.has(route));
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: (ip: string, route: string) => mockCheckRoute(ip, route),
  extractClientIp: () => '203.0.113.7',
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { makeUnsubscribeToken } from '@/lib/email/unsubscribe-token';

beforeEach(() => {
  mockLeadUpdateMany.mockClear();
  mockSavedUpdateMany.mockClear();
  mockAuditCreate.mockClear();
  mockCheckRoute.mockClear();
  mockDenied.clear();
});

/** Route names passed to the limiter across all calls so far. */
const limiterRoutesUsed = () => mockCheckRoute.mock.calls.map((c) => c[1]);

function req(qs: string): NextRequest {
  return new NextRequest(`https://mallan.nyc/api/unsubscribe?${qs}`);
}
function postReq(qs: string): NextRequest {
  // RFC 8058 one-click: POST to the header URL with the payload in the query and
  // a non-JSON `List-Unsubscribe=One-Click` body.
  return new NextRequest(`https://mallan.nyc/api/unsubscribe?${qs}`, {
    method: 'POST',
    body: 'List-Unsubscribe=One-Click',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

describe('GET /api/unsubscribe — NON-MUTATING confirmation page (scanner/prefetch safe)', () => {
  it('valid token renders an HTML confirm page and DOES NOT unsubscribe', async () => {
    const token = makeUnsubscribeToken('alice@example.com')!;
    const res = await GET(req(`email=alice@example.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    // The page must POST to actually unsubscribe — GET never mutates.
    expect(html).toMatch(/method="POST"/i);
    expect(html).toContain('alice@example.com');
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
  });

  it('ALTERED email (token no longer matches) is rejected 403 with NO mutation', async () => {
    const token = makeUnsubscribeToken('alice@example.com')!; // token for alice
    const res = await GET(req(`email=bob@example.com&token=${encodeURIComponent(token)}`)); // used for bob
    expect(res.status).toBe(403);
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
  });

  it('tokenless GET also renders the page without mutating (a scanner cannot opt anyone out)', async () => {
    const res = await GET(req('email=carol@example.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/unsubscribe — RFC 8058 one-click (query payload, non-JSON body)', () => {
  it('valid token in the query suppresses (200), non-JSON body tolerated', async () => {
    const token = makeUnsubscribeToken('dave@example.com')!;
    const res = await POST(postReq(`email=dave@example.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    expect(mockLeadUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('altered email in the query (token mismatch) → 403, no suppression', async () => {
    const token = makeUnsubscribeToken('dave@example.com')!;
    const res = await POST(postReq(`email=evil@example.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(403);
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
  });
});

describe('rate-limit buckets — GET and POST use SEPARATE quotas (no collision)', () => {
  it('GET uses the `unsubscribe_get` limiter; POST uses `unsubscribe`', async () => {
    const token = makeUnsubscribeToken('gail@example.com')!;
    await GET(req(`email=gail@example.com&token=${encodeURIComponent(token)}`));
    await POST(postReq(`email=gail@example.com&token=${encodeURIComponent(token)}`));
    expect(mockCheckRoute).toHaveBeenNthCalledWith(1, expect.any(String), 'unsubscribe_get');
    expect(mockCheckRoute).toHaveBeenNthCalledWith(2, expect.any(String), 'unsubscribe');
  });

  it('repeated GETs never consume the POST (`unsubscribe`) bucket', async () => {
    for (let i = 0; i < 5; i++) await GET(req('email=hank@example.com'));
    expect(limiterRoutesUsed()).toEqual(['unsubscribe_get', 'unsubscribe_get', 'unsubscribe_get', 'unsubscribe_get', 'unsubscribe_get']);
    expect(limiterRoutesUsed()).not.toContain('unsubscribe');
  });

  it('a POST can still succeed after the GET bucket is exhausted', async () => {
    mockDenied.add('unsubscribe_get'); // GET bucket empty
    const token = makeUnsubscribeToken('ivy@example.com')!;
    const getRes = await GET(req(`email=ivy@example.com&token=${encodeURIComponent(token)}`));
    expect(getRes.status).toBe(429);
    // POST bucket is independent → still works and still mutates.
    const postRes = await POST(postReq(`email=ivy@example.com&token=${encodeURIComponent(token)}`));
    expect(postRes.status).toBe(200);
    expect(mockLeadUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('exhausting the POST bucket does NOT block viewing the GET confirmation page', async () => {
    mockDenied.add('unsubscribe'); // POST bucket empty
    const getRes = await GET(req('email=jan@example.com'));
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('content-type')).toMatch(/text\/html/);
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
    // POST is the one that's now rate-limited.
    const postRes = await POST(postReq('email=jan@example.com'));
    expect(postRes.status).toBe(429);
  });

  it('GET performs NO Lead, saved-search, or audit mutation', async () => {
    await GET(req('email=ken@example.com'));
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
    expect(mockSavedUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/unsubscribe — durable suppression for NON-Lead recipients (AuditEvent ledger)', () => {
  it('an email with NO Lead row still returns success AND writes the durable email_unsubscribed record', async () => {
    mockLeadUpdateMany.mockResolvedValueOnce({ count: 0 }); // no Lead row matched this email
    const token = makeUnsubscribeToken('cold@acris.com')!;
    const res = await POST(postReq(`email=cold@acris.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200); // success does NOT depend on a Lead row existing
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'email_unsubscribed', entity_id: 'cold@acris.com' }),
      }),
    );
  });

  it('a secondary Lead/SavedSearch failure does NOT undo suppression (still 200; durable record stands; failure audited)', async () => {
    mockLeadUpdateMany.mockRejectedValueOnce(new Error('Neon timeout')); // secondary step fails
    const token = makeUnsubscribeToken('cold@acris.com')!;
    const res = await POST(postReq(`email=cold@acris.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    // Durable record written FIRST, before the failing secondary step.
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'email_unsubscribed' }) }),
    );
    // The secondary failure is recorded (not silently lost) — without undoing suppression.
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'email_unsubscribe_secondary_failed' }) }),
    );
  });
});
