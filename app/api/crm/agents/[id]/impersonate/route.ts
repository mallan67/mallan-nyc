// POST /api/crm/agents/[id]/impersonate
// Broker-only: creates a delegated impersonation session for an agent.
// Audit-logged with broker ID, agent ID, timestamp, and IP.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent, createSession, SESSION_COOKIE } from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id: agentId } = await params;

  // Verify agent exists and is active
  const agent = await prisma.agent.findUnique({
    where: { id: BigInt(agentId) },
  });

  if (!agent || agent.status !== "active") {
    return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });
  }

  // Cannot impersonate self
  if (agent.id === auth.userId) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Create a delegated session with 2-hour TTL
  const token = await createSession("agent", agent.id, agent.role, ip, undefined);

  // Log the impersonation event
  await logAuditEvent(
    "impersonate_start",
    "agent",
    agentId,
    auth,
    {
      broker_id: auth.userId.toString(),
      broker_name: "Broker",
      agent_name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
    },
    ip
  );

  const res = NextResponse.json({
    success: true,
    impersonating: {
      id: agent.id.toString(),
      name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
      email: agent.email,
      role: agent.role,
    },
  });

  // Set cookie with 2-hour TTL for impersonation (shorter than normal agent 8h)
  res.cookies.set(SESSION_COOKIE, token, {
    ...getSessionCookieConfig("agent", agent.role),
    maxAge: 2 * 60 * 60, // 2 hours max for impersonation
  });

  return res;
}
