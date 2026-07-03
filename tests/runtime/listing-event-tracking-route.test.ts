/// <reference types="jest" />
/**
 * SELLER-002 — POST /api/track/listing-event behavioral contract.
 *
 * Beacon semantics: the endpoint ALWAYS returns 204 with an empty body —
 * success, disabled, invalid, rate-limited, DB error, unknown listing —
 * so no caller can probe listing existence or flag state.
 *
 * Fail-closed rollout: when LISTING_EVENTS_ENABLED !== "true" (Maya-held env),
 * the route is a pure no-op: NO prisma call of any kind.
 */

import { makeRequest } from './helpers';

const listingEventCreateMock = jest.fn(async (..._args: unknown[]) => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listingEvent: { create: listingEventCreateMock },
  },
}));

const rateLimitMock = jest.fn(async () => true);
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: rateLimitMock,
  extractClientIp: (headers: Headers) =>
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
}));

// Import AFTER mocks
import { POST } from '@/app/api/track/listing-event/route';

const validBody = {
  listing_id: 'SL-0007',
  event_type: 'photo_gallery_open',
  visitor_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  session_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    makeRequest({
      method: 'POST',
      url: 'http://localhost/api/track/listing-event',
      body,
      headers,
    })
  );
}

describe('POST /api/track/listing-event', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    rateLimitMock.mockResolvedValue(true);
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('flag ABSENT → 204 no-op, ZERO DB calls (fail-closed)', async () => {
    delete process.env.LISTING_EVENTS_ENABLED;
    const res = await post(validBody);
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('flag "false" → 204 no-op, ZERO DB calls', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'false';
    const res = await post(validBody);
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('flag "true" + valid payload → 204 and one listingEvent.create', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    const res = await post(validBody, {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      referer: 'https://www.google.com/search?q=400+east+90th',
    });
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).toHaveBeenCalledTimes(1);
    const arg = listingEventCreateMock.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(arg.data.listing_id).toBe('SL-0007');
    expect(arg.data.event_type).toBe('photo_gallery_open');
    expect(arg.data.visitor_id).toBe(validBody.visitor_id);
    expect(arg.data.session_id).toBe(validBody.session_id);
    // server-derived enrichment
    expect(arg.data.device_type).toBe('mobile');
    expect(arg.data.source).toBe('google');
    // referrer stored host-only — never the full URL (PII hygiene)
    expect(arg.data.referrer).toBe('www.google.com');
    // no IP-shaped field is ever persisted
    expect(Object.keys(arg.data)).not.toEqual(
      expect.arrayContaining(['ip', 'ip_hash', 'ip_address'])
    );
  });

  it('non-allowlisted event_type → 204, ZERO DB calls', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    const res = await post({ ...validBody, event_type: 'owner_report_view' });
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('malformed JSON → 204, ZERO DB calls', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    const req = new Request('http://localhost/api/track/listing-event', {
      method: 'POST',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('oversized payload (>4KB) → 204, ZERO DB calls', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    const res = await post({ ...validBody, metadata: { blob: 'x'.repeat(8000) } });
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('rate-limited → SILENT 204 (beacon semantics, not 429), ZERO DB calls', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    rateLimitMock.mockResolvedValue(false);
    const res = await post(validBody);
    expect(res.status).toBe(204);
    expect(listingEventCreateMock).not.toHaveBeenCalled();
  });

  it('PII in metadata is stripped before the row is written', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    const res = await post({
      ...validBody,
      metadata: { email: 'jane@example.com', name: 'Jane', tab: 'video' },
    });
    expect(res.status).toBe(204);
    const arg = listingEventCreateMock.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(arg.data.metadata).toEqual({ tab: 'video' });
  });

  it('DB create throws (e.g. FK: table absent pre-migration / unknown listing) → still 204', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    listingEventCreateMock.mockRejectedValueOnce(new Error('P2003 FK violation'));
    const res = await post(validBody);
    expect(res.status).toBe(204);
  });

  it('never persists a lead/user identity from the anonymous public payload', async () => {
    process.env.LISTING_EVENTS_ENABLED = 'true';
    await post({ ...validBody, lead_id: 42, user_id: 'u-1', agent_id: 7 });
    const arg = listingEventCreateMock.mock.calls[0][0] as unknown as {
      data: Record<string, unknown>;
    };
    // Client-supplied identity claims are IGNORED — self-identification is a
    // server-side concern (future authenticated paths), never trusted from a beacon.
    expect(arg.data.lead_id).toBeUndefined();
    expect(arg.data.user_id).toBeUndefined();
    expect(arg.data.agent_id).toBeUndefined();
  });
});
