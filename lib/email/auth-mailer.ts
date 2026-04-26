// lib/email/auth-mailer.ts
//
// Dedicated transport for AUTH-CHANNEL email — password reset links, MFA
// codes, password-set invites. These messages must reach the user's
// PRIMARY email inbox, not an alternate, regardless of which domain the
// inbox lives on.
//
// Why this exists: the rest of the platform sends through M365 SMTP. M365
// has an anti-loop policy that drops mail when the sender mailbox and the
// recipient mailbox are the same M365 tenant alias — so when an agent on
// @mallan.nyc tries to recover their password, the reset email never
// arrives because the SMTP sender (contact@mallan.nyc) and the recipient
// (maya@mallan.nyc) are aliases of the same mailbox. M365 sees a loop and
// drops the message.
//
// The fix is at the SENDER side: route auth emails through a transactional
// email service (Resend) whose sender domain is OUTSIDE the M365 tenant.
// Now M365 receives the auth email as ordinary external mail and delivers
// it normally. Users always receive auth-channel email at their primary
// inbox — no per-user override, no env var redirect, no script.
//
// Configuration:
//   RESEND_API_KEY      — Resend API key (required for this transport)
//   RESEND_FROM_EMAIL   — sender address (default: 'onboarding@resend.dev'
//                         which works without DNS verification — Resend's
//                         dev domain. Set to noreply@mallan.nyc once
//                         mallan.nyc is verified in Resend dashboard.)
//   RESEND_FROM_NAME    — sender display name (default: 'Mallan Real Estate')
//
// If RESEND_API_KEY is not set, the function falls back to the existing
// M365 transport. This means deploying this code without setting the env
// var preserves current behavior — clients on external email continue to
// work, broker continues to be unable to receive own auth email until the
// env var is set.

import { sendEmail as sendViaM365 } from "./sendgrid";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface AuthEmailResult {
  success: boolean;
  transport: "resend" | "m365";
  messageId?: string;
  error?: string;
}

/**
 * Send an auth-channel email (password reset, MFA, account invite).
 *
 * Always delivers to `to` exactly — never overrides recipient. The reason
 * the email uses a dedicated transport is so delivery to the primary
 * inbox actually succeeds, even when sender and recipient share the M365
 * tenant.
 */
export async function sendAuthEmail(
  to: string,
  subject: string,
  html: string
): Promise<AuthEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    return sendViaResend(apiKey, to, subject, html);
  }

  // Fallback — preserves current behavior (works for clients on external
  // domains, fails for accounts on the M365 sender tenant).
  const m365 = await sendViaM365(
    to,
    subject,
    html,
    undefined,
    { transactional: true }
  );
  return {
    success: m365.success,
    transport: "m365",
    error: m365.success ? undefined : "M365 send failed",
  };
}

async function sendViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<AuthEmailResult> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME || "Mallan Real Estate";
  const from = `${fromName} <${fromEmail}>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(
        `[auth-mailer] Resend send failed (HTTP ${res.status}): ${errorBody}`
      );
      // On Resend failure, try M365 as last-resort. Better to deliver to
      // SOME inbox than to drop the email entirely.
      const m365 = await sendViaM365(
        to,
        subject,
        html,
        undefined,
        { transactional: true }
      );
      return {
        success: m365.success,
        transport: "m365",
        error: `Resend HTTP ${res.status}, fell back to M365`,
      };
    }

    const data = (await res.json()) as { id?: string };
    return {
      success: true,
      transport: "resend",
      messageId: data.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auth-mailer] Resend send threw: ${msg}`);
    // Same fallback path as above
    const m365 = await sendViaM365(
      to,
      subject,
      html,
      undefined,
      { transactional: true }
    );
    return {
      success: m365.success,
      transport: "m365",
      error: `Resend threw "${msg}", fell back to M365`,
    };
  }
}
