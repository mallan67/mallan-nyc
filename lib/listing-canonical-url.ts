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
