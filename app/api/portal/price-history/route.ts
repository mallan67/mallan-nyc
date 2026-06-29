// /api/portal/price-history — Price change history for seller's listing
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, isAuthError } from "@/lib/auth";
import { canAccessOwnerListing } from "@/lib/portal/listing-ownership";

export async function GET(req: NextRequest) {
  const auth = await requirePortalRole(req, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const listingId = req.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
    select: { id: true, list_price: true, owner_client_id: true },
  });
  // Ownership enforcement (REBNY Art. III §2): role "seller" is not enough — the caller must OWN
  // this listing. Deny non-owners with 404 (not 403) so the listing's existence is not leaked.
  if (!listing || !canAccessOwnerListing(auth, listing.owner_client_id)) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const history = await prisma.priceHistory.findMany({
    where: { listing_id: listing.id },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({
    current_price: Number(listing.list_price),
    history: history.map((h) => ({
      id: h.id.toString(),
      price: Number(h.price),
      previous_price: h.previous_price ? Number(h.previous_price) : null,
      change_type: h.change_type,
      notes: h.notes,
      date: h.created_at,
    })),
  });
}
