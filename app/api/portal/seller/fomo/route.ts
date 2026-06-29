import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireWorkspace, isAuthError } from '@/lib/auth';
import { canAccessOwnerListing } from '@/lib/portal/listing-ownership';

function getMomentumTier(score: number): string {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 40) return 'moderate';
  return 'cool';
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/seller/fomo
 *
 * Seller FOMO Dashboard — shows listing performance, buyer activity,
 * missed showings, price trajectory, and "what if" scenarios.
 * Seller portal auth required.
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
  // two sellers sharing a listing agent could read each other's FOMO analytics. Deny with 404 (not
  // 403) so a non-owner cannot probe the listing's existence.
  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
    select: {
      id: true,
      owner_client_id: true,
      neighborhood: true,
      borough: true,
      list_price: true,
      days_on_market: true,
      status: true,
      property_type: true,
      bedrooms_total: true,
    },
  });

  if (!listing || !canAccessOwnerListing(auth, listing.owner_client_id)) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  // Momentum score
  const momentum = await prisma.listingMomentum.findUnique({
    where: { listing_id: listingId },
  });

  // Social proof
  const socialProof = await prisma.socialProofCache.findUnique({
    where: { listing_id: listingId },
  });

  // Showings completed vs requested (Showing.listing_id is BigInt)
  const listingDbId = listing.id;
  const showingsCompleted = listingDbId
    ? await prisma.showing.count({ where: { listing_id: listingDbId, status: 'completed' } })
    : 0;
  const showingsScheduled = listingDbId
    ? await prisma.showing.count({ where: { listing_id: listingDbId, status: { in: ['scheduled', 'confirmed'] } } })
    : 0;
  const showingsCancelled = listingDbId
    ? await prisma.showing.count({ where: { listing_id: listingDbId, status: 'cancelled' } })
    : 0;

  // Market snapshot for neighborhood
  const latestSnapshot = listing.neighborhood
    ? await prisma.marketSnapshot.findFirst({
        where: { neighborhood: listing.neighborhood },
        orderBy: { created_at: 'desc' },
      })
    : null;

  // "What if" — if price reduced by 5%, how many more buyers match?
  const currentPrice = listing.list_price ? Number(listing.list_price) : 0;
  const reducedPrice = currentPrice * 0.95;
  const currentBuyerMatch = currentPrice > 0
    ? await prisma.buyerIntentProfile.count({
        where: {
          price_min: { lte: currentPrice },
          price_max: { gte: currentPrice },
        },
      })
    : 0;
  const reducedBuyerMatch = reducedPrice > 0
    ? await prisma.buyerIntentProfile.count({
        where: {
          price_min: { lte: reducedPrice },
          price_max: { gte: reducedPrice },
        },
      })
    : 0;

  return NextResponse.json({
    listingId,
    momentum: momentum
      ? {
          score: momentum.score,
          tier: getMomentumTier(momentum.score),
          percentileRank: momentum.percentile_rank,
        }
      : null,
    activity: {
      views7d: socialProof?.view_count_7d || 0,
      saves: socialProof?.save_count || 0,
      demandLevel: socialProof?.demand_level || 'moderate',
    },
    showings: {
      completed: showingsCompleted,
      scheduled: showingsScheduled,
      cancelled: showingsCancelled,
    },
    market: latestSnapshot
      ? {
          medianPrice: latestSnapshot.median_price ? Number(latestSnapshot.median_price) : null,
          avgDOM: latestSnapshot.avg_dom,
          inventory: latestSnapshot.inventory,
          closedSales: latestSnapshot.closed_sales,
        }
      : null,
    daysOnMarket: listing.days_on_market || 0,
    whatIf: {
      currentPrice,
      reducedPrice: Math.round(reducedPrice),
      currentBuyerMatch,
      reducedBuyerMatch,
      additionalBuyers: reducedBuyerMatch - currentBuyerMatch,
      reductionPercent: 5,
    },
  });
}
