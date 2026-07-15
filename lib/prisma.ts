// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";
import { resolvePrismaEnv } from "./prisma-env";

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

// Integration-variable compatibility (PR #511): Prisma's schema reads the BARE names
// `DATABASE_URL` / `DATABASE_URL_UNPOOLED`. On environments where only the Vercel–Neon
// integration's PREFIXED names (`database_DATABASE_URL*`) are present (e.g. Preview),
// map them onto the bare names Prisma expects. resolvePrismaEnv prefers the bare names,
// so PRODUCTION is unchanged (bare wins → these assignments are no-ops there), and it
// throws fail-closed when neither is set. No connection-string value is logged here.
{
  const resolved = resolvePrismaEnv();
  process.env.DATABASE_URL = resolved.url;
  if (resolved.directUrl) process.env.DATABASE_URL_UNPOOLED = resolved.directUrl;
}

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
// they return HTTP 503 with `Retry-After` instead of a raw 500. Public IDX
// pages additionally fall through to their existing Trestle direct-fetch
// path (in app/listing/[id]/page.tsx and the search API) so the public
// site stays partially live even while the CRM is down.
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
