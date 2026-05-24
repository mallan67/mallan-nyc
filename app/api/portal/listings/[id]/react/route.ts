// POST /api/portal/listings/[id]/react
// Client reacts to a listing (like, dislike, discuss, schedule). Toggle on/off.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { checkPortalWriteRateLimit } from "@/lib/middleware/rate-limiter";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { createInquiry } from "@/lib/inquiries/create";
import { isListingDisplayable } from "@/lib/search/listing-access-decision";
import { recordPortalEvent } from "@/lib/portal/events";

type RouteParams = { params: Promise<{ id: string }> };

const VALID_ACTIONS = ["liked", "disliked", "discuss", "schedule"];

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;

  // PR-CRM.5 (2026-05-24) — portal_write rate limit (30/hr/user)
  const limited = await checkPortalWriteRateLimit(session.userId);
  if (limited) return limited;

  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requirePortalRole(req, "buyer", "renter");
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listingId = safeBigInt(id);
  if (!listingId) {
    return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // PR-CRM.3 (2026-05-24) — explicit consent capture per CRM Backbone Audit
  // §6 finding (TCPA/CAN-SPAM gap on favorites / portal reactions). Maya's
  // spec referenced app/api/portal/favorites/route.ts as the favorites POST
  // path, but that file only exposes GET; the actual favorites WRITE path
  // is this react endpoint (action: "liked" is the canonical favorite
  // toggle; "disliked"/"discuss"/"schedule" are sibling engagement actions
  // that produce the same downstream TCPA-relevant signals). We gate ALL
  // four actions on `consent: true` to be consistent with the RSVP gate
  // and refresh Lead.consent_captured_at on success.
  if (body.consent !== true) {
    return NextResponse.json(
      {
        error:
          "Explicit consent is required to react to a listing. Please confirm you agree to be contacted about this property.",
        consent_required: true,
      },
      { status: 422 },
    );
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
  if (!isListingDisplayable(listing)) {
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

    if (auth.userType === "lead") {
      await recordPortalEvent({
        leadId: auth.userId,
        eventType: "reaction",
        listingId: listing.listing_id,
        metadata: { action, active: false },
      });
    }

    // PR-CRM.3 — refresh consent_captured_at on toggle-off too: the
    // user did just provide explicit consent (gated above), so the
    // timestamp should advance regardless of which branch we take.
    await prisma.lead.update({
      where: { id: auth.userId },
      data: { consent_captured_at: new Date() },
    });

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

  // Real Inquiry row (Workstream C1 of master refactor) — only for the
  // 'liked' (favorite) action. Other actions (disliked, discuss, schedule)
  // aren't in the Inquiry source enum; they remain as ClientListingAction
  // rows only. Never throws — a missing table or other failure does not
  // break the react endpoint.
  if (auth.userType === "lead") {
    await recordPortalEvent({
      leadId: auth.userId,
      eventType: "reaction",
      listingId: listing.listing_id,
      metadata: { action, active: true },
    });
  }

  if (action === "liked") {
    await createInquiry({
      source: "favorite",
      listingId: listing.listing_id,
      leadId: auth.userId,
      message: comment,
      userAgent: req.headers.get("user-agent"),
      rawClientIp: req.headers.get("x-forwarded-for") ?? null,
      metadata: {
        listing_db_id: listingId.toString(),
      },
    });
  }

  // Update engagement timestamps on Lead
  // PR-CRM.3 — also refresh consent_captured_at since the user just
  // explicitly consented (body.consent === true gated above). Same
  // TCPA/CAN-SPAM trail pattern as the inquiry / contact / cma routes.
  await prisma.lead.update({
    where: { id: auth.userId },
    data: {
      last_click_at: new Date(),
      last_response_at: new Date(),
      consent_captured_at: new Date(),
    },
  });

  return NextResponse.json({ action, active: true });
}
