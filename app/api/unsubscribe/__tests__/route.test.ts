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
import { GET } from '../route';
import { makeUnsubscribeToken } from '@/lib/email/unsubscribe-token';

beforeEach(() => {
  mockLeadUpdateMany.mockClear();
  mockAuditCreate.mockClear();
});

function req(qs: string): NextRequest {
  return new NextRequest(`https://mallan.nyc/api/unsubscribe?${qs}`);
}

describe('GET /api/unsubscribe — token verification', () => {
  it('valid token suppresses the address (200 + Lead update)', async () => {
    const token = makeUnsubscribeToken('alice@example.com')!;
    const res = await GET(req(`email=alice@example.com&token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    expect(mockLeadUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('ALTERED email (token no longer matches) is rejected 403 with NO suppression', async () => {
    const token = makeUnsubscribeToken('alice@example.com')!; // token for alice
    const res = await GET(req(`email=bob@example.com&token=${encodeURIComponent(token)}`)); // used for bob
    expect(res.status).toBe(403);
    expect(mockLeadUpdateMany).not.toHaveBeenCalled();
  });

  it('tokenless legacy link still works (rate-limited path)', async () => {
    const res = await GET(req('email=carol@example.com'));
    expect(res.status).toBe(200);
    expect(mockLeadUpdateMany).toHaveBeenCalledTimes(1);
  });
});
