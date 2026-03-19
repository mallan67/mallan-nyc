import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

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

  if (!lead.active_rental_listing_id) {
    return NextResponse.json({ listing: null, stats: null, activity: [] });
  }

  const listing = await prisma.listing.findFirst({
    where: { listing_id: lead.active_rental_listing_id },
    select: {
      listing_id: true, status: true, list_price: true,
      days_on_market: true, neighborhood: true, address: true,
    },
  });

  const [showingsCount, offersCount, inquiriesCount, activity] = await Promise.all([
    prisma.showing.count({
      where: { listing: { listing_id: lead.active_rental_listing_id } },
    }),
    prisma.portalEvent.count({
      where: { lead_id: lead.id, workspace: 'landlord', event_type: 'offer_view' },
    }),
    prisma.portalEvent.count({
      where: { listing_id: lead.active_rental_listing_id, event_type: 'listing_view' },
    }),
    prisma.portalEvent.findMany({
      where: { lead_id: lead.id, workspace: 'landlord' },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    listing: listing ? { ...listing, list_price: listing.list_price ? Number(listing.list_price) : null } : null,
    stats: { showingsCount, offersCount, inquiriesCount, daysOnMarket: listing?.days_on_market ?? 0 },
    activity: activity.map(a => ({ ...a, id: String(a.id), lead_id: String(a.lead_id) })),
  });
}
