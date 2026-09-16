// POST /api/crm/clients/[id]/actions
// Record a client's listing reaction (liked, disliked, discuss, schedule, offer).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
// LICENSEE-ONLY route. Portal clients react through /api/portal/listings/[id]/react, which enforces the
// portal boundary with requirePortalRole and is called directly by app/portal/buyer/page.tsx and
// app/portal/tenant/page.tsx. This route is the CRM / licensee counterpart and must not be a dual-purpose
// endpoint: requireAuth admitted lead sessions, where every sibling client route requires a licensee.
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertLeadAccess } from "@/lib/crm/access";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import {
  evaluateClientDistributionEligibility,
  CLIENT_DISTRIBUTION_REFUSAL,
} from "@/lib/compliance/client-distribution";
import { isComingSoonStatus } from "@/lib/compliance/status";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_ACTIONS = ["liked", "disliked", "discuss", "schedule", "offer"];

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;
  const listingId = body.listing_id as string;
  const comment = (body.comment as string) ?? null;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (!listingId) {
    return NextResponse.json(
      { error: "listing_id is required" },
      { status: 400 }
    );
  }

  // Client access — the ONE canonical helper (lib/crm/access.ts), not a local restatement.
  //
  // This replaced a hand-written `auth.role !== "BROKER" && lead.agent_id !== auth.userId` branch, one of
  // ten inline copies of that predicate in the repo, which ALSO had no else arm: a userType that was
  // neither "agent" nor "lead" fell through to the write with no access check at all. That branch was
  // unreachable in practice — SessionUser.userType is typed "agent" | "lead" and createSession() accepts
  // only those — but validateSession() CASTS the persisted session.user_type rather than validating it, so
  // a legacy or unexpected database value could have crossed the boundary. requireAgentOrBroker above now
  // refuses anything whose userType is not exactly "agent", which closes that by construction; this call
  // then decides ownership. Existence (404) vs ownership (403) semantics are preserved by the helper.
  const accessDenied = await assertLeadAccess(auth, leadId);
  if (accessDenied) return accessDenied;

  // Verify listing exists
  // Resolve listing by numeric ID or string listing_id
  const listingBigInt = safeBigInt(listingId);
  let listing;
  if (listingBigInt) {
    listing = await prisma.listing.findUnique({
      where: { id: listingBigInt },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: listingId },
    });
  }
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // REBNY client-facing distribution gate — the SAME canonical boundary listing-sends applies.
  // Recording a reaction on behalf of a client is a client-facing action, so a listing the client may not
  // receive may not be acted on for them either. The four flags are already on `listing`: both lookups
  // above are findUnique() with no select, so Prisma returns every scalar column.
  // This is deliberately a DIFFERENT rule from the ComingSoon check below — see lib/compliance/
  // client-distribution.ts for why the two must not be conflated.
  const distribution = evaluateClientDistributionEligibility(listing);
  if (!distribution.allowed) {
    return NextResponse.json(
      { error: CLIENT_DISTRIBUTION_REFUSAL, reasons: distribution.reasons },
      { status: 400 }
    );
  }

  // UCBA D3/D4: No offers or showings on Coming Soon listings
  if (isComingSoonStatus(listing.status) && (action === "offer" || action === "schedule")) {
    return NextResponse.json(
      { error: `${action === "offer" ? "Offers" : "Showings"} are not permitted for Coming Soon listings (UCBA D3/D4)` },
      { status: 422 }
    );
  }

  const record = await prisma.clientListingAction.upsert({
    where: {
      lead_id_listing_id_action: {
        lead_id: leadId,
        listing_id: listing.id,
        action,
      },
    },
    create: {
      lead_id: leadId,
      listing_id: listing.id,
      action,
      comment,
    },
    update: {
      comment,
    },
  });

  await logAuditEvent(
    "create",
    "lead",
    id,
    auth,
    { listing_id: listingId, action },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: record.id.toString(),
      action: record.action,
      listing_id: record.listing_id.toString(),
    },
    { status: 201 }
  );
}
