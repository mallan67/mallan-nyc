/**
 * Single source of truth for building canonical listing URLs.
 *
 * Canonical shape:
 *   - Address-displayable: /listing/{address-slug}/{listing-id-lower}
 *   - UCBA-suppressed:     /listing/listing-{listing-id-lower}
 *
 * Strips the legacy `-{id}` hybrid suffix from the slug so we always emit
 * two clean path segments for the address-displayable form.
 *
 * @module lib/listing-canonical-url
 */

interface ListingForCanonicalUrl {
  /** The slug field from PublicListingDTO. May be hybrid (`address-XXX-sl-NNN`)
   *  or generic (`listing-XXX`) depending on listing state. */
  slug: string;
  /** The listing id (e.g. `SL-0004`, `RBNY-123`, `RLS20061539`). */
  id: string;
}

/**
 * Build the canonical path for a listing. Use this everywhere — search
 * cards, FeaturedListings, sitemap, share buttons, the CRM URL builder.
 */
export function buildCanonicalListingPath(listing: ListingForCanonicalUrl): string {
  const slug = listing.slug || '';
  const id = listing.id || '';

  // UCBA-suppressed listings: slug is `listing-XXX` — that IS canonical.
  if (slug.startsWith('listing-')) return `/listing/${slug}`;

  if (!id) return `/listing/${slug}`;

  // Strip any legacy hybrid suffix `-{id}` so we emit clean two-segment form.
  const idLower = id.toLowerCase();
  const slugLower = slug.toLowerCase();
  const hybridSuffix = `-${idLower}`;
  const addressSlug = slugLower.endsWith(hybridSuffix)
    ? slug.slice(0, slug.length - hybridSuffix.length)
    : slug;

  return `/listing/${addressSlug}/${idLower}`;
}

/**
 * REBNY / CRM listing-id shapes that appear as a canonical URL's trailing
 * segment. `buildCanonicalListingPath` LOWERCASES the id (`rls20059088`,
 * `sl-0004`), but the stored id is UPPERCASE and every id lookup is
 * case-SENSITIVE:
 *   - Trestle OData `ListingId eq 'RLS20059088'`
 *   - Prisma `findUnique({ where: { listing_id: 'SL-0004' }})`
 *   - `/api/listings/{id}` (delegates to the two above)
 * Bounded to the known prefixes so an address slug, a UCBA-suppressed
 * `listing-xxx` slug, or a numeric Trestle ListingKey is NEVER altered.
 */
const LISTING_ID_SEGMENT = /^(rls|rbny|sl|rl)-?\d+$/i;

/**
 * True when a slug segment IS a bare listing id (`rls20061539`, `SL-0004`) rather than an address
 * slug or an MLS-ID (`listing-…`) form.
 *
 * Exported for the listing-detail persistent Data Cache key: the canonical two-segment URL
 * `/listing/<address-slug>/<ID>` collapses to a BARE id, and `extractListingIdFromSlug` only matches
 * an id as the SUFFIX of a longer slug — so it returns null for that dominant shape. Without this
 * predicate the most common URL form would silently bypass the cache.
 */
export function isBareListingIdSegment(segment: string): boolean {
  return LISTING_ID_SEGMENT.test(segment);
}

/**
 * Restore the stored uppercase casing of a listing id when (and only when) the
 * value is a recognizable REBNY/CRM listing id. Anything else — address slugs,
 * `listing-xxx` suppressed slugs, numeric ListingKeys — is returned verbatim.
 *
 * This is the fix for the 2026-06-02 sitewide P0 where the canonical
 * `/listing/{address}/rls20059088` 404'd because the lowercased id never
 * matched the case-sensitive Trestle/Prisma lookups. (See the dated audit.)
 */
export function normalizeListingIdCase(id: string): string {
  return LISTING_ID_SEGMENT.test(id) ? id.toUpperCase() : id;
}

/**
 * Inverse of `buildCanonicalListingPath`: collapse the catch-all `[...slug]`
 * segments back into the single lookup key the detail route + `/api/listings`
 * feed to the resolver.
 *
 * Shapes handled:
 *   ['333-east-...', 'sl-0004']                  → 'SL-0004'   (canonical 2-seg)
 *   ['333-east-...-sl-0004']                     → unchanged   (legacy hybrid;
 *                                                  resolved downstream via the
 *                                                  embedded-id extractor)
 *   ['listing-rls20061539']                      → unchanged   (UCBA-suppressed)
 *   ['400-east-90th-...']                        → unchanged   (legacy address-only)
 *   ['rls20059088']                              → 'RLS20059088' (raw id)
 *
 * The trailing segment is run through `normalizeListingIdCase`, so a canonical
 * two-segment id (always the LAST segment) or a bare raw id is restored to its
 * stored uppercase form before lookup. Multi-word slugs (address forms) and the
 * `listing-xxx` form do not match the id pattern and pass through untouched.
 */
export function resolveLookupKey(slug: string[] | string | undefined): string {
  // Next.js catch-all returns string[]; normalize defensively.
  const parts = Array.isArray(slug) ? slug : slug ? [slug] : [];
  if (parts.length === 0) return '';
  return normalizeListingIdCase(parts[parts.length - 1]);
}
