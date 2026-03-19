import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/landlord/relist
 * Returns relist timing data: relist_reminder_date, lease_end_date, vacancy_risk, listing status.
 * Auth: seller or landlord portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      relist_reminder_date: true,
      lease_end_date: true,
      vacancy_risk: true,
      active_rental_listing_id: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let listingStatus: string | null = null;
  if (lead.active_rental_listing_id) {
    const listing = await prisma.listing.findFirst({
      where: { listing_id: lead.active_rental_listing_id },
      select: { status: true },
    });
    listingStatus = listing?.status ?? null;
  }

  return NextResponse.json({
    relist_reminder_date: lead.relist_reminder_date,
    lease_end_date: lead.lease_end_date,
    vacancy_risk: lead.vacancy_risk,
    listing_status: listingStatus,
    active_rental_listing_id: lead.active_rental_listing_id,
  });
}
