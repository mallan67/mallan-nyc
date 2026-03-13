import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getMomentumTier } from '@/lib/momentum/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/seller/fomo
 *
 * Seller FOMO Dashboard — shows listing performance, buyer activity,
 * missed showings, price trajectory, and "what if" scenarios.
 * Seller portal auth required.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lead = await prisma.lead.findFirst({
    where: {
      portal_token: token,
      portal_role: { in: ['seller', 'landlord'] },
    },
    select: { id: true },
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
      id: true,
      neighborhood: true,
      borough: true,
      list_price: true,
      days_on_market: true,
      status: true,
      property_type: true,
      bedrooms_total: true,
    },
  });

  if (!listing) {
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
