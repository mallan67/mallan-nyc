import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/login
 *
 * Legacy login for Private Collection / admin access.
 * Sets pc_auth cookie with the validated password so middleware can verify.
 */
export async function POST(req: NextRequest) {
  const { pass } = await req.json().catch(() => ({}));
  const secret = process.env.PRIVATE_COLLECTION_PASS;
  const ok =
    typeof pass === "string" &&
    pass.length > 0 &&
    secret &&
    pass === secret;

  if (!ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Set cookie to the validated password — middleware compares against the same env var
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pc_auth", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return res;
}
