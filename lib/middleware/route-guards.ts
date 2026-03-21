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
    false // no CRM page exceptions — all require auth
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
