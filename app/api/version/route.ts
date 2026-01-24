import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    url: process.env.VERCEL_URL || null,
    node: process.version,
    hasDbUrl: Boolean(process.env.DATABASE_URL),
    dbHost: (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || "");
        return `${u.protocol}//${u.hostname}`;
      } catch { return null; }
    })(),
  });
}