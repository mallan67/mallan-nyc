import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSocialProof } from '@/lib/social-proof/aggregator';

/**
 * GET /api/listings/[id]/social-proof
 *
 * Returns anonymized demand signals for a listing.
 * Public endpoint — no auth required.
 * No PII, no demographics. Fair Housing safe.
 *
 * REBNY: Respects IDXEntireListingDisplayYN and owner opt-out.
 * Returns empty data for non-displayable listings.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || id.length > 50) {
    return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
  }

  // REBNY: Verify listing is publicly displayable before returning demand signals
  const listing = await prisma.listing.findFirst({
    where: { listing_id: id },
    select: { idx_display_yn: true, owner_opt_out: true },
  });

  if (!listing || listing.idx_display_yn === false || listing.owner_opt_out === true) {
    // Non-displayable listing — return empty data (don't confirm existence)
    return NextResponse.json({
      listingId: id,
      views: 0,
      saves: 0,
      showingsThisWeek: 0,
      demandLevel: 'moderate',
    });
  }

  try {
    const proof = await getSocialProof(id);

    return NextResponse.json({
      listingId: id,
      views: proof.view_count_7d,
      saves: proof.save_count,
      showingsThisWeek: proof.showings_this_week,
      demandLevel: proof.demand_level,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error(`[SocialProof] Error for listing ${id}:`, err);
    return NextResponse.json({
      listingId: id,
      views: 0,
      saves: 0,
      showingsThisWeek: 0,
      demandLevel: 'moderate',
    });
  }
}
