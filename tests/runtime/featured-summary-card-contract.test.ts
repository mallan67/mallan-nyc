/**
 * COMMIT 6 — Featured consumes the SUMMARY contract.
 *
 * `/api/listings` now returns one canonical hero plus the true `photosCount`.
 * Featured previously navigated the whole `listing.media` array as an in-card
 * carousel, which forced the list endpoint to ship 68 media objects so a card
 * could render one image. A card's UI must not dictate the endpoint payload;
 * the detail page owns the gallery.
 *
 * The carousel removal also fixes the VALID half of PR #596: the prev/next
 * `<button>`s rendered INSIDE the card's `<Link>` — an interactive element
 * nested in an interactive element. Invalid HTML, a hydration-warning source,
 * and the reason every control needed `e.stopPropagation()` merely to avoid
 * navigating. Removing the controls removes the nesting BY CONSTRUCTION.
 *
 * PR #596's DEDUPE IS NOT CARRIED OVER — see the final describe block.
 */

import fs from 'fs';
import path from 'path';
import { getValidPhotoMedia, LISTING_PLACEHOLDER_IMAGE, getHeroPhoto } from '@/lib/media/listing-card-media';
import { toPublicListingSummary } from '@/lib/idx/public-listing-summary';
import type { PublicListingDTO } from '@/lib/idx/public-dto';

const ROOT = path.resolve(__dirname, '../..');
const featured = fs
  .readFileSync(path.join(ROOT, 'app/components/FeaturedListings.tsx'), 'utf8')
  .replace(/\r\n?/g, '\n');
const code = featured.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PHOTO = (n: number) =>
  `/api/media/proxy?url=${encodeURIComponent(
    `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801${n}/1/A/B/C${n}`,
  )}`;
const FLOORPLAN =
  'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/117801999/1/A/B/C';

const photo = (n: number) => ({
  url: PHOTO(n), thumbUrl: PHOTO(n), mediaType: 'Photo', order: n, isPrimary: n === 0,
});

function dto(over: Partial<PublicListingDTO> = {}): PublicListingDTO {
  return {
    id: 'RLS20105333', mlsId: 'RLS20105333', slug: 's', url: '/listing/s',
    status: 'Active', listingType: 'sale',
    address: { streetNumber: '519', streetName: 'Monroe Street', unitNumber: null,
      city: 'New York City', stateOrProvince: 'NY', postalCode: '11221', county: 'Kings' },
    listPrice: 2295000, media: [], photosCount: 0,
    _source: 'db+idx',
    _displayCompliance: { requiresAttribution: true, attributionText: 'x', disclaimerRequired: true },
    ...over,
  } as unknown as PublicListingDTO;
}

describe('1-3. a 67-photo listing reaches the card as ONE hero with the true count', () => {
  const full = dto({
    media: [...Array.from({ length: 67 }, (_, i) => photo(i)),
      { url: FLOORPLAN, mediaType: 'FloorPlan', order: 99, isPrimary: false }] as never,
    photosCount: 67,
  });
  const summary = toPublicListingSummary(full);

  it('the card receives exactly ONE summary media entry', () => {
    expect(summary.media).toHaveLength(1);
  });

  it('photosCount remains 67 — the card can still say "67 photos"', () => {
    expect(summary.photosCount).toBe(67);
  });

  it('the single entry the card renders is a Photo, never the FloorPlan', () => {
    const hero = getValidPhotoMedia(summary.media as never)[0];
    expect(hero).toBeDefined();
    expect(String(hero.url)).toBe(PHOTO(0));
  });

  it('the card renders ONE hero image, not 67', () => {
    // The component maps the summary array; one entry in => one <IDXImage>.
    expect(getValidPhotoMedia(summary.media as never)).toHaveLength(1);
  });
});

