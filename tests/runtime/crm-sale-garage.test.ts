/// <reference types="jest" />
/**
 * A garage is a building's (the "Parking Garage" amenity), a townhouse's or house's own (the TH tab), or assigned to the unit in some condos and co-ops (the Unit tab)
 * (Maya, 2026-11-02). Before, only the townhouse tab reached Cotality's GarageYN / GarageSpaces, so a condo's assigned garage was never sent.
 *
 * Only a Yes on the Unit tab is an answer: its No is the default and asserts nothing (a listing opened with GarageYN true must not submit false). On a unit (condo,
 * co-op, ...) the townhouse tab is locked, so the Unit tab's answer wins, and a count changed there wins over the one saved earlier.
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
const propertyType = (f: BootedForm, value: string) => radio(f, 'salePropertyType', value);

describe('the garage a listing sends to Cotality', () => {
  it('a garage assigned to the unit (Unit tab) is sent as GarageYN and GarageSpaces', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      radio(f, 'saleGarageSpaces', 'Yes');
      setValue(f, 'saleGarageSpacesCount', '2');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(2);
    } finally { f.close(); }
  });

  it('the Unit tab\'s default No sends nothing: a question nobody answered is not sent', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      const data = collect(f);
      expect(data).not.toHaveProperty('GarageYN');
      expect(data.GarageSpaces == null).toBe(true);
    } finally { f.close(); }
  });

  it('Yes with no count sends GarageYN true and no number (the word "Yes" is never sent as the number of spaces)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      radio(f, 'saleGarageSpaces', 'Yes');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces == null).toBe(true);
    } finally { f.close(); }
  });

  it('a listing opened with GarageYN true keeps it: the Unit tab\'s default No does not overwrite it', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      setValue(f, 'saleTHGarageYN', 'Yes');                                  // what opening a record with GarageYN true puts in the form
      setValue(f, 'saleTHGarageSpaces', '1');
      const data = collect(f);                                               // the Unit tab is untouched: its No is the default
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(1);
    } finally { f.close(); }
  });

  it('on a unit, a count changed on the Unit tab wins over the one that came back with the saved listing', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      setValue(f, 'saleTHGarageYN', 'Yes');                                  // restored from the saved record
      setValue(f, 'saleTHGarageSpaces', '1');
      radio(f, 'saleGarageSpaces', 'Yes');
      setValue(f, 'saleGarageSpacesCount', '3');                             // the agent changes it
      expect(collect(f).GarageSpaces).toBe(3);
    } finally { f.close(); }
  });

  it('a townhouse or house keeps its own answer from the TH tab, whatever the Unit tab says', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'SingleFamilyTownhouse');
      radio(f, 'saleGarageSpaces', 'Yes');
      setValue(f, 'saleGarageSpacesCount', '9');
      setValue(f, 'saleTHGarageYN', 'Yes');
      setValue(f, 'saleTHGarageSpaces', '3');
      const data = collect(f);
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(3);
    } finally { f.close(); }
  });

  it('the Yes / No radio no longer claims GarageSpaces (a number); the townhouse count still does', () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    expect(html).not.toMatch(/name="saleGarageSpaces" value="Yes"[^>]*data-concept/);
    expect(html).toMatch(/id="saleTHGarageSpaces"[^>]*data-concept="GarageSpaces"/);
  });
});

describe('taking a saved garage back (Vercel agent review on #677)', () => {
  it('a unit whose agent chooses No on the Unit tab sends GarageYN false and 0 spaces, taking back a saved Yes', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      setValue(f, 'saleTHGarageYN', 'Yes');                                  // what a saved record with GarageYN true puts in the form
      setValue(f, 'saleTHGarageSpaces', '1');
      radio(f, 'saleGarageSpaces', 'Yes');
      radio(f, 'saleGarageSpaces', 'No');                                    // the agent changes their answer
      const data = collect(f);
      expect(data.GarageYN).toBe(false);
      expect(data.GarageSpaces).toBe(0);
    } finally { f.close(); }
  });

  it('the untouched default No still says nothing: a saved GarageYN true is kept', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'Condo');
      setValue(f, 'saleTHGarageYN', 'Yes');
      setValue(f, 'saleTHGarageSpaces', '1');
      const data = collect(f);                                               // the Unit tab's radio was never touched
      expect(data.GarageYN).toBe(true);
      expect(data.GarageSpaces).toBe(1);
    } finally { f.close(); }
  });

  it('a house is not affected by the Unit tab\'s No: its own TH answer stands', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      propertyType(f, 'SingleFamilyTownhouse');
      setValue(f, 'saleTHGarageYN', 'Yes');
      setValue(f, 'saleTHGarageSpaces', '2');
      radio(f, 'saleGarageSpaces', 'No');
      expect(collect(f).GarageYN).toBe(true);
    } finally { f.close(); }
  });
});
