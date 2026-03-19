import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/tenant/lease
 * Returns tenant lease data: dates, rent, address, renewal status, days remaining.
 * Auth: buyer or tenant portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "buyer", "tenant");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      lease_start_date: true,
      lease_end_date: true,
      rent_per_month: true,
      property_address: true,
      unit_number: true,
      renewal_status: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let daysRemaining: number | null = null;
  if (lead.lease_end_date) {
    const diff = lead.lease_end_date.getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return NextResponse.json({
    lease_start_date: lead.lease_start_date,
    lease_end_date: lead.lease_end_date,
    rent_per_month: lead.rent_per_month ? Number(lead.rent_per_month) : null,
    property_address: lead.property_address,
    unit_number: lead.unit_number,
    renewal_status: lead.renewal_status,
    days_remaining: daysRemaining,
  });
}
