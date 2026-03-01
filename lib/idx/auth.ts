// lib/idx/auth.ts
// OAuth2 client credentials flow for Trestle/REBNY RLS API.
// Caches token until 5 minutes before expiry.

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

const TOKEN_ENDPOINT =
  "https://api.cotality.com/trestle/oidc/connect/token";

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

  const clientId = process.env.IDX_CLIENT_ID;
  const clientSecret = process.env.IDX_CLIENT_SECRET;

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

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

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
  return Boolean(process.env.IDX_CLIENT_ID && process.env.IDX_CLIENT_SECRET);
}

/**
 * Invalidate the cached token (e.g., on 401 from API).
 */
export function invalidateToken(): void {
  cachedToken = null;
}
