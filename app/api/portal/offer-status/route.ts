/**
 * GET /api/portal/offer-status?email=...
 *
 * Returns inquiry/offer statuses for a client email.
 * Shows what listings they've inquired about and the current status.
 * Used by the client-facing offer tracker page.
 *
 * No auth required — uses email lookup (same as favorites sync).
 * Only returns non-PII status data (no agent names, no internal notes).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  // Find lead by email
  const lead = await prisma.lead.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      first_name: true,
      actions: {
        select: {
          id: true,
          action: true,
          listing_id: true,
          comment: true,
          created_at: true,
          listing: {
            select: {
              listing_id: true,
              address: true,
              list_price: true,
              listing_type: true,
              status: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ inquiries: [], message: 'No inquiries found for this email.' });
  }

  // Map actions to client-friendly format
  const inquiries = lead.actions.map((a) => {
    const addr = a.listing?.address as { StreetNumber?: string; StreetName?: string; City?: string } | null;
    const address = addr
      ? `${addr.StreetNumber || ''} ${addr.StreetName || ''}`.trim() || 'Address on file'
      : 'Address on file';

    // Derive status from the action type
    const statusMap: Record<string, string> = {
      liked: 'saved',
      disliked: 'passed',
      discuss: 'reviewing',
      schedule: 'showing_scheduled',
      offer: 'offer_submitted',
    };

    return {
      id: a.id.toString(),
      type: a.action,
      listingAddress: address,
      listingPrice: a.listing?.list_price ? Number(a.listing.list_price) : null,
      listingType: a.listing?.listing_type || null,
      status: statusMap[a.action] || 'submitted',
      submittedAt: a.created_at.toISOString(),
      updatedAt: a.created_at.toISOString(),
    };
  });

  return NextResponse.json({
    firstName: lead.first_name,
    inquiries,
  });
}
