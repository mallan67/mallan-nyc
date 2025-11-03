// app/api/debug/db/route.ts — safe masked connection string debug route using URL parsing
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // Try holder created by lib/db.ts, otherwise pool.options or env
    // @ts-ignore
    const globalHolder = (global as any).__pgHolder;
    // @ts-ignore
    const poolConn = (pool as any)?.options?.connectionString;
    const cs = (globalHolder && globalHolder.connectionString) || poolConn || process.env.DATABASE_URL || "none";

    if (!cs || cs === "none") {
      return NextResponse.json({ ok: true, connectionString: "none" });
    }

    // Attempt to parse as URL and mask password. Fall back to returning cs if parsing fails.
    let masked = String(cs);
    try {
      const url = new URL(cs);
      // Build a masked representation: protocol//user:******@host/path?query
      const user = url.username || "";
      const host = url.host || "";
      const pathname = url.pathname || "";
      const search = url.search || "";
      masked = `${url.protocol}//${user ? user + ':' : ''}******${host ? '@' + host : ''}${pathname}${search}`;
    } catch (e) {
      // If URL parsing fails, keep original cs (safe fallback)
      masked = String(cs);
    }

    return NextResponse.json({ ok: true, connectionString: masked });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
