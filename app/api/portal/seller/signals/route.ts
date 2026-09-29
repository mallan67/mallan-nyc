// POST /api/portal/seller/signals
// First-party seller planning signals: valuation, proceeds, closing costs, readiness.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isAuthError, logAuditEvent, requirePortalRole } from "@/lib/auth";
import { normalizeSellerSignalPayload } from "@/lib/seller-signals/summary";
import { resolveOwnedListingId } from "@/lib/portal/listing-ownership";

const SIGNAL_EVENTS = [
  "seller_valuation_request",
  "seller_proceeds_estimate",
  "seller_closing_cost_estimate",
  "seller_readiness_update",
];

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requirePortalRole(req, "seller", "landlord");
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = normalizeSellerSignalPayload(body);
  if (
    payload.estimated_value === null &&
    payload.desired_sale_price === null &&
    payload.closing_costs === null &&
    !payload.timeline &&
    !payload.urgency &&
    !payload.readiness
  ) {
    return NextResponse.json({ error: "Provide at least one seller signal" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, active_sale_listing_id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  }

  // A SELLER MAY ONLY ATTACH SIGNALS TO A LISTING THEY OWN.
  //
  // This was `payload.listing_id || lead.active_sale_listing_id || null`. The
  // first term is caller-supplied and was never checked; the second is the
  // unverified `Lead` backref hint. Either could name another owner's listing
  // or a Cotality-sourced row, and the value is written into
  // `PortalEvent.listing_id` — Mallan's own activity/audit history, and what the
  // agent's seller-signal panel reads.
  //
  // `owner_client_id` is the canonical relation and the only authorization.
  const owned = await resolveOwnedListingId(prisma, {
    leadId: lead.id,
    listingType: "sale",
    requestedListingId: payload.listing_id,
    hintedListingId: lead.active_sale_listing_id,
  });
  if (!owned.ok) {
    return NextResponse.json(
      {
        error: "That listing is not yours.",
        code: "LISTING_NOT_OWNED",
        listing_id: owned.requested,
      },
      { status: 403 },
    );
  }
  // May legitimately be null: a seller planning a sale before the listing
  // exists. Recording no attribution is truthful; inventing one is not.
  const listingId = owned.listingId;

  const created = await prisma.$transaction(
    SIGNAL_EVENTS.map((eventType) =>
      prisma.portalEvent.create({
        data: {
          lead_id: lead.id,
          workspace: "seller",
          event_type: eventType,
          listing_id: listingId,
          metadata: payload as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  await logAuditEvent(
    "seller_signals_captured",
    "lead",
    lead.id.toString(),
    auth,
    {
      listing_id: listingId,
      event_count: created.length,
      urgency: payload.urgency,
      timeline: payload.timeline,
      readiness: payload.readiness,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({
    ok: true,
    events: created.map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      recorded_at: event.created_at.toISOString(),
    })),
  }, { status: 201 });
}
