/// <reference types="jest" />
/**
 * Manage Listings (public/crm/js/manage/manage-listings.js) renders the SERVER status projection and writes the
 * WORKFLOW word + its required facts — owner ruling 2026-09-08:
 *
 *   - every row's label comes from `status_presentation` (app/api/crm/listings list DTO → statusPresentation),
 *     computed per transaction on the server; legacy stored 'Sold' / 'Rented' / 'Cancelled' rows arrive normalized;
 *   - the status panels / modal and the filter pills are built from GET /api/crm/status-options?type=… — the SALE
 *     panel from the sale mapping and the RENTAL panel from the rental mapping, never one shared list, and never a
 *     data-reso-field="MlsStatus" attribute (data-workflow-word / data-status-token instead);
 *   - a status change sends { status: <workflow word>, facts } with exactly the facts the mapping requires
 *     (Contract Signed → PurchaseContractDate; Lease Signed → _mallanLeaseSignedDate; Sold / Rented → CloseDate +
 *     ClosePrice); the server's error is surfaced, the row is never mutated optimistically;
 *   - the table's Contract Signed / Lease Signed / Sold / Rented columns are the Cotality facts
 *     (PurchaseContractDate / _mallanLeaseSignedDate / CloseDate), never status_changed_at.
 *
 * Runs the real script in jsdom with the real partials; fixtures are projected by the REAL statusPresentation and
 * the status options by the REAL route handler (auth mocked).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';
import { statusPresentation, STATUS_FACT_FIELDS } from '@/lib/crm/status-mapping';

const requireAgentOrBrokerMock = jest.fn(async () => ({ userId: 7n, role: 'BROKER', userType: 'agent' }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (...a: unknown[]) => requireAgentOrBrokerMock(...a as []),
  isAuthError: (v: unknown) => v instanceof Response,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const MANAGE_SRC = readFileSync(resolve(ROOT, 'public/crm/js/manage/manage-listings.js'), 'utf8');
const OH_SRC = readFileSync(resolve(ROOT, 'public/crm/js/manage/open-houses.js'), 'utf8');
const MANAGE_HTML = readFileSync(resolve(ROOT, 'public/crm/html/manage-listings.html'), 'utf8');
const MODAL_HTML = readFileSync(resolve(ROOT, 'public/crm/html/modals/status-change.html'), 'utf8');

type Rec = Record<string, unknown>;

/** The list DTO's projection of a stored row (mirrors app/api/crm/listings/route.ts). */
function project(row: Rec): Rec {
  const raw = (row.raw_data as Rec) ?? {};
  const facts: Rec = {};
  for (const f of STATUS_FACT_FIELDS) if (raw[f] !== undefined && raw[f] !== null && raw[f] !== '') facts[f] = raw[f];
  const { raw_data: _omit, ...rest } = row;
  void _omit;
  return { ...rest, status_presentation: statusPresentation(row as Parameters<typeof statusPresentation>[0]), status_facts: facts };
}

function base(over: Rec): Rec {
  return {
    id: '1', listing_id: 'SL-0001', mls_id: null, listing_type: 'sale', status: 'Active', list_price: '1000000',
    bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, address: { StreetNumber: '10', StreetName: 'Park', StreetSuffix: 'Ave', UnitNumber: '4B' },
    features: {}, media: [], created_at: '2026-01-02T00:00:00Z', updated_at: '2026-02-03T00:00:00Z',
    status_changed_at: '2026-05-05T00:00:00Z', listing_contract_date: null, idx_display_yn: true, owner_opt_out: false, participant_only: false,
    sync_status: null, terminal_since: null, raw_data: {},
    ...over,
  };
}

