/// <reference types="jest" />
/**
 * Maya, 2026-11-04: "on the crm i have still two of the same listing".
 *
 * CRM My Listings reads two kinds of rows: Mallan's own SL- / RL- records and every Cotality row whose list office is Mallan (that is how
 * her closed history shows). Her own listing comes back through Cotality as an `RLS*` row, so one listing was listed twice (SL-0010 and
 * RLS20123633; SL-0004 and RLS20093870) and "Active (4)" was really two listings. The public site already shows one card; the CRM list was
 * left showing both "for cleanup decisions" (lib/listings/dedupe-crm-vs-idx.ts, 2026-05-28). She does not want that.
 *
 * The rule: a Cotality row is the copy of her listing when it is the same physical unit as one of her own SL- / RL- records (the site's one
 * address identity) AND both are live. Her closed history stays: an earlier deal of the same unit is not the live listing.
 */
import { cotalityCopiesOfOwnListings } from '@/lib/listings/dedupe-crm-vs-idx';
import { buildPrismaMock, makeRequest } from './helpers';
import type { NextRequest } from 'next/server';


// What the listings table holds (address is the PascalCase JSON the Cotality sync writes; the CRM form writes the street name whole).
const SL_0010 = { listing_id: 'SL-0010', status: 'Active', listing_type: 'sale', address: { StreetNumber: '800', StreetName: '2nd Avenue', UnitNumber: '806', PostalCode: '10017' } };
const RLS_0010 = { listing_id: 'RLS20123633', status: 'Active', listing_type: 'sale', address: { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', UnitNumber: '806', PostalCode: '10017' } };
const SL_0004 = { listing_id: 'SL-0004', status: 'Active', listing_type: 'sale', address: { StreetNumber: '333', StreetName: 'East 46Th Street', UnitNumber: '2G', PostalCode: '10017' } };
const RLS_0004 = { listing_id: 'RLS20093870', status: 'Active', listing_type: 'sale', address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'Street', UnitNumber: '2G', PostalCode: '10017' } };

const copies = (...rows: Array<{ listing_id: string; status: string | null; address: unknown; listing_type?: string | null }>) => cotalityCopiesOfOwnListings(rows);

describe('the Cotality copy of her own listing is left out of My Listings', () => {
  it('SL-0010 and its Cotality row are one listing: the copy is left out', () => {
    expect(copies(SL_0010, RLS_0010)).toEqual(['RLS20123633']);
  });

  it('SL-0004 and its copy are one listing although one spells "East 46Th Street" and the other "E" + "46TH" + "Street"', () => {
    expect(copies(SL_0004, RLS_0004)).toEqual(['RLS20093870']);
  });

  it('both listings at once: each copy goes, each own record stays', () => {
    expect(copies(SL_0010, RLS_0010, SL_0004, RLS_0004).sort()).toEqual(['RLS20093870', 'RLS20123633']);
  });

  it('her own record is never the one left out, whatever order the rows come in', () => {
    expect(copies(RLS_0010, SL_0010)).toEqual(['RLS20123633']);
    expect(copies(SL_0010, RLS_0010).some((id) => /^(SL|RL)-/.test(id))).toBe(false);
  });

  it('a rental follows the same rule (RL- record and its Cotality row)', () => {
    const rl = { listing_id: 'RL-0003', status: 'Active', listing_type: 'rent', address: { StreetNumber: '40', StreetName: 'West 12th Street', UnitNumber: '5B', PostalCode: '10011' } };
    const rls = { listing_id: 'RLS20077777', status: 'Active', listing_type: 'rent', address: { StreetNumber: '40', StreetDirPrefix: 'W', StreetName: '12TH', StreetSuffix: 'Street', UnitNumber: '5B', PostalCode: '10011' } };
    expect(copies(rl, rls)).toEqual(['RLS20077777']);
  });

  it.each(['Pending', 'ActiveUnderContract', 'ComingSoon', 'Active'])('a copy %s beside a record in the SAME status is the same live listing: left out', (status) => {
    expect(copies({ ...SL_0010, status }, { ...RLS_0010, status })).toEqual(['RLS20123633']);
  });
});

// Compliance gate on this PR (2026-11-06, Master 4.4: "Address alone is not sufficient evidence for automatic suppression. Uncertain identity goes to review."):
// the same address is not enough. These rows are NOT hidden, because the agent must see both.
describe('identity that is not proved stays visible', () => {
  it.each(['Pending', 'ActiveUnderContract', 'ComingSoon'])('a copy that is %s beside an Active record is shown: Cotality has moved on, or the record is stale', (status) => {
    expect(copies(SL_0010, { ...RLS_0010, status })).toEqual([]);
  });

  it('a live rental of the unit beside a live SALE record is another listing (the feed holds both kinds for 800 2nd Ave #806 and 333 E 46th #2G)', () => {
    expect(copies(SL_0010, { ...RLS_0010, listing_id: 'RLS10612741', listing_type: 'rent' })).toEqual([]);
    expect(copies(SL_0004, { ...RLS_0004, listing_id: 'RLS10858480', listing_type: 'rent' })).toEqual([]);
  });

  it('a live sale row beside a live RENTAL record is another listing', () => {
    const rl = { ...SL_0010, listing_id: 'RL-0009', listing_type: 'rent' };
    expect(copies(rl, RLS_0010)).toEqual([]);
  });

  it('the sale copy is still hidden when a rental of the same unit is also in the list', () => {
    expect(copies(SL_0010, RLS_0010, { ...RLS_0010, listing_id: 'RLS10612741', listing_type: 'rent' })).toEqual(['RLS20123633']);
  });

  it('a row that does not say sale or rent can not be proved the same listing', () => {
    expect(copies({ ...SL_0010, listing_type: null }, RLS_0010)).toEqual([]);
    expect(copies(SL_0010, { ...RLS_0010, listing_type: null })).toEqual([]);
    expect(copies(SL_0010, { ...RLS_0010, listing_type: undefined })).toEqual([]);
    expect(copies(SL_0010, { ...RLS_0010, listing_type: 'lease' })).toEqual([]);
  });
});

describe('her closed history and other listings are NOT touched', () => {
  it('an earlier closed deal of the same unit stays (it is history, not the live listing)', () => {
    const earlier = { listing_id: 'RLS10731386', status: 'Closed', address: RLS_0010.address };
    expect(copies(SL_0010, RLS_0010, earlier)).toEqual(['RLS20123633']);
  });

  it('a listing that is over on both sides is kept on both (an expired record and its expired Cotality row are history, not a live duplicate)', () => {
    const sl = { ...SL_0010, listing_id: 'SL-0007', status: 'Expired' };
    expect(copies(sl, { ...RLS_0010, status: 'Expired' })).toEqual([]);
    expect(copies({ ...SL_0010, status: 'Closed' }, { ...RLS_0010, status: 'Closed' })).toEqual([]);
  });

  it('a live Cotality row beside an over record is not hidden (the record no longer stands for a live listing)', () => {
    expect(copies({ ...SL_0010, status: 'Expired' }, RLS_0010)).toEqual([]);
  });

  it('a Cotality row with no record of hers (a deal that was never in the CRM) stays', () => {
    expect(copies(RLS_0010, RLS_0004)).toEqual([]);
  });

  it('another unit in the same building is not a copy', () => {
    expect(copies(SL_0010, { ...RLS_0010, address: { ...RLS_0010.address, UnitNumber: '807' } })).toEqual([]);
  });

  it('no unit number: it cannot be proved the same unit, so nothing is hidden', () => {
    const noUnit = (a: any) => ({ ...a, address: { ...a.address, UnitNumber: '' } });
    expect(copies(noUnit(SL_0010), noUnit(RLS_0010))).toEqual([]);
  });

  it('another ZIP is another unit', () => {
    expect(copies(SL_0010, { ...RLS_0010, address: { ...RLS_0010.address, PostalCode: '10016' } })).toEqual([]);
  });

  it('a status the CRM does not recognise is not treated as live', () => {
    expect(copies(SL_0010, { ...RLS_0010, status: null })).toEqual([]);
    expect(copies(SL_0010, { ...RLS_0010, status: 'whatever' })).toEqual([]);
  });

  it('an empty set, and rows with no address at all, are fine', () => {
    expect(copies()).toEqual([]);
    expect(copies({ listing_id: 'SL-0001', status: 'Active', address: null }, { listing_id: 'RLS1', status: 'Active', address: null })).toEqual([]);
  });
});

// ─── the endpoint ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const listingFindMany: jest.Mock = jest.fn();
const listingCount: jest.Mock = jest.fn();
const agentFindUnique: jest.Mock = jest.fn();
const { prisma: prismaMock } = buildPrismaMock({
  listing: { findMany: listingFindMany, count: listingCount },
  agent: { findUnique: agentFindUnique },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
const requireAgentOrBroker: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (...a: unknown[]) => requireAgentOrBroker(...a),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

import { GET } from '@/app/api/crm/listings/route';

function getReq(url: string): NextRequest {
  const req = makeRequest({ method: 'GET', url });
  Object.defineProperty(req, 'nextUrl', { get: () => new URL(url), configurable: true });
  return req;
}

/** The list query (it has a page size); the duplicate check is the other findMany, which reads three small columns. */
const listQuery = () => listingFindMany.mock.calls.map((c) => c[0]).find((a: any) => a && a.select && a.select.id) as any;
const ownSetQuery = () => listingFindMany.mock.calls.map((c) => c[0]).find((a: any) => a && a.select && !a.select.id) as any;

function arrange(ownRows: unknown[]) {
  listingFindMany.mockReset(); listingCount.mockReset(); agentFindUnique.mockReset(); requireAgentOrBroker.mockReset();
  requireAgentOrBroker.mockResolvedValue({ userId: 'agent-1', userType: 'agent', role: 'BROKER' });
  listingFindMany.mockImplementation(async (args: any) => (args && args.select && args.select.id ? [] : ownRows));
  listingCount.mockResolvedValue(0);
}

describe('GET /api/crm/listings asks for one row per listing', () => {
  it('leaves the Cotality copy out of the list AND of the count, so the tab numbers and the pages add up', async () => {
    arrange([SL_0010, RLS_0010, SL_0004, RLS_0004, { listing_id: 'RLS10731386', status: 'Closed', address: RLS_0010.address }]);
    const res = await GET(getReq('http://localhost/api/crm/listings?type=sale&limit=50'));
    expect(res.status).toBe(200);
    const list = listQuery();
    expect(list.where.NOT).toEqual({ listing_id: { in: expect.arrayContaining(['RLS20123633', 'RLS20093870']) } });
    expect(list.where.NOT.listing_id.in).toHaveLength(2);                                  // the earlier closed deal is not in it
    expect(listingCount).toHaveBeenCalledTimes(1);
    expect((listingCount.mock.calls[0][0] as any).where.NOT).toEqual(list.where.NOT);      // same where: total = what the pages hold
  });

  it('keeps her own-listings scope, and the type filter, exactly as before', async () => {
    arrange([SL_0010, RLS_0010]);
    await GET(getReq('http://localhost/api/crm/listings?type=sale&status=Active&limit=50'));
    const list = listQuery();
    expect(list.where.listing_type).toBe('sale');
    expect(list.where.status).toBe('Active');
    expect(list.where.OR).toHaveLength(3);                                                  // SL-, RL-, and Mallan's own office rows
  });

  it('checks for duplicates over her whole LIVE set (not the filtered page): three columns, terminal statuses left out in the database, and capped', async () => {
    arrange([SL_0010, RLS_0010]);
    await GET(getReq('http://localhost/api/crm/listings?type=sale&status=Active&limit=5'));
    const own = ownSetQuery();
    expect(own.select).toEqual({ listing_id: true, status: true, address: true, listing_type: true });
    expect(own.where.listing_type).toBeUndefined();                                          // not narrowed by the tab the agent is on
    expect(own.where.status).toEqual({ notIn: ['Cancelled', 'Closed', 'Expired', 'Leased', 'Rented', 'Sold', 'Withdrawn'] });   // what can still be live; never the tab's status filter
    expect(own.take).toBe(2000);                                                             // bounded: it grows with the live inventory, not with every sale ever closed
    expect(own.where.OR).toHaveLength(3);
  });

  it('adds nothing when there is no copy to leave out', async () => {
    arrange([SL_0010, { ...RLS_0010, listing_id: 'RLS10731386', status: 'Closed' }]);
    await GET(getReq('http://localhost/api/crm/listings?limit=50'));
    expect(listQuery().where.NOT).toBeUndefined();
  });

  it('an agent (not the broker) still sees only the rows assigned to them, and the copy is left out too', async () => {
    arrange([SL_0010, RLS_0010]);
    requireAgentOrBroker.mockResolvedValue({ userId: 'agent-9', userType: 'agent', role: 'AGENT' });
    agentFindUnique.mockResolvedValue({ trestle_mls_id: 'M123' });
    await GET(getReq('http://localhost/api/crm/listings?limit=50'));
    const list = listQuery();
    expect(list.where.AND).toHaveLength(2);                                                 // own-scope AND mine: unchanged
    expect(list.where.NOT).toEqual({ listing_id: { in: ['RLS20123633'] } });
    expect(ownSetQuery().where.AND).toHaveLength(2);                                        // the duplicate check is scoped to the agent too
  });
});
