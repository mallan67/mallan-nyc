// lib/email/sendgrid.ts
// Server-side email via Microsoft 365 SMTP (Nodemailer).
// COMPLIANCE: All emails must include Fair Housing disclaimer + REBNY attribution where applicable.
// NOTE: File retains sendgrid.ts name to preserve all 11 import paths across the codebase.

import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { makeUnsubscribeToken } from "./unsubscribe-token";
import { findEmailSuppression } from "./suppression";

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
  console.error("[Email] SMTP not configured | category=smtp_not_configured");
}

function classifyEmailProviderError(err: unknown): string {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message.toLowerCase();
  if (msg.includes("auth") || msg.includes("login") || msg.includes("credential")) return "auth_failed";
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("econn") || msg.includes("network") || msg.includes("dns")) return "network";
  if (msg.includes("rate") || msg.includes("limit") || msg.includes("throttle")) return "rate_limited";
  return "provider_error";
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
    /** Dry-run: perform NO SMTP delivery; record a `send_dryrun` audit row. */
    dryRun?: boolean;
    /** Test-send allowlist. When non-empty, ONLY addresses in it are delivered; every other recipient is skipped (audited `send_skipped_test_mode`). */
    testAllowlist?: readonly string[];
  }
): Promise<{ success: boolean; messageId?: string; error?: string; _devMode?: boolean; _suppressed?: boolean; _suppressionError?: boolean; _dryRun?: boolean; _skippedTestMode?: boolean }> {
  // ─── Lead-level opt-out boundary check (Email Tier A P0) ───────────
  //
  // Runs BEFORE the SMTP-configured check so suppression wins regardless
  // of operational state. Without this ordering, an unsubscribed recipient
  // would get a stale `_devMode` audit signal in dev/staging instead of
  // the more accurate `send_suppressed_unsubscribed` audit row, masking
  // CAN-SPAM compliance evidence.
  //
  // CAN-SPAM 15 USC 7704(a)(4)(A) requires honoring opt-out requests
  // within 10 business days for ALL commercial email. Prior to this
  // boundary check, the only suppression was per-route (e.g.
  // `/api/crm/email` filtered by `consent_captured_at`) and per-feature
  // (saved-search alerts disabled by `/api/unsubscribe`). A CRM agent
  // could still send a listing or pitch packet to an unsubscribed
  // recipient — a CAN-SPAM hole.
  //
  // This check honors `Lead.last_unsubscribe_at` (an EXISTING column,
  // populated by `/api/unsubscribe`). When the blocked `email_opt_out`
  // Neon migration eventually deploys, this lookup can also honor that
  // column with no contract change.
  //
  // Transactional sends (MFA OTP, password reset, portal invite,
  // family invite, inquiry/CMA auto-response, agent inquiry) bypass
  // this check — explicit acknowledgment of a user-initiated action.
  // The CAN-SPAM exception for transactional or relationship messages
  // (15 USC 7702(2)(B)) covers these.
  //
  // Lookup failure (DB unavailable) BLOCKS the send — FAIL CLOSED. For
  // commercial/marketing email we cannot prove the recipient hasn't opted
  // out, so we must not deliver. (Transactional sends bypass this whole
  // block at the `transactional !== true` guard below.)
  if (opts?.transactional !== true) {
    try {
      // Suppress on EITHER a Lead opt-out (last_unsubscribe_at) OR an AuditEvent
      // suppression record (email_unsubscribed) — the latter covers NON-Lead recipients
      // (e.g. cold ACRIS/1031 emails) that have no Lead row. Single source of truth in
      // lib/email/suppression.ts. This lookup THROWS on DB error → fail-closed below.
      const suppression = await findEmailSuppression(to);
      if (suppression.suppressed) {
        await logEmailAudit("send_suppressed_unsubscribed", to, subject, user, {
          unsubscribed_at: suppression.at,
          suppression_source: suppression.source, // 'lead' | 'audit_event' | 'both'
        });
        return {
          success: false,
          _suppressed: true,
          error: "Recipient has unsubscribed",
        };
      }
    } catch (err) {
      // FAIL CLOSED: a suppression-lookup failure blocks the send — we cannot
      // prove the recipient hasn't opted out, so we must not deliver.
      const cat = err instanceof Error ? err.message.toLowerCase() : "unknown";
      const category =
        cat.includes("timeout") || cat.includes("econn") ? "db_unavailable" :
        cat.includes("prisma") ? "prisma" :
        "other";
      console.error(`[Email] opt-out lookup failed — BLOCKING send (fail-closed) | category=${category}`);
      await logEmailAudit("send_blocked_suppression_error", to, subject, user, { error_category: category });
      // Distinct from `_suppressed` (a VERIFIED opt-out): this is an infrastructure
      // outage. Callers that branch on `_suppressed` (lifecycle engine, bulk skip
      // counting) must treat this as a FAILURE, not an unsubscribe. sendBulkEmail
      // counts anything without `_suppressed`/`_skippedTestMode` as failed.
      return {
        success: false,
        _suppressionError: true,
        error: "Suppression check unavailable — send blocked (fail-closed)",
      };
    }
  }

  // Test-send mode: restrict delivery to an internal allowlist. Anything not on
  // the allowlist is skipped (never delivered) and audited. Applies to ALL sends
  // (incl. transactional) so a test run can never escape the allowlist.
  if (opts?.testAllowlist && opts.testAllowlist.length > 0) {
    const allow = opts.testAllowlist.map((a) => String(a).toLowerCase().trim());
    if (!allow.includes(to.toLowerCase().trim())) {
      await logEmailAudit("send_skipped_test_mode", to, subject, user, {});
      return { success: false, _skippedTestMode: true, error: "Test mode: recipient not on allowlist" };
    }
  }

  // Dry-run: perform NO delivery; record the intent only.
  if (opts?.dryRun === true) {
    await logEmailAudit("send_dryrun", to, subject, user, { channel: opts?.channel ?? "company" });
    return { success: true, _dryRun: true };
  }

  if (!isConfigured) {
    console.error("[Email] SMTP not configured | category=smtp_not_configured");
    await logEmailAudit("send_dev", to, subject, user, { error_category: "smtp_not_configured" });
    return { success: false, error: "SMTP not configured", _devMode: true };
  }

  // RFC 8058 List-Unsubscribe headers below provide the recipient-side
  // opt-out path. The boundary check above is the sender-side gate.

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
    // Signed token binds the one-click link to THIS address — editing `email` in
    // the URL invalidates it. Null when no secret is set ⇒ tokenless legacy link.
    // RFC 8058 one-click: the List-Unsubscribe header URL MUST point at the API
    // handler (/api/unsubscribe) that verifies the token and writes the opt-out —
    // NOT the /unsubscribe human form page (which cannot process a one-click POST).
    // (The visible footer link in wrapEmail stays /unsubscribe for humans.)
    const unsubToken = makeUnsubscribeToken(to);
    const unsubscribeUrl =
      `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(to)}` +
      (unsubToken ? `&token=${encodeURIComponent(unsubToken)}` : "");
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
    const errorCategory = classifyEmailProviderError(err);
    console.error(`[Email] SMTP send failed | channel=${channel} | category=${errorCategory}`);
    await logEmailAudit("send_error", to, subject, user, { error_category: errorCategory, channel, fromEmail });
    return { success: false, error: "SMTP send failed" };
  }
}

