/// <reference types="jest" />
/**
 * The rent of a commercial listing, from the Sale form to the public record (Maya, 2026-11-05: 800 2nd Ave #806, a medical office, last advertised at $40 a square foot on 1,482 square feet, "use this approx
 * rental information for calculator"). The form has a "Rent ($ per SF per year)" box in its Commercial section; what is typed there is saved with the listing, comes back when the listing is opened again,
 * and is what the public record turns into a monthly rent for the Investment Analysis.
 */
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { bootAddForm, storedListing, type BootedForm } from './add-form-harness';
import { waitUntil } from './sale-form-filler';

jest.setTimeout(120000);

const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;
const typeInto = (f: BootedForm, id: string, v: string) => { const el = f.d.getElementById(id) as HTMLInputElement; el.value = v; el.dispatchEvent(new f.w.Event('input', { bubbles: true })); el.dispatchEvent(new f.w.Event('change', { bubbles: true })); };
const chooseCommercial = (f: BootedForm) => {
  const r = f.d.querySelector('input[name="salePropertyType"][value="Commercial"]') as HTMLInputElement;
  r.checked = true; r.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  (f.w as any).applySalesFieldRules();
};

describe('the Commercial section of the Sale form has the rent', () => {
  it('a "Rent ($ per SF per year)" box, empty, that says what it is for', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    try {
      const box = f.d.getElementById('saleCommercialRentPSF') as HTMLInputElement;
      expect(box).not.toBeNull();
      expect(box.value).toBe('');
      expect(box.type).toBe('number');
      expect(box.parentElement!.textContent).toMatch(/Rent \(\$ per SF per year\)/);
      expect(box.parentElement!.textContent).toMatch(/Investment Analysis on the listing page starts from it/);
    } finally { f.close(); }
  });
});

describe('from the form to the public record', () => {
  it('$40 typed for a commercial listing is sent, comes back when the listing is opened again, and is $4,940 a month on the public record of 1,482 SF', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    let payload: Record<string, any> = {};
    try {
      chooseCommercial(f);
      typeInto(f, 'saleCommercialRentPSF', '40');
      payload = (f.w as any).collectSaleFormData();
    } finally { f.close(); }
    expect(payload.saleCommercialRentPSF).toBe('40');

    const stored = storedListing(payload, 'sale') as Record<string, any>;
    expect(stored.raw_data.saleCommercialRentPSF).toBe('40');                       // what the create route keeps

    const g = await bootAddForm('SALE-FORM-REDESIGN', { settle: 800, search: '?id=1', listing: stored });
    try {
      await waitUntil(() => (g.w as any)._saleEditLoad === 'loaded');
      expect(val(g, 'saleCommercialRentPSF')).toBe('40');                           // and the form shows it again
    } finally { g.close(); }

    const dto = dbListingToPublicDTO({ ...stored, id: '10', listing_id: 'SL-0010', property_type: 'Commercial', living_area: '1482', borough: 'manhattan', status: 'Active' } as unknown as DbListing);
    expect(dto.isCommercial).toBe(true);
    expect(dto.estimatedRent).toEqual({ monthly: 4940, perSqFtYear: 40, sqFt: 1482 });
  });

  it('a commercial listing saved with no rent has none on the public record (and the page shows no calculator for it)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 500 });
    let payload: Record<string, any> = {};
    try { chooseCommercial(f); payload = (f.w as any).collectSaleFormData(); } finally { f.close(); }
    const stored = storedListing(payload, 'sale') as Record<string, any>;
    const dto = dbListingToPublicDTO({ ...stored, id: '10', listing_id: 'SL-0010', property_type: 'Commercial', living_area: '1482', borough: 'manhattan', status: 'Active' } as unknown as DbListing);
    expect(dto.isCommercial).toBe(true);
    expect(dto).not.toHaveProperty('estimatedRent');
  });
});
