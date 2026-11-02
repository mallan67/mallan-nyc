/// <reference types="jest" />
/**
 * A garage is a building's (the "Parking Garage" amenity), a townhouse's or house's own (the TH tab), or assigned to the unit in some condos and co-ops (the Unit tab)
 * (Maya, 2026-11-02). Before, only the townhouse tab reached Cotality's GarageYN / GarageSpaces, so a condo's assigned garage was never sent.
 */
import { bootAddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const collect = (f: BootedForm): any => (f.w as any).collectSaleFormData();
const radio = (f: BootedForm, name: string, value: string) => {
  const el = f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement;
  el.checked = true;
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
const setValue = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};

describe('the garage a listing sends to Cotality', () => {
  it('a garage assigned to the unit (Unit tab) is sent as GarageYN and GarageSpaces', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      radio(f, 'saleGarageSpaces', 'Yes');
      setValue(f, 'saleGarageSpacesCount', '2');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(2);
    } finally { f.close(); }
  });

  it('"No garage assigned" is sent as GarageYN false, with no spaces', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      radio(f, 'saleGarageSpaces', 'No');
      const data = collect(f);
      expect(data.GarageYN).toBe(false);
      expect(data.GarageSpaces == null).toBe(true);
    } finally { f.close(); }
  });

  it('a townhouse or house keeps its own answer from the TH tab, whatever the Unit tab says', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      radio(f, 'saleGarageSpaces', 'No');
      setValue(f, 'saleTHGarageYN', 'Yes');
      setValue(f, 'saleTHGarageSpaces', '3');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(3);
    } finally { f.close(); }
  });

  it('Yes with no count sends GarageYN true and no number (nothing is invented)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      radio(f, 'saleGarageSpaces', 'Yes');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces == null).toBe(true);
    } finally { f.close(); }
  });
});
