/// <reference types="jest" />
/**
 * Multiple boroughs are ONE criterion the executor already supports: every selected borough
 * is ORed over CityRegion for provider rows and mapped to the storage variants for Mallan rows.
 * No selected borough may be dropped. (Search Consolidation Packet 1, correction 3.)
 */
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';

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
const regionTerms = (filter: string) => (filter.match(/CityRegion eq '([A-Za-z]+)'/g) || []).map((t) => t.replace(/CityRegion eq '|'/g, ''));

beforeEach(() => findMany.mockReset().mockResolvedValue([]));

describe('provider side: every selected borough is ORed', () => {
  test.each([
    ['Manhattan,Brooklyn', ['Manhattan', 'Brooklyn']],
    ['Brooklyn,Queens', ['Brooklyn', 'Queens']],
    ['Manhattan,Brooklyn,Queens,Bronx,Staten Island', ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'StatenIsland']],
  ])('borough=%s', (input, expected) => {
    const q = buildProviderQuery(crit('type=sale&borough=' + encodeURIComponent(input)));
    expect(regionTerms(q.filter)).toEqual(expected);
    if (expected.length > 1) expect(q.filter).toContain("(CityRegion eq '" + expected[0] + "' or CityRegion eq '" + expected[1] + "'");
  });
  test('a borough the provider does not carry is refused by name, not dropped', () => {
    const r = criteriaFromParams(new URLSearchParams('type=sale&borough=Manhattan,Jersey'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.invalid.map((i) => i.param + ':' + i.value)).toEqual(['borough:Jersey']);
  });
});

describe('Mallan side: the same boroughs, as storage variants, in one in-list', () => {
  test.each([
    ['Manhattan,Brooklyn', ['Manhattan', 'Brooklyn']],
    ['Brooklyn,Queens', ['Brooklyn', 'Queens']],
    ['Manhattan,Brooklyn,Queens,Bronx,Staten Island', ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'The Bronx', 'StatenIsland', 'Staten Island']],
  ])('borough=%s', async (input, expected) => {
    await settleUniverse(crit('type=rent&borough=' + encodeURIComponent(input)));
    const where = findMany.mock.calls[0][0].where;
    expect(where.borough).toEqual({ in: expected });
    expect(where.listing_id).toEqual({ startsWith: 'RL-' });
  });
});
