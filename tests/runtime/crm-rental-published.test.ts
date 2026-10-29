/// <reference types="jest" />
/**
 * The Listing URL box and the "Listing Published" panel of the Rental Add / Edit form, on the REAL page.
 *
 * The Listing URL box said "Auto-generated from address" and was never filled (the Sale form fills its own), and a listing that went Active showed an alert and nothing else (the Sale form shows a panel
 * with the public address and the RealPlus address, and a way to copy them). The page now shows the address the listing will have until the server gives the real one, and uses
 * js/forms/listing-published.js (tested apart in crm-listing-published.test.ts) for the panel. These tests pin the page's side of both.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, PAGE_MODULES, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
const set = (f: BootedForm, id: string, value: string) => { box(f, id).value = value; };
const pick = (f: BootedForm, id: string) => { const s = f.d.getElementById(id) as HTMLSelectElement; s.value = [...s.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value; };
const typed = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('input', { bubbles: true })); };
const blurred = (f: BootedForm, id: string, value: string) => { set(f, id, value); box(f, id).dispatchEvent(new f.w.Event('change', { bubbles: true })); };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const loaded = (f: BootedForm) => until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
const url = (f: BootedForm) => box(f, 'rentalListingUrl').value;
const panel = (f: BootedForm) => f.d.getElementById('rentalPublishUrlPanel');

function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest'); set(f, 'rentalMonthlyRent', '4200'); set(f, 'rentalDateListed', '2026-10-01'); set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01'); set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true; (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalZipCode', '10017'); pick(f, 'rentalBedrooms'); pick(f, 'rentalFullBathrooms');
}
async function submit(f: BootedForm, step?: string) {
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  if (step) { const list = f.d.getElementById('rentalStatus') as HTMLSelectElement; list.value = step; list.dispatchEvent(new f.w.Event('change', { bubbles: true })); }
  f.w.submitRentalListing();
  await until(() => alerts.length > 0, 10000);
  await sleep(100);
  return alerts;
}

describe(`${FORM}: the Listing URL box`, () => {
  it('loads the published module with the others, before the script of the page itself', () => {
    const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
    const tag = page.indexOf('<script src="js/forms/listing-published.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(page.indexOf('<script src="js/forms/listing-hydration.js"></script>'));
    expect(tag).toBeLessThan(page.indexOf('<script>', tag));
    expect(PAGE_MODULES).toContain('listing-published');
  });

  it('is empty until there is a street address (the city and the state alone are no address)', async () => {
    const f = await boot();
    try {
      expect(url(f)).toBe('');
      typed(f, 'rentalZipCode', '10017');
      expect(url(f)).toBe('');
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017');
      typed(f, 'rentalStreetAddress', '');
      expect(url(f)).toBe('');
    } finally { await closeAfter(f); }
  });

  it('has the unit, the city, the state and the ZIP code in it, the way the Sale form\'s does', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      typed(f, 'rentalUnitNumber', '5C');
      typed(f, 'rentalZipCode', '10017');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-apt-5c-new-york-ny-10017');
      blurred(f, 'rentalCityDisplay', 'Brooklyn');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-apt-5c-brooklyn-ny-10017');
      blurred(f, 'rentalState', 'NJ');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-apt-5c-brooklyn-nj-10017');
    } finally { await closeAfter(f); }
  });

  it('takes the unit typed after the street, and leaves the city and the zip typed there out (they are boxes of their own)', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalZipCode', '10017');
      typed(f, 'rentalStreetAddress', '333 E 46th St Apt 5C');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-apt-5c-new-york-ny-10017');
      typed(f, 'rentalStreetAddress', '333 E 46th St, Apt 5C, New York, NY 10017');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-apt-5c-new-york-ny-10017');
    } finally { await closeAfter(f); }
  });

  it('the unit box wins over a unit typed after the street', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalUnitNumber', '9Z');
      typed(f, 'rentalStreetAddress', '333 E 46th St Apt 5C');
      expect(url(f)).toContain('-apt-9z-');
      expect(url(f)).not.toContain('5c');
    } finally { await closeAfter(f); }
  });

  it('is made of letters, digits and single dashes, whatever is typed', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalStreetAddress', '  1 St. Mark\'s Pl. / "Rear"  ');
      expect(url(f)).toMatch(/^https:\/\/www\.mallan\.nyc\/listing\/[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(url(f)).toContain('1-st-mark-s-pl-rear-new-york-ny');
    } finally { await closeAfter(f); }
  });

  it('has the listing id, in lower case, once the listing is saved', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-12', status: 'Draft', address: { StreetNumber: '333', StreetName: 'E 46th', StreetSuffix: 'St', City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' }, raw_data: { rentalStreetAddress: '333 E 46th St' } } });
    try {
      await loaded(f);
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017/rl-12');
    } finally { await closeAfter(f); }
  });

  it('is the one the server gave, once it has answered with it', async () => {
    const f = await boot({ created: { publicUrl: 'https://www.mallan.nyc/listing/333-east-46th-street-5c-new-york-ny-10017/l-1' } });
    try {
      fillRequired(f);
      await submit(f);
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-east-46th-street-5c-new-york-ny-10017/l-1');
    } finally { await closeAfter(f); }
  });

  it('is the one the status route gave, when the listing was made Active', async () => {
    const f = await boot({ created: { publicUrl: 'https://www.mallan.nyc/listing/from-create/l-1' }, statusAnswer: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/from-status/l-1', realPlusUrl: 'https://www.mallan.nyc/listing/from-status/l-1' } });
    try {
      fillRequired(f);
      await submit(f, 'Active');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/from-status/l-1');
    } finally { await closeAfter(f); }
  });

  it('is worked out with the new listing id when the server gave none', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      typed(f, 'rentalStreetAddress', '333 E 46th St');                         // (the boxes above were filled with no event: this is the agent leaving the street box)
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017');
      await submit(f);
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017/l-1');
    } finally { await closeAfter(f); }
  });

  it('is what the Preview tab shows as the Listing URL', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      f.w.updateRentalPreview();
      expect(f.d.getElementById('rentalPreviewCRMURL')!.textContent).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny');
    } finally { await closeAfter(f); }
  });

  it('a page without the box does not fail', async () => {
    const f = await boot();
    try {
      f.d.getElementById('rentalListingUrl')!.remove();
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a page without the box still saves and says the listing was saved, whatever address the server gave', async () => {
    const f = await boot({ created: { publicUrl: 'https://www.mallan.nyc/listing/333-east-46th-street-5c-new-york-ny-10017/l-1' } });
    try {
      f.d.getElementById('rentalListingUrl')!.remove();
      fillRequired(f);
      const alerts = await submit(f);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatch(/^SUCCESS! Your rental listing has been submitted/);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a page without the unit box does not fail, and the address has no unit', async () => {
    const f = await boot();
    try {
      f.d.getElementById('rentalUnitNumber')!.remove();
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a page that could not load the lookup module takes the street as it was typed', async () => {
    const f = await boot({ modules: PAGE_MODULES.filter((m) => m !== 'building-lookup') });
    try {
      typed(f, 'rentalZipCode', '10017');
      typed(f, 'rentalStreetAddress', '333 E 46th St');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny-10017');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('has no dash at its start, whatever mark is typed there', async () => {
    const f = await boot();
    try {
      typed(f, 'rentalStreetAddress', '#333 E 46th St');
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-new-york-ny');
    } finally { await closeAfter(f); }
  });

  it('is made from the street alone when the city, the state and the ZIP code are empty, with no dash at its end', async () => {
    const f = await boot();
    try {
      set(f, 'rentalStreetAddress', '333 E 46th St.'); set(f, 'rentalCity', ''); set(f, 'rentalStateOrProvince', ''); set(f, 'rentalZipCode', '');
      f.w.generateRentalListingUrl();
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st');
    } finally { await closeAfter(f); }
  });

  it('is made from the boxes that are saved: the card above them is another view of the same three', async () => {
    const f = await boot();
    try {
      set(f, 'rentalStreetAddress', '333 E 46th St'); set(f, 'rentalCity', 'Queens'); set(f, 'rentalStateOrProvince', 'NJ'); set(f, 'rentalZipCode', '10017');
      set(f, 'rentalCityDisplay', 'Bronx'); set(f, 'rentalState', 'CT'); set(f, 'rentalZip', '99999');            // (no event: the card and the boxes are told apart)
      f.w.generateRentalListingUrl();
      expect(url(f)).toBe('https://www.mallan.nyc/listing/333-e-46th-st-queens-nj-10017');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the "Listing Published" panel`, () => {
  // (the server gives the same address for both today; the two differ here so that each is seen going to its own box)
  const URLS = { publicUrl: 'https://www.mallan.nyc/listing/333-e-46th-st/l-1', realPlusUrl: 'https://www.mallan.nyc/listing/333-e-46th-st/l-1?source=realplus' };

  it('is shown when the listing went Active and the server gave its addresses, with the listing id and both addresses', async () => {
    const f = await boot({ statusAnswer: { status: 'Active', ...URLS } });
    try {
      fillRequired(f);
      const alerts = await submit(f, 'Active');
      expect(alerts[0]).toMatch(/^SUCCESS! Your rental listing has been submitted/);
      expect(panel(f)).not.toBeNull();
      expect(panel(f)!.textContent).toContain('Listing Published');
      expect(panel(f)!.querySelector('strong')!.textContent).toBe('L-1');
      expect(box(f, 'rentalPublicUrlInput').value).toBe(URLS.publicUrl);
      expect(box(f, 'rentalRealPlusUrlInput').value).toBe(URLS.realPlusUrl);
      expect((panel(f)!.querySelector('a') as HTMLAnchorElement).getAttribute('href')).toBe(URLS.publicUrl);
    } finally { await closeAfter(f); }
  });

  it('hands the module the listing, each of the two addresses, the page\'s own toast and the way to the dashboard', async () => {
    const f = await boot({ statusAnswer: { status: 'Active', ...URLS } });
    try {
      const calls: any[] = [];
      const real = f.w.MallanListingPublished.show;
      f.w.MallanListingPublished.show = (options: any) => { calls.push(options); return real(options); };
      fillRequired(f);
      await submit(f, 'Active');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ prefix: 'rental', listingId: 'L-1', publicUrl: URLS.publicUrl, realPlusUrl: URLS.realPlusUrl, dashboardUrl: '/crm/dashboard#/ops/listings' });
      expect(calls[0].toast).toBe(f.w.eval('showToast'));
    } finally { await closeAfter(f); }
  });

  it('takes the addresses from the answer to the save when the status route gave none', async () => {
    const f = await boot({ created: { status: 'Active', ...URLS } });
    try {
      fillRequired(f);
      await submit(f, 'Active');
      expect(panel(f)).not.toBeNull();
      expect(box(f, 'rentalRealPlusUrlInput').value).toBe(URLS.realPlusUrl);
    } finally { await closeAfter(f); }
  });

  it('is shown for a saved listing that is made Active', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: {} }, statusAnswer: { status: 'Active', ...URLS } });
    try {
      await loaded(f);
      fillRequired(f);
      await submit(f, 'Active');
      expect(panel(f)).not.toBeNull();
      expect(panel(f)!.querySelector('strong')!.textContent).toBe('RL-1');
    } finally { await closeAfter(f); }
  });

  it('is not shown for a listing that stays a Draft, whatever addresses the server gave', async () => {
    const f = await boot({ created: { ...URLS } });
    try {
      fillRequired(f);
      await submit(f);
      expect(panel(f)).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('is not shown when the server refused the change to Active', async () => {
    const f = await boot({ statusError: 'Invalid status transition', created: { ...URLS } });
    try {
      fillRequired(f);
      await submit(f, 'Active');
      expect(panel(f)).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('is not shown for Active when the server gave no RealPlus address', async () => {
    const f = await boot({ statusAnswer: { status: 'Active', publicUrl: URLS.publicUrl } });
    try {
      fillRequired(f);
      await submit(f, 'Active');
      expect(panel(f)).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('is not shown for a listing that went to another status that has addresses (Pending)', async () => {
    const f = await boot({ statusAnswer: { status: 'Pending', ...URLS } });
    try {
      fillRequired(f);
      await submit(f, 'LeaseSigned');
      expect(panel(f)).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('a page that could not load the module still saves and says the listing was saved', async () => {
    const f = await boot({ statusAnswer: { status: 'Active', ...URLS }, modules: PAGE_MODULES.filter((m) => m !== 'listing-published') });
    try {
      fillRequired(f);
      const alerts = await submit(f, 'Active');
      expect(alerts).toHaveLength(1);                                           // (no "Submission failed" after the success)
      expect(alerts[0]).toMatch(/^SUCCESS!/);
      expect(panel(f)).toBeNull();
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
