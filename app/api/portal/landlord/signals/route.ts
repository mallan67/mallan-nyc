// POST /api/portal/landlord/signals
// First-party landlord workflow signals: vacancy cost, relist timing, docs, showing readiness.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isAuthError, logAuditEvent, requirePortalRole } from "@/lib/auth";
import { normalizeLandlordSignalPayload } from "@/lib/rental-signals/summary";
import { resolveOwnedListingId } from "@/lib/portal/listing-ownership";

const SIGNAL_EVENTS = [
  "landlord_vacancy_cost_estimate",
  "landlord_relist_signal",
  "landlord_document_readiness_update",
  "landlord_showing_workflow_update",
];

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requirePortalRole(req, "landlord");
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = normalizeLandlordSignalPayload(body);
  if (
    payload.monthly_rent === null &&
    payload.expected_vacancy_days === null &&
    payload.monthly_carrying_cost === null &&
    !payload.lease_end_date &&
    !payload.relist_timing &&
    !payload.tenant_renewal_intent &&
    !payload.document_readiness &&
    !payload.showing_readiness &&
    payload.vacant_now === null
  ) {
    return NextResponse.json({ error: "Provide at least one landlord signal" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      lease_end_date: true,
      rent_per_month: true,
      active_rental_listing_id: true,
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Landlord not found" }, { status: 404 });
  }

  // A LANDLORD MAY ONLY ATTACH SIGNALS TO A LISTING THEY OWN.
  //
  // Same defect as the seller route: this was
  // `payload.listing_id || lead.active_rental_listing_id || null`, where the
  // first term is caller-supplied and unchecked and the second is the unverified
  // `Lead` backref hint. The value is written into `PortalEvent.listing_id` —
  // durable Mallan activity/audit history, read by the agent's rental-signal
  // panel. `owner_client_id` is the only authorization.
  const owned = await resolveOwnedListingId(prisma, {
    leadId: lead.id,
    listingType: "rent",
    requestedListingId: payload.listing_id,
    hintedListingId: lead.active_rental_listing_id,
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
  // May legitimately be null: a landlord planning a relist before the listing
  // exists. Recording no attribution is truthful; inventing one is not.
  const listingId = owned.listingId;

  const metadata = {
    ...payload,
    listing_id: listingId,
    lease_end_date: payload.lease_end_date || lead.lease_end_date?.toISOString() || null,
    monthly_rent: payload.monthly_rent ?? (lead.rent_per_month ? Number(lead.rent_per_month) : null),
  };

  const created = await prisma.$transaction(
    SIGNAL_EVENTS.map((eventType) =>
      prisma.portalEvent.create({
        data: {
          lead_id: lead.id,
          workspace: "landlord",
          event_type: eventType,
          listing_id: listingId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  await logAuditEvent(
    "landlord_signals_captured",
    "lead",
    lead.id.toString(),
    auth,
    {
      listing_id: listingId,
      event_count: created.length,
      relist_timing: metadata.relist_timing,
      tenant_renewal_intent: metadata.tenant_renewal_intent,
      estimated_vacancy_cost: metadata.estimated_vacancy_cost,
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
