/// <reference types="jest" />
/**
 * Owner ruling (Maya, 2026-09-08 evening) applied to EVERY CMA / comparable path:
 *
 *   - every comp record carries status = the EXACT live Cotality StandardStatus token (a legacy stored
 *     'Sold' / 'Rented' / 'Leased' row normalizes to Closed) plus a status_label per transaction
 *     (Closed → "Sold" on a sale, "Rented" on a rental; Pending → "In Contract" on a sale);
 *   - close_date (CloseDate) and close_price (ClosePrice) exist ONLY on a closed comp — an active asking price is
 *     context, never a close price, and a closed comp without a CloseDate is never dated by anything else;
 *   - sale and rental never mix: the DB engine (listing_type), the provider fetch (PropertyType + sameType +
 *     the transaction handed to the eligibility authority), the prospect comps route (PropertyType by the
 *     requested transaction, StandardStatus eq 'Closed' on BOTH branches);
 *   - agent-selected comp criteria accept ONLY live tokens or the transaction's canonical labels; anything else
 *     is refused with the offending value and never reaches OData.
 *
 * Provider facts used here are the committed live contract (lib/cotality/generated/contract.ts): PropertyType
 * members 'Residential' / 'ResidentialLease'; StandardStatus members incl. 'Closed', 'Pending', 'Active'.
 *
 * RESTORED 2026-09-09 from docs/operations/evidence-2026-09-08/status/pending-surface-specs/. Two adjustments
 * to the parked text, both from the later owner rulings:
 *   - the DB-engine cases now state a `neighborhood`. A CMA is a LOCATED comparison and the engine refuses a
 *     subject with neither neighborhood nor borough rather than searching the whole city (Maya, 2026-09-09);
 *   - the closed-rental cases assert CloseDate + ClosePrice, because a closed ResidentialLease carries both
 *     (verified live 2026-09-09: 200/200 closed lease rows). There is no rental-specific close field - only a
 *     different LABEL ("Rented" against a sale's "Sold").
 * Market DOM is not asserted here; the DOM ruling is proved in lib/compliance/__tests__ and its dedicated
 * runtime suites. Everything else is the parked intent verbatim: exact tokens, per-transaction labels, real
 * close facts, and no sale/rental mixing on any of the three CMA paths.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { makeRequest } from './helpers';

const ROOT = path.resolve(__dirname, '../..');
const ASOF = new Date('2026-09-08T12:00:00Z');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── Mocks ────────────────────────────────────────────────────────────────────────────────────────────────

const listingFindMany = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const listingFindUnique = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const listingUpdate = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const sellerLeadFindFirst = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const sellerLeadUpdate = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findMany: listingFindMany, findUnique: listingFindUnique, update: listingUpdate },
    sellerLead: { findFirst: sellerLeadFindFirst, update: sellerLeadUpdate },
  },
}));

jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

const requireAgentOrBrokerMock = jest.fn();
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));

jest.mock('@/lib/auth/listing-capabilities', () => ({
  __esModule: true,
  CAPABILITY_LISTING_SELECT: { listing_id: true },
  CAPABILITY_DENIED: { ACCESS: { error: 'denied' } },
  listingCapabilities: () => ({ mayViewHistory: true }),
}));

jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: async () => 'token' }));

const fetchFromTrestleMock = jest.fn<Promise<{ records: Record<string, unknown>[] }>, unknown[]>(async () => ({ records: [] }));
jest.mock('@/lib/idx/fetch', () => ({ __esModule: true, fetchFromTrestle: fetchFromTrestleMock }));

beforeEach(() => {
  listingFindMany.mockReset(); listingFindMany.mockResolvedValue([]);
  listingFindUnique.mockReset(); listingFindUnique.mockResolvedValue(null);
  listingUpdate.mockReset(); listingUpdate.mockResolvedValue({});
  sellerLeadFindFirst.mockReset(); sellerLeadFindFirst.mockResolvedValue(null);
  sellerLeadUpdate.mockReset(); sellerLeadUpdate.mockResolvedValue({});
  fetchFromTrestleMock.mockReset(); fetchFromTrestleMock.mockResolvedValue({ records: [] });
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({ userId: 42n, userType: 'broker', role: 'BROKER', sessionId: 's-1' });
  logAuditEventMock.mockClear();
});

const LIVE_TOKENS = ['Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon', 'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'];

// ─── 1. The criteria vocabulary ────────────────────────────────────────────────────────────────────────────

describe('comp criteria accept only live StandardStatus tokens or the transaction canonical labels', () => {
  const sc = () => require('@/lib/comps/status-criteria');

  it('every live token resolves to itself on both transactions', () => {
    const { resolveCompStatusCriterion } = sc();
    for (const t of LIVE_TOKENS) {
      expect(resolveCompStatusCriterion(t, 'sale')).toBe(t);
      expect(resolveCompStatusCriterion(t, 'rental')).toBe(t);
    }
  });

  it('the sale labels resolve through the sale mapping only (Sold → Closed, In Contract → Pending)', () => {
    const { resolveCompStatusCriterion } = sc();
    expect(resolveCompStatusCriterion('Sold', 'sale')).toBe('Closed');
    expect(resolveCompStatusCriterion('In Contract', 'sale')).toBe('Pending');
    expect(resolveCompStatusCriterion('Coming Soon', 'sale')).toBe('ComingSoon');
    expect(resolveCompStatusCriterion('Active Under Contract', 'sale')).toBe('ActiveUnderContract');
    expect(resolveCompStatusCriterion('Rented', 'sale')).toBeNull();
  });

  it('the rental labels resolve through the rental mapping only (Rented → Closed)', () => {
    const { resolveCompStatusCriterion } = sc();
    expect(resolveCompStatusCriterion('Rented', 'rental')).toBe('Closed');
    expect(resolveCompStatusCriterion('Sold', 'rental')).toBeNull();
    expect(resolveCompStatusCriterion('In Contract', 'rental')).toBeNull();
  });

  it('refuses anything else — display names, legacy spellings, workflow words, blanks', () => {
    const { resolveCompStatusCriterion } = sc();
    for (const v of ['Under Contract', 'Cancelled', 'Leased', 'OfferOut', 'closed', 'SOLD', '', '  ', null, undefined, 42]) {
      expect(resolveCompStatusCriterion(v, 'sale')).toBeNull();
      expect(resolveCompStatusCriterion(v, 'rental')).toBeNull();
    }
  });

  it('labels the token per transaction', () => {
    const { compStatusLabel } = sc();
    expect(compStatusLabel('Closed', 'sale')).toBe('Sold');
    expect(compStatusLabel('Closed', 'rental')).toBe('Rented');
    expect(compStatusLabel('Pending', 'sale')).toBe('In Contract');
    expect(compStatusLabel('Active', 'rental')).toBe('Active');
  });

  it('validateCompCriteria returns a copy with resolved tokens and throws the offending value', () => {
    const { validateCompCriteria, CompCriteriaError } = sc();
    const range = { beds_min: 1, beds_max: 2, baths_min: 1, baths_max: 2, sqft_min: null, sqft_max: null, sqft_enabled: false, months_back: 12 };
    const ok = validateCompCriteria({ building: { ...range, statuses: ['Sold', 'Active'] }, area: { ...range, statuses: ['In Contract'], price_min: null, price_max: null, neighborhoods: [] } }, 'sale');
    expect(ok.building.statuses).toEqual(['Closed', 'Active']);
    expect(ok.area.statuses).toEqual(['Pending']);
    let err: unknown = null;
    try { validateCompCriteria({ building: { ...range, statuses: ['Closed'] }, area: { ...range, statuses: ['Under Contract'], price_min: null, price_max: null, neighborhoods: [] } }, 'sale'); }
    catch (e) { err = e; }
    expect(err).toBeInstanceOf(CompCriteriaError);
    expect((err as { value: unknown }).value).toBe('Under Contract');
    expect((err as { scope: unknown }).scope).toBe('area');
  });

  it('the default criteria hold live tokens only (no display names)', () => {
    const { buildDefaultCriteria } = require('@/lib/comps/defaults');
    const c = buildDefaultCriteria({ beds: 2, baths: 1, sqft: 900, list_price: 1_000_000, neighborhood: 'Yorkville', building_name: null });
    for (const s of [...c.building.statuses, ...c.area.statuses]) expect(LIVE_TOKENS).toContain(s);
    expect(c.building.statuses).not.toContain('Under Contract');
    expect(c.area.statuses).not.toContain('Under Contract');
    expect(c.building.statuses).toContain('Closed');
  });

  it('the provider clause is built from resolved tokens and an unknown criterion never reaches OData', () => {
    const { compsStatusWindowFilter, compsOrderBy } = require('@/lib/comps/fetch-comps');
    const { CompCriteriaError } = sc();
    expect(compsStatusWindowFilter(['Sold'], 6, ASOF, 'sale')).toBe("(StandardStatus eq 'Closed' and CloseDate ge 2026-03-08)");
    expect(compsStatusWindowFilter(['Rented'], 6, ASOF, 'rental')).toBe("(StandardStatus eq 'Closed' and CloseDate ge 2026-03-08)");
    expect(compsStatusWindowFilter(['In Contract', 'Active'], 6, ASOF, 'sale')).toBe("(StandardStatus eq 'Pending' or StandardStatus eq 'Active')");
    expect(() => compsStatusWindowFilter(['Under Contract'], 6, ASOF, 'sale')).toThrow(CompCriteriaError);
    expect(() => compsStatusWindowFilter(['Rented'], 6, ASOF, 'sale')).toThrow(/Rented/);
    expect(() => compsOrderBy(['Under Contract'], 'sale')).toThrow(CompCriteriaError);
    expect(compsOrderBy(['Sold'], 'sale')).toBe('CloseDate desc');
  });
});

// ─── 2. The provider comp fetch ────────────────────────────────────────────────────────────────────────────

const providerRow = (over: Record<string, unknown>): Record<string, unknown> => ({
  ListingId: 'RLS-X', StreetNumber: '400', StreetName: 'East 90th Street', UnitNumber: '17C', PropertyType: 'Residential',
  StandardStatus: 'Closed', BedroomsTotal: 2, BathroomsTotalInteger: 1, LivingArea: 900, ListPrice: 1_000_000,
  ClosePrice: 980_000, CloseDate: '2026-06-01', OnMarketDate: '2026-03-01', CommonInterest: 'Condominium', ...over,
});

describe('provider comps carry exact tokens, per-transaction labels, close facts only on closings, and never mix', () => {
  const range = { statuses: ['Closed', 'Active', 'Pending'], months_back: 12, beds_min: 1, beds_max: 3, baths_min: 1, baths_max: 2, sqft_min: null, sqft_max: null, sqft_enabled: false };
  const criteria = { building: range, area: { ...range, neighborhoods: [], price_min: null, price_max: null } };
  const ctx = (propertyType: string) => ({
    listing_id: 'SUBJECT', building_name: 'Test Building', street_number: null, street_name: null,
    borough: 'Manhattan', postal_code: '10128', neighborhood: null, property_type: propertyType,
  });
  const records = [
    providerRow({ ListingId: 'CLOSED-SALE' }),
    // an ACTIVE row that still carries stale close keys: never a close price / date
    providerRow({ ListingId: 'ACTIVE-SALE', StandardStatus: 'Active', ClosePrice: 999_999, CloseDate: '2025-01-01' }),
    providerRow({ ListingId: 'PENDING-SALE', StandardStatus: 'Pending', ClosePrice: null, CloseDate: null }),
    providerRow({ ListingId: 'CLOSED-LEASE', PropertyType: 'ResidentialLease', ListPrice: 5000, ClosePrice: 4800 }),
    // a provider row whose status is not a live member is refused, never defaulted
    providerRow({ ListingId: 'NOT-LIVE', StandardStatus: 'Sold' }),
  ];

  it('a Residential subject receives only Residential comps with sale labels', async () => {
    fetchFromTrestleMock.mockResolvedValue({ records });
    const { fetchComps } = require('@/lib/comps/fetch-comps');
    const res = await fetchComps(ctx('Residential'), criteria);
    expect(res.transaction).toBe('sale');
    for (const c of [...res.building, ...res.area]) {
      expect(LIVE_TOKENS).toContain(c.status);
      expect(c.property_type).toBe('Residential');
    }
    const ids = res.building.map((c: { listing_id: string }) => c.listing_id).sort();
    expect(ids).toEqual(['ACTIVE-SALE', 'CLOSED-SALE', 'PENDING-SALE']);
    const closed = res.building.find((c: { listing_id: string }) => c.listing_id === 'CLOSED-SALE');
    expect(closed).toMatchObject({ status: 'Closed', status_label: 'Sold', close_price: 980_000, close_date: '2026-06-01' });
    const active = res.building.find((c: { listing_id: string }) => c.listing_id === 'ACTIVE-SALE');
    expect(active).toMatchObject({ status: 'Active', status_label: 'Active', close_price: null, close_date: null, list_price: 1_000_000 });
    const pending = res.building.find((c: { listing_id: string }) => c.listing_id === 'PENDING-SALE');
    expect(pending).toMatchObject({ status: 'Pending', status_label: 'In Contract', close_price: null, close_date: null });
    for (const [request] of fetchFromTrestleMock.mock.calls as Array<[{ filter: string }]>) {
      expect(request.filter).toContain("PropertyType eq 'Residential'");
      expect(request.filter).not.toContain('Sold');
    }
  });

  it('a ResidentialLease subject receives only lease comps labelled Rented', async () => {
    fetchFromTrestleMock.mockResolvedValue({ records });
    const { fetchComps } = require('@/lib/comps/fetch-comps');
    const res = await fetchComps(ctx('ResidentialLease'), criteria);
    expect(res.transaction).toBe('rental');
    expect(res.building.map((c: { listing_id: string }) => c.listing_id)).toEqual(['CLOSED-LEASE']);
    expect(res.building[0]).toMatchObject({ status: 'Closed', status_label: 'Rented', close_price: 4800, close_date: '2026-06-01', property_type: 'ResidentialLease' });
  });

  it('a subject without a live PropertyType transaction cannot be compared', async () => {
    const { fetchComps } = require('@/lib/comps/fetch-comps');
    await expect(fetchComps(ctx('Specialty'), criteria)).rejects.toThrow(/transaction/i);
  });

  it('the eligibility authority receives the subject transaction (source guard)', () => {
    const src = read('lib/comps/fetch-comps.ts');
    expect(src).toMatch(/applyCompEligibility\([^)]*transactionType/);
    expect(src).not.toMatch(/STATUS_MAP\[s\] \|\| s/);
  });
});

// ─── 3. The DB CMA engine ──────────────────────────────────────────────────────────────────────────────────

describe('the DB CMA engine stores exact tokens (legacy spellings normalized) with per-transaction labels', () => {
  const closeDate = new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10);
  const row = (listingType: string, over: Record<string, unknown>) => ({
    listing_id: 'X', listing_type: listingType, address: { StreetNumber: '400', StreetName: 'East 90th Street' },
    list_price: listingType === 'sale' ? 1_000_000 : 5000, bedrooms_total: 2, bathrooms_full: 1, living_area: null,
    status: 'Closed', days_on_market: 0, sync_status: 'synced', terminal_since: null,
    internet_address_display_yn: true, internet_entire_listing_display_yn: true,
    raw_data: { CloseDate: closeDate, ClosePrice: listingType === 'sale' ? 900_000 : 4500, OnMarketDate: '2026-01-01' },
    ...over,
  });

  it('sale: a legacy Sold row becomes Closed / Sold with its close facts; Active carries no close facts; Pending reads In Contract', async () => {
    listingFindMany.mockResolvedValue([
      row('sale', { listing_id: 'LEGACY-SOLD', status: 'Sold' }),
      row('sale', { listing_id: 'ACTIVE', status: 'Active', raw_data: { ClosePrice: 123, CloseDate: '2025-01-01', OnMarketDate: '2026-01-01' } }),
      row('sale', { listing_id: 'PENDING', status: 'Pending', raw_data: { OnMarketDate: '2026-01-01', PurchaseContractDate: '2026-08-01' } }),
      row('rent', { listing_id: 'WRONG-TYPE', status: 'Rented' }),
    ]);
    const { findComps } = require('@/lib/cma/engine');
    const comps = await findComps({ property_address: 'Subject', neighborhood: 'Yorkville', listing_type: 'sale', bedrooms: 2, bathrooms: 1 });
    const byId = Object.fromEntries(comps.map((c: { listing_id: string }) => [c.listing_id, c]));
    expect(Object.keys(byId).sort()).toEqual(['ACTIVE', 'LEGACY-SOLD', 'PENDING']);
    for (const c of comps) { expect(LIVE_TOKENS).toContain(c.status); expect(c.transaction).toBe('sale'); }
    expect(byId['LEGACY-SOLD']).toMatchObject({ status: 'Closed', status_label: 'Sold', close_price: 900_000, close_date: closeDate });
    expect(byId['ACTIVE']).toMatchObject({ status: 'Active', status_label: 'Active', close_price: null, close_date: null });
    expect(byId['PENDING']).toMatchObject({ status: 'Pending', status_label: 'In Contract', close_price: null, close_date: null });
    // the DB filter keeps reading the legacy spellings (never writes them)
    const where = listingFindMany.mock.calls.at(-1)![0] as { where: { OR: Array<{ status?: { in?: string[] } }> } };
    const closedClause = where.where.OR.find((c) => c.status && typeof c.status === 'object')!;
    expect(closedClause.status!.in).toEqual(expect.arrayContaining(['Closed', 'Sold', 'Rented', 'Leased']));
  });

  it('rental: legacy Rented / Leased rows become Closed / Rented; a sale row never enters', async () => {
    listingFindMany.mockResolvedValue([
      row('rent', { listing_id: 'LEGACY-RENTED', status: 'Rented' }),
      row('rent', { listing_id: 'LEGACY-LEASED', status: 'Leased' }),
      row('rent', { listing_id: 'ACTIVE', status: 'Active', raw_data: { OnMarketDate: '2026-01-01' } }),
      row('sale', { listing_id: 'WRONG-TYPE', status: 'Sold' }),
    ]);
    const { findComps, estimateValue } = require('@/lib/cma/engine');
    const comps = await findComps({ property_address: 'Subject', neighborhood: 'Yorkville', listing_type: 'rental', bedrooms: 2, bathrooms: 1 });
    const byId = Object.fromEntries(comps.map((c: { listing_id: string }) => [c.listing_id, c]));
    expect(Object.keys(byId).sort()).toEqual(['ACTIVE', 'LEGACY-LEASED', 'LEGACY-RENTED']);
    expect(byId['LEGACY-RENTED']).toMatchObject({ status: 'Closed', status_label: 'Rented', close_price: 4500, close_date: closeDate, transaction: 'rental' });
    expect(byId['LEGACY-LEASED']).toMatchObject({ status: 'Closed', status_label: 'Rented', close_price: 4500 });
    expect(byId['ACTIVE']).toMatchObject({ status: 'Active', close_price: null, close_date: null });
    expect(estimateValue(comps).estimated).toBe(4500);
  });
});

// ─── 4. The prospect comps route ───────────────────────────────────────────────────────────────────────────

describe('GET /api/crm/sales/prospects/[id]/comps — closed comps of the requested transaction only', () => {
  const params = { params: Promise.resolve({ id: '7' }) };
  const originalFetch = global.fetch;
  const fetchSpy = jest.fn();
  beforeEach(() => { fetchSpy.mockReset(); global.fetch = fetchSpy as unknown as typeof fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const trestleRows = [
    { ListingId: 'CLOSED-LEASE', UnparsedAddress: '400 East 90th Street', UnitNumber: '17C', StandardStatus: 'Closed', PropertyType: 'ResidentialLease', ClosePrice: 4800, CloseDate: '2026-06-01', BedroomsTotal: 2, BathroomsFull: 1, LivingArea: 900, BuildingName: 'B', PropertySubType: 'Apartment' },
    { ListingId: 'ACTIVE-LEASE', UnparsedAddress: '402 East 90th Street', StandardStatus: 'Active', PropertyType: 'ResidentialLease', ListPrice: 5000, ClosePrice: 4700, CloseDate: '2025-01-01', BedroomsTotal: 2, BathroomsFull: 1 },
    { ListingId: 'CLOSED-SALE', UnparsedAddress: '404 East 90th Street', StandardStatus: 'Closed', PropertyType: 'Residential', ClosePrice: 980_000, CloseDate: '2026-06-02', BedroomsTotal: 2, BathroomsFull: 1 },
    { ListingId: 'UNDATED-LEASE', UnparsedAddress: '406 East 90th Street', StandardStatus: 'Closed', PropertyType: 'ResidentialLease', ClosePrice: 4600, CloseDate: null, BedroomsTotal: 1, BathroomsFull: 1 },
  ];
  const respond = () => fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: trestleRows }) });
  const requestedUrl = () => decodeURIComponent(String(fetchSpy.mock.calls[0][0]));

  it.each([
    ['ListingId branch', 'RLS12345678'],
    ['address branch', '400 East 90th'],
  ])('rental (%s): PropertyType eq ResidentialLease + StandardStatus eq Closed; only dated closed leases, labelled Rented', async (_n, q) => {
    respond();
    const { GET } = await import('@/app/api/crm/sales/prospects/[id]/comps/route');
    const res = await GET(new NextRequest(`http://test/api/crm/sales/prospects/7/comps?q=${encodeURIComponent(q)}&transaction=rental`), params);
    expect(res.status).toBe(200);
    const url = requestedUrl();
    expect(url).toContain("StandardStatus eq 'Closed'");
    expect(url).toContain("PropertyType eq 'ResidentialLease'");
    expect(url).toMatch(/\$select=[^&]*StandardStatus/);
    expect(url).toMatch(/\$select=[^&]*PropertyType/);
    expect(url).not.toContain('ModificationTimestamp');
    const body = await res.json();
    expect(body.transaction).toBe('rental');
    expect(body.results.map((r: { mls_id: string }) => r.mls_id)).toEqual(['CLOSED-LEASE']);
    expect(body.results[0]).toMatchObject({ status: 'Closed', status_label: 'Rented', transaction: 'rental', close_price: 4800, close_date: '2026-06-01', property_type: 'ResidentialLease' });
  });

  it('sale (default): PropertyType eq Residential; the closed sale is labelled Sold', async () => {
    respond();
    const { GET } = await import('@/app/api/crm/sales/prospects/[id]/comps/route');
    const res = await GET(new NextRequest('http://test/api/crm/sales/prospects/7/comps?q=RLS12345678'), params);
    expect(res.status).toBe(200);
    expect(requestedUrl()).toContain("PropertyType eq 'Residential'");
    const body = await res.json();
    expect(body.transaction).toBe('sale');
    expect(body.results.map((r: { mls_id: string }) => r.mls_id)).toEqual(['CLOSED-SALE']);
    expect(body.results[0]).toMatchObject({ status: 'Closed', status_label: 'Sold', transaction: 'sale', close_price: 980_000, close_date: '2026-06-02' });
  });

  it('an unknown transaction is refused (400) before any provider call', async () => {
    const { GET } = await import('@/app/api/crm/sales/prospects/[id]/comps/route');
    const res = await GET(new NextRequest('http://test/api/crm/sales/prospects/7/comps?q=RLS12345678&transaction=lease'), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/lease/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/sales/prospects/[id]/comps — a saved comp is a dated, priced Closed comp of one transaction', () => {
  const params = { params: Promise.resolve({ id: '7' }) };
  const good = { mls_id: 'RLS1', address: '400 East 90th Street', status: 'Closed', status_label: 'Rented', transaction: 'rental', close_price: 4800, close_date: '2026-06-01', beds: 2, baths: 1, sqft: 900 };
  const post = async (comps: unknown[]) => {
    sellerLeadFindFirst.mockResolvedValue({ id: 7n, pitch_data: { notes: 'keep' } });
    const { POST } = await import('@/app/api/crm/sales/prospects/[id]/comps/route');
    return POST(makeRequest({ url: 'http://test/api/crm/sales/prospects/7/comps', body: { comps } }), params);
  };

  it('accepts a Closed comp with close_date + close_price and persists it', async () => {
    const res = await post([good]);
    expect(res.status).toBe(200);
    expect(sellerLeadUpdate).toHaveBeenCalledTimes(1);
    const data = (sellerLeadUpdate.mock.calls[0][0] as { data: { pitch_data: { comps: unknown[]; notes: string } } }).data;
    expect(data.pitch_data.notes).toBe('keep');
    expect(data.pitch_data.comps[0]).toMatchObject({ status: 'Closed', close_date: '2026-06-01', close_price: 4800, transaction: 'rental' });
  });

  it.each([
    ['no status', { ...good, status: undefined }, /status/],
    ['an Active status', { ...good, status: 'Active' }, /Active/],
    ['a legacy Sold status', { ...good, status: 'Sold' }, /Sold/],
    ['no close_date', { ...good, close_date: null }, /close_date/],
    ['a non-day close_date', { ...good, close_date: 'yesterday' }, /close_date/],
    ['no close_price', { ...good, close_price: 0 }, /close_price/],
    ['an unknown transaction', { ...good, transaction: 'lease' }, /transaction/],
  ])('refuses %s with 400 naming the field', async (_n, comp, re) => {
    const res = await post([comp]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(re);
    expect(sellerLeadUpdate).not.toHaveBeenCalled();
  });
});

// ─── 5. The agent criteria route + the comps GET route ─────────────────────────────────────────────────────

describe('PATCH /api/crm/sales/comps/criteria — statuses resolved through the listing transaction', () => {
  const range = { beds_min: 1, beds_max: 2, baths_min: 1, baths_max: 2, sqft_min: null, sqft_max: null, sqft_enabled: false, months_back: 12 };
  const criteriaWith = (b: string[], a: string[]) => ({ building: { ...range, statuses: b }, area: { ...range, statuses: a, price_min: null, price_max: null, neighborhoods: [] } });
  const patch = async (listingType: string, criteria: unknown) => {
    listingFindUnique.mockResolvedValue({ listing_id: 'L1', listing_type: listingType, property_type: listingType === 'sale' ? 'Residential' : 'ResidentialLease' });
    const { PATCH } = await import('@/app/api/crm/sales/comps/criteria/route');
    return PATCH(makeRequest({ method: 'PATCH', url: 'http://test/api/crm/sales/comps/criteria', body: { listing_id: 'L1', criteria } }));
  };

  it('stores the resolved tokens for a sale (Sold → Closed, In Contract → Pending)', async () => {
    const res = await patch('sale', criteriaWith(['Sold', 'Active'], ['In Contract']));
    expect(res.status).toBe(200);
    const stored = (listingUpdate.mock.calls[0][0] as { data: { comp_criteria: { building: { statuses: string[] }; area: { statuses: string[] } } } }).data.comp_criteria;
    expect(stored.building.statuses).toEqual(['Closed', 'Active']);
    expect(stored.area.statuses).toEqual(['Pending']);
    expect((await res.json()).criteria.building.statuses).toEqual(['Closed', 'Active']);
  });

  it('stores Rented → Closed for a rental', async () => {
    const res = await patch('rent', criteriaWith(['Rented'], ['Closed']));
    expect(res.status).toBe(200);
    const stored = (listingUpdate.mock.calls[0][0] as { data: { comp_criteria: { building: { statuses: string[] } } } }).data.comp_criteria;
    expect(stored.building.statuses).toEqual(['Closed']);
  });

  it.each([
    ['a display name', 'sale', ['Under Contract'], 'Under Contract'],
    ['the other transaction label', 'sale', ['Rented'], 'Rented'],
    ['a legacy spelling', 'rent', ['Cancelled'], 'Cancelled'],
    ['a workflow word', 'rent', ['LeaseSigned'], 'LeaseSigned'],
  ])('refuses %s with 400 naming the value and writes nothing', async (_n, listingType, statuses, value) => {
    const res = await patch(listingType, criteriaWith(['Closed'], statuses));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.value).toBe(value);
    expect(body.code).toBe('COMP_STATUS_CRITERION_INVALID');
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it('criteria: null clears the stored criteria so the next fetch regenerates token defaults', async () => {
    const res = await patch('sale', null);
    expect(res.status).toBe(200);
    expect(listingUpdate).toHaveBeenCalledTimes(1);
    const data = (listingUpdate.mock.calls[0][0] as { data: { comp_criteria: unknown } }).data;
    expect(data.comp_criteria).not.toHaveProperty('building');
    expect((await res.json()).criteria).toBeNull();
  });
});

describe('GET /api/crm/sales/comps — stored criteria are validated before any provider call', () => {
  const listingRow = (over: Record<string, unknown>) => ({
    listing_id: 'L1', bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, living_area: 900, list_price: 1_000_000,
    neighborhood: 'Yorkville', borough: 'Manhattan', postal_code: '10128', property_type: 'Residential', listing_type: 'sale',
    address: { BuildingName: 'B' }, features: {}, raw_data: {}, comp_criteria: null, ...over,
  });
  const range = { beds_min: 1, beds_max: 2, baths_min: 1, baths_max: 2, sqft_min: null, sqft_max: null, sqft_enabled: false, months_back: 12 };

  it('legacy stored display names are refused with the offending value (never passed to OData)', async () => {
    listingFindUnique.mockResolvedValue(listingRow({ comp_criteria: { building: { ...range, statuses: ['Active', 'Under Contract', 'Closed'] }, area: { ...range, statuses: ['Closed'], price_min: null, price_max: null, neighborhoods: [] } } }));
    const { GET } = await import('@/app/api/crm/sales/comps/route');
    const res = await GET(new NextRequest('http://test/api/crm/sales/comps?listing_id=L1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.value).toBe('Under Contract');
    expect(body.code).toBe('COMP_STATUS_CRITERION_INVALID');
    expect(fetchFromTrestleMock).not.toHaveBeenCalled();
  });

  it('a rental listing gets token defaults, lease comps and the rental transaction', async () => {
    listingFindUnique.mockResolvedValue(listingRow({ listing_type: 'rent', property_type: 'ResidentialLease', list_price: 5000 }));
    fetchFromTrestleMock.mockResolvedValue({ records: [providerRow({ ListingId: 'CLOSED-LEASE', PropertyType: 'ResidentialLease', ListPrice: 5000, ClosePrice: 4800, BuildingName: 'B' })] });
    const { GET } = await import('@/app/api/crm/sales/comps/route');
    const res = await GET(new NextRequest('http://test/api/crm/sales/comps?listing_id=L1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transaction).toBe('rental');
    for (const s of [...body.criteria.building.statuses, ...body.criteria.area.statuses]) expect(LIVE_TOKENS).toContain(s);
    expect(body.building[0]).toMatchObject({ status: 'Closed', status_label: 'Rented', close_price: 4800 });
    for (const [request] of fetchFromTrestleMock.mock.calls as Array<[{ filter: string }]>) expect(request.filter).toContain("PropertyType eq 'ResidentialLease'");
  });

  it('a listing whose stored transaction disagrees with its PropertyType is refused', async () => {
    listingFindUnique.mockResolvedValue(listingRow({ listing_type: 'rent', property_type: 'Residential' }));
    const { GET } = await import('@/app/api/crm/sales/comps/route');
    const res = await GET(new NextRequest('http://test/api/crm/sales/comps?listing_id=L1'));
    expect(res.status).toBe(400);
    expect(fetchFromTrestleMock).not.toHaveBeenCalled();
  });
});

// ─── 6. Dashboard consumers (static guards — the CRM bundle is not booted here) ────────────────────────────

describe('dashboard comp consumers (source guards)', () => {
  it('the rental pitch packet imports only closed CMA comps with real close facts and searches closed leases through the prospect comps route', () => {
    const src = read('public/crm/js/dashboard/panels/rentals-crm/rental-pitch-packet.js');
    expect(src).not.toContain('/api/listings?type=rent');
    expect(src).toContain('transaction=rental');
    expect(src).not.toMatch(/close_price:\s*c\.close_price \|\| c\.list_price/);
    expect(src).not.toMatch(/c\.close_date \|\| c\.on_market_date/);
    expect(src).not.toMatch(/var rent = c\.close_price \|\| c\.list_price/);
    expect(src).toMatch(/c\.status === 'Closed'/);
  });
  it('the sales pitch packet searches closed sales through the prospect comps route and merges only Closed comps', () => {
    const src = read('public/crm/js/dashboard/panels/sales-crm/pitch-packet.js');
    expect(src).toContain('transaction=sale');
    expect(src).toMatch(/nc\.status === 'Closed'/);
  });
  it('the sales-crm comps tab offers token criteria with transaction labels and renders status_label', () => {
    const src = read('public/crm/js/dashboard/panels/sales-crm/index.js');
    expect(src).not.toContain("['Active', 'Under Contract', 'Closed', 'Expired']");
    expect(src).toMatch(/c\.status_label \|\| c\.status/);
    expect(src).not.toMatch(/c\.status === 'ActiveUnderContract' \? 'In Contract' : c\.status/);
  });
  it('Market Activity dates a closed comp by CloseDate only (never the modification time) and reads legacy closes', () => {
    const src = read('public/crm/js/dashboard/panels.js');
    expect(src).not.toMatch(/l\.CloseDate \|\| l\.close_date \|\| modDate/);
    expect(src).toMatch(/_isComp = l\._isClosed && l\._closeDate/);
  });
  it('workspace _generateCMA sends the CMA subject and labels comps by transaction', () => {
    const src = read('public/crm/js/dashboard/workspace.js');
    expect(src).not.toMatch(/body: JSON\.stringify\(\{ client_id: _clientId \}\)/);
    expect(src).toMatch(/property_address: /);
    expect(src).toContain('Comparable Rentals');
    expect(src).toContain('Comparable Sales');
  });
  it('reports CMA badge never defaults a blank status to Active and the date column is the close date', () => {
    const src = read('public/crm/js/output/reports.js');
    expect(src).not.toMatch(/s = \(s \|\| 'Active'\)\.toUpperCase\(\);\s*\n\s*var sc = statusColor/);
    expect(src).not.toMatch(/cmaHeaders \+= '<th style="' \+ cmaThS \+ '">Listed<\/th>'/);
    expect(src).toMatch(/cmaCloseDate\(cl\)/);
  });
});
