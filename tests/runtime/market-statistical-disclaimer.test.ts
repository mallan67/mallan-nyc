/// <reference types="jest" />
/**
 * The public market statistics say the REBNY Listing Service statistical disclaimer (UCBA 2026 Art. VIII Sec. 4) with the period they cover, and a rental page shows rental statistics.
 *
 * Found 2026-10-09 (an independent read of every surface that shows RLS statistics, then my own reading of the code):
 *  - GET /api/market printed the period in the server's own time zone, and its second sentence was not the UCBA's;
 *  - the listing page's market card (MarketSnapshot) asked for type=rental, a word the route has never known, so a RENTAL listing's page showed the SALE statistics under a "Median Rent" label;
 *  - that card, and the market page when its data had not loaded, printed "for the period currently available".
 * The route says it through lib/compliance/rls-statistical-disclaimer.ts, accepts 'rental' as 'rent', and the card keeps the route's disclaimer and shows statistics only together with it.
 *
 * The REAL route handler runs, with the database, the cache and Cotality stubbed and the clock fixed at October 9, 2026 (New York).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPrismaMock } from './helpers';
import { rlsStatisticalDisclaimer } from '@/lib/compliance/rls-statistical-disclaimer';
import { marketRequestType, snapshotFromMarket } from '@/lib/market/market-snapshot-data';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/cache/public-cache', () => ({ __esModule: true, SEARCH_CACHE_TAG: 'search', cachedPublicRead: (fn: () => unknown) => async () => fn() }));       // cachedPublicRead(fn, keys, options) returns the function that reads
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: jest.fn(async () => 'token') }));
jest.mock('@/lib/idx/trestle-mapper', () => ({ __esModule: true, checkDistributionGates: () => ({ displayable: true }) }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prismaMock as any;
const TODAY = new Date('2026-10-09T16:00:00Z');                       // New York: October 9, 2026
const IDX_TAIL = (kind: string) => ` The data relating to real estate for ${kind} on this web site comes in part from the REBNY RLS. Data deemed reliable but not guaranteed.`;

beforeAll(() => {
  jest.useFakeTimers({ now: TODAY, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'] });
});
afterAll(() => { jest.useRealTimers(); });
beforeEach(() => {
  db.listing.findMany = jest.fn(async () => []);
  db.listing.count = jest.fn(async () => 0);
  db.listing.groupBy = jest.fn(async () => []);
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ value: [] }) }));
});

const get = async (query: string) => {
  const route = await import('@/app/api/market/route');
  const res = await route.GET(new Request(`http://localhost/api/market?${query}`));
  expect(res.status).toBe(200);
  return (await res.json()) as any;
};

describe('GET /api/market', () => {
  // (a borough per test: the route keeps its answers for five minutes by type, period, borough and neighborhood)
  it.each([
    ['30d', '2026-09-09', 'Manhattan'],
    ['90d', '2026-07-11', 'Brooklyn'],
    ['1y', '2025-10-09', 'Queens'],
  ])('period %s: the disclaimer is the UCBA sentence pair from %s through today, then the IDX sentence', async (period, start, borough) => {
    const body = await get(`type=sale&period=${period}&borough=${borough}`);
    expect(body._compliance.disclaimer).toBe(rlsStatisticalDisclaimer(start, '2026-10-09') + IDX_TAIL('sale'));
  });

  it('with no period asked for it is 90 days', async () => {
    const body = await get('type=sale&borough=Bronx');
    expect(body._compliance.disclaimer).toBe(rlsStatisticalDisclaimer('2026-07-11', '2026-10-09') + IDX_TAIL('sale'));
  });

  it('the days are New York days: late on October 9 in New York is still October 9', async () => {
    jest.setSystemTime(new Date('2026-10-10T02:30:00Z'));              // 10:30 pm on October 9 in New York
    try {
      const body = await get('type=sale&period=30d&borough=Staten%20Island');
      expect(body._compliance.disclaimer).toContain('for the period September 9, 2026 through October 9, 2026.');
    } finally { jest.setSystemTime(TODAY); }
  });

  it('never the wording it had: no period in the server\'s zone, no "deemed reliable but not guaranteed" in place of the UCBA\'s second sentence', async () => {
    const body = await get('type=sale&period=30d&borough=Manhattan&neighborhood=Chelsea');
    expect(body._compliance.disclaimer).toContain('The REBNY Listing Service makes no representations or warranties with respect to the accuracy or completeness of such information and shall not be held liable for any omission or inaccuracy of such information thereof.');
    expect(body._compliance.disclaimer).not.toMatch(/currently available|indicated/);
  });

  it('type=rental is a rental request (the card asked for it): rental listings are counted, and the sentence says so', async () => {
    const body = await get('type=rental&period=30d&borough=Harlem');
    expect(body.filters.type).toBe('rent');
    expect(db.listing.findMany.mock.calls[0][0].where.listing_type).toBe('rent');
    expect(body._compliance.disclaimer).toBe(rlsStatisticalDisclaimer('2026-09-09', '2026-10-09') + IDX_TAIL('rent'));
  });

  it('type=rent is the same request, and any other type is a sale request, as before', async () => {
    const rent = await get('type=rent&period=30d&borough=Inwood');
    expect(rent.filters.type).toBe('rent');
    expect(db.listing.findMany.mock.calls[0][0].where.listing_type).toBe('rent');
    db.listing.findMany.mockClear();
    const other = await get('type=whatever&period=30d&borough=Tribeca');
    expect(db.listing.findMany.mock.calls[0][0].where.listing_type).toBe('sale');
    expect(other._compliance.disclaimer).toContain(IDX_TAIL('sale'));
  });
});

describe('the listing page\'s market card', () => {
  it('asks for the type the route knows', () => {
    expect(marketRequestType('rent')).toBe('rent');
    expect(marketRequestType('sale')).toBe('sale');
  });

  const answer = (extra: Record<string, unknown> = {}) => ({
    success: true,
    active: { medianPrice: 1_250_000, avgPricePerSqft: 1500, totalCount: 42, medianDaysOnMarket: 63 },
    neighborhoodBreakdown: [{ name: 'Yorkville', avgPrice: 1_100_000, count: 9 }],
    _compliance: { disclaimer: rlsStatisticalDisclaimer('2026-07-11', '2026-10-09') + IDX_TAIL('sale') },
    ...extra,
  });

  it('keeps the statistics with the disclaimer the route sent for them, for the neighborhood when the breakdown has it', () => {
    const data = snapshotFromMarket(answer(), 'yorkville', 'Manhattan');
    expect(data).toEqual({
      neighborhood: 'Yorkville', borough: 'Manhattan', medianPrice: 1_100_000, avgPricePerSqft: 1500, totalActive: 9, avgDaysOnMarket: 63,
      disclaimer: rlsStatisticalDisclaimer('2026-07-11', '2026-10-09') + IDX_TAIL('sale'),
    });
  });

  it('falls back to the borough\'s figures when the breakdown does not have the neighborhood', () => {
    const data = snapshotFromMarket(answer(), 'Lenox Hill', 'Manhattan');
    expect(data).toMatchObject({ neighborhood: 'Manhattan', medianPrice: 1_250_000, totalActive: 42 });
  });

  it.each([
    ['an answer that is not a success', answer({ success: false })],
    ['no answer', null],
    ['statistics without their disclaimer', answer({ _compliance: undefined })],
    ['a disclaimer that is not text', answer({ _compliance: { disclaimer: 5 } })],
    ['a blank disclaimer', answer({ _compliance: { disclaimer: '  ' } })],
    ['no price', answer({ active: { totalCount: 3 }, neighborhoodBreakdown: [] })],
  ])('shows nothing for %s', (_label, input) => {
    expect(snapshotFromMarket(input, 'Yorkville', 'Manhattan')).toBeNull();
  });
});

describe('the components', () => {
  const source = (file: string) => readFileSync(resolve(__dirname, '../../', file), 'utf8');

  it('MarketSnapshot asks through marketRequestType, keeps the route\'s disclaimer, and prints no period of its own', () => {
    const card = source('app/components/MarketSnapshot.tsx');
    expect(card).toContain('type: marketRequestType(listingType)');
    expect(card).toContain('snapshotFromMarket(d, neighborhood, borough)');
    expect(card).toContain('{data.disclaimer}');
    expect(card).not.toMatch(/'rental'|currently available/);
  });

  it('the market page\'s fallback (no data loaded, so no statistics on the page) claims no period', () => {
    const page = source('app/market/MarketReportContent.tsx');
    expect(page).not.toMatch(/for the period currently available/);
    expect(page).toContain('{data._compliance.disclaimer}');
  });
});