/**
 * Send bulk emails (e.g., listing alerts). Rate-limited by caller.
 *
 * Email Tier A P0 cleanup (2026-05-06): the legacy `sendTemplatedEmail` stub
 * previously above was a SendGrid-templates dead-code path that always
 * returned failure. Verified zero callers in app/ lib/ scripts/ tests/
 * before deletion. Modern callers compose pre-rendered HTML via the named
 * template helpers below and pass it directly to sendEmail().
 */
export async function sendBulkEmail(
  recipients: { email: string; name: string }[],
  subject: string,
  html: string,
  user?: SessionUser,
  opts?: {
    /** Perform no SMTP delivery for any recipient (audited per recipient). */
    dryRun?: boolean;
    /** Only addresses in this allowlist are delivered; others are skipped. */
    testAllowlist?: readonly string[];
    /** Hard cap on recipients per call. Defaults to EMAIL_MAX_BATCH or 250. */
    maxBatch?: number;
  }
): Promise<{ success: boolean; sent: number; failed: number; skipped: number; errors: string[] }> {
  // Batch cap — refuse the WHOLE call when it exceeds the configured maximum, so
  // an oversized list can never be blasted by accident. Nothing is sent.
  const maxBatch = opts?.maxBatch ?? Number(process.env.EMAIL_MAX_BATCH || "250");
  if (recipients.length > maxBatch) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: recipients.length,
      errors: [`Batch of ${recipients.length} exceeds cap ${maxBatch} — nothing sent`],
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const result = await sendEmail(recipient.email, subject, html, user, {
      dryRun: opts?.dryRun,
      testAllowlist: opts?.testAllowlist,
    });
    if (result.success) {
      sent++;
    } else if (result._suppressed || result._skippedTestMode) {
      skipped++;
    } else {
      failed++;
      errors.push(result.error || "send_failed");
    }
  }

  return { success: failed === 0, sent, failed, skipped, errors };
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
        // EFFECTIVE user — the agent during delegated access. Never inverted.
        user_id: user?.userId ?? null,
        // Real human actor when it differs (the broker during delegation).
        actor_user_id: user?.actorUserId ?? null,
        changes: { subject, ...extra } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Don't let audit logging failures break email sending
    const category = classifyEmailProviderError(err);
    console.error(`[Email] Audit log failed | category=${category}`);
  }
}
