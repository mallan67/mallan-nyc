// POST /api/auth/impersonation/stop
// Terminates impersonation session. Broker must re-login with their own credentials.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, logAuditEvent, requireAuth, isAuthError } from "@/lib/auth";
import { destroySession } from "@/lib/auth/session";
import { clearSessionCookies } from "@/lib/auth/cookie-config";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Log the end of impersonation
  await logAuditEvent(
    "impersonate_stop",
    "agent",
    auth.userId.toString(),
    auth,
    { reason: "manual_stop" },
    ip
  );

  // Destroy the impersonation session
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);

  // Clear cookie
  const res = NextResponse.json({ success: true, message: "Impersonation ended. Please log in again." });
  clearSessionCookies(res);

  return res;
}
