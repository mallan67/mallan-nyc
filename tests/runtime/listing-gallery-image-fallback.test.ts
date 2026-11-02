/// <reference types="jest" />
/**
 * Listing gallery — BEHAVIOUR of the optimizer → raw → placeholder chain (not source text).
 *
 * The real ListingMediaGallery is rendered into a real DOM (jsdom + react-dom/client), real `error` events are fired
 * at its <img> elements, and the test reads what a visitor's browser would be asked to load after each step.
 *
 *   Mallan R2 photo   : optimizer candidate  --error-->  the RAW R2 photo  --3 more errors (retry, retry, give up)-->  placeholder
 *   everything else   : the source as it is  --3 errors (retry, retry, give up)-->  placeholder   (never an optimizer step)
 *
 * The counter and the thumbnail count are the gallery's, so they must stay truthful whatever happens to a photo.
 * One more case is found only in a real browser: an <img> that failed BEFORE React hydrated never delivers its error
 * event to React, so the gallery scans for `complete && naturalWidth === 0` after hydration.
 */
// A module (not a global script): the names below must not leak into, or collide with, the global `React` namespace and Jest's `fail`.
export {};
const { JSDOM } = require('jsdom');

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20114974';
const r2 = (i: number) => `${R2}/20060247112${String(i).padStart(2, '0')}.jpg`;
const COTALITY = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1194318565/1/NjA0My8xMTM3MS8yMA/MjAvMjE1MjYvMTc5MzU4NjkwNw/sig';
const proxied = (u: string) => `/api/media/proxy?url=${encodeURIComponent(u)}`;
const PLACEHOLDER = '/images/listing-placeholder.svg';

let dom: any;
let ReactLib: any;
let createRoot: (el: Element) => { render: (n: any) => void; unmount: () => void };
let hydrateRoot: (el: Element, n: any) => { unmount: () => void };
let renderToString: (n: any) => string;
let act: (fn: () => void) => void;
let Gallery: any;
const mounted: Array<{ unmount: () => void }> = [];

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLImageElement = dom.window.HTMLImageElement;
  g.Node = dom.window.Node;
  g.Event = dom.window.Event;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  jest.isolateModules(() => {
    ReactLib = require('react');
    ({ createRoot, hydrateRoot } = require('react-dom/client'));
    ({ renderToString } = require('react-dom/server'));
    ({ act } = require('react-dom/test-utils'));
    Gallery = require('@/app/components/ListingMediaGallery').default;
  });
});

afterEach(() => {
  while (mounted.length) {
    const r = mounted.pop()!;
    act(() => r.unmount());
  }
  document.body.innerHTML = '';
});

afterAll(() => {
  const g = globalThis as any;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLImageElement', 'Node', 'Event', 'IS_REACT_ACT_ENVIRONMENT']) delete g[k];
});

const photos = (urls: string[]) => urls.map((url, i) => ({ url, thumbUrl: url, order: i }));
const gallery = (urls: string[]) => ReactLib.createElement(Gallery, { images: photos(urls), alt: '151 E 85th Street' });

function mount(urls: string[]): Element {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(gallery(urls)));
  return container;
}

const main = (c: Element) => c.querySelector('img[data-kind="main"]') as HTMLImageElement;
const thumb = (c: Element, i: number) => c.querySelector(`img[data-kind="thumb"][data-idx="${i}"]`) as HTMLImageElement;
const failImg = (img: Element) => act(() => { img.dispatchEvent(new (window as any).Event('error')); });
const decode = (s: string | null) => (s ?? '').replace(/&amp;/g, '&');
const isOptimized = (img: Element) => decode(img.getAttribute('src')).includes('/_next/image') && !!img.getAttribute('srcset');
const counter = (c: Element) => (c.querySelector('[aria-live="polite"]') as HTMLElement).textContent;

