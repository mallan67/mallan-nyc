import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/ghost-leads
 *
 * Returns leads that have gone silent after showing engagement.
 * Agent/Broker auth required.
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'cooling,silent';
  const statuses = status.split(',').map(s => s.trim());

  const ghosts = await prisma.convictionScore.findMany({
    where: {
      ghost_status: { in: statuses },
      score: { gte: 10 }, // Only meaningful leads
    },
    orderBy: { silence_days: 'desc' },
    take: 50,
  });

  // Enrich with lead data
  const enriched = await Promise.all(
    ghosts.map(async (g) => {
      const lead = await prisma.lead.findUnique({
        where: { id: g.lead_id },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          agent_id: true,
          status: true,
        },
      });

      // If not broker, only show own leads
      if (session.role !== 'BROKER' && lead?.agent_id !== session.user_id) {
        return null;
      }

      return {
        leadId: String(g.lead_id),
        name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        email: lead?.email,
        convictionScore: g.score,
        stage: g.stage,
        ghostStatus: g.ghost_status,
        silenceDays: g.silence_days,
        topListings: g.top_listings,
        lastActive: g.last_active_at?.toISOString(),
      };
    })
  );

  return NextResponse.json({
    ghosts: enriched.filter(Boolean),
    total: enriched.filter(Boolean).length,
  });
}
