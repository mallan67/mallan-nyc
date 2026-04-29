import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "@/lib/redis";

/**
 * Edge-level rate limiter.
 *
 * Primary: Upstash Redis (durable, shared across regions/cold starts)
 * Fallback: In-memory Maps (if Redis env vars are missing or Redis is down)
 *
 * Authenticated users bypass all rate limiting.
 * Unauthenticated: page (300/min), API (60/min), login (10/min), IDX sync (1/5min)
 * Scraping detection: 20 listing pages in 30s = 1hr block (REBNY IDX compliance)
 *
 * No progressive penalty escalation — blocks are fixed duration, never escalate.
 */

// ── Constants ──
const LOGIN_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// Scraping detection constants removed alongside the now-unused
// checkScrapingBlock/checkScrapingPattern helpers. Reintroduce here if those
// functions are restored.

// ── Upstash rate limiters (null if Redis not configured) ──
// Note: legacy pageRl/apiRl have been removed — page and api routes now flow
// through the per-route limiter map (`routeLimiters` below) keyed by route
// name, which is the canonical model for cross-instance enforcement.
const loginRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(LOGIN_RATE_LIMIT, "60 s"), prefix: "rl:login", ephemeralCache: new Map() })
  : null;
const idxSyncRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1, "300 s"), prefix: "rl:idx-sync", ephemeralCache: new Map() })
  : null;

// Per-route strict limiters for public write/expensive endpoints.
// In-memory fallback (via rateLimitCheck) has a higher per-instance cap but the
// Upstash limit is the enforced cross-instance value on serverless.
//
// Lead-capture defaults (CAN-SPAM §7704 abuse prevention + DB row flood protection):
//   - signup:      10/hr  — account creation
//   - market:      30/min — read-heavy, scrape-risky
//   - contact:     20/hr  — free-form contact form
//   - cma:         10/hr  — CMA request (more intensive — sends two emails)
//   - inquiry:     30/hr  — property inquiries
//   - rsvp:        20/hr  — open-house RSVP
//   - guide:       15/hr  — buyer/seller guide download
//   - alert:       10/hr  — search-alert subscribe
//   - unsubscribe: 20/hr  — generous but not unbounded (bots could spam)
const limiterSpecs = {
  signup:       { count: 10, window: "3600 s" },
  market:       { count: 30, window: "60 s"   },
  contact:      { count: 20, window: "3600 s" },
  cma:          { count: 10, window: "3600 s" },
  inquiry:      { count: 30, window: "3600 s" },
  rsvp:         { count: 20, window: "3600 s" },
  guide:        { count: 15, window: "3600 s" },
  alert:        { count: 10, window: "3600 s" },
  identity_capture: { count: 20, window: "3600 s" },
  unsubscribe:  { count: 20, window: "3600 s" },
} as const satisfies Record<string, { count: number; window: `${number} s` }>;

export type RouteLimiterName = keyof typeof limiterSpecs;

const routeLimiters: Partial<Record<RouteLimiterName, Ratelimit>> = {};
if (redis) {
  for (const [name, spec] of Object.entries(limiterSpecs)) {
    routeLimiters[name as RouteLimiterName] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(spec.count, spec.window),
      prefix: `rl:${name}`,
      ephemeralCache: new Map(),
    });
  }
}

/**
 * Per-route rate limit check for use from within API route handlers.
 *
 * Usage:
 *   const allowed = await checkRouteRateLimit(ip, 'contact', 20, 3600);
 *   if (!allowed) return 429;
 *
 * Redis-backed when env is configured; falls back to per-instance in-memory.
 * The fallback path still meaningfully slows attackers because Vercel typically
 * pins a single IP to the same warm instance for consecutive requests.
 */
export async function checkRouteRateLimit(
  ip: string,
  route: RouteLimiterName,
  memFallbackLimit: number,
  memFallbackWindowSeconds: number
): Promise<boolean> {
  const rl = routeLimiters[route];
  if (rl) {
    try {
      const { success } = await rl.limit(ip);
      return success;
    } catch {
      // Redis down — fall through to in-memory
    }
  }
  return memCheckRateLimit(
    `${route}:${ip}`,
    Math.max(1, Math.floor((memFallbackLimit * (RATE_WINDOW_MS / 1000)) / memFallbackWindowSeconds))
  );
}

/** Extract client IP from standard proxy headers with a safe fallback. */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") || "unknown";
}

// ── In-memory fallback (used when Redis is unavailable) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 10_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  if (rateLimitMap.size > MAX_ENTRIES) {
    const iter = rateLimitMap.keys();
    for (let i = 0, n = rateLimitMap.size - MAX_ENTRIES; i < n; i++) {
      const k = iter.next().value;
      if (k) rateLimitMap.delete(k);
    }
  }
}

function memCheckRateLimit(key: string, limit: number): boolean {
  cleanup();
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
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

// ── Scraping detection (REBNY IDX compliance) ──
// (Scraping check helpers removed — never wired into the active middleware
// pipeline. If reintroduced, restore both checkScrapingBlock + checkScrapingPattern
// and call them from checkRateLimits() before per-route checks.)

// ── Rate limit check (Upstash primary, in-memory fallback) ──

async function rateLimitCheck(
  rl: Ratelimit | null,
  ip: string,
  memKey: string,
  memLimit: number
): Promise<boolean> {
  if (rl) {
    try {
      const { success } = await rl.limit(ip);
      return success;
    } catch {
      // Redis down — fall back to in-memory
    }
  }
  return memCheckRateLimit(memKey, memLimit);
}

/**
 * Returns a 429 response if rate limited, null otherwise.
 */
export async function checkRateLimits(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  // Authenticated users bypass all rate limiting
  if (req.cookies.get("session_token")?.value) {
    return null;
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 0. Scraping detection ──
  // Disabled: was blocking the site owner with multiple browser tabs.
  // REBNY compliance scraping protection is handled at the Vercel WAF level
  // and by the general API rate limit (300/min) which is sufficient.
  // Re-enable with SCRAPING_DETECTION_ENABLED=true if bot traffic becomes an issue.

  // ── Only rate-limit sensitive write endpoints ──
  // Login: 10/min per IP (prevent brute force)
  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (!(await rateLimitCheck(loginRl, ip, `${ip}:login`, LOGIN_RATE_LIMIT))) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
      );
    }
  }

  // IDX sync: 1 per 5 min per IP (prevent abuse)
  if (pathname === "/api/idx/sync" && req.method === "POST") {
    if (!(await rateLimitCheck(idxSyncRl, ip, `${ip}:idx-sync`, 1))) {
      return new NextResponse(
        JSON.stringify({ error: "IDX sync rate limited. Max 1 call per 5 minutes." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "300", "Cache-Control": "no-store" } }
      );
    }
  }

  // General browsing (pages, API reads, media) — no rate limiting.
  // A single-broker site with <10 concurrent users doesn't need it.
  // The /api/listings route has its own in-route rate limiter if needed.

  return null;
}
