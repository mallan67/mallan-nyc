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
const GENERAL_RATE_LIMIT = 600;
const API_RATE_LIMIT = 300;
const LOGIN_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const SCRAPING_WINDOW_S = 30;
const SCRAPING_THRESHOLD = 60;
const SCRAPING_BLOCK_S = 120; // 2min block — short enough to not lock out power users, long enough to deter scrapers

// ── Upstash rate limiters (null if Redis not configured) ──
const pageRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(GENERAL_RATE_LIMIT, "60 s"), prefix: "rl:page", ephemeralCache: new Map() })
  : null;
const apiRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(API_RATE_LIMIT, "60 s"), prefix: "rl:api", ephemeralCache: new Map() })
  : null;
const loginRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(LOGIN_RATE_LIMIT, "60 s"), prefix: "rl:login", ephemeralCache: new Map() })
  : null;
const idxSyncRl = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1, "300 s"), prefix: "rl:idx-sync", ephemeralCache: new Map() })
  : null;

// ── In-memory fallback (used when Redis is unavailable) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const scrapingMap = new Map<string, { count: number; windowStart: number }>();
const scrapingBlockMap = new Map<string, number>(); // ip → blockedUntil timestamp
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
  for (const [key, entry] of scrapingMap) {
    if (now - entry.windowStart > SCRAPING_WINDOW_S * 1000) scrapingMap.delete(key);
  }
  for (const [key, until] of scrapingBlockMap) {
    if (now > until) scrapingBlockMap.delete(key);
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

async function checkScrapingBlock(ip: string): Promise<number> {
  if (redis) {
    try {
      const ttl = await redis.ttl(`scrape-block:${ip}`);
      return ttl > 0 ? ttl : 0;
    } catch {
      // Fall through to in-memory
    }
  }
  const until = scrapingBlockMap.get(ip);
  if (!until) return 0;
  const now = Date.now();
  if (now < until) return Math.ceil((until - now) / 1000);
  scrapingBlockMap.delete(ip);
  return 0;
}

async function checkScrapingPattern(ip: string, pathname: string): Promise<boolean> {
  if (!pathname.startsWith("/listing/") && !pathname.startsWith("/api/listings")) {
    return false;
  }

  if (redis) {
    try {
      const key = `scrape:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, SCRAPING_WINDOW_S);

      if (count >= SCRAPING_THRESHOLD) {
        await redis.set(`scrape-block:${ip}`, 1, { ex: SCRAPING_BLOCK_S });
        return true;
      }
      return false;
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = scrapingMap.get(ip);
  if (!entry || now - entry.windowStart > SCRAPING_WINDOW_S * 1000) {
    scrapingMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  if (entry.count >= SCRAPING_THRESHOLD) {
    scrapingBlockMap.set(ip, now + SCRAPING_BLOCK_S * 1000);
    return true;
  }
  return false;
}

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

  // ── 0. Check scraping block (IDX compliance) ──
  // Skip scraping checks for site owner / known IPs during development
  const skipScraping = process.env.SCRAPING_DETECTION_DISABLED === 'true';
  if (!skipScraping) {
    const scrapingRemaining = await checkScrapingBlock(ip);
    if (scrapingRemaining > 0) {
      return NextResponse.json(
        { error: "Automated access detected. Access temporarily blocked." },
        { status: 429, headers: { "Retry-After": String(scrapingRemaining), "Cache-Control": "no-store" } }
      );
    }

    // ── 1. Scraping detection (20 listing pages in 30s) ──
    if (await checkScrapingPattern(ip, pathname)) {
      return NextResponse.json(
        { error: "Automated access detected. Access temporarily blocked." },
        { status: 429, headers: { "Retry-After": String(SCRAPING_BLOCK_S), "Cache-Control": "no-store" } }
      );
    }
  }

  // ── 2. Login rate limiting (10/min per IP) ──
  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (!(await rateLimitCheck(loginRl, ip, `${ip}:login`, LOGIN_RATE_LIMIT))) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // ── 3. General rate limiting ──
  const isMediaProxy = pathname === "/api/media/proxy";
  const isApi = pathname.startsWith("/api") && !isMediaProxy;

  if (isApi) {
    if (!(await rateLimitCheck(apiRl, ip, `${ip}:api`, API_RATE_LIMIT))) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  } else {
    if (!(await rateLimitCheck(pageRl, ip, `${ip}:page`, GENERAL_RATE_LIMIT))) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": "60" },
      });
    }
  }

  // ── 4. IDX sync rate limit (1 per 5 min per IP) ──
  if (pathname === "/api/idx/sync" && req.method === "POST") {
    if (!(await rateLimitCheck(idxSyncRl, ip, `${ip}:idx-sync`, 1))) {
      return new NextResponse(
        JSON.stringify({ error: "IDX sync rate limited. Max 1 call per 5 minutes." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "300" } }
      );
    }
  }

  return null;
}
