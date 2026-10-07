/// <reference types="jest" />
/**
 * The Commission tab of the Sale and Rental Add / Edit forms is a worksheet, and says so.
 *
 * It ended in a "Submit to Broker" button that made no request at all: it checked that the boxes were filled, showed "Commission
 * Request Submitted! ... Status: Submitted - awaiting broker review." and lit step 2 of a five-step tracker. Nothing was sent and no
 * request existed, so an agent who pressed it believed the broker had the request when the broker did not.
 *
 * The button is not wired to /api/crm/deals here: that route takes a buyer or tenant representation only, and the master plan (7.11)
 * keeps commission data off the listing ("does not host commission fields and does not create a second deal state") and asks for
 * LINK versus OWN to be confirmed before a listing gets a commission surface. Until that is decided the tab says what it is: figures
 * saved with the listing, nothing sent. These tests drive the REAL pages.
 *
 * The same pass fixes the figures: a listing side the agent has not typed was shown, and saved, as a cooperating side of 100%.
 */
import { bootAddForm, sleep, until, type AddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(240000);

type Page = {
  form: AddForm; tab: string; comm: string; collector: string; calculate: string; submit: string; sidebarTab: string;
  status: [key: string, value: string];
  // every box the old handler required, so a handler that still reported a submission would have had everything it asked for
  required: [id: string, value: string][];
  payMethod: string;
  price: string; priceValue: string;
  // [id, value] set before calculating, then the figures read back: gross, listing side, cooperating side, agent payout, company share
  figures: { set: [string, string][]; gross: number; listing: number; coop: number; agent: number; company: number }[];
  listingSidePct: string; coopSidePct: string; splitPct: string; grossId: string; listingAmtId: string; coopAmtId: string; agentId: string; companyId: string;
  baseInputs: [string, string][];                       // what makes a gross: set before every listing side case
  worksheet: [id: string, value: string][];            // typed on the tab: saved with the listing and shown again
};

const PAGES: Page[] = [
  {
    form: 'SALE-FORM-REDESIGN', tab: 'saleMainTab7', comm: 'commSale', collector: 'collectSaleFormData', calculate: 'calculateSaleCommission',
    submit: 'submitSaleCommissionRequest', sidebarTab: 'sidebarTab7', status: ['saleStatus', 'Sold'],
    required: [['commSaleFinalPrice', '1000000'], ['commSaleTotalPct', '6'], ['commSaleSellerName', 'Pat Seller'], ['commSaleBuyerName', 'Bo Buyer'],
      ['commSaleBuyerEmail', 'bo@example.test'], ['commSaleBuyerPhone', '2125550100'], ['commSaleClosingDate', '2026-10-01']],
    payMethod: 'commSalePayMethod', price: 'commSaleFinalPrice', priceValue: '1000000',
    figures: [
      { set: [['commSaleTotalPct', '6'], ['commSaleListingSidePct', '50'], ['commSaleAgentSplitPct', '80']], gross: 60000, listing: 30000, coop: 30000, agent: 24000, company: 6000 },
      { set: [['commSaleTotalPct', '2.5'], ['commSaleListingSidePct', '40'], ['commSaleAgentSplitPct', '70']], gross: 25000, listing: 10000, coop: 15000, agent: 7000, company: 3000 },
    ],
    listingSidePct: 'commSaleListingSidePct', coopSidePct: 'commSaleCoopSidePct', splitPct: 'commSaleAgentSplitPct', grossId: 'commSaleGrossAmount',
    listingAmtId: 'commSaleListingSideAmt', coopAmtId: 'commSaleCoopSideAmt', agentId: 'commSaleAgentPayout', companyId: 'commSaleCompanyShare',
    baseInputs: [['commSaleFinalPrice', '1000000'], ['commSaleTotalPct', '6'], ['commSaleAgentSplitPct', '80']],
    worksheet: [['commSaleSellerName', 'Pat Seller'], ['commSaleBuyerEmail', 'bo@example.test'], ['commSaleNotes', 'Referral fee to the buyer agent'], ['commSaleTotalPct', '6']],
  },
  {
    form: 'RENTAL-FORM-REDESIGN', tab: 'rentalMainTab7', comm: 'commRental', collector: 'collectRentalFormData', calculate: 'calculateRentalCommission',
    submit: 'submitRentalCommissionRequest', sidebarTab: 'sidebarTab7', status: ['rentalStatus', 'Rented'],
    required: [['commRentalFinalPrice', '3000'], ['commRentalCommValue', '1'], ['commRentalLandlordName', 'Pat Owner'], ['commRentalTenantName', 'Tess Tenant'],
      ['commRentalTenantEmail', 'tess@example.test'], ['commRentalTenantPhone', '2125550100'], ['commRentalLeaseStart', '2026-10-01']],
    payMethod: 'commRentalPayMethod', price: 'commRentalFinalPrice', priceValue: '3000',
    figures: [
      { set: [['commRentalBasis', 'months'], ['commRentalCommValue', '1'], ['commRentalListingSidePct', '50'], ['commRentalAgentSplitPct', '70']], gross: 3000, listing: 1500, coop: 1500, agent: 1050, company: 450 },
      { set: [['commRentalBasis', 'percent'], ['commRentalCommValue', '10'], ['commRentalListingSidePct', '60'], ['commRentalAgentSplitPct', '50']], gross: 3600, listing: 2160, coop: 1440, agent: 1080, company: 1080 },
      { set: [['commRentalBasis', 'flat'], ['commRentalCommValue', '2500'], ['commRentalListingSidePct', '100'], ['commRentalAgentSplitPct', '90']], gross: 2500, listing: 2500, coop: 0, agent: 2250, company: 250 },
    ],
    listingSidePct: 'commRentalListingSidePct', coopSidePct: 'commRentalCoopSidePct', splitPct: 'commRentalAgentSplitPct', grossId: 'commRentalGrossAmount',
    listingAmtId: 'commRentalListingSideAmt', coopAmtId: 'commRentalCoopSideAmt', agentId: 'commRentalAgentPayout', companyId: 'commRentalCompanyShare',
    baseInputs: [['commRentalFinalPrice', '3000'], ['commRentalBasis', 'months'], ['commRentalCommValue', '1'], ['commRentalAgentSplitPct', '70']],
    worksheet: [['commRentalLandlordName', 'Pat Owner'], ['commRentalTenantEmail', 'tess@example.test'], ['commRentalNotes', 'Referral fee to the tenant agent'], ['commRentalCommValue', '1']],
  },
];

const set = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement;
  if (!el) throw new Error(`no control ${id}`);
  el.value = value;
};
const text = (f: BootedForm, id: string) => (f.d.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
// an amount as the page prints it ("$60,000.00"); anything else ("$NaN") is an error, not a 0
const money = (f: BootedForm, id: string) => {
  const shown = text(f, id);
  if (!/^-?\$?-?[\d,]+(\.\d{2})?$/.test(shown)) throw new Error(`${id} does not show an amount: "${shown}"`);
  return Number(shown.replace(/[$,]/g, ''));
};
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('body > div[style*="99999"], div.toast-notification')].map((t) => t.textContent ?? '');     // the Sale page's toast and the Rental page's

