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
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { isComingSoonStatus } from '@/lib/compliance/status';
import { getValidPhotoMedia, type ListingPhotoMedia } from '@/lib/media/listing-card-media';

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
 * Coming Soon Layer 1 (2026-06-06) — Featured displayability gate.
 *
 * The homepage Featured section is curated hero content, held to a stricter bar
 * than search. A listing is shown in Featured only when BOTH:
 *   - it is NOT Coming Soon (no-showings inventory shouldn't headline the home
 *     page — production showed a photoless Coming Soon card, 345 E 81st #14B), and
 *   - it has at least one usable public Photo (floor plans, documents, videos,
 *     and broken/placeholder URLs do NOT count — a photoless card renders the
 *     grey placeholder).
 *
 * INCLUSION gate only. It does NOT change global search status policy and does
 * NOT affect the REBNY UCBA Art. I §16(C) Coming Soon badge, which still renders
 * wherever a Coming Soon listing IS shown (detail pages / opt-in search).
 */
export interface FeaturedDisplayable {
  status?: string | null;
  media?: readonly ListingPhotoMedia[] | null;
}

/** True when the listing has ≥1 usable public Photo (uses the same
 *  `getValidPhotoMedia` gate the cards render through). */
export function hasUsableFeaturedPhoto(l: FeaturedDisplayable): boolean {
  return getValidPhotoMedia(l.media ?? null).length > 0;
}

/** Featured shows a listing only if it is not Coming Soon AND has a usable photo. */
export function isFeaturedDisplayable(l: FeaturedDisplayable): boolean {
  if (isComingSoonStatus(l.status)) return false;
  return hasUsableFeaturedPhoto(l);
}

/** Drop Coming Soon + photoless listings, preserving the order of the rest. */
export function filterFeaturedDisplayable<T extends FeaturedDisplayable>(listings: T[]): T[] {
  return listings.filter(isFeaturedDisplayable);
}

/**
 * Page through a Featured feed until enough DISPLAYABLE rows are collected to
 * fill the grid.
 *
 * Why: the homepage config sorts by `newest`, and the newest listings
 * disproportionately lack media coverage (the `listing_media` backfill gap —
 * production diagnosis 2026-06-06: 38 of the 48 newest Manhattan sale listings
 * were photoless). A single page therefore yields too few displayable rows, so
 * the section under-fills (5 cards instead of 6). Collecting across pages fills
 * the grid reliably whenever enough displayable listings exist in the feed.
 * **Interim fill-fix until media coverage is backfilled** — once the
 * coverage/denorm backfills land, the first page almost always satisfies
 * `enough` and this loop stops after one fetch.
 *
 * `fetchPage(skip, pageSize)` returns ONE raw page (already-mapped DTO rows).
 * The loop stops when:
 *  - `enough(collected)` returns true — a caller-supplied predicate that should
 *    evaluate the POST-DEDUPE ordered count (e.g. run `orderFeaturedListings`
 *    and check `.length >= limit`), NOT the raw collected length, because
 *    ordering can collapse several general rows against one Mallan exclusive;
 *  - the feed is exhausted — only an EMPTY page is a reliable signal, since the
 *    API may post-filter a page to fewer rows than requested while more exist
 *    (so `batch.length < pageSize` must NOT stop the loop); or
 *  - `maxPages` is reached.
 * Returns the accumulated DISPLAYABLE rows (Coming-Soon-free, photo-bearing),
 * in feed order.
 */
export async function collectDisplayableFeatured<T extends FeaturedDisplayable>(
  fetchPage: (skip: number, pageSize: number) => Promise<readonly T[]>,
  opts: { enough: (collected: T[]) => boolean; pageSize?: number; maxPages?: number },
): Promise<T[]> {
  const pageSize = Math.max(1, opts.pageSize ?? 48);
  const maxPages = Math.max(1, opts.maxPages ?? 5);
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(page * pageSize, pageSize);
    // Only an EMPTY page is a reliable exhaustion signal. `/api/listings`
    // post-filters a page (server-side dedupe / display gates) and can return
    // FEWER rows than requested while later pages still have results, so
    // `batch.length < pageSize` must NOT stop the loop (Codex #368).
    if (!batch || batch.length === 0) break;
    out.push(...filterFeaturedDisplayable(batch as T[]));
    // Stop on the caller's `enough` predicate — which evaluates the POST-DEDUPE
    // ordered count, not the raw collected length, because ordering can collapse
    // several general rows against one Mallan exclusive (Codex #368).
    if (opts.enough(out)) break;
  }
  return out;
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

/**
 * Build the detail-page href for a Featured card.
 *
 * Route identity is the LISTING id (`id` / ListingId), exactly like search's
 * `listingHref` — NOT the numeric Trestle ListingKey (`mlsId`). The previous
 * `buildCanonicalListingPath({ slug, id: mlsId || id })` produced
 * `/listing/{address-with-suffix}/{numeric-key}`, which the detail route cannot
 * resolve for pure-IDX rows → "Listing Not Found". Routing through the shared
 * canonical builder keeps Featured and search on one resolvable URL shape.
 * (2026-06-02; pairs with Branch A #320 case-insensitive id resolution.)
 *
 * `mlsId` is accepted (the real caller passes a full listing that carries it)
 * but deliberately NOT used for route identity — that was the bug.
 */
export function featuredCardHref(l: { slug: string; id: string; mlsId?: string }): string {
  return buildCanonicalListingPath({ slug: l.slug, id: l.id });
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
  // Address keys CLAIMED BY A MALLAN-OWNED ROW. Address-key dedupe collapses a
  // later row ONLY when a Mallan exclusive already holds that address — i.e. it
  // suppresses the IDX/RLS TWIN of a Mallan exclusive (the same physical unit
  // re-published by the feed under a different listing_id). Two pure third-party
  // rows that share an address are legitimate CO-LISTED siblings — the API keeps
  // and badges them via annotateCoListedSiblings (_coListedCount) — and must NOT
  // be collapsed here. Limiting the address collapse to Mallan-claimed keys is
  // exactly that distinction. (Codex review 2026-06-01.)
  const mallanKeys = new Set<string>();
  const out: T[] = [];

  const tryAdd = (l: T): void => {
    const ids = [l.id, l.mlsId, l.listing_id].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (ids.some((x) => seenIds.has(x))) return; // never the same listing twice (by id)
    const key = buildAddressKey(l.address ?? null);
    // Collapse ONLY against a Mallan exclusive's address — never IDX↔IDX, so
    // co-listed third-party siblings at the same address are preserved.
    if (key && mallanKeys.has(key)) return;
    ids.forEach((x) => seenIds.add(x));
    // Mallan-owned rows are added first (phases 1/1b), so claiming the key here
    // makes a later IDX twin (phases 2/3) collapse onto this exclusive.
    if (key && isMallanOwnedListing(l)) mallanKeys.add(key);
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
