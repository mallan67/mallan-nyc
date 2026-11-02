/// <reference types="jest" />
/**
 * Listing gallery — the photo position dots must never widen the page.
 *
 * Found 2026-11-02 (emulated 390px touch phone against mallan.nyc, a 17-photo listing): the layout viewport
 * grew from 390px to ~601px. Cause: ListingMediaGallery drew one <button> per photo as a 6px dot, and
 * app/globals.css gives every button on a touch device (`@media (pointer: coarse)`) a 44×44px minimum.
 * 17 dots × 44px = an 812px-wide, centred, unclipped container. A 50-photo listing is 2,200px. The old
 * e2e spec could not see it: it ran a plain desktop-style viewport, where `pointer: coarse` is false.
 *
 * The 44px touch-target rule stays (it is right for real controls). What changes: the dots are
 * non-interactive position indicators, at most MAX_PHOTO_DOTS of them, centred on the current photo.
 * Navigation is unchanged and stays accessible: swipe, the Previous / Next buttons, the "n/N" counter
 * and (md+) the thumbnail strip.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ListingMediaGallery, { photoDotWindow, MAX_PHOTO_DOTS } from '@/app/components/ListingMediaGallery';

const images = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example.com/p/${i}.jpg`, order: i }));

const render = (n: number) =>
  renderToStaticMarkup(createElement(ListingMediaGallery, { images: images(n), alt: '151 E 85th Street' }));

/** The dot container is the one marked as a decorative indicator. */
const dotContainer = (html: string) => {
  const m = html.match(/<div[^>]*data-photo-dots[^>]*>([\s\S]*?)<\/div>/);
  return m ? { open: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] } : null;
};

describe('photoDotWindow', () => {
  it('shows no dots for a single photo', () => {
    expect(photoDotWindow(1, 0)).toEqual([]);
    expect(photoDotWindow(0, 0)).toEqual([]);
  });

  it('shows every photo when there are no more than the cap', () => {
    expect(photoDotWindow(2, 1)).toEqual([0, 1]);
    expect(photoDotWindow(MAX_PHOTO_DOTS, 3)).toEqual(Array.from({ length: MAX_PHOTO_DOTS }, (_, i) => i));
  });

  it.each([17, 50])('never shows more than the cap for %i photos, and always includes the current photo', (count) => {
    for (let active = 0; active < count; active++) {
      const dots = photoDotWindow(count, active);
      expect(dots.length).toBeLessThanOrEqual(MAX_PHOTO_DOTS);
      expect(dots).toContain(active);
      // contiguous, ascending, inside the real range
      dots.forEach((d, i) => {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(count);
        if (i > 0) expect(d).toBe(dots[i - 1] + 1);
      });
    }
  });

  it('keeps the current photo centred away from the ends and pins the window at the ends', () => {
    expect(photoDotWindow(17, 0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(photoDotWindow(17, 8)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(photoDotWindow(17, 16)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(photoDotWindow(50, 25)).toEqual([22, 23, 24, 25, 26, 27, 28]);
  });

  it('survives an out-of-range or fractional current index', () => {
    expect(photoDotWindow(17, -3)).toContain(0);
    expect(photoDotWindow(17, 99)).toContain(16);
    expect(photoDotWindow(17, 4.7).length).toBeLessThanOrEqual(MAX_PHOTO_DOTS);
  });
});

describe('ListingMediaGallery markup', () => {
  it.each([2, 17, 50])('%i photos: the dots are a bounded, decorative, non-interactive indicator', (n) => {
    const html = render(n);
    const box = dotContainer(html);
    expect(box).not.toBeNull();
    expect(box!.open).toContain('aria-hidden="true"');
    expect(box!.open).toContain('pointer-events-none');
    expect(box!.open).toContain('md:hidden'); // phones only, as before
    // no <button> in there: the 44px touch-target rule can no longer inflate them
    expect(box!.inner).not.toContain('<button');
    const dots = box!.inner.match(/<span/g) ?? [];
    expect(dots.length).toBe(Math.min(n, MAX_PHOTO_DOTS));
  });

  it('a single photo draws no dot indicator, no counter and no arrows', () => {
    const html = render(1);
    expect(dotContainer(html)).toBeNull();
    expect(html).not.toContain('aria-label="Next photo"');
    expect(html).not.toMatch(/>1\/1</);
  });

  it.each([2, 17, 50])('%i photos: swipe, Previous / Next buttons and the counter are all still there', (n) => {
    const html = render(n);
    expect(html).toContain('aria-label="Previous photo"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain(`1/${n}`);
    expect(html).toContain('touch-pan-y'); // the swipe surface
    expect(html).toContain('aria-live="polite"'); // the position is announced now that the labelled dots are gone
  });

  it('the thumbnail strip (md+) still gives every photo a labelled, focusable button', () => {
    const html = render(17);
    const labelled = html.match(/aria-label="Photo \d+"/g) ?? [];
    expect(labelled.length).toBe(17);
  });
});
