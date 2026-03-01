// GET /api/portal/listings
// Listings shared with this client (via actions). Lead users only.
// Masks agent personal info per REBNY rules for buyer/tenant portals.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true },
  });

  // Find all listings this client has interacted with
  const actions = await prisma.clientListingAction.findMany({
    where: { lead_id: auth.userId },
    include: {
      listing: true,
    },
  });

  // Group by listing, attach reaction status
  const listingMap = new Map<string, {
    listing: typeof actions[0]["listing"];
    reactions: Record<string, boolean>;
  }>();

  for (const a of actions) {
    const lid = a.listing_id.toString();
    // Skip owner opt-out listings
    if (a.listing.owner_opt_out) continue;

    if (!listingMap.has(lid)) {
      listingMap.set(lid, {
        listing: a.listing,
        reactions: {},
      });
    }
    listingMap.get(lid)!.reactions[a.action] = true;
  }

  const isBuyerOrTenant = lead?.portal_role === "buyer" || lead?.portal_role === "tenant";

  const listings = Array.from(listingMap.values()).map(({ listing, reactions }) => ({
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    status: listing.status,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    property_sub_type: listing.property_sub_type,
    list_price: listing.list_price.toString(),
    bedrooms_total: listing.bedrooms_total,
    bathrooms_full: listing.bathrooms_full,
    bathrooms_half: listing.bathrooms_half,
    living_area: listing.living_area?.toString() ?? null,
    borough: listing.borough,
    neighborhood: listing.neighborhood,
    address: listing.internet_address_display_yn ? listing.address : { street: "Address Undisclosed" },
    features: listing.features,
    media: listing.media,
    // Mask agent info for buyer/tenant portals per REBNY
    agent_info: isBuyerOrTenant
      ? { company: (listing.agent_info as Record<string, unknown>)?.company ?? null }
      : listing.agent_info,
    reactions,
  }));

  return NextResponse.json({ listings });
}
