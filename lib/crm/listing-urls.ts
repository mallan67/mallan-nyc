/**
 * Build public-facing URLs for CRM listings.
 *
 * @module lib/crm/listing-urls
 */

import { generateListingSlug } from '@/lib/listing-slug';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mallan.nyc';

interface ListingForUrl {
  listing_id: string;
  status: string;
  address: Record<string, unknown> | null;
  internet_address_display_yn?: boolean;
}

export function buildListingUrls(listing: ListingForUrl): {
  publicUrl: string | null;
  realPlusUrl: string | null;
} {
  const addr = (listing.address || {}) as Record<string, string>;
  const isActive = listing.status === 'Active' || listing.status === 'ComingSoon' || listing.status === 'ActiveUnderContract';

  const slug = generateListingSlug({
    address: {
      streetNumber: addr.StreetNumber || '',
      streetDirPrefix: addr.StreetDirPrefix || '',
      streetName: [addr.StreetName, addr.StreetSuffix, addr.StreetDirSuffix].filter(Boolean).join(' '),
      unitNumber: addr.UnitNumber || null,
      city: addr.City || 'New York',
      stateOrProvince: addr.StateOrProvince || 'NY',
      postalCode: addr.PostalCode || '',
    },
    id: listing.listing_id,
    mlsId: listing.listing_id,
    internetAddressDisplayYN: listing.internet_address_display_yn !== false,
  });

  // Canonical URL guard: a published CRM listing with displayable address
  // must NEVER expose a generic `listing-XXX` URL publicly. If we got one,
  // return null for both URLs so the form shows "URL pending" instead of
  // a broken canonical that would dilute SEO and confuse RealPlus.
  const isGenericSlug = slug.startsWith('listing-');
  const addressDisplayable = listing.internet_address_display_yn !== false;
  if (isGenericSlug && addressDisplayable && isActive) {
    // eslint-disable-next-line no-console
    console.error(`[listing-urls] Refusing to advertise generic slug for ${listing.listing_id} — address incomplete`);
    return { publicUrl: null, realPlusUrl: null };
  }

  const publicUrl = `${SITE_URL}/listing/${slug}`;
  const realPlusUrl = isActive ? publicUrl : null;

  return { publicUrl, realPlusUrl };
}
