/// <reference types="jest" />
/**
 * Card photo carousel — shared logic + three-card wiring.
 *
 * DEFECT THIS PINS (browser-verified on production 2026-07-31, 100 cards
 * on /search?tab=buy-residential): only SplitCard had a carousel.
 * GridCard and ListCard called `getHeroPhoto()` with no index state, so
 * they rendered exactly one image and zero next/prev controls — while
 * still displaying a photo-count badge ("12") advertising photos the
 * user had no way to reach. Maya's report: "there is only 1st photo the
 * photos are missing from the listings pages."
 *
 * The fix is ONE implementation (`useCardPhotoCarousel` +
 * `CardPhotoNav`) consumed by all three cards. These tests pin both the
 * pure logic and the wiring, because a future refactor that reintroduces
 * a per-card carousel would silently recreate the divergence.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  selectNavigablePhotos,
  nextPhotoIndex,
  prevPhotoIndex,
  clampPhotoIndex,
} from '../../lib/hooks/useCardPhotoCarousel';

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/listings/SL-0004';
const photo = (n: number) => ({ url: `${R2}/${n}.webp`, mediaType: 'Photo', order: n });

describe('selectNavigablePhotos — what the arrows are allowed to reach', () => {
  it('keeps photo media in display order', () => {
    const media = [photo(1), photo(2), photo(3)];
    const got = selectNavigablePhotos(media, new Set());
    expect(got.map((m) => m.url)).toEqual([
      `${R2}/1.webp`,
      `${R2}/2.webp`,
      `${R2}/3.webp`,
    ]);
  });

  it('excludes floor plans, video and 3D tours from photo navigation', () => {
    const media = [
      photo(1),
      { url: `${R2}/floorplan.webp`, mediaType: 'FloorPlan', order: 2 },
      { url: `${R2}/tour.mp4`, mediaType: 'Video', order: 3 },
      photo(4),
    ];
    const got = selectNavigablePhotos(media, new Set());
    expect(got.map((m) => m.mediaType)).toEqual(['Photo', 'Photo']);
    expect(got.map((m) => m.url)).not.toContain(`${R2}/floorplan.webp`);
    expect(got.map((m) => m.url)).not.toContain(`${R2}/tour.mp4`);
  });

  it('drops a failed photo WITHOUT collapsing the rest (card must not go blank)', () => {
    const media = [photo(1), photo(2), photo(3)];
    const got = selectNavigablePhotos(media, new Set([`${R2}/2.webp`]));
    expect(got).toHaveLength(2);
    expect(got.map((m) => m.url)).toEqual([`${R2}/1.webp`, `${R2}/3.webp`]);
  });

  it('returns an empty set for no media (caller falls back to the placeholder)', () => {
    expect(selectNavigablePhotos([], new Set())).toEqual([]);
    expect(selectNavigablePhotos(undefined, new Set())).toEqual([]);
    expect(selectNavigablePhotos(null, new Set())).toEqual([]);
  });
});

describe('index arithmetic — next/prev wrap and stay addressable', () => {
  it('next advances one photo at a time', () => {
    expect(nextPhotoIndex(0, 5)).toBe(1);
    expect(nextPhotoIndex(3, 5)).toBe(4);
  });

  it('next wraps past the last photo to the first', () => {
    expect(nextPhotoIndex(4, 5)).toBe(0);
  });

  it('prev steps back and wraps before the first photo to the last', () => {
    expect(prevPhotoIndex(2, 5)).toBe(1);
    expect(prevPhotoIndex(0, 5)).toBe(4);
  });

  it('a single photo has nowhere to go', () => {
    expect(nextPhotoIndex(0, 1)).toBe(0);
    expect(prevPhotoIndex(0, 1)).toBe(0);
  });

  it('an empty photo set never produces a negative or NaN index', () => {
    expect(nextPhotoIndex(0, 0)).toBe(0);
    expect(prevPhotoIndex(0, 0)).toBe(0);
    expect(clampPhotoIndex(3, 0)).toBe(0);
  });

  it('clamp re-anchors an index that outran a shrinking photo set', () => {
    // User is on photo 5/5, photo 5 fails to load → count drops to 4.
    // Without the clamp the card renders `photos[4]` === undefined → blank.
    expect(clampPhotoIndex(4, 4)).toBe(3);
    expect(clampPhotoIndex(0, 4)).toBe(0);
  });
});

describe('SearchListingCard wiring — ONE carousel implementation, three cards', () => {
  const src = readFileSync(
    resolve(__dirname, '../../app/components/SearchListingCard.tsx'),
    'utf8',
  );

  it('all three cards consume the shared hook', () => {
    const uses = src.match(/useCardPhotoCarousel\(listing\.media\)/g) || [];
    expect(uses).toHaveLength(3);
  });

  it('no card keeps a private carousel implementation', () => {
    // The defect was three divergent code paths. `useState` for photo
    // index / failed-URL tracking must live ONLY in the hook.
    expect(src).not.toMatch(/setPhotoIdx/);
    expect(src).not.toMatch(/failedPhotoUrls/);
    expect(src).not.toMatch(/getHeroPhoto/);
    expect(src).not.toMatch(/useSwipe\(/);
  });

  it('all three cards render the shared nav controls and position counter', () => {
    expect((src.match(/<CardPhotoNav\b/g) || [])).toHaveLength(3);
    expect((src.match(/<CardPhotoCounter\b/g) || [])).toHaveLength(3);
  });

  it('all three cards wire touch swipe to the photo area', () => {
    expect((src.match(/carousel\.swipe\.onTouchStart/g) || [])).toHaveLength(3);
    expect((src.match(/carousel\.swipe\.onTouchEnd/g) || [])).toHaveLength(3);
    // …and suppress the navigation click at the end of a swipe.
    expect((src.match(/carousel\.swipe\.cancelIfSwiping/g) || [])).toHaveLength(3);
  });

  it('all three cards declare a rendered-size profile so cards stop downloading originals', () => {
    expect(src).toMatch(/sizeProfile="grid"/);
    expect(src).toMatch(/sizeProfile="list"/);
    expect(src).toMatch(/sizeProfile="split"/);
  });
});

describe('CardPhotoNav — arrow clicks must not open the listing', () => {
  const nav = readFileSync(
    resolve(__dirname, '../../app/components/CardPhotoNav.tsx'),
    'utf8',
  );
  const hook = readFileSync(
    resolve(__dirname, '../../lib/hooks/useCardPhotoCarousel.ts'),
    'utf8',
  );

  it('arrows carry the accessible labels the cards are navigated by', () => {
    expect(nav).toMatch(/aria-label="Previous photo"/);
    expect(nav).toMatch(/aria-label="Next photo"/);
  });

  it('arrows are type="button" so they never submit or navigate by default', () => {
    expect((nav.match(/type="button"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('the shared click handlers cancel the surrounding listing link', () => {
    // GridCard/ListCard nest the arrows inside the card's <Link>, so BOTH
    // preventDefault (stops the <a> default) and stopPropagation (stops
    // React's delegated Link onClick) are required.
    expect(hook).toMatch(/e\.preventDefault\(\)/);
    expect(hook).toMatch(/e\.stopPropagation\(\)/);
  });

  it('the counter is suppressed for single-photo cards unless explicitly opted in', () => {
    // List and split cards showed nothing for a single-photo listing;
    // a lone "1" badge would be new noise. GridCard's badge historically
    // showed a total for any count > 0, so only it passes `showSingle`.
    expect(nav).toMatch(/if \(!carousel\.hasMultiple && !showSingle\) return null/);
    const card = readFileSync(
      resolve(__dirname, '../../app/components/SearchListingCard.tsx'),
      'utf8',
    );
    expect((card.match(/showSingle/g) || [])).toHaveLength(1);
  });

  it('arrows stay mounted rather than conditionally rendered on hover', () => {
    // SplitCard used to render arrows only while `hovered` was true,
    // which made them unreachable on touch viewports (no :hover) and
    // invisible to assistive tech. They are now always in the DOM when
    // there is more than one photo, revealed by CSS on pointer devices.
    expect(nav).toMatch(/md:group-hover:opacity-100/);
    expect(nav).not.toMatch(/hovered/);
  });
});
