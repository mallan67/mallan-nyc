// /api/crm/alerts — GET: list active alerts, POST: create alert
// Alerts are stored as Notifications with channel="alert"
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);
  const statusFilter = url.searchParams.get("status"); // "active" means not resolved/dismissed

  const where: Record<string, unknown> = {
    channel: "alert",
    recipient_type: "agent",
    recipient_id: auth.userId,
  };

  // Broker sees all alerts
  if (auth.role === "BROKER") {
    delete where.recipient_id;
  }

  if (statusFilter === "active") {
    where.status = { notIn: ["resolved", "auto-dismissed"] };
  }

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: limit,
  });

  const alerts = rows.map((n) => ({
    id: n.data && typeof n.data === "object" && "alertId" in n.data
      ? (n.data as Record<string, unknown>).alertId
      : n.id.toString(),
    ruleId: n.type,
    ownerType: n.recipient_type,
    ownerId: n.recipient_id.toString(),
    severity:
      n.data && typeof n.data === "object" && "severity" in n.data
        ? (n.data as Record<string, unknown>).severity
        : "info",
    title: n.title,
    description: n.body,
    entityType:
      n.data && typeof n.data === "object" && "entityType" in n.data
        ? (n.data as Record<string, unknown>).entityType
        : null,
    entityId:
      n.data && typeof n.data === "object" && "entityId" in n.data
        ? (n.data as Record<string, unknown>).entityId
        : null,
    actionUrl:
      n.data && typeof n.data === "object" && "actionUrl" in n.data
        ? (n.data as Record<string, unknown>).actionUrl
        : null,
    status: n.status,
    snoozeUntil:
      n.data && typeof n.data === "object" && "snoozeUntil" in n.data
        ? (n.data as Record<string, unknown>).snoozeUntil
        : null,
    resolvedAt: n.read_at ? n.read_at.toISOString() : null,
    createdAt: n.created_at.toISOString(),
  }));

  return NextResponse.json({ alerts });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ruleId = (body.ruleId as string) || "system";
  const title = (body.title as string) || "Alert";
  const description = (body.description as string) || "";
  const ownerId = body.ownerId ? BigInt(body.ownerId as string) : auth.userId;

  const notification = await prisma.notification.create({
    data: {
      recipient_type: "agent",
      recipient_id: ownerId,
      channel: "alert",
      type: ruleId,
      title,
      body: description,
      status: "new",
      data: {
        alertId: body.id || null,
        severity: body.severity || "info",
        entityType: body.entityType || null,
        entityId: body.entityId || null,
        actionUrl: body.actionUrl || null,
        sourceEventId: body.sourceEventId || null,
        snoozeUntil: null,
      },
    },
  });

  await logAuditEvent("create", "alert", notification.id.toString(), auth, { ruleId, title });

  return NextResponse.json({ id: notification.id.toString() });
}
