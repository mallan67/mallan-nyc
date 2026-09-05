// /api/crm/communications — GET: list communication history, POST: log outbound send.
// This reads from AuditEvent where action starts with "email:" or "sms:" or "listing_sent".
// No separate Communication model needed — audit trail IS the communication log.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { escapeHtml } from "@/lib/sanitize";
import type { Prisma } from "@prisma/client";
import { assertLeadIdStringAccess, assertLeadIdsAccess } from "@/lib/crm/access";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");
  const clientId = searchParams.get("client_id");
  if (clientId) {
    const access = await assertLeadIdStringAccess(auth, clientId);
    if (access.response) return access.response;
  }

  // Build where clause: all email/sms/listing_sent events for this agent (or all for broker)
  const where: Prisma.AuditEventWhereInput = {
    action: {
      in: [
        "email:sent", "email:failed", "email:send", "email:send_dev",
        "sms:logged", "listing_sent",
      ],
    },
  };

  // Ownership: agent sees own, broker sees all
  if (auth.role !== "BROKER") {
    where.user_id = auth.userId;
  }

  // Optional: filter by client
  if (clientId) {
    where.entity_type = "lead";
    where.entity_id = clientId;
  }

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  // Map audit events to communication-shaped objects the frontend expects
  const communications = events.map((e) => {
    const changes = (e.changes || {}) as Record<string, unknown>;
    const action = e.action;
    const isListingSend = action === "listing_sent";
    const isSms = action === "sms:logged";

    return {
      id: e.id.toString(),
      type: isListingSend ? "listing_send" : isSms ? "sms" : "email",
      direction: "outbound",
      channel: isSms ? "sms" : "email",
      subject: (changes.subject as string) || (isListingSend ? "Listing sent" : null),
      body: (changes.body_preview as string) || (changes.body as string) || null,
      from: "agent",
      to: (changes.to as string) || null,
      clientId: e.entity_type === "lead" ? e.entity_id : null,
      clientName: null, // Frontend resolves from client list
      threadId: (changes.thread_id as string) || null,
      listingId: (changes.listing_id as string) || null,
      sentAt: e.created_at.toISOString(),
      created_at: e.created_at.toISOString(),
      readAt: null, // Outbound messages are always "read"
      metadata: {
        sent_via: (changes.sent_via as string) || (changes.source as string) || "crm",
        message_id: (changes.message_id as string) || null,
        client_ids: (changes.client_ids as string[]) || null,
      },
    };
  });

  return NextResponse.json({ communications, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // POST just redirects to /api/crm/email for actual sending.
  // This endpoint exists so the frontend can POST to /api/crm/communications
  // and have it work. The actual send logic lives in /api/crm/email.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Forward to email endpoint logic inline
  const { sendEmail: doSend } = await import("@/lib/email/sendgrid");
  const { genericCrmEmail } = await import("@/lib/email/templates");
  const { assertWriteAllowed } = await import("@/lib/auth/readonly-guard");

  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const type = (body.type as string) || "email";
  const subject = body.subject as string;
  const bodyText = body.body as string;
  const clientIds = body.client_ids as string[] | undefined;
  const recipientEmails = body.recipient_emails as string[] | undefined;
  const threadId = body.thread_id as string | undefined;

  if (!bodyText) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  // Resolve agent name + email for sender identity
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "Mallan Real Estate"
    : "Mallan Real Estate";

  const html = genericCrmEmail(escapeHtml(bodyText), escapeHtml(agentName));
  const emailSubject = subject || "Message from Mallan Real Estate";
  const now = new Date();
  let sent = 0;
  let failed = 0;

  // Channel: personal compose → agent email, bulk → listings@ mailbox
  const sendType = type; // already declared above
  const isBulk = sendType === "eblast" || sendType === "campaign" || (clientIds && clientIds.length > 10);
  const channel = isBulk ? "listings" as const : "agent" as const;

  // Resolve recipients from client IDs or direct emails
  const emails: { email: string; clientId?: string }[] = [];

  if (clientIds && clientIds.length > 0) {
    const access = await assertLeadIdsAccess(auth, clientIds);
    if (access.response) return access.response;
    const bigIntIds = clientIds.map((id) => BigInt(id));
    const clients = await prisma.lead.findMany({
      where: { id: { in: bigIntIds } },
      select: { id: true, email: true },
    });
    for (const c of clients) {
      if (c.email) emails.push({ email: c.email, clientId: c.id.toString() });
    }
  }
  if (recipientEmails) {
    for (const e of recipientEmails) {
      if (e.includes("@")) emails.push({ email: e });
    }
  }

  for (const recipient of emails) {
    const result = await doSend(
      recipient.email,
      emailSubject,
      html,
      undefined,
      {
        channel,
        from: channel === "agent" && agent ? { email: agent.email, name: agentName } : undefined,
        replyTo: agent?.email || undefined,
      }
    );

    await prisma.auditEvent.create({
      data: {
        action: result.success ? "email:sent" : "email:failed",
        entity_type: recipient.clientId ? "lead" : "email",
        entity_id: recipient.clientId || recipient.email,
        user_type: auth.userType,
        user_id: auth.userId,
        actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
        changes: {
          subject: emailSubject,
          to: recipient.email,
          body_preview: bodyText.substring(0, 200),
          thread_id: threadId ?? null,
          type,
          message_id: result.messageId ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (result.success) sent++;
    else failed++;
  }

  return NextResponse.json({ sent,
    failed,
    timestamp: now.toISOString(),
  }, { status: 201 });
}
