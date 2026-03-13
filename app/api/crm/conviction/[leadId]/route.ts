import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { computeConvictionScore } from '@/lib/conviction/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/conviction/[leadId]
 *
 * Returns conviction score and behavioral insights for a lead.
 * Agent/Broker auth required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  // Auth check
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

  const { leadId } = await params;
  const leadIdBigInt = BigInt(leadId);

  // Get cached score
  const cached = await prisma.convictionScore.findUnique({
    where: { lead_id: leadIdBigInt },
  });

  // If no cached score or stale (> 1 hour), compute fresh
  if (!cached || cached.last_computed < new Date(Date.now() - 3600_000)) {
    try {
      const fresh = await computeConvictionScore(leadIdBigInt);
      return NextResponse.json({
        leadId,
        ...fresh,
        computedAt: new Date().toISOString(),
      });
    } catch {
      if (cached) {
        return NextResponse.json({
          leadId,
          score: cached.score,
          stage: cached.stage,
          milestoneFlags: cached.milestone_flags,
          hesitationSignals: cached.hesitation_signals,
          ghostStatus: cached.ghost_status,
          silenceDays: cached.silence_days,
          topListings: cached.top_listings,
          computedAt: cached.last_computed.toISOString(),
        });
      }
      return NextResponse.json({
        leadId,
        score: 0,
        stage: 'browsing',
        milestoneFlags: {},
        hesitationSignals: {},
        ghostStatus: 'active',
        silenceDays: 0,
        topListings: [],
        computedAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({
    leadId,
    score: cached.score,
    stage: cached.stage,
    milestoneFlags: cached.milestone_flags,
    hesitationSignals: cached.hesitation_signals,
    ghostStatus: cached.ghost_status,
    silenceDays: cached.silence_days,
    topListings: cached.top_listings,
    computedAt: cached.last_computed.toISOString(),
  });
}
