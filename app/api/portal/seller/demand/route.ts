import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireWorkspace, isAuthError } from '@/lib/auth';
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
  // requireWorkspace (not requirePortalRole) so a workspace-only owner — enabled_workspaces:['seller'|
  // 'landlord'] while legacy portal_role is still 'buyer' (promotion/conversion flow) — is admitted;
  // ownership is then enforced by canAccessOwnerListing below.
  const auth = await requireWorkspace(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const listingId = searchParams.get('listingId');

  if (!listingId) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  // Ownership enforcement (REBNY Art. III §2): the caller must OWN this listing (owner_client_id ===
  // their lead id; agents bypass). The previous `agent.leads.some` scoping was a cross-client IDOR —
  // two sellers sharing a listing agent could read each other's demand analytics. Deny with 404 (not
  // 403) so a non-owner cannot probe the listing's existence.
  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
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
