/// <reference types="jest" />
/**
 * Text of the Tools viewers (SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS) that is not true of a viewer, or not true at all, on the REAL pages.
 *
 * Found by an adversarial read of the viewers:
 *  - the Rental client report (print and e-mail) said "Broker Fee: Tenant Pays" whenever the Concessions "Owner Pays" box was not ticked, whatever the FARE Act answer said (and "Owner Pays" when it was
 *    ticked): a client-bound statement of who pays the broker fee that the record did not make. The line is left out; the FARE Act wording is the owner's to approve;
 *  - the Rental viewer said "Open house information will be syndicated to REBNY RLS and partner sites." (nothing in the system sends open houses there) and showed a Print Sign-In Sheet button that
 *    prints today's date as the event date (the Sale viewer hides its own);
 *  - the Sale viewer had a "Save Feature / Changes / Sort Order" button with no handler;
 *  - both kept Add-form instructions and rules that mean nothing in a viewer.
 */
import { bootViewer, rendered, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const SECTIONS = ['agentInfo', 'classification', 'address', 'pricing', 'rooms', 'features', 'utilities', 'building', 'amenities', 'policies', 'distribution', 'description', 'photos'];

async function open(viewer: ViewerFile, lid: string, raw: Record<string, unknown> = {}): Promise<Booted> {
  const b = bootViewer(viewer, { search: `?id=${lid}`, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: raw } });
  await until(() => rendered(b.d), 15000);
  await sleep(300);
  return b;
}

// The smallest elements whose text holds the sentence, and whether every one of them is hidden
function hits(d: Document, sentence: string) {
  return [...d.querySelectorAll('p, span, div, h4, button')].filter((el) => text(el).includes(sentence) && ![...el.children].some((c) => text(c).includes(sentence)));
}

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'SL-0404'],
  ['RENTAL-FORM-WITH-TOOLS', 'RL-0404'],
] as const)('%s', (viewer, lid) => {
  let b: Booted;
  beforeAll(async () => { b = await open(viewer as ViewerFile, lid); });
  afterAll(() => { b.close(); });

  it.each([
    'Agent and company information is pulled from the REBNY RLS database',
    'Complete building details for REBNY RLS compliance',
    'Building data from Trestle/REBNY RLS will auto-populate if available',
    'Do NOT upload owner/tenant ID scans',
  ])('does not show the Add-form line "%s"', (sentence) => {
    const found = hits(b.d, sentence);
    expect(found.length).toBeGreaterThan(0);                                          // (it is still in the page, hidden: the Add form's pages are the viewer's)
    expect(found.every((el) => !!el.closest('.viewer-hidden'))).toBe(true);
  });

  it('does not tell the Videos heading what addresses it takes: nothing is typed in a viewer', () => {
    expect(text(b.d.getElementById(viewer.startsWith('SALE') ? 'saleMediaModal' : 'rentalMediaModal'))).not.toContain('YouTube or Vimeo URLs only');
  });
});

describe('SALE-FORM-WITH-TOOLS: a button that does nothing', () => {
  it('has no "Save Feature / Changes / Sort Order" button (it had no handler, and a viewer saves nothing)', async () => {
    const b = await open('SALE-FORM-WITH-TOOLS', 'SL-0404');
    try {
      expect([...b.d.querySelectorAll('button')].filter((x) => /Save Feature/.test(text(x)))).toHaveLength(0);
    } finally { b.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS', () => {
  it('does not say open houses are syndicated to REBNY RLS and partner sites', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', 'RL-0404');
    try {
      expect(text(b.d.body)).not.toContain('syndicated to REBNY RLS');
      expect(b.d.getElementById('rentalOpenHouseList')).not.toBeNull();             // (the section itself is still there)
    } finally { b.close(); }
  });

  it('hides the Print Sign-In Sheet button, as the Sale viewer does (it prints today\'s date as the date of the event)', async () => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', 'RL-0404');
    try {
      const buttons = [...b.d.querySelectorAll('[onclick*="printOpenHouseSignIn"]')];
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every((x) => x.classList.contains('viewer-hidden'))).toBe(true);
    } finally { b.close(); }
  });

  // the stored shape of a rental whose FARE answer says the landlord pays and whose concession box was never ticked (the Add form saves an unticked box as false)
  it.each([
    ['the landlord pays and the concession box is unticked', { rentalFareActLandlordPays: 'yes', rentalCommissionPaidBy: 'OwnerPays', rentalOwnerPays: false, OwnerPays: [] }],
    ['the tenant pays and the concession box is ticked', { rentalFareActLandlordPays: 'no', rentalOwnerPays: true, OwnerPays: ['Yes'] }],
    ['nothing was answered', {}],
  ])('the client report says nothing about who pays the broker fee: %s', async (_name, raw) => {
    const b = await open('RENTAL-FORM-WITH-TOOLS', 'RL-0404', { rentalMonthlyRent: '3200', ...raw });
    try {
      const data = b.w.collectRentalPrintData();
      expect(data).not.toHaveProperty('brokerFee');
      for (const preset of ['client', 'full']) {
        for (const given of [data, { ...data, brokerFee: 'Tenant Pays' }]) {        // (the report has no such line even when it is handed an answer to print)
          const html: string = b.w.buildRentalPrintHTML(given, SECTIONS, { branding: true, landscape: false, preset });
          const body = new b.w.DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
          expect(body).not.toMatch(/Broker Fee|Tenant Pays|Owner Pays/);
          expect(body).toContain('Monthly Rent');                                   // (the Pricing section itself is still there)
        }
      }
    } finally { b.close(); }
  });
});
