/// <reference types="jest" />
/**
 * Comp searches take their statuses from the CRM ("Under Contract") and from criteria an agent can edit and the
 * server stores. lib/comps/fetch-comps.ts kept its own table for them (the documented duplicate of
 * lib/compliance/status.ts, which says it is the only place that knows status strings) and passed any string it did
 * not know straight into the OData $filter, unescaped. Nothing tested the comps code at all.
 *
 * These tests pin three things: the statuses a comp search asks for are the canonical module's, each one a live
 * Cotality StandardStatus member (read from data/cotality-enums.live.json); the query text for the CRM's own defaults
 * is exactly what the old table produced; and a status that is not supported is refused, in the library and in both
 * routes, before any query is built or sent.
 */
import fs from 'fs';
import path from 'path';

const mockFetchFromTrestle = jest.fn<Promise<{ records: unknown[] }>, [Record<string, unknown>]>();
const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/lib/idx/fetch', () => ({ __esModule: true, fetchFromTrestle: (a: Record<string, unknown>) => mockFetchFromTrestle(a) }));
jest.mock('@/lib/idx/card-fields', () => ({ __esModule: true, CARD_SELECT_FIELDS: ['ListingId'] }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findUnique: (a: unknown) => mockFindUnique(a), update: (a: unknown) => mockUpdate(a) } },
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 1n, role: 'BROKER', userType: 'agent' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/listing-capabilities', () => ({
  __esModule: true,
  listingCapabilities: () => ({ mayViewHistory: true }),
  CAPABILITY_DENIED: { ACCESS: { error: 'denied' } },
  CAPABILITY_LISTING_SELECT: {},
}));
jest.mock('@/lib/api/safe-json', () => ({
  __esModule: true,
  safeJson: async (req: Request) => [await req.json(), null],
}));

import { NextRequest } from 'next/server';
import { fetchComps } from '@/lib/comps/fetch-comps';
import { buildDefaultCriteria } from '@/lib/comps/defaults';
import { COMP_STATUSES, UnsupportedCompStatusError, compStatusValue, compStatusValues } from '@/lib/comps/status';
import type { CompCriteria } from '@/lib/comps/types';
import { GET } from '@/app/api/crm/sales/comps/route';
import { PATCH } from '@/app/api/crm/sales/comps/criteria/route';

const CTX = {
  listing_id: 'SL-0001',
  building_name: 'The Example',
  street_number: null,
  street_name: null,
  neighborhood: 'Chelsea',
  borough: 'Manhattan',
  postal_code: '10001',
  property_type: 'Residential',
};

const DEFAULTS = (): CompCriteria =>
  buildDefaultCriteria({ beds: 2, baths: 1, sqft: 900, list_price: 1000000, neighborhood: 'Chelsea', building_name: 'The Example' });

function criteria(building: unknown, area: unknown): CompCriteria {
  const d = DEFAULTS();
  return { building: { ...d.building, statuses: building as string[] }, area: { ...d.area, statuses: area as string[] } };
}

const filters = (): string[] => mockFetchFromTrestle.mock.calls.map((c) => String(c[0].filter));
const statusClause = (filter: string): string => /\(?StandardStatus eq [^)]*\)?(?= and ModificationTimestamp)/.exec(filter)?.[0] ?? '';

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchFromTrestle.mockResolvedValue({ records: [] });
});

