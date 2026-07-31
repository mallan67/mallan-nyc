/// <reference types="jest" />
/**
 * Responsive card image delivery.
 *
 * DEFECT THIS PINS (measured on production 2026-07-31): a search card
 * renders at ~343-356 CSS px but downloaded the untouched R2 original —
 * 1,437,336 bytes for a single card photo. The same photo through the
 * Next optimizer at w=384 is 19,145 bytes (~75x smaller). The DTO's
 * `thumbUrl` is byte-identical to `url`, so there was no smaller stored
 * variant to switch to; the optimizer is the only working lever.
 *
 * These tests pin the two properties that make the fix real rather than
 * cosmetic:
 *   1. card-sized candidates are actually requested (not just a `sizes`
 *      hint on a single full-resolution source), and
 *   2. hosts the optimizer cannot serve are passed through untouched, so
 *      the placeholder and any non-allow-listed CDN keep rendering.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildImageSources,
  isOptimizableSource,
  optimizedUrl,
  unwrapProxiedMediaUrl,
  CARD_IMAGE_WIDTHS,
  CARD_SIZES,
} from '../../lib/media/responsive-image';

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/listings/SL-0004/hero.webp';
const TRESTLE = 'https://api.cotality.com/trestle/Media/1234.jpg';

describe('isOptimizableSource — only allow-listed absolute hosts', () => {
  it('accepts the hosts next.config allow-lists', () => {
    expect(isOptimizableSource(R2)).toBe(true);
    expect(isOptimizableSource(TRESTLE)).toBe(true);
    expect(isOptimizableSource('https://images.mallan.nyc/x.webp')).toBe(true);
    expect(isOptimizableSource('https://cdn.trestle.com/x.jpg')).toBe(true);
  });

  it('rejects relative paths — the local placeholder must never be optimized', () => {
    expect(isOptimizableSource('/images/listing-placeholder.svg')).toBe(false);
  });

  it('rejects unknown hosts (an un-allow-listed host would 400 and blank the card)', () => {
    expect(isOptimizableSource('https://example.com/photo.jpg')).toBe(false);
    // Substring lookalikes must not slip through the host pattern.
    expect(isOptimizableSource('https://r2.dev.evil.com/photo.jpg')).toBe(false);
    expect(isOptimizableSource('https://notr2.dev/photo.jpg')).toBe(false);
  });

  it('rejects empty / malformed input instead of throwing', () => {
    expect(isOptimizableSource('')).toBe(false);
    expect(isOptimizableSource(null)).toBe(false);
    expect(isOptimizableSource(undefined)).toBe(false);
    expect(isOptimizableSource('not a url')).toBe(false);
  });
});

describe('buildImageSources — cards must request card-sized bytes', () => {
  it('emits a srcSet of optimizer candidates for an R2 original', () => {
    const { src, srcSet } = buildImageSources(R2);
    expect(srcSet).toBeDefined();
    const entries = srcSet!.split(', ');
    expect(entries).toHaveLength(CARD_IMAGE_WIDTHS.length);
    for (const w of CARD_IMAGE_WIDTHS) {
      expect(srcSet).toContain(`&w=${w}&q=75 ${w}w`);
    }
    // The default candidate is card-sized, NOT the original — browsers
    // that ignore srcSet must still avoid the 1.4 MB download.
    expect(src).toContain('/_next/image?url=');
    expect(src).toContain('&w=640');
  });

  it('offers a candidate small enough for a ~350px card slot', () => {
    // The whole point: at 1x DPR a 350px slot should be able to pick a
    // ≤384px candidate. Without one, the browser is forced upward.
    expect(Math.min(...CARD_IMAGE_WIDTHS)).toBeLessThanOrEqual(384);
    // …and a candidate large enough for a 2x display of the same slot.
    expect(Math.max(...CARD_IMAGE_WIDTHS)).toBeGreaterThanOrEqual(750);
  });

  it('never emits the raw original as a srcSet candidate', () => {
    const { srcSet } = buildImageSources(R2);
    for (const entry of srcSet!.split(', ')) {
      expect(entry.startsWith('/_next/image?url=')).toBe(true);
    }
  });

  it('percent-encodes the source URL so query strings survive', () => {
    const withQuery = `${R2}?v=2&x=1`;
    const { src } = buildImageSources(withQuery);
    expect(src).toContain(encodeURIComponent(withQuery));
  });

  it('passes non-optimizable sources through untouched, with no srcSet', () => {
    const placeholder = '/images/listing-placeholder.svg';
    expect(buildImageSources(placeholder)).toEqual({ src: placeholder });
    expect(buildImageSources('https://example.com/p.jpg')).toEqual({
      src: 'https://example.com/p.jpg',
    });
  });

  it('handles null/undefined without producing an "undefined" URL', () => {
    expect(buildImageSources(null)).toEqual({ src: '' });
    expect(buildImageSources(undefined)).toEqual({ src: '' });
  });
});

describe('unwrapProxiedMediaUrl — the path every real card photo takes', () => {
  // Measured on the preview 2026-07-31: 612 of 612 sampled card photos
  // were `/api/media/proxy?url=…`, zero were direct R2. Without this
  // unwrap the whole sizing change applies to nothing.
  const PROXIED = `/api/media/proxy?url=${encodeURIComponent(TRESTLE)}`;

  it('extracts the inner absolute URL from a proxied photo', () => {
    expect(unwrapProxiedMediaUrl(PROXIED)).toBe(TRESTLE);
  });

  it('makes a proxied photo optimizable end-to-end', () => {
    const { src, srcSet } = buildImageSources(PROXIED);
    expect(srcSet).toBeDefined();
    expect(src).toContain(encodeURIComponent(TRESTLE));
    expect(src).not.toContain('media%2Fproxy');
  });

  it('refuses to unwrap to a host the optimizer does not allow', () => {
    const evil = `/api/media/proxy?url=${encodeURIComponent('https://example.com/x.jpg')}`;
    expect(unwrapProxiedMediaUrl(evil)).toBe(evil);
    expect(buildImageSources(evil)).toEqual({ src: evil });
  });

  it('leaves non-proxy sources alone', () => {
    expect(unwrapProxiedMediaUrl(R2)).toBe(R2);
    expect(unwrapProxiedMediaUrl('/images/listing-placeholder.svg')).toBe(
      '/images/listing-placeholder.svg',
    );
  });

  it('survives a malformed proxy URL without throwing', () => {
    expect(unwrapProxiedMediaUrl('/api/media/proxy?url=')).toBe('/api/media/proxy?url=');
    expect(unwrapProxiedMediaUrl('/api/media/proxy?nourl=1')).toBe('/api/media/proxy?nourl=1');
  });

  it('keeps the ORIGINAL proxy URL as the fallback src', () => {
    // IDXImage falls back to `src` (the authenticated proxy) when an
    // optimized candidate fails, so the unwrap can never strand a photo.
    const card = readFileSync(
      resolve(__dirname, '../../app/components/IDXImage.tsx'),
      'utf8',
    );
    expect(card).toMatch(/useRaw \? \{ src, srcSet: undefined \}/);
  });
});

describe('optimizedUrl', () => {
  it('builds a well-formed optimizer request', () => {
    expect(optimizedUrl(R2, 384)).toBe(
      `/_next/image?url=${encodeURIComponent(R2)}&w=384&q=75`,
    );
  });
});

describe('CARD_SIZES — the hint must describe the REAL rendered width', () => {
  it('caps the desktop grid card near its measured ~350px slot', () => {
    // A `sizes` of 100vw on a 360px card is the classic way to keep
    // downloading oversized images while looking like it was fixed.
    expect(CARD_SIZES.grid).toMatch(/360px$/);
    expect(CARD_SIZES.grid).not.toBe('100vw');
  });

  it('describes the list card rail and the split-view column', () => {
    expect(CARD_SIZES.list).toContain('16rem');
    expect(CARD_SIZES.split).toContain('320px');
  });

  it('keeps the full-bleed hero at 100vw', () => {
    expect(CARD_SIZES.hero).toBe('100vw');
  });
});

describe('IDXImage wiring', () => {
  const src = readFileSync(
    resolve(__dirname, '../../app/components/IDXImage.tsx'),
    'utf8',
  );

  it('renders srcSet + sizes from the shared builder', () => {
    expect(src).toMatch(/buildImageSources/);
    expect(src).toMatch(/srcSet=\{imgSrcSet\}/);
    expect(src).toMatch(/sizes=\{imgSrcSet \? sizesAttr : undefined\}/);
  });

  it('retries the RAW source when an optimized candidate fails', () => {
    // Sizing must never be able to blank a photo that would otherwise
    // have rendered. Only a raw-source failure is terminal.
    expect(src).toMatch(/setRawFallbackFor\(src\)/);
    expect(src).toMatch(/const useRaw = rawFallbackFor === src/);
  });

  it('keeps lazy loading below the fold and eager loading for priority images', () => {
    expect(src).toMatch(/loading=\{priority \? 'eager' : 'lazy'\}/);
  });
});
