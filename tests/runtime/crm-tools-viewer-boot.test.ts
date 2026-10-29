/// <reference types="jest" />
/**
 * The Sale and Rental Tools viewers (SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS), booted in jsdom with the REAL api-client and a routed
 * fetch (/api/auth/me, /api/crm/listings/:id), so the real onReady / init / listings.get semantics decide the order of events.
 *
 * What this pins (every one of these was broken on the PR head before the fix):
 *  - the page script parses and the boot raises no uncaught error;
 *  - identity is asked first, the listing second, and nothing renders (and nothing fails closed) before the answer;
 *  - a signed-out visitor is sent to the login page and never requests the listing;
 *  - a listing the CRM cannot return ends on the fail-closed screen, and a hostile listing id is written as text;
 *  - the server-validated role decides the masking; a ?role= hint cannot;
 *  - a value the record does not carry is blank / unknown, never an entry-form default (status Draft, city New York, ticked
 *    distribution boxes, a ComingSoon tile); a value of 0 is shown as 0;
 *  - the status badge and the photo urls cannot carry markup into the page.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootViewer, field, isFailScreen, NAVIGATION, rendered, sleep, until, type ViewerFile } from './tools-viewer-harness';

type Viewer = {
  file: ViewerFile;
  route: string;
  tileStatic: RegExp;
  headerFn: string;
  unknownStatusFn: string;
  getValueFn: string;
  coopOnly: string; // a section the field rules show only for co-op / condop listings
  writeSelectors: string;
  previewFacts: string[]; // preview elements that state a fact the record never gave unless it carries it: they read "--" for a record that says nothing
  ids: {
    status: string; price: string; beds: string; agent: string; desc: string; tile: string; dom: string; badge: string; city: string;
    defaultSelect: string; ynCheck: string; distTab: string; listingTabs: string[]; emailTo: string;
  };
};

const VIEWERS: Viewer[] = [
  {
    file: 'SALE-FORM-WITH-TOOLS',
    route: 'sale-view',
    tileStatic: /id="saleResoMlsStatus">--<\/p>/,
    headerFn: 'updateSaleHeaderForViewer',
    unknownStatusFn: 'getResoMlsStatus',
    getValueFn: 'getSaleFormValue',
    coopOnly: 'saleCoopCondopSection',
    writeSelectors: '[onclick*="addSaleCoListAgent"], [onclick*="useSaleExclusiveAgentContact"], [onclick*="addSaleOpenHouse"], [onclick*="saveSaleOpenHouse"], [onclick*="cancelSaleOpenHouse"]',
    previewFacts: ['salePreviewStatus', 'salePreviewSitePrice', 'salePreviewFloors', 'salePreviewSiteDetailDOM', 'salePreviewSiteAddress'],
    ids: {
      status: 'saleStatus', price: 'salePrice', beds: 'saleBedrooms', agent: 'saleListingAgentSearch', desc: 'saleDescription',
      tile: 'saleResoMlsStatus', dom: 'saleDaysOnMarket', badge: 'saleDraftBadge', city: 'saleBldgCity',
      defaultSelect: 'saleMaintCCFreq', ynCheck: 'saleInternetEntireListingDisplayYN', distTab: 'saleMainTab4',
      listingTabs: ['saleMainTab1', 'saleMainTab2', 'saleMainTab3', 'saleMainTab4'], emailTo: 'saleEmailTo',
    },
  },
  {
    file: 'RENTAL-FORM-WITH-TOOLS',
    route: 'rental-view',
    tileStatic: /id="rentalResoMlsStatus">--<\/p>/,
    headerFn: 'updateRentalHeaderForViewer',
    unknownStatusFn: 'getResoRentalMlsStatus',
    getValueFn: 'getRentalFormValue',
    coopOnly: 'rentalBoardApprovalField',
    writeSelectors: '[onclick*="addRentalCoListAgent"], [onclick*="addRentalOpenHouse"]',
    previewFacts: ['rentalPreviewStatus', 'rentalPreviewSitePrice', 'rentalPreviewCRMPrice', 'rentalPreviewListingType', 'rentalPreviewSiteDetailDOM', 'rentalPreviewSiteAddress'],
    ids: {
      status: 'rentalStatus', price: 'rentalMonthlyRent', beds: 'rentalBedrooms', agent: 'rentalListingAgentSearch', desc: 'rentalDescription',
      tile: 'rentalResoMlsStatus', dom: 'rentalDaysOnMarket', badge: 'rentalDraftBadge', city: 'rentalCity',
      defaultSelect: 'rentalFurnished', ynCheck: 'rentalInternetEntireListingDisplayYN', distTab: 'rentalMainTab4',
      listingTabs: ['rentalMainTab1', 'rentalMainTab2', 'rentalMainTab3', 'rentalMainTab4'], emailTo: 'rentalEmailTo',
    },
  },
];

const RICH = {
  id: '404', listing_id: 'SL-0404', status: 'ActiveUnderContract',
  address: { StreetNumber: '123', StreetName: 'Main St', UnitNumber: '4B' },
  city: 'Brooklyn', postal_code: '11201', borough: 'Brooklyn', neighborhood: 'DUMBO', property_type: 'Residential',
  list_price: '1250000', living_area: '900', bedrooms_total: 0, bathrooms_full: 1, bathrooms_half: 0,
  features: { PublicRemarks: 'Lovely home' },
  list_agent_full_name: 'Agent Example', list_office_name: 'Example Realty', agent_info: {},
  media: [{ url: 'https://example.test/p1.jpg' }],
  raw_data: { CommonInterest: 'Condominium', BuildingKeyNumeric: 555, DaysOnMarket: 12 },
};
const MINIMAL = { id: '9', listing_id: 'SL-0009', raw_data: {} };

describe.each(VIEWERS)('$file viewer', (v) => {
  it('asks identity first and the listing second, shows nothing before the answer, then renders exactly the record', async () => {
    const b = bootViewer(v.file, { listing: RICH, delay: 700 });
    try {
      // while the listing request is in flight: skeleton on, form still in the page, no error screen, nothing rendered
      await until(() => b.requests.length >= 2);
      await sleep(250);
      expect(b.requests).toEqual(['GET /api/auth/me', 'GET /api/crm/listings/SL-0404']);
      expect(isFailScreen(b.d)).toBe(false);
      expect(b.d.body.classList.contains('skeleton-loading')).toBe(true);
      expect(b.d.getElementById(v.ids.price)).not.toBeNull();

      await until(() => rendered(b.d));
      expect([...new Set(b.errors)]).toEqual([]);
      expect(isFailScreen(b.d)).toBe(false);
      expect(b.d.body.classList.contains('role-agent')).toBe(true);
      expect(field(b.d, v.ids.price)?.value).toBe('1250000');
      expect(field(b.d, v.ids.agent)?.value).toBe('Agent Example');
      expect(field(b.d, v.ids.desc)?.value).toBe('Lovely home');
      expect(field(b.d, v.ids.beds)?.value).toBe('0'); // 0 is a value
      // the tool modals are not part of the read-only conversion: the recipient of an emailed report must stay writable
      expect((field(b.d, v.ids.emailTo) as HTMLInputElement).readOnly).toBe(false);
      // a read-only viewer offers no control that adds or saves (the page still carries them from the Add form)
      const writers = [...b.d.querySelectorAll(v.writeSelectors)];
      expect(writers.length).toBeGreaterThan(0);
      expect(writers.filter((e) => !e.classList.contains('viewer-hidden'))).toEqual([]);
      // the stored status, verbatim, in both the control and the tile (nothing derived or defaulted)
      expect(field(b.d, v.ids.status)?.value).toBe('ActiveUnderContract');
      expect(b.d.getElementById(v.ids.tile)?.textContent).toBe('ActiveUnderContract');
      expect(b.d.getElementById(v.ids.dom)?.textContent).toBe('12');
      expect(b.w[v.unknownStatusFn]('NotAStatus')).toBe('--'); // an unknown status is never reported as Active
      // the record names a type (a condominium), so the page's field rules ran: the co-op-only section is hidden
      expect(b.d.getElementById(v.coopOnly)?.style.display).toBe('none');

      // the status badge writes text, never markup
      const hostile = '<img src=x onerror=window.__pwned=2>';
      b.w[v.headerFn]({ status: hostile });
      const badge = b.d.getElementById(v.ids.badge);
      expect(badge?.querySelectorAll('img').length).toBe(0);
      expect(badge?.textContent).toContain('<img');
      expect(b.w.__pwned).toBeUndefined();

      // flags: true / false / not carried
      const yn = b.d.getElementById(v.ids.ynCheck) as HTMLInputElement;
      b.w.viewerSetCheck(v.ids.ynCheck, true);
      expect([yn.checked, yn.indeterminate]).toEqual([true, false]);
      b.w.viewerSetCheck(v.ids.ynCheck, false);
      expect([yn.checked, yn.indeterminate]).toEqual([false, false]);
      b.w.viewerSetCheck(v.ids.ynCheck, undefined);
      expect([yn.checked, yn.indeterminate]).toEqual([false, true]);
      b.w.viewerSetVal(v.ids.price, 0);
      expect(field(b.d, v.ids.price)?.value).toBe('0');
      b.w.viewerSetVal(v.ids.price, null);
      expect(field(b.d, v.ids.price)?.value).toBe('');
      b.w.viewerSetVal(v.ids.price, '1250000');

      // the opener may name a different listing: a foreign origin is ignored, our own origin reloads the viewer on the new id
      const before = b.requests.length;
      b.w.dispatchEvent(new b.w.MessageEvent('message', { origin: 'https://evil.example', data: { type: 'loadListing', listingId: 'X-1' } }));
      await sleep(100);
      expect(b.errors).toEqual([]);
      b.w.dispatchEvent(new b.w.MessageEvent('message', { origin: 'https://mallan.nyc', data: { type: 'loadListing', listingId: 'X-1' } }));
      await sleep(100);
      expect(b.errors).toEqual([NAVIGATION]);
      expect(b.requests.length).toBe(before); // the new listing is not fetched into this page
      expect(field(b.d, v.ids.price)?.value).toBe('1250000');
    } finally {
      b.close();
    }
  }, 60000);

  it('shows nothing the record does not carry, and masks by the server role rather than a ?role= hint', async () => {
    const b = bootViewer(v.file, { listing: MINIMAL, role: 'buyer', search: '?id=SL-0404&role=broker' });
    try {
      await until(() => rendered(b.d));
      expect([...new Set(b.errors)]).toEqual([]);
      expect(b.d.body.classList.contains('role-buyer')).toBe(true);
      expect(b.d.body.classList.contains('role-broker')).toBe(false);

      expect((field(b.d, v.ids.status) as HTMLSelectElement).selectedIndex).toBe(-1); // not "Draft"
      expect((field(b.d, v.ids.defaultSelect) as HTMLSelectElement).selectedIndex).toBe(-1); // a default option is not a fact
      expect(field(b.d, v.ids.city)?.value).toBe(''); // not "New York"
      expect(field(b.d, v.ids.price)?.value).toBe('');
      expect(field(b.d, v.ids.beds)?.value).toBe('');
      expect(b.d.getElementById(v.ids.tile)?.textContent).toBe('--'); // not "ComingSoon" / "Draft"
      expect(b.d.getElementById(v.ids.dom)?.textContent).toBe('--'); // not "0"
      // the record names no type, so the page's field rules (which default to Condo / Rental Building) did not run: nothing is hidden for a type
      expect(b.d.getElementById(v.coopOnly)?.style.display).toBe('');
      for (const tab of v.ids.listingTabs) {
        const checked = [...b.d.querySelectorAll(`#${tab} input[type="radio"]:checked`)].map((e) => (e as HTMLInputElement).name);
        expect(checked).toEqual([]);
      }
      // distribution: every flag is unknown (a record that says nothing is not a record that says "No")
      const badges = [...b.d.querySelectorAll(`#${v.ids.distTab} .dist-gate-yes, #${v.ids.distTab} .dist-gate-no, #${v.ids.distTab} .dist-gate-unknown`)];
      expect(badges.length).toBeGreaterThan(5);
      expect(badges.filter((e) => e.className !== 'dist-gate-unknown')).toEqual([]);
      // and so is every other single-id checkbox (an attestation or a flag the record does not carry is not "unchecked")
      const singles = [...b.d.querySelectorAll(v.ids.listingTabs.map((t) => `#${t} input[type="checkbox"][id]`).join(', '))] as HTMLInputElement[];
      expect(singles.length).toBeGreaterThan(3);
      expect(singles.filter((c) => !c.indeterminate).map((c) => c.id)).toEqual([]);
      // a select with nothing selected reads as nothing, not as its option labels (print, email and the agent sheet read controls this way)
      expect(b.w[v.getValueFn](v.ids.defaultSelect)).toBe('');
      expect(b.w[v.getValueFn](v.ids.status)).toBe('');
      // the preview does not state a fact the record never gave
      await sleep(600);
      const stated = v.previewFacts.map((id) => `${id}=${b.d.getElementById(id)?.textContent}`);
      expect(stated).toEqual(v.previewFacts.map((id) => `${id}=--`));
    } finally {
      b.close();
    }
  }, 60000);

  it('does not render a payload that is not a listing, and does not reload for the id it already shows', async () => {
    const b = bootViewer(v.file, { listing: { error: 'Forbidden' } });
    try {
      await until(() => isFailScreen(b.d));
      expect(isFailScreen(b.d)).toBe(true);
    } finally {
      b.close();
    }
    // (an extra query parameter makes a reload visible: reloading on "?id=404" would drop it, and jsdom reports any navigation it is asked to make)
    const n = bootViewer(v.file, { listing: { ...MINIMAL, listing_id: '404' }, search: '?id=404&from=crm' });
    try {
      await until(() => rendered(n.d));
      n.w.dispatchEvent(new n.w.MessageEvent('message', { origin: 'https://mallan.nyc', data: { type: 'loadListing', listingId: 404 } }));
      await sleep(100);
      expect(n.errors).toEqual([]); // a numeric 404 is the id the page already shows: no navigation
    } finally {
      n.close();
    }
  }, 60000);

  it('loads the api client and then the viewer hydration module, in that order', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${v.file}.html`), 'utf8');
    const api = html.indexOf('<script src="js/core/api-client.js"></script>');
    const hydration = html.indexOf('<script src="js/forms/listing-hydration.js"></script>');
    expect(api).toBeGreaterThan(-1);
    expect(hydration).toBeGreaterThan(api);
    expect(html.indexOf('var VIEWER_LISTINGS')).toBeGreaterThan(hydration);
  });

  it('keeps no built-in status or days-on-market value in the page source, and starts hidden', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${v.file}.html`), 'utf8');
    expect(html).toMatch(v.tileStatic);
    expect(html).not.toMatch(/id="(?:sale|rental)DaysOnMarket">\d/);
    expect(html).not.toMatch(/id="(?:sale|rental)CumulativeDaysOnMarket">\d/);
    // the page is hidden from its first paint until the listing is in (an entry-form default is not a fact)
    expect(html).toMatch(/<body class="[^"]*\bskeleton-loading\b[^"]*"/);
    expect(html).toMatch(/body\.skeleton-loading \{ visibility: hidden; \}/);
  });

  it('is hidden from the first moment, and shows the page only once the listing is in', async () => {
    const b = bootViewer(v.file, { listing: MINIMAL, delay: 300 });
    try {
      expect(b.d.body.classList.contains('skeleton-loading')).toBe(true); // before any script has had a turn
      await until(() => rendered(b.d));
      expect(b.d.body.classList.contains('skeleton-loading')).toBe(false);
    } finally {
      b.close();
    }
  }, 30000);

  it('sends a signed-out visitor to the login page and never requests the listing', async () => {
    const b = bootViewer(v.file, { mode: 'anon' });
    try {
      await until(() => b.errors.length > 0, 4000);
      await sleep(200);
      expect(b.requests).toEqual(['GET /api/auth/me']);
      expect([...new Set(b.errors)]).toEqual([NAVIGATION]);
      expect(isFailScreen(b.d)).toBe(false);
    } finally {
      b.close();
    }
  }, 30000);

  it('ends on the fail-closed screen when the listing cannot be returned, and writes a hostile id as text', async () => {
    const hostile = '<img src=x onerror=window.__pwned=1>';
    const b = bootViewer(v.file, { mode: 'missing', search: `?id=${encodeURIComponent(hostile)}` });
    try {
      await until(() => isFailScreen(b.d));
      expect(isFailScreen(b.d)).toBe(true);
      expect(b.d.body.textContent).toContain(hostile);
      expect(b.d.body.querySelectorAll('img').length).toBe(0);
      expect(b.w.__pwned).toBeUndefined();
      expect([...new Set(b.errors)]).toEqual([]);
    } finally {
      b.close();
    }
  }, 30000);

  it('ends on the fail-closed screen when nothing answers within the time limit', async () => {
    const b = bootViewer(v.file, { mode: 'never', shrinkLongTimers: true });
    try {
      await until(() => isFailScreen(b.d), 5000);
      expect(isFailScreen(b.d)).toBe(true);
      expect(b.requests).toEqual(['GET /api/auth/me', 'GET /api/crm/listings/SL-0404']);
    } finally {
      b.close();
    }
  }, 30000);
});

describe('SALE-FORM-WITH-TOOLS photo urls for print and email', () => {
  it('returns only http(s) urls with quote and angle bracket escaped, and never throws', async () => {
    const b = bootViewer(VIEWERS[0].file, {
      listing: { ...RICH, media: [{ url: 'https://example.test/a"b.jpg' }, { url: 'javascript:alert(1)' }, { url: 'http://example.test/c<d.jpg' }, { url: '' }, {}] },
    });
    try {
      await until(() => rendered(b.d));
      expect(typeof b.w.getListingPhotoUrls).toBe('function');
      expect(b.w.getListingPhotoUrls('sale')).toEqual(['https://example.test/a%22b.jpg', 'http://example.test/c%3Cd.jpg']);
    } finally {
      b.close();
    }
  }, 60000);
});
