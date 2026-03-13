import { NextRequest, NextResponse } from 'next/server';
import { batchComputeListingMomentum } from '@/lib/momentum/scorer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/listing-momentum
 * Daily cron: recompute listing momentum scores for all active listings.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await batchComputeListingMomentum();
    console.log(`[Cron/ListingMomentum] Processed: ${result.processed}, Updated: ${result.updated}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron/ListingMomentum] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
