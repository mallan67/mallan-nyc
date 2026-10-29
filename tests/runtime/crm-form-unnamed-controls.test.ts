/// <reference types="jest" />
/**
 * Controls that were never saved, and yes / no answers that were always "no".
 *
 * The listing forms save by sweeping every control into the payload under `id || name`, so a control with neither is silently dropped: 55 of them (26 Rental, 29
 * Sale) held what the agent typed and lost it. The Rental "Rental Deal Fees" table saved nothing at all. And BasementYN, TaxAbatementYN and RentingAllowedYN were
 * derived by comparing a Yes / No select with true / 'true', so every answer was false.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, sleep, storedListing, type BootedForm } from './add-form-harness';
import { bootViewer, rendered, until } from './tools-viewer-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const html = (name: string) => readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8');

describe.each([['RENTAL-FORM-REDESIGN', 'rental'], ['SALE-FORM-REDESIGN', 'sale']] as const)('%s: every control in the saved area can be saved', (form, prefix) => {
  it('has no control with neither an id nor a name (the Rental fee rows are the one list, saved as rentalDealFees)', () => {
    const d: Document = new JSDOM(html(form)).window.document;
    const zones = [d.querySelector('.flex-1'), d.getElementById(`${prefix}BuildingModal`), d.getElementById(`${prefix}MediaModal`)].filter(Boolean) as Element[];
    const unnamed = new Set<string>();
    for (const zone of zones) {
      zone.querySelectorAll('input, select, textarea').forEach((el) => {
        const type = (el.getAttribute('type') || el.tagName).toLowerCase();
        if (['button', 'submit', 'reset', 'file', 'image', 'hidden'].includes(type) || el.id || (el as HTMLInputElement).name) return;
        if (el.closest('#rentalFeesTableBody')) return;
        const label = (el.closest('div')?.querySelector('label')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        unnamed.add(`${type}: ${label}`);
      });
    }
    expect([...unnamed]).toEqual([]);
  });
});

describe('RENTAL-FORM-REDESIGN: the Rental Deal Fees table is saved and comes back', () => {
  const feeRows = (f: BootedForm) => [...f.d.querySelectorAll('#rentalFeesTableBody tr')] as HTMLTableRowElement[];
  const cells = (tr: HTMLTableRowElement) => ({
    type: (tr.querySelector('select') as HTMLSelectElement).value,
    description: (tr.querySelector('input[type="text"]') as HTMLInputElement).value,
    cost: (tr.querySelector('input[type="number"]') as HTMLInputElement).value,
  });
  const fill = (tr: HTMLTableRowElement, description: string, cost: string, type?: string) => {
    (tr.querySelector('input[type="text"]') as HTMLInputElement).value = description;
    (tr.querySelector('input[type="number"]') as HTMLInputElement).value = cost;
    if (type) (tr.querySelector('select') as HTMLSelectElement).value = type;
  };

  it('saves nothing for the preset blank rows, and the rows the agent filled in or added, in order', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 1000 });
    try {
      expect(feeRows(f)).toHaveLength(6);
      expect(f.w.collectRentalFormData().rentalDealFees).toEqual([]);
      fill(feeRows(f)[0], 'Non-refundable application fee', '75');
      f.w.addRentalFeeRow();
      expect(feeRows(f)).toHaveLength(7);
      fill(feeRows(f)[6], 'Processing', '120.50', 'ProcessingFee');
      fill(feeRows(f)[3], '', '25');                              // a cost without a description is still a fee
      expect(f.w.collectRentalFormData().rentalDealFees).toEqual([
        { type: 'ApplicationFee', description: 'Non-refundable application fee', cost: '75' },
        { type: 'CreditCheckFee', description: '', cost: '25' },
        { type: 'ProcessingFee', description: 'Processing', cost: '120.50' },
      ]);
    } finally { f.close(); }
  });

  it('opens a saved listing with exactly the saved rows, and saves the same list again', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 1000 });
    let stored: Record<string, any>;
    try {
      fill(feeRows(f)[0], 'Application', '75');
      f.w.addRentalFeeRow();
      fill(feeRows(f)[6], 'Processing', '120.50', 'ProcessingFee');
      stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
    } finally { f.close(); }
    const g = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    try {
      expect([...new Set(g.errors)]).toEqual([]);
      expect(feeRows(g).map(cells)).toEqual([
        { type: 'ApplicationFee', description: 'Application', cost: '75' },
        { type: 'ProcessingFee', description: 'Processing', cost: '120.50' },
      ]);
      expect(g.w.collectRentalFormData().rentalDealFees).toEqual(stored.raw_data.rentalDealFees);
      // a row can still be added and removed after the load
      g.w.addRentalFeeRow();
      expect(feeRows(g)).toHaveLength(3);
      (feeRows(g)[0].querySelector('button') as HTMLButtonElement).click();
      expect(feeRows(g)).toHaveLength(2);
      expect(g.w.collectRentalFormData().rentalDealFees).toEqual([{ type: 'ProcessingFee', description: 'Processing', cost: '120.50' }]);
    } finally { g.close(); }
  });

  it('a listing with no saved fees keeps the preset rows, and a fee type the page does not offer is still shown', async () => {
    const none = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: { rentalDealFees: [] } }, settle: 1500 });
    try { expect(feeRows(none)).toHaveLength(6); } finally { none.close(); }
    const odd = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: { rentalDealFees: [{ type: 'KeyDeposit', description: 'Keys', cost: '50' }] } }, settle: 1500 });
    try { expect(feeRows(odd).map(cells)).toEqual([{ type: 'KeyDeposit', description: 'Keys', cost: '50' }]); } finally { odd.close(); }
  });

  it('the Tools viewer shows the saved rows read-only, without the add and delete buttons', async () => {
    const listing = { id: '5', listing_id: 'RL-5', status: 'Active', address: {}, features: {}, agent_info: {}, media: [], raw_data: { rentalDealFees: [{ type: 'ProcessingFee', description: 'Processing', cost: '120.50' }, { type: 'Other', description: 'Keys', cost: '10' }] } };
    const b = bootViewer('RENTAL-FORM-WITH-TOOLS', { listing });
    try {
      await until(() => rendered(b.d), 15000);
      const rows = [...b.d.querySelectorAll('#rentalFeesTableBody tr')] as HTMLTableRowElement[];
      expect(rows.map(cells)).toEqual([{ type: 'ProcessingFee', description: 'Processing', cost: '120.50' }, { type: 'Other', description: 'Keys', cost: '10' }]);
      for (const tr of rows) {
        for (const control of [...tr.querySelectorAll('input, select')] as Array<HTMLInputElement | HTMLSelectElement>) expect(control.disabled || (control as HTMLInputElement).readOnly).toBe(true);
        for (const button of [...tr.querySelectorAll('button')]) expect(button.classList.contains('viewer-hidden')).toBe(true);
      }
      expect(b.d.querySelector('[onclick*="addRentalFeeRow"]')!.classList.contains('viewer-hidden')).toBe(true);
    } finally { b.close(); }
  });
});

describe.each([
  ['RENTAL-FORM-REDESIGN', 'collectRentalFormData', { garage: 'rentalTHGarageYN', basement: 'rentalTHBasementYN', abatement: 'bldgTaxAbatementYN' }],
  ['SALE-FORM-REDESIGN', 'collectSaleFormData', { garage: 'saleTHGarageYN', basement: 'saleTHBasementYN', abatement: 'saleBldgTaxAbatementYN' }],
] as const)('%s: GarageYN, BasementYN and TaxAbatementYN follow the answer', (form, collector, ids) => {
  const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLSelectElement).value = value; };

  it.each([['Yes', true], ['No', false]])('answered %s: sent as %s', async (answer, expected) => {
    const f = await bootAddForm(form, { settle: 1000 });
    try {
      for (const id of Object.values(ids)) set(f, id, answer);
      const p = f.w[collector]();
      expect([p.GarageYN, p.BasementYN, p.TaxAbatementYN]).toEqual([expected, expected, expected]);
    } finally { f.close(); }
  });

  it('a question nobody answered is not sent at all (it was sent as false)', async () => {
    const f = await bootAddForm(form, { settle: 1000 });
    try {
      const p = f.w[collector]();
      for (const key of ['GarageYN', 'BasementYN', 'TaxAbatementYN']) expect(p).not.toHaveProperty(key);
    } finally { f.close(); }
  });
});

describe('RENTAL-FORM-REDESIGN: RentingAllowedYN and the basement type', () => {
  it.each([['Yes', true], ['No', false], ['Limited', undefined], ['BoardApproval', undefined], ['', undefined]])('sublet policy "%s" is sent as %s', async (policy, expected) => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 1000 });
    try {
      (f.d.getElementById('bldgSublettingAllowed') as HTMLSelectElement).value = policy;
      const p = f.w.collectRentalFormData();
      if (expected === undefined) expect(p).not.toHaveProperty('RentingAllowedYN');
      else expect(p.RentingAllowedYN).toBe(expected);
    } finally { f.close(); }
  });

  it('the basement type shows when the answer is Yes, is saved, and comes back', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 1000 });
    let stored: Record<string, any>;
    try {
      const basement = f.d.getElementById('rentalTHBasementYN') as HTMLSelectElement;
      const type = f.d.getElementById('rentalTHBasementType') as HTMLElement;
      expect(type.style.display).toBe('none');
      basement.value = 'Yes';
      basement.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(type.style.display).toBe('block');
      const kind = f.d.getElementById('rentalTHBasementKind') as HTMLSelectElement;
      kind.value = kind.options[kind.options.length - 1].value;
      stored = storedListing(f.w.collectRentalFormData(), 'rent') as Record<string, any>;
      expect(stored.raw_data.BasementYN).toBe(true);
      expect(stored.raw_data.rentalTHBasementKind).toBe(kind.value);
    } finally { f.close(); }
    const g = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    try {
      expect((g.d.getElementById('rentalTHBasementType') as HTMLElement).style.display).toBe('block');
      expect((g.d.getElementById('rentalTHBasementKind') as HTMLSelectElement).value).toBe(stored.raw_data.rentalTHBasementKind);
      await sleep(10);
    } finally { g.close(); }
  });
});
