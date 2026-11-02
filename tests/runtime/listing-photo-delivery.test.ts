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
  GALLERY_OPTIMIZER_HOSTS,
  isGalleryOptimizable,
  OPTIMIZER_TRUSTED_HOSTS,
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

  it('COMPLIANCE POLICY (host level): a Cotality-HOSTED photo stays on the existing media proxy — no api.cotality.com URL reaches the optimizer (R2 copies of feed photos do; see the config note)', () => {
    // The optimizer would fetch api.cotality.com directly (no Mallan proxy: no bearer authorization, no response
    // validation, a 31-day transformed copy). Whether the IDX Plus agreement permits that for the detail gallery,
    // and what happens to those copies when a listing is withdrawn, is NOT established, so the gallery keeps the
    // proxy for Cotality media until it is certified. (The search cards' existing behaviour is not changed here.)
    const html = render(photos(3, () => proxied(COTALITY)));
    const main = mainImg(html);
    expect(attr(main, 'srcset')).toBeUndefined();
    expect(attr(main, 'sizes')).toBeUndefined();
    expect(decode(attr(main, 'src'))).toBe(proxied(COTALITY));
    for (const t of thumbImgs(html)) {
      expect(attr(t, 'srcset')).toBeUndefined();
      expect(decode(attr(t, 'src'))).toBe(proxied(COTALITY));
    }
    // ...and the unwrapped absolute URL is not optimizable either
    expect(isGalleryOptimizable(COTALITY)).toBe(false);
    expect(isGalleryOptimizable(proxied(COTALITY))).toBe(false);
  });

  it('a gallery mixing Mallan R2 and Cotality-proxied photos optimizes exactly the R2 ones', () => {
    const mixed = [{ url: r2(0), thumbUrl: r2(0), order: 0 }, { url: proxied(COTALITY), thumbUrl: proxied(COTALITY), order: 1 }, { url: r2(2), thumbUrl: r2(2), order: 2 }];
    const thumbs = thumbImgs(render(mixed));
    expect(thumbs.map((t) => attr(t, 'srcset') !== undefined)).toEqual([true, false, true]);
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

  it('the off switch is a SOURCE constant: turning it off is a code change and a deploy, not a runtime switch', () => {
    // Stated honestly because the first description of this PR called it a "kill switch" without saying so.
    // A runtime switch would need an environment variable, which is a configuration change that needs approval.
    const helper = src('lib/media/responsive-image.ts');
    expect(helper).toMatch(/export const GALLERY_OPTIMIZER_ENABLED = true/);
    expect(helper).not.toMatch(/process\.env\.[A-Z_]*GALLERY/);
    expect(helper).toMatch(/source constant|code change and a deploy/i);
    expect(gallery).toMatch(/GALLERY_OPTIMIZER_ENABLED/);
  });
});

describe('COMPLIANCE POLICY — which sources the gallery may hand to the optimizer', () => {
  it('only Mallan\'s R2 host (a HOST-level control: R2 can hold Cotality-sourced copies), declared in the shared config and a strict subset of the card trust list', () => {
    // The config's $comment_galleryOptimizerHosts must keep saying so, so nobody reads this list as "no Cotality-sourced pixels".
    expect(JSON.stringify(IMAGE_CONFIG['$comment_galleryOptimizerHosts'])).toMatch(/HOST-LEVEL CONTROL, NOT A CONTENT-LEVEL ONE/);
    expect(GALLERY_OPTIMIZER_HOSTS).toEqual(['pub-c05d6bb7575841e88a1f634081aaf714.r2.dev']);
    expect(IMAGE_CONFIG.galleryOptimizerHosts).toEqual([...GALLERY_OPTIMIZER_HOSTS]);
    for (const h of GALLERY_OPTIMIZER_HOSTS) expect(OPTIMIZER_TRUSTED_HOSTS).toContain(h);
    expect(GALLERY_OPTIMIZER_HOSTS.length).toBeLessThan(OPTIMIZER_TRUSTED_HOSTS.length);
    expect(GALLERY_OPTIMIZER_HOSTS.join(' ')).not.toMatch(/cotality|trestle/i);
  });

  it.each([
    [r2(0), true],
    [`${R2}/1779898434281-hero.webp`, true],
    [COTALITY, false],
    [proxied(COTALITY), false],
    [proxied(r2(0)), false],
    ['https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev.evil.com/x.jpg', false],
    ['https://evil.pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/x.jpg', false],
    ['https://user:pw@pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/x.jpg', false],
    ['http://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/x.jpg', false],
    ['/images/listing-placeholder.svg', false],
    ['', false],
    [null, false],
  ])('isGalleryOptimizable(%s) is %s', (url, expected) => {
    expect(isGalleryOptimizable(url as string)).toBe(expected);
  });
});

describe('the agent listings card (production render error) — fixed without extending the optimizer', () => {
  const tabs = src('app/agents/[name]/listings/ActiveListingsTabs.tsx');

  it('no longer hands a /api/media/proxy URL to next/image (production: images.localPatterns error, 13 times on 2026-11-02)', () => {
    expect(tabs).not.toMatch(/from 'next\/image'/);
    expect(tabs).toMatch(/<IDXImage/);
  });

  it('is a profile-less IDXImage: the raw source exactly as before, so no new Cotality optimizer surface is created', () => {
    const block = (tabs.match(/<IDXImage\b[\s\S]*?\/>/) ?? [''])[0];
    expect(block).not.toBe('');
    expect(block).not.toMatch(/sizeProfile=/);
  });
});
