import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;
  return NextResponse.json({ items: [], total: 0 });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;

  const body = await req.json();
  const openHouseId = (body.open_house_id || body.event_id) as string;
  const listingId = body.listing_id as string | undefined;

  if (!openHouseId) {
    return NextResponse.json(
      { error: "open_house_id or event_id is required" },
      { status: 400 },
    );
  }

  // Record the RSVP as an audit event
  await prisma.auditEvent.create({
    data: {
      action: "create",
      entity_type: "open_house_rsvp",
      entity_id: openHouseId,
      user_type: session.userType === "lead" ? "lead" : "agent",
      user_id: session.userId,
      changes: {
        open_house_id: openHouseId,
        ...(listingId ? { listing_id: listingId } : {}),
      },
    },
  });

  return NextResponse.json({ success: true, message: "RSVP confirmed" });
}

