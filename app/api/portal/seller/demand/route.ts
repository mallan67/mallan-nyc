import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/seller/demand
 *
 * Returns anonymized buyer demand data personalized to seller's listing.
 * Shows how many buyers match their neighborhood, price range, and beds.
 * Seller portal auth required.
 *
 * PRIVACY: Returns aggregate counts only. No buyer PII. Fair Housing safe.
 */
export async function GET(request: NextRequest) {
  // C-2 fix: use session cookie auth instead of broken portal_token lookup
  const auth = await requirePortalRole(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, portal_role: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get('listingId');

  if (!listingId) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  // Verify seller owns this listing (via their assigned agent)
  const listing = await prisma.listing.findFirst({
    where: {
      listing_id: listingId,
      agent: {
        leads: { some: { id: lead.id } },
      },
    },
    select: {
      neighborhood: true,
      borough: true,
      list_price: true,
      bedrooms_total: true,
      property_type: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const price = listing.list_price ? Number(listing.list_price) : 0;
  const priceMin = price * 0.8;
  const priceMax = price * 1.2;

  // Count matching buyer intent profiles (anonymized)
  const matchingBuyers = await prisma.buyerIntentProfile.count({
    where: {
      AND: [
        listing.neighborhood
          ? { preferred_neighborhoods: { has: listing.neighborhood } }
          : {},
        price > 0
          ? {
              price_min: { lte: priceMax },
              price_max: { gte: priceMin },
            }
          : {},
      ],
    },
  });

  // Count buyers in exact price range
  const exactPriceMatch = price > 0
    ? await prisma.buyerIntentProfile.count({
        where: {
          price_min: { lte: price },
          price_max: { gte: price },
        },
      })
    : 0;

  // Count buyers searching this neighborhood (last 30 days)
  const recentSearchers = listing.neighborhood
    ? await prisma.buyerIntentProfile.count({
        where: {
          preferred_neighborhoods: { has: listing.neighborhood },
          last_event_at: { gte: new Date(Date.now() - 30 * 86400_000) },
        },
      })
    : 0;

  // Get demand trend (compare to 30 days ago)
  const thirtyDaysAgo = await prisma.buyerIntentProfile.count({
    where: {
      preferred_neighborhoods: listing.neighborhood ? { has: listing.neighborhood } : undefined,
      last_event_at: {
        gte: new Date(Date.now() - 60 * 86400_000),
        lte: new Date(Date.now() - 30 * 86400_000),
      },
    },
  });

  const demandTrend = thirtyDaysAgo > 0
    ? ((recentSearchers - thirtyDaysAgo) / thirtyDaysAgo) * 100
    : 0;

  return NextResponse.json({
    listingId,
    demand: {
      totalMatchingBuyers: matchingBuyers,
      exactPriceMatch,
      recentSearchers,
      demandTrend: Math.round(demandTrend * 10) / 10,
      neighborhood: listing.neighborhood,
      priceRange: { min: Math.round(priceMin), max: Math.round(priceMax) },
    },
  });
}
