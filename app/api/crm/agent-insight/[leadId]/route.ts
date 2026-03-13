import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLeadEventCounts, getLeadTopListings } from '@/lib/behavioral/events';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/agent-insight/[leadId]
 *
 * Pre-meeting briefing for agents. Aggregates all behavioral data,
 * conviction score, and engagement patterns into a single view.
 * Agent/Broker auth required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
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

  const { leadId } = await params;
  const leadIdBigInt = BigInt(leadId);

  // Get lead info
  const lead = await prisma.lead.findUnique({
    where: { id: leadIdBigInt },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      agent_id: true,
      status: true,
      source: true,
      created_at: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Auth: only assigned agent or broker can view
  if (session.role !== 'BROKER' && lead.agent_id !== session.user_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get conviction score
  const conviction = await prisma.convictionScore.findUnique({
    where: { lead_id: leadIdBigInt },
  });

  // Get behavioral event summary (last 30 days)
  const eventCounts = await getLeadEventCounts(leadIdBigInt, 30);
  const topListings = await getLeadTopListings(leadIdBigInt, 5);

  // Get buyer intent profile
  const intentProfile = await prisma.buyerIntentProfile.findUnique({
    where: { lead_id: leadIdBigInt },
  });

  // Get showing feedback
  const recentFeedback = await prisma.showingFeedback.findMany({
    where: { lead_id: leadIdBigInt },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: {
      showing_id: true,
      rating: true,
      interest_level: true,
      notes: true,
      created_at: true,
    },
  });

  // Build talking points
  const talkingPoints: string[] = [];

  if (conviction) {
    if (conviction.score >= 75) {
      talkingPoints.push('This buyer appears ready to make a decision. Focus on next steps and offer strategy.');
    } else if (conviction.ghost_status === 'cooling' || conviction.ghost_status === 'silent') {
      talkingPoints.push(`Buyer has been inactive for ${conviction.silence_days} days. Start with a check-in, not a hard sell.`);
    }

    const flags = conviction.milestone_flags as Record<string, boolean>;
    if (flags.used_calculator) {
      talkingPoints.push('Buyer has used financial calculators — they are doing financial feasibility analysis.');
    }
    if (flags.checked_schools) {
      talkingPoints.push('Buyer researched school information — likely a family or long-term commitment.');
    }
    if (flags.checked_transit) {
      talkingPoints.push('Buyer checked commute/transit — daily logistics matter to them.');
    }

    const hesitation = conviction.hesitation_signals as Record<string, number>;
    if ((hesitation.price_scroll_backs || 0) > 3) {
      talkingPoints.push('Price sensitivity detected — multiple price scroll-backs observed.');
    }
  }

  if (eventCounts['comparison_add'] && eventCounts['comparison_add'] > 2) {
    talkingPoints.push(`Buyer has compared ${eventCounts['comparison_add']} listings — they are narrowing choices.`);
  }

  return NextResponse.json({
    lead: {
      id: String(lead.id),
      name: `${lead.first_name} ${lead.last_name}`,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      source: lead.source,
      memberSince: lead.created_at.toISOString(),
    },
    conviction: conviction
      ? {
          score: conviction.score,
          stage: conviction.stage,
          ghostStatus: conviction.ghost_status,
          silenceDays: conviction.silence_days,
          milestoneFlags: conviction.milestone_flags,
          hesitationSignals: conviction.hesitation_signals,
        }
      : null,
    behavioralSummary: {
      eventCounts,
      topListings,
      totalEvents: Object.values(eventCounts).reduce((sum, count) => sum + count, 0),
    },
    preferences: intentProfile
      ? {
          priceRange: intentProfile.price_min && intentProfile.price_max
            ? { min: Number(intentProfile.price_min), max: Number(intentProfile.price_max) }
            : null,
          neighborhoods: intentProfile.preferred_neighborhoods,
          propertyTypes: intentProfile.preferred_types,
          beds: intentProfile.preferred_beds,
          boroughs: intentProfile.preferred_boroughs,
        }
      : null,
    recentFeedback,
    talkingPoints,
  });
}