describe('which statuses a comp search asks for', () => {
  it.each([
    ['Active', 'Active'],
    ['Under Contract', 'ActiveUnderContract'],
    ['Closed', 'Closed'],
    ['Expired', 'Expired'],
    ['Coming Soon', 'ComingSoon'],
    ['Pending', 'Pending'],
    ['ActiveUnderContract', 'ActiveUnderContract'],
    ['Active Under Contract', 'ActiveUnderContract'],
    ['ComingSoon', 'ComingSoon'],
    ['CLOSED', 'Closed'],
    ['  Active  ', 'Active'],
  ])('%j is %s', (input, expected) => {
    expect(compStatusValue(input)).toBe(expected);
  });

  it.each([
    'Sold', 'Leased', 'Rented', 'Cancelled', 'Canceled', 'Withdrawn', 'Hold', 'On Hold', '', '   ', 'x',
    "Active' or StandardStatus ne 'Closed",
    "' or 1 eq 1 or StandardStatus eq '",
    'Active; drop',
    null, undefined, 5, {}, ['Active'],
  ])('refuses %j', (input) => {
    expect(() => compStatusValue(input)).toThrow(UnsupportedCompStatusError);
  });

  it('every allowed status is a member of live Cotality\'s StandardStatus', () => {
    const mirror = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8')) as {
      enums: Record<string, string[]>;
    };
    expect(mirror.enums.StandardStatus.length).toBeGreaterThan(5);
    for (const status of COMP_STATUSES) expect(mirror.enums.StandardStatus).toContain(status);
  });

  it('the statuses the CRM offers and the defaults use are all allowed', () => {
    const d = DEFAULTS();
    for (const s of [...d.building.statuses, ...d.area.statuses, 'Active', 'Under Contract', 'Closed', 'Expired']) {
      expect(() => compStatusValue(s)).not.toThrow();
    }
  });

  it('a list keeps its order, drops repeats and may be empty; a non-list is refused', () => {
    expect(compStatusValues(['Closed', 'Active', 'Under Contract', 'ActiveUnderContract', 'Closed'])).toEqual(['Closed', 'Active', 'ActiveUnderContract']);
    expect(compStatusValues([])).toEqual([]);
    for (const bad of [undefined, null, 'Active', { 0: 'Active' }, 7]) {
      expect(() => compStatusValues(bad)).toThrow(UnsupportedCompStatusError);
    }
  });

  it('the error names the value (cut short) and what is supported, and carries the value', () => {
    try {
      compStatusValue('Sold');
      throw new Error('expected a refusal');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedCompStatusError);
      expect((err as UnsupportedCompStatusError).message).toContain('"Sold"');
      expect((err as UnsupportedCompStatusError).message).toContain('Under Contract');
      expect((err as UnsupportedCompStatusError).value).toBe('Sold');
    }
    expect((() => { try { compStatusValue('x'.repeat(500)); } catch (e) { return (e as Error).message; } return ''; })().length).toBeLessThan(200);
  });
});

describe('the query text for the CRM\'s own defaults is what the old table produced', () => {
  it('building comps: Active, Under Contract, Closed', async () => {
    await fetchComps(CTX, DEFAULTS());
    expect(filters().some((f) => f.includes("(StandardStatus eq 'Active' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Closed') and ModificationTimestamp"))).toBe(true);
  });

  it('area comps: Active, Under Contract, Closed, Expired', async () => {
    await fetchComps(CTX, DEFAULTS());
    expect(filters().some((f) => f.includes("(StandardStatus eq 'Active' or StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Closed' or StandardStatus eq 'Expired') and ModificationTimestamp"))).toBe(true);
  });

  it('one status is one clause', async () => {
    await fetchComps(CTX, criteria(['Closed'], ['Closed']));
    expect(filters().map(statusClause)).toEqual(["StandardStatus eq 'Closed'", "StandardStatus eq 'Closed'"]);
  });

  it('Coming Soon and Pending, which the old table also knew, still work', async () => {
    await fetchComps(CTX, criteria(['Coming Soon'], ['Pending']));
    expect(filters().map(statusClause).sort()).toEqual(["StandardStatus eq 'ComingSoon'", "StandardStatus eq 'Pending'"]);
  });

  it('two spellings of one status are one clause', async () => {
    await fetchComps(CTX, criteria(['Under Contract', 'ActiveUnderContract'], ['Active']));
    expect(filters().map(statusClause).sort()).toEqual(["StandardStatus eq 'Active'", "StandardStatus eq 'ActiveUnderContract'"]);
  });

  it('an empty list is no status clause, as before, and both queries are still sent', async () => {
    await fetchComps(CTX, criteria([], []));
    expect(mockFetchFromTrestle).toHaveBeenCalledTimes(2);
    for (const f of filters()) expect(f).not.toContain('StandardStatus');
  });
});

