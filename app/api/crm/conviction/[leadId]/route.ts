import { NextRequest, NextResponse } from 'next/server';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { computeConvictionScore } from '@/lib/conviction/scorer';
import { assertLeadIdStringAccess } from '@/lib/crm/access';
import prisma from '@/lib/prisma';

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
  const access = await assertLeadIdStringAccess(auth, leadId);
  if (access.response) return access.response;
  const leadIdBigInt = access.leadId!;

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
          searchNarrowingTrend: cached.search_narrowing_trend,
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
    searchNarrowingTrend: cached.search_narrowing_trend,
    topListings: cached.top_listings,
    computedAt: cached.last_computed.toISOString(),
  });
}
