import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';
import { resolveOwnerListing } from '@/lib/portal/listing-ownership';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/landlord/dashboard
 * Returns landlord dashboard data: rental listing stats, recent activity.
 * Auth: seller or landlord portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, active_rental_listing_id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RESOLVED FROM THE OWNER RELATION, NOT FROM A STRING.
  //
  // This used to read `findFirst({ where: { listing_id: lead.active_rental_listing_id } })`
  // with no ownership check, and to return `{ listing: null }` whenever that
  // column was empty. Two problems:
  //
  //   - `POST /api/crm/listings` writes `owner_client_id` and never touches the
  //     Lead row, so a listing created through the normal CRM path left this
  //     dashboard telling the client they had no listing at all.
  //   - an unverified String column with no FK was the only thing between a
  //     lead and that listing's data.
  //
  // `resolveOwnerListing` queries by `owner_client_id` and treats the backref
  // as a HINT for WHICH listing is active when the owner has several - never as
  // authority for whether it is theirs.
  const listing = await resolveOwnerListing(prisma, {
    leadId: lead.id,
    listingType: 'rent',
    hintedListingId: lead.active_rental_listing_id,
    select: {
      listing_id: true, status: true, list_price: true,
      days_on_market: true, neighborhood: true, address: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ listing: null, stats: null, activity: [] });
  }

  const [showingsCount, offersCount, inquiriesCount, activity] = await Promise.all([
    prisma.showing.count({
      where: { listing: { listing_id: listing.listing_id } },
    }),
    prisma.portalEvent.count({
      where: { lead_id: lead.id, workspace: 'landlord', event_type: 'offer_view' },
    }),
    prisma.portalEvent.count({
      where: { listing_id: listing.listing_id, event_type: 'listing_view' },
    }),
    prisma.portalEvent.findMany({
      where: { lead_id: lead.id, workspace: 'landlord' },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    listing: { ...listing, list_price: listing.list_price ? Number(listing.list_price) : null },
    stats: { showingsCount, offersCount, inquiriesCount, daysOnMarket: listing.days_on_market ?? 0 },
    activity: activity.map(a => ({ ...a, id: String(a.id), lead_id: String(a.lead_id) })),
  });
}
