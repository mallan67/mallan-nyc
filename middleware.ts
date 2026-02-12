// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Middleware runs on ALL matched routes at the edge.
 * Handles: bot blocking, rate limiting, admin auth, security headers.
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
 * Known scraper/AI-crawler bots that consume function invocations
 * without generating real traffic. Google/Bing/social bots are
 * intentionally excluded — we want those for SEO.
 */
const BLOCKED_BOTS =
  /AhrefsBot|SemrushBot|DotBot|MJ12bot|GPTBot|CCBot|ClaudeBot|ChatGPT-User|Bytespider|PetalBot|Sogou|YandexBot|BLEXBot|DataForSeoBot|serpstatbot|Amazonbot|anthropic-ai|FacebookBot|Applebot-Extended|PerplexityBot|YouBot|Diffbot|Webzio|img2dataset|omgili|CriteoBot|MegaIndex|Zoominfobot/i;

/**
 * Edge-level rate limiter using a simple sliding window.
 * This runs per-edge-region so limits are approximate but effective.
 * 120 requests per minute per IP for general pages.
 * 30 requests per minute per IP for API routes.
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const GENERAL_RATE_LIMIT = 120;
const API_RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

// Periodic cleanup to prevent memory leak (every 5 minutes)
let lastCleanup = Date.now();
function cleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

function checkRateLimit(key: string, limit: number): boolean {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") ?? "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 1. Block empty user agents (likely bots/scrapers) ──
  // Allow health checks and internal Vercel requests through
  if (!ua && !pathname.startsWith("/api/cron")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── 2. Block known bad bots on ALL routes ──
  if (BLOCKED_BOTS.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // ── 3. Rate limiting ──
  const isApi = pathname.startsWith("/api");
  const limit = isApi ? API_RATE_LIMIT : GENERAL_RATE_LIMIT;
  const rateLimitKey = `${ip}:${isApi ? "api" : "page"}`;

  if (!checkRateLimit(rateLimitKey, limit)) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // ── 4. Admin route protection ──
  if (pathname.startsWith("/admin")) {
    const auth = req.cookies.get("pc_auth")?.value;
    if (auth !== process.env.PRIVATE_COLLECTION_PASS) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/sign-in";
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 5. Security headers on response ──
  const response = NextResponse.next();

  // Prevent admin pages from being indexed
  if (pathname.startsWith("/admin") || pathname.startsWith("/leads")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}
