import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // Try to pick up a connection string from global holder (lib/db) or pool.options or env
    // @ts-ignore
    const globalHolder = (global as any).__pgHolder;
    // @ts-ignore
    const poolConn = (pool as any)?.options?.connectionString;
    let cs = (globalHolder && globalHolder.connectionString) || poolConn || process.env.DATABASE_URL || "none";

    // Trim surrounding quotes if present
    if (typeof cs === "string") {
      cs = cs.trim();
      if ((cs.startsWith("'") && cs.endsWith("'")) || (cs.startsWith('"') && cs.endsWith('"'))) {
        cs = cs.slice(1, -1);
      }
    }

    let masked = "none";

    if (cs && cs !== "none") {
      try {
        // Use URL parser to safely hide password
        const u = new URL(cs);
        if (u.password) {
          u.password = "******";
          // URL.toString() may include trailing '/' — that's fine for debug display
          masked = u.toString();
        } else {
          masked = cs;
        }
      } catch (err) {
        // Fallback: simple regex mask (best-effort)
        try {
          masked = String(cs).replace(/(postgresql:\/\/[^:]+:)([^@]+)(@.*)/, '$1******$3');
        } catch (e) {
          masked = String(cs);
        }
      }
    }

    return NextResponse.json({ ok: true, connectionString: masked });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
