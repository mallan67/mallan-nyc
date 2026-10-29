/// <reference types="jest" />
/**
 * The owner / client relationship in the two listing forms and the client workspace (integration brief 2026-10-28, step 3:
 * "owner / client relationship surviving listing create / edit / reload").
 *
 * Listing.owner_client_id → Lead (relation ListingOwner) is a typed column, not a provider field and not a raw_data fact. Each form has an
 * Owner picker (the CRM's clients) marked Mallan-internal; the collector sends the choice as its own key `owner_client_id`; a saved listing
 * opens with its owner selected from the typed column — before the client list arrives and even when it never does — and sends it back
 * unchanged. The client workspace lists the listings a client owns through GET /api/crm/listings?owner_client_id=.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { bootAddForm, storedListing } from './add-form-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r/g, '');

describe.each([
  ['SALE-FORM-REDESIGN', 'sale', 'collectSaleFormData', 'sale'],
  ['RENTAL-FORM-REDESIGN', 'rental', 'collectRentalFormData', 'rent'],
] as const)('%s: the Owner picker', (form, prefix, collector, listingType) => {
  it('a new listing sends no owner; a chosen owner is sent as owner_client_id, its own key, never a provider field', async () => {
    const f = await bootAddForm(form, { settle: 400 });
    try {
      const sel = f.d.getElementById(prefix + 'OwnerClientId') as HTMLSelectElement;
      expect(sel).not.toBeNull();
      expect(sel.getAttribute('data-concept-disposition')).toBe('mallan-internal');
      expect((f.w as any)[collector]().owner_client_id).toBeNull();
      const opt = f.d.createElement('option'); opt.value = '56'; opt.textContent = 'Diego Gomez'; sel.appendChild(opt); sel.value = '56';
      const body = (f.w as any)[collector]();
      expect(body.owner_client_id).toBe('56');
      expect(Object.keys(body).filter((k) => /^Owner/.test(k))).toEqual([]);
    } finally { f.close(); }
  });

  it('a saved listing opens with its owner selected from the typed column (without the client list), and sends it back unchanged', async () => {
    const created = await bootAddForm(form, { settle: 400 });
    let stored: Record<string, unknown>;
    try { stored = storedListing((created.w as any)[collector](), listingType); } finally { created.close(); }
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...stored, owner_client_id: '56' }, settle: 1800 });
    try {
      const sel = f.d.getElementById(prefix + 'OwnerClientId') as HTMLSelectElement;
      expect(sel.value).toBe('56');
      expect((f.w as any)[collector]().owner_client_id).toBe('56');
    } finally { f.close(); }
    const g = await bootAddForm(form, { search: '?id=1', listing: { ...stored, owner_client_id: null }, settle: 1800 });
    try {
      expect((g.d.getElementById(prefix + 'OwnerClientId') as HTMLSelectElement).value).toBe('');
      expect((g.w as any)[collector]().owner_client_id).toBeNull();
    } finally { g.close(); }
  });

  it('the picker is filled from the CRM clients when they arrive, keeping the stored owner selected by name', async () => {
    const created = await bootAddForm(form, { settle: 400 });
    let stored: Record<string, unknown>;
    try { stored = storedListing((created.w as any)[collector](), listingType); } finally { created.close(); }
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...stored, owner_client_id: '56' }, settle: 1800 });
    try {
      (f.w as any).MallanAPI.clients = { list: async () => ({ clients: [{ id: '12', first_name: 'Ada', last_name: 'Lovelace', roles: ['buyer'] }, { id: '56', first_name: 'Diego', last_name: 'Gomez', roles: ['tenant'] }] }) };
      (f.w as any)[prefix === 'sale' ? '_saleLoadOwnerPicker' : '_rentalLoadOwnerPicker']();
      await new Promise((r) => setTimeout(r, 50));
      const sel = f.d.getElementById(prefix + 'OwnerClientId') as HTMLSelectElement;
      expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([['', '— No owner linked —'], ['12', 'Ada Lovelace (buyer)'], ['56', 'Diego Gomez (tenant)']]);
      expect(sel.value).toBe('56');
      expect((f.w as any)[collector]().owner_client_id).toBe('56');
    } finally { f.close(); }
  });
});

describe('the client workspace and the API client', () => {
  it('the workspace shows the listings a client owns, read by owner_client_id through the API client', () => {
    const ws = read('public/crm/js/dashboard/workspace.js');
    expect(ws).toContain('<h3>Owned Listings</h3>');
    expect(ws).toContain('MallanAPI.listings.list({ owner_client_id: _clientId, limit: 50 })');
    const api = read('public/crm/js/core/api-client.js');
    expect(api).toContain("if (params.owner_client_id) qs.push('owner_client_id=' + encodeURIComponent(params.owner_client_id));");
  });
});
