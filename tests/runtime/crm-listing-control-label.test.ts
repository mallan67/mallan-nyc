/// <reference types="jest" />
/**
 * WHICH ONE DO I CONTROL? — the CRM names, for every listing, the record the agent controls and the Cotality copy of it.
 *
 * 333 E 46th St #2G is in the CRM twice: SL-0004 (the Mallan listing: editable, the one mallan.nyc shows) and RLS20093870 (Cotality's copy: read-only, hidden from the
 * public). They looked the same, Edit opened either, and the Cotality copy was filled in by mistake (the server refuses to save over it). This pins:
 *   - the label comes from the same identity proof the public site uses (so it cannot disagree with what is public),
 *   - the list and the single read both carry it, the cards and rows show it, Edit on a Cotality copy opens the Mallan listing instead,
 *   - the Sale form shows a Cotality record as read-only and sends nothing from it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { buildMallanTwinContext, EMPTY_TWIN_CONTEXT } from '@/lib/listings/mallan-twin-context';
import { describeListingControl } from '@/lib/listings/listing-control';
import { bootAddForm } from './add-form-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const addr = (over: Record<string, unknown> = {}) => ({
  StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'Street', UnitNumber: '2G', City: 'New York', PostalCode: '10017', ...over,
});
const addr806 = () => addr({ StreetNumber: '800', StreetDirPrefix: '', StreetName: '2nd', StreetSuffix: 'Avenue', UnitNumber: '806' });
const CTX = buildMallanTwinContext(
  [{ listing_id: 'SL-0004', address: addr(), status: 'Active' }],
  [
    { listing_id: 'RLS20093870', address: addr(), list_office_mls_id: '7041', status: 'Active' },
    { listing_id: 'RLS20123633', address: addr806(), list_office_mls_id: '7041', status: 'Active' },
  ],
  [],
);
const row = (over: Record<string, unknown>) => ({ listing_id: 'X', status: 'Active', list_office_mls_id: null, ...over }) as any;

describe('the identity context remembers which Mallan listing each duplicate duplicates', () => {
  it('RLS20093870 -> SL-0004; the lone Cotality listing has none', () => {
    expect(CTX.canonicalByReturnCopy).toEqual({ RLS20093870: 'SL-0004' });
  });

  it('with two live Mallan listings for one unit the lowest id is named (deterministic)', () => {
    const ctx = buildMallanTwinContext(
      [{ listing_id: 'SL-0009', address: addr(), status: 'Active' }, { listing_id: 'SL-0004', address: addr(), status: 'Active' }],
      [{ listing_id: 'RLS20093870', address: addr(), list_office_mls_id: '7041', status: 'Active' }],
      [],
    );
    expect(ctx.canonicalByReturnCopy).toEqual({ RLS20093870: 'SL-0004' });
  });
});

describe('describeListingControl', () => {
  it('SL-0004 (Mallan listing, live): editable, "YOU CONTROL THIS ONE"', () => {
    const c = describeListingControl(row({ listing_id: 'SL-0004' }), CTX);
    expect(c).toMatchObject({ kind: 'mallan-authored', editable: true, onSite: 'live', canonicalListingId: null });
    expect(c.label).toBe('YOU CONTROL THIS ONE · SL-0004 · live');
    expect(c.detail).toMatch(/Edit it here/);
  });

  it('a Mallan listing that is a Draft says it is not on mallan.nyc yet', () => {
    const c = describeListingControl(row({ listing_id: 'SL-0004', status: 'Draft' }), CTX);
    expect(c).toMatchObject({ kind: 'mallan-authored', editable: true, onSite: 'not-live' });
    expect(c.label).toMatch(/not on mallan\.nyc \(Draft\)/);
  });

  it("RLS20093870 (Cotality's copy of SL-0004): read-only, hidden, names SL-0004", () => {
    const c = describeListingControl(row({ listing_id: 'RLS20093870', list_office_mls_id: '7041' }), CTX);
    expect(c).toMatchObject({ kind: 'cotality-duplicate', editable: false, onSite: 'hidden-duplicate', canonicalListingId: 'SL-0004' });
    expect(c.label).toBe('COTALITY COPY · RLS20093870 · read-only, hidden');
    expect(c.detail).toMatch(/SL-0004 is the live one/);
  });

  it('RLS20123633 (no Mallan twin): read-only but live from Cotality — not called a duplicate', () => {
    const c = describeListingControl(row({ listing_id: 'RLS20123633', list_office_mls_id: '7041' }), CTX);
    expect(c).toMatchObject({ kind: 'cotality-mallan', editable: false, onSite: 'live', canonicalListingId: null });
    expect(c.detail).toMatch(/no Mallan listing for this unit/);
  });

  it('its gates decide "live": an opted-out Cotality listing says it is not live', () => {
    const c = describeListingControl(row({ listing_id: 'RLS20123633', list_office_mls_id: '7041', idx_display_yn: false }), CTX);
    expect(c.onSite).toBe('not-live');
  });

  it('with nothing proven (no context) a Mallan-office Cotality row is never labelled a duplicate', () => {
    const c = describeListingControl(row({ listing_id: 'RLS20093870', list_office_mls_id: '7041' }), EMPTY_TWIN_CONTEXT);
    expect(c.kind).toBe('cotality-mallan');
  });

  it('another brokerage is plain "COTALITY · read-only"', () => {
    const c = describeListingControl(row({ listing_id: 'RLS777', list_office_mls_id: '9999' }), CTX);
    expect(c).toMatchObject({ kind: 'cotality', editable: false });
  });

  it('only a Mallan-authored record is ever editable', () => {
    const rows = ['SL-0004', 'RL-0011', 'RLS20093870', 'RLS20123633', 'RLS777'].map((id) => describeListingControl(row({ listing_id: id, list_office_mls_id: '7041' }), CTX));
    expect(rows.map((r) => r.editable)).toEqual([true, true, false, false, false]);
  });
});

describe('both CRM reads carry the label', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf8');
  it.each(['app/api/crm/listings/route.ts', 'app/api/crm/listings/[id]/route.ts'])('%s attaches _control from the loaded identity context', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/describeListingControl\(/);
    expect(src).toMatch(/loadMallanTwinContext\(\)/);
    expect(src).toMatch(/_control/);
  });
});

// ── My Listings (public/crm/js/manage/manage-listings.js) ───────────────────────────────────────────────────────────────────────────
function loadManage() {
  const dom = new JSDOM('<!doctype html><body><div id="manageCards"></div></body>', { runScripts: 'outside-only', url: 'https://mallan.nyc/crm/' });
  const w: any = dom.window;
  w.eval('var toasts = []; function manageShowToast(m) { toasts.push(m); }');
  w.opened = [] as string[];
  w.open = (u: string) => { w.opened.push(u); return null; };
  w.eval(readFileSync(resolve(__dirname, '../../public/crm/js/manage/manage-listings.js'), 'utf8'));
  return w;
}
const apiRow = (listing_id: string, control: any, over: Record<string, unknown> = {}) => ({
  id: listing_id === 'SL-0004' ? '308773' : listing_id === 'RLS20093870' ? '312086' : '687228', listing_id, listing_type: 'sale', status: 'Active',
  address: addr(), list_price: '765000', bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, created_at: '2026-05-27T00:00:00Z', updated_at: '2026-10-28T00:00:00Z',
  idx_display_yn: true, _control: control, ...over,
});
const CONTROL_SL = describeListingControl(row({ listing_id: 'SL-0004' }), CTX);
const CONTROL_RLS = describeListingControl(row({ listing_id: 'RLS20093870', list_office_mls_id: '7041' }), CTX);
const CONTROL_806 = describeListingControl(row({ listing_id: 'RLS20123633', list_office_mls_id: '7041' }), CTX);

describe('My Listings shows which record is which', () => {
  it('the mapped row keeps the server label', () => {
    const w = loadManage();
    const m = w._mapApiListingToManage(apiRow('SL-0004', CONTROL_SL));
    expect(m.id).toBe('SL-0004');
    expect(m.control.kind).toBe('mallan-authored');
  });

  it('the badge names the record, says who controls it, and the hover says what visitors see', () => {
    const w = loadManage();
    const html: string = w.manageControlBadge(w._mapApiListingToManage(apiRow('RLS20093870', CONTROL_RLS)));
    expect(html).toContain('COTALITY COPY · RLS20093870 · read-only, hidden');
    expect(html).toContain('data-control-kind="cotality-duplicate"');
    expect(html).toContain('SL-0004 is the live one');
    const mine: string = w.manageControlBadge(w._mapApiListingToManage(apiRow('SL-0004', CONTROL_SL)));
    expect(mine).toContain('YOU CONTROL THIS ONE · SL-0004 · live');
  });

  it('escapes anything the label carries', () => {
    const w = loadManage();
    const html: string = w.manageControlBadge({ control: { kind: 'cotality', label: '<img onerror=x>', detail: '"q"' } });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img onerror=x&gt;');
  });

  it('the cards and the table rows both render the badge under the address', () => {
    const src = readFileSync(resolve(__dirname, '../../public/crm/js/manage/manage-listings.js'), 'utf8');
    expect(src).toContain(`if (l.control) html += '<p class="mt-1.5">' + manageControlBadge(l)`);
    expect(src).toContain(`(l.control ? '<div class="mt-1">' + manageControlBadge(l)`);
    // the bundle the CRM serves is built from these sources
    const built = readFileSync(resolve(__dirname, '../../public/crm/index-built.html'), 'utf8');
    expect(built).toContain('function manageControlBadge(l)');
    expect(built).toContain('control.canonicalListingId');
  });

  it('Edit on the Cotality copy opens the Mallan listing it duplicates, not the copy', () => {
    const w = loadManage();
    w.myManagementListings = [apiRow('SL-0004', CONTROL_SL), apiRow('RLS20093870', CONTROL_RLS)].map((r) => w._mapApiListingToManage(r));
    w.manageEditListing('RLS20093870');
    expect(w.opened).toEqual(['SALE-FORM-REDESIGN.html?id=308773']);
    expect(w.toasts[0]).toMatch(/Opening SL-0004/);
  });

  it('Edit on a lone Cotality listing opens the read-only view, never the form', () => {
    const w = loadManage();
    w.myManagementListings = [apiRow('RLS20123633', CONTROL_806)].map((r) => w._mapApiListingToManage(r));
    w.manageEditListing('RLS20123633');
    expect(w.opened).toEqual(['/crm/sale-view?listingId=RLS20123633']);
    expect(w.opened.join()).not.toMatch(/SALE-FORM-REDESIGN/);
  });

  it('Edit on the Mallan listing opens the form as before', () => {
    const w = loadManage();
    w.myManagementListings = [apiRow('SL-0004', CONTROL_SL)].map((r) => w._mapApiListingToManage(r));
    w.manageEditListing('SL-0004');
    expect(w.opened).toEqual(['SALE-FORM-REDESIGN.html?id=308773']);
  });
});

// ── The Sale form ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const formListing = (listing_id: string, control: any): any => ({
  id: '1', listing_id, status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Apartment', list_price: '765000',
  bedrooms_total: 1, bathrooms_full: 1, address: addr(), features: {}, media: [], raw_data: { ListingAgreement: 'ExclusiveAgency' }, _control: control,
});

describe('the Sale form treats a Cotality record as read-only', () => {
  it('shows who it is, refuses every save and sends nothing', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: formListing('RLS20093870', CONTROL_RLS), settle: 1800 });
    try {
      const banner = f.d.getElementById('saleReadOnlyBanner');
      expect(banner?.textContent).toMatch(/COTALITY COPY · RLS20093870/);
      expect(banner?.textContent).toMatch(/Nothing typed here can be saved/);
      expect(f.w._saleReadOnlyRecord).toBe('RLS20093870');
      const before = f.requests.filter((r) => r.method !== 'GET').length;
      f.w.submitSalesListing();
      await f.w.manualSaveDraft();
      f.w.performAutoSave();
      expect(f.requests.filter((r) => r.method !== 'GET').length).toBe(before);
    } finally { f.close(); }
  });

  it('the Mallan listing opens as before: no banner, saving is not blocked by the guard', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: formListing('SL-0004', CONTROL_SL), settle: 1800 });
    try {
      expect(f.d.getElementById('saleReadOnlyBanner')).toBeNull();
      expect(f.w._saleReadOnlyRecord).toBe('');
    } finally { f.close(); }
  });
});
