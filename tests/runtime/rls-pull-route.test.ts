/**
 * GET /api/crm/rls-pull?rlsId= — pull a Mallan listing's property facts from Cotality by its RLS ID.
 *
 * Identifiers (kept apart, so nobody chases a phantom): the RLS ID is the listing's Cotality `ListingId` (RLS20123633); `ListingKey` (1194314473) is a DIFFERENT identifier; the Mallan
 * listing's own id is the SL ID (SL-0009). The fixture below has the shape of the live Cotality record for RLS20123633 (read 2026-11-03).
 */
import { NextRequest } from 'next/server';

const requireAgentOrBroker = jest.fn();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findFirst: jest.fn() } } }));
jest.mock('@/lib/auth', () => ({
  requireAgentOrBroker: (...a: unknown[]) => requireAgentOrBroker(...a),
  isAuthError: (v: { error?: boolean }) => !!v?.error,
}));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/crm/rls-pull/route';
import { LIVE_RLS20123633 } from './rls-fixtures';

const findFirst = prisma.listing.findFirst as unknown as jest.Mock;

let asked: string[] = [];
function stubCotality(rows: Record<string, unknown>[], ok = true) {
  asked = [];
  global.fetch = jest.fn(async (url: string) => { asked.push(decodeURIComponent(String(url).replace(/[+]/g, ' '))); return { ok, status: ok ? 200 : 503, json: async () => ({ value: rows }) }; }) as unknown as typeof fetch;
}

let callerSeq = 0;
async function pull(rlsId: string, listingId?: string) {
  const res = await GET(new NextRequest(`http://localhost/api/crm/rls-pull?rlsId=${encodeURIComponent(rlsId)}${listingId ? `&listingId=${listingId}` : ''}`, { headers: { 'x-forwarded-for': `10.20.${Math.floor(++callerSeq / 250)}.${callerSeq % 250}` } }));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  requireAgentOrBroker.mockReset().mockResolvedValue({ role: 'BROKER' });
  findFirst.mockReset().mockResolvedValue(null);
});

