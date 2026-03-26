// POST /api/tracking/listing-view — log a tracked listing view
// Public endpoint — token IS the auth. Silent 204 on any failure.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { validateTrackingToken } from '@/lib/tracking/listing-token';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { token, listing_id } = body as { token?: string; listing_id?: string };
  if (!token || !listing_id || typeof token !== 'string' || typeof listing_id !== 'string') {
    return new NextResponse(null, { status: 204 });
  }

  try {
    // Find recent listing sends for this listing to build candidate list
    const recentSends = await prisma.clientListingAction.findMany({
      where: { listing: { listing_id }, action: 'sent' },
      select: { lead_id: true },
      take: 200,
    });

    if (recentSends.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    const candidates = recentSends.map((s) => ({
      lead_id: s.lead_id,
      listing_id,
    }));

    const match = validateTrackingToken(token, listing_id, candidates);
    if (!match) {
      return new NextResponse(null, { status: 204 });
    }

    // Parse device type from User-Agent
    const ua = req.headers.get('user-agent') || '';
    const deviceType = /mobile|android|iphone|ipad/i.test(ua)
      ? (/ipad|tablet/i.test(ua) ? 'tablet' : 'mobile')
      : 'desktop';

    // Hash IP for unique viewer counting (salted)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const salt = process.env.TRACKING_SECRET || process.env.CRON_SECRET || '';
    const ipHash = createHash('sha256').update(ip + salt).digest('hex').slice(0, 16);

    const referrer = req.headers.get('referer') || null;

    // Log the view
    await prisma.listingView.create({
      data: {
        lead_id: match.leadId,
        listing_id: match.listingId,
        device_type: deviceType,
        ip_hash: ipHash,
        referrer,
      },
    });

    // Update Lead engagement fields + check device preference
    const deviceCounts = await prisma.listingView.groupBy({
      by: ['device_type'],
      where: { lead_id: match.leadId, device_type: { not: null } },
      _count: true,
      orderBy: { _count: { device_type: 'desc' } },
      take: 1,
    });

    const topDevice = deviceCounts[0];
    const updateData: Record<string, unknown> = {
      last_click_at: new Date(),
      last_viewed_listing_id: match.listingId,
      last_viewed_listing_at: new Date(),
    };
    if (topDevice && topDevice._count >= 3) {
      updateData.preferred_device = topDevice.device_type;
    }

    await prisma.lead.update({
      where: { id: match.leadId },
      data: updateData,
    });
  } catch {
    // Silent failure — page always works normally
  }

  return new NextResponse(null, { status: 204 });
}
