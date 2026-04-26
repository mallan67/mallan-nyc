// POST /api/auth/forgot-password
// Sends a password reset email. Works for both agents and clients.
// Rate limited: always returns success (prevents email enumeration).
//
// Recipient is ALWAYS the signed-in email — never redirected to an
// override mailbox. Delivery uses the auth-mailer transport (Resend with
// M365 fallback) so reset emails reach the primary inbox even when the
// recipient is a tenant alias of our M365 sender.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateResetToken } from "@/lib/auth/reset-token";
import { sendAuthEmail } from "@/lib/email/auth-mailer";
import { passwordResetEmail } from "@/lib/email/templates";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { escapeHtml } from "@/lib/sanitize";

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
      select: { id: true, first_name: true, password_hash: true },
    });

    if (agent) {
      const token = generateResetToken(agent.id, "agent", agent.password_hash);
      const html = passwordResetEmail(token, escapeHtml(agent.first_name));
      await sendAuthEmail(email, "Reset Your Password — Mallan Real Estate", html);
      return successResponse;
    }

    const lead = await prisma.lead.findUnique({
      where: { email },
      select: { id: true, first_name: true, password_hash: true },
    });

    if (lead?.password_hash) {
      const token = generateResetToken(lead.id, "lead", lead.password_hash);
      const html = passwordResetEmail(token, escapeHtml(lead.first_name));
      await sendAuthEmail(email, "Reset Your Password — Mallan Real Estate", html);
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
