/**
 * Per-role session cookie configuration.
 * Policy: Broker=24h, Agent=8h sliding, Client=30d persistent.
 */

/**
 * Auth-PRESENCE marker cookie (Neon-quiet, 2026-07-23).
 *
 * DELIBERATELY NON-AUTHORITATIVE, presentation-only: a non-httpOnly companion
 * to the session cookie whose ONLY purpose is letting the public-shell
 * AuthProvider know whether a full /api/auth/me lookup is worth making.
 * Anonymous visitors have no marker → the client renders the neutral
 * "Sign In" state with ZERO network request and ZERO Neon queries.
 *
 * SECURITY CONTRACT (enforced by test): no server-side authorization path may
 * ever read this cookie. It grants nothing; a forged marker merely causes one
 * /api/auth/me call that returns unauthenticated. It carries the constant
 * value "1" — never identity, role, or session material.
 */
export const AUTH_PRESENCE_COOKIE = "mallan_auth_present";

/** Canonical session-cookie name (moved here from lib/auth/middleware.ts so
 *  the paired set/clear helpers below own it without an import cycle). */
export const SESSION_COOKIE = "session_token";

/**
 * Minimal response shape both NextResponse and route-handler responses share.
 */
interface CookieCarrier {
  cookies: {
    set: (name: string, value: string, opts?: Record<string, unknown>) => unknown;
    delete: (name: string) => unknown;
  };
}

/**
 * THE single way to establish a session on a response (Neon-quiet 2026-07-23).
 *
 * Sets the httpOnly session cookie AND its non-authoritative presence marker
 * together, so no sign-in path (password, MFA, OAuth agent/lead, invitation,
 * reset, impersonation, dev-login) can create a session the public shell
 * cannot see. A repo-wide discovery test enforces that NO file outside this
 * module calls `cookies.set(SESSION_COOKIE, …)` directly.
 *
 * `overrides` preserves site-specific policy (impersonation's 2h TTL,
 * dev-login's secure:false, OAuth's 24h) on BOTH cookies so their lifetimes
 * never diverge. The marker is always forced non-httpOnly and always carries
 * the constant value "1" — never identity, role, or session material.
 */
export function applySessionCookies(
  res: CookieCarrier,
  token: string,
  userType: string,
  role: string,
  overrides?: Record<string, unknown>,
): void {
  const session = { ...getSessionCookieConfig(userType, role), ...overrides };
  res.cookies.set(SESSION_COOKIE, token, session);
  res.cookies.set(AUTH_PRESENCE_COOKIE, "1", { ...session, httpOnly: false });
}

/**
 * THE single way to end a session on a response — deletes the session cookie
 * and its presence marker together (logout, invalid session, impersonation
 * stop, auth-middleware stale-cookie clear).
 */
export function clearSessionCookies(res: CookieCarrier): void {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(AUTH_PRESENCE_COOKIE);
}

/** Same lifetime/path as the session cookie, but NOT httpOnly (client-readable). */
export function getPresenceCookieConfig(userType: string, role: string) {
  const base = getSessionCookieConfig(userType, role);
  return { ...base, httpOnly: false };
}

export function getSessionCookieConfig(userType: string, role: string) {
  const isBroker = role === "BROKER" || role === "broker";
  const isAgent = userType === "agent" && !isBroker;
  const isClient = userType === "lead";

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: isBroker ? ("strict" as const) : ("lax" as const),
    path: "/",
    maxAge: isBroker
      ? 24 * 60 * 60       // Broker: 24 hours
      : isAgent
        ? 8 * 60 * 60      // Agent: 8 hours (sliding renewal in validateSession)
        : isClient
          ? 30 * 24 * 60 * 60  // Client: 30 days
          : 24 * 60 * 60,      // Default: 24 hours
  };
}
