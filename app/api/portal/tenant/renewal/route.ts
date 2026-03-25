import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, requireAuth, isAuthError } from "@/lib/auth";
import { safeJson } from "@/lib/api/safe-json";

export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['renewing', 'not_renewing', 'month_to_month', 'pending'];

/**
 * GET /api/portal/tenant/renewal — Returns current renewal status.
 * POST /api/portal/tenant/renewal — Updates renewal_status.
 * Auth: buyer or tenant portal role.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalRole(request, "buyer", "tenant");
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, renewal_status: true, lease_end_date: true },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    renewal_status: lead.renewal_status,
    lease_end_date: lead.lease_end_date,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;

  const auth = await requirePortalRole(request, "buyer", "tenant");
  if (isAuthError(auth)) return auth;

  const [body, _parseErr] = await safeJson(request);
  if (_parseErr) return _parseErr;
  const { renewal_status } = body;

  if (!renewal_status || !VALID_STATUSES.includes(renewal_status)) {
    return NextResponse.json(
      { error: `Invalid renewal_status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const updated = await prisma.lead.update({
    where: { id: auth.userId },
    data: {
      renewal_status,
      ...(renewal_status === 'not_renewing' ? { non_renewal_date: new Date() } : {}),
    },
    select: { id: true, renewal_status: true },
  });

  return NextResponse.json({
    id: String(updated.id),
    renewal_status: updated.renewal_status,
  });
}
