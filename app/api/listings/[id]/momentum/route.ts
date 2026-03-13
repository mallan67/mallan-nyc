import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { computeListingMomentum, getMomentumTier } from '@/lib/momentum/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/listings/[id]/momentum
 *
 * Returns listing momentum score and performance breakdown.
 * Agent/Broker auth required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await prisma.session.findUnique({
    where: { token },
    select: { user_id: true, role: true, expires_at: true },
  });
  if (!session || session.expires_at < new Date()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Check cached first
  const cached = await prisma.listingMomentum.findUnique({
    where: { listing_id: id },
  });

  if (cached && cached.last_computed > new Date(Date.now() - 3600_000)) {
    return NextResponse.json({
      listingId: id,
      score: cached.score,
      tier: getMomentumTier(cached.score),
      viewVelocity: cached.view_velocity,
      saveRate: cached.save_rate,
      inquiryRate: cached.inquiry_rate,
      showingRate: cached.showing_rate,
      avgDwellSecs: cached.avg_dwell_secs,
      percentileRank: cached.percentile_rank,
      components: cached.components,
      computedAt: cached.last_computed.toISOString(),
    });
  }

  try {
    const result = await computeListingMomentum(id);
    return NextResponse.json({
      listingId: id,
      tier: getMomentumTier(result.score),
      ...result,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[Momentum] Error for listing ${id}:`, err);
    return NextResponse.json({
      listingId: id,
      score: cached?.score || 0,
      tier: getMomentumTier(cached?.score || 0),
      computedAt: cached?.last_computed?.toISOString() || new Date().toISOString(),
    });
  }
}
