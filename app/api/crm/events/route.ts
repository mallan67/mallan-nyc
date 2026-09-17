// /api/crm/events — POST: Create activity log entry. GET: List recent activity for an entity.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import type { Prisma } from "@prisma/client";
import { assertLeadAccess } from "@/lib/crm/access";

// ── ACTIVITY TYPES OWNED BY GOVERNED SERVER WORKFLOWS.
//
//    These are not merely "important" event types. They are the two ANCHORS that
//    lib/crm/nurture-due.ts trusts to decide a client's six-month relationship cadence:
//
//      client_report_sent  + metadata.qualifies_nurture + metadata.delivery_status
//        written only by POST /api/crm/clients/[id]/report-send, after auth, ownership, an
//        inactive-client refusal, server-side listing eligibility, a suppression-checked send,
//        an accepted SMTP result, a recognised substantive report type and current canonical
//        Nurture membership.
//
//      status_change + metadata.new_pipeline_stage
//        written only by the client PATCH on a real stage transition, and by the sales promote
//        route.
//
//    This endpoint writes caller-supplied activity_type and caller-supplied metadata straight into
//    the same table behind nothing but lead access. So until now every one of those checks could be
//    walked around by posting the finished record directly — the governed route could validate
//    purpose, audience, report class and membership while this one manufactured the same
//    authoritative row for free. That was survivable while the ledger had no reader. Lane 3
//    Packet 2 gave it one, which makes it a forgery surface rather than untidiness.
//
//    The fix protects the EXISTING ledger rather than adding another. A generic caller keeps the
//    generic vocabulary; the governed types are refused here and written only where they are earned.
const SERVER_OWNED_ACTIVITY_TYPES = new Set([
  "client_report_sent",
  "client_report_send_failed",
  "status_change",
]);

// Metadata keys that carry a canonical DECISION rather than a description. Stripped from generic
// events as defence in depth: refusing the types above is what closes the forgery, but a future
// edit that adds a type should not silently reopen it.
const SERVER_OWNED_METADATA_KEYS = new Set([
  "qualifies_nurture",
  "delivery_status",
  "new_pipeline_stage",
  "old_pipeline_stage",
]);

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const entityId = searchParams.get("entity_id") || searchParams.get("lead_id");
  const entityType = searchParams.get("entity_type"); // "client" | "listing"
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  if (!entityId) {
    return NextResponse.json(
      { error: "entity_id (or lead_id) is required" },
      { status: 400 }
    );
  }

  // If entity_type is "listing", resolve the owner's lead_id
  let leadId: bigint | null = null;
  if (entityType === "listing") {
    const listing = await prisma.listing.findFirst({
      where: { listing_id: entityId },
      select: { owner_client_id: true },
    });
    leadId = listing?.owner_client_id ?? null;
    if (!leadId) {
      // No owner linked — return empty events
      return NextResponse.json({ events: [] });
    }
  } else {
    leadId = safeBigInt(entityId);
  }

  if (!leadId) {
    return NextResponse.json(
      { error: "Invalid entity_id" },
      { status: 400 }
    );
  }

  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  // Optional filters
  const typeFilter = searchParams.get("type");
  const where: Prisma.ActivityLogWhereInput = { lead_id: leadId };
  if (typeFilter) {
    where.activity_type = typeFilter;
  }

  const events = await prisma.activityLog.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id.toString(),
      activity_type: e.activity_type,
      title: e.title,
      detail: e.detail,
      metadata: e.metadata,
      actor_type: e.actor_type,
      actor_id: e.actor_id?.toString() ?? null,
      created_at: e.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    entity_type: _entity_type,
    entity_id,
    activity_type,
    title,
    detail,
    metadata,
  } = body as {
    entity_type?: string;
    entity_id?: string;
    activity_type?: string;
    title?: string;
    detail?: string;
    metadata?: Record<string, unknown>;
  };

  if (!entity_id || !activity_type || !title) {
    return NextResponse.json(
      { error: "entity_id, activity_type, and title are required" },
      { status: 400 }
    );
  }

  // A generic event may not claim to be a governed one. Checked before lead access so the refusal
  // does not depend on which client was named.
  if (SERVER_OWNED_ACTIVITY_TYPES.has(String(activity_type))) {
    return NextResponse.json(
      {
        error:
          "This activity type is written only by the governed workflow that owns it and cannot be created through the generic events endpoint.",
        activity_type: String(activity_type),
      },
      { status: 403 },
    );
  }

  const leadId = safeBigInt(entity_id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  // REBNY: Scrub PII from event metadata before storage
  // Events must not contain SSN, bank accounts, or other sensitive PII
  let safeMetadata = metadata ?? {};
  if (typeof safeMetadata === 'object' && safeMetadata !== null) {
    const PII_PATTERNS = ['ssn', 'social_security', 'bank_account', 'routing_number', 'passport', 'driver_license', 'credit_card'];
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(safeMetadata)) {
      if (PII_PATTERNS.some(p => key.toLowerCase().includes(p))) continue;
      // Canonical decision keys are stripped for the same reason the governed types are refused
      // above: they are conclusions reached by a workflow, not facts a caller gets to assert.
      if (SERVER_OWNED_METADATA_KEYS.has(key)) continue;
      cleaned[key] = val;
    }
    safeMetadata = cleaned;
  }

  const event = await prisma.activityLog.create({
    data: {
      lead_id: leadId,
      activity_type: String(activity_type),
      title: String(title),
      detail: detail ? String(detail) : null,
      metadata: safeMetadata as Prisma.InputJsonValue,
      actor_type: auth.role === "BROKER" ? "broker" : "agent",
      actor_id: auth.userId,
    },
  });

  return NextResponse.json(
    {
      id: event.id.toString(),
      activity_type: event.activity_type,
      title: event.title,
      created_at: event.created_at,
    },
    { status: 201 }
  );
}
