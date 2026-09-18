// lib/auth/session.ts
// Server-side session management backed by PostgreSQL
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";

// Per-role session durations (must match cookie-config.ts maxAge values)
const SESSION_TTL_MS = {
  broker: 24 * 60 * 60 * 1000,   // 24 hours
  agent:   8 * 60 * 60 * 1000,   //  8 hours
  client: 30 * 24 * 60 * 60 * 1000, // 30 days
  default: 24 * 60 * 60 * 1000,  // 24 hours fallback
} as const;

// Refresh threshold: 1 hour before expiry (or 10% of TTL, whichever is smaller)
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// UCBA Art. III §6 ethics training tracking (Workstream C4b).
// Ethics training is an ADMINISTRATIVE compliance RECORD only. The DB fields
// (ethics_training_completed_at, ethics_training_expires_at), the admin panel
// at /broker/people/ethics, and the ethics-training admin API are for record-
// keeping and broker-directed follow-up. Ethics/CE dates do NOT block session
// creation, login, or MFA — authentication is governed solely by account
// status (active/inactive/suspended). Missing or expired ethics training must
// never automatically block login. It is NOT wired into any automated
// authentication or listing-submission gate.
//
// PR-Licensing.1: Licensing Department workflow (agent self-upload of
// proof, renewal reminders, broker review dashboard) is the next PR.
// ─────────────────────────────────────────────────────────────────────────────

// The throwing enforcement primitives that once lived here —
// `EthicsTrainingExpiredError` and `assertAgentEthicsTrainingValid()` — have
// been removed. They had no approved production caller, and ethics training is
// NOT an authentication or listing-submission gate (see the module header and
// commit 2c10ce0b). Ethics-training records are maintained through the broker
// admin API (app/api/crm/agents/[id]/ethics-training/route.ts, which writes an
// audit event) and surfaced read-only by
// scripts/ethics-training-status-report.ts for broker follow-up.

/**
 * Exact-match test for the PRINCIPAL broker role.
 *
 * NY licence classes are distinct professional identities: BROKER,
 * ASSOCIATE_BROKER and SALESPERSON. ASSOCIATE_BROKER is NOT a principal broker
 * and is deliberately not matched here. The comparison is exact and is never a
 * substring test — "Licensed Associate Real Estate Broker" contains the word
 * "broker" and must never be classified as a principal.
 *
 * Lowercase `broker` is the retired legacy value that
 * app/api/auth/login/route.ts still accepts, so it is treated as principal for
 * fail-closed parity with the MFA branch there.
 */
export function isPrincipalBrokerRole(role: string): boolean {
  return role === "BROKER" || role === "broker";
}

/**
 * Evidence that a principal-broker session is legitimate.
 *
 *  - `mfa_verified` — the broker completed the OTP challenge.
 *  - `dev_login`    — the explicitly gated development-only login tool.
 *
 * There is no third value, and the ABSENCE of assurance is not a permitted
 * state for a broker session.
 */
export type BrokerSessionAssurance =
  | { kind: "mfa_verified" }
  | { kind: "dev_login" };

/** Thrown when a principal-broker session is requested without valid assurance. */
export class BrokerSessionAssuranceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerSessionAssuranceError";
  }
}

/**
 * Enforce the broker-session invariant. Throws unless the caller supplied
 * assurance that broker MFA occurred, or the explicitly gated dev-login path.
 * The dev-login branch re-checks the environment here so the exception cannot
 * exist in production even if a caller passes the assurance value.
 */
function assertBrokerSessionAssurance(assurance?: BrokerSessionAssurance): void {
  if (!assurance) {
    throw new BrokerSessionAssuranceError(
      "A principal BROKER session requires verified broker MFA. Refusing to " +
        "create an unverified broker session.",
    );
  }

  if (assurance.kind === "mfa_verified") return;

  if (assurance.kind === "dev_login") {
    const devAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_LOGIN === "true";
    if (!devAllowed) {
      throw new BrokerSessionAssuranceError(
        "dev-login broker sessions are permitted only outside production with " +
          "ALLOW_DEV_LOGIN set to exactly \"true\".",
      );
    }
    return;
  }

  throw new BrokerSessionAssuranceError("Unrecognised broker session assurance.");
}

/** Resolve the correct TTL for a user type + role combination */
function getSessionDurationMs(userType: string, role: string): number {
  if (isPrincipalBrokerRole(role)) return SESSION_TTL_MS.broker;
  if (userType === "agent") return SESSION_TTL_MS.agent;
  if (userType === "lead") return SESSION_TTL_MS.client;
  return SESSION_TTL_MS.default;
}

export interface SessionUser {
  userId: bigint;
  userType: "agent" | "lead";
  role: string;
  sessionId: string;
}

/**
 * Create a new session for a user.
 * Returns the session token (to set as httpOnly cookie).
 * DB expires_at matches the cookie maxAge for the user's role.
 */
export async function createSession(
  userType: "agent" | "lead",
  userId: bigint,
  role: string,
  ipAddress?: string,
  userAgent?: string,
  assurance?: BrokerSessionAssurance
): Promise<string> {
  // Ethics/CE tracking lives in the DB and admin panel but does NOT
  // block session creation. Compliance is enforced at listing submission.

  // ── Principal-broker session gate — FAIL CLOSED ──
  // `prisma.session.create` below is the ONLY session writer in app/ or lib/,
  // so enforcing here means a future caller that forgets a broker check cannot
  // mint a broker session by accident: it throws instead. Leads are never
  // licensees, so the gate is scoped to agents.
  if (userType === "agent" && isPrincipalBrokerRole(role)) {
    assertBrokerSessionAssurance(assurance);
  }

  const token = randomUUID();
  const durationMs = getSessionDurationMs(userType, role);
  const expiresAt = new Date(Date.now() + durationMs);

  await prisma.session.create({
    data: {
      token,
      user_type: userType,
      user_id: userId,
      role,
      expires_at: expiresAt,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    },
  });

  return token;
}

/**
 * Validate a session token.
 * Returns the session user if valid, null if expired/missing.
 * Automatically rotates the token if close to expiry.
 */
export async function validateSession(
  token: string
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session) return null;
  if (session.expires_at < new Date()) {
    // Expired — clean up and return null
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }

  // Rotate if within refresh threshold — use role-appropriate duration
  const timeUntilExpiry = session.expires_at.getTime() - Date.now();
  if (timeUntilExpiry < REFRESH_THRESHOLD_MS) {
    const durationMs = getSessionDurationMs(session.user_type, session.role);
    await prisma.session.update({
      where: { token },
      data: { expires_at: new Date(Date.now() + durationMs) },
    });
  }

  return {
    userId: session.user_id,
    userType: session.user_type as "agent" | "lead",
    role: session.role,
    sessionId: session.id,
  };
}

/**
 * Destroy a session (logout).
 */
export async function destroySession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

/**
 * Clean up expired sessions. Call from cron job.
 */
export async function cleanExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });
  return result.count;
}
