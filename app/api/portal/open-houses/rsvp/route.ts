import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;
  return NextResponse.json({ items: [], total: 0 });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;
  return NextResponse.json({ ok: true, message: "Stub — not yet implemented" });
}

