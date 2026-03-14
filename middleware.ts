// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Middleware runs on ALL matched routes at the edge.
 * Handles: CORS, bot blocking, rate limiting, admin auth, CRM/portal auth, security headers.
 */
export const config = {
  matcher: [
    /*
     * Match all routes EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (crawler essentials)
     * - Public assets (images, fonts)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|images/|fonts/).*)",
  ],
};

/**
 * Allowed CORS origins for cross-origin API access.
 * Production: GitHub Pages only. Dev: + localhost origins.
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

/**
 * Known scraper/AI-crawler bots that consume function invocations
 * without generating real traffic. Google/Bing/social bots are
 * intentionally excluded — we want those for SEO.
 */
const BLOCKED_BOTS =
  /AhrefsBot|SemrushBot|DotBot|MJ12bot|GPTBot|CCBot|ClaudeBot|ChatGPT-User|Bytespider|PetalBot|Sogou|YandexBot|BLEXBot|DataForSeoBot|serpstatbot|Amazonbot|anthropic-ai|FacebookBot|Applebot-Extended|PerplexityBot|YouBot|Diffbot|Webzio|img2dataset|omgili|CriteoBot|MegaIndex|Zoominfobot/i;

/**
 * Edge-level rate limiter using a sliding window with LRU eviction.
 * Runs per-edge-region so limits are approximate but effective.
 * 120 requests per minute per IP for general pages.
 * 30 requests per minute per IP for API routes.
 *
 * MAX_ENTRIES cap prevents unbounded memory growth under DDoS.
 * When full, oldest entries are evicted (LRU via insertion order).
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const GENERAL_RATE_LIMIT = 120;
const API_RATE_LIMIT = 30;
const LOGIN_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const MAX_ENTRIES = 10_000;

let lastCleanup = Date.now();
function cleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // cleanup every minute
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  // LRU eviction if still over capacity
  if (rateLimitMap.size > MAX_ENTRIES) {
    const toDelete = rateLimitMap.size - MAX_ENTRIES;
    const iter = rateLimitMap.keys();
    for (let i = 0; i < toDelete; i++) {
      const k = iter.next().value;
      if (k) rateLimitMap.delete(k);
    }
  }
}

function checkRateLimit(key: string, limit: number): boolean {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    // Evict oldest if at capacity
    if (rateLimitMap.size >= MAX_ENTRIES) {
      const oldest = rateLimitMap.keys().next().value;
      if (oldest) rateLimitMap.delete(oldest);
    }
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/**
 * SESSION_COOKIE name — must match lib/auth/middleware.ts
 * Note: Edge middleware cannot import from lib/auth (Node.js runtime only),
 * so we duplicate the constant here. Session validation happens in the
 * API route handlers via requireAuth()/requireRole().
 */
const SESSION_COOKIE = "session_token";

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") ?? "";
  const origin = req.headers.get("origin");
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 0. CORS preflight (OPTIONS) ──
  if (req.method === "OPTIONS" && pathname.startsWith("/api") && isAllowedOrigin(origin)) {
    const preflightResponse = new NextResponse(null, { status: 204 });
    return setCorsHeaders(preflightResponse, origin!);
  }

  // ── 1. Block empty user agents (likely bots/scrapers) ──
  // Allow health checks and internal Vercel requests through
  if (!ua && !pathname.startsWith("/api/cron")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── 2. Block known bad bots on ALL routes ──
  if (BLOCKED_BOTS.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── 3a. Login rate limiting (strict: 5/min per IP) ──
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const loginKey = `${ip}:login`;
    if (!checkRateLimit(loginKey, LOGIN_RATE_LIMIT)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in 1 minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // ── 3b. General rate limiting ──
  // Exempt media proxy from API rate limit (50+ images per page load is normal)
  const isMediaProxy = pathname === "/api/media/proxy";
  const isApi = pathname.startsWith("/api") && !isMediaProxy;
  const limit = isApi ? API_RATE_LIMIT : GENERAL_RATE_LIMIT;
  const rateLimitKey = `${ip}:${isApi ? "api" : "page"}`;

  if (!checkRateLimit(rateLimitKey, limit)) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // ── 4. IDX sync rate limit (1 per 5 min per IP) ──
  if (pathname === "/api/idx/sync" && req.method === "POST") {
    const syncKey = `${ip}:idx-sync`;
    const now = Date.now();
    const syncEntry = rateLimitMap.get(syncKey);
    const SYNC_WINDOW_MS = 300_000; // 5 minutes
    if (syncEntry && now <= syncEntry.resetAt && syncEntry.count >= 1) {
      return new NextResponse(
        JSON.stringify({ error: "IDX sync rate limited. Max 1 call per 5 minutes." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "300" },
        }
      );
    }
    rateLimitMap.set(syncKey, { count: 1, resetAt: now + SYNC_WINDOW_MS });
  }

  // ── 4b. CSRF protection for state-changing requests ──
  // Verify Origin/Referer header on POST/PUT/PATCH/DELETE to prevent cross-site forgery.
  // Exempt: cron jobs (no origin), preflight (OPTIONS already handled above).
  if (
    isApi &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    !pathname.startsWith("/api/cron")
  ) {
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
        // Malformed origin/referer — block it
        return NextResponse.json(
          { error: "Forbidden: invalid origin" },
          { status: 403 }
        );
      }
    }
    // Note: requests with no Origin/Referer are allowed (same-origin form submissions,
    // server-to-server calls). The auth layer (requireAuth) is the primary protection.
  }

  // ── 4c. Block development/debug pages in production ──
  if (isProd && (pathname.startsWith("/style-preview") || pathname.startsWith("/demo"))) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // ── 4d. Block CRM development files from public access ──
  // html/ partials, tests/, scripts/, build.js, index.html are source files — not for browsers
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

  // ── 4c. CRM page protection ──
  // All /crm/* HTML pages require auth. Unauthenticated visitors get redirected to /sign-in.
  // Excludes: /crm/js/* and /crm/css/* (static assets).
  if (
    pathname.startsWith("/crm") &&
    !pathname.startsWith("/crm/js/") &&
    !pathname.startsWith("/crm/css/")
  ) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/sign-in";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 5. CRM API route protection ──
  // /api/crm/* requires a session_token cookie (validated in route handler).
  // Edge middleware does a fast presence check; full DB validation
  // happens in requireAuth()/requireRole() inside each route handler.
  if (pathname.startsWith("/api/crm")) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  // ── 6. Portal route protection ──
  // /api/portal/* requires a session_token cookie.
  if (pathname.startsWith("/api/portal")) {
    if (!req.cookies.has(SESSION_COOKIE)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  // ── 7. Admin route protection ──
  // Compatibility window: accept either session_token OR pc_auth cookie.
  // Once all admin flows use session_token, remove pc_auth check.
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

  // ── 8. Security headers on response ──
  const response = NextResponse.next();

  // CORS headers for allowed origins
  if (pathname.startsWith("/api") && isAllowedOrigin(origin)) {
    setCorsHeaders(response, origin!);
  }

  // ── Security headers (all responses) ──
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // Private pages: prevent indexing + prevent caching
  const isPrivatePage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/crm") ||
    pathname === "/login" ||
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname.startsWith("/leads");
  const isPrivateApi =
    pathname.startsWith("/api/crm") ||
    pathname.startsWith("/api/portal");

  if (isPrivatePage || isPrivateApi) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // Prevent CDN/browser caching of CRM/admin pages AND private API responses (PII)
  if (isPrivatePage || isPrivateApi) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
  }

  return response;
}
