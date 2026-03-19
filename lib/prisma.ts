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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require("dotenv");
    dotenv.config({ path: envPath, override: true });
  }
} catch {
  // dotenv not available (e.g. edge runtime) — rely on platform env
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
