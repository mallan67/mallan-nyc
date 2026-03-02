// lib/email/sendgrid.ts
// Server-side SendGrid email wrapper with audit logging.
// COMPLIANCE: All emails must include Fair Housing disclaimer + REBNY attribution where applicable.

import sgMail from "@sendgrid/mail";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";

// Initialize SendGrid with API key
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@mallan.nyc";
const FROM_NAME = "Mallan Real Estate";

/**
 * Send a single email via SendGrid.
 * Logs to AuditEvent for compliance trail.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  user?: SessionUser
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!apiKey) {
    // Dev mode: log to console instead of sending
    console.log(`[Email:DEV] Subject: ${subject} | Body length: ${html.length} chars`);
    await logEmailAudit("send_dev", to, subject, user);
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const [response] = await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html,
    });

    const messageId = response.headers["x-message-id"] as string | undefined;

    await logEmailAudit("send", to, subject, user, { messageId });

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] SendGrid error:", errorMessage);
    await logEmailAudit("send_error", to, subject, user, { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Send a templated email via SendGrid dynamic templates.
 * Template IDs are stored in env vars: SENDGRID_TEMPLATE_{KEY}
 */
export async function sendTemplatedEmail(
  to: string,
  templateKey: string,
  dynamicData: Record<string, unknown>,
  user?: SessionUser
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const templateId = process.env[`SENDGRID_TEMPLATE_${templateKey.toUpperCase()}`];

  if (!templateId) {
    // Fall back to inline template if no SendGrid template configured
    console.warn(`[Email] No SendGrid template for key: ${templateKey}. Using inline template.`);
    return { success: false, error: `Template not configured: ${templateKey}` };
  }

  if (!apiKey) {
    console.log(`[Email:DEV] Template: ${templateKey}`);
    await logEmailAudit("template_dev", to, `template:${templateKey}`, user);
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const [response] = await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      templateId,
      dynamicTemplateData: dynamicData,
    });

    const messageId = response.headers["x-message-id"] as string | undefined;

    await logEmailAudit("template_send", to, `template:${templateKey}`, user, { messageId });

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] SendGrid template error:", errorMessage);
    await logEmailAudit("template_error", to, `template:${templateKey}`, user, { error: errorMessage });
    return { success: false, error: errorMessage };
  }
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

  // SendGrid supports up to 1000 personalizations per request,
  // but we send individually for audit trail per recipient.
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
