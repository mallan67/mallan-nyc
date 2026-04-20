// lib/email/sendgrid.ts
// Server-side email via Microsoft 365 SMTP (Nodemailer).
// COMPLIANCE: All emails must include Fair Housing disclaimer + REBNY attribution where applicable.
// NOTE: File retains sendgrid.ts name to preserve all 11 import paths across the codebase.

import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";

// ─── SMTP Configuration ──────────────────────────────────────────────
// Three sending identities to protect deliverability:
//
// 1. AGENT EMAIL — personal sends to own clients (listing sends, 1-5 people)
//    From: agent's own email (e.g. maya@mallan.nyc)
//    Set per-agent on Agent.email in DB. Agent must be a valid M365 shared sender.
//
// 2. COMPANY EMAIL — marketing, auto-responses, system notifications
//    From: contact@mallan.nyc (SMTP_USER)
//    Default for all non-agent sends.
//
// 3. LISTINGS EMAIL — bulk eBlasts to brokers/agents (50+ recipients)
//    From: listings@mallan.nyc (SMTP_LISTINGS_USER)
//    Separate mailbox protects personal + contact@ from spam flags.
//
const SMTP_HOST = process.env.SMTP_HOST || "smtp.office365.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER; // contact@mallan.nyc
const SMTP_PASS = process.env.SMTP_PASS; // Microsoft 365 app password
// All addresses are aliases on maya@mallan.nyc — single M365 account, one password.
// SMTP authenticates as SMTP_USER (maya@ or contact@), From changes per channel.
const FROM_COMPANY_EMAIL = process.env.SMTP_FROM || "contact@mallan.nyc";
const FROM_COMPANY_NAME = "Mallan Real Estate";
const FROM_LISTINGS_EMAIL = "listings@mallan.nyc";
const FROM_LISTINGS_NAME = "Mallan Listings";

export type SendChannel = "agent" | "company" | "listings";

const isConfigured = !!(SMTP_USER && SMTP_PASS);

if (!isConfigured) {
  console.error("[Email] ⚠ SMTP NOT CONFIGURED — all emails will be dropped silently. Set SMTP_USER and SMTP_PASS env vars.");
}

// Single transporter — all channels authenticate with SMTP_USER (contact@)
// and use "Send As" for different From addresses (M365 shared mailbox permission)
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // STARTTLS on port 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      },
    });
  }
  return transporter;
}

