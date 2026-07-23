// proxy.ts — Next.js 16 request interceptor (replaces middleware.ts)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkBot } from "@/lib/middleware/bot-blocker";
import { checkRateLimits } from "@/lib/middleware/rate-limiter";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRouteGuards } from "@/lib/middleware/route-guards";
import { applySecurityHeaders } from "@/lib/middleware/security-headers";
import {
  SESSION_COOKIE,
  AUTH_PRESENCE_COOKIE,
  getPresenceCookieConfig,
} from "@/lib/auth/cookie-config";

export const config = {
  matcher: [
    // sitemap/ covers the partitioned /sitemap/{id}.xml files (2026-07-23) —
    // same crawler-infrastructure exemption the classic /sitemap.xml has.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|sitemap/|images/|fonts/).*)",
  ],
};

/**
 * Cross-origin API access allowlist.
 * Production: empty — all API consumers (frontend, CRM) are same-origin on mallan.nyc.
 * Development: localhost origins for local dev server and Live Server (VS Code).
 */
const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const ALLOWED_ORIGINS: string[] = [
  ...(isProd ? [] : [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ]),
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function setCorsHeaders(response: NextResponse, origin: string): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // ── 0. CORS preflight ──
  if (req.method === "OPTIONS" && pathname.startsWith("/api") && isAllowedOrigin(origin)) {
    const preflightResponse = new NextResponse(null, { status: 204 });
    return setCorsHeaders(preflightResponse, origin!);
  }

  // ── 1. Bot blocking ──
  const botBlock = checkBot(req, pathname);
  if (botBlock) return botBlock;

  // ── 2. Rate limiting (async — Upstash Redis with in-memory fallback) ──
  const rateBlock = await checkRateLimits(req, pathname);
  if (rateBlock) return rateBlock;

  // ── 3. CSRF protection ──
  const csrfBlock = checkCsrf(req, pathname, origin, isAllowedOrigin);
  if (csrfBlock) return csrfBlock;

  // ── 4. Route guards (auth, dev pages, CRM source files) ──
  const guardBlock = checkRouteGuards(req, pathname);
  if (guardBlock) return guardBlock;

  // ── 5. Static-compatible security headers ──
  // No per-request CSP nonce: reading it in the root layout (headers()) forced
  // EVERY public page to render dynamically, disabling ISR/CDN caching and
  // keeping the Neon compute awake. The public shell now uses a STATIC CSP so it
  // is cacheable again. (Build-time Subresource Integrity was tested but removed
  // in PR #511 — it broke script loading under Next 16.2/Turbopack; there is no
  // SRI on scripts today. See lib/middleware/security-headers.ts.)
  const response = NextResponse.next();

  // ── 5a. Legacy-session presence-marker mirror (Neon-quiet 2026-07-23) ──
  // Sessions created BEFORE the presence marker shipped (or by any path that
  // somehow missed it) have a session cookie but no marker, which would make
  // the public shell render them as signed out. Mirror COOKIE PRESENCE only:
  // if the session cookie exists and the marker doesn't, set the marker.
  // NO validation, NO Neon read — the marker stays presentation-only (an
  // invalid session still 401s at /api/auth/me, which clears both cookies).
  if (req.cookies.has(SESSION_COOKIE) && !req.cookies.has(AUTH_PRESENCE_COOKIE)) {
    response.cookies.set(AUTH_PRESENCE_COOKIE, "1", getPresenceCookieConfig("", ""));
  }

  // CORS headers for allowed origins
  if (pathname.startsWith("/api") && isAllowedOrigin(origin)) {
    setCorsHeaders(response, origin!);
  }

  // Security headers (static CSP, HSTS, X-Frame-Options, etc.)
  applySecurityHeaders(response, pathname, req.method);

  return response;
}
