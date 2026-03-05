// lib/auth/reset-token.ts
// Password reset token utilities using HMAC-SHA256.
// Tokens are self-contained (no DB storage needed) with 1-hour TTL.
// The user's password hash prefix is embedded to auto-invalidate after use.

import { createHmac, timingSafeEqual } from "crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function getSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("SESSION_SECRET or NEXTAUTH_SECRET must be set");
  return secret;
}

/**
 * Generate a password reset token.
 * Format: base64url({userId}:{userType}:{hashPrefix}:{expiresAt})
 * Signed with HMAC-SHA256.
 */
export function generateResetToken(
  userId: bigint,
  userType: "agent" | "lead",
  passwordHash: string
): string {
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
  // Include first 8 chars of password hash — if password changes, token auto-invalidates
  const hashPrefix = passwordHash.slice(0, 8);
  const payload = `${userId}:${userType}:${hashPrefix}:${expiresAt}`;
  const signature = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return token;
}

/**
 * Validate and decode a password reset token.
 * Returns null if invalid, expired, or tampered.
 */
export function validateResetToken(
  token: string,
  currentPasswordHash: string
): { userId: bigint; userType: "agent" | "lead" } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 5) return null;

    const [userIdStr, userType, hashPrefix, expiresAtStr, signature] = parts;

    if (userType !== "agent" && userType !== "lead") return null;

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

    // Verify password hasn't changed since token was issued
    if (currentPasswordHash.slice(0, 8) !== hashPrefix) return null;

    // Verify HMAC signature
    const payload = `${userIdStr}:${userType}:${hashPrefix}:${expiresAtStr}`;
    const expectedSig = createHmac("sha256", getSecret())
      .update(payload)
      .digest("base64url");

    const sigBuf = Buffer.from(signature, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    return { userId: BigInt(userIdStr), userType };
  } catch {
    return null;
  }
}