const ROWS: Rec[] = [
  base({ id: '1', listing_id: 'SL-0001', status: 'Active' }),
  base({ id: '2', listing_id: 'SL-0002', status: 'Pending', raw_data: { PurchaseContractDate: '2026-06-15', _crmWorkflowStatus: 'ContractSigned' } }),
  base({ id: '3', listing_id: 'SL-0003', status: 'Sold', raw_data: { CloseDate: '2026-07-01', ClosePrice: 990000 } }),          // legacy spelling
  base({ id: '4', listing_id: 'SL-0004', status: 'Cancelled', raw_data: { CancellationDate: '2026-03-03' } }),                 // legacy double-L
  base({ id: '5', listing_id: 'SL-0005', status: 'Active', raw_data: { BackOnMarketDate: '2026-08-08', _crmWorkflowStatus: 'BackOnMarket' } }),
  base({ id: '11', listing_id: 'RL-0011', listing_type: 'rent', status: 'Active', list_price: '4000' }),
  base({ id: '12', listing_id: 'RL-0012', listing_type: 'rent', status: 'Pending', list_price: '4000', raw_data: { _mallanLeaseSignedDate: '2026-06-20', _crmWorkflowStatus: 'LeaseSigned' } }),
  base({ id: '13', listing_id: 'RL-0013', listing_type: 'rent', status: 'Rented', list_price: '4000', raw_data: { CloseDate: '2026-07-11', ClosePrice: 4000 } }), // legacy spelling
  base({ id: '14', listing_id: 'RL-0014', listing_type: 'rent', status: 'Closed', list_price: '4000', raw_data: { CloseDate: '2026-07-12', ClosePrice: 4100 } }),
];

async function optionsFor(url: string) {
  const { GET } = await import('@/app/api/crm/status-options/route');
  const res = await GET(makeRequest({ method: 'GET', url: 'http://localhost' + url }));
  if (res.status !== 200) throw new Error('status-options ' + res.status);
  return res.json();
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boot(rows: Rec[] = ROWS): any {
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${MANAGE_HTML}${MODAL_HTML}</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.MallanAPI = {
    listings: {
      list: jest.fn(async () => ({ listings: rows.map(project) })),
      updateStatus: jest.fn(async () => ({ ok: true })),
      update: jest.fn(async () => ({})),
    },
    _fetch: jest.fn(async (url: string) => optionsFor(url)),
    showings: { list: jest.fn(async () => ({ showings: [] })), update: jest.fn(async () => ({})) },
  };
  w.showToast = jest.fn();
  w.confirm = jest.fn(() => true);
  w.prompt = jest.fn(() => null);
  w.eval(OH_SRC);
  w.eval(MANAGE_SRC);
  return w;
}

describe('manage-listings source', () => {
  it('contains no MlsStatus attribute, no local status write map, no client transition table', () => {
    expect(MANAGE_SRC).not.toContain('MlsStatus');
    expect(MANAGE_SRC).not.toMatch(/resoMap|rlsStatusMap|statusMap\s*=/);
    expect(MANAGE_SRC).not.toContain('manageValidateTransition');
    expect(MANAGE_SRC).not.toContain('status_changed_at');
    expect(MANAGE_SRC).toContain('data-workflow-word');
    expect(MANAGE_SRC).toContain('data-status-token');
    expect(MANAGE_SRC).toContain('/api/crm/status-options');
  });
});

describe('labels come from status_presentation', () => {
  it('sale rows: Active / In Contract / Sold (legacy "Sold") / Canceled (legacy "Cancelled") / Back On Market', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const cards = w.document.getElementById('manageCardList').innerHTML;
    const byId = (id: string) => w.manageFindListing(id);
    expect(byId('SL-0001').status).toBe('Active');
    expect(byId('SL-0002').status).toBe('In Contract');
    expect(byId('SL-0002').workflowLabel).toBe('Contract Signed');
    expect(byId('SL-0003').status).toBe('Sold');
    expect(byId('SL-0003').statusToken).toBe('Closed');
    expect(byId('SL-0004').status).toBe('Canceled');
    expect(byId('SL-0004').statusToken).toBe('Canceled');
    expect(byId('SL-0005').workflowLabel).toBe('Back On Market');
    // the default pill is Active, so only Active rows are in the card list
    expect(cards).toContain('Active');
    expect(cards).not.toContain('Perm Off Market');
    expect(cards).not.toContain('Cancelled');
  });

  it('rental rows: Rented for the provider Closed AND for legacy "Rented"; Pending stays Pending (no In Contract)', async () => {
    const w = boot();
    w.renderManageSection('rentals'); await flush();
    expect(w.manageFindListing('RL-0013').status).toBe('Rented');
    expect(w.manageFindListing('RL-0014').status).toBe('Rented');
    expect(w.manageFindListing('RL-0012').status).toBe('Pending');
    expect(w.manageFindListing('RL-0012').workflowLabel).toBe('Lease Signed');
    const html = w.document.getElementById('manageCardList').innerHTML + w.document.getElementById('manageTableBody').innerHTML;
    expect(html).not.toContain('Leased');
  });

  it('an unknown state renders "Status unavailable" — never a fabricated Active', async () => {
    const w = boot([base({ id: '9', listing_id: 'SL-0009', status: 'Bogus' })]);
    w.renderManageSection('sales'); await flush();
    expect(w.manageFindListing('SL-0009').status).toBe('Status unavailable');
    expect(w.manageFindListing('SL-0009').statusToken).toBeNull();
  });
});

