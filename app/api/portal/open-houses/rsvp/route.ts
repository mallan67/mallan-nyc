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

  // Parse body defensively — an unprotected JSON parse crashes the handler on
  // any malformed payload (client bug, proxy rewrite, preflight mismatch) and
  // returns an ugly 500 instead of a clean 400 with a clear error string.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

