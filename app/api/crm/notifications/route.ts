// /api/crm/notifications — GET: list, POST: create, PATCH: mark read
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { createNotification, markAllRead, getUnreadCount } from "@/lib/notifications/engine";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const unreadOnly = searchParams.get("unread") === "true";
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {
    recipient_type: "agent",
    recipient_id: auth.userId,
  };
  if (unreadOnly) where.read_at = null;
  if (type) where.type = type;

  const [notifications, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { created_at: "desc" }, take: limit, skip: offset }),
    prisma.notification.count({ where }),
    getUnreadCount("agent", auth.userId),
  ]);

  const serialized = notifications.map(n => ({
    ...n, id: n.id.toString(), recipient_id: n.recipient_id.toString(),
  }));

  return NextResponse.json({ ok: true, total, unread, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { recipient_type, recipient_id, type, title, body: notifBody, channel, data } = body;

  if (!recipient_type || !recipient_id || !type || !title || !notifBody) {
    return NextResponse.json({ ok: false, error: "recipient_type, recipient_id, type, title, body are required" }, { status: 400 });
  }

  // Only broker can send notifications to others
  if (auth.role !== "BROKER" && BigInt(recipient_id) !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Agents can only create self-notifications" }, { status: 403 });
  }

  const notification = await createNotification({
    recipient_type, recipient_id: BigInt(recipient_id), channel, type, title, body: notifBody, data,
  });

  if (!notification) return NextResponse.json({ ok: true, skipped: true, reason: "Notification disabled by preferences" });

  return NextResponse.json({
    ok: true,
    item: { ...notification, id: notification.id.toString(), recipient_id: notification.recipient_id.toString() },
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();

  if (body.action === "mark_all_read") {
    await markAllRead("agent", auth.userId);
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await prisma.notification.update({
      where: { id: BigInt(body.id) },
      data: { read_at: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "action or id required" }, { status: 400 });
}