describe('filter pills per transaction (from the server mapping)', () => {
  it('sale pills: Active, In Contract, Sold, Hold, Withdrawn, Expired, Canceled, Coming Soon — keyed by token', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const pills = w.document.getElementById('manageStatusPills');
    const tokens = (Array.from(pills.querySelectorAll('button[data-status-token]')) as Element[]).map((b) => b.getAttribute('data-status-token'));
    expect(tokens).toEqual(['Active', 'Pending', 'Closed', 'Hold', 'Withdrawn', 'Expired', 'Canceled', 'ComingSoon']);
    const text = pills.textContent;
    expect(text).toContain('In Contract (1)');
    expect(text).toContain('Sold (1)');
    expect(text).toContain('Canceled (1)');
    expect(text).toContain('Coming Soon (0)');
    expect(text).toContain('Back On Market (1)');
    expect(text).not.toContain('Perm Off Market');
    expect(text).not.toContain('Offer Out');
    expect(text).not.toContain('Leased');
  });

  it('rental pills: Active, Pending, Rented, Hold, Withdrawn, Expired, Canceled — no Coming Soon, no Leased', async () => {
    const w = boot();
    w.renderManageSection('rentals'); await flush();
    const pills = w.document.getElementById('manageStatusPills');
    const tokens = (Array.from(pills.querySelectorAll('button[data-status-token]')) as Element[]).map((b) => b.getAttribute('data-status-token'));
    expect(tokens).toEqual(['Active', 'Pending', 'Closed', 'Hold', 'Withdrawn', 'Expired', 'Canceled']);
    const text = pills.textContent;
    expect(text).toContain('Rented (2)');
    expect(text).toContain('Pending (1)');
    expect(text).not.toContain('Coming Soon');
    expect(text).not.toContain('Leased');
    expect(text).not.toContain('In Contract');
  });

  it('a Draft (Incomplete) pill appears only when the list holds a draft', async () => {
    const w = boot([base({ id: '1', listing_id: 'SL-0001', status: 'Incomplete' })]);
    w.renderManageSection('sales'); await flush();
    expect(w.document.getElementById('manageStatusPills').textContent).toContain('Incomplete (1)');
  });
});

describe('table date columns are the Cotality facts', () => {
  it('sale: Contract Signed = PurchaseContractDate, Sold = CloseDate (mm/dd/yy) — not status_changed_at', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    expect(w.manageFindListing('SL-0002').contractSigned).toBe('06/15/26');
    expect(w.manageFindListing('SL-0003').sold).toBe('07/01/26');
    expect(w.manageFindListing('SL-0002').sold).toBeNull();
    expect(w.manageFindListing('SL-0003').contractSigned).toBeNull();
    w.manageFilterByStatus('Closed'); await flush();
    expect(w.document.getElementById('manageTableBody').innerHTML).toContain('07/01/26');
    expect(w.document.getElementById('manageTableBody').innerHTML).not.toContain('05/05/26');
  });
  it('rental: Lease Signed = _mallanLeaseSignedDate, Rented = CloseDate', async () => {
    const w = boot();
    w.renderManageSection('rentals'); await flush();
    expect(w.manageFindListing('RL-0012').leaseSigned).toBe('06/20/26');
    expect(w.manageFindListing('RL-0013').rented).toBe('07/11/26');
  });
});

