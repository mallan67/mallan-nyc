/// <reference types="jest" />
/**
 * Offer transmit route runtime test (UCBA Art. II §18).
 *
 * Proves the four behaviors the spec calls out:
 *   1. Stamps `transmitted_to_seller_at` on first call
 *   2. Idempotent re-submit — returns existing timestamp, does NOT
 *      overwrite (no second prisma.offer.update call)
 *   3. UCBA precondition — competing_offers_disclosed=true with
 *      disclosure_authorized_by_seller=false returns 400 with
 *      code: "UCBA_II_DISCLOSURE_NOT_AUTHORIZED" and NO update fires
 *   4. AuditEvent written on successful transmit
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock, calls: prismaCalls } = buildPrismaMock();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// Bypass auth — tests focus on side effects, not auth wiring (which has its
// own tests). Return a successful auth context shape.
const AUTH_CONTEXT = {
  userId: 1n,
  userType: 'agent' as const,
  role: 'BROKER',
};
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => AUTH_CONTEXT),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

interface BaseOffer {
  id: bigint;
  listing_id: string | null;
  buyer_lead_id: bigint | null;
  buyer_agent_id: bigint | null;
  list_agent_id: bigint | null;
  offer_amount: { toString(): string } | null;
  offer_terms: string | null;
  contingencies: unknown;
  expiration_at: Date | null;
  received_at: Date | null;
  transmitted_to_seller_at: Date | null;
  seller_acknowledged_at: Date | null;
  competing_offers_disclosed: boolean;
  disclosure_authorized_by_seller: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

const baseOffer: BaseOffer = {
  id: 42n,
  listing_id: 'L-100',
  buyer_lead_id: 999n,
  buyer_agent_id: 7n,
  list_agent_id: 1n,
  offer_amount: { toString: () => '500000.00' },
  offer_terms: 'Cash, 30-day close',
  contingencies: null,
  expiration_at: null,
  received_at: new Date('2026-04-01'),
  transmitted_to_seller_at: null,
  seller_acknowledged_at: null,
  competing_offers_disclosed: false,
  disclosure_authorized_by_seller: false,
  status: 'received',
  created_at: new Date('2026-04-01'),
  updated_at: new Date('2026-04-01'),
};

beforeEach(() => {
  for (const k of Object.keys(prismaCalls)) delete prismaCalls[k];
  jest.clearAllMocks();
});

async function callTransmit(offerOverride: Partial<typeof baseOffer>, body: object = {}) {
  // Stub findUnique to return our fixture
  (prismaMock as { offer: { findUnique: jest.Mock; update: jest.Mock } }).offer.findUnique = jest.fn(
    async () => ({ ...baseOffer, ...offerOverride })
  );
  (prismaMock as { offer: { update: jest.Mock } }).offer.update = jest.fn(async (args: { data: object }) => ({
    ...baseOffer,
    ...offerOverride,
    ...args.data,
  }));

  const route = await import('@/app/api/crm/offers/[id]/transmit/route');
  const req = makeRequest({
    url: 'http://localhost/api/crm/offers/42/transmit',
    body,
  });
  return route.POST(req, { params: Promise.resolve({ id: '42' }) });
}

describe('UCBA Art. II §18 — offer transmit route', () => {
  it('stamps transmitted_to_seller_at on first call (case 1)', async () => {
    const res = await callTransmit({});
    expect(res.status).toBe(200);
    const body = await readJson<{ offer: { transmitted_to_seller_at: string } }>(res);
    expect(body.offer.transmitted_to_seller_at).toBeTruthy();

    const updateCalls = (prismaMock as { offer: { update: jest.Mock } }).offer.update.mock.calls;
    expect(updateCalls.length).toBe(1);
    const updateArgs = updateCalls[0][0];
    expect(updateArgs.data.transmitted_to_seller_at).toBeInstanceOf(Date);
    // Status moved received → transmitted
    expect(updateArgs.data.status).toBe('transmitted');
  });

  it('idempotent re-submit — returns existing timestamp, does NOT call update (case 2)', async () => {
    const existingTimestamp = new Date('2026-04-15T10:00:00Z');
    const res = await callTransmit({ transmitted_to_seller_at: existingTimestamp });
    expect(res.status).toBe(200);
    const body = await readJson<{ already_transmitted: boolean; offer: { transmitted_to_seller_at: string } }>(res);
    expect(body.already_transmitted).toBe(true);
    expect(body.offer.transmitted_to_seller_at).toBe(existingTimestamp.toISOString());

    // CRITICAL: no second update — prevents losing the original audit timestamp
    const updateCalls = (prismaMock as { offer: { update: jest.Mock } }).offer.update.mock.calls;
    expect(updateCalls.length).toBe(0);
  });

  it('blocks competing_offers_disclosed=true when disclosure_authorized_by_seller=false (case 3, UCBA precondition)', async () => {
    const res = await callTransmit(
      { disclosure_authorized_by_seller: false },
      { competing_offers_disclosed: true }
    );
    expect(res.status).toBe(400);
    const body = await readJson<{ error: string; code: string }>(res);
    expect(body.code).toBe('UCBA_II_DISCLOSURE_NOT_AUTHORIZED');
    expect(body.error).toMatch(/seller's prior authorization/i);

    // CRITICAL: NO offer.update call when precondition fails
    const updateCalls = (prismaMock as { offer: { update: jest.Mock } }).offer.update.mock.calls;
    expect(updateCalls.length).toBe(0);
  });

  it('AuditEvent fires on successful transmit (case 4)', async () => {
    const auth = await import('@/lib/auth');
    const logSpy = auth.logAuditEvent as jest.Mock;

    await callTransmit({});

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      'offer_transmitted_to_seller',
      'offer',
      '42',
      AUTH_CONTEXT,
      expect.objectContaining({
        listing_id: 'L-100',
        offer_amount: '500000.00',
        transmitted_at: expect.any(String),
      })
    );
  });
});
