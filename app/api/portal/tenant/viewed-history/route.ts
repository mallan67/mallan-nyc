import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/tenant/viewed-history
 * Returns showing history for this tenant.
 * Auth: buyer or tenant portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "buyer", "tenant");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const history = await prisma.showingHistory.findMany({
    where: { lead_id: lead.id },
    orderBy: { showing_date: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    history: history.map(h => ({
      ...h,
      id: String(h.id),
      lead_id: String(h.lead_id),
      price_at_time: h.price_at_time ? Number(h.price_at_time) : null,
    })),
  });
}
