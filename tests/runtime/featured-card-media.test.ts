/**
 * The Featured Listings section of the home page: which listings it draws (those whose photo can be shown) and what its cards say about a listing's video and 3D tour.
 *
 * Reported 2026-10-08: "there are still photo issues in featured listing section of the home page, there are no videos or virtual tours". The section is a client component with
 * state, which this test environment does not render; its wiring is pinned the way the neighbouring Featured contract tests pin it (featured-summary-card-contract.test.ts):
 * by what the component source says. The parts it wires are tested directly: the photo check (featured-hero-check.test.ts), the ordering (featured-exclusive-badge.test.ts), and the
 * predicates a card's tour and video badge are keyed on (search-card-virtual-tour-badge.test.ts), plus the one the list endpoint's summary has to keep (below).
 */

import fs from 'fs';
import path from 'path';
import { toPublicListingSummary } from '@/lib/idx/public-listing-summary';
import type { PublicListingDTO } from '@/lib/idx/public-dto';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const featured = stripComments(read('app/components/FeaturedListings.tsx'));
const between = (src: string, from: string, to: string) => {
  const start = src.indexOf(from);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(to, start + from.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};
const fetchBody = between(featured, 'async function fetchFeatured()', 'fetchFeatured();');
const hero = between(featured, 'function CardHero', 'function MortgageCalc');
const card = between(featured, 'function ListingCard', 'function SkeletonCard');

describe('Featured draws the listings whose photo can be shown', () => {
  it('imports the photo check and the rule for who is never passed over', () => {
    expect(featured).toMatch(/import \{\s*checkHeroUrl,\s*featuredHeroUrl,\s*selectFeaturedWithWorkingHeroes,\s*\} from '@\/lib\/featured\/featured-hero-check';/);
    expect(featured).toMatch(/import \{[^}]*\bisMallanOwnedListing\b[^}]*\} from '@\/lib\/featured\/featured-ordering';/);
  });

  it('looks at more candidates than there are places: three for each place, in the section\'s own order', () => {
    expect(featured).toContain('const CANDIDATES_PER_PLACE = 3;');
    expect(fetchBody).toContain('const candidates = orderFeaturedListings(exclusives, generalListings, pinnedSet, limit * CANDIDATES_PER_PLACE);');
  });

  it('draws the first `limit` candidates whose photo works, asking about the photo the card would show, and passing over neither a Mallan-owned nor a pinned listing', () => {
    expect(fetchBody).toContain('const featured = await selectFeaturedWithWorkingHeroes(');
    expect(fetchBody).toMatch(/selectFeaturedWithWorkingHeroes\(\s*candidates,\s*limit,\s*\(l\) => checkHeroUrl\(featuredHeroUrl\(l\)\),\s*\(l\) => isMallanOwnedListing\(l\) \|\| isPinnedFeatured\(l, pinnedSet\),\s*\);/);
  });

  it('shows what was drawn, and nothing the old plain ordering would have cut to `limit`', () => {
    expect(fetchBody).toContain('setListings(featured);');
    expect(fetchBody).not.toMatch(/orderFeaturedListings\(exclusives, generalListings, pinnedSet, limit\)/);
  });

  it('shows what was drawn only while the section is still on the page, and ends the loading the same way (a section that has gone must not be set)', () => {
    expect(fetchBody).toMatch(/if \(!cancelled\) \{\s*setListings\(featured\);\s*setPinnedIds\(pinnedSet\);/);
    expect(fetchBody).toMatch(/finally \{\s*if \(!cancelled\) setLoading\(false\);\s*\}/);
    expect(fetchBody).toMatch(/if \(cancelled \|\| \(generalListings\.length === 0 && exclusives\.length === 0\)\) return;/);
  });

  it('pages the feed until there is one spare candidate for each place (two for each place), not only until the places are full', () => {
    expect(fetchBody).toContain('orderFeaturedListings(exclusives, collected, pinnedSet, limit * 2).length >= limit * 2');
  });

  it('keeps the established gates: Coming Soon and photoless listings are dropped before the check, and the exclusives feed is asked first', () => {
    expect(fetchBody).toContain('filterFeaturedDisplayable<FeaturedListing>(exclData.listings || [])');
    expect(fetchBody).toContain('collectDisplayableFeatured<FeaturedListing>(');
    expect(fetchBody.indexOf('const exclusives')).toBeLessThan(fetchBody.indexOf('collectDisplayableFeatured'));
    expect(fetchBody.indexOf('collectDisplayableFeatured')).toBeLessThan(fetchBody.indexOf('const candidates'));
    expect(fetchBody.indexOf('const candidates')).toBeLessThan(fetchBody.indexOf('selectFeaturedWithWorkingHeroes('));
  });
});

