// PATCH /api/crm/listings/[id]/status
// Status state machine transition with REBNY RLS rules enforcement.
// Includes DOM tracking per UCBA 2026 (30-day reset).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { computeDomTransition } from "@/lib/compliance/dom-tracker";
import { assertRlsCompliantPayload } from "@/lib/compliance/rls-enforcement";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

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
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
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

  // RLS Enforcement Gate — validate status-related UCBA rules (Coming Soon, terminal, etc.)
  const existingRaw = (listing.raw_data as Record<string, unknown>) ?? {};
  const enforcement = assertRlsCompliantPayload(
    { ...existingRaw, MlsStatus: newStatus },
    {
      listingType: (listing.listing_type as "sale" | "rent") ?? "sale",
      isNewDevelopment: (existingRaw.NewDevelopmentYN as boolean) === true,
      currentStatus: newStatus,
      previousStatus: currentStatus,
      statusChangedAt: listing.status_changed_at ?? undefined,
    }
  );
  if (!enforcement.passed) {
    return NextResponse.json(
      {
        error: "Status change blocked by RLS enforcement gate",
        blockers: enforcement.blockers,
        warnings: enforcement.warnings,
      },
      { status: 422 }
    );
  }

  // Compute DOM tracking fields for this transition
  const domUpdate = computeDomTransition(
    {
      status: currentStatus,
      status_changed_at: listing.status_changed_at,
      first_active_date: listing.first_active_date,
      days_on_market: listing.days_on_market,
    },
    newStatus
  );

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: newStatus,
      modification_timestamp: new Date(),
      status_changed_at: domUpdate.status_changed_at,
      first_active_date: domUpdate.first_active_date,
      days_on_market: domUpdate.days_on_market,
      cumulative_days_on_market: domUpdate.cumulative_days_on_market,
    },
  });

  const domReset = domUpdate.days_on_market === 0 && listing.days_on_market > 0;

  await logAuditEvent(
    "status_change",
    "listing",
    listing.id.toString(),
    auth,
    {
      previous_status: currentStatus,
      new_status: newStatus,
      days_on_market: domUpdate.days_on_market,
      ...(domReset ? { dom_reset: true, previous_dom: listing.days_on_market } : {}),
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    previous_status: currentStatus,
    status: newStatus,
    days_on_market: domUpdate.days_on_market,
    ...(domReset ? { dom_reset: true } : {}),
  });
}
