// GET /api/cron/rls-follow
// A MANUAL trigger for lib/listings/rls-follow-run.ts: a Mallan listing linked to an RLS ID follows the Cotality record of that RLS ID. NOT a Vercel cron entry. The scheduled run is inside the
// One Cycle's entrypoint (app/api/cron/one-cycle-preflight), after the cycle and only when the cycle reached Neon: a second every-10-minutes schedule would wake Neon on every poll, which the
// preflight exists to avoid. Use this to run the same function by hand (for example to prove a change), with the same CRON_SECRET.
//
// What it does, and what it refuses, is described in lib/listings/rls-follow-run.ts.
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runRlsFollow } from '@/lib/listings/rls-follow-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ('Bearer ' + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + cronSecret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { httpStatus, summary } = await runRlsFollow();
  return NextResponse.json(summary, { status: httpStatus });
}
