/**
 * lib/auth/mfa.ts
 * Email/SMS OTP for broker authentication.
 *
 * Flow: login → generate 6-digit code → send via email (+ SMS if configured) → verify
 * No enrollment needed — automatic for all brokers.
 */
import { randomInt } from 'crypto';
import { sendEmail } from '@/lib/email/sendgrid';

export const MFA_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const MFA_MAX_ATTEMPTS = 5;

/**
 * Generate a random 6-digit OTP code.
 */
export function generateOtpCode(): string {
  return randomInt(100000, 999999).toString();
}

/**
 * Send OTP code via email.
 */
export async function sendOtpEmail(
  email: string,
  code: string,
  name: string
): Promise<boolean> {
  const result = await sendEmail(
    email,
    'Your Mallan CRM Login Code',
    `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:460px;margin:0 auto;padding:32px;">
      <h2 style="font-size:18px;font-weight:700;color:#111;margin-bottom:8px;">Your Login Code</h2>
      <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">
        Hi ${name}, enter this code to complete your sign-in:
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#111;">${code}</span>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-bottom:4px;">This code expires in 5 minutes.</p>
      <p style="font-size:12px;color:#9ca3af;">If you didn't try to log in, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:11px;color:#9ca3af;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128</p>
    </div>
    `,
    undefined,
    { channel: 'company', transactional: true }
  );
  return result.success;
}

/**
 * Send OTP code via SMS (Twilio). Only sends if TWILIO env vars are configured.
 */
export async function sendOtpSms(
  phone: string,
  code: string
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return false; // Twilio not configured — silently skip
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: phone,
      From: fromNumber,
      Body: `Your Mallan CRM login code is: ${code}. Expires in 5 minutes.`,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    return resp.ok;
  } catch (err) {
    console.error('[MFA] SMS send error:', err);
    return false;
  }
}
