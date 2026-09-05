import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const offset = Number(searchParams.get("offset")) || 0;

  if (clientId) {
    const access = await assertLeadIdStringAccess(auth, clientId);
    if (access.response) return access.response;
  }

  const where: Record<string, unknown> = {
    ...(auth.role !== "BROKER" ? { user_id: auth.userId } : {}),
    ...(clientId ? { entity_id: clientId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        action: true,
        entity_type: true,
        entity_id: true,
        user_type: true,
        user_id: true,
        changes: true,
        created_at: true,
      },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  // CRM frontend reads res.events (not res.items)
  return NextResponse.json({
    events: items.map((e) => {
      const meta = (e.changes && typeof e.changes === "object" ? e.changes : {}) as Record<string, unknown>;
      return {
        id: String(e.id),
        type: e.action,
        action: e.action,
        title: meta.title || e.action.replace(/_/g, " "),
        description: meta.description || "",
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        user_type: e.user_type,
        user_id: e.user_id ? String(e.user_id) : null,
        created_at: e.created_at,
      };
    }),
    total,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // CRM sends: { client_id, type, title, description }
  // Also accept: { action, entityType, entityId, metadata }
  const action = body.type || body.action;
  const entityId = body.client_id ? String(body.client_id) : body.entityId;
  const entityType = body.entityType || "lead";
  const title = body.title || action;
  const description = body.description || "";

  if (!action || !entityId) {
    return NextResponse.json(
      { error: "type/action and client_id/entityId are required" },
      { status: 400 }
    );
  }

  if (entityType === "lead" || entityType === "client") {
    const access = await assertLeadIdStringAccess(auth, entityId);
    if (access.response) return access.response;
  }

  const event = await prisma.auditEvent.create({
    data: {
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_type: "agent",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: { title, description },
    },
  });

  return NextResponse.json({
    id: String(event.id),
    type: event.action,
    action: event.action,
    created_at: event.created_at,
  });
}
