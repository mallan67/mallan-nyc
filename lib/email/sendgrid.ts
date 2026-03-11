// lib/email/sendgrid.ts
// Server-side email via Microsoft 365 SMTP (Nodemailer).
// COMPLIANCE: All emails must include Fair Housing disclaimer + REBNY attribution where applicable.
// NOTE: File retains sendgrid.ts name to preserve all 11 import paths across the codebase.

import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";

// Microsoft 365 SMTP configuration
const SMTP_HOST = process.env.SMTP_HOST || "smtp.office365.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER; // e.g. contact@mallan.nyc
const SMTP_PASS = process.env.SMTP_PASS; // Microsoft 365 app password
const FROM_EMAIL = process.env.SMTP_FROM || SMTP_USER || "contact@mallan.nyc";
const FROM_NAME = "Mallan Real Estate";

const isConfigured = !!(SMTP_USER && SMTP_PASS);

// Create reusable transporter (lazy — only if configured)
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
        ciphers: "SSLv3",
        rejectUnauthorized: true,
      },
    });
  }
  return transporter;
}

/**
 * Send a single email via Microsoft 365 SMTP.
 * Logs to AuditEvent for compliance trail.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  user?: SessionUser
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isConfigured) {
    // Dev mode: log to console instead of sending
    console.log(`[Email:DEV] To: ${to} | Subject: ${subject} | Body length: ${html.length} chars`);
    await logEmailAudit("send_dev", to, subject, user);
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    const messageId = info.messageId;
    await logEmailAudit("send", to, subject, user, { messageId });

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] SMTP error:", errorMessage);
    await logEmailAudit("send_error", to, subject, user, { error: errorMessage });
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
): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
