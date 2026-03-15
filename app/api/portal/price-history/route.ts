// /api/portal/price-history — Price change history for seller's listing
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access required" }, { status: 403 });
  }

  const listingId = req.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: { listing_id: listingId },
    select: { id: true, list_price: true },
  });
  if (!listing) {
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
