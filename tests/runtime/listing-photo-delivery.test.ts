/// <reference types="jest" />
/**
 * Listing photo delivery — the detail gallery and its neighbours ask the optimizer for the pixels they show.
 *
 * Measured 2026-11-02 (emulated touch devices, Slow 4G, seeded listing with 17 production photos):
 *  - a 17-photo listing on an 820px tablet transferred 6.9 MB (5.9 MB images) and its LCP was 27.8s;
 *  - the phone hero was the untouched 439 KB R2 original.
 * Cause: R2 stores ONE full-resolution WebP/JPEG per synced photo (2,000–3,200px) and the DTO's `thumbUrl` is
 * byte-identical to `url` for it (lib/media/responsive-image.ts header), while the cards had been moved onto the
 * Next optimizer on 2026-08-01. The detail gallery was never opted in: the main viewer, every thumbnail and the
 * lightbox downloaded the original. Two tests in responsive-image.test.ts pinned that on purpose ("a future move
 * must be a deliberate, reviewed act"); this is that act, and those pins now describe the new contract.
 *
 * What is NOT changed: which photos a visitor may see (the gallery only ever receives the already-gated list), the
 * trusted hosts, the CARD ladder, floor plans, video, 3D tours, and the proxy.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import ListingMediaGallery from '@/app/components/ListingMediaGallery';
import { SimilarCard } from '@/app/components/SimilarListings';
import IMAGE_CONFIG from '@/config/image-optimization.json';
import {
  buildImageSources,
  optimizedUrl,
  CARD_IMAGE_WIDTHS,
  CARD_IMAGE_QUALITY,
  GALLERY_IMAGE_WIDTHS,
  GALLERY_IMAGE_QUALITY,
  GALLERY_THUMB_WIDTHS,
  GALLERY_THUMB_QUALITY,
  GALLERY_FULLSCREEN_WIDTHS,
  GALLERY_FULLSCREEN_QUALITY,
  GALLERY_SIZES,
} from '@/lib/media/responsive-image';

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20114974';
const r2 = (i: number) => `${R2}/20060247112${String(i).padStart(2, '0')}.jpg`;
const COTALITY = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1194318565/1/NjA0My8xMTM3MS8yMA/MjAvMjE1MjYvMTc5MzU4NjkwNw/sig';
const proxied = (u: string) => `/api/media/proxy?url=${encodeURIComponent(u)}`;
const photos = (n: number, make: (i: number) => string = r2) => Array.from({ length: n }, (_, i) => ({ url: make(i), thumbUrl: make(i), order: i }));
const render = (images: ReturnType<typeof photos>) => renderToStaticMarkup(createElement(ListingMediaGallery, { images, alt: '151 E 85th Street' }));
const src = (file: string) => readFileSync(resolve(__dirname, '../../', file), 'utf8');

/** The first <img> inside the photo viewer (the main picture) and the thumbnail <img>s inside the strip. */
const mainImg = (html: string) => (html.match(/<img[^>]*cursor-zoom-in[^>]*>/) ?? [''])[0];
const thumbImgs = (html: string) => html.match(/<img[^>]*\bloading="lazy"[^>]*>/g) ?? [];
const attr = (tag: string, name: string) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i')) ?? [])[1]; // React prints srcSet / fetchPriority in camelCase
const decode = (s: string | undefined) => (s ?? '').replace(/&amp;/g, '&');

