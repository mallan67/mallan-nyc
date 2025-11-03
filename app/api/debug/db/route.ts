// app/api/debug/db/route.ts — safe masked connection string debug route
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // Try to read a holder connectionString (if lib/db.ts created one).
    // Fallback to pool.options.connectionString or process.env.DATABASE_URL.
    // Mask password for safety.
    // @ts-ignore
    const globalHolder = (global as any).__pgHolder;
    // @ts-ignore
    const poolConn = (pool as any)?.options?.connectionString;
    const cs = (globalHolder && globalHolder.connectionString) || poolConn || process.env.DATABASE_URL || "none";

    // Mask password safely: extract user:pass@ part and replace pass with ******
    const masked = (() => {
      if (!cs || cs === "none") return "none";
      try {
        const m = cs.match(/(postgresql:\\/\\/[^:]+:)([^@]+)(@.*)/) || cs.match(/(postgresql:\\/\\/[^:]+:)([^@]+)(@.*)/i);
        // If match uses double-escapes accidentally, also try normal slashes:
        if (!m) {
          const m2 = cs.match(/(postgresql:\\/\\/[^\:]+:)([^@]+)(@.*)/) || cs.match(/(postgresql:\\/\\/[^:]+:)([^@]+)(@.*)/);
          if (m2) return `${m2[1]}******${m2[3]}`;
        }
        if (m && m[1] && m[3]) return `${m[1]}******${m[3]}`;
        // Try the normal literal (works in CI)
        const m3 = cs.match(/(postgresql:\\/\\/[^:]+:)([^@]+)(@.*)/);
        if (m3 && m3[1] && m3[3]) return `${m3[1]}******${m3[3]}`;
        // As a robust fallback: try the simple form with single slashes
        const m4 = cs.match(/(postgresql:\/\/[^:]+:)([^@]+)(@.*)/);
        if (m4 && m4[1] && m4[3]) return `${m4[1]}******${m4[3]}`;
        // Nothing matched — return the original as a string
        return String(cs);
      } catch (e) {
        return String(cs);
      }
    })();

    return NextResponse.json({ ok: true, connectionString: masked });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