describe('status panels are built from the transaction mapping', () => {
  it('the SALE panel lists the sale words (Contract Signed, Sold …) with data-workflow-word / data-status-token and no rental word', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    w.toggleCardAction('SL-0001', 'status'); await flush();
    const panel = w.document.getElementById('cardPanel-SL-0001');
    expect(panel).not.toBeNull();
    const words = (Array.from(panel.querySelectorAll('button[data-workflow-word]')) as Element[]).map((b) => b.getAttribute('data-workflow-word'));
    expect(words).toEqual(expect.arrayContaining(['ContractSigned', 'Sold', 'OfferOut', 'BackOnMarket', 'TempOffMarket', 'Expired', 'Cancelled']));
    expect(words).not.toContain('LeaseSigned');
    expect(words).not.toContain('Rented');
    const cs = panel.querySelector('button[data-workflow-word="ContractSigned"]');
    expect(cs.getAttribute('data-status-token')).toBe('Pending');
    expect(cs.textContent).toContain('Contract Signed');
    expect(panel.innerHTML).not.toContain('MlsStatus');
  });

  it('the RENTAL panel + modal list the rental words (Lease Signed, Rented, Application Out) and no sale word', async () => {
    const w = boot();
    w.renderManageSection('rentals'); await flush();
    w.toggleCardAction('RL-0011', 'status'); await flush();
    const panel = w.document.getElementById('cardPanel-RL-0011');
    const words = (Array.from(panel.querySelectorAll('button[data-workflow-word]')) as Element[]).map((b) => b.getAttribute('data-workflow-word'));
    expect(words).toEqual(expect.arrayContaining(['LeaseSigned', 'Rented', 'AppOut', 'LeaseOut']));
    expect(words).not.toContain('ContractSigned');
    expect(words).not.toContain('Sold');
    expect(words).not.toContain('ComingSoon');
    w.manageQuickStatus('RL-0011'); await flush();
    const modal = w.document.getElementById('manageStatusOptions');
    const modalWords = (Array.from(modal.querySelectorAll('button[data-workflow-word]')) as Element[]).map((b) => b.getAttribute('data-workflow-word'));
    expect(modalWords).toContain('LeaseSigned');
    expect(modalWords).not.toContain('ContractSigned');
    expect(modal.innerHTML).not.toContain('MlsStatus');
  });
});

describe('status changes send the workflow word + its required facts', () => {
  it('sale Contract Signed → { status: "ContractSigned", facts: { PurchaseContractDate } }', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    w.prompt = jest.fn(() => '2026-09-01');
    await w.manageApplyWorkflowStatus('SL-0001', 'ContractSigned'); await flush();
    expect(w.prompt).toHaveBeenCalledTimes(1);
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('1', 'ContractSigned', { PurchaseContractDate: '2026-09-01' });
  });

  it('sale Sold → CloseDate + ClosePrice (numeric)', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const answers = ['2026-09-02', '$1,250,000'];
    w.prompt = jest.fn(() => answers.shift());
    await w.manageApplyWorkflowStatus('SL-0002', 'Sold'); await flush();
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('2', 'Sold', { CloseDate: '2026-09-02', ClosePrice: 1250000 });
  });

  it('rental Lease Signed → _mallanLeaseSignedDate (never PurchaseContractDate); Rented → CloseDate + ClosePrice', async () => {
    const w = boot();
    w.renderManageSection('rentals'); await flush();
    w.prompt = jest.fn(() => '2026-09-03');
    await w.manageApplyWorkflowStatus('RL-0011', 'LeaseSigned'); await flush();
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('11', 'LeaseSigned', { _mallanLeaseSignedDate: '2026-09-03' });
    const answers = ['2026-09-04', '4200'];
    w.prompt = jest.fn(() => answers.shift());
    await w.manageApplyWorkflowStatus('RL-0012', 'Rented'); await flush();
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('12', 'Rented', { CloseDate: '2026-09-04', ClosePrice: 4200 });
  });

  it('Offer Out carries no fact and prompts for nothing; Expired / Withdrawn / Canceled / Back On Market prompt for their date', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    await w.manageApplyWorkflowStatus('SL-0001', 'OfferOut'); await flush();
    expect(w.prompt).not.toHaveBeenCalled();
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenCalledWith('1', 'OfferOut', {});
    w.prompt = jest.fn(() => '2026-09-05');
    await w.manageApplyWorkflowStatus('SL-0001', 'Expired');
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenLastCalledWith('1', 'Expired', { ExpirationDate: '2026-09-05' });
    await w.manageApplyWorkflowStatus('SL-0001', 'Withdrawn');
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenLastCalledWith('1', 'Withdrawn', { WithdrawnDate: '2026-09-05' });
    await w.manageApplyWorkflowStatus('SL-0001', 'Cancelled');
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenLastCalledWith('1', 'Cancelled', { CancellationDate: '2026-09-05' });
    await w.manageApplyWorkflowStatus('SL-0001', 'BackOnMarket');
    expect(w.MallanAPI.listings.updateStatus).toHaveBeenLastCalledWith('1', 'BackOnMarket', { BackOnMarketDate: '2026-09-05' });
  });

  it('a cancelled prompt aborts — nothing is sent', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    w.prompt = jest.fn(() => null);
    await w.manageApplyWorkflowStatus('SL-0001', 'ContractSigned');
    expect(w.MallanAPI.listings.updateStatus).not.toHaveBeenCalled();
  });

  it('the server error is surfaced and the row is NOT mutated optimistically', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    w.MallanAPI.listings.updateStatus = jest.fn(async () => { throw new Error('CloseDate is required before marking a listing as Closed'); });
    w.prompt = jest.fn(() => '2026-09-06');
    await w.manageApplyWorkflowStatus('SL-0001', 'ContractSigned'); await flush();
    expect(w.manageFindListing('SL-0001').status).toBe('Active');
    expect(w.manageFindListing('SL-0001').statusToken).toBe('Active');
    expect(w.document.getElementById('manageToastMsg').textContent).toContain('CloseDate is required');
  });

  it('a successful change reloads the list from the server (no local re-derivation)', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const before = w.MallanAPI.listings.list.mock.calls.length;
    w.prompt = jest.fn(() => '2026-09-07');
    await w.manageApplyWorkflowStatus('SL-0001', 'ContractSigned'); await flush();
    expect(w.MallanAPI.listings.list.mock.calls.length).toBe(before + 1);
  });
});

