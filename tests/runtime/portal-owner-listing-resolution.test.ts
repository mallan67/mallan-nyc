/// <reference types="jest" />
/**
 * "MY LISTING" HAS ONE ANSWER, AND IT COMES FROM THE OWNER RELATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO COMPETING OWNER AUTHORITIES
 *
 * The repo resolves "the owner's listing" two different ways:
 *
 *   CANONICAL   `Listing.owner_client_id` → Lead.id, a real FK relation
 *               (@relation("ListingOwner")). Used by /api/portal/listings,
 *               offers, showings, price-history, marketing, comparables — all
 *               enforced through `canAccessOwnerListing`.
 *
 *   BACKREF     `Lead.active_sale_listing_id` / `active_rental_listing_id`,
 *               plain nullable String columns holding a `listing_id` TEXT value
 *               with no FK, no unique constraint and no index. Used by the
 *               seller and landlord dashboards, relist, and both signals routes.
 *
 * They disagree, and the disagreement is visible to a client:
 *
 *   1. `POST /api/crm/listings` writes `owner_client_id` and never touches the
 *      Lead row — there is no `prisma.lead` call in that file. Only
 *      `crm/convert` (promote_to_listing) writes the backref, and NOTHING in the
 *      repo ever clears or re-points it. So a listing created through the normal
 *      CRM path is reachable at /api/portal/listings while the seller's own
 *      DASHBOARD returns `{ listing: null }`. The seller is told they have no
 *      listing.
 *
 *   2. The dashboard resolved the listing with
 *      `findFirst({ where: { listing_id: lead.active_sale_listing_id } })` and
 *      NO owner check whatsoever. The string is the only thing standing between
 *      a lead and that listing's data. It happens to be consistent today because
 *      one writer sets it, but an unverified string is not an authorization
 *      boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CHANGES
 *
 * The backref becomes DERIVED — a hint about WHICH listing is the active one
 * when an owner has several — and never the authority for WHETHER the listing is
 * theirs. Ownership is always re-checked against `owner_client_id`.
 *
 * That is deliberately not "delete the column": it still carries the agent's
 * intent about which listing is current, and the CRM reads it in nine places.
 * It simply stops being able to grant access.
 */
import { resolveOwnerListing } from '@/lib/portal/listing-ownership';

const SELLER = 501n;
const OTHER_LEAD = 999n;

/** Rows as the resolver's query would return them, newest first. */
function ownedSale(ids: string[]) {
  return ids.map((listing_id, i) => ({
    listing_id,
    owner_client_id: SELLER,
    listing_type: 'sale',
    modification_timestamp: new Date(2026, 0, 10 - i),
  }));
}

type FindManyArgs = { where: Record<string, unknown> };

function prismaWith(rows: Array<Record<string, unknown>>) {
  // Typed so the assertions below can read `where` without tuple-index errors.
  const findMany: jest.Mock<Promise<typeof rows>, [FindManyArgs]> = jest.fn(
    async (_args: FindManyArgs) => rows,
  );
  return {
    client: { listing: { findMany } } as never,
    findMany,
  };
}

describe('the resolver only ever returns a listing the lead owns', () => {
  it('returns null when the lead owns nothing, even with a stale backref', async () => {
    // The backref points at a listing that is not theirs (or no longer exists).
    // Under the old dashboard query this returned that listing's data.
    const { client, findMany } = prismaWith([]);
    const result = await resolveOwnerListing(client, {
      leadId: SELLER,
      listingType: 'sale',
      hintedListingId: 'SL-SOMEONE-ELSE',
    });
    expect(result).toBeNull();
    // And the ownership filter was actually applied, not just absent results.
    const where = findMany.mock.calls[0][0].where;
    expect(where.owner_client_id).toBe(SELLER);
  });

  it('never widens beyond the owner even when the hint matches nothing', async () => {
    const { client } = prismaWith(ownedSale(['SL-0001']));
    const result = await resolveOwnerListing(client, {
      leadId: SELLER,
      listingType: 'sale',
      hintedListingId: 'SL-NOT-OWNED',
    });
    expect(result?.listing_id).toBe('SL-0001');
  });
});

describe('the backref is a hint, not an authority', () => {
  it('prefers the hinted listing when the lead genuinely owns it', async () => {
    // Preserves the agent's intent about which listing is the active one.
    const { client } = prismaWith(ownedSale(['SL-0001', 'SL-0002', 'SL-0003']));
    const result = await resolveOwnerListing(client, {
      leadId: SELLER,
      listingType: 'sale',
      hintedListingId: 'SL-0003',
    });
    expect(result?.listing_id).toBe('SL-0003');
  });

  it('falls back to the most recent owned listing with no hint', async () => {
    // This is the case the CRM create path produces: owner_client_id set, no
    // backref written. Previously the dashboard showed nothing at all.
    const { client } = prismaWith(ownedSale(['SL-0001', 'SL-0002']));
    const result = await resolveOwnerListing(client, {
      leadId: SELLER,
      listingType: 'sale',
      hintedListingId: null,
    });
    expect(result?.listing_id).toBe('SL-0001');
  });

  it('scopes to the listing type', async () => {
    const { client, findMany } = prismaWith(ownedSale(['SL-0001']));
    await resolveOwnerListing(client, {
      leadId: SELLER,
      listingType: 'rent',
      hintedListingId: null,
    });
    expect(findMany.mock.calls[0][0].where.listing_type).toBe('rent');
  });
});

describe('a different lead cannot reach it', () => {
  it('an unrelated lead resolves to null', async () => {
    // The query is keyed on the caller's own id, so a lead who owns nothing gets
    // nothing regardless of what any backref string says.
    const { client, findMany } = prismaWith([]);
    const result = await resolveOwnerListing(client, {
      leadId: OTHER_LEAD,
      listingType: 'sale',
      hintedListingId: 'SL-0001',
    });
    expect(result).toBeNull();
    expect(findMany.mock.calls[0][0].where.owner_client_id).toBe(OTHER_LEAD);
  });
});
