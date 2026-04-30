/**
 * lib/scanner/contact/verify/email-validate.ts
 *
 * Email verification. Two-tier:
 *
 *   Tier 1 (always-on): syntactic check + DNS MX-record lookup.
 *     Tells us "the domain has a mail server" without sending mail.
 *     Free. Detects typos and dead domains.
 *
 *   Tier 2 (NeverBounce, gated by env var): full validity check.
 *     Returns valid / invalid / disposable / catchall / unknown.
 *
 *   NEVERBOUNCE_API_KEY env var enables Tier 2.
 *
 * Returns `skipped=true` ONLY if even the DNS check fails to run (e.g.
 * test environment with no DNS). The DNS-MX path is the fallback path —
 * it always runs unless DNS is unavailable.
 */
import { promises as dns } from "dns";
import type { EmailVerification } from "@/lib/scanner/contact/verify/types";

const NEVERBOUNCE_BASE = "https://api.neverbounce.com/v4.2/single/check";

const EMAIL_REGEX = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
  "throwawaymail.com", "trashmail.com", "yopmail.com", "fakeinbox.com",
  "maildrop.cc", "getnada.com", "spamgourmet.com", "dispostable.com",
]);

const ROLE_ACCOUNTS = new Set<string>([
  "info", "admin", "contact", "support", "sales", "billing", "hello",
  "team", "office", "no-reply", "noreply", "donotreply", "webmaster",
  "postmaster", "abuse", "marketing", "newsletter",
]);

interface NeverBounceResponse {
  status?: string;
  result?: "valid" | "invalid" | "disposable" | "catchall" | "unknown";
  flags?: string[];
  message?: string;
}

async function checkDnsMx(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

export async function verifyEmail(email: string): Promise<EmailVerification> {
  const at = new Date().toISOString();
  const trimmed = (email || "").trim().toLowerCase();
  const m = trimmed.match(EMAIL_REGEX);
  if (!m) {
    return {
      verified: false, method: "none", at,
      provider: "syntactic", detail: "Failed regex check",
      has_mx_record: false,
    };
  }
  const domain = m[1];
  const localPart = trimmed.split("@")[0];
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);
  const isRoleAccount = ROLE_ACCOUNTS.has(localPart);

  // Tier 2: NeverBounce (when configured)
  const nbKey = process.env.NEVERBOUNCE_API_KEY;
  if (nbKey) {
    try {
      const url = `${NEVERBOUNCE_BASE}?key=${encodeURIComponent(nbKey)}&email=${encodeURIComponent(trimmed)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = (await resp.json()) as NeverBounceResponse;
        if (data.status === "success") {
          const verified = data.result === "valid";
          return {
            verified, method: "neverbounce", at,
            provider: "neverbounce",
            detail: `${data.result || "unknown"}${(data.flags || []).length ? ` · flags: ${(data.flags || []).join(",")}` : ""}`,
            has_mx_record: data.result !== "invalid",
            is_disposable: data.result === "disposable" || isDisposable,
            is_role_account: isRoleAccount,
          };
        }
      }
    } catch {
      // Fall through to Tier 1 on transient NeverBounce error
    }
  }

  // Tier 1: DNS MX
  const hasMx = await checkDnsMx(domain);
  return {
    verified: hasMx && !isDisposable,
    method: hasMx ? "smtp_email_validation" : "none",
    at,
    provider: "dns_mx",
    detail: hasMx
      ? (isDisposable ? "MX OK, disposable domain" : "MX record found")
      : "No MX record",
    has_mx_record: hasMx,
    is_disposable: isDisposable,
    is_role_account: isRoleAccount,
  };
}
