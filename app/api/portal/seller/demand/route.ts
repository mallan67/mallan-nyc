import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';
import { canAccessOwnerListing } from '@/lib/portal/listing-ownership';

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

  // P0: Use owner_client_id for ownership enforcement (not agent relationship).
  // REBNY Art. III §2: seller must own the listing to see its demand data.
  // Fail-closed with 404 (not 403) to avoid leaking listing existence.
  const listing = await prisma.listing.findFirst({
    where: {
      listing_id: listingId,
    },
    select: {
      owner_client_id: true,
      neighborhood: true,
      borough: true,
      list_price: true,
      bedrooms_total: true,
      property_type: true,
    },
  });

  if (!listing || !canAccessOwnerListing(auth, listing.owner_client_id)) {
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
          AND: [
            listing.neighborhood ? { preferred_neighborhoods: { has: listing.neighborhood } } : {},
            { price_min: { lte: price }, price_max: { gte: price } },
          ],
        },
      })
    : 0;

  // Recent searchers in neighborhood
  const recentSearchers = listing.neighborhood
    ? await prisma.savedSearch.count({
        where: {
          criteria: { path: ['neighborhoods'], array_contains: listing.neighborhood },
          last_run: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      })
    : 0;

  // 30-day demand trend
  const prevMonthStart = new Date();
  prevMonthStart.setDate(prevMonthStart.getDate() - 60);
  const currentMonthStart = new Date();
  currentMonthStart.setDate(currentMonthStart.getDate() - 30);

  const prevMonthBuyers = listing.neighborhood
    ? await prisma.buyerIntentProfile.count({
        where: {
          AND: [
            { preferred_neighborhoods: { has: listing.neighborhood } },
            price > 0 ? { price_min: { lte: priceMax }, price_max: { gte: priceMin } } : {},
            { created_at: { gte: prevMonthStart, lt: currentMonthStart } },
          ],
        },
      })
    : 0;

  const currentMonthBuyers = listing.neighborhood
    ? await prisma.buyerIntentProfile.count({
        where: {
          AND: [
            { preferred_neighborhoods: { has: listing.neighborhood } },
            price > 0 ? { price_min: { lte: priceMax }, price_max: { gte: priceMin } } : {},
            { created_at: { gte: currentMonthStart } },
          ],
        },
      })
    : 0;

  const demandTrend = prevMonthBuyers > 0 ? Math.round(((currentMonthBuyers - prevMonthBuyers) / prevMonthBuyers) * 100) : 0;

  return NextResponse.json({
    demand: {
      totalMatchingBuyers: matchingBuyers,
      exactPriceMatch,
      recentSearchers,
      demandTrend,
      neighborhood: listing.neighborhood,
      priceRange: {
        min: Math.round(priceMin),
        max: Math.round(priceMax),
      },
    },
  });
}
