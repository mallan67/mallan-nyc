// /api/crm/events — POST: Create activity log entry. GET: List recent activity for an entity.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const entityId = searchParams.get("entity_id") || searchParams.get("lead_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  if (!entityId) {
    return NextResponse.json(
      { error: "entity_id (or lead_id) is required" },
      { status: 400 }
    );
  }

  const leadId = safeBigInt(entityId);
  if (!leadId) {
    return NextResponse.json(
      { error: "Invalid entity_id" },
      { status: 400 }
    );
  }

  // Ownership check: agent can only see their own clients' events
  if (auth.role !== "BROKER") {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { agent_id: true },
    });
    if (lead && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const events = await prisma.activityLog.findMany({
    where: { lead_id: leadId },
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
    entity_type,
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

  const leadId = safeBigInt(entity_id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  // Ownership check
  if (auth.role !== "BROKER") {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { agent_id: true },
    });
    if (lead && lead.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const event = await prisma.activityLog.create({
    data: {
      lead_id: leadId,
      activity_type: String(activity_type),
      title: String(title),
      detail: detail ? String(detail) : null,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
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
