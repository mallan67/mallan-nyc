// GET /api/portal/favorites — Client's favorited/liked listings
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

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

  const listings = listingDbIds.length > 0
    ? await prisma.listing.findMany({
        where: {
          id: { in: listingDbIds },
          idx_display_yn: true,
          owner_opt_out: false,
          participant_only: false,
          internet_entire_listing_display_yn: true,
        },
        select: {
          listing_id: true,
          status: true,
          list_price: true,
          bedrooms_total: true,
          bathrooms_full: true,
          living_area: true,
          address: true,
          media: true,
          neighborhood: true,
          borough: true,
          property_sub_type: true,
        },
      })
    : [];

  const serialized = listings.map((l) => ({
    ...l,
    list_price: l.list_price.toString(),
    living_area: l.living_area?.toString() ?? null,
  }));

  return NextResponse.json({ favorites: serialized });
}
