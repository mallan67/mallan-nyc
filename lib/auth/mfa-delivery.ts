/**
 * MFA code delivery — send the OTP over every configured channel and report
 * whether AT LEAST ONE actually delivered.
 *
 * Extracted from the login route so the fail-closed decision is unit-testable.
 * The subtle bug this guards against: `sendOtpSms` RESOLVES to `false` when
 * Twilio is unavailable or delivery fails (it does not reject). Wrapping it in
 * `.then(() => true, () => false)` would convert that `false` into `true`,
 * making a broker with a phone number advance to the MFA screen even though no
 * code was sent. We therefore consume the resolved boolean directly and only
 * fall back to `false` on a thrown error.
 */
import { sendOtpEmail, sendOtpSms } from './mfa';

export interface MfaDeliveryResult {
  delivered: boolean; // true iff email OR SMS actually delivered
  emailSent: boolean;
  smsSent: boolean;
}

export async function deliverMfaCode(opts: {
  email: string;
  code: string;
  agentName: string;
  phone?: string | null;
}): Promise<MfaDeliveryResult> {
  const emailSent = await sendOtpEmail(opts.email, opts.code, opts.agentName);

  let smsSent = false;
  if (opts.phone) {
    // Use the resolved boolean; only a thrown error becomes false.
    smsSent = await sendOtpSms(opts.phone, opts.code).catch(() => false);
  }

  return { delivered: emailSent || smsSent, emailSent, smsSent };
}
