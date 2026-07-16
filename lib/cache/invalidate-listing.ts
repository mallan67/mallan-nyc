// lib/cache/invalidate-listing.ts
//
// The single "a listing changed" cache hook, called from the IDX sync / feed-reconcile
// seams (cron/background — never a public request). It:
//   1. deletes the per-listing durable detail cache entry (listing detail re-renders fresh),
//   2. refreshes the alias→canonical index entries (so edge redirects stay correct),
// and separately the caller bumps the list/search namespace version ONCE per run
// (bumpListingsCacheVersion) so the /api/listings cache reflects the change.
//
// Everything is best-effort: a Redis failure NEVER breaks the DB write that preceded it.
// Canonical-path + address-suppression are computed with the SAME helpers the render uses,
// so an index entry can never point at a non-canonical path or leak a suppressed address.

import { cacheDel, bumpListingsCacheVersion } from "@/lib/cache/durable-cache";
import { writeAliasEntries } from "@/lib/listings/alias-index";
import { generateListingSlug, composeSlugStreetName } from "@/lib/listing-slug";
import { buildCanonicalListingPath } from "@/lib/listing-canonical-url";
import { normalizeStreetCase } from "@/lib/idx/normalize-street-case";
import { canDisplayListingAddress } from "@/lib/search/listing-access-decision";

export { bumpListingsCacheVersion };

/** Durable per-listing detail cache key (used by the detail page + this invalidator). */
export function detailCacheKey(listingId: string): string {
  return `idx:listing:v1:${listingId.toUpperCase()}`;
}

/** The minimal identity a changed listing exposes (matches `mapped` in lib/idx/sync.ts). */
export type ListingCacheIdentity = {
  listing_id: string;
  mls_id?: string | null;
  address?: unknown;
  postal_code?: string | null;
  rls_eligible?: boolean;
  internet_entire_listing_display_yn?: unknown;
  internet_address_display_yn?: unknown;
};

/** Canonical path + address slug for a changed listing — identical logic to the render. */
export function canonicalForListing(l: ListingCacheIdentity): {
  canonicalPath: string;
  addressSlug: string;
} {
  const addr = (l.address as Record<string, string>) || {};
  const isRlsBacked = l.rls_eligible !== false;
  const suppress = isRlsBacked && !canDisplayListingAddress(l);
  const addressSlug = generateListingSlug({
    address: {
      streetNumber: addr.StreetNumber || "",
      streetName: suppress
        ? "Address Undisclosed"
        : normalizeStreetCase(composeSlugStreetName(addr) || ""),
      unitNumber: addr.UnitNumber || null,
      city: addr.City || "",
      stateOrProvince: addr.StateOrProvince || "NY",
      postalCode: addr.PostalCode || l.postal_code || "",
    },
    id: l.listing_id,
    mlsId: l.mls_id || undefined,
    internetAddressDisplayYN: !suppress,
  });
  return { canonicalPath: buildCanonicalListingPath({ slug: addressSlug, id: l.listing_id }), addressSlug };
}

/**
 * Per-listing invalidation: drop the detail cache + refresh alias-index entries. Does NOT
 * bump the list-cache version (the caller does that ONCE per sync run to avoid N bumps).
 * Best-effort; never throws.
 */
export async function refreshListingCaches(l: ListingCacheIdentity): Promise<void> {
  try {
    await cacheDel(detailCacheKey(l.listing_id));
  } catch {
    /* best-effort */
  }
  try {
    const { canonicalPath, addressSlug } = canonicalForListing(l);
    await writeAliasEntries(l.listing_id, addressSlug, canonicalPath);
  } catch {
    /* best-effort */
  }
}
