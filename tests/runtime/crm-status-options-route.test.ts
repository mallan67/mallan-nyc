/// <reference types="jest" />
/**
 * GET /api/crm/status-options?type=sale|rental — the ONE server projection of each transaction's status
 * mapping (lib/crm/status-mapping.ts) that manage-listings builds its status panels, modal and filter pills from.
 *
 * Owner ruling (Maya, 2026-09-08): a sale is resolved through the sale mapping and a rental through the rental
 * mapping — never one shared list; workflow words are NEVER called MlsStatus; a workflow word resolves to a live
 * Cotality StandardStatus token plus its associated fact(s).
 */
import { makeRequest } from './helpers';

const requireAgentOrBrokerMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
}));

type Row = { word: string; label: string; canonical: string; canonicalLabel: string; requiredFacts: string[] };
type Body = {
  transaction: string;
  workflow: Row[];
  canonical: { token: string; label: string; facts: string[] }[];
  factLabels: Record<string, string>;
};

async function call(query: string) {
  const { GET } = await import('@/app/api/crm/status-options/route');
  const res = await GET(makeRequest({ method: 'GET', url: `http://localhost/api/crm/status-options${query}` }));
  const text = await res.text();
  return { status: res.status, text, body: (text ? JSON.parse(text) : null) as Body };
}

const byWord = (b: Body) => Object.fromEntries(b.workflow.map((w) => [w.word, w]));
const byToken = (b: Body) => Object.fromEntries(b.canonical.map((c) => [c.token, c]));

beforeEach(() => {
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({ userId: 7n, role: 'AGENT', userType: 'agent' });
});

describe('GET /api/crm/status-options', () => {
  it('401 without an agent / broker session', async () => {
    requireAgentOrBrokerMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    const r = await call('?type=sale');
    expect(r.status).toBe(401);
  });

  it('400 when the transaction is missing or unknown (never a default mapping)', async () => {
    expect((await call('')).status).toBe(400);
    expect((await call('?type=commercial')).status).toBe(400);
  });

  it('sale: the SALE mapping only — Contract Signed → Pending (In Contract) + PurchaseContractDate; Sold → Closed (Sold) + CloseDate/ClosePrice', async () => {
    const r = await call('?type=sale');
    expect(r.status).toBe(200);
    expect(r.body.transaction).toBe('sale');
    const w = byWord(r.body);
    expect(w.ContractSigned).toEqual({ word: 'ContractSigned', label: 'Contract Signed', canonical: 'Pending', canonicalLabel: 'In Contract', requiredFacts: ['PurchaseContractDate'] });
    expect(w.Sold).toEqual({ word: 'Sold', label: 'Sold', canonical: 'Closed', canonicalLabel: 'Sold', requiredFacts: ['CloseDate', 'ClosePrice'] });
    // an offer out never maps to Pending and carries no fact
    expect(w.OfferOut.canonical).toBe('Active');
    expect(w.OfferOut.requiredFacts).toEqual([]);
    expect(w.BackOnMarket).toMatchObject({ canonical: 'Active', requiredFacts: ['BackOnMarketDate'] });
    expect(w.Expired).toMatchObject({ canonical: 'Expired', requiredFacts: ['ExpirationDate'] });
    expect(w.Withdrawn).toMatchObject({ canonical: 'Withdrawn', requiredFacts: ['WithdrawnDate'] });
    expect(w.Cancelled).toMatchObject({ canonical: 'Canceled', label: 'Canceled', requiredFacts: ['CancellationDate'] });
    expect(w.TempOffMarket).toMatchObject({ canonical: 'Hold', requiredFacts: [] });
    // rental words are NOT in the sale list
    expect(w.LeaseSigned).toBeUndefined();
    expect(w.AppOut).toBeUndefined();
    expect(w.Rented).toBeUndefined();
    const c = byToken(r.body);
    expect(c.Pending).toEqual({ token: 'Pending', label: 'In Contract', facts: ['PurchaseContractDate'] });
    expect(c.Closed).toEqual({ token: 'Closed', label: 'Sold', facts: ['CloseDate', 'ClosePrice'] });
    expect(c.ComingSoon).toBeDefined();
    expect(c.Canceled).toBeDefined();
    expect(c.Cancelled).toBeUndefined();
  });

  it('rental: the RENTAL mapping only — Lease Signed → Pending + _mallanLeaseSignedDate (never PurchaseContractDate); Rented → Closed (Rented)', async () => {
    for (const q of ['?type=rental', '?type=rent']) {
      const r = await call(q);
      expect(r.status).toBe(200);
      expect(r.body.transaction).toBe('rent');
      const w = byWord(r.body);
      expect(w.LeaseSigned).toEqual({ word: 'LeaseSigned', label: 'Lease Signed', canonical: 'Pending', canonicalLabel: 'Pending', requiredFacts: ['_mallanLeaseSignedDate'] });
      expect(w.Rented).toEqual({ word: 'Rented', label: 'Rented', canonical: 'Closed', canonicalLabel: 'Rented', requiredFacts: ['CloseDate', 'ClosePrice'] });
      expect(w.AppOut.canonical).toBe('Active');
      expect(w.LeaseOut.canonical).toBe('ActiveUnderContract');
      expect(w.ContractSigned).toBeUndefined();
      expect(w.Sold).toBeUndefined();
      expect(w.ComingSoon).toBeUndefined();
      const c = byToken(r.body);
      expect(c.ComingSoon).toBeUndefined();
      expect(c.Closed.label).toBe('Rented');
      expect(JSON.stringify(r.body)).not.toContain('PurchaseContractDate');
    }
  });

  it('every canonical token is a live StandardStatus member and the payload never says MlsStatus', async () => {
    const { MALLAN_STORAGE_STATUSES } = await import('@/lib/listings/mallan-status');
    for (const q of ['?type=sale', '?type=rental']) {
      const r = await call(q);
      for (const row of r.body.workflow) expect(MALLAN_STORAGE_STATUSES).toContain(row.canonical);
      for (const c of r.body.canonical) expect(MALLAN_STORAGE_STATUSES).toContain(c.token);
      expect(r.text).not.toContain('MlsStatus');
      expect(r.body.factLabels._mallanLeaseSignedDate).toMatch(/Mallan/);
    }
  });
});
