import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "session_token";

const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

/**
 * CRM document gate, shared by the fast cookie-presence guard and the real
 * session check. Static assets and the login page are intentionally public.
 * This is not a separate identity system: sessions remain in canonical Neon.
 */
export function isProtectedCrmPage(pathname: string): boolean {
  return pathname.startsWith("/crm") &&
    !pathname.startsWith("/crm/login") &&
    !pathname.startsWith("/crm/js/") &&
    !pathname.startsWith("/crm/css/") &&
    !pathname.startsWith("/crm/images/") &&
    !pathname.endsWith(".ico");
}

function redirectCrmLogin(req: NextRequest, pathname: string, clearCookie: boolean): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/crm/login.html";
  url.searchParams.set("redirect", pathname);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  if (clearCookie) response.cookies.delete(SESSION_COOKIE);
  return response;
}

/**
 * A forged cookie must not unlock a CRM document. Use the canonical Session
 * record, scoped to CRM HTML only: never contact a URL taken from request
 * headers and never make an internal HTTP round-trip to /api/auth/me.
 *
 * A database outage is 503 without destroying a legitimate user's cookie.
 * A valid client/lead session is not CRM authorization.
 */
export async function verifyCrmPageSession(
  req: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  if (!isProtectedCrmPage(pathname)) return null;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectCrmLogin(req, pathname, false);

  try {
    // Lazy import: public pages and CRM static assets must not load Prisma.
    const { validateSession } = await import("@/lib/auth/session");
    const session = await validateSession(token);
    if (!session) return redirectCrmLogin(req, pathname, true);
    if (session.userType !== "agent" || !["AGENT", "BROKER"].includes(session.role.toUpperCase())) {
      return NextResponse.json(
        { error: "CRM access requires an agent or broker session" },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return null;
  } catch {
    return NextResponse.json(
      { error: "Authentication temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "30" } },
    );
  }
}

/**
 * Route-level access guards: block dev pages in prod, protect CRM/portal/admin paths.
 * Returns a redirect or 401/404 response if blocked, null otherwise.
 */
export function checkRouteGuards(req: NextRequest, pathname: string): NextResponse | null {
  // Block development/debug pages in production
  if (isProd && (pathname.startsWith("/style-preview") || pathname.startsWith("/demo"))) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Block CRM source files from public access
  if (
    pathname.startsWith("/crm/html/") ||
    pathname.startsWith("/crm/tests/") ||
    pathname.startsWith("/crm/scripts/") ||
    pathname.startsWith("/crm/COMPLIANCE/") ||
    pathname.startsWith("/crm/CONTRACTS/") ||
    pathname.startsWith("/crm/docs/") ||
    pathname === "/crm/build.js" ||
    pathname === "/crm/index.html"
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Cookie presence is only the fast pre-filter; proxy also validates
  // the canonical session before a CRM document is served.
  if (isProtectedCrmPage(pathname) && !req.cookies.has(SESSION_COOKIE)) {
    return redirectCrmLogin(req, pathname, false);
  }

  // CRM API route protection
  if (pathname.startsWith("/api/crm")) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  // Portal API route protection
  if (pathname.startsWith("/api/portal")) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  // Admin route protection
  if (pathname.startsWith("/admin")) {
    const hasSession = req.cookies.has(SESSION_COOKIE);
    const pcAuth = req.cookies.get("pc_auth")?.value;
    const pcValid = pcAuth === process.env.PRIVATE_COLLECTION_PASS;

    if (!hasSession && !pcValid) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/sign-in";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return null;
}
