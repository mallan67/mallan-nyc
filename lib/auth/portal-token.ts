// lib/auth/portal-token.ts
// Portal invite token utilities: generation, hashing, TTL enforcement.
//
// SECURITY DESIGN:
//   - Tokens are random UUIDs (high entropy)
//   - Stored as SHA-256 hash (deterministic — allows lookup by hash)
//   - TTL: 72 hours from generation
//   - Single-use: portal_token set to null on accept
//   - Raw token is only sent via email link, never returned in API JSON

import { createHash, randomUUID } from "crypto";

/** How long a portal invite token remains valid (72 hours). */
export const PORTAL_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Generate a new portal invite token.
 * Returns the raw token (for the invite URL) and the hash (for DB storage).
 */
export function generatePortalToken(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomUUID();
  const tokenHash = hashPortalToken(rawToken);
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * Hash a portal token for storage or lookup.
 * Uses SHA-256 (deterministic, no salt — safe for high-entropy random tokens).
 */
export function hashPortalToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Check if a portal token has expired based on the stored expiry time.
 * If no expiresAt is provided (legacy tokens), treats as expired.
 */
export function isPortalTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true; // Fail closed: no expiry = expired
  return new Date() > expiresAt;
}
