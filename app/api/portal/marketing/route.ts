// /api/portal/marketing — Marketing activity log for seller's listing
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
    select: { id: true },
  });
  if (!listing) {
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
