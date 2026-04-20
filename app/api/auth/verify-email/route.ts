/**
 * POST /api/auth/verify-email
 *
 * Two actions:
 * 1. { action: "send", email } — Generate and send a 6-digit OTP to the email
 * 2. { action: "verify", email, code } — Verify the OTP code and mark email as verified
 *
 * Only applies to self-signup clients (source: "website").
 * Agent/broker-invited clients have email_verified_at set on invite acceptance.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email/sendgrid";
import { escapeHtml } from "@/lib/sanitize";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SEND_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, email, code } = body;
  if (!action || !email) {
    return NextResponse.json({ error: "action and email are required" }, { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const lead = await prisma.lead.findUnique({ where: { email: normalizedEmail } });
  if (!lead) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Already verified — no action needed
  if (lead.email_verified_at) {
    return NextResponse.json({ success: true, verified: true, message: "Email already verified" });
  }

  if (action === "send") {
    // Generate 6-digit code
    const otpCode = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await prisma.lead.update({
      where: { email: normalizedEmail },
      data: {
        email_verify_token: otpCode,
        email_verify_expires: expiresAt,
      },
    });

    // Send verification email
    const name = lead.first_name || "there";
    const result = await sendEmail(
      normalizedEmail,
      "Verify Your Email — Mallan Real Estate",
      `
      <div style="font-family:'Inter',system-ui,sans-serif;max-width:460px;margin:0 auto;padding:32px;">
        <h2 style="font-size:18px;font-weight:700;color:#111;margin-bottom:8px;">Verify Your Email</h2>
        <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">
          Hi ${escapeHtml(name)}, enter this code to verify your email address:
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#111;">${otpCode}</span>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-bottom:4px;">This code expires in 15 minutes.</p>
        <p style="font-size:12px;color:#9ca3af;">If you didn't create this account, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:11px;color:#9ca3af;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128</p>
      </div>
      `,
      undefined,
      { channel: "company", transactional: true }
    );

    return NextResponse.json({
      success: result.success,
      message: result.success ? "Verification code sent" : "Failed to send code",
    });
  }

  if (action === "verify") {
    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    // Check token
    if (!lead.email_verify_token || lead.email_verify_token !== String(code).trim()) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    // Check expiry
    if (lead.email_verify_expires && new Date() > new Date(lead.email_verify_expires)) {
      return NextResponse.json({ error: "Verification code has expired. Please request a new one." }, { status: 400 });
    }

    // Mark as verified, clear token
    await prisma.lead.update({
      where: { email: normalizedEmail },
      data: {
        email_verified_at: new Date(),
        email_verify_token: null,
        email_verify_expires: null,
      },
    });

    return NextResponse.json({ success: true, verified: true, message: "Email verified successfully" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'send' or 'verify'." }, { status: 400 });
}
