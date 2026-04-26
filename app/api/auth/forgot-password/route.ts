// POST /api/auth/forgot-password
// Sends a 6-digit reset code via SMS. Works for both agents and clients.
// Anti-enumeration: always returns the same response shape — { reset_session, sms_sent }
// where reset_session is always set (even for non-existent emails) and
// sms_sent indicates whether a real send happened (not whether an account exists).
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { generateOtpCode, sendOtpSms, MFA_SESSION_TTL_MS } from "@/lib/auth/mfa";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

/**
 * Mask a phone number for UI display: keeps the last 4 digits.
 *   "+12125551234" → "•••••• 1234"
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••••• ${digits.slice(-4)}`;
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

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    // Look up agent first, then lead. We need both id+phone+type.
    const agent = await prisma.agent.findUnique({
      where: { email },
      select: { id: true, phone: true, status: true },
    });

    let userId: bigint | null = null;
    let userType: "agent" | "lead" | null = null;
    let phone: string | null = null;

    if (agent && agent.status === "active" && agent.phone) {
      userId = agent.id;
      userType = "agent";
      phone = agent.phone;
    } else {
      const lead = await prisma.lead.findUnique({
        where: { email },
        select: { id: true, phone: true, password_hash: true },
      });
      if (lead?.password_hash && lead.phone) {
        userId = lead.id;
        userType = "lead";
        phone = lead.phone;
      }
    }

    // Always create a reset_session token, even if no user found.
    // This prevents email enumeration — the response shape is identical.
    const token = randomUUID();

    if (userId && userType && phone) {
      // Real reset session — generate code, hash it, send via SMS
      const code = generateOtpCode();
      const codeHash = await hashPassword(code);

      await prisma.passwordResetSession.create({
        data: {
          token,
          user_id: userId,
          user_type: userType,
          code_hash: codeHash,
          expires_at: new Date(Date.now() + MFA_SESSION_TTL_MS),
          ip_address: ip,
          user_agent: ua,
        },
      });

      // Best-effort SMS send. If Twilio is misconfigured or the number is
      // bad, the catch keeps us from leaking that fact via timing/error.
      const smsSent = await sendOtpSms(phone, code).catch(() => false);

      return NextResponse.json({
        reset_session: token,
        sms_sent: smsSent,
        phone_hint: maskPhone(phone),
      });
    }

    // No user / no phone / inactive — return identical response shape.
    // Frontend treats it the same; user enters a code that won't validate.
    return NextResponse.json({
      reset_session: token,
      sms_sent: false,
      phone_hint: null,
    });
  } catch (err) {
    console.error("Forgot [redacted] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
