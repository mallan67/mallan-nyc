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

  // A SECOND, INDEPENDENT BOUNDARY.
  //
  // This route is the escalation AMPLIFIER: it turns whatever principal passes
  // the guard into a genuine staff session via createSession("agent", ...). It
  // therefore does not rely on requireBroker alone being correct — if that guard
  // is ever weakened again, this check still holds.
  if (auth.userType !== "agent") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id: agentId } = await params;

  // Verify agent exists and is active
  const agent = await prisma.agent.findUnique({
    where: { id: BigInt(agentId) },
  });

  if (!agent || agent.status !== "active") {
    return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });
  }

  // THE TARGET MUST BE AN AGENT.
  //
  // The route is documented as AGENT impersonation, and the target was
  // previously unrestricted by role — only `status === "active"` and not-self.
  // So a broker could mint a session as ANOTHER BROKER, which is a lateral move
  // into a peer's staff identity with no separate authorisation and no MFA.
  //
  // FAILS CLOSED: no product rule in this repo establishes that broker->broker
  // impersonation is required, and inferring the permission from the absence of
  // a check is how the original defect happened. If the product genuinely needs
  // it, that is an explicit decision to make, not a default.
  if (agent.role !== "AGENT") {
    return NextResponse.json(
      { error: "Only agent accounts may be impersonated" },
      { status: 403 },
    );
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
