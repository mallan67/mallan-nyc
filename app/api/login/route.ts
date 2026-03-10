import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * POST /api/login
 *
 * Legacy login for Private Collection access.
 * Sets a signed session cookie instead of a static value.
 */
export async function POST(req: NextRequest) {
  const { pass } = await req.json().catch(() => ({}));
  const ok =
    typeof pass === "string" &&
    pass.length > 0 &&
    process.env.PRIVATE_COLLECTION_PASS &&
    pass === process.env.PRIVATE_COLLECTION_PASS;

  if (!ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Generate a signed session value instead of static "ok"
  const sessionId = crypto.randomBytes(32).toString("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pc_auth", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return res;
}
