import { NextRequest, NextResponse } from 'next/server';
import { isValidBehavioralEvent, recordBehavioralEvent } from '@/lib/behavioral/events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analytics/behavioral
 *
 * Records granular behavioral micro-signals from the frontend.
 * Accepts anonymous sessions (no auth required).
 * Privacy-safe: no IP logging, no fingerprinting.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!isValidBehavioralEvent(data)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    // Fire-and-forget: don't block the response on DB write
    recordBehavioralEvent(data).catch((err) =>
      console.error('[Behavioral] Failed to record event:', err)
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
