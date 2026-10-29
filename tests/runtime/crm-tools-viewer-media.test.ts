/// <reference types="jest" />
/**
 * The photos and floor plans of the Tools viewers (SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS), on the REAL pages.
 *
 * The listing record carries only the legacy copy of its media list (an upload never writes it, and a delete leaves it): the photos an agent uploaded are media rows
 * (GET /api/crm/listings/:id/media, which answers a read-only preview of the legacy list itself for a listing that has no rows). The viewers counted and printed the legacy list ("No photos
 * available for this listing" in the printed and e-mailed report of a listing with photos), and their Media window was the Add form's upload manager: "0 / 100 uploaded", a drop zone that opens a
 * file box that does nothing, the upload requirements. The viewers now read the media route and nothing else (not the record's own list, which can hold photos that were deleted), the Media window
 * shows the photos as pictures and the floor plans as links (there is nothing to upload in a viewer), and the Preview, the print and the e-mails count and use the same photos. While the answer is
 * out they say the photos are loading, and when it cannot be had they say the photos could not be loaded: a report that said "No photos available" would say something nobody knows. A row is a photo
 * or a floor plan as the server reads it (classifyMediaItem), not as its type alone says.
 */
import { classifyMediaItem } from '@/lib/media/listing-media-resolver';
import { bootViewer, rendered, renderedBody, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'sale', 'Sale', 'SL-0404'],
  ['RENTAL-FORM-WITH-TOOLS', 'rental', 'Rental', 'RL-0404'],
] as const)('%s: media', (viewer, prefix, Prefix, lid) => {
  const row = (over: Record<string, unknown> = {}) => ({
    media_key: 'k', url: 'https://cdn.example/k-card.webp', heroUrl: 'https://cdn.example/k-hero.webp', media_type: 'Photo', media_category: null, order: 0, preferred_photo_yn: false, source: 'mallan-crm', editable: true, ...over,
  });
  const TRESTLE_DOCUMENT = 'https://trestle.example/Media/Property/DOCUMENT-Jpeg/9/plan.jpg';
  const MEDIA = [
    row({ media_key: 'p1', heroUrl: 'https://cdn.example/p1.webp', order: 0 }),
    row({ media_key: 'p2', heroUrl: 'https://cdn.example/p2.webp', order: 1, preferred_photo_yn: true }),            // the main photo: first
    row({ media_key: 'p3', heroUrl: '', url: 'https://cdn.example/p3-card.webp', order: 2 }),                         // no full-size address: the card one
    row({ media_key: 'p1-again', heroUrl: 'https://cdn.example/p1.webp', order: 3 }),                                  // the same address again: once
    row({ media_key: 'f1', media_type: 'FloorPlan', heroUrl: 'https://cdn.example/plan.pdf', order: 4 }),
    row({ media_key: 'f2', media_type: 'FloorPlan', heroUrl: 'http://cdn.example/plan2.jpg', order: 5 }),             // a plain http address is a web address too
    row({ media_key: 'f3', media_type: 'FloorPlan', heroUrl: 'javascript:alert(1)', url: 'javascript:alert(1)', order: 6 }),     // a floor plan that is not a web address is no link
    row({ media_key: 'm1', media_type: 'Photo', heroUrl: TRESTLE_DOCUMENT, order: 7 }),                                // typed Photo, but a Trestle document: a floor plan, as the server reads it
    row({ media_key: 'v1', media_type: 'Video', heroUrl: 'https://youtu.be/x', order: 8 }),                           // neither a photo nor a plan
    row({ media_key: 't1', media_type: 'VirtualTour', media_category: 'VirtualTour', heroUrl: 'https://tour.example/t', order: 9 }),
    row({ media_key: 'x1', heroUrl: 'javascript:alert(1)', url: 'javascript:alert(1)', order: 10 }),                  // not a web address
    null, 'junk', 42,                                                                                                   // entries that are not rows at all: skipped, the rest is read
  ];
  const PHOTOS = ['https://cdn.example/p2.webp', 'https://cdn.example/p1.webp', 'https://cdn.example/p3-card.webp'];
  const PLANS = ['https://cdn.example/plan.pdf', 'http://cdn.example/plan2.jpg', TRESTLE_DOCUMENT];

  async function open(extra: Record<string, unknown> = {}, raw: Record<string, unknown> = {}, record: Record<string, unknown> = {}): Promise<Booted> {
    const b = bootViewer(viewer as ViewerFile, { search: `?id=${lid}`, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: raw, ...record }, ...extra });
    await until(() => (extra.mediaGate ? renderedBody(b.d) : rendered(b.d)), 15000);          // (rendered waits for the photos; with a gate, the test says when the answer comes)
    await sleep(50);
    return b;
  }
  const gate = () => { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; };
  const el = (b: Booted, suffix: string) => b.d.getElementById(`${prefix}${suffix}`);
  const modal = (b: Booted) => el(b, 'MediaModal') as HTMLElement;
  const pictures = (b: Booted) => [...b.d.querySelectorAll(`#${prefix}PhotoPreview img`)] as HTMLImageElement[];
  const data = (b: Booted) => b.w[`collect${Prefix}PrintData`]();
  const printOf = (b: Booted): string => b.w[`build${Prefix}PrintHTML`](data(b), ['photos'], { branding: false, landscape: false, preset: 'custom' });
  const cardOf = (b: Booted): string => b.w[`build${Prefix}EmailCardHTML`](data(b));
  // the e-mail that is copied to the clipboard is built apart from the card
  async function inlineOf(b: Booted): Promise<string> {
    const parts: string[] = [];
    b.w.Blob = class { constructor(p: unknown[]) { parts.push(String(p[0])); } };
    b.w.URL.createObjectURL = () => 'blob:captured';
    b.w.URL.revokeObjectURL = () => undefined;
    b.w.open = () => null;
    Object.defineProperty(b.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
    b.w.ClipboardItem = class { constructor(public items: unknown) {} };
    b.w[`copy${Prefix}EmailToClipboard`]();
    await sleep(50);
    return parts.find((p) => p.includes('<')) ?? '';
  }

  describe('an agent opens a listing whose media rows are there', () => {
    let main: Booted;
    beforeAll(async () => { main = await open({ media: MEDIA }); });
    afterAll(() => { main.close(); });

    it('asks the media route for the listing, once, with the session', () => {
      expect(main.requests.filter((r) => /\/media/.test(r))).toEqual([`GET /api/crm/listings/${lid}/media`]);       // (the route refuses a request that has no session cookie, and the photos are here)
    });

    it('counts the photos of the media rows (the main photo first, the card address when there is no full-size one, one address once, a web address only, a document that is typed as a photo not at all), in the Preview, the window and the builders', () => {
      expect(main.w.getListingPhotoUrls(prefix)).toEqual(PHOTOS);
      expect(text(el(main, 'PreviewPhotos'))).toBe('3 photos');
      expect(text(el(main, 'PhotoCount'))).toBe('3 photos');
      expect(main.w.viewerMediaState()).toBe('loaded');
      expect(main.w.getListingPhotoNote('No photos available')).toBe('No photos available');           // loaded: the words for "none" are the ones to use
    });

    it('shows the photos in the Media window as pictures, and the floor plans as links', () => {
      const b = main;
      expect(pictures(b).map((i) => i.getAttribute('src'))).toEqual(PHOTOS);
      expect(pictures(b).map((i) => i.alt)).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
      expect(pictures(b).map((i) => i.loading)).toEqual(['lazy', 'lazy', 'lazy']);          // (a listing can have a hundred photos: they load as they are scrolled to)
      expect(text(el(b, 'PhotoPreview'))).toBe('');                                          // pictures only: no "No photos." beside them
      expect(text(modal(b))).toContain('The first photo is the listing\'s main photo.');
      const links = [...b.d.querySelectorAll(`#${prefix}FloorPlanList a`)] as HTMLAnchorElement[];
      expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual(PLANS.map((url, i) => [url, `Floor plan ${i + 1}`]));
      expect(text(el(b, 'FloorPlanList'))).toBe('Floor plan 1Floor plan 2Floor plan 3');
      expect(links.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true);
      expect([...b.d.querySelectorAll(`#${prefix}PhotoPreview a`)].every((a) => (a as HTMLAnchorElement).target === '_blank' && (a as HTMLAnchorElement).rel === 'noopener noreferrer')).toBe(true);
      expect(b.d.body.innerHTML).not.toContain('javascript:alert');                          // a row that is not a web address is not in the page
      expect(b.errors).toEqual([]);
    });

    it('prints and e-mails the same photos', async () => {
      const printed = new main.w.DOMParser().parseFromString(printOf(main), 'text/html');
      expect([...printed.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(PHOTOS);
      expect(printed.body.textContent).not.toContain('No photos');
      const card = new main.w.DOMParser().parseFromString(cardOf(main), 'text/html');
      expect(card.querySelector('img')!.getAttribute('src')).toBe(PHOTOS[0]);
      const inline = new main.w.DOMParser().parseFromString(await inlineOf(main), 'text/html');
      expect(inline.querySelector('img')!.getAttribute('src')).toBe(PHOTOS[0]);
    });

    it('has nothing to upload in the Media window: no drop zone, no file box but the documents one (switched off), no upload requirements, one Close button', () => {
      const m = modal(main);
      expect([...m.querySelectorAll('input[type="file"]')].map((i) => i.id)).toEqual([`${prefix}DocInput`]);
      expect(m.querySelector('[id$="PhotoInput"], [id$="FloorplanInput"]')).toBeNull();
      for (const gone of ['Drag and drop', 'Upload Floor Plan', 'Photo Requirements', 'uploaded', 'Drag to reorder', 'Upload photos']) expect(m.textContent).not.toContain(gone);
      expect([...m.querySelectorAll('button')].map((x) => text(x)).filter((t) => t !== '')).toEqual(['Close']);
      expect(text(m.querySelector('h3 + p'))).toBe('The listing\'s photos, floor plans, videos and tours');
    });

    it('opens and closes the Media window with the page\'s own buttons', () => {
      expect(modal(main).classList.contains('hidden')).toBe(true);
      main.w[`show${Prefix}MediaDocs`]();
      expect(modal(main).classList.contains('hidden')).toBe(false);
      (modal(main).querySelector('button') as HTMLElement).click();
      expect(modal(main).classList.contains('hidden')).toBe(true);
    });

    it.each([
      ['a photo', { media_type: 'Photo', media_category: 'Photo', heroUrl: 'https://x.example/a.jpg' }, 'photo'],
      ['a row with no category or type at all is a photo (Trestle\'s default)', { media_type: '', media_category: null, heroUrl: 'https://x.example/a.jpg' }, 'photo'],
      ['a floor plan by its category', { media_type: 'Photo', media_category: 'FloorPlan', heroUrl: 'https://x.example/a.jpg' }, 'floorplan'],
      ['a floor plan by its type when it has no category', { media_type: 'FloorPlan', media_category: null, heroUrl: 'https://x.example/a.jpg' }, 'floorplan'],
      ['a PDF is a floor plan', { media_type: 'Photo', media_category: 'Photo', heroUrl: 'https://x.example/plan.pdf?v=2' }, 'floorplan'],
      ['a row with no full-size address is read by its card address', { media_type: 'Photo', media_category: 'Photo', heroUrl: '', url: 'https://x.example/plan.pdf' }, 'floorplan'],
      ['a row whose full-size address is a photo and whose card address is not one is a photo (the full-size address is the one read)', { media_type: 'Photo', media_category: 'Photo', heroUrl: 'https://x.example/a.jpg', url: 'https://x.example/plan.pdf' }, 'photo'],
      ['a Trestle document is a floor plan', { media_type: 'Photo', media_category: null, heroUrl: TRESTLE_DOCUMENT }, 'floorplan'],
      ['an address with "floor plan" in it is a floor plan', { media_type: 'Photo', media_category: 'Photo', heroUrl: 'https://x.example/floor-plan-3.jpg' }, 'floorplan'],
      ['a site plan is a floor plan', { media_type: 'Photo', media_category: 'Photo', heroUrl: 'https://x.example/site-plan/1.jpg' }, 'floorplan'],
      ['a video', { media_type: 'Video', media_category: 'Video', heroUrl: 'https://x.example/clip.mp4' }, 'video'],
      ['a virtual tour', { media_type: 'VirtualTour', media_category: 'VirtualTour', heroUrl: 'https://x.example/t' }, 'virtualTour'],
      ['a category nobody knows is no photo', { media_type: 'Photo', media_category: 'Document', heroUrl: 'https://x.example/a.jpg' }, 'unknown'],
    ] as const)('reads a row as the server does: %s', (_name, fields, expected) => {
      expect(main.w.viewerMediaClass({ url: fields.heroUrl, ...fields })).toBe(expected);
    });

    it('reads every kind of category and address as the server\'s classifyMediaItem does (the same answer for each of them)', () => {
      const types = ['Photo', 'FloorPlan', 'Video'];
      const categories = [null, '', 'Photo', 'photo', 'Image', 'FloorPlan', 'Floor Plan', 'floor_plan', 'Floor_Plan', 'Video', 'VirtualTour', 'Virtual Tour', 'UnbrandedVirtualTour', 'Document', 'Addendum', 'Other'];
      const urls = ['', 'https://x.example/a.jpg', 'https://x.example/floorplan.jpg', 'https://x.example/floor-plan-1.jpg', 'https://x.example/floor_plan.png', 'https://x.example/floor%20plan.png',
        'https://x.example/plan.pdf', 'https://x.example/plan.PDF?x=1', 'https://x.example/Media/Property/DOCUMENT-Jpeg/1.jpg', 'https://x.example/Media/Property/DOCUMENT-Pdf/1',
        'https://x.example/Media/Property/PHOTO-Jpeg/1.jpg', 'https://x.example/site-plan/1.jpg', 'https://x.example/diagram.png', 'https://x.example/clip.mp4', 'https://x.example/tour.MOV',
        'https://x.example/floorplans/1.jpg', 'https://x.example/not-a-plan.jpg'];
      const different: string[] = [];
      let compared = 0;
      for (const type of types) for (const category of categories) for (const url of urls) {
        const ours = main.w.viewerMediaClass({ media_type: type, media_category: category, heroUrl: url, url });
        const server = classifyMediaItem({ MediaCategory: category ?? type, MediaURL: url });         // (the resolver reads a table row's category, else its type, and the full-size address)
        if (ours !== server) different.push(`${type} / ${category} / ${url}: ${ours} but the server says ${server}`);
        compared++;
      }
      expect(different).toEqual([]);
      expect(compared).toBe(types.length * categories.length * urls.length);
    });
  });

  it('says the photos are loading until the media route has answered (the window, the Preview, the print and the e-mails), and shows them when it has', async () => {
    const { promise, release } = gate();
    const b = await open({ media: MEDIA, mediaGate: promise }, {}, { media: [{ url: 'https://cdn.example/legacy.webp' }] });       // (the record's own list holds a photo: it is not the answer)
    try {
      expect(b.w.viewerMediaState()).toBe('loading');
      b.w[`update${Prefix}Preview`]();                                                        // (the Preview is drawn when the page draws it: now)
      b.w.viewerShowMedia(prefix);                                                            // and so is the Media window
      expect(text(el(b, 'PhotoCount'))).toBe('Loading...');
      expect(text(el(b, 'PhotoPreview'))).toBe('Loading photos...');
      expect(text(el(b, 'FloorPlanList'))).toBe('Loading floor plans...');
      expect(text(el(b, 'PreviewPhotos'))).toBe('Loading...');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      for (const html of [printOf(b), cardOf(b), await inlineOf(b)]) {
        expect(new b.w.DOMParser().parseFromString(html, 'text/html').body.textContent).toContain('Photos are still loading.');
        expect(html).not.toContain('No photos available');
        expect(html).not.toContain('legacy.webp');
      }
      release();                                                                              // the answer comes: the Preview is drawn again
      await until(() => text(el(b, 'PreviewPhotos')) === '3 photos', 8000);
      expect(text(el(b, 'PhotoCount'))).toBe('3 photos');
      expect(pictures(b).map((i) => i.getAttribute('src'))).toEqual(PHOTOS);
      expect(text(el(b, 'FloorPlanList'))).toBe('Floor plan 1Floor plan 2Floor plan 3');
      expect(printOf(b)).not.toContain('Photos are still loading.');
    } finally { release(); b.close(); }
  });

  it('draws the e-mail window again when the photos arrive after it was opened, and leaves a window that was closed alone', async () => {
    const { promise, release } = gate();
    const b = await open({ media: MEDIA, mediaGate: promise });
    try {
      b.w[`open${Prefix}EmailModal`]();
      const preview = b.d.getElementById(`${prefix}EmailCardPreview`) as HTMLElement;
      expect(text(preview)).toContain('Photos are still loading.');
      expect(preview.querySelector('img')).toBeNull();
      release();
      await until(() => preview.querySelector('img') !== null, 8000);
      expect(preview.querySelector('img')!.getAttribute('src')).toBe(PHOTOS[0]);
      expect(text(preview)).not.toContain('Photos are still loading.');
      b.w[`close${Prefix}EmailModal`]();
      preview.innerHTML = '<p>as it was</p>';
      b.w[`refresh${Prefix}EmailPreview`]();                                                  // a window that is closed is not drawn
      expect(preview.innerHTML).toBe('<p>as it was</p>');
    } finally { release(); b.close(); }
  });

  it('draws no e-mail window, and does not fail, on a page that has no window or no card to draw it in', async () => {
    const b = await open({ media: MEDIA });
    try {
      const window_ = b.d.getElementById(`${prefix}EmailModal`)!;
      const card = b.d.getElementById(`${prefix}EmailCardPreview`)!;
      window_.id = 'renamed';                                                                 // no window, but a card
      expect(() => b.w[`refresh${Prefix}EmailPreview`]()).not.toThrow();
      window_.id = `${prefix}EmailModal`;
      window_.classList.remove('hidden');
      card.id = 'renamed-card';                                                               // a window, but no card
      expect(() => b.w[`refresh${Prefix}EmailPreview`]()).not.toThrow();
    } finally { b.close(); }
  });

  it('says "1 photo" where there is one', async () => {
    const b = await open({ media: [row({ media_key: 'only', heroUrl: 'https://cdn.example/only.webp' })] });
    try {
      expect(text(el(b, 'PreviewPhotos'))).toBe('1 photo');
      expect(text(el(b, 'PhotoCount'))).toBe('1 photo');
    } finally { b.close(); }
  });

  it('says "0 photos", "No photos." and "No floor plans." where the media route has none, and the report says so in its own words', async () => {
    const b = await open({ media: [] }, {}, { media: [{ url: 'https://cdn.example/legacy.webp' }] });
    try {
      expect(text(el(b, 'PreviewPhotos'))).toBe('0 photos');                                // (the route is the authority: the record's own list is not read, though it holds a photo)
      expect(text(el(b, 'PhotoCount'))).toBe('0 photos');
      expect(text(el(b, 'PhotoPreview'))).toBe('No photos.');
      expect(text(el(b, 'FloorPlanList'))).toBe('No floor plans.');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      expect(new b.w.DOMParser().parseFromString(printOf(b), 'text/html').body.textContent).toContain('No photos available for this listing.');
      expect(new b.w.DOMParser().parseFromString(cardOf(b), 'text/html').body.textContent).toContain('No photos available');
      expect(new b.w.DOMParser().parseFromString(await inlineOf(b), 'text/html').body.textContent).toContain('No photos available');
    } finally { b.close(); }
  });

  it.each([
    ['the route fails', { mediaStatus: 500 }, 'HTTP 500'],
    ['the route refuses', { mediaStatus: 403 }, 'HTTP 403'],
    ['the route fails and its answer holds media rows all the same', { mediaStatus: 500, mediaBody: { media: [{ media_key: 'k', url: 'https://cdn.example/k.webp', heroUrl: 'https://cdn.example/k.webp', media_type: 'Photo' }] } }, 'HTTP 500'],
    ['the network is down', { mediaFail: true }, 'network down'],
    ['the answer holds no list of media', { mediaBody: {} }, 'the answer holds no media list'],
    ['the answer holds a media list that is not a list', { mediaBody: { media: 'none' } }, 'the answer holds no media list'],
    ['the answer is not even an object', { mediaBody: 'none' }, 'the answer holds no media list'],
  ] as const)('says the photos could not be loaded, and not that there are none, when %s; the record\'s own list is not used in its place', async (_why, extra, reason) => {
    const b = await open(extra, {}, { media: [{ url: 'https://cdn.example/legacy.webp' }] });
    try {
      const warnings: string[] = [];
      b.w.console.warn = (...parts: unknown[]) => { warnings.push(parts.join(' ')); };
      await b.w.viewerLoadMedia(prefix, { listing_id: lid }, () => undefined);                // (asked again, with a spy on what the page says to the console)
      expect(warnings.some((w) => w.includes('could not be read') && w.includes(reason))).toBe(true);
      expect(b.w.viewerMediaState()).toBe('failed');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      expect(text(el(b, 'PreviewPhotos'))).toBe('Could not be loaded');
      expect(text(el(b, 'PhotoCount'))).toBe('Could not be loaded');
      expect(text(el(b, 'PhotoPreview'))).toBe('Photos could not be loaded.');
      expect(text(el(b, 'FloorPlanList'))).toBe('Floor plans could not be loaded.');
      expect(pictures(b)).toHaveLength(0);
      for (const html of [printOf(b), cardOf(b), await inlineOf(b)]) {
        expect(new b.w.DOMParser().parseFromString(html, 'text/html').body.textContent).toContain('Photos could not be loaded.');
        expect(html).not.toContain('No photos available');
        expect(html).not.toContain('legacy.webp');
      }
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it('shows what the media route answers for a listing that has no media rows yet: a read-only preview of the record\'s legacy list', async () => {
    const b = await open({}, {}, { media: [{ url: 'https://cdn.example/legacy.webp' }, { url: 'https://cdn.example/legacy-plan.png', type: 'floorplan' }, { url: 'https://cdn.example/captioned.png', caption: 'Floor Plan' }, { url: '' }] });
    try {
      expect(b.requests.filter((r) => /\/media/.test(r))).toEqual([`GET /api/crm/listings/${lid}/media`]);
      expect(b.w.getListingPhotoUrls(prefix)).toEqual(['https://cdn.example/legacy.webp']);
      expect([...b.d.querySelectorAll(`#${prefix}FloorPlanList a`)].map((a) => a.getAttribute('href'))).toEqual(['https://cdn.example/legacy-plan.png', 'https://cdn.example/captioned.png']);
      expect(text(el(b, 'PreviewPhotos'))).toBe('1 photo');
    } finally { b.close(); }
  });

  it('does nothing for a listing that is not there: it asks for nothing, says the photos could not be loaded, and fails nothing', async () => {
    const b = await open({ media: MEDIA });
    try {
      const asked = () => b.requests.filter((r) => /\/media/.test(r)).length;
      expect(asked()).toBe(1);
      await expect(b.w.viewerLoadMedia(prefix, undefined, () => undefined)).resolves.toBeUndefined();
      await expect(b.w.viewerLoadMedia(prefix, {}, () => undefined)).resolves.toBeUndefined();
      expect(asked()).toBe(1);                                                                // (nothing was asked for a listing that is not there)
      expect(b.w.viewerMediaState()).toBe('failed');
      expect(text(el(b, 'PhotoPreview'))).toBe('Photos could not be loaded.');
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it('leaves the window and the photo list as they are when no listing is open any more', async () => {
    const b = await open({ media: MEDIA });
    try {
      expect(pictures(b)).toHaveLength(3);
      b.w.VIEWER_LISTING_ID = '';
      const asked = () => b.requests.filter((r) => /\/media/.test(r)).length;
      const before = asked();
      expect(() => b.w.viewerShowMedia(prefix)).not.toThrow();
      await expect(b.w.viewerLoadMedia(prefix, { listing_id: lid }, () => undefined)).resolves.toBeUndefined();
      expect(asked()).toBe(before);                                                           // (there is nobody to ask for)
      expect(pictures(b)).toHaveLength(3);
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      expect(b.w.viewerPhotoCountText(prefix)).toBe('Could not be loaded');
      expect(b.w.getListingPhotoNote('No photos available')).toBe('Photos could not be loaded.');
    } finally { b.close(); }
  });

  it('takes the photos away when a later load fails: nothing stale is shown as if it were current, anywhere', async () => {
    const b = await open({ media: MEDIA });
    try {
      expect(b.w.getListingPhotoUrls(prefix)).toEqual(PHOTOS);
      b.w.console.warn = () => undefined;
      b.w.fetch = () => Promise.reject(new Error('network down'));                             // the CRM is gone when the page asks again
      await b.w.viewerLoadMedia(prefix, { listing_id: lid }, () => undefined);
      expect(b.w.viewerMediaState()).toBe('failed');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      expect(pictures(b)).toHaveLength(0);
      expect(text(el(b, 'PhotoPreview'))).toBe('Photos could not be loaded.');
      expect(text(el(b, 'FloorPlanList'))).toBe('Floor plans could not be loaded.');
      expect(new b.w.DOMParser().parseFromString(printOf(b), 'text/html').body.textContent).toContain('Photos could not be loaded.');
    } finally { b.close(); }
  });

  it('says the photos could not be loaded when the failure has no reason at all (a promise rejected with nothing)', async () => {
    const b = await open({ media: MEDIA });
    try {
      b.w.console.warn = () => undefined;
      b.w.fetch = () => Promise.reject();
      await b.w.viewerLoadMedia(prefix, { listing_id: lid }, () => undefined);
      expect(b.w.viewerMediaState()).toBe('failed');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual([]);
      expect(text(el(b, 'PhotoPreview'))).toBe('Photos could not be loaded.');
    } finally { b.close(); }
  });

  it.each<[string, () => unknown]>([
    ['an error', () => new Error('the Preview could not be drawn')],
    ['nothing at all', () => undefined],
  ])('survives a refresh that fails with %s: the photos stay loaded and the failure is not passed on', async (_what, failure) => {
    const b = await open({ media: MEDIA });
    try {
      b.w.console.warn = () => undefined;
      await expect(b.w.viewerLoadMedia(prefix, { listing_id: lid }, () => { throw failure(); })).resolves.toBeUndefined();
      expect(b.w.viewerMediaState()).toBe('loaded');
      expect(b.w.getListingPhotoUrls(prefix)).toEqual(PHOTOS);
    } finally { b.close(); }
  });
});
