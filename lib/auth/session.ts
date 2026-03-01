// lib/auth/session.ts
// Server-side session management backed by PostgreSQL
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";

// Session duration: 24 hours. Refresh threshold: 1 hour before expiry.
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

export interface SessionUser {
  userId: bigint;
  userType: "agent" | "lead";
  role: string;
  sessionId: string;
}

/**
 * Create a new session for a user.
 * Returns the session token (to set as httpOnly cookie).
 */
export async function createSession(
  userType: "agent" | "lead",
  userId: bigint,
  role: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

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

  // Rotate if within refresh threshold
  const timeUntilExpiry = session.expires_at.getTime() - Date.now();
  if (timeUntilExpiry < REFRESH_THRESHOLD_MS) {
    await prisma.session.update({
      where: { token },
      data: { expires_at: new Date(Date.now() + SESSION_DURATION_MS) },
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