describe.each(PAGES)('$form: the Commission tab', (p) => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm(p.form, { settle: 600 }); });
  afterAll(() => f.close());
  const tab = () => f.d.getElementById(p.tab) as HTMLElement;

  it('boots without a page error', () => {
    expect(f.errors).toEqual([]);
    expect(tab()).not.toBeNull();
  });

  describe('it does not claim to send anything', () => {
    it('is named a worksheet, in the sidebar and in its banner', () => {
      expect(text(f, p.sidebarTab)).toContain('Commission Worksheet');
      expect(text(f, p.sidebarTab)).not.toContain('Request');
      expect(text(f, p.tab)).toMatch(/(Deal Closed|Lease Signed) — Commission Worksheet/);
    });

    it('says the figures are saved with the listing and that no request is sent and the broker is not told', () => {
      const said = text(f, p.tab);
      expect(said).toContain('saved with the listing');
      expect(said).toContain('does not send a commission request');
      expect(said).toContain('the broker is not notified');
    });

    it('no longer promises a review, a payment run or a submission to the broker', () => {
      const said = text(f, p.tab);
      for (const promise of [/submit to (the )?broker/i, /submit commission request/i, /awaiting broker/i, /review and payment processing/i, /request submitted/i]) {
        expect([String(promise), promise.test(said)]).toEqual([String(promise), false]);
      }
    });

    it('does not tell the broker to expect the notes', () => {
      const notes = f.d.getElementById(`${p.comm}Notes`) as HTMLTextAreaElement;
      expect(notes.placeholder).not.toMatch(/broker/i);
      expect(notes.placeholder).toContain('referral fees, adjustments');
    });

    it('has no control that submits or sends', () => {
      const controls = [...tab().querySelectorAll('button, a, input[type="button"], input[type="submit"], [onclick]')];
      expect(controls.length).toBeGreaterThan(0);                                           // the Back button is there: the search is not looking at nothing
      for (const c of controls) {
        const label = `${c.textContent} ${c.getAttribute('onclick') ?? ''} ${c.getAttribute('title') ?? ''} ${c.getAttribute('type') ?? ''}`.toLowerCase();
        expect([label.replace(/\s+/g, ' ').trim(), /submit|send/.test(label)]).toEqual([label.replace(/\s+/g, ' ').trim(), false]);
      }
    });

    it('has no request tracker: nothing can be Submitted, Under Review, Approved or Paid', () => {
      expect(tab().querySelectorAll(`[id^="${p.comm}Step"]`)).toHaveLength(0);
      const said = text(f, p.tab);
      for (const word of ['Request Status', 'Under Review', 'Approved']) expect([word, said.includes(word)]).toEqual([word, false]);
    });

    it('defines no handler that reports a submission', () => {
      expect(typeof f.w[p.submit]).toBe('undefined');
    });

    it('says nothing about a submission whatever is pressed on a tab with every box filled in', async () => {
      for (const [id, value] of p.required) set(f, id, value);
      (f.d.querySelector(`input[name="${p.payMethod}"]`) as HTMLInputElement).checked = true;
      const alerts: string[] = [];
      f.w.alert = (message: unknown) => { alerts.push(String(message)); };                  // both pages turn alert() into a toast: what it is given is read here
      for (const c of tab().querySelectorAll('button, [onclick]')) (c as HTMLElement).click();
      await sleep(50);
      const said = [...alerts, ...toasts(f)].join(' | ');
      expect([said, /submitted|awaiting|sent to|broker review/i.test(said)]).toEqual([said, false]);
      expect(f.errors).toEqual([]);
    });
  });

  describe('the figures', () => {
    it.each(p.figures.map((c, i) => [i + 1, c] as const))('case %s adds up', (_n, c) => {
      set(f, p.price, p.priceValue);
      set(f, p.listingSidePct, '');
      for (const [id, value] of c.set) set(f, id, value);
      f.w[p.calculate]();
      expect([money(f, p.grossId), money(f, p.listingAmtId), money(f, p.coopAmtId), money(f, p.agentId), money(f, p.companyId)])
        .toEqual([c.gross, c.listing, c.coop, c.agent, c.company]);
      expect(Number((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value)).toBe(100 - Number(c.set.find(([id]) => id === p.listingSidePct)![1]));
    });

    it('never leaves the cooperating side less than nothing: a listing side typed over 100 leaves it at 0', () => {
      for (const [id, value] of p.baseInputs) set(f, id, value);
      set(f, p.listingSidePct, '120');
      f.w[p.calculate]();
      expect((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value).toBe('0');
      expect(money(f, p.coopAmtId)).toBe(0);
    });

    describe('a listing side the agent has not typed', () => {
      beforeEach(() => {
        for (const [id, value] of p.baseInputs) set(f, id, value);
        set(f, p.listingSidePct, '');
        f.w[p.calculate]();
      });

      it('is not turned into a cooperating side of 100%', () => {
        expect((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value).toBe('');
      });

      it('leaves the cooperating side, the listing side, the agent payout and the company share at nothing', () => {
        expect([money(f, p.listingAmtId), money(f, p.coopAmtId), money(f, p.agentId), money(f, p.companyId)]).toEqual([0, 0, 0, 0]);
        expect(money(f, p.grossId)).toBeGreaterThan(0);                                       // the gross is still worked out: only the sides are unknown
      });

      it('is not saved with the listing as a cooperating side of 100', () => {
        expect(f.w[p.collector]()[p.coopSidePct]).toBe('');
      });

      it('fills the cooperating side in once the listing side is typed, as the rest of 100', () => {
        set(f, p.listingSidePct, '35');
        f.w[p.calculate]();
        expect((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value).toBe('65');
      });

      it('stays a typed 0: the listing side gets nothing and the cooperating side all', () => {
        set(f, p.listingSidePct, '0');
        f.w[p.calculate]();
        expect((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value).toBe('100');
        expect([money(f, p.listingAmtId), money(f, p.agentId)]).toEqual([0, 0]);
        expect(money(f, p.coopAmtId)).toBe(money(f, p.grossId));
      });

      it('goes back to nothing when the box is emptied again', () => {
        set(f, p.listingSidePct, '35');
        f.w[p.calculate]();
        set(f, p.listingSidePct, '');
        f.w[p.calculate]();
        expect((f.d.getElementById(p.coopSidePct) as HTMLInputElement).value).toBe('');
        expect([money(f, p.listingAmtId), money(f, p.coopAmtId)]).toEqual([0, 0]);
      });
    });
  });

  describe('the worksheet and the listing', () => {
    it('is saved with the listing, as the banner says', () => {
      for (const [id, value] of p.worksheet) set(f, id, value);
      const payload = f.w[p.collector]();
      for (const [id, value] of p.worksheet) expect([id, payload[id]]).toEqual([id, value]);
    });

    it('comes back when the listing is opened again', async () => {
      const raw: Record<string, unknown> = { [p.status[0]]: p.status[1] };
      for (const [id, value] of p.worksheet) raw[id] = value;
      const g = await bootAddForm(p.form, { search: '?id=1', settle: 1500, listing: { id: 1, listing_id: 'X-1', status: p.status[1], raw_data: raw } });
      try {
        const restored = () => p.worksheet.every(([id, value]) => (g.d.getElementById(id) as HTMLInputElement).value === value);
        await until(restored, 40000).catch(() => undefined);                                  // a slow machine: wait for the restore, and let the assertions say what is missing if it never comes
        for (const [id, value] of p.worksheet) expect([id, (g.d.getElementById(id) as HTMLInputElement).value]).toEqual([id, value]);
        expect((g.d.getElementById(p.sidebarTab) as HTMLButtonElement).disabled).toBe(false);   // a closed listing: the tab is open
      } finally { await sleep(300); g.close(); }                                              // the page's own timers finish before its window goes
    });
  });
});
