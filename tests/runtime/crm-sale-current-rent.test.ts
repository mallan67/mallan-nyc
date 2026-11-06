/// <reference types="jest" />
/**
 * The rent now paid by the tenant in place, from the Sale form to the public record (Maya, 2026-11-06: "the current rent for this unit is $4350 cause i rented it", 333 E 46th St #2G, tenant-occupied with a
 * lease to August 14, 2027). The Cotality record of the unit carries no rent (only the remarks say it is tenant-occupied), so the figure is the broker's: a "Current Rent ($ per month)" box in the Listing
 * Info tab, beside Available for Occupancy. What is typed is saved with the listing, comes back when it is opened again, shows in the read-only viewer, and is what the calculator starts from.
 */
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { bootAddForm, storedListing, type BootedForm } from './add-form-harness';
import { waitUntil } from './sale-form-filler';

jest.setTimeout(120000);

const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;
const typeInto = (f: BootedForm, id: string, v: string) => { const el = f.d.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new f.w.Event('input', { bubbles: true })); el.dispatchEvent(new f.w.Event('change', { bubbles: true })); };

describe('the Sale form has the current rent', () => {
  it('a "Current Rent ($ per month)" box, empty, that says what it is for, who sees it, and when to leave it empty', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    try {
      const box = f.d.getElementById('saleCurrentMonthlyRent') as HTMLInputElement;
      expect(box).not.toBeNull();
      expect(box.value).toBe('');
      expect(box.type).toBe('number');
      const words = box.parentElement!.textContent!;
      expect(words).toMatch(/Current Rent \(\$ per month\)/);
      expect(words).toMatch(/What the tenant in place pays now/);
      expect(words).toMatch(/visitors see it: enter it with the owner's consent/);
      expect(words).toMatch(/leave it empty if the unit is vacant or owner-occupied/);
    } finally { f.close(); }
  });
});

describe('from the form to the public record', () => {
  it('$4,350 typed for 333 E 46th #2G is sent, comes back when the listing is opened again, and is the current rent on the public record', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    let payload: Record<string, any> = {};
    try { typeInto(f, 'saleCurrentMonthlyRent', '4350'); payload = (f.w as any).collectSaleFormData(); } finally { f.close(); }
    expect(payload.saleCurrentMonthlyRent).toBe('4350');

    const stored = storedListing(payload, 'sale') as Record<string, any>;
    expect(stored.raw_data.saleCurrentMonthlyRent).toBe('4350');                      // what the create route keeps

    const g = await bootAddForm('SALE-FORM-REDESIGN', { settle: 800, search: '?id=1', listing: stored });
    try {
      await waitUntil(() => (g.w as any)._saleEditLoad === 'loaded');
      expect(val(g, 'saleCurrentMonthlyRent')).toBe('4350');                           // and the form shows it again
    } finally { g.close(); }

    const dto = dbListingToPublicDTO({ ...stored, id: '4', listing_id: 'SL-0004', property_type: 'Residential', living_area: '860', borough: 'manhattan', status: 'Active' } as unknown as DbListing);
    expect(dto.currentMonthlyRent).toBe(4350);
  });

  it('a listing saved with no current rent has none on the public record (a vacant or owner-occupied unit starts from an average)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    let payload: Record<string, any> = {};
    try { payload = (f.w as any).collectSaleFormData(); } finally { f.close(); }
    const stored = storedListing(payload, 'sale') as Record<string, any>;
    const dto = dbListingToPublicDTO({ ...stored, id: '4', listing_id: 'SL-0004', property_type: 'Residential', living_area: '860', borough: 'manhattan', status: 'Active' } as unknown as DbListing);
    expect(dto).not.toHaveProperty('currentMonthlyRent');
  });
});
