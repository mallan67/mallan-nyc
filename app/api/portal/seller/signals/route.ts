// POST /api/portal/seller/signals
// First-party seller planning signals: valuation, proceeds, closing costs, readiness.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isAuthError, logAuditEvent, requirePortalRole } from "@/lib/auth";
import { normalizeSellerSignalPayload } from "@/lib/seller-signals/summary";

import { checkPortalWriteRateLimit } from "@/lib/middleware/rate-limiter";
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
  // PR-CRM.5 (2026-05-24) — portal_write rate limit (30/hr/user)
  const limited = await checkPortalWriteRateLimit(auth.userId);
  if (limited) return limited;


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

  const listingId = payload.listing_id || lead.active_sale_listing_id || null;
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
