// POST /api/portal/listings/[id]/react
// Client reacts to a listing (like, dislike, discuss, schedule). Toggle on/off.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_ACTIONS = ["liked", "disliked", "discuss", "schedule"];

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const listingId = BigInt(parseInt(id));

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;
  const comment = (body.comment as string) ?? null;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify listing exists and is displayable
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.owner_opt_out) {
    return NextResponse.json({ error: "Listing not available" }, { status: 403 });
  }

  // Toggle: if action already exists, delete it; otherwise create it
  const existing = await prisma.clientListingAction.findUnique({
    where: {
      lead_id_listing_id_action: {
        lead_id: auth.userId,
        listing_id: listingId,
        action,
      },
    },
  });

  if (existing) {
    await prisma.clientListingAction.delete({ where: { id: existing.id } });

    await logAuditEvent(
      "delete",
      "lead",
      auth.userId.toString(),
      auth,
      { listing_id: id, action, toggled: "off" },
      req.headers.get("x-forwarded-for") ?? undefined
    );

    return NextResponse.json({ action, active: false });
  }

  await prisma.clientListingAction.create({
    data: {
      lead_id: auth.userId,
      listing_id: listingId,
      action,
      comment,
    },
  });

  await logAuditEvent(
    "create",
    "lead",
    auth.userId.toString(),
    auth,
    { listing_id: id, action, toggled: "on" },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ action, active: true });
}
