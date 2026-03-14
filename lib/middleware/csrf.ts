import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection: verify Origin/Referer on state-changing requests.
 * Exempt: cron jobs (no origin), preflight (handled before this runs).
 * Returns a 403 response if blocked, null otherwise.
 */
export function checkCsrf(
  req: NextRequest,
  pathname: string,
  origin: string | null,
  isAllowedOrigin: (o: string | null) => boolean
): NextResponse | null {
  const isApi = pathname.startsWith("/api");
  if (
    !isApi ||
    !["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ||
    pathname.startsWith("/api/cron")
  ) {
    return null;
  }

  const requestOrigin = origin || req.headers.get("referer");
  if (requestOrigin) {
    try {
      const originHost = new URL(requestOrigin).host;
      const expectedHost = req.headers.get("host") || "";
      if (originHost !== expectedHost && !isAllowedOrigin(origin)) {
        return NextResponse.json(
          { error: "Forbidden: cross-origin request" },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Forbidden: invalid origin" },
        { status: 403 }
      );
    }
  }
  // Requests with no Origin/Referer are allowed (same-origin form submissions,
  // server-to-server calls). The auth layer (requireAuth) is the primary protection.
  return null;
}
