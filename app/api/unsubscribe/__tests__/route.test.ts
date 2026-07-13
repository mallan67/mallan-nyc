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

jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: async () => true,
  extractClientIp: () => '203.0.113.7',
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { makeUnsubscribeToken } from '@/lib/email/unsubscribe-token';

beforeEach(() => {
  mockLeadUpdateMany.mockClear();
  mockAuditCreate.mockClear();
});

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
