// GET /api/portal/favorites — Client's favorited/liked listings
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeListingForPortal } from "@/lib/compliance/dto";
import { buildSearchDisplayWhere } from "@/lib/search/listing-access-decision";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access only" }, { status: 403 });
  }

  const actions = await prisma.clientListingAction.findMany({
    where: {
      lead_id: auth.userId,
      action: "liked",
    },
    orderBy: { created_at: "desc" },
    select: { listing_id: true },
    take: 100,
  });

  const listingDbIds = actions.map((a) => a.listing_id);

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true },
  });
  const portalRole = lead?.portal_role ?? "buyer";

  const listings = listingDbIds.length > 0
    ? await prisma.listing.findMany({
        where: {
          id: { in: listingDbIds },
          ...buildSearchDisplayWhere(),
        },
        select: {
          id: true,
          listing_id: true,
          status: true,
          listing_type: true,
          property_type: true,
          list_price: true,
          bedrooms_total: true,
          bathrooms_full: true,
          bathrooms_half: true,
          living_area: true,
          address: true,
          features: true,
          media: true,
          agent_info: true,
          neighborhood: true,
          borough: true,
          property_sub_type: true,
          internet_address_display_yn: true,
          internet_entire_listing_display_yn: true,
          participant_only: true,
          owner_opt_out: true,
        },
      })
    : [];

  const serialized = listings
    .map((listing) => sanitizeListingForPortal(listing, portalRole))
    .filter(Boolean);

  return NextResponse.json({ favorites: serialized });
}
