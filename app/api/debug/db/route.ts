import { NextResponse } from "next/server";

/**
 * Minimal debug route — must be extremely fast and non-blocking.
 * Returns whether a DB env is present and a masked connection string.
 */
export async function GET() {
  const dbUrl = process.env.ASSISTANT_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  const masked = dbUrl ? dbUrl.replace(/:(?:[^:@]+)@/, ":****@") : null;
  return NextResponse.json({ ok: !!dbUrl, connectionString: masked });
}
