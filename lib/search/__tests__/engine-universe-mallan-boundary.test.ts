/// <reference types="jest" />
/**
 * Mallan-authored rows must stay inside their workflow universe even when
 * addressed by listingId.
 *
 * Independent Verifier finding (2026-09-05, SHA 15207daa, cases M1/M2):
 * `type=rent&listingId=SL-QA-15207DAA` returned the SALE fixture and
 * `type=sale&listingId=RL-QA-15207DAA` returned the RENTAL fixture. Cause: the
 * listingId criterion replaced the `listing_id: { startsWith: 'SL-' | 'RL-' }`
 * universe condition on the Prisma where-clause instead of narrowing it.
 *
 * This test pins the where-clause the engine sends to storage. Storage is
 * mocked; nothing here touches a database or the provider.
 */
import { criteriaFromParams } from '@/lib/search/engine/criteria';

const findMany = jest.fn();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findMany: (...a: unknown[]) => findMany(...a) } } }));
jest.mock('@/lib/search/engine/provider-client', () => ({
  walkProvider: jest.fn(async () => ({ rows: [], count: 0, pages: 1, complete: true })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { settleUniverse } = require('@/lib/search/engine/universe') as typeof import('@/lib/search/engine/universe');

function crit(q: string) {
  const r = criteriaFromParams(new URLSearchParams(q));
  if (!r.ok) throw new Error(JSON.stringify(r.refusal));
  return r.criteria;
}

beforeEach(() => findMany.mockReset().mockResolvedValue([]));

describe('Mallan rows never cross the sale/rental boundary', () => {
  test('rental universe + a sale listingId keeps the RL- prefix AND the id', async () => {
    await settleUniverse(crit('type=rent&listingId=SL-QA-15207DAA'));
    const where = findMany.mock.calls[0][0].where;
    expect(where.listing_id).toEqual({ startsWith: 'RL-', in: ['SL-QA-15207DAA'] });
    expect(where.mls_id).toBeNull();
  });
  test('sale universe + a rental listingId keeps the SL- prefix AND the id', async () => {
    await settleUniverse(crit('type=sale&listingId=RL-QA-15207DAA'));
    const where = findMany.mock.calls[0][0].where;
    expect(where.listing_id).toEqual({ startsWith: 'SL-', in: ['RL-QA-15207DAA'] });
  });
  test('without a listingId the prefix alone bounds the universe', async () => {
    await settleUniverse(crit('type=sale'));
    expect(findMany.mock.calls[0][0].where.listing_id).toEqual({ startsWith: 'SL-' });
  });
});
