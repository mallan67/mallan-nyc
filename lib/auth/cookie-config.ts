/**
 * Per-role session cookie configuration.
 * Policy: Broker=24h, Agent=8h sliding, Client=30d persistent.
 */

export function getSessionCookieConfig(userType: string, role: string) {
  // BROKER IS AN IDENTITY DOMAIN PLUS A ROLE, NOT A STRING.
  //
  // This read `role === "BROKER" || role === "broker"` with no reference to
  // userType, so a CLIENT whose portal_role happened to be "BROKER" was handed
  // broker cookie treatment — strict sameSite and the 24-hour broker TTL —
  // rather than the 30-day client policy.
  //
  // Not the escalation itself (the authorization fix in requireRole closes
  // that), but the same confusion of the two role namespaces, and it decided a
  // real security attribute on the strength of a role string alone.
  const isStaff = userType === "agent";
  const isBroker = isStaff && (role === "BROKER" || role === "broker");
  const isAgent = isStaff && !isBroker;
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
