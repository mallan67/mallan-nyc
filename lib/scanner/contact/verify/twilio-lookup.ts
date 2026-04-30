/**
 * lib/scanner/contact/verify/twilio-lookup.ts
 *
 * Phone-number verification + carrier classification via Twilio Lookup v2.
 *
 * https://www.twilio.com/docs/lookup/v2-api
 *
 * Cost: ~$0.005 per lookup (line-type). Add a few cents per call if
 * caller_name lookup is enabled (we don't enable it here — privacy).
 *
 * Required env vars (Maya already has these in Vercel for SMS MFA):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *
 * Returns `skipped=true` if env vars are missing — caller decides
 * whether to fail or accept the gap.
 */
import type { PhoneVerification } from "@/lib/scanner/contact/verify/types";

const LOOKUP_BASE = "https://lookups.twilio.com/v2/PhoneNumbers";

interface TwilioLookupResponseV2 {
  calling_country_code?: string;
  country_code?: string;
  phone_number?: string;
  national_format?: string;
  valid?: boolean;
  validation_errors?: string[];
  line_type_intelligence?: {
    type?: string;          // mobile | landline | fixedVoip | nonFixedVoip | personal | tollFree | premium
    carrier_name?: string;
    error_code?: number;
  };
}

function classifyType(t?: string): "mobile" | "landline" | "voip" | "unknown" {
  if (!t) return "unknown";
  const low = t.toLowerCase();
  if (low === "mobile" || low === "personal") return "mobile";
  if (low === "landline") return "landline";
  if (low.includes("voip")) return "voip";
  return "unknown";
}

export async function verifyPhoneViaTwilio(phone: string): Promise<PhoneVerification> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const at = new Date().toISOString();

  if (!sid || !token) {
    return { verified: false, method: "none", at, skipped: true, detail: "TWILIO env vars missing" };
  }

  const e164 = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;
  const url = `${LOOKUP_BASE}/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return {
        verified: false,
        method: "none",
        at,
        provider: "twilio_lookup",
        detail: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await resp.json()) as TwilioLookupResponseV2;
    const valid = data.valid === true;
    return {
      verified: valid,
      method: "twilio_lookup_carrier",
      at,
      provider: "twilio_lookup",
      detail: valid ? `Valid (${data.line_type_intelligence?.type || "unknown"})` : "Invalid",
      carrier_type: classifyType(data.line_type_intelligence?.type),
      e164_format: data.phone_number,
      country_code: data.country_code,
    };
  } catch (err) {
    return {
      verified: false,
      method: "none",
      at,
      provider: "twilio_lookup",
      detail: `Lookup error: ${(err as Error).message}`,
    };
  }
}
