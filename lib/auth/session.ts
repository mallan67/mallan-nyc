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

/** Where agents are sent to complete or renew their REBNY ethics training. */
const ETHICS_RETRAINING_URL =
  process.env.REBNY_ETHICS_TRAINING_URL ||
  "https://www.rebny.com/content/rebny/en/Education/courses.html";

/**
 * Thrown by `assertAgentEthicsTrainingValid` when an agent has no recorded
 * ethics training, or when their training is past `ethics_training_expires_at`.
 *
 * NOTE: this is NOT thrown during authentication. `createSession()` does not
 * call the assertion, and the login / MFA-verify route handlers do NOT catch
 * this error — ethics training never blocks login (see the module header and
 * commit 2c10ce0b). This error type exists only for administrative/reporting
 * callers of `assertAgentEthicsTrainingValid`.
 */
export class EthicsTrainingExpiredError extends Error {
  readonly code = "ETHICS_TRAINING_EXPIRED" as const;
  readonly retrainingUrl: string;
  /** Why the training is invalid: "missing" (never recorded) | "expired". */
  readonly reason: "missing" | "expired";
  /** Date the training expired, when reason="expired". */
  readonly expiredAt: Date | null;

  constructor(reason: "missing" | "expired", expiredAt: Date | null) {
    const message =
      reason === "missing"
        ? "Ethics training has not been recorded for this agent. Complete training to access RLS."
        : `Ethics training expired on ${expiredAt?.toISOString().slice(0, 10)}. Re-train to restore RLS access.`;
    super(message);
    this.name = "EthicsTrainingExpiredError";
    this.reason = reason;
    this.expiredAt = expiredAt;
    this.retrainingUrl = ETHICS_RETRAINING_URL;
  }
}

/**
 * Verify the agent's ethics training is valid. Throws
 * `EthicsTrainingExpiredError` if missing or expired.
 *
 * NOT called from createSession(), login, or MFA — authentication is never
 * blocked by ethics dates. Provided for ADMINISTRATIVE/reporting use only
 * (e.g. a broker compliance dashboard or backfill audit). It is not wired into
 * any automated authentication or listing-submission gate.
 */
export async function assertAgentEthicsTrainingValid(agentId: bigint): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      ethics_training_completed_at: true,
      ethics_training_expires_at: true,
    },
  });

  // No row found is a separate problem; let the caller catch the FK violation.
  if (!agent) return;

  // NULL expires_at means: training has never been recorded for this agent.
  // The C4 doctrine is fail-closed — treat NULL as "never trained → expired".
  if (agent.ethics_training_expires_at === null) {
    throw new EthicsTrainingExpiredError("missing", null);
  }

  if (agent.ethics_training_expires_at.getTime() < Date.now()) {
    throw new EthicsTrainingExpiredError("expired", agent.ethics_training_expires_at);
  }
}

/** Resolve the correct TTL for a user type + role combination */
function getSessionDurationMs(userType: string, role: string): number {
  if (role === "BROKER" || role === "broker") return SESSION_TTL_MS.broker;
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
  userAgent?: string
): Promise<string> {
  // Ethics/CE tracking lives in the DB and admin panel but does NOT
  // block session creation. Compliance is enforced at listing submission.

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
