/**
 * lib/scanner/contact/verify/types.ts
 *
 * Types for the active-verification layer. Each verifier returns a
 * structured `VerificationResult` that the orchestrator folds into the
 * VerificationMap consumed by `aggregateContacts()`.
 */
import type { VerificationMethod } from "@/lib/scanner/contact/types";

export interface VerificationResult {
  /** True if the value passed verification. */
  verified: boolean;
  /** How verification was performed. */
  method: VerificationMethod;
  /** ISO timestamp of the verification call. */
  at: string;
  /** Raw provider response detail for audit trail (truncated). */
  detail?: string;
  /** Provider name for cost-tracking ("twilio_lookup", "neverbounce", "usps_v3"). */
  provider?: string;
  /** True if the verifier is not configured (env vars missing) — caller can
   *  decide whether absence of verification is acceptable. */
  skipped?: boolean;
}

/** Phone-specific verification detail. */
export interface PhoneVerification extends VerificationResult {
  carrier_type?: "mobile" | "landline" | "voip" | "unknown";
  /** Twilio standardized e.164 format. */
  e164_format?: string;
  country_code?: string;
}

/** Email-specific verification detail. */
export interface EmailVerification extends VerificationResult {
  has_mx_record?: boolean;
  is_disposable?: boolean;
  is_role_account?: boolean; // info@, contact@, etc.
}

/** Address-specific verification detail. */
export interface AddressVerification extends VerificationResult {
  standardized?: string;
  zip_plus_four?: string;
  /** USPS DPV (Delivery Point Validation) confirmation. */
  dpv_confirmed?: boolean;
}

/** Lookup-budget guard — refuse to run if monthly budget exceeded. */
export interface VerifyOptions {
  /** Soft cap on total verifications per orchestrator call. Default 10. */
  max_per_call?: number;
  /** Skip phone verification entirely. */
  skip_phone?: boolean;
  skip_email?: boolean;
  skip_address?: boolean;
}
