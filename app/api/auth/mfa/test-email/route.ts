// Temporary diagnostic endpoint — DELETE AFTER TESTING
// GET /api/auth/mfa/test-email
// Sends a test email and returns the result
import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/auth/mfa";

export async function GET() {
  const mfaEmail = process.env.MFA_EMAIL || "not-set";
  const smtpUser = process.env.SMTP_USER ? "set" : "not-set";
  const smtpPass = process.env.SMTP_PASS ? "set" : "not-set";

  let emailResult = false;
  let error = null;

  try {
    emailResult = await sendOtpEmail(mfaEmail, "123456", "Maya");
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    mfa_email: mfaEmail,
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    email_sent: emailResult,
    error: error,
  });
}
