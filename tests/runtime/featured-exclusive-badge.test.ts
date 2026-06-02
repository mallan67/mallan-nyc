/// <reference types="jest" />
/**
 * Homepage "Featured Listings" — Mallan-owned exclusives lead the mixed
 * section and carry an accurate "Mallan Exclusive" badge (never an RLS /
 * syndication claim), while pinned third-party IDX/RLS rows keep the
 * "Featured" badge. Heading stays "Featured Listings".
 *
 * Pure-helper coverage (no DOM render needed) + a couple of source-coupling
 * guards on the component.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  orderFeaturedListings,
  featuredBadgeFor,
  isMallanOwnedListing,
  isPinnedFeatured,
  MALLAN_EXCLUSIVE_BADGE_TEXT,
  MALLAN_EXCLUSIVE_BADGE_TITLE,
  RLS_FEATURED_BADGE_TEXT,
  RLS_FEATURED_BADGE_TITLE,
} from '../../lib/featured/featured-ordering';

const componentSrc = readFileSync(
  resolve(__dirname, '../../app/components/FeaturedListings.tsx'),
  'utf8',
);

const addr = (unit: string, num = '100', street = 'Sample Street', zip = '10000') => ({
  streetNumber: num,
  streetName: street,
  unitNumber: unit,
  postalCode: zip,
});

describe('1. Heading stays "Featured Listings"', () => {
  it('the <h2> reads "Featured Listings" and is NOT renamed to Mallan Exclusives', () => {
    expect(componentSrc).toMatch(/<h2[^>]*>Featured Listings<\/h2>/);
    expect(componentSrc).not.toMatch(/<h2[^>]*>Mallan Exclusives<\/h2>/);
  });
});

describe('2 & ordering. Mallan-owned exclusives render FIRST', () => {
  it('multiple Mallan exclusives lead, in their feed order, before pinned and regular', () => {
    const exclusives = [
      { id: 'SL-1', _source: 'exclusive', address: addr('1A') },
      { id: 'RL-2', _source: 'exclusive', address: addr('2B') },
    ];
    const general = [
      { id: 'RLS-pinned', _source: 'db+idx', address: addr('9Z') },
      { id: 'RLS-regular', _source: 'db+idx', address: addr('8Y') },
    ];
    const out = orderFeaturedListings(exclusives, general, new Set(['RLS-pinned']), 6);
    expect(out.map((l) => l.id)).toEqual(['SL-1', 'RL-2', 'RLS-pinned', 'RLS-regular']);
  });

  it('a Mallan-owned row that surfaced only in the GENERAL feed still leads', () => {
    const out = orderFeaturedListings(
      [],
      [
        { id: 'RLS-regular', _source: 'db+idx', address: addr('8Y') },
        { id: 'SL-only-general', _source: 'exclusive', address: addr('3C') },
      ],
      new Set(),
      6,
    );
    expect(out[0].id).toBe('SL-only-general');
  });

  it('pinned IDX appears after ALL Mallan exclusives; regular IDX appears after pinned', () => {
    const out = orderFeaturedListings(
      [{ id: 'SL-1', _source: 'exclusive', address: addr('1A') }],
      [
        { id: 'RLS-regular', _source: 'db+idx', address: addr('8Y') },
        { id: 'RLS-pinned', _source: 'db+idx', address: addr('9Z') },
      ],
      new Set(['RLS-pinned']),
      6,
    );
    expect(out.map((l) => l.id)).toEqual(['SL-1', 'RLS-pinned', 'RLS-regular']);
  });
});

describe('3 & 4. Mallan exclusive badge: text + compliant tooltip', () => {
  const excl = { id: 'SL-9', _source: 'exclusive' };
  it('shows the "Mallan Exclusive" badge', () => {
    expect(featuredBadgeFor(excl, false)).toEqual({
      kind: 'exclusive',
      text: MALLAN_EXCLUSIVE_BADGE_TEXT,
      title: MALLAN_EXCLUSIVE_BADGE_TITLE,
    });
    expect(MALLAN_EXCLUSIVE_BADGE_TEXT).toBe('Mallan Exclusive');
  });

  it('the exclusive tooltip NEVER claims REBNY RLS listing or syndication', () => {
    const title = featuredBadgeFor(excl, false)!.title;
    expect(title).not.toMatch(/REBNY RLS/i);
    expect(title).not.toMatch(/syndicat/i);
    expect(title).toBe('Exclusive listing by Mallan Real Estate Inc.');
  });

  it('classification works by _source OR SL-/RL- id prefix (no hardcoded id)', () => {
    expect(isMallanOwnedListing({ id: 'SL-123' })).toBe(true);
    expect(isMallanOwnedListing({ id: '7', listing_id: 'RL-5' })).toBe(true);
    expect(isMallanOwnedListing({ id: '7', _source: 'exclusive' })).toBe(true);
    expect(isMallanOwnedListing({ id: 'RLS123', _source: 'db+idx' })).toBe(false);
  });
});

describe('5. Pinned third-party IDX/RLS keeps the accurate "Featured" badge', () => {
  it('pinned non-exclusive shows "Featured" with the RLS tooltip', () => {
    expect(featuredBadgeFor({ id: 'RLS1', _source: 'db+idx' }, true)).toEqual({
      kind: 'rls',
      text: RLS_FEATURED_BADGE_TEXT,
      title: RLS_FEATURED_BADGE_TITLE,
    });
    expect(RLS_FEATURED_BADGE_TITLE).toMatch(/REBNY RLS/);
  });

  it('a non-pinned, non-exclusive regular IDX listing gets NO badge', () => {
    expect(featuredBadgeFor({ id: 'RLS1', _source: 'db+idx' }, false)).toBeNull();
  });
});

describe('6. Pinned Mallan exclusive — appears ONCE, single (exclusive) badge', () => {
  it('exclusive precedence: a pinned exclusive shows the exclusive badge, not the RLS one', () => {
    const excl = { id: 'SL-7', _source: 'exclusive' };
    const badge = featuredBadgeFor(excl, /* pinned */ true);
    expect(badge!.kind).toBe('exclusive');
    expect(badge!.text).toBe('Mallan Exclusive');
    expect(badge!.title).not.toMatch(/syndicat|REBNY RLS/i);
  });

  it('a pinned exclusive is not duplicated in the order', () => {
    const out = orderFeaturedListings(
      [{ id: 'SL-7', _source: 'exclusive', address: addr('1A') }],
      [{ id: 'SL-7', _source: 'exclusive', address: addr('1A') }],
      new Set(['SL-7']),
      6,
    );
    expect(out.filter((l) => l.id === 'SL-7')).toHaveLength(1);
  });
});