/**
 * Send a single email via Microsoft 365 SMTP.
 * Logs to AuditEvent for compliance trail.
 *
 * @param opts.from - Override sender: { email, name } for agent sends.
 *                    Omit for company default (contact@mallan.nyc).
 * @param opts.channel - "agent" | "company" | "listings" — determines SMTP identity.
 * @param opts.replyTo - Reply-to address (e.g. agent's email for company-sent mail).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  user?: SessionUser,
  opts?: {
    from?: { email: string; name: string };
    channel?: SendChannel;
    replyTo?: string;
    /** Set true to bypass CAN-SPAM opt-out suppression (transactional only: password reset, portal invite, MFA). Never true for marketing/CRM/listing-share sends. */
    transactional?: boolean;
  }
): Promise<{ success: boolean; messageId?: string; error?: string; _devMode?: boolean; _suppressed?: boolean }> {
  if (!isConfigured) {
    console.error(`[Email:DEV] SMTP not configured — email DROPPED. To: ${to} | Subject: ${subject}`);
    await logEmailAudit("send_dev", to, subject, user);
    return { success: false, error: "SMTP not configured", _devMode: true };
  }

  // CAN-SPAM suppression: if recipient's Lead has email_opt_out=true, block all non-transactional sends.
  // The 10-day rule (15 USC 7704(a)(4)(A)) requires honoring opt-outs within 10 business days;
  // enforce here so no code path can accidentally email an opted-out recipient.
  if (!opts?.transactional) {
    const lead = await prisma.lead.findUnique({
      where: { email: to.toLowerCase().trim() },
      select: { email_opt_out: true },
    }).catch(() => null);
    if (lead?.email_opt_out) {
      await logEmailAudit("send_suppressed", to, subject, user, { reason: "email_opt_out" });
      return { success: false, error: "Recipient has opted out (CAN-SPAM)", _suppressed: true };
    }
  }

  // Resolve sender identity based on channel
  const channel = opts?.channel || "company";
  let fromEmail: string;
  let fromName: string;

  if (channel === "agent" && opts?.from) {
    // Agent's personal email — for client listing sends (low volume)
    fromEmail = opts.from.email;
    fromName = opts.from.name;
  } else if (channel === "listings") {
    // Bulk/eBlast — separate mailbox to protect personal + contact@
    fromEmail = FROM_LISTINGS_EMAIL;
    fromName = FROM_LISTINGS_NAME;
  } else {
    // Company default — marketing, auto-responses, system
    fromEmail = FROM_COMPANY_EMAIL;
    fromName = FROM_COMPANY_NAME;
  }

  try {
    // RFC 8058 / CAN-SPAM: one-click unsubscribe.
    // Gmail/Yahoo 2024 sender guidelines require both List-Unsubscribe URL and mailto,
    // plus List-Unsubscribe-Post for one-click. Skip for transactional sends.
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://mallan.nyc";
    const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(to)}`;
    const unsubscribeMailto = `mailto:unsubscribe@mallan.nyc?subject=unsubscribe`;

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      ...(opts?.transactional
        ? {}
        : {
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <${unsubscribeMailto}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
    };

    // Reply-to: so client replies reach the agent, not the system mailbox
    if (opts?.replyTo) {
      mailOptions.replyTo = opts.replyTo;
    }

    // All channels use same SMTP auth (contact@) with Send As for the From address
    const info = await getTransporter().sendMail(mailOptions);

    const messageId = info.messageId;
    await logEmailAudit("send", to, subject, user, { messageId, channel, fromEmail });

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Email] SMTP error (${channel}):`, errorMessage);
    await logEmailAudit("send_error", to, subject, user, { error: errorMessage, channel, fromEmail });
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a templated email. Since we no longer use SendGrid dynamic templates,
 * callers should pass pre-rendered HTML via sendEmail() instead.
 * This function is kept for backwards compatibility — logs a warning.
 */
export async function sendTemplatedEmail(
  to: string,
  templateKey: string,
  dynamicData: Record<string, unknown>,
  user?: SessionUser
): Promise<{ success: boolean; messageId?: string; error?: string; _devMode?: boolean }> {
  console.warn(
    `[Email] sendTemplatedEmail called with key "${templateKey}". ` +
    `SendGrid templates are no longer configured — use sendEmail() with pre-rendered HTML.`
  );
  await logEmailAudit("template_unsupported", to, `template:${templateKey}`, user);
  return { success: false, error: `Template "${templateKey}" not supported — use sendEmail() with HTML` };
}

/**
 * Send bulk emails (e.g., listing alerts). Rate-limited by caller.
 */
export async function sendBulkEmail(
  recipients: { email: string; name: string }[],
  subject: string,
  html: string,
  user?: SessionUser
): Promise<{ success: boolean; sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const result = await sendEmail(recipient.email, subject, html, user);
    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${recipient.email}: ${result.error}`);
    }
  }

  return { success: failed === 0, sent, failed, errors };
}

/**
 * Log email event to AuditEvent table for compliance.
 */
async function logEmailAudit(
  action: string,
  to: string,
  subject: string,
  user?: SessionUser,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: `email:${action}`,
        entity_type: "email",
        entity_id: to,
        user_type: user?.userType || "system",
        user_id: user?.userId ?? null,
        changes: { subject, ...extra } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Don't let audit logging failures break email sending
    console.error("[Email] Audit log error:", err);
  }
}
