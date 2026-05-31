/// <reference types="jest" />
/**
 * (1) Video / 3D media bridge — a CRM-entered video/tour URL saved on raw_data
 *     must surface as a media entry so the detail gallery's Video / 3D tabs show.
 * (2) Canonical listing URL — Mallan exclusives must link to the ADDRESS-based
 *     canonical path (includes street+unit+city+state+zip+listing_id), with the
 *     id-only path used ONLY when the address is suppressed/unavailable.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { extractListingVideoMedia } from '../../lib/media/listing-video-media';
import { buildCanonicalListingPath } from '../../lib/listing-canonical-url';

describe('Video / 3D media bridge from raw_data', () => {
  it('surfaces a saved YouTube video URL as a Video entry (the SL-0004 case)', () => {
    const out = extractListingVideoMedia({ saleVideoUrl: 'https://youtu.be/bawq6mNSd30' });
    expect(out).toEqual([{ url: 'https://youtu.be/bawq6mNSd30', mediaType: 'Video' }]);
  });

  it('surfaces a 3D / matterport tour as a VirtualTour entry', () => {
    expect(extractListingVideoMedia({ saleMatterportUrl: 'https://my.matterport.com/show/?m=abc' }))
      .toEqual([{ url: 'https://my.matterport.com/show/?m=abc', mediaType: 'VirtualTour' }]);
    expect(extractListingVideoMedia({ VirtualTourURLUnbranded: 'https://tour.example/x' }))
      .toEqual([{ url: 'https://tour.example/x', mediaType: 'VirtualTour' }]);
  });

  it('returns both video and tour when both are stored', () => {
    const out = extractListingVideoMedia({ saleVideoUrl: 'https://youtu.be/v', saleMatterportUrl: 'https://m/x' });
    expect(out.map((m) => m.mediaType)).toEqual(['Video', 'VirtualTour']);
  });

  it('returns [] when nothing is stored / blanks (never invents)', () => {
    expect(extractListingVideoMedia({})).toEqual([]);
    expect(extractListingVideoMedia({ saleVideoUrl: '', saleMatterportUrl: '' })).toEqual([]);
    expect(extractListingVideoMedia(null)).toEqual([]);
  });

  it('the detail page wires the bridge into its media array (and the gallery reads video/virtualtour)', () => {
    const page = readFileSync(resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');
    expect(page).toMatch(/extractListingVideoMedia\(dbListing\.raw_data/);
    expect(page).toMatch(/mediaArr\.push\(\{ url: v\.url, mediaType: v\.mediaType/);
    // gallery lookup the bridge feeds
    expect(page).toMatch(/=== 'video'/);
    expect(page).toMatch(/=== 'virtualtour'/);
  });
});

describe('Canonical listing URL — address-based for exclusives, id-only only when suppressed', () => {
  const ADDR_SLUG = '333-east-46th-street-apt-2g-new-york-ny-10017-sl-0004';

  it('exclusive: builds the ADDRESS-based path (street+unit+city+state+zip + listing_id), not id-only', () => {
    const url = buildCanonicalListingPath({ slug: ADDR_SLUG, id: 'SL-0004' });
    expect(url).toBe('/listing/333-east-46th-street-apt-2g-new-york-ny-10017/sl-0004');
    expect(url).toMatch(/333-east-46th-street/); // street
    expect(url).toMatch(/apt-2g/); // unit
    expect(url).toMatch(/new-york-ny-10017/); // city/state/zip
    expect(url).toMatch(/\/sl-0004$/); // listing_id
    expect(url).not.toBe('/listing/sl-0004'); // NOT id-only
  });

  it('id-only fallback is used ONLY when the address is suppressed (slug = "listing-…")', () => {
    expect(buildCanonicalListingPath({ slug: 'listing-sl-0004', id: 'SL-0004' })).toBe('/listing/listing-sl-0004');
  });

  it('is generic — RL- exclusive gets its own address path', () => {
    const url = buildCanonicalListingPath({ slug: '150-w-80th-street-apt-4b-new-york-ny-10024-rl-0042', id: 'RL-0042' });
    expect(url).toBe('/listing/150-w-80th-street-apt-4b-new-york-ny-10024/rl-0042');
  });

  it('third-party IDX listing keeps its own address path (behavior unchanged)', () => {
    const url = buildCanonicalListingPath({ slug: '1-w-5th-ave-apt-1a-new-york-ny-10003-rls123', id: 'RLS123' });
    expect(url).toBe('/listing/1-w-5th-ave-apt-1a-new-york-ny-10003/rls123');
  });
});
