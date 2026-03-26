// GET /api/crm/listing-views?lead_id=X — views for a client grouped by listing
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const leadId = req.nextUrl.searchParams.get('lead_id');
  if (!leadId) {
    return NextResponse.json({ error: 'lead_id query param required' }, { status: 400 });
  }

  const views = await prisma.listingView.findMany({
    where: { lead_id: BigInt(leadId) },
    orderBy: { viewed_at: 'desc' },
    take: 500,
  });

  // Group by listing_id
  const grouped: Record<string, {
    listing_id: string;
    total_views: number;
    unique_viewers: number;
    last_viewed: string;
    devices: Record<string, number>;
    views: Array<{ viewed_at: string; device_type: string | null; ip_hash: string | null }>;
  }> = {};

  for (const v of views) {
    if (!grouped[v.listing_id]) {
      grouped[v.listing_id] = {
        listing_id: v.listing_id,
        total_views: 0,
        unique_viewers: 0,
        last_viewed: v.viewed_at.toISOString(),
        devices: {},
        views: [],
      };
    }
    const g = grouped[v.listing_id];
    g.total_views++;
    if (v.device_type) g.devices[v.device_type] = (g.devices[v.device_type] || 0) + 1;
    g.views.push({
      viewed_at: v.viewed_at.toISOString(),
      device_type: v.device_type,
      ip_hash: v.ip_hash,
    });
  }

  // Count unique viewers (distinct ip_hash)
  for (const g of Object.values(grouped)) {
    g.unique_viewers = new Set(g.views.map((v) => v.ip_hash).filter(Boolean)).size;
  }

  return NextResponse.json({
    lead_id: leadId,
    listings: Object.values(grouped),
    total_views: views.length,
  });
}
