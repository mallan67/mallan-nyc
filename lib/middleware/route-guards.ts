import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "session_token";

const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

/**
 * Ask the canonical session endpoint whether the request's cookie is a live
 * session. Reuses validateSession() via /api/auth/me so the proxy holds no
 * second copy of session rules. Fails closed on any error or timeout.
 */
async function hasLiveSession(req: NextRequest): Promise<boolean> {
  try {
    const res = await fetch(new URL("/api/auth/me", req.nextUrl.origin), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
  } catch {
    return false;
  }
}

/**
 * Route-level access guards: block dev pages in prod, protect CRM/portal/admin paths.
 * Returns a redirect or 401/404 response if blocked, null otherwise.
 */
export async function checkRouteGuards(req: NextRequest, pathname: string): Promise<NextResponse | null> {
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
    // The cookie must be a live session, not merely present: a forged or
    // expired value is sent to login and its cookie is cleared.
    if (!req.cookies.has(SESSION_COOKIE) || !(await hasLiveSession(req))) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/crm/login.html";
      loginUrl.searchParams.set("redirect", pathname);
      const redirect = NextResponse.redirect(loginUrl);
      if (req.cookies.has(SESSION_COOKIE)) redirect.cookies.delete(SESSION_COOKIE);
      return redirect;
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
