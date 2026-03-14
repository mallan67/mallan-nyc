import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import redis from "@/lib/redis";

/**
 * Edge-level rate limiter with progressive penalties.
 *
 * Primary: Upstash Redis (durable, shared across regions/cold starts)
 * Fallback: In-memory Maps (if Redis env vars are missing or Redis is down)
 *
 * 4 tiers: page (120/min), API (30/min), login (5/min), IDX sync (1/5min)
 * Progressive penalty: repeat offenders get escalating block durations
 * Scraping detection: 20 listing pages in 30s = auto-block
 */

// ── Constants ──
const GENERAL_RATE_LIMIT = 120;
const API_RATE_LIMIT = 30;
const LOGIN_RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

const PENALTY_DURATIONS_S = [60, 300, 900, 3600, 14400]; // 1m, 5m, 15m, 1h, 4h
const PENALTY_COOLDOWN_S = 600; // 10 min

const SCRAPING_WINDOW_S = 30;
const SCRAPING_THRESHOLD = 20;
const SCRAPING_BLOCK_S = 3600;

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

// ── In-memory fallback (same as original, used when Redis is unavailable) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const penaltyMap = new Map<string, { violations: number; lastViolation: number; blockedUntil: number }>();
const scrapingMap = new Map<string, { count: number; windowStart: number }>();
const MAX_ENTRIES = 10_000;
const MAX_PENALTY_ENTRIES = 5_000;
let lastCleanup = Date.now();

function cleanupAll() {
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

  for (const [key, entry] of penaltyMap) {
    if (now - entry.lastViolation > PENALTY_COOLDOWN_S * 1000 && now > entry.blockedUntil) {
      penaltyMap.delete(key);
    }
  }
  if (penaltyMap.size > MAX_PENALTY_ENTRIES) {
    const iter = penaltyMap.keys();
    for (let i = 0, n = penaltyMap.size - MAX_PENALTY_ENTRIES; i < n; i++) {
      const k = iter.next().value;
      if (k) penaltyMap.delete(k);
    }
  }

  for (const [key, entry] of scrapingMap) {
    if (now - entry.windowStart > SCRAPING_WINDOW_S * 1000) scrapingMap.delete(key);
  }
}

function memCheckRateLimit(key: string, limit: number): boolean {
  cleanupAll();
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

// ── Penalty system (Redis-backed when available, in-memory fallback) ──

async function recordViolation(ip: string): Promise<number> {
  if (redis) {
    try {
      const key = `penalty:${ip}`;
      const raw = await redis.get<{ violations: number; lastViolation: number }>(key);
      const now = Math.floor(Date.now() / 1000);

      let violations = 1;
      if (raw && now - raw.lastViolation < PENALTY_COOLDOWN_S) {
        violations = Math.min(raw.violations + 1, PENALTY_DURATIONS_S.length);
      }

      const blockDuration = PENALTY_DURATIONS_S[Math.min(violations - 1, PENALTY_DURATIONS_S.length - 1)];
      await redis.set(key, { violations, lastViolation: now }, { ex: blockDuration + PENALTY_COOLDOWN_S });
      await redis.set(`block:${ip}`, 1, { ex: blockDuration });
      return blockDuration;
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const existing = penaltyMap.get(ip);
  if (existing && now - existing.lastViolation < PENALTY_COOLDOWN_S * 1000) {
    existing.violations = Math.min(existing.violations + 1, PENALTY_DURATIONS_S.length);
    existing.lastViolation = now;
    const dur = PENALTY_DURATIONS_S[Math.min(existing.violations - 1, PENALTY_DURATIONS_S.length - 1)];
    existing.blockedUntil = now + dur * 1000;
    return dur;
  }

  if (penaltyMap.size >= MAX_PENALTY_ENTRIES) {
    const oldest = penaltyMap.keys().next().value;
    if (oldest !== undefined) penaltyMap.delete(oldest);
  }
  const dur = PENALTY_DURATIONS_S[0];
  penaltyMap.set(ip, { violations: 1, lastViolation: now, blockedUntil: now + dur * 1000 });
  return dur;
}

async function checkPenaltyBlock(ip: string): Promise<number> {
  if (redis) {
    try {
      const ttl = await redis.ttl(`block:${ip}`);
      return ttl > 0 ? ttl : 0;
    } catch {
      // Fall through to in-memory
    }
  }

  const entry = penaltyMap.get(ip);
  if (!entry) return 0;
  const now = Date.now();
  if (now < entry.blockedUntil) return Math.ceil((entry.blockedUntil - now) / 1000);
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
        await redis.set(`block:${ip}`, 1, { ex: SCRAPING_BLOCK_S });
        await redis.set(`penalty:${ip}`, {
          violations: PENALTY_DURATIONS_S.length,
          lastViolation: Math.floor(Date.now() / 1000),
        }, { ex: SCRAPING_BLOCK_S + PENALTY_COOLDOWN_S });
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
    penaltyMap.set(ip, {
      violations: PENALTY_DURATIONS_S.length,
      lastViolation: now,
      blockedUntil: now + SCRAPING_BLOCK_S * 1000,
    });
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
 * Async because Upstash calls are async (1-2ms from edge).
 */
export async function checkRateLimits(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 0. Check progressive penalty block ──
  const penaltyRemaining = await checkPenaltyBlock(ip);
  if (penaltyRemaining > 0) {
    return NextResponse.json(
      { error: "Too many requests. You have been temporarily blocked." },
      { status: 429, headers: { "Retry-After": String(penaltyRemaining) } }
    );
  }

  // ── 1. Scraping detection (listing pages) ──
  if (await checkScrapingPattern(ip, pathname)) {
    return NextResponse.json(
      { error: "Automated access detected. Access temporarily blocked." },
      { status: 429, headers: { "Retry-After": String(SCRAPING_BLOCK_S) } }
    );
  }

  // ── 2. Login rate limiting (strict: 5/min per IP) ──
  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (!(await rateLimitCheck(loginRl, ip, `${ip}:login`, LOGIN_RATE_LIMIT))) {
      const retryAfter = await recordViolation(ip);
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  // ── 3. General rate limiting ──
  const isMediaProxy = pathname === "/api/media/proxy";
  const isApi = pathname.startsWith("/api") && !isMediaProxy;

  if (isApi) {
    if (!(await rateLimitCheck(apiRl, ip, `${ip}:api`, API_RATE_LIMIT))) {
      const retryAfter = await recordViolation(ip);
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      });
    }
  } else {
    if (!(await rateLimitCheck(pageRl, ip, `${ip}:page`, GENERAL_RATE_LIMIT))) {
      const retryAfter = await recordViolation(ip);
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
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
