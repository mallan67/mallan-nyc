// /api/crm/communications — GET: list communication history, POST: log outbound send.
// This reads from AuditEvent where action starts with "email:" or "sms:" or "listing_sent".
// No separate Communication model needed — audit trail IS the communication log.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

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
        "email:sent", "email:failed", "email:send", "email:send_dev", "email:suppressed", "email:blocked",
        "sms:sent", "sms:logged", "sms:failed", "sms:blocked", "listing_sent",
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

/**
 * POST — ONE client-send pathway (Master §3.2: consent, unsubscribe and suppression are governed
 * centrally, never copied per campaign). This used to be a second, inline copy of the sender that
 * read `client_ids` / `recipient_emails` while the Communications panel posted a record-shaped
 * body (`clientId`, `to`, `metadata.recipientIds`): no recipient was ever resolved, so Compose
 * Email, Compose SMS and eBlast answered 201 `{sent: 0}` and the panel showed "sent" while nothing
 * left the CRM (found 2026-10-27). The panel now posts `client_ids` to /api/crm/email; this
 * endpoint is the same handler, kept so the URL keeps working.
 */
export { POST } from "@/app/api/crm/email/route";