describe('the RLS ID of a Mallan listing is pulled from Cotality', () => {
  it('returns the property facts, the RLS ID and the ListingKey apart, and the REBNY custom keys flattened in', async () => {
    stubCotality([LIVE_RLS20123633]);
    const { status, body } = await pull('RLS20123633');
    expect(status).toBe(200);
    expect(body.rls).toEqual({ listing_id: 'RLS20123633', listing_key: '1194314473', status: 'Active', list_office_mls_id: '7041' });
    expect(body.record).toMatchObject({ ListPrice: 1200000, UnitNumber: '806', TaxLot: '1025', BuildingTaxLot: '7501', LivingArea: 1482, BathroomsFull: 3, YearBuilt: 1957, CommonInterest: 'Condominium', CurrentUse: 'MedicalDental' });
  });

  it('withholds what is the provider\'s own, and says so: identity, status, permissions, display flags, agent/office, activation, media and tour links', async () => {
    stubCotality([LIVE_RLS20123633]);
    const { body } = await pull('RLS20123633');
    for (const k of ['ListingId', 'ListingKey', 'ListingKeyNumeric', 'StandardStatus', 'Permission', 'InternetEntireListingDisplayYN', 'ListOfficeMlsId', 'ListAgentMlsId', 'ActivationDate',
      'PhotosCount', 'VideosCount', 'DocumentsCount', 'VirtualTourURLUnbranded', 'OriginatingSystemName', 'SourceSystemID', 'ModificationTimestamp']) {
      expect(body.record).not.toHaveProperty(k);
      expect(body.skipped.map((s: { field: string }) => s.field)).toContain(k);
    }
    expect(body.skipped.every((s: { reason: string }) => s.reason.length > 10)).toBe(true);
  });

  it('asks Cotality for the RLS ID as ListingId (never as ListingKey) and normalizes case', async () => {
    stubCotality([LIVE_RLS20123633]);
    await pull('rls20123633');
    const url = asked.find((u) => u.includes('/odata/Property'))!;
    expect(url).toContain("ListingId eq 'RLS20123633'");
    expect(url).not.toMatch(/ListingKey eq/);
  });

  it('refuses a ListingKey or anything else that is not an RLS ID, without calling Cotality', async () => {
    stubCotality([LIVE_RLS20123633]);
    for (const bad of ['1194314473', 'RLS12', 'abc', "RLS20123633' or 1 eq 1", '']) {
      const { status, body } = await pull(bad);
      expect(status).toBe(400);
      expect(body.error).toMatch(/not an RLS ID/);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses another office\'s listing, by ListOfficeMlsId (not by a company name)', async () => {
    stubCotality([{ ...LIVE_RLS20123633, ListOfficeMlsId: '9999', ListOfficeName: 'MAllan Real Estate Inc' }]);   // same NAME, different office id
    const { status, body } = await pull('RLS20123633');
    expect(status).toBe(403);
    expect(body.error).toMatch(/not a Mallan listing/);
  });

  it('404s an RLS ID Cotality does not have, and never picks a different listing the filter returned', async () => {
    stubCotality([]);
    expect((await pull('RLS20123633')).status).toBe(404);
    stubCotality([{ ...LIVE_RLS20123633, ListingId: 'RLS99999999' }]);
    expect((await pull('RLS20123633')).status).toBe(404);
  });

  it('409s when two records answer to one RLS ID (it cannot be pulled safely)', async () => {
    stubCotality([LIVE_RLS20123633, { ...LIVE_RLS20123633, ListingKey: '1' }]);
    expect((await pull('RLS20123633')).status).toBe(409);
  });

  it('a Cotality failure answers 502 with words an agent can act on', async () => {
    stubCotality([], false);
    const { status, body } = await pull('RLS20123633');
    expect(status).toBe(502);
    expect(body.error).toMatch(/Try again/);
  });

  it('a Mallan listing already linked to this RLS ID is returned, not duplicated, and Cotality is not asked', async () => {
    findFirst.mockResolvedValue({ id: BigInt(688026), listing_id: 'SL-0009' });
    stubCotality([LIVE_RLS20123633]);
    const { status, body } = await pull('RLS20123633');
    expect(status).toBe(200);
    expect(body.existing).toEqual({ id: '688026', listing_id: 'SL-0009' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ raw_data: { path: ['saleRlsId'], equals: 'RLS20123633' } });
  });

  it('needs a signed-in agent', async () => {
    requireAgentOrBroker.mockResolvedValue({ error: true });
    stubCotality([LIVE_RLS20123633]);
    expect((await pull('RLS20123633')).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('a saved listing asks about its own RLS link (the form follows RealPlus)', () => {
  it('the listing linked to the RLS ID, asking with its own id, is given the record (not "already linked")', async () => {
    stubCotality([LIVE_RLS20123633]);
    findFirst.mockResolvedValue({ id: 7, listing_id: 'SL-0010' });
    const { status, body } = await pull('RLS20123633', '7');
    expect(status).toBe(200);
    expect(body.existing).toBeUndefined();
    expect(body.record).toMatchObject({ BathroomsFull: 3, RoomsTotal: 8, YearBuilt: 1957 });
    expect(body.rls.listing_id).toBe('RLS20123633');
    const bySl = await pull('RLS20123633', 'sl-0010');                       // the form may have been opened by the SL id
    expect(bySl.body.record).toBeDefined();
  });

  it('another listing, or no listing, asking about that RLS ID is still told it is already linked to SL-0010, and Cotality is not asked', async () => {
    stubCotality([LIVE_RLS20123633]);
    findFirst.mockResolvedValue({ id: 7, listing_id: 'SL-0010' });
    for (const asker of [undefined, '8', '']) {
      const { status, body } = await pull('RLS20123633', asker);
      expect(status).toBe(200);
      expect(body.existing).toEqual({ id: '7', listing_id: 'SL-0010' });
      expect(body.record).toBeUndefined();
    }
    expect(asked).toEqual([]);
  });

  it('asking with its own id still checks the listing office: a record of another office is refused, as for any pull', async () => {
    stubCotality([{ ...LIVE_RLS20123633, ListOfficeMlsId: '9999' }]);
    findFirst.mockResolvedValue({ id: 7, listing_id: 'SL-0010' });
    const { status } = await pull('RLS20123633', '7');
    expect(status).toBe(403);
  });
});
