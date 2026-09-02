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
 * STAFF AUTHORIZATION — requires the staff IDENTITY DOMAIN, not merely the text
 * "AGENT" or "BROKER".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CLOSES.
 *
 * Mallan keeps two different kinds of principal in one `Session.role` string:
 * staff roles (AGENT/BROKER) and client portal roles (buyer/renter/seller/
 * landlord). `Session.userType` separately knows which domain a principal is
 * in — "agent" or "lead" — and this function used to ignore it entirely:
 *
 *     const normalizedRole = result.role.toUpperCase();
 *     if (!allowedRoles.map(r => r.toUpperCase()).includes(normalizedRole)) 403
 *
 * `Lead.portal_role` is copied verbatim into `Session.role` by EVERY login path
 * (password login, invite acceptance, password reset, OAuth). So a client whose
 * portal_role read "BROKER" produced Session(userType="lead", role="BROKER") and
 * satisfied requireBroker() — on every broker-only route, including agent
 * administration and impersonation, which mints a genuine staff session and
 * therefore bypasses the Broker MFA path entirely.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE CHECK BELONGS HERE AND NOT ONLY AT THE WRITERS.
 *
 * Constraining `portal_role` at its writers is necessary defence in depth and is
 * done as well. But it cannot be the boundary: it does nothing about rows
 * already carrying a bad value, and it would have to be re-proven at every
 * future writer. Fixing the AUTHORIZATION check makes every stale row harmless
 * immediately, with no data migration and no backfill.
 *
 * Verified safe: `requireRole` has exactly three callers — health/crons,
 * requireBroker, requireAgentOrBroker — and all three are staff-only. No portal
 * path uses it; `requirePortalRole` is the lead path and already bypasses on
 * `userType === "agent"`.
 */
export async function requireRole(
  req: NextRequest,
  ...allowedRoles: string[]
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  // THE TRUST BOUNDARY. A lead session can never hold staff authority, whatever
  // string its role happens to contain. Fails closed and says nothing about why,
  // so the response cannot be used to probe for the role vocabulary.
  if (result.userType !== "agent") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

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
 * Require a lead (client portal user) with a specific portal role.
 * Enforces: buyer cannot access seller data, landlord cannot access renter data, etc.
 * Also allows agents/brokers (they have full access).
 */
export async function requirePortalRole(
  req: NextRequest,
  ...allowedPortalRoles: string[]
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  // Agents and brokers bypass portal role checks (full CRM access)
  if (result.userType === "agent") return result;

  // For leads, enforce portal role
  const lead = await prisma.lead.findUnique({
    where: { id: result.userId },
    select: { portal_role: true },
  });

  const portalRole = lead?.portal_role || result.role;
  // Normalize tenant → renter
  const normalized = portalRole === "tenant" ? "renter" : portalRole;
  const allowed = allowedPortalRoles.map(r => r === "tenant" ? "renter" : r);

  if (!allowed.includes(normalized)) {
    return NextResponse.json(
      { error: "Access denied for this portal role" },
      { status: 403 }
    );
  }

  return result;
}

/**
 * Require a lead with access to a specific workspace.
 * Checks enabled_workspaces[] on Lead, falling back to roles[]-derived workspaces.
 * Agents/brokers bypass (full CRM access).
 * This is the v2 replacement for requirePortalRole() — workspace-aware access.
 */
export async function requireWorkspace(
  req: NextRequest,
  ...allowedWorkspaces: string[]
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  // Agents and brokers bypass workspace checks (full CRM access)
  if (result.userType === "agent") return result;

  // For leads, check enabled_workspaces
  const lead = await prisma.lead.findUnique({
    where: { id: result.userId },
    select: { enabled_workspaces: true, roles: true, portal_role: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Derive workspaces: explicit enabled_workspaces > roles-derived > portal_role
  let workspaces = lead.enabled_workspaces;
  if (!workspaces || workspaces.length === 0) {
    workspaces = (lead.roles || []).map(r => r === "renter" ? "tenant" : r);
  }
  if (workspaces.length === 0 && lead.portal_role) {
    workspaces = [lead.portal_role];
  }

  // Normalize: "renter" → "tenant" for workspace matching
  const normalizedWorkspaces = workspaces.map(w => w === "renter" ? "tenant" : w);
  const normalizedAllowed = allowedWorkspaces.map(w => w === "renter" ? "tenant" : w);

  const hasAccess = normalizedAllowed.some(a => normalizedWorkspaces.includes(a));
  if (!hasAccess) {
    return NextResponse.json(
      { error: "Access denied for this workspace" },
      { status: 403 }
    );
  }

  return result;
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
