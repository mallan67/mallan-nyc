// POST /api/auth/forgot-password
// Sends a password reset email. Works for both agents and clients.
// Rate limited: always returns success (prevents email enumeration).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateResetToken } from "@/lib/auth/reset-token";
import { sendEmail } from "@/lib/email/sendgrid";
import { passwordResetEmail } from "@/lib/email/templates";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { escapeHtml } from "@/lib/sanitize";

/**
 * Resolve the recipient address for a reset email.
 *
 * M365 anti-loop drops mail when an M365 tenant mailbox sends to itself —
 * so reset links for agents on @mallan.nyc never arrive at the primary
 * mailbox. Resolver priority:
 *
 *   1. Per-agent override (Agent.auth_delivery_email) — set per row, scales
 *      to any number of agents without env var fiddling.
 *   2. Domain-scoped env var (RESET_EMAIL_OVERRIDE) — legacy fallback,
 *      kicks in only when the recipient is on the M365 sender domain.
 *   3. Primary email (the original recipient) — unchanged behavior for
 *      clients/leads on external domains.
 *
 * The env var fallback is intentionally scoped to same-domain so a leaked
 * RESET_EMAIL_OVERRIDE cannot hijack a client's reset email — it only
 * applies to internal accounts where direct delivery is broken anyway.
 */
function resolveResetRecipient(
  originalRecipient: string,
  perAgentOverride: string | null = null
): string {
  if (perAgentOverride) return perAgentOverride.trim().toLowerCase();

  const envOverride = process.env.RESET_EMAIL_OVERRIDE;
  if (!envOverride) return originalRecipient;

  const smtpUser = process.env.SMTP_USER || process.env.SMTP_FROM;
  const senderDomain = smtpUser?.split("@")[1]?.toLowerCase();
  if (!senderDomain) return originalRecipient;

  const recipientDomain = originalRecipient.split("@")[1]?.toLowerCase();
  return recipientDomain === senderDomain ? envOverride : originalRecipient;
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const email = (body.email as string)?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      success: true,
      message: "If an account exists with that email, a reset link has been sent.",
    });

    // Check agents first, then leads
    const agent = await prisma.agent.findUnique({
      where: { email },
      select: { id: true, first_name: true, password_hash: true, auth_delivery_email: true },
    });

    if (agent) {
      const sendTo = resolveResetRecipient(email, agent.auth_delivery_email);
      const token = generateResetToken(agent.id, "agent", agent.password_hash);
      const html = passwordResetEmail(token, escapeHtml(agent.first_name));
      await sendEmail(sendTo, "Reset Your Password — Mallan Real Estate", html, undefined, { transactional: true });
      return successResponse;
    }

    const lead = await prisma.lead.findUnique({
      where: { email },
      select: { id: true, first_name: true, password_hash: true },
    });

    if (lead?.password_hash) {
      // Leads don't have a per-agent override field — only the env-var
      // fallback applies (and only when on the M365 sender domain, which
      // leads typically aren't).
      const sendTo = resolveResetRecipient(email);
      const token = generateResetToken(lead.id, "lead", lead.password_hash);
      const html = passwordResetEmail(token, escapeHtml(lead.first_name));
      await sendEmail(sendTo, "Reset Your Password — Mallan Real Estate", html, undefined, { transactional: true });
    }

    return successResponse;
  } catch (err) {
    console.error("Forgot [redacted] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
