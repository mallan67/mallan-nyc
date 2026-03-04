import { NextResponse } from "next/server";

// Default ON (read-only) — must explicitly set READONLY_MODE=false to enable writes.
// This ensures production cannot accidentally allow mutations.
const READONLY_MODE = process.env.READONLY_MODE !== "false";

/**
 * Blocks mutation requests when READONLY_MODE is enabled.
 * Returns null if request is allowed, NextResponse if blocked.
 * Call at the top of every POST/PATCH/PUT/DELETE route handler (except auth).
 */
export function assertWriteAllowed(): NextResponse | null {
  if (!READONLY_MODE) return null;
  return NextResponse.json(
    { error: "System is in read-only mode. Mutations are disabled." },
    { status: 403 }
  );
}
