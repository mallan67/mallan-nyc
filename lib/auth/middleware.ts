// lib/auth/middleware.ts
// Auth helpers for API route handlers
import { NextRequest, NextResponse } from "next/server";
import { validateSession, type SessionUser } from "./session";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const SESSION_COOKIE = "session_token";

/**
 * Extract session token from cookie.
 */
function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Require a valid session. Returns the session user or a 401 response.
 */
export async function requireAuth(
  req: NextRequest
): Promise<SessionUser | NextResponse> {
  const token = getSessionToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const user = await validateSession(token);
  if (!user) {
    const res = NextResponse.json(
      { error: "Session expired or invalid" },
      { status: 401 }
    );
    // Clear stale cookie
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  return user;
}

/**
 * Require a specific role. Returns the session user or a 401/403 response.
 */
export async function requireRole(
  req: NextRequest,
  ...allowedRoles: string[]
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  const normalizedRole = result.role.toUpperCase();
  if (!allowedRoles.map(r => r.toUpperCase()).includes(normalizedRole)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  return result;
}

/**
 * Require broker role. Convenience wrapper.
 */
export async function requireBroker(
  req: NextRequest
): Promise<SessionUser | NextResponse> {
  return requireRole(req, "BROKER");
}

/**
 * Require agent or broker role.
 */
export async function requireAgentOrBroker(
  req: NextRequest
): Promise<SessionUser | NextResponse> {
  return requireRole(req, "AGENT", "BROKER");
}

/**
 * Helper: check if result is a NextResponse (error) vs SessionUser (success).
 */
export function isAuthError(
  result: SessionUser | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Log an audit event for a mutation.
 */
export async function logAuditEvent(
  action: string,
  entityType: string,
  entityId: string,
  user: SessionUser,
  changes?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_type: user.userType,
      user_id: user.userId,
      changes: changes ? (changes as Prisma.InputJsonValue) : undefined,
      ip_address: ipAddress ?? null,
    },
  });
}

export { SESSION_COOKIE };
