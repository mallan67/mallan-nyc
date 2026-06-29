// /api/portal/marketing — Marketing activity log for seller's listing
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
    select: { id: true, owner_client_id: true },
  });
  // Ownership enforcement (REBNY Art. III §2): the caller must OWN this listing to see its
  // marketing log. Deny non-owners with 404 (not 403) so existence is not leaked.
  if (!listing || !canAccessOwnerListing(auth, listing.owner_client_id)) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const activities = await prisma.marketingActivity.findMany({
    where: { listing_id: listing.id },
    orderBy: { completed_at: "desc" },
    include: { agent: { select: { full_name: true } } },
  });

  return NextResponse.json({
    count: activities.length,
    activities: activities.map((a) => ({
      id: a.id.toString(),
      type: a.activity_type,
      title: a.title,
      description: a.description,
      completed_at: a.completed_at,
      agent: a.agent?.full_name || null,
    })),
  });
}
