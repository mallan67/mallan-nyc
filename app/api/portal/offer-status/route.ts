/**
 * GET /api/portal/offer-status
 *
 * Returns inquiry/offer statuses for the authenticated client.
 * Shows what listings they've inquired about and the current status.
 * Used by the client-facing offer tracker page.
 *
 * Only returns non-PII status data (no agent names, no internal notes).
 */
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalRole, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // ALL FOUR DEAL-SIDE ROLES, not just the sale side.
  //
  // This gate read ("buyer", "seller"), so a RENTER and a LANDLORD got 403 on
  // their OWN record. It was not protecting anything: the query below is keyed
  // on `auth.userId` and returns nothing that belongs to anyone else, so the
  // gate was withholding a client's data from that client. A renter can inquire
  // on listings (the portal listings route is gated "buyer","renter") and a
  // landlord signs leases and retains counsel exactly as a seller does.
  //
  // Widened, not removed — a lead carrying any other portal_role is still 403.
  // Locked by tests/runtime/portal-role-symmetry-self-scoped.test.ts, which also
  // asserts the self-scoping that makes the widening safe.
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
  if (isAuthError(auth)) return auth;

  // Find lead by authenticated user ID
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
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
