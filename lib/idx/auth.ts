// lib/idx/auth.ts
// OAuth2 client credentials flow for the Cotality API.
// Cotality is the sole provider Mallan authenticates to; there is no second
// provider API behind it.
// Caches token until 5 minutes before expiry.

import { recordTokenRequest, recordTokenRefresh } from "./cotality-telemetry";

/** Token response from Trestle OIDC. */
export interface TrestleAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Internal: absolute expiry timestamp. */
  _expiresAt: number;
}

// In-memory token cache
let cachedToken: TrestleAuthToken | null = null;

// Derive token endpoint from centralized TRESTLE_API_URL per compliance requirement.
// Env validation is deferred to getAccessToken() — no top-level throws (Vercel serverless safety).
function getTrestleTokenEndpoint(): string {
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
  return `${base}/oidc/connect/token`;
}

// Buffer before expiry to refresh (default 5 minutes, configurable via env)
const EXPIRY_BUFFER_SECONDS = parseInt(
  process.env.IDX_TOKEN_EXPIRY_BUFFER || "300",
  10
);

/**
 * Get a valid OAuth2 access token for Trestle API.
 * Uses client_credentials grant. Caches token until near expiry.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken._expiresAt) {
    return cachedToken.access_token;
  }

  // Accept both naming conventions (IDX_CLIENT_ID or legacy IDX_API_KEY)
  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[IDX Auth] Missing IDX_CLIENT_ID or IDX_CLIENT_SECRET in environment"
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "api",
  });

  // 8-second timeout on token requests — prevents page hanging when Trestle auth is slow/down.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  const _tokenT0 = Date.now();
  try {
    response = await fetch(getTrestleTokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
      // MUST NOT cache POST requests — stale tokens cause 401 cascades.
      // In-memory cache (line 15) handles reuse within a single serverless instance.
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
    // Telemetry only — counts the token-endpoint call (no behavior change).
    recordTokenRequest(Date.now() - _tokenT0);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `[IDX Auth] Token request failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
    expires_in: data.expires_in,
    _expiresAt:
      Date.now() + (data.expires_in - EXPIRY_BUFFER_SECONDS) * 1000,
  };

  console.log(
    `[IDX Auth] Token acquired, expires in ${data.expires_in}s (refresh at ${EXPIRY_BUFFER_SECONDS}s before)`
  );

  return cachedToken.access_token;
}

/**
 * Check if credentials are configured (without making a request).
 */
export function hasCredentials(): boolean {
  const id = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const secret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  return Boolean(id && secret);
}

/**
 * Invalidate the cached token (e.g., on 401 from API). A forced invalidation
 * always precedes a re-acquisition, so it is the canonical "token refresh"
 * signal for telemetry.
 */
export function invalidateToken(): void {
  cachedToken = null;
  recordTokenRefresh();
}
