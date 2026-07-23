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
