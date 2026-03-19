import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/buyer/saved
 * Returns buyer's saved/liked listings.
 * Auth: buyer or tenant portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "buyer", "tenant");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actions = await prisma.clientListingAction.findMany({
    where: { lead_id: lead.id, action: 'liked' },
    include: {
      listing: {
        select: {
          listing_id: true, address: true, list_price: true,
          status: true, bedrooms_total: true, bathrooms_full: true,
          neighborhood: true, borough: true, media: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const saved = actions.map(a => ({
    id: String(a.id),
    listing_id: a.listing.listing_id,
    address: a.listing.address,
    list_price: a.listing.list_price ? Number(a.listing.list_price) : null,
    status: a.listing.status,
    bedrooms_total: a.listing.bedrooms_total,
    bathrooms_full: a.listing.bathrooms_full,
    neighborhood: a.listing.neighborhood,
    borough: a.listing.borough,
    media: a.listing.media,
    saved_at: a.created_at,
  }));

  return NextResponse.json({ saved });
}