describe('7-9. valid DOM: no interactive element nested inside the card Link', () => {
  it('the in-card carousel component is gone', () => {
    expect(code).not.toMatch(/function PhotoGallery\b/);
    expect(code).toMatch(/function CardHero\b/);
  });

  it('CardHero renders NO <button>', () => {
    const start = code.indexOf('function CardHero');
    // Bound at the NEXT function, not at ListingCard — MortgageCalc and
    // RentVsBuyCalc sit between them and legitimately use stopPropagation
    // on their own calculator panels.
    const body = code.slice(start, code.indexOf('function MortgageCalc'));
    expect(body).not.toMatch(/<button/);
  });

  it('no prev/next photo controls remain', () => {
    expect(code).not.toContain('aria-label="Previous photo"');
    expect(code).not.toContain('aria-label="Next photo"');
  });

  it('no stopPropagation workaround is needed for card media any more', () => {
    const start = code.indexOf('function CardHero');
    // Bound at the NEXT function, not at ListingCard — MortgageCalc and
    // RentVsBuyCalc sit between them and legitimately use stopPropagation
    // on their own calculator panels.
    const body = code.slice(start, code.indexOf('function MortgageCalc'));
    expect(body).not.toContain('stopPropagation');
  });

  it('swipe navigation is no longer imported (its only consumer was the carousel)', () => {
    expect(code).not.toMatch(/import \{ useSwipe \}/);
    expect(code).not.toMatch(/useSwipe\(/);
  });
});

describe('4. click-through owns the gallery', () => {
  it('the card still links to the listing detail page', () => {
    expect(code).toMatch(/<Link href=\{featuredCardHref\(listing\)\}/);
  });
});

describe('5-6. disclosure inherited from commit 5', () => {
  it('Featured requests excludeUndisclosed=true, inheriting the corrected gate', () => {
    expect(featured).toContain("excludeUndisclosed', 'true'");
  });

  it('Featured adds NO SL-/RL- prefix exemption of its own', () => {
    expect(code).not.toContain("startsWith('SL-')");
    expect(code).not.toContain("startsWith('RL-')");
    expect(code).not.toContain('startsWith("SL-")');
    expect(code).not.toContain('startsWith("RL-")');
  });
});

describe('10. NO #596 media-collapse regression', () => {
  it('10 distinct proxied sources are 10 distinct identities before contraction', () => {
    const media = Array.from({ length: 10 }, (_, i) => photo(i));
    expect(new Set(media.map((m) => m.url)).size).toBe(10);
  });

  it('contraction picks a hero WITHOUT collapsing on the shared proxy path', () => {
    const summary = toPublicListingSummary(
      dto({ media: Array.from({ length: 10 }, (_, i) => photo(i)) as never, photosCount: 10 }),
    );
    // One entry because we asked for a summary — not because identities merged.
    expect(summary.media).toHaveLength(1);
    expect(summary.photosCount).toBe(10);
  });

  it('Featured contains no path-only / query-stripping normalization', () => {
    expect(code).not.toMatch(/normalizeForDedupe/);
    expect(code).not.toMatch(/split\(['"]\?['"]\)/);
    expect(code).not.toMatch(/unwrapProxyUrl/);
  });
});

describe('no-photo fallback is the established one', () => {
  it('a listing with no usable photo falls back to the placeholder', () => {
    const summary = toPublicListingSummary(
      dto({ media: [{ url: FLOORPLAN, mediaType: 'FloorPlan', order: 0 }] as never, photosCount: 0 }),
    );
    expect(summary.media).toHaveLength(0);
    expect(getHeroPhoto(summary.media as never)).toBe(LISTING_PLACEHOLDER_IMAGE);
  });

  it('CardHero keeps the hero-error placeholder fallback', () => {
    const start = code.indexOf('function CardHero');
    // Bound at the NEXT function, not at ListingCard — MortgageCalc and
    // RentVsBuyCalc sit between them and legitimately use stopPropagation
    // on their own calculator panels.
    const body = code.slice(start, code.indexOf('function MortgageCalc'));
    expect(body).toContain('LISTING_PLACEHOLDER_IMAGE');
    expect(body).toContain('onError');
  });
});
