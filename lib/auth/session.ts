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
