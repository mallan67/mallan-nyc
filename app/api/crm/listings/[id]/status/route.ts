// PATCH /api/crm/listings/[id]/status
// Status state machine transition with REBNY RLS rules enforcement.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";

// REBNY RLS status state machine
// Valid transitions map: current → allowed next statuses
const STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Active", "ComingSoon"],
  ComingSoon: ["Active", "Withdrawn"],
  Active: ["ActiveUnderContract", "Pending", "Withdrawn", "Expired"],
  ActiveUnderContract: ["Active", "Pending", "Withdrawn"],
  Pending: ["Sold", "Rented", "Active", "Withdrawn"],
  Sold: [], // Terminal
  Rented: [], // Terminal
  Withdrawn: ["Active", "Draft"],
  Expired: ["Active", "Draft"],
  Cancelled: [], // Terminal
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Resolve listing
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
  }

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: { status: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus) {
    return NextResponse.json(
      { error: "Missing 'status' field" },
      { status: 400 }
    );
  }

  // Validate transition
  const currentStatus = listing.status;
  const allowed = STATUS_TRANSITIONS[currentStatus];

  if (!allowed) {
    return NextResponse.json(
      {
        error: `Unknown current status: ${currentStatus}`,
        current: currentStatus,
      },
      { status: 400 }
    );
  }

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        current: currentStatus,
        allowed,
      },
      { status: 422 }
    );
  }

  // Terminal statuses (Sold/Rented) require broker approval
  if (
    (newStatus === "Sold" || newStatus === "Rented") &&
    auth.role !== "BROKER"
  ) {
    return NextResponse.json(
      { error: "Sold/Rented status requires broker approval" },
      { status: 403 }
    );
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: newStatus,
      modification_timestamp: new Date(),
    },
  });

  await logAuditEvent(
    "status_change",
    "listing",
    listing.id.toString(),
    auth,
    { previous_status: currentStatus, new_status: newStatus },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    previous_status: currentStatus,
    status: newStatus,
  });
}
