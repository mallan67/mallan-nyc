import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/ai/env-check
 *
 * Returns whether the OpenAI API key is configured.
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

  return NextResponse.json({ hasKey: !!process.env.OPENAI_API_KEY });
}
