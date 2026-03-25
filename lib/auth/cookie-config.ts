/**
 * Per-role session cookie configuration.
 * Policy: Broker=24h, Agent=8h sliding, Client=30d persistent.
 */

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