describe('a status that is not supported is refused before any query is built or sent', () => {
  const INJECTION = "Active' or StandardStatus ne 'Closed";

  it('in the building scope', async () => {
    await expect(fetchComps(CTX, criteria([INJECTION], ['Active']))).rejects.toThrow(UnsupportedCompStatusError);
    expect(mockFetchFromTrestle).not.toHaveBeenCalled();
  });

  it('in the area scope, even though the building scope is fine (no half-sent pair)', async () => {
    await expect(fetchComps(CTX, criteria(['Active'], ['Sold']))).rejects.toThrow(UnsupportedCompStatusError);
    expect(mockFetchFromTrestle).not.toHaveBeenCalled();
  });

  it('when the stored criteria have no status list at all', async () => {
    await expect(fetchComps(CTX, criteria(undefined, ['Active']))).rejects.toThrow(UnsupportedCompStatusError);
    expect(mockFetchFromTrestle).not.toHaveBeenCalled();
  });
});

describe('GET /api/crm/sales/comps: stored criteria with a status that is not supported', () => {
  const row = (stored: unknown) => ({
    listing_id: 'SL-0001', bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, living_area: 900, list_price: 1000000,
    neighborhood: 'Chelsea', borough: 'Manhattan', postal_code: '10001', property_type: 'Residential', address: { BuildingName: 'The Example' },
    comp_criteria: stored,
  });
  const get = () => GET(new NextRequest('http://localhost/api/crm/sales/comps?listing_id=SL-0001'));

  it('answers 400 with the reason and sends no query and writes nothing', async () => {
    mockFindUnique.mockResolvedValue(row(criteria(['Sold'], ['Active'])));
    const res = await get();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Unsupported comp status: "Sold"');
    expect(mockFetchFromTrestle).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('answers 400 when the stored criteria carry no status list', async () => {
    const stored = criteria(['Active'], ['Active']) as unknown as { building: { statuses?: unknown } };
    delete stored.building.statuses;
    mockFindUnique.mockResolvedValue(row(stored));
    expect((await get()).status).toBe(400);
    expect(mockFetchFromTrestle).not.toHaveBeenCalled();
  });

  it('still answers 200 and queries both scopes for supported criteria', async () => {
    mockFindUnique.mockResolvedValue(row(DEFAULTS()));
    const res = await get();
    expect(res.status).toBe(200);
    expect(mockFetchFromTrestle).toHaveBeenCalledTimes(2);
  });
});

describe('PATCH /api/crm/sales/comps/criteria: only supported statuses are stored', () => {
  const patch = (body: unknown) =>
    PATCH(new NextRequest('http://localhost/api/crm/sales/comps/criteria', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ listing_id: 'SL-0001' });
    mockUpdate.mockResolvedValue({});
  });

  it('refuses an unsupported status with 400 and stores nothing', async () => {
    const res = await patch({ listing_id: 'SL-0001', criteria: criteria(["Active' or 1 eq 1 or '"], ['Active']) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Unsupported comp status');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses it in the area scope too', async () => {
    const res = await patch({ listing_id: 'SL-0001', criteria: criteria(['Active'], ['Rented']) });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('stores supported criteria exactly as sent', async () => {
    const sent = criteria(['Active', 'Under Contract'], ['Closed', 'Expired']);
    const res = await patch({ listing_id: 'SL-0001', criteria: sent });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect((mockUpdate.mock.calls[0][0] as { data: { comp_criteria: unknown } }).data.comp_criteria).toEqual(JSON.parse(JSON.stringify(sent)));
  });

  it('keeps the structure check that was already there', async () => {
    const res = await patch({ listing_id: 'SL-0001', criteria: { building: DEFAULTS().building } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('building and area');
  });
});

describe('the comps code keeps no status table of its own', () => {
  it('fetch-comps.ts takes its statuses from ./status', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../lib/comps/fetch-comps.ts'), 'utf8');
    expect(src).not.toContain('STATUS_MAP');
    expect(src).toContain('compStatusValues');
    expect(src).not.toMatch(/"Under Contract"\s*:\s*"ActiveUnderContract"/);
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
