// GET /api/portal/offers
// Seller/landlord portal: incoming offers on their listings.
// Uses ClientListingAction with action="offer" (v1 — no separate Offer model).
// Uses centralized DTO for REBNY-compliant address suppression.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeForPublic } from "@/lib/compliance/dto";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  // Verify this is a seller or landlord
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true, agent_id: true },
  });

  if (!lead || !["seller", "landlord"].includes(lead.portal_role ?? "")) {
    return NextResponse.json(
      { error: "Offers are only available for seller/landlord portals" },
      { status: 403 }
    );
  }

  if (!lead.agent_id) {
    return NextResponse.json({ offers: [] });
  }

  // Find listings managed by this client's agent (exclude all restricted listings)
  const agentListings = await prisma.listing.findMany({
    where: {
      agent_id: lead.agent_id,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
    },
    select: {
      id: true,
      listing_id: true,
      address: true,
      list_price: true,
      internet_address_display_yn: true,
    },
  });

  if (agentListings.length === 0) {
    return NextResponse.json({ offers: [] });
  }

  const listingIds = agentListings.map((l) => l.id);

  // Find "offer" actions on those listings
  const offerActions = await prisma.clientListingAction.findMany({
    where: {
      listing_id: { in: listingIds },
      action: "offer",
    },
    include: {
      lead: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const listingMap = new Map(
    agentListings.map((l) => [l.id.toString(), l])
  );

  const offers = offerActions.map((a) => {
    const listing = listingMap.get(a.listing_id.toString());
    // Centralized address suppression via DTO (REBNY RLS compliance)
    const sanitized = listing
      ? sanitizeForPublic({
          address: listing.address,
          internet_address_display_yn: listing.internet_address_display_yn,
        })
      : null;
    return {
      id: a.id.toString(),
      listing_id: a.listing_id.toString(),
      listing_address: sanitized?.address ?? null,
      list_price: listing?.list_price?.toString() ?? null,
      comment: a.comment,
      created_at: a.created_at,
      from: a.lead
        ? {
            id: a.lead.id.toString(),
            name: `${a.lead.first_name} ${a.lead.last_name}`,
          }
        : null,
    };
  });

  return NextResponse.json({ offers });
}
