import { NextRequest, NextResponse } from 'next/server';
import { evaluateAllTriggers } from '@/lib/lifecycle/engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/lifecycle-triggers
 * Daily cron: evaluate all active lifecycle triggers.
 * Runs AFTER conviction-scores and listing-momentum crons.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await evaluateAllTriggers();
    console.log(`[Cron/LifecycleTriggers] Evaluated: ${result.evaluated}, Fired: ${result.fired}, Suppressed: ${result.suppressed}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron/LifecycleTriggers] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
