// /api/portal/messages — GET: list client messages, POST: send message to agent
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access only" }, { status: 403 });
  }

  const messages = await prisma.notification.findMany({
    where: {
      recipient_id: auth.userId,
      recipient_type: "lead",
      channel: { in: ["in_app", "message"] },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    messages: messages.map((m) => ({
      id: m.id.toString(),
      type: m.type,
      title: m.title,
      body: m.body,
      read: m.read_at !== null,
      created_at: m.created_at.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message as string)?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // Find the client's assigned agent
  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { agent_id: true, first_name: true, last_name: true },
  });

  if (!lead?.agent_id) {
    return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
  }

  const clientName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Client";

  // Create notification for the agent
  await prisma.notification.create({
    data: {
      recipient_type: "agent",
      recipient_id: lead.agent_id,
      channel: "message",
      type: "client_message",
      title: `Message from ${clientName}`,
      body: message,
      data: { lead_id: auth.userId.toString() },
      status: "pending",
    },
  });

  return NextResponse.json({ ok: true, message: "Message sent" }, { status: 201 });
}
