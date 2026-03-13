import { NextRequest, NextResponse } from 'next/server';
import { batchComputeConvictionScores } from '@/lib/conviction/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/conviction-scores
 * Daily cron: recompute conviction scores + ghost detection for all active leads.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await batchComputeConvictionScores();
    console.log(`[Cron/ConvictionScores] Processed: ${result.processed}, Updated: ${result.updated}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron/ConvictionScores] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
