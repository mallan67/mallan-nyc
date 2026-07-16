// Pure, client-safe open-house selection for the listing-detail panel.
//
// Kept SEPARATE from lib/open-houses/upcoming-open-houses.ts (which imports prisma / Cotality auth and
// is server-only) so it can be used inside the 'use client' ListingOpenHouseRSVP component and in
// tests without pulling server code into the client bundle.
//
// Twin-safe matching (follow-up to #463): a property can exist as a local CRM exclusive (SL-0007) AND
// as a Cotality RLS listing (RLS20099289). /api/open-houses dedupes the two and keeps only the Trestle
// entry, so the SL-0007 detail page would never match by exact listingId. We therefore match by exact
// listingId OR by a shared normalized `addressKey` (computed server-side by the route + the page from
// the same normalizeAddressKey used by the dedup/banner resolver).

export interface ListingOpenHouseEntry {
  id: string;
  listingId: string;
  /** Normalized twin-match key (street+unit+ZIP; directionals dropped as stop-words, ZIP added to
   *  disambiguate cross-town E/W addresses). Matching requires BOTH sides non-empty, and the feed
   *  emits '' for non-displayable addresses — so suppressed entries never match (no '' === ''). */
  addressKey?: string;
  address: string;
  date: string;      // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  /** Canonical public designation from /api/open-houses: "Public" | "By Appointment" (passthrough). */
  openHouseType?: string;
}

/**
 * Select the upcoming open houses that belong to THIS listing page: exact listingId match, or a
 * twin-safe match on a shared non-empty addressKey. Then keep only upcoming dates, dedupe by
 * date|start|end (so twins for the same slot render once), sort ascending, cap at 4.
 */
export function selectListingOpenHouses(
  all: ListingOpenHouseEntry[],
  opts: { listingId: string; listingAddressKey?: string; now?: Date },
): ListingOpenHouseEntry[] {
  const { listingId, listingAddressKey } = opts;
  const today = opts.now ? new Date(opts.now) : new Date();
  today.setHours(0, 0, 0, 0);

  const keyMatches = (oh: ListingOpenHouseEntry): boolean =>
    !!listingAddressKey && !!oh.addressKey && oh.addressKey === listingAddressKey;

  const matching = (all || []).filter((oh) => oh.listingId === listingId || keyMatches(oh));

  const upcoming = matching.filter((oh) => new Date(oh.date + 'T00:00:00') >= today);

  const seen = new Set<string>();
  const deduped = upcoming.filter((oh) => {
    const k = `${oh.date}|${oh.startTime}|${oh.endTime}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  deduped.sort((a, b) => a.date.localeCompare(b.date));
  return deduped.slice(0, 4);
}
