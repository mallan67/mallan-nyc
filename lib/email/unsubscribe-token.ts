// lib/email/unsubscribe-token.ts
//
// Signed (HMAC-SHA256) one-click unsubscribe token. A one-click unsubscribe link
// carries `?email=<addr>&token=<hmac>`; the token binds the link to that exact
// address, so an attacker who edits the `email` in the URL produces a token that
// no longer verifies and the request is rejected. The self-service unsubscribe
// FORM (recipient types their own address) and pre-token legacy links remain
// tokenless — the route accepts those on the rate-limited legacy path.
//
// STATELESS by design: the token is derived from the address + a server secret,
// so there is NO database column and NO Prisma migration.
//
// KEY ROTATION: `UNSUBSCRIBE_SECRET` signs NEW tokens. `UNSUBSCRIBE_SECRET_PREVIOUS`
// (optional) is ALSO accepted on verify, so links already delivered under the old
// secret keep working during a rotation window. Rotate by: set PREVIOUS = current,
// set current = new value, deploy; after the window (longer than your send cadence)
// clear PREVIOUS.

import { createHmac, timingSafeEqual } from "crypto";

function normalizeEmail(email: string): string {
  return String(email || "").toLowerCase().trim();
}

function sign(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeEmail(email)).digest("base64url");
}

/** Secrets accepted on verify: current + optional previous (rotation window). */
function verifySecrets(): string[] {
  return [process.env.UNSUBSCRIBE_SECRET, process.env.UNSUBSCRIBE_SECRET_PREVIOUS].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
}

/**
 * Make an unsubscribe token for `email`, or `null` when no secret is configured
 * (feature disabled → the link is emitted tokenless and uses the legacy path).
 */
export function makeUnsubscribeToken(email: string): string | null {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return null;
  return sign(email, secret);
}

/**
 * Verify `token` for `email`, timing-safe, against the current (and previous)
 * secret. Returns false for a missing/invalid token OR when no secret is
 * configured (a PRESENT token cannot be validated ⇒ reject — fail-closed).
 */
export function verifyUnsubscribeToken(email: string, token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const tokenBuf = Buffer.from(token);
  let ok = false;
  for (const secret of verifySecrets()) {
    const expected = Buffer.from(sign(email, secret));
    // Constant-time compare; skip early-return so timing does not leak which
    // secret matched. Length guard avoids timingSafeEqual throwing on mismatch.
    if (expected.length === tokenBuf.length && timingSafeEqual(expected, tokenBuf)) {
      ok = true;
    }
  }
  return ok;
}
