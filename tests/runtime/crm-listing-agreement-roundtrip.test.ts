/// <reference types="jest" />
/**
 * Real-DOM round trip for ListingAgreement on the Sale and Rental Redesign forms: pick Co-Exclusive, collect the payload
 * the Save button sends, reload from that payload, edit, save again. Also proves a listing stored by the old form with the
 * non-live value "CoExclusive" reloads as Co-Exclusive and re-saves the live value CoExclusiveAgency.
 *
 * Runs the real pages in jsdom with a stubbed MallanAPI (same technique as crm-forms-boot-smoke.test.ts).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function boot(form: string): Promise<{ window: any; errors: string[] }> {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => {
    errors.push(String(e.detail?.message ?? e.message));
  });
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${form}.html`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(window: any) {
      window.tailwind = { config: {} };
      window.alert = () => undefined;
      window.confirm = () => true;
      window.scrollTo = () => undefined;
      window.print = () => undefined;
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      // the Rental edit load puts a stored listing back through js/forms/listing-hydration.js, which the page loads with a <script src>; jsdom does not fetch it
      window.eval(readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'));
      const context = { authenticated: true, role: 'agent', portalRole: 'agent' };
      window.MallanAPI = {
        onReady: (cb: () => void) => setTimeout(cb, 5),
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: true, user: { id: 'AG-9', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } }),
        listings: { get: async () => ({}), update: async () => ({}), updateStatus: async () => ({}) },
        idx: { search: async () => ({ results: [] }) },
      };
    },
  });
  await sleep(900);
  return { window: dom.window, errors };
}

describe.each([
  ['SALE-FORM-REDESIGN', 'saleListingType', 'collectSaleFormData', '_populateSaleFormFromApi'],
  ['RENTAL-FORM-REDESIGN', 'rentalListingType', 'collectRentalFormData', '_populateRentalFormFromApi'],
] as const)('%s ListingAgreement round trip (real DOM)', (form, radioName, collectFn, populateFn) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const select = (w: any, value: string) => {
    const radio = w.document.querySelector(`input[name="${radioName}"][value="${value}"]`);
    expect(radio).not.toBeNull();
    radio.checked = true;
    radio.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkedValue = (w: any): string | null => {
    const r = w.document.querySelector(`input[name="${radioName}"]:checked`);
    return r ? r.value : null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listing = (raw: Record<string, unknown>): any => ({ listing_id: 'X-1', status: 'Active', raw_data: raw, address: {}, features: {}, media: [], agent_info: {} });

  it('create -> save -> reload -> edit -> save keeps the live value CoExclusiveAgency', async () => {
    const { window: w, errors } = await boot(form);
    try {
      expect(errors).toEqual([]);
      select(w, 'CoExclusiveAgency');
      const saved = w[collectFn]();
      expect(saved.ListingAgreement).toBe('CoExclusiveAgency');

      w[populateFn](listing(JSON.parse(JSON.stringify(saved))));
      expect(checkedValue(w)).toBe('CoExclusiveAgency');

      select(w, 'ExclusiveAgency');
      expect(w[collectFn]().ListingAgreement).toBe('ExclusiveAgency');
      select(w, 'CoExclusiveAgency');
      expect(w[collectFn]().ListingAgreement).toBe('CoExclusiveAgency');
    } finally {
      await sleep(500);
      w.close();
    }
  }, 60000);

  it('a listing stored with the legacy non-live value reloads as Co-Exclusive and re-saves the live value', async () => {
    const { window: w } = await boot(form);
    try {
      w[populateFn](listing({ ListingAgreement: 'CoExclusive', [radioName]: 'CoExclusive' }));
      expect(checkedValue(w)).toBe('CoExclusiveAgency');
      expect(w[collectFn]().ListingAgreement).toBe('CoExclusiveAgency');
    } finally {
      await sleep(500);
      w.close();
    }
  }, 60000);
});