describe('open-house gating uses the provider token', () => {
  it('Closed / Expired / Withdrawn / Canceled rows cannot schedule an open house; Active can', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    expect(w.renderCardOHPanel(w.manageFindListing('SL-0003'))).toContain('Cannot schedule');
    expect(w.renderCardOHPanel(w.manageFindListing('SL-0004'))).toContain('Cannot schedule');
    expect(w.renderCardOHPanel(w.manageFindListing('SL-0001'))).not.toContain('Cannot schedule');
    expect(OH_SRC).not.toContain("'Perm Off Market'");
    expect(OH_SRC).not.toContain("'Leased'");
  });
});

// ── Source ratchets ─────────────────────────────────────────────────────────────────────────────────────────
// The surfaces this correction touched must not grow a status map of their own again. Owner ruling (Maya,
// 2026-09-08 / 2026-09-09): the stored status IS the live Cotality StandardStatus token, the broker word is a
// per-transaction LABEL the server computes, and MlsStatus is a provider field these readers never touch.
const OWNED_STATUS_SURFACES = [
  'public/crm/js/manage/manage-listings.js',
  'public/crm/js/manage/open-houses.js',
  'public/crm/html/modals/status-change.html',
  'public/crm/js/dashboard/portals.js',
  'public/crm/js/dashboard/panels.js',
  'public/crm/js/dashboard/workspace.js',
  'public/crm/js/dashboard/ui-components.js',
  'public/crm/js/dashboard/panels/sales-crm/index.js',
  'public/crm/js/dashboard/panels/rentals-crm/index.js',
  'public/crm/js/render/shared-badges.js',
  'app/portal/buyer/page.tsx',
  'app/portal/landlord/page.tsx',
  'app/portal/seller/page.tsx',
  'lib/compliance/dto.ts',
  'app/api/crm/status-options/route.ts',
];

describe('status source ratchets', () => {
  const sources = OWNED_STATUS_SURFACES.map((f) => [f, readFileSync(resolve(ROOT, f), 'utf8')] as const);

  it.each(sources)('%s carries no data-reso-field="MlsStatus" attribute', (_file, src) => {
    expect(src).not.toMatch(/data-reso-field\s*=\s*["']MlsStatus["']/);
  });

  it.each(sources)('%s never reads MlsStatus as a status fallback', (_file, src) => {
    expect(src).not.toMatch(/\.MlsStatus\b/);
    expect(src).not.toMatch(/MlsStatus\s*\|\|/);
    expect(src).not.toMatch(/\[\s*["']MlsStatus["']\s*\]/);
  });

  it.each(sources)('%s holds no hard-coded Sold / Leased status map', (_file, src) => {
    // a token mapped to a broker word (e.g. `'Closed': isSale ? 'Sold' : 'Leased'`)
    expect(src).not.toMatch(/["'](?:Closed|Pending)["']\s*:\s*[^,\n}]*["'](?:Sold|Leased|Rented|In Contract)["']/);
    // a map KEYED by a broker word (e.g. `Sold: {...}` / `'Leased': '...'`)
    expect(src).not.toMatch(/["'](?:Sold|Leased|Perm Off Market|Temp Off Market)["']\s*:/);
    expect(src).not.toMatch(/\b(?:Sold|Leased)\s*:\s*\{/);
    // the retired double-L spelling as a map key / printed label
    expect(src).not.toMatch(/["']Cancelled["']\s*:/);
  });
});
