// lib/auth/middleware.ts
// Auth helpers for API route handlers
import { NextRequest, NextResponse } from "next/server";
import { validateSession, type SessionUser } from "./session";
import { isLicenseeAccessRole } from "@/lib/agents/brokerage-role";
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
 * Require an authenticated MALLAN LICENSEE session. ~146 route files call this.
 *
 * ── The name is deliberate technical debt ─────────────────────────────────
 * `Agent.role` now names the BROKERAGE PROFESSIONAL ROLE — BROKER,
 * ASSOCIATE_BROKER or SALESPERSON — so "AgentOrBroker" is a misnomer. Renaming
 * it would turn a semantic fix into a 146-file mechanical rename, so the name
 * stays and the semantics are corrected here, at the one place that decides.
 * Rename/deprecate as a separate packet.
 *
 * ── What changed, and what deliberately did NOT ───────────────────────────
 * This used to be `requireRole(req, "AGENT", "BROKER")` — a literal match on
 * the two values the retired model happened to store. Naming the professional
 * roles honestly would have 403'd every associate broker and salesperson out of
 * every route that calls this.
 *
 * It was NOT replaced with a bare `userType === "agent"` check. The middleware
 * already uses that test to bypass client-portal restrictions, where it carries
 * the broader meaning "internal user", and nothing in the schema proves every
 * `Agent` row is a licensed professional (`license_type` is nullable). Widening
 * all ~146 routes to any agent-type session could silently grant licensee
 * permissions to an office or admin account.
 *
 * So BOTH must hold: the session identity is an agent session, AND the role is
 * an eligible professional role. That is today's allow-list plus exactly the
 * two honest professional values — no widening, and legacy "AGENT" rows and
 * live sessions keep working through the transition.
 *
 * PRINCIPAL-BROKER-ONLY authority is a DIFFERENT question and stays narrow:
 * requireBroker() / `auth.role !== "BROKER"` are untouched, and an Associate
 * Broker does not acquire them.
 */
export async function requireAgentOrBroker(
  req: NextRequest
): Promise<SessionUser | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  if (result.userType !== "agent" || !isLicenseeAccessRole(result.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  return result;
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
