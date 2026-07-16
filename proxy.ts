// proxy.ts — Next.js 16 request interceptor (replaces middleware.ts)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkBot } from "@/lib/middleware/bot-blocker";
import { checkRateLimits } from "@/lib/middleware/rate-limiter";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRouteGuards } from "@/lib/middleware/route-guards";
import { applySecurityHeaders } from "@/lib/middleware/security-headers";
// Neon public-DB-wakeups P0: resolve public listing aliases at the edge from the durable
// Upstash index — NO Prisma/Neon (alias-index is Prisma-free and this file is edge runtime).
import { slugPartsFromPathname, deriveAliasLookup, lookupAlias } from "@/lib/listings/alias-index";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|images/|fonts/).*)",
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

  // ── 4.5. Public listing ALIAS → canonical 308 (edge, DB-free — Neon P0) ──
  // A bare-id / hybrid / address-only /listing alias resolves to its canonical path from the
  // durable Upstash alias index and is redirected here with a real 308 + CDN cache headers, so
  // repeat AND never-seen aliases avoid the function/Neon. Canonical + suppressed `listing-{id}`
  // paths fall through to the ISR page. NEVER touches Prisma (this file runs on the edge).
  if (pathname.startsWith("/listing/")) {
    const parts = slugPartsFromPathname(pathname);
    const derived = parts ? deriveAliasLookup(parts) : { kind: "canonical" as const };
    if (derived.kind === "alias") {
      const canonical = await lookupAlias(derived.redisKey);
      if (canonical === null) {
        // Authoritative miss → the listing does not exist → 404 without a DB call.
        const r = new NextResponse(null, { status: 404 });
        r.headers.set("x-alias-index", "miss-404");
        r.headers.set("x-neon-queried", "0");
        applySecurityHeaders(r, pathname, req.method);
        return r;
      }
      if (typeof canonical === "string") {
        const r = NextResponse.redirect(new URL(canonical, req.nextUrl.origin), 308);
        r.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
        r.headers.set("CDN-Cache-Control", "public, s-maxage=86400");
        r.headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=86400");
        r.headers.set("x-alias-index", "hit");
        r.headers.set("x-neon-queried", "0");
        return r;
      }
      // canonical === undefined → Redis down / non-authoritative miss → FALL OPEN to the page.
    }
  }

  // ── 5. Static-compatible security headers ──
  // No per-request CSP nonce: reading it in the root layout (headers()) forced
  // EVERY public page to render dynamically, disabling ISR/CDN caching and
  // keeping the Neon compute awake. The public shell now uses a STATIC CSP so it
  // is cacheable again. (Build-time Subresource Integrity was tested but removed
  // in PR #511 — it broke script loading under Next 16.2/Turbopack; there is no
  // SRI on scripts today. See lib/middleware/security-headers.ts.)
  const response = NextResponse.next();

  // CORS headers for allowed origins
  if (pathname.startsWith("/api") && isAllowedOrigin(origin)) {
    setCorsHeaders(response, origin!);
  }

  // Security headers (static CSP, HSTS, X-Frame-Options, etc.)
  applySecurityHeaders(response, pathname, req.method);

  return response;
}
