// /api/crm/email — POST: Send email from CRM Communications panel.
// Handles: compose email, compose SMS (logged only), eBlast (bulk).
// All sends logged to AuditEvent for compliance.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sendEmail } from "@/lib/email/sendgrid";
import { genericCrmEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import type { Prisma } from "@prisma/client";
import { assertLeadIdsAccess } from "@/lib/crm/access";

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

  const type = (body.type as string) || "email"; // email | sms | eblast
  const subject = body.subject as string;
  const bodyText = body.body as string;
  const clientIds = body.client_ids as string[] | undefined;
  const cc = body.cc as string | undefined;
  const threadId = body.thread_id as string | undefined;
  const listingId = body.listing_id as string | undefined;

  if (!bodyText) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (!clientIds || clientIds.length === 0) {
    return NextResponse.json({ error: "client_ids[] is required" }, { status: 400 });
  }
  if (clientIds.length > 200) {
    return NextResponse.json({ error: "Maximum 200 recipients" }, { status: 400 });
  }
  const access = await assertLeadIdsAccess(auth, clientIds);
  if (access.response) return access.response;

  // Resolve agent name
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "Mallan Real Estate"
    : "Mallan Real Estate";

  // Fetch all recipient emails + consent status
  const bigIntIds = clientIds.map((id) => BigInt(id));
  const allClients = await prisma.lead.findMany({
    where: { id: { in: bigIntIds } },
    select: { id: true, first_name: true, last_name: true, email: true, phone: true, consent_captured_at: true },
  });

  // CAN-SPAM / TCPA: skip clients without consent
  const skipped: { clientId: string; name: string; reason: string }[] = [];
  const clients = allClients.filter((c) => {
    if (!c.consent_captured_at) {
      const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown";
      console.warn(`[[email redacted]] Skipping client ${c.id} (${name}) — no consent_captured_at (CAN-SPAM)`);
      skipped.push({ clientId: c.id.toString(), name, reason: "No consent on record" });
      return false;
    }
    return true;
  });

  const now = new Date();
  const results: { clientId: string; success: boolean; error?: string; channel: string }[] = [];

  if (type === "sms") {
    // SMS: send via Twilio if configured, otherwise log only
    const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER;
    let twilioClient: { messages: { create: (opts: Record<string, string>) => Promise<unknown> } } | null = null;
    if (hasTwilio) {
      try {
        const twilio = require("twilio");
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      } catch { /* twilio not available */ }
    }

    for (const client of clients) {
      let channel = "sms_logged";
      if (twilioClient && client.phone) {
        try {
          await twilioClient.messages.create({
            body: bodyText.substring(0, 1600),
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: client.phone,
          });
          channel = "sms_sent";
        } catch {
          channel = "sms_failed";
        }
      }
      await prisma.auditEvent.create({
        data: {
          action: channel === "sms_sent" ? "sms:sent" : "sms:logged",
          entity_type: "lead",
          entity_id: client.id.toString(),
          user_type: auth.userType,
          user_id: auth.userId,
          actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
          changes: {
            phone: client.phone,
            body: bodyText.substring(0, 160),
            thread_id: threadId ?? null,
          } as Prisma.InputJsonValue,
        },
      });
      results.push({ clientId: client.id.toString(), success: true, channel });
    }
  } else {
    // Email or eBlast: actually send via SMTP
    // Channel selection:
    //   - "email" (compose to clients) → agent's own email, personal
    //   - "eblast" (bulk to brokers/agents) → listings@ mailbox, protects personal
    const isEblast = type === "eblast" || type === "campaign" || clientIds.length > 10;
    const channel = isEblast ? "listings" as const : "agent" as const;

    const html = genericCrmEmail(escapeHtml(bodyText), escapeHtml(agentName));
    const emailSubject = escapeHtml(subject || "Message from Mallan Real Estate");

    for (const client of clients) {
      if (!client.email) {
        results.push({ clientId: client.id.toString(), success: false, error: "No email", channel: "email" });
        continue;
      }

      const emailResult = await sendEmail(
        client.email,
        emailSubject,
        html,
        // Pass the REAL session through. The old partial cast dropped role,
        // sessionId and — once delegated access existed — actorUserId, so an
        // email sent by the broker while delegated would have lost the actor.
        auth,
        {
          channel,
          from: channel === "agent" && agent ? { email: agent.email, name: agentName } : undefined,
          replyTo: agent?.email,
        }
      );

      // Log as communication for CRM history
      await prisma.auditEvent.create({
        data: {
          action: emailResult.success ? "email:sent" : "email:failed",
          entity_type: "lead",
          entity_id: client.id.toString(),
          user_type: auth.userType,
          user_id: auth.userId,
          actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
          changes: {
            subject: emailSubject,
            to: client.email,
            cc: cc ?? null,
            body_preview: bodyText.substring(0, 200),
            thread_id: threadId ?? null,
            listing_id: listingId ?? null,
            type,
            message_id: emailResult.messageId ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      results.push({
        clientId: client.id.toString(),
        success: emailResult.success,
        error: emailResult.error,
        channel: "email",
      });
    }

    // Send CC if provided
    if (cc && cc.includes("@")) {
      const ccAddresses = cc.split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
      for (const ccAddr of ccAddresses) {
        await sendEmail(ccAddr, emailSubject, html).catch(() => {});
      }
    }
  }

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  return NextResponse.json({ type,
    sent,
    failed: failed.length,
    errors: failed.length > 0 ? failed : undefined,
    skipped: skipped.length > 0 ? skipped : undefined,
    skipped_count: skipped.length,
    timestamp: now.toISOString(),
  }, { status: 201 });
}
