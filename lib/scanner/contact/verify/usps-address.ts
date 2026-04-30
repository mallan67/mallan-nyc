/**
 * lib/scanner/contact/verify/usps-address.ts
 *
 * USPS Address Validation via the new USPS APIs (v3 Addresses).
 *
 * https://developer.usps.com/addressesv3
 *
 * OAuth flow: client_credentials grant against
 *   https://apis.usps.com/oauth2/v3/token
 *
 * Required env vars:
 *   USPS_CLIENT_ID
 *   USPS_CLIENT_SECRET
 *
 * Token is cached in-memory for ~50 minutes (USPS tokens last 1 hour).
 *
 * Returns `skipped=true` if env vars missing.
 */
import type { AddressVerification } from "@/lib/scanner/contact/verify/types";

const USPS_OAUTH_URL = "https://apis.usps.com/oauth2/v3/token";
const USPS_ADDRESS_URL = "https://apis.usps.com/addresses/v3/address";

interface CachedToken {
  access_token: string;
  expires_at: number; // ms epoch
}

let cachedToken: CachedToken | null = null;
const TOKEN_BUFFER_MS = 60 * 1000; // refresh 1 minute before expiry

async function getUspsToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at - TOKEN_BUFFER_MS > Date.now()) {
    return cachedToken.access_token;
  }
  const id = process.env.USPS_CLIENT_ID;
  const secret = process.env.USPS_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    });
    const resp = await fetch(USPS_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.access_token;
  } catch {
    return null;
  }
}

interface UspsAddressResponse {
  address?: {
    streetAddress?: string;
    secondaryAddress?: string;
    city?: string;
    state?: string;
    ZIPCode?: string;
    ZIPPlus4?: string;
    deliveryPoint?: string;
  };
  additionalInfo?: {
    deliveryPoint?: string;
    DPVConfirmation?: string; // "Y" = confirmed
    business?: string;
    centralDeliveryPoint?: string;
    vacant?: string;
  };
  matchedAddress?: string;
  corrections?: Array<{ code?: string; text?: string }>;
}

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Parse a free-form address string into USPS query components.
 * Best-effort: "400 EAST 90 STREET, NEW YORK NY 10128" → { street, city, state, zip }
 */
export function parseAddress(input: string): ParsedAddress | null {
  if (!input) return null;
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const street = parts[0];
  // Last part should be "STATE ZIP" or "CITY STATE ZIP"
  const last = parts[parts.length - 1];
  const tail = last.match(/(.*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!tail) {
    // Try city + state-zip pattern
    return { street, city: parts[1] || "NEW YORK", state: "NY", zip: "" };
  }
  const cityFromTail = tail[1].trim();
  const state = tail[2].toUpperCase();
  const zip = tail[3];
  // If we have parts[1] explicitly as city
  const city = (parts.length > 2 ? parts[1] : cityFromTail) || "NEW YORK";
  return { street, city, state, zip };
}

export async function verifyAddressViaUsps(addressInput: string): Promise<AddressVerification> {
  const at = new Date().toISOString();
  const token = await getUspsToken();
  if (!token) {
    return {
      verified: false, method: "none", at, skipped: true,
      provider: "usps_v3", detail: "USPS env vars missing or token failed",
    };
  }
  const parsed = parseAddress(addressInput);
  if (!parsed) {
    return {
      verified: false, method: "none", at,
      provider: "usps_v3", detail: "Could not parse input address",
    };
  }
  try {
    const qs = new URLSearchParams({
      streetAddress: parsed.street,
      city: parsed.city,
      state: parsed.state,
    });
    if (parsed.zip) qs.set("ZIPCode", parsed.zip.split("-")[0]);
    const url = `${USPS_ADDRESS_URL}?${qs.toString()}`;
    const resp = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return {
        verified: false, method: "none", at,
        provider: "usps_v3", detail: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await resp.json()) as UspsAddressResponse;
    const dpv = (data.additionalInfo?.DPVConfirmation || "").toUpperCase() === "Y";
    const standardizedParts = data.address ? [
      data.address.streetAddress,
      data.address.secondaryAddress,
      [data.address.city, data.address.state, data.address.ZIPCode].filter(Boolean).join(" "),
    ].filter(Boolean) : [];
    return {
      verified: dpv,
      method: "usps_address_validation",
      at,
      provider: "usps_v3",
      detail: dpv ? "USPS DPV-confirmed deliverable address" : "Returned but not DPV-confirmed",
      standardized: standardizedParts.join(", "),
      zip_plus_four: data.address?.ZIPPlus4,
      dpv_confirmed: dpv,
    };
  } catch (err) {
    return {
      verified: false, method: "none", at,
      provider: "usps_v3", detail: `Lookup error: ${(err as Error).message}`,
    };
  }
}

/** For tests: reset the cached token. */
export function _resetUspsTokenCache(): void {
  cachedToken = null;
}
