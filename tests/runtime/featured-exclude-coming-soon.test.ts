/// <reference types="jest" />
/**
 * Coming Soon Layer 1 — Featured Listings visibility gate.
 *
 * The homepage Featured section is curated hero content. It must NOT show:
 *   - Coming Soon listings (no-showings inventory), and
 *   - photoless cards (which render the grey placeholder — the production bug:
 *     345 E 81st #14B appeared on the homepage with no photo + a Coming Soon
 *     "No Showings or Open House Permitted" banner).
 *
 * This is a SEARCH/Featured status-policy fix only. It does NOT change global
 * search status policy, does not touch media backfill, and leaves the
 * UCBA Art. I §16(C) Coming Soon badge intact wherever ComingSoon IS rendered
 * (detail pages / opt-in search) — see the badge regression guard below.
 */
import {
  filterFeaturedDisplayable,
  isFeaturedDisplayable,
  hasUsableFeaturedPhoto,
} from '@/lib/featured/featured-ordering';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';
import { renderToStaticMarkup } from 'react-dom/server';

const photo = (n: number) => ({ url: `https://cdn.example.com/a/${n}.jpg`, mediaType: 'Photo', order: n });

const ACTIVE_WITH_PHOTOS = { id: 'RLS1', status: 'Active', media: [photo(0), photo(1)] };
const COMING_SOON_WITH_PHOTOS = { id: 'RLS2', status: 'ComingSoon', media: [photo(0)] };
const ACTIVE_NO_PHOTOS = { id: 'RLS3', status: 'Active', media: [] };
const ACTIVE_ONLY_FLOORPLAN = {
  id: 'RLS4', status: 'Active',
  media: [{ url: 'https://cdn.example.com/a/fp.jpg', mediaType: 'FloorPlan', order: 0 }],
};
const COMING_SOON_NO_PHOTOS = { id: 'RLS5', status: 'ComingSoon', media: [] }; // the screenshot case

describe('Featured Listings — Coming Soon + photoless exclusion', () => {
  it('excludes ComingSoon listings (even with photos)', () => {
    expect(isFeaturedDisplayable(COMING_SOON_WITH_PHOTOS)).toBe(false);
  });

  it('excludes photoless Active listings', () => {
    expect(isFeaturedDisplayable(ACTIVE_NO_PHOTOS)).toBe(false);
    expect(isFeaturedDisplayable(ACTIVE_ONLY_FLOORPLAN)).toBe(false); // floor plan is not a usable photo
  });

  it('excludes the production case: photoless ComingSoon (345 E 81st #14B)', () => {
    expect(isFeaturedDisplayable(COMING_SOON_NO_PHOTOS)).toBe(false);
  });

  it('keeps Active listings that have usable photos', () => {
    expect(isFeaturedDisplayable(ACTIVE_WITH_PHOTOS)).toBe(true);
    expect(hasUsableFeaturedPhoto(ACTIVE_WITH_PHOTOS)).toBe(true);
  });

  it('filterFeaturedDisplayable drops ComingSoon + photoless, preserves order of the rest', () => {
    const out = filterFeaturedDisplayable([
      ACTIVE_WITH_PHOTOS,
      COMING_SOON_WITH_PHOTOS,
      ACTIVE_NO_PHOTOS,
      { id: 'RLS6', status: 'Active', media: [photo(0)] },
      COMING_SOON_NO_PHOTOS,
    ]);
    expect(out.map((l) => l.id)).toEqual(['RLS1', 'RLS6']);
  });
});

describe('UCBA Coming Soon badge remains intact (regression guard)', () => {
  // Layer 1 only changes Featured *inclusion* — the mandated badge must still
  // render wherever ComingSoon IS explicitly shown (detail / opt-in search).
  it('ComingSoonBadge still renders the mandated text for a ComingSoon listing', () => {
    const html = renderToStaticMarkup(ComingSoonBadge({ status: 'ComingSoon' }));
    expect(html).toContain('Coming Soon. No Showings or Open House Permitted');
    expect(html).toContain('data-rebny-coming-soon');
  });
  it('ComingSoonBadge renders nothing for a non-ComingSoon listing', () => {
    expect(ComingSoonBadge({ status: 'Active' })).toBeNull();
  });
});