describe('dedupe. CRM exclusive collapses its RLS/IDX twin (same address+unit)', () => {
  it('keeps the SL- exclusive, drops the RLS twin; no listing twice', () => {
    const out = orderFeaturedListings(
      [{ id: 'SL-1', _source: 'exclusive', address: addr('5A') }],
      [{ id: 'RLS-twin', _source: 'db+idx', address: addr('5A') }],
      new Set(),
      6,
    );
    expect(out.map((l) => l.id)).toEqual(['SL-1']);
  });

  it('does NOT collapse genuinely different units', () => {
    const out = orderFeaturedListings(
      [{ id: 'SL-1', _source: 'exclusive', address: addr('5A') }],
      [{ id: 'RLS-other', _source: 'db+idx', address: addr('6B') }],
      new Set(),
      6,
    );
    expect(out.map((l) => l.id)).toEqual(['SL-1', 'RLS-other']);
  });
});

describe('7. Third-party attribution remains compliant in the component', () => {
  it('non-exclusive cards still render the RLS courtesy attribution line', () => {
    expect(componentSrc).toMatch(/RLS · Listing Courtesy of/);
  });

  it('exclusive cards use the exclusive attribution text', () => {
    expect(componentSrc).toMatch(/listing\._source === 'exclusive'/);
    expect(componentSrc).toMatch(/_displayCompliance\?\.attributionText/);
  });

  it('the badge no longer hardcodes the RLS/syndication tooltip in the component (it comes from featuredBadgeFor)', () => {
    // The component renders `title={badge.title}`, not a literal RLS string.
    expect(componentSrc).toMatch(/title=\{badge\.title\}/);
    expect(componentSrc).not.toMatch(/title="Featured listing — listed on REBNY RLS/);
  });
});

describe('isPinnedFeatured — all-three id matcher', () => {
  it('matches by id, mlsId, or listing_id', () => {
    const l = { id: '42', mlsId: 'RLS90001', listing_id: 'SL-9001' };
    expect(isPinnedFeatured(l, new Set(['42']))).toBe(true);
    expect(isPinnedFeatured(l, new Set(['RLS90001']))).toBe(true);
    expect(isPinnedFeatured(l, new Set(['SL-9001']))).toBe(true);
    expect(isPinnedFeatured(l, new Set(['x']))).toBe(false);
  });
});
