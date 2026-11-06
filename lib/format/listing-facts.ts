/**
 * What a listing's public facts say when it has no bedrooms or bathrooms (Maya, 2026-11-06: a medical office on the Featured list read "0 bd · 2 ba").
 *
 * A Mallan listing saved as Commercial (an office, a retail space: the public record's `isCommercial`) has no bedroom or bathroom count to show, so a card shows its area, the listing page leaves the
 * Beds and Baths tiles out, and the page's search-engine description does not say "0 bed, 2 bath". A home is unchanged.
 */

export interface ListingFactsInput { isCommercial?: boolean | null }

/** A home has bedrooms and bathrooms to show; a Commercial listing does not. */
export function showsBedsAndBaths(listing: ListingFactsInput): boolean {
  return !listing.isCommercial;
}

/** The lead of a page description: "1 bed, 1 bath " for a home, nothing for a commercial listing (the property type follows it). */
export function bedBathLead(listing: ListingFactsInput & { bedroomsTotal: number; bathroomsFull: number }): string {
  return showsBedsAndBaths(listing) ? `${listing.bedroomsTotal} bed, ${listing.bathroomsFull} bath ` : '';
}
