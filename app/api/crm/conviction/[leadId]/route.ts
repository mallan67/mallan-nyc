import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { computeConvictionScore } from '@/lib/conviction/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/conviction/[leadId]
 *
 * Returns conviction score and behavioral insights for a lead.
 * Agent/Broker auth required. Agents can only access their assigned leads.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) return auth;

  const { leadId } = await params;
  const leadIdBigInt = BigInt(leadId);

  // Scope check: agents can only view their own assigned leads
  if (auth.role !== 'BROKER') {
    const lead = await prisma.lead.findUnique({
      where: { id: leadIdBigInt },
      select: { agent_id: true },
    });
    if (lead && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

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
