// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";

// Force-load .env.local so system-level env vars don't override the project DB URL.
// Next.js loads .env.local but does NOT override pre-existing system env vars.
// If a stale DATABASE_URL exists in the Windows/system environment, Prisma gets
// the wrong connection string. This block ensures .env.local always wins.
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const dotenv = require("dotenv");
    dotenv.config({ path: envPath, override: true });
  }
} catch {
  // dotenv not available (e.g. edge runtime) — rely on platform env
}

// Prisma reads the BARE connection vars (`DATABASE_URL` / `DATABASE_URL_UNPOOLED`) from
// the schema's datasource. These MUST be configured explicitly per environment. We do
// NOT map the Vercel–Neon integration's prefixed vars (`database_DATABASE_URL*`) onto the
// bare names: a global fallback like that would silently hand every Preview route the
// production database. If an environment (e.g. Preview) needs DB access, set its own bare
// DATABASE_URL explicitly.

// Prevent multiple PrismaClient instances in dev mode (hot reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

// ────────────────────────────────────────────────────────────────────────
// Quota-exhaustion helper — NEON.md §7A
//
// Neon free tier returns a specific Postgres error when the monthly compute
// budget is exceeded: "Your account or project has exceeded the compute
// time quota." Every DB path throws this uniformly.
//
// Routes wrap their prisma call with `isQuotaExhausted(err)`; when true,
// they return HTTP 503 with `Retry-After` instead of a raw 500. NOTE: the public
// listing detail page (app/listing/[...slug]/page.tsx) no longer falls back to a
// live Trestle direct-fetch on DB error — that live-feed fallback was removed in
// PR #511 (DB-only render). Infra/quota errors there PROPAGATE (they are not turned
// into a 404), so under ISR a valid cached listing is preserved rather than replaced.
// ────────────────────────────────────────────────────────────────────────

export function isQuotaExhausted(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = (err as { message?: string }).message ?? String(err);
  return /compute time quota|compute quota exceeded/i.test(msg);
}

/**
 * Seconds until the Neon free-tier monthly reset, capped at 24h so CDN
 * caches of a Retry-After header don't suppress retries for a full week.
 * Reset is calendar-monthly (1st of next month UTC).
 */
export function quotaResetRetryAfterSeconds(now: Date = new Date()): number {
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  const secs = Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
  return Math.min(secs, 86400);
}