describe('Featured cards say when a listing has a video or a 3D tour', () => {
  it('a Featured listing carries its tour and video links (the list endpoint keeps them)', () => {
    expect(featured).toMatch(/interface FeaturedListing \{[\s\S]*?virtualTourURL\?: string;\s*videoUrl\?: string;[\s\S]*?\n\}/);
  });

  it('the card asks the same predicates the search cards ask (the Property fields, not the photo list)', () => {
    expect(featured).toContain("import { hasVirtualTour, hasVideo } from '@/lib/idx/display-adapter';");
    expect(card).toContain('showTour={hasVirtualTour(listing)}');
    expect(card).toContain('showVideo={hasVideo(listing)}');
  });

  it('the hero says them whatever the photo does: not only while a photo is showing', () => {
    expect(hero).toContain('{(showVideo || showTour || shouldShowPhotoCount(photosCount, heroShown)) && (');
    expect(hero).toContain('{showVideo && <MediaBadge kind="video" />}');
    expect(hero).toContain('{showTour && <MediaBadge kind="tour" />}');
    expect(hero).toMatch(/showTour\?: boolean;\s*showVideo\?: boolean;/);
  });

  it('the badges are labelled "Video" and "3D Tour" for what they say, and for screen readers', () => {
    const badge = between(featured, 'function MediaBadge', 'function MortgageCalc').split('function MortgageCalc')[0];
    expect(badge).toContain("aria-label={kind === 'video' ? 'Video available' : '3D tour available'}");
    expect(badge).toContain("{kind === 'video' ? 'Video' : '3D Tour'}");
    expect(badge).toContain('aria-hidden="true"');
  });

  it('the badges are plain text, not controls (no interactive element inside the card\'s Link)', () => {
    const badge = between(featured, 'function MediaBadge', 'function MortgageCalc');
    expect(badge).not.toMatch(/<button|<a\b|onClick|<Link/);
  });

  it('the badges and the count share one corner (bottom right), clear of the open-house banner (bottom left)', () => {
    expect(hero).toContain('<div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-20">');
    expect(card).toContain('className="absolute bottom-3 left-3 z-30"');
  });
});

describe('the list endpoint\'s summary keeps a listing\'s tour and video links (the card reads them from it)', () => {
  const dto = (over: Record<string, unknown>): PublicListingDTO => ({
    id: 'RLS20105333', mlsId: 'RLS20105333', slug: 's', url: '/listing/s', status: 'Active', listingType: 'sale',
    address: { streetNumber: '519', streetName: 'Monroe Street', unitNumber: null, city: 'New York City', stateOrProvince: 'NY', postalCode: '11221', county: 'Kings' },
    listPrice: 2295000, media: [], photosCount: 12, _source: 'db+idx',
    _displayCompliance: { requiresAttribution: true, attributionText: 'x', disclaimerRequired: true },
    ...over,
  } as unknown as PublicListingDTO);

  it('passes virtualTourURL and videoUrl through untouched, whatever the photo list holds', () => {
    const summary = toPublicListingSummary(dto({
      virtualTourURL: 'https://my.matterport.com/show/?m=abc',
      videoUrl: 'https://www.youtube.com/watch?v=RM4ef1CIo2k',
      media: [{ url: '/api/media/proxy?url=x', mediaType: 'Photo', order: 0, isPrimary: true }],
    }));
    expect((summary as unknown as { virtualTourURL: string }).virtualTourURL).toBe('https://my.matterport.com/show/?m=abc');
    expect((summary as unknown as { videoUrl: string }).videoUrl).toBe('https://www.youtube.com/watch?v=RM4ef1CIo2k');
    expect(summary.photosCount).toBe(12);
  });

  it('keeps them for a listing with no photo at all (the tour and the video are not the photo)', () => {
    const summary = toPublicListingSummary(dto({ virtualTourURL: 'https://my.matterport.com/show/?m=abc', videoUrl: 'https://vimeo.com/123456789', media: [] }));
    expect(summary.media).toHaveLength(0);
    expect((summary as unknown as { virtualTourURL: string }).virtualTourURL).toBe('https://my.matterport.com/show/?m=abc');
    expect((summary as unknown as { videoUrl: string }).videoUrl).toBe('https://vimeo.com/123456789');
  });
});
