import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/landlord/activity
 * Returns portal events for landlord workspace.
 * Auth: seller or landlord portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const events = await prisma.portalEvent.findMany({
    where: { lead_id: lead.id, workspace: 'landlord' },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    events: events.map(e => ({
      ...e,
      id: String(e.id),
      lead_id: String(e.lead_id),
      campaign_id: e.campaign_id ? String(e.campaign_id) : null,
    })),
  });
}
