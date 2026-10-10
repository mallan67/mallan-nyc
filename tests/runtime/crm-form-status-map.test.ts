/// <reference types="jest" />
/**
 * The status a Sale / Rental Add / Edit form sends is the one its status list names. The Sale list has four steps (Pending, Closed, Canceled, Incomplete) and the Rental list has five (Hold,
 * Pending, Closed, Canceled, Incomplete) in its "RLS System" part that the form's status map did not know, and an unknown status became "Active": a listing marked Closed was sent as Active,
 * and the Sale form asked the server to publish it. Every step the list offers now stands for a status, an unknown one stands for none (nothing is made up), and a table is looked up by its own
 * keys. The Sale form's map stands for the server's canonical statuses (lib/crm/status-mapping.ts: CANONICAL_STATUSES); the Rental form's for the live Cotality MlsStatus values
 * (data/cotality-enums.live.json). These tests drive the REAL pages.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CANONICAL_STATUSES } from '../../lib/crm/status-mapping';
import { bootAddForm, sleep, until, type AddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const COTALITY: Record<string, string[]> = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8')).enums;

type Form = { form: AddForm; prefix: 'sale' | 'rental'; map: string; accepted: readonly string[]; collector: string; update: string; display: string; rlsSystem: [string, string][] };
const FORMS: Form[] = [
  { form: 'SALE-FORM-REDESIGN', prefix: 'sale', map: 'getResoMlsStatus', accepted: CANONICAL_STATUSES, collector: 'collectSaleFormData', update: 'updateSaleStatusFields', display: 'saleResoMlsStatus',
    rlsSystem: [['Pending', 'Pending'], ['Closed', 'Sold'], ['Canceled', 'Cancelled'], ['Incomplete', 'Draft'], ['Hold', 'Hold']] },
  { form: 'RENTAL-FORM-REDESIGN', prefix: 'rental', map: 'getResoRentalMlsStatus', accepted: COTALITY.MlsStatus, collector: 'collectRentalFormData', update: 'updateRentalStatusFields', display: 'rentalResoMlsStatus',
    rlsSystem: [['Pending', 'Pending'], ['Closed', 'Closed'], ['Canceled', 'Canceled'], ['Incomplete', 'Incomplete'], ['Hold', 'Hold']] },
];

const steps = (f: BootedForm, p: Form) => [...(f.d.getElementById(`${p.prefix}Status`) as HTMLSelectElement).options].filter((o) => o.value && !o.disabled).map((o) => o.value);
const choose = (f: BootedForm, p: Form, step: string) => {
  const select = f.d.getElementById(`${p.prefix}Status`) as HTMLSelectElement;
  if (![...select.options].some((o) => o.value === step)) {
    const option = f.d.createElement('option');
    option.value = step; option.textContent = step;
    select.appendChild(option);
  }
  select.value = step;
};

describe.each(FORMS)('$form: the status list', (p) => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm(p.form, { settle: 600 }); });
  afterAll(() => f.close());

  it('boots without a page error and offers the steps of its list', () => {
    expect(f.errors).toEqual([]);
    expect(steps(f, p).length).toBeGreaterThanOrEqual(20);
  });

  it('every step it offers stands for a status the receiving side knows', () => {
    for (const step of steps(f, p)) {
      const sent: string = f.w[p.map](step);
      expect([step, sent !== '' && p.accepted.includes(sent)]).toEqual([step, true]);
    }
  });

  it.each(p.rlsSystem)('the "%s" step of the RLS System part of the list stands for %s, not for Active', (step, status) => {
    expect(f.w[p.map](step)).toBe(status);
  });

  it('the line that says what is sent and the payload say what the map says, for every step', () => {
    for (const step of steps(f, p)) {
      choose(f, p, step);
      f.w[p.update]();
      expect([step, f.d.getElementById(p.display)!.textContent]).toEqual([step, f.w[p.map](step)]);
      expect([step, f.w[p.collector]().MlsStatus]).toEqual([step, f.w[p.map](step)]);
    }
  });

  it.each([['Bogus'], ['active'], [''], [undefined], [null], ['constructor'], ['__proto__'], ['toString'], ['hasOwnProperty']])('a status that is %p stands for none: nothing is made up', (step) => {
    expect(f.w[p.map](step)).toBe('');
  });

  it('a step the form does not know is shown as "--", and no status is sent for it', () => {
    choose(f, p, 'Bogus');
    f.w[p.update]();
    expect(f.d.getElementById(p.display)!.textContent).toBe('--');
    expect(f.w[p.collector]().MlsStatus).toBe('');
  });
});

describe('SALE-FORM-REDESIGN: the status a submit asks the server for', () => {
  /** Submits the form with the step chosen (an In-House web listing: no REBNY fields are required) and waits for the page to finish. */
  async function submit(step: string) {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 1200 });
    (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
    choose(f, FORMS[0], step);
    f.w.submitSalesListing();
    await until(() => f.saved.length > 0, 5000);          // the listing is saved first...
    await sleep(800);                                      // ...and the page then asks for a status, if it is going to
    return f;
  }

  it.each([['Closed', 'Sold'], ['Sold', 'Sold'], ['Canceled', 'Cancelled'], ['Cancelled', 'Cancelled'], ['Pending', 'Pending'], ['Hold', 'Hold'], ['Active', 'Active'], ['OfferOut', 'ActiveUnderContract']])(
    'the %s step asks the server for %s',
    async (step, status) => {
      const f = await submit(step);
      try {
        expect(f.errors).toEqual([]);
        expect(f.statusCalls).toEqual([['1', status]]);
      } finally { f.close(); }
    },
  );

  it('the Incomplete step is a Draft: the listing is saved and nothing is published', async () => {
    const f = await submit('Incomplete');
    try {
      expect((f.saved[0] as any).MlsStatus).toBe('Draft');
      expect((f.saved[1] as any)._crmWorkflowStatus).toBe('Incomplete');        // the step the agent chose is kept
      expect(f.statusCalls).toEqual([]);
    } finally { f.close(); }
  });

  it('a step the form does not know saves the listing, changes its status in no way, and says so', async () => {
    const f = await submit('Bogus');
    try {
      expect((f.saved[0] as any).MlsStatus).toBe('');
      expect((f.saved[1] as any)._crmWorkflowStatus).toBe('Bogus');
      expect(f.statusCalls).toEqual([]);
      const toasts = [...f.d.querySelectorAll('body > div[style*="99999"]')].map((t) => t.textContent ?? '');
      expect(toasts.some((t) => /status "Bogus" is not one this form can set/.test(t))).toBe(true);
    } finally { f.close(); }
  });

  it('a form without a status control sets no status either', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 1200 });
    try {
      (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
      f.d.getElementById('saleStatus')!.remove();
      f.w.submitSalesListing();
      await until(() => f.saved.length > 0, 5000);
      await sleep(800);
      expect(f.statusCalls).toEqual([]);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: the status helpers of the other places that use a status', () => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 }); });
  afterAll(() => f.close());

  it('the status tracking line says what the map says for a step, and "--" for one the form does not know', () => {
    const select = f.d.getElementById('saleStatus') as HTMLSelectElement;
    choose(f, FORMS[0], 'Closed');
    f.w.updateStatusTracking();
    expect(f.d.getElementById('saleResoMlsStatus')!.textContent).toBe('Sold');
    choose(f, FORMS[0], 'Bogus');
    f.w.updateStatusTracking();
    expect(f.d.getElementById('saleResoMlsStatus')!.textContent).toBe('--');
    select.value = 'Draft';
  });

  it.each([['Draft', 'Draft'], ['Closed', 'Sold'], ['Canceled', 'Cancelled'], ['Incomplete', 'Draft'], ['ActiveUnderContract', 'ActiveUnderContract'], ['Pending', 'Pending']])(
    'a stored status of %s is in the family of %s',
    (status, family) => {
      expect(f.w._saleStatusFamily(status)).toBe(family);
    },
  );

  it.each([['Bogus'], [''], [undefined], ['constructor'], ['__proto__'], ['toString'], ['hasOwnProperty']])('a stored status of %p is in no family, and the saved step is then the one shown', (status) => {
    expect(f.w._saleStatusFamily(status)).toBe('');
    expect(f.w._saleStatusToShow('Hold', status)).toBe('Hold');
  });
});
