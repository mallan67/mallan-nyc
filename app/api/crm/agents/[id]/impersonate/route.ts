// POST /api/crm/agents/[id]/impersonate
//
// BROKER DELEGATED ACCESS — START.
//
// The principal broker enters an agent's CRM account WITHOUT that agent's
// password and WITHOUT that agent's MFA. The agent's own MFA is not disabled
// or weakened by any of this; it is simply not on the path, because the broker
// never authenticates AS the agent. She authenticates once with her OWN MFA,
// and this route mints a delegated session that is a CHILD of that session.
//
// ── What the delegated row is ─────────────────────────────────────────────
//   user_id / role          = the EFFECTIVE AGENT, so every authorisation
//                             decision downstream operates with the AGENT's
//                             permissions, not the broker's
//   parent_session_id       = the broker's Session.id — an ID, NEVER a token
//   expires_at              = a FIXED ceiling, clamped to the parent's expiry
//
// The broker's own session row is PRESERVED, not replaced. That is what lets
// /api/auth/impersonation/stop return her to her own authority with no second
// MFA — there is nothing to re-authenticate, only a token to rotate.
//
// ── One cookie, deliberately ──────────────────────────────────────────────
// The delegated token occupies the single `session_token` cookie. A second
// cookie is NOT an option: three call sites read the literal 'session_token'
// outside the shared helper (app/api/health/env/route.ts:16,
// app/admin/seller-report/[id]/page.tsx:87, lib/middleware/rate-limiter.ts:196)
// and proxy.ts calls NextResponse.next() with no { request }, so no middleware
// rule can reach them. With two cookies those three would keep resolving
// BROKER mid-delegation.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireNonDelegatedBroker,
  isAuthError,
  logAuditEvent,
  createSessionRecord,
  DelegationRefusedError,
  DELEGATED_SESSION_MAX_MS,
  SESSION_COOKIE,
} from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";
import { isPrincipalBroker, isLicenseeAccessRole } from "@/lib/agents/brokerage-role";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  // Broker-only AND the caller's own session must be genuine. requireBroker()
  // alone is not enough: a delegation into another BROKER row yields a
  // delegated session carrying BROKER role, which would pass it and could
  // delegate again. No chains.
  const auth = await requireNonDelegatedBroker(req);
  if (isAuthError(auth)) return auth;

  const { id: agentId } = await params;

  // A forged / non-numeric id must be REFUSED, not thrown. BigInt() raises a
  // SyntaxError on anything non-numeric, which previously escaped as a 500.
  let targetId: bigint;
  try {
    targetId = BigInt(agentId);
  } catch {
    return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });
  }

  // Verify agent exists and is active
  const agent = await prisma.agent.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      status: true,
      role: true,
      email: true,
      full_name: true,
      first_name: true,
      last_name: true,
    },
  });

  if (!agent || agent.status !== "active") {
    return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });
  }

  // Cannot impersonate self. Checked FIRST and kept separate from the target
  // rule below so this case keeps its own distinct error — "you targeted
  // yourself" and "you targeted another broker" are different mistakes.
  if (agent.id === auth.userId) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  // ── TARGET RULE — a BROKER account is NOT a delegated-access target ──
  // Delegation exists so the principal broker can enter an agent /
  // associate-broker account. Refusing a BROKER target is strictly stronger
  // than the anti-chaining rule: anti-chaining would still permit a live
  // delegated session CARRYING broker powers (merely unable to delegate
  // again). This ensures no delegated session ever holds broker authority.
  if (isPrincipalBroker(agent.role)) {
    return NextResponse.json(
      { error: "Cannot delegate into a broker account" },
      { status: 403 }
    );
  }

  // And the target must be a licensee account at all.
  if (!isLicenseeAccessRole(agent.role)) {
    return NextResponse.json(
      { error: "Agent not found or inactive" },
      { status: 404 }
    );
  }

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const ua = req.headers.get("user-agent") ?? undefined;

  // Create the delegated session. createSessionRecord re-validates the parent
  // fail-closed and creates NO ROW AT ALL if any check fails, so a refused
  // delegation never leaves a usable credential behind.
  let delegated;
  try {
    delegated = await createSessionRecord("agent", agent.id, agent.role, ip, ua, {
      parentSessionId: auth.sessionId,
      maxLifetimeMs: DELEGATED_SESSION_MAX_MS,
    });
  } catch (err) {
    if (err instanceof DelegationRefusedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  // Log the impersonation event.
  //
  // `auth` here is the broker's OWN genuine session, so this row records
  // user_id = broker and actor_user_id = null — the actor IS the effective
  // user at the moment the delegation is requested. Events written DURING the
  // delegation carry user_id = agent and actor_user_id = broker.
  await logAuditEvent(
    "impersonate_start",
    "agent",
    agentId,
    auth,
    {
      broker_id: auth.userId.toString(),
      broker_session_id: auth.sessionId,
      agent_id: agent.id.toString(),
      agent_name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
      delegated_session_id: delegated.sessionId,
      expires_at: delegated.expiresAt.toISOString(),
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
    expiresAt: delegated.expiresAt.toISOString(),
  });

  // The cookie lifetime is derived from the expiry the SERVER actually stored,
  // never from a hand-written constant. The previous code set a 2h cookie over
  // an 8h server row, so the server kept honouring the delegation for six
  // hours after the browser had stopped showing it.
  const maxAge = Math.max(
    0,
    Math.floor((delegated.expiresAt.getTime() - Date.now()) / 1000)
  );
  res.cookies.set(SESSION_COOKIE, delegated.token, {
    ...getSessionCookieConfig("agent", agent.role),
    maxAge,
  });

  return res;
}
