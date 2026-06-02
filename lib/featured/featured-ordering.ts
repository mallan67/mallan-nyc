/**
 * Homepage "Featured Listings" ordering + badge rules.
 *
 * The homepage Featured section is a MIXED surface: Mallan-owned exclusives
 * shown alongside pinned and regular third-party IDX/RLS listings. The
 * section heading therefore stays "Featured Listings" (titling it
 * "Mallan Exclusives" would misrepresent the third-party rows — NY DOS §175 /
 * REBNY advertising). Within it:
 *
 *   1. ALL Mallan-owned listings / exclusives first — by classification/source
 *      (`_source === 'exclusive'` OR an SL-/RL- CRM id prefix), NOT by the
 *      broker's `pinnedListingIds`. This guarantees a Mallan exclusive leads
 *      even when it was never manually pinned.
 *   2. Then pinned configured listings (IDX/RLS) not already included.
 *   3. Then the regular featured / IDX listings.
 *
 * Dedupe collapses a Mallan CRM exclusive and its Trestle/IDX twin (same
 * physical unit, different `listing_id`) to the single CRM row — reusing the
 * canonical `buildAddressKey` so "333 East 46th St" and "333 E 46th St"
 * collapse. The exclusive is added first, so it always wins the collapse.
 *
 * Badge rules (see `featuredBadgeFor`):
 *   - Mallan-owned exclusive → "Mallan Exclusive" with an accurate tooltip
 *     that NEVER claims REBNY RLS listing / syndication (a website-only
 *     exclusive is not on RLS — that claim would violate NY DOS §175.25 /
 *     UCBA). One badge only, even when the exclusive is also manually pinned.
 *   - Pinned third-party IDX/RLS → keeps the "Featured" badge + RLS tooltip
 *     (accurate: those rows ARE REBNY-RLS-sourced).
 *   - Everything else → no badge.
 *
 * Pure + framework-free so the ordering and badge logic are unit-testable
 * without rendering the client component.
 *
 * @module lib/featured/featured-ordering
 */

import { buildAddressKey, type DedupeAddressLike } from '@/lib/listings/dedupe-crm-vs-idx';

/** Minimal shape the ordering/badge helpers read off a featured listing. */
export interface FeaturedOrderable {
  id: string;
  mlsId?: string;
  listing_id?: string;
  _source?: string;
  address?: DedupeAddressLike | null;
  _displayCompliance?: { attributionText?: string };
}

const CRM_ID_PREFIX = /^(SL|RL)-/i;

/**
 * A row is Mallan-owned (exclusive) when the public DTO classified it as
 * `_source: 'exclusive'` (covers mallan-exclusive AND website-only) OR any of
 * its identifiers carries the SL-/RL- CRM prefix. The prefix is the definitive
 * CRM-authored signal and is checked on id / mlsId / listing_id so the match
 * holds whichever identifier the feed surfaced.
 */
export function isMallanOwnedListing(l: Pick<FeaturedOrderable, '_source' | 'id' | 'mlsId' | 'listing_id'>): boolean {
  if (l._source === 'exclusive') return true;
  return [l.listing_id, l.id, l.mlsId].some((x) => typeof x === 'string' && CRM_ID_PREFIX.test(x));
}

/**
 * Pin match — a listing is pinned when the broker's pinned-id set contains
 * ANY of its identifiers (public `id`, `mlsId`, or explicit `listing_id`), so
 * a broker can pin by whichever identifier they have on hand.
 */
export function isPinnedFeatured(l: Pick<FeaturedOrderable, 'id' | 'mlsId' | 'listing_id'>, pinnedSet: Set<string>): boolean {
  return (
    pinnedSet.has(l.id) ||
    (l.mlsId != null && pinnedSet.has(l.mlsId)) ||
    (l.listing_id != null && pinnedSet.has(l.listing_id))
  );
}

export type FeaturedBadgeKind = 'exclusive' | 'rls';

export interface FeaturedBadge {
  kind: FeaturedBadgeKind;
  text: string;
  /** Goes on the badge `title`/tooltip. Must be accurate for the row's source. */
  title: string;
}

/** Exact, compliance-safe badge copy. Exported so tests pin the strings. */
export const MALLAN_EXCLUSIVE_BADGE_TEXT = 'Mallan Exclusive';
export const MALLAN_EXCLUSIVE_BADGE_TITLE = 'Exclusive listing by Mallan Real Estate Inc.';
export const RLS_FEATURED_BADGE_TEXT = 'Featured';
export const RLS_FEATURED_BADGE_TITLE = 'Featured listing — listed on REBNY RLS and syndicated to all major platforms';

/**
 * Resolve the single badge to render for a featured card.
 *
 * Mallan-owned takes precedence over pinned, so an exclusive that is ALSO
 * manually pinned shows exactly ONE badge ("Mallan Exclusive") — never the
 * RLS/syndication badge, and never two badges. The exclusive title is a fixed
 * Mallan-attribution string (not derived from feed data) so it can never
 * accidentally surface an RLS/syndication claim for a website-only exclusive.
 */
export function featuredBadgeFor(
  l: Pick<FeaturedOrderable, '_source' | 'id' | 'mlsId' | 'listing_id'>,
  pinned: boolean,
): FeaturedBadge | null {
  if (isMallanOwnedListing(l)) {
    return { kind: 'exclusive', text: MALLAN_EXCLUSIVE_BADGE_TEXT, title: MALLAN_EXCLUSIVE_BADGE_TITLE };
  }
  if (pinned) {
    return { kind: 'rls', text: RLS_FEATURED_BADGE_TEXT, title: RLS_FEATURED_BADGE_TITLE };
  }
  return null;
}

/**
 * Build the homepage featured list in the required order:
 *   1. Mallan-owned exclusives (from the exclusives feed AND any that appear
 *      in the general feed), in feed order.
 *   2. Pinned third-party listings not already included.
 *   3. Regular listings.
 *
 * Dedupe is by identifier AND by canonical address key, so a Mallan CRM
 * exclusive collapses its RLS/IDX twin (the exclusive, added first, wins) and
 * no listing ever appears twice. Result is capped to `limit`.
 */
export function orderFeaturedListings<T extends FeaturedOrderable>(
  exclusives: T[],
  general: T[],
  pinnedSet: Set<string>,
  limit: number,
): T[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const out: T[] = [];

  const tryAdd = (l: T): void => {
    const ids = [l.id, l.mlsId, l.listing_id].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (ids.some((x) => seenIds.has(x))) return;
    const key = buildAddressKey(l.address ?? null);
    if (key && seenKeys.has(key)) return; // collapse duplicate physical unit (CRM row already kept)
    ids.forEach((x) => seenIds.add(x));
    if (key) seenKeys.add(key);
    out.push(l);
  };

  // 1. Mallan-owned exclusives first — from the dedicated exclusives feed…
  for (const l of exclusives) if (isMallanOwnedListing(l)) tryAdd(l);
  // …and any Mallan-owned row that surfaced only in the general feed.
  for (const l of general) if (isMallanOwnedListing(l)) tryAdd(l);
  // 2. Pinned third-party (IDX/RLS) listings not already included.
  for (const l of general) if (!isMallanOwnedListing(l) && isPinnedFeatured(l, pinnedSet)) tryAdd(l);
  // 3. Regular listings.
  for (const l of general) if (!isMallanOwnedListing(l) && !isPinnedFeatured(l, pinnedSet)) tryAdd(l);

  return out.slice(0, limit);
}
