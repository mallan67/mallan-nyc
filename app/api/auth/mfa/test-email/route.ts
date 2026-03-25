// Temporary diagnostic endpoint — DELETE AFTER TESTING
// GET /api/auth/mfa/test-email
// Calls sendEmail directly to capture the full SMTP error
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendgrid";

export async function GET() {
  const mfaEmail = process.env.MFA_EMAIL || "not-set";
  const smtpUser = process.env.SMTP_USER ? "set" : "not-set";
  const smtpPass = process.env.SMTP_PASS ? "set" : "not-set";
  const smtpHost = process.env.SMTP_HOST || "smtp.office365.com (default)";
  const smtpPort = process.env.SMTP_PORT || "587 (default)";

  const result = await sendEmail(
    mfaEmail,
    "MFA Test Email",
    "<p>If you see this, SMTP is working.</p>",
    undefined,
    { channel: "company" }
  );

  return NextResponse.json({
    mfa_email: mfaEmail,
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    result,
  });
}
