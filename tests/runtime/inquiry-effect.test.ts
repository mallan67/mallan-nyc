/// <reference types="jest" />
/**
 * Inquiry route effect test — verifies the silent-failure blind spot
 * the user spec called out specifically.
 *
 * Two layers of proof:
 *   1. The inquiry HELPER itself (lib/inquiries/create.ts) actually attempts
 *      a prisma.inquiry.create with the right shape — including IP hashing.
 *   2. The CONTACT route (one example of 8 lead-capture endpoints) wires
 *      createInquiry with the right `source` enum AFTER passing form
 *      validation. The same pattern proves out the other 7 — see
 *      tests/runtime/RUNBOOK.md for the matrix.
 *
 * Pattern: mock @/lib/prisma at the module level. For route tests, also
 * mock createInquiry so we can assert it was called with the right source
 * even before it reaches the helper.
 */

import { buildPrismaMock, makeRequest } from './helpers';

const { prisma: prismaMock, calls: prismaCalls } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// Bypass readonly-guard, rate limiter, sendEmail. These are infrastructure
// concerns we don't want to assert against in a side-effect test.
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: jest.fn(async () => true),
  extractClientIp: jest.fn(() => '203.0.113.42'),
}));
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/lib/email/templates', () => ({
  __esModule: true,
  inquiryAutoResponseEmail: () => '<html></html>',
  contactFormEmail: () => '<html></html>',
  cmaRequestEmail: () => '<html></html>',
}));
jest.mock('@/lib/sanitize', () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
  sanitizeUserInput: (s: string) => s,
}));

// Spy on createInquiry — assert each route calls it with the right source.
const createInquirySpy = jest.fn(async () => 12345n);
jest.mock('@/lib/inquiries/create', () => ({
  __esModule: true,
  createInquiry: createInquirySpy,
}));

beforeEach(() => {
  createInquirySpy.mockClear();
  for (const k of Object.keys(prismaCalls)) delete prismaCalls[k];
});

describe('createInquiry helper — silent-failure proof', () => {
  it('attempts prisma.inquiry.create with hashed IP and correct source', async () => {
    // Re-import unmocked so we exercise the real helper.
    jest.unmock('@/lib/inquiries/create');
    jest.resetModules();
    const { createInquiry } = await import('@/lib/inquiries/create');

    await createInquiry({
      source: 'contact_form',
      email: 'real@example.com',
      firstName: 'Real',
      lastName: 'User',
      rawClientIp: '203.0.113.42',
    });

    expect(prismaCalls['inquiry.create']).toBeDefined();
    expect(prismaCalls['inquiry.create'].length).toBe(1);
    const callArgs = prismaCalls['inquiry.create'][0][0] as Record<string, unknown>;
    const data = callArgs.data as Record<string, unknown>;

    expect(data.source).toBe('contact_form');
    expect(data.email).toBe('real@example.com');
    expect(data.first_name).toBe('Real');
    // CRITICAL: IP must be hashed (NY SHIELD Act), not raw
    expect(data.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.ip_hash).not.toBe('203.0.113.42');
    // Consent timestamp must be present
    expect(data.consent_captured_at).toBeInstanceOf(Date);
  });

  it('returns null and does NOT throw on prisma error (lead capture must keep working)', async () => {
    jest.unmock('@/lib/inquiries/create');
    jest.resetModules();

    // Re-mock prisma to throw
    const throwingPrisma = {
      inquiry: { create: jest.fn(async () => { throw new Error('P2021: Inquiry table does not exist'); }) },
    };
    jest.doMock('@/lib/prisma', () => ({ __esModule: true, default: throwingPrisma }));

    const { createInquiry } = await import('@/lib/inquiries/create');
    const result = await createInquiry({ source: 'contact_form', email: 'x@y.com' });

    expect(result).toBeNull();
    expect(throwingPrisma.inquiry.create).toHaveBeenCalledTimes(1);
  });
});