describe('gallery ladders are real optimizer sizes (no config change, no new host)', () => {
  const allowedWidths = [...IMAGE_CONFIG.deviceSizes, ...IMAGE_CONFIG.imageSizes];

  it.each([
    ['main', GALLERY_IMAGE_WIDTHS],
    ['thumb', GALLERY_THUMB_WIDTHS],
    ['fullscreen', GALLERY_FULLSCREEN_WIDTHS],
  ] as const)('%s ladder only requests widths next.config admits', (_n, widths) => {
    expect(widths.length).toBeGreaterThan(2);
    for (const w of widths) expect(allowedWidths).toContain(w);
  });

  it('qualities are in the allow-list (Next answers 400 to anything else)', () => {
    for (const q of [GALLERY_IMAGE_QUALITY, GALLERY_THUMB_QUALITY, GALLERY_FULLSCREEN_QUALITY]) expect(IMAGE_CONFIG.qualities).toContain(q);
  });

  it('PREMIUM: the main ladder true-covers a 390px phone at 3x (1170) and an 820px tablet at 2x (1640), and tops out above a 1440px retina desktop (2880)', () => {
    const covers = (need: number) => GALLERY_IMAGE_WIDTHS.some((w) => w >= need);
    expect(covers(390 * 3)).toBe(true);
    expect(covers(820 * 2)).toBe(true);
    expect(covers(1440 * 2)).toBe(true);
    // ...and the rung chosen for the phone is not a 3x overshoot of what it needs
    const phoneRung = GALLERY_IMAGE_WIDTHS.find((w) => w >= 390 * 3)!;
    expect(phoneRung / (390 * 3)).toBeLessThan(1.2);
  });

  it('PREMIUM: thumbnails (88 CSS px) reach a true 3x candidate', () => {
    expect(GALLERY_THUMB_WIDTHS.some((w) => w >= 88 * 3)).toBe(true);
  });

  it('the CARD ladder and its quality are untouched', () => {
    expect([...CARD_IMAGE_WIDTHS]).toEqual([384, 448, 640, 828, 1080, 1280]);
    expect(CARD_IMAGE_QUALITY).toBe(85);
    const s = buildImageSources(r2(0));
    expect(s.src).toBe(optimizedUrl(r2(0), 640));
    expect(s.srcSet).toBe(CARD_IMAGE_WIDTHS.map((w) => `${optimizedUrl(r2(0), w)} ${w}w`).join(', '));
  });

  it('describes the real rendered width: full-bleed on phones, the 1600px container above it, an 88px thumbnail', () => {
    expect(GALLERY_SIZES.main).toBe('(min-width: 1600px) 1600px, 100vw');
    expect(GALLERY_SIZES.thumb).toBe('88px');
    expect(GALLERY_SIZES.fullscreen).toBe('100vw');
  });
});

describe('ListingMediaGallery asks the optimizer for the pixels it shows', () => {
  it('R2 photo: the main picture has a srcset ladder, a sizes hint and a mid-size default — never the original', () => {
    const html = render(photos(17));
    const main = mainImg(html);
    expect(main).not.toBe('');
    const srcset = decode(attr(main, 'srcset'));
    for (const w of GALLERY_IMAGE_WIDTHS) expect(srcset).toContain(`${decode(optimizedUrl(r2(0), w, GALLERY_IMAGE_QUALITY))} ${w}w`);
    expect(attr(main, 'sizes')).toBe(GALLERY_SIZES.main);
    expect(decode(attr(main, 'src'))).toBe(optimizedUrl(r2(0), 828, GALLERY_IMAGE_QUALITY));
    expect(decode(attr(main, 'src'))).not.toBe(r2(0));
    expect(srcset).not.toMatch(/\/photos\/RLS20114974\/[^ ]*\.jpg \d+w/); // no raw original as a candidate
  });

  it('the first photo is the one priority image; nothing else is fetched eagerly', () => {
    const html = render(photos(17));
    expect(attr(mainImg(html), 'fetchpriority')).toBe('high');
    expect(attr(mainImg(html), 'loading')).toBe('eager');
    // every other <img> in the gallery (the 17 thumbnails) is lazy and async
    const thumbs = thumbImgs(html);
    expect(thumbs.length).toBe(17);
    for (const t of thumbs) {
      expect(attr(t, 'loading')).toBe('lazy');
      expect(attr(t, 'decoding')).toBe('async');
    }
  });

  it('thumbnails get the thumbnail ladder at 88px, not the 400KB+ original', () => {
    const t = thumbImgs(render(photos(17)))[3];
    const srcset = decode(attr(t, 'srcset'));
    for (const w of GALLERY_THUMB_WIDTHS) expect(srcset).toContain(`${w}w`);
    expect(srcset).not.toContain('w=1920');
    expect(attr(t, 'sizes')).toBe(GALLERY_SIZES.thumb);
    expect(decode(attr(t, 'src'))).not.toBe(r2(3));
  });

  it('a Cotality photo behind the media proxy is unwrapped to the trusted absolute URL for the optimizer', () => {
    const html = render(photos(3, () => proxied(COTALITY)));
    const main = mainImg(html);
    expect(decode(attr(main, 'srcset'))).toContain(`url=${encodeURIComponent(COTALITY)}&w=640`);
    expect(decode(attr(main, 'srcset'))).not.toContain('/api/media/proxy');
  });

  it.each([
    ['an untrusted https host', 'https://evil.example.com/photo.jpg'],
    ['a look-alike host', 'https://api.cotality.com.evil.com/photo.jpg'],
    ['a relative path (the placeholder)', '/images/listing-placeholder.svg'],
    ['a plain http URL', 'http://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/x.jpg'],
  ])('%s is never handed to the optimizer: raw src, no srcset, no sizes', (_n, url) => {
    const html = render([{ url, thumbUrl: url, order: 0 }, { url, thumbUrl: url, order: 1 }]);
    const main = mainImg(html);
    expect(attr(main, 'src')).toBe(url);
    expect(attr(main, 'srcset')).toBeUndefined();
    expect(attr(main, 'sizes')).toBeUndefined();
    for (const t of thumbImgs(html)) {
      expect(attr(t, 'srcset')).toBeUndefined();
      expect(attr(t, 'src')).toBe(url);
    }
  });

  it('shows exactly the photos it was given: the optimizer path adds, removes and reorders nothing', () => {
    const given = photos(5);
    const html = render(given);
    expect(thumbImgs(html).length).toBe(5);
    expect(html).toContain('1/5');
    expect(html).toContain('aria-label="Photo 5"');
  });
});

