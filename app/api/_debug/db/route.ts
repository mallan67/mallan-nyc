import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // Try to read a holder connectionString (if lib/db.ts created one)
    // Fallback to pool.options.connectionString or process.env.DATABASE_URL
    // Mask password for safety
    // @ts-ignore
    const globalHolder = (global as any).__pgHolder;
    // @ts-ignore
    const poolConn = (pool as any)?.options?.connectionString;
    const cs = (globalHolder && globalHolder.connectionString) || poolConn || process.env.DATABASE_URL || "none";
    const masked = cs ? cs.replace(/(postgresql:\\/\\/[^:]+:)([^@]+)(@.*)/, '$1******$3') : "none";
    return NextResponse.json({ ok: true, connectionString: masked });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
