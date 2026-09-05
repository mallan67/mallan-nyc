// /api/crm/listing-engagement
// GET: Fetch engagement records (sends + reactions) for a listing or client.
// POST: Create a new engagement record (send, reaction, view).
// These are canonical records — independent of events, survive event pruning.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

/**
 * GET /api/crm/listing-engagement?listing_id=X or ?client_id=X
 * Returns engagement records for a listing or client.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const listingId = req.nextUrl.searchParams.get("listing_id");
  const clientId = req.nextUrl.searchParams.get("client_id");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 500);

  // Build where clause — must have at least one filter
  // Using raw SQL via Prisma.$queryRaw since ListingEngagement may not exist as a model yet
  // Fallback: store in a JSON field or use the audit_events table
  try {
    // Try to query from a dedicated table if it exists
    const where: Record<string, unknown> = {};
    if (listingId) where.listing_id = listingId;
    if (clientId) where.client_id = clientId;

    if (!listingId && !clientId) {
      return NextResponse.json({ error: "listing_id or client_id required" }, { status: 400 });
    }
    if (clientId) {
      const access = await assertLeadIdStringAccess(auth, clientId);
      if (access.response) return access.response;
    }

    // Query audit_events as the backing store for engagement records
    // Filter by action types that represent engagement
    const engagementTypes = [
      "listing_sent", "quick_send_executed", "listing_reaction_recorded",
      "listing_viewed", "showing_scheduled",
    ];

    // Query audit events — filter by entity_id matching listing or client
    const entityId = listingId || clientId || "";
    const events = await prisma.auditEvent.findMany({
      where: {
        action: { in: engagementTypes },
        entity_id: entityId,
        ...(auth.role !== "BROKER" ? { user_id: auth.userId } : {}),
      },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        entity_type: true,
        entity_id: true,
        changes: true,
        created_at: true,
        user_id: true,
      },
    });

    // Transform to engagement records
    const records = events.map((e) => {
      const data = (e.changes as Record<string, unknown>) ?? {};
      return {
        id: e.id.toString(),
        type: e.action,
        listingId: e.entity_type === "listing" ? e.entity_id : (data.listingId as string) || null,
        clientId: e.entity_type === "client" ? e.entity_id : (data.clientId as string) || null,
        reaction: (data.reaction as string) || null,
        sentVia: (data.sentVia as string) || (data.method as string) || null,
        agentId: e.user_id?.toString() || null,
        createdAt: e.created_at.toISOString(),
        metadata: data,
      };
    });

    // Compute summary stats
    const sends = records.filter((r) => r.type === "listing_sent" || r.type === "quick_send_executed");
    const reactions = records.filter((r) => r.type === "listing_reaction_recorded");
    const liked = reactions.filter((r) => r.reaction === "liked" || r.reaction === "like");
    const disliked = reactions.filter((r) => r.reaction === "disliked" || r.reaction === "dislike");
    const discussed = reactions.filter((r) => r.reaction === "discuss" || r.reaction === "discuss");
    const showings = records.filter((r) => r.type === "showing_scheduled");

    return NextResponse.json({
      records,
      summary: {
        totalSends: sends.length,
        totalReactions: reactions.length,
        liked: liked.length,
        disliked: disliked.length,
        discussed: discussed.length,
        showings: showings.length,
        engagementRate: sends.length > 0 ? Math.round((reactions.length / sends.length) * 100) : 0,
      },
    });
  } catch {
    // If AuditEvent table doesn't support JSON path queries, return empty
    return NextResponse.json({ records: [], summary: { totalSends: 0, totalReactions: 0, liked: 0, disliked: 0, discussed: 0, showings: 0, engagementRate: 0 } });
  }
}

/**
 * POST /api/crm/listing-engagement
 * Create a canonical engagement record.
 */
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

  const type = body.type as string;
  const listingId = body.listing_id as string | undefined;
  const clientId = body.client_id as string | undefined;
  const reaction = body.reaction as string | undefined;
  const sentVia = body.sent_via as string | undefined;

  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }
  if (clientId) {
    const access = await assertLeadIdStringAccess(auth, clientId);
    if (access.response) return access.response;
  }

  // Store as an audit event (canonical, survives pruning because it's a real DB record)
  const event = await prisma.auditEvent.create({
    data: {
      action: type,
      entity_type: listingId ? "listing" : "client",
      entity_id: listingId || clientId || "",
      user_type: "agent",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: {
        listingId: listingId || null,
        clientId: clientId || null,
        reaction: reaction || null,
        sentVia: sentVia || null,
        ...((body.metadata as Record<string, unknown>) || {}),
      },
    },
  });

  await logAuditEvent(
    type,
    listingId ? "listing" : "client",
    listingId || clientId || "",
    auth,
    { reaction, sentVia },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: event.id.toString(),
    type,
    listingId,
    clientId,
    createdAt: event.created_at.toISOString(),
  }, { status: 201 });
}
