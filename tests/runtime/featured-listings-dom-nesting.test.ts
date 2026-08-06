/**
 * Featured card DOM contract.
 *
 * THE DEFECT: `ListingCard` wrapped the whole `PhotoGallery` — prev/next
 * <button> controls included — in a Next `Link`. A <button> inside an <a> is
 * invalid HTML. React reports an invalid-nesting hydration error and the client
 * component never finishes hydrating, so photos, video and 3D all stopped
 * working at once. That is why the symptom was "it was there before and all is
 * gone" rather than one media type failing.
 *
 * These are SOURCE-STRUCTURE assertions, deliberately: the repository has no
 * React DOM test renderer wired for this surface, and a source guard that fails
 * loudly is better than an untested claim. Browser proof of hydration is a
 * separate, required step and is NOT replaced by these tests.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'app', 'components', 'FeaturedListings.tsx'),
  'utf8',
);

/** Strip comments so prose describing the old defect is never mistaken for code. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('1. no <button> is rendered below an <a>', () => {
  it('ListingCard does not wrap PhotoGallery in a Link', () => {
    // The old shape: <Link ...><PhotoGallery ... /></Link>
    expect(CODE).not.toMatch(/<Link[^>]*>\s*<PhotoGallery/);
  });

  it('the gallery Link contains only the image, and closes before any control', () => {
    // Isolate the gallery's own <Link> ... </Link> block.
    const m = CODE.match(/<Link[^>]*aria-label=\{alt\}[^>]*>([\s\S]*?)<\/Link>/);
    expect(m).not.toBeNull();
    const inside = m![1];
    expect(inside).toContain('<IDXImage');
    expect(inside).not.toContain('<button');
    expect(inside).not.toContain('<iframe');
    expect(inside).not.toContain('<video');
  });

  it('every interactive control is a sibling of the link, not a descendant', () => {
    // No <button>/<iframe>/<video> may appear between a <Link ...> and its </Link>.
    const linkBlocks = CODE.match(/<Link[\s\S]*?<\/Link>/g) ?? [];
    for (const block of linkBlocks) {
      expect(block).not.toMatch(/<button|<iframe|<video\s/);
    }
  });

  it('the hydration warning is NOT suppressed', () => {
    expect(CODE).not.toMatch(/suppressHydrationWarning/);
  });
});

describe('12/13. controls must not navigate', () => {
  const handlers = CODE.match(/onClick=\{\(e\)\s*=>\s*\{[^}]*\}\}/g) ?? [];

  it('every gallery/media control calls preventDefault and stopPropagation', () => {
    const navigational = handlers.filter((h) =>
      /goPrev|goNext|setOverlay/.test(h),
    );
    // prev, next, video, 3D, close = 5 controls
    expect(navigational.length).toBeGreaterThanOrEqual(5);
    for (const h of navigational) {
      expect(h).toContain('e.preventDefault()');
      expect(h).toContain('e.stopPropagation()');
    }
  });

  it('every GALLERY control is type="button" so it never submits or acts as a link', () => {
    // Scoped to the media controls this fix owns. Other buttons elsewhere in the
    // card are pre-existing and out of scope — widening this assertion would
    // drag unrelated markup into a media hotfix.
    // NB: `<button[\s\S]*?>` would stop at the `>` inside an arrow function.
    // Opening tags in this file close on their own line, so anchor on that.
    const gallery = (CODE.match(/<button\b[\s\S]*?\n\s*>/g) ?? []).filter((b) =>
      /Previous photo|Next photo|Close media and return to photos/.test(b) ||
      /setOverlay\('video'\)|setOverlay\('3d'\)/.test(b),
    );
    expect(gallery.length).toBeGreaterThanOrEqual(5);
    for (const b of gallery) expect(b).toContain('type="button"');
  });
});

describe('14. listing navigation still works', () => {
  it('the gallery links to featuredCardHref via its href prop', () => {
    expect(CODE).toMatch(/<PhotoGallery[\s\S]*?href=\{featuredCardHref\(listing\)\}/);
  });

  it('the address/title block keeps its own separate Link', () => {
    expect(CODE).toMatch(/<Link href=\{featuredCardHref\(listing\)\} className="block cursor-pointer">/);
  });
});

describe('media behaviour', () => {
  it('uses the full media model, not the photo-only helper', () => {
    expect(CODE).toContain('buildFeaturedListingMedia(listing)');
    // getValidPhotoMedia must no longer gate the featured gallery input.
    expect(CODE).not.toMatch(/getValidPhotoMedia\(listing\.media\)/);
  });

  it('does not autoplay, and mounts the player only when opened', () => {
    expect(CODE).not.toMatch(/\bautoplay\b|\bautoPlay\b/);
    // iframe/video appear only inside the `overlay &&` branch.
    expect(CODE).toMatch(/\{overlay && \(/);
  });

  it('renders controls only when real media backs them', () => {
    expect(CODE).toMatch(/\{media\.hasVideo && \(/);
    expect(CODE).toMatch(/\{media\.hasVirtualTour && \(/);
  });

  it('offers a close / back-to-photos action', () => {
    expect(CODE).toMatch(/aria-label="Close media and return to photos"/);
  });

  it('routes hosted media through toEmbedUrl', () => {
    expect(CODE).toContain('toEmbedUrl(media.videoUrl)');
    expect(CODE).toContain('toEmbedUrl(media.virtualTourUrl)');
  });

  it('preserves swipe and prev/next navigation', () => {
    expect(CODE).toContain('useSwipe(goNext, goPrev)');
    expect(CODE).toMatch(/aria-label="Previous photo"/);
    expect(CODE).toMatch(/aria-label="Next photo"/);
  });
});
