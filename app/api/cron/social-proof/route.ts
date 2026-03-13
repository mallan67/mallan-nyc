import { NextRequest, NextResponse } from 'next/server';
import { batchComputeSocialProof } from '@/lib/social-proof/aggregator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/social-proof
 * Daily cron: recompute social proof cache for all listings with activity.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await batchComputeSocialProof();
    console.log(`[Cron/SocialProof] Processed: ${result.processed}, Updated: ${result.updated}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron/SocialProof] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
