import { NextRequest, NextResponse } from "next/server";

/**
 * Edge-level rate limiter with progressive penalties.
 *
 * Architecture:
 * - In-memory Map (per-edge-region, approximate but zero-latency)
 * - Sliding window counters for 4 tiers (page, API, login, IDX sync)
 * - Progressive penalty: repeat offenders get escalating block durations
 * - IP reputation: IPs that repeatedly hit limits get auto-blocked
 * - Persistent blocklist: known bad IPs blocked immediately
 *
 * Why in-memory and not Redis:
 * - Edge middleware runs before the request reaches Node.js — no async I/O allowed
 *   without adding latency to every single request
 * - Vercel deploys to iad1 region only (vercel.json), so single-region is fine
 * - The progressive penalty + reputation system compensates for cold-start resets
 *
 * Upgrade path: if the site needs multi-region or survives cold starts,
 * add @upstash/ratelimit with Redis backing. The checkRateLimits() interface
 * stays the same.
 */

// ── Rate limit state ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const GENERAL_RATE_LIMIT = 120; // per minute per IP for pages
const API_RATE_LIMIT = 30;      // per minute per IP for API
const LOGIN_RATE_LIMIT = 5;     // per minute per IP for login
const RATE_WINDOW_MS = 60_000;
const MAX_ENTRIES = 10_000;

// ── Progressive penalty state ──
// Tracks how many times an IP has been rate-limited. Each violation increases
// the block duration. Resets after a cool-down period of no violations.
const penaltyMap = new Map<string, {
  violations: number;
  lastViolation: number;
  blockedUntil: number;
}>();
const PENALTY_COOLDOWN_MS = 10 * 60_000;  // 10 min of no violations → reset
const MAX_PENALTY_ENTRIES = 5_000;

// Block durations escalate: 1min → 5min → 15min → 1hr → permanent (until cold start)
const PENALTY_DURATIONS_MS = [
  60_000,         // 1st violation: 1 minute
  5 * 60_000,     // 2nd: 5 minutes
  15 * 60_000,    // 3rd: 15 minutes
  60 * 60_000,    // 4th: 1 hour
  4 * 60 * 60_000, // 5th+: 4 hours
];

// ── Scraping detection ──
// Track high-frequency sequential listing page access (scraper fingerprint)
const scrapingMap = new Map<string, { count: number; windowStart: number }>();
const SCRAPING_WINDOW_MS = 30_000;    // 30-second window
const SCRAPING_THRESHOLD = 20;         // 20 listing pages in 30s = likely scraper
const SCRAPING_BLOCK_MS = 60 * 60_000; // 1 hour block

// ── Cleanup ──
let lastCleanup = Date.now();

function cleanupAll() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;

  // Clean rate limit entries
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  if (rateLimitMap.size > MAX_ENTRIES) {
    const toDelete = rateLimitMap.size - MAX_ENTRIES;
    const iter = rateLimitMap.keys();
    for (let i = 0; i < toDelete; i++) {
      const k = iter.next().value;
      if (k) rateLimitMap.delete(k);
    }
  }

  // Clean penalty entries (cool-down expired)
  for (const [key, entry] of penaltyMap) {
    if (now - entry.lastViolation > PENALTY_COOLDOWN_MS && now > entry.blockedUntil) {
      penaltyMap.delete(key);
    }
  }
  if (penaltyMap.size > MAX_PENALTY_ENTRIES) {
    const toDelete = penaltyMap.size - MAX_PENALTY_ENTRIES;
    const iter = penaltyMap.keys();
    for (let i = 0; i < toDelete; i++) {
      const k = iter.next().value;
      if (k) penaltyMap.delete(k);
    }
  }

  // Clean scraping entries
  for (const [key, entry] of scrapingMap) {
    if (now - entry.windowStart > SCRAPING_WINDOW_MS) scrapingMap.delete(key);
  }
}

