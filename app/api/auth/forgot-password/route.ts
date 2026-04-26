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
 *      to any number of agents without env var fiddling. Only relevant
 *      for agents (leads have no such column).
 *   2. Domain-scoped env var (RESET_EMAIL_OVERRIDE) — legacy fallback for
 *      AGENTS only. Lead reset emails NEVER use this path because lead
 *      sign-up does not gate @mallan.nyc addresses, and routing a lead's
 *      reset email to the override holder would let the override holder
 *      hijack any lead account whose email happened to be on our domain.
 *   3. Primary email (the original recipient) — default for everyone:
 *      external agents, all leads, agents with neither override set.
 */
function resolveResetRecipient(
  originalRecipient: string,
  userType: "agent" | "lead",
  perAgentOverride: string | null = null
): string {
  // 1. Per-agent column (agents only — leads pass null here)
  if (perAgentOverride) return perAgentOverride.trim().toLowerCase();

  // 2. Env var fallback is gated to AGENTS ONLY. Leads always go to
  //    primary email. This prevents a malicious lead sign-up using a
  //    same-domain address from having its reset link routed to the
  //    override holder.
  if (userType !== "agent") return originalRecipient;

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
      const sendTo = resolveResetRecipient(email, "agent", agent.auth_delivery_email);
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
      // Leads ALWAYS go to their primary email — no override path.
      // Lead sign-up does not gate @mallan.nyc addresses, so allowing the
      // env-var override to apply to leads would let a malicious lead
      // sign-up using a same-domain address hijack reset emails through
      // the override holder.
      const sendTo = resolveResetRecipient(email, "lead");
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
