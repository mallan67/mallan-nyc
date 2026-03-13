import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/health/env
 *
 * Returns boolean indicators for environment variable presence.
 * Broker-only — requires session cookie auth.
 */
export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const session = await prisma.session.findUnique({
    where: { token },
    select: { role: true, expires_at: true },
  });
  if (!session || session.expires_at < new Date() || session.role !== 'BROKER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    env: {
      NYC_SODA_APP_TOKEN: !!process.env.NYC_SODA_APP_TOKEN,
      SOCRATA_APP_TOKEN: !!process.env.SOCRATA_APP_TOKEN,
      SODA_DATASET_DOB_VIOLATIONS: !!process.env.SODA_DATASET_DOB_VIOLATIONS,
      SODA_DATASET_DOB_PERMITS: !!process.env.SODA_DATASET_DOB_PERMITS,
      SODA_DATASET_DOB_COMPLAINTS: !!process.env.SODA_DATASET_DOB_COMPLAINTS,
      SODA_DATASET_OATH_ECB: !!process.env.SODA_DATASET_OATH_ECB,
      SODA_DATASET_ACRIS_MASTER: !!process.env.SODA_DATASET_ACRIS_MASTER,
      SODA_DATASET_ACRIS_REALPROPERTY: !!process.env.SODA_DATASET_ACRIS_REALPROPERTY,
      NYC_GEOCLIENT_SUBSCRIPTION_KEY: !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY,
    },
  });
}
