// /api/crm/email — POST: the ONE client-send pathway behind the CRM (Communications panel, every
// "Email" / "Contact" button, eBlast, SMS). /api/crm/communications POST is this same handler.
//
// Kinds (Maya, 2026-10-28; Master §3.2: consent, unsubscribe and suppression are governed centrally):
//   email | reply       Individual Agent correspondence about an existing client relationship or
//                       transaction. No consent gate: the people on the client list are existing business
//                       relationships. Unsubscribe / do-not-contact suppression is honoured inside sendEmail
//                       and reported as `suppressed_unsubscribed`.
//   eblast | campaign   Bulk marketing (also any send to more than 10 clients): consent on record required
//                       (`Lead.consent_captured_at`, written by the lead-capture flows — never set here),
//                       unsubscribe suppression, the listings@ channel, at most 200 recipients.
//   sms                 Its own consent (TCPA): consent on record required; Twilio when configured,
//                       otherwise LOGGED ONLY — never reported as sent.
//
// Every recipient gets its ACTUAL state, never "sent" because an audit row exists:
//   delivered_to_provider | suppressed_unsubscribed | blocked_no_consent | blocked_no_address |
//   logged_only | failed
// The response carries the per-recipient `results` plus counts (delivered, suppressed, blocked, failed,
// logged). `sent` / `skipped` are kept for older callers and mean delivered / blocked.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sendEmail } from "@/lib/email/sendgrid";
import { genericCrmEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import type { Prisma } from "@prisma/client";
import { assertLeadIdsAccess } from "@/lib/crm/access";

export type SendState =
  | "delivered_to_provider"
  | "suppressed_unsubscribed"
  | "blocked_no_consent"
  | "blocked_no_address"
  | "logged_only"
  | "failed";

export interface SendResult {
  clientId: string;
  name: string;
  state: SendState;
  channel: string;
  message_id?: string | null;
  reason?: string;
  error?: string;
  /** older callers: true only when delivered to the provider */
  success: boolean;
}

export const BULK_RECIPIENT_THRESHOLD = 10;
export const MAX_RECIPIENTS = 200;

export function sendKind(type: string, recipientCount: number): "correspondence" | "bulk" | "sms" {
  if (type === "sms") return "sms";
  if (type === "eblast" || type === "campaign" || recipientCount > BULK_RECIPIENT_THRESHOLD) return "bulk";
  return "correspondence";
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

  const type = (body.type as string) || "email"; // email | reply | sms | eblast | campaign
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
  if (clientIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} recipients` }, { status: 400 });
  }
  const access = await assertLeadIdsAccess(auth, clientIds);
  if (access.response) return access.response;

  const kind = sendKind(type, clientIds.length);

  // Resolve agent name
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "Mallan Real Estate"
    : "Mallan Real Estate";

  // Recipients (existing client records only — the one client identity)
  const bigIntIds = clientIds.map((id) => BigInt(id));
  const clients = await prisma.lead.findMany({
    where: { id: { in: bigIntIds } },
    select: { id: true, first_name: true, last_name: true, email: true, phone: true, consent_captured_at: true },
  });

  const now = new Date();
  const results: SendResult[] = [];
  const nameOf = (c: { first_name: string | null; last_name: string | null }) =>
    `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown";

  const audit = async (action: string, clientId: string, changes: Record<string, unknown>) => {
    await prisma.auditEvent.create({
      data: {
        action,
        entity_type: "lead",
        entity_id: clientId,
        user_type: auth.userType,
        user_id: auth.userId,
        changes: { ...changes, kind, type, thread_id: threadId ?? null, listing_id: listingId ?? null } as Prisma.InputJsonValue,
      },
    });
  };

  if (kind === "sms") {
    // SMS is not an email delivery: its own consent, its own provider, its own states.
    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
    let twilioClient: { messages: { create: (opts: Record<string, string>) => Promise<{ sid?: string }> } } | null = null;
    if (hasTwilio) {
      try {
        const twilio = require("twilio");
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      } catch { /* twilio not available */ }
    }

    for (const client of clients) {
      const id = client.id.toString();
      const name = nameOf(client);
      if (!client.consent_captured_at) {
        await audit("sms:blocked", id, { reason: "no_consent", phone: client.phone ?? null });
        results.push({ clientId: id, name, state: "blocked_no_consent", channel: "sms", reason: "No SMS consent on record (TCPA)", success: false });
        continue;
      }
      if (!client.phone) {
        await audit("sms:blocked", id, { reason: "no_phone" });
        results.push({ clientId: id, name, state: "blocked_no_address", channel: "sms", reason: "No phone number on file", success: false });
        continue;
      }
      if (!twilioClient) {
        await audit("sms:logged", id, { phone: client.phone, body: bodyText.substring(0, 160), delivered: false, reason: "no_sms_provider" });
        results.push({ clientId: id, name, state: "logged_only", channel: "sms", reason: "No SMS provider configured — message logged, not delivered", success: false });
        continue;
      }
      try {
        const msg = await twilioClient.messages.create({ body: bodyText.substring(0, 1600), from: process.env.TWILIO_PHONE_NUMBER!, to: client.phone });
        await audit("sms:sent", id, { phone: client.phone, body: bodyText.substring(0, 160), message_id: msg?.sid ?? null, delivered: true });
        results.push({ clientId: id, name, state: "delivered_to_provider", channel: "sms", message_id: msg?.sid ?? null, success: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : "SMS send failed";
        await audit("sms:failed", id, { phone: client.phone, error });
        results.push({ clientId: id, name, state: "failed", channel: "sms", error, success: false });
      }
    }
  } else {
    // Email: personal compose → the agent's own address; bulk → the listings@ mailbox
    const channel = kind === "bulk" ? ("listings" as const) : ("agent" as const);
    const html = genericCrmEmail(escapeHtml(bodyText), escapeHtml(agentName));
    const emailSubject = escapeHtml(subject || "Message from Mallan Real Estate");

    for (const client of clients) {
      const id = client.id.toString();
      const name = nameOf(client);
      if (kind === "bulk" && !client.consent_captured_at) {
        await audit("email:blocked", id, { subject: emailSubject, reason: "no_consent_bulk" });
        results.push({ clientId: id, name, state: "blocked_no_consent", channel: "email", reason: "No marketing consent on record — bulk sends need it", success: false });
        continue;
      }
      if (!client.email) {
        await audit("email:blocked", id, { subject: emailSubject, reason: "no_email" });
        results.push({ clientId: id, name, state: "blocked_no_address", channel: "email", reason: "No email address on file", success: false });
        continue;
      }

      const emailResult = await sendEmail(
        client.email,
        emailSubject,
        html,
        { userId: auth.userId, userType: auth.userType } as import("@/lib/auth/session").SessionUser,
        {
          channel,
          from: channel === "agent" && agent ? { email: agent.email, name: agentName } : undefined,
          replyTo: agent?.email,
        }
      );

      if (emailResult.success) {
        await audit("email:sent", id, { subject: emailSubject, to: client.email, cc: cc ?? null, body_preview: bodyText.substring(0, 200), message_id: emailResult.messageId ?? null, delivered_to_provider: true });
        results.push({ clientId: id, name, state: "delivered_to_provider", channel: "email", message_id: emailResult.messageId ?? null, success: true });
      } else if (emailResult._suppressed) {
        await audit("email:suppressed", id, { subject: emailSubject, to: client.email, reason: "unsubscribed" });
        results.push({ clientId: id, name, state: "suppressed_unsubscribed", channel: "email", reason: "Unsubscribed — suppressed", success: false });
      } else {
        const error = emailResult._devMode ? "Mail provider not configured" : (emailResult.error || "Send failed");
        await audit("email:failed", id, { subject: emailSubject, to: client.email, error });
        results.push({ clientId: id, name, state: "failed", channel: "email", error, success: false });
      }
    }

    // CC only when something was delivered
    if (cc && cc.includes("@") && results.some((r) => r.state === "delivered_to_provider")) {
      const ccAddresses = cc.split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
      for (const ccAddr of ccAddresses) {
        await sendEmail(ccAddr, emailSubject, html).catch(() => {});
      }
    }
  }

  const count = (s: SendState) => results.filter((r) => r.state === s).length;
  const delivered = count("delivered_to_provider");
  const suppressed = count("suppressed_unsubscribed");
  const blockedCount = count("blocked_no_consent") + count("blocked_no_address");
  const logged = count("logged_only");
  const failed = count("failed");

  return NextResponse.json({
    type,
    kind,
    delivered,
    suppressed,
    blocked: blockedCount,
    logged,
    failed,
    results,
    // compatibility with older readers
    sent: delivered,
    skipped: results.filter((r) => r.state === "blocked_no_consent" || r.state === "blocked_no_address").map((r) => ({ clientId: r.clientId, name: r.name, reason: r.reason })),
    skipped_count: blockedCount,
    errors: failed > 0 ? results.filter((r) => r.state === "failed").map((r) => ({ clientId: r.clientId, success: false, error: r.error, channel: r.channel })) : undefined,
    timestamp: now.toISOString(),
  }, { status: 200 });
}
