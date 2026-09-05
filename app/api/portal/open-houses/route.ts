// /api/portal/open-houses — GET: upcoming open houses, POST: RSVP
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access only" }, { status: 403 });
  }

  // Get client's liked listing DB IDs
  const liked = await prisma.clientListingAction.findMany({
    where: { lead_id: auth.userId, action: "liked" },
    select: { listing_id: true },
  });
  const likedDbIds = liked.map((f) => f.listing_id);

  if (likedDbIds.length === 0) {
    return NextResponse.json({ openHouses: [] });
  }

  // Get upcoming open houses for these listings
  const openHouses = await prisma.showing.findMany({
    where: {
      listing_id: { in: likedDbIds },
      type: "openhouse",
      date: { gte: new Date() },
      status: { in: ["scheduled", "confirmed"] },
    },
    include: {
      listing: { select: { listing_id: true, address: true } },
    },
    orderBy: { date: "asc" },
    take: 50,
  });

  return NextResponse.json({ openHouses: openHouses.map((oh) => ({
      id: oh.id.toString(),
      listing_id: oh.listing?.listing_id || null,
      address: oh.listing?.address || null,
      date: oh.date.toISOString(),
      time: oh.time,
      notes: oh.notes,
    })),
  });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access only" }, { status: 403 });
  }

  // Sellers and landlords manage open houses — they do not RSVP as attendees
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true },
  });
  if (lead?.portal_role === "seller" || lead?.portal_role === "landlord") {
    return NextResponse.json(
      { error: "Sellers and landlords do not RSVP to open houses." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const openHouseId = body.open_house_id as string;
  if (!openHouseId) {
    return NextResponse.json({ error: "open_house_id required" }, { status: 400 });
  }

  // Record RSVP as an audit event
  await prisma.auditEvent.create({
    data: {
      action: "open_house_rsvp",
      entity_type: "showing",
      entity_id: openHouseId,
      user_type: "lead",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
    },
  });

  // Notify the listing agent
  const showing = await prisma.showing.findUnique({
    where: { id: BigInt(openHouseId) },
    select: { agent_id: true },
  });
  if (showing) {
    await prisma.notification.create({
      data: {
        recipient_type: "agent",
        recipient_id: showing.agent_id,
        channel: "in_app",
        type: "open_house_rsvp",
        title: "Open House RSVP",
        body: "A client has RSVP'd for your upcoming open house.",
        data: { lead_id: auth.userId.toString(), showing_id: openHouseId },
        status: "pending",
      },
    });
  }

  return NextResponse.json({ message: "RSVP confirmed" }, { status: 201 });
}
