// POST /api/auth/impersonation/stop
//
// BROKER DELEGATED ACCESS — RETURN TO BROKER, with NO second MFA.
//
// The old contract here was "Broker must re-login with their own credentials",
// because starting a delegation OVERWROTE the broker's session and there was
// nothing left to return to. That is fixed at the source: the delegated row is
// now a CHILD of the broker's own row (sessions.parent_session_id), and the
// parent is preserved untouched for the whole delegation.
//
// So returning is not an authentication event at all. The broker's authority
// never went away; only the token in the cookie changed. This route destroys
// ONLY the delegated row and rotates a FRESH token onto the preserved parent.
//
// Rotation, not reuse: the pre-delegation token is discarded, so no parent
// credential was ever copied onto the delegated row, into a second cookie, or
// held anywhere for the duration.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  SESSION_COOKIE,
  logAuditEvent,
  requireAuth,
  isAuthError,
  endDelegationAndRotateParent,
} from "@/lib/auth";
import { getSessionCookieConfig } from "@/lib/auth/cookie-config";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  // Fail closed on a caller that is not delegated. Nothing is destroyed — an
  // ordinary agent hitting this must not be able to log themselves out through
  // a route that claims to be doing something else.
  if (!auth.parentSessionId) {
    return NextResponse.json(
      { error: "Not in a delegated session" },
      { status: 400 }
    );
  }

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Written FIRST, and written with the DELEGATED identity, so the row records
  // user_id = the effective agent and actor_user_id = the broker. Writing it
  // before the rotation guarantees the record survives even if rotation fails.
  await logAuditEvent(
    "impersonate_stop",
    "agent",
    auth.userId.toString(),
    auth,
    {
      reason: "manual_stop",
      broker_id: auth.actorUserId ? auth.actorUserId.toString() : null,
      agent_id: auth.userId.toString(),
      delegated_session_id: auth.sessionId,
    },
    ip
  );

  const restored = await endDelegationAndRotateParent(auth.sessionId);

  if (!restored) {
    // The parent broker session is no longer valid (expired or gone). The
    // delegated row has been destroyed on the way out. Fail closed: do NOT
    // mint broker authority that the parent session no longer carries.
    const res = NextResponse.json(
      { error: "Your broker session is no longer valid. Please sign in again." },
      { status: 401 }
    );
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const broker = await prisma.agent.findUnique({
    where: { id: restored.userId },
    select: { id: true, full_name: true, first_name: true, last_name: true, role: true },
  });

  const res = NextResponse.json({
    success: true,
    restored: {
      id: restored.userId.toString(),
      name: broker
        ? broker.full_name || `${broker.first_name} ${broker.last_name}`
        : null,
      role: restored.role,
    },
  });

  // Cookie sized from the PARENT's real remaining lifetime — the broker gets
  // back exactly the session she already had, not a fresh 24 hours. Returning
  // from a delegation is not a re-authentication and must not extend anything.
  const maxAge = Math.max(
    0,
    Math.floor((restored.expiresAt.getTime() - Date.now()) / 1000)
  );
  res.cookies.set(SESSION_COOKIE, restored.token, {
    ...getSessionCookieConfig("agent", restored.role),
    maxAge,
  });

  return res;
}
