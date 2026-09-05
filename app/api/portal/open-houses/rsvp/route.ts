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

  // PR-CRM.3 (2026-05-24) — explicit consent capture per CRM Backbone Audit
  // §6 finding (TCPA/CAN-SPAM gap on RSVP). The audit found this route
  // silently accepted submissions without verifying the user explicitly
  // consented to be contacted about the open house / listing. We now
  // require `consent: true` in the body and refresh Lead.consent_captured_at
  // on success. Per spec: do NOT create a misleading success on missing
  // consent — fail fast with 422 before any DB write.
  if (body.consent !== true) {
    return NextResponse.json(
      {
        error:
          "Explicit consent is required to RSVP. Please confirm you agree to be contacted about this open house.",
        consent_required: true,
      },
      { status: 422 },
    );
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
      actor_user_id: session.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: {
        open_house_id: openHouseId,
        ...(listingId ? { listing_id: listingId } : {}),
        consent_captured_at: new Date().toISOString(),
      },
    },
  });

  // PR-CRM.3 — refresh consent timestamp on the Lead row (only when the
  // session belongs to a lead; agents don't carry this column on the
  // Agent model). Best-effort: a missing-lead failure should not bubble
  // up as a 500 to the user.
  if (session.userType === "lead") {
    try {
      await prisma.lead.update({
        where: { id: session.userId },
        data: { consent_captured_at: new Date() },
      });
    } catch (err) {
      // Lead row may not exist (orphaned session) — log but don't fail
      // the RSVP since the audit_event has already captured the consent.
      console.warn("[RSVP] consent_captured_at refresh failed:", err);
    }
  }

  return NextResponse.json({ success: true, message: "RSVP confirmed" });
}

