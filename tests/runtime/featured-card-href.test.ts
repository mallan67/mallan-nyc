/// <reference types="jest" />
/**
 * Branch B (#318) — Featured card href.
 *
 * The Featured homepage card MUST build its detail link with the same canonical
 * builder search uses (route identity = `listing.id` / ListingId), NOT the
 * numeric Trestle ListingKey (`mlsId`). Passing `mlsId` produced
 * `/listing/{address-WITH-suffix}/{numeric-key}`, which is unresolvable for IDX
 * rows ("Listing Not Found"). See the 2026-06-02 audit + Branch A (#320) which
 * makes the canonical id segment resolve case-insensitively.
 *
 * Proves the href:
 *   1. pure IDX listing            → /listing/{address}/{rls-id}, no ListingKey
 *   2. Mallan exclusive (SL-/RL-)  → /listing/{address}/{sl-id}
 *   3. UCBA-suppressed slug        → /listing/listing-{id} (single segment)
 *   4. co-listed siblings          → distinct hrefs per listing_id (not collapsed)
 */

import { featuredCardHref } from '@/lib/featured/featured-ordering';

describe('featuredCardHref — canonical detail link by ListingId (not ListingKey)', () => {
  it('pure IDX: uses the rls listing id, never the numeric mlsId/ListingKey', () => {
    const href = featuredCardHref({
      slug: '217-w-57th-street-apt-127-128-new-york-city-ny-10019-rls20059088',
      id: 'RLS20059088',
      mlsId: '1146011469',
    });
    expect(href).toBe('/listing/217-w-57th-street-apt-127-128-new-york-city-ny-10019/rls20059088');
    expect(href).not.toContain('1146011469'); // the numeric ListingKey must NOT be the route id
  });

  it('Mallan exclusive (SL-): strips the id suffix to the clean two-segment form', () => {
    const href = featuredCardHref({
      slug: '333-east-46th-street-2g-sl-0004',
      id: 'SL-0004',
      mlsId: 'SL-0004',
    });
    expect(href).toBe('/listing/333-east-46th-street-2g/sl-0004');
  });

  it('UCBA-suppressed listing: keeps the single-segment listing-xxx canonical', () => {
    const href = featuredCardHref({
      slug: 'listing-rls20061539',
      id: 'RLS20061539',
      mlsId: '1147174284',
    });
    expect(href).toBe('/listing/listing-rls20061539');
    expect(href).not.toContain('1147174284');
  });

  it('co-listed siblings at one address resolve to DISTINCT hrefs (not collapsed)', () => {
    const slug = '50-w-66th-street-apt-62-new-york-city-ny-10023';
    const a = featuredCardHref({ slug: `${slug}-rls20061539`, id: 'RLS20061539', mlsId: '1147174284' });
    const b = featuredCardHref({ slug: `${slug}-rls10956475`, id: 'RLS10956475', mlsId: '1100000001' });
    expect(a).toBe(`/listing/${slug}/rls20061539`);
    expect(b).toBe(`/listing/${slug}/rls10956475`);
    expect(a).not.toBe(b);
  });
});
