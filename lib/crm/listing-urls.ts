/**
 * Build public-facing URLs for CRM listings.
 *
 * @module lib/crm/listing-urls
 */

import { generateListingSlug } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { decideDbPublicAddress } from '@/lib/compliance/db-address-decision';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mallan.nyc';

/**
 * Facts required to decide whether this listing's address may appear publicly.
 *
 * `rls_eligible` and `internet_entire_listing_display_yn` were previously
 * ABSENT, so this helper could not tell website-only inventory from RLS-backed
 * inventory and fell back to `internet_address_display_yn !== false` — which
 * treats null/undefined as ADDRESS-VISIBLE. That is fail-OPEN for a DB row:
 * `lib/compliance/gates.ts:166-171` states DB-row callers leave
 * `idxPlusPreFiltered` false so null fails CLOSED.
 */
interface ListingForUrl {
  listing_id: string;
  status: string;
  address: Record<string, unknown> | null;
  /** `false` = website-only (non-RLS). Anything else is treated as RLS-backed. */
  rls_eligible?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  internet_address_display_yn?: boolean | null;
}

/**
 * Mallan's own canonical URLs for a listing.
 *
 * `realPlusUrl` USED TO BE RETURNED HERE AND IS GONE. It was not a provider URL
 * at all — the implementation was literally
 *
 *     const realPlusUrl = isActive ? publicUrl : null;
 *
 * i.e. Mallan's own public URL under a foreign provider's name, wired through
 * the CRM write DTOs and rendered in the sale form as a "RealPlus URL" panel.
 * Cotality is this architecture's only provider authority, so a parallel
 * provider concept in an executable contract is drift twice over: the name was
 * forbidden AND it described the wrong thing.
 *
 * It is NOT renamed to a Cotality URL, because no verified Cotality URL is
 * represented by this value. It is Mallan's public canonical URL, so it is
 * called publicUrl and nothing else.
 *
 * `publicActiveUrl` replaces the one real behaviour the old field carried: the
 * same URL, exposed only when the listing is publicly live. Callers that need
 * "the URL to hand out right now" use that; callers that need "where this
 * listing lives" use publicUrl.
 */
export function buildListingUrls(listing: ListingForUrl): {
  publicUrl: string | null;
  publicActiveUrl: string | null;
} {
  const addr = (listing.address || {}) as Record<string, string>;
  const isActive = listing.status === 'Active' || listing.status === 'ComingSoon' || listing.status === 'ActiveUnderContract';

  // ONE canonical decision drives both the slug input and the address fields
  // fed into it — so a suppressed address can never leak through the URL.
  const { addressDisplayable } = decideDbPublicAddress(listing);

  const slug = generateListingSlug({
    address: {
      streetNumber: addressDisplayable ? addr.StreetNumber || '' : '',
      streetDirPrefix: addressDisplayable ? addr.StreetDirPrefix || '' : '',
      streetName: addressDisplayable
        ? [addr.StreetName, addr.StreetSuffix, addr.StreetDirSuffix].filter(Boolean).join(' ')
        : 'Address Undisclosed',
      unitNumber: addressDisplayable ? addr.UnitNumber || null : null,
      city: addr.City || 'New York',
      stateOrProvince: addr.StateOrProvince || 'NY',
      postalCode: addr.PostalCode || '',
    },
    id: listing.listing_id,
    mlsId: listing.listing_id,
    internetAddressDisplayYN: addressDisplayable,
  });

  // Canonical URL guard: a published CRM listing with displayable address
  // must NEVER expose a generic `listing-XXX` URL publicly. If we got one,
  // return null for both URLs so the form shows "URL pending" instead of
  // a broken canonical that would dilute SEO.
  const isGenericSlug = slug.startsWith('listing-');
  if (isGenericSlug && addressDisplayable && isActive) {
    // eslint-disable-next-line no-console
    console.error(`[listing-urls] Refusing to advertise generic slug for ${listing.listing_id} — address incomplete`);
    return { publicUrl: null, publicActiveUrl: null };
  }

  // Build the SEPARATED canonical URL via the shared helper. Single source
  // of truth — same logic used by the detail page redirect check and by
  // any other surface that links to a listing.
  const canonicalPath = buildCanonicalListingPath({ slug, id: listing.listing_id });
  const publicUrl = `${SITE_URL}${canonicalPath}`;
  // The same Mallan URL, exposed only while the listing is publicly live.
  const publicActiveUrl = isActive ? publicUrl : null;

  return { publicUrl, publicActiveUrl };
}