describe('ListingMediaGallery source contracts (failure, lightbox, non-photo media)', () => {
  const gallery = src('app/components/ListingMediaGallery.tsx');

  it('an optimizer failure falls back to the RAW photo once, before the retry/placeholder logic', () => {
    expect(gallery).toMatch(/rawFallback/);
    expect(gallery).toMatch(/setRawFallback\(/);
    expect(gallery.indexOf('rawFallback')).toBeLessThan(gallery.indexOf('setFailed(prev'));
  });

  it('a photo that failed BEFORE hydration is caught on mount: React never receives that image\'s error event', () => {
    // Found in a real browser (optimizer blocked): the server-rendered <img> errored before React attached
    // onError, so the raw fallback never ran and the photo stayed broken. The gallery therefore checks every
    // gallery image for `complete && naturalWidth === 0` after hydration and after each state change.
    expect(gallery).toMatch(/img\[data-gallery-photo\]/);
    expect(gallery).toMatch(/img\.complete && img\.naturalWidth === 0/);
    expect(gallery).toMatch(/data-gallery-photo/);
  });

  it('the lightbox asks for the fullscreen ladder at 100vw, not the card ladder and not a 3MB original on a phone', () => {
    expect(gallery).toMatch(/GALLERY_FULLSCREEN_WIDTHS/);
    expect(gallery).toMatch(/GALLERY_SIZES\.fullscreen/);
    expect(gallery).not.toMatch(/CARD_IMAGE_WIDTHS|CARD_SIZES/);
  });

  it('floor plan, video and 3D tour are not routed through the optimizer', () => {
    expect(gallery).toMatch(/src=\{floorPlanUrl\}/);
    expect(gallery).toMatch(/src=\{videoUrl\}/);
  });

  it('there is one kill switch, in the shared helper', () => {
    expect(src('lib/media/responsive-image.ts')).toMatch(/export const GALLERY_OPTIMIZER_ENABLED = true/);
    expect(gallery).toMatch(/GALLERY_OPTIMIZER_ENABLED/);
  });
});

describe('SimilarListings (same page) and the agent listings cards use the same helper', () => {
  const item = (photoUrl: string | null, n: number) => ({
    id: String(n), mlsId: `RLS${n}`, slug: `a-${n}`, listPrice: 3_295_000, beds: 3, baths: 2, sqft: 1800,
    address: `${n} E 85th Street`, neighborhood: 'Upper East Side', photoUrl, photosCount: 12,
    propertyType: 'Condo', office: 'Mallan Real Estate Inc.', status: 'Active',
  });
  const card = (photoUrl: string | null, n: number) => renderToStaticMarkup(createElement(SimilarCard, { item: item(photoUrl, n), isRental: false }));

  it('an R2 photo gets a card-width srcset and the 260/280px sizes hint', () => {
    const img = (card(r2(0), 1).match(/<img[^>]*>/) ?? [''])[0];
    expect(decode(attr(img, 'srcset'))).toContain('w=640');
    expect(attr(img, 'sizes')).toBe('(max-width: 640px) 260px, 280px');
    expect(decode(attr(img, 'src'))).not.toBe(r2(0));
  });

  it('an untrusted photo stays raw', () => {
    const img = (card('https://evil.example.com/p.jpg', 2).match(/<img[^>]*>/) ?? [''])[0];
    expect(attr(img, 'srcset')).toBeUndefined();
    expect(attr(img, 'src')).toBe('https://evil.example.com/p.jpg');
  });

  it('the agent listings card no longer hands a /api/media/proxy URL to next/image (production: images.localPatterns error)', () => {
    const tabs = src('app/agents/[name]/listings/ActiveListingsTabs.tsx');
    expect(tabs).not.toMatch(/from 'next\/image'/);
    expect(tabs).toMatch(/<IDXImage[\s\S]*?sizeProfile="grid"/);
  });
});
