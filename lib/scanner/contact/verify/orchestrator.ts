/**
 * lib/scanner/contact/verify/orchestrator.ts
 *
 * Runs the active-verification calls (Twilio, NeverBounce/DNS, USPS) over
 * a ContactRecord's fields and produces a VerificationMap that the
 * `aggregateContacts()` function consumes.
 *
 * Why a separate step (not inside aggregateContacts):
 *   - aggregator is a pure function; no I/O, no fetch.
 *   - verification calls cost money and shouldn't fire on every render.
 *   - this orchestrator can run on demand from an API endpoint, a cron,
 *     or a one-shot script.
 *
 * Budget guards:
 *   - max_per_call (default 10) hard-caps how many lookups fire per
 *     orchestrator invocation
 *   - skip_phone / skip_email / skip_address let the caller turn off
 *     individual verifiers (e.g. if Maya only wants to validate addresses)
 */
import {
  normalizeAddress,
  normalizeEmail,
  normalizePhone,
} from "@/lib/scanner/contact/aggregator";
import type {
  ContactRecord,
  ContactFieldKind,
  VerificationMethod,
} from "@/lib/scanner/contact/types";
import type { VerifyOptions } from "@/lib/scanner/contact/verify/types";
import { verifyPhoneViaTwilio } from "@/lib/scanner/contact/verify/twilio-lookup";
import { verifyEmail } from "@/lib/scanner/contact/verify/email-validate";
import { verifyAddressViaUsps } from "@/lib/scanner/contact/verify/usps-address";

interface VerificationInfo {
  verified: boolean;
  method: VerificationMethod;
  at?: string;
}

export type VerificationMap = Map<string, VerificationInfo>;

function mapKey(kind: ContactFieldKind, normalized: string): string {
  return `${kind}:${normalized}`;
}

export interface VerifyOrchestratorResult {
  /** Verification map keyed by `${kind}:${normalized}`. Pass to aggregateContacts. */
  verifications: VerificationMap;
  /** Per-call detail for audit logging. */
  audit: Array<{
    kind: ContactFieldKind;
    normalized: string;
    value: string;
    provider: string | undefined;
    verified: boolean;
    method: VerificationMethod;
    detail?: string;
    at: string;
    skipped?: boolean;
  }>;
  /** Number of provider calls actually made. */
  calls_made: number;
  /** Number of fields skipped due to budget cap. */
  budget_skipped: number;
}

interface VerifierFn { (value: string): Promise<{
  verified: boolean;
  method: VerificationMethod;
  at: string;
  provider?: string;
  detail?: string;
  skipped?: boolean;
}> }

const PHONE_VERIFIER: VerifierFn = (v) => verifyPhoneViaTwilio(v);
const EMAIL_VERIFIER: VerifierFn = (v) => verifyEmail(v);
const ADDRESS_VERIFIER: VerifierFn = (v) => verifyAddressViaUsps(v);

/**
 * Run verifications across the unique normalized values in a contact record.
 * Pure-input/IO-output; doesn't mutate the input.
 */
export async function runVerifications(
  record: ContactRecord,
  opts: VerifyOptions = {},
  injected?: { phone?: VerifierFn; email?: VerifierFn; address?: VerifierFn },
): Promise<VerifyOrchestratorResult> {
  const cap = opts.max_per_call ?? 10;
  const phoneFn = injected?.phone ?? PHONE_VERIFIER;
  const emailFn = injected?.email ?? EMAIL_VERIFIER;
  const addressFn = injected?.address ?? ADDRESS_VERIFIER;

  const verifications: VerificationMap = new Map();
  const audit: VerifyOrchestratorResult["audit"] = [];
  let callsMade = 0;
  let budgetSkipped = 0;

  // De-duplicate by normalized value
  const phones = opts.skip_phone ? [] : record.phones.map((f) => ({ value: f.value, normalized: normalizePhone(f.value) }))
    .filter((p, i, a) => p.normalized && a.findIndex((x) => x.normalized === p.normalized) === i);
  const emails = opts.skip_email ? [] : record.emails.map((f) => ({ value: f.value, normalized: normalizeEmail(f.value) }))
    .filter((p, i, a) => p.normalized && a.findIndex((x) => x.normalized === p.normalized) === i);
  const addresses = opts.skip_address ? [] : record.addresses.map((f) => ({ value: f.value, normalized: normalizeAddress(f.value) }))
    .filter((p, i, a) => p.normalized && a.findIndex((x) => x.normalized === p.normalized) === i);

  async function runOne(kind: ContactFieldKind, value: string, normalized: string, fn: VerifierFn) {
    if (callsMade >= cap) {
      budgetSkipped++;
      return;
    }
    callsMade++;
    const r = await fn(value);
    verifications.set(mapKey(kind, normalized), {
      verified: r.verified,
      method: r.method,
      at: r.at,
    });
    audit.push({
      kind,
      normalized,
      value,
      provider: r.provider,
      verified: r.verified,
      method: r.method,
      detail: r.detail,
      at: r.at,
      skipped: r.skipped,
    });
  }

  for (const { value, normalized } of phones) {
    await runOne("phone", value, normalized, phoneFn);
  }
  for (const { value, normalized } of emails) {
    await runOne("email", value, normalized, emailFn);
  }
  for (const { value, normalized } of addresses) {
    await runOne("address", value, normalized, addressFn);
  }

  return { verifications, audit, calls_made: callsMade, budget_skipped: budgetSkipped };
}
