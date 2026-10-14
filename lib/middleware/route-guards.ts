import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "session_token";

const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

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

  // CRM page protection — require auth, redirect to CRM login
  // Whitelist: /crm/login* (login page itself), /crm/js/*, /crm/css/*
  if (
    pathname.startsWith("/crm") &&
    !pathname.startsWith("/crm/login") &&
    !pathname.startsWith("/crm/js/") &&
    !pathname.startsWith("/crm/css/") &&
    !pathname.startsWith("/crm/images/") &&
    !pathname.endsWith(".ico")
  ) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/crm/login.html";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
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

  // Admin route protection — fail closed. This is a presence check only; every admin page and
  // API route validates the session itself (validateSession). The legacy `pc_auth` /
  // PRIVATE_COLLECTION_PASS fallback was removed: with the variable unset, `undefined === undefined`
  // made the old guard pass for every visitor. /admin/login stays reachable (no redirect loop).
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return null;
}