describe('a Mallan R2 photo: optimizer candidate -> raw photo -> retries -> placeholder', () => {
  it('starts on the optimizer, falls back to the RAW photo on the first error, then retries, then gives up', () => {
    const c = mount([r2(0), r2(1), r2(2)]);
    expect(isOptimized(main(c))).toBe(true);

    failImg(main(c)); // 1: the optimizer candidate failed
    expect(main(c).getAttribute('src')).toBe(r2(0));
    expect(main(c).getAttribute('srcset')).toBeNull();
    expect(main(c).getAttribute('sizes')).toBeNull();

    failImg(main(c)); // 2: the raw photo failed -> retry 1 (a new element, the same raw source)
    expect(main(c).getAttribute('src')).toBe(r2(0));
    failImg(main(c)); // 3: -> retry 2
    expect(main(c).getAttribute('src')).toBe(r2(0));
    failImg(main(c)); // 4: -> give up
    expect(main(c).getAttribute('src')).toBe(PLACEHOLDER);
  });

  it('the fallback is per photo: photo 1 failing does not change how photo 2 is asked for', () => {
    const c = mount([r2(0), r2(1), r2(2)]);
    failImg(main(c));
    expect(main(c).getAttribute('src')).toBe(r2(0));
    act(() => { (c.querySelector('[aria-label="Next photo"]') as HTMLElement).click(); });
    expect(isOptimized(main(c))).toBe(true);
    expect(decode(main(c).getAttribute('src'))).toContain(encodeURIComponent(r2(1)));
  });

  it('the counter and the thumbnail count stay truthful whatever happens to a photo', () => {
    const c = mount([r2(0), r2(1), r2(2)]);
    expect(counter(c)).toBe('1/3');
    for (let i = 0; i < 4; i++) failImg(main(c)); // photo 1 ends on the placeholder
    expect(main(c).getAttribute('src')).toBe(PLACEHOLDER);
    expect(counter(c)).toBe('1/3');
    expect(c.querySelectorAll('img[data-kind="thumb"]').length).toBe(3);
    act(() => { (c.querySelector('[aria-label="Next photo"]') as HTMLElement).click(); });
    expect(counter(c)).toBe('2/3');
  });

  it('a thumbnail falls back to its RAW photo too', () => {
    const c = mount([r2(0), r2(1)]);
    expect(isOptimized(thumb(c, 1))).toBe(true);
    failImg(thumb(c, 1));
    expect(thumb(c, 1).getAttribute('src')).toBe(r2(1));
    expect(thumb(c, 1).getAttribute('srcset')).toBeNull();
  });
});

describe('sources the gallery does not optimize never get an optimizer step', () => {
  it.each([
    ['a Cotality photo behind the media proxy (compliance policy: stays on the proxy)', proxied(COTALITY)],
    ['an untrusted https host', 'https://evil.example.com/photo.jpg'],
    ['a plain http R2 URL', 'http://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/x.jpg'],
  ])('%s: the source as it is, retried twice, then the placeholder', (_n, url) => {
    const c = mount([url, r2(1)]);
    expect(main(c).getAttribute('src')).toBe(url);
    expect(main(c).getAttribute('srcset')).toBeNull();
    failImg(main(c)); // 1 -> retry 1 (NOT a raw swap: it was already raw)
    expect(main(c).getAttribute('src')).toBe(url);
    failImg(main(c)); // 2 -> retry 2
    expect(main(c).getAttribute('src')).toBe(url);
    failImg(main(c)); // 3 -> give up
    expect(main(c).getAttribute('src')).toBe(PLACEHOLDER);
  });
});

describe('the lightbox', () => {
  it('asks the fullscreen ladder at q=90 for an R2 photo and falls back to the raw photo on error', () => {
    const c = mount([r2(0), r2(1)]);
    act(() => { main(c).click(); });
    const box = document.querySelector('[role="dialog"] img') as HTMLImageElement;
    expect(box).not.toBeNull();
    expect(decode(box.getAttribute('src'))).toContain('/_next/image');
    expect(decode(box.getAttribute('srcset'))).toContain('w=3840&q=90');
    failImg(box);
    const after = document.querySelector('[role="dialog"] img') as HTMLImageElement;
    expect(after.getAttribute('src')).toBe(r2(0));
    expect(after.getAttribute('srcset')).toBeNull();
  });

  it('keeps a Cotality photo on the proxy', () => {
    const c = mount([proxied(COTALITY), r2(1)]);
    act(() => { main(c).click(); });
    const box = document.querySelector('[role="dialog"] img') as HTMLImageElement;
    expect(box.getAttribute('src')).toBe(proxied(COTALITY));
    expect(box.getAttribute('srcset')).toBeNull();
  });
});

describe('an <img> that failed BEFORE React hydrated (its error event never reaches React)', () => {
  it('is caught on mount and sent through the same fallback', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(gallery([r2(0), r2(1)]));
    const img = main(container);
    const optimizedSrc = img.getAttribute('src') as string;
    expect(optimizedSrc).toContain('/_next/image');
    // A browser reports a failed image as `complete` with no pixels. It stays "failed" only while it still has that source.
    Object.defineProperty(img, 'complete', { configurable: true, get: () => img.getAttribute('src') === optimizedSrc });
    Object.defineProperty(img, 'naturalWidth', { configurable: true, get: () => 0 });
    Object.defineProperty(img, 'currentSrc', { configurable: true, get: () => img.getAttribute('src') ?? '' });

    let root: { unmount: () => void } | undefined;
    act(() => { root = hydrateRoot(container, gallery([r2(0), r2(1)])); });
    mounted.push(root!);

    expect(main(container).getAttribute('src')).toBe(r2(0));
    expect(main(container).getAttribute('srcset')).toBeNull();
  });
});