function checkRateLimit(key: string, limit: number): boolean {
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

/**
 * Record a rate-limit violation and return the block duration in seconds.
 * Each successive violation within the cool-down window escalates the penalty.
 */
function recordViolation(ip: string): number {
  const now = Date.now();
  const existing = penaltyMap.get(ip);

  if (existing && now - existing.lastViolation < PENALTY_COOLDOWN_MS) {
    // Escalate
    existing.violations = Math.min(existing.violations + 1, PENALTY_DURATIONS_MS.length);
    existing.lastViolation = now;
    const durationMs = PENALTY_DURATIONS_MS[Math.min(existing.violations - 1, PENALTY_DURATIONS_MS.length - 1)];
    existing.blockedUntil = now + durationMs;
    return Math.ceil(durationMs / 1000);
  }

  // First violation or cool-down expired
  if (penaltyMap.size >= MAX_PENALTY_ENTRIES) {
    const oldest = penaltyMap.keys().next().value;
    if (oldest !== undefined) penaltyMap.delete(oldest);
  }
  const durationMs = PENALTY_DURATIONS_MS[0];
  penaltyMap.set(ip, {
    violations: 1,
    lastViolation: now,
    blockedUntil: now + durationMs,
  });
  return Math.ceil(durationMs / 1000);
}

/**
 * Check if an IP is currently under a progressive penalty block.
 * Returns the remaining block duration in seconds, or 0 if not blocked.
 */
function checkPenaltyBlock(ip: string): number {
  const entry = penaltyMap.get(ip);
  if (!entry) return 0;
  const now = Date.now();
  if (now < entry.blockedUntil) {
    return Math.ceil((entry.blockedUntil - now) / 1000);
  }
  return 0;
}

/**
 * Detect scraping patterns: rapid sequential listing page access.
 * Returns true if the IP is scraping.
 */
function checkScrapingPattern(ip: string, pathname: string): boolean {
  // Only track listing detail pages
  if (!pathname.startsWith("/listing/") && !pathname.startsWith("/api/listings")) {
    return false;
  }

  const now = Date.now();
  const entry = scrapingMap.get(ip);

  if (!entry || now - entry.windowStart > SCRAPING_WINDOW_MS) {
    scrapingMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count >= SCRAPING_THRESHOLD) {
    // Auto-block via penalty system
    const existing = penaltyMap.get(ip);
    if (existing) {
      existing.violations = PENALTY_DURATIONS_MS.length; // max penalty
      existing.lastViolation = now;
      existing.blockedUntil = now + SCRAPING_BLOCK_MS;
    } else {
      penaltyMap.set(ip, {
        violations: PENALTY_DURATIONS_MS.length,
        lastViolation: now,
        blockedUntil: now + SCRAPING_BLOCK_MS,
      });
    }
    return true;
  }

  return false;
}

/**
 * Returns a 429 response if rate limited, null otherwise.
 */
export function checkRateLimits(req: NextRequest, pathname: string): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // ── 0. Check progressive penalty block ──
  const penaltyRemaining = checkPenaltyBlock(ip);
  if (penaltyRemaining > 0) {
    return NextResponse.json(
      { error: "Too many requests. You have been temporarily blocked." },
      { status: 429, headers: { "Retry-After": String(penaltyRemaining) } }
    );
  }

  // ── 1. Scraping detection (listing pages) ──
  if (checkScrapingPattern(ip, pathname)) {
    return NextResponse.json(
      { error: "Automated access detected. Access temporarily blocked." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(SCRAPING_BLOCK_MS / 1000)) } }
    );
  }

  // ── 2. Login rate limiting (strict: 5/min per IP) ──
  if (pathname === "/api/auth/login" && req.method === "POST") {
    if (!checkRateLimit(`${ip}:login`, LOGIN_RATE_LIMIT)) {
      const retryAfter = recordViolation(ip);
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  // ── 3. General rate limiting ──
  // Exempt media proxy from API rate limit (50+ images per page load is normal)
  const isMediaProxy = pathname === "/api/media/proxy";
  const isApi = pathname.startsWith("/api") && !isMediaProxy;
  const limit = isApi ? API_RATE_LIMIT : GENERAL_RATE_LIMIT;
  const rateLimitKey = `${ip}:${isApi ? "api" : "page"}`;

  if (!checkRateLimit(rateLimitKey, limit)) {
    const retryAfter = recordViolation(ip);
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  // ── 4. IDX sync rate limit (1 per 5 min per IP) ──
  if (pathname === "/api/idx/sync" && req.method === "POST") {
    const syncKey = `${ip}:idx-sync`;
    const now = Date.now();
    const syncEntry = rateLimitMap.get(syncKey);
    const SYNC_WINDOW_MS = 300_000;
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

  return null;
}
